'use client'

// FreeTrialPicker — literal clone of the "Let them try it first" design
// (Free Trial Picker.html). Exact port of the source:
//   • page vertically centers in the viewport (justify-content: center,
//     48px 32px padding) so it fits the screen
//   • selection = poster scales to 1.045 with a deep shadow; 1px ring; no
//     unselected hover lift; selected card lifts on hover
//   • Free Preview poster is CLEAN — the count control is a liquid-glass
//     stepper in the caption row beside the card name; the dynamic copy
//     ("First N lessons free, in full.") lives in the caption description
//   • Lesson Sample keeps the centered Play Sample pill on the photo
//   • subtle glass (blur 2px / saturate 115%), art at center 28%
//   • Back / Continue footer, toast, 800px responsive collapse
// This step precedes Choose Hero / Choose Lesson Card.

import { useCallback, useEffect, useRef, useState } from 'react'

export type TrialStyle = 'Free Preview' | 'Lesson Sample'

const MIN = 1
const MAX = 5

type Toast = { id: number; msg: string }

export function FreeTrialPicker({
  value,
  onChange,
  freeCount: freeCountProp,
  onFreeCountChange,
  onContinue,
  onBack,
  gymImage = '/assets/onboarding/trial-gym.jpg',
  craftImage = '/assets/onboarding/trial-craft.jpg',
}: {
  value?: TrialStyle
  onChange?: (style: TrialStyle) => void
  freeCount?: number
  onFreeCountChange?: (count: number) => void
  onContinue?: (style: TrialStyle, freeCount: number) => void
  onBack?: () => void
  gymImage?: string
  craftImage?: string
}) {
  const [internal, setInternal] = useState<TrialStyle>('Free Preview')
  const selected = value ?? internal

  const [internalCount, setInternalCount] = useState(3)
  const freeCount = freeCountProp ?? internalCount

  // Seed from localStorage when uncontrolled.
  useEffect(() => {
    if (value == null) {
      const s = window.localStorage.getItem('spaire_trial_style')
      if (s === 'Free Preview' || s === 'Lesson Sample') setInternal(s)
    }
    if (freeCountProp == null) {
      const n = parseInt(
        window.localStorage.getItem('spaire_free_lessons') ?? '',
        10,
      )
      if (n >= MIN && n <= MAX) setInternalCount(n)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const select = useCallback(
    (style: TrialStyle) => {
      setInternal(style)
      try {
        window.localStorage.setItem('spaire_trial_style', style)
      } catch {
        /* ignore */
      }
      onChange?.(style)
    },
    [onChange],
  )

  const setCount = useCallback(
    (next: number) => {
      const clamped = Math.max(MIN, Math.min(MAX, next))
      setInternalCount(clamped)
      try {
        window.localStorage.setItem('spaire_free_lessons', String(clamped))
      } catch {
        /* ignore */
      }
      onFreeCountChange?.(clamped)
      return clamped
    },
    [onFreeCountChange],
  )

  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const toast = useCallback((msg: string) => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const handleContinue = () => {
    if (onContinue) {
      onContinue(selected, freeCount)
      return
    }
    toast(
      selected === 'Free Preview'
        ? `Continuing with Free Preview · first ${freeCount}${
            freeCount === 1 ? ' lesson free' : ' lessons free'
          }`
        : 'Continuing with Lesson Sample',
    )
  }

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
    <div className="ftp-root">
      <div className="head">
        <h1>Let them try it first</h1>
        <p>
          Give students a taste before they buy. <b>Free Preview</b> unlocks
          your first lessons in full. <b>Lesson Sample</b> shares a short clip
          from one.
        </p>
      </div>

      <div className="cards">
        {/* FREE PREVIEW */}
        <div
          className={`card${selected === 'Free Preview' ? ' sel' : ''}`}
          onClick={() => select('Free Preview')}
        >
          <div className="poster">
            <div
              className="art"
              style={{
                backgroundImage: `url('${gymImage}')`,
                backgroundPosition: 'center 28%',
              }}
            />
            <div className="glass" />
            <div className="shade" />
            <div className="ring" />
            <div className="check">{CheckIcon}</div>
          </div>
          <div className="cap">
            <div className="cap-row">
              <div className="cap-name">Free Preview</div>
              <div className="stepper">
                <button
                  className="st-btn"
                  type="button"
                  aria-label="Fewer free lessons"
                  disabled={freeCount <= MIN}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCount(freeCount - 1)
                    select('Free Preview')
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  >
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <span className="st-val">{freeCount}</span>
                <button
                  className="st-btn"
                  type="button"
                  aria-label="More free lessons"
                  disabled={freeCount >= MAX}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCount(freeCount + 1)
                    select('Free Preview')
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="cap-desc">
              {freeCount === 1 ? (
                'First lesson free, in full.'
              ) : (
                <>
                  First <b>{freeCount}</b> lessons free, in full.
                </>
              )}
            </div>
          </div>
        </div>

        {/* LESSON SAMPLE */}
        <div
          className={`card${selected === 'Lesson Sample' ? ' sel' : ''}`}
          onClick={() => select('Lesson Sample')}
        >
          <div className="poster">
            <div
              className="art"
              style={{
                backgroundImage: `url('${craftImage}')`,
                backgroundPosition: 'center 28%',
              }}
            />
            <div className="glass" />
            <div className="shade" />
            <div className="band">
              <button
                className="pill"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  select('Lesson Sample')
                  toast('Playing the 2-minute sample')
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" />
                </svg>
                Play Sample
              </button>
            </div>
            <div className="ring" />
            <div className="check">{CheckIcon}</div>
          </div>
          <div className="cap">
            <div className="cap-row">
              <div className="cap-name">Lesson Sample</div>
            </div>
            <div className="cap-desc">A short clip from one lesson.</div>
          </div>
        </div>
      </div>

      <div className="foot">
        <button className="back" type="button" onClick={() => onBack?.()}>
          Back
        </button>
        <button className="continue" type="button" onClick={handleContinue}>
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
        .ftp-root {
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
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
        }
        /* Neutralize UA button chrome only — no background/color here (would
           clobber .continue / .back / .pill fills). Transparent buttons set
           their own background: none. */
        .ftp-root :global(button) {
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

        /* frosted glass band — visionOS Apple TV */
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
          gap: 12px;
          padding: 0 28px;
        }

        /* white pill — straight from the reference */
        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          height: 46px;
          padding: 0 26px;
          border-radius: 980px;
          background: #fff;
          color: #111;
          font-size: 15.5px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
          transition: transform 0.16s, background 0.16s;
        }
        .pill:hover {
          transform: scale(1.03);
        }
        .pill:active {
          transform: scale(0.97);
        }
        .pill :global(svg) {
          flex-shrink: 0;
        }

        /* liquid-glass stepper — lives beside the card name, not on the photo */
        .stepper {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          height: 38px;
          padding: 4px;
          border-radius: 980px;
          background: rgba(120, 120, 128, 0.12);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          backdrop-filter: blur(20px) saturate(180%);
          box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
          font-variant-numeric: tabular-nums;
        }
        .st-btn {
          background: none;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: var(--ink);
          transition: background 0.15s, transform 0.12s;
        }
        .st-btn:hover {
          background: rgba(120, 120, 128, 0.16);
        }
        .st-btn:active {
          transform: scale(0.88);
        }
        .st-btn:disabled {
          opacity: 0.28;
          cursor: default;
          background: none;
        }
        .st-val {
          min-width: 26px;
          text-align: center;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--ink);
        }

        /* caption */
        .cap {
          padding: 22px 6px 0;
        }
        .cap-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 38px;
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
        .cap-desc :global(b) {
          color: var(--ink);
          font-weight: 600;
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
          animation: ftp-tin 0.3s cubic-bezier(0.2, 1.1, 0.3, 1);
        }
        .toast .tk {
          color: #fff;
          display: grid;
          place-items: center;
        }
        @keyframes ftp-tin {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
        }

        @media (max-width: 800px) {
          .ftp-root {
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

export default FreeTrialPicker
