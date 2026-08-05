'use client'

// ModuleOutlineScreen — literal clone of the "Module Outline Empty State"
// design (Course Outline — Modules). White canvas, Poppins display, an
// editorial timeline: one hairline rail across the middle, tiny nodes, and
// up to four 16:10 poster cards hanging above/below in an alternating
// zig-zag. Posters carry the blurred ambient placeholder from the design
// (hue-rotated per stop), a "Season 01" pill and a ring. Clicking a card
// opens the detail sheet: blurred cover, kicker + title, lesson rows —
// the season title and each lesson title are editable in place.
// Footer: Regenerate / "Looks good — continue".
//
// The header subtitle is a fixed reassurance line ("This outline is a
// starting point — …"); the AI's arc clause is no longer surfaced here.

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
// AI-written "Four modules, shaped from your answers — …" line).
const STARTING_POINT_NOTE =
  'This outline is a starting point — you can reshape seasons, lessons, and content anytime after your course is created.'

// A contenteditable field that commits on blur. Committing on blur (not on
// every keystroke) keeps the caret stable — React never re-renders the node
// mid-edit — so the creator can freely rewrite the AI's module / lesson copy.
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
      className={`${className ?? ''} moes-editable`}
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

export function ModuleOutlineScreen({
  title,
  partialOutline,
  isStreaming,
  error,
  onRegenerate,
  onCreate,
  onClose,
  onOutlineChange,
}: {
  title: string
  partialOutline: PartialOutline
  isStreaming: boolean
  error: string | null
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

  const modules = local.modules ?? []
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  useEffect(() => {
    if (openIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openIdx])

  const cloneModules = () =>
    (local.modules ?? []).map((m) => ({
      ...m,
      lessons: (m.lessons ?? []).map((l) => ({ ...l })),
    }))

  const commitModuleTitle = (i: number, val: string) => {
    const mods = cloneModules()
    if (!mods[i]) return
    mods[i] = { ...mods[i], title: val }
    const next = { ...local, modules: mods }
    dirtyRef.current = true
    setLocal(next)
    onOutlineChange?.(next)
  }

  const commitLessonTitle = (mi: number, li: number, val: string) => {
    const mods = cloneModules()
    if (!mods[mi]?.lessons?.[li]) return
    mods[mi].lessons![li] = { ...mods[mi].lessons![li], title: val }
    const next = { ...local, modules: mods }
    dirtyRef.current = true
    setLocal(next)
    onOutlineChange?.(next)
  }

  // Regenerating discards local edits so the fresh stream shows through.
  const handleRegenerate = () => {
    dirtyRef.current = false
    onRegenerate()
  }

  const openModule = openIdx !== null ? modules[openIdx] : null

  return (
    <div className="moes-root">
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

      {/* ── timeline stage ── */}
      <div className="stage">
        <div className="timeline">
          {modules.map((m, i) => {
            const up = i % 2 === 0
            const lessons = m.lessons ?? []
            return (
              <div key={i} className={`stop ${up ? 'up' : 'down'}`}>
                <div
                  className="connector"
                  style={{ animationDelay: `${0.4 + i * 0.13}s` }}
                />
                <div className="node" />
                <div
                  className="card"
                  style={{ animationDelay: `${0.5 + i * 0.13}s` }}
                  onClick={() => setOpenIdx(i)}
                >
                  <div className="poster">
                    <div
                      className="ph-blur"
                      style={{ filter: `blur(34px) hue-rotate(${i * 34}deg)` }}
                    />
                    <div className="no">
                      Season {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="ring" />
                  </div>
                  <div className="cap">
                    <div className="cap-kicker">
                      {m.kicker ? `${m.kicker} · ` : ''}
                      {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
                    </div>
                    <div className="cap-name">
                      {m.title || <span className="skel" />}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
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
          disabled={isStreaming || modules.length === 0}
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
        className={`scrim${openModule ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpenIdx(null)
        }}
      >
        {openModule && openIdx !== null && (
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-cover">
              <div
                className="ph-blur"
                style={{ filter: `blur(34px) hue-rotate(${openIdx * 34}deg)` }}
              />
              <div className="sheet-no">
                Season {String(openIdx + 1).padStart(2, '0')}
              </div>
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
                <div className="k">{openModule.kicker || ''}</div>
                <EditableText
                  className="t"
                  value={openModule.title || ''}
                  onCommit={(v) => commitModuleTitle(openIdx, v)}
                />
              </div>
            </div>
            <div className="sheet-body">
              <div className="sheet-meta">
                {(openModule.lessons ?? []).length} lessons
                <span className="sep" />
                AI draft
              </div>
              {(openModule.lessons ?? []).map((lesson, idx) => (
                <div key={idx} className="lrow">
                  <span className="lnum">{idx + 1}</span>
                  <div className="lmain">
                    <EditableText
                      className="ltitle"
                      value={lesson.title || ''}
                      onCommit={(v) => commitLessonTitle(openIdx, idx, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ============================================================
           COURSE OUTLINE — MODULES (max 4)
           Editorial timeline: one hairline rail, tiny nodes, big photo
           cards hanging above/below in an alternating zig-zag.
           ============================================================ */
        .moes-root {
          --ink: #1d1d1f;
          --gray: #86868b;
          --gray-2: #a1a1a6;
          --line: #e8e8ed;
          --bg: #ffffff;
          --rail: rgba(0, 0, 0, 0.12);
          --node: #c7c7cc;
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
        .moes-root :global(button) {
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

        /* ── timeline stage ── */
        .stage {
          flex: 1 0 auto;
          display: flex;
          align-items: center;
          padding: 28px var(--gut);
          min-height: 700px;
        }
        .timeline {
          position: relative;
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        .timeline::before {
          content: '';
          position: absolute;
          left: 6%;
          right: 6%;
          top: 50%;
          height: 1px;
          background: var(--rail);
          transform-origin: left;
        }
        @keyframes moesDrawRail {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .stop {
          position: relative;
          height: 720px;
        }
        .node {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--node);
          box-shadow: 0 0 0 6px var(--bg);
          z-index: 3;
          transition: background 0.25s, transform 0.25s;
        }
        .stop:hover .node {
          background: var(--ink);
          transform: translate(-50%, -50%) scale(1.18);
        }

        /* connector rail → card */
        .connector {
          position: absolute;
          left: 50%;
          width: 1px;
          background: var(--rail);
          transform: translateX(-50%);
          z-index: 1;
        }
        .stop.up .connector {
          bottom: 50%;
          height: 40px;
          transform-origin: bottom;
        }
        .stop.down .connector {
          top: 50%;
          height: 40px;
          transform-origin: top;
        }
        @keyframes moesGrowConn {
          from {
            transform: translateX(-50%) scaleY(0);
          }
          to {
            transform: translateX(-50%) scaleY(1);
          }
        }

        /* ── card (picker poster + caption) ── */
        .card {
          position: absolute;
          left: 50%;
          width: min(300px, 94%);
          transform: translateX(-50%);
          cursor: pointer;
          opacity: 1;
        }
        .stop.up .card {
          bottom: calc(50% + 40px);
        }
        .stop.down .card {
          top: calc(50% + 40px);
        }
        @keyframes moesRiseUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes moesRiseDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        /* entrance — animate FROM hidden only when motion is welcome */
        @media (prefers-reduced-motion: no-preference) {
          .timeline::before {
            animation: moesDrawRail 1.1s cubic-bezier(0.6, 0.05, 0.2, 1) both;
          }
          .connector {
            animation: moesGrowConn 0.5s ease both;
          }
          .stop.up .card {
            animation: moesRiseUp 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
          }
          .stop.down .card {
            animation: moesRiseDown 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
          }
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
        .card:hover .poster {
          transform: translateY(-5px);
          box-shadow: 0 22px 48px -22px rgba(0, 0, 0, 0.3),
            0 1px 3px rgba(0, 0, 0, 0.05);
        }

        /* blurred ambient placeholder — the out-of-focus empty state */
        .ph-blur {
          position: absolute;
          inset: -22%;
          background: radial-gradient(
              38% 48% at 28% 18%,
              #8c8069 0%,
              transparent 70%
            ),
            radial-gradient(42% 52% at 72% 16%, #6e7a58 0%, transparent 70%),
            radial-gradient(55% 60% at 50% 64%, #dcd9cf 0%, transparent 74%),
            radial-gradient(34% 44% at 18% 88%, #c8854f 0%, transparent 70%),
            radial-gradient(40% 50% at 82% 84%, #6a6e71 0%, transparent 70%),
            #9b9384;
          filter: blur(34px);
          transform: scale(1.06);
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
        }
        .no {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          height: 28px;
          padding: 0 13px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.92);
          color: #111;
          font-family: var(--po);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
        }

        .cap {
          padding: 18px 4px 0;
        }
        .cap-kicker {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--gray-2);
        }
        .cap-name {
          font-family: var(--po);
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.12;
          margin-top: 6px;
        }
        .skel {
          display: inline-block;
          height: 18px;
          width: 150px;
          background: var(--line);
          border-radius: 5px;
          animation: moesPulse 1.4s ease-in-out infinite;
          vertical-align: middle;
        }
        @keyframes moesPulse {
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
          padding: 0 var(--gut) 44px;
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
          aspect-ratio: 16 / 8;
          background: #0a0807;
          flex: none;
          overflow: hidden;
        }
        .sheet-cover::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            0deg,
            rgba(8, 9, 11, 0.6) 0%,
            rgba(8, 9, 11, 0.1) 40%,
            transparent 70%
          );
        }
        .sheet-no {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          height: 28px;
          padding: 0 13px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.92);
          color: #111;
          font-family: var(--po);
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
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
          font-weight: 600;
          letter-spacing: 0.07em;
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
          padding: 8px 8px 12px;
          overflow-y: auto;
        }
        .sheet-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px 10px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--gray-2);
        }
        .sheet-meta .sep {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--gray-2);
        }
        .lrow {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          border-radius: 14px;
          transition: background 0.14s;
        }
        .lrow:hover {
          background: #f5f5f7;
        }
        .lrow + .lrow {
          box-shadow: inset 0 1px 0 var(--line);
        }
        .lrow:hover,
        .lrow:hover + .lrow {
          box-shadow: none;
        }
        .lnum {
          flex: none;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #f0f0f2;
          color: var(--ink);
          font-size: 12px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .lmain {
          flex: 1;
          min-width: 0;
        }
        .ltitle {
          font-size: 15.5px;
          font-weight: 500;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }

        /* editable fields — subtle affordance so the creator knows the AI
           copy can be rewritten in place. */
        .moes-editable {
          cursor: text;
          border-radius: 8px;
          transition: box-shadow 0.15s, background 0.15s;
          outline: none;
        }
        .moes-editable:hover {
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .moes-editable:focus {
          box-shadow: 0 0 0 2px rgba(106, 77, 216, 0.55);
        }
        .ltitle.moes-editable:focus {
          background: rgba(0, 0, 0, 0.03);
        }

        @media (max-width: 1180px) {
          .moes-root {
            --gut: 44px;
          }
          .card {
            width: min(264px, 94%);
          }
        }
      `}</style>
    </div>
  )
}

export default ModuleOutlineScreen
