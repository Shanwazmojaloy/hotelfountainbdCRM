"use client";

import { m, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

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
 * Honors prefers-reduced-motion by rendering static content.
 */
export default function ScrollReveal({
  children,
  delay = 0,
  y = 28,
  className,
  stagger = false,
}: Props) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render static, visible content on the server and first client paint so SSR
  // markup matches hydration (no "style did not match" mismatch). Motion attaches
  // after mount — reveals still fire on scroll for below-the-fold sections.
  if (reduce || !mounted) return <div className={className}>{children}</div>;

  if (stagger) {
    const parent: Variants = {
      hidden: {},
      show: { transition: { staggerChildren: 0.1, delayChildren: delay } },
    };
    return (
      <m.div
        className={className}
        variants={parent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {children}
      </m.div>
    );
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1], delay }}
    >
      {children}
    </m.div>
  );
}

/** Child item for use inside a `stagger` ScrollReveal. */
export const revealItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
};
