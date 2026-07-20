"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

// PERF: LazyMotion + async feature loading. Site components render `m.*`
// elements (statically, zero animation runtime in the main bundle); the domMax
// feature chunk loads after hydration and animations attach then. `strict`
// throws in dev if a full `motion.*` component sneaks back into the site tree.
//
// PERF (2026-07-21): the fetch+parse+exec of that chunk used to fire the instant
// LazyMotion mounted (i.e. immediately on hydration) -- on throttled mobile CPUs
// this landed squarely inside the LCP window and showed up as PSI "long main-thread
// tasks" / "reduce unused JavaScript" against the hero paint, even though the hero
// itself uses zero framer-motion (domMax is only needed for Navbar's `layoutId`
// active-pill -- see motion-features.ts). Deferring the *fetch* to requestIdleCallback
// (native 2s timeout guarantees it still fires) pushes that work out of the LCP
// window without changing WHAT loads -- domMax stays, layoutId keeps working, `m.*`
// elements just render inert a little longer before animations attach (imperceptible;
// same progressive-enhancement contract LazyMotion already gives every `m.*` node).
// Safari lacks requestIdleCallback -> setTimeout fallback (matches the 200ms-class
// idle delays already used elsewhere in this codebase, e.g. printConfirmation's
// image-settle buffer).
const loadFeatures = () =>
  new Promise<typeof import("./motion-features").default>((resolve) => {
    const start = () => import("./motion-features").then((mod) => resolve(mod.default));
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 2000 });
    } else {
      setTimeout(start, 200);
    }
  });

export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
