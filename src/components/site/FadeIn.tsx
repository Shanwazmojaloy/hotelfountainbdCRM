"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

// Understated luxury ease-out (matches --ease-regent in globals.css).
const REGENT_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const OFFSET: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 32 },
  down: { y: -32 },
  left: { x: 32 },
  right: { x: -32 },
  none: {},
};

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds before the reveal starts. */
  delay?: number;
  /** Reveal duration in seconds. */
  duration?: number;
  /** Slide direction the element travels in from. */
  direction?: Direction;
  /** Trigger on scroll-into-view (default) or immediately on mount. */
  whileInView?: boolean;
  /** Only reveal once (scroll mode). */
  once?: boolean;
};

/**
 * Reusable directional reveal with the Regent luxury ease.
 *
 * Complements ScrollReveal (which is up-only + supports child staggering):
 * use FadeIn when you need a single element to enter from any direction, or to
 * animate immediately on mount (whileInView={false}) — e.g. hero elements.
 * Honors prefers-reduced-motion by rendering static content.
 */
export default function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.8,
  direction = "up",
  whileInView = true,
  once = true,
}: Props) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  const initial = { opacity: 0, ...OFFSET[direction] };
  const shown = { opacity: 1, x: 0, y: 0 };
  const transition = { duration, ease: REGENT_EASE, delay };

  if (whileInView) {
    return (
      <motion.div
        className={className}
        initial={initial}
        whileInView={shown}
        viewport={{ once, amount: 0.2 }}
        transition={transition}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div className={className} initial={initial} animate={shown} transition={transition}>
      {children}
    </motion.div>
  );
}
