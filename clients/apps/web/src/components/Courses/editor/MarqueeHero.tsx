'use client'

// MarqueeHero — literal clone of the latest "Marquee Hero.html" design (The
// Golfer's Blueprint). Full-bleed cinematic still with a slow Ken Burns zoom,
// a diagonal scrim, film grain, a low-anchored title, and a frosted control
// band that FADES INTO the page background (light or dark variant). The band
// is a 3-column grid: actions (play / buy / free line) · description (text +
// meta + badges + trailer) · instructor.
//
// CSS is a faithful port of the source stylesheet scoped via styled-jsx. The
// prop API drives real course data through the same slots; defaults reproduce
// the design sample. `fill` sizes to the parent (picker tiles) instead of the
// viewport; `dark` + `bg` control the band fade colour.

import { useCallback, useRef, useState } from 'react'

const PLAY_PATH =
  'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z'

// Dark cinematic fallback when no hero image is provided. Never a remote
// stock photo (CSP-blocked, and wrong on a real Original).
const FALLBACK_ART =
  'radial-gradient(120% 120% at 30% 20%, #1b1d22 0%, #0c0d10 60%, #060708 100%)'

type Toast = { id: number; msg: string }

export type MarqueeHeroProps = {
  brand?: string
  eyebrow?: string
  title?: string
  description?: string
  metaLine?: string
  badges?: string[]
  instructorName?: string
  instructorSub?: string
  playLabel?: string
  buyLabel?: string
  freeLine?: string
  /** When absent, a dark cinematic gradient renders instead of a photo. */
  imageUrl?: string | null
  /** background-position for the photo (design: 'center 18%'). */
  imagePosition?: string
  showTrailer?: boolean
  /** Hide the buy button + free line (enrolled portal — nothing to buy). */
  hideBuy?: boolean
  /** Size to the parent container instead of the viewport (picker tiles). */
  fill?: boolean
  /** Skip the rise-in entrance animation — everything paints immediately
   *  (used in the hero picker, where the design must appear all at once). */
  instant?: boolean
  /** Dark band variant — band fades dark and its text goes white. */
  dark?: boolean
  /** Page background the band fades into (defaults per light/dark). */
  bg?: string
  onPlay?: () => void
  onBuy?: () => void
  onTrailer?: () => void
}

export function MarqueeHero({
  brand = '',
  eyebrow = 'Documentary Series · Golf',
  title = 'The Golfer’s Blueprint',
  description = 'A two-time major champion takes you inside the scoring game — the swing, the short game, and the mind that wins the shots that matter. Shot like a film, taught like a private lesson.',
  metaLine = 'Documentary Series · Golf  ·  2026  ·  12 Episodes  ·  4h 15m',
  badges = ['All Levels', 'Self-paced', 'Captions', 'Mobile & Desktop'],
  instructorName = 'Jack Reeves',
  instructorSub = 'Two-time major champion and former world No. 1.',
  playLabel = 'Play Episode 1 Free',
  buyLabel = 'Subscribe — $89',
  freeLine = 'First 3 episodes free · cancel anytime',
  imageUrl = null,
  imagePosition = 'center 18%',
  showTrailer = true,
  hideBuy = false,
  fill = false,
  instant = false,
  dark = false,
  bg,
  onPlay,
  onBuy,
  onTrailer,
}: MarqueeHeroProps = {}) {
  // When `instant`, drop the `rise` class so nothing animates in — the whole
  // hero is present on first paint (the `d1`/`d2` delays are inert without it).
  const rise = instant ? '' : ' rise'
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const toast = useCallback((msg: string) => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 2600)
  }, [])

  const rootStyle: React.CSSProperties = {
    ...(fill ? { width: '100%', height: '100%', minHeight: 0 } : {}),
    ...(bg ? ({ ['--bg' as string]: bg } as React.CSSProperties) : {}),
  }

  return (
    <header
      className={`panel${dark ? ' dark' : ''}`}
      data-screen-label="Marquee Hero"
      style={rootStyle}
    >
      <div
        className="panel-art"
        style={
          imageUrl
            ? {
                background: `url('${imageUrl}') ${imagePosition} / cover no-repeat`,
              }
            : { background: FALLBACK_ART, animation: 'none' }
        }
      />
      <div className="panel-scrim" />
      <div className="panel-grain" />

      {brand ? <div className={`panel-brand${rise}`}>{brand}</div> : null}

      <div className="panel-title">
        <div className={`pt-eyebrow${rise} d1`}>{eyebrow}</div>
        <h1 className={`pt-h${rise} d1`}>
          {title.includes('\n')
            ? // Explicit line breaks (e.g. "The Art of\nSouthern Cooking"):
              // each line is its own non-wrapping block so it lands on exactly
              // one line, ignoring pt-h's max-width — no stray third line.
              title.split('\n').map((line, i) => (
                <span
                  key={i}
                  style={{ display: 'block', whiteSpace: 'nowrap' }}
                >
                  {line}
                </span>
              ))
            : title}
        </h1>
      </div>

      <div className={`band${rise} d2`}>
        <div className="band-actions">
          <button
            className="abtn play"
            type="button"
            onClick={() =>
              onPlay ? onPlay() : toast('Playing free preview · Introduction')
            }
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d={PLAY_PATH} />
            </svg>
            {playLabel}
          </button>
          {!hideBuy && (
            <button
              className="abtn buy"
              type="button"
              onClick={() =>
                onBuy ? onBuy() : toast('Redirecting to secure checkout…')
              }
            >
              {buyLabel}
            </button>
          )}
          {freeLine ? <div className="band-free">{freeLine}</div> : null}
        </div>

        <div className="band-desc">
          <p className="bd-text">{description}</p>
          <div className="bd-meta">{metaLine}</div>
          <div className="bd-badges">
            {badges.map((b, i) => (
              <span key={b} className={`bdg${i === 0 ? ' rate' : ''}`}>
                {b}
              </span>
            ))}
            {showTrailer && (
              <button
                className="bd-trailer"
                type="button"
                onClick={() =>
                  onTrailer ? onTrailer() : toast('Loading trailer · 2:18')
                }
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d={PLAY_PATH} />
                </svg>
                Trailer
              </button>
            )}
          </div>
        </div>

        <div className="band-cast">
          <div className="bc-k">Instructor</div>
          <div className="bc-v">{instructorName}</div>
          <div className="bc-sub">{instructorSub}</div>
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.msg}
          </div>
        ))}
      </div>

      <style jsx>{`
        /* ============================================================
           MARQUEE HERO — standalone, no frameworks.
           ============================================================ */
        .panel {
          --bg: #ffffff;
          --band: 255, 255, 255;
          --bt: #1d1d1f; /* band text */
          --bt2: rgba(0, 0, 0, 0.56);
          --bt3: rgba(0, 0, 0, 0.4);
          --ink: #07080a;
          --sf: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            'SF Pro Text', system-ui, sans-serif;
          --gut: 64px;
          position: relative;
          width: 100%;
          height: 100vh;
          min-height: 560px;
          overflow: hidden;
          background: var(--ink);
          font-family: var(--sf);
          letter-spacing: -0.014em;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .panel.dark {
          --bg: #141416;
          --band: 20, 20, 22;
          --bt: #f5f5f7;
          --bt2: rgba(245, 245, 247, 0.65);
          --bt3: rgba(245, 245, 247, 0.45);
        }
        .panel :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
          background: none;
          color: inherit;
        }

        /* ── panel ── */
        .panel-art {
          position: absolute;
          inset: 0;
          transform: scale(1.04);
          animation: mq-kb 26s ease-out forwards;
        }
        @keyframes mq-kb {
          to {
            transform: scale(1.13);
          }
        }
        .panel-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            115deg,
            rgba(0, 0, 0, 0.55) 0%,
            rgba(0, 0, 0, 0.16) 40%,
            transparent 62%
          );
        }
        .panel-grain {
          position: absolute;
          inset: 0;
          opacity: 0.05;
          pointer-events: none;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .panel-brand {
          position: absolute;
          left: var(--gut);
          top: 32px;
          z-index: 4;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.4);
        }

        /* ── title ── */
        .panel-title {
          position: absolute;
          left: var(--gut);
          right: var(--gut);
          bottom: 286px;
          z-index: 4;
        }
        .pt-eyebrow {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 16px;
          text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
        }
        .pt-h {
          font-size: clamp(52px, 6vw, 92px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 0.9;
          max-width: 13ch;
          color: #fff;
          text-shadow: 0 4px 50px rgba(0, 0, 0, 0.4);
        }

        /* ── frosted control band — fades into --bg ── */
        .band {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 5;
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr) 280px;
          gap: 52px;
          align-items: start;
          padding: 88px var(--gut) 46px;
          -webkit-backdrop-filter: blur(32px) saturate(140%);
          backdrop-filter: blur(32px) saturate(140%);
          background: linear-gradient(
            0deg,
            rgba(var(--band), 0.97) 30%,
            rgba(var(--band), 0.82) 58%,
            rgba(var(--band), 0.45) 82%,
            rgba(var(--band), 0) 100%
          );
          -webkit-mask-image: linear-gradient(0deg, #000 80%, transparent 100%);
          mask-image: linear-gradient(0deg, #000 80%, transparent 100%);
          color: var(--bt);
        }
        .band-actions {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        .abtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          height: 54px;
          border-radius: 13px;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition: transform 0.16s cubic-bezier(0.2, 1.2, 0.3, 1),
            background 0.16s;
        }
        .abtn:active {
          transform: scale(0.975);
        }
        .abtn.play {
          background: var(--bt);
          color: var(--bg);
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.18);
        }
        .abtn.play:hover {
          transform: translateY(-1px);
        }
        .abtn.buy {
          background: rgba(var(--band), 0.55);
          color: var(--bt);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          backdrop-filter: blur(20px) saturate(160%);
          box-shadow: inset 0 0 0 1px var(--bt3);
        }
        .abtn.buy:hover {
          transform: translateY(-1px);
        }
        .panel.dark .abtn.buy {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          box-shadow: none;
        }
        .panel.dark .abtn.buy:hover {
          background: rgba(255, 255, 255, 0.24);
        }
        .panel.dark .bdg {
          background: rgba(255, 255, 255, 0.12);
        }
        .panel.dark .bdg.rate {
          background: transparent;
          box-shadow: none;
        }
        .band-free {
          font-size: 14px;
          font-weight: 500;
          color: var(--bt2);
          text-align: center;
          margin-top: 4px;
        }

        .band-desc {
          padding-top: 3px;
        }
        .bd-text {
          font-size: 19px;
          line-height: 1.5;
          font-weight: 400;
          color: var(--bt);
          max-width: 58ch;
        }
        .bd-meta {
          font-size: 15px;
          font-weight: 500;
          color: var(--bt2);
          margin-top: 16px;
        }
        .bd-badges {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .bdg {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--bt2);
          background: rgba(125, 125, 135, 0.16);
          border-radius: 6px;
          padding: 4px 9px;
        }
        .bdg.rate {
          background: transparent;
          box-shadow: inset 0 0 0 1.5px var(--bt3);
        }
        .bd-trailer {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 14px;
          font-weight: 600;
          color: var(--bt);
          padding: 4px 6px;
          margin-left: 3px;
        }

        .band-cast {
          padding-top: 3px;
        }
        .bc-k {
          font-size: 13px;
          font-weight: 600;
          color: var(--bt3);
          margin-bottom: 6px;
        }
        .bc-v {
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--bt);
        }
        .bc-sub {
          font-size: 15px;
          line-height: 1.45;
          color: var(--bt2);
          margin-top: 5px;
        }

        /* ── entrance ── */
        .rise {
          opacity: 0;
          transform: translateY(22px);
          animation: mq-rise 1s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .rise.d1 {
          animation-delay: 0.15s;
        }
        .rise.d2 {
          animation-delay: 0.35s;
        }
        @keyframes mq-rise {
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rise,
          .panel-art {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }

        /* toast — a small, neutral confirmation (design has no JS; these only
           fire from the component's default button handlers). */
        .toast-wrap {
          position: absolute;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          z-index: 9;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          pointer-events: none;
        }
        .toast {
          background: rgba(20, 20, 22, 0.9);
          color: #fff;
          padding: 10px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
        }

        @media (max-width: 1200px) {
          .panel {
            --gut: 44px;
          }
          .band {
            grid-template-columns: 300px minmax(0, 1fr);
            gap: 40px;
          }
          .band-cast {
            display: none;
          }
        }
        @media (max-width: 820px) {
          .panel {
            --gut: 22px;
          }
          .panel-title {
            bottom: 270px;
          }
          .band {
            grid-template-columns: 1fr;
            gap: 20px;
            padding-bottom: 32px;
          }
          .band-desc {
            display: none;
          }
        }
      `}</style>
    </header>
  )
}

export default MarqueeHero
