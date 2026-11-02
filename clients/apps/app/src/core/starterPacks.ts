// A starter pack (`StarterPack` in
// ios/SimeonCore/Sources/SimeonCore/StarterPacks.swift, 22 October 2026;
// server/simeon/desktop/packs.py): a team of five agents for a trade
// ("Coffee Shop Team"), each already named, with a face, a title, its
// instructions and the three apps it asks to connect first. The website's
// Add to Simeon opens the Mac on `simeon://app/v1/pack/add?id=<id>` and the
// iPhone on `simeon-ios://…`; the web app is opened on its own address with
// the pack's id (`?pack=<id>`, docs/web-app/PROGRESS.md). The app reads the
// pack from Simeon Labs' server and shows it; Add makes the five agents in a
// sidebar section named after the pack (the store's `addPack`). Each speaks
// first at once (`isKickstartRequested`): its instructions say to ask for
// its apps, and an app already connected is only named.

import { NetworkError } from './http'
import { type JSONValue, arr, field, isObject, str } from './json'
import { t } from './l10n'
import { plainError, plainProblem, unavailable } from './plainWords'

export interface PackApp {
  /** The catalogue's id (`vendor-mcp/catalog.ts`). */
  id: string
  name: string
}

export interface PackMember {
  name: string
  /** Its job, under its name ("Stock"). */
  title: string
  /** The face it is given (`AgentFaces`, "clay-02"). */
  face: string
  /** What it does, in a sentence or two, for the sheet. */
  summary: string
  /** The apps it asks for first, in its own order. */
  apps: PackApp[]
  /** Its instructions, kept as the agent's description: its first message starts on them. */
  instructions: string
}

export interface StarterPack {
  id: string
  /** The sidebar section its agents go in ("Coffee Shop Team"). */
  folder: string
  /** "Simeon for Coffee Shops". */
  title: string
  summary: string
  members: PackMember[]
}

/**
 * The pack's sheet while it shows (`PackAsk`, mac/Simeon/StarterPackSheet.swift):
 * the pack asked for, read or not yet; why it can't be shown (the read
 * refused, in the server's words; or Add made nothing, with the last
 * refusal's words when there were any, else the sheet's own sentence);
 * Add under way.
 */
export interface PackAsk {
  id: string
  pack?: StarterPack
  failure?: { read: string } | { added?: string }
  adding: boolean
}

/**
 * A read that failed, as the sheet says it: the server's sentence ("This
 * team isn't available anymore."), or a plain one; no answer at all (the
 * browser's "Failed to fetch", "Load failed"…) says so in the person's
 * language, as the Mac shows the system's own words for it.
 */
export function packReadFailure(error: unknown): string {
  if (error instanceof NetworkError)
    return t("Simeon can't be reached. Check your connection and try again.")
  const words = error instanceof Error ? error.message : String(error)
  return plainError(words) || unavailable()
}

/** Add that made nothing: the last refusal ("Couldn't create Bruno: …") as the person may read it. */
export function packAddFailure(problem: string | undefined): {
  added?: string
} {
  return { added: problem != null ? plainProblem(problem) : undefined }
}

/** A pack's id: 1 to 64 of a–z, 0–9 and "-" (`coffee-shop`). */
export function isPackId(value: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(value)
}

/** Its sidebar section's id, so the pack is found again once added. */
export function packSectionId(packId: string): string {
  return `pack-${packId}`
}

/** The server's pack (`packs.json`): the app names come from its `appNames`, else the catalogue's id stands for it. */
export function packFrom(json: unknown): StarterPack | undefined {
  const id = str(field(json, 'id'))
  const folder = str(field(json, 'folder'))
  if (id == null || !isPackId(id) || folder == null || folder === '')
    return undefined
  const names = field(json, 'appNames')
  const members = (arr(field(json, 'agents')) ?? []).flatMap(
    (agent): PackMember[] => {
      const name = str(field(agent, 'name'))
      if (name == null || name === '') return []
      const apps = (arr(field(agent, 'apps')) ?? [])
        .map(str)
        .filter((app): app is string => app != null)
        .map((app) => ({
          id: app,
          name: (isObject(names) ? str(names[app]) : undefined) ?? app,
        }))
      return [
        {
          name,
          title: str(field(agent, 'title')) ?? '',
          face: str(field(agent, 'face')) ?? '',
          summary: str(field(agent, 'summary')) ?? '',
          apps,
          instructions: str(field(agent, 'description')) ?? '',
        },
      ]
    },
  )
  if (members.length === 0) return undefined
  return {
    id,
    folder,
    title: str(field(json, 'title')) ?? folder,
    summary: str(field(json, 'summary')) ?? '',
    members,
  }
}

const linkPath = '/v1/pack/add'

/**
 * The pack an app's link names (`<scheme>://app/v1/pack/add?id=coffee-shop`,
 * `StarterPack.linked`), or none: the Windows app's `simeon://` links
 * (step 7) read this way.
 */
export function packLinked(link: string, scheme: string): string | undefined {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return undefined
  }
  if (url.protocol.toLowerCase() !== `${scheme.toLowerCase()}:`)
    return undefined
  if (url.host !== 'app' || url.pathname !== linkPath) return undefined
  const items = [...url.searchParams]
  if (items.length !== 1) return undefined
  const [name, id] = items[0]!
  return name === 'id' && isPackId(id) ? id : undefined
}

/** The pack the web app's own address names (`?pack=coffee-shop`), or none. */
export function packInAddress(search: string): string | undefined {
  const id = new URLSearchParams(search).get('pack')
  return id != null && isPackId(id) ? id : undefined
}

/** The address without its pack, so a reload doesn't ask again (others kept: `?api=`, `?agent=`). */
export function addressWithoutPack(href: string): string | undefined {
  const url = new URL(href)
  if (!url.searchParams.has('pack')) return undefined
  url.searchParams.delete('pack')
  return url.href
}

/** The arguments of one member's `createAgent`, as the core's `createAgent(name:title:description:face:voiceId:)` sends them. */
export function packAgentArguments(
  member: PackMember,
  nonce: string,
): JSONValue {
  const args: { [key: string]: JSONValue } = {
    name: member.name,
    description: member.instructions,
    isKickstartRequested: true,
    origin: 'user',
    clientNonce: nonce,
  }
  // Its title is its role in its own prompt and the tag under its name (`mintAgent`).
  const role = member.title.trim()
  if (role !== '') args.title = role
  if (member.face !== '') args.avatarShape = member.face
  return args
}
