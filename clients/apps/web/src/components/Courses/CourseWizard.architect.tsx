'use client'

// Masterclass Architect — the "start with what you've already made" opening
// of the course wizard. Three steps in the exact SpaireOnboarding visual
// language (so-* vocabulary from CourseWizard.steps.tsx: Poppins, monochrome
// ink on white, floating-label fields, pill CTAs, soScreenIn motion, the
// media-card selection idiom). Nothing here introduces a new color, radius,
// or type scale — the Architect must be indistinguishable in craft from the
// steps around it.
//
//   source    — paste a channel; quiet "I already know what I'm making" fork
//   mirror    — instant confirmation header, then the fast-pass evidence
//               rows as they land, plus the optional "what do people keep
//               asking you?" field (answered while the deep pass runs)
//   proposals — the masterclasses, streaming in as cards with receipts and
//               the footage map; flagship rendering when there's exactly one
//
// Every failure reason lands warmly: the fork is the catch-all, never an
// error screen.

import { useEffect, useMemo, useState } from 'react'

// A waiting screen must never be able to wait forever: after `ms` of
// continuous `active`, this flips true so the step can surface the fork.
// Recovery is state-driven — if the awaited data lands later, the render
// conditions that check it first simply win again.
function useStalled(active: boolean, ms: number): boolean {
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    // Both arms set state asynchronously (timer callbacks), never in the
    // effect body itself — the reset just uses a zero-delay timer.
    const t = window.setTimeout(() => setStalled(active), active ? ms : 0)
    return () => window.clearTimeout(t)
  }, [active, ms])
  return stalled
}

import {
  footageCounts,
  type ArchitectAnalysis,
  type ArchitectFailureReason,
  type ArchitectHighlight,
  type ArchitectProposal,
} from '@/hooks/queries/masterclassArchitect'
import { StepShell } from './CourseWizard.steps'

// ─── Warm copy for every typed failure (the fork's landing lines) ────────────

const FAILURE_COPY: Record<ArchitectFailureReason, string> = {
  not_youtube:
    "That link doesn't look like a YouTube channel. Paste your channel URL or @handle — or build it with us directly.",
  channel_not_found:
    "We couldn't find a channel at that link. Double-check the @handle — or build it with us directly.",
  channel_too_small:
    "Your channel doesn't have enough published videos yet for a confident read — no bad thing, it just means we'll build this together instead.",
  quota_exhausted:
    "We're reading a lot of channels right now. Yours will work in a little while — or build it with us directly and don't wait.",
  upstream_unavailable:
    "YouTube isn't answering us at the moment. Try again shortly — or build it with us directly.",
  ai_unavailable:
    'The Architect had trouble thinking just now. Try again shortly — or build it with us directly.',
  ai_output_invalid:
    'The Architect had trouble thinking just now. Try again shortly — or build it with us directly.',
}

export const architectFailureCopy = (
  reason: ArchitectFailureReason | null | undefined,
): string =>
  (reason && FAILURE_COPY[reason]) ||
  "We couldn't get a good read on that — let's build it together instead."

// ─── Scoped styles (so-* additions; same variables, same restraint) ──────────

export function ArchitectStyles() {
  return (
    <style jsx global>{`
      /* Quiet fork — a sentence, not a button. */
      .arch-fork {
        display: block;
        margin: 22px auto 0;
        background: none;
        border: none;
        cursor: pointer;
        font-family: var(--font-poppins), system-ui, sans-serif;
        font-size: 13px;
        font-weight: 400;
        color: var(--so-gray3);
        transition: color 0.15s;
      }
      .arch-fork:hover {
        color: var(--so-black);
      }

      /* Instant confirmation header */
      .arch-confirm {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        background: var(--so-gray1);
        border: 1.5px solid var(--so-gray2);
        border-radius: 12px;
        margin-bottom: 14px;
        animation: soScreenIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .arch-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--so-gray2);
        object-fit: cover;
        flex-shrink: 0;
      }
      .arch-confirm-name {
        font-size: 15px;
        font-weight: 600;
        color: var(--so-black);
        letter-spacing: -0.01em;
      }
      .arch-confirm-meta {
        font-size: 12px;
        color: var(--so-gray3);
        margin-top: 2px;
      }

      /* Evidence rows — the mirror */
      .arch-stats {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 24px;
      }
      .arch-stat {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 14px 18px;
        background: #ffffff;
        border: 1.5px solid var(--so-gray2);
        border-radius: 12px;
        animation: soScreenIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .arch-ratio {
        font-family: var(--font-poppins), system-ui, sans-serif;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: var(--so-black);
        line-height: 1.2;
        flex-shrink: 0;
        min-width: 62px;
      }
      .arch-stat-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--so-black);
        line-height: 1.35;
      }
      .arch-stat-sub {
        font-size: 12px;
        color: var(--so-gray3);
        margin-top: 3px;
      }
      .arch-quote {
        margin-top: 8px;
        padding-left: 10px;
        border-left: 2px solid var(--so-gray2);
        font-size: 12px;
        line-height: 1.5;
        color: var(--so-gray4);
        font-style: italic;
      }

      /* Loading shimmer — same gray family, no spinners anywhere. */
      .arch-shimmer {
        border: 1.5px solid var(--so-gray2);
        border-radius: 12px;
        height: 64px;
        background: linear-gradient(
          100deg,
          var(--so-gray1) 40%,
          #f7f7f7 50%,
          var(--so-gray1) 60%
        );
        background-size: 200% 100%;
        animation: archShimmer 1.6s ease-in-out infinite;
      }
      @keyframes archShimmer {
        from {
          background-position: 200% 0;
        }
        to {
          background-position: -200% 0;
        }
      }
      .arch-reading-line {
        font-size: 12px;
        color: var(--so-gray3);
        margin: 4px 0 24px;
        text-align: center;
      }

      /* Proposal cards — the media-card idiom, grown up. */
      .arch-cards {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 8px;
      }
      .arch-card {
        display: block;
        width: 100%;
        text-align: left;
        padding: 20px 22px;
        background: var(--so-gray1);
        border: 1.5px solid var(--so-gray2);
        border-radius: 12px;
        cursor: pointer;
        font-family: var(--font-poppins), system-ui, sans-serif;
        color: var(--so-black);
        -webkit-appearance: none;
        appearance: none;
        transition:
          border-color 0.2s,
          background 0.2s,
          box-shadow 0.2s;
        animation: soScreenIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .arch-card:hover {
        border-color: #c8c8c8;
        background: #f0f0f0;
      }
      .arch-card.selected {
        border-color: var(--so-black);
        background: var(--so-white);
        box-shadow: 0 0 0 3px rgba(10, 10, 10, 0.07);
      }
      .arch-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .arch-card-title {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.015em;
        line-height: 1.25;
      }
      .arch-card-check {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1.5px solid var(--so-gray2);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
        transition:
          border-color 0.2s,
          background 0.2s;
        color: var(--so-white);
      }
      .arch-card.selected .arch-card-check {
        border-color: var(--so-black);
        background: var(--so-black);
      }
      .arch-card-check svg {
        display: none;
      }
      .arch-card.selected .arch-card-check svg {
        display: block;
      }
      .arch-card-promise {
        font-size: 13px;
        color: var(--so-gray4);
        line-height: 1.5;
        margin-top: 6px;
      }
      .arch-card-counts {
        font-size: 12px;
        color: var(--so-gray3);
        margin-top: 12px;
      }
      .arch-card-counts strong {
        color: var(--so-black);
        font-weight: 600;
      }
      .arch-receipts {
        margin-top: 12px;
      }
      .arch-receipts summary {
        list-style: none;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: var(--so-gray3);
        transition: color 0.15s;
        -webkit-user-select: none;
        user-select: none;
      }
      .arch-receipts summary::-webkit-details-marker {
        display: none;
      }
      .arch-receipts summary:hover {
        color: var(--so-black);
      }
      .arch-receipts[open] summary {
        color: var(--so-black);
        margin-bottom: 8px;
      }
      .arch-receipt-line {
        font-size: 12px;
        color: var(--so-gray4);
        line-height: 1.55;
        padding-left: 10px;
        border-left: 2px solid var(--so-gray2);
        margin-top: 6px;
      }
      .arch-receipt-line em {
        font-style: italic;
      }

      /* Flagship — one undeniable proposal, presented with confidence,
         never as a lonely card in an empty grid. */
      .arch-flagship-eyebrow {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--so-gray3);
        margin-bottom: 10px;
      }

      /* Warm fallback panel (the fork's landing) */
      .arch-fallback {
        padding: 18px 20px;
        background: var(--so-gray1);
        border: 1.5px solid var(--so-gray2);
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--so-gray4);
        margin-bottom: 24px;
        animation: soScreenIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
    `}</style>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function ForkLink({
  onFork,
  label = 'I already know what I’m making →',
}: {
  onFork: () => void
  label?: string
}) {
  return (
    <button type="button" className="arch-fork" onClick={onFork}>
      {label}
    </button>
  )
}

const CheckSvg = (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const formatCount = (n: number | undefined): string =>
  typeof n === 'number' ? n.toLocaleString('en-US') : ''

function channelMeta(analysis: ArchitectAnalysis | null | undefined): string {
  const ch = analysis?.channel
  if (!ch) return ''
  const parts: string[] = []
  if (ch.video_count) parts.push(`${formatCount(ch.video_count)} videos`)
  if (ch.created_at) parts.push(`since ${ch.created_at.slice(0, 4)}`)
  if (ch.subscriber_count)
    parts.push(`${formatCount(ch.subscriber_count)} subscribers`)
  return parts.join(' · ')
}

// ─── Step: source ────────────────────────────────────────────────────────────

export function StepArchitectSource({
  onSubmit,
  submitting,
  failureReason,
  onFork,
  onBack,
  onClose,
}: {
  onSubmit: (ref: string) => void
  submitting: boolean
  // Set when a previous submit resolved to a failed analysis (bad link,
  // tiny channel, …) — rendered as a warm line, never an error state.
  failureReason: ArchitectFailureReason | null
  onFork: () => void
  onBack: () => void
  onClose: () => void
}) {
  const [ref, setRef] = useState('')
  return (
    <StepShell
      step={1}
      total={4}
      title="Start with what you’ve already made"
      onNext={() => ref.trim() && onSubmit(ref.trim())}
      onBack={onBack}
      onClose={onClose}
      nextLabel={submitting ? 'Reading…' : 'Continue'}
      nextDisabled={!ref.trim() || submitting}
    >
      <div className="so-fields">
        <label className="so-field">
          <input
            className="so-input"
            type="text"
            placeholder=" "
            autoFocus
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ref.trim() && !submitting)
                onSubmit(ref.trim())
            }}
          />
          <span className="so-label">Your YouTube channel or @handle</span>
        </label>
        {failureReason ? (
          <div className="arch-fallback" style={{ marginBottom: 0 }}>
            {architectFailureCopy(failureReason)}
          </div>
        ) : (
          <span className="so-hint">
            Paste a link to your channel. We’ll read what you’ve already
            published — what overperformed, what your audience keeps asking for
            — and come back with the masterclass hiding in it.
          </span>
        )}
      </div>
      <ForkLink onFork={onFork} />
    </StepShell>
  )
}

// ─── Step: mirror ────────────────────────────────────────────────────────────

function HighlightRow({
  highlight,
  index,
  showQuote,
}: {
  highlight: ArchitectHighlight
  index: number
  showQuote: boolean
}) {
  const quote = showQuote ? highlight.top_quotes?.[0] : undefined
  return (
    <div className="arch-stat" style={{ animationDelay: `${index * 120}ms` }}>
      <div className="arch-ratio">
        {highlight.outlier_ratio.toFixed(1).replace(/\.0$/, '')}×
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="arch-stat-title">{highlight.title}</div>
        <div className="arch-stat-sub">
          {formatCount(highlight.views)} views — your typical was{' '}
          {formatCount(highlight.baseline_views)} at the time
          {highlight.demand_comment_count > 0 &&
            ` · ${highlight.demand_comment_count} comments asking for more`}
        </div>
        {quote && (
          <div className="arch-quote">
            “{quote.text}”{quote.likes > 0 && ` — ${quote.likes} likes`}
          </div>
        )}
      </div>
    </div>
  )
}

export function StepArchitectMirror({
  analysis,
  faq,
  onFaqChange,
  onNext,
  onBack,
  onClose,
  onFork,
}: {
  analysis: ArchitectAnalysis | null
  faq: string
  onFaqChange: (value: string) => void
  onNext: () => void
  onBack: () => void
  onClose: () => void
  onFork: () => void
}) {
  const failed = analysis?.status === 'failed'
  const highlights = analysis?.mirror?.highlights ?? []
  const mirrorLanded = highlights.length > 0
  // The fast pass should land in ~20s; if nothing has arrived after 75s the
  // engine is stuck (worker down, quota) — stop shimmering and offer the
  // fork. If the mirror lands later anyway, mirrorLanded wins again.
  const stalled = useStalled(!failed && !mirrorLanded, 75_000)
  const showFallback = failed || (stalled && !mirrorLanded)

  return (
    <StepShell
      step={1}
      total={4}
      title="Here’s what your audience has been telling you"
      onNext={showFallback ? onFork : onNext}
      onBack={onBack}
      onClose={onClose}
      nextLabel={showFallback ? 'Build it with me instead' : 'Continue'}
    >
      <div className="arch-confirm">
        {analysis?.channel?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="arch-avatar"
            src={analysis.channel.avatar_url}
            alt=""
            aria-hidden
          />
        ) : (
          <div className="arch-avatar" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="arch-confirm-name">
            {analysis?.channel?.title ?? '—'}
          </div>
          <div className="arch-confirm-meta">{channelMeta(analysis)}</div>
        </div>
      </div>

      {showFallback ? (
        <div className="arch-fallback">
          {failed
            ? architectFailureCopy(analysis?.failure_reason)
            : 'The read is taking longer than it should. You can keep waiting — or build it with us directly and not lose a minute.'}
        </div>
      ) : (
        <div className="arch-stats">
          {mirrorLanded ? (
            highlights
              .slice(0, 3)
              .map((h, i) => (
                <HighlightRow
                  key={h.video_id}
                  highlight={h}
                  index={i}
                  showQuote={i === 0}
                />
              ))
          ) : (
            <>
              <div className="arch-shimmer" />
              <div className="arch-shimmer" style={{ opacity: 0.7 }} />
              <div className="arch-shimmer" style={{ opacity: 0.45 }} />
            </>
          )}
          {!mirrorLanded && (
            <div className="arch-reading-line">
              Reading{' '}
              {analysis?.channel?.video_count
                ? `${formatCount(analysis.channel.video_count)} videos`
                : 'your catalogue'}
              … measured against your own numbers, nobody else’s.
            </div>
          )}
        </div>
      )}

      {!showFallback && (
        <div className="so-fields" style={{ marginBottom: 8 }}>
          <div>
            <span
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--so-gray4)',
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              While we read — anything people keep asking you about? (optional)
            </span>
            <label className="so-field">
              <textarea
                className="so-textarea"
                rows={3}
                placeholder=""
                style={{ padding: '14px 16px', resize: 'vertical' }}
                value={faq}
                onChange={(e) => onFaqChange(e.target.value)}
              />
            </label>
            <span
              className="so-hint"
              style={{ display: 'block', marginTop: 6 }}
            >
              A question you get again and again usually points straight at the
              masterclass worth making.
            </span>
          </div>
        </div>
      )}
    </StepShell>
  )
}

// ─── Step: proposals ─────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  index,
  selected,
  flagship,
  onSelect,
}: {
  proposal: ArchitectProposal
  index: number
  selected: boolean
  flagship: boolean
  onSelect: () => void
}) {
  const counts = footageCounts(proposal)
  const countBits: string[] = []
  if (counts.refilm > 0)
    countBits.push(`${counts.refilm} worth re-filming with today’s quality`)
  countBits.push(`${counts.film} left to film`)
  const receiptVideos = proposal.receipts?.videos ?? []
  const receiptQuotes = proposal.receipts?.quotes ?? []
  return (
    <button
      type="button"
      className={`arch-card${selected ? 'selected' : ''}`}
      onClick={onSelect}
      style={{ animationDelay: `${index * 140}ms` }}
    >
      <div className="arch-card-head">
        <div className="arch-card-title">{proposal.title}</div>
        <span className="arch-card-check">{CheckSvg}</span>
      </div>
      <div className="arch-card-promise">{proposal.promise}</div>
      <div className="arch-card-counts">
        <strong>
          {counts.have} of {counts.total}
        </strong>{' '}
        episodes already have source material · {countBits.join(' · ')}
      </div>
      {(receiptVideos.length > 0 || receiptQuotes.length > 0) && (
        <details
          className="arch-receipts"
          open={flagship}
          onClick={(e) => e.stopPropagation()}
        >
          <summary>Why this one — the receipts</summary>
          {receiptVideos.slice(0, 3).map((v) => (
            <div key={v.video_id} className="arch-receipt-line">
              {v.title}
              {v.outlier_ratio ? ` — ${v.outlier_ratio}× your typical` : ''}
              {v.why_it_matters ? `. ${v.why_it_matters}` : ''}
            </div>
          ))}
          {receiptQuotes.slice(0, 2).map((q, i) => (
            <div key={i} className="arch-receipt-line">
              <em>“{q.text}”</em>
              {q.likes > 0 && ` — ${q.likes} likes`}
            </div>
          ))}
        </details>
      )}
    </button>
  )
}

export function StepArchitectProposals({
  analysis,
  selectedIndex,
  onSelect,
  onContinue,
  onBack,
  onClose,
  onFork,
}: {
  analysis: ArchitectAnalysis | null
  selectedIndex: number | null
  onSelect: (index: number) => void
  onContinue: () => void
  onBack: () => void
  onClose: () => void
  onFork: () => void
}) {
  const status = analysis?.status
  const result = analysis?.proposals
  const proposals = useMemo(() => result?.proposals ?? [], [result])
  const flagship = Boolean(result?.flagship) && proposals.length === 1
  const failed = status === 'failed'
  const emptyCompleted = status === 'completed' && proposals.length === 0
  const stillReading = !failed && status !== 'completed'

  // Auto-select the flagship: one undeniable proposal shouldn't demand a
  // click to feel chosen.
  useEffect(() => {
    if (flagship && selectedIndex === null) onSelect(0)
  }, [flagship, selectedIndex, onSelect])

  // The deep pass targets a few minutes; past 10 the engine is stuck —
  // stop shimmering and surface the fork instead of an endless wait.
  const stalled = useStalled(stillReading, 10 * 60_000)
  const deadEnd = failed || emptyCompleted || (stalled && stillReading)
  const title = deadEnd
    ? 'Let’s build it together'
    : flagship
      ? 'We found your masterclass'
      : stillReading
        ? 'Finding the masterclass in your catalogue'
        : 'Three masterclasses are hiding in your channel'

  return (
    <StepShell
      step={3}
      total={4}
      title={title}
      onNext={deadEnd ? onFork : onContinue}
      onBack={onBack}
      onClose={onClose}
      nextLabel={deadEnd ? 'Build it with me instead' : 'Continue'}
      nextDisabled={!deadEnd && (stillReading || selectedIndex === null)}
    >
      {deadEnd ? (
        <div className="arch-fallback">
          {failed
            ? architectFailureCopy(analysis?.failure_reason)
            : stalled && stillReading
              ? 'The deep read is taking longer than it should. You can keep waiting — or build it with us directly and not lose a minute.'
              : result?.no_proposal_reason ||
                'Your catalogue reads as genuinely varied — too varied for us to call one masterclass with confidence. That’s a fork in the road, not a wall: tell us what you want to teach and we’ll shape it with you.'}
        </div>
      ) : stillReading ? (
        <>
          <div className="arch-cards">
            <div className="arch-shimmer" style={{ height: 118 }} />
            <div
              className="arch-shimmer"
              style={{ height: 118, opacity: 0.7 }}
            />
            <div
              className="arch-shimmer"
              style={{ height: 118, opacity: 0.45 }}
            />
          </div>
          <div className="arch-reading-line">
            Reading comment threads and mapping episodes to footage you already
            have. A few minutes — your picks so far are saved.
          </div>
        </>
      ) : (
        <>
          {flagship && (
            <div className="arch-flagship-eyebrow">
              One stood clear of everything else
            </div>
          )}
          {result?.mirror_pattern && !flagship && (
            <div
              className="so-hint"
              style={{ display: 'block', marginBottom: 16 }}
            >
              {result.mirror_pattern}
            </div>
          )}
          <div className="arch-cards">
            {proposals.map((p, i) => (
              <ProposalCard
                key={`${p.title}-${i}`}
                proposal={p}
                index={i}
                selected={selectedIndex === i}
                flagship={flagship}
                onSelect={() => onSelect(i)}
              />
            ))}
          </div>
        </>
      )}
      {!deadEnd && <ForkLink onFork={onFork} />}
    </StepShell>
  )
}
