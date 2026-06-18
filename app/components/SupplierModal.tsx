'use client';

import React, { useState, useEffect } from 'react';
import { Supplier, SupplierCategory, SupplierStatus } from './SupplierCard';

type PaymentTerms = 'Net 15' | 'Net 30' | 'Net 60' | 'COD';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Supplier, 'id'>) => void;
  supplier?: Supplier | null;
}

const EMPTY: Omit<Supplier, 'id'> = {
  name: '',
  category: 'Food & Beverage',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTerms: 'Net 30',
  status: 'Active',
  lastOrderDate: '',
  monthlySpend: 0,
  notes: '',
};

export default function SupplierModal({ isOpen, onClose, onSave, supplier }: SupplierModalProps) {
  const [form, setForm] = useState<Omit<Supplier, 'id'>>(EMPTY);

  useEffect(() => {
    if (isOpen) {
      setForm(
        supplier
          ? {
              name: supplier.name,
              category: supplier.category,
              contactName: supplier.contactName,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address ?? '',
              paymentTerms: supplier.paymentTerms ?? 'Net 30',
              status: supplier.status,
              lastOrderDate: supplier.lastOrderDate ?? '',
              monthlySpend: supplier.monthlySpend ?? 0,
              notes: supplier.notes ?? '',
            }
          : EMPTY,
      );
    }
  }, [isOpen, supplier]);

  if (!isOpen) return null;

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div
      className="crm-root fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(43,39,34,.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="iv-card w-full max-w-lg max-h-[92vh] overflow-y-auto" style={{ padding: 0, borderRadius: 2 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 iv-divider">
          <div>
            <h2 className="text-lg" style={{ fontWeight: 700 }}>
              {supplier ? 'Edit Supplier' : 'New Supplier'}
            </h2>
            <p className="iv-stat__sub" style={{ marginTop: 2 }}>
              {supplier ? 'Update vendor information' : 'Add a new vendor to your supply chain'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-xl"
            style={{ color: '#8A847A' }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            onSave(form);
          }}
          className="p-6 space-y-4"
        >
          {/* Supplier Name */}
          <div>
            <label className="iv-label">
              Supplier Name <span style={{ color: '#8C2F1D', textTransform: 'none', fontWeight: 400 }}>*</span>
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Fresh Farms BD Ltd."
              className="iv-input"
            />
          </div>

          {/* Category */}
          <div>
            <label className="iv-label">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value as SupplierCategory)} className="iv-input">
              <option value="Food & Beverage">🍽️ Food &amp; Beverage</option>
              <option value="Linen">🛏️ Linen</option>
              <option value="Maintenance">🔧 Maintenance</option>
              <option value="Technology">💻 Technology</option>
              <option value="Other">📦 Other</option>
            </select>
          </div>

          {/* Contact Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="iv-label">Contact Name</label>
              <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Full name" className="iv-input" />
            </div>
            <div>
              <label className="iv-label">Phone</label>
              <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+880 1X-XXXX-XXXX" className="iv-input" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="iv-label">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="vendor@example.com" className="iv-input" />
          </div>

          {/* Address */}
          <div>
            <label className="iv-label">Address</label>
            <textarea rows={2} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address, Dhaka..." className="iv-input" />
          </div>

          {/* Payment Terms + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="iv-label">Payment Terms</label>
              <select value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value as PaymentTerms)} className="iv-input">
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
                <option value="COD">COD</option>
              </select>
            </div>
            <div>
              <label className="iv-label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value as SupplierStatus)} className="iv-input">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="iv-label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes about this supplier..." className="iv-input" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 iv-divider" style={{ borderBottom: 'none', borderTop: '1px solid #EAE6DD', paddingTop: 16 }}>
            <button type="submit" className="iv-btn flex-1">
              {supplier ? 'Save Changes' : 'Add Supplier'}
            </button>
            <button type="button" onClick={onClose} className="iv-btn iv-btn--ghost flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
