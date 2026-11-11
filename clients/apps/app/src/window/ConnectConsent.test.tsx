// The consent as the window draws it (MacConnector.swift's
// `ConnectConsentDialog`), and its keys (`ViewerKeys(aboveLocks:)`): Return
// and keypad Enter connect, Escape cancels, a modifier held lets them go, a
// button of the dialog that has the keys does its own, letters being
// composed keep theirs. A click on the dim is the window's sheet's
// (Dialogs.tsx), checked in Chromium.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppStore } from '../core/store'
import { ConsentLayer, consentKey } from './ConnectConsent'
import { Connector } from './connector'

describe('the consent’s keys', () => {
  it('connects on Return and keypad Enter, cancels on Escape', () => {
    // Keypad Enter is "Enter" too (its `code` is NumpadEnter).
    expect(consentKey({ key: 'Enter' }, false)).toBe('connect')
    expect(consentKey({ key: 'Escape' }, false)).toBe('cancel')
    // × or Connect has the keys: Return presses it; Escape still cancels.
    expect(consentKey({ key: 'Enter' }, true)).toBeUndefined()
    expect(consentKey({ key: 'Escape' }, true)).toBe('cancel')
  })

  it('lets go with a modifier held, and leaves every other key and letters being composed', () => {
    for (const modifier of ['shiftKey', 'altKey', 'metaKey', 'ctrlKey'])
      for (const key of ['Enter', 'Escape'])
        expect(consentKey({ key, [modifier]: true }, false)).toBe('ignore')
    expect(consentKey({ key: 'Enter', isComposing: true }, false)).toBe(
      undefined,
    )
    expect(consentKey({ key: 'Escape', keyCode: 229 }, false)).toBe(undefined)
    expect(consentKey({ key: 'a' }, false)).toBeUndefined()
    expect(consentKey({ key: 'Tab' }, false)).toBeUndefined()
  })
})

describe('the consent on screen', () => {
  it('is a dialog over the window, named for the app, with × and Connect', () => {
    const store = new AppStore()
    const connector = new Connector(store, {
      openTab: () => undefined,
      wait: async () => {},
    })
    expect(renderToStaticMarkup(<ConsentLayer connector={connector} />)).toBe(
      '',
    )
    connector.connect('Acme CRM')
    const page = renderToStaticMarkup(<ConsentLayer connector={connector} />)
    expect(page).toMatch(
      /role="dialog" aria-modal="true" aria-label="Connect Acme CRM"/,
    )
    expect(page).toContain('class="sheet consent-sheet"')
    expect(page).toContain('aria-label="Cancel"')
    expect(page).toContain(
      '<button type="button" class="consent-connect">Connect</button>',
    )
    expect(page).toContain('What it does')
    expect(page.match(/class="consent-point"/g)).toHaveLength(3)
  })

  it('tells the person in the window’s alert when the browser refused the tab', async () => {
    const store = new AppStore()
    const connector = new Connector(store, {
      openTab: () => undefined,
      wait: async () => {},
    })
    connector.connect('Linear')
    connector.confirm()
    await Promise.resolve()
    const page = renderToStaticMarkup(<ConsentLayer connector={connector} />)
    expect(page).toContain('role="alertdialog"')
    expect(page).toContain('Linear didn&#x27;t connect. Try again.')
    expect(page).toContain('>Done</button>')
    connector.dismissTold()
    expect(renderToStaticMarkup(<ConsentLayer connector={connector} />)).toBe(
      '',
    )
  })
})
