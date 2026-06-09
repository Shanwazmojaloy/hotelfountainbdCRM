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

const STATUS_IV: Record<SupplierStatus, { fg: string; bg: string; bd: string }> = {
  Active: { fg: '#3F6A4B', bg: '#ECF4ED', bd: 'rgba(63,106,75,.22)' },
  Inactive: { fg: '#8C2F1D', bg: '#FBEDE9', bd: 'rgba(140,47,29,.22)' },
  'On Hold': { fg: '#8A6A1E', bg: '#FBF4E2', bd: 'rgba(138,106,30,.24)' },
};

function formatCurrency(amount: number): string {
  return '৳' + amount.toLocaleString('en-US');
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
  const st = STATUS_IV[supplier.status];
  const icon = CATEGORY_ICONS[supplier.category];

  return (
    <div className="iv-card iv-card--hover flex flex-col gap-4">
      {/* Top row: category badge + status */}
      <div className="flex items-start justify-between gap-3">
        <span className="iv-chip">
          <span>{icon}</span>
          {supplier.category}
        </span>
        <span
          className="iv-badge"
          style={{ color: st.fg, background: st.bg, borderColor: st.bd }}
        >
          <span className="iv-dot" style={{ background: st.fg, width: 6, height: 6 }} />
          {supplier.status}
        </span>
      </div>

      {/* Supplier name */}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: '#2B2722' }}>
          {supplier.name}
        </h3>
        {supplier.paymentTerms && (
          <p className="iv-stat__sub" style={{ marginTop: 2 }}>{supplier.paymentTerms}</p>
        )}
      </div>

      {/* Contact info */}
      <div className="flex flex-col gap-1.5 text-sm" style={{ color: '#5C5347' }}>
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: '#9A907C' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="truncate" style={{ color: '#2B2722' }}>{supplier.contactName}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: '#9A907C' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="iv-mono">{supplier.phone}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: '#9A907C' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="truncate iv-mono">{supplier.email}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #EAE6DD' }} />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div style={{ background: '#F5F0E8', borderRadius: 2, padding: 12 }}>
          <p className="iv-eyebrow" style={{ marginBottom: 4 }}>Last Order</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#2B2722' }}>{formatDate(supplier.lastOrderDate)}</p>
        </div>
        <div style={{ background: '#F5F0E8', borderRadius: 2, padding: 12 }}>
          <p className="iv-eyebrow" style={{ marginBottom: 4 }}>Monthly Spend</p>
          <p className="iv-mono" style={{ fontSize: 13, fontWeight: 700, color: '#8B6914' }}>{formatCurrency(supplier.monthlySpend ?? 0)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onViewDetails(supplier)} className="iv-btn flex-1" style={{ padding: '9px 10px', fontSize: 10 }}>
          View Details
        </button>
        <button onClick={() => onContact(supplier)} className="iv-btn iv-btn--ghost flex-1" style={{ padding: '9px 10px', fontSize: 10 }}>
          Contact
        </button>
        <button onClick={() => onEdit(supplier)} className="iv-btn iv-btn--ghost" style={{ padding: '9px 12px', fontSize: 10 }}>
          Edit
        </button>
      </div>
    </div>
  );
}
