// What Connectors' pages keep while they are open (ConnectorPages.tsx),
// as plain state the tests can drive: the setup page's form
// (`SetupPage`'s `values` and `tried`, PluginsWindow.swift 1846-1897), and
// a change that may run once at a time (an account's Remove).
//
// The setup page leaves its words to the browser (a secret is never in the
// page's state): it keeps only whether each field holds more than spaces,
// and reads the fields when the button is pressed.

import type { PluginField } from '../core/plugins'
import { setupMissing, setupStart, setupValues } from '../core/pluginsOverlay'

/** The setup page's state: whether its button was pressed, and which fields hold more than spaces (never what). */
export interface SetupView {
  tried: boolean
  filled: Readonly<Record<string, boolean>>
}

/** The page as it opens: each field's default (`setupStart`), nothing tried. */
export function setupView(fields: readonly PluginField[]): SetupView {
  const start = setupStart(fields)
  return {
    tried: false,
    filled: Object.fromEntries(
      fields.map((one) => [one.key, (start[one.key] ?? '').trim() !== '']),
    ),
  }
}

/** A field typed in: whether it holds more than spaces now. */
export function setupTyped(
  view: SetupView,
  key: string,
  filled: boolean,
): SetupView {
  return view.filled[key] === filled
    ? view
    : { ...view, filled: { ...view.filled, [key]: filled } }
}

/** The required fields said to be missing (red, with their line, and the foot's): only once the button was pressed (`tried && missing`). */
export function setupShownMissing(
  fields: readonly PluginField[],
  view: SetupView,
): PluginField[] {
  if (!view.tried) return []
  return fields.filter((one) => one.isRequired && !view.filled[one.key])
}

/** What the button does (`submit`): its view after, the values to send when there are, and the secret fields to empty then. */
export interface SetupSubmission {
  view: SetupView
  /** Each value trimmed, the blank ones left out (`setupValues`); none when nothing goes. */
  send?: Record<string, string>
  /** The secret fields emptied as they go (read only when sent). */
  empty: string[]
}

/**
 * The button (`submit`): marked tried; nothing goes while a required field
 * is blank or the page waits on another change. Once the values go, the
 * secrets are emptied and the page forgets it was tried, so a secret just
 * sent is not then said to be missing, while the change goes or after a
 * refusal (its notice says why; the empty field asks for it again).
 */
export function setupSubmitted(
  fields: readonly PluginField[],
  view: SetupView,
  read: (key: string) => string,
  busy: boolean,
): SetupSubmission {
  const values = Object.fromEntries(
    fields.map((one) => [one.key, read(one.key)]),
  )
  if (setupMissing(fields, values).length > 0 || busy)
    return { view: { ...view, tried: true }, empty: [] }
  const empty = fields.filter((one) => one.isSecret).map((one) => one.key)
  return {
    view: {
      tried: false,
      filled: {
        ...view.filled,
        ...Object.fromEntries(empty.map((key) => [key, false])),
      },
    },
    send: setupValues(values),
    empty,
  }
}

/** Changes that run once at a time for each key (an account's Remove): a second press while one goes does nothing, and the button waits meanwhile. */
export class OneAtATime {
  private running = new Set<string>()

  constructor(private readonly changed: () => void) {}

  /** Whether one runs for `key`: its button waits. */
  isRunning(key: string): boolean {
    return this.running.has(key)
  }

  async run(key: string, work: () => Promise<void>): Promise<void> {
    if (this.running.has(key)) return
    this.running.add(key)
    this.changed()
    try {
      await work()
    } finally {
      this.running.delete(key)
      this.changed()
    }
  }
}
