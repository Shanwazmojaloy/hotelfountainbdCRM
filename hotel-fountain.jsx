import { useState, useEffect, useRef } from "react";

// ─── DATA ──────────────────────────────────────────────────────────────────
const ROOMS = [
  { id: "101", type: "Standard", floor: 1, status: "available", rate: 120, beds: "Queen", view: "Garden" },
  { id: "102", type: "Standard", floor: 1, status: "occupied", rate: 120, beds: "Twin", view: "Garden", guest: "Ahmed Al-Rashid", checkIn: "2026-03-06", checkOut: "2026-03-10" },
  { id: "103", type: "Standard", floor: 1, status: "housekeeping", rate: 120, beds: "King", view: "Garden" },
  { id: "104", type: "Standard", floor: 1, status: "maintenance", rate: 120, beds: "Queen", view: "Garden" },
  { id: "201", type: "Deluxe", floor: 2, status: "available", rate: 220, beds: "King", view: "Pool" },
  { id: "202", type: "Deluxe", floor: 2, status: "occupied", rate: 220, beds: "King", view: "Pool", guest: "Sarah Mitchell", checkIn: "2026-03-07", checkOut: "2026-03-12" },
  { id: "203", type: "Deluxe", floor: 2, status: "available", rate: 220, beds: "Queen", view: "Pool" },
  { id: "204", type: "Deluxe", floor: 2, status: "occupied", rate: 220, beds: "King", view: "City", guest: "James Okonkwo", checkIn: "2026-03-05", checkOut: "2026-03-09" },
  { id: "301", type: "Suite", floor: 3, status: "available", rate: 450, beds: "King", view: "Ocean" },
  { id: "302", type: "Suite", floor: 3, status: "occupied", rate: 450, beds: "King", view: "Ocean", guest: "Lin Wei", checkIn: "2026-03-08", checkOut: "2026-03-15" },
  { id: "303", type: "Suite", floor: 3, status: "housekeeping", rate: 450, beds: "King", view: "Ocean" },
  { id: "401", type: "Presidential", floor: 4, status: "available", rate: 1200, beds: "King", view: "Panoramic" },
  { id: "402", type: "Presidential", floor: 4, status: "occupied", rate: 1200, beds: "King", view: "Panoramic", guest: "Elena Vasquez", checkIn: "2026-03-01", checkOut: "2026-03-20" },
];

const GUESTS = [
  { id: 1, name: "Ahmed Al-Rashid", email: "ahmed@example.com", phone: "+971-50-123-4567", nationality: "UAE", room: "102", status: "checked-in", vip: true, stays: 12, spent: 8420, loyalty: 2800, joined: "2023-01-15" },
  { id: 2, name: "Sarah Mitchell", email: "sarah@example.com", phone: "+1-555-234-5678", nationality: "USA", room: "202", status: "checked-in", vip: false, stays: 3, spent: 1240, loyalty: 420, joined: "2025-03-10" },
  { id: 3, name: "James Okonkwo", email: "james@example.com", phone: "+234-80-345-6789", nationality: "Nigeria", room: "204", status: "checked-in", vip: false, stays: 1, spent: 660, loyalty: 120, joined: "2026-02-20" },
  { id: 4, name: "Lin Wei", email: "lin@example.com", phone: "+86-138-456-7890", nationality: "China", room: "302", status: "checked-in", vip: true, stays: 7, spent: 5800, loyalty: 1900, joined: "2024-06-05" },
  { id: 5, name: "Elena Vasquez", email: "elena@example.com", phone: "+34-600-567-8901", nationality: "Spain", room: "402", status: "checked-in", vip: true, stays: 18, spent: 24600, loyalty: 8200, joined: "2022-09-12" },
  { id: 6, name: "Tariq Hassan", email: "tariq@example.com", phone: "+92-300-678-9012", nationality: "Pakistan", room: null, status: "reserved", vip: false, stays: 2, spent: 980, loyalty: 280, joined: "2025-07-18" },
];

const RESERVATIONS = [
  { id: "RES-2026-001", guest: "Ahmed Al-Rashid", room: "102", type: "Standard", checkIn: "2026-03-06", checkOut: "2026-03-10", nights: 4, amount: 480, status: "confirmed", source: "Direct" },
  { id: "RES-2026-002", guest: "Sarah Mitchell", room: "202", type: "Deluxe", checkIn: "2026-03-07", checkOut: "2026-03-12", nights: 5, amount: 1100, status: "confirmed", source: "Booking.com" },
  { id: "RES-2026-003", guest: "James Okonkwo", room: "204", type: "Deluxe", checkIn: "2026-03-05", checkOut: "2026-03-09", nights: 4, amount: 880, status: "confirmed", source: "Expedia" },
  { id: "RES-2026-004", guest: "Lin Wei", room: "302", type: "Suite", checkIn: "2026-03-08", checkOut: "2026-03-15", nights: 7, amount: 3150, status: "confirmed", source: "Direct" },
  { id: "RES-2026-005", guest: "Elena Vasquez", room: "402", type: "Presidential", checkIn: "2026-03-01", checkOut: "2026-03-20", nights: 19, amount: 22800, status: "confirmed", source: "Corporate" },
  { id: "RES-2026-006", guest: "Tariq Hassan", room: "201", type: "Deluxe", checkIn: "2026-03-15", checkOut: "2026-03-18", nights: 3, amount: 660, status: "pending", source: "Direct" },
  { id: "RES-2026-007", guest: "Priya Sharma", room: "101", type: "Standard", checkIn: "2026-03-11", checkOut: "2026-03-14", nights: 3, amount: 360, status: "pending", source: "Airbnb" },
];

const TASKS = [
  { id: 1, room: "103", type: "Cleaning", priority: "high", assignee: "Maria Santos", status: "in-progress", time: "09:00" },
  { id: 2, room: "303", type: "Turndown", priority: "medium", assignee: "John Dela Cruz", status: "pending", time: "14:00" },
  { id: 3, room: "104", type: "Maintenance", priority: "high", assignee: "Robert Kim", status: "pending", time: "10:30" },
  { id: 4, room: "201", type: "Inspection", priority: "low", assignee: "Maria Santos", status: "completed", time: "08:00" },
  { id: 5, room: "402", type: "VIP Setup", priority: "high", assignee: "John Dela Cruz", status: "completed", time: "07:30" },
];

const REVENUE_DATA = [
  { month: "Sep", revenue: 68000, occupancy: 72 },
  { month: "Oct", revenue: 74000, occupancy: 78 },
  { month: "Nov", revenue: 61000, occupancy: 65 },
  { month: "Dec", revenue: 89000, occupancy: 91 },
  { month: "Jan", revenue: 52000, occupancy: 56 },
  { month: "Feb", revenue: 71000, occupancy: 75 },
  { month: "Mar", revenue: 83000, occupancy: 86 },
];

// ─── STYLES ────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Mono:wght@300;400;500&family=Jost:wght@300;400;500;600&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0D1117; --surface:#161B22; --surface2:#1C2333; --surface3:#21273A;
    --gold:#C8A96E; --gold2:#E8C97E; --gold-dim:rgba(200,169,110,0.15);
    --teal:#2EC4B6; --rose:#E05C7A; --sky:#58A6FF; --green:#3FB950; --amber:#F0A500;
    --text:#E6EDF3; --text2:#8B949E; --text3:#484F58;
    --border:rgba(200,169,110,0.12); --border2:rgba(255,255,255,0.06);
    --radius:10px; --shadow:0 8px 32px rgba(0,0,0,0.4);
  }
  body{background:var(--bg);color:var(--text);font-family:'Jost',sans-serif;overflow:hidden;height:100vh}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(200,169,110,0.2);border-radius:2px}

  .app{display:flex;height:100vh;overflow:hidden}

  /* SIDEBAR */
  .sidebar{width:230px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
  .sidebar-logo{padding:24px 20px 20px;border-bottom:1px solid var(--border)}
  .logo-icon{font-size:22px;margin-bottom:8px}
  .logo-name{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--gold);letter-spacing:0.02em;line-height:1}
  .logo-ver{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.15em;margin-top:3px}
  .sidebar-nav{flex:1;padding:12px 10px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
  .nav-section{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.18em;color:var(--text3);padding:10px 10px 4px;text-transform:uppercase}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;cursor:pointer;transition:all 0.2s;font-size:13.5px;font-weight:400;color:var(--text2);border:1px solid transparent;user-select:none}
  .nav-item:hover{background:var(--gold-dim);color:var(--text);border-color:rgba(200,169,110,0.1)}
  .nav-item.active{background:var(--gold-dim);color:var(--gold);border-color:rgba(200,169,110,0.25);font-weight:500}
  .nav-item .icon{font-size:15px;width:18px;text-align:center;flex-shrink:0}
  .nav-badge{margin-left:auto;background:var(--rose);color:#fff;font-size:9px;font-family:'DM Mono',monospace;padding:2px 6px;border-radius:10px;font-weight:500}
  .sidebar-user{padding:14px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px}
  .user-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--teal));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0D1117;flex-shrink:0}
  .user-info{min-width:0}
  .user-name{font-size:12.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .user-role{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.1em}

  /* MAIN */
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
  .topbar{height:56px;flex-shrink:0;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 24px;gap:16px}
  .topbar-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--text);flex:1}
  .topbar-date{font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);letter-spacing:0.08em}
  .topbar-actions{display:flex;gap:8px}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:12.5px;font-weight:500;cursor:pointer;border:none;transition:all 0.2s;font-family:'Jost',sans-serif}
  .btn-gold{background:var(--gold);color:#0D1117}
  .btn-gold:hover{background:var(--gold2)}
  .btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}
  .btn-ghost:hover{background:var(--surface2);color:var(--text);border-color:var(--border)}
  .content{flex:1;overflow-y:auto;padding:24px}

  /* CARDS */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  .card-header{padding:16px 20px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between}
  .card-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--text)}
  .card-body{padding:20px}

  /* STAT CARDS */
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;position:relative;overflow:hidden;transition:all 0.25s;cursor:default}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent)}
  .stat-card:hover{border-color:rgba(200,169,110,0.3);transform:translateY(-2px);box-shadow:var(--shadow)}
  .stat-icon{font-size:22px;margin-bottom:12px}
  .stat-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.14em;color:var(--text2);text-transform:uppercase;margin-bottom:6px}
  .stat-value{font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:700;color:var(--text);line-height:1}
  .stat-sub{font-size:12px;color:var(--text2);margin-top:6px}
  .stat-change{font-size:11px;margin-top:4px}
  .up{color:var(--green)} .down{color:var(--rose)}

  /* ROOM GRID */
  .rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
  .room-card{border-radius:8px;padding:14px 12px;cursor:pointer;transition:all 0.2s;border:1px solid transparent;position:relative}
  .room-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.3)}
  .room-card.available{background:rgba(63,185,80,0.08);border-color:rgba(63,185,80,0.2)}
  .room-card.occupied{background:rgba(88,166,255,0.08);border-color:rgba(88,166,255,0.2)}
  .room-card.housekeeping{background:rgba(240,165,0,0.08);border-color:rgba(240,165,0,0.2)}
  .room-card.maintenance{background:rgba(224,92,122,0.08);border-color:rgba(224,92,122,0.2)}
  .room-number{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;line-height:1;margin-bottom:4px}
  .room-card.available .room-number{color:var(--green)}
  .room-card.occupied .room-number{color:var(--sky)}
  .room-card.housekeeping .room-number{color:var(--amber)}
  .room-card.maintenance .room-number{color:var(--rose)}
  .room-type{font-size:10px;color:var(--text2);margin-bottom:8px;font-family:'DM Mono',monospace;letter-spacing:0.08em}
  .room-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .room-status-dot.available{background:var(--green);box-shadow:0 0 6px var(--green)}
  .room-status-dot.occupied{background:var(--sky);box-shadow:0 0 6px var(--sky)}
  .room-status-dot.housekeeping{background:var(--amber);box-shadow:0 0 6px var(--amber)}
  .room-status-dot.maintenance{background:var(--rose);box-shadow:0 0 6px var(--rose)}
  .room-info{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2)}
  .room-guest{font-size:10px;color:var(--text2);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic}
  .room-rate{font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);margin-top:4px}

  /* STATUS LEGEND */
  .legend{display:flex;gap:16px;flex-wrap:wrap}
  .legend-item{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text2)}

  /* TABLE */
  .data-table{width:100%;border-collapse:collapse}
  .data-table th{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.12em;color:var(--text3);text-transform:uppercase;padding:10px 14px;text-align:left;border-bottom:1px solid var(--border2)}
  .data-table td{padding:12px 14px;border-bottom:1px solid var(--border2);font-size:13px;color:var(--text)}
  .data-table tr:last-child td{border-bottom:none}
  .data-table tr:hover td{background:rgba(255,255,255,0.02)}

  /* BADGES */
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:10.5px;font-family:'DM Mono',monospace;letter-spacing:0.05em;font-weight:500}
  .badge-green{background:rgba(63,185,80,0.12);color:var(--green);border:1px solid rgba(63,185,80,0.2)}
  .badge-blue{background:rgba(88,166,255,0.12);color:var(--sky);border:1px solid rgba(88,166,255,0.2)}
  .badge-amber{background:rgba(240,165,0,0.12);color:var(--amber);border:1px solid rgba(240,165,0,0.2)}
  .badge-rose{background:rgba(224,92,122,0.12);color:var(--rose);border:1px solid rgba(224,92,122,0.2)}
  .badge-gold{background:rgba(200,169,110,0.12);color:var(--gold);border:1px solid rgba(200,169,110,0.2)}

  /* MINI CHART */
  .chart-wrap{position:relative;height:120px;display:flex;align-items:flex-end;gap:8px;padding:0 4px}
  .chart-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
  .chart-bar{width:100%;border-radius:4px 4px 0 0;background:linear-gradient(to top,rgba(200,169,110,0.6),rgba(200,169,110,0.2));transition:all 0.4s cubic-bezier(0.4,0,0.2,1);cursor:pointer;position:relative}
  .chart-bar:hover{background:linear-gradient(to top,var(--gold),rgba(200,169,110,0.4))}
  .chart-bar-active{background:linear-gradient(to top,var(--gold),rgba(200,169,110,0.5)) !important}
  .chart-label{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.05em}

  /* GRID LAYOUTS */
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid-3{display:grid;grid-template-columns:2fr 1fr;gap:16px}

  /* TASK LIST */
  .task-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border2)}
  .task-item:last-child{border-bottom:none}
  .task-room{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--text);width:40px;flex-shrink:0}
  .task-info{flex:1;min-width:0}
  .task-type{font-size:13px;font-weight:500;color:var(--text)}
  .task-assign{font-size:11px;color:var(--text2);margin-top:2px}
  .priority-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .priority-dot.high{background:var(--rose);box-shadow:0 0 6px var(--rose)}
  .priority-dot.medium{background:var(--amber);box-shadow:0 0 6px var(--amber)}
  .priority-dot.low{background:var(--green);box-shadow:0 0 6px var(--green)}

  /* GUEST CARD */
  .guest-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border2);cursor:pointer;transition:all 0.2s;border-radius:6px}
  .guest-row:last-child{border-bottom:none}
  .guest-row:hover{padding-left:6px}
  .avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0D1117;flex-shrink:0}
  .avatar-sm{width:28px;height:28px;font-size:11px}
  .guest-name{font-size:13.5px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px}
  .vip-star{color:var(--gold);font-size:11px}
  .guest-meta{font-size:11.5px;color:var(--text2);margin-top:2px}
  .guest-loyalty{font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);margin-left:auto;text-align:right}

  /* MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px}
  .modal{background:var(--surface);border:1px solid var(--border);border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,0.6)}
  .modal-header{padding:20px 24px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--surface);z-index:1}
  .modal-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--text)}
  .modal-close{background:none;border:none;color:var(--text2);cursor:pointer;font-size:20px;line-height:1;padding:2px;transition:color 0.2s}
  .modal-close:hover{color:var(--text)}
  .modal-body{padding:24px}
  .form-group{margin-bottom:16px}
  .form-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.12em;color:var(--text2);text-transform:uppercase;margin-bottom:6px;display:block}
  .form-input{width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:7px;padding:9px 12px;color:var(--text);font-size:13.5px;font-family:'Jost',sans-serif;outline:none;transition:border-color 0.2s}
  .form-input:focus{border-color:rgba(200,169,110,0.4)}
  .form-select{width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:7px;padding:9px 12px;color:var(--text);font-size:13.5px;font-family:'Jost',sans-serif;outline:none;cursor:pointer}
  .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .modal-footer{padding:16px 24px;border-top:1px solid var(--border2);display:flex;gap:10px;justify-content:flex-end}

  /* OCCUPANCY RING */
  .occ-ring{position:relative;display:inline-flex;align-items:center;justify-content:center}
  .occ-ring svg{transform:rotate(-90deg)}
  .occ-center{position:absolute;text-align:center}
  .occ-pct{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;color:var(--gold);line-height:1}
  .occ-lbl{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.1em}

  /* NOTIFICATION */
  .notif{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid rgba(200,169,110,0.3);border-radius:10px;padding:14px 18px;box-shadow:0 16px 48px rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);animation:slideUp 0.3s ease;max-width:320px}
  @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .notif-icon{font-size:18px;flex-shrink:0}

  /* SEARCH */
  .search-box{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border2);border-radius:7px;padding:7px 12px;width:240px}
  .search-box input{background:none;border:none;outline:none;color:var(--text);font-size:13px;font-family:'Jost',sans-serif;flex:1}
  .search-box input::placeholder{color:var(--text3)}

  /* TABS */
  .tabs{display:flex;gap:2px;background:var(--surface2);border-radius:8px;padding:3px}
  .tab{padding:7px 16px;border-radius:6px;font-size:13px;cursor:pointer;transition:all 0.2s;color:var(--text2);border:none;background:none;font-family:'Jost',sans-serif;white-space:nowrap}
  .tab.active{background:var(--surface);color:var(--text);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,0.3)}

  /* BILLING */
  .folio-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border2);font-size:13px}
  .folio-row:last-child{border-bottom:none}
  .folio-total{display:flex;align-items:center;justify-content:space-between;padding:14px 0 0;font-size:15px;font-weight:600;color:var(--gold)}

  /* RESPONSIVE HELPERS */
  .flex{display:flex} .flex-col{flex-direction:column} .items-center{align-items:center}
  .justify-between{justify-content:space-between} .gap-2{gap:8px} .gap-3{gap:12px} .gap-4{gap:16px}
  .mt-1{margin-top:4px} .mt-2{margin-top:8px} .mt-3{margin-top:12px} .mt-4{margin-top:16px} .mt-6{margin-top:24px}
  .mb-4{margin-bottom:16px} .mb-6{margin-bottom:24px}
  .text-gold{color:var(--gold)} .text-muted{color:var(--text2)} .text-sm{font-size:12px}
  .font-mono{font-family:'DM Mono',monospace} .font-serif{font-family:'Cormorant Garamond',serif}
  .w-full{width:100%}
`;

// ─── HELPERS ───────────────────────────────────────────────────────────────
const statusColor = { available: "#3FB950", occupied: "#58A6FF", housekeeping: "#F0A500", maintenance: "#E05C7A" };
const avatarColors = ["#C8A96E","#2EC4B6","#E05C7A","#58A6FF","#3FB950","#9B72CF","#F0A500"];
const initials = (name) => name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
const avatarColor = (name) => avatarColors[name.charCodeAt(0) % avatarColors.length];
const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n}`;

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function OccupancyRing({ pct }) {
  const r = 54, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="occ-ring">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10"/>
        <circle cx="65" cy="65" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#C8A96E"/>
            <stop offset="100%" stopColor="#E8C97E"/>
          </linearGradient>
        </defs>
      </svg>
      <div className="occ-center">
        <div className="occ-pct">{pct}%</div>
        <div className="occ-lbl">OCCUPIED</div>
      </div>
    </div>
  );
}

function MiniChart({ data }) {
  const max = Math.max(...data.map(d => d.revenue));
  const [active, setActive] = useState(data.length - 1);
  return (
    <div>
      <div className="chart-wrap">
        {data.map((d, i) => (
          <div key={i} className="chart-bar-wrap">
            <div
              className={`chart-bar ${i === active ? "chart-bar-active" : ""}`}
              style={{ height: `${(d.revenue / max) * 100}px` }}
              onMouseEnter={() => setActive(i)}
            />
            <span className="chart-label">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        <span className="text-muted text-sm">{data[active].month} Revenue</span>
        <span className="font-mono" style={{ fontSize: 12, color: "#C8A96E" }}>${data[active].revenue.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── PAGES ─────────────────────────────────────────────────────────────────

function Dashboard({ rooms, guests, setPage, showNotif }) {
  const occ = rooms.filter(r => r.status === "occupied").length;
  const avail = rooms.filter(r => r.status === "available").length;
  const hsk = rooms.filter(r => r.status === "housekeeping").length;
  const maint = rooms.filter(r => r.status === "maintenance").length;
  const occPct = Math.round((occ / rooms.length) * 100);
  const todayRevenue = rooms.filter(r => r.status === "occupied").reduce((a, r) => a + r.rate, 0);

  return (
    <div>
      <div className="stats-grid">
        {[
          { label: "Today's Revenue", value: `$${todayRevenue.toLocaleString()}`, icon: "💰", sub: "From active rooms", change: "+12% vs yesterday", up: true, accent: "#C8A96E" },
          { label: "Occupied Rooms", value: `${occ}/${rooms.length}`, icon: "🛏️", sub: `${avail} available`, change: `${occPct}% occupancy`, up: true, accent: "#58A6FF" },
          { label: "Active Guests", value: guests.filter(g => g.status === "checked-in").length, icon: "👥", sub: "Currently in-house", change: "2 arrivals today", up: true, accent: "#2EC4B6" },
          { label: "Pending Tasks", value: TASKS.filter(t => t.status === "pending").length, icon: "📋", sub: `${TASKS.filter(t => t.priority === "high" && t.status === "pending").length} high priority`, change: "3 overdue", up: false, accent: "#E05C7A" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ "--accent": s.accent }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
            <div className={`stat-change ${s.up ? "up" : "down"}`}>{s.up ? "↑" : "↓"} {s.change}</div>
          </div>
        ))}
      </div>

      <div className="grid-3 mb-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue Overview</span>
            <span className="badge badge-gold">Last 7 months</span>
          </div>
          <div className="card-body">
            <MiniChart data={REVENUE_DATA} />
            <div className="mt-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[["RevPAR", "$186"], ["ADR", "$312"], ["Bookings", "47"]].map(([l, v]) => (
                <div key={l} style={{ textAlign: "center", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="font-mono" style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                  <div className="font-serif" style={{ fontSize: 22, fontWeight: 700, color: "#C8A96E" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-header">
            <span className="card-title">Occupancy</span>
          </div>
          <div className="card-body" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <OccupancyRing pct={occPct} />
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Available", count: avail, color: "#3FB950" },
                { label: "Occupied", count: occ, color: "#58A6FF" },
                { label: "Housekeeping", count: hsk, color: "#F0A500" },
                { label: "Maintenance", count: maint, color: "#E05C7A" },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, fontSize: 12 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                  <span style={{ color: "var(--text2)", flex: 1 }}>{label}</span>
                  <span style={{ color, fontFamily: "DM Mono", fontSize: 11 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Today's Arrivals</span>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("reservations")}>View All →</button>
          </div>
          <div className="card-body" style={{ padding: "8px 20px" }}>
            {RESERVATIONS.slice(0, 4).map(r => (
              <div key={r.id} className="guest-row">
                <div className="avatar avatar-sm" style={{ background: `linear-gradient(135deg,${avatarColor(r.guest)},rgba(255,255,255,0.2))` }}>{initials(r.guest)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="guest-name" style={{ fontSize: 13 }}>{r.guest}</div>
                  <div className="guest-meta">Room {r.room} · {r.nights}N · {r.source}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="font-mono" style={{ fontSize: 11, color: "#C8A96E" }}>${r.amount.toLocaleString()}</div>
                  <span className={`badge ${r.status === "confirmed" ? "badge-green" : "badge-amber"}`} style={{ marginTop: 3 }}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Housekeeping Tasks</span>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("housekeeping")}>View All →</button>
          </div>
          <div className="card-body" style={{ padding: "8px 20px" }}>
            {TASKS.map(t => (
              <div key={t.id} className="task-item">
                <div className={`priority-dot ${t.priority}`} />
                <div className="task-room">{t.room}</div>
                <div className="task-info">
                  <div className="task-type">{t.type}</div>
                  <div className="task-assign">{t.assignee} · {t.time}</div>
                </div>
                <span className={`badge ${t.status === "completed" ? "badge-green" : t.status === "in-progress" ? "badge-blue" : "badge-amber"}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomsPage({ rooms, setRooms, showNotif }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? rooms : rooms.filter(r => r.status === filter);

  function changeStatus(id, newStatus) {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    showNotif(`✅ Room ${id} status updated to ${newStatus}`);
    setSelected(null);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="tabs">
          {["all", "available", "occupied", "housekeeping", "maintenance"].map(s => (
            <button key={s} className={`tab ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)} {s !== "all" && `(${rooms.filter(r => r.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="rooms-grid">
        {filtered.map(room => (
          <div key={room.id} className={`room-card ${room.status}`} onClick={() => setSelected(room)}>
            <div className="room-number">{room.id}</div>
            <div className="room-type">{room.type.toUpperCase()} · {room.view}</div>
            <div className="room-info">
              <div className={`room-status-dot ${room.status}`} />
              <span style={{ fontSize: 11, color: "var(--text2)", textTransform: "capitalize" }}>{room.status}</span>
            </div>
            {room.guest && <div className="room-guest">{room.guest}</div>}
            <div className="room-rate">${room.rate}/night</div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Room {selected.id} — {selected.type}</div>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[["Floor", `Floor ${selected.floor}`], ["Bed Type", selected.beds], ["View", selected.view], ["Rate", `$${selected.rate}/night`]].map(([l, v]) => (
                  <div key={l} style={{ padding: "10px 14px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border2)" }}>
                    <div className="font-mono" style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{v}</div>
                  </div>
                ))}
              </div>
              {selected.guest && (
                <div style={{ padding: "12px 14px", background: "rgba(88,166,255,0.06)", borderRadius: 8, border: "1px solid rgba(88,166,255,0.15)", marginBottom: 16 }}>
                  <div className="font-mono" style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Current Guest</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{selected.guest}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>{selected.checkIn} → {selected.checkOut}</div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Change Room Status</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {["available", "occupied", "housekeeping", "maintenance"].map(s => (
                    <button key={s} className="btn btn-ghost" style={{ justifyContent: "center", borderColor: selected.status === s ? statusColor[s] : undefined, color: selected.status === s ? statusColor[s] : undefined }}
                      onClick={() => changeStatus(selected.id, s)}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservationsPage({ showNotif }) {
  const [reservations, setReservations] = useState(RESERVATIONS);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ guest: "", room: "", checkIn: "", checkOut: "", source: "Direct" });

  function submit() {
    if (!form.guest || !form.room || !form.checkIn || !form.checkOut) return;
    const nights = Math.max(1, Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000));
    const newRes = {
      id: `RES-2026-00${reservations.length + 1}`,
      guest: form.guest, room: form.room, type: "Standard",
      checkIn: form.checkIn, checkOut: form.checkOut,
      nights, amount: nights * 120, status: "pending", source: form.source
    };
    setReservations(p => [newRes, ...p]);
    showNotif(`✅ Reservation created for ${form.guest}`);
    setShowNew(false);
    setForm({ guest: "", room: "", checkIn: "", checkOut: "", source: "Direct" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="search-box">
          <span style={{ color: "var(--text3)" }}>🔍</span>
          <input placeholder="Search reservations..." />
        </div>
        <button className="btn btn-gold" onClick={() => setShowNew(true)}>+ New Reservation</button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Reservations</span>
          <span className="badge badge-blue">{reservations.length} total</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {["ID", "Guest", "Room", "Check-In", "Check-Out", "Nights", "Amount", "Source", "Status"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td><span className="font-mono" style={{ fontSize: 11, color: "var(--text2)" }}>{r.id}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="avatar avatar-sm" style={{ background: `linear-gradient(135deg,${avatarColor(r.guest)},rgba(0,0,0,0.3))` }}>{initials(r.guest)}</div>
                      {r.guest}
                    </div>
                  </td>
                  <td><span className="badge badge-blue">{r.room}</span></td>
                  <td className="font-mono" style={{ fontSize: 12 }}>{r.checkIn}</td>
                  <td className="font-mono" style={{ fontSize: 12 }}>{r.checkOut}</td>
                  <td style={{ textAlign: "center" }}>{r.nights}</td>
                  <td><span style={{ color: "var(--gold)", fontFamily: "DM Mono", fontSize: 12 }}>${r.amount.toLocaleString()}</span></td>
                  <td><span className="badge badge-gold">{r.source}</span></td>
                  <td><span className={`badge ${r.status === "confirmed" ? "badge-green" : "badge-amber"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Reservation</div>
              <button className="modal-close" onClick={() => setShowNew(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Guest Name</label>
                <input className="form-input" placeholder="Full name" value={form.guest} onChange={e => setForm(p => ({ ...p, guest: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Room Number</label>
                  <select className="form-select" value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))}>
                    <option value="">Select room</option>
                    {ROOMS.filter(r => r.status === "available").map(r => (
                      <option key={r.id} value={r.id}>Room {r.id} — {r.type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Booking Source</label>
                  <select className="form-select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                    {["Direct", "Booking.com", "Expedia", "Airbnb", "Corporate", "Phone"].map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Check-In Date</label>
                  <input type="date" className="form-input" value={form.checkIn} onChange={e => setForm(p => ({ ...p, checkIn: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Check-Out Date</label>
                  <input type="date" className="form-input" value={form.checkOut} onChange={e => setForm(p => ({ ...p, checkOut: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={submit}>Create Reservation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestsPage({ showNotif }) {
  const [guests] = useState(GUESTS);
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="search-box">
          <span style={{ color: "var(--text3)" }}>🔍</span>
          <input placeholder="Search guests..." />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost">Export</button>
          <button className="btn btn-gold">+ Add Guest</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Guest Directory</span>
            <span className="badge badge-blue">{guests.length} guests</span>
          </div>
          <div className="card-body" style={{ padding: "4px 20px" }}>
            {guests.map(g => (
              <div key={g.id} className="guest-row" onClick={() => setSelected(g)} style={{ background: selected?.id === g.id ? "rgba(200,169,110,0.05)" : undefined, paddingLeft: selected?.id === g.id ? 6 : undefined }}>
                <div className="avatar" style={{ background: `linear-gradient(135deg,${avatarColor(g.name)},rgba(0,0,0,0.4))` }}>{initials(g.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="guest-name">
                    {g.name}
                    {g.vip && <span className="vip-star">★ VIP</span>}
                  </div>
                  <div className="guest-meta">{g.nationality} · {g.stays} stays · {g.room ? `Room ${g.room}` : "Not checked in"}</div>
                </div>
                <div className="guest-loyalty">
                  <div style={{ fontSize: 12, color: "var(--gold)", fontFamily: "DM Mono" }}>{g.loyalty.toLocaleString()} pts</div>
                  <span className={`badge ${g.status === "checked-in" ? "badge-green" : "badge-amber"}`} style={{ marginTop: 3 }}>{g.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          {selected ? (
            <>
              <div className="card-header">
                <span className="card-title">Guest Profile</span>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setSelected(null)}>✕ Close</button>
              </div>
              <div className="card-body">
                <div className="flex items-center gap-3 mb-4">
                  <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, background: `linear-gradient(135deg,${avatarColor(selected.name)},rgba(0,0,0,0.4))` }}>{initials(selected.name)}</div>
                  <div>
                    <div style={{ fontSize: 18, fontFamily: "Cormorant Garamond", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                      {selected.name} {selected.vip && <span style={{ color: "var(--gold)", fontSize: 13 }}>★ VIP</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{selected.email}</div>
                    <div style={{ fontSize: 12, color: "var(--text2)" }}>{selected.phone}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {[["Stays", selected.stays], ["Total Spent", fmt(selected.spent)], ["Loyalty Pts", selected.loyalty.toLocaleString()]].map(([l, v]) => (
                    <div key={l} style={{ textAlign: "center", padding: "12px 8px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border2)" }}>
                      <div className="font-mono" style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                      <div className="font-serif" style={{ fontSize: 20, fontWeight: 700, color: "var(--gold)" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["Nationality", selected.nationality], ["Room", selected.room ? `Room ${selected.room}` : "—"], ["Status", selected.status], ["Member Since", selected.joined]].map(([l, v]) => (
                    <div key={l} className="folio-row">
                      <span className="text-muted" style={{ fontSize: 12 }}>{l}</span>
                      <span style={{ fontSize: 13, color: "var(--text)" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>View Folio</button>
                  <button className="btn btn-gold" style={{ flex: 1, justifyContent: "center" }} onClick={() => showNotif(`✅ Message sent to ${selected.name}`)}>Send Message</button>
                </div>
              </div>
            </>
          ) : (
            <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--text3)", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 32 }}>👤</span>
              <span style={{ fontSize: 13 }}>Select a guest to view profile</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HousekeepingPage({ showNotif }) {
  const [tasks, setTasks] = useState(TASKS);

  function updateTask(id, status) {
    setTasks(p => p.map(t => t.id === id ? { ...t, status } : t));
    showNotif(`✅ Task updated to ${status}`);
  }

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {[
          { label: "Total Tasks", value: tasks.length, color: "#58A6FF" },
          { label: "Completed", value: tasks.filter(t => t.status === "completed").length, color: "#3FB950" },
          { label: "In Progress", value: tasks.filter(t => t.status === "in-progress").length, color: "#F0A500" },
          { label: "Pending", value: tasks.filter(t => t.status === "pending").length, color: "#E05C7A" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ "--accent": s.color }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 40, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <span className="card-title">Task Board</span>
          <button className="btn btn-gold" onClick={() => showNotif("✅ New task created")}>+ Add Task</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {["Room", "Task Type", "Priority", "Assigned To", "Time", "Status", "Action"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td><span className="font-serif" style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{t.room}</span></td>
                  <td style={{ fontWeight: 500 }}>{t.type}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className={`priority-dot ${t.priority}`} />
                      <span style={{ textTransform: "capitalize", fontSize: 12 }}>{t.priority}</span>
                    </div>
                  </td>
                  <td>{t.assignee}</td>
                  <td className="font-mono" style={{ fontSize: 12 }}>{t.time}</td>
                  <td><span className={`badge ${t.status === "completed" ? "badge-green" : t.status === "in-progress" ? "badge-blue" : "badge-amber"}`}>{t.status}</span></td>
                  <td>
                    <div className="flex gap-2">
                      {t.status !== "in-progress" && t.status !== "completed" && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => updateTask(t.id, "in-progress")}>Start</button>
                      )}
                      {t.status !== "completed" && (
                        <button className="btn btn-gold" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => updateTask(t.id, "completed")}>Complete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BillingPage({ showNotif }) {
  const [selected, setSelected] = useState(GUESTS.find(g => g.status === "checked-in"));
  const charges = [
    { desc: "Room (Deluxe · 5 nights)", amount: 1100 },
    { desc: "Room Service — Dinner", amount: 85 },
    { desc: "Minibar Consumption", amount: 42 },
    { desc: "Spa Treatment", amount: 120 },
    { desc: "Laundry Service", amount: 35 },
    { desc: "Airport Transfer", amount: 60 },
  ];
  const sub = charges.reduce((a, c) => a + c.amount, 0);
  const tax = Math.round(sub * 0.1);
  const total = sub + tax;

<<<<<<< HEAD
=======
  function printInvoice() {
    if(!selected) return;
    const now = new Date().toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
    const rows = charges.map(c => `
      <tr>
        <td>${c.desc}</td>
        <td class="right">৳${Number(c.amount||0).toLocaleString("en-BD")}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Invoice - ${selected.name}</title>
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
.total{font-size:16px;font-weight:800;margin-top:10px}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="hotel">Hotel Fountain</div>
    <div class="muted">Guest Invoice / Folio</div>
    <div class="muted">Printed: ${now}</div>
  </div>
  <div class="muted" style="margin-bottom:12px"><b>${selected.name}</b> · Room ${selected.room}</div>
  <table>
    <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>${rows||"<tr><td colspan='2'>No charges</td></tr>"}</tbody>
  </table>
  <div class="total" style="text-align:right">
    Total Due: ৳${Number(total||0).toLocaleString("en-BD")}
  </div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if(!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

>>>>>>> f4de41a (Fix: Merge/sum transactions by guest, room, and date)
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Select Guest</span>
        </div>
        <div className="card-body" style={{ padding: "4px 20px" }}>
          {GUESTS.filter(g => g.status === "checked-in").map(g => (
            <div key={g.id} className="guest-row" onClick={() => setSelected(g)} style={{ background: selected?.id === g.id ? "rgba(200,169,110,0.06)" : undefined }}>
              <div className="avatar avatar-sm" style={{ background: `linear-gradient(135deg,${avatarColor(g.name)},rgba(0,0,0,0.4))` }}>{initials(g.name)}</div>
              <div style={{ flex: 1 }}>
                <div className="guest-name" style={{ fontSize: 13 }}>{g.name} {g.vip && <span className="vip-star">★</span>}</div>
                <div className="guest-meta">Room {g.room}</div>
              </div>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--gold)" }}>{fmt(g.spent)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Guest Folio</span>
          {selected && <span className="badge badge-blue">Room {selected.room}</span>}
        </div>
        <div className="card-body">
          {selected && (
            <>
              <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border2)" }}>
                <div className="avatar" style={{ background: `linear-gradient(135deg,${avatarColor(selected.name)},rgba(0,0,0,0.4))` }}>{initials(selected.name)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text2)", fontFamily: "DM Mono" }}>Room {selected.room} · Check-out: 2026-03-12</div>
                </div>
              </div>
              {charges.map((c, i) => (
                <div key={i} className="folio-row">
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>{c.desc}</span>
                  <span className="font-mono" style={{ fontSize: 12 }}>${c.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="folio-row" style={{ borderColor: "rgba(200,169,110,0.1)" }}>
                <span className="text-muted text-sm">Subtotal</span>
                <span className="font-mono" style={{ fontSize: 12 }}>${sub.toFixed(2)}</span>
              </div>
              <div className="folio-row" style={{ borderColor: "rgba(200,169,110,0.1)" }}>
                <span className="text-muted text-sm">Tax & Service (10%)</span>
                <span className="font-mono" style={{ fontSize: 12 }}>${tax.toFixed(2)}</span>
              </div>
              <div className="folio-total">
                <span>Total Due</span>
                <span className="font-mono">${total.toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-4">
<<<<<<< HEAD
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Print Invoice</button>
=======
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={printInvoice}>🖨 Print Invoice</button>
>>>>>>> f4de41a (Fix: Merge/sum transactions by guest, room, and date)
                <button className="btn btn-gold" style={{ flex: 1, justifyContent: "center" }} onClick={() => showNotif("✅ Payment processed successfully")}>Process Payment</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportsPage() {
  const max = Math.max(...REVENUE_DATA.map(d => d.revenue));
  return (
    <div>
      <div className="stats-grid">
        {[
          { label: "Monthly Revenue", value: "$83,000", sub: "March 2026", color: "#C8A96E" },
          { label: "Avg Occupancy", value: "74.7%", sub: "Last 7 months", color: "#2EC4B6" },
          { label: "RevPAR", value: "$186", sub: "Revenue per available room", color: "#58A6FF" },
          { label: "ADR", value: "$312", sub: "Average daily rate", color: "#3FB950" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ "--accent": s.color }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mt-4">
        <div className="card">
          <div className="card-header"><span className="card-title">Revenue by Month</span></div>
          <div className="card-body">
            {REVENUE_DATA.map((d, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="flex justify-between mb-1" style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--text2)" }}>{d.month} 2026</span>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--gold)" }}>${d.revenue.toLocaleString()}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(d.revenue / max) * 100}%`, background: "linear-gradient(90deg,#C8A96E,#E8C97E)", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Occupancy by Month</span></div>
          <div className="card-body">
            {REVENUE_DATA.map((d, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="flex justify-between mb-1" style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--text2)" }}>{d.month} 2026</span>
                  <span className="font-mono" style={{ fontSize: 11, color: "#2EC4B6" }}>{d.occupancy}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${d.occupancy}%`, background: "linear-gradient(90deg,#2EC4B6,#58A6FF)", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header"><span className="card-title">Revenue by Room Type</span></div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
              {[
                { type: "Standard", rooms: 4, rate: 120, occ: 50, color: "#3FB950" },
                { type: "Deluxe", rooms: 4, rate: 220, occ: 75, color: "#58A6FF" },
                { type: "Suite", rooms: 3, rate: 450, occ: 67, color: "#C8A96E" },
                { type: "Presidential", rooms: 2, rate: 1200, occ: 50, color: "#E05C7A" },
              ].map(rt => (
                <div key={rt.type} style={{ padding: "16px", background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border2)", textAlign: "center" }}>
                  <div className="font-mono" style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{rt.type}</div>
                  <div className="font-serif" style={{ fontSize: 28, fontWeight: 700, color: rt.color }}>{rt.occ}%</div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>Occupancy</div>
                  <div className="font-mono" style={{ fontSize: 12, color: "var(--gold)", marginTop: 8 }}>${rt.rate}/night</div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${rt.occ}%`, background: rt.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────
export default function HotelFountain() {
  const [page, setPage] = useState("dashboard");
  const [rooms, setRooms] = useState(ROOMS);
  const [notif, setNotif] = useState(null);

  function showNotif(msg) {
    setNotif(msg);
    setTimeout(() => setNotif(null), 3000);
  }

  const navItems = [
    { id: "dashboard", icon: "◈", label: "Dashboard", section: "OPERATIONS" },
    { id: "rooms", icon: "⬡", label: "Room Management" },
    { id: "reservations", icon: "📅", label: "Reservations", badge: RESERVATIONS.filter(r => r.status === "pending").length },
    { id: "guests", icon: "👤", label: "Guests (CRM)" },
    { id: "housekeeping", icon: "✧", label: "Housekeeping", badge: TASKS.filter(t => t.status === "pending" && t.priority === "high").length, section: "SERVICES" },
    { id: "billing", icon: "◎", label: "Billing & Invoices" },
    { id: "reports", icon: "▦", label: "Reports", section: "ANALYTICS" },
  ];

  const pageTitle = { dashboard: "Dashboard", rooms: "Room Management", reservations: "Reservations", guests: "Guest CRM", housekeeping: "Housekeeping", billing: "Billing & Invoices", reports: "Reports & Analytics" };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-icon">🏨</div>
            <div className="logo-name">Hotel Fountain</div>
            <div className="logo-ver">LUXURY MANAGEMENT SYSTEM · V5.2.0</div>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item, i) => (
              <div key={item.id}>
                {item.section && <div className="nav-section">{item.section}</div>}
                <div className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                </div>
              </div>
            ))}
          </nav>
          <div className="sidebar-user">
            <div className="user-avatar">GM</div>
            <div className="user-info">
              <div className="user-name">General Manager</div>
              <div className="user-role">SUPER ADMIN</div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          <div className="topbar">
            <div className="topbar-title">{pageTitle[page]}</div>
            <div className="topbar-date font-mono">
              {new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            <div className="topbar-actions">
              <button className="btn btn-ghost">🔔</button>
              <button className="btn btn-ghost">⚙</button>
            </div>
          </div>

          <div className="content">
            {page === "dashboard" && <Dashboard rooms={rooms} guests={GUESTS} setPage={setPage} showNotif={showNotif} />}
            {page === "rooms" && <RoomsPage rooms={rooms} setRooms={setRooms} showNotif={showNotif} />}
            {page === "reservations" && <ReservationsPage showNotif={showNotif} />}
            {page === "guests" && <GuestsPage showNotif={showNotif} />}
            {page === "housekeeping" && <HousekeepingPage showNotif={showNotif} />}
            {page === "billing" && <BillingPage showNotif={showNotif} />}
            {page === "reports" && <ReportsPage />}
          </div>
        </main>
      </div>

      {notif && (
        <div className="notif">
          <span className="notif-icon">✅</span>
          {notif}
        </div>
      )}
    </>
  );
}
