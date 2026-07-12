import path from 'node:path'
import { test, expect } from '@playwright/test';
import { totpCode } from '../../server/dist/auth/totp.js';
import { openCoreDb } from '../../server/dist/db.js';
import { createSession, appendEvent } from '../../server/dist/agent/chat-store.js';

test('user and assistant messages both offer a copy control', async ({ page }) => {
  // Seed a finished chat directly in the shared e2e core DB.
  const db = openCoreDb(path.join(process.env.E2E_DATA_DIR!, 'data'))
  const session = createSession(db, { title: 'Copy check', providerProfileId: null })
  appendEvent(db, session.id, 'user_message', { text: 'What is on today?' })
  appendEvent(db, session.id, 'chunk', { text: 'Nothing scheduled.' })
  appendEvent(db, session.id, 'ended', null)
  db.close()

  // Log in.
  await page.goto('/login');
  await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Continue' }).click();
  const code = totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 });
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto(`/chat/${session.id}`);
  await expect(page.locator('.chat-msg-user .chat-bubble')).toHaveText('What is on today?')

  const userCopy = page.locator('.chat-msg-user').getByRole('button', { name: 'Copy message' })
  const assistantCopy = page.locator('.chat-msg-assistant').getByRole('button', { name: 'Copy response as Markdown' })
  await expect(userCopy).toBeVisible()
  await expect(assistantCopy).toBeVisible()

  // Copy the user message and confirm the clipboard got the raw text.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await userCopy.click()
  await expect(userCopy).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('What is on today?')

  await page.screenshot({ path: process.env.E2E_SCREENSHOT_DIR !== undefined ? path.join(process.env.E2E_SCREENSHOT_DIR, 'chat-copy.png') : 'test-results/chat-copy.png' });
});
