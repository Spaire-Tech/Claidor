'use client'

/**
 * Settings — the founder's design, wired: Connections, House rules,
 * People, with the invite sheet.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `vSettings`
 * block. Everything on screen is real or absent:
 *
 * - The Microsoft card is the live connector state; Disconnect calls the
 *   real route (owner only — the server refuses anyone else's).
 * - The « Folders Pierce can see » and « Mailbox » rows are omitted, not
 *   faked: the Change buttons have no destination yet. Flagged in the
 *   worklog.
 * - The Office add-in section is the design's, built the day the
 *   manifests started serving from the real domain (it was omitted
 *   while they carried a placeholder — an Install button that installs
 *   a broken add-in is worse than none). Install downloads the
 *   manifest and says where it goes; Copy link is the same manifest
 *   for IT's central deployment.
 * - House rules load from and save to the organization's stored row on
 *   every tap — no save button is drawn, so none exists. The audit rule
 *   list is the server's own catalogue; the grounding toggle and the
 *   rule switches are honoured by the actual runs.
 * - The design's audit master toggle maps to « every rule off » /
 *   « every rule on » — the audit itself always runs and its summary
 *   names what was skipped.
 * - People is the organization's real team; the role column shows only
 *   « You », because job titles are not a thing the system knows —
 *   flagged rather than invented. Invites go through the deal-member
 *   route, which requires an existing account and says so in its own
 *   sentence, shown in place.
 */

import { useEffect, useState } from 'react'
import {
  ApiError,
  ConnectorState,
  DealListItem,
  HouseRules,
  Team,
  TieOutApi,
} from '../api'
import {
  excelLogo,
  font,
  hairline,
  ink,
  inputGlow,
  listCard,
  microsoftLogo,
  sectionHead,
  well,
} from '../design'
import { avatarOf, initialsOf } from '../files'

//: The design's Install button — blue, one size smaller than the
//: toolbar's.
const installButton = {
  flex: '0 0 auto',
  border: 0,
  background: ink.accent,
  color: '#fff',
  borderRadius: 9,
  padding: '7px 15px',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'pointer',
} as const

//: Download without leaving the page — navigating to the manifest
//: would render XML in the tab instead of saving it.
const takeManifest = (path: string) => {
  const link = document.createElement('a')
  link.href = path
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}

type Tab = 'conn' | 'rules' | 'people'

//: The design's writing rows, with the design's own options. The keys
//: are the stored dictionary's; the first option is the default.
const WRITING: { key: string; name: string; opts: string[] }[] = [
  { key: 'range', name: 'Ranges', opts: ['$455–528mm', '$455mm to $528mm'] },
  { key: 'fy', name: 'Fiscal years', opts: ['FY2025A', 'FY25A'] },
  { key: 'unit', name: 'Units', opts: ['mm', 'm', 'million'] },
  { key: 'neg', name: 'Negatives', opts: ['(139.2)', '−139.2'] },
]

const SOON = [
  {
    name: 'Cross-references',
    sub: 'Schedule and exhibit numbers that point at the wrong place',
  },
  {
    name: 'Defined terms',
    sub: 'Terms used before they are defined, or never defined',
  },
  {
    name: 'House style',
    sub: 'Ranges, units and negatives written the firm’s way',
  },
]

export const Settings = ({
  api,
  organizationId,
  deals,
  problem = null,
  onChangeFolders,
}: {
  api: TieOutApi
  organizationId: string
  /** The shell's deals list — the invite sheet's tickboxes. */
  deals: DealListItem[] | null
  /** A connector failure the shell caught landing (popup-blocked path). */
  problem?: string | null
  /** « Folders Swens watches » → Change — the shell's folder browser. */
  onChangeFolders?: () => void
}) => {
  const [tab, setTab] = useState<Tab>('conn')
  const [connector, setConnector] = useState<ConnectorState | null>(null)
  const [waiting, setWaiting] = useState(false)
  //: Microsoft's own sentence when a connection attempt dies —
  //: « AADSTS65001: the administrator has not consented… ». The first
  //: real attempt failed with the reason sitting unread in the popup's
  //: address bar; whatever the cause, the person sees it here now.
  const [said, setSaid] = useState<string | null>(problem)
  const [rules, setRules] = useState<HouseRules | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [connAt, setConnAt] = useState(0)
  const [teamAt, setTeamAt] = useState(0)
  //: Which add-in's install steps are showing, after its Install
  //: pressed. A web page cannot reach inside Office to install an
  //: add-in — the button downloads the manifest and the sentence
  //: below the card says where it goes.
  const [installNote, setInstallNote] = useState<'docs' | 'mail' | null>(null)
  const [copied, setCopied] = useState(false)

  //: The Microsoft popup reports back and closes itself (the shell's
  //: landing effect posts this message). Success refreshes the state;
  //: failure stops the waiting face and says why.
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
        setConnAt((was) => was + 1)
      } else {
        setSaid(data.reason || 'Microsoft refused without saying why.')
      }
    }
    window.addEventListener('message', hear)
    return () => window.removeEventListener('message', hear)
  }, [])

  useEffect(() => {
    let live = true
    api
      .connectorState(organizationId)
      .then((state) => {
        if (!live) return
        setConnector(state)
        //: The moment consent lands, stop waiting — settled here where
        //: the answer arrives rather than in a second effect. Active
        //: only: a disconnected row still exists, and treating it as
        //: the answer ended every reconnect before consent landed.
        if (state.connection?.status === 'active') setWaiting(false)
      })
      .catch(() => live && setConnector(null))
    return () => {
      live = false
    }
  }, [api, organizationId, connAt])

  //: While the Microsoft window is open, ask again every few seconds so
  //: the card moves to « connected » the moment consent lands — the
  //: deals empty state's own pattern.
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setConnAt((was) => was + 1), 3000)
    return () => clearInterval(timer)
  }, [waiting])

  useEffect(() => {
    let live = true
    api
      .houseRules(organizationId)
      .then((found) => live && setRules(found))
      .catch(() => live && setRules(null))
    return () => {
      live = false
    }
  }, [api, organizationId])

  useEffect(() => {
    let live = true
    api
      .team(organizationId)
      .then((found) => live && setTeam(found))
      .catch(() => live && setTeam(null))
    return () => {
      live = false
    }
  }, [api, organizationId, teamAt])

  //: Save-on-tap: the design draws no save button, so none exists. The
  //: server answers with the whole rules object and the screen keeps it.
  const change = (update: Parameters<TieOutApi['putHouseRules']>[1]) => {
    if (rules === null) return
    //: Optimistic locally, settled by the server's answer.
    api
      .putHouseRules(organizationId, update)
      .then(setRules)
      .catch(() => undefined)
  }

  const offRules = rules?.rules.filter((one) => !one.on) ?? []
  //: Two families under two switches. The design draws both master
  //: switches over one checklist; scoping each to its own family —
  //: construction rules under « Model audit rules », statement checks
  //: under « Statement checks » — is the only reading where flipping
  //: one never silently moves the other.
  const buildRules = rules?.rules.filter((one) => !one.analytical) ?? []
  const stateRules = rules?.rules.filter((one) => one.analytical) ?? []
  const auditOn = rules !== null && buildRules.some((one) => one.on)
  const statementsOn = rules !== null && stateRules.some((one) => one.on)

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
          flex: '0 0 auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '22px 34px 4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 4,
            background: 'rgba(21,23,27,.045)',
            borderRadius: 26,
          }}
        >
          {(
            [
              { key: 'conn', label: 'Connections' },
              { key: 'rules', label: 'House rules' },
              { key: 'people', label: 'People' },
            ] as const
          ).map((one) => (
            <button
              key={one.key}
              onClick={() => setTab(one.key)}
              style={{
                border: 0,
                background: tab === one.key ? '#ffffff' : 'transparent',
                boxShadow:
                  tab === one.key ? '0 1px 2px rgba(16,20,28,.10)' : 'none',
                borderRadius: 22,
                padding: '11px 26px',
                font: 'inherit',
                fontSize: 14.5,
                fontWeight: tab === one.key ? 500 : 400,
                letterSpacing: '-.01em',
                color: tab === one.key ? ink.accent : ink.dock,
                cursor: 'pointer',
              }}
            >
              {one.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '20px 34px 34px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 620 }}>
          {tab === 'conn' && (
            <div>
              <div style={{ ...sectionHead, padding: '0 4px 9px' }}>
                Microsoft account
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                {/* Active only. A disconnected or expired row still
                    exists — kept so a deal's folder can say why it
                    stopped syncing — and this card wearing « Connected »
                    over it was the bug that made Disconnect look dead
                    and Reconnect impossible. */}
                {connector?.connection?.status === 'active' ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '15px 16px 15px 20px',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={microsoftLogo}
                      alt=""
                      style={{
                        flex: '0 0 20px',
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
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
                        {connector.connection.account_email}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          color: ink.secondary,
                          marginTop: 2,
                        }}
                      >
                        {`Connected ${new Date(
                          connector.connection.connected_at,
                        ).toLocaleDateString([], {
                          day: 'numeric',
                          month: 'long',
                        })}`}
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        void api
                          .disconnect(connector.connection!.id)
                          .then(() => {
                            setSaid(null)
                            setConnAt((was) => was + 1)
                          })
                          //: A failed disconnect says so, in the
                          //: server's words — silence here reads as
                          //: « the button does nothing ».
                          .catch((problem) =>
                            setSaid(String(problem?.message ?? problem)),
                          )
                      }}
                      style={{
                        flex: '0 0 auto',
                        border: 0,
                        background: 'transparent',
                        font: 'inherit',
                        fontSize: 14,
                        color: ink.danger,
                        cursor: 'pointer',
                        padding: '4px 6px',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  //: Borrowed face: the design's settings assume a
                  //: connection; before one exists this row offers the
                  //: same Connect the deals empty state does.
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '15px 16px 15px 20px',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={microsoftLogo}
                      alt=""
                      style={{
                        flex: '0 0 20px',
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
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
                        {waiting
                          ? 'Waiting for Microsoft…'
                          : said
                            ? 'Microsoft said no'
                            : connector?.connection?.status === 'expired'
                              ? 'The connection expired'
                              : connector?.connection
                                ? 'Disconnected'
                                : 'Nothing connected yet'}
                      </span>
                      {/* This branch is only ever a non-active row —
                          the active one wears the connected card. */}
                      {!said && !waiting && connector?.connection && (
                        //: Which account this was, and — for an expiry —
                        //: Microsoft's own reason. Reconnecting is the
                        //: same press as connecting.
                        <span
                          style={{
                            display: 'block',
                            fontSize: 13,
                            lineHeight: 1.45,
                            color: ink.secondary,
                            marginTop: 3,
                          }}
                        >
                          {[
                            connector.connection.account_email,
                            connector.connection.status === 'expired'
                              ? connector.connection.error
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' — ')}
                        </span>
                      )}
                      {said && !waiting && (
                        //: The refusal verbatim — an AADSTS sentence names
                        //: its own fix, and paraphrasing it hides the code
                        //: a search needs.
                        <span
                          style={{
                            display: 'block',
                            fontSize: 13,
                            lineHeight: 1.45,
                            color: ink.danger,
                            marginTop: 3,
                          }}
                        >
                          {said}
                        </span>
                      )}
                    </span>
                    {connector?.authorize_url && !waiting && (
                      <button
                        onClick={() => {
                          setSaid(null)
                          window.open(
                            connector.authorize_url!,
                            '_blank',
                            'width=600,height=760',
                          )
                          setWaiting(true)
                        }}
                        style={{
                          flex: '0 0 auto',
                          border: 0,
                          background: ink.accent,
                          color: '#fff',
                          borderRadius: 9,
                          padding: '7px 15px',
                          font: 'inherit',
                          fontSize: 13.5,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Connect Microsoft
                      </button>
                    )}
                  </div>
                )}
                {/* The drawn second row of the account card — restored
                  per the Swens export; only meaningful once a
                  connection exists to watch through. */}
                {connector?.connection?.status === 'active' && (
                  <div
                    style={{
                      borderTop: '.5px solid #f4f3f5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '15px 16px 15px 20px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 16,
                        letterSpacing: '-.012em',
                      }}
                    >
                      Folders Swens watches
                    </span>
                    <button
                      onClick={() => onChangeFolders?.()}
                      style={{
                        flex: '0 0 auto',
                        border: 0,
                        background: 'transparent',
                        font: 'inherit',
                        fontSize: 14,
                        color: '#2b6cf5',
                        cursor: 'pointer',
                        padding: '4px 6px',
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: '15px 20px',
                  ...listCard,
                  fontSize: 14.5,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Swens reads. It never writes to your files or your mailbox. It
                can only see what you can already open.
              </div>

              {/* The design's « The Excel add-in » section — Excel is the
                  product's one Office surface now; the Word, PowerPoint
                  and Outlook rows are retired with the posture. Install
                  downloads the manifest — a web page cannot reach inside
                  Office to install one — and the sentence that appears
                  under the card with the next step is the borrowed
                  read-only card idiom: the design draws no post-click
                  state. Flagged for the founder's pass. */}
              <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
                The Excel add-in
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '17px 16px 17px 20px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={excelLogo}
                    alt="Excel"
                    style={{
                      flex: '0 0 30px',
                      width: 30,
                      height: 30,
                      objectFit: 'contain',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 16,
                      fontWeight: 500,
                      letterSpacing: '-.015em',
                    }}
                  >
                    Microsoft Excel
                  </span>
                  <button
                    onClick={() => {
                      setInstallNote('docs')
                      takeManifest('/panel/manifest.xml')
                    }}
                    style={installButton}
                  >
                    Install
                  </button>
                </div>
                <div
                  style={{
                    borderTop: hairline,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '15px 16px 15px 20px',
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
                      Deploy to the whole team
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13.5,
                        color: ink.secondary,
                        marginTop: 2,
                      }}
                    >
                      A manifest link for IT to push through Microsoft 365 admin
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(
                          `${window.location.origin}/panel/manifest.xml`,
                        )
                        .then(() => {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1800)
                        })
                        .catch(() => undefined)
                    }}
                    style={{
                      flex: '0 0 auto',
                      border: 0,
                      background: 'transparent',
                      font: 'inherit',
                      fontSize: 14,
                      color: ink.accent,
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
              {installNote && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '15px 20px',
                    ...listCard,
                    fontSize: 14.5,
                    lineHeight: 1.5,
                  }}
                >
                  {'The manifest is downloading. In Excel: Home → Add-ins → ' +
                    'More Add-ins → My Add-ins → Upload My Add-in, and pick ' +
                    'the file. IT can push it to everyone at once with the ' +
                    'link below.'}
                </div>
              )}
              {/* The design's « Folders Pierce can see » / « Mailbox »
                  rows and the Office add-in install section are omitted
                  until they have real destinations — see the worklog. */}
            </div>
          )}

          {tab === 'rules' && rules !== null && (
            <div>
              <div style={{ ...sectionHead, padding: '0 4px 9px' }}>
                Materiality
              </div>
              <div
                style={{ ...listCard, padding: '16px 20px 17px', marginBottom: 26 }}
              >
                <div style={{ fontSize: 15.5, lineHeight: 1.5 }}>
                  A finding that leaves this much money out reads as
                  Material. Below it, Significant. Leave it empty and each
                  model sets its own line: half a percent of its largest
                  total.
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  <input
                    inputMode="decimal"
                    defaultValue={rules.materiality ?? ''}
                    placeholder="the model's own scale"
                    onBlur={(e) => {
                      const typed = e.currentTarget.value.trim().replace(/,/g, '')
                      const number = typed === '' ? 0 : Number(typed)
                      if (Number.isNaN(number)) return
                      if ((rules.materiality ?? 0) !== number)
                        change({ materiality: number })
                    }}
                    style={{
                      border: 0,
                      background: '#f0f0f2',
                      borderRadius: 10,
                      height: 38,
                      padding: '0 13px',
                      font: 'inherit',
                      fontSize: 14,
                      width: 220,
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 13, color: ink.dock }}>
                    in the model&apos;s own units
                  </span>
                </div>
              </div>
              <div style={{ ...sectionHead, padding: '0 4px 9px' }}>
                Rounding differences
              </div>
              <div style={{ ...listCard, padding: '16px 20px 17px' }}>
                <div style={{ fontSize: 15.5, lineHeight: 1.5 }}>
                  Figures that agree once rounded to the deck&apos;s own
                  precision.
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 13,
                    padding: 4,
                    background: '#f0f0f2',
                    borderRadius: 22,
                  }}
                >
                  {(
                    [
                      { label: 'List with everything else', value: 'together' },
                      { label: 'Group separately', value: 'separate' },
                    ] as const
                  ).map((one) => {
                    const on = rules.rounding === one.value
                    return (
                      <button
                        key={one.value}
                        onClick={() => change({ rounding: one.value })}
                        style={{
                          border: 0,
                          background: on ? '#fff' : 'transparent',
                          boxShadow: on
                            ? '0 2px 8px rgba(16,20,28,.14)'
                            : 'none',
                          color: on ? ink.accent : ink.dock,
                          borderRadius: 18,
                          padding: '8px 18px',
                          font: 'inherit',
                          fontSize: 14,
                          fontWeight: on ? 600 : 400,
                          letterSpacing: '-.01em',
                          cursor: 'pointer',
                        }}
                      >
                        {one.label}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: ink.secondary,
                    marginTop: 11,
                  }}
                >
                  Found either way. Never hidden.
                </div>
              </div>

              <div style={{ ...sectionHead, padding: '26px 4px 4px' }}>
                How we write numbers
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: ink.secondary,
                  padding: '0 4px 9px',
                  lineHeight: 1.5,
                }}
              >
                Used whenever Swens proposes a correction. Enforced only if the
                House style check is on below.
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                {WRITING.map((row, index) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      borderTop: index === 0 ? '0' : hairline,
                      padding: '12px 16px 12px 20px',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 16,
                        fontWeight: 500,
                        letterSpacing: '-.015em',
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        flex: '0 0 auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: 3,
                        background: '#f0f0f2',
                        borderRadius: 20,
                      }}
                    >
                      {row.opts.map((option) => {
                        const picked =
                          (rules.writing[row.key] ?? row.opts[0]) === option
                        return (
                          <button
                            key={option}
                            onClick={() =>
                              change({
                                writing: {
                                  ...rules.writing,
                                  [row.key]: option,
                                },
                              })
                            }
                            style={{
                              border: 0,
                              background: picked ? '#fff' : 'transparent',
                              boxShadow: picked
                                ? '0 2px 8px rgba(16,20,28,.14)'
                                : 'none',
                              color: picked ? ink.accent : ink.dock,
                              borderRadius: 17,
                              padding: '7px 16px',
                              fontFamily: font.mono,
                              fontSize: 13,
                              fontWeight: picked ? 500 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
                Checks
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 20px',
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
                      Figures against the model
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13.5,
                        color: ink.secondary,
                        marginTop: 2,
                      }}
                    >
                      Every figure traced to the cell it came from
                    </span>
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 14,
                      color: ink.secondary,
                    }}
                  >
                    Always on
                  </span>
                </div>

                <div style={{ borderTop: hairline }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 16px 13px 20px',
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
                        Model inputs against sources
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          color: ink.secondary,
                          marginTop: 2,
                        }}
                      >
                        Typed inputs traced back to the audited accounts
                      </span>
                    </span>
                    <Switch
                      on={rules.grounding}
                      onFlip={() => change({ grounding: !rules.grounding })}
                    />
                  </div>
                </div>

                <div style={{ borderTop: hairline }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 16px 13px 20px',
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
                        Model audit rules
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          color: ink.secondary,
                          marginTop: 2,
                        }}
                      >
                        Hardcodes, broken links, formulas that break across a
                        row
                      </span>
                    </span>
                    {auditOn && (
                      <button
                        onClick={() => setAuditOpen((was) => !was)}
                        style={{
                          flex: '0 0 auto',
                          border: 0,
                          background: 'transparent',
                          font: 'inherit',
                          fontSize: 14,
                          color: ink.accent,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                      >
                        {`${rules.rules.length - offRules.length} of ${
                          rules.rules.length
                        } rules`}
                      </button>
                    )}
                    <Switch
                      on={auditOn}
                      onFlip={() =>
                        //: The design's master switch, mapped honestly
                        //: and scoped to its family: off is every
                        //: construction rule off, on is every one on.
                        //: The audit itself always runs, and its
                        //: summary names what was skipped.
                        change({
                          audit_rules_off: auditOn
                            ? [
                                ...new Set([
                                  ...offRules.map((one) => one.key),
                                  ...buildRules.map((one) => one.key),
                                ]),
                              ]
                            : offRules
                                .map((one) => one.key)
                                .filter(
                                  (key) =>
                                    !buildRules.some((one) => one.key === key),
                                ),
                        })
                      }
                    />
                  </div>
                  {auditOpen && auditOn && (
                    <div
                      style={{
                        background: '#fafafc',
                        borderTop: hairline,
                        padding: '6px 0',
                      }}
                    >
                      {rules.rules.map((rule) => (
                        <button
                          key={rule.key}
                          onClick={() =>
                            change({
                              audit_rules_off: rule.on
                                ? [...offRules.map((one) => one.key), rule.key]
                                : offRules
                                    .map((one) => one.key)
                                    .filter((key) => key !== rule.key),
                            })
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 11,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            background: 'transparent',
                            font: 'inherit',
                            cursor: 'pointer',
                            padding: '8px 20px 8px 32px',
                          }}
                        >
                          <span
                            style={{
                              flex: '0 0 17px',
                              width: 17,
                              height: 17,
                              borderRadius: 4,
                              background: rule.on ? ink.accent : 'transparent',
                              boxShadow: `inset 0 0 0 1.5px ${
                                rule.on ? ink.accent : '#c7c7cc'
                              }`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                            }}
                          >
                            {rule.on && (
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="5,12.5 10,17.5 19,6.5" />
                              </svg>
                            )}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              color: rule.on ? ink.primary : ink.secondary,
                            }}
                          >
                            {rule.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* The statement checks' own switch — the v2 design's
                    new group, in its words. */}
                <div style={{ borderTop: hairline }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 16px 13px 20px',
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
                        Statement checks
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          color: ink.secondary,
                          marginTop: 2,
                        }}
                      >
                        Whether the accounts hold together: balancing, cash
                        carried forward, debt repaid, and the model&rsquo;s own
                        check rows
                      </span>
                    </span>
                    <Switch
                      on={statementsOn}
                      onFlip={() =>
                        change({
                          audit_rules_off: statementsOn
                            ? [
                                ...new Set([
                                  ...offRules.map((one) => one.key),
                                  ...stateRules.map((one) => one.key),
                                ]),
                              ]
                            : offRules
                                .map((one) => one.key)
                                .filter(
                                  (key) =>
                                    !stateRules.some((one) => one.key === key),
                                ),
                        })
                      }
                    />
                  </div>
                </div>

                {SOON.map((one) => (
                  <div
                    key={one.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      borderTop: hairline,
                      padding: '13px 16px 13px 20px',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 16,
                          fontWeight: 500,
                          letterSpacing: '-.015em',
                          color: ink.faint,
                        }}
                      >
                        {one.name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          color: '#c7c7cc',
                          marginTop: 2,
                        }}
                      >
                        {one.sub}
                      </span>
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontSize: 13.5,
                        color: ink.faint,
                      }}
                    >
                      Not available yet
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'people' && team !== null && (
            <div>
              <div style={{ ...sectionHead, padding: '0 4px 9px' }}>
                Who&apos;s on the team
              </div>
              <div style={{ ...listCard, overflow: 'hidden' }}>
                {team.members.map((member, index) => {
                  const avatar = avatarOf(member.name)
                  //: Counts, never names — the founder's decision (26
                  //: August). Which deals a colleague is on is the
                  //: deal's business; this line says how many, at most.
                  const line =
                    member.deal_count === 0
                      ? 'No deals yet'
                      : team.total_deals > 1 &&
                          member.deal_count === team.total_deals
                        ? `All ${team.total_deals} deals`
                        : member.deal_count === 1
                          ? 'On 1 deal'
                          : `On ${member.deal_count} deals`
                  return (
                    <div
                      key={member.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        borderTop: index === 0 ? '0' : hairline,
                        padding: '13px 16px 13px 20px',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 34px',
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: avatar.bg,
                          boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12.5,
                          fontWeight: 600,
                          letterSpacing: '.01em',
                          color: avatar.fg,
                        }}
                      >
                        {initialsOf(member.name)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 16,
                            fontWeight: 500,
                            letterSpacing: '-.015em',
                          }}
                        >
                          {member.name}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 13.5,
                            color: ink.secondary,
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {line}
                        </span>
                      </span>
                      {/* The design's role column carries job titles the
                          system does not know; only « You » is true. */}
                      {member.you && (
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 14,
                            color: ink.secondary,
                          }}
                        >
                          You
                        </span>
                      )}
                    </div>
                  )
                })}
                <div
                  style={{
                    borderTop: hairline,
                    padding: '13px 16px 13px 20px',
                  }}
                >
                  <button
                    onClick={() => setInviteOpen(true)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      font: 'inherit',
                      fontSize: 15,
                      color: ink.accent,
                      cursor: 'pointer',
                      padding: '2px 0',
                    }}
                  >
                    Invite someone
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {inviteOpen && (
        <Invite
          api={api}
          deals={deals ?? []}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false)
            setTeamAt((was) => was + 1)
          }}
        />
      )}
    </div>
  )
}

/** The design's switch: 51×31, green track, white knob. */
const Switch = ({ on, onFlip }: { on: boolean; onFlip: () => void }) => (
  <button
    onClick={onFlip}
    style={{
      flex: '0 0 51px',
      width: 51,
      height: 31,
      border: 0,
      borderRadius: 16,
      background: on ? ink.clean : '#e9e9eb',
      cursor: 'pointer',
      padding: 2,
      display: 'flex',
      justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background .2s ease',
    }}
  >
    <span
      style={{
        width: 27,
        height: 27,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 2px 5px rgba(0,0,0,.2), 0 0 0 .5px rgba(0,0,0,.04)',
      }}
    />
  </button>
)

/** The invite sheet: an email, and the deals they can see. */
const Invite = ({
  api,
  deals,
  onClose,
  onInvited,
}: {
  api: TieOutApi
  deals: DealListItem[]
  onClose: () => void
  onInvited: () => void
}) => {
  const [email, setEmail] = useState('')
  const [picks, setPicks] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState('')
  const [focused, setFocused] = useState(false)

  const send = async () => {
    if (sending || email.trim() === '' || picks.length === 0) return
    setSending(true)
    setProblem('')
    try {
      for (const dealId of picks) {
        await api.addDealMember(dealId, email.trim())
      }
      onInvited()
    } catch (failure) {
      //: The server's own sentence, shown in place — including the
      //: member route's rule that the address must already have an
      //: account.
      setProblem(
        failure instanceof ApiError
          ? failure.message
          : 'The invite could not be sent.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(16,20,28,.28)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        padding: 24,
      }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'relative',
          width: 'min(460px,100%)',
          background: 'rgba(255,255,255,.94)',
          backdropFilter: 'blur(30px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
          borderRadius: 18,
          boxShadow: '0 30px 70px rgba(0,0,0,.28), 0 0 0 .5px rgba(0,0,0,.08)',
          overflow: 'hidden',
          animation: 'pcIn .16s ease both',
        }}
      >
        <div style={{ padding: '24px 24px 4px', textAlign: 'center' }}>
          <div
            style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.02em' }}
          >
            Invite someone
          </div>
          <div style={{ fontSize: 13.5, color: ink.secondary, marginTop: 3 }}>
            They will see only the deals you tick.
          </div>
        </div>

        <div style={{ padding: '18px 24px 6px' }}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: '100%',
              border: 0,
              background: '#f0f0f2',
              borderRadius: 11,
              padding: '13px 15px',
              font: 'inherit',
              fontSize: 15.5,
              color: ink.primary,
              outline: 'none',
              boxShadow: focused ? inputGlow : 'none',
            }}
          />
          {problem !== '' && (
            <div
              style={{
                fontSize: 13.5,
                color: '#3a3a3c',
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              {problem}
            </div>
          )}
        </div>

        <div style={{ ...sectionHead, padding: '16px 24px 4px' }}>
          Deals they can see
        </div>
        <div
          style={{
            margin: '0 24px',
            maxHeight: 210,
            overflow: 'auto',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 0 0 .5px rgba(0,0,0,.08)',
          }}
        >
          {deals.map((deal, index) => {
            const on = picks.includes(deal.id)
            return (
              <button
                key={deal.id}
                onClick={() =>
                  setPicks((was) =>
                    was.includes(deal.id)
                      ? was.filter((one) => one !== deal.id)
                      : [...was, deal.id],
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  borderTop: index === 0 ? '0' : '.5px solid #f0eff1',
                  background: 'transparent',
                  font: 'inherit',
                  cursor: 'pointer',
                  padding: '11px 14px',
                }}
              >
                <span
                  style={{
                    flex: '0 0 19px',
                    width: 19,
                    height: 19,
                    borderRadius: '50%',
                    background: on ? ink.accent : 'transparent',
                    boxShadow: `inset 0 0 0 1.5px ${on ? ink.accent : '#d4d4d8'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  {on && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="5,12.5 10,17.5 19,6.5" />
                    </svg>
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: '-.01em',
                  }}
                >
                  {deal.name}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 9, padding: '20px 24px 22px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              border: 0,
              background: '#f0f0f2',
              borderRadius: 11,
              padding: 12,
              font: 'inherit',
              fontSize: 15,
              fontWeight: 500,
              color: ink.primary,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void send()}
            style={{
              flex: 1,
              border: 0,
              background: ink.accent,
              borderRadius: 11,
              padding: 12,
              font: 'inherit',
              fontSize: 15,
              fontWeight: 500,
              color: '#fff',
              cursor: 'pointer',
              opacity:
                sending || email.trim() === '' || picks.length === 0 ? 0.55 : 1,
            }}
          >
            {sending ? 'Sending' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
