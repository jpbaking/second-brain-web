import { test, expect } from '@playwright/test';
import { totpCode } from '../../server/dist/auth/totp.js';

test('successfully logs in with password and TOTP', async ({ page }) => {
  await page.goto('/login');

  // Step 1: Password (copyright footer shows on login)
  await expect(page.getByTestId('password-step')).toBeVisible();
  await expect(page.locator('.app-footer')).toHaveText('© 2026 Joseph Baking');
  await expect(page.locator('.app-footer')).toBeInViewport();
  // The footer must not force a scrollbar on a short page.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: TOTP
  await expect(page.getByTestId('totp-step')).toBeVisible();
  
  // Generate code
  const code = totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 });
  
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Should redirect to command centre (/)
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toBeVisible();
  // Chat surfaces carry no footer.
  await expect(page.locator('.app-footer')).toHaveCount(0);
});
