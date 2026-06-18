"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import type { ReactNode, MouseEvent } from "react";

type Props = {
  children: ReactNode;
  href: string;
  variant?: "neon" | "ghost";
  className?: string;
  external?: boolean;
};

/**
 * Magnetic CTA — cursor pulls the button within a small radius.
 * Falls back to a plain styled link under prefers-reduced-motion.
 */
export default function MagneticButton({
  children,
  href,
  variant = "neon",
  className = "",
  external = false,
}: Props) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18 });
  const sy = useSpring(y, { stiffness: 250, damping: 18 });

  const cls = `${variant === "neon" ? "btn-neon" : "btn-ghost"} ${className}`;

  function onMove(e: MouseEvent<HTMLAnchorElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.3);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  const inner = (
    <motion.span style={{ x: sx, y: sy }} className="inline-flex items-center gap-2">
      {children}
    </motion.span>
  );

  if (external) {
    return (
      <a href={href} onMouseMove={onMove} onMouseLeave={reset} className={cls} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} onMouseMove={onMove} onMouseLeave={reset} className={cls}>
      {inner}
    </Link>
  );
}
