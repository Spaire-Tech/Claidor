'use client'

/**
 * Confirm — the queue the whole promise rests on.
 *
 * The engine proposes that a printed figure means a particular cell. A
 * banker confirms it. From that moment re-checking that figure is
 * arithmetic that cannot come out differently on Tuesday, which is how an
 * engine that reconciles some of a deck can back an answer that holds for
 * all of the part it was told about.
 *
 * **This screen is not in the design.** Composed from two patterns that
 * are: the Check row — title, locator beneath, one value at the right edge
 * — and the Chain metadata table, `flex 0 0 82px` label against the value.
 * Nothing new was invented; where a choice had to be made it went to
 * whichever of those two already answered it.
 *
 * **It has to be fast.** Forty links in a sitting, on a keyboard, is the
 * difference between a mechanism and a screen nobody finishes. `J`/`K` or
 * the arrows move, `Enter` confirms, `R` rejects, and the list advances on
 * its own so a hand never leaves the keys.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Cell, Link } from '../api'
import { colour, font, size } from '../design'

export function Confirm({
  links,
  deal,
  detail,
  onSelect,
  onDecide,
  onSearch,
}: {
  links: Link[]
  deal: string
  /** The selected link re-fetched with its alternatives. */
  detail: Link | null
  onSelect: (link: Link) => void
  onDecide: (link: Link, state: 'confirmed' | 'rejected', cellId?: string) => void
  onSearch: (artifactId: string, query: string) => Promise<Cell[]>
}) {
  const [at, setAt] = useState(0)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Cell[]>([])
  const rows = useRef<(HTMLDivElement | null)[]>([])

  const selected = links[at]

  useEffect(() => {
    if (selected) onSelect(selected)
    setQuery('')
    setFound([])
    rows.current[at]?.scrollIntoView({ block: 'nearest' })
    // `onSelect` is recreated each render by the caller; following it here
    // would re-fetch on every keystroke in the search box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, selected?.id])

  const decide = useCallback(
    (state: 'confirmed' | 'rejected', cellId?: string) => {
      if (!selected) return
      onDecide(selected, state, cellId)
      // Stay at the same index: the decided link leaves the queue, so the
      // next one arrives under the cursor. At the end, step back.
      setAt((was) => Math.min(was, Math.max(0, links.length - 2)))
    },
    [links.length, onDecide, selected],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT') return
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setAt((was) => Math.min(was + 1, links.length - 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setAt((was) => Math.max(was - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        decide('confirmed')
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        decide('rejected')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, links.length])

  const search = async (text: string) => {
    setQuery(text)
    const artifact = selected?.cell?.artifact_id
    if (!artifact || text.trim().length < 2) return setFound([])
    setFound(await onSearch(artifact, text.trim()))
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          Confirm
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {deal} · {links.length} proposed · once confirmed, a figure is
          re-checked by arithmetic
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 26px 26px' }}>
        {links.length === 0 && (
          <div style={{ fontSize: size.meta, color: colour.muted, paddingTop: 8 }}>
            Nothing waiting. Every figure the engine could name has been
            settled.
          </div>
        )}

        {links.map((link, index) => {
          const here = index === at
          return (
            <div
              key={link.id}
              ref={(node) => {
                rows.current[index] = node
              }}
              style={{ borderTop: `1px solid ${colour.bandWarm}` }}
            >
              <button
                onClick={() => setAt(index)}
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'baseline',
                  border: 0,
                  background: here ? colour.washer : 'transparent',
                  padding: '15px 8px',
                  margin: '0 -8px',
                  width: 'calc(100% + 16px)',
                  borderRadius: 8,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ display: 'block', fontSize: size.body, color: colour.ink }}
                  >
                    <span style={{ fontFamily: font.mono }}>
                      {link.figure?.printed}
                    </span>
                    {link.figure?.label ? ` — ${link.figure.label}` : ''}
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
                    {link.figure?.location} → {link.cell?.name}
                  </span>
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontFamily: font.mono,
                    fontSize: size.small,
                    color: colour.fainter,
                  }}
                >
                  {link.confidence.toFixed(2)}
                </span>
              </button>

              {here && (
                <div style={{ padding: '2px 0 20px', animation: 'pcIn .18s ease both' }}>
                  {/* The Chain's metadata table, unchanged. */}
                  {(
                    [
                      ['Figure', `${link.figure?.printed} · ${link.figure?.label || '—'}`],
                      ['Where', link.figure?.location ?? '—'],
                      ['Cell', `${link.cell?.ref ?? '—'} · ${link.cell?.name ?? ''}`],
                      ['Value', link.cell?.value ?? '—'],
                      ['Basis', link.cell?.basis || '—'],
                      ['Reads as', link.transformation],
                    ] as [string, string][]
                  ).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        gap: 16,
                        padding: '9px 0',
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
                        {key}
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
                        {value}
                      </span>
                    </div>
                  ))}

                  {detail?.id === link.id && (detail.alternatives?.length ?? 0) > 0 && (
                    <div style={{ paddingTop: 16 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: colour.faint,
                          paddingBottom: 2,
                        }}
                      >
                        Or did you mean
                      </div>
                      {detail.alternatives?.map((one) => (
                        <button
                          key={one.ref}
                          onClick={() =>
                            decide('confirmed', one.cell_id ?? undefined)
                          }
                          style={{
                            display: 'flex',
                            gap: 16,
                            alignItems: 'baseline',
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            borderTop: `1px solid ${colour.bandWarm}`,
                            background: 'transparent',
                            padding: '10px 0',
                            font: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: size.meta }}>
                              {one.name}
                            </span>
                            <span
                              style={{
                                display: 'block',
                                fontSize: size.small,
                                color: colour.faint,
                                fontFamily: font.mono,
                                marginTop: 2,
                              }}
                            >
                              {one.ref}
                            </span>
                          </span>
                          <span style={{ fontFamily: font.mono, fontSize: size.meta }}>
                            {one.value}
                          </span>
                          <span
                            style={{
                              flex: '0 0 44px',
                              textAlign: 'right',
                              fontFamily: font.mono,
                              fontSize: size.small,
                              color: colour.fainter,
                            }}
                          >
                            {one.confidence.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ paddingTop: 16 }}>
                    <input
                      value={query}
                      onChange={(event) => void search(event.target.value)}
                      placeholder="Point it somewhere else — search the model"
                      style={{
                        width: '100%',
                        border: `1px solid ${colour.ruleStrong}`,
                        borderRadius: 10,
                        padding: '9px 12px',
                        font: 'inherit',
                        fontSize: size.meta,
                        color: colour.ink,
                        outline: 'none',
                        background: colour.paper,
                      }}
                    />
                    {found.map((cell) => (
                      <button
                        key={cell.id}
                        onClick={() => decide('confirmed', cell.id)}
                        style={{
                          display: 'flex',
                          gap: 16,
                          alignItems: 'baseline',
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderTop: `1px solid ${colour.bandWarm}`,
                          background: 'transparent',
                          padding: '10px 0',
                          font: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: size.meta }}>
                            {cell.name}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: size.small,
                              color: colour.faint,
                              fontFamily: font.mono,
                              marginTop: 2,
                            }}
                          >
                            {cell.ref}
                          </span>
                        </span>
                        <span style={{ fontFamily: font.mono, fontSize: size.meta }}>
                          {cell.value}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      marginTop: 18,
                      alignItems: 'baseline',
                    }}
                  >
                    <button onClick={() => decide('confirmed')} style={act(colour.blue)}>
                      Confirm
                    </button>
                    <button onClick={() => decide('rejected')} style={act(colour.faint)}>
                      Reject
                    </button>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: size.small,
                        color: colour.fainter,
                      }}
                    >
                      ↵ confirm · R reject · J K move
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const act = (ink: string) => ({
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  color: ink,
  cursor: 'pointer',
})
