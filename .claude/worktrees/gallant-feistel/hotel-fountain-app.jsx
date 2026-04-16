import { useState } from "react";

const ROOMS = [
  { id: "101", type: "Standard", floor: 1, status: "available", rate: 120, beds: "King", view: "Garden" },
  { id: "102", type: "Standard", floor: 1, status: "occupied", rate: 120, beds: "Twin", view: "Garden", guest: "James Thornton", checkOut: "Mar 10" },
  { id: "103", type: "Standard", floor: 1, status: "housekeeping", rate: 120, beds: "King", view: "Garden" },
  { id: "104", type: "Standard", floor: 1, status: "maintenance", rate: 120, beds: "Twin", view: "Pool" },
  { id: "201", type: "Deluxe", floor: 2, status: "available", rate: 220, beds: "King", view: "Ocean" },
  { id: "202", type: "Deluxe", floor: 2, status: "occupied", rate: 220, beds: "King", view: "Ocean", guest: "Priya Sharma", checkOut: "Mar 12" },
  { id: "203", type: "Deluxe", floor: 2, status: "available", rate: 220, beds: "Twin", view: "City" },
  { id: "204", type: "Deluxe", floor: 2, status: "occupied", rate: 220, beds: "King", view: "Ocean", guest: "Chen Wei", checkOut: "Mar 09" },
  { id: "301", type: "Suite", floor: 3, status: "available", rate: 450, beds: "King", view: "Ocean" },
  { id: "302", type: "Suite", floor: 3, status: "occupied", rate: 450, beds: "King", view: "Ocean", guest: "Isabella Romano", checkOut: "Mar 15" },
  { id: "303", type: "Suite", floor: 3, status: "housekeeping", rate: 450, beds: "King", view: "Panorama" },
  { id: "401", type: "Presidential", floor: 4, status: "available", rate: 1200, beds: "King", view: "Panorama" },
  { id: "402", type: "Presidential", floor: 4, status: "occupied", rate: 1200, beds: "King", view: "Panorama", guest: "Sultan Al-Rashid", checkOut: "Mar 20" },
];

const RESERVATIONS_INIT = [
  { id: "RES-001", guest: "Amara Osei", room: "201", type: "Deluxe", checkIn: "Mar 08", checkOut: "Mar 12", nights: 4, total: 880, status: "confirmed", source: "Direct" },
  { id: "RES-002", guest: "Lucas Mendes", room: "101", type: "Standard", checkIn: "Mar 09", checkOut: "Mar 11", nights: 2, total: 240, status: "confirmed", source: "Booking.com" },
  { id: "RES-003", guest: "Sofia Andersson", room: "301", type: "Suite", checkIn: "Mar 10", checkOut: "Mar 14", nights: 4, total: 1800, status: "pending", source: "Direct" },
  { id: "RES-004", guest: "Ravi Patel", room: "203", type: "Deluxe", checkIn: "Mar 08", checkOut: "Mar 09", nights: 1, total: 220, status: "checked-in", source: "Expedia" },
  { id: "RES-005", guest: "Nadia Kowalski", room: "102", type: "Standard", checkIn: "Mar 11", checkOut: "Mar 15", nights: 4, total: 480, status: "confirmed", source: "Direct" },
];

const GUESTS = [
  { id: "G001", name: "James Thornton", email: "j.thornton@email.com", phone: "+1 555 0101", nationality: "American", visits: 7, totalSpend: 8420, vip: true, loyalty: 2100, room: "102" },
  { id: "G002", name: "Priya Sharma", email: "priya.s@email.com", phone: "+91 98765 43210", nationality: "Indian", visits: 3, totalSpend: 3180, vip: false, loyalty: 800, room: "202" },
  { id: "G003", name: "Isabella Romano", email: "i.romano@email.com", phone: "+39 02 1234567", nationality: "Italian", visits: 12, totalSpend: 21500, vip: true, loyalty: 5375, room: "302" },
  { id: "G004", name: "Sultan Al-Rashid", email: "sultan@alrashid.ae", phone: "+971 50 123 4567", nationality: "Emirati", visits: 5, totalSpend: 15800, vip: true, loyalty: 3950, room: "402" },
  { id: "G005", name: "Chen Wei", email: "chen.wei@email.cn", phone: "+86 139 0000 1234", nationality: "Chinese", visits: 2, totalSpend: 1760, vip: false, loyalty: 440, room: "204" },
];

const HOUSEKEEPING_INIT = [
  { room: "103", task: "Full Clean", staff: "Maria Santos", priority: "high", status: "in-progress", time: "09:00" },
  { room: "202", task: "Turndown", staff: "Ahmed Hassan", priority: "medium", status: "pending", time: "18:00" },
  { room: "303", task: "Full Clean", staff: "Lin Feng", priority: "high", status: "pending", time: "10:30" },
  { room: "101", task: "Linen Change", staff: "Maria Santos", priority: "low", status: "done", time: "08:00" },
  { room: "304", task: "Deep Clean", staff: "Ahmed Hassan", priority: "high", status: "pending", time: "11:00" },
];

const REVENUE_DATA = [
  { month: "Sep", rooms: 42000, fnb: 12000, spa: 5000 },
  { month: "Oct", rooms: 51000, fnb: 15000, spa: 7000 },
  { month: "Nov", rooms: 48000, fnb: 14000, spa: 6500 },
  { month: "Dec", rooms: 68000, fnb: 22000, spa: 9000 },
  { month: "Jan", rooms: 55000, fnb: 16000, spa: 7500 },
  { month: "Feb", rooms: 61000, fnb: 18000, spa: 8200 },
  { month: "Mar", rooms: 73000, fnb: 21000, spa: 9800 },
];

const S = {
  app: { display: "flex", minHeight: "100vh", background: "#080E1A", color: "#E2EAF4", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 14 },
  sidebar: { width: 220, flexShrink: 0, background: "#0D1627", borderRight: "1px solid rgba(200,169,110,0.15)", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100, overflowY: "auto" },
  logo: { padding: "22px 20px 18px", borderBottom: "1px solid rgba(200,169,110,0.15)" },
  logoMark: { fontSize: 18, fontWeight: 700, color: "#E8C98A", letterSpacing: "0.02em" },
  logoSub: { fontSize: 9, color: "#4A6080", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 3, fontFamily: "monospace" },
  navSection: { padding: "14px 10px 0" },
  navLabel: { fontSize: 9, letterSpacing: "0.18em", color: "#4A6080", textTransform: "uppercase", padding: "0 10px", marginBottom: 5, fontFamily: "monospace" },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: "pointer", color: active ? "#E8C98A" : "#8FA3BF", background: active ? "rgba(200,169,110,0.12)" : "transparent", border: `1px solid ${active ? "rgba(200,169,110,0.22)" : "transparent"}`, marginBottom: 1, fontSize: 13.5, fontWeight: active ? 500 : 400, transition: "all 0.15s" }),
  badge: { marginLeft: "auto", background: "#FB7185", color: "#fff", fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 10 },
  sideFooter: { padding: "14px 20px", borderTop: "1px solid rgba(200,169,110,0.15)", marginTop: "auto" },
  userAvatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#C8A96E,#2DD4BF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#080E1A", flexShrink: 0 },
  main: { marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" },
  topbar: { height: 58, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", padding: "0 26px", gap: 14, background: "rgba(8,14,26,0.9)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 90 },
  topTitle: { flex: 1, fontSize: 20, fontWeight: 600, color: "#E2EAF4" },
  content: { padding: 26, flex: 1 },
  panel: { background: "#0D1627", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  panelTitle: { fontSize: 17, fontWeight: 600, color: "#E2EAF4" },
  panelSub: { fontSize: 11, color: "#4A6080", marginTop: 2, fontFamily: "monospace" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 },
  kpiCard: (accent) => ({ background: "#0D1627", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 18, position: "relative", overflow: "hidden", borderTop: `2px solid ${accent}` }),
  kpiLabel: { fontSize: 10, color: "#4A6080", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace" },
  kpiVal: { fontSize: 32, fontWeight: 700, color: "#E2EAF4", margin: "5px 0 3px", lineHeight: 1 },
  kpiChange: (up) => ({ fontSize: 11, color: up ? "#34D399" : "#FB7185", display: "flex", alignItems: "center", gap: 3 }),
  kpiIcon: { position: "absolute", top: 14, right: 14, fontSize: 24, opacity: 0.12 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 },
  btn: (variant) => {
    const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", outline: "none", fontFamily: "inherit", transition: "all 0.15s" };
    if (variant === "gold") return { ...base, background: "#C8A96E", color: "#080E1A" };
    if (variant === "ghost") return { ...base, background: "transparent", color: "#8FA3BF", border: "1px solid rgba(255,255,255,0.07)" };
    if (variant === "danger") return { ...base, background: "rgba(251,113,133,0.12)", color: "#FB7185", border: "1px solid rgba(251,113,133,0.22)" };
    return base;
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 15px", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.13em", color: "#4A6080", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: 400, whiteSpace: "nowrap" },
  td: { padding: "11px 15px", borderBottom: "1px solid rgba(255,255,255,0.025)", verticalAlign: "middle", color: "#8FA3BF", fontSize: 13.5 },
  progressBar: { height: 5, background: "#172440", borderRadius: 3, overflow: "hidden", marginTop: 5 },
  progressFill: (w, color) => ({ height: "100%", borderRadius: 3, background: color || "linear-gradient(90deg,#C8A96E,#E8C98A)", width: `${w}%`, transition: "width 1s ease" }),
  input: { background: "#121E33", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, color: "#E2EAF4", fontFamily: "inherit", fontSize: 13.5, padding: "8px 12px", outline: "none", width: "100%" },
  label: { fontSize: 10, color: "#4A6080", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" },
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(5px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { background: "#0D1627", border: "1px solid rgba(200,169,110,0.25)", borderRadius: 14, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" },
  modalHeader: { padding: "18px 22px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" },
  modalFooter: { padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 10, justifyContent: "flex-end" },
};

const BADGE_STYLES = {
  available: { background: "rgba(52,211,153,0.1)", color: "#34D399" },
  occupied: { background: "rgba(56,189,248,0.1)", color: "#38BDF8" },
  housekeeping: { background: "rgba(251,191,36,0.1)", color: "#FBBF24" },
  maintenance: { background: "rgba(251,113,133,0.1)", color: "#FB7185" },
  confirmed: { background: "rgba(52,211,153,0.1)", color: "#34D399" },
  pending: { background: "rgba(251,191,36,0.1)", color: "#FBBF24" },
  "checked-in": { background: "rgba(56,189,248,0.1)", color: "#38BDF8" },
  done: { background: "rgba(52,211,153,0.1)", color: "#34D399" },
  "in-progress": { background: "rgba(251,191,36,0.1)", color: "#FBBF24" },
  high: { background: "rgba(251,113,133,0.1)", color: "#FB7185" },
  medium: { background: "rgba(251,191,36,0.1)", color: "#FBBF24" },
  low: { background: "rgba(52,211,153,0.1)", color: "#34D399" },
  vip: { background: "rgba(200,169,110,0.15)", color: "#E8C98A", border: "1px solid rgba(200,169,110,0.3)" },
};

function Badge({ s }) {
  const style = BADGE_STYLES[s] || { background: "rgba(255,255,255,0.08)", color: "#8FA3BF" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.04em", textTransform: "capitalize", ...style }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block", flexShrink: 0 }} />
      {s.replace("-", " ")}
    </span>
  );
}

function KpiCard({ label, value, change, icon, accent, up = true }) {
  return (
    <div style={S.kpiCard(accent)}>
      <div style={S.kpiIcon}>{icon}</div>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiVal}>{value}</div>
      <div style={S.kpiChange(up)}>{up ? "▲" : "▼"} {change}</div>
    </div>
  );
}

function RevenueChart() {
  const maxVal = Math.max(...REVENUE_DATA.map(d => d.rooms + d.fnb + d.spa));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "18px 20px 0", height: 190 }}>
        {REVENUE_DATA.map((d) => (
          <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 155 }}>
              {[{ val: d.rooms, color: "linear-gradient(to top,#C8A96E,#E8C98A)" }, { val: d.fnb, color: "linear-gradient(to top,#2DD4BF,#67E8F9)" }, { val: d.spa, color: "linear-gradient(to top,#9B72CF,#C4B5FD)" }].map((bar, bi) => (
                <div key={bi} style={{ width: 16, height: `${(bar.val / maxVal) * 148}px`, background: bar.color, borderRadius: "3px 3px 0 0", transition: "all 0.6s", cursor: "pointer" }} title={`$${bar.val.toLocaleString()}`} />
              ))}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4A6080" }}>{d.month}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, padding: "10px 20px 16px" }}>
        {[["#C8A96E", "Rooms"], ["#2DD4BF", "F&B"], ["#9B72CF", "Spa"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8FA3BF" }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const occupied = ROOMS.filter(r => r.status === "occupied").length;
  const occ = Math.round((occupied / ROOMS.length) * 100);
  return (
    <div>
      <div style={S.kpiGrid}>
        <KpiCard label="Occupancy Rate" value={`${occ}%`} change="6% vs last week" icon="🛏️" accent="#38BDF8" up />
        <KpiCard label="Today's Revenue" value="$8,420" change="12% vs yesterday" icon="💰" accent="#C8A96E" up />
        <KpiCard label="Check-ins Today" value="7" change="2 pending" icon="🔑" accent="#34D399" up />
        <KpiCard label="Avg. Daily Rate" value="$284" change="3% vs last month" icon="📊" accent="#FB7185" up={false} />
      </div>
      <div style={{ ...S.grid2, marginBottom: 18 }}>
        <div style={S.panel}>
          <div style={S.panelHeader}>
            <div><div style={S.panelTitle}>Revenue Trend</div><div style={S.panelSub}>Last 7 months · All departments</div></div>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#C8A96E", background: "rgba(200,169,110,0.1)", padding: "3px 10px", borderRadius: 6 }}>$103.8k Mar</span>
          </div>
          <RevenueChart />
        </div>
        <div style={S.panel}>
          <div style={S.panelHeader}><div><div style={S.panelTitle}>Room Status</div><div style={S.panelSub}>Live · {ROOMS.length} rooms</div></div></div>
          <div style={{ padding: "14px 20px" }}>
            {[{ l: "Available", s: "available", c: "#34D399" }, { l: "Occupied", s: "occupied", c: "#38BDF8" }, { l: "Housekeeping", s: "housekeeping", c: "#FBBF24" }, { l: "Maintenance", s: "maintenance", c: "#FB7185" }].map(row => {
              const cnt = ROOMS.filter(r => r.status === row.s).length;
              return (
                <div key={row.l} style={{ marginBottom: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "#8FA3BF" }}>{row.l}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: row.c }}>{cnt}/{ROOMS.length}</span>
                  </div>
                  <div style={S.progressBar}><div style={S.progressFill((cnt / ROOMS.length) * 100, row.c)} /></div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "14px 20px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4A6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Today's Activity</div>
            {[
              { icon: "✅", text: "James Thornton checked in · Room 102", time: "08:15" },
              { icon: "🧹", text: "Room 103 housekeeping started", time: "09:00" },
              { icon: "🔧", text: "Room 104 flagged for maintenance", time: "09:30" },
              { icon: "📋", text: "New reservation · Sofia Andersson", time: "10:12" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 9, marginBottom: 7, alignItems: "flex-start" }}>
                <span style={{ fontSize: 13 }}>{a.icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: "#8FA3BF" }}>{a.text}</span>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4A6080", flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={S.grid2}>
        <div style={S.panel}>
          <div style={S.panelHeader}><div style={S.panelTitle}>Today's Arrivals</div></div>
          <table style={S.table}><thead><tr><th style={S.th}>Guest</th><th style={S.th}>Room</th><th style={S.th}>Type</th><th style={S.th}>Status</th></tr></thead>
            <tbody>{RESERVATIONS_INIT.slice(0, 4).map(r => (<tr key={r.id}><td style={{ ...S.td, color: "#E2EAF4", fontWeight: 500 }}>{r.guest}</td><td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>{r.room}</td><td style={S.td}>{r.type}</td><td style={S.td}><Badge s={r.status} /></td></tr>))}</tbody>
          </table>
        </div>
        <div style={S.panel}>
          <div style={S.panelHeader}><div style={S.panelTitle}>Housekeeping Queue</div></div>
          <table style={S.table}><thead><tr><th style={S.th}>Room</th><th style={S.th}>Task</th><th style={S.th}>Staff</th><th style={S.th}>Priority</th></tr></thead>
            <tbody>{HOUSEKEEPING_INIT.map((h, i) => (<tr key={i}><td style={{ ...S.td, fontFamily: "monospace", fontSize: 13, color: "#E2EAF4" }}>{h.room}</td><td style={{ ...S.td, color: "#E2EAF4", fontWeight: 500 }}>{h.task}</td><td style={{ ...S.td, fontSize: 12 }}>{h.staff.split(" ")[0]}</td><td style={S.td}><Badge s={h.priority} /></td></tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoomsPage() {
  const [filter, setFilter] = useState("all");
  const statusColors = { available: "#34D399", occupied: "#38BDF8", housekeeping: "#FBBF24", maintenance: "#FB7185" };
  const filtered = filter === "all" ? ROOMS : ROOMS.filter(r => r.status === filter);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "available", "occupied", "housekeeping", "maintenance"].map(f => (
          <button key={f} style={{ ...S.btn(filter === f ? "gold" : "ghost"), textTransform: "capitalize", fontSize: 12 }} onClick={() => setFilter(f)}>
            {f} {f !== "all" && `(${ROOMS.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <div><div style={S.panelTitle}>Room Inventory</div><div style={S.panelSub}>Showing {filtered.length} of {ROOMS.length} rooms</div></div>
          <button style={S.btn("gold")}>＋ Add Room</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 12, padding: 20 }}>
          {filtered.map(room => (
            <div key={room.id} style={{ background: "#121E33", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: 14, cursor: "pointer", transition: "all 0.2s", borderTop: `3px solid ${statusColors[room.status]}`, position: "relative" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.4)"; e.currentTarget.style.borderColor = statusColors[room.status]; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#E2EAF4", lineHeight: 1 }}>{room.id}</div>
              <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2, fontFamily: "monospace" }}>{room.type} · Fl {room.floor}</div>
              <div style={{ fontSize: 11, color: "#8FA3BF", marginTop: 8 }}>{room.beds} · {room.view}</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#C8A96E", marginTop: 5 }}>${room.rate}/night</div>
              {room.guest && <div style={{ fontSize: 10, color: "#38BDF8", marginTop: 4 }}>👤 {room.guest.split(" ")[0]}</div>}
              <div style={{ marginTop: 8 }}><Badge s={room.status} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReservationsPage() {
  const [reservations, setReservations] = useState(RESERVATIONS_INIT);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ guest: "", checkIn: "", checkOut: "", type: "Standard", source: "Direct" });

  const filtered = reservations.filter(r => r.guest.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = () => {
    if (!form.guest) return;
    const newRes = { id: `RES-00${reservations.length + 1}`, guest: form.guest, room: "205", type: form.type, checkIn: form.checkIn || "Mar 10", checkOut: form.checkOut || "Mar 12", nights: 2, total: 440, status: "confirmed", source: form.source };
    setReservations([...reservations, newRes]);
    setShowModal(false);
    setForm({ guest: "", checkIn: "", checkOut: "", type: "Standard", source: "Direct" });
  };

  return (
    <div>
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <div><div style={S.panelTitle}>Reservations</div><div style={S.panelSub}>{reservations.length} total · March 2026</div></div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#121E33", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 12px" }}>
              <span style={{ fontSize: 13, color: "#4A6080" }}>🔍</span>
              <input style={{ background: "none", border: "none", outline: "none", color: "#E2EAF4", fontSize: 12, width: 170 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button style={S.btn("gold")} onClick={() => setShowModal(true)}>＋ New Reservation</button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead><tr>{["ID", "Guest", "Room", "Type", "Check-in", "Check-out", "Nights", "Total", "Source", "Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onMouseEnter={e => e.currentTarget.querySelectorAll("td").forEach(td => td.style.background = "rgba(255,255,255,0.015)")} onMouseLeave={e => e.currentTarget.querySelectorAll("td").forEach(td => td.style.background = "")}>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 10, color: "#C8A96E" }}>{r.id}</td>
                  <td style={{ ...S.td, color: "#E2EAF4", fontWeight: 500 }}>{r.guest}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{r.room}</td>
                  <td style={S.td}>{r.type}</td>
                  <td style={{ ...S.td, fontSize: 12 }}>{r.checkIn}</td>
                  <td style={{ ...S.td, fontSize: 12 }}>{r.checkOut}</td>
                  <td style={{ ...S.td, textAlign: "center" }}>{r.nights}</td>
                  <td style={{ ...S.td, fontFamily: "monospace", color: "#C8A96E" }}>${r.total.toLocaleString()}</td>
                  <td style={{ ...S.td, fontSize: 11, color: "#4A6080" }}>{r.source}</td>
                  <td style={S.td}><Badge s={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <div style={S.modal} onClick={() => setShowModal(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#E2EAF4" }}>New Reservation</div>
              <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 20 }}>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={S.label}>Guest Name *</label>
                <input style={S.input} placeholder="Full name" value={form.guest} onChange={e => setForm({ ...form, guest: e.target.value })} />
              </div>
              {[["checkIn", "Check-in Date", "date"], ["checkOut", "Check-out Date", "date"]].map(([k, l, t]) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={S.label}>{l}</label>
                  <input style={S.input} type={t} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              {[["type", "Room Type", ["Standard", "Deluxe", "Suite", "Presidential"]], ["source", "Booking Source", ["Direct", "Booking.com", "Expedia", "Corporate"]]].map(([k, l, opts]) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={S.label}>{l}</label>
                  <select style={{ ...S.input, appearance: "none" }} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={S.modalFooter}>
              <button style={S.btn("ghost")} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={S.btn("gold")} onClick={handleAdd}>Create Reservation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestsPage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 14 }}>
      {GUESTS.map(g => (
        <div key={g.id} style={{ background: "#0D1627", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 20, transition: "all 0.2s", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(200,169,110,0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = ""; }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#C8A96E,#2DD4BF)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#080E1A", fontSize: 15, flexShrink: 0 }}>
              {g.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#E2EAF4" }}>{g.name}</span>
                {g.vip && <Badge s="vip" />}
              </div>
              <div style={{ fontSize: 11, color: "#4A6080" }}>{g.nationality} · Room {g.room}</div>
              <div style={{ fontSize: 11, color: "#4A6080", marginTop: 1 }}>{g.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {[["Stays", g.visits], ["Lifetime", `$${(g.totalSpend / 1000).toFixed(1)}k`], ["Points", g.loyalty.toLocaleString()]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 20, fontWeight: 700, color: "#E2EAF4", lineHeight: 1 }}>{v}</div><div style={{ fontSize: 9, color: "#4A6080", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{l}</div></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HousekeepingPage() {
  const [tasks, setTasks] = useState(HOUSEKEEPING_INIT);
  const cycle = (idx) => {
    const order = ["pending", "in-progress", "done"];
    setTasks(tasks.map((t, i) => i === idx ? { ...t, status: order[(order.indexOf(t.status) + 1) % 3] } : t));
  };
  return (
    <div>
      <div style={{ ...S.kpiGrid, gridTemplateColumns: "repeat(3,1fr)" }}>
        <KpiCard label="Pending" value={tasks.filter(t => t.status === "pending").length} change="tasks queued" icon="⏳" accent="#FBBF24" up />
        <KpiCard label="In Progress" value={tasks.filter(t => t.status === "in-progress").length} change="currently active" icon="🧹" accent="#38BDF8" up />
        <KpiCard label="Completed" value={tasks.filter(t => t.status === "done").length} change="today" icon="✅" accent="#34D399" up />
      </div>
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <div style={S.panelTitle}>Housekeeping Tasks</div>
          <button style={S.btn("gold")}>＋ Assign Task</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead><tr>{["Room", "Task", "Assigned To", "Priority", "Time", "Status", "Action"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {tasks.map((h, i) => (
                <tr key={i}>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 14, color: "#E2EAF4" }}>{h.room}</td>
                  <td style={{ ...S.td, color: "#E2EAF4", fontWeight: 500 }}>{h.task}</td>
                  <td style={S.td}>{h.staff}</td>
                  <td style={S.td}><Badge s={h.priority} /></td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{h.time}</td>
                  <td style={S.td}><Badge s={h.status} /></td>
                  <td style={S.td}>
                    <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: 11 }} onClick={() => cycle(i)}>
                      {h.status === "done" ? "↺ Reset" : "Update →"}
                    </button>
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

function BillingPage() {
  return (
    <div>
      <div style={S.kpiGrid}>
        <KpiCard label="Today's Collections" value="$5,840" change="vs $4,120 yesterday" icon="💳" accent="#C8A96E" up />
        <KpiCard label="Outstanding" value="$12,300" change="4 folios pending" icon="📋" accent="#FB7185" up={false} />
        <KpiCard label="Refunds" value="$420" change="2 transactions" icon="↩️" accent="#FBBF24" up={false} />
        <KpiCard label="Monthly Revenue" value="$103.8k" change="18% vs Feb" icon="📈" accent="#34D399" up />
      </div>
      <div style={S.grid2}>
        <div style={S.panel}>
          <div style={S.panelHeader}><div style={S.panelTitle}>Active Folios</div><button style={S.btn("gold")}>＋ New Invoice</button></div>
          <table style={S.table}>
            <thead><tr>{["Guest", "Room", "Charges", "Balance", "Action"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {GUESTS.map((g, i) => {
                const charges = [2100, 880, 4500, 3200, 660][i];
                const balance = [1200, 440, 2100, 800, 220][i];
                return (
                  <tr key={g.id}>
                    <td style={{ ...S.td, color: "#E2EAF4", fontWeight: 500 }}>{g.name}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{g.room}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#E2EAF4" }}>${charges.toLocaleString()}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#C8A96E" }}>${balance.toLocaleString()}</td>
                    <td style={S.td}><button style={{ ...S.btn("ghost"), padding: "3px 9px", fontSize: 11 }}>Checkout</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={S.panel}>
          <div style={S.panelHeader}><div style={S.panelTitle}>Revenue Breakdown</div></div>
          {[["Room Revenue", "$73,000", 71], ["Food & Beverage", "$21,000", 20], ["Spa & Wellness", "$9,800", 9]].map(([l, v, p]) => (
            <div key={l} style={{ padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: 13, color: "#8FA3BF" }}>{l}</span>
                <span style={{ fontFamily: "monospace", color: "#C8A96E", fontSize: 13 }}>{v}</span>
              </div>
              <div style={S.progressBar}><div style={S.progressFill(p)} /></div>
              <div style={{ fontSize: 10, color: "#4A6080", marginTop: 4, fontFamily: "monospace" }}>{p}% of total</div>
            </div>
          ))}
          <div style={{ padding: "14px 20px" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4A6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Payment Methods</div>
            {[["💳 Credit Card", 58], ["💵 Cash", 22], ["🏦 Bank Transfer", 12], ["📱 Digital Wallet", 8]].map(([m, p]) => (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#8FA3BF", width: 130 }}>{m}</span>
                <div style={S.progressBar}><div style={S.progressFill(p, "#2DD4BF")} /></div>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4A6080", width: 28, textAlign: "right" }}>{p}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsPage() {
  const kpis = [["RevPAR", "$198.40", "+14%"], ["Avg Daily Rate", "$284.00", "+8%"], ["Occupancy", "69.8%", "+6%"], ["Guest Satisfaction", "4.8/5.0", "+0.2"], ["Length of Stay", "3.4 nights", "+0.5"], ["Cancellation Rate", "6.2%", "-1.1%"], ["Direct Bookings", "42%", "+5%"], ["F&B / Guest", "$87", "+$12"]];
  return (
    <div>
      <div style={{ ...S.grid3, marginBottom: 18 }}>
        {[["🛏️", "Occupancy Report", "Daily room utilization stats", "#38BDF8"], ["💰", "Revenue Report", "Financial performance summary", "#C8A96E"], ["👥", "Guest Analytics", "Visitor demographics & trends", "#2DD4BF"], ["🧹", "Housekeeping Log", "Task completion & staff KPIs", "#FBBF24"], ["🍽️", "F&B Report", "Restaurant & room service data", "#FB7185"], ["📑", "Tax Report", "GST/VAT collection summary", "#34D399"]].map(([icon, title, desc, color]) => (
          <div key={title} style={{ ...S.panel, cursor: "pointer", transition: "border-color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = color}
            onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}>
            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 26, marginBottom: 9 }}>{icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#E2EAF4", marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#4A6080" }}>{desc}</div>
              <button style={{ ...S.btn("ghost"), marginTop: 12, fontSize: 11, padding: "5px 12px" }}>Generate ↗</button>
            </div>
          </div>
        ))}
      </div>
      <div style={S.panel}>
        <div style={S.panelHeader}><div style={S.panelTitle}>Key Performance Indicators · March 2026</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {kpis.map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 13, color: "#8FA3BF" }}>{l}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", color: "#34D399", fontSize: 12 }}>{c}</span>
                <span style={{ fontFamily: "monospace", color: "#C8A96E", fontSize: 13, fontWeight: 500 }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HotelFountainApp() {
  const [page, setPage] = useState("dashboard");

  const nav = [
    { section: "Operations", items: [{ id: "dashboard", label: "Dashboard", icon: "⬛" }, { id: "rooms", label: "Rooms", icon: "🛏️" }, { id: "reservations", label: "Reservations", icon: "📅", badge: "3" }, { id: "housekeeping", label: "Housekeeping", icon: "🧹", badge: "4" }] },
    { section: "Guest Services", items: [{ id: "guests", label: "Guest CRM", icon: "👥" }, { id: "billing", label: "Billing", icon: "💳" }] },
    { section: "Intelligence", items: [{ id: "reports", label: "Reports", icon: "📊" }] },
  ];

  const titles = { dashboard: "Dashboard", rooms: "Room Management", reservations: "Reservations", housekeeping: "Housekeeping", guests: "Guest CRM", billing: "Billing & Finance", reports: "Reports & Analytics" };
  const pages = { dashboard: <Dashboard />, rooms: <RoomsPage />, reservations: <ReservationsPage />, housekeeping: <HousekeepingPage />, guests: <GuestsPage />, billing: <BillingPage />, reports: <ReportsPage /> };

  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoMark}>🏨 Hotel Fountain</div>
          <div style={S.logoSub}>V5.2.0 · Luxury PMS</div>
        </div>
        <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          {nav.map(sec => (
            <div key={sec.section} style={S.navSection}>
              <div style={S.navLabel}>{sec.section}</div>
              {sec.items.map(item => (
                <div key={item.id} style={S.navItem(page === item.id)} onClick={() => setPage(item.id)}
                  onMouseEnter={e => { if (page !== item.id) { e.currentTarget.style.background = "#121E33"; e.currentTarget.style.color = "#E2EAF4"; } }}
                  onMouseLeave={e => { if (page !== item.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8FA3BF"; } }}>
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge && <span style={S.badge}>{item.badge}</span>}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={S.sideFooter}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.userAvatar}>AM</div>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "#E2EAF4" }}>Alex Morgan</div><div style={{ fontSize: 10, color: "#4A6080" }}>General Manager</div></div>
          </div>
        </div>
      </aside>

      <div style={S.main}>
        <div style={S.topbar}>
          <div style={S.topTitle}>{titles[page]}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#121E33", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 12px", minWidth: 180 }}>
              <span style={{ fontSize: 13, color: "#4A6080" }}>🔍</span>
              <input style={{ background: "none", border: "none", outline: "none", color: "#E2EAF4", fontSize: 12, width: "100%" }} placeholder="Quick search…" />
            </div>
            <div style={{ position: "relative", background: "#121E33", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 15, color: "#8FA3BF" }}>
              🔔<div style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "#FB7185", border: "2px solid #080E1A" }} />
            </div>
            <div style={{ background: "#121E33", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 14, color: "#8FA3BF" }}>⚙️</div>
          </div>
        </div>
        <div style={S.content}>{pages[page]}</div>
      </div>
    </div>
  );
}
