// A real call with an agent (VoiceCall.swift in ios/SimeonCore): every
// sentence the call puts in front of the voice or the person
// (`VoiceCallText`), what the voice's kit reports (`VoiceEvent`), the voice
// itself as a transport (`VoiceTransport`: ElevenLabs' kit in the app, a
// stand-in in the tests), and the call (`LiveCall`): Simeon Labs' server
// hands a ticket (`proxy/v1/voice/calls`), the voice speaks as the agent
// with its profile and recent chat, its `send_task` goes to the agent over
// the call's channel, the agent's answers are read from the call's outbox
// every 1.2 s and said once the line is quiet, and at the end the call's
// record goes to the agent, which writes its line in the chat.

import { SimeonAPIError } from './api'
import type { AgentBackend } from './backend'
import {
  type CallEngine,
  type CallState,
  callSeconds,
  callWords,
  copied,
  ringingCall,
} from './call'
import { type CallTonePlaying, CallTones } from './callTones'
import { type CallLine, callClock } from './chat'
import { type JSONValue, arr, field, num, str, text } from './json'
import { t } from './l10n'
import { languageCode, languageTag } from './language'
import type { Agent } from './models'
import { plainError } from './plainWords'

const english = 'en'
/** The narrow space French puts before a question mark. */
const narrow = '\u202F'

/**
 * The languages a call can be in, as ElevenLabs names them, by the app's
 * language (`VOICE_CALL_LANGUAGES` in voice-call-prompt.ts). The server
 * gives its platform agent the same (`VOICE_LANGUAGES` in voice.py): a
 * language it was not given is refused, so one is added in all three.
 */
const callLanguages: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  es: 'es',
  de: 'de',
  nl: 'nl',
  it: 'it',
  'pt-BR': 'pt',
  pt: 'pt',
  sv: 'sv',
  pl: 'pl',
  tr: 'tr',
}

/** Each language's name in English, for instructions to a model (`AppLanguage.englishNames`). */
const englishNames: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  'pt-BR': 'Brazilian Portuguese',
  pt: 'Portuguese',
  ja: 'Japanese',
  it: 'Italian',
  nl: 'Dutch',
  ko: 'Korean',
  'zh-Hant': 'Traditional Chinese',
  zh: 'Chinese',
  ar: 'Arabic',
  sv: 'Swedish',
  pl: 'Polish',
  tr: 'Turkish',
}

/** "French", for instructions to a model; the tag itself when it is none of Simeon's languages (`AppLanguage.englishName`). */
function englishName(tag: string): string {
  return englishNames[tag] ?? englishNames[languageCode(tag)] ?? tag
}

/** The languages with a familiar and a formal "you", as the engine's `ADDRESS` (user-language.ts): the familiar one first. */
const address: Record<string, { familiar: string; formal: string }> = {
  fr: { familiar: 'tu', formal: 'vous' },
  es: { familiar: 'tú', formal: 'usted' },
  de: { familiar: 'du', formal: 'Sie' },
  nl: { familiar: 'je', formal: 'u' },
  it: { familiar: 'tu', formal: 'Lei' },
  pt: { familiar: 'você', formal: 'o senhor/a senhora' },
  sv: { familiar: 'du', formal: 'ni' },
  pl: { familiar: 'ty', formal: 'Pan/Pani' },
  tr: { familiar: 'sen', formal: 'siz' },
}

/** One line of the chat as the call's prompt quotes it. */
export interface TranscriptLine {
  fromPerson: boolean
  text: string
}

/** Spaces and new lines run together. */
function collapse(words: string): string {
  return words.split(/\s+/u).filter(Boolean).join(' ')
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The characters as Swift counts them (`String.count`): a flag or a family emoji is one. */
export function characters(words: string): string[] {
  return Array.from(graphemes.segment(words), (part) => part.segment)
}

/** Past `max` characters: its first `max - 1` and "…". */
export function clamp(words: string, max: number): string {
  const all = characters(words)
  return all.length > max
    ? all
        .slice(0, max - 1)
        .join('')
        .trim() + '…'
    : words
}

/** The first `max` characters. */
export function prefix(words: string, max: number): string {
  return characters(words).slice(0, max).join('')
}

const gerundExceptions: Record<string, string> = {
  be: 'Being',
  see: 'Seeing',
  free: 'Freeing',
  agree: 'Agreeing',
  lie: 'Lying',
  die: 'Dying',
  tie: 'Tying',
  set: 'Setting',
  get: 'Getting',
  put: 'Putting',
  run: 'Running',
  plan: 'Planning',
  stop: 'Stopping',
  ship: 'Shipping',
  shop: 'Shopping',
  chat: 'Chatting',
  drop: 'Dropping',
  pin: 'Pinning',
  tag: 'Tagging',
  log: 'Logging',
  map: 'Mapping',
  jot: 'Jotting',
  zip: 'Zipping',
  cut: 'Cutting',
  dig: 'Digging',
  sit: 'Sitting',
  swap: 'Swapping',
  skim: 'Skimming',
  text: 'Texting',
  email: 'Emailing',
}

const taskVerbs = new Set(
  'add answer archive ask book build buy call cancel change check clean compare compile confirm copy create delete design draft email edit file fill find fix follow forward gather generate get invite list look make message move note order organize organise plan post prepare print pull put read record remind remove rename reply research reschedule respond review run save schedule search send set share sort start summarize summarise text track translate update upload write'.split(
    ' ',
  ),
)

function gerund(verb: string): string {
  const lower = verb.toLowerCase()
  const known = gerundExceptions[lower]
  if (known) return known
  let base = lower
  if (base.endsWith('ie')) base = base.slice(0, -2) + 'y'
  else if (
    base.endsWith('e') &&
    !base.endsWith('ee') &&
    !base.endsWith('ye') &&
    !base.endsWith('oe')
  )
    base = base.slice(0, -1)
  const word = base + 'ing'
  return word.slice(0, 1).toUpperCase() + word.slice(1)
}

/** An app's name from its tool's identifier: "composio_google_calendar" reads "Google Calendar", "gh" "GH"; undefined when it names none. */
function appName(identifier: string): string | undefined {
  const cleaned = identifier
    .replace(/^(composio[-_:]?|mcp[-_:]?)/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (cleaned === '') return undefined
  return cleaned
    .split(' ')
    .map((word) =>
      characters(word).length <= 2
        ? word.toUpperCase()
        : word.slice(0, 1).toUpperCase() + word.slice(1),
    )
    .join(' ')
}

/**
 * Every sentence a call puts in front of the voice or the person, word for
 * word as the Mac has them (`VoiceCallText`;
 * desktop/source/shared/voice-call/voice-call-prompt.ts): the per-call
 * prompt, the greeting, what the two client tools answer, the note that
 * makes the voice say what its work came back with, the status line while
 * the agent works, and the banner's own sentences. What the voice reads is
 * English (the prompt tells it which language to speak); what the person
 * reads is translated.
 */
const transcriptLines = 6
const lineMaxChars = 600
const relayMaxChars = 2_000
const teammatesMax = 20
const workCameBackNudge = '(Your work just came back.)'

/** The call's language for the app's: "fr" for "fr-CA"; English for one the voice does not speak yet. */
function callLanguage(appLanguage: string): string {
  const tag = languageTag(appLanguage)
  return callLanguages[tag] ?? callLanguages[languageCode(tag)] ?? english
}

/** The call's language at the end of its prompt when it is not English (`voiceCallLanguageRule`): the app's, from the first word, "tu" in French, "tú" in Spanish. */
function languageRule(appLanguage: string): string {
  const tag = languageTag(appLanguage)
  const lines = [
    'Language:',
    `- Speak ${englishName(tag)} for the whole call. If they speak another language to you, answer in theirs.`,
  ]
  const you = address[languageCode(tag)]
  if (you)
    lines.push(
      `- Say "${you.familiar}" to them, warm and direct, never stiff, unless they ask for "${you.formal}" or their messages above say "${you.formal}".`,
    )
  lines.push(
    "- Names stay as they are: Simeon, your name and your teammates' names, and the names of apps (Gmail, Slack, Shop).",
  )
  return lines.join('\n')
}

export const VoiceCallText = {
  transcriptLines,
  lineMaxChars,
  relayMaxChars,
  teammatesMax,
  /** The call's language when the app is in English, or in one the voice does not speak. */
  defaultLanguage: english,

  ...callWords,

  sendTaskAccepted:
    'Sent. If you have not acknowledged it yet, do so in a few words, then carry on with them. What it turns up comes back to you here.',
  relaySoftFail:
    'That did not come back. Say you could not get to it, and offer to try again.',
  workCameBackNudge,

  language: callLanguage,

  /** The nudge is nobody's words: kept out of what the call shows and records, as the Mac's banner keeps it out. */
  isNudge(words: string): boolean {
    return (
      words === workCameBackNudge ||
      words === '(Your work just came back. Tell me what it found.)'
    )
  },

  /** The latest `limit` messages of a chat page, oldest first: what the person wrote and what the agent sent (cards and tools left out). */
  lines(
    entries: readonly JSONValue[],
    limit: number = transcriptLines,
  ): TranscriptLine[] {
    const out: TranscriptLine[] = []
    for (const entry of entries) {
      const kind = str(field(entry, 'kind'))
      if (kind === 'message' && str(field(entry, 'role')) === 'user') {
        const said = str(field(entry, 'content'))
        if (said != null) {
          const words = collapse(said)
          if (words !== '')
            out.push({
              fromPerson: true,
              text: clamp(words, lineMaxChars),
            })
          continue
        }
      }
      const message = field(entry, 'message')
      if (kind === 'send-message' && str(field(message, 'type')) === 'text') {
        const said = str(field(message, 'content'))
        if (said == null) continue
        const words = collapse(said)
        if (words !== '')
          out.push({
            fromPerson: false,
            text: clamp(words, lineMaxChars),
          })
      }
    }
    return limit > 0 ? out.slice(-limit) : []
  },

  /** The per-call system prompt (`buildVoiceCallPrompt`): the voice IS the agent, in the first person. */
  prompt(args: {
    name: string
    title: string
    description: string
    transcript: readonly TranscriptLine[]
    personName?: string
    teammates: readonly { name: string; title: string }[]
    language?: string
  }): string {
    const name = collapse(args.name) === '' ? 'your agent' : collapse(args.name)
    const person = clamp(collapse(args.personName ?? ''), 60)
    const them = person === '' ? 'the person' : person
    const title = collapse(args.title)
    const description = collapse(args.description)
    const who = [
      `You are ${name}${title === '' ? '' : `, ${title}`}, one of ${person === '' ? "the person's" : `${person}'s`} Simeon agents, on a live phone call with ${them}.`,
      'Simeon is a team of always-on agents that work for them on their Mac and on a computer of their own.',
    ]
    if (description !== '')
      who.push(`What you are for, in their words: ${clamp(description, 800)}`)
    if (person !== '')
      who.push(
        `Call them ${person} now and then, the way a colleague would, never in every sentence.`,
      )
    who.push(
      `You are ${name} yourself. Speak in the first person ("I'll do that", "I've sent it"). The work you set going is your own: never talk about a hand-off, a second voice or a system behind you.`,
    )
    const team = args.teammates
      .map((mate) => ({
        name: clamp(collapse(mate.name), 60),
        title: clamp(collapse(mate.title), 60),
      }))
      .filter((mate) => mate.name !== '' && mate.name !== name)
      .slice(0, teammatesMax)
    const teammatesText =
      team.length === 0
        ? 'You have no teammates yet. When they ask for one, you can create one with send_task, and then message it.'
        : [
            `Your teammates, other agents on ${person === '' ? 'their' : `${person}'s`} team that you can message, ask and hand work to: ${team.map((mate) => (mate.title === '' ? mate.name : `${mate.name} (${mate.title})`)).join(', ')}.`,
            "When they ask you to talk to, ask, tell or get something from a teammate, you can: set it going with send_task, naming the teammate. It works like texting: you message them now and their answer comes back to you a little later. Never say you can't reach, message or talk to a teammate.",
          ].join(' ')
    const recent =
      args.transcript.length === 0
        ? 'You and they have not written to each other yet.'
        : [
            'Your latest text messages with them, oldest first, so you know what you are both talking about:',
            ...args.transcript.map(
              (line) =>
                `${line.fromPerson ? (person === '' ? 'Them' : person) : 'You'}: ${line.text}`,
            ),
          ].join('\n')
    const rules = [
      'How you talk:',
      '- This is a phone call. Speak briefly and naturally, like a person: one or two short sentences, contractions, plain words.',
      '- Speak calmly and evenly, at an unhurried pace, the same steady tone throughout. Never use exclamation marks.',
      '- Never use lists, headings, markdown, emoji, or read out links. Say numbers, dates and times the way people say them.',
      '- If you did not catch something, say so and ask again. Never guess what they said.',
      'How you get things done:',
      '- Your work runs behind the call while you talk. For anything that needs doing or finding out (looking something up, writing, sending, scheduling, changing a file, checking on something you are doing), call send_task with what is needed in one clear sentence that carries every detail they gave. When their exact wording matters, put their words in quote. Acknowledge it once, in a few words that fit what they asked, never the same phrase twice in a call, then carry on with them.',
      '- Set each thing going once. If they ask how it is going, say it is still in progress; do not send it again.',
      '- Never say something is done, sent, booked or found until a note tells you your work came back with it. Until then it is still in progress.',
      '- When a note says your work came back: if it answers something they asked, or something went wrong, tell them once, briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: do not announce it; stay silent with skip_turn, unless they ask. If it repeats something you already told them, say nothing about it and carry on.',
      '- When they refer to something you wrote to each other, call recall_text_messages.',
      '- When there is nothing for you to say (they are thinking, or talking to someone else), stay silent with skip_turn.',
      'Ending:',
      "- When they wrap up (thanks, that's all, bye), say a short, natural goodbye in your own words and call end_call.",
      '- If the line goes quiet, check in lightly once, like a person would.',
    ].join('\n')
    const base = `${who.join(' ')}\n\n${teammatesText}\n\n${recent}\n\n${rules}`
    const language = args.language ?? english
    return callLanguage(language) === english
      ? base
      : `${base}\n\n${languageRule(language)}`
  },

  languageRule,

  /**
   * A short greeting with the agent's name (`buildFirstMessage`); `pick` in
   * [0, 1) chooses which. In the call's language: French says "tu", Spanish
   * "tú", word for word as voice-call-prompt.ts; a language with none of its
   * own opens in English.
   */
  firstMessage(args: {
    name: string
    pick: number
    personName?: string
    language?: string
  }): string {
    const name = collapse(args.name) === '' ? 'your agent' : collapse(args.name)
    const person = clamp(collapse(args.personName ?? ''), 60)
    const p = person === '' ? '' : ` ${person}`
    let greetings: string[]
    switch (callLanguage(args.language ?? english)) {
      case 'fr':
        greetings = [
          `Salut${p}, c’est ${name}. Quoi de neuf${narrow}?`,
          `Bonjour${p}, ${name} à l’appareil. Qu’est-ce que je peux faire pour toi${narrow}?`,
          `Salut${p}, ici ${name}. De quoi as-tu besoin${narrow}?`,
          `Bonjour${p}, c’est ${name}. Comment je peux t’aider${narrow}?`,
          `${name} à l’appareil. Qu’est-ce que tu as en tête${narrow}?`,
        ]
        break
      case 'es':
        greetings = [
          `Hola${p}, soy ${name}. ¿Qué tal?`,
          `Hola${p}, habla ${name}. ¿Qué puedo hacer por ti?`,
          `Hola${p}, aquí ${name}. ¿Qué necesitas?`,
          `Hola${p}, soy ${name}. ¿En qué te ayudo?`,
          `${name} al habla. ¿Qué tienes en mente?`,
        ]
        break
      case 'de':
        greetings = [
          `Hey${p}, hier ist ${name}. Was gibt’s?`,
          `Hallo${p}, ${name} hier. Was kann ich für dich tun?`,
          `Hey${p}, hier spricht ${name}. Was brauchst du?`,
          `Hi${p}, hier ist ${name}. Wie kann ich helfen?`,
          `${name} hier. Was beschäftigt dich?`,
        ]
        break
      case 'nl':
        greetings = [
          `Hoi${p}, met ${name}. Zeg het maar.`,
          `Hallo${p}, met ${name}. Wat kan ik voor je doen?`,
          `Hé${p}, ${name} hier. Wat heb je nodig?`,
          `Hoi${p}, met ${name}. Waarmee kan ik je helpen?`,
          `${name} hier. Wat speelt er?`,
        ]
        break
      case 'it':
        greetings = [
          `Ciao${p}, sono ${name}. Che mi racconti?`,
          `Ciao${p}, qui ${name}. Cosa posso fare per te?`,
          `Ehi${p}, sono ${name}. Di cosa hai bisogno?`,
          `Ciao${p}, sono ${name}. Come posso aiutarti?`,
          `Sono ${name}. Cosa hai in mente?`,
        ]
        break
      case 'pt':
        greetings = [
          `Oi${p}, aqui é ${name}. O que manda?`,
          `Olá${p}, aqui é ${name}. O que posso fazer por você?`,
          `Oi${p}, ${name} falando. Do que você precisa?`,
          `Olá${p}, ${name} na linha. Como posso ajudar?`,
          `Aqui é ${name}. O que você tem em mente?`,
        ]
        break
      case 'sv':
        greetings = [
          `Hallå${p}, det är ${name}. Hur är läget?`,
          `Hej${p}, ${name} här. Vad kan jag göra för dig?`,
          `Hej${p}, du pratar med ${name}. Vad behöver du?`,
          `Hej${p}, det är ${name}. Hur kan jag hjälpa dig?`,
          `${name} här. Vad har du på hjärtat?`,
        ]
        break
      case 'pl':
        greetings = [
          `Cześć${p}, tu ${name}. Co słychać?`,
          `Hej${p}, tu ${name}. Co mogę dla ciebie zrobić?`,
          `Cześć${p}, mówi ${name}. Czego potrzebujesz?`,
          `Hej${p}, tu ${name}. W czym mogę pomóc?`,
          `Tu ${name}. O czym chcesz pogadać?`,
        ]
        break
      case 'tr':
        greetings = [
          `Selam${p}, ben ${name}. Ne var ne yok?`,
          `Merhaba${p}, ben ${name}. Senin için ne yapabilirim?`,
          `Selam${p}, ${name} konuşuyor. Neye ihtiyacın var?`,
          `Merhaba${p}, ben ${name}. Nasıl yardımcı olabilirim?`,
          `Ben ${name}. Aklında ne var?`,
        ]
        break
      default:
        greetings = [
          `Hey${p}, it's ${name}. What's up?`,
          `Hi${p}, ${name} here. What can I do for you?`,
          `Hey${p}, ${name} speaking. What do you need?`,
          `Hi${p}, it's ${name}. How can I help?`,
          `${name} here. What's on your mind?`,
        ]
    }
    const pick = Number.isFinite(args.pick) ? args.pick : 0
    const index = Math.min(
      greetings.length - 1,
      Math.max(0, Math.trunc(pick * greetings.length)),
    )
    return greetings[index]!
  },

  /** What `recall_text_messages` answers. */
  recallAnswer(lines: readonly TranscriptLine[]): string {
    if (lines.length === 0) return 'There are no text messages between you yet.'
    return [
      'Your latest text messages, oldest first:',
      ...lines.map(
        (line) => `${line.fromPerson ? 'Them' : 'You'}: ${line.text}`,
      ),
    ].join('\n')
  },

  /** The note pushed into the call when the agent sent something on it. */
  workCameBack(texts: readonly string[]): string {
    return `Your work came back: ${texts.map((words) => clamp(collapse(words), 2_000)).join(' ')} If it answers something they asked, or something went wrong, tell them briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: say nothing about it and stay silent with skip_turn.`
  },

  /**
   * The agent's current activity (`currentActivity` on its roster row) as a
   * short line (`describeAgentActivity`): "Using Gmail…", "Searching the
   * web…", "Reading notes.md…"; undefined when it names nothing more than
   * thinking.
   */
  describeActivity(
    kind: string | undefined,
    tool: string | undefined,
    rawDetail: string | undefined,
  ): string | undefined {
    if (kind !== 'tool' || tool == null) return undefined
    const trimmed = collapse(rawDetail ?? '')
    const detail = trimmed === '' ? undefined : clamp(trimmed, 40)
    // An app whose identifier names nothing reads as no app named ("Using an app…").
    const app = detail != null ? appName(detail) : undefined
    switch (tool) {
      case 'Shell':
        return detail != null ? t`Editing ${detail}…` : t('Running a command…')
      case 'ExternalShell':
        return detail != null
          ? t`Editing ${detail}…`
          : t('Running a command on your Mac…')
      case 'Read':
        return detail != null ? t`Reading ${detail}…` : t('Reading a file…')
      case 'ExternalRead':
        return detail != null
          ? t`Reading ${detail}…`
          : t('Reading a file on your Mac…')
      case 'AwaitShell':
      case 'ExternalAwaitShell':
        return t('Waiting on a command…')
      case 'WebSearch':
        return t('Searching the web…')
      case 'WebFetch':
        return detail != null ? t`Reading ${detail}…` : t('Reading a web page…')
      case 'GenerateImage':
        return t('Making an image…')
      case 'CallMcpTool':
        return app != null ? t`Using ${app}…` : t('Using an app…')
      case 'GetMcpTools':
        return app != null ? t`Opening ${app}…` : t('Opening an app…')
      case 'McpAuth':
        return app != null
          ? t`Signing in to ${app}…`
          : t('Signing in to an app…')
      case 'Computer':
        return t('Using its computer…')
      case 'Screenshot':
        return t('Looking at the screen…')
      case 'Task':
        return t('Working with a helper…')
      default:
        return t('Working on it…')
    }
  },

  /** "Send the agenda to Dana" reads "Sending the agenda to Dana…"; anything else "Working on it…". */
  workingLabel(task: string): string {
    let words = collapse(task).replace(
      /^(please|can you|could you|would you)\s+/i,
      '',
    )
    while (words !== '' && '.!?'.includes(words[words.length - 1]!))
      words = words.slice(0, -1)
    const all = words.split(' ').filter(Boolean)
    const first = [...(all[0] ?? '').toLowerCase()]
      .filter((letter) => /[a-z]/.test(letter))
      .join('')
    if (all.length === 0 || !taskVerbs.has(first)) return t('Working on it…')
    return [gerund(first), ...all.slice(1, 8)].join(' ') + '…'
  },
}

/** What the voice's kit reports during a call (`VoiceEvent`). */
export type VoiceEvent =
  | { kind: 'connected'; conversationId?: string }
  | { kind: 'agentSpeaking'; on: boolean }
  /** The person's voice activity, 0 to 1 (the waveform while they talk). */
  | { kind: 'activity'; level: number }
  | { kind: 'line'; fromPerson: boolean; text: string }
  /** The whole transcript so far, as the kit keeps it (lines get corrected as the voice goes). */
  | { kind: 'transcript'; lines: CallLine[] }
  /** A client tool the voice called (`send_task`, `recall_text_messages`). */
  | { kind: 'tool'; name: string; id: string; parameters: JSONValue }
  | { kind: 'ended' }
  | { kind: 'failed'; message: string }

/**
 * The voice itself (`VoiceTransport`): ElevenLabs' kit in the app, a
 * stand-in in the tests. Each start is one call's (`call`, the call's own
 * id): ending a call lets go of its own voice only, never a later call's.
 */
export interface VoiceTransport {
  start(
    args: {
      /** The call's own id: `end` names it. */
      call: string
      token: string
      prompt: string
      firstMessage: string
      voiceId?: string
      language: string
    },
    events: (event: VoiceEvent) => void,
  ): Promise<void>
  setMuted(muted: boolean): Promise<void>
  /** A note into the call, then a nudge so the voice speaks now (`sendContextualUpdate`, `sendUserMessage`). */
  say(context: string, nudge: string): Promise<void>
  toolResult(id: string, result: string): Promise<void>
  /** Lets go of that call's voice: a session still opening is never opened, or ended the moment it opens. */
  end(call: string): Promise<void>
}

export interface LiveCallOptions {
  backend: AgentBackend
  transport: VoiceTransport
  personName: () => string | undefined
  /** The agent's voice for the call, given now if it has none on the list (`AppStore.ensureVoice`); without it, the roster's. */
  voiceFor?: (agentId: string) => Promise<string | undefined>
  /** The ring and the hang-up (`CallTones`); none in tests unless given. */
  tones?: CallTonePlaying
  /** How long the line must be quiet, in seconds, before work that came back is said (`replyLoop`). */
  quiet?: number
  /** How long a call that could not start stays up, in seconds: the phone's 2.4 s, or until dismissed (null, the Mac's banner, which keeps it 20 s unless the pointer is on it). */
  failedStays?: number | null
  /** One line per step of the call (the Mac's `voice-call.log`). */
  log?: (line: string) => void
  /** The app's language (`AppLanguage.current`). */
  language?: () => string
  pause?: (seconds: number) => Promise<void>
}

const sleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))

const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

/**
 * One call's own record (the Swift keeps these on the engine and cancels a
 * call's tasks at its end): what an earlier call's work finds when it comes
 * back late is its own, never the call on now's.
 */
interface Call {
  id: string
  agentId: string
  conversationId?: string
  opened: boolean
  viaChat: boolean
  /** The outbox's last message read (`after`). */
  after: number
  seenChat: Set<string>
  lastTask?: string
  finished: boolean
  speaking: boolean
  activity: number
  /** What the agent sent on the call, waiting for the line to be quiet. */
  pendingReplies: string[]
  /** The call is ready to start its voice: the ring stops after the cycle it is in. */
  prepared: boolean
  /** The server's token is here: past the seventh ring, only its absence fails the call (`call-controller.ts`). */
  tokenHere: boolean
  ringing?: Promise<void>
}

/**
 * A real call, the Mac's way (`LiveCall`; electron-main/voice/
 * voice-call-service.ts and shared/voice-call/handoff.ts). Each call keeps
 * its own record (`Call`); the screens see only the call on now.
 */
export class LiveCall implements CallEngine {
  static readonly pollSeconds = 1.2
  static readonly summaryRetryWaits = [5, 10]
  /** The person's voice is taken as talking from this voice-activity score up. */
  static readonly personTalking = 0.5

  private readonly backend: AgentBackend
  private readonly transport: VoiceTransport
  private readonly personName: () => string | undefined
  private readonly voiceFor?: (agentId: string) => Promise<string | undefined>
  private readonly tones?: CallTonePlaying
  private readonly quiet: number
  private readonly failedStays: number | null
  private readonly log: (line: string) => void
  private readonly appLanguage: () => string
  private readonly pause: (seconds: number) => Promise<void>

  private state?: CallState
  private listeners: ((state: CallState | undefined) => void)[] = []
  /** The call on now (or the last one, over). */
  private current?: Call

  constructor(options: LiveCallOptions) {
    this.backend = options.backend
    this.transport = options.transport
    this.personName = options.personName
    this.voiceFor = options.voiceFor
    this.tones = options.tones
    this.quiet = options.quiet ?? 1
    this.failedStays =
      options.failedStays === undefined ? 2.4 : options.failedStays
    this.log = options.log ?? (() => {})
    this.appLanguage = options.language ?? (() => english)
    this.pause = options.pause ?? sleep
  }

  /** A failed call put away (the banner's Close, or its 20 s). */
  dismiss(): void {
    if (this.state?.phase === 'ended') this.set(undefined)
  }

  observe(listener: (state: CallState | undefined) => void): void {
    this.listeners.push(listener)
    listener(this.state)
  }

  private set(value: CallState | undefined): void {
    this.state = value
    for (const listener of [...this.listeners]) listener(value)
  }

  /** The screens' copy changed, for the call on now only. */
  private update(call: Call, change: (state: CallState) => void): void {
    if (call !== this.current || !this.state) return
    const next = copied(this.state)
    change(next)
    this.set(next)
  }

  /** Whether `call` is over, or another began: what it started stops. */
  private over(call: Call): boolean {
    return call !== this.current || call.finished
  }

  start(agentId: string, agentName: string, colour: string): void {
    if (this.state) return
    this.log(`call started for agent ${agentId}`)
    const call: Call = {
      id: crypto.randomUUID().toLowerCase(),
      agentId,
      opened: false,
      viaChat: false,
      after: 0,
      seenChat: new Set(),
      finished: false,
      speaking: false,
      activity: 0,
      pendingReplies: [],
      prepared: false,
      tokenHere: false,
    }
    this.current = call
    this.set(ringingCall(agentId, agentName, colour))
    // The ring, as the Mac's banner rings, while the call gets ready.
    call.ringing = this.ring(call)
    void this.connect(call, agentName)
  }

  /**
   * Twice, then once more at a time while the call is still getting ready,
   * seven at most (the Mac's `RINGS_BEFORE_CONNECT`, `MAX_RINGS`); still not
   * ready after the seventh, the call fails "Couldn't connect", as the Mac's
   * banner does (`call-controller.ts`).
   */
  private async ring(call: Call): Promise<void> {
    const tones = this.tones
    if (!tones) return
    await tones.ring(CallTones.ringsBeforeConnect)
    let rings = CallTones.ringsBeforeConnect
    while (!this.over(call) && !call.prepared && rings < CallTones.maxRings) {
      await tones.ring(1)
      rings += 1
    }
    if (!this.over(call) && !call.tokenHere && rings >= CallTones.maxRings) {
      this.log(`connect: no token after ${rings} rings`)
      this.fail(call, VoiceCallText.couldNotConnect())
    }
  }

  private async connect(call: Call, agentName: string): Promise<void> {
    const backend = this.backend
    const agentId = call.agentId
    let roster: Agent[] = []
    try {
      roster = await backend.listAgents()
    } catch {
      // The call goes on without the roster's profile.
    }
    const row = roster.find((agent) => agent.id === agentId)
    let page: JSONValue | undefined
    try {
      page = await backend.command('getAgentTranscriptTail', {
        id: agentId,
        limit: 80,
      })
    } catch {
      // Nothing written yet, as far as the call knows.
    }
    const entries = arr(field(page, 'entries')) ?? arr(page) ?? []
    let ticket: JSONValue
    try {
      ticket = await backend.server('proxy/v1/voice/calls', 'POST', {})
    } catch (error) {
      if (error instanceof SimeonAPIError) {
        this.log(`connect: the server refused the call: ${error.message}`)
        return this.fail(
          call,
          error.status === 503
            ? VoiceCallText.notSwitchedOn()
            : error.status === 402
              ? VoiceCallText.noCredit()
              : VoiceCallText.couldNotConnect(),
        )
      }
      this.log(`connect: the server refused the call: ${errorText(error)}`)
      return this.fail(call, VoiceCallText.couldNotConnect())
    }
    // Hung up (or given up on) while the server answered: nothing more to do (`voice-call-service.ts`).
    if (this.over(call)) return
    const token = text(field(ticket, 'token'))
    if (token == null) return this.fail(call, VoiceCallText.couldNotConnect())
    call.conversationId = text(field(ticket, 'conversation_id'))
    call.tokenHere = true
    const person = this.personName()
    const teammates = roster
      .filter(
        (agent) =>
          agent.id !== agentId &&
          !agent.isGroup &&
          !agent.isRemoteRoom &&
          !agent.isHidden &&
          agent.name !== '',
      )
      .map((agent) => ({ name: agent.name, title: agent.title }))
    const name = row?.name ?? agentName
    // In the app's language: the voice hears and speaks it, its first line too.
    const appLanguage = this.appLanguage()
    const language = VoiceCallText.language(appLanguage)
    const prompt = VoiceCallText.prompt({
      name,
      title: row?.title ?? '',
      description: row?.description ?? '',
      transcript: VoiceCallText.lines(entries),
      personName: person,
      teammates,
      language: appLanguage,
    })
    const greeting = VoiceCallText.firstMessage({
      name,
      pick: Math.random(),
      personName: person,
      language: appLanguage,
    })
    // The voice its picker shows, never one taken off the list (9 October 2026); none is the agent's own, Michael.
    const voiceId = this.voiceFor ? await this.voiceFor(agentId) : row?.voiceId
    if (this.over(call)) return
    // The call's address opens while it still rings, and the agent's chat gets its line ("Voice chat · now"), as on the Mac.
    await this.open(call)
    if (this.over(call)) return
    // The voice starts once the ring is over, so the two never sound together.
    call.prepared = true
    await call.ringing
    if (this.over(call)) return
    this.tones?.stopRinging()
    this.log(
      `connect: token issued for agent ${agentId} (voice ${voiceId ?? "the agent's own"}, ${entries.length} chat entries read)`,
    )
    try {
      await this.transport.start(
        {
          call: call.id,
          token,
          prompt,
          firstMessage: greeting,
          voiceId,
          language,
        },
        (event) => this.handle(call, event),
      )
    } catch (error) {
      this.log(`starting the conversation failed: ${errorText(error)}`)
      const said = errorText(error).toLowerCase()
      this.fail(
        call,
        said.includes('microphone') || said.includes('permission')
          ? VoiceCallText.noMicrophone()
          : VoiceCallText.couldNotConnect(),
      )
    }
  }

  /** The call's channel closed with nothing in it: the chat's line does not stay "now". */
  private closeEmpty(call: Call): void {
    void this.backend
      .command('voiceCall', {
        agentId: call.agentId,
        callId: call.id,
        kind: 'ended',
        record: { seconds: 0, recap: null, transcript: [] },
      })
      .catch(() => {})
  }

  /** Opens `voice:<call>` on the agent; a host without the channel gets the call through its chat. */
  private async open(call: Call): Promise<void> {
    const backend = this.backend
    const agentId = call.agentId
    try {
      await backend.command('voiceCall', {
        agentId,
        callId: call.id,
        kind: 'open',
      })
      call.opened = true
      // Ended (hung up, the seventh ring, or another call begun) while it opened: closed at once, so the chat's line does not stay "now".
      if (this.over(call)) {
        call.finished = true
        this.closeEmpty(call)
        return
      }
    } catch {
      let page: JSONValue | undefined
      try {
        page = await backend.command('getAgentTranscriptTail', {
          id: agentId,
          limit: 30,
        })
      } catch {
        // None seen yet.
      }
      call.seenChat = new Set(
        (arr(field(page, 'entries')) ?? []).flatMap((entry) => {
          const lineId = text(field(entry, 'id'))
          return str(field(entry, 'kind')) === 'send-message' && lineId != null
            ? [lineId]
            : []
        }),
      )
      call.viaChat = true
      call.opened = true
    }
    if (this.over(call)) return
    void this.pollLoop(call)
    void this.waveLoop(call)
    void this.replyLoop(call)
  }

  private handle(call: Call, event: VoiceEvent): void {
    // The call is over (hung up while the voice was still connecting): what the kit says now is dropped, and a voice that connects late is let go: its own, never a later call's.
    if (this.over(call)) {
      if (event.kind === 'connected') void this.transport.end(call.id)
      return
    }
    switch (event.kind) {
      case 'connected':
        if (event.conversationId != null)
          call.conversationId = event.conversationId
        this.log(`connected: conversation ${call.conversationId ?? 'unknown'}`)
        this.update(call, (state) => {
          state.phase = 'live'
          state.status = ''
          state.connectedAt = state.connectedAt ?? Date.now()
        })
        return
      case 'agentSpeaking':
        call.speaking = event.on
        this.update(call, (state) => (state.agentSpeaking = event.on))
        return
      case 'activity':
        call.activity = event.level
        return
      case 'line': {
        const trimmed = event.text.trim()
        if (trimmed === '' || VoiceCallText.isNudge(trimmed)) return
        this.update(call, (state) =>
          state.lines.push({ fromPerson: event.fromPerson, text: trimmed }),
        )
        return
      }
      case 'transcript':
        this.update(call, (state) => {
          state.lines = event.lines.filter((line) => {
            const trimmed = line.text.trim()
            return trimmed !== '' && !VoiceCallText.isNudge(trimmed)
          })
        })
        return
      case 'tool':
        void (async () => {
          let answer: string
          switch (event.name) {
            case 'send_task':
              answer = await this.sendTask(call, event.parameters)
              break
            case 'recall_text_messages':
              answer = await this.recall(call.agentId)
              break
            default:
              answer = "That tool isn't here."
          }
          await this.transport.toolResult(event.id, answer)
        })()
        return
      case 'ended':
        // Dropped before it connected (not hung up): "Couldn't connect", as the Mac's banner (`call-state.ts`).
        if (this.state?.connectedAt == null)
          this.fail(call, VoiceCallText.couldNotConnect())
        else this.finish(call)
        return
      case 'failed':
        // The kit's error once the call is live: written down, the call goes on (`call-state.ts`).
        if (this.state?.connectedAt != null) {
          this.log(`banner: sdk error: ${event.message}`)
        } else {
          // The voice service's own words go to the log; the person reads plain ones (PlainWords).
          this.log(`banner: sdk error before connecting: ${event.message}`)
          this.fail(
            call,
            event.message === ''
              ? VoiceCallText.couldNotConnect()
              : plainError(event.message, VoiceCallText.couldNotConnect()),
          )
        }
    }
  }

  /** The voice's `send_task`: the request (2,000 characters at most) and the caller's words, to the agent. */
  private async sendTask(call: Call, parameters: JSONValue): Promise<string> {
    if (!(call.opened && !call.finished)) return VoiceCallText.relaySoftFail
    const backend = this.backend
    const task = prefix(
      (str(field(parameters, 'task')) ?? '').trim(),
      VoiceCallText.relayMaxChars,
    )
    const quote = prefix(
      (str(field(parameters, 'quote')) ?? '').trim(),
      VoiceCallText.relayMaxChars,
    )
    try {
      if (call.viaChat) {
        const prompt = [
          `(On our call) ${task === '' ? 'Are you there?' : task}`,
          ...(quote === '' ? [] : [`My words: "${quote}"`]),
          'Answer here in a sentence or two of plain text; it is read out to me on the call.',
        ].join('\n')
        await backend.send(call.agentId, prompt, [], {})
      } else {
        const args: Record<string, JSONValue> = {
          agentId: call.agentId,
          callId: call.id,
          kind: 'request',
          request: task,
        }
        if (quote !== '') args.quotes = [quote]
        await backend.command('voiceCall', args)
      }
    } catch {
      return VoiceCallText.relaySoftFail
    }
    if (task !== '') {
      call.lastTask = task
      // Only on this call's banner: one begun since shows nothing of it.
      this.update(
        call,
        (state) => (state.activity = VoiceCallText.workingLabel(task)),
      )
    }
    return VoiceCallText.sendTaskAccepted
  }

  /** The voice's `recall_text_messages`: the latest texts between the person and the agent. */
  private async recall(agentId: string): Promise<string> {
    let page: JSONValue
    try {
      page = await this.backend.command('getAgentTranscriptTail', {
        id: agentId,
        limit: 60,
      })
    } catch {
      return 'The text messages could not be read just now.'
    }
    return VoiceCallText.recallAnswer(
      VoiceCallText.lines(arr(field(page, 'entries')) ?? arr(page) ?? [], 20),
    )
  }

  /** The call's outbox (or the chat, without a channel) every 1.2 s: what the agent sent is said; its activity is the status line. */
  private async pollLoop(call: Call): Promise<void> {
    const backend = this.backend
    const agentId = call.agentId
    let failures = 0
    const going = () => !this.over(call) && call.opened
    while (going()) {
      await this.pause(LiveCall.pollSeconds)
      if (!going()) return
      try {
        const fresh: string[] = []
        if (call.viaChat) {
          const page = await backend.command('getAgentTranscriptTail', {
            id: agentId,
            limit: 30,
          })
          if (!going()) return
          for (const entry of arr(field(page, 'entries')) ?? []) {
            const message = field(entry, 'message')
            if (
              str(field(entry, 'kind')) !== 'send-message' ||
              str(field(message, 'type')) !== 'text'
            )
              continue
            const entryId = text(field(entry, 'id'))
            const words = text(field(message, 'content'))
            if (entryId == null || words == null) continue
            if (!call.seenChat.has(entryId)) {
              call.seenChat.add(entryId)
              fresh.push(prefix(words, VoiceCallText.relayMaxChars))
            }
          }
        } else {
          const outbox = await backend.command('voiceCall', {
            agentId,
            callId: call.id,
            kind: 'outbox',
            after: call.after,
          })
          if (!going()) return
          for (const message of arr(field(outbox, 'messages')) ?? []) {
            const seq = num(field(message, 'seq')) ?? 0
            if (seq <= call.after) continue
            call.after = seq
            const words = text(field(message, 'text'))?.trim()
            if (words) fresh.push(words)
          }
        }
        failures = 0
        let roster: Agent[] | undefined
        try {
          roster = await backend.listAgents()
        } catch {
          roster = undefined
        }
        if (!going()) return
        const row = roster?.find((agent) => agent.id === agentId)
        // What it is doing ("Using Gmail…"), else what it was asked ("Sending the agenda to Dana…"), while it or a helper runs.
        const label = row?.isRunning
          ? (VoiceCallText.describeActivity(
              row.activityKind,
              row.activityTool,
              row.activityDetail,
            ) ??
            (call.lastTask != null
              ? VoiceCallText.workingLabel(call.lastTask)
              : undefined))
          : undefined
        this.update(call, (state) => (state.activity = label))
        // Said by `replyLoop` once the line is quiet, never over the voice.
        if (fresh.length > 0) call.pendingReplies.push(...fresh)
      } catch {
        if (!going()) return
        failures += 1
        if (failures >= 10) {
          this.update(call, (state) => (state.activity = undefined))
          return
        }
      }
    }
  }

  /**
   * Work that came back is said only once the line is quiet: the voice has
   * finished speaking and the person is not talking, for `quiet` seconds
   * (the founder, 9 October 2026, of a reply that cut the voice off in the
   * middle of a sentence: "he cant cut himself like this, wait of turn").
   * Several that arrive while the voice talks are said together.
   */
  private async replyLoop(call: Call): Promise<void> {
    let quietSince: number | undefined
    while (!this.over(call)) {
      await this.pause(0.1)
      if (this.over(call)) return
      const live = this.state?.phase === 'live'
      // Before the voice is on (the channel opens while it rings), what came back waits.
      if (!live || call.speaking || call.activity >= LiveCall.personTalking) {
        quietSince = undefined
        continue
      }
      const since = quietSince ?? Date.now()
      quietSince = since
      if ((Date.now() - since) / 1000 < this.quiet) continue
      const replies = call.pendingReplies
      call.pendingReplies = []
      if (replies.length === 0) continue
      quietSince = undefined
      await this.transport.say(
        VoiceCallText.workCameBack(replies),
        VoiceCallText.workCameBackNudge,
      )
    }
  }

  /** The waveform: louder while the agent speaks, the person's own voice otherwise. */
  private async waveLoop(call: Call): Promise<void> {
    while (!this.over(call)) {
      await this.pause(0.09)
      if (this.over(call)) return
      const muted = this.state?.isMuted ?? false
      const level = call.activity
      const talking = call.speaking
      this.update(call, (state) => {
        if (state.phase !== 'live') return
        const loud = talking ? 1 : muted ? 0 : Math.max(0, Math.min(1, level))
        state.levels = Array.from(
          { length: 24 },
          () => loud * (0.25 + Math.random() * 0.75),
        )
      })
    }
  }

  mute(muted: boolean): void {
    const call = this.current
    if (!call) return
    this.update(call, (state) => (state.isMuted = muted))
    void this.transport.setMuted(muted)
  }

  /** End (or the red button while it rings): ended at once, with its tone and its length as of the click, and the voice let go after (`call-controller.ts`). */
  hangUp(): void {
    const call = this.current
    if (!call || !this.state) return
    this.finish(call)
    void this.transport.end(call.id)
  }

  private fail(call: Call, message: string): void {
    const already = call.finished
    call.finished = true
    // Hung up, or failed already: what comes late (a token, the seventh ring) changes nothing.
    if (already || call !== this.current) return
    this.tones?.stopRinging()
    this.log(`call failed: ${message}`)
    this.update(call, (state) => {
      state.phase = 'ended'
      state.status = message
      state.failed = true
      state.activity = undefined
      state.levels = []
      state.endedAt = Date.now()
    })
    if (call.opened) this.closeEmpty(call)
    if (this.failedStays != null) this.leaveSoon(call, this.failedStays)
  }

  /** The end: the server's summary and transcript (asked again after 5 and 10 s), then the record to the agent. */
  private finish(call: Call): void {
    const already = call.finished
    call.finished = true
    if (already || call !== this.current) return
    const snapshot = this.state
    const seconds = snapshot ? callSeconds(snapshot) : 0
    const conversation = call.conversationId
    this.tones?.stopRinging()
    // The Mac's tone when a call that was live ends.
    if (snapshot?.phase === 'live') this.tones?.hangUp()
    this.update(call, (state) => {
      state.phase = 'ended'
      state.status = VoiceCallText.ended()
      state.agentSpeaking = false
      state.activity = undefined
      state.levels = []
      state.endedAt = Date.now()
    })
    this.log(
      snapshot?.connectedAt == null
        ? `call ended before it connected (agent ${call.agentId})`
        : `call ended: ${seconds}s`,
    )
    this.leaveSoon(call, 1.2)
    const heard = snapshot?.lines ?? []
    const person = this.personName()
    const backend = this.backend
    void (async () => {
      let summary: string | null = null
      let transcript: JSONValue[] = heard.map((line) => ({
        speaker: line.fromPerson ? 'user' : 'agent',
        text: line.text,
      }))
      if (conversation != null && snapshot?.connectedAt != null) {
        const ask = async () => {
          try {
            return await backend.server(
              `proxy/v1/voice/calls/${conversation}/end`,
              'POST',
              { seconds },
            )
          } catch {
            return undefined
          }
        }
        let ending = await ask()
        for (const wait of LiveCall.summaryRetryWaits) {
          if (
            text(field(ending, 'summary')) != null &&
            (arr(field(ending, 'transcript')) ?? []).length > 0
          )
            break
          await this.pause(wait)
          ending = (await ask()) ?? ending
        }
        summary = text(field(ending, 'summary')) ?? null
        const lines = arr(field(ending, 'transcript'))
        if (lines && lines.length > 0) transcript = lines
      }
      let written = 0
      if (call.opened && !call.viaChat) {
        const record = {
          seconds,
          personName: person ?? null,
          recap: summary,
          transcript,
        }
        try {
          const answer = await backend.command('voiceCall', {
            agentId: call.agentId,
            callId: call.id,
            kind: 'ended',
            record,
          })
          const exchange = num(field(answer, 'exchange'))
          written = exchange != null ? Math.round(exchange) : 0
        } catch {
          written = 0
        }
      }
      // A host that wrote no line of its own (one from before 2 October 2026, or the call went through the chat): the call's line and recap (`voice-call-service.ts`).
      if (written === 0 && snapshot?.connectedAt != null) {
        const head = `Voice call · ${callClock(seconds)}`
        const words = summary != null ? `${head}\n\n${summary}` : head
        try {
          await backend.command('appendSendMessage', {
            agentId: call.agentId,
            message: { type: 'text', content: words },
          })
        } catch {
          // The call is over either way.
        }
      }
    })()
  }

  private leaveSoon(call: Call, seconds: number): void {
    void (async () => {
      await this.pause(seconds)
      if (call === this.current && this.state?.phase === 'ended')
        this.set(undefined)
    })()
  }
}
