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
  type Term,
  type Terms,
} from './locate'
import * as word from './word'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; review: Review }
  | { kind: 'error'; message: string; signIn: boolean }

type Tab = 'check' | 'terms'

export function Panel() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const [signedIn, setSignedIn] = useState(false)
  const [tab, setTab] = useState<Tab>('check')
  const [terms, setTerms] = useState<Terms | null>(null)
  // The judgement pass reads the whole document a window at a time, so it
  // runs after the panel has already shown what it knows.
  const [judging, setJudging] = useState(false)
  const capabilities = detect()
  const limit = limitation(capabilities)

  useEffect(() => {
    setSignedIn(api.token() !== null)
  }, [])

  const run = useCallback(async () => {
    setStatus({ kind: 'checking' })
    setTerms(null)
    try {
      const text = await word.documentText()
      const review = await api.check(text)
      setStatus({ kind: 'done', review })
      setIgnored(new Set())
      // Fire and forget: a failure here must not lose the findings the
      // reader already has.
      api.terms(text).then(setTerms, () => setTerms(null))
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'The check did not finish.',
        signIn: error instanceof api.NotSignedIn,
      })
    }
  }, [])

  const deepen = useCallback(async () => {
    if (status.kind !== 'done') return
    setJudging(true)
    try {
      const text = await word.documentText()
      const judged = await api.judge(text)
      setStatus({
        kind: 'done',
        review: {
          ...status.review,
          findings: [...status.review.findings, ...judged.findings].sort(
            (a, b) => a.start - b.start,
          ),
          critical_count: status.review.critical_count + judged.critical_count,
          warning_count: status.review.warning_count + judged.warning_count,
          to_review_count:
            status.review.to_review_count + judged.to_review_count,
        },
      })
    } catch {
      // Leave the mechanical findings alone; they are still true.
    } finally {
      setJudging(false)
    }
  }, [status])

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
        {status.kind === 'done' && (
          <button onClick={deepen} disabled={judging}>
            {judging ? 'Reading…' : 'Read for contradictions'}
          </button>
        )}
        <span className="grow" />
      </div>

      {status.kind === 'done' && (
        <div className="tabs">
          <button
            className={tab === 'check' ? 'tab on' : 'tab'}
            onClick={() => setTab('check')}
          >
            Findings ({status.review.findings.length})
          </button>
          <button
            className={tab === 'terms' ? 'tab on' : 'tab'}
            onClick={() => setTab('terms')}
            disabled={!terms}
          >
            Terms ({terms ? terms.terms.length : '…'})
          </button>
        </div>
      )}

      {status.kind === 'error' && (
        <>
          <p className="notice error">{status.message}</p>
          {status.signIn && <button onClick={authenticate}>Sign in again</button>}
        </>
      )}

      {status.kind === 'done' && tab === 'check' && (
        <Results
          review={status.review}
          ignored={ignored}
          onIgnore={(key) => setIgnored(new Set(ignored).add(key))}
          canApply={capabilities.trackedChanges}
        />
      )}

      {status.kind === 'done' && tab === 'terms' && terms && (
        <TermList terms={terms} />
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


/**
 * Every defined term, with its meaning and where it bites.
 *
 * Nothing here is a defect. It is the map a lawyer wants on opening a long
 * agreement somebody else drafted, and it is the half of Vesence's
 * « hover any term » feature that does not need a hover to be useful.
 */
function TermList({ terms }: { terms: Terms }) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? terms.terms.filter((t) => t.term.toLowerCase().includes(needle))
    : terms.terms

  return (
    <>
      <input
        className="filter"
        placeholder="Filter terms"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <p className="notice">
        {terms.terms.length} defined, {terms.unused_count} never used.
      </p>
      {shown.map((term) => (
        <TermRow key={`${term.term}:${term.start}`} term={term} />
      ))}
      {shown.length === 0 && <p className="notice">No term matches that.</p>}
    </>
  )
}

function TermRow({ term }: { term: Term }) {
  const [message, setMessage] = useState<string | null>(null)

  const goTo = async (offset: number, literal: string, occurrence: number) => {
    const found = await word.reveal({
      defect: 'definition',
      severity: 'to_review',
      certainty: 'certain',
      term: term.term,
      note: '',
      context: '',
      start: offset,
      end: offset + literal.length,
      literal,
      occurrence,
    })
    setMessage(found ? null : 'Could not find this in the document.')
  }

  return (
    <div className="finding">
      <div className="head">
        <span className="term">{term.term}</span>
        <span className="defect">
          {term.use_count === 0 ? 'never used' : `${term.use_count} uses`}
        </span>
      </div>
      <p className="note">{term.meaning}</p>
      {term.linked.length > 0 && (
        <p className="context">Rests on: {term.linked.join(', ')}</p>
      )}
      <div className="actions">
        <button
          onClick={() =>
            goTo(term.start, term.term, definitionOccurrence(term))
          }
        >
          Definition
        </button>
        {term.uses.length > 0 && (
          <button onClick={() => goTo(term.uses[0]!, term.term, 1)}>
            First use
          </button>
        )}
      </div>
      {message && <p className="context">{message}</p>}
    </div>
  )
}

/**
 * Which occurrence of the term its own definition is.
 *
 * The definition is the first place the term appears *unless* the document
 * uses it earlier — a recital naming the Shares before clause 1 defines
 * them. Counting the uses that precede it is how the jump lands on the
 * definition rather than on a recital.
 */
function definitionOccurrence(term: Term): number {
  return term.uses.filter((offset) => offset < term.start).length + 1
}
