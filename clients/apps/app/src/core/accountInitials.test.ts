import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { accountInitials } from './accountInitials'

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/settings.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { initials: { name: string; initials: string }[] }

describe('the account’s letters (SettingsTests.testInitials)', () => {
  it('gives the core’s answer for every name in its fixture', () => {
    expect(fixture.initials.length).toBeGreaterThan(10)
    for (const row of fixture.initials)
      expect(accountInitials(row.name), row.name).toBe(row.initials)
    expect(accountInitials('Bass Fall')).toBe('BF')
  })
})
