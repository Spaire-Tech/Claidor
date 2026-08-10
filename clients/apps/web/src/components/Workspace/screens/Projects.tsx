'use client'

/**
 * Projects — every deal this person is on, and which of them needs looking
 * at.
 *
 * The design draws it as a list of deals with a status word at the right
 * edge, and that list is the answer to the only question a banker with
 * four live deals asks before nine in the morning: *which one is wrong.*
 *
 * **It is also the screen that unbroke the workspace.** Until this, the
 * workspace opened « the first deal you are on » and there was no way to
 * reach a second one — a limitation nothing on screen admitted to. Every
 * other screen here is about one deal; this is the one that chooses it.
 *
 * **« Not run » is a status, and it is the one that matters.** A deal with
 * no open findings and a deal nobody has ever checked look identical from
 * a count, and a product whose whole argument is « what was not checked
 * stays on screen » cannot let those two share a word. The server sends
 * `checked_at` for exactly this, and null means never.
 */

import type { DealListItem } from '../api'
import { Nothing } from '../Dense'
import { colour, size } from '../design'

/**
 * The design writes « Seven findings », spelled out. That reads well at
 * seven and badly at a hundred and twenty-eight, so its register is kept
 * where it works and numerals take over above ten — the same decision the
 * slide picker made when « 2 9 3 29 » stopped being readable.
 */
const SPELLED = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
]

const spell = (count: number) =>
  count < SPELLED.length ? SPELLED[count] : String(count)

/** The lower-case form, for the middle of a sentence. */
const said = (count: number) => spell(count).toLowerCase()

function statusOf(deal: DealListItem): { label: string; ink: string } {
  if (!deal.checked_at) {
    return { label: 'Not run', ink: colour.fainter }
  }
  if (deal.open_findings === 0) {
    return { label: 'Clear', ink: colour.faint }
  }
  return {
    label: `${spell(deal.open_findings)} ${
      deal.open_findings === 1 ? 'finding' : 'findings'
    }`,
    // The design gives its worst deal the critical ink and the rest the
    // quiet one. Anything open is worth the colour; how bad it is belongs
    // to Check, which can tell an error from a rounding convention.
    ink: colour.critical,
  }
}

export function Projects({
  deals,
  current,
  onOpen,
}: {
  deals: DealListItem[] | null
  /** Which one the workspace is showing, so the list can say so. */
  current: string
  onOpen: (id: string) => void
}) {
  if (deals === null) {
    return (
      <div style={{ padding: 26 }}>
        <Nothing>Loading…</Nothing>
      </div>
    )
  }

  const open = deals.reduce((total, one) => total + one.open_findings, 0)
  const unchecked = deals.filter((one) => !one.checked_at).length

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
          Projects
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {/* The design's own line — « Four live deals · nine open findings »
              — with the third clause it could not have had, because a
              drawing has no deals nobody ran. */}
          {[
            `${spell(deals.length)} live ${deals.length === 1 ? 'deal' : 'deals'}`,
            `${said(open)} open ${open === 1 ? 'finding' : 'findings'}`,
            unchecked > 0 ? `${said(unchecked)} not run` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
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
        {deals.length === 0 && (
          <Nothing>
            You are not on any deals yet. A deal is where files, checks and
            findings live; somebody on the team adds you to one.
          </Nothing>
        )}

        {deals.map((deal) => {
          const status = statusOf(deal)
          const here = deal.id === current
          return (
            <button
              key={deal.id}
              onClick={() => onOpen(deal.id)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
                width: '100%',
                textAlign: 'left',
                border: 0,
                background: 'transparent',
                padding: '15px 0',
                borderTop: `1px solid ${colour.bandWarm}`,
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 15,
                    color: colour.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {deal.name}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    color: colour.faint,
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* The design's second line is what the deal *is*. Ours
                      is the client and how much is in it — the two facts
                      that tell « Project Cascade » from « Project Cascade
                      (old) », which is the only reason this line exists. */}
                  {[
                    deal.client,
                    `${deal.artifacts} ${deal.artifacts === 1 ? 'document' : 'documents'}`,
                    here ? 'open here' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span
                style={{ flex: '0 0 auto', fontSize: 13, color: status.ink }}
              >
                {status.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
