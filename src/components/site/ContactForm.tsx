"use client";

import { useState } from "react";
import { waLink } from "@/lib/site";

/**
 * Get in Touch form. On submit it opens WhatsApp to the front office with the
 * message prefilled (no backend required) and shows a local confirmation.
 * Accessible: every field has a real <label> (visually hidden but read by AT).
 */
export default function ContactForm() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "");
    const subject = String(f.get("subject") || "");
    const message = String(f.get("message") || "");
    setSent(true);
    const msg =
      `Hello Hotel Fountain,\n` +
      (name ? `My name is ${name}.\n` : "") +
      (subject ? `Subject: ${subject}\n` : "") +
      message;
    window.open(waLink(msg), "_blank", "noopener,noreferrer");
  }

  const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/55";

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate={false}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-name" className={labelCls}>
            Your name
          </label>
          <input id="cf-name" name="name" required autoComplete="name" placeholder="Jane Doe" className="field" />
        </div>
        <div>
          <label htmlFor="cf-email" className={labelCls}>
            Email address
          </label>
          <input
            id="cf-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            className="field"
          />
        </div>
      </div>

      <div>
        <label htmlFor="cf-subject" className={labelCls}>
          Subject <span className="text-white/35">(optional)</span>
        </label>
        <input id="cf-subject" name="subject" placeholder="Group booking, special request…" className="field" />
      </div>

      <div>
        <label htmlFor="cf-message" className={labelCls}>
          Message
        </label>
        <textarea
          id="cf-message"
          name="message"
          required
          rows={5}
          placeholder="How can we help?"
          className="field resize-none"
        />
      </div>

      <div>
        <button type="submit" className="btn-neon w-full sm:w-auto">
          Send via WhatsApp →
        </button>
        {sent && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-neon-teal/25 bg-neon-teal/5 px-4 py-3 text-sm text-white/80"
          >
            Thanks — we&apos;ve opened WhatsApp so our front office can reply instantly. If it didn&apos;t
            open, message us at{" "}
            <a href={waLink("Hello Hotel Fountain, I have a question.")} target="_blank" rel="noopener noreferrer" className="text-neon-teal underline">
              wa.me
            </a>
            .
          </p>
        )}
      </div>
    </form>
  );
}
