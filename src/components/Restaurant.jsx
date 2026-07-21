'use client';

// Restaurant / POS (Lumea) - Phase 2 (2026-07-21).
// POS terminal (menu + cart + order types), Kitchen/KOT queue, and F&B Revenue, in the CRM's
// dark + lime theme. Money is computed here for DISPLAY only; the server (/api/crm/restaurant)
// recomputes every total from the line items and is the sole authority. Charge-to-Room posts a
// folios line anchored to reservation_id (guest bill); walk-in/dine-in stay in the F&B ledger.
// Requires db/08_restaurant_pos.sql.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthGate';
import { isOwnerAdmin, can } from '@/lib/permissions';

const TK = '৳'; // Taka sign as an escape so the F: mount can't drop the byte.
const bdt = (n) => TK + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
const PAY_METHODS = ['Cash', 'Card', 'bKash', 'Nagad'];

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Request failed.');
  return j;
}

// Open a print window with the given <body> HTML + a scoped stylesheet, then print.
function printDoc(title, css, bodyHtml) {
  const w = window.open('', '_blank', 'width=560,height=760');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus();
  // Wait for images (e.g. the crest logo) to load before printing, with a hard cap.
  const fire = () => { try { w.print(); } catch { /* ignore */ } };
  const imgs = Array.from(w.document.images || []);
  if (imgs.length) {
    let left = imgs.length;
    const done = () => { if (--left <= 0) fire(); };
    imgs.forEach((im) => { if (im.complete) done(); else { im.onload = done; im.onerror = done; } });
    setTimeout(fire, 1500);
  } else {
    setTimeout(fire, 200);
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Thermal 80mm Kitchen Order Ticket.
function printKot(order, items) {
  const rows = (items || []).map((i) => `<tr><td class="q">${Number(i.qty)}x</td><td>${esc(i.name)}${i.notes ? `<div class="n">${esc(i.notes)}</div>` : ''}</td></tr>`).join('');
  const where = order.order_type === 'ROOM' ? `ROOM ${esc(order.room_number)}` : order.order_type === 'DINE_IN' ? `TABLE ${esc(order.table_no)}` : 'WALK-IN';
  const css = `@page{size:80mm auto;margin:3mm} *{font-family:'Courier New',monospace;color:#000} body{width:74mm} h1{font-size:15px;text-align:center;margin:0 0 2px} .sub{text-align:center;font-size:11px;margin-bottom:6px} .meta{font-size:11px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin-bottom:6px} table{width:100%;border-collapse:collapse} td{font-size:13px;padding:3px 0;vertical-align:top} .q{width:30px;font-weight:700} .n{font-size:10px;font-style:italic} .ft{text-align:center;font-size:10px;margin-top:8px;border-top:1px dashed #000;padding-top:4px}`;
  const body = `<h1>KITCHEN ORDER</h1><div class="sub">${esc(order.order_no)}</div><div class="meta"><strong>${where}</strong><br>${new Date(order.created_at || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</div><table>${rows || '<tr><td>(no items)</td></tr>'}</table><div class="ft">Hotel Fountain - Kitchen Copy</div>`;
  printDoc(`KOT ${order.order_no}`, css, body);
}

// Guest-facing 80mm itemized receipt (separate from the kitchen KOT).
function printReceipt(m) {
  const money = (v) => TK + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US');
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  const rows = (m.lines || []).map((l) => `<tr><td>${esc(l.name)}${l.comp ? ' <span class="c">(comp)</span>' : ''}</td><td class="q">${Number(l.qty)}</td><td class="r">${l.comp ? '0' : money(l.unit * l.qty).slice(1)}</td></tr>`).join('');
  const where = m.order_type === 'ROOM' ? `Room ${esc(m.room_number)}` : m.order_type === 'DINE_IN' ? `Table ${esc(m.table_no)}` : 'Walk-in';
  const ln = (l, v) => `<tr><td>${l}</td><td class="r">${money(v)}</td></tr>`;
  const css = `@page{size:80mm auto;margin:3mm}*{font-family:'Courier New',monospace;color:#000}body{width:74mm}.crest{display:block;margin:0 auto 3px;width:46px;height:46px;object-fit:contain}h1{font-size:15px;text-align:center;margin:0;letter-spacing:.04em}.sub{text-align:center;font-size:10px;margin:2px 0 6px}.meta{font-size:11px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin-bottom:4px}table{width:100%;border-collapse:collapse}td{font-size:12px;padding:2px 0;vertical-align:top}.q{width:26px;text-align:center}.r{text-align:right}.c{font-style:italic}.grand td{font-size:14px;font-weight:700;border-top:1px dashed #000;padding-top:4px}.ft{text-align:center;font-size:10px;margin-top:8px;border-top:1px dashed #000;padding-top:4px}`;
  const body = `<img class="crest" src="${origin}/logo-crest.png" alt="" /><h1>HOTEL FOUNTAIN</h1><div class="sub">Restaurant Receipt</div><div class="meta">${esc(m.order_no)} &middot; ${where}<br>${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</div><table>${rows}</table><table style="margin-top:6px">${ln('Subtotal', m.subtotal)}${m.vat ? ln('VAT', m.vat) : ''}${m.service ? ln('Service', m.service) : ''}${m.discount ? ln('Discount', -m.discount) : ''}<tr class="grand"><td>TOTAL</td><td class="r">${money(m.grand)}</td></tr></table><div class="sub" style="margin-top:6px">Paid: ${esc(m.method)}</div><div class="ft">Thank you! &middot; Hotel Fountain, Dhaka</div>`;
  printDoc(`Receipt ${m.order_no}`, css, body);
}

// Register close Z-report (cash reconciliation).
function printRegisterReport(sh) {
  const money = (v) => TK + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US');
  const row = (l, v) => `<tr><td>${l}</td><td class="r">${money(v)}</td></tr>`;
  const cashSales = (Number(sh.expected_cash_bdt) || 0) - (Number(sh.opening_float_bdt) || 0);
  const css = `@page{size:80mm auto;margin:3mm}*{font-family:'Courier New',monospace;color:#000}body{width:74mm}h1{font-size:15px;text-align:center;margin:0}.sub{text-align:center;font-size:10px;margin:2px 0 6px}.meta{font-size:10px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin-bottom:4px;line-height:1.5}table{width:100%;border-collapse:collapse}td{font-size:12px;padding:2px 0}.r{text-align:right}.grand td{font-size:13px;font-weight:700;border-top:1px dashed #000;padding-top:4px}.ft{text-align:center;font-size:10px;margin-top:8px;border-top:1px dashed #000;padding-top:4px}`;
  const body = `<h1>REGISTER Z-REPORT</h1><div class="sub">Hotel Fountain Restaurant</div><div class="meta">Business day ${esc(sh.fiscal_day || '')}<br>Opened: ${esc(sh.opened_by_name || '')} &middot; ${sh.opened_at ? new Date(sh.opened_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }) : ''}<br>Closed: ${esc(sh.closed_by_name || '')} &middot; ${sh.closed_at ? new Date(sh.closed_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }) : ''}</div><table>${row('Opening Float', sh.opening_float_bdt)}${row('Cash Sales', cashSales)}<tr class="grand"><td>Expected Cash</td><td class="r">${money(sh.expected_cash_bdt)}</td></tr>${row('Counted Cash', sh.counted_cash_bdt)}<tr class="grand"><td>Variance</td><td class="r">${money(sh.variance_bdt)}</td></tr></table><div class="ft">Hotel Fountain, Dhaka</div>`;
  printDoc('Register Z-Report', css, body);
}

// ─── POS terminal ────────────────────────────────────────────────────────────
function PosTerminal({ menu, inhouse, canDiscount, canComp, canPostRoom, onDone }) {
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // {menu_item_id,name,unit_price_bdt,vat_rate,qty}
  const [orderType, setOrderType] = useState(canPostRoom ? 'ROOM' : 'WALK_IN');
  const [resPick, setResPick] = useState(''); // "reservation_id|room_number"
  const [table, setTable] = useState('');
  const [vatPct, setVatPct] = useState(0);
  const [svcPct, setSvcPct] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastReceipt, setLastReceipt] = useState(null);

  const cats = useMemo(() => ['All', ...Array.from(new Set(menu.map((m) => m.category)))], [menu]);
  const shown = menu.filter((m) => m.is_available !== false)
    .filter((m) => cat === 'All' || m.category === cat)
    .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  // in-house room/guest options for Charge-to-Room
  const roomOpts = useMemo(() => {
    const out = [];
    (inhouse || []).forEach((r) => {
      const rooms = Array.isArray(r.room_ids) ? r.room_ids : (r.room_number ? [r.room_number] : []);
      rooms.forEach((rn) => out.push({ key: `${r.id}|${rn}`, room: String(rn), guest: r.guest_name || 'Guest', resId: r.id, breakfast: !!r.breakfast_included }));
    });
    return out.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
  }, [inhouse]);

  const add = (m) => setCart((c) => {
    const i = c.findIndex((x) => x.menu_item_id === m.id);
    if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
    return [...c, { menu_item_id: m.id, name: m.name, unit_price_bdt: Number(m.price_bdt) || 0, vat_rate: Number(m.vat_rate) || 0, qty: 1, comp: false }];
  });
  const setQty = (id, d) => setCart((c) => c.map((x) => x.menu_item_id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x).filter((x) => x.qty > 0));
  const toggleComp = (id) => setCart((c) => c.map((x) => x.menu_item_id === id ? { ...x, comp: !x.comp } : x));

  // Comped lines (complimentary — e.g. breakfast for an included package) contribute 0.
  const subtotal = cart.reduce((a, x) => a + (x.comp ? 0 : x.unit_price_bdt * x.qty), 0);
  const vat = subtotal * (Number(vatPct) || 0) / 100;
  const service = subtotal * (Number(svcPct) || 0) / 100;
  const disc = Math.min(Number(discount) || 0, subtotal + vat + service);
  const grand = Math.max(0, subtotal + vat + service - disc);

  async function submit(kind) {
    setErr('');
    if (!cart.length) return setErr('Add at least one item.');
    const isRoom = kind === 'ROOM';
    if (isRoom && !resPick) return setErr('Select an in-house room to charge.');
    const [reservation_id, room_number] = isRoom ? resPick.split('|') : [null, null];
    // comped lines are sent at price 0 so the guest is not charged for them
    const items = cart.map((x) => x.comp ? { ...x, unit_price_bdt: 0, notes: 'Complimentary' } : x);
    setBusy(true);
    try {
      const resp = await api('/api/crm/restaurant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'order_create', order_type: isRoom ? 'ROOM' : orderType,
          items, vat_pct: vatPct, service_pct: svcPct, discount_bdt: disc,
          reservation_id, room_number, table_no: orderType === 'DINE_IN' ? table : null,
          payment_method: isRoom ? 'Room' : method, idempotency_key: uuid(),
        }),
      });
      setLastReceipt({
        order_no: (resp.order && resp.order.order_no) || '', order_type: isRoom ? 'ROOM' : orderType,
        room_number, table_no: orderType === 'DINE_IN' ? table : null, method: isRoom ? 'Room' : method,
        lines: cart.map((x) => ({ name: x.name, qty: x.qty, unit: x.unit_price_bdt, comp: !!x.comp })),
        subtotal, vat, service, discount: disc, grand,
      });
      setCart([]); setDiscount(0); setResPick(''); setTable('');
      onDone && onDone();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  const chip = (on) => ({ padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--iv-border)', background: on ? 'var(--iv-gold)' : 'transparent', color: on ? '#171A05' : 'var(--iv-ink2)' });
  const inp = { padding: '8px 10px', border: '1px solid var(--iv-border)', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'var(--iv-ink)', fontSize: 13, width: '100%' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }} className="iv-chart-grid">
      {/* menu */}
      <div className="iv-card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Search menu..." value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, width: 180 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cats.map((c) => <button key={c} onClick={() => setCat(c)} style={chip(cat === c)}>{c}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
          {shown.map((m) => (
            <button key={m.id} onClick={() => add(m)} className="iv-card--hover" style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid var(--iv-border)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', color: 'var(--iv-ink)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{m.name}</div>
              <div className="iv-mono" style={{ fontSize: 12, color: 'var(--iv-gold)' }}>{bdt(m.price_bdt)}</div>
              {Number(m.vat_rate) > 0 && <div style={{ fontSize: 9, color: 'var(--iv-ink3)' }}>VAT {m.vat_rate}%</div>}
            </button>
          ))}
          {!shown.length && <div className="iv-stat__sub">No menu items{menu.length ? ' in this filter.' : ' yet - add some below.'}</div>}
        </div>
      </div>

      {/* cart / invoice drawer */}
      <div className="iv-card" style={{ position: 'sticky', top: 8 }}>
        <h3 className="text-lg" style={{ marginBottom: 10 }}>Order</h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(canPostRoom ? ['ROOM', 'DINE_IN', 'WALK_IN'] : ['DINE_IN', 'WALK_IN']).map((t) => (
            <button key={t} onClick={() => setOrderType(t)} style={{ ...chip(orderType === t), flex: 1, textAlign: 'center' }}>{t === 'ROOM' ? 'Room' : t === 'DINE_IN' ? 'Dine-in' : 'Walk-in'}</button>
          ))}
        </div>
        {orderType === 'ROOM' && (
          <select value={resPick} onChange={(e) => setResPick(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
            <option value="">- in-house room / guest -</option>
            {roomOpts.map((o) => <option key={o.key} value={o.key}>{o.room} - {o.guest}{o.breakfast ? ' · breakfast incl' : ''}</option>)}
          </select>
        )}
        {orderType === 'ROOM' && resPick && roomOpts.find((o) => o.key === resPick)?.breakfast && (
          <div style={{ fontSize: 11, color: '#C3E62E', marginBottom: 8, lineHeight: 1.4 }}>🍳 Breakfast included for this guest — add the breakfast item and tap <strong>Comp</strong> to make it free.</div>
        )}
        {orderType === 'DINE_IN' && <input placeholder="Table #" value={table} onChange={(e) => setTable(e.target.value)} style={{ ...inp, marginBottom: 8 }} />}

        <div style={{ maxHeight: 220, overflowY: 'auto', margin: '4px 0' }}>
          {!cart.length && <div className="iv-stat__sub" style={{ padding: '10px 0' }}>Tap menu items to add.</div>}
          {cart.map((x) => (
            <div key={x.menu_item_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--iv-border2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}{x.comp && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: '#C3E62E' }}>COMP</span>}</div>
                <div className="iv-mono" style={{ fontSize: 10.5, color: 'var(--iv-ink3)', textDecoration: x.comp ? 'line-through' : 'none' }}>{bdt(x.unit_price_bdt)} x {x.qty}</div>
              </div>
              {canComp && <button onClick={() => toggleComp(x.menu_item_id)} title="Complimentary (e.g. included breakfast)" style={{ ...chip(x.comp), padding: '2px 7px', fontSize: 10 }}>Comp</button>}
              <button onClick={() => setQty(x.menu_item_id, -1)} style={{ ...chip(false), padding: '2px 9px' }}>-</button>
              <span className="iv-mono" style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>{x.qty}</span>
              <button onClick={() => setQty(x.menu_item_id, 1)} style={{ ...chip(false), padding: '2px 9px' }}>+</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '8px 0' }}>
          <label style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>VAT %<input type="number" value={vatPct} onChange={(e) => setVatPct(e.target.value)} style={inp} /></label>
          <label style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>Service %<input type="number" value={svcPct} onChange={(e) => setSvcPct(e.target.value)} style={inp} /></label>
          <label style={{ fontSize: 10, color: 'var(--iv-ink3)', gridColumn: '1 / -1' }}>Discount {TK}{!canDiscount && ' (supervisor only)'}
            <input type="number" value={discount} disabled={!canDiscount} onChange={(e) => setDiscount(e.target.value)} style={{ ...inp, opacity: canDiscount ? 1 : .5 }} />
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--iv-border)', paddingTop: 8, fontSize: 12 }}>
          {[['Subtotal', subtotal], ['VAT', vat], ['Service', service], ['Discount', -disc]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iv-ink2)', padding: '2px 0' }}><span>{l}</span><span className="iv-mono">{bdt(v)}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontWeight: 800, color: 'var(--iv-gold)', fontSize: 16 }}><span>Grand Total</span><span className="iv-mono" data-testid="pos-grand-total">{bdt(grand)}</span></div>
        </div>

        {err && <div style={{ color: '#FF6B6B', fontSize: 12, marginTop: 8 }}>{err}</div>}

        {orderType !== 'ROOM' && (
          <div style={{ display: 'flex', gap: 6, margin: '10px 0 6px', flexWrap: 'wrap' }}>
            {PAY_METHODS.map((m) => <button key={m} onClick={() => setMethod(m)} style={{ ...chip(method === m), flex: 1, minWidth: 60, textAlign: 'center' }}>{m}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {orderType === 'ROOM'
            ? <button className="iv-btn" data-testid="pos-charge-room" style={{ flex: 1 }} disabled={busy || !cart.length} onClick={() => submit('ROOM')}>{busy ? '...' : 'Charge to Room'}</button>
            : <button className="iv-btn" data-testid="pos-settle" style={{ flex: 1 }} disabled={busy || !cart.length} onClick={() => submit('SETTLE')}>{busy ? '...' : `Settle (${method})`}</button>}
        </div>
        {lastReceipt && (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(223,255,69,.08)', border: '1px solid rgba(223,255,69,.28)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--iv-gold)' }}>Order {lastReceipt.order_no || ''} placed</span>
            <button className="iv-btn iv-btn--ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => printReceipt(lastReceipt)}>Print Receipt</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kitchen / KOT queue ──────────────────────────────────────────────────────
function KotQueue({ orders, items, onStatus }) {
  const open = orders.filter((o) => o.payment_status !== 'VOID' && o.status !== 'CLOSED');
  const itemsOf = (id) => (items || []).filter((it) => it.order_id === id);
  const receiptFromOrder = (o) => ({
    order_no: o.order_no, order_type: o.order_type, room_number: o.room_number, table_no: o.table_no,
    method: o.payment_method, lines: itemsOf(o.id).map((i) => ({ name: i.name, qty: i.qty, unit: Number(i.unit_price_bdt), comp: Number(i.unit_price_bdt) === 0 })),
    subtotal: o.subtotal_bdt, vat: o.vat_bdt, service: o.service_charge_bdt, discount: o.discount_bdt, grand: o.grand_total_bdt,
  });
  const FLOW = { OPEN: 'FIRED', FIRED: 'READY', READY: 'SERVED', SERVED: 'CLOSED' };
  const LABEL = { OPEN: 'Fire', FIRED: 'Mark Ready', READY: 'Mark Served', SERVED: 'Close' };
  const COLORS = { OPEN: '#C3E62E', FIRED: '#F5A93B', READY: '#5AB0FF', SERVED: '#B384F5' };
  return (
    <div className="iv-card">
      <h3 className="text-lg" style={{ marginBottom: 10 }}>Kitchen Queue</h3>
      {!open.length && <div className="iv-stat__sub">No open tickets.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
        {open.map((o) => (
          <div key={o.id} style={{ border: '1px solid var(--iv-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="iv-mono" style={{ fontSize: 12, color: 'var(--iv-gold)' }}>{o.order_no}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: COLORS[o.status] || 'var(--iv-ink3)' }}>{o.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--iv-ink2)' }}>
              {o.order_type === 'ROOM' ? `Room ${o.room_number || ''}` : o.order_type === 'DINE_IN' ? `Table ${o.table_no || ''}` : 'Walk-in'} · {bdt(o.grand_total_bdt)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="iv-btn iv-btn--ghost" style={{ flex: 1, fontSize: 12, minWidth: 90 }} onClick={() => printKot(o, itemsOf(o.id))}>Print KOT</button>
              <button className="iv-btn iv-btn--ghost" style={{ flex: 1, fontSize: 12, minWidth: 90 }} onClick={() => printReceipt(receiptFromOrder(o))}>Receipt</button>
              {FLOW[o.status] && <button className="iv-btn iv-btn--ghost" style={{ flex: 1, fontSize: 12, minWidth: 90 }} onClick={() => onStatus(o.id, FLOW[o.status])}>{LABEL[o.status]}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── F&B revenue ──────────────────────────────────────────────────────────────
function RevenuePanel({ orders, items, day }) {
  const live = orders.filter((o) => o.payment_status !== 'VOID');
  const liveIds = new Set(live.map((o) => o.id));
  const sales = live.reduce((a, o) => a + (Number(o.grand_total_bdt) || 0), 0);
  const byMethod = {}; live.forEach((o) => { const k = o.payment_method || 'Other'; byMethod[k] = (byMethod[k] || 0) + (Number(o.grand_total_bdt) || 0); });
  const unsettledRoom = live.filter((o) => o.payment_status === 'POSTED_TO_ROOM').reduce((a, o) => a + (Number(o.grand_total_bdt) || 0), 0);

  // top-selling items (by qty) across today's non-void orders
  const itemAgg = {};
  (items || []).filter((it) => liveIds.has(it.order_id)).forEach((it) => {
    const k = it.name || 'Item'; (itemAgg[k] = itemAgg[k] || { qty: 0, rev: 0 });
    itemAgg[k].qty += Number(it.qty) || 0; itemAgg[k].rev += Number(it.line_total_bdt) || 0;
  });
  const topItems = Object.entries(itemAgg).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);

  // peak dining hours (Asia/Dhaka) by order count
  const hourAgg = {};
  live.forEach((o) => { const h = new Date(o.created_at || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).slice(0, 2); hourAgg[h] = (hourAgg[h] || 0) + 1; });
  const peakHours = Object.entries(hourAgg).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxHour = peakHours.reduce((m, [, c]) => Math.max(m, c), 0) || 1;

  const card = { border: '1px solid var(--iv-border)', borderRadius: 14, padding: 16, background: 'var(--iv-card)' };

  function download() {
    // Matches the CRM Daily Performance Report: gold crest, #C5A059 rule, Georgia headings,
    // ivory cards, IBM-Plex-mono figures. (Reports.jsx PRINT_CSS is the reference.)
    const money = (v) => TK + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US');
    const gen = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
    const css = `@page{size:A4 portrait;margin:12mm}
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#2D2A26;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-size:11px}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C5A059;padding-bottom:8px;margin-bottom:12px}
.brand{display:flex;gap:10px;align-items:center}
.crest{width:34px;height:34px;object-fit:contain;flex:none}
.name{font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#2D2A26}
.tag{font-size:7.5px;letter-spacing:.2em;text-transform:uppercase;color:#7A7268;margin-top:2px}
.meta{text-align:right;font-size:9px;line-height:1.6;color:#2D2A26}
.meta .t{font-family:Georgia,serif;font-size:13px;font-weight:700;color:#2D2A26}
.badge{display:inline-block;margin-top:3px;background:#FBF1DD;color:#9A6A12;border:1px solid #ecdcb8;border-radius:3px;padding:1px 8px;font-size:8px;font-weight:600;letter-spacing:.06em}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:4px}
.card{border:1px solid #EAE6DD;border-radius:6px;padding:7px 10px;background:#fcfbf8}
.card h4{font-family:'Courier New',monospace;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#8B6914;margin-bottom:4px}
.card .v{font-family:'Courier New',monospace;font-size:17px;font-weight:700;color:#2D2A26}
.sec{font-family:Georgia,serif;font-size:11px;font-weight:700;color:#2D2A26;margin:14px 0 5px;border-bottom:1.5px solid #C5A059;padding-bottom:3px}
table{width:100%;border-collapse:collapse}
th{font-family:'Courier New',monospace;font-size:7.5px;letter-spacing:.06em;text-transform:uppercase;color:#7A7268;text-align:left;border-bottom:1.5px solid #2D2A26;padding:3px 6px}
td{font-size:9.5px;padding:3px 6px;border-bottom:1px solid #EAE6DD;font-family:'Courier New',monospace}
td:first-child,th:first-child{font-family:Arial,sans-serif}
.r{text-align:right}
.foot{display:flex;justify-content:space-between;margin-top:16px;border-top:1px solid #EAE6DD;padding-top:6px;font-family:'Courier New',monospace;font-size:8px;color:#7A7268}`;
    const pm = Object.entries(byMethod).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${money(v)}</td></tr>`).join('') || '<tr><td colspan="2">No sales.</td></tr>';
    const ti = topItems.map(([n, a]) => `<tr><td>${esc(n)}</td><td class="r">${a.qty}</td><td class="r">${money(a.rev)}</td></tr>`).join('') || '<tr><td colspan="3">No items.</td></tr>';
    const body = `<div class="head">
  <div class="brand"><img class="crest" src="${esc(origin)}/logo-crest.png" alt="" /><div><div class="name">Hotel Fountain</div><div class="tag">Management CRM &middot; Powered by Lumea</div></div></div>
  <div class="meta"><div class="t">Restaurant / F&amp;B Day-Close</div>Generated ${esc(gen)}<br><span class="badge">BUSINESS DAY ${esc(day)}</span></div>
</div>
<div class="grid">
  <div class="card"><h4>F&amp;B Sales</h4><div class="v">${money(sales)}</div></div>
  <div class="card"><h4>Orders</h4><div class="v">${live.length}</div></div>
  <div class="card"><h4>Charged to Room</h4><div class="v">${money(unsettledRoom)}</div></div>
</div>
<div class="sec">Payment Breakdown</div>
<table><thead><tr><th>Method</th><th class="r">Amount</th></tr></thead><tbody>${pm}</tbody></table>
<div class="sec">Top-Selling Items</div>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead><tbody>${ti}</tbody></table>
<div class="foot"><span>Hotel Fountain &middot; Lumea CRM &middot; /crm/restaurant</span><span>Page 1 of 1</span></div>`;
    printDoc(`F&B Day-Close ${day}`, css, body);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="text-lg" style={{ color: 'var(--iv-ink)' }}>F&amp;B Revenue · <span style={{ color: 'var(--iv-gold)' }}>{day}</span></h3>
        <button className="iv-btn iv-btn--ghost" style={{ fontSize: 12 }} onClick={download}>Download Day-Close Report</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
        <div style={card}><div className="iv-stat__sub">F&amp;B Sales</div><div className="iv-mono" style={{ fontSize: 24, fontWeight: 800, color: 'var(--iv-gold)' }}>{bdt(sales)}</div></div>
        <div style={card}><div className="iv-stat__sub">Orders</div><div className="iv-mono" style={{ fontSize: 24, fontWeight: 800, color: 'var(--iv-ink)' }}>{live.length}</div></div>
        <div style={card}><div className="iv-stat__sub">Charged to Room</div><div className="iv-mono" style={{ fontSize: 24, fontWeight: 800, color: '#F5A93B' }}>{bdt(unsettledRoom)}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        <div className="iv-card">
          <h3 className="text-lg" style={{ marginBottom: 8 }}>Payment Breakdown</h3>
          {Object.keys(byMethod).length === 0 && <div className="iv-stat__sub">No sales yet today.</div>}
          {Object.entries(byMethod).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 }}>
              <span style={{ color: 'var(--iv-ink2)' }}>{k}</span><span className="iv-mono" style={{ color: 'var(--iv-ink)' }}>{bdt(v)}</span>
            </div>
          ))}
        </div>
        <div className="iv-card">
          <h3 className="text-lg" style={{ marginBottom: 8 }}>Top-Selling Items</h3>
          {!topItems.length && <div className="iv-stat__sub">No items sold yet.</div>}
          {topItems.map(([n, a]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 }}>
              <span style={{ color: 'var(--iv-ink2)' }}>{n} <span className="iv-stat__sub">x{a.qty}</span></span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(a.rev)}</span>
            </div>
          ))}
        </div>
        <div className="iv-card">
          <h3 className="text-lg" style={{ marginBottom: 8 }}>Peak Hours</h3>
          {!peakHours.length && <div className="iv-stat__sub">No orders yet.</div>}
          {peakHours.map(([h, c]) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span className="iv-mono" style={{ width: 40, color: 'var(--iv-ink2)' }}>{h}:00</span>
              <div style={{ flex: 1, height: 8, background: 'var(--iv-border2)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(c / maxHour) * 100}%`, background: 'var(--iv-gold)', borderRadius: 99 }} /></div>
              <span className="iv-mono" style={{ width: 20, textAlign: 'right', color: 'var(--iv-ink3)' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Menu manager (supervisor + owner/admin) ─────────────────────────────────
function MenuManager({ menu, onChange }) {
  const [f, setF] = useState({ name: '', category: 'Main Course', price_bdt: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const inp = { padding: '8px 10px', border: '1px solid var(--iv-border)', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'var(--iv-ink)', fontSize: 13 };
  async function save() {
    if (!f.name || !f.category) return setErr('Name and category required.');
    setBusy(true); setErr('');
    try { await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'menu_save', ...f, price_bdt: Number(f.price_bdt) || 0, vat_rate: 0 }) }); setF({ name: '', category: f.category, price_bdt: '' }); onChange(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function toggle(m) { try { await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'menu_save', id: m.id, name: m.name, category: m.category, price_bdt: m.price_bdt, vat_rate: m.vat_rate, is_available: !(m.is_available !== false) }) }); onChange(); } catch (e) { setErr(e.message); } }
  async function del(m) { if (!window.confirm(`Remove ${m.name}?`)) return; try { await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'menu_delete', id: m.id }) }); onChange(); } catch (e) { setErr(e.message); } }
  return (
    <div className="iv-card">
      <h3 className="text-lg" style={{ marginBottom: 10 }}>Menu Management</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="Item name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...inp, flex: 2, minWidth: 140 }} />
        <input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ ...inp, flex: 1, minWidth: 110 }} />
        <input placeholder={`Price ${TK}`} type="number" value={f.price_bdt} onChange={(e) => setF({ ...f, price_bdt: e.target.value })} style={{ ...inp, width: 90 }} />
        <button className="iv-btn" disabled={busy} onClick={save}>{busy ? '...' : 'Add'}</button>
      </div>
      {err && <div style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {menu.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 12.5, opacity: m.is_available !== false ? 1 : .5 }}>
            <span style={{ flex: 1, color: 'var(--iv-ink)' }}>{m.name} <span className="iv-stat__sub">· {m.category}</span></span>
            <span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(m.price_bdt)}</span>
            <button className="iv-btn iv-btn--ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => toggle(m)}>{m.is_available !== false ? 'Hide' : 'Show'}</button>
            <button className="iv-btn iv-btn--ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#FF6B6B' }} onClick={() => del(m)}>Del</button>
          </div>
        ))}
        {!menu.length && <div className="iv-stat__sub">No items yet.</div>}
      </div>
    </div>
  );
}

// ─── Register open/close modal (posRegister) ─────────────────────────────────
function RegisterModal({ mode, expectedCash, onClose, onDone }) {
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const exp = Number(expectedCash) || 0;
  const variance = (Number(counted) || 0) - exp;
  const inp = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 10, background: 'rgba(255,255,255,.05)', width: '100%', fontSize: 14, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--iv-ink3)', margin: '0 0 5px', display: 'block' };
  async function go() {
    setBusy(true); setErr('');
    try {
      if (mode === 'open') {
        await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register_open', opening_float_bdt: Number(float) || 0 }) });
      } else {
        const j = await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register_close', counted_cash_bdt: Number(counted) || 0, notes }) });
        if (j.shift) printRegisterReport(j.shift);
      }
      onDone();
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  }
  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.58)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 400 }}>
        <h3 className="text-xl mb-4 pb-3 iv-divider">{mode === 'open' ? 'Open Register' : 'Close Register'}</h3>
        {mode === 'open'
          ? <div><label style={lbl}>Opening Float ({TK})</label><input type="number" autoFocus value={float} onChange={(e) => setFloat(e.target.value)} style={inp} placeholder="e.g. 2000" /></div>
          : <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}><span className="iv-stat__sub">Expected cash in drawer</span><span className="iv-mono" style={{ color: 'var(--iv-gold)', fontWeight: 700 }}>{bdt(exp)}</span></div>
              <label style={lbl}>Counted Cash ({TK})</label>
              <input type="number" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} style={inp} placeholder="physically counted" />
              {counted !== '' && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 8 }}><span className="iv-stat__sub">Variance</span><span className="iv-mono" style={{ fontWeight: 700, color: variance === 0 ? '#7BE04A' : (variance < 0 ? '#FF6B6B' : '#F5A93B') }}>{variance > 0 ? '+' : ''}{bdt(variance)}</span></div>}
              <label style={{ ...lbl, marginTop: 12 }}>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} placeholder="optional" />
            </>}
        {err && <div style={{ color: '#FF6B6B', fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div className="flex justify-end gap-2 iv-foot" style={{ marginTop: 16 }}>
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="iv-btn" onClick={go} disabled={busy || (mode === 'close' && counted === '')}>{busy ? '...' : (mode === 'open' ? 'Open' : 'Close & Print')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Order history + search ──────────────────────────────────────────────────
function HistoryPanel({ canVoid }) {
  const dh = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(ms));
  const [from, setFrom] = useState(dh(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(dh(Date.now()));
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]); const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const itemsOf = (id) => items.filter((it) => it.order_id === id);
  const receiptFromOrder = (o) => ({ order_no: o.order_no, order_type: o.order_type, room_number: o.room_number, table_no: o.table_no, method: o.payment_method, lines: itemsOf(o.id).map((i) => ({ name: i.name, qty: i.qty, unit: Number(i.unit_price_bdt), comp: Number(i.unit_price_bdt) === 0 })), subtotal: o.subtotal_bdt, vat: o.vat_bdt, service: o.service_charge_bdt, discount: o.discount_bdt, grand: o.grand_total_bdt });
  const search = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const p = new URLSearchParams({ resource: 'history', from, to });
      if (status) p.set('status', status); if (q) p.set('q', q);
      const j = await api('/api/crm/restaurant?' + p.toString());
      setRows(j.rows || []); setItems(j.items || []);
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }, [from, to, status, q]);
  useEffect(() => { search(); /* initial */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function voidOrder(o) {
    if (!window.confirm(`Void order ${o.order_no}? This reverses any room charge.`)) return;
    try { await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'order_void', id: o.id }) }); search(); }
    catch (e) { setErr(e.message || String(e)); }
  }
  const inp = { padding: '7px 9px', border: '1px solid var(--iv-border)', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'var(--iv-ink)', fontSize: 12.5 };
  const where = (o) => o.order_type === 'ROOM' ? `Room ${o.room_number || ''}` : o.order_type === 'DINE_IN' ? `Table ${o.table_no || ''}` : 'Walk-in';
  const PS_COLOR = { PAID: '#7BE04A', POSTED_TO_ROOM: '#F5A93B', VOID: '#FF6B6B' };
  return (
    <div className="iv-card">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></label>
        <input placeholder="Order no / room / table" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ ...inp, width: 180 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
          <option value="">All status</option><option value="PAID">Paid</option><option value="POSTED_TO_ROOM">Charged to room</option><option value="VOID">Void</option>
        </select>
        <button className="iv-btn" style={{ fontSize: 12 }} disabled={busy} onClick={search}>{busy ? '...' : 'Search'}</button>
      </div>
      {err && <div style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ color: 'var(--iv-ink3)', textAlign: 'left' }}>
            {['Order', 'Day', 'Where', 'Method', 'Status', 'Total', ''].map((h) => <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--iv-border)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td className="iv-mono" style={{ padding: '6px 8px', color: 'var(--iv-gold)' }}>{o.order_no}</td>
                <td className="iv-mono" style={{ padding: '6px 8px', color: 'var(--iv-ink3)' }}>{o.fiscal_day}</td>
                <td style={{ padding: '6px 8px', color: 'var(--iv-ink2)' }}>{where(o)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--iv-ink2)' }}>{o.payment_method || '—'}</td>
                <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: PS_COLOR[o.payment_status] || 'var(--iv-ink3)' }}>{o.payment_status}</td>
                <td className="iv-mono" style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--iv-ink)' }}>{bdt(o.grand_total_bdt)}</td>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                  <button className="iv-btn iv-btn--ghost" style={{ fontSize: 10, padding: '2px 7px', marginRight: 4 }} onClick={() => printKot(o, itemsOf(o.id))}>KOT</button>
                  <button className="iv-btn iv-btn--ghost" style={{ fontSize: 10, padding: '2px 7px', marginRight: 4 }} onClick={() => printReceipt(receiptFromOrder(o))}>Receipt</button>
                  {canVoid && o.payment_status !== 'VOID' && <button className="iv-btn iv-btn--ghost" data-testid="history-void" style={{ fontSize: 10, padding: '2px 7px', color: '#FF6B6B' }} onClick={() => voidOrder(o)}>Void</button>}
                </td>
              </tr>
            ))}
            {!rows.length && !busy && <tr><td colSpan={7} style={{ padding: 14, textAlign: 'center', color: 'var(--iv-ink3)' }}>No orders found for this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const SUBTABS = [{ key: 'pos', label: 'Order Placement' }, { key: 'kot', label: 'Kitchen / Orders' }, { key: 'history', label: 'History' }, { key: 'revenue', label: 'Revenue & Analytics' }];

export default function Restaurant() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pos');
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [day, setDay] = useState('');
  const [inhouse, setInhouse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [shift, setShift] = useState(null);          // open register shift (or null)
  const [expectedCash, setExpectedCash] = useState(null);
  const [regModal, setRegModal] = useState(null);    // 'open' | 'close' | null

  const canDiscount = can(user?.role, 'posDiscount');
  const canComp = can(user?.role, 'compItem'); // Front Office + supervisors mark complimentary (e.g. breakfast)
  const canPostRoom = can(user?.role, 'postFbToRoom');
  const canRegister = can(user?.role, 'posRegister'); // open/close cash drawer & shift
  const canManageMenu = isOwnerAdmin(user?.role) || can(user?.role, 'posRegister');
  const canFbReports = can(user?.role, 'viewFbReports') || isOwnerAdmin(user?.role);
  const visibleSubtabs = SUBTABS.filter((s) => s.key !== 'revenue' || canFbReports);

  const loadMenu = useCallback(async () => {
    try { const j = await api('/api/crm/restaurant?resource=menu'); setMenu(j.rows || []); }
    catch (e) { setErr(e.message); }
  }, []);
  const loadOrders = useCallback(async () => {
    try { const j = await api('/api/crm/restaurant?resource=orders'); setOrders(j.rows || []); setItems(j.items || []); setDay(j.day || ''); }
    catch (e) { setErr(e.message); }
  }, []);
  const loadInhouse = useCallback(async () => {
    try { const r = await fetch('/api/crm/data?resource=reservations&status_in=CHECKED_IN'); const j = await r.json().catch(() => ({})); setInhouse(j.rows || []); }
    catch { /* non-fatal */ }
  }, []);
  const loadRegister = useCallback(async () => {
    if (!canRegister) return;
    try { const j = await api('/api/crm/restaurant?resource=register'); setShift(j.shift || null); setExpectedCash(j.expectedCash); }
    catch { /* non-fatal */ }
  }, [canRegister]);

  useEffect(() => { (async () => { setLoading(true); await Promise.all([loadMenu(), loadOrders(), loadInhouse(), loadRegister()]); setLoading(false); })(); }, [loadMenu, loadOrders, loadInhouse, loadRegister]);

  async function setStatus(id, status) {
    try { await api('/api/crm/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'order_status', id, status }) }); loadOrders(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-2xl" style={{ color: 'var(--iv-ink)' }}>Restaurant</h2>
          <p className="iv-stat__sub" style={{ marginTop: 2 }}>Point of sale, kitchen tickets and F&amp;B revenue{day ? ` · ${day}` : ''}.</p>
        </div>
        {canRegister && (shift
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#7BE04A', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#7BE04A' }} />Register open</span>
              <button className="iv-btn iv-btn--ghost" data-testid="register-close" style={{ fontSize: 12, borderRadius: 999 }} onClick={() => setRegModal('close')}>Close Register</button>
            </div>
          : <button className="iv-btn" data-testid="register-open" style={{ fontSize: 12, borderRadius: 999 }} onClick={() => setRegModal('open')}>Open Register</button>)}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {visibleSubtabs.map((sub) => (
          <button key={sub.key} onClick={() => setTab(sub.key)} className={`fx-pill${tab === sub.key ? ' on' : ''}`} style={{ fontSize: 13 }}>{sub.label}</button>
        ))}
      </div>

      {err && <div className="iv-card" style={{ borderColor: 'rgba(255,107,107,.4)', color: '#FF6B6B', marginBottom: 12, fontSize: 13 }}>{err}</div>}
      {loading && <div className="iv-stat__sub">Loading restaurant...</div>}

      {!loading && tab === 'pos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PosTerminal menu={menu} inhouse={inhouse} canDiscount={canDiscount} canComp={canComp} canPostRoom={canPostRoom} onDone={() => { loadOrders(); loadInhouse(); }} />
          {canManageMenu && <MenuManager menu={menu} onChange={loadMenu} />}
        </div>
      )}
      {!loading && tab === 'kot' && <KotQueue orders={orders} items={items} onStatus={setStatus} />}
      {!loading && tab === 'history' && <HistoryPanel canVoid={canDiscount} />}
      {!loading && tab === 'revenue' && (canFbReports
        ? <RevenuePanel orders={orders} items={items} day={day} />
        : <div className="iv-card"><p className="iv-stat__sub">F&amp;B sales reports are restricted to the Restaurant Supervisor and Owner/Admin.</p></div>)}

      {regModal && <RegisterModal mode={regModal} expectedCash={expectedCash} onClose={() => setRegModal(null)} onDone={() => { setRegModal(null); loadRegister(); loadOrders(); }} />}
    </div>
  );
}
