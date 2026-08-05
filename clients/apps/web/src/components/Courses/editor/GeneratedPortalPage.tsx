'use client'

// GeneratedPortalPage — THE page the AI generates. A literal clone of the
// two course-page designs, composed by the onboarding choices:
//
//   "Marquee Course Page.html"     → marquee hero (.panel + frosted band
//                                    fading into the page colour) and the
//                                    catalog episode strip (.lc-catalog) with
//                                    scroll-snap + hover arrows.
//   "Course Page Empty State.html" → cover hero (.hero), the Free Sample
//                                    screen (.sample), spotlight cards
//                                    (.card) in module rows, liquid-glass
//                                    placeholders (.ph-ambient/.glass-tint).
//
// The DOM uses the designs' exact class names and the CSS below is copied
// from the design files verbatim — selectors are only prefixed with the
// root class (.gpp) and `body.dark` becomes `.gpp.dark`. The styles are
// emitted via <style jsx global> so they apply to every node exactly like
// the designs' plain stylesheets do (no styled-jsx scoping to silently miss
// elements rendered by helpers — the bug that flattened the cards).
//
// MEDIA RULE: missing media renders the designs' liquid-glass placeholder —
// never the cover photo on every tile, and NO "Add image / Add trailer"
// affordances here (media is added later in the editor). A lesson tile only
// shows a photo if THAT lesson has one.

import { useCallback, useEffect, useRef, useState } from 'react'
import { HlsVideo } from '../HlsVideo'
import { TITLE_FONTS, titleFontFamily } from '../titleFonts'
import { RepositionInPortal } from '../watch/RepositionInPortal'

const PLAY_PATH =
  'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z'

const ImageGlyph = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-4.35-4.35a1.4 1.4 0 0 0-2 0L5 20" />
  </svg>
)

const ClockIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

const FreeChip = () => (
  <div className="lc-state lc-free">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
    Free
  </div>
)

const LockChip = () => (
  <div className="lc-state lc-lock">
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  </div>
)

// Lesson-card still. Creator stills are full-size uploads (up to 10 MB, S3
// serves them unresized), and the rail used to fetch EVERY card's image
// up-front — on a phone connection they all competed with the full-screen
// hero cover, so the one card actually on screen (episode 1) was the slowest
// to paint. Two mitigations:
//
//   • Only the first card carries a src up-front; the rest get theirs when
//     scrolled near (IntersectionObserver — native loading=lazy barely
//     defers anything in a horizontal rail, its distance thresholds cover
//     the whole strip).
//   • A failed fetch (flaky cellular) retries twice with a cache-busted URL
//     instead of leaving the card blank forever. The eager first image can
//     fail BEFORE hydration attaches onError (it loads from the server
//     HTML), so a mount-time complete-but-empty check catches that too.
function LessonThumb({
  src,
  position,
  positionMobile,
  className,
  eager = false,
}: {
  src: string
  position?: string | null
  /** Mobile-only focal point — applied for phone visitors via the
   *  `.gpp-mpos` mobile-stylesheet rule (falls back to `position`). */
  positionMobile?: string | null
  className?: string
  eager?: boolean
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [visible, setVisible] = useState(eager)
  const failures = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRetry = useCallback(() => {
    if (failures.current >= 2) return
    failures.current += 1
    const n = failures.current
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryTimer.current = setTimeout(() => setAttempt(n), n === 1 ? 1000 : 3000)
  }, [])

  useEffect(() => {
    // New src → new image; reset the retry counter and any pending retry.
    failures.current = 0
    setAttempt(0)
  }, [src])
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    },
    [],
  )

  // Reveal the src when the card approaches the viewport.
  useEffect(() => {
    if (visible) return
    const el = imgRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // Catch an image that already failed before this effect ran (the SSR'd
  // eager image starts — and can fail — before React attaches onError).
  useEffect(() => {
    const el = imgRef.current
    if (visible && el && el.complete && el.naturalWidth === 0) scheduleRetry()
  }, [visible, attempt, src, scheduleRetry])

  const url =
    attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      className={`${className ?? ''} gpp-mpos`}
      src={visible ? url : undefined}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      style={{
        objectPosition: position ?? undefined,
        ...mobilePosVars(position ?? 'center', positionMobile),
      }}
      onError={scheduleRetry}
    />
  )
}

// Touch-to-edit text (the design's contenteditable). Module-level so its
// identity is stable across renders — defined inline it would REMOUNT on
// every parent re-render (FAQ toggle, trailer peek, strip scroll), killing
// focus mid-typing. React renders NO children here; the text is written via
// effects and only synced from props while the element is NOT focused, so an
// in-flight edit can never be clobbered by a background refetch.
function EditText({
  field,
  value,
  className,
  tag: Tag = 'span',
  ctx,
  editable,
  onEditText,
  multiline = false,
  maxLength,
  placeholder,
  style,
}: {
  field: EditField
  value: string
  className?: string
  tag?: 'span' | 'div' | 'h1' | 'h2' | 'p'
  ctx?: { flatIdx?: number; groupIdx?: number; idx?: number }
  editable?: boolean
  onEditText?: (
    field: EditField,
    value: string,
    ctx?: { flatIdx?: number; groupIdx?: number; idx?: number },
  ) => void
  /** Allow line breaks (the hero headline). Single-line fields collapse any
   *  pasted/typed newline to a space so the design's layout can't break. */
  multiline?: boolean
  /** Hard cap enforced on commit (and on paste) so a wall of text can't be
   *  saved into a single-line field. */
  maxLength?: number
  /** Shown (via CSS) when the field is empty, instead of persisting the
   *  placeholder as real content. */
  placeholder?: string
  /** Extra inline styles (e.g. the creator-set hero container width). */
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLElement | null>(null)
  const focusedRef = useRef(false)
  const read = (el: HTMLElement) =>
    multiline ? (el.innerText ?? '') : (el.textContent ?? '')
  useEffect(() => {
    const el = ref.current
    if (el && !focusedRef.current && read(el) !== value) {
      el.textContent = value
    }
    // read depends only on `multiline`, which is stable for a given element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, multiline])
  if (!editable || !onEditText) {
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    )
  }
  const normalize = (raw: string) => {
    let next = multiline
      ? raw.replace(/\r/g, '')
      : raw.replace(/\s*\n\s*/g, ' ')
    next = next.replace(/[ \t]+\n/g, '\n').trim()
    if (maxLength && next.length > maxLength) next = next.slice(0, maxLength)
    return next
  }
  return (
    <Tag
      ref={ref as never}
      className={`${className ?? ''} gpp-editable`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder || undefined}
      style={multiline ? { whiteSpace: 'pre-line', ...style } : style}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onFocus={() => {
        focusedRef.current = true
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        // Single-line fields: Enter commits instead of inserting a newline.
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).blur()
        }
      }}
      onPaste={(e: React.ClipboardEvent) => {
        // Always paste as PLAIN TEXT so no markup/styles ever enter the
        // contentEditable (and so a single-line field can't gain newlines).
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        const clean = multiline
          ? text.replace(/\r/g, '')
          : text.replace(/\s*\n\s*/g, ' ')
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          sel.deleteFromDocument()
          sel.getRangeAt(0).insertNode(document.createTextNode(clean))
          sel.collapseToEnd()
        }
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        focusedRef.current = false
        const next = normalize(read(e.currentTarget))
        if (next !== value) onEditText(field, next, ctx)
      }}
    />
  )
}

// ─── Mobile stylesheet, defined once and served two ways ───────────────────
// Real phones get it behind the media queries below (unchanged behavior).
// The dashboard's phone canvas renders inline on a desktop window, where
// viewport media queries can't fire — so the SAME css is re-emitted scoped
// under `.gpp.gpp-m` (the class the canvas sets), with viewport units
// converted to container units (the phone frame's screen is a size
// container). One source of truth: the canvas can't drift from what a
// phone visitor sees.
const MOBILE_820_CSS = `
          .gpp {
            --gut: 22px;
          }
          .gpp .band {
            grid-template-columns: 1fr;
            gap: 18px;
            padding-bottom: 28px;
          }
          .gpp .band-desc {
            display: none;
          }
          .gpp .strip-wrap .grid .lc-catalog,
          .gpp .strip-wrap .grid .card {
            flex-basis: min(465px, 84%);
          }
        `

const MOBILE_640_CSS = `
          /* The mobile designs put EVERY section on one 20px axis (--gut)
             and cap the page at a centered 520px column. The gut override
             is load-bearing: the hero title, the band's CTA buttons, and
             the rails all reference it — miss it and the buttons sit on a
             different axis than the text above them. */
          .gpp {
            --gut: 20px;
            max-width: 520px;
            margin: 0 auto;
          }

          /* ── cover hero ── design port ("Spaire Cover Hero Mobile"):
             full-bleed photo with everything overlaid — one deep bottom
             shade feathered upward plus a soft top shade, film grain,
             gentle Ken Burns on the cover, and side-by-side pill CTAs.
             Same fields as desktop: AI badge/headline/description, the
             course's lesson count/duration, trailer, and price. ── */
          .gpp .hero {
            height: 100svh;
            min-height: 660px;
            max-height: none;
          }
          /* Ken Burns on the creator's cover. Kept subtler than the demo's
             1.32× so the saved focal crop stays honored; parked while the
             builder's reposition drag is active. */
          .gpp .hero .photo {
            animation: gpp-kb 26s ease-out forwards;
          }
          .gpp .hero.repositioning .photo {
            animation: none;
          }
          /* THE overlay — the design's exact two-layer shade: deep at the
             bottom where the content sits (.92 → transparent at 74%), plus
             a soft darkening at the very top for the brand/status bar. */
          .gpp .hero .photo-shade {
            background:
              linear-gradient(
                0deg,
                rgba(5, 5, 8, 0.92) 0%,
                rgba(5, 5, 8, 0.82) 16%,
                rgba(5, 5, 8, 0.5) 36%,
                rgba(5, 5, 8, 0.18) 56%,
                transparent 74%
              ),
              linear-gradient(180deg, rgba(5, 5, 8, 0.34) 0%, transparent 22%);
          }
          .gpp .hero .hero-grain {
            display: block;
            position: absolute;
            inset: 0;
            z-index: 2;
            opacity: 0.05;
            pointer-events: none;
            mix-blend-mode: overlay;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          }
          .gpp .hero-ph {
            top: 44%;
          }
          .gpp .hero-blend {
            height: 40px;
          }
          .gpp .hero-eyebrow {
            top: 22px;
            left: 26px;
            font-size: 11px;
          }
          .gpp .hero-eyebrow .dot {
            width: 6px;
            height: 6px;
          }
          /* The cover design sits the content on a 26px inset (its own
             --gut), deeper 44px off the bottom edge. */
          .gpp .hero-content {
            left: 26px;
            right: 26px;
            bottom: 44px;
          }
          .gpp .hero-meta {
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 20px;
          }
          .gpp .badge {
            font-size: 10.5px;
            font-weight: 800;
            padding: 6px 13px;
            background: rgba(255, 255, 255, 0.94);
          }
          .gpp .meta-line {
            font-size: 13.5px;
            gap: 8px;
            color: rgba(255, 255, 255, 0.82);
            text-shadow: 0 1px 12px rgba(0, 0, 0, 0.5);
          }
          .gpp .meta-line .sep {
            opacity: 0.5;
          }
          .gpp .hero-title {
            font-family: var(--po);
            font-size: clamp(44px, 14vw, 60px);
            line-height: 0.98;
            letter-spacing: -0.03em;
            text-shadow: 0 4px 50px rgba(0, 0, 0, 0.55);
          }
          .gpp .hero-desc {
            margin-top: 18px;
            font-size: 15.5px;
            line-height: 1.55;
            color: rgba(255, 255, 255, 0.9);
            text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
            text-wrap: pretty;
          }
          /* Side-by-side pill CTAs on ONE line, per the design: each takes
             an equal half (flex: 1 1 0), 56px tall — white trailer pill with
             the 38px play circle, glass enroll pill beside it. */
          .gpp .hero-actions {
            align-items: stretch;
            gap: 12px;
            margin-top: 28px;
          }
          .gpp .btn-trailer,
          .gpp .btn-enroll {
            flex: 1 1 0;
            min-width: 0;
            box-sizing: border-box;
            justify-content: center;
            height: 56px;
            font-size: 16px;
            /* Labels never wrap mid-pill — the label FITTER (see the
               fit-CTA effect) shrinks the font instead when a label is
               too long for its half. Clip inside the pill as a last
               resort (a beyond-floor label must not bleed across). */
            white-space: nowrap;
            overflow: hidden;
          }
          .gpp .btn-trailer {
            padding: 0 0 0 8px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
          }
          .gpp .btn-trailer .play {
            width: 38px;
            height: 38px;
          }
          /* The design's enroll pill is label-only — no trailing arrow.
             (Dropping it also frees the width a long price label needs.) */
          .gpp .btn-enroll svg {
            display: none;
          }
          .gpp .btn-enroll {
            padding: 0;
            /* A near-opaque fill so the enroll CTA is legible on ANY cover
               even where backdrop-filter is unsupported (Google's in-app
               browser, some Android WebViews) — the translucent glass relied
               on that filter and vanished without it. */
            background: rgba(12, 14, 18, 0.64);
            box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.4);
          }
          /* …and the design's exact glass where the blur IS supported. */
          @supports (
            (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
          ) {
            .gpp .btn-enroll {
              background: rgba(20, 20, 24, 0.42);
              -webkit-backdrop-filter: blur(20px) saturate(160%);
              backdrop-filter: blur(20px) saturate(160%);
              box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
            }
          }
          .gpp .btn-enroll:active {
            background: rgba(40, 40, 46, 0.6);
          }

          /* creator controls → 44px icon pills; Add-cover is the centered
             .hero-cta (rendered separately in editable mode). */
          .gpp .creator-bar {
            top: 14px;
            right: 14px;
            gap: 8px;
          }
          .gpp .creator-bar .add-pill {
            width: 44px;
            height: 44px;
            padding: 0;
            border-radius: 50%;
            justify-content: center;
          }
          .gpp .creator-bar .add-pill span {
            display: none;
          }
          .gpp .creator-bar .add-pill svg {
            width: 16px;
            height: 16px;
          }
          /* the labelled Add cover + Reposition pills collapse on phones;
             cover upload lives in the centered .hero-cta, reposition is a
             desktop-drag affordance. */
          .gpp .creator-bar .add-pill.is-cover,
          .gpp .creator-bar .add-pill.is-reposition {
            display: none;
          }
          .gpp .panel .creator-bar {
            top: 14px;
            right: 14px;
          }
          .gpp .creator-bar .theme-toggle {
            width: 44px;
            height: 44px;
          }
          .gpp .hero-cta {
            display: inline-flex;
          }

          /* ── instructor → single column ── */
          .gpp .instructor {
            padding: 64px 20px 8px;
          }
          .gpp .inst-inner {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .gpp .inst-head {
            grid-template-columns: 76px 1fr;
            gap: 16px;
            margin-bottom: 24px;
          }
          .gpp .inst-avatar {
            width: 76px;
            height: 76px;
          }
          .gpp .inst-name {
            font-size: 30px;
          }
          .gpp .inst-sub {
            margin-top: 8px;
            font-size: 14px;
          }
          .gpp .inst-bio {
            font-size: 16px;
          }
          .gpp .inst-bio + .inst-bio {
            margin-top: 16px;
          }
          .gpp .inst-media {
            margin-top: 32px;
            border-radius: 24px;
          }
          .gpp .inst-caption {
            left: 16px;
            bottom: 16px;
            font-size: 12.5px;
          }

          /* ── free sample ── */
          .gpp .sample {
            padding: 56px 20px 8px;
          }
          .gpp .sample-eyebrow {
            font-size: 11px;
            margin-bottom: 10px;
          }
          .gpp .sample h2 {
            font-size: 27px;
          }
          .gpp .sample-sub {
            font-size: 15px;
            margin-top: 8px;
          }
          .gpp .sample-screen {
            aspect-ratio: 16 / 10;
            margin-top: 24px;
            border-radius: 18px;
            box-shadow: 0 24px 22px rgba(0, 0, 0, 0.05);
          }
          .gpp .ph-cta .ph-ic {
            width: 56px;
            height: 56px;
          }
          .gpp .ph-cta .ph-k {
            font-size: 14px;
          }
          .gpp .ph-cta .ph-s {
            font-size: 12px;
            margin-top: -7px;
          }

          /* ── lesson rails — one card at a time ── */
          .gpp .lessons {
            padding: 40px 20px 64px;
          }
          .gpp .row {
            margin-top: 36px;
          }
          .gpp .row-head,
          .gpp .strip-rh {
            font-size: 17px;
            margin-bottom: 12px;
          }
          .gpp .row .grid,
          .gpp .strip-wrap .grid {
            gap: 14px;
            scroll-padding-inline: 20px;
            margin: 0 -20px;
            padding: 0 20px;
          }
          /* module rows show 82% spotlight cards; the episode strip shows
             78% catalog cards (per the two mobile designs). */
          .gpp .row .grid .card,
          .gpp .row .grid .lc-catalog {
            flex: 0 0 82%;
          }
          .gpp .strip-wrap .grid .card,
          .gpp .strip-wrap .grid .lc-catalog {
            flex: 0 0 78%;
          }
          .gpp .card {
            border-radius: 18px;
            box-shadow: 0 14px 14px rgba(0, 0, 0, 0.04);
          }
          .gpp .card-info {
            padding: 0 16px 13px;
          }
          .gpp .card .title {
            font-size: 16px;
            margin-top: 4px;
          }
          .gpp .card .desc {
            font-size: 13px;
            min-height: 37px;
          }

          /* ── faq ── */
          .gpp .faq {
            padding: 16px 20px 88px;
          }
          .gpp .faq h2 {
            font-size: clamp(34px, 10.5vw, 44px);
            white-space: normal;
            margin-bottom: 36px;
          }
          .gpp .faq-q {
            padding: 20px 2px;
            font-size: 17px;
            gap: 16px;
          }
          .gpp .faq-a {
            padding: 0 28px 6px 2px;
            font-size: 15px;
          }
          .gpp .faq-item.open .faq-a {
            padding-bottom: 24px;
          }

          /* ── marquee hero (Marquee Course Page Mobile) ── */
          /* The panel becomes a bottom-anchored flex column, and the title +
             band live in NORMAL FLOW (not absolute) so a long 3-line title
             can never run under the CTA buttons — it pushes the band down
             instead. Everything else (art, scrim, brand, toggle) stays
             absolute, so only these two are flow children. */
          .gpp .panel {
            height: 100svh;
            min-height: 640px;
            max-height: none;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
          }
          .gpp .panel-scrim {
            background: linear-gradient(
              180deg,
              rgba(0, 0, 0, 0.34) 0%,
              transparent 26%,
              transparent 52%,
              rgba(0, 0, 0, 0.2) 74%
            );
          }
          .gpp .panel-brand {
            top: 24px;
            font-size: 11px;
          }
          .gpp .panel .creator-bar {
            top: 14px;
            right: 14px;
          }
          /* Design port ("Marquee Course Page Mobile"): centered title with
             the AI eyebrow re-seated BELOW it as a genre line, side-by-side
             pill CTAs with the free line beneath, and the description
             restored as a two-line clamp with an inline MORE expander
             (desktop hides it at 820px; phones get the full stack back).
             Same fields as desktop — eyebrow/title/desc/badges are the AI
             landing content, price and trailer come from the course. */
          .gpp .panel-title {
            position: relative;
            left: auto;
            right: auto;
            bottom: auto;
            margin: 0 var(--gut) 14px;
            text-align: center;
            display: flex;
            flex-direction: column;
          }
          .gpp .pt-h {
            font-size: clamp(33px, 9.4vw, 42px);
            line-height: 0.96;
            letter-spacing: -0.035em;
            max-width: 13ch;
            margin: 0 auto;
            text-shadow: 0 4px 50px rgba(0, 0, 0, 0.55);
            text-wrap: balance;
          }
          /* The AI eyebrow ("Documentary Series · Golf") reads as the genre
             line under the title on phones — same field, new seat. */
          .gpp .pt-eyebrow {
            order: 2;
            margin: 16px 0 0;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: -0.01em;
            color: rgba(255, 255, 255, 0.88);
            text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
          }
          /* band → in-flow, single column, pulled up under the title. The
             frosted fade moves to a ::before backdrop layer so it never
             tints the buttons or text. */
          .gpp .band {
            position: relative;
            left: auto;
            right: auto;
            bottom: auto;
            margin-top: -46px;
            display: flex;
            flex-direction: column;
            /* reset the desktop grid's align-items: start — without this the
               CTA buttons shrink to their text width and float off-axis
               instead of filling the 20px-gutter column like the design */
            align-items: stretch;
            gap: 16px;
            padding: 50px var(--gut) 26px;
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            background: none;
            -webkit-mask-image: none;
            mask-image: none;
          }
          .gpp .band::before {
            content: '';
            position: absolute;
            inset: 0;
            z-index: -1;
            pointer-events: none;
            -webkit-backdrop-filter: blur(32px) saturate(140%);
            backdrop-filter: blur(32px) saturate(140%);
            background: linear-gradient(
              0deg,
              rgba(var(--band), 1) 46%,
              rgba(var(--band), 0.92) 64%,
              rgba(var(--band), 0.6) 80%,
              rgba(var(--band), 0.22) 92%,
              rgba(var(--band), 0) 100%
            );
            -webkit-mask-image: linear-gradient(
              0deg,
              #000 64%,
              rgba(0, 0, 0, 0.55) 84%,
              transparent 100%
            );
            mask-image: linear-gradient(
              0deg,
              #000 64%,
              rgba(0, 0, 0, 0.55) 84%,
              transparent 100%
            );
          }
          .gpp .band-actions {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 14px;
          }
          .gpp .band-actions .abtn {
            flex: 1 1 0;
            height: 54px;
            padding: 0 22px;
            border-radius: 980px;
            font-size: 16px;
            /* One line per label — the fit-CTA effect shrinks instead. */
            white-space: nowrap;
            overflow: hidden;
          }
          .gpp .band-actions .abtn.play {
            box-shadow: 0 8px 26px rgba(0, 0, 0, 0.2);
          }
          .gpp .band-free {
            flex-basis: 100%;
            text-align: center;
            margin-top: 2px;
          }
          .gpp .band-desc {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding-top: 0;
          }
          .gpp .bd-descwrap {
            margin-top: 4px;
          }
          .gpp .band-desc .bd-text {
            display: block;
            font-size: 15px;
            font-weight: 500;
            line-height: 1.5;
            text-wrap: pretty;
          }
          .gpp .bd-descwrap.clamped .bd-text {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .gpp .bd-descwrap.clamped .bd-more {
            display: inline-flex;
            position: absolute;
            right: 0;
            bottom: 0;
            align-items: center;
            padding: 3px 0 3px 22px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.01em;
            color: var(--bt);
            background: linear-gradient(
              90deg,
              rgba(var(--band), 0) 0%,
              rgba(var(--band), 0.97) 30%
            );
          }
          .gpp .bd-more span {
            background: rgba(125, 125, 135, 0.2);
            border-radius: 980px;
            padding: 3px 11px;
          }
          .gpp.dark .bd-more span {
            background: rgba(255, 255, 255, 0.16);
          }
          .gpp .bd-meta {
            font-size: 13px;
            text-align: left;
            margin-top: 0;
          }
          .gpp .bd-meta-eyebrow {
            display: none;
          }
          .gpp .bd-badges {
            justify-content: flex-start;
            margin-top: 0;
          }
          .gpp .band-cast {
            display: none;
          }
          /* the strip arrows are a desktop hover affordance — no place on
             touch, where the rail scroll-snaps one card at a time. */
          .gpp .arrow {
            display: none;
          }
          /* (dark-mode catalog card darkening now lives in the base rules so it
             applies on every breakpoint — matching the customer portal.) */
          /* free-preview strip header + card sizing. The header sits at the
             page's 20px inset (the .lessons padding); the grid breaks out of
             that padding and re-pads itself so the rail scrolls full-bleed
             with a 20px card inset (no double-inset). */
          .gpp .strip-rh {
            margin: 0 0 14px;
          }
          .gpp .strip-rh .rh {
            font-size: 19px;
          }
          .gpp .strip-wrap .grid {
            overscroll-behavior-x: contain;
            margin: 0 -20px;
            padding: 4px 20px 16px;
          }
          .gpp .lc-card {
            border-radius: 16px;
          }
          .gpp .lc-info {
            padding: 15px 16px 16px;
          }
          .gpp .lc-num {
            font-size: 10px;
            letter-spacing: 0.08em;
            margin-bottom: 5px;
          }
          .gpp .lc-title {
            font-size: 17px;
            margin-bottom: 6px;
          }
          .gpp .lc-desc {
            font-size: 13.5px;
            line-height: 1.5;
            min-height: 40px;
          }
          .gpp .lc-meta {
            padding-top: 10px;
            font-size: 12.5px;
          }

          /* ── episodic (marquee) section rhythm — its design spaces the
             instructor / strip / FAQ tighter than the module-course page ── */
          .gpp.epi .instructor {
            padding: 56px var(--gut) 8px;
          }
          .gpp.epi .lessons {
            padding: 52px var(--gut) 8px;
          }
          .gpp.epi .faq {
            padding-top: 44px;
          }

          /* ── enroll sheet → bottom sheet (the mobile design slides it up
             from the bottom edge, full-width, rounded top corners) ── */
          .gpp .enroll-overlay {
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding: 0;
          }
          .gpp .enroll-sheet {
            width: 100%;
            max-width: 520px;
            max-height: 92svh;
            border-radius: 24px 24px 0 0;
            box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.35);
            transform: translateY(100%);
            transition:
              transform 0.46s cubic-bezier(0.2, 1, 0.3, 1),
              background 0.4s ease;
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
          .gpp .enroll-overlay.show .enroll-sheet {
            transform: none;
          }
          .gpp .es-grab {
            display: block;
          }
          .gpp .es-cover {
            aspect-ratio: 16 / 9;
          }
          .gpp .es-eyebrow {
            top: 24px;
            left: 20px;
            font-size: 10px;
          }
          .gpp .es-title {
            font-size: 23px;
            left: 20px;
            right: 64px;
            bottom: 16px;
          }
          .gpp .es-close {
            top: 14px;
            right: 14px;
            width: 36px;
            height: 36px;
          }
          .gpp .es-body {
            padding: 26px 22px 30px;
          }
          .gpp .es-h {
            font-size: 23px;
            margin-top: 9px;
          }
          .gpp .es-sub {
            font-size: 14px;
            max-width: 340px;
            margin-top: 9px;
          }
          .gpp .es-price {
            font-size: 36px;
            margin-top: 18px;
          }
          .gpp .es-actions {
            gap: 12px;
            margin-top: 20px;
          }
          .gpp .es-enroll {
            max-width: none;
            font-size: 16px;
          }

          /* ── Centered mobile MARQUEE title ── the marquee hero title sits
             in the middle on phones. (The cover hero keeps its own style —
             defined by the creator-supplied cover design.) */
          .gpp .panel-title {
            align-items: center;
          }
        `

const classifyMobileCss = (css: string) =>
  css
    .replace(/\.gpp(?![\w-])/g, '.gpp.gpp-m')
    .replace(/(\d)svh/g, '$1cqh')
    .replace(/(\d)vw/g, '$1cqw')

// CSS custom property helper — React.CSSProperties doesn't type --vars.
const cssVar = (
  name: string,
  value: string | null | undefined,
): React.CSSProperties =>
  value ? ({ [name]: value } as React.CSSProperties) : {}

// Vars carrying the desktop + mobile focal points for a repositionable
// image. Desktop keeps the plain inline background/object-position; the
// visitor-mobile rule (MOBILE_VISITOR_CSS) swaps in --pos-m when set.
const mobilePosVars = (
  desktop: string,
  mobile: string | null | undefined,
): React.CSSProperties =>
  ({
    '--pos-d': desktop,
    ...(mobile ? { '--pos-m': mobile } : {}),
  }) as React.CSSProperties

// Visitor-phone-only rules (inside the ≤640 media query, NEVER classified
// into the canvas variant — the phone canvas swaps values in React instead).
// They exist so mobile-scoped edits are real for visitors:
// * repositionable images honor the mobile focal point (falling back to the
//   desktop one) — !important beats the desktop inline style;
// * hero title/desc containers honor ONLY the mobile width — a desktop
//   width never leaks into phones, and a narrowed container stays centered.
const MOBILE_VISITOR_CSS = `
          .gpp .gpp-mpos {
            background-position: var(--pos-m, var(--pos-d, center)) !important;
            object-position: var(--pos-m, var(--pos-d, center)) !important;
          }
          .gpp .pt-h {
            max-width: var(--tw-m, 13ch) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .gpp .hero-title {
            max-width: var(--tw-m, none) !important;
          }
          .gpp .band-desc .bd-text {
            max-width: var(--dw-m, none) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .gpp .hero-desc {
            max-width: var(--dw-m, none) !important;
          }
`

// The media-query variant is assembled HERE (not inline in the style
// template): styled-jsx's compiler silently drops `@media { ${expr} }`
// blocks, but passes whole-string `${expr}` interpolations through intact.
// (~640px is the full phone layout — a faithful port of "Course Page Empty
// State (Mobile).html".)
const MOBILE_MEDIA_CSS = `
        @media (max-width: 820px) {${MOBILE_820_CSS}}
        @media (max-width: 640px) {${MOBILE_640_CSS}
${MOBILE_VISITOR_CSS}}
`

// Drag-to-resize wrapper for the hero title / description containers (editor
// only). The inner box hugs its text (width: fit-content) and carries the
// creator-set max-width; a grab handle on its right edge appears on hover or
// while the text is selected. Dragging maps the pointer to a 20–100% width of
// the wrapper (the hero's content area) and reports it live via onPct — the
// host debounces the persist. Double-click resets to the design default.
function ResizableWidth({
  enabled,
  pct,
  onPct,
  innerStyle,
  label,
  children,
}: {
  enabled: boolean
  /** Effective width (percent) — null while on the design default. */
  pct: number | null
  onPct: (pct: number | null) => void
  /** Width constraint for the inner box (the container being resized). */
  innerStyle?: React.CSSProperties
  label: string
  children: React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  if (!enabled) return <>{children}</>
  const move = (e: React.PointerEvent) => {
    if (!dragging) return
    const wrap = wrapRef.current
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    if (r.width <= 0) return
    const next = Math.round(
      Math.min(100, Math.max(20, ((e.clientX - r.left) / r.width) * 100)),
    )
    if (next !== pct) onPct(next)
  }
  return (
    <div ref={wrapRef} className={`gpp-rz ${dragging ? 'dragging' : ''}`}>
      <div className="gpp-rz-inner" style={innerStyle}>
        {children}
        <div
          className="gpp-rz-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize the ${label} container`}
          title="Drag to resize · double-click to reset"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            setDragging(true)
          }}
          onPointerMove={move}
          onPointerUp={(e) => {
            ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
            setDragging(false)
          }}
          onPointerCancel={() => setDragging(false)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onPct(null)
          }}
        >
          <span className="gpp-rz-grip" />
          {dragging && (
            <span className="gpp-rz-badge">
              {pct != null ? `${pct}%` : 'Auto'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export type GeneratedLesson = {
  /** Source lesson id, when known — lets the host resolve a click to the exact
   *  lesson instead of matching by title (which collides on duplicate titles). */
  id?: string
  title: string
  description: string
  flatIdx: number
  /** Real lesson still when it exists; otherwise the glass placeholder. */
  imageUrl?: string | null
  /** object-position for the lesson still (creator-set via Reposition). */
  imagePosition?: string | null
  /** Mobile-only object-position (set from the phone canvas); applied for
   *  phone visitors via the mobile stylesheet's CSS-variable rule. */
  imagePositionMobile?: string | null
  durationLabel?: string | null
  free: boolean
  locked: boolean
}

export type GeneratedGroup = {
  /** Module title; null for the flat episodic season. */
  title: string | null
  lessons: GeneratedLesson[]
}

export type GeneratedPortalPageProps = {
  brand: string
  title: string
  /** Cover hero's two-line title break (AI titleLines). */
  titleLines?: string[] | null
  /** "Documentary Series · Golf" (AI eyebrow). */
  eyebrow: string
  /** "New Series" (AI badge — cover hero). */
  badge: string
  /** AI hero description (never the creator's raw brief). */
  desc: string
  /** Instructor credential line (AI byline). */
  byline: string
  instructorName: string
  heroVariant: 'marquee' | 'cover'
  cardVariant: 'spotlight' | 'catalog'
  structure: 'modules' | 'episodic'
  trialMode: 'free_preview' | 'lesson_sample'
  paywallEnabled: boolean
  freeLessons: number
  playLabel: string
  buyLabel: string
  freeLine: string
  coverUrl?: string | null
  coverPosition?: string | null
  /** Mobile-only cover focal point — applied for phone visitors only (the
   *  phone canvas instead swaps `coverPosition` itself). Falls back to the
   *  desktop position when unset. */
  coverPositionMobile?: string | null
  /** Real sample poster/clip (public page); placeholder otherwise. */
  sampleImageUrl?: string | null
  samplePlayable?: boolean
  /** Inline sample playback — the clip window from course.sample. The
   *  player seeks to sampleStart, stops after sampleDuration, and pauses
   *  the moment the screen scrolls out of view. */
  samplePlaybackId?: string | null
  samplePlaybackUrl?: string | null
  sampleStart?: number
  sampleDuration?: number
  /** Hero Play starts the inline sample (sample-trial pages). */
  playStartsSample?: boolean
  /** Instructor section — avatar defaults to the org avatar; the creator can
   *  crop a course-specific one. The writing is AI-polished from the creator's
   *  instructor details. */
  avatarUrl?: string | null
  /** Editor only — open the avatar crop/zoom/reposition editor. When provided,
   *  the round avatar becomes clickable. */
  onEditAvatar?: () => void
  instructorSub?: string
  instructorBio?: string[]
  portraitUrl?: string | null
  /** Focal point for the square portrait (CSS object-position). */
  portraitPosition?: string | null
  /** Mobile-only portrait focal point (phone visitors; see coverPositionMobile). */
  portraitPositionMobile?: string | null
  portraitCaption?: string
  onAddPortrait?: () => void
  portraitBusy?: boolean
  /** Live object-position updates while dragging the portrait to reposition it.
   *  Commit/debounce is the caller's job (mirrors onCoverPosition). */
  onPortraitPosition?: (pos: string) => void
  /** FAQ — AI-written Q/A pairs, all editable. */
  faq?: { q: string; a: string }[]
  /** The band's badge chips — creator-editable; defaults to the design's. */
  badges?: string[]
  groups: GeneratedGroup[]
  lessonCount: number
  /** Total runtime, pre-formatted ("4h 15m" / "0 min"). The meta line shows
   *  lessons · duration · level, exactly like the design. */
  metaDuration?: string
  unit: 'lesson' | 'episode'
  dark: boolean
  /** Theme toggle (creator-facing). Omit to hide (public page). */
  onToggleDark?: () => void
  /** The dashboard's phone canvas — applies the mobile stylesheet via the
   *  `.gpp-m` class (the canvas renders inline on a desktop window, where
   *  the viewport media queries can't fire) and keeps the mouse-driven
   *  creator affordances (reposition, width handles) that the media path
   *  collapses for real phones. */
  phoneCanvas?: boolean
  showTrailerButton?: boolean
  onPlay?: () => void
  onBuy?: () => void
  onTrailer?: () => void
  onSample?: () => void
  onLessonClick?: (flatIdx: number) => void

  // ── Editor mode (the design's creator affordances) ──────────────────────
  /** Show the design's creator pills (Add cover / Add trailer / per-card
   *  Add image / Reposition). Used by the dashboard editor surface. */
  editable?: boolean
  /** Hover-trailer peek: when set, hovering the hero plays the trailer
   *  muted; leaving or scrolling snaps back to the still. */
  trailerUrl?: string | null
  onAddCover?: () => void
  coverBusy?: boolean
  onAddTrailer?: () => void
  trailerBusy?: boolean
  /** Trailer upload progress, 0–100 while uploading, null otherwise. */
  trailerPct?: number | null
  /** Live object-position updates while the creator drags the cover.
   *  Commit/debounce is the caller's job. */
  onCoverPosition?: (pos: string) => void
  /** Hero title / description container widths (percent of the hero's
   *  content area, 20–100). Absent → the design's default max-widths. */
  heroTitleWidth?: number | null
  heroDescWidth?: number | null
  /** Mobile-only hero widths — applied for phone visitors only. Unset →
   *  the mobile design default (full-width, centered). The phone canvas
   *  instead swaps heroTitleWidth/heroDescWidth itself. */
  heroTitleWidthMobile?: number | null
  heroDescWidthMobile?: number | null
  /** Spaire Title Style key (titleFonts.ts) for the hero headline.
   *  Absent/null → Classic (the design default). */
  heroTitleFont?: string | null
  /** Editor only — pick a title style; `null` resets to Classic. */
  onHeroTitleFont?: (key: string | null) => void
  /** Live width updates from the creator-bar Width control. `null` resets
   *  the knob to the design default. Commit/debounce is the caller's job
   *  (mirrors onCoverPosition). */
  onHeroWidth?: (which: 'title' | 'desc', pct: number | null) => void
  onAddLessonImage?: (flatIdx: number) => void
  /** Live object-position updates while the creator drags a lesson still in
   *  the reposition overlay. Commit/debounce is the caller's job (mirrors
   *  onCoverPosition). */
  onRepositionLesson?: (flatIdx: number, pos: string) => void
  /** Replace a lesson still with the file picked inside the reposition
   *  overlay (mirrors onAddLessonImage but receives the File directly). */
  onReplaceLessonImage?: (flatIdx: number, file: File) => void | Promise<void>
  lessonImageBusy?: number | null
  /** Configure-sample affordance on the sample screen (editor only). */
  onConfigureSample?: () => void
  /** Touch-to-edit text commits (editor only). ctx carries the lesson's
   *  flatIdx or the module's groupIdx where relevant. */
  onEditText?: (
    field: EditField,
    value: string,
    ctx?: { flatIdx?: number; groupIdx?: number; idx?: number },
  ) => void
  /** Enroll-sheet price sub-line ("One-time purchase · 18 lessons ·
   *  Lifetime access"). The big price is parsed from buyLabel. */
  enrollPriceSub?: string

  // ── Add / remove for the fixed-count lists (editor only). When provided,
  //    the renderer shows the design's "+ Add" affordance and a per-item
  //    remove control. ───────────────────────────────────────────────────────
  onAddFaq?: () => void
  onRemoveFaq?: (idx: number) => void
  onAddBadge?: () => void
  onRemoveBadge?: (idx: number) => void
  onAddBioParagraph?: () => void
  onRemoveBioParagraph?: (idx: number) => void

  /** Lazily mint the sample clip's playback URL (public page). Called the
   *  first time the clip needs to play, so the full URL is never embedded in
   *  the page. Returns null when unavailable (e.g. quota exhausted). */
  onRequestSampleUrl?: () => Promise<string | null>

  /** Section visibility (landing_overrides.visible). A section whose id maps
   *  to `false` is not rendered on the public page; in the editor it moves to
   *  the "hidden sections" bar where it can be brought back. */
  sectionVisible?: Record<string, boolean>
  /** Hide/show a body section (editor only). */
  onSetSectionHidden?: (id: string, hidden: boolean) => void
}

// The body sections the live landing renders, in render order. The hero is
// always first and isn't a hideable body section. Used for the hide control
// and the "hidden sections" recovery bar.
const BODY_SECTIONS: { id: string; label: string }[] = [
  { id: 'instructor', label: 'Instructor' },
  { id: 'sample', label: 'Free sample' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'faq', label: 'FAQ' },
]

export type EditField =
  | 'title'
  | 'heroTitle'
  | 'desc'
  | 'byline'
  | 'eyebrow'
  | 'badge'
  | 'bdg'
  | 'freeLine'
  | 'instructorName'
  | 'lessonTitle'
  | 'lessonDesc'
  | 'moduleTitle'
  | 'instructorSub'
  | 'instructorBioP'
  | 'portraitCaption'
  | 'faqQ'
  | 'faqA'

export function GeneratedPortalPage({
  brand,
  title,
  titleLines,
  eyebrow,
  badge,
  desc,
  byline,
  instructorName,
  heroVariant,
  cardVariant,
  structure,
  trialMode,
  paywallEnabled,
  buyLabel,
  freeLine,
  coverUrl,
  coverPosition,
  coverPositionMobile = null,
  sampleImageUrl,
  samplePlayable = false,
  samplePlaybackId = null,
  samplePlaybackUrl = null,
  sampleStart = 0,
  sampleDuration = 0,
  avatarUrl = null,
  onEditAvatar,
  instructorSub = '',
  instructorBio = [],
  portraitUrl = null,
  portraitPosition = null,
  portraitPositionMobile = null,
  portraitCaption = '',
  onAddPortrait,
  portraitBusy = false,
  onPortraitPosition,
  faq = [],
  badges = ['All Levels', 'Self-paced', 'Captions', 'Mobile & Desktop'],
  groups,
  lessonCount,
  metaDuration = '0 min',
  unit,
  dark,
  onToggleDark,
  phoneCanvas = false,
  showTrailerButton = true,
  onPlay,
  onBuy,
  onTrailer,
  onSample,
  onLessonClick,
  editable = false,
  trailerUrl,
  onAddCover,
  coverBusy = false,
  onAddTrailer,
  trailerBusy = false,
  trailerPct = null,
  onCoverPosition,
  heroTitleWidth = null,
  heroTitleWidthMobile = null,
  heroDescWidthMobile = null,
  heroDescWidth = null,
  heroTitleFont = null,
  onHeroTitleFont,
  onHeroWidth,
  onAddLessonImage,
  onRepositionLesson,
  onReplaceLessonImage,
  lessonImageBusy = null,
  onConfigureSample,
  onEditText,
  enrollPriceSub,
  onAddFaq,
  onRemoveFaq,
  onAddBadge,
  onRemoveBadge,
  onAddBioParagraph,
  onRemoveBioParagraph,
  onRequestSampleUrl,
  sectionVisible,
  onSetSectionHidden,
}: GeneratedPortalPageProps) {
  const isSectionHidden = (id: string) => sectionVisible?.[id] === false
  // A small hover control rendered at the top of each editable body section.
  // A render helper (not a nested component) so it doesn't remount each render.
  const sectionHideControl = (id: string): React.ReactNode =>
    onSetSectionHidden ? (
      <button
        type="button"
        className="gpp-section-hide"
        title="Hide section"
        onClick={(e) => {
          e.stopPropagation()
          onSetSectionHidden(id, true)
        }}
      >
        Hide section
      </button>
    ) : null
  const isEpisodic = structure === 'episodic'
  const unitCap = unit === 'episode' ? 'Episode' : 'Lesson'
  const year = new Date().getFullYear()

  // ── enroll sheet (paywall): which locked lesson opened it ──
  const [enrollLesson, setEnrollLesson] = useState<{
    n: number
    title: string
  } | null>(null)
  const enrollPrice = (buyLabel.match(/[$€£]\s?[\d.,]+/)?.[0] ?? '').replace(
    /\s/g,
    '',
  )
  // The free-sample section only exists when a real, playable sample is
  // configured. Remove the sample and the whole section disappears from the
  // landing — no empty screen, no "set up your sample" placeholder. (Creators
  // add/remove the sample from the lesson editor.)
  const hasSampleSection =
    paywallEnabled && trialMode === 'lesson_sample' && samplePlayable
  // The hero primary CTA is ALWAYS "Play Trailer" on both the Marquee and the
  // Cover — never "Play Sample". The trailer is the hook; the free sample lives
  // in its own section further down (and, on the Marquee, as a chip in the
  // metadata row). `onTrailer` plays the trailer when one exists and otherwise
  // falls back to `onPlay`, so the button is never a dead end.
  const playPrimary = onTrailer ?? onPlay
  const closeEnroll = useCallback(() => setEnrollLesson(null), [])
  useEffect(() => {
    if (!enrollLesson) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEnroll()
    }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the sheet is open (the design does this).
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [enrollLesson, closeEnroll])

  // ── mobile marquee: the hero description clamps to two lines with an
  //    inline MORE expander (design port). Desktop and the builder preview
  //    always show the full text — the clamp CSS only exists ≤640px and the
  //    button never renders while editing. ──
  const [descExpanded, setDescExpanded] = useState(false)

  // ── hover-trailer peek: play WITH sound on hover, snap back on leave/scroll.
  //    (The protected behavior from the original landing's HeroMedia.) ──
  const heroRef = useRef<HTMLElement | null>(null)
  const trailerVideoRef = useRef<HTMLVideoElement | null>(null)
  const [trailerPeek, setTrailerPeek] = useState(false)
  const trailerPeekRef = useRef(false)
  useEffect(() => {
    trailerPeekRef.current = trailerPeek
  }, [trailerPeek])
  useEffect(() => {
    if (!trailerUrl) return
    const v = trailerVideoRef.current
    if (!v) return
    if (trailerPeek) {
      v.currentTime = 0
      // The creator wants the trailer audible the moment you hover. Try to play
      // unmuted first; if the browser blocks autoplay-with-sound (no prior user
      // gesture on the page), fall back to a muted peek so the video still
      // shows. The gesture-unlock effect below turns the sound on the instant
      // the visitor interacts with anything.
      v.muted = false
      v.volume = 1
      void v.play().catch(() => {
        v.muted = true
        void v.play().catch(() => setTrailerPeek(false))
      })
    } else {
      v.pause()
    }
  }, [trailerPeek, trailerUrl])
  // Browsers block autoplay-WITH-sound until the page has had a user gesture.
  // The dashboard editor always has one (you clicked your way in), but a fresh
  // visitor who opens the public landing and only hovers has not — so the first
  // peek can come up muted. Listen for the first real interaction anywhere on
  // the page and, if the trailer is peeking right then, unmute it immediately;
  // every later hover then plays with sound (activation is sticky).
  useEffect(() => {
    if (!trailerUrl) return
    const unmuteIfPeeking = () => {
      const v = trailerVideoRef.current
      if (v && trailerPeekRef.current && v.muted) {
        v.muted = false
        v.volume = 1
        void v.play().catch(() => {})
      }
    }
    window.addEventListener('pointerdown', unmuteIfPeeking, true)
    window.addEventListener('keydown', unmuteIfPeeking, true)
    window.addEventListener('touchstart', unmuteIfPeeking, true)
    return () => {
      window.removeEventListener('pointerdown', unmuteIfPeeking, true)
      window.removeEventListener('keydown', unmuteIfPeeking, true)
      window.removeEventListener('touchstart', unmuteIfPeeking, true)
    }
  }, [trailerUrl])
  useEffect(() => {
    if (!trailerUrl || !trailerPeek) return
    // Any scroll pauses the peek — same rule the original hero enforced.
    const onScroll = () => setTrailerPeek(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [trailerUrl, trailerPeek])

  // ── per-lesson still reposition: opens the shared RepositionInPortal
  //    overlay; live position updates flow to onRepositionLesson (the caller
  //    debounces + persists thumbnail_object_position). Keyed by flatIdx so the
  //    overlay tracks fresh lesson data (e.g. after an in-overlay Replace). ──
  const [reposIdx, setReposIdx] = useState<number | null>(null)
  const reposLesson =
    reposIdx == null
      ? null
      : (groups.flatMap((g) => g.lessons).find((l) => l.flatIdx === reposIdx) ??
        null)

  // ── reposition: drag the cover to move object-position; live callback,
  //    caller persists. Activated from the design's ⤧ pill. ──
  const [repositioning, setRepositioning] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    posX: number
    posY: number
  } | null>(null)
  const parsePos = (pos: string | null | undefined): [number, number] => {
    const m = /([\d.]+)%\s+([\d.]+)%/.exec(pos ?? '')
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50]
  }
  // Live drag position, tagged with the committed value it was dragged from.
  // The live override only wins while it still belongs to the current
  // `coverPosition`; once a drag persists (or the server sends a new value),
  // `base` no longer matches and the persisted value becomes authoritative
  // again — so the first drag can't "stick" forever and desync from what's
  // saved (no effect-driven reset needed).
  const [livePos, setLivePos] = useState<{
    pos: string
    base: string | null
  } | null>(null)
  const committedCoverPos = coverPosition ?? null
  const effectiveCoverPos =
    livePos && livePos.base === committedCoverPos
      ? livePos.pos
      : committedCoverPos
  const onDragStart = (e: React.PointerEvent) => {
    if (!repositioning) return
    const [px, py] = parsePos(effectiveCoverPos)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: px,
      posY: py,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const hero = heroRef.current
    if (!repositioning || !d || !hero) return
    const r = hero.getBoundingClientRect()
    // Dragging right shows more of the image's left side → position decreases.
    const nx = Math.min(
      100,
      Math.max(0, d.posX - ((e.clientX - d.startX) / r.width) * 100),
    )
    const ny = Math.min(
      100,
      Math.max(0, d.posY - ((e.clientY - d.startY) / r.height) * 100),
    )
    const next = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`
    setLivePos({ pos: next, base: committedCoverPos })
    onCoverPosition?.(next)
  }
  const onDragEnd = () => {
    dragRef.current = null
  }

  // ── instructor portrait reposition — the SAME "grab the photo" convention
  //    as the cover (drag right → reveal the image's left, position decreases),
  //    so the direction is identical across the product. Persists to
  //    landing_overrides.portrait_object_position via onPortraitPosition. ──
  const portraitRef = useRef<HTMLDivElement | null>(null)
  const [portraitReposing, setPortraitReposing] = useState(false)
  const portraitDragRef = useRef<{
    startX: number
    startY: number
    posX: number
    posY: number
  } | null>(null)
  const [portraitLivePos, setPortraitLivePos] = useState<{
    pos: string
    base: string | null
  } | null>(null)
  const committedPortraitPos = portraitPosition ?? null
  const effectivePortraitPos =
    portraitLivePos && portraitLivePos.base === committedPortraitPos
      ? portraitLivePos.pos
      : committedPortraitPos
  const onPortraitDragStart = (e: React.PointerEvent) => {
    if (!portraitReposing) return
    const [px, py] = parsePos(effectivePortraitPos)
    portraitDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: px,
      posY: py,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPortraitDragMove = (e: React.PointerEvent) => {
    const d = portraitDragRef.current
    const el = portraitRef.current
    if (!portraitReposing || !d || !el) return
    const r = el.getBoundingClientRect()
    const nx = Math.min(
      100,
      Math.max(0, d.posX - ((e.clientX - d.startX) / r.width) * 100),
    )
    const ny = Math.min(
      100,
      Math.max(0, d.posY - ((e.clientY - d.startY) / r.height) * 100),
    )
    const next = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`
    setPortraitLivePos({ pos: next, base: committedPortraitPos })
    onPortraitPosition?.(next)
  }
  const onPortraitDragEnd = () => {
    portraitDragRef.current = null
  }
  const portraitReposProps =
    portraitReposing && portraitUrl
      ? {
          onPointerDown: onPortraitDragStart,
          onPointerMove: onPortraitDragMove,
          onPointerUp: onPortraitDragEnd,
          onPointerCancel: onPortraitDragEnd,
        }
      : {}

  // ── inline sample playback: seek to the clip start, stop at the clip end,
  //    and STOP when the screen scrolls out of view (the protected
  //    "sample stops when you scroll past it" behavior). ──
  const sampleScreenRef = useRef<HTMLDivElement | null>(null)
  const sampleVideoRef = useRef<HTMLVideoElement | null>(null)
  const [samplePlaying, setSamplePlaying] = useState(false)
  // The clip URL is minted on demand (the public payload no longer embeds it),
  // so resolve it lazily the first time the clip needs to play and cache it.
  const [resolvedSampleUrl, setResolvedSampleUrl] = useState<string | null>(
    null,
  )
  const sampleUrlRef = useRef<string | null>(null)
  const ensureSampleUrl = useCallback(async (): Promise<string | null> => {
    if (sampleUrlRef.current) return sampleUrlRef.current
    if (samplePlaybackUrl) {
      sampleUrlRef.current = samplePlaybackUrl
      return samplePlaybackUrl
    }
    if (!onRequestSampleUrl) return null
    try {
      const url = await onRequestSampleUrl()
      if (url) {
        sampleUrlRef.current = url
        setResolvedSampleUrl(url)
      }
      return url
    } catch {
      return null
    }
  }, [samplePlaybackUrl, onRequestSampleUrl])
  const sampleSrc = resolvedSampleUrl ?? samplePlaybackUrl ?? null
  const sampleIsHls = Boolean(
    samplePlaybackId || (sampleSrc && sampleSrc.includes('.m3u8')),
  )
  const [sampleMuted, setSampleMuted] = useState(false)
  const startSample = useCallback(() => {
    if (!samplePlayable) return
    void ensureSampleUrl().then((url) => {
      if (!url) return
      setSampleMuted(false)
      setSamplePlaying(true)
      sampleScreenRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }, [samplePlayable, ensureSampleUrl])
  // Auto-play on scroll — the design's "plays automatically when scrolled
  // into view". Starts MUTED (browsers only allow muted autoplay) and fires
  // once per visit; the viewer can unmute via the player controls, and an
  // explicit click/play always runs with sound.
  const sampleAutoPlayedRef = useRef(false)
  useEffect(() => {
    if (!samplePlayable || samplePlaying || sampleAutoPlayedRef.current) return
    const screen = sampleScreenRef.current
    if (!screen) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.6 && !sampleAutoPlayedRef.current) {
            sampleAutoPlayedRef.current = true
            void ensureSampleUrl().then((url) => {
              if (!url) return
              setSampleMuted(true)
              setSamplePlaying(true)
            })
          }
        }
      },
      { threshold: [0.6] },
    )
    io.observe(screen)
    return () => io.disconnect()
  }, [samplePlayable, samplePlaying, ensureSampleUrl])
  const stopSample = useCallback(() => {
    sampleVideoRef.current?.pause()
    setSamplePlaying(false)
  }, [])
  const onSampleVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      sampleVideoRef.current = el
      if (!el) return
      const seekAndPlay = () => {
        if (sampleStart > 0) el.currentTime = sampleStart
        void el.play().catch(() => setSamplePlaying(false))
      }
      if (el.readyState >= 1) seekAndPlay()
      else el.addEventListener('loadedmetadata', seekAndPlay, { once: true })
    },
    [sampleStart],
  )
  // Clip window: the sample is only the chosen slice. Keep playback inside
  // [start, start+duration] — a viewer can never scrub back into footage
  // before the sample or run on past its end. Reaching the end stops it.
  useEffect(() => {
    if (!samplePlaying) return
    const el = sampleVideoRef.current
    if (!el) return
    const lo = Math.max(0, sampleStart)
    const hi = sampleDuration > 0 ? sampleStart + sampleDuration : Infinity
    const clamp = () => {
      if (el.currentTime >= hi) {
        stopSample()
        return
      }
      // Snap any seek that lands before the sample start back to the start.
      if (el.currentTime < lo - 0.3) {
        try {
          el.currentTime = lo
        } catch {
          /* noop */
        }
      }
    }
    el.addEventListener('timeupdate', clamp)
    el.addEventListener('seeking', clamp)
    return () => {
      el.removeEventListener('timeupdate', clamp)
      el.removeEventListener('seeking', clamp)
    }
  }, [samplePlaying, sampleStart, sampleDuration, stopSample])
  // Scroll-past: pause the sample when its screen leaves the viewport.
  // The observer only ARMS once the screen has actually been visible —
  // otherwise starting from the hero (which smooth-scrolls to the sample)
  // would fire ratio≈0 immediately and kill the playback it protects.
  useEffect(() => {
    if (!samplePlaying) return
    const screen = sampleScreenRef.current
    if (!screen) return
    let armed = false
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.5) armed = true
          else if (armed && e.intersectionRatio < 0.35) stopSample()
        }
      },
      { threshold: [0, 0.35, 0.5, 0.7] },
    )
    io.observe(screen)
    return () => io.disconnect()
  }, [samplePlaying, stopSample])

  // ── FAQ accordion — design's measured-height open/close ──
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const faqWrapRefs = useRef<(HTMLDivElement | null)[]>([])
  const faqClipRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    faqWrapRefs.current.forEach((wrap, i) => {
      if (!wrap) return
      const clip = faqClipRefs.current[i]
      wrap.style.height =
        openFaq === i && clip ? `${clip.scrollHeight}px` : '0px'
    })
  }, [openFaq, faq])

  // ── strip arrows: show/hide by scroll position (the design's script) ──
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [showPrev, setShowPrev] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const updateArrows = useCallback(() => {
    const strip = stripRef.current
    if (!strip) return
    const max = strip.scrollWidth - strip.clientWidth - 2
    setShowPrev(strip.scrollLeft > 2)
    setShowNext(strip.scrollLeft < max)
  }, [])
  useEffect(() => {
    if (!isEpisodic) return
    updateArrows()
    const strip = stripRef.current
    if (!strip) return
    strip.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    const raf = requestAnimationFrame(updateArrows)
    return () => {
      strip.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
      cancelAnimationFrame(raf)
    }
  }, [isEpisodic, updateArrows])
  const scrollStrip = (dir: 1 | -1) => {
    const strip = stripRef.current
    if (!strip) return
    strip.scrollBy({ left: dir * strip.clientWidth, behavior: 'smooth' })
  }

  // ── hero container widths — resized by dragging the handle on the title /
  //    description container edge. Live values are tagged with the committed
  //    value they were adjusted from (same pattern as the cover reposition),
  //    so a debounced commit or a server refetch naturally takes back over
  //    once it lands. `null` = design default ("Auto").
  const [liveTitleW, setLiveTitleW] = useState<{
    v: number | null
    base: number | null
  } | null>(null)
  const [liveDescW, setLiveDescW] = useState<{
    v: number | null
    base: number | null
  } | null>(null)
  const committedTitleW = heroTitleWidth ?? null
  const committedDescW = heroDescWidth ?? null
  const effTitleW =
    liveTitleW && liveTitleW.base === committedTitleW
      ? liveTitleW.v
      : committedTitleW
  const effDescW =
    liveDescW && liveDescW.base === committedDescW
      ? liveDescW.v
      : committedDescW
  const setHeroWidth = (which: 'title' | 'desc', pct: number | null) => {
    if (which === 'title') setLiveTitleW({ v: pct, base: committedTitleW })
    else setLiveDescW({ v: pct, base: committedDescW })
    onHeroWidth?.(which, pct)
  }
  // Whether the drag-to-resize wrappers render. On the public page (and any
  // non-editable surface) the saved widths are applied straight to the text
  // elements instead — no wrapper markup.
  const widthEditable = editable && Boolean(onHeroWidth)
  // Lifts the text element's own design cap (14ch / 62ch / 580px) so the
  // wrapper's creator-set width governs the wrap point.
  const UNCAP: React.CSSProperties = { maxWidth: 'none' }
  // Public-page inline overrides, applied directly to the text elements.
  // Marquee title + description keep their design ch-caps until the creator
  // sets a width; the cover unlocks its 760px content cap only when a width
  // is set, keeping the title / description at their old effective bounds
  // otherwise.
  const titleWidthStyle: React.CSSProperties | undefined =
    effTitleW != null ? { maxWidth: `${effTitleW}%` } : undefined
  const descWidthStyle: React.CSSProperties | undefined =
    effDescW != null ? { maxWidth: `${effDescW}%` } : undefined
  const coverAnyWidth = effTitleW != null || effDescW != null
  const coverContentStyle: React.CSSProperties | undefined = coverAnyWidth
    ? { maxWidth: 'none' }
    : undefined
  const coverTitleStyle: React.CSSProperties | undefined =
    effTitleW != null
      ? { maxWidth: `${effTitleW}%` }
      : coverAnyWidth
        ? { maxWidth: 760 }
        : undefined
  const coverDescStyle: React.CSSProperties | undefined =
    effDescW != null ? { maxWidth: `${effDescW}%` } : undefined
  // Mobile-scoped widths, carried as CSS vars — the visitor-mobile rules
  // (MOBILE_VISITOR_CSS) apply them ONLY at phone size.
  const twMobileVar = cssVar(
    '--tw-m',
    heroTitleWidthMobile != null ? `${heroTitleWidthMobile}%` : null,
  )
  const dwMobileVar = cssVar(
    '--dw-m',
    heroDescWidthMobile != null ? `${heroDescWidthMobile}%` : null,
  )

  // ── Spaire Title Style — the creator-picked "movie title" typeface for
  //    the hero headline. Classic (null) keeps the design's own font. ──
  const [fontPanelOpen, setFontPanelOpen] = useState(false)
  const heroFontFamily = titleFontFamily(heroTitleFont)
  const titleFontStyle: React.CSSProperties | undefined = heroFontFamily
    ? { fontFamily: heroFontFamily }
    : undefined

  const fontPanel =
    editable && onHeroTitleFont && fontPanelOpen ? (
      <div
        className="hero-font-panel"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="hf-title">Title style</div>
        <div className="hf-sub">The typeface your title wears.</div>
        <button
          type="button"
          className={`hf-row ${!heroTitleFont ? 'active' : ''}`}
          onClick={() => onHeroTitleFont(null)}
        >
          <span className="hf-name">
            Classic <em>Default</em>
          </span>
          <span className="hf-preview">{title}</span>
        </button>
        {TITLE_FONTS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`hf-row ${heroTitleFont === f.key ? 'active' : ''}`}
            onClick={() => onHeroTitleFont(f.key)}
          >
            <span className="hf-name">
              {f.label} <em>{f.mood}</em>
            </span>
            <span className="hf-preview" style={{ fontFamily: f.fontFamily }}>
              {title}
            </span>
          </button>
        ))}
      </div>
    ) : null

  const themeToggle = onToggleDark ? (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Toggle dark mode"
      onClick={onToggleDark}
    >
      <svg
        className="ic-moon"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg
        className="ic-sun"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  ) : null

  // ── CTA label fitter ── the hero pills share one row, and a long label
  //    ("Subscribe — $89 / month") must NEVER wrap mid-pill. The labels are
  //    nowrap; when one overflows its pill, step its font down (16 → 10px)
  //    until it fits on the single line. Runs after every render (labels
  //    are props) and again on resize.
  const gppRootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = gppRootRef.current
    if (!root) return
    const fit = () => {
      const btns = root.querySelectorAll<HTMLElement>(
        '.hero-actions .btn-trailer, .hero-actions .btn-enroll, .band-actions .abtn',
      )
      btns.forEach((b) => {
        b.style.fontSize = ''
        let size = parseFloat(getComputedStyle(b).fontSize)
        // scrollWidth rounds up — 1px slack so exact fits don't shrink.
        while (b.scrollWidth > b.clientWidth + 1 && size > 10) {
          size -= 0.5
          b.style.fontSize = `${size}px`
        }
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(root)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  })

  // free_preview mode marks every locked lesson with a Free / lock chip.
  const showChips = paywallEnabled && trialMode === 'free_preview'
  // Regardless of trial mode, a lesson that's been set to free preview should
  // wear a "Free" badge so viewers can see what's actually free to watch —
  // otherwise (e.g. in lesson_sample mode) nothing signals the free lessons.
  const markFreeOnly = paywallEnabled && !showChips

  const PillImageIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-4.35-4.35a1.4 1.4 0 0 0-2 0L5 20" />
    </svg>
  )

  // The design's creator bar: frosted Add pills + the theme toggle.
  const creatorBarVisible = Boolean(
    (editable && (onAddCover || onAddTrailer || onCoverPosition)) ||
    onToggleDark,
  )
  const creatorBar = !creatorBarVisible ? null : (
    <div className="creator-bar">
      {editable && onAddCover && (
        <button
          className="add-pill is-cover"
          type="button"
          onClick={onAddCover}
          disabled={coverBusy}
        >
          {PillImageIcon}
          <span>
            {coverBusy ? 'Uploading…' : coverUrl ? 'Change cover' : 'Add cover'}
          </span>
        </button>
      )}
      {editable && coverUrl && onCoverPosition && (
        <button
          className={`add-pill is-reposition ${repositioning ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setRepositioning((r) => !r)
            cancelPeek()
          }}
          title="Drag the cover to reposition it"
        >
          ⤧ {repositioning ? 'Done' : 'Reposition'}
        </button>
      )}
      {editable && onHeroTitleFont && (
        <button
          className={`add-pill is-font ${fontPanelOpen ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setFontPanelOpen((o) => !o)
            setTrailerPeek(false)
          }}
          title="Pick a title style"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 20L12 4l8 16M7 14h10" />
          </svg>
          <span>{fontPanelOpen ? 'Done' : 'Title style'}</span>
        </button>
      )}
      {editable && onAddTrailer && (
        <button
          className="add-pill"
          type="button"
          onClick={onAddTrailer}
          disabled={trailerBusy}
        >
          <svg
            className="add-pill-ic"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d={PLAY_PATH} />
          </svg>
          <span>
            {trailerBusy
              ? trailerPct != null
                ? `Uploading ${trailerPct}%`
                : 'Uploading…'
              : trailerUrl
                ? 'Change trailer'
                : 'Add trailer'}
          </span>
        </button>
      )}
      {themeToggle}
      {fontPanel}
    </div>
  )

  // Hover-trailer layer — shared by both heroes. Sits above the still,
  // below the text/band. Fades in while peeking. Muted state is controlled
  // imperatively in the peek effect (we want sound on hover), so no static
  // `muted` attribute here — it would re-mute the element on every re-render.
  const trailerLayer = trailerUrl ? (
    <video
      ref={trailerVideoRef}
      className={`trailer-layer ${trailerPeek ? 'on' : ''}`}
      src={trailerUrl}
      playsInline
      loop
      preload="metadata"
    />
  ) : null
  // Arm the peek on an 800ms fuse so a cursor merely passing through the hero
  // never starts playback — leaving before the fuse burns cancels it, leaving
  // during playback stops the video immediately (back to the poster).
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPeek = useCallback(() => {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current)
      peekTimerRef.current = null
    }
    setTrailerPeek(false)
  }, [])
  useEffect(
    () => () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
    },
    [],
  )
  const heroHoverProps =
    trailerUrl && !repositioning
      ? {
          onMouseEnter: () => {
            if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
            peekTimerRef.current = setTimeout(() => {
              peekTimerRef.current = null
              setTrailerPeek(true)
            }, 800)
          },
          onMouseLeave: cancelPeek,
        }
      : {}
  const repositionProps = repositioning
    ? {
        onPointerDown: onDragStart,
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
      }
    : {}

  // ── spotlight card — design's .card from Course Page Empty State ──
  // Vary the ambient tint per card so unfilled tiles keep the row's visual
  // rhythm (the design's formula; n is the 1-based card number).
  const ambientTint = (n: number): React.CSSProperties => ({
    filter: `blur(40px) hue-rotate(${((n * 53) % 44) - 22}deg) brightness(${(
      0.94 +
      (n % 3) * 0.06
    ).toFixed(2)})`,
  })

  // A locked lesson opens the enroll sheet (the design's paywall modal);
  // an unlocked one plays via onLessonClick. Editing controls inside the
  // card stop their own propagation, so this only fires on the card body.
  const lessonClickable = (l: GeneratedLesson) =>
    l.locked || Boolean(onLessonClick)
  const handleLessonClick = (l: GeneratedLesson) => {
    if (l.locked) setEnrollLesson({ n: l.flatIdx + 1, title: l.title })
    else onLessonClick?.(l.flatIdx)
  }

  const spotlightCard = (l: GeneratedLesson) => (
    <div
      className={`card ${l.imageUrl ? 'filled' : ''}`}
      key={l.flatIdx}
      onClick={lessonClickable(l) ? () => handleLessonClick(l) : undefined}
      role={lessonClickable(l) ? 'button' : undefined}
    >
      <div className="ph-ambient" style={ambientTint(l.flatIdx + 1)} />
      <div className="glass-tint" />
      {l.imageUrl ? (
        // A real <img> (not a CSS background) so the rail can lazy-load
        // off-screen cards and recover from failed fetches — see LessonThumb.
        <LessonThumb
          src={l.imageUrl}
          position={l.imagePosition}
          positionMobile={l.imagePositionMobile}
          className="photo"
          eager={l.flatIdx === 0}
        />
      ) : (
        <div className="photo" />
      )}
      <div className="photo-shade" />
      {showChips ? (
        l.free ? (
          <FreeChip />
        ) : (
          <LockChip />
        )
      ) : markFreeOnly && l.free ? (
        <FreeChip />
      ) : null}
      {editable && onAddLessonImage && (
        <button
          className="card-add"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAddLessonImage(l.flatIdx)
          }}
        >
          {lessonImageBusy === l.flatIdx ? (
            'Uploading…'
          ) : (
            <>
              {PillImageIcon}
              Add image or cover
            </>
          )}
        </button>
      )}
      {editable && l.imageUrl && onRepositionLesson && (
        <button
          className="card-add is-repos"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setReposIdx(l.flatIdx)
          }}
        >
          ⤧ Reposition
        </button>
      )}
      <div className="card-info">
        <div className="ep">
          {unitCap} {l.flatIdx + 1}
        </div>
        <EditText
          editable={editable}
          onEditText={onEditText}
          field="lessonTitle"
          value={l.title}
          className="title"
          tag="div"
          ctx={{ flatIdx: l.flatIdx }}
        />
        <EditText
          editable={editable}
          onEditText={onEditText}
          field="lessonDesc"
          value={l.description}
          className="desc"
          tag="div"
          ctx={{ flatIdx: l.flatIdx }}
        />
        <div className="foot">
          <span className="time">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d={PLAY_PATH} />
            </svg>
            {l.durationLabel || '0m'}
          </span>
          <span className="dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  )

  // ── catalog card — design's .lc-catalog from Marquee Course Page ──
  const catalogCard = (l: GeneratedLesson) => (
    <div
      className="lc-catalog"
      key={l.flatIdx}
      onClick={lessonClickable(l) ? () => handleLessonClick(l) : undefined}
      role={lessonClickable(l) ? 'button' : undefined}
    >
      <div className="lc-card">
        <div className={`lc-thumb ${l.imageUrl ? '' : 'ph'}`}>
          {l.imageUrl ? (
            <LessonThumb
              src={l.imageUrl}
              position={l.imagePosition}
              positionMobile={l.imagePositionMobile}
              eager={l.flatIdx === 0}
            />
          ) : (
            <>
              <div className="ph-ambient" style={ambientTint(l.flatIdx + 1)} />
              <div className="glass-tint" />
            </>
          )}
          {showChips ? (
            l.free ? (
              <FreeChip />
            ) : (
              <LockChip />
            )
          ) : markFreeOnly && l.free ? (
            <FreeChip />
          ) : null}
          {editable && onAddLessonImage && (
            <button
              className="thumb-add"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAddLessonImage(l.flatIdx)
              }}
            >
              {lessonImageBusy === l.flatIdx ? (
                'Uploading…'
              ) : (
                <>
                  {PillImageIcon}
                  Add image or cover
                </>
              )}
            </button>
          )}
          {editable && l.imageUrl && onRepositionLesson && (
            <button
              className="thumb-add is-repos"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setReposIdx(l.flatIdx)
              }}
            >
              ⤧ Reposition
            </button>
          )}
          {l.durationLabel && (
            <div className="lc-dur">
              <ClockIcon />
              <span>{l.durationLabel}</span>
            </div>
          )}
          {onLessonClick && (
            <div className="lc-play">
              <div className="lc-play-btn">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>
        <div className="lc-info">
          <div className="lc-num">
            {unitCap} {l.flatIdx + 1}
          </div>
          <EditText
            editable={editable}
            onEditText={onEditText}
            field="lessonTitle"
            value={l.title}
            className="lc-title"
            tag="div"
            ctx={{ flatIdx: l.flatIdx }}
          />
          <EditText
            editable={editable}
            onEditText={onEditText}
            field="lessonDesc"
            value={l.description}
            className="lc-desc"
            tag="div"
            ctx={{ flatIdx: l.flatIdx }}
          />
          <div className="lc-meta">
            <ClockIcon />
            <span>{l.durationLabel || '0m'}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const card = cardVariant === 'spotlight' ? spotlightCard : catalogCard

  return (
    <div
      ref={gppRootRef}
      className={`gpp ${dark ? 'dark' : ''} ${isEpisodic ? 'epi' : ''} ${
        phoneCanvas ? 'gpp-m' : ''
      }`}
    >
      {/* ════════ MARQUEE HERO (Marquee Course Page.html) ════════ */}
      {heroVariant === 'marquee' ? (
        <header
          ref={heroRef as React.RefObject<HTMLElement>}
          className={`panel ${coverUrl ? 'filled' : ''} ${
            repositioning ? 'repositioning' : ''
          }`}
          {...heroHoverProps}
          {...repositionProps}
        >
          {coverUrl ? (
            <>
              <div
                className="panel-art gpp-mpos"
                style={{
                  backgroundImage: `url('${coverUrl}')`,
                  backgroundPosition: effectiveCoverPos || 'center 18%',
                  ...mobilePosVars(
                    effectiveCoverPos || 'center 18%',
                    coverPositionMobile,
                  ),
                }}
              />
              {trailerLayer}
              <div className="panel-scrim" />
            </>
          ) : (
            <>
              <div className="ph-ambient" />
              <div className="glass-tint" />
              {trailerLayer}
              <div className="hero-ph-glyph">
                <ImageGlyph />
              </div>
            </>
          )}
          <div className="panel-grain" />

          {brand ? <div className="panel-brand rise">{brand}</div> : null}
          {creatorBar}

          {/* Mobile-only centered Add cover (matches the cover hero). */}
          {editable && onAddCover && (
            <button
              className="hero-cta"
              type="button"
              onClick={onAddCover}
              disabled={coverBusy}
            >
              {PillImageIcon}
              <span>
                {coverBusy
                  ? 'Uploading…'
                  : coverUrl
                    ? 'Change cover'
                    : 'Add cover'}
              </span>
            </button>
          )}

          <div className="panel-title">
            <EditText
              editable={editable}
              onEditText={onEditText}
              field="eyebrow"
              value={eyebrow}
              className="pt-eyebrow rise d1"
              tag="div"
            />
            <ResizableWidth
              enabled={widthEditable}
              pct={effTitleW}
              onPct={(p) => setHeroWidth('title', p)}
              innerStyle={
                effTitleW != null ? { maxWidth: `${effTitleW}%` } : undefined
              }
              label="title"
            >
              <EditText
                editable={editable}
                onEditText={onEditText}
                field="title"
                value={title}
                className="pt-h rise d1"
                tag="h1"
                style={{
                  ...(widthEditable
                    ? effTitleW != null
                      ? UNCAP
                      : undefined
                    : titleWidthStyle),
                  ...titleFontStyle,
                  ...twMobileVar,
                }}
              />
            </ResizableWidth>
          </div>

          <div className="band rise d2">
            <div className="band-actions">
              <button className="abtn play" type="button" onClick={playPrimary}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d={PLAY_PATH} />
                </svg>
                Play Trailer
              </button>
              <button className="abtn buy" type="button" onClick={onBuy}>
                {buyLabel}
              </button>
              {freeLine || editable ? (
                <EditText
                  editable={editable}
                  onEditText={onEditText}
                  field="freeLine"
                  value={freeLine}
                  className="band-free"
                  tag="div"
                  maxLength={80}
                  placeholder="Add a price note"
                />
              ) : null}
            </div>

            <div className="band-desc">
              {/* Unclamp only when the text is actually editable — the
                  reposition-only phone canvas keeps the visitor's clamp. */}
              <div
                className={`bd-descwrap ${
                  descExpanded || (editable && onEditText) ? '' : 'clamped'
                }`}
              >
                <ResizableWidth
                  enabled={widthEditable}
                  pct={effDescW}
                  onPct={(p) => setHeroWidth('desc', p)}
                  innerStyle={
                    effDescW != null
                      ? { maxWidth: `${effDescW}%` }
                      : undefined
                  }
                  label="description"
                >
                  <EditText
                    editable={editable}
                    onEditText={onEditText}
                    field="desc"
                    value={desc}
                    className="bd-text"
                    tag="p"
                    style={{
                      ...(widthEditable
                        ? effDescW != null
                          ? UNCAP
                          : undefined
                        : descWidthStyle),
                      ...dwMobileVar,
                    }}
                  />
                </ResizableWidth>
                {!(editable && onEditText) && !descExpanded && (
                  <button
                    className="bd-more"
                    type="button"
                    onClick={() => setDescExpanded(true)}
                    aria-label="Show full description"
                  >
                    <span>MORE</span>
                  </button>
                )}
              </div>
              <div className="bd-meta">
                <span className="bd-meta-eyebrow">
                  {eyebrow}&nbsp;&nbsp;·&nbsp;&nbsp;
                </span>
                {year}&nbsp;&nbsp;·&nbsp;&nbsp;{lessonCount} {unitCap}
                {lessonCount === 1 ? '' : 's'}&nbsp;&nbsp;·&nbsp;&nbsp;
                {metaDuration}
              </div>
              <div className="bd-badges">
                {badges.map((b, i) =>
                  editable && onRemoveBadge ? (
                    <span key={i} className="gpp-chip-wrap">
                      <EditText
                        editable={editable}
                        onEditText={onEditText}
                        field="bdg"
                        value={b}
                        className={i === 0 ? 'bdg rate' : 'bdg'}
                        tag="span"
                        ctx={{ idx: i }}
                        maxLength={40}
                      />
                      <button
                        type="button"
                        className="gpp-remove gpp-remove-chip"
                        title="Remove badge"
                        onClick={() => onRemoveBadge(i)}
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <EditText
                      key={i}
                      editable={editable}
                      onEditText={onEditText}
                      field="bdg"
                      value={b}
                      className={i === 0 ? 'bdg rate' : 'bdg'}
                      tag="span"
                      ctx={{ idx: i }}
                      maxLength={40}
                    />
                  ),
                )}
                {editable && onAddBadge && (
                  <button
                    type="button"
                    className="gpp-add gpp-add-chip"
                    onClick={onAddBadge}
                  >
                    + Add
                  </button>
                )}
                {/* The free SAMPLE lives here in the metadata row, alongside
                    the badge chips — the big CTA above is already the
                    trailer. Renders only when a real, playable sample is
                    configured; no sample, no chip. */}
                {hasSampleSection && (
                  <button
                    className="bd-trailer"
                    type="button"
                    onClick={startSample}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d={PLAY_PATH} />
                    </svg>
                    Sample
                  </button>
                )}
              </div>
            </div>

            <div className="band-cast">
              <div className="bc-k">Instructor</div>
              <EditText
                editable={editable}
                onEditText={onEditText}
                field="instructorName"
                value={instructorName}
                className="bc-v"
                tag="div"
              />
              <EditText
                editable={editable}
                onEditText={onEditText}
                field="byline"
                value={byline}
                className="bc-sub"
                tag="div"
              />
            </div>
          </div>
        </header>
      ) : (
        /* ════════ COVER HERO (Course Page Empty State.html) ════════ */
        <section
          ref={heroRef as React.RefObject<HTMLElement>}
          className={`hero ${coverUrl ? 'filled' : ''} ${
            repositioning ? 'repositioning' : ''
          }`}
          {...heroHoverProps}
          {...repositionProps}
        >
          <div className="ph-ambient" />
          <div className="hero-art" />
          <div
            className="photo gpp-mpos"
            style={
              coverUrl
                ? {
                    backgroundImage: `url("${coverUrl}")`,
                    backgroundPosition: effectiveCoverPos || 'center',
                    ...mobilePosVars(
                      effectiveCoverPos || 'center',
                      coverPositionMobile,
                    ),
                  }
                : undefined
            }
          />
          {trailerLayer}
          <div className="photo-shade" />
          <div className="hero-ph">
            <ImageGlyph />
          </div>
          <div className="hero-shade" />
          <div className="hero-blend" />
          {/* Film grain — a mobile-only detail from the cover design; the
              base rule hides it, the ≤640px block reveals it. */}
          <div className="hero-grain" />

          {brand ? (
            <div className="hero-eyebrow">
              <span className="dot" />
              <span>{brand}</span>
            </div>
          ) : null}

          {creatorBar}

          {/* Mobile-only centered Add cover (the design moves cover upload
              out of the icon-pill bar on phones). Hidden ≥640px by default. */}
          {editable && onAddCover && (
            <button
              className="hero-cta"
              type="button"
              onClick={onAddCover}
              disabled={coverBusy}
            >
              {PillImageIcon}
              <span>
                {coverBusy
                  ? 'Uploading…'
                  : coverUrl
                    ? 'Change cover'
                    : 'Add cover'}
              </span>
            </button>
          )}

          <div className="hero-content" style={coverContentStyle}>
            <div className="hero-meta">
              <EditText
                editable={editable}
                onEditText={onEditText}
                field="badge"
                value={badge}
                className="badge"
              />
              <div className="meta-line">
                <span>
                  {lessonCount} {unit}
                  {lessonCount === 1 ? '' : 's'}
                </span>
                <span className="sep">·</span>
                <span>{metaDuration}</span>
                <span className="sep">·</span>
                <span>All levels</span>
              </div>
            </div>

            {editable && onEditText ? (
              // Edit the SAME headline the public sees: ai_hero.titleLines when
              // present (one row per line), else the course title. Multiline so
              // the two-line break is preserved and editable, instead of
              // editing a flat title the public page would ignore.
              <ResizableWidth
                enabled={widthEditable}
                pct={effTitleW}
                onPct={(p) => setHeroWidth('title', p)}
                innerStyle={
                  effTitleW != null
                    ? { maxWidth: `${effTitleW}%` }
                    : coverAnyWidth
                      ? { maxWidth: 760 }
                      : undefined
                }
                label="title"
              >
                <EditText
                  editable={editable}
                  onEditText={onEditText}
                  field="heroTitle"
                  value={
                    titleLines && titleLines.length > 0
                      ? titleLines.join('\n')
                      : title
                  }
                  className="hero-title"
                  tag="h1"
                  multiline
                  placeholder="Add a headline"
                  style={{
                    ...(widthEditable ? undefined : coverTitleStyle),
                    ...titleFontStyle,
                    ...twMobileVar,
                  }}
                />
              </ResizableWidth>
            ) : (
              // Width wrapper here too — the phone canvas renders this
              // branch (editable without text editing) and must still offer
              // the title-width drag handle.
              <ResizableWidth
                enabled={widthEditable}
                pct={effTitleW}
                onPct={(p) => setHeroWidth('title', p)}
                innerStyle={
                  effTitleW != null
                    ? { maxWidth: `${effTitleW}%` }
                    : coverAnyWidth
                      ? { maxWidth: 760 }
                      : undefined
                }
                label="title"
              >
                <h1
                  className="hero-title"
                  style={{
                    ...(widthEditable
                      ? effTitleW != null
                        ? UNCAP
                        : undefined
                      : coverTitleStyle),
                    ...titleFontStyle,
                    ...twMobileVar,
                  }}
                >
                  {titleLines && titleLines.length > 1
                    ? titleLines.map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))
                    : title}
                </h1>
              </ResizableWidth>
            )}

            <ResizableWidth
              enabled={widthEditable}
              pct={effDescW}
              onPct={(p) => setHeroWidth('desc', p)}
              innerStyle={
                effDescW != null ? { maxWidth: `${effDescW}%` } : undefined
              }
              label="description"
            >
              <p
                className="hero-desc"
                style={{
                  ...(widthEditable
                    ? effDescW != null
                      ? UNCAP
                      : undefined
                    : coverDescStyle),
                  ...dwMobileVar,
                }}
              >
                <EditText
                  editable={editable}
                  onEditText={onEditText}
                  field="desc"
                  value={desc}
                />{' '}
                {/* The cover byline is always just "With <instructor>" — it
                  mirrors the instructor name, not the AI credential line (that
                  credential still runs bottom-right on the Marquee). */}
                {instructorName ? (
                  <span className="with">— With {instructorName}</span>
                ) : null}
              </p>
            </ResizableWidth>

            <div className="hero-actions">
              {showTrailerButton && (
                <button
                  className="btn-trailer"
                  type="button"
                  onClick={playPrimary}
                >
                  <span className="play">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d={PLAY_PATH} />
                    </svg>
                  </span>
                  Play Trailer
                </button>
              )}
              <button className="btn-enroll" type="button" onClick={onBuy}>
                {buyLabel}
                <svg
                  width="15"
                  height="15"
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
          </div>
        </section>
      )}

      {/* ════════ INSTRUCTOR (Course Page Empty State.html) ════════ */}
      {(instructorName || instructorSub || instructorBio.length > 0) &&
        !isSectionHidden('instructor') && (
          <section className={`instructor ${editable ? 'gpp-section' : ''}`}>
            {editable && sectionHideControl('instructor')}
            <div className="inst-inner">
              <div className="inst-copy">
                <div className="inst-head">
                  <div
                    className={`inst-avatar ${avatarUrl ? 'filled' : ''} ${
                      editable && onEditAvatar ? 'editable-avatar' : ''
                    }`}
                    {...(editable && onEditAvatar
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          title: 'Edit instructor photo',
                          onClick: onEditAvatar,
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onEditAvatar()
                            }
                          },
                        }
                      : {})}
                  >
                    <div className="ph-ambient" />
                    <div className="glass-tint" />
                    <div
                      className="photo"
                      style={
                        avatarUrl
                          ? { backgroundImage: `url("${avatarUrl}")` }
                          : undefined
                      }
                    />
                    <svg
                      className="av-ic"
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="8" r="3.6" />
                      <path d="M5 20c.8-3.6 3.7-5.6 7-5.6s6.2 2 7 5.6" />
                    </svg>
                    {editable && onEditAvatar && (
                      <div className="av-edit" aria-hidden>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                          <path d="M13.5 6.5l3 3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="inst-id">
                    <EditText
                      editable={editable}
                      onEditText={onEditText}
                      field="instructorName"
                      value={instructorName}
                      className="inst-name"
                      tag="h2"
                    />
                    <EditText
                      editable={editable}
                      onEditText={onEditText}
                      field="instructorSub"
                      value={instructorSub}
                      className="inst-sub"
                      tag="p"
                    />
                  </div>
                </div>
                {instructorBio.map((p, i) =>
                  editable && onRemoveBioParagraph ? (
                    <div key={i} className="gpp-row">
                      <EditText
                        editable={editable}
                        onEditText={onEditText}
                        field="instructorBioP"
                        value={p}
                        className="inst-bio"
                        tag="p"
                        ctx={{ idx: i }}
                        placeholder="Add a paragraph about the instructor"
                      />
                      <button
                        type="button"
                        className="gpp-remove"
                        title="Remove paragraph"
                        onClick={() => onRemoveBioParagraph(i)}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <EditText
                      key={i}
                      editable={editable}
                      onEditText={onEditText}
                      field="instructorBioP"
                      value={p}
                      className="inst-bio"
                      tag="p"
                      ctx={{ idx: i }}
                    />
                  ),
                )}
                {editable && onAddBioParagraph && (
                  <button
                    type="button"
                    className="gpp-add"
                    onClick={onAddBioParagraph}
                  >
                    + Add paragraph
                  </button>
                )}
              </div>

              <div
                ref={portraitRef}
                className={`inst-media ${portraitUrl ? 'filled' : ''} ${
                  portraitReposing ? 'repositioning' : ''
                }`}
                {...portraitReposProps}
              >
                <div className="ph-ambient" />
                <div className="glass-tint" />
                <div
                  className="photo gpp-mpos"
                  style={
                    portraitUrl
                      ? {
                          backgroundImage: `url("${portraitUrl}")`,
                          backgroundPosition: effectivePortraitPos || 'center',
                          ...mobilePosVars(
                            effectivePortraitPos || 'center',
                            portraitPositionMobile,
                          ),
                        }
                      : undefined
                  }
                />
                <div className="photo-shade" />
                {!portraitUrl && (
                  <div className="ph-cta">
                    {editable && onAddPortrait ? (
                      <>
                        <span
                          className="ph-ic"
                          role="button"
                          tabIndex={0}
                          onClick={onAddPortrait}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                              onAddPortrait()
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="8" r="3.6" />
                            <path d="M5 20c.8-3.6 3.7-5.6 7-5.6s6.2 2 7 5.6" />
                          </svg>
                        </span>
                        <span className="ph-k">
                          {portraitBusy ? 'Uploading…' : 'Add a portrait'}
                        </span>
                        <span className="ph-s">
                          A square photo of you mid-lesson works best
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                {(editable || portraitCaption) && (
                  <EditText
                    editable={editable}
                    onEditText={onEditText}
                    field="portraitCaption"
                    value={portraitCaption}
                    className="inst-caption"
                    tag="div"
                    placeholder="Add a caption"
                  />
                )}
                {editable && onAddPortrait && portraitUrl && (
                  <button
                    className="change-pill"
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onAddPortrait}
                  >
                    {PillImageIcon}
                    Change
                  </button>
                )}
                {editable && onPortraitPosition && portraitUrl && (
                  <button
                    className="change-pill portrait-repos-pill"
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setPortraitReposing((v) => !v)}
                    title="Drag the photo to reposition it"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
                    </svg>
                    {portraitReposing ? 'Done' : 'Reposition'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

      {/* ════════ FREE SAMPLE (Course Page Empty State.html) ════════ */}
      {hasSampleSection && !isSectionHidden('sample') && (
        <section className={`sample ${editable ? 'gpp-section' : ''}`}>
          {editable && sectionHideControl('sample')}
          <div className="sample-eyebrow">Free Sample</div>
          <h2>Watch a free sample</h2>
          <p className="sample-sub">
            A few minutes inside the {unit === 'episode' ? 'series' : 'course'}.
          </p>
          <div
            ref={sampleScreenRef}
            className={`sample-screen ${sampleImageUrl ? 'filled' : ''} ${
              samplePlayable ? 'playable' : ''
            } ${samplePlaying ? 'playing' : ''}`}
            onClick={
              samplePlayable && !samplePlaying
                ? sampleSrc || samplePlaybackId
                  ? startSample
                  : onSample
                : undefined
            }
            role={samplePlayable && !samplePlaying ? 'button' : undefined}
          >
            <div className="ph-ambient" />
            <div className="glass-tint" />
            <div
              className="photo"
              style={
                sampleImageUrl
                  ? { backgroundImage: `url("${sampleImageUrl}")` }
                  : undefined
              }
            />
            <div className="photo-shade" />
            {samplePlaying &&
              (sampleIsHls ? (
                <HlsVideo
                  playbackId={samplePlaybackId}
                  playbackUrl={sampleSrc}
                  poster={sampleImageUrl}
                  controls={false}
                  muted={sampleMuted}
                  // The sample has no caption control, so captions must never
                  // show — otherwise native HLS turns them on for mobile
                  // visitors while desktop (hls.js) keeps them off.
                  hideCaptions
                  className="sample-video"
                  onVideoElement={onSampleVideoEl}
                  onEnded={stopSample}
                />
              ) : (
                <video
                  className="sample-video"
                  src={sampleSrc ?? undefined}
                  poster={sampleImageUrl ?? undefined}
                  muted={sampleMuted}
                  playsInline
                  ref={onSampleVideoEl}
                  onEnded={stopSample}
                />
              ))}
            {/* Sound toggle — the sample has no scrub bar (so it can't escape
                the clip window); this is the one control, so audio is always
                reachable even though autoplay starts muted. */}
            {samplePlaying && (
              <button
                className="sample-mute"
                type="button"
                aria-label={sampleMuted ? 'Unmute sample' : 'Mute sample'}
                onClick={(e) => {
                  e.stopPropagation()
                  setSampleMuted((m) => !m)
                }}
              >
                {sampleMuted ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M5 9v6h4l5 5V4L9 9H5zm12.59 3l2.7-2.7-1.42-1.42-2.7 2.71-2.71-2.71-1.41 1.42 2.7 2.7-2.7 2.7 1.41 1.42 2.71-2.71 2.7 2.71 1.42-1.42-2.7-2.7z" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
                  </svg>
                )}
              </button>
            )}
            {samplePlayable && !samplePlaying ? (
              <div className="ph-cta">
                <span className="ph-ic">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d={PLAY_PATH} />
                  </svg>
                </span>
              </div>
            ) : editable && onConfigureSample && !samplePlaying ? (
              // The design's "Add your sample" CTA, wired to the existing
              // sample configuration (pick a lesson + clip window).
              <div className="ph-cta">
                <span
                  className="ph-ic"
                  role="button"
                  tabIndex={0}
                  onClick={onConfigureSample}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onConfigureSample()
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="ph-k">Set up your sample</span>
                <span className="ph-s">A 2–3 minute clip from any {unit}</span>
              </div>
            ) : null}
            {editable &&
              onConfigureSample &&
              samplePlayable &&
              !samplePlaying && (
                <button
                  className="change-pill"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onConfigureSample()
                  }}
                >
                  {PillImageIcon}
                  Change
                </button>
              )}
          </div>
        </section>
      )}

      {/* ════════ LESSONS — module rows (CPES) or episode strip (MCP) ════════ */}
      {!isSectionHidden('lessons') &&
        (isEpisodic ? (
          <div className={`lessons ${editable ? 'gpp-section' : ''}`}>
            {editable && sectionHideControl('lessons')}
            <div className="row-head strip-rh">
              {/* The strip lists every episode (locked ones included), so it's
                  "Episodes" on every breakpoint — the old mobile "Free preview"
                  label mislabelled paid episodes as free. */}
              <span className="rh">Episodes</span>
            </div>
            <div className="strip-wrap">
              <button
                className={`arrow prev ${showPrev ? 'show' : ''}`}
                aria-label="Previous"
                type="button"
                onClick={() => scrollStrip(-1)}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 5l-6.5 7 6.5 7" />
                </svg>
              </button>
              <button
                className={`arrow next ${showNext ? 'show' : ''}`}
                aria-label="Next"
                type="button"
                onClick={() => scrollStrip(1)}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9.5 5l6.5 7-6.5 7" />
                </svg>
              </button>
              <div className="grid" ref={stripRef}>
                {groups.flatMap((g) => g.lessons).map((l) => card(l))}
              </div>
            </div>
          </div>
        ) : (
          <div className={`lessons ${editable ? 'gpp-section' : ''}`}>
            {editable && sectionHideControl('lessons')}
            {groups.map((g, gi) => (
              <section className="row" key={gi}>
                <div className="row-head">
                  <span className="mod">Season {gi + 1}</span>
                  <EditText
                    editable={editable}
                    onEditText={onEditText}
                    field="moduleTitle"
                    value={g.title ?? ''}
                    ctx={{ groupIdx: gi }}
                  />
                </div>
                <div className="grid">{g.lessons.map((l) => card(l))}</div>
              </section>
            ))}
          </div>
        ))}

      {/* ════════ FAQ (Course Page Empty State.html) ════════ */}
      {(faq.length > 0 || (editable && onAddFaq)) &&
        !isSectionHidden('faq') && (
          <section className={`faq ${editable ? 'gpp-section' : ''}`}>
            {editable && sectionHideControl('faq')}
            <div className="faq-inner">
              <h2>Questions? Answers.</h2>
              <div className="faq-list">
                {faq.map((item, i) => (
                  <div
                    className={`faq-item ${openFaq === i ? 'open' : ''}`}
                    key={i}
                  >
                    <button
                      className="faq-q"
                      type="button"
                      onClick={() => setOpenFaq((o) => (o === i ? null : i))}
                    >
                      <EditText
                        editable={editable}
                        onEditText={onEditText}
                        field="faqQ"
                        value={item.q}
                        ctx={{ idx: i }}
                        placeholder="Add a question"
                      />
                      <svg
                        className="chev"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div
                      className="faq-a-wrap"
                      ref={(el) => {
                        faqWrapRefs.current[i] = el
                      }}
                    >
                      <div
                        className="faq-a-clip"
                        ref={(el) => {
                          faqClipRefs.current[i] = el
                        }}
                      >
                        <EditText
                          editable={editable}
                          onEditText={onEditText}
                          field="faqA"
                          value={item.a}
                          className="faq-a"
                          tag="div"
                          ctx={{ idx: i }}
                          placeholder="Add an answer"
                        />
                      </div>
                    </div>
                    {editable && onRemoveFaq && (
                      <button
                        type="button"
                        className="gpp-remove faq-x"
                        title="Remove question"
                        aria-label="Remove question"
                        onClick={() => onRemoveFaq(i)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editable && onAddFaq && (
                <div className="faq-add-row">
                  <button
                    type="button"
                    className="faq-add-btn"
                    onClick={onAddFaq}
                    title="Add question"
                    aria-label="Add question"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

      {/* ════════ HIDDEN SECTIONS (editor only) — bring any hidden body
            section back. Keeps "hide" reversible instead of destructive. ═══ */}
      {editable &&
        onSetSectionHidden &&
        BODY_SECTIONS.some((s) => isSectionHidden(s.id)) && (
          <div className="gpp-hidden-bar">
            <span className="gpp-hidden-label">Hidden sections</span>
            {BODY_SECTIONS.filter((s) => isSectionHidden(s.id)).map((s) => (
              <button
                key={s.id}
                type="button"
                className="gpp-add"
                onClick={() => onSetSectionHidden(s.id, false)}
              >
                + Show {s.label}
              </button>
            ))}
          </div>
        )}

      {/* ════════ ENROLL SHEET — a locked lesson was clicked ════════ */}
      <div
        className={`enroll-overlay ${enrollLesson ? 'show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Enroll to watch"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeEnroll()
        }}
      >
        {enrollLesson && (
          <div className="enroll-sheet">
            <div className={`es-cover ${coverUrl ? 'filled' : ''}`}>
              <div className="es-grab" />
              <div className="ph-ambient" />
              <div
                className="photo"
                style={
                  coverUrl
                    ? { backgroundImage: `url("${coverUrl}")` }
                    : undefined
                }
              />
              <div className="photo-shade" />
              {brand ? (
                <div className="es-eyebrow">
                  <span className="dot" />
                  <span>{brand}</span>
                </div>
              ) : null}
              <div className="es-title">{title}</div>
              <button
                className="es-close"
                type="button"
                aria-label="Close"
                onClick={closeEnroll}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <div className="es-body">
              <div className="es-lesson">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                  <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
                </svg>
                <span>
                  {unitCap} {enrollLesson.n} · {enrollLesson.title}
                </span>
              </div>
              <h3 className="es-h">Enroll to start watching</h3>
              <p className="es-sub">
                This {unit} is part of the{' '}
                {unit === 'episode' ? 'series' : 'course'}. Enroll once and
                every {unit} is yours — at your own pace, forever.
              </p>
              {enrollPrice && <div className="es-price">{enrollPrice}</div>}
              {enrollPriceSub && (
                <div className="es-price-sub">{enrollPriceSub}</div>
              )}
              <div className="es-actions">
                <button
                  className="es-enroll"
                  type="button"
                  onClick={() => {
                    closeEnroll()
                    onBuy?.()
                  }}
                >
                  {buyLabel}
                  <svg
                    width="15"
                    height="15"
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
                {hasSampleSection && (
                  <button
                    className="es-sample-link"
                    type="button"
                    onClick={() => {
                      closeEnroll()
                      heroRef.current
                        ?.closest('.gpp')
                        ?.querySelector('.sample')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    Watch the free sample first
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per-lesson still reposition — the same overlay the lesson editor
          uses. Position updates stream live to onRepositionLesson (caller
          debounces + persists); Replace swaps the still; Save & return just
          closes. Keyed by reposIdx so it tracks fresh lesson data. */}
      {reposLesson && reposLesson.imageUrl && (
        <RepositionInPortal
          imageUrl={reposLesson.imageUrl}
          position={reposLesson.imagePosition}
          title={reposLesson.title}
          lessonLabel={`${unitCap} ${reposLesson.flatIdx + 1}`}
          description={reposLesson.description}
          instructorName={instructorName}
          busy={lessonImageBusy === reposLesson.flatIdx}
          onReposition={(pos) => onRepositionLesson?.(reposLesson.flatIdx, pos)}
          onReplace={(file) =>
            void onReplaceLessonImage?.(reposLesson.flatIdx, file)
          }
          onClose={() => setReposIdx(null)}
        />
      )}

      {/* CSS — copied verbatim from the two design files. Selectors are
          prefixed with .gpp (root) and body.dark → .gpp.dark; keyframes get
          a gpp- prefix because this style block is global. */}
      <style jsx global>{`
        .gpp {
          --bg: #ffffff;
          --band: 255, 255, 255;
          --bt: #1d1d1f;
          --bt2: rgba(0, 0, 0, 0.56);
          --bt3: rgba(0, 0, 0, 0.4);
          --text: #1d1d1f;
          --text-2: #86868b;
          --blue: var(--color-ce-accent);
          --ink: #07080a;
          --sf:
            -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
            system-ui, sans-serif;
          --po:
            'Poppins', var(--font-poppins), -apple-system, BlinkMacSystemFont,
            system-ui, sans-serif;
          --gut: 64px;
          font-family: var(--sf);
          background: var(--bg);
          color: var(--text);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.014em;
          transition: background 0.4s ease;
          min-height: 100%;
        }
        .gpp.dark {
          --bg: #141416;
          --band: 20, 20, 22;
          --bt: #f5f5f7;
          --bt2: rgba(245, 245, 247, 0.65);
          --bt3: rgba(245, 245, 247, 0.45);
          --text: #f5f5f7;
          --text-2: rgba(245, 245, 247, 0.6);
        }
        .gpp * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .gpp button {
          font-family: inherit;
          cursor: pointer;
          border: none;
          background: none;
          color: inherit;
        }

        /* ── liquid glass: blurred ambient color under a glass tint ── */
        .gpp .ph-ambient {
          position: absolute;
          inset: -15%;
          background:
            radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
            radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
            radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
            radial-gradient(36% 46% at 28% 78%, #5d6e6a 0%, transparent 70%),
            #57544e;
          filter: blur(40px);
        }
        .gpp .glass-tint {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.18);
          -webkit-backdrop-filter: blur(60px) saturate(140%);
          backdrop-filter: blur(60px) saturate(140%);
          box-shadow: none;
        }

        /* ── uploaded photo state ── */
        .gpp .photo {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          display: none;
        }
        .gpp .photo-shade {
          position: absolute;
          inset: 0;
          display: none;
        }
        .gpp .filled .photo,
        .gpp .filled .photo-shade {
          display: block;
        }
        /* Spotlight-card stills are real <img>s (lazy-load + retry — see
           LessonThumb); mirror the background-size:cover behaviour. */
        .gpp .card img.photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .gpp .hero.filled .ph-ambient,
        .gpp .hero.filled .hero-art,
        .gpp .hero.filled .hero-ph {
          display: none;
        }
        .gpp .hero .photo-shade {
          z-index: 2; /* above the trailer-layer so the title stays readable */
          background: linear-gradient(
            0deg,
            rgba(5, 5, 8, 0.62) 0%,
            rgba(5, 5, 8, 0.28) 32%,
            transparent 58%
          );
        }
        .gpp .sample-screen.filled .ph-ambient,
        .gpp .sample-screen.filled .glass-tint {
          display: none;
        }
        .gpp .sample-screen .photo-shade {
          background: linear-gradient(
            0deg,
            rgba(7, 8, 10, 0.55) 0%,
            rgba(7, 8, 10, 0.12) 30%,
            transparent 50%
          );
        }
        .gpp .card.filled .ph-ambient,
        .gpp .card.filled .glass-tint {
          display: none;
        }
        .gpp .card .photo-shade {
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.85) 0%,
            rgba(0, 0, 0, 0.4) 40%,
            rgba(0, 0, 0, 0.1) 100%
          );
          /* Frosted blur fading up from the bottom so the episode title/meta
             read cleanly over the still — the Apple-TV spotlight look. Masked
             so only the lower portion blurs and the artwork stays crisp above. */
          -webkit-backdrop-filter: blur(16px);
          backdrop-filter: blur(16px);
          -webkit-mask-image: linear-gradient(
            to top,
            #000 0%,
            #000 24%,
            transparent 54%
          );
          mask-image: linear-gradient(
            to top,
            #000 0%,
            #000 24%,
            transparent 54%
          );
        }

        /* ============================================================ MARQUEE HERO */
        .gpp .panel {
          position: relative;
          width: 100%;
          height: 100svh;
          min-height: 640px;
          overflow: hidden;
          background: var(--ink);
          /* title + band in normal flow, anchored to the bottom — the cover
             image gets all the room above, and a tall title can never run
             under the band (it pushes the band down instead). */
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }
        .gpp .panel-art {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center 24%;
          transform: scale(1.04);
          animation: gpp-kb 26s ease-out forwards;
        }
        @keyframes gpp-kb {
          to {
            transform: scale(1.13);
          }
        }
        .gpp .panel-scrim {
          position: absolute;
          inset: 0;
          z-index: 2; /* above the trailer-layer so band/title stay readable */
          background: linear-gradient(
            115deg,
            rgba(0, 0, 0, 0.55) 0%,
            rgba(0, 0, 0, 0.16) 40%,
            transparent 62%
          );
        }
        .gpp .panel-grain {
          position: absolute;
          inset: 0;
          opacity: 0.05;
          pointer-events: none;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .gpp .hero-ph-glyph {
          position: absolute;
          top: 38%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1;
          color: rgba(255, 255, 255, 0.22);
          pointer-events: none;
        }
        .gpp .panel-brand {
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
        .gpp .panel .theme-toggle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(20, 20, 24, 0.4);
          color: #fff;
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          box-shadow: none;
          display: grid;
          place-items: center;
          transition:
            background 0.2s,
            transform 0.16s;
        }
        .gpp .panel .theme-toggle:hover {
          background: rgba(40, 40, 46, 0.6);
          transform: scale(1.06);
        }
        .gpp .panel .theme-toggle:active {
          transform: scale(0.94);
        }
        .gpp .theme-toggle .ic-sun {
          display: none;
        }
        .gpp.dark .theme-toggle .ic-sun {
          display: block;
        }
        .gpp.dark .theme-toggle .ic-moon {
          display: none;
        }

        .gpp .panel-title {
          position: relative;
          z-index: 4;
          margin: 0 var(--gut);
        }
        .gpp .pt-eyebrow {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.82);
          margin-bottom: 14px;
          text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
        }
        .gpp .pt-h {
          font-size: clamp(40px, 4.8vw, 72px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 0.92;
          max-width: 14ch;
          color: #fff;
          text-shadow: 0 4px 50px rgba(0, 0, 0, 0.4);
        }

        /* frosted control band — fades into the page color. In normal flow
           below the title (not absolute), so the title can never overlap. */
        .gpp .band {
          position: relative;
          z-index: 5;
          margin-top: 26px;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr) 250px;
          gap: 44px;
          align-items: start;
          padding: 34px var(--gut) 38px;
          -webkit-backdrop-filter: blur(32px) saturate(140%);
          backdrop-filter: blur(32px) saturate(140%);
          background: linear-gradient(
            0deg,
            rgba(var(--band), 0.97) 30%,
            rgba(var(--band), 0.82) 58%,
            rgba(var(--band), 0.45) 82%,
            rgba(var(--band), 0) 100%
          );
          -webkit-mask-image: linear-gradient(0deg, #000 86%, transparent 100%);
          mask-image: linear-gradient(0deg, #000 86%, transparent 100%);
          color: var(--bt);
          transition: color 0.4s ease;
        }
        .gpp .band-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gpp .abtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          height: 46px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition:
            transform 0.16s cubic-bezier(0.2, 1.2, 0.3, 1),
            background 0.16s,
            box-shadow 0.16s;
        }
        .gpp .abtn:active {
          transform: scale(0.975);
        }
        .gpp .abtn.play {
          background: var(--bt);
          color: var(--bg);
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.18);
        }
        .gpp .abtn.play:hover {
          transform: translateY(-1px);
        }
        .gpp .abtn.buy {
          background: rgba(var(--band), 0.55);
          color: var(--bt);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          backdrop-filter: blur(20px) saturate(160%);
          box-shadow: inset 0 0 0 1px var(--bt3);
        }
        .gpp .abtn.buy:hover {
          transform: translateY(-1px);
        }
        .gpp.dark .abtn.buy {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          box-shadow: none;
        }
        .gpp.dark .abtn.buy:hover {
          background: rgba(255, 255, 255, 0.24);
        }
        .gpp.dark .bdg {
          background: rgba(255, 255, 255, 0.12);
        }
        .gpp.dark .bdg.rate {
          background: transparent;
          box-shadow: none;
        }
        .gpp .band-free {
          font-size: 13px;
          font-weight: 500;
          color: var(--bt2);
          text-align: center;
          margin-top: 3px;
        }

        .gpp .band-desc {
          padding-top: 2px;
        }
        .gpp .bd-descwrap {
          position: relative;
        }
        /* The MORE expander is a mobile-only affordance — the ≤640px block
           reveals it while the description is clamped. */
        .gpp .bd-more {
          display: none;
        }
        .gpp .bd-text {
          font-size: 16px;
          line-height: 1.5;
          font-weight: 400;
          color: var(--bt);
          max-width: 62ch;
        }
        .gpp .bd-meta {
          font-size: 13.5px;
          font-weight: 500;
          color: var(--bt2);
          margin-top: 12px;
        }
        .gpp .bd-badges {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 12px;
        }
        .gpp .bdg {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--bt2);
          background: rgba(125, 125, 135, 0.16);
          border-radius: 5px;
          padding: 3px 7px;
        }
        .gpp .bdg.rate {
          background: transparent;
          box-shadow: inset 0 0 0 1.5px var(--bt3);
        }
        .gpp .bd-trailer {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--bt);
          padding: 3px 5px;
          margin-left: 3px;
        }

        .gpp .band-cast {
          padding-top: 2px;
        }
        .gpp .bc-k {
          font-size: 12px;
          font-weight: 600;
          color: var(--bt3);
          margin-bottom: 5px;
        }
        .gpp .bc-v {
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--bt);
        }
        .gpp .bc-sub {
          font-size: 13.5px;
          line-height: 1.45;
          color: var(--bt2);
          margin-top: 4px;
        }

        /* entrance */
        .gpp .rise {
          opacity: 0;
          transform: translateY(22px);
          animation: gpp-rise 1s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .gpp .rise.d1 {
          animation-delay: 0.15s;
        }
        .gpp .rise.d2 {
          animation-delay: 0.35s;
        }
        @keyframes gpp-rise {
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gpp .rise,
          .gpp .panel-art,
          .gpp .hero .photo {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }

        /* ============================================================ COVER HERO */
        .gpp .hero {
          position: relative;
          width: 100%;
          /* Full-viewport tall, same as the marquee (.panel) — the cover hero
             owns the whole first screen. */
          height: 100svh;
          min-height: 640px;
          overflow: hidden;
          background: transparent;
          font-family: var(--po);
          letter-spacing: normal;
        }
        .gpp .hero-art {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.18);
          -webkit-backdrop-filter: blur(60px) saturate(140%);
          backdrop-filter: blur(60px) saturate(140%);
          box-shadow: none;
        }
        .gpp .hero-ph {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -64%);
          color: rgba(255, 255, 255, 0.22);
          pointer-events: none;
        }
        .gpp .hero-shade {
          display: none;
        }
        .gpp .hero-grain {
          display: none;
        }
        .gpp .hero-blend {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 48px;
          z-index: 2;
          background: linear-gradient(180deg, transparent, #141416);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.4s ease;
        }
        .gpp.dark .hero-blend {
          opacity: 1;
        }

        .gpp .hero-eyebrow {
          position: absolute;
          top: 48px;
          left: 64px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .gpp .hero-eyebrow .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #e0482e;
        }

        /* ── touch-to-edit text (Course Page Empty State.html) ── */
        .gpp .gpp-editable {
          outline: none;
          border-radius: 6px;
          transition: box-shadow 0.15s;
          cursor: text;
        }
        .gpp .gpp-editable:hover {
          box-shadow: 0 0 0 1.5px
            color-mix(in srgb, var(--color-ce-accent) 35%, transparent);
        }
        .gpp .gpp-editable:focus {
          box-shadow: 0 0 0 2px var(--color-ce-accent);
        }
        /* Empty editable fields show their placeholder instead of persisting
           it as real copy. */
        .gpp .gpp-editable:empty::before {
          content: attr(data-placeholder);
          opacity: 0.4;
          pointer-events: none;
        }
        /* ── add / remove affordances for the editable lists (FAQ, badges,
              bio). Quiet by default, only meaningful in editable mode. ── */
        .gpp .gpp-row {
          position: relative;
        }
        .gpp .gpp-add {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 10px;
          padding: 6px 12px;
          border-radius: 980px;
          border: 1px dashed
            color-mix(in srgb, var(--color-ce-accent) 55%, transparent);
          background: transparent;
          color: var(--color-ce-accent);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .gpp .gpp-add:hover {
          background: color-mix(
            in srgb,
            var(--color-ce-accent) 10%,
            transparent
          );
        }
        .gpp .gpp-add-chip {
          margin-top: 0;
          padding: 4px 10px;
          font-size: 12px;
        }
        .gpp .gpp-remove {
          margin-left: 8px;
          width: 20px;
          height: 20px;
          line-height: 18px;
          text-align: center;
          border-radius: 999px;
          border: none;
          background: color-mix(in srgb, #ef4444 14%, transparent);
          color: #ef4444;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .gpp .gpp-row:hover .gpp-remove,
        .gpp .gpp-chip-wrap:hover .gpp-remove,
        .gpp .faq-item:hover .gpp-remove {
          opacity: 1;
        }
        .gpp .gpp-chip-wrap {
          display: inline-flex;
          align-items: center;
        }
        .gpp .gpp-remove-chip {
          margin-left: 4px;
          width: 16px;
          height: 16px;
          line-height: 14px;
          font-size: 12px;
        }
        .gpp .faq-remove {
          margin: 4px 0 0;
          padding: 4px 10px;
          font-size: 12px;
          border-style: solid;
          border-color: color-mix(in srgb, #ef4444 45%, transparent);
          color: #ef4444;
        }
        .gpp .faq-remove:hover {
          background: color-mix(in srgb, #ef4444 10%, transparent);
        }
        /* Per-section hide control — quiet, appears on section hover. */
        .gpp .gpp-section {
          position: relative;
        }
        .gpp .gpp-section-hide {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 5;
          padding: 5px 11px;
          border-radius: 980px;
          border: 1px solid
            color-mix(in srgb, var(--color-ce-accent) 45%, transparent);
          background: color-mix(in srgb, var(--bg-0, #fff) 88%, transparent);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
          color: var(--color-ce-accent);
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .gpp .gpp-section:hover .gpp-section-hide {
          opacity: 1;
        }
        .gpp .gpp-hidden-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          max-width: 1080px;
          margin: 0 auto;
          padding: 24px 32px 48px;
        }
        .gpp .gpp-hidden-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0.5;
        }

        /* ── editor affordances (Course Page Empty State.html, verbatim) ── */
        .gpp .add-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 18px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          box-shadow: none;
          font-family: var(--sf);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition:
            background 0.2s,
            transform 0.16s;
        }
        .gpp .add-pill:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: scale(1.04);
        }
        .gpp .add-pill:active {
          transform: scale(0.96);
        }
        .gpp .add-pill:disabled {
          opacity: 0.6;
          pointer-events: none;
        }
        .gpp .add-pill.active {
          background: rgba(255, 255, 255, 0.92);
          color: #111;
        }
        .gpp .card-add {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 32px;
          padding: 0 14px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          box-shadow: none;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.005em;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background 0.18s,
            transform 0.18s;
        }
        .gpp .card-add:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: translateX(-50%) scale(1.05);
        }
        /* once filled, the change control hides until hover */
        .gpp .card.filled .card-add {
          opacity: 0;
          pointer-events: none;
          transition:
            opacity 0.2s,
            background 0.18s;
        }
        .gpp .card.filled:hover .card-add {
          opacity: 1;
          pointer-events: auto;
        }
        .gpp .thumb-add {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 32px;
          padding: 0 14px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.005em;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background 0.18s,
            transform 0.18s;
        }
        .gpp .thumb-add:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: translate(-50%, -50%) scale(1.05);
        }
        .gpp .lc-thumb:not(.ph) .thumb-add {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s;
        }
        .gpp .lc-catalog:hover .lc-thumb:not(.ph) .thumb-add {
          opacity: 1;
          pointer-events: auto;
        }
        /* Reposition pill — the second control, stacked below the Add/Replace
           pill so the two never overlap. Inherits .thumb-add/.card-add styling
           and the filled-hover reveal; only the vertical offset changes. */
        .gpp .thumb-add.is-repos {
          top: calc(50% + 42px);
        }
        .gpp .card-add.is-repos {
          top: 58px;
        }
        .gpp .change-pill {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 32px;
          padding: 0 14px;
          border-radius: 980px;
          background: rgba(10, 11, 13, 0.46);
          color: #fff;
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          box-shadow: none;
          font-family: var(--sf);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          opacity: 0;
          transition:
            opacity 0.2s,
            background 0.18s;
        }
        .gpp .sample-screen:hover .change-pill {
          opacity: 1;
        }
        .gpp .change-pill:hover {
          background: rgba(40, 40, 46, 0.7);
        }
        .gpp .ph-cta .ph-k {
          font-family: var(--sf);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .gpp .ph-cta .ph-s {
          font-family: var(--sf);
          font-size: 13px;
          color: rgba(235, 235, 245, 0.6);
          margin-top: -8px;
        }

        /* ── hover-trailer peek layer ── */
        .gpp .trailer-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 0.45s ease;
          pointer-events: none;
          z-index: 1;
        }
        .gpp .trailer-layer.on {
          opacity: 1;
        }

        /* ── reposition mode ── */
        .gpp .panel.repositioning,
        .gpp .hero.repositioning {
          cursor: grab;
        }
        .gpp .panel.repositioning:active,
        .gpp .hero.repositioning:active {
          cursor: grabbing;
        }
        .gpp .panel.repositioning .band,
        .gpp .panel.repositioning .panel-title,
        .gpp .hero.repositioning .hero-content {
          pointer-events: none;
          opacity: 0.35;
          transition: opacity 0.2s;
        }

        /* creator controls, top right */
        .gpp .creator-bar {
          position: absolute;
          top: 40px;
          right: 64px;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .gpp .panel .creator-bar {
          top: 26px;
          right: var(--gut);
        }
        .gpp .creator-bar .theme-toggle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          box-shadow: none;
          display: grid;
          place-items: center;
          transition:
            background 0.2s,
            transform 0.16s;
        }
        .gpp .creator-bar .theme-toggle:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: scale(1.06);
        }
        .gpp .creator-bar .theme-toggle:active {
          transform: scale(0.94);
        }

        /* ── Title-style picker — builder chrome (dark, ce-accent blue).
           Anchored under the creator bar; each row previews the course
           title in that face. ── */
        .gpp .hero-font-panel {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          width: 316px;
          max-height: min(70vh, 560px);
          overflow-y: auto;
          padding: 16px 12px 12px;
          border-radius: 14px;
          background: rgba(28, 28, 30, 0.94);
          -webkit-backdrop-filter: blur(24px) saturate(150%);
          backdrop-filter: blur(24px) saturate(150%);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.1),
            0 24px 60px -18px rgba(0, 0, 0, 0.6);
          color: #f5f5f7;
          text-align: left;
          cursor: default;
        }
        .gpp .hero-font-panel .hf-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          padding: 0 6px;
        }
        .gpp .hero-font-panel .hf-sub {
          font-size: 11.5px;
          line-height: 1.45;
          color: #9a9aa2;
          margin: 3px 0 10px;
          padding: 0 6px;
        }
        .gpp .hero-font-panel .hf-row {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 3px;
          width: 100%;
          padding: 9px 10px 10px;
          border-radius: 10px;
          text-align: left;
          transition: background 0.15s;
        }
        .gpp .hero-font-panel .hf-row:hover {
          background: rgba(255, 255, 255, 0.07);
        }
        .gpp .hero-font-panel .hf-row.active {
          background: rgba(41, 151, 255, 0.14);
          box-shadow: inset 0 0 0 1px rgba(41, 151, 255, 0.4);
        }
        .gpp .hero-font-panel .hf-name {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9a9aa2;
        }
        .gpp .hero-font-panel .hf-row.active .hf-name {
          color: #2997ff;
        }
        .gpp .hero-font-panel .hf-name em {
          font-style: normal;
          font-weight: 500;
          letter-spacing: 0.02em;
          text-transform: none;
          color: #7e7e86;
          margin-left: 4px;
        }
        .gpp .hero-font-panel .hf-preview {
          font-size: 21px;
          line-height: 1.15;
          color: #f5f5f7;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          max-width: 100%;
        }

        /* ── Drag-to-resize container width (hero title / description).
           The inner box hugs the text and carries the creator-set width; the
           grab handle rides its right edge and appears on hover or while the
           text is selected. Builder accent (#2997ff) while engaged. ── */
        .gpp .gpp-rz {
          position: relative;
        }
        .gpp .gpp-rz-inner {
          position: relative;
          width: fit-content;
          max-width: 100%;
        }
        .gpp .gpp-rz-handle {
          position: absolute;
          top: 50%;
          right: -26px;
          transform: translateY(-50%);
          width: 26px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: ew-resize;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 6;
          touch-action: none;
          user-select: none;
        }
        .gpp .gpp-rz:hover .gpp-rz-handle,
        .gpp .gpp-rz-inner:focus-within .gpp-rz-handle,
        .gpp .gpp-rz.dragging .gpp-rz-handle {
          opacity: 1;
        }
        .gpp .gpp-rz-grip {
          width: 6px;
          height: 46px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow:
            0 2px 10px rgba(0, 0, 0, 0.45),
            inset 0 0 0 1px rgba(0, 0, 0, 0.18);
          transition: background 0.15s, transform 0.15s;
        }
        .gpp .gpp-rz-handle:hover .gpp-rz-grip,
        .gpp .gpp-rz.dragging .gpp-rz-grip {
          background: #2997ff;
          transform: scaleY(1.08);
        }
        /* Dashed container outline while resizing — shows the box being sized,
           not just the text. */
        .gpp .gpp-rz.dragging .gpp-rz-inner {
          outline: 1.5px dashed rgba(41, 151, 255, 0.85);
          outline-offset: 10px;
          border-radius: 4px;
        }
        .gpp .gpp-rz-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translate(-50%, -100%);
          padding: 4px 9px;
          border-radius: 8px;
          background: #1c1c1e;
          color: #2997ff;
          font-size: 11.5px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.1),
            0 10px 30px -10px rgba(0, 0, 0, 0.6);
        }
        /* Resizing is a desktop-drag affordance; on phones the wrapper goes
           full-width so the heroes' centered mobile layouts hold. */
        @media (max-width: 820px) {
          .gpp .gpp-rz-handle {
            display: none;
          }
          .gpp .gpp-rz-inner {
            width: 100%;
          }
        }

        .gpp .hero-content {
          position: absolute;
          left: 64px;
          right: 64px;
          bottom: 52px;
          max-width: 760px;
          color: #fff;
          z-index: 3;
        }
        .gpp .hero-meta {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 18px;
        }
        .gpp .badge {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.92);
          color: #1d1d1f;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 7px 14px;
          border-radius: 980px;
        }
        .gpp .meta-line {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 15px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.78);
        }
        .gpp .meta-line .sep {
          opacity: 0.55;
        }
        .gpp .hero-title {
          font-size: clamp(46px, 5.6vw, 84px);
          font-weight: 700;
          line-height: 1.02;
          letter-spacing: -0.025em;
          text-wrap: balance;
        }
        .gpp .hero-desc {
          margin-top: 18px;
          max-width: 580px;
          font-size: 16px;
          font-weight: 500;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.88);
        }
        .gpp .hero-desc .with {
          color: rgba(255, 255, 255, 0.62);
        }
        .gpp .hero-actions {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 26px;
        }
        /* Mobile centered Add-cover button (anchored below the icon-pill
           bar). Hidden on desktop; the mobile media query reveals it. */
        .gpp .hero-cta {
          display: none;
          position: absolute;
          top: clamp(84px, 15%, 130px);
          left: 50%;
          transform: translateX(-50%);
          z-index: 4;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 18px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          font-family: var(--sf);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          white-space: nowrap;
          transition:
            background 0.2s,
            transform 0.16s;
        }
        .gpp .hero-cta:active {
          background: rgba(255, 255, 255, 0.28);
          transform: translateX(-50%) scale(0.96);
        }
        .gpp .hero.filled .hero-cta {
          background: rgba(10, 11, 13, 0.46);
        }
        .gpp .btn-trailer {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          background: #fff;
          color: #111;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          padding: 12px 24px 12px 12px;
          border-radius: 980px;
          font-family: var(--sf);
          transition: transform 0.16s ease;
        }
        .gpp .btn-trailer:hover {
          transform: scale(1.03);
        }
        .gpp .btn-trailer:active {
          transform: scale(0.98);
        }
        .gpp .btn-trailer .play {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #111;
          color: #fff;
          display: grid;
          place-items: center;
          flex: none;
        }
        .gpp .btn-enroll {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          box-shadow: none;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          padding: 15px 26px;
          border-radius: 980px;
          font-family: var(--sf);
          transition:
            background 0.18s,
            transform 0.16s ease;
        }
        .gpp .btn-enroll:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: scale(1.03);
        }
        .gpp .btn-enroll:active {
          transform: scale(0.98);
        }

        /* ============================================================ FREE SAMPLE */
        .gpp .sample {
          padding: 76px 64px 12px;
          text-align: center;
        }
        .gpp .sample-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-2);
          margin-bottom: 14px;
          transition: color 0.4s ease;
        }
        .gpp .sample h2 {
          font-family: var(--po);
          font-size: clamp(28px, 3vw, 40px);
          font-weight: 600;
          letter-spacing: -0.025em;
          /* the app's global heading styles leak a 1.5 line-height in here;
             the design relies on the browser default (~1.15) */
          line-height: 1.15;
          color: var(--text);
          transition: color 0.4s ease;
        }
        .gpp .sample-sub {
          font-size: 16px;
          color: var(--text-2);
          margin-top: 10px;
          transition: color 0.4s ease;
        }
        .gpp .sample-screen {
          position: relative;
          width: min(1040px, 100%);
          aspect-ratio: 16 / 9;
          margin: 36px auto 0;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 40px 30px rgba(0, 0, 0, 0.05);
          display: grid;
          place-items: center;
        }
        .gpp .sample-screen.playable {
          cursor: pointer;
        }
        .gpp .sample-screen.playing {
          cursor: default;
        }
        .gpp .sample-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
          z-index: 3;
        }
        .gpp .sample-screen.playing .photo,
        .gpp .sample-screen.playing .photo-shade,
        .gpp .sample-screen.playing .ph-ambient,
        .gpp .sample-screen.playing .glass-tint {
          display: none;
        }
        .gpp .sample-mute {
          position: absolute;
          right: 14px;
          bottom: 14px;
          z-index: 4;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.5);
          -webkit-backdrop-filter: blur(12px) saturate(180%);
          backdrop-filter: blur(12px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .gpp .sample-mute:hover {
          background: rgba(0, 0, 0, 0.66);
        }
        .gpp .ph-cta {
          position: relative;
          z-index: 2;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          color: #fff;
        }
        .gpp .ph-cta .ph-ic {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          backdrop-filter: blur(40px) saturate(150%);
          box-shadow: none;
          display: grid;
          place-items: center;
          cursor: pointer;
          transition:
            background 0.2s,
            transform 0.18s;
        }
        .gpp .ph-cta .ph-ic:hover {
          background: rgba(255, 255, 255, 0.28);
          transform: scale(1.06);
        }

        /* ============================================================ LESSON ROWS (modules) */
        .gpp .lessons {
          padding: 48px var(--gut) 96px;
        }
        .gpp .row {
          margin-top: 48px;
        }
        .gpp .row:first-child {
          margin-top: 0;
        }
        .gpp .row-head {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: var(--text);
          margin-bottom: 16px;
          transition: color 0.4s ease;
        }
        .gpp .row-head .mod {
          color: var(--text-2);
          font-weight: 600;
        }
        .gpp .row .grid {
          display: flex;
          gap: 30px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          scroll-padding-inline: var(--gut);
          scrollbar-width: none;
          -ms-overflow-style: none;
          margin: 0 calc(var(--gut) * -1);
          padding: 0 var(--gut);
        }
        .gpp .row .grid::-webkit-scrollbar {
          display: none;
        }
        /* 4-up when the viewport supports it; below that, cards hold a
           cinematic minimum width and the rail scrolls — never shrink into
           squat tiles. */
        .gpp .row .grid .card {
          flex: 0 0 max(calc((100% - 90px) / 4), 400px);
          scroll-snap-align: start;
        }
        /* Catalog cards mirror the customer portal: a clean 4-up that scales
           with the container (no 400px min-width floor → no chunky 3-up rail). */
        .gpp .row .grid .lc-catalog {
          flex: 0 0 calc((100% - 90px) / 4);
          scroll-snap-align: start;
        }

        /* spotlight card — Apple TV-style episode card. Liquid glass while
           awaiting still. */
        .gpp .card {
          position: relative;
          aspect-ratio: 465 / 320;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 20px 18px rgba(0, 0, 0, 0.04);
          min-width: 0;
        }
        .gpp .card[role='button'] {
          cursor: pointer;
        }
        .gpp .card-info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          padding: 0 20px 16px;
        }
        .gpp .ep {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(235, 235, 245, 0.66);
        }
        .gpp .card .title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.015em;
          line-height: 1.2;
          color: #fff;
          margin-top: 5px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-wrap: anywhere;
        }
        .gpp .card .desc {
          font-size: 14px;
          line-height: 1.45;
          color: rgba(235, 235, 245, 0.72);
          margin-top: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 40px;
        }
        .gpp .foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 8px;
        }
        .gpp .time {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          color: rgba(235, 235, 245, 0.75);
          font-variant-numeric: tabular-nums;
        }
        .gpp .dots {
          display: inline-flex;
          align-items: center;
          gap: 3.5px;
          padding: 5px 2px;
          color: rgba(235, 235, 245, 0.65);
        }
        .gpp .dots span {
          width: 3.5px;
          height: 3.5px;
          border-radius: 50%;
          background: currentColor;
        }

        /* ============================================================ EPISODE STRIP (episodic) */
        .gpp .strip-rh {
          display: flex;
          align-items: baseline;
          gap: 13px;
          margin-bottom: 18px;
        }
        .gpp .strip-rh .rh {
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: var(--text);
          transition: color 0.4s ease;
        }
        .gpp .strip-rh .rh-meta {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-2);
          transition: color 0.4s ease;
        }
        .gpp .strip-wrap {
          position: relative;
        }
        .gpp .strip-wrap .grid {
          display: flex;
          gap: 30px;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding: 4px 2px 16px;
          scrollbar-width: none;
        }
        .gpp .strip-wrap .grid::-webkit-scrollbar {
          display: none;
        }
        .gpp .strip-wrap .grid .lc-catalog {
          flex: 0 0 calc((100% - 90px) / 4);
        }
        .gpp .strip-wrap .grid .card {
          flex: 0 0 max(calc((100% - 90px) / 4), 400px);
          scroll-snap-align: start;
        }

        .gpp .arrow {
          position: absolute;
          top: 0;
          bottom: 16px;
          z-index: 5;
          width: 52px;
          background: none;
          color: rgba(0, 0, 0, 0.5);
          display: grid;
          place-items: center;
          opacity: 0;
          pointer-events: none;
          transition:
            opacity 0.2s,
            color 0.15s;
        }
        .gpp .arrow:hover {
          color: #000;
        }
        .gpp.dark .arrow {
          color: rgba(255, 255, 255, 0.55);
        }
        .gpp.dark .arrow:hover {
          color: #fff;
        }
        .gpp .arrow.prev {
          left: -52px;
        }
        .gpp .arrow.next {
          right: -52px;
        }
        .gpp .arrow.show {
          opacity: 1;
          pointer-events: auto;
        }
        .gpp .arrow svg {
          transition: transform 0.15s;
        }
        .gpp .arrow:active svg {
          transform: scale(0.88);
        }

        /* ── catalog lesson card ── */
        .gpp .lc-catalog {
          cursor: pointer;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.014em;
          /* keep the card at its flex-basis — long titles wrap inside instead
             of stretching the card wider. */
          min-width: 0;
        }
        .gpp .lc-card {
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #e6e6e9;
          display: flex;
          flex-direction: column;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.04),
            0 4px 16px rgba(0, 0, 0, 0.05);
          transition:
            transform 0.26s cubic-bezier(0.34, 1.3, 0.64, 1),
            box-shadow 0.26s;
        }
        .gpp .lc-catalog:hover .lc-card {
          transform: translateY(-5px);
          box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.14),
            0 2px 8px rgba(0, 0, 0, 0.06);
        }
        .gpp .lc-thumb {
          position: relative;
          flex: 0 0 auto;
          aspect-ratio: 380 / 214;
          background: #111111;
          overflow: hidden;
        }
        .gpp .lc-thumb.ph {
          background: none;
        }
        .gpp .lc-thumb img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .gpp .lc-play {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          display: grid;
          place-items: center;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .gpp .lc-catalog:hover .lc-play {
          opacity: 1;
        }
        .gpp .lc-play-btn {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          color: #07080a;
          display: grid;
          place-items: center;
          padding-left: 3px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .gpp .lc-state {
          position: absolute;
          left: 12px;
          top: 12px;
        }
        .gpp .lc-free {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #111;
          background: rgba(255, 255, 255, 0.92);
          padding: 4px 9px;
          border-radius: 980px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }
        .gpp .lc-lock {
          width: 25px;
          height: 25px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.92);
          background: rgba(0, 0, 0, 0.42);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow: none;
        }
        /* chips on spotlight cards sit above the photo-shade */
        .gpp .card .lc-state {
          z-index: 3;
        }
        .gpp .lc-dur {
          position: absolute;
          right: 12px;
          top: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.92);
          font-variant-numeric: tabular-nums;
          background: rgba(0, 0, 0, 0.42);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          padding: 4px 9px 4px 7px;
          border-radius: 980px;
          box-shadow: none;
        }
        .gpp .lc-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 18px 20px 20px;
        }
        .gpp .lc-num {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #86868b;
          margin-bottom: 6px;
        }
        .gpp .lc-title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
          color: #1d1d1f;
          margin-bottom: 7px;
          /* Long titles wrap to a second line and clamp — they never widen or
             grow the fixed-size card. */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-wrap: anywhere;
        }
        .gpp .lc-desc {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.56);
          line-height: 1.45;
          text-wrap: pretty;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 41px;
        }
        .gpp .lc-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: auto;
          padding-top: 12px;
          font-size: 13px;
          font-weight: 500;
          color: #86868b;
          font-variant-numeric: tabular-nums;
        }
        /* Dark mode: darken the whole catalog card — body + info block — on
           every breakpoint, matching the customer portal (the info part below
           turns dark too, instead of staying white). */
        .gpp.dark .lc-card {
          background: #1d1d20;
          border-color: rgba(245, 245, 247, 0.12);
        }
        .gpp.dark .lc-num {
          color: rgba(245, 245, 247, 0.6);
        }
        .gpp.dark .lc-title {
          color: #f5f5f7;
        }
        .gpp.dark .lc-desc {
          color: rgba(245, 245, 247, 0.6);
        }
        .gpp.dark .lc-meta {
          color: rgba(245, 245, 247, 0.6);
        }

        /* ============================================================ INSTRUCTOR — Apple/MasterClass style */
        .gpp {
          --hair: rgba(0, 0, 0, 0.12);
          --faq-chev: rgba(0, 0, 0, 0.48);
          --faq-ans: #4a4a4f;
        }
        .gpp.dark {
          --hair: rgba(245, 245, 247, 0.16);
          --faq-chev: rgba(245, 245, 247, 0.5);
          --faq-ans: rgba(245, 245, 247, 0.78);
        }
        .gpp .instructor {
          padding: 88px var(--gut) 24px;
          background: var(--bg);
          transition: background 0.4s ease;
        }
        .gpp .inst-inner {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr minmax(380px, 540px);
          gap: clamp(48px, 6vw, 110px);
          align-items: start;
        }
        .gpp .inst-head {
          display: grid;
          grid-template-columns: 108px 1fr;
          gap: 26px;
          align-items: center;
          margin-bottom: 36px;
        }
        .gpp .inst-avatar {
          position: relative;
          width: 108px;
          height: 108px;
          border-radius: 50%;
          overflow: hidden;
          display: grid;
          place-items: center;
          color: #fff;
          box-shadow: inset 0 0 0 1px var(--hair);
        }
        .gpp .inst-avatar .av-ic {
          position: relative;
          z-index: 2;
          opacity: 0.92;
        }
        /* Editable avatar — clickable, with a hover overlay hinting the crop
           editor (zoom + reposition), mirroring the Space avatar affordance. */
        .gpp .inst-avatar.editable-avatar {
          cursor: pointer;
        }
        .gpp .inst-avatar .av-edit {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(10, 11, 13, 0.44);
          -webkit-backdrop-filter: blur(3px);
          backdrop-filter: blur(3px);
          opacity: 0;
          transition: opacity 0.16s ease;
        }
        .gpp .inst-avatar.editable-avatar:hover .av-edit,
        .gpp .inst-avatar.editable-avatar:focus-visible .av-edit {
          opacity: 1;
        }
        .gpp .inst-avatar.filled .ph-ambient,
        .gpp .inst-avatar.filled .glass-tint,
        .gpp .inst-avatar.filled .av-ic {
          display: none;
        }
        .gpp .inst-avatar .photo {
          display: none;
        }
        .gpp .inst-avatar.filled .photo {
          display: block;
        }
        .gpp .inst-name {
          font-family: var(--po);
          font-size: clamp(34px, 3.6vw, 54px);
          font-weight: 600;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--text);
          transition: color 0.4s ease;
        }
        .gpp .inst-sub {
          margin-top: 10px;
          max-width: 520px;
          font-size: 17px;
          line-height: 1.5;
          font-weight: 400;
          color: var(--text-2);
          transition: color 0.4s ease;
        }
        .gpp .inst-bio {
          max-width: 620px;
          font-size: 17px;
          line-height: 1.65;
          color: var(--faq-ans);
          transition: color 0.4s ease;
        }
        .gpp .inst-bio + .inst-bio {
          margin-top: 20px;
        }
        .gpp .inst-media {
          position: relative;
          aspect-ratio: 1 / 1;
          border-radius: 28px;
          overflow: hidden;
          display: grid;
          place-items: center;
        }
        .gpp .inst-media .photo-shade {
          background: linear-gradient(
            0deg,
            rgba(7, 8, 10, 0.42) 0%,
            rgba(7, 8, 10, 0.1) 26%,
            transparent 44%
          );
        }
        .gpp .inst-media.filled .ph-ambient,
        .gpp .inst-media.filled .glass-tint,
        .gpp .inst-media.filled .ph-cta {
          display: none;
        }
        .gpp .inst-media.filled .change-pill {
          display: inline-flex;
        }
        .gpp .inst-media.filled:hover .change-pill {
          opacity: 1;
        }
        /* Reposition toggle sits top-left so it never overlaps Change (top-right). */
        .gpp .inst-media .portrait-repos-pill {
          right: auto;
          left: 16px;
        }
        /* While repositioning, the whole portrait is a grab surface and the
           control stays visible so the creator can finish. */
        .gpp .inst-media.repositioning {
          cursor: grab;
          touch-action: none;
        }
        .gpp .inst-media.repositioning:active {
          cursor: grabbing;
        }
        .gpp .inst-media.repositioning .change-pill {
          opacity: 1;
        }
        .gpp .inst-media.repositioning .photo {
          box-shadow: inset 0 0 0 2px var(--color-ce-accent);
        }
        .gpp .inst-caption {
          position: absolute;
          left: 20px;
          bottom: 20px;
          z-index: 2;
          padding: 9px 15px;
          border-radius: 11px;
          background: rgba(15, 15, 18, 0.66);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          color: rgba(255, 255, 255, 0.94);
          font-size: 13.5px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        /* ============================================================ FAQ — Apple style */
        .gpp .faq {
          padding: 40px var(--gut) 120px;
          background: var(--bg);
          transition: background 0.4s ease;
        }
        .gpp .faq-inner {
          max-width: 820px;
          margin: 0 auto;
        }
        .gpp .faq h2 {
          font-family: var(--po);
          font-size: clamp(26px, 7vw, 88px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          text-align: center;
          color: var(--text);
          white-space: nowrap;
          margin-bottom: clamp(40px, 6vw, 80px);
          transition: color 0.4s ease;
        }
        .gpp .faq-list {
          border-top: 1px solid var(--hair);
        }
        .gpp .faq-item {
          border-bottom: 1px solid var(--hair);
          position: relative;
        }
        /* Remove-question control — a quiet × that appears on row hover, sitting
           just left of the chevron so it never collides with it. */
        .gpp .faq-x {
          position: absolute;
          top: 22px;
          right: 44px;
          margin-left: 0;
          z-index: 2;
        }
        /* Add-question control — a single centered + button under the list,
           replacing the old text pill. */
        .gpp .faq-add-row {
          display: flex;
          justify-content: center;
          margin-top: 28px;
        }
        .gpp .faq-add-btn {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          border: 1px dashed
            color-mix(in srgb, var(--color-ce-accent) 55%, transparent);
          background: transparent;
          color: var(--color-ce-accent);
          cursor: pointer;
          transition:
            background 0.16s ease,
            transform 0.16s ease;
        }
        .gpp .faq-add-btn:hover {
          background: color-mix(
            in srgb,
            var(--color-ce-accent) 10%,
            transparent
          );
          transform: scale(1.06);
        }
        .gpp .faq-add-btn:active {
          transform: scale(0.96);
        }
        .gpp .faq-q {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 26px 4px;
          text-align: left;
          font-size: clamp(19px, 2vw, 26px);
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text);
          transition:
            color 0.2s ease,
            opacity 0.2s ease;
        }
        .gpp .faq-q:hover {
          opacity: 0.62;
        }
        .gpp .faq-q .chev {
          flex: none;
          color: var(--faq-chev);
          transition:
            transform 0.42s cubic-bezier(0.4, 0, 0.2, 1),
            color 0.2s ease;
        }
        .gpp .faq-item.open .faq-q .chev {
          transform: rotate(180deg);
          color: var(--color-ce-accent);
        }
        .gpp .faq-item.open .faq-q {
          color: var(--text);
        }
        .gpp .faq-a-wrap {
          height: 0;
          overflow: hidden;
          transition: height 0.42s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gpp .faq-a-clip {
          overflow: hidden;
        }
        .gpp .faq-a {
          padding: 0 64px 8px 4px;
          max-width: 660px;
          font-size: clamp(15px, 1.4vw, 17px);
          line-height: 1.6;
          font-weight: 400;
          color: var(--faq-ans);
          opacity: 0;
          transform: translateY(-6px);
          transition:
            opacity 0.32s ease 0.04s,
            transform 0.42s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gpp .faq-item.open .faq-a {
          opacity: 1;
          transform: none;
          padding-bottom: 30px;
        }

        /* ============================================================ ENROLL SHEET — locked lesson */
        .gpp .enroll-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(10, 10, 12, 0.4);
          -webkit-backdrop-filter: blur(22px) saturate(120%);
          backdrop-filter: blur(22px) saturate(120%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.32s ease;
        }
        .gpp .enroll-overlay.show {
          opacity: 1;
          pointer-events: auto;
        }
        .gpp .enroll-sheet {
          width: min(540px, 100%);
          border-radius: 28px;
          overflow: hidden;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg);
          color: var(--text);
          box-shadow:
            0 50px 100px rgba(0, 0, 0, 0.4),
            0 8px 28px rgba(0, 0, 0, 0.2);
          transform: translateY(22px) scale(0.96);
          transition:
            transform 0.42s cubic-bezier(0.2, 1, 0.3, 1),
            background 0.4s ease;
        }
        .gpp .enroll-overlay.show .enroll-sheet {
          transform: none;
        }
        .gpp .es-cover {
          position: relative;
          flex: none;
          aspect-ratio: 540 / 280;
          overflow: hidden;
          display: grid;
          place-items: center;
        }
        /* Bottom-sheet grab handle — mobile-only (the phone design). */
        .gpp .es-grab {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 3;
          width: 38px;
          height: 5px;
          border-radius: 980px;
          background: rgba(255, 255, 255, 0.5);
          display: none;
        }
        .gpp .es-cover .photo-shade {
          display: block;
          background: linear-gradient(
            0deg,
            rgba(5, 5, 8, 0.66) 0%,
            rgba(5, 5, 8, 0.24) 44%,
            transparent 70%
          );
        }
        .gpp .es-cover.filled .ph-ambient {
          display: none;
        }
        .gpp .es-eyebrow {
          position: absolute;
          top: 20px;
          left: 24px;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.9);
          font-family: var(--po);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .gpp .es-eyebrow .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #e0482e;
        }
        .gpp .es-title {
          position: absolute;
          left: 24px;
          right: 70px;
          bottom: 18px;
          z-index: 2;
          font-family: var(--po);
          font-size: 27px;
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1.05;
          color: #fff;
        }
        .gpp .es-close {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 3;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(10, 11, 13, 0.46);
          color: #fff;
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          display: grid;
          place-items: center;
          transition:
            background 0.18s,
            transform 0.16s;
        }
        .gpp .es-close:hover {
          background: rgba(40, 40, 46, 0.7);
          transform: scale(1.06);
        }
        .gpp .es-close:active {
          transform: scale(0.92);
        }
        .gpp .es-body {
          overflow-y: auto;
          overscroll-behavior: contain;
          min-height: 0;
          padding: 30px 36px 34px;
          text-align: center;
        }
        .gpp .es-lesson {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-2);
          transition: color 0.4s ease;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .gpp .es-lesson svg {
          margin-top: -1px;
        }
        .gpp .es-h {
          font-family: var(--po);
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -0.025em;
          /* pin the browser-default line-height — the app's global heading
             styles leak 1.5 in here and stretch the sheet */
          line-height: 1.15;
          color: var(--text);
          margin-top: 10px;
          transition: color 0.4s ease;
        }
        .gpp .es-sub {
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-2);
          max-width: 380px;
          margin: 10px auto 0;
          transition: color 0.4s ease;
        }
        .gpp .es-price {
          font-size: 40px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.15;
          color: var(--text);
          margin-top: 22px;
          transition: color 0.4s ease;
        }
        .gpp .es-price-sub {
          font-size: 13px;
          color: var(--text-2);
          margin-top: 4px;
          transition: color 0.4s ease;
        }
        .gpp .es-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          margin-top: 24px;
        }
        .gpp .es-enroll {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          width: 100%;
          max-width: 340px;
          height: 50px;
          border-radius: 980px;
          background: var(--text);
          color: var(--bg);
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition:
            transform 0.16s,
            opacity 0.16s,
            background 0.4s ease,
            color 0.4s ease;
        }
        .gpp .es-enroll:hover {
          opacity: 0.88;
          transform: scale(1.02);
        }
        .gpp .es-enroll:active {
          transform: scale(0.97);
        }
        .gpp .es-sample-link {
          font-size: 14px;
          font-weight: 500;
          color: var(--blue, var(--color-ce-accent));
          padding: 4px 8px;
        }
        .gpp .es-sample-link:hover {
          text-decoration: underline;
        }

        /* ============================================================ MEDIA QUERIES */
        @media (max-width: 1200px) {
          .gpp {
            --gut: 44px;
          }
          .gpp .band {
            grid-template-columns: 280px minmax(0, 1fr);
            gap: 36px;
          }
          .gpp .band-cast {
            display: none;
          }
        }
        @media (max-width: 1100px) {
          .gpp .lessons {
            padding: 40px 40px 72px;
          }
        }
        ${MOBILE_MEDIA_CSS}
        ${classifyMobileCss(MOBILE_820_CSS)}
        ${classifyMobileCss(MOBILE_640_CSS)}

        /* ── Phone-canvas exceptions ── the canvas is a mouse surface, so
           the creator affordances keep their desktop shapes even though the
           mobile stylesheet collapses or hides them for real phones. Emitted
           AFTER the classified mobile css so equal-specificity rules lose. */
        .gpp.gpp-m .creator-bar .add-pill {
          width: auto;
          height: 40px;
          padding: 0 16px;
          border-radius: 980px;
        }
        .gpp.gpp-m .creator-bar .add-pill span {
          display: inline;
        }
        .gpp.gpp-m .creator-bar .add-pill svg {
          width: 13px;
          height: 13px;
        }
        .gpp.gpp-m .creator-bar .add-pill.is-cover,
        .gpp.gpp-m .creator-bar .add-pill.is-reposition {
          display: inline-flex;
        }
        .gpp.gpp-m .gpp-rz-handle {
          display: flex;
        }
        .gpp.gpp-m .gpp-rz-inner {
          width: fit-content;
        }
        /* The MARQUEE's mobile title/desc are centered — keep their sized
           boxes centered too (a fit-content block would otherwise hug the
           left edge). The cover hero keeps its own alignment. */
        .gpp.gpp-m .panel-title .gpp-rz-inner,
        .gpp.gpp-m .band-desc .gpp-rz-inner {
          margin-left: auto;
          margin-right: auto;
        }
      `}</style>
    </div>
  )
}

export default GeneratedPortalPage
