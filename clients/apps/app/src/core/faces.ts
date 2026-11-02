// The agents' faces (ios/SimeonCore/Sources/SimeonCore/AgentFaces.swift): the
// founder's clay characters, read from the shared core's own copy
// (Resources/Faces), so the web app draws exactly the Mac's and the iPhone's.
// Which face is drawn (`Agent.picture`): the catalogue face its picture is,
// else its own picture, else the face it was given, else one its id picks.
//
// Which face an agent is given, and the avatar editor's Shuffle and Reset
// (step 4b, at the end). Giving a face to every agent that has none (the
// store writes it to the computer, StoreFaces.swift's `assignMissingFaces`)
// comes with the store's actions.

import catalogue from '../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/faces.json'
import {
  type VoiceChoice,
  curatedGenders,
  genderOfVoice,
  keptVoice,
  nameGender,
  pickVoice,
} from './agentVoices'
import { type Agent, chiefOfStaff, hasPicture } from './models'

export interface AgentFace {
  /** "clay-07"; Simeon's is "clay-simeon". Stored on the agent as its `avatarShape`. */
  id: string
  gender: string
  file: string
  /** The first 16 hex characters of the file's SHA-256: the host's `avatarVersion` for an agent wearing it. */
  version: string
  /** The colour of the face's background. */
  backdrop?: string
}

const pictures = import.meta.glob<string>(
  '../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/*.webp',
  { eager: true, query: '?url', import: 'default' },
)

export const simeonFaceId = 'clay-simeon'
/** Every face, in the editor's order: the numbered ones, then Simeon's. */
export const faces: AgentFace[] = (catalogue as { faces: AgentFace[] }).faces
/** The faces given to agents: all but Simeon's. */
export const facePool = faces.filter((face) => face.id !== simeonFaceId)
const byId = new Map(faces.map((face) => [face.id, face]))
const byVersion = new Map(faces.map((face) => [face.version, face]))

export function faceById(id: string | undefined): AgentFace | undefined {
  return id ? byId.get(id) : undefined
}

export function faceByVersion(
  version: string | undefined,
): AgentFace | undefined {
  return version ? byVersion.get(version) : undefined
}

/** The face's picture (WebP, 512 px), as the built app serves it. */
export function faceURL(face: AgentFace): string | undefined {
  const entry = Object.entries(pictures).find(([path]) =>
    path.endsWith(`/${face.file}`),
  )
  return entry?.[1]
}

/** The voices' FNV-1a over the UTF-16 units (`AgentVoices.stableHash`): the same id, the same face on every device. */
export function stableHash(text: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619) >>> 0
  }
  return hash >>> 0
}

/** A face for an agent known only by its id: never stored. */
export function standForId(id: string): AgentFace | undefined {
  if (facePool.length === 0) return faceById(simeonFaceId)
  return facePool[stableHash(id) % facePool.length]
}

export type PictureSource =
  | { kind: 'face'; face: AgentFace }
  | { kind: 'own'; dataURL: string }

/** What an agent shows (`Agent.picture`). */
export function pictureOf(agent: Agent): PictureSource | undefined {
  const worn = faceByVersion(agent.avatarVersion)
  if (worn) return { kind: 'face', face: worn }
  if (agent.avatarDataURL?.startsWith('data:image'))
    return { kind: 'own', dataURL: agent.avatarDataURL }
  const given = faceById(agent.avatarShape)
  if (given) return { kind: 'face', face: given }
  const stand = standForId(agent.id)
  return stand ? { kind: 'face', face: stand } : undefined
}

/** The picture's address: a face's file, or the agent's own data URL. A group shows its own only. */
export function pictureURL(agent: Agent): string | undefined {
  if (agent.isGroup) {
    return agent.avatarDataURL?.startsWith('data:image')
      ? agent.avatarDataURL
      : undefined
  }
  const source = pictureOf(agent)
  if (!source) return undefined
  return source.kind === 'own' ? source.dataURL : faceURL(source.face)
}

/**
 * A group's members drawn together (`GroupLayout`): two at 2/3 of the
 * square, three at 5/9 (one above two), four in a grid; more as three and
 * "+N". Each later one is cut out of the ones before by a small gap.
 */
export function groupSlots(
  count: number,
  frame: number,
): { x: number; y: number; size: number }[] {
  if (count <= 1) return [{ x: 0, y: 0, size: frame }]
  if (count === 2) {
    const size = (frame * 2) / 3
    const step = frame - size
    return [
      { x: 0, y: 0, size },
      { x: step, y: step, size },
    ]
  }
  const size = (frame * 5) / 9
  const step = frame - size
  if (count === 3) {
    return [
      { x: step / 2, y: 0, size },
      { x: 0, y: step, size },
      { x: step, y: step, size },
    ]
  }
  return [
    { x: 0, y: 0, size },
    { x: step, y: 0, size },
    { x: 0, y: step, size },
    { x: step, y: step, size },
  ]
}

/** The gap cut around a later member: 2 at 36 px. */
export function groupGap(frame: number): number {
  return (2 * frame) / 36
}

// MARK: Which face (step 4b: AgentFaces.swift's choices)
//
// - The Chief of Staff gets Simeon's own face, which no other agent is given.
// - Any other agent gets the face fewest agents wear, among its gender's: the
//   name's gender (as its voice gets), so face and voice agree. A name with
//   none (Alex, Sam) takes its voice's gender, else one its id picks.
// - Between faces equally free, the agent's id decides (the voices' FNV-1a
//   hash), so every device gives the same agent the same face.
// - The face it was given is kept on the agent (`avatarShape`): a picture
//   uploaded later leaves it, and Reset puts it back.

export function simeonFace(): AgentFace | undefined {
  return faceById(simeonFaceId)
}

/** The catalogue face the agent's picture is, if it is one (`AgentFaces.worn`). */
export function wornFace(agent: Agent): AgentFace | undefined {
  return faceByVersion(agent.avatarVersion)
}

/** The face the agent was given (`avatarShape`), worn now or not. */
export function givenFace(agent: Agent): AgentFace | undefined {
  return faceById(agent.avatarShape)
}

/** Its face: the one it wears, else the one it was given. */
export function ownFace(agent: Agent): AgentFace | undefined {
  return wornFace(agent) ?? givenFace(agent)
}

/** A voice's gender: the listed voice's, else the curated list's. */
export function voiceGender(
  voiceId: string | undefined,
  voices: readonly VoiceChoice[],
): string | undefined {
  if (voiceId === undefined) return undefined
  const listed = voices.find((voice) => voice.id === voiceId)
  return (listed && genderOfVoice(listed)) ?? curatedGenders[voiceId]
}

/** The gender of the face an agent is given: its name's; else its face's; else its voice's; else one its id picks. */
export function genderFor(
  agent: Agent,
  voices: readonly VoiceChoice[] = [],
): string {
  return (
    nameGender(agent.name) ??
    ownFace(agent)?.gender ??
    voiceGender(agent.voiceId, voices) ??
    (stableHash(agent.id) % 2 === 0 ? 'female' : 'male')
  )
}

/** The face fewest agents wear among `gender`'s (all faces when that gender has none); ties go by the agent's id. */
export function pickFace(
  agentId: string,
  gender: string,
  taken: readonly string[],
): AgentFace | undefined {
  const matching = facePool.filter((face) => face.gender === gender)
  const candidates = matching.length === 0 ? facePool : matching
  if (candidates.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const id of taken) counts.set(id, (counts.get(id) ?? 0) + 1)
  const fewest = Math.min(...candidates.map((face) => counts.get(face.id) ?? 0))
  const free = candidates.filter(
    (face) => (counts.get(face.id) ?? 0) === fewest,
  )
  return free[stableHash(agentId) % free.length]
}

/** Agents that wear a face: not groups, not someone else's rooms, by id as the Mac orders them (UTF-16). */
export function facePeople(agents: readonly Agent[]): Agent[] {
  return agents
    .filter((agent) => !agent.isGroup && !agent.isRemoteRoom && agent.id !== '')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The face `agent` is given: the one it was given before, Simeon's for the Chief of Staff, else the one its gender has fewest of in `taken`. */
function faceToGive(
  agent: Agent,
  isChiefOfStaff: boolean,
  taken: readonly string[],
  voices: readonly VoiceChoice[],
): AgentFace | undefined {
  const back = givenFace(agent)
  if (back) return back
  const simeon = simeonFace()
  if (isChiefOfStaff && simeon) return simeon
  return pickFace(agent.id, genderFor(agent, voices), taken)
}

/**
 * The faces to give in one pass (`AgentFaces.plan`), in agent-id order as
 * the voices are given: to every agent with no picture. One that was given
 * a face before gets it back; the Chief of Staff gets Simeon's; any other
 * the face its gender has fewest of, counting the ones given earlier.
 */
export function facePlan(
  agents: readonly Agent[],
  voices: readonly VoiceChoice[] = [],
): { agentId: string; face: AgentFace }[] {
  const people = facePeople(agents)
  const chief = chiefOfStaff(people)?.id
  const taken = people
    .map((agent) => ownFace(agent)?.id)
    .filter((id): id is string => id !== undefined)
  const given: { agentId: string; face: AgentFace }[] = []
  for (const agent of people) {
    if (hasPicture(agent)) continue
    const face = faceToGive(agent, agent.id === chief, taken, voices)
    if (!face) continue
    given.push({ agentId: agent.id, face })
    if (!ownFace(agent)) taken.push(face.id)
  }
  return given
}

/**
 * The voice that goes with `face` when the agent's own is of the other
 * gender (the editor's choice of a face, `AgentFaces.voice`); undefined to
 * keep its own, or when it has none yet.
 */
export function voiceForFace(
  agent: Agent,
  face: AgentFace,
  agents: readonly Agent[],
  voices: readonly VoiceChoice[],
): string | undefined {
  if (voices.length === 0) return undefined
  const current = keptVoice(agent.voiceId, voices)
  if (current === undefined) return undefined
  const gender = voiceGender(current, voices)
  if (gender === undefined || gender === face.gender) return undefined
  const isChief =
    chiefOfStaff(agents)?.id === agent.id &&
    simeonFace()?.gender === face.gender
  const taken = agents
    .filter((other) => other.id !== agent.id)
    .map((other) => keptVoice(other.voiceId, voices))
    .filter((id): id is string => id !== undefined)
  return pickVoice({
    agentId: agent.id,
    name: agent.name,
    isChiefOfStaff: isChief,
    voices,
    taken,
    gender: face.gender,
  })
}

/** A name as the core seeds with it: its words one space apart, lowercased. */
export function nameSeed(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ')
    .toLowerCase()
}

/**
 * The face a new agent named `name` gets (`AgentFaces.preview`: New Agent
 * shows it as the name is typed, and sends it as the agent's face): of the
 * name's gender, else one the name picks, the one the team has fewest of.
 */
export function previewFace(
  name: string,
  agents: readonly Agent[],
): AgentFace | undefined {
  const seed = nameSeed(name)
  const gender =
    nameGender(name) ?? (stableHash(seed) % 2 === 0 ? 'female' : 'male')
  return pickFace(
    seed,
    gender,
    facePeople(agents)
      .map((agent) => ownFace(agent)?.id)
      .filter((id): id is string => id !== undefined),
  )
}

/** The editor's Reset (`AgentFaces.reset`): the face the agent was given, else the one it would be given now, counting every other agent's. */
export function faceForReset(
  agent: Agent,
  agents: readonly Agent[],
  voices: readonly VoiceChoice[] = [],
): AgentFace | undefined {
  const people = facePeople(agents)
  const others = people.filter((other) => other.id !== agent.id)
  const isChief = chiefOfStaff(people)?.id === agent.id
  const bare: Agent = {
    ...agent,
    avatarVersion: undefined,
    avatarDataURL: undefined,
  }
  return faceToGive(
    bare,
    isChief,
    others
      .map((other) => ownFace(other)?.id)
      .filter((id): id is string => id !== undefined),
    voices,
  )
}

/**
 * The editor's Shuffle (`AgentFaces.shuffle`): the next face of `gender`
 * after `current` (in the catalogue's order, round again at the end) that no
 * other agent wears; when every one is worn, simply the next.
 */
export function shuffledFace(
  current: AgentFace | undefined,
  gender: string,
  agentId: string,
  agents: readonly Agent[],
): AgentFace | undefined {
  const list = facePool.filter((face) => face.gender === gender)
  if (list.length === 0) return undefined
  const others = new Set(
    facePeople(agents)
      .filter((agent) => agent.id !== agentId)
      .map((agent) => ownFace(agent)?.id)
      .filter((id): id is string => id !== undefined),
  )
  const at = current ? list.findIndex((face) => face.id === current.id) : -1
  const start = at >= 0 ? at : list.length - 1
  const order = list.map((_, step) => list[(start + step + 1) % list.length]!)
  return (
    order.find((face) => face.id !== current?.id && !others.has(face.id)) ??
    order[0]
  )
}
