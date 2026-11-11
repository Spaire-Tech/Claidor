// The Connect GitHub card (`github-sign-in`) as the window first draws it,
// before the computer has answered: the code, Copy code, and Open GitHub
// to GitHub's own page in a new tab (mac/Simeon/Cards.swift's
// `GitHubSignInCardView`).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Entry } from '../core/entry'
import { AppStore } from '../core/store'
import { connectCardView } from './ConnectCards'
import { WindowContext, WindowModel } from './windowModel'

function draw(message: Record<string, unknown>): string {
  const entry = Entry.from({
    id: 'g1',
    kind: 'send-message',
    timestampMs: 1,
    message,
  }) as Entry
  return renderToStaticMarkup(
    <WindowContext.Provider value={new WindowModel(undefined)}>
      {connectCardView('gitHubSignIn', {
        entry,
        entryId: 'g1',
        agentId: 'a1',
        store: new AppStore(),
        column: 600,
        openAgent: () => {},
      })}
    </WindowContext.Provider>,
  )
}

describe('the Connect GitHub card', () => {
  it('shows the code with Copy code and Open GitHub while it waits', () => {
    const html = draw({
      type: 'github-sign-in',
      code: 'ABCD-1234',
      url: 'https://github.com/login/device',
      expiresAtMs: 2_000,
    })
    expect(html).toContain('>Connect GitHub<')
    expect(html).toContain(
      '>Enter this code on GitHub to connect it to your computer.<',
    )
    expect(html).toContain('<span class="github-code">ABCD-1234</span>')
    expect(html).toContain('>Copy code</button>')
    expect(html).toMatch(
      /<a class="card-button prominent" href="https:\/\/github.com\/login\/device" target="_blank" rel="noopener noreferrer">Open GitHub<\/a>/,
    )
  })

  it('draws nothing for a line that isn’t one', () => {
    expect(draw({ type: 'github-sign-in', code: 'nope' })).toBe('')
  })
})
