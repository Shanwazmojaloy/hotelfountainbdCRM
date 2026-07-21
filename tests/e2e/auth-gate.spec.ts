import { test, expect } from '@playwright/test';

// Runs WITHOUT the shared session — a fresh, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

test('unauthenticated user hits the login gate, not the CRM', async ({ page }) => {
  await page.goto('/crm');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  // Nav/money must not be exposed before auth.
  await expect(page.getByRole('link', { name: /billing/i })).toHaveCount(0);
  await expect(page.getByTestId('pos-grand-total')).toHaveCount(0);
});
