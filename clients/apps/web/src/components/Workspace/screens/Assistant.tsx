'use client'

/**
 * Ask — the Swens chat screen.
 *
 * Source of truth: `docs/pierce/design-swens/Swens_Workspace.html`,
 * the `vAssist` block: the collapsible history rail (search, ⌘K, New
 * chat, the project/all scope switch, dated groups), the Newsreader
 * greeting, the composer card with the dark send circle, the project
 * chip beneath it, and answers under the serif « S » mark.
 *
 * What is real, named:
 * - Answers come from the assist endpoint: grounded in the model,
 *   with the tool's own rows drawn verbatim and the boundary line in
 *   grey. Nothing here invents a number.
 * - The history rail's rows are this machine's own past
 *   conversations (localStorage, most recent forty) — real titles,
 *   real order, reopenable. Server-side history is later work.
 * - The scope switch filters those chats by the picked project; the
 *   search filters by title and project name and says which shelf it
 *   looked on when nothing matches.
 * - The project chip under the composer is the real picker.
 *
 * Deferred with the chat-mechanism discussion, by the founder's
 * decision — not built rather than built dead: the composer's « + »
 * menu (attach, mention, Excel selection), the skill chip, and the
 * designed workflow answers (the double-question flow). The answer
 * *style* — S mark, one column, evidence rows — is this file's.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Asked,
  AskedRow,
  AskedStage,
  AskTurn,
  DealListItem,
  TieOutApi,
} from './../api'
import { fileIcon, font, ink } from './../design'

/**
 * One choice offered on a clarifying question.
 *
 * The design's rule, from `REV_ASKS`: **the last option is the
 * primary one** — dark, filled, 9px radius — and every option before
 * it is a grey text pill. That is why the expensive, wider action
 * ends the row rather than opening it: « Run Workflow » after « From
 * scratch », « All 20 » after « Just this cell », « Run Excel-exact »
 * after « Leave as refused ».
 */
export interface AskOption {
  label: string
  /** What running this choice means. Only the person may pick. */
  pick: () => void
}

/** A step in a run, as the design draws it: title, sub-line, state. */
export interface RunStage {
  icon: string
  title: string
  sub: string
  /** The tool's own line — « Walked back from Debt!F44 (6 inputs) ».
   *  Shown in place of `sub` once the run has finished, because by then
   *  what it *found* beats what it was setting out to do. */
  summary?: string
  /** Green ring while running, green tick when this step is done. */
  done?: boolean
  /** The thing the step produced, named. Absent while it is pending. */
  art?: string
  artIcon?: string
}

interface Message {
  role: 'you' | 'working' | 'answer' | 'ask' | 'run' | 'verdict'
  text: string
  rows?: AskedRow[]
  /** What those cells are, in the tool's own words — the label the
   *  fold over them carries. */
  rowsLabel?: string
  /** The boundary paragraph — the answer's last, drawn in grey. */
  ends?: string
  /** « Used 3 tools » — the trace's one-line summary. */
  trace?: string
  /** Which model the answer was about, and what the deal also holds —
   *  drawn only where the deal carries more than one model, because on
   *  every other deal it is noise. Off the artifacts, not the prose. */
  scope?: { model: string; version: number | null; others: string[] }

  // --- the clarifying question (role 'ask') ------------------------
  //
  // The founder's pattern: the person asks, the chat asks **one**
  // question back, and the card names what it would do. `text` is the
  // question; the card is what running it produces.
  /** « Model Review », « Version Comparison », « Determined Fix ». */
  cardTitle?: string
  /** One line under the title, saying what the run actually does. */
  cardBlurb?: string
  /** File-kind icons, overlapped by -7px after the first. */
  cardIcons?: string[]
  /** The choices. Last is primary. Empty once one has been picked. */
  options?: AskOption[]

  // --- the run (role 'run') ----------------------------------------
  /** Every step; the live one is the last not `done`. */
  stages?: RunStage[]
  /** The run is still going. The steps here have all finished — they
   *  arrive finished — so this is what the spinning ring means: more
   *  is coming, not that this step is unfinished. */
  busy?: boolean
  /** How much of the answer is on screen. **The gap is the whole
   *  point.** The text arrives whole; this advances steadily, so the
   *  reader sees writing rather than a wall. */
  shown?: number

  // --- the verdict (role 'verdict') --------------------------------
  /** The lines behind the answer, hidden until the person opens them. */
  traceLines?: string[]
  /** Counts by kind, with the design's dot colours. */
  tallies?: { label: string; n: number; dot: string }[]
  /** What the counts are *of*, and when they were last true. The
   *  design's tally row is bare numbers; these are the model's stored
   *  findings rather than something this answer produced, and a reader
   *  is owed the difference in one line. */
  talliesNote?: string
  /** What the run produced, as cards. */
  outputs?: { icon: string; name: string; pick?: () => void }[]
  /** The dark button, and the blue text link beside it. */
  primaryAction?: string
  altAction?: string
}

/** A finished conversation, kept on this machine — the rail's rows
 *  are the person's own past chats, never invented. */
interface PastChat {
  id: string
  at: number
  dealId: string
  dealName: string
  title: string
  messages: Message[]
}

const HISTORY_KEY = 'swens-assistant-history'
//: The key the Ances build wrote under — read once so nobody's
//: history vanishes with the rename.
const OLD_HISTORY_KEY = 'ances-assistant-history'

const loadHistory = (): PastChat[] => {
  try {
    const raw =
      window.localStorage.getItem(HISTORY_KEY) ??
      window.localStorage.getItem(OLD_HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as PastChat[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const saveHistory = (list: PastChat[]) => {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)))
  } catch {
    // Storage full or blocked — history is a convenience, never a failure.
  }
}

const freshId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The serif S — the design's mark on everything Swens says. */
/**
 * The swan — revision 2's mark, drawn but **not currently used**.
 *
 * The founder's design replaced the serif « S » with this bird, and
 * then asked for the S back « for now ». The drawing is kept here
 * rather than deleted, because it is theirs and the decision was
 * explicitly temporary: switching is one line in `Mark` below.
 *
 * The three paths are the design file's own, copied rather than
 * redrawn — the neck and head, the beak, the body — at `#15171b`,
 * 4.6 stroke, with `margin-left:-4px` so the bird's optical left edge
 * lines up with the text column above it.
 */
export const SwanMark = ({ top = 0 }: { top?: number }) => (
  <svg
    width={26}
    height={26}
    viewBox="0 0 100 100"
    fill="none"
    stroke="#15171b"
    strokeWidth={4.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      flex: '0 0 26px',
      marginLeft: -4,
      display: 'block',
      marginTop: top,
    }}
    aria-hidden
  >
    <path d="M68,74 C68,46 64,25 50,25 C38,25 32.5,36 38.5,45 C43,51.5 53,51.5 56,43.5" />
    <path d="M56,43.5 L48.5,48.5" />
    <path d="M20,55 C44,50 65,57 70,77 C48,86 26,74 20,55" />
  </svg>
)

/**
 * The assistant's mark wherever it speaks — the serif « S », by the
 * founder's instruction (« bring back the S actually. For now. »).
 *
 * `top` is the per-state nudge: the mark sits against the first line
 * of text in each state rather than against the box, so a status line,
 * an answer and a verdict each set their own.
 */
const Mark = ({ top = 0 }: { top?: number }) => (
  <span
    style={{
      flex: '0 0 18px',
      width: 18,
      fontFamily: font.brand,
      fontSize: 16,
      lineHeight: 1,
      color: '#15171b',
      marginTop: top,
    }}
  >
    S
  </span>
)

/**
 * The clarifying question's card and its choices.
 *
 * The founder's flow, in one shape: the person asks, the chat asks
 * **one** question back — never two — and names what it would do
 * before doing it. The question is the serif line above; this is the
 * card beneath, and nothing runs until a choice is picked.
 *
 * Every value here is the design's own. The card is `#f6f6f4` at 16px
 * radius; the title 14.5px near-black; the blurb 13.5px in `#9aa1ab`;
 * the file icons 22px, overlapping by 7px after the first. The
 * choices sit **right-aligned under the card**, and the last one is
 * the primary — dark fill, 9px radius, 500 weight — while the rest
 * are grey text pills at 999px.
 */
const Choices = ({
  title,
  blurb,
  icons,
  options,
}: {
  title: string
  blurb: string
  icons: string[]
  options: AskOption[]
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 12,
      maxWidth: 420,
      animation: 'pcIn .3s ease both',
    }}
  >
    <div
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: '#f6f6f4',
        borderRadius: 16,
        padding: '15px 18px',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <span
          style={{
            fontSize: 14.5,
            letterSpacing: '-.01em',
            color: '#15171b',
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 13.5,
            lineHeight: 1.45,
            color: '#9aa1ab',
            textWrap: 'pretty',
          }}
        >
          {blurb}
        </span>
      </span>
      <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
        {icons.map((src, i) => (
          <span
            key={`${src}-${i}`}
            style={{
              width: 22,
              height: 22,
              marginLeft: i === 0 ? 0 : -7,
              backgroundImage: `url(${src})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
        ))}
      </span>
    </div>
    <div
      style={{
        alignSelf: 'flex-end',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {options.map((o, i) => {
        const primary = i === options.length - 1
        return (
          <button
            key={o.label}
            onClick={o.pick}
            style={{
              border: 0,
              background: primary ? '#1f2937' : 'transparent',
              color: primary ? '#fff' : '#8f96a0',
              borderRadius: primary ? 9 : 999,
              height: 36,
              padding: primary ? '0 16px' : '0 12px',
              font: 'inherit',
              fontSize: 14,
              fontWeight: primary ? 500 : 400,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  </div>
)

/**
 * The assistant's own line, shimmering while it works.
 *
 * The design's one moving thing on this screen: a gradient swept across
 * the text rather than a spinner beside it. The words are never this
 * file's — they are the assistant's status line for the step it is on,
 * and « Thinking » only before there is one.
 */
const Shimmer = ({ text, top = 0 }: { text: string; top?: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
    <Mark top={top} />
    <span
      style={{
        fontSize: 15,
        letterSpacing: '-.006em',
        background:
          'linear-gradient(100deg,#c9ccd2 20%,#6b7280 42%,#c9ccd2 64%)',
        backgroundSize: '220% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        animation: 'aShimmer 1.8s linear infinite',
      }}
    >
      {text}
    </span>
  </div>
)

const Thinking = () => <Shimmer text="Thinking" top={1} />

/**
 * The cells behind an answer — folded, and named.
 *
 * These are the tool's own rows, verbatim, never re-typed by the
 * language model, and they are the evidence for what was said. They
 * used to be poured out under every answer, and the founder saw what
 * that does: a question about a model in general came back with three
 * good paragraphs and then twelve cell references with nothing saying
 * what they were, which reads as the machine emptying its pockets.
 *
 * So they are folded, with the tool's own sentence as the label —
 * « 308 typed inputs across 13 sheets ». Nothing is lost: one click
 * opens them, and a reader checking a figure is a click away rather
 * than scrolling past a table they did not ask for.
 */
const Cells = ({ rows, label }: { rows: AskedRow[]; label?: string }) => {
  const [open, setOpen] = useState(false)
  const named =
    label || `${rows.length} ${rows.length === 1 ? 'cell' : 'cells'}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        onClick={() => setOpen((was) => !was)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          border: 0,
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          fontSize: 13.5,
          color: '#8f96a0',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flex: '0 0 10px',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .16s ease',
          }}
        >
          <polyline points="9,5 16,12 9,19" />
        </svg>
        <span>{named}</span>
      </button>
      {open && (
        <div
          style={{
            background: '#fbfbfc',
            border: '.5px solid #f0eff1',
            borderRadius: 14,
            overflow: 'hidden',
            animation: 'pcIn .18s ease both',
          }}
        >
          {rows.slice(0, 12).map((row, ri) => (
            <div
              key={ri}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr auto',
                gap: 12,
                alignItems: 'center',
                borderTop: ri === 0 ? 0 : '.5px solid #f0eff1',
                padding: '10px 14px',
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: '#0060d0',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.ref}
              </span>
              <span
                style={{
                  minWidth: 0,
                  fontSize: 13.5,
                  color: '#4a4f57',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.what}
              </span>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12.5,
                  color: '#1c1f23',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Words arriving, each fading up out of a blur.
 *
 * **This is the piece the design had and I removed.** `asType` in
 * `Swens_Workspace_2.html` walked a finished string forward at a
 * constant rate. When real streaming replaced it, the screen began
 * painting tokens the instant they landed — and tokens land in bursts,
 * so it lurched. Nothing was wrong with the stream. What was missing
 * was the clock in front of it.
 *
 * Each word is its own span with a stable key, so React mounts a new
 * span only for a word that has just appeared and leaves the rest
 * alone. That is what makes the animation run once per word instead of
 * restarting the paragraph on every frame.
 */
const Words = ({ text }: { text: string }) => (
  <>
    {/* Split keeping the whitespace, so line breaks survive and only
        the words animate. */}
    {text.split(/(\s+)/).map((part, at) =>
      /^\s+$/.test(part) ? (
        part
      ) : (
        <span key={at} style={{ animation: 'aWordIn .34s ease both' }}>
          {part}
        </span>
      ),
    )}
  </>
)

/**
 * A run in progress: « Thinking », then the live step and its result.
 *
 * The design shows one step at a time rather than a list — the step's
 * title in 16px, its sub-line under a **green ring that becomes a
 * green tick**, and the thing it produced in a raised card that
 * starts as a grey skeleton and fills in when the name is known.
 * Steps are indented 36px so they sit under the mark's text column.
 */
const Run = ({ stages, busy }: { stages: RunStage[]; busy?: boolean }) => {
  const live = stages[stages.length - 1]
  //: Nothing has come back yet. « Thinking » is the honest screen: a
  //: step drawn before one has happened would be a step this file
  //: invented, and the model's own prose in this slot is what made the
  //: status line a run-on paragraph.
  if (!live) return <Thinking />
  //: The ring belongs to the *run*, not to this step — every step
  //: here has already finished. While more is coming it spins over the
  //: line the assistant wrote for the work it is doing; when the run
  //: ends it becomes a tick over what the tool actually found.
  const finished = !busy
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <Thinking />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingLeft: 36,
        }}
      >
        <div
          key={live.title}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            animation: 'pcIn .4s ease both',
          }}
        >
          <span
            style={{
              flex: '0 0 18px',
              width: 18,
              height: 18,
              backgroundImage: `url(${live.icon})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '-.012em',
              color: '#31353b',
            }}
          >
            {live.title}
          </span>
        </div>
        <div
          key={live.sub}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'pcIn .4s ease both',
          }}
        >
          {finished ? (
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1f8a4c"
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flex: '0 0 15px' }}
              aria-hidden
            >
              <circle cx="12" cy="12" r="9.4" />
              <polyline points="7.9,12.5 10.8,15.4 16.3,9.2" />
            </svg>
          ) : (
            <span
              style={{
                flex: '0 0 15px',
                width: 15,
                height: 15,
                borderRadius: '50%',
                border: '1.8px solid rgba(31,138,76,.16)',
                borderTopColor: '#1f8a4c',
                animation: 'aRing 1s linear infinite',
              }}
            />
          )}
          <span style={{ fontSize: 14, color: '#9aa1ab', textWrap: 'pretty' }}>
            {finished ? (live.summary ?? live.sub) : live.sub}
          </span>
        </div>
        <div
          style={{
            alignSelf: 'flex-start',
            minWidth: 'min(380px,100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#fff',
            borderRadius: 16,
            boxShadow:
              '0 0 0 .5px rgba(30,32,38,.07), 0 8px 24px rgba(16,20,28,.05)',
            padding: '13px 18px 13px 15px',
            animation: 'pcIn .4s ease both',
          }}
        >
          {live.art ? (
            <>
              <span
                style={{
                  flex: '0 0 20px',
                  width: 20,
                  height: 20,
                  backgroundImage: `url(${live.artIcon ?? live.icon})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14.5,
                  letterSpacing: '-.01em',
                  color: '#31353b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  animation: 'pcIn .4s ease both',
                }}
              >
                {live.art}
              </span>
            </>
          ) : (
            //: The skeleton. It is not decoration — it is the honest
            //: shape of « something is coming and I cannot name it
            //: yet », and it becomes the real name in place.
            <>
              <span
                style={{
                  flex: '0 0 24px',
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: '#f1f2f4',
                  animation: 'aFade 1.6s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  flex: 1,
                  height: 10,
                  maxWidth: 290,
                  borderRadius: 999,
                  background: '#f1f2f4',
                  animation: 'aFade 1.6s ease-in-out infinite',
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The verdict: what the run concluded, and everything behind it.
 *
 * Read top to bottom the way the design draws it, and the order is the
 * founder's voice rule made visual — **the answer leads, the evidence
 * follows**. The trace toggle sits *above* the lead but collapsed, so
 * the working is available without being in the way; then the lead
 * sentence in the reading serif; then the counts; then what was
 * produced; then what to do next.
 *
 * The tallies never add up into a score. Three errors and five
 * warnings are three errors and five warnings — a defect and a
 * judgement call do not sum, which is why each keeps its own dot.
 */
const Verdict = ({
  lead,
  traceLines,
  tallies,
  talliesNote,
  outputs,
  primaryAction,
  altAction,
  onPrimary,
  onAlt,
}: {
  lead: string
  traceLines: string[]
  tallies: { label: string; n: number; dot: string }[]
  talliesNote?: string
  outputs: { icon: string; name: string; pick?: () => void }[]
  primaryAction?: string
  altAction?: string
  onPrimary?: () => void
  onAlt?: () => void
}) => {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      <Mark top={4} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {traceLines.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: 0,
              background: 'transparent',
              padding: 0,
              font: 'inherit',
              fontSize: 14.5,
              color: '#8f96a0',
              cursor: 'pointer',
            }}
          >
            <span>{open ? 'Hide the working' : `Show the working`}</span>
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flex: '0 0 14px',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform .2s ease',
              }}
              aria-hidden
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </button>
        )}
        {open && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderLeft: '1.5px solid #ecebe8',
              padding: '2px 0 2px 16px',
              animation: 'pcIn .3s ease both',
            }}
          >
            {traceLines.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: '#9aa1ab',
                  textWrap: 'pretty',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <span
          style={{
            fontFamily: font.serif,
            fontSize: 17.5,
            lineHeight: 1.55,
            color: '#1c1f23',
            maxWidth: '60ch',
            textWrap: 'pretty',
          }}
        >
          {lead}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
            animation: 'pcIn .4s ease both',
          }}
        >
          {tallies.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {tallies.map((c) => (
                  <span
                    key={c.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      fontSize: 14,
                      color: '#6b7280',
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 8px',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: c.dot,
                      }}
                    />
                    <span>
                      {c.n} {c.label}
                    </span>
                  </span>
                ))}
              </div>
              {!!talliesNote && (
                <span
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: '#b6bac1',
                    textWrap: 'pretty',
                  }}
                >
                  {talliesNote}
                </span>
              )}
            </div>
          )}
          {outputs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {outputs.map((o) => (
                <button
                  key={o.name}
                  onClick={o.pick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: '#fff',
                    border: 0,
                    borderRadius: 14,
                    boxShadow:
                      '0 0 0 .5px rgba(30,32,38,.07), 0 8px 22px rgba(16,20,28,.05)',
                    padding: '12px 18px 12px 14px',
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 20px',
                      width: 20,
                      height: 20,
                      backgroundImage: `url(${o.icon})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14.5,
                      letterSpacing: '-.008em',
                      color: '#31353b',
                    }}
                  >
                    {o.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {(primaryAction || altAction) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                paddingTop: 16,
              }}
            >
              {primaryAction && (
                <button
                  onClick={onPrimary}
                  style={{
                    border: 0,
                    background: '#1f2937',
                    color: '#fff',
                    borderRadius: 9,
                    height: 38,
                    padding: '0 17px',
                    font: 'inherit',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {primaryAction}
                </button>
              )}
              {altAction && (
                <button
                  onClick={onAlt}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: '#0060d0',
                    borderRadius: 999,
                    height: 38,
                    padding: '0 12px',
                    font: 'inherit',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {altAction}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The composer's pop-over, in the design's own materials: the frosted
 * white card at 13px radius with the two-part shadow.
 *
 * Anchored to the bottom of the « + » rather than positioned in
 * viewport coordinates. The design measures and places these because it
 * has one composer at a known place on the page; here the composer
 * moves — it is centred on an empty chat and pinned to the bottom on a
 * full one — and an anchored menu follows it without arithmetic.
 */
const menuCard = (width: number): React.CSSProperties => ({
  position: 'absolute',
  bottom: 'calc(100% + 10px)',
  left: 0,
  zIndex: 50,
  width,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(255,255,255,.96)',
  backdropFilter: 'blur(30px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
  borderRadius: 13,
  boxShadow: '0 18px 44px rgba(0,0,0,.19), 0 0 0 .5px rgba(0,0,0,.08)',
  padding: 6,
  animation: 'pcIn .14s ease both',
})

const menuRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  borderRadius: 8,
  font: 'inherit',
  cursor: 'pointer',
  padding: '9px 11px',
}

const menuNote: React.CSSProperties = {
  padding: '10px 11px',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#8f96a0',
  textWrap: 'pretty',
}

/**
 * The design's dot colour per attention tier — 1 defect, 2 assumption
 * at risk, 3 hygiene, and the grey for a deal whose worst tier predates
 * the elevation layer.
 */
const TIER_DOT = ['#6b7280', '#e0322d', '#e8a300', '#2b6cf5'] as const

/**
 * The verdict's counts, and they are the model's own.
 *
 * The design draws « 3 errors · 5 warnings · 2 suggestions » under the
 * lead, and the temptation is to fill that row whatever the run
 * produced. These come off the deal's stored check instead — the
 * findings that are open and the checks that fail — and a deal nobody
 * has checked has **no row at all**, because « 0 errors » and « nobody
 * looked » are different sentences and only one of them is true.
 *
 * They deliberately never add up. A defect and a judgement call do not
 * sum, which is the founder's own rule, and each keeps its own dot.
 */
const tallies = (
  deal: DealListItem,
): { label: string; n: number; dot: string }[] => {
  if (deal.checked_at === null) return []
  const counts: { label: string; n: number; dot: string }[] = []
  if (deal.open_findings > 0)
    counts.push({
      n: deal.open_findings,
      label: deal.open_findings === 1 ? 'open finding' : 'open findings',
      dot: TIER_DOT[deal.worst_tier] ?? TIER_DOT[0],
    })
  if (deal.failing_checks > 0)
    counts.push({
      n: deal.failing_checks,
      label: deal.failing_checks === 1 ? 'check failing' : 'checks failing',
      dot: '#e8a300',
    })
  return counts
}

/** What the counts are of, and when they were last true. */
const talliesNote = (deal: DealListItem): string => {
  if (deal.checked_at === null) return ''
  const when = new Date(deal.checked_at)
  const named = deal.model_name ?? 'this project'
  const stale = deal.stale ? ', and a document has arrived since' : ''
  return `On ${named}, as of the check on ${when.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
  })}${stale}.`
}

/** The answer split for the design: prose, then the grey ends-line. */
const split = (answer: string): { text: string; ends: string } => {
  const paragraphs = answer
    .split(/\n{2,}/)
    .map((one) => one.trim())
    .filter(Boolean)
  if (paragraphs.length < 2) return { text: answer.trim(), ends: '' }
  return {
    text: paragraphs.slice(0, -1).join('\n\n'),
    ends: paragraphs[paragraphs.length - 1]!,
  }
}

export interface AssistantProps {
  api: TieOutApi
  /** Null while loading. The chip lists every project this person is on. */
  deals: DealListItem[] | null
  /** Clicking a row's cell lands in the model reader. */
  onOpenModel?: (deal: DealListItem) => void
}

export const Assistant = ({ api, deals, onOpenModel }: AssistantProps) => {
  const models = deals ?? []
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = models.find((one) => one.id === pickedId) ?? models[0] ?? null

  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [pjMenu, setPjMenu] = useState(false)
  const scroll = useRef<HTMLDivElement | null>(null)

  /**
   * The reveal, paced.
   *
   * **This is the piece the design had and I removed.** The design's
   * own `asType` walked a finished string forward at a constant rate;
   * when real streaming replaced it, the screen started painting
   * tokens the instant they landed — and tokens land in bursts, so it
   * lurched. Nothing was wrong with the stream; what was missing was
   * the clock in front of it.
   *
   * The step is proportional to the backlog, which does two things at
   * once: it never stalls while there are words waiting, and it never
   * empties the buffer in one jump. A long burst is spread over a few
   * frames; a slow trickle is drawn as it arrives and no faster,
   * because inventing pace the model has not earned is its own kind of
   * lie about how fast the answer came.
   */
  useEffect(() => {
    const tick = window.setInterval(() => {
      setMessages((was) => {
        const last = was[was.length - 1]
        if (!last || last.role !== 'answer') return was
        const full = last.text.length
        const at = last.shown ?? full
        if (at >= full) return was
        const step = Math.max(2, Math.ceil((full - at) / 6))
        return [
          ...was.slice(0, -1),
          { ...last, shown: Math.min(full, at + step) },
        ]
      })
    }, 24)
    return () => window.clearInterval(tick)
  }, [])

  //: The rail: **closed until it is asked for**, which is what the
  //: design does — `histOpen` is never initialised in
  //: `Swens_Workspace_2.html`, so it opens at `0px` and the composer
  //: has the whole width. The comment here used to say « open by
  //: default as drawn » and that was simply not what the file drew.
  const [histOpen, setHistOpen] = useState(false)
  const [histFind, setHistFind] = useState(false)
  const [histQ, setHistQ] = useState('')
  const [histScope, setHistScope] = useState<'project' | 'all'>('project')
  const findRef = useRef<HTMLInputElement | null>(null)
  const [past, setPast] = useState<PastChat[]>([])
  const chatId = useRef<string>(freshId())
  useEffect(() => {
    setPast(loadHistory())
  }, [])

  //: ⌘K — the chip on the search row is a promise. Opens the rail
  //: first if it is shut; does nothing while another screen shows.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      setHistOpen(true)
      setHistFind(true)
      setTimeout(() => findRef.current?.focus(), 60)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  //: A finished exchange is saved as this chat's record.
  useEffect(() => {
    if (picked === null) return
    const asked = messages.filter((one) => one.role === 'you')
    const last = messages[messages.length - 1]
    //: A run ends in a verdict rather than an answer, and a chat that
    //: ended that way is just as finished — leaving it out of the rail
    //: would lose exactly the conversations worth reopening.
    if (asked.length === 0 || !last) return
    if (last.role !== 'answer' && last.role !== 'verdict') return
    const title = asked[0]!.text.slice(0, 80)
    setPast((was) => {
      const record: PastChat = {
        id: chatId.current,
        at: Date.now(),
        dealId: picked.id,
        dealName: picked.name,
        title,
        messages,
      }
      const next = [record, ...was.filter((one) => one.id !== record.id)]
      saveHistory(next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [messages])

  const history: AskTurn[] = messages
    //: A run in flight has no text yet, and a turn with nothing in it
    //: would replay to the model as though somebody had said nothing.
    .filter((one) => one.role !== 'working' && one.role !== 'run')
    .slice(-6)
    .map((one) => ({
      who: one.role === 'you' ? ('you' as const) : ('pierce' as const),
      text: one.text,
    }))

  // --- the composer's « + » ---------------------------------------
  //
  // Three items, and the design fixed all three: Attach a file (⌘⇧A),
  // Mention (@), Use my Excel selection. Each is wired to a real
  // capability or says plainly that it has none here.

  const [plusOpen, setPlusOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const fileBox = useRef<HTMLInputElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)

  //: The composer grows to hold what is in it.
  //
  //: It was a fixed 22px tall with the overflow hidden, which is what
  //: the design draws — the design grows it in script and this did
  //: not. Pasting an answer back in put the text in the box and
  //: showed one line of it, so the paste read as having failed. The
  //: cap is 220px: past that it scrolls rather than swallowing the
  //: screen.
  useEffect(() => {
    const field = box.current
    if (!field) return
    field.style.height = '22px'
    field.style.height = `${Math.min(220, Math.max(22, field.scrollHeight))}px`
  }, [prompt])

  /** What can be mentioned, off this project — never a fixed list. */
  const [mentions, setMentions] = useState<
    { label: string; items: { token: string; note: string }[] }[] | null
  >(null)

  //: A file dropped into the chat is a file put into the project: it is
  //: read, checked and kept, and the reply says what became of it in
  //: the server's own words. Nothing here pretends to have read a file
  //: it only received.
  const attach = (file: File) => {
    if (picked === null) return
    setPlusOpen(false)
    setMessages((was) => [
      ...was,
      { role: 'you', text: `Added ${file.name}` },
      { role: 'working', text: `Reading ${file.name}` },
    ])
    api
      .upload(picked.id, file)
      .then((made) => {
        const said =
          made.status === 'failed'
            ? (made.error ?? `${made.filename} could not be read.`)
            : made.status === 'ready'
              ? `${made.filename} is in ${picked.name}, read as version ${made.version}. Ask me about it.`
              : `${made.filename} is in ${picked.name} and still being read.`
        setMessages((was) => [
          ...was.slice(0, -1),
          { role: 'answer', text: said, rows: [], ends: '' },
        ])
      })
      .catch((problem: unknown) =>
        setMessages((was) => [
          ...was.slice(0, -1),
          {
            role: 'answer',
            text:
              problem instanceof Error
                ? problem.message
                : 'that file could not be added',
            rows: [],
            ends: '',
          },
        ]),
      )
  }

  //: ⌘⇧A — the shortcut the design prints beside the menu item, and a
  //: printed shortcut that does nothing is a lie in 13px type.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a' || !e.shiftKey) return
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      fileBox.current?.click()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  /**
   * What this project holds that a question can point at.
   *
   * Fetched when the menu opens rather than kept fresh: it is a list of
   * names, and a name that is one upload out of date costs nothing,
   * where three background polls per chat cost the whole screen.
   */
  const openMentions = () => {
    setPlusOpen(false)
    setMentionOpen(true)
    if (picked === null || mentions !== null) return
    Promise.all([
      api.deal(picked.id).catch(() => null),
      api
        .findings(picked.id)
        .catch(() => [] as Awaited<ReturnType<TieOutApi['findings']>>),
    ]).then(async ([page, found]) => {
      const groups: {
        label: string
        items: { token: string; note: string }[]
      }[] = []
      const model = (page?.documents ?? []).find((one) => one.kind === 'model')
      if (model) {
        const past = await api.versions(model.id).catch(() => [])
        if (past.length > 1)
          groups.push({
            label: 'Versions',
            items: past.slice(0, 6).map((one) => ({
              token: `@v${one.version}`,
              note: new Date(one.uploaded_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              }),
            })),
          })
      }
      const documents = (page?.documents ?? []).filter(
        (one) => one.kind !== 'model',
      )
      if (documents.length > 0)
        groups.push({
          label: 'Documents',
          items: documents.slice(0, 6).map((one) => ({
            token: `@${one.filename}`,
            note: `${one.kind} · v${one.version}`,
          })),
        })
      if (found.length > 0)
        groups.push({
          label: 'Findings',
          items: found.slice(0, 6).map((one) => ({
            token: `@${one.source.ref ?? one.where.label}`,
            note: one.headline || one.title,
          })),
        })
      setMentions(groups)
    })
  }

  /** Put a mention where the person was typing. */
  const mention = (token: string) => {
    setMentionOpen(false)
    setPrompt((was) => `${was.replace(/(^|\s)@[^\s]*$/, '$1')}${token} `)
  }

  //: The marked-up model: the server builds the copy on request and
  //: this hands it to the browser. A refusal — no model, nothing open
  //: to mark up — is the server's own sentence, shown as it stands.
  const [markupWord, setMarkupWord] = useState('')
  const downloadMarkup = (dealId: string) => {
    setMarkupWord('')
    api
      .markedUpModel(dealId)
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
      })
      .catch((problem: unknown) =>
        setMarkupWord(
          problem instanceof Error ? problem.message : 'something went wrong',
        ),
      )
  }

  /**
   * What the run produced, as cards — and only what it really did.
   *
   * The design shows « proposed v23 » and « Review Memo » here. Swens
   * writes neither: it does not author the thing it reviews. What it
   * *does* produce is the model with every finding written into the
   * cells beside it, which is a real file the server builds on request
   * — so that is the card, and there is no second one invented to fill
   * the row.
   */
  const produced = (
    answer: Asked,
  ): { icon: string; name: string; pick?: () => void }[] => {
    if (!answer.model || picked === null) return []
    const dealId = picked.id
    return [
      {
        icon: fileIcon.xls,
        name: `${answer.model} — marked up`,
        pick: () => downloadMarkup(dealId),
      },
    ]
  }

  /**
   * Ask, and draw what happens while it is being answered.
   *
   * `asRun` is the difference between the two shapes the design has for
   * work in progress. An ordinary question shows one shimmering line —
   * the assistant's own status line, replaced as each step lands. A
   * question the person answered a clarifying card for shows the run:
   * the step, its result, and the thing it produced. Both are fed by
   * the same real steps; only the drawing differs.
   */
  const ask = (text: string, asRun = false) => {
    const q = text.trim()
    if (!q || busy || picked === null) return
    setPrompt('')
    setBusy(true)
    setMessages((was) => [
      ...was,
      { role: 'you', text: q },
      asRun
        ? { role: 'run', text: '', shown: 0, stages: [], busy: true }
        : { role: 'working', text: 'Thinking', shown: 0 },
    ])

    //: **The model's own prose is no longer shown while it works.**
    //: It writes paragraphs, not status lines, and painting them into
    //: one slot produced a run-on line that grew and never cleared.
    //: The status line is the short derived one that comes with each
    //: step — « Walking back from Debt!F44 » — and it replaces the one
    //: before it.

    //: One step, as it lands. The line is the assistant's own where it
    //: wrote one — never « Reading the model » on every step of every
    //: run, which is the placeholder this replaced.
    const landed = (stage: AskedStage) => {
      const one: RunStage = {
        icon: stage.kind === 'source' ? fileIcon.pdf : fileIcon.xls,
        title: stage.title,
        sub: stage.sub,
        summary: stage.summary,
        art: stage.art || undefined,
        done: true,
      }
      setMessages((was) => {
        const last = was[was.length - 1]
        if (!last) return was
        if (last.role === 'run')
          return [
            ...was.slice(0, -1),
            {
              ...last,
              live: '',
              shown: 0,
              stages: [...(last.stages ?? []), one],
            },
          ]
        if (last.role === 'working')
          return [...was.slice(0, -1), { ...last, shown: 0, text: stage.sub }]
        return was
      })
    }

    api
      .assistStream(picked.id, q, { history }, landed)
      .then((answer: Asked) => {
        //: The assistant stopped to settle one thing first. Draw its
        //: question and the card, and wait — picking a choice is just
        //: the next message, so the model is told which way rather
        //: than left to guess.
        //
        //: The question comes off the tool call, not the prose: an
        //: option narrated but not offered is one the screen must
        //: not draw.
        const clarify = answer.clarify
        if (clarify && clarify.options.length >= 2) {
          setMessages((was) => [
            ...was.slice(0, -1),
            {
              role: 'ask',
              text: clarify.question,
              cardTitle: clarify.title,
              cardBlurb: clarify.blurb,
              //: The file kinds the run would touch, read off the
              //: model the deal actually holds — never a pair of icons
              //: chosen to make the card look full.
              cardIcons: answer.model ? [fileIcon.xls] : [],
              options: clarify.options.map((label) => ({
                label,
                //: A pick is the next message, and it runs — so it is
                //: drawn as a run rather than as a shimmering line.
                pick: () => ask(label, true),
              })),
            },
          ])
          return
        }
        const { text: main, ends } = split(answer.answer)
        const used = answer.steps.filter((one) => one.ok).length
        if (asRun) {
          //: The verdict: what the run concluded, and everything behind
          //: it. Every part of it is the run's own — the lead is the
          //: assistant's first paragraph, the working is the tools'
          //: own lines, the tallies are the model's stored findings.
          setMessages((was) => [
            ...was.slice(0, -1),
            {
              role: 'verdict',
              text: main,
              ends,
              rows: answer.rows ?? [],
              rowsLabel: answer.rows_label,
              traceLines: (answer.stages ?? [])
                .filter((one) => one.summary)
                .map((one) => one.summary),
              tallies: tallies(picked),
              talliesNote: talliesNote(picked),
              outputs: produced(answer),
              primaryAction: onOpenModel ? 'Open the model' : undefined,
            },
          ])
          return
        }
        setMessages((was) => [
          ...was.slice(0, -1),
          {
            role: 'answer',
            text: main,
            shown: 0,
            ends,
            rows: answer.rows ?? [],
            rowsLabel: answer.rows_label,
            trace:
              used > 0 ? `Used ${used} ${used === 1 ? 'tool' : 'tools'}` : '',
            scope:
              answer.model && (answer.other_models ?? []).length > 0
                ? {
                    model: answer.model,
                    version: answer.model_version ?? null,
                    others: answer.other_models ?? [],
                  }
                : undefined,
          },
        ])
      })
      .catch((problem: Error) => {
        setMessages((was) => [
          ...was.slice(0, -1),
          {
            role: 'answer',
            text: String(problem.message ?? 'Swens could not answer.'),
            rows: [],
            ends: '',
          },
        ])
      })
      .finally(() => setBusy(false))
  }

  const newChat = () => {
    chatId.current = freshId()
    setMessages([])
    setPrompt('')
  }
  const openPast = (record: PastChat) => {
    chatId.current = record.id
    setMessages(record.messages)
    const deal = models.find((one) => one.id === record.dealId)
    if (deal) setPickedId(deal.id)
    setHistFind(false)
    setHistQ('')
  }

  //: The rail's data: search over title and project, scope over the
  //: picked project. Dated groups, empty groups hidden — the
  //: design's own filter.
  const q = histQ.trim().toLowerCase()
  const hit = (one: PastChat) =>
    (!q || `${one.title} ${one.dealName}`.toLowerCase().includes(q)) &&
    (histScope === 'all' || (picked !== null && one.dealId === picked.id))
  const shown = past.filter(hit)
  const groups = useMemo(() => {
    const now = Date.now()
    const today: PastChat[] = []
    const week: PastChat[] = []
    const older: PastChat[] = []
    for (const one of shown) {
      const age = now - one.at
      if (new Date(one.at).toDateString() === new Date().toDateString())
        today.push(one)
      else if (age < 7 * 86_400_000) week.push(one)
      else older.push(one)
    }
    return [
      { label: 'Today', items: today },
      { label: 'Previous 7 days', items: week },
      { label: 'Older', items: older },
    ].filter((g) => g.items.length > 0)
  }, [shown])

  const [shareSaid, setShareSaid] = useState(false)
  const share = () => {
    const url = `${window.location.href.split('#')[0]}#chat=${chatId.current}`
    const done = () => {
      setShareSaid(true)
      setTimeout(() => setShareSaid(false), 1800)
    }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done)
    else done()
  }

  const empty = messages.length === 0

  //: No projects yet: Ask has nothing to be about. The design's
  //: empty-state pattern, pointing at the place that fixes it.
  if (models.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          padding: 40,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: font.brand, fontSize: 38, lineHeight: 1 }}>
            S
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              letterSpacing: '-.012em',
              marginTop: 18,
              color: '#1c1f23',
            }}
          >
            Ask me about your models.
          </div>
          <div
            style={{
              fontSize: 14,
              color: ink.secondary,
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            {deals === null
              ? ''
              : 'Connect a project first — Ask answers from your own files, and there are none yet.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        background: '#fff',
      }}
    >
      {/* The history rail — a clipping shell the design animates. */}
      <div
        style={{
          flex: `0 0 ${histOpen ? '298px' : '0px'}`,
          width: histOpen ? 298 : 0,
          alignSelf: 'stretch',
          overflow: 'hidden',
          background: '#fdfdfd',
          borderRight: '.5px solid #f0eff1',
          transition: 'flex-basis .2s ease, width .2s ease',
        }}
      >
        <div
          style={{
            width: 298,
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 14px 18px',
          }}
        >
          {histFind ? (
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                background: 'rgba(16,20,28,.05)',
                borderRadius: 10,
                padding: '11px 10px',
                marginBottom: 8,
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9aa1ab"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 17px' }}
              >
                <circle cx="11" cy="11" r="6.6" />
                <line x1="16" y1="16" x2="20.5" y2="20.5" />
              </svg>
              <input
                ref={findRef}
                autoFocus
                value={histQ}
                onChange={(e) => setHistQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setHistFind(false)
                    setHistQ('')
                  }
                }}
                placeholder="Search chats"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  fontSize: 15,
                  letterSpacing: '-.008em',
                  color: '#1c1f23',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  setHistFind(false)
                  setHistQ('')
                }}
                title="Clear"
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  border: 0,
                  background: 'transparent',
                  borderRadius: 5,
                  padding: 2,
                  color: '#a2a29c',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
                  <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setHistFind(true)
                setTimeout(() => findRef.current?.focus(), 60)
              }}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                textAlign: 'left',
                border: 0,
                background: 'transparent',
                borderRadius: 10,
                font: 'inherit',
                fontSize: 15,
                letterSpacing: '-.008em',
                color: '#9aa1ab',
                cursor: 'pointer',
                padding: '11px 10px',
                marginBottom: 8,
              }}
            >
              <span style={{ display: 'flex', color: '#9aa1ab' }}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: '0 0 17px' }}
                >
                  <circle cx="11" cy="11" r="6.6" />
                  <line x1="16" y1="16" x2="20.5" y2="20.5" />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Search chats</span>
              <span
                style={{
                  flex: '0 0 auto',
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: 0,
                  color: '#a2a29c',
                  background: '#f2f2f0',
                  borderRadius: 5,
                  padding: '2px 5px',
                }}
              >
                ⌘K
              </span>
            </button>
          )}
          <button
            onClick={newChat}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              width: '100%',
              textAlign: 'left',
              border: 0,
              background: 'transparent',
              borderRadius: 10,
              font: 'inherit',
              fontSize: 15,
              letterSpacing: '-.008em',
              color: '#1c1f23',
              cursor: 'pointer',
              padding: '11px 10px',
              marginBottom: 2,
            }}
          >
            <span style={{ display: 'flex', color: '#6b7280' }}>
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 17px' }}
              >
                <path d="M20 12.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.6L4.5 21l1.3-4A7.4 7.4 0 0 1 4.9 12.5 7.5 7.5 0 0 1 12.4 5 7.5 7.5 0 0 1 20 12.5z" />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>New chat</span>
          </button>
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'auto',
              scrollbarWidth: 'none',
              display: 'flex',
              flexDirection: 'column',
              paddingTop: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                margin: '20px 10px 0',
              }}
            >
              {(
                [
                  { key: 'project', label: 'This project' },
                  { key: 'all', label: 'All chats' },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setHistScope(s.key)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    font: 'inherit',
                    fontSize: 13,
                    fontWeight: histScope === s.key ? 500 : 400,
                    color: histScope === s.key ? '#1c1f23' : '#a2a29c',
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {groups.map((g) => (
              <span
                key={g.label}
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: '#a2a29c',
                    padding: '22px 10px 6px',
                  }}
                >
                  {g.label}
                </span>
                {g.items.map((one) => (
                  <button
                    key={one.id}
                    onClick={() => openPast(one)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      background:
                        one.id === chatId.current
                          ? 'rgba(16,20,28,.06)'
                          : 'transparent',
                      borderRadius: 10,
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '9px 10px',
                    }}
                  >
                    <span
                      style={{
                        maxWidth: '100%',
                        fontSize: 15,
                        letterSpacing: '-.008em',
                        color:
                          one.id === chatId.current ? '#15171b' : '#4a4f57',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {one.title}
                    </span>
                  </button>
                ))}
              </span>
            ))}
            {q !== '' && shown.length === 0 && (
              <>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14.5,
                    letterSpacing: '-.008em',
                    color: '#4a4f57',
                    padding: '26px 10px 0',
                  }}
                >
                  No chats match “{histQ}”
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: '#8f96a0',
                    padding: '6px 10px 0',
                    textWrap: 'pretty',
                  }}
                >
                  {histScope === 'project'
                    ? 'Only this project’s chats are being searched. Switch to All to look across every project.'
                    : 'Nothing in any project matches.'}
                </span>
              </>
            )}
            {q === '' && shown.length === 0 && (
              <span
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: '#8f96a0',
                  padding: '26px 10px 0',
                  textWrap: 'pretty',
                }}
              >
                {histScope === 'project'
                  ? 'No chats in this project yet.'
                  : 'No chats yet. They appear here as you ask.'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The main column. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 22px 12px',
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={() => setHistOpen((was) => !was)}
            title="Chat history"
            style={{
              flex: '0 0 auto',
              pointerEvents: 'auto',
              border: 0,
              background: 'transparent',
              borderRadius: 9,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              color: '#8e8e93',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" />
            </svg>
          </button>
          <span style={{ flex: 1, minWidth: 0 }} />
          {!!markupWord && (
            //: The server's own refusal — no model, nothing open to
            //: mark up — shown where it happened rather than swallowed
            //: into a download that silently never arrives.
            <span
              style={{
                flex: '0 1 auto',
                pointerEvents: 'auto',
                fontSize: 12.5,
                lineHeight: 1.5,
                letterSpacing: '-.01em',
                color: '#6b7280',
                background: '#fff',
                borderRadius: 12,
                boxShadow:
                  '0 0 0 .5px rgba(30,32,38,.07), 0 6px 18px rgba(16,22,35,.05)',
                padding: '6px 12px',
                textWrap: 'pretty',
              }}
            >
              {markupWord}
            </span>
          )}
          {shareSaid && (
            <span
              style={{
                flex: '0 0 auto',
                pointerEvents: 'auto',
                fontSize: 12.5,
                letterSpacing: '-.01em',
                color: '#6b7280',
                background: '#fff',
                borderRadius: 999,
                boxShadow:
                  '0 0 0 .5px rgba(30,32,38,.07), 0 6px 18px rgba(16,22,35,.05)',
                padding: '5px 11px',
                animation: 'pcIn .24s ease both',
              }}
            >
              Link copied
            </span>
          )}
          <button
            onClick={share}
            title="Share"
            style={{
              flex: '0 0 auto',
              pointerEvents: 'auto',
              border: 0,
              background: 'transparent',
              borderRadius: 9,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              color: '#8e8e93',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15V4" />
              <polyline points="8,7.5 12,3.5 16,7.5" />
              <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
          </button>
        </div>

        {/* Messages. */}
        <div
          ref={scroll}
          style={{
            flex: empty ? '0 1 auto' : 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 clamp(18px,5vw,40px) 14px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 760,
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(34px,6vh,54px)',
              padding: `${empty ? 0 : 64}px 0 8px`,
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'pcIn .24s ease both',
                }}
              >
                {m.role === 'you' && (
                  <div
                    style={{
                      alignSelf: 'flex-end',
                      background: '#f4f4f2',
                      borderRadius: '16px 16px 5px 16px',
                      padding: '11px 15px',
                      maxWidth: 'min(86%,52ch)',
                      fontSize: 15.5,
                      lineHeight: 1.55,
                      letterSpacing: '-.006em',
                      textWrap: 'pretty',
                    }}
                  >
                    {m.text}
                  </div>
                )}
                {m.role === 'working' && <Shimmer text={m.text} />}
                {m.role === 'ask' && (
                  //: The chat asking one question back. The card names
                  //: what it would do; nothing runs until a choice is
                  //: picked, and the options vanish once one is.
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      alignItems: 'flex-start',
                      animation: 'pcIn .3s ease both',
                    }}
                  >
                    <Mark top={5} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 22,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: font.serif,
                          fontSize: 17.5,
                          lineHeight: 1.55,
                          color: '#1c1f23',
                          textWrap: 'pretty',
                        }}
                      >
                        {m.text}
                      </span>
                      {(m.options?.length ?? 0) > 0 && (
                        <Choices
                          title={m.cardTitle ?? ''}
                          blurb={m.cardBlurb ?? ''}
                          icons={m.cardIcons ?? []}
                          options={m.options ?? []}
                        />
                      )}
                    </div>
                  </div>
                )}
                {m.role === 'run' && (
                  <Run stages={m.stages ?? []} busy={m.busy} />
                )}
                {m.role === 'verdict' && (
                  <Verdict
                    lead={m.text}
                    traceLines={m.traceLines ?? []}
                    tallies={m.tallies ?? []}
                    talliesNote={m.talliesNote}
                    outputs={m.outputs ?? []}
                    primaryAction={m.primaryAction}
                    altAction={m.altAction}
                    onPrimary={
                      picked !== null && onOpenModel
                        ? () => onOpenModel(picked)
                        : undefined
                    }
                  />
                )}
                {m.role === 'answer' && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Mark top={5} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 18,
                      }}
                    >
                      <span
                        style={{
                          //: Revision 2's reading serif, not the UI
                          //: face: the answer is the one thing on this
                          //: screen a person reads rather than scans.
                          //: No character cap — the founder's call, and
                          //: it runs the width of the column.
                          fontFamily: font.serif,
                          fontSize: 17.5,
                          lineHeight: 1.55,
                          color: '#1c1f23',
                          whiteSpace: 'pre-wrap',
                          textWrap: 'pretty',
                        }}
                      >
                        {m.shown === undefined || m.shown >= m.text.length ? (
                          m.text
                        ) : (
                          //: Still arriving. Same face, same measure,
                          //: same place — only the words are not all
                          //: here yet, and each fades in as it lands.
                          <Words text={m.text.slice(0, m.shown)} />
                        )}
                      </span>
                      {m.scope !== undefined && (
                        //: Which workbook this paragraph is about. A
                        //: deal usually holds one model and this stays
                        //: away; where it holds two, an answer that
                        //: does not say which one it read is a
                        //: confident paragraph about a file the reader
                        //: may not have meant.
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'baseline',
                            flexWrap: 'wrap',
                            padding: '10px 14px',
                            background: '#fdfbf6',
                            border: '.5px solid #f0e9da',
                            borderRadius: 14,
                            fontSize: 12.5,
                            lineHeight: 1.6,
                            color: '#6b5f48',
                          }}
                        >
                          <span style={{ color: '#8a7a5c' }}>Read from</span>
                          <span
                            style={{
                              fontFamily: font.mono,
                              fontSize: 12,
                              color: '#3d3527',
                            }}
                          >
                            {m.scope.model}
                            {m.scope.version !== null
                              ? ` v${m.scope.version}`
                              : ''}
                          </span>
                          <span>
                            — this project also holds{' '}
                            {m.scope.others.join(', ')}, which this answer did
                            not read.
                          </span>
                        </div>
                      )}
                      {m.rows !== undefined && m.rows.length > 0 && (
                        <Cells rows={m.rows} label={m.rowsLabel} />
                      )}
                      {(!!m.ends || !!m.trace) && (
                        //: The notes at the foot of the answer: what
                        //: the review could not do, and how it was
                        //: done. Both belong under the answer rather
                        //: than in it — the founder's line, and the
                        //: reason a walk's own log stopped appearing
                        //: mid-sentence.
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            borderTop: '.5px solid #f0eff1',
                            paddingTop: 12,
                            marginTop: 2,
                          }}
                        >
                          {!!m.ends && (
                            <span
                              style={{
                                fontSize: 13,
                                lineHeight: 1.55,
                                color: '#9aa1ab',
                                textWrap: 'pretty',
                              }}
                            >
                              {m.ends}
                            </span>
                          )}
                          {!!m.trace && (
                            <span style={{ fontSize: 12, color: '#c2c6cc' }}>
                              {m.trace}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Greeting + composer. */}
        <div
          style={{
            flex: empty ? 1 : '0 0 auto',
            minHeight: 0,
            padding: '14px clamp(18px,5vw,40px) 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: empty ? 'center' : 'flex-end',
            gap: 10,
          }}
        >
          {empty && (
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingBottom: 'clamp(10px,2.4vh,26px)',
              }}
            >
              <span
                style={{
                  fontFamily: font.serif,
                  fontSize: 'clamp(28px,4.4vw,42px)',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  letterSpacing: '-.012em',
                  color: '#1c1f23',
                  textAlign: 'center',
                  textWrap: 'pretty',
                }}
              >
                What can I help you with today?
              </span>
            </div>
          )}
          <div
            style={{
              width: '100%',
              maxWidth: 800,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 8,
              rowGap: 12,
              border: '1px solid rgba(16,22,35,.07)',
              background: '#fff',
              borderRadius: 24,
              padding: '16px 14px 13px 20px',
              boxShadow:
                '0 1px 2px rgba(16,22,35,.05), 0 12px 32px rgba(16,22,35,.09), inset 0 1px 0 rgba(255,255,255,.7)',
            }}
          >
            <input
              ref={fileBox}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) attach(file)
              }}
            />
            <div
              style={{
                order: 2,
                position: 'relative',
                flex: '0 0 auto',
                display: 'flex',
              }}
            >
              <button
                onClick={() => {
                  setMentionOpen(false)
                  setPlusOpen((was) => !was)
                }}
                title="Add"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 0,
                  background: 'transparent',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {plusOpen && (
                <>
                  <span
                    onClick={() => setPlusOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  />
                  <div style={menuCard(328)}>
                    <button
                      onClick={() => {
                        setPlusOpen(false)
                        fileBox.current?.click()
                      }}
                      style={menuRow}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4a4f57"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flex: '0 0 17px' }}
                      >
                        <path d="M21 11.5 12.5 20a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.4 1.4 0 0 1-2-2l7.4-7.4" />
                      </svg>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14.5,
                          color: '#15171b',
                        }}
                      >
                        Attach a file
                      </span>
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 13,
                          color: '#9a9a95',
                        }}
                      >
                        ⌘⇧A
                      </span>
                    </button>
                    <button onClick={openMentions} style={menuRow}>
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4a4f57"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flex: '0 0 17px' }}
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M16 8v5a3 3 0 0 0 5 -2.2A9 9 0 1 0 16.5 19.4" />
                      </svg>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14.5,
                          color: '#15171b',
                        }}
                      >
                        Mention
                      </span>
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontFamily: font.mono,
                          fontSize: 12.5,
                          letterSpacing: 0,
                          color: '#9a9a95',
                        }}
                      >
                        @
                      </span>
                    </button>
                    {/* The design draws this greyed when the Excel
                        panel is not connected, and on the web it never
                        is — the panel is the add-in, a different
                        surface. Shown and disabled rather than hidden:
                        « not here » is the answer, and a person who
                        heard about it should find out where it lives
                        rather than wonder if they imagined it. */}
                    <button
                      disabled
                      title="Open Swens in the Excel side panel to use your selection"
                      style={{ ...menuRow, cursor: 'default', opacity: 0.45 }}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4a4f57"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flex: '0 0 17px' }}
                      >
                        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                        <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
                        <line x1="9" y1="9.5" x2="9" y2="19.5" />
                      </svg>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 14.5, color: '#15171b' }}>
                          Use my Excel selection
                        </span>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11.5,
                            letterSpacing: 0,
                            color: '#9a9a95',
                          }}
                        >
                          Excel panel not connected
                        </span>
                      </span>
                    </button>
                  </div>
                </>
              )}
              {mentionOpen && (
                <>
                  <span
                    onClick={() => setMentionOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  />
                  <div
                    style={{
                      ...menuCard(344),
                      maxHeight: 420,
                      overflow: 'auto',
                      background: '#fff',
                    }}
                  >
                    {mentions === null && (
                      <span style={menuNote}>Reading the project…</span>
                    )}
                    {mentions !== null && mentions.length === 0 && (
                      <span style={menuNote}>
                        Nothing to mention yet — this project holds no
                        documents, versions or findings to point at.
                      </span>
                    )}
                    {(mentions ?? []).map((group) => (
                      <div
                        key={group.label}
                        style={{ display: 'flex', flexDirection: 'column' }}
                      >
                        <span
                          style={{
                            padding: '9px 11px 5px',
                            fontSize: 12,
                            color: '#a2a29c',
                          }}
                        >
                          {group.label}
                        </span>
                        {group.items.map((one) => (
                          <button
                            key={one.token}
                            onClick={() => mention(one.token)}
                            style={{ ...menuRow, gap: 11, padding: '8px 11px' }}
                          >
                            <span
                              style={{
                                flex: '0 0 auto',
                                fontFamily: font.mono,
                                fontSize: 12.5,
                                letterSpacing: 0,
                                color: '#2b6cf5',
                              }}
                            >
                              {one.token}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 14,
                                color: '#4a4f57',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {one.note}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                //: Typing « @ » is the same request as picking Mention
                //: off the menu, and the design opens the same list.
                if (/(^|\s)@[^\s]*$/.test(e.target.value)) openMentions()
                else setMentionOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMentionOpen(false)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  setMentionOpen(false)
                  ask(prompt)
                }
              }}
              placeholder="Ask anything"
              ref={box}
              rows={1}
              style={{
                order: 1,
                flex: '1 1 100%',
                minWidth: 0,
                alignSelf: 'center',
                border: 0,
                outline: 'none',
                resize: 'none',
                font: 'inherit',
                fontSize: 15,
                lineHeight: '22px',
                color: '#15171b',
                background: 'transparent',
                padding: 0,
                margin: 0,
                //: Grown to its content by the effect on `prompt`, and
                //: capped so a pasted page does not eat the screen.
                //: It was a fixed 22px with the overflow hidden, which
                //: meant a pasted answer went in and could not be
                //: seen — the paste looked like it had failed.
                height: 22,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            />
            <button
              onClick={() => ask(prompt)}
              title="Send"
              style={{
                order: 5,
                marginLeft: 'auto',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 0,
                background: '#16181c',
                boxShadow: '0 1px 2px rgba(16,22,35,.22)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flex: '0 0 auto',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5,12 12,5 19,12" />
              </svg>
            </button>
          </div>
          {empty && picked !== null && (
            <div
              style={{
                width: '100%',
                maxWidth: 800,
                display: 'flex',
                justifyContent: 'center',
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <button
                  onClick={() => setPjMenu((was) => !was)}
                  title="Choose the project this chat works in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    border: '1px solid #e2e1de',
                    background: '#fbfbfa',
                    borderRadius: 999,
                    height: 34,
                    padding: '0 12px 0 11px',
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0060d0"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 15px' }}
                  >
                    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
                  </svg>
                  <span
                    style={{
                      fontSize: 13.5,
                      letterSpacing: '-.006em',
                      color: '#0060d0',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {picked.name}
                  </span>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a2a29c"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 11px' }}
                  >
                    <polyline points="5,9 12,16 19,9" />
                  </svg>
                </button>
                {pjMenu && (
                  <>
                    <span
                      onClick={() => setPjMenu(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 10px)',
                        zIndex: 50,
                        width: 300,
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(255,255,255,.96)',
                        backdropFilter: 'blur(30px) saturate(1.8)',
                        WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
                        borderRadius: 13,
                        boxShadow:
                          '0 18px 44px rgba(0,0,0,.19), 0 0 0 .5px rgba(0,0,0,.08)',
                        padding: 6,
                        animation: 'pcIn .14s ease both',
                      }}
                    >
                      {models.map((one) => (
                        <button
                          key={one.id}
                          onClick={() => {
                            setPickedId(one.id)
                            setPjMenu(false)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            background:
                              one.id === picked.id
                                ? 'rgba(16,20,28,.05)'
                                : 'transparent',
                            borderRadius: 8,
                            font: 'inherit',
                            fontSize: 14.5,
                            color: '#15171b',
                            cursor: 'pointer',
                            padding: '9px 11px',
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {one.name}
                          </span>
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
