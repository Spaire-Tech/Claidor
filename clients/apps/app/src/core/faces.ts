// The agents' faces (ios/SimeonCore/Sources/SimeonCore/AgentFaces.swift): the
// founder's clay characters, read from the shared core's own copy
// (Resources/Faces), so the web app draws exactly the Mac's and the iPhone's.
// Which face is drawn (`Agent.picture`): the catalogue face its picture is,
// else its own picture, else the face it was given, else one its id picks.
//
// Giving a face to an agent that has none (the store writes it to the
// computer, `assignMissingFaces`) comes with the store's actions.

import catalogue from '../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/faces.json'
import type { Agent } from './models'

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
