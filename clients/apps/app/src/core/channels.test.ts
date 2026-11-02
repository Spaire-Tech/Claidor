// An agent's channels as the window's Channels view reads the computer's
// answer (SimeonCore's NetworkTests.swift, `ChannelsTests`: `A0n`, `P0n`,
// `O0n`, `mmt`, `C0n`).

import { beforeAll, describe, expect, it } from 'vitest'
import {
  type ChannelsView,
  channelChip,
  channelPlaceholder,
  channelReach,
  channelSubtitle,
  channelsFrom,
  hasChannels,
  rowState,
} from './channels'
import { loadWords } from './words'

beforeAll(() => loadWords('en'))

const answer = {
  manifests: [
    {
      platform: 'discord',
      displayName: 'Discord',
      blurb: 'Message in Discord servers and DMs through a bot the user owns.',
      credentialLabel: 'bot token',
      availability: 'available',
      connectGuide: '…',
    },
    {
      platform: 'slack',
      displayName: 'Slack',
      blurb:
        'Message in Slack channels and DMs through a Socket Mode app the user owns.',
      credentialLabel: 'app token and bot token',
      availability: 'available',
      connectGuide: '…',
    },
  ],
  connections: [
    {
      platform: 'slack',
      label: 'Slack',
      status: 'pending',
      detail: 'Waiting for the bot token (xoxb-…)',
    },
  ],
}

describe('the Channels page’s rows', () => {
  it('as the window reads them', () => {
    const view = channelsFrom(answer)!
    expect(hasChannels(view)).toBe(true)
    const [discord, slack] = view.manifests as [
      ChannelsView['manifests'][0],
      ChannelsView['manifests'][0],
    ]
    expect(rowState(view, discord)).toEqual({ kind: 'available' })
    expect(channelChip({ kind: 'available' })).toBeUndefined()
    // A few words, not the computer's sentence (28 October 2026).
    expect(channelSubtitle(view, discord)).toBe('Servers and DMs')
    // Pending reads as Connecting, its "Waiting for…" never shown.
    expect(rowState(view, slack)).toEqual({ kind: 'connecting' })
    expect(channelChip(rowState(view, slack))).toBe('Connecting')
    expect(channelSubtitle(view, slack)).toBe('Channels and DMs')
    expect(channelPlaceholder(discord)).toBe('Bot token')
    expect(channelPlaceholder(slack)).toBe('App token and bot token')
    const other = {
      platform: 'teams',
      displayName: 'Teams',
      blurb: 'Message in Teams.',
      credentialLabel: 'app password',
      availability: 'available',
    }
    expect(channelReach(other)).toBe('Message in Teams.')
    expect(channelPlaceholder(other)).toBe('App password')
    const connected: ChannelsView = {
      ...view,
      connections: [
        { platform: 'slack', label: 'Nora Bot', status: 'connected' },
      ],
    }
    expect(channelSubtitle(connected, slack)).toBe('Nora Bot')
    expect(channelChip(rowState(connected, slack))).toBe('Connected')
    const failed: ChannelsView = {
      ...view,
      connections: [{ platform: 'slack', label: 'Slack', status: 'error' }],
    }
    expect(channelSubtitle(failed, slack)).toBe("Couldn't connect")
    expect(channelChip(rowState(failed, slack))).toBe('Needs attention')
    expect(channelChip({ kind: 'comingSoon' })).toBe('Coming soon')
    expect(
      hasChannels({
        manifests: [
          {
            platform: 'slack',
            displayName: 'Slack',
            blurb: '',
            credentialLabel: '',
            availability: 'coming-soon',
          },
        ],
        connections: [],
      }),
    ).toBe(false)
    expect(channelsFrom({ manifests: [] })).toBeUndefined()
  })

  it('an error says the computer’s words when it gives some; a nameless connection says what it reaches', () => {
    const view = channelsFrom({
      manifests: [{ platform: 'discord' }],
      connections: [
        { platform: 'discord', status: 'error', detail: 'Invalid token' },
      ],
    })!
    const discord = view.manifests[0]!
    expect(discord.displayName).toBe('discord')
    expect(discord.availability).toBe('coming-soon')
    expect(rowState(view, discord)).toEqual({ kind: 'comingSoon' })
    const open = {
      ...view,
      manifests: [{ ...discord, availability: 'available' }],
    }
    expect(channelSubtitle(open, open.manifests[0]!)).toBe('Invalid token')
    const connected = {
      ...open,
      connections: [{ platform: 'discord', label: '', status: 'connected' }],
    }
    expect(channelSubtitle(connected, open.manifests[0]!)).toBe(
      'Servers and DMs',
    )
  })
})
