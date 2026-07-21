// /api/crm/restaurant — Restaurant / POS service-role route (Phase 2).
// Session-gated + tenant-scoped, mirrors /api/crm/folio and /api/crm/payment.
//
// Money is ALWAYS computed server-side from the line items (never trust client totals).
// Charge-to-Room posts ONE folios row (category 'Restaurant') and recalcs the reservation's
// canonical total, so the F&B bill lands on the guest's master folio; walk-in/dine-in stay
// in restaurant_orders (independent F&B revenue). Discounts + voids are supervisor-gated.
//
// Requires the db/08_restaurant_pos.sql migration to be applied.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { isOwnerAdmin, can, canAccess } from '@/lib/permissions';
import { recalcResTotalServer } from '@/lib/recalcResTotal.server';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';
import { openBusinessDay, dhakaToday } from '@/lib/businessDay';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const clampPct = (n: unknown) => Math.min(100, Math.max(0, Number(n) || 0));
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

type Sess = { id: number; role: string; session_v: number; tenant_id?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auth(req: NextRequest): Promise<{ sess: Sess; db: any; supabase: any; tenant: string } | null> {
  const sess = requireSession(req) as Sess | null;
  if (!sess) return null;
  const TENANT = sess.tenant_id || ENV_TENANT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = tenantClient(TENANT);
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) return null;
  return { sess, db, supabase, tenant: TENANT };
}

// ─── GET: menu + today's orders ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const ctx = await auth(req);
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canAccess(ctx.sess.role, '/crm/restaurant')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const resource = new URL(req.url).searchParams.get('resource') || 'menu';
  try {
    if (resource === 'menu') {
      const { data, error } = await ctx.db.from('restaurant_menu_items')
        .select('*').order('category', { ascending: true }).order('sort_order', { ascending: true }).order('name', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ rows: data || [] });
    }
    if (resource === 'orders') {
      // open business day (mirrors transactions) unless an explicit ?day= is passed
      const url = new URL(req.url);
      let day = url.searchParams.get('day') || '';
      if (!day) {
        const { data: closes } = await ctx.supabase.from('night_audit_log').select('audit_date, status');
        day = openBusinessDay(closes);
      }
      const { data: orders, error } = await ctx.db.from('restaurant_orders')
        .select('*').eq('fiscal_day', day).order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (orders || []).map((o: { id: string }) => o.id);
      let items: unknown[] = [];
      if (ids.length) {
        const { data: it } = await ctx.db.from('restaurant_order_items').select('*').in('order_id', ids);
        items = it || [];
      }
      return NextResponse.json({ rows: orders || [], items, day });
    }
    if (resource === 'res_orders') {
      // Open F&B tickets for a reservation — used by the checkout-lock warning.
      const rid = new URL(req.url).searchParams.get('reservation_id') || '';
      if (!rid) return NextResponse.json({ rows: [] });
      const { data, error } = await ctx.db.from('restaurant_orders')
        .select('id, order_no, order_type, room_number, table_no, status, payment_status, grand_total_bdt')
        .eq('reservation_id', rid).neq('payment_status', 'VOID');
      if (error) throw error;
      // "open" = kitchen ticket not yet CLOSED (food still in progress / tab not finalized)
      const openRows = (data || []).filter((o: { status?: string }) => o.status !== 'CLOSED');
      return NextResponse.json({ rows: openRows });
    }
    if (resource === 'register') {
      // current open shift + live expected cash (float + cash sales since it opened)
      const { data } = await ctx.db.from('restaurant_register_shifts').select('*').eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(1);
      const shift = data && data[0];
      let expectedCash: number | null = null;
      if (shift) {
        const { data: paid } = await ctx.db.from('restaurant_orders').select('grand_total_bdt').eq('payment_method', 'Cash').neq('payment_status', 'VOID').gte('created_at', shift.opened_at);
        const cashSales = (paid || []).reduce((a: number, o: { grand_total_bdt: number }) => a + (Number(o.grand_total_bdt) || 0), 0);
        expectedCash = round2((Number(shift.opening_float_bdt) || 0) + cashSales);
      }
      return NextResponse.json({ shift: shift || null, expectedCash });
    }
    if (resource === 'history') {
      const url = new URL(req.url);
      const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
      const status = url.searchParams.get('status'); const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      let qb = ctx.db.from('restaurant_orders').select('*').order('created_at', { ascending: false }).limit(300);
      if (from) qb = qb.gte('fiscal_day', from);
      if (to) qb = qb.lte('fiscal_day', to);
      if (status) qb = qb.eq('payment_status', status);
      const { data, error } = await qb;
      if (error) throw error;
      let rows = data || [];
      if (query) rows = rows.filter((o: Record<string, unknown>) => [o.order_no, o.room_number, o.table_no].some((v) => String(v || '').toLowerCase().includes(query)));
      const ids = rows.map((o: { id: string }) => o.id);
      let items: unknown[] = [];
      if (ids.length) { const { data: it } = await ctx.db.from('restaurant_order_items').select('*').in('order_id', ids); items = it || []; }
      return NextResponse.json({ rows, items });
    }
    return NextResponse.json({ error: 'Unknown resource.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/restaurant GET]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load restaurant data.' }, { status: 500 });
  }
}

// ─── POST: menu CRUD, order create, KOT status, void ─────────────────────────
export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const ctx = await auth(req);
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { sess, db, supabase, tenant } = ctx;
  if (!canAccess(sess.role, '/crm/restaurant')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  // menu management = restaurant supervisor + owner/admin (proxy: posRegister capability)
  const canManageMenu = isOwnerAdmin(sess.role) || can(sess.role, 'posRegister');

  try {
    // ---- menu create / update ----
    if (action === 'menu_save') {
      if (!canManageMenu) return NextResponse.json({ error: 'Only a supervisor can edit the menu.' }, { status: 403 });
      const name = s(body.name); const category = s(body.category);
      if (!name || !category) return NextResponse.json({ error: 'Name and category are required.' }, { status: 400 });
      const row = {
        name, category,
        price_bdt: round2(body.price_bdt as number), vat_rate: clampPct(body.vat_rate),
        is_available: body.is_available !== false, sort_order: Number(body.sort_order) || 0,
      };
      if (body.id) {
        const { error } = await db.from('restaurant_menu_items').update(row).eq('id', body.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('restaurant_menu_items').insert(row);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    // ---- menu delete ----
    if (action === 'menu_delete') {
      if (!canManageMenu) return NextResponse.json({ error: 'Only a supervisor can edit the menu.' }, { status: 403 });
      if (!body.id) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });
      const { error } = await db.from('restaurant_menu_items').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- create an order (Charge to Room / Dine-in / Walk-in) ----
    if (action === 'order_create') {
      const orderType = String(body.order_type || '').toUpperCase();
      if (!['ROOM', 'DINE_IN', 'WALK_IN'].includes(orderType)) {
        return NextResponse.json({ error: 'Invalid order type.' }, { status: 400 });
      }
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return NextResponse.json({ error: 'Add at least one item.' }, { status: 400 });

      // Server-authoritative line math — client totals are ignored.
      const lines = rawItems.map((it: Record<string, unknown>) => {
        const qty = Math.max(0, Number(it.qty) || 0);
        const unit = round2(it.unit_price_bdt as number);
        return {
          menu_item_id: s(it.menu_item_id), name: s(it.name) || 'Item',
          qty, unit_price_bdt: unit, vat_rate: clampPct(it.vat_rate),
          line_total_bdt: round2(unit * qty), notes: s(it.notes),
        };
      }).filter((l: { qty: number }) => l.qty > 0);
      if (!lines.length) return NextResponse.json({ error: 'Add at least one item.' }, { status: 400 });

      const subtotal = round2(lines.reduce((a: number, l: { line_total_bdt: number }) => a + l.line_total_bdt, 0));
      const vatPct = clampPct(body.vat_pct);
      const svcPct = clampPct(body.service_pct);
      let discount = round2(body.discount_bdt as number);
      if (discount > 0 && !can(sess.role, 'posDiscount')) {
        return NextResponse.json({ error: 'Only a supervisor can apply discounts.' }, { status: 403 });
      }
      const vat = round2(subtotal * vatPct / 100);
      const service = round2(subtotal * svcPct / 100);
      discount = Math.min(discount, round2(subtotal + vat + service)); // never negative total
      const grand = round2(subtotal + vat + service - discount);

      // Charge-to-Room requires an in-house reservation + the postFbToRoom capability.
      const resId = orderType === 'ROOM' ? s(body.reservation_id) : null;
      if (orderType === 'ROOM') {
        if (!resId) return NextResponse.json({ error: 'Select an in-house room/guest to charge.' }, { status: 400 });
        if (!can(sess.role, 'postFbToRoom')) return NextResponse.json({ error: 'You cannot post charges to a room.' }, { status: 403 });
      }
      const paymentMethod = orderType === 'ROOM' ? 'Room' : s(body.payment_method);
      if (orderType !== 'ROOM' && !paymentMethod) {
        return NextResponse.json({ error: 'Select a payment method.' }, { status: 400 });
      }

      // fiscal day = open business day
      const { data: closes } = await supabase.from('night_audit_log').select('audit_date, status');
      const fiscalDay = openBusinessDay(closes) || dhakaToday();

      const { data: who } = await db.from('staff').select('name').eq('id', sess.id).limit(1);
      const createdByName = (who && who[0] && who[0].name) || null;

      // ATOMIC: header + line items + (for ROOM) the folios charge line commit as one unit
      // via the fn_pos_create_order RPC — no partial-write orphans. Totals are already
      // server-computed above; the RPC only guarantees atomicity.
      const payload = {
        tenant_id: tenant,
        order_type: orderType, reservation_id: resId, room_number: s(body.room_number),
        guest_id: s(body.guest_id), table_no: s(body.table_no),
        subtotal_bdt: subtotal, vat_bdt: vat, service_charge_bdt: service,
        discount_bdt: discount, grand_total_bdt: grand,
        payment_status: orderType === 'ROOM' ? 'POSTED_TO_ROOM' : 'PAID',
        payment_method: paymentMethod, fiscal_day: fiscalDay, status: 'OPEN',
        created_by_id: sess.id, created_by_name: createdByName,
        idempotency_key: s(body.idempotency_key), items: lines,
      };
      const { data: rpcRes, error: rErr } = await supabase.rpc('fn_pos_create_order', { p: payload });
      if (rErr) {
        // idempotency replay — return the existing order instead of erroring
        if (String((rErr as { code?: string }).code) === '23505') {
          const { data: dup } = await db.from('restaurant_orders').select('id, order_no, grand_total_bdt').eq('idempotency_key', s(body.idempotency_key)).limit(1);
          if (dup && dup[0]) return NextResponse.json({ ok: true, order: dup[0], duplicate: true });
        }
        throw rErr;
      }
      // Re-sync the reservation's canonical total AFTER the atomic ROOM charge landed.
      if (orderType === 'ROOM' && resId) await recalcResTotalServer(supabase, resId);
      return NextResponse.json({ ok: true, order: rpcRes });
    }

    // ---- KOT / kitchen status update ----
    if (action === 'order_status') {
      const status = String(body.status || '').toUpperCase();
      if (!['OPEN', 'FIRED', 'READY', 'SERVED', 'CLOSED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
      }
      if (!body.id) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });
      const { error } = await db.from('restaurant_orders').update({ status }).eq('id', body.id).neq('payment_status', 'VOID');
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- void an order (supervisor/owner) — reverses a room charge if posted ----
    if (action === 'order_void') {
      if (!can(sess.role, 'posDiscount')) return NextResponse.json({ error: 'Only a supervisor can void an order.' }, { status: 403 });
      if (!body.id) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });
      const { data: rows } = await db.from('restaurant_orders').select('id, folio_id, reservation_id, payment_status').eq('id', body.id).limit(1);
      const ord = rows && rows[0];
      if (!ord) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      if (ord.payment_status === 'VOID') return NextResponse.json({ ok: true, already: true });
      // reverse the room-charge folio line first, then recalc the reservation total
      if (ord.folio_id) {
        await db.from('folios').delete().eq('id', ord.folio_id);
        if (ord.reservation_id) await recalcResTotalServer(supabase, ord.reservation_id);
      }
      const { error } = await db.from('restaurant_orders')
        .update({ payment_status: 'VOID', status: 'VOID', folio_id: null, voided_by_id: sess.id, voided_reason: s(body.reason) })
        .eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- open the register (posRegister) ----
    if (action === 'register_open') {
      if (!can(sess.role, 'posRegister')) return NextResponse.json({ error: 'Only a supervisor can open the register.' }, { status: 403 });
      const { data: openS } = await db.from('restaurant_register_shifts').select('id').eq('status', 'OPEN').limit(1);
      if (openS && openS[0]) return NextResponse.json({ error: 'A register is already open.' }, { status: 400 });
      const { data: closes } = await supabase.from('night_audit_log').select('audit_date, status');
      const fiscalDay = openBusinessDay(closes) || dhakaToday();
      const { data: who } = await db.from('staff').select('name').eq('id', sess.id).limit(1);
      const name = (who && who[0] && who[0].name) || null;
      const { data: ins, error } = await db.from('restaurant_register_shifts')
        .insert({ opening_float_bdt: round2(body.opening_float_bdt), opened_by_id: sess.id, opened_by_name: name, fiscal_day: fiscalDay, status: 'OPEN' })
        .select('*').limit(1);
      if (error) {
        if (String((error as { code?: string }).code) === '23505') return NextResponse.json({ error: 'A register is already open.' }, { status: 400 });
        throw error;
      }
      return NextResponse.json({ ok: true, shift: ins && ins[0] });
    }

    // ---- close the register (posRegister) — reconcile cash ----
    if (action === 'register_close') {
      if (!can(sess.role, 'posRegister')) return NextResponse.json({ error: 'Only a supervisor can close the register.' }, { status: 403 });
      const { data: openS } = await db.from('restaurant_register_shifts').select('*').eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(1);
      const shift = openS && openS[0];
      if (!shift) return NextResponse.json({ error: 'No open register to close.' }, { status: 400 });
      const { data: paid } = await db.from('restaurant_orders').select('grand_total_bdt').eq('payment_method', 'Cash').neq('payment_status', 'VOID').gte('created_at', shift.opened_at);
      const cashSales = (paid || []).reduce((a: number, o: { grand_total_bdt: number }) => a + (Number(o.grand_total_bdt) || 0), 0);
      const expected = round2((Number(shift.opening_float_bdt) || 0) + cashSales);
      const counted = round2(body.counted_cash_bdt);
      const { data: who } = await db.from('staff').select('name').eq('id', sess.id).limit(1);
      const name = (who && who[0] && who[0].name) || null;
      const { data: upd, error } = await db.from('restaurant_register_shifts')
        .update({ status: 'CLOSED', expected_cash_bdt: expected, counted_cash_bdt: counted, variance_bdt: round2(counted - expected), closed_by_id: sess.id, closed_by_name: name, closed_at: new Date().toISOString(), notes: s(body.notes) })
        .eq('id', shift.id).select('*').limit(1);
      if (error) throw error;
      return NextResponse.json({ ok: true, shift: upd && upd[0], expected, cashSales });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/restaurant POST]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not complete the restaurant action.' }, { status: 500 });
  }
}
