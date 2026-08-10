'use client'

/**
 * Pitchbook and Docs — a deliverable, page by page, and what each figure
 * on it did.
 *
 * One screen for both because a deck and a memo are the same object to
 * this product: a document that *publishes figures*, where the unit is a
 * slide in one case and a paragraph in the other. The design draws them
 * differently only because its deck is a picture of a slide and its memo
 * is a picture of paragraphs — and both of those are pictures.
 *
 * **What this deliberately does not do.**
 *
 * It does not draw a facsimile of the slide. The design's deck screen
 * contains a hand-built bar chart, and a bar chart assembled here from
 * whatever numbers happen to be on the slide would be a drawing of a slide
 * that does not exist. Showing a real slide means rendering the file —
 * a converter, an image, a job — and that is a real feature with a real
 * cost, not something to fake in the meantime. It is on the roadmap.
 *
 * It does not accept a change *into* the file either. « Accept $41.9m » in
 * the design edits the deck; nothing here writes to a document yet. What
 * these two buttons do is record the decision against the finding, and the
 * words say exactly that — « Record the model's figure », not « Accept ».
 * A button that claims to have fixed a deck it never touched is the one
 * lie this product cannot afford.
 *
 * What is here is real: every figure the reader found, the value as it was
 * printed, whether it ties, and — for the ones that were not checked — the
 * reason, which is the part that keeps the screen honest.
 *
 * **A deck is paginated; a memo is not.** The reader gives every memo
 * figure page zero on purpose — « a memo has no pages, and a made-up
 * number would send the panel to a slide that does not exist ». So the
 * deck gets a slide picker and one slide at a time, and the memo is one
 * list in document order with « paragraph 9 » on each row. That is not two
 * screens; it is the same screen told that one of these documents has
 * pages and the other has not.
 */

import { useMemo, useState } from 'react'

import type { Figure, FigureMap, Finding } from '../api'
import { Nothing } from '../Dense'
import { colour, font, size } from '../design'

const STATE: Record<Figure['state'], { label: string; ink: string }> = {
  agreeing: { label: 'ties', ink: colour.matching },
  confirmed: { label: 'confirmed', ink: colour.matchingDeep },
  drifting: { label: 'drifted', ink: colour.critical },
  unlinked: { label: 'not checked', ink: colour.fainter },
}

export function Document({
  map,
  kind,
  findings,
  onTrace,
  onDecide,
}: {
  map: FigureMap | null
  kind: 'deck' | 'memo'
  /** The deal's findings, so a drifted figure can carry what the model says. */
  findings: Finding[]
  onTrace: (finding: Finding) => void
  onDecide: (finding: Finding, state: 'accepted' | 'dismissed') => void
}) {
  const [page, setPage] = useState(0)
  // A different document starts at its first page. Adjusted during the
  // render that notices rather than in an effect afterwards, which would
  // draw one frame of the new deck at the old deck's slide index.
  const [shownFor, setShownFor] = useState(map?.artifact_id)
  if (map?.artifact_id !== shownFor) {
    setShownFor(map?.artifact_id)
    setPage(0)
  }

  const paginated = kind === 'deck'

  // A finding is reached from a figure by the page it was printed on and
  // the characters that were printed. Both come off the same figure when
  // the check writes the finding, so this is a lookup and not a guess —
  // and keyed on the pair rather than the page alone, because a slide with
  // two drifts on it has two findings.
  const byPrinted = useMemo(() => {
    const found = new Map<string, Finding>()
    for (const finding of findings) {
      if (finding.kind !== 'drift') continue
      found.set(`${finding.page}|${finding.printed}`, finding)
    }
    return found
  }, [findings])

  if (!map) {
    return (
      <div style={{ padding: 26 }}>
        <Nothing>
          Open a {kind === 'deck' ? 'deck' : 'memo'} from the data room to
          reconcile it here.
        </Nothing>
      </div>
    )
  }

  if (map.slides.length === 0) {
    return (
      <div style={{ padding: 26 }}>
        <Nothing>
          {map.filename} was read and carries no figures. Nothing here needs
          checking.
        </Nothing>
      </div>
    )
  }

  const here = map.slides[Math.min(page, map.slides.length - 1)]
  //: One slide of a deck, or the whole of a memo.
  const figures = paginated
    ? here.figures
    : map.slides.flatMap((one) => one.figures)
  const drifted = figures
    .map((figure) =>
      byPrinted.get(`${paginated ? here.page : 0}|${figure.printed}`),
    )
    .find((finding) => finding !== undefined && finding.state === 'open')

  const counted = figures.filter((one) => one.state === 'drifting').length

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          {paginated ? `Slide ${here.page}` : map.filename}
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {[
            paginated ? map.filename : null,
            `${figures.length} ${figures.length === 1 ? 'figure' : 'figures'}`,
            counted > 0 ? `${counted} drifted` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {/* Every slide that carries a figure. A slide with none is not in
          this list, because there would be nothing to look at when you got
          there.

          Numbers only. The Filter idiom this borrows carries a count
          beside each label — « Critical 3 » — and that works because the
          label is a word. Here the label is a number too, and « 2 9 · 3 29 »
          reads as twenty-nine and three hundred and twenty-nine. How many
          figures are on the slide you are looking at is in the line above. */}
      <div
        style={{
          flex: '0 0 auto',
          display: paginated ? 'flex' : 'none',
          gap: 14,
          flexWrap: 'wrap',
          padding: '0 26px 14px',
        }}
      >
        {map.slides.map((one, index) => (
          <button
            key={one.page}
            onClick={() => setPage(index)}
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              font: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
              color: index === page ? colour.blue : colour.faint,
            }}
          >
            {one.page}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 26px 26px',
        }}
      >
        {figures.map((figure) => {
          const state = STATE[figure.state]
          return (
            <div
              key={figure.id}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'baseline',
                padding: '15px 0',
                borderTop: `1px solid ${colour.bandWarm}`,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: size.body,
                    color: colour.ink,
                  }}
                >
                  {figure.label || figure.printed}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: size.small,
                    color: colour.faint,
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* On an unlinked figure the reason replaces the
                      locator: why it was skipped is the thing worth the
                      line, and where it sits is in the row above. */}
                  {figure.state === 'unlinked' && figure.reason
                    ? figure.reason
                    : figure.location}
                </span>
              </span>
              <span
                style={{
                  flex: '0 0 auto',
                  fontFamily: font.mono,
                  fontSize: 14,
                }}
              >
                {figure.printed}
              </span>
              <span
                style={{
                  flex: '0 0 74px',
                  textAlign: 'right',
                  fontSize: size.small,
                  color: state.ink,
                }}
              >
                {state.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* The design's footer, on a real finding. It says « record »
          because that is what it does: nothing here writes to the file. */}
      {drifted && (
        <div style={{ flex: '0 0 auto', padding: '18px 26px 22px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 220,
                fontSize: size.meta,
                color: colour.ink,
                lineHeight: 1.6,
              }}
            >
              {/* Where it is comes off the finding, which knows whether it
                  is a slide or a paragraph. Nothing here has to — it only
                  has to start the sentence with a capital. */}
              {sentence(drifted.where.detail || 'this document')} shows{' '}
              {drifted.printed}. The model returns {drifted.expected}.
            </span>
            <span style={{ display: 'flex', gap: 18 }}>
              <button
                onClick={() => onDecide(drifted, 'accepted')}
                style={action(colour.blue)}
              >
                Record {drifted.expected}
              </button>
              <button
                onClick={() => onDecide(drifted, 'dismissed')}
                style={action(colour.faint)}
              >
                Keep
              </button>
              <button
                onClick={() => onTrace(drifted)}
                style={action(colour.faint)}
              >
                Trace
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** « paragraph 9 » is a locator; « Paragraph 9 shows… » is a sentence. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const action = (ink: string) => ({
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  color: ink,
  cursor: 'pointer',
})
