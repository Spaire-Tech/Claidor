'use client'

// HeroPicker — literal clone of the "Choose your hero" design (Hero Picker.html).
// Two poster cards, each a live scaled preview of the actual hero — Marquee
// (cinematic full-bleed) and Cover (editorial). Selection ring + check, a
// fullscreen Preview overlay per option, Back / Continue footer, toast.
//
// The previews render the REAL hero components directly inside a virtual
// 1512×945 frame scaled into each 16:10 poster (same math the design used for
// its iframes) — no iframes, so everything paints instantly with the page:
// image, text and CTAs in the same frame.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CoverHero } from './CoverHero'
import { MarqueeHero } from './MarqueeHero'

export type HeroStyle = 'Marquee' | 'Cover'

const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7'
const PLAY_PATH =
  'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z'

type Option = {
  style: HeroStyle
  name: string
  node: React.ReactNode
}

type Toast = { id: number; msg: string }

export function HeroPicker({
  value,
  onChange,
  onContinue,
  onBack,
}: {
  value?: HeroStyle
  onChange?: (style: HeroStyle) => void
  onContinue?: (style: HeroStyle) => void
  onBack?: () => void
}) {
  const options: Option[] = [
    {
      style: 'Marquee',
      name: 'Marquee',
      // Marquee example — "The Art of Southern Cooking" (dark variant: dark
      // band, white type, white Play, glass Subscribe).
      node: (
        <MarqueeHero
          fill
          instant
          dark
          eyebrow="Documentary Series · Food"
          title={'The Art of\nSouthern Cooking'}
          description="A James Beard–winning chef opens her kitchen and her table — the gravies, the greens, the cornbread, and the slow craft of a Southern meal made from scratch. Shot like a film, taught like Sunday dinner."
          metaLine="Documentary Series · Food  ·  2026  ·  9 Lessons  ·  3h 10m"
          badges={['All Levels', 'Self-paced', 'Recipe cards', 'Mobile & Desktop']}
          instructorName="Della Carter"
          instructorSub="James Beard–winning chef and Lowcountry restaurateur."
          playLabel="Play Lesson 1 Free"
          buyLabel="Subscribe — $89"
          freeLine="3 lessons free · one-time purchase"
          imageUrl="/assets/onboarding/southern-cooking.jpg"
          imagePosition="center 22%"
        />
      ),
    },
    {
      style: 'Cover',
      name: 'Cover',
      // Cover example — "Yoga Foundations" (editorial, teal accent dot).
      node: (
        <CoverHero
          fill
          dotColor="#6fb7c9"
          metaItems={['12 lessons', '4 hr 05 min', 'Beginner']}
          titleLines={['Yoga', 'Foundations']}
          description="Build a home practice from the ground up — breath, alignment, and the handful of poses everything else is built on. Slow, unhurried, and made for the very first mat."
          withByline="Ana Beltrán"
          enrollLabel="Enroll · $69"
          imageUrl="/assets/onboarding/yoga-foundations.jpg"
          imagePosition="center 42%"
        />
      ),
    },
  ]

  // Uncontrolled by default; persists to localStorage like the prototype.
  const [internal, setInternal] = useState<HeroStyle>('Marquee')
  const selected = value ?? internal

  useEffect(() => {
    if (value != null) return
    const stored = window.localStorage.getItem('spaire_hero_style')
    if (stored === 'Marquee' || stored === 'Cover') setInternal(stored)
  }, [value])

  const select = useCallback(
    (style: HeroStyle) => {
      setInternal(style)
      try {
        window.localStorage.setItem('spaire_hero_style', style)
      } catch {
        /* ignore */
      }
      onChange?.(style)
    },
    [onChange],
  )

  // ── scale the live hero frames into their posters (mirrors scaleFrames) ──
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const scaleFrames = () => {
      const root = rootRef.current
      if (!root) return
      root.querySelectorAll<HTMLElement>('.poster').forEach((poster) => {
        const fs = poster.querySelector<HTMLElement>('.frame-scale')
        if (!fs) return
        const s =
          Math.max(poster.clientWidth / 1512, poster.clientHeight / 945) +
          0.0015
        fs.style.transform = `scale(${s})`
      })
    }
    scaleFrames()
    const ro = new ResizeObserver(scaleFrames)
    if (rootRef.current) ro.observe(rootRef.current)
    window.addEventListener('resize', scaleFrames)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', scaleFrames)
    }
  }, [])

  // ── fullscreen preview overlay — both heroes are preloaded & kept warm
  //    for instant open, exactly like the design. ──
  const [previewStyle, setPreviewStyle] = useState<HeroStyle | null>(null)
  const [overlayShown, setOverlayShown] = useState(false)

  const openPreview = useCallback((style: HeroStyle) => {
    setPreviewStyle(style)
    requestAnimationFrame(() => setOverlayShown(true))
  }, [])

  const closePreview = useCallback(() => {
    setOverlayShown(false)
    // keep heroes mounted — just hide
    window.setTimeout(() => setPreviewStyle(null), 300)
  }, [])

  useEffect(() => {
    if (previewStyle == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewStyle, closePreview])

  // ── toast ──
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const toast = useCallback((msg: string) => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400)
  }, [])

  return (
    <div className="hp-root" ref={rootRef}>
      <div className="head">
        <h1>Choose your hero</h1>
        <p>
          Your hero is the first thing students see. <b>Marquee</b> creates a
          cinematic introduction, while <b>Cover</b> puts your title and voice
          front and center.
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
              <div className="poster">
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
                <button
                  className="preview"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPreview(opt.style)
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d={PLAY_PATH} />
                  </svg>
                  Preview
                </button>
              </div>
              <div className="cap">
                <div className="cap-name">{opt.name}</div>
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

      {/* fullscreen preview (both heroes stay mounted & warm) */}
      <div
        className={`overlay${previewStyle ? ' on' : ''}${
          overlayShown ? ' show' : ''
        }`}
      >
        {options.map((opt) => (
          <div
            key={opt.style}
            className={`ov-hero${previewStyle === opt.style ? ' active' : ''}`}
          >
            {opt.node}
          </div>
        ))}
        <div className="ov-bar">
          <button
            className="ov-use"
            type="button"
            onClick={() => {
              if (previewStyle) {
                select(previewStyle)
                const s = previewStyle
                closePreview()
                toast(`${s} selected`)
              }
            }}
          >
            Use this style
          </button>
          <button
            className="ov-close"
            type="button"
            aria-label="Close preview"
            onClick={closePreview}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
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
        .hp-root {
          --ink: #1d1d1f;
          --gray: #86868b;
          --line: #e8e8ed;
          --purple: #6a4dd8;
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
          justify-content: center;
          padding: 48px 32px;
        }
        /* Neutralize UA button chrome only — no background/color here (would
           clobber .continue / .preview / .ov-use / .ov-close fills). The
           outline .back button declares its own background: none. */
        .hp-root :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
        }

        /* header */
        .head {
          text-align: center;
          margin-bottom: 56px;
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
          max-width: 600px;
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
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 32px;
          width: 100%;
          max-width: 1080px;
        }
        .card {
          cursor: pointer;
        }
        .poster {
          position: relative;
          aspect-ratio: 16 / 10;
          border-radius: 20px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.18),
            0 1px 3px rgba(0, 0, 0, 0.05);
          transition: transform 0.32s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.32s;
        }
        .card:hover .poster {
          transform: translateY(-4px);
          box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.28),
            0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .card.sel .poster {
          transform: scale(1.045);
          box-shadow: 0 26px 60px -22px rgba(0, 0, 0, 0.34),
            0 2px 6px rgba(0, 0, 0, 0.06);
        }
        .card.sel:hover .poster {
          transform: scale(1.045) translateY(-4px);
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 20px;
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
          width: 1512px;
          height: 945px;
          transform-origin: top left;
        }
        .frame-scale {
          pointer-events: none;
        }
        .frame-scale > :global(*) {
          width: 1512px;
          height: 945px;
        }
        .check {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 5;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(20, 20, 24, 0.34);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow: none;
          display: grid;
          place-items: center;
          color: #fff;
          opacity: 0;
          transform: scale(0.8);
          transition: opacity 0.2s,
            transform 0.2s cubic-bezier(0.3, 1.4, 0.4, 1), background 0.2s;
        }
        .card.sel .check {
          opacity: 1;
          transform: none;
          background: #fff;
          color: var(--ink);
          box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.12);
        }
        .preview {
          position: absolute;
          right: 16px;
          bottom: 16px;
          z-index: 5;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          background: rgba(20, 20, 24, 0.46);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          backdrop-filter: blur(18px) saturate(160%);
          padding: 10px 17px;
          border-radius: 980px;
          box-shadow: none;
          transition: background 0.18s, transform 0.18s;
        }
        .preview:hover {
          background: rgba(40, 40, 46, 0.72);
          transform: scale(1.03);
        }

        /* caption */
        .cap {
          padding: 22px 6px 0;
        }
        .cap-name {
          font-family: var(--po);
          font-size: 23px;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        /* footer */
        .foot {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 60px;
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

        /* fullscreen preview */
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: #000;
          display: none;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .overlay.on {
          display: block;
        }
        .overlay.show {
          opacity: 1;
        }
        .overlay :global(.ov-hero) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s;
        }
        .overlay :global(.ov-hero.active) {
          opacity: 1;
          pointer-events: auto;
        }
        .ov-bar {
          position: fixed;
          top: 22px;
          right: 22px;
          z-index: 110;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .ov-use {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 500;
          color: #1d1d1f;
          background: rgba(255, 255, 255, 0.92);
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          padding: 11px 22px;
          border-radius: 980px;
          box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.5);
          transition: transform 0.16s;
        }
        .ov-use:hover {
          transform: scale(1.04);
        }
        .ov-close {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(40, 40, 46, 0.6);
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          box-shadow: none;
          transition: background 0.16s, transform 0.16s;
        }
        .ov-close:hover {
          background: rgba(60, 60, 68, 0.85);
          transform: scale(1.05);
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
          animation: hp-tin 0.3s cubic-bezier(0.2, 1.1, 0.3, 1);
        }
        .toast .tk {
          color: var(--ink);
          display: grid;
          place-items: center;
        }
        @keyframes hp-tin {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
        }

        @media (max-width: 800px) {
          .hp-root {
            padding: 56px 20px 48px;
          }
          .cards {
            grid-template-columns: 1fr;
            max-width: 520px;
            gap: 28px;
          }
        }
      `}</style>
    </div>
  )
}

export default HeroPicker
