// New Agent's pencil as the core's tests have it (`AgentDraftTests` and
// `testTheNewAgentsFaceStaysWhileItsNameIsTyped` in AgentFaceTests.swift): a
// face, a picture and a voice chosen before the agent exists.

import { describe, expect, it } from 'vitest'
import { AgentDraft } from './agentDraft'
import type { VoiceChoice } from './agentVoices'
import { avatarEditorWords } from './avatarCrop'
import {
  faceById,
  facePool,
  pictureOf,
  previewFace,
  voiceGender,
  wornFace,
} from './faces'
import { makeAgent } from './models'

const listed: VoiceChoice[] = [
  ['ljX1ZrXuDIIRVcmiVSyR', 'Michael'],
  ['XcXEQzuLXRU9RcfWzEJt', 'Veda'],
  ['s3TPKV1kjDlVtZbl4Ksh', 'Adam'],
  ['WI5pMmcGGS32yI7yttoP', 'Amanda'],
  ['NHRgOEwqx5WZNClv5sat', 'Chelsea'],
].map(([id, name]) => ({ id: id!, name: name! }))
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])
const women = () => facePool.filter((face) => face.gender === 'female')

describe('a new agent’s draft', () => {
  it('untouched, is the face the name gets', () => {
    const draft = new AgentDraft({ name: 'Leo' })
    expect(draft.chosen).toBe(false)
    expect(draft.resettable).toBe(false)
    expect(avatarEditorWords.resetDraft(draft)).toBeUndefined()
    expect(draft.shownFace([])).toBe(previewFace('Leo', []))
    expect(draft.shownFace([])?.gender).toBe('male')
    // The editor draws it wearing that face.
    expect(wornFace(draft.agent([]))).toBe(draft.shownFace([]))
  })

  it('a face picked brings a voice of its gender', () => {
    const woman = facePool.find((face) => face.gender === 'female')!
    let draft = new AgentDraft({ name: 'Leo' }).wear(woman, [], listed)
    expect(draft.chosen).toBe(true)
    expect(draft.shownFace([])).toBe(woman)
    draft = draft.settleVoice([], listed)
    // Leo is a man's name; the woman's face picked for him decides his voice.
    expect(voiceGender(draft.voiceId, listed)).toBe('female')
    // A man's face then takes the voice back to a man's.
    const man = facePool.find((face) => face.gender === 'male')!
    draft = draft.wear(man, [], listed)
    expect(voiceGender(draft.voiceId, listed)).toBe('male')
  })

  it('a voice picked is kept while the face agrees', () => {
    let draft = new AgentDraft({ name: 'Maya' })
      .pickVoice('NHRgOEwqx5WZNClv5sat')
      .settleVoice([], listed)
    expect(draft.voiceId).toBe('NHRgOEwqx5WZNClv5sat')
    const another = women()[women().length - 1]!
    draft = draft.wear(another, [], listed)
    expect(draft.voiceId).toBe('NHRgOEwqx5WZNClv5sat')
  })

  it('a picture is worn instead of a face, and Reset goes back to the name’s', () => {
    let draft = new AgentDraft({ name: 'Nora' }).withPicture(png)
    const agent = draft.agent([])
    expect(wornFace(agent)).toBeUndefined()
    expect(pictureOf(agent)?.kind).toBe('own')
    expect(agent.avatarDataURL).toBe('data:image/png;base64,iVBORw0KGgoAAAAA')
    expect(draft.resettable).toBe(true)
    expect(avatarEditorWords.resetDraft(draft)).toBe('Reset face')
    // A face picked after takes the picture's place.
    draft = draft.shuffle('female', [], [])
    expect(draft.picture).toBeUndefined()
    expect(wornFace(draft.agent([]))).toBeDefined()
    draft = draft.reset([], [])
    expect(draft.resettable).toBe(false)
    expect(draft.shownFace([])).toBe(previewFace('Nora', []))
  })

  it('Shuffle skips the faces the team wears', () => {
    const w = women()
    const team = w
      .slice(0, -1)
      .map((face, i) =>
        makeAgent({ id: `w${i}`, name: 'Agent', avatarVersion: face.version }),
      )
    team.push(makeAgent({ id: 'theo', name: 'Theo' }))
    // The name alone already gets the face no one wears; Shuffle from a worn one lands on it too.
    let draft = new AgentDraft({ name: 'Ava' })
    expect(draft.shownFace(team)).toBe(w[w.length - 1])
    draft = draft.wear(w[0]!, team, []).shuffle('female', team, [])
    expect(draft.shownFace(team)).toBe(w[w.length - 1])
  })

  it('keeps its face while its name is typed', () => {
    const roster = [
      makeAgent({ id: 'w', name: 'Maya', avatarVersion: women()[0]!.version }),
    ]
    let draft = new AgentDraft().settleFace(roster)
    const first = draft.shownFace(roster)
    expect(first).toBeDefined()
    // Letter by letter, a name of no known gender keeps the face.
    for (const typed of ['Q', 'Qu', 'Qui', 'Quill', 'Quill Bot']) {
      draft = draft.named(typed).settleFace(roster)
      expect(draft.shownFace(roster), typed).toBe(first)
    }
    // A name of the other gender changes it once, then it stays.
    const [name, gender] =
      first?.gender === 'female' ? ['Leo', 'male'] : ['Nora', 'female']
    draft = draft.named(name).settleFace(roster)
    const changed = draft.shownFace(roster)
    expect(changed?.gender).toBe(gender)
    draft = draft.named(`${name} Smith`).settleFace(roster)
    expect(draft.shownFace(roster)).toBe(changed)
    // A face picked wins over the name's.
    draft = draft.wear(women()[3]!, roster, []).named('Leo').settleFace(roster)
    expect(draft.shownFace(roster)).toBe(women()[3])
    expect(faceById(draft.agent(roster).avatarShape)).toBe(women()[3])
  })
})
