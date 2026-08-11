'use client'

/**
 * Mail — the last place a figure is right before it stops being fixable.
 *
 * The design draws Outlook: a command bar, a folder rail, a message list,
 * a reading pane, and under the message a card headed « Draft reply —
 * tracked change » with the old figure struck through and the new one
 * underlined. All of it is real here, and the card is the reason the
 * screen exists — a deck can be pulled back out of a data room and a sent
 * message cannot be pulled back out of anything.
 *
 * **Nothing is read without a press.** The list is the folder, and it
 * carries no findings; checking happens on one message, when somebody
 * opens it and asks. A product that quietly reconciled everything in an
 * inbox would be a surveillance tool that also checks numbers.
 *
 * **The command bar holds one action, and it is ours.** The design's has
 * New mail, Delete, Archive and Reply on it — every one of them a write to
 * somebody's mailbox, which this product does not have and will not ask
 * for. Drawing them would be four buttons that do nothing, on a screen
 * whose subject is whether the figures are real. What is there instead is
 * « Check this message », in the bar's position and register.
 *
 * **« Accept and send » is the design's button and it cannot exist.** The
 * server has no write scope on a mailbox by decision, not by omission —
 * see `connector/graph.py`. The correction is shown, and it goes into the
 * draft through the add-in, in the writer's own compose window, on their
 * own press. What sits in the button's place is the thing that is
 * genuinely available: the corrected sentence, to take.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ConnectorState, Finding, MailMessage, TieOutApi } from '../api'
import { ApiError } from '../api'
import { Nothing } from '../Dense'
import { colour, size } from '../design'

/** The design's five, in the design's order. */
const FOLDERS: { key: string; name: string }[] = [
  { key: 'inbox', name: 'Inbox' },
  { key: 'drafts', name: 'Drafts' },
  { key: 'sent', name: 'Sent' },
  { key: 'archive', name: 'Archive' },
  { key: 'deleted', name: 'Deleted' },
]

const shortTime = (iso: string) => {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const today = new Date()
  const sameDay =
    at.getDate() === today.getDate() &&
    at.getMonth() === today.getMonth() &&
    at.getFullYear() === today.getFullYear()
  return sameDay
    ? `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
    : `${at.getDate()} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[at.getMonth()]}`
}

const initials = (name: string) =>
  name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((one) => one[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** The design's avatar tints, picked from the name so they are stable. */
const TINTS: [string, string][] = [
  ['#dbeafe', '#1e40af'],
  ['#dcfce7', '#166534'],
  ['#fef3c7', '#92400e'],
  ['#ede9fe', '#5b21b6'],
  ['#fee2e2', '#991b1b'],
]
const tint = (name: string) =>
  TINTS[
    Array.from(name).reduce((sum, one) => sum + one.charCodeAt(0), 0) %
      TINTS.length
  ]

export function Mail({
  api,
  state,
  dealId,
  findings,
  onChecked,
}: {
  api: TieOutApi
  state: ConnectorState
  dealId: string
  /** The deal's findings. The card reads the ones on this message. */
  findings: Finding[]
  onChecked: () => void
}) {
  const [folder, setFolder] = useState('drafts')
  const [list, setList] = useState<MailMessage[] | null>(null)
  const [open, setOpen] = useState<MailMessage | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [took, setTook] = useState(false)

  const load = useCallback(async () => {
    setList(null)
    setOpen(null)
    try {
      setList(await api.mail(dealId, folder))
      setProblem(null)
    } catch (error) {
      setProblem(message(error))
      setList([])
    }
  }, [api, dealId, folder])

  useEffect(() => {
    void load()
  }, [load])

  const read = async (one: MailMessage) => {
    setTook(false)
    setOpen(one)
    try {
      setOpen(await api.message(dealId, one.id))
    } catch (error) {
      setProblem(message(error))
    }
  }

  const check = async () => {
    if (!open) return
    setBusy(true)
    setProblem(null)
    try {
      const checked = await api.checkMessage(dealId, open.id)
      setOpen(checked)
      setList(
        (was) =>
          was?.map((one) =>
            one.id === checked.id ? { ...one, ...checked } : one,
          ) ?? was,
      )
      onChecked()
    } catch (error) {
      setProblem(message(error))
    } finally {
      setBusy(false)
    }
  }

  //: What this message says wrongly. Only when the check is of the
  //: message on screen: a draft edited since is a draft nobody checked,
  //: and showing last version's findings against it would be the screen
  //: making a claim about text it has not seen.
  const drifts =
    open?.artifact_id && open.current
      ? findings.filter((one) => one.where.artifact_id === open.artifact_id)
      : []

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}
    >
      {/* The command bar. One action, and it is the one that works. */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 12px',
          borderBottom: `1px solid ${colour.rule}`,
          fontSize: 13,
          color: colour.muted,
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => void check()}
          disabled={!open || busy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            border: 0,
            background: 'transparent',
            padding: '6px 10px',
            borderRadius: 4,
            font: 'inherit',
            fontSize: 13,
            cursor: !open || busy ? 'default' : 'pointer',
            color: !open || busy ? colour.fainter : colour.blue,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <polyline points="4,12 9,17 20,6" />
          </svg>
          {busy ? 'Reading…' : 'Check this message'}
        </button>
        <div style={{ flex: 1 }} />
        <span
          style={{ fontSize: 12, color: colour.faint, whiteSpace: 'nowrap' }}
        >
          {state.connection?.account_email || ''}
        </span>
      </div>

      {problem && (
        <div
          role="alert"
          style={{
            flex: '0 0 auto',
            padding: '8px 20px',
            fontSize: size.small,
            color: colour.critical,
          }}
        >
          {problem}
        </div>
      )}

      <div
        style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}
      >
        <div
          style={{
            flex: '0 1 172px',
            minWidth: 118,
            borderRight: `1px solid ${colour.ruleStrong}`,
            padding: '10px 6px',
            overflow: 'auto',
            background: colour.wash,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: colour.faint,
              padding: '6px 12px 8px',
            }}
          >
            Favourites
          </div>
          {FOLDERS.map((one) => (
            <button
              key={one.key}
              onClick={() => setFolder(one.key)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 0,
                padding: '7px 12px',
                borderRadius: 4,
                font: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
                color: colour.ink,
                background: one.key === folder ? colour.band : 'transparent',
                fontWeight: one.key === folder ? 500 : 400,
              }}
            >
              {one.name}
            </button>
          ))}
        </div>

        <div
          style={{
            flex: '0 1 236px',
            minWidth: 164,
            borderRight: `1px solid ${colour.rule}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: '0 0 auto',
              padding: '8px 16px 10px',
              borderBottom: `1px solid ${colour.rule}`,
              fontSize: 13,
              color: colour.ink,
            }}
          >
            {FOLDERS.find((one) => one.key === folder)?.name}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {list === null && (
              <div style={{ padding: 18 }}>
                <Nothing>Reading the folder…</Nothing>
              </div>
            )}
            {list?.length === 0 && (
              <div style={{ padding: 18 }}>
                <Nothing>Nothing in here.</Nothing>
              </div>
            )}
            {(list ?? []).map((one) => {
              const [back, ink] = tint(one.from_name || one.subject)
              const here = open?.id === one.id
              return (
                <button
                  key={one.id}
                  onClick={() => void read(one)}
                  style={{
                    display: 'flex',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    padding: '12px 16px',
                    font: 'inherit',
                    cursor: 'pointer',
                    background: here ? colour.band : '#fff',
                    boxShadow: here ? `inset 2px 0 0 ${colour.muted}` : 'none',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 30px',
                      width: 30,
                      height: 30,
                      marginTop: 1,
                      borderRadius: '50%',
                      background: back,
                      color: ink,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10.5,
                      fontWeight: 600,
                    }}
                  >
                    {initials(one.from_name || one.to[0] || '?')}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13.5,
                          fontWeight: one.is_read ? 400 : 600,
                          color: colour.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {one.from_name || one.to[0] || '—'}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: colour.faint,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {shortTime(one.received_at)}
                      </span>
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        marginTop: 2,
                        color: colour.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {one.subject}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        color: colour.faint,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {one.preview}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div
          style={{
            flex: '1 1 0',
            minWidth: 0,
            overflow: 'auto',
            padding: '18px 22px 24px',
          }}
        >
          {!open ? (
            <Nothing>Open a message to check the figures in it.</Nothing>
          ) : (
            <>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: colour.ink,
                  lineHeight: 1.35,
                }}
              >
                {open.subject}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 11,
                  margin: '14px 0 0',
                }}
              >
                <span
                  style={{
                    flex: '0 0 34px',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: tint(open.from_name || open.subject)[0],
                    color: tint(open.from_name || open.subject)[1],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {initials(open.from_name || open.to[0] || '?')}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: colour.ink,
                      }}
                    >
                      {open.from_name || '—'}
                    </span>
                    <span style={{ fontSize: 12.5, color: colour.faint }}>
                      {open.from_email && `<${open.from_email}>`}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: colour.faint }}>
                      {shortTime(open.received_at)}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      color: colour.faint,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {open.to.length ? `To ${open.to.join(', ')}` : ''}
                  </span>
                </span>
              </div>

              <div
                style={{
                  lineHeight: 1.7,
                  color: colour.ink,
                  fontSize: 14,
                  maxWidth: '66ch',
                  padding: '20px 0 0',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {plain(open.body)}
              </div>

              <Card
                message={open}
                drifts={drifts}
                took={took}
                onTake={() => setTook(true)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The design's tracked-change card, and the three things it can say.
 *
 * Nobody has checked this. Checked, and every figure ties. Checked, and
 * here is the sentence with the correction in it — the design's strike
 * and underline, the same pair `Document.tsx` uses, because a memo
 * paragraph and an email paragraph are the same question.
 */
function Card({
  message,
  drifts,
  took,
  onTake,
}: {
  message: MailMessage
  drifts: Finding[]
  took: boolean
  onTake: () => void
}) {
  const checked = Boolean(message.artifact_id) && message.current
  return (
    <div
      style={{
        marginTop: 22,
        border: `1px solid ${colour.rule}`,
        borderRadius: 6,
        background: colour.paper,
        padding: '16px 18px',
        maxWidth: '66ch',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          marginBottom: 9,
          fontSize: 13,
          color: colour.muted,
        }}
      >
        {!checked
          ? 'Not checked'
          : drifts.length === 0
            ? 'Checked — every figure in this message ties to the model'
            : `${drifts.length === 1 ? 'One figure' : `${drifts.length} figures`} — tracked change`}
      </div>

      {!checked ? (
        <div style={{ fontSize: 13, color: colour.faint, lineHeight: 1.7 }}>
          {message.artifact_id
            ? 'This message has changed since it was last checked. Check it again.'
            : 'Nothing here has been read. Press « Check this message » and every figure in it is reconciled against the model.'}
        </div>
      ) : drifts.length === 0 ? (
        <div style={{ fontSize: 13, color: colour.faint, lineHeight: 1.7 }}>
          Nothing to correct.
        </div>
      ) : (
        <>
          {drifts.map((one) => (
            <div key={one.id} style={{ paddingBottom: 14 }}>
              <div style={{ lineHeight: 1.7, fontSize: 14, color: colour.ink }}>
                {corrected(one)}
              </div>
              <div style={{ fontSize: 12, color: colour.faint, marginTop: 6 }}>
                {one.source.ref
                  ? `${one.source.name || 'The model'} · ${one.source.ref}`
                  : 'The model'}
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 6,
            }}
          >
            <button
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(drifts.map(sentence).join('\n\n'))
                  .then(onTake)
                  .catch(() => {})
              }}
              style={{
                flex: '0 0 auto',
                border: 0,
                background: colour.blue,
                color: '#fff',
                borderRadius: 4,
                padding: '7px 16px',
                font: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {took ? 'Copied' : 'Copy the correction'}
            </button>
            <span
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                fontSize: 12,
                color: colour.faint,
              }}
            >
              {/* Where the change can actually be made, named. « Cannot »
                  is not the useful half of that sentence. */}
              or open the draft with the add-in and accept it there
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/** The sentence as written, with the figure struck and the correction in. */
function corrected(finding: Finding) {
  const text = finding.context || finding.title
  const at = text.indexOf(finding.printed)
  if (at < 0) {
    return (
      <>
        <span
          style={{ color: colour.slateFaint, textDecoration: 'line-through' }}
        >
          {finding.printed}
        </span>{' '}
        <span
          style={{ color: colour.matchingDeep, textDecoration: 'underline' }}
        >
          {finding.expected}
        </span>
      </>
    )
  }
  return (
    <>
      {text.slice(0, at)}
      <span
        style={{ color: colour.slateFaint, textDecoration: 'line-through' }}
      >
        {finding.printed}
      </span>{' '}
      <span style={{ color: colour.matchingDeep, textDecoration: 'underline' }}>
        {finding.expected}
      </span>
      {text.slice(at + finding.printed.length)}
    </>
  )
}

/** The same sentence as plain text, for taking. */
const sentence = (finding: Finding) =>
  (finding.context || finding.title).replace(finding.printed, finding.expected)

/**
 * The message body as text.
 *
 * Rendering a customer's HTML into this page is a decision with a
 * security answer rather than a design one: mail HTML carries scripts,
 * remote images that report when a message was read, and styles that
 * escape whatever box they are put in. The figures are what this screen
 * is about, and they are all in the words.
 */
function plain(body: string): string {
  if (!body) return ''
  if (!/<[a-z][\s\S]*>/i.test(body)) return body
  const holder = document.createElement('div')
  holder.innerHTML = body
  holder
    .querySelectorAll('style, script, head, title, meta')
    .forEach((one) => one.remove())
  holder
    .querySelectorAll('p, div, br, li, tr, h1, h2, h3, h4')
    .forEach((one) => one.insertAdjacentText('beforebegin', '\n'))
  return (holder.textContent ?? '')
    .split('\n')
    .map((one) => one.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'That did not work.'
