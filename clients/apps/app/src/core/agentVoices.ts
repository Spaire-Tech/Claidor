// Each agent's own voice, given as the Mac gives it
// (ios/SimeonCore/Sources/SimeonCore/AgentVoices.swift, after the Mac's
// desktop/source/shared/voice-call/agent-voices.ts and `assignMissingVoices`):
//
// - The Chief of Staff gets Simeon's own voice, which no other agent is given.
// - Any other agent gets the voice fewest agents have, among the voices of
//   its name's gender when the name has one (Maya, Nina: a woman's; Leo, Jon:
//   a man's); a name with none (Jordan, Sage) takes its face's gender, and
//   only an agent with neither picks among all of them.
// - Between voices equally free, the agent's id decides (the Mac's FNV-1a
//   hash over the id's UTF-16), so two agents hired together differ, and
//   every device gives the same agent the same voice.
// - A voice no longer on the account's list is none, and is replaced.
//
// The first names are read from the core's own list
// (GeneratedNameGenders.swift, made from the Mac's name-genders.ts), so the
// web app knows exactly the names the Mac and the iPhone know.

import namesSource from '../../../../../ios/SimeonCore/Sources/SimeonCore/GeneratedNameGenders.swift?raw'
import { ownFace, stableHash } from './faces'
import type { Agent } from './models'

/** A voice in the picker (`AppStore.VoiceChoice`): its name only, a sample to play when it has one, its gender to match an agent's name. */
export interface VoiceChoice {
  id: string
  name: string
  /** The sample's address (`preview_url`). */
  sample?: string
  /** "female" or "male", when the server says. */
  gender?: string
}

/** The Chief of Staff's voice (`SIMEON_VOICE_ID` in server/simeon/desktop/voice.py). */
export const simeonVoiceId = 'Cz0K1kOv9tD8l0b5Qu53'

/** The voice an agent with none saved speaks with (`VOICE_CALL_DEFAULT_VOICE_ID`, Michael: the platform agent's own). */
export const defaultVoiceId = 'ljX1ZrXuDIIRVcmiVSyR'

/** Each curated voice's gender, for a server that sends none (`CURATED_VOICE_GENDERS`, the server's and the Mac's). */
export const curatedGenders: Readonly<Record<string, string>> = {
  ljX1ZrXuDIIRVcmiVSyR: 'male', // Michael
  '1t1EeRixsJrKbiF1zwM6': 'male', // Jerry
  XcXEQzuLXRU9RcfWzEJt: 'female', // Veda
  s3TPKV1kjDlVtZbl4Ksh: 'male', // Adam
  UgBBYS2sOqTuMpoF3BR0: 'male', // Mark
  '6OzrBCQf8cjERkYgzSg8': 'male', // Jamal
  Cz0K1kOv9tD8l0b5Qu53: 'male', // Simeon
  WI5pMmcGGS32yI7yttoP: 'female', // Amanda
  snyKKuaGYk1VUEh42zbW: 'male', // Chris
  gfRt6Z3Z8aTbpLfexQ7N: 'male', // Boyd
  NHRgOEwqx5WZNClv5sat: 'female', // Chelsea
  '5u41aNhyCU6hXOcjPPv0': 'female', // Hope
}

/** A title before the name: a gender, or null to look at the next word. */
const titles: Readonly<Record<string, string | null>> = {
  mrs: 'female',
  ms: 'female',
  miss: 'female',
  madam: 'female',
  lady: 'female',
  mr: 'male',
  sir: 'male',
  lord: 'male',
  dr: null,
  doctor: null,
  prof: null,
  professor: null,
  captain: null,
  coach: null,
}

/** One of the core's two lists (`GeneratedNameGenders.women`, `.men`): the words between its `"""`. */
function namesOf(list: 'women' | 'men'): ReadonlySet<string> {
  const found = new RegExp(`static let ${list} =\\s*"""([\\s\\S]*?)"""`).exec(
    namesSource,
  )
  return new Set((found?.[1] ?? '').split(/\s+/).filter((name) => name !== ''))
}

/** First names given to at least 85% girls or boys (the Mac's `WOMEN_NAMES` and `MEN_NAMES`). */
export const womenNames = namesOf('women')
export const menNames = namesOf('men')

/**
 * "female", "male", or undefined when the name is neither or unknown (the
 * Mac's `nameGender`): its marks taken off its letters, lowercased, cut into
 * words of a to z; a title decides or is passed over; the first other word
 * decides.
 */
export function nameGender(name: string): string | undefined {
  const bare = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  const words = bare.match(/[a-z]+/g) ?? []
  for (const word of words) {
    if (Object.hasOwn(titles, word)) {
      const titled = titles[word]
      if (titled) return titled
      continue
    }
    return womenNames.has(word)
      ? 'female'
      : menNames.has(word)
        ? 'male'
        : undefined
  }
  return undefined
}

/** The Chief of Staff is the agent titled so (`isChiefOfStaffTitle`). */
export function isChiefOfStaffTitle(title: string): boolean {
  const plain = title.trim().toLowerCase()
  return plain === 'chief of staff' || plain === 'coo'
}

/** A voice's gender: the server's, else the curated list's. */
export function genderOfVoice(voice: VoiceChoice): string | undefined {
  return voice.gender ?? curatedGenders[voice.id]
}

/**
 * The voice an agent without one gets among `voices`; undefined when there
 * is none to give (the Mac's `pickAgentVoice`). `gender` is the one wanted,
 * when not the name's (its face's).
 */
export function pickVoice(options: {
  agentId: string
  name: string
  isChiefOfStaff: boolean
  voices: readonly VoiceChoice[]
  taken: readonly string[]
  gender?: string
}): string | undefined {
  const { agentId, name, isChiefOfStaff, voices, taken } = options
  if (isChiefOfStaff && voices.some((voice) => voice.id === simeonVoiceId))
    return simeonVoiceId
  const others = voices.filter((voice) => voice.id !== simeonVoiceId)
  const wanted = options.gender ?? nameGender(name)
  const matching =
    wanted === undefined
      ? []
      : others.filter((voice) => genderOfVoice(voice) === wanted)
  const pool = matching.length === 0 ? others : matching
  if (pool.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const id of taken) counts.set(id, (counts.get(id) ?? 0) + 1)
  const fewest = Math.min(...pool.map((voice) => counts.get(voice.id) ?? 0))
  const free = pool.filter((voice) => (counts.get(voice.id) ?? 0) === fewest)
  return free[stableHash(agentId) % free.length]!.id
}

/** A voice id the Mac would store (`VOICE_ID_PATTERN`): letters and digits, 1 to 64. */
export function usableVoice(voiceId: string | undefined): string | undefined {
  return voiceId !== undefined && /^[0-9A-Za-z]{1,64}$/.test(voiceId)
    ? voiceId
    : undefined
}

/** The agent's stored voice while it is on the list; a voice taken off it is none. An empty list judges nothing. */
export function keptVoice(
  voiceId: string | undefined,
  listed: readonly VoiceChoice[],
): string | undefined {
  const usable = usableVoice(voiceId)
  if (usable === undefined) return undefined
  return listed.length === 0 || listed.some((voice) => voice.id === usable)
    ? usable
    : undefined
}

/** The agents that have a voice: not groups, not someone else's rooms, by id as the Mac orders them (UTF-16). */
function voiced(agents: readonly Agent[]): Agent[] {
  return agents
    .filter((agent) => !agent.isGroup && !agent.isRemoteRoom && agent.id !== '')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Every agent's voice after one pass, and the ones it gives, in agent-id
 * order as the Mac gives them (`AgentVoices.plan`). Groups and shared rooms
 * have none.
 */
export function voicePlan(
  agents: readonly Agent[],
  voices: readonly VoiceChoice[],
): {
  voices: Record<string, string>
  given: { agentId: string; voiceId: string }[]
} {
  const people = voiced(agents)
  const all: Record<string, string> = {}
  for (const agent of people) {
    const voice = keptVoice(agent.voiceId, voices)
    if (voice !== undefined) all[agent.id] = voice
  }
  if (voices.length === 0) return { voices: all, given: [] }
  const given: { agentId: string; voiceId: string }[] = []
  for (const agent of people) {
    if (all[agent.id] !== undefined) continue
    const taken = people
      .map((one) => all[one.id])
      .filter((id): id is string => id !== undefined)
    const voice = pickVoice({
      agentId: agent.id,
      name: agent.name,
      isChiefOfStaff: isChiefOfStaffTitle(agent.title),
      voices,
      taken,
      gender: nameGender(agent.name) ?? ownFace(agent)?.gender,
    })
    if (voice === undefined) continue
    all[agent.id] = voice
    given.push({ agentId: agent.id, voiceId: voice })
  }
  return { voices: all, given }
}

/** The voices to pick from as the server lists them (`GET proxy/v1/voice/voices`): `{id, name, preview_url, gender}`. */
export function voiceChoicesFrom(answer: unknown): VoiceChoice[] {
  if (!Array.isArray(answer)) return []
  const out: VoiceChoice[] = []
  for (const row of answer) {
    if (row == null || typeof row !== 'object') continue
    const fields = row as Record<string, unknown>
    const id =
      typeof fields.id === 'string' && fields.id !== '' ? fields.id : ''
    const name =
      typeof fields.name === 'string' && fields.name !== '' ? fields.name : ''
    if (id === '' || name === '') continue
    const sample =
      typeof fields.preview_url === 'string' && fields.preview_url !== ''
        ? fields.preview_url
        : undefined
    const gender =
      typeof fields.gender === 'string' && fields.gender !== ''
        ? fields.gender.toLowerCase()
        : undefined
    out.push({
      id,
      name,
      sample,
      gender: gender === 'female' || gender === 'male' ? gender : undefined,
    })
  }
  return out
}
