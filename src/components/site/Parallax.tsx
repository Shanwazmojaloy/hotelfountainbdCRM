"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type Props = {
  children: ReactNode;
  className?: string;
  distance?: number;
};

/**
 * Scroll-tied vertical parallax. Falls back to a static container under
 * prefers-reduced-motion. Use a slightly oversized child so drift never
 * exposes an edge.
 *
 * The tree is IDENTICAL on the server and the first client render (y locked
 * to 0); the scroll-tied motion value only attaches after mount. Branching
 * the structure on useReducedMotion() is a hydration mismatch — it's false
 * during SSR but real on the client's first render (React #418).
 */
export default function Parallax({ children, className, distance = 60 }: Props) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  // PERF: only run the scroll-linked motion value on desktop (lg+, pointer:fine).
  // On phones the drift is imperceptible but the per-scroll-frame transform update
  // is pure main-thread cost that hurts INP. Set post-mount → no hydration mismatch.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setMounted(true);
    setDesktop(window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const active = mounted && desktop && !reduce;

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y: active ? y : 0 }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}
