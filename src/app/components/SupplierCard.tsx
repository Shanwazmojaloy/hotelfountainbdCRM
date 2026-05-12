'use client';

import React from 'react';

export type SupplierCategory =
  | 'Food & Beverage'
  | 'Linen'
  | 'Maintenance'
  | 'Technology'
  | 'Other';

export type SupplierStatus = 'Active' | 'Inactive' | 'On Hold';

export interface Supplier {
  id: string;
  name: string;
  category: SupplierCategory;
  contactName: string;
  phone: string;
  email: string;
  address?: string;
  paymentTerms?: 'Net 15' | 'Net 30' | 'Net 60' | 'COD';
  status: SupplierStatus;
  lastOrderDate?: string;
  monthlySpend?: number;
  notes?: string;
}

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
  onContact: (supplier: Supplier) => void;
  onViewDetails: (supplier: Supplier) => void;
}

const CATEGORY_ICONS: Record<SupplierCategory, string> = {
  'Food & Beverage': '🍽️',
  'Linen': '🛏️',
  'Maintenance': '🔧',
  'Technology': '💻',
  'Other': '📦',
};

const CATEGORY_COLORS: Record<SupplierCategory, string> = {
  'Food & Beverage': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'Linen': 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  'Maintenance': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Technology': 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Other': 'text-neutral-400 bg-neutral-400/10 border-neutral-400/20',
};

const STATUS_STYLES: Record<SupplierStatus, string> = {
  Active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Inactive: 'bg-red-500/15 text-red-400 border border-red-500/30',
  'On Hold': 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
};

const STATUS_DOT: Record<SupplierStatus, string> = {
  Active: 'bg-emerald-400',
  Inactive: 'bg-red-400',
  'On Hold': 'bg-yellow-400',
};

function formatCurrency(amount: number): string {
  return '৳' + amount.toLocaleString('en-BD');
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SupplierCard({
  supplier,
  onEdit,
  onContact,
  onViewDetails,
}: SupplierCardProps) {
  const catColor = CATEGORY_COLORS[supplier.category];
  const statusStyle = STATUS_STYLES[supplier.status];
  const statusDot = STATUS_DOT[supplier.status];
  const icon = CATEGORY_ICONS[supplier.category];

  return (
    <div className="group relative bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:shadow-black/40 flex flex-col gap-4">
      {/* Top row: category badge + status */}
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${catColor}`}>
          <span>{icon}</span>
          {supplier.category}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          {supplier.status}
        </span>
      </div>

      {/* Supplier name */}
      <div>
        <h3 className="text-white font-bold text-lg leading-snug tracking-tight group-hover:text-cyan-300 transition-colors">
          {supplier.name}
        </h3>
        {supplier.paymentTerms && (
          <p className="text-neutral-500 text-xs mt-0.5">{supplier.paymentTerms}</p>
        )}
      </div>

      {/* Contact info */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-neutral-300">
          <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="truncate">{supplier.contactName}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span>{supplier.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="truncate">{supplier.email}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/8" />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Last Order</p>
          <p className="text-white text-sm font-semibold">{formatDate(supplier.lastOrderDate)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Monthly Spend</p>
          <p className="text-cyan-400 text-sm font-bold">{formatCurrency(supplier.monthlySpend ?? 0)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onViewDetails(supplier)}
          className="flex-1 py-2 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 text-cyan-400 text-xs font-semibold rounded-xl transition-all duration-200"
        >
          View Details
        </button>
        <button
          onClick={() => onContact(supplier)}
          className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-all duration-200"
        >
          Contact
        </button>
        <button
          onClick={() => onEdit(supplier)}
          className="py-2 px-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 text-purple-400 text-xs font-semibold rounded-xl transition-all duration-200"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
