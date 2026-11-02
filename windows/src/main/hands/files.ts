// Reading a file for the agent, and a command's terminal file
// (SimeonMacCore's LocalExecFiles.swift: `LocalRead`, `TerminalFile`; the
// engine's packages/local-exec/read.ts and the box's await tool, which
// reads the terminal file).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalExec, type PathFlavor, resolveAgainst } from './rules'

export type ReadKind = 'text' | 'image' | 'binary'

const videoExtensions = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v'])

function extension(file: string): string {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

export function isVideo(file: string): boolean {
  return videoExtensions.has(extension(file))
}

export function isPDF(file: string): boolean {
  return extension(file) === 'pdf'
}

function isPrintable(byte: number): boolean {
  return (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13
}

function isText(bytes: Uint8Array): boolean {
  const length = Math.min(4096, bytes.length)
  if (length === 0) return true
  let control = 0
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[i] ?? 0
    if (byte === 0) return false
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) control += 1
  }
  return (control / length) * 100 < 5
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  if (bytes.length < at + prefix.length) return false
  return prefix.every((byte, i) => bytes[at + i] === byte)
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0))
}

function isImage(b: Uint8Array): boolean {
  if (b.length < 4) return false
  if (startsWith(b, [137, 80, 78, 71, 13, 10, 26, 10])) return true
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return true
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return true
  return b.length >= 6 && startsWith(b, ascii('GIF8')) && (b[4] === 55 || b[4] === 57) && b[5] === 97
}

type Encoding = 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be'

function utf16(b: Uint8Array): Encoding | undefined {
  if (b.length < 4) return undefined
  if (b[0] === 255 && b[1] === 254 && !(b[2] === 0 && b[3] === 0)) return 'utf16le'
  if (b[0] === 254 && b[1] === 255) return 'utf16be'
  const samples = Math.min(50, Math.floor(b.length / 2))
  let little = 0
  let big = 0
  for (let index = 0; index < samples * 2 && index + 1 < b.length; index += 2) {
    if (b[index + 1] === 0 && isPrintable(b[index] ?? 0)) little += 1
    if (b[index] === 0 && isPrintable(b[index + 1] ?? 0)) big += 1
  }
  if (little > samples * 0.8) return 'utf16le'
  if (big > samples * 0.8) return 'utf16be'
  return undefined
}

function utf32(b: Uint8Array): Encoding | undefined {
  if (b.length < 8) return undefined
  if (b[0] === 0 && b[1] === 0 && b[2] === 254 && b[3] === 255) return 'utf32be'
  if (b[0] === 255 && b[1] === 254 && b[2] === 0 && b[3] === 0) return 'utf32le'
  const samples = Math.min(50, Math.floor(b.length / 4))
  let big = 0
  let little = 0
  for (let index = 0; index < samples * 4 && index + 3 < b.length; index += 4) {
    if (b[index] === 0 && b[index + 1] === 0 && b[index + 2] === 0 && isPrintable(b[index + 3] ?? 0)) big += 1
    if (b[index + 1] === 0 && b[index + 2] === 0 && b[index + 3] === 0 && isPrintable(b[index] ?? 0)) little += 1
  }
  if (big > samples * 0.8) return 'utf32be'
  if (little > samples * 0.8) return 'utf32le'
  return undefined
}

/** From the first 8,192 bytes (`getFormatForBuffer`): UTF-16 and UTF-32 are text; a NUL or one byte in twenty a control character is binary. */
export function readKind(header: Uint8Array): ReadKind {
  if (header.length === 0) return 'text'
  if (utf16(header) != null || utf32(header) != null) return 'text'
  if (isText(header)) return 'text'
  return isImage(header) ? 'image' : 'binary'
}

/** CRLF read as LF when one line end in twenty is CRLF (`determineLineEndingsForBuffer`). */
function mostlyCRLF(b: Uint8Array): boolean {
  let crlf = 0
  let lf = 0
  for (let index = 0; index < b.length; index += 1) {
    if (b[index] !== 10) continue
    if (index > 0 && b[index - 1] === 13) crlf += 1
    else lf += 1
  }
  if (crlf === 0 && lf === 0) return false
  return (crlf / (crlf + lf)) * 100 >= 5
}

function decodeWith(bytes: Uint8Array, encoding: Encoding): string | undefined {
  const data = Buffer.from(bytes)
  switch (encoding) {
    case 'utf16le':
      return data.subarray(0, data.length - (data.length % 2)).toString('utf16le')
    case 'utf16be': {
      const even = Buffer.from(data.subarray(0, data.length - (data.length % 2)))
      even.swap16()
      return even.toString('utf16le')
    }
    case 'utf32le':
    case 'utf32be': {
      let out = ''
      for (let i = 0; i + 3 < data.length; i += 4) {
        const point = encoding === 'utf32le' ? data.readUInt32LE(i) : data.readUInt32BE(i)
        if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return undefined
        out += String.fromCodePoint(point)
      }
      return out
    }
  }
}

/**
 * A text file's words (`readText`): UTF-16 or UTF-32 by their marks or
 * their zeros, else UTF-8, else Latin-1; a UTF-8 mark dropped. As on the
 * Mac, the window's guess at older encodings is not carried over: what is
 * not UTF-8 is read as Latin-1.
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string | undefined
  const wide = utf16(bytes) ?? utf32(bytes)
  if (wide) text = decodeWith(bytes, wide)
  if (text == null) {
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      text = Buffer.from(bytes).toString('latin1')
    }
  }
  if (text.startsWith('﻿')) text = text.slice(1)
  return mostlyCRLF(bytes) ? text.replace(/\r\n/g, '\n') : text
}

/** Lines in the text: one more than its newlines, and one for nothing (`countLines`). */
export function countLines(text: string): number {
  if (text === '') return 1
  let lines = 1
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lines += 1
  return lines
}

/** The lines asked for (`applyRange`): from `offset` (1 first, below 0 from the end), `limit` of them. */
export function readRange(
  content: string,
  totalLines: number,
  offset: number | undefined,
  limit: number | undefined,
): { content: string; applied: boolean } {
  if (offset == null && limit == null) return { content, applied: false }
  if (content === '') return { content, applied: false }
  const from = offset ?? 1
  const count = limit ?? (from < 0 ? Math.abs(from) : totalLines)
  const start = from < 0 ? Math.max(0, totalLines + from) : Math.max(0, from - 1)
  if (start >= totalLines) return { content, applied: false }
  const lines = content.split('\n')
  const end = Math.min(totalLines, start + count, lines.length)
  if (start >= end) return { content: '', applied: true }
  return { content: lines.slice(start, end).join('\n'), applied: true }
}

/** Text past 8 MiB characters is cut, and said to be (`MAX_TEXT_SIZE`); a half character at the cut becomes U+FFFD, as Swift writes it. */
export function capText(content: string): { content: string; truncated: boolean } {
  if (content.length <= LocalExec.textCap) return { content, truncated: false }
  let cut = content.slice(0, LocalExec.textCap)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = `${cut.slice(0, -1)}�`
  return { content: cut, truncated: true }
}

/** Why a binary file is not read (`binaryRejection`). */
export function binaryRefusal(file: string): string {
  const ext = extension(file)
  return ext === ''
    ? 'Binary files without an extension are not supported by the read executor'
    : `Binary files of type .${ext} are not supported by the read executor`
}

/** `file:` taken off and a leading `~` made the home folder, then relative to the root (`resolvePath`). */
export function resolveReadPath(
  target: string,
  root: string,
  home: string,
  flavor: PathFlavor = path,
): string {
  let value = target
  if (/^file:/i.test(value)) {
    try {
      value = fileURLToPath(value, { windows: flavor === path.win32 })
    } catch {
      value = value.replace(/^file:\/\//i, '')
    }
  }
  if (value === '~') value = home
  else if (value.startsWith('~/') || value.startsWith('~\\')) value = flavor.join(home, value.slice(2))
  return resolveAgainst(value, root, flavor)
}

/**
 * A command's terminal file, `<root>\terminals\<id>.txt`, which the
 * computer's AwaitExternalShell reads every 250 ms
 * (`background-shell-observability.ts`): the head between `---` lines,
 * rewritten in place, so its padding keeps it one length; the output as it
 * comes; the foot once it ends. Its lines end in a newline alone, as the
 * computer reads them.
 */
export const TerminalFile = {
  statusWidth: 9,
  runningWidth: 9,

  /** `"…"` with `\`, `"`, newlines, returns and tabs escaped (`escapeYamlString`). */
  escape(value: string): string {
    let out = '"'
    for (const character of value) {
      switch (character) {
        case '\\':
          out += '\\\\'
          break
        case '"':
          out += '\\"'
          break
        case '\n':
          out += '\\n'
          break
        case '\r':
          out += '\\r'
          break
        case '\t':
          out += '\\t'
          break
        default:
          out += character
      }
    }
    return `${out}"`
  },

  pad(value: string, width: number): string {
    return value.length >= width ? value : value + ' '.repeat(width - value.length)
  },

  iso(date: Date): string {
    return date.toISOString()
  },

  /** The head: `running`, `succeeded`, `failed` or `aborted`. */
  head(fields: {
    pid?: number
    cwd: string
    command: string
    title?: string
    status: string
    startedAt: Date
    runningForMs: number
  }): string {
    const lines = ['---']
    if (fields.pid != null && fields.pid !== 0) lines.push(`pid: ${fields.pid}`)
    lines.push(`cwd: ${TerminalFile.escape(fields.cwd)}`)
    lines.push(`command: ${TerminalFile.escape(fields.command)}`)
    if (fields.title != null && fields.title.trim() !== '')
      lines.push(`title: ${TerminalFile.escape(fields.title)}`)
    lines.push(`status: ${TerminalFile.pad(fields.status, TerminalFile.statusWidth)}`)
    lines.push(`started_at: ${TerminalFile.iso(fields.startedAt)}`)
    lines.push(`running_for_ms: ${TerminalFile.pad(String(fields.runningForMs), TerminalFile.runningWidth)}`)
    lines.push('---')
    return `${lines.join('\n')}\n`
  },

  /** The foot once it ended: its code (or the error), how long, when. */
  foot(fields: { exitCode?: number | null; error?: string; elapsedMs: number; endedAt: Date }): string {
    const first =
      fields.error != null
        ? `error: ${TerminalFile.escape(fields.error)}`
        : `exit_code: ${fields.exitCode == null ? 'unknown' : String(fields.exitCode)}`
    return `\n---\n${first}\nelapsed_ms: ${fields.elapsedMs}\nended_at: ${TerminalFile.iso(fields.endedAt)}\n---\n`
  },
}
