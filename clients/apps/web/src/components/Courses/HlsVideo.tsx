'use client'

import { useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

type HlsInstance = {
  destroy: () => void
  loadSource: (src: string) => void
  attachMedia: (video: HTMLVideoElement) => void
  startLoad: () => void
  recoverMediaError: () => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
}

// Tuned for VOD lessons rather than live streams: a generous forward
// buffer lets the demuxer keep audio + video frames aligned even when
// the network jitters mid-segment, which was the root cause of the
// "sound a step behind the picture" reports.
const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  // Prefetch the first fragment before media is attached so playback can
  // begin a little sooner once the element is ready.
  startFragPrefetch: true,
  // Never auto-display a subtitle/caption track. hls.js defaults this to
  // `true`, which turns captions on as soon as the manifest loads — the
  // player owns caption state explicitly, so leave them hidden until the
  // viewer asks for them. Otherwise the on-screen captions and the toggle
  // button disagree about whether captions are on.
  subtitleDisplay: false,
}

export const HlsVideo = ({
  playbackId,
  playbackUrl,
  poster,
  className,
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
  startSec = 0,
  hideCaptions = false,
  onEnded,
  onVideoElement,
}: {
  playbackId?: string | null
  playbackUrl?: string | null
  poster?: string | null
  className?: string
  controls?: boolean
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  // Start playback at this second (e.g. opened from an assistant citation).
  startSec?: number
  // Keep every subtitle/caption track OFF. hls.js honors `subtitleDisplay:
  // false` (desktop path), but NATIVE HLS on mobile (the `video.src = m3u8`
  // branch) ignores it and auto-shows a default/forced caption track — so a
  // bare player with no CC control leaks captions on phones but not desktop.
  // Set this on players that never expose a caption toggle (e.g. the sample
  // clip). Players that own caption state themselves (WatchPlayer) leave it
  // off and manage the tracks via onVideoElement instead.
  hideCaptions?: boolean
  onEnded?: () => void
  // Lets a parent reach the underlying <video> element for things like
  // reading currentTime or seeking. Called with the element on mount and
  // with null on unmount.
  onVideoElement?: (el: HTMLVideoElement | null) => void
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Track the current Hls instance via a ref so a fast effect re-run
  // (e.g. switching lessons before the dynamic import resolves) can't
  // leak the previous one.
  const hlsRef = useRef<HlsInstance | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)
  // Bumped by "Try again" so the setup effect below actually re-runs —
  // clearing the error alone re-rendered a dead <video> (the Hls instance
  // had been destroyed) and the screen stayed black.
  const [retryNonce, setRetryNonce] = useState(0)
  // Prefer the server-signed playback URL. Fall back to building one from
  // the public playback id for legacy public assets.
  const src =
    playbackUrl ??
    (playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null)

  useEffect(() => {
    const el = videoRef.current
    onVideoElement?.(el)
    return () => onVideoElement?.(null)
  }, [onVideoElement])

  // Seek to startSec (e.g. when opened at a moment from an assistant citation).
  // Re-runs when startSec changes so jumping to a new timestamp in the same
  // lesson re-seeks. Waits for metadata so duration/seekable are known.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !startSec || startSec <= 0) return
    const seek = () => {
      const target = Number.isFinite(el.duration)
        ? Math.min(startSec, Math.max(0, el.duration - 1))
        : startSec
      try {
        el.currentTime = target
      } catch {
        /* element not ready to seek yet */
      }
    }
    if (el.readyState >= 1) seek()
    else el.addEventListener('loadedmetadata', seek, { once: true })
    return () => el.removeEventListener('loadedmetadata', seek)
  }, [startSec])

  // Force captions off (see `hideCaptions` above). Text tracks load async and
  // native HLS / iOS can (re-)enable them after metadata or on play, so
  // re-assert "disabled" on every event that could turn them back on.
  useEffect(() => {
    if (!hideCaptions) return
    const el = videoRef.current
    if (!el) return
    const disableAll = () => {
      const tracks = el.textTracks
      for (let i = 0; i < tracks.length; i++) tracks[i].mode = 'disabled'
    }
    disableAll()
    el.textTracks.addEventListener?.('addtrack', disableAll)
    el.addEventListener('loadedmetadata', disableAll)
    el.addEventListener('play', disableAll)
    return () => {
      el.textTracks.removeEventListener?.('addtrack', disableAll)
      el.removeEventListener('loadedmetadata', disableAll)
      el.removeEventListener('play', disableAll)
    }
  }, [hideCaptions, src, retryNonce])

  useEffect(() => {
    setFatalError(null)
    const video = videoRef.current
    if (!video || !src) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }

    let cancelled = false
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !videoRef.current) return
      // Cleanup any previous instance before creating a new one — protects
      // against the race where the effect re-ran before the import resolved.
      hlsRef.current?.destroy()
      if (!Hls.isSupported()) {
        videoRef.current.src = src
        return
      }
      const instance = new (Hls as unknown as new (
        config: typeof HLS_CONFIG,
      ) => HlsInstance)(HLS_CONFIG)
      instance.loadSource(src)
      instance.attachMedia(videoRef.current)
      // Recover from transient errors automatically; surface fatal ones so
      // the user gets a real error instead of a frozen black box.
      instance.on(
        (Hls as unknown as { Events: { ERROR: string } }).Events.ERROR,
        (...args: unknown[]) => {
          const data = args[1] as
            | { fatal?: boolean; type?: string; details?: string }
            | undefined
          if (!data?.fatal) return
          const ErrorTypes = (
            Hls as unknown as {
              ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string }
            }
          ).ErrorTypes
          if (data.type === ErrorTypes.NETWORK_ERROR) {
            instance.startLoad()
          } else if (data.type === ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError()
          } else {
            setFatalError(data.details ?? 'Video playback failed')
            instance.destroy()
            if (hlsRef.current === instance) hlsRef.current = null
          }
        },
      )
      hlsRef.current = instance
    })

    return () => {
      cancelled = true
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [src, retryNonce])

  if (fatalError) {
    return (
      <div
        className={twMerge(
          'flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center text-sm text-white/80',
          className,
        )}
      >
        <p>Couldn't play this video.</p>
        <button
          type="button"
          onClick={() => {
            setFatalError(null)
            setRetryNonce((n) => n + 1)
          }}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      autoPlay={autoPlay}
      controls={controls}
      muted={muted}
      loop={loop}
      playsInline
      poster={poster ?? undefined}
      className={twMerge('h-full w-full', className)}
      onEnded={onEnded}
    />
  )
}
