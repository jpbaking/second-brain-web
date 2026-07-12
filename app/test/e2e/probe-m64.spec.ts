import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { totpCode } from '../../server/dist/auth/totp.js'
import { openCoreDb } from '../../server/dist/db.js'
import { listProfiles, createProfile } from '../../server/dist/providers/store.js'
import { writeVaultConfig } from '../../server/dist/vault/config.js'
import { createSession, appendEvent, listSessions } from '../../server/dist/agent/chat-store.js'

// Throwaway probe for milestone 64 (new-chat landing + brand → command centre).

const SHOTS = process.env.M64_SHOTS ?? '/tmp/m64'

test.beforeAll(() => {
  const db = openCoreDb(path.join(process.env.E2E_DATA_DIR!, 'data'))
  if (listProfiles(db).length === 0) {
    createProfile(db, { displayName: 'Probe', providerId: 'anthropic', modelId: 'claude-sonnet-5' })
    writeVaultConfig(db, { remoteUrl: 'git@example.com:probe/vault.git' })
  }
  if (listSessions(db).length === 0) {
    const a = createSession(db, { title: 'Existing chat' })
    appendEvent(db, a.id, 'user_message', { text: 'hello there' })
  }
  db.close()
})

async function login (page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  await page.locator('#password').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('totp-step')).toBeVisible()
  await page.locator('#code').fill(totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 }))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('m64-01 login lands on the new-chat state despite existing chats', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  // new-chat welcome, not the existing chat's transcript
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toBeVisible()
  await expect(page.getByText('hello there')).toBeHidden()
  // the existing chat still opens explicitly
  await page.locator('.sidebar-chat', { hasText: 'Existing chat' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  await expect(page.getByText('hello there')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-landing.png` })
})

test('m64-02 expanded brand links to command centre; collapsed brand opens sidebar', async ({ page }) => {
  await login(page)
  await page.locator('.sidebar-brand-link').click()
  await expect(page).toHaveURL(/\/command-centre/)
  await page.screenshot({ path: `${SHOTS}/02-command-centre.png` })

  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(page.locator('.sidebar-brand-link')).toBeHidden()
  const openButton = page.getByRole('button', { name: 'Open sidebar' })
  await openButton.hover()
  await page.screenshot({ path: `${SHOTS}/02-collapsed-hover.png` })
  await openButton.click()
  await expect(page).toHaveURL(/\/command-centre/) // no navigation
  await expect(page.locator('.sidebar-brand-link')).toBeVisible()
})
