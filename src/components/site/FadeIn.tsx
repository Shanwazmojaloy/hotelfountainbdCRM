import type { CSSProperties, ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds before the reveal starts. */
  delay?: number;
  /** Reveal duration in seconds. */
  duration?: number;
  /** Slide direction the element travels in from. */
  direction?: Direction;
  /** Retained for API compatibility — the reveal is now an on-mount CSS animation. */
  whileInView?: boolean;
  /** Retained for API compatibility. */
  once?: boolean;
};

/**
 * Directional reveal with the Regent luxury ease — CSS-driven.
 *
 * The resting state is fully visible (opacity:1); the entrance is a pure CSS
 * animation (see `.site-root .fade-in` in globals.css) that runs on mount, so
 * content can NEVER get stuck hidden by stalled/late JS hydration — the failure
 * that left the previous framer-motion reveal invisible for non-reduced-motion
 * users. prefers-reduced-motion disables the animation (static visible content).
 *
 * `whileInView`/`once` are accepted for call-site compatibility but no longer
 * gate visibility; everything reveals on mount. Grid staggering still lives in
 * ScrollReveal.
 */
export default function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.8,
  direction = "up",
}: Props) {
  const style = {
    "--fade-delay": `${delay}s`,
    "--fade-dur": `${duration}s`,
  } as CSSProperties;

  return (
    <div className={["fade-in", className].filter(Boolean).join(" ")} data-dir={direction} style={style}>
      {children}
    </div>
  );
}
