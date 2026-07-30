"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  /** Stagger direct children instead of animating as one block. */
  stagger?: boolean;
};

/**
 * Scroll-triggered fade-in-up. Fires once when ~20% in view.
 *
 * INP REFACTOR (2026-07-30): framer-free. The old version rendered an `m.div`
 * with whileInView per section — with 3-6 instances per page, each hydrated a
 * framer motion-value node during boot, feeding the tap-during-hydration INP
 * (field data: homepage taps 659ms avg / 3552ms max). Now: IntersectionObserver
 * + CSS transitions with the SAME timings (block: 0.7s cubic-bezier(.4,0,.2,1);
 * stagger children: 0.6s, 0.1s steps — matching the old revealItem variants).
 *
 * Fail-visible contract (same rationale as FadeIn.tsx): the resting DOM state
 * is fully visible; the effect ARMS the hide only on the client, right before
 * observing. If JS never runs (bot, stalled hydration, reduced-motion), content
 * simply shows. The transition property lives on the REVEALED state only, so
 * arming is an instant style jump (no fade-out flash), and the reveal animates.
 */
export default function ScrollReveal({
  children,
  delay = 0,
  y = 28,
  className,
  stagger = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    if (stagger) {
      // Per-child transition-delay indexes for the CSS stagger.
      Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty("--sr-i", String(i)));
    }
    el.classList.add("sr-armed"); // instant hide (no transition on this state)

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("sr-in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger]);

  const style = { "--sr-y": `${y}px`, "--sr-delay": `${delay}s` } as CSSProperties;

  return (
    <div
      ref={ref}
      className={["scroll-reveal", stagger ? "sr-stagger" : "", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
