// Windows' own parts the page uses in the Windows app since 6 November 2026
// (native.ts): the file dialog's files made `File`s, the beep, an airline's
// logo kept by the app; nothing of it on the web or in the call's window.

import { afterEach, describe, expect, it } from 'vitest'
import { beep, chooseInApp, keptLogo } from './native'
import { FakeDesktop } from './testing'

const undo: (() => void)[] = []
afterEach(() => {
  for (const step of undo.splice(0).reverse()) step()
})

const ask = {
  title: 'Choose screenshots to add',
  filterName: 'Screenshots',
  extensions: ['png'],
  multiple: true,
  max: 4,
}

describe('Windows’ own parts', () => {
  it('leaves the web its own ways', async () => {
    expect(chooseInApp(ask)).toBeUndefined()
    expect(await keptLogo('https://assets.duffel.com/BA.svg')).toBeUndefined()
    beep()
  })

  it('makes the files chosen in Windows’ dialog files', async () => {
    const app = new FakeDesktop().answer('chooseFiles', () => [
      {
        name: 'bug.png',
        type: 'image/png',
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    ])
    undo.push(app.install())
    const files = await chooseInApp(ask)
    expect(app.calls).toEqual([{ name: 'chooseFiles', args: [ask] }])
    expect(files).toHaveLength(1)
    expect(files![0]!.name).toBe('bug.png')
    expect(files![0]!.type).toBe('image/png')
    expect(new Uint8Array(await files![0]!.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    )
  })

  it('gives no files when the dialog fails', async () => {
    const app = new FakeDesktop().answer('chooseFiles', () => {
      throw new Error('No window.')
    })
    undo.push(app.install())
    expect(await chooseInApp(ask)).toEqual([])
  })

  it('beeps and asks for logos only in the main window', async () => {
    const app = new FakeDesktop()
      .answer('beep', () => {})
      .answer('remotePicture', () => 'data:image/png;base64,AA==')
    undo.push(app.install())
    beep()
    expect(await keptLogo('https://assets.duffel.com/BA.svg')).toBe(
      'data:image/png;base64,AA==',
    )
    // A logo that isn't on https is the page's own (a `data:` one already).
    expect(await keptLogo('data:image/png;base64,AA==')).toBeUndefined()
    expect(app.calls.map((call) => call.name)).toEqual([
      'beep',
      'remotePicture',
    ])
    undo.pop()?.()
    const call = new FakeDesktop({ window: 'call' }).answer('beep', () => {})
    undo.push(call.install())
    beep()
    expect(chooseInApp(ask)).toBeUndefined()
    expect(call.calls).toEqual([])
  })

  it('reads the logo itself when the app can’t answer', async () => {
    const app = new FakeDesktop().answer('remotePicture', () => {
      throw new Error('Not in this build.')
    })
    undo.push(app.install())
    expect(await keptLogo('https://assets.duffel.com/BA.svg')).toBeUndefined()
  })
})
