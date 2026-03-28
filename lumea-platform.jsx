import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   LUMEA — THE PULSE OF MODERN HOSPITALITY + CRM V5.2.0
   Multi-tenant · Role-Based · Stripe Subscription · Full Modules
═══════════════════════════════════════════════════════════════════════ */

// ─── CONSTANTS ────────────────────────────────────────────────────────
const TODAY = new Date("2026-03-09");
const fmtDate = d => d.toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const BDT = n => `৳${Number(n).toLocaleString("en-BD")}`;
const USD = n => `$${Number(n).toFixed(2)}`;
const nowTime = () => new Date().toTimeString().slice(0,5);
const nightsCount = (ci, co) => Math.max(0, Math.round((new Date(co)-new Date(ci))/86400000));
const AVC = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500"];
const avColor = n => AVC[n ? n.charCodeAt(0) % AVC.length : 0];
const initials = n => n ? n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";

// ─── SAAS PLANS ──────────────────────────────────────────────────────
const PLANS = {
  starter:    { id:"starter",    name:"Starter",    price:29,  yr:23,  color:"#4A8CCA", rooms:30,  staff:3,  features:["30 rooms","3 staff accounts","Reservations & Billing","Guest profiles","Custom branding","Email support"] },
  pro:        { id:"pro",        name:"Pro",         price:79,  yr:63,  color:"#C8A96E", rooms:150, staff:15, features:["150 rooms","15 staff accounts","Everything in Starter","Analytics & Reports","Housekeeping module","Custom domain","Priority support"], highlight:true },
  enterprise: { id:"enterprise", name:"Enterprise",  price:199, yr:159, color:"#9B72CF", rooms:999, staff:99, features:["Unlimited rooms","Unlimited staff","Everything in Pro","Full white-label","API access","Dedicated SLA","Onboarding call"] },
};

// ─── CRM ROLES ────────────────────────────────────────────────────────
const ROLES = {
  superadmin:   { label:"Super Admin",        color:"#C8A96E", pages:["dashboard","rooms","reservations","guests","housekeeping","billing","reports","settings"] },
  manager:      { label:"General Manager",    color:"#2EC4B6", pages:["dashboard","rooms","reservations","guests","housekeeping","billing","reports"] },
  receptionist: { label:"Receptionist",       color:"#58A6FF", pages:["dashboard","rooms","reservations","guests","billing"] },
  housekeeping: { label:"Housekeeping Staff", color:"#F0A500", pages:["dashboard","housekeeping"] },
  accountant:   { label:"Accountant",         color:"#3FB950", pages:["dashboard","billing","reports"] },
};

// ─── DEMO CRM USERS ────────────────────────────────────────────────────
const HOTEL_USERS = [
  { id:1, name:"Rahim Uddin",    email:"admin@demo.com",        password:"admin123",    role:"superadmin",   avatar:"RU" },
  { id:2, name:"Karim Ahmed",    email:"manager@demo.com",      password:"manager123",  role:"manager",      avatar:"KA" },
  { id:3, name:"Nusrat Islam",   email:"front@demo.com",        password:"front123",    role:"receptionist", avatar:"NI" },
  { id:4, name:"Sumaiya Begum",  email:"hk@demo.com",           password:"house123",    role:"housekeeping", avatar:"SB" },
  { id:5, name:"Farhan Hossain", email:"accounts@demo.com",     password:"accounts123", role:"accountant",   avatar:"FH" },
];

// ─── SEED DATA ─────────────────────────────────────────────────────────
const INIT_ROOMS = [
  { id:"101", type:"Standard",     floor:1, status:"occupied",     rate:4500,  beds:"Queen", view:"Garden",    guest:"Ahmed Al-Rashid", checkIn:"2026-03-06", checkOut:"2026-03-10" },
  { id:"102", type:"Standard",     floor:1, status:"available",    rate:4500,  beds:"Twin",  view:"Garden",    guest:null },
  { id:"103", type:"Standard",     floor:1, status:"housekeeping", rate:4500,  beds:"King",  view:"Garden",    guest:null },
  { id:"104", type:"Standard",     floor:1, status:"maintenance",  rate:4500,  beds:"Queen", view:"Garden",    guest:null },
  { id:"105", type:"Standard",     floor:1, status:"available",    rate:4500,  beds:"Twin",  view:"Garden",    guest:null },
  { id:"201", type:"Deluxe",       floor:2, status:"occupied",     rate:8500,  beds:"King",  view:"Pool",      guest:"Sarah Mitchell",  checkIn:"2026-03-07", checkOut:"2026-03-12" },
  { id:"202", type:"Deluxe",       floor:2, status:"available",    rate:8500,  beds:"Queen", view:"Pool",      guest:null },
  { id:"203", type:"Deluxe",       floor:2, status:"occupied",     rate:8500,  beds:"King",  view:"City",      guest:"James Okonkwo",   checkIn:"2026-03-05", checkOut:"2026-03-09" },
  { id:"204", type:"Deluxe",       floor:2, status:"available",    rate:8500,  beds:"King",  view:"Pool",      guest:null },
  { id:"301", type:"Suite",        floor:3, status:"occupied",     rate:18000, beds:"King",  view:"Lake",      guest:"Lin Wei",         checkIn:"2026-03-08", checkOut:"2026-03-15" },
  { id:"302", type:"Suite",        floor:3, status:"housekeeping", rate:18000, beds:"King",  view:"Lake",      guest:null },
  { id:"303", type:"Suite",        floor:3, status:"available",    rate:18000, beds:"King",  view:"Panoramic", guest:null },
  { id:"401", type:"Presidential", floor:4, status:"occupied",     rate:45000, beds:"King",  view:"Panoramic", guest:"Elena Vasquez",   checkIn:"2026-03-01", checkOut:"2026-03-20" },
  { id:"402", type:"Presidential", floor:4, status:"available",    rate:45000, beds:"King",  view:"Panoramic", guest:null },
];

const INIT_FOLIOS = {
  "101":[{id:1,desc:"Room Charge (Standard · 2 nights)",amt:9000,cat:"Room"},{id:2,desc:"Room Service — Breakfast",amt:850,cat:"F&B"},{id:3,desc:"Minibar",amt:420,cat:"F&B"}],
  "201":[{id:1,desc:"Room Charge (Deluxe · 1 night)",amt:8500,cat:"Room"},{id:2,desc:"Spa Treatment",amt:3500,cat:"Spa"},{id:3,desc:"Laundry",amt:800,cat:"Service"},{id:4,desc:"Restaurant Dinner",amt:2200,cat:"F&B"}],
  "203":[{id:1,desc:"Room Charge (Deluxe · 3 nights)",amt:25500,cat:"Room"},{id:2,desc:"Airport Transfer",amt:2500,cat:"Transfer"}],
  "301":[{id:1,desc:"Room Charge (Suite)",amt:18000,cat:"Room"},{id:2,desc:"Welcome Package",amt:5000,cat:"Service"},{id:3,desc:"Room Service",amt:4200,cat:"F&B"}],
  "401":[{id:1,desc:"Room Charge (Presidential · 7 nights)",amt:315000,cat:"Room"},{id:2,desc:"Butler Service",amt:35000,cat:"Service"},{id:3,desc:"Fine Dining",amt:28000,cat:"F&B"},{id:4,desc:"Spa Package",amt:18000,cat:"Spa"}],
};

const INIT_GUESTS = [
  {id:1,name:"Ahmed Al-Rashid",email:"ahmed@example.com",phone:"+880-1711-123456",nationality:"Bangladesh",room:"101",status:"checked-in",vip:true, stays:12,spent:420000,loyalty:2800,joined:"2023-01-15",notes:"Prefers high floor. No smoking."},
  {id:2,name:"Sarah Mitchell", email:"sarah@example.com",phone:"+1-555-234-5678", nationality:"USA",        room:"201",status:"checked-in",vip:false,stays:3, spent:62000, loyalty:420, joined:"2025-03-10",notes:"Vegetarian meals only."},
  {id:3,name:"James Okonkwo",  email:"james@example.com",phone:"+234-80-345-6789",nationality:"Nigeria",    room:"203",status:"checked-in",vip:false,stays:1, spent:28000, loyalty:120, joined:"2026-02-20",notes:""},
  {id:4,name:"Lin Wei",        email:"lin@example.com",  phone:"+86-138-456-7890",nationality:"China",      room:"301",status:"checked-in",vip:true, stays:7, spent:290000,loyalty:1900,joined:"2024-06-05",notes:"Requests extra towels daily."},
  {id:5,name:"Elena Vasquez",  email:"elena@example.com",phone:"+34-600-567-8901",nationality:"Spain",      room:"401",status:"checked-in",vip:true, stays:18,spent:1230000,loyalty:8200,joined:"2022-09-12",notes:"Late checkout. Champagne on arrival."},
  {id:6,name:"Tariq Hassan",   email:"tariq@example.com",phone:"+880-1812-345678",nationality:"Bangladesh", room:null, status:"reserved",  vip:false,stays:2, spent:49000, loyalty:280, joined:"2025-07-18",notes:""},
  {id:7,name:"Priya Sharma",   email:"priya@example.com",phone:"+91-98-7654-3210",nationality:"India",      room:null, status:"reserved",  vip:false,stays:0, spent:0,     loyalty:0,   joined:"2026-03-01",notes:"First visit. Send welcome package."},
];

const INIT_RESERVATIONS = [
  {id:"RES-001",guest:"Ahmed Al-Rashid",room:"101",type:"Standard",    checkIn:"2026-03-06",checkOut:"2026-03-10",nights:4, amount:18000, paid:18000, status:"confirmed",source:"Direct",     created:"2026-02-20"},
  {id:"RES-002",guest:"Sarah Mitchell", room:"201",type:"Deluxe",      checkIn:"2026-03-07",checkOut:"2026-03-12",nights:5, amount:42500, paid:21250, status:"confirmed",source:"Booking.com",created:"2026-02-25"},
  {id:"RES-003",guest:"James Okonkwo",  room:"203",type:"Deluxe",      checkIn:"2026-03-05",checkOut:"2026-03-09",nights:4, amount:34000, paid:34000, status:"confirmed",source:"Expedia",    created:"2026-02-28"},
  {id:"RES-004",guest:"Lin Wei",        room:"301",type:"Suite",       checkIn:"2026-03-08",checkOut:"2026-03-15",nights:7, amount:126000,paid:63000, status:"confirmed",source:"Direct",     created:"2026-03-01"},
  {id:"RES-005",guest:"Elena Vasquez",  room:"401",type:"Presidential",checkIn:"2026-03-01",checkOut:"2026-03-20",nights:19,amount:855000,paid:855000,status:"confirmed",source:"Corporate",  created:"2026-02-10"},
  {id:"RES-006",guest:"Tariq Hassan",   room:"202",type:"Deluxe",      checkIn:"2026-03-15",checkOut:"2026-03-18",nights:3, amount:25500, paid:0,     status:"pending",  source:"Direct",     created:"2026-03-05"},
  {id:"RES-007",guest:"Priya Sharma",   room:"102",type:"Standard",    checkIn:"2026-03-11",checkOut:"2026-03-14",nights:3, amount:13500, paid:6750,  status:"pending",  source:"Airbnb",     created:"2026-03-06"},
];

const INIT_TASKS = [
  {id:1,room:"103",type:"Deep Clean",  priority:"high",  assignee:"Sumaiya Begum",dept:"Housekeeping",status:"in-progress",time:"09:00",notes:"Post checkout"},
  {id:2,room:"302",type:"Turndown",    priority:"medium",assignee:"Raju Mia",     dept:"Housekeeping",status:"pending",    time:"14:00",notes:"VIP room"},
  {id:3,room:"104",type:"AC Repair",   priority:"high",  assignee:"Kamal Dev",    dept:"Maintenance", status:"pending",    time:"10:30",notes:"Thermostat fault"},
  {id:4,room:"202",type:"Inspection",  priority:"low",   assignee:"Sumaiya Begum",dept:"Housekeeping",status:"completed",  time:"08:00",notes:"Pre-arrival"},
  {id:5,room:"401",type:"VIP Turndown",priority:"high",  assignee:"Raju Mia",     dept:"Housekeeping",status:"completed",  time:"07:30",notes:"Champagne + flowers"},
  {id:6,room:"301",type:"Extra Towels",priority:"medium",assignee:"Sumaiya Begum",dept:"Housekeeping",status:"pending",    time:"11:00",notes:"Guest request"},
];

function genTxns() {
  const t=[];
  const types=["Room Charge","Restaurant","Room Service","Spa","Minibar","Laundry","Airport Transfer","Parking","Bar & Lounge"];
  const names=["Ahmed Al-Rashid","Sarah Mitchell","James Okonkwo","Lin Wei","Elena Vasquez","Karim Bhuiyan","David Chen"];
  const methods=["Credit Card","Cash","bKash","Nagad","Bank Transfer"];
  let id=1;
  for(let i=29;i>=0;i--){
    const date=fmtDate(addDays(TODAY,-i));
    const count=4+Math.floor(Math.random()*8);
    for(let j=0;j<count;j++){
      const type=types[Math.floor(Math.random()*types.length)];
      t.push({id:`TXN-${String(id++).padStart(4,"0")}`,date,time:`${9+Math.floor(Math.random()*12)}:${String(Math.floor(Math.random()*60)).padStart(2,"0")}`,guest:names[Math.floor(Math.random()*names.length)],type,room:INIT_ROOMS[Math.floor(Math.random()*INIT_ROOMS.length)].id,amount:Math.round((Math.random()*18000+500)/100)*100,method:methods[Math.floor(Math.random()*methods.length)],status:"completed"});
    }
  }
  return t;
}
const SEED_TXN = genTxns();
const INIT_TOKENS = {};

// ────────────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ────────────────────────────────────────────────────────────────────────
const STYLES = `

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07090E;--s1:#0D1117;--s2:#131B26;--s3:#1F2A3A;
  --gold:#C8A96E;--gold2:#E8C97E;--gdim:rgba(200,169,110,0.1);
  --teal:#2EC4B6;--rose:#E05C7A;--sky:#58A6FF;--grn:#3FB950;--amb:#F0A500;--pur:#9B72CF;
  --tx:#EEE9E2;--tx2:#7A8BA5;--tx3:#3D4F65;
  --br:rgba(200,169,110,0.14);--br2:rgba(255,255,255,0.06);
  --r:10px;--sh:0 8px 32px rgba(0,0,0,.5);
}
html,body{height:100%;background:var(--bg);color:var(--tx);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(200,169,110,.2);border-radius:2px}
::selection{background:rgba(200,169,110,.2)}
.fraktur{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;letter-spacing:-.01em}
.playfair{font-family:'Helvetica Oblique',Helvetica,Arial,sans-serif}

/* ── LANDING PAGE ── */
.lp{min-height:100vh;background:var(--bg);overflow-x:hidden}
.lp-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 max(5vw,20px);height:64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(200,169,110,0.08);backdrop-filter:blur(12px);background:rgba(7,9,14,.85)}
.lp-nav-logo{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:26px;color:var(--gold);letter-spacing:.01em}
.lp-nav-links{display:flex;align-items:center;gap:28px}
.lp-nav-links a{font-size:13px;color:var(--tx2);cursor:pointer;transition:color .2s;text-decoration:none}
.lp-nav-links a:hover{color:var(--tx)}
.hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:80px 20px 60px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 90% 60% at 50% 40%,rgba(200,169,110,.06),transparent 70%),radial-gradient(ellipse 60% 40% at 20% 80%,rgba(46,196,182,.04),transparent 60%)}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,169,110,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(200,169,110,.025) 1px,transparent 1px);background-size:60px 60px}
.hero-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;background:rgba(200,169,110,.09);border:1px solid rgba(200,169,110,.2);font-size:11.5px;color:var(--gold);font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.06em;margin-bottom:22px}
.hero h1{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:clamp(42px,7vw,86px);line-height:1;color:var(--tx);letter-spacing:-.01em;position:relative;z-index:1}
.hero h1 span{color:var(--gold)}
.hero-sub{font-size:clamp(15px,2.2vw,18px);color:var(--tx2);max-width:560px;margin:18px auto 32px;line-height:1.7;position:relative;z-index:1}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative;z-index:1}
.hero-stat-row{display:flex;gap:40px;justify-content:center;margin-top:56px;position:relative;z-index:1;flex-wrap:wrap}
.hero-stat{text-align:center}
.hero-stat-val{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:36px;color:var(--gold)}
.hero-stat-lbl{font-size:11px;color:var(--tx3);font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.08em;margin-top:2px}

/* Features */
.section{padding:80px max(5vw,20px)}
.section-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:rgba(200,169,110,.07);border:1px solid rgba(200,169,110,.15);font-size:10px;color:var(--gold);font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;margin-bottom:16px}
.section-title{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:clamp(28px,4vw,46px);color:var(--tx);margin-bottom:12px}
.section-sub{font-size:15px;color:var(--tx2);max-width:500px;line-height:1.7;margin-bottom:48px}
.feat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.feat-card{background:var(--s1);border:1px solid var(--br);border-radius:14px;padding:22px;transition:all .3s;cursor:default}
.feat-card:hover{border-color:rgba(200,169,110,.3);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,.4)}
.feat-ico{font-size:26px;margin-bottom:12px}
.feat-title{font-size:14px;font-weight:600;color:var(--tx);margin-bottom:6px}
.feat-desc{font-size:12.5px;color:var(--tx2);line-height:1.7}

/* Pricing */
.price-toggle{display:inline-flex;background:var(--s2);border:1px solid var(--br2);border-radius:8px;padding:3px;gap:2px;margin-bottom:40px}
.price-toggle button{padding:7px 16px;border-radius:6px;font-size:12px;border:none;cursor:pointer;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;transition:all .2s;color:var(--tx2);background:transparent}
.price-toggle button.active{background:var(--s1);color:var(--tx);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.price-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;max-width:920px;margin:0 auto}
.price-card{background:var(--s1);border:1px solid var(--br);border-radius:16px;padding:28px;position:relative;transition:all .3s}
.price-card.highlight{border-color:rgba(200,169,110,.35);background:linear-gradient(135deg,rgba(200,169,110,.06),rgba(200,169,110,.02))}
.price-card:hover{transform:translateY(-4px);box-shadow:0 24px 80px rgba(0,0,0,.4)}
.price-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);padding:4px 14px;border-radius:20px;font-size:10px;font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.08em;white-space:nowrap}
.price-name{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:22px;color:var(--tx);margin-bottom:4px}
.price-tag{font-size:14px;color:var(--tx2);margin-bottom:16px}
.price-amount{display:flex;align-items:flex-end;gap:4px;margin-bottom:6px}
.price-amount .dollar{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:44px;color:var(--tx);line-height:1}
.price-amount .per{font-size:12px;color:var(--tx2);margin-bottom:8px}
.price-save{font-size:10.5px;color:var(--grn);font-family:'Helvetica Light',Helvetica,Arial,sans-serif;margin-bottom:18px;min-height:16px}
.price-feats{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.price-feats li{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--tx2)}
.price-feats li::before{content:'✓';color:var(--grn);font-size:10px;flex-shrink:0}

/* Testimonials */
.testi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.testi-card{background:var(--s1);border:1px solid var(--br);border-radius:14px;padding:22px}
.testi-stars{color:var(--gold);font-size:12px;margin-bottom:10px}
.testi-text{font-size:13px;color:var(--tx2);line-height:1.75;font-style:italic;margin-bottom:14px}
.testi-author{display:flex;align-items:center;gap:10px}

/* FAQ */
.faq-item{border-bottom:1px solid var(--br2);overflow:hidden}
.faq-q{width:100%;text-align:left;padding:16px 0;background:none;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;font-weight:500;color:var(--tx);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
.faq-a{font-size:13px;color:var(--tx2);line-height:1.75;padding-bottom:14px}

/* Footer */
.footer{border-top:1px solid var(--br);padding:40px max(5vw,20px);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}

/* ── AUTH SCREENS ── */
.auth-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px;position:relative}
.auth-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 30%,rgba(200,169,110,.05),transparent 70%);pointer-events:none}
.auth-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,169,110,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(200,169,110,.02) 1px,transparent 1px);background-size:48px 48px;pointer-events:none}
.auth-card{background:var(--s1);border:1px solid var(--br);border-radius:18px;padding:36px 32px;width:100%;max-width:460px;position:relative;z-index:1;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:fadeUp .4s ease}
.auth-logo{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:32px;color:var(--gold);text-align:center;margin-bottom:4px}
.auth-sub{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:.16em;color:var(--tx3);text-align:center;margin-bottom:24px;text-transform:uppercase}
.step-bar{display:flex;gap:4px;margin-bottom:24px}
.step-seg{height:3px;flex:1;border-radius:2px;transition:background .3s}
.plan-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:16px}
.plan-option{padding:14px;border-radius:10px;border:2px solid var(--br2);cursor:pointer;transition:all .2s}
.plan-option:hover{border-color:rgba(200,169,110,.25);background:var(--gdim)}
.plan-option.sel{border-color:var(--gold);background:rgba(200,169,110,.08)}
.plan-option-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.plan-option-name{font-weight:600;font-size:13.5px}
.plan-option-price{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:12px;color:var(--gold)}
.plan-option-tag{font-size:11px;color:var(--tx2)}

/* ── ONBOARDING ── */
.onboard-wrap{min-height:100vh;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px}
.onboard-card{background:var(--s1);border:1px solid var(--br);border-radius:18px;padding:36px 32px;width:100%;max-width:540px;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:fadeUp .4s ease}
.color-picker-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.color-swatch{width:32px;height:32px;border-radius:6px;cursor:pointer;border:2px solid transparent;transition:all .2s;flex-shrink:0}
.color-swatch.sel{border-color:var(--gold);transform:scale(1.15)}
.preview-banner{border-radius:10px;padding:16px 18px;margin-top:14px;transition:background .4s}

/* ── SAAS DASHBOARD ── */
.saas-app{display:flex;height:100vh;overflow:hidden;background:var(--bg)}
.saas-sidebar{width:240px;flex-shrink:0;background:var(--s1);border-right:1px solid var(--br);display:flex;flex-direction:column}
.saas-main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.s-logo{padding:18px 16px 14px;border-bottom:1px solid var(--br)}
.s-logo-name{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:22px;color:var(--gold);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-logo-ver{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:7.5px;color:var(--tx3);letter-spacing:.12em;margin-top:2px}
.s-trial-bar{margin:10px 12px;padding:9px 11px;border-radius:8px;background:rgba(240,165,0,.07);border:1px solid rgba(240,165,0,.2)}
.s-nav{flex:1;padding:8px 7px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.s-sect{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8px;letter-spacing:.17em;color:var(--tx3);padding:9px 10px 3px;text-transform:uppercase}
.s-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;cursor:pointer;transition:all .2s;font-size:12.5px;color:var(--tx2);border:1px solid transparent;user-select:none}
.s-item:hover{background:var(--gdim);color:var(--tx)}
.s-item.active{background:var(--gdim);color:var(--gold);border-color:rgba(200,169,110,.2);font-weight:500}
.s-item .ico{font-size:13px;width:17px;text-align:center;flex-shrink:0}
.s-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:9px;font-family:'Helvetica Light',Helvetica,Arial,sans-serif;padding:1px 6px;border-radius:10px}
.s-user{padding:11px 13px;border-top:1px solid var(--br);display:flex;align-items:center;gap:8px}
.s-u-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#07090E;flex-shrink:0}
.s-u-name{font-size:11.5px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar{height:50px;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--br);display:flex;align-items:center;padding:0 20px;gap:11px}
.tb-title{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:22px;color:var(--tx);flex:1;letter-spacing:.01em}
.tb-meta{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:9.5px;color:var(--tx2);letter-spacing:.05em;white-space:nowrap}
.content{flex:1;overflow-y:auto;padding:18px}

/* ── BILLING / SUBSCRIPTION SCREEN ── */
.sub-hero{background:linear-gradient(135deg,rgba(200,169,110,.08),rgba(200,169,110,.02));border:1px solid rgba(200,169,110,.18);border-radius:14px;padding:22px;margin-bottom:20px}
.plan-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:20px}
.plan-c{background:var(--s2);border:2px solid var(--br2);border-radius:12px;padding:20px;transition:all .2s}
.plan-c:hover{border-color:rgba(200,169,110,.25);transform:translateY(-2px)}
.plan-c.active-plan{border-color:var(--gold);background:rgba(200,169,110,.05)}

/* ── CRM INTERNAL STYLES ── */
.app{display:flex;height:100vh;overflow:hidden}
.sidebar{width:230px;flex-shrink:0;background:var(--s1);border-right:1px solid var(--br);display:flex;flex-direction:column}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.login-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.login-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 20% 30%,rgba(200,169,110,.07),transparent 60%),radial-gradient(ellipse 60% 80% at 80% 70%,rgba(46,196,182,.05),transparent 60%);pointer-events:none}
.login-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,169,110,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,169,110,.03) 1px,transparent 1px);background-size:50px 50px;pointer-events:none}
.login-card{background:var(--s1);border:1px solid var(--br);border-radius:16px;padding:38px;width:100%;max-width:440px;position:relative;z-index:1;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:fadeUp .4s ease}
.login-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:16px 0}
.role-pill{padding:8px 10px;border-radius:7px;border:1px solid var(--br2);background:transparent;cursor:pointer;transition:all .2s;text-align:center;color:var(--tx2);font-size:11.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
.role-pill:hover{background:var(--gdim);color:var(--tx)}
.role-pill.selected{border-color:var(--gold);background:rgba(200,169,110,.1);color:var(--gold)}
.role-pill .rp-ico{font-size:15px;margin-bottom:3px;display:block}
.role-pill .rp-lbl{font-size:9.5px;font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.05em;display:block}
.login-hint{background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.15);border-radius:7px;padding:9px 12px;font-size:11px;color:var(--tx2);margin-bottom:14px;line-height:1.6}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:17px}
.stat{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);padding:15px;position:relative;overflow:hidden;transition:all .25s}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac,var(--gold))}
.stat:hover{border-color:rgba(200,169,110,.3);transform:translateY(-2px);box-shadow:var(--sh)}
.stat-ico{font-size:18px;margin-bottom:8px}
.stat-lbl{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8.5px;letter-spacing:.12em;color:var(--tx2);text-transform:uppercase;margin-bottom:4px}
.stat-val{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:28px;color:var(--tx);line-height:1}
.stat-sub{font-size:11px;color:var(--tx2);margin-top:4px}
.stat-chg{font-size:10px;margin-top:2px}
.up{color:var(--grn)}.down{color:var(--rose)}
.card{background:var(--s1);border:1px solid var(--br);border-radius:var(--r);overflow:hidden}
.card-hd{padding:13px 17px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap}
.card-title{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:17px;color:var(--tx);letter-spacing:.01em}
.card-body{padding:15px}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:7px;font-size:12.5px;font-weight:500;cursor:pointer;border:none;transition:all .2s;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-gold{background:var(--gold);color:#07090E}
.btn-gold:hover:not(:disabled){background:var(--gold2);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--br2)}
.btn-ghost:hover:not(:disabled){background:var(--s2);color:var(--tx);border-color:var(--br)}
.btn-danger{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.btn-danger:hover:not(:disabled){background:rgba(224,92,122,.22)}
.btn-success{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.btn-success:hover:not(:disabled){background:rgba(63,185,80,.22)}
.btn-info{background:rgba(88,166,255,.12);color:var(--sky);border:1px solid rgba(88,166,255,.2)}
.btn-info:hover:not(:disabled){background:rgba(88,166,255,.22)}
.btn-sm{padding:5px 9px;font-size:11.5px}
.btn-icon{padding:6px 8px}
.btn-xl{padding:13px 24px;font-size:14px}
.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;font-size:9.5px;font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.04em;font-weight:500;white-space:nowrap}
.bg{background:rgba(63,185,80,.12);color:var(--grn);border:1px solid rgba(63,185,80,.2)}
.bb{background:rgba(88,166,255,.12);color:var(--sky);border:1px solid rgba(88,166,255,.2)}
.ba{background:rgba(240,165,0,.12);color:var(--amb);border:1px solid rgba(240,165,0,.2)}
.br2{background:rgba(224,92,122,.12);color:var(--rose);border:1px solid rgba(224,92,122,.2)}
.bgold{background:rgba(200,169,110,.12);color:var(--gold);border:1px solid rgba(200,169,110,.2)}
.bp{background:rgba(155,114,207,.12);color:var(--pur);border:1px solid rgba(155,114,207,.2)}
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8.5px;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase;padding:8px 11px;text-align:left;border-bottom:1px solid var(--br2);white-space:nowrap}
.tbl td{padding:9px 11px;border-bottom:1px solid var(--br2);font-size:12px;color:var(--tx);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(255,255,255,.012)}
.tbl-wrap{overflow-x:auto}
.rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:9px}
.room-card{border-radius:9px;padding:12px 10px;cursor:pointer;transition:all .2s;border:2px solid transparent;position:relative}
.room-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.35)}
.room-card.available{background:rgba(63,185,80,.09);border-color:rgba(63,185,80,.35)}
.room-card.occupied{background:rgba(88,166,255,.09);border-color:rgba(88,166,255,.35)}
.room-card.housekeeping{background:rgba(240,165,0,.09);border-color:rgba(240,165,0,.35)}
.room-card.maintenance{background:rgba(224,92,122,.09);border-color:rgba(224,92,122,.35)}
.room-no{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:30px;font-weight:700;line-height:1;margin-bottom:3px}
.room-card.available .room-no{color:var(--grn)}
.room-card.occupied .room-no{color:var(--sky)}
.room-card.housekeeping .room-no{color:var(--amb)}
.room-card.maintenance .room-no{color:var(--rose)}
.room-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.room-dot.available{background:var(--grn);box-shadow:0 0 6px var(--grn)}
.room-dot.occupied{background:var(--sky);box-shadow:0 0 6px var(--sky)}
.room-dot.housekeeping{background:var(--amb);box-shadow:0 0 6px var(--amb)}
.room-dot.maintenance{background:var(--rose);box-shadow:0 0 6px var(--rose)}
.room-tp{font-size:9px;color:var(--tx2);font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.05em;text-transform:uppercase}
.room-guest-name{font-size:9px;color:var(--tx2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic}
.room-rate{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:9.5px;color:var(--gold);margin-top:3px}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(5px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.modal{background:var(--s1);border:1px solid var(--br);border-radius:14px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,.65);animation:modalIn .25s ease}
.modal-wide{max-width:740px}
@keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.modal-hd{padding:15px 19px;border-bottom:1px solid var(--br2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--s1);z-index:1}
.modal-title{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:19px;color:var(--tx)}
.modal-close{background:none;border:none;color:var(--tx2);cursor:pointer;font-size:22px;line-height:1;padding:0;transition:color .2s}
.modal-close:hover{color:var(--tx)}
.modal-body{padding:19px}
.modal-ft{padding:12px 19px;border-top:1px solid var(--br2);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.fg{margin-bottom:12px}
.flbl{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8.5px;letter-spacing:.1em;color:var(--tx2);text-transform:uppercase;margin-bottom:5px;display:block}
.finput{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 10px;color:var(--tx);font-size:12.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;outline:none;transition:border-color .2s}
.finput:focus{border-color:rgba(200,169,110,.4)}
.finput:disabled{opacity:.5;cursor:not-allowed}
.fselect{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 10px;color:var(--tx);font-size:12.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%237A8BA5' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;padding-right:28px}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ftextarea{width:100%;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:8px 10px;color:var(--tx);font-size:12.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;outline:none;resize:vertical;min-height:66px;transition:border-color .2s}
.ftextarea:focus{border-color:rgba(200,169,110,.4)}
.tabs{display:flex;gap:2px;background:var(--s2);border-radius:8px;padding:3px;flex-wrap:wrap}
.tab{padding:6px 12px;border-radius:6px;font-size:11.5px;cursor:pointer;transition:all .2s;color:var(--tx2);border:none;background:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap}
.tab.active{background:var(--s1);color:var(--tx);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#07090E;flex-shrink:0}
.av-lg{width:42px;height:42px;font-size:14px}
.av-md{width:32px;height:32px;font-size:11px}
.av-sm{width:25px;height:25px;font-size:9.5px}
.g-row{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--br2);cursor:pointer;transition:padding-left .15s;border-radius:6px}
.g-row:last-child{border-bottom:none}
.g-row:hover{padding-left:5px}
.folio-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--br2);font-size:12px}
.folio-row:last-child{border-bottom:none}
.pdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.pdot.high{background:var(--rose);box-shadow:0 0 5px var(--rose)}
.pdot.medium{background:var(--amb);box-shadow:0 0 5px var(--amb)}
.pdot.low{background:var(--grn);box-shadow:0 0 5px var(--grn)}
.bar-chart{display:flex;align-items:flex-end;gap:5px;height:95px;padding:0 2px}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer}
.bar{width:100%;border-radius:3px 3px 0 0;transition:all .35s cubic-bezier(.4,0,.2,1);min-height:4px}
.bar-lbl{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8px;color:var(--tx3)}
.ring-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.ring-wrap svg{transform:rotate(-90deg)}
.ring-center{position:absolute;text-align:center}
.ring-pct{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif;font-size:24px;color:var(--gold);line-height:1}
.ring-lbl{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:7px;color:var(--tx3);letter-spacing:.1em}
.toast{position:fixed;bottom:18px;right:18px;background:var(--s1);border:1px solid rgba(200,169,110,.3);border-radius:10px;padding:11px 15px;box-shadow:0 20px 60px rgba(0,0,0,.55);z-index:999;display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--tx);animation:fadeUp .3s ease;max-width:310px}
.toast.error{border-color:rgba(224,92,122,.4)}
.toast.info{border-color:rgba(88,166,255,.4)}
.search{display:flex;align-items:center;gap:6px;background:var(--s2);border:1px solid var(--br2);border-radius:7px;padding:6px 10px;min-width:180px}
.search input{background:none;border:none;outline:none;color:var(--tx);font-size:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;flex:1;min-width:0}
.search input::placeholder{color:var(--tx3)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.g3{display:grid;grid-template-columns:2fr 1fr;gap:14px}
.flex{display:flex}.fac{align-items:center}.fjb{justify-content:space-between}
.gap2{gap:7px}.gap3{gap:10px}.gap4{gap:14px}
.mt2{margin-top:7px}.mt3{margin-top:10px}.mt4{margin-top:14px}.mt6{margin-top:20px}
.mb2{margin-bottom:7px}.mb4{margin-bottom:14px}
.mono{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;letter-spacing:.02em}.serif{font-family:'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif}
.gold{color:var(--gold)}.muted{color:var(--tx2)}.sm{font-size:11.5px}.xs{font-size:9.5px}
.w100{width:100%}.bold{font-weight:600}
.divider{border:none;border-top:1px solid var(--br2);margin:11px 0}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 18px;color:var(--tx3);gap:8px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.info-box{padding:9px 11px;background:var(--s2);border-radius:8px;border:1px solid var(--br2)}
.info-lbl{font-family:'Helvetica Light',Helvetica,Arial,sans-serif;font-size:8px;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase;margin-bottom:3px}
.info-val{font-size:12.5px;font-weight:500;color:var(--tx)}
.progress-bar{height:4px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden;margin-top:6px}
.progress-fill{height:100%;border-radius:3px;transition:width .6s ease}
.gsearch-wrap{position:relative}
.gsearch-list{position:absolute;top:calc(100% + 3px);left:0;right:0;background:var(--s2);border:1px solid var(--br);border-radius:8px;z-index:50;max-height:180px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.gsearch-item{padding:8px 11px;cursor:pointer;font-size:12.5px;transition:background .15s;display:flex;align-items:center;gap:8px}
.gsearch-item:hover{background:rgba(200,169,110,.08)}
.toggle{width:38px;height:21px;border-radius:11px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
.toggle-knob{position:absolute;top:3px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .2s}
.sync-dot{width:7px;height:7px;border-radius:50%;background:var(--grn);box-shadow:0 0 6px var(--grn);animation:pulse 2s infinite;flex-shrink:0}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes spin{to{transform:rotate(360deg)}}
`;

// ════════════════════════════════════════════════════════════════════════
// SHARED MINI COMPONENTS
// ════════════════════════════════════════════════════════════════════════
function Av({name, size="md", style={}}) {
  const s={sm:{width:25,height:25,fontSize:"9.5px"},md:{width:32,height:32,fontSize:"11px"},lg:{width:42,height:42,fontSize:"14px"}}[size]||{width:32,height:32,fontSize:"11px"};
  return <div className={`av av-${size}`} style={{background:`linear-gradient(135deg,${avColor(name)},rgba(0,0,0,.4))`,...s,...style}}>{initials(name)}</div>;
}

function Badge({children, color="gold"}) {
  const m={gold:"bgold",blue:"bb",green:"bg",amber:"ba",red:"br2",purple:"bp"};
  return <span className={`badge ${m[color]||"bgold"}`}>{children}</span>;
}

function StatusBadge({status}) {
  const m={confirmed:["bg","✓ Confirmed"],pending:["ba","⏳ Pending"],cancelled:["br2","✕ Cancelled"],"checked-in":["bb","● In-House"],"checked-out":["bgold","→ Checked Out"],"in-progress":["ba","⚙ In Progress"],completed:["bg","✓ Done"],reserved:["bb","◈ Reserved"]};
  const [cls,lbl]=m[status]||["bgold",status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

function OccRing({pct}) {
  const r=38, c=2*Math.PI*r, fill=c*(pct/100);
  return (
    <div className="ring-wrap">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="7"/>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--gold)" strokeWidth="7" strokeDasharray={`${fill} ${c-fill}`} strokeLinecap="round" style={{transition:"stroke-dasharray .6s ease"}}/>
      </svg>
      <div className="ring-center"><div className="ring-pct">{pct}%</div><div className="ring-lbl">OCC</div></div>
    </div>
  );
}

function BarChart({data, vk, lk, active, onHover}) {
  const max=Math.max(...data.map(d=>d[vk]),1);
  return (
    <div className="bar-chart">
      {data.map((d,i)=>(
        <div key={i} className="bar-col" onMouseEnter={()=>onHover(i)}>
          <div className="bar" style={{height:`${Math.max(4,(d[vk]/max)*84)}px`,background:i===active?"var(--gold)":"rgba(200,169,110,.25)"}}/>
          <span className="bar-lbl">{d[lk]}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({title, onClose, children, footer, wide=false}) {
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

function SearchBox({value, onChange, placeholder="Search..."}) {
  return (
    <div className="search">
      <span style={{color:"var(--tx3)",fontSize:12}}>⌕</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
      {value&&<span style={{color:"var(--tx3)",cursor:"pointer",fontSize:11}} onClick={()=>onChange("")}>×</span>}
    </div>
  );
}

function GuestSearch({guests, value, onChange, placeholder="Search guest..."}) {
  const [open,setOpen]=useState(false);
  const filtered=guests.filter(g=>g.name.toLowerCase().includes(value.toLowerCase())).slice(0,6);
  return (
    <div className="gsearch-wrap">
      <input className="finput" value={value} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder={placeholder}/>
      {open&&value&&filtered.length>0&&(
        <div className="gsearch-list">
          {filtered.map(g=>(
            <div key={g.id} className="gsearch-item" onClick={()=>{onChange(g.name);setOpen(false);}}>
              <Av name={g.name} size="sm"/>
              <div><div style={{fontSize:12.5}}>{g.name}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{g.nationality} · {g.email}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── LANDING PAGE
// ════════════════════════════════════════════════════════════════════════
function LandingPage({onSignup, onLogin}) {
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const features = [
    {ico:"🏨",title:"Room Management",desc:"Visual grid with real-time status. Check in/out, assign housekeeping, manage maintenance in one click."},
    {ico:"📅",title:"Smart Reservations",desc:"Multi-source booking with Booking.com, Expedia, Airbnb integration. Auto-conflict detection."},
    {ico:"👥",title:"Guest CRM",desc:"Full guest profiles, loyalty points, VIP flags, stay history and preferences at a glance."},
    {ico:"💰",title:"Billing & Folios",desc:"Per-room folios, automatic VAT/service charge, multiple payment methods, instant receipts."},
    {ico:"📊",title:"Reports & Analytics",desc:"Revenue charts, occupancy trends, RevPAR, ADR, daily closing reports with PDF export."},
    {ico:"🧹",title:"Housekeeping",desc:"Task assignment by priority, real-time status, maintenance alerts, staff scheduling."},
    {ico:"🎨",title:"Custom Branding",desc:"Your hotel name, logo and brand color. Full white-label — no Lumea branding shown to guests."},
    {ico:"🔒",title:"Role-Based Access",desc:"Super Admin, Manager, Receptionist, Housekeeping, Accountant — each with scoped permissions."},
  ];

  const testimonials = [
    {name:"Tariq Rahman",role:"GM — Dhaka Grand Hotel",stars:5,text:"We replaced 3 different tools with Lumea. Reservations, billing, housekeeping — all in one place. Our staff loved the role system."},
    {name:"Priya Nair",role:"Owner — Kolkata Heritage Inn",stars:5,text:"The custom branding is fantastic. Our guests see our logo everywhere. The trial was enough to convince us — signed up in 10 minutes."},
    {name:"Carlos Méndez",role:"Operations — Dubai Palms",stars:5,text:"Enterprise plan is worth every dollar. The API access lets us plug into our POS system. Support team is incredibly responsive."},
  ];

  const faqs = [
    {q:"Do I need a credit card for the free trial?",a:"No. You get 14 days free with full access. Credit card only required when you choose to upgrade."},
    {q:"Can I use my own hotel name and logo?",a:"Yes — all plans include custom branding. Pro and Enterprise support custom domains (e.g. crm.yourhotel.com)."},
    {q:"How does multi-tenancy work?",a:"Each hotel gets completely isolated data. Your guests, rooms, and transactions are never shared with or visible to other tenants."},
    {q:"Can I change plans later?",a:"Absolutely. Upgrade or downgrade anytime. Billing is prorated automatically."},
    {q:"What payment methods do you accept?",a:"All major credit/debit cards via Stripe. Invoicing available for Enterprise customers."},
  ];

  return (
    <div className="lp">
      <style>{STYLES}</style>
      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-nav-logo">Lumea</div>
        <div className="lp-nav-links">
          <a onClick={()=>document.getElementById('features')?.scrollIntoView({behavior:'smooth'})}>Features</a>
          <a onClick={()=>document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'})}>Pricing</a>
          <a style={{color:"var(--tx2)"}} onClick={onLogin}>Sign In</a>
          <button className="btn btn-gold btn-sm" onClick={onSignup}>Start Free Trial</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-grid"/>
        <div style={{position:"relative",zIndex:1}}>
          <div className="hero-pill">⚡ White-label · Multi-tenant · Custom domains</div>
          <h1>LUMEA</h1>
          <p className="hero-sub">One platform for every property — reservations, billing, housekeeping, guest CRM, and reporting. Fully multi-tenant, white-label, fully yours.</p>
          <div className="hero-cta">
            <button className="btn btn-gold btn-xl" onClick={onSignup}>Start 14-Day Free Trial →</button>
            <button className="btn btn-ghost btn-xl" onClick={onLogin}>Live Demo</button>
          </div>
          <div className="hero-stat-row">
            {[["1,200+","Hotels"],["98%","Uptime SLA"],["14 Days","Free Trial"],["5 min","Setup Time"]].map(([v,l])=>(
              <div key={l} className="hero-stat">
                <div className="hero-stat-val">{v}</div>
                <div className="hero-stat-lbl">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features" style={{background:"var(--s1)",borderTop:"1px solid var(--br)"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div className="section-badge">✦ Everything Included</div>
          <h2 className="section-title">Every module. Every role.<br/>One subscription.</h2>
          <p className="section-sub">Lumea powers properties of every size — from boutique to enterprise.</p>
          <div className="feat-grid">
            {features.map(f=>(
              <div key={f.title} className="feat-card">
                <div className="feat-ico">{f.ico}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div style={{maxWidth:1100,margin:"0 auto",textAlign:"center"}}>
          <div className="section-badge">◎ Simple Pricing</div>
          <h2 className="section-title" style={{marginBottom:10}}>Transparent. No surprises.</h2>
          <p className="section-sub" style={{margin:"0 auto 24px"}}>Start free — upgrade as you grow. No hidden fees.</p>
          <div className="price-toggle">
            <button className={!yearly?"active":""} onClick={()=>setYearly(false)}>Monthly</button>
            <button className={yearly?"active":""} onClick={()=>setYearly(true)}>Yearly <span style={{color:"var(--grn)",fontSize:10}}>Save 20%</span></button>
          </div>
          <div className="price-grid">
            {Object.values(PLANS).map(p=>(
              <div key={p.id} className={`price-card${p.highlight?" highlight":""}`}>
                {p.highlight&&<div className="price-badge" style={{background:"var(--gold)",color:"#07090E",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif"}}>Most Popular</div>}
                <div className="price-name" style={{color:p.color}}>{p.name}</div>
                <div className="price-tag">{p.id==="starter"?"Perfect for small hotels":p.id==="pro"?"Growing properties":"Unlimited scale"}</div>
                <div className="price-amount">
                  <span className="dollar">${yearly?p.yr:p.price}</span>
                  <span className="per">/mo</span>
                </div>
                <div className="price-save">{yearly?`Save $${(p.price-p.yr)*12}/year`:""}&nbsp;</div>
                <ul className="price-feats">{p.features.map(f=><li key={f}>{f}</li>)}</ul>
                <button className={`btn w100 btn-xl${p.highlight?" btn-gold":" btn-ghost"}`} style={{justifyContent:"center"}} onClick={onSignup}>Start Free Trial</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section" style={{background:"var(--s1)",borderTop:"1px solid var(--br)"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div className="section-badge">★ Testimonials</div>
          <h2 className="section-title">Trusted by hoteliers worldwide</h2>
          <div className="testi-grid">
            {testimonials.map(t=>(
              <div key={t.name} className="testi-card">
                <div className="testi-stars">{"★".repeat(t.stars)}</div>
                <div className="testi-text">"{t.text}"</div>
                <div className="testi-author">
                  <Av name={t.name} size="sm"/>
                  <div><div style={{fontSize:12.5,fontWeight:600,color:"var(--tx)"}}>{t.name}</div><div style={{fontSize:11,color:"var(--tx2)"}}>{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div className="section-badge">? FAQ</div>
          <h2 className="section-title">Common questions</h2>
          {faqs.map((f,i)=>(
            <div key={i} className="faq-item">
              <button className="faq-q" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                <span>{f.q}</span><span style={{color:"var(--gold)",flexShrink:0}}>{openFaq===i?"−":"+"}</span>
              </button>
              {openFaq===i&&<p className="faq-a">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{padding:"60px 20px",background:"linear-gradient(135deg,rgba(200,169,110,.08),rgba(200,169,110,.03))",borderTop:"1px solid rgba(200,169,110,.15)",borderBottom:"1px solid rgba(200,169,110,.15)",textAlign:"center"}}>
        <div className="fraktur" style={{fontSize:"clamp(13px,2.1vw,26px)",color:"var(--gold)",marginBottom:14,letterSpacing:".08em",textTransform:"uppercase"}}>The Pulse of Modern Hospitality</div>
        <p style={{color:"var(--tx2)",fontSize:15,marginBottom:28}}>Start free — full access for 14 days. No credit card required.</p>
        <button className="btn btn-gold btn-xl" onClick={onSignup}>Start Free with Lumea →</button>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="fraktur" style={{fontSize:22,color:"var(--gold)"}}>Lumea</div>
        <div style={{fontSize:12,color:"var(--tx2)"}}>© 2026 Lumea. All rights reserved.</div>
        <div style={{display:"flex",gap:16}}>
          <span style={{fontSize:12,color:"var(--tx3)",cursor:"pointer"}}>Privacy</span>
          <span style={{fontSize:12,color:"var(--tx3)",cursor:"pointer"}}>Terms</span>
        </div>
      </footer>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════
// ── SIGNUP FLOW (3 steps)
// ════════════════════════════════════════════════════════════════════════
function SignupFlow({onComplete, onLoginClick}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({name:"",email:"",password:"",hotelName:"",slug:"",plan:"pro"});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const F = k => e => { setForm(p=>({...p,[k]:e.target.value})); setErr(""); };
  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");

  function next() {
    if(step===1){
      if(!form.name||!form.email||!form.password) return setErr("All fields required.");
      if(form.password.length<6) return setErr("Password must be at least 6 characters.");
      setStep(2);
    } else if(step===2){
      if(!form.hotelName) return setErr("Hotel name required.");
      if(!form.slug) return setErr("URL slug required.");
      setStep(3);
    } else {
      setLoading(true);
      setTimeout(()=>{
        onComplete({...form, trialEnds: fmtDate(addDays(TODAY,14)), plan: form.plan, subStatus:"trialing"});
      }, 900);
    }
  }

  const stepColors = ["var(--gold)","var(--gold)","var(--gold)"];

  return (
    <div className="auth-bg">
      <style>{STYLES}</style>
      <div className="auth-grid"/>
      <div className="auth-card">
        <div className="auth-logo">Lumea</div>
        <div className="auth-sub">The Pulse of Modern Hospitality</div>

        {/* Step bar */}
        <div className="step-bar">
          {[1,2,3].map(s=>(
            <div key={s} className="step-seg" style={{background: s<=step?"var(--gold)":"var(--br2)"}}/>
          ))}
        </div>

        <div style={{fontSize:11,color:"var(--tx3)",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",letterSpacing:".08em",marginBottom:18}}>
          STEP {step} OF 3 — {["YOUR ACCOUNT","HOTEL DETAILS","CHOOSE PLAN"][step-1]}
        </div>

        {/* Step 1: Account */}
        {step===1&&(
          <>
            <div className="fg"><label className="flbl">Your Name</label><input className="finput" placeholder="Full name" value={form.name} onChange={F("name")}/></div>
            <div className="fg"><label className="flbl">Email Address</label><input className="finput" type="email" placeholder="you@hotel.com" value={form.email} onChange={F("email")}/></div>
            <div className="fg"><label className="flbl">Password</label><input className="finput" type="password" placeholder="Min 6 characters" value={form.password} onChange={F("password")}/></div>
          </>
        )}

        {/* Step 2: Hotel */}
        {step===2&&(
          <>
            <div className="fg">
              <label className="flbl">Hotel Name</label>
              <input className="finput" placeholder="e.g. Grand Palace Hotel" value={form.hotelName}
                onChange={e=>{setForm(p=>({...p,hotelName:e.target.value,slug:slugify(e.target.value)}));setErr("");}}/>
            </div>
            <div className="fg">
              <label className="flbl">Your CRM URL</label>
              <div style={{display:"flex",alignItems:"center",background:"var(--s2)",border:"1px solid var(--br2)",borderRadius:7,overflow:"hidden"}}>
                <span style={{padding:"0 10px",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:11,color:"var(--tx3)",borderRight:"1px solid var(--br2)",whiteSpace:"nowrap"}}>lumea.app/</span>
                <input className="finput" style={{border:"none",background:"transparent",borderRadius:0}} placeholder="your-hotel" value={form.slug}
                  onChange={e=>{setForm(p=>({...p,slug:slugify(e.target.value)}));setErr("");}}/>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Plan */}
        {step===3&&(
          <div className="plan-grid">
            {Object.values(PLANS).map(p=>(
              <div key={p.id} className={`plan-option${form.plan===p.id?" sel":""}`} onClick={()=>{setForm(prev=>({...prev,plan:p.id}));setErr("");}}>
                <div className="plan-option-top">
                  <span className="plan-option-name" style={{color:p.color}}>{p.name}</span>
                  <span className="plan-option-price">${p.price}/mo</span>
                </div>
                <div className="plan-option-tag">{p.features[0]} · {p.features[1]}</div>
              </div>
            ))}
            <div style={{fontSize:11.5,color:"var(--grn)",textAlign:"center",padding:"6px 0",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif"}}>✓ 14-day Lumea trial · No credit card required</div>
          </div>
        )}

        {err&&<div style={{background:"rgba(224,92,122,.1)",border:"1px solid rgba(224,92,122,.25)",borderRadius:7,padding:"8px 11px",fontSize:11.5,color:"var(--rose)",marginBottom:12}}>{err}</div>}

        <button className="btn btn-gold w100 btn-xl" style={{justifyContent:"center",marginTop:4}} disabled={loading} onClick={next}>
          {loading?"Setting up your Lumea CRM…":step<3?"Continue →":"Launch My Lumea CRM 🚀"}
        </button>

        {step>1&&<button className="btn btn-ghost w100" style={{justifyContent:"center",marginTop:8}} onClick={()=>setStep(s=>s-1)}>← Back</button>}

        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"var(--tx3)"}}>
          Already have an account? <span style={{color:"var(--gold)",cursor:"pointer"}} onClick={onLoginClick}>Sign in</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── ONBOARDING (brand color, currency, timezone)
// ════════════════════════════════════════════════════════════════════════
function OnboardingFlow({tenant, onComplete}) {
  const COLORS = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500","#FF6B6B","#4ECDC4","#A8E6CF"];
  const [color, setColor] = useState(COLORS[0]);
  const [currency, setCurrency] = useState("BDT");
  const [timezone, setTimezone] = useState("Asia/Dhaka");
  const [logo, setLogo] = useState("");

  return (
    <div className="onboard-wrap">
      <style>{STYLES}</style>
      <div className="onboard-card">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,marginBottom:6}}>🎨</div>
          <div className="fraktur" style={{fontSize:26,color:"var(--gold)"}}>Customize Your CRM</div>
          <div style={{fontSize:13,color:"var(--tx2)",marginTop:6}}>Set up your hotel's look and locale</div>
        </div>

        <div className="fg">
          <label className="flbl">Hotel Name (displayed in CRM)</label>
          <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:13,color:"var(--tx)",padding:"8px 10px",background:"var(--s2)",borderRadius:7,border:"1px solid var(--br2)"}}>{tenant.hotelName}</div>
        </div>

        <div className="fg">
          <label className="flbl">Brand Color</label>
          <div className="color-picker-row">
            {COLORS.map(c=>(
              <div key={c} className={`color-swatch${color===c?" sel":""}`} style={{background:c}} onClick={()=>setColor(c)}/>
            ))}
          </div>
          <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:"100%",height:32,borderRadius:7,border:"1px solid var(--br2)",background:"var(--s2)",cursor:"pointer"}}/>
        </div>

        <div className="frow">
          <div className="fg">
            <label className="flbl">Currency</label>
            <select className="fselect" value={currency} onChange={e=>setCurrency(e.target.value)}>
              <option value="BDT">BDT — Taka (৳)</option>
              <option value="USD">USD — Dollar ($)</option>
              <option value="EUR">EUR — Euro (€)</option>
              <option value="GBP">GBP — Pound (£)</option>
              <option value="AED">AED — Dirham (د.إ)</option>
            </select>
          </div>
          <div className="fg">
            <label className="flbl">Timezone</label>
            <select className="fselect" value={timezone} onChange={e=>setTimezone(e.target.value)}>
              <option value="Asia/Dhaka">Asia/Dhaka UTC+6</option>
              <option value="Asia/Kolkata">Asia/Kolkata UTC+5:30</option>
              <option value="Asia/Dubai">Asia/Dubai UTC+4</option>
              <option value="Europe/London">Europe/London UTC+0</option>
              <option value="America/New_York">America/NYC UTC-5</option>
            </select>
          </div>
        </div>

        {/* Live preview */}
        <div className="preview-banner" style={{background:`rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.12)`,border:`1px solid ${color}30`}}>
          <div style={{fontSize:10,fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",letterSpacing:".1em",color:color,marginBottom:8,textTransform:"uppercase"}}>Preview</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:8,background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏨</div>
            <div>
              <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:18,color:color}}>{tenant.hotelName}</div>
              <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,color:"var(--tx3)",letterSpacing:".1em"}}>POWERED BY LUMEA · {currency}</div>
            </div>
          </div>
        </div>

        <button className="btn btn-gold w100 btn-xl" style={{justifyContent:"center",marginTop:20}}
          onClick={()=>onComplete({...tenant,brandColor:color,currency,timezone})}>
          Launch My CRM →
        </button>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════
// ── SAAS LOGIN PAGE
// ════════════════════════════════════════════════════════════════════════
function SaaSLogin({onLogin, onSignupClick}) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Demo tenant accounts
  const DEMO_TENANTS = [
    {email:"demo@grandpalace.com", password:"demo123", hotelName:"Grand Palace Hotel", plan:"pro", brandColor:"#C8A96E", currency:"BDT", trialEnds: fmtDate(addDays(TODAY,8)), subStatus:"trialing"},
    {email:"owner@seaview.com",    password:"demo123", hotelName:"Sea View Resort",    plan:"enterprise", brandColor:"#2EC4B6", currency:"USD", trialEnds: fmtDate(addDays(TODAY,-2)), subStatus:"active"},
  ];

  function handleLogin() {
    if(!email||!pw) return setErr("Email and password required.");
    setLoading(true);
    setTimeout(()=>{
      const t = DEMO_TENANTS.find(x=>x.email.toLowerCase()===email.toLowerCase()&&x.password===pw);
      if(t) onLogin(t);
      else { setErr("Invalid credentials. Try demo@grandpalace.com / demo123"); setLoading(false); }
    }, 600);
  }

  return (
    <div className="auth-bg">
      <style>{STYLES}</style>
      <div className="auth-grid"/>
      <div className="auth-card">
        <div className="auth-logo">Lumea</div>
        <div className="auth-sub">Sign in to your Lumea account</div>

        <div style={{background:"rgba(200,169,110,.06)",border:"1px solid rgba(200,169,110,.15)",borderRadius:8,padding:"9px 12px",fontSize:11,color:"var(--tx2)",marginBottom:18,lineHeight:1.7}}>
          <strong style={{color:"var(--gold)"}}>Demo accounts:</strong><br/>
          demo@grandpalace.com / demo123<br/>
          owner@seaview.com / demo123
        </div>

        <div className="fg"><label className="flbl">Email</label><input className="finput" type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="you@hotel.com" onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
        <div className="fg"><label className="flbl">Password</label><input className="finput" type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>

        {err&&<div style={{background:"rgba(224,92,122,.1)",border:"1px solid rgba(224,92,122,.25)",borderRadius:7,padding:"8px 11px",fontSize:11.5,color:"var(--rose)",marginBottom:12}}>{err}</div>}

        <button className="btn btn-gold w100 btn-xl" style={{justifyContent:"center"}} disabled={loading} onClick={handleLogin}>
          {loading?"Signing in…":"Sign In →"}
        </button>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"var(--tx3)"}}>
          No account? <span style={{color:"var(--gold)",cursor:"pointer"}} onClick={onSignupClick}>Start free trial</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── SAAS DASHBOARD WRAPPER (billing, settings, CRM access)
// ════════════════════════════════════════════════════════════════════════
function SaaSDashboard({tenant, onLogout}) {
  const [page, setPage] = useState("crm");
  const [toast, setToastMsg] = useState(null);
  const toastRef = useRef();
  const showToast = useCallback((msg,type="success")=>{
    setToastMsg({msg,type}); clearTimeout(toastRef.current);
    toastRef.current = setTimeout(()=>setToastMsg(null),3200);
  },[]);

  const daysLeft = nightsCount(fmtDate(TODAY), tenant.trialEnds);
  const onTrial = tenant.subStatus === "trialing";

  const nav = [
    {id:"crm",     ico:"🏨", label:"Lumea CRM",    section:"WORKSPACE"},
    {id:"dash",    ico:"⬡",  label:"Overview"},
    {id:"billing", ico:"💳", label:"Billing",       section:"ACCOUNT"},
    {id:"settings",ico:"⚙",  label:"Settings"},
  ];

  return (
    <div className="saas-app">
      <style>{STYLES}</style>

      <aside className="saas-sidebar">
        <div className="s-logo" style={{borderBottom:`1px solid ${tenant.brandColor}22`}}>
          <div style={{fontSize:18,marginBottom:3}}>🏨</div>
          <div className="s-logo-name" style={{color:tenant.brandColor||"var(--gold)"}}>{tenant.hotelName}</div>
          <div className="s-logo-ver">LUMEA · {PLANS[tenant.plan]?.name?.toUpperCase()}</div>
        </div>

        {onTrial&&(
          <div className="s-trial-bar">
            <div style={{fontSize:9,fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",letterSpacing:".1em",color:"var(--amb)",textTransform:"uppercase",marginBottom:3}}>Free Trial</div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{daysLeft} days left</div>
            <div className="progress-bar" style={{marginTop:5}}>
              <div className="progress-fill" style={{width:`${(daysLeft/14)*100}%`,background:"var(--amb)"}}/>
            </div>
            <button className="btn btn-gold btn-sm w100" style={{marginTop:8,justifyContent:"center",fontSize:10.5}} onClick={()=>setPage("billing")}>Upgrade Now →</button>
          </div>
        )}

        <nav className="s-nav">
          {nav.map(item=>(
            <div key={item.id}>
              {item.section&&<div className="s-sect">{item.section}</div>}
              <div className={`s-item${page===item.id?" active":""}`} onClick={()=>setPage(item.id)}>
                <span className="ico">{item.ico}</span>
                <span>{item.label}</span>
              </div>
            </div>
          ))}
        </nav>

        <div className="s-user">
          <div className="s-u-av" style={{background:tenant.brandColor||"var(--gold)"}}>
            {tenant.hotelName?.[0]||"H"}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div className="s-u-name">{tenant.hotelName}</div>
            <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:8,color:"var(--tx3)",letterSpacing:".05em"}}>{tenant.subStatus?.toUpperCase()}</div>
          </div>
          <button style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13,padding:3}} onClick={onLogout} title="Sign out">⏻</button>
        </div>
      </aside>

      <main className="saas-main">
        <div className="topbar">
          <div className="tb-title" style={{color:tenant.brandColor||"var(--gold)"}}>{page==="crm"?"Lumea CRM":page==="dash"?"Overview":page==="billing"?"Billing":page==="settings"?"Settings":""}</div>
          <div className="flex fac gap2"><div className="sync-dot"/><span className="xs muted">Live</span></div>
          <div className="tb-meta mono">{new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"})} · {fmtDate(TODAY)}</div>
          <Badge color={onTrial?"amber":"green"}>{onTrial?`Trial: ${daysLeft}d left`:PLANS[tenant.plan]?.name}</Badge>
        </div>

        <div className="content">
          {page==="crm"    && <CRMApp tenant={tenant} toast={showToast}/>}
          {page==="dash"   && <SaaSOverview tenant={tenant} setPage={setPage}/>}
          {page==="billing"&& <BillingScreen tenant={tenant} toast={showToast}/>}
          {page==="settings"&&<TenantSettings tenant={tenant} toast={showToast}/>}
        </div>
      </main>

      {toast&&<div className={`toast${toast.type==="error"?" error":toast.type==="info"?" info":""}`}>{toast.type==="error"?"⚠":"✓"} {toast.msg}</div>}
    </div>
  );
}

// ── SaaS Overview Page ──────────────────────────────────────────────────
function SaaSOverview({tenant, setPage}) {
  const plan = PLANS[tenant.plan];
  const daysLeft = nightsCount(fmtDate(TODAY), tenant.trialEnds);
  return (
    <div style={{maxWidth:820}}>
      <div className="sub-hero">
        <div className="flex fac fjb" style={{flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:22,color:tenant.brandColor||"var(--gold)",marginBottom:4}}>{tenant.hotelName}</div>
            <div style={{fontSize:12,color:"var(--tx2)"}}>lumea.app/{tenant.slug} · Plan: <strong style={{color:plan?.color}}>{plan?.name}</strong></div>
          </div>
          <div style={{textAlign:"right"}}>
            <Badge color={tenant.subStatus==="trialing"?"amber":"green"}>{tenant.subStatus==="trialing"?`Trial: ${daysLeft} days left`:"Active"}</Badge>
            {tenant.subStatus==="trialing"&&<div><button className="btn btn-gold btn-sm" style={{marginTop:8}} onClick={()=>setPage("billing")}>Upgrade Now</button></div>}
          </div>
        </div>
      </div>
      <div className="stats-row" style={{gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))"}}>
        {[
          {lbl:"Plan",val:plan?.name,ico:"📦",ac:plan?.color||"var(--gold)"},
          {lbl:"Rooms Allowed",val:plan?.rooms===999?"∞":plan?.rooms,ico:"🛏",ac:"var(--sky)"},
          {lbl:"Staff Accounts",val:plan?.staff===99?"∞":plan?.staff,ico:"👥",ac:"var(--teal)"},
          {lbl:"Days Remaining",val:tenant.subStatus==="trialing"?daysLeft:"∞",ico:"⏱",ac:"var(--amb)"},
        ].map(s=>(
          <div key={s.lbl} className="stat" style={{"--ac":s.ac}}>
            <div className="stat-ico">{s.ico}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-val" style={{fontSize:32}}>{s.val}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">Quick Actions</span></div>
        <div className="card-body" style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button className="btn btn-gold" onClick={()=>setPage("crm")}>🏨 Open Lumea CRM</button>
          <button className="btn btn-ghost" onClick={()=>setPage("billing")}>💳 Manage Billing</button>
          <button className="btn btn-ghost" onClick={()=>setPage("settings")}>⚙ Settings</button>
        </div>
      </div>
    </div>
  );
}

// ── Billing Screen ──────────────────────────────────────────────────────
function BillingScreen({tenant, toast}) {
  const [loading, setLoading] = useState(null);
  const currentPlan = PLANS[tenant.plan];
  const daysLeft = nightsCount(fmtDate(TODAY), tenant.trialEnds);

  function selectPlan(planId) {
    setLoading(planId);
    setTimeout(()=>{
      setLoading(null);
      toast(`✓ Redirecting to Stripe checkout for ${PLANS[planId].name}…`,"info");
    },800);
  }

  return (
    <div style={{maxWidth:800}}>
      {/* Current status */}
      <div className="sub-hero">
        <div className="flex fac fjb" style={{flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,letterSpacing:".1em",color:"var(--tx3)",textTransform:"uppercase",marginBottom:4}}>Current Plan</div>
            <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:26,color:currentPlan?.color}}>{currentPlan?.name}</div>
            <div style={{fontSize:12,color:"var(--tx2)",marginTop:4}}>{tenant.subStatus==="trialing"?`Free trial · ${daysLeft} days remaining`:"Active subscription"}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:36,color:"var(--gold)"}}>${currentPlan?.price}<span style={{fontSize:14,color:"var(--tx2)",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}}>/mo</span></div>
          </div>
        </div>
      </div>

      <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,letterSpacing:".12em",color:"var(--tx3)",textTransform:"uppercase",marginBottom:12}}>Available Plans</div>
      <div className="plan-cards">
        {Object.values(PLANS).map(p=>(
          <div key={p.id} className={`plan-c${tenant.plan===p.id?" active-plan":""}`}>
            {tenant.plan===p.id&&<div style={{fontSize:9,fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",color:"var(--gold)",letterSpacing:".08em",marginBottom:4}}>▲ CURRENT PLAN</div>}
            <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:20,color:p.color,marginBottom:2}}>{p.name}</div>
            <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:11,color:"var(--gold)",marginBottom:10}}>${p.price}/mo</div>
            <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
              {p.features.map(f=><li key={f} style={{fontSize:11.5,color:"var(--tx2)",display:"flex",alignItems:"center",gap:6}}><span style={{color:"var(--grn)",fontSize:9}}>✓</span>{f}</li>)}
            </ul>
            {tenant.plan!==p.id?(
              <button className="btn btn-gold btn-sm w100" style={{justifyContent:"center"}} disabled={!!loading} onClick={()=>selectPlan(p.id)}>
                {loading===p.id?"Redirecting…":`Switch to ${p.name} →`}
              </button>
            ):(
              <div className="btn btn-ghost btn-sm w100" style={{justifyContent:"center",cursor:"default",opacity:.6}}>Current Plan</div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">Payment Method</span></div>
        <div className="card-body">
          <div style={{display:"flex",alignItems:"center",gap:14,padding:"10px 0"}}>
            <div style={{width:44,height:28,background:"linear-gradient(135deg,#1a1f36,#2d3561)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💳</div>
            <div><div style={{fontSize:13,fontWeight:600}}>Visa ending in 4242</div><div style={{fontSize:11,color:"var(--tx2)"}}>Expires 12/28</div></div>
            <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={()=>toast("Stripe portal opening…","info")}>Update</button>
          </div>
        </div>
      </div>

      <div style={{fontSize:12,color:"var(--tx3)",textAlign:"center",marginTop:16,lineHeight:1.7}}>
        Payments processed securely by Stripe. Cancel anytime from your account.<br/>
        <span style={{color:"var(--tx2)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>toast("Billing portal opening…","info")}>Manage subscription on Stripe →</span>
      </div>
    </div>
  );
}

// ── Tenant Settings ─────────────────────────────────────────────────────
function TenantSettings({tenant, toast}) {
  const COLORS = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500","#FF6B6B"];
  const [color, setColor] = useState(tenant.brandColor||"#C8A96E");
  const [hotelName, setHotelName] = useState(tenant.hotelName);
  const [domain, setDomain] = useState("");

  return (
    <div style={{maxWidth:640}}>
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Branding</span></div>
        <div className="card-body">
          <div className="fg"><label className="flbl">Hotel Name (shown in CRM)</label><input className="finput" value={hotelName} onChange={e=>setHotelName(e.target.value)}/></div>
          <div className="fg">
            <label className="flbl">Brand Color</label>
            <div className="color-picker-row">
              {COLORS.map(c=><div key={c} className={`color-swatch${color===c?" sel":""}`} style={{background:c}} onClick={()=>setColor(c)}/>)}
            </div>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:"100%",height:32,borderRadius:7,border:"1px solid var(--br2)",background:"var(--s2)",cursor:"pointer",marginTop:6}}/>
          </div>
          <div className="preview-banner" style={{background:`rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.1)`,border:`1px solid ${color}25`,marginTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:6,background:color,display:"flex",alignItems:"center",justifyContent:"center"}}>🏨</div>
              <div><div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:16,color}}>{hotelName}</div><div style={{fontSize:9,color:"var(--tx3)",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",letterSpacing:".1em"}}>{PLANS[tenant.plan]?.name?.toUpperCase()} PLAN</div></div>
            </div>
          </div>
          <button className="btn btn-gold" style={{marginTop:14}} onClick={()=>toast("Branding saved ✓","success")}>Save Branding</button>
        </div>
      </div>

      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Custom Domain</span><Badge color={tenant.plan==="enterprise"||tenant.plan==="pro"?"green":"amber"}>{tenant.plan==="starter"?"Pro+ Feature":"Available"}</Badge></div>
        <div className="card-body">
          {tenant.plan==="starter"?(
            <div style={{fontSize:13,color:"var(--tx2)"}}>Custom domain is available on Pro and Enterprise plans. <span style={{color:"var(--gold)",cursor:"pointer"}}>Upgrade →</span></div>
          ):(
            <>
              <div className="fg"><label className="flbl">Your Custom Domain</label><input className="finput" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="crm.yourhotal.com"/></div>
              <div style={{fontSize:11.5,color:"var(--tx3)",marginBottom:10}}>Add a CNAME record: <span className="mono" style={{color:"var(--gold)"}}>crm.{tenant.slug}.lumea.app</span></div>
              <button className="btn btn-gold btn-sm" onClick={()=>toast("Domain saved. DNS propagation may take up to 48 hours.","info")}>Save Domain</button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">Danger Zone</span></div>
        <div className="card-body">
          <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>Permanently delete your account, all data, and cancel your subscription.</div>
          <button className="btn btn-danger" onClick={()=>toast("Contact support to delete your account.","error")}>Delete Account</button>
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════
// ─── PDF REPORT BUTTON ───────────────────────────────────────────
// Uses jsPDF (loaded from CDN — works on Vercel, not inside Claude sandbox)
function PDFReportBtn({date,rev,tokenAmt,closing,daily}) {
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState("");

  function loadScript(src){
    return new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)){res();return;}
      const s=document.createElement("script");
      s.src=src; s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  async function generate(){
    setBusy(true); setErr("");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
      const {jsPDF} = window.jspdf;
      const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      // Background
      doc.setFillColor(12,17,24); doc.rect(0,0,W,H,"F");

      // Header bar
      doc.setFillColor(19,25,32); doc.rect(0,0,W,20,"F");
      doc.setDrawColor(200,169,110); doc.setLineWidth(0.5);
      doc.line(0,20,W,20);

      // Title
      doc.setFont("helvetica","bold"); doc.setFontSize(16);
      doc.setTextColor(200,169,110); doc.text("Lumea",8,10);
      doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.setTextColor(139,148,158);
      doc.text("DAILY TRANSACTIONS REPORT  ·  DHAKA, BANGLADESH  ·  UTC +06:00",8,16);

      // Date right
      doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.setTextColor(200,169,110); doc.text(date,W-8,10,{align:"right"});
      doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.setTextColor(139,148,158);
      doc.text("Generated: "+new Date().toLocaleString(),W-8,16,{align:"right"});

      // Summary boxes
      const boxes=[
        ["TOTAL REVENUE", BDT(rev), [200,169,110]],
        ["TOKEN AMOUNT", "- "+BDT(tokenAmt), [224,92,122]],
        ["CLOSING BALANCE", BDT(closing), [63,185,80]],
        ["TRANSACTIONS", String(daily.length), [88,166,255]],
        ["COMPLETED", String(daily.filter(t=>t.status==="completed").length), [46,196,182]],
      ];
      const bw=(W-16)/5, by=23;
      boxes.forEach(([lbl,val,col],i)=>{
        const bx=8+i*bw;
        doc.setFillColor(26,33,48); doc.roundedRect(bx,by,bw-2,14,1,1,"F");
        doc.setDrawColor(...col,60); doc.setLineWidth(0.3);
        doc.roundedRect(bx,by,bw-2,14,1,1,"S");
        doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(139,148,158);
        doc.text(lbl,bx+2,by+5);
        doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...col);
        doc.text(val,bx+2,by+12);
      });

      // Table
      const head=[["TXN ID","Time","Guest","Type","Room","Amount","Method","Status"]];
      const body=daily.map(t=>[t.id,t.time,t.guest,t.type,t.room,BDT(t.amount),t.method,t.status]);
      doc.autoTable({
        head, body, startY:40, margin:{left:8,right:8},
        styles:{fontSize:7.5, textColor:[220,230,240], fillColor:[19,25,32], lineColor:[31,40,64], lineWidth:0.2},
        headStyles:{fillColor:[19,25,32], textColor:[200,169,110], fontStyle:"bold", fontSize:7},
        alternateRowStyles:{fillColor:[22,30,42]},
        columnStyles:{5:{halign:"right", textColor:[200,169,110]}, 7:{halign:"center"}, 4:{halign:"center"}},
        didParseCell(data){
          if(data.section==="body"&&data.column.index===7){
            data.cell.styles.textColor = data.cell.raw==="completed"?[63,185,80]:[240,165,0];
          }
        }
      });

      // Footer
      doc.setDrawColor(200,169,110,60); doc.setLineWidth(0.3);
      doc.line(8,H-8,W-8,H-8);
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(139,148,158);
      doc.text("Lumea · Dhaka, Bangladesh",8,H-4);
      doc.text(`Revenue: ${BDT(rev)}   Token: -${BDT(tokenAmt)}   Closing: ${BDT(closing)}`,W-8,H-4,{align:"right"});

      doc.save(`HotelFountain_Report_${date}.pdf`);
      setBusy(false); setDone(true); setTimeout(()=>setDone(false),3000);
    } catch(e) {
      setBusy(false); setErr("Download failed: "+e.message);
    }
  }

  return (
    <div>
      <button className="btn btn-gold btn-sm" onClick={generate} disabled={busy}
        style={done?{background:"var(--grn)",color:"#0C1118"}:undefined}>
        {busy?"Generating…":done?"✓ Downloaded!":"⬇ Download PDF"}
      </button>
      {err&&<div style={{fontSize:10,color:"var(--rose)",marginTop:4}}>{err}</div>}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────
// ── HOTEL FOUNTAIN CRM V5.2.0 — FULL SYSTEM
// ════════════════════════════════════════════════════════════════════════

function RoomModal({room,folios,setFolios,setRooms,setGuests,setTransactions,toast,onClose,currentUser,guests,onEdit,onDelete}) {
  const isSA=currentUser?.role==="superadmin";
  const isOccupied=room.status==="occupied";
  const [activeTab,setActiveTab]=useState(isOccupied?"billing":"info");
  const [showAddCharge,setShowAddCharge]=useState(false);
  const [showPayModal,setShowPayModal]=useState(false);
  const [chargeForm,setChargeForm]=useState({type:"Room Service",amount:"",desc:""});
  const [payMethod,setPayMethod]=useState("Cash");
  const [payAmount,setPayAmount]=useState("");
  const [showCheckout,setShowCheckout]=useState(false);
  const [gSearch,setGSearch]=useState(room.guest||"");
  const [checkIn,setCheckIn]=useState(fmtDate(TODAY));
  const [checkOut,setCheckOut]=useState(fmtDate(addDays(TODAY,1)));

  const charges=folios[room.id]||[];
  const sub=charges.reduce((a,c)=>a+c.amt,0);
  const tax=Math.round(sub*0.07);
  const svc=Math.round(sub*0.05);
  const total=sub+tax+svc;
  const daysStayed=room.checkIn?Math.max(0,nightsCount(room.checkIn,fmtDate(TODAY))):0;

  const canEdit=["superadmin","manager","receptionist","accountant"].includes(currentUser?.role);

  function changeStatus(s) {
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:s,guest:s!=="occupied"?null:r.guest}:r));
    toast(`Room ${room.id} → ${s}`,"success");
    onClose();
  }
  function addCharge() {
    if(!chargeForm.amount||isNaN(chargeForm.amount))return toast("Enter valid amount","error");
    const item={id:Date.now(),desc:chargeForm.desc||chargeForm.type,amt:parseFloat(chargeForm.amount),cat:chargeForm.type};
    setFolios(p=>({...p,[room.id]:[...(p[room.id]||[]),item]}));
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:room.guest,type:chargeForm.type,room:room.id,amount:parseFloat(chargeForm.amount),method:"Room Charge",status:"completed"},...p]);
    toast(`Charge: ${BDT(chargeForm.amount)}`,"success");
    setShowAddCharge(false);
    setChargeForm({type:"Room Service",amount:"",desc:""});
  }
  function processPayment() {
    const amt=parseFloat(payAmount);
    if(!amt||amt<=0)return toast("Enter valid amount","error");
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:room.guest,type:"Payment",room:room.id,amount:amt,method:payMethod,status:"completed"},...p]);
    toast(`Payment ${BDT(amt)} via ${payMethod}`,"success");
    setShowPayModal(false);setPayAmount("");
  }
  function doCheckout() {
<<<<<<< HEAD
    const txn={id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:room.guest,type:"Final Settlement",room:room.id,amount:total,method:"Credit Card",status:"completed"};
    setTransactions(p=>[txn,...p]);
=======
    // Ledger accuracy: only settle what is still unpaid.
    const paidSoFar=(transactions||[]).filter(t=>t.type==="Payment"&&t.room===room.id)
      .reduce((a,t)=>a+(+t.amount||0),0);
    const finalDue=Math.max(0,total-paidSoFar);
    if(finalDue>0){
      const txn={id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:room.guest,type:"Final Settlement",room:room.id,amount:finalDue,method:"Credit Card",status:"completed"};
      setTransactions(p=>[txn,...p]);
    }
>>>>>>> f4de41a (Fix: Merge/sum transactions by guest, room, and date)
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:"housekeeping",guest:null,checkIn:null,checkOut:null}:r));
    setGuests(p=>p.map(g=>g.name===room.guest?{...g,status:"checked-out",room:null,stays:g.stays+1,spent:g.spent+total}:g));
    setFolios(p=>({...p,[room.id]:[]}));
    toast(`✓ ${room.guest} checked out from Room ${room.id}`,"success");
    onClose();
  }
  function assignGuest() {
    if(!gSearch)return toast("Select a guest","error");
    setRooms(p=>p.map(r=>r.id===room.id?{...r,status:"occupied",guest:gSearch,checkIn,checkOut}:r));
    setGuests(p=>p.map(g=>g.name===gSearch?{...g,status:"checked-in",room:room.id}:g));
    toast(`${gSearch} checked in to Room ${room.id}`,"success");
    onClose();
  }

  return (
    <Modal title={`Room ${room.id} — ${room.type}`} onClose={onClose} wide={isOccupied}
      footer={
        <div className="flex gap2" style={{flexWrap:"wrap",width:"100%"}}>
          {isSA&&<>
            <button className="btn btn-info btn-sm" onClick={onEdit}>✏ Edit Room</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>🗑 Delete</button>
          </>}
          {isOccupied&&canEdit&&<>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowAddCharge(true)}>＋ Charge</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowPayModal(true)}>💳 Pay</button>
            <button className="btn btn-danger btn-sm" onClick={()=>setShowCheckout(true)}>🚪 Check Out</button>
          </>}
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{marginLeft:"auto"}}>Close</button>
        </div>
      }>

      {isOccupied&&(
        <div className="tabs mb4">
          <button className={`tab${activeTab==="billing"?" active":""}`} onClick={()=>setActiveTab("billing")}>💰 Billing & Folio</button>
          <button className={`tab${activeTab==="info"?" active":""}`} onClick={()=>setActiveTab("info")}>🛏 Room Info</button>
        </div>
      )}

      {/* BILLING TAB */}
      {activeTab==="billing"&&isOccupied&&(
        <div>
          <div style={{background:"linear-gradient(135deg,rgba(224,92,122,.08),rgba(200,169,110,.06))",border:"1px solid rgba(200,169,110,.2)",borderRadius:9,padding:"13px 15px",marginBottom:13}}>
            <div className="flex fac fjb">
              <div className="flex fac gap3"><Av name={room.guest} size="lg"/>
                <div>
                  <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:17,color:"var(--tx)"}}>{room.guest}</div>
                  <div className="xs mono muted mt2">Room {room.id} · {room.type} · {room.view}</div>
                  <div className="xs mono" style={{color:"var(--amb)",marginTop:2}}>{room.checkIn} → {room.checkOut} · {daysStayed}d stayed</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="xs muted">Total</div>
                <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:22,color:"var(--gold)"}}>{BDT(total)}</div>
              </div>
            </div>
          </div>

          <div style={{background:"var(--s2)",borderRadius:9,border:"1px solid var(--br2)",overflow:"hidden",marginBottom:13}}>
            <div style={{padding:"8px 13px",background:"rgba(200,169,110,.04)",borderBottom:"1px solid var(--br2)",fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,letterSpacing:".1em",color:"var(--tx2)",textTransform:"uppercase",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Charges</span>
              {canEdit&&<button className="btn btn-ghost btn-sm" onClick={()=>setShowAddCharge(true)} style={{fontSize:10,padding:"3px 8px"}}>＋ Add</button>}
            </div>
            <div style={{padding:"0 13px"}}>
              {charges.length===0&&<div style={{padding:"14px 0",color:"var(--tx3)",fontSize:11.5,textAlign:"center"}}>No charges yet</div>}
              {charges.map((c,i)=>(
                <div key={i} className="folio-row">
                  <div><span className="sm">{c.desc}</span><span className="badge bgold" style={{marginLeft:6,fontSize:8.5}}>{c.cat}</span></div>
                  <span className="mono xs gold">{BDT(c.amt)}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"10px 13px",background:"rgba(200,169,110,.03)",borderTop:"1px solid var(--br2)"}}>
              <div className="flex fjb xs muted mb2"><span>Subtotal</span><span className="mono">{BDT(sub)}</span></div>
              <div className="flex fjb xs muted mb2"><span>VAT (7%)</span><span className="mono">{BDT(tax)}</span></div>
              <div className="flex fjb xs muted mb2"><span>Service (5%)</span><span className="mono">{BDT(svc)}</span></div>
              <hr className="divider" style={{margin:"7px 0"}}/>
              <div className="flex fjb" style={{fontSize:14,fontWeight:700,color:"var(--gold)"}}><span>Total Due</span><span className="mono">{BDT(total)}</span></div>
            </div>
          </div>

          {canEdit&&<div><div className="flbl mb2">Quick Charge</div>
            <div className="flex gap2" style={{flexWrap:"wrap"}}>
              {["Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Bar"].map(t=>(
                <button key={t} className="btn btn-ghost btn-sm" onClick={()=>{setChargeForm(p=>({...p,type:t}));setShowAddCharge(true);}}>{t}</button>
              ))}
            </div>
          </div>}
        </div>
      )}

      {/* INFO TAB */}
      {(activeTab==="info"||!isOccupied)&&(
        <div>
          <div className="info-grid mb4">
            {[["Floor",`Floor ${room.floor}`],["Beds",room.beds],["View",room.view],["Rate",BDT(room.rate)+"/night"]].map(([l,v])=>(
              <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
            ))}
          </div>
          {isOccupied&&room.guest&&(
            <div style={{padding:"10px 12px",background:"rgba(88,166,255,.06)",borderRadius:8,border:"1px solid rgba(88,166,255,.15)",marginBottom:13}}>
              <div className="info-lbl mb2">Current Guest</div>
              <div className="flex fac gap2"><Av name={room.guest} size="sm"/>
                <div><div className="bold sm">{room.guest}</div><div className="xs muted">{room.checkIn} → {room.checkOut} ({nightsCount(room.checkIn,room.checkOut)} nights)</div></div>
              </div>
            </div>
          )}
          {room.status==="available"&&canEdit&&(
            <div className="mb4">
              <div className="flbl mb2">Assign Guest & Check In</div>
              <div className="fg"><GuestSearch guests={guests.filter(g=>!g.room)} value={gSearch} onChange={setGSearch} placeholder="Search guest name…"/></div>
              <div className="frow">
                <div className="fg"><label className="flbl">Check-In Date & Time</label>
                  <input type="datetime-local" className="finput" value={`${checkIn}T${nowTime()}`} onChange={e=>{const[d]=e.target.value.split("T");setCheckIn(d);}}/></div>
                <div className="fg"><label className="flbl">Check-Out Date & Time</label>
                  <input type="datetime-local" className="finput" value={`${checkOut}T12:00`} onChange={e=>{const[d]=e.target.value.split("T");setCheckOut(d);}}/></div>
              </div>
              <button className="btn btn-gold w100" style={{justifyContent:"center"}} onClick={assignGuest}>✓ Confirm Check In</button>
            </div>
          )}
          {canEdit&&<div>
            <div className="flbl mb2">Change Status</div>
            <select className="fselect" value={room.status} onChange={e=>changeStatus(e.target.value)}>
              <option value="available">✅ Available</option>
              <option value="occupied">🔵 Occupied</option>
              <option value="housekeeping">🟡 Housekeeping</option>
              <option value="maintenance">🔴 Maintenance</option>
            </select>
          </div>}
        </div>
      )}

      {/* SUB MODALS */}
      {showAddCharge&&(
        <div className="modal-bg" onClick={()=>setShowAddCharge(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Add Charge — Room {room.id}</div><button className="modal-close" onClick={()=>setShowAddCharge(false)}>×</button></div>
            <div className="modal-body">
              <div className="fg"><label className="flbl">Type</label><select className="fselect" value={chargeForm.type} onChange={e=>setChargeForm(p=>({...p,type:e.target.value}))}>{["Room Charge","Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Airport Transfer","Bar & Lounge","Gift Shop","Misc"].map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="fg"><label className="flbl">Amount (BDT) *</label><input type="number" className="finput" value={chargeForm.amount} onChange={e=>setChargeForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></div>
              <div className="fg"><label className="flbl">Description</label><input className="finput" value={chargeForm.desc} onChange={e=>setChargeForm(p=>({...p,desc:e.target.value}))} placeholder="Optional"/></div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowAddCharge(false)}>Cancel</button><button className="btn btn-gold" onClick={addCharge}>Add</button></div>
          </div>
        </div>
      )}
      {showPayModal&&(
        <div className="modal-bg" onClick={()=>setShowPayModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Process Payment</div><button className="modal-close" onClick={()=>setShowPayModal(false)}>×</button></div>
            <div className="modal-body">
              <div style={{padding:"10px 12px",background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",marginBottom:13}}>
                <div className="flex fjb sm"><span className="muted">Guest</span><span className="bold">{room.guest}</span></div>
                <div className="flex fjb sm mt2"><span className="muted">Total Due</span><span className="mono gold">{BDT(total)}</span></div>
              </div>
              <div className="fg"><label className="flbl">Method</label><select className="fselect" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{["Cash","Credit Card","Debit Card","bKash","Nagad","Rocket","Bank Transfer","Corporate"].map(m=><option key={m}>{m}</option>)}</select></div>
              <div className="fg"><label className="flbl">Amount (BDT)</label><input type="number" className="finput" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder={total}/></div>
              <div className="flex gap2 mt2">{[total,Math.round(total/2),10000,5000].map(a=><button key={a} className="btn btn-ghost btn-sm" onClick={()=>setPayAmount(a.toString())}>{BDT(a)}</button>)}</div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowPayModal(false)}>Cancel</button><button className="btn btn-gold" onClick={processPayment}>Confirm</button></div>
          </div>
        </div>
      )}
      {showCheckout&&(
        <div className="modal-bg" onClick={()=>setShowCheckout(false)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-title">Confirm Checkout</div><button className="modal-close" onClick={()=>setShowCheckout(false)}>×</button></div>
            <div className="modal-body">
              <div style={{textAlign:"center",padding:"6px 0 14px"}}><div style={{fontSize:34,marginBottom:8}}>🚪</div>
                <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:18,marginBottom:5}}>{room.guest}</div>
                <div className="sm muted">Room {room.id} · {daysStayed} days stayed</div>
              </div>
              <div style={{background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",padding:"11px 13px"}}>
                {[["Subtotal",sub],["VAT (7%)",tax],["Service (5%)",svc]].map(([l,v])=>(
                  <div key={l} className="flex fjb sm mb2"><span className="muted">{l}</span><span className="mono">{BDT(v)}</span></div>
                ))}
                <hr className="divider" style={{margin:"7px 0"}}/>
                <div className="flex fjb" style={{fontSize:14,fontWeight:700,color:"var(--gold)"}}><span>Final Bill</span><span className="mono">{BDT(total)}</span></div>
              </div>
              <div className="sm muted mt3" style={{textAlign:"center"}}>Room will move to Housekeeping after checkout</div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowCheckout(false)}>Cancel</button><button className="btn btn-danger" onClick={doCheckout}>Confirm Checkout</button></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── ADD/EDIT ROOM MODAL (Super Admin only) ───────────────────────
function RoomFormModal({room,onSave,onClose}) {
  const [f,setF]=useState(room||{id:"",type:"Standard",floor:1,status:"available",rate:4500,beds:"Queen",view:"Garden",guest:null});
  function save(){
    if(!f.id)return;
    onSave({...f,rate:parseInt(f.rate)||4500,floor:parseInt(f.floor)||1});
  }
  return (
    <Modal title={room?"Edit Room "+room.id:"Add New Room"} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-gold" onClick={save}>{room?"Save Changes":"Add Room"}</button></>}>
      <div className="frow">
        <div className="fg"><label className="flbl">Room Number *</label><input className="finput" value={f.id} onChange={e=>setF(p=>({...p,id:e.target.value}))} placeholder="e.g. 205" disabled={!!room}/></div>
        <div className="fg"><label className="flbl">Floor</label><input type="number" className="finput" value={f.floor} onChange={e=>setF(p=>({...p,floor:e.target.value}))}/></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">Room Type</label><select className="fselect" value={f.type} onChange={e=>setF(p=>({...p,type:e.target.value}))}>{["Standard","Deluxe","Suite","Presidential"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="flbl">Bed Type</label><select className="fselect" value={f.beds} onChange={e=>setF(p=>({...p,beds:e.target.value}))}>{["Queen","King","Twin","Double"].map(t=><option key={t}>{t}</option>)}</select></div>
      </div>
      <div className="frow">
        <div className="fg"><label className="flbl">View</label><select className="fselect" value={f.view} onChange={e=>setF(p=>({...p,view:e.target.value}))}>{["Garden","Pool","City","Lake","Panoramic","Ocean"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="flbl">Rate (BDT/night)</label><input type="number" className="finput" value={f.rate} onChange={e=>setF(p=>({...p,rate:e.target.value}))}/></div>
      </div>
      <div className="fg"><label className="flbl">Status</label><select className="fselect" value={f.status} onChange={e=>setF(p=>({...p,status:e.target.value}))}>{["available","occupied","housekeeping","maintenance"].map(s=><option key={s}>{s}</option>)}</select></div>
    </Modal>
  );
}

// ─── ROOMS PAGE ────────────────────────────────────────────────────
function RoomsPage({rooms,setRooms,folios,setFolios,guests,setGuests,setTransactions,toast,currentUser}) {
  const isSA=currentUser?.role==="superadmin";
  const [filter,setFilter]=useState("all");
  const [selected,setSelected]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [editRoom,setEditRoom]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);

  const filtered=filter==="all"?rooms:rooms.filter(r=>r.status===filter);

  function saveRoom(r) {
    if(editRoom){setRooms(p=>p.map(x=>x.id===r.id?r:x));toast(`Room ${r.id} updated`,"success");}
    else{if(rooms.find(x=>x.id===r.id))return toast("Room number already exists","error");setRooms(p=>[...p,r]);toast(`Room ${r.id} added`,"success");}
    setShowForm(false);setEditRoom(null);setSelected(null);
  }
  function deleteRoom(id) {
    if(rooms.find(r=>r.id===id)?.status==="occupied")return toast("Cannot delete an occupied room","error");
    setRooms(p=>p.filter(r=>r.id!==id));
    toast(`Room ${id} removed`,"success");
    setConfirmDelete(null);setSelected(null);
  }

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <div className="tabs">
          {["all","available","occupied","housekeeping","maintenance"].map(s=>(
            <button key={s} className={`tab${filter===s?" active":""}`} onClick={()=>setFilter(s)}>
              {s==="all"?`All (${rooms.length})`:`${s.charAt(0).toUpperCase()+s.slice(1)} (${rooms.filter(r=>r.status===s).length})`}
            </button>
          ))}
        </div>
        {isSA&&<button className="btn btn-gold" onClick={()=>{setEditRoom(null);setShowForm(true);}}>＋ Add Room</button>}
      </div>

      <div className="flex gap4 mb4" style={{flexWrap:"wrap"}}>
        {[["available","#3FB950"],["occupied","#58A6FF"],["housekeeping","#F0A500"],["maintenance","#E05C7A"]].map(([s,c])=>(
          <div key={s} className="flex fac gap2 sm muted">
            <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}`}}/>
            <span style={{textTransform:"capitalize",fontSize:11.5}}>{s}</span>
          </div>
        ))}
        <span className="xs muted">· Click room for details & billing</span>
      </div>

      <div className="rooms-grid">
        {filtered.map(room=>(
          <div key={room.id} className={`room-card ${room.status}`} onClick={()=>setSelected(room)}>
            {room.status==="occupied"&&<div className="room-billing-tag">BILLING</div>}
            <div className="room-no">{room.id}</div>
            <div className="room-status-bar"><div className={`room-dot ${room.status}`}/><span className="room-status-txt">{room.status}</span></div>
            <div className="room-tp">{room.type} · {room.view}</div>
            {room.guest&&<div className="room-guest-name">👤 {room.guest}</div>}
            <div className="room-rate">{BDT(room.rate)}/night</div>
          </div>
        ))}
      </div>

      {selected&&(
        <RoomModal room={selected} folios={folios} setFolios={setFolios} setRooms={setRooms} setGuests={setGuests} setTransactions={setTransactions} toast={toast} onClose={()=>setSelected(null)} currentUser={currentUser} guests={guests}
          onEdit={()=>{setEditRoom(selected);setShowForm(true);}}
          onDelete={()=>setConfirmDelete(selected.id)}
        />
      )}
      {showForm&&<RoomFormModal room={editRoom} onSave={saveRoom} onClose={()=>{setShowForm(false);setEditRoom(null);}}/>}
      {confirmDelete&&(
        <Modal title="Delete Room" onClose={()=>setConfirmDelete(null)}
          footer={<><button className="btn btn-ghost" onClick={()=>setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={()=>deleteRoom(confirmDelete)}>Delete Room {confirmDelete}</button></>}>
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑</div>
            <div className="sm muted">Permanently delete <strong style={{color:"var(--tx)"}}>Room {confirmDelete}</strong>? This cannot be undone.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}


function Dashboard({rooms,guests,reservations,tasks,transactions,setPage}) {
  const occ=rooms.filter(r=>r.status==="occupied").length;
  const avail=rooms.filter(r=>r.status==="available").length;
  const occPct=Math.round((occ/rooms.length)*100);
  const todayTxns=[...transactions,...SEED_TXN].filter(t=>t.date===fmtDate(TODAY));
  const todayRev=todayTxns.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0);
  const pendingTasks=tasks.filter(t=>t.status==="pending").length;
  const [chartActive,setChartActive]=useState(6);

  const monthData=[
    {m:"Sep",v:2720000},{m:"Oct",v:2960000},{m:"Nov",v:2460000},
    {m:"Dec",v:3580000},{m:"Jan",v:2090000},{m:"Feb",v:2860000},{m:"Mar",v:todayRev*8+1200000}
  ];

  return (
    <div>
      <div className="stats-row">
        {[
          {lbl:"Today's Revenue",val:BDT(todayRev),ico:"💰",sub:`${todayTxns.length} transactions`,chg:"+14%",up:true,ac:"#C8A96E"},
          {lbl:"Occupancy",val:`${occPct}%`,ico:"🛏",sub:`${occ}/${rooms.length} rooms`,chg:`${avail} available`,up:true,ac:"#58A6FF"},
          {lbl:"In-House Guests",val:guests.filter(g=>g.status==="checked-in").length,ico:"👥",sub:"Currently staying",chg:"2 arrivals today",up:true,ac:"#2EC4B6"},
          {lbl:"Pending Tasks",val:pendingTasks,ico:"📋",sub:"Awaiting action",chg:`${tasks.filter(t=>t.priority==="high"&&t.status==="pending").length} high priority`,up:false,ac:"#E05C7A"},
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

      {/* Revenue chart — single column, no occupancy breakdown block */}
      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Revenue Overview — BDT</span><Badge color="gold">7 Months</Badge></div>
        <div className="card-body">
          <BarChart data={monthData} vk="v" lk="m" active={chartActive} onHover={setChartActive}/>
          <div className="flex fjb sm mt3"><span className="muted">{monthData[chartActive].m} 2026</span><span className="mono gold">{BDT(monthData[chartActive].v)}</span></div>
          <hr className="divider"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9}}>
            {[["RevPAR",BDT(7440)],["ADR",BDT(12480)],["Bookings",reservations.length],["Occupancy",`${occPct}%`]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center",padding:"9px 6px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid var(--br2)"}}>
                <div className="mono xs muted" style={{letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                <div className="serif" style={{fontSize:18,color:"var(--gold)"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="g2 mb4">
        <div className="card">
          <div className="card-hd"><span className="card-title">Upcoming Reservations</span><button className="btn btn-ghost btn-sm" onClick={()=>setPage("reservations")}>All →</button></div>
          <div className="card-body" style={{padding:"4px 15px"}}>
            {reservations.slice(0,5).map(r=>(
              <div key={r.id} className="g-row">
                <Av name={r.guest} size="sm"/>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:500}}>{r.guest}</div><div className="xs muted">Room {r.room} · {r.nights}N · {r.source}</div></div>
                <div style={{textAlign:"right"}}><div className="mono xs gold">{BDT(r.amount)}</div><StatusBadge status={r.status}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Housekeeping</span><button className="btn btn-ghost btn-sm" onClick={()=>setPage("housekeeping")}>All →</button></div>
          <div className="card-body" style={{padding:"4px 15px"}}>
            {tasks.filter(t=>t.status!=="completed").slice(0,5).map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid var(--br2)"}}>
                <div className={`pdot ${t.priority}`}/>
                <div style={{fontFamily:"UnifrakturMaguntia,cursive",fontSize:20,width:32,flexShrink:0}}>{t.room}</div>
                <div style={{flex:1}}><div className="sm bold">{t.type}</div><div className="xs muted">{t.assignee} · {t.time}</div></div>
                <StatusBadge status={t.status}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
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

// ─── RESERVATIONS ──────────────────────────────────────────────────

function ReservationsPage({reservations,setReservations,rooms,guests,toast,currentUser}) {
  const isSA=currentUser?.role==="superadmin";
  const canEdit=["superadmin","manager","receptionist"].includes(currentUser?.role);
  const [search,setSearch]=useState("");
  const [fs,setFs]=useState("all");
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({guest:"",room:"",checkIn:"",checkOut:"",source:"Direct",notes:""});

  const filtered=reservations.filter(r=>{
    const ms=r.guest.toLowerCase().includes(search.toLowerCase())||r.id.includes(search)||r.room.includes(search);
    return ms&&(fs==="all"||r.status===fs);
  });

  function addRes(){
    if(!form.guest||!form.room||!form.checkIn||!form.checkOut)return toast("Fill all required fields","error");
    const nights=Math.max(1,nightsCount(form.checkIn,form.checkOut));
    const rm=rooms.find(r=>r.id===form.room);
    const nr={id:`RES-${String(reservations.length+1).padStart(3,"0")}`,guest:form.guest,room:form.room,type:rm?.type||"Standard",checkIn:form.checkIn,checkOut:form.checkOut,nights,amount:nights*(rm?.rate||4500),paid:0,status:"pending",source:form.source,created:fmtDate(TODAY),notes:form.notes};
    setReservations(p=>[nr,...p]);
    toast(`Reservation created for ${form.guest}`,"success");
    setShowNew(false);setForm({guest:"",room:"",checkIn:"",checkOut:"",source:"Direct",notes:""});
  }

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <div className="flex gap2" style={{flexWrap:"wrap"}}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search reservations..."/>
          <div className="tabs">{["all","confirmed","pending","cancelled"].map(s=>(
            <button key={s} className={`tab${fs===s?" active":""}`} onClick={()=>setFs(s)}>
              {s.charAt(0).toUpperCase()+s.slice(1)} ({reservations.filter(r=>s==="all"||r.status===s).length})
            </button>
          ))}</div>
        </div>
        {canEdit&&<button className="btn btn-gold" onClick={()=>setShowNew(true)}>＋ New</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:11,marginBottom:14}}>
        {[{l:"Total",v:filtered.length,c:"#58A6FF"},{l:"Revenue",v:BDT(filtered.reduce((a,r)=>a+r.amount,0)),c:"#C8A96E"},{l:"Avg Value",v:filtered.length?BDT(Math.round(filtered.reduce((a,r)=>a+r.amount,0)/filtered.length)):"৳0",c:"#2EC4B6"}].map(s=>(
          <div key={s.l} className="card"><div className="card-body" style={{padding:11}}>
            <div className="xs muted mono mb2" style={{letterSpacing:".1em",textTransform:"uppercase"}}>{s.l}</div>
            <div className="serif" style={{fontSize:22,color:s.c}}>{s.v}</div>
          </div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">Reservations</span><Badge color="blue">{filtered.length}</Badge></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["ID","Guest","Room","Check-In","Check-Out","Nights","Amount","Source","Status","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={10} style={{textAlign:"center",padding:24,color:"var(--tx3)"}}>No reservations found</td></tr>}
              {filtered.map(r=>(
                <tr key={r.id}>
                  <td className="mono xs muted">{r.id}</td>
                  <td><div className="flex fac gap2"><Av name={r.guest} size="sm"/>{r.guest}</div></td>
                  <td><Badge color="blue">{r.room}</Badge></td>
                  <td className="mono xs">{r.checkIn}</td>
                  <td className="mono xs">{r.checkOut}</td>
                  <td style={{textAlign:"center"}}>{r.nights}</td>
                  <td className="mono xs gold">{BDT(r.amount)}</td>
                  <td><Badge color="gold">{r.source}</Badge></td>
                  <td><StatusBadge status={r.status}/></td>
                  <td>
                    <div className="flex gap2">
                      {canEdit&&r.status==="pending"&&<button className="btn btn-success btn-sm" onClick={()=>{setReservations(p=>p.map(x=>x.id===r.id?{...x,status:"confirmed"}:x));toast("Confirmed ✓","success");}}>Confirm</button>}
                      {isSA&&<button className="btn btn-danger btn-sm" onClick={()=>{setReservations(p=>p.filter(x=>x.id!==r.id));toast("Reservation deleted","error");}}>Delete</button>}
                      {canEdit&&!isSA&&r.status!=="cancelled"&&<button className="btn btn-danger btn-sm" onClick={()=>{setReservations(p=>p.map(x=>x.id===r.id?{...x,status:"cancelled"}:x));toast("Cancelled","error");}}>Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew&&(
        <Modal title="New Reservation" onClose={()=>setShowNew(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button><button className="btn btn-gold" onClick={addRes}>Create</button></>}>
          <div className="fg"><label className="flbl">Guest Name *</label>
            <GuestSearch guests={guests} value={form.guest} onChange={v=>setForm(p=>({...p,guest:v}))} placeholder="Search guest…"/></div>
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
          {form.checkIn&&form.checkOut&&form.room&&(()=>{const n=Math.max(0,nightsCount(form.checkIn,form.checkOut));const rate=rooms.find(r=>r.id===form.room)?.rate||0;return n>0?(<div style={{padding:"8px 11px",background:"rgba(200,169,110,.06)",borderRadius:7,border:"1px solid rgba(200,169,110,.15)",marginBottom:11}}><div className="flex fjb sm"><span className="muted">Nights</span><span className="mono gold">{n}</span></div><div className="flex fjb sm mt2"><span className="muted">Estimate</span><span className="mono gold">{BDT(n*rate)}</span></div></div>):null;})()}
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Special requests..."/></div>
        </Modal>
      )}
    </div>
  );
}

// ─── GUESTS ────────────────────────────────────────────────────────
function GuestsPage({guests,setGuests,toast,currentUser}) {
  const canEdit=["superadmin","manager","receptionist"].includes(currentUser?.role);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [editNotes,setEditNotes]=useState(false);
  const [notesVal,setNotesVal]=useState("");
  const [form,setForm]=useState({name:"",email:"",phone:"",nationality:"Bangladesh",notes:""});

  const filtered=guests.filter(g=>g.name.toLowerCase().includes(search.toLowerCase())||g.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search guests..."/>
        {canEdit&&<button className="btn btn-gold" onClick={()=>setShowAdd(true)}>＋ Add Guest</button>}
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-hd"><span className="card-title">Guest Directory</span><Badge color="blue">{filtered.length}</Badge></div>
          <div className="card-body" style={{padding:"3px 15px"}}>
            {filtered.map(g=>(
              <div key={g.id} className="g-row" onClick={()=>{setSelected(g);setEditNotes(false);}} style={{background:selected?.id===g.id?"rgba(200,169,110,.04)":undefined}}>
                <Av name={g.name} size="md"/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:500,color:"var(--tx)",display:"flex",alignItems:"center",gap:5}}>
                    {g.name}{g.vip&&<span style={{color:"var(--gold)",fontSize:9}}>★VIP</span>}
                  </div>
                  <div className="xs muted">{g.nationality} · {g.stays} stays · {g.room?`Room ${g.room}`:"Not in hotel"}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}><div className="mono xs gold">{g.loyalty.toLocaleString()} pts</div><StatusBadge status={g.status}/></div>
              </div>
            ))}
            {filtered.length===0&&<div className="empty-state"><span>👤</span><span className="sm muted">No guests found</span></div>}
          </div>
        </div>
        <div className="card">
          {selected?(
            <>
              <div className="card-hd"><span className="card-title">Profile</span><button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕</button></div>
              <div className="card-body">
                <div className="flex fac gap3 mb4">
                  <Av name={selected.name} size="lg"/>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:18,color:"var(--tx)"}}>{selected.name}{selected.vip&&<span style={{color:"var(--gold)",fontSize:13,marginLeft:6}}>★</span>}</div>
                    <div className="xs muted mt2">{selected.email||"—"}</div>
                    <div className="xs muted">{selected.phone}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:13}}>
                  {[["Stays",selected.stays],["Spent",BDT(selected.spent)],["Points",selected.loyalty.toLocaleString()]].map(([l,v])=>(
                    <div key={l} style={{textAlign:"center",padding:"8px 5px",background:"var(--s2)",borderRadius:8,border:"1px solid var(--br2)"}}>
                      <div className="mono xs muted" style={{letterSpacing:".1em",textTransform:"uppercase",marginBottom:2}}>{l}</div>
                      <div className="serif" style={{fontSize:17,color:"var(--gold)"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div className="info-grid mb4">
                  {[["Nationality",selected.nationality],["Room",selected.room?`Room ${selected.room}`:"—"],["Status",selected.status],["Since",selected.joined]].map(([l,v])=>(
                    <div key={l} className="info-box"><div className="info-lbl">{l}</div><div className="info-val">{v}</div></div>
                  ))}
                </div>
                <div className="mb4">
                  <div className="flex fac fjb mb2"><div className="info-lbl">Notes</div>
                    {canEdit&&<button className="btn btn-ghost btn-sm" onClick={()=>{setEditNotes(!editNotes);setNotesVal(selected.notes);}}>{editNotes?"Cancel":"Edit"}</button>}
                  </div>
                  {editNotes?(
                    <div><textarea className="ftextarea" value={notesVal} onChange={e=>setNotesVal(e.target.value)}/>
                    <button className="btn btn-gold btn-sm mt2" onClick={()=>{setGuests(p=>p.map(g=>g.id===selected.id?{...g,notes:notesVal}:g));setEditNotes(false);toast("Notes saved","success");}}>Save</button></div>
                  ):(
                    <div style={{fontSize:11.5,color:"var(--tx2)",padding:"7px 9px",background:"var(--s2)",borderRadius:7,minHeight:36}}>{selected.notes||<em style={{color:"var(--tx3)"}}>No notes</em>}</div>
                  )}
                </div>
                {canEdit&&<div className="flex gap2" style={{flexWrap:"wrap"}}>
                  <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>{setGuests(p=>p.map(g=>g.id===selected.id?{...g,vip:!g.vip}:g));setSelected(p=>({...p,vip:!p.vip}));toast("VIP updated","success");}}>{selected.vip?"Remove VIP":"★ Set VIP"}</button>
                  <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>toast(`Message sent to ${selected.name}`,"success")}>✉ Message</button>
                </div>}
              </div>
            </>
          ):(
            <div className="empty-state" style={{minHeight:280}}><span>👤</span><span className="sm muted">Select a guest</span></div>
          )}
        </div>
      </div>

      {showAdd&&(
        <Modal title="Add New Guest" onClose={()=>setShowAdd(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-gold" onClick={()=>{if(!form.name||!form.phone)return toast("Name & phone required","error");setGuests(p=>[{id:p.length+1,...form,room:null,status:"reserved",vip:false,stays:0,spent:0,loyalty:0,joined:fmtDate(TODAY)},...p]);toast(`${form.name} added`,"success");setShowAdd(false);setForm({name:"",email:"",phone:"",nationality:"Bangladesh",notes:""});}}>Add Guest</button></>}>
          <div className="frow">
            <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Full name"/></div>
            <div className="fg"><label className="flbl">Nationality</label><input className="finput" value={form.nationality} onChange={e=>setForm(p=>({...p,nationality:e.target.value}))}/></div>
          </div>
          <div className="fg"><label className="flbl">Phone * <span style={{color:"var(--rose)"}}>mandatory</span></label><input className="finput" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+880-1700-000000"/></div>
          <div className="fg"><label className="flbl">Email <span className="xs muted">(optional)</span></label><input type="email" className="finput" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="email@example.com (optional)"/></div>
          <div className="fg"><label className="flbl">Notes</label><textarea className="ftextarea" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Preferences, special requests..."/></div>
        </Modal>
      )}
    </div>
  );
}

// ─── HOUSEKEEPING ──────────────────────────────────────────────────
function HousekeepingPage({tasks,setTasks,rooms,toast,currentUser}) {
  const canEdit=["superadmin","manager","housekeeping"].includes(currentUser?.role);
  const [filter,setFilter]=useState("all");
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({room:"",type:"Cleaning",priority:"medium",assignee:"Sumaiya Begum",time:"09:00",notes:""});
  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);

  return (
    <div>
      <div className="stats-row">
        {[{l:"Total",v:tasks.length,ac:"#58A6FF"},{l:"Completed",v:tasks.filter(t=>t.status==="completed").length,ac:"#3FB950"},{l:"In Progress",v:tasks.filter(t=>t.status==="in-progress").length,ac:"#F0A500"},{l:"Pending",v:tasks.filter(t=>t.status==="pending").length,ac:"#E05C7A"}].map(s=>(
          <div key={s.l} className="stat" style={{"--ac":s.ac}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{color:s.ac}}>{s.v}</div></div>
        ))}
      </div>
      <div className="flex fac fjb mb4 gap3" style={{flexWrap:"wrap"}}>
        <div className="tabs">{["all","pending","in-progress","completed"].map(s=>(
          <button key={s} className={`tab${filter===s?" active":""}`} onClick={()=>setFilter(s)}>
            {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")} ({s==="all"?tasks.length:tasks.filter(t=>t.status===s).length})
          </button>
        ))}</div>
        {canEdit&&<button className="btn btn-gold" onClick={()=>setShowAdd(true)}>＋ Add Task</button>}
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["Room","Task","Dept","Priority","Assigned","Time","Notes","Status","Action"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id}>
                  <td><span style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:20}}>{t.room}</span></td>
                  <td className="bold sm">{t.type}</td>
                  <td><Badge color={t.dept==="Maintenance"?"red":"blue"}>{t.dept}</Badge></td>
                  <td><div className="flex fac gap2"><div className={`pdot ${t.priority}`}/><span className="sm" style={{textTransform:"capitalize"}}>{t.priority}</span></div></td>
                  <td className="sm">{t.assignee}</td>
                  <td className="mono xs">{t.time}</td>
                  <td className="xs muted" style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.notes||"—"}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td>{canEdit&&<div className="flex gap2">
                    {t.status==="pending"&&<button className="btn btn-ghost btn-sm" onClick={()=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,status:"in-progress"}:x));toast("Task started","success");}}>Start</button>}
                    {t.status==="in-progress"&&<button className="btn btn-success btn-sm" onClick={()=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,status:"completed"}:x));toast("✓ Done","success");}}>✓ Done</button>}
                  </div>}</td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:24,color:"var(--tx3)"}}>No tasks</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd&&(
        <Modal title="Add Task" onClose={()=>setShowAdd(false)}
          footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-gold" onClick={()=>{if(!form.room)return toast("Select room","error");setTasks(p=>[...p,{id:p.length+1,...form,dept:["AC Repair","Plumbing"].includes(form.type)?"Maintenance":"Housekeeping",status:"pending"}]);toast(`Task added for room ${form.room}`,"success");setShowAdd(false);setForm({room:"",type:"Cleaning",priority:"medium",assignee:"Sumaiya Begum",time:"09:00",notes:""});}}>Add</button></>}>
          <div className="frow">
            <div className="fg"><label className="flbl">Room *</label><select className="fselect" value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value}))}><option value="">Select...</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.id} ({r.status})</option>)}</select></div>
            <div className="fg"><label className="flbl">Task Type</label><select className="fselect" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>{["Cleaning","Deep Clean","Turndown","Inspection","VIP Setup","AC Repair","Plumbing","Extra Supplies"].map(t=><option key={t}>{t}</option>)}</select></div>
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

// ─── BILLING ───────────────────────────────────────────────────────
function BillingPage({guests,transactions,setTransactions,rooms,folios,setFolios,toast}) {
  const [sg,setSg]=useState(guests.find(g=>g.status==="checked-in"));
  const charges=sg?(folios[sg.room]||[]):[];
  const sub=charges.reduce((a,c)=>a+c.amt,0);
  const tax=Math.round(sub*0.07); const svc=Math.round(sub*0.05); const total=sub+tax+svc;
  const [showPay,setShowPay]=useState(false);
  const [payM,setPayM]=useState("Cash"); const [payAmt,setPayAmt]=useState("");
  const [showCharge,setShowCharge]=useState(false);
  const [cf,setCf]=useState({type:"Room Service",amount:"",desc:""});

  function addCharge(){
    if(!cf.amount||isNaN(cf.amount))return toast("Valid amount required","error");
    setFolios(p=>({...p,[sg.room]:[...(p[sg.room]||[]),{id:Date.now(),desc:cf.desc||cf.type,amt:parseFloat(cf.amount),cat:cf.type}]}));
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:sg.name,type:cf.type,room:sg.room,amount:parseFloat(cf.amount),method:"Room Charge",status:"completed"},...p]);
    toast(`Charge: ${BDT(cf.amount)}`,"success");setShowCharge(false);setCf({type:"Room Service",amount:"",desc:""});
  }
  function pay(){
    const amt=parseFloat(payAmt);if(!amt||amt<=0)return toast("Valid amount required","error");
    setTransactions(p=>[{id:`TXN-${Date.now()}`,date:fmtDate(TODAY),time:nowTime(),guest:sg.name,type:"Payment",room:sg.room,amount:amt,method:payM,status:"completed"},...p]);
    toast(`Payment ${BDT(amt)} via ${payM}`,"success");setShowPay(false);setPayAmt("");
  }

  return (
    <div className="g2">
      <div>
        <div className="card mb4">
          <div className="card-hd"><span className="card-title">Checked-In Guests</span></div>
          <div className="card-body" style={{padding:"3px 15px"}}>
            {guests.filter(g=>g.status==="checked-in").map(g=>(
              <div key={g.id} className="g-row" onClick={()=>setSg(g)} style={{background:sg?.id===g.id?"rgba(200,169,110,.05)":undefined}}>
                <Av name={g.name} size="sm"/>
                <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:500}}>{g.name}{g.vip&&<span style={{color:"var(--gold)",fontSize:9,marginLeft:4}}>★</span>}</div><div className="xs muted">Room {g.room}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Quick Charge</span></div>
          <div className="card-body"><div className="flex gap2" style={{flexWrap:"wrap"}}>
            {["Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Bar","Transfer"].map(t=>(
              <button key={t} className="btn btn-ghost btn-sm" disabled={!sg} onClick={()=>{setCf(p=>({...p,type:t}));setShowCharge(true);}}>{t}</button>
            ))}
          </div></div>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">Folio</span>{sg&&<div className="flex gap2"><Badge color="blue">Room {sg.room}</Badge><button className="btn btn-ghost btn-sm" onClick={()=>setShowCharge(true)}>＋</button></div>}</div>
        <div className="card-body">
          {sg?(
            <>
              <div className="flex fac gap3 mb4 pb4" style={{borderBottom:"1px solid var(--br2)"}}>
                <Av name={sg.name}/><div><div className="bold sm">{sg.name}</div><div className="xs mono muted">Room {sg.room}</div></div>
              </div>
              {charges.map((c,i)=>(
                <div key={i} className="folio-row"><span className="sm muted">{c.desc}</span><span className="mono xs gold">{BDT(c.amt)}</span></div>
              ))}
              {charges.length===0&&<div style={{padding:"12px 0",color:"var(--tx3)",fontSize:11.5,textAlign:"center"}}>No charges</div>}
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
            <div className="empty-state" style={{minHeight:260}}><span>💰</span><span className="sm muted">Select a guest</span></div>
          )}
        </div>
      </div>
      {showCharge&&<Modal title="Add Charge" onClose={()=>setShowCharge(false)} footer={<><button className="btn btn-ghost" onClick={()=>setShowCharge(false)}>Cancel</button><button className="btn btn-gold" onClick={addCharge}>Add</button></>}>
        <div className="fg"><label className="flbl">Type</label><select className="fselect" value={cf.type} onChange={e=>setCf(p=>({...p,type:e.target.value}))}>{["Room Charge","Room Service","Restaurant","Spa","Minibar","Laundry","Parking","Airport Transfer","Bar & Lounge","Gift Shop","Misc"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label className="flbl">Amount (BDT) *</label><input type="number" className="finput" value={cf.amount} onChange={e=>setCf(p=>({...p,amount:e.target.value}))} placeholder="0"/></div>
        <div className="fg"><label className="flbl">Description</label><input className="finput" value={cf.desc} onChange={e=>setCf(p=>({...p,desc:e.target.value}))} placeholder="Optional..."/></div>
      </Modal>}
      {showPay&&<Modal title="Process Payment" onClose={()=>setShowPay(false)} footer={<><button className="btn btn-ghost" onClick={()=>setShowPay(false)}>Cancel</button><button className="btn btn-gold" onClick={pay}>Confirm</button></>}>
        <div style={{padding:"9px 12px",background:"rgba(200,169,110,.06)",borderRadius:8,border:"1px solid rgba(200,169,110,.15)",marginBottom:12}}>
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

// ─── REPORTS ────────────────────────────────────────────────────────
function ReportsPage({transactions,rooms,reservations,guests}) {
  const [tab,setTab]=useState("daily");
  const [date,setDate]=useState(fmtDate(TODAY));
  const [search,setSearch]=useState("");
  const [fType,setFType]=useState("all");
  const [fMethod,setFMethod]=useState("all");
  const [chartActive,setChartActive]=useState(6);
  const [tokenInput,setTokenInput]=useState("");
  const [tokens,setTokens]=useState(INIT_TOKENS); // { date: amount }
  const [showReportModal,setShowReportModal]=useState(false);

  const all=[...transactions,...SEED_TXN];
  const daily=all
    .filter(t=>t.date===date)
    .filter(t=>search===""||t.guest.toLowerCase().includes(search.toLowerCase())||t.id.includes(search))
    .filter(t=>fType==="all"||t.type===fType)
    .filter(t=>fMethod==="all"||t.method===fMethod)
    .sort((a,b)=>b.time.localeCompare(a.time));

  const rev=daily.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0);
  const tokenAmt=tokens[date]||0;
  const closing=Math.max(0,rev-tokenAmt);

  const byType={};daily.forEach(t=>{if(t.status==="completed")byType[t.type]=(byType[t.type]||0)+t.amount;});
  const byMethod={};daily.forEach(t=>{if(t.status==="completed")byMethod[t.method]=(byMethod[t.method]||0)+t.amount;});

  const mData=Array.from({length:7},(_,i)=>{
    const d=addDays(TODAY,-(6-i)*30);
    const m=d.toLocaleDateString("en",{month:"short"});
    const v=all.filter(t=>t.date.startsWith(d.toISOString().slice(0,7))).reduce((a,t)=>a+(t.status==="completed"?t.amount:0),0)||(2000000+Math.random()*1500000);
    return {m,v:Math.round(v),occ:55+Math.floor(Math.random()*35)};
  });

  const types=[...new Set(all.map(t=>t.type))].sort();
  const methods=[...new Set(all.map(t=>t.method))].sort();

  function openReportModal(){ setShowReportModal(true); }

  return (
    <div>
      <div className="tabs mb4">
        {["daily","monthly","overview"].map(t=><button key={t} className={`tab${tab===t?" active":""}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
      </div>

      {tab==="daily"&&(
        <div>
          {/* Filters row */}
          <div className="card mb4">
            <div className="card-body" style={{padding:12}}>
              <div className="flex fac gap3" style={{flexWrap:"wrap"}}>
                <div className="flex fac gap2"><span className="xs mono muted">DATE</span>
                  <input type="date" className="finput" style={{width:150}} value={date} onChange={e=>setDate(e.target.value)} max={fmtDate(TODAY)}/></div>
                <SearchBox value={search} onChange={setSearch} placeholder="Search..."/>
                <div className="flex fac gap2"><span className="xs muted">Type:</span><select className="fselect" style={{width:140,padding:"6px 26px 6px 8px"}} value={fType} onChange={e=>setFType(e.target.value)}><option value="all">All Types</option>{types.map(t=><option key={t}>{t}</option>)}</select></div>
                <div className="flex fac gap2"><span className="xs muted">Method:</span><select className="fselect" style={{width:140,padding:"6px 26px 6px 8px"}} value={fMethod} onChange={e=>setFMethod(e.target.value)}><option value="all">All Methods</option>{methods.map(m=><option key={m}>{m}</option>)}</select></div>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearch("");setFType("all");setFMethod("all");}}>Reset</button>
              </div>
            </div>
          </div>

          {/* Daily Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:11,marginBottom:13}}>
            {[{l:"Transactions",v:daily.length,c:"#58A6FF"},{l:"Total Revenue",v:BDT(rev),c:"#C8A96E"},{l:"Avg Transaction",v:daily.filter(t=>t.status==="completed").length?BDT(Math.round(rev/Math.max(1,daily.filter(t=>t.status==="completed").length))):"৳0",c:"#2EC4B6"},{l:"Pending",v:BDT(daily.filter(t=>t.status==="pending").reduce((a,t)=>a+t.amount,0)),c:"#E05C7A"}].map(s=>(
              <div key={s.l} className="stat" style={{"--ac":s.c}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{fontSize:22,color:s.c}}>{s.v}</div></div>
            ))}
          </div>

          {/* TOKEN AMOUNT BLOCK */}
          <div className="token-block">
            <div className="token-lbl">Token Amount — {date}</div>
            <div className="token-row" style={{flexWrap:"wrap",gap:8}}>
              <input
                type="number"
                className="finput"
                style={{maxWidth:200}}
                value={tokenInput !== "" ? tokenInput : (tokenAmt > 0 ? tokenAmt : "")}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="৳0 — Enter token amount"
              />
              <button className="btn btn-gold btn-sm" onClick={()=>{
                const amt=parseFloat(tokenInput!==""?tokenInput:tokenAmt);
                if(isNaN(amt)||amt<0)return;
                setTokens(p=>({...p,[date]:amt}));
                setTokenInput("");
              }}>💾 Save Token</button>
              {tokenAmt>0&&<>
                <span style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:18,color:"var(--gold)",alignSelf:"center"}}>Saved: {BDT(tokenAmt)}</span>
                <button className="btn btn-danger btn-sm" onClick={()=>{setTokens(p=>{const x={...p};delete x[date];return x;});setTokenInput("");}}>✕ Clear</button>
              </>}
            </div>
          </div>

          {/* CLOSING REPORT */}
          <div className="closing-block mb4">
            <div className="flbl" style={{color:"var(--grn)"}}>Closing Report — {date}</div>
            <div className="flex gap4 mt2" style={{flexWrap:"wrap"}}>
              {[["Total Revenue",BDT(rev),"var(--gold)"],["Token Amount","− "+BDT(tokenAmt),"var(--rose)"],["Closing Balance",BDT(closing),"var(--grn)"]].map(([l,v,c])=>(
                <div key={l} style={{flex:1,minWidth:120}}>
                  <div className="xs muted mb2" style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",letterSpacing:".08em",textTransform:"uppercase"}}>{l}</div>
                  <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:24,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category/Method charts */}
          {Object.keys(byType).length>0&&(
            <div className="g2 mb4">
              <div className="card"><div className="card-hd"><span className="card-title">By Category</span></div><div className="card-body">
                {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,a],i)=>(
                  <div key={t} style={{marginBottom:9}}><div className="flex fjb sm mb1"><span className="muted">{t}</span><span className="mono xs gold">{BDT(a)}</span></div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${(a/Object.values(byType)[0])*100}%`,background:`hsl(${i*42},60%,55%)`}}/></div></div>
                ))}
              </div></div>
              <div className="card"><div className="card-hd"><span className="card-title">By Method</span></div><div className="card-body">
                {Object.entries(byMethod).sort((a,b)=>b[1]-a[1]).map(([m,a])=>(
                  <div key={m} style={{marginBottom:9}}><div className="flex fjb sm mb1"><span className="muted">{m}</span><span className="mono xs gold">{BDT(a)}</span></div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${rev>0?(a/rev)*100:0}%`,background:"var(--gold)"}}/></div></div>
                ))}
                {Object.keys(byMethod).length===0&&<div className="empty-state" style={{padding:18}}><span className="sm muted">No completed transactions</span></div>}
              </div></div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="card">
            <div className="card-hd">
              <span className="card-title">Transactions — {date}</span>
              <div className="flex gap2 fac" style={{flexWrap:"wrap"}}>
                <Badge color="blue">{daily.length}</Badge>
                <Badge color="gold">{BDT(rev)}</Badge>
                <button className="btn btn-info btn-sm" onClick={openReportModal}>📋 View Full Report</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["TXN ID","Time","Guest","Type","Room","Amount","Method","Status"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {daily.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:24,color:"var(--tx3)"}}>No transactions for {date}</td></tr>}
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
            {daily.length>0&&(
              <div style={{padding:"10px 15px",borderTop:"1px solid var(--br2)"}}>
                <div className="flex fjb" style={{marginBottom:4}}>
                  <span className="xs muted">{daily.length} records · {daily.filter(t=>t.status==="completed").length} completed</span>
                  <span className="mono xs gold">Revenue: {BDT(rev)}</span>
                </div>
                <div className="flex fjb">
                  <span className="xs muted">Token: {BDT(tokenAmt)}</span>
                  <span className="mono xs" style={{color:"var(--grn)"}}>Closing: {BDT(closing)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORT MODAL (in-app, no popups, no blobs) ── */}
      {showReportModal&&(
        <div className="modal-bg" onClick={()=>setShowReportModal(false)}>
          <div className="modal modal-wide" style={{maxWidth:820,maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd" style={{background:"#0C1118"}}>
              <div>
                <div className="modal-title" style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:20}}>🏨 Lumea — Daily Report</div>
                <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,letterSpacing:".1em",color:"var(--tx3)",marginTop:2,textTransform:"uppercase"}}>
                  {date} · Dhaka, Bangladesh · UTC +06:00
                </div>
              </div>
              <div className="flex gap2">
                <PDFReportBtn date={date} rev={rev} tokenAmt={tokenAmt} closing={closing} daily={daily}/>
                <button className="modal-close" onClick={()=>setShowReportModal(false)}>×</button>
              </div>
            </div>
            <div className="modal-body" style={{padding:0}}>
              {/* Summary boxes */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,borderBottom:"1px solid var(--br2)"}}>
                {[
                  ["Total Revenue",BDT(rev),"#C8A96E"],
                  ["Token Amount","− "+BDT(tokenAmt),"#E05C7A"],
                  ["Closing Balance",BDT(closing),"#3FB950"],
                  ["Transactions",daily.length,"#58A6FF"],
                ].map(([l,v,c],i)=>(
                  <div key={l} style={{padding:"16px 18px",borderRight:i<3?"1px solid var(--br2)":undefined}}>
                    <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:8.5,letterSpacing:".1em",color:"var(--tx3)",textTransform:"uppercase",marginBottom:5}}>{l}</div>
                    <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:22,color:c}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Transactions table */}
              <div style={{overflowY:"auto",maxHeight:"52vh"}}>
                <table className="tbl" style={{fontSize:11.5}}>
                  <thead style={{position:"sticky",top:0,background:"var(--s1)",zIndex:1}}>
                    <tr>{["TXN ID","Time","Guest","Type","Room","Amount","Method","Status"].map(h=><th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {daily.length===0&&(
                      <tr><td colSpan={8} style={{textAlign:"center",padding:28,color:"var(--tx3)"}}>No transactions for {date}</td></tr>
                    )}
                    {daily.map(t=>(
                      <tr key={t.id}>
                        <td className="mono xs muted">{t.id}</td>
                        <td className="mono xs">{t.time}</td>
                        <td>
                          <div className="flex fac gap2">
                            <div className="av av-sm" style={{background:`linear-gradient(135deg,${avColor(t.guest)},rgba(0,0,0,.4))`}}>{initials(t.guest)}</div>
                            {t.guest}
                          </div>
                        </td>
                        <td><span className="badge bgold" style={{fontSize:9}}>{t.type}</span></td>
                        <td><span className="badge bb" style={{fontSize:9}}>{t.room}</span></td>
                        <td className="mono xs gold">{BDT(t.amount)}</td>
                        <td className="sm muted">{t.method}</td>
                        <td><span className={`badge ${t.status==="completed"?"bg":"ba"}`} style={{fontSize:9}}>{t.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer summary row */}
              <div style={{padding:"11px 16px",borderTop:"1px solid var(--br2)",background:"rgba(200,169,110,.04)",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:9}}>
                <span className="xs muted mono">{daily.length} records · {daily.filter(t=>t.status==="completed").length} completed · Generated {new Date().toLocaleString("en-BD")}</span>
                <div className="flex gap3">
                  <span className="xs mono">Revenue: <span className="gold">{BDT(rev)}</span></span>
                  <span className="xs mono">Token: <span style={{color:"var(--rose)"}}>−{BDT(tokenAmt)}</span></span>
                  <span className="xs mono">Closing: <span style={{color:"var(--grn)"}}>{BDT(closing)}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab==="monthly"&&(
        <div>
          <div className="stats-row">
            {[{l:"This Month",v:BDT(mData[6].v),ac:"#C8A96E"},{l:"Avg Occupancy",v:`${Math.round(mData.reduce((a,d)=>a+d.occ,0)/7)}%`,ac:"#2EC4B6"},{l:"RevPAR",v:BDT(7440),ac:"#58A6FF"},{l:"ADR",v:BDT(12480),ac:"#3FB950"}].map(s=>(
              <div key={s.l} className="stat" style={{"--ac":s.ac}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{color:s.ac,fontSize:20}}>{s.v}</div></div>
            ))}
          </div>
          <div className="g2 mt4">
            <div className="card"><div className="card-hd"><span className="card-title">Monthly Revenue</span></div><div className="card-body"><BarChart data={mData} vk="v" lk="m" active={chartActive} onHover={setChartActive}/><div className="flex fjb sm mt3"><span className="muted">{mData[chartActive].m}</span><span className="mono gold">{BDT(mData[chartActive].v)}</span></div></div></div>
            <div className="card"><div className="card-hd"><span className="card-title">Occupancy Trend</span></div><div className="card-body">{mData.map((d,i)=>(
              <div key={i} style={{marginBottom:10}}><div className="flex fjb sm mb1"><span className="muted">{d.m}</span><span className="mono xs" style={{color:"#2EC4B6"}}>{d.occ}%</span></div>
              <div className="progress-bar"><div className="progress-fill" style={{width:`${d.occ}%`,background:"linear-gradient(90deg,#2EC4B6,#58A6FF)"}}/></div></div>
            ))}</div></div>
          </div>
        </div>
      )}

      {tab==="overview"&&(
        <div>
          <div className="g4 mb4">
            {[{l:"Total Guests",v:guests.length,c:"#2EC4B6"},{l:"Total Rooms",v:rooms.length,c:"#58A6FF"},{l:"Reservations",v:reservations.length,c:"#C8A96E"},{l:"Lifetime Revenue",v:BDT(all.filter(t=>t.status==="completed").reduce((a,t)=>a+t.amount,0)),c:"#3FB950"}].map(s=>(
              <div key={s.l} className="stat" style={{"--ac":s.c}}><div className="stat-lbl">{s.l}</div><div className="stat-val" style={{color:s.c,fontSize:18}}>{s.v}</div></div>
            ))}
          </div>
          <div className="g2">
            <div className="card"><div className="card-hd"><span className="card-title">Room Type Performance</span></div><div className="card-body">
              {[["Standard",5,4500,50,"#3FB950"],["Deluxe",4,8500,75,"#58A6FF"],["Suite",3,18000,67,"#C8A96E"],["Presidential",2,45000,50,"#E05C7A"]].map(([t,c,r,o,col])=>(
                <div key={t} style={{marginBottom:12}}><div className="flex fjb sm mb1"><span className="bold">{t}</span><span className="mono xs" style={{color:col}}>{o}%</span></div>
                <div className="flex fjb xs muted mb1"><span>{c} rooms · {BDT(r)}/night</span><span className="gold">RevPAR: {BDT(Math.round(r*o/100))}</span></div>
                <div className="progress-bar"><div className="progress-fill" style={{width:`${o}%`,background:col}}/></div></div>
              ))}
            </div></div>
            <div className="card"><div className="card-hd"><span className="card-title">Booking Sources</span></div><div className="card-body">
              {[["Direct",35,"#C8A96E"],["Booking.com",28,"#58A6FF"],["Expedia",18,"#2EC4B6"],["Corporate",12,"#3FB950"],["Airbnb",7,"#9B72CF"]].map(([s,p,c])=>(
                <div key={s} style={{marginBottom:11}}><div className="flex fjb sm mb1"><span className="muted">{s}</span><span className="mono xs" style={{color:c}}>{p}%</span></div>
                <div className="progress-bar"><div className="progress-fill" style={{width:`${p}%`,background:c}}/></div></div>
              ))}
            </div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS ──────────────────────────────────────────────────────
function SettingsPage({toast,currentUser}) {
  const isSA=currentUser?.role==="superadmin";
  const [editableUsers,setEditableUsers]=useState(HOTEL_USERS.map(u=>({...u})));
  const [settings,setSettings]=useState({
    hotelName:"My Hotel",country:"Bangladesh",city:"Dhaka",
    currency:"BDT",currencySymbol:"৳",timezone:"Asia/Dhaka (UTC +06:00)",
    checkInTime:"14:00",checkOutTime:"12:00",taxRate:"7",serviceCharge:"5",
    emailNotif:true,smsNotif:true,autoAssign:false,maintenanceAlerts:true,
    language:"English (Bangladesh)",
  });

  return (
    <div style={{maxWidth:700}}>
      {!isSA&&<div style={{background:"rgba(88,166,255,.07)",border:"1px solid rgba(88,166,255,.2)",borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:"var(--sky)"}}>ℹ️ Read-only. Contact Super Admin to make changes.</div>}

      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Hotel Information</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            {[["hotelName","Hotel Name","text"],["city","City","city-select"],["country","Country","country-select"],["currency","Currency","currency-select"],["timezone","Timezone","tz-select"],["language","Language","lang-select"]].map(([k,l,type])=>(
              <div key={k} className="fg">
                <label className="flbl">{l}</label>
                {type==="city-select"?<select className="fselect" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}><option>Dhaka</option><option>Chittagong</option><option>Sylhet</option><option>Rajshahi</option><option>Khulna</option></select>
                :type==="country-select"?<select className="fselect" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}><option>Bangladesh</option><option>India</option><option>UAE</option><option>Singapore</option><option>UK</option></select>
                :type==="currency-select"?<select className="fselect" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}><option value="BDT">BDT — Taka (৳)</option><option value="USD">USD — Dollar ($)</option><option value="EUR">EUR — Euro (€)</option></select>
                :type==="tz-select"?<select className="fselect" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}><option>Asia/Dhaka (UTC +06:00)</option><option>Asia/Kolkata (UTC +05:30)</option><option>Asia/Dubai (UTC +04:00)</option><option>Europe/London (UTC +00:00)</option></select>
                :type==="lang-select"?<select className="fselect" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}><option>English (Bangladesh)</option><option>বাংলা</option><option>Arabic</option></select>
                :<input className="finput" value={settings[k]} onChange={e=>setSettings(p=>({...p,[k]:e.target.value}))} disabled={!isSA}/>}
              </div>
            ))}
          </div>
          <div style={{padding:"9px 12px",background:"rgba(200,169,110,.05)",borderRadius:7,border:"1px solid rgba(200,169,110,.13)",marginTop:6}}>
            <div className="xs mono muted mb2">ACTIVE CONFIGURATION</div>
            <div className="flex gap4" style={{flexWrap:"wrap"}}>
              {[["Country",settings.country],["City",settings.city],["Currency",settings.currency+" ("+settings.currencySymbol+")"],["Timezone",settings.timezone.split(" ")[0]]].map(([l,v])=>(
                <div key={l}><div className="xs muted">{l}</div><div className="sm gold bold">{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Operations</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <div className="fg"><label className="flbl">Check-In Time</label><input type="time" className="finput" value={settings.checkInTime} onChange={e=>setSettings(p=>({...p,checkInTime:e.target.value}))} disabled={!isSA}/></div>
            <div className="fg"><label className="flbl">Check-Out Time</label><input type="time" className="finput" value={settings.checkOutTime} onChange={e=>setSettings(p=>({...p,checkOutTime:e.target.value}))} disabled={!isSA}/></div>
            <div className="fg"><label className="flbl">VAT Rate (%)</label><input type="number" className="finput" value={settings.taxRate} onChange={e=>setSettings(p=>({...p,taxRate:e.target.value}))} disabled={!isSA}/></div>
            <div className="fg"><label className="flbl">Service Charge (%)</label><input type="number" className="finput" value={settings.serviceCharge} onChange={e=>setSettings(p=>({...p,serviceCharge:e.target.value}))} disabled={!isSA}/></div>
          </div>
        </div>
      </div>

      {/* User Roles — Super Admin only, fully editable */}
      {isSA&&(
        <div className="card mb4">
          <div className="card-hd">
            <span className="card-title">User Roles & Access</span>
            <div className="flex fac gap2"><div className="sync-dot"/><span className="xs muted">Super Admin Only · Editable</span></div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Email</th><th>Password</th><th>Role</th><th>Allowed Pages</th></tr></thead>
              <tbody>
                {editableUsers.map((u,idx)=>(
                  <tr key={u.id}>
                    <td>
                      <div className="flex fac gap2">
                        <div className="av av-sm" style={{background:`linear-gradient(135deg,${avColor(u.name)},rgba(0,0,0,.4))`}}>{u.avatar}</div>
                        <input
                          className="finput"
                          style={{padding:"4px 7px",fontSize:11.5,minWidth:120}}
                          value={u.name}
                          onChange={e=>setEditableUsers(p=>p.map((x,i)=>i===idx?{...x,name:e.target.value}:x))}
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        className="finput mono"
                        style={{padding:"4px 7px",fontSize:11,minWidth:190}}
                        value={u.email}
                        onChange={e=>setEditableUsers(p=>p.map((x,i)=>i===idx?{...x,email:e.target.value}:x))}
                      />
                    </td>
                    <td>
                      <input
                        className="finput mono"
                        style={{padding:"4px 7px",fontSize:11,minWidth:110}}
                        value={u.password}
                        onChange={e=>setEditableUsers(p=>p.map((x,i)=>i===idx?{...x,password:e.target.value}:x))}
                      />
                    </td>
                    <td>
                      <select
                        className="fselect"
                        style={{padding:"4px 26px 4px 8px",fontSize:11.5,minWidth:140}}
                        value={u.role}
                        onChange={e=>setEditableUsers(p=>p.map((x,i)=>i===idx?{...x,role:e.target.value}:x))}
                      >
                        {Object.keys(ROLES).map(r=><option key={r} value={r}>{ROLES[r].label}</option>)}
                      </select>
                    </td>
                    <td className="xs muted" style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{color:ROLES[u.role]?.color,fontSize:10,fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif"}}>{ROLES[u.role]?.pages.join(", ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:"10px 15px",borderTop:"1px solid var(--br2)",display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditableUsers(HOTEL_USERS.map(u=>({...u})))}>↺ Reset</button>
            <button className="btn btn-gold btn-sm" onClick={()=>toast("User roles saved ✓","success")}>💾 Save Changes</button>
          </div>
        </div>
      )}

      <div className="card mb4">
        <div className="card-hd"><span className="card-title">Notifications</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            {[["emailNotif","Email Notifications"],["smsNotif","SMS Notifications"],["autoAssign","Auto-assign Housekeeping"],["maintenanceAlerts","Maintenance Alerts"]].map(([k,l])=>(
              <div key={k}><div className="flbl">{l}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:5}}>
                  <div className="toggle" style={{background:settings[k]?"var(--gold)":"var(--s3)"}} onClick={()=>isSA&&setSettings(p=>({...p,[k]:!p[k]}))}>
                    <div className="toggle-knob" style={{left:settings[k]?19:3}}/>
                  </div>
                  <span className="sm muted">{settings[k]?"Enabled":"Disabled"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isSA&&<div className="flex gap2">
        <button className="btn btn-ghost">Reset Defaults</button>
        <button className="btn btn-gold" onClick={()=>toast("Settings saved ✓","success")}>💾 Save Settings</button>
      </div>}
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────
// CRM APP — Lumea Hotel CRM embedded in SaaS shell
// ────────────────────────────────────────────────────────────────────────
function CRMApp({tenant, toast}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [rooms, setRooms] = useState(INIT_ROOMS);
  const [guests, setGuests] = useState(INIT_GUESTS);
  const [reservations, setReservations] = useState(INIT_RESERVATIONS);
  const [tasks, setTasks] = useState(INIT_TASKS);
  const [transactions, setTransactions] = useState([]);
  const [folios, setFolios] = useState(INIT_FOLIOS);
  const [notifOpen, setNotifOpen] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(()=>{ const t=setInterval(()=>setClock(new Date()),1000); return()=>clearInterval(t); },[]);

  const brandColor = tenant?.brandColor || "var(--gold)";
  const hotelName  = tenant?.hotelName  || "My Hotel";

  // CRM login screen
  if (!currentUser) {
    const roleIcons = {superadmin:"👑",manager:"🏨",receptionist:"🛎️",housekeeping:"🧹",accountant:"💰"};
    return <CRMLogin onLogin={setCurrentUser} hotelName={hotelName} brandColor={brandColor} roleIcons={roleIcons}/>;
  }

  const allowedPages = ROLES[currentUser.role]?.pages || [];
  const curPage = allowedPages.includes(page) ? page : allowedPages[0];
  const pendingRes = reservations.filter(r=>r.status==="pending").length;
  const pendingTasks = tasks.filter(t=>t.status==="pending"&&t.priority==="high").length;

  const NAV = [
    {id:"dashboard",    ico:"⬡",label:"Dashboard",section:"OVERVIEW"},
    {id:"rooms",        ico:"▦",label:"Room Management"},
    {id:"reservations", ico:"◈",label:"Reservations",badge:pendingRes},
    {id:"guests",       ico:"◉",label:"Guests & CRM"},
    {id:"housekeeping", ico:"✦",label:"Housekeeping",badge:pendingTasks,section:"OPERATIONS"},
    {id:"billing",      ico:"◎",label:"Billing & Invoices"},
    {id:"reports",      ico:"▣",label:"Reports",section:"ANALYTICS"},
    {id:"settings",     ico:"◌",label:"Settings",section:"SYSTEM"},
  ].filter(n=>allowedPages.includes(n.id));

  const TITLES = {dashboard:"Dashboard",rooms:"Room Management",reservations:"Reservations",guests:"Guest CRM",housekeeping:"Housekeeping",billing:"Billing & Invoices",reports:"Reports & Analytics",settings:"Settings"};

  return (
    <div className="app" style={{height:"calc(100vh - 50px)"}}>
      <aside className="sidebar" style={{borderTop:"none"}}>
        <div className="s-logo" style={{borderBottom:`1px solid ${brandColor}22`}}>
          <div style={{fontSize:18,marginBottom:3}}>🏨</div>
          <div className="s-logo-name" style={{color:brandColor}}>{hotelName}</div>
          <div className="s-logo-ver">CRM V5.2 · {tenant?.currency||"BDT"}</div>
        </div>
        <nav className="s-nav">
          {NAV.map(item=>(
            <div key={item.id}>
              {item.section&&<div className="s-sect">{item.section}</div>}
              <div className={`s-item${curPage===item.id?" active":""}`} onClick={()=>setPage(item.id)} style={curPage===item.id?{color:brandColor,borderColor:`${brandColor}33`}:{}}>
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
            <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:8,letterSpacing:".06em",color:ROLES[currentUser.role]?.color}}>{ROLES[currentUser.role]?.label}</div>
          </div>
          <button style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13,padding:3}} onClick={()=>setCurrentUser(null)} title="Sign out">⏻</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar" style={{height:46}}>
          <div className="tb-title" style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:20,color:"var(--tx)"}}>{TITLES[curPage]}</div>
          <div className="flex fac gap2"><div className="sync-dot"/><span className="xs muted">Live</span></div>
          <div className="tb-meta mono">{clock.toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
          <div style={{position:"relative"}}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setNotifOpen(!notifOpen)}>
              🔔
              {(pendingRes+pendingTasks)>0&&<span style={{position:"absolute",top:4,right:4,width:6,height:6,borderRadius:"50%",background:"var(--rose)",boxShadow:"0 0 4px var(--rose)"}}/>}
            </button>
            {notifOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",width:255,background:"var(--s1)",border:"1px solid var(--br)",borderRadius:10,boxShadow:"0 16px 48px rgba(0,0,0,.5)",zIndex:50}}>
                <div style={{padding:"9px 13px",borderBottom:"1px solid var(--br2)",fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:14}}>Notifications</div>
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {pendingRes>0&&<div style={{padding:"8px 13px",borderBottom:"1px solid var(--br2)",fontSize:11.5,color:"var(--tx2)"}}>📅 {pendingRes} pending reservation{pendingRes>1?"s":""}</div>}
                  {pendingTasks>0&&<div style={{padding:"8px 13px",borderBottom:"1px solid var(--br2)",fontSize:11.5,color:"var(--tx2)"}}>⚠ {pendingTasks} high-priority task{pendingTasks>1?"s":""}</div>}
                  {tasks.filter(t=>t.status==="in-progress").map(t=><div key={t.id} style={{padding:"8px 13px",borderBottom:"1px solid var(--br2)",fontSize:11.5,color:"var(--tx2)"}}>🧹 Room {t.room}: {t.type}</div>)}
                  {(pendingRes+pendingTasks)===0&&<div style={{padding:"14px",textAlign:"center",color:"var(--tx3)",fontSize:12}}>All clear!</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="content" style={{height:"calc(100% - 46px)"}} onClick={()=>notifOpen&&setNotifOpen(false)}>
          {curPage==="dashboard"    &&<Dashboard rooms={rooms} guests={guests} reservations={reservations} tasks={tasks} transactions={[...transactions,...SEED_TXN]} setPage={setPage}/>}
          {curPage==="rooms"        &&<RoomsPage rooms={rooms} setRooms={setRooms} folios={folios} setFolios={setFolios} guests={guests} setGuests={setGuests} setTransactions={setTransactions} toast={toast} currentUser={currentUser}/>}
          {curPage==="reservations" &&<ReservationsPage reservations={reservations} setReservations={setReservations} rooms={rooms} guests={guests} toast={toast} currentUser={currentUser}/>}
          {curPage==="guests"       &&<GuestsPage guests={guests} setGuests={setGuests} toast={toast} currentUser={currentUser}/>}
          {curPage==="housekeeping" &&<HousekeepingPage tasks={tasks} setTasks={setTasks} rooms={rooms} toast={toast} currentUser={currentUser}/>}
          {curPage==="billing"      &&<BillingPage guests={guests} transactions={[...transactions,...SEED_TXN]} setTransactions={setTransactions} rooms={rooms} folios={folios} setFolios={setFolios} toast={toast}/>}
          {curPage==="reports"      &&<ReportsPage transactions={[...transactions,...SEED_TXN]} rooms={rooms} reservations={reservations} guests={guests}/>}
          {curPage==="settings"     &&<SettingsPage toast={toast} currentUser={currentUser}/>}
        </div>
      </main>
    </div>
  );
}

// CRM Login (inside dashboard)
function CRMLogin({onLogin, hotelName, brandColor, roleIcons}) {
  const [selectedRole, setSelectedRole] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(role) {
    setSelectedRole(role);
    const u = HOTEL_USERS.find(x=>x.role===role);
    if(u){ setEmail(u.email); setPassword(u.password); }
    setError("");
  }
  function handleLogin() {
    if(!email||!password){ setError("Please enter email and password."); return; }
    setLoading(true);
    setTimeout(()=>{
      const u = HOTEL_USERS.find(x=>x.email.toLowerCase()===email.toLowerCase()&&x.password===password);
      if(u) onLogin(u);
      else { setError("Invalid credentials."); setLoading(false); }
    }, 600);
  }

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100%",padding:20}}>
      <div style={{background:"var(--s2)",border:"1px solid var(--br)",borderRadius:16,padding:"32px 30px",width:"100%",maxWidth:440,boxShadow:"0 24px 64px rgba(0,0,0,.5)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:6}}>🏨</div>
          <div style={{fontFamily:"'Helvetica Rounded Bold','Helvetica Neue',Helvetica,sans-serif",fontSize:28,color:brandColor}}>{hotelName}</div>
          <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:9,letterSpacing:".14em",color:"var(--tx3)",marginTop:3,textTransform:"uppercase"}}>Staff Login · Select Your Role</div>
        </div>

        <div style={{fontFamily:"'Helvetica Light',Helvetica,Arial,sans-serif",fontSize:8.5,letterSpacing:".1em",color:"var(--tx3)",marginBottom:8,textTransform:"uppercase"}}>Quick Role Select</div>
        <div className="login-role-grid">
          {Object.entries(ROLES).map(([key,role])=>(
            <div key={key} className={`role-pill${selectedRole===key?" selected":""}`} onClick={()=>selectRole(key)} style={selectedRole===key?{borderColor:brandColor,color:brandColor}:{}}>
              <span className="rp-ico">{roleIcons?.[key]||"👤"}</span>
              <span className="rp-lbl">{role.label}</span>
            </div>
          ))}
        </div>
        {selectedRole&&(
          <div className="login-hint">
            <strong style={{color:brandColor}}>Demo credentials:</strong><br/>
            {HOTEL_USERS.find(u=>u.role===selectedRole)?.email} / {HOTEL_USERS.find(u=>u.role===selectedRole)?.password}
          </div>
        )}
        <div className="fg"><label className="flbl">Email Address</label><input className="finput" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="your@email.com"/></div>
        <div className="fg"><label className="flbl">Password</label>
          <div style={{position:"relative"}}>
            <input className="finput" type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••" style={{paddingRight:36}}/>
            <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:13,color:"var(--tx3)"}} onClick={()=>setShowPw(!showPw)}>{showPw?"🙈":"👁"}</span>
          </div>
        </div>
        {error&&<div style={{background:"rgba(224,92,122,.1)",border:"1px solid rgba(224,92,122,.25)",borderRadius:7,padding:"8px 11px",fontSize:11.5,color:"var(--rose)",marginBottom:12}}>{error}</div>}
        <button className="btn btn-gold w100" style={{justifyContent:"center",padding:"10px",fontSize:13,background:brandColor,marginTop:4}} disabled={loading} onClick={handleLogin}>
          {loading?"Signing in…":"Sign In →"}
        </button>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════
// ── ROOT APP — SaaS platform state machine
// ════════════════════════════════════════════════════════════════════════
export default function App() {
  // screen: "landing" | "signup" | "onboarding" | "login" | "dashboard"
  const [screen, setScreen] = useState("landing");
  const [tenant, setTenant] = useState(null);

  function handleSignupComplete(data) {
    setTenant(data);
    setScreen("onboarding");
  }

  function handleOnboardComplete(data) {
    setTenant(data);
    setScreen("dashboard");
  }

  function handleLogin(t) {
    setTenant(t);
    setScreen("dashboard");
  }

  function handleLogout() {
    setTenant(null);
    setScreen("landing");
  }

  if (screen==="landing")    return <LandingPage    onSignup={()=>setScreen("signup")} onLogin={()=>setScreen("login")}/>;
  if (screen==="signup")     return <SignupFlow     onComplete={handleSignupComplete}  onLoginClick={()=>setScreen("login")}/>;
  if (screen==="onboarding") return <OnboardingFlow tenant={tenant} onComplete={handleOnboardComplete}/>;
  if (screen==="login")      return <SaaSLogin      onLogin={handleLogin}              onSignupClick={()=>setScreen("signup")}/>;
  if (screen==="dashboard")  return <SaaSDashboard  tenant={tenant}                    onLogout={handleLogout}/>;
  return null;
}

