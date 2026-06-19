"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type Props = {
  children: ReactNode;
  className?: string;
  /** Travel distance in px across the element's scroll pass (positive = drifts up). */
  distance?: number;
};

/**
 * Scroll-tied vertical parallax. Wraps any block (typically an Image) and drifts
 * it as it passes through the viewport. Falls back to a static container under
 * prefers-reduced-motion. Use a slightly oversized child (e.g. scale-110) so the
 * drift never exposes an edge.
 */
export default function Parallax({ children, className, distance = 60 }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}
