// The agents and their chats as this device last saw them, kept between
// launches (ios/SimeonCore/Sources/SimeonCore/SavedChats.swift; 26 October
// 2026, the founder: the app showed nothing, or "Reconnecting", whenever the
// computer slept or was updated). At launch the list shows them at once, and
// a chat its lines at once when it opens; the computer's own copy replaces
// them when it answers (the store's "Step 7b" section). The pins and the
// sections (folders) are kept too, and the connectors' catalogue.
//
// Only in the Windows app, as on the Mac: the files are in the app's own
// folder on this PC, written by its main process (windows/src/main/session/).
// The web keeps nothing of the person's chats in the browser (PROGRESS.md,
// 1 November 2026). One account's: signing out forgets them, and a copy kept
// for another account is never shown. One file for the list and one per
// chat, each written only when it changed.
//
// The Mac reads its files as it needs them; a page can't read a file at
// once, so the list, the layout and the catalogue are read as a sign-in
// starts (`load`), and a chat as it opens (`readChat`, a few milliseconds),
// each kept in memory after.

import { Entry } from './entry'
import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  num,
  str,
  text,
} from './json'
import { type Agent, agentFrom } from './models'
import {
  type SidebarSection,
  parseSections,
  sectionsJSON,
} from './sidebarSections'

export const savedChatsVersion = 1
/** A chat's newest lines kept: the first page the computer sends holds up to 500. */
export const linesKept = 300
/** A chat kept larger than this keeps its newest 100 lines, and none when those are still larger. */
export const largestChat = 2_000_000
const linesKeptWhenLarge = 100

/** Whose copy it is: the account's id on the server, and its e-mail when the id is not known yet. */
export interface SavedOwner {
  id?: string
  email: string
}

export function savedOwner(id: string | undefined, email: string): SavedOwner {
  return {
    id: id == null || id === '' ? undefined : id,
    email: email.toLowerCase(),
  }
}

/** The signed-in account's, when it is known (`Owner(account)`). */
export function ownerOf(
  account: { id?: string; email: string } | undefined,
): SavedOwner | undefined {
  if (!account || ((account.id ?? '') === '' && account.email === ''))
    return undefined
  return savedOwner(account.id, account.email)
}

/** The same person: by id when both have one, else by e-mail. */
export function sameOwner(a: SavedOwner, b: SavedOwner): boolean {
  if (a.id != null && b.id != null) return a.id === b.id
  return a.email !== '' && a.email === b.email
}

export interface SavedRoster {
  owner: SavedOwner
  agents: Agent[]
}

/** The pins, in their order, and the sidebar's sections (undefined when the computer had not said). */
export interface SavedLayout {
  owner: SavedOwner
  pinnedIds: string[]
  sections?: SidebarSection[]
}

export interface SavedLines {
  entries: Entry[]
  /** The chat has older lines than these (the computer had more, or some were left out here). */
  hasOlder: boolean
}

// MARK: What is in the files

/**
 * The row as the host writes it (`Agent.savedJSON`): read back through
 * `agentFrom` it is the same row, less what was going on at that moment
 * (a turn running, typing, the step under way), which a list kept from
 * before would show as still going.
 */
export function agentSavedJSON(agent: Agent): JSONObject {
  const row: JSONObject = {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    description: agent.description,
    isGroup: agent.isGroup,
    memberIds: [...agent.memberIds],
    hasUnread: agent.hasUnread,
    unreadCount: agent.unreadCount,
    isRunningTurn: false,
    isRunning: false,
    isComposingMessage: false,
    isHiddenFromSidebar: agent.isHidden,
    notifyOnUpdatesEnabled: agent.notifyOnUpdates,
    conversationPartnerIds: [...agent.conversationPartnerIds],
    snapshotEpoch: agent.stamp.epoch,
    snapshotSeq: agent.stamp.seq,
  }
  const texts: [string, string | undefined][] = [
    ['avatarColor', agent.colour],
    ['avatarDataUrl', agent.avatarDataURL],
    ['lastMessagePreview', agent.lastMessagePreview],
    ['voiceId', agent.voiceId],
    ['avatarVersion', agent.avatarVersion],
    ['avatarShape', agent.avatarShape],
    ['lastMessageId', agent.lastMessageId],
    ['purpose', agent.purpose],
  ]
  for (const [key, value] of texts) if (value != null) row[key] = value
  const numbers: [string, number | undefined][] = [
    ['lastActivityAt', agent.lastActivityAt],
    ['createdAt', agent.createdAt],
    ['updatedAt', agent.updatedAt],
  ]
  for (const [key, value] of numbers) if (value != null) row[key] = value
  if (agent.isRemoteRoom) row.remoteRoom = true
  if (agent.isSharedRoom) row.isSharedRoom = true
  if (agent.awaitingUserResponse)
    row.awaitingUserResponse =
      agent.waitingReason != null ? { reason: agent.waitingReason } : {}
  if (agent.lastEntry != null) row.lastEntry = agent.lastEntry
  return row
}

function ownerFields(owner: SavedOwner): JSONObject {
  const record: JSONObject = { email: owner.email }
  if (owner.id != null) record.accountId = owner.id
  return record
}

function ownerFrom(record: unknown): SavedOwner | undefined {
  const email = str(field(record, 'email'))
  if (email == null) return undefined
  return savedOwner(text(field(record, 'accountId')), email)
}

function isThisVersion(record: unknown): boolean {
  return num(field(record, 'version')) === savedChatsVersion
}

export function encodeRoster(
  agents: readonly Agent[],
  owner: SavedOwner,
): JSONObject {
  return {
    version: savedChatsVersion,
    ...ownerFields(owner),
    agents: agents.map(agentSavedJSON),
  }
}

export function decodeRoster(record: unknown): SavedRoster | undefined {
  if (!isThisVersion(record)) return undefined
  const owner = ownerFrom(record)
  const rows = arr(field(record, 'agents'))
  if (!owner || !rows) return undefined
  return {
    owner,
    agents: rows
      .map(agentFrom)
      .filter((agent): agent is Agent => agent != null),
  }
}

export function encodeLayout(layout: SavedLayout): JSONObject {
  const record: JSONObject = {
    version: savedChatsVersion,
    ...ownerFields(layout.owner),
    pinnedAgentIds: [...layout.pinnedIds],
  }
  if (layout.sections) record.sidebarSections = sectionsJSON(layout.sections)
  return record
}

export function decodeLayout(record: unknown): SavedLayout | undefined {
  if (!isThisVersion(record)) return undefined
  const owner = ownerFrom(record)
  if (!owner) return undefined
  const pins = (arr(field(record, 'pinnedAgentIds')) ?? [])
    .map(text)
    .filter((id): id is string => id != null)
  const sections = field(record, 'sidebarSections')
  return {
    owner,
    pinnedIds: pins,
    sections: sections !== undefined ? parseSections(sections) : undefined,
  }
}

export function encodeChat(
  agentId: string,
  entries: readonly Entry[],
  hasOlder: boolean,
): JSONObject {
  return {
    version: savedChatsVersion,
    agentId,
    hasOlder,
    entries: entries.map((entry) => entry.raw),
  }
}

export function decodeChat(
  record: unknown,
  agentId: string,
): SavedLines | undefined {
  if (!isThisVersion(record) || str(field(record, 'agentId')) !== agentId)
    return undefined
  const rows = arr(field(record, 'entries'))
  if (!rows) return undefined
  const entries = Entry.list(rows)
  return entries.length === 0
    ? undefined
    : { entries, hasOlder: bool(field(record, 'hasOlder')) ?? false }
}

/** The catalogue as the computer gave it, with the language it was in. */
export function encodeCatalog(answer: JSONValue, language: string): JSONObject {
  return { version: savedChatsVersion, language, catalog: answer }
}

export function decodeCatalog(
  record: unknown,
  language: string,
): JSONValue | undefined {
  if (!isThisVersion(record) || str(field(record, 'language')) !== language)
    return undefined
  return field(record, 'catalog')
}

/** How many bytes a value is as JSON (`JSON.data().count`). */
function sizeOf(value: JSONValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * The lines a chat keeps: its newest `linesKept`, or its newest 100 when
 * those are larger than `largestChat`; undefined when even those are, or
 * there are none. A line still being written is kept as it was, finished:
 * it would otherwise show as still streaming.
 */
export function keptLines(
  entries: readonly Entry[],
  hasOlder: boolean,
): SavedLines | undefined {
  if (entries.length === 0) return undefined
  for (const limit of [linesKept, linesKeptWhenLarge]) {
    const kept = entries.slice(-limit).map((entry) => {
      if (!entry.isStreaming) return entry
      const raw = { ...entry.raw }
      delete raw.isStreaming
      return Entry.from(raw) ?? entry
    })
    if (sizeOf(kept.map((entry) => entry.raw)) <= largestChat)
      return {
        entries: kept,
        hasOlder: hasOlder || kept.length < entries.length,
      }
  }
  return undefined
}

// MARK: Where they are kept

/** The three files beside the chats. */
export type SavedFileName = 'roster' | 'layout' | 'catalog'

/** Where the copy lives: the Windows app's folder, through its main process (src/desktop/savedChats.ts); memory in the tests. */
export interface SavedChatsPlace {
  /** The three files, each null when there is none. */
  read(): Promise<Record<SavedFileName, unknown>>
  readChat(agentId: string): Promise<unknown>
  write(name: SavedFileName, record: JSONValue): Promise<void>
  /** A chat's file, or none (null). */
  writeChat(agentId: string, record: JSONValue | null): Promise<void>
  /** Every chat but these goes. */
  keepChats(agentIds: string[]): Promise<void>
  /** All of it goes. */
  forget(): Promise<void>
}

/**
 * The copy on this device, as the store reads and writes it. What was last
 * written or read is kept in memory, so a read never waits for a write on
 * its way; the writes go to the place one after the other, in order.
 */
export class SavedChats {
  private roster?: SavedRoster
  private layout?: SavedLayout
  private catalog?: unknown
  /** Each chat read or written (undefined inside: known to be absent). */
  private chats = new Map<string, SavedLines | undefined>()
  /** Bumped by every load and every forget, so a read begun before one is dropped. */
  private generation = 0
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly place: SavedChatsPlace) {}

  /** Reads the list, the layout and the catalogue, as a sign-in starts; a place that can't be read has none. */
  async load(): Promise<void> {
    this.generation += 1
    let files: Record<SavedFileName, unknown> | undefined
    try {
      files = await this.place.read()
    } catch {
      files = undefined
    }
    this.roster = decodeRoster(files?.roster)
    this.layout = decodeLayout(files?.layout)
    this.catalog = files?.catalog ?? undefined
    this.chats = new Map()
  }

  /** The list kept, undefined when there is none. */
  readRoster(): SavedRoster | undefined {
    return this.roster
  }

  /** The pins and sections kept, undefined when there are none. */
  readLayout(): SavedLayout | undefined {
    return this.layout
  }

  /** The catalogue kept, when it was in `language`. */
  readCatalog(language: string): JSONValue | undefined {
    return decodeCatalog(this.catalog, language)
  }

  /** A chat's lines kept, undefined when there are none. */
  async readChat(agentId: string): Promise<SavedLines | undefined> {
    if (this.chats.has(agentId)) return this.chats.get(agentId)
    const started = this.generation
    let record: unknown
    try {
      record = await this.place.readChat(agentId)
    } catch {
      record = undefined
    }
    // Forgotten meanwhile: what was read is gone. Written meanwhile: the write is newer.
    if (started !== this.generation) return undefined
    if (!this.chats.has(agentId))
      this.chats.set(agentId, decodeChat(record, agentId))
    return this.chats.get(agentId)
  }

  private queue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch(() => {})
  }

  writeRoster(agents: readonly Agent[], owner: SavedOwner): void {
    this.roster = { owner, agents: [...agents] }
    const record = encodeRoster(agents, owner)
    this.queue(() => this.place.write('roster', record))
  }

  /** The pins and sections; nothing is written when they are what is kept already. */
  writeLayout(
    pinnedIds: readonly string[],
    sections: readonly SidebarSection[] | undefined,
    owner: SavedOwner,
  ): void {
    const next: SavedLayout = {
      owner,
      pinnedIds: [...pinnedIds],
      sections: sections ? [...sections] : undefined,
    }
    if (
      this.layout &&
      JSON.stringify(encodeLayout(this.layout)) ===
        JSON.stringify(encodeLayout(next))
    )
      return
    this.layout = next
    const record = encodeLayout(next)
    this.queue(() => this.place.write('layout', record))
  }

  /** A chat's lines, its newest ones (`keptLines`); none kept when they are too large even then, and none for an empty chat. */
  writeChat(
    agentId: string,
    entries: readonly Entry[],
    hasOlder: boolean,
  ): void {
    const kept = keptLines(entries, hasOlder)
    this.chats.set(agentId, kept)
    const record = kept
      ? encodeChat(agentId, kept.entries, kept.hasOlder)
      : null
    this.queue(() => this.place.writeChat(agentId, record))
  }

  /** Every chat kept for an agent no longer in the list goes. */
  removeChats(keeping: ReadonlySet<string>): void {
    for (const id of [...this.chats.keys()])
      if (!keeping.has(id)) this.chats.delete(id)
    const ids = [...keeping]
    this.queue(() => this.place.keepChats(ids))
  }

  writeCatalog(answer: JSONValue, language: string): void {
    this.catalog = encodeCatalog(answer, language)
    const record = encodeCatalog(answer, language)
    this.queue(() => this.place.write('catalog', record))
  }

  /** Signed out: all of it goes, after any write still on its way. */
  forget(): void {
    this.roster = undefined
    this.layout = undefined
    this.catalog = undefined
    this.chats = new Map()
    this.generation += 1
    this.queue(() => this.place.forget())
  }

  /** Waits for the writes on their way (the app quitting). */
  waitForWrites(): Promise<void> {
    return this.writes
  }
}

/** A place in memory (the tests'): what would be in the files, as JSON text. */
export class MemorySavedPlace implements SavedChatsPlace {
  files: Partial<Record<SavedFileName, string>> = {}
  chats = new Map<string, string>()
  async read(): Promise<Record<SavedFileName, unknown>> {
    const parse = (raw?: string) => (raw == null ? null : JSON.parse(raw))
    return {
      roster: parse(this.files.roster),
      layout: parse(this.files.layout),
      catalog: parse(this.files.catalog),
    }
  }
  async readChat(agentId: string): Promise<unknown> {
    const raw = this.chats.get(agentId)
    return raw == null ? null : JSON.parse(raw)
  }
  async write(name: SavedFileName, record: JSONValue): Promise<void> {
    this.files[name] = JSON.stringify(record)
  }
  async writeChat(agentId: string, record: JSONValue | null): Promise<void> {
    if (record == null) this.chats.delete(agentId)
    else this.chats.set(agentId, JSON.stringify(record))
  }
  async keepChats(agentIds: string[]): Promise<void> {
    const keep = new Set(agentIds)
    for (const id of [...this.chats.keys()])
      if (!keep.has(id)) this.chats.delete(id)
  }
  async forget(): Promise<void> {
    this.files = {}
    this.chats = new Map()
  }
}
