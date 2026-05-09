'use client';

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import BillingCard from "@/components/BillingCard";
import ProgressRing from "../../components/ProgressRing";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
);

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || '';

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
      const { data: reservations } = await supabase
        .from("reservations")
        .select("*")
        .eq("tenant_id", TENANT_ID)
        .order("check_in", { ascending: false });

      const { data: transactions } = await supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", TENANT_ID);

      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, room_number, status")
        .eq("tenant_id", TENANT_ID);

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

          // Payments collected within the active date range
          const collectionToday = grp.txs
            .filter(t => {
              const d = (t.fiscal_day || t.created_at || '').slice(0, 10);
              return d >= dateFrom && d <= dateTo;
            })
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          return { ...grp, collectionToday, balanceDue, paidInReportPeriod: collectionToday, status: invoice?.status };
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
      <div className="flex items-center justify-center min-h-96">
        <div className="text-teal-400 text-lg">Loading billing ledger...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header Stats */}
      <div className="stats-scroll mb-8">
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-teal-400 text-xs uppercase tracking-wider mb-2">Today Revenue</div>
          <ProgressRing 
            progress={75} 
            size={72} 
            className="text-neon-cyan mb-2" 
          />
          <div className="text-2xl font-bold text-neon-cyan">৳{stats.revenue.toLocaleString()}</div>
        </div>
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-teal-400 text-xs uppercase tracking-wider mb-2">Occupancy Rate</div>
          <ProgressRing 
            progress={stats.occupancy} 
            size={72} 
            className="text-emerald-400 mb-2" 
          />
          <div className="text-2xl font-bold text-emerald-400">{stats.occupancy}%</div>
        </div>
        <div className="glass-card min-w-64 flex flex-col items-center p-6 snap-center shrink-0">
          <div className="text-teal-400 text-xs uppercase tracking-wider mb-2">Active Folios</div>
          <div className="text-3xl font-bold text-yellow-400">{billingData.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-teal-900/50 rounded-xl p-1 mb-8 glass">
        {["TODAY", "WEEK", "MONTH"].map((tab) => (
          <button
            key={tab}
            className={`flex-1 py-3 px-4 rounded-