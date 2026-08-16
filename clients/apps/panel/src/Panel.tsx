/**
 * The Antford panel, inside Excel (and any Office host that opens it).
 *
 * Source of truth: `docs/pierce/design-antford-panel/panel.html` — the
 * founder's Excel-panel redesign, 15 August. The left half of that file
 * is a mock spreadsheet drawn for context; the panel is the right-hand
 * column, and this file is that column against real data. Everything it
 * *does* is in `usePanel`; this file is only what it looks like.
 *
 * **What the panel does now is its one job: check the model that is
 * open.** The workbook's own bytes are read out of Excel and put
 * through the engine — no deal, no picker, nobody asked where their
 * own file « belongs ». The deal-identification faces are gone with
 * the pivot.
 *
 * The design's own decisions, kept:
 * - Buttons are **black**. Blue is for links and cell references.
 * - The mark is a Bodoni « A », not the wordmark.
 * - A finding is a cell reference in Excel's own face — tap it and the
 *   sheet moves there — beside one plain sentence, the standard beneath.
 * - « That's fine » with its deliberate note needs somewhere to keep
 *   the answer; a one-off check keeps nothing, so the flow is out
 *   until checks persist per model — flagged, not faked.
 *
 * Departures, each because the drawn thing has no data or no home yet:
 * - « Signed in as … » on the consent face is omitted — the token the
 *   panel holds does not carry the address.
 * - « Export report » in the footer arrives with the report itself
 *   (demo-kit work); « Sign out » keeps the slot's right edge.
 * - The avatar in the header is omitted for the same no-profile reason.
 * - The design draws no choose-deal, unsupported or failed face; those
 *   states keep their screens, restyled to the design's type.
 * - A jump that does not land says so in a line the design does not
 *   draw — a panel that silently fails to move looks exactly like one
 *   that moved somewhere wrong.
 */

import { useEffect, useState } from 'react'

import type { PanelDefect } from './api'
import { TieOutApi } from './api'
import { current } from './auth'
import { API_BASE, SIGN_IN_URL } from './config'
import { font, ink } from './design'
import type { HostBridge } from './host'
import { usePanel } from './usePanel'

const api = new TieOutApi({
  baseUrl: API_BASE,
  token: () => current()?.token ?? null,
})

/** Excel's own face, for cell references only. */
const excelFace = "'Aptos Narrow','Calibri','Segoe UI',sans-serif"

/** The design's black button. */
const black = {
  border: 0,
  background: ink.primary,
  color: '#fff',
  font: 'inherit',
  cursor: 'pointer',
} as const

/** « Allow access » is asked once per install, then remembered here —
 *  it gates Antford's reading, which is real, so the answer is kept. */
const ALLOWED = 'claidor.panel.allowed'

/** `'Opex'!N1885` → `N1885` — the sheet is where the jump goes, not
 *  what the row needs to say. */
const addressOf = (ref: string): string => {
  const at = ref.lastIndexOf('!')
  return at < 0 ? ref : ref.slice(at + 1)
}

/** « 11:42 » today, « yesterday 18:20 », « 1 August » before that. */
const timeWord = (at: string): string => {
  const then = new Date(at)
  const now = new Date()
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  if (then.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `yesterday ${time}`
  return then.toLocaleDateString([], { day: 'numeric', month: 'long' })
}

const PHASES = [
  'Reading the workbook',
  'Following the formulas',
  'Running the checks',
  'Tracing each finding to its cell',
]

/** The design's ring: a hairline circle filling clockwise around the
 *  mark, eased to feel like work rather than a timer. */
const Ring = ({ phases }: { phases: boolean }) => {
  const [frac, setFrac] = useState(0.004)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      //: Eases toward 0.94 over ~6s and holds — the real work has no
      //: clock, and the face is replaced the moment the answer lands.
      const p = Math.min(1, (now - t0) / 6000)
      setFrac(0.94 * (1 - Math.pow(1 - p, 2.2)) + 0.004)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const radius = 44
  const round = 2 * Math.PI * radius
  const phase =
    PHASES[
      Math.min(PHASES.length - 1, Math.floor((frac / 0.94) * PHASES.length))
    ]
  return (
    <>
      <div
        style={{
          position: 'relative',
          width: 96,
          height: 96,
          flex: '0 0 auto',
        }}
      >
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'rotate(-90deg)',
          }}
        >
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="#f0eff2"
            strokeWidth="1.5"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={ink.primary}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={round}
            strokeDashoffset={round * (1 - Math.min(1, frac))}
          />
        </svg>
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: font.brand,
            fontSize: 27,
            lineHeight: 1,
            paddingBottom: 3,
            color: ink.primary,
          }}
        >
          A
        </span>
      </div>
      {phases && (
        <div
          key={phase}
          style={{
            fontSize: 15,
            color: ink.primary,
            letterSpacing: '-.01em',
            marginTop: 24,
            textAlign: 'center',
            animation: 'antford-fade .45s ease both',
          }}
        >
          {phase}
        </div>
      )}
    </>
  )
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      fontFamily: font.ui,
      color: ink.primary,
      fontSize: 13.5,
      lineHeight: 1.5,
      overflow: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}
  >
    {/* The mark — the design's header, every state. */}
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 18px 12px',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: font.brand,
          fontSize: 19,
          lineHeight: 1,
          letterSpacing: '.01em',
        }}
      >
        A
      </span>
    </div>
    {children}
  </div>
)

export function Panel({ bridge }: { bridge: HostBridge }) {
  const [allowed, setAllowed] = useState(
    () => localStorage.getItem(ALLOWED) === 'yes',
  )
  const panel = usePanel(bridge, api, SIGN_IN_URL, allowed)
  const [problem, setProblem] = useState<string | null>(null)
  //: The picked finding — selected here, selected in the sheet.
  const [sel, setSel] = useState<string | null>(null)

  const signedIn = current() !== null

  if (panel.stage === 'signed-out') {
    return (
      <Shell>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px 46px',
            animation: 'antford-fade .4s ease both',
          }}
        >
          <span
            style={{
              flex: '0 0 auto',
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#fff',
              boxShadow:
                '0 1px 3px rgba(0,0,0,.06), 0 0 0 .5px rgba(0,0,0,.09)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: font.brand,
              fontSize: 27,
              lineHeight: 1,
              paddingBottom: 3,
            }}
          >
            A
          </span>
          <div
            style={{
              fontSize: 23,
              letterSpacing: '-.024em',
              lineHeight: 1.22,
              marginTop: 22,
              textAlign: 'center',
              textWrap: 'balance',
            }}
          >
            Audit the model you have open.
          </div>
          <div
            style={{
              fontSize: 14.5,
              color: ink.secondary,
              lineHeight: 1.5,
              marginTop: 9,
              textAlign: 'center',
              textWrap: 'balance',
            }}
          >
            Every check an auditor runs. Each one points at a cell.
          </div>
          {panel.error && (
            <div
              style={{
                fontSize: 12.5,
                color: ink.danger,
                lineHeight: 1.5,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              {panel.error}
            </div>
          )}
          <button
            onClick={() => void panel.signIn()}
            style={{
              ...black,
              width: '100%',
              marginTop: 26,
              borderRadius: 11,
              padding: '13px 18px',
              fontSize: 15,
            }}
          >
            Log in
          </button>
          <div
            style={{
              fontSize: 12.5,
              color: '#a1a1a6',
              marginTop: 15,
              textAlign: 'center',
            }}
          >
            Read only. Nothing leaves your tenancy.
          </div>
        </div>
      </Shell>
    )
  }

  //: Signed in but not yet allowed: the consent face, in front of any
  //: reading. « Allow access » is what lets the machine touch the file.
  if (signedIn && !allowed) {
    return (
      <Shell>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 24px 24px',
          }}
        >
          <div
            style={{
              fontSize: 19,
              letterSpacing: '-.02em',
              lineHeight: 1.28,
              textWrap: 'balance',
            }}
          >
            Antford wants access to this workbook
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}
          >
            {[
              {
                what: 'Read this workbook',
                why: 'Formulas, values and sheet structure. Read only.',
              },
              {
                what: 'Select cells',
                why: 'So a finding can take you to the cell it came from.',
              },
              {
                what: 'Keep your notes',
                why: 'Anything you mark deliberate is stored with the file.',
              },
            ].map((scope, index) => (
              <div
                key={scope.what}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 11,
                  borderTop: index === 0 ? 0 : '.5px solid #f0eff1',
                  padding: '14px 0',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ink.primary}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: '0 0 14px', marginTop: 3 }}
                >
                  <polyline points="5,12.5 10,17.5 19,6.5" />
                </svg>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ display: 'block', fontSize: 14, lineHeight: 1.35 }}
                  >
                    {scope.what}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      color: '#a1a1a6',
                      marginTop: 3,
                      lineHeight: 1.45,
                      textWrap: 'pretty',
                    }}
                  >
                    {scope.why}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: '#c0c0c5',
              lineHeight: 1.5,
              marginTop: 18,
              borderTop: '.5px solid #f0eff1',
              paddingTop: 16,
              textWrap: 'pretty',
            }}
          >
            Antford never writes to your cells. Revoke access from the workbook
            at any time.
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              localStorage.setItem(ALLOWED, 'yes')
              setAllowed(true)
            }}
            style={{
              ...black,
              width: '100%',
              borderRadius: 10,
              padding: '12px 18px',
              fontSize: 14.5,
            }}
          >
            Allow access
          </button>
          <button
            onClick={() => panel.signOut()}
            style={{
              width: '100%',
              marginTop: 8,
              border: 0,
              background: 'transparent',
              color: ink.secondary,
              borderRadius: 10,
              padding: '10px 18px',
              font: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </Shell>
    )
  }

  if (
    panel.stage === 'loading' ||
    panel.stage === 'checking' ||
    panel.working
  ) {
    return (
      <Shell>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px 52px',
          }}
        >
          {/* The phase words describe a check run; a plain load keeps
              the ring and stays quiet rather than claiming one. */}
          <Ring phases={panel.stage === 'checking' || panel.working} />
          {panel.document?.filename && (
            <div
              style={{
                fontSize: 12.5,
                color: '#c7c7cc',
                marginTop: 8,
                textAlign: 'center',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {panel.document.filename}
            </div>
          )}
        </div>
      </Shell>
    )
  }

  if (panel.stage === 'failed') {
    return (
      <Shell>
        <div style={{ padding: '8px 24px 24px' }}>
          {/* The server's own sentence, as it stands. */}
          <div
            style={{
              fontSize: 14,
              color: ink.danger,
              lineHeight: 1.5,
              textWrap: 'pretty',
            }}
          >
            {panel.error}
          </div>
          <button
            onClick={() => void panel.signIn()}
            style={{
              marginTop: 14,
              border: 0,
              background: 'transparent',
              color: ink.accent,
              font: 'inherit',
              fontSize: 13.5,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Sign in again
          </button>
        </div>
      </Shell>
    )
  }

  if (panel.stage === 'no-workbook') {
    return (
      <Shell>
        <div
          style={{
            padding: '8px 24px',
            fontSize: 14,
            color: ink.secondary,
            lineHeight: 1.55,
            textWrap: 'pretty',
          }}
        >
          There is no workbook to check here. Open a model in Excel, and
          Antford reads this copy — exactly as it stands, unsaved edits
          included.
        </div>
      </Shell>
    )
  }

  //: Checked — the design's `isIn` face, over the open workbook's own
  //: check. Errors lead, smells follow. Each row is the design's: the
  //: cell reference in Excel's face (tap, and the sheet moves there),
  //: one plain sentence, the standard beneath.
  const result = panel.result
  const defects = result?.defects ?? []
  const ordered = [
    ...defects.filter((one) => one.severity === 'error'),
    ...defects.filter((one) => one.severity === 'smell'),
  ]
  const SHOWN = 40
  const shown = ordered.slice(0, SHOWN)

  const failLabel =
    defects.length === 0
      ? 'Nothing to fix'
      : `${defects.length} ${defects.length === 1 ? 'finding' : 'findings'}`
  const failingRules = new Set(defects.map((one) => one.rule))
  const passing =
    panel.rules === null
      ? null
      : panel.rules.filter((rule) => rule.on && !failingRules.has(rule.key))
          .length
  const passLabel = result
    ? `${passing === null ? '' : `${passing} checks pass · `}${timeWord(
        result.checked_at,
      )}`
    : ''

  const keyOf = (defect: PanelDefect) => `${defect.rule}:${defect.ref}`

  const jump = (defect: PanelDefect) => {
    setProblem(null)
    void panel.goTo(defect).then((moved) => {
      setProblem(moved.moved ? null : (moved.reason ?? 'could not go there'))
    })
  }

  return (
    <Shell>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 24px 24px',
        }}
      >
        {/* The verdict line. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 9,
            padding: '10px 0 0',
          }}
        >
          <span
            style={{ flex: '0 0 auto', fontSize: 15, letterSpacing: '-.01em' }}
          >
            {failLabel}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12.5,
              color: '#c0c0c5',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {passLabel}
          </span>
        </div>

        {result?.values_only && (
          <div
            style={{
              fontSize: 12.5,
              color: '#a1a1a6',
              marginTop: 8,
              lineHeight: 1.5,
              textWrap: 'pretty',
            }}
          >
            This copy carries values only — the construction checks could
            not read it; the statement checks did.
          </div>
        )}

        {/* The findings, one cell each. */}
        <div
          style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}
        >
          {shown.map((defect, index) => {
            const key = keyOf(defect)
            const isSel = sel === key
            const prevSel = index > 0 && sel === keyOf(shown[index - 1]!)
            return (
              <div
                key={key}
                style={{
                  borderTop:
                    index === 0 || isSel || prevSel ? 0 : '.5px solid #f0eff1',
                  borderRadius: 10,
                  boxShadow: isSel ? `0 0 0 1px ${ink.accent}` : 'none',
                  background: isSel ? '#fbfcfe' : 'transparent',
                  padding: `0 ${isSel ? 12 : 0}px`,
                  transition: 'background-color .2s ease, box-shadow .2s ease',
                }}
              >
                <button
                  onClick={() => {
                    setSel(key)
                    jump(defect)
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '82px 1fr',
                    alignItems: 'start',
                    gap: 14,
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    background: 'transparent',
                    font: 'inherit',
                    cursor: 'pointer',
                    padding: '15px 0',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span
                        style={{
                          flex: '0 0 4px',
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background:
                            defect.severity === 'error' ? '#ff3b30' : '#e8a33d',
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: excelFace,
                          fontSize: 14,
                          color: isSel ? ink.primary : ink.accent,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {addressOf(defect.ref)}
                      </span>
                    </span>
                    {defect.standard && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: '#c7c7cc',
                          letterSpacing: '.04em',
                          marginTop: 3,
                          paddingLeft: 10,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {defect.standard}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: 13.5,
                      lineHeight: 1.45,
                      color: ink.primary,
                      textWrap: 'pretty',
                    }}
                  >
                    {defect.plain || defect.detail}
                  </span>
                </button>
                {isSel && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0 0 15px 96px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        color: '#c7c7cc',
                      }}
                    >
                      Selected in the sheet
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {ordered.length > SHOWN && (
          <div
            style={{
              fontSize: 12.5,
              color: '#c7c7cc',
              borderTop: '.5px solid #f0eff1',
              paddingTop: 13,
              marginTop: 4,
              textWrap: 'pretty',
            }}
          >
            {ordered.length - SHOWN} more — the workspace lists every one.
          </div>
        )}

        {/* A jump that did not land, said out loud — undrawn, kept. */}
        {problem && (
          <div
            style={{ fontSize: 12, color: ink.danger, padding: '4px 0 8px' }}
            role="alert"
          >
            {problem}
          </div>
        )}

        {defects.length === 0 && result && (
          <div
            style={{
              fontSize: 12.5,
              color: ink.secondary,
              marginTop: 12,
              textWrap: 'pretty',
            }}
          >
            Every check that could read this workbook passes.
          </div>
        )}
      </div>

      {/* The footer. « Export report » arrives with the report itself. */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderTop: '.5px solid #eceaec',
          padding: '11px 18px',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            color: '#a1a1a6',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Against FAST and ICAEW
          {result?.filename ? ` · ${result.filename}` : ''}
        </span>
        <button
          onClick={() => void panel.recheck()}
          style={{
            flex: '0 0 auto',
            border: 0,
            background: 'transparent',
            font: 'inherit',
            fontSize: 13,
            color: ink.accent,
            cursor: 'pointer',
            padding: 2,
          }}
        >
          Recheck
        </button>
        <button
          onClick={panel.signOut}
          style={{
            flex: '0 0 auto',
            border: 0,
            background: 'transparent',
            font: 'inherit',
            fontSize: 13,
            color: '#a1a1a6',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          Sign out
        </button>
      </div>
    </Shell>
  )
}
