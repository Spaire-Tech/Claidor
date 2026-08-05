'use client'

// WatchPlayer — the Spaire Originals v2 full-screen player, ported 1:1 from
// the design (originals2-parts.jsx → VideoPlayer) but driving a REAL video
// element instead of the prototype's simulated clock:
//
//   • scrub bar (click + drag) with buffered shading and knob
//   • ±10s skips, big center play, space/←/→/Esc/f keys
//   • volume + mute — hover-expanding glass slider, M / ↑ / ↓ keys,
//     level persisted across lessons (mute-only on iOS, where page
//     volume is hardware-controlled)
//   • playback speed — 0.5×–2× glass menu, persisted across lessons
//   • buffering spinner — a hairline arc whenever playback stalls
//     mid-stream, so a rebuffer never looks like a frozen frame
//   • hover-scrub thumbnails — hovering or dragging the scrub bar shows
//     a floating frame preview from the Mux storyboard (plus timestamp);
//     lessons without a storyboard fall back to a timestamp-only pill
//   • Up Next — Apple TV-style end screen: in the final seconds the
//     playing video shrinks into a floating card (top right, still live)
//     while the next lesson takes over as the hero behind it — real
//     artwork, title, runtime, description, a countdown, and the same
//     CTA the course hero uses (marquee or cover variant). Cancel — or
//     tapping the mini video — restores full-screen playback; doing
//     nothing advances at the end of the clip. Rendered only when the
//     parent passes playlist + onSelectLesson, and it outlives the
//     chrome fade — it's a prompt, not a control.
//   • captions button — always present in the transport so it's
//     discoverable on every lesson; enabled and wired to the video's text
//     tracks when the asset carries captions (kept in lock-step with the
//     on-screen captions), and shown dimmed/disabled ("Captions
//     unavailable") when it doesn't — never silently absent
//   • fullscreen button — real Fullscreen API on the player root (not a
//     disguised exit), with the icon/label reflecting the current state
//   • discussion side panel — rendered only when comment wiring is passed
//   • onProgress(frac) every 5s + on exit; onComplete at the end
//
// Used by the public landing (free-preview lessons, anonymous progress in
// localStorage) and by the customer portal when it adopts this design.

import { useCallback, useEffect, useRef, useState } from 'react'
import { HlsVideo } from '../HlsVideo'
import { Glyph, SF, SkipIcon, fmtTime } from './WatchGlyphs'
import { CommentsPanel, type WatchComment } from './WatchSheets'
import { WatchStyles } from './WatchStyles'
import { cueAt, useStoryboard } from './useStoryboard'

// Viewer preferences that outlive a single lesson (volume, mute, speed).
// A 1.5× learner stays at 1.5× for the whole course — and the next one.
const PREFS_KEY = 'polar-watch-player-prefs'
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

type PlayerPrefs = { volume: number; muted: boolean; rate: number }
const DEFAULT_PREFS: PlayerPrefs = { volume: 1, muted: false, rate: 1 }

function loadPrefs(): PlayerPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<PlayerPrefs>
    return {
      volume:
        typeof p.volume === 'number'
          ? Math.min(1, Math.max(0, p.volume))
          : DEFAULT_PREFS.volume,
      muted: p.muted === true,
      rate:
        typeof p.rate === 'number' &&
        (RATES as readonly number[]).includes(p.rate)
          ? p.rate
          : DEFAULT_PREFS.rate,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(patch: Partial<PlayerPrefs>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...loadPrefs(), ...patch }),
    )
  } catch {
    /* storage unavailable (private mode) — prefs just don't persist */
  }
}

export type WatchLesson = {
  n: number
  title: string
  description?: string | null
  thumbnailUrl?: string | null
  muxPlaybackId?: string | null
  playbackUrl?: string | null
  // Mux storyboard WebVTT (signed) for hover-scrub thumbnails.
  storyboardUrl?: string | null
  // Overrides the "Lesson {n} · {title}" subtitle in the player header. Set
  // for non-lesson clips (e.g. a course trailer) so they don't read "Lesson 0".
  kicker?: string | null
}

// Display width of the hover-scrub thumbnail; height follows the sprite
// tile's own aspect ratio.
const PREVIEW_W = 164

// The Up Next end screen appears when this little of the lesson remains…
const UP_NEXT_WINDOW_SECONDS = 15
// …but never before this fraction has been watched, so a very short clip
// (or a deep-link near the start) doesn't open with the end screen up.
const UP_NEXT_MIN_FRAC = 0.5

/** One entry of the course's ordered lesson list, for in-player navigation
 * (prev/next buttons, the Up Next end screen, and the lessons sheet). */
export type WatchPlaylistItem = {
  id: string
  n: number
  title: string
  description?: string | null
  durationSeconds?: number | null
  thumbnailUrl?: string | null
  locked?: boolean
  watched?: boolean
}

// Track-skip (previous/next lesson) and PiP glyphs — local to the player;
// WatchGlyphs has no equivalents.
const TrackIcon = ({ dir, size = 22 }: { dir: -1 | 1; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    style={dir === -1 ? { transform: 'scaleX(-1)' } : undefined}
  >
    <path d="M6 5.5v13a.7.7 0 0 0 1.1.57l9.15-6.5a.7.7 0 0 0 0-1.14L7.1 4.93A.7.7 0 0 0 6 5.5Z" />
    <rect x="17.2" y="5" width="2.2" height="14" rx="1.1" />
  </svg>
)
const PipIcon = ({ size = 21 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <rect x="12" y="13" width="9" height="7" rx="1.5" fill="currentColor" />
  </svg>
)
const ListIcon = ({ size = 21 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 6h10M4 12h10M4 18h10" />
    <path d="m17.5 14.5 4-2.5-4-2.5v5Z" fill="currentColor" stroke="none" />
  </svg>
)

export function WatchPlayer({
  lesson,
  courseTitle,
  instructorName,
  startSec = 0,
  comments,
  canModerateComments,
  onPostComment,
  onLikeComment,
  onDeleteComment,
  onPinComment,
  onHeartComment,
  onClose,
  onProgress,
  onComplete,
  playlist,
  currentId,
  onSelectLesson,
  unitLabel = 'Lesson',
  ctaVariant = 'cover',
}: {
  lesson: WatchLesson
  courseTitle: string
  instructorName?: string | null
  startSec?: number
  comments?: WatchComment[]
  canModerateComments?: boolean
  onPostComment?: (text: string, parentId?: string | null) => void
  onLikeComment?: (id: string) => void
  onDeleteComment?: (id: string) => void
  onPinComment?: (id: string) => void
  onHeartComment?: (id: string) => void
  onClose: () => void
  onProgress?: (frac: number) => void
  onComplete?: () => void
  /** Ordered course lesson list. When provided together with onSelectLesson,
   * the player gains prev/next buttons, a pre-end Up Next autoplay card,
   * and a lessons sheet. */
  playlist?: WatchPlaylistItem[]
  currentId?: string
  onSelectLesson?: (lessonId: string) => void
  /** 'Lesson' or 'Episode' — drives the Up Next copy ("Play Next Episode"). */
  unitLabel?: string
  /** Which hero CTA the course uses — the Up Next end screen renders the
   * SAME button (cover = white pill with the play chip; marquee = the
   * band's rounded-rect play button). */
  ctaVariant?: 'marquee' | 'cover'
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [paused, setPaused] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [hasCaptions, setHasCaptions] = useState(false)
  const [cc, setCc] = useState(false)
  // The player renders captions itself (styled overlay below) instead of
  // letting the browser draw its default black boxes, so every text track
  // is pinned to 'hidden': cues stay loaded and readable, nothing is
  // natively displayed, and hls.js / OS caption settings can't flip a
  // default track visible behind the button's back.
  const [captionText, setCaptionText] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [side, setSide] = useState<null | 'discussion' | 'lessons'>(null)
  const [uiVisible, setUiVisible] = useState(true)
  const barRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const done = useRef(false)
  const startedRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── lesson navigation (prev / next / up-next / lessons sheet) ──
  // Locked lessons are skipped when stepping; text/quiz lessons are valid
  // targets (onSelectLesson routes them to the reading view).
  const canNavigate = !!(playlist && playlist.length > 0 && onSelectLesson)
  const currentIdx = canNavigate
    ? playlist!.findIndex((p) => p.id === currentId)
    : -1
  const prevItem = canNavigate
    ? [...playlist!.slice(0, Math.max(0, currentIdx))]
        .reverse()
        .find((p) => !p.locked)
    : undefined
  const nextItem =
    canNavigate && currentIdx >= 0
      ? playlist!.slice(currentIdx + 1).find((p) => !p.locked)
      : undefined
  const nextItemRef = useRef(nextItem)
  nextItemRef.current = nextItem

  // ── volume / speed / stall state ──
  // Initialized from persisted prefs; safe because the player only ever
  // mounts client-side (opened by a user interaction, never SSR'd).
  const [volume, setVolume] = useState(() => loadPrefs().volume)
  const [muted, setMuted] = useState(() => loadPrefs().muted)
  const [rate, setRate] = useState(() => loadPrefs().rate)
  const [rateOpen, setRateOpen] = useState(false)
  const [volOpen, setVolOpen] = useState(false)
  const [stalled, setStalled] = useState(false)
  // Mirrors for the polling loop / element wiring, same pattern as ccRef.
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const rateRef = useRef(rate)
  rateRef.current = rate
  const rateOpenRef = useRef(rateOpen)
  rateOpenRef.current = rateOpen
  const volBarRef = useRef<HTMLDivElement | null>(null)
  const volDragging = useRef(false)
  const volFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stallTicks = useRef(0)
  const prateRef = useRef<HTMLDivElement | null>(null)
  // Hover/drag position on the scrub bar (fraction), for the frame preview.
  const [preview, setPreview] = useState<number | null>(null)
  const storyboard = useStoryboard(lesson.storyboardUrl)
  // Up Next: cancelled for this lesson? (Parents key the player by lesson,
  // so a lesson change remounts and re-arms naturally.)
  const [upNextDismissed, setUpNextDismissed] = useState(false)
  const upNextDismissedRef = useRef(false)
  upNextDismissedRef.current = upNextDismissed
  // iOS ignores programmatic volume (it's hardware-controlled), so the
  // slider would be a dead control there — show mute-only instead.
  const [isIOS] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      (/iP(hone|od|ad)/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)),
  )

  // ── element wiring ──
  const onVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el
      if (!el) return
      // Apply the viewer's persisted prefs before anything plays, so a
      // lesson never opens at the wrong loudness or speed.
      el.volume = volumeRef.current
      el.muted = mutedRef.current
      el.playbackRate = rateRef.current
      const begin = () => {
        if (startedRef.current) return
        startedRef.current = true
        if (startSec > 0 && Number.isFinite(el.duration)) {
          el.currentTime = Math.min(startSec, Math.max(0, el.duration - 2))
        } else if (startSec > 0) {
          el.currentTime = startSec
        }
        void el.play().catch(() => setPaused(true))
      }
      if (el.readyState >= 1) begin()
      else el.addEventListener('loadedmetadata', begin, { once: true })
    },
    [startSec],
  )

  // Poll element state into React (time, duration, buffered, captions).
  useEffect(() => {
    const id = setInterval(() => {
      const el = videoRef.current
      if (!el) return
      setT(el.currentTime)
      if (Number.isFinite(el.duration) && el.duration > 0) setDur(el.duration)
      setPaused(el.paused)
      try {
        const b = el.buffered
        if (b.length > 0 && el.duration > 0) {
          setBuffered(b.end(b.length - 1) / el.duration)
        }
      } catch {
        /* ignore */
      }
      // Mirror the element's volume/mute so the speaker button can never
      // lie (autoplay policies and hls.js can both flip `muted`); re-assert
      // the playback rate the same defensive way captions are handled.
      setVolume(el.volume)
      setMuted(el.muted)
      if (el.playbackRate !== rateRef.current) {
        el.playbackRate = rateRef.current
      }
      // Stall detection: playing, but without enough data to keep going.
      // Two consecutive ticks (~500ms) before showing the spinner so a
      // normal seek or a healthy segment switch never flashes it.
      if (!el.paused && !el.ended && el.readyState < 3) {
        stallTicks.current += 1
      } else {
        stallTicks.current = 0
      }
      setStalled(stallTicks.current >= 2)
      // Detect caption tracks and pin them all to 'hidden' — cues load and
      // are readable for the overlay below, but the browser never draws
      // its own. Re-asserting every tick (not just on toggle) means
      // nothing else — hls.js, the browser, or OS caption settings — can
      // flip a default track visible behind the button's back.
      let captionsPresent = false
      for (const tr of el.textTracks) {
        if (tr.kind !== 'subtitles' && tr.kind !== 'captions') continue
        captionsPresent = true
        if (tr.mode !== 'hidden') tr.mode = 'hidden'
      }
      setHasCaptions(captionsPresent)
    }, 250)
    return () => clearInterval(id)
  }, [])

  // ── caption overlay ──
  // Auto-generated (ASR) cues tend to run slightly AHEAD of the audio —
  // the line pops up before anyone has said it. Shifting the clock we
  // evaluate cues against by a beat makes each line land with the voice.
  const CAPTION_SYNC_DELAY_S = 0.35
  useEffect(() => {
    if (!cc) {
      setCaptionText(null)
      return
    }
    // A dedicated fast tick (the main 250ms poll is too coarse for text
    // that must land on syllables). Runs only while captions are on.
    const id = setInterval(() => {
      const el = videoRef.current
      if (!el) return
      const now = el.currentTime - CAPTION_SYNC_DELAY_S
      let text = ''
      for (const tr of el.textTracks) {
        if (tr.kind !== 'subtitles' && tr.kind !== 'captions') continue
        const cues = tr.cues
        if (!cues) continue
        for (let i = 0; i < cues.length; i++) {
          const cue = cues[i] as VTTCue
          if (now >= cue.startTime && now < cue.endTime) {
            // Strip VTT voice/styling markup (the overlay styles itself)
            // and decode the character escapes WebVTT text may carry —
            // cue.text is raw, so "&amp;"/"&#39;" would render literally.
            const line = (cue.text ?? '')
              .replace(/<[^>]*>/g, '')
              .replace(/&(amp|lt|gt|nbsp|lrm|rlm|apos|quot|#39|#x27);/g, (_, e) =>
                e === 'amp'
                  ? '&'
                  : e === 'lt'
                    ? '<'
                    : e === 'gt'
                      ? '>'
                      : e === 'nbsp'
                        ? ' '
                        : e === 'quot'
                          ? '"'
                          : e === 'lrm' || e === 'rlm'
                            ? ''
                            : "'",
              )
            if (line) text += (text ? '\n' : '') + line
          }
        }
      }
      setCaptionText(text || null)
    }, 100)
    return () => clearInterval(id)
  }, [cc])

  // ── auto-hiding chrome ──
  // The title, controls and vignette are only there when the viewer needs
  // them. They show on entry and on any interaction (mouse, touch, keys,
  // scrubbing); after a few idle seconds of playback they fade away so the
  // viewer can focus on the video. Pausing keeps them up.
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      // Only fade out while the video is actually playing — a paused
      // player always keeps its controls visible. An open speed menu or a
      // volume drag counts as interacting: never fade mid-adjustment.
      if (
        videoRef.current &&
        !videoRef.current.paused &&
        !rateOpenRef.current &&
        !volDragging.current
      ) {
        setUiVisible(false)
      }
    }, 3000)
  }, [])

  const revealUi = useCallback(() => {
    setUiVisible(true)
    if (videoRef.current && !videoRef.current.paused) scheduleHide()
    else if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [scheduleHide])

  // Mirror for the touch handlers (they need the current value without
  // re-binding on every visibility flip).
  const uiVisibleRef = useRef(true)
  uiVisibleRef.current = uiVisible

  // Keep chrome up whenever paused or while the speed menu is open;
  // restart the idle countdown on play / menu close.
  useEffect(() => {
    if (paused || rateOpen) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setUiVisible(true)
    } else {
      scheduleHide()
    }
  }, [paused, rateOpen, scheduleHide])

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (volFlashTimer.current) clearTimeout(volFlashTimer.current)
    },
    [],
  )

  const frac = dur > 0 ? Math.min(1, t / dur) : 0

  // ── progress reporting ──
  const fracRef = useRef(0)
  fracRef.current = frac
  useEffect(() => {
    const id = setInterval(() => {
      if (fracRef.current > 0) onProgress?.(fracRef.current)
    }, 5000)
    return () => clearInterval(id)
  }, [onProgress])
  useEffect(() => {
    if (frac >= 0.97 && dur > 0 && !done.current) {
      done.current = true
      onComplete?.()
    }
  }, [frac, dur, onComplete])

  const exit = useCallback(() => {
    if (fracRef.current > 0) onProgress?.(fracRef.current)
    videoRef.current?.pause()
    onClose()
  }, [onClose, onProgress])

  // ── real browser fullscreen ──
  // The player is a fixed overlay, but that still lives inside the browser
  // chrome (and the mobile address bar). The transport's fullscreen control
  // requests true fullscreen on the player root so the video fills the whole
  // screen, and mirrors the current state in its icon + label.
  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null
      webkitExitFullscreen?: () => void
    }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen)
        void document.exitFullscreen().catch(() => undefined)
      else doc.webkitExitFullscreen?.()
      return
    }
    const root = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null
    if (root?.requestFullscreen) {
      void root.requestFullscreen().catch(() => undefined)
    } else if (root?.webkitRequestFullscreen) {
      root.webkitRequestFullscreen()
    } else {
      // iOS Safari only lets the <video> element itself go fullscreen.
      const video = videoRef.current as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null
      video?.webkitEnterFullscreen?.()
    }
  }, [])

  // Best-effort fullscreen-on-rotate for touch devices: turning the phone
  // to landscape while watching enters real fullscreen (and back out on
  // portrait). Browsers may reject the request outside a user gesture —
  // that's fine, the fullscreen button remains the explicit path.
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => {
      const root = containerRef.current
      if (mq.matches) {
        if (!document.fullscreenElement && root?.requestFullscreen) {
          void root.requestFullscreen().catch(() => undefined)
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined)
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Picture-in-Picture (progressive enhancement) ──
  const [pipSupported, setPipSupported] = useState(false)
  useEffect(() => {
    setPipSupported(
      'pictureInPictureEnabled' in document && document.pictureInPictureEnabled,
    )
  }, [])
  const togglePip = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined)
    } else {
      void el.requestPictureInPicture().catch(() => undefined)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  }, [])

  // ── volume + mute ──
  // The element is the single source of truth: every path writes to it
  // synchronously and mirrors into state, and the poll keeps them honest.
  const applyVolume = useCallback((v: number) => {
    const el = videoRef.current
    if (!el) return
    const clamped = Math.min(1, Math.max(0, v))
    el.volume = clamped
    // Dragging to zero reads as mute; any audible level unmutes.
    el.muted = clamped === 0
    setVolume(clamped)
    setMuted(el.muted)
    savePrefs({ volume: clamped, muted: el.muted })
  }, [])

  const toggleMute = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.muted || el.volume === 0) {
      el.muted = false
      // Unmuting at zero volume would be a silent no-op — restore to half.
      if (el.volume === 0) el.volume = 0.5
    } else {
      el.muted = true
    }
    setMuted(el.muted)
    setVolume(el.volume)
    savePrefs({ muted: el.muted, volume: el.volume })
  }, [])

  // Briefly expand the slider capsule after a keyboard volume change so
  // the level is visible without needing the pointer on the button.
  const flashVolume = useCallback(() => {
    setVolOpen(true)
    if (volFlashTimer.current) clearTimeout(volFlashTimer.current)
    volFlashTimer.current = setTimeout(() => setVolOpen(false), 1200)
  }, [])

  const setVolFromX = useCallback(
    (clientX: number) => {
      const bar = volBarRef.current
      if (!bar) return
      const r = bar.getBoundingClientRect()
      applyVolume((clientX - r.left) / r.width)
    },
    [applyVolume],
  )

  // ── playback speed ──
  const selectRate = useCallback((r: number) => {
    setRate(r)
    setRateOpen(false)
    const el = videoRef.current
    if (el) el.playbackRate = r
    savePrefs({ rate: r })
  }, [])

  // Close the speed menu on any press outside it.
  useEffect(() => {
    if (!rateOpen) return
    const onDown = (e: PointerEvent) => {
      if (prateRef.current && !prateRef.current.contains(e.target as Node)) {
        setRateOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [rateOpen])

  const seekBy = useCallback((delta: number) => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.duration)) return
    el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + delta))
  }, [])

  const seekAt = useCallback((clientX: number) => {
    const el = videoRef.current
    const bar = barRef.current
    if (!el || !bar || !Number.isFinite(el.duration)) return
    const r = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    el.currentTime = el.duration * ratio
    setT(el.currentTime)
  }, [])

  // Move the frame preview to the pointer's position over the scrub bar.
  const previewAt = useCallback((clientX: number) => {
    const bar = barRef.current
    if (!bar) return
    const r = bar.getBoundingClientRect()
    setPreview(Math.min(1, Math.max(0, (clientX - r.left) / r.width)))
  }, [])

  // Warm the sprite sheet as soon as cues arrive, so the very first hover
  // shows a frame instead of a blank card while the image loads.
  useEffect(() => {
    if (!storyboard || storyboard.length === 0) return
    const img = new Image()
    img.src = storyboard[0].url
  }, [storyboard])

  // Drag-to-scrub (mouse + touch). The preview follows the drag.
  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (dragging.current) {
        seekAt(e.clientX)
        previewAt(e.clientX)
      }
    }
    const tm = (e: TouchEvent) => {
      if (dragging.current && e.touches[0]) {
        seekAt(e.touches[0].clientX)
        previewAt(e.touches[0].clientX)
      }
    }
    const up = () => {
      if (dragging.current) setPreview(null)
      dragging.current = false
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', tm)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', up)
    }
  }, [seekAt, previewAt])

  // Keyboard.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      revealUi()
      if (e.key === 'Escape') {
        if (rateOpen) setRateOpen(false)
        else if (side) setSide(null)
        // While fullscreen, the browser already exits fullscreen on Escape —
        // don't also tear down the whole player out from under the viewer.
        else if (document.fullscreenElement) return
        else exit()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') seekBy(10)
      else if (e.key === 'ArrowLeft') seekBy(-10)
      else if (e.key === 'ArrowUp') {
        e.preventDefault()
        applyVolume((mutedRef.current ? 0 : volumeRef.current) + 0.05)
        flashVolume()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        applyVolume(volumeRef.current - 0.05)
        flashVolume()
      } else if (e.key === 'm' || e.key === 'M') toggleMute()
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [
    side,
    rateOpen,
    exit,
    togglePlay,
    seekBy,
    revealUi,
    toggleFullscreen,
    applyVolume,
    flashVolume,
    toggleMute,
  ])

  // Lock page scroll while the player is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const hasDiscussion = comments != null

  // Mux assets stream HLS; anything else (e.g. a direct file URL) plays
  // through a plain element — mirrors the sample screen's split.
  const isHls = Boolean(
    lesson.muxPlaybackId ||
    (lesson.playbackUrl && lesson.playbackUrl.includes('.m3u8')),
  )
  // Advance to the next playlist lesson — flush a final progress report
  // first so the finished lesson's watch state lands before the swap.
  const goNext = useCallback(() => {
    const next = nextItemRef.current
    if (!next || !onSelectLesson) return
    if (fracRef.current > 0) onProgress?.(fracRef.current)
    onSelectLesson(next.id)
  }, [onSelectLesson, onProgress])

  const onEndedCb = useCallback(() => {
    if (!done.current) {
      done.current = true
      onComplete?.()
    }
    // The clip ran out with the Up Next card still armed → autoplay now.
    // (The card counted down during the final seconds; the end of the
    // video IS the zero mark, so there's no dead frame in between.)
    if (!upNextDismissedRef.current) goNext()
  }, [onComplete, goNext])

  // ── touch gestures on the video surface ──
  // A transparent layer over the video (below the chrome) owns touch input:
  // single tap toggles the chrome, double-tap on the left/right third seeks
  // ∓/±10s with a YouTube-style indicator, and a decisive downward swipe
  // dismisses the player. Mouse input is untouched — desktop keeps its
  // hover/keyboard behavior.
  //
  // Mobile browsers replay a tap as SYNTHETIC mouse events (mousemove /
  // mousedown) right after the touch sequence. Without suppression those
  // hit the root's revealUi immediately, so by the time the deferred
  // single-tap handler ran (280ms later, to leave room for a double-tap)
  // the chrome was already visible and the "toggle" hid it again — tap,
  // flash, gone. Every touch stamps lastTouchAt (captured at the root so
  // control taps count too) and mouse handlers stand down inside that
  // window; on touch devices the tap gesture is the only chrome authority.
  const lastTouchAt = useRef(0)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const lastTap = useRef<{
    time: number
    timer: ReturnType<typeof setTimeout> | null
  }>({ time: 0, timer: null })
  const [tapInd, setTapInd] = useState<null | {
    side: 'left' | 'right'
    key: number
  }>(null)
  useEffect(() => {
    if (!tapInd) return
    const id = setTimeout(() => setTapInd(null), 550)
    return () => clearTimeout(id)
  }, [tapInd])
  useEffect(
    () => () => {
      if (lastTap.current.timer) clearTimeout(lastTap.current.timer)
    },
    [],
  )

  const isRecentTouch = () => Date.now() - lastTouchAt.current < 800
  const revealUiFromMouse = () => {
    if (isRecentTouch()) return
    revealUi()
  }

  const onGestureTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0]
    touchStartPos.current = t0 ? { x: t0.clientX, y: t0.clientY } : null
  }
  const onGestureTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartPos.current
    const t0 = e.changedTouches[0]
    touchStartPos.current = null
    if (!start || !t0) return
    const dx = t0.clientX - start.x
    const dy = t0.clientY - start.y
    // Swipe down → dismiss (position is flushed by exit()).
    if (dy > 90 && dy > 2 * Math.abs(dx)) {
      exit()
      return
    }
    if (Math.hypot(dx, dy) > 12) return // a drag, not a tap
    const now = Date.now()
    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? window.innerWidth
    const x = t0.clientX - (rect?.left ?? 0)
    const zone = x < w / 3 ? 'left' : x > (2 * w) / 3 ? 'right' : 'center'
    if (lastTap.current.timer && now - lastTap.current.time < 300) {
      // Double tap.
      clearTimeout(lastTap.current.timer)
      lastTap.current = { time: 0, timer: null }
      if (zone === 'left') {
        seekBy(-10)
        setTapInd({ side: 'left', key: now })
      } else if (zone === 'right') {
        seekBy(10)
        setTapInd({ side: 'right', key: now })
      } else {
        togglePlay()
      }
      return
    }
    // Single tap (fires unless a second tap lands within the window):
    // toggle the chrome.
    lastTap.current = {
      time: now,
      timer: setTimeout(() => {
        lastTap.current.timer = null
        const show = !uiVisibleRef.current
        setUiVisible(show)
        if (show && videoRef.current && !videoRef.current.paused) {
          scheduleHide()
        } else if (!show && hideTimer.current) {
          clearTimeout(hideTimer.current)
        }
      }, 280),
    }
  }

  const effVol = muted ? 0 : volume
  const volGlyph =
    muted || volume === 0
      ? SF.audioMuted
      : volume < 0.55
        ? SF.audioLow
        : SF.audio

  // Frame preview under the pointer while hovering/dragging the scrub bar.
  const previewT = preview != null && dur > 0 ? preview * dur : null
  const previewCue = previewT != null ? cueAt(storyboard, previewT) : null
  const previewScale = previewCue ? PREVIEW_W / previewCue.w : 1

  // Up Next: armed in the final window, unless cancelled. Derived from the
  // video clock, so scrubbing back out of the window hides it again and
  // pausing freezes the countdown. While armed the player enters "endmode":
  // the live video shrinks into a floating card and the next lesson takes
  // over as the hero behind it (Apple TV's continuity pattern).
  const remaining = Math.max(0, dur - t)
  const upNextVisible = Boolean(
    nextItem &&
      onSelectLesson &&
      !upNextDismissed &&
      dur > 0 &&
      remaining <= UP_NEXT_WINDOW_SECONDS &&
      frac >= UP_NEXT_MIN_FRAC,
  )
  const upNextCountdown = Math.ceil(Math.min(UP_NEXT_WINDOW_SECONDS, remaining))

  return (
    <div
      ref={containerRef}
      className={`sov2 player ${uiVisible ? '' : 'ui-hidden'} ${
        upNextVisible ? 'endmode' : ''
      }`}
      data-watch-player
      onMouseMove={revealUiFromMouse}
      onMouseDown={revealUiFromMouse}
      onTouchStartCapture={() => {
        lastTouchAt.current = Date.now()
      }}
    >
      <div
        className="player-video"
        // In endmode the shrunken live video doubles as "keep watching":
        // tapping it cancels autoplay and expands playback back out.
        onClick={
          upNextVisible ? () => setUpNextDismissed(true) : undefined
        }
        role={upNextVisible ? 'button' : undefined}
        aria-label={upNextVisible ? 'Keep watching' : undefined}
      >
        {isHls ? (
          <HlsVideo
            playbackId={lesson.muxPlaybackId ?? null}
            playbackUrl={lesson.playbackUrl ?? null}
            poster={lesson.thumbnailUrl ?? null}
            controls={false}
            className="watch-video"
            onVideoElement={onVideoEl}
            onEnded={onEndedCb}
          />
        ) : (
          <video
            src={lesson.playbackUrl ?? undefined}
            poster={lesson.thumbnailUrl ?? undefined}
            playsInline
            ref={onVideoEl}
            onEnded={onEndedCb}
          />
        )}
      </div>
      <div className="player-vignette" />

      <div
        className="player-gestures"
        onTouchStart={onGestureTouchStart}
        onTouchEnd={onGestureTouchEnd}
        aria-hidden
      />
      {tapInd && (
        <div key={tapInd.key} className={`tap-ind ${tapInd.side}`}>
          <SkipIcon dir={tapInd.side === 'left' ? -1 : 1} n={10} size={28} />
          <span>10 seconds</span>
        </div>
      )}

      {paused && (
        <button
          className="player-bigplay"
          onClick={togglePlay}
          aria-label="Play"
        >
          <Glyph d={SF.play} size={44} fill="#fff" />
        </button>
      )}

      {stalled && (
        <div className="player-spin" role="status" aria-label="Loading" />
      )}

      {cc && captionText && (
        <div className="player-cc" aria-live="off">
          {captionText.split('\n').map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}

      <div className="player-top" onTouchStart={revealUi}>
        <button className="pbtn" onClick={exit} aria-label="Back">
          <Glyph d={SF.back} size={24} stroke={2} />
        </button>
        <div className="player-title">
          <div className="pt-k">
            {instructorName ? `${instructorName} · ` : ''}
            {courseTitle}
          </div>
          <div className="pt-t">
            {lesson.kicker ?? `${unitLabel} ${lesson.n} · ${lesson.title}`}
          </div>
        </div>
      </div>

      <div className="player-controls" onTouchStart={revealUi}>
        <div className="scrub-row">
          <span className="ptime">{fmtTime(t)}</span>
          <div
            className="scrub"
            ref={barRef}
            onMouseDown={(e) => {
              if (isRecentTouch()) return // synthetic replay of a touch
              dragging.current = true
              seekAt(e.clientX)
              previewAt(e.clientX)
            }}
            onTouchStart={(e) => {
              dragging.current = true
              if (e.touches[0]) {
                seekAt(e.touches[0].clientX)
                previewAt(e.touches[0].clientX)
              }
            }}
            onMouseMove={(e) => {
              if (isRecentTouch()) return // would strand the frame preview
              previewAt(e.clientX)
            }}
            onMouseLeave={() => {
              if (!dragging.current) setPreview(null)
            }}
          >
            {previewT != null && (
              <div
                className="scrub-preview"
                style={{
                  // Follow the pointer, but never hang off the bar's ends.
                  left: `clamp(${PREVIEW_W / 2}px, ${
                    (preview ?? 0) * 100
                  }%, calc(100% - ${PREVIEW_W / 2}px))`,
                }}
              >
                {previewCue && (
                  <div
                    className="scrub-thumb"
                    style={{
                      width: PREVIEW_W,
                      height: Math.round(previewCue.h * previewScale),
                    }}
                  >
                    {/* One sprite sheet, cropped per cue: shift the sheet so
                        the tile's corner lands at origin, then scale it to
                        the display size (transforms apply right-to-left). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewCue.url}
                      alt=""
                      draggable={false}
                      style={{
                        transform: `scale(${previewScale}) translate(${-previewCue.x}px, ${-previewCue.y}px)`,
                        transformOrigin: '0 0',
                      }}
                    />
                  </div>
                )}
                <span className="scrub-preview-time">{fmtTime(previewT)}</span>
              </div>
            )}
            <div className="scrub-track">
              <div
                className="scrub-buf"
                style={{ width: `${Math.min(100, buffered * 100)}%` }}
              />
              <div className="scrub-fill" style={{ width: `${frac * 100}%` }} />
              <div className="scrub-knob" style={{ left: `${frac * 100}%` }} />
            </div>
          </div>
          <span className="ptime">-{fmtTime(Math.max(0, dur - t))}</span>
        </div>

        <div className="transport">
          <div className="tp-left">
            <span className="tp-chaplabel">{lesson.title}</span>
          </div>
          <div className="tp-center">
            {canNavigate && (
              <button
                className="pbtn sm"
                disabled={!prevItem}
                onClick={() => prevItem && onSelectLesson?.(prevItem.id)}
                aria-label="Previous lesson"
              >
                <TrackIcon dir={-1} />
              </button>
            )}
            <button
              className="pbtn"
              onClick={() => seekBy(-10)}
              aria-label="Back 10 seconds"
            >
              <SkipIcon dir={-1} n={10} size={30} />
            </button>
            <button
              className="pbtn big"
              onClick={togglePlay}
              aria-label={paused ? 'Play' : 'Pause'}
            >
              <Glyph
                d={paused ? SF.play : SF.pause}
                size={30}
                fill="currentColor"
              />
            </button>
            <button
              className="pbtn"
              onClick={() => seekBy(10)}
              aria-label="Forward 10 seconds"
            >
              <SkipIcon dir={1} n={10} size={30} />
            </button>
            {canNavigate && (
              <button
                className="pbtn sm"
                disabled={!nextItem}
                onClick={() => nextItem && onSelectLesson?.(nextItem.id)}
                aria-label="Next lesson"
              >
                <TrackIcon dir={1} />
              </button>
            )}
          </div>
          <div className="tp-right">
            <div className={`pvol ${volOpen ? 'open' : ''}`}>
              {/* Slider precedes the button so the capsule grows leftward
                  into empty space instead of shoving the other controls.
                  Hidden on iOS, where page volume is hardware-only. */}
              {!isIOS && (
                <div
                  className="pvol-slider"
                  role="slider"
                  aria-label="Volume"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(effVol * 100)}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    volDragging.current = true
                    setVolOpen(true)
                    if (volFlashTimer.current)
                      clearTimeout(volFlashTimer.current)
                    setVolFromX(e.clientX)
                  }}
                  onPointerMove={(e) => {
                    if (volDragging.current) setVolFromX(e.clientX)
                  }}
                  onPointerUp={() => {
                    volDragging.current = false
                    setVolOpen(false)
                  }}
                  onPointerCancel={() => {
                    volDragging.current = false
                    setVolOpen(false)
                  }}
                >
                  <div className="pvol-track" ref={volBarRef}>
                    <div
                      className="pvol-fill"
                      style={{ width: `${effVol * 100}%` }}
                    />
                    <div
                      className="pvol-knob"
                      style={{ left: `${effVol * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                className="pbtn sm"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
              >
                <Glyph d={volGlyph} size={21} stroke={1.9} />
              </button>
            </div>
            <div className="prate" ref={prateRef}>
              <button
                className={`pbtn sm ${rate !== 1 ? 'on' : ''}`}
                onClick={() => setRateOpen((o) => !o)}
                aria-label="Playback speed"
                aria-expanded={rateOpen}
              >
                <span className="prate-label">{rate}&times;</span>
              </button>
              {rateOpen && (
                <div className="pmenu" role="menu">
                  <div className="pmenu-title">Speed</div>
                  {RATES.map((r) => (
                    <button
                      key={r}
                      className={`pmenu-item ${r === rate ? 'on' : ''}`}
                      role="menuitemradio"
                      aria-checked={r === rate}
                      onClick={() => selectRate(r)}
                    >
                      <span>{r}&times;</span>
                      {r === rate && (
                        <Glyph d={SF.check} size={14} stroke={2.4} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {canNavigate && (
              <button
                className={`pbtn sm ${side === 'lessons' ? 'on' : ''}`}
                onClick={() =>
                  setSide((s) => (s === 'lessons' ? null : 'lessons'))
                }
                aria-label="Lessons"
                aria-pressed={side === 'lessons'}
              >
                <ListIcon />
              </button>
            )}
            {pipSupported && (
              <button
                className="pbtn sm"
                onClick={togglePip}
                aria-label="Picture in picture"
              >
                <PipIcon />
              </button>
            )}
            {/* Always present so the control is discoverable on every
                lesson; disabled (and non-toggling) when the asset carries no
                caption track — a lesson whose Mux auto-captions aren't ready
                yet still shows a dimmed "Captions unavailable" button rather
                than nothing at all. */}
            <button
              className={`pbtn sm ${cc && hasCaptions ? 'on' : ''}`}
              onClick={() => setCc((c) => !c)}
              disabled={!hasCaptions}
              aria-label={
                !hasCaptions
                  ? 'Captions unavailable'
                  : cc
                    ? 'Turn off captions'
                    : 'Turn on captions'
              }
              aria-pressed={hasCaptions ? cc : undefined}
              title={hasCaptions ? undefined : 'Captions unavailable'}
            >
              <Glyph d={SF.captions} size={21} stroke={1.9} />
            </button>
            {hasDiscussion && (
              <button
                className={`pbtn sm ${side === 'discussion' ? 'on' : ''}`}
                onClick={() =>
                  setSide((s) => (s === 'discussion' ? null : 'discussion'))
                }
                aria-label="Discussion"
                aria-pressed={side === 'discussion'}
              >
                <Glyph d={SF.bubble} size={21} stroke={2} />
                {comments!.length > 0 && (
                  <span className="pbtn-badge">{comments!.length}</span>
                )}
              </button>
            )}
            <button
              className="pbtn sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-pressed={isFullscreen}
            >
              <Glyph
                d={isFullscreen ? SF.fullscreenExit : SF.fullscreen}
                size={21}
                stroke={2}
              />
            </button>
          </div>
        </div>
      </div>

      {upNextVisible && nextItem && (
        <div className="endscreen" role="dialog" aria-label="Up next">
          {/* Real next-lesson artwork becomes the hero behind the
              shrunken live video. */}
          {nextItem.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="es-art"
              src={nextItem.thumbnailUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <div className="es-art ph" />
          )}
          <div className="es-scrim" />
          <div className="es-content">
            <div className="es-k">Up next</div>
            <h2 className="es-title">{nextItem.title}</h2>
            <div className="es-meta">
              {unitLabel} {nextItem.n}
              {nextItem.durationSeconds
                ? ` · ${fmtTime(nextItem.durationSeconds)}`
                : ''}
            </div>
            {nextItem.description ? (
              <p className="es-desc">{nextItem.description}</p>
            ) : null}
            <div className="es-actions">
              {/* The SAME CTA the course hero renders — cover variant is
                  the white pill with the play chip, marquee is the band's
                  rounded-rect play button. */}
              <button
                className={`es-play ${ctaVariant}`}
                onClick={goNext}
                aria-label={`Play next: ${unitLabel} ${nextItem.n} · ${nextItem.title}`}
              >
                {ctaVariant === 'cover' ? (
                  <span className="es-play-chip">
                    <Glyph d={SF.play} size={15} fill="currentColor" />
                  </span>
                ) : (
                  <Glyph d={SF.play} size={17} fill="currentColor" />
                )}
                Play Next {unitLabel}
              </button>
              <button
                className="es-cancel"
                onClick={() => setUpNextDismissed(true)}
              >
                Cancel
              </button>
            </div>
            <div className="es-count" aria-live="polite">
              Playing in {upNextCountdown}s
            </div>
          </div>
        </div>
      )}

      {side === 'lessons' && canNavigate && (
        <div
          className="pl-wrap"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSide(null)
          }}
        >
          <div className="pl-sheet" role="dialog" aria-label="Lessons">
            <div className="pl-head">
              <span>Lessons</span>
              <button
                className="pbtn sm"
                onClick={() => setSide(null)}
                aria-label="Close"
              >
                <Glyph d={SF.close} size={14} stroke={2.2} />
              </button>
            </div>
            <div className="pl-body">
              {playlist!.map((p) => (
                <button
                  key={p.id}
                  className={`pl-row ${p.id === currentId ? 'now' : ''} ${
                    p.locked ? 'locked' : ''
                  }`}
                  disabled={p.locked}
                  onClick={() => {
                    setSide(null)
                    if (p.id !== currentId) onSelectLesson?.(p.id)
                  }}
                >
                  <span
                    className="pl-thumb"
                    style={
                      p.thumbnailUrl
                        ? { backgroundImage: `url("${p.thumbnailUrl}")` }
                        : undefined
                    }
                  >
                    {p.locked ? (
                      <Glyph d={SF.locksm} size={12} stroke={2.1} />
                    ) : p.watched ? (
                      <Glyph d={SF.check} size={12} stroke={2.6} />
                    ) : null}
                  </span>
                  <span className="pl-info">
                    <span className="pl-num">
                      {unitLabel} {p.n}
                      {p.id === currentId ? ' · Now playing' : ''}
                    </span>
                    <span className="pl-title">{p.title}</span>
                  </span>
                  <span className="pl-dur">
                    {p.durationSeconds ? fmtTime(p.durationSeconds) : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {side === 'discussion' && hasDiscussion && (
        <CommentsPanel
          // The player is always dark, so its discussion panel is too —
          // otherwise it rendered as a white sheet over the dark video.
          dark
          lessonLabel={`${unitLabel} ${lesson.n} · ${lesson.title}`}
          comments={comments!}
          canModerate={canModerateComments}
          instructorName={instructorName}
          onClose={() => setSide(null)}
          onLike={onLikeComment}
          onPost={onPostComment}
          onDelete={onDeleteComment}
          onPin={onPinComment}
          onHeart={onHeartComment}
        />
      )}

      <WatchStyles />
    </div>
  )
}

export default WatchPlayer
