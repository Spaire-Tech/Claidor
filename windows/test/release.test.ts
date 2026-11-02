// What a Windows release writes (scripts/lib/release.mjs), from the Mac's
// release (mac/scripts/release.sh) and what reads it: electron-updater's
// feed (read here with the YAML reader electron-updater itself uses) and the
// server (server/simeon/desktop/releases.py).

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  feedSha512,
  feedText,
  installerName,
  isVersion,
  platform,
  releaseRecord,
  signingConfigured,
  uploads,
} from '../scripts/lib/release.mjs'

const require = createRequire(import.meta.url)
// electron-updater's own reader of the feed (a dependency of it).
const yaml = require('js-yaml') as { load(text: string): unknown }

const feed = 'https://api.simeonlabs.com/desktop/download/windows'

describe('a Windows release', () => {
  it('names the installer as electron-builder.yml does', () => {
    expect(installerName('0.2.0')).toBe('Simeon-Setup-0.2.0.exe')
    expect(platform).toBe('win32-x64')
  })

  it('takes a version the updater can compare', () => {
    for (const ok of ['0.1.0', '1.20.300', '0.2.0-beta.1']) expect(isVersion(ok), ok).toBe(true)
    for (const no of ['0.1', 'v0.1.0', '0.1.0 ', '0.1.0/..', '', undefined]) expect(isVersion(no), String(no)).toBe(false)
  })

  it('signs only when a certificate is given through the environment', () => {
    expect(signingConfigured({})).toBe(false)
    expect(signingConfigured({ WIN_CSC_LINK: '' })).toBe(false)
    expect(signingConfigured({ WIN_CSC_LINK: '  ' })).toBe(false)
    expect(signingConfigured({ WIN_CSC_LINK: 'C:\\certs\\simeon.pfx' })).toBe(true)
    expect(signingConfigured({ CSC_LINK: 'MIIK…' })).toBe(true)
  })

  it('writes the feed electron-updater reads; beside the folders it names the version’s folder, which the server sends on', () => {
    const facts = { version: '0.2.0', sha512: 'c2hh+NTEy/w==', size: 123_456, releaseDate: '2026-11-02T21:00:00.000Z' }
    const inside = yaml.load(feedText(facts)) as Record<string, unknown>
    expect(inside).toEqual({
      version: '0.2.0',
      files: [{ url: 'Simeon-Setup-0.2.0.exe', sha512: 'c2hh+NTEy/w==', size: 123_456 }],
      path: 'Simeon-Setup-0.2.0.exe',
      sha512: 'c2hh+NTEy/w==',
      releaseDate: '2026-11-02T21:00:00.000Z',
    })
    const pointer = yaml.load(feedText({ ...facts, folder: '0.2.0' })) as {
      files: { url: string }[]
      path: string
    }
    expect(pointer.path).toBe('0.2.0/Simeon-Setup-0.2.0.exe')
    // electron-updater resolves a file against the feed's folder (its `newBaseUrl`).
    const url = new URL(pointer.files[0]?.url ?? '', `${feed}/`)
    expect(url.href).toBe(`${feed}/0.2.0/Simeon-Setup-0.2.0.exe`)
    expect(feedSha512(feedText(facts))).toBe('c2hh+NTEy/w==')
  })

  it('writes the record in the Mac’s shape, with what the server reads', () => {
    const record = releaseRecord({
      version: '0.2.0',
      build: '4210',
      commit: 'a'.repeat(40),
      pubDate: '2026-11-02T21:00:00.000Z',
      folderUrl: 'https://bucket.example/releases/win32-x64/0.2.0',
      signed: true,
      exe: { sha256: 'e'.repeat(64), size: 10 },
      blockmap: { sha256: 'b'.repeat(64), size: 2 },
    })
    expect(record).toEqual({
      version: '0.2.0',
      build: '4210',
      commit: 'a'.repeat(40),
      platform: 'win32-x64',
      minimum_windows: '10',
      pub_date: '2026-11-02T21:00:00.000Z',
      signed: true,
      exe: { url: 'https://bucket.example/releases/win32-x64/0.2.0/Simeon-Setup-0.2.0.exe', sha256: 'e'.repeat(64), size: 10 },
      blockmap: {
        url: 'https://bucket.example/releases/win32-x64/0.2.0/Simeon-Setup-0.2.0.exe.blockmap',
        sha256: 'b'.repeat(64),
        size: 2,
      },
    })
  })

  it('uploads the version’s folder first, and the two pointers last, not cached', () => {
    const plan = uploads({ version: '0.2.0', s3: 's3://bucket/releases' })
    expect(plan.folder.map((u) => u.to)).toEqual([
      's3://bucket/releases/win32-x64/0.2.0/Simeon-Setup-0.2.0.exe',
      's3://bucket/releases/win32-x64/0.2.0/Simeon-Setup-0.2.0.exe.blockmap',
      's3://bucket/releases/win32-x64/0.2.0/release.json',
      's3://bucket/releases/win32-x64/0.2.0/latest.yml',
    ])
    expect(plan.folder.every((u) => !u.noCache)).toBe(true)
    expect(plan.checked).toEqual(['Simeon-Setup-0.2.0.exe', 'Simeon-Setup-0.2.0.exe.blockmap'])
    expect(plan.pointers).toEqual([
      { file: '../latest.yml', to: 's3://bucket/releases/win32-x64/latest.yml', type: 'text/yaml', noCache: true },
      { file: '../latest.json', to: 's3://bucket/releases/win32-x64/latest.json', type: 'application/json', noCache: true },
    ])
  })
})
