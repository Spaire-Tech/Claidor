// Whether an installer is signed by Simeon's company, as Windows itself says
// (Authenticode, `Get-AuthenticodeSignature`), judged the same way by the
// installed app before it runs an update (src/main/updates/engine.ts) and by
// the release before anything goes up (scripts/release.mjs). In Sparkle's
// place on the Mac (its EdDSA check): any doubt is a refusal. PowerShell
// missing or blocked, a timeout, a word on its error stream, an answer of
// another shape, a status other than Valid, another file, another signer:
// each refuses.
//
// The signer is matched on the certificate's whole subject (every part: CN,
// O, L, S, C…), never on the common name alone, which any company of that
// name anywhere could get a certificate for.

import { execFile, spawnSync } from 'node:child_process'
import path from 'node:path'

/** How long Windows may take to answer. */
export const signatureTimeoutMs = 20_000

/**
 * A certificate subject's parts, as Windows writes it (`X500DistinguishedName`):
 * `CN="Example, Inc.", O="Example, Inc.", L=…, S=…, C=US`, a value with a
 * comma in quotes (a quote in it doubled). Keys upper case. Undefined when
 * it isn't one: a part without `=`, a key twice, an unclosed quote.
 */
export function subjectParts(subject) {
  if (typeof subject !== 'string' || subject.trim() === '') return undefined
  const parts = new Map()
  let i = 0
  const text = subject
  while (i < text.length) {
    while (text[i] === ' ') i++
    const equals = text.indexOf('=', i)
    if (equals < 0) return undefined
    const key = text.slice(i, equals).trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9.]*$/.test(key) || parts.has(key)) return undefined
    i = equals + 1
    while (text[i] === ' ') i++
    let value = ''
    if (text[i] === '"') {
      i++
      for (;;) {
        if (i >= text.length) return undefined
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            value += '"'
            i += 2
            continue
          }
          i++
          break
        }
        value += text[i++]
      }
      while (text[i] === ' ') i++
      if (i < text.length && text[i] !== ',') return undefined
    } else {
      const comma = text.indexOf(',', i)
      value = (comma < 0 ? text.slice(i) : text.slice(i, comma)).trim()
      if (value.includes('"')) return undefined
      i = comma < 0 ? text.length : comma
    }
    parts.set(key, value)
    if (text[i] === ',') i++
  }
  return parts.size > 0 ? parts : undefined
}

/** A subject named in full: at least the company's name (CN), its organisation (O) and its country (C). */
export function fullSubject(subject) {
  const parts = subjectParts(subject)
  return parts !== undefined && ['CN', 'O', 'C'].every((key) => (parts.get(key) ?? '') !== '')
}

/** The same subject: every part the same, none more, none fewer (in any order). */
export function sameSubject(a, b) {
  const left = subjectParts(a)
  const right = subjectParts(b)
  if (!left || !right || left.size !== right.size) return false
  for (const [key, value] of left) if (right.get(key) !== value) return false
  return true
}

/** Windows' own PowerShell, from Windows' folder (never one found first on PATH). */
export function powershellPath(env = process.env) {
  const windows = env.SystemRoot || env.windir || 'C:\\Windows'
  return path.win32.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** What PowerShell is asked: the file's signature as one JSON line (encoded, so nothing in the path is read as a command). */
export function signatureArguments(file) {
  const quoted = String(file).replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$s = Get-AuthenticodeSignature -LiteralPath '${quoted}'`,
    '[pscustomobject]@{ Status = [int]$s.Status; Path = [string]$s.Path; Subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress',
  ].join('; ')
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}

function samePath(a, b) {
  const plain = (value) => String(value).replace(/\//g, '\\').toLowerCase()
  return plain(a) === plain(b)
}

/**
 * The verdict on PowerShell's answer: null when `file` is signed, validly, by
 * one of `signers` (each a whole subject); else why not, in a few words for
 * the updates' log (no secret is in any of it).
 */
export function judgeSignature(answer, file, signers) {
  if (!Array.isArray(signers) || signers.length === 0 || !signers.every(fullSubject))
    return 'no signer in full is known to this build'
  if (answer.error) return `Windows could not check the signature (${String(answer.error.code ?? answer.error.message ?? answer.error).slice(0, 80)})`
  if (String(answer.stderr ?? '').trim() !== '') return 'Windows said something unexpected while checking the signature'
  let said
  try {
    said = JSON.parse(String(answer.stdout ?? '').trim())
  } catch {
    return 'Windows gave no signature to judge'
  }
  if (typeof said !== 'object' || said == null || Array.isArray(said)) return 'Windows gave no signature to judge'
  if (said.Status !== 0) return `the signature is not valid (status ${String(said.Status).slice(0, 12)})`
  if (typeof said.Path !== 'string' || !samePath(said.Path, file)) return 'Windows judged another file'
  if (typeof said.Subject !== 'string' || !signers.some((signer) => sameSubject(signer, said.Subject)))
    return 'the installer is signed by someone else'
  return null
}

/** Asks Windows, and judges: null when signed by one of `signers`, else why not. Never throws. */
export function checkSignature(file, signers, { program = powershellPath(), args = signatureArguments(file) } = {}) {
  return new Promise((done) => {
    try {
      execFile(program, args, { shell: false, windowsHide: true, timeout: signatureTimeoutMs, encoding: 'utf8' }, (error, stdout, stderr) =>
        done(judgeSignature({ error, stdout, stderr }, file, signers)),
      )
    } catch (error) {
      done(judgeSignature({ error }, file, signers))
    }
  })
}

/** The same, waiting for the answer (as the app quits, and at a launch before the window). */
export function checkSignatureNow(file, signers, { program = powershellPath(), args = signatureArguments(file) } = {}) {
  let ran
  try {
    ran = spawnSync(program, args, { shell: false, windowsHide: true, timeout: signatureTimeoutMs, encoding: 'utf8' })
  } catch (error) {
    return judgeSignature({ error }, file, signers)
  }
  const error = ran.error ?? (ran.status !== 0 ? { code: ran.signal ?? `exit ${ran.status}` } : undefined)
  return judgeSignature({ error, stdout: ran.stdout, stderr: ran.stderr }, file, signers)
}
