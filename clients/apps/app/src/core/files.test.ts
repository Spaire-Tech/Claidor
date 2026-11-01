// SimeonCore's file tests, translated: `FileLineTests` (TraysTests.swift),
// `FilePreviewTests`' kinds, names and opening (with the window's own
// answers, Fixtures/file-preview.json), `SentPictureTests` (CoreTests.swift),
// and what a chat reads of files as it opens without waking a computer that
// rests (SleepingComputerTests.swift).

import { afterEach, describe, expect, it } from 'vitest'
import fixture from '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/file-preview.json'
import { fileLine, fileSize } from './fileLine'
import {
  computerPath,
  downloadName,
  fileKind,
  fileLanguage,
  lastPart,
  opensPreview,
  splitName,
} from './filePreview'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore, outboxFileURL } from './store'
import { FakeBackend } from './testing'
import { setWords } from './words'

afterEach(() => setWords('en', {}))

describe("a file card's line", () => {
  it('writes sizes as the window does', () => {
    expect(fileSize(0)).toBe('0 B')
    expect(fileSize(1023)).toBe('1023 B')
    expect(fileSize(1024)).toBe('1.0 KB')
    // A tie goes up, as `toFixed` rounds: 1.25 → 1.3.
    expect(fileSize(1280)).toBe('1.3 KB')
    expect(fileSize(10239)).toBe('10.0 KB')
    expect(fileSize(10240)).toBe('10 KB')
    expect(fileSize(1_048_575)).toBe('1024 KB')
    expect(fileSize(1_048_576)).toBe('1.0 MB')
    expect(fileSize(1_572_864)).toBe('1.5 MB')
    expect(fileSize(26_214_400)).toBe('25.0 MB')
  })

  it("reads the computer's answers", () => {
    expect(fileLine(null)).toBe("Couldn't read file")
    expect(fileLine({ kind: 'binary', bytes: 2048 })).toBe('2.0 KB')
    expect(
      fileLine({ kind: 'text', text: 'hi', truncated: false, bytes: 2 }),
    ).toBe('2 B')
  })

  it("uses the language's decimal mark and units", () => {
    setWords('fr', { core: { '%@ KB': '%@ Ko', '%lld B': '%lld o' } })
    expect(fileSize(1280)).toBe('1,3 Ko')
    expect(fileSize(12)).toBe('12 o')
  })
})

describe("a file's kind", () => {
  it('is picked as the window picks it', () => {
    const cases = fixture.kinds
    expect(cases.length).toBeGreaterThan(20)
    for (const item of cases) {
      expect(fileKind(item.name), item.name).toBe(item.kind)
      expect(fileLanguage(item.name) ?? null, item.name).toBe(item.language)
    }
    for (const item of fixture.splits)
      expect(splitName(item.name)).toEqual({ base: item.base, ext: item.ext })
  })

  it('opens a preview as the window does', () => {
    expect(opensPreview('unknown', true)).toBe(false)
    expect(opensPreview('pdf', undefined)).toBe(true)
    expect(opensPreview('markdown', undefined)).toBe(false)
    expect(opensPreview('json', false)).toBe(false)
    expect(opensPreview('text', true)).toBe(true)
    expect(lastPart('file:///home/box/docs/Q3%20report.pdf')).toBe(
      'Q3 report.pdf',
    )
    expect(lastPart('/home/box/a.txt')).toBe('a.txt')
    expect(computerPath('file:///home/box/Q3%20report.pdf')).toBe(
      '/home/box/Q3 report.pdf',
    )
    expect(computerPath('/home/box/a b.pdf')).toBe('/home/box/a b.pdf')
  })

  it('is named for Save as the Electron app names it', () => {
    expect(downloadName('Q3 report.pdf', '/home/box/f81d.pdf')).toBe(
      'Q3 report.pdf',
    )
    // A name of another kind: the file's own.
    expect(downloadName('Q3 report', '/home/box/f81d.pdf')).toBe('f81d.pdf')
    expect(downloadName('notes', '/home/box/f81d.bin')).toBe('notes')
    expect(downloadName('  ', '/')).toBe('download')
  })
})

/** A store on a computer that answers as told. */
async function attached(backend = new FakeBackend()) {
  backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
  const store = new AppStore()
  store.readsServerCopy = false
  await store.attach(backend)
  return { backend, store }
}

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

describe('a file read from the computer', () => {
  it('comes in pieces until its size is read', async () => {
    const backend = new FakeBackend()
    const file = Array.from({ length: 10 }, (_, i) => i)
    backend.commandAnswers.readAttachmentChunk = (args) => {
      const offset = (args as { offset: number }).offset
      return {
        totalSize: file.length,
        bytesBase64: base64(file.slice(offset, offset + 4)),
      }
    }
    const { store } = await attached(backend)
    const read = await store.readFile('file:///home/box/a%20b.bin', 'theo', {
      wakes: false,
    })
    expect([...(read ?? [])]).toEqual(file)
    const asked = backend.commands.filter(
      (c) => c.method === 'readAttachmentChunk',
    )
    expect(asked.map((c) => (c.args as { offset: number }).offset)).toEqual([
      0, 4, 8,
    ])
    expect(asked[0]!.args).toEqual({
      path: '/home/box/a b.bin',
      agentId: 'theo',
      offset: 0,
      length: 4 << 20,
    })
    expect(asked.every((c) => !c.wakes)).toBe(true)
  })

  it('is read as a picture when the pieces come empty', async () => {
    const backend = new FakeBackend()
    backend.commandAnswers.readAttachmentChunk = () => ({ totalSize: 0 })
    backend.commandAnswers.readAttachmentImage = () => ({
      dataUrl: `data:image/png;base64,${base64([0x89, 0x50, 1])}`,
    })
    const { store } = await attached(backend)
    const read = await store.readFile('/home/box/p.png', 'theo')
    expect([...(read ?? [])]).toEqual([0x89, 0x50, 1])
    backend.refusedCommands.add('readAttachmentImage')
    expect(await store.readFile('/home/box/q.png', 'theo')).toBeUndefined()
    // A computer that refuses the pieces is not asked for the picture.
    backend.refusedCommands.delete('readAttachmentImage')
    backend.refusedCommands.add('readAttachmentChunk')
    const before = backend.commands.length
    expect(await store.readFile('/home/box/r.png', 'theo')).toBeUndefined()
    expect(backend.commands.slice(before).map((c) => c.method)).toEqual([
      'readAttachmentChunk',
    ])
  })

  it("gives its card's line, kept once the computer answered", async () => {
    const backend = new FakeBackend()
    const answers: Record<string, JSONValue> = {
      '/home/a.txt': { kind: 'text', text: 'hi', bytes: 2 },
      '/home/b.bin': { kind: 'binary', bytes: 2048 },
      '/home/none.txt': null,
    }
    backend.commandAnswers.readAttachmentText = (args) =>
      answers[(args as { path: string }).path] ?? null
    const { store } = await attached(backend)
    expect(await store.fileFacts('/home/a.txt', false)).toEqual({
      line: '2 B',
      readsAsText: true,
    })
    expect(await store.fileFacts('/home/b.bin')).toEqual({
      line: '2.0 KB',
      readsAsText: false,
    })
    expect((await store.fileFacts('/home/none.txt')).line).toBe(
      "Couldn't read file",
    )
    await store.fileFacts('/home/a.txt')
    const asked = () =>
      backend.commands.filter((c) => c.method === 'readAttachmentText').length
    expect(asked()).toBe(3)
    // A failed read is tried again next time.
    backend.refusedCommands.add('readAttachmentText')
    expect(await store.fileFacts('/home/c.txt')).toEqual({ line: '' })
    backend.refusedCommands.delete('readAttachmentText')
    answers['/home/c.txt'] = { kind: 'text', text: 'x', bytes: 1 }
    expect((await store.fileFacts('/home/c.txt')).line).toBe('1 B')
  })

  it('waits for a computer that rests as a chat opens', async () => {
    const { backend, store } = await attached()
    await store.fileFacts('/home/a.txt', false)
    await store.readFile('/home/a.png', 'theo', { wakes: false })
    const asked = backend.commands.filter((c) =>
      c.method.startsWith('readAttachment'),
    )
    expect(new Set(asked.map((c) => c.method))).toEqual(
      new Set([
        'readAttachmentText',
        'readAttachmentChunk',
        'readAttachmentImage',
      ]),
    )
    expect(asked.every((c) => !c.wakes)).toBe(true)
  })

  it('is read from this tab when the person sent it, under both its addresses', async () => {
    const backend = new FakeBackend()
    const path = '/home/box/attachments/Photo 1.png'
    backend.commandAnswers.uploadAttachment = () => ({ path })
    const { store } = await attached(backend)
    await store.open('theo')
    const photo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    await store.send('', 'theo', {
      files: [{ name: 'Photo 1.png', data: photo }],
      id: 'ios-p1',
    })
    const waiting = outboxFileURL('ios-p1', 0)
    expect(store.sentFile(waiting)?.data).toEqual(photo)
    expect(store.sentFile(path)?.keys).toEqual([waiting, path])
    const before = backend.commands.length
    expect(await store.readFile(path, 'theo')).toEqual(photo)
    expect(await store.fileFacts(path)).toEqual({
      line: '7 B',
      readsAsText: false,
    })
    // Read from the tab, not the computer.
    expect(backend.commands.length).toBe(before)
  })
})
