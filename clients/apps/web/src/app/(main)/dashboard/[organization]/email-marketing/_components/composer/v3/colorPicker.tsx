'use client'

// Brick 9 — full HSV colour picker.
//
// The user's design ships the `.color-pop` / `cp-*` CSS but no JS, so the HSV
// engine here is ours, wired to those exact classes: an SV plane (drag), a hue
// slider (drag), a live hex field, the native EyeDropper (when available) and
// preset chips. Used by the format bubble (text colour) and the inspector
// (button background / text colour). Returns lowercase #rrggbb via onChange.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { COLOR_PRESETS } from './colorMark'

// ── colour maths (no deps) ────────────────────────────────────────────────
export type HSV = { h: number; s: number; v: number } // h 0–360, s/v 0–1
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export const hsvToHex = (hsv: HSV) => rgbToHex(...hsvToRgb(hsv))
export const hexToHsv = (hex: string): HSV | null => {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsv(...rgb) : null
}

// ── component ─────────────────────────────────────────────────────────────
type Anchor = { top: number; left: number }

export function ColorPicker({
  value,
  onChange,
  onClear,
  onClose,
  anchor,
  presets = COLOR_PRESETS,
}: {
  value: string | null
  onChange: (hex: string) => void
  onClear?: () => void
  onClose: () => void
  anchor: Anchor
  presets?: string[]
}) {
  // HSV is the source of truth while the picker is open (so dragging the SV
  // plane at zero saturation doesn't lose the hue). Seed from the value once.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value ?? '') ?? { h: 210, s: 0.7, v: 0.9 })
  const [hexField, setHexField] = useState(() => (value ?? hsvToHex(hsv)).toUpperCase().replace('#', ''))
  const popRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Anchor>(anchor)

  const hex = hsvToHex(hsv)

  // Keep the hex field in sync when the swatch maths change it (drag/eyedrop),
  // but don't fight the user mid-type (handled by the input's own onChange).
  const commit = (next: HSV) => {
    setHsv(next)
    const h = hsvToHex(next)
    setHexField(h.replace('#', '').toUpperCase())
    onChange(h)
  }

  // Clamp the popover into the viewport after it mounts (we know its size then).
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    const left = clamp(anchor.left, pad, window.innerWidth - r.width - pad)
    const top = clamp(anchor.top, pad, window.innerHeight - r.height - pad)
    setPos({ top, left })
  }, [anchor.left, anchor.top])

  // Dismiss on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the opening click doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown, true)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // ── drag helpers ──
  const dragSV = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = clamp((clientX - r.left) / r.width, 0, 1)
    const v = 1 - clamp((clientY - r.top) / r.height, 0, 1)
    commit({ ...hsv, s, v })
  }
  const dragHue = (clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const h = clamp((clientX - r.left) / r.width, 0, 1) * 360
    commit({ ...hsv, h })
  }
  const startDrag = (
    move: (x: number, y: number) => void,
    e: React.PointerEvent,
  ) => {
    e.preventDefault()
    move(e.clientX, e.clientY)
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onHexInput = (raw: string) => {
    const v = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    setHexField(v.toUpperCase())
    const next = hexToHsv(v)
    if (next && (v.length === 6 || v.length === 3)) {
      setHsv(next)
      onChange('#' + v.toLowerCase())
    }
  }

  const eyedropper = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ED = (window as any).EyeDropper
    if (!ED) return
    try {
      const { sRGBHex } = await new ED().open()
      const next = hexToHsv(sRGBHex)
      if (next) commit(next)
    } catch {
      /* user cancelled */
    }
  }

  const hueColor = `hsl(${hsv.h}, 100%, 50%)`

  return (
    <div
      ref={popRef}
      className="color-pop"
      data-testid="color-pop"
      style={{ top: pos.top, left: pos.left }}
      // keep the editor's text selection alive while interacting
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
      }}
    >
      {/* SV plane */}
      <div
        ref={svRef}
        className="cp-sv"
        data-testid="cp-sv"
        style={{
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hueColor}`,
        }}
        onPointerDown={(e) => startDrag(dragSV, e)}
      >
        <span
          className="cp-knob"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hex,
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="cp-hue"
        data-testid="cp-hue"
        onPointerDown={(e) => startDrag(dragHue, e)}
      >
        <span className="cp-hknob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>

      {/* Footer: preview · hex · eyedropper */}
      <div className="cp-foot">
        <span className="cp-prev" style={{ background: hex }} />
        <div className="cp-hexwrap">
          <span className="cp-hash">#</span>
          <input
            className="cp-hex"
            data-testid="cp-hex"
            value={hexField}
            spellCheck={false}
            onChange={(e) => onHexInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onClose()
            }}
          />
        </div>
        {typeof window !== 'undefined' &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'EyeDropper' in (window as any) && (
            <button
              className="cp-eye"
              data-testid="cp-eye"
              title="Pick from screen"
              onMouseDown={(e) => e.preventDefault()}
              onClick={eyedropper}
            >
              <svg
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 3a2.83 2.83 0 0 1 0 4l-9 9-4 1 1-4 9-9a2.83 2.83 0 0 1 3 0z" />
                <path d="M9 13l-5 5" />
              </svg>
            </button>
          )}
      </div>

      {/* Presets */}
      <div className="cp-presets">
        {presets.map((c) => (
          <button
            key={c}
            className={'cp-chip' + (hex === c ? ' on' : '')}
            style={{ background: c }}
            data-swatch={c}
            title={c}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const next = hexToHsv(c)
              if (next) commit(next)
            }}
          />
        ))}
        {onClear && (
          <button
            className="cp-chip cp-none"
            data-swatch="none"
            title="No colour"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClear}
          />
        )}
      </div>
    </div>
  )
}
