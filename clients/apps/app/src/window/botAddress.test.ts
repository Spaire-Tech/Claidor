import { describe, expect, it } from 'vitest'
import { botAddress, botsAddress } from './SettingsModels'

// Each bot of the Bots section is given its own address, so the server knows
// which bot it is whatever its sign-in says (Grok Bot signs in with Cursor's,
// 10 November 2026).
describe("a bot's address", () => {
  it('names the bot for the bots the section lists', () => {
    expect(botAddress('grokbot')).toBe('https://api.simeonlabs.com/mcp/grok-bot')
    expect(botAddress('dots')).toBe('https://api.simeonlabs.com/mcp/dots')
    expect(botAddress('muse')).toBe('https://api.simeonlabs.com/mcp/muse')
  })

  it('is the plain one for any other bot', () => {
    expect(botAddress(undefined)).toBe(botsAddress)
    expect(botAddress('any')).toBe(botsAddress)
  })
})
