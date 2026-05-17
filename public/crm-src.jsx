const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ═══════════════════════════════════════════════════════════
   LUMEA — HOTEL FOUNTAIN CRM  v3.0
   All issues fixed — Production Ready
═══════════════════════════════════════════════════════════ */

const SB_URL = 'https://mynwfkgksqqwlqowlscj.supabase.co'
const SB_KEY = (window.__env&&window.__env.SB_KEY)||'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh'
const _CFG     = window.CRM_CONFIG || {}
const TENANT   = _CFG.tenantId     || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const _HNAME   = _CFG.hotelName    || 'Hotel Fountain BD'
const _HSHORT  = _CFG.hotelShort   || 'Fountain'
const _HADDR   = _CFG.address      || 'House 05, Road 02, Nikunja 02 · Dhaka 1229, Bangladesh'
const _HLOC    = _CFG.location     || 'Nikunja 2 · Airport Corridor · Dhaka'
const _HPHONE  = _CFG.phone        || '+880 1322-840799'
const _HWAPP   = _CFG.whatsapp     || '+8801322840799'
const _HEMAIL  = _CFG.email        || 'hotellfountainbd@gmail.com'
const _HSITE   = _CFG.website      || 'hotelfountainbd.vercel.app'
const _TAGLINE = _CFG.tagline      || 'The Gilded Threshold · Luxury In Comfort'
const _CURR    = _CFG.currency     || '৳'
const _CCITY   = _CFG.city         || 'Dhaka, Bangladesh'
const _VRATE   = _CFG.vatPct       !== undefined ? _CFG.vatPct : 15
const _SRATE   = _CFG.svcPct       !== undefined ? _CFG.svcPct : 5

const BDT = n => _CURR + Number(n||0).toLocaleString('en-BD')
const fmtDate = d => d ? String(d).slice(0,10) : '—'
const _dhakaParts = (d=new Date()) => {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d)
  const g = k => p.find(x=>x.type===k)?.value || '00'
  return { y:g('year'), m:g('month'), d:g('day'), H:g('hour'), M:g('minute'), S:g('second') }
}
const todayStr = () => { const p=_dhakaParts(); return `${p.y}-${p.m}-${p.d}` }
const todayDhaka = () => { const p=_dhakaParts(); return new Date(`${p.y}-${p.m}-${p.d}T${p.H}:${p.M}:${p.S}`) }
const nightsCount = (ci,co) => { if(!ci||!co) return 0; return Math.max(0, Math.round((new Date(co)-new Date(ci))/86400000)) }
const AVC = ['#C8A96E','#2EC4B6','#E05C7A','#58A6FF','#3FB950','#9B72CF','#F0A500']
const avColor = n => AVC[n ? n.charCodeAt(0)%AVC.length : 0]
const initials = n => n ? n.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const H  = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json', Prefer:'return=representation' }
const H2 = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json' }
const db = async (t,q='') => { const r=await fetch(`${SB_URL}/rest/v1/${t}${q}`,{headers:H}); if(!r.ok) throw new Error(await r.text()); return r.json() }
const dbAll = async (t,q='',pageSize=1000) => {
  const out=[]; let from=0
  while(true){
    const to=from+pageSize-1
    const r=await fetch(`${SB_URL}/rest/v1/${t}${q}`,{headers:{...H,Range:`${from}-${to}`,'Range-Unit':'items'}})
    if(!r.ok) throw new Error(await r.text())
    const rows=await r.json()
    out.push(...rows)
    if(rows.length<pageSize) break
    from+=pageSize
    if(from>50000) break // safety cap
  }
  return out
}
const dbPost = async (t,b) => { const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:'POST',headers:H,body:JSON.stringify(b)}); if(!r.ok) throw new Error(await r.text()); return r.json() }
const dbPatch = async (t,id,b) => { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:H2,body:JSON.stringify(b)}); if(!r.ok){ const txt=await r.text(); throw new Error(`PATCH ${t} ${r.status}: ${txt}`) } }
const dbDelete = async (t,id) => { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'DELETE',headers:H2}); if(!r.ok) throw new Error(await r.text()) }

const ROLES = {
  owner:        {label:'Founder / Owner',    color:'#C8A96E', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports','leads','settings']},
  manager:      {label:'General Manager',    color:'#2EC4B6', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports','leads']},
  receptionist: {label:'Receptionist',       color:'#58A6FF', pages:['dashboard','rooms','reservations','guests','billing']},
  housekeeping: {label:'Housekeeping Staff', color:'#F0A500', pages:['dashboard','rooms','housekeeping','billing']},
  accountant:   {label:'Accountant',         color:'#3FB950', pages:['dashboard','billing','reports']},
}

const INIT_STAFF = [
  {id:1, name:'Shanwaz Ahmed',    email:'owner@hotelfountain.com',       pwh:'e37838828f7335c08e5249022d9537a4d8c1f350be1b84af32f8296647bd28b9', role:'owner',        av:'SA', device:'Admin / Founder'},
  {id:2, name:'Front Desk (FO)',  email:'fo.hotelfountain799@gmail.com', pwh:'e2244795ea58b8fc1d2f00fd55bf3a3591a018984b622d62e89ce188b92b89ad', role:'receptionist', av:'FD', device:'Front Desk Terminal'},
  {id:3, name:'HK Staff',         email:'hotelfountain.hk@gmail.com',   pwh:'5e9b65e235bfbd8c61a769aabe08b27e4f9db7055f971392c686b73a6f355357', role:'housekeeping', av:'HK', device:'Housekeeping Terminal'},
  {id:4, name:'Manager',          email:'manager@hotelfountain.com',    pwh:'311a5b001353c76385d5b47516f05102975b44a2f617d3b564862b9612e608d9', role:'manager',      av:'MG', device:'Manager Office'},
  {id:5, name:'Accounts',         email:'accounts@hotelfountain.com',   pwh:'e147ec11b5c183b8958e7bffe6ce93f588a5b63a4b4306ed7468be462c454022', role:'accountant',   av:'AC', device:'Accounts Terminal'},
]
const _hashPw=async p=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

/* ═══════════════════════ CSS ═══════════════════════════════ */

const CSS = `
/* ── RESET & ROOT TOKENS ──────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:   #1C1510;
  --s1:   #1C1510;
  --s2:   #262626;
  --s3:   #1E1A16;
  --s4:   #2A2420;
  --gold: #C8A96E;
  --gold2:#A07840;
  --gold-light:#C8A96E;
  --gdim: rgba(200,169,110,.07);
  --rose: #F87171;
  --grn:  #4ADE80;
  --teal: #2DD4BF;
  --sky:  #60A5FA;
  --amb:  #FCD34D;
  --pur:  #A78BFA;
  --tx:  #EEE8DC;
  --tx2: #C8B89A;
  --tx3: #7A6A5A;
  --tx-inv:#EEE8DC;
  --tx-inv2:rgba(238,228,210,.55);
  --br:  rgba(200,169,110,.22);
  --br2: rgba(200,169,110,.10);
  --br-side:rgba(200,169,110,.18);
  --serif:'Libre Baskerville',Georgia,serif;
  --sans: 'DM Sans',system-ui,sans-serif;
  --mono: 'IBM Plex Mono',monospace;
  --r: 0px;
}

html,body,#root{
  height:100%;background:var(--bg);color:var(--tx);
  font-family:var(--sans);font-weight:400;
  -webkit-font-smoothing:antialiased;overflow:hidden;color-scheme:dark;
}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:rgba(0,0,0,.3)}
::-webkit-scrollbar-thumb{background:rgba(200,169,110,.35)}
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
.nav-item{display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;font-family:var(--sans);font-size:12.5px;font-weight:400;color:var(--tx-inv2);border-left:3px solid transparent;border-right:3px solid transparent;transition:all .2s cubic-bezier(0.4,0,0.2,1);user-select:none;letter-spacing:.02em}
.nav-item:hover{background:rgba(200,169,110,.1);color:rgba(238,228,210,.9);border-left-color:rgba(200,169,110,.4);transform:translateX(2px)}
.nav-item.on{background:rgba(200,169,110,.12);color:var(--gold-light);border-left-color:var(--gold-light);font-weight:500}
.nav-item .ico{font-size:13px;width:16px;text-align:center;flex-shrink:0;opacity:.7}
.nav-item.on .ico{opacity:1}
.n-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:7.5px;padding:2px 7px;font-weight:600;letter-spacing:.04em}
.s-foot{padding:14px 16px;border-top:1px solid rgba(200,169,110,.12);flex-shrink:0}

/* ── TOPBAR ── */
.topbar{height:54px;flex-shrink:0;background:var(--s2);border-bottom:1px solid rgba(200,169,110,.3);display:flex;align-items:center;padding:0 24px;gap:14px;position:relative;z-index:10}
.tb-title{font-family:var(--serif);font-size:18px;font-weight:700;color:var(--tx);flex:1;letter-spacing:.01em}
.tb-title em{font-style:italic;color:var(--gold);font-weight:400}
.tb-meta{font-family:var(--mono);font-size:9px;color:var(--tx3);letter-spacing:.04em;white-space:nowrap}
.content{flex:1;overflow-y:auto;padding:20px 24px;background:var(--bg)}

/* ── CARDS ── */
.card{background:var(--s2);border:1px solid var(--br);border-top:3px solid var(--gold-light);transition:transform .2s,box-shadow .2s;overflow:hidden;margin-bottom:16px}
.rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:10px;margin-bottom:16px}
.room-card{background:rgba(38,38,38,.55);border:1px solid rgba(200,169,110,.15);padding:14px 12px 12px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;backdrop-filter:blur(6px)}
.room-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;transition:opacity .2s}
.room-card.AVAILABLE{background:rgba(31,111,84,.2);border-color:rgba(74,222,128,.22);box-shadow:inset 0 0 24px rgba(74,222,128,.06)}
.room-card.AVAILABLE::before{background:linear-gradient(90deg,#4ADE80,#2DD4BF)}
.room-card.OCCUPIED{background:rgba(30,58,138,.28);border-color:rgba(96,165,250,.28);box-shadow:inset 0 0 24px rgba(200,169,110,.07)}
.room-card.OCCUPIED::before{background:linear-gradient(90deg,#60A5FA,#C8A96E)}
.room-card.DIRTY{background:rgba(120,53,15,.25);border-color:rgba(252,211,77,.25);box-shadow:inset 0 0 20px rgba(252,211,77,.06)}
.room-card.DIRTY::before{background:linear-gradient(90deg,#FCD34D,#F97316)}
.room-card.OUT_OF_ORDER{background:rgba(127,29,29,.25);border-color:rgba(248,113,113,.22);box-shadow:inset 0 0 20px rgba(248,113,113,.06)}
.room-card.OUT_OF_ORDER::before{background:linear-gradient(90deg,#F87171,#7F1D1D)}
.room-card.RESERVED{background:rgba(88,28,135,.22);border-color:rgba(167,139,250,.22);box-shadow:inset 0 0 20px rgba(167,139,250,.06)}
.room-card.RESERVED::before{background:linear-gradient(90deg,#A78BFA,#7C3AED)}
.room-card.AVAILABLE::before
.room-card.OCCUPIED::before{background:var(--sky)}
.room-card.DIRTY::before{background:var(--amb)}
.room-card.OUT_OF_ORDER::before{background:var(--rose)}
.room-card.RESERVED::before{background:var(--pur)}
.room-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.55),0 0 0 1px rgba(200,169,110,.35)}
.room-no{font-family:var(--serif);font-size:24px;font-weight:700;color:var(--gold-light);margin-bottom:6px;line-height:1}
.room-cat{font-family:var(--sans);font-size:10px;color:var(--tx3);margin-bottom:2px;letter-spacing:.02em}
.room-price{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--tx2);margin-top:6px;border-top:1px solid var(--br2);padding-top:6px}
.card:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,0,0,.35)}.card-hd{padding:14px 18px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:48px;background:var(--s4)}
.card-title{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--tx);letter-spacing:.01em}
.card-title em{font-style:italic;color:var(--gold);font-weight:400}
.card-body{padding:16px 18px}

/* ── STATS ── */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.stat{background:var(--s2);border:1px solid var(--br);border-top:3px solid var(--ac,var(--gold-light));padding:16px 18px;position:relative;overflow:hidden;transition:box-shadow .2s,transform .2s;cursor:default}
.stat:hover{box-shadow:0 4px 24px rgba(200,169,110,.15),0 2px 8px rgba(0,0,0,.4);transform:translateY(-2px)}
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
.bg  {background:rgba(74,222,128,.12);color:var(--grn); border:1px solid rgba(74,222,128,.35)}
.bb  {background:rgba(96,165,250,.12);color:var(--sky); border:1px solid rgba(96,165,250,.35)}
.ba  {background:rgba(252,211,77,.1); color:var(--amb); border:1px solid rgba(252,211,77,.35)}
.br_ {background:rgba(248,113,113,.1);color:var(--rose);border:1px solid rgba(248,113,113,.35)}
.bgold{background:rgba(200,169,110,.12);color:var(--gold);border:1px solid rgba(200,169,110,.35)}
.bteal{background:rgba(45,212,191,.1); color:var(--teal);border:1px solid rgba(45,212,191,.35)}

/* ── TABLES ── */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:var(--sans);font-size:8px;letter-spacing:.16em;color:var(--tx3);text-transform:uppercase;padding:10px 12px;text-align:left;border-bottom:1px solid rgba(200,169,110,.35);white-space:nowrap;font-weight:600;background:var(--s4)}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--br2);font-family:var(--sans);font-size:12.5px;font-weight:400;color:var(--tx);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:var(--s3)}
.tbl-wrap{overflow-x:auto}

/* ── FORMS ── */
.finput{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(200,169,110,.25);color:var(--tx);font-family:var(--sans);font-size:13px;font-weight:400;padding:9px 12px;outline:none;transition:border-color .15s,box-shadow .15s}
.finput:focus{border-color:var(--gold-light);box-shadow:0 0 0 3px rgba(200,169,110,.12)}
.finput::placeholder{color:var(--tx3);font-weight:300}
.finput:disabled{background:rgba(0,0,0,.4);color:var(--tx3);cursor:not-allowed}
.fselect{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(200,169,110,.25);color-scheme:dark;color:var(--tx);font-family:var(--sans);font-size:13px;font-weight:400;padding:9px 12px;outline:none;cursor:pointer;transition:border-color .15s;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23C8A96E' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
.fselect:focus{border-color:var(--gold-light)}.fselect option{background:#1C1510;color:#EEE8DC}
.flbl{display:block;font-family:var(--sans);font-size:9px;letter-spacing:.14em;color:var(--tx3);text-transform:uppercase;font-weight:600;margin-bottom:5px}
.fg{flex:1;min-width:0;margin-bottom:12px}
.frow{display:flex;gap:12px;flex-wrap:wrap}
.frow>.fg{flex:1;min-width:140px}

/* ── MODALS ── */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(2px)}
.modal{background:var(--s2);border:1px solid var(--br);border-top:4px solid var(--gold-light);width:100%;max-width:540px;max-height:92vh;overflow-y:auto;background:#1C1510;box-shadow:0 24px 80px rgba(28,21,16,.25);animation:mIn .2s ease}
.modal-w{max-width:820px}
@keyframes mIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(200,169,110,.18);background:rgba(200,169,110,.07);flex-shrink:0}
.modal-title{font-family:var(--serif);font-size:18px;font-weight:700;color:var(--tx)}
.modal-x{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:20px;line-height:1;padding:2px 6px;transition:color .15s}
.modal-x:hover{color:var(--rose)}
.modal-body{padding:20px}
.modal-ft{padding:14px 20px;border-top:1px solid rgba(200,169,110,.18);display:flex;justify-content:flex-end;gap:8px;background:rgba(200,169,110,.05)}

/* ── TABS ── */
.tabs{display:flex;gap:0;border-bottom:2px solid var(--s1);margin-bottom:16px;overflow-x:auto}
.tab{padding:9px 18px;font-family:var(--sans);font-size:11px;font-weight:500;color:var(--tx3);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:transparent;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;white-space:nowrap}
.tab:hover{color:var(--tx);background:var(--s3)}
.tab.on,.tab.active{color:var(--gold);font-weight:700;border-bottom-color:var(--gold);background:var(--s4)}

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

/* ── LOGIN PAGE — GILDED THRESHOLD v2 ── */
@keyframes goldShimmer{0%,100%{opacity:1}50%{opacity:.7}}
@keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
@keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.login-bg{min-height:100vh;display:flex;flex-direction:row;overflow:hidden;background:#100E0B}
/* ── LEFT PANEL ── */
.lp-left{width:42%;flex-shrink:0;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 56px;overflow:hidden}
.lp-left::before{content:'';position:absolute;inset:0;background-image:url("data:image/jpeg;base64,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");background-size:cover;background-position:center 30%;pointer-events:none}
.lp-left::after{content:'';position:absolute;inset:0;background:linear-gradient(160deg,rgba(6,4,2,.92) 0%,rgba(10,7,4,.78) 30%,rgba(8,5,2,.74) 55%,rgba(10,7,3,.82) 78%,rgba(6,4,1,.94) 100%);pointer-events:none}
/* grain texture overlay for luxury feel */
.lp-left-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.028;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");background-size:180px 180px}
/* top / bottom bars */
.lp-bar{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:7px;z-index:3;pointer-events:none}
.lp-bar.top{top:0;padding-top:24px}
.lp-bar.bot{bottom:0;padding-bottom:20px}
.lp-rule{width:calc(100% - 80px);height:1px;background:linear-gradient(90deg,transparent,rgba(197,160,89,.85),transparent)}
.lp-rule.dim{background:linear-gradient(90deg,transparent,rgba(197,160,89,.42),transparent)}
.lp-label{font-family:var(--mono);font-size:9px;letter-spacing:.26em;color:rgba(197,160,89,.9);text-transform:uppercase}
/* LOGO */
.lp-logo-wrap{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-bottom:8px}
.lp-logo-img{width:230px;height:auto;filter:drop-shadow(0 0 40px rgba(197,160,89,.55)) drop-shadow(0 0 16px rgba(197,160,89,.3)) brightness(1.18);display:block;mix-blend-mode:screen}
.lp-brand-sub{font-family:var(--mono);font-size:8.5px;letter-spacing:.28em;color:rgba(197,160,89,.75);text-transform:uppercase;margin-top:14px;text-align:center}
/* gold accent line below logo */
.lp-logo-line{width:48px;height:1px;background:linear-gradient(90deg,transparent,rgba(197,160,89,.7),transparent);margin:16px auto 0}
/* FEATURE LIST */
.lp-features{position:relative;z-index:2;width:100%;margin-top:32px;display:flex;flex-direction:column;gap:0}
.lp-feat{padding:15px 0 15px 20px;border-bottom:1px solid rgba(197,160,89,.08);display:flex;align-items:flex-start;gap:0;position:relative}
.lp-feat:first-child{border-top:1px solid rgba(197,160,89,.08)}
.lp-feat::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:28px;background:linear-gradient(180deg,rgba(197,160,89,.6),rgba(197,160,89,.2));border-radius:2px}
.lp-feat-bullet{display:none}
.lp-feat-text{padding-left:0}
.lp-feat-title{font-family:var(--sans);font-size:13px;font-weight:600;color:#FFFFFF;letter-spacing:.01em;margin-bottom:3px;text-shadow:0 1px 12px rgba(0,0,0,.9)}
.lp-feat-desc{font-family:var(--mono);font-size:10px;color:rgba(210,188,148,.82);letter-spacing:.04em}
/* ── RIGHT PANEL ── */
.lp-right{flex:1;background:#141210;display:flex;align-items:center;justify-content:center;position:relative}
.lp-right::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle,rgba(197,160,89,.07) 1px,transparent 1px);background-size:36px 36px;pointer-events:none;opacity:.8}
.lp-right::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 65% 70% at 50% 50%,rgba(197,160,89,.03) 0%,transparent 70%);pointer-events:none}
.lp-right-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:22px 44px;pointer-events:none;border-bottom:1px solid rgba(197,160,89,.05)}
.lp-right-meta{font-family:var(--mono);font-size:8.5px;letter-spacing:.2em;color:rgba(197,160,89,.45);text-transform:uppercase;display:flex;align-items:center;gap:8px}
.lp-right-meta::before{content:'';width:20px;height:1px;background:rgba(197,160,89,.3)}
.lp-right-ver{font-family:var(--mono);font-size:8.5px;color:rgba(197,160,89,.4);letter-spacing:.12em}
.lp-right-bot{position:absolute;bottom:20px;left:0;right:0;text-align:center;font-family:var(--mono);font-size:8px;color:rgba(197,160,89,.3);letter-spacing:.22em;text-transform:uppercase;pointer-events:none}
/* divider */
.lp-vdivide{position:absolute;left:0;top:60px;bottom:60px;width:1px;background:linear-gradient(to bottom,transparent,rgba(197,160,89,.25) 15%,rgba(197,160,89,.4) 50%,rgba(197,160,89,.25) 85%,transparent)}
/* ── CARD ── */
.login-card{background:linear-gradient(160deg,#1F1C18 0%,#1A1714 100%);border-radius:2px;border-top:4px solid #C5A059;border:1px solid rgba(197,160,89,.1);border-top:4px solid #C5A059;box-shadow:0 40px 100px rgba(0,0,0,.75),0 8px 24px rgba(0,0,0,.4),inset 0 1px 0 rgba(197,160,89,.06);padding:44px 48px 40px;width:100%;max-width:480px;position:relative;z-index:1;animation:cardIn .45s cubic-bezier(.4,0,.2,1) both}
/* card corner accents */
.login-card::before{content:'';position:absolute;top:-1px;left:-1px;width:24px;height:24px;border-top:2px solid rgba(197,160,89,.6);border-left:2px solid rgba(197,160,89,.6);border-top-left-radius:2px}
.login-card::after{content:'';position:absolute;bottom:-1px;right:-1px;width:24px;height:24px;border-bottom:2px solid rgba(197,160,89,.25);border-right:2px solid rgba(197,160,89,.25)}
.lc-inner-top{height:1px;background:linear-gradient(90deg,transparent,rgba(197,160,89,.2),transparent);margin-bottom:28px}
.lc-signin-label{font-family:var(--mono);font-size:9px;letter-spacing:.34em;color:rgba(197,160,89,.75);text-transform:uppercase;text-align:center;margin-bottom:5px}
.lc-ornament{text-align:center;color:rgba(197,160,89,.3);font-size:9px;margin-bottom:24px;letter-spacing:.2em}
/* ROLE GRID */
.role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:28px}
.rpill{padding:16px 8px 13px;border:1px solid rgba(197,160,89,.14);background:rgba(26,22,18,.6);cursor:pointer;transition:all .22s cubic-bezier(.4,0,.2,1);text-align:center;color:rgba(200,185,160,.6);font-family:var(--sans);border-radius:2px;position:relative;overflow:hidden}
.rpill::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#C5A059,transparent);transform:scaleX(0);transition:transform .22s cubic-bezier(.4,0,.2,1);opacity:0}
.rpill:hover{border-color:rgba(197,160,89,.35);background:rgba(30,26,20,.8);color:rgba(220,200,165,.85)}
.rpill.sel{border-color:rgba(197,160,89,.5);background:rgba(20,17,13,.9);color:#F2E8D5;box-shadow:0 0 24px rgba(197,160,89,.08),inset 0 0 20px rgba(197,160,89,.03)}
.rpill.sel::before{transform:scaleX(1);opacity:1}
.rpill .ri{font-size:18px;margin-bottom:7px;display:block;line-height:1}
.rpill .rl{font-size:8.5px;letter-spacing:.1em;font-weight:600;text-transform:uppercase;color:inherit;line-height:1.3}
.rpill.sel .rl{color:rgba(197,160,89,.85)}
/* EMAIL DISPLAY */
.lc-email-display{margin-bottom:22px}
.lc-email-lbl{font-family:var(--sans);font-size:8px;font-weight:700;letter-spacing:.18em;color:rgba(197,160,89,.55);text-transform:uppercase;margin-bottom:8px}
.lc-email-val{font-family:var(--sans);font-size:15px;color:#EAE0CC;font-weight:400;padding-bottom:9px;border-bottom:1px solid rgba(197,160,89,.45);display:flex;justify-content:space-between;align-items:baseline}
.lc-change{font-family:var(--serif);font-size:11px;font-style:italic;color:rgba(197,160,89,.6);cursor:pointer;transition:color .15s}
.lc-change:hover{color:rgba(197,160,89,.9)}
/* override finput inside card */
.login-card .finput{background:rgba(10,8,5,.4)!important;border:1px solid rgba(197,160,89,.15)!important;border-radius:2px!important;color:#EAE0CC!important;font-family:var(--sans)!important;font-size:14px!important;padding:11px 14px!important}
.login-card .finput:focus{border-color:rgba(197,160,89,.5)!important;outline:none!important;box-shadow:0 0 0 3px rgba(197,160,89,.06)!important}
.login-card .finput::placeholder{color:rgba(160,140,110,.4)!important}
/* button */
.login-card .btn-gold{justify-content:center;padding:15px;font-size:9.5px;letter-spacing:.28em;margin-top:8px;border-radius:2px;background:linear-gradient(135deg,#C5A059 0%,#D4AF6A 50%,#C5A059 100%);background-size:200% 100%;transition:background-position .4s,box-shadow .2s;box-shadow:0 4px 20px rgba(197,160,89,.25)}
.login-card .btn-gold:hover{background-position:100% 0;box-shadow:0 6px 28px rgba(197,160,89,.38)}
/* error */
.lc-error{background:rgba(200,80,100,.05);border:1px solid rgba(200,80,100,.15);border-left:3px solid rgba(200,80,100,.4);padding:10px 14px;font-family:var(--sans);font-size:11px;color:rgba(220,120,130,.9);margin-bottom:14px;border-radius:0 2px 2px 0;letter-spacing:.02em}
/* label styling inside card */
.login-card .flbl{font-family:var(--sans);font-size:8px;font-weight:700;letter-spacing:.18em;color:rgba(197,160,89,.55);text-transform:uppercase;margin-bottom:8px;display:block}

/* ── GUEST SEARCH ── */
.gsearch-wrap{position:relative}
.gsearch-list{position:absolute;top:calc(100% + 2px);left:0;right:0;background:#1C1510;border:1px solid rgba(200,169,110,.25);border-top:2px solid var(--gold-light);z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.gsearch-item{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;font-size:12.5px;transition:background .12s;border-bottom:1px solid var(--br2)}
.gsearch-item:last-child{border-bottom:none}
.gsearch-item:hover{background:var(--s3)}

/* ── NOTIFICATION PANEL ── */
.notif-panel{position:absolute;top:58px;right:12px;width:320px;background:#1C1510;border:1px solid rgba(200,169,110,.25);border-top:3px solid var(--gold-light);box-shadow:0 16px 48px rgba(0,0,0,.5);z-index:200;animation:mIn .2s ease}

`


/* ═══════════════════════ MODULE-SCOPE REVENUE HELPERS ══════════════════════
   Shared by DashboardPage (todayRev) and BillingPage (_bizDayTotal).
   Any change here automatically applies to both surfaces.
   ─────────────────────────────────────────────────────────────────────────── */
// Payment-positive: only actual cash inflows count as revenue/paid.
// Charges (Stay Extension, Room Service, Food & Bev, etc.) are excluded.
// This single definition drives BIZ DAY, Dashboard revenue, and all report totals.
const _isRealPayment = t => /payment|settlement|advance|deposit|bkash|bank\s*transfer/i.test(t.type||'') && !/balance carried forward/i.test(t.type||'')
const _bizDayTotalFn = list => {
  const byKey = {}
  list.forEach(t => {
    if(/balance carried forward/i.test(t.type||'')) return
    const key = `${t.room_number||''}|${t.guest_name||''}`
    if(!byKey[key]) byKey[key] = {pay:0, fsPos:0, hasReal:false}
    const amt = +t.amount||0
    if(_isRealPayment(t)) { byKey[key].pay += amt; byKey[key].hasReal = true }
    else if(/final\s*settlement/i.test(t.type||'') && amt > 0) { byKey[key].fsPos += amt }
  })
  return Object.values(byKey).reduce((a,g) => a + (g.hasReal ? g.pay : g.fsPos), 0)
}

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
  const bcRef=useRef(null)
  useEffect(()=>{
    if(typeof gsap==='undefined'||!bcRef.current) return
    const bars=bcRef.current.querySelectorAll('.bar-fill')
    gsap.from(bars,{scaleY:0,transformOrigin:'bottom center',stagger:.04,duration:.65,ease:'power3.out'})
  },[data.length])
  return (
    <div className="bar-chart" ref={bcRef}>
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
  useEffect(()=>{
    if(typeof gsap==='undefined') return
    gsap.set('.lp-left',{opacity:0,x:-50})
    gsap.set('.lp-right',{opacity:0,x:50})
    gsap.set('.login-card',{opacity:0,y:30,scale:.97})
    gsap.to('.lp-left',{opacity:1,x:0,duration:.9,ease:'power3.out'})
    gsap.to('.lp-right',{opacity:1,x:0,duration:.9,ease:'power3.out'})
    gsap.to('.login-card',{opacity:1,y:0,scale:1,duration:.7,ease:'power3.out',delay:.35})
    gsap.from('.lp-feat',{x:-22,opacity:0,stagger:.1,duration:.5,ease:'power2.out',delay:.55})
  },[])
  const [sel,setSel]=useState(null)
  const [email,setEmail]=useState('')
  const [pw,setPw]=useState('')
  const [showPw,setShowPw]=useState(false)
  const [err,setErr]=useState('')
  const [busy,setBusy]=useState(false)

  const LOGIN_ROLES = [
    {key:'owner',        ico:'◆', label:'Owner'},
    {key:'receptionist', ico:'◈', label:'Reception'},
    {key:'housekeeping', ico:'◇', label:'Housekeeping'},
  ]

  function pickRole(r) {
    setSel(r)
    const s=staffList.find(x=>x.role===r)
    if(s) setEmail(s.email)
    setPw('') // always clear password — never auto-fill
    setErr('')
  }

  function doLogin() {
    if(!email||!pw) return setErr('Enter your email and password.')
    setBusy(true)
    _hashPw(pw).then(h=>{
      const u=staffList.find(x=>x.email.toLowerCase()===email.trim().toLowerCase()&&x.pwh===h)
      if(u) onLogin({...u})
      else { setErr('Invalid email or password.'); setBusy(false) }
    })
  }

  return (
    <div className="login-bg">
      {/* ── LEFT PANEL ── */}
      <div className="lp-left">
        <div className="lp-left-grain"/>
        {/* top bar */}
        <div className="lp-bar top">
          <div className="lp-rule"/>
          <div className="lp-label">Staff Portal · {_HNAME}</div>
          <div className="lp-rule dim"/>
        </div>

        {/* logo */}
        <div className="lp-logo-wrap">
          <img
            src="data:image/png;base64,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3P6P/OPpq9JfxM+tLe+vmNXNpm2med5/6MDSG486pfPq/vJzTvgXieP3vvLtF24qt6f7RV35sdccLEm8ZDJN51b39fWneXq/RoiiuDZQBTCVZnM2T2eXDvbvn9ssTWejOH9U42Y/k6GlnPIIAF//v284MsvcEaKaQeSGl5924S+LDhXISB0yOgp35adfc3DFVf40tdiSTTS+Nzw6nqpCLj/nxEP7B2IRa+NZyIRYsf0Vszq3Jm2kjcjF+V1xVjs4irQRRVLbPKu39cOt6qtF1aYT25fEcXMKG1/2nn+dFoF+9RNveIIYHGnT7J6Xn3Hx9wBg3bp6vOl/bjw8QdTsi6R2f5ZtPvEdl95TvpZ//8TrnmczO/3Kd17ys+6aEURERA84wH6gqwnuzP0vP2v4jy756GseM37OSW+6/JwTPwx0LqL0YKrX6/PNYpDw970qTz4YCyT1mnGxI/uUq0ESsQeBaIcbwoX+HuYE1Ot1s3btBhkaGncQAPW6+O5qqdfrMjIyoiKi3Y9bPkZ4fxFgbGjIDI+P2+JqvN76nI6MjKoI9LJzTvjdASsHD79388w1EkfH/fr+wybKv83XCI6MdD5O8b34nb8v6vXy3+3tXWj/lDUS1q8/QnstlBTepqy62L09I6N+W+od26Ld+6njPsX2oXy81v5bf4RK1/vSes2jox3raIyNDUXzbTcRMUAgekgpywFfee5Jz++vJU/ZKjOfGz5lfCvLBBMREdE2QQP3AhEREWFsqKg9wOCAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIaB/x/wGVkK+oriO4iAAAAABJRU5ErkJggg=="
            alt={_HNAME}
            className="lp-logo-img"
          />
          <div className="lp-brand-sub">Management CRM · Powered by Lumea</div>
          <div className="lp-logo-line"/>
        </div>

        {/* features */}
        <div className="lp-features">
          {[
            ['Room Matrix',        'Live availability & status grid'],
            ['Guest Ledger',       'Automated billing in BDT'],
            ['Reservation Engine', 'Full booking lifecycle'],
          ].map(([t,d])=>(
            <div key={t} className="lp-feat">
              <div className="lp-feat-bullet"/>
              <div className="lp-feat-text">
                <div className="lp-feat-title">{t}</div>
                <div className="lp-feat-desc">{d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* bottom bar */}
        <div className="lp-bar bot">
          <div className="lp-rule dim"/>
          <div className="lp-label">Lumea · The Pulse of Modern Hospitality</div>
          <div className="lp-rule"/>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="lp-right">
        <div className="lp-vdivide"/>
        <div className="lp-right-top">
          <span className="lp-right-meta">Secure Staff Portal</span>
          <span className="lp-right-ver">v2.4.1</span>
        </div>

        <div className="login-card">
          <form onSubmit={e=>{e.preventDefault();doLogin()}} autoComplete="off">
          <div className="lc-inner-top"/>
          <div className="lc-signin-label">Sign In</div>
          <div className="lc-ornament">◆ · ◆ · ◆</div>

          {/* Role selector */}
          <div className="role-grid">
            {LOGIN_ROLES.map(r=>(
              <div key={r.key} className={`rpill${sel===r.key?' sel':''}`} onClick={()=>pickRole(r.key)}>
                <span className="ri" style={{fontFamily:"var(--mono)",fontSize:"16px",fontWeight:600,letterSpacing:".05em",color:"rgba(197,160,89,.7)"}}>{r.ico}</span>
                <span className="rl">{r.label}</span>
              </div>
            ))}
          </div>

          {/* Email — pre-filled display or input */}
          <div className="lc-email-display">
            <div className="lc-email-lbl">Email</div>
            {sel ? (
              <div className="lc-email-val">
                <span>{staffList.find(s=>s.role===sel)?.email}</span>
                <span className="lc-change" onClick={()=>{setSel(null);setEmail('');setErr('')}}>change</span>
              </div>
            ) : (
              <input className="finput" type="email" value={email}
                onChange={e=>{setEmail(e.target.value);setErr('')}}
                onKeyDown={e=>e.key==='Enter'&&doLogin()}
                placeholder="your@email.com"
                autoComplete="off" data-form-type="other"
                style={{borderBottom:'1.5px solid #C5A059',borderTop:'none',borderLeft:'none',borderRight:'none',borderRadius:0,background:'transparent',paddingLeft:0}}/>
            )}
          </div>

          {/* Password */}
          <div className="fg" style={{marginBottom:8}}>
            <label className="flbl">Password</label>
            <div style={{position:'relative'}}>
              <input className="finput"
                type={showPw?'text':'password'}
                value={pw}
                onChange={e=>{setPw(e.target.value);setErr('')}}
                onKeyDown={e=>e.key==='Enter'&&doLogin()}
                placeholder="Enter your password"
                autoComplete="new-password"
                data-form-type="other"
                style={{paddingRight:40}}/>
              <span
                style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',cursor:'pointer',fontSize:13,color:'var(--tx3)',userSelect:'none'}}
                onClick={()=>setShowPw(p=>!p)}>
                {showPw?'🙈':'👁'}
              </span>
            </div>
          </div>

          {err&&<div className="lc-error">{err}</div>}

          <button
            className="btn btn-gold w100 login-card"
            style={{justifyContent:'center',padding:'14px',fontSize:10,letterSpacing:'.22em',marginTop:10,borderRadius:3,background:'#2D2A26',color:'#F9F7F2',border:'none'}}
            disabled={busy}
            onClick={doLogin}>
            {busy
              ?<><span className="spinner" style={{width:12,height:12,border:'1.5px solid rgba(249,247,242,.2)',borderTopColor:'#F9F7F2'}}/>{' '}Signing in…</>
              :'SIGN IN →'
            }
          </button>

          <div style={{textAlign:'center',marginTop:28,fontFamily:'var(--mono)',fontSize:9,color:'rgba(150,135,112,.55)',letterSpacing:'.14em',lineHeight:1.7}}>
            Access is role-restricted.<br/>Contact your administrator if you have not received credentials.
          </div>
          </form>
        </div>

        <div className="lp-right-bot">Lumea · {_HNAME} Management CRM</div>
      </div>
    </div>
  )
}

/* ═══════════════════════ DASHBOARD ══════════════════════════ */
function Dashboard({rooms,guests,reservations,transactions,setPage,businessDate}) {
  const [chartActive,setChartActive]=useState(13)
  const today=businessDate||todayStr()
  const occ=rooms.filter(r=>r.status==='OCCUPIED').length
  const occPct=rooms.length?Math.round((occ/rooms.length)*100):0
  const groupedTx = {};
  for (const t of transactions) {
    if (!t.guest_name || !t.fiscal_day) continue;
    const key = `${t.guest_name}__${t.fiscal_day}`;
    if (!groupedTx[key]) {
      groupedTx[key] = { ...t, amount: 0, type: [], due: 0, paid: 0, id: [] };
    }
    groupedTx[key].amount += Number(t.amount) || 0;
    groupedTx[key].due += Number(t.due) || 0;
    groupedTx[key].paid += Number(t.paid) || 0;
    if (t.type && !groupedTx[key].type.includes(t.type)) groupedTx[key].type.push(t.type);
    if (t.id && !groupedTx[key].id.includes(t.id)) groupedTx[key].id.push(t.id);
  }
  const mergedTransactions = Object.values(groupedTx).map(t => ({
    ...t,
    type: t.type.join(', '),
    id: t.id.join(', ')
  }));
  const todayT=mergedTransactions.filter(t=>t.fiscal_day===today)
  // todayRev: mirrors BillingPage's unifiedGroups logic — sums r.paid_amount for all
  // reservations visible in today's ledger (activeTx matches + outstanding balance entries).
  // todayRev: sum of actual cash/bkash TX amounts for today's fiscal_day only.
  // Zero transactions = ৳0. Resets cleanly after Closing Complete.
  const todayRev = _bizDayTotalFn((transactions||[]).filter(t => t.fiscal_day === today))
  const inHouse=reservations.filter(r=>r.status==='CHECKED_IN').length
  const pending=reservations.filter(r=>r.status==='PENDING').length
  const last14=Array.from({length:14},(_,i)=>{
    const d=new Date(todayDhaka()); d.setDate(d.getDate()-(13-i))
    const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return {d:ds.slice(8),v:mergedTransactions.filter(t=>t.fiscal_day===ds).reduce((a,t)=>a+(+t.amount||0),0),ds}
  })
  const checkedIn=reservations.filter(r=>r.status==='CHECKED_IN').slice(0,6)
  useEffect(()=>{
    if(typeof gsap==='undefined') return
    gsap.from('.stats-row .stat',{opacity:0,y:28,stagger:.1,duration:.6,ease:'power3.out',clearProps:'all'})
    gsap.from('.g2 .card',{opacity:0,y:18,stagger:.08,duration:.55,ease:'power3.out',delay:.2,clearProps:'all'})
    setTimeout(()=>{
      document.querySelectorAll('.stat-val').forEach(el=>{
        const txt=el.textContent.trim()
        const m=txt.match(/^([^\d]*)([0-9,]+)(.*)$/)
        if(!m)return
        const[,pre,numStr,suf]=m
        const num=parseFloat(numStr.replace(/,/g,''))
        if(isNaN(num)||num===0)return
        const obj={v:0}
        gsap.to(obj,{v:num,duration:1.4,ease:'power2.out',
          onUpdate(){el.textContent=pre+Math.round(obj.v).toLocaleString('en-BD')+suf}})
      })
    },150)
  },[todayRev,occPct,inHouse,pending])
  const getGN=gids=>{const fid=String((gids||[])[0]||'');const g=guests.find(g=>String(g.id)===fid);return g?g.name:'Unknown'}

  return (
    <div>
      <div className="stats-row">
        {[
          {lbl:"Today's Revenue",val:BDT(todayRev),ico:'💰',sub:`${reservations.filter(r=>r.status==='CHECKED_IN').length} in-house`,ac:'var(--gold)'},
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
            {mergedTransactions.slice(0,8).map(t=>(
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
function RoomsPage({rooms,guests,reservations,toast,currentUser,reload,businessDate}) {
  const [filter,setFilter]=useState('ALL')
  const [selRoom,setSelRoom]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const canEdit=['owner','manager','receptionist'].includes(currentUser?.role)
  const canHKStatus=currentUser?.role==='housekeeping'  // HK can only change dirty→available
  const isSA=currentUser?.role==='owner'
  const sc=rooms.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{})
  const filtered=filter==='ALL'?rooms:rooms.filter(r=>r.status===filter)

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
          <div key={room.id} className={`room-card ${room.status}`} onClick={()=>setSelRoom(room)}>
            {room.status==='OCCUPIED'&&<div style={{position:'absolute',top:5,right:5,fontSize:7,background:'rgba(88,166,255,.25)',color:'var(--sky)',borderRadius:3,padding:'1px 5px',border:'1px solid rgba(88,166,255,.3)'}}>FOLIO</div>}
            <div className="room-no">{room.room_number}</div>
            <div className="flex fac" style={{marginBottom:4}}><span className={`rdot ${room.status}`}/><span className="room-cat">{room.status.replace('_',' ')}</span></div>
            <div className="room-cat">{room.category||'Standard'}</div>
            <div className="room-price">{BDT(room.price)}/night</div>
          </div>
        ))}
      </div>
      {selRoom&&(
        <RoomModal key={selRoom.id} room={selRoom} guests={guests} reservations={reservations} rooms={rooms}
          canEdit={canEdit} canHKStatus={canHKStatus} isSA={isSA} toast={toast}
          businessDate={businessDate}
          onClose={()=>setSelRoom(null)}
          reload={()=>{ reload(); setSelRoom(null) }}/>
      )}
      {showAdd&&isSA&&<AddRoomModal toast={toast} onClose={()=>setShowAdd(false)} reload={reload} rooms={rooms}/>}
    </div>
  )
}

function RoomModal({room,guests,reservations,rooms,canEdit,canHKStatus,isSA,toast,onClose,reload,businessDate}) {
  const [status,setStatus]=useState(room.status)
  const [folios,setFolios]=useState([])
  const [fLoad,setFLoad]=useState(true)
  const [showCharge,setShowCharge]=useState(false)
  const [showCO,setShowCO]=useState(false)
  const [saving,setSaving]=useState(false)
  const [collectAmt,setCollectAmt]=useState('')
  const [collectSaving,setCollectSaving]=useState(false)

  const activeRes=reservations.find(r=>(r.room_ids||[]).includes(room.room_number)&&r.status==='CHECKED_IN')
  const guest=activeRes?guests.find(g=>String(g.id)===String((activeRes.guest_ids||[])[0]||'')):null

  useEffect(()=>{
    setFolios([]); setFLoad(true)
    if(!activeRes?.id){ setFLoad(false); return }
    let cancelled=false
    const resId=activeRes.id
    db('folios',`?reservation_id=eq.${resId}&order=created_at`)
      .then(d=>{
        if(cancelled) return
        const list=Array.isArray(d)?d:[]
        const clean=list.filter(x=>String(x.reservation_id)===String(resId))
        setFolios(clean); setFLoad(false)
      })
      .catch(()=>{ if(!cancelled) setFLoad(false) })
    return ()=>{ cancelled=true }
  },[activeRes?.id])

  const roomRate=+room.price||0
  const nights=activeRes?nightsCount(activeRes.check_in,activeRes.check_out):0
  const roomCharge=roomRate*nights
  const ADMIN_RE=/receivable|payment|settlement|advance|refund/i
  const chargeFolios=folios.filter(f=>!ADMIN_RE.test(String(f.category||'')+' '+String(f.description||'')))
  const extras=chargeFolios.reduce((a,f)=>a+(+f.amount||0),0)
  const sub=roomCharge+extras
  const totalDiscount=+(activeRes?.discount_amount||activeRes?.discount||0)
  const resRoomIds=(activeRes?.room_ids||[]).filter(Boolean)
  const isMulti=resRoomIds.length>1
  const resRatesSum=isMulti?resRoomIds.reduce((a,rn)=>a+(+(rooms||[]).find(r=>String(r.room_number)===String(rn))?.price||0),0):roomRate
  const discount=isMulti&&resRatesSum>0?Math.round(totalDiscount*(roomRate/resRatesSum)):totalDiscount
  const total=Math.max(0,sub-discount)
  const totalPaid=+(activeRes?.paid_amount||0)
  const paid=isMulti&&resRatesSum>0?Math.round(totalPaid*(roomRate/resRatesSum)):totalPaid
  const due=Math.max(0,total-paid)

  async function saveStatus() {
    setSaving(true)
    try { await dbPatch('rooms',room.id,{status}); toast(`Room ${room.room_number} → ${status}`); reload() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  async function doCheckout() {
    try {
      await dbPatch('reservations',activeRes.id,{status:'CHECKED_OUT'})
      await dbPatch('rooms',room.id,{status:'DIRTY'})
      toast(due>0?`${guest?.name||'Guest'} checked out · ${BDT(due)} carried to outstanding`:`${guest?.name||'Guest'} checked out ✓`)
      reload()
    } catch(e){ toast(e.message,'error') }
  }

  async function saveCollectAmount() {
    const a=+collectAmt
    if(!a||a<=0) return toast('Enter valid amount','error')
    setCollectSaving(true)
    try {
      await dbPatch('reservations',activeRes.id,{paid_amount:a})
      await dbPost('transactions',{type:'Advance Payment',amount:a,room_number:room.room_number,guest_name:guest?.name,fiscal_day:todayStr(),reservation_id:activeRes?.id||null,tenant_id:TENANT})
      toast(`৳${a.toLocaleString()} collected`)
      reload()
    } catch(e){ toast(e.message,'error') }
    finally{ setCollectSaving(false) }
  }

  async function addFolioCharge(f) {
    if(!activeRes?.id||String(f?.reservation_id)!==String(activeRes.id)){
      toast('Charge rejected: reservation mismatch','error')
      setShowCharge(false)
      return
    }
    setFolios(p=>[...p.filter(x=>x.id!==f.id),f])
    toast(`Charge ${BDT(f.amount)} added`)
    setShowCharge(false)
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
          {(canEdit||canHKStatus)&&<button className="btn btn-gold btn-sm" disabled={saving||(!canEdit&&canHKStatus&&room.status!=='DIRTY')} onClick={saveStatus}>{saving?'Saving…':'Save Status'}</button>}
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
              <div className="xs muted">Balance Due</div>
              <div style={{fontWeight:700,fontSize:22,color:due>0?'var(--rose)':'var(--grn)'}}>{BDT(due)}</div>
            </div>
          </div>
        </div>
      )}

      {activeRes&&(
        <div style={{background:'var(--s2)',borderRadius:8,border:'1px solid var(--br2)',overflow:'hidden',marginBottom:14}}>
          <div style={{padding:'7px 12px',background:'rgba(200,169,110,.04)',borderBottom:'1px solid var(--br2)',fontSize:8,letterSpacing:'.1em',color:'var(--tx2)',textTransform:'uppercase',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>Folio Charges</span>
            {canEdit&&!canHKStatus&&<button className="btn btn-ghost btn-sm" style={{fontSize:10}} onClick={()=>setShowCharge(true)}>+ Add</button>}
          </div>
          <div style={{padding:'0 12px'}}>
            {fLoad&&<div className="xs muted" style={{padding:'12px 0',textAlign:'center'}}>Loading folio…</div>}
            {!fLoad&&chargeFolios.length===0&&nights===0&&<div className="xs muted" style={{padding:'12px 0',textAlign:'center'}}>No extra charges</div>}
            {/* Room charge line */}
            {!fLoad&&nights>0&&(
              <div className="folio-row">
                <div><span>Room charge</span> <span className="badge bgold" style={{fontSize:8,marginLeft:6}}>{nights}×{BDT(roomRate)}</span></div>
                <span className="xs gold">{BDT(roomCharge)}</span>
              </div>
            )}
            {chargeFolios.map(f=>(
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
            <div className="flex fjb xs muted" style={{marginBottom:3}}><span>Subtotal</span><span>{BDT(sub)}</span></div>
            {discount>0&&<div className="flex fjb xs" style={{marginBottom:3,color:'var(--grn)'}}><span>Discount{isMulti?' (prorated)':''}</span><span>- {BDT(discount)}</span></div>}
            <div className="divider" style={{margin:'6px 0'}}/>
            <div className="flex fjb xs" style={{marginBottom:3,fontWeight:600}}><span>Total</span><span>{BDT(total)}</span></div>
            <div className="flex fjb xs" style={{marginBottom:3,color:'var(--grn)'}}><span>Paid{isMulti?' (prorated)':''}</span><span>- {BDT(paid)}</span></div>
            <div className="divider" style={{margin:'6px 0'}}/>
            <div className="flex fjb" style={{fontSize:13,fontWeight:700,color:due>0?'var(--rose)':'var(--grn)'}}><span>Balance Due</span><span>{BDT(due)}</span></div>
          </div>
        </div>
      )}

      {/* Collect Amount box — not for HK */}
      {activeRes&&canEdit&&(
        <div style={{background:'rgba(200,169,110,.06)',border:'1px solid var(--br)',padding:'12px 14px',marginBottom:14}}>
          <div className="flbl" style={{marginBottom:8}}>💰 Collect Payment</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="number" className="finput" value={collectAmt}
              onChange={e=>setCollectAmt(e.target.value)}
              placeholder={`Due: ${BDT(Math.max(0,total-(+activeRes.paid_amount||0)))}`}
              style={{flex:1}}/>
            <button className="btn btn-gold" disabled={collectSaving} onClick={saveCollectAmount} style={{whiteSpace:'nowrap'}}>
              {collectSaving?'Saving…':'Save Payment'}
            </button>
          </div>
          {(+activeRes.paid_amount||0)>0&&(
            <div className="xs muted" style={{marginTop:6}}>Already paid: {BDT(activeRes.paid_amount)} · Balance: {BDT(Math.max(0,total-(+activeRes.paid_amount||0)))}</div>
          )}
        </div>
      )}

      <div className="g2 mb4">
        {[['Category',room.category||'Standard'],['Rate/Night',BDT(room.price)],['Floor',room.floor||room.room_number.slice(0,-2)||'—'],['Beds',room.beds||'Double']].map(([l,v])=>(
          <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
        ))}
      </div>

      {(canEdit||canHKStatus)&&(
        <div className="fg">
          <label className="flbl">Change Status</label>
          {canHKStatus&&!canEdit?(
            room.status==='DIRTY'?(
              <select className="fselect" value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="DIRTY">DIRTY</option>
                <option value="AVAILABLE">AVAILABLE — Mark as Clean</option>
              </select>
            ):<div className="finput" style={{opacity:.5,cursor:'not-allowed'}}>{room.status} — No changes allowed</div>
          ):(
            <select className="fselect" value={status} onChange={e=>setStatus(e.target.value)}>
              {['AVAILABLE','OCCUPIED','DIRTY','OUT_OF_ORDER','RESERVED'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
          )}
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
            {[['Total Bill',BDT(total)],['Paid',BDT(paid)]].map(([l,v])=>(
              <div key={l} className="flex fjb xs muted" style={{maxWidth:240,margin:'3px auto'}}><span>{l}</span><span>{v}</span></div>
            ))}
            <div className="divider" style={{maxWidth:240,margin:'8px auto'}}/>
            <div className="flex fjb" style={{maxWidth:240,margin:'4px auto',fontSize:13,fontWeight:700,color:due>0?'var(--rose)':'var(--grn)'}}>
              <span>{due>0?'Outstanding Due':'Balance'}</span><span>{BDT(due)}</span>
            </div>
            {due>0
              ? <div className="xs" style={{color:'var(--rose)',marginTop:10,maxWidth:280,margin:'10px auto 0'}}>⚠ {BDT(due)} will be carried forward as Outstanding Due. No payment will be auto-posted.</div>
              : <div className="xs" style={{color:'var(--grn)',marginTop:10}}>✓ Folio fully settled</div>}
            <div className="xs muted mt3">Room will move to Dirty / Housekeeping</div>
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

  async function save() {
    const a=parseFloat(amt)
    if(!a||a<=0) return toast('Enter a valid amount','error')
    if(!resId) return toast('No active reservation — cannot add charge','error')
    setSaving(true)
    try {
      const [f]=await dbPost('folios',{room_number:roomNo,reservation_id:resId,description:desc||cat,category:cat,amount:a,tenant_id:TENANT})
      // Keep total_amount in sync so _resDue stays accurate across the whole app
      if(resId) {
        const resData=await db('reservations',`?id=eq.${resId}&select=total_amount`)
        const curTotal=+(resData?.[0]?.total_amount||0)
        await dbPatch('reservations',resId,{total_amount:curTotal+a})
      }
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
function ReservationsPage({reservations,guests,rooms,toast,currentUser,reload,businessDate,transactions}) {
  const [filter,setFilter]=useState('ALL')
  const [search,setSearch]=useState('')
  const [selRes,setSelRes]=useState(null)
  const [showNew,setShowNew]=useState(false)

  const sc=reservations.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{})
  const resBalance=r=>Math.max(0,(+r.total_amount||0)-(+r.discount_amount||+r.discount||0)-(+r.paid_amount||0))
  const dueCount=reservations.filter(r=>(r.status==='CHECKED_IN'||r.status==='CHECKED_OUT')&&resBalance(r)>0).length
  const getGN=gids=>{const fid=String((gids||[])[0]||'');const g=guests.find(g=>String(g.id)===fid);return g?g.name:'Unknown'}

  let res
  if(filter==='ALL') res=reservations
  else if(filter==='DUE') res=reservations.filter(r=>(r.status==='CHECKED_IN'||r.status==='CHECKED_OUT')&&resBalance(r)>0)
  else res=reservations.filter(r=>r.status===filter)
  if(search){
    const q=search.toLowerCase()
    res=res.filter(r=>getGN(r.guest_ids).toLowerCase().includes(q)||(r.room_ids||[]).join('').includes(q)||r.on_duty_officer?.toLowerCase().includes(q))
  }

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          {['ALL','CHECKED_IN','RESERVED','PENDING','CHECKED_OUT','DUE','CANCELLED'].map(s=>(
            <button key={s} className={`tab${filter===s?' on':''}`} onClick={()=>setFilter(s)} style={s==='DUE'&&filter!==s?{color:'var(--rose)'}:{}}>
              {s==='ALL'?`All (${reservations.length})`:s==='DUE'?`Due (${dueCount})`:`${s.replace('_',' ')} (${sc[s]||0})`}
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
              <tr><th>Guest</th><th>Rooms</th><th>Check-In</th><th>Check-Out</th><th>Nights</th><th>Total</th><th>Discount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {res.slice(0,80).map(r=>{
                const gn=getGN(r.guest_ids)
                const nights=nightsCount(r.check_in,r.check_out)
                const balance=resBalance(r)
                return (
                  <tr key={r.id}>
                    <td><div className="flex fac gap2"><Av name={gn} size={24}/><span>{gn}</span></div></td>
                    <td><span className="badge bb">{(r.room_ids||[]).join(', ')}</span></td>
                    <td className="xs muted">{fmtDate(r.check_in)}</td>
                    <td className="xs muted">{fmtDate(r.check_out)}</td>
                    <td className="xs gold">{nights||'—'}</td>
                    <td className="xs gold">{BDT(r.total_amount)}</td>
                    <td className="xs" style={{color:'var(--amb)'}}>{(+r.discount_amount||+r.discount||0)>0?'− '+BDT(+r.discount_amount||+r.discount||0):'—'}</td>
                    <td className="xs" style={{color:+r.paid_amount>0?'var(--grn)':'var(--tx2)'}}>{BDT(r.paid_amount)}</td>
                    <td className="xs" style={{color:balance>0?'var(--rose)':'var(--grn)'}}>{BDT(balance)}</td>
                    <td><SBadge status={r.status}/></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={()=>setSelRes(r)}>View</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selRes&&(
        <ReservationDetail res={selRes} guests={guests} rooms={rooms} toast={toast}
          onClose={()=>setSelRes(null)} reload={()=>{reload();setSelRes(null)}} isOwner={currentUser?.role==='owner'}
          businessDate={businessDate} transactions={transactions}/>
      )}
      {showNew&&(
        <NewReservationModal guests={guests} rooms={rooms} toast={toast}
          onClose={()=>setShowNew(false)} reload={reload} businessDate={businessDate}/>
      )}
    </div>
  )
}

function ReservationDetail({res,guests,rooms,toast,onClose,reload,isOwner,businessDate,transactions}) {
  const [status,setStatus]=useState(res.status)
  const [paidAmt,setPaidAmt]=useState(String(res.paid_amount||''))
  const [discountAmt,setDiscountAmt]=useState(String(res.discount_amount||res.discount||''))
  const [notes,setNotes]=useState(res.notes||'')
  const [saving,setSaving]=useState(false)
  const [chargeFor,setChargeFor]=useState(null) // room_number for per-room Add Charge modal

  const [checkOut,setCheckOut]=useState(res.check_out?String(res.check_out).slice(0,10):'')
  const [checkInDate,setCheckInDate]=useState(res.check_in?String(res.check_in).slice(0,10):'')
  const [roomArr,setRoomArr]=useState((res.room_ids||[]).length?res.room_ids:[''])
  const roomNos=roomArr.filter(Boolean).join(', ')
  const gn=guests.find(g=>String(g.id)===String((res.guest_ids||[])[0]||''))?.name||'Unknown'
  const nights=nightsCount(checkInDate||res.check_in,checkOut||res.check_out)
  const origNights=nightsCount(res.check_in,res.check_out)
  const extNights=Math.max(0,nights-origNights)
  const ratesSum=roomArr.filter(Boolean).reduce((a,rn)=>a+(+rooms.find(r=>String(r.room_number)===String(rn))?.price||0),0)
  const roomRate=ratesSum
  const extCharge=extNights>0?extNights*ratesSum:0
  const computedTotal=ratesSum*nights
  const totalAmt=computedTotal>0?computedTotal:(+res.total_amount||0)
  const paidNum=+paidAmt||0
  const discountNum=+discountAmt||0
  const balance=Math.max(0,totalAmt-discountNum-paidNum)
  const selectableRooms=rooms.filter(r=>r.status==='AVAILABLE'||roomArr.includes(r.room_number))

  async function save() {
    setSaving(true)
    try {
      const newRoomNos=roomArr.filter(Boolean)
      const oldRoomNos=res.room_ids||[]
      const removed=oldRoomNos.filter(rn=>!newRoomNos.includes(rn))
      for(const rn of removed){
        const room=rooms.find(r=>r.room_number===rn)
        if(room) await dbPatch('rooms',room.id,{status:'AVAILABLE'})
      }
      if(status==='CHECKED_IN'&&res.status!=='CHECKED_IN') {
        for(const rn of newRoomNos) {
          const room=rooms.find(r=>r.room_number===rn)
          if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
        }
      }
      if(status==='CHECKED_IN'){
        const added=newRoomNos.filter(rn=>!oldRoomNos.includes(rn))
        for(const rn of added){
          const room=rooms.find(r=>r.room_number===rn)
          if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
        }
      }
      if(status==='CHECKED_OUT'&&res.status!=='CHECKED_OUT') {
        for(const rn of newRoomNos) {
          const room=rooms.find(r=>r.room_number===rn)
          if(room) await dbPatch('rooms',room.id,{status:'DIRTY'})
        }
      }
      const _resGuestName = guests.find(g=>g.id===(res.guest_ids||[])[0])?.name || res.guest_name || null
      const updates={status,paid_amount:paidNum,discount_amount:discountNum,notes,check_in:checkInDate,check_out:checkOut,room_ids:newRoomNos,total_amount:totalAmt,guest_name:_resGuestName}
      if(checkOut&&checkOut!==String(res.check_out||'').slice(0,10)){
        updates.check_out=checkOut
        if(nights>0) updates.total_amount=nights*ratesSum
        if(extCharge>0){
          await dbPost('transactions',{
            room_number:newRoomNos[0]||'?',
            guest_name:gn,
            type:`Stay Extension (+${extNights} night${extNights!==1?'s':''})`,
            amount:extCharge, fiscal_day:businessDate||todayStr(), reservation_id:res.id, tenant_id:TENANT
          })
        }
      }
      // Auto-create payment TX when paid_amount increases via Save Changes.
      // Without this, Billing & Invoices is blind to the payment (no TX row = invisible).
      const prevPaid = +res.paid_amount || 0
      const payIncrease = paidNum - prevPaid
      if (payIncrease > 0) {
        await dbPost('transactions', {
          room_number: newRoomNos[0] || '?',
          guest_name: gn,
          type: 'Advance Payment',
          amount: payIncrease,
          fiscal_day: businessDate || todayStr(),
          reservation_id: res.id,
          tenant_id: TENANT
        })
      }
      await dbPatch('reservations',res.id,updates)
      toast(extCharge>0?`Reservation updated · Extension ৳${extCharge.toLocaleString()} charged ✓`:'Reservation updated ✓')
      reload()
    } catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  async function checkIn() {
    setSaving(true)
    try {
      for(const rn of (res.room_ids||[])) {
        const room=rooms.find(r=>r.room_number===rn)
        if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
      }
      await dbPatch('reservations',res.id,{status:'CHECKED_IN',check_in:new Date().toISOString()})
      toast(`${gn} checked in to Rm ${(res.room_ids||[]).join(',')} ✓`)
      reload()
    } catch(e){ toast(e.message,'error'); setSaving(false) }
  }

  return (
    <Modal title={`Reservation — ${gn}`} onClose={onClose} wide
      footer={
        <div className="flex gap2" style={{flexWrap:'wrap',width:'100%'}}>
          {(res.status==='RESERVED'||res.status==='PENDING')&&(
            <button className="btn btn-success" disabled={saving} onClick={checkIn}>✓ Check In Now</button>
          )}
          {isOwner&&<button className="btn btn-danger btn-sm" onClick={async()=>{
    if(!window.confirm(`Delete reservation for ${gn}?\nThis will:\n• Delete related transactions\n• Reset rooms to Available\n\nThis cannot be undone.`))return
    try{
      for(const rn of (res.room_ids||[])){
        const room=rooms.find(r=>String(r.room_number)===String(rn))
        if(room) await dbPatch('rooms',room.id,{status:'AVAILABLE'})
      }
      const relTx=(transactions||[]).filter(t=>
        (res.room_ids||[]).some(rn=>String(t.room_number)===String(rn))&&
        (!t.guest_name||t.guest_name===gn)
      )
      for(const t of relTx) await dbDelete('transactions',t.id)
      await dbDelete('reservations',res.id)
      toast(`Reservation deleted · ${relTx.length} transaction(s) removed · Rooms freed ✓`)
      reload()
    }catch(e){toast(e.message,'error')}
  }}>🗑 Delete</button>}
          <div style={{flex:1}}/>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-gold" disabled={saving} onClick={save}>{saving?'Saving…':'Save Changes'}</button>
        </div>
      }>
      <div className="g2 mb4">
        <div className="info-box"><div className="info-lbl">Guest</div><div className="info-val">{gn}</div></div>
        <div className="info-box" style={{gridColumn:'span 2'}}>
          <div className="info-lbl">Rooms (editable · multi)</div>
          <div style={{marginTop:4}}>
            {roomArr.map((rn,idx)=>(
              <div key={idx} style={{display:'flex',gap:6,marginBottom:4,alignItems:'center'}}>
                <select className="fselect" style={{flex:1,fontSize:12,padding:'4px 8px'}} value={rn} onChange={e=>{const a=[...roomArr];a[idx]=e.target.value;setRoomArr(a)}}>
                  <option value="">— select room —</option>
                  {selectableRooms.filter(r=>r.room_number===rn||!roomArr.includes(r.room_number)).map(r=>(
                    <option key={r.id} value={r.room_number}>{r.room_number} — {r.category} — {BDT(r.price)}/n</option>
                  ))}
                </select>
                {rn&&res.id&&(status==='CHECKED_IN'||status==='CHECKED_OUT'||res.status==='CHECKED_IN'||res.status==='CHECKED_OUT')&&(
                  <button type="button" title={`Add charge to Room ${rn}`} style={{background:'rgba(88,166,255,.08)',border:'1px solid rgba(88,166,255,.35)',color:'var(--info,#58a6ff)',cursor:'pointer',padding:'3px 8px',fontSize:10,letterSpacing:'.04em',whiteSpace:'nowrap'}} onClick={()=>setChargeFor(rn)}>+ Charge</button>
                )}
                {roomArr.length>1&&<button type="button" style={{background:'none',border:'1px solid rgba(248,113,113,.3)',color:'var(--rose)',cursor:'pointer',padding:'3px 7px',fontSize:11}} onClick={()=>setRoomArr(roomArr.filter((_,i)=>i!==idx))}>✕</button>}
              </div>
            ))}
            {selectableRooms.filter(r=>!roomArr.includes(r.room_number)).length>0&&(
              <button type="button" style={{background:'none',border:'1px dashed rgba(200,169,110,.35)',color:'var(--gold)',cursor:'pointer',padding:'4px 8px',fontSize:10,letterSpacing:'.08em',width:'100%',marginTop:2}} onClick={()=>setRoomArr([...roomArr,''])}>+ Add Room</button>
            )}
          </div>
        </div>
        <div className="info-box">
          <div className="info-lbl">Check-In</div>
          <input type="date" className="finput" style={{marginTop:4,fontSize:12,padding:'4px 8px'}} value={checkInDate}
            onChange={e=>setCheckInDate(e.target.value)}/>
        </div>
        <div className="info-box">
          <div className="info-lbl">Check-Out</div>
          <input type="date" className="finput" style={{marginTop:4,fontSize:12,padding:'4px 8px'}} value={checkOut}
            onChange={e=>setCheckOut(e.target.value)} min={checkInDate}/>
        </div>
        <div className="info-box"><div className="info-lbl">Nights</div><div className="info-val">{nights||'—'}</div></div>
        <div className="info-box"><div className="info-lbl">Total Amount</div><div className="info-val">{BDT(totalAmt)}</div></div>
        <div className="info-box"><div className="info-lbl">Payment Method</div><div className="info-val">{res.payment_method||'—'}</div></div>
        <div className="info-box"><div className="info-lbl">On-Duty Officer</div><div className="info-val">{res.on_duty_officer||'—'}</div></div>
      </div>
      {res.special_requests&&<div className="info-box mb4"><div className="info-lbl">Special Requests</div><div className="info-val" style={{marginTop:4}}>{res.special_requests}</div></div>}
      {/* Stay Extension — editable check-out */}
      {(res.status==='CHECKED_IN')&&(
        <div style={{background:'rgba(200,169,110,.06)',border:'1px solid rgba(200,169,110,.2)',padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <span style={{fontSize:10,color:'var(--gold)',letterSpacing:'.1em',textTransform:'uppercase',whiteSpace:'nowrap'}}>✦ Stay Extension</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,color:'var(--tx3)'}}>New Check-Out:</span>
            <input type="date" className="finput" value={checkOut} onChange={e=>setCheckOut(e.target.value)} min={String(res.check_in||'').slice(0,10)} style={{width:150,padding:'4px 8px',fontSize:12}}/>
          </div>
          {extNights>0&&<span style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>+{extNights} night{extNights!==1?'s':''} · +{BDT(extCharge)}</span>}
          {checkOut&&checkOut!==String(res.check_out||'').slice(0,10)&&extNights===0&&nights<origNights&&<span style={{fontSize:11,color:'var(--rose)'}}>⚠ Shortening stay — no auto-charge</span>}
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
          <label className="flbl">Amount Paid (BDT)</label>
          <input type="number" className="finput" value={paidAmt} onChange={e=>setPaidAmt(e.target.value)} min="0"/>
          <div className="xs mt3" style={{color:balance>0?'var(--rose)':'var(--grn)'}}>
            Balance due: {BDT(balance)}
          </div>
        </div>
      </div>
      <div className="frow">
        <div className="fg">
          <label className="flbl">Discount Amount (BDT)</label>
          <input type="number" className="finput" value={discountAmt} onChange={e=>setDiscountAmt(e.target.value)} min="0" placeholder="0"/>
        </div>
        <div className="fg"/>
      </div>
      <div className="fg">
        <label className="flbl">Notes</label>
        <textarea className="ftextarea" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:50}} placeholder="Internal notes…"/>
      </div>
      {chargeFor&&<AddChargeModal roomNo={chargeFor} resId={res.id} toast={toast} onClose={()=>setChargeFor(null)} onDone={()=>{setChargeFor(null);reload()}}/>}
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

function NewReservationModal({guests,rooms,toast,onClose,reload,businessDate}) {
  const availRooms=rooms.filter(r=>r.status==='AVAILABLE')
  const [f,setF]=useState({
    guestId:'', roomNos:[availRooms[0]?.room_number||''],
    checkIn:todayStr(), checkOut:'',
    total:'', paid:'', discount:'', method:'Cash', notes:'', officer:'', stayType:'CHECK_IN'
  })
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)
  const [availableRooms,setAvailableRooms]=useState(availRooms)
  const [loadingRooms,setLoadingRooms]=useState(false)

  // Date-based availability: re-query when dates change (Future Reservation mode only)
  useEffect(()=>{
    if(f.stayType==='CHECK_IN'){ setAvailableRooms(availRooms); return }
    if(!f.checkIn||!f.checkOut||f.checkIn>=f.checkOut){ setAvailableRooms(rooms.filter(r=>r.status!=='OUT_OF_ORDER'&&r.status!=='DIRTY')); return }
    setLoadingRooms(true)
    db('reservations',`?select=room_ids&status=in.(RESERVED,CHECKED_IN,CONFIRMED)&check_in=lt.${f.checkOut}&check_out=gt.${f.checkIn}`)
      .then(conflicts=>{
        const blocked=new Set((conflicts||[]).flatMap(r=>r.room_ids||[]).map(String))
        setAvailableRooms(rooms.filter(r=>!blocked.has(String(r.room_number))&&r.status!=='OUT_OF_ORDER'&&r.status!=='DIRTY'))
      })
      .catch(()=>setAvailableRooms(rooms.filter(r=>r.status!=='OUT_OF_ORDER'&&r.status!=='DIRTY')))
      .finally(()=>setLoadingRooms(false))
  },[f.checkIn,f.checkOut,f.stayType])

  const autoNights=f.checkIn&&f.checkOut?nightsCount(f.checkIn,f.checkOut):0
  const autoTotal=f.roomNos.filter(Boolean).reduce((sum,rn)=>{
    const rm=rooms.find(r=>r.room_number===rn); return sum+(rm&&autoNights?+rm.price*autoNights:0)
  },0)

  useEffect(()=>{
    if(autoTotal>0) setF(p=>({...p,total:String(autoTotal)}))
  },[JSON.stringify(f.roomNos),f.checkIn,f.checkOut])

  async function save() {
    if(!f.guestId) return toast('Select a guest','error')
    if(!f.roomNos.filter(Boolean).length) return toast('Select at least one room','error')
    if(!f.checkIn||!f.checkOut) return toast('Set check-in and check-out dates','error')
    if(autoNights<=0) return toast('Check-out must be after check-in','error')
    setSaving(true)
    try {
      const isCheckIn=f.stayType==='CHECK_IN'
      const totalAmt=+f.total||autoTotal
      const selectedRooms=f.roomNos.filter(Boolean)
      const _guestName = guests.find(g=>g.id===f.guestId)?.name || null
      const [newRes]=await dbPost('reservations',{
        guest_ids:[f.guestId], room_ids:selectedRooms,
        guest_name:_guestName,
        check_in:f.checkIn, check_out:f.checkOut,
        status:isCheckIn?'CHECKED_IN':'RESERVED',
        total_amount:totalAmt, paid_amount:+f.paid||0,
        discount_amount:+f.discount||0,
        payment_method:f.method, special_requests:f.notes||null,
        on_duty_officer:f.officer||null, stay_type:f.stayType, tenant_id:TENANT
      })
      if(isCheckIn){
        for(const rn of selectedRooms){
          const room=rooms.find(r=>r.room_number===rn)
          if(room) await dbPatch('rooms',room.id,{status:'OCCUPIED'})
        }
      }
      if((+f.paid||0)>0){
        await dbPost('transactions',{
          room_number:selectedRooms[0], guest_name:guests.find(g=>g.id===f.guestId)?.name||'',
          type:`Room Payment (${f.method})`, amount:+f.paid, fiscal_day:businessDate||todayStr(), reservation_id:newRes?.id||null, tenant_id:TENANT
        })
      }
      toast(isCheckIn?`Check-in complete — Rm ${selectedRooms.join(',')} ✓`:'Reservation created ✓')
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
          <label className="flbl">Room(s) * {loadingRooms?<span style={{color:'var(--gold)',fontSize:10}}> Checking availability…</span>:availableRooms.length===0&&<span style={{color:'var(--rose)'}}>— no available rooms</span>}</label>
          {f.roomNos.map((rn,idx)=>(
            <div key={idx} style={{display:'flex',gap:6,marginBottom:5,alignItems:'center'}}>
              <select className="fselect" style={{flex:1}} value={rn} onChange={e=>{const a=[...f.roomNos];a[idx]=e.target.value;setF(p=>({...p,roomNos:a}))}}>
                <option value="">— select room —</option>
                {availableRooms.filter(r=>r.room_number===rn||!f.roomNos.includes(r.room_number)).map(r=>(
                  <option key={r.id} value={r.room_number}>{r.room_number} — {r.category} — {BDT(r.price)}/n</option>
                ))}
              </select>
              {f.roomNos.length>1&&<button type="button" style={{background:'none',border:'1px solid rgba(248,113,113,.3)',color:'var(--rose)',cursor:'pointer',padding:'4px 8px',fontSize:12}} onClick={()=>setF(p=>({...p,roomNos:p.roomNos.filter((_,i)=>i!==idx)}))}>✕</button>}
            </div>
          ))}
          {availableRooms.filter(r=>!f.roomNos.includes(r.room_number)).length>0&&(
            <button type="button" style={{background:'none',border:'1px dashed rgba(200,169,110,.35)',color:'var(--gold)',cursor:'pointer',padding:'5px 10px',fontSize:10,letterSpacing:'.08em',width:'100%',marginTop:2}} onClick={()=>setF(p=>({...p,roomNos:[...p.roomNos,'']}))}>+ Add Room</button>
          )}
        </div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Check-In Date *</label><input type="date" className="finput" value={f.checkIn} onChange={F('checkIn')}/></div>
        <div className="fg"><label className="flbl">Check-Out Date *</label><input type="date" className="finput" value={f.checkOut} onChange={F('checkOut')}/></div>
      </div>
      {autoNights>0&&(
        <div style={{background:'rgba(200,169,110,.07)',border:'1px solid rgba(200,169,110,.18)',padding:'9px 12px',marginBottom:10,fontSize:12,color:'var(--tx)'}}>
          {autoNights} night{autoNights!==1?'s':''} × {f.roomNos.filter(Boolean).length} room{f.roomNos.filter(Boolean).length!==1?'s':''} = <strong style={{color:'var(--gold)'}}>{BDT(autoTotal)}</strong>
        </div>
      )}
      <div className="frow">
        <div className="fg"><label className="flbl">Total Amount (BDT)</label><input type="number" className="finput" value={f.total} onChange={F('total')} placeholder={String(autoTotal||0)}/></div>
        <div className="fg"><label className="flbl">Paid Amount (BDT)</label><input type="number" className="finput" value={f.paid} onChange={F('paid')} placeholder="0"/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Discount Amount (BDT)</label><input type="number" className="finput" value={f.discount} onChange={F('discount')} placeholder="0" min="0"/></div>
        <div className="fg"/>
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
function GuestsPage({guests,reservations,toast,currentUser,reload}) {
  const PAGE_SIZE=50
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(1)
  const [sel,setSel]=useState(null)
  const [showAdd,setShowAdd]=useState(false)

  const balByGuest=useMemo(()=>{
    const byId={}, byName={}
    const _due=r=>Math.max(0,(+r.total_amount||0)-(+r.discount_amount||+r.discount||0)-(+r.paid_amount||0))
    ;(reservations||[]).forEach(r=>{
      const due=_due(r)
      if(due<=0) return
      ;(r.guest_ids||[]).forEach(gid=>{ const k=String(gid); byId[k]=(byId[k]||0)+due })
      const nm=String(r.guest_name||'').trim().toLowerCase()
      if(nm) byName[nm]=(byName[nm]||0)+due
    })
    return {byId,byName}
  },[reservations])
  const guestBal=g=>{
    const idHit=balByGuest.byId[String(g.id)]
    if(idHit!=null) return idHit
    return balByGuest.byName[String(g.name||'').trim().toLowerCase()]||0
  }

  let filtered=guests
  if(search){ const q=search.toLowerCase(); filtered=filtered.filter(g=>g.name?.toLowerCase().includes(q)||g.phone?.includes(q)||g.email?.toLowerCase().includes(q)) }

  useEffect(()=>setPage(1),[search])

  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))
  const pageList=filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  return (
    <div>
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="srch"><span className="xs muted">⌕</span><input placeholder="Search name, phone, email…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="flex gap2" style={{alignItems:'center'}}>
          <span className="badge bgold">{filtered.length} {search?'found':('of '+guests.length+' guests')}</span>
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
                  <td className="xs" style={{color:guestBal(g)>0?'var(--rose)':'var(--grn)'}}>{BDT(guestBal(g))}</td>
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

      {sel&&<GuestModal guest={sel} reservations={reservations} toast={toast} onClose={()=>setSel(null)} reload={reload} isSA={currentUser?.role==='owner'}/>}
      {showAdd&&<AddGuestModal toast={toast} onClose={()=>setShowAdd(false)} reload={reload}/>}
    </div>
  )
}

function GuestModal({guest,reservations,toast,onClose,reload,isSA}) {
  const gnameKey=String(guest.name||'').trim().toLowerCase()
  const gAll=reservations.filter(r=>{
    const ids=(r.guest_ids||[]).map(String)
    if(ids.includes(String(guest.id))) return true
    if(r.guest_name && String(r.guest_name).trim().toLowerCase()===gnameKey) return true
    return false
  })
  const aggBalance=gAll.reduce((a,r)=>a+Math.max(0,(+r.total_amount||0)-(+r.discount_amount||+r.discount||0)-(+r.paid_amount||0)),0)
  const gRes=gAll.slice().sort((a,b)=>String(b.check_in||'').localeCompare(String(a.check_in||''))).slice(0,10)
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
        {[['Phone',guest.phone||'—'],['Email',guest.email||'—'],['ID Type',guest.id_type||'—'],['ID Number',guest.id_number||guest.id_card||'—'],['Balance',BDT(aggBalance)],['Address',guest.address||'—']].map(([l,v])=>(
          <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
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
  async function save() {
    if(!f.name.trim()) return toast('Name required','error')
    setSaving(true)
    try { const gp={...f};gp.email=gp.email?.trim()||null;gp.phone=gp.phone?.trim()||null; await dbPatch('guests',guest.id,gp); toast('Guest updated ✓'); reload() }
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
  async function save() {
    if(!f.name.trim()) return toast('Name required','error')
    if(!f.phone.trim()) return toast('Contact Number required','error')
    setSaving(true)
    try { const gp={...f,tenant_id:TENANT};gp.email=gp.email?.trim()||null;gp.phone=gp.phone?.trim()||null; await dbPost('guests',gp); toast(`Guest "${f.name}" added`); reload(); onClose() }
    catch(e){ toast(e.message,'error'); setSaving(false) }
  }
  return (
    <Modal title="Add New Guest" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={saving} onClick={save}>Add Guest</button></>}>
      <div className="fg"><label className="flbl">Full Name <span style={{color:'var(--rose)'}}>*</span></label><input className="finput" value={f.name} onChange={F('name')} placeholder="Guest full name" autoFocus/></div>
      <div className="frow">
        <div className="fg"><label className="flbl">Contact Number <span style={{color:'var(--rose)'}}>*</span></label><input className="finput" value={f.phone} onChange={F('phone')} placeholder="+880…"/></div>
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

  let list=tasks
  if(filter==='DIRTY'){
    list=dirty.map(r=>({id:'r_'+r.id,room_number:r.room_number,task_type:'Standard Clean',priority:'high',status:'pending',assignee:'—',_dirty:true}))
  } else if(filter!=='ALL'){
    list=tasks.filter(t=>t.status===filter)
  }

  async function updateStatus(id,s) {
    try {
      await dbPatch('housekeeping_tasks',id,{status:s,completed_at:s==='completed'?new Date().toISOString():null})
      toast(`Task → ${s}`)
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
  const [f,setF]=useState({room_number:rooms[0]?.room_number||'',task_type:'Standard Clean',priority:'medium',assignee:'',scheduled_time:'',notes:''})
  const F=k=>e=>setF(p=>({...p,[k]:e.target.value}))
  const [saving,setSaving]=useState(false)
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
            {rooms.map(r=><option key={r.id} value={r.room_number}>{r.room_number} — {r.status.replace('_',' ')}</option>)}
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
  const w = window.open('', '_blank', 'width=1100,height=700')
  if(!w){ alert('Please allow popups to print PDF'); return Promise.resolve() }
  w.document.write(htmlContent)
  w.document.close()
  return new Promise(resolve=>{
    w.onload = ()=>{
      setTimeout(()=>{
        w.focus()
        w.print()
        resolve()
      }, 600)
    }
  })
}

function downloadBillingPDF(enriched, filter, periodTotal, cashTotal, bkashTotal, outstanding, calDate, tokenAmount, duesList) {
  let filterLabel = filter==='TODAY'?'Today':filter==='MONTH'?'This Month':'All Time'
  if (filter === 'DATE' && calDate) {
    const [y,m,d] = calDate.split('-'); const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    filterLabel = `${+d}-${mo[+m-1]}-${y}`
  }
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  const now = new Date().toLocaleString('en-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})
  const fmt = n => `৳${Number(n||0).toLocaleString()}`
  const short = d => d ? String(d).slice(0,10) : '—'
  const rows = (enriched||[]).map(r=>`<tr>
    <td>${esc(r.guest_name||'—')}</td>
    <td>${esc(r.room_number||'—')}</td>
    <td class="mono">${short(r.check_in)}<br/><span class="muted">→ ${short(r.check_out)}</span></td>
    <td class="num">${fmt(r.bill_total)}</td>
    <td class="num">${fmt(r.paid)}</td>
    <td class="num due">${fmt(r.balance_due)}</td>
    <td><span class="pm pm-${String(r.payment_method||'').toLowerCase().replace(/[^a-z]/g,'')}">${esc(r.payment_method||'—')}</span></td>
    <td class="num pos">${fmt(r.collected_amount)}</td>
  </tr>`).join('')
  const tkn = +(tokenAmount||0)
  const closingBalance = (+periodTotal||0) - tkn
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${_HNAME} — Billing ${filterLabel}</title>
  <style>
    @page{size:A4 portrait;margin:6mm 6mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}}
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1C1510;font-size:8px;background:#fff;line-height:1.25}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid #1C1510}
    .hotel-name{font-size:15px;font-weight:800;color:#1C1510;font-family:Georgia,serif;line-height:1}
    .hotel-name em{color:#C8A96E;font-style:italic;font-weight:400}
    .hotel-sub{font-size:6.5px;color:#8D6F57;margin-top:2px;letter-spacing:.1em;text-transform:uppercase}
    .report-title{text-align:right}
    .report-title h2{font-size:10px;font-weight:700;color:#1C1510}
    .report-title .meta{font-size:6.5px;color:#8D6F57;margin-top:2px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px}
    .stat-box{background:#FBF8F3;border:1px solid #8D6F57;padding:3px 6px}
    .stat-box .lbl{font-size:5.5px;letter-spacing:.1em;color:#8D6F57;text-transform:uppercase;margin-bottom:1px;font-weight:600}
    .stat-box .val{font-size:10px;font-weight:800;color:#1C1510;font-family:'IBM Plex Mono',monospace}
    .stat-box.hi{background:#FBF8F3;border-color:#C8A96E;border-top:2px solid #C8A96E}
    .stat-box.cash{border-top:2px solid #1F6F54}
    .stat-box.cash .val{color:#1F6F54}
    .stat-box.bkash{border-top:2px solid #D02A77}
    .stat-box.bkash .val{color:#D02A77}
    .stat-box.out{border-top:2px solid #950101}
    .stat-box.out .val{color:#950101}
    .sec-hdr{margin-top:4px;padding:3px 6px;background:#1C1510;color:#FBF8F3;font-size:7px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
    .sec-hdr.due{background:#950101}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    thead tr{background:#3A2D22}
    thead th{padding:3px 4px;text-align:left;font-size:6.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#FBF8F3}
    thead th.num{text-align:right}
    .due-table thead tr{background:#950101}
    tbody tr:nth-child(even){background:#FBF8F3}
    tbody tr:nth-child(odd){background:#fff}
    tbody td{padding:2.5px 4px;border-bottom:1px solid #EAE6DD;font-size:7.5px;color:#1C1510;vertical-align:middle;word-wrap:break-word;line-height:1.2}
    tbody td.num{text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600}
    tbody td.mono{font-family:'IBM Plex Mono',monospace;font-size:7px}
    tbody td .muted{color:#8D6F57;font-size:6.5px}
    tbody td.due{color:#950101;font-weight:700}
    tbody td.pos{color:#1F6F54}
    tfoot tr{background:#FBE9E9}
    tfoot td{padding:3px 4px;font-size:7.5px;font-weight:700;color:#950101}
    tfoot td.num{text-align:right;font-family:'IBM Plex Mono',monospace}
    .pm{display:inline-block;padding:1px 4px;border-radius:2px;font-size:6.5px;font-weight:700;letter-spacing:.04em;background:#EAE6DD;color:#1C1510}
    .pm-cash{background:#E4F0EA;color:#1F6F54}
    .pm-bkash{background:#FCE4EF;color:#D02A77}
    .closing-box{margin-top:6px;border:1px solid #8D6F57;border-top:2px solid #C8A96E;padding:5px 9px;background:#FBF8F3}
    .closing-row{display:flex;justify-content:space-between;align-items:center;padding:1.5px 0;font-size:8px;color:#1C1510}
    .closing-row.total{border-top:1px solid #C8A96E;margin-top:2px;padding-top:3px;font-weight:700}
    .closing-row.token{color:#8D6F57}
    .closing-row.final{border-top:1px solid #C8A96E;border-bottom:2px solid #C8A96E;margin-top:3px;padding:4px 0;font-size:11px;font-weight:800;color:#1C1510}
    .footer{margin-top:5px;padding-top:3px;border-top:1px solid #8D6F57;display:flex;justify-content:space-between;align-items:center}
    .total-row{font-size:8px;font-weight:700;color:#1C1510}
    .footer-note{font-size:6.5px;color:#8D6F57;letter-spacing:.04em}
    .trend-pos{color:#1F6F54;font-weight:700}
    .trend-neg{color:#950101;font-weight:700}
    col.c-g{width:18%} col.c-r{width:6%} col.c-d{width:13%} col.c-n{width:10%}
    col.c-pm{width:9%}
  </style></head><body>
  <div class="header"><div><div class="hotel-name">Hotel <em>Fountain</em></div><div class="hotel-sub">Billing &amp; Invoices Report</div></div><div class="report-title"><h2>Period: ${filterLabel}</h2><div class="meta">Generated: ${now}</div></div></div>
  <div class="stats">
    <div class="stat-box hi"><div class="lbl">${filterLabel==='Today'?"Today's Total":filterLabel+' Total'}</div><div class="val">${fmt(periodTotal)}</div></div>
    <div class="stat-box cash"><div class="lbl">Cash Total</div><div class="val">${fmt(cashTotal)}</div></div>
    <div class="stat-box bkash"><div class="lbl">Bkash Total</div><div class="val">${fmt(bkashTotal)}</div></div>
    <div class="stat-box out"><div class="lbl">Outstanding Due</div><div class="val">${fmt(outstanding)}</div></div>
  </div>
  <div class="sec-hdr">Collected Transactions — ${esc(filterLabel)}</div>
  <table>
    <colgroup><col style="width:19%"/><col style="width:7%"/><col style="width:14%"/><col style="width:11%"/><col style="width:10%"/><col style="width:11%"/><col style="width:13%"/><col style="width:15%"/></colgroup>
    <thead><tr>
      <th>Guest Name</th><th>Room</th><th>Check-In / Out</th>
      <th class="num">Bill Total</th><th class="num">Paid</th><th class="num">Balance Due</th>
      <th>Payment Method</th><th class="num">Collected</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="8" style="text-align:center;padding:14px;color:#aaa">No transactions</td></tr>'}</tbody>
  </table>
  ${(()=>{
    const dl = (duesList||[]).filter(d=>+d.balance_due>0)
    if(!dl.length) return ''
    const totDue = dl.reduce((a,d)=>a+(+d.balance_due||0),0)
    const totPaid = dl.reduce((a,d)=>a+(+d.paid||0),0)
    const totBill = dl.reduce((a,d)=>a+(+d.bill_total||0),0)
    const dRows = dl.map(d=>`<tr>
      <td>${esc(d.guest_name||'—')}</td>
      <td>${esc(d.room_number||'—')}</td>
      <td class="mono">${short(d.check_in)}<br/><span class="muted">→ ${short(d.check_out)}</span></td>
      <td class="num">${fmt(d.bill_total)}</td>
      <td class="num pos">${fmt(d.paid)}</td>
      <td class="num due">${fmt(d.balance_due)}</td>
      <td><span class="pm" style="background:#FBE9E9;color:#950101">${esc(d.status||'PENDING')}</span></td>
    </tr>`).join('')
    return `
  <div class="sec-hdr due">⚠ Pending Dues — Outstanding Balance (${dl.length} guest${dl.length!==1?'s':''})</div>
  <table class="due-table">
    <colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:16%"/><col style="width:13%"/><col style="width:13%"/><col style="width:14%"/><col style="width:14%"/></colgroup>
    <thead><tr>
      <th>Guest Name</th><th>Room</th><th>Check-In / Out</th>
      <th class="num">Bill Total</th><th class="num">Paid</th><th class="num">Balance Due</th><th>Status</th>
    </tr></thead>
    <tbody>${dRows}</tbody>
    <tfoot><tr>
      <td colspan="3">Total Outstanding · ${dl.length} guest${dl.length!==1?'s':''}</td>
      <td class="num">${fmt(totBill)}</td>
      <td class="num pos">${fmt(totPaid)}</td>
      <td class="num due">${fmt(totDue)}</td>
      <td></td>
    </tr></tfoot>
  </table>`
  })()}
  <div class="closing-box">
    <div class="closing-row total"><span>${filterLabel} Total Collection</span><span class="trend-pos">${fmt(periodTotal)}</span></div>
    <div class="closing-row"><span>Cash Collected</span><span class="trend-pos">${fmt(cashTotal)}</span></div>
    <div class="closing-row"><span>Bkash Collected</span><span class="trend-pos">${fmt(bkashTotal)}</span></div>
    <div class="closing-row token"><span>Token Amount (Deducted)</span><span>− ${fmt(tkn)}</span></div>
    <div class="closing-row final"><span>Closing Balance</span><span>${fmt(closingBalance)}</span></div>
  </div>
  <div class="footer"><div class="total-row">${filterLabel}: ${fmt(periodTotal)} · ${(enriched||[]).length} transaction${(enriched||[]).length!==1?'s':''}</div><div class="footer-note">${_HNAME} CRM · Lumea PMS · Confidential</div></div>
  </body></html>`
  printPDF(content)
}

function printInvoice(grp, res, tTotal, tPaid, tDue, byType, bill, guest) {
  const now = new Date().toLocaleString('en-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})
  const invoiceNo = 'INV-' + (res?.id?String(res.id).slice(-8):Date.now().toString().slice(-8))
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  const nights = bill?.nights || (res?nightsCount(res.check_in,res.check_out):0) || 1
  const perRoom = bill?.perRoom || []
  const topFolios = bill?.topFolios || []
  const discount = bill?.discount || 0
  const roomCharge = bill?.roomCharge || 0
  const extras = bill?.extras || 0
  const subtotal = bill?.sub || (tTotal + discount)
  const total = (bill?.total != null) ? bill.total : tTotal
  const paid = (bill?.paid != null) ? bill.paid : tPaid
  const due = (bill?.due != null) ? bill.due : tDue

  const perRoomHtml = perRoom.length > 0 ? perRoom.map(p => `
    <tr style="background:#1C1510">
      <td colspan="4" style="padding:8px 12px;color:#C8A96E;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-top:2px solid #C8A96E">
        Room ${esc(p.room_number)} · ${esc(p.category)}
      </td>
    </tr>
    <tr style="background:#FBF8F3">
      <td style="padding:6px 12px;font-size:9px;color:#8D6F57">${fmtDate(res?.check_in)} → ${fmtDate(res?.check_out)}</td>
      <td style="padding:6px 12px;font-size:9px;color:#1C1510">Room charge · ${nights} night${nights!==1?'s':''} × ৳${Number(p.rate).toLocaleString()}</td>
      <td style="padding:6px 12px;font-size:9px;color:#1C1510;text-align:right">৳${Number(p.rate).toLocaleString()}/n</td>
      <td style="padding:6px 12px;text-align:right;font-size:10px;font-weight:600;color:#1C1510;font-family:monospace">৳${Number(p.roomSubtotal).toLocaleString()}</td>
    </tr>
    ${(p.folios||[]).map((f,i)=>`
      <tr style="background:${i%2===0?'#fff':'#FBF8F3'}">
        <td style="padding:6px 12px;font-size:9px;color:#8D6F57">${esc(String(f.created_at||'').slice(0,10))}</td>
        <td style="padding:6px 12px;font-size:9px;color:#1C1510">${esc(f.description||f.category||'Extra')}</td>
        <td style="padding:6px 12px;font-size:9px;color:#8D6F57;text-align:right">${esc(f.category||'—')}</td>
        <td style="padding:6px 12px;text-align:right;font-size:10px;font-weight:600;color:#1C1510;font-family:monospace">৳${Number(f.amount||0).toLocaleString()}</td>
      </tr>
    `).join('')}
    ${p.extras>0?`<tr style="background:rgba(200,169,110,.1)"><td colspan="3" style="padding:5px 12px;font-size:9px;color:#8D6F57;font-style:italic">Room ${esc(p.room_number)} subtotal</td><td style="padding:5px 12px;text-align:right;font-size:10px;font-weight:700;color:#C8A96E;font-family:monospace">৳${Number(p.subtotal).toLocaleString()}</td></tr>`:''}
  `).join('') : ''

  const topFoliosHtml = topFolios.length > 0 ? `
    <tr style="background:#1C1510">
      <td colspan="4" style="padding:8px 12px;color:#58A6FF;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-top:2px solid #58A6FF">
        Additional Charges
      </td>
    </tr>
    ${topFolios.map((f,i)=>`
      <tr style="background:${i%2===0?'#fff':'#FBF8F3'}">
        <td style="padding:6px 12px;font-size:9px;color:#8D6F57">${esc(String(f.created_at||'').slice(0,10))}</td>
        <td style="padding:6px 12px;font-size:9px;color:#1C1510">${esc(f.description||f.category||'Extra')}</td>
        <td style="padding:6px 12px;font-size:9px;color:#8D6F57;text-align:right">${esc(f.category||'—')}</td>
        <td style="padding:6px 12px;text-align:right;font-size:10px;font-weight:600;color:#1C1510;font-family:monospace">৳${Number(f.amount||0).toLocaleString()}</td>
      </tr>
    `).join('')}
  ` : ''

  const fallbackTxHtml = (!perRoom.length && !topFolios.length) ? (grp.txs||[]).filter(t=>t.type!=='Balance Carried Forward').map((t,i)=>`
    <tr style="background:${i%2===0?'#fff':'#FBF8F3'}">
      <td style="padding:7px 12px;font-size:9px;color:#8D6F57">${esc(t.fiscal_day||'—')}</td>
      <td style="padding:7px 12px;font-size:9px;color:#1C1510">${esc(t.type||'Charge')}</td>
      <td style="padding:7px 12px;font-size:9px;color:#8D6F57;text-align:right">${esc(t.room_number||'')}</td>
      <td style="padding:7px 12px;text-align:right;font-size:10px;font-weight:600;color:#1C1510;font-family:monospace">৳${Number(t.amount||0).toLocaleString()}</td>
    </tr>`).join('') : ''

  const pmtRows = Object.entries(byType||{}).map(([tp,amt])=>`
    <tr>
      <td colspan="3" style="padding:6px 12px;font-size:9px;color:#8D6F57;letter-spacing:.04em">${esc(tp)}</td>
      <td style="padding:6px 12px;text-align:right;font-size:10px;color:#1C1510;font-weight:600;font-family:monospace">৳${Number(amt).toLocaleString()}</td>
    </tr>`).join('')

  const allRooms = (res?.room_ids || [grp.room_number]).filter(Boolean).join(', ')
  const guestDetail = guest ? `
    ${guest.phone?`<div style="font-size:9px;color:#8D6F57;margin-top:2px">📞 ${esc(guest.phone)}</div>`:''}
    ${guest.email?`<div style="font-size:9px;color:#8D6F57;margin-top:2px">✉ ${esc(guest.email)}</div>`:''}
    ${guest.id_type||guest.id_card?`<div style="font-size:9px;color:#8D6F57;margin-top:2px">🆔 ${esc(guest.id_type||'')} ${esc(guest.id_number||guest.id_card||'')}</div>`:''}
    ${guest.city?`<div style="font-size:9px;color:#8D6F57;margin-top:2px">📍 ${esc(guest.city)}</div>`:''}
  ` : ''

  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoice — ${esc(grp.guest_name||'Guest')}</title>
  <style>
    @page{size:A4 portrait;margin:10mm 12mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;background:#fff;color:#1C1510;font-size:10px;line-height:1.5}
    table{width:100%;border-collapse:collapse}
    .serif{font-family:Georgia,'Times New Roman',serif}
  </style></head><body>
  <!-- ══ HEADER ══ -->
  <table style="margin-bottom:18px">
    <tr>
      <td width="52%" style="background:#1C1510;padding:20px 22px;vertical-align:middle">
        <div class="serif" style="font-size:24px;font-weight:800;color:#C8A96E;letter-spacing:.02em">${_HNAME}</div>
        <div style="font-size:7.5px;color:rgba(255,255,255,.5);letter-spacing:.22em;text-transform:uppercase;margin-top:6px">${_TAGLINE}</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:10px">${_HADDR}</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:2px">WhatsApp ${_HWAPP} · ${_HEMAIL}</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:2px">${_HSITE}</div>
        <div style="font-size:6.5px;color:rgba(200,169,110,.45);margin-top:10px;letter-spacing:.08em">MANAGEMENT CRM · POWERED BY LUMEA</div>
      </td>
      <td width="48%" style="padding:20px 0 20px 14px;vertical-align:top;text-align:right;border-bottom:3px solid #1C1510">
        <div style="font-size:18px;font-weight:800;color:#1C1510;letter-spacing:.22em;margin-bottom:10px">INVOICE</div>
        <div style="font-size:7.5px;color:#8D6F57;letter-spacing:.16em;text-transform:uppercase;margin-bottom:2px">Invoice No.</div>
        <div style="font-size:13px;font-weight:700;color:#1C1510;margin-bottom:8px;font-family:monospace">${esc(invoiceNo)}</div>
        <div style="font-size:7.5px;color:#8D6F57;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">Issued</div>
        <div style="font-size:9px;color:#1C1510;margin-bottom:10px">${esc(now)}</div>
        <div style="font-size:7.5px;color:#8D6F57;letter-spacing:.1em;text-transform:uppercase">Amount Due</div>
        <div class="serif" style="font-size:26px;font-weight:800;color:${due>0?'#C8A96E':'#3FB950'};font-family:monospace">${due>0?'৳'+Number(due).toLocaleString():'PAID'}</div>
      </td>
    </tr>
  </table>

  <!-- ══ BILLED TO / STAY DETAILS ══ -->
  <table style="margin-bottom:14px">
    <tr>
      <td width="55%" style="padding:10px 12px;border:1px solid #8D6F57;vertical-align:top">
        <div style="font-size:7.5px;color:#8D6F57;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">Billed To</div>
        <div style="font-size:14px;font-weight:700;color:#1C1510">${esc(grp.guest_name||'—')}</div>
        ${guestDetail}
      </td>
      <td width="2%"></td>
      <td width="43%" style="padding:10px 12px;border:1px solid #8D6F57;vertical-align:top">
        <div style="font-size:7.5px;color:#8D6F57;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">Stay Details</div>
        <div style="font-size:10px;color:#1C1510;margin-bottom:2px"><strong>Room${(res?.room_ids||[]).length>1?'s':''}:</strong> ${esc(allRooms||'—')}</div>
        <div style="font-size:9px;color:#8D6F57;margin-bottom:2px">Check-In: ${res?fmtDate(res.check_in):'—'}</div>
        <div style="font-size:9px;color:#8D6F57;margin-bottom:2px">Check-Out: ${res?fmtDate(res.check_out):'—'}</div>
        <div style="font-size:9px;color:#8D6F57;margin-bottom:2px">Nights: ${nights}</div>
        <div style="font-size:9px;color:#8D6F57">Status: ${esc(res?.status||'—')}</div>
      </td>
    </tr>
  </table>

  <!-- ══ CHARGES (Per-Room Breakdown) ══ -->
  <table style="margin-bottom:0;border:1px solid #1C1510">
    <thead>
      <tr style="background:#1C1510">
        <th style="padding:10px 12px;text-align:left;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#C8A96E;font-weight:700;width:18%">Date</th>
        <th style="padding:10px 12px;text-align:left;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#C8A96E;font-weight:700">Description</th>
        <th style="padding:10px 12px;text-align:right;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#C8A96E;font-weight:700;width:16%">Rate / Cat.</th>
        <th style="padding:10px 12px;text-align:right;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#C8A96E;font-weight:700;width:18%">Amount (BDT)</th>
      </tr>
    </thead>
    <tbody>
      ${perRoomHtml||fallbackTxHtml||'<tr><td colspan="4" style="padding:20px;text-align:center;color:#8D6F57">No charges recorded</td></tr>'}
      ${topFoliosHtml}
    </tbody>
  </table>

  <!-- ══ TOTALS PANEL ══ -->
  <table style="margin-top:0">
    <tr>
      <td width="50%" style="padding:10px 12px;vertical-align:top">
        ${pmtRows?`
          <div style="font-size:8px;color:#8D6F57;letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px;border-bottom:1px solid #8D6F57;padding-bottom:3px">Payments Received</div>
          <table>${pmtRows}</table>
        `:''}
      </td>
      <td width="50%" style="padding:10px 12px;vertical-align:top;background:#FBF8F3;border:1px solid #C8A96E">
        <table>
          <tr><td style="padding:4px 0;font-size:9.5px;color:#8D6F57">Room Charges</td><td style="padding:4px 0;text-align:right;font-size:10px;font-family:monospace;color:#1C1510">৳${Number(roomCharge).toLocaleString()}</td></tr>
          ${extras>0?`<tr><td style="padding:4px 0;font-size:9.5px;color:#8D6F57">Extra Charges (F&amp;B etc.)</td><td style="padding:4px 0;text-align:right;font-size:10px;font-family:monospace;color:#1C1510">৳${Number(extras).toLocaleString()}</td></tr>`:''}
          <tr><td style="padding:4px 0;border-top:1px solid #C8A96E;font-size:10px;font-weight:700;color:#1C1510">Subtotal</td><td style="padding:4px 0;border-top:1px solid #C8A96E;text-align:right;font-size:11px;font-weight:700;font-family:monospace;color:#1C1510">৳${Number(subtotal).toLocaleString()}</td></tr>
          ${discount>0?`<tr><td style="padding:4px 0;font-size:9.5px;color:#3FB950">Discount Applied</td><td style="padding:4px 0;text-align:right;font-size:10px;font-family:monospace;color:#3FB950">− ৳${Number(discount).toLocaleString()}</td></tr>`:''}
          <tr><td style="padding:6px 0;border-top:2px solid #1C1510;font-size:11px;font-weight:800;color:#1C1510">TOTAL</td><td style="padding:6px 0;border-top:2px solid #1C1510;text-align:right;font-size:13px;font-weight:800;font-family:monospace;color:#1C1510">৳${Number(total).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0;font-size:9.5px;color:#3FB950">Paid</td><td style="padding:4px 0;text-align:right;font-size:10px;font-family:monospace;color:#3FB950">৳${Number(paid).toLocaleString()}</td></tr>
          <tr><td style="padding:10px 0 4px;border-top:1px solid #C8A96E;font-size:12px;font-weight:800;color:${due>0?'#E05C7A':'#3FB950'}">${due>0?'BALANCE DUE':'PAID IN FULL'}</td><td style="padding:10px 0 4px;border-top:1px solid #C8A96E;text-align:right;font-size:16px;font-weight:800;font-family:monospace;color:${due>0?'#E05C7A':'#3FB950'}">৳${Number(due).toLocaleString()}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  ${res?.special_requests?`<div style="margin-top:12px;padding:10px 12px;border-left:3px solid #C8A96E;background:#FBF8F3;font-size:9px;color:#8D6F57"><strong style="color:#1C1510">Special Requests:</strong> ${esc(res.special_requests)}</div>`:''}

  <!-- ══ FOOTER ══ -->
  <div style="margin-top:20px;padding:14px 0 0;border-top:2px solid #1C1510">
    <table>
      <tr>
        <td width="60%" style="font-size:7.5px;color:#8D6F57;letter-spacing:.1em;text-transform:uppercase">${_HNAME} · Lumea PMS · Confidential</td>
        <td width="40%" style="font-size:7.5px;color:#8D6F57;text-align:right">Computer-generated invoice — no signature required</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:6px;font-size:8px;color:#8D6F57;text-align:center;font-style:italic">Thank you for choosing ${_HNAME}. We look forward to welcoming you again.</td>
      </tr>
    </table>
  </div>
  </body></html>`
  printPDF(content)
}

function BillingPage({transactions,reservations,toast,reload,currentUser,rooms,guests,businessDate}) {
  const [filter,setFilter]=useState('TODAY')
  const [calDate,setCalDate]=useState('')
  const [hSettings,setHSettings]=useState({vat:'0',svc:'0'})
  useEffect(()=>{
    db('hotel_settings',`?tenant_id=eq.${TENANT}&select=key,value`).then(rows=>{
      if(!Array.isArray(rows)) return
      const m={};rows.forEach(r=>{m[r.key]=r.value})
      setHSettings({vat:m.vat_rate||'0',svc:m.service_charge||'0'})
    }).catch(()=>{})
  },[])
  const [search,setSearch]=useState('')
  const [showAdd,setShowAdd]=useState(false)
  const [billingRes,setBillingRes]=useState(null)
  const [showBillDetail,setShowBillDetail]=useState(false)
  const [detailRes,setDetailRes]=useState(null)
  const [foliosMap,setFoliosMap]=useState({})
  const [loadingFolios,setLoadingFolios]=useState(false)
  const [tokenAmt,setTokenAmt]=useState('')
  const [savedToken,setSavedToken]=useState(0)
  const [tokenSaving,setTokenSaving]=useState(false)
  const today=businessDate||todayStr(), month=today.slice(0,7)

  const _wallToday = todayStr()
  const _txWallDay = t => t.fiscal_day  // kept for any downstream callers expecting the helper
  const todayT = transactions.filter(t => t.fiscal_day === today);
  const activeLedgerTx = todayT.filter(t=>{
    if(t.type==='Balance Carried Forward'){
      const res=reservations.find(r=>(r.room_ids||[]).some(id=>String(id)===String(t.room_number))||String(r.room_number)===String(t.room_number))
      if(res?.status==='CHECKED_OUT'){
        const due=Math.max(0,(+(res.total_amount||0))-(+(res.discount_amount||res.discount||0))-(+(res.paid_amount||0)))
        if(due<=0) return false // ghost — zero balance checked-out carry-forward
      }
      return true
    }
    return true
  })
  const monthT = transactions.filter(t=>t.fiscal_day?.startsWith(month));
  const calT = calDate ? transactions.filter(t=>t.fiscal_day===calDate) : [];

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

  const _arr = v => {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') { try { const p=JSON.parse(v); return Array.isArray(p)?p:[v] } catch { return [v] } }
    if (v == null) return []
    return [v]
  }
  const getGN=r=>{
    if(!r) return '—'
    if(r.guest_name) return r.guest_name
    const gid=String(_arr(r.guest_ids).concat(r.guest_id?[r.guest_id]:[]).filter(Boolean)[0]||'')
    const g=guests?.find(g=>String(g.id)===gid)
    return g?g.name:(gid?`ID:${gid}`:'—')
  }
  const getRoom=r=>{
    if(!r) return '—'
    const rooms=_arr(r.room_ids).concat(r.room_number?[r.room_number]:[])
    return rooms.filter(Boolean).join(', ')||'—'
  }

  // _isRealPayment, _bizDayTotalFn — now module-scope; aliases for local use
  const _isPayVehicle = t => _isRealPayment(t)
  const _bizDayTotal = _bizDayTotalFn
  // todayRevenue: mirrors the ledger table's unifiedGroups logic exactly.
  // Part 1: reservations matched via activeLedgerTx (same dual-match: room_ids UUID OR room_number string + guest name)
  // Part 2: reservations with outstanding balance (dueRes equivalent) not already counted.
  // Result = exact sum of the PAID column shown in today's ledger table.
  const todayRevenue = (() => {
    const seen = new Set()
    let total = 0
    // Part 1 — same reservation lookup the table uses
    activeLedgerTx.forEach(t => {
      const guestId = guests?.find(g => g.name === t.guest_name)?.id
      const res = reservations?.find(r => {
        const roomMatch = (r.room_ids||[]).some(id => String(id) === String(t.room_number)) || String(r.room_number) === String(t.room_number)
        const nameMatch = !guestId || (r.guest_ids||[]).includes(guestId) || r.guest_name === t.guest_name
        return roomMatch && nameMatch
      }) || reservations?.find(r => (r.room_ids||[]).some(id => String(id) === String(t.room_number)) || String(r.room_number) === String(t.room_number))
      if (res && !seen.has(res.id)) {
        seen.add(res.id)
        total += computeBill(res)?.paid || 0
      }
    })
    // Part 2 — outstanding balance reservations not caught in Part 1 (balance > 0 only)
    const _rDue = r => Math.max(0, (+r.total_amount||0) - (+r.discount_amount||+r.discount||0) - (+r.paid_amount||0))
    reservations.filter(r => (r.status==='CHECKED_IN'||r.status==='CHECKED_OUT') && _rDue(r)>0).forEach(r => {
      if (!r?.id || seen.has(r.id)) return
      seen.add(r.id)
      total += computeBill(r)?.paid || 0
    })
    return total
  })()
  const monthRevenue = _bizDayTotal(monthT)

  function computeBill(r) {
    const roomNos=(r.room_ids||[r.room_number]).filter(Boolean)
    const nights=nightsCount(r.check_in,r.check_out)||1
    const allFolios=[
      ...(foliosMap[r.id]||[]),
      ...roomNos.flatMap(rn=>(foliosMap[rn]||[]).filter(f=>!f.reservation_id||f.reservation_id===r.id))
    ].filter((f,i,arr)=>arr.findIndex(x=>x.id===f.id)===i)
    const perRoom=roomNos.map(rn=>{
      const room=rooms?.find(rm=>String(rm.room_number)===String(rn))
      const rate=+room?.price||+r.rate_per_night||0
      const roomSubtotal=rate*nights
      const roomFolios=allFolios.filter(f=>String(f.room_number)===String(rn))
      const roomExtras=roomFolios.reduce((a,f)=>a+(+f.amount||0),0)
      return {room_number:rn,category:room?.category||'—',rate,nights,roomSubtotal,extras:roomExtras,folios:roomFolios,subtotal:roomSubtotal+roomExtras}
    })
    const roomCharge=perRoom.reduce((a,p)=>a+p.roomSubtotal,0)
    const topFolios=allFolios.filter(f=>!f.room_number||!roomNos.map(String).includes(String(f.room_number)))
    const topExtras=topFolios.reduce((a,f)=>a+(+f.amount||0),0)
    const extras=perRoom.reduce((a,p)=>a+p.extras,0)+topExtras
    const folios=[...perRoom.flatMap(p=>p.folios.map(f=>({...f,__room:p.room_number}))),...topFolios]
    const sub=roomCharge+extras
    const vatPct=0, svcPct=0, tax=0, svc=0
    const discount=+r.discount_amount||+r.discount||0
    const canonical=+r.total_amount||0
    const rawTotal = canonical>0 ? canonical + extras : (sub>0 ? sub : 0)
    const total=Math.max(0,rawTotal-discount)
    const paid=+r.paid_amount||0
    const due=Math.max(0,total-paid)
    const roomRate=perRoom[0]?.rate||0
    return {roomCharge,extras,sub,tax,svc,discount,total,paid,due,folios,nights,roomRate,vatPct,svcPct,perRoom,topFolios}
  }

  const _resDue = r => Math.max(0, (+r.total_amount||0) - (+r.discount_amount||+r.discount||0) - (+r.paid_amount||0))
  const outstanding = reservations
    .filter(r => r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT')
    .reduce((a, r) => a + _resDue(r), 0)
  const dueRes = reservations.filter(r => {
    if (r.status !== 'CHECKED_IN' && r.status !== 'CHECKED_OUT') return false
    return _resDue(r) > 0
  })
  // Use computeBill.due (not _resDue) so folio extras (HALF DAY CHARGE, etc.)
  // are included in the outstanding check — _resDue only reads total_amount which
  // may lag behind folios added after the reservation was created.
  const _billDue = r => (computeBill(r)?.due || 0)
  const activeRes = reservations.filter(r => {
    if (r.status === 'CHECKED_IN') return true
    if (r.status === 'CHECKED_OUT') {
      if (_billDue(r) > 0) return true
      // Show recently settled checkouts (≤3 days) for invoice access
      try {
        const co = new Date(r.check_out)
        const bd = new Date(businessDate || todayStr())
        return (bd - co) / 86400000 <= 3
      } catch { return false }
    }
    return false
  })

  const filteredTx=filter==='TODAY'?todayT:filter==='MONTH'?monthT:filter==='DATE'?calT:transactions

  async function saveToken() {
    const a=+tokenAmt
    if(!a||a<0){toast('Enter valid token amount','error');return}
    setTokenSaving(true)
    try{
      await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({key:'daily_token_amount',value:String(a),tenant_id:TENANT})
      })
      setSavedToken(a)
      toast(`Token amount ${BDT(a)} saved`)
    }catch(e){toast(e.message,'error')}
    finally{setTokenSaving(false)}
  }

  async function doClosingComplete() {
    const _wallToday = todayStr()
    const _nextDay = (()=>{
      const d=new Date(today); d.setDate(d.getDate()+1)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    })()
    if (_nextDay > _wallToday) {
      toast(`Closing already complete for ${_wallToday}. BIZ DAY is ${today} — cannot advance further.`,'error')
      return
    }
    if (!window.confirm(`Close BIZ DAY ${today} and advance to ${_nextDay}?\n\nThis is a one-way operation. Verify all payments are recorded.`)) return
    const a=+tokenAmt;
    if (a && a>=0 && a !== savedToken) {
      try {
        await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
          method:'POST',
          headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
          body:JSON.stringify({key:'daily_token_amount',value:String(a),tenant_id:TENANT})
        });
        setSavedToken(a);
      } catch {}
    }
    const todayList=transactions.filter(t=>t.fiscal_day===today && t.type!=='Balance Carried Forward')
    const totalAmt=todayList.reduce((acc,t)=>acc+(+t.amount||0),0)
    const tokenAmount=a||savedToken||0
    const closingAmt=totalAmt-tokenAmount
    const now=new Date().toLocaleString('en-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})

    const duesCarried=dueRes.map(r=>{
      const room=(r.room_ids||[r.room_number]).filter(Boolean).join(', ')||'—'
      const gname=getGN(r)
      const total=+r.total_amount||0
      const discount=+r.discount_amount||+r.discount||0
      const paid=+r.paid_amount||0
      const due=Math.max(0,total-discount-paid)
      return {gname,room,total,discount,paid,due,check_in:r.check_in,check_out:r.check_out,resId:r.id}
    })
    const totalDue=duesCarried.reduce((a,d)=>a+d.due,0)

    const txRows=todayList.map(t=>`<tr><td>${t.fiscal_day||'—'}</td><td>${t.guest_name||'—'}</td><td>${t.room_number||'—'}</td><td>${t.type||'Payment'}</td><td style="text-align:right;font-weight:600">৳${Number(t.amount||0).toLocaleString()}</td></tr>`).join('')
    const dueRows=duesCarried.length>0?`
      <h3 style="margin:20px 0 8px;font-size:13px;color:#E05C7A;border-bottom:1px solid #f0c0ca;padding-bottom:4px">⚠ Outstanding Dues — Carried to Next Day</h3>
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
.report-title{text-align:right}.report-title h2{font-size:13px;font-weight:700}.report-title .meta{font-size:8px;color:#444;margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:6px}
thead tr{background:#000;color:#fff}
thead th{padding:5px 7px;text-align:left;font-size:8px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
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
<div class="header"><div><div class="hotel-name">Hotel <em>Fountain</em></div><div class="hotel-sub">Daily Closing Report</div></div><div class="report-title"><h2>Closing: ${today}</h2><div class="meta">Generated: ${now}</div></div></div>
<table><thead><tr><th>Date</th><th>Guest</th><th>Room</th><th>Payment Type</th><th style="text-align:right">Amount (BDT)</th></tr></thead><tbody>${txRows||'<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa">No transactions today</td></tr>'}</tbody></table>
${dueRows}
<div class="closing-box">
  <div class="closing-row total"><span>Total Paid Amount</span><span>৳${totalAmt.toLocaleString()}</span></div>
  <div class="closing-row"><span>Token Amount</span><span>− ৳${tokenAmount.toLocaleString()}</span></div>
  ${totalDue>0?`<div class="closing-row due"><span>Outstanding Dues Carried Forward</span><span>৳${totalDue.toLocaleString()}</span></div>`:''}
  <div class="closing-row final"><span>Closing Balance</span><span>৳${closingAmt.toLocaleString()}</span></div>
</div>
<div className="footer"><span>{_HNAME} CRM · Lumea PMS · Confidential</span><span>${todayList.length} transaction${todayList.length!==1?'s':''} · ${duesCarried.length} pending due${duesCarried.length!==1?'s':''}</span></div>
</body></html>`

    printPDF(content).then(async()=>{
      const d=new Date(today); d.setDate(d.getDate()+1)
      const nextDay=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      try{
        const existingFWD = transactions.filter(t=>t.fiscal_day===nextDay && t.type==='Balance Carried Forward');
        if(existingFWD.length > 0) {
          await Promise.all(existingFWD.map(t => dbDelete('transactions', t.id)));
        }
        
        if(duesCarried.length > 0) {
          await Promise.all(duesCarried.map(d=>(
            dbPost('transactions', {
              tenant_id: TENANT,
              fiscal_day: nextDay,
              guest_name: d.gname,
              room_number: d.room,
              amount: d.due,
              type: 'Balance Carried Forward',
              reservation_id: d.resId||null
            })
          )))
        }

        await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
          method:'POST',
          headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
          body:JSON.stringify({key:'active_fiscal_day',value:nextDay,tenant_id:TENANT})
        })
        toast(`✓ Day closed · Fiscal day → ${nextDay}`,'info')
        reload()
      }catch(e){
        toast('Report open — could not advance fiscal day: '+e.message,'error')
      }
    })
  }

  function downloadPDF() {
    const realList = filteredTx.filter(t => t.type !== 'Balance Carried Forward')
    const parsePM = tx => {
      const s = String(tx?.type||'')
      const m = s.match(/\(([^)]+)\)/)
      if (m) return m[1].trim()
      if (/cash/i.test(s)) return 'Cash'
      if (/bkash/i.test(s)) return 'Bkash'
      if (/nagad/i.test(s)) return 'Nagad'
      if (/card/i.test(s)) return 'Card'
      return s || '—'
    }
    const isPayment = tx => {
      const t = String(tx?.type||'')
      if (t === 'Balance Carried Forward') return false
      return /payment|cash|bkash|nagad|card|advance|token/i.test(t) || (+tx.amount||0) > 0
    }
    const periodTotal = realList.reduce((a,t)=>a+(+t.amount||0),0)
    const cashTotal   = realList.filter(t => /cash/i.test(t.type||'')).reduce((a,t)=>a+(+t.amount||0),0)
    const bkashTotal  = realList.filter(t => /bkash/i.test(t.type||'')).reduce((a,t)=>a+(+t.amount||0),0)
    const findRes = tx => {
      const rid = tx.reservation_id || tx.res_id
      if (rid) return reservations.find(r => String(r.id) === String(rid))
      return reservations.find(r =>
        (r.room_ids||[r.room_number]).map(String).includes(String(tx.room_number)) &&
        tx.fiscal_day >= (r.check_in||'').slice(0,10) &&
        tx.fiscal_day <= (r.check_out||'9999-12-31').slice(0,10)
      )
    }
    const enriched = realList.map(tx => {
      const res = findRes(tx)
      const bill = res ? computeBill(res) : null
      return {
        guest_name: tx.guest_name || (res ? getGN(res) : '—'),
        room_number: tx.room_number || (res ? (res.room_ids||[res.room_number]).filter(Boolean).join(',') : '—'),
        check_in: res?.check_in || '',
        check_out: res?.check_out || '',
        bill_total: bill ? ((+res.total_amount||0) || bill.sub) : 0, // FIX (Bug #1): canonical total wins
        discount: bill ? bill.discount : (res ? (+res.discount_amount||+res.discount||0) : 0),
        paid: bill ? bill.paid : (res ? (+res.paid_amount||0) : 0),
        balance_due: bill ? bill.due : (res ? Math.max(0,(+res.total_amount||0)-(+res.discount_amount||+res.discount||0)-(+res.paid_amount||0)) : 0),
        payment_method: parsePM(tx),
        collected_amount: +tx.amount||0,
        fiscal_day: tx.fiscal_day
      }
    })
    const duesList = (dueRes||[]).map(r => {
      const bill = computeBill(r)
      return {
        guest_name: getGN(r),
        room_number: (r.room_ids||[r.room_number]).filter(Boolean).join(',') || '—',
        check_in: r.check_in || '',
        check_out: r.check_out || '',
        bill_total: ((+r.total_amount||0) || bill?.sub || 0),
        paid: bill ? bill.paid : (+r.paid_amount||0),
        balance_due: bill ? bill.due : Math.max(0,(+r.total_amount||0)-(+r.paid_amount||0)),
        status: r.status || ''
      }
    }).filter(d => d.balance_due > 0)
    downloadBillingPDF(enriched, filter, periodTotal, cashTotal, bkashTotal, outstanding, calDate, savedToken, duesList)
  }

  function openDetail(r) {
    setDetailRes(r)
    setShowBillDetail(true)
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat" style={{'--ac':'var(--gold)'}}><div className="stat-ico">💰</div><div className="stat-lbl">{filter==='DATE'&&calDate?(()=>{const [y,m,d]=calDate.split('-');const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${+d}-${mo[+m-1]}-${y}`})():(()=>{const[y,m,d]=(today||todayStr()).split('-');return `${+d}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}-${y}`})()} <span style={{fontSize:9,color:'var(--gold-light)',marginLeft:4,fontFamily:'var(--mono)'}}>BIZ DAY</span></div><div className="stat-val">{BDT(filter==='DATE'?_bizDayTotal(calT):_bizDayTotal(todayT))}</div><div className="stat-sub">{filter==='DATE'?`${calT.filter(_isPayVehicle).length} payments`:`${reservations.filter(r=>r.status==='CHECKED_IN').length} in-house`}</div></div>
        <div className="stat" style={{'--ac':'var(--teal)'}}><div className="stat-ico">📈</div><div className="stat-lbl">This Month</div><div className="stat-val">{BDT(monthRevenue)}</div><div className="stat-sub">{monthT.filter(t=>t.type!=='Balance Carried Forward').length} transactions</div></div>
        <div className="stat" style={{'--ac':'var(--rose)'}}><div className="stat-ico">⚠</div><div className="stat-lbl">Outstanding</div><div className="stat-val">{BDT(outstanding)}</div><div className="stat-sub">In-house balance due</div></div>
      </div>

      {/* Toolbar */}
      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <div className="tabs" style={{marginBottom:0}}>
            {(()=>{const[y,m,d]=(today||todayStr()).split('-');const lbl=`${+d}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}-${y}`;return[['TODAY',lbl],['MONTH','MONTH'],['ALL','ALL']]})().map(([f,lbl])=>(
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
        let list = filter==='TODAY'?activeLedgerTx : filter==='DATE'?calT : filter==='MONTH'?monthT : transactions
        if(search){const q=search.toLowerCase();list=list.filter(t=>t.guest_name?.toLowerCase().includes(q)||t.room_number?.includes(q)||t.type?.toLowerCase().includes(q))}
        const fmtDLabel=d=>{if(!d)return'Today';const[y,m,dy]=d.split('-');const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${+dy}-${mo[+m-1]}-${y}`}
        const label = filter==='TODAY'?fmtDLabel(''):filter==='DATE'?fmtDLabel(calDate):filter==='MONTH'?'This Month':'All Time'
        
        const unifiedGroups = {}

        list.forEach(t=>{
          // reservation_id on the transaction is authoritative — use it first to prevent
          // cross-guest misattribution when two reservations share the same room number.
          const res = (t.reservation_id && reservations?.find(r=>r.id===t.reservation_id))
            || (()=>{
              const guestId = guests?.find(g=>g.name===t.guest_name)?.id
              return reservations?.find(r=>{
                const roomMatch=(r.room_ids||[]).some(id=>String(id)===String(t.room_number))||String(r.room_number)===String(t.room_number)
                const nameMatch=!guestId||(r.guest_ids||[]).includes(guestId)||r.guest_name===t.guest_name
                return roomMatch&&nameMatch
              }) || reservations?.find(r=>(r.room_ids||[]).some(id=>String(id)===String(t.room_number))||String(r.room_number)===String(t.room_number))
            })()
          const key = res ? res.id : `tx|${t.guest_name||''}|${t.room_number||''}|${t.fiscal_day||''}`
          if(!unifiedGroups[key]) unifiedGroups[key] = { txs:[], res, guest_name:t.guest_name, room_number:t.room_number, isDue: false }
          unifiedGroups[key].txs.push(t)
        })

        // Always inject activeRes — guests with outstanding due MUST appear on every
        // view (TODAY, DATE, MONTH, ALL) regardless of search state.
        // Rule: CHECKED_OUT with _resDue > 0 is permanent in the ledger until fully paid.
        // Search filtering is applied at displayList level below.
        activeRes.forEach(r=>{
          try {
            if(!r || !r.id) return
            const key = r.id;
            if(!unifiedGroups[key]) {
              const txFallbackName = transactions?.find(t=>t.reservation_id===r.id)?.guest_name
              const resolvedName = (getGN(r) !== '—' && getGN(r) !== 'Unknown') ? getGN(r) : (txFallbackName || getGN(r))
              unifiedGroups[key] = { txs:[], res: r, guest_name: resolvedName, room_number: getRoom(r), isDue: _billDue(r)>0 }
            } else {
              unifiedGroups[key].isDue = _billDue(r)>0;
              unifiedGroups[key].res = r;
            }
          } catch(e) {
            console.warn('[ledger] skip malformed reservation', r?.id, e)
          }
        })

        // Build base list — business rules:
        //   TODAY  : isDue guests always shown; recently checked-out (≤3 days) shown for
        //            invoice access even if fully settled; ghost BCF-only+settled older rows hidden.
        //   DATE   : all groups shown; activeRes injection means due guests appear even with
        //            no TX on that date. Payment-date rule: a payment TX on date X lands in
        //            calT, so guest ALWAYS appears when filtering DATE=X.
        //   MONTH/ALL: all groups shown.
        // _hasTodayTx: true only if this group has a non-BCF transaction on today's
        // business date. Fully-paid checked-out guests with no today activity are hidden.
        const _hasTodayTx = grp => {
          const bd = businessDate || todayStr()
          return grp.txs.some(t =>
            (t.fiscal_day||'').startsWith(bd) &&
            !/balance carried forward/i.test(t.type||'')
          )
        }
        const _baseList = (filter==='TODAY')
          ? Object.values(unifiedGroups).filter(grp => {
              if (grp.res?.status === 'CHECKED_IN') return true  // in-house always visible (any balance)
              if (grp.isDue) return true                          // outstanding balance always visible
              return _hasTodayTx(grp)                            // has real activity on today's business date
            })
          : Object.values(unifiedGroups)
        // Apply search at group level — covers activeRes-injected guests with no TX on the
        // filtered date (they have name/room but empty txs array).
        const displayList = search
          ? (()=>{ const q=search.toLowerCase(); return _baseList.filter(grp=>grp.guest_name?.toLowerCase().includes(q)||String(grp.room_number||'').includes(q)||grp.txs.some(t=>t.type?.toLowerCase().includes(q)||t.guest_name?.toLowerCase().includes(q))) })()
          : _baseList

        return (
          <div className="card" style={{marginBottom:12}}>
            <div className="card-hd">
              <span className="card-title" style={{fontSize:14}}>Active Billing Ledger — {label}</span>
              <span className="badge bgold">{displayList.length} records</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Bill Total</th><th>Discount</th><th>Paid</th><th>Balance Due</th><th>Payments (Filtered)</th><th>Action</th></tr></thead>
                <tbody>
                  {displayList.length===0?(
                    <tr><td colSpan={10} style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)',fontSize:12}}>No billing activity or dues for this period</td></tr>
                  ):displayList.map(grp=>{
                    const r = grp.res

                    const { total:resTotal, paid:resPaid, due:resDue } = r ? computeBill(r) : { total:0, paid:0, due:0 }

                    const _hasCash = grp.txs.some(t=>/cash|bkash/i.test(t.type||''))
                    const byType={}
                    grp.txs.forEach(t=>{
                      if(_hasCash && /final\s*settlement/i.test(t.type||'')) return
                      const tp=t.type||'Payment'
                      if(!byType[tp]) byType[tp]=0
                      byType[tp]+=(+t.amount||0)
                    })

                    const gname = r ? getGN(r) : (grp.guest_name||'—')
                    const rno = r ? getRoom(r) : (grp.room_number||'—')
                    const chkIn = r ? fmtDate(r.check_in) : (grp.txs[0]?.check_in?fmtDate(grp.txs[0].check_in):'—')
                    const chkOut = r ? fmtDate(r.check_out) : (grp.txs[0]?.check_out?fmtDate(grp.txs[0].check_out):'—')
                    const tTotal = r ? resTotal : (grp.txs[0]?.bill_total?(+grp.txs[0].bill_total):0)
                    // PAID column: TODAY = only actual payment txs (excl charges like Stay Extension / BCF)
                    const _isPaymentTx = t => /payment|settlement|advance|deposit|bkash|bank\s*transfer/i.test(t.type||'') && !/balance carried forward/i.test(t.type||'')
                    const tPaid = (filter==='TODAY')
                      ? grp.txs.filter(_isPaymentTx).reduce((s,t)=>s+(+t.amount||0),0)
                      : (r ? resPaid : 0)
                    const tDue = r ? resDue : 0
                    const tDiscount = r ? (+r.discount_amount||+r.discount||0) : 0

                    return (
                      <tr key={r?r.id:(grp.guest_name+'|'+grp.room_number)}>
                        <td className="xs">{gname}</td>
                        <td><span className="badge bb">{rno}</span></td>
                        <td className="xs muted">{chkIn}</td>
                        <td className="xs muted">{chkOut}</td>
                        <td className="xs gold">{BDT(tTotal)}</td>
                        <td className="xs" style={{color:'var(--amb)'}}>{tDiscount>0?'− '+BDT(tDiscount):'—'}</td>
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
                              const grossTotal = r ? (+r.total_amount||0) : tTotal
                              // Use lifetime paid_amount for the modal — NOT today's tPaid (filtered txs).
                              // tPaid resets to 0 each business day; modal must show what's actually been paid.
                              const modalPaid = r ? (+r.paid_amount||0) : tPaid
                              setBillingRes({_fromRow:true,...(r||{}),room_number:rno,guest_name:gname,_resId:r?.id||null,_total:grossTotal,_paid:modalPaid,_discount:tDiscount})
                              setShowAdd(true)
                            }}>+ Pay</button>
                          )}
                          {currentUser?.role!=='housekeeping'&&(
                            <button className="btn btn-ghost btn-sm" style={{padding:'3px 9px',fontSize:9,marginRight:4}} onClick={()=>{
                              const pInvoiceByType = {...byType};
                              if(r && Object.keys(pInvoiceByType).length===0 && tPaid>0) pInvoiceByType[r.payment_method||'Cash'] = tPaid;
                              const pBill = r ? computeBill(r) : null;
                              const pGuest = r ? guests?.find(g=>String(g.id)===String((r.guest_ids||[])[0])) : null;
                              printInvoice(
                                {guest_name:gname,room_number:rno,txs:grp.txs},
                                r,tTotal,tPaid,tDue,pInvoiceByType,pBill,pGuest
                              )
                            }}>🖨 Print</button>
                          )}
                          {currentUser?.role!=='housekeeping'&&r&&(
                              <button className="btn btn-ghost btn-sm" style={{padding:'3px 9px',fontSize:9,marginRight:4}} onClick={()=>openDetail(r)}>Detail</button>
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
      {showAdd&&<RecordPayModal toast={toast} guests={guests} onClose={()=>{setShowAdd(false);setBillingRes(null)}} reload={()=>{reload();db('folios','?select=*&order=created_at').then(d=>{const map={};(Array.isArray(d)?d:[]).forEach(f=>{const k=f.reservation_id||f.room_number;if(!map[k])map[k]=[];map[k].push(f)});setFoliosMap(map)})}} prefill={billingRes} reservations={reservations} businessDate={businessDate}/>}

      {/* Full Billing Detail Modal — opens from Record Billing button */}
      {showBillDetail&&detailRes&&(()=>{
        const {roomCharge,sub,tax,svc,discount,total,paid,due,folios,nights,roomRate,vatPct,svcPct,perRoom,topFolios}=computeBill(detailRes)
        const allRoomNos=(detailRes.room_ids||[detailRes.room_number]).filter(Boolean)
        const relTx=transactions.filter(t=>allRoomNos.includes(t.room_number)&&t.type!=='Balance Carried Forward')
        return (
        <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.07),rgba(200,169,110,.05))',border:'1px solid rgba(200,169,110,.18)',padding:'12px 14px',marginBottom:14}}>
          <div className="flex fac fjb" style={{flexWrap:'wrap',gap:8}}>
            <div className="flex fac gap3">
              <Av name={detailRes.guest_name} size={40}/>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{detailRes.guest_name}</div>
                <div className="xs muted">Room{allRoomNos.length>1?'s':''} {allRoomNos.join(', ')} · {fmtDate(detailRes.check_in)} → {fmtDate(detailRes.check_out)}</div>
                <div className="xs" style={{color:'var(--amb)',marginTop:2}}>{nights} night{nights!==1?'s':''} · {allRoomNos.length} room{allRoomNos.length!==1?'s':''}</div>
              </div>
            </div>
            <div style={{textAlign:'right',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
              <div><div className="xs muted">Total Due</div><div style={{fontWeight:700,fontSize:22,color:'var(--gold)'}}>{BDT(due)}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={()=>{setShowBillDetail(false);setDetailRes(null)}}>✕ Close</button>
            </div>
          </div>
          {/* Info grid */}
          <div className="g2 mb4">
            {[['Check-In',fmtDate(detailRes.check_in)],['Check-Out',fmtDate(detailRes.check_out)],['Nights',nights],['Payment Method',detailRes.payment_method||'—'],['On-Duty Officer',detailRes.on_duty_officer||'—'],['Status',detailRes.status||'—']].map(([l,v])=>(
              <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
            ))}
          </div>
          {/* Per-Room Breakdown */}
          <div style={{background:'var(--s2)',border:'1px solid var(--br2)',overflow:'hidden',marginBottom:8}}>
            {(perRoom||[]).map((p,i)=>(
              <div key={p.room_number+i} style={{borderBottom:i<perRoom.length-1?'1px solid var(--br2)':'none'}}>
                <div style={{padding:'8px 12px',background:'rgba(200,169,110,.06)',borderBottom:'1px solid var(--br2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,fontWeight:600,color:'var(--gold)'}}>🛏 Room {p.room_number} · {p.category}</span>
                  <span className="xs" style={{color:'var(--gold)'}}>{nights}×{BDT(p.rate)} = {BDT(p.roomSubtotal)}</span>
                </div>
                {p.folios.length===0&&p.extras===0?<div className="xs muted" style={{padding:'6px 14px'}}>No extras charged to this room</div>
                :p.folios.map(f=>(
                  <div key={f.id} className="folio-row" style={{paddingLeft:20}}>
                    <div><span>{f.description}</span><span className="badge bgold" style={{marginLeft:6,fontSize:8}}>{f.category}</span></div>
                    <span className="xs gold">{BDT(f.amount)}</span>
                  </div>
                ))}
                {p.extras>0&&(
                  <div className="folio-row" style={{paddingLeft:20,background:'rgba(200,169,110,.03)',fontWeight:600}}>
                    <span className="xs muted">Room {p.room_number} subtotal</span>
                    <span className="xs gold">{BDT(p.subtotal)}</span>
                  </div>
                )}
              </div>
            ))}
            {(topFolios||[]).length>0&&(
              <div style={{borderTop:'1px solid var(--br2)'}}>
                <div style={{padding:'6px 12px',background:'rgba(88,166,255,.05)',fontSize:10,color:'var(--sky)',letterSpacing:'.1em',textTransform:'uppercase'}}>Unattributed Extras</div>
                {topFolios.map(f=>(
                  <div key={f.id} className="folio-row">
                    <div><span>{f.description}</span><span className="badge bb" style={{marginLeft:6,fontSize:8}}>{f.category}</span></div>
                    <span className="xs gold">{BDT(f.amount)}</span>
                  </div>
                ))}
              </div>
            )}
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
            {discount>0&&<div className="flex fjb xs" style={{marginBottom:3,color:'var(--grn)'}}><span>Discount</span><span>- {BDT(discount)}</span></div>}
            {[[`VAT ${vatPct||15}%`,tax],[`Service Charge ${svcPct||5}%`,svc]].map(([l,v])=>(
              <div key={l} className="flex fjb xs muted" style={{marginBottom:3}}><span>{l}</span><span>{BDT(v)}</span></div>
            ))}
            <div className="divider" style={{margin:'6px 0'}}/>
            <div className="flex fjb" style={{fontSize:13,fontWeight:700,color:'var(--gold)'}}><span>Total</span><span>{BDT(total)}</span></div>
            <div className="flex fjb xs" style={{marginTop:4}}>
              <span style={{color:'var(--grn)'}}>Paid: {BDT(paid)}</span>
              {due>0&&<span style={{color:'var(--rose)',fontWeight:700}}>Due: {BDT(due)}</span>}
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

function RecordPayModal({toast,onClose,reload,prefill,reservations,guests,businessDate}) {
  const fromRow=prefill?._fromRow===true
  const _resDue = r => Math.max(0, (+r.total_amount||0) - (+r.discount_amount||+r.discount||0) - (+r.paid_amount||0))
  const dueResList=(reservations||[]).filter(r=>(r.status==='CHECKED_IN'||r.status==='CHECKED_OUT')&&_resDue(r)>0)

  const lockedRoom  = fromRow?(prefill.room_number||''):null
  const lockedGuest = fromRow?(prefill.guest_name||''):null
  const lockedResId = fromRow?prefill._resId:null
  const lockedDiscount = fromRow?(+prefill._discount||0):0
  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-lockedDiscount-(+prefill._paid||0)):0

  const initRes=!fromRow&&prefill?.id?prefill:(!fromRow&&dueResList.length===1?dueResList[0]:null)
  const [selRes,setSelRes]=useState(initRes)
  const [resSearch,setResSearch]=useState(initRes?`${initRes.room_number||''} — ${initRes.guest_name||''}`:'')
  const [showResDrop,setShowResDrop]=useState(false)
  const dropDueAmt=selRes?_resDue(selRes):0

  const [amount,setAmount]=useState(fromRow&&lockedDue>0?String(lockedDue):dropDueAmt>0?String(dropDueAmt):'')
  const [type,setType]=useState('Room Payment (Cash)')
  const [fiscal_day,setFiscalDay]=useState(businessDate||todayStr())
  const [saving,setSaving]=useState(false)

  function pickRes(r){
    setSelRes(r)
    setResSearch(`${r.room_number||''} — ${r.guest_name||''}`)
    const due=_resDue(r)
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
    const resTotal    = fromRow?(+prefill._total||0):(+selRes?.total_amount||0)
    const resDiscount = fromRow?lockedDiscount:(+selRes?.discount_amount||+selRes?.discount||0)
    const resPaid     = fromRow?(+prefill._paid||0):(+selRes?.paid_amount||0)
    const payCap      = Math.max(0, resTotal - resDiscount)
    try{
      await dbPost('transactions',{room_number,guest_name,type,amount:a,fiscal_day,reservation_id:resId||null,tenant_id:TENANT})
      if(resId) await dbPatch('reservations',resId,{paid_amount:Math.min(payCap,resPaid+a)})
      toast(`Payment ${BDT(a)} recorded`); reload(); onClose()
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
          {/* Total / Discount / Paid / Due footer */}
          <div style={{display:'grid',gridTemplateColumns:lockedDiscount>0?'1fr 1fr 1fr 1fr':'1fr 1fr 1fr',background:'rgba(200,169,110,.03)'}}>
            {[
              ['Total',BDT(+prefill._total||0),'var(--gold)'],
              ...(lockedDiscount>0?[['Discount','− '+BDT(lockedDiscount),'var(--amb)']]:[]),
              ['Paid',BDT(+prefill._paid||0),'var(--grn)'],
              ['Balance Due',BDT(lockedDue),lockedDue>0?'var(--rose)':'var(--grn)']
            ].map(([l,v,c])=>(
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
                  const due=_resDue(r)
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
          {selRes&&(()=>{
            const selDisc=+selRes.discount_amount||+selRes.discount||0
            return(
            <div style={{marginTop:6,background:'rgba(200,169,110,.06)',border:'1px solid var(--br)',padding:'8px 12px',fontSize:11,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <span style={{color:'var(--tx2)'}}>
                Total: <strong style={{color:'var(--tx)'}}>{BDT(selRes.total_amount||0)}</strong>
                {selDisc>0&&<> · Discount: <strong style={{color:'var(--amb)'}}>− {BDT(selDisc)}</strong></>}
                · Paid: <strong style={{color:'var(--grn)'}}>{BDT(selRes.paid_amount||0)}</strong>
              </span>
              <span style={{color:dropDueAmt>0?'var(--rose)':'var(--grn)',fontWeight:600}}>Due: {BDT(dropDueAmt)}</span>
            </div>
          )})()}
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
function SettingsPage({currentUser,toast,staffList,setStaffList,reservations,rooms,guests}) {
  const isSA=currentUser?.role==='owner'
  const [tab,setTab]=useState('hotel')
  const [hs,setHS]=useState({hotelName:_HNAME,city:_CCITY,currency:_CFG.currencyCode||'BDT',checkIn:_CFG.checkInTime||'14:00',checkOut:_CFG.checkOutTime||'12:00',vat:String(_VRATE),svc:String(_SRATE)})
  const [hsSaving,setHsSaving]=useState(false)
  const HS=k=>e=>setHS(p=>({...p,[k]:e.target.value}))
  const [showAddUser,setShowAddUser]=useState(false)
  const [editUser,setEditUser]=useState(null)

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
    <div style={{maxWidth:700}}>
      <div className="tabs mb4">
        {[['hotel','🏨 Hotel Info'],['users','👥 Staff & Users'],['devices','📱 Devices'],['system','⚙ System']].map(([v,l])=>(
          <button key={v} className={`tab${tab===v?' on':''}`} onClick={()=>setTab(v)}>{l}</button>
        ))}
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
  async function save() {
    if(!f.name||!f.email) return toast('All fields required','error')
    setSaving(true)
    try{
      const patch={name:f.name,email:f.email,role:f.role,device:f.device}
      if(f.pw) patch.pwh=await _hashPw(f.pw)
      await dbPatch('staff',user.id,patch)
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
  const ANON=SB_KEY

  const [prospectQ,setProspectQ]=useState('event planners in Dhaka needing hotel rooms')
  const [prospectRes,setProspectRes]=useState(null)
  const [prospectBusy,setProspectBusy]=useState(false)

  const [leadId,setLeadId]=useState('')
  const [closerRes,setCloserRes]=useState(null)
  const [closerBusy,setCloserBusy]=useState(false)

  const [analystRes,setAnalystRes]=useState(null)
  const [analystBusy,setAnalystBusy]=useState(false)
  const [discountApproved,setDiscountApproved]=useState(false)

  async function callAgent(action,extra={}) {
    try{
      const r=await fetch(EDGE,{
        method:'POST',
        headers:{Authorization:`Bearer ${ANON}`,'Content-Type':'application/json'},
        body:JSON.stringify({action,...extra})
      })
      const txt=await r.text()
      try{ return JSON.parse(txt) }catch{ return {error:'Non-JSON response',raw:txt.slice(0,500)} }
    }catch(e){ return {error:String(e?.message||e)} }
  }

  async function runProspect(){
    setProspectBusy(true); setProspectRes(null)
    try{ setProspectRes(await callAgent('prospect',{query:prospectQ})) }
    catch(e){ toast(e.message,'error') }
    finally{ setProspectBusy(false) }
  }

  async function runCloser(){
    if(!leadId.trim()){ toast('Enter a Lead ID','error'); return }
    setCloserBusy(true); setCloserRes(null)
    try{ setCloserRes(await callAgent('close',{lead_id:leadId.trim()})) }
    catch(e){ toast(e.message,'error') }
    finally{ setCloserBusy(false) }
  }

  async function runAnalyst(){
    setAnalystBusy(true); setAnalystRes(null)
    try{ setAnalystRes(await callAgent('analyze')) }
    catch(e){ toast(e.message,'error') }
    finally{ setAnalystBusy(false) }
  }

  async function approveDiscount(){
    setDiscountApproved(true)
    toast(`✅ Discount approved: ${analystRes?.suggested_discount}`)
    await fetch(`${SB_URL}/rest/v1/hotel_settings`,{
      method:'POST',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
      body:JSON.stringify({key:'approved_discount',value:analystRes?.suggested_discount,tenant_id:TENANT})
    }).catch(()=>{})
  }

  const agentCard=(ico,title,color,desc,children)=>(
    <div className="card mb4" style={{borderColor:color+'33'}}>
      <div className="card-hd" style={{background:color+'0d'}}>
        <span style={{fontSize:18,marginRight:8}}>{ico}</span>
        <span className="card-title">{title}</span>
        <span className="xs muted" style={{marginLeft:8}}>{desc}</span>
      </div>
      <div className="card-body" style={{padding:16}}>{children}</div>
    </div>
  )

  return (
    <div>
      <div style={{background:'rgba(155,114,207,.08)',border:'1px solid rgba(155,114,207,.2)',padding:'10px 14px',marginBottom:16,fontSize:11,color:'var(--pur)'}}>
        🤖 AI Agents powered by Gemini 1.5 Flash — Connected to your live Supabase data
      </div>

      {/* Agent A: Prospector */}
      {agentCard('🔍','Agent A — The Prospector','#58A6FF','Finds potential leads & saves them to your leads table',(
        <div>
          <div className="fg mb4">
            <label className="flbl">Search Query</label>
            <input className="finput" value={prospectQ} onChange={e=>setProspectQ(e.target.value)} placeholder="e.g. event planners in Dhaka needing hotel rooms"/>
          </div>
          <button className="btn btn-info" disabled={prospectBusy} onClick={runProspect}>
            {prospectBusy?'🔍 Scanning…':'🔍 Find Leads'}
          </button>
          {prospectRes&&(
            <div style={{marginTop:12}}>
              {prospectRes.error
                ?<div>
                  <div style={{color:'var(--rose)',fontSize:11,marginBottom:6}}>⚠ {prospectRes.error}</div>
                  {prospectRes.raw&&<details><summary className="xs muted" style={{cursor:'pointer'}}>Raw Gemini output</summary><div style={{background:'var(--s2)',border:'1px solid var(--br)',padding:10,fontSize:10,whiteSpace:'pre-wrap',fontFamily:'monospace',marginTop:6,maxHeight:200,overflow:'auto'}}>{prospectRes.raw}</div></details>}
                </div>
                :<div>
                  <div className="xs muted mb4">✓ {prospectRes.leads_found} leads found, saved & emailed</div>
                  {(prospectRes.raw_leads||prospectRes.leads||[]).map((l,i)=>(
                    <div key={i} style={{background:'var(--s2)',border:'1px solid var(--br2)',padding:'10px 12px',marginBottom:8}}>
                      <div style={{fontWeight:600,fontSize:12}}>{l.name} <span className="xs muted">· {l.company}</span></div>
                      <div className="xs muted">{l.email} · {l.phone}</div>
                      <div className="xs" style={{color:'var(--sky)',marginTop:4}}>{l.notes}</div>
                      {l.source&&<div className="xs muted" style={{marginTop:3}}>Source: {l.source}</div>}
                    </div>
                  ))}
                </div>
              }
            </div>
          )}
        </div>
      ))}

      {/* Agent B: Closer */}
      {agentCard('✉️','Agent B — The Closer','#C8A96E','Writes personalized outreach email for a lead using Gemini',(
        <div>
          <div className="fg mb4">
            <label className="flbl">Lead ID (from leads table)</label>
            <input className="finput" value={leadId} onChange={e=>setLeadId(e.target.value)} placeholder="e.g. 123e4567-e89b-12d3..."/>
          </div>
          <button className="btn btn-gold" disabled={closerBusy} onClick={runCloser}>
            {closerBusy?'✍️ Writing…':'✍️ Write Outreach'}
          </button>
          {closerRes&&(
            <div style={{marginTop:12}}>
              {closerRes.error
                ?<div style={{color:'var(--rose)',fontSize:11}}>{closerRes.error}</div>
                :<div>
                  <div className="xs muted mb4">Draft written for <strong>{closerRes.lead_name}</strong> — saved to lead notes</div>
                  <div style={{background:'var(--s2)',border:'1px solid var(--br)',padding:'12px 14px',fontSize:11,lineHeight:1.8,whiteSpace:'pre-wrap',fontFamily:'monospace',color:'var(--tx2)'}}>{closerRes.email_draft}</div>
                </div>
              }
            </div>
          )}
        </div>
      ))}

      {/* Agent C: Analyst */}
      {agentCard('📊','Agent C — The Analyst','#3FB950','Monitors transactions, spots patterns, suggests discounts',(
        <div>
          <button className="btn btn-ghost" disabled={analystBusy} onClick={runAnalyst} style={{marginBottom:12}}>
            {analystBusy?'📊 Analyzing…':'📊 Run Analysis'}
          </button>
          {analystRes&&(
            <div>
              {analystRes.error
                ?<div style={{color:'var(--rose)',fontSize:11}}>{analystRes.error}</div>
                :<div>
                  {/* Day breakdown */}
                  <div className="g2 mb4">
                    {Object.entries(analystRes.day_averages||{}).sort(([,a],[,b])=>b-a).map(([day,avg])=>(
                      <div key={day} className="info-box" style={{borderColor:day===analystRes.lowest_day?'rgba(224,92,122,.3)':day===analystRes.highest_day?'rgba(63,185,80,.3)':'var(--br2)'}}>
                        <div className="info-lbl">{day}</div>
                        <div className="info-val" style={{color:day===analystRes.lowest_day?'var(--rose)':day===analystRes.highest_day?'var(--grn)':'var(--tx)'}}>{BDT(avg)}</div>
                      </div>
                    ))}
                  </div>
                  {/* Analysis text */}
                  <div style={{background:'var(--s2)',border:'1px solid var(--br)',padding:'12px 14px',fontSize:11,lineHeight:1.8,whiteSpace:'pre-wrap',color:'var(--tx2)',marginBottom:12}}>{analystRes.analysis}</div>
                  {/* Approval */}
                  {analystRes.needs_approval&&!discountApproved&&(
                    <div style={{background:'rgba(200,169,110,.08)',border:'1px solid var(--br)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--gold)'}}>Suggested Discount</div>
                        <div className="xs muted">{analystRes.suggested_discount}</div>
                      </div>
                      <button className="btn btn-gold btn-sm" onClick={approveDiscount}>✓ Approve &amp; Apply</button>
                    </div>
                  )}
                  {discountApproved&&<div style={{color:'var(--grn)',fontSize:11,padding:'8px 0'}}>✅ Discount approved and saved — other agents will factor this in</div>}
                </div>
              }
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════ AI RESEARCH (historical leads) ══════ */
function AIResearchPanel({toast}) {
  const [leads,setLeads]=useState([])
  const [loading,setLoading]=useState(true)
  const [statusF,setStatusF]=useState('ALL')
  const [search,setSearch]=useState('')
  const [brief,setBrief]=useState(null)

  const load=()=>{
    setLoading(true)
    db('leads','?select=*&order=created_at.desc&limit=200')
      .then(d=>{ setLeads(Array.isArray(d)?d:[]); setLoading(false) })
      .catch(()=>setLoading(false))
    db('hotel_settings','?key=eq.front_desk_brief&select=value,updated_at&limit=1')
      .then(d=>{
        const v=Array.isArray(d)?d[0]?.value:null
        if(v){ try{ setBrief({...(typeof v==='string'?JSON.parse(v):v),updated_at:d[0]?.updated_at}) }catch{} }
      }).catch(()=>{})
  }
  useEffect(()=>{load()},[])

  const statusCounts=leads.reduce((a,l)=>{a[l.status||'new']=(a[l.status||'new']||0)+1;return a},{})
  let rows=statusF==='ALL'?leads:leads.filter(l=>(l.status||'new')===statusF)
  if(search){
    const q=search.toLowerCase()
    rows=rows.filter(l=>(l.name||'').toLowerCase().includes(q)||(l.company||'').toLowerCase().includes(q)||(l.email||'').toLowerCase().includes(q)||(l.notes||'').toLowerCase().includes(q))
  }

  const copyEmail=(id,txt)=>{
    navigator.clipboard?.writeText(txt||'').then(()=>toast('Email draft copied')).catch(()=>toast('Copy failed','error'))
  }

  return (
    <div>
      <div style={{background:'rgba(63,185,80,.08)',border:'1px solid rgba(63,185,80,.2)',padding:'10px 14px',marginBottom:16,fontSize:11,color:'var(--grn)'}}>
        🧠 Research history — all leads generated by AI Prospector, with outreach drafts and status timeline
      </div>

      {brief&&(
        <div className="card mb4" style={{borderColor:'rgba(200,169,110,.3)'}}>
          <div className="card-hd" style={{background:'rgba(200,169,110,.06)'}}>
            <span className="card-title">📋 Latest Front Desk Brief</span>
            <span className="xs muted" style={{marginLeft:8}}>{brief.updated_at?new Date(brief.updated_at).toLocaleString():''}</span>
          </div>
          <div className="card-body" style={{whiteSpace:'pre-wrap',fontSize:11,lineHeight:1.8,color:'var(--tx2)'}}>{brief.brief||''}</div>
        </div>
      )}

      <div className="flex fac fjb mb4" style={{flexWrap:'wrap',gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          {['ALL','new','email_drafted','briefed_to_front_desk','contacted','converted'].map(s=>(
            <button key={s} className={`tab${statusF===s?' on':''}`} onClick={()=>setStatusF(s)}>
              {s==='ALL'?`All (${leads.length})`:`${s.replace(/_/g,' ')} (${statusCounts[s]||0})`}
            </button>
          ))}
        </div>
        <div className="flex gap2">
          <div className="srch"><span className="xs muted">⌕</span><input placeholder="Search lead, company, email…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {loading?<div className="xs muted">Loading research history…</div>
      :rows.length===0?<div className="xs muted" style={{padding:20,textAlign:'center'}}>No AI research yet. Run Agent A (Prospector) to generate leads.</div>
      :(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(l=>(
            <div key={l.id} className="card" style={{borderColor:'var(--br2)'}}>
              <div className="card-body" style={{padding:14}}>
                <div className="flex fac fjb" style={{gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:220}}>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{l.name||'Unknown'} <span className="xs muted">· {l.company||'—'}</span></div>
                    <div className="xs muted" style={{marginTop:2}}>{l.email||'no email'} · {l.phone||'no phone'}</div>
                    <div className="xs" style={{color:'var(--sky)',marginTop:6,lineHeight:1.6}}>{l.notes||'—'}</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:120}}>
                    <span className={`badge ${l.status==='converted'?'bgold':l.status==='briefed_to_front_desk'?'bteal':l.status==='email_drafted'?'bb':'ba'}`}>{(l.status||'new').replace(/_/g,' ')}</span>
                    <div className="xs muted" style={{marginTop:4}}>{l.created_at?new Date(l.created_at).toLocaleDateString():''}</div>
                    <div className="xs muted">Source: {l.source||'AI'}</div>
                  </div>
                </div>
                {l.email_draft&&(
                  <details style={{marginTop:10}}>
                    <summary className="xs" style={{cursor:'pointer',color:'var(--gold)'}}>✉ View email draft</summary>
                    <div style={{background:'var(--s2)',border:'1px solid var(--br)',padding:'10px 12px',marginTop:6,fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap',fontFamily:'monospace',color:'var(--tx2)'}}>{l.email_draft}</div>
                    <button className="btn btn-ghost btn-sm" style={{marginTop:6}} onClick={()=>copyEmail(l.id,l.email_draft)}>📋 Copy</button>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ B2B SWARM PANEL ══════════════════════════ */
function B2BSwarmPanel({toast}) {
  const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/b2b-agents'

  const [activeAgent, setActiveAgent] = useState('recruiter')
  const [partners, setPartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [busy, setBusy] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [outreach, setOutreach] = useState(null)
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
    const r = await fetch(EDGE, { method:'POST', headers:{'Content-Type':'application/json','apikey':SB_KEY}, body: JSON.stringify(body) })
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
      <div style={{background:'linear-gradient(135deg,rgba(63,185,80,.06),rgba(200,169,110,.04))',border:'1px solid rgba(63,185,80,.2)',padding:'10px 14px',marginBottom:16,fontSize:11,color:'var(--grn)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><span>🤝</span><span>B2B Partner Swarm — 3 AI Agents · Gemini 2.5 Flash</span></div>
        <div style={{fontSize:10,color:'var(--tx3)'}}>{partners.length} partners · {partners.filter(p=>p.status==='active'||p.status==='vip').length} active</div>
      </div>
      <div className="tabs mb4">
        {[['recruiter','🔍 Agent 1 — Recruiter'],['butler','🛎 Agent 2 — Portal Butler'],['billing','💰 Agent 3 — Billing Analyst']].map(([v,l])=>(
          <button key={v} className={`tab${activeAgent===v?' on':''}`} onClick={()=>setActiveAgent(v)}>{l}</button>
        ))}
      </div>
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
              <button className="btn btn-gold" onClick={doScan} disabled={busy==='scan'}>{busy==='scan'?'🔄 Scanning…':'🌐 Scan for New Agencies'}</button>
              <button className="btn btn-ghost" onClick={loadPartners} disabled={loadingPartners}>{loadingPartners?'Loading…':'↻ Refresh'}</button>
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">Partner Agencies ({partners.length})</span></div>
            {loadingPartners?(<div style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)',fontSize:12}}>Loading partners…</div>):(
              <table className="tbl">
                <thead><tr><th>Agency</th><th>City</th><th>Contact</th><th>Status</th><th>Rate/Night</th><th>Bookings</th><th>Actions</th></tr></thead>
                <tbody>
                  {partners.length===0?(<tr><td colSpan={7} style={{textAlign:'center',padding:'20px 0',color:'var(--tx3)'}}>No partners yet — click Scan to find agencies</td></tr>)
                  :partners.map(p=>(
                    <tr key={p.id}>
                      <td><div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{p.agency_name}</div><div style={{fontSize:10,color:'var(--sky)'}}>{p.email}</div></td>
                      <td className="xs muted">{p.city}</td>
                      <td><div style={{fontSize:11,color:'var(--tx)'}}>{p.contact_name||'—'}</div><div style={{fontSize:10,color:'var(--tx3)'}}>{p.phone||'—'}</div></td>
                      <td><span style={{fontSize:9,padding:'2px 8px',background:statusBg(p.status),color:statusColor(p.status),letterSpacing:'.08em',textTransform:'uppercase',fontWeight:600}}>{p.status==='vip'?'⭐ VIP':p.status}</span></td>
                      <td className="xs gold">৳{Number(p.wholesale_rate||2800).toLocaleString()}</td>
                      <td className="xs" style={{color:'var(--tx3)'}}>{p.total_bookings||0}</td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          <button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:p.whatsapp_sent?'rgba(63,185,80,.1)':'rgba(37,211,102,.15)',color:p.whatsapp_sent?'var(--grn)':'#25D366',border:'1px solid currentColor'}} disabled={busy===`invite:${p.id}`} onClick={()=>doInvite(p.id, p.agency_name)}>{busy===`invite:${p.id}`?'Sending…':p.whatsapp_sent?'✓ Resend WA':'📱 WhatsApp Invite'}</button>
                          <button className="btn btn-sm btn-gold" style={{fontSize:9,padding:'3px 8px',opacity:p.joining_letter_sent?.9:1}} disabled={busy===`letter:${p.id}`} onClick={()=>doJoiningLetter(p.id, p.agency_name)}>{busy===`letter:${p.id}`?'Generating…':p.joining_letter_sent?'✓ Re-generate Letter':'📄 Joining Letter'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {outreach&&(
            <div className="card" style={{marginTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{outreach.type==='invite'?'📱 WhatsApp Invite':'📄 Joining Letter'} — {outreach.partner}</div>
                {outreach.type==='invite'&&outreach.portal_link&&<div style={{fontSize:10,color:'var(--sky)',fontFamily:'monospace',wordBreak:'break-all'}}>{outreach.portal_link.slice(0,60)}…</div>}
              </div>
              <div style={{background:'rgba(0,0,0,.3)',padding:'12px 14px',fontSize:11,color:'var(--tx2)',whiteSpace:'pre-wrap',lineHeight:1.7,maxHeight:300,overflow:'auto',fontFamily:'monospace'}}>{outreach.content}</div>
              {outreach.type==='invite'&&<div style={{marginTop:8,fontSize:10,color:'var(--tx3)'}}>💡 Copy this message and send via WhatsApp to {outreach.partner}</div>}
            </div>
          )}
        </div>
      )}
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
                    <td><a href={`https://hotelfountainbd-crm.vercel.app?b2b=${p.secret_key}`} target="_blank" style={{fontSize:10,color:'var(--sky)'}}>Open Portal ↗</a></td>
                  </tr>
                ))}
                {partners.filter(p=>p.status==='active'||p.status==='vip').length===0&&(<tr><td colSpan={4} style={{textAlign:'center',padding:'16px 0',color:'var(--tx3)',fontSize:11}}>No active partners yet — activate via joining letter in Agent 1</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="card" style={{background:'rgba(88,166,255,.03)',border:'1px solid rgba(88,166,255,.15)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--sky)',marginBottom:10}}>How Agent 2 Works Automatically</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[['🔐 Authentication','Partner visits portal link with secret key → Agent 2 verifies identity → grants access to wholesale rates'],['📅 Booking','Partner selects dates & room → Agent 2 confirms rate (৳2,800/night) → creates reservation → notifies front desk'],['❓ Q&A','Partner asks "Does room have balcony?" → Agent 2 answers from hotel knowledge base instantly'],['🏨 Availability','Agent 2 checks both main reservations + B2B bookings to show real-time availability grid']].map(([title,desc],i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',padding:'10px 12px'}}><div style={{fontSize:11,fontWeight:600,color:'var(--tx)',marginBottom:4}}>{title}</div><div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.5}}>{desc}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
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
              <button className="btn btn-gold" onClick={doBillingDashboard} disabled={busy==='dashboard'}>{busy==='dashboard'?'📊 Loading…':'📊 Load B2B Dashboard'}</button>
              <button className="btn btn-gold" onClick={doWeeklyRun} disabled={busy==='weekly'}>{busy==='weekly'?'⚙ Running…':'⚡ Run Weekly Cycle Now'}</button>
            </div>
          </div>
          {dashboard&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
                {[['Total Partners',dashboard.summary?.total_partners||0,'var(--sky)'],['Active',dashboard.summary?.active_partners||0,'var(--grn)'],['⭐ VIP',dashboard.summary?.vip_partners||0,'var(--gold)'],['Total B2B Revenue',`৳${(dashboard.summary?.total_revenue||0).toLocaleString()}`,'var(--gold)']].map(([label,val,color],i)=>(
                  <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'10px 12px',textAlign:'center'}}><div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>{label}</div><div style={{fontSize:20,color,fontFamily:'var(--serif)',fontWeight:600}}>{val}</div></div>
                ))}
              </div>
              {dashboard.recent_bookings?.length>0&&(
                <div className="card mb3">
                  <div className="card-hd"><span className="card-title">Recent B2B Bookings</span></div>
                  <table className="tbl">
                    <thead><tr><th>Partner</th><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Revenue</th><th>Commission</th></tr></thead>
                    <tbody>{dashboard.recent_bookings.map(b=>(<tr key={b.id}><td style={{fontSize:11,fontWeight:500}}>{b.partner_name}</td><td style={{fontSize:11}}>{b.guest_name||'—'}</td><td><span className="badge bb">{b.room_number||'—'}</span></td><td className="xs muted">{b.check_in}</td><td className="xs muted">{b.check_out}</td><td className="xs gold">৳{Number(b.total_amount||0).toLocaleString()}</td><td className="xs" style={{color:'var(--grn)'}}>৳{Number(b.commission_amount||0).toLocaleString()}</td></tr>))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {billingResult&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--tx)',marginBottom:10}}>⚡ Weekly Run Results — {billingResult.partners_processed} partners processed</div>
              {(billingResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{r.partner}</div>
                    <span style={{fontSize:9,padding:'2px 8px',background:r.action==='commission_sent'?'rgba(63,185,80,.12)':r.action==='re-engagement_sent'?'rgba(224,92,122,.12)':'rgba(255,255,255,.05)',color:r.action==='commission_sent'?'var(--grn)':r.action==='re-engagement_sent'?'var(--rose)':'var(--tx3)',letterSpacing:'.08em',textTransform:'uppercase'}}>{r.action==='commission_sent'?'💰 Commission Sent':r.action==='re-engagement_sent'?'📨 Re-engaged':'✓ No Action'}</span>
                  </div>
                  {r.action==='commission_sent'&&<div style={{fontSize:10,color:'var(--gold)'}}>Commission: ৳{Number(r.commission||0).toLocaleString()} · {r.bookings} booking{r.bookings!==1?'s':''} this week</div>}
                  {r.action==='re-engagement_sent'&&<div style={{fontSize:10,color:'var(--tx3)'}}>Inactive {r.days_inactive} days · Discount offer sent</div>}
                  {(r.statement||r.message)&&<div style={{marginTop:6,fontSize:10,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',whiteSpace:'pre-wrap',maxHeight:120,overflow:'auto'}}>{r.statement||r.message}</div>}
                </div>
              ))}
            </div>
          )}
          {!dashboard&&!billingResult&&(
            <div className="card" style={{background:'rgba(200,169,110,.03)',border:'1px solid rgba(200,169,110,.15)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--gold)',marginBottom:10}}>⏰ Automated Schedule</div>
              {[['Every Sunday 10 PM','Run weekly cycle — commission statements + re-engagement offers'],['Active partners (any bookings)','Commission statement emailed + VIP check (≥10 total bookings)'],['Inactive ≥14 days','Re-engagement WhatsApp: ৳200 discount code generated'],['VIP threshold','Auto-upgrade to VIP status at 10 total bookings']].map(([trigger,action],i)=>(
                <div key={i} style={{display:'flex',gap:10,marginBottom:8,padding:'8px 10px',background:'rgba(0,0,0,.2)'}}><div style={{fontSize:10,color:'var(--gold)',minWidth:160,fontWeight:500}}>{trigger}</div><div style={{fontSize:10,color:'var(--tx3)'}}>{action}</div></div>
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

  const [activeTab, setActiveTab] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [offers, setOffers] = useState([])
  const [busy, setBusy] = useState(null)
  const [agentResult, setAgentResult] = useState(null)
  const [selectedRes, setSelectedRes] = useState('')
  const [loadingOffers, setLoadingOffers] = useState(true)

  useEffect(() => { loadOffers(); loadDashboard() }, [])

  async function call(body) {
    const r = await fetch(EDGE, { method:'POST', headers:{'Content-Type':'application/json','apikey':SB_KEY}, body:JSON.stringify(body) })
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
    try { const res = await call({action:'dashboard'}); setDashboard(res) } catch(e) {}
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
  const upcoming = (reservations||[]).filter(r=>r.status==='RESERVED'||r.status==='PENDING').slice(0,10)

  return (
    <div>
      <div style={{background:'linear-gradient(135deg,rgba(200,169,110,.08),rgba(88,166,255,.04))',border:'1px solid rgba(200,169,110,.2)',padding:'12px 16px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--gold)'}}>Plan G — Premium Transit Experience</div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>3-Agent upsell engine · Turns ৳3,500 ADR → ৳5,000+ through perfectly timed offers</div>
          </div>
          {dashboard&&(<div style={{display:'flex',gap:16,textAlign:'right'}}><div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Upsell Revenue</div><div style={{fontSize:18,color:'var(--gold)',fontFamily:'var(--serif)'}}>৳{Number(dashboard.summary?.total_upsell_revenue||0).toLocaleString()}</div></div><div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Conversion</div><div style={{fontSize:18,color:'var(--grn)',fontFamily:'var(--serif)'}}>{dashboard.summary?.conversion_rate||0}%</div></div></div>)}
        </div>
      </div>
      <div className="tabs mb4">
        {[['dashboard','📊 Dashboard'],['agent1','✈ Agent 1 · Pre-Arrival'],['agent2','🍽 Agent 2 · Room Customizer'],['offers','📋 All Offers']].map(([v,l])=>(
          <button key={v} className={`tab${activeTab===v?' on':''}`} onClick={()=>setActiveTab(v)}>{l}</button>
        ))}
      </div>
      {activeTab==='dashboard'&&(
        <div>
          {dashboard&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
                {[['Offers Sent',dashboard.summary?.total_offers_sent||0,'var(--sky)'],['Accepted',dashboard.summary?.total_accepted||0,'var(--grn)'],['Conversion Rate',`${dashboard.summary?.conversion_rate||0}%`,'var(--gold)'],['Upsell Revenue',`৳${Number(dashboard.summary?.total_upsell_revenue||0).toLocaleString()}`,'var(--gold)']].map(([label,val,color],i)=>(
                  <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',textAlign:'center'}}><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{label}</div><div style={{fontSize:22,color,fontFamily:'var(--serif)',fontWeight:600}}>{val}</div></div>
                ))}
              </div>
              {dashboard?.by_type&&Object.keys(dashboard.by_type).length>0&&(
                <div className="card mb4">
                  <div className="card-hd"><span className="card-title">Performance by Offer Type</span></div>
                  <table className="tbl"><thead><tr><th>Offer</th><th>Sent</th><th>Accepted</th><th>Conversion</th><th>Revenue</th></tr></thead>
                  <tbody>{Object.entries(dashboard.by_type).map(([type,data])=>(<tr key={type}><td><span style={{marginRight:6}}>{offerIcon(type)}</span>{type.replace(/_/g,' ').replace(/\w/g,l=>l.toUpperCase())}</td><td className="xs muted">{data.sent}</td><td className="xs" style={{color:'var(--grn)'}}>{data.accepted}</td><td className="xs gold">{data.sent>0?Math.round(data.accepted/data.sent*100):0}%</td><td className="xs gold">৳{Number(data.revenue||0).toLocaleString()}</td></tr>))}</tbody>
                  </table>
                </div>
              )}
              <div className="card">
                <div className="card-hd"><span className="card-title">Upsell Catalog — Plan G Offers</span></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['🚗','airport_pickup','Airport Pickup','৳500','24h before','Private car from any Dhaka airport → hotel'],['🌅','early_checkin','Early Check-in (9AM-12PM)','৳1,000','24h before','Guaranteed room from 9:00 AM for morning arrivals'],['🍽','jet_lag_menu',"Chef Samim's Jet Lag Menu",'৳850','4h before','Light recovery meal ready in room on arrival'],['👑','room_upgrade','Royal Suite Upgrade','৳4,000','4h before','Room 303 — balcony, premium amenities'],['📱','sim_card','Welcome SIM Pack','৳800','4h before','Local SIM + 10GB data waiting in room'],['🌙','late_checkout','Late Check-out (till 6PM)','৳1,500','Day of','Keep room for guests with late flights']].map(([icon,type,title,price,timing,desc])=>(
                    <div key={type} style={{background:'rgba(200,169,110,.03)',border:'1px solid var(--br)',padding:'10px 12px',display:'flex',gap:10,alignItems:'flex-start'}}><span style={{fontSize:18,flexShrink:0}}>{icon}</span><div><div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{title}</div><div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{desc}</div><div style={{display:'flex',gap:12,marginTop:6}}><span style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>{price}</span><span style={{fontSize:10,color:'var(--tx3)'}}>{timing}</span></div></div></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab==='agent1'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:24}}>✈</span><div><div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 1 — Pre-Arrival Specialist</div><div style={{fontSize:10,color:'var(--tx3)'}}>Sends personalized WhatsApp 24h before check-in · Offers Airport Pickup (৳500) + Early Check-in (৳1,000)</div></div></div>
            <div style={{background:'rgba(88,166,255,.05)',border:'1px solid rgba(88,166,255,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--sky)'}}>💡 <strong>Why it works:</strong> Pre-arrival messages have 80% higher acceptance than check-in offers</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              <button className="btn btn-gold" onClick={()=>runAgent('pre_arrival',null)} disabled={busy==='pre_arrival'}>{busy==='pre_arrival'?'🔄 Running…':'✈ Run for Tomorrow\'s Arrivals'}</button>
            </div>
            <div style={{paddingTop:12,borderTop:'1px solid var(--br2)'}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Or trigger for a specific reservation</div>
              <div style={{display:'flex',gap:8}}>
                <select className="finput" style={{flex:1}} value={selectedRes} onChange={e=>setSelectedRes(e.target.value)}>
                  <option value="">— Select upcoming reservation —</option>
                  {upcoming.map(r=>(<option key={r.id} value={r.id}>{getGN(r)} · {(r.room_ids||[]).join(',')} · {r.check_in?.slice(0,10)}</option>))}
                </select>
                <button className="btn btn-gold btn-sm" style={{padding:'0 14px',whiteSpace:'nowrap'}} disabled={!selectedRes||busy==='pre_arrival'} onClick={()=>runAgent('pre_arrival',selectedRes)}>Send Offers</button>
              </div>
            </div>
          </div>
          {agentResult?.agent==='PreArrival'&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ Agent 1 processed {agentResult.processed} reservation{agentResult.processed!==1?'s':''}</div>
              {(agentResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><div><div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{r.guest}</div><div style={{fontSize:10,color:'var(--tx3)'}}>Room {r.room} · Check-in: {r.check_in} · {r.phone}</div></div>{r.skipped?<span style={{fontSize:10,color:'var(--tx3)'}}>⏭ {r.skipped}</span>:<span style={{fontSize:9,background:'rgba(88,166,255,.12)',color:'var(--sky)',padding:'2px 8px',letterSpacing:'.1em'}}>SENT</span>}</div>
                  {r.whatsapp_message&&(<div style={{background:'rgba(37,211,102,.05)',border:'1px solid rgba(37,211,102,.2)',padding:'10px 12px',fontSize:11,color:'var(--tx2)',lineHeight:1.6}}><div style={{fontSize:9,color:'#25D366',fontWeight:600,marginBottom:6,letterSpacing:'.1em'}}>📱 WHATSAPP MESSAGE</div>{r.whatsapp_message}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab==='agent2'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:24}}>🍽</span><div><div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 2 — Room Customizer</div><div style={{fontSize:10,color:'var(--tx3)'}}>Sends targeted upsells 4h before arrival · Jet Lag Menu (৳850) · Room Upgrade · SIM Pack · Smart targeting for international guests</div></div></div>
            <div style={{background:'rgba(200,169,110,.05)',border:'1px solid rgba(200,169,110,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--gold)'}}>🎯 <strong>Smart targeting:</strong> International guests → Jet Lag Menu + SIM Pack · Local guests → Jet Lag Menu + Royal Suite Upgrade</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              <button className="btn btn-gold" onClick={()=>runAgent('room_customizer',null)} disabled={busy==='room_customizer'}>{busy==='room_customizer'?'🔄 Running…':'🍽 Run for Today\'s Arrivals'}</button>
            </div>
            <div style={{paddingTop:12,borderTop:'1px solid var(--br2)'}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Or trigger for specific reservation</div>
              <div style={{display:'flex',gap:8}}>
                <select className="finput" style={{flex:1}} value={selectedRes} onChange={e=>setSelectedRes(e.target.value)}>
                  <option value="">— Select reservation —</option>
                  {upcoming.map(r=>(<option key={r.id} value={r.id}>{getGN(r)} · {(r.room_ids||[]).join(',')} · {r.check_in?.slice(0,10)}</option>))}
                </select>
                <button className="btn btn-gold btn-sm" style={{padding:'0 14px',whiteSpace:'nowrap'}} disabled={!selectedRes||busy==='room_customizer'} onClick={()=>runAgent('room_customizer',selectedRes)}>Send Offers</button>
              </div>
            </div>
          </div>
          {agentResult?.agent==='RoomCustomizer'&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ Agent 2 processed {agentResult.processed} reservation{agentResult.processed!==1?'s':''}</div>
              {(agentResult.results||[]).map((r,i)=>(
                <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><div><div style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{r.guest}</div><div style={{fontSize:10,color:'var(--tx3)'}}>Room {r.room} · Arrival: {r.arrival_time} · {r.international?'🌍 International':'🇧🇩 Local'}</div></div>{r.skipped?<span style={{fontSize:10,color:'var(--tx3)'}}>⏭ {r.skipped}</span>:(<div style={{display:'flex',gap:4}}>{(r.offers_sent||[]).map(o=>(<span key={o} style={{fontSize:9,background:'rgba(200,169,110,.15)',color:'var(--gold)',padding:'2px 8px',letterSpacing:'.08em'}}>{o.replace(/_/g,' ').toUpperCase()}</span>))}</div>)}</div>
                  {r.whatsapp_message&&(<div style={{background:'rgba(37,211,102,.05)',border:'1px solid rgba(37,211,102,.2)',padding:'10px 12px',fontSize:11,color:'var(--tx2)',lineHeight:1.6}}><div style={{fontSize:9,color:'#25D366',fontWeight:600,marginBottom:6,letterSpacing:'.1em'}}>📱 WHATSAPP MESSAGE</div>{r.whatsapp_message}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab==='offers'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--tx3)'}}>All upsell offers — click Accept to bill folio + alert front desk</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{loadOffers();loadDashboard()}}>↻ Refresh</button>
          </div>
          {loadingOffers?(<div style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>Loading offers…</div>):(
            <div>
              {offers.length===0&&(<div className="card" style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>No offers yet — run Agent 1 or Agent 2 to generate upsell messages</div>)}
              {offers.map(o=>(
                <div key={o.id} style={{background:'rgba(0,0,0,.15)',border:`1px solid ${o.status==='accepted'?'rgba(63,185,80,.3)':o.status==='declined'?'rgba(224,92,122,.2)':'var(--br)'}`,padding:'12px 14px',marginBottom:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <span style={{fontSize:16}}>{offerIcon(o.offer_type)}</span>
                        <div><span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{o.offer_title}</span><span style={{marginLeft:8,fontSize:11,color:'var(--gold)',fontWeight:500}}>৳{Number(o.offer_price).toLocaleString()}</span></div>
                        <span style={{fontSize:9,padding:'2px 8px',background:statusBg(o.status),color:statusColor(o.status),letterSpacing:'.08em',textTransform:'uppercase',fontWeight:600}}>{o.status}</span>
                      </div>
                      <div style={{fontSize:11,color:'var(--tx2)'}}>{o.guest_name} · Room {o.room_number} · Check-in: {o.check_in}</div>
                      {o.alert_message&&o.status==='accepted'&&(<div style={{marginTop:6,fontSize:10,color:'var(--grn)',background:'rgba(63,185,80,.06)',border:'1px solid rgba(63,185,80,.2)',padding:'6px 8px'}}>🔔 {o.alert_message} · Assigned: <strong>{o.assigned_to}</strong></div>)}
                    </div>
                    {o.status==='sent'&&(<div style={{display:'flex',gap:4,flexShrink:0}}><button className="btn btn-success btn-sm" style={{fontSize:10,padding:'4px 10px'}} disabled={busy===`accept:${o.id}`} onClick={()=>acceptOffer(o.id,o.guest_name)}>{busy===`accept:${o.id}`?'Processing…':'✓ Accept + Bill'}</button><button className="btn btn-sm" style={{fontSize:10,padding:'4px 8px',background:'rgba(224,92,122,.1)',color:'var(--rose)',border:'1px solid rgba(224,92,122,.3)'}} disabled={busy===`decline:${o.id}`} onClick={()=>declineOffer(o.id)}>✕</button></div>)}
                    {o.status==='accepted'&&(<div style={{fontSize:10,color:'var(--grn)',textAlign:'right',flexShrink:0}}><div>✓ Billed {o.billed?'✓':''}</div><div style={{color:'var(--tx3)'}}>{o.assigned_to}</div></div>)}
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

  const [activeTab, setActiveTab] = useState('dashboard')
  const [leads, setLeads] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [busy, setBusy] = useState(null)
  const [scoutResult, setScoutResult] = useState(null)
  const [analystResult, setAnalystResult] = useState(null)
  const [outreachResult, setOutreachResult] = useState(null)
  const [replyModal, setReplyModal] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [leadType, setLeadType] = useState('corporate')
  const [scoreThreshold, setScoreThreshold] = useState(80)
  const [loadingLeads, setLoadingLeads] = useState(true)

  useEffect(()=>{ loadLeads(); loadDashboard() },[])

  async function call(body) {
    const r = await fetch(EDGE,{method:'POST',headers:{'Content-Type':'application/json','apikey':SB_KEY},body:JSON.stringify(body)})
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
      <div style={{background:'linear-gradient(135deg,rgba(88,166,255,.06),rgba(200,169,110,.04))',border:'1px solid rgba(88,166,255,.2)',padding:'12px 16px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--sky)'}}>🎯 Lead Gen Swarm — 3 AI Agents</div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>Scout → Score → Outreach → CRM Sync · Corporate · Event Organizers · Long-Stay Expats</div>
          </div>
          {dashboard&&(<div style={{display:'flex',gap:16,textAlign:'right'}}><div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Total Leads</div><div style={{fontSize:18,color:'var(--sky)',fontFamily:'var(--serif)'}}>{dashboard.total_leads}</div></div><div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>High Priority</div><div style={{fontSize:18,color:'var(--rose)',fontFamily:'var(--serif)'}}>{dashboard.high_priority}</div></div><div><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em'}}>Replied</div><div style={{fontSize:18,color:'var(--grn)',fontFamily:'var(--serif)'}}>{dashboard.replied}</div></div></div>)}
        </div>
      </div>
      <div className="tabs mb4">
        {[['dashboard','📊 Dashboard'],['scout','🔍 Agent 1 · Scout'],['analyst','🧠 Agent 2 · Analyst'],['outreach','📨 Agent 3 · Outreach'],['leads','📋 All Leads']].map(([v,l])=>(
          <button key={v} className={`tab${activeTab===v?' on':''}`} onClick={()=>setActiveTab(v)}>{l}</button>
        ))}
      </div>
      {replyModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setReplyModal(null)}>
          <div style={{background:'var(--bg2)',border:'1px solid var(--br)',padding:24,width:480,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)',marginBottom:16}}>Log Reply — {replyModal.name}</div>
            <div className="fg mb3"><label className="flbl">Paste their reply message</label><textarea className="finput" rows={4} value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="e.g. Yes, we're interested! Can we schedule a site visit next week?" style={{resize:'vertical'}}/></div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={()=>setReplyModal(null)}>Cancel</button>
              <button className="btn btn-gold" disabled={!replyText.trim()||busy===`sync:${replyModal.leadId}`} onClick={()=>doSync(replyModal.leadId,replyText)}>{busy===`sync:${replyModal.leadId}`?'Syncing…':'✓ Sync to CRM + Notify Front Desk'}</button>
            </div>
          </div>
        </div>
      )}
      {activeTab==='dashboard'&&(
        <div>
          {dashboard&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
                {[['Total Leads',dashboard.total_leads,'var(--sky)'],['High Priority (80+)',dashboard.high_priority,'var(--rose)'],['Outreach Sent',dashboard.by_status?.outreach_sent||0,'var(--gold)'],['Replied',dashboard.replied,'var(--grn)']].map(([l,v,c],i)=>(
                  <div key={i} style={{background:'rgba(0,0,0,.2)',border:'1px solid var(--br)',padding:'12px',textAlign:'center'}}><div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{l}</div><div style={{fontSize:24,color:c,fontFamily:'var(--serif)',fontWeight:600}}>{v}</div></div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div className="card">
                  <div className="card-hd"><span className="card-title">By Lead Type</span></div>
                  {Object.entries(dashboard.by_type||{}).map(([type,count])=>(<div key={type} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br2)',fontSize:12}}><span>{typeIcon(type)} {type.replace(/_/g,' ').replace(/\w/g,l=>l.toUpperCase())}</span><span style={{color:'var(--gold)',fontWeight:600}}>{count}</span></div>))}
                </div>
                <div className="card">
                  <div className="card-hd"><span className="card-title">By Status</span></div>
                  {Object.entries(dashboard.by_status||{}).map(([status,count])=>{ const b=statusBadge(status); return (<div key={status} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br2)',fontSize:12}}><span style={{color:b.color}}>{b.label}</span><span style={{color:'var(--gold)',fontWeight:600}}>{count}</span></div>) })}
                </div>
              </div>
              {dashboard.top_leads?.length>0&&(
                <div className="card">
                  <div className="card-hd"><span className="card-title">Top Priority Leads (Score ≥70)</span></div>
                  {dashboard.top_leads.map(l=>(
                    <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br2)'}}>
                      <div style={{width:36,height:36,background:scoreBg(l.intent_score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:13,color:scoreColor(l.intent_score),fontWeight:700,flexShrink:0}}>{l.intent_score}</div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.full_name} <span style={{fontSize:10,color:'var(--tx3)'}}>· {l.title}</span></div><div style={{fontSize:10,color:'var(--tx3)'}}>{typeIcon(l.lead_type)} {l.company_name} · {l.area}</div></div>
                      <span style={{fontSize:9,padding:'2px 8px',background:statusBadge(l.outreach_status).bg,color:statusBadge(l.outreach_status).color,letterSpacing:'.08em',textTransform:'uppercase',flexShrink:0}}>{statusBadge(l.outreach_status).label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {activeTab==='scout'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:24}}>🔍</span><div><div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 1 — The Digital Scout</div><div style={{fontSize:10,color:'var(--tx3)'}}>Discovers leads from LinkedIn, corporate directories, Facebook groups · 3 lead types: Corporate, Event Organizers, Long-Stay Expats</div></div></div>
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
                <button className="btn btn-gold" onClick={doScout} disabled={busy==='scout'} style={{whiteSpace:'nowrap'}}>{busy==='scout'?'🔄 Scouting…':'🔍 Scout Now'}</button>
              </div>
            </div>
            {[{type:'corporate',icon:'🏢',title:'Airport Transit Strategy',target:'HR & Travel Managers at multinationals in Nikunja/Khilkhet/Uttara',pitch:'Dedicated Corporate Wing · 24/7 check-in · High-speed WiFi · Corporate rates'},{type:'event_organizer',icon:'🎪',title:'Small Gathering Strategy',target:'Event planners, training coordinators needing space for 10-30 people',pitch:"30-room boutique · Private meeting room · Chef Samim's Day-Use lunch package"},{type:'long_stay',icon:'🏠',title:'Long-Stay Strategy',target:'Expats & consultants moving to Dhaka, Facebook "Expats in Dhaka" groups',pitch:'Home-Away-From-Home · 24/7 security · Airport proximity · Weekly/monthly rates'}].map(s=>(
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
              {(scoutResult.leads||[]).map((l,i)=>(<div key={i} style={{background:'rgba(0,0,0,.15)',border:'1px solid var(--br)',padding:'10px 12px',marginBottom:6}}><div style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{l.full_name} <span style={{fontSize:10,color:'var(--tx3)',fontWeight:400}}>· {l.title}</span></div><div style={{fontSize:11,color:'var(--sky)',marginTop:2}}>{l.company_name} · {l.area}</div><div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>{l.qualification_notes}</div>{l.email&&<div style={{fontSize:10,color:'var(--tx2)',marginTop:2}}>{l.email} {l.phone&&`· ${l.phone}`}</div>}</div>))}
            </div>
          )}
        </div>
      )}
      {activeTab==='analyst'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:24}}>🧠</span><div><div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 2 — The Intent Analyst</div><div style={{fontSize:10,color:'var(--tx3)'}}>Scores leads 0-100 · Analyzes transit needs, event frequency, travel policy · Score ≥80 → auto-queued for outreach</div></div></div>
            <div style={{background:'rgba(88,166,255,.05)',border:'1px solid rgba(88,166,255,.15)',padding:'10px 14px',marginBottom:14,fontSize:11,color:'var(--sky)'}}>📊 <strong>Scoring logic:</strong> Corporate in Nikunja +30 · Travel/HR role +25 · Multinational +20 · Event frequency +40 · Expat/consultant +40</div>
            <button className="btn btn-gold" onClick={doAnalyzeAll} disabled={busy==='analyze'}>{busy==='analyze'?'🧠 Analyzing…':'🧠 Analyze All Unscored Leads'}</button>
          </div>
          {analystResult&&(
            <div className="card">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ {analystResult.scored} leads scored · {analystResult.high_priority_count} high priority (≥80)</div>
              {(analystResult.results||[]).map((r,i)=>(
                <div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br2)',alignItems:'flex-start'}}>
                  <div style={{width:44,height:44,background:scoreBg(r.score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:16,color:scoreColor(r.score),fontWeight:700,flexShrink:0}}>{r.score}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{r.name} <span style={{fontSize:10,color:'var(--tx3)'}}>· {r.company}</span></div><div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>{(r.signals||[]).map((s,j)=>(<span key={j} style={{fontSize:9,padding:'2px 6px',background:'rgba(88,166,255,.08)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.2)'}}>{s}</span>))}</div>{r.high_priority&&<span style={{display:'inline-block',marginTop:4,fontSize:9,padding:'2px 8px',background:'rgba(224,92,122,.12)',color:'var(--rose)',letterSpacing:'.08em'}}>🔴 HIGH PRIORITY</span>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab==='outreach'&&(
        <div>
          <div className="card mb4">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{fontSize:24}}>📨</span><div><div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--tx)'}}>Agent 3 — The Outreach Specialist</div><div style={{fontSize:10,color:'var(--tx3)'}}>Sends personalized LinkedIn/email/WhatsApp · Auto-outreach for score ≥80 · Post-reply: syncs to CRM + alerts front desk</div></div></div>
            <div style={{display:'flex',gap:8,alignItems:'flex-end',marginBottom:14}}>
              <div style={{flex:1}}>
                <label className="flbl">Auto-outreach score threshold</label>
                <input type="range" min={50} max={95} step={5} value={scoreThreshold} onChange={e=>setScoreThreshold(+e.target.value)} style={{width:'100%',marginTop:6}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--tx3)',marginTop:2}}><span>50 (broad)</span><span style={{color:'var(--gold)',fontWeight:600}}>Current: {scoreThreshold}+</span><span>95 (strict)</span></div>
              </div>
              <button className="btn btn-gold" onClick={doBulkOutreach} disabled={busy==='bulk_outreach'} style={{whiteSpace:'nowrap',marginBottom:0}}>{busy==='bulk_outreach'?'📨 Sending…':`📨 Send to All ≥${scoreThreshold}`}</button>
            </div>
            <div style={{background:'rgba(63,185,80,.05)',border:'1px solid rgba(63,185,80,.15)',padding:'10px 14px',fontSize:11,color:'var(--grn)'}}>🔄 <strong>CRM Sync flow:</strong> Guest replies → log reply below → Agent 3 analyzes intent → creates guest profile in CRM → notifies front desk with priority level</div>
          </div>
          {outreachResult&&(
            <div className="card mb4">
              <div style={{fontSize:12,fontWeight:600,color:'var(--grn)',marginBottom:10}}>✓ {outreachResult.sent} messages sent (threshold: {outreachResult.threshold})</div>
              {(outreachResult.results||[]).map((r,i)=>(<div key={i} style={{background:'rgba(0,0,0,.15)',border:'1px solid var(--br)',padding:'12px',marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><div><span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{r.lead_name}</span> <span style={{fontSize:10,color:'var(--tx3)'}}>· {r.company} · Score: {r.score}</span></div><span style={{fontSize:9,padding:'2px 8px',background:'rgba(200,169,110,.12)',color:'var(--gold)',letterSpacing:'.08em',textTransform:'uppercase'}}>{r.channel}</span></div>{r.message&&<div style={{fontSize:11,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',lineHeight:1.6}}>{r.message}</div>}<div style={{fontSize:10,color:'var(--tx3)',marginTop:6}}>Contact: {r.contact||'—'}</div></div>))}
            </div>
          )}
        </div>
      )}
      {activeTab==='leads'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--tx3)'}}>{leads.length} leads total — sorted by score</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{loadLeads();loadDashboard()}}>↻ Refresh</button>
          </div>
          {loadingLeads?(<div style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>Loading…</div>):(
            leads.length===0?(<div className="card" style={{textAlign:'center',padding:'24px',color:'var(--tx3)',fontSize:12}}>No leads yet — run Agent 1 to scout</div>):
            leads.map(l=>{
              const sb = statusBadge(l.outreach_status)
              const signals = typeof l.intent_signals === 'string' ? JSON.parse(l.intent_signals||'[]') : (l.intent_signals||[])
              return (
                <div key={l.id} style={{background:'rgba(0,0,0,.12)',border:'1px solid var(--br)',padding:'12px 14px',marginBottom:6}}>
                  <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                    {l.intent_score>0&&(<div style={{width:40,height:40,background:scoreBg(l.intent_score),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:14,color:scoreColor(l.intent_score),fontWeight:700,flexShrink:0}}>{l.intent_score}</div>)}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:4}}>
                        <div><span style={{fontWeight:600,fontSize:12,color:'var(--tx)'}}>{l.full_name}</span><span style={{fontSize:10,color:'var(--tx3)',marginLeft:6}}>{l.title}</span><span style={{fontSize:9,padding:'1px 6px',background:'rgba(88,166,255,.08)',color:'var(--sky)',marginLeft:6,letterSpacing:'.06em'}}>{typeIcon(l.lead_type)} {l.lead_type.replace(/_/g,' ')}</span></div>
                        <span style={{fontSize:9,padding:'2px 8px',background:sb.bg,color:sb.color,letterSpacing:'.08em',textTransform:'uppercase',flexShrink:0,fontWeight:600}}>{sb.label}</span>
                      </div>
                      <div style={{fontSize:11,color:'var(--sky)'}}>{l.company_name} · {l.area}</div>
                      <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{l.email} {l.phone&&`· ${l.phone}`}</div>
                      {signals.length>0&&(<div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5}}>{signals.map((s,i)=><span key={i} style={{fontSize:9,padding:'1px 6px',background:'rgba(88,166,255,.06)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.15)'}}>{s}</span>)}</div>)}
                      {l.outreach_message&&(<details style={{marginTop:6}}><summary style={{fontSize:10,color:'var(--gold)',cursor:'pointer'}}>📨 View outreach message ▾</summary><div style={{marginTop:4,fontSize:10,color:'var(--tx2)',background:'rgba(0,0,0,.3)',padding:'8px 10px',fontFamily:'monospace',lineHeight:1.6,maxHeight:150,overflow:'auto'}}>{l.outreach_message}</div></details>)}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
                      {l.outreach_status==='new'&&(<button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(88,166,255,.1)',color:'var(--sky)',border:'1px solid rgba(88,166,255,.3)'}} disabled={busy===`analyze:${l.id}`} onClick={()=>doAnalyzeLead(l.id)}>{busy===`analyze:${l.id}`?'Scoring…':'🧠 Score'}</button>)}
                      {(l.outreach_status==='scored'||l.intent_score>0)&&l.outreach_status!=='outreach_sent'&&l.outreach_status!=='replied'&&(<><button className="btn btn-sm btn-gold" style={{fontSize:9,padding:'3px 8px'}} disabled={!!busy} onClick={()=>doOutreachLead(l.id,'linkedin')}>💼 LinkedIn</button><button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(37,211,102,.1)',color:'#25D366',border:'1px solid rgba(37,211,102,.3)'}} disabled={!!busy} onClick={()=>doOutreachLead(l.id,'whatsapp')}>📱 WhatsApp</button></>)}
                      {l.outreach_status==='outreach_sent'&&(<button className="btn btn-sm" style={{fontSize:9,padding:'3px 8px',background:'rgba(63,185,80,.1)',color:'var(--grn)',border:'1px solid rgba(63,185,80,.3)'}} onClick={()=>{setReplyModal({leadId:l.id,name:l.full_name});setReplyText('')}}>✉ Log Reply</button>)}
                      {l.outreach_status==='replied'&&!l.crm_synced&&(<button className="btn btn-sm btn-gold" style={{fontSize:9,padding:'3px 8px'}} disabled={!!busy} onClick={()=>doSync(l.id,'interested')}>🔄 Sync CRM</button>)}
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

/* ═══════════════════════ WORKFLOW MONITOR ══════════════════ */
function WorkflowMonitor({toast}) {
  const [runs,setRuns]=useState([])
  const [loading,setLoading]=useState(true)
  const [triggering,setTriggering]=useState(null)
  const SB_ANON=SB_KEY
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
        <span className="xs muted">All emails → {_HEMAIL}</span>
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
  const SB_ANON=SB_KEY

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
function LeadPipelinePage_REMOVED() {
  const [leads, setLeads]           = React.useState([])
  const [log, setLog]               = React.useState([])
  const [loading, setLoading]       = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [filter, setFilter]         = React.useState('all')
  const [search, setSearch]         = React.useState('')
  const [selected, setSelected]     = React.useState(null)
  const [runningBot, setRunningBot] = React.useState(false)
  const [botResult, setBotResult]   = React.useState(null)
  const botTimerRef = React.useRef(null)

  const STATUS_CFG = {
    pending:        {label:'Pending',        color:'#7A6A5A', bg:'rgba(122,106,90,.18)'},
    contacted:      {label:'Contacted',      color:'#58A6FF', bg:'rgba(88,166,255,.12)'},
    replied:        {label:'Replied',        color:'#FCD34D', bg:'rgba(252,211,77,.12)'},
    audited:        {label:'Audited',        color:'#A78BFA', bg:'rgba(167,139,250,.12)'},
    deal_ready:     {label:'Deal Ready',     color:'#4ADE80', bg:'rgba(74,222,128,.12)'},
    closed_won:     {label:'Closed Won',     color:'#C8A96E', bg:'rgba(200,169,110,.15)'},
    not_interested: {label:'Not Interested', color:'#F87171', bg:'rgba(248,113,113,.10)'},
  }
  const ICP_CFG = {
    strong:  {label:'Strong',  color:'#4ADE80'},
    good:    {label:'Good',    color:'#58A6FF'},
    partial: {label:'Partial', color:'#FCD34D'},
  }
  const FILTERS = [
    {key:'all',        label:'All'},
    {key:'pending',    label:'Pending'},
    {key:'contacted',  label:'Contacted'},
    {key:'replied',    label:'Replied'},
    {key:'deal_ready', label:'Deal Ready'},
    {key:'audited',    label:'Audited'},
  ]
  const scoreColor = s => s >= 9 ? '#4ADE80' : s >= 7 ? '#FCD34D' : s >= 4 ? '#F97316' : '#F87171'
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-BD',{timeZone:'Asia/Dhaka',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'

  const loadData = React.useCallback(async (silent) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const [l, og] = await Promise.all([
        db('corporate_leads', `?tenant_id=eq.${TENANT}&select=*&order=priority.asc,created_at.asc`),
        db('outreach_log',    `?tenant_id=eq.${TENANT}&select=*&order=sent_at.desc&limit=100`),
      ])
      const leadsArr = Array.isArray(l)  ? l  : []
      const logArr   = Array.isArray(og) ? og : []
      setLeads(leadsArr)
      setLog(logArr)
      setSelected(prev => prev ? (leadsArr.find(x => x.id === prev.id) || null) : null)
    } catch(e) { console.error('[LeadPipeline] load error', e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  // Derived
  const stats = {
    total:      leads.length,
    contacted:  leads.filter(l => ['contacted','replied','audited','deal_ready','closed_won'].includes(l.status)).length,
    replied:    leads.filter(l => ['replied','audited','deal_ready','closed_won'].includes(l.status)).length,
    deal_ready: leads.filter(l => l.status === 'deal_ready').length,
  }
  const s = search.toLowerCase()
  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false
    if (s && !l.company_name?.toLowerCase().includes(s)
          && !l.contact_name?.toLowerCase().includes(s)
          && !l.contact_email?.toLowerCase().includes(s)) return false
    return true
  })
  const leadLog = selected ? log.filter(e => e.lead_id === selected.id) : []

  const handleRunBot = React.useCallback(async () => {
    setRunningBot(true); setBotResult(null)
    if (botTimerRef.current) clearTimeout(botTimerRef.current)
    try {
      const res  = await fetch('/api/agents/outreach-bot', {method:'POST'})
      const data = await res.json()
      if (data.error) {
        const msg = data.error.includes('schema cache') ? 'DB function not ready — wait 30s and retry'
          : data.error.includes('BREVO') ? 'Email service error — check BREVO_API_KEY in Vercel'
          : data.error.includes('Env missing') ? 'Missing env var: ' + data.error.split(':')[1]
          : data.error
        setBotResult({ok:false, msg})
      } else {
        const names = (data.results || []).filter(r=>r.sent).map(r=>r.lead).join(', ')
        setBotResult({ok:true, processed:data.processed ?? 0, names})
        botTimerRef.current = setTimeout(() => setBotResult(null), 10000)
        await loadData(true)
      }
    } catch(e) { setBotResult({ok:false, msg:String(e)}) }
    setRunningBot(false)
  }, [loadData])

  const handleStatusChange = React.useCallback(async (leadId, newStatus) => {
    try {
      await dbPatch('corporate_leads', leadId, {status:newStatus, updated_at:new Date().toISOString()})
      await loadData(true)
    } catch(e) { console.error('[LeadPipeline] status patch error', e) }
  }, [loadData])

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--tx3)',fontSize:13}}>
      Loading lead pipeline…
    </div>
  )

  return (
    <div style={{padding:'24px 28px',overflowY:'auto',height:'100%',background:'var(--bg)',boxSizing:'border-box'}}>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div style={{fontFamily:'var(--serif)',fontSize:22,color:'var(--gold)',marginBottom:4}}>
            Corporate <em>Lead Pipeline</em>
          </div>
          <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase'}}>{_HLOC}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>loadData(true)} disabled={refreshing}
            style={{background:'none',border:'1px solid var(--br2)',color:refreshing?'var(--gold)':'var(--tx3)',
              padding:'7px 14px',fontSize:11,letterSpacing:'.08em',cursor:'pointer',
              fontFamily:'var(--sans)',textTransform:'uppercase'}}>
            {refreshing ? '⟳' : '↻ Refresh'}
          </button>
          <button onClick={handleRunBot} disabled={runningBot}
            style={{background:runningBot?'rgba(200,169,110,.06)':'rgba(200,169,110,.15)',
              border:'1px solid rgba(200,169,110,.35)',color:'var(--gold)',padding:'7px 20px',
              fontSize:12,letterSpacing:'.08em',cursor:runningBot?'not-allowed':'pointer',
              fontFamily:'var(--sans)',textTransform:'uppercase'}}>
            {runningBot ? '⟳ Sending emails…' : '▶ Run OutreachBot'}
          </button>
        </div>
      </div>

      {/* ── Bot result banner ── */}
      {botResult && (
        <div style={{background:botResult.ok?'rgba(74,222,128,.07)':'rgba(248,113,113,.07)',
          border:`1px solid ${botResult.ok?'rgba(74,222,128,.25)':'rgba(248,113,113,.25)'}`,
          padding:'10px 16px',marginBottom:16,fontSize:12,
          color:botResult.ok?'#4ADE80':'#F87171',display:'flex',alignItems:'flex-start',gap:12}}>
          <span style={{flex:1,lineHeight:1.7}}>
            {botResult.ok
              ? `✓ OutreachBot sent ${botResult.processed} email${botResult.processed!==1?'s':''}${botResult.names?' — '+botResult.names:''}`
              : `⚠ ${botResult.msg}`}
          </span>
          <button onClick={()=>{if(botTimerRef.current)clearTimeout(botTimerRef.current);setBotResult(null)}}
            style={{background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:18,opacity:.6,padding:0,lineHeight:1}}>×</button>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
        {[
          {label:'Total Leads',   val:stats.total,      color:'var(--tx2)'},
          {label:'Contacted',     val:stats.contacted,  color:'#58A6FF'},
          {label:'Replied',       val:stats.replied,    color:'#FCD34D'},
          {label:'Deal Ready 🔥', val:stats.deal_ready, color:'#4ADE80'},
        ].map(s => (
          <div key={s.label} style={{background:'var(--s4)',border:'1px solid var(--br2)',padding:'14px 18px'}}>
            <div style={{fontFamily:'var(--mono)',fontSize:28,color:s.color,lineHeight:1}}>{s.val}</div>
            <div style={{fontSize:10,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--tx3)',marginTop:5}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Main layout ── */}
      <div style={{display:'grid',gridTemplateColumns:selected?'1fr 320px':'1fr 280px',gap:14,alignItems:'start'}}>

        {/* LEFT — Lead Table */}
        <div style={{background:'var(--s4)',border:'1px solid var(--br2)'}}>

          {/* Tabs + search */}
          <div style={{display:'flex',alignItems:'center',borderBottom:'1px solid var(--br2)',paddingRight:12}}>
            <div style={{display:'flex',flex:1,overflowX:'auto',padding:'0 6px'}}>
              {FILTERS.map(f => {
                const cnt = f.key==='all' ? leads.length : leads.filter(l=>l.status===f.key).length
                return (
                  <button key={f.key} onClick={()=>setFilter(f.key)}
                    style={{background:'none',border:'none',color:filter===f.key?'var(--gold)':'var(--tx3)',
                      padding:'10px 11px',fontSize:11,letterSpacing:'.08em',textTransform:'uppercase',
                      cursor:'pointer',borderBottom:filter===f.key?'2px solid var(--gold)':'2px solid transparent',
                      marginBottom:-1,fontFamily:'var(--sans)',whiteSpace:'nowrap',flexShrink:0}}>
                    {f.label} <span style={{opacity:.55,fontFamily:'var(--mono)',fontSize:10}}>({cnt})</span>
                  </button>
                )
              })}
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
              style={{background:'rgba(255,255,255,.04)',border:'1px solid var(--br2)',color:'var(--tx)',
                padding:'5px 10px',fontSize:11,outline:'none',width:130,fontFamily:'var(--sans)'}}/>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{padding:40,textAlign:'center',color:'var(--tx3)',fontSize:13}}>
              {search ? `No leads matching "${search}"` : 'No leads in this filter.'}
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--br2)'}}>
                    {['Company','Contact','ICP','Status','Score','Priority'].map(h => (
                      <th key={h} style={{textAlign:'left',padding:'9px 14px',fontSize:10,
                        letterSpacing:'.14em',textTransform:'uppercase',color:'var(--tx3)',fontWeight:400}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, i) => {
                    const st  = STATUS_CFG[lead.status]  || STATUS_CFG.pending
                    const icp = ICP_CFG[lead.icp_score]  || ICP_CFG.good
                    const isSel = selected?.id === lead.id
                    return (
                      <tr key={lead.id} onClick={()=>setSelected(isSel?null:lead)}
                        style={{borderBottom:'1px solid rgba(200,169,110,.05)',cursor:'pointer',
                          background:isSel?'rgba(200,169,110,.07)':i%2===0?'transparent':'rgba(255,255,255,.012)',
                          borderLeft:isSel?'2px solid var(--gold)':'2px solid transparent'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{fontWeight:500,fontSize:13,color:'var(--tx)'}}>{lead.company_name}</div>
                          <div style={{fontSize:10,color:'var(--tx3)',marginTop:2,fontFamily:'var(--mono)'}}>{lead.company_address?.split(',')[0] || '—'}</div>
                        </td>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{fontSize:12,color:'var(--tx2)'}}>{lead.contact_name || lead.contact_title || '—'}</div>
                          <div style={{fontSize:10,color:'var(--gold)',fontFamily:'var(--mono)',marginTop:2}}>{lead.contact_email || '—'}</div>
                        </td>
                        <td style={{padding:'12px 14px'}}>
                          <span style={{fontSize:11,color:icp.color,background:`${icp.color}18`,
                            padding:'2px 8px',border:`1px solid ${icp.color}30`}}>{icp.label}</span>
                        </td>
                        <td style={{padding:'12px 14px'}}>
                          <span style={{fontSize:11,color:st.color,background:st.bg,
                            padding:'3px 10px',border:`1px solid ${st.color}30`}}>
                            {lead.status==='deal_ready'?'🔥 ':''}{st.label}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',fontFamily:'var(--mono)',fontSize:13,
                          color:lead.deal_score?scoreColor(lead.deal_score):'var(--tx3)'}}>
                          {lead.deal_score?`${lead.deal_score}/10`:'—'}
                        </td>
                        <td style={{padding:'12px 14px'}}>
                          <span style={{fontSize:10,letterSpacing:'.1em',textTransform:'uppercase',
                            color:lead.priority==='high'?'#F87171':lead.priority==='med'?'var(--gold)':'var(--tx3)',
                            fontWeight:lead.priority==='high'?600:400}}>
                            {(lead.priority||'—').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT — Sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Lead Detail Panel */}
          {selected ? (
            <div style={{background:'var(--s4)',border:'1px solid rgba(200,169,110,.28)',padding:18}}>
              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                <div>
                  <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--tx)',marginBottom:3}}>{selected.company_name}</div>
                  <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:'.1em',textTransform:'uppercase'}}>{selected.industry || 'Industry Unknown'}</div>
                </div>
                <button onClick={()=>setSelected(null)}
                  style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:18,lineHeight:1,padding:0,opacity:.7}}>×</button>
              </div>

              {/* Deal score bar */}
              {selected.deal_score ? (
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',
                  background:'rgba(0,0,0,.2)',border:`1px solid ${scoreColor(selected.deal_score)}25`,marginBottom:14}}>
                  <div style={{textAlign:'center',minWidth:44}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:28,color:scoreColor(selected.deal_score),lineHeight:1}}>{selected.deal_score}</div>
                    <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.14em',marginTop:2}}>/10</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:6}}>CEO Score</div>
                    <div style={{height:3,background:'rgba(255,255,255,.07)'}}>
                      <div style={{height:'100%',width:`${selected.deal_score*10}%`,background:scoreColor(selected.deal_score)}}/>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Contact rows */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Contact</div>
                {[
                  {lbl:'Name',  val:selected.contact_name  || '—'},
                  {lbl:'Title', val:selected.contact_title || '—'},
                  {lbl:'Email', val:selected.contact_email || '—', mono:true, gold:true},
                  {lbl:'Phone', val:selected.contact_phone || '—', mono:true},
                  {lbl:'Web',   val:selected.company_website || '—', mono:true},
                ].map(row => (
                  <div key={row.lbl} style={{display:'flex',gap:8,marginBottom:5}}>
                    <div style={{fontSize:10,color:'var(--tx3)',width:34,flexShrink:0,paddingTop:1}}>{row.lbl}</div>
                    <div style={{fontSize:11,color:row.gold?'var(--gold)':'var(--tx2)',
                      fontFamily:row.mono?'var(--mono)':'var(--sans)',wordBreak:'break-all',lineHeight:1.4}}>{row.val}</div>
                  </div>
                ))}
              </div>

              {/* Next action from latest audit */}
              {leadLog.find(e=>e.ceo_next_action) && (
                <div style={{padding:'9px 12px',background:'rgba(200,169,110,.05)',
                  border:'1px solid rgba(200,169,110,.2)',marginBottom:14}}>
                  <div style={{fontSize:9,color:'var(--gold)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:4}}>→ Recommended Action</div>
                  <div style={{fontSize:12,color:'var(--tx)',lineHeight:1.6}}>
                    {leadLog.find(e=>e.ceo_next_action).ceo_next_action}
                  </div>
                </div>
              )}

              {/* Deal score reasoning */}
              {leadLog.find(e=>e.deal_score_reason) && (
                <div style={{padding:'9px 12px',background:'rgba(0,0,0,.15)',
                  border:'1px solid var(--br2)',marginBottom:14}}>
                  <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:4}}>CEO Reasoning</div>
                  <div style={{fontSize:11,color:'var(--tx2)',lineHeight:1.7}}>
                    {leadLog.find(e=>e.deal_score_reason).deal_score_reason?.split('|')[0]?.trim()}
                  </div>
                </div>
              )}

              {/* Status switcher */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>Update Status</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {Object.entries(STATUS_CFG).map(([key,cfg]) => {
                    const active = selected.status === key
                    return (
                      <button key={key}
                        onClick={()=>!active && handleStatusChange(selected.id, key)}
                        style={{fontSize:10,padding:'3px 8px',cursor:active?'default':'pointer',letterSpacing:'.04em',
                          background:active?cfg.bg:'transparent',color:active?cfg.color:'var(--tx3)',
                          border:active?`1px solid ${cfg.color}50`:'1px solid rgba(255,255,255,.07)'}}>
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.7,padding:'8px 0',borderTop:'1px solid var(--br2)',marginBottom:10}}>
                  {selected.notes}
                </div>
              )}

              {/* Lead activity log */}
              {leadLog.length > 0 && (
                <div style={{borderTop:'1px solid var(--br2)',paddingTop:12}}>
                  <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:10}}>
                    Activity ({leadLog.length})
                  </div>
                  {leadLog.slice(0,6).map(e => (
                    <div key={e.id} style={{display:'flex',gap:8,marginBottom:10,fontSize:11}}>
                      <span style={{fontSize:13,flexShrink:0}}>{e.is_deal_ready?'🔥':e.direction==='inbound'?'📥':'📤'}</span>
                      <div style={{flex:1}}>
                        <div style={{color:'var(--tx2)',marginBottom:2,lineHeight:1.4}}>{e.subject?.substring(0,44) || '(no subject)'}</div>
                        {e.deal_score && (
                          <div style={{color:scoreColor(e.deal_score),fontFamily:'var(--mono)',fontSize:10,marginBottom:1}}>
                            Score: {e.deal_score}/10
                          </div>
                        )}
                        <div style={{color:'var(--tx3)',fontFamily:'var(--mono)',fontSize:10}}>{fmtDate(e.sent_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Recent Activity (when nothing selected) */
            <div style={{background:'var(--s4)',border:'1px solid var(--br2)',padding:16}}>
              <div style={{fontSize:11,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--gold)',marginBottom:14}}>Recent Activity</div>
              {log.length === 0 ? (
                <div style={{fontSize:12,color:'var(--tx3)'}}>No activity yet.</div>
              ) : log.slice(0,8).map((entry, i) => {
                const company = leads.find(l=>l.id===entry.lead_id)?.company_name
                return (
                  <div key={entry.id} style={{borderBottom:i<7?'1px solid rgba(200,169,110,.06)':'none',paddingBottom:10,marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:11}}>{entry.is_deal_ready?'🔥':entry.direction==='inbound'?'📥':'📤'}</span>
                      <span style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.1em',
                        color:entry.is_deal_ready?'#4ADE80':entry.direction==='inbound'?'#FCD34D':'#58A6FF'}}>
                        {entry.is_deal_ready?'Deal Ready':entry.direction==='inbound'?'Reply':'Outreach'}
                      </span>
                      {entry.deal_score && <span style={{fontSize:10,color:'#4ADE80',fontFamily:'var(--mono)',marginLeft:'auto'}}>{entry.deal_score}/10</span>}
                    </div>
                    {company && <div style={{fontSize:11,color:'var(--gold)',marginBottom:2}}>{company}</div>}
                    <div style={{fontSize:11,color:'var(--tx2)',marginBottom:2}}>{entry.subject?.substring(0,44) || '(no subject)'}</div>
                    {entry.ceo_next_action && <div style={{fontSize:10,color:'var(--tx3)',fontStyle:'italic',marginBottom:2}}>→ {entry.ceo_next_action.substring(0,52)}</div>}
                    <div style={{fontSize:10,color:'var(--tx3)',fontFamily:'var(--mono)'}}>{fmtDate(entry.sent_at)}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Agent Status (always visible) */}
          <div style={{background:'var(--s4)',border:'1px solid var(--br2)',padding:16}}>
            <div style={{fontSize:11,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--gold)',marginBottom:12}}>Agent Status</div>
            {[
              {name:'OutreachBot',  status:'Cron 9AM BDT', icon:'📤', color:'#58A6FF'},
              {name:'ReplyIntake',  status:'Webhook live', icon:'📥', color:'#4ADE80'},
              {name:'CEOAuditor',   status:'On demand',    icon:'🧠', color:'#A78BFA'},
              {name:'DealAlert',    status:'Auto-trigger', icon:'🔥', color:'#FCD34D'},
            ].map(agent => (
              <div key={agent.name} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <span style={{fontSize:14}}>{agent.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:'var(--tx)',fontWeight:500}}>{agent.name}</div>
                  <div style={{fontSize:10,color:agent.color}}>{agent.status}</div>
                </div>
                <div style={{width:6,height:6,borderRadius:'50%',background:agent.color,boxShadow:`0 0 6px ${agent.color}`}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}




function App() {
  const [user,setUser]=useState(null)
  const [page,setPage]=useState('dashboard')
  const [data,setData]=useState({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]})
  const [loading,setLoading]=useState(false)
  const [toastMsg,setToastMsg]=useState(null)
  useEffect(()=>{ const el=document.getElementById('loading'); if(el) el.style.display='none'; },[])
  const [clock,setClock]=useState(new Date())
  const [notifOpen,setNotifOpen]=useState(false)
  const [notifRoomSels,setNotifRoomSels]=useState({})
  const [confirmingIds,setConfirmingIds]=useState(new Set())
  const [staffList,setStaffList]=useState(INIT_STAFF)
  const [businessDate,setBusinessDate]=useState(null) // only set from hotel_settings.active_fiscal_day — never auto-advances
  useEffect(()=>{
    db('staff',`?tenant_id=eq.${TENANT}&select=*&order=id`)
      .then(d=>{ if(Array.isArray(d)&&d.length>0) setStaffList(d) })
      .catch(()=>{}) // silently fall back to INIT_STAFF
  },[])
  const toastRef=useRef()

  const toast=useCallback((msg,type='success')=>{
    setToastMsg({msg,type})
    clearTimeout(toastRef.current)
    toastRef.current=setTimeout(()=>setToastMsg(null),3500)
  },[])

  useEffect(()=>{ const t=setInterval(()=>setClock(new Date()),1000); return()=>clearInterval(t) },[])

  const loadAll=useCallback(async()=>{
    try {
      const [rooms,guests,reservations,transactions,tasks,bdRows]=await Promise.all([
        db('rooms',`?tenant_id=eq.${TENANT}&select=*&order=room_number`),
        dbAll('guests',`?tenant_id=eq.${TENANT}&select=*&order=name`),
        db('reservations',`?tenant_id=eq.${TENANT}&select=*&order=check_in.desc&limit=500`),
        db('transactions',`?tenant_id=eq.${TENANT}&select=*&amount=gt.0&order=timestamp.desc&limit=400`),
        db('housekeeping_tasks',`?tenant_id=eq.${TENANT}&select=*&order=created_at.desc&limit=100`),
        db('hotel_settings',`?tenant_id=eq.${TENANT}&key=eq.active_fiscal_day&select=value`).catch(()=>[]),
      ])
      if(Array.isArray(bdRows)&&bdRows[0]?.value) {
        setBusinessDate(bdRows[0].value)
      }
      // NOTE: if active_fiscal_day row absent, businessDate stays null.
      // Components fall back to todayStr() via (businessDate||todayStr()) — correct.
      setData({
        rooms:Array.isArray(rooms)?rooms:[],
        guests:Array.isArray(guests)?guests:[],
        reservations:Array.isArray(reservations)?reservations:[],
        transactions:Array.isArray(transactions)?transactions:[],
        tasks:Array.isArray(tasks)?tasks:[],
      })
    } catch(e){
      console.error('Load failed',e)
      toast('Failed to refresh data — check connection','error')
    }
  },[toast])

  useEffect(()=>{
    if(!user){ setData({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]}); return }
    setLoading(true)
    const loadTimeout=setTimeout(()=>setLoading(false),10000) // force clear after 10s
    loadAll().finally(()=>{ clearTimeout(loadTimeout); setLoading(false) })
    const interval=setInterval(loadAll,90000)
    return()=>clearInterval(interval)
  },[user]) // intentionally omit loadAll to avoid re-running on every render

  function signOut() {
    setUser(null)
    setPage('dashboard')
    setNotifOpen(false)
    setData({rooms:[],guests:[],reservations:[],transactions:[],tasks:[]})
    setToastMsg(null)
  }

  if(!user) return (
    <>
      <style>{CSS}</style>
      {/* BUG FIX: pass live staffList so login sees added/edited users */}
      <LoginPage onLogin={u=>{ setUser({...u}); setPage('dashboard') }} staffList={staffList}/>
    </>
  )

  if(loading&&user) return (
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
  const pendResList=data.reservations.filter(r=>r.status==='PENDING')
  const pendRes=pendResList.length
  const hkUrgent=data.tasks.filter(t=>t.status==='pending'&&t.priority==='high').length
  const dirtyRooms=data.rooms.filter(r=>r.status==='DIRTY').length
  const totalNotifs=pendRes+hkUrgent+dirtyRooms

  function getPendingGuestInfo(res) {
    const guestId=String((res.guest_ids||[])[0]||'')
    const g=data.guests.find(x=>String(x.id)===guestId)
    const sr=res.special_requests||''
    const roomMatch=sr.match(/Room Type:\s*([^|]+)/)
    const phoneMatch=sr.match(/Phone:\s*([^|]+)/)
    const emailMatch=sr.match(/Email:\s*([^|]+)/)
    return {
      name: g?.name || res.on_duty_officer || 'Walk-in Guest',
      phone: g?.phone || (phoneMatch?phoneMatch[1].trim():'—'),
      email: g?.email || (emailMatch?emailMatch[1].trim():'—'),
      roomType: (roomMatch?roomMatch[1].trim():null) || (res.room_ids||[]).join(', ') || 'Not assigned',
      checkIn: res.check_in,
      checkOut: res.check_out,
      isOnline: sr.includes('ONLINE BOOKING'),
      id: res.id
    }
  }

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
  const bdParts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short',hourCycle:'h12'}).formatToParts(clock)
  const _p = k => bdParts.find(p=>p.type===k)?.value || ''
  const clockStr=(()=>{
    const hh=_p('hour'), mm=_p('minute'), ss=_p('second'), dp=_p('dayPeriod')
    const timeStr = `${hh}:${mm}:${ss} ${dp}`
    const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return timeStr+' · '+_p('weekday')+', '+parseInt(_p('day'))+' '+mo[+_p('month')-1]+' '+_p('year')
  })()

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

            {/* ── NOTIFICATION BELL ── */}
            <div style={{position:'relative'}}>
              <button
                className="btn btn-ghost btn-sm"
                style={{position:'relative',padding:'5px 10px',fontSize:15}}
                onClick={e=>{ e.stopPropagation(); setNotifOpen(p=>!p) }}
              >
                🔔
                {totalNotifs>0&&(
                  <span style={{position:'absolute',top:4,right:4,width:7,height:7,borderRadius:'50%',background:'var(--rose)',boxShadow:'0 0 5px var(--rose)',animation:'pulse 2s infinite'}}/>
                )}
              </button>

              {notifOpen&&(
                <div style={{position:'absolute',right:0,top:'calc(100% + 8px)',width:360,background:'var(--s1)',border:'1px solid var(--br)',boxShadow:'0 20px 60px rgba(0,0,0,.8)',zIndex:200,overflow:'hidden',animation:'mIn .18s ease'}} onClick={e=>e.stopPropagation()}>

                  {/* Header */}
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--br2)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(200,169,110,.04)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:13}}>🔔</span>
                      <span style={{fontFamily:'var(--serif)',fontSize:16,fontWeight:300,color:'var(--tx)'}}>Notifications</span>
                      {totalNotifs>0&&<span style={{background:'var(--rose)',color:'#fff',fontSize:9,padding:'1px 7px',fontFamily:'var(--sans)',fontWeight:400,letterSpacing:'.06em'}}>{totalNotifs}</span>}
                    </div>
                    <button style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:16,lineHeight:1}} onClick={()=>setNotifOpen(false)}>×</button>
                  </div>

                  <div style={{maxHeight:480,overflowY:'auto'}}>

                    {/* ── PENDING BOOKING CARDS from Landing Page ── */}
                    {pendResList.length>0&&(
                      <div>
                        <div style={{padding:'8px 16px',fontSize:8,letterSpacing:'.18em',color:'var(--gold)',textTransform:'uppercase',fontFamily:'var(--sans)',fontWeight:200,background:'rgba(200,169,110,.03)',borderBottom:'1px solid var(--br2)'}}>
                          📅 Pending Booking Requests — {pendResList.length} new
                        </div>
                        {pendResList.map(res=>{
                          const info=getPendingGuestInfo(res)
                          return (
                            <div key={res.id} style={{padding:'14px 16px',borderBottom:'1px solid var(--br2)',background:info.isOnline?'rgba(200,169,110,.03)':'transparent'}}>
                              {/* Guest info row */}
                              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10}}>
                                <div style={{display:'flex',alignItems:'center',gap:10}}>
                                  <div style={{width:34,height:34,borderRadius:'50%',background:`linear-gradient(135deg,var(--gold),rgba(200,169,110,.3))`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--sans)',fontSize:12,color:'#07090E',fontWeight:500,flexShrink:0}}>
                                    {info.name.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{fontFamily:'var(--sans)',fontSize:13,fontWeight:400,color:'var(--tx)',marginBottom:2}}>{info.name}</div>
                                    {info.isOnline&&<span style={{background:'rgba(200,169,110,.12)',border:'1px solid rgba(200,169,110,.25)',color:'var(--gold)',fontSize:7.5,padding:'1px 6px',fontFamily:'var(--sans)',letterSpacing:'.1em',textTransform:'uppercase'}}>Online Booking</span>}
                                  </div>
                                </div>
                                <div style={{fontSize:8,color:'var(--tx3)',fontFamily:'var(--sans)',fontWeight:200,letterSpacing:'.06em',textAlign:'right',whiteSpace:'nowrap'}}>{fmtDate(info.checkIn)}<br/>→ {fmtDate(info.checkOut)}</div>
                              </div>

                              {/* Detail grid */}
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:12}}>
                                <div style={{background:'rgba(200,169,110,.04)',border:'1px solid var(--br2)',padding:'7px 10px'}}>
                                  <div style={{fontSize:7,letterSpacing:'.16em',color:'var(--tx3)',textTransform:'uppercase',fontFamily:'var(--sans)',marginBottom:3,fontWeight:200}}>📞 Contact</div>
                                  <div style={{fontSize:11.5,color:'var(--tx)',fontFamily:'var(--sans)',fontWeight:300}}>{info.phone}</div>
                                </div>
                                <div style={{background:'rgba(200,169,110,.04)',border:'1px solid var(--br2)',padding:'7px 10px'}}>
                                  <div style={{fontSize:7,letterSpacing:'.16em',color:'var(--tx3)',textTransform:'uppercase',fontFamily:'var(--sans)',marginBottom:3,fontWeight:200}}>🏷 Room Type</div>
                                  <div style={{fontSize:11.5,color:'var(--gold)',fontFamily:'var(--sans)',fontWeight:300}}>{info.roomType}</div>
                                </div>
                                <div style={{background:'rgba(200,169,110,.04)',border:'1px solid var(--br2)',padding:'7px 10px',gridColumn:'span 2'}}>
                                  <div style={{fontSize:7,letterSpacing:'.16em',color:'var(--tx3)',textTransform:'uppercase',fontFamily:'var(--sans)',marginBottom:3,fontWeight:200}}>✉️ Email</div>
                                  <div style={{fontSize:11.5,color:'var(--tx2)',fontFamily:'var(--sans)',fontWeight:300,wordBreak:'break-all'}}>{info.email}</div>
                                </div>
                              </div>

                              {/* Actions */}
                              {(()=>{
                                const availRooms=data.rooms.filter(r=>r.status==='AVAILABLE')
                                const preferred=availRooms.filter(r=>r.category===info.roomType)
                                const roomList=preferred.length>0?preferred:availRooms
                                const selRoom=notifRoomSels[res.id]||(roomList[0]?.room_number||'')
                                const isConfirming=confirmingIds.has(res.id)
                                return (
                                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                    {/* Room selector */}
                                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                      <div style={{fontSize:7,letterSpacing:'.14em',color:'var(--tx3)',textTransform:'uppercase',fontFamily:'var(--sans)',fontWeight:200,whiteSpace:'nowrap'}}>Assign Room</div>
                                      <select
                                        className="fselect"
                                        style={{flex:1,fontSize:11,padding:'4px 8px',background:'#1C1510',color:'var(--tx)',border:'1px solid rgba(200,169,110,.25)'}}
                                        value={selRoom}
                                        onChange={e=>setNotifRoomSels(p=>({...p,[res.id]:e.target.value}))}
                                      >
                                        {roomList.length===0&&<option value="">— No AVAILABLE rooms —</option>}
                                        {roomList.map(r=>(
                                          <option key={r.id} value={r.room_number}>{r.room_number} · {r.category||''} · ৳{(+r.price||0).toLocaleString()}/night</option>
                                        ))}
                                      </select>
                                    </div>
                                    {/* Confirm + Cancel */}
                                    <div style={{display:'flex',gap:6}}>
                                      <button
                                        className="btn btn-success btn-sm"
                                        style={{flex:1,justifyContent:'center',fontSize:9.5,letterSpacing:'.1em',opacity:isConfirming?0.6:1}}
                                        disabled={isConfirming||!selRoom||roomList.length===0}
                                        onClick={async()=>{
                                          if(isConfirming) return
                                          setConfirmingIds(p=>{const s=new Set(p);s.add(res.id);return s})
                                          try{
                                            const fresh=await db('rooms',`?tenant_id=eq.${TENANT}&room_number=eq.${selRoom}&status=eq.AVAILABLE&select=id,room_number`)
                                            if(!fresh||fresh.length===0){toast('Room no longer available — pick another','error');setConfirmingIds(p=>{const s=new Set(p);s.delete(res.id);return s});loadAll();return}
                                            const roomRec=data.rooms.find(r=>String(r.room_number)===String(selRoom))
                                            (()=>{
                                              const ciDate=new Date((res.check_in||'').replace(' ','T').split('+')[0])
                                              const coDate=new Date((res.check_out||'').replace(' ','T').split('+')[0])
                                              const nights=(!isNaN(ciDate)&&!isNaN(coDate))?Math.max(1,Math.round((coDate-ciDate)/86400000)):1
                                              const roomPrice=+(roomRec?.price||0)
                                              const computedTotal=roomPrice*nights||(+(res.total_amount||0))
                                              return dbPatch('reservations',res.id,{status:'RESERVED',room_ids:[String(selRoom)],room_id:roomRec.id,room_type:roomRec.category||info.roomType||'',total_amount:computedTotal})
                                            })()
                                            await dbPatch('rooms',roomRec.id,{status:'RESERVED'})
                                            try{
                                              await fetch(`${SB_URL}/functions/v1/send-booking-email`,{
                                                method:'POST',
                                                headers:{'Content-Type':'application/json','Authorization':`Bearer ${SB_KEY}`},
                                                body:JSON.stringify({
                                                  to:info.email,guestName:info.name,
                                                  roomNo:selRoom,roomType:info.roomType,
                                                  checkIn:info.checkIn,checkOut:info.checkOut,
                                                  total:res.total_amount||0,phone:info.phone
                                                })
                                              })
                                            }catch(emailErr){console.warn('Email send failed:',emailErr)}
                                            toast(`✓ Room ${selRoom} assigned & confirmation sent to ${info.email}`,'success')
                                            setNotifRoomSels(p=>{const n={...p};delete n[res.id];return n})
                                            loadAll()
                                          }catch(e){toast(e.message,'error')}
                                          finally{setConfirmingIds(p=>{const s=new Set(p);s.delete(res.id);return s})}
                                        }}
                                      >{isConfirming?'Confirming…':'✓ Confirm & Send Email'}</button>
                                      <button
                                        className="btn btn-ghost btn-sm"
                                        style={{fontSize:9.5,letterSpacing:'.1em',borderColor:'rgba(220,50,50,.3)',color:'var(--rose)'}}
                                        disabled={isConfirming}
                                        onClick={async()=>{
                                          if(!confirm(`Cancel booking for ${info.name}?`)) return
                                          try{
                                            await dbPatch('reservations',res.id,{status:'CANCELLED'})
                                            toast(`Booking for ${info.name} cancelled`,'info')
                                            loadAll()
                                          }catch(e){toast(e.message,'error')}
                                        }}
                                      >✕ Cancel</button>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* HK urgent tasks */}
                    {hkUrgent>0&&(
                      <div className="notif-item" onClick={()=>{ setPage('housekeeping'); setNotifOpen(false) }}>
                        🧹 {hkUrgent} high-priority housekeeping task{hkUrgent>1?'s':''}
                      </div>
                    )}

                    {/* Dirty rooms */}
                    {dirtyRooms>0&&(
                      <div className="notif-item" onClick={()=>{ setPage('housekeeping'); setNotifOpen(false) }}>
                        🏨 {dirtyRooms} room{dirtyRooms>1?'s':''} require cleaning
                      </div>
                    )}

                    {/* All clear */}
                    {totalNotifs===0&&(
                      <div className="notif-item" style={{textAlign:'center',color:'var(--tx3)',cursor:'default',padding:'20px'}}>✓ All clear — no alerts</div>
                    )}

                  </div>{/* end scroll */}
                </div>
              )}
            </div>

            <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--gold-light)',letterSpacing:'.1em',border:'1px solid rgba(200,169,110,.3)',padding:'3px 8px',marginRight:4}} title="Current Business Date">{(()=>{if(!businessDate)return'—';const[y,m,d]=businessDate.split('-');return `${+d}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}-${y}`})()}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>{ loadAll(); toast('Data refreshed','info') }} title="Refresh data">↻</button>
          </div>

          {/* Close notif by clicking content area */}
          <div className="content" onClick={()=>notifOpen&&setNotifOpen(false)}>
            {cur==='dashboard'    &&<Dashboard rooms={data.rooms} guests={data.guests} reservations={data.reservations} transactions={data.transactions} setPage={setPage} businessDate={businessDate}/>}
            {cur==='rooms'        &&<RoomsPage rooms={data.rooms} guests={data.guests} reservations={data.reservations} toast={toast} currentUser={user} reload={loadAll} businessDate={businessDate}/>}
            {cur==='reservations' &&<ReservationsPage reservations={data.reservations} guests={data.guests} rooms={data.rooms} toast={toast} currentUser={user} reload={loadAll} businessDate={businessDate} transactions={data.transactions}/>}
            {cur==='guests'       &&<GuestsPage guests={data.guests} reservations={data.reservations} toast={toast} currentUser={user} reload={loadAll}/>}
            {cur==='housekeeping' &&<HousekeepingPage tasks={data.tasks} rooms={data.rooms} toast={toast} currentUser={user} reload={loadAll}/>}
            {cur==='billing'      &&<BillingPage transactions={data.transactions} reservations={data.reservations} rooms={data.rooms} guests={data.guests} toast={toast} reload={loadAll} currentUser={user} businessDate={businessDate}/>}
            {cur==='reports'      &&<ReportsPage transactions={data.transactions} rooms={data.rooms} reservations={data.reservations} guests={data.guests}/>}

            {cur==='settings'     &&<SettingsPage currentUser={user} toast={toast} staffList={staffList} setStaffList={setStaffList} reservations={data.reservations} rooms={data.rooms} guests={data.guests}/>}
          </div>
        </main>
      </div>
            {toastMsg&&<Toast msg={toastMsg.msg} type={toastMsg.type}/>}
    </>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null))
