import { test, expect, type APIRequestContext } from '@playwright/test';

// Money helper: compare NUMBERS, not brittle Taka strings.
const money = (s: string) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;

const ITEM = `E2E RoomItem ${Date.now()}`;
const PRICE = 120;
const GUEST = `E2E ChargeGuest ${Date.now()}`;

// Seed a single-room CHECKED_IN reservation via the API (authenticated by the shared
// storageState cookie). Returns { id, room }. Tears down with a cascade delete.
async function seedCheckin(request: APIRequestContext): Promise<{ id: string; room: string }> {
  const roomsRes = await request.get('/api/crm/data?resource=reservations&status_in=CHECKED_IN,RESERVED&limit=5000');
  const taken = new Set<string>();
  ((await roomsRes.json()).rows || []).forEach((r: { room_ids?: string[] }) => (r.room_ids || []).forEach((x) => taken.add(String(x))));
  // A test tenant should have rooms 101..110 seeded; pick the first free one.
  const room = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'].find((rn) => !taken.has(rn));
  if (!room) throw new Error('No free test room — seed rooms 101..110 on the test tenant.');
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const res = await request.post('/api/crm/reservation', {
    data: { action: 'create', guest_ids: [], guest_name: GUEST, room_ids: [room], check_in: today, check_out: tomorrow, status: 'CHECKED_IN', total_amount: 3000, paid_amount: 3000, discount_amount: 0, payment_method: 'Cash' },
  });
  expect(res.ok()).toBeTruthy();
  const list = await request.get(`/api/crm/data?resource=reservations&status_in=CHECKED_IN`);
  const mine = ((await list.json()).rows || []).find((r: { guest_name?: string }) => r.guest_name === GUEST);
  expect(mine?.id).toBeTruthy();
  return { id: mine.id, room };
}

test.describe('Restaurant POS — charge to room + void', () => {
  let seeded: { id: string; room: string } | null = null;

  test.afterEach(async ({ request }) => {
    if (seeded) { await request.post('/api/crm/reservation', { data: { action: 'delete', id: seeded.id } }).catch(() => {}); seeded = null; }
  });

  test('charge-to-room posts an F&B folio line + raises the balance; void reverses it', async ({ page, request }) => {
    seeded = await seedCheckin(request);

    await page.goto('/crm/restaurant');
    // Seed a menu item.
    await page.getByPlaceholder('Item name').fill(ITEM);
    await page.getByPlaceholder(/Price/).fill(String(PRICE));
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /^Add$/ }).click(),
    ]);

    // ROOM order to the seeded guest. The room <option> value is `${reservation_id}|${room}`
    // (see PosTerminal roomOpts), so select it exactly by value.
    await page.getByRole('button', { name: /^Room$/ }).click();
    await page.locator('select').first().selectOption(`${seeded.id}|${seeded.room}`);
    await page.getByRole('button', { name: new RegExp(ITEM) }).click();
    const grand = money(await page.getByTestId('pos-grand-total').innerText());
    expect(grand).toBe(PRICE);

    const [chargeResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByTestId('pos-charge-room').click(),
    ]);
    const orderNo = (await chargeResp.json())?.order?.order_no as string;
    expect(orderNo).toBeTruthy();

    // Billing: the F&B folio line shows on the guest's invoice + balance reflects the charge.
    await page.goto('/crm/billing');
    await page.getByPlaceholder(/Search folios/i).fill(seeded.room);
    await expect(page.getByText(new RegExp(`Restaurant ${orderNo}`))).toBeVisible();
    // seeded fully-paid (3000/3000); the F&B charge makes the new balance == PRICE.
    await expect.poll(async () => money(await page.getByTestId('billing-balance-due').innerText())).toBe(PRICE);

    // Void the order in History -> folio reverses -> balance returns to 0.
    await page.goto('/crm/restaurant');
    await page.getByRole('button', { name: /^History$/ }).click();
    await page.getByPlaceholder(/Order no/i).fill(orderNo);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('resource=history')),
      page.getByRole('button', { name: /^Search$/ }).click(),
    ]);
    page.on('dialog', (d) => d.accept());
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByTestId('history-void').first().click(),
    ]);

    await page.goto('/crm/billing');
    await page.getByPlaceholder(/Search folios/i).fill(seeded.room);
    await expect.poll(async () => money(await page.getByTestId('billing-balance-due').innerText())).toBe(0);
  });
});
