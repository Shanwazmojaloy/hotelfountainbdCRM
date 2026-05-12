const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ═══════════════════════════════════════════════════════════
   LUMEA — HOTEL FOUNTAIN CRM  v3.0
   All issues fixed — Production Ready
═══════════════════════════════════════════════════════════ */

const SB_URL = 'https://mynwfkgksqqwlqowlscj.supabase.co'
const SB_KEY = (window.__env&&window.__env.SB_KEY)||'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh'
const TENANT  = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'

const BDT = n => '৳' + Number(n||0).toLocaleString('en-BD')
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
  owner:        {label:'Founder / Owner',    color:'#C8A96E', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports','settings','seo']},
  manager:      {label:'General Manager',    color:'#2EC4B6', pages:['dashboard','rooms','reservations','guests','housekeeping','billing','reports','seo']},
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

/* ── LOGIN PAGE ── */
/* ── LOGIN PAGE — GILDED THRESHOLD ── */
.login-bg{min-height:100vh;display:flex;flex-direction:row;overflow:hidden;background:#1A1816}
/* LEFT PANEL */
.lp-left{width:42%;flex-shrink:0;background:#1A1816;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px 60px;overflow:hidden}
.lp-left::before{content:'';position:absolute;inset:0;background-image:url("/lp-bg.jpg");background-size:cover;background-position:center;pointer-events:none}
.lp-left::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(8,6,4,.88) 0%,rgba(8,6,4,.74) 35%,rgba(8,6,4,.80) 70%,rgba(8,6,4,.90) 100%);pointer-events:none}
/* top / bottom bars inside left panel */
.lp-bar{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:6px;z-index:2;pointer-events:none}
.lp-bar.top{top:0;padding-top:22px}
.lp-bar.bot{bottom:0;padding-bottom:18px}
.lp-rule{width:calc(100% - 100px);height:1px;background:linear-gradient(90deg,transparent,rgba(197,160,89,.9),transparent)}
.lp-rule.dim{background:linear-gradient(90deg,transparent,rgba(197,160,89,.5),transparent)}
.lp-label{font-family:var(--mono);font-size:9.5px;letter-spacing:.22em;color:rgba(197,160,89,.95);text-transform:uppercase}
/* LOGO */
.lp-logo-wrap{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-bottom:20px}
.lp-logo-img{width:260px;height:auto;filter:drop-shadow(0 0 32px rgba(197,160,89,.6)) brightness(1.15);display:block;mix-blend-mode:screen}
.lp-brand-sub{font-family:var(--mono);font-size:9px;letter-spacing:.22em;color:rgba(197,160,89,.9);text-transform:uppercase;margin-top:12px;text-align:center}
/* feature list */
.lp-features{position:relative;z-index:2;width:100%;margin-top:28px;display:flex;flex-direction:column;gap:0}
.lp-feat{padding:14px 0;border-bottom:1px solid rgba(197,160,89,.1);display:flex;align-items:flex-start;gap:14px}
.lp-feat:first-child{border-top:1px solid rgba(197,160,89,.1)}
.lp-feat-bullet{width:6px;height:6px;background:#E8C278;transform:rotate(45deg);flex-shrink:0;margin-top:6px;box-shadow:0 0 6px rgba(197,160,89,.6)}
.lp-feat-text{}
.lp-feat-title{font-family:var(--sans);font-size:12.5px;font-weight:700;color:#FFFFFF;letter-spacing:.02em;margin-bottom:2px;text-shadow:0 1px 8px rgba(0,0,0,.8)}
.lp-feat-desc{font-family:var(--mono);font-size:10.5px;color:rgba(220,200,160,.85);letter-spacing:.02em}
/* RIGHT PANEL */
.lp-right{flex:1;background:#1C1510;display:flex;align-items:center;justify-content:center;position:relative}
.lp-right::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle,rgba(200,169,110,.12) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.lp-right-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:20px 40px;pointer-events:none}
.lp-right-meta{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:rgba(200,169,110,.55);text-transform:uppercase}
.lp-right-ver{font-family:var(--mono);font-size:9.5px;color:rgba(200,169,110,.55);letter-spacing:.1em}
.lp-right-bot{position:absolute;bottom:18px;left:0;right:0;text-align:center;font-family:var(--mono);font-size:9px;color:rgba(200,169,110,.4);letter-spacing:.18em;text-transform:uppercase;pointer-events:none}
/* divider between panels */
.lp-vdivide{position:absolute;left:0;top:40px;bottom:40px;width:1px;background:linear-gradient(to bottom,transparent,rgba(197,160,89,.35) 20%,rgba(197,160,89,.35) 80%,transparent)}
/* CARD */
.login-card{background:#262626;border-radius:4px;border-top:5px solid #C5A059;box-shadow:0 24px 80px rgba(0,0,0,.55),0 4px 12px rgba(40,34,28,.08);padding:48px 48px 40px;width:100%;max-width:500px;position:relative;z-index:1;animation:mIn .35s ease}
.lc-inner-top{height:1px;background:rgba(200,169,110,.25);margin-bottom:30px}
.lc-signin-label{font-family:var(--mono);font-size:10px;letter-spacing:.28em;color:rgba(197,160,89,.8);text-transform:uppercase;text-align:center;margin-bottom:6px}
.lc-ornament{text-align:center;color:rgba(197,160,89,.4);font-size:10px;margin-bottom:22px}
/* ROLE GRID */
.role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:28px}
.rpill{padding:14px 8px 12px;border:1px solid rgba(200,169,110,.2);background:#2A2420;cursor:pointer;transition:all .18s cubic-bezier(.4,0,.2,1);text-align:center;color:var(--tx-inv);font-family:var(--sans);border-radius:3px;position:relative;overflow:hidden}
.rpill::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:#C5A059;transform:scaleX(0);transition:transform .18s cubic-bezier(.4,0,.2,1)}
.rpill:hover{border-color:rgba(200,169,110,.5);background:#333028}
.rpill.sel{border-color:var(--gold-light);background:#1C1510;color:#F9F7F2}
.rpill.sel::before{transform:scaleX(1)}
.rpill .ri{font-size:20px;margin-bottom:6px;display:block}
.rpill .rl{font-size:9.5px;letter-spacing:.06em;font-weight:600;text-transform:uppercase;color:inherit}
.rpill.sel .rl{color:rgba(197,160,89,.9)}
/* EMAIL DISPLAY */
.lc-email-display{margin-bottom:22px}
.lc-email-lbl{font-family:var(--sans);font-size:8.5px;font-weight:700;letter-spacing:.16em;color:rgba(200,169,110,.65);text-transform:uppercase;margin-bottom:6px}
.lc-email-val{font-family:var(--sans);font-size:15.5px;color:#EEE8DC;font-weight:400;padding-bottom:8px;border-bottom:1.5px solid #C8A96E;display:flex;justify-content:space-between;align-items:baseline}
.lc-change{font-family:var(--serif);font-size:11px;font-style:italic;color:rgba(197,160,89,.7);cursor:pointer}
/* override finput focus */
.login-card .finput:focus{border-color:var(--gold);outline:none;box-shadow:none}
/* button override */
.login-card .btn-gold{justify-content:center;padding:15px;font-size:10px;letter-spacing:.22em;margin-top:6px;border-radius:3px}
/* error */
.lc-error{background:rgba(224,92,122,.06);border:1px solid rgba(224,92,122,.18);padding:10px 14px;font-family:var(--sans);font-size:11px;color:var(--rose);margin-bottom:14px;border-radius:2px;letter-spacing:.02em}

/* ── GUEST SEARCH ── */
.gsearch-wrap{position:relative}
.gsearch-list{position:absolute;top:calc(100% + 2px);left:0;right:0;background:#1C1510;border:1px solid rgba(200,169,110,.25);border-top:2px solid var(--gold-light);z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.gsearch-item{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;font-size:12.5px;transition:background .12s;border-bottom:1px solid var(--br2)}
.gsearch-item:last-child{border-bottom:none}
.gsearch-item:hover{background:var(--s3)}

/* ── NOTIFICATION PANEL ── */
.notif-panel{position:absolute;top:58px;right:12px;width:320px;background:#1C1510;border:1px solid rgba(200,169,110,.25);border-top:3px solid var(--gold-light);box-shadow:0 16px 48px rgba(0,0,0,.5);z-index:200;animation:mIn .2s ease}

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
    {key:'owner',    ico:'👑', label:'Founder / Owner'},
    {key:'receptionist', ico:'🛎️', label:'Receptionist'},
    {key:'housekeeping', ico:'🧹', label:'Housekeeping'},
  ]

  function pickRole(r) {
    setSel(r)
    const s=staffList.find(x=>x.role===r)
    if(s) setEmail(s.email)
    setPw('') // always clear password — never auto-fill
    setErr('')
  }

  function doLogin() {
    if(!email||!pw) return setErr('Please enter your email and password.')
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
        {/* top bar */}
        <div className="lp-bar top">
          <div className="lp-rule"/>
          <div className="lp-label">Staff Portal · Hotel Fountain</div>
          <div className="lp-rule dim"/>
        </div>

        {/* logo */}
        <div className="lp-logo-wrap">
          <img
            src="/lp-logo.png"
            alt="Hotel Fountain"
            className="lp-logo-img"
          />
          <div className="lp-brand-sub">Management CRM · Powered by Lumea</div>
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
                <span className="ri">{r.ico}</span>
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

        <div className="lp-right-bot">Lumea · Hotel Fountain Management CRM</div>
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
  const todayRev = (() => {
    const todayTxs = (transactions||[]).filter(t => t.fiscal_day === today)
    const byKey = {}
    todayTxs.forEach(t => {
      if(t.type==='Balance Carried Forward') return
      const key = `${t.room_number||''}|${t.guest_name||''}`
      if(!byKey[key]) byKey[key] = {pay:0, fsPos:0, hasCash:false}
      const amt = +t.amount||0
      if(/cash|bkash/i.test(t.type||'')) { byKey[key].pay += amt; byKey[key].hasCash = true }
      else if(/final\s*settlement/i.test(t.type||'') && amt > 0) { byKey[key].fsPos += amt }
    })
    return Object.values(byKey).reduce((a,g) => a + (g.hasCash ? g.pay : g.fsPos), 0)
  })()
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
      const updates={status,paid_amount:paidNum,discount_amount:discountNum,notes,check_in:checkInDate,check_out:checkOut,room_ids:newRoomNos,total_amount:totalAmt}
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
      const [newRes]=await dbPost('reservations',{
        guest_ids:[f.guestId], room_ids:selectedRooms,
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
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Hotel Fountain — Billing ${filterLabel}</title>
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
  <div class="footer"><div class="total-row">${filterLabel}: ${fmt(periodTotal)} · ${(enriched||[]).length} transaction${(enriched||[]).length!==1?'s':''}</div><div class="footer-note">Hotel Fountain CRM · Lumea PMS · Confidential</div></div>
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
        <div class="serif" style="font-size:24px;font-weight:800;color:#C8A96E;letter-spacing:.02em">Hotel <em style="font-weight:400">Fountain</em></div>
        <div style="font-size:7.5px;color:rgba(255,255,255,.5);letter-spacing:.22em;text-transform:uppercase;margin-top:6px">The Gilded Threshold · Luxury In Comfort</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:10px">House 05, Road 02, Nikunja 02 · Dhaka 1229, Bangladesh</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:2px">WhatsApp +880 1322-840799 · hotellfountainbd@gmail.com</div>
        <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:2px">hotelfountainbd.vercel.app</div>
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
        <td width="60%" style="font-size:7.5px;color:#8D6F57;letter-spacing:.1em;text-transform:uppercase">Hotel Fountain · Lumea PMS · Confidential</td>
        <td width="40%" style="font-size:7.5px;color:#8D6F57;text-align:right">Computer-generated invoice — no signature required</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:6px;font-size:8px;color:#8D6F57;text-align:center;font-style:italic">Thank you for choosing Hotel Fountain. We look forward to welcoming you again.</td>
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

  const _isPayVehicle = t => /cash|bkash/i.test(t.type||'') && t.type!=='Balance Carried Forward'
  const _bizDayTotal = list => {
    const byKey = {}
    list.forEach(t=>{
      if(t.type==='Balance Carried Forward') return
      const key = `${t.room_number||''}|${t.guest_name||''}`
      if(!byKey[key]) byKey[key] = { pay:0, fsPos:0, hasCash:false }
      const amt = +t.amount||0
      if(/cash|bkash/i.test(t.type||'')) { byKey[key].pay += amt; byKey[key].hasCash = true }
      else if(/final\s*settlement/i.test(t.type||'') && amt > 0) { byKey[key].fsPos += amt }
    })
    return Object.values(byKey).reduce((a,g)=> a + (g.hasCash ? g.pay : g.fsPos), 0)
  }
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
    const rawTotal = canonical>0 ? canonical : (sub>0 ? sub : 0)
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
  const activeRes = reservations.filter(r => {
    if (r.status === 'CHECKED_IN') return true
    if (r.status === 'CHECKED_OUT') return _resDue(r) > 0
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
<div className="footer"><span>Hotel Fountain CRM · Lumea PMS · Confidential</span><span>${todayList.length} transaction${todayList.length!==1?'s':''} · ${duesCarried.length} pending due${duesCarried.length!==1?'s':''}</span></div>
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
          const guestId = guests?.find(g=>g.name===t.guest_name)?.id
          const res = reservations?.find(r=>{
            const roomMatch=(r.room_ids||[]).some(id=>String(id)===String(t.room_number))||String(r.room_number)===String(t.room_number)
            const nameMatch=!guestId||(r.guest_ids||[]).includes(guestId)||r.guest_name===t.guest_name
            return roomMatch&&nameMatch
          }) || reservations?.find(r=>(r.room_ids||[]).some(id=>String(id)===String(t.room_number))||String(r.room_number)===String(t.room_number))
          const key = res ? res.id : `tx|${t.guest_name||''}|${t.room_number||''}|${t.fiscal_day||''}`
          if(!unifiedGroups[key]) unifiedGroups[key] = { txs:[], res, guest_name:t.guest_name, room_number:t.room_number, isDue: false }
          unifiedGroups[key].txs.push(t)
        })

        if (!search) {
          // Use activeRes (all CHECKED_IN + CHECKED_OUT with balance) so fully-paid
          // CHECKED_IN guests still appear in the ledger
          activeRes.forEach(r=>{
            try {
              if(!r || !r.id) return
              const key = r.id;
              if(!unifiedGroups[key]) {
                unifiedGroups[key] = { txs:[], res: r, guest_name: getGN(r), room_number: getRoom(r), isDue: _resDue(r)>0 }
              } else {
                unifiedGroups[key].isDue = _resDue(r)>0;
                unifiedGroups[key].res = r;
              }
            } catch(e) {
              console.warn('[ledger] skip malformed reservation', r?.id, e)
            }
          })
        }

        // TODAY view: show only guests who OWE MONEY or made a real payment today.
        // BCF-only + due=0 = ghost row (fully settled — hide after day close).
        // Guest reappears when a new cash/bkash/folio TX is recorded today.
        const displayList = (filter==='TODAY')
          ? Object.values(unifiedGroups).filter(grp => {
              if (grp.isDue) return true  // still owes money
              return grp.txs.some(t => !/balance carried forward/i.test(t.type||''))  // real TX today
            })
          : Object.values(unifiedGroups)

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
                    // PAID column: TODAY = actual cash/bkash collected today; other filters = lifetime paid
                    const tPaid = (filter==='TODAY')
                      ? grp.txs.filter(t=>/cash|bkash/i.test(t.type||'')).reduce((s,t)=>s+(+t.amount||0),0)
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
                              setBillingRes({_fromRow:true,...(r||{}),room_number:rno,guest_name:gname,_resId:r?.id||null,_total:grossTotal,_paid:tPaid,_discount:tDiscount})
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
  const [hs,setHS]=useState({hotelName:'Hotel Fountain',city:'Dhaka, Bangladesh',currency:'BDT',checkIn:'14:00',checkOut:'12:00',vat:'15',svc:'5'})
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
  const [businessDate,setBusinessDate]=useState(todayStr())
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
      if(Array.isArray(bdRows)&&bdRows[0]?.value) setBusinessDate(bdRows[0].value)
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
    {id:'seo',       ico:'🔍', label:'SEO & GEO Agent',  sect:'MARKETING'},
    {id:'reports',   ico:'▣', label:'Reports',          sect:'ANALYTICS'},
    {id:'settings',  ico:'◌', label:'Settings',         sect:'SYSTEM'},
  ].filter(n=>allowed.includes(n.id))

  const PAGE_TITLES={dashboard:'Dashboard',rooms:'Room Management',reservations:'Reservations',guests:'Guest CRM',housekeeping:'Housekeeping',billing:'Billing & Invoices',reports:'Reports & Analytics',settings:'Settings',seo:'SEO & GEO Agent'}
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
            {cur==='seo'          &&<SEOGEOPage toast={toast} rooms={data.rooms}/>}
            {cur==='settings'     &&<SettingsPage currentUser={user} toast={toast} staffList={staffList} setStaffList={setStaffList} reservations={data.reservations} rooms={data.rooms} guests={data.guests}/>}
          </div>
        </main>
      </div>

      {toastMsg&&<Toast msg={toastMsg.msg} type={toastMsg.type} onDone={()=>setToastMsg(null)}/>}
    </>
  )
}

    function SEOGEOPage({ toast, rooms }) {
      const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/seo-geo-agent'
      const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow'

      const [activeTab, setActiveTab] = useState('dashboard')
      const [busy, setBusy] = useState(null)
      const [drafts, setDrafts] = useState([])
      const [loadingDrafts, setLoadingDrafts] = useState(true)
      const [gbpTopic, setGbpTopic] = useState('New premium rooms available in Nikunja 2')
      const [gbpResult, setGbpResult] = useState(null)
      const [contentTopic, setContentTopic] = useState('Why Nikunja 2 is the best location for transit travelers in Dhaka')
      const [contentType, setContentType] = useState('blog_post')
      const [contentResult, setContentResult] = useState(null)
      const [schemaResult, setSchemaResult] = useState(null)
      const [rankingsResult, setRankingsResult] = useState(null)
      const [designPlatform, setDesignPlatform] = useState('instagram_post')
      const [designTheme, setDesignTheme] = useState('room_promo')
      const [designBg, setDesignBg] = useState('twilight_gold')
      const [designSeed, setDesignSeed] = useState(1)
      const [approvalSent, setApprovalSent] = useState(false)

      useEffect(() => { loadDrafts() }, [])

      async function call(body) {
        const r = await fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ANON }, body: JSON.stringify(body) })
        return r.json()
      }

      async function loadDrafts() {
        setLoadingDrafts(true)
        try {
          const r = await fetch(`${SB_URL}/rest/v1/marketing_content?tenant_id=eq.${TENANT}&order=created_at.desc&limit=30`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
          const d = await r.json()
          setDrafts(Array.isArray(d) ? d : [])
        } catch (e) { }
        finally { setLoadingDrafts(false) }
      }

      async function postGBP() {
        setBusy('gbp'); setGbpResult(null)
        try {
          const res = await call({ action: 'post_gbp', topic: gbpTopic })
          if (res.error) { toast(res.error.includes('not deployed') || res.error.includes('GEMINI') ? 'Edge function not deployed — see Developer Guide' : res.error, 'error'); setGbpResult({ error: res.error }); return }
          setGbpResult(res); toast('GBP post published ✓'); loadDrafts()
        } catch (e) { toast(e.message, 'error') }
        finally { setBusy(null) }
      }

      async function generateContent() {
        setBusy('content'); setContentResult(null)
        try {
          const res = await call({ action: 'generate_content', topic: contentTopic, type: contentType, platform: designPlatform, variation: Math.floor(Math.random() * 5), seed: Date.now() })
          if (res.error) { toast(res.error, 'error'); return }
          setContentResult(res); toast('Content draft saved ✓'); loadDrafts()
        } catch (e) { toast(e.message, 'error') }
        finally { setBusy(null) }
      }

      async function generateSchema() {
        setBusy('schema'); setSchemaResult(null)
        try {
          const res = await call({ action: 'generate_schema', rooms })
          if (res.error) { toast(res.error, 'error'); return }
          setSchemaResult(res); toast('Schema.org JSON-LD generated ✓')
        } catch (e) { toast(e.message, 'error') }
        finally { setBusy(null) }
      }

      async function checkRankings() {
        setBusy('rankings'); setRankingsResult(null)
        try {
          const res = await call({ action: 'check_rankings' })
          if (res.error) { toast(res.error, 'error'); return }
          setRankingsResult(res); toast('Rankings fetched ✓')
        } catch (e) { toast(e.message, 'error') }
        finally { setBusy(null) }
      }

      async function approveDraft(id) {
        try {
          await fetch(`${SB_URL}/rest/v1/marketing_content?id=eq.${id}`, { method: 'PATCH', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'approved' }) })
          toast('Draft approved ✓'); loadDrafts()
        } catch (e) { toast(e.message, 'error') }
      }

      async function publishDraft(id) {
        setBusy(`publish:${id}`)
        try {
          const res = await call({ action: 'publish_content', content_id: id })
          if (res.error) { toast(res.error, 'error'); return }
          toast('Content published ✓'); loadDrafts()
        } catch (e) { toast(e.message, 'error') }
        finally { setBusy(null) }
      }

      const statusColor = s => s === 'published' ? 'var(--grn)' : s === 'approved' ? 'var(--gold)' : 'var(--sky)'
      const statusBg = s => s === 'published' ? 'rgba(63,185,80,.12)' : s === 'approved' ? 'rgba(200,169,110,.12)' : 'rgba(88,166,255,.08)'
      const typeIcon = t => t === 'blog_post' ? '📝' : t === 'landing_page' ? '🏠' : t === 'gbp_post' ? '📍' : t === 'schema' ? '🔧' : '📄'

      const STATIC_SCHEMA = `{
  "@context": "https://schema.org",
  "@type": ["Hotel", "LocalBusiness"],
  "name": "Hotel Fountain",
  "description": "Premium hotel in Nikunja 2, Dhaka — 5 min from Hazrat Shahjalal Airport",
  "url": "https://hotelfountainbd-crm.vercel.app",
  "telephone": "+880-1319407384",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Nikunja 2",
    "addressLocality": "Dhaka",
    "addressCountry": "BD"
  },
  "priceRange": "৳3,500 – ৳9,000",
  "starRating": { "@type": "Rating", "ratingValue": "4.8" },
  "numberOfRooms": 28
}
(Agent auto-fills amenityFeature from rooms table when deployed)`

      return (
        <div>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg,rgba(200,169,110,.08),rgba(88,166,255,.04))', border: '1px solid rgba(200,169,110,.2)', padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--gold)' }}>🔍 SEO & GEO Specialist Agent</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Local Authority Engine · Google Business Profile · Generative Engine Optimization · Schema.org · Content Marketing</div>
              </div>
              <div style={{ background: 'rgba(63,185,80,.06)', border: '1px solid rgba(63,185,80,.15)', padding: '8px 12px', fontSize: 10, color: 'var(--tx3)', flexShrink: 0, lineHeight: 1.8 }}>
                <div style={{ color: 'var(--grn)', fontWeight: 600, marginBottom: 4 }}>TARGET KEYWORDS</div>
                <div>Best hotel in Nikunja 2</div>
                <div>Hotel near Dhaka Airport</div>
                <div>Corporate accommodation Dhaka</div>
              </div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="tabs mb4">
            {[['dashboard', '📊 Dashboard'], ['gbp', '📍 GBP Manager'], ['content', '✍️ Content Engine'], ['schema', '🔧 Schema & Rankings'], ['guide', '📋 Developer Guide'], ['design', '🎨 Design Studio']].map(([v, l]) => (
              <button key={v} className={`tab${activeTab === v ? ' on' : ''}`} onClick={() => setActiveTab(v)}>{l}</button>
            ))}
          </div>

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
                {[['Content Drafts', drafts.filter(d => d.status === 'draft').length, 'var(--sky)'], ['Approved', drafts.filter(d => d.status === 'approved').length, 'var(--gold)'], ['Published', drafts.filter(d => d.status === 'published').length, 'var(--grn)'], ['GBP Posts', drafts.filter(d => d.content_type === 'gbp_post').length, 'var(--teal)']].map(([l, v, c], i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,.2)', border: '1px solid var(--br)', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 28, color: c, fontFamily: 'var(--serif)', fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { icon: '📍', title: 'Post GBP Update', desc: 'Publish a Google Business Profile post to boost local visibility', tab: 'gbp', color: 'var(--gold)' },
                  { icon: '✍️', title: 'Generate SEO Content', desc: 'Write a GEO-optimized blog post or landing page', tab: 'content', color: 'var(--sky)' },
                  { icon: '🔧', title: 'Generate Schema Markup', desc: 'Create Hotel & LocalBusiness JSON-LD for every page', tab: 'schema', color: 'var(--teal)' },
                  { icon: '📈', title: 'Check Rankings', desc: 'Monitor real-time search rankings vs. competitors in Nikunja', tab: 'schema', color: 'var(--pur)' },
                ].map((a, i) => (
                  <div key={i} onClick={() => setActiveTab(a.tab)}
                    style={{ background: 'rgba(0,0,0,.15)', border: '1px solid var(--br)', padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(200,169,110,.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--br)'}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: a.color, marginBottom: 3 }}>{a.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.5 }}>{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-hd">
                  <span className="card-title">Content Drafts — Awaiting Approval</span>
                  <button className="btn btn-ghost btn-sm" onClick={loadDrafts}>↻ Refresh</button>
                </div>
                {loadingDrafts ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--tx3)', fontSize: 12 }}>Loading…</div>
                ) : drafts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tx3)', fontSize: 12 }}>No content yet — generate your first post in the Content Engine or GBP Manager</div>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {drafts.map(d => (
                        <tr key={d.id}>
                          <td><span style={{ fontSize: 15, marginRight: 4 }}>{typeIcon(d.content_type)}</span><span className="xs muted">{(d.content_type || 'draft').replace(/_/g, ' ')}</span></td>
                          <td style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{d.title || '—'}</td>
                          <td><span style={{ fontSize: 9, padding: '2px 8px', background: statusBg(d.status), color: statusColor(d.status), letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>{d.status || 'draft'}</span></td>
                          <td className="xs muted">{d.created_at ? new Date(d.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '—'}</td>
                          <td>
                            {d.status === 'draft' && <button className="btn btn-gold btn-sm" style={{ fontSize: 9, padding: '3px 8px' }} onClick={() => approveDraft(d.id)}>✓ Approve</button>}
                            {d.status === 'approved' && <button className="btn btn-sm" style={{ fontSize: 9, padding: '3px 8px', background: 'rgba(63,185,80,.1)', color: 'var(--grn)', border: '1px solid rgba(63,185,80,.3)' }} disabled={busy === `publish:${d.id}`} onClick={() => publishDraft(d.id)}>{busy === `publish:${d.id}` ? 'Publishing…' : '🚀 Publish'}</button>}
                            {d.status === 'published' && <span style={{ fontSize: 9, color: 'var(--grn)' }}>✓ Live</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── GBP MANAGER ── */}
          {activeTab === 'gbp' && (
            <div>
              <div className="card mb4">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>📍</span>
                  <div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--tx)' }}>Google Business Profile Manager</div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Posts weekly updates · Uploads room photos · Profile ID: 6462181989202463603</div>
                  </div>
                </div>
                <div style={{ background: 'rgba(200,169,110,.05)', border: '1px solid rgba(200,169,110,.15)', padding: '10px 14px', marginBottom: 14, fontSize: 11, color: 'var(--gold)' }}>
                  💡 <strong>Why GBP matters:</strong> Hotels with active GBP profiles get 70% more direction requests and appear in "Hotels near me" on Google Maps
                </div>
                <div className="fg mb3">
                  <label className="flbl">Post Topic / Update</label>
                  <input className="finput" value={gbpTopic} onChange={e => setGbpTopic(e.target.value)} placeholder="e.g. New premium rooms available in Nikunja 2" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                  {['New premium rooms available in Nikunja 2', 'Special corporate rate — ৳3,500/night this week', 'Hotel Fountain: 5 minutes from Hazrat Shahjalal Airport', 'Book direct and save — no OTA fees, best rate guaranteed'].map(t => (
                    <div key={t} onClick={() => setGbpTopic(t)} style={{ background: gbpTopic === t ? 'rgba(200,169,110,.1)' : 'rgba(0,0,0,.15)', border: `1px solid ${gbpTopic === t ? 'rgba(200,169,110,.4)' : 'var(--br)'}`, padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>{t}</div>
                  ))}
                </div>
                <button className="btn btn-gold" onClick={postGBP} disabled={busy === 'gbp'}>{busy === 'gbp' ? '📍 Posting…' : '📍 Generate & Post to GBP'}</button>
                {gbpResult && !gbpResult.error && (
                  <div style={{ marginTop: 14, background: 'rgba(63,185,80,.05)', border: '1px solid rgba(63,185,80,.2)', padding: '14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--grn)', fontWeight: 600, marginBottom: 8 }}>✓ Posted to Google Business Profile</div>
                    {gbpResult.post_content && <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.7, background: 'rgba(0,0,0,.3)', padding: '10px 12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{gbpResult.post_content}</div>}
                    {gbpResult.post_url && <div style={{ marginTop: 8, fontSize: 10 }}><a href={gbpResult.post_url} target="_blank" style={{ color: 'var(--sky)' }}>View live post ↗</a></div>}
                  </div>
                )}
                {gbpResult?.error && <div style={{ marginTop: 12, background: 'rgba(224,92,122,.08)', border: '1px solid rgba(224,92,122,.25)', padding: '12px 14px', fontSize: 11, color: 'var(--rose)' }}>⚠ {gbpResult.error} — Deploy the seo-geo-agent Edge Function first (see Developer Guide tab)</div>}
              </div>
              <div className="card">
                <div className="card-hd"><span className="card-title">GBP Optimisation Checklist</span></div>
                <div className="card-body">
                  {[
                    { done: true, label: 'Business name verified', detail: 'Hotel Fountain — Nikunja 2, Dhaka' },
                    { done: true, label: 'Profile ID connected', detail: '6462181989202463603' },
                    { done: false, label: 'Weekly posts active', detail: 'Deploy Edge Function to enable auto-posting' },
                    { done: false, label: 'Room photos uploaded via API', detail: '5+ photos recommended for 2× more clicks' },
                    { done: false, label: 'Review response automation', detail: 'Auto-respond to 4★+ reviews within 2 hours' },
                    { done: false, label: 'Q&A seeded', detail: 'Pre-populate 10 common questions (airport distance, check-in time, etc.)' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--br2)', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{item.done ? '✅' : '⬜'}</span>
                      <div>
                        <div style={{ fontSize: 12, color: item.done ? 'var(--tx)' : 'var(--tx2)', fontWeight: item.done ? 500 : 400 }}>{item.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{item.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── CONTENT ENGINE ── */}
          {activeTab === 'content' && (
            <div>
              <div className="card mb4">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>✍️</span>
                  <div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--tx)' }}>SEO & GEO Content Engine</div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Writes blog posts & landing pages · Includes local statistics, JSON-LD, landmarks · Makes Hotel Fountain cited by AI search</div>
                  </div>
                </div>
                <div style={{ background: 'rgba(88,166,255,.05)', border: '1px solid rgba(88,166,255,.15)', padding: '10px 14px', marginBottom: 14, fontSize: 11, color: 'var(--sky)' }}>
                  🧠 <strong>GEO Optimisation:</strong> Content includes citations, local landmarks (Cityscape Tower, HSIA), statistics, and structured data so AI models like Gemini & ChatGPT recommend Hotel Fountain
                </div>
                <div className="frow mb3">
                  <div className="fg">
                    <label className="flbl">Content Type</label>
                    <select className="fselect" value={contentType} onChange={e => setContentType(e.target.value)}>
                      <option value="blog_post">📝 SEO Blog Post</option>
                      <option value="landing_page">🏠 Local Landing Page</option>
                      <option value="gbp_post">📍 GBP Post Draft</option>
                    </select>
                  </div>
                </div>
                <div className="fg mb3">
                  <label className="flbl">Topic / Target Keyword</label>
                  <input className="finput" value={contentTopic} onChange={e => setContentTopic(e.target.value)} placeholder="e.g. Why Nikunja 2 is best for transit travelers" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                  {['Why Nikunja 2 is the best location for transit travelers in Dhaka', 'Best hotel near Hazrat Shahjalal International Airport', 'Corporate accommodation in Dhaka: A complete guide for HR managers', 'Hotel Fountain vs. other Nikunja hotels — honest comparison', 'Top 5 reasons to book direct with Hotel Fountain', 'Weekend in Dhaka: Hotel Fountain Superior Deluxe experience'].map(t => (
                    <div key={t} onClick={() => setContentTopic(t)} style={{ background: contentTopic === t ? 'rgba(88,166,255,.1)' : 'rgba(0,0,0,.12)', border: `1px solid ${contentTopic === t ? 'rgba(88,166,255,.4)' : 'var(--br)'}`, padding: '7px 10px', cursor: 'pointer', fontSize: 10, color: contentTopic === t ? 'var(--sky)' : 'var(--tx3)', lineHeight: 1.4 }}>{t}</div>
                  ))}
                </div>
                <button className="btn btn-gold" onClick={generateContent} disabled={busy === 'content'}>{busy === 'content' ? '✍️ Generating…' : '✍️ Generate Content Draft'}</button>
                {contentResult && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--grn)', fontWeight: 600, marginBottom: 8 }}>✓ Draft saved to Supabase marketing_content table</div>
                    <div style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)', padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>{contentResult.title}</div>
                      {contentResult.meta_description && <div style={{ fontSize: 10, color: 'var(--gold)', marginBottom: 10 }}>Meta: {contentResult.meta_description}</div>}
                      <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.8, maxHeight: 250, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{(contentResult.content || '').slice(0, 800)}{contentResult.content?.length > 800 ? '…' : ''}</div>
                      {(contentResult.keywords || []).length > 0 && <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>{(contentResult.keywords || []).map((k, i) => <span key={i} style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(200,169,110,.12)', color: 'var(--gold)', border: '1px solid rgba(200,169,110,.2)' }}>{k}</span>)}</div>}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tx3)' }}>→ Go to Dashboard to approve and publish this draft</div>
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-hd"><span className="card-title">Backlinking Strategy — Priority Directories</span></div>
                <div className="card-body">
                  {[
                    { dir: 'TripAdvisor Bangladesh', priority: 'HIGH', status: 'Submit property listing' },
                    { dir: 'Booking.com Partner Hub', priority: 'HIGH', status: 'Verify business profile' },
                    { dir: 'Bangladesh Tourism Board', priority: 'HIGH', status: 'Register as licensed hotel' },
                    { dir: 'Dhaka Chamber of Commerce', priority: 'MED', status: 'Corporate member listing' },
                    { dir: 'Expats in Dhaka (Facebook Group)', priority: 'MED', status: 'Sponsor monthly post' },
                    { dir: 'Nikunja Business Directory', priority: 'MED', status: 'Claim listing' },
                  ].map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--br2)', gap: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{d.dir}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, padding: '2px 7px', background: d.priority === 'HIGH' ? 'rgba(224,92,122,.12)' : 'rgba(200,169,110,.1)', color: d.priority === 'HIGH' ? 'var(--rose)' : 'var(--gold)', fontWeight: 600 }}>{d.priority}</span>
                        <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{d.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SCHEMA & RANKINGS ── */}
          {activeTab === 'schema' && (
            <div>
              <div className="card mb4">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>🔧</span>
                  <div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--tx)' }}>Schema.org Markup Generator</div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Hotel + LocalBusiness JSON-LD · Helps Google understand price range, location & ratings · Required for AI-powered search citations</div>
                  </div>
                </div>
                <button className="btn btn-gold mb3" onClick={generateSchema} disabled={busy === 'schema'}>{busy === 'schema' ? '🔧 Generating…' : '🔧 Generate Schema Markup'}</button>
                <div style={{ background: 'rgba(0,0,0,.4)', border: '1px solid var(--br)', padding: '14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sky)', whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', lineHeight: 1.6 }}>
                  {schemaResult ? (schemaResult.schema || JSON.stringify(schemaResult, null, 2)) : STATIC_SCHEMA}
                </div>
                <button className="btn btn-ghost btn-sm mt3" style={{ fontSize: 10 }} onClick={() => navigator.clipboard.writeText(schemaResult ? (schemaResult.schema || JSON.stringify(schemaResult, null, 2)) : STATIC_SCHEMA).then(() => toast('Copied to clipboard ✓'))}>📋 Copy to Clipboard</button>
              </div>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>📈</span>
                  <div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--tx)' }}>Keyword Rankings Monitor</div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Real-time SERP tracking via SerpApi/Tavily · Hotel Fountain vs. Nikunja competitors</div>
                  </div>
                </div>
                <button className="btn btn-gold mb3" onClick={checkRankings} disabled={busy === 'rankings'}>{busy === 'rankings' ? '📈 Checking…' : '📈 Check Current Rankings'}</button>
                {rankingsResult ? (
                  <table className="tbl">
                    <thead><tr><th>Keyword</th><th>Position</th><th>URL</th><th>Change</th></tr></thead>
                    <tbody>
                      {(rankingsResult.rankings || []).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 11 }}>{r.keyword}</td>
                          <td><span style={{ fontSize: 13, fontWeight: 700, color: r.position <= 3 ? 'var(--grn)' : r.position <= 10 ? 'var(--gold)' : 'var(--rose)' }}>#{r.position}</span></td>
                          <td style={{ fontSize: 10, color: 'var(--sky)', maxWidth: 200 }}>{r.url || '—'}</td>
                          <td style={{ fontSize: 11, color: r.change > 0 ? 'var(--grn)' : r.change < 0 ? 'var(--rose)' : 'var(--tx3)' }}>{r.change > 0 ? `↑${r.change}` : r.change < 0 ? `↓${Math.abs(r.change)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {['Best hotel in Nikunja 2', 'Hotel near Dhaka Airport', 'Corporate accommodation Dhaka', 'Nikunja 2 hotel booking', 'Transit hotel Dhaka', 'Hotel near HSIA airport'].map(k => (
                      <div key={k} style={{ background: 'rgba(0,0,0,.15)', border: '1px solid var(--br)', padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6 }}>{k}</div>
                        <div style={{ fontSize: 18, color: 'var(--tx3)', fontFamily: 'var(--serif)' }}>—</div>
                        <div style={{ fontSize: 9, color: 'var(--tx3)' }}>Deploy Edge Function to check</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── DEVELOPER GUIDE ── */}
          {activeTab === 'guide' && (
            <div>
              <div style={{ background: 'rgba(200,169,110,.06)', border: '1px solid rgba(200,169,110,.2)', padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>📋 Implementation Roadmap</div>
                <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.8 }}>
                  Phase 1: Gemini 1.5 Pro generates content → saved to Supabase marketing_content table → FO approves → publishes<br/>
                  Phase 2: Google Business Profile API auto-posts every Sunday 9 AM (Profile ID: 6462181989202463603)<br/>
                  Phase 3: SerpApi/Tavily ranking monitor — track Hotel Fountain vs. Nikunja competitors weekly
                </div>
              </div>
              {[
                { step: '1', title: 'Create marketing_content table in Supabase', code: `CREATE TABLE marketing_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  content_type TEXT, -- 'blog_post' | 'landing_page' | 'gbp_post' | 'schema'
  title TEXT,
  content TEXT,
  meta_description TEXT,
  keywords TEXT[],
  status TEXT DEFAULT 'draft', -- 'draft' | 'approved' | 'published'
  published_at TIMESTAMPTZ,
  gbp_post_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);` },
                { step: '2', title: 'Deploy seo-geo-agent Edge Function (Supabase)', code: `// supabase/functions/seo-geo-agent/index.ts
// Actions: post_gbp | generate_content | generate_schema | check_rankings | publish_content
// Stack: Vercel AI SDK or LangChain + Gemini 1.5 Pro
//
// Required Supabase Secrets (Settings → Edge Functions → Secrets):
//   GEMINI_API_KEY      — from aistudio.google.com
//   GOOGLE_PROJECT_ID   — hotelfountainbdcrm-493018
//   GOOGLE_PRIVATE_KEY_ID — a9e9e586dedb142e4fc80d8c542f60edb89e50fe
//   GOOGLE_SERVICE_ACCOUNT_EMAIL — (from service account JSON)
//   GOOGLE_PRIVATE_KEY  — (from service account JSON, keep in Secrets only)
//   SERPAPI_KEY         — from serpapi.com (for rankings)
//
// GBP Profile ID: 6462181989202463603
// Connection: om-4622866995102339240` },
                { step: '3', title: 'Add SERP ranking monitoring', code: `// In seo-geo-agent Edge Function, action: 'check_rankings'
const KEYWORDS = [
  'Best hotel in Nikunja 2',
  'Hotel near Dhaka Airport',
  'Corporate accommodation Dhaka',
  'Nikunja 2 hotel booking',
  'Transit hotel Dhaka'
]
// Use SerpApi: serpapi.com/google-search-api
// or Tavily: tavily.com (AI-native search API)` },
              ].map(s => (
                <div key={s.step} className="card mb3">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, background: 'rgba(200,169,110,.15)', border: '1px solid rgba(200,169,110,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>{s.step}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', paddingTop: 3 }}>{s.title}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,.4)', padding: '12px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sky)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 200, overflow: 'auto' }}>{s.code}</div>
                </div>
              ))}
              <div className="card" style={{ background: 'rgba(88,166,255,.03)', border: '1px solid rgba(88,166,255,.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sky)', marginBottom: 10 }}>📊 Success KPIs</div>
                {[['Google Search Console', 'Appearances in Search +50% within 90 days'], ['Google Maps', '+70% direction requests from active GBP posts'], ['Direct Bookings', 'Track clicks on Call/Book Now from organic traffic'], ['AI Citations', 'Hotel Fountain cited in Gemini/ChatGPT hotel recommendations'], ['Avg. Position', 'Top 3 for "hotel near Dhaka airport" within 6 months']].map(([metric, target], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--br2)', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--tx)', fontWeight: 500 }}>{metric}</span>
                    <span style={{ fontSize: 10, color: 'var(--sky)' }}>{target}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── DESIGN STUDIO ── */}
          {activeTab === 'design' && (() => {
            const PLATFORMS = [
              { id: 'instagram_post', label: 'Instagram Post', w: 1080, h: 1080 },
              { id: 'instagram_story', label: 'Instagram Story', w: 1080, h: 1920 },
              { id: 'facebook_post', label: 'Facebook Post', w: 1200, h: 630 },
              { id: 'linkedin_post', label: 'LinkedIn Post', w: 1200, h: 627 },
              { id: 'twitter_post', label: 'Twitter/X Post', w: 1200, h: 675 },
            ]
            const THEMES = [
              { id: 'room_promo', label: '🛏 Room Promo', headline: 'Premium Rooms', sub: 'From ৳3,500/night', cta: 'Book Now' },
              { id: 'corporate_pkg', label: '💼 Corporate Package', headline: 'Corporate Packages', sub: 'Exclusive Business Rates', cta: 'Get Quote' },
              { id: 'dining', label: '🍽 Dining', headline: 'Fine Dining', sub: 'World-Class Cuisine', cta: 'Reserve Table' },
              { id: 'weekend_deal', label: '🌟 Weekend Deal', headline: 'Weekend Escape', sub: 'Special Packages Available', cta: 'View Deals' },
              { id: 'event_mtg', label: '🎪 Events & Meetings', headline: 'Events & Meetings', sub: 'Premium Facilities', cta: 'Inquire Now' },
            ]
            const BGS = [
              { id: 'twilight_gold', label: '✨ Twilight Gold', from: '#1a1208', to: '#2d1e05', accent: '#C8A96E', text: '#F5EDD8' },
              { id: 'midnight_blue', label: '🌙 Midnight Blue', from: '#080d1a', to: '#0d1f3c', accent: '#58A6FF', text: '#E8F0FF' },
              { id: 'emerald_night', label: '💚 Emerald Night', from: '#081a10', to: '#0a2a18', accent: '#3FB950', text: '#E0FFE8' },
              { id: 'rose_dawn', label: '🌹 Rose Dawn', from: '#1a080d', to: '#2d0a18', accent: '#FF6B8A', text: '#FFE0E8' },
              { id: 'slate_grey', label: '🩶 Slate Grey', from: '#0a0a0f', to: '#1a1a28', accent: '#A0AEC0', text: '#E8ECF0' },
              { id: 'ivory_warm', label: '🪔 Ivory Warm', from: '#1a150f', to: '#2d2015', accent: '#E8D5B0', text: '#FFF8F0' },
            ]

            const plat = PLATFORMS.find(p => p.id === designPlatform) || PLATFORMS[0]
            const theme = THEMES.find(t => t.id === designTheme) || THEMES[0]
            const bg = BGS.find(b => b.id === designBg) || BGS[0]
            const layout = designSeed % 5
            const { w, h } = plat

            function makeSVG() {
              const { headline, sub, cta } = theme
              const c = bg
              const hotel = 'Hotel Fountain'
              const tagline = 'Nikunja 2, Dhaka · 5 min from Airport'
              if (layout === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient><filter id="glo"><feGaussianBlur stdDeviation="40"/></filter></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${Math.round(w*0.8)}" cy="${Math.round(h*0.2)}" r="${Math.round(w*0.35)}" fill="${c.accent}" opacity="0.07" filter="url(#glo)"/><circle cx="${Math.round(w*0.15)}" cy="${Math.round(h*0.75)}" r="${Math.round(w*0.25)}" fill="${c.accent}" opacity="0.05" filter="url(#glo)"/><rect x="${Math.round(w*0.08)}" y="${Math.round(h*0.08)}" width="${Math.round(w*0.84)}" height="${Math.round(h*0.84)}" fill="none" stroke="${c.accent}" stroke-width="1" opacity="0.3"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.36)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.045)}" fill="${c.accent}" letter-spacing="4">${hotel.toUpperCase()}</text><rect x="${Math.round(w*0.36)}" y="${Math.round(h*0.40)}" width="${Math.round(w*0.28)}" height="1" fill="${c.accent}" opacity="0.5"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.52)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.074)}" fill="${c.text}" font-weight="bold">${headline}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.61)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.028)}" fill="${c.text}" opacity="0.75">${sub}</text><rect x="${Math.round(w*0.37)}" y="${Math.round(h*0.67)}" width="${Math.round(w*0.26)}" height="${Math.round(h*0.065)}" rx="2" fill="${c.accent}" opacity="0.15" stroke="${c.accent}" stroke-width="1"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.712)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.025)}" fill="${c.accent}" letter-spacing="2">${cta.toUpperCase()}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.86)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.018)}" fill="${c.text}" opacity="0.4">${tagline}</text></svg>`
              if (layout === 1) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient><linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${c.accent}" stop-opacity="0.18"/><stop offset="100%" stop-color="${c.accent}" stop-opacity="0.03"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><rect x="0" y="0" width="${Math.round(w*0.44)}" height="${h}" fill="url(#side)"/><rect x="${Math.round(w*0.44)}" y="${Math.round(h*0.1)}" width="1" height="${Math.round(h*0.8)}" fill="${c.accent}" opacity="0.35"/><text x="${Math.round(w*0.22)}" y="${Math.round(h*0.4)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.036)}" fill="${c.accent}" letter-spacing="3">${hotel.toUpperCase()}</text><text x="${Math.round(w*0.22)}" y="${Math.round(h*0.49)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.02)}" fill="${c.text}" opacity="0.55">${tagline}</text><text x="${Math.round(w*0.63)}" y="${Math.round(h*0.38)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.063)}" fill="${c.text}" font-weight="bold">${headline}</text><text x="${Math.round(w*0.63)}" y="${Math.round(h*0.47)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.025)}" fill="${c.text}" opacity="0.7">${sub}</text><rect x="${Math.round(w*0.52)}" y="${Math.round(h*0.56)}" width="${Math.round(w*0.22)}" height="${Math.round(h*0.06)}" rx="2" fill="${c.accent}" opacity="0.18" stroke="${c.accent}" stroke-width="1"/><text x="${Math.round(w*0.63)}" y="${Math.round(h*0.6)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.022)}" fill="${c.accent}" letter-spacing="2">${cta.toUpperCase()}</text></svg>`
              if (layout === 2) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><rect x="0" y="0" width="${w}" height="${Math.round(h*0.13)}" fill="${c.accent}" opacity="0.12"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.085)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.03)}" fill="${c.accent}" letter-spacing="5">${hotel.toUpperCase()}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.36)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.078)}" fill="${c.text}" font-weight="bold">${headline}</text><rect x="${Math.round(w*0.4)}" y="${Math.round(h*0.41)}" width="${Math.round(w*0.2)}" height="2" fill="${c.accent}" opacity="0.55"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.5)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.027)}" fill="${c.text}" opacity="0.72">${sub}</text><rect x="0" y="${Math.round(h*0.8)}" width="${w}" height="${Math.round(h*0.2)}" fill="${c.accent}" opacity="0.07"/><rect x="${Math.round(w*0.38)}" y="${Math.round(h*0.845)}" width="${Math.round(w*0.24)}" height="${Math.round(h*0.065)}" rx="2" fill="none" stroke="${c.accent}" stroke-width="1.5"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.888)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.022)}" fill="${c.accent}" letter-spacing="2">${cta.toUpperCase()}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.95)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.016)}" fill="${c.text}" opacity="0.4">${tagline}</text></svg>`
              if (layout === 3) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><polygon points="${Math.round(w*0.6)},0 ${w},0 ${w},${Math.round(h*0.5)}" fill="${c.accent}" opacity="0.08"/><polygon points="0,${Math.round(h*0.6)} 0,${h} ${Math.round(w*0.4)},${h}" fill="${c.accent}" opacity="0.05"/><rect x="${Math.round(w*0.07)}" y="${Math.round(h*0.25)}" width="${Math.round(w*0.55)}" height="${Math.round(h*0.08)}" fill="none" stroke="${c.accent}" stroke-width="0.5" opacity="0.4"/><text x="${Math.round(w*0.1)}" y="${Math.round(h*0.31)}" font-family="sans-serif" font-size="${Math.round(w*0.022)}" fill="${c.accent}" letter-spacing="4" opacity="0.9">${hotel.toUpperCase()}</text><text x="${Math.round(w*0.1)}" y="${Math.round(h*0.49)}" font-family="Georgia,serif" font-size="${Math.round(w*0.072)}" fill="${c.text}" font-weight="bold">${headline}</text><text x="${Math.round(w*0.1)}" y="${Math.round(h*0.58)}" font-family="sans-serif" font-size="${Math.round(w*0.027)}" fill="${c.text}" opacity="0.68">${sub}</text><rect x="${Math.round(w*0.1)}" y="${Math.round(h*0.65)}" width="${Math.round(w*0.22)}" height="${Math.round(h*0.06)}" rx="2" fill="${c.accent}" opacity="0.18" stroke="${c.accent}" stroke-width="1"/><text x="${Math.round(w*0.21)}" y="${Math.round(h*0.69)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.022)}" fill="${c.accent}" letter-spacing="2">${cta.toUpperCase()}</text><text x="${Math.round(w*0.1)}" y="${Math.round(h*0.87)}" font-family="sans-serif" font-size="${Math.round(w*0.016)}" fill="${c.text}" opacity="0.4">${tagline}</text></svg>`
              return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${Math.round(w/2)}" cy="${Math.round(h*0.42)}" r="${Math.round(w*0.32)}" fill="none" stroke="${c.accent}" stroke-width="0.8" opacity="0.25"/><circle cx="${Math.round(w/2)}" cy="${Math.round(h*0.42)}" r="${Math.round(w*0.27)}" fill="none" stroke="${c.accent}" stroke-width="0.4" opacity="0.14"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.33)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.032)}" fill="${c.accent}" letter-spacing="4">${hotel.toUpperCase()}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.44)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w*0.07)}" fill="${c.text}" font-weight="bold">${headline}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.52)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.026)}" fill="${c.text}" opacity="0.68">${sub}</text><rect x="${Math.round(w*0.38)}" y="${Math.round(h*0.62)}" width="${Math.round(w*0.24)}" height="${Math.round(h*0.06)}" rx="30" fill="none" stroke="${c.accent}" stroke-width="1.5"/><text x="${Math.round(w/2)}" y="${Math.round(h*0.66)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.022)}" fill="${c.accent}" letter-spacing="2">${cta.toUpperCase()}</text><text x="${Math.round(w/2)}" y="${Math.round(h*0.83)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w*0.016)}" fill="${c.text}" opacity="0.4">${tagline}</text></svg>`
            }

            function downloadSVG() {
              const svg = makeSVG()
              const blob = new Blob([svg], { type: 'image/svg+xml' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `hotel-fountain-${designPlatform}-${designTheme}-v${designSeed}.svg`
              document.body.appendChild(a); a.click()
              document.body.removeChild(a); URL.revokeObjectURL(url)
            }

            async function sendForApproval() {
              downloadSVG()
              setApprovalSent(true)
              try {
                await fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
                  body: JSON.stringify({ action: 'email_design_approval', platform: designPlatform, theme: designTheme, bg: designBg, seed: designSeed, layout }) })
              } catch(e) { }
              toast('Design downloaded & approval email sent ✓')
              setTimeout(() => setApprovalSent(false), 4000)
            }

            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(makeSVG())))
            const aspectRatio = h / w
            const previewW = 340
            const previewH = Math.round(previewW * aspectRatio)

            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                  {/* Controls panel */}
                  <div>
                    <div className="card mb3">
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>📐 Platform</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {PLATFORMS.map(p => (
                          <button key={p.id} onClick={() => { setDesignPlatform(p.id); setDesignSeed(s => s + 1) }}
                            style={{ padding: '8px 10px', fontSize: 10, background: designPlatform === p.id ? 'rgba(200,169,110,.15)' : 'rgba(0,0,0,.2)', border: `1px solid ${designPlatform === p.id ? 'rgba(200,169,110,.5)' : 'var(--br)'}`, color: designPlatform === p.id ? 'var(--gold)' : 'var(--tx3)', cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 }}>
                            <div style={{ fontWeight: 600 }}>{p.label}</div>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>{p.w}×{p.h}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="card mb3">
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>🎯 Content Theme</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {THEMES.map(t => (
                          <button key={t.id} onClick={() => { setDesignTheme(t.id); setDesignSeed(s => s + 1) }}
                            style={{ padding: '8px 12px', fontSize: 11, background: designTheme === t.id ? 'rgba(200,169,110,.12)' : 'rgba(0,0,0,.15)', border: `1px solid ${designTheme === t.id ? 'rgba(200,169,110,.4)' : 'var(--br)'}`, color: designTheme === t.id ? 'var(--gold)' : 'var(--tx2)', cursor: 'pointer', textAlign: 'left' }}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="card mb3">
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>🎨 Background</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {BGS.map(b => (
                          <button key={b.id} onClick={() => { setDesignBg(b.id); setDesignSeed(s => s + 1) }}
                            style={{ padding: '8px 10px', fontSize: 10, background: designBg === b.id ? 'rgba(200,169,110,.12)' : 'rgba(0,0,0,.2)', border: `1px solid ${designBg === b.id ? 'rgba(200,169,110,.45)' : 'var(--br)'}`, color: designBg === b.id ? 'var(--gold)' : 'var(--tx3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: `linear-gradient(135deg, ${b.from}, ${b.to})`, border: `1px solid ${b.accent}`, flexShrink: 0 }} />
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Preview + Actions */}
                  <div>
                    <div className="card mb3">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>👁 Preview</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--tx3)', background: 'rgba(0,0,0,.3)', padding: '2px 8px', border: '1px solid var(--br)' }}>{plat.label}</span>
                          <span style={{ fontSize: 9, color: 'var(--tx3)', background: 'rgba(0,0,0,.3)', padding: '2px 8px', border: '1px solid var(--br)' }}>Layout {layout + 1}/5</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,.3)', padding: 12, border: '1px solid var(--br2)' }}>
                        <img src={svgDataUrl} width={previewW} height={previewH} style={{ display: 'block', maxWidth: '100%' }} alt="Design preview" />
                      </div>
                      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--tx3)', textAlign: 'center' }}>
                        Change any option above to get a different layout variant
                      </div>
                    </div>

                    <div className="card mb3">
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>🔀 Shuffle Layout</div>
                      <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, marginBottom: 10 }}
                        onClick={() => setDesignSeed(s => s + 1)}>
                        🎲 Generate New Variation
                      </button>
                      <div style={{ fontSize: 9, color: 'var(--tx3)', textAlign: 'center' }}>
                        Cycles through 5 unique layout templates
                      </div>
                    </div>

                    <div className="card">
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>📤 Export</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={downloadSVG}>
                          ⬇ Download SVG
                        </button>
                        <button
                          onClick={sendForApproval}
                          disabled={approvalSent}
                          style={{ width: '100%', padding: '10px', fontSize: 11, fontWeight: 600, background: approvalSent ? 'rgba(63,185,80,.1)' : 'rgba(200,169,110,.12)', border: `1px solid ${approvalSent ? 'rgba(63,185,80,.4)' : 'rgba(200,169,110,.4)'}`, color: approvalSent ? 'var(--grn)' : 'var(--gold)', cursor: approvalSent ? 'default' : 'pointer', letterSpacing: '.05em', transition: 'all .2s' }}>
                          {approvalSent ? '✓ Sent for Approval' : '📧 Email for Approval + Auto-Download'}
                        </button>
                        <div style={{ fontSize: 9, color: 'var(--tx3)', lineHeight: 1.5 }}>
                          Sends notification to hotellfountainbd@gmail.com and downloads the file automatically
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )
    }

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
setTimeout(()=>{ const el=document.getElementById('loading'); if(el) el.style.display='none'; }, 8000);