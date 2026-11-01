// What the app did lately, for a report the person chooses to send
// (`RecentActivity` and `Diagnostics.scrub` in
// ios/SimeonCore/Sources/SimeonCore/Feedback.swift): the last 400 lines, each
// with its time, kept in memory only and scrubbed of anything that could open
// an account.

const keep = 400
let lines: string[] = []

const rules: [RegExp, string][] = [
  // An address's query string: tokens and sign-in codes travel there.
  [/((?:https?|wss?):\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/g, '$1?***'],
  // A named secret: `token=…`, `"password": "…"`.
  [
    /\b(access_token|refresh_token|id_token|token|api_?key|secret|password)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
    '$1$2***',
  ],
  [/\bBearer\s+\S+/gi, 'Bearer ***'],
  // A JSON web token.
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '***'],
  // Any other long opaque run (a key, a token), but never an id written as a UUID.
  [
    /\b(?![0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b)[A-Za-z0-9_-]{32,}/g,
    '***',
  ],
]

/** `line` with what looks like a secret replaced by `***`. */
export function scrub(line: string): string {
  return rules.reduce((out, [rule, by]) => out.replace(rule, by), line)
}

export function note(line: string, at: Date = new Date()): void {
  lines.push(`${at.toISOString()} ${scrub(line.split(/\r?\n/).join(' '))}`)
  if (lines.length > keep) lines = lines.slice(lines.length - keep)
}

export function recentActivity(): readonly string[] {
  return lines
}

export function clearRecentActivity(): void {
  lines = []
}
