// Trivial edit: force git conflict resolution
import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   HOTEL FOUNTAIN V5.2.0 — LUXURY MANAGEMENT SYSTEM
   Bangladesh Edition · Role-Based Login · Full Integration
═══════════════════════════════════════════════════════════════ */

const TODAY = new Date("2026-03-08");
const fmtDate = d => d.toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const BDT = n => `৳${Number(n).toLocaleString("en-BD")}`;

// ─── ROLE DEFINITIONS ──────────────────────────────────────────
const ROLES = {
  superadmin:  { label:"Super Admin",         color:"#C8A96E", pages:["dashboard","rooms","reservations","guests","housekeeping","billing","reports","settings"] },
  manager:     { label:"General Manager",     color:"#2EC4B6", pages:["dashboard","rooms","reservations","guests","housekeeping","billing","reports"] },
  receptionist:{ label:"Receptionist",        color:"#58A6FF", pages:["dashboard","rooms","reservations","guests","billing"] },
  housekeeping:{ label:"Housekeeping Staff",  color:"#F0A500", pages:["dashboard","housekeeping"] },
  accountant:  { label:"Accountant",          color:"#3FB950", pages:["dashboard","billing","reports"] },
};

const USERS = [
  { id:1, name:"Rahim Uddin",    email:"admin@hotelfountain.com",       password:"admin123",     role:"superadmin",   avatar:"RU" },
  { id:2, name:"Karim Ahmed",    email:"manager@hotelfountain.com",     password:"manager123",   role:"manager",      avatar:"KA" },
  { id:3, name:"Nusrat Islam",   email:"front@hotelfountain.com",       password:"front123",     role:"receptionist", avatar:"NI" },
  { id:4, name:"Sumaiya Begum",  email:"housekeeping@hotelfountain.com",password:"house123",     role:"housekeeping", avatar:"SB" },
  { id:5, name:"Farhan Hossain", email:"accounts@hotelfountain.com",    password:"accounts123",  role:"accountant",   avatar:"FH" },
];

// ─── SEED DATA ──────────────────────────────────────────────────
const INIT_ROOMS = [
  { id:"101", type:"Standard",     floor:1, status:"occupied",     rate:4500,  beds:"Queen", view:"Garden",   guest:"Ahmed Al-Rashid",  checkIn:"2026-03-06", checkOut:"2026-03-10" },
  { id:"102", type:"Standard",     floor:1, status:"available",    rate:4500,  beds:"Twin",  view:"Garden",   guest:null },
  { id:"103", type:"Standard",     floor:1, status:"housekeeping", rate:4500,  beds:"King",  view:"Garden",   guest:null },
  { id:"104", type:"Standard",     floor:1, status:"maintenance",  rate:4500,  beds:"Queen", view:"Garden",   guest:null },
  { id:"105", type:"Standard",     floor:1, status:"available",    rate:4500,  beds:"Twin",  view:"Garden",   guest:null },
  { id:"201", type:"Deluxe",       floor:2, status:"occupied",     rate:8500,  beds:"King",  view:"Pool",     guest:"Sarah Mitchell",   checkIn:"2026-03-07", checkOut:"2026-03-12" },
  { id:"202", type:"Deluxe",       floor:2, status:"available",    rate:8500,  beds:"Queen", view:"Pool",     guest:null },
  { id:"203", type:"Deluxe",       floor:2, status:"occupied",     rate:8500,  beds:"King",  view:"City",     guest:"James Okonkwo",    checkIn:"2026-03-05", checkOut:"2026-03-09" },
  { id:"204", type:"Deluxe",       floor:2, status:"available",    rate:8500,  beds:"King",  view:"Pool",     guest:null },
  { id:"301", type:"Suite",        floor:3, status:"occupied",     rate:18000, beds:"King",  view:"Lake",     guest:"Lin Wei",          checkIn:"2026-03-08", checkOut:"2026-03-15" },
  { id:"302", type:"Suite",        floor:3, status:"housekeeping", rate:18000, beds:"King",  view:"Lake",     guest:null },
  { id:"303", type:"Suite",        floor:3, status:"available",    rate:18000, beds:"King",  view:"Panoramic",guest:null },
  { id:"401", type:"Presidential", floor:4, status:"occupied",     rate:45000, beds:"King",  view:"Panoramic",guest:"Elena Vasquez",    checkIn:"2026-03-01", checkOut:"2026-03-20" },
  { id:"402", type:"Presidential", floor:4, status:"available",    rate:45000, beds:"King",  view:"Panoramic",guest:null },
];

const INIT_FOLIOS = {
  "101": [
    { id:1, desc:"Room Charge (Standard · 2 nights)", amt:9000,  cat:"Room" },
    { id:2, desc:"Room Service — Breakfast",           amt:850,   cat:"F&B" },
    { id:3, desc:"Minibar Consumption",                amt:420,   cat:"F&B" },
  ],
  "201": [
    { id:1, desc:"Room Charge (Deluxe · 1 night)",    amt:8500,  cat:"Room" },
    { id:2, desc:"Spa Treatment",                      amt:3500,  cat:"Spa" },
    { id:3, desc:"Laundry Service",                    amt:800,   cat:"Service" },
    { id:4, desc:"Restaurant Dinner",                  amt:2200,  cat:"F&B" },
  ],
  "203": [
    { id:1, desc:"Room Charge (Deluxe · 3 nights)",   amt:25500, cat:"Room" },
    { id:2, desc:"Airport Transfer",                   amt:2500,  cat:"Transfer" },
  ],
  "301": [
    { id:1, desc:"Room Charge (Suite · 0 nights)",    amt:0,     cat:"Room" },
    { id:2, desc:"Welcome Package",                    amt:5000,  cat:"Service" },
    { id:3, desc:"Room Service (Dinner)",              amt:4200,  cat:"F&B" },
  ],
  "401": [
    { id:1, desc:"Room Charge (Presidential · 7 nights)", amt:315000, cat:"Room" },
    { id:2, desc:"Butler Service (7 days)",            amt:35000, cat:"Service" },
    { id:3, desc:"Fine Dining (5x)",                   amt:28000, cat:"F&B" },
    { id:4, desc:"Spa Package",                        amt:18000, cat:"Spa" },
    { id:5, desc:"Champagne Package",                  amt:12000, cat:"F&B" },
  ],
};

const INIT_GUESTS = [
  { id:1, name:"Ahmed Al-Rashid", email:"ahmed@example.com",  phone:"+880-1711-123456", nationality:"Bangladesh", room:"101", status:"checked-in", vip:true,  stays:12, spent:420000, loyalty:2800, joined:"2023-01-15", notes:"Prefers high floor. No smoking." },
  { id:2, name:"Sarah Mitchell",  email:"sarah@example.com",  phone:"+1-555-234-5678",  nationality:"USA",        room:"201", status:"checked-in", vip:false, stays:3,  spent:62000,  loyalty:420,  joined:"2025-03-10", notes:"Vegetarian meals only." },
  { id:3, name:"James Okonkwo",   email:"james@example.com",  phone:"+234-80-345-6789", nationality:"Nigeria",    room:"203", status:"checked-in", vip:false, stays:1,  spent:28000,  loyalty:120,  joined:"2026-02-20", notes:"" },
  { id:4, name:"Lin Wei",         email:"lin@example.com",    phone:"+86-138-456-7890", nationality:"China",      room:"301", status:"checked-in", vip:true,  stays:7,  spent:290000, loyalty:1900, joined:"2024-06-05", notes:"Requests extra towels daily." },
  { id:5, name:"Elena Vasquez",   email:"elena@example.com",  phone:"+34-600-567-8901", nationality:"Spain",      room:"401", status:"checked-in", vip:true,  stays:18, spent:1230000,loyalty:8200, joined:"2022-09-12", notes:"Late checkout approved. Champagne on arrival." },
  { id:6, name:"Tariq Hassan",    email:"tariq@example.com",  phone:"+880-1812-345678", nationality:"Bangladesh", room:null,  status:"reserved",   vip:false, stays:2,  spent:49000,  loyalty:280,  joined:"2025-07-18", notes:"" },
  { id:7, name:"Priya Sharma",    email:"priya@example.com",  phone:"+91-98-7654-3210", nationality:"India",      room:null,  status:"reserved",   vip:false, stays:0,  spent:0,      loyalty:0,    joined:"2026-03-01", notes:"First visit. Send welcome package." },
];

const INIT_RESERVATIONS = [
  { id:"RES-001", guestId:1, guest:"Ahmed Al-Rashid", room:"101", type:"Standard",     checkIn:"2026-03-06", checkOut:"2026-03-10", nights:4,  amount:18000,   paid:18000,  status:"confirmed", source:"Direct",      created:"2026-02-20" },
  { id:"RES-002", guestId:2, guest:"Sarah Mitchell",  room:"201", type:"Deluxe",       checkIn:"2026-03-07", checkOut:"2026-03-12", nights:5,  amount:42500,   paid:21250,  status:"confirmed", source:"Booking.com", created:"2026-02-25" },
  { id:"RES-003", guestId:3, guest:"James Okonkwo",   room:"203", type:"Deluxe",       checkIn:"2026-03-05", checkOut:"2026-03-09", nights:4,  amount:34000,   paid:34000,  status:"confirmed", source:"Expedia",     created:"2026-02-28" },
  { id:"RES-004", guestId:4, guest:"Lin Wei",         room:"301", type:"Suite",        checkIn:"2026-03-08", checkOut:"2026-03-15", nights:7,  amount:126000,  paid:63000,  status:"confirmed", source:"Direct",      created:"2026-03-01" },
  { id:"RES-005", guestId:5, guest:"Elena Vasquez",   room:"401", type:"Presidential", checkIn:"2026-03-01", checkOut:"2026-03-20", nights:19, amount:855000,  paid:855000, status:"confirmed", source:"Corporate",   created:"2026-02-10" },
  { id:"RES-006", guestId:6, guest:"Tariq Hassan",    room:"202", type:"Deluxe",       checkIn:"2026-03-15", checkOut:"2026-03-18", nights:3,  amount:25500,   paid:0,      status:"pending",   source:"Direct",      created:"2026-03-05" },
  { id:"RES-007", guestId:7, guest:"Priya Sharma",    room:"102", type:"Standard",     checkIn:"2026-03-11", checkOut:"2026-03-14", nights:3,  amount:13500,   paid:6750,   status:"pending",   source:"Airbnb",      created:"2026-03-06" },
];

const INIT_TASKS = [
  { id:1, room:"103", type:"Deep Clean",   priority:"high",   assignee:"Sumaiya Begum", dept:"Housekeeping", status:"in-progress", time:"09:00", notes:"Post checkout clean" },
  { id:2, room:"302", type:"Turndown",     priority:"medium", assignee:"Raju Mia",      dept:"Housekeeping", status:"pending",     time:"14:00", notes:"VIP room" },
  { id:3, room:"104", type:"AC Repair",    priority:"high",   assignee:"Kamal Dev",     dept:"Maintenance",  status:"pending",     time:"10:30", notes:"Thermostat fault" },
  { id:4, room:"202", type:"Inspection",   priority:"low",    assignee:"Sumaiya Begum", dept:"Housekeeping", status:"completed",   time:"08:00", notes:"Pre-arrival check" },
  { id:5, room:"401", type:"VIP Turndown", priority:"high",   assignee:"Raju Mia",      dept:"Housekeeping", status:"completed",   time:"07:30", notes:"Champagne + flowers" },
  { id:6, room:"301", type:"Extra Towels", priority:"medium", assignee:"Sumaiya Begum", dept:"Housekeeping", status:"pending",     time:"11:00", notes:"Guest request" },
];

function genTransactions() {
  const txns = [];
  const types = ["Room Charge","Restaurant","Room Service","Spa","Minibar","Laundry","Airport Transfer","Parking","Gift Shop","Bar & Lounge"];
  const guestNames = ["Ahmed Al-Rashid","Sarah Mitchell","James Okonkwo","Lin Wei","Elena Vasquez","Tariq Hassan","Karim Bhuiyan","Fatema Akter","David Chen","Sofia Rossi"];
  const methods = ["Credit Card","Cash","bKash","Nagad","Bank Transfer","Corporate Account"];
  let id = 1;
  for (let i = 29; i >= 0; i--) {
    const date = fmtDate(addDays(TODAY, -i));
    const count = 6 + Math.floor(Math.random() * 10);
    for (let j = 0; j < count; j++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const base = type === "Room Charge" ? 4500 + Math.floor(Math.random() * 40500) : 500 + Math.floor(Math.random() * 9500);
      txns.push({
        id: `TXN-${String(id++).padStart(4,"0")}`,
        date, time: `${String(8+Math.floor(Math.random()*14)).padStart(2,"0")}:${String(Math.floor(Math.random()*60)).padStart(2,"0")}`,
        guest: guestNames[Math.floor(Math.random() * guestNames.length)],
        type, room:`${Math.floor(Math.random()*4+1)}0${Math.floor(Math.random()*5+1)}`,
        amount: base, method: methods[Math.floor(Math.random() * methods.length)],
        status: Math.random() > 0.06 ? "completed" : "pending",
      });
    }
  }
  return txns;
}
const ALL_TRANSACTIONS = genTransactions();

// ─── UTILS ──────────────────────────────────────────────────────
const AVC = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500"];
const avColor  = n => AVC[n ? n.charCodeAt(0) % AVC.length : 0];
const initials = n => n ? n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
const STATUS_CLR = { available:"#3FB950", occupied:"#58A6FF", housekeeping:"#F0A500", maintenance:"#E05C7A" };
const nightsCount = (ci, co) => Math.max(0, Math.round((new Date(co)-new Date(ci))/86400000));

// ─── GLOBAL CSS ─────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0C1118;--s1:#131920;--s2:#1A2130;--s3:#1F2840;
  --gold:#C8A96E;--gold2:#E8C97E;--gdim:rgba(200,169,110,0.11);
  --teal:#2EC4B6;--rose:#E05C7A;--sky:#58A6FF;--grn:#3FB950;--amb:#F0A500;--pur:#9B72CF;
  --tx:#E6EDF3;--tx2:#8B949E;--tx3:#3D4550;
  --br:rgba(200,169,110,0.13);--br2:rgba(255,255,255,0.06);
  --r:10px;--sh:0 8px 32px rgba(0,0,0,.45);
}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--tx);font-family:'Jost',sans-serif}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(200,169,110,.25);border-radius:2px}

/* LOGIN */
.login-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.login-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 20% 30%,rgba(200,169,110,.06),transparent 60%),radial-gradient(ellipse 60% 80% at 80% 70%,rgba(46,196,182,.05),transparent 60%);pointer-events:none}
.login-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,169,110,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,169,110,.03) 1px,transparent 1px);background-size:50px 50px;pointer-events:none}
.login-card{background:var(--s1);border:1px solid var(--br);border-radius:16px;padding:44px 40px;width:100%;max-width:440px;position:relative;z-index:1;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:loginIn .4s ease}
@keyframes loginIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.login-logo{text-align:center;margin-bottom:32px}
.login-logo-icon{font-size:40px;margin-bottom:10px}
.login-logo-name{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;color:var(--gold);letter-spacing:.02em}
.login-logo-sub{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.18em;color:var(--tx3);margin-top:3px;text-transform:uppercase}
.login-divider{border:none;border-top:1px solid var(--br);margin:20px 0}
.login-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
.role-pill{padding:8px 10px;border-radius:7px;border:1px solid var(--br2);background:transparent;cursor:pointer;transition:all .2s;text-align:center;color:var(--tx2);font-size:11.5px;font-family:'Jost',sans-serif}
.role-pill:hover{background:var(--gdim);color:var(--tx)}
.role-pill.selected{border-color:var(--gold);background:rgba(200,169,110,.1);color:var(--gold)}
.role-pill .rp-ico{font-size:16px;margin-bottom:3px;display:block}
.role-pill .rp-lbl{font-size:10px;font-family:'DM Mono',monospace;letter-spacing:.06em;display:block}
.login-hint{background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.15);border-radius:7px;padding:10px 13px;font-size:11px;color:var(--tx2);margin-bottom:16px;line-height:1.6}

/* APP LAYOUT */
.app{display:flex;height:100vh;overflow:hidden}
.sidebar{width:236px;flex-shrink:0;background:var(--s1);border-right:1px solid var(--br);display:flex;flex-direction:column}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* SIDEBAR */
.s-logo{padding:20px 18px 16px;border-bottom:1px solid var(--br)}
.s-logo-name{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--gold);line-height:1.1}
.s-logo-ver{font-family:'DM Mono',monospace;font-size:8.5px;color:var(--tx3);letter-spacing:.14em;margin-top:2px}
.s-nav{flex:1;padding:10px 8px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.s-sect{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.18em;color:var(--tx3);padding:10px 10px 3px;text-transform:uppercase}
.s-item{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:7px;cursor:pointer;transition:all .2s;font-size:13px;color:var(--tx2);border:1px solid transparent;user-select:none}
.s-item:hover{background:var(--gdim);color:var(--tx)}
.s-item.active{background:var(--gdim);color:var(--gold);border-color:rgba(200,169,110,.2);font-weight:500}
.s-item .ico{font-size:14px;width:18px;text-align:center;flex-shrink:0}
.s-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:9px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:10px}
.s-user{padding:12px 14px;border-top:1px solid var(--br);display:flex;align-items:center;gap:9px}
.s-u-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0C1118;flex-shrink:0}
.s-u-name{font-size:12px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-u-role{font-family:'DM Mono',monospace;font-size:8.5px;color:var(--tx3);letter-spacing:.07em}

/* TOPBAR */
.topbar{height:52px;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--br);display:flex;align-items:center;padding:0 22px;gap:12px}
.tb-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--tx);flex:1}
.tb-meta{font-family:'DM Mono',monospace;font-size:10px;color:var(--tx2);letter-spacing:.05em;white-space:nowrap}
.content{flex:1;overflow-y:auto;padding:20px}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12.5px;font-weight:500;cursor:pointer;border:none;transition:all .2s;font-family:'Jost',sans-serif;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-gold{background:var(--gold);color:#0C1118}
.btn-gold:hover:not(:disabled){background:var(--gold2);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--br2)}
.btn-ghost:hover:not(:disabled){background:var(--s2);color:var(--tx);border-color:var(--br)}
.btn-danger{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.btn-danger:hover:not(:disabled){background:rgba(224,92,122,.22)}
.btn-success{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.btn-success:hover:not(:disabled){background:rgba(63,185,80,.22)}
.btn-sm{padding:5px 10px;font-size:11.5px}
.btn-icon{padding:6px 9px}

/* CARDS */
.card{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);overflow:hidden}
.card-hd{padding:14px 18px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.card-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--tx)}
.card-body{padding:16px}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:18px}
.stat{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);padding:16px;position:relative;overflow:hidden;transition:all .25s}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac,var(--gold))}
.stat:hover{border-color:rgba(200,169,110,.3);transform:translateY(-2px);box-shadow:var(--sh)}
.stat-ico{font-size:19px;margin-bottom:9px}
.stat-lbl{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.12em;color:var(--tx2);text-transform:uppercase;margin-bottom:4px}
.stat-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700;color:var(--tx);line-height:1}
.stat-sub{font-size:11px;color:var(--tx2);margin-top:4px}
.stat-chg{font-size:10px;margin-top:2px}
.up{color:var(--grn)}.down{color:var(--rose)}

/* BADGES */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-family:'DM Mono',monospace;letter-spacing:.04em;font-weight:500;white-space:nowrap}
.bg{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.bb{background:rgba(88,166,255,.12);color:var(--sky);border:1px solid rgba(88,166,255,.2)}
.ba{background:rgba(240,165,0,.12);color:var(--amb);border:1px solid rgba(240,165,0,.2)}
.br2{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.bgold{background:rgba(200,169,110,.12);color:var(--gold);border:1px solid rgba(200,169,110,.2)}
.bp{background:rgba(155,114,207,.12);color:var(--pur);border:1px solid rgba(155,114,207,.2)}

/* TABLE */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase;padding:9px 12px;text-align:left;border-bottom:1px solid var(--br2);white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--br2);font-size:12.5px;color:var(--tx);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(255,255,255,.013)}
.tbl-wrap{overflow-x:auto}

/* ROOMS */
.rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.room-card{border-radius:9px;padding:13px 11px;cursor:pointer;transition:all .2s;border:1px solid transparent;position:relative}
.room-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.35)}
.room-card.available{background:rgba(63,185,80,.07);border-color:rgba(63,185,80,.18)}
.room-card.occupied{background:rgba(88,166,255,.07);border-color:rgba(88,166,255,.18)}
.room-card.housekeeping{background:rgba(240,165,0,.07);border-color:rgba(240,165,0,.18)}
.room-card.maintenance{background:rgba(224,92,122,.07);border-color:rgba(224,92,122,.18)}
.room-no{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;line-height:1;margin-bottom:3px}
.room-card.available .room-no{color:var(--grn)}.room-card.occupied .room-no{color:var(--sky)}
.room-card.housekeeping .room-no{color:var(--amb)}.room-card.maintenance .room-no{color:var(--rose)}
.room-tp{font-size:9px;color:var(--tx2);font-family:'DM Mono',monospace;letter-spacing:.07em;margin-bottom:7px;text-transform:uppercase}
.room-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.room-dot.available{background:var(--grn);box-shadow:0 0 5px var(--grn)}
.room-dot.occupied{background:var(--sky);box-shadow:0 0 5px var(--sky)}
.room-dot.housekeeping{background:var(--amb);box-shadow:0 0 5px var(--amb)}
.room-dot.maintenance{background:var(--rose);box-shadow:0 0 5px var(--rose)}
.room-info-row{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--tx2)}
.room-guest-name{font-size:9px;color:var(--tx2);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic}
.room-rate{font-family:'DM Mono',monospace;font-size:10px;color:var(--gold);margin-top:3px}

/* MODAL */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(5px);z-index:200;display:flex;align-items:center;justify-content:center;padding:18px}
.modal{background:var(--s1);border:1px solid var(--br);border-radius:14px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,.65);animation:modalIn .25s ease}
.modal-wide{max-width:720px}
@keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.modal-hd{padding:16px 20px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--s1);z-index:1}
.modal-title{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--tx)}
.modal-close{background:none;border:none;color:var(--tx2);cursor:pointer;font-size:22px;line-height:1;padding:0;transition:color .2s}
.modal-close:hover{color:var(--tx)}
.modal-body{padding:20px}
.modal-ft{padding:13px 20px;border-top:1px solid var(--br2);display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}

/* FORM */
.fg{margin-bottom:13px}
.flbl{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.1em;color:var(--tx2);text-transform:uppercase;margin-bottom:5px;display:block}
.finput{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:12.5px;font-family:'Jost',sans-serif;outline:none;transition:border-color .2s}
.finput:focus{border-color:rgba(200,169,110,.4)}
.fselect{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:12.5px;font-family:'Jost',sans-serif;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B949E' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.ftextarea{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 11px;color:var(--tx);font-size:12.5px;font-family:'Jost',sans-serif;outline:none;resize:vertical;min-height:68px;transition:border-color .2s}
.ftextarea:focus{border-color:rgba(200,169,110,.4)}

/* TABS */
.tabs{display:flex;gap:2px;background:var(--s2);border-radius:8px;padding:3px;flex-wrap:wrap}
.tab{padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .2s;color:var(--tx2);border:none;background:none;font-family:'Jost',sans-serif;white-space:nowrap}
.tab.active{background:var(--s1);color:var(--tx);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,.3)}

/* AVATAR */
.av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0C1118;flex-shrink:0}
.av-lg{width:42px;height:42px;font-size:14px}
.av-md{width:33px;height:33px;font-size:12px}
.av-sm{width:26px;height:26px;font-size:10px}

/* GUEST ROW */
.g-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--br2);cursor:pointer;transition:all .2s;border-radius:6px}
.g-row:last-child{border-bottom:none}
.g-row:hover{padding-left:5px}

/* FOLIO */
.folio-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--br2);font-size:12px}
.folio-row:last-child{border-bottom:none}
.folio-total{display:flex;align-items:center;justify-content:space-between;padding:12px 0 0;font-size:14px;font-weight:600;color:var(--gold)}

/* PRIORITY */
.pdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.pdot.high{background:var(--rose);box-shadow:0 0 5px var(--rose)}
.pdot.medium{background:var(--amb);box-shadow:0 0 5px var(--amb)}
.pdot.low{background:var(--grn);box-shadow:0 0 5px var(--grn)}

/* CHART */
.bar-chart{display:flex;align-items:flex-end;gap:5px;height:100px;padding:0 2px}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}
.bar{width:100%;border-radius:3px 3px 0 0;transition:all .35s cubic-bezier(.4,0,.2,1);min-height:4px}
.bar-lbl{font-family:'DM Mono',monospace;font-size:8px;color:var(--tx3)}

/* OCCUPANCY RING */
.ring-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.ring-wrap svg{transform:rotate(-90deg)}
.ring-center{position:absolute;text-align:center}
.ring-pct{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:var(--gold);line-height:1}
.ring-lbl{font-family:'DM Mono',monospace;font-size:7.5px;color:var(--tx3);letter-spacing:.1em}

/* TOAST */
.toast{position:fixed;bottom:20px;right:20px;background:var(--s1);border:1px solid rgba(200,169,110,.3);border-radius:10px;padding:12px 16px;box-shadow:0 20px 60px rgba(0,0,0,.55);z-index:999;display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--tx);animation:toastIn .3s ease;max-width:320px}
.toast.error{border-color:rgba(224,92,122,.35)}
.toast.info{border-color:rgba(88,166,255,.35)}
@keyframes toastIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* SEARCH */
.search{display:flex;align-items:center;gap:7px;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:6px 10px;min-width:190px}
.search input{background:none;border:none;outline:none;color:var(--tx);font-size:12px;font-family:'Jost',sans-serif;flex:1;min-width:0}
.search input::placeholder{color:var(--tx3)}

/* GRID HELPERS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:15px}
.g3{display:grid;grid-template-columns:2fr 1fr;gap:15px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
.flex{display:flex}.fac{align-items:center}.fjb{justify-content:space-between}.gap2{gap:8px}.gap3{gap:11px}.gap4{gap:15px}
.mt2{margin-top:7px}.mt3{margin-top:11px}.mt4{margin-top:15px}.mt6{margin-top:22px}.mb4{margin-bottom:15px}.mb6{margin-bottom:22px}
.mono{font-family:'DM Mono',monospace}.serif{font-family:'Cormorant Garamond',serif}
.gold{color:var(--gold)}.muted{color:var(--tx2)}.sm{font-size:11.5px}.xs{font-size:10px}
.w100{width:100%}.bold{font-weight:600}
.divider{border:none;border-top:1px solid var(--br2);margin:12px 0}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px 20px;color:var(--tx3);gap:9px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.info-box{padding:10px 12px;background:var(--s2);border-radius:8px;border:1px solid var(--br2)}
.info-lbl{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase;margin-bottom:3px}
.info-val{font-size:13px;font-weight:500;color:var(--tx)}
.progress-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden;margin-top:7px}
.progress-fill{height:100%;border-radius:3px;transition:width .6s ease}

/* STATUS DROPDOWN (inline) */
.status-select-wrap{position:relative;display:inline-block}
.status-select{appearance:none;background:var(--s2);border:1px solid var(--br2);border-radius:6px;padding:5px 28px 5px 10px;font-size:11.5px;font-family:'Jost',sans-serif;cursor:pointer;outline:none;color:var(--tx);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238B949E' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;transition:border-color .2s}
.status-select:focus{border-color:rgba(200,169,110,.4)}

/* CHECKOUT SECTION */
.checkout-banner{background:linear-gradient(135deg,rgba(224,92,122,.08),rgba(200,169,110,.06));border:1px solid rgba(224,92,122,.2);border-radius:9px;padding:14px 16px;margin-bottom:14px}
.folio-section{background:var(--s2);border-radius:9px;border:1px solid var(--br2);overflow:hidden}
.folio-hd{padding:10px 14px;background:rgba(200,169,110,.05);border-bottom:1px solid var(--br2);font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--tx2);text-transform:uppercase}
.folio-body{padding:0 14px}
.folio-summary{padding:12px 14px;background:rgba(200,169,110,.04);border-top:1px solid var(--br2)}

/* TOGGLE */
.toggle-wrap{display:flex;align-items:center;gap:9px;margin-top:6px}
.toggle{width:40px;height:22px;border-radius:11px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
.toggle-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}
`;

// ─── SMALL COMPONENTS ────────────────────────────────────────────

function Av({ name, size="md", style={} }) {
  const cls = `av av-${size}`;
  return <div className={cls} style={{ background:`linear-gradient(135deg,${avColor(name)},rgba(0,0,0,.45))`, ...style }}>{initials(name)}</div>;
}

function Badge({ children, color="gold" }) {
  const cls = { gold:"bgold", green:"bg", blue:"bb", amber:"ba", red:"br2", purple:"bp" }[color]||"bgold";
  return <span className={`badge ${cls}`}>{children}</span>;
}

function StatusBadge({ status }) {
  const m = { confirmed:"green", pending:"amber", cancelled:"red", "checked-in":"blue", reserved:"amber", completed:"green", "in-progress":"blue", available:"green", occupied:"blue", housekeeping:"amber", maintenance:"red", "checked-out":"purple" };
  return <Badge color={m[status]||"gold"}>{status}</Badge>;
}

function OccRing({ pct }) {
  const r=48, c=2*Math.PI*r;
  return (
    <div className="ring-wrap">
      <svg width="116" height="116" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="9"/>
        <circle cx="58" cy="58" r={r} fill="none" stroke="url(#rg)" strokeWidth="9"
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"/>
        <defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C8A96E"/><stop offset="100%" stopColor="#E8C97E"/>
        </linearGradient></defs>
      </svg>
      <div className="ring-center"><div className="ring-pct">{pct}%</div><div className="ring-lbl">OCC.</div></div>
    </div>
  );
}

function BarChart({ data, vk, lk, active, onHover }) {
  const max = Math.max(...data.map(d=>d[vk]),1);
  return (
    <div className="bar-chart">
      {data.map((d,i)=>(
        <div key={i} className="bar-col" onMouseEnter={()=>onHover(i)}>
          <div className="bar" style={{ height:`${(d[vk]/max)*100}%`, background:i===active?"linear-gradient(to top,var(--gold),rgba(200,169,110,.4))":"linear-gradient(to top,rgba(200,169,110,.3),rgba(200,169,110,.08))" }}/>
          <span className="bar-lbl">{d[lk]}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, footer, wide=false }) {
  useEffect(()=>{ const h=e=>{if(e.key==="Escape")onClose();}; document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal${wide?" modal-wide":""}`} onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer&&<div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder="Search..." }) {
  return (
    <div className="search">
      <span style={{color:"var(--tx3)",fontSize:13}}>⌕</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
      {value&&<span style={{cursor:"pointer",color:"var(--tx3)",fontSize:11}} onClick={()=>onChange("")}>×</span>}
    </div>
  );
}

// ─── LOGIN PAGE ─────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [selectedRole, setSelectedRole] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const roleIcons = { superadmin:"👑", manager:"🏨", receptionist:"🛎️", housekeeping:"🧹", accountant:"💰" };

  function selectRole(role) {
    setSelectedRole(role);
    const user = USERS.find(u=>u.role===role);
    if(user){ setEmail(user.email); setPassword(user.password); }
    setError("");
  }

  function handleLogin() {
    setError("");
    setLoading(true);
    setTimeout(()=>{
      const user = USERS.find(u=>u.email.toLowerCase()===email.toLowerCase() && u.password===password);
      if(user){ onLogin(user); }
      else { setError("Invalid email or password. Please try again."); setLoading(false); }
    }, 600);
  }

  function handleKey(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="login-bg">
      <div className="login-grid"/>
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏨</div>
          <div className="login-logo-name">Hotel Fountain</div>
          <div className="login-logo-sub">Luxury Management System · Dhaka, Bangladesh</div>
        </div>

        <div style={{marginBottom:16}}>
          <div className="flbl" style={{marginBottom:10}}>Quick Role Select</div>
          <div className="login-role-grid">
            {Object.entries(ROLES).map(([key,role])=>(
              <div key={key} className={`role-pill${selectedRole===key?" selected":""}`} onClick={()=>selectRole(key)}>
                <span className="rp-ico">{roleIcons[key]}</span>
                <span className="rp-lbl">{role.label}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedRole && (
          <div className="login-hint">
            <strong style={{color:"var(--gold)"}}>Demo:</strong> {USERS.find(u=>u.role===selectedRole)?.email} / {USERS.find(u=>u.role===selectedRole)?.password}
          </div>
        )}

        <div>
          <div className="fg">
            <label className="flbl">Email Address</label>
            <input className="finput" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={handleKey} placeholder="your@email.com"/>
          </div>
          <div className="fg">
            <label className="flbl">Password</label>
            <div style={{position:"relative"}}>
              <input className="finput" type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={handleKey} placeholder="••••••••" style={{paddingRight:40}}/>
              <span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:14,color:"var(--tx3)"}} onClick={()=>setShowPw(!showPw)}>{showPw?"🙈":"👁"}</span>
            </div>
          </div>
          {error && <div style={{background:"rgba(224,92,122,.1)",border:"1px solid rgba(224,92,122,.25)",borderRadius:7,padding:"9px 12px",fontSize:12,color:"var(--rose)",marginBottom:14}}>{error}</div>}
          <button className="btn btn-gold w100" style={{justifyContent:"center",padding:"10px",fontSize:13.5,marginTop:4}} disabled={loading} onClick={handleLogin}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOM MODAL (occupied shows billing + checkout) ─────────────
function RoomModal({ room, folios, setFolios, setRooms, setGuests, setTransactions, toast, onClose, currentUser }) {
  const isOccupied = room.status === "occupied";
  const [activeTab, setActiveTab] = useState(isOccupied ? "billing" : "info");
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [chargeForm, setChargeForm] = useState({ type:"Room Service", amount:"", desc:"" });
  const [payMethod, setPayMethod] = useState("Cash");
  const [payAmount, setPayAmount] = useState("");
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [assignForm, setAssignForm] = useState({ guest:"", checkIn:"", checkOut:"" });

  const charges = folios[room.id] || [];
  const sub = charges.reduce((a,c)=>a+c.amt,0);
  const tax = Math.round(sub*0.07); // 7% VAT Bangladesh
  const svc = Math.round(sub*0.05);
  const total = sub + tax + svc;

  const nights = room.checkIn && room.checkOut ? nightsCount(room.checkIn, room.checkOut) : 0;
  const daysStayed = room.checkIn ? Math.max(0, nightsCount(room.checkIn, fmtDate(TODAY))) : 0;

  function changeStatus(newStatus) {
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:newStatus,guest:newStatus!=="occupied"?null:r.guest}:r));
    toast(`Room ${room.id} → ${newStatus}`,"success");
    onClose();
  }

  function addCharge() {
    if(!chargeForm.amount||isNaN(chargeForm.amount)) return toast("Enter valid amount","error");
    const newItem = { id:Date.now(), desc:chargeForm.desc||chargeForm.type, amt:parseFloat(chargeForm.amount), cat:chargeForm.type };
    setFolios(p=>({...p,[room.id]:[...(p[room.id]||[]),newItem]}));
    const txn = { id:`TXN-${Date.now()}`, date:fmtDate(TODAY), time:new Date().toTimeString().slice(0,5), guest:room.guest, type:chargeForm.type, room:room.id, amount:parseFloat(chargeForm.amount), method:"Room Charge", status:"completed" };
    setTransactions(p=>[txn,...p]);
    toast(`Charge added: ${BDT(chargeForm.amount)}`,"success");
    setShowAddCharge(false);
    setChargeForm({ type:"Room Service", amount:"", desc:"" });
  }

  function processPayment() {
    const amt = parseFloat(payAmount);
    if(!amt||amt<=0) return toast("Enter valid amount","error");
    const txn = { id:`TXN-${Date.now()}`, date:fmtDate(TODAY), time:new Date().toTimeString().slice(0,5), guest:room.guest, type:"Payment", room:room.id, amount:amt, method:payMethod, status:"completed" };
    setTransactions(p=>[txn,...p]);
    toast(`Payment of ${BDT(amt)} processed via ${payMethod}`,"success");
    setShowPayModal(false);
    setPayAmount("");
  }

  function doCheckout() {
    // Final payment transaction
    const txn = { id:`TXN-${Date.now()}`, date:fmtDate(TODAY), time:new Date().toTimeString().slice(0,5), guest:room.guest, type:"Final Settlement", room:room.id, amount:total, method:"Credit Card", status:"completed" };
    setTransactions(p=>[txn,...p]);
    // Update room
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:"housekeeping",guest:null,checkIn:null,checkOut:null}:r));
    // Update guest
    setGuests(p=>p.map(g=>g.name===room.guest?{...g,status:"checked-out",room:null,stays:g.stays+1,spent:g.spent+total}:g));
    // Clear folio
    setFolios(p=>({...p,[room.id]:[]}));
    toast(`✓ ${room.guest} checked out from Room ${room.id}`,"success");
    onClose();
  }

  function assignGuest() {
    if(!assignForm.guest||!assignForm.checkIn||!assignForm.checkOut) return toast("Fill all fields","error");
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:"occupied",guest:assignForm.guest,checkIn:assignForm.checkIn,checkOut:assignForm.checkOut}:r));
    toast(`${assignForm.guest} assigned to Room ${room.id}`,"success");
    onClose();
  }

  const canEdit = ["superadmin","manager","receptionist","accountant"].includes(currentUser?.role);

  return (
    <Modal title={`Room ${room.id} — ${room.type}`} onClose={onClose} wide={isOccupied}
      footer={
        isOccupied ? (
          <div className="flex gap2" style={{flexWrap:"wrap"}}>
            {canEdit && <><button className="btn btn-ghost" onClick={()=>setShowAddCharge(true)}>＋ Add Charge</button>
            <button className="btn btn-ghost" onClick={()=>setShowPayModal(true)}>💳 Payment</button>
            <button className="btn btn-danger" onClick={()=>setShowCheckoutConfirm(true)}>🚪 Check Out</button></>}
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        )
      }>

      {/* TABS for occupied room */}
      {isOccupied && (
        <div className="tabs mb4">
          <button className={`tab${activeTab==="billing"?" active":""}`} onClick={()=>setActiveTab("billing")}>💰 Billing & Folio</button>
          <button className={`tab${activeTab==="info"?" active":""}`} onClick={()=>setActiveTab("info")}>🛏️ Room Info</button>
        </div>
      )}

      {/* ── BILLING TAB ── */}
      {activeTab === "billing" && isOccupied && (
        <div>
          {/* Guest Banner */}
          <div className="checkout-banner">
            <div className="flex fac fjb">
              <div className="flex fac gap3">
                <Av name={room.guest} size="lg"/>
                <div>
                  <div className="serif" style={{fontSize:17,fontWeight:700}}>{room.guest}</div>
                  <div className="xs mono muted mt2">Room {room.id} · {room.type} · {room.view} View</div>
                  <div className="xs mono" style={{color:"var(--amb)",marginTop:2}}>{room.checkIn} → {room.checkOut} · {daysStayed} day{daysStayed!==1?"s":""} stayed</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="xs muted">Running Total</div>
                <div className="serif" style={{fontSize:22,fontWeight:700,color:"var(--gold)"}}>{BDT(total)}</div>
              </div>
            </div>
          </div>

          {/* Folio */}
          <div className="folio-section mb4">
            <div className="folio-hd flex fjb fac">
              <span>Charges</span>
              {canEdit && <button className="btn btn-ghost btn-sm" onClick={()=>setShowAddCharge(true)}>＋ Add</button>}
            </div>
            <div className="folio-body">
              {charges.length===0 && <div style={{padding:"16px 0",color:"var(--tx3)",fontSize:12,textAlign:"center"}}>No charges yet</div>}
              {charges.map((c,i)=>(
                <div key={i} className="folio-row">
                  <div>
                    <span className="sm">{c.desc}</span>
                    <span className="badge bgold" style={{marginLeft:6,fontSize:9}}>{c.cat}</span>
                  </div>
                  <span className="mono xs gold">{BDT(c.amt)}</span>
                </div>
              ))}
            </div>
            <div className="folio-summary">
              <div className="flex fjb xs muted mb2"><span>Subtotal</span><span className="mono">{BDT(sub)}</span></div>
              <div className="flex fjb xs muted mb2"><span>VAT (7%)</span><span className="mono">{BDT(tax)}</span></div>
              <div className="flex fjb xs muted mb2"><span>Service Charge (5%)</span><span className="mono">{BDT(svc)}</span></div>
              <hr className="divider" style={{margin:"8px 0"}}/>
              <div className="flex fjb" style={{fontSize:15,fontWeight:700,color:"var(--gold)"}}>
                <span>Total Due</span><span className="mono">{BDT(total)}</span>
              </div>
            </div>
          </div>

          {/* Quick charge buttons */}
          {canEdit && (
            <div>
              <div className="flbl mb2">Quick Charge</div>
              <div className="flex gap2" style={{flexWrap:"wrap"}}>
                {["Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Bar","Airport Transfer"].map(t=>(
                  <button key={t} className="btn btn-ghost btn-sm" disabled={!sg} onClick={()=>{setCf(p=>({...p,type:t}));setShowCharge(true);}}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INFO / STATUS TAB ── */}
      {(activeTab === "info" || !isOccupied) && (
        <div>
          <div className="info-grid mb4">
            {[["Floor",`Floor ${room.floor}`],["Bed Type",room.beds],["View",room.view],["Rate",BDT(room.rate)+"/night"]].map(([l,v])=>(
              <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
            ))}
          </div>

          {isOccupied && room.guest && (
            <div style={{padding:"11px 13px",background:"rgba(88,166,255,.06)",borderRadius:8,border:"1px solid rgba(88,166,255,.15)",marginBottom:14}}>
              <div className="info-lbl mb2">Current Guest</div>
              <div className="flex fac gap2">
                <Av name={room.guest} size="sm"/>
                <div><div className="bold sm">{room.guest}</div><div className="xs muted">{room.checkIn} → {room.checkOut} ({nights} nights)</div></div>
              </div>
            </div>
          )}

          {/* Assign guest if available */}
          {room.status==="available" && canEdit && (
            <div className="mb4">
              <div className="flbl mb2">Assign Guest</div>
              <div className="fg">
                <input className="finput" placeholder="Guest name" value={assignForm.guest} onChange={e=>setAssignForm(p=>({...p,guest:e.target.value}))}/>
              </div>
              <div className="frow">
                <div className="fg"><label className="flbl">Check-In</label><input type="date" className="finput" value={assignForm.checkIn} onChange={e=>setAssignForm(p=>({...p,checkIn:e.target.value}))}/></div>
                <div className="fg"><label className="flbl">Check-Out</label><input type="date" className="finput" value={assignForm.checkOut} onChange={e=>setAssignForm(p=>({...p,checkOut:e.target.value}))}/></div>
              </div>
              <button className="btn btn-gold w100" style={{justifyContent:"center"}} onClick={assignGuest}>Assign & Check In</button>
            </div>
          )}

          {/* Status dropdown */}
          {canEdit && (
            <div>
              <div className="flbl mb2">Change Room Status</div>
              <select className="fselect" value={room.status} onChange={e=>changeStatus(e.target.value)}>
                <option value="available">✅ Available</option>
                <option value="occupied">🔵 Occupied</option>
                <option value="housekeeping">🟡 Housekeeping</option>
                <option value="maintenance">🔴 Maintenance</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Add Charge Modal */}
      {showAddCharge && (
        <div className="modal-bg" onClick={()=>setShowAddCharge(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Add Charge — Room {room.id}</div><button className="modal-close" onClick={()=>setShowAddCharge(false)}>×</button></div>
            <div className="modal-body">
              <div className="fg"><label className="flbl">Charge Type</label>
                <select className="fselect" value={chargeForm.type} onChange={e=>setChargeForm(p=>({...p,type:e.target.value}))}>
                  {["Room Charge","Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Airport Transfer","Bar & Lounge","Gift Shop","Miscellaneous"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="fg"><label className="flbl">Amount (BDT) *</label><input type="number" className="finput" value={chargeForm.amount} onChange={e=>setChargeForm(p=>({...p,amount:e.target.value}))} placeholder="0.00"/></div>
              <div className="fg"><label className="flbl">Description</label><input className="finput" value={chargeForm.desc} onChange={e=>setChargeForm(p=>({...p,desc:e.target.value}))} placeholder="Optional..."/></div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowAddCharge(false)}>Cancel</button><button className="btn btn-gold" onClick={addCharge}>Add Charge</button></div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <div className="modal-bg" onClick={()=>setShowPayModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Process Payment</div><button className="modal-close" onClick={()=>setShowPayModal(false)}>×</button></div>
            <div className="modal-body">
              <div style={{padding:"11px 13px",background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",marginBottom:14}}>
                <div className="flex fjb sm"><span className="muted">Guest</span><span className="bold">{room.guest}</span></div>
                <div className="flex fjb sm mt2"><span className="muted">Total Due</span><span className="mono gold">{BDT(total)}</span></div>
              </div>
              <div className="fg"><label className="flbl">Payment Method</label>
                <select className="fselect" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
                  {["Cash","Credit Card","Debit Card","bKash","Nagad","Rocket","Bank Transfer","Corporate Account"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="fg"><label className="flbl">Amount (BDT)</label>
                <input type="number" className="finput" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder={total}/>
              </div>
              <div className="flex gap2 mt2">
                {[total, Math.round(total/2), 10000, 5000].map(a=>(
                  <button key={a} className="btn btn-ghost btn-sm" onClick={()=>setPayAmount(a.toString())}>{BDT(a)}</button>
                ))}
              </div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowPayModal(false)}>Cancel</button><button className="btn btn-gold" onClick={processPayment}>Confirm Payment</button></div>
          </div>
        </div>
      )}

      {/* Checkout Confirm */}
      {showCheckoutConfirm && (
        <div className="modal-bg" onClick={()=>setShowCheckoutConfirm(false)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Confirm Checkout</div><button className="modal-close" onClick={()=>setShowCheckoutConfirm(false)}>×</button></div>
            <div className="modal-body">
              <div style={{textAlign:"center",padding:"8px 0 16px"}}>
                <div style={{fontSize:36,marginBottom:10}}>🚪</div>
                <div className="serif" style={{fontSize:18,fontWeight:700,marginBottom:6}}>Check Out {room.guest}?</div>
                <div className="sm muted">Room {room.id} · {daysStayed} days stayed</div>
              </div>
              <div style={{background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",padding:"12px 14px"}}>
                <div className="flex fjb sm mb2"><span className="muted">Room Charges</span><span className="mono">{BDT(sub)}</span></div>
                <div className="flex fjb sm mb2"><span className="muted">VAT (7%)</span><span className="mono">{BDT(tax)}</span></div>
                <div className="flex fjb sm mb2"><span className="muted">Service (5%)</span><span className="mono">{BDT(svc)}</span></div>
                <hr className="divider" style={{margin:"8px 0"}}/>
                <div className="flex fjb" style={{fontSize:15,fontWeight:700,color:"var(--gold)"}}><span>Final Bill</span><span className="mono">{BDT(total)}</span></div>
              </div>
              <div className="sm muted mt3" style={{textAlign:"center"}}>Room will be set to Housekeeping after checkout</div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setShowCheckoutConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doCheckout}>Confirm Checkout</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── ROOMS PAGE ─────────────────────────────────────────────────
function RoomsPage({ rooms, setRooms, folios, setFolios, guests, setGuests, setTransactions, toast, currentUser }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const filtered = filter==="all" ? rooms : rooms.filter(r=>r.status===filter);

  return (
    <div>
      <div className="flex fac gap3 mb4" style={{flexWrap:"wrap"}}>
        <div className="tabs">
          {["all","available","occupied","housekeeping","maintenance"].map(s=>(
            <button key={s} className={`tab${filter===s?" active":""}`} onClick={()=>setFilter(s)}>
              {s==="all"?`All (${rooms.length})`:`${s.charAt(0).toUpperCase()+s.slice(1)} (${rooms.filter(r=>r.status===s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap4 mb4" style={{flexWrap:"wrap"}}>
        {[["available","#3FB950"],["occupied","#58A6FF"],["housekeeping","#F0A500"],["maintenance","#E05C7A"]].map(([s,c])=>(
          <div key={s} className="flex fac gap2 sm muted">
            <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}`}}/>
            <span style={{textTransform:"capitalize"}}>{s}</span>
          </div>
        ))}
        <span className="xs muted">· Click any room for details</span>
        {filtered.filter(r=>r.status==="occupied").length > 0 && (
          <span className="xs" style={{color:"var(--sky)"}}>· Occupied rooms show billing & checkout</span>
        )}
      </div>

      <div className="rooms-grid">
        {filtered.map(room=>(
          <div key={room.id} className={`room-card ${room.status}`} onClick={()=>setSelected(room)}>
            {room.status==="occupied" && <div style={{position:"absolute",top:7,right:7,fontSize:9,background:"rgba(88,166,255,.2)",color:"var(--sky)",borderRadius:3,padding:"1px 5px",fontFamily:"DM Mono",letterSpacing:".05em"}}>BILLING</div>}
            <div className="room-no">{room.id}</div>
            <div className="room-tp">{room.type} · {room.view}</div>
            <div className="room-info-row"><div className={`room-dot ${room.status}`}/><span style={{fontSize:10,color:"var(--tx2)",textTransform:"capitalize"}}>{room.status}</span></div>
            {room.guest && <div className="room-guest-name">👤 {room.guest}</div>}
            <div className="room-rate">{BDT(room.rate)}/night</div>
          </div>
        ))}
      </div>

      {selected && (
        <RoomModal
          room={selected} folios={folios} setFolios={setFolios}
          setRooms={setRooms} setGuests={setGuests} setTransactions={setTransactions}
          toast={toast} onClose={()=>setSelected(null)} currentUser={currentUser}
        />
      )}
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────
function Dashboard({ rooms, guests, reservations, tasks, transactions, setPage }) {
  const occ = rooms.filter(r=>r.status==="occupied").length;
  const avail = rooms.filter(r=>r.status==="available").length;
  const occPct = Math.round((occ/rooms.length)*100);
  // Group transactions by guest and date for today
  const rawTxns = [...transactions, ...ALL_TRANSACTIONS].filter(t => t.date === fmtDate(TODAY));
  const grouped = {};
  for (const t of rawTxns) {
    if (!t.guest) continue;
    const key = `${t.guest}__${t.date}`;
    if (!grouped[key]) {
      grouped[key] = { ...t, amount: 0, type: [], method: [], room: [], status: [], id: [], paid: 0, due: 0 };
    }
    grouped[key].amount += t.amount || 0;
    grouped[key].paid += t.paid || 0;
    grouped[key].due += t.due || 0;
    if (t.type && !grouped[key].type.includes(t.type)) grouped[key].type.push(t.type);
    if (t.method && !grouped[key].method.includes(t.method)) grouped[key].method.push(t.method);
    if (t.room && !grouped[key].room.includes(t.room)) grouped[key].room.push(t.room);
    if (t.status && !grouped[key].status.includes(t.status)) grouped[key].status.push(t.status);
    if (t.id && !grouped[key].id.includes(t.id)) grouped[key].id.push(t.id);
  }
  const todayTxns = Object.values(grouped).map(t => ({
    ...t,
    type: t.type.join(', '),
    method: t.method.join(', '),
    room: t.room.join(', '),
    status: t.status.join(', '),
    id: t.id.join(', '),
    paid: t.paid,
    due: t.due
  }));
  const todayRev = todayTxns.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0);
  const pendingTasks = tasks.filter(t=>t.status==="pending").length;
  const [chartActive, setChartActive] = useState(6);

  const monthData = [
    {m:"Sep",v:2720000},{m:"Oct",v:2960000},{m:"Nov",v:2460000},
    {m:"Dec",v:3580000},{m:"Jan",v:2090000},{m:"Feb",v:2860000},{m:"Mar",v:todayRev*8+1200000}
  ];

  return (
    <div>
      <div className="stats-row">
        {[
          {lbl:"Today's Revenue",  val:BDT(todayRev),    ico:"💰", sub:`${todayTxns.length} transactions`, chg:"+14%",  up:true,  ac:"#C8A96E"},
          {lbl:"Occupancy",        val:`${occPct}%`,      ico:"🛏️", sub:`${occ}/${rooms.length} rooms`,   chg:`${avail} avail`, up:true, ac:"#58A6FF"},
          {lbl:"In-House Guests",  val:guests.filter(g=>g.status==="checked-in").length, ico:"👥", sub:"Currently staying", chg:"2 arrivals", up:true, ac:"#2EC4B6"},
          {lbl:"Pending Tasks",    val:pendingTasks,      ico:"📋", sub:"Awaiting action", chg:`${tasks.filter(t=>t.priority==="high"&&t.status==="pending").length} high priority`, up:false, ac:"#E05C7A"},
        ].map(s=>(
          <div key={s.lbl} className="stat" style={{"--ac":s.ac}}>
            <div className="stat-ico">{s.ico}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-sub muted">{s.sub}</div>
            <div className={`stat-chg ${s.up?"up":"down"}`}>{s.up?"↑":"↓"} {s.chg}</div>
          </div>
        ))}
      </div>

      <div className="g3 mb4">
        <div className="card">
          <div className="card-hd"><span className="card-title">Revenue — BDT</span><Badge color="gold">7 months</Badge></div>
          <div className="card-body">
            <BarChart data={monthData} vk="v" lk="m" active={chartActive} onHover={setChartActive}/>
            <div className="flex fjb sm mt3"><span className="muted">{monthData[chartActive].m} 2026</span><span className="mono gold">{BDT(monthData[chartActive].v)}</span></div>
            <hr className="divider"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
              {[["RevPAR",BDT(7440)],["ADR",BDT(12480)],["Reservations",reservations.length]].map(([l,v])=>(
                <div key={l} style={{textAlign:"center",padding:"9px 6px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid var(--br2)"}}>
                  <div className="mono xs muted" style={{letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                  <div className="serif" style={{fontSize:18,fontWeight:700,color:"var(--gold)"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{display:"flex",flexDirection:"column"}}>
          <div className="card-hd"><span className="card-title">Occupancy</span></div>
          <div className="card-body" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
            <OccRing pct={occPct}/>
            <div style={{width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {[["Available",avail,"#3FB950"],["Occupied",occ,"#58A6FF"],["Housekeeping",rooms.filter(r=>r.status==="housekeeping").length,"#F0A500"],["Maintenance",rooms.filter(r=>r.status==="maintenance").length,"#E05C7A"]].map(([l,n,c])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"rgba(255,255,255,.02)",borderRadius:6}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}`,flexShrink:0}}/>
                  <span className="muted xs" style={{flex:1}}>{l}</span>
                  <span className="mono xs" style={{color:c}}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd"><span className="card-title">Upcoming Reservations</span><button className="btn btn-ghost btn-sm" onClick={()=>setPage("reservations")}>All →</button></div>
          <div className="card-body" style={{padding:"4px 16px"}}>
            {reservations.slice(0,5).map(r=>(
              <div key={r.id} className="g-row">
                <Av name={r.guest} size="sm"/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:500,color:"var(--tx)"}}>{r.guest}</div>
                  <div className="xs muted">Room {r.room} · {r.nights}N · {r.source}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div className="mono xs gold">{BDT(r.amount)}</div>
                  <StatusBadge status={r.status}/>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Housekeeping</span><button className="btn btn-ghost btn-sm" onClick={()=>setPage("housekeeping")}>All →</button></div>
          <div className="card-body" style={{padding:"4px 16px"}}>
            {tasks.filter(t=>t.status!=="completed").slice(0,5).map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 0",borderBottom:"1px solid var(--br2)"}}>
                <div className={`pdot ${t.priority}`}/>
                <div className="serif" style={{fontSize:19,fontWeight:700,width:34,flexShrink:0}}>{t.room}</div>
                <div style={{flex:1}}>
                  <div className="sm bold">{t.type}</div>
                  <div className="xs muted">{t.assignee} · {t.time}</div>
                </div>
                <StatusBadge status={t.status}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt4">
        <div className="card-hd">
          <span className="card-title">Today's Transactions</span>
          <div className="flex gap2"><Badge color="blue">{todayTxns.length}</Badge><button className="btn btn-ghost btn-sm" onClick={()=>setPage("reports")}>Full Report →</button></div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["ID","Guest","Type","Room","Amount","Method","Status","Time"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {todayTxns.slice(0,8).map(t=>(
                <tr key={t.id}>
                  <td className="mono xs muted">{t.id}</td>
                  <td><div className="flex fac gap2"><Av name={t.guest} size="sm"/><span className="sm">{t.guest}</span></div></td>
                  <td><Badge color="gold">{t.type}</Badge></td>
                  <td><Badge color="blue">{t.room}</Badge></td>
                  <td className="mono xs gold">{BDT(t.amount)}</td>
                  <td className="sm muted">{t.method}</td>
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

// ─── RESERVATIONS ───────────────────────────────────────────────
function ReservationsPage({ reservations, setReservations, rooms, guests, toast, currentUser }) {
  const [search, setSearch] = useState("");
  const [fs, setFs] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ guest:"", room:"", checkIn:"", checkOut:"", source:"Direct", notes:"" });

  const filtered = reservations.filter(r=>{
    const ms = r.guest.toLowerCase().includes(search.toLowerCase())||r.id.includes(search)||r.room.includes(search);
    return ms && (fs==="all"||r.status===fs);
  });

  function addRes() {
    if(!form.guest||!form.room||!form.checkIn||!form.checkOut) return toast("Fill all required fields","error");
    const nights = Math.max(1,nightsCount(form.checkIn,form.checkOut));
    const rm = rooms.find(r=>r.id===form.room);
    const nr = { id:`RES-${String(reservations.length+1).padStart(3,"0")}`, guestId:null, guest:form.guest, room:form.room, type:rm?.type||"Standard", checkIn:form.checkIn, checkOut:form.checkOut, nights, amount:nights*(rm?.rate||4500), paid:0, status:"pending", source:form.source, created:fmtDate(TODAY), notes:form.notes };
    setReservations(p=>[nr,...p]);
    toast(`Reservation created for ${form.guest}`,"success");
    setShowNew(false);
    setForm({ guest:"", room:"", checkIn:"", checkOut:"", source:"Direct", notes:"" });
  }

  const canEdit = ["superadmin","manager","receptionist"].includes(currentUser?.role);

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <div className="flex gap2" style={{flexWrap:"wrap"}}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search reservations..."/>
          <div className="tabs">
            {["all","confirmed","pending","cancelled"].map(s=>(
              <button key={s} className={`tab${fs===s?" active":""}`} onClick={()=>setFs(s)}>
                {s.charAt(0).toUpperCase()+s.slice(1)} ({reservations.filter(r=>s==="all"||r.status===s).length})
              </button>
            ))}
          </div>
        </div>
        {canEdit && <button className="btn btn-gold" onClick={()=>setShowNew(true)}>＋ New</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:15}}>
        {[{lbl:"Total",v:filtered.length,c:"#58A6FF"},{lbl:"Revenue",v:BDT(filtered.reduce((a,r)=>a+r.amount,0)),c:"#C8A96E"},{lbl:"Avg Value",v:filtered.length?BDT(Math.round(filtered.reduce((a,r)=>a+r.amount,0)/filtered.length)):"৳0",c:"#2EC4B6"}].map(s=>(
          <div key={s.lbl} className="stat" style={{"--ac":s.ac}}>
            <div className="stat-ico">{s.ico}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-sub muted">{s.sub}</div>
            <div className={`stat-chg ${s.up?"up":"down"}`}>{s.up?"↑":"↓"} {s.chg}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">Reservations</span><Badge color="blue">{filtered.length}</Badge></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["ID","Guest","Room","Check-In","Check-Out","Nights","Amount","Source","Status","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={10} style={{textAlign:"center",padding:28,color:"var(--tx3)"}}>No reservations found</td></tr>}
              {filtered.map(r=>(
                <tr key={r.id} style={{cursor:"pointer"}} onClick={()=>setSelected(r)}>
                  <td className="mono xs muted">{r.id}</td>
                  <td><div className="flex fac gap2"><Av name={r.guest} size="sm"/>{r.guest}</div></td>
                  <td><Badge color="blue">{r.room}</Badge></td>
                  <td className="mono xs">{r.checkIn}</td>
                  <td className="mono xs">{r.checkOut}</td>
                  <td style={{textAlign:"center"}}>{r.nights}</td>
                  <td className="mono xs gold">{BDT(r.amount)}</td>
                  <td><Badge color="gold">{r.source}</Badge></td>
                  <td><StatusBadge status={r.status}/></td>
                  <td onClick={e=>e.stopPropagation()}>
                    {canEdit && <div className="flex gap2">
                      {r.status==="pending" && <button className="btn btn-success btn-sm" onClick={()=>{setReservations(p=>p.map(x=>x.id===r.id?{...x,status:"confirmed"}:x));toast("Confirmed ✓","success");}}>Confirm</button>}
                      {r.status!=="cancelled" && <button className="btn btn-danger btn-sm" onClick={()=>{setReservations(p=>p.map(x=>x.id===r.id?{...x,status:"cancelled"}:x));toast("Cancelled","error");}}>Cancel</button>}
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <Modal title="New Reservation" onClose={()=>setShowNew(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button><button className="btn btn-gold" onClick={addRes}>Create</button></>}>
          <div className="fg"><label className="flbl">Guest Name *</label>
            <select className="fselect" value={form.guest} onChange={e=>setForm(p=>({...p,guest:e.target.value}))}>
              <option value="">Select guest...</option>{guests.map(g=><option key={g.id} value={g.name}>{g.name}{g.vip?" ★":""}</option>)}
            </select>
          </div>
          <div className="frow">
            <div className="fg"><label className="flbl">Room *</label>
              <select className="fselect" value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value}))}>
                <option value="">Select...</option>{rooms.filter(r=>r.status==="available").map(r=><option key={r.id} value={r.id}>Room {r.id} — {r.type} ({BDT(r.rate)}/n)</option>)}
              </select>
            </div>
            <div className="fg"><label className="flbl">Source</label>
              <select className="fselect" value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))}>
                {["Direct","Booking.com","Expedia","Airbnb","Corporate","Phone","Walk-in"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="flbl">Check-In *</label><input type="date" className="finput" value={form.checkIn} onChange={e=>setForm(p=>({...p,checkIn:e.target.value}))}/></div>
            <div className="fg"><label className="flbl">Check-Out *</label><input type="date" className="finput" value={form.checkOut} onChange={e=>setForm(p=>({...p,checkOut:e.target.value}))}/></div>
          </div>
          {form.checkIn&&form.checkOut&&form.room&&(()=>{const n=Math.max(0,nightsCount(form.checkIn,form.checkOut));const rate=rooms.find(r=>r.id===form.room)?.rate||0;return n>0?(<div style={{padding:"9px 12px",background:"rgba(200,169,110,.06)",borderRadius:7,border:"1px solid rgba(200,169,110,.15)",marginBottom:12}}><div className="flex fjb sm"><span className="muted">Nights</span><span className="mono gold">{n}</span></div><div className="flex fjb sm mt2"><span className="muted">Estimate</span><span className="mono gold">{BDT(n*rate)}</span></div></div>):null;})()}
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Special requests..."/></div>
        </Modal>
      )}
    </div>
  );
}

// ─── GUESTS ─────────────────────────────────────────────────────
function GuestsPage({ guests, setGuests, toast, currentUser }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", nationality:"Bangladesh", notes:"" });

  const filtered = guests.filter(g=>g.name.toLowerCase().includes(search.toLowerCase())||g.email.toLowerCase().includes(search.toLowerCase()));
  const canEdit = ["superadmin","manager","receptionist"].includes(currentUser?.role);

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search guests..."/>
        {canEdit && <button className="btn btn-gold" onClick={()=>setShowAdd(true)}>＋ Add Guest</button>}
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-hd"><span className="card-title">Guest Directory</span><Badge color="blue">{filtered.length}</Badge></div>
          <div className="card-body" style={{padding:"4px 16px"}}>
            {filtered.map(g=>(
              <div key={g.id} className="g-row" onClick={()=>{setSelected(g);setEditNotes(false);}} style={{background:selected?.id===g.id?"rgba(200,169,110,.04)":undefined}}>
                <Av name={g.name} size="md"/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:500,color:"var(--tx)",display:"flex",alignItems:"center",gap:5}}>
                    {g.name} {g.vip&&<span style={{color:"var(--gold)",fontSize:10}}>★ VIP</span>}
                  </div>
                  <div className="xs muted">{g.nationality} · {g.stays} stays · {g.room?`Room ${g.room}`:"Not in hotel"}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div className="mono xs gold">{g.loyalty.toLocaleString()} pts</div>
                  <StatusBadge status={g.status}/>
                </div>
              </div>
            ))}
            {filtered.length===0&&<div className="empty-state"><span>👤</span><span className="sm muted">No guests found</span></div>}
          </div>
        </div>
        <div className="card">
          {selected ? (
            <>
              <div className="card-hd"><span className="card-title">Profile</span><button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕</button></div>
              <div className="card-body">
                <div className="flex fac gap3 mb4">
                  <Av name={selected.name} size="lg"/>
                  <div style={{flex:1}}>
                    <div className="serif" style={{fontSize:18,fontWeight:700}}>{selected.name} {selected.vip&&<span style={{color:"var(--gold)",fontSize:13}}>★</span>}</div>
                    <div className="xs muted mt2">{selected.email}</div>
                    <div className="xs muted">{selected.phone}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                  {[["Stays",selected.stays],["Spent",BDT(selected.spent)],["Points",selected.loyalty.toLocaleString()]].map(([l,v])=>(
                    <div key={l} style={{textAlign:"center",padding:"9px 6px",background:"var(--s2)",borderRadius:8,border:"1px solid var(--br2)"}}>
                      <div className="mono xs muted" style={{letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                      <div className="serif" style={{fontSize:17,fontWeight:700,color:"var(--gold)"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div className="info-grid mb4">
                  {[["Nationality",selected.nationality],["Room",selected.room?`Room ${selected.room}`:"—"],["Status",selected.status],["Since",selected.joined]].map(([l,v])=>(
                    <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
                  ))}
                </div>
                <div className="mb4">
                  <div className="flex fac fjb mb2">
                    <div className="info-lbl">Notes</div>
                    {canEdit&&<button className="btn btn-ghost btn-sm" onClick={()=>{setEditNotes(!editNotes);setNotesVal(selected.notes);}}>{editNotes?"Cancel":"Edit"}</button>}
                  </div>
                  {editNotes?(
                    <div><textarea className="ftextarea" value={notesVal} onChange={e=>setNotesVal(e.target.value)}/>
                    <button className="btn btn-gold btn-sm mt2" onClick={()=>{setGuests(p=>p.map(g=>g.id===selected.id?{...g,notes:notesVal}:g));setEditNotes(false);toast("Notes saved","success");}}>Save</button></div>
                  ):(
                    <div style={{fontSize:12,color:"var(--tx2)",padding:"7px 10px",background:"var(--s2)",borderRadius:7,minHeight:38}}>{selected.notes||<em style={{color:"var(--tx3)"}}>No notes</em>}</div>
                  )}
                </div>
                {canEdit&&<div className="flex gap2" style={{flexWrap:"wrap"}}>
                  <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>{setGuests(p=>p.map(g=>g.id===selected.id?{...g,vip:!g.vip}:g));setSelected(p=>({...p,vip:!p.vip}));toast("VIP updated","success");}}>
                    {selected.vip?"Remove VIP":"★ Set VIP"}
                  </button>
                  <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>toast(`Message sent to ${selected.name}`,"success")}>✉ Message</button>
                </div>}
              </div>
            </>
          ):(
            <div className="empty-state" style={{minHeight:300}}><span>👤</span><span className="sm muted">Select a guest</span></div>
          )}
        </div>
      </div>

      {showAdd&&(
        <Modal title="Add Guest" onClose={()=>setShowAdd(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-gold" onClick={()=>{if(!form.name||!form.email)return toast("Name & email required","error");setGuests(p=>[{id:p.length+1,...form,room:null,status:"reserved",vip:false,stays:0,spent:0,loyalty:0,joined:fmtDate(TODAY)},...p]);toast(`${form.name} added`,"success");setShowAdd(false);setForm({name:"",email:"",phone:"",nationality:"Bangladesh",notes:""});}}>Add</button></>}>
          <div className="frow">
            <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Full name"/></div>
            <div className="fg"><label className="flbl">Nationality</label><input className="finput" value={form.nationality} onChange={e=>setForm(p=>({...p,nationality:e.target.value}))}/></div>
          </div>
          <div className="fg"><label className="flbl">Email *</label><input type="email" className="finput" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="email@example.com"/></div>
          <div className="fg"><label className="flbl">Phone</label><input className="finput" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+880-1700-000000"/></div>
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Preferences..."/></div>
        </Modal>
      )}
    </div>
  );
}

// ─── HOUSEKEEPING ───────────────────────────────────────────────
function HousekeepingPage({ tasks, setTasks, rooms, toast, currentUser }) {
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ room:"", type:"Cleaning", priority:"medium", assignee:"Sumaiya Begum", time:"09:00", notes:"" });
  const filtered = filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const canEdit = ["superadmin","manager","housekeeping"].includes(currentUser?.role);

  return (
    <div>
      <div className="stats-row">
        {[{l:"Total",v:tasks.length,ac:"#58A6FF"},{l:"Completed",v:tasks.filter(t=>t.status==="completed").length,ac:"#3FB950"},{l:"In Progress",v:tasks.filter(t=>t.status==="in-progress").length,ac:"#F0A500"},{l:"Pending",v:tasks.filter(t=>t.status==="pending").length,ac:"#E05C7A"}].map(s=>(
          <div key={s.l} className="stat" style={{"--ac":s.ac}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{color:s.ac,fontSize:24}}>{s.v}</div></div>
        ))}
      </div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <div className="tabs">
          {["all","pending","in-progress","completed"].map(s=>(
            <button key={s} className={`tab${filter===s?" active":""}`} onClick={()=>setFilter(s)}>
              {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")} ({s==="all"?tasks.length:tasks.filter(t=>t.status===s).length})
            </button>
          ))}
        </div>
        {canEdit&&<button className="btn btn-gold" onClick={()=>setShowAdd(true)}>＋ Add Task</button>}
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["Room","Task","Dept","Priority","Assigned","Time","Notes","Status","Action"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id}>
                  <td><span className="serif" style={{fontSize:21,fontWeight:700}}>{t.room}</span></td>
                  <td className="bold sm">{t.type}</td>
                  <td><Badge color={t.dept==="Maintenance"?"red":"blue"}>{t.dept}</Badge></td>
                  <td><div className="flex fac gap2"><div className={`pdot ${t.priority}`}/><span className="sm" style={{textTransform:"capitalize"}}>{t.priority}</span></div></td>
                  <td className="sm">{t.assignee}</td>
                  <td className="mono xs">{t.time}</td>
                  <td className="xs muted" style={{maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.notes||"—"}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td>
                    {canEdit&&<div className="flex gap2">
                      {t.status==="pending"&&<button className="btn btn-ghost btn-sm" onClick={()=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,status:"in-progress"}:x));toast("Task started","success");}}>Start</button>}
                      {t.status==="in-progress"&&<button className="btn btn-success btn-sm" onClick={()=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,status:"completed"}:x));toast("Task completed ✓","success");}}>✓ Done</button>}
                    </div>}
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:28,color:"var(--tx3)"}}>No tasks</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd&&(
        <Modal title="Add Task" onClose={()=>setShowAdd(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-gold" onClick={()=>{if(!form.room)return toast("Select room","error");setTasks(p=>[...p,{id:p.length+1,...form,dept:["AC Repair","Plumbing"].includes(form.type)?"Maintenance":"Housekeeping",status:"pending"}]);toast(`Task added for room ${form.room}`,"success");setShowAdd(false);setForm({room:"",type:"Cleaning",priority:"medium",assignee:"Sumaiya Begum",time:"09:00",notes:""});}}>Add</button></>}>
          <div className="frow">
            <div className="fg"><label className="flbl">Room *</label>
              <select className="fselect" value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value}))}>
                <option value="">Select...</option>{rooms.map(r=><option key={r.id} value={r.id}>Room {r.id} ({r.status})</option>)}
              </select>
            </div>
            <div className="fg"><label className="flbl">Task Type</label>
              <select className="fselect" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {["Cleaning","Deep Clean","Turndown","Inspection","VIP Setup","AC Repair","Plumbing","Extra Supplies"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fg"><label className="flbl">Priority</label><select className="fselect" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></div>
            <div className="fg"><label className="flbl">Assignee</label><select className="fselect" value={form.assignee} onChange={e=>setForm(p=>({...p,assignee:e.target.value}))}>{["Sumaiya Begum","Raju Mia","Kamal Dev","Rina Akter","Hasan Ali"].map(a=><option key={a}>{a}</option>)}</select></div>
          </div>
          <div className="fg"><label className="flbl">Time</label><input type="time" className="finput" value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}/></div>
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Instructions..."/></div>
        </Modal>
      )}
    </div>
  );
}

// ─── BILLING ────────────────────────────────────────────────────
function BillingPage({ guests, transactions, setTransactions, rooms, folios, setFolios, toast }) {
  const [sg, setSg] = useState(guests.find(g=>g.status==="checked-in"));
  const charges = sg ? (folios[sg.room]||[]) : [];
  const sub = charges.reduce((a,c)=>a+c.amt,0);
  const tax = Math.round(sub*0.07);
  const svc = Math.round(sub*0.05);
  const total = sub+tax+svc;
  const [showPay, setShowPay] = useState(false);
  const [payM, setPayM] = useState("Cash");
  const [payAmt, setPayAmt] = useState("");
  const [showCharge, setShowCharge] = useState(false);
  const [cf, setCf] = useState({type:"Room Service",amount:"",desc:""});

  function addCharge(){
    if(!cf.amount||isNaN(cf.amount))return toast("Valid amount required","error");
    setFolios(p=>({...p,[sg.room]:[...(p[sg.room]||[]),{id:Date.now(),desc:cf.desc||cf.type,amt:parseFloat(cf.amount),cat:cf.type}]}));
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:new Date().toTimeString().slice(0,5),guest:sg.name,type:cf.type,room:sg.room,amount:parseFloat(cf.amount),method:"Room Charge",status:"completed" },...p]);
    toast(`Charge added: ${BDT(cf.amount)}`,"success");
    setShowCharge(false);
    setCf({type:"Room Service",amount:"",desc:""});
  }

  function pay(){
    const amt=parseFloat(payAmt);
    if(!amt||amt<=0)return toast("Valid amount required","error");
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:new Date().toTimeString().slice(0,5),guest:sg.name,type:"Payment",room:sg.room,amount:amt,method:payM,status:"completed" },...p]);
    toast(`Payment ${BDT(amt)} via ${payM}`,"success");
    setShowPay(false);setPayAmt("");
  }

  return (
    <div className="g2">
      <div>
        <div className="card mb4">
          <div className="card-hd"><span className="card-title">Checked-In Guests</span></div>
          <div className="card-body" style={{padding:"4px 16px"}}>
            {guests.filter(g=>g.status==="checked-in").map(g=>(
              <div key={g.id} className="g-row" onClick={()=>setSg(g)} style={{background:sg?.id===g.id?"rgba(200,169,110,.05)":undefined}}>
                <Av name={g.name} size="sm"/>
                <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:500}}>{g.name}{g.vip&&<span style={{color:"var(--gold)",fontSize:10,marginLeft:5}}>★</span>}</div><div className="xs muted">Room {g.room}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Quick Charge</span></div>
          <div className="card-body">
            <div className="flex gap2" style={{flexWrap:"wrap"}}>
              {["Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Bar","Airport Transfer"].map(t=>(
                <button key={t} className="btn btn-ghost btn-sm" disabled={!sg} onClick={()=>{setCf(p=>({...p,type:t}));setShowCharge(true);}}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">Folio</span>
          {sg&&<div className="flex gap2"><Badge color="blue">Room {sg.room}</Badge><button className="btn btn-ghost btn-sm" onClick={()=>setShowCharge(true)}>＋</button></div>}
        </div>
        <div className="card-body">
          {sg?(
            <>
              <div className="flex fac gap3 mb4 pb4" style={{borderBottom:"1px solid var(--br2)"}}>
                <Av name={sg.name}/>
                <div><div className="bold sm">{sg.name}</div><div className="xs mono muted">Room {sg.room}</div></div>
              </div>
              {charges.map((c,i)=>(
                <div key={i} className="folio-row">
                  <span className="sm muted">{c.desc}</span>
                  <span className="mono xs gold">{BDT(c.amt)}</span>
                </div>
              ))}
              {charges.length===0&&<div style={{padding:"14px 0",color:"var(--tx3)",fontSize:12,textAlign:"center"}}>No charges</div>}
              <hr className="divider"/>
              <div className="folio-row"><span className="muted sm">Subtotal</span><span className="mono xs">{BDT(sub)}</span></div>
              <div className="folio-row"><span className="muted sm">VAT (7%)</span><span className="mono xs">{BDT(tax)}</span></div>
              <div className="folio-row"><span className="muted sm">Service (5%)</span><span className="mono xs">{BDT(svc)}</span></div>
              <div className="folio-total"><span>Total Due</span><span className="mono">{BDT(total)}</span></div>
              <div className="flex gap2 mt4" style={{flexWrap:"wrap"}}>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>toast("Invoice emailed","success")}>📧 Email</button>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>toast("Printing...","success")}>🖨 Print</button>
                <button className="btn btn-gold" style={{flex:"2",justifyContent:"center"}} onClick={()=>setShowPay(true)}>💳 Pay</button>
              </div>
            </>
          ):(
            <div className="empty-state" style={{minHeight:280}}><span>💰</span><span className="sm muted">Select a guest</span></div>
          )}
        </div>
      </div>

      {showCharge&&<Modal title="Add Charge" onClose={()=>setShowCharge(false)} footer={<><button className="btn btn-ghost" onClick={()=>setShowCharge(false)}>Cancel</button><button className="btn btn-gold" onClick={addCharge}>Add</button></>}>
        <div className="fg"><label className="flbl">Type</label><select className="fselect" value={cf.type} onChange={e=>setCf(p=>({...p,type:e.target.value}))}>{["Room Charge","Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Airport Transfer","Bar & Lounge","Gift Shop","Miscellaneous"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="flbl">Amount (BDT) *</label><input type="number" className="finput" value={cf.amount} onChange={e=>setCf(p=>({...p,amount:e.target.value}))} placeholder="0"/></div>
        <div className="fg"><label className="flbl">Description</label><input className="finput" value={cf.desc} onChange={e=>setCf(p=>({...p,desc:e.target.value}))} placeholder="Optional..."/></div>
      </Modal>}

      {showPay&&<Modal title="Process Payment" onClose={()=>setShowPay(false)} footer={<><button className="btn btn-ghost" onClick={()=>setShowPay(false)}>Cancel</button><button className="btn btn-gold" onClick={pay}>Confirm</button></>}>
        <div style={{padding:"10px 12px",background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",marginBottom:13}}>
          <div className="flex fjb sm"><span className="muted">Guest</span><span className="bold">{sg?.name}</span></div>
          <div className="flex fjb sm mt2"><span className="muted">Total Due</span><span className="mono gold">{BDT(total)}</span></div>
        </div>
        <div className="fg"><label className="flbl">Method</label><select className="fselect" value={payM} onChange={e=>setPayM(e.target.value)}>{["Cash","Credit Card","Debit Card","bKash","Nagad","Rocket","Bank Transfer","Corporate"].map(m=><option key={m}>{m}</option>)}</select></div>
        <div className="fg"><label className="flbl">Amount (BDT)</label><input type="number" className="finput" value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder={total}/></div>
        <div className="flex gap2 mt2">{[total,Math.round(total/2),10000,5000].map(a=><button key={a} className="btn btn-ghost btn-sm" onClick={()=>setPayAmt(a.toString())}>{BDT(a)}</button>)}</div>
      </Modal>}
    </div>
  );
}

// ─── REPORTS ────────────────────────────────────────────────────
function ReportsPage({ transactions, rooms, reservations, guests }) {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState(fmtDate(TODAY));
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fMethod, setFMethod] = useState("all");
  const [chartActive, setChartActive] = useState(6);

  const all = [...transactions, ...ALL_TRANSACTIONS];
  const daily = all.filter(t=>t.date===date).filter(t=>search===""||t.guest.toLowerCase().includes(search.toLowerCase())||t.id.includes(search)).filter(t=>fType==="all"||t.type===fType).filter(t=>fMethod==="all"||t.method===fMethod).sort((a,b)=>b.time.localeCompare(a.time));
  const rev = daily.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0);
  const byType = {}; daily.forEach(t=>{if(t.status==="completed")byType[t.type]=(byType[t.type]||0)+t.amount;});
  const byMethod = {}; daily.forEach(t=>{if(t.status==="completed")byMethod[t.method]=(byMethod[t.method]||0)+t.amount;});

  const mData = Array.from({length:7},(_,i)=>{
    const d=addDays(TODAY,-(6-i)*30);
    const m=d.toLocaleDateString("en",{month:"short"});
    const v=all.filter(t=>t.date.startsWith(d.toISOString().slice(0,7))).reduce((a,t)=>a+(t.status==="completed"?t.amount:0),0)||(2000000+Math.random()*1500000);
    return {m,v:Math.round(v),occ:55+Math.floor(Math.random()*35)};
  });

  const types=[...new Set(all.map(t=>t.type))].sort();
  const methods=[...new Set(all.map(t=>t.method))].sort();

  return (
    <div>
      <div className="tabs mb4">
        {["daily","monthly","overview"].map(t=><button key={t} className={`tab${tab===t?" active":""}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
      </div>

      {tab==="daily"&&(
        <div>
          <div className="card mb4">
            <div className="card-body" style={{padding:13}}>
              <div className="flex fac gap3" style={{flexWrap:"wrap"}}>
                <div className="flex fac gap2"><span className="xs mono muted">DATE</span><input type="date" className="finput" style={{width:155}} value={date} onChange={e=>setDate(e.target.value)} max={fmtDate(TODAY)}/></div>
                <SearchBox value={search} onChange={setSearch} placeholder="Search..."/>
                <div className="flex fac gap2"><span className="xs muted">Type:</span><select className="fselect" style={{width:145,padding:"6px 28px 6px 9px"}} value={fType} onChange={e=>setFType(e.target.value)}><option value="all">All Types</option>{types.map(t=><option key={t}>{t}</option>)}</select></div>
                <div className="flex fac gap2"><span className="xs muted">Method:</span><select className="fselect" style={{width:145,padding:"6px 28px 6px 9px"}} value={fMethod} onChange={e=>setFMethod(e.target.value)}><option value="all">All Methods</option>{methods.map(m=><option key={m}>{m}</option>)}</select></div>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearch("");setFType("all");setFMethod("all");}}>Reset</button>
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:15}}>
            {[{lbl:"Transactions",v:daily.length,c:"#58A6FF"},{lbl:"Revenue",v:BDT(rev),c:"#C8A96E"},{lbl:"Avg",v:daily.filter(t=>t.status==="completed").length?BDT(Math.round(rev/Math.max(1,daily.filter(t=>t.status==="completed").length))):"৳0",c:"#2EC4B6"},{lbl:"Pending",v:BDT(daily.filter(t=>t.status==="pending").reduce((a,t)=>a+t.amount,0)),c:"#E05C7A"}].map(s=>(
              <div key={s.lbl} className="stat" style={{"--ac":s.c}}><div className="stat-lbl">{s.lbl}</div><div className="stat-val" style={{color:s.c,fontSize:24}}>{s.v}</div></div>
            ))}
          </div>

          {Object.keys(byType).length>0&&(
            <div className="g2 mb4">
              <div className="card">
                <div className="card-hd"><span className="card-title">By Category</span></div>
                <div className="card-body">
                  {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,a],i)=>(
                    <div key={t} style={{marginBottom:10}}>
                      <div className="flex fjb sm mb1"><span className="muted">{t}</span><span className="mono xs gold">{BDT(a)}</span></div>
                      <div className="progress-bar"><div className="progress-fill" style={{width:`${(a/Object.values(byType)[0])*100}%`,background:`hsl(${i*42},60%,55%)`}}/></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-hd"><span className="card-title">By Method</span></div>
                <div className="card-body">
                  {Object.entries(byMethod).sort((a,b)=>b[1]-a[1]).map(([m,a])=>(
                    <div key={m} style={{marginBottom:10}}>
                      <div className="flex fjb sm mb1"><span className="muted">{m}</span><span className="mono xs gold">{BDT(a)}</span></div>
                      <div className="progress-bar"><div className="progress-fill" style={{width:`${(a/rev)*100}%`,background:"var(--gold)"}}/></div>
                    </div>
                  ))}
                  {Object.keys(byMethod).length===0&&<div className="empty-state" style={{padding:20}}><span className="sm muted">No completed transactions</span></div>}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-hd">
              <span className="card-title">Daily Transactions — {date}</span>
              <div className="flex gap2"><Badge color="blue">{daily.length}</Badge><Badge color="gold">{BDT(rev)}</Badge></div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["TXN ID","Time","Guest","Type","Room","Amount","Method","Status"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {daily.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:28,color:"var(--tx3)"}}>No transactions for {date}</td></tr>}
                  {daily.map(t=>(
                    <tr key={t.id}>
                      <td className="mono xs muted">{t.id}</td>
                      <td className="mono xs">{t.time}</td>
                      <td><div className="flex fac gap2"><Av name={t.guest} size="sm"/><span className="sm">{t.guest}</span></div></td>
                      <td><Badge color="gold">{t.type}</Badge></td>
                      <td><Badge color="blue">{t.room}</Badge></td>
                      <td className="mono xs gold">{BDT(t.amount)}</td>
                      <td className="sm muted">{t.method}</td>
                      <td><StatusBadge status={t.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {daily.length>0&&<div style={{padding:"10px 16px",borderTop:"1px solid var(--br2)",display:"flex",justifyContent:"space-between"}}>
              <span className="xs muted">{daily.length} records · {daily.filter(t=>t.status==="completed").length} completed</span>
              <span className="mono xs gold">Total: {BDT(rev)}</span>
            </div>}
          </div>
        </div>
      )}

      {tab==="monthly"&&(
        <div>
          <div className="stats-row">
            {[{lbl:"This Month",v:BDT(mData[6].v),ac:"#C8A96E"},{lbl:"Avg Occupancy",v:`${Math.round(mData.reduce((a,d)=>a+d.occ,0)/7)}%`,ac:"#2EC4B6"},{lbl:"RevPAR",v:BDT(7440),ac:"#58A6FF"},{lbl:"ADR",v:BDT(12480),ac:"#3FB950"}].map(s=>(
              <div key={s.lbl} className="stat" style={{"--ac":s.ac}}><div className="stat-lbl">{s.lbl}</div><div className="stat-val" style={{color:s.ac,fontSize:22}}>{s.v}</div></div>
            ))}
          </div>
          <div className="g2 mt4">
            <div className="card"><div className="card-hd"><span className="card-title">Monthly Revenue (BDT)</span></div><div className="card-body"><BarChart data={mData} vk="v" lk="m" active={chartActive} onHover={setChartActive}/><div className="flex fjb sm mt3"><span className="muted">{mData[chartActive].m} 2026</span><span className="mono gold">{BDT(mData[chartActive].v)}</span></div></div></div>
            <div className="card"><div className="card-hd"><span className="card-title">Occupancy Trend</span></div><div className="card-body">{mData.map((d,i)=>(
              <div key={i} style={{marginBottom:11}}><div className="flex fjb sm mb1"><span className="muted">{d.m}</span><span className="mono xs" style={{color:"#2EC4B6"}}>{d.occ}%</span></div><div className="progress-bar"><div className="progress-fill" style={{width:`${d.occ}%`,background:"linear-gradient(90deg,#2EC4B6,#58A6FF)"}}/></div></div>
            ))}</div></div>
          </div>
          <div className="card mt4">
            <div className="card-hd"><span className="card-title">Monthly Summary</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["Month","Revenue","Occupancy","RevPAR","ADR","Reservations","Growth"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>{mData.map((d,i)=>{const prev=mData[i-1];const g=prev?((d.v-prev.v)/prev.v*100).toFixed(1):"—";return(
                  <tr key={i}>
                    <td className="bold">{d.m} 2026</td>
                    <td className="mono xs gold">{BDT(d.v)}</td>
                    <td style={{color:"#2EC4B6"}}>{d.occ}%</td>
                    <td className="mono xs">{BDT(Math.round(d.v/rooms.length/30))}</td>
                    <td className="mono xs">{BDT(Math.round(d.v/Math.max(1,Math.round(rooms.length*d.occ/100))))}</td>
                    <td>{5+Math.floor(Math.random()*12)}</td>
                    <td>{g!=="—"?<span className={parseFloat(g)>=0?"up":"down"}>{parseFloat(g)>=0?"↑":"↓"}{Math.abs(g)}%</span>:"—"}</td>
                  </tr>
                );})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab==="overview"&&(
        <div>
          <div className="g4 mb4">
            {[{lbl:"Total Guests",v:guests.length,c:"#2EC4B6"},{lbl:"Total Rooms",v:rooms.length,c:"#58A6FF"},{lbl:"Reservations",v:reservations.length,c:"#C8A96E"},{lbl:"Lifetime Revenue",v:BDT(all.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0)),c:"#3FB950"}].map(s=>(
              <div key={s.l} className="stat" style={{"--ac":s.c}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{color:s.c,fontSize:20}}>{s.v}</div></div>
            ))}
          </div>
          <div className="g2 mb4">
            <div className="card"><div className="card-hd"><span className="card-title">Room Type Performance</span></div><div className="card-body">
              {[["Standard",5,4500,50,"#3FB950"],["Deluxe",4,8500,75,"#58A6FF"],["Suite",3,18000,67,"#C8A96E"],["Presidential",2,45000,50,"#E05C7A"]].map(([t,c,r,o,col])=>(
                <div key={t} style={{marginBottom:13}}><div className="flex fjb sm mb1"><span className="bold">{t}</span><span className="mono xs" style={{color:col}}>{o}%</span></div><div className="flex fjb xs muted mb1"><span>{c} rooms · {BDT(r)}/night</span><span className="gold">RevPAR: {BDT(Math.round(r*o/100))}</span></div><div className="progress-bar"><div className="progress-fill" style={{width:`${o}%`,background:col}}/></div></div>
              ))}
            </div></div>
            <div className="card"><div className="card-hd"><span className="card-title">Booking Sources</span></div><div className="card-body">
              {[["Direct",35,"#C8A96E"],["Booking.com",28,"#58A6FF"],["Expedia",18,"#2EC4B6"],["Corporate",12,"#3FB950"],["Airbnb",7,"#9B72CF"]].map(([s,p,c])=>(
                <div key={s} style={{marginBottom:12}}><div className="flex fjb sm mb1"><span className="muted">{s}</span><span className="mono xs" style={{color:c}}>{p}%</span></div><div className="progress-bar"><div className="progress-fill" style={{width:`${p}%`,background:c}}/></div></div>
              ))}
            </div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS ───────────────────────────────────────────────────
function SettingsPage({ toast, currentUser }) {
  const [settings, setSettings] = useState({
    hotelName:"Hotel Fountain", country:"Bangladesh", city:"Dhaka",
    currency:"BDT", currencySymbol:"৳", timezone:"Asia/Dhaka (UTC +06:00)",
    checkInTime:"14:00", checkOutTime:"12:00",
    taxRate:"7", serviceCharge:"5",
    emailNotif:true, smsNotif:true, autoAssign:false, maintenanceAlerts:true,
    language:"English (Bangladesh)",
  });

  const canEdit = currentUser?.role === "superadmin";

  return (
    <div style={{maxWidth:700}}>
      {!canEdit && <div style={{background:"rgba(224,92,122,.08)",border:"1px solid rgba(224,92,122,.2)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12.5,color:"var(--rose)"}}>⚠️ You have read-only access to settings. Contact Super Admin to make changes.</div>}

      {/* Hotel Info */}
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">🏨 Hotel Information</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="fg"><label className="flbl">Hotel Name</label><input className="finput" value={settings.hotelName} onChange={e=>setSettings(p=>({...p,hotelName:e.target.value}))} disabled={!canEdit}/></div>
            <div className="fg"><label className="flbl">Country</label>
              <select className="fselect" value={settings.country} onChange={e=>setSettings(p=>({...p,country:e.target.value}))} disabled={!canEdit}>
                <option>Bangladesh</option><option>India</option><option>UAE</option><option>Singapore</option><option>UK</option><option>USA</option>
              </select>
            </div>
            <div className="fg"><label className="flbl">City</label>
              <select className="fselect" value={settings.city} onChange={e=>setSettings(p=>({...p,city:e.target.value}))} disabled={!canEdit}>
                <option>Dhaka</option><option>Chittagong</option><option>Sylhet</option><option>Rajshahi</option><option>Khulna</option>
              </select>
            </div>
            <div className="fg"><label className="flbl">Currency</label>
              <select className="fselect" value={settings.currency} onChange={e=>setSettings(p=>({...p,currency:e.target.value,currencySymbol:e.target.value==="BDT"?"৳":e.target.value==="USD"?"$":e.target.value==="EUR"?"€":"£"}))} disabled={!canEdit}>
                <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
                <option value="GBP">GBP — Pound (£)</option>
                <option value="AED">AED — UAE Dirham</option>
              </select>
            </div>
            <div className="fg"><label className="flbl">Timezone</label>
              <select className="fselect" value={settings.timezone} onChange={e=>setSettings(p=>({...p,timezone:e.target.value}))} disabled={!canEdit}>
                <option>Asia/Dhaka (UTC +06:00)</option>
                <option>Asia/Kolkata (UTC +05:30)</option>
                <option>Asia/Dubai (UTC +04:00)</option>
                <option>Europe/London (UTC +00:00)</option>
                <option>America/New_York (UTC -05:00)</option>
              </select>
            </div>
            <div className="fg"><label className="flbl">Language</label>
              <select className="fselect" value={settings.language} onChange={e=>setSettings(p=>({...p,language:e.target.value}))} disabled={!canEdit}>
                <option>English (Bangladesh)</option><option>বাংলা</option><option>Arabic</option><option>French</option>
              </select>
            </div>
          </div>
          {/* Preview */}
          <div style={{padding:"10px 13px",background:"rgba(200,169,110,.05)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",marginTop:4}}>
            <div className="xs muted mono mb2">CURRENT CONFIGURATION</div>
            <div className="flex gap4" style={{flexWrap:"wrap"}}>
              {[["Country",settings.country],["City",settings.city],["Currency",settings.currency+" ("+settings.currencySymbol+")"],["Timezone",settings.timezone]].map(([l,v])=>(
                <div key={l}><div className="xs muted">{l}</div><div className="sm gold bold">{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Operations */}
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">⚙️ Operations</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="fg"><label className="flbl">Check-In Time</label><input type="time" className="finput" value={settings.checkInTime} onChange={e=>setSettings(p=>({...p,checkInTime:e.target.value}))} disabled={!canEdit}/></div>
            <div className="fg"><label className="flbl">Check-Out Time</label><input type="time" className="finput" value={settings.checkOutTime} onChange={e=>setSettings(p=>({...p,checkOutTime:e.target.value}))} disabled={!canEdit}/></div>
            <div className="fg"><label className="flbl">VAT Rate (%)</label><input type="number" className="finput" value={settings.taxRate} onChange={e=>setSettings(p=>({...p,taxRate:e.target.value}))} disabled={!canEdit}/></div>
            <div className="fg"><label className="flbl">Service Charge (%)</label><input type="number" className="finput" value={settings.serviceCharge} onChange={e=>setSettings(p=>({...p,serviceCharge:e.target.value}))} disabled={!canEdit}/></div>
          </div>
        </div>
      </div>

      {/* User Roles */}
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">👥 User Roles & Access</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Access Level</th><th>Pages</th></tr></thead>
            <tbody>
              {USERS.map(u=>(
                <tr key={u.id}>
                  <td><div className="flex fac gap2"><div className="av av-sm" style={{background:`linear-gradient(135deg,${avColor(u.name)},rgba(0,0,0,.4))`}}>{u.avatar}</div>{u.name}</div></td>
                  <td className="mono xs muted">{u.email}</td>
                  <td><span className="badge" style={{background:`rgba(${avColor(u.name).slice(1).match(/../g).map(x=>parseInt(x,16)).join(",")},0.12)`,color:avColor(u.name),border:`1px solid ${avColor(u.name)}44`}}>{ROLES[u.role]?.label}</span></td>
                  <td className="sm muted">{ROLES[u.role]?.pages.length} modules</td>
                  <td className="xs muted">{ROLES[u.role]?.pages.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notifications */}
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">🔔 Notifications</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["emailNotif","Email Notifications"],["smsNotif","SMS Notifications"],["autoAssign","Auto-assign Housekeeping"],["maintenanceAlerts","Maintenance Alerts"]].map(([k,l])=>(
              <div key={k}>
                <div className="flbl">{l}</div>
                <div className="toggle-wrap">
                  <div className="toggle" style={{background:settings[k]?"var(--gold)":"var(--s3)"}} onClick={()=>canEdit&&setSettings(p=>({...p,[k]:!p[k]}))}>
                    <div className="toggle-knob" style={{left:settings[k]?18:3}}/>
                  </div>
                  <span className="sm muted">{settings[k]?"Enabled":"Disabled"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex gap2">
          <button className="btn btn-ghost">Reset Defaults</button>
          <button className="btn btn-gold" onClick={()=>toast("Settings saved","success")}>💾 Save Settings</button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage]               = useState("dashboard");
  const [rooms, setRooms]             = useState(INIT_ROOMS);
  const [guests, setGuests]           = useState(INIT_GUESTS);
  const [reservations, setReservations] = useState(INIT_RESERVATIONS);
  const [tasks, setTasks]             = useState(INIT_TASKS);
  const [transactions, setTransactions] = useState([]);
  const [folios, setFolios]           = useState(INIT_FOLIOS);
  const [toastMsg, setToastMsg]       = useState(null);
  const [notifOpen, setNotifOpen]     = useState(false);
  const toastRef                      = useRef();

  const toast = useCallback((msg, type="success") => {
    setToastMsg({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  if (!currentUser) return (
    <>
      <style>{STYLES}</style>
      <LoginPage onLogin={user => { setCurrentUser(user); toast(`Welcome back, ${user.name}!`, "success"); }} />
      {toastMsg && <div className={`toast${toastMsg.type==="error"?" error":toastMsg.type==="info"?" info":""}`}>{toastMsg.type==="error"?"⚠️":"✓"} {toastMsg.msg}</div>}
    </>
  );

  const allowedPages = ROLES[currentUser.role]?.pages || [];
  const currentPage = allowedPages.includes(page) ? page : allowedPages[0];

  const pendingRes   = reservations.filter(r=>r.status==="pending").length;
  const pendingTasks = tasks.filter(t=>t.status==="pending"&&t.priority==="high").length;

  const NAV = [
    { id:"dashboard",    ico:"⬡", label:"Dashboard",        section:"OVERVIEW" },
    { id:"rooms",        ico:"▦", label:"Room Management" },
    { id:"reservations", ico:"◈", label:"Reservations",      badge:pendingRes },
    { id:"guests",       ico:"◉", label:"Guests & CRM" },
    { id:"housekeeping", ico:"✦", label:"Housekeeping",      badge:pendingTasks, section:"OPERATIONS" },
    { id:"billing",      ico:"◎", label:"Billing & Invoices" },
    { id:"reports",      ico:"▣", label:"Reports",           section:"ANALYTICS" },
    { id:"settings",     ico:"◌", label:"Settings",          section:"SYSTEM" },
  ].filter(n => allowedPages.includes(n.id));

  const TITLES = { dashboard:"Dashboard", rooms:"Room Management", reservations:"Reservations", guests:"Guest CRM", housekeeping:"Housekeeping", billing:"Billing & Invoices", reports:"Reports & Analytics", settings:"Settings" };

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">
        <aside className="sidebar">
          <div className="s-logo">
            <div style={{fontSize:22,marginBottom:5}}>🏨</div>
            <div className="s-logo-name">Hotel Fountain</div>
            <div className="s-logo-ver">DHAKA, BANGLADESH · V5.2.0</div>
          </div>
          <nav className="s-nav">
            {NAV.map(item=>(
              <div key={item.id}>
                {item.section&&<div className="s-sect">{item.section}</div>}
                <div className={`s-item${currentPage===item.id?" active":""}`} onClick={()=>setPage(item.id)}>
                  <span className="ico">{item.ico}</span>
                  <span>{item.label}</span>
                  {item.badge>0&&<span className="s-badge">{item.badge}</span>}
                </div>
              </div>
            ))}
          </nav>
          <div className="s-user">
            <div className="s-u-av" style={{background:`linear-gradient(135deg,${avColor(currentUser.name)},rgba(0,0,0,.4))`}}>{currentUser.avatar}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="s-u-name">{currentUser.name}</div>
              <div className="s-u-role" style={{color:ROLES[currentUser.role]?.color}}>{ROLES[currentUser.role]?.label}</div>
            </div>
            <button style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13,padding:4}} onClick={()=>setCurrentUser(null)} title="Sign out">⏻</button>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="tb-title">{TITLES[currentPage]}</div>
            <div className="tb-meta mono">Dhaka, Bangladesh · UTC+06:00 · {TODAY.toLocaleDateString("en-BD",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</div>

            {/* Notification Bell */}
            <div style={{position:"relative"}}>
              <button className="btn btn-ghost btn-icon" onClick={()=>setNotifOpen(!notifOpen)}>
                🔔
                {(pendingRes+pendingTasks)>0&&<span style={{position:"absolute",top:4,right:4,width:7,height:7,borderRadius:"50%",background:"var(--rose)",boxShadow:"0 0 5px var(--rose)"}}/>}
              </button>
              {notifOpen&&(
                <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:270,background:"var(--s1)",border:"1px solid var(--br)",borderRadius:10,boxShadow:"0 16px 48px rgba(0,0,0,.5)",zIndex:50}}>
                  <div style={{padding:"11px 15px",borderBottom:"1px solid var(--br2)",fontFamily:"Cormorant Garamond,serif",fontSize:14,fontWeight:600}}>Notifications</div>
                  <div style={{maxHeight:240,overflowY:"auto"}}>
                    {pendingRes>0&&<div style={{padding:"9px 15px",borderBottom:"1px solid var(--br2)",fontSize:12,color:"var(--tx2)"}}>📅 {pendingRes} pending reservation{pendingRes>1?"s":""}</div>}
                    {pendingTasks>0&&<div style={{padding:"9px 15px",borderBottom:"1px solid var(--br2)",fontSize:12,color:"var(--tx2)"}}>⚠️ {pendingTasks} high-priority task{pendingTasks>1?"s":""}</div>}
                    {tasks.filter(t=>t.status==="in-progress").map(t=><div key={t.id} style={{padding:"9px 15px",borderBottom:"1px solid var(--br2)",fontSize:12,color:"var(--tx2)"}}>🧹 Room {t.room}: {t.type} in progress</div>)}
                    {(pendingRes+pendingTasks)===0&&tasks.filter(t=>t.status==="in-progress").length===0&&<div style={{padding:"18px 15px",textAlign:"center",color:"var(--tx3)",fontSize:12}}>All clear!</div>}
                  </div>
                </div>
              )}
            </div>
            {allowedPages.includes("settings")&&<button className="btn btn-ghost btn-icon" onClick={()=>setPage("settings")}>⚙</button>}
          </div>

          <div className="content" onClick={()=>notifOpen&&setNotifOpen(false)}>
            {currentPage==="dashboard"    && <Dashboard rooms={rooms} guests={guests} reservations={reservations} tasks={tasks} transactions={transactions} setPage={setPage}/>}
            {currentPage==="rooms"        && <RoomsPage rooms={rooms} setRooms={setRooms} folios={folios} setFolios={setFolios} guests={guests} setGuests={setGuests} setTransactions={setTransactions} toast={toast} currentUser={currentUser}/>}
            {currentPage==="reservations" && <ReservationsPage reservations={reservations} setReservations={setReservations} rooms={rooms} guests={guests} toast={toast} currentUser={currentUser}/>}
            {currentPage==="guests"       && <GuestsPage guests={guests} setGuests={setGuests} toast={toast} currentUser={currentUser}/>}
            {currentPage==="housekeeping" && <HousekeepingPage tasks={tasks} setTasks={setTasks} rooms={rooms} toast={toast} currentUser={currentUser}/>}
            {currentPage==="billing"      && <BillingPage guests={guests} transactions={transactions} setTransactions={setTransactions} rooms={rooms} folios={folios} setFolios={setFolios} toast={toast}/>}
            {currentPage==="reports"      && <ReportsPage transactions={transactions} rooms={rooms} reservations={reservations} guests={guests}/>}
            {currentPage==="settings"     && <SettingsPage toast={toast} currentUser={currentUser}/>}
          </div>
        </main>
      </div>

      {toastMsg&&<div className={`toast${toastMsg.type==="error"?" error":toastMsg.type==="info"?" info":""}`}>{toastMsg.type==="error"?"⚠️":"✓"} {toastMsg.msg}</div>}
    </>
  );
}
