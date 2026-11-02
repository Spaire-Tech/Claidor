// The voices as the core's tests have them (`AgentVoiceTests` in
// CoreTests.swift): a name's gender, the tie between free voices, one pass
// over a team, and the server's list read.

import { describe, expect, it } from 'vitest'
import {
  type VoiceChoice,
  keptVoice,
  menNames,
  nameGender,
  pickVoice,
  voiceChoicesFrom,
  voicePlan,
  womenNames,
} from './agentVoices'
import { makeAgent } from './models'

const curated: [string, string][] = [
  ['ljX1ZrXuDIIRVcmiVSyR', 'Michael'],
  ['1t1EeRixsJrKbiF1zwM6', 'Jerry'],
  ['XcXEQzuLXRU9RcfWzEJt', 'Veda'],
  ['s3TPKV1kjDlVtZbl4Ksh', 'Adam'],
  ['UgBBYS2sOqTuMpoF3BR0', 'Mark'],
  ['6OzrBCQf8cjERkYgzSg8', 'Jamal'],
  ['Cz0K1kOv9tD8l0b5Qu53', 'Simeon'],
  ['WI5pMmcGGS32yI7yttoP', 'Amanda'],
  ['snyKKuaGYk1VUEh42zbW', 'Chris'],
  ['gfRt6Z3Z8aTbpLfexQ7N', 'Boyd'],
  ['NHRgOEwqx5WZNClv5sat', 'Chelsea'],
  ['5u41aNhyCU6hXOcjPPv0', 'Hope'],
]
const listed: VoiceChoice[] = curated.map(([id, name]) => ({ id, name }))

describe('a name’s gender', () => {
  it('is the Mac’s', () => {
    const mac: [string, string | undefined][] = [
      ['Maya', 'female'],
      ['Nina', 'female'],
      ['Ava', 'female'],
      ['Zoë', 'female'],
      ['Ana Lucía', 'female'],
      ['Fatou', 'female'],
      ['Isla', 'female'],
      ['Ms Taylor', 'female'],
      ['Dr. Amara', 'female'],
      ['Leo', 'male'],
      ['Simeon', 'male'],
      ['Jon', 'male'],
      ['Mark', 'male'],
      ['Bassirou', 'male'],
      ['Theo', 'male'],
      ['Mr. Kim', 'male'],
      ['Sir Elton', 'male'],
      ['Jordan', undefined],
      ['Taylor', undefined],
      ['Riley', undefined],
      ['Sage', undefined],
      ['Atlas', undefined],
      ['', undefined],
      ['  ', undefined],
      ['Chloé-Anne', 'female'],
      ['MAYA', 'female'],
      ['Dr Jordan Lee', undefined],
      ['Jessica', 'female'],
    ]
    for (const [name, gender] of mac)
      expect(nameGender(name), name).toBe(gender)
  })

  it('reads the core’s own lists of names', () => {
    expect(womenNames.size).toBeGreaterThan(1000)
    expect(menNames.size).toBeGreaterThan(1000)
    expect(womenNames.has('mary') && menNames.has('james')).toBe(true)
  })
})

describe('the voice an agent gets', () => {
  it('breaks a tie between free voices by the Mac’s hash', () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      id: `v${n}`,
      name: `v${n}`,
    }))
    const mac: [string, string][] = [
      ['a', 'v6'],
      ['b', 'v7'],
      ['coo', 'v1'],
      ['maya', 'v5'],
      ['agent-12', 'v7'],
      ['0f6b7c1e-3c2a-4b8e-9d1f-1234567890ab', 'v3'],
      ['é', 'v1'],
      ['日本', 'v5'],
    ]
    for (const [id, voice] of mac)
      expect(
        pickVoice({
          agentId: id,
          name: 'Jordan',
          isChiefOfStaff: false,
          voices: seven,
          taken: [],
        }),
        id,
      ).toBe(voice)
  })

  it('in one pass, is the voice the Mac gives', () => {
    const agent = (
      id: string,
      name: string,
      title: string,
      fields: {
        voiceId?: string
        isGroup?: boolean
        isRemoteRoom?: boolean
      } = {},
    ) => makeAgent({ id, name, title, ...fields })
    const roster = [
      agent('7d1c', 'Simeon', 'Chief of Staff'),
      // Jessica, taken off the list.
      agent('a91f', 'Maya', 'Inbox', { voiceId: 'cgSgspJ2msm6clMCkdW9' }),
      agent('b22e', 'Leo', 'Growth'),
      agent('c3', 'Nina', 'Finance', { voiceId: 'WI5pMmcGGS32yI7yttoP' }),
      agent('d4', 'Jordan', 'Research'),
      agent('e5', 'Ava', ''),
      agent('f6', 'Team', '', { isGroup: true }),
      agent('g7', 'Theo', 'Books', { voiceId: '' }),
      agent('h8', 'Shared', '', { isRemoteRoom: true }),
    ]
    const plan = voicePlan(roster, listed)
    expect(plan.given.map((one) => `${one.agentId}=${one.voiceId}`)).toEqual([
      '7d1c=Cz0K1kOv9tD8l0b5Qu53',
      'a91f=5u41aNhyCU6hXOcjPPv0',
      'b22e=6OzrBCQf8cjERkYgzSg8',
      'd4=snyKKuaGYk1VUEh42zbW',
      'e5=NHRgOEwqx5WZNClv5sat',
      'g7=UgBBYS2sOqTuMpoF3BR0',
    ])
    // A listed voice stays.
    expect(plan.voices.c3).toBe('WI5pMmcGGS32yI7yttoP')
    expect(plan.voices.f6).toBeUndefined()
    expect(plan.voices.h8).toBeUndefined()
    // Nobody keeps Jessica.
    expect(Object.values(plan.voices)).not.toContain('cgSgspJ2msm6clMCkdW9')
    // Nothing listed: nothing judged, nothing given.
    expect(voicePlan(roster, []).given).toEqual([])
    expect(keptVoice('cgSgspJ2msm6clMCkdW9', [])).toBe('cgSgspJ2msm6clMCkdW9')
    expect(keptVoice('cgSgspJ2msm6clMCkdW9', listed)).toBeUndefined()
    expect(keptVoice('../x', [])).toBeUndefined()
  })
})

describe('the server’s list of voices', () => {
  it('is read as the core reads it: an id and a name each, the sample and the gender when there', () => {
    expect(
      voiceChoicesFrom([
        {
          id: 'XcXEQzuLXRU9RcfWzEJt',
          name: 'Veda',
          description: null,
          labels: {},
          gender: 'Female',
          preview_url: 'https://storage.example/veda.mp3',
        },
        { id: 'ljX1ZrXuDIIRVcmiVSyR', name: 'Michael', gender: 'neutral' },
        { id: '', name: 'Nobody' },
        { id: 'x1' },
        'not a voice',
      ]),
    ).toEqual([
      {
        id: 'XcXEQzuLXRU9RcfWzEJt',
        name: 'Veda',
        sample: 'https://storage.example/veda.mp3',
        gender: 'female',
      },
      { id: 'ljX1ZrXuDIIRVcmiVSyR', name: 'Michael' },
    ])
    expect(voiceChoicesFrom({ voices: [] })).toEqual([])
  })
})
