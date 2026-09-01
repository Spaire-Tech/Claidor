#!/usr/bin/env node
/**
 * Drive the panel end to end without Office — the 31 Aug 2026 proof,
 * kept re-runnable.
 *
 * What it proves: the signed-out face, the allow-access gate, the real
 * check (`/v1/tieout/check-file`) on real workbook bytes, the findings
 * list with the « N checks pass » catalogue line, one finding opened,
 * and the honest refusal of the jump outside Office. What it cannot
 * prove: anything Office-side — the ribbon button, reading the open
 * workbook's bytes, selecting a cell, « Fix the cell » writing back.
 * That list lives in SIDELOAD.md; the first real sideload is its test.
 *
 * To run:
 *   1. API up on :8000, panel dev server on :3100
 *      (`pnpm --filter @claidor/panel dev`), CORS allowing :3100.
 *   2. A token: `POST /v1/tieout/panel/token` with a session cookie
 *      (`uv run python -m scripts.dev_session` mints one in dev).
 *   3. An .xlsx the dev server can hand out — drop one into `public/`.
 *   4. `npm i playwright-core` anywhere, then:
 *      PANEL_TOKEN=<token> FILE_URL=http://127.0.0.1:3100/<name>.xlsx \
 *        node scripts/verify-headless.mjs
 *
 * `CHROMIUM` overrides the browser path (defaults to the environment's
 * Playwright chromium). Screenshots land in OUT_DIR (default `.`).
 */
/* eslint-disable turbo/no-undeclared-env-vars -- run by hand, never by turbo */
import { createRequire } from 'node:module'

const require = createRequire(process.cwd() + '/')
const { chromium } = require('playwright-core')

const TOKEN = process.env.PANEL_TOKEN
const FILE_URL = process.env.FILE_URL
const OUT = process.env.OUT_DIR ?? '.'
const PANEL = process.env.PANEL_URL ?? 'http://127.0.0.1:3100'
if (!TOKEN) throw new Error('PANEL_TOKEN not set')
if (!FILE_URL) throw new Error('FILE_URL not set')

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 340, height: 780 } })
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`)
})

// 1. Signed out.
await page.goto(PANEL)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/1-signed-out.png` })

// 2. Token in, workbook in, consent clicked: the whole checked face.
await page.evaluate((t) => {
  localStorage.setItem('claidor.panel.token', t)
}, TOKEN)
await page.goto(`${PANEL}/?file=${FILE_URL}`)
await page.waitForTimeout(1500)
await page.getByText('Allow access', { exact: true }).click()
await page.waitForTimeout(9000)
await page.screenshot({ path: `${OUT}/2-checked.png`, fullPage: true })
const checked = await page.locator('body').innerText()

// 3. One finding open: the expanded row, and the jump's honest refusal.
const row = page.locator('button').filter({ hasText: /./ }).nth(2)
await row.click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/3-finding-open.png`, fullPage: true })
const open = await page.locator('body').innerText()

await browser.close()

const musts = [
  [/\d+ findings?/.test(checked), 'a findings count rendered'],
  [/\d+ checks pass/.test(checked), 'the catalogue line rendered'],
  [
    open.includes('not running inside Office'),
    'the jump refused honestly outside Office',
  ],
  [
    !open.includes('Selected in the sheet'),
    'no claim of selection the sheet never made',
  ],
]
let failed = false
for (const [ok, what] of musts) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failed = true
}
if (problems.length) console.log('\nHTTP/JS problems:\n' + problems.join('\n'))
process.exit(failed || problems.length ? 1 : 0)
