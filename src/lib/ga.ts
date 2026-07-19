// GA4 event helper for the public site. window.gtag is defined by the inline
// bootstrap in app/(site)/layout.tsx; on surfaces without it (/crm etc.) this
// is a silent no-op, so callers never need to guard. Also respects Consent
// Mode automatically — gtag() queues/drops per the analytics_storage state
// set by the CookieHub banner, no extra handling needed here.
type GaParams = Record<string, string | number | undefined>;

export function gaEvent(name: string, params?: GaParams) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", name, params);
}
