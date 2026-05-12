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

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 ' +
    'focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all';
  const labelCls =
    'block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {supplier ? 'Edit Supplier' : 'New Supplier'}
            </h2>
            <p className="text-neutral-500 text-xs mt-0.5">
              {supplier
                ? 'Update vendor information'
                : 'Add a new vendor to your supply chain'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xl leading-none"
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
            <label className={labelCls}>
              Supplier Name <span className="text-rose-400 normal-case font-normal">*</span>
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Fresh Farms BD Ltd."
              className={inputCls}
            />
          </div>

          {/* Category */}
          <div>
            <label className={labelCls}>Category</label>
            <select
              value={form.category}
              onChange={e => set('category', e.target.value as SupplierCategory)}
              className={inputCls}
            >
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
              <label className={labelCls}>Contact Name</label>
              <input
                type="text"
                value={form.contactName}
                onChange={e => set('contactName', e.target.value)}
                placeholder="Full name"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+880 1X-XXXX-XXXX"
                className={inputCls}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="vendor@example.com"
              className={inputCls}
            />
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>Address</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="Full address, Dhaka..."
              className={inputCls}
            />
          </div>

          {/* Payment Terms + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Payment Terms</label>
              <select
                value={form.paymentTerms}
                onChange={e => set('paymentTerms', e.target.value as PaymentTerms)}
                className={inputCls}
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
                <option value="COD">COD</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as SupplierStatus)}
                className={inputCls}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Additional notes about this supplier..."
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-white/8">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold rounded-xl text-sm transition-all"
            >
              {supplier ? 'Save Changes' : 'Add Supplier'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
