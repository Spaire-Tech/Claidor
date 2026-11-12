// The Windows app run for real (Electron, on this computer: Windows, or
// Linux under a virtual display) against the stand-in server
// (test/standIn.mjs): no real service is reached.
//
// - The page loads from the app's own address, with its facts and policy;
//   anything outside the build is refused; a page can't open anything but
//   the app's own.
// - The page keeps a pair; the app quits after the page says it is ready;
//   launched again, it reads the pair back, sealed on disk, and signs in:
//   the server is called from `app://simeon` with the app's headers (CORS),
//   and the agents are on screen.
// - The window is 512 × 520 at the least; its × hides it; it grows for the
//   agent's pane and gives it back as the pane closes.
// - No picture is read from inside the network; the beep answers.
//
//   npm run smoke                         (prints what it saw; exits 1 on a failure)
//   SIMEON_APP_ROOT=<a build> npm run smoke   (another build of the web app)
//   SHOTS=<folder> npm run smoke          (keeps screenshots)

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeKeptTokens, startStandIn } from '../test/standIn.mjs'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright-core')
const here = fileURLToPath(new URL('..', import.meta.url))
const binary = require('electron')

const failures = []
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}

async function launch(standIn, dataFolder) {
  // The package's folder, so the app reads its own package.json (its version, `main`).
  const args = [here, `--api=${standIn.base}`]
  if (process.platform === 'linux') args.push('--no-sandbox')
  const app = await electron.launch({
    executablePath: binary,
    args,
    env: { ...process.env, SIMEON_USER_DATA: dataFolder },
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.waitForLoadState('domcontentloaded')
  return { app, page, errors }
}

const standIn = await startStandIn()
const dataFolder = mkdtempSync(path.join(os.tmpdir(), 'simeon-smoke-'))
try {
  // The first launch: nobody signed in.
  {
    const { app, page, errors } = await launch(standIn, dataFolder)
    check(page.url() === 'app://simeon/app-next/', `the page is the app's own (${page.url()})`)
    const facts = await page.evaluate(() => window.simeonDesktop?.facts)
    check(facts?.apiBase === standIn.base, 'the page was told the server')
    check(facts?.window === 'main', 'the page knows it is the main window')
    check(
      (await page.evaluate(() => document.documentElement.dataset.desktop)) === facts?.platform,
      'the page marks itself as in the app (data-desktop)',
    )
    const policy = await page.evaluate(async () => {
      const header = (await fetch('app://simeon/app-next/index.html')).headers.get('content-security-policy') ?? ''
      // An inline script: the policy (script-src 'self' blob:) refuses it.
      window.ranInline = false
      const script = document.createElement('script')
      script.textContent = 'window.ranInline = true'
      document.head.append(script)
      return { header, ranInline: window.ranInline }
    })
    check(policy.header.includes("script-src 'self' blob:"), 'the page is served with its policy')
    check(policy.header.includes(standIn.base), 'the policy lets the page reach its server')
    check(policy.ranInline === false, 'the policy refuses an inline script')
    const outside = await page.evaluate(async () => {
      const status = async (url) => {
        try {
          return (await fetch(url)).status
        } catch {
          return 'refused'
        }
      }
      return {
        root: await status('app://simeon/'),
        escaped: await status('app://simeon/app-next/%2e%2e/%2e%2e/package.json'),
        other: await status('app://other/app-next/'),
        index: await status('app://simeon/app-next/index.html'),
      }
    })
    check(outside.index === 200, 'the build is served')
    check(outside.root === 404, 'nothing outside app-next is served')
    check(outside.escaped === 404, 'no way out of the build')
    check(outside.other === 404 || outside.other === 'refused', 'another host of the scheme is nothing')
    await page.evaluate(() => window.open('file:///etc/hosts'))
    await page.waitForTimeout(300)
    check(app.windows().length === 1, 'a page opens no window of its own')
    const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize())
    check(size[0] === 512 && size[1] === 520, `the window is 512 × 520 at the least (${size})`)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await page.waitForTimeout(300)
    const after = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      return { there: !!window && !window.isDestroyed(), visible: window?.isVisible() }
    })
    check(after.there && after.visible === false, 'the × hides the window, the app stays')
    await page.evaluate((tokens) => window.simeonDesktop.keep('simeon.web.tokens', tokens), fakeKeptTokens)
    await page.waitForTimeout(200)
    const sealed = path.join(dataFolder, 'kept', 'simeon.web.tokens.sealed')
    check(existsSync(sealed), 'the pair is kept on disk')
    check(existsSync(sealed) && !readFileSync(sealed, 'utf8').includes('fake-refresh'), 'sealed, never in plain text')
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
    await app.close()
  }
  // The second launch: the pair read back, signed in.
  {
    standIn.state.requests.length = 0
    const { app, page, errors } = await launch(standIn, dataFolder)
    await page.waitForSelector('.sidebar', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1_000)
    const profile = standIn.state.requests.find((r) => r.path === '/desktop/api/user/profile' && r.method === 'GET')
    check(!!profile, 'signed in from the kept pair: the profile was read')
    check(profile?.origin === 'app://simeon', `from the app's origin (${profile?.origin})`)
    check(profile?.bearer === true, 'with the bearer')
    // Its own version, as package.json has it (0.1.1 since the first release).
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    check(profile?.client?.startsWith(`windows-${version}+`) === true, `named as the Windows app (${profile?.client})`)
    const names = await page.$$eval('.sidebar', (all) => all.map((e) => e.textContent ?? '').join(' '))
    check(names.includes('Iris') && names.includes('Theo'), 'the agents are in the sidebar')
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'smoke-window.png') })
    // After step 7: the window grows for the agent's pane and gives it back (AgentPane.swift), through the page's own keys.
    const contentWidth = () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds().width)
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const bounds = window.getContentBounds()
      window.setContentBounds({ ...bounds, width: 900 })
    })
    await page.waitForTimeout(300)
    const narrow = await contentWidth()
    await page.locator('.sidebar').first().click({ position: { x: 5, y: 200 } }).catch(() => {})
    await page.keyboard.press('Control+Shift+Comma')
    await page.waitForTimeout(800)
    const grown = await contentWidth()
    check(narrow === 900 && grown >= 88 + 424 + 480, `the window grows for the pane (${narrow} → ${grown})`)
    await page.keyboard.press('Control+Shift+Comma')
    await page.waitForTimeout(800)
    const back = await contentWidth()
    check(Math.abs(back - narrow) <= 2, `and gives it back as it closes (${back})`)
    // Pictures from other sites: never from this PC's own network; the beep answers.
    const local = await page.evaluate(
      async (base) => [
        await window.simeonDesktop.call('siteIcon', ['localhost']),
        await window.simeonDesktop.call('remotePicture', [`${base}/logo.png`]),
        await window.simeonDesktop.call('remotePicture', ['https://127.0.0.1/logo.png']),
      ],
      standIn.base,
    )
    check(local.every((answer) => answer === null), `no picture read inside the network (${local})`)
    const beeped = await page.evaluate(() => window.simeonDesktop.call('beep', []).then(() => 'ok', String))
    check(beeped === 'ok', `the beep answers (${beeped})`)
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
    await app.close()
  }
} finally {
  await standIn.close()
  rmSync(dataFolder, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} failed.`)
process.exit(failures.length === 0 ? 0 : 1)
