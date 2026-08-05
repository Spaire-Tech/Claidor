'use client'

// StructurePicker — literal clone of the "Choose your structure" design
// (Structure Picker.html). Exact port of the source stylesheet:
//   • the page vertically centers in the viewport (justify-content: center,
//     48px padding + a --tabbar allowance) so it fits the screen
//   • selection = the poster scales up 1.045 with a deep shadow; unselected
//     cards do NOT lift on hover — only the selected card lifts
//   • subtle glass (blur 2px / saturate 115%), shade gradient
//   • Seasons band: left-aligned pill stack; Limited Series band:
//     bottom-anchored (band low) Episode 1 pill + numbered chips
//   • Back / Continue footer, toast, 800px responsive collapse
// This is the "Seasons or Limited Series" onboarding step.

import { useCallback, useEffect, useRef, useState } from 'react'

export type StructureStyle = 'Seasons' | 'LimitedSeries'

// Pre-rename values that may still sit in localStorage.
const LEGACY_STYLES: Record<string, StructureStyle> = {
  Modules: 'Seasons',
  Episodic: 'LimitedSeries',
}

type Toast = { id: number; msg: string }

export function StructurePicker({
  value,
  onChange,
  onContinue,
  onBack,
  seasonsImage = '/assets/onboarding/structure-modules.jpg',
  limitedSeriesImage = '/assets/onboarding/structure-episodic.jpg',
}: {
  value?: StructureStyle
  onChange?: (style: StructureStyle) => void
  onContinue?: (style: StructureStyle) => void
  onBack?: () => void
  seasonsImage?: string
  limitedSeriesImage?: string
}) {
  const [internal, setInternal] = useState<StructureStyle>('Seasons')
  const selected = value ?? internal

  useEffect(() => {
    if (value != null) return
    const s = window.localStorage.getItem('spaire_structure_style')
    if (s === 'Seasons' || s === 'LimitedSeries') setInternal(s)
    else if (s && LEGACY_STYLES[s]) setInternal(LEGACY_STYLES[s])
  }, [value])

  const select = useCallback(
    (style: StructureStyle) => {
      setInternal(style)
      try {
        window.localStorage.setItem('spaire_structure_style', style)
      } catch {
        /* ignore */
      }
      onChange?.(style)
    },
    [onChange],
  )

  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const toast = useCallback((msg: string) => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400)
  }, [])

  const CheckIcon = (
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
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )

  return (
    <div className="sp-root">
      {/* Centering lives on .stage (margin:auto), not justify-content on
          .sp-root — so when the content is taller than the viewport it
          top-aligns and scrolls into reach instead of being clipped above
          the top edge. See the .sp-root / .stage CSS below. */}
      <div className="stage">
      <div className="head">
        <h1>Choose your structure</h1>
        <p>
          A <b>Season</b> unfolds over time. New episodes arrive on their own
          release dates, so the masterclass keeps going after launch. A{' '}
          <b>Limited Series</b> is complete at launch. Every episode is there
          from day one.
        </p>
      </div>

      <div className="cards">
        {/* SEASONS */}
        <div
          className={`card${selected === 'Seasons' ? ' sel' : ''}`}
          onClick={() => select('Seasons')}
        >
          <div className="poster">
            <div
              className="art"
              style={{
                backgroundImage: `url('${seasonsImage}')`,
                backgroundPosition: '78% 32%',
              }}
            />
            <div className="glass" />
            <div className="shade" />
            <div className="band left">
              <span className="pill">Season 1 · Airing now</span>
              <span className="pill ghost">Episode 4 · This week</span>
              <span className="pill ghost">Episode 5 · Next week</span>
            </div>
            <div className="ring" />
            <div className="check">{CheckIcon}</div>
          </div>
          <div className="cap">
            <div className="cap-name">Seasons</div>
            <div className="cap-desc">New episodes on a release schedule.</div>
          </div>
        </div>

        {/* LIMITED SERIES */}
        <div
          className={`card${selected === 'LimitedSeries' ? ' sel' : ''}`}
          onClick={() => select('LimitedSeries')}
        >
          <div className="poster">
            <div
              className="art"
              style={{
                backgroundImage: `url('${limitedSeriesImage}')`,
                backgroundPosition: 'center 30%',
              }}
            />
            <div className="glass" />
            <div className="shade" />
            <div className="band low">
              <div className="ep-row">
                <span className="pill">Episode 1</span>
                <span className="ep-chip">2</span>
                <span className="ep-chip">3</span>
                <span className="ep-chip">4</span>
              </div>
            </div>
            <div className="ring" />
            <div className="check">{CheckIcon}</div>
          </div>
          <div className="cap">
            <div className="cap-name">Limited Series</div>
            <div className="cap-desc">Every episode ready at launch.</div>
          </div>
        </div>
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
              : toast(
                  `Continuing with ${
                    selected === 'LimitedSeries' ? 'Limited Series' : 'Seasons'
                  }`,
                )
          }
        >
          Continue
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
        .sp-root {
          --ink: #1d1d1f;
          --gray: #86868b;
          --line: #e8e8ed;
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
        }
        /* Vertical centering lives here (margin:auto), NOT as
           justify-content:center on .sp-root. On a viewport shorter than the
           content — a small laptop screen, 125%/150% Windows display scaling,
           or browser zoom — justify-content:center splits the overflow evenly
           above and below, pushing the heading ABOVE the scroll origin where
           it can never be scrolled back into view. margin:auto collapses to 0
           once free space runs out, so tall content top-aligns and scrolls
           while short content still centers. (Same fix as .spaire-plan-picker
           .stage.) */
        .stage {
          margin: auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          /* extra bottom padding reserves room for a tab bar, so the content
             optically centers in the space ABOVE it rather than the full
             viewport */
          padding: 48px 32px calc(48px + var(--tabbar, 0px));
        }
        /* Neutralize UA button chrome only — must NOT set background/color
           here or it would out-specify the styled buttons below (.continue,
           .back) and wipe their fills. Transparent buttons declare their own
           background: none. */
        .sp-root :global(button) {
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
          max-width: 640px;
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
          background: #0a0807;
          box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.18),
            0 1px 3px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.3s;
        }
        .card .poster {
          transition: transform 0.32s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.32s;
        }
        .card.sel .poster {
          transform: scale(1.045);
          box-shadow: 0 26px 60px -22px rgba(0, 0, 0, 0.34),
            0 2px 6px rgba(0, 0, 0, 0.06);
        }
        .card.sel:hover .poster {
          transform: scale(1.045) translateY(-4px);
        }
        .art {
          position: absolute;
          inset: 0;
          background-size: cover;
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          pointer-events: none;
          z-index: 6;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
          transition: box-shadow 0.22s;
        }
        .card.sel .ring {
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
        }

        .check {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 7;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(20, 20, 24, 0.34);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.9);
          display: grid;
          place-items: center;
          color: #fff;
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
          box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.1);
        }

        /* frosted glass — visionOS */
        .glass {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 62%;
          z-index: 2;
          -webkit-backdrop-filter: blur(2px) saturate(115%);
          backdrop-filter: blur(2px) saturate(115%);
          -webkit-mask-image: linear-gradient(0deg, #000 55%, transparent 100%);
          mask-image: linear-gradient(0deg, #000 55%, transparent 100%);
        }
        .shade {
          position: absolute;
          inset: 0;
          z-index: 3;
          background: linear-gradient(
            0deg,
            rgba(8, 9, 11, 0.52) 4%,
            rgba(8, 9, 11, 0.2) 30%,
            transparent 52%
          );
        }
        .band {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 28px;
        }
        .band.left {
          align-items: flex-start;
          padding-left: 36px;
        }
        .band.low {
          justify-content: flex-end;
          padding-bottom: 30px;
        }

        /* white pill — primary */
        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          height: 44px;
          padding: 0 24px;
          border-radius: 980px;
          background: #fff;
          color: #111;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
        }
        /* frosted pill — the rest of the sequence */
        .pill.ghost {
          background: rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.92);
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
          height: 40px;
          font-size: 14px;
        }

        /* episodic row */
        .ep-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .ep-chip {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.92);
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
          font-size: 14px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
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
        .cap-desc {
          font-size: 17px;
          line-height: 1.45;
          color: var(--gray);
          font-weight: 400;
          margin-top: 5px;
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
          animation: sp-tin 0.3s cubic-bezier(0.2, 1.1, 0.3, 1);
        }
        .toast .tk {
          color: #fff;
          display: grid;
          place-items: center;
        }
        @keyframes sp-tin {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
        }

        @media (max-width: 800px) {
          .stage {
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

export default StructurePicker
