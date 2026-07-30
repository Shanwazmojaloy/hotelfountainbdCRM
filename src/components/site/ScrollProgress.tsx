"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Thin gold progress bar pinned to the top of the viewport that fills as the
 * page scrolls.
 *
 * INP REFACTOR (2026-07-30): framer-free. The old version imported
 * `m` + useScroll + useSpring from framer-motion — eager core JS in the boot
 * bundle plus a per-scroll-frame spring on the main thread, for a 2px bar.
 * Field event-timing showed homepage taps during hydration at 659ms avg /
 * 3552ms max, so every boot-path framer import is being retired where the
 * visual is trivially reproducible. This version is a passive scroll listener
 * + rAF lerp (same smoothed feel as the old spring), and the rAF loop runs
 * ONLY while the bar is still catching up — idle cost is zero.
 *
 * Reduced motion: globals.css already hides .site-progress under
 * prefers-reduced-motion; the matchMedia guard here also skips the JS work.
 * Renders null on the server and first client paint (hydration match), same
 * contract as before.
 */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
  }, []);

  useEffect(() => {
    if (!on) return;
    const el = ref.current;
    if (!el) return;
    let target = 0;
    let cur = 0;
    let raf = 0;
    let idle = true;

    const tick = () => {
      cur += (target - cur) * 0.18; // spring-ish ease-out, matches the old useSpring feel
      if (Math.abs(target - cur) < 0.001) {
        cur = target;
        idle = true;
      }
      el.style.transform = `scaleX(${cur})`;
      if (!idle) raf = requestAnimationFrame(tick);
    };

    const measure = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (idle) {
        idle = false;
        raf = requestAnimationFrame(tick);
      }
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [on]);

  if (!on) return null;

  return <div ref={ref} aria-hidden className="site-progress" />;
}
