'use client';

// NOTE: This page is a standalone Next.js route at /suppliers.
// Nav integration: A "Suppliers" link is added to App.jsx's NAV_ITEMS (sidebar).
// Clicking it in the CRM navigates to this page via window.location.href = '/suppliers'.

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SupplierCard, { Supplier, SupplierCategory, SupplierStatus } from '../components/SupplierCard';
import SupplierModal from '../components/SupplierModal';

/* ─── Mock seed data ─── */
const SEED_SUPPLIERS: Supplier[] = [
  {
    id: '1',
    name: 'Fresh Farms BD Ltd.',
    category: 'Food & Beverage',
    contactName: 'Rafiqul Islam',
    phone: '+880 17-1234-5678',
    email: 'rafiq@freshfarmsbd.com',
    address: 'Plot 14, Tejgaon Industrial Area, Dhaka-1208',
    paymentTerms: 'Net 30',
    status: 'Active',
    lastOrderDate: '2026-04-08',
    monthlySpend: 285000,
    notes: 'Primary vegetables & dairy supplier. Delivers Mon/Wed/Fri 6am.',
  },
  {
    id: '2',
    name: 'Dhaka Linen House',
    category: 'Linen',
    contactName: 'Sumaiya Hossain',
    phone: '+880 19-8765-4321',
    email: 'orders@dhakalinens.com',
    address: 'House 22, Road 4, Banani, Dhaka-1213',
    paymentTerms: 'Net 15',
    status: 'Active',
    lastOrderDate: '2026-04-01',
    monthlySpend: 148000,
    notes: 'Bed sheets, towels, table covers. Laundry pickup on Saturdays.',
  },
  {
    id: '3',
    name: 'Metro Maintenance Co.',
    category: 'Maintenance',
    contactName: 'Karim Ahmed',
    phone: '+880 18-5555-9999',
    email: 'karim@metromaint.bd',
    address: 'Shop 7, Mirpur-1, Dhaka-1216',
    paymentTerms: 'COD',
    status: 'On Hold',
    lastOrderDate: '2026-02-20',
    monthlySpend: 52000,
    notes: 'HVAC & plumbing. Currently on hold pending contract renegotiation.',
  },
  {
    id: '4',
    name: 'TechServ Solutions',
    category: 'Technology',
    contactName: 'Nusrat Jahan',
    phone: '+880 16-3322-1100',
    email: 'nusrat@techserv.io',
    address: 'Level 6, Bashundhara City, Dhaka-1229',
    paymentTerms: 'Net 60',
    status: 'Active',
    lastOrderDate: '2026-03-15',
    monthlySpend: 95000,
    notes: 'POS systems, CCTV, network infra. 24/7 support SLA.',
  },
  {
    id: '5',
    name: 'Royal Bakery & Confectionery',
    category: 'Food & Beverage',
    contactName: 'Shahidul Alam',
    phone: '+880 17-9988-7766',
    email: 'royal.bakery@gmail.com',
    address: '12/A Gulshan Avenue, Dhaka-1212',
    paymentTerms: 'Net 15',
    status: 'Active',
    lastOrderDate: '2026-04-10',
    monthlySpend: 73000,
    notes: 'Bread, pastries & desserts for restaurant & buffet. Morning delivery.',
  },
  {
    id: '6',
    name: 'GreenTech Cleaning Services',
    category: 'Maintenance',
    contactName: 'Farhan Chowdhury',
    phone: '+880 13-4444-6677',
    email: 'farhan@greentech-clean.com',
    address: 'Uttara Sector 7, Dhaka-1230',
    paymentTerms: 'Net 30',
    status: 'Inactive',
    lastOrderDate: '2025-12-05',
    monthlySpend: 0,
    notes: 'Eco-friendly cleaning chemicals. Contract expired Dec 2025.',
  },
];

const CATEGORIES: SupplierCategory[] = [
  'Food & Beverage',
  'Linen',
  'Maintenance',
  'Technology',
  'Other',
];
const STATUSES: SupplierStatus[] = ['Active', 'Inactive', 'On Hold'];

/* ─── Stat Card ─── */
function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${accent}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(SEED_SUPPLIERS);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SupplierCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<SupplierStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [detailTarget, setDetailTarget] = useState<Supplier | null>(null);

  /* ── Derived stats ── */
  const totalSuppliers = suppliers.length;
  const activeCount = suppliers.filter(s => s.status === 'Active').length;
  const onHoldCount = suppliers.filter(s => s.status === 'On Hold').length;
  const totalSpend = suppliers.reduce((sum, s) => sum + (s.monthlySpend ?? 0), 0);
  const fmtSpend = '৳' + totalSpend.toLocaleString('en-BD');

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter(s => {
      const matchName = !q || s.name.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q);
      const matchCat = !categoryFilter || s.category === categoryFilter;
      const matchStatus = !statusFilter || s.status === statusFilter;
      return matchName && matchCat && matchStatus;
    });
  }, [suppliers, search, categoryFilter, statusFilter]);

  /* ── Handlers ── */
  function openAdd() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditTarget(s);
    setModalOpen(true);
  }

  function handleContact(s: Supplier) {
    window.location.href = `mailto:${s.email}`;
  }

  function handleViewDetails(s: Supplier) {
    setDetailTarget(s);
  }

  function handleSave(data: Omit<Supplier, 'id'>) {
    if (editTarget) {
      setSuppliers(prev =>
        prev.map(s => (s.id === editTarget.id ? { ...data, id: editTarget.id } : s)),
      );
    } else {
      const newSupplier: Supplier = {
        ...data,
        id: crypto.randomUUID(),
      };
      setSuppliers(prev => [newSupplier, ...prev]);
    }
    setModalOpen(false);
  }

  const inputCls =
    'bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 ' +
    'focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all';

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-cyan-500/30 relative overflow-x-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500 rounded-full mix-blend-multiply filter blur-[120px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600 rounded-full mix-blend-multiply filter blur-[120px] opacity-10 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">

        {/* ── Page Header ── */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/"
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1.5"
              >
                ← CRM Home
              </Link>
              <span className="text-neutral-700 text-xs">/</span>
              <span className="text-xs text-neutral-400">Suppliers</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
              Supplier Management
            </h1>
            <p className="text-neutral-400 mt-1.5 text-sm">
              Manage all Hotel Fountain vendors, contracts, and spending.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-cyan-500/20"
          >
            <span className="text-lg leading-none">+</span>
            Add Supplier
          </button>
        </header>

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Suppliers" value={totalSuppliers} icon="🏭" accent="bg-white/5" />
          <StatCard label="Active" value={activeCount} icon="✅" accent="bg-emerald-500/10 text-emerald-400" />
          <StatCard label="Monthly Spend" value={fmtSpend} icon="💰" accent="bg-cyan-500/10 text-cyan-400" />
          <StatCard label="On Hold" value={onHoldCount} icon="⏸️" accent="bg-yellow-500/10 text-yellow-400" />
        </div>

        {/* ── Filter Row ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by supplier or contact name…"
              className={inputCls + ' w-full pl-9'}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as SupplierCategory | '')}
            className={inputCls + ' sm:w-52'}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as SupplierStatus | '')}
            className={inputCls + ' sm:w-40'}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* ── Results count ── */}
        <p className="text-xs text-neutral-500 mb-4">
          Showing <span className="text-neutral-300 font-semibold">{filtered.length}</span> of{' '}
          {totalSuppliers} suppliers
        </p>

        {/* ── Supplier Grid ── */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(s => (
              <SupplierCard
                key={s.id}
                supplier={s}
                onEdit={openEdit}
                onContact={handleContact}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">🔎</div>
            <p className="text-neutral-400 text-lg font-semibold">No suppliers found</p>
            <p className="text-neutral-600 text-sm mt-1">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      <SupplierModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        supplier={editTarget}
      />

      {/* ── View Details Drawer ── */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setDetailTarget(null)}
        >
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full sm:w-96 max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{detailTarget.name}</h3>
                <p className="text-neutral-500 text-xs mt-0.5">{detailTarget.category}</p>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xl"
              >
                ×
              </button>
            </div>

            {[
              ['Contact', detailTarget.contactName],
              ['Phone', detailTarget.phone],
              ['Email', detailTarget.email],
              ['Address', detailTarget.address || '—'],
              ['Payment Terms', detailTarget.paymentTerms || '—'],
              ['Status', detailTarget.status],
              ['Last Order', detailTarget.lastOrderDate || '—'],
              [
                'Monthly Spend',
                '৳' + (detailTarget.monthlySpend ?? 0).toLocaleString('en-BD'),
              ],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between gap-4 text-sm border-b border-white/5 pb-3 last:border-0 last:pb-0">
                <span className="text-neutral-500 shrink-0">{label}</span>
                <span className="text-neutral-200 text-right break-words">{val}</span>
              </div>
            ))}

            {detailTarget.notes && (
              <div className="bg-white/5 border border-white/8 rounded-xl p-3 text-sm text-neutral-400 italic">
                {detailTarget.notes}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setDetailTarget(null); openEdit(detailTarget); }}
                className="flex-1 py-2.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 font-semibold rounded-xl text-sm transition-all"
              >
                Edit
              </button>
              <button
                onClick={() => setDetailTarget(null)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 font-semibold rounded-xl text-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
