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

describe('the card that offers Claude Code and Codex to connect', () => {
  it('offers both programs by their own names, each with whose plan it runs on and Connect', () => {
    const html = draw(['claude', 'chatgpt'], loaded)
    // The founder, 13 November 2026: "its connect codex or connect claude code".
    expect(html).toContain('>Connect Claude Code<')
    expect(html).toContain('>Runs on your Claude plan.<')
    expect(html).toContain('>Connect Codex<')
    expect(html).toContain('>Runs on your ChatGPT plan.<')
    expect(html).not.toContain('>Connect Claude<')
    expect(html).not.toContain('Connect ChatGPT')
    expect(
      html.match(
        /<button type="button" class="card-button prominent">Connect<\/button>/g,
      ),
    ).toHaveLength(2)
    expect(html).not.toContain('connector-connected')
    // Claude Code's row first, as the card names them.
    expect(html.indexOf('Connect Claude Code')).toBeLessThan(
      html.indexOf('Connect Codex'),
    )
  })

  it("draws each program's own logo bare: no app tile, no ground behind it", () => {
    const html = draw(['claude', 'chatgpt'], loaded)
    // "its full logo no white or dark background": the cut-outs, in a place of their own.
    const logos = html.match(
      /<span class="program-logo" aria-hidden="true"><img src="[^"]*(claudecode|codex)[^"]*" alt=""\/?><\/span>/g,
    )
    expect(logos).toHaveLength(2)
    expect(logos?.[0]).toContain('claudecode')
    expect(logos?.[1]).toContain('codex')
    expect(html).not.toContain('logo-tile')
  })

  it('reads a connected one as a connected app: its name and Connected, no line, no button', () => {
    const html = draw(['claude', 'chatgpt'], (store) => {
      loaded(store)
      store.aiModels.accounts = [
        modelAccount({ id: 'a1', provider: 'chatgpt', status: 'available' })!,
      ]
    })
    expect(html).toContain('<span class="connector-title">Codex</span>')
    expect(html).not.toContain('Runs on your ChatGPT plan')
    expect(html).toContain(
      '<span class="connector-connected" role="status">Connected</span>',
    )
    // The other is still offered.
    expect(html).toContain('>Connect Claude Code<')
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
    expect(html).toContain('>Connect Codex<')
    expect(html).not.toContain('connector-connected')
  })

  it('waits while the accounts are first read', () => {
    const html = draw(['claude', 'chatgpt'])
    expect(html.match(/class="connect-spinner"/g)).toHaveLength(2)
    expect(html).not.toContain('card-button')
  })
})
