import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_ROOMS } from './fixtures';

// Compare NUMBERS, not Taka strings.
const money = (s: string) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
const GUEST = `E2E PayGuest ${Date.now()}`;

// Seed a CHECKED_IN reservation with an OPEN balance (total 3000, paid 1000 -> due 2000).
async function seedWithBalance(request: APIRequestContext): Promise<{ id: string; room: string }> {
  const res = await request.get('/api/crm/data?resource=reservations&status_in=CHECKED_IN,RESERVED&limit=5000');
  const taken = new Set<string>();
  ((await res.json()).rows || []).forEach((r: { room_ids?: string[] }) => (r.room_ids || []).forEach((x) => taken.add(String(x))));
  const room = TEST_ROOMS.find((rn) => !taken.has(rn));
  if (!room) throw new Error('No free test room — set E2E_TEST_ROOMS to rooms that exist + are free on the test tenant.');
  await request.post('/api/crm/reservation', {
    data: { action: 'create', guest_ids: [], guest_name: GUEST, room_ids: [room], check_in: new Date().toISOString().slice(0, 10), check_out: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'CHECKED_IN', total_amount: 3000, paid_amount: 1000, discount_amount: 0, payment_method: 'Cash' },
  });
  const list = await request.get('/api/crm/data?resource=reservations&status_in=CHECKED_IN');
  const mine = ((await list.json()).rows || []).find((r: { guest_name?: string }) => r.guest_name === GUEST);
  expect(mine?.id).toBeTruthy();
  return { id: mine.id, room };
}

test.describe('Billing — partial payment', () => {
  let seeded: { id: string; room: string } | null = null;
  test.afterEach(async ({ request }) => {
    if (seeded) { await request.post('/api/crm/reservation', { data: { action: 'delete', id: seeded.id } }).catch(() => {}); seeded = null; }
  });

  test('recording a partial payment reduces the balance by EXACTLY that amount (no double-discount / drift)', async ({ page, request }) => {
    seeded = await seedWithBalance(request);

    await page.goto('/crm/billing');
    await page.getByPlaceholder(/Search folios/i).fill(seeded.room);
    await expect.poll(async () => money(await page.getByTestId('billing-balance-due').innerText())).toBe(2000);

    await page.getByRole('button', { name: /record payment/i }).click();
    await page.getByTestId('payment-amount').fill('500');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/payment') && r.request().method() === 'POST'),
      page.getByTestId('payment-submit').click(),
    ]);

    // due drops by exactly 500 -> 1500. Recomputed, not hardcoded to a formatted string.
    await expect.poll(async () => money(await page.getByTestId('billing-balance-due').innerText())).toBe(1500);
  });
});
