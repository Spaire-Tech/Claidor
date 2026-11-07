// Whether an installer is the company's (scripts/lib/signature.mjs), as the
// installed app and the release judge it: the certificate's whole subject,
// and any doubt a refusal. Windows' own check can't run here; what can is
// run for real: a program that isn't there, one that answers wrong, one
// that writes on its error stream, each refused.

import { describe, expect, it } from 'vitest'
import { signers, signersReady } from '../scripts/lib/release.mjs'
import {
  checkSignature,
  checkSignatureNow,
  fullSubject,
  judgeSignature,
  powershellPath,
  sameSubject,
  signatureArguments,
  subjectParts,
} from '../scripts/lib/signature.mjs'

const signer = 'CN="Example Signer, Inc.", O="Example Signer, Inc.", L=Wilmington, S=Delaware, C=US'
const file = 'C:\\Users\\Jane\\AppData\\Local\\simeon-updater\\pending\\Simeon-Setup-0.2.0.exe'
const said = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: '' })
const valid = { Status: 0, Path: file, Subject: signer }

describe('a certificate’s subject', () => {
  it('is read part by part, as Windows writes it', () => {
    expect([...(subjectParts(signer) ?? [])]).toEqual([
      ['CN', 'Example Signer, Inc.'],
      ['O', 'Example Signer, Inc.'],
      ['L', 'Wilmington'],
      ['S', 'Delaware'],
      ['C', 'US'],
    ])
    expect(subjectParts('CN="A ""B"" C", c=us')?.get('CN')).toBe('A "B" C')
    expect(subjectParts('cn=x,o=y')?.get('O')).toBe('y')
    for (const no of ['', 'Example Signer, Inc.', 'CN="open', 'CN=a, CN=b', 'CN="a" b', 'CN=a"b', '=x', 42])
      expect(subjectParts(no), String(no)).toBeUndefined()
  })

  it('is in full with its name, organisation and country; the common name alone never is', () => {
    expect(fullSubject(signer)).toBe(true)
    expect(fullSubject('CN="Example Signer, Inc."')).toBe(false)
    expect(fullSubject('CN="Example Signer, Inc.", O="Example Signer, Inc."')).toBe(false)
    expect(fullSubject('Example Signer, Inc.')).toBe(false)
  })

  it('is the same only with every part the same, in any order', () => {
    expect(sameSubject(signer, 'C=US, S=Delaware, L=Wilmington, O="Example Signer, Inc.", CN="Example Signer, Inc."')).toBe(true)
    expect(sameSubject(signer, 'CN="Example Signer, Inc.", O="Example Signer, Inc.", L=Dover, S=Delaware, C=US')).toBe(false)
    expect(sameSubject(signer, `${signer}, SERIALNUMBER=1`)).toBe(false)
    expect(sameSubject(signer, 'CN="Example Signer, Inc."')).toBe(false)
    // The same, though not in full: the verdict refuses such a signer (below).
    expect(sameSubject('CN="Example Signer, Inc."', 'CN="Example Signer, Inc."')).toBe(true)
  })
})

describe('the release’s signers', () => {
  it('are none until the company’s certificate exists: no release is signed, none updates itself', () => {
    expect(signers).toEqual([])
    expect(signersReady(signers)).toBe(false)
    expect(signersReady([signer])).toBe(true)
    expect(signersReady(['CN="Example Signer, Inc."'])).toBe(false)
  })
})

describe('Windows is asked', () => {
  it('with its own PowerShell, from Windows’ folder, never one first on PATH', () => {
    expect(powershellPath({ SystemRoot: 'D:\\Win' })).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(powershellPath({})).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })

  it('a command nothing in the path can change (encoded, the path’s quotes doubled)', () => {
    const args = signatureArguments("C:\\Users\\O'Brien\\x.exe")
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const script = Buffer.from(args[3] ?? '', 'base64').toString('utf16le')
    expect(script).toContain("Get-AuthenticodeSignature -LiteralPath 'C:\\Users\\O''Brien\\x.exe'")
    expect(script).toContain("$ErrorActionPreference = 'Stop'")
    expect(script).toContain('ConvertTo-Json -Compress')
  })
})

describe('the verdict', () => {
  it('accepts only a valid signature, on this file, by a signer named in full', () => {
    expect(judgeSignature(said(valid), file, [signer])).toBeNull()
    expect(judgeSignature(said({ ...valid, Path: file.toUpperCase().replace(/\\/g, '/') }), file, [signer])).toBeNull()
  })

  it('refuses on any doubt', () => {
    const cases: [string, Parameters<typeof judgeSignature>[0], string[]][] = [
      ['no signer known', said(valid), []],
      ['a signer by its common name', said(valid), ['Example Signer, Inc.']],
      ['PowerShell blocked', { error: { code: 'EACCES' } }, [signer]],
      ['PowerShell missing', { error: { code: 'ENOENT' } }, [signer]],
      ['a timeout', { error: { code: 'ETIMEDOUT' }, stdout: '' }, [signer]],
      ['a word on its error stream', { stdout: JSON.stringify(valid), stderr: 'Access denied' }, [signer]],
      ['no answer', { stdout: '' }, [signer]],
      ['an answer of another shape', { stdout: '[1]' }, [signer]],
      ['not signed', said({ ...valid, Status: 2 }), [signer]],
      ['an untrusted chain', said({ ...valid, Status: 4 }), [signer]],
      ['a status as words', said({ ...valid, Status: 'Valid' }), [signer]],
      ['another file', said({ ...valid, Path: 'C:\\x.exe' }), [signer]],
      ['no certificate', said({ ...valid, Subject: '' }), [signer]],
      ['the same common name, another company', said({ ...valid, Subject: 'CN="Example Signer, Inc.", O="Example Signer, Inc.", L=Paris, C=FR' }), [signer]],
    ]
    for (const [what, answer, list] of cases) expect(judgeSignature(answer, file, list), what).not.toBeNull()
  })
})

describe('asked for real (Windows’ check itself can’t run here)', () => {
  const node = process.execPath
  const program = (code: string) => ({ program: node, args: ['-e', code] })
  const answering = `process.stdout.write(${JSON.stringify(JSON.stringify(valid))})`

  it('an answer in the right shape is judged (a stand-in program in PowerShell’s place)', async () => {
    expect(await checkSignature(file, [signer], program(answering))).toBeNull()
    expect(checkSignatureNow(file, [signer], program(answering))).toBeNull()
  })

  it('a PowerShell that isn’t there, fails, or speaks on its error stream: refused', async () => {
    for (const asking of [
      { program: '/nowhere/powershell.exe' },
      program(`${answering}; process.exit(1)`),
      program(`${answering}; process.stderr.write('blocked by policy')`),
      program('process.stdout.write("not json")'),
    ]) {
      expect(await checkSignature(file, [signer], asking), asking.program).not.toBeNull()
      expect(checkSignatureNow(file, [signer], asking), asking.program).not.toBeNull()
    }
    // Node started six times: 7.4 s on the Dell.
  }, 30_000)

  it('off Windows, the real ask refuses (no Windows PowerShell here)', async () => {
    if (process.platform === 'win32') return
    expect(await checkSignature(file, [signer])).toMatch(/Windows could not check the signature/)
    expect(checkSignatureNow(file, [signer])).toMatch(/Windows could not check the signature/)
  })
})
