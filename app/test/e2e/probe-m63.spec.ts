import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { totpCode } from '../../server/dist/auth/totp.js'
import { openCoreDb } from '../../server/dist/db.js'
import { listProfiles, createProfile } from '../../server/dist/providers/store.js'
import { writeVaultConfig } from '../../server/dist/vault/config.js'
import { createSession, listSessions } from '../../server/dist/agent/chat-store.js'

// Throwaway probe for milestone 63 (chat-row "…" menu with rename).

const SHOTS = process.env.M63_SHOTS ?? '/tmp/m63'

test.beforeAll(() => {
  const db = openCoreDb(path.join(process.env.E2E_DATA_DIR!, 'data'))
  if (listProfiles(db).length === 0) {
    createProfile(db, { displayName: 'Probe', providerId: 'anthropic', modelId: 'claude-sonnet-5' })
    writeVaultConfig(db, { remoteUrl: 'git@example.com:probe/vault.git' })
  }
  if (listSessions(db).length === 0) {
    createSession(db, { title: 'Grocery list' })
    createSession(db, { title: 'Deep work schedule' })
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
  await expect(page.getByTestId('new-chat')).toBeVisible()
}

test('m63-01 row menu renames and deletes chats', async ({ page }) => {
  await login(page)
  const row = page.locator('[data-testid="chat-list"] li', { hasText: 'Grocery list' })

  // menu trigger is hover-only
  await expect(row.locator('.sidebar-chat-menu-trigger')).toBeHidden()
  await row.hover()
  await row.locator('.sidebar-chat-menu-trigger').click()
  await page.screenshot({ path: `${SHOTS}/01-menu-open.png` })

  // rename inline: escape cancels, enter saves
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.locator('.sidebar-chat-rename')
  await expect(input).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-rename-edit.png` })
  await input.press('Escape')
  await expect(page.locator('.sidebar-chat', { hasText: 'Grocery list' })).toBeVisible()

  await row.hover()
  await row.locator('.sidebar-chat-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await input.fill('Weekly shopping')
  await input.press('Enter')
  await expect(page.locator('.sidebar-chat', { hasText: 'Weekly shopping' })).toBeVisible()
  await expect(page.locator('.sidebar-chat', { hasText: 'Grocery list' })).toBeHidden()
  await page.screenshot({ path: `${SHOTS}/03-renamed.png` })

  // outside click closes the menu
  const other = page.locator('[data-testid="chat-list"] li', { hasText: 'Deep work schedule' })
  await other.hover()
  await other.locator('.sidebar-chat-menu-trigger').click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.locator('.shell-content').click()
  await expect(page.getByRole('menu')).toBeHidden()

  // delete via menu removes the row
  await other.hover()
  await other.locator('.sidebar-chat-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.locator('.sidebar-chat', { hasText: 'Deep work schedule' })).toBeHidden()
  await page.screenshot({ path: `${SHOTS}/04-deleted.png` })
})
