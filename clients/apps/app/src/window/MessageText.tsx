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
// Names in an agent's message (`Mentions`, `MessageLine.mention`): an app
// in its colour after its logo, an agent in a glass pill with its face,
// which opens its chat.
//
// A link in an agent's message comes after its site's icon (`LinkIcons`):
// the site's own /favicon.ico, read by the browser from the site itself,
// shown once it has come.
//
// Still to come (docs/web-app/PROGRESS.md): maths and diagrams drawn
// (the Mac's `DrawingView`; until then their TeX shows as code); the code's
// colours.

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useState,
} from 'react'
import {
  FindLine,
  type FindMarks,
  marksPerBlock,
  tableCells,
} from '../core/chatFind'
import { brandLogos } from '../core/generatedBrands'
import { siteOf } from '../core/linkIcons'
import {
  type InlineRun,
  type MarkdownBlock,
  type MarkdownListItem,
  cachedBlocks,
  inlineMath,
  inlineRuns,
  shownWords,
} from '../core/markdown'
import { type AgentName, type Mention, findMentions } from '../core/mentions'
import { t } from '../l10n'
import { FindContext, markedWords } from './FindBar'

/** What names in a message are read with (`MessageLine`'s agents, person and speaker), and what a pill does; none for the person's own words. */
export interface MentionSetting {
  agents: readonly AgentName[]
  personName?: string
  /** The agent writing: its own name is no pill, save in its introduction. */
  speaker?: string
  introducing: boolean
  picture: (agentId: string) => string | undefined
  open: (agentId: string) => void
}

export const MentionContext = createContext<MentionSetting | undefined>(
  undefined,
)

/** A line of Markdown's words in their styles (`MessageLine.made`), find's marks on the words shown. */
export function Line({ markdown }: { markdown: string }) {
  const marks = useContext(FindContext)
  const names = useContext(MentionContext)
  const runs = inlineRuns(markdown)
  const shown = runs.map((run) => run.text).join('')
  const found = marks ? FindLine.of(marks, shown) : undefined
  // The names, read in the whole line (a run alone would read "Link" as a sentence's first word).
  const mentions = names
    ? findMentions(shown, {
        agents: names.agents,
        personName: names.personName,
        speaker: names.speaker,
        introducing: names.introducing,
      })
    : []
  // Where each run starts in the words shown (UTF-16), so find's marks land on it.
  const offsets: number[] = []
  let offset = 0
  for (const run of runs) {
    offsets.push(offset)
    offset += run.text.length
  }
  return (
    <>
      {runs.map((run, index) => {
        const at = offsets[index]!
        const end = at + run.text.length
        return (
          <Run
            key={index}
            run={run}
            found={found}
            at={at}
            mentions={mentions.filter(
              (m) => m.location >= at && m.location + m.length <= end,
            )}
            names={names}
          />
        )
      })}
    </>
  )
}

function Run({
  run,
  found,
  at,
  mentions,
  names,
}: {
  run: InlineRun
  found?: FindLine
  at: number
  /** The names wholly inside this run, at the line's offsets. */
  mentions: Mention[]
  names?: MentionSetting
}) {
  let node: ReactNode
  if (run.link == null && !run.code && names && mentions.length > 0) {
    // Plain words with names among them: each name drawn as its kind, find's marks on all of it.
    const pieces: ReactNode[] = []
    let cursor = at
    for (const mention of mentions) {
      if (mention.location > cursor)
        pieces.push(
          markedWords(
            run.text.slice(cursor - at, mention.location - at),
            found,
            cursor,
          ),
        )
      pieces.push(
        <Name
          key={mention.location}
          mention={mention}
          words={run.text.slice(
            mention.location - at,
            mention.location - at + mention.length,
          )}
          found={found}
          names={names}
        />,
      )
      cursor = mention.location + mention.length
    }
    if (cursor < at + run.text.length)
      pieces.push(markedWords(run.text.slice(cursor - at), found, cursor))
    node = pieces
  } else node = markedWords(run.text, found, at)
  if (run.code) node = <code className="inline-code">{node}</code>
  if (run.bold) node = <strong>{node}</strong>
  if (run.italic) node = <em>{node}</em>
  if (run.struck) node = <s>{node}</s>
  if (run.link != null) {
    // A link opens in the browser's own new tab, never in the app's.
    const link = (
      <a
        className="message-link"
        href={run.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {node}
      </a>
    )
    // Its site's icon before it, in an agent's message (not in a file's words, nor before an email's page).
    const site = names ? siteOf(run.link) : undefined
    if (!site) return link
    return (
      <>
        <SiteIcon key={site} site={site} />
        {link}
      </>
    )
  }
  return node
}

/** What each site's icon came to while the app runs: shown, or none (asked for once per site, as `LinkIcons`). */
const siteIcons = new Map<string, 'shown' | 'none'>()

/** A site's icon as far as it is known (unknown until it loads or fails), and the call that settles it for every link to the site. */
export function useSiteIcon(
  site: string,
): [state: 'shown' | 'none' | undefined, settle: (shown: boolean) => void] {
  const [state, setState] = useState(siteIcons.get(site))
  const settle = (shown: boolean) => {
    siteIcons.set(site, shown ? 'shown' : 'none')
    setState(shown ? 'shown' : 'none')
  }
  return [state, settle]
}

/**
 * A link's site icon (`InlineImages.site`): the site's own /favicon.ico,
 * loaded by the browser from the site (never a favicon service; the chat's
 * address not sent with it), 1.05 of the words, a 22% corner, a little below
 * the line, then a narrow space that keeps it with the link. Nothing until
 * it has come, and nothing for a site without one.
 */
function SiteIcon({ site }: { site: string }) {
  const [state, settle] = useSiteIcon(site)
  if (state === 'none') return null
  return (
    <>
      <img
        className={state === 'shown' ? 'site-icon' : 'site-icon coming'}
        src={`https://${site}/favicon.ico`}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        onLoad={(event) => settle(event.currentTarget.naturalWidth > 0)}
        onError={() => settle(false)}
      />
      {state === 'shown' && '\u202f'}
    </>
  )
}

/**
 * A name in a message (`MessageLine.mention`), kept on one line: an app's
 * logo (1.05 of the words, a little below the line), a narrow space, and its
 * name in its colour at 500 (600 in bold); one-colour logos take the name's
 * colour. An agent's face (1.1 of the words) and its name in the blue at 600
 * in a glass pill, which opens its chat.
 */
function Name({
  mention,
  words,
  found,
  names,
}: {
  mention: Mention
  words: string
  found?: FindLine
  names: MentionSetting
}) {
  // `white-space: nowrap`: the name's spaces do not break.
  const kept = markedWords(
    words.replace(/ /g, '\u00a0'),
    found,
    mention.location,
  )
  const kind = mention.kind
  if (kind.kind === 'brand') {
    const logo = brandLogos[kind.brand.key]
    const colours = {
      '--brand-light': kind.brand.light,
      '--brand-dark': kind.brand.dark,
    } as CSSProperties
    return (
      <span className="brand-name" style={colours}>
        {logo &&
          (kind.brand.mono ? (
            <span
              className="brand-logo mono"
              style={{
                maskImage: `url("${logo}")`,
                WebkitMaskImage: `url("${logo}")`,
              }}
              aria-hidden="true"
            />
          ) : (
            <img className="brand-logo" src={logo} alt="" aria-hidden="true" />
          ))}
        {'\u202f'}
        <span className="brand-words">{kept}</span>
      </span>
    )
  }
  const picture = names.picture(kind.id)
  return (
    <button
      type="button"
      className="agent-pill"
      onClick={() => names.open(kind.id)}
    >
      {picture ? (
        <img className="pill-face" src={picture} alt="" aria-hidden="true" />
      ) : (
        <span className="pill-face blank" aria-hidden="true" />
      )}
      <span className="pill-name">{kept}</span>
    </button>
  )
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

export function MessageBlocks({
  markdown,
  document = false,
}: {
  markdown: string
  /** A Markdown file's page (`proseDocument`): its own headings, lists, tables and quotes. */
  document?: boolean
}) {
  return (
    <div className={document ? 'message-blocks document' : 'message-blocks'}>
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
export function CodeBlock({ words }: { words: string }) {
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
