// Windows' caption buttons follow the page's theme (windowLook.ts): sent at
// start, again at a theme chosen, never twice the same, in index.css's
// colours.

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { setTheme } from '../window/theme'
import { desktop } from './desktop'
import { FakeDesktop } from './testing'
import { captionColours, followWindowLook, windowLook } from './windowLook'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  setTheme('system')
})

describe('the caption buttons', () => {
  it('take the theme chosen and its colours', () => {
    setTheme('dark')
    expect(windowLook()).toEqual({ theme: 'dark', ...captionColours.dark })
    setTheme('light')
    expect(windowLook()).toEqual({ theme: 'light', ...captionColours.light })
  })

  it('are told at start and at each theme chosen, never twice the same', async () => {
    const fake = new FakeDesktop().answer('setWindowLook', () => undefined)
    stops.push(fake.install())
    stops.push(followWindowLook(desktop()!))
    setTheme('dark')
    setTheme('dark')
    setTheme('light')
    await Promise.resolve()
    const looks = fake.calls
      .filter((call) => call.name === 'setWindowLook')
      .map((call) => (call.args[0] as { theme: string }).theme)
    expect(looks).toEqual(['system', 'dark', 'light'])
  })

  it('are in index.css’s ground and ink, light and dark', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    const darkAt = css.indexOf('@media (prefers-color-scheme: dark)')
    const value = (name: string, from: number) =>
      new RegExp(`--${name}:\\s*(#[0-9a-f]+);`, 'i').exec(css.slice(from))?.[1]
    expect(value('ground', 0)).toBe(captionColours.light.background)
    expect(value('ink', 0)).toBe(captionColours.light.symbols)
    expect(value('ground', darkAt)).toBe(captionColours.dark.background)
    expect(value('ink', darkAt)).toBe(captionColours.dark.symbols)
  })
})
