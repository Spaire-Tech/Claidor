// SimeonCore's LinkIconsTests, translated: which site a link's icon is read from.

import { describe, expect, it } from 'vitest'
import { credentialSite, siteOf } from './linkIcons'

describe("a link's site", () => {
  it("goes to its site, and an email's page to none", () => {
    expect(siteOf('https://tv.youtube.com/settings/membership')).toBe(
      'tv.youtube.com',
    )
    expect(siteOf('https://www.GitHub.com/simeon')).toBe('github.com')
    expect(siteOf('http://example.org')).toBe('example.org')
    // An email's page has no icon (22 October 2026: "remove that gmail logo").
    expect(
      siteOf('https://mail.google.com/mail/u/0/#inbox/1890'),
    ).toBeUndefined()
    expect(siteOf('https://outlook.office.com/mail/id/AAQk')).toBeUndefined()
    expect(siteOf('https://outlook.live.com/mail/0/inbox')).toBeUndefined()
    // No website: nothing to read.
    expect(siteOf('mailto:theo@example.com')).toBeUndefined()
    expect(siteOf('simeon://agent/a1')).toBeUndefined()
    expect(siteOf('https://localhost/x')).toBeUndefined()
  })

  it('names a site as the server and the engine do', () => {
    expect(credentialSite(' www.Acme.com ')).toBe('acme.com')
    expect(credentialSite('https://login.acme.com./path')).toBe(
      'login.acme.com',
    )
    expect(credentialSite('not a site')).toBe('')
    expect(credentialSite('intranet')).toBe('')
  })
})
