// Names in a message (SimeonCore's `Mentions`, Markdown.swift): the apps a
// message names, drawn in their colours with their logos, and the agents,
// drawn in a glass pill with their faces.

import { type BrandMention, brandMentions } from './generatedBrands'

/** An agent a message can name (`Mentions.AgentName`). */
export interface AgentName {
  name: string
  id: string
}

export type MentionKind =
  | { kind: 'brand'; brand: BrandMention }
  /** An agent: its id (the apps draw its picture beside the name). */
  | { kind: 'agent'; id: string }

/** One name found: UTF-16 offsets in the searched words. */
export interface Mention {
  location: number
  length: number
  kind: MentionKind
}

/** ICU's `\w` (letters, marks, digits, joiners), as the Mac's patterns read it. */
const wordCharacter = '[\\p{L}\\p{M}\\p{Nd}\\p{Pc}\\u200c\\u200d]'

// A dash needs no escape outside a class (and may not have one in a Unicode pattern).
const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** The names' pattern: case-sensitive, the longest spelling first, not glued to a word, an @, a slash, a dot or a dash before it, nor a word or a dash after it. */
function pattern(names: string[]): RegExp {
  const sorted = [...names].sort((a, b) => b.length - a.length).map(escape)
  return new RegExp(
    `(?<![${wordCharacter.slice(1, -1)}@/.-])(?:${sorted.join('|')})(?!${wordCharacter}|-)`,
    'gu',
  )
}

const brandPattern = pattern(brandMentions.map((brand) => brand.name))
const brandByName = new Map<string, BrandMention>()
for (const brand of brandMentions)
  if (!brandByName.has(brand.name)) brandByName.set(brand.name, brand)

/** The names' pattern, built once per set of names: a streaming answer asks for it on every paragraph. */
const agentPatterns = new Map<string, RegExp>()
function agentPattern(names: string[]): RegExp {
  const key = [...names].sort().join('\u0001')
  let made = agentPatterns.get(key)
  if (!made) {
    if (agentPatterns.size > 32) agentPatterns.clear()
    made = pattern(names)
    agentPatterns.set(key, made)
  }
  return made
}

function matchesOf(regex: RegExp, text: string) {
  regex.lastIndex = 0
  return [...text.matchAll(regex)].map((m) => ({
    location: m.index,
    length: m[0].length,
    text: m[0],
  }))
}

/**
 * Brand names, then agent names in what is left (`Mentions.find`), each
 * read in its sentence. An app whose name is an everyday word (Link, Shop,
 * Square, Close…) is marked only where the words around it make it the
 * app; any other app wherever it is written. Agents: every one at least
 * two letters long, but never the person's own name, the speaker's own
 * (its id), nor a name used as a thing's ("the Simeon app", "an app called
 * Simeon"); save the speaker introducing itself (`introducing`), whose own
 * name is dressed there. `within` keeps only the names wholly inside that
 * part of the words (a run of a line), read in the whole line.
 */
export function findMentions(
  text: string,
  options: {
    within?: { location: number; length: number }
    agents: readonly AgentName[]
    personName?: string
    speaker?: string
    introducing?: boolean
  },
): Mention[] {
  const found = matchesOf(brandPattern, text).flatMap((m) => {
    const brand = brandByName.get(m.text)
    return brand ? [{ ...m, brand }] : []
  })
  const ranges = found.map((m) => ({ location: m.location, length: m.length }))
  const out: Mention[] = []
  found.forEach((candidate, index) => {
    if (candidate.brand.ordinaryWord && !namesTheApp(text, index, ranges))
      return
    out.push({
      location: candidate.location,
      length: candidate.length,
      kind: { kind: 'brand', brand: candidate.brand },
    })
  })
  const person = options.personName?.trim().toLowerCase()
  const introduced = options.introducing ? options.speaker : undefined
  const named = options.agents.filter(
    (agent) =>
      [...agent.name.trim()].length >= 2 &&
      agent.name.toLowerCase() !== person &&
      (agent.id !== options.speaker || agent.id === introduced),
  )
  if (named.length > 0) {
    const byName = new Map<string, AgentName>()
    // The one introducing itself first: its name is its own, whoever else shares it.
    for (const agent of [
      ...named.filter((a) => a.id === introduced),
      ...named.filter((a) => a.id !== introduced),
    ])
      if (!byName.has(agent.name)) byName.set(agent.name, agent)
    for (const m of matchesOf(agentPattern([...byName.keys()]), text)) {
      const overlaps = out.some(
        (o) =>
          o.location < m.location + m.length &&
          m.location < o.location + o.length,
      )
      const agent = byName.get(m.text)
      if (overlaps || !agent) continue
      if (agent.id !== introduced && namesAThing(text, m)) continue
      out.push({
        location: m.location,
        length: m.length,
        kind: { kind: 'agent', id: agent.id },
      })
    }
  }
  const part = options.within
  const kept = part
    ? out.filter(
        (m) =>
          m.location >= part.location &&
          m.location + m.length <= part.location + part.length,
      )
    : out
  return kept.sort((a, b) => a.location - b.location)
}

// MARK: Reading a name in its sentence

/** Words after an everyday-word app's name that make it the app: "your Link wallet", "the Shop app", "Square payments". */
const appNouns = new Set(
  'account accounts api app apps balance board boards card cards checkout connection connector connectors crm dashboard dashboards database extension inbox integration integrations login mcp order orders pay payment payments plugin profile project projects settings store subscription wallet wallets workspace workspaces'.split(
    ' ',
  ),
)
/** Words just before an everyday-word app's name that make it the app: "pay with Link", "open Shop", "saved in Box". Not a bare "to". */
const appCues = new Set(
  'connect connected connecting connects from in inside into on onto open opened opening opens reconnect reconnected through use used uses using via with'.split(
    ' ',
  ),
)
/** The words before "to" that make "to" a cue: "signed in to Link", "connected to Square". */
const appCuesBeforeTo = new Set(
  'back connect connected connecting in reconnect reconnected switch switched'.split(
    ' ',
  ),
)
/** Words after which an everyday word is a verb: "we can Shop here", "let's Link them". */
const verbCues = new Set(
  "can can't cannot could couldn't did didn't do don't i'd i'll let's may might must please shall should shouldn't to we'd we'll will won't would wouldn't you'd you'll".split(
    ' ',
  ),
)
/** What joins names in a list ("Gmail, Link and Shop", "Square/Ramp", "Stripe Link"). */
const listJoins = new Set([
  '',
  ',',
  '&',
  '/',
  '+',
  'and',
  'or',
  ', and',
  ', or',
])
/** Words before a name that make it a name being given: "an app called Simeon". */
const namingWords = new Set(['called', 'dubbed', 'named', "name's", 'titled'])
const namingPairs = new Set(['known as', 'name is', 'name was', 'names are'])
/** Words before a name that make it a thing's: "the Simeon app". */
const thingWords = new Set([
  'a',
  'an',
  'its',
  'my',
  'our',
  'the',
  'their',
  'your',
])
/** The same for a place, but not before a possessive: "built in Simeon", yet "in Theo's chat". */
const placeWords = new Set(['in', 'inside', 'into', 'within'])
/** What a name stands beside when it is a product's ("the company Simeon", "my app, Simeon"). */
const productWords = new Set(
  'app brand business company platform product startup website'.split(' '),
)
/** Words after a name that make it a product's: "Simeon app", "Simeon Labs". */
const productNouns = new Set(
  'account accounts ai android app apps beta codebase customer customers dashboard desktop docs domain feedback homepage inc ios iphone labs landing logo mac marketing onboarding pricing product repo roadmap site subscription subscriptions user users waitlist web website'.split(
    ' ',
  ),
)
/** The same after "'s", less what an agent has of its own: "Simeon's website". */
const productNounsAfterPossessive = new Set(
  'android app apps codebase customers domain homepage ios iphone landing logo mac marketing onboarding pricing product repo roadmap site subscription subscriptions users waitlist website'.split(
    ' ',
  ),
)

/** A word as the lists above spell it: lower case, a curly apostrophe straight. */
const key = (word: string) => word.toLowerCase().replace(/’/g, "'")

const isLetter = (text: string, index: number) =>
  index >= 0 && index < text.length && /[\p{L}\p{M}\p{N}]/u.test(text[index]!)
const newlines = new Set(['\n', '\r', '\u000b', '\u000c', '\u0085', ' ', ' '])
/** Marks a sentence's start may have before its first word: quotes, brackets, list and emphasis marks (spaces aside). */
const skippedMarks = new Set([...'*_"\'“‘([>#-•'])
const sentenceEnds = new Set([...'.!?:…'])
const wordGap = new Set([...' \t*_~"\'“”‘’'])
const apostrophes = new Set(["'", '’'])

/** Whether the word at `location` begins a sentence (`startsSentence`): nothing but spaces, quotes, brackets and list or emphasis marks since the text's start, a line break, or a full stop, question or exclamation mark, or colon. */
function startsSentence(text: string, location: number): boolean {
  for (let index = location - 1; index >= 0; index--) {
    const c = text[index]!
    if (newlines.has(c)) return true
    if (!(c === '\t' || /\p{Zs}/u.test(c) || skippedMarks.has(c)))
      return sentenceEnds.has(c)
  }
  return true
}

/** The word before `location` and where it starts, over spaces and emphasis only, or the marks in `through` too. */
function wordBefore(
  text: string,
  location: number,
  through = '',
): { word: string; location: number } | undefined {
  let index = location - 1
  while (
    index >= 0 &&
    (wordGap.has(text[index]!) || through.includes(text[index]!))
  )
    index -= 1
  const end = index + 1
  while (index >= 0) {
    if (isLetter(text, index)) {
      index -= 1
      continue
    }
    if (
      apostrophes.has(text[index]!) &&
      index + 1 < end &&
      isLetter(text, index - 1)
    ) {
      index -= 1
      continue
    }
    break
  }
  if (index + 1 >= end) return undefined
  return { word: text.slice(index + 1, end), location: index + 1 }
}

/** The word after `end` ("sign-in" whole), past a possessive "'s", over spaces and emphasis only. */
function wordAfter(
  text: string,
  end: number,
): { word: string; possessive: boolean } | undefined {
  let index = end
  let possessive = false
  if (
    apostrophes.has(text[index] ?? '') &&
    text[index + 1] === 's' &&
    !isLetter(text, index + 2)
  ) {
    possessive = true
    index += 2
  }
  while (index < text.length && wordGap.has(text[index]!)) index += 1
  const start = index
  while (
    index < text.length &&
    (isLetter(text, index) ||
      (text[index] === '-' && isLetter(text, index + 1) && index > start))
  )
    index += 1
  if (index <= start) return undefined
  return { word: text.slice(start, index), possessive }
}

/**
 * Whether the everyday-word app at `index` of the names found is the app
 * here (`namesTheApp`): a cue before it, another app's name beside it, or an
 * app's word after it. Never as a verb, nor in a title, nor as a sentence's
 * first word unless it is in a list of apps.
 */
function namesTheApp(
  text: string,
  index: number,
  found: { location: number; length: number }[],
): boolean {
  const range = found[index]!
  const joined = (from: number, to: number) => {
    if (from > to) return false
    const between = [...text.slice(from, to)]
      .filter((c) => !'*_~'.includes(c))
      .join('')
    return listJoins.has(
      between.split(/[ \t]/).filter(Boolean).join(' ').toLowerCase(),
    )
  }
  const previous = found[index - 1]
  const next = found[index + 1]
  const listed =
    (previous != null &&
      joined(previous.location + previous.length, range.location)) ||
    (next != null && joined(range.location + range.length, next.location))
  if (startsSentence(text, range.location)) return listed
  const after = wordAfter(text, range.location + range.length)
  const appWordAfter = after != null && appNouns.has(key(after.word))
  const before = wordBefore(text, range.location)
  if (!before) return listed || appWordAfter
  const cue = key(before.word)
  if (cue === 'to') {
    const earlier = wordBefore(text, before.location)
    if (earlier && appCuesBeforeTo.has(key(earlier.word))) return true
  }
  if (appCues.has(cue)) return true
  if (verbCues.has(cue)) return false
  // A word in a title: a capital before it that does not start the sentence and is not another app's name.
  if (
    /\p{Lu}/u.test(before.word[0] ?? '') &&
    !startsSentence(text, before.location) &&
    !found.some(
      (f) =>
        before.location >= f.location &&
        before.location < f.location + f.length,
    )
  )
    return false
  return listed || appWordAfter
}

/** Whether the agent's name at `range` is used as a thing's or a name being given (`namesAThing`). */
function namesAThing(
  text: string,
  range: { location: number; length: number },
): boolean {
  const after = wordAfter(text, range.location + range.length)
  if (
    after &&
    (after.possessive ? productNounsAfterPossessive : productNouns).has(
      key(after.word),
    )
  )
    return true
  const before = wordBefore(text, range.location)
  if (before) {
    const last = key(before.word)
    if (thingWords.has(last) || namingWords.has(last) || productWords.has(last))
      return true
    if (placeWords.has(last) && after?.possessive !== true) return true
    const earlier = wordBefore(text, before.location)
    if (earlier && namingPairs.has(`${key(earlier.word)} ${last}`)) return true
  }
  const apposed = wordBefore(text, range.location, ',:')
  if (apposed && productWords.has(key(apposed.word))) return true
  return false
}
