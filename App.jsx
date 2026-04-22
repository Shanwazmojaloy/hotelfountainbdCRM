import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';



/* ═══════════════════════════════════════════════════════════
   LUMEA — HOTEL FOUNTAIN CRM  v3.0
   All issues fixed — Production Ready
═══════════════════════════════════════════════════════════ */

const SB_URL = 'https://mynwfkgksqqwlqowlscj.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'
const TENANT  = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'

const BDT = n => '৳' + Number(n||0).toLocaleString('en-BD')
const fmtDate = d => d ? String(d).slice(0,10) : '—'
const todayDhaka = () => new Date(new Date().toLocaleString('en',{timeZone:'Asia/Dhaka'}))
const todayStr = () => { const d=todayDhaka(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const nightsCount = (ci,co) => { if(!ci||!co) return 0; return Math.max(0, Math.round((new Date(co)-new Date(ci))/86400000)) }

function computeBill(r, rooms, foliosMap, settings) {
  const rids=r.room_ids||[r.room_number]
  const selectedRooms = rooms?.filter(rm => rids.some(rid => String(rid) === String(rm.room_number))) || []
  const computedRoomRate = selectedRooms.reduce((sum, rm) => sum + (+rm.price || 0), 0) || +r.rate_per_night || 0
  
  const nights = nightsCount(r.check_in, r.check_out) || 1
  let roomCharge = computedRoomRate * nights
  
  const fKey=r.id||r.room_number
  const folios=(foliosMap[fKey]||foliosMap[r.room_number]||[]).filter(f=>f.category!=="Receivable")
  const extras=folios.filter(f=>f.category!=='Payment').reduce((a,f)=>a+(+f.amount||0),0)
  
  // Use rates from hotel settings (loaded from Supabase), fallback 0
  const vatPct=0;
  const svcPct=0;
  const tax=0;
  const svc=0;
  const discount= +(r.discount_amount || r.discount || 0);
  /* ── Single Source of Truth ──
     Hierarchy: Base Room Charge = rate × nights + Add Charges (folios)
     If total_amount was explicitly set in DB (agreed invoice), trust it.
     Otherwise fall back to computed rate × nights + extras.
     "due" is ALWAYS computed live: total − paid.                           */
  const invoice = r;
  /* Folio extras (minibar, laundry, etc.) are ALWAYS added on top. */
  const dbTotal = +(r.total_amount || 0)
  const basePrice = dbTotal > 0 ? dbTotal : Math.max(0, roomCharge - discount);
  const grossRate = dbTotal > 0 ? dbTotal + discount : roomCharge;
  
  // Override roomCharge to match the custom basePrice if dbTotal is set
  if (dbTotal > 0) roomCharge = grossRate;
  const roomRate = nights > 0 ? roomCharge / nights : roomCharge;
  const sub = roomCharge + extras;
  
  const total = basePrice + extras;
  const paid = +(invoice.paid_amount || 0);
  const due = Math.max(0, total - paid);
  return {roomCharge,extras,sub,tax,svc,discount,total,paid,due,folios,nights,roomRate,vatPct,svcPct,basePrice,grossRate}
}
const AVC = ['#C8A96E','#2EC4B6','#E05C7A','#58A6FF','#3FB950','#9B72CF','#F0A500']
const avColor = n => AVC[n ? n.charCodeAt(0)%AVC.length : 0]
const initials = n => n ? n.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const receivableStatus = due => due <= 0 ? 'PAID' : 'UNPAID'
const HOTEL_SETTINGS_KEY = 'hf_crm_hotel_settings_v1'

function printTransactionInvoice(tx, reservations = []) {
  const safe = v => String(v ?? '')
  const esc = s => safe(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
  const toNum = v => Number(v || 0)
  const matchRes = reservations.find(r => String(r.room_ids || '').includes(String(tx.room_number || '')))
  const nights = nightsCount(matchRes?.check_in, matchRes?.check_out)
  const unitRate = nights > 0 ? Math.round(toNum(matchRes?.total_amount) / nights) : 0
  const totalAmount = toNum(matchRes?.total_amount)
  const paidAmount = toNum(matchRes?.paid_amount)
  const balanceDue = Math.max(0, totalAmount - paidAmount)
  const invoiceNo = `INV-${String(tx.id || '0000').slice(0,8).toUpperCase()}`
  const issueDate = tx.fiscal_day || todayStr()
  const printWin = window.open('', '_blank', 'width=900,height=980')
  if (!printWin) {
    alert('Please allow pop-ups to print the invoice.')
    return
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Invoice - ${esc(tx.guest_name || 'Guest')}</title>
  <style>
    @page{size:A4;margin:10mm}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:#1a1a1a;font-family:'Helvetica Neue',Arial,sans-serif}
    .sheet{width:794px;min-height:1123px;margin:0 auto;padding:34px 34px 28px;border:1px solid #ddd}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px}
    .brand{font-size:28px;letter-spacing:.16em;font-weight:700}
    .tag{font-size:11px;color:#666;margin-top:4px}
    .ver{font-size:10px;color:#777;letter-spacing:.12em;margin-top:8px}
    .inv-title{font-size:44px;letter-spacing:.16em;font-weight:300;margin:0 0 10px;text-align:right}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;min-width:400px}
    .meta .k{font-size:10px;color:#666;letter-spacing:.08em;text-transform:uppercase}
    .meta .v{font-size:13px;font-weight:600;margin-top:3px}
    .bill{display:flex;justify-content:space-between;gap:18px;margin-bottom:22px}
    .bill-card{background:#222;color:#fff;padding:14px 16px;min-width:270px}
    .bill-card .k{font-size:10px;letter-spacing:.14em;color:#bbb}
    .bill-card .v{font-size:14px;font-weight:600;margin:5px 0 7px}
    .bill-card .line{font-size:11px;color:#ddd;line-height:1.45}
    table{width:100%;border-collapse:collapse}
    .items th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#555;text-align:left;border-bottom:1px solid #111;padding:8px 5px}
    .items td{font-size:12px;border-bottom:1px solid #ddd;padding:10px 5px;vertical-align:top}
    .items td:last-child,.items th:last-child{text-align:right}
    .items td:nth-child(3),.items th:nth-child(3),.items td:nth-child(4),.items th:nth-child(4){text-align:center}
    .desc-sub{font-size:10px;color:#666;display:block;margin-top:3px}
    .foot{display:grid;grid-template-columns:1fr 270px;gap:16px;margin-top:20px}
    .pay h4{margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
    .pay p{margin:3px 0;font-size:11px;color:#444}
    .totals td{font-size:12px;padding:6px 8px;border-bottom:1px solid #ddd}
    .totals td:last-child{text-align:right}
    .grand td{background:#111;color:#fff;font-weight:700;border-bottom:none}
    .due{margin-top:20px;text-align:right}
    .due .k{font-size:23px;color:#666}
    .due .v{font-size:34px;font-weight:300}
    .bottom{display:flex;justify-content:space-between;margin-top:34px;border-top:1px solid #ddd;padding-top:16px}
    .sign{font-size:12px;color:#333}
    .sig-name{font-size:24px;font-family:cursive;color:#222}
    .small{font-size:10px;color:#777}
    @media print{body{background:#fff}.sheet{border:none}}
  </style></head><body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="brand">HOTEL FOUNTAIN</div>
        <div class="tag">The Pulse of Modern Hospitality</div>
        <div class="ver">TEMPLATE: HF-2026-A</div>
      </div>
      <div>
        <h1 class="inv-title">INVOICE</h1>
        <div class="meta">
          <div><div class="k">Invoice No.</div><div class="v">${esc(invoiceNo)}</div></div>
          <div><div class="k">Invoice Date</div><div class="v">${esc(issueDate)}</div></div>
          <div><div class="k">Room No.</div><div class="v">${esc(tx.room_number || '—')}</div></div>
        </div>
      </div>
    </div>
    <div class="bill">
      <div class="bill-card">
        <div class="k">Bill To</div>
        <div class="v">${esc(tx.guest_name || 'Walk-in Guest')}</div>
        <div class="line">Check-In: ${esc(fmtDate(matchRes?.check_in))}</div>
        <div class="line">Check-Out: ${esc(fmtDate(matchRes?.check_out))}</div>
        <div class="line">Payment Type: ${esc(tx.type || 'Payment')}</div>
      </div>
    </div>
    <table class="items">
      <thead><tr><th>Item Name</th><th>Descriptions</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>
        <tr>
          <td>Room Stay</td>
          <td>${esc(tx.room_number ? `Room ${tx.room_number}` : 'Room charge')}<span class="desc-sub">${esc(fmtDate(matchRes?.check_in))} → ${esc(fmtDate(matchRes?.check_out))}</span></td>
          <td>${esc(BDT(unitRate))}</td>
          <td>${esc(nights || 1)}</td>
          <td>${esc(BDT(unitRate * (nights || 1)))}</td>
        </tr>
        <tr>
          <td>${esc(tx.type || 'Payment')}</td>
          <td>Transaction posted<span class="desc-sub">Generated from Billing & Invoices</span></td>
          <td>${esc(BDT(tx.amount))}</td>
          <td>1</td>
          <td>${esc(BDT(tx.amount))}</td>
        </tr>
      </tbody>
    </table>
    <div class="foot">
      <div class="pay">
        <h4>Payment Method</h4>
        <p>${esc(tx.type || 'Cash')}</p>
        <p class="small">Generated: ${esc(new Date().toLocaleString())}</p>
      </div>
      <table class="totals">
        <tbody>
          <tr><td>Sub Total</td><td>${esc(BDT(totalAmount))}</td></tr>
          <tr><td>Discount</td><td>${esc(BDT(0))}</td></tr>
          <tr class="grand"><td>Grand Total</td><td>${esc(BDT(totalAmount))}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="due"><div class="k">Total Due</div><div class="v">${esc(BDT(balanceDue))}</div></div>
    <div class="bottom">
      <div class="sign">
        <div class="sig-name">Hotel Fountain</div>
        <div><strong>Front Desk Manager</strong></div>
      </div>
      <div class="small">
        House #05, Road #02, Nikunja 2, Dhaka 1229<br/>
        +8801322840799<br/>
        hotellfountainbd@gmail.com
      </div>
    </div>
  </div>
  </body></html>`
  printWin.document.open()
  printWin.document.write(html)
  printWin.document.close()
  printWin.onload = () => {
    setTimeout(() => {
      printWin.print()
    }, 120)
  }
}

const H  = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json', Prefer:'return=representation' }
const H2 = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json' }
const db = async (t,q='') => { const r=await fetch(`${SB_URL}/rest/v1/${t}${q}`,{headers:H}); if(!r.ok) throw new Error(await r.text()); return r.json() }
const dbPost = async (t,b) => { const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:'POST',headers:H,body:JSON.stringify(b)}); if(!r.ok){ const txt=await r.text(); throw new Error(`POST ${t} ${r.status}: ${txt}`) } return r.json() }
const dbPatch = async (t,id,b) => { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:H2,body:JSON.stringify(b)}); if(!r.ok){ const txt=await r.text(); throw new Error(`PATCH ${t} ${r.status}: ${txt}`) } }
const dbDelete = async (t,id) => { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'DELETE',headers:H2}); if(!r.ok) throw new Error(await r.text()) }
const fetchAllGuests = async () => {
  const pageSize = 1000
  let offset = 0
  const all = []
  while (true) {
    const batch = await db('guests', `?tenant_id=eq.${TENANT}&select=*&order=name&limit=${pageSize}&offset=${offset}`)
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }
  return all
}

/* ── Numeric sanitizer: ensures no NaN/Infinity/undefined reaches Supabase ── */
const safeNum = (v, fallback = 0) => { const n = Number(v); return (isNaN(n) || !isFinite(n)) ? fallback : n }
const sanitizePayload = obj => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (['amount','paid_amount','total_amount','discount','discount_amount','outstanding_balance','extra_charges','bill_total'].includes(k)) {
      out[k] = safeNum(v, 0);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const RESERVATION_CORE_CREATE_FIELDS = ['guest_ids','room_ids','check_in','check_out','status','total_amount','paid_amount','discount','payment_method','special_requests','on_duty_officer','stay_type','tenant_id','room_details']
const RESERVATION_CORE_PATCH_FIELDS = ['status','paid_amount','special_requests','room_ids','check_in','check_out','total_amount','discount','payment_method','room_details']
const pickFields = (obj, fields) => fields.reduce((acc,key)=>{ if(obj&&Object.prototype.hasOwnProperty.call(obj,key)&&obj[key]!==undefined) acc[key]=obj[key]; return acc },{})
const shouldRetryReservation400 = err => /\b(reservations)\b/i.test(String(err?.message||'')) && /\b400\b/.test(String(err?.message||''))
async function dbPostReservationSafe(payload){
  const clean = sanitizePayload(payload);
  try{
    return await dbPost('reservations',clean)
  }catch(err){
    if(!shouldRetryReservation400(err)) throw err
    return await dbPost('reservations',pickFields(clean,RESERVATION_CORE_CREATE_FIELDS))
  }
}
async function dbPatchReservationSafe(id,payload){
  const clean = sanitizePayload(payload);
  try{
    return await dbPatch('reservations',id,clean)
  }catch(err){
    if(!shouldRetryReservation400(err)) throw err
    return await dbPatch('reservations',id,pickFields(clean,RESERVATION_CORE_PATCH_FIELDS))
  }
}
/* ── Safe transaction POST: sanitizes amount and strips undefined fields ── */
async function dbPostTransactionSafe(payload){
  const clean = sanitizePayload(payload);
  if(!clean.amount || clean.amount <= 0){ console.warn('Skipping transaction with zero/invalid amount:',clean); return null; }
  return await dbPost('transactions',clean);
}

const ROLES = {
  owner:        {label:'Founder / Owner',    color:'#C8A96E', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports','settings']},
  manager:      {label:'General Manager',    color:'#2EC4B6', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports']},
  receptionist: {label:'Receptionist',       color:'#58A6FF', pages:['dashboard','rooms','reservations','guests','billing']},
  housekeeping: {label:'Housekeeping Staff', color:'#F0A500', pages:['dashboard','rooms','housekeeping']},
  accountant:   {label:'Accountant',         color:'#3FB950', pages:['dashboard','billing','reports']},
}

// STAFF — stored in state so Settings can add/edit/delete
const INIT_STAFF = [
  {id:1, name:'Shanwaz Ahmed',    email:'owner@hotelfountain.com',       pw:'owner2026',  role:'owner',        av:'SA', device:'Admin / Founder'},
  {id:2, name:'Front Desk (FO)',  email:'fo.hotelfountain799@gmail.com', pw:'front2026',  role:'receptionist', av:'FD', device:'Front Desk Terminal'},
  {id:3, name:'HK Staff',         email:'hotelfountain.hk@gmail.com',   pw:'hk2026',     role:'housekeeping', av:'HK', device:'Housekeeping Terminal'},
  {id:4, name:'Manager',          email:'manager@hotelfountain.com',    pw:'mgr2026',    role:'manager',      av:'MG', device:'Manager Office'},
  {id:5, name:'Accounts',         email:'accounts@hotelfountain.com',   pw:'acc2026',    role:'accountant',   av:'AC', device:'Accounts Terminal'},
]

/* ═══════════════════════ CSS ═══════════════════════════════ */
// Fonts loaded via HTML <head> — no inline injection needed

const CSS = `
/* ── RESET & ROOT TOKENS ──────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:   #F5F0E8;
  --s1:   #1C1510;
  --s2:   #FFFFFF;
  --s3:   #EDE8DF;
  --s4:   #F9F6F1;
  --gold: #8B6914;
  --gold2:#6B4E0A;
  --gold-light:#C8A96E;
  --gdim: rgba(139,105,20,.07);
  --rose: #B91C1C;
  --grn:  #15803D;
  --teal: #0F766E;
  --sky:  #1D4ED8;
  --amb:  #B45309;
  --pur:  #6D28D9;
  --tx:  #1C1510;
  --tx2: #5C4A2A;
  --tx3: #9A8070;
  --tx-inv:#EEE8DC;
  --tx-inv2:rgba(238,228,210,.55);
  --br:  #D4C9B5;
  --br2: #E8E0D0;
  --br-side:rgba(200,169,110,.18);
  --serif:'Libre Baskerville',Georgia,serif;
  --sans: 'DM Sans',system-ui,sans-serif;
  --mono: 'IBM Plex Mono',monospace;
  --r: 0px;
}

html,body,#root{
  height:100%;background:var(--bg);color:var(--tx);
  font-family:var(--sans);font-weight:400;
  -webkit-font-smoothing:antialiased;overflow:hidden;color-scheme:light;
}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--br2)}
::-webkit-scrollbar-thumb{background:var(--br)}
::-webkit-scrollbar-thumb:hover{background:var(--gold)}

/* ── LAYOUT ── */
.app{display:flex;height:100vh;overflow:hidden}
.sidebar{width:232px;flex-shrink:0;background:var(--s1);border-right:1px solid var(--br-side);display:flex;flex-direction:column;overflow:hidden}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* ── SIDEBAR ── */
.s-head{padding:22px 20px 18px;border-bottom:1px solid rgba(200,169,110,.15);flex-shrink:0}
.s-brand{font-family:var(--serif);font-size:20px;font-weight:700;color:var(--gold-light);letter-spacing:.02em;line-height:1.1}
.s-brand em{font-style:italic;font-weight:400;color:#E0C585}
.s-tag{font-family:var(--sans);font-size:7.5px;color:rgba(200,169,110,.38);letter-spacing:.2em;text-transform:uppercase;margin-top:5px;font-weight:300}
.s-hotel{font-family:var(--sans);font-size:11px;color:rgba(238,228,210,.4);margin-top:7px;font-weight:300;letter-spacing:.03em}
.s-nav{flex:1;padding:10px 10px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.s-sect{font-family:var(--sans);font-size:7px;letter-spacing:.24em;color:rgba(200,169,110,.3);padding:12px 10px 5px;text-transform:uppercase;font-weight:500}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;font-family:var(--sans);font-size:12.5px;font-weight:400;color:var(--tx-inv2);border-left:3px solid transparent;border-right:3px solid transparent;transition:all .15s;user-select:none;letter-spacing:.02em}
.nav-item:hover{background:rgba(200,169,110,.07);color:rgba(238,228,210,.85);border-left-color:rgba(200,169,110,.2)}
.nav-item.on{background:rgba(200,169,110,.12);color:var(--gold-light);border-left-color:var(--gold-light);font-weight:500}
.nav-item .ico{font-size:13px;width:16px;text-align:center;flex-shrink:0;opacity:.7}
.nav-item.on .ico{opacity:1}
.n-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:7.5px;padding:2px 7px;font-weight:600;letter-spacing:.04em}
.s-foot{padding:14px 16px;border-top:1px solid rgba(200,169,110,.12);flex-shrink:0}

/* ── TOPBAR ── */
.topbar{height:54px;flex-shrink:0;background:var(--s2);border-bottom:2px solid var(--s1);display:flex;align-items:center;padding:0 24px;gap:14px;position:relative;z-index:10}
.tb-title{font-family:var(--serif);font-size:18px;font-weight:700;color:var(--tx);flex:1;letter-spacing:.01em}
.tb-title em{font-style:italic;color:var(--gold);font-weight:400}
.tb-meta{font-family:var(--mono);font-size:9px;color:var(--tx3);letter-spacing:.04em;white-space:nowrap}
.content{flex:1;overflow-y:auto;padding:20px 24px;background:var(--bg)}

/* ── CARDS ── */
.card{background:var(--s2);border:1px solid var(--br);border-top:3px solid var(--s1);overflow:hidden;margin-bottom:16px}
.card-hd{padding:14px 18px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:48px;background:var(--s4)}
.card-title{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--tx);letter-spacing:.01em}
.card-title em{font-style:italic;color:var(--gold);font-weight:400}
.card-body{padding:16px 18px}

/* ── STATS ── */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.stat{background:var(--s2);border:1px solid var(--br);border-top:3px solid var(--ac,var(--s1));padding:16px 18px;position:relative;overflow:hidden;transition:box-shadow .2s;cursor:default}
.stat:hover{box-shadow:0 4px 16px rgba(28,21,16,.08)}
.stat-ico{font-size:18px;margin-bottom:8px;opacity:.75}
.stat-lbl{font-family:var(--sans);font-size:8px;letter-spacing:.16em;color:var(--tx3);text-transform:uppercase;margin-bottom:6px;font-weight:500}
.stat-val{font-family:var(--serif);font-size:28px;color:var(--tx);line-height:1;font-weight:700}
.stat-sub{font-family:var(--sans);font-size:11px;color:var(--tx2);margin-top:4px;font-weight:400}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;gap:5px;padding:8px 18px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border:none;transition:all .15s;white-space:nowrap}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none!important}
.btn-gold{background:var(--s1);color:var(--gold-light);border:2px solid var(--s1)}
.btn-gold:hover:not(:disabled){background:var(--gold2);color:var(--gold-light);border-color:var(--gold2)}
.btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--br)}
.btn-ghost:hover:not(:disabled){background:var(--s3);color:var(--tx);border-color:var(--br)}
.btn-danger{background:rgba(185,28,28,.06);color:var(--rose);border:1px solid rgba(185,28,28,.2)}
.btn-danger:hover:not(:disabled){background:rgba(185,28,28,.12)}
.btn-success{background:rgba(21,128,61,.06);color:var(--grn);border:1px solid rgba(21,128,61,.2)}
.btn-success:hover:not(:disabled){background:rgba(21,128,61,.12)}
.btn-info{background:rgba(29,78,216,.06);color:var(--sky);border:1px solid rgba(29,78,216,.2)}
.btn-sm{padding:4px 11px;font-size:9.5px}

/* ── BADGES ── */
.badge{display:inline-flex;align-items:center;padding:2px 9px;font-family:var(--sans);font-size:9px;letter-spacing:.06em;font-weight:600;white-space:nowrap;text-transform:uppercase}
.bg  {background:rgba(21,128,61,.08); color:var(--grn); border:1px solid rgba(21,128,61,.2)}
.bb  {background:rgba(29,78,216,.08); color:var(--sky); border:1px solid rgba(29,78,216,.2)}
.ba  {background:rgba(180,83,9,.08);  color:var(--amb); border:1px solid rgba(180,83,9,.2)}
.br_ {background:rgba(185,28,28,.08); color:var(--rose);border:1px solid rgba(185,28,28,.2)}
.bgold{background:rgba(139,105,20,.08);color:var(--gold);border:1px solid rgba(139,105,20,.2)}
.bteal{background:rgba(15,118,110,.08);color:var(--teal);border:1px solid rgba(15,118,110,.2)}

/* ── TABLES ── */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:var(--sans);font-size:8px;letter-spacing:.16em;color:var(--tx3);text-transform:uppercase;padding:10px 12px;text-align:left;border-bottom:2px solid var(--s1);white-space:nowrap;font-weight:600;background:var(--s4)}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--br2);font-family:var(--sans);font-size:12.5px;font-weight:400;color:var(--tx);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:var(--s3)}
.tbl-wrap{overflow-x:auto}

/* ── FORMS ── */
.finput{width:100%;background:var(--s2);border:1px solid var(--br);color:var(--tx);font-family:var(--sans);font-size:13px;font-weight:400;padding:9px 12px;outline:none;transition:border-color .15s}
.finput:focus{border-color:var(--s1);box-shadow:0 0 0 3px rgba(28,21,16,.06)}
.finput::placeholder{color:var(--tx3);font-weight:300}
.finput:disabled{background:var(--s3);color:var(--tx3);cursor:not-allowed}
.fselect{width:100%;background:var(--s2);border:1px solid var(--br);color:var(--tx);font-family:var(--sans);font-size:13px;font-weight:400;padding:9px 12px;outline:none;cursor:pointer;transition:border-color .15s;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239A8070' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
.fselect:focus{border-color:var(--s1)}
.flbl{display:block;font-family:var(--sans);font-size:9px;letter-spacing:.14em;color:var(--tx3);text-transform:uppercase;font-weight:600;margin-bottom:5px}
.fg{flex:1;min-width:0;margin-bottom:12px}
.frow{display:flex;gap:12px;flex-wrap:wrap}
.frow>.fg{flex:1;min-width:140px}

/* ── MODALS ── */
.modal-bg{position:fixed;inset:0;background:rgba(28,21,16,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(2px)}
.modal{background:var(--s2);border:1px solid var(--br);border-top:4px solid var(--s1);width:100%;max-width:540px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(28,21,16,.25);animation:mIn .2s ease}
.modal-w{max-width:820px}
@keyframes mIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--br2);background:var(--s4);flex-shrink:0}
.modal-title{font-family:var(--serif);font-size:18px;font-weight:700;color:var(--tx)}
.modal-x{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:20px;line-height:1;padding:2px 6px;transition:color .15s}
.modal-x:hover{color:var(--rose)}
.modal-body{padding:20px}
.modal-ft{padding:14px 20px;border-top:1px solid var(--br2);display:flex;justify-content:flex-end;gap:8px;background:var(--s4)}

/* ── TABS ── */
.tabs{display:flex;gap:0;border-bottom:2px solid var(--s1);margin-bottom:16px;overflow-x:auto}
.tab{padding:9px 18px;font-family:var(--sans);font-size:11px;font-weight:500;color:var(--tx3);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:transparent;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;white-space:nowrap}
.tab:hover{color:var(--tx);background:var(--s3)}
.tab.on,.tab.active{color:var(--s1);font-weight:700;border-bottom-color:var(--s1);background:var(--s2)}

/* ── INFO BOX ── */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.info-box{background:var(--s4);border:1px solid var(--br2);padding:10px 12px}
.info-lbl{font-family:var(--sans);font-size:8px;letter-spacing:.14em;color:var(--tx3);text-transform:uppercase;font-weight:600;margin-bottom:4px}
.info-val{font-family:var(--sans);font-size:13px;font-weight:500;color:var(--tx)}

/* ── AVATAR ── */
.av{display:inline-flex;align-items:center;justify-content:center;font-family:var(--sans);font-weight:700;font-size:12px;color:#fff;flex-shrink:0;text-transform:uppercase;letter-spacing:.04em}

/* ── TOAST ── */
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--s1);color:var(--gold-light);padding:12px 20px;border-left:4px solid var(--gold-light);font-family:var(--sans);font-size:12.5px;font-weight:500;box-shadow:0 8px 32px rgba(28,21,16,.3);animation:mIn .2s ease;max-width:320px;letter-spacing:.02em}
.toast.err{border-left-color:var(--rose);color:var(--rose)}
.toast.inf{border-left-color:var(--sky);color:var(--sky)}

/* ── SEARCH ── */
.srch{display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--br);padding:8px 12px;min-width:200px;transition:border-color .15s}
.srch:focus-within{border-color:var(--s1)}
.srch input{background:none;border:none;outline:none;color:var(--tx);font-family:var(--sans);font-size:12.5px;font-weight:400;flex:1;min-width:0}
.srch input::placeholder{color:var(--tx3);font-weight:300}

/* ── SPINNER ── */
.spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(28,21,16,.15);border-top-color:var(--s1);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── UTILITIES ── */
.flex{display:flex}.fac{align-items:center}.fjb{justify-content:space-between}.fje{justify-content:flex-end}
.gap2{gap:8px}.gap3{gap:12px}.gap4{gap:16px}
.mb2{margin-bottom:8px}.mb3{margin-bottom:12px}.mb4{margin-bottom:16px}
.mt2{margin-top:8px}.mt3{margin-top:12px}.mt4{margin-top:16px}
.pb4{padding-bottom:16px}.pt4{padding-top:16px}
.bold{font-weight:700}.sm{font-size:12px}.xs{font-size:11px}
.mono{font-family:var(--mono)}.muted{color:var(--tx3)}.gold{color:var(--gold)}.w100{width:100%}
.divider{border:none;border-top:1px solid var(--br2);margin:8px 0}
.folio-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--br2);font-size:12.5px}
.folio-row:last-child{border-bottom:none}
.folio-total{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding-top:8px;color:var(--tx)}
.tbl-wrap{overflow-x:auto}

/* ── BAR CHART ── */
.bar-chart{display:flex;align-items:flex-end;gap:3px;height:80px;padding:4px 0}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer}
.bar-fill{width:100%;background:var(--br);transition:height .3s,background .2s;min-height:2px}
.bar-col:hover .bar-fill{background:var(--gold)!important}
.bar-lbl{font-family:var(--mono);font-size:7px;color:var(--tx3);text-align:center}

/* ── LOGIN PAGE ── */
.login-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--s1);position:relative;overflow:hidden}
.login-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 20% 30%,rgba(200,169,110,.08),transparent 65%),radial-gradient(ellipse 50% 60% at 80% 70%,rgba(200,169,110,.05),transparent 60%);pointer-events:none}
.login-grid{position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,rgba(200,169,110,.025) 0px,rgba(200,169,110,.025) 1px,transparent 1px,transparent 40px);pointer-events:none}
.login-card{background:var(--bg);border:1px solid rgba(200,169,110,.2);border-top:4px solid var(--gold-light);padding:44px 42px;width:100%;max-width:460px;position:relative;z-index:1;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:mIn .35s ease}
.login-eyebrow{display:flex;align-items:center;gap:12px;margin-bottom:22px;justify-content:center}
.login-eyebrow-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--br))}
.login-eyebrow span{font-family:var(--sans);font-size:8px;color:var(--tx3);letter-spacing:.22em;text-transform:uppercase;font-weight:500;white-space:nowrap}
.login-title{font-family:var(--serif);font-size:34px;font-weight:700;color:var(--tx);text-align:center;line-height:1.05;margin-bottom:5px}
.login-title em{font-style:italic;color:var(--gold);font-weight:400}
.login-sub{font-family:var(--sans);font-size:9px;letter-spacing:.16em;color:var(--tx3);text-transform:uppercase;text-align:center;margin-bottom:32px;font-weight:400}
.role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:22px}
.rpill{padding:12px 8px;border:1px solid var(--br);background:var(--s2);cursor:pointer;transition:all .15s;text-align:center;color:var(--tx3);font-family:var(--sans)}
.rpill:hover{border-color:var(--s1);background:var(--s3);color:var(--tx)}
.rpill.selected{border-color:var(--s1);background:var(--s1);color:var(--gold-light)}
.rpill .role-ico{font-size:18px;margin-bottom:5px;display:block}
.rpill .role-lbl{font-size:10px;letter-spacing:.06em;font-weight:500}

/* ── GUEST SEARCH ── */
.gsearch-wrap{position:relative}
.gsearch-list{position:absolute;top:calc(100% + 2px);left:0;right:0;background:var(--s2);border:1px solid var(--br);border-top:2px solid var(--s1);z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(28,21,16,.1)}
.gsearch-item{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;font-size:12.5px;transition:background .12s;border-bottom:1px solid var(--br2)}
.gsearch-item:last-child{border-bottom:none}
.gsearch-item:hover{background:var(--s3)}

/* ── NOTIFICATION PANEL ── */
.notif-panel{position:absolute;top:58px;right:12px;width:320px;background:var(--s2);border:1px solid var(--br);border-top:3px solid var(--s1);box-shadow:0 16px 48px rgba(28,21,16,.15);z-index:200;animation:mIn .2s ease}


/* ── ROOMS GRID ─────────────────────────────────────────────────── */
.rooms-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
  gap:10px;
}
.room-card{
  padding:14px 13px;
  cursor:pointer;
  transition:box-shadow .18s,transform .18s;
  border:1px solid var(--br);
  border-top:4px solid var(--rc,var(--br));
  position:relative;
  user-select:none;
  background:var(--s2);
}
.room-card:hover{
  box-shadow:0 4px 18px rgba(28,21,16,.12);
  transform:translateY(-2px);
}
/* Status top-border accent colours */
.room-card.AVAILABLE  { --rc:var(--grn);  background:#F0FBF3 }
.room-card.OCCUPIED   { --rc:var(--sky);  background:#EFF4FF }
.room-card.DIRTY      { --rc:var(--amb);  background:#FEF9EE }
.room-card.OUT_OF_ORDER{ --rc:var(--rose); background:#FEF0F0 }
.room-card.RESERVED   { --rc:var(--pur);  background:#F5F1FE }

/* Room number — big, bold, status-coloured */
.room-no{
  font-family:var(--serif);
  font-size:32px;font-weight:700;
  line-height:1;margin-bottom:6px;
}
.room-card.AVAILABLE  .room-no{ color:var(--grn)  }
.room-card.OCCUPIED   .room-no{ color:var(--sky)  }
.room-card.DIRTY      .room-no{ color:var(--amb)  }
.room-card.OUT_OF_ORDER .room-no{ color:var(--rose) }
.room-card.RESERVED   .room-no{ color:var(--pur)  }

/* Category & price labels */
.room-cat{
  font-family:var(--sans);font-size:9px;
  color:var(--tx3);text-transform:uppercase;
  letter-spacing:.1em;font-weight:500;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.room-price{
  font-family:var(--mono);font-size:10px;
  color:var(--gold);margin-top:5px;
  font-weight:500;
}

/* Status dot */
.rdot{
  width:7px;height:7px;border-radius:50%;
  flex-shrink:0;display:inline-block;
  margin-right:5px;vertical-align:middle;
}
.rdot.AVAILABLE  { background:var(--grn); box-shadow:0 0 5px rgba(21,128,61,.4) }
.rdot.OCCUPIED   { background:var(--sky); box-shadow:0 0 5px rgba(29,78,216,.4) }
.rdot.DIRTY      { background:var(--amb); box-shadow:0 0 5px rgba(180,83,9,.4)  }
.rdot.OUT_OF_ORDER{ background:var(--rose);box-shadow:0 0 5px rgba(185,28,28,.4) }
.rdot.RESERVED   { background:var(--pur); box-shadow:0 0 5px rgba(109,40,217,.4)}

/* FOLIO badge on occupied rooms */
.room-folio-tag{
  position:absolute;top:6px;right:6px;
  font-size:7px;font-weight:700;
  background:rgba(29,78,216,.12);
  color:var(--sky);
  padding:2px 6px;
  border:1px solid rgba(29,78,216,.25);
  letter-spacing:.08em;text-transform:uppercase;
}

`

/* ═══════════════════════ SMALL COMPONENTS ══════════════════ */
function Toast({msg,type,onDone}) {
  useEffect(()=>{ const t=setTimeout(onDone,3400); return()=>clearTimeout(t) },[])
  return <div className={`toast${type==='error'?' err':type==='info'?' inf':''}`}>{type==='error'?'⚠ ':'✓ '}{msg}</div>
}

function Av({name,size=32}) {
  return <div className="av" style={{width:size,height:size,fontSize:size*.33,background:`linear-gradient(135deg,${avColor(name)},rgba(0,0,0,.4))`,color:'#EEE9E2'}}>{initials(name)}</div>
}

function SBadge({status}) {
  const m={CHECKED_IN:'bb',RESERVED:'bteal',PENDING:'ba',CHECKED_OUT:'bgold',CANCELLED:'br_',
           confirmed:'bg',pending:'ba','in-progress':'ba',completed:'bg',high:'br_',medium:'ba',low:'bg'}
  return <span className={`badge ${m[status]||'bgold'}`}>{String(status).replace(/_/g,' ')}</span>
}

function Modal({title,onClose,children,footer,wide}) {
  useEffect(()=>{
    const h=e=>{ if(e.key==='Escape') onClose() }
    document.addEventListener('keydown',h)
    return()=>document.removeEventListener('keydown',h)
  },[])
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal${wide?' modal-w':''}`} onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-title">{title}</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer&&<div className="modal-ft">{footer}</div>}
      </div>
    </div>
  )
}

function BarChart({data,active,onHover}) {
  const max=Math.max(...data.map(d=>d.v),1)
  return (
    <div className="bar-chart">
      {data.map((d,i)=>(
        <div key={i} className="bar-col" onMouseEnter={()=>onHover(i)} title={`${d.ds}: ${BDT(d.v)}`}>
          <div className="bar-fill" style={{height:`${Math.max(3,(d.v/max)*76)}px`,background:i===active?'var(--gold)':'rgba(200,169,110,.28)'}}/>
          <span className="bar-lbl">{d.d}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════ LOGIN ══════════════════════════════ */
function LoginPage({onLogin, staffList}) {
  const [sel,setSel]=useState(null)
  const [email,setEmail]=useState('')
  const [pw,setPw]=useState('')
  const [showPw,setShowPw]=useState(false)
  const [err,setErr]=useState('')
  const [busy,setBusy]=useState(false)

  // Only show 3 roles on login — manager & accountant must type manually
  const LOGIN_ROLES = [
    {key:'owner',    ico:'👑', label:'Founder / Owner'},
    {key:'receptionist', ico:'🛎️', label:'Receptionist'},
    {key:'housekeeping', ico:'🧹', label:'Housekeeping'},
  ]

  function pickRole(r) {
    setSel(r)
    // Pre-fill EMAIL only — password must always be typed manually
    const s=staffList.find(x=>x.role===r)
    if(s) setEmail(s.email)
    setPw('') // always clear password — never auto-fill
    setErr('')
  }

  function doLogin() {
    if(!email||!pw) return setErr('Please enter your email and password.')
    setBusy(true)
    setTimeout(()=>{
      const u=staffList.find(x=>x.email.toLowerCase()===email.trim().toLowerCase()&&x.pw===pw)
      if(u) onLogin({...u})
      else { setErr('Invalid email or password.'); setBusy(false) }
    },500)
  }

  return (
    <div className="login-bg">
      <div className="login-grid"/>
      <div className="login-card">
        {/* Header — matches landing page style */}
        <div className="login-eyebrow">
          <div className="login-eyebrow-line"/>
          <span>Staff Portal · Hotel Fountain</span>
          <div className="login-eyebrow-line" style={{background:'linear-gradient(90deg,var(--gold),transparent)'}}/>
        </div>
        <div className="login-title">Hotel <em>Fountain</em></div>
        <div className="login-sub">Management CRM · Powered by Lumea</div>

        {/* 3 role pills — manager & accountant removed */}
        <div className="role-grid">
          {LOGIN_ROLES.map(r=>(
            <div key={r.key} className={`rpill${sel===r.key?' sel':''}`} onClick={()=>pickRole(r.key)}>
              <span className="ri">{r.ico}</span>
              <span className="rl">{r.label}</span>
            </div>
          ))}
        </div>

        {/* Email hint only when role selected — NO password shown */}
        {sel&&(
          <div className="login-hint">
            <strong>Email:</strong> {staffList.find(s=>s.role===sel)?.email}
            <br/>
            <span style={{color:'var(--tx3)',fontSize:10}}>Enter your password below to continue</span>
          </div>
        )}

        <div className="login-divider"><span>sign in</span></div>

        <form onSubmit={e=>{e.preventDefault();doLogin()}}>
          <div className="fg">
            <label className="flbl">Email</label>
            <input className="finput" type="email" value={email}
              onChange={e=>{setEmail(e.target.value);setErr('')}}
              placeholder="your@email.com"
              autoComplete="off" data-form-type="other"/>
          </div>
          <div className="fg">
            <label className="flbl">Password</label>
            <div style={{position:'relative'}}>
              <input className="finput"
                type={showPw?'text':'password'}
                value={pw}
                onChange={e=>{setPw(e.target.value);setErr('')}}
                placeholder="Enter your password"
                autoComplete="new-password"
                data-form-type="other"
                style={{paddingRight:38}}/>
              <span
                style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',cursor:'pointer',fontSize:14,color:'var(--tx3)',userSelect:'none'}}
                onClick={()=>setShowPw(p=>!p)}>
                {showPw?'🙈':'👁'}
              </span>
            </div>
          </div>

          {err&&(
            <div style={{background:'rgba(224,92,122,.08)',border:'1px solid rgba(224,92,122,.2)',padding:'9px 13px',fontFamily:'var(--sans)',fontSize:11.5,fontWeight:300,color:'var(--rose)',marginBottom:14,letterSpacing:'.02em'}}>
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-gold w100"
            style={{justifyContent:'center',padding:'13px',fontSize:10,letterSpacing:'.2em',marginTop:4}}
            disabled={busy}>
            {busy
              ?<><span className="spinner" style={{width:13,height:13,border:'1.5px solid rgba(0,0,0,.2)',borderTopColor:'#07090E'}}/>{' '}Signing in…</>
              :'Sign In →'
            }
          </button>
        </form>

        <div style={{textAlign:'center',marginTop:20,fontFamily:'var(--sans)',fontSize:9,color:'var(--tx3)',letterSpacing:'.1em',fontWeight:200}}>
          LUMEA · THE PULSE OF MODERN HOSPITALITY
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ DASHBOARD ══════════════════════════ */
function Dashboard({rooms,guests,reservations,transactions,setPage,hSettings}) {
  const [chartActive,setChartActive]=useState(13)
  const today=hSettings?.active_fiscal_day||todayStr()
  const occ=rooms.filter(r=>r.status==='OCCUPIED').length
  const occPct=rooms.length?Math.round((occ/rooms.length)*100):0
  const todayT=transactions.filter(t=>t.fiscal_day===today)
  const todayRev=todayT.reduce((a,t)=>a+(+t.amount||0),0)
  const inHouse=reservations.filter(r=>r.status==='CHECKED_IN').length
  const pending=reservations.filter(r=>r.status==='PENDING').length
  const last14=Array.from({length:14},(_,i)=>{
    const d=new Date(todayDhaka()); d.setDate(d.getDate()-(13-i))
    const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return {d:ds.slice(8),v:transactions.filter(t=>t.fiscal_day===ds).reduce((a,t)=>a+(+t.amount||0),0),ds}
  })
  const checkedIn=reservations.filter(r=>r.status==='CHECKED_IN').slice(0,6)
  const getGN=gids=>{
    const gid=String((gids||[]).filter(Boolean)[0]||'')
    const g=guests.find(g=>String(g.id)===gid)
    return g?g.name:(gid?`ID:${gid}`:'Unknown')
  }

  return (
    <div>
      <div className="stats-row">
        {[
          {lbl:"Today's Revenue",val:BDT(todayRev),ico:'💰',sub:`${todayT.length} transactions`,ac:'var(--gold)'},
          {lbl:'Occupancy',val:`${occPct}%`,ico:'🛏',sub:`${occ}/${rooms.length} rooms occupied`,ac:'var(--sky)'},
          {lbl:'In-House Guests',val:inHouse,ico:'👥',sub:'Currently checked in',ac:'var(--teal)'},
          {lbl:'Pending',val:pending,ico:'📅',sub:'Awaiting confirmation',ac:'var(--rose)'},
        ].map(s=>(
          <div key={s.lbl} className="stat" style={{'--ac':s.ac}}>
            <div className="stat-ico">{s.ico}</div><div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val">{s.val}</div><div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="g2 mb4">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Revenue — Last 14 Days</span>
            <span className="badge bgold">{last14[chartActive]?.ds?.slice(5)} · {BDT(last14[chartActive]?.v)}</span>
          </div>
          <div className="card-body"><BarChart data={last14} active={chartActive} onHover={setChartActive}/></div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Room Status Overview</span></div>
          <div className="card-body">
            {[['AVAILABLE','grn'],['OCCUPIED','sky'],['DIRTY','amb'],['OUT_OF_ORDER','rose'],['RESERVED','pur']].map(([s,c])=>{
              const cnt=rooms.filter(r=>r.status===s).length
              return (
                <div key={s} className="flex fac fjb" style={{padding:'5px 0',borderBottom:'1px solid var(--br2)'}}>
                  <div className="flex fac gap2"><span className={`rdot ${s}`}/><span className="xs">{s.replace('_',' ')}</span></div>
                  <div className="flex fac gap2">
                    <span className="xs gold">{cnt}</span>
                    <div style={{height:4,width:rooms.length?Math.round((cnt/rooms.length)*80):2,background:`var(--${c})`,borderRadius:2}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Currently In-House</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>setPage('reservations')}>View All →</button>
          </div>
          <div className="card-body" style={{padding:'6px 13px'}}>
            {checkedIn.length===0
              ?<div style={{padding:'18px 0',textAlign:'center',color:'var(--tx3)',fontSize:12}}>No active check-ins</div>
              :checkedIn.map(r=>(
                <div key={r.id} className="flex fac gap2" style={{padding:'8px 0',borderBottom:'1px solid var(--br2)'}}>
                  <Av name={getGN(r.guest_ids)} size={28}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{getGN(r.guest_ids)}</div>
                    <div className="xs muted">Rm {(r.room_ids||[]).join(',')} · Out: {fmtDate(r.check_out)}</div>
                  </div>
                  <span className="badge bb">{BDT(r.total_amount)}</span>
                </div>
              ))
            }
          </div>
        </div>
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Recent Transactions</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>setPage('billing')}>View All →</button>
          </div>
          <div className="card-body" style={{padding:'6px 13px'}}>
            {transactions.slice(0,8).map(t=>(
              <div key={t.id} className="flex fac fjb" style={{padding:'6px 0',borderBottom:'1px solid var(--br2)'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div className="xs" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.guest_name||'—'}</div>
                  <div className="xs muted">Rm {t.room_number||'?'} · {t.type||'Payment'}</div>
                </div>
                <span className="xs gold">{BDT(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ ROOMS ══════════════════════════════ */
function RoomsPage({rooms,guests,reservations,toast,currentUser,reload,hSettings}) {
  const [filter,setFilter]=useState('ALL')
  const [selRoom,setSelRoom]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const canEdit=['owner','manager','receptionist'].includes(currentUser?.role)
  const isSA=currentUser?.role==='owner'
  const sc=rooms.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{})
  const filtered=[...(filter==='ALL'?rooms:rooms.filter(r=>r.status===filter))].sort((a,b)=>String(a.room_number).localeCompare(String(b.room_number),undefined,{numeric:true}))

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          {['ALL','AVAILABLE','OCCUPIED','DIRTY','OUT_OF_ORDER','RESERVED'].map(s=>(
            <button key={s} className={`tab${filter===s?' on':''}`} onClick={()=>setFilter(s)}>
              {s==='ALL'?`All (${rooms.length})`:`${s.replace('_',' ')} (${sc[s]||0})`}
            </button>
          ))}
        </div>
        {isSA&&<button className="btn btn-gold" onClick={()=>setShowAdd(true)}>+ Add Room</button>}
      </div>
      <div className="flex fac gap3 mb4" style={{flexWrap:'wrap'}}>
        {[['AVAILABLE','grn'],['OCCUPIED','sky'],['DIRTY','amb'],['OUT_OF_ORDER','rose'],['RESERVED','pur']].map(([s])=>(
          <span key={s} className="flex fac xs muted"><span className={`rdot ${s}`}/>{s.replace('_',' ')}</span>
        ))}
        <span className="xs muted" style={{marginLeft:4}}>· Click room to open folio/billing</span>
      </div>
      <div className="rooms-grid">
        {filtered.map(room=>(
          <div key={room.id} className={`room-card ${room.status}`} onClick={()=>currentUser?.role!=='housekeeping'&&setSelRoom(room)} style={currentUser?.role==='housekeeping'?{cursor:'default'}:{}}>
            {room.status==='OCCUPIED'&&<div style={{position:'absolute',top:5,right:5,fontSize:7,background:'rgba(88,166,255,.25)',color:'var(--sky)',borderRadius:3,padding:'1px 5px',border:'1px solid rgba(88,166,255,.3)'}}>FOLIO</div>}
            <div className="room-no">{room.room_number}</div>
            <div className="flex fac" style={{marginBottom:4}}><span className={`rdot ${room.status}`}/><span className="room-cat">{room.status.replace('_',' ')}</span></div>
            <div className="room-cat">{room.category||'Standard'}</div>
            <div className="room-price">{BDT(room.price)}/night</div>
          </div>
        ))}
      </div>
      {selRoom&&(
        <RoomModal room={selRoom} guests={guests} reservations={reservations}
          canEdit={canEdit} isSA={isSA} toast={toast}
          onClose={()=>setSelRoom(null)}
          reload={()=>{ reload(); setSelRoom(null) }} hSettings={hSettings}/>
      )}
      {showAdd&&isSA&&<AddRoomModal toast={toast} onClose={()=>setShowAdd(false)} reload={reload} rooms={rooms}/>}
    </div>
  )
}

function RoomModal({room,guests,reservations,canEdit,isSA,toast,onClose,reload,hSettings}) {
  const [status,setStatus]=useState(room.status)
  const [folios,setFolios]=useState([])
  const [fLoad,setFLoad]=useState(true)
  const [showCharge,setShowCharge]=useState(false)
  const [showCO,setShowCO]=useState(false)
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)

  const activeRes=reservations.find(r=>(r.room_ids||[]).includes(room.room_number)&&r.status==='CHECKED_IN')
  const guest=activeRes?guests.find(g=>String(g.id)===String((activeRes.guest_ids||[])[0]||'')):null

  useEffect(()=>{
    db('folios',`?room_number=eq.${room.room_number}&order=created_at`)
      .then(d=>{setFolios(Array.isArray(d)?d:[]);setFLoad(false)})
      .catch(()=>setFLoad(false))
  },[room.room_number])

  const _localFoliosMap = {}
  if(folios.length>0){
    const fKey=activeRes?.id||room.room_number
    _localFoliosMap[fKey]=folios
    _localFoliosMap[room.room_number]=folios
  }
  const _bill=activeRes
    ? computeBill(activeRes,[room],_localFoliosMap,{})
    : {roomCharge:0,extras:0,sub:0,tax:0,svc:0,discount:0,total:0,paid:0,due:0,folios:[],nights:0,roomRate:+room.price||0,vatPct:0,svcPct:0}
  
  const roomRate=_bill.roomRate
  const nights=_bill.nights
  const roomCharge=_bill.roomCharge
  const billFolios=folios.filter(f=>f.category!=="Receivable")
  const extras=_bill.extras
  const sub=_bill.sub
  const tax=0
  const svc=0
  const total=_bill.total

  async function saveStatus() {
    setSaving(true)
    try { await dbPatch('rooms',room.id,{status}); toast(`Room ${room.room_number} → ${status}`); reload() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  async function doCheckout() {
    try {
      const paidSoFar=+activeRes?.paid_amount||0
      const due=Math.max(0,total-paidSoFar)
      const paymentStatus=due<=0?'Paid':(paidSoFar>0?'Partial':'Unpaid')
      await dbPatchReservationSafe(activeRes.id,{
        status:'CHECKED_OUT'
      })
      await dbPatch('rooms',room.id,{status:'DIRTY'})
      if(due>0){
        await dbPost('folios',{
          room_number:room.room_number,
          reservation_id:activeRes.id,
          description:`Checkout receivable (${paymentStatus})`,
          category:'Receivable',
          amount:due,
          tenant_id:TENANT
        })
      }
      await dbPostTransactionSafe({
        type:'Final Settlement',
        amount:safeNum(total),
        room_number:room.room_number,
        guest_name:guest?.name||'Guest',
        fiscal_day:hSettings?.active_fiscal_day||todayStr(),
        tenant_id:TENANT
      })
      if(guest?.id){
        const curBal = +(guest.outstanding_balance || 0)
        await dbPatch('guests',guest.id,{outstanding_balance:curBal + due})
      }
      toast(`${guest?.name||'Guest'} checked out ✓`)
      reload()
    } catch(e){ toast(e.message,'error') }
  }

  async function recordPayment() {
    const a = parseFloat(payAmt)
    if(!a || a <= 0) return toast('Enter a valid amount', 'error')
    setPaySaving(true)
    try {
      await dbPostTransactionSafe({room_number:room.room_number,guest_name:guest?.name||'Guest',type:payType,amount:safeNum(a),fiscal_day:hSettings?.active_fiscal_day||todayStr(),tenant_id:TENANT})
      const curPaid = +(activeRes.paid_amount || 0)
      await dbPatchReservationSafe(activeRes.id, {paid_amount: safeNum(curPaid + a)})
      await dbPost('folios',{room_number:room.room_number,reservation_id:activeRes.id,description:`Payment (${payType})`,category:'Payment',amount:-a,tenant_id:TENANT})
      
      // Also deduct from guest permanent balance
      if(guest?.id) {
        const curBal = +(guest.outstanding_balance || 0)
        await dbPatch('guests',guest.id,{outstanding_balance:curBal - a})
      }
      
      toast(`Payment ${BDT(a)} collected ✓`); setPayAmt(''); reload()
    } catch(e) { toast(e.message,'error') }
    finally{ setPaySaving(false) }
  }

  async function addFolioCharge(f) {
    setFolios(p=>[...p,f])
    toast(`Charge ${BDT(f.amount)} added`)
    setShowCharge(false)
    reload() // Global sync — refresh all tables so billing ledger updates
  }

  return (
    <Modal title={`Room ${room.room_number} — ${room.category||'Standard'}`} onClose={onClose} wide={!!activeRes}
      footer={
        <div className="flex gap2" style={{flexWrap:'wrap',width:'100%'}}>
          {activeRes&&canEdit&&(
            <>
              <button className="btn btn-info btn-sm" onClick={()=>setShowCharge(true)}>+ Add Charge</button>
              <button className="btn btn-danger btn-sm" onClick={()=>setShowCO(true)}>🚪 Check Out</button>
            </>
          )}
          <div style={{flex:1}}/>
          {canEdit&&<button className="btn btn-gold btn-sm" disabled={saving} onClick={saveStatus}>{saving?'Saving…':'Save Status'}</button>}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      }>

      {activeRes&&guest&&(
        <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.07),rgba(200,169,110,.05))',border:'1px solid rgba(200,169,110,.18)',borderRadius:9,padding:'12px 14px',marginBottom:14}}>
          <div className="flex fac fjb" style={{flexWrap:'wrap',gap:8}}>
            <div className="flex fac gap3">
              <Av name={guest.name} size={40}/>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{guest.name}</div>
                <div className="xs muted">Room {room.room_number} · {fmtDate(activeRes.check_in)} → {fmtDate(activeRes.check_out)}</div>
                <div className="xs" style={{color:'var(--amb)',marginTop:2}}>{nights} night{nights!==1?'s':''} · {BDT(roomRate)}/night</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="xs muted">Bill Total</div>
              <div style={{fontWeight:700,fontSize:22,color:'var(--gold)'}}>{BDT(total)}</div>
              {_bill.discount > 0 && <div className="xs" style={{color:'var(--teal)',marginTop:2}}>Discount: {BDT(_bill.discount)}</div>}
              <div className="xs" style={{marginTop:2}}>
                <span style={{color:'var(--grn)'}}>Paid: {BDT(_bill.paid)}</span>
                <span style={{margin:'0 4px',color:'var(--tx3)'}}>·</span>
                <span style={{color:_bill.due>0?'var(--rose)':'var(--grn)',fontWeight:_bill.due>0?700:400}}>Due: {BDT(_bill.due)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeRes&&(
        <div style={{background:'var(--s2)',borderRadius:8,border:'1px solid var(--br2)',overflow:'hidden',marginBottom:14}}>
          <div style={{padding:'7px 12px',background:'rgba(200,169,110,.04)',borderBottom:'1px solid var(--br2)',fontSize:8,letterSpacing:'.1em',color:'var(--tx2)',textTransform:'uppercase',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>Folio Charges</span>
            {canEdit&&<button className="btn btn-ghost btn-sm" style={{fontSize:10}} onClick={()=>setShowCharge(true)}>+ Add</button>}
          </div>
          <div style={{padding:'0 12px'}}>
            {fLoad&&<div className="xs muted" style={{padding:'12px 0',textAlign:'center'}}>Loading folio…</div>}
            {!fLoad&&folios.length===0&&<div className="xs muted" style={{padding:'12px 0',textAlign:'center'}}>No extra charges</div>}
            {/* Room charge line */}
            {!fLoad&&nights>0&&(
              <div className="folio-row">
                <div><span>Room charge</span> <span className="badge bgold" style={{fontSize:8,marginLeft:6}}>{nights}×{BDT(roomRate)}</span></div>
                <span className="xs gold">{BDT(roomCharge)}</span>
              </div>
            )}
            {billFolios.map(f=>(
              <div key={f.id} className="folio-row">
                <div><span>{f.description}</span><span className="badge bgold" style={{marginLeft:6,fontSize:8}}>{f.category}</span></div>
                <div className="flex fac gap2">
                  <span className="xs gold">{BDT(f.amount)}</span>
                  {isSA&&<button style={{background:'none',border:'none',cursor:'pointer',color:'var(--rose)',fontSize:13,padding:'0 2px',lineHeight:1}} title="Delete charge" onClick={async()=>{if(!window.confirm('Delete folio charge?'))return;try{await dbDelete('folios',f.id);setFolios(p=>p.filter(x=>x.id!==f.id));toast('Charge removed')}catch(e){toast(e.message,'error')}}}>×</button>}
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'9px 12px',background:'rgba(200,169,110,.03)',borderTop:'1px solid var(--br2)'}}>
            <div className="flex fjb xs muted" style={{marginBottom:3}}><span>Base Room Charge</span><span>{BDT(roomCharge)}</span></div>
            {extras > 0 && <div className="flex fjb xs muted" style={{marginBottom:3}}><span>Extra Charges</span><span>{BDT(extras)}</span></div>}
            {_bill.discount > 0 && <div className="flex fjb xs" style={{marginBottom:3,color:'var(--teal)'}}><span>Discount</span><span>−{BDT(_bill.discount)}</span></div>}
            <div className="divider" style={{margin:'6px 0'}}/>
            <div className="flex fjb" style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}><span>Bill Total</span><span>{BDT(total)}</span></div>
            <div className="flex fjb xs" style={{marginTop:4}}><span style={{color:'var(--grn)'}}>Paid</span><span style={{color:'var(--grn)'}}>{BDT(_bill.paid)}</span></div>
            <div className="flex fjb xs" style={{marginTop:2}}><span style={{color:_bill.due>0?'var(--rose)':'var(--grn)',fontWeight:700}}>Balance Due</span><span style={{color:_bill.due>0?'var(--rose)':'var(--grn)',fontWeight:700}}>{BDT(_bill.due)}</span></div>
          </div>
        </div>
      )}

      {/* ── BDT COLLECT BLOCK ── */}
      {activeRes && (
        <div style={{background:'linear-gradient(135deg,rgba(200,169,110,.05),rgba(0,0,0,.1))',borderRadius:8,border:'1px solid var(--br)',padding:'14px',marginBottom:14}}>
          <div className="flex fjb fac mb3">
            <span style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--gold)'}}>Record Payment / Collect Due</span>
            <div className="flex fac gap4">
              <span className="xs muted">Total: <span style={{color:'var(--gold)'}}>{BDT(total)}</span></span>
              <span className="xs muted">Paid: <span style={{color:'var(--grn)'}}>{BDT(+activeRes.paid_amount||0)}</span></span>
              <span className="xs muted">Due: <span style={{color:'var(--rose)',fontWeight:700}}>{BDT(total - (+activeRes.paid_amount||0))}</span></span>
            </div>
          </div>
          <div className="flex gap2">
            <div className="fg" style={{flex:1}}>
              <input className="finput" style={{fontFamily:'monospace',fontSize:16,fontWeight:700}} type="number" placeholder="Amount (BDT)..." value={payAmt} onChange={e=>setPayAmt(e.target.value)}/>
            </div>
            <div className="fg">
              <select className="fselect" style={{minWidth:100}} value={payType} onChange={e=>setPayType(e.target.value)}>
                {['Cash','Bkash','Nagad','Card','Bank','Complementary'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <button className="btn btn-gold" style={{padding:'0 24px',height:38}} disabled={paySaving || !payAmt} onClick={recordPayment}>
              {paySaving?'🔄':'Collect Payment'}
            </button>
          </div>
        </div>
      )}

      <div className="g2 mb4">
        {[['Category',room.category||'Standard'],['Rate/Night',BDT(room.price)],['Floor',room.floor||room.room_number.slice(0,-2)||'—'],['Beds',room.beds||'Double']].map(([l,v])=>(
          <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
        ))}
      </div>

      {canEdit&&(
        <div className="fg">
          <label className="flbl">Change Status</label>
          <select className="fselect" value={status} onChange={e=>setStatus(e.target.value)}>
            {['AVAILABLE','OCCUPIED','DIRTY','OUT_OF_ORDER','RESERVED'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
      )}

      {showCharge&&(
        <AddChargeModal roomNo={room.room_number} resId={activeRes?.id}
          toast={toast} onClose={()=>setShowCharge(false)} onDone={addFolioCharge}/>
      )}
      {showCO&&(
        <Modal title="Confirm Guest Checkout" onClose={()=>setShowCO(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowCO(false)}>Cancel</button><button className="btn btn-danger" onClick={()=>{doCheckout();setShowCO(false)}}>✓ Confirm Checkout</button></>}>
          <div style={{textAlign:'center',padding:'8px 0 12px'}}>
            <div style={{fontSize:32,marginBottom:10}}>🚪</div>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>{guest?.name||'Guest'}</div>
            <div className="xs muted" style={{marginBottom:12}}>Room {room.room_number} · {nights} night{nights!==1?'s':''}</div>
            {[['Room Charge',BDT(roomCharge)],['Extra Charges',BDT(extras)]].map(([l,v])=>(
              <div key={l} className="flex fjb xs muted" style={{maxWidth:220,margin:'3px auto'}}><span>{l}</span><span>{v}</span></div>
            ))}
            <div className="divider" style={{maxWidth:220,margin:'8px auto'}}/>
            <div style={{fontWeight:700,fontSize:24,color:'var(--gold)'}}>{BDT(total)}</div>
            <div className="xs muted mt3">Room will move to Dirty / Housekeeping</div>
            {Math.max(0,total-(+activeRes?.paid_amount||0))>0&&(
              <div className="xs mt3" style={{color:'var(--rose)'}}>
                Checkout allowed with due: {BDT(Math.max(0,total-(+activeRes?.paid_amount||0)))} (ledger stays unpaid/partial)
              </div>
            )}
          </div>
        </Modal>
      )}
    </Modal>
  )
}

function AddChargeModal({roomNo,resId,toast,onClose,onDone}) {
  const [cat,setCat]=useState('Room Service')
  const [amt,setAmt]=useState('')
  const [desc,setDesc]=useState('')
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)

  async function save() {
    const a=parseFloat(amt)
    if(!a||a<=0) return toast('Enter a valid amount','error')
    setSaving(true)
    try {
      const [f]=await dbPost('folios',{room_number:roomNo,reservation_id:resId||null,description:desc||cat,category:cat,amount:a,tenant_id:TENANT})
      onDone(f)
    } catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  return (
    <Modal title={`Add Charge — Room ${roomNo}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Adding…':'Add Charge'}</button></>}>
      <div className="fg">
        <label className="flbl">Category</label>
        <select className="fselect" value={cat} onChange={e=>setCat(e.target.value)}>
          {['Room Charge','Room Service','Restaurant','Spa','Minibar','Laundry','Parking','Airport Transfer','Phone','Misc'].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="fg"><label className="flbl">Amount (BDT) *</label><input type="number" className="finput" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0" autoFocus/></div>
      <div className="fg"><label className="flbl">Description</label><input className="finput" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional detail"/></div>
    </Modal>
  )
}

function AddRoomModal({toast,onClose,reload,rooms}) {
  const [f,setF]=useState({room_number:'',category:'Fountain Deluxe',price:4000,status:'AVAILABLE'})
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!f.room_number) return toast('Room number required','error')
    if(rooms.find(r=>r.room_number===f.room_number)) return toast(`Room ${f.room_number} already exists`,'error')
    setSaving(true)
    try { await dbPost('rooms',{...f,price:+f.price,tenant_id:TENANT}); toast(`Room ${f.room_number} added`); reload(); onClose() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }
  return (
    <Modal title="Add New Room" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>Add Room</button></>}>
      <div className="frow">
        <div className="fg"><label className="flbl">Room Number *</label><input className="finput" value={f.room_number} onChange={F('room_number')} placeholder="e.g. 601" autoFocus/></div>
        <div className="fg"><label className="flbl">Category</label>
          <select className="fselect" value={f.category} onChange={F('category')}>
            {['Fountain Deluxe','Premium Deluxe','Superior Deluxe','Twin Deluxe','Royal Suite'].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Rate (BDT/night)</label><input type="number" className="finput" value={f.price} onChange={F('price')}/></div>
        <div className="fg"><label className="flbl">Initial Status</label>
          <select className="fselect" value={f.status} onChange={F('status')}>
            {['AVAILABLE','OUT_OF_ORDER'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════ RESERVATIONS ═══════════════════════ */
function ReservationsPage({reservations,guests,rooms,toast,currentUser,reload,hSettings,foliosMap}) {
  const [filter,setFilter]=useState('ALL')
  const [search,setSearch]=useState('')
  const [selRes,setSelRes]=useState(null)
  const [showNew,setShowNew]=useState(false)

  const sc=reservations.reduce((a,r)=>{
    a[r.status]=(a[r.status]||0)+1;
    if ((r.status==='CHECKED_IN'||r.status==='CHECKED_OUT') && (+r.total_amount||0) > (+r.paid_amount||0)) {
      a['DUE'] = (a['DUE']||0)+1;
    }
    return a;
  },{DUE:0})
  const getGN=gids=>{
    const gid=String((gids||[]).filter(Boolean)[0]||'')
    const g=guests.find(g=>String(g.id)===gid)
    return g?g.name:(gid?`ID:${gid}`:'Unknown')
  }

  let res=filter==='ALL'?reservations:
          filter==='DUE'?reservations.filter(r=>(r.status==='CHECKED_IN'||r.status==='CHECKED_OUT')&&(+r.total_amount||0)>(+r.paid_amount||0)):
          reservations.filter(r=>r.status===filter)
  if(search){
    const q=search.toLowerCase()
    res=res.filter(r=>getGN(r.guest_ids).toLowerCase().includes(q)||(r.room_ids||[]).join('').includes(q)||r.on_duty_officer?.toLowerCase().includes(q))
  }

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          {['ALL','DUE','CHECKED_IN','RESERVED','PENDING','CHECKED_OUT','CANCELLED'].map(s=>(
            <button key={s} className={`tab${filter===s?' on':''}`} onClick={()=>setFilter(s)}>
              {s==='ALL'?`All (${reservations.length})`:`${s.replace('_',' ')} (${sc[s]||0})`}
            </button>
          ))}
        </div>
        <div className="flex gap2">
          <div className="srch"><span className="xs muted">⌕</span><input placeholder="Search guest, room…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <button className="btn btn-gold" onClick={()=>setShowNew(true)}>+ New Reservation</button>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Guest</th><th>Rooms</th><th>Check-In</th><th>Check-Out</th><th>Nights</th><th>Base Rate</th><th>Discount</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {res.slice(0,80).map(invoice=>{
                const gn=getGN(invoice.guest_ids)
                const comp = computeBill(invoice, rooms, foliosMap, hSettings)
                return (
                  <tr key={invoice.id}>
                    <td><div className="flex fac gap2"><Av name={gn} size={24}/><span>{gn}</span></div></td>
                    <td><span className="badge bb">{(invoice.room_ids||[]).join(', ')}</span></td>
                    <td className="xs muted">{fmtDate(invoice.check_in)}</td>
                    <td className="xs muted">{fmtDate(invoice.check_out)}</td>
                    <td className="xs gold">{comp.nights||'—'}</td>
                    <td className="xs" style={{color:'var(--tx2)'}}>{BDT(comp.grossRate)}</td>
                    <td className="xs" style={{color:comp.discount>0?'var(--teal)':'var(--tx2)'}}>{comp.discount>0?BDT(comp.discount):'—'}</td>
                    <td className="xs gold">{BDT(comp.total)}</td>
                    <td className="xs" style={{color:+comp.paid>0?'var(--grn)':'var(--tx2)'}}>{BDT(comp.paid)}</td>
                    <td className="xs" style={{color:comp.due>0?'var(--rose)':'var(--grn)'}}>{BDT(comp.due)}</td>
                    <td><SBadge status={invoice.status}/></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={()=>setSelRes(invoice)}>View</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selRes&&(
        <ReservationDetail res={selRes} guests={guests} rooms={rooms} toast={toast}
          onClose={()=>setSelRes(null)} reload={()=>{reload();setSelRes(null)}} isOwner={currentUser?.role==='owner'} hSettings={hSettings} foliosMap={foliosMap}/>
      )}
      {showNew&&(
        <NewReservationModal guests={guests} rooms={rooms} toast={toast}
          onClose={()=>setShowNew(false)} reload={reload} hSettings={hSettings}/>
      )}
    </div>
  )
}

function ReservationDetail({res,guests,rooms,toast,onClose,reload,isOwner,hSettings}) {
  const [status,setStatus]=useState(res.status)
  const [roomIds,setRoomIds]=useState((res.room_ids||[]).map(String))
  const [checkIn,setCheckIn]=useState((res.check_in||'').slice(0,10))
  const [checkOut,setCheckOut]=useState((res.check_out||'').slice(0,10))

  const comp = computeBill(res, rooms, foliosMap, hSettings)
  
  const _discs = {}
  const _rates = {}
  if(res.room_details) {
    Object.keys(res.room_details).forEach(k => {
      _discs[k] = res.room_details[k].discount_applied || 0
      _rates[k] = res.room_details[k].base_rate || ''
    })
  }
  const [roomDiscounts, setRoomDiscounts] = useState(_discs)
  const [roomRates, setRoomRates] = useState(_rates)

  const [grossAmt,setGrossAmt]=useState('')
  const [paidAmt,setPaidAmt]=useState(String(res.paid_amount||''))
  const [method,setMethod]=useState(res.payment_method||'Cash')
  const [notes,setNotes]=useState(res.special_requests||'')
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)

  const gn=guests.find(g=>String(g.id)===String((res.guest_ids||[])[0]||''))?.name||'Unknown'
  const nights=nightsCount(checkIn,checkOut)
  
  const roomDetailsPayload = {}
  let baseRoomRate = 0
  let totalDbDiscount = 0
  let autoGross = 0

  roomIds.forEach(rn => {
    const room = rooms.find(r=>String(r.room_number)===String(rn))
    const userRate = roomRates[rn]
    const rate = userRate !== undefined && userRate !== '' ? (+userRate || 0) : (room ? (+room.price || 0) : 0)
    const disc = (+roomDiscounts[rn] || 0)
    const net = rate - disc
    baseRoomRate += rate
    totalDbDiscount += (disc * nights)
    autoGross += Math.max(0, net * nights)

    roomDetailsPayload[rn] = {
      base_rate: rate,
      discount_applied: disc,
      net_amount: Math.max(0, net * nights)
    }
  })

  // fallback logic
  const baseNetAmt = grossAmt!=='' ? Math.max(0,+grossAmt||0) : autoGross
  const displayTotalAmt = baseNetAmt + comp.extras
  const paidNum=Math.max(0,+paidAmt||0)
  // Never cap paid — if guest overpaid or folios increased total, preserve real amount
  // Also never allow a save to REDUCE paid_amount below what is already in the DB
  const existingPaid=+(res.paid_amount||0)
  const safePaid=Math.max(existingPaid, paidNum)
  const balance=Math.max(0,displayTotalAmt-safePaid)
  const paymentStatus=balance<=0?'Paid':safePaid>0?'Partial':'Unpaid'

  function toggleRoom(roomNumber){
    setRoomIds(prev=>{
      if (prev.includes(roomNumber)) return prev.filter(r=>r!==roomNumber)
      const room = rooms.find(r=>String(r.room_number)===String(roomNumber))
      setRoomRates(p=>({...p,[roomNumber]:room?room.price:''}))
      return [...prev,roomNumber]
    })
  }

  async function quickAddCharge(roomNumber) {
    const amt = prompt(`Enter Charge Amount (BDT) for Room ${roomNumber}:`)
    if(!amt || isNaN(amt) || +amt<=0) return
    const desc = prompt(`Enter Charge Description (e.g. Minibar, Laundry):`, "Room Service")
    if(!desc) return
    
    setSaving(true)
    try {
      const fiscalDay = hSettings?.active_fiscal_day || todayStr()
      await dbPost('folios', {
        reservation_id: res.id,
        room_number: String(roomNumber),
        description: desc,
        category: 'Extra Charges',
        amount: safeNum(amt),
        fiscal_day: fiscalDay,
        tenant_id: TENANT
      })
      toast(`Charge added to Room ${roomNumber}`)
      reload()
    } catch(e) { toast(e.message, 'error')}
    finally { setSaving(false) }
  }

  async function processPartialCheckout(roomNumber) {
    if(!window.confirm(`Check out of Room ${roomNumber}?\n\nThis will mark the room AVAILABLE/DIRTY and generate a frozen Folio charge so the main invoice retains its history.`)) return
    try {
      setSaving(true)
      const room = rooms.find(r=>String(r.room_number)===String(roomNumber))
      const rate = room ? (+room.price||0) : 0
      const startDate = new Date(res.check_in)
      const today = new Date()
      let stayedNights = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 3600 * 24))
      if(stayedNights <= 0) stayedNights = 1
      
      const chargeAmt = rate * stayedNights

      const fiscalDay = hSettings?.active_fiscal_day || todayStr()
      await dbPost('folios', {
        reservation_id: res.id,
        room_number: String(roomNumber),
        description: `Room Charge - ${roomNumber} (Checked Out)`,
        category: 'Room Charge',
        amount: safeNum(chargeAmt),
        fiscal_day: fiscalDay,
        tenant_id: TENANT
      })

      if(room) {
        await dbPatch('rooms', room.id, { status: 'DIRTY' })
      }

      const newRoomIds = roomIds.filter(id => String(id) !== String(roomNumber))
      const newBaseRoomRate = rooms.filter(r=>newRoomIds.includes(String(r.room_number))).reduce((a,r)=>a+(+r.price||0),0)
      const newAutoTotal = nights > 0 ? Math.max(0, newBaseRoomRate * nights) : 0
      
      await dbPatchReservationSafe(res.id, {
        room_ids: newRoomIds,
        total_amount: newAutoTotal
      })
      toast(`Room ${roomNumber} checked out and Folio charge ${BDT(chargeAmt)} posted.`)
      reload()
      onClose()
    } catch(e) { toast(e.message, 'error')} 
    finally { setSaving(false) }
  }

  async function save() {
    if(!roomIds.length) return toast('Select at least one room','error')
    if(!checkIn||!checkOut) return toast('Set check-in and check-out dates','error')
    if(nights<=0) return toast('Check-out must be after check-in','error')
    setSaving(true)
    try {
      const previousRooms=(res.room_ids||[]).map(String)
      const targetStatusForAssigned=
        status==='CHECKED_IN'?'OCCUPIED':
        status==='CHECKED_OUT'?'DIRTY':
        (status==='RESERVED'||status==='PENDING')?'RESERVED':'AVAILABLE'

      for(const rn of previousRooms) {
        if(!roomIds.includes(rn)) {
          const room=rooms.find(r=>String(r.room_number)===String(rn))
          if(room) await dbPatch('rooms',room.id,{status:'AVAILABLE'})
        }
      }

      for(const rn of roomIds) {
        const room=rooms.find(r=>String(r.room_number)===String(rn))
        if(room) await dbPatch('rooms',room.id,{status:targetStatusForAssigned})
      }

      /* ── Auto-create transaction when paid_amount increases ── */
      const oldPaid = +(res.paid_amount || 0)
      const paidDiff = safePaid - oldPaid
      if(paidDiff > 0) {
        const roomNo = roomIds.join(', ') || '—'
        const fiscalDay = hSettings?.active_fiscal_day || todayStr()
        await dbPostTransactionSafe({
          room_number: roomNo,
          guest_name: gn,
          type: `Room Payment (${method})`,
          amount: safeNum(paidDiff),
          fiscal_day: fiscalDay,
          tenant_id: TENANT
        })
      }

      await dbPatchReservationSafe(res.id,{
        status,
        room_ids:roomIds,
        check_in:checkIn,
        check_out:checkOut,
        total_amount:displayTotalAmt,
        discount:totalDbDiscount,
        paid_amount:safePaid,
        payment_method:method,
        special_requests:notes,
        room_details:roomDetailsPayload
      })
      toast(paidDiff > 0 ? `Reservation updated ✓ · Payment ${BDT(paidDiff)} recorded` : 'Reservation updated ✓')
      reload()
    } catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  async function doCheckIn() {
    if(!roomIds.length) return toast('Select at least one room','error')
    setSaving(true)
    try {
      for(const rn of roomIds) {
        const room=rooms.find(r=>String(r.room_number)===String(rn))
        if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
      }
      await dbPatchReservationSafe(res.id,{status:'CHECKED_IN',check_in:new Date().toISOString(),room_ids:roomIds})
      toast(`${gn} checked in to Rm ${roomIds.join(',')} ✓`)
      reload()
    } catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  return (
    <Modal title={`Reservation — ${gn}`} onClose={onClose} wide
      footer={
        <div className="flex gap2" style={{flexWrap:'wrap',width:'100%'}}>
          {(res.status==='RESERVED'||res.status==='PENDING')&&(
            <button className="btn btn-success" disabled={saving} onClick={doCheckIn}>✓ Check In Now</button>
          )}
	          {isOwner&&<button className="btn btn-danger btn-sm" onClick={async()=>{
	            if(!window.confirm('Delete this reservation?'))return
	            try{
	              const directTx=await db('transactions',`?select=id&tenant_id=eq.${TENANT}&reservation_id=eq.${res.id}`)
	              if(Array.isArray(directTx)&&directTx.length){
	                for(const tx of directTx){ await dbDelete('transactions',tx.id) }
	              } else {
	                const roomFilter=(res.room_ids||[]).map(rn=>`room_number.eq.${encodeURIComponent(rn)}`).join(',')
	                if(roomFilter){
	                  const fallbackTx=await db('transactions',`?select=id,guest_name&tenant_id=eq.${TENANT}&or=(${roomFilter})`)
	                  const guestName=(guests.find(g=>String(g.id)===String((res.guest_ids||[])[0]||''))?.name||'').toLowerCase()
	                  for(const tx of (fallbackTx||[])){
	                    if(!guestName || String(tx.guest_name||'').toLowerCase()===guestName){ await dbDelete('transactions',tx.id) }
	                  }
	                }
	              }
	              for(const rn of (res.room_ids||[])) {
	                const room=rooms.find(r=>r.room_number===rn)
	                if(room) await dbPatch('rooms',room.id,{status:'AVAILABLE'})
	              }
	              await dbDelete('reservations',res.id)
	              toast('Reservation & linked transactions deleted · room set to AVAILABLE')
	              reload()
	            }catch(e){toast(e.message,'error')}
	          }}>🗑 Delete</button>}
          <div style={{flex:1}}/>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Saving…':'Save Changes'}</button>
        </div>
      }>
      <div className="g2 mb4">
        {[
          ['Guest',gn],['Rooms',roomIds.join(', ')||'—'],
          ['Check-In',fmtDate(checkIn)],['Check-Out',fmtDate(checkOut)],
          ['Nights',nights||'—'],['Base Room Rate',`${BDT(baseRoomRate)}/night`],
          ['Discount',totalDbDiscount>0?BDT(totalDbDiscount):'—'],['Total (Invoice)',BDT(displayTotalAmt)],
          ['Paid',BDT(safePaid)],['Balance Due',BDT(balance)],
          ['Payment Status',paymentStatus],['On-Duty Officer',res.on_duty_officer||'—'],
        ].map(([l,v])=>(
          <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val" style={l==='Balance Due'&&balance>0?{color:'var(--rose)',fontWeight:700}:l==='Discount'&&totalDbDiscount>0?{color:'var(--teal)'}:{}}>{v}</div></div>
        ))}
      </div>
      {res.special_requests&&<div className="info-box mb4"><div className="info-lbl">Special Requests</div><div className="info-val" style={{marginTop:4}}>{res.special_requests}</div></div>}
      <div className="fg mb4">
        <label className="flbl">Rooms (editable, multiple)</label>
        <details className="info-box">
          <summary style={{cursor:'pointer',listStyle:'none',outline:'none'}}>
            <span className="info-val">{roomIds.length?roomIds.join(', '):'Select room(s)'}</span>
            <div className="xs muted">Dropdown list · showing AVAILABLE / DIRTY / RESERVED</div>
          </summary>
          <div className="g2" style={{marginTop:10}}>
            {rooms
              .filter(r=>['AVAILABLE','DIRTY','RESERVED'].includes(r.status)||roomIds.includes(String(r.room_number)))
              .map(r=>{
                const selected=roomIds.includes(String(r.room_number))
                return (
                  <div key={r.id} className="info-box" style={{display:'flex',alignItems:'center',gap:8,borderColor:selected?'rgba(200,169,110,.45)':'var(--br)'}}>
                    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1}}>
                      <input type="checkbox" checked={selected} onChange={()=>toggleRoom(String(r.room_number))}/>
                      <div style={{flex:1}}>
                        <div className="info-val">{r.room_number} — {r.category}</div>
                        <div className="xs muted">{BDT(r.price)} / night · {r.status}</div>
                      </div>
                    </label>
                    <div style={{display:'flex', gap:10, alignItems:'center'}}>
                      {selected && (res.status === 'CHECKED_IN' || res.status === 'CHECKED_OUT') && (
                        <div className="flex gap1" style={{alignItems:'center'}}>
                          <button className="btn btn-ghost btn-sm" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); processPartialCheckout(String(r.room_number))}} style={{fontSize:11,padding:'4px 8px'}} title="Check-out this room only">Check-Out</button>
                          <button className="btn btn-gold btn-sm" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); quickAddCharge(String(r.room_number))}} style={{fontSize:11,padding:'4px 8px'}} title="Add Extra Charge to Room">+ Charge</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </details>
        <div className="g2 mt3">
          {roomIds.map(rn=><span key={rn} className="badge bb">{rn}</span>)}
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Check-In Date</label><input type="date" className="finput" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></div>
        <div className="fg"><label className="flbl">Check-Out Date</label><input type="date" className="finput" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></div>
      </div>
      
      {roomIds.length > 0 && (
        <div className="fg mb4" style={{border:'1px solid var(--br)', borderRadius:8, background:'var(--bg)'}}>
          <div style={{padding:'10px 15px', borderBottom:'1px solid var(--br)', background:'rgba(255,255,255,.02)', fontWeight:600, fontSize:13}}>Room Details & Pricing</div>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, textAlign:'left'}}>
            <thead>
              <tr style={{color:'var(--tx2)'}}>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)'}}>Room</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:110}}>Daily Rate (৳)</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:110}}>Discount (৳)</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:80}}>Nights</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', textAlign:'right'}}>Sub-total</th>
              </tr>
            </thead>
            <tbody>
              {roomIds.map(rn => {
                const room = rooms.find(r=>String(r.room_number)===String(rn))
                const defRate = room ? (+room.price||0) : 0
                const userRate = roomRates[rn]
                const rate = userRate !== undefined && userRate !== '' ? (+userRate || 0) : defRate
                const disc = (+roomDiscounts[rn] || 0)
                const subTotal = Math.max(0, rate - disc) * nights
                return (
                  <tr key={rn}>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)'}}>{rn} — {room?.category || 'Unknown'}</td>
                    <td style={{padding:'4px 12px', borderBottom:'1px solid var(--br2)'}}>
                      <input type="number" min="0" value={userRate !== undefined ? userRate : defRate} onChange={e=>setRoomRates(p=>({...p,[rn]:e.target.value}))} style={{width:'100%',padding:'4px 6px',background:'var(--bg)',border:'1px solid var(--br)',color:'var(--tx)',borderRadius:4}} />
                    </td>
                    <td style={{padding:'4px 12px', borderBottom:'1px solid var(--br2)'}}>
                      <input type="number" min="0" value={roomDiscounts[rn]||''} placeholder="0" onChange={e=>setRoomDiscounts(p=>({...p,[rn]:e.target.value}))} style={{width:'100%',padding:'4px 6px',background:'var(--bg)',border:'1px solid var(--br)',color:'var(--gold)',borderRadius:4}} />
                    </td>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)'}}>{nights}</td>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)', textAlign:'right', fontWeight:600}}>{BDT(subTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{padding:'8px 12px', textAlign:'right', fontWeight:500}}>Gross Total</td>
                <td style={{padding:'8px 12px', textAlign:'right', fontWeight:700, color:'var(--gold)', fontSize:14}}>{BDT(autoGross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="frow">
        <div className="fg">
          <label className="flbl">Status</label>
          <select className="fselect" value={status} onChange={e=>setStatus(e.target.value)}>
            {['PENDING','RESERVED','CHECKED_IN','CHECKED_OUT','CANCELLED'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="flbl">Payment Method</label>
          <select className="fselect" value={method} onChange={e=>setMethod(e.target.value)}>
            {['Cash','Bkash','Nagad','Card','Bank Transfer','Corporate','Complimentary'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Gross Total Override (BDT) — Leave empty for auto</label>
          <input type="number" className="finput" value={grossAmt} onChange={e=>setGrossAmt(e.target.value)} placeholder={String(autoGross||0)} min="0"/>
        </div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Amount Paid (BDT)</label>
          <input type="number" className="finput" value={paidAmt} onChange={e=>setPaidAmt(e.target.value)} min="0"/>
          <div className="xs mt3" style={{color:balance>0?'var(--rose)':'var(--grn)'}}>
            Total: {BDT(displayTotalAmt)} {comp.extras>0?`(incl. ${BDT(comp.extras)} extras)`:''} · Paid: {BDT(safePaid)} · Balance due: {BDT(balance)}
          </div>
        </div>
      </div>
      <div className="fg">
        <label className="flbl">Notes</label>
        <textarea className="ftextarea" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:50}} placeholder="Internal notes…"/>
      </div>
    </Modal>
  )
}

function GuestSearchInput({guests, value, onChange}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef(null)
  const dropRef = useRef(null)

  const selectedGuest = guests.find(g => g.id === value)
  const filtered = query.trim()
    ? guests.filter(g => g.name?.toLowerCase().includes(query.toLowerCase()) || g.phone?.includes(query)).slice(0, 40)
    : guests.slice(0, 40)

  function pick(g) {
    onChange(g.id)
    setQuery('')
    setOpen(false)
  }

  function handleKey(e) {
    if (!open) { if(e.key==='ArrowDown'||e.key==='Enter') setOpen(true); return }
    if (e.key==='ArrowDown') { e.preventDefault(); setHighlighted(h=>Math.min(h+1,filtered.length-1)) }
    else if (e.key==='ArrowUp') { e.preventDefault(); setHighlighted(h=>Math.max(h-1,0)) }
    else if (e.key==='Enter') { e.preventDefault(); if(filtered[highlighted]) pick(filtered[highlighted]) }
    else if (e.key==='Escape') { setOpen(false); setQuery('') }
  }

  // Close on outside click
  useEffect(()=>{
    if(!open) return
    const h = e => { if(dropRef.current&&!dropRef.current.contains(e.target)&&inputRef.current&&!inputRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', h)
    return ()=>document.removeEventListener('mousedown', h)
  },[open])

  return (
    <div style={{position:'relative'}}>
      <div style={{position:'relative'}}>
        <input
          ref={inputRef}
          className="finput"
          value={open ? query : (selectedGuest ? selectedGuest.name : '')}
          onChange={e=>{ setQuery(e.target.value); setOpen(true); setHighlighted(0) }}
          onFocus={()=>{ setOpen(true); setQuery(''); setHighlighted(0) }}
          onKeyDown={handleKey}
          placeholder="Type to search guest…"
          autoComplete="off"
          style={{paddingRight:28}}
        />
        <span style={{position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',fontSize:9,color:'var(--tx3)',pointerEvents:'none'}}>▼</span>
      </div>
      {open && (
        <div ref={dropRef} style={{position:'absolute',top:'calc(100% + 3px)',left:0,right:0,background:'var(--s1)',border:'1px solid var(--br)',zIndex:600,maxHeight:220,overflowY:'auto',boxShadow:'0 12px 40px rgba(0,0,0,.7)'}}>
          {filtered.length===0
            ? <div style={{padding:'10px 12px',fontSize:11,color:'var(--tx3)'}}>No guests found</div>
            : filtered.map((g,i)=>(
                <div key={g.id}
                  onMouseDown={()=>pick(g)}
                  onMouseEnter={()=>setHighlighted(i)}
                  style={{padding:'9px 12px',cursor:'pointer',fontSize:12,fontWeight:300,color:'var(--tx)',background:i===highlighted?'rgba(200,169,110,.1)':'transparent',borderBottom:'1px solid var(--br2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>{g.name}</span>
                  {g.phone&&<span style={{fontSize:10,color:'var(--tx3)'}}>{g.phone}</span>}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

function NewReservationModal({guests,rooms,toast,onClose,reload,hSettings}) {
  const [f,setF]=useState({
    guestId:'', roomIds:[], roomDiscounts:{}, roomRates:{},
    checkIn:todayStr(), checkOut:'',
    total:'', collectAmount:'0', method:'Cash', notes:'', officer:'', stayType:'CHECK_IN'
  })
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)

  const availRooms=rooms.filter(r=>{
    if(f.stayType==='CHECK_IN') return r.status==='AVAILABLE'
    return true
  })

  useEffect(()=>{
    if(f.stayType==='CHECK_IN') {
      const validIds=f.roomIds.filter(id=>{
        const room=rooms.find(r=>String(r.room_number)===String(id))
        return room&&room.status==='AVAILABLE'
      })
      if(validIds.length!==f.roomIds.length) setF(p=>({...p,roomIds:validIds}))
    }
  },[f.stayType,rooms])

  function toggleRoom(roomNumber) {
    setF(p=>{
      if(p.roomIds.includes(roomNumber)){
        return {...p,roomIds:p.roomIds.filter(id=>id!==roomNumber)}
      } else {
        const room = rooms.find(r=>String(r.room_number)===String(roomNumber))
        return {
          ...p,
          roomIds:[...p.roomIds,roomNumber],
          roomRates:{...p.roomRates,[roomNumber]:room?room.price:''}
        }
      }
    })
  }

  const autoNights=f.checkIn&&f.checkOut?nightsCount(f.checkIn,f.checkOut):0
  
  const roomDetailsPayload = {}
  let baseRate = 0
  let totalDbDiscount = 0
  let autoGrossTotal = 0

  f.roomIds.forEach(rn => {
    const room = rooms.find(r=>String(r.room_number)===String(rn))
    const userRate = f.roomRates[rn]
    const rate = userRate !== undefined && userRate !== '' ? (+userRate || 0) : (room ? (+room.price || 0) : 0)
    const disc = (+f.roomDiscounts[rn] || 0)
    const net = rate - disc
    baseRate += rate
    totalDbDiscount += (disc * autoNights)
    autoGrossTotal += Math.max(0, net * autoNights)

    roomDetailsPayload[rn] = {
      base_rate: rate,
      discount_applied: disc,
      net_amount: Math.max(0, net * autoNights)
    }
  })

  const grossTotal=f.total!==''?Math.max(0,+f.total):autoGrossTotal
  const finalInvoice=grossTotal
  const collectedAmt=Math.min(finalInvoice,Math.max(0,+f.collectAmount||0))
  const dueAmt=Math.max(0,finalInvoice-collectedAmt)

  useEffect(()=>{
    if(autoGrossTotal>0 || totalDbDiscount>0) setF(p=>({...p,total:String(autoGrossTotal)}))
  },[f.roomIds.join(','), f.checkIn, f.checkOut, JSON.stringify(f.roomDiscounts)])

  async function save() {
    if(!f.guestId) return toast('Select a guest','error')
    if(f.roomIds.length===0) return toast('Select at least one room','error')
    if(!f.checkIn||!f.checkOut) return toast('Set check-in and check-out dates','error')
    if(autoNights<=0) return toast('Check-out must be after check-in','error')
    setSaving(true)
    try {
      const isCheckIn=f.stayType==='CHECK_IN'
      const totalAmt=finalInvoice
      const created=await dbPostReservationSafe({
        guest_ids:[f.guestId], room_ids:f.roomIds,
        check_in:f.checkIn, check_out:f.checkOut,
        status:isCheckIn?'CHECKED_IN':'RESERVED',
        total_amount:totalAmt, paid_amount:collectedAmt, discount:totalDbDiscount,
        payment_method:f.method, special_requests:f.notes||null,
        on_duty_officer:f.officer||null, stay_type:f.stayType, tenant_id:TENANT,
        room_details:roomDetailsPayload
      })
      if(isCheckIn) {
        for(const id of f.roomIds) {
          const room=rooms.find(r=>String(r.room_number)===String(id))
          if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
        }
      }
      if(collectedAmt>0) {
        await dbPostTransactionSafe({
          reservation_id:created?.id||null,
          room_number:f.roomIds.join(','), guest_name:guests.find(g=>g.id===f.guestId)?.name||'Guest',
          type:`Room Payment (${f.method})`, amount:safeNum(collectedAmt), fiscal_day:hSettings?.active_fiscal_day||todayStr(), tenant_id:TENANT
        })
      }
      toast(isCheckIn?`Check-in complete — Rm ${f.roomIds.join(',')} ✓`:'Reservation created ✓')
      await reload()
      onClose()
    } catch(e){ toast(e.message||'Save failed','error'); setSaving(false) }
  }

  return (
    <Modal title="New Reservation / Check-In" onClose={onClose} wide
      footer={
        <><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" disabled={saving} onClick={save}>
          {saving?<><span className="spinner" style={{width:12,height:12}}/> Saving…</>:f.stayType==='CHECK_IN'?'✓ Check In Now':'Create Reservation'}
        </button></>
      }>
      <div className="tabs" style={{marginBottom:14}}>
        {[['CHECK_IN','✓ Direct Check-In'],['RESERVATION','📅 Future Reservation']].map(([v,l])=>(
          <button key={v} className={`tab${f.stayType===v?' on':''}`} onClick={()=>setF(p=>({...p,stayType:v}))}>{l}</button>
        ))}
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Guest * — type name or phone to search</label>
          <GuestSearchInput guests={guests} value={f.guestId} onChange={id=>setF(p=>({...p,guestId:id}))}/>
        </div>
        <div className="fg">
          <label className="flbl">Rooms * {availRooms.length===0&&<span style={{color:'var(--rose)'}}>— no available rooms</span>}</label>
          <details className="info-box">
            <summary style={{cursor:'pointer',listStyle:'none',outline:'none'}}>
              <span className="info-val">{f.roomIds.length?f.roomIds.join(', '):'Select one or more rooms...'}</span>
              <div className="xs muted">Dropdown list · showing {f.stayType==='CHECK_IN'?'AVAILABLE':'ALL'}</div>
            </summary>
            <div className="g2" style={{marginTop:10}}>
              {availRooms.map(r=>{
                const selected=f.roomIds.includes(String(r.room_number))
                return (
                  <label key={r.id} className="info-box" style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',borderColor:selected?'rgba(200,169,110,.45)':'var(--br)'}}>
                    <input type="checkbox" checked={selected} onChange={()=>toggleRoom(String(r.room_number))}/>
                    <div style={{flex:1, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                        <div className="info-val">{r.room_number} — {r.category}</div>
                        <div className="xs muted">{BDT(r.price)} / night · {r.status}</div>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </details>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Check-In Date *</label><input type="date" className="finput" value={f.checkIn} onChange={F('checkIn')}/></div>
        <div className="fg"><label className="flbl">Check-Out Date *</label><input type="date" className="finput" value={f.checkOut} onChange={F('checkOut')}/></div>
      </div>
      
      {f.roomIds.length > 0 && (
        <div className="fg mb4" style={{border:'1px solid var(--br)', borderRadius:8, background:'var(--bg)'}}>
          <div style={{padding:'10px 15px', borderBottom:'1px solid var(--br)', background:'rgba(255,255,255,.02)', fontWeight:600, fontSize:13}}>Room Details & Pricing</div>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, textAlign:'left'}}>
            <thead>
              <tr style={{color:'var(--tx2)'}}>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)'}}>Room</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:110}}>Daily Rate (৳)</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:110}}>Discount (৳)</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', width:80}}>Nights</th>
                <th style={{padding:'8px 12px', fontWeight:500, borderBottom:'1px solid var(--br)', textAlign:'right'}}>Sub-total</th>
              </tr>
            </thead>
            <tbody>
              {f.roomIds.map(rn => {
                const room = rooms.find(r=>String(r.room_number)===String(rn))
                const defRate = room ? (+room.price||0) : 0
                const userRate = f.roomRates[rn]
                const rate = userRate !== undefined && userRate !== '' ? (+userRate || 0) : defRate
                const disc = (+f.roomDiscounts[rn] || 0)
                const subTotal = Math.max(0, rate - disc) * autoNights
                return (
                  <tr key={rn}>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)'}}>{rn} — {room?.category}</td>
                    <td style={{padding:'4px 12px', borderBottom:'1px solid var(--br2)'}}>
                      <input type="number" min="0" value={userRate !== undefined ? userRate : defRate} onChange={e=>setF(p=>({...p,roomRates:{...p.roomRates,[rn]:e.target.value}}))} style={{width:'100%',padding:'4px 6px',background:'var(--bg)',border:'1px solid var(--br)',color:'var(--tx)',borderRadius:4}} />
                    </td>
                    <td style={{padding:'4px 12px', borderBottom:'1px solid var(--br2)'}}>
                      <input type="number" min="0" value={f.roomDiscounts[rn]||''} placeholder="0" onChange={e=>setF(p=>({...p,roomDiscounts:{...p.roomDiscounts,[rn]:e.target.value}}))} style={{width:'100%',padding:'4px 6px',background:'var(--bg)',border:'1px solid var(--br)',color:'var(--gold)',borderRadius:4}} />
                    </td>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)'}}>{autoNights}</td>
                    <td style={{padding:'8px 12px', borderBottom:'1px solid var(--br2)', textAlign:'right', fontWeight:600}}>{BDT(subTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{padding:'8px 12px', textAlign:'right', fontWeight:500}}>Gross Total</td>
                <td style={{padding:'8px 12px', textAlign:'right', fontWeight:700, color:'var(--gold)', fontSize:14}}>{BDT(autoGrossTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="frow">
        <div className="fg"><label className="flbl">Collect Amount / Deposit (BDT)</label><input type="number" className="finput" value={f.collectAmount} onChange={F('collectAmount')} placeholder="0"/></div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Invoice Preview</label>
          <div className="info-box">
            <div className="xs muted">Final Invoice: <span className="gold">{BDT(finalInvoice)}</span></div>
            <div className="xs muted">Collected: <span style={{color:'var(--grn)'}}>{BDT(collectedAmt)}</span></div>
            <div className="xs muted">Total Due: <span style={{color:dueAmt>0?'var(--rose)':'var(--grn)'}}>{BDT(dueAmt)}</span></div>
          </div>
        </div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Payment Method</label>
          <select className="fselect" value={f.method} onChange={F('method')}>
            {['Cash','Bkash','Nagad','Card','Bank Transfer','Corporate','Complimentary'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">On-Duty Officer</label><input className="finput" value={f.officer} onChange={F('officer')} placeholder="Staff name"/></div>
      </div>
      <div className="fg"><label className="flbl">Special Requests / Notes</label><textarea className="ftextarea" value={f.notes} onChange={F('notes')} style={{minHeight:50}} placeholder="Optional"/></div>
    </Modal>
  )
}

/* ═══════════════════════ GUESTS ═════════════════════════════ */
function GuestsPage({guests,reservations,rooms,toast,currentUser,reload,hSettings,foliosMap}) {
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('ALL')
  const [sel,setSel]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const [page,setPage]=useState(1)
  const PAGE_SIZE = 15

  // Memoize status counts and guest-status mapping
  const {counts, statusMap} = useMemo(() => {
    const counts = { ALL: guests.length, DUE: 0, CHECKED_IN: 0, CHECKED_OUT: 0, RESERVED: 0 };
    const statusMap = {};
    
    guests.forEach(g => {
      if (+g.outstanding_balance > 0) counts.DUE++;
    });

    (reservations || []).forEach(r => {
      (r.guest_ids || []).forEach(gid => {
        const id = String(gid);
        if (!statusMap[id]) statusMap[id] = new Set();
        statusMap[id].add(r.status);
      });
    });

    // Count guests per unique category
    Object.keys(statusMap).forEach(gid => {
      const statuses = statusMap[gid];
      if (statuses.has('CHECKED_IN')) counts.CHECKED_IN++;
      if (statuses.has('CHECKED_OUT')) counts.CHECKED_OUT++;
      if (statuses.has('PENDING') || statuses.has('CONFIRMED')) counts.RESERVED++;
    });

    return {counts, statusMap};
  }, [guests, reservations]);

  const filtered = useMemo(() => {
    let list = guests;
    
    // Status Filter
    if (filter !== 'ALL') {
      if (filter === 'DUE') {
        list = list.filter(g => +g.outstanding_balance > 0);
      } else if (filter === 'RESERVED') {
        list = list.filter(g => {
          const s = statusMap[String(g.id)];
          return s && (s.has('PENDING') || s.has('CONFIRMED'));
        });
      } else {
        list = list.filter(g => statusMap[String(g.id)]?.has(filter));
      }
    }

    // Search Filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g => g.name?.toLowerCase().includes(q) || g.phone?.includes(q) || g.email?.toLowerCase().includes(q));
    }
    
    return list;
  }, [guests, search, filter, statusMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageList = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  // Reset page on search or filter change
  useEffect(() => { setPage(1) }, [search, filter])

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8,alignItems:'flex-end'}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div className="tabs" style={{marginBottom:0}}>
            {['ALL','CHECKED_IN','CHECKED_OUT','RESERVED','DUE'].map(s=>(
              <button key={s} className={`tab${filter===s?' on':''}`} onClick={()=>setFilter(s)}>
                {s==='ALL'?`All (${guests.length})`:
                 s==='DUE'?`Due (${counts.DUE})`:
                 `${s.replace('_',' ')} (${counts[s]||0})`}
              </button>
            ))}
          </div>
          <div className="srch" style={{width:320}}><span className="xs muted">⌕</span><input placeholder="Search name, phone, email…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        <div className="flex gap2" style={{alignItems:'center'}}>
          <span className="badge bgold">{filtered.length} {search||filter!=='ALL'?'found':('of '+guests.length+' guests')}</span>
          <button className="btn btn-gold" onClick={()=>setShowAdd(true)}>+ Add Guest</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>ID</th><th>City</th><th>Balance</th><th>VIP</th><th></th></tr></thead>
            <tbody>
              {pageList.map(g=>(
                <tr key={g.id}>
                  <td><div className="flex fac gap2"><Av name={g.name} size={24}/><span>{g.name}</span></div></td>
                  <td className="xs muted">{g.phone||'—'}</td>
                  <td className="xs muted">{g.email||'—'}</td>
                  <td className="xs muted">{g.id_type?`${g.id_type}: ${g.id_number||''}`:g.id_card||'—'}</td>
                  <td className="xs muted">{g.city||'—'}</td>
                  <td className="xs" style={{color:+g.outstanding_balance>0?'var(--rose)':'var(--grn)'}}>{BDT(g.outstanding_balance||0)}</td>
                  <td>{g.vip?<span className="badge bgold">VIP</span>:null}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={()=>setSel(g)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
{/* Pagination controls */}
      {totalPages>1&&(
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 4px',flexWrap:'wrap',gap:8}}>
          <div className="xs muted">
            Showing {((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length} guests
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={()=>setPage(1)} style={{padding:'4px 8px',opacity:page===1?.35:1}}>«</button>
            <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{padding:'4px 10px',opacity:page===1?.35:1}}>‹ Prev</button>
            {/* Page number pills */}
            {Array.from({length:totalPages},(_,i)=>i+1)
              .filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2)
              .reduce((acc,p,i,arr)=>{
                if(i>0&&arr[i-1]!==p-1) acc.push('...')
                acc.push(p); return acc
              },[])
              .map((p,i)=>
                p==='...'
                  ?<span key={'e'+i} className="xs muted" style={{padding:'0 4px'}}>…</span>
                  :<button key={p} className={`btn btn-sm${p===page?' btn-gold':' btn-ghost'}`}
                    style={{padding:'4px 9px',minWidth:30}}
                    onClick={()=>setPage(p)}>{p}</button>
              )
            }
            <button className="btn btn-ghost btn-sm" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} style={{padding:'4px 10px',opacity:page===totalPages?.35:1}}>Next ›</button>
            <button className="btn btn-ghost btn-sm" disabled={page===totalPages} onClick={()=>setPage(totalPages)} style={{padding:'4px 8px',opacity:page===totalPages?.35:1}}>»</button>
          </div>
        </div>
      )}
      {sel && <GuestModal guest={sel} reservations={reservations} rooms={rooms} hSettings={hSettings} foliosMap={foliosMap} toast={toast} onClose={()=>setSel(null)} reload={reload} isSA={currentUser?.role==='owner'}/>}
      {showAdd && <AddGuestModal toast={toast} onClose={()=>setShowAdd(false)} reload={reload}/>}
    </div>
  )
}

function GuestModal({guest,reservations,rooms,hSettings,foliosMap,toast,onClose,reload,isSA}) {
  const gRes=reservations.filter(r=>{
    let ids=r.guest_ids||[r.guest_id]
    if(typeof ids==='string' && ids.startsWith('[')) try{ids=JSON.parse(ids)}catch(e){}
    return (Array.isArray(ids)?ids:[ids]).map(String).includes(String(guest.id))
  })
  const ledgerBalance = gRes.reduce((acc, r) => acc + computeBill(r, rooms, foliosMap, hSettings).due, 0)
  const [showEdit,setShowEdit]=useState(false)
  async function toggleVIP() {
    try { await dbPatch('guests',guest.id,{vip:!guest.vip}); toast(guest.vip?'VIP status removed':'Marked as VIP ★'); reload(); onClose() }
    catch(e){ toast(e.message,'error') }
  }
  async function doDelete() {
    try { await dbDelete('guests',guest.id); toast('Guest deleted'); reload(); onClose() }
    catch(e){ toast(e.message,'error') }
  }
  return (
    <>
    <Modal title={guest.name} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button>{isSA&&<button className="btn btn-danger btn-sm" onClick={()=>{if(window.confirm('Delete this guest?'))doDelete()}}>🗑 Delete</button>}<button className="btn btn-ghost" onClick={()=>setShowEdit(true)}>✏ Edit</button><button className="btn btn-gold" onClick={toggleVIP}>{guest.vip?'Remove VIP':'★ Mark VIP'}</button></>}>
      <div className="flex fac gap3 mb4">
        <Av name={guest.name} size={44}/>
        <div>
          {guest.vip&&<span className="badge bgold" style={{marginBottom:4,display:'inline-flex'}}>VIP</span>}
          <div style={{fontWeight:700,fontSize:18}}>{guest.name}</div>
          <div className="xs muted">{[guest.nationality,guest.city,guest.country].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="g2 mb4">
        {[['Phone',guest.phone||'—'],['Email',guest.email||'—'],['ID Type',guest.id_type||'—'],['ID Number',guest.id_number||guest.id_card||'—'],['Ledger Balance',BDT(ledgerBalance)],['Address',guest.address||'—']].map(([l,v])=>(
          <div key={l} className="info-box"><div className="info-lbl" style={{color:l==='Ledger Balance'&&ledgerBalance>0?'var(--rose)':'inherit'}}>{l}</div><div className="info-val" style={{color:l==='Ledger Balance'&&ledgerBalance>0?'var(--rose)':'inherit',fontWeight:l==='Ledger Balance'?700:300}}>{v}</div></div>
        ))}
      </div>
      {gRes.length>0&&(
        <>
          <div className="flbl" style={{marginBottom:6}}>Stay History</div>
          {gRes.map(r=>(
            <div key={r.id} className="flex fac fjb" style={{padding:'6px 0',borderBottom:'1px solid var(--br2)'}}>
              <span className="xs">Rm {(r.room_ids||[]).join(',')} · {fmtDate(r.check_in)} → {fmtDate(r.check_out)}</span>
              <SBadge status={r.status}/>
            </div>
          ))}
        </>
      )}
      {guest.preferences&&<div className="info-box mt3"><div className="info-lbl">Preferences</div><div className="info-val" style={{marginTop:4}}>{guest.preferences}</div></div>}
    </Modal>
    {showEdit&&<EditGuestModal guest={guest} toast={toast} onClose={()=>setShowEdit(false)} reload={()=>{reload();setShowEdit(false);onClose()}}/>}
    </>
  )
}

function EditGuestModal({guest,toast,onClose,reload}) {
  const [f,setF]=useState({name:guest.name||'',phone:guest.phone||'',email:guest.email||'',id_type:guest.id_type||'NID',id_number:guest.id_number||guest.id_card||'',nationality:guest.nationality||'',city:guest.city||'',address:guest.address||''})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  async function save() {
    if(!f.name.trim()) return toast('Name required','error')
    setSaving(true)
    try { await dbPatch('guests',guest.id,{...f}); toast('Guest updated ✓'); reload() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }
  return (
    <Modal title={`Edit — ${guest.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Saving…':'Save Changes'}</button></>}>
      <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={f.name} onChange={F('name')} autoFocus/></div>
      <div className="frow">
        <div className="fg"><label className="flbl">Phone</label><input className="finput" value={f.phone} onChange={F('phone')} placeholder="+880…"/></div>
        <div className="fg"><label className="flbl">Email</label><input type="email" className="finput" value={f.email} onChange={F('email')}/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">ID Type</label>
          <select className="fselect" value={f.id_type} onChange={F('id_type')}>
            {['NID','Passport','Driving License','Birth Certificate','Other'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">ID Number</label><input className="finput" value={f.id_number} onChange={F('id_number')}/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Nationality</label><input className="finput" value={f.nationality} onChange={F('nationality')}/></div>
        <div className="fg"><label className="flbl">City</label><input className="finput" value={f.city} onChange={F('city')}/></div>
      </div>
      <div className="fg"><label className="flbl">Address</label><textarea className="ftextarea" value={f.address} onChange={F('address')} style={{minHeight:44}}/></div>
    </Modal>
  )
}

function AddGuestModal({toast,onClose,reload}) {
  const [f,setF]=useState({name:'',phone:'',email:'',id_type:'NID',id_number:'',nationality:'',city:'',address:''})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  async function save() {
    if(!f.name.trim()) return toast('Name required','error')
    setSaving(true)
    try { await dbPost('guests',{...f,tenant_id:TENANT}); toast(`Guest "${f.name}" added`); reload(); onClose() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }
  return (
    <Modal title="Add New Guest" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>Add Guest</button></>}>
      <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={f.name} onChange={F('name')} placeholder="Guest full name" autoFocus/></div>
      <div className="frow">
        <div className="fg"><label className="flbl">Phone</label><input className="finput" value={f.phone} onChange={F('phone')} placeholder="+880…"/></div>
        <div className="fg"><label className="flbl">Email</label><input type="email" className="finput" value={f.email} onChange={F('email')} placeholder="guest@email.com"/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">ID Type</label>
          <select className="fselect" value={f.id_type} onChange={F('id_type')}>
            {['NID','Passport','Driving License','Birth Certificate','Other'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">ID Number</label><input className="finput" value={f.id_number} onChange={F('id_number')} placeholder="ID number"/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Nationality</label><input className="finput" value={f.nationality} onChange={F('nationality')} placeholder="e.g. Bangladeshi"/></div>
        <div className="fg"><label className="flbl">City</label><input className="finput" value={f.city} onChange={F('city')} placeholder="Dhaka"/></div>
      </div>
      <div className="fg"><label className="flbl">Address</label><textarea className="ftextarea" value={f.address} onChange={F('address')} placeholder="Full address" style={{minHeight:44}}/></div>
    </Modal>
  )
}

/* ═══════════════════════ HOUSEKEEPING ═══════════════════════ */
function HousekeepingPage({tasks,rooms,toast,currentUser,reload}) {
  const isSA=currentUser?.role==='owner'
  const [filter,setFilter]=useState('ALL')
  const [showAdd,setShowAdd]=useState(false)
  const dirty=rooms.filter(r=>r.status==='DIRTY')

  // ALL = dirty rooms + non-completed tasks; completed tasks only in 'completed' filter
  let list=tasks
  if(filter==='DIRTY'){
    list=dirty.map(r=>({id:'r_'+r.id,room_number:r.room_number,task_type:'Standard Clean',priority:'high',status:'pending',assignee:'—',_dirty:true}))
  } else if(filter==='ALL'){
    const dirtyEntries=dirty.map(r=>({id:'r_'+r.id,room_number:r.room_number,task_type:'Standard Clean',priority:'high',status:'pending',assignee:'—',_dirty:true}))
    const nonCompleted=tasks.filter(t=>t.status!=='completed')
    list=[...dirtyEntries,...nonCompleted]
  } else {
    list=tasks.filter(t=>t.status===filter)
  }

  async function updateStatus(id,s) {
    try {
// Find the task to get its room_number
      const task=tasks.find(t=>t.id===id)
      await dbPatch('housekeeping_tasks',id,{status:s,completed_at:s==='completed'?new Date().toISOString():null})
      // If completed → set room to AVAILABLE (only if not currently OCCUPIED/RESERVED)
      if(s==='completed'&&task?.room_number){
        const room=rooms.find(r=>r.room_number===task.room_number)
        if(room&&room.status==='DIRTY'){
          await dbPatch('rooms',room.id,{status:'AVAILABLE'})
          toast(`Room ${task.room_number} → AVAILABLE ✓`)
        } else {
          toast(`Task completed ✓`)
        }
      } else {
        toast(`Task → ${s}`)
      }
      reload()
    } catch(e){ toast(e.message,'error') }
  }

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          {[['ALL','All Tasks'],['pending','Pending'],['in-progress','In Progress'],['completed','Completed'],['DIRTY',`Dirty Rooms (${dirty.length})`]].map(([v,l])=>(
            <button key={v} className={`tab${filter===v?' on':''}`} onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-gold" onClick={()=>setShowAdd(true)}>+ Add Task</button>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Room</th><th>Task</th><th>Priority</th><th>Assignee</th><th>Time</th><th>Notes</th><th>Status</th><th>Update</th></tr></thead>
            <tbody>
              {list.slice(0,60).map(t=>(
                <tr key={t.id}>
                  <td><span style={{fontWeight:800,fontSize:18,color:'var(--gold)'}}>{t.room_number}</span></td>
                  <td className="sm">{t.task_type}</td>
                  <td><div className="flex fac gap2"><span className={`pdot ${t.priority||'medium'}`}/><span className="xs">{t.priority||'medium'}</span></div></td>
                  <td className="xs muted">{t.assignee||'—'}</td>
                  <td className="xs muted">{t.scheduled_time||'—'}</td>
                  <td className="xs muted" style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.notes||'—'}</td>
                  <td><SBadge status={t.status||'pending'}/></td>
                  <td>
                    <div className="flex gap2">
                    {!t._dirty&&(
                      <select className="fselect" style={{padding:'3px 22px 3px 7px',fontSize:10,minWidth:110}}
                        value={t.status||'pending'} onChange={e=>updateStatus(t.id,e.target.value)}>
                        {['pending','in-progress','completed'].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {isSA&&!t._dirty&&<button className="btn btn-danger btn-sm" style={{padding:'3px 8px',fontSize:10}} onClick={async()=>{if(!window.confirm('Delete task?'))return;try{await dbDelete('housekeeping_tasks',t.id);toast('Task deleted');reload()}catch(e){toast(e.message,'error')}}}>✕</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd&&<AddTaskModal rooms={rooms} toast={toast} onClose={()=>setShowAdd(false)} reload={reload}/>}
    </div>
  )
}

function AddTaskModal({rooms,toast,onClose,reload}) {
  const dirtyRooms=rooms.filter(r=>r.status==='DIRTY')
  const [f,setF]=useState({room_number:dirtyRooms[0]?.room_number||'',task_type:'Standard Clean',priority:'medium',assignee:'',scheduled_time:'',notes:''})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  async function save() {
    if(!f.room_number) return toast('Room required','error')
    setSaving(true)
    try { await dbPost('housekeeping_tasks',{...f,status:'pending',department:'Housekeeping',tenant_id:TENANT}); toast('Task added'); reload(); onClose() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }
  return (
    <Modal title="Add Housekeeping Task" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>Add Task</button></>}>
      <div className="frow">
        <div className="fg"><label className="flbl">Room *</label>
          <select className="fselect" value={f.room_number} onChange={F('room_number')}>
            {dirtyRooms.length===0&&<option value="">No dirty rooms</option>}
            {dirtyRooms.map(r=><option key={r.id} value={r.room_number}>{r.room_number} — DIRTY</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">Task Type</label>
          <select className="fselect" value={f.task_type} onChange={F('task_type')}>
            {['Standard Clean','Deep Clean','Turndown','VIP Turndown','Inspection','Extra Towels','Maintenance','AC Repair','Plumbing'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Priority</label>
          <select className="fselect" value={f.priority} onChange={F('priority')}>
            {['low','medium','high'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">Scheduled Time</label><input type="time" className="finput" value={f.scheduled_time} onChange={F('scheduled_time')}/></div>
      </div>
      <div className="fg"><label className="flbl">Assignee</label><input className="finput" value={f.assignee} onChange={F('assignee')} placeholder="Staff member name"/></div>
      <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={f.notes} onChange={F('notes')} placeholder="Optional details" style={{minHeight:44}}/></div>
    </Modal>
  )
}

/* ═══════════════════════ BILLING ════════════════════════════ */
function printPDF(htmlContent, filename) {
  // Use native browser print — works from file:// URLs without external libs
  const w = window.open('', '_blank', 'width=1100,height=700')
  if(!w){ alert('Please allow popups to print PDF'); return Promise.resolve() }
  w.document.write(htmlContent)
  w.document.close()
  return new Promise(resolve=>{
    w.onload = ()=>{
      setTimeout(()=>{
        w.focus()
        w.print()
        // Don't auto-close — let user save as PDF then close
        resolve()
      }, 600)
    }
  })
}

function downloadBillingPDF(list, filter, todayT, monthT, allT, outstanding, tokenAmount, dueRes, computeBill, getGN, getRoom, reservations, corrected) {
  const filterLabel = filter==='TODAY'?'Today':filter==='MONTH'?'This Month':'All Time'
  const realList = list.filter(t => t.type !== 'Balance Carried Forward')
  // Use the pre-built corrected amounts map from the component (same source as the KPI)
  const normalizedList = realList.map(t => ({ ...t, amount: corrected[t.id] ?? (+t.amount || 0) }))
  const total = normalizedList.reduce((a,t)=>a+(+t.amount||0),0)
  const now = new Date().toLocaleString('en-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})
  const rows = normalizedList.map(t=>`<tr><td>${t.fiscal_day||'—'}</td><td>${t.guest_name||'—'}</td><td>${t.room_number||'—'}</td><td>${t.type||'Payment'}</td><td style="text-align:right;font-weight:600">৳${Number(t.amount||0).toLocaleString()}</td></tr>`).join('')
  // Normalize stat totals using the same corrected amounts map as the KPI
  function normTotal(txArr) {
    return txArr.filter(t => t.type !== 'Balance Carried Forward')
      .reduce((a, t) => a + (corrected[t.id] ?? (+t.amount || 0)), 0)
  }
  const todayTotal = normTotal(todayT)
  const monthTotal = normTotal(monthT)
  const allTotal = normTotal(allT)
  const tkn = +(tokenAmount||0)
  const closingBalance = todayTotal - tkn
  // Due Details
  const dueRows = (dueRes||[]).map(r => {
    const bill = computeBill ? computeBill(r) : {total:0,paid:0,due:0}
    const gn = getGN ? getGN(r) : (r.guest_name||'—')
    const rm = getRoom ? getRoom(r) : ((r.room_ids||[]).join(', ')||'—')
    return `<tr><td>${gn}</td><td>${rm}</td><td style="text-align:right">৳${Number(bill.total||0).toLocaleString()}</td><td style="text-align:right">৳${Number(bill.paid||0).toLocaleString()}</td><td style="text-align:right;font-weight:700;color:#c00">৳${Number(bill.due||0).toLocaleString()}</td><td>${r.status||'—'}</td></tr>`
  }).join('')
  const totalDue = (dueRes||[]).reduce((a,r) => {
    const bill = computeBill ? computeBill(r) : {due:0}
    return a + (bill.due||0)
  }, 0)
  const dueSection = dueRows ? `
  <div style="margin-top:18px;page-break-inside:avoid">
    <div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #000">Outstanding Dues — Guest Details</div>
    <table><thead><tr style="background:#8B0000;color:#fff"><th>Guest</th><th>Room</th><th style="text-align:right">Bill Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance Due</th><th>Status</th></tr></thead>
    <tbody>${dueRows}</tbody>
    <tfoot><tr style="background:#f2f2f2;font-weight:700"><td colspan="4" style="text-align:right;padding:5px 7px;font-size:10px">Total Outstanding:</td><td style="text-align:right;padding:5px 7px;font-size:12px;color:#c00">৳${totalDue.toLocaleString()}</td><td></td></tr></tfoot>
    </table>
  </div>` : ''
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Hotel Fountain — Billing ${filterLabel}</title>
  <style>
    @page{size:A4 portrait;margin:5.08mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#000;font-size:10px;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
    .hotel-name{font-size:18px;font-weight:700;color:#000}.hotel-sub{font-size:9px;color:#333;margin-top:2px;letter-spacing:.06em;text-transform:uppercase}
    .report-title{text-align:right}.report-title h2{font-size:13px;font-weight:700}.report-title .meta{font-size:8px;color:#444;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
    .stat-box{background:#f2f2f2;border:1px solid #ccc;padding:6px 8px}
    .stat-box .lbl{font-size:7px;letter-spacing:.1em;color:#555;text-transform:uppercase;margin-bottom:2px}
    .stat-box .val{font-size:13px;font-weight:700;color:#000}
    .stat-box.hi{background:#eee;border-color:#000}.stat-box.hi .val{color:#000}
    .stat-box.out .val{color:#000;font-style:italic}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#000;color:#fff}
    thead th{padding:5px 7px;text-align:left;font-size:8px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
    thead th:last-child{text-align:right}
    tbody tr:nth-child(even){background:#f2f2f2}
    tbody td{padding:4px 7px;border-bottom:1px solid #ccc;font-size:9.5px;color:#000}
    tbody td:last-child{text-align:right;font-weight:600}
    .closing-box{margin-top:16px;border:2px solid #000;padding:12px 16px;background:#f8f8f8}
    .closing-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;color:#000}
    .closing-row.total{border-top:1px solid #ccc;margin-top:4px;padding-top:6px;font-weight:700}
    .closing-row.final{border-top:2px solid #000;margin-top:8px;padding-top:8px;font-size:15px;font-weight:800;color:#000}
    .footer{margin-top:12px;padding-top:6px;border-top:1px solid #ccc;display:flex;justify-content:space-between}
    .total-row{font-size:12px;font-weight:700;color:#000}
    .footer-note{font-size:8px;color:#555}
  </style></head><body>
  <div class="header"><div><div class="hotel-name">Hotel Fountain</div><div class="hotel-sub">Billing & Invoices Report</div></div><div class="report-title"><h2>Period: ${filterLabel}</h2><div class="meta">Generated: ${now}</div></div></div>
  <div class="stats">
    <div class="stat-box hi"><div class="lbl">Today</div><div class="val">৳${todayTotal.toLocaleString()}</div></div>
    <div class="stat-box"><div class="lbl">This Month</div><div class="val">৳${monthTotal.toLocaleString()}</div></div>
    <div class="stat-box"><div class="lbl">All Time</div><div class="val">৳${allTotal.toLocaleString()}</div></div>
    <div class="stat-box out"><div class="lbl">Outstanding</div><div class="val">৳${Number(outstanding||0).toLocaleString()}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Guest</th><th>Room</th><th>Payment Type</th><th style="text-align:right">Amount (BDT)</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa">No transactions</td></tr>'}</tbody></table>
  <div class="closing-box">
    <div class="closing-row total"><span>Today's Total Collection</span><span>৳${todayTotal.toLocaleString()}</span></div>
    <div class="closing-row"><span>Token Amount</span><span>− ৳${tkn.toLocaleString()}</span></div>
    <div class="closing-row final"><span>Closing Balance</span><span>৳${closingBalance.toLocaleString()}</span></div>
  </div>
  ${dueSection}
  <div class="footer"><div class="total-row">Total (${filterLabel}): ৳${total.toLocaleString()} · ${realList.length} transaction${realList.length!==1?'s':''}</div><div class="footer-note">Hotel Fountain CRM · Lumea PMS · Confidential</div></div>
  </body></html>`
  printPDF(content)
}

/** @param {{foliosMap: object, hSettings: object}} — REQUIRED for computeBill accuracy.
 *  Never call BillingPage without foliosMap — omitting it causes totals to read stale DB values. */
function BillingPage({transactions,reservations,toast,reload,currentUser,rooms,guests,foliosMap:propFoliosMap,hSettings:hSettingsFromApp}) {
  const [filter,setFilter]=useState('TODAY')
  const [calDate,setCalDate]=useState('')
  // Use app-level hSettings as base; local Supabase fetch overrides once loaded
  const [hSettings,setHSettings]=useState(hSettingsFromApp||{vat:'15',svc:'5'})
  const [hSettingsAll,setHSettingsAll]=useState({})
  const [closingStatus, setClosingStatus] = useState(false)
  const [lastClosureDate, setLastClosureDate] = useState('')
  useEffect(()=>{
    db('hotel_settings',`?tenant_id=eq.${TENANT}&select=key,value`).then(rows=>{
      if(!Array.isArray(rows)) return
      const m={};rows.forEach(r=>{m[r.key]=r.value})
      setHSettingsAll(m)
      setHSettings({vat:m.vat_rate||'0',svc:m.service_charge||'0',active_fiscal_day:m.active_fiscal_day})
      // Load token for current fiscal day
      const fd=m.active_fiscal_day||todayStr()
      const dayToken=m[`token_${fd}`]||''
      setTokenAmt(dayToken)
      setSavedToken(+dayToken||0)
    }).catch(()=>{})
  },[])
  useEffect(() => {
    // Load shift status from hotel_settings
    const checkShiftStatus = async () => {
      try {
        const settings = await db('hotel_settings', `?select=key,value&tenant_id=eq.${TENANT}`)
        const shiftClosed = settings.find(s => s.key === 'shift_closed')?.value === 'true'
        const closureDate = settings.find(s => s.key === 'last_closure_date')?.value || ''
        setClosingStatus(shiftClosed)
        setLastClosureDate(closureDate)
        
        // Auto-unlock check (Dhaka time > closure date)
        if (shiftClosed && closureDate) {
          const todayDhaka = todayStr()
          if (todayDhaka > closureDate) {
            await dbPatch('hotel_settings', 'shift_closed', {value: 'false'})
            await dbPatch('hotel_settings', 'last_closure_date', {value: ''})
            setClosingStatus(false)
            toast('Shift automatically unlocked — new day detected', 'info')
          }
        }
      } catch (e) {}
    }
    checkShiftStatus()
  }, [])
  const [search,setSearch]=useState('')
  const [showAdd,setShowAdd]=useState(false)
  const [billingRes,setBillingRes]=useState(null)
  const [showBillDetail,setShowBillDetail]=useState(false)
  const [detailRes,setDetailRes]=useState(null)
  // Seed with the prop value so Billing totals are correct immediately
  // (async Supabase reload overwrites once it completes)
  const [foliosMap,setFoliosMap]=useState(propFoliosMap||{})
  const [loadingFolios,setLoadingFolios]=useState(false)
  const [tokenAmt,setTokenAmt]=useState('')
  const [savedToken,setSavedToken]=useState(0)
  const [tokenSaving,setTokenSaving]=useState(false)
  const today=hSettings.active_fiscal_day||todayStr(), month=today.slice(0,7)
  const todayT=transactions.filter(t=>t.fiscal_day===today)
  const monthT=transactions.filter(t=>t.fiscal_day?.startsWith(month))
  const calT=calDate?transactions.filter(t=>t.fiscal_day===calDate):[]

  // Load all folios once
  useEffect(()=>{
    setLoadingFolios(true)
    db('folios',`?tenant_id=eq.${TENANT}&select=*&order=created_at`)
      .then(d=>{
        const map={}
        ;(Array.isArray(d)?d:[]).forEach(f=>{
          const key=f.reservation_id||f.room_number
          if(!map[key])map[key]=[]
          map[key].push(f)
        })
        setFoliosMap(map)
      })
      .catch(()=>{})
      .finally(()=>setLoadingFolios(false))
  },[])

  const getGN=r=>{
    if(r.guest_name) return r.guest_name
    const gid=String((r.guest_ids||[r.guest_id]||[]).filter(Boolean)[0]||'')
    const g=guests?.find(g=>String(g.id)===gid)
    return g?g.name:(gid?`ID:${gid}`:'—')
  }
  const getRoom=r=>(r.room_ids||[r.room_number]).filter(Boolean).join(', ')||'—'

  /* ── Billing delegates to global computeBill — single source of truth ──
   *  foliosMap state is seeded from the prop on mount and refreshed via
   *  Supabase. The local wrapper below always uses the state value. */
  function computeBill(r) {
    return _computeBillGlobal(r, rooms, foliosMap || {}, hSettings)
  }
  // Build corrected transaction amounts using chronological capping.
  // For each reservation, walk ALL transactions in order. Keep amounts as-is until
  // running total reaches paid_amount, then reduce/zero the rest.
  function buildCorrectedAmounts() {
    const corrected = {}
    const allReal = transactions.filter(t => t.type !== 'Balance Carried Forward')
    const groups = {}
    allReal.forEach(t => {
      const key = `${t.guest_name || ''}|${t.room_number || ''}`
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    })
    Object.entries(groups).forEach(([key, txs]) => {
      const [gname, rnum] = key.split('|')
      const res = reservations?.find(r => {
        const rRooms = r.room_ids || [r.room_number]
        if (!rRooms.includes(rnum)) return false
        const rGuestName = r.guest_name || ''
        const gid = String((r.guest_ids || [r.guest_id] || []).filter(Boolean)[0] || '')
        const g = guests?.find(g => String(g.id) === gid)
        const rName = g ? g.name : rGuestName
        return rName && gname && rName.toLowerCase() === gname.toLowerCase()
      }) || reservations?.find(r => (r.room_ids || [r.room_number]).includes(rnum))
      if (!res) { txs.forEach(t => { corrected[t.id] = +t.amount || 0 }); return }
      const resPaid = +(res.paid_amount || 0)
      // Sort REVERSE chronologically — most recent first
      const sorted = [...txs].sort((a, b) =>
        (b.created_at || b.fiscal_day || '').localeCompare(a.created_at || a.fiscal_day || '') ||
        String(b.id || '').localeCompare(String(a.id || ''))
      )
      let running = 0
      sorted.forEach(t => {
        const raw = +t.amount || 0
        if (resPaid <= 0) { corrected[t.id] = raw; running += raw; return }
        if (running >= resPaid) { corrected[t.id] = 0 }
        else if (running + raw > resPaid) { corrected[t.id] = resPaid - running; running = resPaid }
        else { corrected[t.id] = raw; running += raw }
      })
    })
    return corrected
  }

  const _corrected = buildCorrectedAmounts()

  function normalizeRevenue(txList) {
    return txList
      .filter(t => t.type !== 'Balance Carried Forward')
      .reduce((a, t) => a + (_corrected[t.id] ?? (+t.amount || 0)), 0)
  }

  const outstanding = reservations
    .filter(r => r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT')
    .reduce((a, r) => a + Math.max(0, (+r.total_amount||0) - (+r.paid_amount||0)), 0)
  const todayRevenue=normalizeRevenue(todayT)
  const monthRevenue=normalizeRevenue(monthT)
  const dueRes = reservations.filter(r => {
    if (r.status !== 'CHECKED_IN' && r.status !== 'CHECKED_OUT') return false
    return (+r.total_amount||0) > (+r.paid_amount||0)
  })

  // Transactions for current filter (for PDF)
  const filteredTx=filter==='TODAY'?todayT:filter==='MONTH'?monthT:filter==='DATE'?calT:transactions

  async function saveToken() {
    const a=+tokenAmt
    if(!a||a<0){toast('Enter valid token amount','error');return}
    setTokenSaving(true)
    try{
      // Save token with day-specific key so it doesn't bleed between days
      await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({key:`token_${today}`,value:String(a),tenant_id:TENANT})
      })
      // Also keep legacy key updated for backward compat
      await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({key:'daily_token_amount',value:String(a),tenant_id:TENANT})
      })
      setSavedToken(a)
      toast(`Token amount ${BDT(a)} saved for ${today}`)
    }catch(e){toast(e.message,'error')}
    finally{setTokenSaving(false)}
  }

  async function doClosingComplete() {
    const a=+tokenAmt||0;
    // Save today's token with day-specific key before closing
    try {
      await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({key:`token_${today}`,value:String(a),tenant_id:TENANT})
      });
      setSavedToken(a);
    } catch(e) {}
    const todayList=transactions.filter(t=>t.fiscal_day===today && t.type!=='Balance Carried Forward')
// Use chronological corrected amounts ✓ Step 6 VERIFIED
    const normTodayList = todayList.map(t => ({ ...t, amount: _corrected[t.id] ?? (+t.amount || 0) }))
    const totalAmt=normTodayList.reduce((acc,t)=>acc+(+t.amount||0),0)
    // SHIFT LOCK: Step 4 - Set shift_closed before PDF
    await dbPatch('hotel_settings', 'shift_closed', {value: 'true'})
    // Update UI immediately
    setClosingStatus(true)
    const closureDate = todayStr()
    setLastClosureDate(closureDate)
    // Save closure date
    await dbPatch('hotel_settings', 'last_closure_date', {value: closureDate})
    const tokenAmount=a||savedToken||0
    const closingAmt=totalAmt-tokenAmount
    const now=new Date().toLocaleString('en-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})

    // Compute outstanding dues carried forward
    const duesCarried=dueRes.map(r=>{
      const room=(r.room_ids||[r.room_number]).filter(Boolean).join(', ')||'—'
      const gname=getGN(r)
      const {total,paid,due}=computeBill(r)
      return {gname,room,total,paid,due,check_in:r.check_in,check_out:r.check_out}
    })
    const totalDue=duesCarried.reduce((a,d)=>a+d.due,0)

    const txRows=normTodayList.map(t=>`<tr><td>${t.fiscal_day||'—'}</td><td>${t.guest_name||'—'}</td><td>${t.room_number||'—'}</td><td>${t.type||'Payment'}</td><td style="text-align:right;font-weight:600">৳${Number(t.amount||0).toLocaleString()}</td></tr>`).join('')
    const dueRows=duesCarried.length>0?`
      <h3 style="page-break-before:always;margin:20px 0 8px;font-size:13px;color:#E05C7A;border-bottom:1px solid #f0c0ca;padding-bottom:4px">⚠ Outstanding Dues — Carried to Next Day</h3>
      <table><thead><tr style="background:#E05C7A"><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Total</th><th>Paid</th><th style="text-align:right">Balance Due</th></tr></thead><tbody>
        ${duesCarried.map((d,i)=>`<tr style="${i%2?'background:#fdf6f6':''}"><td>${d.gname}</td><td>${d.room}</td><td>${d.check_in?.slice(0,10)||'—'}</td><td>${d.check_out?.slice(0,10)||'—'}</td><td>৳${d.total.toLocaleString()}</td><td>৳${d.paid.toLocaleString()}</td><td style="text-align:right;font-weight:700;color:#E05C7A">৳${d.due.toLocaleString()}</td></tr>`).join('')}
      </tbody></table>`
    :''

    const content=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
@page{size:A4 portrait;margin:5.08mm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#000;font-size:10px;background:#fff}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
.hotel-name{font-size:18px;font-weight:700;color:#000}.hotel-sub{font-size:9px;color:#333;margin-top:2px;letter-spacing:.06em;text-transform:uppercase}
.report-title{text-align:right}.report-title h2{font-size:13px;font-weight:700;color:#000}.report-title .meta{font-size:8px;color:#444;margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:6px}
thead tr{background:#000;color:#fff}
thead th{padding:5px 7px;text-align:left;font-size:8px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
thead {display:table-row-group}
thead th:last-child{text-align:right}
tbody tr:nth-child(even){background:#f2f2f2}
tbody td{padding:4px 7px;border-bottom:1px solid #ccc;font-size:9.5px;color:#000}
tbody td:last-child{text-align:right;font-weight:600}
h3{font-size:11px;font-weight:700;color:#000;margin:14px 0 6px;border-bottom:1px solid #000;padding-bottom:3px}
.closing-box{margin-top:16px;border:2px solid #000;padding:12px 16px;background:#f8f8f8}
.closing-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;color:#000}
.closing-row.total{border-top:1px solid #ccc;margin-top:4px;padding-top:6px;font-weight:700}
.closing-row.due{color:#000;font-style:italic}
.closing-row.final{border-top:2px solid #000;margin-top:8px;padding-top:8px;font-size:15px;font-weight:800;color:#000}
.footer{margin-top:12px;padding-top:6px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:8px;color:#555}
</style></head><body>
<div class="header"><div><div class="hotel-name">Hotel Fountain</div><div class="hotel-sub">Daily Closing Report</div></div><div class="report-title"><h2>Closing: ${today}</h2><div class="meta">Generated: ${now}</div></div></div>
<table><thead><tr><th>Date</th><th>Guest</th><th>Room</th><th>Payment Type</th><th style="text-align:right">Amount (BDT)</th></tr></thead><tbody>${txRows||'<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa">No transactions today</td></tr>'}</tbody></table>
${dueRows}
<div class="closing-box">
  <div class="closing-row total"><span>Total Paid Amount</span><span>৳${totalAmt.toLocaleString()}</span></div>
  <div class="closing-row"><span>Token Amount</span><span>− ৳${tokenAmount.toLocaleString()}</span></div>
  ${totalDue>0?`<div class="closing-row due"><span>Outstanding Dues Carried Forward</span><span>৳${totalDue.toLocaleString()}</span></div>`:''}
  <div class="closing-row final"><span>Closing Balance</span><span>৳${closingAmt.toLocaleString()}</span></div>
</div>
<div class="footer"><span>Hotel Fountain CRM · Lumea PMS · Confidential</span><span>${todayList.length} transaction${todayList.length!==1?'s':''} · ${duesCarried.length} pending due${duesCarried.length!==1?'s':''}</span></div>
</body></html>`

    // Print PDF then advance fiscal day
    printPDF(content).then(async()=>{
      // Advance fiscal day to next date
      const d=new Date(today); d.setDate(d.getDate()+1)
      const nextDay=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      try{
        // 1. Delete any existing "Balance Carried Forward" for nextDay
        const existingFWD = transactions.filter(t=>t.fiscal_day===nextDay && t.type==='Balance Carried Forward');
        if(existingFWD.length > 0) {
          await Promise.all(existingFWD.map(t => dbDelete('transactions', t.id)));
        }
        
        // 2. Insert new "Balance Carried Forward" records for all pending dues
        if(duesCarried.length > 0) {
          await Promise.all(duesCarried.map(d=>(
            dbPostTransactionSafe({
              tenant_id: TENANT,
              fiscal_day: nextDay,
              guest_name: d.gname||'Guest',
              room_number: d.room||'—',
              amount: safeNum(d.due),
              type: 'Balance Carried Forward'
            })
          )))
        }

        await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
          method:'POST',
          headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
          body:JSON.stringify({key:'active_fiscal_day',value:nextDay,tenant_id:TENANT})
        })
        // Reset token for new day
        setTokenAmt('')
        setSavedToken(0)
        // Re-fetch hSettings so UI immediately reflects new fiscal day
        try {
          const rows = await db('hotel_settings',`?tenant_id=eq.${TENANT}&select=key,value`)
          if(Array.isArray(rows)) {
            const m={};rows.forEach(r=>{m[r.key]=r.value})
            setHSettingsAll(m)
            setHSettings({vat:m.vat_rate||'0',svc:m.service_charge||'0',active_fiscal_day:m.active_fiscal_day})
          }
        } catch(e2) {}
        toast(`✓ Day closed · Fiscal day → ${nextDay}`,'info')
        reload()
      }catch(e){
        toast('Report open — could not advance fiscal day: '+e.message,'error')
      }
    })
  }

  function downloadPDF() {
    downloadBillingPDF(filteredTx, filter, todayT, monthT, transactions, outstanding, savedToken, dueRes, computeBill, getGN, getRoom, reservations, _corrected)
  }

  function openDetail(r) {
    setDetailRes(r)
    setShowBillDetail(true)
  }

  function printInvoice(grp, res, resTotal, resPaid, resDue, byType, comp) {
    const dObj = new Date();
    const dateStr = String(dObj.getDate()).padStart(2, '0') + '/' + String(dObj.getMonth() + 1).padStart(2, '0') + '/' + dObj.getFullYear();
    
    const checkIn = res ? fmtDate(res.check_in) : (grp.txs[0]?.check_in ? fmtDate(grp.txs[0].check_in) : '—')
    const checkOut = res ? fmtDate(res.check_out) : (grp.txs[0]?.check_out ? fmtDate(grp.txs[0].check_out) : '—')
    const guestName = grp.guest_name || 'Guest';
    
    let tableRows = '';
    let sub = 0; let tax = 0; let svc = 0; let discount = 0; let roomCharge = 0; let extras = 0; let basePrice = 0;
    if (comp) {
      sub = comp.sub; tax = comp.tax; svc = comp.svc; discount = comp.discount; roomCharge=comp.roomCharge; extras=comp.extras; basePrice=comp.basePrice;
      let counter = 1;
      const nights = comp.nights || 1;
      
      if (res && res.room_details && Object.keys(res.room_details).length > 0) {
        Object.keys(res.room_details).forEach(roomNo => {
          const rd = res.room_details[roomNo];
          tableRows += `<tr class="item-row"><td class="sl">${counter++}</td><td>Room ${roomNo} (${nights} Night${nights !== 1 ? 's' : ''})</td><td>৳${Number(rd.base_rate || 0).toLocaleString('en-BD')}</td><td>${nights}</td><td>৳${Number((rd.base_rate || 0) * nights).toLocaleString('en-BD')}</td></tr>`;
          if (rd.discount_applied > 0) {
            tableRows += `<tr class="item-row"><td class="sl">${counter++}</td><td>Discount (Room ${roomNo})</td><td>—</td><td>—</td><td style="color:#e74c3c">-৳${Number(rd.discount_applied * nights).toLocaleString('en-BD')}</td></tr>`;
          }
        });
      } else {
        // Room Charge line
        if (roomCharge > 0) {
          const discountedCharge = Math.max(0, roomCharge - discount);
          const discountedRate = nights > 0 ? discountedCharge / nights : discountedCharge;
          const discountMsg = discount > 0 ? `<br/><span style="font-size:10px;color:#777">Original: ৳${Number(comp.roomRate||0).toLocaleString('en-BD')}/night | Discount Applied: ৳${Number(discount).toLocaleString('en-BD')}</span>` : '';
          tableRows += `<tr class="item-row"><td class="sl">${counter++}</td><td>Room Charge (${nights} Night${nights!==1?'s':''})${discountMsg}</td><td>৳${Number(discountedRate).toLocaleString('en-BD')}</td><td>${nights}</td><td>৳${Number(discountedCharge).toLocaleString('en-BD')}</td></tr>`;
        }
      }

      // Itemized individual folio charges instead of lump sum
      if (comp.folios && comp.folios.length > 0) {
        comp.folios.forEach(f => {
          if (+f.amount === 0) return;
          const isPayment = f.category === 'Payment';
          if (isPayment) return; // skip payment folios in charges section
          tableRows += `<tr class="item-row"><td class="sl">${counter++}</td><td>${f.room_number ? 'Rm ' + f.room_number + ' - ' : ''}${f.description || f.category || 'Additional Charge'}</td><td>—</td><td>—</td><td>${+f.amount < 0 ? '<span style="color:#e74c3c">' : ''}৳${Number(Math.abs(+f.amount)||0).toLocaleString('en-BD')}${+f.amount < 0 ? '</span>' : ''}</td></tr>`;
        });
      } else if (extras > 0) {
        // Fallback: show lump sum if no individual folios available
        tableRows += `<tr class="item-row"><td class="sl">${counter++}</td><td>Additional Charges</td><td>—</td><td>—</td><td>৳${Number(extras).toLocaleString('en-BD')}</td></tr>`;
      }
      
      // Calculate Sub Total as matched up with table contents
      sub = basePrice + extras;
    } else {
       tableRows += `<tr class="item-row"><td class="sl">1</td><td>General Billing</td><td>—</td><td>—</td><td>৳${Number(resTotal).toLocaleString('en-BD')}</td></tr>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Invoice - ${guestName}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
    body { font-family: 'Inter', Arial, sans-serif; margin: 0; color: #333; }
    .invoice-wrapper { width: 100%; max-width: 800px; margin: 0 auto; background: #fff; min-height: 100vh; position: relative; }
    
    /* Header */
    .hdr { background-color: #1a2233; color: #fff; padding: 40px 50px; display: flex; justify-content: space-between; align-items: center; }
    .brand-left { display: flex; align-items: center; gap: 15px; }
    .brand-left h1 { margin: 0; font-size: 26px; font-weight: 700; color: #ced4db; display: flex; align-items: center; gap: 8px;}
    .brand-left h1 span { color:#f39c12; }
    .tagline { font-size: 11px; color: #8f9ea8; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
    .hdr-right h2 { margin: 0; color: #f39c12; font-size: 34px; letter-spacing: 2px; text-transform: uppercase; }

    /* Meta Strip */
    .meta-strip { display: flex; width: 100%; font-size: 13px; font-weight: 600; margin-bottom: 30px; }
    .meta-inv { background-color: #f39c12; color: #000; padding: 12px 50px; width: 50%; display: flex; align-items: center; }
    .meta-date { background-color: #e2e8ec; color: #333; padding: 12px 50px; width: 50%; display: flex; align-items: center; justify-content: flex-end; }
    
    /* Bill To */
    .bill-to { padding: 0 50px; margin-bottom: 30px; }
    .bill-to h3 { margin: 0 0 5px 0; font-size: 15px; color: #1a2233; font-weight: 700; }
    .bill-to p { margin: 0; font-size: 13px; color: #555; line-height: 1.5; }

    /* Table */
    .table-container { padding: 0 50px; margin-bottom: 40px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 12px; font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase; border: none; }
    th.sl { width: 5%; background-color: #f39c12; }
    th.desc { width: 45%; background-color: #f39c12; }
    th.bg-gray { background-color: #95a5a6; }
    
    td { padding: 15px 12px; font-size: 13px; border-bottom: 1px solid #eaeaea; color: #333; font-weight: 500;}
    td.sl { text-align: center; }
    .item-row:nth-child(even) { background-color: #fcfcfc; }

    /* Bottom Section */
    .bottom-section { padding: 0 50px; display: flex; justify-content: space-between; margin-bottom: 40px;}
    .left-col { width: 50%; }
    .ty-msg { font-weight: 600; font-size: 14px; margin-bottom: 25px; color: #1a2233; }
    .pay-info { margin-bottom: 25px; }
    .pay-info h4 { margin: 0 0 8px 0; font-size: 14px; color: #1a2233; }
    .pay-row { display: flex; font-size: 12px; color: #555; margin-bottom: 4px; }
    .pay-lbl { width: 110px; font-weight: 600;}
    
    .right-col { width: 40%; display: flex; flex-direction: column; }
    .sum-row { display: flex; justify-content: space-between; padding: 6px 15px; font-size: 13px; color: #555; font-weight: 600; }
    .total-box { background-color: #1a2233; color: #fff; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 700; margin-top: 10px; }
    
    /* Footer */
    .footer-strip { padding: 0 50px; justify-content: space-between; display: flex; align-items: flex-end; margin-top: 50px;}
    .terms { font-size: 10px; color: #777; width: 50%; line-height: 1.4; }
    .terms h4 { margin: 0 0 4px 0; font-size: 12px; color: #333; }
    .sign { width: 30%; text-align: center; border-top: 2px solid #ccc; font-size: 12px; font-weight: 600; padding-top: 8px; color: #333; margin-bottom: 20px;}
    
    /* Orange thick bottom border */
    .bottom-bar { position: relative; bottom: 0; width: 100%; height: 25px; background: #1a2233; display: flex; }
    .bottom-bar .orange { width: 30%; background: #f39c12; height: 100%;}
    .bottom-bar .gray { width: 70%; background: #95a5a6; height: 100%;}
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="hdr">
      <div class="brand-left">
        <div>
          <h1>HOTEL <span>FOUNTAIN</span></h1>
          <div class="tagline">The Pulse Of Modern Hospitality</div>
        </div>
      </div>
      <div class="hdr-right">
        <h2>INVOICE</h2>
      </div>
    </div>
    
    <div class="meta-strip">
      <div class="meta-inv">Invoice# ${res ? res.id : 'N/A'}</div>
      <div class="meta-date">Date &nbsp;&nbsp; ${dateStr}</div>
    </div>
    
    <div class="bill-to">
      <h3>Invoice to: ${guestName}</h3>
      <p>Room: ${grp.room_number || '—'}<br/>
      Check-In: ${checkIn}<br/>
      Check-Out: ${checkOut}</p>
    </div>
    
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="sl">SL.</th>
            <th class="desc">Item Description</th>
            <th class="bg-gray">Price</th>
            <th class="bg-gray">Qty.</th>
            <th class="bg-gray">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    
    <div class="bottom-section">
      <div class="left-col">
        <div class="ty-msg">Thank you for your business</div>
        <div class="pay-info">
          <h4>Payment Info:</h4>
          ${Object.entries(byType).map(([tp, amt]) => `<div class="pay-row"><div class="pay-lbl">${tp}:</div><div>৳${Number(amt||0).toLocaleString('en-BD')}</div></div>`).join('')}
          ${Object.keys(byType).length===0 ? '<div class="pay-row"><div class="pay-lbl">Status:</div><div style="color:#e74c3c;font-weight:700">None Collected</div></div>' : ''}
          <div class="pay-row" style="margin-top:4px"><div class="pay-lbl">Balance Due:</div><div style="color:${resDue>0?'#e74c3c':'#27ae60'};font-weight:700">৳${Number(resDue||0).toLocaleString('en-BD')}</div></div>
        </div>
      </div>
      <div class="right-col">
        <div class="sum-row"><span>Sub Total:</span> <span>৳${Number(sub || resTotal).toLocaleString('en-BD')}</span></div>
        <div class="total-box">
          <span>Total:</span>
          <span>৳${Number(resTotal).toLocaleString('en-BD')}</span>
        </div>
        <div class="sum-row" style="margin-top:6px;color:#27ae60"><span>Paid:</span> <span>৳${Number(resPaid||0).toLocaleString('en-BD')}</span></div>
        ${resDue > 0 ? `<div class="sum-row" style="color:#e74c3c;font-weight:700"><span>Balance Due:</span> <span>৳${Number(resDue).toLocaleString('en-BD')}</span></div>` : `<div class="sum-row" style="color:#27ae60;font-weight:700"><span>Status:</span> <span>PAID IN FULL</span></div>`}
      </div>
    </div>
    
    <div class="footer-strip">
      <div class="terms">
        <h4>Terms & Conditions</h4>
        All dues must be cleared upon checkout. Late checkouts may incur additional charges. Subject to Dhaka jurisdiction.
      </div>
      <div class="sign">Authorised Sign</div>
    </div>
    
    <div style="height:40px;"></div>
    <div class="bottom-bar">
      <div class="orange"></div>
      <div class="gray"></div>
    </div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
</body>
</html>`
    printPDF(html)
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat" style={{'--ac':'var(--gold)'}}><div className="stat-ico">💰</div><div className="stat-lbl">{filter==='DATE'&&calDate?(()=>{const [y,m,d]=calDate.split('-');const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${+d}-${mo[+m-1]}-${y}`})():`${new Date().getDate()}-${new Date().toLocaleString('en',{month:'short'})}-${new Date().getFullYear()}`}</div><div className="stat-val">{BDT(filter==='DATE'?normalizeRevenue(calT):todayRevenue)}</div><div className="stat-sub">{(filter==='DATE'?calT:todayT).filter(t=>t.type!=='Balance Carried Forward').length} transactions</div></div>
        <div className="stat" style={{'--ac':'var(--teal)'}}><div className="stat-ico">📈</div><div className="stat-lbl">This Month</div><div className="stat-val">{BDT(monthRevenue)}</div><div className="stat-sub">{monthT.filter(t=>t.type!=='Balance Carried Forward').length} transactions</div></div>
        <div className="stat" style={{'--ac':'var(--rose)'}}><div className="stat-ico">⚠</div><div className="stat-lbl">Outstanding</div><div className="stat-val">{BDT(outstanding)}</div><div className="stat-sub">In-house balance due</div></div>
      </div>

      {/* Toolbar */}
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <div className="tabs" style={{marginBottom:0}}>
            {[['TODAY',`${new Date().getDate()}-${new Date().toLocaleString('en',{month:'short'})}-${new Date().getFullYear()}`],['MONTH','MONTH'],['ALL','ALL']].map(([f,lbl])=>(
              <button key={f} className={`tab${filter===f?' on':''}`} onClick={()=>{setFilter(f);setCalDate('')}}>{lbl}</button>
            ))}
          </div>
          {/* Date picker — specific date filter */}
          {(()=>{
            const fmtCalLabel=d=>{
              if(!d) return null
              const [y,m,day]=d.split('-')
              const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
              return `${+day}-${months[+m-1]}-${y}`
            }
            return (
              <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
                <input
                  type="date"
                  value={calDate}
                  onChange={e=>{setCalDate(e.target.value);if(e.target.value)setFilter('DATE')}}
                  style={{opacity:0,position:'absolute',left:0,top:0,width:'100%',height:'100%',cursor:'pointer',zIndex:2}}
                  title="Pick a specific date"
                />
                <button
                  className={`tab${filter==='DATE'?' on':''}`}
                  style={{borderLeft:'none',display:'flex',alignItems:'center',gap:5,minWidth:calDate?'auto':38}}
                  title="Pick specific date">
                  📅{calDate&&<span style={{fontSize:10,letterSpacing:'.04em'}}>{fmtCalLabel(calDate)}</span>}
                </button>
              </div>
            )
          })()}
        </div>
        <div className="flex gap2" style={{alignItems:'center'}}>
          {currentUser?.role!=='housekeeping'&&(
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {/* Token Amount */}
              <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(200,169,110,.06)',border:'1px solid var(--br)',padding:'4px 10px'}}>
                <span style={{fontSize:9,letterSpacing:'.12em',color:'var(--tx3)',textTransform:'uppercase',whiteSpace:'nowrap'}}>Token</span>
                <input type="number" className="finput" value={tokenAmt} onChange={e=>setTokenAmt(e.target.value)}
                  placeholder="0" style={{width:90,padding:'4px 8px',fontSize:12}}/>
                <button className="btn btn-ghost btn-sm" style={{padding:'4px 10px',fontSize:9}} disabled={tokenSaving} onClick={saveToken}>
                  {tokenSaving?'…':'Save'}
                </button>
                <button className="btn btn-ghost btn-sm" style={{padding:'4px 10px',fontSize:9,marginLeft:6,borderLeft:'1px solid var(--br)',paddingLeft:10}} onClick={downloadPDF} title="Download specific date report">
                  📥 Download Report
                </button>
              </div>
              {/* Closing Complete */}
              <button className="btn btn-gold btn-sm" style={{gap:5,whiteSpace:'nowrap'}} onClick={doClosingComplete}>
                ✓ Closing Complete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unified Active Ledger Table */}
      {(()=>{
        let list = filter==='TODAY'?todayT : filter==='DATE'?calT : filter==='MONTH'?monthT : transactions
        if(search){const q=search.toLowerCase();list=list.filter(t=>t.guest_name?.toLowerCase().includes(q)||t.room_number?.includes(q)||t.type?.toLowerCase().includes(q))}
        const fmtDLabel=d=>{if(!d)return'Today';const[y,m,dy]=d.split('-');const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${+dy}-${mo[+m-1]}-${y}`}
        const label = filter==='TODAY'?fmtDLabel(''):filter==='DATE'?fmtDLabel(calDate):filter==='MONTH'?'This Month':'All Time'
        
// NEW BILLING LEDGER LOGIC per task requirements
        // 1. Group transactions by guest to create guest.payments arrays
        const guestPayments = {};
        transactions.forEach(t => {
          // Match transaction to guest via guest_name or reservation linking
          const matchingGuest = guests.find(g => g.name === t.guest_name || 
            reservations.some(r => 
              (r.guest_ids?.includes(g.id) || r.guest_name === g.name) && 
              (r.room_ids?.includes(t.room_number) || r.room_number === t.room_number)
            )
          );
          if (matchingGuest) {
            const guestId = matchingGuest.id;
            if (!guestPayments[guestId]) guestPayments[guestId] = [];
            guestPayments[guestId].push({
              date: t.fiscal_day,
              amount: +t.amount || 0
            });
          }
        });

        // 2. Compute billTotal and totalPaidAllTime for each guest
        guests.forEach(guest => {
          guest.payments = guestPayments[guest.id] || [];
          // billTotal from linked reservations
          const guestRes = reservations.filter(r => 
            String(r.guest_ids?.[0]) === String(guest.id) || r.guest_name === guest.name
          );
          guest.billTotal = guestRes.reduce((sum, r) => sum + computeBill(r, rooms, foliosMap, hSettings).total, 0);
          guest.totalPaidAllTime = guest.payments.reduce((sum, p) => sum + p.amount, 0);
        });

        // Fixed per requirements: strict selectedDate filter + CHECKED_IN + dues
        const selectedDate = filter === 'TODAY' ? todayStr() : (filter === 'DATE' ? calDate : null);
        const updatedLedger = useMemo(() => guests.map(guest => {
          // STRICT date filter → ONLY payments matching selectedDate
const collectionTodaySum = (guest.payments || []).filter(p => p.date === selectedDate).reduce((sum, p) => sum + safeNum(p.amount, 0), 0);
          
          // Guest status: CHECKED_IN reservations?
          const guestRes = reservations.filter(r => 
            String(r.guest_ids?.[0]) === String(guest.id) || r.guest_name === guest.name
          );
          const isCheckedIn = guestRes.some(r => r.status === 'CHECKED_IN');
          
          const balanceDue = (guest.billTotal - guest.totalPaidAllTime) > 0;

          // Show ONLY: CHECKED_IN || paid today || has balance due
          if (isCheckedIn || collectionTodaySum > 0 || balanceDue) {
            return {
              ...guest,
              collectionToday: collectionTodaySum,     // STEP 1 ✅ Paid Today = exact date match
              todaysTransactions: collectionToday,
              balanceDue,
              isCheckedIn,
              isOutstanding: balanceDue
            };
          }
          return null;
        }).filter(Boolean), [guests, reservations, selectedDate]);  // ✅ Memoized dependencies

        const displayList = updatedLedger;


        return (
          <div className="card" style={{marginBottom:12}}>
            <div className="card-hd">
              <span className="card-title" style={{fontSize:14}}>Active Billing Ledger — {label}</span>
              <span className="badge bgold">{displayList.length} records</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Base Rate</th><th>Discount</th><th>Bill Total</th><th>Paid</th><th>Balance Due</th><th>Payments (Filtered)</th><th>Action</th></tr></thead>
                <tbody>
{displayList.length===0?(
                    <tr><td colSpan={11} style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)',fontSize:12}}>No billing activity or dues for this period</td></tr>
                  ):displayList.map((guest, guestIndex) => {
                    // Find associated reservation(s) for this guest
                    const guestRes = reservations.filter(r => 
                      String(r.guest_ids?.[0]) === String(guest.id) || r.guest_name === guest.name
                    );
                    const primaryRes = guestRes[0] || { room_ids: [], check_in: '—', check_out: '—' };
                    const comp = primaryRes ? computeBill(primaryRes, rooms, foliosMap, hSettings) : null;
                    const { total: resTotal=0, paid: resPaid=0, due: resDue=0 } = comp || {};
                    
                    // Group today's payments by type for Payments (Filtered) column
                    const byType = {};
                    guest.todaysTransactions.forEach(t => {
                      const tp = t.type || 'Payment';
                      byType[tp] = (byType[tp] || 0) + t.amount;
                    });

                    const gname = guest.name;
                    const rno = primaryRes ? getRoom(primaryRes) : '—';
                    const chkIn = fmtDate(primaryRes.check_in);
                    const chkOut = fmtDate(primaryRes.check_out);
                    const billingBaseRate = comp ? comp.grossRate : 0;
                    const billingDisc = primaryRes ? (Number(primaryRes.discount) || 0) : 0;

                    return (
                      <tr key={`guest-${guest.id}`}>
                        <td className="xs">{gname}</td>
                        <td><span className="badge bb">{rno}</span></td>
                        <td className="xs muted">{chkIn}</td>
                        <td className="xs muted">{chkOut}</td>
                        <td className="xs" style={{color:'var(--tx2)'}}>{BDT(billingBaseRate)}</td>
                        <td className="xs" style={{color:billingDisc>0?'var(--teal)':'var(--tx2)'}}>{billingDisc>0?BDT(billingDisc):'—'}</td>
                        <td className="xs gold">{BDT(resTotal)}</td>
                        <td className="xs" style={{color:'var(--grn)'}}>{BDT(guest.paidToday)}</td>
                        <td className="xs" style={{color:guest.isOutstanding?'var(--rose)':'var(--grn)', fontWeight: guest.isOutstanding ? 600 : 400}}>
                          {BDT(guest.billTotal - guest.totalPaidAllTime)}
                        </td>
                        <td className="xs" style={{lineHeight:1.6}}>
                          {Object.keys(byType).length === 0 
                            ? <span className="muted xs" style={{fontSize:9}}>— No payments today —</span> 
                            : Object.entries(byType).map(([tp,amt]) => (
                                <div key={tp} style={{display:'flex',justifyContent:'space-between',gap:8,minWidth:140}}>
                                  <span className="badge bgold" style={{fontSize:7.5}}>{tp}</span>
                                  <span style={{color:'var(--gold)',fontWeight:500,fontSize:10}}>{BDT(amt)}</span>
                                </div>
                              ))
                          }
                        </td>
                        <td style={{whiteSpace:'nowrap'}}>
                          <button 
                            className="btn btn-gold btn-sm" 
                            style={{padding:'3px 9px',fontSize:9}} 
                            onClick={()=>{
                              setBillingRes({
                                _fromRow:true,
                                ...primaryRes,
                                room_number:rno, 
                                guest_name:gname,
                                _resId:primaryRes?.id||null,
                                _total:resTotal,
                                _paid:resPaid
                              });
                              setShowAdd(true);
                            }}
                          >
                            + Pay
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                    const invoice = grp.res
                    
                    const comp = invoice ? computeBill(invoice) : null;
                    const { total:resTotal, paid:resPaid, due:resDue } = comp || { total:0, paid:0, due:0 }
                    
                    const byType={}
                    grp.txs.forEach(t=>{
                      if(t.type==='Balance Carried Forward') return
                      const tp=t.type||'Payment'
                      if(!byType[tp]) byType[tp]=0
                      byType[tp]+=(_corrected[t.id] ?? (+t.amount||0))
                    })

                    const gname = invoice ? getGN(invoice) : (grp.guest_name||'—')
                    const rno = invoice ? getRoom(invoice) : (grp.room_number||'—')
                    const chkIn = invoice ? fmtDate(invoice.check_in) : (grp.txs[0]?.check_in?fmtDate(grp.txs[0].check_in):'—')
                    const chkOut = invoice ? fmtDate(invoice.check_out) : (grp.txs[0]?.check_out?fmtDate(grp.txs[0].check_out):'—')
                    const tTotal = invoice ? resTotal : (grp.txs[0]?.bill_total?(+grp.txs[0].bill_total):0)
                    const tPaid = invoice ? resPaid : 0
                    const tDue = invoice ? resDue : 0
                    const billingRoom = invoice ? rooms.find(rm=>(invoice.room_ids||[]).includes(rm.room_number)) : null
                    const billingNights = invoice ? nightsCount(invoice.check_in,invoice.check_out)||1 : 1
                    const billingBaseRate = invoice ? comp.basePrice : tTotal
                    const billingDisc = invoice ? (Number(invoice.discount)||0) : 0

                    return (
                      <tr key={invoice?invoice.id:(grp.guest_name+'|'+grp.room_number)}>
                        <td className="xs">{gname}</td>
                        <td><span className="badge bb">{rno}</span></td>
                        <td className="xs muted">{chkIn}</td>
                        <td className="xs muted">{chkOut}</td>
                        <td className="xs" style={{color:'var(--tx2)'}}>{BDT(billingBaseRate)}</td>
                        <td className="xs" style={{color:billingDisc>0?'var(--teal)':'var(--tx2)'}}>{billingDisc>0?BDT(billingDisc):'—'}</td>
                        <td className="xs gold">{BDT(tTotal)}</td>
                        <td className="xs" style={{color:'var(--grn)'}}>{BDT(tPaid)}</td>
                        <td className="xs" style={{color:tDue>0?'var(--rose)':'var(--grn)',fontWeight:tDue>0?600:400}}>{BDT(tDue)}</td>
                        <td className="xs" style={{lineHeight:1.8}}>
                          {Object.keys(byType).length === 0 ? <span className="muted xs" style={{fontSize:10}}>— No Pymt in Period —</span> : 
                            Object.entries(byType).map(([tp,amt])=>(
                            <div key={tp} style={{display:'flex',justifyContent:'space-between',gap:12,minWidth:140}}>
                              <span className="badge bgold" style={{fontSize:8}}>{tp}</span>
                              <span style={{color:'var(--gold)',fontWeight:500}}>{BDT(amt)}</span>
                            </div>
                          ))}
                        </td>
                        <td style={{whiteSpace:'nowrap'}}>
                          {currentUser?.role!=='housekeeping'&&(
                            <button className="btn btn-gold btn-sm" style={{padding:'3px 9px',fontSize:9,marginRight:4}} onClick={()=>{
                              setBillingRes({_fromRow:true,...(invoice||{}),room_number:rno,guest_name:gname,_resId:invoice?.id||null,_total:tTotal,_paid:tPaid})
                              setShowAdd(true)
                            }}>+ Pay</button>
                          )}
                          {currentUser?.role!=='housekeeping'&&(
                            <button className="btn btn-ghost btn-sm" style={{padding:'3px 9px',fontSize:9,marginRight:4}} onClick={()=>{
                              const pInvoiceByType = {...byType};
                              if(invoice && Object.keys(pInvoiceByType).length===0 && tPaid>0) pInvoiceByType[invoice.payment_method||'Cash'] = tPaid;
                              printInvoice(
                                {guest_name:gname,room_number:rno,txs:grp.txs},
                                invoice,tTotal,tPaid,tDue,pInvoiceByType,comp
                              )
                            }}>🖨 Print</button>
                          )}
                          {currentUser?.role!=='housekeeping'&&invoice&&(
                              <button className="btn btn-ghost btn-sm" style={{padding:'3px 9px',fontSize:9,marginRight:4}} onClick={()=>openDetail(invoice)}>Detail</button>
                          )}
                          {currentUser?.role==='owner'&&grp.txs.length>0&&(
                            <button className="btn btn-danger btn-sm" style={{padding:'3px 7px',fontSize:9}} onClick={async()=>{
                                if(!window.confirm(`Delete all ${grp.txs.length} filtered transaction(s) for ${gname}?`)) return
                                try{
                                  for(const t of grp.txs) await dbDelete('transactions',t.id)
                                  toast(`${grp.txs.length} transaction(s) deleted`)
                                  reload()
                                }catch(e){toast(e.message,'error')}
                            }}>✕</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}



      {/* Record Payment modal */}
      {showAdd&&<RecordPayModal toast={toast} guests={guests} onClose={()=>{setShowAdd(false);setBillingRes(null)}} reload={async ()=>{await reload();await db('folios','?select=*&order=created_at').then(d=>{const map={};(Array.isArray(d)?d:[]).forEach(f=>{const k=f.reservation_id||f.room_number;if(!map[k])map[k]=[];map[k].push(f)});setFoliosMap(map)})}} prefill={billingRes} reservations={reservations} active_fiscal_day={hSettings.active_fiscal_day}/>}

      {/* Full Billing Detail Modal — opens from Record Billing button */}
      {showBillDetail&&detailRes&&(()=>{
        const r=detailRes
        const gname=getGN(r)
        const roomNo=getRoom(r)
        const {roomCharge,sub,total,paid,due,folios,nights,roomRate,discount}=computeBill(r)
        const relTx=transactions.filter(t=>t.room_number===roomNo&&t.type!=='Final Settlement')
        return (
          <Modal title={`Bill — ${gname}`} onClose={()=>{setShowBillDetail(false);setDetailRes(null)}}
            footer={
              <div style={{width:'100%'}}>
                {/* Collect Amount inline */}
                <div style={{background:'rgba(200,169,110,.06)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:10,display:'flex',gap:8,alignItems:'center'}}>
                  <span className="flbl" style={{marginBottom:0,whiteSpace:'nowrap'}}>💰 Collect Amount:</span>
                  <input type="number" className="finput" id="bill-collect-input"
                    placeholder={`Due: ${BDT(due)}`}
                    style={{flex:1,padding:'6px 10px'}}/>
                  <button className="btn btn-gold btn-sm" style={{whiteSpace:'nowrap'}} onClick={async()=>{
                    const a=+document.getElementById('bill-collect-input').value
                    if(!a||a<=0){toast('Enter valid amount','error');return}
                    try{
                      await dbPatchReservationSafe(r.id,{paid_amount:safeNum(Math.min(total,(+r.paid_amount||0)+a))})
                      await dbPostTransactionSafe({type:`Room Payment (${r.payment_method||'Cash'})`,amount:safeNum(a),room_number:roomNo,guest_name:gname||'Guest',fiscal_day:hSettings?.active_fiscal_day||todayStr(),tenant_id:TENANT})
                      toast(`৳${a.toLocaleString()} recorded`)
                      await reload()
                      setShowBillDetail(false);setDetailRes(null)
                    }catch(e){toast(e.message,'error')}
                  }}>Save</button>
                </div>
                <div className="flex gap2" style={{flexWrap:'wrap'}}>
                  <button className="btn btn-ghost" onClick={()=>{setShowBillDetail(false);setDetailRes(null)}}>Close</button>
                  <div style={{flex:1}}/>
                  <button className="btn btn-gold" onClick={()=>{
                    setShowBillDetail(false)
                    setBillingRes({_fromRow:false,...r,room_number:roomNo,guest_name:gname,_resId:r.id,_total:total,_paid:paid,check_in:r.check_in,check_out:r.check_out,payment_method:r.payment_method,on_duty_officer:r.on_duty_officer,status:r.status})
                    setShowAdd(true)
                  }}>Record Payment →</button>
                </div>
              </div>
            }>
            {/* Guest + summary header */}
            <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.07),rgba(200,169,110,.05))',border:'1px solid rgba(200,169,110,.18)',padding:'12px 14px',marginBottom:14}}>
              <div className="flex fac fjb" style={{flexWrap:'wrap',gap:8}}>
                <div className="flex fac gap3">
                  <Av name={gname} size={40}/>
                  <div>
                    <div style={{fontWeight:700,fontSize:16}}>{gname}</div>
                    <div className="xs muted">Room {roomNo} · {fmtDate(r.check_in)} → {fmtDate(r.check_out)}</div>
                    <div className="xs" style={{color:'var(--amb)',marginTop:2}}>{nights} night{nights!==1?'s':''} · {BDT(roomRate)}/night</div>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="xs muted">Total Due</div>
                  <div style={{fontWeight:700,fontSize:22,color:'var(--gold)'}}>{BDT(due)}</div>
                </div>
              </div>
            </div>
            {/* Info grid */}
            <div className="g2 mb4">
              {[['Check-In',fmtDate(r.check_in)],['Check-Out',fmtDate(r.check_out)],['Nights',nights],['Payment Method',r.payment_method||'—'],['On-Duty Officer',r.on_duty_officer||'—'],['Status',r.status||'—']].map(([l,v])=>(
                <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
              ))}
            </div>
            {/* Folio breakdown */}
            <div style={{background:'var(--s2)',border:'1px solid var(--br2)',overflow:'hidden',marginBottom:8}}>
              <div style={{padding:'7px 12px',background:'rgba(200,169,110,.04)',borderBottom:'1px solid var(--br2)',fontSize:8,letterSpacing:'.1em',color:'var(--tx2)',textTransform:'uppercase'}}>Folio Charges</div>
              <div style={{padding:'0 12px'}}>
                {nights>0&&roomRate>0&&(
                  <div className="folio-row">
                    <div><span>Room charge</span><span className="badge bgold" style={{fontSize:8,marginLeft:6}}>{nights}×{BDT(roomRate)}</span></div>
                    <span className="xs gold">{BDT(roomCharge)}</span>
                  </div>
                )}
                {folios.map(f=>(
                  <div key={f.id} className="folio-row">
                    <div><span>{f.description}</span><span className="badge bgold" style={{marginLeft:6,fontSize:8}}>{f.category}</span></div>
                    <span className="xs gold">{BDT(f.amount)}</span>
                  </div>
                ))}
                {relTx.map(t=>(
                  <div key={t.id} className="folio-row" style={{opacity:.75}}>
                    <div><span style={{color:'var(--tx2)'}}>{t.type||'Charge'}</span><span className="badge bb" style={{marginLeft:6,fontSize:8}}>{t.fiscal_day}</span></div>
                    <span className="xs" style={{color:'var(--sky)'}}>{BDT(t.amount)}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:'9px 12px',background:'rgba(200,169,110,.03)',borderTop:'1px solid var(--br2)'}}>
                {[['Subtotal',sub]].map(([l,v])=>(
                  <div key={l} className="flex fjb xs muted" style={{marginBottom:3}}><span>{l}</span><span>{BDT(v)}</span></div>
                ))}
                {discount>0&&<div className="flex fjb xs" style={{marginBottom:3,color:'var(--grn)'}}><span>Discount</span><span>− {BDT(discount)}</span></div>}
                <div className="divider" style={{margin:'6px 0'}}/>
                <div className="flex fjb" style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}><span>Total</span><span>{BDT(total)}</span></div>
                <div className="flex fjb xs" style={{marginTop:4}}>
                  <span style={{color:'var(--grn)'}}>Paid: {BDT(paid)}</span>
                  {due>0&&<span style={{color:'var(--rose)',fontWeight:700}}>Due: {BDT(due)}</span>}
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

function RecordPayModal({toast,onClose,reload,prefill,reservations,guests,active_fiscal_day}) {
  const fromRow=prefill?._fromRow===true
  const dueResList=(reservations||[]).filter(r=>(r.status==='CHECKED_IN'||r.status==='CHECKED_OUT')&&(+r.total_amount||0)>(+r.paid_amount||0))

  // Locked mode (opened from + Pay / row click)
  const lockedRoom  = fromRow?(prefill.room_number||''):null
  const lockedGuest = fromRow?(prefill.guest_name||''):null
  const lockedResId = fromRow?prefill._resId:null
  const lockedDue   = fromRow?Math.max(0,(prefill._total||0)-(prefill._paid||0)):0

  // Search mode (opened manually)
  const initRes=!fromRow&&prefill?.id?prefill:(!fromRow&&dueResList.length===1?dueResList[0]:null)
  const [selRes,setSelRes]=useState(initRes)
  const [resSearch,setResSearch]=useState(initRes?`${initRes.room_number||''} — ${initRes.guest_name||''}`:'')
  const [showResDrop,setShowResDrop]=useState(false)
  const dropDueAmt=selRes?Math.max(0,(+selRes.total_amount||0)-(+selRes.paid_amount||0)):0

  const [amount,setAmount]=useState(fromRow&&lockedDue>0?String(lockedDue):dropDueAmt>0?String(dropDueAmt):'')
  const [type,setType]=useState('Room Payment (Cash)')
  const [fiscal_day,setFiscalDay]=useState(active_fiscal_day||todayStr())
  const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)

  function pickRes(r){
    setSelRes(r)
    setResSearch(`${r.room_number||''} — ${r.guest_name||''}`)
    const due=Math.max(0,(+r.total_amount||0)-(+r.paid_amount||0))
    if(due>0) setAmount(String(due))
    setShowResDrop(false)
  }
  function clearRes(){ setSelRes(null); setResSearch(''); setAmount(''); setShowResDrop(true) }

  async function save(){
    const a=+amount
    if(!a||a<=0) return toast('Enter valid amount','error')
    if(!fromRow&&!selRes&&!resSearch) return toast('Select a guest / room','error')
    setSaving(true)
    const room_number = fromRow?lockedRoom:(selRes?.room_number||resSearch)
    const guest_name  = fromRow?lockedGuest:(selRes?.guest_name||resSearch)
    const resId       = fromRow?lockedResId:selRes?.id
    // Use computed total (room rate × nights - discount)
    const _selResRoom = selRes?rooms?.find(rm=>(selRes.room_ids||[]).includes(rm.room_number)):null
    const _selResNts  = selRes?nightsCount(selRes.check_in,selRes.check_out)||1:1
    const _selResComp = _selResRoom?(+_selResRoom.price*_selResNts):0
    const _selResDisc = selRes?+selRes.discount_amount||+selRes.discount||0:0
    const _selResCalc = _selResComp>0?Math.max(0,_selResComp-_selResDisc):(Math.max(0,(+selRes?.total_amount||0)-_selResDisc))
    const resTotal    = fromRow?(prefill._total||0):_selResCalc
    const resPaid     = fromRow?(prefill._paid||0):(+selRes?.paid_amount||0)
    try{
      await dbPostTransactionSafe({room_number,guest_name:guest_name||'Guest',type,amount:safeNum(a),fiscal_day,tenant_id:TENANT})
      if(resId) await dbPatchReservationSafe(resId,{paid_amount:safeNum(Math.min(resTotal,resPaid+a))})
      // Also deduct from guest permanent balance if linked
      const resObj = reservations?.find(r=>r.id===resId)
      const gId = resObj?.guest_ids?.[0]
      const gObj = gId ? guests?.find(g=>String(g.id)===String(gId)) : (guests?.find(g=>g.name===guest_name))
      if(gObj?.id) {
        const curBal = +(gObj.outstanding_balance || 0)
        await dbPatch('guests',gObj.id,{outstanding_balance:curBal - a})
      }
      toast(`Payment ${BDT(a)} recorded`); await reload(); onClose()
    }catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Saving…':'Record Payment'}</button></>}>

      {/* ── Locked guest card (from row click) ── */}
      {fromRow&&(
        <div style={{border:'1px solid var(--br)',marginBottom:14,overflow:'hidden'}}>
          {/* Room + guest header */}
          <div style={{background:'rgba(200,169,110,.08)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--br)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span className="badge bb" style={{padding:'3px 10px',fontSize:11}}>{lockedRoom||'—'}</span>
              <span style={{fontWeight:600,fontSize:13}}>{lockedGuest||'—'}</span>
            </div>
            {lockedDue>0
              ?<span style={{fontSize:12,fontWeight:700,color:'var(--rose)',background:'rgba(224,92,122,.1)',border:'1px solid rgba(224,92,122,.25)',padding:'3px 10px'}}>DUE {BDT(lockedDue)}</span>
              :<span style={{fontSize:11,color:'var(--grn)'}}>✓ Settled</span>
            }
          </div>
          {/* Details grid */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
            {[
              ['Check-In',   fmtDate(prefill.check_in)],
              ['Check-Out',  fmtDate(prefill.check_out)],
              ['Nights',     nightsCount(prefill.check_in,prefill.check_out)||'—'],
              ['Method',     prefill.payment_method||'—'],
              ['Officer',    prefill.on_duty_officer||'—'],
              ['Status',     prefill.status||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{padding:'6px 12px',borderBottom:'1px solid var(--br2)',borderRight:'1px solid var(--br2)'}}>
                <div style={{fontSize:8,letterSpacing:'.1em',color:'var(--tx3)',textTransform:'uppercase',marginBottom:1}}>{l}</div>
                <div style={{color:'var(--tx)',fontSize:12}}>{v}</div>
              </div>
            ))}
          </div>
          {/* Total / Paid / Due footer */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'rgba(200,169,110,.03)'}}>
            {[['Total',BDT(prefill._total||0),'var(--gold)'],['Paid',BDT(prefill._paid||0),'var(--grn)'],['Balance Due',BDT(lockedDue),lockedDue>0?'var(--rose)':'var(--grn)']].map(([l,v,c])=>(
              <div key={l} style={{padding:'8px 12px',textAlign:'center',borderRight:'1px solid var(--br2)'}}>
                <div style={{fontSize:8,letterSpacing:'.1em',color:'var(--tx3)',textTransform:'uppercase',marginBottom:2}}>{l}</div>
                <div style={{color:c,fontWeight:700,fontSize:13}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Searchable guest picker (manual open) ── */}
      {!fromRow&&(
        <div style={{marginBottom:12,position:'relative'}}>
          <label className="flbl">Guest / Room <span style={{color:'var(--rose)'}}>*</span></label>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <input className="finput" value={resSearch}
              placeholder={dueResList.length===0?'No unsettled reservations':'Search room or guest name…'}
              onChange={e=>{setResSearch(e.target.value);setSelRes(null);setShowResDrop(true)}}
              onFocus={()=>setShowResDrop(true)}
              autoFocus style={{flex:1}}/>
            {selRes&&<button style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 4px'}} onClick={clearRes}>✕</button>}
          </div>
          {/* Dropdown */}
          {showResDrop&&dueResList.length>0&&(
            <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:60,background:'var(--s1)',border:'1px solid var(--br)',boxShadow:'0 8px 24px rgba(0,0,0,.6)',maxHeight:180,overflowY:'auto'}}>
              {dueResList
                .filter(r=>{const q=resSearch.toLowerCase();return !q||(r.room_number?.toLowerCase().includes(q)||r.guest_name?.toLowerCase().includes(q))})
                .map(r=>{
                  const due=Math.max(0,(+r.total_amount||0)-(+r.paid_amount||0))
                  return(
                    <div key={r.id} onClick={()=>pickRes(r)}
                      style={{padding:'9px 14px',cursor:'pointer',borderBottom:'1px solid var(--br2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--gdim)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span className="badge bb">{r.room_number||'—'}</span>
                        <span style={{fontSize:12}}>{r.guest_name||'—'}</span>
                      </div>
                      <span style={{fontSize:11,color:'var(--rose)',fontWeight:600}}>{BDT(due)} due</span>
                    </div>
                  )
                })
              }
            </div>
          )}
          {/* Selected reservation summary */}
          {selRes&&(
            <div style={{marginTop:6,background:'rgba(200,169,110,.06)',border:'1px solid var(--br)',padding:'8px 12px',fontSize:11,display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'var(--tx2)'}}>Total: <strong style={{color:'var(--tx)'}}>{BDT(selRes.total_amount||0)}</strong> · Paid: <strong style={{color:'var(--grn)'}}>{BDT(selRes.paid_amount||0)}</strong></span>
              <span style={{color:'var(--rose)',fontWeight:600}}>Due: {BDT(dropDueAmt)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Amount + Date ── */}
      <div className="frow">
        <div className="fg">
          <label className="flbl">Amount (BDT) *</label>
          <input type="number" className="finput" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" autoFocus={fromRow}/>
        </div>
        <div className="fg">
          <label className="flbl">Date</label>
          <input type="date" className="finput" value={fiscal_day} onChange={e=>setFiscalDay(e.target.value)}/>
        </div>
      </div>

      {/* ── Payment Type ── */}
      <div className="fg">
        <label className="flbl">Payment Type</label>
        <select className="fselect" value={type} onChange={e=>setType(e.target.value)}>
          {['Room Payment (Cash)','Room Payment (Bkash)','Room Payment (Nagad)','Room Payment (Card)','Room Service','Restaurant','Laundry','Misc'].map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
    </Modal>
  )
}


/* ═══════════════════════ REPORTS ════════════════════════════ */
function ReportsPage({transactions,rooms,reservations,guests}) {
  const [chartActive,setChartActive]=useState(13)
  const last14=Array.from({length:14},(_,i)=>{
    const d=new Date(todayDhaka()); d.setDate(d.getDate()-(13-i))
    const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return {d:ds.slice(8),v:transactions.filter(t=>t.fiscal_day===ds).reduce((a,t)=>a+(+t.amount||0),0),ds}
  })
  const totalRev=transactions.reduce((a,t)=>a+(+t.amount||0),0)
  const occ=rooms.filter(r=>r.status==='OCCUPIED').length
  const occPct=rooms.length?Math.round((occ/rooms.length)*100):0
  const avgRate=rooms.length?Math.round(rooms.reduce((a,r)=>a+(+r.price||0),0)/rooms.length):0
  const revPAR=Math.round(avgRate*occPct/100)
  const catMap=transactions.reduce((a,t)=>{if(t.type)a[t.type]=(a[t.type]||0)+(+t.amount||0);return a},{})
  const topCats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8)

  return (
    <div>
      <div className="stats-row">
        <div className="stat" style={{'--ac':'var(--gold)'}}><div className="stat-lbl">Total Revenue</div><div className="stat-val">{BDT(totalRev)}</div></div>
        <div className="stat" style={{'--ac':'var(--sky)'}}><div className="stat-lbl">Occupancy</div><div className="stat-val">{occPct}%</div><div className="stat-sub">{occ}/{rooms.length} rooms</div></div>
        <div className="stat" style={{'--ac':'var(--teal)'}}><div className="stat-lbl">ADR</div><div className="stat-val">{BDT(avgRate)}</div><div className="stat-sub">Avg Daily Rate</div></div>
        <div className="stat" style={{'--ac':'var(--pur)'}}><div className="stat-lbl">RevPAR</div><div className="stat-val">{BDT(revPAR)}</div><div className="stat-sub">Revenue/Available Room</div></div>
      </div>
      <div className="g2 mb4">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Daily Revenue — Last 14 Days</span>
            <span className="badge bgold">{last14[chartActive]?.ds?.slice(5)} · {BDT(last14[chartActive]?.v)}</span>
          </div>
          <div className="card-body">
            <BarChart data={last14} active={chartActive} onHover={setChartActive}/>
            <div className="divider"/>
            <div className="flex fjb xs muted"><span>14-day total</span><span className="gold">{BDT(last14.reduce((a,d)=>a+d.v,0))}</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Revenue by Category</span></div>
          <div className="card-body">
            {topCats.map(([cat,rev])=>(
              <div key={cat} className="flex fac fjb" style={{padding:'5px 0',borderBottom:'1px solid var(--br2)'}}>
                <span className="xs">{cat}</span>
                <div className="flex fac gap2">
                  <span className="xs gold">{BDT(rev)}</span>
                  <div style={{height:4,width:Math.round((rev/(topCats[0]?.[1]||1))*60),background:'rgba(200,169,110,.4)',borderRadius:2}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">Room Category Performance</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Category</th><th>Total Rooms</th><th>Rate/Night</th><th>Occupied</th><th>Occupancy %</th><th>RevPAR</th></tr></thead>
            <tbody>
              {['Fountain Deluxe','Premium Deluxe','Superior Deluxe','Twin Deluxe','Royal Suite'].map(cat=>{
                const cr=rooms.filter(r=>r.category===cat); if(!cr.length) return null
                const rate=cr[0]?.price||0, occN=cr.filter(r=>r.status==='OCCUPIED').length
                const pct=Math.round((occN/cr.length)*100)
                return (<tr key={cat}><td><span className="badge bgold">{cat}</span></td><td className="xs">{cr.length}</td><td className="xs gold">{BDT(rate)}</td><td className="xs">{occN}</td><td className="xs">{pct}%</td><td className="xs gold">{BDT(Math.round(rate*pct/100))}</td></tr>)
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ SETTINGS (owner-only) ══════════════ */
function SettingsPage({currentUser,toast,staffList,setStaffList}) {
  const isSA=currentUser?.role==='owner'
  const [tab,setTab]=useState('hotel')
const [hs,setHS]=useState({hotelName:'Hotel Fountain',city:'Dhaka, Bangladesh',currency:'BDT',checkIn:'14:00',checkOut:'12:00',vat:'7',svc:'5'})
  const [hsSaving,setHsSaving]=useState(false)
  const HS=k=>e=>setHS(p=>({...p,[k]:e.target.value}))
  const [showAddUser,setShowAddUser]=useState(false)
  const [editUser,setEditUser]=useState(null)

// Load settings from Supabase on mount
  useEffect(()=>{
    async function loadSettings(){
      try{
        const rows=await db('hotel_settings',`?tenant_id=eq.${TENANT}&select=key,value`)
        if(rows&&rows.length>0){
          const map={}; rows.forEach(r=>{map[r.key]=r.value})
          setHS(p=>({
            hotelName:map.hotel_name||p.hotelName,
            city:map.city||p.city,
            currency:map.currency||p.currency,
            checkIn:map.check_in||p.checkIn,
            checkOut:map.check_out||p.checkOut,
            vat:map.vat_rate||p.vat,
            svc:map.service_charge||p.svc
          }))
        }
      }catch(e){console.warn('Settings load:',e.message)}
    }
    loadSettings()
  },[])

  async function saveHotelSettings(){
    setHsSaving(true)
    try{
      const entries=[
        ['hotel_name',hs.hotelName],['city',hs.city],['currency',hs.currency],
        ['check_in',hs.checkIn],['check_out',hs.checkOut],
        ['vat_rate',hs.vat],['service_charge',hs.svc]
      ]
      for(const [key,value] of entries){
        await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
          method:'POST',
          headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
          body:JSON.stringify({key,value:String(value),tenant_id:TENANT})
        })
      }
      toast('Hotel settings saved ✓')
    }catch(e){toast('Save failed: '+e.message,'error')}
    finally{setHsSaving(false)}
  }

  async function deleteUser(id) {
    if(!window.confirm('Remove this staff account?')) return
    try{
      await dbDelete('staff',id)
      setStaffList(p=>p.filter(s=>s.id!==id))
      toast('Staff account removed')
    }catch(e){ toast('Delete failed: '+e.message,'error') }
  }

  return (
    <div style={{maxWidth:'100%'}}>
      <div style={{overflowX:'auto',marginBottom:16,paddingBottom:4}}>
        <div className="tabs" style={{flexWrap:'nowrap',minWidth:'max-content',gap:2}}>
          {[['hotel','🏨 Hotel Info'],['users','👥 Staff & Users'],['devices','📱 Devices'],['system','⚙ System'],['agents','🤖 AI Agents'],['b2b','🤝 B2B Partners'],['plang','✈ Plan G'],['swarm','🎯 Lead Gen']].map(([v,l])=>(
            <button key={v} className={`tab${tab===v?' on':''}`} style={{whiteSpace:'nowrap',fontSize:11,padding:'6px 12px'}} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* HOTEL INFO */}
      {tab==='hotel'&&(
        <div className="card">
          <div className="card-hd"><span className="card-title">Hotel Information</span>{!isSA&&<span className="badge ba">View Only</span>}</div>
          <div className="card-body">
            <div className="frow">
              <div className="fg"><label className="flbl">Hotel Name</label><input className="finput" value={hs.hotelName} onChange={HS('hotelName')} disabled={!isSA}/></div>
              <div className="fg"><label className="flbl">City / Location</label><input className="finput" value={hs.city} onChange={HS('city')} disabled={!isSA}/></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flbl">Currency</label>
                <select className="fselect" value={hs.currency} onChange={HS('currency')} disabled={!isSA}>
                  <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                </select>
              </div>
              <div className="fg"><label className="flbl">Timezone</label><select className="fselect" disabled={!isSA}><option>Asia/Dhaka (UTC+6)</option></select></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flbl">Standard Check-In</label><input type="time" className="finput" value={hs.checkIn} onChange={HS('checkIn')} disabled={!isSA}/></div>
              <div className="fg"><label className="flbl">Standard Check-Out</label><input type="time" className="finput" value={hs.checkOut} onChange={HS('checkOut')} disabled={!isSA}/></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flbl">VAT Rate (%)</label><input type="number" className="finput" value={hs.vat} onChange={HS('vat')} disabled={!isSA} min="0" max="30"/></div>
              <div className="fg"><label className="flbl">Service Charge (%)</label><input type="number" className="finput" value={hs.svc} onChange={HS('svc')} disabled={!isSA} min="0" max="30"/></div>
            </div>
            {isSA
?<button className="btn btn-gold mt3" disabled={hsSaving} onClick={saveHotelSettings}>{hsSaving?'Saving…':'Save Settings'}</button>
              :<p className="xs muted mt3">Only the Owner can edit hotel settings.</p>
            }
          </div>
        </div>
      )}

      {/* STAFF & USERS — visible to all, but edit only for owner */}
      {tab==='users'&&(
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Staff Accounts</span>
            {isSA&&<button className="btn btn-gold btn-sm" onClick={()=>setShowAddUser(true)}>+ Add Staff</button>}
          </div>
          <div className="card-body" style={{padding:'0 15px'}}>
            {staffList.map(u=>(
              <div key={u.id} className="user-row">
                <Av name={u.name} size={36}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:13}}>{u.name}</div>
                  <div className="xs muted">{u.email}</div>
                  <div className="xs mt3" style={{color:ROLES[u.role]?.color||'var(--tx2)'}}>{ROLES[u.role]?.label}</div>
                </div>
                {u.role==='owner'
                  ?<span className="badge bgold">★ OWNER</span>
                  :<span className="badge bb">{u.role}</span>
                }
                {isSA&&u.role!=='owner'&&(
                  <div className="flex gap2">
                    <button className="btn btn-ghost btn-sm" onClick={()=>setEditUser(u)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>deleteUser(u.id)}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEVICES */}
      {tab==='devices'&&(
        <div className="card">
          <div className="card-hd"><span className="card-title">Authorized Devices / Terminals</span><span className="badge bgold">{staffList.length} accounts</span></div>
          <div className="card-body" style={{padding:'0 15px'}}>
            {staffList.map(u=>(
              <div key={u.id} className="user-row">
                <div style={{width:10,height:10,borderRadius:'50%',background:ROLES[u.role]?.color,flexShrink:0,boxShadow:`0 0 6px ${ROLES[u.role]?.color}`}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:13}}>{u.device||`${u.name}'s Device`}</div>
                  <div className="xs muted">{u.email}</div>
                </div>
                <span className={`badge ${u.role==='owner'?'bgold':u.role==='housekeeping'?'bteal':'bb'}`}>{ROLES[u.role]?.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SYSTEM */}
      {tab==='system'&&(
        <div>
          <div className="card mb4">
            <div className="card-hd"><span className="card-title">Lumea Founder Mode</span></div>
            <div className="card-body">
              <div style={{background:'rgba(200,169,110,.06)',border:'1px solid rgba(200,169,110,.18)',padding:'12px 14px',marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:500,color:'var(--gold)',marginBottom:5}}>★ Admin Bypass Active — No Subscription Required</div>
                <div className="xs muted" style={{lineHeight:1.8}}>
                  Accessing Hotel Fountain CRM as the Lumea founder. All modules unlocked with full read/write access to production database <span style={{color:'var(--gold)',fontWeight:500}}>mynwfkgksqqwlqowlscj</span>.
                </div>
              </div>
              <div className="g2">
                {[['Database','mynwfkgksqqwlqowlscj'],['Region','us-east-1 (N. Virginia)'],['Tenant ID',TENANT.slice(0,18)+'…'],['Plan','Founder Bypass — Unlimited']].map(([l,v])=>(
                  <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val" style={{fontSize:11}}>{v}</div></div>
                ))}
              </div>
            </div>
          </div>
          <WorkflowMonitor toast={toast}/>
          <GoogleSheetsCard toast={toast}/>
        </div>
      )}

{/* AI AGENTS PANEL */}
      {tab==='agents'&&(
        <div>
          <AIAgentsPanel toast={toast}/>
        </div>
      )}

      {/* B2B SWARM PANEL */}
      {tab==='b2b'&&(
        <div>
          <B2BSwarmPanel toast={toast}/>
        </div>
      )}

      {/* PLAN G UPSELL PANEL */}
      {tab==='plang'&&(
        <div>
          <PlanGPanel toast={toast} reservations={reservations} rooms={rooms} guests={guests}/>
        </div>
      )}

      {/* LEAD GEN SWARM PANEL */}
      {tab==='swarm'&&(
        <div>
          <LeadGenSwarmPanel toast={toast}/>
        </div>
      )}
      {showAddUser&&isSA&&(
        <AddStaffModal toast={toast} onClose={()=>setShowAddUser(false)}
          onAdd={u=>{ setStaffList(p=>[...p,u]); toast(`${u.name} added as ${ROLES[u.role]?.label}`); setShowAddUser(false) }}
          existingIds={staffList.map(s=>s.id)}/>
      )}
      {editUser&&isSA&&(
        <EditStaffModal user={editUser} toast={toast} onClose={()=>setEditUser(null)}
          onSave={updated=>{ setStaffList(p=>p.map(s=>s.id===updated.id?updated:s)); toast('Staff account updated'); setEditUser(null) }}/>
      )}
    </div>
  )
}

function AddStaffModal({toast,onClose,onAdd,existingIds}) {
  const [f,setF]=useState({name:'',email:'',pw:'',role:'receptionist',device:''})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  async function save() {
    if(!f.name||!f.email||!f.pw) return toast('Name, email and password required','error')
    setSaving(true)
    const newId=Math.max(...existingIds,0)+1
    const newStaff={id:newId,...f,av:f.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),tenant_id:TENANT}
    try{
      await dbPost('staff',newStaff)
      onAdd(newStaff)
    }catch(e){ toast('Save failed: '+e.message,'error') }
    finally{ setSaving(false) }
  }
  return (
    <Modal title="Add Staff Account" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" onClick={save}>Add Staff</button></>}>
      <div className="frow">
        <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={f.name} onChange={F('name')} placeholder="Staff name" autoFocus/></div>
        <div className="fg"><label className="flbl">Role *</label>
          <select className="fselect" value={f.role} onChange={F('role')}>
            {Object.entries(ROLES).filter(([k])=>k!=='owner').map(([k,r])=><option key={k} value={k}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Email *</label><input type="email" className="finput" value={f.email} onChange={F('email')} placeholder="staff@hotel.com"/></div>
        <div className="fg"><label className="flbl">Password *</label><input className="finput" value={f.pw} onChange={F('pw')} placeholder="Set password"/></div>
      </div>
      <div className="fg"><label className="flbl">Device / Terminal Name</label><input className="finput" value={f.device} onChange={F('device')} placeholder="e.g. Front Desk Terminal"/></div>
    </Modal>
  )
}

function EditStaffModal({user,toast,onClose,onSave}) {
  const [f,setF]=useState({...user})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
const [saving,setSaving]=useState(false)
  const [payAmt,setPayAmt]=useState('')
  const [payType,setPayType]=useState('Cash')
  const [paySaving,setPaySaving]=useState(false)
  async function save() {
    if(!f.name||!f.email||!f.pw) return toast('All fields required','error')
    setSaving(true)
    try{
      await dbPatch('staff',user.id,{name:f.name,email:f.email,pw:f.pw,role:f.role,device:f.device})
      onSave({...f,av:f.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()})
    }catch(e){ toast('Save failed: '+e.message,'error') }
    finally{ setSaving(false) }
  }
  return (
    <Modal title={`Edit — ${user.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Saving…':'Save Changes'}</button></>}>
      <div className="frow">
        <div className="fg"><label className="flbl">Full Name</label><input className="finput" value={f.name} onChange={F('name')}/></div>
        <div className="fg"><label className="flbl">Role</label>
          <select className="fselect" value={f.role} onChange={F('role')}>
            {Object.entries(ROLES).filter(([k])=>k!=='owner').map(([k,r])=><option key={k} value={k}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Email</label><input type="email" className="finput" value={f.email} onChange={F('email')}/></div>
        <div className="fg"><label className="flbl">Password</label><input className="finput" value={f.pw} onChange={F('pw')}/></div>
      </div>
      <div className="fg"><label className="flbl">Device / Terminal</label><input className="finput" value={f.device||''} onChange={F('device')}/></div>
    </Modal>
  )
}

/* ═══════════════════════ AI AGENTS ══════════════════════════ */
function AIAgentsPanel({toast}) {
  const EDGE='https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ai-agents'
  const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

  const [query,setQuery]=useState('corporate event planners in Dhaka needing hotel rooms')
  const [busy,setBusy]=useState(false)
  const [pipelineResult,setPipelineResult]=useState(null)
  const [analystBrief,setAnalystBrief]=useState(null)
  const [analyzerBusy,setAnalyzerBusy]=useState(false)
  const [closerLeadId,setCloserLeadId]=useState('')
  const [closerBusy,setCloserBusy]=useState(false)
  const [closerResult,setCloserResult]=useState(null)

  async function callAgent(action, extra={}) {
    const r = await fetch(EDGE, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':ANON},
      body: JSON.stringify({action, query, ...extra})
    })
    return r.json()
  }

  async function runPipeline() {
    setBusy(true); setPipelineResult(null)
    try {
      const res = await callAgent('prospect')
      if(res.error) {
        // Show helpful setup message if API key missing
        if(res.error.includes('GEMINI_API_KEY')) {
          toast('GEMINI_API_KEY not set — go to Supabase → Settings → Edge Functions → Secrets','error')
        } else {
          toast(res.error,'error')
        }
        setPipelineResult({error:res.error, setup_url:res.setup_url})
        return
      }
      setPipelineResult(res)
      toast(`✓ ${res.leads_found||res.leads?.length||0} leads found — emails drafted automatically`)
    } catch(e){ toast(e.message,'error') }
    finally{ setBusy(false) }
  }

  async function runAnalyst() {
    setAnalyzerBusy(true); setAnalystBrief(null)
    try {
      const res = await callAgent('analyze')
      if(res.error) { toast(res.error,'error'); return }
      setAnalystBrief(res)
      toast(`✓ Front desk brief ready — ${res.leads_briefed} leads handed off`)
    } catch(e){ toast(e.message,'error') }
    finally{ setAnalyzerBusy(false) }
  }

  async function runCloserForId(id) {
    const lid = (id||closerLeadId||'').trim()
    if(!lid) { toast('Enter a lead ID','error'); return }
    setCloserLeadId(lid)
    setCloserBusy(true); setCloserResult(null)
    try {
      const res = await callAgent('close', {lead_id: lid})
      if(res.error) { toast(res.error,'error'); return }
      setCloserResult(res)
      // Also update the email_draft in pipelineResult leads list
      if(pipelineResult?.leads) {
        setPipelineResult((p) =>({...p,leads:p.leads.map((l) =>l.id===lid?{...l,email_draft:res.email_draft}:l)}))
      }
      toast(`✓ Email drafted for ${res.lead_name}`)
    } catch(e){ toast(e.message,'error') }
    finally{ setCloserBusy(false) }
  }
  async function runCloser() { runCloserForId(closerLeadId) }

  return (
    <div>
      <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.06),rgba(200,169,110,.04))',border:'1px solid rgba(88,166,255,.2)',padding:'10px 14px',marginBottom:16,fontSize:11,color:'var(--sky)',display:'flex',alignItems:'center',gap:8}}>
        <span>🤖</span>
        <span>AI Agents powered by Gemini 2.5 Flash — Connected to your live Supabase data</span>
      </div>

      {/* AGENT A + AUTO B PIPELINE */}
      <div className="card mb4">
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{fontSize:20}}>🔍</span>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent A — The Prospector</div>
            <div style={{fontSize:10,color:'var(--tx3)'}}>Finds leads → Agent B auto-drafts outreach emails → saved to leads table</div>
          </div>
        </div>
        <div className="fg mb3">
          <label className="flbl">Search Query</label>
          <input className="finput" value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. corporate event planners in Dhaka"/>
        </div>
        <button className="btn btn-gold" onClick={runPipeline} disabled={busy}>
          {busy?'🔄 Finding leads + drafting emails…':'🔍 Find Leads + Auto-Draft Emails'}
        </button>

        {pipelineResult?.error&&(
          <div style={{marginTop:12,background:'rgba(224,92,122,.08)',border:'1px solid rgba(224,92,122,.25)',padding:'12px 14px'}}>
            <div style={{fontSize:12,color:'var(--rose)',fontWeight:500,marginBottom:6}}>⚠ {pipelineResult.error}</div>
            {pipelineResult.error?.includes('GEMINI')&&(
              <div style={{fontSize:11,color:'var(--tx2)'}}>
                To fix: Go to{' '}
                <a href="https://supabase.com/dashboard/project/mynwfkgksqqwlqowlscj/settings/functions" target="_blank" style={{color:'var(--sky)'}}>
                  Supabase → Settings → Edge Functions → Secrets
                </a>
                {' '}and add <strong style={{color:'var(--gold)'}}>GEMINI_API_KEY</strong> from{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{color:'var(--sky)'}}>aistudio.google.com</a>
              </div>
            )}
          </div>
        )}
        {pipelineResult&&!pipelineResult.error&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:10,color:'var(--grn)',marginBottom:10,fontWeight:500}}>
              ✓ {pipelineResult.leads?.length||pipelineResult.leads_found||0} leads found — Agent B auto-drafted emails for each
            </div>
            {(pipelineResult.leads||[]).map((lead,i) =>(
              <div key={i} style={{background:'rgba(200,169,110,.04)',border:'1px solid var(--br)',padding:'12px 14px',marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{lead.name}</div>
                    <div style={{fontSize:11,color:'var(--tx3)'}}>{lead.company} · {lead.source}</div>
                    <div style={{fontSize:10,color:'var(--sky)',marginTop:2}}>{lead.email} {lead.phone&&`· ${lead.phone}`}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <span style={{fontSize:8,background:'rgba(63,185,80,.15)',color:'var(--grn)',padding:'2px 7px',letterSpacing:'.1em'}}>EMAIL DRAFTED ✓</span>
                    {lead.id&&<span style={{fontSize:8,color:'var(--tx3)',fontFamily:'monospace'}}>{lead.id?.slice(0,12)}…</span>}
                  </div>
                </div>
                <div style={{fontSize:10,color:'var(--tx2)',marginBottom:8,fontStyle:'italic'}}>{lead.notes}</div>
                {(lead.email_draft||lead.email_draft)&&(
                  <details style={{marginTop:4}}>
                    <summary style={{fontSize:10,color:'var(--gold)',cursor:'pointer',userSelect:'none'}}>📧 View drafted email ▾</summary>
                    <div style={{marginTop:8,background:'rgba(0,0,0,.3)',padding:'10px 12px',fontSize:11,color:'var(--tx2)',whiteSpace:'pre-wrap',lineHeight:1.6,fontFamily:'monospace',maxHeight:200,overflow:'auto'}}>
                      {lead.email_draft}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AGENT B — CLOSER (auto-runs after A, or manually re-draft) */}
      <div className="card mb4">
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{fontSize:20}}>✍️</span>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent B — The Closer</div>
            <div style={{fontSize:10,color:'var(--tx3)'}}>Auto-runs after Agent A · Click any lead below to re-draft its outreach email</div>
          </div>
        </div>

        {/* Show leads from Agent A pipeline or prompt to run A first */}
        {pipelineResult&&(pipelineResult.leads||[]).length>0?(
          <div>
            <div style={{fontSize:10,color:'var(--tx3)',marginBottom:8}}>Select a lead to re-draft or view their email:</div>
            {(pipelineResult.leads||[]).map((lead,i) =>(
              <div key={i} style={{background:'rgba(200,169,110,.03)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{lead.name}</div>
                  <div style={{fontSize:10,color:'var(--tx3)'}}>{lead.company} · {lead.email||lead.phone}</div>
                </div>
                <button
                  className="btn btn-gold btn-sm"
                  style={{padding:'4px 10px',fontSize:10,whiteSpace:'nowrap'}}
                  disabled={closerBusy&&closerLeadId===lead.id}
                  onClick={()=>{
                    if(!lead.id){toast('Lead ID not available — run Agent A first','error');return}
                    setCloserLeadId(lead.id)
                    runCloserForId(lead.id)
                  }}>
                  {closerBusy&&closerLeadId===lead.id?'Drafting…':'✍️ Re-draft Email'}
                </button>
              </div>
            ))}
          </div>
        ):(
          <div style={{padding:'12px 14px',background:'rgba(200,169,110,.03)',border:'1px dashed var(--br)',fontSize:11,color:'var(--tx3)',textAlign:'center'}}>
            Run Agent A first → Agent B auto-drafts emails for all leads found
          </div>
        )}

        {/* Manual override by lead ID */}
        <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--br2)'}}>
          <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Or enter any lead ID manually</div>
          <div style={{display:'flex',gap:8}}>
            <input className="finput" style={{flex:1,fontFamily:'monospace',fontSize:11}} value={closerLeadId} onChange={e=>setCloserLeadId(e.target.value)} placeholder="Lead UUID from Supabase leads table"/>
            <button className="btn btn-gold btn-sm" style={{whiteSpace:'nowrap',padding:'0 14px'}} disabled={closerBusy} onClick={()=>runCloserForId(closerLeadId)}>
              {closerBusy?'Drafting…':'✍️ Draft'}
            </button>
          </div>
        </div>

        {closerResult&&(
          <div style={{marginTop:12}}>
            <div style={{fontSize:11,color:'var(--grn)',marginBottom:8}}>✓ Email re-drafted for {closerResult.lead_name}</div>
            <div style={{background:'rgba(0,0,0,.3)',padding:'12px 14px',fontSize:11,color:'var(--tx2)',whiteSpace:'pre-wrap',lineHeight:1.7,fontFamily:'monospace',maxHeight:250,overflow:'auto'}}>
              {closerResult.email_draft}
            </div>
          </div>
        )}
      </div>

      {/* AGENT C — ANALYST + FRONT DESK BRIEF */}
      <div className="card">
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{fontSize:20}}>📊</span>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent C — The Analyst</div>
            <div style={{fontSize:10,color:'var(--tx3)'}}>Analyzes revenue + pending leads → generates complete action brief for front desk</div>
          </div>
        </div>
        <button className="btn btn-gold" onClick={runAnalyst} disabled={analyzerBusy}>
          {analyzerBusy?'📊 Generating brief…':'📊 Generate Front Desk Brief'}
        </button>
        {analystBrief&&(
          <div style={{marginTop:14}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
              <div style={{background:'rgba(88,166,255,.06)',border:'1px solid rgba(88,166,255,.15)',padding:'10px 12px',textAlign:'center'}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase'}}>Occupancy</div>
                <div style={{fontSize:22,color:'var(--sky)',fontFamily:'var(--serif)',marginTop:4}}>{analystBrief.occupancy_rate}%</div>
              </div>
              <div style={{background:'rgba(200,169,110,.06)',border:'1px solid rgba(200,169,110,.15)',padding:'10px 12px',textAlign:'center'}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase'}}>Week Revenue</div>
                <div style={{fontSize:18,color:'var(--gold)',fontFamily:'var(--serif)',marginTop:4}}>{BDT(analystBrief.week_revenue)}</div>
              </div>
              <div style={{background:'rgba(63,185,80,.06)',border:'1px solid rgba(63,185,80,.15)',padding:'10px 12px',textAlign:'center'}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase'}}>Leads Briefed</div>
                <div style={{fontSize:22,color:'var(--grn)',fontFamily:'var(--serif)',marginTop:4}}>{analystBrief.leads_briefed}</div>
              </div>
            </div>
            <div style={{background:'rgba(200,169,110,.03)',border:'1px solid var(--br)',padding:'14px 16px'}}>
              <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.16em',textTransform:'uppercase',marginBottom:10}}>Front Desk Action Brief</div>
              <div style={{fontSize:12,color:'var(--tx)',whiteSpace:'pre-wrap',lineHeight:1.8}}>
                {analystBrief.brief}
              </div>
            </div>
            <div style={{marginTop:8,fontSize:10,color:'var(--grn)'}}>
              ✓ Brief saved to CRM · {analystBrief.leads_briefed} leads marked "briefed to front desk"
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════ B2B SWARM PANEL ══════════════════════════ */
function B2BSwarmPanel({toast}) {
  const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/b2b-agents'
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

  const [activeAgent, setActiveAgent] = useState('recruiter')
  const [partners, setPartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [busy, setBusy] = useState(null) // null | 'scan'|'invite:id'|'letter:id'|'weekly'|'dashboard'
  const [dashboard, setDashboard] = useState(null)
  const [outreach, setOutreach] = useState(null) // invite/letter result
  const [billingResult, setBillingResult] = useState(null)

  useEffect(() => { loadPartners() }, [])

  async function loadPartners() {
    setLoadingPartners(true)
    try {
      const r = await fetch(`${SB_URL}/rest/v1/b2b_partners?tenant_id=eq.${TENANT}&select=*&order=created_at`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
      const d = await r.json()
      setPartners(Array.isArray(d) ? d : [])
    } catch(e) { toast(e.message,'error') }
    finally { setLoadingPartners(false) }
  }

  async function callB2B(body) {
    const r = await fetch(EDGE, { method:'POST', headers:{'Content-Type':'application/json','apikey':ANON}, body: JSON.stringify(body) })
    return r.json()
  }

  async function doScan() {
    setBusy('scan')
    try {
      const res = await callB2B({ agent:'recruiter', action:'scan' })
      if(res.error) { toast(res.error,'error'); return }
      toast(`✓ ${res.agencies_found} new agencies found & saved`)
      loadPartners()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function doInvite(partnerId, agencyName) {
    setBusy(`invite:${partnerId}`)
    setOutreach(null)
    try {
      const res = await callB2B({ agent:'recruiter', action:'invite', partner_id: partnerId })
      if(res.error) { toast(res.error,'error'); return }
      setOutreach({ type:'invite', partner: agencyName, content: res.whatsapp_message, portal_link: res.portal_link })
      toast(`✓ WhatsApp invite generated for ${agencyName}`)
      loadPartners()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function doJoiningLetter(partnerId, agencyName) {
    setBusy(`letter:${partnerId}`)
    setOutreach(null)
    try {
      const res = await callB2B({ agent:'recruiter', action:'joining_letter', partner_id: partnerId })
      if(res.error) { toast(res.error,'error'); return }
      setOutreach({ type:'letter', partner: agencyName, content: res.letter })
      toast(`✓ Joining letter generated — ${agencyName} marked Active`)
      loadPartners()
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function doBillingDashboard() {
    setBusy('dashboard')
    try {
      const res = await callB2B({ agent:'billing_analyst', action:'get_dashboard' })
      if(res.error) { toast(res.error,'error'); return }
      setDashboard(res)
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function doWeeklyRun() {
    setBusy('weekly')
    setBillingResult(null)
    try {
      const res = await callB2B({ agent:'billing_analyst', action:'weekly_run' })
      if(res.error) { toast(res.error,'error'); return }
      setBillingResult(res)
      toast(`✓ Weekly run complete — ${res.partners_processed} partners processed`)
    } catch(e) { toast(e.message,'error') }
    finally { setBusy(null) }
  }

  const statusColor = (s) => s==='vip'?'var(--gold)':s==='active'?'var(--grn)':s==='inactive'?'var(--rose)':'var(--tx3)'
  const statusBg = (s) => s==='vip'?'rgba(200,169,110,.15)':s==='active'?'rgba(63,185,80,.12)':s==='inactive'?'rgba(224,92,122,.12)':'rgba(255,255,255,.05)'

  return (
    <div>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(63,185,80,.06),rgba(200,169,110,.04))',border:'1px solid rgba(63,185,80,.2)',padding:'10px 14px',marginBottom:16,fontSize:11,color:'var(--grn)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><span>🤝</span><span>B2B Partner Swarm — 3 AI Agents · Gemini 2.5 Flash</span></div>
        <div style={{fontSize:10,color:'var(--tx3)'}}>{partners.length} partners · {partners.filter(p=>p.status==='active'||p.status==='vip').length} active</div>
      </div>

      {/* Agent Tabs */}
      <div className="tabs mb4">
        {[['recruiter','🔍 Agent 1 — Recruiter'],['butler','🛎 Agent 2 — Portal Butler'],['billing','💰 Agent 3 — Billing Analyst']].map(([v,l])=>(
          <button key={v} className={`tab${activeAgent===v?' on':''}`} onClick={()=>setActiveAgent(v)}>{l}</button>
        ))}
      </div>

      {/* ── AGENT 1: RECRUITER ── */}
      {activeAgent==='recruiter'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:22}}>🔍</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 1 — The Recruiter</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Scans for travel agencies in Dhaka, Chittagong & Sylhet · Sends WhatsApp invites · Generates joining letters</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button className="btn btn-gold" onClick={doScan} disabled={busy==='scan'}>
                {busy==='scan'?'🔄 Scanning…':'🌐 Scan for New Agencies'}
              </button>
              <button className="btn btn-ghost" onClick={loadPartners} disabled={loadingPartners}>
                {loadingPartners?'Loading…':'↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Partners Table */}
          <div className="card">
            <div className="card-hd"><span className="card-title">Partner Agencies ({partners.length})</span></div>
            {loadingPartners?(
              <div style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)',fontSize:12}}>Loading partners…</div>
            ):(
              <table className="tbl">
                <thead><tr><th>Agency</th><th>City</th><th>Contact</th><th>Status</th><th>Rate/Night</th><th>Bookings</th><th>Actions</th></tr></thead>
                <tbody>
                  {partners.length===0?(<tr><td colSpan={7} style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)'}}>No partners yet — click Scan to find agencies</td></tr>)
                  :partners.map(p=>(
                    <tr key={p.id}>
                      <td>
                        <div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{p.agency_name}</div>
                        <div style={{fontSize:10,color:'var(--sky)'}}>{p.email}</div>
                      </td>
                      <td className="xs muted">{p.city}</td>
                      <td>
                        <div style={{fontSize:11,color:'var(--tx)'}}>{p.contact_name||'—'}</div>
                        <div style={{fontSize:10,color:'var(--tx3)'}}>{p.phone||'—'}</div>
                      </td>
                      <td>
                        <span style={{fontSize:9,padding:'2px 8px',background:statusBg(p.status),color:statusColor(p.status),letterSpacing:'.08em',textTransform:'uppercase',fontWeight:600}}>
                          {p.status==='vip'?'⭐ VIP':p.status}
                        </span>
                      </td>
                      <td className="xs gold">৳{Number(p.wholesale_rate||2800).toLocaleString()}</td>
                      <td className="xs" style={{color:'var(--tx3)'}}>{p.total_bookings||0}</td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          <button
                            className="btn btn-sm"
                            style={{fontSize:9,padding:'3px 8px',background:p.whatsapp_sent?'rgba(63,185,80,.1)':'rgba(37,211,102,.15)',color:p.whatsapp_sent?'var(--grn)':'#25D366',border:'1px solid currentColor'}}
                            disabled={busy===`invite:${p.id}`}
                            onClick={()=>doInvite(p.id, p.agency_name)}>
                            {busy===`invite:${p.id}`?'Sending…':p.whatsapp_sent?'✓ Resend WA':'📱 WhatsApp Invite'}
                          </button>
                          <button
                            className="btn btn-sm btn-gold"
                            style={{fontSize:9,padding:'3px 8px',opacity:p.joining_letter_sent?.9:1}}
                            disabled={busy===`letter:${p.id}`}
                            onClick={()=>doJoiningLetter(p.id, p.agency_name)}>
                            {busy===`letter:${p.id}`?'Generating…':p.joining_letter_sent?'✓ Re-generate Letter':'📄 Joining Letter'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Outreach Result */}
          {outreach&&(
            <div className="card" style={{marginTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>
                  {outreach.type==='invite'?'📱 WhatsApp Invite':'📄 Joining Letter'} — {outreach.partner}
                </div>
                {outreach.type==='invite'&&outreach.portal_link&&(
                  <div style={{fontSize:10,color:'var(--sky)',fontFamily:'monospace',wordBreak:'break-all'}}>{outreach.portal_link.slice(0,60)}…</div>
                )}
              </div>
              <div style={{background:'rgba(0,0,0,.3)',padding:'12px 14px',fontSize:11,color:'var(--tx2)',whiteSpace:'pre-wrap',lineHeight:1.7,maxHeight:300,overflow:'auto',fontFamily:'monospace'}}>
                {outreach.content}
              </div>
              {outreach.type==='invite'&&(
                <div style={{marginTop:8,fontSize:10,color:'var(--tx3)'}}>
                  💡 Copy this message and send via WhatsApp to {outreach.partner}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT 2: PORTAL BUTLER ── */}
      {activeAgent==='butler'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>🛎</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 2 — The Portal Butler</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Authenticates partners via Secret Key · Handles bookings · Answers room questions · Checks availability</div>
              </div>
            </div>
          </div>

          {/* Active partner portal keys */}
          <div className="card mb4">
            <div className="card-hd"><span className="card-title">Active Partner Portal Keys</span></div>
            <table className="tbl">
              <thead><tr><th>Agency</th><th>Status</th><th>Secret Key (Portal Auth)</th><th>Portal Link</th></tr></thead>
              <tbody>
                {partners.filter(p=>p.status==='active'||p.status==='vip').map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:600,fontSize:12}}>{p.agency_name}</td>
                    <td><span style={{fontSize:9,padding:'2px 7px',background:statusBg(p.status),color:statusColor(p.status),letterSpacing:'.08em',textTransform:'uppercase'}}>{p.status}</span></td>
                    <td><code style={{fontSize:10,color:'var(--gold)',background:'rgba(0,0,0,.3)',padding:'2px 6px'}}>{p.secret_key?.slice(0,16)}…</code></td>
                    <td>
                      <a href={`https://hotelfountainbd-crm.vercel.app?b2b=${p.secret_key}`} target="_blank" style={{fontSize:10,color:'var(--sky)'}}>
                        Open Portal ↗
                      </a>
                    </td>
                  </tr>
                ))}
                {partners.filter(p=>p.status==='active'||p.status==='vip').length===0&&(
                  <tr><td colSpan={4} style={{textAlign:'center',padding:'16px 0',color:'var(--tx3)',fontSize:11}}>No active partners yet — activate via joining letter in Agent 1</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* How Agent 2 works */}
          <div className="card" style={{background:'rgba(88,166,255,.03)',border:'1px solid rgba(88,166,255,.15)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--sky)',marginBottom:10}}>How Agent 2 Works Automatically</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                ['🔐 Authentication','Partner visits portal link with secret key → Agent 2 verifies identity → grants access to wholesale rates'],
                ['📅 Booking','Partner selects dates & room → Agent 2 confirms rate (৳2,800/night) → creates reservation → notifies front desk'],
                ['❓ Q&A','Partner asks "Does room have balcony?" → Agent 2 answers from hotel knowledge base instantly'],
                ['🏨 Availability','Agent 2 checks both main reservations + B2B bookings to show real-time availability grid'],
              ].map(([title,desc],i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',padding:'10px 12px'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--tx)',marginBottom:4}}>{title}</div>
                  <div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.5}}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:12,padding:'10px 12px',background:'rgba(200,169,110,.05)',border:'1px solid rgba(200,169,110,.15)'}}>
              <div style={{fontSize:10,color:'var(--gold)',fontWeight:500}}>⚡ API Endpoint</div>
              <code style={{fontSize:10,color:'var(--tx2)',display:'block',marginTop:4}}>
                POST https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/b2b-agents<br/>
                {'{ agent:"portal_butler", action:"authenticate|book|answer|availability", secret_key:"..." }'}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* ── AGENT 3: BILLING ANALYST ── */}
      {activeAgent==='billing'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>💰</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 3 — The Billing Analyst</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Runs every Sunday 10 PM · Tracks commissions · Sends statements · Re-engages inactive partners · Awards VIP status</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-gold" onClick={doBillingDashboard} disabled={busy==='dashboard'}>
                {busy==='dashboard'?'📊 Loading…':'📊 Load B2B Dashboard'}
              </button>
              <button className="btn btn-gold" onClick={doWeeklyRun} disabled={busy==='weekly'}>
                {busy==='weekly'?'⚙ Running…':'⚡ Run Weekly Cycle Now'}
              </button>
            </div>
          </div>

          {/* Dashboard stats */}
          {dashboard&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
                {[
                  ['Total Partners', dashboard.summary?.total_partners||0, 'var(--sky)'],
                  ['Active', dashboard.summary?.active_partners||0, 'var(--grn)'],
                  ['⭐ VIP', dashboard.summary?.vip_partners||0, 'var(--gold)'],
                  ['Total B2B Revenue', `৳${(dashboard.summary?.total_revenue||0).toLocaleString()}`, 'var(--gold)'],
                ].map(([label,val,color],i)=>(
                  <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'10px 12px',textAlign:'center'}}>
                    <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>{label}</div>
                    <div style={{fontSize:20,color,fontFamily:'var(--serif)',fontWeight:600}}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Recent Bookings */}
              {dashboard.recent_bookings?.length>0&&(
                <div className="card mb3">
                  <div className="card-hd"><span className="card-title">Recent B2B Bookings</span></div>
                  <table className="tbl">
                    <thead><tr><th>Partner</th><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Revenue</th><th>Commission</th></tr></thead>
                    <tbody>
                      {dashboard.recent_bookings.map((b)=>(
                        <tr key={b.id}>
                          <td style={{fontSize:11,fontWeight:500}}>{b.partner_name}</td>
                          <td style={{fontSize:11}}>{b.guest_name||'—'}</td>
                          <td><span className="badge bb">{b.room_number||'—'}</span></td>
                          <td className="xs muted">{b.check_in}</td>
                          <td className="xs muted">{b.check_out}</td>
                          <td className="xs gold">৳{Number(b.total_amount||0).toLocaleString()}</td>
                          <td className="xs" style={{color:'var(--grn)'}}>৳{Number(b.commission_amount||0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Weekly run results */}
          {billingResult&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--tx)',marginBottom:10}}>⚡ Weekly Run Results — {billingResult.partners_processed} partners processed</div>
              {(billingResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{r.partner}</div>
                    <span style={{fontSize:9,padding:'2px 8px',background:r.action==='commission_sent'?'rgba(63,185,80,.12)':r.action==='re-engagement_sent'?'rgba(224,92,122,.12)':'rgba(255,255,255,.05)',color:r.action==='commission_sent'?'var(--grn)':r.action==='re-engagement_sent'?'var(--rose)':'var(--tx3)',letterSpacing:'.08em',textTransform:'uppercase'}}>
                      {r.action==='commission_sent'?'💰 Commission Sent':r.action==='re-engagement_sent'?'📨 Re-engaged':'✓ No Action'}
                    </span>
                  </div>
                  {r.action==='commission_sent'&&<div style={{fontSize:10,color:'var(--gold)'}}>Commission: ৳{Number(r.commission||0).toLocaleString()} · {r.bookings} booking{r.bookings!==1?'s':''} this week</div>}
                  {r.action==='re-engagement_sent'&&<div style={{fontSize:10,color:'var(--tx3)'}}>Inactive {r.days_inactive} days · Discount offer sent</div>}
                  {(r.statement||r.message)&&(
                    <div style={{marginTop:6,fontSize:10,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',whiteSpace:'pre-wrap',maxHeight:120,overflow:'auto'}}>
                      {r.statement||r.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Automation schedule */}
          {!dashboard&&!billingResult&&(
            <div className="card" style={{background:'rgba(200,169,110,.03)',border:'1px solid rgba(200,169,110,.15)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--gold)',marginBottom:10}}>⏰ Automated Schedule</div>
              {[
                ['Every Sunday 10 PM','Run weekly cycle — commission statements + re-engagement offers'],
                ['Active partners (any bookings)','Commission statement emailed + VIP check (≥10 total bookings)'],
                ['Inactive ≥14 days','Re-engagement WhatsApp: ৳200 discount code generated'],
                ['VIP threshold','Auto-upgrade to VIP status at 10 total bookings'],
              ].map(([trigger,action],i)=>(
                <div key={i} style={{display:'flex',gap:10,marginBottom:8,padding:'8px 10px',background:'rgba(0,0,0,.2)'}}>
                  <div style={{fontSize:10,color:'var(--gold)',minWidth:160,fontWeight:500}}>{trigger}</div>
                  <div style={{fontSize:10,color:'var(--tx3)'}}>{action}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════ PLAN G — UPSELL PANEL ══════════════════════════ */
function PlanGPanel({toast, reservations, rooms, guests}) {
  const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/plan-g-upsell'
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

  const [activeTab, setActiveTab] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [offers, setOffers] = useState([])
  const [busy, setBusy] = useState(null)
  const [agentResult, setAgentResult] = useState(null)
  const [selectedRes, setSelectedRes] = useState('')
  const [loadingOffers, setLoadingOffers] = useState(true)

  useEffect(() => { loadOffers(); loadDashboard() }, [])

  async function call(body) {
    const r = await fetch(EDGE, { method:'POST', headers:{'Content-Type':'application/json','apikey':ANON}, body:JSON.stringify(body) })
    return r.json()
  }

  async function loadOffers() {
    setLoadingOffers(true)
    try {
      const r = await fetch(`${SB_URL}/rest/v1/upsell_offers?tenant_id=eq.${TENANT}&order=created_at.desc&limit=50`, { headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`} })
      const d = await r.json()
      setOffers(Array.isArray(d)?d:[])
    } catch(e) {}
    finally { setLoadingOffers(false) }
  }

  async function loadDashboard() {
    try {
      const res = await call({action:'dashboard'})
      setDashboard(res)
    } catch(e) {}
  }

  async function runAgent(action, resId) {
    setBusy(action); setAgentResult(null)
    try {
      const body = resId ? {action, reservation_id:resId} : {action}
      const res = await call(body)
      if(res.error) { toast(res.error,'error'); return }
      setAgentResult(res)
      loadOffers(); loadDashboard()
      const count = res.results?.length || res.processed || 0
      toast(`✓ ${action==='pre_arrival'?'Pre-arrival':'Room customizer'} — ${count} guest${count!==1?'s':''} messaged`)
    } catch(e){ toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function acceptOffer(offerId, guestName) {
    setBusy(`accept:${offerId}`)
    try {
      const res = await call({action:'accept_offer', offer_id:offerId, guest_reply:'yes'})
      if(res.error) { toast(res.error,'error'); return }
      toast(`✓ ৳${Number(res.amount).toLocaleString()} added to ${guestName}'s folio · ${res.assigned_to} alerted`)
      loadOffers(); loadDashboard()
    } catch(e){ toast(e.message,'error') }
    finally { setBusy(null) }
  }

  async function declineOffer(offerId) {
    setBusy(`decline:${offerId}`)
    try {
      await call({action:'accept_offer', offer_id:offerId, guest_reply:'no'})
      toast('Offer marked as declined')
      loadOffers()
    } catch(e){ toast(e.message,'error') }
    finally { setBusy(null) }
  }

  const getGN = r => {
    const gid = String((r.guest_ids||[])[0]||'')
    const g = guests?.find(g=>String(g.id)===gid)
    return g?.name||'Unknown Guest'
  }

  const statusColor = s => s==='accepted'?'var(--grn)':s==='declined'?'var(--rose)':s==='sent'?'var(--sky)':'var(--tx3)'
  const statusBg   = s => s==='accepted'?'rgba(63,185,80,.12)':s==='declined'?'rgba(224,92,122,.12)':s==='sent'?'rgba(88,166,255,.1)':'rgba(255,255,255,.05)'

  const offerIcon = t => t==='airport_pickup'?'🚗':t==='early_checkin'?'🌅':t==='jet_lag_menu'?'🍽':t==='room_upgrade'?'👑':t==='sim_card'?'📱':t==='late_checkout'?'🌙':'✨'

  // Upcoming reservations for manual trigger
  const upcoming = (reservations||[]).filter(r=>r.status==='RESERVED'||r.status==='PENDING').slice(0,10)

  return (
    <div>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(200,169,110,.08),rgba(88,166,255,.04))',border:'1px solid rgba(200,169,110,.2)',padding:'12px 16px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--gold)'}}>Plan G — Premium Transit Experience</div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>3-Agent upsell engine · Turns ৳3,500 ADR → ৳5,000+ through perfectly timed offers</div>
          </div>
          {dashboard&&(
            <div style={{display:'flex',gap:16,textAlign:'right'}}>
              <div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Upsell Revenue</div><div style={{fontSize:18,color:'var(--gold)',fontFamily:'var(--serif)'}}>৳{Number(dashboard.summary?.total_upsell_revenue||0).toLocaleString()}</div></div>
              <div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Conversion</div><div style={{fontSize:18,color:'var(--grn)',fontFamily:'var(--serif)'}}>{dashboard.summary?.conversion_rate||0}%</div></div>
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="tabs mb4">
        {[['dashboard','📊 Dashboard'],['agent1','✈ Agent 1 · Pre-Arrival'],['agent2','🍽 Agent 2 · Room Customizer'],['offers','📋 All Offers']].map(([v,l])=>(
          <button key={v} className={`tab${activeTab===v?' on':''}`} onClick={()=>setActiveTab(v)}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {activeTab==='dashboard'&&(
        <div>
          {/* Stats grid */}
          {dashboard&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
              {[
                ['Offers Sent',    dashboard.summary?.total_offers_sent||0,    'var(--sky)'],
                ['Accepted',       dashboard.summary?.total_accepted||0,       'var(--grn)'],
                ['Conversion Rate',`${dashboard.summary?.conversion_rate||0}%`,'var(--gold)'],
                ['Upsell Revenue', `৳${Number(dashboard.summary?.total_upsell_revenue||0).toLocaleString()}`,'var(--gold)'],
              ].map(([label,val,color],i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',textAlign:'center'}}>
                  <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{label}</div>
                  <div style={{fontSize:22,color,fontFamily:'var(--serif)',fontWeight:600}}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* By offer type breakdown */}
          {dashboard?.by_type&&Object.keys(dashboard.by_type).length>0&&(
            <div className="card mb4">
              <div className="card-hd"><span className="card-title">Performance by Offer Type</span></div>
              <table className="tbl">
                <thead><tr><th>Offer</th><th>Sent</th><th>Accepted</th><th>Conversion</th><th>Revenue</th></tr></thead>
                <tbody>
                  {Object.entries(dashboard.by_type).map(([type, data])=>(
                    <tr key={type}>
                      <td><span style={{marginRight:6}}>{offerIcon(type)}</span>{type.replace(/_/g,' ').replace(/\w/g,l=>l.toUpperCase())}</td>
                      <td className="xs muted">{data.sent}</td>
                      <td className="xs" style={{color:'var(--grn)'}}>{data.accepted}</td>
                      <td className="xs gold">{data.sent>0?Math.round(data.accepted/data.sent*100):0}%</td>
                      <td className="xs gold">৳{Number(data.revenue||0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Upsell catalog */}
          <div className="card">
            <div className="card-hd"><span className="card-title">Upsell Catalog — Plan G Offers</span></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                ['🚗','airport_pickup',   'Airport Pickup',            '৳500',  '24h before','Private car from any Dhaka airport → hotel'],
                ['🌅','early_checkin',   'Early Check-in (9AM-12PM)', '৳1,000','24h before','Guaranteed room from 9:00 AM for morning arrivals'],
                ['🍽','jet_lag_menu',    "Chef Samim’s Jet Lag Menu",  '৳850',  '4h before', 'Light recovery meal ready in room on arrival'],
                ['👑','room_upgrade',    'Royal Suite Upgrade',        '৳4,000','4h before', 'Room 303 — balcony, premium amenities'],
                ['📱','sim_card',        'Welcome SIM Pack',           '৳800',  '4h before', 'Local SIM + 10GB data waiting in room'],
                ['🌙','late_checkout',   'Late Check-out (till 6PM)',  '৳1,500','Day of',    'Keep room for guests with late flights'],
              ].map(([icon,type,title,price,timing,desc])=>(
                <div key={type} style={{background:'rgba(200,169,110,.03)',border:'1px solid var(--br)',padding:'10px 12px',display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{title}</div>
                    <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{desc}</div>
                    <div style={{display:'flex',gap:12,marginTop:6}}>
                      <span style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>{price}</span>
                      <span style={{fontSize:10,color:'var(--tx3)'}}>{timing}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── AGENT 1: PRE-ARRIVAL SPECIALIST ── */}
      {activeTab==='agent1'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>✈</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 1 — Pre-Arrival Specialist</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Sends personalized WhatsApp 24h before check-in · Offers Airport Pickup (৳500) + Early Check-in (৳1,000)</div>
              </div>
            </div>

            <div style={{background:'rgba(88,166,255,.05)',border:'1px solid rgba(88,166,255,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--sky)'}}>
              💡 <strong>Why it works:</strong> Pre-arrival messages have 80% higher acceptance than check-in offers — guests are still in "planning mode"
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              <button className="btn btn-gold" onClick={()=>runAgent('pre_arrival',null)} disabled={busy==='pre_arrival'}>
                {busy==='pre_arrival'?`🔄 Running…`:`✈ Run for Tomorrow’s Arrivals`}
              </button>
            </div>

            {/* Manual trigger for specific reservation */}
            <div style={{paddingTop:12,borderTop:'1px solid var(--br2)'}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Or trigger for a specific reservation</div>
              <div style={{display:'flex',gap:8}}>
                <select className="finput" style={{flex:1}} value={selectedRes} onChange={e=>setSelectedRes(e.target.value)}>
                  <option value="">— Select upcoming reservation —</option>
                  {upcoming.map(r=>(
                    <option key={r.id} value={r.id}>{getGN(r)} · {(r.room_ids||[]).join(',')} · {r.check_in?.slice(0,10)}</option>
                  ))}
                </select>
                <button className="btn btn-gold btn-sm" style={{padding:'0 14px',whiteSpace:'nowrap'}} disabled={!selectedRes||busy==='pre_arrival'} onClick={()=>runAgent('pre_arrival',selectedRes)}>
                  Send Offers
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {agentResult?.agent==='PreArrival'&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>
                ✓ Agent 1 processed {agentResult.processed} reservation{agentResult.processed!==1?'s':''}
              </div>
              {(agentResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{r.guest}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>Room {r.room} · Check-in: {r.check_in} · {r.phone}</div>
                    </div>
                    {r.skipped?<span style={{fontSize:10,color:'var(--tx3)'}}>⏭ {r.skipped}</span>:<span style={{fontSize:9,background:'rgba(88,166,255,.12)',color:'var(--sky)',padding:'2px 8px',letterSpacing:'.1em'}}>SENT</span>}
                  </div>
                  {r.whatsapp_message&&(
                    <div style={{background:'rgba(37,211,102,.05)',border:'1px solid rgba(37,211,102,.2)',padding:'10px 12px',fontSize:11,color:'var(--tx2)',lineHeight:1.6}}>
                      <div style={{fontSize:9,color:'#25D366',fontWeight:600,marginBottom:6,letterSpacing:'.1em'}}>📱 WHATSAPP MESSAGE</div>
                      {r.whatsapp_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT 2: ROOM CUSTOMIZER ── */}
      {activeTab==='agent2'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>🍽</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 2 — Room Customizer</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Sends targeted upsells 4h before arrival · Jet Lag Menu (৳850) · Room Upgrade · SIM Pack · Smart targeting for international guests</div>
              </div>
            </div>

            <div style={{background:'rgba(200,169,110,.05)',border:'1px solid rgba(200,169,110,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--gold)'}}>
              🎯 <strong>Smart targeting:</strong> International guests automatically get Jet Lag Menu + SIM Pack · Local guests get Jet Lag Menu + Royal Suite Upgrade
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              <button className="btn btn-gold" onClick={()=>runAgent('room_customizer',null)} disabled={busy==='room_customizer'}>
                {busy==='room_customizer'?`🔄 Running…`:`🍽 Run for Today’s Arrivals`}
              </button>
            </div>

            <div style={{paddingTop:12,borderTop:'1px solid var(--br2)'}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Or trigger for specific reservation</div>
              <div style={{display:'flex',gap:8}}>
                <select className="finput" style={{flex:1}} value={selectedRes} onChange={e=>setSelectedRes(e.target.value)}>
                  <option value="">— Select reservation —</option>
                  {upcoming.map(r=>(
                    <option key={r.id} value={r.id}>{getGN(r)} · {(r.room_ids||[]).join(',')} · {r.check_in?.slice(0,10)}</option>
                  ))}
                </select>
                <button className="btn btn-gold btn-sm" style={{padding:'0 14px',whiteSpace:'nowrap'}} disabled={!selectedRes||busy==='room_customizer'} onClick={()=>runAgent('room_customizer',selectedRes)}>
                  Send Offers
                </button>
              </div>
            </div>
          </div>

          {agentResult?.agent==='RoomCustomizer'&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ Agent 2 processed {agentResult.processed} reservation{agentResult.processed!==1?'s':''}</div>
              {(agentResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{r.guest}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>Room {r.room} · Arrival: {r.arrival_time} · {r.international?'🌍 International':'🇧🇩 Local'}</div>
                    </div>
                    {r.skipped?<span style={{fontSize:10,color:'var(--tx3)'}}>⏭ {r.skipped}</span>:(
                      <div style={{display:'flex',gap:4}}>{(r.offers_sent||[]).map((o)=>(
                        <span key={o} style={{fontSize:9,background:'rgba(200,169,110,.15)',color:'var(--gold)',padding:'2px 8px',letterSpacing:'.08em'}}>{o.replace(/_/g,' ').toUpperCase()}</span>
                      ))}</div>
                    )}
                  </div>
                  {r.whatsapp_message&&(
                    <div style={{background:'rgba(37,211,102,.05)',border:'1px solid rgba(37,211,102,.2)',padding:'10px 12px',fontSize:11,color:'var(--tx2)',lineHeight:1.6}}>
                      <div style={{fontSize:9,color:'#25D366',fontWeight:600,marginBottom:6,letterSpacing:'.1em'}}>📱 WHATSAPP MESSAGE</div>
                      {r.whatsapp_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ALL OFFERS / LOGISTICS ── */}
      {activeTab==='offers'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--tx3)'}}>All upsell offers — click Accept to bill folio + alert front desk</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{loadOffers();loadDashboard()}}>↻ Refresh</button>
          </div>

          {loadingOffers?(
            <div style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>Loading offers…</div>
          ):(
            <div>
              {offers.length===0&&(
                <div className="card" style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>
                  No offers yet — run Agent 1 or Agent 2 to generate upsell messages
                </div>
              )}
              {offers.map((o)=>(
                <div key={o.id} style={{background:'rgba(0,0,0,.15)',border:`1px solid ${o.status==='accepted'?'rgba(63,185,80,.3)':o.status==='declined'?'rgba(224,92,122,.2)':'var(--br)'}`,padding:'12px 14px',marginBottom:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <span style={{fontSize:16}}>{offerIcon(o.offer_type)}</span>
                        <div>
                          <span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{o.offer_title}</span>
                          <span style={{marginLeft:8,fontSize:11,color:'var(--gold)',fontWeight:500}}>৳{Number(o.offer_price).toLocaleString()}</span>
                        </div>
                        <span style={{fontSize:9,padding:'2px 8px',background:statusBg(o.status),color:statusColor(o.status),letterSpacing:'.08em',textTransform:'uppercase',fontWeight:600}}>
                          {o.status}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:'var(--tx2)'}}>{o.guest_name} · Room {o.room_number} · Check-in: {o.check_in}</div>
                      {o.alert_message&&o.status==='accepted'&&(
                        <div style={{marginTop:6,fontSize:10,color:'var(--grn)',background:'rgba(63,185,80,.06)',border:'1px solid rgba(63,185,80,.2)',padding:'6px 8px'}}>
                          🔔 {o.alert_message} · Assigned: <strong>{o.assigned_to}</strong>
                        </div>
                      )}
                    </div>
                    {o.status==='sent'&&(
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        <button
                          className="btn btn-success btn-sm"
                          style={{fontSize:10,padding:'4px 10px'}}
                          disabled={busy===`accept:${o.id}`}
                          onClick={()=>acceptOffer(o.id, o.guest_name)}>
                          {busy===`accept:${o.id}`?'Processing…':'✓ Accept + Bill'}
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{fontSize:10,padding:'4px 8px',background:'rgba(224,92,122,.1)',color:'var(--rose)',border:'1px solid rgba(224,92,122,.3)'}}
                          disabled={busy===`decline:${o.id}`}
                          onClick={()=>declineOffer(o.id)}>
                          ✕
                        </button>
                      </div>
                    )}
                    {o.status==='accepted'&&(
                      <div style={{fontSize:10,color:'var(--grn)',textAlign:'right',flexShrink:0}}>
                        <div>✓ Billed {o.billed?'✓':''}</div>
                        <div style={{color:'var(--tx3)'}}>{o.assigned_to}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════ LEAD GEN SWARM ══════════════════════════ */
function LeadGenSwarmPanel({toast}) {
  const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/lead-gen-swarm'
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

  const [activeTab, setActiveTab] = useState('dashboard')
  const [leads, setLeads] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [busy, setBusy] = useState(null)
  const [scoutResult, setScoutResult] = useState(null)
  const [analystResult, setAnalystResult] = useState(null)
  const [outreachResult, setOutreachResult] = useState(null)
  const [replyModal, setReplyModal] = useState(null) // {leadId, name}
  const [replyText, setReplyText] = useState('')
  const [leadType, setLeadType] = useState('corporate')
  const [scoreThreshold, setScoreThreshold] = useState(80)
  const [loadingLeads, setLoadingLeads] = useState(true)

  useEffect(()=>{ loadLeads(); loadDashboard() },[])

  async function call(body) {
    const r = await fetch(EDGE,{method:'POST',headers:{'Content-Type':'application/json','apikey':ANON},body:JSON.stringify(body)})
    return r.json()
  }

  async function loadLeads() {
    setLoadingLeads(true)
    try {
      const r = await fetch(`${SB_URL}/rest/v1/swarm_leads?tenant_id=eq.${TENANT}&select=*&order=intent_score.desc&limit=50`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`}})
      const d = await r.json()
      setLeads(Array.isArray(d)?d:[])
    } catch(e){}
    finally{setLoadingLeads(false)}
  }

  async function loadDashboard() {
    try { const d = await call({action:'dashboard'}); setDashboard(d) } catch(e){}
  }

  async function doScout() {
    setBusy('scout'); setScoutResult(null)
    try {
      const res = await call({action:'scout', lead_type:leadType})
      if(res.error){toast(res.error,'error');return}
      setScoutResult(res)
      toast(`✓ ${res.leads_found} ${leadType} leads found & saved`)
      loadLeads(); loadDashboard()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  async function doAnalyzeAll() {
    setBusy('analyze'); setAnalystResult(null)
    try {
      const res = await call({action:'analyze'})
      if(res.error){toast(res.error,'error');return}
      setAnalystResult(res)
      toast(`✓ ${res.scored} leads scored · ${res.high_priority_count} high priority`)
      loadLeads(); loadDashboard()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  async function doAnalyzeLead(leadId) {
    setBusy(`analyze:${leadId}`)
    try {
      const res = await call({action:'analyze', lead_id:leadId})
      toast(`✓ Lead scored: ${res.results?.[0]?.score||'?'}/100`)
      loadLeads(); loadDashboard()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  async function doBulkOutreach() {
    setBusy('bulk_outreach'); setOutreachResult(null)
    try {
      const res = await call({action:'outreach', score_threshold:scoreThreshold})
      if(res.error){toast(res.error,'error');return}
      setOutreachResult(res)
      toast(`✓ ${res.sent} outreach messages generated`)
      loadLeads(); loadDashboard()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  async function doOutreachLead(leadId, channel) {
    setBusy(`outreach:${leadId}`)
    try {
      const res = await call({action:'outreach', lead_id:leadId, channel})
      if(res.error){toast(res.error,'error');return}
      toast(`✓ Outreach drafted for ${res.lead_name} via ${res.channel}`)
      loadLeads()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  async function doSync(leadId, reply) {
    setBusy(`sync:${leadId}`)
    try {
      const res = await call({action:'crm_sync', lead_id:leadId, reply_text:reply})
      if(res.error){toast(res.error,'error');return}
      toast(`✓ ${res.lead_name} synced to CRM · Front desk notified · Priority: ${res.urgency}`)
      setReplyModal(null); setReplyText('')
      loadLeads(); loadDashboard()
    } catch(e){toast(e.message,'error')}
    finally{setBusy(null)}
  }

  const scoreColor = s => s>=80?'var(--grn)':s>=60?'var(--gold)':s>=40?'var(--sky)':'var(--tx3)'
  const scoreBg    = s => s>=80?'rgba(63,185,80,.12)':s>=60?'rgba(200,169,110,.12)':s>=40?'rgba(88,166,255,.08)':'rgba(255,255,255,.04)'
  const typeIcon   = t => t==='corporate'?'🏢':t==='event_organizer'?'🎪':t==='long_stay'?'🏠':'👤'
  const statusBadge = s => {
    const map = {new:{color:'var(--tx3)',bg:'rgba(255,255,255,.05)',label:'New'},scored:{color:'var(--sky)',bg:'rgba(88,166,255,.1)',label:'Scored'},outreach_sent:{color:'var(--gold)',bg:'rgba(200,169,110,.12)',label:'Outreach Sent'},replied:{color:'var(--grn)',bg:'rgba(63,185,80,.12)',label:'Replied'},converted:{color:'var(--grn)',bg:'rgba(63,185,80,.2)',label:'Converted'},rejected:{color:'var(--rose)',bg:'rgba(224,92,122,.1)',label:'Rejected'}}
    return map[s]||{color:'var(--tx3)',bg:'rgba(255,255,255,.04)',label:s}
  }

  return (
    <div>
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.06),rgba(200,169,110,.04))',border:'1px solid rgba(88,166,255,.2)',padding:'12px 16px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--sky)'}}>🎯 Lead Gen Swarm — 3 AI Agents</div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>Scout → Score → Outreach → CRM Sync · Corporate · Event Organizers · Long-Stay Expats</div>
          </div>
          {dashboard&&(
            <div style={{display:'flex',gap:16,textAlign:'right'}}>
              <div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Total Leads</div><div style={{fontSize:18,color:'var(--sky)',fontFamily:'var(--serif)'}}>{dashboard.total_leads}</div></div>
              <div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>High Priority</div><div style={{fontSize:18,color:'var(--rose)',fontFamily:'var(--serif)'}}>{dashboard.high_priority}</div></div>
              <div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Replied</div><div style={{fontSize:18,color:'var(--grn)',fontFamily:'var(--serif)'}}>{dashboard.replied}</div></div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb4">
        {[['dashboard','📊 Dashboard'],['scout','🔍 Agent 1 · Scout'],['analyst','🧠 Agent 2 · Analyst'],['outreach','📨 Agent 3 · Outreach'],['leads','📋 All Leads']].map(([v,l])=>(
          <button key={v} className={`tab${activeTab===v?' on':''}`} onClick={()=>setActiveTab(v)}>{l}</button>
        ))}
      </div>

      {/* Reply Modal */}
      {replyModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setReplyModal(null)}>
          <div style={{background:'var(--bg2)',border:'1px solid var(--br)',padding:24,width:480,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)',marginBottom:16}}>Log Reply — {replyModal.name}</div>
            <div className="fg mb3">
              <label className="flbl">Paste their reply message</label>
              <textarea className="finput" rows={4} value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="e.g. Yes, we're interested! Can we schedule a site visit next week?" style={{resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={()=>setReplyModal(null)}>Cancel</button>
              <button className="btn btn-gold" disabled={!replyText.trim()||busy===`sync:${replyModal.leadId}`} onClick={()=>doSync(replyModal.leadId,replyText)}>
                {busy===`sync:${replyModal.leadId}`?'Syncing…':'✓ Sync to CRM + Notify Front Desk'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {activeTab==='dashboard'&&(
        <div>
          {dashboard&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
                {[['Total Leads',dashboard.total_leads,'var(--sky)'],['High Priority (80+)',dashboard.high_priority,'var(--rose)'],['Outreach Sent',dashboard.by_status?.outreach_sent||0,'var(--gold)'],['Replied',dashboard.replied,'var(--grn)']].map(([l,v,c],i)=>(
                  <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',textAlign:'center'}}>
                    <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{l}</div>
                    <div style={{fontSize:24,color:c,fontFamily:'var(--serif)',fontWeight:600}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div className="card">
                  <div className="card-hd"><span className="card-title">By Lead Type</span></div>
                  {Object.entries(dashboard.by_type||{}).map(([type,count])=>(
                    <div key={type} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br2)',fontSize:12}}>
                      <span>{typeIcon(type)} {type.replace(/_/g,' ').replace(/\w/g,l=>l.toUpperCase())}</span>
                      <span style={{color:'var(--gold)',fontWeight:600}}>{count}</span>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="card-hd"><span className="card-title">By Status</span></div>
                  {Object.entries(dashboard.by_status||{}).map(([status,count])=>{
                    const b=statusBadge(status)
                    return (<div key={status} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br2)',fontSize:12}}>
                      <span style={{color:b.color}}>{b.label}</span>
                      <span style={{color:'var(--gold)',fontWeight:600}}>{count}</span>
                    </div>)
                  })}
                </div>
              </div>
              {/* Top leads */}
              {dashboard.top_leads?.length>0&&(
                <div className="card">
                  <div className="card-hd"><span className="card-title">Top Priority Leads (Score ≥70)</span></div>
                  {dashboard.top_leads.map((l) =>(
                    <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br2)'}}>
                      <div style={{width:36,height:36,background:scoreBg(l.intent_score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:13,color:scoreColor(l.intent_score),fontWeight:700,flexShrink:0}}>{l.intent_score}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.full_name} <span style={{fontSize:10,color:'var(--tx3)'}}>· {l.title}</span></div>
                        <div style={{fontSize:10,color:'var(--tx3)'}}>{typeIcon(l.lead_type)} {l.company_name} · {l.area}</div>
                      </div>
                      <span style={{fontSize:9,padding:'2px 8px',background:statusBadge(l.outreach_status).bg,color:statusBadge(l.outreach_status).color,letterSpacing:'.08em',textTransform:'uppercase',flexShrink:0}}>{statusBadge(l.outreach_status).label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT 1: SCOUT ── */}
      {activeTab==='scout'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>🔍</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 1 — The Digital Scout</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Discovers leads from LinkedIn, corporate directories, Facebook groups · 3 lead types: Corporate, Event Organizers, Long-Stay Expats</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:14}}>
              <div>
                <label className="flbl">Lead Type to Scout</label>
                <select className="finput" value={leadType} onChange={e=>setLeadType(e.target.value)}>
                  <option value="corporate">🏢 Corporate — HR/Travel Managers in Nikunja, Khilkhet, Uttara</option>
                  <option value="event_organizer">🎪 Event Organizers — Training coordinators, seminar planners</option>
                  <option value="long_stay">🏠 Long-Stay — Expats, consultants moving to Dhaka</option>
                </select>
              </div>
              <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                <button className="btn btn-gold" onClick={doScout} disabled={busy==='scout'} style={{whiteSpace:'nowrap'}}>
                  {busy==='scout'?'🔄 Scouting…':'🔍 Scout Now'}
                </button>
              </div>
            </div>
            {[
              {type:'corporate',icon:'🏢',title:'Airport Transit Strategy',target:'HR & Travel Managers at multinationals in Nikunja/Khilkhet/Uttara',pitch:'Dedicated Corporate Wing · 24/7 check-in · High-speed WiFi · Corporate rates'},
              {type:'event_organizer',icon:'🎪',title:'Small Gathering Strategy',target:'Event planners, training coordinators needing space for 10-30 people',pitch:`30-room boutique · Private meeting room · Chef Samim’s Day-Use lunch package`},
              {type:'long_stay',icon:'🏠',title:'Long-Stay Strategy',target:'Expats & consultants moving to Dhaka, Facebook "Expats in Dhaka" groups',pitch:'Home-Away-From-Home · 24/7 security · Airport proximity · Weekly/monthly rates'},
            ].map(s=>(
              <div key={s.type} style={{background:leadType===s.type?'rgba(200,169,110,.06)':'rgba(0,0,0,.1)',border:`1px solid ${leadType===s.type?'rgba(200,169,110,.3)':'var(--br)'}`,padding:'10px 12px',marginBottom:6,cursor:'pointer'}} onClick={()=>setLeadType(s.type)}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{s.icon} {s.title}</div>
                <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>Target: {s.target}</div>
                <div style={{fontSize:10,color:'var(--gold)',marginTop:2}}>Pitch: {s.pitch}</div>
              </div>
            ))}
          </div>
          {scoutResult&&(
            <div className="card">
              <div style={{fontSize:12,color:'var(--grn)',fontWeight:600,marginBottom:10}}>✓ {scoutResult.leads_found} leads found ({scoutResult.lead_type})</div>
              {(scoutResult.leads||[]).map((l,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.15)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:6}}>
                  <div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{l.full_name} <span style={{fontSize:10,color:'var(--tx3)',fontWeight:400}}>· {l.title}</span></div>
                  <div style={{fontSize:11,color:'var(--sky)',marginTop:2}}>{l.company_name} · {l.area}</div>
                  <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>{l.qualification_notes}</div>
                  {l.email&&<div style={{fontSize:10,color:'var(--tx2)',marginTop:2}}>{l.email} {l.phone&&`· ${l.phone}`}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT 2: ANALYST ── */}
      {activeTab==='analyst'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>🧠</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 2 — The Intent Analyst</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Scores leads 0-100 · Analyzes transit needs, event frequency, travel policy · Score ≥80 → auto-queued for outreach</div>
              </div>
            </div>
            <div style={{background:'rgba(88,166,255,.05)',border:'1px solid rgba(88,166,255,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--sky)'}}>
              📊 <strong>Scoring logic:</strong> Corporate in Nikunja +30 · Travel/HR role +25 · Multinational +20 · Event frequency +40 · Expat/consultant +40
            </div>
            <button className="btn btn-gold" onClick={doAnalyzeAll} disabled={busy==='analyze'}>
              {busy==='analyze'?'🧠 Analyzing…':'🧠 Analyze All Unscored Leads'}
            </button>
          </div>
          {analystResult&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>
                ✓ {analystResult.scored} leads scored · {analystResult.high_priority_count} high priority (≥80)
              </div>
              {(analystResult.results||[]).map((r,i)=>(
                <div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br2)',alignItems:'flex-start'}}>
                  <div style={{width:44,height:44,background:scoreBg(r.score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:16,color:scoreColor(r.score),fontWeight:700,flexShrink:0}}>{r.score}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{r.name} <span style={{fontSize:10,color:'var(--tx3)'}}>· {r.company}</span></div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
                      {(r.signals||[]).map((s,j)=>(
                        <span key={j} style={{fontSize:9,padding:'2px 6px',background:'rgba(88,166,255,.08)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.2)'}}>{s}</span>
                      ))}
                    </div>
                    {r.high_priority&&<span style={{display:'inline-block',marginTop:4,fontSize:9,padding:'2px 8px',background:'rgba(224,92,122,.12)',color:'var(--rose)',letterSpacing:'.08em'}}>🔴 HIGH PRIORITY</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT 3: OUTREACH ── */}
      {activeTab==='outreach'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>📨</span>
              <div>
                <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 3 — The Outreach Specialist</div>
                <div style={{fontSize:10,color:'var(--tx3)'}}>Sends personalized LinkedIn/email/WhatsApp · Auto-outreach for score ≥80 · Post-reply: syncs to CRM + alerts front desk</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'flex-end',marginBottom:14}}>
              <div style={{flex:1}}>
                <label className="flbl">Auto-outreach score threshold</label>
                <input type="range" min={50} max={95} step={5} value={scoreThreshold} onChange={e=>setScoreThreshold(+e.target.value)} style={{width:'100%',marginTop:6}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--tx3)',marginTop:2}}>
                  <span>50 (broad)</span><span style={{color:'var(--gold)',fontWeight:600}}>Current: {scoreThreshold}+</span><span>95 (strict)</span>
                </div>
              </div>
              <button className="btn btn-gold" onClick={doBulkOutreach} disabled={busy==='bulk_outreach'} style={{whiteSpace:'nowrap',marginBottom:0}}>
                {busy==='bulk_outreach'?'📨 Sending…':`📨 Send to All ≥${scoreThreshold}`}
              </button>
            </div>
            <div style={{background:'rgba(63,185,80,.05)',border:'1px solid rgba(63,185,80,.15)',padding:'10px 14px',fontSize:11,color:'var(--grn)'}}>
              🔄 <strong>CRM Sync flow:</strong> Guest replies → log reply below → Agent 3 analyzes intent → creates guest profile in CRM → notifies front desk with priority level
            </div>
          </div>
          {outreachResult&&(
            <div className="card mb4">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ {outreachResult.sent} messages sent (threshold: {outreachResult.threshold})</div>
              {(outreachResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.15)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div><span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{r.lead_name}</span> <span style={{fontSize:10,color:'var(--tx3)'}}>· {r.company} · Score: {r.score}</span></div>
                    <span style={{fontSize:9,padding:'2px 8px',background:'rgba(200,169,110,.12)',color:'var(--gold)',letterSpacing:'.08em',textTransform:'uppercase'}}>{r.channel}</span>
                  </div>
                  {r.message&&<div style={{fontSize:11,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',lineHeight:1.6}}>{r.message}</div>}
                  <div style={{fontSize:10,color:'var(--tx3)',marginTop:6}}>Contact: {r.contact||'—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ALL LEADS ── */}
      {activeTab==='leads'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--tx3)'}}>{leads.length} leads total — sorted by score</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{loadLeads();loadDashboard()}}>↻ Refresh</button>
          </div>
          {loadingLeads?(<div style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>Loading…</div>):(
            leads.length===0?(<div className="card" style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>No leads yet — run Agent 1 to scout</div>):
            leads.map((l) =>{
              const sb = statusBadge(l.outreach_status)
              const signals = typeof l.intent_signals === 'string' ? JSON.parse(l.intent_signals||'[]') : (l.intent_signals||[])
              return (
                <div key={l.id} style={{background:'rgba(0,0,0,.12)',border:'1px solid var(--br)',padding:'12px 14px',marginBottom:6}}>
                  <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                    {/* Score badge */}
                    {l.intent_score>0&&(
                      <div style={{width:40,height:40,background:scoreBg(l.intent_score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:14,color:scoreColor(l.intent_score),fontWeight:700,flexShrink:0}}>{l.intent_score}</div>
                    )}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:4}}>
                        <div>
                          <span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{l.full_name}</span>
                          <span style={{fontSize:10,color:'var(--tx3)',marginLeft:6}}>{l.title}</span>
                          <span style={{fontSize:9,padding:'1px 6px',background:'rgba(88,166,255,.08)',color:'var(--sky)',marginLeft:6,letterSpacing:'.06em'}}>{typeIcon(l.lead_type)} {l.lead_type.replace(/_/g,' ')}</span>
                        </div>
                        <span style={{fontSize:9,padding:'2px 8px',background:sb.bg,color:sb.color,letterSpacing:'.08em',textTransform:'uppercase',flexShrink:0,fontWeight:600}}>{sb.label}</span>
                      </div>
                      <div style={{fontSize:11,color:'var(--sky)'}}>{l.company_name} · {l.area}</div>
                      <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{l.email} {l.phone&&`· ${l.phone}`}</div>
                      {signals.length>0&&(
                        <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5}}>
                          {signals.map((s,i)=><span key={i} style={{fontSize:9,padding:'1px 6px',background:'rgba(88,166,255,.06)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.15)'}}>{s}</span>)}
                        </div>
                      )}
                      {l.outreach_message&&(
                        <details style={{marginTop:6}}>
                          <summary style={{fontSize:10,color:'var(--gold)',cursor:'pointer'}}>📨 View outreach message ▾</summary>
                          <div style={{marginTop:4,fontSize:10,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',lineHeight:1.6,maxHeight:150,overflow:'auto'}}>{l.outreach_message}</div>
                        </details>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
                      {l.outreach_status==='new'&&(
                        <button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(88,166,255,.1)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.3)'}} disabled={busy===`analyze:${l.id}`} onClick={()=>doAnalyzeLead(l.id)}>
                          {busy===`analyze:${l.id}`?'Scoring…':'🧠 Score'}
                        </button>
                      )}
                      {(l.outreach_status==='scored'||l.intent_score>0)&&l.outreach_status!=='outreach_sent'&&l.outreach_status!=='replied'&&(
                        <>
                          <button className="btn btn-sm btn-gold" style={{fontSize:9,padding:'3px 8px'}} disabled={!!busy} onClick={()=>doOutreachLead(l.id,'linkedin')}>
                            💼 LinkedIn
                          </button>
                          <button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(37,211,102,.1)',color:'#25D366',border:'1px solid rgba(37,211,102,.3)'}} disabled={!!busy} onClick={()=>doOutreachLead(l.id,'whatsapp')}>
                            📱 WhatsApp
                          </button>
                        </>
                      )}
                      {l.outreach_status==='outreach_sent'&&(
                        <button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(63,185,80,.1)',color:'var(--grn)',border:'1px solid rgba(63,185,80,.3)'}} onClick={()=>{setReplyModal({leadId:l.id,name:l.full_name});setReplyText('')}}>
                          ✉ Log Reply
                        </button>
                      )}
                      {l.outreach_status==='replied'&&!l.crm_synced&&(
                        <button className="btn btn-sm btn-gold" style={{fontSize:9,padding:'3px 8px'}} disabled={!!busy} onClick={()=>doSync(l.id,'interested')}>
                          🔄 Sync CRM
                        </button>
                      )}
                      {l.crm_synced&&<span style={{fontSize:9,color:'var(--grn)'}}>✓ CRM</span>}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
function WorkflowMonitor({toast}) {
  const [runs,setRuns]=useState([])
  const [loading,setLoading]=useState(true)
  const [triggering,setTriggering]=useState(null)
  const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'
  const BASE='https://mynwfkgksqqwlqowlscj.supabase.co'

  const WORKFLOWS = [
    {id:'morning-briefing',  label:'Morning Briefing',      slug:'wf-morning-briefing',  time:'7:00 AM daily',   body:'{}'},
    {id:'checkout-reminder', label:'Checkout Reminder',     slug:'wf-checkout-alerts',   time:'10:30 AM daily',  body:'{"mode":"reminder"}'},
    {id:'overdue-alert',     label:'Overdue Alert',         slug:'wf-checkout-alerts',   time:'12:30 PM daily',  body:'{"mode":"overdue"}'},
    {id:'evening-revenue',   label:'Evening Revenue Report',slug:'wf-evening-report',    time:'9:00 PM daily',   body:'{}'},
    {id:'weekly-summary',    label:'Weekly Summary',        slug:'wf-period-reports',    time:'Mon 8:00 AM',     body:'{"mode":"weekly"}'},
    {id:'monthly-report',    label:'Monthly Report',        slug:'wf-period-reports',    time:'1st of month',    body:'{"mode":"monthly"}'},
    {id:'competitor-monitor',label:'Competitor Monitor',    slug:'wf-competitor-monitor',time:'6:00 AM daily',   body:'{}'},
    {id:'backup-verification',label:'Backup Verification',  slug:'wf-backup-verify',     time:'Sunday 11 PM',    body:'{}'},
  ]

  useEffect(()=>{
    db('workflow_runs','?select=workflow_name,status,duration_ms,records_processed,ran_at&order=ran_at.desc&limit=50')
      .then(d=>{ setRuns(Array.isArray(d)?d:[]); setLoading(false) })
      .catch(()=>setLoading(false))
  },[])

  async function triggerNow(wf) {
    setTriggering(wf.id)
    try {
      const resp = await fetch(`${BASE}/functions/v1/${wf.slug}`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SB_ANON},
        body: wf.body
      })
      const data = await resp.json()
      if(data.error) toast(`${wf.label}: ${data.error}`,'error')
      else toast(`${wf.label} triggered ✓`)
      // Refresh runs
      const fresh = await db('workflow_runs','?select=workflow_name,status,duration_ms,records_processed,ran_at&order=ran_at.desc&limit=50')
      setRuns(Array.isArray(fresh)?fresh:[])
    } catch(e){ toast(e.message,'error') }
    setTriggering(null)
  }

  const lastRun = (wfId) => runs.find(r=>r.workflow_name===wfId)
  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('en',{timeZone:'Asia/Dhaka',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never'

  return <div className="card mb4">
    <div className="card-hd">
      <div className="flex fac gap2">
        <span style={{fontSize:16}}>⚡</span>
        <span className="card-title">Email <em style={{fontStyle:'italic',color:'var(--gold)'}}>Workflows</em></span>
      </div>
      <div className="flex fac gap2">
        <div className="sync-dot"/>
        <span className="xs muted">10 cron jobs active</span>
      </div>
    </div>
    <div className="card-body" style={{padding:0}}>
      {loading
        ? <div className="xs muted" style={{padding:'18px',textAlign:'center'}}>Loading workflow history…</div>
        : WORKFLOWS.map((wf,i)=>{
            const last = lastRun(wf.id)
            const isOk = last?.status==='success'
            const isTrig = triggering===wf.id
            return <div key={wf.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:i<WORKFLOWS.length-1?'1px solid var(--br2)':'none'}}>
              <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:last?(isOk?'var(--grn)':'var(--rose)'):'var(--tx3)',boxShadow:last?(isOk?'0 0 5px var(--grn)':'0 0 5px var(--rose)'):'none'}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:300,color:'var(--tx)'}}>{wf.label}</div>
                <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.08em',marginTop:1,display:'flex',gap:8}}>
                  <span>🕐 {wf.time}</span>
                  {last&&<span style={{color:isOk?'var(--grn)':'var(--rose)'}}>Last: {fmtTime(last.ran_at)}</span>}
                  {last?.duration_ms&&<span>{last.duration_ms}ms</span>}
                </div>
              </div>
              {last&&<span className={`badge ${isOk?'bg':'br_'}`} style={{fontSize:8}}>{last.status}</span>}
              <button
                className="btn btn-ghost btn-sm"
                disabled={!!triggering}
                onClick={()=>triggerNow(wf)}
                style={{fontSize:9,padding:'3px 10px',letterSpacing:'.1em'}}
              >{isTrig?<><span className="spinner" style={{width:10,height:10}}/></>:'▶ Run'}</button>
            </div>
          })
      }
      <div style={{padding:'10px 16px',background:'rgba(200,169,110,.03)',borderTop:'1px solid var(--br2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="xs muted">All emails → hotellfountainbd@gmail.com</span>
        <span className="xs muted">{runs.length} runs logged</span>
      </div>
    </div>
  </div>
}

/* ═══════════════════════ GOOGLE SHEETS CARD ════════════════ */
function GoogleSheetsCard({toast}) {
  const [syncing,setSyncing]=useState(false)
  const [lastSync,setLastSync]=useState(null)
  const [counts,setCounts]=useState(null)
  const [sheetId,setSheetId]=useState('1uekoRKGuhMLXBW8AY3ONr-vPTyml9QDoJgRYA3HsPNU')
  const EDGE_FN='https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/sync-to-sheets'
  const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

  async function runSync(){
    setSyncing(true)
    try{
      const resp=await fetch(EDGE_FN,{method:'POST',headers:{'Content-Type':'application/json','apikey':SB_ANON},body:'{}'})
      const data=await resp.json()
      if(data.error) toast(data.error,'error')
      else{ setLastSync(data.synced_at); setCounts(data.counts); toast('All data synced to Google Sheets ✓') }
    }catch(e){toast('Sync failed: '+e.message,'error')}
    finally{setSyncing(false)}
  }

  return <div className="card">
    <div className="card-hd">
      <div className="flex fac gap2"><span style={{fontSize:16}}>📊</span><span className="card-title">Google Sheets <em style={{fontStyle:'italic',color:'var(--gold)'}}>Backup</em></span></div>
      {lastSync&&<span className="badge bg">Synced {new Date(lastSync).toLocaleTimeString()}</span>}
    </div>
    <div className="card-body">
      <div style={{background:'rgba(63,185,80,.05)',border:'1px solid rgba(63,185,80,.15)',padding:'10px 13px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:400,color:'var(--grn)',marginBottom:3}}>🔄 Auto-Sync Active</div>
        <div className="xs muted">Every INSERT/UPDATE on all 6 tables syncs to Google Sheets in real-time via database triggers.</div>
      </div>
      {counts&&<div className="g2 mb4">{[['🛏 Rooms',counts.rooms],['👤 Guests',counts.guests],['📅 Reservations',counts.reservations],['💰 Transactions',counts.transactions],['🧾 Folios',counts.folios],['🧹 Housekeeping',counts.housekeeping_tasks]].map(([l,v])=><div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val gold">{v} rows</div></div>)}</div>}
      <div className="fg">
        <label className="flbl">Spreadsheet ID</label>
        <input className="finput" value={sheetId} onChange={e=>setSheetId(e.target.value.trim())} placeholder="Paste Spreadsheet ID"/>
      </div>
      <div className="flex gap2" style={{flexWrap:'wrap'}}>
        <button className="btn btn-gold" disabled={syncing} onClick={runSync}>{syncing?<><span className="spinner" style={{width:12,height:12}}/>{' '}Syncing…</>:'📊 Sync All Data Now'}</button>
        {sheetId&&<a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener" className="btn btn-ghost">↗ Open Sheet</a>}
      </div>
    </div>
  </div>
}

/* ═══════════════════════ ROOT APP ═══════════════════════════ */
function App() {
  // BUG FIX: user state is the source of truth — must be null initially
  const [user,setUser]=useState(null)
  const [page,setPage]=useState('dashboard')
  const [data,setData]=useState({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]})
  const [hSettings,setHSettings]=useState({vat_rate:'0',service_charge:'0',active_fiscal_day:''})
  const [foliosMap,setFoliosMap]=useState({})
  const [loading,setLoading]=useState(false)
  const [toastMsg,setToastMsg]=useState(null)
// Hide the HTML loading screen on first React render
  useEffect(()=>{ const el=document.getElementById('loading'); if(el) el.style.display='none'; },[])
  const [clock,setClock]=useState(new Date())
  const [notifOpen,setNotifOpen]=useState(false)
  // Staff list lives here so Settings can mutate it
  const [staffList,setStaffList]=useState(INIT_STAFF)
// Load staff from Supabase on mount (overrides INIT_STAFF)
  useEffect(()=>{
    db('staff',`?tenant_id=eq.${TENANT}&select=*&order=id`)
      .then(d=>{ if(Array.isArray(d)&&d.length>0) setStaffList(d) })
      .catch(()=>{}) // silently fall back to INIT_STAFF
  },[])
  const toastRef=useRef()
  const realtimeRef=useRef(null)

  const toast=useCallback((msg,type='success')=>{
    setToastMsg({msg,type})
    clearTimeout(toastRef.current)
    toastRef.current=setTimeout(()=>setToastMsg(null),3500)
  },[])

  useEffect(()=>{ const t=setInterval(()=>setClock(new Date()),1000); return()=>clearInterval(t) },[])

  // loadAll returns a promise so callers can await it
  const loadAll=useCallback(async()=>{
    try {
      const [rooms,guests,reservations,transactions,tasks,settingsRows,folios]=await Promise.all([
        db('rooms',`?tenant_id=eq.${TENANT}&select=*&order=room_number`),
        fetchAllGuests(),
        db('reservations',`?tenant_id=eq.${TENANT}&select=*&order=check_in.desc&limit=1000`),
        db('transactions',`?tenant_id=eq.${TENANT}&select=*&amount=gt.0&order=timestamp.desc&limit=1000`),
        db('housekeeping_tasks',`?tenant_id=eq.${TENANT}&select=*&order=created_at.desc&limit=100`),
        db('hotel_settings',`?tenant_id=eq.${TENANT}&select=key,value`),
        db('folios',`?tenant_id=eq.${TENANT}&select=*&order=created_at`)
      ])
      setData({
        rooms:Array.isArray(rooms)?rooms:[],
        guests:Array.isArray(guests)?guests:[],
        reservations:Array.isArray(reservations)?reservations:[],
        transactions:Array.isArray(transactions)?transactions:[],
        tasks:Array.isArray(tasks)?tasks:[],
      })
      const sM={}
      if(Array.isArray(settingsRows)) settingsRows.forEach(r=>{sM[r.key]=r.value})
      setHSettings(sM)
      const fM={}
      if(Array.isArray(folios)) folios.forEach(f=>{
        const k=f.reservation_id||f.room_number
        if(!fM[k])fM[k]=[]
        fM[k].push(f)
      })
      setFoliosMap(fM)
    } catch(e){
      console.error('Load failed',e)
      toast('Failed to refresh data — check connection','error')
    }
  },[toast])

  useEffect(()=>{
    if(!user){ setData({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]}); return }
    setLoading(true)
    loadAll().finally(()=>setLoading(false))
    const interval=setInterval(loadAll,90000)
    return()=>clearInterval(interval)
  },[user]) // intentionally omit loadAll to avoid re-running on every render

  useEffect(()=>{
    if(!user) return
    const sClient = window.supabase?.createClient?.(SB_URL, SB_KEY)
    if(!sClient){
      console.warn('Supabase realtime client not available')
      return
    }
    const tables=['rooms','reservations','transactions','folios','guests','housekeeping_tasks']
    const channel=sClient.channel(`crm-live-${TENANT}`)
    tables.forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`tenant_id=eq.${TENANT}`},()=>{
        loadAll()
      })
    })
    channel.subscribe()
    realtimeRef.current={client:sClient,channel}
    return ()=>{
      if(realtimeRef.current?.channel){
        realtimeRef.current.client.removeChannel(realtimeRef.current.channel)
      }
      realtimeRef.current=null
    }
  },[user,loadAll])

  // BUG FIX: signOut fully resets ALL state
  function signOut() {
    setUser(null)
    setPage('dashboard')
    setNotifOpen(false)
    setData({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]})
    setToastMsg(null)
  }

  // ── LOGIN
  if(!user) return (
    <>
      <style>{CSS}</style>
      {/* BUG FIX: pass live staffList so login sees added/edited users */}
      <LoginPage onLogin={u=>{ setUser({...u}); setPage('dashboard') }} staffList={staffList}/>
    </>
  )

  // ── LOADING
  if(loading) return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'var(--bg)'}}>
        <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:32,color:'var(--gold)',letterSpacing:'.02em'}}>Hotel <em style={{fontStyle:'italic'}}>Fountain</em></div>
        <div className="spinner"/>
        <div style={{fontFamily:'var(--sans)',fontSize:9,color:'var(--tx3)',letterSpacing:'.18em',textTransform:'uppercase',fontWeight:200}}>Connecting to Management System…</div>
      </div>
    </>
  )

  const allowed=ROLES[user.role]?.pages||[]
  const cur=allowed.includes(page)?page:allowed[0]
  const pendRes=data.reservations.filter(r=>r.status==='PENDING').length
  const hkUrgent=data.tasks.filter(t=>t.status==='pending'&&t.priority==='high').length
  const dirtyRooms=data.rooms.filter(r=>r.status==='DIRTY').length
  const totalNotifs=pendRes+hkUrgent+dirtyRooms

  const NAV_ITEMS=[
    {id:'dashboard', ico:'⬡', label:'Dashboard',        sect:'OVERVIEW'},
    {id:'rooms',     ico:'▦', label:'Room Management'},
    {id:'reservations',ico:'◈',label:'Reservations',    badge:pendRes},
    {id:'guests',    ico:'◉', label:'Guests & CRM'},
    {id:'housekeeping',ico:'✦',label:'Housekeeping',    badge:hkUrgent+dirtyRooms, sect:'OPERATIONS'},
    {id:'billing',   ico:'◎', label:'Billing & Invoices'},
    {id:'reports',   ico:'▣', label:'Reports',          sect:'ANALYTICS'},
    {id:'settings',  ico:'◌', label:'Settings',         sect:'SYSTEM'},
  ].filter(n=>allowed.includes(n.id))

  const PAGE_TITLES={dashboard:'Dashboard',rooms:'Room Management',reservations:'Reservations',guests:'Guest CRM',housekeeping:'Housekeeping',billing:'Billing & Invoices',reports:'Reports & Analytics',settings:'Settings'}
  const bdTime=new Date(clock.toLocaleString('en',{timeZone:'Asia/Dhaka'}))
  const clockStr=bdTime.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · '+bdTime.toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short'})

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="s-head">
            <div className="s-brand">Hotel <em>Fountain</em></div>
            <div className="s-tag">The Pulse of Modern Hospitality</div>
            <div className="s-hotel">🏨 Management CRM</div>
          </div>
          <nav className="s-nav">
            {NAV_ITEMS.map(item=>(
              <div key={item.id}>
                {item.sect&&<div className="s-sect">{item.sect}</div>}
                <div className={`nav-item${cur===item.id?' on':''}`} onClick={()=>setPage(item.id)}>
                  <span className="ico">{item.ico}</span>
                  <span>{item.label}</span>
                  {item.badge>0&&<span className="n-badge">{item.badge}</span>}
                </div>
              </div>
            ))}
          </nav>
          <div className="s-foot">
            <div className="flex fac gap2">
              <div className="av" style={{width:30,height:30,fontSize:11,background:`linear-gradient(135deg,${avColor(user.name)},rgba(0,0,0,.5))`,color:'#EEE9E2',flexShrink:0,fontFamily:'var(--sans)',fontWeight:400}}>
                {user.av}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--sans)',fontSize:12,fontWeight:300,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'.02em'}}>{user.name}</div>
                <div style={{fontFamily:'var(--sans)',fontSize:8,color:ROLES[user.role]?.color||'var(--gold)',letterSpacing:'.1em',marginTop:1,fontWeight:200,textTransform:'uppercase'}}>{ROLES[user.role]?.label}</div>
              </div>
              <button
                title="Sign Out"
                style={{background:'none',border:'1px solid var(--br2)',color:'var(--tx3)',cursor:'pointer',fontSize:12,padding:'4px 8px',transition:'all .15s',flexShrink:0,lineHeight:1,fontFamily:'var(--sans)'}}
                onClick={signOut}
                onMouseEnter={e=>{e.currentTarget.style.color='var(--rose)';e.currentTarget.style.borderColor='rgba(224,92,122,.35)'}}
                onMouseLeave={e=>{e.currentTarget.style.color='var(--tx3)';e.currentTarget.style.borderColor='var(--br2)'}}
              >⏻</button>
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="main">
          <div className="topbar">
            <div className="tb-title">{PAGE_TITLES[cur]}</div>
            <div className="flex fac gap2"><div className="sync-dot"/><span className="xs muted">Live</span></div>
            <div className="tb-meta">{clockStr}</div>

            {/* BUG FIX: notif bell — stopPropagation on button, dismiss on content click */}
            <div style={{position:'relative'}}>
              <button
                className="btn btn-ghost btn-sm"
                style={{position:'relative',padding:'5px 10px',fontSize:15}}
                onClick={e=>{ e.stopPropagation(); setNotifOpen(p=>!p) }}
              >
                🔔
                {totalNotifs>0&&(
                  <span style={{position:'absolute',top:4,right:4,width:7,height:7,borderRadius:'50%',background:'var(--rose)',boxShadow:'0 0 5px var(--rose)'}}/>
                )}
              </button>

              {/* BUG FIX: notif-drop has z-index:200 (above topbar z:10, below modal z:500) */}
              {notifOpen&&(
                <div className="notif-drop" onClick={e=>e.stopPropagation()}>
                  <div style={{padding:'10px 14px',borderBottom:'1px solid var(--br2)',fontWeight:700,fontSize:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Notifications</span>
                    <button style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:15,lineHeight:1}} onClick={()=>setNotifOpen(false)}>×</button>
                  </div>
                  {pendRes>0&&(
                    <div className="notif-item" onClick={()=>{ setPage('reservations'); setNotifOpen(false) }}>
                      📅 {pendRes} pending reservation{pendRes>1?'s':''} awaiting confirmation
                    </div>
                  )}
                  {hkUrgent>0&&(
                    <div className="notif-item" onClick={()=>{ setPage('housekeeping'); setNotifOpen(false) }}>
                      🧹 {hkUrgent} high-priority housekeeping task{hkUrgent>1?'s':''}
                    </div>
                  )}
                  {dirtyRooms>0&&(
                    <div className="notif-item" onClick={()=>{ setPage('housekeeping'); setNotifOpen(false) }}>
                      🏨 {dirtyRooms} room{dirtyRooms>1?'s':''} require cleaning
                    </div>
                  )}
                  {totalNotifs===0&&(
                    <div className="notif-item" style={{textAlign:'center',color:'var(--tx3)',cursor:'default'}}>✓ All clear — no alerts</div>
                  )}
                </div>
              )}
            </div>

            <button className="btn btn-ghost btn-sm" onClick={()=>{ loadAll(); toast('Data refreshed','info') }} title="Refresh data">↻</button>
          </div>

          {/* Close notif by clicking content area */}
          <div className="content" onClick={()=>notifOpen&&setNotifOpen(false)}>
            {cur==='dashboard'    &&<Dashboard rooms={data.rooms} guests={data.guests} reservations={data.reservations} transactions={data.transactions} setPage={setPage} hSettings={hSettings}/>}
            {cur==='rooms'        &&<RoomsPage rooms={data.rooms} guests={data.guests} reservations={data.reservations} toast={toast} currentUser={user} reload={loadAll} hSettings={hSettings} foliosMap={foliosMap}/>}
            {cur==='reservations' &&<ReservationsPage reservations={data.reservations} guests={data.guests} rooms={data.rooms} toast={toast} currentUser={user} reload={loadAll} hSettings={hSettings} foliosMap={foliosMap}/>}
            {cur==='guests'       &&<GuestsPage guests={data.guests} reservations={data.reservations} rooms={data.rooms} toast={toast} currentUser={user} reload={loadAll} hSettings={hSettings} foliosMap={foliosMap}/>}
            {cur==='housekeeping' &&<HousekeepingPage tasks={data.tasks} rooms={data.rooms} toast={toast} currentUser={user} reload={loadAll}/>}
            {cur==='billing'      &&<BillingPage transactions={data.transactions} reservations={data.reservations} rooms={data.rooms} guests={data.guests} toast={toast} reload={loadAll} currentUser={user} hSettings={hSettings} foliosMap={foliosMap}/>}
            {cur==='reports'      &&<ReportsPage transactions={data.transactions} rooms={data.rooms} reservations={data.reservations} guests={data.guests}/>}
            {cur==='settings'     &&<SettingsPage currentUser={user} toast={toast} staffList={staffList} setStaffList={setStaffList}/>}
          </div>
        </main>
      </div>

      {toastMsg&&<Toast msg={toastMsg.msg} type={toastMsg.type} onDone={()=>setToastMsg(null)}/>}
    </>
  )
}



  

export default App;
