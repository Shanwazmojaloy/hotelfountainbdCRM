import { test, expect } from '@playwright/test';

// DESTRUCTIVE + STATEFUL: "Closing Complete" snapshots the open business day into
// night_audit_log and rolls the open day to the next one. This mutates fiscal state and
// CANNOT be undone from the UI, so run it ONLY on a throwaway/reset-able test tenant.
// It's a smoke test: it proves the close-day endpoint completes through the UI, not the
// full post-close report shape.
test.describe('Reports — close day (destructive, test-tenant only)', () => {
  test('Closing Complete posts a night-audit close for the open business day', async ({ page }) => {
    test.skip(!process.env.E2E_ALLOW_CLOSE_DAY, 'Set E2E_ALLOW_CLOSE_DAY=1 to run the destructive close-day smoke.');

    await page.goto('/crm/reports'); // Daily tab is default
    await expect(page.getByTestId('close-day-submit')).toBeVisible();

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/crm/close-day') && r.request().method() === 'POST'),
      page.getByTestId('close-day-submit').click(),
    ]);
    expect(resp.ok()).toBeTruthy();
  });
});
