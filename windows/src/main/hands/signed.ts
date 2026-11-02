// The hands' own files, the setting and the "Allow once" answers, made so
// an edit shows: each is written with a signature (HMAC-SHA256) made with
// a key of this app's, kept sealed by Windows for the signed-in person
// (`safeStorage`, as the page's kept values, ../kept.ts). A file whose
// signature doesn't verify is read as nothing: the setting as "Ask every
// time", no answers. The app reads each file once, when it starts, and
// keeps what it holds in memory from then on, so a file changed while it
// runs changes nothing until the next start.
//
// What a program of the same person can still do: the files and the key
// are in the app's data folder, which the hands refuse to touch by its
// names, and a name can be built so the guard doesn't see it
// (sensitivePaths.ts); Windows opens the sealed key for any program of
// that person (DPAPI, through the key Electron keeps in its `Local
// State`), so a program written for it can sign a file of its own, or put
// back a copy of an earlier one, which counts at the next start; and it
// can change the app itself, or anything else that person can. The Mac
// has the same bound (its defaults and `~/.simeon` can be written by any
// program of the person's). What this stops is a plain edit of the JSON,
// by hand or by a command that writes it.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Sealer } from '../kept'

/** The key the files are signed with: made once, sealed in the data folder; where nothing can seal, made for this run only. */
export class SigningKey {
  private key?: Buffer

  constructor(
    readonly file: string | undefined,
    private readonly sealer: Sealer | undefined,
    private readonly log: (line: string) => void = () => {},
  ) {}

  /** A key for this run only (the checks; a PC where nothing seals). */
  static forThisRun(): SigningKey {
    return new SigningKey(undefined, undefined)
  }

  get value(): Buffer {
    this.key ??= this.read() ?? this.make()
    return this.key
  }

  private canSeal(): boolean {
    try {
      return this.file != null && this.sealer != null && this.sealer.available()
    } catch {
      return false
    }
  }

  private read(): Buffer | undefined {
    if (!this.canSeal() || !this.file || !this.sealer) return undefined
    let sealed: Buffer
    try {
      sealed = readFileSync(this.file)
    } catch {
      return undefined
    }
    try {
      const hex = this.sealer.open(sealed)
      if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex')
    } catch {
      // Another Windows account's, or damaged: a new key, the files read as nothing.
    }
    this.log('[local-tools] the signing key did not open; a new one is made, the setting starts again from Ask')
    return undefined
  }

  private make(): Buffer {
    const key = randomBytes(32)
    if (!this.canSeal() || !this.file || !this.sealer) {
      if (this.file) this.log('[local-tools] nothing can seal the signing key on this PC: the setting holds until the app quits')
      return key
    }
    try {
      mkdirSync(path.dirname(this.file), { recursive: true })
      const next = `${this.file}.next`
      writeFileSync(next, this.sealer.seal(key.toString('hex')), { mode: 0o600 })
      renameSync(next, this.file)
    } catch {
      this.log('[local-tools] the signing key was not kept: the setting holds until the app quits')
    }
    return key
  }
}

interface Signed {
  v: 1
  body: string
  mac: string
}

function signature(key: Buffer, purpose: string, body: string): Buffer {
  return createHmac('sha256', key).update(`${purpose}\n${body}`, 'utf8').digest()
}

/** What a signed file holds, when its signature is this app's for this purpose; undefined when it is missing, edited or another file's. */
export function readSigned(file: string, key: SigningKey, purpose: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed == null) return undefined
  const { v, body, mac } = parsed as Partial<Signed>
  if (v !== 1 || typeof body !== 'string' || typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return undefined
  const expected = signature(key.value, purpose, body)
  if (!timingSafeEqual(expected, Buffer.from(mac, 'hex'))) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Written whole, signed, to a file beside it, then moved over it; false when it could not be kept. */
export function writeSigned(file: string, key: SigningKey, purpose: string, value: unknown): boolean {
  const body = JSON.stringify(value)
  const signed: Signed = { v: 1, body, mac: signature(key.value, purpose, body).toString('hex') }
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify(signed), { mode: 0o600 })
    renameSync(temp, file)
    return true
  } catch {
    return false
  }
}

export function removeSigned(file: string): void {
  try {
    rmSync(file, { force: true })
  } catch {
    // Left: what it holds no longer counts once memory says otherwise.
  }
}
