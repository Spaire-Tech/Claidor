// The cards that wait on the person, as SimeonCore reads them (Chat.swift's
// `QuestionCard`, `DraftCard` and `RequestCard.approval`, Approvals.swift's
// `AutoReviewCard`, AccountSettings.swift's `AutoReviewInstructions`): a
// question with its choices, an email or a Slack message drafted, and an
// auto-review approval, with the words each card says.

import type { Entry } from './entry'
import { type JSONValue, arr, bool, field, isObject, str, text } from './json'
import { t } from './l10n'

// MARK: Questions

export type OptionStyle = 'default' | 'primary' | 'danger'

/** One choice: its label, a line under it, the reply it sends (`value`, the label when none), and whether it is the recommended or a destructive one. */
export interface QuestionOption {
  label: string
  description?: string
  value: string
  style: OptionStyle
}

/** A question card (`send-message` of type `widget`), with the answer once given. */
export interface QuestionCard {
  prompt: string
  help?: string
  options: QuestionOption[]
  allowsOwnAnswer: boolean
  /** Several options may be picked; their values go back one per line. */
  multiSelect: boolean
  /** What the person answered (`respondedValue`); none while it waits. */
  answer?: string
  isDismissed: boolean
  /** The person wrote instead of answering (`widgetSkipped`): closed. */
  isSkipped: boolean
}

const styles: OptionStyle[] = ['default', 'primary', 'danger']

export function questionCard(entry: Entry): QuestionCard | undefined {
  const widget = field(entry.message, 'widget')
  const prompt = text(field(widget, 'prompt'))
  if (prompt == null) return undefined
  const options: QuestionOption[] = []
  for (const option of arr(field(widget, 'options')) ?? []) {
    const label = text(field(option, 'label')) ?? text(option)
    if (label == null) continue
    const style = str(field(option, 'style')) as OptionStyle | undefined
    options.push({
      label,
      description: text(field(option, 'description')),
      value: text(field(option, 'value')) ?? label,
      style: style && styles.includes(style) ? style : 'default',
    })
  }
  return {
    prompt,
    help: text(field(widget, 'helpText')),
    options,
    allowsOwnAnswer: bool(field(widget, 'allowCustom')) ?? false,
    multiSelect: bool(field(widget, 'multiSelect')) ?? false,
    answer: text(entry.get('respondedValue')),
    isDismissed: bool(entry.get('widgetDismissed')) ?? false,
    isSkipped: bool(entry.get('widgetSkipped')) ?? false,
  }
}

export function isOpenQuestion(card: QuestionCard): boolean {
  return card.answer == null && !card.isDismissed && !card.isSkipped
}

/** An answer as the person reads it: each picked option by its label (several joined with commas), else the words they typed. */
export function shownAnswer(card: QuestionCard, answer: string): string {
  return answer
    .split('\n')
    .filter((line) => line !== '')
    .map(
      (line) =>
        card.options.find((option) => option.value === line)?.label ?? line,
    )
    .join(', ')
}

// MARK: Drafts

/** An email or a Slack message the agent drafted, for the person to send or discard. */
export interface DraftCard {
  kind: 'email' | 'slack'
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  workspace: string
  target: string
  thread: string
  /** Files attached on Send: paths on the computer. */
  attachments: string[]
  /** It answers an email the person received (`replyTo`): the card says Reply. */
  isReply: boolean
  /** `editable`, `sending` or `sent` (`draftSendState`). */
  state: string
  isDismissed: boolean
}

function names(value: JSONValue | undefined): string[] {
  const list = arr(value)
  if (list) return list.map(text).filter((one): one is string => one != null)
  const one = text(value)
  return one != null ? [one] : []
}

export function draftCard(entry: Entry): DraftCard | undefined {
  const message = entry.message
  const draft = field(message, 'draft')
  if (draft == null) return undefined
  const replyTo = field(draft, 'replyTo')
  return {
    kind: str(field(message, 'type')) === 'slack-draft' ? 'slack' : 'email',
    from: str(field(draft, 'from')) ?? '',
    to: names(field(draft, 'to')),
    cc: names(field(draft, 'cc')),
    subject: str(field(draft, 'subject')) ?? '',
    body: str(field(draft, 'body')) ?? '',
    workspace: str(field(draft, 'workspace')) ?? '',
    target: str(field(draft, 'target')) ?? '',
    thread: str(field(draft, 'thread')) ?? '',
    attachments: names(field(draft, 'attachments')),
    isReply: isObject(replyTo) && Object.keys(replyTo).length > 0,
    state: str(entry.get('draftSendState')) ?? 'editable',
    isDismissed: bool(entry.get('widgetDismissed')) ?? false,
  }
}

/** The attached files' own names, the last part of each path. */
export function attachmentNames(card: DraftCard): string[] {
  return card.attachments.map(
    (path) => path.split('/').filter(Boolean).pop() ?? path,
  )
}

/** What the card says beside its title. */
export function draftStatus(card: DraftCard): string {
  if (card.isDismissed) return t('Discarded')
  switch (card.state) {
    case 'sending':
      return t('Sending…')
    case 'sent':
      return t('Sent')
    default:
      return t('Ready to send')
  }
}

/** The addresses typed in To or Cc: split on commas and semicolons, trimmed, empty ones dropped. */
export function addresses(typed: string): string[] {
  return typed
    .split(/[,;]/)
    .map((one) => one.trim())
    .filter(Boolean)
}

// MARK: Auto-review approvals (Approvals.swift)

/** `auto-review-approval`: Allow once, Always allow, Deny; what it is about (`surface`) and the rule Always allow would add. */
export interface ApprovalCard {
  requestId: string
  summary: string
  reason: string
  command?: string
  status: string
  surface?: string
  proposedRule?: string
}

export function approvalCard(entry: Entry): ApprovalCard | undefined {
  const approval = field(entry.message, 'approval')
  if (approval == null) return undefined
  return {
    requestId: str(field(approval, 'requestId')) ?? '',
    summary: str(field(approval, 'summary')) ?? '',
    reason: str(field(approval, 'reason')) ?? '',
    command: str(field(approval, 'command')),
    status: str(field(approval, 'status')) ?? 'pending',
    surface: str(field(approval, 'surface')),
    proposedRule: str(field(approval, 'proposedRule')),
  }
}

export type ApprovalSubject = 'command' | 'details'

/** The title by surface (`ee`, `te` for any other), and what its fold shows. */
export function approvalTitle(surface?: string): {
  title: string
  subject: ApprovalSubject
} {
  switch (surface) {
    case 'host_shell':
    case 'box_shell':
      return {
        title: t('The agent wants to run a command'),
        subject: 'command',
      }
    case 'mcp':
      return {
        title: t('The agent wants to use a connected service'),
        subject: 'details',
      }
    case 'subagent':
      return { title: t('The agent wants to run a task'), subject: 'details' }
    default:
      return { title: t('Auto-review Paused This Action'), subject: 'details' }
  }
}

/** Where it runs (`J`). */
export function approvalLocation(surface?: string): string | undefined {
  switch (surface) {
    case 'host_shell':
      return t('Runs on your local computer')
    case 'box_shell':
    case 'computer':
      return t("Runs on Simeon's computer")
    default:
      return undefined
  }
}

export type BadgeKind = 'success' | 'danger' | 'muted'

/** The answered card's dot and word (`ae`); none while it waits. */
export function approvalBadge(
  status: string,
): { kind: BadgeKind; label: string } | undefined {
  switch (status) {
    case 'approved':
      return { kind: 'success', label: t('Allowed once') }
    case 'always':
      return { kind: 'success', label: t('Always allowed') }
    case 'denied':
      return { kind: 'danger', label: t('Denied') }
    case 'expired':
      return { kind: 'muted', label: t('Expired') }
    case 'pending':
      return undefined
    default:
      return { kind: 'muted', label: t('Status unavailable') }
  }
}

/** A summary that only says "run this" says nothing the command does not (`ie`, `re`, `le`). */
export function summarySaysNothing(summary: string): boolean {
  if (
    summary === 'Run a command on your local computer' ||
    summary === "Run a command on Simeon's computer" ||
    summary === "Run a command on the agent's VM"
  )
    return true
  if (
    summary === t('Run a command on your local computer') ||
    summary === t("Run a command on Simeon's computer")
  )
    return true
  if (summary.startsWith('Run “') || summary.startsWith('Run "')) return true
  return /^Use .+ tool .+ with /.test(summary)
}

/** The summary as its own line: only beside a command, and only when it says more. */
export function summaryLine(
  summary: string,
  command?: string,
): string | undefined {
  if (command == null || summarySaysNothing(summary)) return undefined
  return summary
}

export const clipLength = 340

/** The folded text, cut at 340 characters (`Q`); counted in UTF-16 units, as the window does. */
export function clip(words: string): string {
  if (words.length <= clipLength) return words
  return (
    words.slice(0, clipLength) +
    t`...[${words.length - clipLength} chars omitted]...`
  )
}

/** The line under an Always allowed card (`ue`). */
export function settledNote(status: string, rule?: string): string | undefined {
  if (status !== 'always') return undefined
  return rule != null
    ? t`A rule always allowing this was added to your Auto-review settings: “${rule}”`
    : t('A rule always allowing this was added to your Auto-review settings')
}

/** The proposed rule as Always allow saves it: trimmed, secrets taken out, spaces as one (`ce`). */
export function proposedRule(proposed?: string): string | undefined {
  const trimmed = proposed?.trim()
  if (!trimmed) return undefined
  const cleaned = redact(trimmed).replace(/\s+/g, ' ').trim()
  return cleaned === '' ? undefined : cleaned
}

/** Addresses without their sign-in, query and fragment; passwords, keys and tokens as "…" (`Z`). */
export function redact(words: string): string {
  let out = words.replace(/https?:\/\/[^\s"'`]+/gi, (match) => {
    let url: URL
    try {
      url = new URL(match)
    } catch {
      return match
    }
    if (!url.hostname) return match
    const path = url.pathname === '' ? '/' : url.pathname
    const port = url.port ? `:${url.port}` : ''
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${port}${path}`
  })
  out = out.replace(
    /((?:--)?(?:api[_-]?key|authorization|credential|password|secret|signature|token)\s*(?:=|:|\s)\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
    '$1…',
  )
  out = out.replace(/\bBearer\s+[^\s"'`]+/gi, 'Bearer …')
  out = out.replace(
    /\b(?:sk[-_]|gh[pousr]_|xox[baprs]-|AIza)[A-Za-z0-9+/_=-]+/gi,
    '…',
  )
  return out
}

// MARK: Auto-review's rules (AutoReviewInstructions)

export const maxRules = 20
export const maxRuleCharacters = 1_000

export interface AutoReviewInstructions {
  isEnabled: boolean
  allow: string[]
  ask: string[]
}

/** From the host's settings; Auto-review on with no rules when there are none (`BMt`). */
export function autoReviewFrom(
  json: JSONValue | undefined,
): AutoReviewInstructions {
  const list = (key: string) =>
    (arr(field(json, key)) ?? []).filter(
      (one): one is string => typeof one === 'string',
    )
  return {
    isEnabled: bool(field(json, 'isEnabled')) ?? true,
    allow: list('allowInstructions'),
    ask: list('blockInstructions'),
  }
}

export function autoReviewJSON(rules: AutoReviewInstructions): JSONValue {
  return {
    isEnabled: rules.isEnabled,
    allowInstructions: [...rules.allow],
    blockInstructions: [...rules.ask],
  }
}

/** A rule trimmed and cut at a thousand characters (`Jtt`). */
function clipRule(words: string): string {
  const trimmed = words.trim()
  return trimmed.length <= maxRuleCharacters
    ? trimmed
    : trimmed.slice(0, maxRuleCharacters)
}

/** Each rule clipped, empty and repeated ones dropped, twenty at most (`IBe`). */
function cleanList(list: readonly string[]): string[] {
  const out: string[] = []
  for (const item of list) {
    const rule = clipRule(item)
    if (rule === '' || out.includes(rule)) continue
    out.push(rule)
    if (out.length >= maxRules) break
  }
  return out
}

/** Always allow's rule added to the allowed list (`oWn`): cut at a thousand characters, nothing when it is already there, the oldest dropped past twenty. */
export function addingAllowRule(
  rules: AutoReviewInstructions,
  words: string,
): AutoReviewInstructions {
  const rule = clipRule(words)
  if (rule === '' || rules.allow.includes(rule)) return rules
  const appended = [...rules.allow, rule]
  const kept =
    appended.length <= maxRules ? appended : appended.slice(-maxRules)
  return {
    isEnabled: rules.isEnabled,
    allow: cleanList(kept),
    ask: cleanList(rules.ask),
  }
}
