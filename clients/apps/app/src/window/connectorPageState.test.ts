// The pages' own state, pressed and typed as the page does it (the app's
// tests have no page to click in): the setup page's button with its
// fields' words read from the browser's fields, and an account's Remove
// pressed twice.

import { describe, expect, it } from 'vitest'
import type { PluginField } from '../core/plugins'
import {
  OneAtATime,
  setupShownMissing,
  setupSubmitted,
  setupTyped,
  setupView,
} from './connectorPageState'

const fields: PluginField[] = [
  { key: 'API_KEY', label: 'API key', isRequired: true, isSecret: true },
  {
    key: 'CITY',
    label: 'City',
    isRequired: false,
    isSecret: false,
    defaultValue: 'Paris',
  },
  { key: 'ACCOUNT', label: 'Account', isRequired: true, isSecret: false },
]

/** The browser's fields, as the page reads them. */
function browser(words: Record<string, string>) {
  return (key: string) => words[key] ?? ''
}

describe('the setup page', () => {
  it('says nothing is missing until the button is pressed, then names each blank required field', () => {
    let view = setupView(fields)
    expect(view.filled).toEqual({ API_KEY: false, CITY: true, ACCOUNT: false })
    expect(setupShownMissing(fields, view)).toEqual([])
    const typed = { CITY: 'Paris', ACCOUNT: '   ' }
    view = setupTyped(view, 'ACCOUNT', false)
    const pressed = setupSubmitted(fields, view, browser(typed), false)
    expect(pressed.send).toBeUndefined()
    expect(pressed.empty).toEqual([])
    expect(
      setupShownMissing(fields, pressed.view).map((one) => one.key),
    ).toEqual(['API_KEY', 'ACCOUNT'])
    // Typing in one takes its line away.
    view = setupTyped(pressed.view, 'ACCOUNT', true)
    expect(setupShownMissing(fields, view).map((one) => one.key)).toEqual([
      'API_KEY',
    ])
  })

  it('sends the values trimmed, empties the secret, and says nothing is missing while it goes or after a refusal', () => {
    let view = setupView(fields)
    // Pressed once with the key blank: tried.
    view = setupSubmitted(fields, view, browser({ ACCOUNT: 'jo' }), false).view
    expect(view.tried).toBe(true)
    view = setupTyped(view, 'API_KEY', true)
    view = setupTyped(view, 'ACCOUNT', true)
    const words = { API_KEY: ' wx_fake ', CITY: '  ', ACCOUNT: 'jo ' }
    const sent = setupSubmitted(fields, view, browser(words), false)
    expect(sent.send).toEqual({ API_KEY: 'wx_fake', ACCOUNT: 'jo' })
    expect(sent.empty).toEqual(['API_KEY'])
    // The secret just sent is empty now, and not said to be missing: not while the change goes, nor once it is refused.
    expect(sent.view.filled.API_KEY).toBe(false)
    expect(sent.view.tried).toBe(false)
    expect(setupShownMissing(fields, sent.view)).toEqual([])
    // Pressed again without it: then it is.
    const again = setupSubmitted(
      fields,
      sent.view,
      browser({ ACCOUNT: 'jo' }),
      false,
    )
    expect(again.send).toBeUndefined()
    expect(setupShownMissing(fields, again.view).map((one) => one.key)).toEqual(
      ['API_KEY'],
    )
  })

  it('sends nothing, and empties nothing, while the page waits on another change', () => {
    const view = setupView(fields)
    const pressed = setupSubmitted(
      fields,
      view,
      browser({ API_KEY: 'wx_fake', ACCOUNT: 'jo' }),
      true,
    )
    expect(pressed.send).toBeUndefined()
    expect(pressed.empty).toEqual([])
    expect(pressed.view.tried).toBe(true)
    expect(setupShownMissing(fields, pressed.view)).toEqual(
      fields.filter((one) => one.key === 'API_KEY' || one.key === 'ACCOUNT'),
    )
  })
})

describe('an account’s Remove', () => {
  it('pressed twice while it goes, removes once; its pill waits meanwhile', async () => {
    let draws = 0
    const removing = new OneAtATime(() => (draws += 1))
    let sent = 0
    let answer!: () => void
    const go = () =>
      new Promise<void>((done) => {
        sent += 1
        answer = done
      })
    const first = removing.run('ca_w', go)
    expect(removing.isRunning('ca_w')).toBe(true)
    // Another account's Remove is its own.
    expect(removing.isRunning('ca_h')).toBe(false)
    await removing.run('ca_w', go)
    expect(sent).toBe(1)
    answer()
    await first
    expect(removing.isRunning('ca_w')).toBe(false)
    expect(draws).toBe(2)
    // A refusal lets it be pressed again.
    const failing = removing.run('ca_w', () => Promise.reject(new Error('No')))
    await expect(failing).rejects.toThrow('No')
    expect(removing.isRunning('ca_w')).toBe(false)
  })
})
