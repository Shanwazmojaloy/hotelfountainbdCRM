"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "framer-motion";

/**
 * Thin gold progress bar pinned to the top of the viewport that fills as the
 * page scrolls. Honors prefers-reduced-motion (renders nothing).
 */
export default function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });

  if (reduce) return null;

  return <motion.div aria-hidden className="site-progress" style={{ scaleX }} />;
}
