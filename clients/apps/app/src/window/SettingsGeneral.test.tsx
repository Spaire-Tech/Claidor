// Step 6e's pages as the window draws them (mac/Simeon/SettingsGeneral.swift,
// SettingsPages.swift's `AgentsComputerGroup`): Help & support without the
// Help Center row that points nowhere, Legal's two pages and the company,
// the Computer page's status and version in each state, and the account's
// lines.

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { copyrightLine } from '../core/generalSettings'
import { AppStore } from '../core/store'
import { SettingsComputerPage } from './SettingsComputer'
import {
  SettingsAccountPage,
  SettingsGeneralPage,
  SettingsHelpPage,
  SettingsLegalPage,
  SettingsPermissionsPage,
} from './SettingsGeneral'
import { WindowContext, WindowModel } from './windowModel'

function draw(node: ReactNode): string {
  return renderToStaticMarkup(
    <WindowContext.Provider value={new WindowModel(undefined)}>
      {node}
    </WindowContext.Provider>,
  )
}

/** The page's words, without the markup. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')

describe('Help & support and Legal', () => {
  it('lists Send feedback and Report an issue, and not the Help Center, which points nowhere yet', () => {
    const page = words(draw(<SettingsHelpPage store={new AppStore()} />))
    expect(page).toContain('|Send feedback|')
    expect(page).toContain('|Report an issue|')
    expect(page).not.toContain('Help Center')
  })

  it('opens the Privacy Policy and the Terms of Service on the web, the company under them', () => {
    const html = draw(<SettingsLegalPage store={new AppStore()} />)
    expect(words(html)).toContain('|Privacy Policy|')
    expect(words(html)).toContain('|Terms of Service|')
    expect(html).toContain(copyrightLine)
    expect(copyrightLine).toMatch(/^Copyright © 2026 /)
  })
})

describe('before the computer’s values are read (after the review)', () => {
  it('keeps Permissions’ switch greyed and shows no lists, and General’s zone switch greyed', () => {
    const store = new AppStore()
    const permissions = draw(<SettingsPermissionsPage store={store} />)
    expect(permissions).toMatch(
      /<button type="button" role="switch" aria-checked="true" aria-label="Auto-review" class="settings-switch on" disabled="">/,
    )
    expect(permissions).not.toContain('Allow automatically')
    expect(permissions).not.toContain('rule-new')
    const general = draw(<SettingsGeneralPage store={store} />)
    expect(general).toMatch(
      /aria-label="Set Time Zone Automatically" class="settings-switch on" disabled="">/,
    )
  })
})

describe('the account page', () => {
  it('shows the face, the name and the email, and offers no Delete Account, as the Mac', () => {
    const store = new AppStore()
    store.account = { name: 'Bass Fall', email: 'bass@simeonlabs.com' }
    const page = words(draw(<SettingsAccountPage store={store} />))
    expect(page).toContain('|BF|')
    expect(page).toContain('|Bass Fall|bass@simeonlabs.com|')
    expect(page).toContain('|Your agents call you by this name.|')
    expect(page).toContain('|Email|bass|@simeonlabs.com|')
    expect(page).toContain('|Password|')
    expect(page).not.toMatch(/Delete/)
  })
})

describe('the Computer page (`AgentsComputerGroup`)', () => {
  it('says how the computer is now, in the Mac’s order: a rebuild, out of reach, connected, connecting', () => {
    const store = new AppStore()
    expect(words(draw(<SettingsComputerPage store={store} />))).toContain(
      "|Simeon's Computer|Connecting…|",
    )
    store.isLive = true
    expect(words(draw(<SettingsComputerPage store={store} />))).toContain(
      "|Simeon's Computer|Connected|",
    )
    store.rosterFailed = true
    expect(words(draw(<SettingsComputerPage store={store} />))).toContain(
      "|Simeon's Computer|Can't reach it|",
    )
    store.rebuild.lock.kind = 'update'
    const updating = words(draw(<SettingsComputerPage store={store} />))
    expect(updating).toContain("|Simeon's Computer|Updating Simeon's Computer|")
    // Recover waits while the computer is rebuilt.
    expect(draw(<SettingsComputerPage store={store} />)).toMatch(
      /<button type="button" class="settings-action-row divided" disabled="">/,
    )
  })

  it('shows the version up to date when no update is offered, the update queued with Cancel, and the computer’s refusal under the card', () => {
    const store = new AppStore()
    store.isLive = true
    expect(words(draw(<SettingsComputerPage store={store} />))).toContain(
      '|Version|Up to date|',
    )
    store.rebuild.isUpdateQueued = true
    expect(words(draw(<SettingsComputerPage store={store} />))).toContain(
      '|Update queued|Cancel|',
    )
    store.rebuild.error = 'The computer is already being rebuilt.'
    expect(draw(<SettingsComputerPage store={store} />)).toContain(
      'The computer is already being rebuilt.',
    )
  })
})
