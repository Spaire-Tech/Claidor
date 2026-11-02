// A new agent's look before it exists (ios/SimeonCore/Sources/SimeonCore/
// AgentDraft.swift; the founder, 13 October 2026: "have the avatar picker
// available too"): the face picked, else the one its name gets; a picture
// drawn or uploaded instead of a face; the voice picked, else, once the
// person chose anything, one of the face's gender, so a woman's face picked
// for "Leo" speaks with a woman's voice. Nothing goes to the computer until
// Create (the store's `createAgentFromDraft`).
//
// Swift's struct changes in place; this one gives a new draft for each
// change, as React's state wants it.

import {
  type VoiceChoice,
  keptVoice,
  nameGender,
  pickVoice,
} from './agentVoices'
import {
  type AgentFace,
  facePeople,
  nameSeed,
  previewFace,
  shuffledFace,
  voiceGender,
} from './faces'
import { type Agent, makeAgent } from './models'

/** Bytes as base64 (the picture's data address). */
export function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

interface DraftFields {
  name: string
  title: string
  face?: AgentFace
  given?: AgentFace
  picture?: Uint8Array
  voiceId?: string
}

export class AgentDraft {
  readonly name: string
  /** Its job, "Personal Shopper" (the founder, 19 October 2026); empty for none. */
  readonly title: string
  /** A face the person picked (a click, Shuffle); none follows the name. */
  readonly face?: AgentFace
  /** The face its name gets, kept while the name is typed (`settleFace`). */
  readonly given?: AgentFace
  /** A picture drawn or uploaded, cropped: the 256-pixel PNG the editor makes. */
  readonly picture?: Uint8Array
  /** The voice: picked, or settled for the editor to show. */
  readonly voiceId?: string

  constructor(fields: Partial<DraftFields> = {}) {
    this.name = fields.name ?? ''
    this.title = fields.title ?? ''
    this.face = fields.face
    this.given = fields.given
    this.picture = fields.picture
    this.voiceId = fields.voiceId
  }

  private with(changes: Partial<DraftFields>): AgentDraft {
    return new AgentDraft({
      name: this.name,
      title: this.title,
      face: this.face,
      given: this.given,
      picture: this.picture,
      voiceId: this.voiceId,
      ...changes,
    })
  }

  /** Another name (as typed, its words one space apart). */
  named(name: string): AgentDraft {
    return name === this.name ? this : this.with({ name })
  }

  /** Another title. */
  titled(title: string): AgentDraft {
    return title === this.title ? this : this.with({ title })
  }

  /** Whether the person chose anything; otherwise the agent is made as before (its name's face, a voice given later). */
  get chosen(): boolean {
    return (
      this.face !== undefined ||
      this.picture !== undefined ||
      this.voiceId !== undefined
    )
  }

  /** Whether the editor's Reset face has anything to undo. */
  get resettable(): boolean {
    return this.face !== undefined || this.picture !== undefined
  }

  /** The face shown and kept on the agent: the one picked, else its name's (settled, else as the name is now). */
  shownFace(agents: readonly Agent[]): AgentFace | undefined {
    return this.face ?? this.given ?? previewFace(this.name, agents)
  }

  /**
   * Settles the face its name gets, as the sheet opens and at each change
   * of the name (the founder, 25 October 2026: "with every word you write
   * change the avatar"): given once, it stays while the name is typed, and
   * changes only when the name becomes one of the other gender ("Sarah"
   * under a man's face).
   */
  settleFace(agents: readonly Agent[]): AgentDraft {
    const gender = nameGender(this.name)
    if (this.given && (gender === undefined || gender === this.given.gender))
      return this
    return this.with({ given: previewFace(this.name, agents) })
  }

  /** The agent as the editor draws it: no id yet, wearing the face (or the picture) and the voice chosen. */
  agent(agents: readonly Agent[]): Agent {
    const shown = this.shownFace(agents)
    return makeAgent({
      id: '',
      name: this.name,
      avatarShape: shown?.id,
      ...(this.picture
        ? { avatarDataURL: `data:image/png;base64,${base64Of(this.picture)}` }
        : { avatarVersion: shown?.version }),
      voiceId: this.voiceId,
    })
  }

  /** A face picked: worn instead of any picture; a voice of the other gender changes with it (as the store's `wearFace`). */
  wear(
    face: AgentFace,
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): AgentDraft {
    return this.with({ face, picture: undefined }).follow(face, agents, voices)
  }

  /** Shuffle: the next face of `gender` no agent wears. */
  shuffle(
    gender: string,
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): AgentDraft {
    const current =
      this.picture === undefined ? this.shownFace(agents) : undefined
    const next = shuffledFace(current, gender, '', agents)
    return next ? this.wear(next, agents, voices) : this
  }

  /** Reset face: back to the face its name gets, the picture gone. */
  reset(agents: readonly Agent[], voices: readonly VoiceChoice[]): AgentDraft {
    const bare = this.with({ face: undefined, picture: undefined })
    const shown = bare.shownFace(agents)
    return shown ? bare.follow(shown, agents, voices) : bare
  }

  /** A picture drawn or uploaded, worn instead of a face. */
  withPicture(png: Uint8Array): AgentDraft {
    return this.with({ picture: png })
  }

  pickVoice(voiceId: string): AgentDraft {
    return this.with({ voiceId })
  }

  /** The voice to show and send: the one picked while listed, else the voice of the face's gender the team has fewest of. */
  voice(
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): string | undefined {
    const kept = keptVoice(this.voiceId, voices)
    if (kept !== undefined) return kept
    if (voices.length === 0) return undefined
    return pickVoice({
      agentId: this.seed,
      name: this.name,
      isChiefOfStaff: false,
      voices,
      taken: this.taken(agents, voices),
      gender: this.shownFace(agents)?.gender,
    })
  }

  /** The voice kept for Create (`voice(agents, voices)`). */
  settleVoice(
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): AgentDraft {
    if (voices.length === 0) return this
    return this.with({ voiceId: this.voice(agents, voices) })
  }

  /** A voice picked of the other gender than the new face's gives way to one of its gender; a voice not picked follows the face anyway. */
  private follow(
    face: AgentFace,
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): AgentDraft {
    const current = keptVoice(this.voiceId, voices)
    if (current === undefined) return this
    const gender = voiceGender(current, voices)
    if (gender === undefined || gender === face.gender) return this
    return this.with({
      voiceId: pickVoice({
        agentId: this.seed,
        name: this.name,
        isChiefOfStaff: false,
        voices,
        taken: this.taken(agents, voices),
        gender: face.gender,
      }),
    })
  }

  private get seed(): string {
    return nameSeed(this.name)
  }

  private taken(
    agents: readonly Agent[],
    voices: readonly VoiceChoice[],
  ): string[] {
    return facePeople(agents)
      .map((agent) => keptVoice(agent.voiceId, voices))
      .filter((id): id is string => id !== undefined)
  }
}
