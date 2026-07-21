import { test, expect } from '@playwright/test';

// Strip the Taka symbol + commas so we compare NUMBERS, not brittle formatted strings.
const money = (s: string) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;

const ITEM = `E2E Tea ${Date.now()}`;
const PRICE = 55;

test.describe('Restaurant POS — money paths', () => {
  test('walk-in: add item, total matches price, settle, appears in History', async ({ page }) => {
    await page.goto('/crm/restaurant');

    // Seed a menu item via Menu Management (supervisor account). Uses a unique name so
    // the test is isolated from existing menu data.
    await page.getByPlaceholder('Item name').fill(ITEM);
    await page.getByPlaceholder(/Price/).fill(String(PRICE));
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /^Add$/ }).click(),
    ]);

    // Build a walk-in order from that item.
    await page.getByRole('button', { name: /walk-in/i }).click();
    await page.getByRole('button', { name: new RegExp(ITEM) }).click();

    // Money check: recompute, don't hardcode. No VAT/service/discount -> grand == price.
    await expect(page.getByTestId('pos-grand-total')).toBeVisible();
    await expect
      .poll(async () => money(await page.getByTestId('pos-grand-total').innerText()))
      .toBe(PRICE);

    // Settle (Cash is the default method).
    const [settleResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByTestId('pos-settle').click(),
    ]);
    expect(settleResp.ok()).toBeTruthy();
    const orderNo = (await settleResp.json())?.order?.order_no as string;
    expect(orderNo).toBeTruthy();

    // It shows up in History search.
    await page.getByRole('button', { name: /^History$/ }).click();
    await page.getByPlaceholder(/Order no/i).fill(orderNo);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('resource=history')),
      page.getByRole('button', { name: /^Search$/ }).click(),
    ]);
    await expect(page.getByText(orderNo)).toBeVisible();
  });

  test('register: open with a float, then close (returns to Open Register)', async ({ page }) => {
    await page.goto('/crm/restaurant');

    // Isolate: if a register is already open, close it first.
    if (await page.getByTestId('register-close').isVisible().catch(() => false)) {
      await page.getByTestId('register-close').click();
      await page.getByPlaceholder(/physically counted/i).fill('0');
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
        page.getByRole('button', { name: /close & print/i }).click(),
      ]);
    }

    // Open with a float.
    await page.getByTestId('register-open').click();
    await page.getByPlaceholder(/e\.g\. 2000/).fill('2000');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /^Open$/ }).click(),
    ]);
    await expect(page.getByText(/register open/i)).toBeVisible();

    // Close it (a print popup may open; we don't assert on it).
    page.on('popup', (p) => p.close().catch(() => {}));
    await page.getByTestId('register-close').click();
    await page.getByPlaceholder(/physically counted/i).fill('2000'); // no sales -> expected == float
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/restaurant') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /close & print/i }).click(),
    ]);
    await expect(page.getByTestId('register-open')).toBeVisible();
  });
});
