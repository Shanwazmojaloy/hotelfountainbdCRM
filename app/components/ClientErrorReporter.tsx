"use client";

import { useEffect } from "react";

// Next.js-side twin of the inline reporter in public/crm.html. Captures uncaught
// errors and unhandled promise rejections on the marketing/landing/admin pages and
// posts them to /api/client-error -> public.audit_logs (event_type='client_error').
// Best-effort: deduped, capped, never throws, never blocks the page. Renders nothing.

export default function ClientErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>();
    let count = 0;
    const MAX = 12;

    function report(kind: string, message: unknown, source: string | null, stack: unknown) {
      try {
        if (count >= MAX) return;
        const msg = String(message ?? "").slice(0, 4000);
        const key = `${kind}|${msg}|${source ?? ""}`;
        if (sent.has(key)) return;
        sent.add(key);
        count++;

        const body = JSON.stringify({
          kind,
          message: msg,
          stack: stack ? String(stack).slice(0, 4000) : null,
          source: source ? String(source).slice(0, 512) : null,
          url: location.href,
          appVersion: null,
          ts_client: new Date().toISOString(),
        });

        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* telemetry must never break the app */
      }
    }

    const onError = (e: ErrorEvent) =>
      report(
        "error",
        e.message,
        e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null,
        e.error?.stack,
      );
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report("unhandledrejection", (r && r.message) || r, null, r && r.stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
