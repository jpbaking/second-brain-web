import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { totpCode } from '../../server/dist/auth/totp.js'
import { openCoreDb } from '../../server/dist/db.js'
import { listProfiles, createProfile } from '../../server/dist/providers/store.js'
import { writeVaultConfig } from '../../server/dist/vault/config.js'
import { createSession, appendEvent, listSessions } from '../../server/dist/agent/chat-store.js'

// Throwaway probe for milestone 62 sidebar work. Seeds a provider profile,
// a configured vault, and a few chats, then screenshots sidebar states.

const SHOTS = process.env.M62_SHOTS ?? '/tmp/m62'

test.beforeAll(() => {
  const db = openCoreDb(path.join(process.env.E2E_DATA_DIR!, 'data'))
  if (listProfiles(db).length === 0) {
    createProfile(db, { displayName: 'Probe', providerId: 'anthropic', modelId: 'claude-sonnet-5' })
    writeVaultConfig(db, { remoteUrl: 'git@example.com:probe/vault.git' })
  }
  if (listSessions(db).length === 0) {
    const a = createSession(db, { title: 'Weekend plans in Tagaytay' })
    appendEvent(db, a.id, 'user_message', { text: 'thinking about a quick trip' })
    appendEvent(db, a.id, 'chunk', { type: 'done', text: 'Consider the Sky Ranch and picnic grove.' })
    const b = createSession(db, { title: 'Grocery list' })
    appendEvent(db, b.id, 'user_message', { text: 'add bananas and oat milk' })
    const c = createSession(db, { title: 'Deep work schedule' })
    appendEvent(db, c.id, 'user_message', { text: 'block mornings for the thesis draft' })
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

test('m62-01 collapsed brand hover swaps logo for open icon', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Close sidebar' }).click()
  const brand = page.getByRole('button', { name: 'Open sidebar' })
  await expect(brand.locator('img')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-collapsed-idle.png` })
  await brand.hover()
  await expect(brand.locator('img')).toBeHidden()
  await expect(brand.locator('.sidebar-brand-expand')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-collapsed-hover.png` })
  await brand.click()
  await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible()
})

test('m62-02 capture page highlights Capture not New chat', async ({ page }) => {
  await login(page)
  await page.goto('/capture')
  await expect(page.locator('.sidebar-action', { hasText: 'Capture' })).toHaveClass(/is-active/)
  await expect(page.getByTestId('new-chat')).not.toHaveClass(/is-active/)
  await page.screenshot({ path: `${SHOTS}/02-capture-active.png` })
})

test('m62-03 chat search matches message bodies', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Search chats' }).click()
  await page.getByRole('searchbox', { name: 'Search chats' }).fill('oat milk')
  await expect(page.locator('.sidebar-chat', { hasText: 'Grocery list' })).toBeVisible()
  await expect(page.locator('.sidebar-chat', { hasText: 'Deep work' })).toBeHidden()
  await page.screenshot({ path: `${SHOTS}/03-body-search.png` })
})

test('m62-04 star and delete only on hover', async ({ page }) => {
  await login(page)
  const row = page.locator('[data-testid="chat-list"] li', { hasText: 'Deep work schedule' })
  await expect(row.locator('.sidebar-chat-pin')).toBeHidden()
  await page.screenshot({ path: `${SHOTS}/04-row-idle.png` })
  await row.hover()
  await expect(row.locator('.sidebar-chat-pin')).toBeVisible()
  await expect(row.locator('.sidebar-chat-delete')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/04-row-hover.png` })
})

test('m62-05 hover delete removes the chat', async ({ page }) => {
  await login(page)
  const row = page.locator('[data-testid="chat-list"] li', { hasText: 'Grocery list' })
  await row.hover()
  await page.screenshot({ path: `${SHOTS}/05-before-delete.png` })
  await row.locator('.sidebar-chat-delete').click()
  await expect(page.locator('.sidebar-chat', { hasText: 'Grocery list' })).toBeHidden()
  await page.screenshot({ path: `${SHOTS}/05-deleted.png` })
})
