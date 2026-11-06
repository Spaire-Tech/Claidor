// Settings' list of pages (SettingsWindow.tsx's `listed`): Updates only in the
// Windows app, and not in a Microsoft Store install, which the Store updates.

import { afterEach, describe, expect, it } from 'vitest'
import { AppStore } from '../core/store'
import { FakeDesktop } from '../desktop/testing'
import { listed } from './SettingsWindow'

const undo: (() => void)[] = []
afterEach(() => {
  for (const step of undo.splice(0).reverse()) step()
})

describe('Settings’ pages', () => {
  it('leaves Updates out on the web', () => {
    expect(listed(new AppStore())).not.toContain('updates')
  })

  it('lists Updates in the Windows app', () => {
    undo.push(new FakeDesktop().install())
    expect(listed(new AppStore())).toContain('updates')
  })

  it('leaves Updates out of a Microsoft Store install, which the Store updates', () => {
    undo.push(new FakeDesktop({ store: true }).install())
    const pages = listed(new AppStore())
    expect(pages).not.toContain('updates')
    expect(pages).toContain('help')
  })
})
