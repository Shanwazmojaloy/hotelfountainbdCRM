"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  distance?: number;
};

/**
 * Scroll-tied vertical parallax — desktop-only (lg+, pointer:fine), static
 * everywhere else. Use a slightly oversized child so drift never exposes an edge.
 *
 * INP REFACTOR (2026-07-30): framer-free. The old version ran framer's
 * useScroll + useTransform on EVERY device — on phones the drift was disabled
 * (y locked to 0) but the hooks + m.div still hydrated during boot, feeding the
 * tap-during-hydration INP. Now: a rAF-throttled scroll listener that only even
 * attaches on desktop. The math mirrors the old mapping exactly — progress 0 at
 * "start end" (element top enters viewport bottom) → 1 at "end start", mapped
 * to translateY(+distance → −distance). Reduced motion: listener never attaches.
 * SSR/first paint renders the static tree (y=0) — same hydration contract.
 */
export default function Parallax({ children, className, distance = 60 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const tgt = inner.current;
    if (!el || !tgt) return;
    if (!window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let queued = false;
    const update = () => {
      queued = false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = vh + r.height;
      const p = total > 0 ? Math.min(1, Math.max(0, (vh - r.top) / total)) : 0;
      tgt.style.transform = `translateY(${distance - p * 2 * distance}px)`;
    };
    const onScroll = () => {
      if (!queued) {
        queued = true;
        raf = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [distance]);

  return (
    <div ref={ref} className={className}>
      <div ref={inner} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
