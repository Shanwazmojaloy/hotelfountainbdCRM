import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Adds the hover lift + border glow micro-interaction. */
  interactive?: boolean;
};

/**
 * Frosted glass surface with optional hover lift/glow.
 * The `.glass` + `.glass-sheen` classes carry the liquid look; `.glass-interactive`
 * carries the hover lift (see globals.css).
 *
 * PERF: server component — no framer-motion. The old `whileHover` motion.div forced
 * framer into the bundle of every page using a card (home, rooms, services, contact,
 * faq); the CSS `.glass-interactive` hover is identical and ships zero client JS.
 */
export default function GlassCard({ children, className = "", interactive = false }: Props) {
  return (
    <div className={`glass glass-sheen ${interactive ? "glass-interactive" : ""} ${className}`}>
      {children}
    </div>
  );
}
