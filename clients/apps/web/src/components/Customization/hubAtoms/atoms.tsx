'use client'

/**
 * Shared form atoms for the Space settings surface: Field, Seg (Apple
 * sliding-pill segmented control), and Toggle. Extracted from the retired
 * Community hub — markup/classnames match hub.css verbatim so styling is 1:1.
 */
import * as React from 'react'

const { useState, useRef, useEffect, useCallback } = React

/* ---------- Field ---------- */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/* ---------- Seg (sliding-pill segmented control) ---------- */
export function Seg({
  value,
  options,
  onChange,
  wide,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  wide?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false })
  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const idx = Math.max(0, options.indexOf(value))
    const btn = wrap.querySelectorAll<HTMLElement>('.seg-btn')[idx]
    if (btn)
      setThumb({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true })
  }, [value, options])
  useEffect(() => {
    measure()
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(measure)
    return () => ro.disconnect()
  }, [measure])
  return (
    <div ref={wrapRef} className={`seg-ctl${wide ? ' wide' : ''}`}>
      <span
        className="seg-thumb"
        style={{
          transform: `translateX(${thumb.left}px)`,
          width: thumb.width,
          opacity: thumb.ready ? 1 : 0,
        }}
      />
      {options.map((o) => (
        <button
          key={o}
          className={`seg-btn${value === o ? ' on' : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/* ---------- Toggle ---------- */
export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`tog${on ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
    />
  )
}
