import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test';
import { totpCode } from '../../server/dist/auth/totp.js';
import { vaultWorkspacePath } from '../../server/dist/vault/config.js';

test('browses vault folders and previews a markdown file', async ({ page }) => {
  // Seed a small vault tree in the shared e2e data dir.
  const ws = vaultWorkspacePath(path.join(process.env.E2E_DATA_DIR!, 'data'))
  mkdirSync(path.join(ws, 'memory', 'notes'), { recursive: true })
  writeFileSync(path.join(ws, 'memory', 'notes', 'welcome.md'), '# Welcome\n\nA **rendered** preview.\n')

  // Log in.
  await page.goto('/login');
  await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Continue' }).click();
  const code = totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 });
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  // Browse: root → memory → notes.
  await page.goto('/explorer');
  await expect(page.getByRole('heading', { name: 'Explorer' })).toBeVisible();
  await expect(page.locator('.app-footer')).toHaveText('© 2026 Joseph Baking');
  await expect(page.locator('.app-footer')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

  // Capture (a short shell page) also shows the footer without scrolling.
  await page.goto('/capture');
  await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();
  await expect(page.locator('.app-footer')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: process.env.E2E_SCREENSHOT_DIR !== undefined ? path.join(process.env.E2E_SCREENSHOT_DIR, 'capture.png') : 'test-results/capture.png' });
  await page.goto('/explorer');
  await page.getByRole('button', { name: 'memory' }).click();
  await page.getByRole('button', { name: 'notes' }).click();

  // The download control is hidden until the row is hovered or focused.
  const row = page.locator('.explorer-row', { hasText: 'welcome.md' })
  const download = row.getByRole('link', { name: 'Download welcome.md' })
  await expect(download).toBeHidden()

  // Preview the markdown file, rendered.
  await page.getByRole('button', { name: /welcome\.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.locator('.prose strong')).toHaveText('rendered');

  // Hovering the row reveals the download control, which serves the raw file.
  await row.hover()
  await expect(download).toBeVisible()
  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(saved.suggestedFilename()).toBe('welcome.md')

  await page.screenshot({ path: process.env.E2E_SCREENSHOT_DIR !== undefined ? path.join(process.env.E2E_SCREENSHOT_DIR, 'explorer.png') : 'test-results/explorer.png', fullPage: true });
});
