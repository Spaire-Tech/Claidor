import { describe, expect, it } from 'vitest'
import { knownBot } from './BotConsentPage'

// Grok Bot signs in with Cursor's registration (10 November 2026): the same
// name, "Cursor", and the same return addresses. Where its sign-in returns
// says which it is.
describe('the bot an Allow page names', () => {
  it('is Grok Bot when the sign-in returns to Grok, though it registers as Cursor', () => {
    expect(
      knownBot('Cursor', 'https://grok.com/connectors-oauth-exchange-code/')
        ?.name,
    ).toBe('Grok Bot')
    expect(
      knownBot('Cursor', 'https://www.cursor.com/bot/mcp/oauth/callback')?.name,
    ).toBe('Grok Bot')
  })

  it('is Cursor on the person’s computer or in Cursor’s own cloud', () => {
    expect(knownBot('Cursor', 'http://localhost:8787/callback')?.name).toBe(
      'Cursor',
    )
    expect(
      knownBot('Cursor', 'https://www.cursor.com/agents/mcp/oauth/callback')
        ?.name,
    ).toBe('Cursor')
  })

  it('falls back to the registered name, and to none', () => {
    expect(
      knownBot(
        'ChatGPT',
        'https://chatgpt.com/connector_platform_oauth_redirect',
      )?.name,
    ).toBe('Dots')
    expect(knownBot('Codex', 'http://localhost:1455/callback')?.name).toBe(
      'Codex',
    )
    expect(knownBot('My bot', 'not a link')).toBeUndefined()
  })
})
