// ---------------------------------------------------------------------------
// CLOSE-DAY SNAPSHOT CHAIN (Vercel Workflow SDK)
//
// Fired by app/api/crm/close-day/route.ts AFTER execute_nightly_audit() has
// successfully persisted the night_audit_log row. The chain is strictly
// READ-ONLY on money tables (transactions / reservations / night_audit_log):
// the RPC remains the single writer, so re-closes and partial payments cannot
// be corrupted from here.
//
// Steps:
//   1. verifySnapshot     - re-read the persisted night_audit_log row (retries
//                           cover any read-after-write race).
//   2. shadowAudit        - integrity sweep of the closed fiscal day:
//                           orphan TXs (no reservation_id - the 13,600-Taka
//                           rule), ghost BCF rows on settled CHECKED_OUT
//                           rooms, and negative/overpaid dues. Findings are
//                           REPORTED, never auto-fixed.
//   3. sendCloseSummary   - owner email via Google Workspace SMTP (canonical
//                           transport, src/lib/mailer.ts - Brevo is dead).
//   4. sleep until 09:00 Asia/Dhaka next morning, then followupDues - email
//                           the outstanding-dues chase list if any remain.
//
// Re-close note: closing the same audit_date again starts a second chain run;
// that is intentional (the owner gets a corrected summary). The morning
// follow-up recomputes dues live, so duplicate runs cannot disagree.
// ---------------------------------------------------------------------------
import { sleep, FatalError } from "workflow";
import { createClient } from "@supabase/supabase-js";
import { sendMail, isMailConfigured } from "@/lib/mailer";

const TAKA = "৳"; // Bengali Taka sign - unicode escape keeps this file ASCII-safe (F:-mount multibyte rule)

type ChainInput = { auditDate: string; tenantId: string; closedBy: string };

type AuditRow = Record<string, unknown> & {
  audit_date?: string;
  closed_at?: string;
  closed_by?: string;
  total_checkins?: number;
  total_checkouts?: number;
  total_collections?: number;
  carried_over_dues?: number;
  opening_token?: number;
  payouts?: number;
};

type DueRow = { guest_name: string; room: string; due: number; status: string };

type ShadowFindings = {
  orphanCount: number;
  orphanTotal: number;
  ghostBcfCount: number;
  negativeDueCount: number;
  dues: DueRow[];
  duesTotal: number;
};

const bdt = (n: number) => TAKA + Math.round(n).toLocaleString("en-IN");

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new FatalError("Supabase service credentials missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

const OWNER_EMAIL = () =>
  process.env.OWNER_ALERT_EMAIL || process.env.CRM_FROM_EMAIL || "ahmedshanwaz5@gmail.com";

// -------------------------------------------------------------- the workflow
export async function closeDayChain(input: ChainInput) {
  "use workflow";

  const snapshot = await verifySnapshot(input);
  const findings = await shadowAudit(input);
  await sendCloseSummary(input, snapshot, findings);

  // Durable pause until 09:00 Asia/Dhaka the following morning. The resume
  // moment is computed inside a step (workflow bodies must stay deterministic).
  const resumeAtIso = await computeNextMorning();
  await sleep(new Date(resumeAtIso));

  await followupDues(input);
  return { auditDate: input.auditDate, status: "chain-complete" };
}

// ------------------------------------------------------------------- step 1
async function verifySnapshot(input: ChainInput): Promise<AuditRow> {
  "use step";
  const sb = serviceClient();
  const { data, error } = await sb
    .from("night_audit_log")
    .select("*")
    .eq("audit_date", input.auditDate)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  // Plain errors retry (covers read-after-write races); a missing row after
  // retries exhaust means the close never persisted - that IS the alert.
  if (error) throw new Error("night_audit_log read failed: " + error.message);
  if (!data) throw new Error("night_audit_log row not found for " + input.auditDate);
  return data as AuditRow;
}

// ------------------------------------------------------------------- step 2
async function shadowAudit(input: ChainInput): Promise<ShadowFindings> {
  "use step";
  const sb = serviceClient();

  // Day's transactions (bounded: one fiscal day, 24-room property).
  const { data: txs, error: txErr } = await sb
    .from("transactions")
    .select("reservation_id, type, amount, room_number")
    .eq("fiscal_day", input.auditDate)
    .eq("tenant_id", input.tenantId);
  if (txErr) throw new Error("transactions read failed: " + txErr.message);

  // Active-window reservations for due math + BCF cross-check.
  const { data: res, error: resErr } = await sb
    .from("reservations")
    .select("id, room_ids, status, total_amount, discount, paid_amount, guest_name")
    .neq("status", "CANCELLED")
    .lte("check_in", input.auditDate)
    .eq("tenant_id", input.tenantId);
  if (resErr) throw new Error("reservations read failed: " + resErr.message);

  // Canonical due rule: max(0, total_amount - discount - paid_amount).
  // paid_amount IS the source of truth (owner-confirmed 2026-06-02).
  const dueOf = (r: NonNullable<typeof res>[number]) =>
    (Number(r.total_amount) || 0) - (Number(r.discount) || 0) - (Number(r.paid_amount) || 0);

  const orphans = (txs || []).filter((t) => !t.reservation_id);
  const orphanTotal = orphans.reduce((a, t) => a + (Number(t.amount) || 0), 0);

  // Ghost-BCF: a Balance Carried Forward row whose room maps to a CHECKED_OUT
  // reservation with zero remaining due (the settled-and-closed double-count).
  const ghostBcf = (txs || []).filter((t) => {
    if (t.type !== "Balance Carried Forward") return false;
    const match = (res || []).find(
      (r) => Array.isArray(r.room_ids) && r.room_ids.some((id: unknown) => String(id) === String(t.room_number)),
    );
    return !!match && match.status === "CHECKED_OUT" && dueOf(match) <= 0;
  });

  const negatives = (res || []).filter((r) => dueOf(r) < 0);

  const dueRows: DueRow[] = (res || [])
    .filter((r) => dueOf(r) > 0)
    .map((r) => ({
      guest_name: r.guest_name || "(no name)",
      room: Array.isArray(r.room_ids) && r.room_ids.length ? r.room_ids.join("+") : "?",
      due: dueOf(r),
      status: r.status,
    }))
    .sort((a, b) => b.due - a.due);

  return {
    orphanCount: orphans.length,
    orphanTotal,
    ghostBcfCount: ghostBcf.length,
    negativeDueCount: negatives.length,
    dues: dueRows.slice(0, 30),
    duesTotal: dueRows.reduce((a, d) => a + d.due, 0),
  };
}

// ------------------------------------------------------------------- step 3
async function sendCloseSummary(input: ChainInput, snap: AuditRow, f: ShadowFindings) {
  "use step";
  if (!isMailConfigured()) throw new FatalError("SMTP not configured - summary email skipped");

  const flags: string[] = [];
  if (f.orphanCount > 0) flags.push(f.orphanCount + " ORPHAN transaction(s) totalling " + bdt(f.orphanTotal) + " (no reservation_id)");
  if (f.ghostBcfCount > 0) flags.push(f.ghostBcfCount + " ghost BCF row(s) on settled checked-out rooms");
  if (f.negativeDueCount > 0) flags.push(f.negativeDueCount + " reservation(s) with negative due (overpaid?)");

  const row = (label: string, val: string) =>
    '<tr><td style="padding:6px 12px;color:#7A7268;">' + label + '</td><td style="padding:6px 12px;text-align:right;font-family:monospace;color:#2D2A26;"><b>' + val + "</b></td></tr>";

  const html =
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#2D2A26;">' +
    '<h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">Night Audit Closed - ' + input.auditDate + "</h2>" +
    '<p style="color:#7A7268;">Closed by ' + (snap.closed_by || input.closedBy) + " at " + (snap.closed_at || "n/a") + "</p>" +
    '<table style="width:100%;border-collapse:collapse;background:#FCFBF8;border:1px solid #EAE6DD;border-radius:6px;">' +
    row("Total Collections", bdt(Number(snap.total_collections) || 0)) +
    row("Check-ins / Check-outs", (snap.total_checkins ?? "?") + " / " + (snap.total_checkouts ?? "?")) +
    row("Opening Token", bdt(Number(snap.opening_token) || 0)) +
    row("Payouts", bdt(Number(snap.payouts) || 0)) +
    row("Closing Balance", bdt((Number(snap.opening_token) || 0) + (Number(snap.total_collections) || 0) - (Number(snap.payouts) || 0))) +
    row("Outstanding Dues (live)", bdt(f.duesTotal) + " across " + f.dues.length + " reservation(s)") +
    "</table>" +
    (flags.length
      ? '<div style="margin-top:14px;padding:10px 14px;background:#FBF1DD;border:1px solid #D9A441;border-radius:6px;"><b>Integrity flags</b><ul>' +
        flags.map((x) => "<li>" + x + "</li>").join("") +
        "</ul><p>Review in the CRM - nothing was changed automatically.</p></div>"
      : '<p style="margin-top:14px;color:#2F7D5B;"><b>Shadow audit clean</b> - no orphans, no ghost BCF, no negative dues.</p>') +
    '<p style="margin-top:16px;font-size:12px;color:#7A7268;">Automated by the close-day workflow chain. A dues follow-up arrives at 9:00 AM if balances remain.</p>' +
    "</div>";

  await sendMail({
    to: OWNER_EMAIL(),
    subject: "Night Audit " + input.auditDate + " - " + bdt(Number(snap.total_collections) || 0) + " collected" + (flags.length ? " [" + flags.length + " FLAG(S)]" : ""),
    html,
  });
  return { sentTo: OWNER_EMAIL(), flagCount: flags.length };
}

// ---------------------------------------------------- step: resume moment
async function computeNextMorning(): Promise<string> {
  "use step";
  // Asia/Dhaka is UTC+6 (no DST): 09:00 Dhaka == 03:00 UTC.
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0));
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString();
}

// ------------------------------------------------------------------- step 4
async function followupDues(input: ChainInput) {
  "use step";
  // Recompute dues LIVE at send time - payments recorded overnight drop out.
  const f = await shadowAuditInline(input);
  if (f.dues.length === 0) return { sent: false, reason: "no outstanding dues" };
  if (!isMailConfigured()) throw new FatalError("SMTP not configured - dues follow-up skipped");

  const rows = f.dues
    .map(
      (d) =>
        '<tr><td style="padding:5px 10px;border-bottom:1px solid #EAE6DD;">' + d.guest_name +
        '</td><td style="padding:5px 10px;border-bottom:1px solid #EAE6DD;">' + d.room +
        '</td><td style="padding:5px 10px;border-bottom:1px solid #EAE6DD;">' + d.status +
        '</td><td style="padding:5px 10px;border-bottom:1px solid #EAE6DD;text-align:right;font-family:monospace;"><b>' + bdt(d.due) + "</b></td></tr>",
    )
    .join("");

  const html =
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#2D2A26;">' +
    '<h2 style="border-bottom:2px solid #D9A441;padding-bottom:8px;">Morning Dues Follow-up - after close of ' + input.auditDate + "</h2>" +
    "<p>" + f.dues.length + " reservation(s) still carry a balance, total <b>" + bdt(f.duesTotal) + "</b>:</p>" +
    '<table style="width:100%;border-collapse:collapse;background:#FCFBF8;border:1px solid #EAE6DD;">' +
    '<tr><th style="text-align:left;padding:5px 10px;">Guest</th><th style="text-align:left;padding:5px 10px;">Room</th><th style="text-align:left;padding:5px 10px;">Status</th><th style="text-align:right;padding:5px 10px;">Due</th></tr>' +
    rows +
    "</table></div>";

  await sendMail({
    to: OWNER_EMAIL(),
    subject: "Dues follow-up: " + bdt(f.duesTotal) + " outstanding (" + f.dues.length + " guests)",
    html,
  });
  return { sent: true, count: f.dues.length, total: f.duesTotal };
}

// Shared due computation for the morning step (plain helper, runs inside the
// followupDues step - NOT a separate workflow step).
async function shadowAuditInline(input: ChainInput): Promise<Pick<ShadowFindings, "dues" | "duesTotal">> {
  const sb = serviceClient();
  const { data: res, error } = await sb
    .from("reservations")
    .select("id, room_ids, status, total_amount, discount, paid_amount, guest_name")
    .neq("status", "CANCELLED")
    .lte("check_in", input.auditDate)
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error("reservations read failed: " + error.message);
  const dueOf = (r: NonNullable<typeof res>[number]) =>
    (Number(r.total_amount) || 0) - (Number(r.discount) || 0) - (Number(r.paid_amount) || 0);
  const dues: DueRow[] = (res || [])
    .filter((r) => dueOf(r) > 0)
    .map((r) => ({
      guest_name: r.guest_name || "(no name)",
      room: Array.isArray(r.room_ids) && r.room_ids.length ? r.room_ids.join("+") : "?",
      due: dueOf(r),
      status: r.status,
    }))
    .sort((a, b) => b.due - a.due)
    .slice(0, 30);
  return { dues, duesTotal: dues.reduce((a, d) => a + d.due, 0) };
}
