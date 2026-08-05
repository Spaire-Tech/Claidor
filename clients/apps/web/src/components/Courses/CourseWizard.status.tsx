'use client'

import { memo, useEffect, useRef, useState } from 'react'

// ─── Generating screen ────────────────────────────────────────────────────────
// Literal port of "Season Generating.html": a halftone ring — four concentric
// bands of blue-centred dots, each band slowly turning (alternating direction)
// with a brightness/scale shimmer sweeping around — plus the "Shaping the
// season" copy and a rotating "Teaching notes" did-you-know ticker.

type Phase = 'outline' | 'landing'
type Format = 'course' | 'series'

const COPY: Record<Format, Record<Phase, { headline: string; sub: string }>> = {
  course: {
    outline: {
      headline: 'Generating outline',
      sub: "This can take a minute or two. We're drafting modules, lessons, and learning objectives — feel free to keep this tab open.",
    },
    landing: {
      headline: 'One last step',
      sub: "We're putting together your landing page — hero, curriculum, and pricing. Hang tight, you'll be ready to share it in a moment.",
    },
  },
  series: {
    outline: {
      headline: 'Shaping the season',
      sub: "This can take a minute or two. We're sketching the arc and the episode list. Keep this tab open.",
    },
    landing: {
      headline: 'One last step',
      sub: "We're putting together your series page — hero, chapters, and episodes. Hang tight, you'll be ready to share it in a moment.",
    },
  },
}

// The wizard re-renders many times per second while the AI SDK streams chunks
// back. The ring is built imperatively and animated on a single rAF loop that
// mutates DOM nodes directly (never React state), so the streamed re-renders
// never touch it — and memoizing the screen keeps React from reconciling it at
// all once its props are stable.
export const GeneratingScreen = memo(function GeneratingScreen({
  onClose: _onClose,
  phase = 'outline',
  format = 'course',
}: {
  onClose: () => void
  phase?: Phase
  format?: Format
}) {
  const copy = COPY[format][phase]

  return (
    <div className="cg-stage">
      <HalftoneRing />

      <section className="cg-copy" role="status" aria-live="polite">
        <h1 className="cg-headline">{copy.headline}</h1>
        <p className="cg-sub">{copy.sub}</p>
      </section>

      <TeachingNotes />

      <GeneratingStyles />
    </div>
  )
})

// ─── Halftone ring ──────────────────────────────────────────────────────────
// Built once in an effect, then driven by a self-contained rAF loop — both the
// rotation and the brightness wave, so it's immune to prefers-reduced-motion
// CSS freezing and never causes a React render.
const HalftoneRing = memo(function HalftoneRing() {
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const C = 140 // center (half of 280)
    const bands = [
      { r: 86, n: 34, size: 4.5, spd: 16 },
      { r: 100, n: 40, size: 7, spd: -21 },
      { r: 114, n: 46, size: 6, spd: 13 },
      { r: 128, n: 52, size: 3.5, spd: -18 },
    ]

    const layers: Array<{ el: HTMLDivElement; spd: number; ang: number }> = []
    const dots: Array<{ el: HTMLSpanElement; t: number }> = []

    bands.forEach((band, bi) => {
      const layer = document.createElement('div')
      layer.className = 'cg-band'

      for (let i = 0; i < band.n; i++) {
        const t = i / band.n // 0..1 around the circle
        const ang = t * Math.PI * 2 + bi * 0.22
        const x = C + band.r * Math.cos(ang)
        const y = C + band.r * Math.sin(ang)
        // blue-centred: teal → blue → indigo
        const hue = 212 + 58 * Math.sin(t * Math.PI * 2)

        const d = document.createElement('span')
        d.className = 'cg-dot'
        const sz = band.size * (0.8 + Math.random() * 0.35)
        d.style.width = `${sz}px`
        d.style.height = `${sz}px`
        d.style.marginLeft = `${x - C}px`
        d.style.marginTop = `${y - C}px`
        d.style.background = `hsl(${hue}, 85%, 62%)`
        layer.appendChild(d)
        dots.push({ el: d, t }) // remember angular position for the shimmer wave
      }
      stage.appendChild(layer)
      layers.push({ el: layer, spd: band.spd, ang: 0 })
    })

    let last = performance.now()
    let phase = 0
    let raf = 0
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      for (const L of layers) {
        L.ang = (L.ang + L.spd * dt) % 360
        L.el.style.transform = `rotate(${L.ang}deg)`
      }
      phase = (phase + dt * 0.32) % 1 // wave travels ~once every 3s
      for (const d of dots) {
        const w = 0.5 + 0.5 * Math.sin((phase - d.t) * Math.PI * 2) // 0..1
        d.el.style.opacity = (0.28 + 0.72 * w).toFixed(3)
        d.el.style.transform = `translate(-50%, -50%) scale(${(
          0.72 +
          0.5 * w
        ).toFixed(3)})`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.replaceChildren()
    }
  }, [])

  return <div className="cg-stage-ring" ref={stageRef} aria-hidden="true" />
})

// ─── "Did you know" ticker — facts about teaching, mastery & how we learn ────
const FACTS = [
  'The best way to learn something is to teach it — explaining an idea forces you to truly understand it.',
  'Experts often forget what it’s like to be a beginner. Great teachers work hard to see through fresh eyes.',
  'It was never really about 10,000 hours. What builds mastery is deliberate practice, not just time logged.',
  'Watching a master at work lights up the same brain regions as doing it yourself.',
  'Short, spaced sessions beat marathon cramming — memory consolidates in the gaps between practice.',
  'Novices see steps; experts see patterns. Mastery is largely the art of grouping detail into wholes.',
  'We learn craft by watching it done, then trying — demonstration sticks better than instruction.',
  'A little struggle helps. ‘Desirable difficulty’ makes learning slower but far more durable.',
  'Specific feedback teaches more than praise — ‘your timing was perfect’ beats ‘good job.’',
  'Facts wrapped in a story are remembered far longer than facts on their own.',
  'Mastery isn’t the absence of mistakes — experts just notice and correct them faster.',
  'The teachers students remember share two traits: real warmth and high expectations.',
]

function TeachingNotes() {
  // Seed deterministically so the server and the first client render match
  // (no hydration mismatch); pick a random starting fact after mount.
  const [fact, setFact] = useState(FACTS[0])
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let i = Math.floor(Math.random() * FACTS.length)
    setFact(FACTS[i])
    let swap: ReturnType<typeof setTimeout>
    const tick = setInterval(() => {
      setVisible(false)
      swap = setTimeout(() => {
        i = (i + 1) % FACTS.length
        setFact(FACTS[i])
        setVisible(true)
      }, 500)
    }, 6000)
    return () => {
      clearInterval(tick)
      clearTimeout(swap)
    }
  }, [])

  return (
    <div className="cg-tip">
      <span className="cg-tip-rule" />
      <span className="cg-tip-k">Teaching notes</span>
      <p className="cg-tip-text" style={{ opacity: visible ? 1 : 0 }}>
        {fact}
      </p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function GeneratingStyles() {
  return (
    <style jsx global>{`
      .cg-stage {
        --cg-bg: #ffffff;
        --cg-fg: #1d1d1f;
        --cg-fg-soft: #86868b;
        position: fixed;
        inset: 0;
        z-index: 200;
        background: var(--cg-bg);
        color: var(--cg-fg);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 32px;
        text-align: center;
        overflow-y: auto;
        letter-spacing: -0.012em;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
          'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* halftone ring */
      .cg-stage-ring {
        position: relative;
        width: 280px;
        height: 280px;
        margin-bottom: 52px;
        flex-shrink: 0;
      }
      .cg-band {
        position: absolute;
        inset: 0;
        transform-origin: 50% 50%;
      }
      .cg-dot {
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 50%;
        opacity: 0.85;
        transform: translate(-50%, -50%) scale(1);
        will-change: opacity, transform;
      }

      /* copy */
      .cg-copy {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        max-width: 480px;
      }
      .cg-headline {
        font-family: var(--font-poppins), -apple-system, BlinkMacSystemFont,
          system-ui, sans-serif;
        font-size: clamp(26px, 3vw, 34px);
        font-weight: 600;
        letter-spacing: -0.025em;
        margin: 0;
      }
      .cg-sub {
        font-size: 18px;
        line-height: 1.55;
        color: var(--cg-fg-soft);
        font-weight: 400;
        margin: 0;
        max-width: 460px;
        text-wrap: pretty;
      }

      /* did-you-know ticker */
      .cg-tip {
        margin-top: 46px;
        max-width: 500px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 11px;
      }
      .cg-tip-rule {
        width: 34px;
        height: 2px;
        border-radius: 2px;
        background: hsl(212, 65%, 88%);
      }
      .cg-tip-k {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: hsl(212, 62%, 56%);
      }
      .cg-tip-text {
        font-size: 17px;
        line-height: 1.55;
        color: #4b4b50;
        font-weight: 400;
        min-height: 3.1em;
        text-wrap: pretty;
        transition: opacity 0.5s ease;
      }
    `}</style>
  )
}

// ─── Creating screen ──────────────────────────────────────────────────────────

export function CreatingScreen({ onClose: _onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        fontFamily: "'Poppins', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: '#f4f4f4',
            border: '1.5px solid #e8e8e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path
              d="M6 14l6 6 10-12"
              stroke="#0a0a0a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            margin: 0,
            color: '#0a0a0a',
          }}
        >
          Creating your course
        </p>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: '#a0a0a0',
          }}
        >
          Setting everything up…
        </p>
      </div>
    </div>
  )
}
