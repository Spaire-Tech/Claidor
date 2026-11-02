// 7c's main-process logic, without Electron (parts/surfaces.ts uses these;
// Electron itself is checked by the part's own run, scratchpad 7c-check):
// the Mac's mark drawn for the tray, what the page hands in, checked, the
// tray's menu, and where the call's window goes.

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { TrayMenu } from '../../clients/apps/app/src/desktop/contract'
import { callFrame, callHeight, callResized, zoomed } from '../src/main/surfaces/callPlace'
import {
  readAction,
  readBadge,
  readHeight,
  readLevels,
  readNote,
  readShownCall,
  readTray,
} from '../src/main/surfaces/checks'
import {
  coverage,
  markBox,
  markPath,
  markPolygons,
  menuDot,
  trayMark,
} from '../src/main/surfaces/picture'
import { firstTray, menuLabel, trayTemplate } from '../src/main/surfaces/trayMenu'

/** A PNG read back: its size and each pixel's red, green, blue, alpha (filter 0 rows only, as written here). */
function readPNG(png: Buffer): { width: number; height: number; at: (x: number, y: number) => number[] } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  let offset = 8
  const data: Buffer[] = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  return {
    width,
    height,
    at: (x, y) => {
      const start = y * (width * 4 + 1) + 1 + x * 4
      return [...raw.subarray(start, start + 4)]
    },
  }
}

describe('the tray’s mark (the Mac’s MenuBarMark)', () => {
  it('is the Mac’s own outline', () => {
    const svg = readFileSync(
      new URL(
        '../../mac/Simeon/Assets.xcassets/MenuBarMark.imageset/menubar-mark.svg',
        import.meta.url,
      ),
      'utf8',
    )
    expect(svg.match(/ d="([^"]+)"/)?.[1]).toBe(markPath)
    expect(svg).toContain(`viewBox="${markBox.x} ${markBox.y} ${markBox.size} ${markBox.size}"`)
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('fills its shape by the even-odd rule, its holes clear', () => {
    const polygons = markPolygons()
    expect(polygons.length).toBeGreaterThan(4)
    const size = 300
    const covered = coverage(polygons, size)
    const at = (x: number, y: number) => covered[Math.round(y - markBox.y) * size + Math.round(x - markBox.x)]!
    // The upper left petal's ink and its hole; the middle where the four meet, inked; between the two upper petals, clear.
    expect(at(72, 110)).toBeGreaterThan(0.9)
    expect(at(130, 130)).toBeLessThan(0.1)
    expect(at(200, 200)).toBeGreaterThan(0.9)
    expect(at(200, 60)).toBeLessThan(0.1)
    // Outside the shape: the corners.
    expect(at(52, 52)).toBe(0)
  })

  it('is drawn at each size in the taskbar’s ink, with the Dock’s red dot when anything is unread', () => {
    for (const size of [16, 20, 24, 32, 40, 48]) {
      const light = readPNG(trayMark(size, false, false))
      expect([light.width, light.height]).toEqual([size, size])
    }
    const light = readPNG(trayMark(32, false, false))
    const dark = readPNG(trayMark(32, true, false))
    const inked = (png: ReturnType<typeof readPNG>) => {
      for (let y = 0; y < 32; y += 1)
        for (let x = 0; x < 32; x += 1) {
          const [r, g, b, a] = png.at(x, y)
          if (a! > 250) return [r, g, b]
        }
      return undefined
    }
    expect(inked(light)).toEqual([26, 26, 26])
    expect(inked(dark)).toEqual([255, 255, 255])
    const unread = readPNG(trayMark(32, false, true))
    // The dot's middle, lower right: the Mac's red.
    expect(unread.at(26, 26)).toEqual([255, 59, 48, 255])
    expect(light.at(26, 26)).not.toEqual([255, 59, 48, 255])
  })

  it('draws the menu’s unread mark in the menu’s ink', () => {
    const dot = readPNG(menuDot(16, '#ffffff'))
    expect(dot.at(8, 8)).toEqual([255, 255, 255, 255])
    expect(dot.at(1, 1)[3]).toBe(0)
  })
})

describe('what the page hands in, checked', () => {
  it('takes a notification as the page writes it, nothing else', () => {
    const note = { agentId: 'iris', title: 'Iris needs you', body: 'Approve?', sound: true }
    expect(readNote(note)).toEqual(note)
    expect(readNote({ ...note, sound: 'yes' })).toBeUndefined()
    expect(readNote({ ...note, title: '' })).toBeUndefined()
    expect(readNote({ ...note, body: 'x'.repeat(600) })).toBeUndefined()
    expect(readNote([note])).toBeUndefined()
    expect(readNote(null)).toBeUndefined()
  })

  it('takes the taskbar’s number with a PNG of its own, nothing else', () => {
    expect(readBadge({ count: 0, description: '' })).toEqual({ count: 0, description: '' })
    const image = 'data:image/png;base64,iVBORw0KGgo='
    expect(readBadge({ count: 3, image, description: '3' })).toEqual({ count: 3, image, description: '3' })
    for (const bad of [
      { count: -1, description: '' },
      { count: 1.5, description: '' },
      { count: 2, description: 2 },
      { count: 2, image: 'data:image/svg+xml;base64,PHN2Zz4=', description: '2' },
      { count: 2, image: 'https://example.com/x.png', description: '2' },
      { count: 2, image: `data:image/png;base64,${'A'.repeat(70_000)}`, description: '2' },
      { count: 2, image: 'data:image/png;base64,<script>', description: '2' },
    ])
      expect(readBadge(bad), JSON.stringify(bad).slice(0, 80)).toBeUndefined()
  })

  it('takes the tray’s menu with its five words and at most eight agents', () => {
    const tray: TrayMenu = {
      ...firstTray,
      signedIn: true,
      agents: [{ id: 'iris', name: 'Iris', unread: true }],
      call: { title: 'Call Iris', enabled: true },
    }
    expect(readTray(tray)).toEqual(tray)
    expect(readTray({ ...tray, call: undefined })).toEqual({ ...firstTray, signedIn: true, agents: tray.agents })
    expect(readTray({ ...tray, words: { ...tray.words, quitSimeon: '' } })).toBeUndefined()
    expect(
      readTray({ ...tray, agents: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, name: 'A', unread: false })) }),
    ).toBeUndefined()
    expect(readTray({ ...tray, agents: [{ id: 'iris', name: 'Iris' }] })).toBeUndefined()
    expect(readTray({ ...tray, signedIn: 1 })).toBeUndefined()
  })

  it('takes a call as plain JSON under its limit, or none', () => {
    expect(readShownCall(null)).toBeNull()
    const shown = { call: { agentId: 'iris', phase: 'ringing' }, agent: { id: 'iris', name: 'Iris' } }
    expect(readShownCall(shown)).toEqual(shown)
    expect(readShownCall({ call: { phase: 'ringing' } })).toBeUndefined()
    expect(readShownCall({ call: { agentId: 'iris' }, agent: 'Iris' })).toBeUndefined()
    expect(readShownCall({ call: { agentId: 'iris', big: 'x'.repeat(4_300_000) } })).toBeUndefined()
    expect(readLevels([0, 0.5, 1])).toEqual([0, 0.5, 1])
    expect(readLevels([2])).toBeUndefined()
    expect(readLevels(Array.from({ length: 65 }, () => 0))).toBeUndefined()
    expect(readLevels([Number.NaN])).toBeUndefined()
    expect(readHeight(120)).toBe(120)
    expect(readHeight(-1)).toBeUndefined()
    expect(readHeight('120')).toBeUndefined()
    expect(readAction('hangUp')).toBe('hangUp')
    expect(readAction('quit')).toBeUndefined()
  })
})

describe('the tray’s menu (MenuBar.swift, with the Mac’s app menu’s own items)', () => {
  const done: string[] = []
  const act = {
    open: () => done.push('open'),
    newChat: () => done.push('newChat'),
    openAgent: (id: string) => done.push(`agent:${id}`),
    call: () => done.push('call'),
    about: () => done.push('about'),
    checkForUpdates: () => done.push('updates'),
    quit: () => done.push('quit'),
  }
  const labels = (items: ReturnType<typeof trayTemplate>) =>
    items.map((item) => (item.type === 'separator' ? '—' : `${item.label}${item.enabled === false ? ' (off)' : ''}`))

  it('signed out: Open Simeon and Quit Simeon only', () => {
    expect(labels(trayTemplate(firstTray, { checksForUpdates: true }, act))).toEqual([
      'Open Simeon',
      '—',
      'Quit Simeon',
    ])
  })

  it('signed in: New Agent, the agents, Call <name>, About and Check for Updates… in a packaged build', () => {
    const tray: TrayMenu = {
      ...firstTray,
      signedIn: true,
      agents: [
        { id: 'iris', name: 'Iris', unread: true },
        { id: 'theo', name: 'Theo & Co', unread: false },
      ],
      call: { title: 'Call Agent', enabled: false },
    }
    const mark = {} as never
    const items = trayTemplate(tray, { checksForUpdates: true, unreadMark: mark }, act)
    expect(labels(items)).toEqual([
      'Open Simeon',
      'New Agent',
      '—',
      'Iris',
      'Theo && Co',
      '—',
      'Call Agent (off)',
      '—',
      'About Simeon',
      'Check for Updates…',
      '—',
      'Quit Simeon',
    ])
    expect(items[3]?.icon).toBe(mark)
    expect(items[4]?.icon).toBeUndefined()
    expect(items.at(-1)?.accelerator).toBe('Ctrl+Q')
    expect(items.at(-1)?.registerAccelerator).toBe(false)
    done.length = 0
    for (const item of items) item.click?.({} as never, undefined, {} as never)
    expect(done).toEqual(['open', 'newChat', 'agent:iris', 'agent:theo', 'call', 'about', 'updates', 'quit'])
    // A developer's build has no updater: no Check for Updates….
    expect(labels(trayTemplate(tray, { checksForUpdates: false }, act))).not.toContain('Check for Updates…')
    // No agents and calls off: no empty group.
    expect(labels(trayTemplate({ ...tray, agents: [], call: undefined }, { checksForUpdates: false }, act))).toEqual([
      'Open Simeon',
      'New Agent',
      '—',
      'About Simeon',
      '—',
      'Quit Simeon',
    ])
    expect(menuLabel('A&B&&C')).toBe('A&&B&&&&C')
  })
})

describe('the call’s window (CallBannerWindow.swift’s `frame`, `resize`)', () => {
  it('sits 12 under the work area’s top and 16 from its right, with the room for its shadow', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const frame = callFrame(area, 78)
    expect(frame).toEqual({ x: 1920 - 16 - 360 - 28, y: 2, width: 416, height: 78 + 56 })
    // The card's own top and right edge on the screen.
    expect(frame.y + 10).toBe(12)
    expect(frame.x + 28 + 360).toBe(1920 - 16)
    // A second screen to the left and above.
    expect(callFrame({ x: -1280, y: -200, width: 1280, height: 800 }, 78)).toMatchObject({ x: -1280 + 1280 - 404, y: -198 })
  })

  it('follows the card’s height, 40 to 480 and rounded up, its top kept', () => {
    expect(callHeight(10)).toBe(40)
    expect(callHeight(200.2)).toBe(201)
    expect(callHeight(900)).toBe(480)
    const frame = callFrame({ x: 0, y: 0, width: 1440, height: 900 }, 78)
    expect(callResized(frame, 201)).toEqual({ ...frame, height: 201 + 56 })
  })
})

describe('the main window’s zoom (WindowChrome.swift’s `WindowZoom.apply`)', () => {
  it('steps by a tenth, 50 % to 300 %, rounded, and goes back to 100 %', () => {
    expect(zoomed(1, 0.1)).toBe(1.1)
    expect(zoomed(1.1, 0.1)).toBe(1.2)
    expect(zoomed(1, -0.1)).toBe(0.9)
    expect(zoomed(0.5, -0.1)).toBe(0.5)
    expect(zoomed(3, 0.1)).toBe(3)
    expect(zoomed(2.7, 0)).toBe(1)
    let factor = 1
    for (let i = 0; i < 7; i += 1) factor = zoomed(factor, 0.1)
    expect(factor).toBe(1.7)
  })
})
