/**
 * The Check panel.
 *
 * Vesence's own panel is four buckets — Critical, Warning, To review,
 * Ignored — with a count on each, and a finding can be dismissed into
 * Ignored. This is that, and the choices it makes are about honesty:
 *
 * - A finding says whether it is *certain* or *probable*. Four of the five
 *   checks are arithmetic on the text; one, « undefined term », is a
 *   judgement about capitalisation and cannot be exact. Marking it is what
 *   makes the other four worth trusting.
 * - Only a wrong case gets a *Fix* button. Everything else needs a
 *   drafting decision, and a button that guesses at one is the worst thing
 *   this add-in could do.
 * - When Word cannot be taken to a finding, the panel says so instead of
 *   leaving the selection where it was and looking like it worked.
 */

import { useCallback, useEffect, useState } from 'react'

import * as api from './api'
import { detect, limitation } from './capabilities'
import {
  SEVERITY_LABEL,
  bySeverity,
  defectLabel,
  fixFor,
  type Finding,
  type Review,
} from './locate'
import * as word from './word'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; review: Review }
  | { kind: 'error'; message: string; signIn: boolean }

export function Panel() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const [signedIn, setSignedIn] = useState(false)
  const capabilities = detect()
  const limit = limitation(capabilities)

  useEffect(() => {
    setSignedIn(api.token() !== null)
  }, [])

  const run = useCallback(async () => {
    setStatus({ kind: 'checking' })
    try {
      const text = await word.documentText()
      const review = await api.check(text)
      setStatus({ kind: 'done', review })
      setIgnored(new Set())
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'The check did not finish.',
        signIn: error instanceof api.NotSignedIn,
      })
    }
  }, [])

  const authenticate = useCallback(async () => {
    try {
      await api.saveToken(await api.signIn())
      setSignedIn(true)
      setStatus({ kind: 'idle' })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Sign-in failed.',
        signIn: true,
      })
    }
  }, [])

  if (!signedIn) {
    return (
      <div className="panel">
        <p className="notice">Sign in to check this document.</p>
        <button className="primary" onClick={authenticate}>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div className="panel">
      {limit && <p className="notice error">{limit}</p>}

      <div className="row">
        <button
          className="primary"
          onClick={run}
          disabled={status.kind === 'checking' || !capabilities.ranges}
        >
          {status.kind === 'checking' ? 'Checking…' : 'Check document'}
        </button>
        <span className="grow" />
      </div>

      {status.kind === 'error' && (
        <>
          <p className="notice error">{status.message}</p>
          {status.signIn && <button onClick={authenticate}>Sign in again</button>}
        </>
      )}

      {status.kind === 'done' && (
        <Results
          review={status.review}
          ignored={ignored}
          onIgnore={(key) => setIgnored(new Set(ignored).add(key))}
          canApply={capabilities.trackedChanges}
        />
      )}
    </div>
  )
}

function keyOf(finding: Finding): string {
  return `${finding.defect}:${finding.start}:${finding.end}`
}

function Results({
  review,
  ignored,
  onIgnore,
  canApply,
}: {
  review: Review
  ignored: Set<string>
  onIgnore: (key: string) => void
  canApply: boolean
}) {
  if (review.findings.length === 0) {
    return (
      <p className="notice">
        No defined-term defects in {review.characters.toLocaleString()}{' '}
        characters.
      </p>
    )
  }

  const live = review.findings.filter((f) => !ignored.has(keyOf(f)))

  return (
    <>
      <div className="tally">
        {(['critical', 'warning', 'to_review'] as const).map((severity) => (
          <span key={severity} className={severity}>
            {SEVERITY_LABEL[severity]}{' '}
            <b>{live.filter((f) => f.severity === severity).length}</b>
          </span>
        ))}
        <span>
          Ignored <b>{ignored.size}</b>
        </span>
      </div>

      {bySeverity(live).map(({ severity, findings }) =>
        findings.length === 0 ? null : (
          <section key={severity} className="bucket">
            <h2>
              {SEVERITY_LABEL[severity]} ({findings.length})
            </h2>
            {findings.map((finding) => (
              <FindingRow
                key={keyOf(finding)}
                finding={finding}
                canApply={canApply}
                onIgnore={() => onIgnore(keyOf(finding))}
              />
            ))}
          </section>
        ),
      )}
    </>
  )
}

function FindingRow({
  finding,
  canApply,
  onIgnore,
}: {
  finding: Finding
  canApply: boolean
  onIgnore: () => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const fix = fixFor(finding)

  const goTo = async () => {
    const found = await word.reveal(finding)
    setMessage(
      found ? null : 'Could not find this in the document — it may have changed.',
    )
  }

  const apply = async () => {
    if (!fix) return
    const outcome = await word.applyFix(finding, fix)
    if (outcome.applied) {
      setApplied(true)
      setMessage(null)
      return
    }
    setMessage(
      {
        'not-fixable': 'This one has no mechanical fix.',
        'not-found': 'Could not find this in the document — it may have changed.',
        'tracking-refused':
          'Word would not turn on tracked changes, so nothing was edited.',
      }[outcome.reason],
    )
  }

  return (
    <div className="finding">
      <div className="head">
        <span className="defect">{defectLabel(finding.defect)}</span>
        <span className="term">{finding.term}</span>
      </div>
      <p className="note">{finding.note}</p>
      {finding.certainty === 'probable' && (
        <span className="flag">Probable — worth a look rather than certain.</span>
      )}
      {finding.certainty === 'suggested' && (
        <span className="flag">
          Read by a model. The quoted words were checked against the document
          and any arithmetic recomputed; the reading of them is yours.
        </span>
      )}
      <p className="context">…{finding.context}…</p>
      <div className="actions">
        <button onClick={goTo}>Go to</button>
        {fix && (
          <button onClick={apply} disabled={!canApply || applied}>
            {applied ? 'Applied' : `Fix as tracked change`}
          </button>
        )}
        <button onClick={onIgnore}>Ignore</button>
      </div>
      {message && <p className="context">{message}</p>}
    </div>
  )
}
