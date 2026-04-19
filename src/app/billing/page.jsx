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

      // Group by guest/room (from original App.jsx logic)
      const unifiedGroups = {};
      
      reservations.forEach((res) => {
        const key = `${res.guest_name}-${res.room_ids || res.room_number}`;
        if (!unifiedGroups[key]) {
          unifiedGroups[key] = { res, txs: [] };
        }
      });

      transactions.forEach((tx) => {
        // Find matching reservation/guest
        const matchingRes = reservations.find(
          (r) => r.guest_name === tx.guest_name || r.id === tx.reservation_id
        );
        if (matchingRes) {
          const key = `${matchingRes.guest_name}-${matchingRes.room_ids || matchingRes.room_number}`;
          if (unifiedGroups[key]) {
            unifiedGroups[key].txs.push(tx);
          }
        }
      });

      // Process displayList (exact logic from App.jsx)
  // 🔥 THE DHAKA ANCHOR (Bypasses the 20-Apr jump)
  const getDhakaDate = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()); 
  };

  const todayDhaka = getDhakaDate(); // Forces "2026-04-19"

  // --- UPDATED LEDGER FILTER ---
  const displayList = Object.values(unifiedGroups)
    .map(grp => {
      const invoice = grp.res;
      const comp = invoice ? computeBill(invoice) : null;
      const activeDate = filter === 'TODAY' ? todayDhaka : calDate;
      
      // STRICT: Only count payments collected ON the activeDate
      const collectionToday = grp.txs
        .filter(t => t.date === activeDate)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const totalPaidEver = (invoice?.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const balanceDue = comp ? comp.total - totalPaidEver : 0;
      
      return { ...grp, collectionToday, balanceDue, status: invoice?.status };
    })
    .filter(grp => {
      // Show only active guests, today's cash, or unpaid dues
      return grp.status === 'CHECKED_IN' || grp.collectionToday > 0 || grp.balanceDue > 0;
    });

      // Compute stats
      const revenue = displayList.reduce((sum, item) => sum + item.paidInReportPeriod, 0);
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
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              filter === tab
                ? "bg-neon-cyan text-black neon-glow shadow-lg"
                : "text-teal-300 hover:text-neon-cyan"
            }`}
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
            key={index}
            guestName={item.res?.guest_name || "Guest"}
            room={item.res?.room_ids || item.res?.room_number || "N/A"}
            status={item.status}
            stayDates={`${item.res?.check_in || ""} → ${item.res?.check_out || ""}`}
            folioDues={item.comp?.total?.toLocaleString() || 0}
            todayPaid={item.paidInReportPeriod?.toLocaleString() || 0}
            balanceDue={item.balanceDue?.toLocaleString() || 0}
            detailData={item}
          />
        ))}
        {billingData.length === 0 && (
          <div className="glass-card text-center py-16 text-teal-400">
            No active folios for selected period
          </div>
        )}
      </div>
    </div>
  );
}
