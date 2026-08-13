'use client'

/**
 * Inside a deal — sources, documents, and what the team decided.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `hasDeal`
 * section. The rows are the design's; every name, count and sentence is
 * the server's. The design's demo names (Falcon, Priya Anand) appear
 * nowhere here — a section with no real data renders empty rather than
 * borrowing anybody's placeholder.
 *
 * Splits the design draws that the data model answers:
 * - « Where the numbers come from » — models and sources: what a check
 *   reads. « Documents » — decks, memos, messages: what a check checks.
 * - Per-document state, in the design's own vocabulary: `N differences`
 *   (open findings on that document), `Clean` (checked, none), and two
 *   states its demo data never draws, composed from its nearest
 *   patterns and said so below: `Not read` (ingestion failed) and
 *   `Not checked` (arrived after the last run).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Artifact,
  DealPage as DealPageData,
  Decision,
  Finding,
  TieOutApi,
} from './../api'
import {
  fileIcon,
  greyButton,
  hairline,
  ink,
  listCard,
  sectionHead,
  well,
} from './../design'
import { staleNote } from './Deals'

/** « 1 hour ago » · « yesterday, 19:40 » · « 4 August » — the design's
 *  relative time, shared shape with the deals list's checked line. */
export const ago = (at: string): string => {
  const then = new Date(at)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && then.getDate() === now.getDate())
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `yesterday, ${time}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return then.toLocaleDateString([], { day: 'numeric', month: 'long' })
}

/** Small counts read as words — « Seven figures across three documents ». */
const asWords = (n: number): string => {
  const words = [
    'no',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ]
  return n < words.length ? words[n]! : String(n)
}

const iconFor = (kind: Artifact['kind'] | 'message'): string => {
  if (kind === 'model') return fileIcon.xls
  if (kind === 'deck') return fileIcon.ppt
  if (kind === 'message') return fileIcon.mail
  //: `memo` is Word. `source` — audited accounts, usually PDF — has no
  //: icon of its own in the design's assets; the document icon is the
  //: nearest pattern and is borrowed knowingly.
  return fileIcon.doc
}

//: The four avatar gradients the design's log rows use, assigned by a
//: stable hash of the name so one person keeps one colour.
const AVATARS = [
  { bg: 'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg: '#2c4a80' },
  { bg: 'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg: '#275c39' },
  { bg: 'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg: '#8a4526' },
  { bg: 'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg: '#553a7a' },
]

const avatarOf = (name: string) => {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return AVATARS[Math.abs(hash) % AVATARS.length]!
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

const rowTitle = {
  display: 'block',
  fontSize: 16,
  fontWeight: 500,
  letterSpacing: '-.015em',
} as const

const rowSub = {
  display: 'block',
  fontSize: 13.5,
  color: ink.secondary,
  marginTop: 2,
} as const

const chevron = (
  <svg
    width="9"
    height="15"
    viewBox="0 0 9 15"
    fill="none"
    stroke="#c7c7cc"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: '0 0 9px' }}
  >
    <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
  </svg>
)

export interface DealPageProps {
  api: TieOutApi
  dealId: string
  /** Bumped by the shell's « Check now »; a change re-runs and reloads. */
  checkNonce: number
  onChecking: (running: boolean) => void
  openDocId: string | null
  onOpenDoc: (doc: Artifact) => void
}

export const DealPage = ({
  api,
  dealId,
  checkNonce,
  onChecking,
  openDocId,
  onOpenDoc,
}: DealPageProps) => {
  const [page, setPage] = useState<DealPageData | null>(null)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([api.deal(dealId), api.findings(dealId)])
      .then(([deal, found]) => {
        if (!live) return
        setPage(deal)
        setFindings(found)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, dealId, reload])

  const check = useCallback(() => {
    onChecking(true)
    api
      .check(dealId)
      .catch(() => undefined)
      .then(() => {
        onChecking(false)
        setReload((was) => was + 1)
      })
  }, [api, dealId, onChecking])

  //: The shell's « Check now ». Zero is initial state, not a press.
  useEffect(() => {
    if (checkNonce > 0) check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkNonce])

  const openByDoc = useMemo(() => {
    const counts = new Map<string, number>()
    for (const finding of findings ?? []) {
      if (finding.state !== 'open') continue
      const id = finding.where.artifact_id
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [findings])

  if (page === null) {
    return <div style={{ flex: 1, minHeight: 0, background: well }} />
  }

  const checkedAt = page.last_tieout?.finished_at ?? null
  const sources = page.documents.filter(
    (one) => one.kind === 'model' || one.kind === 'source',
  )
  const deliverables = page.documents.filter(
    (one) => one.kind !== 'model' && one.kind !== 'source',
  )

  const sourceState = (one: Artifact) => {
    if (
      page.stale &&
      checkedAt !== null &&
      new Date(one.uploaded_at) > new Date(checkedAt)
    ) {
      const time = new Date(one.uploaded_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      return { text: `Changed ${time}`, fg: ink.stale }
    }
    return { text: 'Current', fg: ink.secondary }
  }

  const docState = (one: Artifact) => {
    if (one.status === 'failed')
      //: A document Pierce could not read. The design draws no failed
      //: row; the stale colour is its word for « needs a person », and
      //: the SharePoint screen's « Not read » is the nearest wording.
      return { text: 'Not read', fg: ink.stale }
    if (checkedAt === null || new Date(one.uploaded_at) > new Date(checkedAt))
      return { text: 'Not checked', fg: ink.secondary }
    const open = openByDoc.get(one.id) ?? 0
    if (open > 0)
      return {
        text: `${open} ${open === 1 ? 'difference' : 'differences'}`,
        fg: ink.accent,
      }
    return { text: 'Clean', fg: ink.clean }
  }

  const sub = (one: Artifact) => {
    //: The design writes « Priya Anand · edited 20 minutes ago » for a
    //: synced file. What this data records is the upload, so the honest
    //: verb is « uploaded » — « edited » arrives with the connector's
    //: metadata in a later round.
    const who = one.uploaded_by?.name
    const when = ago(one.uploaded_at)
    return who ? `${who} · uploaded ${when}` : `Received ${when}`
  }

  const banner =
    page.stale && page.stale_at !== null
      ? staleNote(page.stale_kind, page.stale_at).replace(/\.$/, '')
      : null

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: well,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '26px 34px 34px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            padding: '0 4px 16px',
          }}
        >
          <span
            style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.025em' }}
          >
            {page.name}
          </span>
          <span style={{ fontSize: 15, color: ink.secondary }}>
            {page.client ?? ''}
          </span>
        </div>

        {banner !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              ...listCard,
              padding: '15px 16px 15px 20px',
              marginBottom: 22,
            }}
          >
            <span
              style={{
                flex: '0 0 8px',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ink.staleDot,
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: '-.015em',
                }}
              >
                {banner}
              </span>
              {page.stale_figures > 0 && (
                <span style={rowSub}>
                  {asWords(page.stale_figures)[0]!.toUpperCase() +
                    asWords(page.stale_figures).slice(1)}{' '}
                  figures across {asWords(page.stale_documents)}{' '}
                  {page.stale_documents === 1 ? 'document' : 'documents'} were
                  read before that.
                </span>
              )}
            </span>
            <button onClick={check} style={{ flex: '0 0 auto', ...greyButton }}>
              Recheck
            </button>
          </div>
        )}

        {sources.length > 0 && (
          <>
            <div style={{ ...sectionHead, padding: '0 4px 9px' }}>
              Where the numbers come from
            </div>
            <div style={{ ...listCard, overflow: 'hidden' }}>
              {sources.map((one, index) => {
                const state = sourceState(one)
                return (
                  <div
                    key={one.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      borderTop: index === 0 ? 0 : hairline,
                      padding: '14px 16px 14px 20px',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconFor(one.kind)}
                      alt=""
                      style={{
                        flex: '0 0 20px',
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={rowTitle}>{one.filename}</span>
                      <span style={rowSub}>{sub(one)}</span>
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontSize: 13.5,
                        color: state.fg,
                      }}
                    >
                      {state.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {deliverables.length > 0 && (
          <>
            <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
              Documents
            </div>
            <div style={{ ...listCard, overflow: 'hidden' }}>
              {deliverables.map((one, index) => {
                const state = docState(one)
                return (
                  <button
                    key={one.id}
                    onClick={() => onOpenDoc(one)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      borderTop: index === 0 ? 0 : hairline,
                      background:
                        openDocId === one.id ? '#eef1f6' : 'transparent',
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '14px 16px 14px 20px',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconFor(one.kind)}
                      alt=""
                      style={{
                        flex: '0 0 20px',
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={rowTitle}>{one.filename}</span>
                      <span style={rowSub}>{sub(one)}</span>
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontSize: 14,
                        fontWeight: 500,
                        color: state.fg,
                      }}
                    >
                      {state.text}
                    </span>
                    {chevron}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {page.decisions.length > 0 && (
          <>
            <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
              What the team decided
            </div>
            <div style={{ ...listCard, overflow: 'hidden' }}>
              {page.decisions.map((one: Decision, index) => {
                const name = one.who?.name ?? 'Someone'
                const avatar = avatarOf(name)
                return (
                  <div
                    key={one.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 13,
                      borderTop: index === 0 ? 0 : hairline,
                      padding: '14px 20px',
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 30px',
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: avatar.bg,
                        boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: avatar.fg,
                      }}
                    >
                      {initialsOf(name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 15,
                          lineHeight: 1.45,
                        }}
                      >
                        {/* Their words beat ours, when they gave any. */}
                        {one.note || one.text}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: ink.faint,
                          marginTop: 2,
                        }}
                      >
                        {name} · {ago(one.at)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
