'use client'

import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

// ── Inline icon set — ported verbatim from the approved design so the
//    Audience / Broadcast tabs render the exact same glyphs. ──
const PATHS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  import: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  export: (
    <>
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M5 3h14" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  chevR: <path d="M9 5l7 7-7 7" />,
  chevL: <path d="M15 5l-7 7 7 7" />,
  chevBack: <path d="M15 5l-7 7 7 7" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  personadd: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M3 21c0-4 3-6 6-6s6 2 6 6" />
      <path d="M18 7v6M21 10h-6" />
    </>
  ),
}

export function Icon({ n, w = 18 }: { n: keyof typeof PATHS | string; w?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={w}
      height={w}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[n]}
    </svg>
  )
}

// ── Liquid-glass segmented control — a frosted capsule with a white pill
//    thumb that glides under the active label. Ported from the design. ──
export function LiquidSeg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false })
  const place = useCallback(() => {
    const el = refs.current[value]
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth, ready: true })
  }, [value])
  useLayoutEffect(() => {
    place()
  }, [place])
  useEffect(() => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])
  return (
    <div className="lseg">
      <span
        className="lseg-thumb"
        style={{
          transform: `translateX(${thumb.left}px)`,
          width: thumb.width,
          opacity: thumb.ready ? 1 : 0,
        }}
      />
      {options.map(([k, l]) => (
        <button
          key={k}
          ref={(el) => {
            refs.current[k] = el
          }}
          className={'lseg-btn' + (value === k ? ' on' : '')}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

// ── Lightweight kebab menu — styled with the design's surface tokens so a
//    row's actions stay on-brand inside the Space editor (the email-
//    marketing ActionMenu lives behind its own un-loaded stylesheet). ──
export type KebabItem = {
  label: string
  onClick: () => void
  destructive?: boolean
}

export function KebabMenu({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const toggle = () => {
    // Flip the menu upward when the button sits low in the viewport so it
    // opens into the card rather than off the bottom edge.
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setUp(window.innerHeight - r.bottom < 220)
    setOpen((o) => !o)
  }
  if (items.length === 0) {
    return (
      <button className="a-kebab" disabled>
        <Icon n="dots" w={16} />
      </button>
    )
  }
  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="a-kebab" onClick={toggle} aria-label="More actions">
        <Icon n="dots" w={16} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            ...(up ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
            right: 0,
            minWidth: 168,
            zIndex: 50,
            padding: 6,
            borderRadius: 14,
            background: 'var(--surface-solid, var(--surface))',
            border: '1px solid var(--hair)',
            boxShadow: '0 12px 36px rgba(0,0,0,.18)',
            backdropFilter: 'blur(40px) saturate(150%)',
            WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 500,
                color: it.destructive ? 'var(--live, #d8472b)' : 'var(--ink)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--fill)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared formatting helpers (kept in sync with the email-marketing
//    screens so the Space tabs read identically). ──
export const initial = (name: string | null, email: string): string => {
  const source = name?.trim() || email
  return (source[0] || '?').toUpperCase()
}

export const sourceLabel = (
  source: string,
  importSource: string | null,
): string => {
  if (importSource) return importSource
  switch (source) {
    case 'space_signup':
      return 'Newsletter form'
    case 'purchase':
      return 'Purchase'
    case 'manual':
      return 'Manual'
    case 'import':
      return 'CSV import'
    default:
      return source
  }
}

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Small debounce so the search field doesn't fire a list query per keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
