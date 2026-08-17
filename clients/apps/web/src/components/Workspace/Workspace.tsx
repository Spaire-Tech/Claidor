'use client'

/**
 * The workspace shell — the founder's design, 12 August, wired.
 *
 * Source of truth: `docs/pierce/design/markup.html`. Every style value
 * here appears verbatim in that file; where a real data state has no
 * drawn equivalent, the component says which pattern it borrowed. The
 * design is one floating card over a radial ground, a glassy pill dock at
 * the bottom centre, and side panels that join the row as they open.
 *
 * This file is the frame, the header, the dock and the account popover.
 * The screens live beside it and receive real data — nothing in the
 * shell invents a number.
 */

import { useEffect, useMemo, useState } from 'react'
import { Artifact, DealListItem, TieOutApi } from './api'
import { Chat, ChatContext, chatKeyOf } from './Chat'
import { blueButton, font, ground, ink, shell, wordmark } from './design'
import { CheckFile } from './screens/CheckFile'
import { Deals } from './screens/Deals'
import { DocPanel } from './screens/DocPanel'
import { NewDeal } from './screens/NewDeal'
import { Settings } from './screens/Settings'
import './workspace.css'

/**
 * Where the server is. The dashboard and the API are the same deployment,
 * so the browser talks to a relative path and the session cookie is
 * first-party. Only the Office panel needs an absolute origin and a
 * bearer token, and it has its own client for that.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

type View = 'deals' | 'check' | 'settings'

const LABELS: Record<View, string> = {
  deals: 'Models',
  check: 'Check a model',
  settings: 'Settings',
}

export interface WorkspaceProps {
  /** The signed-in person, for the dock avatar and the popover. */
  userName: string
  userEmail: string
  /** The organization the route resolved, for the connector. */
  organizationId: string
}

/** « EW » from « Elena Whitmore » — the design shows two letters. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

export const Workspace = ({
  userName,
  userEmail,
  organizationId,
}: WorkspaceProps) => {
  const api = useMemo(() => new TieOutApi({ baseUrl: API_BASE }), [])

  const [view, setView] = useState<View>('deals')
  const [deal, setDeal] = useState<DealListItem | null>(null)
  const [doc, setDoc] = useState<Artifact | null>(null)
  //: « Open the cell » — the finding whose cell the document panel
  //: should open on, when the panel was opened from a finding's modal.
  const [docAt, setDocAt] = useState<string | null>(null)
  const [acctOpen, setAcctOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  //: What the chat is about. The document panel and the check screen
  //: report their finding contexts; the deal scope is derived below.
  const [docChat, setDocChat] = useState<ChatContext | null>(null)
  const [checkChat, setCheckChat] = useState<ChatContext | null>(null)
  //: The Antford design opens the deal's chat from the header's « Ask »
  //: — the pane no longer rides along uninvited.
  const [askOpen, setAskOpen] = useState(false)
  //: The check screen's phase, reported up so the header can grow
  //: « Check another » beside a finished check.
  const [checkPhase, setCheckPhase] = useState<'idle' | 'running' | 'done'>(
    'idle',
  )
  const [checkResetNonce, setCheckResetNonce] = useState(0)

  //: Every deal this person is on. Null while loading — the screens tell
  //: « still asking » apart from « asked, and there are none », because
  //: the second one is the Connect Microsoft screen and the first is not.
  const [checkNonce, setCheckNonce] = useState(0)
  const [checking, setChecking] = useState(false)

  const [deals, setDeals] = useState<DealListItem[] | null>(null)
  const [dealsAt, setDealsAt] = useState(0)
  useEffect(() => {
    let live = true
    api
      .deals()
      .then((found) => live && setDeals(found))
      .catch(() => live && setDeals([]))
    return () => {
      live = false
    }
  }, [api, dealsAt])

  //: Where the Microsoft window lands. The connector's callback sends
  //: the browser to /dashboard?connector=…&reason=… — and when this
  //: render *is* that popup, its whole job is to hand the verdict to
  //: the window that opened it and leave. Without this, the popup
  //: turned into a second full workspace saying « Nothing connected
  //: yet » while Microsoft's own explanation sat unread in its
  //: address bar — which is exactly how the first real connection
  //: attempt failed silently.
  const [connectorProblem, setConnectorProblem] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('connector')
    if (status === null) return
    const reason = params.get('reason')
    if (window.opener !== null) {
      ;(window.opener as Window).postMessage(
        { kind: 'pierce-connector', status, reason },
        window.location.origin,
      )
      window.close()
      return
    }
    //: No opener — the popup was blocked and the flow ran in this tab.
    //: Clean the address bar and carry the verdict to the Connections
    //: screen, which is where the person started.
    window.history.replaceState(null, '', window.location.pathname)
    if (status === 'failed') {
      setConnectorProblem(reason || 'Microsoft refused without saying why.')
      setView('settings')
    }
  }, [])

  const go = (next: View) => () => {
    setView(next)
    setDeal(null)
    setDoc(null)
    setDocChat(null)
    setCheckChat(null)
    setAskOpen(false)
    setAcctOpen(false)
  }

  //: A different document is a different conversation; closing one ends it.
  const openDoc = (next: Artifact | null, at: string | null = null) => {
    setDoc(next)
    setDocAt(at)
    setDocChat(null)
  }

  //: The design's rule: the chat rides beside an open finding and
  //: beside a finished check; beside a deal page it appears only when
  //: « Ask » was pressed — never uninvited.
  const chatContext: ChatContext | null =
    view === 'deals' && deal !== null
      ? doc !== null
        ? docChat
        : askOpen
          ? { scope: 'deal', dealId: deal.id, dealName: deal.name }
          : null
      : view === 'check'
        ? askOpen
          ? checkChat
          : null
        : null

  const hasDeal = view === 'deals' && deal !== null
  //: The Antford dock pill: a soft dark wash and the accent when active,
  //: quiet grey otherwise. No shadow — the bar itself carries the depth.
  const dock = (k: View) => ({
    border: 0,
    background: view === k ? 'rgba(21,23,27,.055)' : 'transparent',
    borderRadius: 22,
    padding: '11px 26px',
    font: 'inherit',
    fontSize: 14.5,
    fontWeight: view === k ? 500 : 400,
    letterSpacing: '-.01em',
    color: view === k ? ink.accent : ink.dock,
    cursor: 'pointer',
    boxShadow: 'none',
  })

  return (
    <div
      className="pc-workspace"
      style={{
        height: '100vh',
        width: '100%',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        fontFamily: font.ui,
        color: ink.base,
        fontSize: 14.5,
        lineHeight: 1.5,
        overflow: 'hidden',
        background: ground,
      }}
    >
      {/* Panes sit edge to edge with a 1px seam — the Antford design
          retires the first workspace's floating cards. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: 1,
          background: shell.paneSeam,
        }}
      >
        {/* The main pane. */}
        <div
          style={{
            flex: '1 1 0',
            minWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            order: 1,
            overflow: 'hidden',
            background: '#ffffff',
          }}
        >
          {/* Header bar. */}
          <div
            style={{
              flex: '0 0 auto',
              height: shell.headerHeight,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 10px',
              borderBottom: shell.headerHairline,
            }}
          >
            {!hasDeal && (
              <span style={{ ...wordmark, margin: '0 6px 0 10px' }}>
                Antford
              </span>
            )}
            {hasDeal && (
              <>
                <button
                  onClick={() => {
                    setDeal(null)
                    openDoc(null)
                    setAskOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'rgba(255,255,255,.75)',
                    border: '1px solid rgba(255,255,255,.7)',
                    boxShadow: '0 1px 2px rgba(18,24,40,.08)',
                    borderRadius: 11,
                    padding: '8px 14px 8px 11px',
                    font: 'inherit',
                    fontWeight: 500,
                    color: ink.accent,
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="9"
                    height="15"
                    viewBox="0 0 9 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="7.5,1.5 1.5,7.5 7.5,13.5" />
                  </svg>
                  <span>Models</span>
                </button>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {deal!.name}
                </span>
                {deal!.client && (
                  <span
                    style={{
                      flex: '0 1 auto',
                      minWidth: 0,
                      color: ink.secondary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {deal!.client}
                  </span>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            {hasDeal && (
              <>
                {/* « Export report » sits beside Ask in the design; it
                    opens the report sheet, which is the next phase —
                    the button arrives with the thing it opens. */}
                <button
                  onClick={() => setAskOpen((was) => !was)}
                  style={{
                    border: 0,
                    background: askOpen ? '#e7e7ea' : '#f0f0f2',
                    color: ink.primary,
                    borderRadius: 11,
                    padding: '9px 15px',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  Ask
                </button>
                <button
                  onClick={() => !checking && setCheckNonce((was) => was + 1)}
                  style={{
                    ...blueButton,
                    marginRight: 4,
                    opacity: checking ? 0.55 : 1,
                    cursor: checking ? 'default' : 'pointer',
                  }}
                >
                  {checking ? 'Checking' : 'Recheck now'}
                </button>
              </>
            )}
            {view === 'check' && checkPhase === 'done' && (
              //: The design's `cDoneBar`: Ask beside « Check another ».
              //: « Export report » joins them with the report sheet it
              //: opens, next phase.
              <>
                <button
                  onClick={() => setAskOpen((was) => !was)}
                  style={{
                    border: 0,
                    background: askOpen ? '#e7e7ea' : '#f0f0f2',
                    color: ink.primary,
                    borderRadius: 11,
                    padding: '9px 15px',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  Ask
                </button>
                <button
                  onClick={() => {
                    setAskOpen(false)
                    setCheckResetNonce((was) => was + 1)
                  }}
                  style={{ ...blueButton, marginRight: 4 }}
                >
                  Check another
                </button>
              </>
            )}
            {view === 'deals' && deal === null && (deals?.length ?? 0) > 0 && (
              <button
                onClick={() => setNewOpen(true)}
                style={{ ...blueButton, marginRight: 4 }}
              >
                Add models
              </button>
            )}
          </div>

          {/* Content. */}
          {view === 'deals' ? (
            <Deals
              api={api}
              organizationId={organizationId}
              deals={deals}
              deal={deal}
              onOpen={(one) => {
                setDeal(one)
                setAskOpen(false)
                // Opening is the seen-event: « since you looked » clears
                // for this person, and only for them. Fire-and-forget —
                // a failed mark must never block the page.
                void api.visit(one.id).catch(() => undefined)
              }}
              onChanged={() => setDealsAt((was) => was + 1)}
              checkNonce={checkNonce}
              onChecking={(running) => {
                setChecking(running)
                //: A finished check changes the list's counts too.
                if (!running) setDealsAt((was) => was + 1)
              }}
              openDocId={doc?.id ?? null}
              onOpenDoc={openDoc}
              onNewDeal={() => setNewOpen(true)}
              onRemoved={() => {
                setDeal(null)
                setDealsAt((was) => was + 1)
              }}
            />
          ) : view === 'check' ? (
            <CheckFile
              api={api}
              organizationId={organizationId}
              onChat={setCheckChat}
              onPhase={setCheckPhase}
              resetNonce={checkResetNonce}
            />
          ) : (
            <Settings
              api={api}
              organizationId={organizationId}
              deals={deals}
              problem={connectorProblem}
            />
          )}
        </div>

        {hasDeal && doc !== null && (
          <DocPanel
            api={api}
            dealId={deal!.id}
            doc={doc}
            openAt={docAt}
            onClose={() => openDoc(null)}
            onChanged={() => setDealsAt((was) => was + 1)}
            onChat={(ctx) =>
              setDocChat(
                ctx === null
                  ? null
                  : { scope: 'finding', dealId: deal!.id, ...ctx },
              )
            }
          />
        )}

        {chatContext !== null && (
          <Chat
            key={chatKeyOf(chatContext)}
            api={api}
            context={chatContext}
            onClose={() => {
              setAskOpen(false)
              setDocChat(null)
            }}
          />
        )}
      </div>

      {newOpen && (
        <NewDeal
          api={api}
          organizationId={organizationId}
          onClose={() => setNewOpen(false)}
          onCreated={() => setDealsAt((was) => was + 1)}
        />
      )}

      {/* The dock — the Antford design's translucent bar along the
          bottom, pills resting directly on it. */}
      <div
        style={{
          flex: '0 0 auto',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '9px 20px 11px',
          background: 'rgba(255,255,255,.92)',
          borderTop: shell.headerHairline,
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
          }}
        >
          <button onClick={go('deals')} style={dock('deals')}>
            Models
          </button>
          <button onClick={go('check')} style={dock('check')}>
            Check a model
          </button>
          <button onClick={go('settings')} style={dock('settings')}>
            Settings
          </button>
          <span
            style={{
              width: 1,
              height: 22,
              background: 'rgba(21,23,27,.12)',
              margin: '0 8px',
            }}
          />
          <div style={{ position: 'relative', display: 'flex' }}>
            <button
              onClick={() => setAcctOpen((was) => !was)}
              title={userName}
              style={{
                border: 0,
                background: 'transparent',
                borderRadius: 22,
                padding: '7px 9px',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'linear-gradient(150deg,#d8e6ff,#b9cdf5)',
                  boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#2c4a80',
                }}
              >
                {initialsOf(userName)}
              </span>
            </button>
            {acctOpen && (
              <>
                <div
                  onClick={() => setAcctOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 29 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 12px)',
                    left: -4,
                    zIndex: 30,
                    width: 272,
                    background: 'rgba(255,255,255,.88)',
                    backdropFilter: 'blur(30px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
                    borderRadius: 15,
                    boxShadow:
                      '0 18px 44px rgba(0,0,0,.22), 0 0 0 .5px rgba(0,0,0,.08)',
                    overflow: 'hidden',
                    animation: 'pcIn .14s ease both',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '15px 16px 14px',
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 38px',
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: 'linear-gradient(150deg,#d8e6ff,#b9cdf5)',
                        boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: '#2c4a80',
                      }}
                    >
                      {initialsOf(userName)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 15.5,
                          fontWeight: 500,
                          letterSpacing: '-.015em',
                        }}
                      >
                        {userName}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: ink.secondary,
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {userEmail}
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      borderTop: '.5px solid rgba(0,0,0,.09)',
                      padding: 6,
                    }}
                  >
                    {(
                      [
                        //: In the design this item closes the popover and
                        //: goes nowhere — there is no notifications screen
                        //: drawn. Kept exactly as drawn; flagged in the
                        //: build notes rather than silently dropped.
                        {
                          label: 'Notifications',
                          fg: ink.primary,
                          go: () => setAcctOpen(false),
                        },
                        {
                          label: 'Settings',
                          fg: ink.primary,
                          go: () => {
                            setAcctOpen(false)
                            setView('settings')
                            setDeal(null)
                          },
                        },
                        {
                          label: 'Sign out',
                          fg: ink.danger,
                          go: () => {
                            window.location.href = '/logout'
                          },
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.label}
                        onClick={item.go}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          background: 'transparent',
                          borderRadius: 9,
                          padding: '9px 11px',
                          font: 'inherit',
                          fontSize: 14.5,
                          color: item.fg,
                          cursor: 'pointer',
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
