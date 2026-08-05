'use client'

/**
 * Storefront Course Card — the Apple-TV-style 16:9 tile a course gets in a
 * Spaire Space (instead of the plain digital-product card). A 1:1 port of the
 * "Storefront Course Card" design (cover + bottom progressive-blur stack +
 * brand kicker + bottom-left lockup), with the SAME hover-trailer mechanism the
 * course landing hero uses: hovering the tile peeks the trailer (tries sound,
 * falls back to muted), leaving snaps back to the still.
 *
 * The trailer URL lives on the course landing, not on the storefront product,
 * so we fetch the landing lazily on first hover (cheap — one request, cached)
 * rather than loading every course's landing up front.
 */
import { type CourseLandingPageData } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import './storefrontCourseCard.css'

// Lazily fetch a course's public landing (for its trailer) — only once the
// visitor hovers the card. Mirrors ProductLandingPage's by-product fetch.
function useCourseLanding(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['storefront-course-landing', productId],
    queryFn: async (): Promise<CourseLandingPageData | null> => {
      const base = process.env.NEXT_PUBLIC_API_URL ?? ''
      const r = await fetch(
        `${base}/v1/customer-portal/courses/by-product/${productId}/landing`,
        { credentials: 'include', cache: 'no-store' },
      )
      if (!r.ok) return null
      return (await r.json()) as CourseLandingPageData
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

// The course hero's trailer-peek mechanism, verbatim: on peek, reset to the
// start and try to play with sound; if the browser blocks unmuted autoplay,
// fall back to muted (and unmute the moment the visitor interacts anywhere).
function useTrailerPeek(trailerUrl: string | null, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !trailerUrl) return
    if (active) {
      try {
        v.currentTime = 0
      } catch {
        /* seek before buffer ready — ignore */
      }
      v.muted = false
      v.volume = 1
      void v.play().catch(() => {
        v.muted = true
        void v.play().catch(() => {})
      })
    } else {
      v.pause()
    }
  }, [active, trailerUrl])

  // Sound unlock: browsers block autoplay-with-sound until a gesture. The first
  // interaction anywhere unmutes a currently-peeking trailer.
  useEffect(() => {
    if (!trailerUrl) return
    const unmute = () => {
      const v = videoRef.current
      if (v && activeRef.current && v.muted) {
        v.muted = false
        v.volume = 1
        void v.play().catch(() => {})
      }
    }
    window.addEventListener('pointerdown', unmute, true)
    window.addEventListener('keydown', unmute, true)
    window.addEventListener('touchstart', unmute, true)
    return () => {
      window.removeEventListener('pointerdown', unmute, true)
      window.removeEventListener('keydown', unmute, true)
      window.removeEventListener('touchstart', unmute, true)
    }
  }, [trailerUrl])

  return videoRef
}

const PLAY_PATH =
  'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z'

export function StorefrontCourseCard({
  product,
  previewStatic = false,
}: {
  product: schemas['ProductStorefront']
  /** Editor preview: show the static tile only — no trailer fetch/playback. */
  previewStatic?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  // The trailer only fades in once it's actually playing, so we never flash a
  // black video frame over the still while it loads.
  const [playing, setPlaying] = useState(false)

  const wantTrailer = hovered && !previewStatic
  const landing = useCourseLanding(product.id, wantTrailer)
  const trailerUrl = previewStatic ? null : (landing.data?.trailer_url ?? null)
  const videoRef = useTrailerPeek(trailerUrl, wantTrailer)

  const cover = product.medias[0]?.public_url

  const onLeave = () => {
    setHovered(false)
    setPlaying(false)
  }

  return (
    <div
      className="scc-tile"
      onMouseEnter={previewStatic ? undefined : () => setHovered(true)}
      onMouseLeave={previewStatic ? undefined : onLeave}
    >
      <div
        className="scc-card"
        style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
      >
        {trailerUrl && (
          <video
            ref={videoRef}
            className={`scc-trailer${playing ? ' on' : ''}`}
            src={trailerUrl}
            playsInline
            loop
            preload="metadata"
            onPlaying={() => setPlaying(true)}
          />
        )}

        <div className="scc-blur">
          <div className="bl bl1" />
          <div className="bl bl2" />
          <div className="bl bl3" />
          <div className="bl bl4" />
        </div>
        <div className="scc-shade" />

        <div className="scc-kicker">
          <span className="dot" />
          Spaire Original
        </div>

        <div className="scc-info">
          <div className="scc-genre">Course</div>
          <div className="scc-title">{product.name}</div>
          <span className="scc-cta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d={PLAY_PATH} />
            </svg>
            View original
          </span>
        </div>
      </div>
    </div>
  )
}

export default StorefrontCourseCard
