// What the composer's lists are made of (SimeonCore's ComposerMenus.swift):
// the agent's skills and routines (`getAgentWorkflows`) and the pull
// requests a chat names. The lists themselves are `composerLists.ts`; the
// message's document is `composerDocument.ts`.

import { type JSONValue, arr, bool, field, str, text } from './json'

/** A skill "/" offers (`getAgentWorkflows`), or a routine "@" offers. */
export interface Skill {
  id: string
  name: string
  /** When it runs, for a routine ("Every weekday at 9"). */
  subtitle?: string
  /** What it does, for a skill: the line under it after "/". */
  summary?: string
  iconId?: string
  iconURL?: string
}

/** A pull request "#" offers: one a message in the chat linked (`github.com/…/pull/N`). */
export interface PullRequest {
  number: number
  url: string
  /** Its title, when the chat gave one (a cloud agent's name, a reference's title). */
  title?: string
}

/**
 * The skills in `getAgentWorkflows`' answer that "/" offers: no schedule of
 * their own (`trigger` null), and on for this agent or a routine's own
 * (`isEnabledForAgent`, `source == "automation"`), each once. With
 * `scheduled`, the routines instead (a `trigger`), which "@" offers.
 *
 * A routine's line is the computer's own words for when it runs
 * (`scheduleDescription`), else its schedule. The Mac writes them in the
 * app's language from the routine's trigger (`Routine.when`); that comes to
 * the web with the routines themselves (step 4, docs/web-app/PROGRESS.md).
 */
export function skillsFrom(answer: JSONValue, scheduled = false): Skill[] {
  const seen = new Set<string>()
  const out: Skill[] = []
  for (const item of arr(answer) ?? arr(field(answer, 'workflows')) ?? []) {
    const id = text(field(item, 'id'))?.trim()
    const name = text(field(item, 'name'))?.trim()
    if (!id || !name) continue
    // "/" offers the skills with no schedule; "@" offers the routines, the ones with one (`scheduled`).
    const trigger = field(item, 'trigger')
    const hasTrigger = trigger !== undefined && trigger !== null
    if (hasTrigger !== scheduled) continue
    if (
      bool(field(item, 'isEnabledForAgent')) !== true &&
      str(field(item, 'source')) !== 'automation'
    )
      continue
    if (seen.has(id)) continue
    seen.add(id)
    const when =
      text(field(item, 'scheduleDescription')) ??
      text(field(trigger, 'schedule'))
    out.push({
      id,
      name,
      subtitle: when,
      summary: text(field(item, 'description')),
      iconId: text(field(item, 'iconId')),
      iconURL: text(field(item, 'iconUrl')),
    })
  }
  return out
}

/**
 * The pull requests named in a text (`Fpt`, `Rpt`): http(s) addresses,
 * trailing punctuation off; GitHub's "/owner/repo/pull/N", or Simeon's
 * review page "review.simeonlabs.com/github/pr/owner/repo/N".
 */
export function pullRequestLinks(words: string): PullRequest[] {
  const out: PullRequest[] = []
  for (const match of words.matchAll(/https?:\/\/[^\s<>()[\]]+/g)) {
    let raw = match[0]
    while (raw !== '' && '.,;:!?'.includes(raw[raw.length - 1]!))
      raw = raw.slice(0, -1)
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/')
    const whole = (piece: string | undefined) =>
      piece != null && /^\d+$/.test(piece) ? Number(piece) : undefined
    let number: number | undefined
    if (host === 'github.com' || host === 'www.github.com') {
      // "", owner, repo, "pull", number[, …]
      number =
        parts.length >= 5 &&
        parts[0] === '' &&
        parts[1] !== '' &&
        parts[2] !== '' &&
        parts[3] === 'pull'
          ? whole(parts[4])
          : undefined
    } else if (host === 'review.simeonlabs.com') {
      // "", "github", "pr", owner, repo, number[, …]
      number =
        parts.length >= 6 &&
        parts[0] === '' &&
        parts[1] === 'github' &&
        parts[2] === 'pr' &&
        parts[3] !== '' &&
        parts[4] !== ''
          ? whole(parts[5])
          : undefined
    }
    if (number == null || number <= 0) continue
    out.push({ number, url: raw })
  }
  return out
}
