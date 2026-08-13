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
import { blueButton, card, font, ground, ink } from './design'
import { CheckFile } from './screens/CheckFile'
import { Deals } from './screens/Deals'
import { DocPanel } from './screens/DocPanel'
import { NewDeal } from './screens/NewDeal'
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
  deals: 'Deals',
  check: 'Check a file',
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
  const [acctOpen, setAcctOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

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

  const go = (next: View) => () => {
    setView(next)
    setDeal(null)
    setDoc(null)
    setAcctOpen(false)
  }

  const hasDeal = view === 'deals' && deal !== null
  const dock = (k: View) => ({
    border: 0,
    background: view === k ? '#ffffff' : 'transparent',
    borderRadius: 22,
    padding: '11px 26px',
    font: 'inherit',
    fontSize: 14.5,
    fontWeight: view === k ? 600 : 400,
    letterSpacing: '-.01em',
    color: view === k ? ink.accent : ink.dock,
    cursor: 'pointer',
    boxShadow: view === k ? '0 2px 8px rgba(16,20,28,.14)' : 'none',
  })

  return (
    <div
      className="pc-workspace"
      style={{
        height: '100vh',
        width: '100%',
        padding: '18px 18px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: font.ui,
        color: ink.base,
        fontSize: 14.5,
        lineHeight: 1.5,
        overflow: 'hidden',
        background: ground,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
        {/* The main card. */}
        <div
          style={{
            flex: '1 1 0',
            minWidth: 540,
            display: 'flex',
            flexDirection: 'column',
            order: 1,
            overflow: 'hidden',
            ...card,
          }}
        >
          {/* Header row. */}
          <div
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderBottom: '1px solid #f0eeec',
            }}
          >
            {!hasDeal && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  background: 'rgba(255,255,255,.75)',
                  border: '1px solid rgba(255,255,255,.7)',
                  boxShadow: '0 1px 2px rgba(18,24,40,.08)',
                  borderRadius: 11,
                  padding: '8px 14px',
                  fontWeight: 500,
                }}
              >
                <span>{LABELS[view]}</span>
              </div>
            )}
            {hasDeal && (
              <>
                <button
                  onClick={() => {
                    setDeal(null)
                    setDoc(null)
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
                  <span>Deals</span>
                </button>
                <span style={{ fontWeight: 500 }}>{deal!.name}</span>
              </>
            )}
            <div style={{ flex: 1 }} />
            {hasDeal && (
              <button
                onClick={() => !checking && setCheckNonce((was) => was + 1)}
                style={{
                  ...blueButton,
                  marginRight: 4,
                  opacity: checking ? 0.55 : 1,
                  cursor: checking ? 'default' : 'pointer',
                }}
              >
                {checking ? 'Checking' : 'Check now'}
              </button>
            )}
            {view === 'deals' && deal === null && (deals?.length ?? 0) > 0 && (
              <button
                onClick={() => setNewOpen(true)}
                style={{ ...blueButton, marginRight: 4 }}
              >
                New deal
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
              onOpen={setDeal}
              onChanged={() => setDealsAt((was) => was + 1)}
              checkNonce={checkNonce}
              onChecking={(running) => {
                setChecking(running)
                //: A finished check changes the list's counts too.
                if (!running) setDealsAt((was) => was + 1)
              }}
              openDocId={doc?.id ?? null}
              onOpenDoc={setDoc}
              onNewDeal={() => setNewOpen(true)}
            />
          ) : view === 'check' ? (
            <CheckFile api={api} deals={deals} />
          ) : (
            //: The design's own face for a view that is not there — the
            //: `vOther` placeholder, borrowed until this screen's round.
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a19f9d',
                fontSize: 13.5,
              }}
            >
              {LABELS[view]}
            </div>
          )}
        </div>

        {hasDeal && doc !== null && (
          <DocPanel
            api={api}
            dealId={deal!.id}
            doc={doc}
            onClose={() => setDoc(null)}
            onChanged={() => setDealsAt((was) => was + 1)}
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

      {/* The dock. */}
      <div
        style={{
          flex: '0 0 auto',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 0 14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'rgba(255,255,255,.55)',
            backdropFilter: 'blur(34px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(34px) saturate(1.8)',
            border: '1px solid rgba(255,255,255,.9)',
            borderRadius: 30,
            boxShadow:
              '0 12px 34px rgba(16,20,28,.14), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.95)',
          }}
        >
          <button onClick={go('deals')} style={dock('deals')}>
            Deals
          </button>
          <button onClick={go('check')} style={dock('check')}>
            Check a file
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
                  fontWeight: 600,
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
                        fontWeight: 600,
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
                          fontWeight: 600,
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
