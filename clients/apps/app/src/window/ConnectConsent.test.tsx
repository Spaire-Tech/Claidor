// The consent as the window draws it (MacConnector.swift's
// `ConnectConsentDialog`), and its keys (`ViewerKeys(aboveLocks:)`): Return
// and keypad Enter connect, Escape cancels, a modifier held lets them go, a
// button of the dialog that has the keys does its own, letters being
// composed keep theirs. A click on the dim is the window's sheet's
// (Dialogs.tsx), checked in Chromium.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { codingConsent, modelConsent } from '../core/connectConsent'
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

  // The founder, 13 November 2026: "it should say codex and claude code but only when it opens from the card".
  it("names the program with its own logo, bare, when it opens from the chat's card", () => {
    const connector = new Connector(new AppStore(), {
      openTab: () => undefined,
      wait: async () => {},
    })
    connector.ask('Codex', async () => {}, {
      signIn: false,
      consent: codingConsent('chatgpt'),
    })
    const page = renderToStaticMarkup(<ConsentLayer connector={connector} />)
    expect(page).toMatch(
      /role="dialog" aria-modal="true" aria-label="Connect Codex"/,
    )
    expect(page).toContain(
      '<div class="consent-title" role="heading" aria-level="2">Codex</div>',
    )
    expect(page).toContain(
      'Run your cloud agents in Codex, on your ChatGPT plan.',
    )
    // Codex's own logo, with no tile and no shadow behind it.
    expect(page).toMatch(
      /<span class="consent-logo bare" aria-hidden="true"><span class="program-logo"[^>]*><img src="[^"]*codex[^"]*"/,
    )
    expect(page).not.toContain('class="app-icon"')
    expect(page).not.toContain('logo-tile')
    // ChatGPT is still named where it is the plan and the page to sign in on.
    expect(page).toContain('You&#x27;ll sign in on ChatGPT&#x27;s own page.')
  })

  it('names the plan with its own icon when it opens from Settings', () => {
    const connector = new Connector(new AppStore(), {
      openTab: () => undefined,
      wait: async () => {},
    })
    connector.ask('ChatGPT', async () => {}, {
      signIn: false,
      consent: modelConsent('chatgpt'),
    })
    const page = renderToStaticMarkup(<ConsentLayer connector={connector} />)
    expect(page).toMatch(/aria-label="Connect ChatGPT"/)
    expect(page).toContain(
      '<div class="consent-title" role="heading" aria-level="2">ChatGPT</div>',
    )
    expect(page).toContain('Run your agents on your ChatGPT plan.')
    expect(page).toContain('<span class="consent-logo" aria-hidden="true">')
    expect(page).toContain('class="app-icon"')
    expect(page).not.toContain('program-logo')
    expect(page).not.toContain('Codex')
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
