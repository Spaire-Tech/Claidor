// An agent's message as blocks (`MessageBlocks`, `MessageLine`, `ListBlock`,
// `TableBlock` and `CodeBlock` in mac/Simeon/MessageText.swift; the window's
// react-markdown, `sand-message-prose`), 10 apart: paragraphs 14 on 20;
// headings at 600 (# 22 on 28, ## 17 on 24, ### and smaller 14 on 20 with 8
// more above); lists 20 in, their items 4 apart, bullets a disc, a circle,
// a square; task boxes; quotes behind a bar; code 12 on 18 in a box; tables
// 13 on 18; links in the link blue, no underline.
//
// Still to come (docs/web-app/PROGRESS.md): names in their colours and
// pills (`Mentions`) and a link's site icon (2b); maths and diagrams drawn
// (the Mac's `DrawingView`; until then their TeX shows as code); find's
// marks (2b); the code's colours.

import { Fragment, type ReactNode, useState } from 'react'
import {
  type InlineRun,
  type MarkdownBlock,
  type MarkdownListItem,
  cachedBlocks,
  inlineMath,
  inlineRuns,
} from '../core/markdown'
import { t } from '../l10n'

/** A line of Markdown's words in their styles (`MessageLine.made`). */
export function Line({ markdown }: { markdown: string }) {
  return (
    <>
      {inlineRuns(markdown).map((run, index) => (
        <Run key={index} run={run} />
      ))}
    </>
  )
}

function Run({ run }: { run: InlineRun }) {
  let node: ReactNode = run.text
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

/** A paragraph: its words, or with maths in it, its words and its TeX (drawn as code until maths is drawn). */
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
  )
}

export function MessageBlocks({ markdown }: { markdown: string }) {
  return (
    <div className="message-blocks">
      {cachedBlocks(markdown).map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
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
          {block.blocks.map((inner, index) => (
            <Block key={index} block={inner} />
          ))}
        </blockquote>
      )
    case 'code':
      return <CodeBlock words={block.text} />
    case 'math':
      return <CodeBlock words={block.text} />
    case 'table':
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
                    <Line markdown={cell} />
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
                      <Line markdown={row[column] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'rule':
      // The window's rule is drawn with no width: only its line of space shows.
      return <div className="message-rule" aria-hidden="true" />
  }
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
            {item.blocks.map((block, blockIndex) =>
              block.type === 'list' ? (
                <List
                  key={blockIndex}
                  ordered={block.ordered}
                  start={block.start}
                  items={block.items}
                  depth={depth + 1}
                />
              ) : (
                <Fragment key={blockIndex}>
                  <Block block={block} />
                </Fragment>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
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
