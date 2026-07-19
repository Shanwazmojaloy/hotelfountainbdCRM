"use client";

import { useEffect } from "react";

// Real-user Web Vitals ATTRIBUTION reporter for the public marketing pages.
//
// Why this exists: Vercel Speed Insights reports a poor mobile CLS (~0.6) but a
// fresh Lighthouse lab load measures CLS 0 and Google CrUX has no field data for
// the domain (low traffic). That means the shift only happens in some real
// sessions and neither lab nor CrUX can name the element. This reporter watches
// the browser's own layout-shift / event-timing entries in real sessions and
// beacons the WORST offenders (which DOM element shifted, which interaction was
// slow) to /api/vitals -> public.audit_logs (event_type='web_vital').
//
// Dependency-free (no web-vitals package) so it adds ~1KB and never grows the
// bundle we are trying to shrink. Best-effort: guarded, capped, never throws,
// never blocks. Renders nothing.

function cssPath(node: Node | null): string {
  try {
    if (!node || node.nodeType !== 1) return "(anonymous)";
    const el = node as Element;
    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 4) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) {
        seg += "#" + cur.id;
        parts.unshift(seg);
        break;
      }
      const cls =
        typeof cur.className === "string" && cur.className.trim()
          ? "." + cur.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
      seg += cls;
      parts.unshift(seg);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(" > ").slice(0, 300);
  } catch {
    return "(err)";
  }
}

export default function WebVitalsReporter() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;

    let cls = 0;
    let worstShiftValue = 0;
    let worstShiftEl = "";
    let worstShiftDelta = 0;
    let worstInp = 0;
    let worstInpTarget = "";
    let sent = false;

    const observers: PerformanceObserver[] = [];

    // ---- CLS attribution ----
    try {
      const clsPo = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<
          PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{ node?: Node | null; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }>;
          }
        >) {
          if (e.hadRecentInput) continue;
          cls += e.value;
          if (e.value > worstShiftValue) {
            worstShiftValue = e.value;
            const src = (e.sources || []).find((s) => s.node) || (e.sources || [])[0];
            if (src) {
              worstShiftEl = cssPath(src.node ?? null);
              if (src.previousRect && src.currentRect) {
                worstShiftDelta = Math.round(src.currentRect.y - src.previousRect.y);
              }
            }
          }
        }
      });
      clsPo.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
      observers.push(clsPo);
    } catch {
      /* layout-shift unsupported */
    }

    // ---- INP proxy: longest event-timing duration + its target ----
    try {
      const evPo = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<PerformanceEntry & { duration: number; target?: Node | null }>) {
          if (e.duration > worstInp) {
            worstInp = e.duration;
            worstInpTarget = cssPath(e.target ?? null);
          }
        }
      });
      // durationThreshold keeps this cheap: only report interactions >= 40ms
      evPo.observe({ type: "event", durationThreshold: 40, buffered: true } as PerformanceObserverInit);
      observers.push(evPo);
    } catch {
      /* event-timing unsupported */
    }

    function flush() {
      if (sent) return;
      // Only report sessions that actually had a measurable problem, so the
      // audit table is not flooded with clean loads.
      const clsBad = cls >= 0.1;
      const inpBad = worstInp >= 200;
      if (!clsBad && !inpBad) return;
      sent = true;

      try {
        const body = JSON.stringify({
          url: location.href.slice(0, 512),
          path: location.pathname.slice(0, 256),
          cls: +cls.toFixed(4),
          worstShift: { value: +worstShiftValue.toFixed(4), el: worstShiftEl, deltaY: worstShiftDelta },
          inp: Math.round(worstInp),
          inpTarget: worstInpTarget,
          viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
          ts_client: new Date().toISOString(),
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/vitals", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        /* telemetry must never break the page */
      }
    }

    // Flush when the page is backgrounded/unloaded (the moment CLS/INP finalize).
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      observers.forEach((o) => {
        try {
          o.disconnect();
        } catch {
          /* noop */
        }
      });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}
