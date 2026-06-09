'use client';

// Standalone Next.js route at /suppliers — Warm Ivory, wrapped in the CRM Layout.

import React, { useState, useMemo } from 'react';
import Layout from '@/components/Layout';
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

const CATEGORIES: SupplierCategory[] = ['Food & Beverage', 'Linen', 'Maintenance', 'Technology', 'Other'];
const STATUSES: SupplierStatus[] = ['Active', 'Inactive', 'On Hold'];

/* ─── Stat Card ─── */
function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="iv-card flex items-center gap-4" style={{ padding: '1.25rem' }}>
      <div style={{ width: 44, height: 44, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: '#F5F0E8' }}>
        {icon}
      </div>
      <div>
        <p className="iv-eyebrow">{label}</p>
        <p className="iv-stat__val" style={{ fontSize: 22, marginTop: 2 }}>{value}</p>
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
  const fmtSpend = '৳' + totalSpend.toLocaleString('en-US');

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
      setSuppliers(prev => prev.map(s => (s.id === editTarget.id ? { ...data, id: editTarget.id } : s)));
    } else {
      setSuppliers(prev => [{ ...data, id: crypto.randomUUID() }, ...prev]);
    }
    setModalOpen(false);
  }

  return (
    <Layout>
      {/* ── Page Header ── */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl mb-1">Supplier Management</h1>
          <p className="iv-stat__sub">Manage all Hotel Fountain vendors, contracts, and spending.</p>
        </div>
        <button onClick={openAdd} className="iv-btn shrink-0 flex items-center gap-2">
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Add Supplier
        </button>
      </header>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Suppliers" value={totalSuppliers} icon="🏭" />
        <StatCard label="Active" value={activeCount} icon="✅" />
        <StatCard label="Monthly Spend" value={fmtSpend} icon="💰" />
        <StatCard label="On Hold" value={onHoldCount} icon="⏸️" />
      </div>

      {/* ── Filter Row ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Search by supplier or contact name…"
            className="iv-input w-full"
          />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as SupplierCategory | '')} className="iv-input sm:w-52">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SupplierStatus | '')} className="iv-input sm:w-40">
          <option value="">All Statuses</option>
          {STATUSES.map(s => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>

      {/* ── Results count ── */}
      <p className="iv-stat__sub mb-4">
        Showing <span style={{ color: '#2B2722', fontWeight: 600 }}>{filtered.length}</span> of {totalSuppliers} suppliers
      </p>

      {/* ── Supplier Grid ── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(s => (
            <SupplierCard key={s.id} supplier={s} onEdit={openEdit} onContact={handleContact} onViewDetails={handleViewDetails} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔎</div>
          <p style={{ fontSize: 18, fontWeight: 600, color: '#2B2722' }}>No suppliers found</p>
          <p className="iv-stat__sub" style={{ marginTop: 4 }}>Try adjusting your search or filters.</p>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <SupplierModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} supplier={editTarget} />

      {/* ── View Details Drawer ── */}
      {detailTarget && (
        <div
          className="crm-root fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4"
          style={{ background: 'rgba(43,39,34,.45)' }}
          onClick={e => e.target === e.currentTarget && setDetailTarget(null)}
        >
          <div className="iv-card w-full sm:w-96 max-h-[85vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg" style={{ fontWeight: 700 }}>{detailTarget.name}</h3>
                <p className="iv-stat__sub" style={{ marginTop: 2 }}>{detailTarget.category}</p>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                className="w-8 h-8 flex items-center justify-center text-xl"
                style={{ color: '#8A847A' }}
              >
                ×
              </button>
            </div>

            {([
              ['Contact', detailTarget.contactName],
              ['Phone', detailTarget.phone],
              ['Email', detailTarget.email],
              ['Address', detailTarget.address || '—'],
              ['Payment Terms', detailTarget.paymentTerms || '—'],
              ['Status', detailTarget.status],
              ['Last Order', detailTarget.lastOrderDate || '—'],
              ['Monthly Spend', '৳' + (detailTarget.monthlySpend ?? 0).toLocaleString('en-US')],
            ] as [string, string][]).map(([label, val]) => (
              <div key={label} className="flex justify-between gap-4 text-sm" style={{ borderBottom: '1px solid #EAE6DD', paddingBottom: 12 }}>
                <span style={{ color: '#8A847A', flexShrink: 0 }}>{label}</span>
                <span className="iv-mono" style={{ color: '#2B2722', textAlign: 'right', wordBreak: 'break-word' }}>{val}</span>
              </div>
            ))}

            {detailTarget.notes && (
              <div style={{ background: '#F5F0E8', border: '1px solid #EAE6DD', borderRadius: 2, padding: 12, fontSize: 13, color: '#5C5347', fontStyle: 'italic' }}>
                {detailTarget.notes}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setDetailTarget(null); openEdit(detailTarget); }} className="iv-btn flex-1">Edit</button>
              <button onClick={() => setDetailTarget(null)} className="iv-btn iv-btn--ghost flex-1">Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
