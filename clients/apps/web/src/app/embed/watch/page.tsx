'use client'

// Render-only harness for the Spaire Originals v2 watch components:
//   /embed/watch            → WatchPlayer over a synthesized webm clip
//   /embed/watch?sheet=1    → OverviewSheet (rich lesson data)
//   /embed/watch?comments=1 → CommentsPanel
//   &dark=1                 → dark theme for the sheets/panel
// The clip is generated client-side (canvas + MediaRecorder) so real
// playback, scrubbing, and progress can be verified without a Mux asset.

import { WatchPlayer } from '@/components/Courses/watch/WatchPlayer'
import {
  CommentsPanel,
  OverviewSheet,
  type WatchComment,
} from '@/components/Courses/watch/WatchSheets'
import { useEffect, useState } from 'react'

// Threaded discussion fixture: a pinned instructor comment, a hearted
// student comment with an instructor reply, and the viewer's own comment.
// &mod=1 renders the panel with instructor moderation (pin/heart/delete).
const COMMENTS: WatchComment[] = [
  {
    id: 'c0',
    name: 'Carla Marín',
    avatarUrl: 'https://i.pravatar.cc/64?img=32',
    time: '3d',
    text: 'Welcome to lesson 2 — drop your between-point routines below and I will heart my favorites.',
    likes: 41,
    pinned: true,
    isInstructor: true,
    replies: [],
  },
  {
    id: 'c1',
    name: 'Amara Okeke',
    avatarUrl: 'https://i.pravatar.cc/64?img=5',
    time: '2d',
    text: 'Three minutes in and I already understand why I keep losing close matches.',
    likes: 12,
    liked: true,
    instructorHearted: true,
    replies: [
      {
        id: 'c1r1',
        name: 'Carla Marín',
        avatarUrl: 'https://i.pravatar.cc/64?img=32',
        time: '2d',
        text: 'That awareness is 80% of the fix. The routine handles the rest.',
        likes: 8,
        isInstructor: true,
      },
    ],
  },
  {
    id: 'c2',
    name: 'Diego Fuentes',
    avatarUrl: 'https://i.pravatar.cc/64?img=12',
    time: '1d',
    text: 'Coming back after 10 years off. Exactly the reset I needed.',
    likes: 5,
    isOwn: true,
    replies: [],
  },
]

export default function WatchEmbedPage() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [storyboardUrl, setStoryboardUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [progressLog, setProgressLog] = useState<number[]>([])
  // Up Next harness state: advancing replays the same clip as lesson n+1.
  // &next=0 exercises the no-next-lesson case (no card, normal ending).
  const [lessonN, setLessonN] = useState(2)

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search))
  }, [])

  // Synthesize a short real video clip (same trick as /embed/generated-portal),
  // plus a Mux-shaped storyboard (sprite sheet + WebVTT with #xywh cues) so
  // hover-scrub thumbnails are verifiable without a Mux asset. Pass
  // &storyboard=0 to exercise the timestamp-only fallback.
  useEffect(() => {
    if (!params || params.get('sheet') || params.get('comments') || url) return
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const ctx = canvas.getContext('2d')!
    // One sprite tile per second of the 8s clip, laid out in a row.
    const TILE_W = 160
    const TILE_H = 90
    const TILES = 8
    const sprite = document.createElement('canvas')
    sprite.width = TILE_W * TILES
    sprite.height = TILE_H
    const sctx = sprite.getContext('2d')!
    let hue = 0
    let tick = 0
    const draw = () => {
      hue = (hue + 4) % 360
      ctx.fillStyle = `hsl(${hue} 70% 50%)`
      ctx.fillRect(0, 0, 320, 180)
      // Snapshot the frame at the top of each second into its sprite cell.
      if (tick % 20 === 0) {
        const i = Math.min(TILES - 1, tick / 20)
        sctx.drawImage(canvas, i * TILE_W, 0, TILE_W, TILE_H)
        sctx.fillStyle = '#fff'
        sctx.font = 'bold 28px sans-serif'
        sctx.fillText(`${i}s`, i * TILE_W + 12, TILE_H - 14)
      }
      tick++
    }
    draw()
    const stream = canvas.captureStream(20)
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      setUrl(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })))
      if (params.get('storyboard') !== '0') {
        sprite.toBlob((blob) => {
          if (!blob) return
          const spriteUrl = URL.createObjectURL(blob)
          const cues = Array.from({ length: TILES }, (_, i) => {
            const t = (s: number) =>
              `00:00:0${s}.000`
            return `${t(i)} --> ${t(i + 1)}\n${spriteUrl}#xywh=${i * TILE_W},0,${TILE_W},${TILE_H}`
          }).join('\n\n')
          setStoryboardUrl(
            URL.createObjectURL(
              new Blob([`WEBVTT\n\n${cues}\n`], { type: 'text/vtt' }),
            ),
          )
        }, 'image/jpeg')
      }
    }
    rec.start()
    const timer = setInterval(draw, 50)
    setTimeout(() => {
      clearInterval(timer)
      rec.stop()
    }, 8000)
    return () => clearInterval(timer)
  }, [params, url])

  if (!params) return null
  const dark = params.get('dark') === '1'

  if (params.get('sheet')) {
    return (
      <div style={{ height: '100vh', background: dark ? '#141416' : '#fff' }}>
        {open && (
          <OverviewSheet
            lessonN={2}
            title="The Athlete’s Mindset"
            durLabel="14 min"
            instructorName="Carla Marín"
            imageUrl={null}
            dark={dark}
            overview={{
              body: [
                "Most players think matches are won with the forehand or the serve. They're not — they're won in the six seconds between points.",
                "In this lesson I'll share the exact mental routine I used on tour: how I reset after errors and how I narrow my focus before the biggest points.",
              ],
              learn: [
                'A 4-step reset routine to use after every point',
                "How to turn nerves into 'readiness' instead of fear",
                'A pre-serve breathing pattern that lowers your heart rate',
              ],
              resources: [
                {
                  name: 'Mental Game Workbook',
                  type: 'pdf',
                  meta: 'PDF · 2.4 MB',
                  url: '#',
                },
                {
                  name: 'Pre-Serve Breathing Audio',
                  type: 'audio',
                  meta: 'MP3 · 4:10',
                  url: '#',
                },
              ],
            }}
            onClose={() => setOpen(false)}
            onPlay={() => undefined}
          />
        )}
      </div>
    )
  }

  if (params.get('comments')) {
    const mod = params.get('mod') === '1'
    return (
      <div style={{ height: '100vh', background: dark ? '#141416' : '#fff' }}>
        {open && (
          <CommentsPanel
            lessonLabel="Lesson 2 · The Athlete’s Mindset"
            comments={COMMENTS}
            dark={dark}
            canModerate={mod}
            instructorName="Carla Marín"
            onClose={() => setOpen(false)}
            onLike={() => undefined}
            onPost={() => undefined}
            onDelete={() => undefined}
            onPin={mod ? () => undefined : undefined}
            onHeart={mod ? () => undefined : undefined}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', background: '#000' }}>
      <div
        data-progress-log={progressLog.map((f) => f.toFixed(2)).join(',')}
        style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000 }}
      />
      {open && url && (
        <WatchPlayer
          key={lessonN}
          lesson={{
            n: lessonN,
            title: 'The Athlete’s Mindset',
            playbackUrl: url,
            storyboardUrl,
          }}
          courseTitle="Championship Tennis"
          instructorName="Carla Marín"
          startSec={Number(params.get('start') ?? 0)}
          comments={COMMENTS}
          onPostComment={() => undefined}
          onLikeComment={() => undefined}
          onClose={() => setOpen(false)}
          onProgress={(f) => setProgressLog((l) => [...l, f])}
          onComplete={() => setProgressLog((l) => [...l, 1])}
          playlist={
            params.get('next') !== '0'
              ? [
                  {
                    id: `l${lessonN}`,
                    n: lessonN,
                    title: 'The Athlete’s Mindset',
                  },
                  {
                    id: `l${lessonN + 1}`,
                    n: lessonN + 1,
                    title: 'Serving Under Pressure',
                  },
                ]
              : undefined
          }
          currentId={params.get('next') !== '0' ? `l${lessonN}` : undefined}
          onSelectLesson={
            params.get('next') !== '0'
              ? () => setLessonN((n) => n + 1)
              : undefined
          }
        />
      )}
    </div>
  )
}
