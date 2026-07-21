import { test, expect, type APIRequestContext } from '@playwright/test';

// THE FLAGSHIP MONEY-INTEGRITY TEST.
// House rule (2026-06-14): a multi-room booking is stored as ONE reservation PER ROOM
// (fan-out), so checking out ONE room must NOT flip its siblings. This guards the
// ABDULLAH BIN SAFAT 405/501/506 incident where a single multi-room row shared one
// status and one checkout released all three.

const GUEST = `E2E MultiRoom ${Date.now()}`;

async function freeRooms(request: APIRequestContext, n: number): Promise<string[]> {
  const res = await request.get('/api/crm/data?resource=reservations&status_in=CHECKED_IN,RESERVED&limit=5000');
  const taken = new Set<string>();
  ((await res.json()).rows || []).forEach((r: { room_ids?: string[] }) => (r.room_ids || []).forEach((x) => taken.add(String(x))));
  const pool = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '201', '202', '203', '204', '205'];
  const free = pool.filter((rn) => !taken.has(rn)).slice(0, n);
  if (free.length < n) throw new Error(`Need ${n} free test rooms; seed more on the test tenant.`);
  return free;
}

async function childrenByGuest(request: APIRequestContext) {
  const list = await request.get('/api/crm/data?resource=reservations&status_in=CHECKED_IN,CHECKED_OUT&limit=5000');
  return ((await list.json()).rows || []).filter((r: { guest_name?: string }) => r.guest_name === GUEST) as Array<{
    id: string; room_ids: string[]; status: string; total_amount: number; paid_amount: number; discount_amount: number;
  }>;
}

test.describe('Multi-room checkout — sibling isolation', () => {
  let ids: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of ids) await request.post('/api/crm/reservation', { data: { action: 'delete', id } }).catch(() => {});
    ids = [];
  });

  test('checking out ONE room leaves the other two CHECKED_IN with untouched balances', async ({ page, request }) => {
    const rooms = await freeRooms(request, 3);

    // Seed a 3-room CHECKED_IN booking → API fans out into 3 per-room reservations.
    const res = await request.post('/api/crm/reservation', {
      data: { action: 'create', guest_ids: [], guest_name: GUEST, room_ids: rooms, check_in: new Date().toISOString().slice(0, 10), check_out: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'CHECKED_IN', total_amount: 9000, paid_amount: 3000, discount_amount: 0, payment_method: 'Cash' },
    });
    expect(res.ok()).toBeTruthy();

    const kids = await childrenByGuest(request);
    ids = kids.map((k) => k.id);
    expect(kids.length).toBe(3); // fan-out invariant

    // All three rooms read OCCUPIED in the UI.
    await page.goto('/crm/rooms');
    for (const rn of rooms) {
      await expect(page.getByTestId(`room-tile-${rn}`)).toHaveAttribute('data-status', 'OCCUPIED');
    }

    // Check out ONLY the first room's reservation.
    const target = kids[0];
    const others = kids.slice(1);
    const beforeBalances = new Map(others.map((k) => [k.id, (+k.total_amount || 0) - (+k.discount_amount || 0) - (+k.paid_amount || 0)]));
    const co = await request.post('/api/crm/check', { data: { action: 'checkout', reservation_id: target.id } });
    expect(co.ok()).toBeTruthy();

    // The checked-out room is no longer OCCUPIED; the OTHER two are still OCCUPIED.
    await page.goto('/crm/rooms');
    await expect(page.getByTestId(`room-tile-${target.room_ids[0]}`)).not.toHaveAttribute('data-status', 'OCCUPIED');
    for (const k of others) {
      await expect(page.getByTestId(`room-tile-${k.room_ids[0]}`)).toHaveAttribute('data-status', 'OCCUPIED');
    }

    // Backend truth: siblings still CHECKED_IN and their balances are byte-for-byte unchanged.
    const after = await childrenByGuest(request);
    for (const k of others) {
      const now = after.find((a) => a.id === k.id)!;
      expect(now.status).toBe('CHECKED_IN');
      const bal = (+now.total_amount || 0) - (+now.discount_amount || 0) - (+now.paid_amount || 0);
      expect(bal).toBe(beforeBalances.get(k.id));
    }
    const closed = after.find((a) => a.id === target.id)!;
    expect(closed.status).toBe('CHECKED_OUT');
  });
});
