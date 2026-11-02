// The ports of step 4b against the shared core's own answers
// (`fixtures/avatar-core.json`): SimeonCore built with Swift on Linux in the
// session's scratchpad, its AgentVoices, AgentFaces, AgentDraft, AvatarCrop
// and AvatarEditorWords run on inputs chosen to reach each branch, the
// inputs and the answers written together. The same inputs here must give
// the same answers.

import { describe, expect, it } from 'vitest'
import { AgentDraft } from './agentDraft'
import {
  type VoiceChoice,
  keptVoice,
  nameGender,
  pickVoice,
  voicePlan,
} from './agentVoices'
import { AvatarCrop, avatarEditorWords } from './avatarCrop'
import {
  faceById,
  faceForReset,
  facePlan,
  genderFor,
  ownFace,
  pictureOf,
  previewFace,
  shuffledFace,
  stableHash,
  voiceForFace,
  wornFace,
} from './faces'
import fixture from './fixtures/avatar-core.json'
import { type Agent, makeAgent } from './models'

type Row = {
  id: string
  name: string
  title: string
  voiceId: string | null
  avatarShape: string | null
  avatarVersion: string | null
  avatarDataURL: string | null
  isGroup: boolean
  isRemoteRoom: boolean
  createdAt: number | null
}

const or = <T>(value: T | null): T | undefined => value ?? undefined

function agentOf(row: Row): Agent {
  return makeAgent({
    id: row.id,
    name: row.name,
    title: row.title,
    voiceId: or(row.voiceId),
    avatarShape: or(row.avatarShape),
    avatarVersion: or(row.avatarVersion),
    avatarDataURL: or(row.avatarDataURL),
    isGroup: row.isGroup,
    isRemoteRoom: row.isRemoteRoom,
    createdAt: or(row.createdAt),
  })
}

const core = fixture as unknown as {
  voiceLists: Record<
    string,
    { id: string; name: string; gender: string | null }[]
  >
  rosters: Record<string, Row[]>
  extraAgents?: Record<string, Row>
  [part: string]: unknown
}
const voices = (name: string): VoiceChoice[] =>
  core.voiceLists[name]!.map((voice) => ({
    id: voice.id,
    name: voice.name,
    gender: or(voice.gender),
  }))
const roster = (name: string): Agent[] => core.rosters[name]!.map(agentOf)
const part = <T>(name: string) => core[name] as T[]
const face = (id: string | null) => (id === null ? undefined : faceById(id))

describe('the voices, as the core gives them', () => {
  it('reads a name’s gender as the core does', () => {
    for (const one of part<{ name: string; gender: string | null }>(
      'nameGender',
    ))
      expect(nameGender(one.name) ?? null, one.name).toBe(one.gender)
  })

  it('hashes as the core does', () => {
    for (const one of part<{ text: string; hash: number }>('hash'))
      expect(stableHash(one.text), one.text).toBe(one.hash)
  })

  it('picks the voice the core picks', () => {
    for (const one of part<{
      voices: string
      agentId: string
      name: string
      isChiefOfStaff: boolean
      taken: string[]
      gender: string | null
      voice: string | null
    }>('pick'))
      expect(
        pickVoice({
          agentId: one.agentId,
          name: one.name,
          isChiefOfStaff: one.isChiefOfStaff,
          voices: voices(one.voices),
          taken: one.taken,
          gender: or(one.gender),
        }) ?? null,
        JSON.stringify(one),
      ).toBe(one.voice)
  })

  it('keeps the voices the core keeps', () => {
    for (const one of part<{
      voiceId: string
      voices: string
      kept: string | null
    }>('kept'))
      expect(keptVoice(one.voiceId, voices(one.voices)) ?? null).toBe(one.kept)
  })

  it('gives in one pass the voices the core gives', () => {
    for (const one of part<{
      roster: string
      voices: string
      all: Record<string, string>
      given: [string, string][]
    }>('voicePlan')) {
      const plan = voicePlan(roster(one.roster), voices(one.voices))
      const where = `${one.roster} with ${one.voices}`
      expect(plan.voices, where).toEqual(one.all)
      expect(
        plan.given.map((given) => [given.agentId, given.voiceId]),
        where,
      ).toEqual(one.given)
    }
  })
})

describe('the faces, as the core chooses them', () => {
  it('gives in one pass the faces the core gives', () => {
    for (const one of part<{
      roster: string
      voices: string
      given: [string, string][]
    }>('facePlan'))
      expect(
        facePlan(roster(one.roster), voices(one.voices)).map((given) => [
          given.agentId,
          given.face.id,
        ]),
        one.roster,
      ).toEqual(one.given)
  })

  it('reads an agent’s gender, Reset, the editor’s words and its picture as the core does', () => {
    for (const one of part<{
      roster: string
      agent: string
      voices: string
      gender: string
    }>('genderFor')) {
      const agent = roster(one.roster).find((row) => row.id === one.agent)!
      expect(genderFor(agent, voices(one.voices)), one.agent).toBe(one.gender)
    }
    for (const one of part<{
      roster: string
      agent: string
      voices: string
      face: string | null
    }>('reset')) {
      const agents = roster(one.roster)
      const agent = agents.find((row) => row.id === one.agent)!
      expect(
        faceForReset(agent, agents, voices(one.voices))?.id ?? null,
        `${one.roster}/${one.agent}`,
      ).toBe(one.face)
    }
    for (const one of part<{
      roster: string
      agent: string
      reset: string | null
      gender: string
      worn: string | null
      own: string | null
      picture: string | null
    }>('editorWords')) {
      const agent = roster(one.roster).find((row) => row.id === one.agent)!
      const where = `${one.roster}/${one.agent}`
      expect(avatarEditorWords.reset(agent) ?? null, where).toBe(one.reset)
      expect(avatarEditorWords.gender(agent), where).toBe(one.gender)
      expect(wornFace(agent)?.id ?? null, where).toBe(one.worn)
      expect(ownFace(agent)?.id ?? null, where).toBe(one.own)
      const picture = pictureOf(agent)
      expect(
        picture === undefined
          ? null
          : picture.kind === 'face'
            ? `face:${picture.face.id}`
            : 'own',
        where,
      ).toBe(one.picture)
    }
  })

  it('shows New Agent the face the core shows, and shuffles as it does', () => {
    for (const one of part<{
      roster: string
      name: string
      face: string | null
    }>('preview'))
      expect(
        previewFace(one.name, roster(one.roster))?.id ?? null,
        `${one.roster}/${one.name}`,
      ).toBe(one.face)
    for (const one of part<{
      roster: string
      agentId: string
      gender: string
      current: string | null
      face: string | null
    }>('shuffle'))
      expect(
        shuffledFace(
          face(one.current),
          one.gender,
          one.agentId,
          roster(one.roster),
        )?.id ?? null,
        JSON.stringify(one),
      ).toBe(one.face)
  })

  it('changes the voice with the face as the core does', () => {
    for (const one of part<{
      roster: string
      agent: string
      face: string
      voices: string
      voice: string | null
    }>('voiceFor')) {
      const agents = roster(one.roster)
      const agent =
        agents.find((row) => row.id === one.agent) ??
        agentOf(core.extraAgents![one.agent]!)
      expect(
        voiceForFace(agent, face(one.face)!, agents, voices(one.voices)) ??
          null,
        JSON.stringify([one.roster, one.agent, one.face, one.voices]),
      ).toBe(one.voice)
    }
  })
})

type Step = { op: string; value?: string; face?: string; gender?: string }

describe('a new agent’s draft, as the core keeps it', () => {
  it('gives the core’s face, voice and picture after every step', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ])
    const scripts = core.draftScripts as Record<string, Step[]>
    // Each state a row: these fields in this order, then the agent the editor draws, when given.
    const fields = core.draftFields as string[]
    const agentFields = core.draftAgentFields as string[]
    const named = (names: string[], row: unknown[]) =>
      Object.fromEntries(names.map((name, i) => [name, row[i]]))
    for (const run of part<{
      script: string
      roster: string
      voices: string
      after: unknown[][]
    }>('drafts')) {
      const agents = roster(run.roster)
      const list = voices(run.voices)
      const steps = scripts[run.script]!
      let draft = new AgentDraft()
      steps.forEach((step, index) => {
        switch (step.op) {
          case 'name':
            draft = draft.named(step.value!)
            break
          case 'title':
            draft = draft.titled(step.value!)
            break
          case 'settle':
            draft = draft.settleFace(agents)
            break
          case 'wear':
            draft = draft.wear(faceById(step.face)!, agents, list)
            break
          case 'shuffle':
            draft = draft.shuffle(step.gender!, agents, list)
            break
          case 'reset':
            draft = draft.reset(agents, list)
            break
          case 'picture':
            draft = draft.withPicture(png)
            break
          case 'pickVoice':
            draft = draft.pickVoice(step.value!)
            break
          case 'settleVoice':
            draft = draft.settleVoice(agents, list)
            break
        }
        const shown = draft.agent(agents)
        const row = run.after[index]!
        const want: Record<string, unknown> = named(fields, row)
        if (row.length > fields.length)
          want.agent = named(agentFields, row[fields.length] as unknown[])
        const got: Record<string, unknown> = {
          shownFace: draft.shownFace(agents)?.id ?? null,
          voice: draft.voice(agents, list) ?? null,
          voiceId: draft.voiceId ?? null,
          chosen: draft.chosen,
          resettable: draft.resettable,
          picture: draft.picture !== undefined,
          resetWords: avatarEditorWords.resetDraft(draft) ?? null,
        }
        if (want.agent)
          got.agent = {
            avatarShape: shown.avatarShape ?? null,
            avatarVersion: shown.avatarVersion ?? null,
            avatarDataURL: shown.avatarDataURL ?? null,
            voiceId: shown.voiceId ?? null,
            name: shown.name,
          }
        expect(
          got,
          `${run.script} on ${run.roster} with ${run.voices}, step ${index}`,
        ).toEqual(want)
      })
    }
  })
})

describe('the crop, as the core moves it', () => {
  it('pans and zooms to the core’s numbers', () => {
    for (const run of part<{
      width: number
      height: number
      moves: { op: string; dx?: number; dy?: number; to?: number | 'nan' }[]
      after: {
        zoom: number
        centerX: number
        centerY: number
        side: number
        scale: number
        rect: number[]
        placement: number[]
      }[]
    }>('crops')) {
      let crop = new AvatarCrop(run.width, run.height)
      const seen = [crop]
      for (const move of run.moves) {
        crop =
          move.op === 'pan'
            ? crop.panned(move.dx!, move.dy!)
            : crop.zoomed(move.to === 'nan' ? Number.NaN : move.to!)
        seen.push(crop)
      }
      seen.forEach((one, index) => {
        const want = run.after[index]!
        const where = `${run.width}×${run.height}, step ${index}`
        const close = (got: number, wanted: number) =>
          expect(got, where).toBeCloseTo(wanted, 9)
        close(one.zoom, want.zoom)
        close(one.centerX, want.centerX)
        close(one.centerY, want.centerY)
        close(one.side, want.side)
        close(one.scale, want.scale)
        const r = one.rect
        ;[r.x, r.y, r.width, r.height].forEach((got, i) =>
          close(got, want.rect[i]!),
        )
        const p = one.placement
        ;[p.x, p.y, p.width, p.height].forEach((got, i) =>
          close(got, want.placement[i]!),
        )
      })
    }
    for (const one of part<{
      width: number
      height: number
      fitted: number[]
    }>('fitted')) {
      const fitted = AvatarCrop.fitted(one.width, one.height)
      expect([fitted.width, fitted.height]).toEqual(one.fitted)
    }
  })
})
