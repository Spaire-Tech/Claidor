// The chat's card that offers Claude and ChatGPT to connect
// (`model-connect`): both rows with Connect when neither is connected, a
// connected one as a connected app's card, and the wait while the accounts
// are first read (mac/Simeon/Cards.swift's `ModelConnectCardView`).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { modelAccount } from '../core/aiModels'
import { AppStore } from '../core/store'
import { ModelConnectCardView } from './ModelConnectCard'
import { WindowContext, WindowModel } from './windowModel'

function draw(
  providers: string[],
  set: (store: AppStore) => void = () => {},
): string {
  const store = new AppStore()
  set(store)
  return renderToStaticMarkup(
    <WindowContext.Provider value={new WindowModel(undefined)}>
      <ModelConnectCardView card={{ providers }} store={store} />
    </WindowContext.Provider>,
  )
}

const loaded = (store: AppStore) => {
  store.aiModels.loaded = true
}

describe('the card that offers Claude and ChatGPT to connect', () => {
  it('offers both, each with what it is for and Connect', () => {
    const html = draw(['claude', 'chatgpt'], loaded)
    expect(html).toContain('>Connect Claude<')
    expect(html).toContain('>Cloud agents code in Claude Code.<')
    expect(html).toContain('>Connect ChatGPT<')
    expect(html).toContain('>Cloud agents code in Codex.<')
    expect(
      html.match(
        /<button type="button" class="card-button prominent">Connect<\/button>/g,
      ),
    ).toHaveLength(2)
    expect(html).not.toContain('connector-connected')
    // Claude's row first, as the card names them.
    expect(html.indexOf('Connect Claude')).toBeLessThan(
      html.indexOf('Connect ChatGPT'),
    )
  })

  it('reads a connected one as a connected app: its name and Connected, no line, no button', () => {
    const html = draw(['claude', 'chatgpt'], (store) => {
      loaded(store)
      store.aiModels.accounts = [
        modelAccount({ id: 'a1', provider: 'chatgpt', status: 'available' })!,
      ]
    })
    expect(html).toContain('<span class="connector-title">ChatGPT</span>')
    expect(html).not.toContain('Cloud agents code in Codex')
    expect(html).toContain(
      '<span class="connector-connected" role="status">Connected</span>',
    )
    // The other is still offered.
    expect(html).toContain('>Connect Claude<')
    expect(
      html.match(/class="card-button prominent">Connect<\/button>/g),
    ).toHaveLength(1)
  })

  it('a signed-out account is offered again', () => {
    const html = draw(['chatgpt'], (store) => {
      loaded(store)
      store.aiModels.accounts = [
        modelAccount({ id: 'a1', provider: 'chatgpt', status: 'signed_out' })!,
      ]
    })
    expect(html).toContain('>Connect ChatGPT<')
    expect(html).not.toContain('connector-connected')
  })

  it('waits while the accounts are first read', () => {
    const html = draw(['claude', 'chatgpt'])
    expect(html.match(/class="connect-spinner"/g)).toHaveLength(2)
    expect(html).not.toContain('card-button')
  })
})
