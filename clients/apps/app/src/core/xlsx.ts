// An Excel workbook (.xlsx) read for the preview, by our own code: the
// window read it with SheetJS, whose copy on npm has known security holes
// (docs/web-app/PROGRESS.md), and the Mac shows it with Quick Look. An .xlsx
// is a zip of XML files: the browser unzips them (`DecompressionStream`), a
// small reader takes the first sheet's cells, and each value is written as
// its number format says ("2026-07-01", "12.5%", "1,204.50"). The old binary
// .xls is not read.

import { type Sheet, tableColumns, tableRows } from './filePreview'

/** The most a workbook's parts may unzip to, all together: a small zip that unzips to gigabytes is refused. */
const unzippedCap = 120 * 1024 * 1024

// MARK: Unzipping

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  offset: number
}

const u16 = (bytes: Uint8Array, at: number) =>
  bytes[at]! | (bytes[at + 1]! << 8)
const u32 = (bytes: Uint8Array, at: number) =>
  (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)) +
  bytes[at + 3]! * 0x1000000

/** The zip's table of contents (its central directory); none when it is not a zip. */
function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> | undefined {
  // The end record is in the last 22 bytes, or before a comment of up to 64 KB.
  let end = -1
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 22 - 65_535);
    at -= 1
  )
    if (u32(bytes, at) === 0x06054b50) {
      end = at
      break
    }
  if (end < 0) return undefined
  const count = u16(bytes, end + 10)
  let at = u32(bytes, end + 16)
  const names = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50)
      return undefined
    const nameLength = u16(bytes, at + 28)
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    entries.set(name, {
      name,
      method: u16(bytes, at + 10),
      compressedSize: u32(bytes, at + 20),
      size: u32(bytes, at + 24),
      offset: u32(bytes, at + 42),
    })
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32)
  }
  return entries
}

/** One part's bytes, unzipped; none when it can't be, or would pass what is left of the cap. */
async function unzip(
  bytes: Uint8Array,
  entry: ZipEntry,
  budget: { left: number },
): Promise<Uint8Array | undefined> {
  const header = entry.offset
  if (header + 30 > bytes.length || u32(bytes, header) !== 0x04034b50)
    return undefined
  const start = header + 30 + u16(bytes, header + 26) + u16(bytes, header + 28)
  const packed = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) {
    if (packed.length > budget.left) return undefined
    budget.left -= packed.length
    return packed
  }
  if (entry.method !== 8) return undefined
  const stream = new Blob([packed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const pieces: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > budget.left) {
        await reader.cancel()
        return undefined
      }
      pieces.push(value)
    }
  } catch {
    return undefined
  }
  budget.left -= length
  const all = new Uint8Array(length)
  let offset = 0
  for (const piece of pieces) {
    all.set(piece, offset)
    offset += piece.length
  }
  return all
}

// MARK: Reading XML

/** One element as the reader meets it: its local name (no prefix), attributes, and whether it closes at once. */
interface Tag {
  name: string
  attributes: Record<string, string>
  closing: boolean
  empty: boolean
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** XML's escapes undone (`&amp;`, `&#233;`, `&#xE9;`). */
export function unescapeXML(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (whole, code: string) => {
      if (code[0] === '#') {
        const value =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10)
        return Number.isFinite(value) && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : whole
      }
      return entities[code] ?? whole
    },
  )
}

const localName = (name: string) => name.slice(name.indexOf(':') + 1)

/** The elements and words of an XML text, in order: comments, declarations and CDATA's markers left out. */
function* xml(text: string): Generator<Tag | string> {
  let at = 0
  while (at < text.length) {
    const open = text.indexOf('<', at)
    if (open < 0) {
      yield unescapeXML(text.slice(at))
      return
    }
    if (open > at) yield unescapeXML(text.slice(at, open))
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open)
      at = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open)
      yield text.slice(open + 9, end < 0 ? text.length : end)
      at = end < 0 ? text.length : end + 3
      continue
    }
    const close = text.indexOf('>', open)
    if (close < 0) return
    const inside = text.slice(open + 1, close)
    at = close + 1
    if (inside[0] === '?' || inside[0] === '!') continue
    const closing = inside[0] === '/'
    const empty = inside.endsWith('/')
    const body = inside.slice(closing ? 1 : 0, empty ? -1 : undefined)
    const space = body.search(/\s/)
    const name = localName(space < 0 ? body : body.slice(0, space))
    const attributes: Record<string, string> = {}
    if (space >= 0)
      for (const match of body
        .slice(space)
        .matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
        attributes[localName(match[1]!)] = unescapeXML(
          match[2] ?? match[3] ?? '',
        )
    yield { name, attributes, closing, empty }
  }
}

// MARK: Number formats

/** Excel's built-in formats a workbook names by number (SheetJS's table, for the ones a person meets). */
const builtInFormats: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'm/d/yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
}

/** A format's code without its quoted words, escapes and brackets: what tells a date from a number. */
const bare = (code: string) =>
  code.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, '')

export function isDateFormat(code: string): boolean {
  if (/general/i.test(code)) return false
  return /[dmyhs]/i.test(bare(code).replace(/E[+-]/gi, ''))
}

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const two = (value: number) => String(value).padStart(2, '0')

/** A serial date as Excel counts it (days since 30 December 1899, or since 1904 in a workbook that says so) written in `code`. */
export function formatDate(
  serial: number,
  code: string,
  date1904 = false,
): string {
  const whole = Math.floor(serial)
  // Excel's 1900 counts a 29 February that never was: serials before it are a day ahead.
  const dayNumber = date1904 ? whole + 1462 : whole < 61 ? whole + 1 : whole
  const date = new Date(Date.UTC(1899, 11, 30) + dayNumber * 86_400_000)
  let seconds = Math.round((serial - whole) * 86_400)
  if (seconds >= 86_400) seconds = 86_399
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const section = code.split(';')[0] ?? code
  const twelve = /AM\/PM|A\/P/i.test(section)
  const tokens =
    section.match(
      /"[^"]*"|\\.|\[[hms]+\]|\[[^\]]*\]|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+|./gi,
    ) ?? []
  let out = ''
  tokens.forEach((token, index) => {
    const lower = token.toLowerCase()
    // "m" is minutes after an hour or before seconds.
    const before = tokens
      .slice(0, index)
      .reverse()
      .find((t) => /^[a-z]/i.test(t) || /^\[[hms]/i.test(t))
    const after = tokens
      .slice(index + 1)
      .find((t) => /^[a-z]/i.test(t) || /^\[[hms]/i.test(t))
    const minutesHere =
      (lower === 'm' || lower === 'mm') &&
      ((before != null && /^\[?h/i.test(before)) ||
        (after != null && /^s/i.test(after)))
    if (token.startsWith('"')) out += token.slice(1, -1)
    else if (token.startsWith('\\')) out += token.slice(1)
    else if (/^\[h+\]$/i.test(token)) out += String(Math.floor(serial * 24))
    else if (/^\[m+\]$/i.test(token)) out += String(Math.floor(serial * 1440))
    else if (/^\[s+\]$/i.test(token)) out += String(Math.round(serial * 86_400))
    else if (token.startsWith('[')) out += ''
    else if (lower === 'yyyy') out += String(date.getUTCFullYear())
    else if (lower === 'yy') out += two(date.getUTCFullYear() % 100)
    else if (minutesHere) out += lower === 'mm' ? two(minutes) : String(minutes)
    else if (lower === 'mmmmm') out += months[date.getUTCMonth()]![0]
    else if (lower === 'mmmm') out += months[date.getUTCMonth()]
    else if (lower === 'mmm') out += months[date.getUTCMonth()]!.slice(0, 3)
    else if (lower === 'mm') out += two(date.getUTCMonth() + 1)
    else if (lower === 'm') out += String(date.getUTCMonth() + 1)
    else if (lower === 'dddd') out += days[date.getUTCDay()]
    else if (lower === 'ddd') out += days[date.getUTCDay()]!.slice(0, 3)
    else if (lower === 'dd') out += two(date.getUTCDate())
    else if (lower === 'd') out += String(date.getUTCDate())
    else if (lower === 'hh' || lower === 'h') {
      const shown = twelve ? hours % 12 || 12 : hours
      out += lower === 'hh' ? two(shown) : String(shown)
    } else if (lower === 'ss') out += two(secs)
    else if (lower === 's') out += String(secs)
    else if (lower === 'am/pm') out += hours < 12 ? 'AM' : 'PM'
    else if (lower === 'a/p') out += hours < 12 ? 'A' : 'P'
    else if (token.startsWith('.0')) out += '.' + '0'.repeat(token.length - 1)
    else out += token
  })
  return out
}

/** A number as Excel's General writes it: at most 11 significant digits, no trailing zeros. */
export function general(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value) && Math.abs(value) < 1e11) return String(value)
  const shown = Number(value.toPrecision(11))
  return Math.abs(shown) >= 1e11 || (shown !== 0 && Math.abs(shown) < 1e-9)
    ? shown.toExponential().replace('e', 'E')
    : String(shown)
}

/** A number written in a number format's first sections (positive, negative): its words, decimals, thousands and percent. */
export function formatNumber(value: number, code: string): string {
  const sections = code.split(';')
  const negative = value < 0 && sections.length > 1
  const section = (negative ? sections[1] : sections[0]) ?? ''
  if (/general/i.test(section))
    return (value < 0 && !negative ? '-' : '') + general(Math.abs(value))
  if (section.trim() === '@') return general(value)
  const percent = (bare(section).match(/%/g) ?? []).length
  let shown = Math.abs(value) * 100 ** percent
  // The pattern: its digits, the point and its decimals, thousands, and a scale for each trailing comma.
  const pattern =
    bare(section).match(/[0#?][0#?,]*(?:\.[0#?]*)?|\.[0#?]+/)?.[0] ?? ''
  const decimals = (pattern.split('.')[1] ?? '').replace(/[^0#?]/g, '').length
  const scaleCommas =
    (pattern.split('.')[0] ?? '').match(/,+$/)?.[0].length ?? 0
  shown /= 1000 ** scaleCommas
  const thousands = /[0#?],[0#?]/.test(pattern)
  const exponent = /E[+-]/i.test(bare(section))
  let digits: string
  if (exponent) {
    const [mantissa, power] = shown.toExponential(decimals).split('e')
    const places = bare(section).match(/E[+-]([0#?]+)/i)?.[1]?.length ?? 2
    const n = Number(power)
    digits = `${mantissa}E${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(places, '0')}`
  } else {
    digits = (Math.round(shown * 10 ** decimals) / 10 ** decimals).toFixed(
      decimals,
    )
    if (thousands) {
      const [whole, fraction] = digits.split('.')
      digits =
        whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
        (fraction ? '.' + fraction : '')
    }
    // "#" before the point shows no lone zero ("#.00" writes .50).
    if (/^#+\./.test(pattern) && digits.startsWith('0.'))
      digits = digits.slice(1)
  }
  // The words around the number: quoted, escaped, a currency in brackets ("[$€-407]"), and the percent sign.
  let before = ''
  let after = ''
  let seen = false
  for (const token of section.match(
    /"[^"]*"|\\.|\[\$[^\]]*\]|\[[^\]]*\]|_.|\*.|[0#?.,]+|E[+-][0#?]+|./gi,
  ) ?? []) {
    let words = ''
    if (/^[0#?.,]+$/.test(token) || /^E[+-]/i.test(token)) {
      seen = true
      continue
    }
    if (token.startsWith('"')) words = token.slice(1, -1)
    else if (token.startsWith('\\')) words = token.slice(1)
    else if (token.startsWith('[$'))
      words = token.slice(2, -1).split('-')[0] ?? ''
    else if (token.startsWith('[')) words = ''
    else if (token.startsWith('_')) words = ' '
    else if (token.startsWith('*')) words = ''
    else words = token
    if (seen) after += words
    else before += words
  }
  const sign = value < 0 && !negative ? '-' : ''
  return sign + before + digits + after
}

/** A cell's value written as its format says. */
export function formatValue(
  value: number,
  code: string,
  date1904 = false,
): string {
  if (isDateFormat(code)) return formatDate(value, code, date1904)
  return formatNumber(value, code)
}

// MARK: The workbook

/** "BC" is column 54 (from 0: 54), the column part of "BC12". */
export function columnIndex(reference: string): number {
  let index = 0
  for (const letter of reference.toUpperCase()) {
    const code = letter.charCodeAt(0)
    if (code < 65 || code > 90) break
    index = index * 26 + (code - 64)
  }
  return index - 1
}

const rowOf = (reference: string) => {
  const digits = reference.match(/\d+/)?.[0]
  return digits ? parseInt(digits, 10) : undefined
}

/** A path in the workbook from where its rels file points (`worksheets/sheet1.xml` from `xl/`, or `/xl/...`). */
function resolved(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/')
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}

/**
 * The first sheet of an .xlsx (`mvn`'s workbook, as SheetJS read it for the
 * window): its name, its rows from its first cell (blank rows kept, 2000 at
 * most, 200 columns), each value written as its format says, and how many
 * rows it has. None when the file is not a workbook this reads.
 */
export async function readXlsx(
  data: Uint8Array,
  limit = unzippedCap,
): Promise<Sheet | undefined> {
  const entries = zipEntries(data)
  if (!entries) return undefined
  const budget = { left: limit }
  const read = async (name: string) => {
    const entry = entries.get(name)
    if (!entry) return undefined
    const bytes = await unzip(data, entry, budget)
    return bytes ? new TextDecoder().decode(bytes) : undefined
  }

  const workbook = await read('xl/workbook.xml')
  if (!workbook) return undefined
  let first: { name: string; id: string } | undefined
  let date1904 = false
  for (const piece of xml(workbook)) {
    if (typeof piece === 'string' || piece.closing) continue
    if (piece.name === 'workbookPr')
      date1904 = ['1', 'true'].includes(piece.attributes.date1904 ?? '')
    if (piece.name === 'sheet' && !first)
      first = {
        name: piece.attributes.name ?? '',
        id: piece.attributes.id ?? '',
      }
  }
  if (!first) return undefined

  let sheetPath = 'xl/worksheets/sheet1.xml'
  let stringsPath = 'xl/sharedStrings.xml'
  let stylesPath = 'xl/styles.xml'
  const rels = await read('xl/_rels/workbook.xml.rels')
  if (rels)
    for (const piece of xml(rels)) {
      if (typeof piece === 'string' || piece.name !== 'Relationship') continue
      const target = resolved('xl', piece.attributes.Target ?? '')
      const type = piece.attributes.Type ?? ''
      if (piece.attributes.Id === first.id) sheetPath = target
      else if (type.endsWith('/sharedStrings')) stringsPath = target
      else if (type.endsWith('/styles')) stylesPath = target
    }

  // The shared words, each its runs' words together.
  const shared: string[] = []
  const strings = await read(stringsPath)
  if (strings) {
    let current: string | undefined
    let inText = false
    let phonetic = 0
    for (const piece of xml(strings)) {
      if (typeof piece === 'string') {
        if (inText && phonetic === 0 && current != null) current += piece
        continue
      }
      if (piece.name === 'si') {
        if (!piece.closing) current = ''
        if (piece.closing || piece.empty) {
          shared.push(current ?? '')
          current = undefined
        }
      } else if (piece.name === 'rPh') {
        if (!piece.empty) phonetic += piece.closing ? -1 : 1
      } else if (piece.name === 't') inText = !piece.closing && !piece.empty
    }
  }

  // Each style's number format.
  const formats: string[] = []
  const styles = await read(stylesPath)
  if (styles) {
    const custom = new Map<number, string>()
    let inCellXfs = false
    for (const piece of xml(styles)) {
      if (typeof piece === 'string') continue
      if (piece.name === 'numFmt' && !piece.closing)
        custom.set(
          Number(piece.attributes.numFmtId),
          piece.attributes.formatCode ?? 'General',
        )
      else if (piece.name === 'cellXfs')
        inCellXfs = !piece.closing && !piece.empty
      else if (piece.name === 'xf' && inCellXfs && !piece.closing) {
        const id = Number(piece.attributes.numFmtId ?? 0)
        formats.push(custom.get(id) ?? builtInFormats[id] ?? 'General')
      }
    }
  }

  const sheet = await read(sheetPath)
  if (!sheet) return undefined
  const cells = new Map<number, Map<number, string>>()
  let firstRow = Number.MAX_SAFE_INTEGER
  let firstColumn = Number.MAX_SAFE_INTEGER
  let lastRow = 0
  let dimension: { row: number; column: number } | undefined
  let row = 0
  let cell: { column: number; type: string; style: number } | undefined
  let field: 'v' | 't' | undefined
  let value = ''
  let inline = ''
  let nextColumn = 0
  for (const piece of xml(sheet)) {
    if (typeof piece === 'string') {
      if (field === 'v') value += piece
      else if (field === 't') inline += piece
      continue
    }
    if (piece.name === 'dimension' && !piece.closing) {
      const start = (piece.attributes.ref ?? '').split(':')[0] ?? ''
      const startRow = rowOf(start)
      if (startRow)
        dimension = { row: startRow, column: Math.max(0, columnIndex(start)) }
    } else if (piece.name === 'row' && !piece.closing) {
      row = Number(piece.attributes.r ?? row + 1)
      nextColumn = 0
    } else if (piece.name === 'c') {
      if (!piece.closing) {
        const reference = piece.attributes.r
        const column = reference ? columnIndex(reference) : nextColumn
        nextColumn = column + 1
        cell = {
          column,
          type: piece.attributes.t ?? 'n',
          style: Number(piece.attributes.s ?? 0),
        }
        value = ''
        inline = ''
      }
      if (piece.closing || piece.empty) {
        if (cell) {
          let words: string
          const raw = value.trim()
          if (cell.type === 's') words = shared[Number(raw)] ?? ''
          else if (cell.type === 'inlineStr') words = inline
          else if (cell.type === 'str' || cell.type === 'e') words = value
          else if (cell.type === 'b')
            words = raw === '1' ? 'TRUE' : raw === '' ? '' : 'FALSE'
          else if (raw === '') words = ''
          else {
            const number = Number(raw)
            words = Number.isFinite(number)
              ? formatValue(number, formats[cell.style] ?? 'General', date1904)
              : raw
          }
          // Kept: the rows the preview can show, and the first 4096 columns (a sheet's columns go to 16,384).
          if (
            words !== '' &&
            row <= tableRows + (dimension?.row ?? 1) &&
            cell.column < 4096
          ) {
            const line = cells.get(row) ?? new Map<number, string>()
            line.set(cell.column, words)
            cells.set(row, line)
            firstRow = Math.min(firstRow, row)
            firstColumn = Math.min(firstColumn, cell.column)
          }
          if (words !== '') lastRow = Math.max(lastRow, row)
        }
        cell = undefined
      }
    } else if (piece.name === 'v')
      field = piece.closing || piece.empty ? undefined : 'v'
    else if (piece.name === 't' && cell)
      field = piece.closing || piece.empty ? undefined : 't'
  }

  const name = first.name
  if (cells.size === 0) return { name, rows: [], totalRows: 0 }
  const topRow = Math.min(dimension?.row ?? firstRow, firstRow)
  const leftColumn = Math.min(dimension?.column ?? firstColumn, firstColumn)
  let lastColumn = leftColumn
  for (const line of cells.values())
    for (const column of line.keys()) lastColumn = Math.max(lastColumn, column)
  const width = Math.min(tableColumns, lastColumn - leftColumn + 1)
  const rows: string[][] = []
  for (let at = topRow; at <= lastRow && rows.length < tableRows; at += 1) {
    const line = cells.get(at)
    rows.push(
      Array.from(
        { length: width },
        (_, offset) => line?.get(leftColumn + offset) ?? '',
      ),
    )
  }
  return { name, rows, totalRows: lastRow - topRow + 1 }
}
