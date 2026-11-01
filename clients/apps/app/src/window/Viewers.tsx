// A file's preview over the whole window (mac/Simeon/Viewers.swift's
// `FileViewer` and `ViewerState`, FileBodies.swift's `MarkdownPage`,
// `CodeBody`, `JSONBody` and `TableBody`): the file read from the computer
// and shown as its kind shows it. Text and code in their colours, Markdown
// as a page, JSON as a tree, CSV and TSV as a table. PDF, Word, Excel,
// sound, pictures and videos come with step 2c's third part.

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type FileKind,
  type Sheet,
  cellLabel,
  fileExtension,
  fileKind,
  fileLanguage,
  jsonEntries,
  jsonSummary,
  previewText,
  readSheet,
  rowsLine,
  tableColumns,
} from '../core/filePreview'
import type { AppStore, PreviewRead } from '../core/store'
import { t } from '../l10n'
import { saveFile } from './Files'
import { MessageBlocks } from './MessageText'

/** A file to preview: its name, where it is, and whose computer has it. */
export interface FileItem {
  name: string
  url: string
  agentId: string
}

/** Opens a file's preview over the window (`Viewers.open`). */
export const OpenFile = createContext<((file: FileItem) => void) | null>(null)
export const useOpenFile = () => useContext(OpenFile)

/** The kinds this part shows: the rest open with part 3. */
export function previewShown(name: string): boolean {
  switch (fileKind(name)) {
    case 'text':
    case 'markdown':
    case 'json':
      return true
    case 'table':
      return ['csv', 'tsv'].includes(fileExtension(name) ?? '')
    default:
      return false
  }
}

/** What a file shows once read: its words, a sheet, or nothing it can read. */
type Shown =
  | { kind: 'text'; text: string; cut: boolean }
  | { kind: 'sheet'; sheet: Sheet }
  | { kind: 'noSheet' }
  | { kind: 'none' }

function shown(read: PreviewRead, name: string, kind: FileKind): Shown {
  if (read.kind !== 'ready') return { kind: 'none' }
  switch (kind) {
    case 'table':
      return ['csv', 'tsv'].includes(fileExtension(name) ?? '')
        ? {
            kind: 'sheet',
            sheet: readSheet(new TextDecoder().decode(read.data), name),
          }
        : { kind: 'noSheet' }
    case 'text':
    case 'markdown':
    case 'json':
      return { kind: 'text', ...previewText(read.data) }
    default:
      return { kind: 'none' }
  }
}

/**
 * A file's preview (`sand-file-viewer`): the window dimmed (the text colour
 * at 90%, 95% on dark), padded 40; the panel as wide as that allows up to
 * 1100, the ground, 12 round, a half-point edge at 15% and a deep shadow.
 * Its head (the window's chrome, padded 8 12 8 16, 12 apart): the name (13,
 * 500, on 18) over a grey line when there is one (11 on 16, at 40%), then
 * Download and Close (24, 8 apart). Under it the file as its kind shows it.
 * Escape or a click outside closes it.
 */
export function FileViewer({
  item,
  store,
  close,
}: {
  item: FileItem
  store: AppStore
  close: () => void
}) {
  const kind = fileKind(item.name)
  const [read, setRead] = useState<{ read: PreviewRead; shown: Shown }>()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let live = true
    void store.readForPreview(item.url, item.agentId).then((answer) => {
      if (live) setRead({ read: answer, shown: shown(answer, item.name, kind) })
    })
    return () => {
      live = false
    }
  }, [store, item, kind])
  // Escape closes it before anything under it hears the key; the place the person was gets the keys back after.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', keys, true)
    return () => {
      window.removeEventListener('keydown', keys, true)
      before?.focus?.()
    }
  }, [close])

  const download = () => void saveFile(store, item.name, item.url, item.agentId)
  const subtitle =
    read?.shown.kind === 'sheet'
      ? rowsLine(read.shown.sheet.totalRows)
      : read?.shown.kind === 'text' &&
          read.shown.cut &&
          (kind === 'text' || kind === 'markdown')
        ? t('Showing the start of this file')
        : undefined
  return (
    <div
      className="file-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={panel}
        className="file-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        tabIndex={-1}
      >
        <div className="file-viewer-head">
          <div className="file-viewer-words">
            <span className="file-viewer-name">{item.name}</span>
            {subtitle && (
              <span className="file-viewer-subtitle">{subtitle}</span>
            )}
          </div>
          <HeadButton label={t('Download file')} onClick={download}>
            <path
              d="M7 2v7.5M3.8 6.3 7 9.5l3.2-3.2M2.5 12h9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </HeadButton>
          <HeadButton label={t('Close preview')} onClick={close}>
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </HeadButton>
        </div>
        <div className="file-viewer-body">
          <Content
            kind={kind}
            name={item.name}
            read={read}
            download={download}
          />
        </div>
      </div>
    </div>
  )
}

function Content({
  kind,
  name,
  read,
  download,
}: {
  kind: FileKind
  name: string
  read?: { read: PreviewRead; shown: Shown }
  download: () => void
}) {
  const action = (
    <button type="button" className="viewer-download" onClick={download}>
      {t('Download')}
    </button>
  )
  if (!read) return <ViewerState loading={loadingWords(kind)} />
  if (read.read.kind === 'missing')
    return <ViewerState glyph={glyphOf(kind)} title={t('File unavailable')} />
  if (read.read.kind === 'tooLarge') {
    const [title, detail] = tooLarge(kind)
    return (
      <ViewerState
        glyph={glyphOf(kind)}
        title={title}
        detail={detail}
        action={action}
      />
    )
  }
  const what = read.shown
  if (what.kind === 'sheet') return <TableBody sheet={what.sheet} />
  if (what.kind === 'noSheet')
    return (
      <ViewerState glyph="table" title={t("Couldn't read this spreadsheet")} />
    )
  if (what.kind === 'text') {
    if (kind === 'markdown') return <MarkdownPage text={what.text} />
    if (kind === 'json') return <JSONBody text={what.text} name={name} />
    return <CodeBody text={what.text} name={name} />
  }
  return (
    <ViewerState
      glyph="doc"
      title={t('Preview not available')}
      detail={t(
        "This file type can't be previewed. Download it to open it on your computer.",
      )}
      action={action}
    />
  )
}

function loadingWords(kind: FileKind): string {
  switch (kind) {
    case 'pdf':
      return t('Loading PDF…')
    case 'table':
      return t('Loading spreadsheet…')
    case 'docx':
      return t('Loading document…')
    default:
      return t('Loading file…')
  }
}

function tooLarge(kind: FileKind): [string, string] {
  switch (kind) {
    case 'pdf':
      return [
        t('PDF too large to preview'),
        t(
          'This PDF is too large to preview here. Download it to open in your PDF reader.',
        ),
      ]
    case 'table':
      return [
        t('Spreadsheet too large to preview'),
        t(
          'This spreadsheet is too large to preview here. Download it to open it in full.',
        ),
      ]
    case 'docx':
      return [
        t('Document too large to preview'),
        t(
          'This document is too large to preview here. Download it to open it in Word.',
        ),
      ]
    default:
      return [
        t('File too large to preview'),
        t(
          'This file is too large to preview here. Download it to open it in full.',
        ),
      ]
  }
}

type Glyph = 'pdf' | 'table' | 'json' | 'text' | 'doc'

function glyphOf(kind: FileKind): Glyph {
  switch (kind) {
    case 'pdf':
      return 'pdf'
    case 'table':
      return 'table'
    case 'json':
      return 'json'
    default:
      return 'text'
  }
}

/** The kind's glyph (32, at 40%): a page with lines, a table, braces. */
function StateGlyph({ glyph }: { glyph: Glyph }) {
  const page = 'M9 4.5h9.5L24 10v17.5H9z'
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {glyph === 'table' ? (
          <>
            <rect x="5" y="7" width="22" height="18" rx="2.5" />
            <path d="M5 13h22M5 19h22M12.5 7v18M19.5 7v18" />
          </>
        ) : glyph === 'json' ? (
          <path d="M12 6c-3 0-3 2-3 4.5S8.5 15 6.5 16c2 1 2.5 3 2.5 5.5S9 26 12 26M20 6c3 0 3 2 3 4.5s.5 4.5 2.5 5.5c-2 1-2.5 3-2.5 5.5S23 26 20 26" />
        ) : (
          <>
            <path d={page} />
            <path d="M18.5 4.5V10H24" />
            {glyph !== 'doc' && <path d="M12.5 15h8M12.5 19h8M12.5 23h5" />}
          </>
        )}
      </g>
    </svg>
  )
}

/**
 * A preview's state (`sand-file-viewer__state`), centred, padded 32: the
 * kind's glyph, its title (13, at 60%) and detail (12, at 40%), then its
 * action; or while it loads, "Loading PDF…" (12, at 40%).
 */
function ViewerState({
  loading,
  glyph,
  title,
  detail,
  action,
}: {
  loading?: string
  glyph?: Glyph
  title?: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="viewer-state">
      {loading != null ? (
        <span className="viewer-loading">{loading}</span>
      ) : (
        <>
          {glyph && <StateGlyph glyph={glyph} />}
          <div className="viewer-state-words">
            {title && <span className="viewer-state-title">{title}</span>}
            {detail && <span className="viewer-state-detail">{detail}</span>}
          </div>
          {action}
        </>
      )}
    </div>
  )
}

/** A head button (`sand-kit-icon-button`): 24, 6 round, its glyph at 60%, grey under the pointer. */
function HeadButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="viewer-head-button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

// MARK: Markdown

/**
 * A Markdown file as a page (`sand-file-markdown-page`): at most 624 wide
 * and centred, padded 40 above, 56 below and 32 at the sides; its words 15
 * on 24 in the text colour, its blocks 12 apart, drawn as a message's are
 * but with the page's headings, lists, tables and quotes. App and agent
 * names are left as words.
 */
function MarkdownPage({ text }: { text: string }) {
  return (
    <div className="markdown-page">
      <div className="markdown-page-column">
        <MessageBlocks markdown={text} document />
      </div>
    </div>
  )
}

// MARK: Code and text

let colourer: Worker | undefined
let asked = 0
const waiting = new Map<number, (html: string | null) => void>()

/** The text's colours from the window's highlight.js, in a worker: none for a language it does not know. */
function colours(text: string, language: string): Promise<string | null> {
  if (!colourer) {
    colourer = new Worker(new URL('./codeColours.worker.ts', import.meta.url), {
      type: 'module',
    })
    colourer.onmessage = (
      event: MessageEvent<{ id: number; html: string | null }>,
    ) => {
      waiting.get(event.data.id)?.(event.data.html)
      waiting.delete(event.data.id)
    }
  }
  asked += 1
  const id = asked
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    colourer!.postMessage({ id, text, language })
  })
}

/**
 * A text or code file (`g1t`): its line numbers down the left (12.5 on 20,
 * at 30%, padded 16 12 24 16, staying while the lines scroll sideways), its
 * lines beside them never wrapping (12.5 on 20, monospaced, padded 16 24
 * 24 16), coloured as the window colours them once highlight.js has read
 * them; plain until then, and for a language it does not know.
 */
function CodeBody({ text, name }: { text: string; name: string }) {
  const language = fileLanguage(name)
  const [coloured, setColoured] = useState<{ text: string; html: string }>()
  useEffect(() => {
    if (!language) return
    let live = true
    void colours(text, language).then((html) => {
      if (live && html != null) setColoured({ text, html })
    })
    return () => {
      live = false
    }
  }, [text, language])
  const numbers = useMemo(() => {
    let lines = 1
    for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lines += 1
    return Array.from({ length: lines }, (_, i) => i + 1).join('\n')
  }, [text])
  const html = coloured?.text === text ? coloured.html : undefined
  return (
    <div className="code-body">
      <pre className="code-numbers" aria-hidden="true">
        {numbers}
      </pre>
      {html != null ? (
        <pre
          className="code-lines"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="code-lines">{text}</pre>
      )}
    </div>
  )
}

// MARK: JSON

/**
 * A JSON file as a tree (`qkn`): 12 on 20.4, monospaced, at 60%, padded 16
 * 24 28; open two levels deep. Each object and list has its caret, its
 * name, and its size ("{5 keys}", "[2 items]", at 40%); its entries 16 in
 * under a line at the edge, at most 200 then "… 12 more". Names amber,
 * strings green, numbers orange, true, false and null violet, the colon at
 * 30%. A file that is not JSON shows as text.
 */
function JSONBody({ text, name }: { text: string; name: string }) {
  const root = useMemo(() => {
    try {
      return { value: JSON.parse(text) as unknown }
    } catch {
      return undefined
    }
  }, [text])
  if (!root) return <CodeBody text={text} name={name} />
  return (
    <div className="json-body">
      <JSONNode value={root.value} depth={0} />
    </div>
  )
}

function JSONNode({
  name,
  value,
  depth,
}: {
  name?: string
  value: unknown
  depth: number
}) {
  const [open, setOpen] = useState(depth < 2)
  const label = name != null && (
    <>
      <span className="json-key">{name}</span>
      <span className="json-colon">: </span>
    </>
  )
  if (value !== null && typeof value === 'object') {
    const isList = Array.isArray(value)
    const entries: [string, unknown][] = isList
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value)
    const shown = entries.slice(0, jsonEntries)
    const what = name ?? 'root'
    return (
      <div className="json-node">
        <div className="json-line">
          {entries.length > 0 ? (
            <button
              type="button"
              className="json-caret"
              aria-label={open ? t`Collapse ${what}` : t`Expand ${what}`}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path
                  d={open ? 'M1.5 2.5 4 5l2.5-2.5' : 'M2.5 1.5 5 4 2.5 6.5'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <span className="json-caret" />
          )}
          {label}
          <span className="json-size">
            {jsonSummary(isList, entries.length)}
          </span>
        </div>
        {open && entries.length > 0 && (
          <div className="json-entries">
            {shown.map(([key, item]) => (
              <JSONNode key={key} name={key} value={item} depth={depth + 1} />
            ))}
            {entries.length > shown.length && (
              <div className="json-more">
                {t`… ${entries.length - shown.length} more`}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  const kind =
    typeof value === 'string'
      ? 'json-string'
      : typeof value === 'number'
        ? 'json-number'
        : 'json-keyword'
  return (
    <div className="json-line leaf">
      <span className="json-caret" />
      {label}
      <span className={kind}>{JSON.stringify(value)}</span>
    </div>
  )
}

// MARK: Spreadsheets

const rowHeight = 25

/** A text's width at the table's size (12.5, medium for the head), read once per sheet. */
function measure(): (words: string, medium: boolean) => number {
  const context = document.createElement('canvas').getContext('2d')
  const family = getComputedStyle(document.body).fontFamily
  return (words, medium) => {
    if (!context) return words.length * 7
    context.font = `${medium ? 500 : 400} 12.5px ${family}`
    return context.measureText(words).width
  }
}

/** Each column as wide as its widest cell in the first rows, padded, at most 360 (`TableBody.widths`). */
function columnWidths(sheet: Sheet, columns: number): number[] {
  const width = measure()
  const widths = Array.from({ length: columns }, () => 40)
  sheet.rows.slice(0, 200).forEach((row, index) => {
    for (let column = 0; column < Math.min(columns, row.length); column += 1) {
      const words = row[column]!
      if (words === '') continue
      widths[column] = Math.max(
        widths[column]!,
        Math.min(360, Math.ceil(width(words, index === 0)) + 21),
      )
    }
  })
  return widths
}

/**
 * A CSV or TSV (`wvn`): a grid padded 12, 12.5 with even figures at 60%;
 * each cell padded 5 10, at most 360 wide and cut with an ellipsis, a
 * hairline round it; the head row and the row numbers on the head's grey,
 * the head at 500 in the text colour, the numbers at 30%; the head row
 * stays while the rows scroll. A cell clicked is chosen (grey) and its
 * words open at the foot in a card ("Revenue · row 2"); clicked again they
 * close. At most 2000 rows and 200 columns; only the rows in view are drawn.
 */
function TableBody({ sheet }: { sheet: Sheet }) {
  const columns = Math.min(
    tableColumns,
    Math.max(0, ...sheet.rows.map((row) => row.length)),
  )
  const heading = sheet.rows[0] ?? []
  const rows = sheet.rows.slice(1)
  const [chosen, setChosen] = useState<{ row: number; column: number }>()
  const widths = useMemo(() => columnWidths(sheet, columns), [sheet, columns])
  const numberWidth = useMemo(
    () =>
      Math.ceil(measure()(String(Math.max(1, sheet.rows.length - 1)), false)) +
      21,
    [sheet],
  )
  const [view, setView] = useState({ top: 0, height: 600 })
  const scroller = useRef<HTMLDivElement>(null)
  // The rows in view, again when the panel changes size.
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const seen = new ResizeObserver(() =>
      setView({ top: box.scrollTop, height: box.clientHeight }),
    )
    seen.observe(box)
    return () => seen.disconnect()
  }, [])
  if (sheet.rows.length === 0)
    return <ViewerState glyph="table" title={t('This sheet is empty')} />
  const first = Math.max(0, Math.floor((view.top - 12) / rowHeight) - 10)
  const last = Math.min(
    rows.length,
    Math.ceil((view.top + view.height) / rowHeight) + 10,
  )
  const row = (
    cells: string[],
    number: string,
    index: number,
    head: boolean,
  ) => (
    <div className={head ? 'sheet-row head' : 'sheet-row'}>
      <span className="sheet-number" style={{ width: numberWidth }}>
        {number}
      </span>
      {Array.from({ length: columns }, (_, column) => {
        const words = cells[column] ?? ''
        const picked = chosen?.row === index && chosen.column === column
        return (
          <span
            key={column}
            className={picked ? 'sheet-cell picked' : 'sheet-cell'}
            style={{ width: widths[column] ?? 80 }}
            title={words}
            onClick={() =>
              setChosen(picked ? undefined : { row: index, column })
            }
          >
            {words}
          </span>
        )
      })}
    </div>
  )
  const picked = chosen
    ? ((chosen.row < 0 ? heading : (rows[chosen.row] ?? []))[chosen.column] ??
      '')
    : ''
  return (
    <div className="sheet">
      <div
        ref={scroller}
        className="sheet-scroll"
        onScroll={(event) =>
          setView({
            top: event.currentTarget.scrollTop,
            height: event.currentTarget.clientHeight,
          })
        }
      >
        <div className="sheet-grid">
          {row(heading, '', -1, true)}
          <div style={{ height: first * rowHeight }} />
          {rows.slice(first, last).map((cells, offset) => (
            <div key={first + offset}>
              {row(cells, String(first + offset + 1), first + offset, false)}
            </div>
          ))}
          <div style={{ height: (rows.length - last) * rowHeight }} />
        </div>
      </div>
      {chosen && picked !== '' && (
        <div className="cell-detail">
          <div className="cell-detail-head">
            <span>
              {cellLabel(
                chosen.column,
                chosen.row,
                heading[chosen.column] ?? '',
              )}
            </span>
            <button
              type="button"
              className="cell-detail-close"
              title={t('Close cell detail')}
              aria-label={t('Close cell detail')}
              onClick={() => setChosen(undefined)}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
              >
                <path
                  d="M2 2l6 6M8 2 2 8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="cell-detail-words">{picked}</div>
        </div>
      )}
    </div>
  )
}
