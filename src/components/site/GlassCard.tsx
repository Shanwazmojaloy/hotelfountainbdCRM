"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Adds the hover lift + border glow micro-interaction. */
  interactive?: boolean;
};

/**
 * Frosted glass surface with optional hover lift/glow.
 * The `.glass` + `.glass-sheen` classes carry the liquid look (see globals.css).
 */
export default function GlassCard({ children, className = "", interactive = false }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      whileHover={
        interactive && !reduce
          ? { y: -6, boxShadow: "0 0 0 1px rgba(200,169,110,0.45), 0 24px 60px -18px rgba(200,169,110,0.32)" }
          : undefined
      }
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={`glass glass-sheen ${className}`}
    >
      {children}
    </motion.div>
  );
}
