/**
 * Global page-transition wrapper.
 *
 * PERF: This is intentionally NOT a framer-motion client component. Wrapping every
 * route in a JS-driven `opacity:0 + blur` reveal meant nothing painted until the
 * framer-motion bundle downloaded and hydrated — which pushed out FCP/LCP and forced
 * whole-page repaints (blur filter) on mobile, tanking the Real Experience Score.
 *
 * A pure-CSS enter animation (see `.page-enter` in globals.css) starts at first paint,
 * needs zero JavaScript, drops the expensive blur, and is fully disabled under
 * prefers-reduced-motion. Server-rendered, so it ships no client JS.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
