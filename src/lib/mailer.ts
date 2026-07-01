// ---------------------------------------------------------------------------
// Shared transactional mailer  -  Google Workspace SMTP (nodemailer)
//
// fountainbd.com runs on Google Workspace (MX = smtp.google.com), so all Lumea
// transactional email goes through Google's SMTP relay: reliable inbox delivery,
// SPF (_spf.google.com) already aligned, DKIM applied automatically by Workspace.
// This replaces the old Brevo HTTP path (a never-validated account that accepted
// sends with 200 but silently delivered nothing).
//
//   SMTP_USER : a REAL Workspace mailbox on fountainbd.com (the authenticating user)
//   SMTP_PASS : a Google App Password for that mailbox (needs 2-Step Verification)
//   SMTP_HOST : smtp.gmail.com (default)
//   SMTP_PORT : 465 (SSL, default) or 587 (STARTTLS)
//   CRM_FROM_EMAIL : default From. Must equal SMTP_USER unless it is a verified
//                    "send mail as" alias of SMTP_USER.
// ---------------------------------------------------------------------------
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const DEFAULT_FROM_EMAIL = process.env.CRM_FROM_EMAIL || SMTP_USER;
const DEFAULT_FROM_NAME = process.env.CRM_FROM_NAME || 'Hotel Fountain';

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('Email service not configured (missing SMTP_USER/SMTP_PASS)');
  }
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL); false => STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

/** True when SMTP credentials are present, so callers can fail soft/early. */
export function isMailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

export interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

/**
 * Send one transactional email via Google Workspace SMTP.
 * Resolves only after the SMTP server accepts the message (throws on rejection),
 * so a resolved promise means the mail was accepted for delivery.
 */
export async function sendMail(opts: MailOptions) {
  const fromEmail = opts.fromEmail || DEFAULT_FROM_EMAIL;
  const fromName = opts.fromName || DEFAULT_FROM_NAME;
  return getTransporter().sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
