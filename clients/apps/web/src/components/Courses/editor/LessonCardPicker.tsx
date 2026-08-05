'use client'

// LessonCardPicker — literal clone of the "Choose your lesson card" design
// (Lesson Card Picker.html). Two fixed 380×362 tiles, each a live scaled
// preview of the real card: Spotlight (title over the image) and Catalog
// (details below the image). Selection scales the tile 1.045, ring + check,
// Back / Continue footer, toast. The whole picker zooms down to fit the
// viewport (fitZoom).
//
// The previews render the REAL card components directly inside the tile (no
// iframes), so they paint instantly with the page — no black/white loading
// flash while an embed route boots.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CatalogCard } from './CatalogCard'
import { SpotlightLessonCard } from './SpotlightLessonCard'

export type LessonCardStyle = 'Spotlight' | 'Catalog'

const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7'

type Option = {
  style: LessonCardStyle
  node: React.ReactNode
  /** Base tile colour behind the card (matches the card's own background). */
  tileBg: string
}

type Toast = { id: number; msg: string }

export function LessonCardPicker({
  value,
  onChange,
  onContinue,
  onBack,
}: {
  value?: LessonCardStyle
  onChange?: (style: LessonCardStyle) => void
  onContinue?: (style: LessonCardStyle) => void
  onBack?: () => void
}) {
  const options: Option[] = [
    {
      style: 'Spotlight',
      // Spotlight example — "Lesson 9 · Constructing the Point".
      node: (
        <SpotlightLessonCard
          imageUrl="/assets/onboarding/spotlight-tennis.jpg"
          imagePosition="center 22%"
        />
      ),
      tileBg: '#0a0807',
    },
    {
      style: 'Catalog',
      // Catalog example — dark variant (Lesson Card B.html).
      node: <CatalogCard dark />,
      tileBg: '#1a1a1c',
    },
  ]

  const [internal, setInternal] = useState<LessonCardStyle>('Spotlight')
  const selected = value ?? internal

  useEffect(() => {
    if (value != null) return
    const stored = window.localStorage.getItem('spaire_lesson_style')
    if (stored === 'Spotlight' || stored === 'Catalog') setInternal(stored)
  }, [value])

  const select = useCallback(
    (style: LessonCardStyle) => {
      setInternal(style)
      try {
        window.localStorage.setItem('spaire_lesson_style', style)
      } catch {
        /* ignore */
      }
      onChange?.(style)
    },
    [onChange],
  )

  const rootRef = useRef<HTMLDivElement | null>(null)

  // Scale each 380×362 card to fill its tile — native (no transform) near
  // 1:1 so the card's backdrop-filter blur renders cleanly.
  const scaleFrames = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
      const fs = tile.querySelector<HTMLElement>('.frame-scale')
      if (!fs) return
      const s = tile.clientWidth / 380
      fs.style.transform = Math.abs(s - 1) < 0.012 ? 'none' : `scale(${s})`
    })
  }, [])

  // Zoom the whole picker down so it always fits the viewport without
  // clipping. Uses `zoom` on the root (not transform) so the cards stay 1:1
  // internally and their backdrop-filter blur keeps rendering.
  const fitZoom = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    root.style.zoom = '1'
    const h = root.scrollHeight
    const avail = window.innerHeight
    const z = Math.max(0.7, Math.min(1, (avail - 8) / h))
    root.style.zoom = z.toFixed(3)
  }, [])

  useEffect(() => {
    const run = () => {
      fitZoom()
      scaleFrames()
    }
    run()
    window.addEventListener('resize', run)
    const ro = new ResizeObserver(run)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => {
      window.removeEventListener('resize', run)
      ro.disconnect()
    }
  }, [fitZoom, scaleFrames])

  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const toast = useCallback((msg: string) => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400)
  }, [])

  return (
    <div className="lcp-root" ref={rootRef}>
      <div className="head">
        <h1>Choose your lesson card</h1>
        <p>
          This is how lessons appear in your course. <b>Spotlight</b> overlays
          the title on the image, while <b>Catalog</b> keeps details organized
          below.
        </p>
      </div>

      <div className="cards">
        {options.map((opt) => {
          const isSel = selected === opt.style
          return (
            <div
              key={opt.style}
              className={`card${isSel ? ' sel' : ''}`}
              onClick={() => select(opt.style)}
            >
              <div className="tile" style={{ background: opt.tileBg }}>
                <div className="frame-scale" aria-hidden>
                  {opt.node}
                </div>
                <div className="ring" />
                <div className="check">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={CHECK_PATH} />
                  </svg>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="foot">
        <button className="back" type="button" onClick={() => onBack?.()}>
          Back
        </button>
        <button
          className="continue"
          type="button"
          onClick={() =>
            onContinue
              ? onContinue(selected)
              : toast(`Continuing with ${selected}`)
          }
        >
          Continue
        </button>
      </div>

      <div className="toastwrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span className="tk">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20" />
                <path d="M7.7 12.2l2.8 2.8 5.6-5.6" />
              </svg>
            </span>
            {t.msg}
          </div>
        ))}
      </div>

      <style jsx>{`
        .lcp-root {
          --ink: #1d1d1f;
          --gray: #86868b;
          --line: #e8e8ed;
          --panel: #f0f0f3;
          --bg: #ffffff;
          --sf: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            'SF Pro Text', system-ui, sans-serif;
          --po: var(--font-poppins), -apple-system, BlinkMacSystemFont,
            system-ui, sans-serif;
          font-family: var(--sf);
          background: var(--bg);
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.01em;
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: safe center;
          padding: 44px 32px;
        }
        /* Neutralize UA button chrome only — must not set background/color
           (would clobber .continue / .back). */
        .lcp-root :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
        }

        /* header */
        .head {
          text-align: center;
          margin-bottom: 52px;
        }
        .head h1 {
          font-family: var(--po);
          font-size: clamp(34px, 4vw, 52px);
          font-weight: 600;
          letter-spacing: -0.03em;
          line-height: 1.05;
        }
        .head p {
          font-size: 19px;
          line-height: 1.5;
          color: var(--gray);
          font-weight: 400;
          margin-top: 16px;
          max-width: 620px;
          margin-left: auto;
          margin-right: auto;
        }
        .head p :global(b) {
          color: var(--ink);
          font-weight: 500;
        }

        /* cards */
        .cards {
          display: grid;
          grid-template-columns: repeat(2, 380px);
          justify-content: center;
          gap: 72px;
        }
        .card {
          cursor: pointer;
        }
        .tile {
          position: relative;
          aspect-ratio: 380 / 362;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.22);
          transition: transform 0.32s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.32s;
        }
        .card:hover .tile {
          transform: translateY(-4px);
          box-shadow: 0 20px 44px -18px rgba(0, 0, 0, 0.3);
        }
        .card.sel .tile {
          transform: scale(1.045);
          box-shadow: 0 26px 60px -22px rgba(0, 0, 0, 0.34),
            0 2px 6px rgba(0, 0, 0, 0.06);
        }
        .card.sel:hover .tile {
          transform: scale(1.045) translateY(-4px);
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          pointer-events: none;
          z-index: 4;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
          transition: box-shadow 0.22s;
        }
        .card.sel .ring {
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
        }
        .frame-scale {
          position: absolute;
          top: 0;
          left: 0;
          width: 380px;
          height: 362px;
          transform-origin: top left;
          pointer-events: none;
        }
        .frame-scale > :global(*) {
          width: 380px;
          height: 362px;
        }
        .check {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 5;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.78);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.18);
          display: grid;
          place-items: center;
          color: var(--ink);
          opacity: 0;
          transform: scale(0.8);
          transition: opacity 0.2s,
            transform 0.2s cubic-bezier(0.3, 1.4, 0.4, 1), background 0.2s,
            box-shadow 0.2s;
        }
        .card.sel .check {
          opacity: 1;
          transform: none;
          background: #fff;
          color: var(--ink);
          box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.12);
        }

        /* footer */
        .foot {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 52px;
        }
        .continue {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: var(--ink);
          color: #fff;
          font-size: 17px;
          font-weight: 500;
          padding: 15px 40px;
          border-radius: 980px;
          transition: transform 0.16s, background 0.16s;
        }
        .continue:hover {
          transform: scale(1.025);
          background: #000;
        }
        .continue:active {
          transform: scale(0.98);
        }
        .back {
          font-size: 17px;
          font-weight: 500;
          color: var(--ink);
          background: none;
          padding: 15px 34px;
          border-radius: 980px;
          box-shadow: inset 0 0 0 1px var(--line);
          transition: background 0.16s, transform 0.16s;
        }
        .back:hover {
          background: #f5f5f7;
          transform: scale(1.025);
        }
        .back:active {
          transform: scale(0.98);
        }

        /* toast */
        .toastwrap {
          position: fixed;
          left: 50%;
          bottom: 36px;
          transform: translateX(-50%);
          z-index: 200;
          pointer-events: none;
        }
        .toast {
          background: rgba(28, 28, 30, 0.9);
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          color: #fff;
          padding: 13px 22px;
          border-radius: 980px;
          font-size: 15px;
          font-weight: 500;
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          gap: 9px;
          animation: lcp-tin 0.3s cubic-bezier(0.2, 1.1, 0.3, 1);
        }
        .toast .tk {
          color: var(--ink);
          display: grid;
          place-items: center;
        }
        @keyframes lcp-tin {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
        }

        @media (max-width: 820px) {
          .lcp-root {
            padding: 40px 20px;
          }
          .cards {
            grid-template-columns: minmax(0, 380px);
            gap: 28px;
          }
        }
      `}</style>
    </div>
  )
}

export default LessonCardPicker
