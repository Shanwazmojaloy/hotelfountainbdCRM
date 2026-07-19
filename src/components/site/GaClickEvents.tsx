"use client";

import { useEffect } from "react";
import { gaEvent } from "@/lib/ga";

// One capture-phase listener instead of onClick on every anchor — the tel:/wa.me
// links live in server components (Footer, Navbar, contact, FAQ, the modal's
// thank-you card) that must not become client components just for analytics.
export default function GaClickEvents() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.protocol === "tel:") gaEvent("phone_click", { link_url: a.href });
      else if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(a.hostname)) gaEvent("whatsapp_click", { link_url: a.href });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
