'use client'

/**
 * Models — the list, and the first-run empty state.
 *
 * Source of truth: `docs/pierce/design-antford/workspace.html`, the
 * `vDealsList` and `vDealsEmpty` sections. The rows are the design's
 * rows; the data is the server's. Where a real data state has no drawn
 * equivalent, the borrowed pattern is named at the site.
 *
 * The Antford row is a sentence, not a dashboard: name on the left,
 * verdict on the right — « 6 checks fail » amber, « Changed since
 * check » blue, « All checks pass » green — over a quiet « Checked
 * Tuesday 11:52 ». No dot, no subtitle; the first design's since-notes
 * and document counts have no home here and are not drawn.
 *
 * The groups are « Needs attention » and « Clear » — the design's own
 * words. One addition its demo data never shows: a deal that has
 * **never been checked** cannot sit under « Clear » — no findings on a
 * deal nobody checked reads exactly like no findings on a deal checked
 * this morning, and the API docstring forbids those two ever sharing a
 * word. Never-checked deals join the attention group, in the open row's
 * own shape, and their state says « Not checked yet » (a state the
 * design does not draw; secondary ink, borrowed from its meta text).
 */

import { useEffect, useRef, useState } from 'react'
import { ConnectorState, DealListItem, TieOutApi } from './../api'
import {
  hairline,
  ink,
  listCard,
  microsoftLogo,
  sectionHead,
  sharepointLogo,
  well,
} from './../design'
import { DealPage } from './DealPage'

/**
 * « Checked 09:15 today » / « Checked Tuesday 11:52 » / « Checked
 * 1 August » — the Antford design's own time phrasing, read off its demo
 * rows. Stale rows lead with « Last checked », as the design's stale row
 * does: the check is no longer *the* check, only the last one.
 */
export const checkedLine = (at: string | null, stale = false): string => {
  if (!at) return 'Not checked yet'
  const lead = stale ? 'Last checked' : 'Checked'
  const then = new Date(at)
  const now = new Date()
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  if (then.toDateString() === now.toDateString()) return `${lead} ${time} today`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `${lead} yesterday ${time}`
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  if (days < 7)
    return `${lead} ${then.toLocaleDateString([], { weekday: 'long' })} ${time}`
  return `${lead} ${then.toLocaleDateString([], { day: 'numeric', month: 'long' })}`
}

/** « The model changed at 11:40 today. » — the stale row's own sentence. */
export const staleNote = (kind: string | null, at: string | null): string => {
  const what =
    kind === 'model'
      ? 'The model'
      : kind === 'deck'
        ? 'The deck'
        : kind === 'memo'
          ? 'The memo'
          : kind === 'message'
            ? 'A message'
            : 'A source'
  if (!at) return `${what} changed after the last check.`
  const then = new Date(at)
  const now = new Date()
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  if (then.toDateString() === now.toDateString())
    return `${what} changed at ${time} today.`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `${what} changed yesterday.`
  return `${what} changed on ${then.toLocaleDateString([], { day: 'numeric', month: 'long' })}.`
}

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

export interface DealsProps {
  api: TieOutApi
  organizationId: string
  /** Null while loading; the screens draw nothing rather than guessing. */
  deals: DealListItem[] | null
  deal: DealListItem | null
  onOpen: (deal: DealListItem) => void
  onChanged: () => void
  /** The shell's « Check now », forwarded to the open deal. */
  checkNonce: number
  reportNonce?: number
  onChecking: (running: boolean) => void
  openDocId: string | null
  onOpenDoc: (
    doc: import('./../api').Artifact,
    atFindingId?: string | null,
  ) => void
  /** Opens the New-deal browser — the connected empty state's button. */
  onNewDeal: () => void
  /** The open model was removed — the shell closes it and refreshes. */
  onRemoved: () => void
}

export const Deals = ({
  api,
  organizationId,
  deals,
  deal,
  onOpen,
  checkNonce,
  reportNonce,
  onChecking,
  openDocId,
  onOpenDoc,
  onNewDeal,
  onRemoved,
}: DealsProps) => {
  //: The connector, for the empty state's three faces. Asked only once
  //: the list has answered and come back empty — the list screen never
  //: needs it.
  const [connector, setConnector] = useState<ConnectorState | null>(null)
  const [waiting, setWaiting] = useState(false)
  const empty = deals !== null && deals.length === 0
  useEffect(() => {
    if (!empty) return
    let live = true
    api
      .connectorState(organizationId)
      .then((state) => live && setConnector(state))
      .catch(() => live && setConnector(null))
    return () => {
      live = false
    }
  }, [api, organizationId, empty])

  //: While the Microsoft window is open, ask again every few seconds so
  //: the screen moves to « connected » the moment consent lands.
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!waiting) return
    poll.current = setInterval(() => {
      api
        .connectorState(organizationId)
        .then((state) => {
          setConnector(state)
          if (state.connection) setWaiting(false)
        })
        .catch(() => undefined)
    }, 2500)
    return () => {
      if (poll.current) clearInterval(poll.current)
    }
  }, [api, organizationId, waiting])

  //: The Microsoft popup reports back and closes itself (the shell's
  //: landing effect posts this). Failure ends the waiting face and the
  //: refusal is shown in Microsoft's own words — the polling above can
  //: only ever see success, so without this a failed consent left the
  //: screen waiting on nothing.
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    const hear = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as {
        kind?: string
        status?: string
        reason?: string | null
      }
      if (data?.kind !== 'pierce-connector') return
      setWaiting(false)
      if (data.status === 'connected') {
        setSaid(null)
        api
          .connectorState(organizationId)
          .then(setConnector)
          .catch(() => undefined)
      } else {
        setSaid(data.reason || 'Microsoft refused without saying why.')
      }
    }
    window.addEventListener('message', hear)
    return () => window.removeEventListener('message', hear)
  }, [api, organizationId])

  if (deal !== null) {
    return (
      <DealPage
        api={api}
        dealId={deal.id}
        checkNonce={checkNonce}
        reportNonce={reportNonce}
        onChecking={onChecking}
        openDocId={openDocId}
        onOpenDoc={onOpenDoc}
        onRemoved={onRemoved}
      />
    )
  }

  if (deals === null) {
    //: Still asking. The design has no loading face for this screen —
    //: the honest render is the empty well, which resolves in one paint.
    return <div style={{ flex: 1, minHeight: 0, background: well }} />
  }

  if (empty) {
    return (
      <EmptyState
        connector={connector}
        waiting={waiting}
        problem={said}
        onConnect={() => {
          if (!connector?.authorize_url) return
          setSaid(null)
          window.open(connector.authorize_url, '_blank', 'width=600,height=760')
          setWaiting(true)
        }}
        onCancel={() => setWaiting(false)}
        onNewDeal={onNewDeal}
        onDisconnect={() => {
          const id = connector?.connection?.id
          if (!id) return
          api
            .disconnect(id)
            .then(() => api.connectorState(organizationId))
            .then(setConnector)
            .catch(() => undefined)
        }}
      />
    )
  }

  //: The design's grouping, from its own logic — plus never-checked
  //: deals in the attention group, which its demo data never shows.
  const open = deals.filter(
    (d) => d.failing_checks > 0 || d.stale || d.checked_at === null,
  )
  const clean = deals.filter((d) => !open.includes(d))

  const row = (d: DealListItem, first: boolean, group: 'open' | 'clean') => {
    const stale = !!d.stale
    const never = d.checked_at === null
    //: Stale outranks the count — stale means the numbers on this very
    //: row were made against a model that no longer exists.
    const state =
      group === 'clean'
        ? 'All checks pass'
        : stale
          ? 'Changed since check'
          : never
            ? 'Not checked yet'
            : `${d.failing_checks} ${d.failing_checks === 1 ? 'check fails' : 'checks fail'}`
    const stateFg =
      group === 'clean'
        ? ink.clean
        : stale
          ? ink.accent
          : never
            ? //: A state the design does not draw; secondary ink,
              //: borrowed from its own meta text.
              ink.secondary
            : ink.stale
    return (
      <button
        key={d.id}
        onClick={() => onOpen(d)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          width: '100%',
          textAlign: 'left',
          border: 0,
          borderTop: first ? 0 : hairline,
          background: 'transparent',
          font: 'inherit',
          cursor: 'pointer',
          padding:
            group === 'open' ? '17px 16px 17px 20px' : '15px 16px 15px 20px',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '-.015em',
            }}
          >
            {d.name}
          </span>
        </span>
        <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <span
            style={{
              display: 'block',
              fontSize: 14.5,
              fontWeight: 500,
              color: stateFg,
              letterSpacing: '-.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {state}
          </span>
          {!never && (
            <span
              style={{
                display: 'block',
                fontSize: 12.5,
                color: ink.faint,
                marginTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {checkedLine(d.checked_at, stale)}
            </span>
          )}
        </span>
        {chevron}
      </button>
    )
  }

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
          padding: '28px 34px 34px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 620,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {open.length > 0 && (
            <>
              <div style={{ ...sectionHead, padding: '4px 4px 9px' }}>
                Needs attention
              </div>
              <div
                style={{ ...listCard, overflow: 'hidden', marginBottom: 26 }}
              >
                {open.map((d, i) => row(d, i === 0, 'open'))}
              </div>
            </>
          )}
          {clean.length > 0 && (
            <>
              <div style={{ ...sectionHead, padding: '4px 4px 9px' }}>
                Clear
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                {clean.map((d, i) => row(d, i === 0, 'clean'))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The first-run screen — the design's `vDealsEmpty`, three faces driven
 * by the real connector: not connected, waiting on the Microsoft window,
 * connected. Microsoft-first by the founder's decision: onboarding is
 * assisted, and the folder is where the deals already live.
 */
const EmptyState = ({
  connector,
  waiting,
  problem,
  onConnect,
  onCancel,
  onNewDeal,
  onDisconnect,
}: {
  connector: ConnectorState | null
  waiting: boolean
  /** Microsoft's refusal, verbatim, when the last attempt died. */
  problem: string | null
  onConnect: () => void
  onCancel: () => void
  onNewDeal: () => void
  onDisconnect: () => void
}) => {
  const connected = !!connector?.connection
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: well,
        padding: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {!connected && !waiting && (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingBottom: 8,
            }}
          >
            <img
              src={microsoftLogo}
              alt=""
              style={{ width: 58, height: 58, objectFit: 'contain' }}
            />
            <span
              style={{
                fontSize: 23,
                fontWeight: 500,
                letterSpacing: '-.022em',
                lineHeight: 1.25,
                marginTop: 22,
                textWrap: 'balance',
              }}
            >
              Connect Microsoft to get started
            </span>
            <span
              style={{
                fontSize: 14.5,
                color: ink.secondary,
                lineHeight: 1.55,
                marginTop: 8,
                maxWidth: '35ch',
                textWrap: 'pretty',
              }}
            >
              Antford reads your models and decks from SharePoint.
            </span>
            {problem && (
              //: The refusal verbatim — an AADSTS sentence names its own
              //: fix, and paraphrasing it hides the code a search needs.
              <span
                style={{
                  fontSize: 13,
                  color: ink.danger,
                  lineHeight: 1.5,
                  marginTop: 12,
                  maxWidth: '48ch',
                  textWrap: 'pretty',
                }}
              >
                {problem}
              </span>
            )}
            <button
              onClick={onConnect}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 11,
                width: 270,
                marginTop: 30,
                border: 0,
                background: '#fff',
                color: ink.primary,
                borderRadius: 12,
                padding: '14px 22px',
                font: 'inherit',
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: '-.01em',
                boxShadow:
                  '0 1px 2px rgba(0,0,0,.06), 0 0 0 .5px rgba(0,0,0,.11)',
                cursor: 'pointer',
              }}
            >
              <img
                src={microsoftLogo}
                alt=""
                style={{ width: 19, height: 19, objectFit: 'contain' }}
              />
              <span>Connect Microsoft</span>
            </button>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 26,
                color: '#a1a1a6',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 13px' }}
              >
                <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                Read-only. Antford never writes to your files.
              </span>
            </span>
          </span>
        )}

        {!connected && waiting && (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingBottom: 8,
            }}
          >
            <span
              style={{
                width: 58,
                height: 58,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '2.5px solid rgba(21,23,27,.13)',
                  borderTopColor: ink.accent,
                  animation: 'pcSpin .8s linear infinite',
                }}
              />
            </span>
            <span
              style={{
                fontSize: 23,
                fontWeight: 500,
                letterSpacing: '-.022em',
                lineHeight: 1.25,
                marginTop: 22,
              }}
            >
              Waiting for Microsoft
            </span>
            <span
              style={{
                fontSize: 14.5,
                color: ink.secondary,
                lineHeight: 1.55,
                marginTop: 8,
                maxWidth: '35ch',
                textWrap: 'pretty',
              }}
            >
              Approve access in the window that opened.
            </span>
            <button
              onClick={onCancel}
              style={{
                marginTop: 34,
                border: 0,
                background: 'transparent',
                font: 'inherit',
                fontSize: 15,
                color: ink.accent,
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 9,
              }}
            >
              Cancel
            </button>
          </span>
        )}

        {connected && (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingBottom: 8,
            }}
          >
            <img
              src={sharepointLogo}
              alt=""
              style={{ width: 58, height: 58, objectFit: 'contain' }}
            />
            <span
              style={{
                fontSize: 23,
                fontWeight: 500,
                letterSpacing: '-.022em',
                lineHeight: 1.25,
                marginTop: 22,
              }}
            >
              SharePoint connected
            </span>
            <span
              style={{
                fontSize: 14.5,
                color: ink.secondary,
                lineHeight: 1.55,
                marginTop: 8,
              }}
            >
              {connector?.connection?.account_email}
            </span>
            <button
              onClick={onNewDeal}
              style={{
                width: 270,
                marginTop: 30,
                border: 0,
                background: ink.accent,
                color: '#fff',
                borderRadius: 11,
                padding: '12px 22px',
                font: 'inherit',
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: '-.01em',
                cursor: 'pointer',
              }}
            >
              Choose your deals
            </button>
            <button
              onClick={onDisconnect}
              style={{
                marginTop: 16,
                border: 0,
                background: 'transparent',
                font: 'inherit',
                fontSize: 15,
                color: ink.accent,
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 9,
              }}
            >
              Disconnect
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
