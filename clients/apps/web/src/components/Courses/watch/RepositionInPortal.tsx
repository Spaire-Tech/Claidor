'use client'

// RepositionInPortal — opens the cover image AS IT APPEARS in the portal
// HERO (the now-playing marquee at the top of the customer watch page), so
// the creator sets the focal point against the real surface their students
// see, not a generic 16:9 tile or a small lesson card. Drag the image to
// reposition; Replace swaps it; Save persists and returns to the editor.
//
// The host owns persistence: onReposition(pos) is fired live during the
// drag (debounced PATCH of thumbnail_object_position upstream) and onReplace
// hands back the picked File (host uploads + returns the new URL).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function parsePos(p?: string | null): { x: number; y: number } {
  const m = /([\d.]+)%\s+([\d.]+)%/.exec(p ?? '')
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 }
}

export function RepositionInPortal({
  imageUrl,
  position,
  title,
  lessonLabel,
  description,
  instructorName,
  busy,
  onReposition,
  onReplace,
  onClose,
}: {
  imageUrl: string | null
  position?: string | null
  title: string
  lessonLabel: string
  description?: string | null
  /** Instructor name shown in the hero byline, mirroring the portal. */
  instructorName?: string | null
  /** True while a replacement upload is in flight. */
  busy?: boolean
  onReposition: (pos: string) => void
  onReplace: (file: File) => void
  onClose: () => void
}) {
  const [pos, setPos] = useState(() => parsePos(position))
  // Render into document.body. The overlay is position:fixed, but in the
  // landing editor each lesson card sits inside an ancestor with a CSS
  // transform (hover scale) + overflow:hidden — which makes fixed children
  // position/clip against that tiny card instead of the viewport, trapping
  // this modal. Portaling to body escapes any transformed/clipped ancestor.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const tileRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{
    x: number
    y: number
    px: number
    py: number
  } | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const onDown = (e: React.PointerEvent) => {
    if (!imageUrl) return
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    tileRef.current?.classList.add('dragging')
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const tile = tileRef.current
    if (!d || !tile) return
    const r = tile.getBoundingClientRect()
    const nx = Math.max(0, Math.min(100, d.px - ((e.clientX - d.x) / r.width) * 100))
    const ny = Math.max(0, Math.min(100, d.py - ((e.clientY - d.y) / r.height) * 100))
    setPos({ x: nx, y: ny })
  }
  const onUp = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    tileRef.current?.classList.remove('dragging')
    setPos((p) => {
      onReposition(`${p.x.toFixed(1)}% ${p.y.toFixed(1)}%`)
      return p
    })
  }, [onReposition])

  const pickReplace = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) onReplace(f)
    }
    input.click()
  }

  if (!mounted) return null

  return createPortal(
    <div
      className="rip-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reposition in portal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rip-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rip-head">
          <div>
            <div className="rip-eyebrow">{lessonLabel}</div>
            <div className="rip-title">How it looks in the portal</div>
          </div>
          <button className="rip-x" type="button" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="rip-stage">
          {/* A faithful slice of the portal hero — the now-playing marquee
              at the top of the watch page — so the focal point is set
              against the real cover, not a card. */}
          <div
            ref={tileRef}
            className={`rip-hero${imageUrl ? '' : ' ph'}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div
              className="rip-img"
              style={
                imageUrl
                  ? {
                      backgroundImage: `url("${imageUrl}")`,
                      backgroundPosition: `${pos.x}% ${pos.y}%`,
                    }
                  : undefined
              }
            />
            <div className="rip-hero-scrim" />
            <div className="rip-hero-info">
              <div className="rip-num">{lessonLabel}</div>
              <div className="rip-hero-title">{title}</div>
              {description && <div className="rip-desc">{description}</div>}
              <div className="rip-hero-cta">
                <span className="rip-hero-play">▶ Play</span>
                <span className="rip-hero-overview">Overview</span>
                {instructorName && (
                  <span className="rip-hero-byline">
                    Instructor · {instructorName}
                  </span>
                )}
              </div>
            </div>
            {imageUrl && <div className="rip-hint">✛ Drag to reposition</div>}
          </div>
        </div>

        <div className="rip-actions">
          <button className="rip-ghost" type="button" onClick={pickReplace} disabled={busy}>
            {busy ? 'Uploading…' : imageUrl ? 'Replace image' : 'Add image'}
          </button>
          <button className="rip-save" type="button" onClick={onClose}>
            Save &amp; return
          </button>
        </div>
      </div>

      <style jsx global>{`
        .rip-overlay {
          position: fixed;
          inset: 0;
          z-index: 600;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(8, 8, 10, 0.6);
          -webkit-backdrop-filter: blur(20px) saturate(120%);
          backdrop-filter: blur(20px) saturate(120%);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            system-ui, sans-serif;
        }
        .rip-sheet {
          width: min(760px, 100%);
          background: #1b1b1f;
          color: #f5f5f7;
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 50px 100px rgba(0, 0, 0, 0.5);
        }
        .rip-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px 14px;
        }
        .rip-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(245, 245, 247, 0.5);
        }
        .rip-title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-top: 3px;
        }
        .rip-x {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(245, 245, 247, 0.1);
          color: #f5f5f7;
          border: none;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .rip-x:hover {
          background: rgba(245, 245, 247, 0.2);
        }
        .rip-stage {
          padding: 6px 22px 4px;
        }
        /* The hero slice — 16/9 of the full-bleed portal marquee. */
        .rip-hero {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 16px;
          overflow: hidden;
          background: #111;
          touch-action: none;
          cursor: grab;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }
        .rip-hero.dragging {
          cursor: grabbing;
        }
        .rip-img {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: 50% 50%;
        }
        .rip-hero.ph .rip-img {
          background: radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
            radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
            radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
            #57544e;
        }
        .rip-hero-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.82) 0%,
            rgba(0, 0, 0, 0.34) 42%,
            rgba(0, 0, 0, 0.08) 72%
          );
        }
        .rip-hero-brand {
          position: absolute;
          top: 16px;
          left: 18px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.86);
          pointer-events: none;
        }
        .rip-hero-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ff4d4f;
        }
        .rip-hero-info {
          position: relative;
          z-index: 2;
          padding: 0 22px 20px;
          pointer-events: none;
        }
        .rip-num {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(235, 235, 245, 0.72);
        }
        .rip-hero-title {
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.05;
          color: #fff;
          margin-top: 4px;
        }
        .rip-desc {
          font-size: 13px;
          line-height: 1.45;
          color: rgba(235, 235, 245, 0.78);
          margin-top: 7px;
          max-width: 60%;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rip-hero-cta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 14px;
        }
        .rip-hero-play {
          font-size: 13px;
          font-weight: 600;
          color: #141416;
          background: #f5f5f7;
          padding: 8px 18px;
          border-radius: 980px;
        }
        .rip-hero-overview {
          font-size: 13px;
          font-weight: 600;
          color: #f5f5f7;
          background: rgba(255, 255, 255, 0.16);
          padding: 8px 16px;
          border-radius: 980px;
        }
        .rip-hero-byline {
          font-size: 12px;
          color: rgba(235, 235, 245, 0.6);
          margin-left: 4px;
        }
        .rip-hint {
          position: absolute;
          right: 12px;
          top: 12px;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 12px;
          border-radius: 980px;
          background: rgba(10, 11, 13, 0.55);
          color: rgba(255, 255, 255, 0.92);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }
        .rip-actions {
          display: flex;
          gap: 10px;
          padding: 16px 22px 20px;
        }
        .rip-ghost {
          flex: 1;
          height: 44px;
          border-radius: 980px;
          background: rgba(245, 245, 247, 0.1);
          color: #f5f5f7;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .rip-ghost:hover {
          background: rgba(245, 245, 247, 0.18);
        }
        .rip-ghost:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .rip-save {
          flex: 1;
          height: 44px;
          border-radius: 980px;
          background: #f5f5f7;
          color: #141416;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .rip-save:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>,
    document.body,
  )
}

export default RepositionInPortal
