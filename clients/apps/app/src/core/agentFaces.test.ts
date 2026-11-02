// The faces' choices as the core's tests have them (`AgentFaceTests` in
// AgentFaceTests.swift): the catalogue and each face's bytes, the face an
// agent is given, New Agent's face, Shuffle, Reset, and the voice that
// follows a face of the other gender.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type VoiceChoice, curatedGenders, voicePlan } from './agentVoices'
import {
  type AgentFace,
  faceById,
  faceForReset,
  facePlan,
  facePool,
  faces,
  genderFor,
  pickFace,
  previewFace,
  shuffledFace,
  simeonFace,
  simeonFaceId,
  stableHash,
  voiceForFace,
} from './faces'
import { type Agent, makeAgent } from './models'

/** The curated voices as listed, their genders from the curated list. */
const listed: VoiceChoice[] = [
  ['ljX1ZrXuDIIRVcmiVSyR', 'Michael'],
  ['XcXEQzuLXRU9RcfWzEJt', 'Veda'],
  ['s3TPKV1kjDlVtZbl4Ksh', 'Adam'],
  ['Cz0K1kOv9tD8l0b5Qu53', 'Simeon'],
  ['WI5pMmcGGS32yI7yttoP', 'Amanda'],
  ['NHRgOEwqx5WZNClv5sat', 'Chelsea'],
].map(([id, name]) => ({ id: id!, name: name! }))

function agent(
  id: string,
  name: string,
  fields: {
    title?: string
    voice?: string
    face?: string
    wearing?: string
    picture?: string
    group?: boolean
    room?: boolean
    created?: number
  } = {},
): Agent {
  return makeAgent({
    id,
    name,
    title: fields.title ?? '',
    voiceId: fields.voice,
    avatarShape: fields.face,
    avatarVersion: fields.wearing
      ? faceById(fields.wearing)?.version
      : undefined,
    avatarDataURL: fields.picture,
    isGroup: fields.group ?? false,
    isRemoteRoom: fields.room ?? false,
    createdAt: fields.created,
  })
}

const women = () => facePool.filter((face) => face.gender === 'female')
const men = () => facePool.filter((face) => face.gender === 'male')
const png = 'data:image/png;base64,iVBORw0KGgo='

describe('the catalogue', () => {
  it('is the founder’s thirty-one faces, each known by its bytes', () => {
    expect(faces.length).toBe(31)
    expect(women().length).toBe(15)
    expect(men().length).toBe(15)
    expect(facePool.length).toBe(30)
    expect(simeonFace()?.gender).toBe('male')
    expect(facePool.some((face) => face.id === simeonFaceId)).toBe(false)
    expect(new Set(faces.map((face) => face.version)).size).toBe(31)
    // Each face's version is the host's for its bytes (agent-avatar.ts: SHA-256, 16 hex), so an agent wearing it is known by it.
    for (const face of faces) {
      const bytes = readFileSync(
        new URL(
          `../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/${face.file}`,
          import.meta.url,
        ),
      )
      expect(bytes.subarray(0, 4).toString('latin1'), face.id).toBe('RIFF')
      expect(bytes.length, face.id).toBeLessThan(40_000)
      expect(
        createHash('sha256').update(bytes).digest('hex').slice(0, 16),
        face.id,
      ).toBe(face.version)
    }
  })
})

describe('the face an agent is given', () => {
  it('is a woman’s for a woman’s name and a man’s for a man’s', () => {
    const plan = facePlan([
      agent('a1', 'Maya'),
      agent('a2', 'Leo'),
      agent('a3', 'Ms Taylor'),
      agent('a4', 'Mr. Kim'),
    ])
    expect(
      Object.fromEntries(plan.map((one) => [one.agentId, one.face.gender])),
    ).toEqual({ a1: 'female', a2: 'male', a3: 'female', a4: 'male' })
  })

  it('is the least used face of the gender', () => {
    // Every woman's face but one is worn already: Nina gets that one.
    const free = women()[6]!
    const roster = women()
      .filter((face) => face !== free)
      .map((face, i) => agent(`w${i}`, 'Agent', { wearing: face.id }))
    roster.push(agent('nina', 'Nina'))
    expect(facePlan(roster).map((one) => one.face)).toEqual([free])
    // With every face worn once, the next woman gets one worn once, not one worn twice.
    const full = women().map((face, i) =>
      agent(`x${i}`, 'Agent', { wearing: face.id }),
    )
    full.push(agent('y', 'Agent', { wearing: women()[0]!.id }))
    full.push(agent('maya', 'Maya'))
    const given = facePlan(full)[0]?.face
    expect(given).toBeDefined()
    expect(given).not.toBe(women()[0])
  })

  it('differs for agents hired together', () => {
    const names = ['Maya', 'Nina', 'Ava', 'Isla', 'Fatou', 'Zoë']
    const plan = facePlan(names.map((name, i) => agent(`hire-${i}`, name)))
    expect(plan.length).toBe(6)
    expect(new Set(plan.map((one) => one.face.id)).size).toBe(6)
    expect(plan.every((one) => one.face.gender === 'female')).toBe(true)
  })

  it('is the same on every device', () => {
    const roster = [
      agent('7d1c', 'Simeon', { title: 'Chief of Staff', created: 1 }),
      agent('b22e', 'Leo'),
      agent('a91f', 'Maya'),
      agent('d4', 'Jordan'),
      agent('e5', 'Ava'),
    ]
    const of = (agents: Agent[]) =>
      facePlan(agents).map((one) => `${one.agentId}=${one.face.id}`)
    expect(of([...roster].reverse())).toEqual(of(roster))
    // Ties go by the voices' FNV-1a hash of the id, as the Mac's.
    expect(pickFace('maya', 'female', [])).toBe(
      women()[stableHash('maya') % women().length],
    )
  })

  it('takes its voice’s gender for a name with none, and keeps it', () => {
    // Jordan speaks with Michael's voice: a man's face. Sage speaks with Veda's: a woman's.
    const plan = facePlan([
      agent('j', 'Jordan', { voice: 'ljX1ZrXuDIIRVcmiVSyR' }),
      agent('s', 'Sage', { voice: 'XcXEQzuLXRU9RcfWzEJt' }),
    ])
    expect(plan.map((one) => one.face.gender)).toEqual(['male', 'female'])
    // With no voice, its id picks a gender, always the same one.
    const alex = agent('alex-1', 'Alex')
    const gender = genderFor(alex)
    expect(gender).toBe(stableHash('alex-1') % 2 === 0 ? 'female' : 'male')
    expect(facePlan([alex])[0]?.face.gender).toBe(gender)
    // Once it has a face, the face's gender is its own, and its voice is given of that gender.
    const riley = agent('riley', 'Riley', { face: women()[2]!.id })
    expect(genderFor(riley)).toBe('female')
    const given = voicePlan([riley], listed).voices.riley
    expect(given && curatedGenders[given]).toBe('female')
    const manly = { ...riley, avatarShape: men()[0]!.id }
    const again = voicePlan([manly], listed).voices.riley
    expect(again && curatedGenders[again]).toBe('male')
  })

  it('is Simeon’s for the Chief of Staff, and no one else’s', () => {
    const roster = [
      agent('cos', 'Simeon', { title: 'Chief of Staff', created: 1 }),
      agent('later', 'Ezra', { title: 'Chief of Staff', created: 5 }),
      ...Array.from({ length: 40 }, (_, i) => agent(`m${i}`, 'Leo')),
    ]
    const plan = facePlan(roster)
    expect(plan.find((one) => one.agentId === 'cos')?.face.id).toBe(
      simeonFaceId,
    )
    expect(plan.filter((one) => one.face.id === simeonFaceId).length).toBe(1)
    // Renamed, he keeps it: it is the Chief of Staff's, whatever his name.
    expect(
      facePlan([agent('cos', 'Maya', { title: 'Chief of Staff' })])[0]?.face.id,
    ).toBe(simeonFaceId)
  })

  it('leaves pictures of their own, and gives a face back', () => {
    const plan = facePlan([
      agent('own', 'Maya', { picture: png }),
      agent('wears', 'Leo', { wearing: men()[3]!.id }),
      agent('back', 'Nina', { face: women()[9]!.id }),
      agent('team', 'Team', { group: true }),
      agent('theirs', 'Shared', { room: true }),
    ])
    expect(plan.map((one) => one.agentId)).toEqual(['back'])
    expect(plan[0]?.face).toBe(women()[9])
  })
})

describe('New Agent’s face', () => {
  it('is the face the agent gets', () => {
    const roster = [agent('w', 'Maya', { wearing: women()[0]!.id })]
    const nora = previewFace('Nora', roster)
    expect(nora?.gender).toBe('female')
    expect(nora).not.toBe(women()[0])
    expect(previewFace('  Nora ', roster)).toBe(nora)
    expect(previewFace('Leo', roster)?.gender).toBe('male')
    // Sent as its face, it is the one it is given.
    expect(
      facePlan([...roster, agent('new', 'Nora', { face: nora?.id })])[0]?.face,
    ).toBe(nora)
  })
})

describe('the editor’s Shuffle and Reset', () => {
  it('Shuffle goes to the next face no one wears', () => {
    const w = women()
    // Maya wears the first; the second is worn by Nina: Shuffle skips to the third.
    const roster = [
      agent('maya', 'Maya', { wearing: w[0]!.id }),
      agent('nina', 'Nina', { wearing: w[1]!.id }),
    ]
    expect(shuffledFace(w[0], 'female', 'maya', roster)).toBe(w[2])
    // From the last, round again to the first free one.
    expect(shuffledFace(w[w.length - 1], 'female', 'maya', roster)).toBe(w[0])
    // Switching to the men's faces starts at the first free man's.
    expect(shuffledFace(undefined, 'male', 'maya', roster)).toBe(men()[0])
    // With every face worn by someone else, simply the next.
    const everyone = w.map((face, i) =>
      agent(`w${i}`, 'Ava', { wearing: face.id }),
    )
    expect(shuffledFace(w[3], 'female', 'w3', everyone)).toBe(w[4])
  })

  it('Reset goes back to the face given', () => {
    const given = women()[7]!
    const uploaded = agent('maya', 'Maya', { face: given.id, picture: png })
    expect(faceForReset(uploaded, [uploaded])).toBe(given)
    // An agent from before faces, with a picture of its own and no face given: the face it would be given now.
    const old = agent('leo', 'Leo', { picture: png })
    expect(faceForReset(old, [old])?.gender).toBe('male')
    const chief = agent('cos', 'Simeon', {
      title: 'Chief of Staff',
      picture: png,
    })
    expect(faceForReset(chief, [chief])?.id).toBe(simeonFaceId)
  })

  it('a face of the other gender changes the voice', () => {
    const maya = agent('maya', 'Maya', { voice: 'XcXEQzuLXRU9RcfWzEJt' }) // Veda
    // A man's face: a man's voice with it.
    const voice = voiceForFace(maya, men()[0]!, [maya], listed)
    expect(voice && curatedGenders[voice]).toBe('male')
    expect(voice).not.toBe('Cz0K1kOv9tD8l0b5Qu53')
    // Another woman's face: the voice stays.
    expect(voiceForFace(maya, women()[5]!, [maya], listed)).toBeUndefined()
    // No voice yet: none given here (the voice pass gives one of the face's gender).
    expect(
      voiceForFace(agent('x', 'Maya'), men()[0]!, [], listed),
    ).toBeUndefined()
    // The Chief of Staff back in Simeon's face gets Simeon's voice back.
    const chief = agent('cos', 'Simeon', {
      title: 'Chief of Staff',
      voice: 'XcXEQzuLXRU9RcfWzEJt',
    })
    expect(
      voiceForFace(chief, simeonFace() as AgentFace, [chief], listed),
    ).toBe('Cz0K1kOv9tD8l0b5Qu53')
  })
})
