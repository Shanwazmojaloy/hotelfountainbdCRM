// =============================================================================
// LUMEA BILLING — TypeScript Types
// Derived from the live Supabase schema (Phase 2 migration).
// ALL monetary values are INTEGER BDT (whole Taka). Never use float for money.
// =============================================================================

// ---------------------------------------------------------------------------
// Enums (mirror the PostgreSQL enum types exactly)
// ---------------------------------------------------------------------------

export type LedgerEntryType =
  | 'ROOM_CHARGE'
  | 'FOOD_BEVERAGE'
  | 'MINIBAR'
  | 'LAUNDRY'
  | 'TRANSPORT'
  | 'SPA'
  | 'DAMAGE'
  | 'MISCELLANEOUS'
  | 'TAX'
  | 'SERVICE_CHARGE'
  | 'DISCOUNT'
  | 'COMPLIMENTARY'
  | 'ADVANCE_PAYMENT'
  | 'PAYMENT'
  | 'REFUND'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export type PaymentMethodType =
  | 'CASH'
  | 'CARD'
  | 'MOBILE_BANKING'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'CITY_LEDGER'
  | 'VOUCHER'
  | 'LOYALTY_POINTS';

export type PaymentStatusType =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type InvoiceStatusType =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'VOIDED';

export type InvoiceTypeEnum =
  | 'FOLIO'
  | 'PROFORMA'
  | 'RECEIPT'
  | 'CREDIT_NOTE';

// ---------------------------------------------------------------------------
// Existing tables (read-only references — never mutate from billing hooks)
// ---------------------------------------------------------------------------

export interface Reservation {
  id: string;
  room_ids: string[];           // room_number strings e.g. ["303"]
  guest_ids: string[];          // guests.id UUIDs
  check_in: string;             // ISO timestamp
  check_out: string;            // ISO timestamp
  status: 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
  total_amount: number;         // INTEGER BDT
  paid_amount: number;          // INTEGER BDT
  tenant_id: string;
  stay_type: string;
  laundry: number;
  mini_bar: number;
  discount: number;
  extra_charges: number;
  payment_method: string | null;
  room_details: Record<string, { base_rate: number; net_amount: number; discount_applied: number }> | null;
  created_at: string;
}

export interface Guest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  id_card: string | null;
  outstanding_balance: number;  // INTEGER BDT
  tenant_id: string;
  vip: boolean;
  loyalty_points: number;
  total_spent: number;          // INTEGER BDT
  total_stays: number;
}

export interface Room {
  id: string;
  room_number: string;
  category: string;             // e.g. "Fountain Deluxe"
  price: number;                // INTEGER BDT — TAX INCLUSIVE (VAT 15% + SC 5%)
  status: string;
  tenant_id: string;
  floor: number | null;
  beds: string | null;
  view: string | null;
}

// ---------------------------------------------------------------------------
// New billing tables
// ---------------------------------------------------------------------------

export interface GuestLedgerEntry {
  id: string;
  tenant_id: string;
  reservation_id: string;
  guest_id: string;
  entry_type: LedgerEntryType;
  description: string;
  transaction_date: string;     // YYYY-MM-DD
  posted_at: string;            // ISO timestamp
  amount_bdt: number;           // INTEGER BDT. Positive = charge. Negative = credit.
  is_tax_entry: boolean;
  parent_ledger_id: string | null;
  is_voided: boolean;
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  correction_of_id: string | null;
  payment_transaction_id: string | null;
  posted_by: string | null;
  department: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// A ledger entry with its tax children grouped in
export interface LedgerEntryWithTax extends GuestLedgerEntry {
  tax_children: GuestLedgerEntry[];
  /** Inclusive total = amount_bdt + sum of tax_children */
  inclusive_amount_bdt: number;
}

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  reservation_id: string;
  guest_id: string;
  payment_method: PaymentMethodType;
  payment_method_details: Record<string, unknown>;
  amount_bdt: number;           // INTEGER BDT. Always positive.
  status: PaymentStatusType;
  payment_reference: string | null;
  gateway_transaction_id: string | null;
  gateway_response: Record<string, unknown>;
  initiated_at: string;
  completed_at: string | null;
  is_advance_payment: boolean;
  invoice_id: string | null;
  refunded_bdt: number;
  refunded_at: string | null;
  refund_reference: string | null;
  processed_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  reservation_id: string;
  guest_id: string;
  invoice_type: InvoiceTypeEnum;
  invoice_date: string;
  due_date: string | null;
  // All INTEGER BDT — maintained by DB trigger. Never write these from the client.
  net_total_bdt: number;
  sc_total_bdt: number;
  vat_total_bdt: number;
  discount_total_bdt: number;
  gross_total_bdt: number;
  paid_total_bdt: number;
  balance_due_bdt: number;      // GENERATED column — never send in INSERT/UPDATE
  status: InvoiceStatusType;
  billing_name: string;
  billing_address: Record<string, unknown>;
  billing_phone: string | null;
  is_split_bill: boolean;
  parent_invoice_id: string | null;
  issued_by: string | null;
  issued_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  ledger_entry_id: string | null;
  description: string;
  entry_type: LedgerEntryType;
  transaction_date: string;
  quantity: number;
  unit_amount_bdt: number;
  total_amount_bdt: number;
  sc_amount_bdt: number;
  vat_amount_bdt: number;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Hook payload types (what callers pass into mutations)
// ---------------------------------------------------------------------------

export interface PostChargePayload {
  reservation_id: string;
  guest_id: string;
  entry_type: LedgerEntryType;
  description: string;
  transaction_date: string;     // YYYY-MM-DD
  /** Inclusive BDT amount — taxes extracted by DB function automatically */
  amount_bdt: number;
  department?: string;
  metadata?: Record<string, unknown>;
}

export interface PostPaymentPayload {
  reservation_id: string;
  guest_id: string;
  payment_method: PaymentMethodType;
  /** Always positive BDT integer */
  amount_bdt: number;
  payment_reference?: string;
  is_advance_payment?: boolean;
  invoice_id?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface VoidEntryPayload {
  ledger_entry_id: string;
  reservation_id: string;       // needed for cache invalidation
  void_reason: string;
}

// ---------------------------------------------------------------------------
// Tax extraction result (mirrors extract_inclusive_tax PG function output)
// ---------------------------------------------------------------------------
export interface TaxBreakdown {
  net_bdt: number;
  sc_bdt: number;
  vat_bdt: number;
  /** net + sc + vat — should always equal the original inclusive price */
  total_bdt: number;
}
