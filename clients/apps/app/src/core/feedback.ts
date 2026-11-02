// Send Feedback and Report an Issue (ios/SimeonCore/Sources/SimeonCore/
// Feedback.swift; the founder, 30 October 2026: "anything submitted under
// the hood let it go to bass@simeonlabs.com"). Both sheets post to
// `/desktop/api/feedback` (server/simeon/desktop/feedback.py), which e-mails
// the founder with the person as the reply-to; nothing is stored.
//
// Feedback is words and, if it was about one, an agent. An issue is words,
// up to four screenshots and the topics it is about; first the person says
// whether the app's logs and diagnostics go with it. Either way the server
// is told the app, its version, the browser, its system, the language and
// the time zone (`DeviceFacts`).

import { characterCount, firstCharacters } from './generalSettings'
import type { JSONValue } from './json'
import { t } from './l10n'
import type { Agent } from './models'
import { recentActivity, scrub } from './recentActivity'

export const messageLimit = 5_000
export const screenshotLimit = 4

export type FeedbackKind = 'feedback' | 'issue'

/** The agent a message is about, as the roster names it (`FeedbackAgent`). */
export interface FeedbackAgent {
  id: string
  name: string
  title?: string
}

export function feedbackAgent(
  id: string,
  name: string,
  title: string | undefined,
): FeedbackAgent {
  const job = title?.trim()
  return job ? { id, name, title: job } : { id, name }
}

/** "Maya · Inbox", as the reference's picker names one with its job. */
export function feedbackAgentLabel(agent: FeedbackAgent): string {
  return agent.title !== undefined
    ? `${agent.name} · ${agent.title}`
    : agent.name
}

/** The agents a message can be about: the person's own, not a group, a hidden one or a helper with a purpose (the disk saver). */
export function feedbackAgentChoices(
  agents: readonly Agent[],
): FeedbackAgent[] {
  return agents
    .filter(
      (agent) => !agent.isGroup && !agent.isHidden && agent.purpose == null,
    )
    .map((agent) => feedbackAgent(agent.id, agent.name, agent.title))
}

/**
 * What an issue can be about, as Muse's chips ask: the parts of Simeon a
 * person meets. The id is the English, which the founder reads in the
 * e-mail; the symbol is the Mac's SF Symbol's name, drawn by the sheet.
 */
export interface FeedbackTopic {
  id: string
  symbol: string
  title: string
}

export function feedbackTopics(): FeedbackTopic[] {
  return [
    {
      id: 'Account and sign-in',
      symbol: 'person.crop.circle',
      title: t('Account and sign-in'),
    },
    { id: 'Agents', symbol: 'person.2', title: t('Agents') },
    {
      id: 'Chats',
      symbol: 'bubble.left.and.bubble.right',
      title: t('Chats'),
    },
    {
      id: 'Cloud computer',
      symbol: 'desktopcomputer',
      title: t('Cloud computer'),
    },
    { id: 'Connectors', symbol: 'link', title: t('Connectors') },
    {
      id: 'Routines',
      symbol: 'clock.arrow.circlepath',
      title: t('Routines'),
    },
    { id: 'Voice calls', symbol: 'waveform', title: t('Voice calls') },
    { id: 'Notifications', symbol: 'bell', title: t('Notifications') },
    {
      id: 'Plans and billing',
      symbol: 'creditcard',
      title: t('Plans and billing'),
    },
    { id: 'Settings', symbol: 'gearshape', title: t('Settings') },
    { id: 'Other', symbol: 'ellipsis.circle', title: t('Other') },
  ]
}

/** A screenshot as the report keeps it: the shrunk JPEG, in base64 (as the e-mail carries it). */
export interface FeedbackShot {
  base64: string
}

/** What a sheet holds (`FeedbackReport`). */
export interface FeedbackReport {
  kind: FeedbackKind
  message: string
  agent?: FeedbackAgent
  /** Topic ids, in the order they were picked. */
  topics: string[]
  /** JPEGs, already shrunk (`FeedbackPictures.shrink`). */
  screenshots: FeedbackShot[]
  includesDiagnostics: boolean
}

export function newFeedbackReport(kind: FeedbackKind): FeedbackReport {
  return {
    kind,
    message: '',
    topics: [],
    screenshots: [],
    includesDiagnostics: false,
  }
}

export function trimmedMessage(report: FeedbackReport): string {
  return report.message.trim()
}

/** Words written, within the limit. */
export function canSendReport(report: FeedbackReport): boolean {
  return (
    trimmedMessage(report) !== '' &&
    characterCount(report.message) <= messageLimit
  )
}

/** The words as the editor keeps them: cut at the limit as they are typed. */
export function clippedMessage(words: string): string {
  return characterCount(words) > messageLimit
    ? firstCharacters(words, messageLimit)
    : words
}

export function roomForScreenshots(report: FeedbackReport): number {
  return Math.max(0, screenshotLimit - report.screenshots.length)
}

/** A topic picked, or put back (`toggle`). */
export function toggledTopic(
  report: FeedbackReport,
  topic: FeedbackTopic,
): FeedbackReport {
  const at = report.topics.indexOf(topic.id)
  return {
    ...report,
    topics:
      at >= 0
        ? report.topics.filter((_, index) => index !== at)
        : [...report.topics, topic.id],
  }
}

/** What the route reads (`body`): the words, the facts, the agent, the topics, the screenshots and, when agreed, the diagnostics. */
export function feedbackBody(
  report: FeedbackReport,
  facts: DeviceFacts,
  diagnostics: string | undefined,
): JSONValue {
  const body: Record<string, JSONValue> = {
    kind: report.kind,
    message: trimmedMessage(report),
    platform: facts.platform,
    appVersion: facts.appVersion,
    device: facts.device,
    osVersion: facts.osVersion,
    language: facts.language,
    timeZone: facts.timeZone,
  }
  if (report.agent)
    body.agent = {
      id: report.agent.id,
      name: report.agent.name,
      title: report.agent.title ?? null,
    }
  if (report.topics.length > 0) body.topics = [...report.topics]
  if (report.screenshots.length > 0)
    body.screenshots = report.screenshots.map((shot, index) => ({
      filename: `screenshot-${index + 1}.jpg`,
      data: shot.base64,
    }))
  if (report.includesDiagnostics && diagnostics) body.diagnostics = diagnostics
  return body
}

// MARK: The app and the device (`DeviceFacts`)

/**
 * The app and the device a report comes from, always sent. On the web:
 * "Web", the app's version as it names itself to the server, the browser
 * and its version (a page can't read the computer's model, the Mac's
 * `hw.model`), its system and version as the browser tells every site,
 * the app's language and this browser's time zone.
 */
export interface DeviceFacts {
  platform: string
  appVersion: string
  device: string
  osVersion: string
  language: string
  timeZone: string
}

/** What a browser says of itself, to every site (its user agent and its client hints). */
export interface BrowserSays {
  userAgent: string
  /** `navigator.userAgentData.brands` (Chromium's browsers). */
  brands?: readonly { brand: string; version: string }[]
  /** `navigator.userAgentData.platform`: "macOS", "Windows", "Linux"… */
  platform?: string
  /** Its version, asked of Chromium's browsers (`getHighEntropyValues`). */
  platformVersion?: string
}

/** The browser and its version: "Google Chrome 142", "Firefox 145", "Safari 26.1". */
export function browserName(says: BrowserSays): string {
  const brand =
    (says.brands ?? []).find(
      (one) => !/not.?a.?brand/i.test(one.brand) && one.brand !== 'Chromium',
    ) ?? (says.brands ?? []).find((one) => one.brand === 'Chromium')
  if (brand) return `${brand.brand} ${brand.version}`
  // Each browser names the ones it is built on too: the most particular first.
  const ua = says.userAgent
  const names: [string, string][] = [
    ['Edg', 'Microsoft Edge'],
    ['OPR', 'Opera'],
    ['FxiOS', 'Firefox'],
    ['CriOS', 'Chrome'],
    ['Firefox', 'Firefox'],
    ['Chrome', 'Chrome'],
  ]
  for (const [token, name] of names) {
    const found = new RegExp(`\\b${token}\\/(\\d+)`).exec(ua)
    if (found) return `${name} ${found[1]}`
  }
  const safari = /\bVersion\/([\d.]+).*\bSafari\//.exec(ua)
  return safari ? `Safari ${safari[1]}` : 'Browser'
}

/** The system and its version: "macOS 15.1", "Windows 11", "Linux". */
export function systemName(says: BrowserSays): string {
  const version = says.platformVersion?.split('.') ?? []
  const major = Number(version[0])
  switch (says.platform) {
    case 'macOS':
      if (version.length > 0 && major > 0)
        return `macOS ${version.slice(0, version[2] === '0' ? 2 : 3).join('.')}`
      break
    case 'Windows':
      // Client hints' 13 and up is Windows 11, 1 to 10 Windows 10.
      if (version.length > 0)
        return major >= 13 ? 'Windows 11' : major > 0 ? 'Windows 10' : 'Windows'
      break
  }
  const ua = says.userAgent
  const mac = /Mac OS X (\d+(?:[._]\d+)*)/.exec(ua)
  const iphone = /(?:iPhone|CPU) OS (\d+(?:_\d+)*)/.exec(ua)
  const android = /Android (\d+(?:\.\d+)*)/.exec(ua)
  if (iphone) return `iOS ${iphone[1]!.replace(/_/g, '.')}`
  if (android) return `Android ${android[1]}`
  if (mac) return `macOS ${mac[1]!.replace(/_/g, '.')}`
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return says.platform ?? 'Unknown'
}

export function deviceFactsFrom(
  says: BrowserSays,
  appVersion: string,
  language: string,
  timeZone: string,
): DeviceFacts {
  return {
    platform: 'Web',
    appVersion,
    device: browserName(says).slice(0, 120),
    osVersion: systemName(says).slice(0, 64),
    language,
    timeZone,
  }
}

interface UserAgentData {
  brands?: { brand: string; version: string }[]
  platform?: string
  getHighEntropyValues?(hints: string[]): Promise<{ platformVersion?: string }>
}

/** What this browser says of itself (`DeviceFacts.current`): the system's version asked of Chromium's browsers, nothing asked elsewhere. */
export async function browserSays(): Promise<BrowserSays> {
  if (typeof navigator === 'undefined') return { userAgent: '' }
  const data = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData
  let platformVersion: string | undefined
  try {
    platformVersion = (await data?.getHighEntropyValues?.(['platformVersion']))
      ?.platformVersion
  } catch {
    // The user agent says enough.
  }
  return {
    userAgent: navigator.userAgent,
    brands: data?.brands,
    platform: data?.platform,
    platformVersion,
  }
}

// MARK: Diagnostics (`Diagnostics`)

/**
 * The text attached as `diagnostics.txt` when the person agrees to include
 * it: the facts, what the app knows of its own state (`state`, a line
 * each), its recent activity, then each log the app keeps (`files`: the
 * screens' connections on the web, the Mac's `computer-stream.log`), its
 * last 300 lines, each scrubbed.
 */
export function diagnosticsText(
  facts: DeviceFacts,
  state: readonly string[],
  activity: readonly string[] = recentActivity(),
  files: readonly { name: string; text: string }[] = [],
): string {
  const parts = [
    `Simeon ${facts.platform} ${facts.appVersion}`,
    `Device: ${facts.device}, ${facts.osVersion}`,
    `Language: ${facts.language}, time zone: ${facts.timeZone}`,
    ...state.map(scrub),
    '',
    'Recent activity (oldest first):',
    ...(activity.length === 0 ? ['Nothing yet.'] : activity),
  ]
  for (const file of files) {
    const lines = nonEmptyLines(file.text).slice(-300).map(scrub)
    parts.push('', `${file.name} (last ${lines.length} lines):`, ...lines)
  }
  return parts.join('\n')
}

/** What Swift reads as a new line (`isNewline`): line and paragraph ends, the form feed and the vertical tab, next line. */
const newlineCodes = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029])

/** The text's lines, empty ones left out (`split(whereSeparator: \.isNewline)`). */
function nonEmptyLines(text: string): string[] {
  const lines: string[] = []
  let start = 0
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && !newlineCodes.has(text.charCodeAt(index)))
      continue
    if (index > start) lines.push(text.slice(start, index))
    start = index + 1
  }
  return lines
}

// MARK: Screenshots (`FeedbackPictures`)

/** Screenshots as the e-mail carries them: 1,600 on the long side at most, as JPEG at 80%. */
export const pictureMaxDimension = 1_600
export const pictureQuality = 0.8

/** The size a picture is drawn at: never larger than it is, its long side 1,600 at most. */
export function shrunkSize(
  width: number,
  height: number,
): { width: number; height: number } | undefined {
  if (!(width > 0 && height > 0)) return undefined
  const long = Math.max(width, height)
  const scale = Math.min(pictureMaxDimension, long) / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
