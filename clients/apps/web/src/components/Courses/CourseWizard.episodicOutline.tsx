'use client'

// EpisodicOutlineScreen — literal clone of the "Episodic Outline Empty State"
// design (Course Outline — Episodic, max 6). White canvas, Poppins display,
// a 3-column grid of episode cards with blurred ambient empty-state covers
// (hue-rotated per episode), Regenerate / "Looks good — continue" footer and
// a click-to-open detail sheet (16:9 blurred cover, Episode NN + title, the
// AI-written description as the body) — the title and description are
// editable in place.
//
// The card layout follows the creator's lesson-card choice:
//   • spotlight — the design as given: square card, shade gradient, episode
//     number + title + description resting OVER the image.
//   • catalog   — the catalog card vocabulary: white tile, the same blurred
//     placeholder as the image area, number + title + description BELOW it.
// The empty image (blurred ambient placeholder) is identical in both. Both
// show the AI title AND description; no lesson minutes anywhere.

import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useRef, useState } from 'react'

type PartialLesson = {
  title?: string
  content_type?: 'text' | 'video'
  description?: string
}
type PartialModule = {
  kicker?: string
  title?: string
  description?: string
  lessons?: PartialLesson[]
}
type PartialOutline = {
  arc?: string
  modules?: PartialModule[]
}

// The standing note that used to sit at the bottom of the screen; it now
// carries the subtitle slot directly under the title (replacing the
// AI-written "Six episodes, in order — …" line).
const STARTING_POINT_NOTE =
  'This outline is a starting point — you can reshape episodes, order, and content anytime after your course is created.'

// A contenteditable field that commits on blur. Committing on blur (not on
// every keystroke) keeps the caret stable — React never re-renders the node
// mid-edit — so the creator can freely rewrite the AI's title/description.
function EditableText({
  value,
  onCommit,
  className,
  multiline = false,
}: {
  value: string
  onCommit: (next: string) => void
  className?: string
  multiline?: boolean
}) {
  return (
    <div
      className={`${className ?? ''} eoes-editable`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? ''
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    >
      {value}
    </div>
  )
}

export function EpisodicOutlineScreen({
  title,
  partialOutline,
  isStreaming,
  error,
  cardVariant,
  onRegenerate,
  onCreate,
  onClose,
  onOutlineChange,
}: {
  title: string
  partialOutline: PartialOutline
  isStreaming: boolean
  error: string | null
  cardVariant: 'spotlight' | 'catalog'
  onRegenerate: () => void
  onCreate: () => void
  onClose: () => void
  onOutlineChange?: (outline: PartialOutline) => void
}) {
  // Local editable copy of the streamed outline. It mirrors the incoming
  // stream until the creator edits a field (dirty), after which their edits
  // win and are pushed up via onOutlineChange so create persists them.
  const [local, setLocal] = useState<PartialOutline>(partialOutline)
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (!dirtyRef.current) setLocal(partialOutline)
  }, [partialOutline])

  // Episodic Originals: one season module holds every episode.
  const episodes = local.modules?.[0]?.lessons ?? []
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  useEffect(() => {
    if (openIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openIdx])

  const commitEpisode = (
    i: number,
    field: 'title' | 'description',
    val: string,
  ) => {
    const modules = (local.modules ?? []).map((m) => ({
      ...m,
      lessons: (m.lessons ?? []).map((l) => ({ ...l })),
    }))
    if (!modules[0]?.lessons?.[i]) return
    modules[0].lessons![i] = { ...modules[0].lessons![i], [field]: val }
    const next = { ...local, modules }
    dirtyRef.current = true
    setLocal(next)
    onOutlineChange?.(next)
  }

  // Regenerating discards local edits so the fresh stream shows through.
  const handleRegenerate = () => {
    dirtyRef.current = false
    onRegenerate()
  }

  const openEpisode = openIdx !== null ? episodes[openIdx] : null

  const phBlur = (i: number) => (
    <div
      className="ph-blur"
      style={{ filter: `blur(34px) hue-rotate(${i * 30}deg)` }}
    />
  )

  return (
    <div className="eoes-root">
      <div className="so-topbar">
        <div className="so-logo">Spaire</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="so-close"
        >
          <CloseIcon style={{ fontSize: 18 }} />
        </button>
      </div>

      {/* ── header ── */}
      <div className="head">
        <div className="eyebrow">
          <span className="spark">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
            </svg>
          </span>
          AI-generated outline
          <span className="dot" />
          <span className="muted">Editable</span>
        </div>
        <h1 className="h-title">{title}</h1>
        <p className="h-sub">
          {isStreaming ? 'Generating…' : STARTING_POINT_NOTE}
        </p>
      </div>

      {error && <div className="err">{error}</div>}

      {/* ── grid ── */}
      <div className="stage">
        <div className="grid">
          {episodes.map((ep, i) =>
            cardVariant === 'spotlight' ? (
              <div
                key={i}
                className="card"
                style={{ animationDelay: `${0.08 + i * 0.07}s` }}
                onClick={() => setOpenIdx(i)}
              >
                {phBlur(i)}
                <div className="shade" />
                <div className="info">
                  <div className="ep">
                    Episode {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="title">
                    {ep.title || <span className="skel skel-light" />}
                  </div>
                  <div className="desc">{ep.description || ''}</div>
                </div>
                <div className="ring" />
              </div>
            ) : (
              <div
                key={i}
                className="ccard"
                style={{ animationDelay: `${0.08 + i * 0.07}s` }}
                onClick={() => setOpenIdx(i)}
              >
                <div className="cthumb">
                  {phBlur(i)}
                  <div className="cep">
                    EPISODE {String(i + 1).padStart(2, '0')}
                  </div>
                </div>
                <div className="cinfo">
                  <div className="ctitle">
                    {ep.title || <span className="skel" />}
                  </div>
                  <div className="cdesc">{ep.description || ''}</div>
                </div>
                <div className="ring" />
              </div>
            ),
          )}
        </div>
      </div>

      {/* ── footer ── */}
      <div className="foot">
        <button className="back" type="button" onClick={handleRegenerate}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          Regenerate
        </button>
        <button
          className="continue"
          type="button"
          disabled={isStreaming || episodes.length === 0}
          onClick={onCreate}
        >
          Looks good — continue
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* ── detail sheet ── */}
      <div
        className={`scrim${openEpisode ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpenIdx(null)
        }}
      >
        {openEpisode && openIdx !== null && (
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-cover">
              {phBlur(openIdx)}
              <div className="shade sheet-shade" />
              <button
                className="sheet-close"
                type="button"
                aria-label="Close"
                onClick={() => setOpenIdx(null)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="sheet-title">
                <div className="k">
                  Episode {String(openIdx + 1).padStart(2, '0')}
                </div>
                <EditableText
                  className="t"
                  value={openEpisode.title || ''}
                  onCommit={(v) => commitEpisode(openIdx, 'title', v)}
                />
              </div>
            </div>
            <div className="sheet-body">
              <EditableText
                className="sheet-desc"
                multiline
                value={openEpisode.description || ''}
                onCommit={(v) => commitEpisode(openIdx, 'description', v)}
              />
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ============================================================
           COURSE OUTLINE — EPISODIC (max 6)
           Spotlight or catalog cards in a 3-column grid; AI writes
           the episode descriptions. Blurred ambient empty-state covers.
           ============================================================ */
        .eoes-root {
          --ink: #1d1d1f;
          --gray: #86868b;
          --gray-2: #a1a1a6;
          --line: #e8e8ed;
          --bg: #ffffff;
          --sf: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            'SF Pro Text', system-ui, sans-serif;
          --po: var(--font-poppins), -apple-system, BlinkMacSystemFont,
            system-ui, sans-serif;
          --gut: 64px;
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
        .eoes-root :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
        }

        /* ── header ── */
        .head {
          text-align: center;
          padding: 88px var(--gut) 0;
          flex: none;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--gray);
          margin-bottom: 18px;
        }
        .eyebrow .spark {
          color: var(--ink);
          display: grid;
          place-items: center;
        }
        .eyebrow .dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--gray-2);
        }
        .eyebrow .muted {
          color: var(--gray-2);
          letter-spacing: 0.04em;
        }
        .h-title {
          font-family: var(--po);
          font-size: clamp(34px, 4vw, 50px);
          font-weight: 600;
          letter-spacing: -0.03em;
          line-height: 1.05;
        }
        .h-sub {
          font-size: 19px;
          line-height: 1.5;
          color: var(--gray);
          font-weight: 400;
          margin-top: 15px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .err {
          margin: 16px auto 0;
          padding: 12px 16px;
          border-radius: 10px;
          background: #fff5f5;
          border: 1.5px solid #fecaca;
          color: #dc2626;
          font-size: 13px;
          max-width: 640px;
        }

        /* ── grid ── */
        .stage {
          flex: 1 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 44px var(--gut) 56px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 26px;
          width: 100%;
          max-width: 1120px;
        }

        /* ── spotlight card ── */
        .card {
          position: relative;
          aspect-ratio: 1 / 1;
          border-radius: 20px;
          overflow: hidden;
          cursor: pointer;
          background: #0a0807;
          box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.2),
            0 1px 3px rgba(0, 0, 0, 0.05);
          opacity: 1;
          transition: transform 0.3s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.3s;
        }
        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 22px 48px -22px rgba(0, 0, 0, 0.34),
            0 1px 3px rgba(0, 0, 0, 0.05);
        }
        @keyframes eoesCardIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .card,
          .ccard {
            animation: eoesCardIn 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
          }
        }

        .ph-blur {
          position: absolute;
          inset: -16%;
          background: radial-gradient(
              38% 48% at 28% 18%,
              #8c8069 0%,
              transparent 70%
            ),
            radial-gradient(42% 52% at 72% 16%, #6e7a58 0%, transparent 70%),
            radial-gradient(55% 60% at 50% 60%, #dcd9cf 0%, transparent 74%),
            radial-gradient(34% 44% at 18% 84%, #c8854f 0%, transparent 70%),
            radial-gradient(40% 50% at 82% 82%, #6a6e71 0%, transparent 70%),
            #9b9384;
          filter: blur(34px);
          transform: scale(1.06);
        }
        .shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            0deg,
            rgba(7, 8, 10, 0.94) 1%,
            rgba(7, 8, 10, 0.66) 24%,
            rgba(7, 8, 10, 0.16) 50%,
            transparent 66%
          );
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
        }

        .info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          padding: 0 20px 20px;
          color: #fff;
        }
        .ep {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.74);
        }
        .title {
          font-family: var(--po);
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.12;
          margin-top: 6px;
        }
        .desc {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.85);
          margin-top: 9px;
          text-wrap: pretty;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* ── catalog card (the catalog lesson-card vocabulary) ── */
        .ccard {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          cursor: pointer;
          background: #ffffff;
          border: 1px solid #e6e6e9;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04),
            0 4px 16px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s cubic-bezier(0.2, 1, 0.3, 1),
            box-shadow 0.3s;
        }
        .ccard:hover {
          transform: translateY(-5px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.14),
            0 2px 8px rgba(0, 0, 0, 0.06);
        }
        .cthumb {
          position: relative;
          flex: 0 0 auto;
          aspect-ratio: 16 / 10;
          background: #0a0807;
          overflow: hidden;
        }
        .cep {
          position: absolute;
          left: 12px;
          top: 12px;
          z-index: 2;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(0, 0, 0, 0.42);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          padding: 4px 8px;
          border-radius: 6px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
        }
        .cinfo {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 16px 20px 20px;
        }
        .ctitle {
          font-family: var(--po);
          font-size: 19px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
          color: #1d1d1f;
          margin-bottom: 8px;
        }
        .cdesc {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.56);
          line-height: 1.55;
          text-wrap: pretty;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .skel {
          display: inline-block;
          height: 16px;
          width: 140px;
          background: var(--line);
          border-radius: 5px;
          animation: eoesPulse 1.4s ease-in-out infinite;
          vertical-align: middle;
        }
        .skel-light {
          background: rgba(255, 255, 255, 0.32);
        }
        @keyframes eoesPulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }

        /* ── footer ── */
        .foot {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 16px var(--gut) 22px;
          flex: none;
        }
        .back {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 17px;
          font-weight: 500;
          color: var(--ink);
          background: none;
          padding: 15px 30px;
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
        .continue:disabled {
          opacity: 0.4;
          cursor: default;
          transform: none;
        }
        .foot-note {
          text-align: center;
          font-size: 14px;
          line-height: 1.5;
          color: var(--gray-2);
          padding: 0 var(--gut) 40px;
          flex: none;
          max-width: 560px;
          margin: 0 auto;
        }

        /* ── detail sheet ── */
        .scrim {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 32px;
          background: rgba(20, 20, 22, 0.34);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.26s ease;
        }
        .scrim.open {
          opacity: 1;
          pointer-events: auto;
        }
        .sheet {
          width: min(540px, 100%);
          max-height: calc(100vh - 64px);
          overflow: hidden;
          background: #fff;
          border-radius: 26px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 40px 100px -28px rgba(0, 0, 0, 0.5);
          transform: translateY(14px) scale(0.98);
          transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        .scrim.open .sheet {
          transform: none;
        }
        .sheet-cover {
          position: relative;
          aspect-ratio: 16 / 9;
          background: #0a0807;
          flex: none;
          overflow: hidden;
        }
        .sheet-shade {
          background: linear-gradient(
            0deg,
            rgba(8, 9, 11, 0.7) 0%,
            rgba(8, 9, 11, 0.12) 42%,
            transparent 72%
          );
        }
        .sheet-close {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 3;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(20, 20, 24, 0.42);
          color: #fff;
          display: grid;
          place-items: center;
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          transition: background 0.15s, transform 0.15s;
        }
        .sheet-close:hover {
          background: rgba(20, 20, 24, 0.62);
          transform: scale(1.06);
        }
        .sheet-title {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 16px;
          z-index: 2;
          color: #fff;
        }
        .sheet-title .k {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
        }
        .sheet-title .t {
          font-family: var(--po);
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.08;
          margin-top: 4px;
        }
        .sheet-body {
          padding: 22px 22px 26px;
          overflow-y: auto;
        }
        .sheet-desc {
          font-size: 16px;
          line-height: 1.6;
          color: var(--ink);
          text-wrap: pretty;
        }

        /* editable fields — subtle affordance so the creator knows the AI
           copy can be rewritten in place. */
        .eoes-editable {
          cursor: text;
          border-radius: 8px;
          transition: box-shadow 0.15s, background 0.15s;
          outline: none;
        }
        .eoes-editable:hover {
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .eoes-editable:focus {
          box-shadow: 0 0 0 2px rgba(106, 77, 216, 0.55);
          background: rgba(255, 255, 255, 0.06);
        }
        .sheet-desc.eoes-editable:focus {
          background: rgba(0, 0, 0, 0.03);
        }

        @media (max-width: 980px) {
          .eoes-root {
            --gut: 40px;
          }
          .grid {
            grid-template-columns: repeat(2, 1fr);
            max-width: 640px;
          }
        }
        @media (max-width: 600px) {
          .grid {
            grid-template-columns: 1fr;
            max-width: 360px;
          }
        }
      `}</style>
    </div>
  )
}

export default EpisodicOutlineScreen
