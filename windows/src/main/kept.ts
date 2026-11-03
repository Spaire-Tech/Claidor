// What the page keeps on the device: the session's pair and the computer's
// address (contract.ts, `keptKeys`), as the Mac keeps them in its Keychain
// (mac/Simeon/MacSession.swift, ios/SimeonCore SavedGateway.swift). Each is
// sealed with Windows' own protection for the signed-in person
// (`safeStorage`, DPAPI) and written to the app's data folder, one file a
// key, replaced whole. Where nothing can seal (a Linux without a keyring),
// nothing is written: the values live until the app quits.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type KeptKey, keptKeys } from '../../../clients/apps/app/src/desktop/contract'

/** Windows' protection (`safeStorage` in the app; a stand-in in the tests). */
export interface Sealer {
  available(): boolean
  seal(text: string): Buffer
  open(sealed: Buffer): string
}

export function isKeptKey(key: unknown): key is KeptKey {
  return typeof key === 'string' && (keptKeys as readonly string[]).includes(key)
}

export class KeptValues {
  private readonly memory = new Map<KeptKey, string>()

  constructor(
    private readonly folder: string,
    private readonly sealer: Sealer,
  ) {}

  private file(key: KeptKey): string {
    return path.join(this.folder, `${key}.sealed`)
  }

  /** Every kept value that can be read; a file that no longer opens (another Windows account, a damaged copy) is dropped. */
  readAll(): Partial<Record<KeptKey, string>> {
    const values: Partial<Record<KeptKey, string>> = {}
    for (const key of keptKeys) {
      const value = this.read(key)
      if (value != null) values[key] = value
    }
    return values
  }

  read(key: KeptKey): string | undefined {
    if (!this.sealer.available()) return this.memory.get(key)
    let sealed: Buffer
    try {
      sealed = readFileSync(this.file(key))
    } catch {
      return undefined
    }
    try {
      return this.sealer.open(sealed)
    } catch {
      rmSync(this.file(key), { force: true })
      return undefined
    }
  }

  /** Keeps a value, or forgets it (null). */
  write(key: KeptKey, value: string | null): void {
    if (!this.sealer.available()) {
      if (value == null) this.memory.delete(key)
      else this.memory.set(key, value)
      return
    }
    const file = this.file(key)
    if (value == null) {
      rmSync(file, { force: true })
      return
    }
    mkdirSync(this.folder, { recursive: true })
    const next = `${file}.next`
    writeFileSync(next, this.sealer.seal(value), { mode: 0o600 })
    renameSync(next, file)
  }
}
