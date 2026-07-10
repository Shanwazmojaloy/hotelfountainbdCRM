"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

// PERF: LazyMotion + async feature loading. Site components render `m.*`
// elements (statically, zero animation runtime in the main bundle); the domMax
// feature chunk loads after hydration and animations attach then. `strict`
// throws in dev if a full `motion.*` component sneaks back into the site tree.
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
