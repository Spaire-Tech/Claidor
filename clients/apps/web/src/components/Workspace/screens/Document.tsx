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
 * **« Accept $41.9m » now means it.** The footer is the design's own, in
 * its three states: the proposal with both figures in the sentence, the
 * accepted state saying what the slide reads now and what it ties to, and
 * the kept state saying the figure stands. Pressing Accept writes the
 * model's figure into the deck and makes that a new version of the file;
 * Undo writes the old figure back. Until this landed the button said
 * « Record », because recording the decision was all it did.
 *
 * The del/ins pair on a drifted row is the design's Docs idiom borrowed
 * whole — struck-through old figure, underlined new one, both in the
 * design's own inks — because a memo screen and a deck screen are asking
 * the same question and the design already answered it once.
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

import type { Correction, Figure, FigureMap, Finding } from '../api'
import { Nothing } from '../Dense'
import { colour, font, size } from '../design'

const STATE: Record<Figure['state'], { label: string; ink: string }> = {
  agreeing: { label: 'ties', ink: colour.matching },
  confirmed: { label: 'confirmed', ink: colour.matchingDeep },
  drifting: { label: 'drifted', ink: colour.critical },
  unlinked: { label: 'not checked', ink: colour.fainter },
}

/** What a correction may be asked to do next. Mirrors the server's word. */
export type Decision = 'accept' | 'reject' | 'reverse' | 'propose'

export function Document({
  map,
  kind,
  findings,
  corrections,
  onTrace,
  onDecide,
}: {
  map: FigureMap | null
  kind: 'deck' | 'memo'
  /** The deal's findings, so a drifted figure can carry what the model says. */
  findings: Finding[]
  /**
   * Every change proposed on this deal. Passed alongside the findings
   * rather than read off them because a correction *outlives* its finding:
   * once it is applied the deck agrees and the drift is gone, and this is
   * the only thing left that says the slide used to read $49.6mm.
   */
  corrections: Correction[]
  onTrace: (finding: Finding) => void
  onDecide: (
    finding: Finding | null,
    correction: Correction | null,
    decision: Decision,
  ) => void
}) {
  const [page, setPage] = useState(0)
  // A different document starts at its first page. Adjusted during the
  // render that notices rather than in an effect afterwards, which would
  // draw one frame of the new deck at the old deck's slide index.
  //
  // **Keyed on the filename, not the artifact id.** Accepting a correction
  // makes a new version of the same deck, which is a new artifact id — so
  // an id here threw the reader back to slide 2 the instant they accepted
  // something on slide 7, and the sentence saying what the slide reads now
  // was never seen. A new version of « the deck » is the same document to
  // whoever is reading it, and versions of one document share a filename
  // by construction: that is what a lineage is.
  const [shownFor, setShownFor] = useState(map?.filename)
  if (map?.filename !== shownFor) {
    setShownFor(map?.filename)
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

  // Corrections reach a figure from both ends, because a correction is
  // about a figure that is *changing*: while it is only proposed the
  // document still prints `before`, and once it is applied the document
  // prints `after` and there is no finding left to reach it through.
  const corrected = useMemo(() => {
    const found = new Map<string, Correction>()
    for (const one of corrections) {
      found.set(`${one.page}|${one.before}`, one)
      found.set(`${one.page}|${one.after}`, one)
    }
    return found
  }, [corrections])

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
  const shownPage = paginated ? here.page : 0
  const drifted = figures
    .map((figure) => byPrinted.get(`${shownPage}|${figure.printed}`))
    .find((finding) => finding !== undefined && finding.state === 'open')
  //: What the footer talks about: the open drift on this page, or — once
  //: one has been settled — the correction that settled it. The second is
  //: what keeps « Undo » on screen after the finding it came from is gone.
  const settled = figures
    .map((figure) => corrected.get(`${shownPage}|${figure.printed}`))
    .find((one) => one !== undefined && one.state !== 'proposed')
  const footing = drifted
    ? (corrected.get(`${shownPage}|${drifted.printed}`) ?? null)
    : (settled ?? null)

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
              <Printed
                figure={figure}
                correction={corrected.get(`${shownPage}|${figure.printed}`)}
              />
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

      {/* The design's footer, in the design's three states. */}
      {(drifted || footing) && (
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
                color: drifted ? colour.ink : colour.faint,
                lineHeight: 1.6,
              }}
            >
              {/* Where it is comes off the finding, which knows whether it
                  is a slide or a paragraph. Nothing here has to — it only
                  has to start the sentence with a capital. */}
              {drifted
                ? `${sentence(drifted.where.detail || 'this document')} shows ${drifted.printed}. The model returns ${drifted.expected}.`
                : outcome(footing!)}
            </span>
            <span style={{ display: 'flex', gap: 18 }}>
              {drifted && (
                <>
                  <button
                    onClick={() => onDecide(drifted, footing, 'accept')}
                    style={action(colour.blue)}
                  >
                    Accept {drifted.expected}
                  </button>
                  <button
                    onClick={() => onDecide(drifted, footing, 'reject')}
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
                </>
              )}
              {/* Undo, and what it means depends on what happened. On an
                  applied correction it writes the old figure back into the
                  file; on a kept or failed one there is nothing in the file
                  to undo, so it puts the proposal back on the table. */}
              {!drifted && footing && footing.where === 'file' && (
                <button
                  onClick={() =>
                    onDecide(
                      null,
                      footing,
                      footing.state === 'applied' ? 'reverse' : 'propose',
                    )
                  }
                  style={action(colour.blue)}
                >
                  Undo
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The printed figure, and the change waiting on it.
 *
 * The design's Docs idiom: while a change is pending the old figure is
 * struck through in the quiet ink and the new one is underlined in the
 * agreeing green; once it is settled both are plain. Borrowed here because
 * a deck row and a memo paragraph are asking the same question, and the
 * design answered it once already.
 */
function Printed({
  figure,
  correction,
}: {
  figure: Figure
  correction: Correction | undefined
}) {
  const pending = correction?.state === 'proposed'
  const settled = correction?.state === 'applied'
  return (
    <span
      style={{
        flex: '0 0 auto',
        fontFamily: font.mono,
        fontSize: 14,
        display: 'flex',
        gap: 6,
      }}
    >
      {settled && correction ? (
        // Applied: the document prints the new figure, and the old one is
        // shown behind it so the row still says what changed.
        <>
          <span
            style={{ color: colour.slateFaint, textDecoration: 'line-through' }}
          >
            {correction.before}
          </span>
          <span style={{ color: colour.dark }}>{figure.printed}</span>
        </>
      ) : (
        <>
          <span
            style={{
              color: pending ? colour.slateFaint : 'inherit',
              textDecoration: pending ? 'line-through' : 'none',
            }}
          >
            {figure.printed}
          </span>
          {pending && correction && (
            <span
              style={{
                color: colour.matchingDeep,
                textDecoration: 'underline',
              }}
            >
              {correction.after}
            </span>
          )}
        </>
      )}
    </span>
  )
}

/**
 * What became of a correction, in one sentence.
 *
 * The design's own words for the two branches it drew — « Slide 14 now
 * reads $41.9m and ties to Ops!B23 » and « The figure stands at $42.6m » —
 * plus the two states a real writer has and a drawing does not: a change
 * made in somebody's own copy, and a write that was refused.
 */
function outcome(correction: Correction): string {
  const where = sentence(correction.location || 'this document')
  if (correction.state === 'applied') {
    const ties = correction.source ? ` and ties to ${correction.source}` : ''
    return correction.where === 'document'
      ? `${where} was corrected to ${correction.after} in the copy open in Office. This deal still holds the version that reads ${correction.before}.`
      : `${where} now reads ${correction.after}${ties}.`
  }
  if (correction.state === 'reversed') {
    return `${where} stands at ${correction.before} again.`
  }
  if (correction.state === 'failed') {
    return correction.error ?? 'That change could not be written.'
  }
  return `The figure stands at ${correction.before}. Record the basis, or it is raised again on the next check.`
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
