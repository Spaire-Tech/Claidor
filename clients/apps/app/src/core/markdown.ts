// An agent's message as blocks, the way the Mac lays it out (`Markdown` in
// ios/SimeonCore/Sources/SimeonCore/Markdown.swift, after the window's
// react-markdown with GitHub's extensions): headings, paragraphs, lists
// (bullets, numbers, tasks, nested), quotes, fenced code, tables, rules and
// maths. The text inside a block stays Markdown; `inlineRuns` reads its bold,
// italics, code, links and strikethrough within a line, as the Mac's
// `MessageLine` reads them (Foundation's inline-only Markdown, then GitHub's
// bare links).

export type MarkdownAlignment = 'leading' | 'center' | 'trailing'

export interface MarkdownListItem {
  /** A task list's box: checked, unchecked, or none. */
  checked?: boolean
  blocks: MarkdownBlock[]
}

export type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownListItem[] }
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'code'; language?: string; text: string }
  | {
      type: 'table'
      header: string[]
      alignments: MarkdownAlignment[]
      rows: string[][]
    }
  | { type: 'rule' }
  /** TeX on its own lines: between `$$` lines, or a ```` ```math ```` fence (remark-math's display maths). */
  | { type: 'math'; text: string }

/** Spaces and tabs at both ends, as Swift's `.whitespaces` trims a line. */
function trimmed(line: string): string {
  return line.replace(/^[^\S\n]+|[^\S\n]+$/g, '')
}

const cache = new Map<string, MarkdownBlock[]>()

/** A message's blocks, parsed once: a bubble asks again on every redraw. */
export function cachedBlocks(text: string): MarkdownBlock[] {
  const hit = cache.get(text)
  if (hit) return hit
  const parsed = markdownBlocks(text)
  if (cache.size > 600) cache.clear()
  cache.set(text, parsed)
  return parsed
}

export function markdownBlocks(text: string): MarkdownBlock[] {
  return new Parser(text.replace(/\r\n/g, '\n').split('\n')).blocks()
}

/** Whether a message is exactly one fenced block of `language` (the flights card's rule), and its body. */
export function soleFence(text: string, language: string): string | undefined {
  const whole = text.trim()
  if (
    !whole.startsWith('```' + language) ||
    !whole.endsWith('```') ||
    [...whole].length <= [...language].length + 6
  )
    return undefined
  const firstBreak = whole.indexOf('\n')
  if (firstBreak < 0) return undefined
  if (trimmed(whole.slice(3, firstBreak)) !== language) return undefined
  const body = whole.slice(firstBreak + 1, whole.length - 3)
  if (body.includes('```')) return undefined
  return body.replace(/^\n+|\n+$/g, '')
}

/**
 * A paragraph with maths in it, cut into its words and its maths, in order
 * (the window's remark-math): `$$…$$` (the closing run of `$` as long as the
 * opening one; a single `$` is a dollar), `\(…\)` and `\[…\]` within a line;
 * undefined when it has none. A space on both sides of the maths is padding.
 */
export function inlineMath(
  text: string,
): { math: boolean; text: string }[] | undefined {
  if (!text.includes('$$') && !text.includes('\\(') && !text.includes('\\['))
    return undefined
  const chars = [...text]
  const parts: { math: boolean; text: string }[] = []
  let plain = ''
  let index = 0
  const flushPlain = () => {
    if (plain !== '') {
      parts.push({ math: false, text: plain })
      plain = ''
    }
  }
  while (index < chars.length) {
    const previous = index > 0 ? chars[index - 1] : undefined
    if (chars[index] === '$' && previous !== '$') {
      let run = 0
      while (index + run < chars.length && chars[index + run] === '$') run += 1
      const close =
        run >= 2 ? closingDollars(chars, index + run, run) : undefined
      if (close != null) {
        flushPlain()
        parts.push({
          math: true,
          text: padded(chars.slice(index + run, close).join('')),
        })
        index = close + run
        continue
      }
      plain += chars.slice(index, index + run).join('')
      index += run
      continue
    }
    if (
      chars[index] === '\\' &&
      previous !== '\\' &&
      index + 1 < chars.length &&
      (chars[index + 1] === '(' || chars[index + 1] === '[')
    ) {
      const closer = chars[index + 1] === '(' ? ')' : ']'
      let probe = index + 2
      let found: number | undefined
      while (probe + 1 < chars.length) {
        if (chars[probe] === '\\' && chars[probe + 1] === closer) {
          found = probe
          break
        }
        probe += 1
      }
      if (found != null) {
        flushPlain()
        parts.push({
          math: true,
          text: padded(chars.slice(index + 2, found).join('')),
        })
        index = found + 2
        continue
      }
    }
    plain += chars[index]
    index += 1
  }
  flushPlain()
  return parts.some((part) => part.math) ? parts : undefined
}

function closingDollars(
  chars: string[],
  start: number,
  run: number,
): number | undefined {
  let index = start
  while (index < chars.length) {
    if (chars[index] === '$') {
      let length = 0
      while (index + length < chars.length && chars[index + length] === '$')
        length += 1
      if (length === run) return index
      index += length
    } else {
      index += 1
    }
  }
  return undefined
}

/** remark-math's padding: a space or line break on both sides, around something, is left out. */
function padded(tex: string): string {
  const chars = [...tex]
  const first = chars[0]
  const last = chars[chars.length - 1]
  if (
    chars.length < 2 ||
    (first !== ' ' && first !== '\n') ||
    (last !== ' ' && last !== '\n') ||
    tex.trim() === ''
  )
    return tex
  return chars.slice(1, -1).join('')
}

interface Marker {
  indent: number
  ordered: boolean
  number: number
  contentStart: number
}

class Parser {
  private index = 0
  constructor(private readonly lines: string[]) {}

  /** The number of "$" opening a display block on this line: two or more, and no "$" after them (else it is a line's maths). */
  static dollarFence(line: string): number | undefined {
    const run = /^\$*/.exec(line)![0].length
    if (run < 2 || line.slice(run).includes('$')) return undefined
    return run
  }

  blocks(): MarkdownBlock[] {
    const out: MarkdownBlock[] = []
    let paragraph: string[] = []
    const flush = () => {
      if (paragraph.length > 0) {
        out.push({ type: 'paragraph', text: paragraph.join('\n') })
        paragraph = []
      }
    }
    const lines = this.lines
    while (this.index < lines.length) {
      const line = lines[this.index]!
      const t = trimmed(line)
      if (t === '') {
        flush()
        this.index += 1
        continue
      }
      const fence = Parser.fenceOpening(t)
      if (fence) {
        flush()
        this.index += 1
        const body: string[] = []
        while (
          this.index < lines.length &&
          !trimmed(lines[this.index]!).startsWith(fence.marker)
        ) {
          body.push(lines[this.index]!)
          this.index += 1
        }
        this.index += 1
        if (fence.language?.toLowerCase() === 'math')
          out.push({ type: 'math', text: body.join('\n') })
        else
          out.push({
            type: 'code',
            language: fence.language,
            text: body.join('\n'),
          })
        continue
      }
      // Display maths (remark-math): two or more "$" and no other "$" after them, up to a line of at least as many "$" alone
      // (or the end); or "\[" opening a line, up to a line "\]" alone, or "\[ … \]" on one.
      const dollars = Parser.dollarFence(t)
      if (dollars != null) {
        flush()
        this.index += 1
        const body: string[] = []
        while (this.index < lines.length) {
          const inner = trimmed(lines[this.index]!)
          if (inner.length >= dollars && /^\$+$/.test(inner)) {
            this.index += 1
            break
          }
          body.push(lines[this.index]!)
          this.index += 1
        }
        out.push({ type: 'math', text: body.join('\n') })
        continue
      }
      if (t.startsWith('\\[')) {
        const rest = t.slice(2)
        if (rest.includes('\\]')) {
          if (trimmed(rest).endsWith('\\]')) {
            flush()
            this.index += 1
            const inner = trimmed(rest).slice(0, -2)
            out.push({ type: 'math', text: trimmed(inner) })
            continue
          }
        } else {
          flush()
          this.index += 1
          const body: string[] = []
          const head = trimmed(rest)
          if (head !== '') body.push(head)
          while (this.index < lines.length) {
            if (trimmed(lines[this.index]!) === '\\]') {
              this.index += 1
              break
            }
            body.push(lines[this.index]!)
            this.index += 1
          }
          out.push({ type: 'math', text: body.join('\n') })
          continue
        }
      }
      const heading = Parser.heading(t)
      if (heading) {
        flush()
        out.push(heading)
        this.index += 1
        continue
      }
      if (Parser.isRule(t)) {
        flush()
        out.push({ type: 'rule' })
        this.index += 1
        continue
      }
      if (t.startsWith('>')) {
        flush()
        const quoted: string[] = []
        while (this.index < lines.length) {
          const inner = trimmed(lines[this.index]!)
          if (!inner.startsWith('>')) break
          let rest = inner.slice(1)
          if (rest.startsWith(' ')) rest = rest.slice(1)
          quoted.push(rest)
          this.index += 1
        }
        out.push({ type: 'quote', blocks: new Parser(quoted).blocks() })
        continue
      }
      if (Parser.listMarker(line)) {
        flush()
        out.push(this.list())
        continue
      }
      if (this.index + 1 < lines.length && t.includes('|')) {
        const alignments = Parser.tableDivider(lines[this.index + 1]!)
        if (alignments) {
          flush()
          out.push(this.table(alignments))
          continue
        }
      }
      paragraph.push(t)
      this.index += 1
    }
    flush()
    return out
  }

  static listMarker(line: string): Marker | undefined {
    const chars = [...line]
    let i = 0
    while (i < chars.length && chars[i] === ' ') i += 1
    const indent = i
    if (i >= chars.length) return undefined
    if (
      '-*+'.includes(chars[i]!) &&
      i + 1 < chars.length &&
      chars[i + 1] === ' '
    )
      return { indent, ordered: false, number: 1, contentStart: i + 2 }
    let digits = ''
    while (i < chars.length && /[0-9]/.test(chars[i]!) && digits.length < 9) {
      digits += chars[i]
      i += 1
    }
    if (
      digits !== '' &&
      i + 1 < chars.length &&
      (chars[i] === '.' || chars[i] === ')') &&
      chars[i + 1] === ' '
    )
      return {
        indent,
        ordered: true,
        number: Number(digits) || 1,
        contentStart: i + 2,
      }
    return undefined
  }

  private list(): MarkdownBlock {
    const lines = this.lines
    const first = Parser.listMarker(lines[this.index]!)!
    const items: MarkdownListItem[] = []
    for (;;) {
      if (this.index >= lines.length) break
      const marker = Parser.listMarker(lines[this.index]!)
      if (
        !marker ||
        marker.indent !== first.indent ||
        marker.ordered !== first.ordered
      )
        break
      let words = [...lines[this.index]!].slice(marker.contentStart).join('')
      let checked: boolean | undefined
      if (words.startsWith('[ ] ')) {
        checked = false
        words = words.slice(4)
      } else if (words.startsWith('[x] ') || words.startsWith('[X] ')) {
        checked = true
        words = words.slice(4)
      }
      this.index += 1
      const body = [words]
      // Continuation lines and nested lists: anything indented past the marker.
      while (this.index < lines.length) {
        const next = lines[this.index]!
        const t = trimmed(next)
        if (t === '') {
          const after = lines[this.index + 1]
          if (
            after != null &&
            Parser.indentation(after) > first.indent &&
            trimmed(after) !== ''
          ) {
            body.push('')
            this.index += 1
            continue
          }
          break
        }
        const nested = Parser.listMarker(next)
        if (nested && nested.indent <= first.indent) break
        if (
          Parser.indentation(next) > first.indent ||
          (!nested && !Parser.startsBlock(t))
        ) {
          body.push(
            Parser.indentation(next) > first.indent
              ? [...next]
                  .slice(
                    Math.min(Parser.indentation(next), marker.contentStart),
                  )
                  .join('')
              : t,
          )
          this.index += 1
        } else break
      }
      items.push({ checked, blocks: new Parser(body).blocks() })
    }
    return {
      type: 'list',
      ordered: first.ordered,
      start: first.number,
      items,
    }
  }

  private table(alignments: MarkdownAlignment[]): MarkdownBlock {
    const lines = this.lines
    const header = Parser.cells(lines[this.index]!)
    this.index += 2
    const rows: string[][] = []
    while (this.index < lines.length) {
      const t = trimmed(lines[this.index]!)
      if (t === '' || !t.includes('|')) break
      let row = Parser.cells(lines[this.index]!)
      if (row.length < header.length)
        row = [...row, ...Array<string>(header.length - row.length).fill('')]
      rows.push(row.slice(0, header.length))
      this.index += 1
    }
    const aligned =
      alignments.length >= header.length
        ? alignments.slice(0, header.length)
        : [
            ...alignments,
            ...Array<MarkdownAlignment>(header.length - alignments.length).fill(
              'leading',
            ),
          ]
    return { type: 'table', header, alignments: aligned, rows }
  }

  static indentation(line: string): number {
    return /^ */.exec(line)![0].length
  }

  static startsBlock(t: string): boolean {
    return (
      Parser.fenceOpening(t) != null ||
      Parser.heading(t) != null ||
      Parser.isRule(t) ||
      t.startsWith('>')
    )
  }

  static fenceOpening(
    t: string,
  ): { marker: string; language?: string } | undefined {
    for (const marker of ['```', '~~~']) {
      if (!t.startsWith(marker)) continue
      const language = trimmed(t.slice(3))
      return { marker, language: language === '' ? undefined : language }
    }
    return undefined
  }

  static heading(t: string): MarkdownBlock | undefined {
    const hashes = /^#*/.exec(t)![0].length
    if (hashes < 1 || hashes > 6 || t.length <= hashes || t[hashes] !== ' ')
      return undefined
    let words = trimmed(t.slice(hashes + 1))
    while (words.endsWith('#')) words = words.slice(0, -1)
    return { type: 'heading', level: hashes, text: trimmed(words) }
  }

  static isRule(t: string): boolean {
    const compact = t.replace(/ /g, '')
    const first = compact[0]
    if (compact.length < 3 || first == null || !'-*_'.includes(first))
      return false
    return [...compact].every((ch) => ch === first)
  }

  static tableDivider(line: string): MarkdownAlignment[] | undefined {
    const t = trimmed(line)
    if (!t.includes('-') || !(t.includes('|') || t.startsWith(':')))
      return undefined
    const cells = Parser.cells(t)
    if (cells.length === 0) return undefined
    const out: MarkdownAlignment[] = []
    for (const cell of cells) {
      const c = trimmed(cell)
      if (c === '' || !/^[-:]+$/.test(c) || !c.includes('-')) return undefined
      out.push(
        c.startsWith(':') && c.endsWith(':')
          ? 'center'
          : c.endsWith(':')
            ? 'trailing'
            : 'leading',
      )
    }
    return out
  }

  static cells(line: string): string[] {
    let t = trimmed(line)
    if (t.startsWith('|')) t = t.slice(1)
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
    const cells: string[] = []
    let current = ''
    let escaped = false
    for (const ch of t) {
      if (escaped) {
        current += ch
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '|') {
        cells.push(trimmed(current))
        current = ''
        continue
      }
      current += ch
    }
    cells.push(trimmed(current))
    return cells
  }
}

// MARK: Within a line

/** A piece of a line's words in one style: bold, italic, code, struck through, or a link. */
export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  struck?: boolean
  /** The address the words link to. */
  link?: string
}

type Node =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | {
      type: 'delim'
      char: string
      count: number
      original: number
      canOpen: boolean
      canClose: boolean
    }
  | { type: 'strong' | 'em' | 'del'; children: Node[] }
  | { type: 'link'; href: string; children: Node[] }
  | { type: 'image'; alt: Node[] }

const punctuation = /[\p{P}\p{S}]/u
const whitespace = /\s/u
const asciiPunctuation = /[!-/:-@[-`{-~]/

/** Where the bracket opened at `start` closes, past escapes and code; -1 when it does not. */
function closingBracket(chars: string[], start: number): number {
  let depth = 0
  for (let i = start; i < chars.length; i += 1) {
    const ch = chars[i]!
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '`') {
      let run = 1
      while (chars[i + run] === '`') run += 1
      const close = closingTicks(chars, i + run, run)
      if (close >= 0) {
        i = close + run - 1
        continue
      }
      i += run - 1
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function closingTicks(chars: string[], from: number, run: number): number {
  for (let i = from; i < chars.length; i += 1) {
    if (chars[i] !== '`') continue
    let length = 1
    while (chars[i + length] === '`') length += 1
    if (length === run) return i
    i += length - 1
  }
  return -1
}

/** A link's `(address "title")` after its `]`, at `start`: the address and where it ends; undefined when it is not one. */
function destination(
  chars: string[],
  start: number,
): { href: string; end: number } | undefined {
  if (chars[start] !== '(') return undefined
  let i = start + 1
  while (i < chars.length && /[ \t\n]/.test(chars[i]!)) i += 1
  let href = ''
  if (chars[i] === '<') {
    i += 1
    while (i < chars.length && chars[i] !== '>') {
      if (chars[i] === '\n' || chars[i] === '<') return undefined
      if (chars[i] === '\\' && asciiPunctuation.test(chars[i + 1] ?? '')) {
        href += chars[i + 1]
        i += 2
        continue
      }
      href += chars[i]
      i += 1
    }
    if (chars[i] !== '>') return undefined
    i += 1
  } else {
    let depth = 0
    while (i < chars.length) {
      const ch = chars[i]!
      if (/\s/.test(ch)) break
      if (ch === '\\' && asciiPunctuation.test(chars[i + 1] ?? '')) {
        href += chars[i + 1]
        i += 2
        continue
      }
      if (ch === '(') depth += 1
      if (ch === ')') {
        if (depth === 0) break
        depth -= 1
      }
      href += ch
      i += 1
    }
  }
  while (i < chars.length && /[ \t\n]/.test(chars[i]!)) i += 1
  // A title, which the words do not show.
  const quote = chars[i]
  if (quote === '"' || quote === "'" || quote === '(') {
    const close = quote === '(' ? ')' : quote
    i += 1
    while (i < chars.length && chars[i] !== close) {
      if (chars[i] === '\\') i += 1
      i += 1
    }
    if (chars[i] !== close) return undefined
    i += 1
    while (i < chars.length && /[ \t\n]/.test(chars[i]!)) i += 1
  }
  if (chars[i] !== ')') return undefined
  return { href, end: i + 1 }
}

/** The nodes of `chars`, links and code read, emphasis left as delimiters. */
function tokenize(chars: string[]): Node[] {
  const nodes: Node[] = []
  let plain = ''
  const flush = () => {
    if (plain !== '') {
      nodes.push({ type: 'text', text: plain })
      plain = ''
    }
  }
  let i = 0
  while (i < chars.length) {
    const ch = chars[i]!
    if (
      ch === '\\' &&
      i + 1 < chars.length &&
      asciiPunctuation.test(chars[i + 1]!)
    ) {
      plain += chars[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      let run = 1
      while (chars[i + run] === '`') run += 1
      const close = closingTicks(chars, i + run, run)
      if (close < 0) {
        plain += chars.slice(i, i + run).join('')
        i += run
        continue
      }
      flush()
      let code = chars
        .slice(i + run, close)
        .join('')
        .replace(/\n/g, ' ')
      if (
        code.length >= 2 &&
        code.startsWith(' ') &&
        code.endsWith(' ') &&
        code.trim() !== ''
      )
        code = code.slice(1, -1)
      nodes.push({ type: 'code', text: code })
      i = close + run
      continue
    }
    if (ch === '[' || (ch === '!' && chars[i + 1] === '[')) {
      const open = ch === '!' ? i + 1 : i
      const close = closingBracket(chars, open)
      const target = close >= 0 ? destination(chars, close + 1) : undefined
      if (target) {
        flush()
        const inside = tokenize(chars.slice(open + 1, close))
        processEmphasis(inside)
        if (ch === '!') nodes.push({ type: 'image', alt: inside })
        else nodes.push({ type: 'link', href: target.href, children: inside })
        i = target.end
        continue
      }
      plain += ch
      i += 1
      continue
    }
    if (ch === '<') {
      const rest = chars.slice(i + 1).join('')
      const auto = /^([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(rest)
      const mail =
        /^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/.exec(
          rest,
        )
      if (auto || mail) {
        flush()
        const address = (auto ?? mail)![1]!
        nodes.push({
          type: 'link',
          href: auto ? address : `mailto:${address}`,
          children: [{ type: 'text', text: address }],
        })
        i += 1 + [...address].length + 1
        continue
      }
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      let run = 1
      while (chars[i + run] === ch) run += 1
      const before = i > 0 ? chars[i - 1]! : ' '
      const after = i + run < chars.length ? chars[i + run]! : ' '
      const spaceAfter = whitespace.test(after)
      const spaceBefore = whitespace.test(before)
      const leftFlanking =
        !spaceAfter &&
        (!punctuation.test(after) || spaceBefore || punctuation.test(before))
      const rightFlanking =
        !spaceBefore &&
        (!punctuation.test(before) || spaceAfter || punctuation.test(after))
      let canOpen = leftFlanking
      let canClose = rightFlanking
      if (ch === '_') {
        canOpen = leftFlanking && (!rightFlanking || punctuation.test(before))
        canClose = rightFlanking && (!leftFlanking || punctuation.test(after))
      }
      // Strikethrough is one or two tildes; more is words.
      if (ch === '~' && run > 2) {
        plain += chars.slice(i, i + run).join('')
        i += run
        continue
      }
      flush()
      nodes.push({
        type: 'delim',
        char: ch,
        count: run,
        original: run,
        canOpen,
        canClose,
      })
      i += run
      continue
    }
    plain += ch
    i += 1
  }
  flush()
  return nodes
}

/** CommonMark's emphasis, on one run of nodes: each closer matched with the nearest opener before it. */
function processEmphasis(nodes: Node[]): void {
  let ci = 0
  while (ci < nodes.length) {
    const closer = nodes[ci]!
    if (closer.type !== 'delim' || !closer.canClose) {
      ci += 1
      continue
    }
    let found = -1
    for (let oi = ci - 1; oi >= 0; oi -= 1) {
      const opener = nodes[oi]!
      if (
        opener.type !== 'delim' ||
        opener.char !== closer.char ||
        !opener.canOpen
      )
        continue
      if (closer.char === '~') {
        if (opener.count !== closer.count) continue
      } else if (
        (opener.canClose || closer.canOpen) &&
        (opener.original + closer.original) % 3 === 0 &&
        !(opener.original % 3 === 0 && closer.original % 3 === 0)
      ) {
        continue
      }
      found = oi
      break
    }
    if (found < 0) {
      ci += 1
      continue
    }
    const opener = nodes[found] as Extract<Node, { type: 'delim' }>
    const use =
      closer.char === '~'
        ? opener.count
        : opener.count >= 2 && closer.count >= 2
          ? 2
          : 1
    const inner = nodes.slice(found + 1, ci).map(asWords)
    const wrapped: Node = {
      type: closer.char === '~' ? 'del' : use === 2 ? 'strong' : 'em',
      children: inner,
    }
    opener.count -= use
    closer.count -= use
    const replacement: Node[] = []
    if (opener.count > 0) replacement.push(opener)
    replacement.push(wrapped)
    if (closer.count > 0) replacement.push(closer)
    nodes.splice(found, ci - found + 1, ...replacement)
    ci = found + (opener.count > 0 ? 1 : 0) + 1
  }
  nodes.forEach((node, index) => {
    nodes[index] = asWords(node)
  })
}

/** A delimiter nothing matched is its characters. */
function asWords(node: Node): Node {
  return node.type === 'delim'
    ? { type: 'text', text: node.char.repeat(node.count) }
    : node
}

const inlineCache = new Map<string, InlineRun[]>()

/** A line of Markdown as runs of words in their styles (`MessageLine.made`): GitHub's bare links found in the plain runs. */
export function inlineRuns(markdown: string): InlineRun[] {
  const hit = inlineCache.get(markdown)
  if (hit) return hit
  const nodes = tokenize([...markdown])
  processEmphasis(nodes)
  const runs: InlineRun[] = []
  const add = (run: InlineRun) => {
    if (run.text === '') return
    const last = runs[runs.length - 1]
    if (
      last &&
      !!last.bold === !!run.bold &&
      !!last.italic === !!run.italic &&
      !!last.code === !!run.code &&
      !!last.struck === !!run.struck &&
      last.link === run.link
    ) {
      last.text += run.text
      return
    }
    runs.push({ ...run })
  }
  const walk = (list: Node[], style: Omit<InlineRun, 'text'>) => {
    for (const node of list) {
      switch (node.type) {
        case 'text':
          add({ ...style, text: node.text })
          break
        case 'code':
          add({ ...style, code: true, text: node.text })
          break
        case 'strong':
          walk(node.children, { ...style, bold: true })
          break
        case 'em':
          walk(node.children, { ...style, italic: true })
          break
        case 'del':
          walk(node.children, { ...style, struck: true })
          break
        case 'link':
          walk(node.children, { ...style, link: node.href })
          break
        case 'image':
          // A picture in the words reads as what it shows.
          walk(node.alt, style)
          break
        case 'delim':
          add({ ...style, text: node.char.repeat(node.count) })
          break
      }
    }
  }
  walk(nodes, {})
  // Bare addresses in plain words are links too (remark-gfm's autolink literals).
  const out = runs.flatMap((run) =>
    run.link != null || run.code
      ? [run]
      : autolinks(run.text).map((part) =>
          part.url
            ? { ...run, text: part.text, link: part.url }
            : { ...run, text: part.text },
        ),
  )
  if (inlineCache.size > 2_000) inlineCache.clear()
  inlineCache.set(markdown, out)
  return out
}

/** The words a line of Markdown shows, its marks taken away (what find reads on screen). */
export function shownWords(markdown: string): string {
  return inlineRuns(markdown)
    .map((run) => run.text)
    .join('')
}

/**
 * GitHub's bare links (remark-gfm's autolink literals, `MessageLine.autolinks`):
 * an address that starts `http://`, `https://` or `www.`, its trailing stop
 * and an unmatched closing bracket left out.
 */
export function autolinks(words: string): { text: string; url?: string }[] {
  if (!words.includes('http') && !words.includes('www.'))
    return [{ text: words }]
  const parts: { text: string; url?: string }[] = []
  const pattern = /(?<![\w@.])(?:https?:\/\/|www\.)[^\s<>]+/gi
  let cursor = 0
  for (const match of words.matchAll(pattern)) {
    let found = match[0]
    // Trailing punctuation is the sentence's, and a ")" with no "(" before it in the address.
    for (;;) {
      const last = found[found.length - 1]
      if (last && '?!.,:;*_~\'"'.includes(last)) {
        found = found.slice(0, -1)
        continue
      }
      if (last === ')') {
        const opens = (found.match(/\(/g) ?? []).length
        const closes = (found.match(/\)/g) ?? []).length
        if (closes > opens) {
          found = found.slice(0, -1)
          continue
        }
      }
      break
    }
    const lower = found.toLowerCase()
    const host = lower.replace(/^https?:\/\//, '').replace(/^www\./, '')
    if (host === '' || !/[a-z0-9]/.test(host[0]!)) continue
    const at = match.index ?? 0
    if (at > cursor) parts.push({ text: words.slice(cursor, at) })
    parts.push({
      text: found,
      url: lower.startsWith('www.') ? `http://${found}` : found,
    })
    cursor = at + found.length
  }
  if (cursor < words.length) parts.push({ text: words.slice(cursor) })
  return parts.length === 0 ? [{ text: words }] : parts
}
