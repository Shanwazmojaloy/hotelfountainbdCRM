/**
 * Hotel Fountain CRM — Lumea
 * Critical Logic Unit Tests
 *
 * Runner: Vitest (recommended) or Jest with ts-jest
 * Install:  npm i -D vitest
 * Run:      npx vitest run crm.logic.test.ts
 *
 * All functions are extracted verbatim from public/crm.html so the tests
 * exercise the exact production logic, not a re-implementation.
 */

import { describe, it, expect } from 'vitest'

/* ═══════════════════════════════════════════════════════════════════════
   SOURCE FUNCTIONS — copied exactly from public/crm.html
   (no runtime dependency on React / Supabase / DOM)
═══════════════════════════════════════════════════════════════════════ */

// ── 1. Balance calculation ────────────────────────────────────────────
// crm.html line 2470  (BillingPage scope)
// crm.html line 3022  (RecordPayModal scope — identical formula)
const _resDue = (r: {
  total_amount?: number | string | null
  discount_amount?: number | string | null
  discount?: number | string | null
  paid_amount?: number | string | null
}): number =>
  Math.max(
    0,
    (+r.total_amount || 0) -
      (+r.discount_amount || +r.discount || 0) -
      (+r.paid_amount || 0)
  )

// ── 2. Date math — nights count ──────────────────────────────────────
// crm.html line 49
const nightsCount = (ci: string | null | undefined, co: string | null | undefined): number => {
  if (!ci || !co) return 0
  return Math.max(0, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000))
}

// ── 3. Dhaka timezone helper ──────────────────────────────────────────
// crm.html lines 42-46
const _dhakaParts = (d: Date = new Date()) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (k: string) => p.find(x => x.type === k)?.value ?? '00'
  return { y: g('year'), m: g('month'), d: g('day'), H: g('hour'), M: g('minute'), S: g('second') }
}
const todayStr = (now?: Date): string => {
  const p = _dhakaParts(now)
  return `${p.y}-${p.m}-${p.d}`
}

// ── 4. Status filter — reservations list ─────────────────────────────
// crm.html lines 1156-1159  (ReservationsPage)
type Reservation = {
  id: string
  status: string
  total_amount?: number
  discount_amount?: number
  discount?: number
  paid_amount?: number
  guest_ids?: string[]
  room_ids?: string[]
}

const resBalance = (r: Reservation): number =>
  Math.max(
    0,
    (+r.total_amount || 0) -
      (+r.discount_amount || +r.discount || 0) -
      (+r.paid_amount || 0)
  )

function applyStatusFilter(reservations: Reservation[], filter: string): Reservation[] {
  if (filter === 'ALL') return reservations
  if (filter === 'DUE')
    return reservations.filter(
      r => (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') && resBalance(r) > 0
    )
  return reservations.filter(r => r.status === filter)
}

// ── 5. Day-close guard ───────────────────────────────────────────────
// crm.html lines 2507-2520
// Extracted as pure function (no toast/confirm side-effects)
function dayCloseAllowed(businessDateStr: string, wallTodayStr: string): boolean {
  const d = new Date(businessDateStr)
  d.setDate(d.getDate() + 1)
  const nextDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return nextDay <= wallTodayStr
}

// ── 6. Folio fetch predicate ─────────────────────────────────────────
// crm.html lines 870-872  (RoomModal)
// Admin/receivable folio rows are excluded from the guest-facing bill.
const ADMIN_RE = /receivable|payment|settlement|advance|refund/i
const isChargeFolio = (f: { category?: string; description?: string }): boolean =>
  !ADMIN_RE.test(`${f.category ?? ''} ${f.description ?? ''}`)


/* ═══════════════════════════════════════════════════════════════════════
   TESTS
═══════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────
// 1. _resDue — Balance Calculation
// ─────────────────────────────────────────────────────────────────────
describe('_resDue — balance calculation', () => {

  it('returns correct due for partial payment', () => {
    // total=5000, discount=0, paid=2000  → due=3000
    const r = { total_amount: 5000, paid_amount: 2000 }
    expect(_resDue(r)).toBe(3000)
  })

  it('returns 0 for full payment (no overshoot)', () => {
    // total=5000, paid=5000
    const r = { total_amount: 5000, paid_amount: 5000 }
    expect(_resDue(r)).toBe(0)
  })

  it('returns 0 for overpayment — never goes negative', () => {
    // Overpaid by ৳500 — Math.max(0,…) must clamp
    const r = { total_amount: 5000, paid_amount: 5500 }
    expect(_resDue(r)).toBe(0)
  })

  it('applies discount_amount correctly', () => {
    // total=10000, discount_amount=1000, paid=4000 → due=5000
    const r = { total_amount: 10000, discount_amount: 1000, paid_amount: 4000 }
    expect(_resDue(r)).toBe(5000)
  })

  it('falls back to discount field when discount_amount is absent', () => {
    // Legacy rows use `discount` not `discount_amount`
    const r = { total_amount: 8000, discount: 500, paid_amount: 3000 }
    expect(_resDue(r)).toBe(4500)
  })

  it('prefers discount_amount over discount when both are present', () => {
    // discount_amount=1000, discount=500 → uses 1000
    const r = { total_amount: 8000, discount_amount: 1000, discount: 500, paid_amount: 2000 }
    expect(_resDue(r)).toBe(5000)
  })

  it('handles zero total (e.g. complimentary stay) → 0 due', () => {
    const r = { total_amount: 0, paid_amount: 0 }
    expect(_resDue(r)).toBe(0)
  })

  it('handles undefined/null fields gracefully', () => {
    // All fields missing
    expect(_resDue({})).toBe(0)
    // Only paid present
    expect(_resDue({ paid_amount: 500 })).toBe(0)
  })

  it('handles string-typed amounts (Supabase JSON often returns strings)', () => {
    // Supabase can return numeric-looking strings
    const r = { total_amount: '6000' as any, discount_amount: '600' as any, paid_amount: '1000' as any }
    expect(_resDue(r)).toBe(4400)
  })

  it('applies both discount and partial payment correctly — the ৳13,600 rule scenario', () => {
    // Real scenario: total=13600, discount=0, paid=0 → full amount outstanding
    const r = { total_amount: 13600, discount_amount: 0, paid_amount: 0 }
    expect(_resDue(r)).toBe(13600)
  })

  it('zero due after discount + payment fully cover total', () => {
    // total=5000, discount=1000, paid=4000 → 5000-1000-4000=0
    const r = { total_amount: 5000, discount_amount: 1000, paid_amount: 4000 }
    expect(_resDue(r)).toBe(0)
  })
})


// ─────────────────────────────────────────────────────────────────────
// 2. nightsCount — Date Math
// ─────────────────────────────────────────────────────────────────────
describe('nightsCount — date math', () => {

  it('returns correct nights for standard 2-night stay', () => {
    expect(nightsCount('2026-05-01', '2026-05-03')).toBe(2)
  })

  it('returns 1 for same-day check-in and next-day check-out', () => {
    expect(nightsCount('2026-05-01', '2026-05-02')).toBe(1)
  })

  it('returns 0 for same check-in and check-out date (same-day invalid)', () => {
    expect(nightsCount('2026-05-01', '2026-05-01')).toBe(0)
  })

  it('returns 0 (clamped) when check-out is before check-in', () => {
    // Data integrity guard — Math.max(0,…)
    expect(nightsCount('2026-05-05', '2026-05-01')).toBe(0)
  })

  it('returns 0 when check-in is null', () => {
    expect(nightsCount(null, '2026-05-03')).toBe(0)
  })

  it('returns 0 when check-out is null', () => {
    expect(nightsCount('2026-05-01', null)).toBe(0)
  })

  it('returns 0 when both are null', () => {
    expect(nightsCount(null, null)).toBe(0)
  })

  it('handles month-boundary correctly (April → May)', () => {
    expect(nightsCount('2026-04-28', '2026-05-02')).toBe(4)
  })

  it('handles year-boundary correctly (Dec → Jan)', () => {
    expect(nightsCount('2025-12-30', '2026-01-03')).toBe(4)
  })

  it('handles DST-neutral calculation (Dhaka = UTC+6, no DST)', () => {
    // 7-night stay crossing no DST boundary
    expect(nightsCount('2026-03-01', '2026-03-08')).toBe(7)
  })
})


// ─────────────────────────────────────────────────────────────────────
// 3. _dhakaParts / todayStr — Timezone Logic
// ─────────────────────────────────────────────────────────────────────
describe('_dhakaParts / todayStr — timezone', () => {

  it('returns correct ISO date string for a known UTC timestamp', () => {
    // UTC 2026-05-01T18:01:00Z = Dhaka 2026-05-02T00:01:00+06:00
    const utcDate = new Date('2026-05-01T18:01:00Z')
    expect(todayStr(utcDate)).toBe('2026-05-02')
  })

  it('stays on same calendar day when UTC time is before Dhaka midnight', () => {
    // UTC 2026-05-01T10:00:00Z = Dhaka 2026-05-01T16:00:00+06:00
    const utcDate = new Date('2026-05-01T10:00:00Z')
    expect(todayStr(utcDate)).toBe('2026-05-01')
  })

  it('returns YYYY-MM-DD format (exactly 10 chars, correct separators)', () => {
    const result = todayStr(new Date('2026-06-15T08:00:00Z'))
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('pads single-digit month and day with leading zero', () => {
    // Dhaka 2026-01-05
    const utcDate = new Date('2025-12-31T18:01:00Z') // → 2026-01-01 in Dhaka
    expect(todayStr(utcDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const parts = todayStr(utcDate).split('-')
    expect(parts[1].length).toBe(2) // month padded
    expect(parts[2].length).toBe(2) // day padded
  })
})


// ─────────────────────────────────────────────────────────────────────
// 4. applyStatusFilter — Status Filter Logic
// ─────────────────────────────────────────────────────────────────────
describe('applyStatusFilter — reservation status filter', () => {

  const reservations: Reservation[] = [
    { id: 'r1', status: 'CHECKED_IN',  total_amount: 5000, paid_amount: 0 },
    { id: 'r2', status: 'CHECKED_IN',  total_amount: 3000, paid_amount: 3000 },
    { id: 'r3', status: 'CHECKED_OUT', total_amount: 4000, paid_amount: 1000 },
    { id: 'r4', status: 'RESERVED',    total_amount: 2000, paid_amount: 0 },
    { id: 'r5', status: 'CANCELLED',   total_amount: 1000, paid_amount: 0 },
    { id: 'r6', status: 'PENDING',     total_amount: 6000, paid_amount: 0 },
  ]

  it('ALL filter returns every reservation', () => {
    expect(applyStatusFilter(reservations, 'ALL')).toHaveLength(6)
  })

  it('CHECKED_IN filter returns only checked-in rows', () => {
    const result = applyStatusFilter(reservations, 'CHECKED_IN')
    expect(result.every(r => r.status === 'CHECKED_IN')).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('CHECKED_OUT filter returns only checked-out rows', () => {
    const result = applyStatusFilter(reservations, 'CHECKED_OUT')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r3')
  })

  it('RESERVED filter excludes all other statuses', () => {
    const result = applyStatusFilter(reservations, 'RESERVED')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r4')
  })

  it('DUE filter: only CHECKED_IN or CHECKED_OUT with positive balance', () => {
    // r1: CHECKED_IN, due=5000 ✓
    // r2: CHECKED_IN, due=0    ✗ (fully paid)
    // r3: CHECKED_OUT, due=3000 ✓
    // r4: RESERVED, due=2000  ✗ (wrong status)
    const result = applyStatusFilter(reservations, 'DUE')
    expect(result.map(r => r.id).sort()).toEqual(['r1', 'r3'])
  })

  it('DUE filter excludes fully-paid CHECKED_IN guests', () => {
    // r2 is CHECKED_IN but paid_amount === total_amount
    const result = applyStatusFilter(reservations, 'DUE')
    expect(result.find(r => r.id === 'r2')).toBeUndefined()
  })

  it('DUE filter never includes RESERVED or PENDING reservations', () => {
    const result = applyStatusFilter(reservations, 'DUE')
    expect(result.some(r => r.status === 'RESERVED' || r.status === 'PENDING')).toBe(false)
  })

  it('CANCELLED filter matches exactly', () => {
    const result = applyStatusFilter(reservations, 'CANCELLED')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r5')
  })

  it('unknown filter string returns empty array', () => {
    // No reservation has status 'GHOST'
    expect(applyStatusFilter(reservations, 'GHOST')).toHaveLength(0)
  })

  it('empty reservation array always returns empty array', () => {
    expect(applyStatusFilter([], 'ALL')).toHaveLength(0)
    expect(applyStatusFilter([], 'DUE')).toHaveLength(0)
  })
})


// ─────────────────────────────────────────────────────────────────────
// 5. dayCloseAllowed — Day-Close Guard Logic
// ─────────────────────────────────────────────────────────────────────
describe('dayCloseAllowed — day-close guard', () => {

  it('allows close when business date is one day behind wall clock (normal nightly close)', () => {
    // bizDay=2026-05-01, wall=2026-05-02 → nextDay=2026-05-02 ≤ wall ✓
    expect(dayCloseAllowed('2026-05-01', '2026-05-02')).toBe(true)
  })

  it('allows close when business date is multiple days behind (catch-up mode)', () => {
    // bizDay=2026-04-28, wall=2026-05-01 → nextDay=2026-04-29 ≤ wall ✓
    expect(dayCloseAllowed('2026-04-28', '2026-05-01')).toBe(true)
  })

  it('blocks close when business date equals wall clock (already closed for today)', () => {
    // bizDay=2026-05-01, wall=2026-05-01 → nextDay=2026-05-02 > wall ✗
    expect(dayCloseAllowed('2026-05-01', '2026-05-01')).toBe(false)
  })

  it('blocks close when business date is ahead of wall clock (date drift bug)', () => {
    // bizDay=2026-05-02, wall=2026-05-01 → nextDay=2026-05-03 > wall ✗
    expect(dayCloseAllowed('2026-05-02', '2026-05-01')).toBe(false)
  })

  it('handles month-boundary correctly (Apr 30 → May 1)', () => {
    // bizDay=2026-04-30, wall=2026-05-01 → nextDay=2026-05-01 ≤ wall ✓
    expect(dayCloseAllowed('2026-04-30', '2026-05-01')).toBe(true)
  })

  it('handles year-boundary correctly (Dec 31 → Jan 1)', () => {
    // bizDay=2025-12-31, wall=2026-01-01 → nextDay=2026-01-01 ≤ wall ✓
    expect(dayCloseAllowed('2025-12-31', '2026-01-01')).toBe(true)
  })
})


// ─────────────────────────────────────────────────────────────────────
// 6. isChargeFolio — Folio Fetch Filter (admin row exclusion)
// ─────────────────────────────────────────────────────────────────────
describe('isChargeFolio — folio admin-row filter', () => {

  it('passes through a normal F&B charge folio', () => {
    expect(isChargeFolio({ category: 'F&B', description: 'Restaurant dinner' })).toBe(true)
  })

  it('passes through a laundry folio', () => {
    expect(isChargeFolio({ category: 'Laundry', description: 'Dry cleaning' })).toBe(true)
  })

  it('blocks a folio with category "payment"', () => {
    expect(isChargeFolio({ category: 'payment', description: 'Cash received' })).toBe(false)
  })

  it('blocks a folio with description containing "Advance Payment"', () => {
    expect(isChargeFolio({ category: 'Misc', description: 'Advance Payment collected' })).toBe(false)
  })

  it('blocks a folio with category "receivable"', () => {
    expect(isChargeFolio({ category: 'receivable', description: 'Due carried' })).toBe(false)
  })

  it('blocks a folio with description containing "settlement"', () => {
    expect(isChargeFolio({ category: 'Admin', description: 'Final settlement' })).toBe(false)
  })

  it('blocks a folio with description containing "refund"', () => {
    expect(isChargeFolio({ category: 'Misc', description: 'Partial refund issued' })).toBe(false)
  })

  it('is case-insensitive (blocks "Payment" with capital P)', () => {
    expect(isChargeFolio({ category: 'Payment', description: 'Receipt #001' })).toBe(false)
  })

  it('passes when category and description are undefined', () => {
    // No text → ADMIN_RE cannot match → should pass through
    expect(isChargeFolio({})).toBe(true)
  })

  it('passes through a telecom surcharge folio (contains no banned words)', () => {
    expect(isChargeFolio({ category: 'Telecom', description: 'IDD call surcharge' })).toBe(true)
  })
})
