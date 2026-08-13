#!/usr/bin/env node
/**
 * Build the Office panel into this app's own origin, at `/panel/`.
 *
 * Office loads a task pane from a live HTTPS origin, and the panel had
 * none — its manifests carried a placeholder domain and nothing served
 * its build. This closes that structurally: every deploy of the
 * dashboard carries the panel with it, at the same domain, over the
 * same TLS, with no second deployment to forget.
 *
 * What it does, in order:
 *
 * 1. Builds `@claidor/panel` with `PANEL_BASE=/panel/` and the API and
 *    dashboard origins taken from this app's own `NEXT_PUBLIC_*`
 *    environment — one source of truth for where the server is.
 * 2. Copies the build into `public/panel/` (generated, git-ignored).
 * 3. When the deploy's public origin is known
 *    (`NEXT_PUBLIC_FRONTEND_BASE_URL`, https), stamps the manifests
 *    too — so the site serves its own sideloadable manifests at
 *    `/panel/manifest.xml` and `/panel/manifest.outlook.xml`. On plain
 *    http (dev) the manifests are skipped, because Office would refuse
 *    them anyway and a manifest pointing at localhost half-works in the
 *    worst way.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..')
const panel = join(web, '..', 'panel')

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'
const site =
  process.env.NEXT_PUBLIC_FRONTEND_BASE_URL ?? 'http://127.0.0.1:3000'

console.log(`[panel] building against API ${api}`)
execFileSync('pnpm', ['--filter', '@claidor/panel', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PANEL_BASE: '/panel/',
    VITE_API_BASE: api,
    VITE_DASHBOARD_URL: site,
  },
})

const dist = join(panel, 'dist')
if (!existsSync(join(dist, 'index.html'))) {
  console.error('[panel] the panel build produced no index.html — stopping')
  process.exit(1)
}

if (/^https:\/\//.test(site)) {
  execFileSync(
    'node',
    [
      join(panel, 'scripts', 'stamp-manifests.mjs'),
      '--origin',
      site.replace(/\/$/, ''),
      '--path',
      '/panel',
    ],
    { stdio: 'inherit' },
  )
} else {
  console.log(
    `[panel] ${site} is not https — manifests not stamped (dev build)`,
  )
}

const target = join(web, 'public', 'panel')
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(dist, target, { recursive: true })
console.log('[panel] embedded into public/panel/')
