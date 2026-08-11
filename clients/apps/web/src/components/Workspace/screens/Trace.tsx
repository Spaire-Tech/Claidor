'use client'

/**
 * Chain — a figure traced from the deliverable back to its source.
 *
 * The screen the product is for. It reads down: what the slide printed,
 * what the model returns, what that cell is built from, and where the
 * numbers underneath it came from. The transform between two steps sits
 * between them in the quietest grey the design has, because it explains
 * the gap rather than being a step of its own.
 *
 * The table underneath is the part a banker quotes back. Basis and Version
 * are in it deliberately: « $41.9m » is not an answer to « says who », and
 * « Model v11, normalised, FY24 to 31 Dec » is.
 *
 * **The last step is the one the design calls an anchor.** Its own chain
 * ends at « Audited financial statements FY24 », because a number traced
 * back to another number in the same building has not been traced very
 * far. A `source` step is that: the document, the page, and the sentence
 * the figure was printed in — so the row reads as the document it is
 * rather than as another cell.
 */

import type { Chain } from '../api'
import { colour, font, size } from '../design'

export function Trace({
  chain,
  title,
  printed,
  expected,
  says,
  rows,
  onSlide,
  onCell,
}: {
  chain: Chain | null
  title: string
  printed: string
  expected: string
  /** Which document is making the claim — « The deliverable », or the
   *  audited accounts by name when the model is the thing being doubted. */
  says: string
  rows: { k: string; v: string }[]
  onSlide: () => void
  onCell: () => void
}) {
  const steps = chain?.steps ?? []

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
          {title}
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 6 }}>
          {says} shows <span style={{ color: colour.critical }}>{printed}</span>
          . The model returns{' '}
          <span style={{ color: colour.ink }}>{expected}</span>.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 26px 26px',
        }}
      >
        {steps.map((step, index) => {
          //: A source step names a document; every other step names a
          //: position inside one. So the two lines swap: the document and
          //: its page lead, and the sentence it was printed in is the
          //: locator underneath.
          const grounded = step.kind === 'source'
          const heading = grounded
            ? (step.label ?? step.ref)
            : step.name || step.label || step.ref
          const beneath = grounded
            ? step.name
            : [step.ref, step.formula].filter(Boolean).join(' · ')
          return (
            <div key={index}>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'baseline',
                  width: '100%',
                  textAlign: 'left',
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
                    {heading}
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
                    {beneath}
                  </span>
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontFamily: font.mono,
                    fontSize: 14,
                    color: colour.ink,
                  }}
                >
                  {step.printed ?? step.value ?? ''}
                </span>
              </div>
              {step.note && (
                <div
                  style={{
                    fontSize: size.small,
                    color: colour.fainter,
                    padding: '0 0 4px',
                  }}
                >
                  {step.note}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ paddingTop: 26 }}>
          <div style={{ fontSize: 13, color: colour.faint, paddingBottom: 2 }}>
            {title}
          </div>
          {rows.map((row) => (
            <div
              key={row.k}
              style={{
                display: 'flex',
                gap: 16,
                padding: '10px 0',
                borderTop: `1px solid ${colour.bandWarm}`,
              }}
            >
              <span
                style={{
                  flex: '0 0 82px',
                  fontSize: size.small,
                  color: colour.fainter,
                }}
              >
                {row.k}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: size.meta,
                  color: colour.ink,
                  lineHeight: 1.5,
                }}
              >
                {row.v}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
            <button onClick={onSlide} style={link(colour.blue)}>
              Open the slide
            </button>
            <button onClick={onCell} style={link(colour.faint)}>
              Open the cell
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const link = (ink: string) => ({
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  color: ink,
  cursor: 'pointer',
})
