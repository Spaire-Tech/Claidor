// What the person reads when something goes wrong (`PlainWords` in
// ios/SimeonCore/Sources/SimeonCore/PlainWords.swift; the founder, 13 October
// 2026: "the banners should not tell internal stuff"). Errors reach the app
// from the engine, Simeon Labs' server and the model companies behind it,
// often word for word; words that name nothing behind Simeon are kept, the
// rest give way to a plain sentence.

import { t } from './l10n'

/** The sentence for anything the model service or Simeon's own servers refused or could not do. */
export const unavailable = () =>
  t('Simeon isn’t available at the moment. Try again in a little while.')

/** The same, for one agent's answer. */
export const noAnswer = () =>
  t('Your agent couldn’t answer right now. Try again in a little while.')

/** The marks of words not meant for the person (`internalMarks`). */
const internalMarks: RegExp[] = [
  // Companies and services behind Simeon. (Not the apps a person connects: their names are the person's own words.)
  /\b(open ?ai|anthropic|claude|gemini|google ai|vertex|x\.?ai|grok|eleven ?labs|composio|fal\.ai|duffel|render\.com|redis|postgres(ql)?|docker|novnc|websockify|livekit)\b/i,
  // Credits, keys and limits of those services.
  /\b(insufficient_quota|quota|api[ _-]?key|credit balance|rate[ _-]?limit(ed)?|overloaded|tokens?|jetons?|max_tokens|context[ _-]?(length|window))\b/i,
  // Codes: HTTP statuses said as such, refusal codes, exit codes.
  /\b(status|code|http|error)\s*:?\s*\d{3,5}\b/i,
  /\(\s*\d{3,5}\s*[:)]/i,
  /\banswered\b.*\b\d{3}\b/i,
  // Settings, files, addresses and the plumbing's words.
  /\b(SAND|SIMEON|CLAIDOR)_[A-Z_]+\b/i,
  /\b[\w-]+\.(ts|js|mjs|py|swift|json|log)\b/i,
  /https?:\/\/|localhost|127\.0\.0\.1|\bport\b/i,
  /\b(gateway|proxy|endpoint|host bundle|npm|socket|websocket|vnc|json|stack ?trace|exception|traceback|undefined|null pointer|nil)\b/i,
  // The computer's own key refused ("unauthorized", its 401), never the person's doing.
  /\bunauthori[sz]ed\b/i,
  // A gateway method named before its error ("createAgent: …"), in its own case.
  /^[a-z]+[A-Z][A-Za-z]*: /,
]

/** Whether the words name something behind Simeon or are a machine's rather than a sentence for a person. */
export function isInternal(words: string): boolean {
  if ([...words].length > 220) return true
  return internalMarks.some((mark) => mark.test(words))
}

/** The words of an error as the person may read them: `words` when they name nothing internal, else `fallback`. Empty stays empty. */
export function plainError(words: string, fallback = unavailable()): string {
  const trimmed = words.trim()
  if (trimmed === '') return ''
  return isInternal(trimmed) ? fallback : trimmed
}

/**
 * A line made as "What failed: why" (the store's problems): the "why" kept
 * when it is plain, else only "What failed." with a word to try again; a line
 * that is internal from its start gives way to `fallback`.
 */
export function plainProblem(words: string, fallback = unavailable()): string {
  const trimmed = words.trim()
  if (trimmed === '') return ''
  if (!isInternal(trimmed)) return trimmed
  const colon = trimmed.indexOf(': ')
  if (colon >= 0) {
    const head = trimmed.slice(0, colon).trim()
    if (head !== '' && [...head].length <= 80 && !isInternal(head)) {
      return t`${head.replace(/^\.+|\.+$/g, '')}. Try again in a little while.`
    }
  }
  return fallback
}
