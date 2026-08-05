'use client'

// Audience picker + subject input — the header strip above the editor body.
// Builds the segment list from real Spaire data (useEmailSegments +
// useEmailSubscriberStats) plus a virtual "All subscribers" entry.

import {
  useEmailSegments,
  useEmailSubscriberStats,
} from '@/hooks/queries/emailMarketing'
import { schemas } from '@spaire/client'
import { Fragment, useMemo, useState } from 'react'

import { Icon, type IconName } from './Icon'

export type Segment = {
  id: string // 'all' for the virtual all-active segment, otherwise real segment id
  name: string
  count: number
  icon: IconName
  desc: string
}

export const fmt = (n: number) => n.toLocaleString('en-US')

export function useSegments(organizationId: string) {
  const stats = useEmailSubscriberStats(organizationId)
  const segs = useEmailSegments(organizationId)
  const totalActive = stats.data?.active ?? 0

  return useMemo<Segment[]>(() => {
    const all: Segment = {
      id: 'all',
      name: 'All subscribers',
      count: totalActive,
      icon: 'people',
      desc: 'Everyone on your list',
    }
    const real: Segment[] = (segs.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      count: s.subscriber_count,
      icon: 'tag' as IconName,
      desc: 'Saved segment',
    }))
    return [all, ...real]
  }, [totalActive, segs.data])
}

function SegMenu({
  segments,
  selected,
  onPick,
  onClose,
  excludeAll,
}: {
  segments: Segment[]
  selected: string | string[]
  onPick: (id: string) => void
  onClose: () => void
  excludeAll?: boolean
}) {
  return (
    <Fragment>
      <div
        className="inserter-backdrop"
        style={{ zIndex: 54 }}
        onClick={onClose}
      ></div>
      <div className="ac-pop seg-pop" onMouseDown={(e) => e.preventDefault()}>
        {segments
          .filter((s) => !excludeAll || s.id !== 'all')
          .map((s) => {
            const on = Array.isArray(selected)
              ? selected.includes(s.id)
              : selected === s.id
            return (
              <button
                key={s.id}
                className={'ac-item' + (on ? ' on' : '')}
                onClick={() => onPick(s.id)}
              >
                <span className="agly">
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="who">
                  <b>{s.name}</b>
                  <span>{s.desc}</span>
                </span>
                {on ? (
                  <span className="ck">
                    <Icon name="check" size={18} />
                  </span>
                ) : (
                  <span className="cnt">{fmt(s.count)}</span>
                )}
              </button>
            )
          })}
        {segments.length <= 1 && (
          <div
            style={{
              padding: '10px 12px',
              color: 'var(--c-gray)',
              fontSize: 13.5,
            }}
          >
            No saved segments yet. Create one from the Segments tab.
          </div>
        )}
      </div>
    </Fragment>
  )
}

export function AudienceFields({
  organization,
  audience,
  setAudience,
  excludes,
  setExcludes,
  showExclude,
  setShowExclude,
  subject,
  setSubject,
  reach,
  onTouch,
  lockedAudienceLabel,
  allowExclude = true,
}: {
  organization: schemas['Organization']
  audience: string
  setAudience: (id: string) => void
  excludes: string[]
  setExcludes: (next: string[]) => void
  showExclude: boolean
  setShowExclude: (b: boolean) => void
  subject: string
  setSubject: (next: string) => void
  reach: number
  onTouch?: () => void
  /** When set, the audience picker is replaced by this static label
      (e.g. automation sequences define their own audience). */
  lockedAudienceLabel?: string
  /** Show the "Exclude a segment" affordance. Off where the send pipeline
      can't actually apply segment exclusions (broadcast composer). */
  allowExclude?: boolean
}) {
  const segments = useSegments(organization.id)
  const [open, setOpen] = useState<'aud' | 'exc' | null>(null)
  const aud =
    segments.find((s) => s.id === audience) ?? segments[0]

  const pickAud = (id: string) => {
    setAudience(id)
    setExcludes(excludes.filter((e) => e !== id))
    setOpen(null)
    onTouch?.()
  }
  const toggleExc = (id: string) => {
    setExcludes(
      excludes.includes(id) ? excludes.filter((e) => e !== id) : [...excludes, id],
    )
    onTouch?.()
  }

  return (
    <div className="recip">
      <div className="recip-row">
        <span className="recip-lbl">To</span>
        <div className="recip-field">
          {lockedAudienceLabel ? (
            <span className="aud-chip" style={{ cursor: 'default' }}>
              <span className="aic">
                <Icon name="people" size={18} />
              </span>
              {lockedAudienceLabel}
            </span>
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                className="aud-chip"
                onClick={() => setOpen(open === 'aud' ? null : 'aud')}
              >
                <span className="aic">
                  <Icon name={aud.icon} size={18} />
                </span>
                {aud.name} <span className="cnt">· {fmt(aud.count)}</span>
                <span className="cv">
                  <Icon name="chevronDown" size={15} />
                </span>
              </button>
              {open === 'aud' && (
                <SegMenu
                  segments={segments}
                  selected={audience}
                  onPick={pickAud}
                  onClose={() => setOpen(null)}
                />
              )}
            </div>
          )}
        </div>
        {allowExclude && !lockedAudienceLabel && !showExclude && (
          <div className="recip-toggle">
            <button onClick={() => setShowExclude(true)}>Exclude</button>
          </div>
        )}
      </div>

      {allowExclude && !lockedAudienceLabel && showExclude && (
        <div className="recip-row">
          <span className="recip-lbl" style={{ width: 56 }}>
            Skip
          </span>
          <div className="recip-field">
            {excludes.map((id) => {
              const s = segments.find((x) => x.id === id)
              if (!s) return null
              return (
                <span className="seg-chip" key={id}>
                  <Icon name="minusC" size={15} /> {s.name} · {fmt(s.count)}
                  <button className="rm" onClick={() => toggleExc(id)}>
                    <Icon name="close" size={13} />
                  </button>
                </span>
              )
            })}
            <div style={{ position: 'relative' }}>
              <button
                className="add-seg"
                onClick={() => setOpen(open === 'exc' ? null : 'exc')}
              >
                <Icon name="plus" size={15} /> Exclude a segment
              </button>
              {open === 'exc' && (
                <SegMenu
                  segments={segments}
                  selected={excludes}
                  onPick={toggleExc}
                  onClose={() => setOpen(null)}
                  excludeAll
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="recip-row subject-row">
        <input
          className="subject-input"
          value={subject}
          placeholder="Subject line"
          onChange={(e) => {
            setSubject(e.target.value)
            onTouch?.()
          }}
        />
      </div>
    </div>
  )
}
