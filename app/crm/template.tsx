'use client';

// template.tsx re-mounts on every /crm navigation (layout stays put). The .iv-fade class
// replays a short fade/slide-in each time, so page content arrives smoothly instead of
// snapping in. The shell (sidebar/header) never animates — only the swapped page body.
export default function CrmTemplate({ children }: { children: React.ReactNode }) {
  return <div className="iv-fade">{children}</div>;
}
