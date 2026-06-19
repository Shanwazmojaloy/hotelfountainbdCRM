"use client";

import { motion } from "framer-motion";

/**
 * Global page-transition wrapper.
 * Next.js App Router re-mounts template.tsx on every navigation, so this
 * enter animation (fade + slide) fires on each route change, giving a seamless
 * fluid transition. Framer Motion automatically softens transforms under
 * prefers-reduced-motion; the gentle opacity fade is retained.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
