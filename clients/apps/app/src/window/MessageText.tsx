// An agent's message as blocks (`MessageBlocks`, `MessageLine`, `ListBlock`,
// `TableBlock` and `CodeBlock` in mac/Simeon/MessageText.swift; the window's
// react-markdown, `sand-message-prose`), 10 apart: paragraphs 14 on 20;
// headings at 600 (# 22 on 28, ## 17 on 24, ### and smaller 14 on 20 with 8
// more above); lists 20 in, their items 4 apart, bullets a disc, a circle,
// a square; task boxes; quotes behind a bar; code 12 on 18 in a box; tables
// 13 on 18; links in the link blue, no underline.
//
// Find's marks lie on the words as the Mac's `MessageLine` lays them: each
// block, list item and table cell counted past the ones before, so the
// current match is lit where it is on screen. A code block's words count but
// are not lit, as on the Mac.
//
// Still to come (docs/web-app/PROGRESS.md): names in their colours and
// pills (`Mentions`) and a link's site icon (2b); maths and diagrams drawn
// (the Mac's `DrawingView`; until then their TeX shows as code); the code's
// colours.

import { type ReactNode, useContext, useState } from 'react'
import {
  FindLine,
  type FindMarks,
  marksPerBlock,
  tableCells,
} from '../core/chatFind'
import {
  type InlineRun,
  type MarkdownBlock,
  type MarkdownListItem,
  cachedBlocks,
  inlineMath,
  inlineRuns,
  shownWords,
} from '../core/markdown'
import { t } from '../l10n'
import { FindContext, markedWords } from './FindBar'

/** A line of Markdown's words in their styles (`MessageLine.made`), find's marks on the words shown. */
export function Line({ markdown }: { markdown: string }) {
  const marks = useContext(FindContext)
  const runs = inlineRuns(markdown)
  const found = marks
    ? FindLine.of(marks, runs.map((run) => run.text).join(''))
    : undefined
  // Where each run starts in the words shown (UTF-16), so find's marks land on it.
  const offsets: number[] = []
  let offset = 0
  for (const run of runs) {
    offsets.push(offset)
    offset += run.text.length
  }
  return (
    <>
      {runs.map((run, index) => (
        <Run key={index} run={run} found={found} at={offsets[index]!} />
      ))}
    </>
  )
}

function Run({
  run,
  found,
  at,
}: {
  run: InlineRun
  found?: FindLine
  at: number
}) {
  let node: ReactNode = markedWords(run.text, found, at)
  if (run.code) node = <code className="inline-code">{node}</code>
  if (run.bold) node = <strong>{node}</strong>
  if (run.italic) node = <em>{node}</em>
  if (run.struck) node = <s>{node}</s>
  if (run.link != null) {
    // A link opens in the browser's own new tab, never in the app's.
    return (
      <a
        className="message-link"
        href={run.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {node}
      </a>
    )
  }
  return node
}

/** A paragraph: its words, or with maths in it, its words and its TeX (drawn as code until maths is drawn; unmarked, as the Mac draws such a paragraph whole). */
function Paragraph({ markdown }: { markdown: string }) {
  const parts = inlineMath(markdown)
  if (!parts) {
    return (
      <p className="message-paragraph">
        <Line markdown={markdown} />
      </p>
    )
  }
  return (
    <FindContext.Provider value={undefined}>
      <p className="message-paragraph">
        {parts.map((part, index) =>
          part.math ? (
            <code key={index} className="inline-code">
              {part.text}
            </code>
          ) : (
            <Line key={index} markdown={part.text} />
          ),
        )}
      </p>
    </FindContext.Provider>
  )
}

export function MessageBlocks({ markdown }: { markdown: string }) {
  return (
    <div className="message-blocks">
      <Blocks blocks={cachedBlocks(markdown)} />
    </div>
  )
}

/** Blocks in order, each with find's marks counted past the blocks before it (`MessageBlocks.lines`). */
function Blocks({ blocks }: { blocks: readonly MarkdownBlock[] }) {
  const marks = useContext(FindContext)
  const each = marksPerBlock(blocks, marks)
  return (
    <>
      {blocks.map((block, index) => (
        <FindContext.Provider key={index} value={each[index]}>
          <Block block={block} />
        </FindContext.Provider>
      ))}
    </>
  )
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <Paragraph markdown={block.text} />
    case 'heading': {
      const level = Math.min(block.level, 3)
      return (
        <div
          className={`message-heading h${level}`}
          role="heading"
          aria-level={block.level}
        >
          <Line markdown={block.text} />
        </div>
      )
    }
    case 'list':
      return (
        <List
          ordered={block.ordered}
          start={block.start}
          items={block.items}
          depth={0}
        />
      )
    case 'quote':
      return (
        <blockquote className="message-quote">
          <Blocks blocks={block.blocks} />
        </blockquote>
      )
    case 'code':
      return <CodeBlock words={block.text} />
    case 'math':
      return <CodeBlock words={block.text} />
    case 'table':
      return <Table block={block} />
    case 'rule':
      // The window's rule is drawn with no width: only its line of space shows.
      return <div className="message-rule" aria-hidden="true" />
  }
}

/** A table, find's marks counted cell by cell: the heading row, then row by row, as the words run on screen. */
function Table({
  block,
}: {
  block: Extract<MarkdownBlock, { type: 'table' }>
}) {
  const marks = useContext(FindContext)
  const cells: (FindMarks | undefined)[] = []
  let next = marks
  for (const cell of tableCells(block.header, block.rows)) {
    cells.push(next)
    next = next?.skipping(shownWords(cell))
  }
  const width = block.header.length
  return (
    <div className="message-table">
      <table>
        <thead>
          <tr>
            {block.header.map((cell, column) => (
              <th
                key={column}
                style={{ textAlign: align(block.alignments[column]) }}
              >
                <FindContext.Provider value={cells[column]}>
                  <Line markdown={cell} />
                </FindContext.Provider>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              {block.header.map((_, column) => (
                <td
                  key={column}
                  style={{ textAlign: align(block.alignments[column]) }}
                >
                  <FindContext.Provider
                    value={cells[(index + 1) * width + column]}
                  >
                    <Line markdown={row[column] ?? ''} />
                  </FindContext.Provider>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const align = (alignment: string | undefined) =>
  alignment === 'trailing'
    ? 'right'
    : alignment === 'center'
      ? 'center'
      : 'left'

const bullets = ['•', '◦', '▪']

function List({
  ordered,
  start,
  items,
  depth,
}: {
  ordered: boolean
  start: number
  items: MarkdownListItem[]
  depth: number
}) {
  const tasks = items.some((item) => item.checked != null)
  // Each item's words as one block, so find counts past the items before it.
  const itemMarks = marksPerBlock(
    items.map((item) => ({ type: 'quote', blocks: item.blocks })),
    useContext(FindContext),
  )
  return (
    <div
      className={
        tasks
          ? 'message-list tasks'
          : depth === 0
            ? 'message-list'
            : 'message-list nested'
      }
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={
            tasks && item.checked != null ? 'message-item task' : 'message-item'
          }
        >
          {item.checked != null ? (
            <span
              className={item.checked ? 'check-box checked' : 'check-box'}
              role="img"
              aria-label={item.checked ? t('Done') : t('Not done')}
            />
          ) : (
            !tasks && (
              <span className="marker">
                {ordered ? `${start + index}.` : bullets[Math.min(depth, 2)]}
              </span>
            )
          )}
          <div className="item-blocks">
            <ItemBlocks
              blocks={item.blocks}
              marks={itemMarks[index]}
              depth={depth}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** An item's blocks, a list within it one level deeper, each with find's marks counted past the ones before. */
function ItemBlocks({
  blocks,
  marks,
  depth,
}: {
  blocks: MarkdownBlock[]
  marks: FindMarks | undefined
  depth: number
}) {
  const each = marksPerBlock(blocks, marks)
  return (
    <>
      {blocks.map((block, index) => (
        <FindContext.Provider key={index} value={each[index]}>
          {block.type === 'list' ? (
            <List
              ordered={block.ordered}
              start={block.start}
              items={block.items}
              depth={depth + 1}
            />
          ) : (
            <Block block={block} />
          )}
        </FindContext.Provider>
      ))}
    </>
  )
}

/** A code block (`ui-code-block`): the ground, a 10% edge, 10 round; its lines 12 on 18 monospaced; Copy at its top right under the pointer. */
function CodeBlock({ words }: { words: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block" onMouseLeave={() => setCopied(false)}>
      <pre>{words === '' ? ' ' : words}</pre>
      <button
        type="button"
        className="copy-code"
        aria-label={t('Copy code')}
        title={t('Copy code')}
        onClick={() => {
          void navigator.clipboard?.writeText(words).then(() => setCopied(true))
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  )
}
