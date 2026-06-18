'use client';

// template.tsx re-mounts on every /crm navigation (layout stays put). Two cues per switch:
//  1. .iv-route-bar — a gold progress bar sweeps across the viewport top (NProgress-style).
//  2. .iv-fade — the page body slides up and settles in. Shell (sidebar/header) never animates.
// The bar lives OUTSIDE the animated div: .iv-fade animates transform, and position:fixed
// inside a transformed ancestor would anchor to the div instead of the viewport.
export default function CrmTemplate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="iv-route-bar" aria-hidden />
      <div className="iv-fade">{children}</div>
    </>
  );
}
