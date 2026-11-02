// The agents and chats kept on this PC (ios/SimeonCore SavedChats.swift's
// files; what goes in them is the page's, clients/apps/app/src/core/savedChats.ts):
// `roster.json`, `layout.json`, `catalog.json`, and `chats/<id>.json` per
// chat, each replaced whole. Under the app's local folder, as the Mac keeps
// them under its caches (`%LOCALAPPDATA%\Simeon\saved-chats`, not the
// roaming `%APPDATA%`, which a company's roaming profile copies at each
// sign-in). Plain JSON, as on the Mac: the folder is this Windows
// account's own. Every read and write one after the other, so a read waits
// for the writes before it and nothing is read back that a sign-out has
// forgotten.

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const savedNames = ['roster', 'layout', 'catalog'] as const
export type SavedName = (typeof savedNames)[number]

/** The most each file may hold, as JSON (the page keeps a chat under 2,000,000 bytes of lines; a list carries the agents' pictures). */
export const savedLimits = {
  roster: 32 * 1024 * 1024,
  layout: 1024 * 1024,
  catalog: 16 * 1024 * 1024,
  chat: 4 * 1024 * 1024,
} as const

/** The longest agent's id taken. */
export const longestAgentId = 1_024

export function isSavedName(value: unknown): value is SavedName {
  return (savedNames as readonly unknown[]).includes(value)
}

/** Where they are: the app's local folder on Windows, else (a check's own data folder, another system) beside the app's data. */
export function savedChatsFolder(options: {
  dataFolder: string
  platform: string
  env: Readonly<Record<string, string | undefined>>
}): string {
  const local = options.env.LOCALAPPDATA
  if (options.platform === 'win32' && local && !options.env.SIMEON_USER_DATA)
    return path.join(local, 'Simeon', 'saved-chats')
  return path.join(options.dataFolder, 'saved-chats')
}

/** An agent's id as a file's name: its hash, so no id can name a path (`SavedChats.fileName`). */
export function savedChatFileName(agentId: string): string {
  return `${createHash('sha256').update(agentId, 'utf8').digest().subarray(0, 16).toString('hex')}.json`
}

/** An agent's id from the page: text, not empty, not too long. */
export function agentIdArgument(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > longestAgentId)
    throw new Error('An agent’s id was expected.')
  return value
}

/** A record from the page as the JSON written: an object, no larger than its file may be. */
export function recordText(value: unknown, limit: number): string {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A record is an object.')
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    throw new Error('A record is JSON.')
  }
  if (Buffer.byteLength(text, 'utf8') > limit) throw new Error('The record is too large.')
  return text
}

export class SavedChatsFolder {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(readonly folder: string) {}

  private file(name: SavedName): string {
    return path.join(this.folder, `${name}.json`)
  }

  private get chats(): string {
    return path.join(this.folder, 'chats')
  }

  private chatFile(agentId: string): string {
    return path.join(this.chats, savedChatFileName(agentId))
  }

  /** One after the other: a read waits for the writes before it. */
  private next<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  private async readJSON(file: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as unknown
    } catch {
      // None, or damaged: as none.
      return null
    }
  }

  private async writeText(file: string, text: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true })
    const next = `${file}.next`
    await writeFile(next, text, { mode: 0o600 })
    await rename(next, file)
  }

  read(): Promise<Record<SavedName, unknown>> {
    return this.next(async () => ({
      roster: await this.readJSON(this.file('roster')),
      layout: await this.readJSON(this.file('layout')),
      catalog: await this.readJSON(this.file('catalog')),
    }))
  }

  readChat(agentId: string): Promise<unknown> {
    return this.next(() => this.readJSON(this.chatFile(agentId)))
  }

  write(name: SavedName, text: string): Promise<void> {
    return this.next(() => this.writeText(this.file(name), text))
  }

  /** A chat's file, or none (null). */
  writeChat(agentId: string, text: string | null): Promise<void> {
    const file = this.chatFile(agentId)
    return this.next(() =>
      text == null ? rm(file, { force: true }) : this.writeText(file, text),
    )
  }

  /** Every chat but these agents' goes. */
  keepChats(agentIds: readonly string[]): Promise<void> {
    const kept = new Set(agentIds.map(savedChatFileName))
    return this.next(async () => {
      let names: string[]
      try {
        names = await readdir(this.chats)
      } catch {
        return
      }
      for (const name of names)
        if (!kept.has(name)) await rm(path.join(this.chats, name), { force: true })
    })
  }

  /** Signed out: all of it goes, after any write still on its way. */
  forget(): Promise<void> {
    return this.next(() => rm(this.folder, { recursive: true, force: true }))
  }

  /** Waits for what is on its way. */
  settled(): Promise<void> {
    return this.next(async () => {})
  }
}
