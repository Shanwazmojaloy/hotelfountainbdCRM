import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   HOTEL FOUNTAIN V5.2.0 — LUXURY MANAGEMENT SYSTEM
   Full Clone · All Integrations · Daily Transactions
═══════════════════════════════════════════════════════════════ */

// ─── SEED DATA ──────────────────────────────────────────────────
const TODAY = new Date("2026-03-08");
const fmtDate = (d) => d.toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const INIT_ROOMS = [
  { id:"101", type:"Standard",     floor:1, status:"occupied",     rate:120,  beds:"Queen", view:"Garden",   guest:"Ahmed Al-Rashid",  checkIn:"2026-03-06", checkOut:"2026-03-10" },
  { id:"102", type:"Standard",     floor:1, status:"available",    rate:120,  beds:"Twin",  view:"Garden",   guest:null },
  { id:"103", type:"Standard",     floor:1, status:"housekeeping", rate:120,  beds:"King",  view:"Garden",   guest:null },
  { id:"104", type:"Standard",     floor:1, status:"maintenance",  rate:120,  beds:"Queen", view:"Garden",   guest:null },
  { id:"105", type:"Standard",     floor:1, status:"available",    rate:120,  beds:"Twin",  view:"Garden",   guest:null },
  { id:"201", type:"Deluxe",       floor:2, status:"occupied",     rate:220,  beds:"King",  view:"Pool",     guest:"Sarah Mitchell",   checkIn:"2026-03-07", checkOut:"2026-03-12" },
  { id:"202", type:"Deluxe",       floor:2, status:"available",    rate:220,  beds:"Queen", view:"Pool",     guest:null },
  { id:"203", type:"Deluxe",       floor:2, status:"occupied",     rate:220,  beds:"King",  view:"City",     guest:"James Okonkwo",    checkIn:"2026-03-05", checkOut:"2026-03-09" },
  { id:"204", type:"Deluxe",       floor:2, status:"available",    rate:220,  beds:"King",  view:"Pool",     guest:null },
  { id:"301", type:"Suite",        floor:3, status:"occupied",     rate:450,  beds:"King",  view:"Ocean",    guest:"Lin Wei",          checkIn:"2026-03-08", checkOut:"2026-03-15" },
  { id:"302", type:"Suite",        floor:3, status:"housekeeping", rate:450,  beds:"King",  view:"Ocean",    guest:null },
  { id:"303", type:"Suite",        floor:3, status:"available",    rate:450,  beds:"King",  view:"Panoramic",guest:null },
  { id:"401", type:"Presidential", floor:4, status:"occupied",     rate:1200, beds:"King",  view:"Panoramic",guest:"Elena Vasquez",    checkIn:"2026-03-01", checkOut:"2026-03-20" },
  { id:"402", type:"Presidential", floor:4, status:"available",    rate:1200, beds:"King",  view:"Panoramic",guest:null },
];

const INIT_GUESTS = [
  { id:1, name:"Ahmed Al-Rashid", email:"ahmed@example.com",  phone:"+971-50-123-4567", nationality:"UAE",     room:"101", status:"checked-in", vip:true,  stays:12, spent:8420,  loyalty:2800, joined:"2023-01-15", notes:"Prefers high floor. No smoking." },
  { id:2, name:"Sarah Mitchell",  email:"sarah@example.com",  phone:"+1-555-234-5678",  nationality:"USA",     room:"201", status:"checked-in", vip:false, stays:3,  spent:1240,  loyalty:420,  joined:"2025-03-10", notes:"Vegetarian meals only." },
  { id:3, name:"James Okonkwo",   email:"james@example.com",  phone:"+234-80-345-6789", nationality:"Nigeria", room:"203", status:"checked-in", vip:false, stays:1,  spent:660,   loyalty:120,  joined:"2026-02-20", notes:"" },
  { id:4, name:"Lin Wei",         email:"lin@example.com",    phone:"+86-138-456-7890", nationality:"China",   room:"301", status:"checked-in", vip:true,  stays:7,  spent:5800,  loyalty:1900, joined:"2024-06-05", notes:"Requests extra towels daily." },
  { id:5, name:"Elena Vasquez",   email:"elena@example.com",  phone:"+34-600-567-8901", nationality:"Spain",   room:"401", status:"checked-in", vip:true,  stays:18, spent:24600, loyalty:8200, joined:"2022-09-12", notes:"Late checkout approved. Champagne on arrival." },
  { id:6, name:"Tariq Hassan",    email:"tariq@example.com",  phone:"+92-300-678-9012", nationality:"Pakistan",room:null,  status:"reserved",   vip:false, stays:2,  spent:980,   loyalty:280,  joined:"2025-07-18", notes:"" },
  { id:7, name:"Priya Sharma",    email:"priya@example.com",  phone:"+91-98-7654-3210", nationality:"India",   room:null,  status:"reserved",   vip:false, stays:0,  spent:0,     loyalty:0,    joined:"2026-03-01", notes:"First visit. Send welcome package." },
];

const INIT_RESERVATIONS = [
  { id:"RES-001", guestId:1, guest:"Ahmed Al-Rashid", room:"101", type:"Standard",     checkIn:"2026-03-06", checkOut:"2026-03-10", nights:4,  amount:480,   paid:480,   status:"confirmed", source:"Direct",      created:"2026-02-20" },
  { id:"RES-002", guestId:2, guest:"Sarah Mitchell",  room:"201", type:"Deluxe",       checkIn:"2026-03-07", checkOut:"2026-03-12", nights:5,  amount:1100,  paid:550,   status:"confirmed", source:"Booking.com", created:"2026-02-25" },
  { id:"RES-003", guestId:3, guest:"James Okonkwo",   room:"203", type:"Deluxe",       checkIn:"2026-03-05", checkOut:"2026-03-09", nights:4,  amount:880,   paid:880,   status:"confirmed", source:"Expedia",     created:"2026-02-28" },
  { id:"RES-004", guestId:4, guest:"Lin Wei",         room:"301", type:"Suite",        checkIn:"2026-03-08", checkOut:"2026-03-15", nights:7,  amount:3150,  paid:1575,  status:"confirmed", source:"Direct",      created:"2026-03-01" },
  { id:"RES-005", guestId:5, guest:"Elena Vasquez",   room:"401", type:"Presidential", checkIn:"2026-03-01", checkOut:"2026-03-20", nights:19, amount:22800, paid:22800, status:"confirmed", source:"Corporate",   created:"2026-02-10" },
  { id:"RES-006", guestId:6, guest:"Tariq Hassan",    room:"202", type:"Deluxe",       checkIn:"2026-03-15", checkOut:"2026-03-18", nights:3,  amount:660,   paid:0,     status:"pending",   source:"Direct",      created:"2026-03-05" },
  { id:"RES-007", guestId:7, guest:"Priya Sharma",    room:"102", type:"Standard",     checkIn:"2026-03-11", checkOut:"2026-03-14", nights:3,  amount:360,   paid:180,   status:"pending",   source:"Airbnb",      created:"2026-03-06" },
];

const INIT_TASKS = [
  { id:1, room:"103", type:"Deep Clean",    priority:"high",   assignee:"Maria Santos",    dept:"Housekeeping", status:"in-progress", time:"09:00", notes:"Post checkout clean" },
  { id:2, room:"302", type:"Turndown",      priority:"medium", assignee:"John Dela Cruz",  dept:"Housekeeping", status:"pending",     time:"14:00", notes:"VIP room" },
  { id:3, room:"104", type:"AC Repair",     priority:"high",   assignee:"Robert Kim",      dept:"Maintenance",  status:"pending",     time:"10:30", notes:"Thermostat fault" },
  { id:4, room:"202", type:"Inspection",    priority:"low",    assignee:"Maria Santos",    dept:"Housekeeping", status:"completed",   time:"08:00", notes:"Pre-arrival check" },
  { id:5, room:"401", type:"VIP Turndown",  priority:"high",   assignee:"John Dela Cruz",  dept:"Housekeeping", status:"completed",   time:"07:30", notes:"Champagne + flowers" },
  { id:6, room:"301", type:"Extra Towels",  priority:"medium", assignee:"Maria Santos",    dept:"Housekeeping", status:"pending",     time:"11:00", notes:"Guest request" },
];

// Generate daily transactions for the past 30 days
function genTransactions() {
  const txns = [];
  const types = ["Room Charge","Restaurant","Room Service","Spa","Minibar","Laundry","Airport Transfer","Parking","Gift Shop","Bar & Lounge"];
  const guests = ["Ahmed Al-Rashid","Sarah Mitchell","James Okonkwo","Lin Wei","Elena Vasquez","Tariq Hassan","Priya Sharma","Maria Lopez","David Chen","Sofia Rossi"];
  const methods = ["Credit Card","Cash","Bank Transfer","Corporate Account","Room Charge"];
  let id = 1;
  for (let i = 29; i >= 0; i--) {
    const date = fmtDate(addDays(TODAY, -i));
    const count = 8 + Math.floor(Math.random() * 12);
    for (let j = 0; j < count; j++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const base = type === "Room Charge" ? 120 + Math.floor(Math.random()*1080) : 20 + Math.floor(Math.random()*280);
      txns.push({
        id: `TXN-${String(id++).padStart(4,"0")}`,
        date,
        time: `${String(8+Math.floor(Math.random()*14)).padStart(2,"0")}:${String(Math.floor(Math.random()*60)).padStart(2,"0")}`,
        guest: guests[Math.floor(Math.random()*guests.length)],
        type,
        room: `${Math.floor(Math.random()*4+1)}0${Math.floor(Math.random()*5+1)}`,
        amount: base,
        method: methods[Math.floor(Math.random()*methods.length)],
        status: Math.random() > 0.05 ? "completed" : "pending",
      });
    }
  }
  return txns;
}

const ALL_TRANSACTIONS = genTransactions();

// ─── UTILS ──────────────────────────────────────────────────────
const AV_COLORS = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500","#FF6B6B","#4ECDC4"];
const avColor  = n => AV_COLORS[n ? n.charCodeAt(0) % AV_COLORS.length : 0];
const initials = n => n ? n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
const fmtMoney = n => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toLocaleString()}`;
const STATUS_CLR = { available:"#3FB950", occupied:"#58A6FF", housekeeping:"#F0A500", maintenance:"#E05C7A" };

// ─── GLOBAL STYLES ──────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0C1118;--s1:#131920;--s2:#1A2130;--s3:#1F2840;
  --gold:#C8A96E;--gold2:#E8C97E;--gdim:rgba(200,169,110,0.12);
  --teal:#2EC4B6;--rose:#E05C7A;--sky:#58A6FF;--grn:#3FB950;--amb:#F0A500;--pur:#9B72CF;
  --tx:#E6EDF3;--tx2:#8B949E;--tx3:#3D4550;
  --br:rgba(200,169,110,0.13);--br2:rgba(255,255,255,0.06);
  --r:10px;--sh:0 8px 32px rgba(0,0,0,.45);
}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--tx);font-family:'Jost',sans-serif}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(200,169,110,.25);border-radius:2px}

/* LAYOUT */
.app{display:flex;height:100vh;overflow:hidden}
.sidebar{width:236px;flex-shrink:0;background:var(--s1);border-right:1px solid var(--br);display:flex;flex-direction:column}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* SIDEBAR */
.s-logo{padding:22px 18px 18px;border-bottom:1px solid var(--br)}
.s-logo-mark{font-size:24px;margin-bottom:6px}
.s-logo-name{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--gold);letter-spacing:.02em;line-height:1.1}
.s-logo-ver{font-family:'DM Mono',monospace;font-size:9px;color:var(--tx3);letter-spacing:.15em;margin-top:2px}
.s-nav{flex:1;padding:10px 8px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.s-sect{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.18em;color:var(--tx3);padding:10px 10px 3px;text-transform:uppercase}
.s-item{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:7px;cursor:pointer;transition:all .2s;font-size:13px;font-weight:400;color:var(--tx2);border:1px solid transparent;user-select:none;position:relative}
.s-item:hover{background:var(--gdim);color:var(--tx)}
.s-item.active{background:var(--gdim);color:var(--gold);border-color:rgba(200,169,110,.22);font-weight:500}
.s-item .ico{font-size:14px;width:18px;text-align:center;flex-shrink:0}
.s-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:9px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:10px}
.s-user{padding:13px 14px;border-top:1px solid var(--br);display:flex;align-items:center;gap:9px}
.s-u-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--teal));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0C1118;flex-shrink:0}
.s-u-name{font-size:12px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-u-role{font-family:'DM Mono',monospace;font-size:9px;color:var(--tx3);letter-spacing:.08em}

/* TOPBAR */
.topbar{height:54px;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--br);display:flex;align-items:center;padding:0 22px;gap:14px}
.tb-title{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--tx);flex:1}
.tb-date{font-family:'DM Mono',monospace;font-size:10.5px;color:var(--tx2);letter-spacing:.06em;white-space:nowrap}
.content{flex:1;overflow-y:auto;padding:22px}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12.5px;font-weight:500;cursor:pointer;border:none;transition:all .2s;font-family:'Jost',sans-serif;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-gold{background:var(--gold);color:#0C1118}
.btn-gold:hover:not(:disabled){background:var(--gold2);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--br2)}
.btn-ghost:hover:not(:disabled){background:var(--s2);color:var(--tx);border-color:var(--br)}
.btn-danger{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.btn-danger:hover:not(:disabled){background:rgba(224,92,122,.2)}
.btn-success{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.btn-success:hover:not(:disabled){background:rgba(63,185,80,.2)}
.btn-sm{padding:5px 10px;font-size:11.5px}
.btn-icon{padding:6px 8px}

/* CARDS */
.card{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);overflow:hidden}
.card-hd{padding:14px 18px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.card-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--tx)}
.card-body{padding:18px}

/* STAT CARDS */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);padding:18px;position:relative;overflow:hidden;transition:all .25s}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac,var(--gold))}
.stat:hover{border-color:rgba(200,169,110,.3);transform:translateY(-2px);box-shadow:var(--sh)}
.stat-ico{font-size:20px;margin-bottom:10px}
.stat-lbl{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.13em;color:var(--tx2);text-transform:uppercase;margin-bottom:4px}
.stat-val{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:var(--tx);line-height:1}
.stat-sub{font-size:11.5px;color:var(--tx2);margin-top:5px}
.stat-chg{font-size:10.5px;margin-top:3px}
.up{color:var(--grn)}.down{color:var(--rose)}

/* BADGE */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-family:'DM Mono',monospace;letter-spacing:.04em;font-weight:500;white-space:nowrap}
.bg{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.bb{background:rgba(88,166,255,.12);color:var(--sky);border:1px solid rgba(88,166,255,.2)}
.ba{background:rgba(240,165,0,.12);color:var(--amb);border:1px solid rgba(240,165,0,.2)}
.br2{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.bgold{background:rgba(200,169,110,.12);color:var(--gold);border:1px solid rgba(200,169,110,.2)}
.bp{background:rgba(155,114,207,.12);color:var(--pur);border:1px solid rgba(155,114,207,.2)}

/* TABLE */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase;padding:9px 13px;text-align:left;border-bottom:1px solid var(--br2);white-space:nowrap}
.tbl td{padding:11px 13px;border-bottom:1px solid var(--br2);font-size:12.5px;color:var(--tx);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(255,255,255,.015)}
.tbl-wrap{overflow-x:auto}

/* ROOMS */
.rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}
.room-card{border-radius:9px;padding:13px 11px;cursor:pointer;transition:all .2s;border:1px solid transparent;position:relative}
.room-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.35)}
.room-card.available{background:rgba(63,185,80,.07);border-color:rgba(63,185,80,.18)}
.room-card.occupied{background:rgba(88,166,255,.07);border-color:rgba(88,166,255,.18)}
.room-card.housekeeping{background:rgba(240,165,0,.07);border-color:rgba(240,165,0,.18)}
.room-card.maintenance{background:rgba(224,92,122,.07);border-color:rgba(224,92,122,.18)}
.room-no{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;line-height:1;margin-bottom:3px}
.room-card.available .room-no{color:var(--grn)}.room-card.occupied .room-no{color:var(--sky)}
.room-card.housekeeping .room-no{color:var(--amb)}.room-card.maintenance .room-no{color:var(--rose)}
.room-tp{font-size:9.5px;color:var(--tx2);font-family:'DM Mono',monospace;letter-spacing:.07em;margin-bottom:7px;text-transform:uppercase}
.room-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.room-dot.available{background:var(--grn);box-shadow:0 0 5px var(--grn)}
.room-dot.occupied{background:var(--sky);box-shadow:0 0 5px var(--sky)}
.room-dot.housekeeping{background:var(--amb);box-shadow:0 0 5px var(--amb)}
.room-dot.maintenance{background:var(--rose);box-shadow:0 0 5px var(--rose)}
.room-info-row{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--tx2)}
.room-guest-name{font-size:9.5px;color:var(--tx2);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic}
.room-rate{font-family:'DM Mono',monospace;font-size:10.5px;color:var(--gold);margin-top:3px}

/* TABS */
.tabs{display:flex;gap:2px;background:var(--s2);border-radius:8px;padding:3px;flex-wrap:wrap}
.tab{padding:6px 13px;border-radius:6px;font-size:12.5px;cursor:pointer;transition:all .2s;color:var(--tx2);border:none;background:none;font-family:'Jost',sans-serif;white-space:nowrap}
.tab.active{background:var(--s1);color:var(--tx);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,.3)}

/* MODAL */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.modal{background:var(--s1);border:1px solid var(--br);border-radius:14px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,.65);animation:modalIn .25s ease}
@keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.modal-hd{padding:18px 22px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--s1);z-index:1}
.modal-title{font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:700;color:var(--tx)}
.modal-close{background:none;border:none;color:var(--tx2);cursor:pointer;font-size:22px;line-height:1;padding:0;transition:color .2s}
.modal-close:hover{color:var(--tx)}
.modal-body{padding:22px}
.modal-ft{padding:14px 22px;border-top:1px solid var(--br2);display:flex;gap:9px;justify-content:flex-end}

/* FORM */
.fg{margin-bottom:14px}
.flbl{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.11em;color:var(--tx2);text-transform:uppercase;margin-bottom:5px;display:block}
.finput{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:13px;font-family:'Jost',sans-serif;outline:none;transition:border-color .2s}
.finput:focus{border-color:rgba(200,169,110,.4)}
.fselect{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:13px;font-family:'Jost',sans-serif;outline:none;cursor:pointer;appearance:none}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.ftextarea{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:13px;font-family:'Jost',sans-serif;outline:none;resize:vertical;min-height:70px;transition:border-color .2s}
.ftextarea:focus{border-color:rgba(200,169,110,.4)}

/* AVATAR */
.av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0C1118;flex-shrink:0}
.av-lg{width:44px;height:44px;font-size:15px}
.av-md{width:34px;height:34px;font-size:12px}
.av-sm{width:27px;height:27px;font-size:10px}

/* GUEST ROW */
.g-row{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--br2);cursor:pointer;transition:all .2s;border-radius:6px}
.g-row:last-child{border-bottom:none}
.g-row:hover{padding-left:5px}
.g-name{font-size:13px;font-weight:500;color:var(--tx);display:flex;align-items:center;gap:5px}
.vip-star{color:var(--gold);font-size:10px}
.g-meta{font-size:11px;color:var(--tx2);margin-top:1px}

/* FOLIO */
.folio-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--br2);font-size:12.5px}
.folio-row:last-child{border-bottom:none}
.folio-total{display:flex;align-items:center;justify-content:space-between;padding:13px 0 0;font-size:14px;font-weight:600;color:var(--gold)}

/* PRIORITY */
.pdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.pdot.high{background:var(--rose);box-shadow:0 0 5px var(--rose)}
.pdot.medium{background:var(--amb);box-shadow:0 0 5px var(--amb)}
.pdot.low{background:var(--grn);box-shadow:0 0 5px var(--grn)}

/* CHART */
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:110px;padding:0 2px}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}
.bar{width:100%;border-radius:3px 3px 0 0;transition:all .35s cubic-bezier(.4,0,.2,1);min-height:4px}
.bar-lbl{font-family:'DM Mono',monospace;font-size:8.5px;color:var(--tx3);letter-spacing:.04em}

/* OCCUPANCY RING */
.ring-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.ring-wrap svg{transform:rotate(-90deg)}
.ring-center{position:absolute;text-align:center}
.ring-pct{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:var(--gold);line-height:1}
.ring-lbl{font-family:'DM Mono',monospace;font-size:8px;color:var(--tx3);letter-spacing:.1em}

/* TOAST */
.toast{position:fixed;bottom:22px;right:22px;background:var(--s1);border:1px solid rgba(200,169,110,.3);border-radius:10px;padding:13px 17px;box-shadow:0 20px 60px rgba(0,0,0,.55);z-index:999;display:flex;align-items:center;gap:9px;font-size:13px;color:var(--tx);animation:toastIn .3s ease;max-width:340px}
.toast.error{border-color:rgba(224,92,122,.35)}
@keyframes toastIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* SEARCH */
.search{display:flex;align-items:center;gap:7px;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:7px 11px;min-width:200px}
.search input{background:none;border:none;outline:none;color:var(--tx);font-size:12.5px;font-family:'Jost',sans-serif;flex:1;min-width:0}
.search input::placeholder{color:var(--tx3)}

/* GRID HELPERS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g3{display:grid;grid-template-columns:2fr 1fr;gap:16px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.flex{display:flex}.fac{align-items:center}.fjb{justify-content:space-between}.gap2{gap:8px}.gap3{gap:12px}.gap4{gap:16px}
.mt2{margin-top:8px}.mt3{margin-top:12px}.mt4{margin-top:16px}.mt6{margin-top:24px}.mb4{margin-bottom:16px}.mb6{margin-bottom:24px}
.mono{font-family:'DM Mono',monospace}.serif{font-family:'Cormorant Garamond',serif}
.gold{color:var(--gold)}.muted{color:var(--tx2)}.sm{font-size:11.5px}.xs{font-size:10px}
.w100{width:100%}.bold{font-weight:600}
.divider{border:none;border-top:1px solid var(--br2);margin:14px 0}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;color:var(--tx3);gap:10px}
.empty-state span:first-child{font-size:36px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.info-box{padding:11px 13px;background:var(--s2);border-radius:8px;border:1px solid var(--br2)}
.info-lbl{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.11em;color:var(--tx3);text-transform:uppercase;margin-bottom:3px}
.info-val{font-size:13.5px;font-weight:500;color:var(--tx)}
.progress-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden;margin-top:8px}
.progress-fill{height:100%;border-radius:3px;transition:width .6s ease}
`;

// ─── SUB-COMPONENTS ─────────────────────────────────────────────

function Avatar({ name, size = "md", style = {} }) {
  const cls = size === "lg" ? "av av-lg" : size === "sm" ? "av av-sm" : "av av-md";
  return (
    <div className={cls} style={{ background: `linear-gradient(135deg,${avColor(name)},rgba(0,0,0,.45))`, ...style }}>
      {initials(name)}
    </div>
  );
}

function Badge({ children, color = "gold" }) {
  const cls = { gold:"bgold", green:"bg", blue:"bb", amber:"ba", red:"br2", purple:"bp" }[color] || "bgold";
  return <span className={`badge ${cls}`}>{children}</span>;
}

function StatusBadge({ status }) {
  const map = { confirmed:"green", pending:"amber", cancelled:"red", "checked-in":"blue", reserved:"amber", completed:"green", "in-progress":"blue", available:"green", occupied:"blue", housekeeping:"amber", maintenance:"red" };
  return <Badge color={map[status] || "gold"}>{status}</Badge>;
}

function OccRing({ pct }) {
  const r = 50, c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="9"/>
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#rg)" strokeWidth="9"
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"/>
        <defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C8A96E"/><stop offset="100%" stopColor="#E8C97E"/>
        </linearGradient></defs>
      </svg>
      <div className="ring-center"><div className="ring-pct">{pct}%</div><div className="ring-lbl">OCC.</div></div>
    </div>
  );
}

function BarChart({ data, valueKey, labelKey, color = "#C8A96E", color2 = "#E8C97E", activeIndex, onHover }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-col" onMouseEnter={() => onHover && onHover(i)} onMouseLeave={() => onHover && onHover(activeIndex)}>
          <div className="bar" style={{
            height: `${(d[valueKey] / max) * 100}%`,
            background: i === activeIndex
              ? `linear-gradient(to top,${color},${color2})`
              : `linear-gradient(to top,rgba(200,169,110,.35),rgba(200,169,110,.1))`
          }}/>
          <span className="bar-lbl">{d[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, footer, width = 540 }) {
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder = "Search..." }) {
  return (
    <div className="search">
      <span style={{ color: "var(--tx3)", fontSize: 13 }}>⌕</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {value && <span style={{ cursor:"pointer", color:"var(--tx3)", fontSize:12 }} onClick={() => onChange("")}>×</span>}
    </div>
  );
}

// ─── PAGES ──────────────────────────────────────────────────────

/* DASHBOARD */
function Dashboard({ rooms, guests, reservations, tasks, transactions, setPage, toast }) {
  const occ = rooms.filter(r => r.status === "occupied").length;
  const avail = rooms.filter(r => r.status === "available").length;
  const hsk = rooms.filter(r => r.status === "housekeeping").length;
  const maint = rooms.filter(r => r.status === "maintenance").length;
  const occPct = Math.round((occ / rooms.length) * 100);
  const checkedIn = guests.filter(g => g.status === "checked-in").length;
  const todayTxns = transactions.filter(t => t.date === fmtDate(TODAY));
  const todayRev = todayTxns.reduce((a, t) => a + t.amount, 0);
  const pendingTasks = tasks.filter(t => t.status === "pending").length;
  const highPending = tasks.filter(t => t.status === "pending" && t.priority === "high").length;

  const recentArrivals = reservations.filter(r => r.status === "confirmed").slice(0, 5);
  const pendingTasksList = tasks.filter(t => t.status !== "completed").slice(0, 5);

  const monthRevData = [
    { m:"Sep", v:68400 },{ m:"Oct", v:74200 },{ m:"Nov", v:61800 },
    { m:"Dec", v:89600 },{ m:"Jan", v:52300 },{ m:"Feb", v:71500 },{ m:"Mar", v:todayRev * 8 + 30000 },
  ];
  const [chartActive, setChartActive] = useState(6);

  return (
    <div>
      <div className="stats-row">
        {[
          { lbl:"Today's Revenue",   val:`$${todayRev.toLocaleString()}`, ico:"💰", sub:`${todayTxns.length} transactions`, chg:"+14% vs yesterday", up:true,  ac:"#C8A96E" },
          { lbl:"Occupancy Rate",    val:`${occPct}%`,                    ico:"🛏️", sub:`${occ}/${rooms.length} rooms`,    chg:`${avail} available`,  up:true,  ac:"#58A6FF" },
          { lbl:"In-House Guests",   val:checkedIn,                       ico:"👥", sub:"Currently checked in",            chg:"2 arrivals today",    up:true,  ac:"#2EC4B6" },
          { lbl:"Pending Tasks",     val:pendingTasks,                    ico:"📋", sub:`${highPending} high priority`,    chg:maint > 0 ? `${maint} maintenance` : "All clear", up:false, ac:"#E05C7A" },
        ].map(s => (
          <div key={s.lbl} className="stat" style={{ "--ac": s.ac }}>
            <div className="stat-ico">{s.ico}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-sub muted">{s.sub}</div>
            <div className={`stat-chg ${s.up ? "up" : "down"}`}>{s.up ? "↑" : "↓"} {s.chg}</div>
          </div>
        ))}
      </div>

      <div className="g3 mb4">
        {/* Revenue Chart */}
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Revenue Overview</span>
            <Badge color="gold">7 Months</Badge>
          </div>
          <div className="card-body">
            <BarChart data={monthRevData} valueKey="v" labelKey="m" activeIndex={chartActive} onHover={setChartActive} />
            <div className="mt3 flex fjb sm">
              <span className="muted">{monthRevData[chartActive].m} 2026</span>
              <span className="mono gold">${monthRevData[chartActive].v.toLocaleString()}</span>
            </div>
            <hr className="divider"/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[["RevPAR","$186"],["ADR","$312"],["Bookings",reservations.length]].map(([l,v]) => (
                <div key={l} style={{ textAlign:"center", padding:"10px 6px", background:"rgba(255,255,255,.02)", borderRadius:8, border:"1px solid var(--br2)" }}>
                  <div className="mono xs muted" style={{ letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 }}>{l}</div>
                  <div className="serif" style={{ fontSize:20, fontWeight:700, color:"var(--gold)" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Occupancy */}
        <div className="card" style={{ display:"flex", flexDirection:"column" }}>
          <div className="card-hd"><span className="card-title">Occupancy</span></div>
          <div className="card-body" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
            <OccRing pct={occPct} />
            <div style={{ width:"100%", display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
              {[["Available",avail,"#3FB950"],["Occupied",occ,"#58A6FF"],["Housekeeping",hsk,"#F0A500"],["Maintenance",maint,"#E05C7A"]].map(([l,n,c]) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 9px", background:"rgba(255,255,255,.02)", borderRadius:6 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:c, boxShadow:`0 0 5px ${c}`, flexShrink:0 }}/>
                  <span className="muted xs" style={{ flex:1 }}>{l}</span>
                  <span className="mono xs" style={{ color:c }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="g2">
        {/* Arrivals */}
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Today's Reservations</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage("reservations")}>View All →</button>
          </div>
          <div className="card-body" style={{ padding:"6px 18px" }}>
            {recentArrivals.map(r => (
              <div key={r.id} className="g-row">
                <Avatar name={r.guest} size="sm" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="g-name sm">{r.guest}</div>
                  <div className="g-meta">Room {r.room} · {r.nights}N · {r.source}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div className="mono xs gold">${r.amount.toLocaleString()}</div>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks */}
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Housekeeping Tasks</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage("housekeeping")}>View All →</button>
          </div>
          <div className="card-body" style={{ padding:"6px 18px" }}>
            {pendingTasksList.map(t => (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:"1px solid var(--br2)" }}>
                <div className={`pdot ${t.priority}`}/>
                <div className="serif" style={{ fontSize:20, fontWeight:700, width:36, flexShrink:0 }}>{t.room}</div>
                <div style={{ flex:1 }}>
                  <div className="sm bold">{t.type}</div>
                  <div className="xs muted">{t.assignee} · {t.time}</div>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today's Transactions Summary */}
      <div className="card mt4">
        <div className="card-hd">
          <span className="card-title">Today's Transactions</span>
          <div className="flex gap2">
            <Badge color="blue">{todayTxns.length} transactions</Badge>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage("reports")}>Full Report →</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              {["ID","Guest","Type","Room","Amount","Method","Status","Time"].map(h => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {todayTxns.slice(0, 8).map(t => (
                <tr key={t.id}>
                  <td className="mono xs muted">{t.id}</td>
                  <td><div className="flex fac gap2"><Avatar name={t.guest} size="sm"/>{t.guest}</div></td>
                  <td><Badge color="gold">{t.type}</Badge></td>
                  <td><Badge color="blue">{t.room}</Badge></td>
                  <td className="mono xs gold">${t.amount.toLocaleString()}</td>
                  <td className="muted sm">{t.method}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td className="mono xs muted">{t.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ROOMS */
function RoomsPage({ rooms, setRooms, guests, toast }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ guest:"", checkIn:"", checkOut:"" });

  const filtered = filter === "all" ? rooms : rooms.filter(r => r.status === filter);

  function changeStatus(id, s) {
    setRooms(p => p.map(r => r.id === id ? { ...r, status: s, guest: s !== "occupied" ? null : r.guest } : r));
    toast(`Room ${id} → ${s}`, "success");
    setSelected(null);
  }

  function assignGuest(id) {
    if (!form.guest) return toast("Please select a guest", "error");
    setRooms(p => p.map(r => r.id === id ? { ...r, status:"occupied", guest:form.guest, checkIn:form.checkIn, checkOut:form.checkOut } : r));
    toast(`Guest assigned to room ${id}`, "success");
    setSelected(null);
    setForm({ guest:"", checkIn:"", checkOut:"" });
  }

  const availGuests = guests.filter(g => !g.room && (g.status === "reserved" || g.status === "checked-in"));

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{ flexWrap:"wrap" }}>
        <div className="tabs">
          {["all","available","occupied","housekeeping","maintenance"].map(s => (
            <button key={s} className={`tab ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {s === "all" ? `All (${rooms.length})` : `${s.charAt(0).toUpperCase()+s.slice(1)} (${rooms.filter(r=>r.status===s).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap4 mb4" style={{ flexWrap:"wrap" }}>
        {[["available","#3FB950"],["occupied","#58A6FF"],["housekeeping","#F0A500"],["maintenance","#E05C7A"]].map(([s,c]) => (
          <div key={s} className="flex fac gap2 sm muted">
            <div style={{ width:8, height:8, borderRadius:"50%", background:c, boxShadow:`0 0 5px ${c}` }}/>
            <span style={{ textTransform:"capitalize" }}>{s}</span>
          </div>
        ))}
      </div>

      <div className="rooms-grid">
        {filtered.map(room => (
          <div key={room.id} className={`room-card ${room.status}`} onClick={() => setSelected(room)}>
            <div className="room-no">{room.id}</div>
            <div className="room-tp">{room.type} · {room.view}</div>
            <div className="room-info-row">
              <div className={`room-dot ${room.status}`}/>
              <span style={{ fontSize:10.5, color:"var(--tx2)", textTransform:"capitalize" }}>{room.status}</span>
            </div>
            {room.guest && <div className="room-guest-name">👤 {room.guest}</div>}
            <div className="room-rate">${room.rate}/night</div>
          </div>
        ))}
      </div>

      {selected && (
        <Modal title={`Room ${selected.id} — ${selected.type}`} onClose={() => setSelected(null)}
          footer={<button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>}>
          <div className="info-grid mb4">
            {[["Floor",`Floor ${selected.floor}`],["Bed",selected.beds],["View",selected.view],["Rate",`$${selected.rate}/night`]].map(([l,v]) => (
              <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
            ))}
          </div>

          {selected.guest && (
            <div style={{ padding:"11px 13px", background:"rgba(88,166,255,.06)", borderRadius:8, border:"1px solid rgba(88,166,255,.15)", marginBottom:16 }}>
              <div className="info-lbl mb3">Current Guest</div>
              <div className="flex fac gap2">
                <Avatar name={selected.guest} size="sm"/>
                <div>
                  <div className="bold sm">{selected.guest}</div>
                  <div className="xs muted">{selected.checkIn} → {selected.checkOut}</div>
                </div>
              </div>
            </div>
          )}

          {!selected.guest && selected.status === "available" && availGuests.length > 0 && (
            <div className="mb4">
              <div className="info-lbl mb3">Assign Guest</div>
              <div className="fg">
                <select className="fselect" value={form.guest} onChange={e => setForm(p=>({...p,guest:e.target.value}))}>
                  <option value="">Select guest...</option>
                  {availGuests.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              </div>
              <div className="frow">
                <div className="fg"><label className="flbl">Check-In</label><input type="date" className="finput" value={form.checkIn} onChange={e=>setForm(p=>({...p,checkIn:e.target.value}))}/></div>
                <div className="fg"><label className="flbl">Check-Out</label><input type="date" className="finput" value={form.checkOut} onChange={e=>setForm(p=>({...p,checkOut:e.target.value}))}/></div>
              </div>
              <button className="btn btn-gold w100" style={{ justifyContent:"center" }} onClick={() => assignGuest(selected.id)}>Assign & Check In</button>
            </div>
          )}

          <div className="info-lbl mb3">Change Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {["available","occupied","housekeeping","maintenance"].map(s => (
              <button key={s} className="btn btn-ghost" style={{ justifyContent:"center", textTransform:"capitalize", borderColor: selected.status===s ? STATUS_CLR[s] : undefined, color: selected.status===s ? STATUS_CLR[s] : undefined }}
                onClick={() => changeStatus(selected.id, s)}>
                {s}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* RESERVATIONS */
function ReservationsPage({ reservations, setReservations, rooms, guests, toast }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ guest:"", room:"", checkIn:"", checkOut:"", source:"Direct", notes:"" });

  const filtered = reservations.filter(r => {
    const matchSearch = r.guest.toLowerCase().includes(search.toLowerCase()) || r.id.includes(search) || r.room.includes(search);
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function addReservation() {
    if (!form.guest || !form.room || !form.checkIn || !form.checkOut) return toast("Fill all required fields", "error");
    const nights = Math.max(1, Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000));
    const rm = rooms.find(r => r.id === form.room);
    const newRes = {
      id: `RES-${String(reservations.length + 1).padStart(3,"0")}`,
      guestId: guests.find(g => g.name === form.guest)?.id,
      guest: form.guest, room: form.room, type: rm?.type || "Standard",
      checkIn: form.checkIn, checkOut: form.checkOut,
      nights, amount: nights * (rm?.rate || 120), paid: 0,
      status: "pending", source: form.source, created: fmtDate(TODAY), notes: form.notes
    };
    setReservations(p => [newRes, ...p]);
    toast(`Reservation created for ${form.guest}`, "success");
    setShowNew(false);
    setForm({ guest:"", room:"", checkIn:"", checkOut:"", source:"Direct", notes:"" });
  }

  function confirmRes(id) {
    setReservations(p => p.map(r => r.id === id ? { ...r, status:"confirmed" } : r));
    toast("Reservation confirmed ✓", "success");
    setSelected(null);
  }

  function cancelRes(id) {
    setReservations(p => p.map(r => r.id === id ? { ...r, status:"cancelled" } : r));
    toast("Reservation cancelled", "error");
    setSelected(null);
  }

  const totalRevenue = filtered.reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{ flexWrap:"wrap" }}>
        <div className="flex gap2" style={{ flexWrap:"wrap" }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search by guest, ID, room..." />
          <div className="tabs">
            {["all","confirmed","pending","cancelled"].map(s => (
              <button key={s} className={`tab ${filterStatus===s?"active":""}`} onClick={() => setFilterStatus(s)}>
                {s.charAt(0).toUpperCase()+s.slice(1)} ({reservations.filter(r=>s==="all"||r.status===s).length})
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-gold" onClick={() => setShowNew(true)}>＋ New Reservation</button>
      </div>

      {/* Summary stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
        {[
          { l:"Total Reservations", v:filtered.length, c:"#58A6FF" },
          { l:"Total Revenue",      v:`$${totalRevenue.toLocaleString()}`, c:"#C8A96E" },
          { l:"Avg Booking Value",  v:filtered.length ? `$${Math.round(totalRevenue/filtered.length).toLocaleString()}` : "$0", c:"#2EC4B6" },
        ].map(s => (
          <div key={s.l} className="card">
            <div className="card-body" style={{ padding:14 }}>
              <div className="xs muted mono mb2" style={{ letterSpacing:".1em", textTransform:"uppercase" }}>{s.l}</div>
              <div className="serif" style={{ fontSize:26, fontWeight:700, color:s.c }}>{s.v}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">Reservations</span>
          <span className="badge bb">{filtered.length} records</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              {["ID","Guest","Room","Type","Check-In","Check-Out","Nights","Amount","Paid","Source","Status","Actions"].map(h=><th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign:"center", padding:"32px", color:"var(--tx3)" }}>No reservations found</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor:"pointer" }} onClick={() => setSelected(r)}>
                  <td className="mono xs muted">{r.id}</td>
                  <td><div className="flex fac gap2"><Avatar name={r.guest} size="sm"/><span>{r.guest}</span></div></td>
                  <td><Badge color="blue">{r.room}</Badge></td>
                  <td className="muted sm">{r.type}</td>
                  <td className="mono xs">{r.checkIn}</td>
                  <td className="mono xs">{r.checkOut}</td>
                  <td style={{ textAlign:"center" }}>{r.nights}</td>
                  <td className="mono xs gold">${r.amount.toLocaleString()}</td>
                  <td className="mono xs">${r.paid.toLocaleString()}</td>
                  <td><Badge color="gold">{r.source}</Badge></td>
                  <td><StatusBadge status={r.status}/></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex gap2">
                      {r.status === "pending" && <button className="btn btn-success btn-sm" onClick={() => confirmRes(r.id)}>Confirm</button>}
                      {r.status !== "cancelled" && <button className="btn btn-danger btn-sm" onClick={() => cancelRes(r.id)}>Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Reservation Modal */}
      {showNew && (
        <Modal title="New Reservation" onClose={() => setShowNew(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn btn-gold" onClick={addReservation}>Create Reservation</button>
          </>}>
          <div className="fg">
            <label className="flbl">Guest Name *</label>
            <select className="fselect" value={form.guest} onChange={e=>setForm(p=>({...p,guest:e.target.value}))}>
              <option value="">Select guest...</option>
              {guests.map(g => <option key={g.id} value={g.name}>{g.name} {g.vip?"★":""}</option>)}
            </select>
          </div>
          <div className="frow">
            <div className="fg">
              <label className="flbl">Room *</label>
              <select className="fselect" value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value}))}>
                <option value="">Select room...</option>
                {rooms.filter(r=>r.status==="available").map(r=><option key={r.id} value={r.id}>Room {r.id} — {r.type} (${r.rate}/n)</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="flbl">Source</label>
              <select className="fselect" value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))}>
                {["Direct","Booking.com","Expedia","Airbnb","Corporate","Phone","Walk-in"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="flbl">Check-In *</label><input type="date" className="finput" value={form.checkIn} onChange={e=>setForm(p=>({...p,checkIn:e.target.value}))}/></div>
            <div className="fg"><label className="flbl">Check-Out *</label><input type="date" className="finput" value={form.checkOut} onChange={e=>setForm(p=>({...p,checkOut:e.target.value}))}/></div>
          </div>
          {form.checkIn && form.checkOut && form.room && (() => {
            const nights = Math.max(0, Math.round((new Date(form.checkOut)-new Date(form.checkIn))/86400000));
            const rate = rooms.find(r=>r.id===form.room)?.rate || 0;
            return nights > 0 ? (
              <div style={{ padding:"10px 13px", background:"rgba(200,169,110,.06)", borderRadius:8, border:"1px solid rgba(200,169,110,.15)", marginBottom:12 }}>
                <div className="flex fjb sm"><span className="muted">Nights</span><span className="mono gold">{nights}</span></div>
                <div className="flex fjb sm mt2"><span className="muted">Total Estimate</span><span className="mono gold">${(nights*rate).toLocaleString()}</span></div>
              </div>
            ) : null;
          })()}
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Special requests, notes..."/></div>
        </Modal>
      )}

      {/* Reservation Detail Modal */}
      {selected && (
        <Modal title={`Reservation ${selected.id}`} onClose={() => setSelected(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            {selected.status==="pending" && <button className="btn btn-success" onClick={() => confirmRes(selected.id)}>Confirm</button>}
            {selected.status!=="cancelled" && <button className="btn btn-danger" onClick={() => cancelRes(selected.id)}>Cancel</button>}
          </>}>
          <div className="flex fac gap3 mb4">
            <Avatar name={selected.guest} size="lg"/>
            <div>
              <div className="serif" style={{ fontSize:18, fontWeight:700 }}>{selected.guest}</div>
              <div className="xs muted mono mt2">Room {selected.room} · {selected.type}</div>
              <StatusBadge status={selected.status}/>
            </div>
          </div>
          <div className="info-grid mb4">
            {[["Check-In",selected.checkIn],["Check-Out",selected.checkOut],["Nights",selected.nights],["Source",selected.source],["Amount",`$${selected.amount.toLocaleString()}`],["Paid",`$${selected.paid.toLocaleString()}`],["Created",selected.created],["Balance",`$${(selected.amount-selected.paid).toLocaleString()}`]].map(([l,v]) => (
              <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val" style={{ color: l==="Balance"&&(selected.amount-selected.paid)>0 ? "var(--rose)" : undefined }}>{v}</div></div>
            ))}
          </div>
          {selected.notes && <div style={{ padding:"10px 13px", background:"rgba(255,255,255,.02)", borderRadius:8, border:"1px solid var(--br2)" }}>
            <div className="info-lbl mb2">Notes</div>
            <div className="sm muted">{selected.notes}</div>
          </div>}
        </Modal>
      )}
    </div>
  );
}

/* GUESTS */
function GuestsPage({ guests, setGuests, rooms, toast }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", nationality:"", notes:"" });

  const filtered = guests.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.email.toLowerCase().includes(search.toLowerCase()) ||
    (g.room && g.room.includes(search))
  );

  function addGuest() {
    if (!form.name || !form.email) return toast("Name and email required", "error");
    const ng = { id: guests.length + 1, ...form, room:null, status:"reserved", vip:false, stays:0, spent:0, loyalty:0, joined:fmtDate(TODAY) };
    setGuests(p => [ng, ...p]);
    toast(`Guest ${form.name} added`, "success");
    setShowAdd(false);
    setForm({ name:"", email:"", phone:"", nationality:"", notes:"" });
  }

  function toggleVip(id) {
    setGuests(p => p.map(g => g.id === id ? { ...g, vip:!g.vip } : g));
    toast("VIP status updated", "success");
  }

  function saveNotes(id) {
    setGuests(p => p.map(g => g.id === id ? { ...g, notes:notesVal } : g));
    setEditNotes(false);
    toast("Notes saved", "success");
  }

  function checkout(id) {
    setGuests(p => p.map(g => g.id === id ? { ...g, status:"checked-out", room:null } : g));
    toast("Guest checked out", "success");
    setSelected(null);
  }

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{ flexWrap:"wrap" }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search guests..." />
        <button className="btn btn-gold" onClick={() => setShowAdd(true)}>＋ Add Guest</button>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Guest Directory</span>
            <span className="badge bb">{filtered.length}</span>
          </div>
          <div className="card-body" style={{ padding:"4px 18px" }}>
            {filtered.map(g => (
              <div key={g.id} className="g-row" onClick={() => { setSelected(g); setEditNotes(false); }}
                style={{ background: selected?.id===g.id ? "rgba(200,169,110,.04)" : undefined }}>
                <Avatar name={g.name} size="md"/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="g-name">{g.name} {g.vip && <span className="vip-star">★ VIP</span>}</div>
                  <div className="g-meta">{g.nationality} · {g.stays} stays · {g.room ? `Room ${g.room}` : "Not checked in"}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div className="mono xs gold">{g.loyalty.toLocaleString()} pts</div>
                  <StatusBadge status={g.status}/>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="empty-state"><span>👤</span><span>No guests found</span></div>}
          </div>
        </div>

        <div className="card">
          {selected ? (
            <>
              <div className="card-hd">
                <span className="card-title">Guest Profile</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="card-body">
                <div className="flex fac gap3 mb4">
                  <Avatar name={selected.name} size="lg"/>
                  <div style={{ flex:1 }}>
                    <div className="serif" style={{ fontSize:19, fontWeight:700 }}>{selected.name}</div>
                    {selected.vip && <span className="vip-star">★ VIP Member</span>}
                    <div className="xs muted mt2">{selected.email}</div>
                    <div className="xs muted">{selected.phone}</div>
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:9, marginBottom:16 }}>
                  {[["Stays",selected.stays],["Spent",`$${selected.spent.toLocaleString()}`],["Loyalty",`${selected.loyalty.toLocaleString()}pts`]].map(([l,v]) => (
                    <div key={l} style={{ textAlign:"center", padding:"10px 6px", background:"var(--s2)", borderRadius:8, border:"1px solid var(--br2)" }}>
                      <div className="mono xs muted" style={{ letterSpacing:".1em", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
                      <div className="serif" style={{ fontSize:18, fontWeight:700, color:"var(--gold)" }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div className="info-grid mb4">
                  {[["Nationality",selected.nationality],["Room",selected.room?`Room ${selected.room}`:"—"],["Status",selected.status],["Member Since",selected.joined]].map(([l,v]) => (
                    <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
                  ))}
                </div>

                {/* Notes */}
                <div className="mb4">
                  <div className="flex fac fjb mb2">
                    <div className="info-lbl">Guest Notes</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditNotes(!editNotes); setNotesVal(selected.notes); }}>{editNotes ? "Cancel" : "Edit"}</button>
                  </div>
                  {editNotes ? (
                    <div>
                      <textarea className="ftextarea" value={notesVal} onChange={e=>setNotesVal(e.target.value)}/>
                      <button className="btn btn-gold btn-sm mt2" onClick={() => saveNotes(selected.id)}>Save Notes</button>
                    </div>
                  ) : (
                    <div style={{ fontSize:12.5, color:"var(--tx2)", padding:"8px 11px", background:"var(--s2)", borderRadius:7, minHeight:40 }}>
                      {selected.notes || <em style={{ color:"var(--tx3)" }}>No notes</em>}
                    </div>
                  )}
                </div>

                <div className="flex gap2" style={{ flexWrap:"wrap" }}>
                  <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={() => { toggleVip(selected.id); setSelected(p => ({...p, vip:!p.vip})); }}>
                    {selected.vip ? "Remove VIP" : "★ Set VIP"}
                  </button>
                  <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={() => toast(`Message sent to ${selected.name}`, "success")}>
                    ✉ Message
                  </button>
                  {selected.status === "checked-in" && (
                    <button className="btn btn-danger" style={{ flex:1, justifyContent:"center" }} onClick={() => checkout(selected.id)}>Check Out</button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ minHeight:300 }}>
              <span>👤</span><span className="sm muted">Select a guest to view profile</span>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <Modal title="Add New Guest" onClose={() => setShowAdd(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-gold" onClick={addGuest}>Add Guest</button>
          </>}>
          <div className="frow">
            <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Full name"/></div>
            <div className="fg"><label className="flbl">Nationality</label><input className="finput" value={form.nationality} onChange={e=>setForm(p=>({...p,nationality:e.target.value}))} placeholder="Country"/></div>
          </div>
          <div className="fg"><label className="flbl">Email *</label><input type="email" className="finput" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="email@example.com"/></div>
          <div className="fg"><label className="flbl">Phone</label><input className="finput" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+1-555-..."/></div>
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Preferences, notes..."/></div>
        </Modal>
      )}
    </div>
  );
}

/* HOUSEKEEPING */
function HousekeepingPage({ tasks, setTasks, rooms, toast }) {
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ room:"", type:"Cleaning", priority:"medium", assignee:"Maria Santos", time:"09:00", notes:"" });

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  function updateStatus(id, status) {
    setTasks(p => p.map(t => t.id === id ? { ...t, status } : t));
    toast(`Task ${status}`, "success");
  }

  function addTask() {
    if (!form.room) return toast("Room required", "error");
    const nt = { id: tasks.length + 1, ...form, dept: form.type === "AC Repair" || form.type === "Plumbing" ? "Maintenance" : "Housekeeping", status:"pending" };
    setTasks(p => [...p, nt]);
    toast(`Task added for room ${form.room}`, "success");
    setShowAdd(false);
    setForm({ room:"", type:"Cleaning", priority:"medium", assignee:"Maria Santos", time:"09:00", notes:"" });
  }

  const counts = { completed: tasks.filter(t=>t.status==="completed").length, "in-progress": tasks.filter(t=>t.status==="in-progress").length, pending: tasks.filter(t=>t.status==="pending").length };

  return (
    <div>
      <div className="stats-row">
        {[
          { lbl:"Total Tasks",  val:tasks.length,        ac:"#58A6FF" },
          { lbl:"Completed",    val:counts.completed,    ac:"#3FB950" },
          { lbl:"In Progress",  val:counts["in-progress"],ac:"#F0A500" },
          { lbl:"Pending",      val:counts.pending,      ac:"#E05C7A" },
        ].map(s => (
          <div key={s.lbl} className="stat" style={{ "--ac":s.ac }}>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val" style={{ color:s.ac }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="flex fac fjb mb4 gap3" style={{ flexWrap:"wrap" }}>
        <div className="tabs">
          {["all","pending","in-progress","completed"].map(s => (
            <button key={s} className={`tab ${filter===s?"active":""}`} onClick={()=>setFilter(s)}>
              {s==="all" ? "All" : s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")}
              {" "}({s==="all" ? tasks.length : tasks.filter(t=>t.status===s).length})
            </button>
          ))}
        </div>
        <button className="btn btn-gold" onClick={() => setShowAdd(true)}>＋ Add Task</button>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              {["Room","Task Type","Dept","Priority","Assigned To","Time","Notes","Status","Actions"].map(h=><th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td><span className="serif" style={{ fontSize:22, fontWeight:700 }}>{t.room}</span></td>
                  <td className="bold sm">{t.type}</td>
                  <td><Badge color={t.dept==="Maintenance"?"red":"blue"}>{t.dept}</Badge></td>
                  <td><div className="flex fac gap2"><div className={`pdot ${t.priority}`}/><span className="sm" style={{ textTransform:"capitalize" }}>{t.priority}</span></div></td>
                  <td className="sm">{t.assignee}</td>
                  <td className="mono xs">{t.time}</td>
                  <td className="xs muted" style={{ maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes || "—"}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td>
                    <div className="flex gap2">
                      {t.status === "pending" && <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(t.id,"in-progress")}>Start</button>}
                      {t.status === "in-progress" && <button className="btn btn-success btn-sm" onClick={() => updateStatus(t.id,"completed")}>✓ Done</button>}
                      {t.status === "completed" && <span className="xs muted">✓ Done</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign:"center", padding:32, color:"var(--tx3)" }}>No tasks found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <Modal title="Add Housekeeping Task" onClose={() => setShowAdd(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-gold" onClick={addTask}>Add Task</button>
          </>}>
          <div className="frow">
            <div className="fg">
              <label className="flbl">Room *</label>
              <select className="fselect" value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value}))}>
                <option value="">Select room...</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.id} ({r.status})</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="flbl">Task Type</label>
              <select className="fselect" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {["Cleaning","Deep Clean","Turndown","Inspection","VIP Setup","AC Repair","Plumbing","Extra Supplies","Laundry Pickup"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg">
              <label className="flbl">Priority</label>
              <select className="fselect" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                {["high","medium","low"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="flbl">Assignee</label>
              <select className="fselect" value={form.assignee} onChange={e=>setForm(p=>({...p,assignee:e.target.value}))}>
                {["Maria Santos","John Dela Cruz","Robert Kim","Ana Rivera","Mark Tanaka"].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="fg"><label className="flbl">Scheduled Time</label><input type="time" className="finput" value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}/></div>
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Special instructions..."/></div>
        </Modal>
      )}
    </div>
  );
}

/* BILLING */
function BillingPage({ guests, transactions, setTransactions, rooms, toast }) {
  const [selectedGuest, setSelectedGuest] = useState(guests.find(g=>g.status==="checked-in"));
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState("Credit Card");
  const [payAmount, setPayAmount] = useState("");
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ type:"Room Service", amount:"", notes:"" });

  const [folioCharges, setFolioCharges] = useState({
    1: [{ desc:"Room (Standard · 4 nights)", amt:480, cat:"Room" },{ desc:"Room Service — Breakfast", amt:45, cat:"F&B" },{ desc:"Minibar", amt:28, cat:"F&B" }],
    2: [{ desc:"Room (Deluxe · 5 nights)", amt:1100, cat:"Room" },{ desc:"Spa Treatment", amt:180, cat:"Spa" },{ desc:"Laundry", amt:42, cat:"Service" }],
    3: [{ desc:"Room (Deluxe · 4 nights)", amt:880, cat:"Room" },{ desc:"Restaurant Dinner", amt:95, cat:"F&B" }],
    4: [{ desc:"Room (Suite · 7 nights)", amt:3150, cat:"Room" },{ desc:"Airport Transfer", amt:60, cat:"Transfer" },{ desc:"Room Service", amt:120, cat:"F&B" },{ desc:"Spa (2x)", amt:280, cat:"Spa" }],
    5: [{ desc:"Room (Presidential · 19 nights)", amt:22800, cat:"Room" },{ desc:"Butler Service", amt:500, cat:"Service" },{ desc:"Fine Dining (3x)", amt:480, cat:"F&B" },{ desc:"Champagne Package", amt:320, cat:"F&B" }],
  });

  const g = selectedGuest;
  const charges = g ? (folioCharges[g.id] || []) : [];
  const sub = charges.reduce((a,c) => a + c.amt, 0);
  const tax = Math.round(sub * 0.10);
  const svc = Math.round(sub * 0.05);
  const total = sub + tax + svc;

  function printInvoice() {
    if(!g) return;
    const now = new Date().toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
    const paidSoFar = (transactions||[]).filter(t => t.type === "Payment" && t.guest === g.name).reduce((a,t)=>a+(+t.amount||0),0);
    const due = Math.max(0,total-paidSoFar);
    const rows = charges.map(c => `<tr><td>${c.desc}</td><td class="right">$${Number(c.amt||0).toFixed(2)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Invoice - ${g.name}</title>
<style>
@page{size:A4;margin:10mm}
body{font-family:Segoe UI,Arial,sans-serif;color:#111;background:#fff}
.wrap{max-width:760px;margin:0 auto}
.head{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
.hotel{font-size:20px;font-weight:800}
.muted{color:#555;font-size:12px}
table{width:100%;border-collapse:collapse}
th,td{padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:12px}
th{background:#f4f4f4;text-align:left}
.right{text-align:right}
.total{font-size:16px;font-weight:800;margin-top:10px;text-align:right}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="hotel">Hotel Fountain</div>
    <div class="muted">Guest Invoice / Folio</div>
    <div class="muted">Printed: ${now}</div>
  </div>
  <div class="muted" style="margin-bottom:12px"><b>${g.name}</b> · Room ${g.room}</div>
  <table>
    <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>${rows||"<tr><td colspan='2'>No charges</td></tr>"}</tbody>
  </table>
  <div class="total">
    Total: $${Number(total||0).toFixed(2)} · Paid: $${Number(paidSoFar||0).toFixed(2)} · Due: $${Number(due||0).toFixed(2)}
  </div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if(!w) return toast("Please allow popups to print.","error");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
  function addCharge() {
    if (!chargeForm.amount || isNaN(chargeForm.amount)) return toast("Enter valid amount", "error");
    setFolioCharges(p => ({ ...p, [g.id]: [...(p[g.id]||[]), { desc:chargeForm.notes || chargeForm.type, amt:parseFloat(chargeForm.amount), cat:chargeForm.type }] }));
    const newTxn = {
      id: `TXN-${String(ALL_TRANSACTIONS.length + transactions.length + 1).padStart(4,"0")}`,
      date: fmtDate(TODAY), time: new Date().toTimeString().slice(0,5),
      guest: g.name, type: chargeForm.type, room: g.room || "—",
      amount: parseFloat(chargeForm.amount), method: "Room Charge", status:"completed",
    };
    setTransactions(p => [newTxn, ...p]);
    toast(`Charge of $${chargeForm.amount} added to folio`, "success");
    setShowAddCharge(false);
    setChargeForm({ type:"Room Service", amount:"", notes:"" });
  }

  function processPayment() {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return toast("Enter valid payment amount", "error");
    const newTxn = {
      id: `TXN-${String(ALL_TRANSACTIONS.length + transactions.length + 1).padStart(4,"0")}`,
      date: fmtDate(TODAY), time: new Date().toTimeString().slice(0,5),
      guest: g.name, type:"Payment", room: g.room || "—",
      amount: amt, method: payMethod, status:"completed",
    };
    setTransactions(p => [newTxn, ...p]);
    toast(`Payment of $${amt} processed via ${payMethod}`, "success");
    setShowPayment(false);
    setPayAmount("");
  }

  return (
    <div className="g2">
      {/* Guest Selector */}
      <div>
        <div className="card mb4">
          <div className="card-hd"><span className="card-title">Checked-In Guests</span></div>
          <div className="card-body" style={{ padding:"4px 18px" }}>
            {guests.filter(g=>g.status==="checked-in").map(g => (
              <div key={g.id} className="g-row" onClick={() => setSelectedGuest(g)}
                style={{ background: selectedGuest?.id===g.id ? "rgba(200,169,110,.05)" : undefined }}>
                <Avatar name={g.name} size="sm"/>
                <div style={{ flex:1 }}>
                  <div className="g-name sm">{g.name} {g.vip&&<span className="vip-star">★</span>}</div>
                  <div className="g-meta">Room {g.room}</div>
                </div>
                <div className="mono xs gold">{fmtMoney(sub)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Add Charge */}
        {g && (
          <div className="card">
            <div className="card-hd">
              <span className="card-title">Quick Charge</span>
            </div>
            <div className="card-body">
              <div className="flex gap2" style={{ flexWrap:"wrap" }}>
                {["Room Service","Restaurant","Spa","Minibar","Laundry","Parking"].map(type => (
                  <button key={type} className="btn btn-ghost btn-sm" onClick={() => { setChargeForm(p=>({...p,type})); setShowAddCharge(true); }}>{type}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Folio */}
      <div className="card">
        <div className="card-hd">
          <span className="card-title">Guest Folio</span>
          {g && <div className="flex gap2"><Badge color="blue">Room {g.room}</Badge><button className="btn btn-ghost btn-sm" onClick={() => setShowAddCharge(true)}>＋ Charge</button></div>}
        </div>
        <div className="card-body">
          {g ? (
            <>
              <div className="flex fac gap3 mb4 pb4" style={{ borderBottom:"1px solid var(--br2)" }}>
                <Avatar name={g.name}/>
                <div>
                  <div className="bold">{g.name}</div>
                  <div className="xs mono muted">Room {g.room} · Check-out: {rooms.find(r=>r.id===g.room)?.checkOut || "TBD"}</div>
                </div>
              </div>

              {charges.map((c, i) => (
                <div key={i} className="folio-row">
                  <div>
                    <span className="sm">{c.desc}</span>
                    <Badge color={c.cat==="Room"?"blue":c.cat==="F&B"?"gold":c.cat==="Spa"?"purple":"gold"} style={{ marginLeft:6 }}>{c.cat}</Badge>
                  </div>
                  <span className="mono xs">${c.amt.toFixed(2)}</span>
                </div>
              ))}

              <hr className="divider"/>
              <div className="folio-row"><span className="muted sm">Subtotal</span><span className="mono xs">${sub.toFixed(2)}</span></div>
              <div className="folio-row"><span className="muted sm">Tax (10%)</span><span className="mono xs">${tax.toFixed(2)}</span></div>
              <div className="folio-row"><span className="muted sm">Service Charge (5%)</span><span className="mono xs">${svc.toFixed(2)}</span></div>
              <div className="folio-total"><span>Total Due</span><span className="mono">${total.toFixed(2)}</span></div>

<div className="flex gap2 mt4" style={{ flexWrap:"wrap" }}>
  <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={() => toast("Invoice sent to email", "success")}>📧 Email Invoice</button>
  <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={printInvoice}>🖨 Print</button>
  <button className="btn btn-gold" style={{ flex:"2", justifyContent:"center" }} onClick={() => setShowPayment(true)}>Process Payment</button>
</div>
            </>
          ) : (
            <div className="empty-state" style={{ minHeight:300 }}><span>💰</span><span className="sm muted">Select a guest to view folio</span></div>
          )}
        </div>
      </div>

      {/* Add Charge Modal */}
      {showAddCharge && (
        <Modal title="Add Charge to Folio" onClose={() => setShowAddCharge(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setShowAddCharge(false)}>Cancel</button><button className="btn btn-gold" onClick={addCharge}>Add Charge</button></>}>
          <div className="fg"><label className="flbl">Charge Type</label>
            <select className="fselect" value={chargeForm.type} onChange={e=>setChargeForm(p=>({...p,type:e.target.value}))}>
              {["Room Charge","Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Airport Transfer","Bar & Lounge","Gift Shop","Miscellaneous"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="fg"><label className="flbl">Amount ($) *</label><input type="number" className="finput" value={chargeForm.amount} onChange={e=>setChargeForm(p=>({...p,amount:e.target.value}))} placeholder="0.00"/></div>
          <div className="fg"><label className="flbl">Description</label><input className="finput" value={chargeForm.notes} onChange={e=>setChargeForm(p=>({...p,notes:e.target.value}))} placeholder="Optional description..."/></div>
        </Modal>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <Modal title="Process Payment" onClose={() => setShowPayment(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setShowPayment(false)}>Cancel</button><button className="btn btn-gold" onClick={processPayment}>Confirm Payment</button></>}>
          <div style={{ padding:"12px 14px", background:"rgba(200,169,110,.06)", borderRadius:8, border:"1px solid rgba(200,169,110,.15)", marginBottom:16 }}>
            <div className="flex fjb sm"><span className="muted">Guest</span><span className="bold">{g?.name}</span></div>
            <div className="flex fjb sm mt2"><span className="muted">Total Due</span><span className="mono gold">${total.toFixed(2)}</span></div>
          </div>
          <div className="fg"><label className="flbl">Payment Method</label>
            <select className="fselect" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
              {["Credit Card","Debit Card","Cash","Bank Transfer","UPI","Corporate Account","Crypto"].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="fg"><label className="flbl">Amount ($)</label>
            <input type="number" className="finput" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder={total.toFixed(2)}/>
          </div>
          <div className="flex gap2" style={{ marginTop:8 }}>
            {[total, total*0.5, 500].map(a => (
              <button key={a} className="btn btn-ghost btn-sm" onClick={() => setPayAmount(a.toFixed(2))}>
                ${a.toFixed(0)}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* REPORTS */
function ReportsPage({ transactions, rooms, reservations, guests }) {
  const [tab, setTab] = useState("daily");
  const [dateFilter, setDateFilter] = useState(fmtDate(TODAY));
  const [searchTxn, setSearchTxn] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [chartActive, setChartActive] = useState(6);

  // All transactions including live ones
  const allTxns = [...transactions, ...ALL_TRANSACTIONS];

  const dailyTxns = allTxns
    .filter(t => t.date === dateFilter)
    .filter(t => searchTxn === "" || t.guest.toLowerCase().includes(searchTxn.toLowerCase()) || t.id.includes(searchTxn) || t.type.toLowerCase().includes(searchTxn.toLowerCase()))
    .filter(t => filterType === "all" || t.type === filterType)
    .filter(t => filterMethod === "all" || t.method === filterMethod)
    .sort((a,b) => b.time.localeCompare(a.time));

  const dailyRevenue = dailyTxns.filter(t=>t.status==="completed").reduce((a,t) => a+t.amount, 0);
  const dailyPending = dailyTxns.filter(t=>t.status==="pending").reduce((a,t) => a+t.amount, 0);

  // Monthly revenue data
  const monthlyData = Array.from({ length:7 }, (_, i) => {
    const d = addDays(TODAY, -(6-i)*30);
    const m = d.toLocaleDateString("en",{ month:"short" });
    const dayTxns = allTxns.filter(t => t.date.startsWith(d.toISOString().slice(0,7)));
    const rev = dayTxns.reduce((a,t) => a + (t.status==="completed" ? t.amount : 0), 0) || (50000 + Math.random()*40000);
    return { m, v:Math.round(rev), occ:55+Math.floor(Math.random()*35) };
  });

  // Revenue by type
  const byType = {};
  dailyTxns.forEach(t => { if(t.status==="completed") byType[t.type] = (byType[t.type]||0)+t.amount; });
  const typeData = Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Revenue by method
  const byMethod = {};
  dailyTxns.forEach(t => { if(t.status==="completed") byMethod[t.method] = (byMethod[t.method]||0)+t.amount; });

  const txnTypes = [...new Set(allTxns.map(t=>t.type))].sort();
  const txnMethods = [...new Set(allTxns.map(t=>t.method))].sort();

  return (
    <div>
      <div className="tabs mb4">
        {["daily","monthly","overview"].map(t => (
          <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── DAILY TAB ── */}
      {tab === "daily" && (
        <div>
          {/* Date selector + filters */}
          <div className="card mb4">
            <div className="card-body" style={{ padding:14 }}>
              <div className="flex fac gap3" style={{ flexWrap:"wrap" }}>
                <div className="flex fac gap2">
                  <span className="xs muted mono" style={{ letterSpacing:".1em" }}>DATE</span>
                  <input type="date" className="finput" style={{ width:160 }} value={dateFilter} onChange={e=>setDateFilter(e.target.value)} max={fmtDate(TODAY)}/>
                </div>
                <SearchBox value={searchTxn} onChange={setSearchTxn} placeholder="Search transactions..." />
                <div className="flex fac gap2">
                  <span className="xs muted">Type:</span>
                  <select className="fselect" style={{ width:160, padding:"6px 10px" }} value={filterType} onChange={e=>setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    {txnTypes.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex fac gap2">
                  <span className="xs muted">Method:</span>
                  <select className="fselect" style={{ width:160, padding:"6px 10px" }} value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}>
                    <option value="all">All Methods</option>
                    {txnMethods.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchTxn("");setFilterType("all");setFilterMethod("all");}}>Reset</button>
              </div>
            </div>
          </div>

          {/* Daily Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            {[
              { l:"Transactions",    v:dailyTxns.length,                          c:"#58A6FF" },
              { l:"Total Revenue",   v:`$${dailyRevenue.toLocaleString()}`,        c:"#C8A96E" },
              { l:"Avg Transaction", v:dailyTxns.length ? `$${Math.round(dailyRevenue/Math.max(dailyTxns.filter(t=>t.status==="completed").length,1)).toLocaleString()}` : "$0", c:"#2EC4B6" },
              { l:"Pending",         v:`$${dailyPending.toLocaleString()}`,        c:"#E05C7A" },
            ].map(s => (
              <div key={s.l} className="stat" style={{ "--ac":s.c }}>
                <div className="stat-lbl">{s.l}</div>
                <div className="stat-val" style={{ fontSize:26, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Revenue by Type (for the day) */}
          {typeData.length > 0 && (
            <div className="g2 mb4">
              <div className="card">
                <div className="card-hd"><span className="card-title">Revenue by Category</span></div>
                <div className="card-body">
                  {typeData.map(([type, amt], i) => (
                    <div key={type} style={{ marginBottom:11 }}>
                      <div className="flex fjb sm mb1">
                        <span className="muted">{type}</span>
                        <span className="mono xs gold">${amt.toLocaleString()}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width:`${(amt/typeData[0][1])*100}%`, background:`hsl(${i*42},60%,55%)` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-hd"><span className="card-title">Revenue by Method</span></div>
                <div className="card-body">
                  {Object.entries(byMethod).sort((a,b)=>b[1]-a[1]).map(([method,amt],i) => (
                    <div key={method} style={{ marginBottom:11 }}>
                      <div className="flex fjb sm mb1">
                        <span className="muted">{method}</span>
                        <span className="mono xs gold">${amt.toLocaleString()}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width:`${(amt/dailyRevenue)*100}%`, background:"var(--gold)" }}/>
                      </div>
                    </div>
                  ))}
                  {Object.keys(byMethod).length === 0 && <div className="empty-state" style={{ padding:20 }}><span className="sm muted">No completed transactions</span></div>}
                </div>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="card">
            <div className="card-hd">
              <span className="card-title">Daily Transactions — {dateFilter}</span>
              <div className="flex gap2">
                <Badge color="blue">{dailyTxns.length} records</Badge>
                <Badge color="gold">${dailyRevenue.toLocaleString()} total</Badge>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  {["TXN ID","Time","Guest","Type","Room","Amount","Method","Status"].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {dailyTxns.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign:"center", padding:32, color:"var(--tx3)" }}>No transactions for {dateFilter}</td></tr>
                  )}
                  {dailyTxns.map(t => (
                    <tr key={t.id}>
                      <td className="mono xs muted">{t.id}</td>
                      <td className="mono xs">{t.time}</td>
                      <td><div className="flex fac gap2"><Avatar name={t.guest} size="sm"/><span className="sm">{t.guest}</span></div></td>
                      <td><Badge color="gold">{t.type}</Badge></td>
                      <td><Badge color="blue">{t.room}</Badge></td>
                      <td><span className="mono xs gold">${t.amount.toLocaleString()}</span></td>
                      <td className="sm muted">{t.method}</td>
                      <td><StatusBadge status={t.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dailyTxns.length > 0 && (
              <div style={{ padding:"12px 18px", borderTop:"1px solid var(--br2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span className="xs muted">{dailyTxns.length} transactions · {dailyTxns.filter(t=>t.status==="completed").length} completed</span>
                <span className="mono xs gold">Total: ${dailyRevenue.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MONTHLY TAB ── */}
      {tab === "monthly" && (
        <div>
          <div className="stats-row">
            {[
              { l:"Monthly Revenue", v:`$${monthlyData[6].v.toLocaleString()}`, c:"#C8A96E" },
              { l:"Avg Occupancy",   v:`${Math.round(monthlyData.reduce((a,d)=>a+d.occ,0)/7)}%`, c:"#2EC4B6" },
              { l:"RevPAR",         v:"$186", c:"#58A6FF" },
              { l:"ADR",            v:"$312", c:"#3FB950" },
            ].map(s => (
              <div key={s.l} className="stat" style={{ "--ac":s.c }}>
                <div className="stat-lbl">{s.l}</div>
                <div className="stat-val" style={{ color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="g2 mt4">
            <div className="card">
              <div className="card-hd"><span className="card-title">Monthly Revenue Trend</span></div>
              <div className="card-body">
                <BarChart data={monthlyData} valueKey="v" labelKey="m" activeIndex={chartActive} onHover={setChartActive}/>
                <div className="flex fjb sm mt3">
                  <span className="muted">{monthlyData[chartActive].m} Revenue</span>
                  <span className="mono gold">${monthlyData[chartActive].v.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><span className="card-title">Occupancy Trend</span></div>
              <div className="card-body">
                {monthlyData.map((d,i) => (
                  <div key={i} style={{ marginBottom:12 }}>
                    <div className="flex fjb sm mb1">
                      <span className="muted">{d.m} 2026</span>
                      <span className="mono xs" style={{ color:"#2EC4B6" }}>{d.occ}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width:`${d.occ}%`, background:"linear-gradient(90deg,#2EC4B6,#58A6FF)" }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card mt4">
            <div className="card-hd"><span className="card-title">Monthly Breakdown</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  {["Month","Revenue","Occupancy","RevPAR","ADR","Reservations","Growth"].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {monthlyData.map((d,i) => {
                    const prev = monthlyData[i-1];
                    const growth = prev ? ((d.v-prev.v)/prev.v*100).toFixed(1) : "—";
                    return (
                      <tr key={i}>
                        <td className="bold">{d.m} 2026</td>
                        <td className="mono xs gold">${d.v.toLocaleString()}</td>
                        <td><span style={{ color:"#2EC4B6" }}>{d.occ}%</span></td>
                        <td className="mono xs">${Math.round(d.v/rooms.length/30)}</td>
                        <td className="mono xs">${Math.round(d.v/Math.max(1,Math.round(rooms.length*d.occ/100)))}</td>
                        <td>{5+Math.floor(Math.random()*15)}</td>
                        <td>{growth !== "—" ? <span className={parseFloat(growth)>=0?"up":"down"}>{parseFloat(growth)>=0?"↑":"↓"}{Math.abs(growth)}%</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div>
          <div className="g4 mb4">
            {[
              { l:"Total Guests",      v:guests.length,         c:"#2EC4B6" },
              { l:"Total Rooms",       v:rooms.length,          c:"#58A6FF" },
              { l:"Total Reservations",v:reservations.length,   c:"#C8A96E" },
              { l:"Lifetime Revenue",  v:`$${(allTxns.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0)/1000).toFixed(0)}k`, c:"#3FB950" },
            ].map(s => (
              <div key={s.l} className="stat" style={{ "--ac":s.c }}>
                <div className="stat-lbl">{s.l}</div>
                <div className="stat-val" style={{ color:s.c, fontSize:28 }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="g2 mb4">
            <div className="card">
              <div className="card-hd"><span className="card-title">Room Type Performance</span></div>
              <div className="card-body">
                {[["Standard",4,120,50,"#3FB950"],["Deluxe",4,220,75,"#58A6FF"],["Suite",3,450,67,"#C8A96E"],["Presidential",2,1200,50,"#E05C7A"]].map(([type,count,rate,occ,color]) => (
                  <div key={type} style={{ marginBottom:14 }}>
                    <div className="flex fjb sm mb1">
                      <span className="bold">{type}</span>
                      <span className="mono xs" style={{ color }}>{occ}% occ.</span>
                    </div>
                    <div className="flex fjb xs muted mb1">
                      <span>{count} rooms · ${rate}/night</span>
                      <span className="gold">RevPAR: ${Math.round(rate*occ/100)}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width:`${occ}%`, background:color }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><span className="card-title">Booking Sources</span></div>
              <div className="card-body">
                {[["Direct",35,"#C8A96E"],["Booking.com",28,"#58A6FF"],["Expedia",18,"#2EC4B6"],["Corporate",12,"#3FB950"],["Airbnb",7,"#9B72CF"]].map(([src,pct,color]) => (
                  <div key={src} style={{ marginBottom:13 }}>
                    <div className="flex fjb sm mb1"><span className="muted">{src}</span><span className="mono xs" style={{ color }}>{pct}%</span></div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%`, background:color }}/></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">Guest Segment Analysis</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["Nationality","Guests","Total Spent","Avg Stay","Loyalty Pts","VIP Count"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["UAE",2,"$9,400",4.2,3080,1],
                    ["USA",1,"$1,240",5,420,0],
                    ["Spain",1,"$24,600",19,8200,1],
                    ["China",1,"$5,800",7,1900,1],
                    ["Nigeria",1,"$660",4,120,0],
                    ["Pakistan",1,"$980",3,280,0],
                    ["India",1,"$0",3,0,0],
                  ].map(([nat,cnt,spent,stay,pts,vip]) => (
                    <tr key={nat}>
                      <td className="bold">{nat}</td>
                      <td>{cnt}</td>
                      <td className="mono xs gold">{spent}</td>
                      <td>{stay} nights</td>
                      <td className="mono xs">{pts.toLocaleString()}</td>
                      <td>{vip > 0 ? <Badge color="gold">★ {vip}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* SETTINGS */
function SettingsPage({ toast }) {
  const [settings, setSettings] = useState({
    hotelName:"Hotel Fountain", city:"Dubai", country:"UAE", currency:"USD", timezone:"Asia/Dubai",
    checkInTime:"14:00", checkOutTime:"12:00", taxRate:"10", serviceCharge:"5",
    emailNotif:true, smsNotif:true, autoAssign:false, maintenanceAlerts:true,
    primaryColor:"#C8A96E", language:"English",
  });

  function save() { toast("Settings saved successfully", "success"); }

  return (
    <div style={{ maxWidth:720 }}>
      {[
        { title:"Hotel Information", fields:[
          { key:"hotelName", label:"Hotel Name", type:"text" },
          { key:"city",      label:"City",       type:"text" },
          { key:"country",   label:"Country",    type:"text" },
          { key:"currency",  label:"Currency",   type:"select", opts:["USD","EUR","GBP","AED","SGD"] },
          { key:"timezone",  label:"Timezone",   type:"select", opts:["Asia/Dubai","Europe/London","America/New_York","Asia/Singapore"] },
          { key:"language",  label:"Language",   type:"select", opts:["English","Arabic","French","Spanish","Mandarin"] },
        ]},
        { title:"Operations", fields:[
          { key:"checkInTime",   label:"Check-In Time",    type:"time" },
          { key:"checkOutTime",  label:"Check-Out Time",   type:"time" },
          { key:"taxRate",       label:"Tax Rate (%)",     type:"number" },
          { key:"serviceCharge", label:"Service Charge (%)", type:"number" },
        ]},
        { title:"Notifications", fields:[
          { key:"emailNotif",        label:"Email Notifications",    type:"toggle" },
          { key:"smsNotif",          label:"SMS Notifications",      type:"toggle" },
          { key:"autoAssign",        label:"Auto-assign Housekeeping", type:"toggle" },
          { key:"maintenanceAlerts", label:"Maintenance Alerts",     type:"toggle" },
        ]},
      ].map(section => (
        <div key={section.title} className="card mb4">
          <div className="card-hd"><span className="card-title">{section.title}</span></div>
          <div className="card-body">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {section.fields.map(f => (
                <div key={f.key} className="fg" style={{ gridColumn: f.type==="toggle" ? "span 1" : undefined }}>
                  <label className="flbl">{f.label}</label>
                  {f.type === "toggle" ? (
                    <div className="flex fac gap2 mt2">
                      <div style={{ width:42, height:24, borderRadius:12, background:settings[f.key]?"var(--gold)":"var(--s3)", cursor:"pointer", position:"relative", transition:"background .2s" }}
                        onClick={() => setSettings(p=>({...p,[f.key]:!p[f.key]}))}>
                        <div style={{ position:"absolute", top:3, left:settings[f.key]?18:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
                      </div>
                      <span className="sm muted">{settings[f.key] ? "Enabled" : "Disabled"}</span>
                    </div>
                  ) : f.type === "select" ? (
                    <select className="fselect" value={settings[f.key]} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}>
                      {f.opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} className="finput" value={settings[f.key]} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}/>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap2">
        <button className="btn btn-ghost">Reset to Defaults</button>
        <button className="btn btn-gold" onClick={save}>Save Settings</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]               = useState("dashboard");
  const [rooms, setRooms]             = useState(INIT_ROOMS);
  const [guests, setGuests]           = useState(INIT_GUESTS);
  const [reservations, setReservations] = useState(INIT_RESERVATIONS);
  const [tasks, setTasks]             = useState(INIT_TASKS);
  const [transactions, setTransactions] = useState([]);
  const [toast, setToastMsg]          = useState(null);
  const [notifOpen, setNotifOpen]     = useState(false);
  const toastTimer                    = useRef();

  function showToast(msg, type = "success") {
    setToastMsg({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }

  const pendingRes   = reservations.filter(r => r.status === "pending").length;
  const pendingTasks = tasks.filter(t => t.status === "pending" && t.priority === "high").length;

  const NAV = [
    { id:"dashboard",    ico:"⬡", label:"Dashboard",        section:"OVERVIEW" },
    { id:"rooms",        ico:"▦", label:"Room Management" },
    { id:"reservations", ico:"◈", label:"Reservations",      badge:pendingRes },
    { id:"guests",       ico:"◉", label:"Guests & CRM" },
    { id:"housekeeping", ico:"✦", label:"Housekeeping",      badge:pendingTasks, section:"OPERATIONS" },
    { id:"billing",      ico:"◎", label:"Billing & Invoices" },
    { id:"reports",      ico:"▣", label:"Reports",           section:"ANALYTICS" },
    { id:"settings",     ico:"◌", label:"Settings",          section:"SYSTEM" },
  ];

  const TITLES = { dashboard:"Dashboard", rooms:"Room Management", reservations:"Reservations", guests:"Guest CRM", housekeeping:"Housekeeping", billing:"Billing & Invoices", reports:"Reports & Analytics", settings:"Settings" };

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="s-logo">
            <div className="s-logo-mark">🏨</div>
            <div className="s-logo-name">Hotel Fountain</div>
            <div className="s-logo-ver">LUXURY MANAGEMENT · V5.2.0</div>
          </div>
          <nav className="s-nav">
            {NAV.map(item => (
              <div key={item.id}>
                {item.section && <div className="s-sect">{item.section}</div>}
                <div className={`s-item ${page===item.id?"active":""}`} onClick={() => setPage(item.id)}>
                  <span className="ico">{item.ico}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className="s-badge">{item.badge}</span>}
                </div>
              </div>
            ))}
          </nav>
          <div className="s-user">
            <div className="s-u-av">GM</div>
            <div>
              <div className="s-u-name">General Manager</div>
              <div className="s-u-role">SUPER ADMIN · Full Access</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="main">
          <div className="topbar">
            <div className="tb-title">{TITLES[page]}</div>
            <div className="tb-date mono">
              {TODAY.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}
            </div>
            {/* Notification Bell */}
            <div style={{ position:"relative" }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setNotifOpen(!notifOpen)}>
                🔔
                {(pendingRes + pendingTasks) > 0 && (
                  <span style={{ position:"absolute", top:4, right:4, width:8, height:8, borderRadius:"50%", background:"var(--rose)", boxShadow:"0 0 5px var(--rose)" }}/>
                )}
              </button>
              {notifOpen && (
                <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:280, background:"var(--s1)", border:"1px solid var(--br)", borderRadius:10, boxShadow:"0 16px 48px rgba(0,0,0,.5)", zIndex:50, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--br2)", fontFamily:"Cormorant Garamond,serif", fontSize:15, fontWeight:600 }}>Notifications</div>
                  <div style={{ maxHeight:260, overflowY:"auto" }}>
                    {pendingRes > 0 && <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--br2)", fontSize:12.5, color:"var(--tx2)" }}>📅 {pendingRes} pending reservation{pendingRes>1?"s":""} need confirmation</div>}
                    {pendingTasks > 0 && <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--br2)", fontSize:12.5, color:"var(--tx2)" }}>⚠️ {pendingTasks} high-priority maintenance task{pendingTasks>1?"s":""}</div>}
                    {tasks.filter(t=>t.status==="in-progress").map(t => <div key={t.id} style={{ padding:"10px 16px", borderBottom:"1px solid var(--br2)", fontSize:12.5, color:"var(--tx2)" }}>🧹 Room {t.room}: {t.type} in progress</div>)}
                    {pendingRes + pendingTasks === 0 && tasks.filter(t=>t.status==="in-progress").length === 0 && <div style={{ padding:"20px 16px", textAlign:"center", color:"var(--tx3)", fontSize:12.5 }}>All clear! No notifications.</div>}
                  </div>
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => setPage("settings")}>⚙</button>
          </div>

          <div className="content" onClick={() => notifOpen && setNotifOpen(false)}>
            {page === "dashboard"    && <Dashboard rooms={rooms} guests={guests} reservations={reservations} tasks={tasks} transactions={transactions} setPage={setPage} toast={showToast}/>}
            {page === "rooms"        && <RoomsPage rooms={rooms} setRooms={setRooms} guests={guests} toast={showToast}/>}
            {page === "reservations" && <ReservationsPage reservations={reservations} setReservations={setReservations} rooms={rooms} guests={guests} toast={showToast}/>}
            {page === "guests"       && <GuestsPage guests={guests} setGuests={setGuests} rooms={rooms} toast={showToast}/>}
            {page === "housekeeping" && <HousekeepingPage tasks={tasks} setTasks={setTasks} rooms={rooms} toast={showToast}/>}
            {page === "billing"      && <BillingPage guests={guests} transactions={transactions} setTransactions={setTransactions} rooms={rooms} toast={showToast}/>}
            {page === "reports"      && <ReportsPage transactions={transactions} rooms={rooms} reservations={reservations} guests={guests}/>}
            {page === "settings"     && <SettingsPage toast={showToast}/>}
          </div>
        </main>
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
          <span>{toast.type === "error" ? "⚠️" : "✓"}</span>
          {toast.msg}
        </div>
      )}
    </>
  );
}
