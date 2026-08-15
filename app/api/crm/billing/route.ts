// GET/POST /api/crm/billing — server-side billing, added 2026-08-15 (audit S-1).
//
// WHY THIS EXISTS
// The billing hooks used to talk to PostgREST straight from the browser with the
// publishable key. Tenant identity came from `x-tenant-host`, a header the caller
// sets, and the tenant_isolation policies are `FOR ALL TO public` with no check
// that anyone is signed in. A live probe confirmed the consequence: the same key
// plus that header returned real `leads` and `guest_ledger` rows, and a DELETE on
// guest_ledger came back 204. Staff auth here is the custom staff/session_v/OTP
// scheme, not Supabase Auth, so `auth.uid()` is NULL and those hooks genuinely ran
// as `anon`.
//
// Same shape as /api/crm/referrals: signed session cookie + session_v re-check,
// then service-role queries through tenantScoped so every statement carries the
// tenant filter structurally.
//
// Three things the browser no longer gets to decide:
//   - tenant_id       — taken from the session, never from the payload
//   - posted_by /
//     processed_by /
//     voided_by       — taken from the session, never from the payload
//   - which reservation — every action asserts the reservation is in this tenant
//     before any RPC runs, because the RPCs take bare ids and do not check.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 20;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// Anyone who works the folio. Housekeeping and restaurant-only roles are not here.
const BILLING_ROLES = new Set([
  'owner', 'admin', 'manager', 'front_desk_supervisor', 'receptionist', 'front_office',
]);
// Voiding a posted charge rewrites the guest's balance. Supervisors and up only.
const VOID_ROLES = new Set(['owner', 'admin', 'manager', 'front_desk_supervisor']);

const TAXABLE_TYPES = new Set([
  'FOOD_BEVERAGE', 'MINIBAR', 'LAUNDRY', 'SPA', 'DAMAGE', 'TRANSPORT', 'MISCELLANEOUS',
]);

function isValidBdtAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function auth(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return { error: bad('Not authenticated', 401) };
  if (!SB_SERVICE_KEY) return { error: bad('Server configuration error', 500) };

  const role = String(sess.role || '').trim().toLowerCase();
  if (!BILLING_ROLES.has(role)) return { error: bad('Not permitted.', 403) };

  const TENANT = sess.tenant_id || ENV_TENANT;
  const raw = tenantClient(TENANT);
  const db = tenantScoped(raw, TENANT);

  // Honour Logout All Devices: the cookie's session_v must still match the DB.
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { error: bad('Session expired — sign in again.', 401) };
  }
  return { db, raw, sess, role, TENANT };
}

// The billing RPCs (post_extra_charge, void_ledger_entry, expand_nightly_charges)
// take bare ids and do no tenant check of their own. Gate them here.
async function assertReservation(db: ReturnType<typeof tenantScoped>, reservationId: unknown) {
  if (typeof reservationId !== 'string' || !reservationId.trim()) return 'reservation_id is required.';
  const { data } = await db.from('reservations').select('id').eq('id', reservationId).limit(1);
  if (!data || data.length === 0) return 'Reservation not found in this tenant.';
  return null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;
  const { db, raw } = a;

  const view = req.nextUrl.searchParams.get('view') || '';
  const reservationId = req.nextUrl.searchParams.get('reservation_id') || '';
  const invoiceId = req.nextUrl.searchParams.get('invoice_id') || '';

  try {
    if (view === 'ledger') {
      if (!reservationId) return bad('reservation_id is required.');
      const { data, error } = await db.from('guest_ledger')
        .select('*')
        .eq('reservation_id', reservationId)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: true })
        .order('posted_at', { ascending: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    if (view === 'invoice') {
      if (!reservationId) return bad('reservation_id is required.');
      const { data, error } = await db.from('billing_invoices')
        .select('*')
        .eq('reservation_id', reservationId)
        .in('status', ['DRAFT', 'ISSUED'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, row: (data && data[0]) || null });
    }

    if (view === 'invoice_detail') {
      if (!invoiceId) return bad('invoice_id is required.');
      // Scoped read first, so a foreign invoice_id resolves to nothing.
      const { data: inv, error: invErr } = await db.from('billing_invoices')
        .select('*').eq('id', invoiceId).limit(1);
      if (invErr) throw new Error(invErr.message);
      if (!inv || inv.length === 0) return bad('Invoice not found.', 404);
      // invoice_line_items has no tenant_id column; it inherits scope from the invoice.
      const { data: items, error: itemErr } = await raw.from('invoice_line_items')
        .select('*').eq('invoice_id', invoiceId).order('sort_order', { ascending: true });
      if (itemErr) throw new Error(itemErr.message);
      return NextResponse.json({ ok: true, row: { ...inv[0], line_items: items ?? [] } });
    }

    if (view === 'payments') {
      if (!reservationId) return bad('reservation_id is required.');
      const { data, error } = await db.from('payment_transactions')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('initiated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    return bad('Unknown view.');
  } catch (e) {
    console.error('[crm/billing] GET failed:', e instanceof Error ? e.message : e);
    return bad('Could not load billing data.', 500);
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;
  const { db, raw, sess, role } = a;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  // Identity is the session's, never the payload's.
  const actor = String(sess.id);

  try {
    // ─── ensure a DRAFT invoice exists ─────────────────────────────────────
    if (action === 'ensure_invoice') {
      const reservationId = body.reservation_id;
      const guard = await assertReservation(db, reservationId);
      if (guard) return bad(guard);

      const { data: existing } = await db.from('billing_invoices')
        .select('*').eq('reservation_id', reservationId)
        .in('status', ['DRAFT', 'ISSUED'])
        .order('created_at', { ascending: false }).limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({ ok: true, row: existing[0], created: false });
      }

      const { data: num } = await raw.rpc('generate_invoice_number');
      const { data: created, error } = await db.from('billing_invoices')
        .insert({
          invoice_number: num,
          reservation_id: reservationId,
          guest_id:       body.guest_id ?? null,
          invoice_type:   'FOLIO',
          invoice_date:   today(),
          billing_name:   body.billing_name ?? null,
        })
        .select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, row: created, created: true });
    }

    // ─── post a charge ─────────────────────────────────────────────────────
    if (action === 'charge') {
      const guard = await assertReservation(db, body.reservation_id);
      if (guard) return bad(guard);
      const amount = body.amount_bdt;
      if (!isValidBdtAmount(amount)) return bad('amount_bdt must be a positive integer.');
      const entryType = String(body.entry_type || '');
      if (!entryType) return bad('entry_type is required.');

      if (TAXABLE_TYPES.has(entryType)) {
        // post_extra_charge splits net / SC / VAT and inserts three rows atomically.
        const { data, error } = await raw.rpc('post_extra_charge', {
          p_reservation_id: body.reservation_id,
          p_guest_id:       body.guest_id,
          p_entry_type:     entryType,
          p_description:    body.description,
          p_amount_bdt:     amount,
          p_date:           body.transaction_date ?? today(),
          p_posted_by:      actor,
          p_metadata:       body.metadata ?? {},
        });
        if (error) throw new Error(error.message);
        const { data: row, error: fetchErr } = await db.from('guest_ledger')
          .select('*').eq('id', data as string).limit(1);
        if (fetchErr) throw new Error(fetchErr.message);
        return NextResponse.json({ ok: true, row: (row && row[0]) || null });
      }

      const { data, error } = await db.from('guest_ledger')
        .insert({
          reservation_id:   body.reservation_id,
          guest_id:         body.guest_id,
          entry_type:       entryType,
          description:      body.description,
          transaction_date: body.transaction_date ?? today(),
          amount_bdt:       amount,
          is_tax_entry:     false,
          posted_by:        actor,
          department:       body.department ?? null,
          metadata:         body.metadata ?? {},
        })
        .select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, row: data });
    }

    // ─── record a payment ──────────────────────────────────────────────────
    if (action === 'payment') {
      const guard = await assertReservation(db, body.reservation_id);
      if (guard) return bad(guard);
      const amount = body.amount_bdt;
      if (!isValidBdtAmount(amount)) return bad('amount_bdt must be a positive integer.');

      const idemKey = typeof body.idempotency_key === 'string' && body.idempotency_key
        ? body.idempotency_key : crypto.randomUUID();

      const { data: payment, error: payErr } = await db.from('payment_transactions')
        .insert({
          reservation_id:         body.reservation_id,
          guest_id:               body.guest_id,
          payment_method:         body.payment_method,
          payment_method_details: body.metadata ?? {},
          amount_bdt:             amount,
          status:                 'COMPLETED',
          completed_at:           new Date().toISOString(),
          is_advance_payment:     body.is_advance_payment ?? false,
          invoice_id:             body.invoice_id ?? null,
          payment_reference:      body.payment_reference ?? null,
          processed_by:           actor,
          notes:                  body.notes ?? null,
          idempotency_key:        idemKey,
        })
        .select().single();

      if (payErr) {
        // 23505 on uq_payment_tx_idempotency: this exact payment already landed
        // (double-submit / retry). Return the existing row — do NOT post a second
        // ledger credit. That double-count is the ghost bleed.
        if ((payErr as { code?: string }).code === '23505') {
          const { data: existing } = await db.from('payment_transactions')
            .select('*').eq('idempotency_key', idemKey).eq('status', 'COMPLETED').limit(1);
          if (existing && existing[0]) {
            return NextResponse.json({ ok: true, row: existing[0], deduplicated: true });
          }
        }
        throw new Error(`payment insert: ${payErr.message}`);
      }

      const entryType = body.is_advance_payment ? 'ADVANCE_PAYMENT' : 'PAYMENT';
      const { error: ledgerErr } = await db.from('guest_ledger')
        .insert({
          reservation_id:         body.reservation_id,
          guest_id:               body.guest_id,
          entry_type:             entryType,
          description:            `Payment — ${String(body.payment_method ?? '')}`,
          transaction_date:       today(),
          amount_bdt:             -Math.abs(amount),   // always negative
          is_tax_entry:           false,
          payment_transaction_id: payment.id,
          posted_by:              actor,
          metadata: {
            payment_id:        payment.id,
            payment_method:    body.payment_method,
            payment_reference: body.payment_reference ?? null,
          },
        });

      if (ledgerErr) {
        await db.from('payment_transactions').update({ status: 'CANCELLED' }).eq('id', payment.id);
        throw new Error(`ledger insert failed (payment cancelled): ${ledgerErr.message}`);
      }
      return NextResponse.json({ ok: true, row: payment });
    }

    // ─── void a ledger entry ───────────────────────────────────────────────
    if (action === 'void') {
      if (!VOID_ROLES.has(role)) return bad('Not permitted to void entries.', 403);
      const guard = await assertReservation(db, body.reservation_id);
      if (guard) return bad(guard);
      const reason = String(body.void_reason ?? '').trim();
      if (!reason) return bad('void_reason is required.');

      // The entry must belong to a reservation in this tenant.
      const { data: entry } = await db.from('guest_ledger')
        .select('id').eq('id', body.ledger_entry_id).eq('reservation_id', body.reservation_id).limit(1);
      if (!entry || entry.length === 0) return bad('Ledger entry not found.', 404);

      const { data, error } = await raw.rpc('void_ledger_entry', {
        p_entry_id:  body.ledger_entry_id,
        p_reason:    reason,
        p_voided_by: actor,
      });
      if (error) throw new Error(error.message);
      const count = Number(data ?? 0);
      if (count === 0) return bad('Entry was not found or is already voided.', 409);
      return NextResponse.json({ ok: true, voided: count });
    }

    // ─── expand nightly room charges ───────────────────────────────────────
    if (action === 'expand') {
      const guard = await assertReservation(db, body.reservation_id);
      if (guard) return bad(guard);
      const { data, error } = await raw.rpc('expand_nightly_charges', {
        p_reservation_id: body.reservation_id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, inserted: Number(data ?? 0) });
    }

    // ─── full checkout ─────────────────────────────────────────────────────
    // Replaces the browser's direct call to the process-checkout edge function,
    // which could never succeed: it authenticates with supabase.auth.getUser(),
    // and nothing in this app ever creates a Supabase Auth session (staff sign in
    // through the custom staff/session_v/OTP scheme). See D-16.
    //
    // process_checkout() does the whole thing in one transaction — locks the
    // reservation, raises the invoice, posts room/SC/VAT charges, issues the
    // invoice, sets status = 'CHECKED_OUT' and frees the rooms.
    //
    // NOTE: app/api/crm/check/route.ts still flips status directly, and that path
    // is deliberately left in place for now. The two cannot both run on one
    // reservation — process_checkout raises unless the status is still CHECKED_IN.
    // That is why the 409 below spells the situation out rather than passing the
    // raw Postgres message through: on a desk where both buttons exist, hitting
    // the other one first is the most likely way this fails.
    if (action === 'checkout') {
      const guard = await assertReservation(db, body.reservation_id);
      if (guard) return bad(guard);

      const rpcParams: Record<string, unknown> = {
        p_reservation_id: body.reservation_id,
        // uuid DEFAULT NULL, used only for attribution (posted_by / voided_by /
        // issued_by). staff.id is an integer and staff has no uuid column, so this
        // stays null until someone decides the attribution is worth a column.
        p_checked_out_by: null,
      };
      if (typeof body.actual_checkout === 'string' && body.actual_checkout) {
        rpcParams.p_actual_checkout = body.actual_checkout;
      }

      const { data: result, error } = await raw.rpc('process_checkout', rpcParams);
      if (error) {
        const m = error.message ?? '';
        if (m.includes('not found')) return bad('Reservation not found.', 404);
        if (m.includes('must be CHECKED_IN')) {
          return NextResponse.json({
            error: 'This reservation is not checked in, so it cannot be checked out here. If it already shows as checked out, it was closed by the older checkout button, which does not raise an invoice.',
            detail: m,
          }, { status: 409 });
        }
        throw new Error(m);
      }
      return NextResponse.json({ ok: true, summary: result });
    }
    // ─── snapshot the ledger and issue the invoice ─────────────────────────
    if (action === 'issue_invoice') {
      const invoiceId = body.invoice_id;
      if (typeof invoiceId !== 'string' || !invoiceId) return bad('invoice_id is required.');

      const { data: invRows } = await db.from('billing_invoices')
        .select('id,reservation_id').eq('id', invoiceId).limit(1);
      if (!invRows || invRows.length === 0) return bad('Invoice not found.', 404);
      const invoice = invRows[0] as { id: string; reservation_id: string };

      const { data: ledger, error: ledgerErr } = await db.from('guest_ledger')
        .select('*')
        .eq('reservation_id', invoice.reservation_id)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: true })
        .order('posted_at', { ascending: true });
      if (ledgerErr) throw new Error(`ledger fetch: ${ledgerErr.message}`);

      type LedgerRow = {
        id: string; description: string; entry_type: string; transaction_date: string;
        amount_bdt: number; is_tax_entry: boolean; parent_ledger_id: string | null;
      };
      const rows = (ledger ?? []) as LedgerRow[];
      const parents = rows.filter(e => !e.is_tax_entry);
      const childMap = new Map<string, { sc: number; vat: number }>();
      rows.filter(e => e.is_tax_entry && e.parent_ledger_id).forEach(child => {
        const key = child.parent_ledger_id as string;
        const acc = childMap.get(key) ?? { sc: 0, vat: 0 };
        if (child.entry_type === 'SERVICE_CHARGE') acc.sc += child.amount_bdt;
        if (child.entry_type === 'TAX') acc.vat += child.amount_bdt;
        childMap.set(key, acc);
      });

      const lineItems = parents.map((entry, idx) => {
        const tax = childMap.get(entry.id) ?? { sc: 0, vat: 0 };
        return {
          invoice_id:       invoiceId,
          ledger_entry_id:  entry.id,
          description:      entry.description,
          entry_type:       entry.entry_type,
          transaction_date: entry.transaction_date,
          quantity:         1,
          unit_amount_bdt:  entry.amount_bdt,
          total_amount_bdt: entry.amount_bdt,
          sc_amount_bdt:    tax.sc,
          vat_amount_bdt:   tax.vat,
          sort_order:       idx,
        };
      });

      if (lineItems.length > 0) {
        // No tenant_id on this table; invoice_id already resolved inside the tenant.
        const { error: itemErr } = await raw.from('invoice_line_items').insert(lineItems);
        if (itemErr) throw new Error(`line items: ${itemErr.message}`);
      }

      const { data: updated, error: updErr } = await db.from('billing_invoices')
        .update({ status: 'ISSUED', issued_by: actor, issued_at: new Date().toISOString() })
        .eq('id', invoiceId).select().single();
      if (updErr) throw new Error(`status update: ${updErr.message}`);
      return NextResponse.json({ ok: true, row: updated });
    }

    return bad('Unknown action.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[crm/billing] ${action} failed:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
