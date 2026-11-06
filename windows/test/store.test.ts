// The Microsoft Store package's identity (scripts/lib/store.mjs) and its
// pictures (resources/appx/, scripts/make-icon.mjs), as electron-builder
// packs them.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodePNG } from '../scripts/lib/icon.mjs'
import {
  encodeScript,
  installScript,
  psQuote,
  readStoreIdentity,
  TEST_CERTIFICATE_NAME,
  testCertificateScript,
  trustedScript,
  trustScript,
} from '../scripts/lib/store.mjs'

const windows = path.resolve(__dirname, '..')

describe('the Store’s identity', () => {
  it('is Partner Center’s once filled in, never a value in the wrong form', () => {
    const read = readStoreIdentity(readFileSync(path.join(windows, 'store.json'), 'utf8'))
    if (!('identity' in read)) expect(read.wrong).toEqual([])
  })

  it('says what to fill in while it is empty', () => {
    const empty = JSON.stringify({ identityName: '', publisher: '', publisherDisplayName: '' })
    expect(readStoreIdentity(empty)).toEqual({ missing: ['identityName', 'publisher', 'publisherDisplayName'], wrong: [] })
  })

  it('takes Partner Center’s three values', () => {
    const text = JSON.stringify({
      identityName: ' ExampleCo.Simeon ',
      publisher: 'CN=1A2B3C4D-0000-1111-2222-333344445555',
      publisherDisplayName: 'Example Co.',
    })
    expect(readStoreIdentity(text)).toEqual({
      identity: {
        identityName: 'ExampleCo.Simeon',
        publisher: 'CN=1A2B3C4D-0000-1111-2222-333344445555',
        publisherDisplayName: 'Example Co.',
      },
    })
  })

  it('refuses what Partner Center doesn’t write there', () => {
    const text = JSON.stringify({
      identityName: 'Example Co Simeon',
      publisher: 'Example Co.',
      publisherDisplayName: 'Example Co.',
    })
    expect(readStoreIdentity(text)).toEqual({ missing: [], wrong: ['identityName', 'publisher'] })
    expect(readStoreIdentity('not json')).toEqual({ missing: [], wrong: ['store.json is not JSON'] })
  })
})

describe('the test copy for this PC (--test)', () => {
  const publisher = 'CN=95811681-55B1-49D5-8542-DCC11BB21E65'
  const thumbprint = 'A'.repeat(40)
  const decode = (base64: string) => Buffer.from(base64, 'base64').toString('utf16le')

  it('quotes for PowerShell, and encodes a script whole', () => {
    expect(psQuote("C:\\Users\\O'Neil\\x.cer")).toBe("'C:\\Users\\O''Neil\\x.cer'")
    const script = "Write-Output 'a b'\nWrite-Output \"c\""
    expect(decode(encodeScript(script))).toBe(script)
  })

  it('makes the certificate once, for the Store’s publisher exactly, for code signing only', () => {
    const script = testCertificateScript(publisher)
    expect(script).toContain(`$subject = '${publisher}'`)
    expect(script).toContain(`-FriendlyName '${TEST_CERTIFICATE_NAME}'`)
    expect(script).toContain("Get-ChildItem 'Cert:\\CurrentUser\\My'")
    expect(script).toContain("-TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')")
    expect(script).toMatch(/\$_\.HasPrivateKey/)
    expect(script.split('\n').at(-1)).toBe('Write-Output $cert.Thumbprint')
  })

  it('trusts it on this PC only after Windows asks, and installs over an earlier test copy', () => {
    expect(trustedScript(thumbprint)).toBe(`Test-Path 'Cert:\\LocalMachine\\TrustedPeople\\${thumbprint}'`)
    const trust = trustScript(thumbprint, 'C:\\Users\\Staff\\AppData\\Local\\Temp\\simeon-store-test.cer')
    expect(trust).toContain(`Export-Certificate -Cert 'Cert:\\CurrentUser\\My\\${thumbprint}'`)
    const encoded = trust.match(/-EncodedCommand ([A-Za-z0-9+/=]+)'/)?.[1] ?? ''
    expect(trust).toContain("Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait")
    expect(decode(encoded)).toContain(
      "Import-Certificate -FilePath 'C:\\Users\\Staff\\AppData\\Local\\Temp\\simeon-store-test.cer' -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPeople'",
    )
    expect(installScript('C:\\x\\Simeon-Store-0.1.0-test.appx')).toContain(
      "Add-AppxPackage -Path 'C:\\x\\Simeon-Store-0.1.0-test.appx' -ForceApplicationShutdown -ForceUpdateFromAnyVersion",
    )
  })
})

describe('the Store’s pictures', () => {
  const folder = path.join(windows, 'resources/appx')
  const size = (name: string) => {
    const image = decodePNG(readFileSync(path.join(folder, name)))
    return [image.width, image.height]
  }

  it('are there at each size electron-builder and Windows ask for', () => {
    const names = readdirSync(folder)
    for (const base of ['Square44x44Logo', 'Square150x150Logo', 'Wide310x150Logo', 'StoreLogo'])
      expect(names.some((name) => name.startsWith(`${base}.`)), base).toBe(true)
    expect(size('Square44x44Logo.scale-100.png')).toEqual([44, 44])
    expect(size('Square44x44Logo.scale-200.png')).toEqual([88, 88])
    expect(size('Square44x44Logo.targetsize-256_altform-unplated.png')).toEqual([256, 256])
    expect(size('StoreLogo.scale-100.png')).toEqual([50, 50])
    expect(size('Square150x150Logo.scale-200.png')).toEqual([300, 300])
    expect(size('Wide310x150Logo.scale-100.png')).toEqual([310, 150])
  })

  it('are the icon itself, the tiles with it in their middle on a clear ground', () => {
    const tile = decodePNG(readFileSync(path.join(folder, 'Square150x150Logo.scale-100.png')))
    const at = (x: number, y: number) => tile.rgba[(y * 150 + x) * 4 + 3]
    expect(at(2, 2)).toBe(0)
    expect(at(75, 75)).toBe(255)
    // The same 44 as the icon file's own drawing at 44.
    const icon = decodePNG(readFileSync(path.join(folder, 'Square44x44Logo.scale-100.png')))
    expect(icon.rgba[(22 * 44 + 2) * 4 + 3]).toBe(255)
    expect(icon.rgba[3]).toBe(0)
  })
})
