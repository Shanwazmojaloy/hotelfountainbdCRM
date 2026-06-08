'use client';

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import Layout from "@/components/Layout";
import BillingCard from "@/components/BillingCard";
import ProgressRing from "@/components/ProgressRing";

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

// Host-routed singleton (sends x-tenant-host) — RLS scopes rows to the tenant,
// same path /churn uses. Replaces the old createClient + NEXT_PUBLIC_TENANT_ID
// path, which resolved no tenant under host-routed RLS (showed all zeros).

function computeBill(invoice) {
  // Extracted from original App.jsx logic
  const total = Number(invoice?.total_amount || 0);
  const paid = (invoice?.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { total, paid, balance: total - paid };
}

export default function BillingPage() {
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("TODAY");
  const [stats, setStats] = useState({ revenue: 0, occupancy: 0 });

  useEffect(() => {
    fetchBillingData();
  }, [filter]);

  async function fetchBillingData() {
    setBillingData([]); // immediate cleanup before network round-trip
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: reservations } = await supabase
        .from("reservations")
        .select("*")
        .order("check_in", { ascending: false });

      const { data: transactions } = await supabase
        .from("transactions")
        .select("*");

      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, room_number, status");

      // Group by reservation UUID — prevents key collisions when guest_name is null
      const unifiedGroups = {};

      reservations.forEach((res) => {
        unifiedGroups[res.id] = { res, txs: [] };
      });

      transactions.forEach((tx) => {
        // Primary: match by reservation_id (UUID anchor)
        if (tx.reservation_id && unifiedGroups[tx.reservation_id]) {
          unifiedGroups[tx.reservation_id].txs.push(tx);
          return;
        }
        // Fallback: match orphan TXs by room_number + date overlap
        const roomNum = tx.room_number;
        const txDate = tx.created_at ? tx.created_at.slice(0, 10) : null;
        if (!roomNum || !txDate) return;
        const matchingRes = reservations.find((r) => {
          const inRoom = Array.isArray(r.room_ids)
            ? r.room_ids.includes(roomNum)
            : r.room_number === roomNum;
          const ciDate = r.check_in ? r.check_in.slice(0, 10) : null;
          const coDate = r.check_out ? r.check_out.slice(0, 10) : null;
          return inRoom && ciDate && coDate && txDate >= ciDate && txDate <= coDate;
        });
        if (matchingRes && unifiedGroups[matchingRes.id]) {
          unifiedGroups[matchingRes.id].txs.push(tx);
        }
      });

      // 🔥 THE DHAKA ANCHOR
      const getDhakaDate = () => {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Dhaka',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());
      };

      const todayDhaka = getDhakaDate();

      // Date range bounds for WEEK/MONTH filters
      const getFilterBounds = () => {
        const today = new Date(todayDhaka);
        if (filter === 'WEEK') {
          const start = new Date(today); start.setDate(today.getDate() - 6);
          return { from: start.toISOString().slice(0, 10), to: todayDhaka };
        }
        if (filter === 'MONTH') {
          const start = new Date(today); start.setDate(1);
          return { from: start.toISOString().slice(0, 10), to: todayDhaka };
        }
        return { from: todayDhaka, to: todayDhaka };
      };
      const { from: dateFrom, to: dateTo } = getFilterBounds();

      // --- LEDGER FILTER ---
      const displayList = Object.values(unifiedGroups)
        .map(grp => {
          const invoice = grp.res;
          const totalAmount = Number(invoice?.total_amount || 0);
          const discountAmount = Number(invoice?.discount_amount || invoice?.discount || 0);
          const billTotal = totalAmount - discountAmount;

          // Use paid_amount from reservations table (DB-authoritative)
          const totalPaidEver = Number(invoice?.paid_amount || 0);
          const balanceDue = Math.max(0, billTotal - totalPaidEver);

          // Payments collected within the active date range.
          // Exclude "Balance Carried Forward" — accounting entries, not real cash.
          // Mirrors daily-ops revenue-manager logic so email report == billing page.
          const collectionToday = grp.txs
            .filter(t => {
              if (/balance carried forward/i.test(t.type ?? '')) return false;
              const d = (t.fiscal_day || t.created_at || '').slice(0, 10);
              return d >= dateFrom && d <= dateTo;
            })
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          return { ...grp, billTotal, collectionToday, balanceDue, paidInReportPeriod: collectionToday, status: invoice?.status };
        })
        .filter(grp => {
          return grp.status === 'CHECKED_IN' || grp.collectionToday > 0 || grp.balanceDue > 0;
        });

      // Compute stats
      const revenue = displayList.reduce((sum, item) => sum + (item.paidInReportPeriod || 0), 0);
      const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED").length;
      const occupancy = rooms.length > 0 ? Math.round((occupiedRooms / rooms.length) * 100) : 0;

      setBillingData(displayList);
      setStats({ revenue, occupancy });
    } catch (error) {
      console.error("Billing fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-96">
          <div className="iv-stat__sub">Loading billing ledger…</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Billing &amp; Invoices</h1>

      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Today Revenue</div>
          <div className="iv-stat__val">{bdt(stats.revenue)}</div>
          <div className="iv-stat__sub">Collected · {filter.toLowerCase()}</div>
        </div>
        <div className="iv-card iv-card--hover flex items-center gap-5">
          <ProgressRing progress={stats.occupancy} size={64} color="#8B6914" />
          <div>
            <div className="iv-stat__lbl">Occupancy Rate</div>
            <div className="iv-stat__val">{stats.occupancy}%</div>
          </div>
        </div>
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Active Folios</div>
          <div className="iv-stat__val">{billingData.length}</div>
          <div className="iv-stat__sub">In selected period</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 mb-8" style={{ background: '#EDE8DF', borderRadius: 2, width: 'fit-content' }}>
        {["TODAY", "WEEK", "MONTH"].map((tab) => (
          <button
            key={tab}
            className="px-6 py-2 text-xs font-semibold tracking-wider uppercase transition-all"
            style={
              filter === tab
                ? { background: '#8B6914', color: '#fff', borderRadius: 2 }
                : { background: 'transparent', color: '#5C5347', borderRadius: 2 }
            }
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Billing Cards / Table */}
      <div className="space-y-4">
        {billingData.map((item, index) => (
          <BillingCard
            reservationId={item.res?.id}
            onCheckoutSuccess={fetchBillingData}
            key={index}
            guestName={item.res?.guest_name || "Guest"}
            room={Array.isArray(item.res?.room_ids) ? item.res.room_ids.join(', ') : (item.res?.room_number || "N/A")}
            status={item.status}
            stayDates={`${item.res?.check_in || ""} → ${item.res?.check_out || ""}`}
            folioDues={item.billTotal || 0}
            todayPaid={item.paidInReportPeriod || 0}
            balanceDue={item.balanceDue || 0}
            detailData={item}
          />
        ))}
        {billingData.length === 0 && (
          <div className="iv-card text-center py-16 iv-stat__sub">
            No active folios for selected period
          </div>
        )}
      </div>
    </Layout>
  );
}
