'use client';

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import BillingCard from "@/components/BillingCard";
import ProgressRing from "../../components/ProgressRing";

const supabase = createClient(
  "https://mynwfkgksqqwlqowlscj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow"
);

const TENANT_ID = "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8";

function computeBill(invoice) {
  const total = Number(invoice?.total_amount || 0);
  const paid = (invoice?.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { total, paid, balance: total - paid };
}

function getDhakaDateStr(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getFilterStartDate(filter) {
  if (filter === 'WEEK') return getDhakaDateStr(-7);
  if (filter === 'MONTH') {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(firstOfMonth);
  }
  return getDhakaDateStr(); // TODAY
}

export default function BillingPageContent() {
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("TODAY");
  const [stats, setStats] = useState({ revenue: 0, occupancy: 0 });

  useEffect(() => {
    fetchBillingData();
  }, [filter]);

  async function fetchBillingData() {
    setBillingData([]);
    setLoading(true);
    try {
      const [{ data: reservations }, { data: transactions }, { data: rooms }] = await Promise.all([
        supabase.from("reservations").select("*").eq("tenant_id", TENANT_ID).order("check_in", { ascending: false }),
        supabase.from("transactions").select("*").eq("tenant_id", TENANT_ID),
        supabase.from("rooms").select("id, room_number, status").eq("tenant_id", TENANT_ID),
      ]);

      const safeReservations = reservations || [];
      const safeTransactions = transactions || [];
      const safeRooms = rooms || [];

      // Group reservations by guest/room key
      const unifiedGroups = {};
      safeReservations.forEach((res) => {
        const key = `${res.guest_name}-${res.room_ids || res.room_number}`;
        if (!unifiedGroups[key]) {
          unifiedGroups[key] = { res, txs: [] };
        }
      });

      // Attach transactions to matching reservations
      safeTransactions.forEach((tx) => {
        const matchingRes = safeReservations.find(
          (r) => r.guest_name === tx.guest_name || r.id === tx.reservation_id
        );
        if (matchingRes) {
          const key = `${matchingRes.guest_name}-${matchingRes.room_ids || matchingRes.room_number}`;
          if (unifiedGroups[key]) unifiedGroups[key].txs.push(tx);
        }
      });

      const todayDhaka = getDhakaDateStr();
      const startDate = getFilterStartDate(filter);

      const displayList = Object.values(unifiedGroups)
        .map((grp) => {
          const invoice = grp.res;
          const comp = invoice ? computeBill(invoice) : null;

          // Sum payments collected within the selected date range
          const collectionInPeriod = grp.txs
            .filter((t) => t.date >= startDate && t.date <= todayDhaka)
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          const totalPaidEver = (invoice?.payments || []).reduce(
            (sum, p) => sum + (Number(p.amount) || 0), 0
          );
          const balanceDue = comp ? comp.total - totalPaidEver : 0;

          return { ...grp, comp, collectionInPeriod, balanceDue, status: invoice?.status };
        })
        .filter((grp) => grp.status === 'CHECKED_IN' || grp.collectionInPeriod > 0 || grp.balanceDue > 0);

      const revenue = displayList.reduce((sum, item) => sum + item.collectionInPeriod, 0);
      const occupiedRooms = safeRooms.filter((r) => r.status === "OCCUPIED").length;
      const occupancy = safeRooms.length > 0 ? Math.round((occupiedRooms / safeRooms.length) * 100) : 0;

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
      <div className="flex items-center justify-center min-h-96">
        <div className="text-lg" style={{ color: 'var(--neon-cyan)' }}>Loading billing ledger…</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header Stats */}
      <div className="stats-scroll mb-8">
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#5eead4' }}>Today Revenue</div>
          <ProgressRing progress={75} size={72} className="mb-2" />
          <div className="text-2xl font-bold" style={{ color: 'var(--neon-cyan)' }}>
            ৳{stats.revenue.toLocaleString()}
          </div>
        </div>
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#5eead4' }}>Occupancy Rate</div>
          <ProgressRing progress={stats.occupancy} size={72} className="mb-2" />
          <div className="text-2xl font-bold" style={{ color: '#34d399' }}>
            {stats.occupancy}%
          </div>
        </div>
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#5eead4' }}>Active Folios</div>
          <div className="text-3xl font-bold" style={{ color: '#fbbf24' }}>{billingData.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex rounded-xl p-1 mb-8 glass" style={{ background: 'rgba(15, 118, 110, 0.25)' }}>
        {["TODAY", "WEEK", "MONTH"].map((tab) => (
          <button
            key={tab}
            className="flex-1 py-3 px-4 rounded-lg font-medium transition-all"
            style={
              filter === tab
                ? { background: 'var(--neon-cyan)', color: '#000', boxShadow: '0 0 1rem var(--neon-cyan)' }
                : { color: '#5eead4' }
            }
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Billing Cards */}
      <div className="space-y-4">
        {billingData.map((item, index) => (
          <BillingCard
            key={index}
            reservationId={item.res?.id}
            onCheckoutSuccess={fetchBillingData}
            guestName={item.res?.guest_name || "Guest"}
            room={item.res?.room_ids || item.res?.room_number || "N/A"}
            status={item.status}
            stayDates={`${item.res?.check_in || ""} → ${item.res?.check_out || ""}`}
            folioDues={item.comp?.total || 0}
            todayPaid={item.collectionInPeriod || 0}
            balanceDue={item.balanceDue || 0}
            detailData={item}
          />
        ))}
        {billingData.length === 0 && (
          <div className="glass-card text-center py-16" style={{ color: '#5eead4' }}>
            No active folios for selected period
          </div>
        )}
      </div>
    </div>
  );
}
