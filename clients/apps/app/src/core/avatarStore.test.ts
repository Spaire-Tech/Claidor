// Step 4b's store against a stand-in computer and server (StoreFaces.swift,
// StoreAgents.swift's avatar setters and `createAgent(name:draft:)`,
// Store.swift's voices): a face worn, shuffled and reset with its picture's
// bytes and the face kept on the agent; a picture of its own; a generated
// picture asked for as the Mac asks; the voices given, picked and kept; New
// Agent's agent made with what was chosen. The core's `StoreFaceTests`,
// `AgentDraftTests`' store cases and `testThePickerAndTheCallShowAndSpeakTheSameVoice`.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AgentDraft, base64Of } from './agentDraft'
import { curatedGenders } from './agentVoices'
import {
  type AgentFace,
  faceById,
  facePool,
  previewFace,
  wornFace,
} from './faces'
import type { JSONValue } from './json'
import { type Agent, agentFrom, makeAgent } from './models'
import { plainProblem } from './plainWords'
import { AppStore } from './store'
import { FakeBackend } from './testing'

const women = () => facePool.filter((face) => face.gender === 'female')
const men = () => facePool.filter((face) => face.gender === 'male')
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

/** A face's bytes as the app ships them, read from the core's own copy. */
function faceBytes(face: AgentFace): Uint8Array {
  return new Uint8Array(
    readFileSync(
      new URL(
        `../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/${face.file}`,
        import.meta.url,
      ),
    ),
  )
}

/** The voices as the server lists them (`proxy/v1/voice/voices`). */
const voiceRows: JSONValue = [
  { id: 'ljX1ZrXuDIIRVcmiVSyR', name: 'Michael', gender: 'male' },
  {
    id: 'XcXEQzuLXRU9RcfWzEJt',
    name: 'Veda',
    gender: 'female',
    preview_url: 'https://storage.example/veda.mp3',
  },
  { id: 's3TPKV1kjDlVtZbl4Ksh', name: 'Adam', gender: 'male' },
  { id: 'WI5pMmcGGS32yI7yttoP', name: 'Amanda', gender: 'female' },
]

/**
 * A computer that keeps what it is sent, as the host does: a picture's bytes
 * become the agent's picture and its version (a face's bytes: the face's
 * own), a profile's fields are kept, a new agent is listed.
 */
async function attached(agents: Agent[], options: { voices?: boolean } = {}) {
  const backend = new FakeBackend()
  backend.agents = agents
  if (options.voices !== false)
    backend.serverAnswers['proxy/v1/voice/voices'] = voiceRows
  const row = (id: unknown) =>
    backend.agents.findIndex((agent) => agent.id === id)
  backend.commandAnswers.setAgentAvatarBytes = (args) => {
    const at = row((args as { id: string }).id)
    const bytes = (args as { pngBase64: string | null }).pngBase64
    if (at >= 0) {
      const face = facePool.find((one) => base64Of(faceBytes(one)) === bytes)
      backend.agents[at] = {
        ...backend.agents[at]!,
        avatarDataURL: bytes ? `data:image/png;base64,${bytes}` : undefined,
        avatarVersion: bytes ? (face?.version ?? 'own0123456789ab') : undefined,
      }
    }
    return {}
  }
  backend.commandAnswers.updateAgent = (args) => {
    const { id, profile } = args as {
      id: string
      profile: Record<string, string>
    }
    const at = row(id)
    if (at >= 0) backend.agents[at] = { ...backend.agents[at]!, ...profile }
    return {}
  }
  let made = 0
  backend.commandAnswers.createAgent = (args) => {
    made += 1
    const fields = args as Record<string, string>
    const agent = agentFrom({ id: `new-${made}`, ...fields })!
    backend.agents = [...backend.agents, agent]
    return { agent: { id: agent.id, name: agent.name } }
  }
  const store = new AppStore()
  store.readFace = async (face) => faceBytes(face)
  await store.attach(backend)
  return { backend, store }
}

const sentOf = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('the avatar editor’s faces', () => {
  it('a face picked is sent as its picture and kept on the agent, shown at once', async () => {
    const maya = makeAgent({
      id: 'maya',
      name: 'Maya',
      avatarShape: women()[0]!.id,
      avatarVersion: women()[0]!.version,
    })
    const { backend, store } = await attached([maya])
    const face = women()[3]!
    // Shown before the computer has it.
    let shown: AgentFace | undefined
    backend.beforeAnswer = (method) => {
      if (method === 'setAgentAvatarBytes')
        shown = wornFace(store.agent('maya')!)
    }
    await store.wearFace('maya', face)
    expect(shown).toBe(face)
    expect(sentOf(backend, 'setAgentAvatarBytes')).toEqual([
      { id: 'maya', pngBase64: base64Of(faceBytes(face)) },
    ])
    expect(sentOf(backend, 'updateAgent')).toEqual([
      {
        id: 'maya',
        profile: { name: 'Maya', description: '', avatarShape: face.id },
      },
    ])
    // The computer's row: the face's bytes (its version) and the face kept.
    expect(wornFace(store.agent('maya')!)).toBe(face)
    expect(store.agent('maya')?.avatarShape).toBe(face.id)
  })

  it('Shuffle puts on the next face, an upload keeps the face, Reset goes back to it', async () => {
    const leo = makeAgent({
      id: 'leo',
      name: 'Leo',
      avatarShape: men()[0]!.id,
      avatarVersion: men()[0]!.version,
    })
    const { store } = await attached([leo])
    const other = await store.shuffleFace('leo', 'female')
    expect(other?.gender).toBe('female')
    expect(wornFace(store.agent('leo')!)).toBe(other)
    expect(store.agent('leo')?.avatarShape).toBe(other?.id)
    await store.setAvatarImage('leo', png)
    expect(wornFace(store.agent('leo')!)).toBeUndefined()
    expect(store.agent('leo')?.avatarDataURL).toBe(
      `data:image/png;base64,${base64Of(png)}`,
    )
    expect(store.agent('leo')?.avatarShape).toBe(other?.id)
    await store.resetFace('leo')
    expect(wornFace(store.agent('leo')!)).toBe(other)
  })

  it('a face of the other gender brings a voice of its gender', async () => {
    const maya = makeAgent({
      id: 'maya',
      name: 'Maya',
      voiceId: 'XcXEQzuLXRU9RcfWzEJt', // Veda
      avatarShape: women()[0]!.id,
      avatarVersion: women()[0]!.version,
    })
    const { backend, store } = await attached([maya])
    await store.wearFace('maya', men()[2]!)
    const profile = (
      sentOf(backend, 'updateAgent')[0] as {
        profile: Record<string, string>
      }
    ).profile
    expect(profile.avatarShape).toBe(men()[2]!.id)
    expect(curatedGenders[profile.voiceId!]).toBe('male')
    expect(store.agent('maya')?.voiceId).toBe(profile.voiceId)
  })

  it('a face the computer refuses puts the roster back, and says why', async () => {
    const face = women()[0]!
    const { backend, store } = await attached([
      makeAgent({
        id: 'maya',
        name: 'Maya',
        avatarShape: face.id,
        avatarVersion: face.version,
      }),
    ])
    backend.refusedCommands.add('setAgentAvatarBytes')
    await expect(store.wearFace('maya', women()[5]!)).rejects.toThrow(
      "The computer didn't answer.",
    )
    expect(wornFace(store.agent('maya')!)).toBe(face)
  })

  it('a face the app can’t read is said, and nothing is sent', async () => {
    const { backend, store } = await attached([
      makeAgent({ id: 'maya', name: 'Maya' }),
    ])
    store.readFace = async () => undefined
    await expect(store.wearFace('maya', women()[1]!)).rejects.toThrow(
      `The face ${women()[1]!.id} is missing from the app.`,
    )
    expect(sentOf(backend, 'setAgentAvatarBytes')).toEqual([])
  })

  it('a picture taken off sends none', async () => {
    const { backend, store } = await attached([
      makeAgent({
        id: 'maya',
        name: 'Maya',
        avatarDataURL: 'data:image/png;base64,AA',
      }),
    ])
    await store.setAvatarImage('maya', null)
    expect(sentOf(backend, 'setAgentAvatarBytes')).toEqual([
      { id: 'maya', pngBase64: null },
    ])
  })
})

describe('a picture drawn from words', () => {
  it('is asked for as the Mac asks, at the cheapest quality', async () => {
    const { backend, store } = await attached([])
    backend.serverAnswers['proxy/v1/images/generations'] = {
      data: [{ b64_json: base64Of(png), mime_type: 'image/png' }],
      usage: {},
    }
    expect(await store.generateAvatarImage('  a fox in a scarf \n')).toEqual(
      png,
    )
    expect(
      backend.serverCalls.filter(
        (call) => call.path === 'proxy/v1/images/generations',
      ),
    ).toEqual([
      {
        path: 'proxy/v1/images/generations',
        method: 'POST',
        body: { prompt: 'a fox in a scarf', size: 'auto', quality: 'low' },
      },
    ])
  })

  it('says so when nothing comes back, when nothing was described, or the server refuses', async () => {
    const { backend, store } = await attached([])
    await expect(store.generateAvatarImage('   ')).rejects.toThrow(
      'Describe the avatar to generate first.',
    )
    backend.serverAnswers['proxy/v1/images/generations'] = { data: [] }
    await expect(store.generateAvatarImage('a fox')).rejects.toThrow(
      'Image generation returned no picture.',
    )
    backend.serverFails = true
    await expect(store.generateAvatarImage('a fox')).rejects.toThrow('Refused.')
  })
})

describe('the voices', () => {
  it('are read once in ten minutes', async () => {
    const { backend, store } = await attached([])
    expect((await store.voices()).map((voice) => voice.name)).toEqual([
      'Michael',
      'Veda',
      'Adam',
      'Amanda',
    ])
    await store.voices()
    expect(
      backend.serverPaths.filter((path) => path === 'proxy/v1/voice/voices')
        .length,
    ).toBe(1)
  })

  it('none when calls are off: nothing given, nothing judged', async () => {
    const { backend, store } = await attached(
      [makeAgent({ id: 'leo', name: 'Leo' })],
      { voices: false },
    )
    expect(await store.voices()).toEqual([])
    expect(await store.ensureVoice('leo')).toBeUndefined()
    expect(sentOf(backend, 'updateAgent')).toEqual([])
  })

  it('the picker gives an agent without one its voice, and every other agent missing one, saved on each', async () => {
    const { backend, store } = await attached([
      makeAgent({ id: 'iris', name: 'Iris', title: 'Travel' }),
      makeAgent({ id: 'theo', name: 'Theo', voiceId: 'gone' }),
      makeAgent({ id: 'nina', name: 'Nina', voiceId: 'WI5pMmcGGS32yI7yttoP' }),
    ])
    const iris = await store.ensureVoice('iris')
    expect(iris && curatedGenders[iris]).toBe('female')
    expect(store.agent('iris')?.voiceId).toBe(iris)
    expect(sentOf(backend, 'updateAgent')).toEqual([
      {
        id: 'iris',
        profile: {
          name: 'Iris',
          description: '',
          title: 'Travel',
          voiceId: iris!,
        },
      },
      {
        id: 'theo',
        profile: {
          name: 'Theo',
          description: '',
          title: '',
          voiceId: store.agent('theo')!.voiceId!,
        },
      },
    ])
    // Kept: asked again, nothing more is given.
    expect(await store.ensureVoice('iris')).toBe(iris)
    expect(sentOf(backend, 'updateAgent').length).toBe(2)
  })

  it('a voice picked is shown at once; refused, the old one comes back and the refusal is thrown', async () => {
    const { backend, store } = await attached([
      makeAgent({
        id: 'iris',
        name: 'Iris',
        title: 'Travel',
        voiceId: 'XcXEQzuLXRU9RcfWzEJt',
      }),
      makeAgent({ id: 'team', name: 'Team', isGroup: true }),
    ])
    await store.setAgentVoice('iris', 'WI5pMmcGGS32yI7yttoP')
    await store.setAgentVoice('team', 'ljX1ZrXuDIIRVcmiVSyR')
    expect(sentOf(backend, 'updateAgent')).toEqual([
      {
        id: 'iris',
        profile: {
          name: 'Iris',
          description: '',
          voiceId: 'WI5pMmcGGS32yI7yttoP',
          title: 'Travel',
        },
      },
      {
        id: 'team',
        profile: {
          name: 'Team',
          description: '',
          voiceId: 'ljX1ZrXuDIIRVcmiVSyR',
        },
      },
    ])
    backend.refusedCommands.add('updateAgent')
    const picking = store.setAgentVoice('iris', 's3TPKV1kjDlVtZbl4Ksh')
    expect(store.agent('iris')?.voiceId).toBe('s3TPKV1kjDlVtZbl4Ksh')
    await expect(picking).rejects.toThrow()
    expect(store.agent('iris')?.voiceId).toBe('WI5pMmcGGS32yI7yttoP')
  })
})

describe('New Agent', () => {
  const team = () => [
    makeAgent({
      id: 'maya',
      name: 'Maya',
      avatarShape: women()[0]!.id,
      avatarVersion: women()[0]!.version,
      voiceId: 'XcXEQzuLXRU9RcfWzEJt',
    }),
  ]

  it('nothing chosen: the face its name gets and its title, introduced at once, no voice', async () => {
    const { backend, store } = await attached(team())
    const draft = new AgentDraft({ name: 'Ava' })
      .settleFace(store.agents)
      .titled('Personal Shopper')
    const id = await store.createAgentFromDraft('Ava', draft)
    expect(id).toBe('new-1')
    const [args] = sentOf(backend, 'createAgent') as Record<string, unknown>[]
    expect(args).toEqual({
      name: 'Ava',
      description: '',
      isKickstartRequested: true,
      origin: 'user',
      clientNonce: expect.stringMatching(/^ios-[0-9a-f-]{36}$/),
      title: 'Personal Shopper',
      avatarShape: previewFace('Ava', team())!.id,
    })
    expect(store.agent('new-1')?.title).toBe('Personal Shopper')
    expect(sentOf(backend, 'setAgentAvatarBytes')).toEqual([])
  })

  it('a face and a picture chosen: the face kept, the voice of its gender, the picture sent after', async () => {
    const { backend, store } = await attached(team())
    const man = men()[1]!
    const draft = new AgentDraft({ name: 'Nora' })
      .settleFace(store.agents)
      .wear(man, store.agents, await store.voices())
      .withPicture(png)
    const id = await store.createAgentFromDraft('Nora', draft)
    const [args] = sentOf(backend, 'createAgent') as Record<string, string>[]
    expect(args!.avatarShape).toBe(man.id)
    expect(curatedGenders[args!.voiceId!]).toBe('male')
    expect(args!.title).toBeUndefined()
    expect(sentOf(backend, 'setAgentAvatarBytes')).toEqual([
      { id, pngBase64: base64Of(png) },
    ])
    const made = store.agent(id!)!
    expect(made.avatarShape).toBe(man.id)
    // The picture stays; no face is put on over it.
    expect(wornFace(made)).toBeUndefined()
    expect(made.avatarDataURL).toBe(`data:image/png;base64,${base64Of(png)}`)
  })

  it('names no command when the answer has no agent (testTheAppsOwnFailureNamesNoCommand)', async () => {
    // 3 November 2026: "Couldn't create Arlo: createAgent: no agent in the answer".
    const { backend, store } = await attached(team())
    backend.commandAnswers.createAgent = () => ({})
    const draft = new AgentDraft({ name: 'Arlo' }).settleFace(store.agents)
    expect(await store.createAgentFromDraft('Arlo', draft)).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't create Arlo: gateway createAgent failed: no agent in the answer",
    )
    expect(plainProblem(store.problem ?? '')).toBe(
      "Couldn't create Arlo. Try again in a little while.",
    )
  })

  it('a voice picked goes with it', async () => {
    const { backend, store } = await attached(team())
    const draft = new AgentDraft({ name: 'Leo' })
      .settleFace(store.agents)
      .pickVoice('s3TPKV1kjDlVtZbl4Ksh')
    await store.createAgentFromDraft('Leo', draft)
    expect(
      (sentOf(backend, 'createAgent')[0] as Record<string, string>).voiceId,
    ).toBe('s3TPKV1kjDlVtZbl4Ksh')
  })

  it('refused: nothing made, the core’s words kept', async () => {
    const { backend, store } = await attached(team())
    backend.refusedCommands.add('createAgent')
    expect(
      await store.createAgentFromDraft('Ava', new AgentDraft({ name: 'Ava' })),
    ).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't create Ava: The computer didn't answer.",
    )
    // An answer with no agent in it is a refusal too.
    backend.refusedCommands.clear()
    backend.commandAnswers.createAgent = () => ({ id: 'x' })
    expect(
      await store.createAgentFromDraft('Ava', new AgentDraft({ name: 'Ava' })),
    ).toBeUndefined()
  })

  it('a picture the computer refuses leaves the agent made, wearing its face', async () => {
    const { backend, store } = await attached(team())
    backend.commandAnswers.setAgentAvatarBytes = () => {
      throw new Error('The avatar is not a recognized image.')
    }
    const draft = new AgentDraft({ name: 'Nora' })
      .settleFace(store.agents)
      .withPicture(png)
    const id = await store.createAgentFromDraft('Nora', draft)
    expect(id).toBe('new-1')
    expect(faceById(store.agent(id!)?.avatarShape)).toBe(
      draft.shownFace(team()),
    )
  })
})
