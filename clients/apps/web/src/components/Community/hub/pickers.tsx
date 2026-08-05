'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — custom Apple-style pickers (date, time, meeting provider,
 * episode) ported from the design handoff (creator-app.jsx). Frosted popovers
 * matching the post/menu vocabulary; markup/classnames match hub.css.
 */
import * as React from 'react'
import { Glyph } from './icons'

const { useState, useRef, useEffect } = React

/* ---------- meeting providers ---------- */
export type ProviderKey = 'zoom' | 'meet' | 'teams' | 'webex' | 'other'
export const MEET_PROVIDERS: {
  k: ProviderKey
  name: string
  logo: string | null
  color?: string
  host: string
}[] = [
  { k: 'zoom', name: 'Zoom', logo: '/community/providers/zoom.svg', host: 'zoom.us/j/' },
  { k: 'meet', name: 'Google Meet', logo: '/community/providers/meet.svg', host: 'meet.google.com/' },
  { k: 'teams', name: 'Microsoft Teams', logo: '/community/providers/teams.svg', host: 'teams.microsoft.com/l/' },
  { k: 'webex', name: 'Webex', logo: '/community/providers/webex.svg', host: 'meet.webex.com/' },
  { k: 'other', name: 'Other link', logo: null, color: '#86868b', host: '' },
]
export const providerOf = (k: ProviderKey) =>
  MEET_PROVIDERS.find((x) => x.k === k) || MEET_PROVIDERS[0]
export const providerPlaceholder = (k: ProviderKey) => {
  const p = providerOf(k)
  return p.host ? `https://${p.host}…` : 'https://…'
}
/** Infer the provider from a stored meeting URL (we persist only the URL). */
export function providerFromUrl(url: string | null | undefined): ProviderKey {
  const u = (url || '').toLowerCase()
  if (!u) return 'zoom'
  if (u.includes('zoom.us')) return 'zoom'
  if (u.includes('meet.google')) return 'meet'
  if (u.includes('teams.microsoft') || u.includes('teams.live')) return 'teams'
  if (u.includes('webex.com')) return 'webex'
  return 'other'
}

export function ProviderLogo({ k, size = 22 }: { k: ProviderKey; size?: number }) {
  const p = providerOf(k)
  if (p.logo)
    return (
      <span className="prov-logo img" style={{ width: size, height: size }}>
        <img src={p.logo} alt={p.name} />
      </span>
    )
  return (
    <span
      className="prov-logo"
      style={{ width: size, height: size, background: p.color }}
    >
      <Glyph d="link" size={Math.round(size * 0.6)} stroke={1.9} />
    </span>
  )
}

export function ProviderSelect({
  value,
  onChange,
}: {
  value: ProviderKey
  onChange: (k: ProviderKey) => void
}) {
  const [open, setOpen] = useState(false)
  const cur = providerOf(value)
  return (
    <div className="prov-wrap">
      <button
        type="button"
        className="prov-btn"
        onClick={() => setOpen((o) => !o)}
      >
        <ProviderLogo k={cur.k} />
        <span className="prov-name">{cur.name}</span>
        <Glyph d="chevD" size={16} stroke={2} />
      </button>
      {open && (
        <>
          <div className="prov-scrim" onClick={() => setOpen(false)} />
          <div className="prov-menu">
            {MEET_PROVIDERS.map((p) => (
              <button
                type="button"
                key={p.k}
                className={`prov-opt${p.k === value ? ' on' : ''}`}
                onClick={() => {
                  onChange(p.k)
                  setOpen(false)
                }}
              >
                <ProviderLogo k={p.k} />
                <span className="prov-name">{p.name}</span>
                {p.k === value && (
                  <span className="prov-check">
                    <Glyph d="check" size={15} stroke={2.6} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- date & time ---------- */
const CAL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CAL_WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad2 = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`

export function fmtDateLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
export function fmtTimeLabel(t: string | null | undefined): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  let hh = h % 12
  if (hh === 0) hh = 12
  return `${hh}:${pad2(m)} ${ap}`
}
const TIME_OPTS = (() => {
  const a: string[] = []
  for (let h = 0; h < 24; h++) a.push(`${pad2(h)}:00`, `${pad2(h)}:30`)
  return a
})()

export function DatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const today = new Date()
  const base = value
    ? value.split('-').map(Number)
    : [today.getFullYear(), today.getMonth() + 1, today.getDate()]
  const [vm, setVm] = useState({ y: base[0], m: base[1] - 1 })
  const startDow = new Date(vm.y, vm.m, 1).getDay()
  const daysIn = new Date(vm.y, vm.m + 1, 0).getDate()
  const todayISO = isoOf(today.getFullYear(), today.getMonth(), today.getDate())
  const days: number[] = []
  for (let d = 1; d <= daysIn; d++) days.push(d)
  const prev = () =>
    setVm((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  const next = () =>
    setVm((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
  const goToday = () => {
    setVm({ y: today.getFullYear(), m: today.getMonth() })
    onChange(todayISO)
    setOpen(false)
  }
  return (
    <div className="dt-wrap">
      <button
        type="button"
        className={`dt-btn${value ? ' has' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dt-ic">
          <Glyph d="calendar" size={16} stroke={1.9} />
        </span>
        <span className="dt-lbl">{value ? fmtDateLabel(value) : 'Select date'}</span>
        <span className="dt-chev">
          <Glyph d="chevD" size={15} stroke={2} />
        </span>
      </button>
      {open && (
        <>
          <div className="dt-scrim" onClick={() => setOpen(false)} />
          <div className="dt-pop cal">
            <div className="cal-head">
              <button
                type="button"
                className="cal-nav"
                onClick={prev}
                aria-label="Previous month"
              >
                <Glyph d="back" size={16} stroke={2.2} />
              </button>
              <span className="cal-title">
                {CAL_MONTHS[vm.m]} {vm.y}
              </span>
              <button
                type="button"
                className="cal-nav"
                onClick={next}
                aria-label="Next month"
              >
                <Glyph d="chevR" size={16} stroke={2.2} />
              </button>
            </div>
            <div className="cal-grid cal-wd">
              {CAL_WD.map((w) => (
                <span key={w} className="cal-wdc">
                  {w}
                </span>
              ))}
            </div>
            <div className="cal-grid">
              {days.map((d, i) => {
                const iso = isoOf(vm.y, vm.m, d)
                const style =
                  i === 0 ? { gridColumnStart: startDow + 1 } : undefined
                return (
                  <button
                    type="button"
                    key={iso}
                    style={style}
                    className={`cal-cell${iso === value ? ' sel' : ''}${
                      iso === todayISO ? ' today' : ''
                    }`}
                    onClick={() => {
                      onChange(iso)
                      setOpen(false)
                    }}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            <button type="button" className="cal-today" onClick={goToday}>
              <span className="cal-today-dot" />
              Today · {fmtDateLabel(todayISO)}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function TimePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (t: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !ref.current) return
    const el = ref.current.querySelector<HTMLElement>('.tm-opt.on')
    if (el)
      ref.current.scrollTop =
        el.offsetTop - ref.current.clientHeight / 2 + el.clientHeight / 2
  }, [open])
  return (
    <div className="dt-wrap">
      <button
        type="button"
        className={`dt-btn${value ? ' has' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dt-ic">
          <Glyph d="clock" size={16} stroke={1.9} />
        </span>
        <span className="dt-lbl">{value ? fmtTimeLabel(value) : 'Select time'}</span>
        <span className="dt-chev">
          <Glyph d="chevD" size={15} stroke={2} />
        </span>
      </button>
      {open && (
        <>
          <div className="dt-scrim" onClick={() => setOpen(false)} />
          <div className="dt-pop tm" ref={ref}>
            {TIME_OPTS.map((t) => (
              <button
                type="button"
                key={t}
                className={`tm-opt${t === value ? ' on' : ''}`}
                onClick={() => {
                  onChange(t)
                  setOpen(false)
                }}
              >
                {fmtTimeLabel(t)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- episode / channel picker ---------- */
export type ChannelOption = { id: string; label: string; thumb?: string | null }

export function EpisodeSelect({
  value,
  options,
  noun,
  onChange,
}: {
  value: string | null
  options: ChannelOption[]
  noun: string
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => o.id === value) || null
  return (
    <div className="prov-wrap">
      <button
        type="button"
        className="prov-btn ep-btn"
        onClick={() => setOpen((o) => !o)}
      >
        {cur ? (
          <>
            {cur.thumb ? (
              <span
                className="ep-thumb"
                style={{ backgroundImage: `url(${cur.thumb})` }}
              />
            ) : (
              <span className="ep-thumb none">
                <Glyph d="doc" size={14} stroke={1.8} />
              </span>
            )}
            <span className="prov-name">{cur.label}</span>
          </>
        ) : (
          <>
            <span className="ep-thumb none">
              <Glyph d="doc" size={14} stroke={1.8} />
            </span>
            <span className="prov-name dim">Not linked to a {noun}</span>
          </>
        )}
        <span className="dt-chev">
          <Glyph d="chevD" size={15} stroke={2} />
        </span>
      </button>
      {open && (
        <>
          <div className="prov-scrim" onClick={() => setOpen(false)} />
          <div className="prov-menu ep-menu">
            <button
              type="button"
              className={`prov-opt${value == null ? ' on' : ''}`}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <span className="ep-thumb none">
                <Glyph d="doc" size={14} stroke={1.8} />
              </span>
              <span className="prov-name">No {noun}</span>
            </button>
            {options.map((o) => (
              <button
                type="button"
                key={o.id}
                className={`prov-opt${value === o.id ? ' on' : ''}`}
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
              >
                {o.thumb ? (
                  <span
                    className="ep-thumb"
                    style={{ backgroundImage: `url(${o.thumb})` }}
                  />
                ) : (
                  <span className="ep-thumb none">
                    <Glyph d="doc" size={14} stroke={1.8} />
                  </span>
                )}
                <span className="prov-name">{o.label}</span>
                {value === o.id && (
                  <span className="prov-check">
                    <Glyph d="check" size={15} stroke={2.6} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Combine a yyyy-mm-dd date + HH:mm time (local) into a UTC ISO string. */
export function toStartAtISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}
/** Browser IANA timezone. */
export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
