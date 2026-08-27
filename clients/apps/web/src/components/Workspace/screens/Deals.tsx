'use client'

/**
 * Project — the list, and the first-run empty state.
 *
 * Source of truth: `docs/pierce/design-swens/Swens_Workspace.html`,
 * the `vDealsList` block: a Newsreader question for a heading, a
 * « New project » pill, and one table in a grey frame — Project ·
 * Model · Last checked · Open findings. One flat list, no grouping:
 * the design draws clean and failing projects in the same card and
 * tells them apart by the dot and the ink.
 *
 * Real mappings, named:
 * - the model column is the latest ready workbook, by filename (shown
 *   without its extension, as the design prints it) and version;
 * - the dot is the worst attention tier among open findings —
 *   defect red, assumption amber, hygiene blue — the design's three
 *   severity colours;
 * - « Nothing failing » is only said when a check has run; a deal
 *   nobody checked says « Not checked yet » in the same muted ink,
 *   because no-findings-on-an-unchecked-deal must never read like
 *   no-findings-on-a-checked-one (a state the design's demo data
 *   does not draw; muted ink borrowed from its own « Nothing
 *   failing »);
 * - a stale row's checked cell appends « · files changed since »,
 *   in the drawn column — the count on that row was made against a
 *   model that has since moved.
 */

import { useEffect, useRef, useState } from 'react'
import { ConnectorState, DealListItem, TieOutApi } from './../api'
import {
  fileIcon,
  font,
  ink,
  microsoftLogo,
  sharepointLogo,
  well,
} from './../design'
import { ProjectPage } from './ProjectPage'

export interface DealsProps {
  api: TieOutApi
  organizationId: string
  /** Null while loading; the screens draw nothing rather than guessing. */
  deals: DealListItem[] | null
  deal: DealListItem | null
  onOpen: (deal: DealListItem) => void
  onChanged: () => void
  openDocId: string | null
  onOpenDoc: (
    doc: import('./../api').Artifact,
    atFindingId?: string | null,
  ) => void
  /** Opens the New-deal browser — the connected empty state's button. */
  onNewDeal: () => void
  /** Leave the open project — the shell closes it and refreshes. */
  onRemoved: () => void
}

export const Deals = ({
  api,
  organizationId,
  deals,
  deal,
  onOpen,
  onChanged,
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
          //: Active only — a disconnected row still exists, and taking
          //: it for the answer ended every reconnect early.
          if (state.connection?.status === 'active') setWaiting(false)
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
      <ProjectPage
        api={api}
        deal={deal}
        onBack={onRemoved}
        onOpenDoc={onOpenDoc}
        onChanged={onChanged}
      />
    )
  }

  if (deals === null) {
    //: Still asking. The design has no loading face for this screen —
    //: the honest render is the empty white pane, which resolves in one
    //: paint.
    return <div style={{ flex: 1, minHeight: 0, background: '#fff' }} />
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
            .then((state) => {
              setSaid(null)
              setConnector(state)
            })
            //: A failed disconnect says so — silence reads as « the
            //: button does nothing ».
            .catch((problem) => setSaid(String(problem?.message ?? problem)))
        }}
      />
    )
  }

  //: « Today 11:40 » / « Yesterday 16:05 » / « Tuesday 09:12 » /
  //: « 14 August » — the design's own phrasing for the checked column,
  //: read off its demo rows.
  const checkedCell = (d: DealListItem): { text: string; muted: boolean } => {
    if (!d.checked_at) return { text: 'Not checked yet', muted: true }
    const then = new Date(d.checked_at)
    const now = new Date()
    const time = then.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const when =
      then.toDateString() === now.toDateString()
        ? `Today ${time}`
        : then.toDateString() === yesterday.toDateString()
          ? `Yesterday ${time}`
          : (now.getTime() - then.getTime()) / 86_400_000 < 7
            ? `${then.toLocaleDateString('en-GB', { weekday: 'long' })} ${time}`
            : then.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              })
    //: Stale, said in the drawn column: the counts on this row were
    //: made against files that have since moved.
    return {
      text: d.stale ? `${when} · files changed since` : when,
      muted: false,
    }
  }

  //: The design's severity colours, keyed by the worst open tier.
  const dotOf = (tier: number): string =>
    tier === 1 ? '#e0322d' : tier === 2 ? '#e8a300' : '#2b6cf5'

  const grid = 'minmax(200px,1.2fr) minmax(215px,1.15fr) 140px 175px 38px'
  const columns = ['Project', 'Model', 'Last checked', 'Open findings', '']

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: '#fff',
        padding: 'clamp(24px,5vh,52px) clamp(20px,4vw,48px) 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '0 4px 26px',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.serif,
              fontSize: 'clamp(23px,2.6vw,28px)',
              lineHeight: 1.25,
              letterSpacing: '-.01em',
              color: '#1c1f23',
            }}
          >
            Which project are you working in?
          </span>
          <button
            onClick={onNewDeal}
            style={{
              flex: '0 0 auto',
              border: '1px solid rgba(16,22,35,.08)',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(16,22,35,.05)',
              borderRadius: 999,
              height: 40,
              padding: '0 18px',
              font: 'inherit',
              fontSize: 14.5,
              color: '#1c1f23',
              cursor: 'pointer',
            }}
          >
            New project
          </button>
        </div>

        <div
          style={{
            background: '#f6f7f9',
            border: '1px solid rgba(16,22,35,.05)',
            borderRadius: 22,
            boxShadow:
              '0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.06)',
            padding: 12,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              gap: 10,
              padding: '2px 0 12px',
            }}
          >
            {columns.map((label, i) => (
              <span
                key={i}
                style={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  background: label ? '#fff' : 'transparent',
                  borderRadius: 999,
                  padding: '9px 16px 9px 18px',
                  fontSize: 14.5,
                  color: '#8f96a0',
                  overflow: 'hidden',
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
                  {label}
                </span>
              </span>
            ))}
          </div>

          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 1px 2px rgba(16,22,35,.04)',
              overflow: 'hidden',
            }}
          >
            {deals.map((d, i) => {
              const checked = checkedCell(d)
              const hasFindings = d.open_findings > 0
              return (
                <button
                  key={d.id}
                  onClick={() => onOpen(d)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: grid,
                    gap: 10,
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderTop: i === 0 ? 0 : '.5px solid rgba(16,22,35,.06)',
                    background: 'transparent',
                    font: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    height: 64,
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      padding: '0 16px 0 18px',
                      fontSize: 16.5,
                      letterSpacing: '-.012em',
                      color: '#1c1f23',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.name}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      padding: '0 16px 0 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {d.model_name !== null ? (
                      <>
                        <span
                          style={{
                            flex: '0 0 19px',
                            width: 19,
                            height: 19,
                            backgroundImage: `url(${fileIcon.xls})`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                          }}
                        />
                        <span
                          style={{
                            flex: '0 1 auto',
                            minWidth: 0,
                            fontSize: 15,
                            color: '#4a4f57',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {d.model_name.replace(/\.[a-z0-9]+$/i, '')}
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontFamily: font.mono,
                            fontSize: 12.5,
                            letterSpacing: 0,
                            color: '#0060d0',
                          }}
                        >
                          v{d.model_version}
                        </span>
                      </>
                    ) : (
                      //: A deal with no workbook yet — a state the demo
                      //: data does not draw; the muted ink is the
                      //: findings column's own « Nothing failing ».
                      <span style={{ fontSize: 15, color: '#9aa1ab' }}>
                        No model yet
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      padding: '0 16px 0 18px',
                      fontSize: 14.5,
                      color: checked.muted ? '#9aa1ab' : '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {checked.text}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      padding: '0 16px 0 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                    }}
                  >
                    {hasFindings && (
                      <span
                        style={{
                          flex: '0 0 8px',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dotOf(d.worst_tier),
                        }}
                      />
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14.5,
                        color: hasFindings ? '#3d4048' : '#9aa1ab',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {hasFindings
                        ? `${d.open_findings} ${d.open_findings === 1 ? 'finding' : 'findings'}`
                        : d.checked_at
                          ? //: On a values-pasted copy the construction
                            //: rules read almost nothing, so « nothing
                            //: failing » alone would flatter the file.
                            //: Two words, because the row is a triage
                            //: line and the Overview carries the rest.
                            d.values_only
                            ? 'Nothing failing · values only'
                            : 'Nothing failing'
                          : 'Not checked yet'}
                    </span>
                  </span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c4c8ce"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ justifySelf: 'end', marginRight: 18 }}
                  >
                    <polyline points="9,5 16,12 9,19" />
                  </svg>
                </button>
              )
            })}
          </div>
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
  //: Active only. A disconnected or expired row still exists — kept so
  //: a deal's folder can say why it stopped syncing — and this face
  //: wearing « SharePoint connected » over it made Disconnect look
  //: dead and hid the Connect button that reconnects.
  const connected = connector?.connection?.status === 'active'
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
              Swens reads your models and decks from SharePoint.
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
                Read-only. Swens never writes to your files.
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
