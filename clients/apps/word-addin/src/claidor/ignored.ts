/**
 * Findings the reader has dismissed, kept inside the document.
 *
 * The fourth bucket. A check nobody can dismiss is a check people stop
 * reading, and a dismissal that lives in the pane is one that evaporates
 * when the file is closed, emailed to a colleague, or opened on the other
 * machine. So it goes in a custom XML part, the way upstream keeps its
 * review snapshot and its negotiation ledger: the dismissals travel with
 * the .docx.
 *
 * They are keyed by `findingKey`, not by offset — see `locate.ts` for why
 * that distinction is the whole design.
 *
 * Nothing here is a security boundary. Anyone who can open the document can
 * un-dismiss a finding, which is right: the count stays on screen precisely
 * so « why is this not flagged » always has an answer.
 */

import { runWord } from '@/office/run'

export const IGNORED_NS = 'urn:claidor:ignored:1'

export interface IgnoredState {
  savedAt: string
  /** findingKey -> the reader's own reason, or "" when they gave none. */
  keys: Record<string, string>
}

function toBase64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
}

function fromBase64(value: string): string {
  return decodeURIComponent(escape(atob(value)))
}

function toXml(state: IgnoredState): string {
  return `<i xmlns="${IGNORED_NS}" v="1">${toBase64(JSON.stringify(state))}</i>`
}

function fromXml(xml: string): IgnoredState | null {
  try {
    // Word can re-serialize a custom XML part with a namespace prefix on
    // reopen (`<ns0:i ...>`), so tolerate an optional prefix on the close.
    const match = />([A-Za-z0-9+/=\s]*)<\/(?:[A-Za-z0-9_.-]+:)?i>/.exec(xml)
    const payload = match?.[1]?.trim()
    if (!payload) return null
    const parsed = JSON.parse(fromBase64(payload)) as IgnoredState
    if (!parsed || typeof parsed.keys !== 'object' || parsed.keys === null) {
      return null
    }
    const clean: Record<string, string> = {}
    for (const [key, reason] of Object.entries(parsed.keys)) {
      if (typeof key === 'string' && key) {
        clean[key] = typeof reason === 'string' ? reason : ''
      }
    }
    return { savedAt: String(parsed.savedAt ?? ''), keys: clean }
  } catch {
    // A part we cannot read is one we did not write, or one a later
    // version wrote. Reporting no dismissals is wrong in a visible way —
    // findings reappear — which is the failure to prefer over silently
    // hiding findings the reader never dismissed.
    return null
  }
}

export async function readIgnored(): Promise<IgnoredState | null> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(IGNORED_NS)
    parts.load('items')
    await context.sync()
    if (parts.items.length === 0) return null
    const xml = parts.items[0].getXml()
    await context.sync()
    return fromXml(xml.value)
  })
}

export async function writeIgnored(state: IgnoredState): Promise<void> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(IGNORED_NS)
    parts.load('items')
    await context.sync()
    for (const part of parts.items) part.delete()
    await context.sync()
    context.document.customXmlParts.add(toXml(state))
    await context.sync()
  })
}
