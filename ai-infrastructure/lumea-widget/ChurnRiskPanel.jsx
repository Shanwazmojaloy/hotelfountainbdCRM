// ChurnRiskPanel.jsx
// Lumea CRM — Churn Risk panel (Concept 2: Warm Ivory Editorial).
// Reads churn profiles written by the churn predictor pipeline.
//
// Usage:
//   import ChurnRiskPanel from "./ChurnRiskPanel";
//   <ChurnRiskPanel supabase={supabase} />
//
// - With a Supabase client, it queries public.account_churn_profile embedding
//   b2b_partners(agency_name,email,status). RLS keeps it tenant-scoped.
// - Without one, it renders representative mock data so you can preview styling.

import { useEffect, useMemo, useState } from "react";

const INK = "#2B2722";
const BORDER = "#EAE6DD";
const IVORY = "#FBF9F4";
const CARD = "#FFFFFF";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const RISK = {
  High:   { fg: "#8C2F1D", bg: "#FBEDE9", glow: "rgba(140,47,29,0.18)" },
  Medium: { fg: "#8A6A1E", bg: "#FBF4E2", glow: "rgba(138,106,30,0.16)" },
  Low:    { fg: "#3F6A4B", bg: "#ECF4ED", glow: "rgba(63,106,75,0.14)" },
};

const FONT_HEAD = '"Libre Baskerville", Georgia, serif';
const FONT_BODY = '"DM Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

const MOCK = [
  { account_id: "96afbf50", agency_name: "Saudia Travels BD", email: "ops@saudiatravels.bd",
    risk_status: "High", churn_score: 0.82, sentiment_slope: -0.41,
    recommended_action: "Exec-sponsor save play; QBR within 7 days",
    reasons: [
      { factor: "Competitor Evaluation", severity: "high", evidence: "evaluating a competitor next quarter" },
      { factor: "Pricing Dissatisfaction", severity: "medium", evidence: "renewal quote is hard to justify" },
    ], last_scored_at: new Date().toISOString() },
  { account_id: "35de1501", agency_name: "Umrah Express Dhaka", email: "book@umrahexpress.bd",
    risk_status: "Medium", churn_score: 0.51, sentiment_slope: -0.12,
    recommended_action: "CSM check-in; resolve open support ticket",
    reasons: [{ factor: "Unresolved Bug", severity: "medium", evidence: "ticket still open" }],
    last_scored_at: new Date().toISOString() },
];

function pct(x) { return Math.round((Number(x) || 0) * 100) + "%"; }
function slopeLabel(s) {
  const v = Number(s) || 0;
  if (v < -0.05) return "worsening";
  if (v > 0.05) return "improving";
  return "stable";
}
function timeAgo(iso) {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  return Math.floor(d) + "d ago";
}

function Badge({ status }) {
  const r = RISK[status] || RISK.Low;
  return (
    <span style={{
      fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.08em",
      textTransform: "uppercase", color: r.fg, background: r.bg,
      border: "1px solid " + r.fg + "33", borderRadius: 999,
      padding: "3px 10px", boxShadow: "0 0 0 3px " + r.glow,
      transition: "all 220ms " + EASE,
    }}>{status}</span>
  );
}

function ScoreBar({ score, status }) {
  const r = RISK[status] || RISK.Low;
  return (
    <div style={{ height: 6, background: BORDER, borderRadius: 999, overflow: "hidden" }}>
      <div style={{
        width: pct(score), height: "100%", background: r.fg,
        borderRadius: 999, transition: "width 400ms " + EASE,
      }} />
    </div>
  );
}

function Card({ row }) {
  const r = RISK[row.risk_status] || RISK.Low;
  return (
    <article style={{
      background: CARD, border: "1px solid " + BORDER, borderRadius: 14,
      padding: "2rem", transition: "box-shadow 220ms " + EASE + ", transform 220ms " + EASE,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 30px rgba(43,39,34,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: FONT_HEAD, fontSize: 19, color: INK, margin: 0 }}>{row.agency_name || row.account_id}</h3>
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#8A847A", marginTop: 4 }}>{row.email || row.account_id}</div>
        </div>
        <Badge status={row.risk_status} />
      </div>

      <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 30, color: r.fg, fontWeight: 600 }}>{pct(row.churn_score)}</span>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#8A847A" }}>
          churn probability · trend <strong style={{ color: INK }}>{slopeLabel(row.sentiment_slope)}</strong>
        </span>
      </div>
      <div style={{ marginTop: 10 }}><ScoreBar score={row.churn_score} status={row.risk_status} /></div>

      {Array.isArray(row.reasons) && row.reasons.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "1.25rem 0 0" }}>
          {row.reasons.slice(0, 4).map((rs, i) => (
            <li key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: i ? "1px solid " + BORDER : "none" }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: (RISK[cap(rs.severity)] || RISK.Low).fg, minWidth: 64 }}>
                {String(rs.severity || "").toUpperCase()}
              </span>
              <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK }}>
                <strong>{rs.factor}</strong>{rs.evidence ? " — " + rs.evidence : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {row.recommended_action && (
        <div style={{
          marginTop: "1.25rem", padding: "0.85rem 1rem", background: IVORY,
          border: "1px solid " + BORDER, borderRadius: 10,
          fontFamily: FONT_BODY, fontSize: 13, color: INK,
        }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#8A847A", letterSpacing: "0.06em" }}>NEXT STEP&nbsp;&nbsp;</span>
          {row.recommended_action}
        </div>
      )}

      <div style={{ marginTop: 12, fontFamily: FONT_MONO, fontSize: 11, color: "#A89F92" }}>
        scored {timeAgo(row.last_scored_at)}
      </div>
    </article>
  );
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export default function ChurnRiskPanel({ supabase = null, defaultFilter = "All" }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(defaultFilter);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) { setRows(MOCK); return; }
      const { data, error } = await supabase
        .from("account_churn_profile")
        .select("account_id, risk_status, churn_score, sentiment_slope, reasons, recommended_action, last_scored_at, b2b_partners(agency_name, email, status)")
        .order("sentiment_slope", { ascending: true })
        .order("churn_score", { ascending: false });
      if (!alive) return;
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data || []).map((d) => ({
        ...d,
        agency_name: d.b2b_partners?.agency_name,
        email: d.b2b_partners?.email,
      })));
    }
    load();
    return () => { alive = false; };
  }, [supabase]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    return filter === "All" ? rows : rows.filter((r) => r.risk_status === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c = { All: rows?.length || 0, High: 0, Medium: 0, Low: 0 };
    (rows || []).forEach((r) => { c[r.risk_status] = (c[r.risk_status] || 0) + 1; });
    return c;
  }, [rows]);

  return (
    <section style={{ background: IVORY, padding: "2rem", borderRadius: 16, border: "1px solid " + BORDER, fontFamily: FONT_BODY }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 26, color: INK, margin: 0 }}>Churn Risk</h2>
          <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#8A847A", margin: "6px 0 0" }}>
            Partner accounts ranked by cancellation risk and sentiment trend.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["All", "High", "Medium", "Low"].map((f) => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: FONT_MONO, fontSize: 12, cursor: "pointer",
                color: on ? "#FFF" : INK, background: on ? INK : "transparent",
                border: "1px solid " + (on ? INK : BORDER), borderRadius: 999,
                padding: "6px 14px", transition: "all 200ms " + EASE,
              }}>{f} · {counts[f] ?? 0}</button>
            );
          })}
        </div>
      </header>

      {error && (
        <div style={{ fontFamily: FONT_BODY, color: RISK.High.fg, background: RISK.High.bg, border: "1px solid " + RISK.High.fg + "33", borderRadius: 10, padding: "0.85rem 1rem" }}>
          Could not load churn data: {error}
        </div>
      )}

      {filtered === null && <div style={{ fontFamily: FONT_MONO, color: "#8A847A" }}>Loading churn profiles…</div>}

      {filtered && filtered.length === 0 && (
        <div style={{ fontFamily: FONT_BODY, color: "#8A847A", padding: "2rem", textAlign: "center", background: CARD, border: "1px dashed " + BORDER, borderRadius: 12 }}>
          No accounts at <strong>{filter}</strong> risk. That's a good sign.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.25rem" }}>
          {filtered.map((row) => <Card key={row.account_id} row={row} />)}
        </div>
      )}
    </section>
  );
}
