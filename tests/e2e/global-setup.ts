import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Sign in ONCE with a POS-capable test account and persist the HttpOnly session cookie
// (lumea_sess) as storageState, reused by every spec except the auth-gate test.
//
// Required env (a NON-PROD test tenant — never prod):
//   E2E_BASE_URL   e.g. http://localhost:3000  OR a Vercel preview URL
//   E2E_EMAIL      a Restaurant Supervisor or Owner test account (has posRegister + compItem)
//   E2E_PASSWORD   its password
export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD must be set (a POS-capable account on a NON-PROD tenant).');
  }

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/crm');
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/crm/login')),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
  // Landing on any /crm/* route means the session cookie is set.
  await page.waitForURL(/\/crm/, { timeout: 15_000 });
  await page.context().storageState({ path: path.join(authDir, 'state.json') });
  await browser.close();
}
