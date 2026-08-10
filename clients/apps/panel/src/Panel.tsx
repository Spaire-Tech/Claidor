/**
 * The panel, inside Word, Excel, PowerPoint and Outlook.
 *
 * 320 pixels, one column, six stages. Everything it *does* is in
 * `usePanel`; this file is only what it looks like, and every piece of
 * that is composed from an idiom the workspace design already uses — see
 * `ui.tsx`, which records where each came from.
 *
 * **What the panel is for.** Not to be a second dashboard in a narrow
 * column. It is for the two things a banker cannot do from a browser: see
 * what is wrong with *the document already open in front of them*, and be
 * taken to it. So the whole screen is one list of that document's
 * findings, and pressing a row moves the cursor to the figure.
 *
 * **Two rules this screen keeps that a small screen makes tempting to
 * break.**
 *
 * Coverage stays on screen. « Four findings » in a task pane implies the
 * other hundred and twenty figures were checked and were fine, and the
 * engine cannot make that claim. The line under the heading says what was
 * reconciled *and* what was not, in the same words the deal page uses.
 *
 * A jump that does not land says so. A panel that silently fails to move
 * looks exactly like a panel that moved somewhere wrong, and the second is
 * the more expensive mistake — the banker looks at the wrong slide and
 * believes it.
 */

import { useEffect, useState } from 'react'

import type { DealListItem, Finding } from './api'
import { TieOutApi } from './api'
import { current } from './auth'
import { API_BASE, SIGN_IN_URL } from './config'
import { colour, size, space, surface } from './design'
import type { HostBridge } from './host'
import { Bar, Heading, Quiet, Row, Text, Truncation } from './ui'
import { usePanel } from './usePanel'

const api = new TieOutApi({
  baseUrl: API_BASE,
  token: () => current()?.token ?? null,
})

/**
 * How many findings are drawn before « show more ».
 *
 * Smaller than the workspace's 120 on purpose. This column shows about six
 * rows at a time, so a hundred and twenty is four hundred pixels of scroll
 * nobody asked for; twenty-five is a few flicks and then a decision.
 */
const WINDOW = 25

/** The design's three severities, from the server's two. As on the deal page. */
function severityOf(finding: Finding): { label: string; ink: string } {
  if (finding.one_tick) return { label: 'rounding', ink: colour.note }
  if (finding.severity === 'smell')
    return { label: 'warning', ink: colour.warning }
  return { label: 'critical', ink: colour.critical }
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      ...surface,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontSize: size.body,
      lineHeight: 1.5,
      overflow: 'hidden',
    }}
  >
    {children}
  </div>
)

export function Panel({ bridge }: { bridge: HostBridge }) {
  const panel = usePanel(bridge, api, SIGN_IN_URL)
  const [limit, setLimit] = useState(WINDOW)
  const [problem, setProblem] = useState<string | null>(null)
  //: Which row is carrying its actions. The design's Check row opens to
  //: show them, and it opens for the same reason this one does: two text
  //: actions under every row of six is twelve links on a 320-pixel column,
  //: and none of them is the thing you came here to press.
  const [open, setOpen] = useState<string | null>(null)

  // A new document, or a re-check, starts at the top of its own list.
  const [countedAt, setCountedAt] = useState(panel.findings.length)
  if (panel.findings.length !== countedAt) {
    setCountedAt(panel.findings.length)
    setLimit(WINDOW)
  }

  if (panel.stage === 'loading') {
    return (
      <Shell>
        <Quiet>Working out which document this is…</Quiet>
      </Shell>
    )
  }

  if (panel.stage === 'signed-out') {
    return (
      <Shell>
        <Heading title="Pierce" line="Reconciliation, where the document is." />
        {panel.error && <Quiet tone="critical">{panel.error}</Quiet>}
        <Quiet>
          Sign in once. This add-in then remembers which deal each file belongs
          to, inside the file itself.
        </Quiet>
        <div style={{ padding: `0 ${space.gutter}px` }}>
          <Text onClick={() => void panel.signIn()}>Sign in</Text>
        </div>
      </Shell>
    )
  }

  if (panel.stage === 'failed') {
    return (
      <Shell>
        <Heading title="Pierce" />
        {/* The server's own sentence. Every message it sends is written to
            be shown to a person as it stands. */}
        <Quiet tone="critical">{panel.error}</Quiet>
        <div style={{ padding: `0 ${space.gutter}px` }}>
          <Text onClick={() => void panel.signIn()}>Sign in again</Text>
        </div>
      </Shell>
    )
  }

  if (panel.stage === 'unsupported') {
    return (
      <Shell>
        <Heading title="Pierce" />
        <Quiet>
          There is no document open here. Open a deck, a model or a memo and
          this reads it.
        </Quiet>
      </Shell>
    )
  }

  if (panel.stage === 'choose-deal') {
    return (
      <Shell>
        <Heading
          title={panel.document?.filename ?? 'This document'}
          line="Which deal does this belong to?"
        />
        {/* Asked once per document, not once per session: the answer is
            written into the file, so the next person to open it — on
            another machine, under another name — goes straight to the
            findings. */}
        <DealList onChoose={(id) => void panel.chooseDeal(id)} />
      </Shell>
    )
  }

  const shown = panel.findings.slice(0, limit)
  const settle = (finding: Finding, state: 'accepted' | 'dismissed') => {
    setOpen(null)
    void panel.dismiss(finding, state)
  }

  return (
    <Shell>
      <Heading
        title={panel.identity?.dossier_name ?? 'This deal'}
        line={
          panel.identity?.artifact?.filename ?? panel.document?.filename ?? ''
        }
        action={
          panel.identity?.matched_by === 'filename' ? (
            // It matched on the name, which is a guess, so it offers to be
            // corrected. A stamp is definitive and says nothing.
            <Text tone="quiet" onClick={panel.rechoose} title="Not this deal?">
              not this?
            </Text>
          ) : undefined
        }
      />

      {panel.coverage && (
        <div
          style={{
            flex: '0 0 auto',
            padding: `9px ${space.gutter}px`,
            fontSize: size.small,
            color: colour.faint,
            borderBottom: `1px solid ${colour.rule}`,
          }}
        >
          {panel.coverage.reconciled} reconciled · {panel.coverage.unlinked} not
          checked
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {/* EMPTY — the *good* outcome, and it must not read as a failure. */}
        {panel.findings.length === 0 && (
          <Quiet>Checked, and every figure here ties back to the model.</Quiet>
        )}

        {shown.map((finding) => {
          const level = severityOf(finding)
          return (
            <Row
              key={finding.id}
              title={
                <>
                  {finding.printed}
                  <span style={{ color: colour.fainter }}>
                    {' '}
                    where the model says{' '}
                  </span>
                  {finding.expected}
                </>
              }
              where={finding.where.detail}
              mark={level.label}
              markInk={level.ink}
              onClick={() => {
                // Pressing a row does the thing the panel is for — move
                // the document to the figure — and opens its actions on
                // the way past. Both, because a banker who has just been
                // taken to the wrong slide is exactly the person who wants
                // « Dismiss » to hand.
                setProblem(null)
                setOpen(finding.id)
                void panel.goTo(finding).then((result) => {
                  setProblem(
                    result.moved
                      ? null
                      : (result.reason ?? 'could not go there'),
                  )
                })
              }}
            >
              {open === finding.id && (
                <>
                  <Text
                    tone="quiet"
                    onClick={() => settle(finding, 'dismissed')}
                  >
                    Dismiss
                  </Text>
                  {/* This writes. The figure in the document open in front
                      of the banker becomes the model's, and the deal
                      records that it happened here rather than to its own
                      copy — because the copy on this machine is the one
                      that gets sent. */}
                  <Text
                    tone="quiet"
                    onClick={() => {
                      setOpen(null)
                      setProblem(null)
                      void panel.accept(finding).then((result) => {
                        setProblem(
                          result.written ? null : (result.reason ?? null),
                        )
                      })
                    }}
                  >
                    Accept {finding.expected}
                  </Text>
                </>
              )}
              {/* What became of it, once something has. The row stays put
                  rather than disappearing: a figure that changed under
                  somebody's hands is worth seeing change. */}
              {finding.correction?.state === 'applied' && (
                <span style={{ color: colour.matching }}>
                  now {finding.correction.after} in this document
                </span>
              )}
            </Row>
          )
        })}

        <Truncation
          shown={shown.length}
          total={panel.findings.length}
          onMore={() => setLimit((was) => was + WINDOW)}
        />
      </div>

      {/* A jump that did not land, said out loud. */}
      {problem && (
        <div
          style={{
            flex: '0 0 auto',
            padding: `8px ${space.gutter}px`,
            fontSize: size.tiny,
            color: colour.critical,
            borderTop: `1px solid ${colour.rule}`,
          }}
          role="alert"
        >
          {problem}
        </div>
      )}

      <Bar>
        <Text onClick={() => void panel.recheck()} disabled={panel.working}>
          {panel.working ? 'Checking…' : 'Re-check'}
        </Text>
        <div style={{ flex: 1 }} />
        <Text tone="quiet" onClick={panel.signOut}>
          Sign out
        </Text>
      </Bar>
    </Shell>
  )
}

/**
 * The deals this person is on.
 *
 * Each carries its file count and its open findings, because « Project
 * Cascade » and « Project Cascade (old) » are told apart by what is in
 * them and by nothing else.
 */
function DealList({ onChoose }: { onChoose: (id: string) => void }) {
  const [deals, setDeals] = useState<DealListItem[] | null>(null)

  useEffect(() => {
    let live = true
    api
      .deals()
      .then((found) => live && setDeals(found))
      .catch(() => live && setDeals([]))
    return () => {
      live = false
    }
  }, [])

  if (deals === null) return <Quiet>Loading…</Quiet>
  if (deals.length === 0) return <Quiet>You are not on any deals yet.</Quiet>

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {deals.map((deal) => (
        <Row
          key={deal.id}
          title={deal.name}
          where={`${deal.artifacts} ${deal.artifacts === 1 ? 'file' : 'files'} · ${
            deal.open_findings
          } open`}
          mark=""
          markInk={colour.faint}
          onClick={() => onChoose(deal.id)}
        />
      ))}
    </div>
  )
}
