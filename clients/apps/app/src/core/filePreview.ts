// What the preview does with a file (SimeonCore's FilePreview.swift, from the
// window's own `file-preview-kind.ts`, `media-extensions.ts` and
// `attachment-preview.ts`, and the shipped window's table, JSON and picture
// viewers): a file's kind from its name, whether its card opens a preview,
// the pieces of a name, a text file's words, a CSV's rows, and the lines
// the viewers write.

import { t } from './l10n'
import { wordsLanguage } from './words'

/** How a file opens (`getFilePreviewKind`). */
export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'table'
  | 'json'
  | 'markdown'
  | 'docx'
  | 'text'
  | 'unknown'

/** The most the preview reads of a file (`ATTACHMENT_PREVIEW_BYTE_CAP`): larger shows "too large". */
export const byteCap = 25 * 1024 * 1024
/** The most of a text file shown (`ETe`, in UTF-16 units); the head then says "Showing the start of this file". */
export const textCap = 1_500_000
/** A spreadsheet's rows and columns shown (`gvn`, `yvn`). */
export const tableRows = 2000
export const tableColumns = 200
/** A JSON object's or list's entries shown before "… N more" (`Lkn`). */
export const jsonEntries = 200

const images = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])
const videos = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm'])
const audio = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'weba',
])
const tables = new Set(['csv', 'tsv', 'xlsx', 'xls'])
const markdown = new Set(['md', 'markdown', 'mdx'])
const texts = new Set(
  (
    'txt text log md markdown mdx rst adoc tex json jsonc json5 ndjson csv tsv ' +
    'xml yaml yml toml ini cfg conf env properties plist gradle html htm css scss ' +
    'sass less svg js jsx mjs cjs ts tsx mts cts py pyi rb go rs java kt ' +
    'kts c h cc cpp cxx hpp hh cs php swift scala dart lua pl pm r sql ' +
    'graphql gql proto vue svelte astro sh bash zsh fish bat ps1 tf tfvars ' +
    'dockerfile diff patch'
  ).split(' '),
)
/** The language highlight.js colours a file in (`Awn`). */
const languages: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  ndjson: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'properties',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  vue: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  bat: 'dos',
  ps1: 'powershell',
  tf: 'terraform',
  tfvars: 'terraform',
  dockerfile: 'dockerfile',
  diff: 'diff',
  patch: 'diff',
}

/** A name's extension in small letters, none for none (`attachmentExtension`: the last dot of the last part, not first or last). */
export function fileExtension(nameOrPath: string): string | undefined {
  const base = nameOrPath.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot + 1).toLowerCase()
}

export function fileKind(nameOrPath: string): FileKind {
  const ext = fileExtension(nameOrPath)
  if (ext == null) return 'unknown'
  if (images.has(ext)) return 'image'
  if (videos.has(ext)) return 'video'
  if (audio.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (tables.has(ext)) return 'table'
  if (ext === 'json') return 'json'
  if (markdown.has(ext)) return 'markdown'
  if (ext === 'docx') return 'docx'
  if (texts.has(ext)) return 'text'
  return 'unknown'
}

/** The highlight.js language for a file, none to show it plain (`Pwn`). */
export function fileLanguage(nameOrPath: string): string | undefined {
  const ext = fileExtension(nameOrPath)
  return ext == null ? undefined : languages[ext]
}

/**
 * Whether a file card opens a preview (`Nvn`'s `B`): never for an unknown
 * kind; text, Markdown and JSON only once the computer has read them as
 * text (`readsAsText`, unknown until it answers).
 */
export function opensPreview(kind: FileKind, readsAsText?: boolean): boolean {
  switch (kind) {
    case 'unknown':
      return false
    case 'text':
    case 'markdown':
    case 'json':
      return readsAsText === true
    default:
      return true
  }
}

/** "Launch review" and ".docx" (`Nft`): no extension for a leading or trailing dot. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

/** `%20` read as a space; the text as it is when it is not a valid escape. */
function unescaped(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The last part of a path or address, `%20` read as a space (`R5e`). */
export function lastPart(source: string): string {
  let path = source
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    try {
      const url = new URL(source)
      if (url.pathname !== '') path = url.pathname
    } catch {
      // Not an address: the text is the path.
    }
  }
  path = unescaped(path)
  return path.split(/[/\\]/).filter(Boolean).pop() ?? source
}

/** Where a file is on the computer: a `file://` address's path, or the path as it is. */
export function computerPath(url: string): string {
  if (!url.startsWith('file://')) return url
  try {
    return unescaped(new URL(url).pathname)
  } catch {
    return url.slice(7)
  }
}

/**
 * The name Save offers (`resolveSuggestedDownloadName`): the card's when its
 * kind matches the file's (or the file is `.bin` and the name has no kind),
 * else the file's own, else "download".
 */
export function downloadName(suggested: string, file: string): string {
  const own = lastPart(file)
  const ownKind = fileExtension(own) ?? ''
  const suggestedKind = fileExtension(suggested) ?? ''
  const trimmed = suggested.trim()
  if (
    trimmed !== '' &&
    (suggestedKind === ownKind || (ownKind === 'bin' && suggestedKind === ''))
  )
    return trimmed
  if (own !== '' && own !== '/') return own
  return 'download'
}

// MARK: The picture viewer

/** Its caption (`c7n`): the caption or the file's name, then "2 / 3" when there are several. */
export function mediaCaption(
  caption: string | undefined,
  name: string | undefined,
  source: string,
  index: number,
  total: number,
): string {
  // A stored copy's fingerprint says nothing to the person: the count alone (12 November 2026).
  const words =
    caption ??
    [name, lastPart(source)].find(
      (each): each is string => each != null && !isFingerprintName(each),
    ) ??
    ''
  const count = total > 1 ? `${index + 1} / ${total}` : ''
  if (words === '') return count
  return count === '' ? words : `${words} · ${count}`
}

/**
 * A name made from a file's contents, as the computer keeps the person's
 * pictures ("8a67a733…1ded.png"): 32 or more hexadecimal characters before
 * the extension (`FilePreview.isFingerprintName`).
 */
export function isFingerprintName(name: string): boolean {
  return /^[0-9a-f]{32,}$/i.test(splitName(name).base)
}

/** Previous and next wrap round (`ove`). */
export function wrap(index: number, count: number): number {
  return count > 0 ? ((index % count) + count) % count : 0
}

// MARK: Text

/**
 * A text file's words (`FileViewer.text`): read as UTF-8 whatever it
 * holds, cut at 1.5 million characters, and whether it was cut. A cut
 * inside a character (between "\r" and "\n", inside an emoji) falls back
 * to its start.
 */
export function previewText(data: Uint8Array): { text: string; cut: boolean } {
  const words = new TextDecoder().decode(data)
  if (words.length <= textCap) return { text: words, cut: false }
  let end = textCap
  const before = words.charCodeAt(end - 1)
  if (before >= 0xd800 && before <= 0xdbff) end -= 1
  else if (before === 0x0d && words.charCodeAt(end) === 0x0a) end -= 1
  return { text: words.slice(0, end), cut: true }
}

// MARK: Spreadsheets (csv and tsv)

/** The first line with anything in it, lines split at "\n" with a "\r" before it dropped (`split(/\r?\n/)`). */
function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const kept = line.endsWith('\r') ? line.slice(0, -1) : line
    if (kept !== '') return kept
  }
  return ''
}

function separators(line: string, separator: string): number {
  let count = 0
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const unit = line[index]
    if (unit === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1
        continue
      }
      quoted = !quoted
    } else if (!quoted && unit === separator) count += 1
  }
  return count
}

/** The separator a file's first line uses most (`uvn`): the file's own (tab for .tsv), or a comma, tab, semicolon or bar. */
export function delimiter(text: string, name: string): string {
  const preferred = fileExtension(name) === 'tsv' ? '\t' : ','
  const first = firstLine(text)
  let best = preferred
  let most = -1
  for (const candidate of [preferred, ',', '\t', ';', '|']) {
    const count = separators(first, candidate)
    if (count > most) {
      best = candidate
      most = count
    }
  }
  return most > 0 ? best : preferred
}

/** The rows of a CSV (`lvn`): quotes, doubled quotes, and line ends of either kind; at most `maxRows`. */
export function csvRows(
  text: string,
  separator: string,
  maxRows = Number.MAX_SAFE_INTEGER,
): string[][] {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let quoted = false
  let started = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
    started = false
  }
  let index = 0
  while (index < text.length && rows.length < maxRows) {
    const unit = text[index]!
    if (quoted) {
      if (unit === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += unit
    } else if (unit === '"') {
      quoted = true
      started = true
    } else if (unit === separator) {
      started = true
      endCell()
    } else if (unit === '\n') endRow()
    else if (unit === '\r') {
      if (text[index + 1] === '\n') index += 1
      endRow()
    } else {
      cell += unit
      started = true
    }
    index += 1
  }
  if (rows.length < maxRows && (started || cell !== '' || row.length > 0))
    endRow()
  return rows
}

/** How many rows the whole file has, its heading row included (`cvn`). */
export function rowCount(text: string): number {
  let count = 0
  let quoted = false
  let pending = false
  for (let index = 0; index < text.length; index += 1) {
    const unit = text[index]
    if (unit === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1
        continue
      }
      quoted = !quoted
      pending = true
    } else if (!quoted && (unit === '\n' || unit === '\r')) {
      if (unit === '\r' && text[index + 1] === '\n') index += 1
      count += 1
      pending = false
    } else pending = true
  }
  return pending ? count + 1 : count
}

/** A sheet read for the preview (`mvn`): its first rows, and how many it has. */
export interface Sheet {
  name: string
  rows: string[][]
  totalRows: number
}

export function readSheet(text: string, name: string): Sheet {
  const rows = csvRows(text, delimiter(text, name), tableRows)
  return {
    name: t('Sheet 1'),
    rows,
    totalRows: rows.length < tableRows ? rows.length : rowCount(text),
  }
}

/** A whole number with the language's grouping ("1,204", "1 204"). */
function grouped(value: number): string {
  try {
    return new Intl.NumberFormat(wordsLanguage()).format(value)
  } catch {
    return String(value)
  }
}

/** "3 rows", "1 row", "1,204 rows" under the name: the rows less the heading row (`kvn`). */
export function rowsLine(totalRows: number): string {
  const rows = Math.max(0, totalRows - 1)
  const number = grouped(rows)
  return rows === 1 ? t`${number} row` : t`${number} rows`
}

/** A cell's detail heading (`wvn`): "Revenue · row 2", "Column 3 · header". */
export function cellLabel(
  column: number,
  row: number,
  heading: string,
): string {
  const name = heading === '' ? t`Column ${column + 1}` : heading
  return row < 0 ? t`${name} · header` : t`${name} · row ${row + 1}`
}

/** "2 pages", "1 page" (`evn`). */
export function pagesLine(pages: number): string {
  return pages === 1 ? t('1 page') : t`${pages} pages`
}

// MARK: JSON

/** An object's or list's size beside its name (`_kn`): "[2 items]", "{1 key}". */
export function jsonSummary(isList: boolean, count: number): string {
  if (isList) return count === 1 ? t('[1 item]') : t`[${count} items]`
  return count === 1 ? t('{1 key}') : t`{${count} keys}`
}
