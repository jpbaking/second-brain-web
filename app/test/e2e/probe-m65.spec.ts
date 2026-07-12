import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { totpCode } from '../../server/dist/auth/totp.js'
import { openCoreDb } from '../../server/dist/db.js'
import { listProfiles, createProfile } from '../../server/dist/providers/store.js'
import { writeVaultConfig } from '../../server/dist/vault/config.js'

// Throwaway probe for milestone 65: screenshot the new brain mark in situ.

const SHOTS = process.env.M65_SHOTS ?? '/tmp/m65'

test.beforeAll(() => {
  const db = openCoreDb(path.join(process.env.E2E_DATA_DIR!, 'data'))
  if (listProfiles(db).length === 0) {
    createProfile(db, { displayName: 'Probe', providerId: 'anthropic', modelId: 'claude-sonnet-5' })
    writeVaultConfig(db, { remoteUrl: 'git@example.com:probe/vault.git' })
  }
  db.close()
})

test('m65-01 brain mark shows in sidebar, welcome, and hero', async ({ page }: { page: Page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  await page.locator('#password').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('totp-step')).toBeVisible()
  await page.locator('#code').fill(totpCode(process.env.E2E_TOTP_SECRET!, { digits: 6, period: 30 }))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/app-welcome.png` })
  await page.goto('/capture')
  await expect(page.getByRole('heading', { name: 'Quick capture' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/app-capture-hero.png` })
})

test('m65-02 favicons serve the new mark', async ({ request }) => {
  const svg = await request.get('/favicon.svg')
  expect(svg.ok()).toBe(true)
  expect(await svg.text()).toContain('M22 45') // the brain outline path
  const ico = await request.get('/favicon.ico')
  expect(ico.ok()).toBe(true)
  expect((await ico.body()).length).toBeGreaterThan(1000)
  const manifest = await request.get('/design/assets/favicons/site.webmanifest')
  expect(await manifest.json()).toMatchObject({ name: 'Second Brain' })
})
