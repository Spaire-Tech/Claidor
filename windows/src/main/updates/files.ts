// The installer waiting on disk: where electron-updater keeps it, and its
// bytes' sha512, checked again before it runs (engine.ts `vetNow`).

import { createHash } from 'node:crypto'
import { closeSync, openSync, readSync } from 'node:fs'
import path from 'node:path'
import { installerName } from '../../../scripts/lib/release.mjs'

/** A file's sha512 in base64, read a piece at a time. */
export function sha512Of(file: string): string {
  const hash = createHash('sha512')
  const piece = Buffer.alloc(1024 * 1024)
  const handle = openSync(file, 'r')
  try {
    for (;;) {
      const read = readSync(handle, piece, 0, piece.length, null)
      if (read === 0) break
      hash.update(piece.subarray(0, read))
    }
  } finally {
    closeSync(handle)
  }
  return hash.digest('base64')
}

/** Whether `file` is where electron-updater keeps `version`'s installer: its cache's `pending` folder, the installer's own name. */
export function inPending(file: string, version: string, cache: string, platform: string = process.platform): boolean {
  const expected = path.join(cache, 'pending', installerName(version))
  const plain = (value: string) => {
    const resolved = path.resolve(value)
    return platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  return plain(file) === plain(expected)
}

