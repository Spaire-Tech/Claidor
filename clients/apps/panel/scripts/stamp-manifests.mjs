#!/usr/bin/env node
/**
 * Stamp the manifests with a real origin.
 *
 * The checked-in manifests carry `https://YOUR-DOMAIN.example.com` on
 * purpose: a manifest is an *deployment* artifact, and a committed one
 * pointing at somebody's dev tunnel is how a team sideloads the wrong
 * server for a week. This writes stamped copies next to the build
 * output — `dist/manifest.xml`, `dist/manifest.outlook.xml` — and never
 * touches the sources.
 *
 *   node scripts/stamp-manifests.mjs --origin https://app.example.com
 *   node scripts/stamp-manifests.mjs --origin https://app.example.com --path /panel
 *
 * `--path` is for the panel riding another app's origin (the dashboard
 * serves it under `/panel/`). The AppDomain stays the bare origin —
 * Office matches domains, not paths.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? null : args[at + 1]
}

const origin = flag('origin')
if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
  console.error(
    'Usage: stamp-manifests.mjs --origin https://your-domain [--path /panel]\n' +
      'The origin must be https (Office refuses plain http off localhost) ' +
      'and carry no trailing slash or path.',
  )
  process.exit(1)
}
const path = (flag('path') ?? '').replace(/\/$/, '')

const PLACEHOLDER = 'https://YOUR-DOMAIN.example.com'
mkdirSync(join(root, 'dist'), { recursive: true })

for (const name of ['manifest.xml', 'manifest.outlook.xml']) {
  const source = readFileSync(join(root, name), 'utf8')
  if (!source.includes(PLACEHOLDER)) {
    console.error(
      `${name} has no placeholder to stamp — is it already stamped?`,
    )
    process.exit(1)
  }
  const stamped = source
    // Office matches AppDomain by domain, never by path.
    .replaceAll(
      `<AppDomain>${PLACEHOLDER}</AppDomain>`,
      `<AppDomain>${origin}</AppDomain>`,
    )
    // Support lives on the product's site, not inside the panel build —
    // `/panel/support` would 404 in the worst place, an error dialog.
    .replaceAll(
      `<SupportUrl DefaultValue="${PLACEHOLDER}/support" />`,
      `<SupportUrl DefaultValue="${origin}" />`,
    )
    .replaceAll(PLACEHOLDER, `${origin}${path}`)
  const out = join(root, 'dist', name)
  writeFileSync(out, stamped)
  console.log(`stamped ${name} -> dist/${name}  (${origin}${path})`)
}
