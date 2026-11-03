// `updates.log` in the app's data folder (`%APPDATA%\Simeon`), beside 7b's
// `computer-stream.log` and `voice-call.log` and in their form: each line its
// time (ISO 8601 with milliseconds), then what the updater did (a check and
// its answer, a download, a signature refused, an install started or not)
// and electron-updater's own lines. The Mac's Sparkle writes to Console; a
// report reads its last 256 KB, as the other two (7b's `logNames`).
//
// Nothing secret goes in: the feed and the bucket need no token. The
// person's own folder in a path is written `~`, so no line names them.

import { appendFileSync, mkdirSync, openSync, readSync, closeSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const updatesLogName = 'updates.log'
/** The longest line; the rest is cut. */
export const longestUpdatesLine = 2_048
/** Past 5 MB at a launch, its newest 1 MB is kept (7b's rule for the call's log). */
export const longestUpdatesLog = 5 * 1024 * 1024
export const updatesLogKept = 1024 * 1024

/** A line as written: one line, single spaces, the person's folder as `~`, cut. */
export function scrubbed(line: string, home: string = os.homedir()): string {
  let text = String(line)
  if (home && home.length > 1) {
    for (const form of new Set([home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')]))
      text = text.split(form).join('~')
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, longestUpdatesLine)
}

export class UpdatesLog {
  readonly file: string

  constructor(
    folder: string,
    private readonly now: () => Date = () => new Date(),
    private readonly home: string = os.homedir(),
  ) {
    this.file = path.join(folder, updatesLogName)
    this.trim()
  }

  /** Appends a line; a full disk or a locked file loses it, the app goes on. */
  write(line: string): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true })
      appendFileSync(this.file, `${this.now().toISOString()} ${scrubbed(line, this.home)}\n`)
    } catch {
      // Lost.
    }
  }

  /** At launch: past `longestUpdatesLog`, its newest `updatesLogKept` from a line's start. */
  private trim(): void {
    try {
      const size = statSync(this.file).size
      if (size <= longestUpdatesLog) return
      const kept = Buffer.alloc(updatesLogKept)
      const handle = openSync(this.file, 'r')
      try {
        readSync(handle, kept, 0, updatesLogKept, size - updatesLogKept)
      } finally {
        closeSync(handle)
      }
      writeFileSync(this.file, kept.subarray(kept.indexOf(0x0a) + 1))
    } catch {
      // None yet, or unreadable: left as it is.
    }
  }
}
