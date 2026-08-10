/**
 * The panel's shell — a placeholder, and deliberately an ugly one.
 *
 * **This file is the founder's to replace.** Everything under it is
 * plumbing: `usePanel` holds the state machine, `host/` hides the four
 * applications behind one interface, `api.ts` talks to the server. None of
 * that has an opinion about how any of this looks, and this file has no
 * opinion worth keeping.
 *
 * It exists so the plumbing can be run and seen working before there is a
 * design — sideload it into PowerPoint, click a finding, watch the slide
 * move. Every stage the real panel needs is here with the data already
 * wired to it, so replacing it is a matter of styling what is passed in
 * rather than working out what to ask for.
 *
 * The four states every screen needs are marked below. The fourth is the
 * one everybody forgets: 1,248 findings in a 320-pixel column.
 */

import { useEffect, useState } from 'react'

import { TieOutApi } from './api'
import type { DealListItem, Finding } from './api'
import { current } from './auth'
import { API_BASE, SIGN_IN_URL } from './config'
import type { HostBridge } from './host'
import { usePanel } from './usePanel'

const api = new TieOutApi({
  baseUrl: API_BASE,
  token: () => current()?.token ?? null,
})

export function Panel({ bridge }: { bridge: HostBridge }) {
  const panel = usePanel(bridge, api, SIGN_IN_URL)
  const [moved, setMoved] = useState<string | null>(null)

  // LOADING — extraction and identification both take a moment.
  if (panel.stage === 'loading') return <p>Working out where this is…</p>

  if (panel.stage === 'signed-out') {
    return (
      <div>
        {panel.error && <p role="alert">{panel.error}</p>}
        <button onClick={() => void panel.signIn()}>Sign in</button>
      </div>
    )
  }

  // ERROR — the server's own sentence, which is written to be shown.
  if (panel.stage === 'failed') return <p role="alert">{panel.error}</p>

  if (panel.stage === 'choose-deal') {
    return (
      <div>
        <p>Which deal does this document belong to?</p>
        {/* Asked once per document: the answer is written into the file. */}
        <DealList onChoose={(id) => void panel.chooseDeal(id)} />
      </div>
    )
  }

  return (
    <div>
      <header>
        <strong>{panel.identity?.dossier_name}</strong>
        <div>{panel.identity?.artifact?.filename}</div>
        {panel.coverage && (
          // The honesty mechanism, in the panel as on the deal page: what
          // was checked, and — the part that matters — what was not.
          <p>
            {panel.coverage.reconciled} reconciled · {panel.coverage.unlinked} not
            checked
          </p>
        )}
        <button onClick={() => void panel.recheck()} disabled={panel.working}>
          {panel.working ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {/* EMPTY — the *good* outcome, and it must not read as a failure. */}
      {panel.findings.length === 0 && <p>Checked, and everything ties out.</p>}

      {/* TOO MUCH — a real deck reaches hundreds. Whatever replaces this
          has to stay usable at the top of that range. */}
      <ul>
        {panel.findings.map((finding) => (
          <Row
            key={finding.id}
            finding={finding}
            onGoTo={async () => {
              const result = await panel.goTo(finding)
              // Never a silent failure: a panel that does not move looks
              // exactly like a panel that moved somewhere wrong.
              setMoved(result.moved ? null : (result.reason ?? 'could not go there'))
            }}
            onDismiss={() => void panel.dismiss(finding, 'dismissed')}
          />
        ))}
      </ul>

      {moved && <p role="alert">{moved}</p>}
    </div>
  )
}

function Row({
  finding,
  onGoTo,
  onDismiss,
}: {
  finding: Finding
  onGoTo: () => void
  onDismiss: () => void
}) {
  return (
    <li>
      <button onClick={onGoTo}>
        {finding.printed} → {finding.expected}
      </button>
      <div>{finding.where.detail}</div>
      {/* Shown, and ranked last by the server. Almost always a rounding
          convention, and still a difference worth seeing. */}
      {finding.one_tick && <em>rounding</em>}
      <button onClick={onDismiss}>Dismiss</button>
    </li>
  )
}

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

  if (deals === null) return <p>Loading…</p>
  if (deals.length === 0) return <p>You are not on any deals yet.</p>
  return (
    <ul>
      {deals.map((deal) => (
        <li key={deal.id}>
          <button onClick={() => onChoose(deal.id)}>
            {deal.name} — {deal.artifacts} files, {deal.open_findings} open
          </button>
        </li>
      ))}
    </ul>
  )
}
