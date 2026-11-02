// Which builds update themselves, and from where (the Mac's rule: a build
// released with Sparkle's key updates itself; Debug, `build.sh` and a hand
// build never do, mac/Simeon/Updates.swift).
//
// - A release: installed (packaged) on Windows, with the build number
//   `windows/scripts/release.mjs` wrote into it. It reads its feed from the
//   `app-update.yml` electron-builder writes beside the app, from
//   electron-builder.yml's `publish` (the server, which sends it on to the
//   release bucket, as the Mac's appcast).
// - A developer's build (`npm start`, `npm run package` by hand: build "0")
//   never asks.
// - The checks on this computer give a build that isn't a release a
//   stand-in feed through `SIMEON_UPDATES_FEED`, followed only to this
//   computer (as `--api=`). A release never takes it: its own feed's
//   settings carry the publisher every update must be signed by.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type KeptUpdates, readKept } from './updates'

/** A release installed on Windows: packaged, with a release's build number. */
export function releasedBuild(facts: {
  packaged: boolean
  build: string
  platform: string
}): boolean {
  return facts.packaged && facts.platform === 'win32' && /^[1-9]\d{0,8}$/.test(facts.build)
}

function loopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
}

/** The stand-in feed a check names (`SIMEON_UPDATES_FEED`): http(s) on this computer only, no name, password, query or fragment; else none. */
export function feedForChecks(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const asked = env.SIMEON_UPDATES_FEED
  if (!asked) return undefined
  let url: URL
  try {
    url = new URL(asked)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (!loopback(url.hostname)) return undefined
  if (url.username || url.password || url.search || url.hash) return undefined
  return url.origin + url.pathname.replace(/\/+$/, '')
}

/**
 * The updater's settings for a stand-in feed, in `app-update.yml`'s shape (JSON
 * is YAML): the release's own come from electron-builder.yml. S3 behind the
 * server takes one range a request, so the differential download asks for
 * them one by one.
 */
export function feedSettings(feed: string): Record<string, unknown> {
  return {
    provider: 'generic',
    url: feed,
    useMultipleRangeRequest: false,
    updaterCacheDirName: 'simeon-updater',
  }
}

/** The kept switches and last check (`updates.json` in the app's data folder); the first values when there is none. */
export function readKeptFile(file: string): KeptUpdates {
  try {
    return readKept(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return readKept(undefined)
  }
}

/** Writes them whole (a file beside, then renamed over), so a crash never leaves half a file. */
export function writeKeptFile(file: string, value: KeptUpdates): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const next = `${file}.next`
    writeFileSync(next, JSON.stringify(value))
    renameSync(next, file)
  } catch {
    // Not kept this time: the next change tries again.
  }
}
