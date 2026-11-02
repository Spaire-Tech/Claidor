// The app's two logs in its data folder (`%APPDATA%\Simeon`), as the Mac
// keeps them in `~/Library/Application Support/Simeon`:
//
// - `computer-stream.log` (mac/Simeon/ComputerPreview.swift,
//   `ComputerStreamLog`): emptied at each launch, its first line where it
//   is, then a line per step of the screens' connections.
// - `voice-call.log` (ios/Simeon/Voice.swift, `VoiceCallLog`): a line per
//   step of a call, appended, its runs of white space as one, and echoed
//   to the console as `[simeon] voice-call …`.
//
// Each line starts with its time (ISO 8601 with milliseconds). A report
// reads their last 256 KB each (`MacFeedback.logFiles`). The page's lines
// carry no token (they are scrubbed again in a report's diagnostics).

import { appendFile, mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const logNames = ['computer-stream.log', 'voice-call.log'] as const
export type LogName = (typeof logNames)[number]

/** What a report reads of each log: its last 256 KB. */
export const logTail = 256 * 1024
/** The longest line the page may write; the rest is cut. */
export const longestLogLine = 16 * 1024

export function isLogName(value: unknown): value is LogName {
  return (logNames as readonly unknown[]).includes(value)
}

/** A log's line as it is written: its time first; the call's log on one line with single spaces, the screens' on one line. */
export function stampedLine(name: LogName, line: string, now: Date): string {
  const cut = line.slice(0, longestLogLine)
  const words =
    name === 'voice-call.log'
      ? cut.split(/\s+/).filter((word) => word !== '').join(' ')
      : cut.replace(/[\r\n]+/g, ' ')
  return `${now.toISOString()} ${words}\n`
}

export class AppLogs {
  /** The writes to each file, one after the other. */
  private queues = new Map<LogName, Promise<void>>()

  constructor(
    private readonly folder: string,
    private readonly now: () => Date = () => new Date(),
    private readonly echo: (text: string) => void = (text) =>
      void process.stderr.write(text),
  ) {}

  file(name: LogName): string {
    return path.join(this.folder, name)
  }

  private queue(name: LogName, task: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(name) ?? Promise.resolve())
      .then(task)
      .catch(() => {
        // A full disk, a locked file: the line is lost, the app goes on.
      })
    this.queues.set(name, next)
    return next
  }

  /** At launch: the screens' log emptied, and where it is said in its first line. */
  startStreamLog(): Promise<void> {
    const name = 'computer-stream.log'
    return this.queue(name, async () => {
      await mkdir(this.folder, { recursive: true })
      await writeFile(
        this.file(name),
        stampedLine(name, `computer stream log at ${this.file(name)}`, this.now()),
      )
    })
  }

  write(name: LogName, line: string): Promise<void> {
    if (name === 'voice-call.log') this.echo(`[simeon] voice-call ${line}\n`)
    return this.queue(name, async () => {
      await mkdir(this.folder, { recursive: true })
      await appendFile(this.file(name), stampedLine(name, line, this.now()))
    })
  }

  /** Each log's last 256 KB, the screens' first, as the Mac's report reads them; an empty or missing one is left out. */
  async readTails(): Promise<{ name: LogName; text: string }[]> {
    const tails: { name: LogName; text: string }[] = []
    for (const name of logNames) {
      await this.queues.get(name)
      let handle
      try {
        handle = await open(this.file(name), 'r')
      } catch {
        continue
      }
      try {
        const { size } = await handle.stat()
        if (size === 0) continue
        const length = Math.min(size, logTail)
        const bytes = Buffer.alloc(length)
        await handle.read(bytes, 0, length, size - length)
        tails.push({ name, text: new TextDecoder().decode(bytes) })
      } finally {
        await handle.close()
      }
    }
    return tails
  }
}
