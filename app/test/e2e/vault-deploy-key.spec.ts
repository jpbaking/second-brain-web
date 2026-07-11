import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { totpCode } from '../../server/dist/auth/totp.js';

const SAMPLE_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExampleExample second-brain-web deploy key';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Continue' }).click();
  const code = totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 });
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('vault page shows the deploy public key with a copy control', async ({ page }) => {
  // Seed a public key at the canonical path the endpoint reads.
  const pub = path.join(process.env.E2E_DATA_DIR!, 'data', 'ssh', 'deploy_key.pub');
  writeFileSync(pub, `${SAMPLE_KEY}\n`);

  // The onboarding gate hides every page until a provider exists; stub the
  // provider list so the vault page renders. Navigating straight to /vault
  // avoids the "configure your vault" redirect.
  await page.route('**/api/providers', async route => {
    await route.fulfill({ json: { profiles: [{ id: 'stub' }] } });
  });

  await login(page);
  await page.goto('/vault');

  const block = page.getByTestId('vault-deploy-key');
  await expect(block).toBeVisible();
  await expect(page.getByTestId('vault-public-key')).toHaveValue(SAMPLE_KEY);
  await expect(page.getByRole('button', { name: 'Copy public key' })).toBeVisible();

  const shot = process.env.SBW_SCREENSHOT;
  if (shot) await page.screenshot({ path: shot, fullPage: true });
});
