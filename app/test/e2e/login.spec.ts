import { test, expect } from '@playwright/test';
import { totpCode } from '../../server/dist/auth/totp.js';

test('successfully logs in with password and TOTP', async ({ page }) => {
  await page.goto('/login');

  // Step 1: Password
  await expect(page.getByTestId('password-step')).toBeVisible();
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
});
