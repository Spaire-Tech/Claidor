// Slack through Simeon's own Slack app in the Channels page (12 November
// 2026, the Mac's `connectInBrowser`): + sends the tab opened in the click
// to Slack's sign-in, then the row waits while the computer is asked every
// 3 s, until it says connected; no address, and the tab closes and the row
// says it couldn't connect. A stand-in store: nothing reaches Slack or the
// server.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  type ChannelsView,
  type SlackState,
  slackShown,
  slackStateFrom,
  slackSubtitle,
} from '../core/channels'
import type { AppStore } from '../core/store'
import { loadWords } from '../core/words'
import { ChannelsModel, SlackRowModel } from './ChannelsPage'
import type { PendingPage } from './outside'

beforeAll(() => loadWords('en'))

const slack = {
  platform: 'slack',
  displayName: 'Slack',
  blurb: '',
  credentialLabel: '',
  availability: 'available',
  connect: 'app',
}

function viewWith(status?: string): ChannelsView {
  return {
    manifests: [slack],
    connections: status
      ? [{ platform: 'slack', label: 'Simeon Labs', status }]
      : [],
  }
}

function page() {
  const sent: string[] = []
  let dropped = false
  const pending: PendingPage = {
    refused: false,
    closed: false,
    go: (url) => sent.push(url),
    drop: () => {
      dropped = true
    },
  }
  return {
    pending,
    sent,
    get dropped() {
      return dropped
    },
  }
}

describe('Connect Slack', () => {
  it('opens Slack’s sign-in and waits until the computer says connected', async () => {
    const answers = [viewWith(), viewWith('connected')]
    const asked: string[] = []
    const store = {
      channelConnectLink: async (agentId: string, platform: string) => {
        asked.push(`${agentId}:${platform}`)
        return 'https://slack.com/oauth/v2/authorize?state=s'
      },
      refreshChannel: async () => answers.shift(),
    } as unknown as AppStore
    const waits: number[] = []
    const model = new ChannelsModel(store, 'a1', async (ms) => {
      waits.push(ms)
    })
    const tab = page()
    const run = model.connectInBrowser('slack', tab.pending)
    expect(model.isBusy('slack')).toBe(true)
    await run
    expect(asked).toEqual(['a1:slack'])
    expect(tab.sent).toEqual(['https://slack.com/oauth/v2/authorize?state=s'])
    expect(waits).toEqual([3000, 3000])
    expect(model.view?.connections[0]?.status).toBe('connected')
    expect(model.isBusy('slack')).toBe(false)
    expect(model.problem('slack')).toBeUndefined()
  })

  it('no address: the tab closes and the row says it couldn’t connect', async () => {
    const store = {
      channelConnectLink: async () => undefined,
      refreshChannel: async () => {
        throw new Error('not asked')
      },
    } as unknown as AppStore
    const model = new ChannelsModel(store, 'a1', async () => {})
    const tab = page()
    await model.connectInBrowser('slack', tab.pending)
    expect(tab.dropped).toBe(true)
    expect(tab.sent).toEqual([])
    expect(model.problem('slack')).toBe("Couldn't connect")
    expect(model.isBusy('slack')).toBe(false)
  })

  it('the page going away stops the wait', async () => {
    let asks = 0
    const store = {
      channelConnectLink: async () => 'https://slack.com/oauth/v2/authorize',
      refreshChannel: async () => {
        asks += 1
        return viewWith()
      },
    } as unknown as AppStore
    const model = new ChannelsModel(store, 'a1', async () => {
      if (asks === 2) model.stop()
    })
    await model.connectInBrowser('slack', page().pending)
    expect(asks).toBe(2)
    expect(model.isBusy('slack')).toBe(false)
  })
})

describe('Slack in the profile, read from the server', () => {
  it('reads the server’s answer: the workspace once connected, what it reaches before; hidden when Slack can’t be connected', () => {
    const off = slackStateFrom({ available: true, connected: false })!
    expect(slackShown(off)).toBe(true)
    expect(slackSubtitle(off)).toBe('Channels and DMs')
    const on = slackStateFrom({
      available: true,
      connected: true,
      workspace: 'Simeon Labs',
    })!
    expect(slackSubtitle(on)).toBe('Simeon Labs')
    expect(slackShown(slackStateFrom({ available: false })!)).toBe(false)
    expect(slackStateFrom({ connected: true })).toBeUndefined()
    expect(slackShown(undefined)).toBe(false)
  })

  it('+ opens Slack’s sign-in and waits until the server says connected; Disconnect asks the server', async () => {
    const answers: SlackState[] = [
      { available: true, connected: false },
      { available: true, connected: false },
      { available: true, connected: true, workspace: 'Simeon Labs' },
      { available: true, connected: false },
    ]
    const disconnected: string[] = []
    const store = {
      slackState: async () => answers.shift(),
      channelConnectLink: async () =>
        'https://api.simeonlabs.com/sand/slack/install?ticket=t',
      disconnectSlack: async (agentId: string) => {
        disconnected.push(agentId)
        return true
      },
    } as unknown as AppStore
    const waits: number[] = []
    const model = new SlackRowModel(store, 'a1', async (ms) => {
      waits.push(ms)
    })
    await model.load()
    expect(model.state?.connected).toBe(false)
    const tab = page()
    const run = model.connect(tab.pending)
    expect(model.busy).toBe(true)
    await run
    expect(tab.sent).toEqual([
      'https://api.simeonlabs.com/sand/slack/install?ticket=t',
    ])
    expect(waits).toEqual([3000, 3000])
    expect(model.state).toEqual({
      available: true,
      connected: true,
      workspace: 'Simeon Labs',
    })
    expect(model.busy).toBe(false)

    await model.disconnect()
    expect(disconnected).toEqual(['a1'])
    expect(model.state?.connected).toBe(false)
    expect(model.problem).toBeUndefined()
  })

  it('no link: the tab closes and the row says it couldn’t connect; a failed Disconnect says so', async () => {
    const store = {
      slackState: async () => ({
        available: true,
        connected: true,
        workspace: 'W',
      }),
      channelConnectLink: async () => undefined,
      disconnectSlack: async () => false,
    } as unknown as AppStore
    const model = new SlackRowModel(store, 'a1', async () => {})
    const tab = page()
    await model.connect(tab.pending)
    expect(tab.dropped).toBe(true)
    expect(model.problem).toBe("Couldn't connect")
    await model.disconnect()
    expect(model.problem).toBe(
      'Something didn’t work here. Try again in a little while.',
    )
    expect(model.busy).toBe(false)
  })
})
