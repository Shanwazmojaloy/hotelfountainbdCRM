"use client";

import { useEffect, useState } from "react";
import { motion, useScroll, useSpring, useReducedMotion } from "framer-motion";

/**
 * Thin gold progress bar pinned to the top of the viewport that fills as the
 * page scrolls. Honors prefers-reduced-motion (renders nothing).
 *
 * Renders null on the server AND the first client render so both trees match;
 * the bar mounts after hydration. Returning null based on useReducedMotion()
 * alone is a hydration mismatch — it's false during SSR but real on the
 * client's first render (React #418).
 */
export default function ScrollProgress() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });

  if (!mounted || reduce) return null;

  return <motion.div aria-hidden className="site-progress" style={{ scaleX }} />;
}
