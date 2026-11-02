// Step 7b's main process: the logs (the Mac's `computer-stream.log` and
// `voice-call.log`), the agents and chats kept on this PC (SavedChats.swift's
// files, with the core's test of an id never naming a path), and the PC's
// model for a report. Electron itself is driven by the step's own check.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { modelName, registryValue } from '../src/main/session/device'
import { AppLogs, isLogName, logTail, stampedLine } from '../src/main/session/logs'
import {
  SavedChatsFolder,
  agentIdArgument,
  isSavedName,
  recordText,
  savedChatFileName,
  savedChatsFolder,
  savedLimits,
} from '../src/main/session/savedChats'

const folders: string[] = []
function folder(): string {
  const made = mkdtempSync(path.join(os.tmpdir(), 'simeon-7b-'))
  folders.push(made)
  return made
}
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true })
})

const at = new Date('2026-11-02T21:00:00.123Z')

describe('the logs', () => {
  it('stamps each line, the call’s on one line with single spaces', () => {
    expect(stampedLine('voice-call.log', 'call  started\n with   Iris', at)).toBe(
      '2026-11-02T21:00:00.123Z call started with Iris\n',
    )
    expect(stampedLine('computer-stream.log', 'screen  theo\r\nconnecting', at)).toBe(
      '2026-11-02T21:00:00.123Z screen  theo connecting\n',
    )
    expect(isLogName('voice-call.log')).toBe(true)
    expect(isLogName('../kept/simeon.web.tokens.sealed')).toBe(false)
  })

  it('empties the screens’ log at launch, says where it is, and appends the call’s', async () => {
    const dir = folder()
    writeFileSync(path.join(dir, 'computer-stream.log'), 'the last launch\n')
    writeFileSync(path.join(dir, 'voice-call.log'), 'an older call\n')
    const echoed: string[] = []
    const logs = new AppLogs(dir, () => at, (line) => void echoed.push(line))
    await logs.startStreamLog()
    await logs.write('computer-stream.log', 'screen theo connecting')
    await logs.write('voice-call.log', 'call started')
    const stream = readFileSync(path.join(dir, 'computer-stream.log'), 'utf8')
    expect(stream).toBe(
      `2026-11-02T21:00:00.123Z computer stream log at ${path.join(dir, 'computer-stream.log')}\n` +
        '2026-11-02T21:00:00.123Z screen theo connecting\n',
    )
    expect(readFileSync(path.join(dir, 'voice-call.log'), 'utf8')).toBe(
      'an older call\n2026-11-02T21:00:00.123Z call started\n',
    )
    // Echoed to the console as the Mac echoes it to stderr.
    expect(echoed).toEqual(['[simeon] voice-call call started\n'])
  })

  it('reads the last 256 KB of each for a report, the screens’ first, an empty one left out', async () => {
    const dir = folder()
    const logs = new AppLogs(dir, () => at, () => {})
    expect(await logs.readTails()).toEqual([])
    const long = `${'x'.repeat(logTail)}\nthe newest line\n`
    writeFileSync(path.join(dir, 'voice-call.log'), long)
    writeFileSync(path.join(dir, 'computer-stream.log'), '')
    const tails = await logs.readTails()
    expect(tails.map((tail) => tail.name)).toEqual(['voice-call.log'])
    expect(Buffer.byteLength(tails[0]!.text)).toBe(logTail)
    expect(tails[0]!.text.endsWith('the newest line\n')).toBe(true)
    await logs.write('computer-stream.log', 'one')
    expect((await logs.readTails()).map((tail) => tail.name)).toEqual([
      'computer-stream.log',
      'voice-call.log',
    ])
  })
})

describe('the agents and chats kept on this PC', () => {
  it('names a chat’s file by its id’s hash, so no id names a path', () => {
    const name = savedChatFileName('../../etc/passwd')
    expect(name).not.toContain('/')
    expect(name).not.toContain('\\')
    expect(name.endsWith('.json')).toBe(true)
    expect(name).toBe(savedChatFileName('../../etc/passwd'))
    expect(name).not.toBe(savedChatFileName('theo'))
    // The core's: the first 16 bytes of sha256, in hex.
    expect(savedChatFileName('theo')).toMatch(/^[0-9a-f]{32}\.json$/)
  })

  it('keeps the three files and the chats, reads them back, and forgets them all', async () => {
    const dir = path.join(folder(), 'saved-chats')
    const saved = new SavedChatsFolder(dir)
    expect(await saved.read()).toEqual({ roster: null, layout: null, catalog: null })
    await saved.write('roster', recordText({ version: 1, email: 'b@y.com', agents: [] }, savedLimits.roster))
    await saved.writeChat('theo', recordText({ version: 1, agentId: 'theo', entries: [] }, savedLimits.chat))
    await saved.writeChat('iris', recordText({ version: 1, agentId: 'iris', entries: [] }, savedLimits.chat))
    const again = new SavedChatsFolder(dir)
    expect((await again.read()).roster).toEqual({ version: 1, email: 'b@y.com', agents: [] })
    expect(await again.readChat('theo')).toEqual({ version: 1, agentId: 'theo', entries: [] })
    expect(await again.readChat('nora')).toBeNull()
    // No file left half written.
    expect(readdirSync(dir).filter((name) => name.endsWith('.next'))).toEqual([])
    await again.keepChats(['iris'])
    expect(await again.readChat('theo')).toBeNull()
    expect(await again.readChat('iris')).not.toBeNull()
    await again.writeChat('iris', null)
    expect(await again.readChat('iris')).toBeNull()
    await again.forget()
    expect(existsSync(dir)).toBe(false)
    expect(await again.read()).toEqual({ roster: null, layout: null, catalog: null })
  })

  it('reads a damaged file as none', async () => {
    const dir = folder()
    writeFileSync(path.join(dir, 'layout.json'), '{"version":1,')
    expect((await new SavedChatsFolder(dir).read()).layout).toBeNull()
  })

  it('does each in the order asked: a read after a forget finds nothing', async () => {
    const dir = path.join(folder(), 'saved-chats')
    const saved = new SavedChatsFolder(dir)
    const text = recordText({ version: 1 }, savedLimits.layout)
    void saved.write('layout', text)
    void saved.forget()
    const read = saved.read()
    expect((await read).layout).toBeNull()
  })

  it('takes only what the page may hand it', () => {
    expect(() => agentIdArgument('')).toThrow()
    expect(() => agentIdArgument(7)).toThrow()
    expect(() => agentIdArgument('x'.repeat(2_000))).toThrow()
    expect(agentIdArgument('theo')).toBe('theo')
    expect(() => recordText([1, 2], savedLimits.chat)).toThrow()
    expect(() => recordText('text', savedLimits.chat)).toThrow()
    expect(() => recordText(null, savedLimits.chat)).toThrow()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => recordText(loop, savedLimits.chat)).toThrow()
    expect(() => recordText({ text: 'x'.repeat(savedLimits.chat) }, savedLimits.chat)).toThrow()
    expect(isSavedName('roster')).toBe(true)
    expect(isSavedName('../kept')).toBe(false)
  })

  it('lives in the app’s local folder on Windows, as the Mac’s under its caches', () => {
    expect(
      savedChatsFolder({
        dataFolder: 'C:\\Users\\Bass\\AppData\\Roaming\\Simeon',
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\Bass\\AppData\\Local' },
      }),
    ).toBe(path.join('C:\\Users\\Bass\\AppData\\Local', 'Simeon', 'saved-chats'))
    // A check's own data folder keeps everything in it.
    expect(
      savedChatsFolder({
        dataFolder: '/tmp/check',
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Local', SIMEON_USER_DATA: '/tmp/check' },
      }),
    ).toBe(path.join('/tmp/check', 'saved-chats'))
    expect(savedChatsFolder({ dataFolder: '/tmp/d', platform: 'linux', env: {} })).toBe(
      path.join('/tmp/d', 'saved-chats'),
    )
  })
})

describe('this PC for a report', () => {
  const answer = [
    '',
    'HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS',
    '    BIOSVendor    REG_SZ    LENOVO',
    '    SystemManufacturer    REG_SZ    LENOVO',
    '    SystemProductName    REG_SZ    21HM0026US',
    '    SystemVersion    REG_SZ    ThinkPad X1 Carbon Gen 11',
    '',
  ].join('\r\n')

  it('reads the maker and the model from Windows’ registry', () => {
    expect(registryValue(answer, 'SystemManufacturer')).toBe('LENOVO')
    expect(registryValue(answer, 'SystemProductName')).toBe('21HM0026US')
    expect(registryValue(answer, 'Missing')).toBeUndefined()
    expect(modelName('LENOVO', '21HM0026US')).toBe('LENOVO 21HM0026US')
    expect(modelName('Microsoft Corporation', 'Surface Laptop 5')).toBe(
      'Microsoft Corporation Surface Laptop 5',
    )
    expect(modelName('Dell Inc.', 'Dell Inc. XPS 13')).toBe('Dell Inc. XPS 13')
    expect(modelName(undefined, undefined)).toBe('')
  })
})
