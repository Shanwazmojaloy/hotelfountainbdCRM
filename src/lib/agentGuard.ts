// agentGuard.ts — Lumea audit-and-fix swarm safety layer
// Deploy target: src/lib/agentGuard.ts in the live repo (F:\Hotel Fountain\Hotel Fountain Web & CRM).
// Enforces the merge gate in code so it does not depend on an agent "remembering" it.
//
// Policy (locked 2026-06-12): P3 auto-merges after QA green; P1/P2 always HOLD for human approval.

export type Severity = "P1" | "P2" | "P3";
export type GateAction = "AUTO_MERGE" | "HOLD";

// Tables whose money columns make any write a P1 by definition.
const MONEY_TABLES = new Set([
  "transactions",
  "payment_transactions",
  "billing_invoices",
  "guest_ledger",
]);

// Operations that are never low-risk.
const HIGH_RISK_OPS = new Set(["MASS_UPDATE", "MASS_DELETE", "AUTH", "RLS_ALL"]);

export interface ProposedFix {
  reservationId: string | null;   // null === ORPHAN
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE" | "DDL" | "MASS_UPDATE" | "MASS_DELETE" | "AUTH" | "RLS_ALL";
  idempotencyKey?: string;        // required for any payment write
  touchesMoneyCol?: boolean;
  findingHash: string;            // dedup key for idempotent re-runs
  branchRef: string;              // MUST be a branch, never the live ref
}

export interface GuardResult {
  ok: boolean;
  severity: Severity;
  gate: GateAction;
  violations: string[];
}

const LIVE_REF = "mynwfkg"; // Bridge Booking prod — workers must NEVER target this directly.

/** Classify severity from the fix shape. Escalation wins; never downgrade. */
export function classify(fix: ProposedFix): Severity {
  if (HIGH_RISK_OPS.has(fix.op)) return "P1";
  if (fix.touchesMoneyCol || MONEY_TABLES.has(fix.table)) return "P1";
  if (fix.op === "DDL" || fix.op === "DELETE") return "P2"; // trigger/RLS rewrites, single deletes
  return "P3"; // orphan re-link, sheet re-sync, index add, cache refresh
}

/**
 * The ৳13,600 rule + branch rule + idempotency, all enforced before a fix is allowed near the gate.
 * Returns ok=false with violations if any invariant is broken — the CEO must reject the patch.
 */
export function guard(fix: ProposedFix): GuardResult {
  const violations: string[] = [];

  // 1. Branch-only. A worker that targets the live ref is a protocol violation.
  if (fix.branchRef === LIVE_REF || !fix.branchRef.startsWith("qa-")) {
    violations.push(`branch rule: writes must target a qa- branch, got "${fix.branchRef}"`);
  }

  // 2. Orphan isolation. Null reservation_id on a money/folio row is an ORPHAN — flag, never merge.
  if (fix.reservationId === null && (MONEY_TABLES.has(fix.table) || fix.touchesMoneyCol)) {
    violations.push(`orphan: ${fix.table} row has null reservation_id — flag, never merge`);
  }

  // 3. Idempotency. Any payment write must carry an idemKey (client UUID + DB partial-unique backstop).
  if (
    (fix.table === "transactions" || fix.table === "payment_transactions") &&
    (fix.op === "INSERT") &&
    !fix.idempotencyKey
  ) {
    violations.push(`idempotency: payment INSERT on ${fix.table} missing idempotencyKey`);
  }

  const severity = classify(fix);
  const gate: GateAction = severity === "P3" ? "AUTO_MERGE" : "HOLD";

  return { ok: violations.length === 0, severity, gate, violations };
}

/**
 * Branch-level gate. A branch can auto-merge ONLY if every fix on it is P3 AND clean.
 * Mixed-severity branches escalate to HOLD (severity wins).
 */
export function branchGate(fixes: ProposedFix[], qaGreen: boolean): GuardResult {
  const results = fixes.map(guard);
  const violations = results.flatMap((r) => r.violations);
  const worst: Severity = results.some((r) => r.severity === "P1")
    ? "P1"
    : results.some((r) => r.severity === "P2")
    ? "P2"
    : "P3";

  // Auto-merge requires: all P3, no violations, AND QA green.
  const gate: GateAction =
    worst === "P3" && violations.length === 0 && qaGreen ? "AUTO_MERGE" : "HOLD";

  return { ok: violations.length === 0, severity: worst, gate, violations };
}

/** Canonical Balance Due. _total is ALREADY net of discount — never subtract discount twice. */
export function balanceDue(total: number, paid: number): number {
  return Math.max(0, total - paid);
}

/** BDT formatter — ৳ + grouped, for ledger/report alignment. */
export function bdt(amount: number): string {
  return `৳${new Intl.NumberFormat("en-BD").format(amount)}`;
}

/** Idempotent re-run guard: skip dispatch if this finding was already fixed for this reservation. */
export function alreadyFixed(
  auditLog: Array<{ reservationId: string | null; findingHash: string }>,
  fix: ProposedFix
): boolean {
  return auditLog.some(
    (e) => e.reservationId === fix.reservationId && e.findingHash === fix.findingHash
  );
}
