// Settings' General, its account page and Permissions, as the shared core
// keeps their rules (ios/SimeonCore/Sources/SimeonCore/AccountSettings.swift:
// `AccountDisplay`, `AutoReviewInstructions`, `TimeZoneChoices`; the
// Language picker of AppLanguage.swift), and the values those pages show as
// the computer keeps them (mac/Simeon/SettingsGeneral.swift's
// `GeneralSettingsModel`, without the Mac's own tools: how the agents may
// use this computer and the team's ceiling, which a browser has no hands
// for). The rules were checked against the shipped window's functions run in
// Node (`Fixtures/settings.json`); the tests read that fixture in place.

import {
  type AutoReviewInstructions,
  autoReviewFrom,
  autoReviewJSON,
  maxRuleCharacters,
  maxRules,
} from './cards'
import { type JSONValue, field, str } from './json'
import { t } from './l10n'
import {
  english,
  isEnglish,
  languageCode,
  languageTag,
  languages,
  systemLanguage,
} from './language'
import { displayLocale } from './listTime'
import { wordsLanguage } from './words'

// MARK: Characters, as Swift counts them

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** How many characters `words` has, as Swift's `count` counts them (an emoji is one). */
export function characterCount(words: string): number {
  return [...graphemes.segment(words)].length
}

/** The first `limit` characters of `words`, as Swift's `prefix` keeps them. */
export function firstCharacters(words: string, limit: number): string {
  if (words.length <= limit) return words
  let out = ''
  let count = 0
  for (const part of graphemes.segment(words)) {
    if (count === limit) break
    out += part.segment
    count += 1
  }
  return out
}

// MARK: The account card (`AccountDisplay`)

/** The account card's two lines (`resolveAccountDisplay`): the name ("Simeon" with none), and the e-mail under it unless it is the name. */
export interface AccountDisplay {
  name?: string
  secondary?: string
  /** What the card's name says. */
  title: string
}

function trimmed(words: string | null | undefined): string | undefined {
  const value = words?.trim()
  return value ? value : undefined
}

export function accountDisplay(
  displayName: string | null | undefined,
  email: string | null | undefined,
): AccountDisplay {
  const name = trimmed(displayName)
  const mail = trimmed(email)
  const secondary =
    mail !== undefined && mail.toLowerCase() !== name?.toLowerCase()
      ? mail
      : undefined
  return { name, secondary, title: name ?? 'Simeon' }
}

// MARK: Auto-review's rules (`AutoReviewInstructions`)
//
// Two lists, "Allow automatically" and "Ask first", twenty rules each, a
// thousand characters a rule; as the host keeps them in its settings
// (`autoReviewInstructions`). Reading them and writing them back is step
// 3a's (`autoReviewFrom`, `autoReviewJSON` in cards.ts); the editor's rules
// are here (`Ce`, `Ke`, `Ks`, `Hs`): no rule twice in a list, no rule into
// a full list, and an edited rule that moves to the other list goes to its
// end.

export type { AutoReviewInstructions }

export type RuleBehavior = 'allow' | 'ask'

/** Allow automatically, then Ask first (`Behavior.allCases`). */
export const ruleBehaviors: readonly RuleBehavior[] = ['allow', 'ask']

/** A rule as the lists show it: which list, its words, its place in that list. */
export interface ReviewRule {
  behavior: RuleBehavior
  text: string
  listIndex: number
}

export function sameRule(
  a: ReviewRule | undefined,
  b: ReviewRule | undefined,
): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.behavior === b.behavior &&
    a.text === b.text &&
    a.listIndex === b.listIndex
  )
}

export { maxRuleCharacters, maxRules }

/** Under a full list's last row (`Ys`): "max 20 rules". */
export function ruleLimitNote(): string {
  return t`max ${maxRules} rules`
}

/** A list's name (`label`). */
export function ruleListLabel(behavior: RuleBehavior): string {
  return behavior === 'allow' ? t('Allow automatically') : t('Ask first')
}

/** A draft as the editor keeps it: cut at a thousand characters (`clip`). */
export function clipRule(draft: string): string {
  return characterCount(draft) <= maxRuleCharacters
    ? draft
    : firstCharacters(draft, maxRuleCharacters)
}

/** As the host keeps them (`normalized`, `qMt`): each rule trimmed and cut at a thousand characters, empty and repeated ones dropped, twenty a list. */
export function normalizedRules(
  json: JSONValue | undefined,
): AutoReviewInstructions {
  const read = autoReviewFrom(json)
  const list = (rules: readonly string[]) => {
    const out: string[] = []
    for (const raw of rules) {
      const rule = clipRule(raw.trim())
      if (rule === '' || out.includes(rule)) continue
      out.push(rule)
      if (out.length >= maxRules) break
    }
    return out
  }
  return {
    isEnabled: read.isEnabled,
    allow: list(read.allow),
    ask: list(read.ask),
  }
}

export function ruleList(
  rules: AutoReviewInstructions,
  behavior: RuleBehavior,
): string[] {
  return behavior === 'allow' ? rules.allow : rules.ask
}

function withList(
  rules: AutoReviewInstructions,
  behavior: RuleBehavior,
  list: string[],
): AutoReviewInstructions {
  return behavior === 'allow'
    ? { ...rules, allow: list }
    : { ...rules, ask: list }
}

/** The lists' rows: the allowed ones, then the ask-first ones (`rules`, `Hs`). */
export function reviewRules(rules: AutoReviewInstructions): ReviewRule[] {
  return [
    ...rules.allow.map((text, listIndex) => ({
      behavior: 'allow' as const,
      text,
      listIndex,
    })),
    ...rules.ask.map((text, listIndex) => ({
      behavior: 'ask' as const,
      text,
      listIndex,
    })),
  ]
}

export function isFullList(list: readonly string[]): boolean {
  return list.length >= maxRules
}

/** The lists without `rule` (`removing`). */
export function removingRule(
  rules: AutoReviewInstructions,
  rule: ReviewRule,
): AutoReviewInstructions {
  return withList(
    rules,
    rule.behavior,
    ruleList(rules, rule.behavior).filter(
      (_, index) => index !== rule.listIndex,
    ),
  )
}

/** The rule being edited, found again after the lists changed (`relocate`, `Ks`); none once it is gone. */
export function relocatedRule(
  rules: AutoReviewInstructions,
  rule: ReviewRule,
): ReviewRule | undefined {
  const index = ruleList(rules, rule.behavior).indexOf(rule.text)
  if (index < 0) return undefined
  return index === rule.listIndex ? rule : { ...rule, listIndex: index }
}

/** A rule added, or `editing` saved with these words and this list; none when it may not be (`saving`, `Ce`). */
export function savingRule(
  rules: AutoReviewInstructions,
  text: string,
  behavior: RuleBehavior,
  editing: ReviewRule | undefined,
): AutoReviewInstructions | undefined {
  const target = ruleList(rules, behavior)
  const sameList = editing?.behavior === behavior
  if (
    target.some(
      (one, index) =>
        one === text && !(sameList && index === editing?.listIndex),
    )
  )
    return undefined
  if (editing === undefined)
    return isFullList(target)
      ? undefined
      : withList(rules, behavior, [...target, text])
  if (sameList) {
    const next = [...target]
    if (editing.listIndex >= 0 && editing.listIndex < next.length)
      next[editing.listIndex] = text
    else next.push(text)
    return withList(rules, behavior, next)
  }
  if (isFullList(target)) return undefined
  const without = removingRule(rules, editing)
  return withList(without, behavior, [...ruleList(without, behavior), text])
}

// MARK: The time zone (`TimeZoneChoices`)

/** The menu's Auto-detect (`automatic`). */
export const automaticZone = 'auto'

/** A zone as the menu names it: "_" read as a space. */
export function zoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ')
}

/** "Auto-detect (America/New York)". */
export function automaticZoneLabel(detected: string | undefined): string {
  return detected !== undefined
    ? t`Auto-detect (${zoneLabel(detected)})`
    : t('Auto-detect')
}

/** The menu's values in order: `automatic`, the zone chosen when it is not a known one, then the known zones. */
export function zoneValues(
  override: string | undefined,
  known: readonly string[],
): string[] {
  const values = [automaticZone]
  if (override !== undefined && !known.includes(override)) values.push(override)
  return [...values, ...known]
}

/** The trigger's words: the zone chosen, or "Auto-detect (Zone)". */
export function zoneTriggerLabel(
  override: string | undefined,
  detected: string | undefined,
): string {
  return override !== undefined
    ? zoneLabel(override)
    : automaticZoneLabel(detected)
}

/**
 * The time now in each zone, in order ("" for a zone not known), as a menu
 * row shows it beside the zone: English keeps its own "h:mm a" ("8:16
 * PM"), another language writes the time its own way ("20:16" in French,
 * Apple's template "jmm").
 */
export function zoneTimesNow(
  zones: readonly string[],
  now: Date = new Date(),
  language: string = wordsLanguage(),
): string[] {
  const inEnglish = isEnglish(languageTag(language))
  const locale = displayLocale(language)
  return zones.map((zone) => {
    try {
      if (!inEnglish)
        return new Intl.DateTimeFormat(locale, {
          timeStyle: 'short',
          timeZone: zone,
        }).format(now)
      const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
      }).formatToParts(now)
      const hour = Number(parts.find((part) => part.type === 'hour')?.value)
      const minute = parts.find((part) => part.type === 'minute')?.value ?? ''
      return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
    } catch {
      return ''
    }
  })
}

/** The zone chosen as the host keeps it (`userTimeZoneOverride`): an empty one is none. */
export function zoneOverrideOf(
  hostSettings: JSONValue | undefined,
): string | undefined {
  // Swift trims spaces and tabs (`.whitespaces`), not new lines.
  const zone = str(field(hostSettings, 'userTimeZoneOverride'))?.replace(
    /^[^\S\r\n\u2028\u2029]+|[^\S\r\n\u2028\u2029]+$/g,
    '',
  )
  return zone ? zone : undefined
}

/**
 * The zones the menu lists: the browser's own (`Intl.supportedValuesOf`),
 * in order (`TimeZone.knownTimeZoneIdentifiers.sorted()` on the Mac). The
 * browser names them as the Unicode consortium's data does (Chromium:
 * "Asia/Calcutta", "Europe/Kiev", 418 zones, no "UTC"), where Apple's list
 * has the time zone database's names; a zone chosen on the Mac that the
 * browser doesn't list is shown on its own, as the core's menu does.
 */
export function knownTimeZones(): string[] {
  try {
    return [...Intl.supportedValuesOf('timeZone')].sort()
  } catch {
    return []
  }
}

/**
 * A zone a browser says when it hides its own (Firefox's resist
 * fingerprinting, LibreWolf, Tor and Mullvad Browser report UTC): not taken
 * as the person's, so the agents' routines don't move by hours. A computer
 * really set to UTC is taken as hiding it too.
 */
export function isHiddenZone(zone: string): boolean {
  return zone === 'UTC' || zone === 'Etc/UTC'
}

/** The zone this browser is in (`TimeZone.current.identifier`). */
export function detectedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// MARK: The language (AppLanguage.swift's picker)

/**
 * Each language Simeon is translated into, in its own words, as Settings
 * shows it (`AppLanguage.ownNames`); later languages are a line each.
 */
const ownNames: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  pt: 'Português',
  ja: '日本語',
  it: 'Italiano',
  nl: 'Nederlands',
  ko: '한국어',
  'zh-Hant': '繁體中文',
  ar: 'العربية',
  sv: 'Svenska',
  pl: 'Polski',
  tr: 'Türkçe',
}

/** The language in its own words: "Français" (`ownName`); the browser's own name for one Simeon hasn't named. */
export function ownLanguageName(tag: string): string {
  const name = ownNames[tag] ?? ownNames[languageCode(tag)]
  if (name) return name
  try {
    const own = new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
    if (own) return own.charAt(0).toUpperCase() + own.slice(1)
  } catch {
    // The tag itself, below.
  }
  return tag
}

/** The languages the app is in, for the picker: English first, then by their own names (`available`). */
export function availableLanguages(
  localizations: readonly string[] = languages,
): string[] {
  const seen = new Set<string>()
  const tags = localizations.map(languageTag).filter((tag) => {
    if (seen.has(tag)) return false
    seen.add(tag)
    return true
  })
  const rest = tags
    .filter((tag) => !isEnglish(tag))
    .sort((a, b) => ownLanguageName(a).localeCompare(ownLanguageName(b)))
  return [english, ...rest]
}

/** The picker's choices: System, then each language the app is in, in its own name (`choices`). */
export function languageChoices(
  localizations: readonly string[] = languages,
): { value: string; label: string }[] {
  return [
    { value: systemLanguage, label: t('System') },
    ...availableLanguages(localizations).map((tag) => ({
      value: tag,
      label: ownLanguageName(tag),
    })),
  ]
}

// MARK: Legal (`SettingsLegal`, `AboutSimeon.copyright`)

/** Where the legal pages are: the iPhone's and the website's sign-in link to the same two. */
export const legalPages = {
  privacy: 'https://www.simeonlabs.com/privacy',
  terms: 'https://www.simeonlabs.com/terms',
} as const

/** The company under Legal's two rows, and About's (`AboutSimeon.copyright`, English in every language). */
export const copyrightLine = 'Copyright © 2026 Spaire, Inc.'

// MARK: The values the computer keeps (`GeneralSettingsModel`)

/** What the model asks of the store (StoreSettings.swift). */
export interface GeneralSettingsStore {
  readHostSettings(): Promise<JSONValue | undefined>
  setTimeZone(zone: string | undefined, detected: string): Promise<boolean>
  setAutoReview(rules: AutoReviewInstructions): Promise<boolean>
}

/** A rule being edited in its row: the rule as stored, and its words and list as changed. */
export interface RuleEditing {
  rule: ReviewRule
  text: string
  behavior: RuleBehavior
}

/**
 * General's values as the computer keeps them: the time zone chosen,
 * Auto-review and its rules, the rule being written at the foot of each
 * list and the one edited in its row. Each page that shows some of them
 * holds its own, read when the page shows and again when the computer
 * comes back while nothing was read (`load`, `readAgainWhenBack`). A change is shown once the computer has it; a refused
 * one keeps the old value and says nothing.
 *
 * Nothing is written before the computer's values are read (`loaded`):
 * each write sends the whole lists and the zone, so a change made on the
 * page's defaults would replace the person's rules or their chosen zone.
 * A read that fails keeps the page waiting (`loadFailed`) until one
 * answers. The web waited first (the session's decision, 2 November 2026:
 * its read can wake a resting computer and take tens of seconds); the Mac
 * and the iPhone wait the same way since 3 November 2026
 * (`HostSettingsLoad`).
 */
export class GeneralSettingsModel {
  /** The zone this browser is in; the one chosen instead (none: this browser's). */
  readonly detectedZone: string
  zoneOverride?: string
  zonePending = false
  /** The zone the computer keeps from the devices (`userTimeZone`), as last read. */
  hostZone?: string

  /** The computer's values are read: the page's controls may change them. */
  loaded = false
  /** The read failed: the page waits, saying so. */
  loadFailed = false
  /** Changes started, so a read sent before one is dropped (its answer is older). */
  private writes = 0

  rules: AutoReviewInstructions = { isEnabled: true, allow: [], ask: [] }
  rulesPending = false
  /** The rule being written at the foot of each list. */
  drafts: Partial<Record<RuleBehavior, string>> = {}
  editing?: RuleEditing

  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(
    private readonly store: GeneralSettingsStore,
    detectedZone: string = detectedTimeZone(),
  ) {
    this.detectedZone = detectedZone
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * After the read as the page shows: read again when the computer comes
   * back (`isLive` true) while nothing has been read, so a read that failed
   * doesn't keep the page waiting; never as it goes to rest, which a read
   * would wake. The function returned stops it (SettingsGeneral.swift's
   * `onChange(of: store.isLive)`).
   */
  readAgainWhenBack(stream: {
    readonly isLive: boolean
    subscribe(listener: () => void): () => void
  }): () => void {
    let live = stream.isLive
    return stream.subscribe(() => {
      if (stream.isLive === live) return
      live = stream.isLive
      if (live && !this.loaded) void this.load()
    })
  }

  /** The page shown: the computer's settings read (`getHostSettings`), the zone chosen and the rules taken from them. A read that answers after a change began is dropped. */
  async load(): Promise<void> {
    const started = this.writes
    const settings = await this.store.readHostSettings()
    if (this.writes !== started) return
    if (settings === undefined) {
      if (!this.loaded && !this.loadFailed) {
        this.loadFailed = true
        this.changed()
      }
      return
    }
    this.zoneOverride = zoneOverrideOf(settings)
    this.hostZone = str(field(settings, 'userTimeZone')) || undefined
    this.rules = normalizedRules(field(settings, 'autoReviewInstructions'))
    this.loaded = true
    this.loadFailed = false
    this.changed()
  }

  /**
   * The zone the agents follow while none is chosen: this browser's, or,
   * when the browser hides its own (`isHiddenZone`), the one the computer
   * keeps from the person's other devices.
   */
  get followedZone(): string {
    return isHiddenZone(this.detectedZone) && this.hostZone
      ? this.hostZone
      : this.detectedZone
  }

  /** The zone chosen, or none for this browser's (the switch, the menu): kept once the computer has it. */
  async setZone(zone: string | undefined): Promise<void> {
    if (!this.loaded || this.zonePending) return
    this.writes += 1
    this.zonePending = true
    this.changed()
    if (await this.store.setTimeZone(zone, this.detectedZone))
      this.zoneOverride = zone
    this.zonePending = false
    this.changed()
  }

  // MARK: Auto-review

  /** One write of both lists and the switch; shown once the computer has them. */
  private async write(
    next: AutoReviewInstructions,
    done: () => void = () => {},
  ): Promise<void> {
    if (!this.loaded) return
    this.writes += 1
    this.rulesPending = true
    this.changed()
    if (await this.store.setAutoReview(next)) {
      this.rules = normalizedRules(autoReviewJSON(next))
      // The rule being edited, found again in the new lists, or the edit over.
      const editing = this.editing
      if (editing) {
        const found = relocatedRule(this.rules, editing.rule)
        this.editing = found ? { ...editing, rule: found } : undefined
      }
      done()
    }
    this.rulesPending = false
    this.changed()
  }

  setReviewing(on: boolean): Promise<void> {
    return this.write({ ...this.rules, isEnabled: on })
  }

  setDraft(behavior: RuleBehavior, words: string): void {
    this.drafts = { ...this.drafts, [behavior]: clipRule(words) }
    this.changed()
  }

  /** A list's Add may be pressed: words, room in the list, not there already, no edit under way, nothing on its way. */
  canAdd(behavior: RuleBehavior): boolean {
    const words = (this.drafts[behavior] ?? '').trim()
    return (
      words !== '' &&
      this.loaded &&
      this.editing === undefined &&
      !this.rulesPending &&
      savingRule(this.rules, words, behavior, undefined) !== undefined
    )
  }

  add(behavior: RuleBehavior): Promise<void> {
    const words = (this.drafts[behavior] ?? '').trim()
    const next = this.canAdd(behavior)
      ? savingRule(this.rules, words, behavior, undefined)
      : undefined
    if (!next) return Promise.resolve()
    return this.write(next, () => {
      const drafts = { ...this.drafts }
      delete drafts[behavior]
      this.drafts = drafts
    })
  }

  delete(rule: ReviewRule): Promise<void> {
    if (!this.loaded) return Promise.resolve()
    if (sameRule(this.editing?.rule, rule)) this.editing = undefined
    return this.write(removingRule(this.rules, rule))
  }

  edit(rule: ReviewRule): void {
    if (!this.loaded || this.editing !== undefined || this.rulesPending) return
    this.editing = { rule, text: rule.text, behavior: rule.behavior }
    this.changed()
  }

  setEditingText(words: string): void {
    if (!this.editing) return
    this.editing = { ...this.editing, text: clipRule(words) }
    this.changed()
  }

  setEditingBehavior(behavior: RuleBehavior): void {
    if (!this.editing) return
    this.editing = { ...this.editing, behavior }
    this.changed()
  }

  cancelEdit(): void {
    if (!this.editing) return
    this.editing = undefined
    this.changed()
  }

  get canSave(): boolean {
    const editing = this.editing
    if (!editing || !this.loaded || this.rulesPending) return false
    const words = editing.text.trim()
    return (
      words !== '' &&
      savingRule(this.rules, words, editing.behavior, editing.rule) !==
        undefined
    )
  }

  save(): Promise<void> {
    const editing = this.editing
    const next =
      editing && this.canSave
        ? savingRule(
            this.rules,
            editing.text.trim(),
            editing.behavior,
            editing.rule,
          )
        : undefined
    if (!next) return Promise.resolve()
    return this.write(next, () => {
      this.editing = undefined
    })
  }
}
