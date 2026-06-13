/**
 * Per-navigation page-transition wrapper. Uses a pure CSS opacity fade (not a
 * JS/Framer animation) so a stalled animation frame can never leave the page
 * invisible. Opacity-only (no transform) keeps position:fixed children — the
 * nav and booking bar — anchored to the viewport.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="site-fade-in">{children}</div>;
}
