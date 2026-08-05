'use client'

import {
  GeneratedPortalPage,
  type GeneratedGroup,
} from '@/components/Courses/editor/GeneratedPortalPage'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

// Bare preview of the generated course page with the designs' sample data.
// Query params drive the combination so every axis can be eyeballed:
//   ?hero=marquee|cover  &card=spotlight|catalog
//   &trial=preview|sample  &structure=modules|episodic  &dark=1
const RAW_MODULES: { title: string; lessons: [string, string][] }[] = [
  {
    title: 'Foundations',
    lessons: [
      ['Grip & Setup', 'Where every swing begins. The neutral grip, pressure points, and a setup you can repeat under pressure.'],
      ['Stance & Alignment', 'Aim is a skill. Building a stance that points the body and the clubface at the same target.'],
      ['Ball Position', 'One variable, every club. How ball position changes strike, flight, and why most players get it wrong.'],
      ['Posture & Balance', 'The athletic base. Spine angle, knee flex, and weight that stays centered through the swing.'],
      ['Pre-Shot Routine', 'The same 20 seconds before every shot. Building a routine that quiets the mind.'],
      ['Equipment Essentials', 'What actually matters in the bag. Lofts, lies, and a setup that fits your swing.'],
    ],
  },
  {
    title: 'The Swing',
    lessons: [
      ['The Takeaway', 'The first 18 inches decide the rest. Starting the club back on plane, every time.'],
      ['The Backswing', 'Width, turn, and the top position. Loading power without losing the clubface.'],
      ['Downswing & Impact', 'Sequencing from the ground up. Why impact is a position you arrive at, not one you force.'],
      ['Tempo & Rhythm', 'Smooth is fast. Training a swing that holds together on the first tee and the last hole.'],
      ['Driver Off the Tee', 'Width and launch. Hitting up on the ball and finding more fairways with more speed.'],
      ['Iron Striking', 'Ball first, turf second. Compressing irons and controlling your landing distances.'],
    ],
  },
  {
    title: 'Scoring',
    lessons: [
      ['Chipping & Pitching', 'One technique, many distances. Landing spots, trajectory, and touch around the green.'],
      ['Bunker Play', 'The shot that scares everyone, simplified. Using the bounce and committing through the sand.'],
      ['Reading the Green', 'Slope, grain, and speed. Seeing the line before you ever stand over the ball.'],
      ['Putting Under Pressure', 'A routine that survives nerves. Short putts, long lags, and the discipline of pace.'],
      ['Wedge Distance Control', 'The clock system. Three swings per wedge for a number you can trust inside 100 yards.'],
      ['Course Strategy', 'Playing the percentages. Picking targets that fit your shot, not the one you wish you had.'],
    ],
  },
]

const EPISODES: [string, string][] = [
  ['The Wager', 'Pebble Beach, dawn. Jack bets a stranger he can fix any swing in one round — and explains why he always wins.'],
  ['The Grip Is a Lie', 'Everything you were taught about holding a club, unlearned. Shot in the workshop where Jack rebuilds grips.'],
  ['Eighteen Inches', 'The takeaway, filmed at 1,000 frames a second. The first move that decides every shot.'],
  ['The Lake at Sawgrass', 'Why great players aim at trouble. A walk through the most feared par 3 in golf.'],
  ['Smooth Is Fast', 'Tempo, filmed with orchestra conductors and tour pros side by side.'],
  ['The Short Game Heist', 'Inside 100 yards, where rounds are stolen. Wedges, spin, and nerve.'],
]

function Preview() {
  const params = useSearchParams()
  const heroVariant = params.get('hero') === 'marquee' ? 'marquee' : 'cover'
  const cardVariant = params.get('card') === 'catalog' ? 'catalog' : 'spotlight'
  const trialMode =
    params.get('trial') === 'preview' ? 'free_preview' : 'lesson_sample'
  const structure =
    params.get('structure') === 'episodic' ? 'episodic' : 'modules'
  const [dark, setDark] = useState(params.get('dark') === '1')
  // `?editable=1` exercises the creator affordances (Add cover / Reposition /
  // Add trailer / per-card Add image / sample CTA) with no-op handlers.
  const editable = params.get('editable') === '1'
  const withCover = params.get('cover') === '1'
  // `?fakesample=1` synthesizes a short WebM in-browser (canvas +
  // MediaRecorder) and feeds it to the inline sample player, so the clip
  // window + scroll-pause behavior can be verified without a Mux asset.
  const fakeSample = params.get('fakesample') === '1'
  const [sampleUrl, setSampleUrl] = useState<string | null>(null)
  const [lessonPos, setLessonPos] = useState<Record<number, string>>({})
  // Local stand-in for landing_overrides.hero_title_width / hero_desc_width so
  // the creator-bar Width control is exercisable in this preview.
  // `?tw=40` seeds a desktop title width; `?twm=60` / `?dwm=70` exercise the
  // MOBILE-scoped widths; `?coverpos=` / `?coverposm=` the split cover focal
  // points (e.g. coverpos=50%25%2010%25 for "50% 10%").
  const [heroWidths, setHeroWidths] = useState<{
    title: number | null
    desc: number | null
  }>(() => {
    const tw = params.get('tw')
    return { title: tw ? parseInt(tw, 10) : null, desc: null }
  })
  const twMobile = params.get('twm') ? parseInt(params.get('twm')!, 10) : null
  const dwMobile = params.get('dwm') ? parseInt(params.get('dwm')!, 10) : null
  const coverPos = params.get('coverpos')
  const coverPosMobile = params.get('coverposm')
  // Local stand-in for landing_overrides.hero_title_font so the Title-style
  // picker is exercisable in this preview.
  const [heroTitleFont, setHeroTitleFont] = useState<string | null>(null)
  useEffect(() => {
    if (!fakeSample || sampleUrl) return
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const ctx = canvas.getContext('2d')!
    let hue = 0
    const draw = () => {
      hue = (hue + 4) % 360
      ctx.fillStyle = `hsl(${hue} 70% 50%)`
      ctx.fillRect(0, 0, 320, 180)
    }
    const timer = setInterval(draw, 100)
    draw()
    const stream = canvas.captureStream(10)
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      clearInterval(timer)
      setSampleUrl(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })))
    }
    rec.start()
    setTimeout(() => rec.stop(), 6000)
    return () => clearInterval(timer)
  }, [fakeSample, sampleUrl])

  const freeLessons = 3
  let flat = 0
  const toLesson = ([title, description]: [string, string]) => {
    const flatIdx = flat++
    const locked = trialMode === 'lesson_sample' || flatIdx >= freeLessons
    // Give the first two lessons a still so the editor's Reposition pill +
    // overlay are exercisable; lessonPos holds the live drag result.
    const imageUrl =
      editable && flatIdx < 2 ? '/assets/onboarding/cover-hero.jpg' : undefined
    return {
      title,
      description,
      flatIdx,
      free: !locked,
      locked,
      imageUrl,
      imagePosition: lessonPos[flatIdx],
    }
  }
  const groups: GeneratedGroup[] =
    structure === 'episodic'
      ? [{ title: null, lessons: EPISODES.map(toLesson) }]
      : RAW_MODULES.map((m) => ({
          title: m.title,
          lessons: m.lessons.map(toLesson),
        }))

  return (
    <GeneratedPortalPage
      brand=""
      title={params.get('title') ?? 'The Golfer’s Blueprint'}
      titleLines={
        params.get('title') ? null : ['The Golfer’s', 'Blueprint']
      }
      eyebrow="Documentary Series · Golf"
      badge="New Series"
      desc="A two-time major champion takes you inside the scoring game — the swing, the short game, and the mind that wins the shots that matter. Shot like a film, taught like a private lesson."
      byline="Two-time major champion and former world No. 1."
      instructorName="Jack Reeves"
      heroVariant={heroVariant}
      cardVariant={cardVariant}
      structure={structure}
      trialMode={trialMode}
      paywallEnabled
      freeLessons={freeLessons}
      playLabel={
        trialMode === 'lesson_sample' ? 'Play Sample' : 'Play Episode 1 Free'
      }
      buyLabel="Subscribe — $89"
      freeLine={
        trialMode === 'lesson_sample'
          ? 'Sample clip free · cancel anytime'
          : 'First 3 episodes free · cancel anytime'
      }
      groups={groups}
      lessonCount={flat}
      unit={structure === 'episodic' ? 'episode' : 'lesson'}
      dark={dark}
      onToggleDark={() => setDark((d) => !d)}
      coverUrl={withCover ? '/assets/onboarding/cover-hero.jpg' : undefined}
      coverPosition={coverPos}
      coverPositionMobile={coverPosMobile}
      avatarUrl={withCover ? '/assets/onboarding/cover-hero.jpg' : null}
      instructorSub="Two-time major champion and 14-season PGA Tour veteran. Holds the tour record for most strokes gained around the green over a single season."
      instructorBio={[
        'While many know Jack for the two major Sundays, players on tour knew him for something quieter: nobody got the ball in the hole from 100 yards and in like he did. He built a fourteen-season career not on power, but on an almost unreasonable command of the scoring game — wedges, chips, and the six feet that decide a round.',
        'In this course, Jack teaches the game the way he played it — from the green backward. You\u2019ll learn his setup, his routine, and the on-course decisions that turn good rounds into low ones, side by side, one lesson at a time.',
      ]}
      portraitCaption="Jack Reeves · The Scoring Game"
      faq={[
        { q: 'What\u2019s included when I enroll?', a: 'Every lesson across all three modules, plus the free sample, downloadable practice notes, and lifetime updates whenever new lessons are added. One payment, no subscription.' },
        { q: 'Where can I watch?', a: 'In your web browser on desktop and phone. Your place is kept in sync, so you can start a lesson on one device and pick it up on another.' },
        { q: 'Do I need to be an experienced golfer?', a: 'No. The course starts with grip and setup and builds up to scoring and strategy, so it works at any level.' },
        { q: 'How long do I have access?', a: 'Forever. Once you enroll the course is yours to revisit as often as you like, at your own pace, with no expiry.' },
        { q: 'What if it\u2019s not for me?', a: 'Email within 30 days for a full refund. No forms, no questions.' },
      ]}
      samplePlayable={fakeSample && !!sampleUrl}
      samplePlaybackUrl={sampleUrl}
      trailerUrl={fakeSample ? sampleUrl : undefined}
      sampleStart={2}
      sampleDuration={2}
      playStartsSample={fakeSample && !!sampleUrl}
      editable={editable}
      onAddCover={editable ? () => {} : undefined}
      onAddTrailer={editable ? () => {} : undefined}
      onCoverPosition={
        editable
          ? (pos) => {
              ;(
                window as unknown as { __coverPos?: string }
              ).__coverPos = pos
            }
          : undefined
      }
      heroTitleWidth={heroWidths.title}
      heroDescWidth={heroWidths.desc}
      heroTitleWidthMobile={twMobile}
      heroDescWidthMobile={dwMobile}
      heroTitleFont={heroTitleFont}
      onHeroTitleFont={editable ? setHeroTitleFont : undefined}
      onHeroWidth={
        editable
          ? (which, pct) => setHeroWidths((w) => ({ ...w, [which]: pct }))
          : undefined
      }
      onAddLessonImage={editable ? () => {} : undefined}
      onRepositionLesson={
        editable
          ? (i, pos) => setLessonPos((p) => ({ ...p, [i]: pos }))
          : undefined
      }
      onReplaceLessonImage={editable ? () => {} : undefined}
      onConfigureSample={editable ? () => {} : undefined}
      onEditText={
        editable
          ? (field, value, ctx) => {
              ;(
                window as unknown as { __edits: unknown[] }
              ).__edits = [
                ...(((window as unknown as { __edits?: unknown[] }).__edits) ??
                  []),
                { field, value, ctx },
              ]
            }
          : undefined
      }
    />
  )
}

export default function GeneratedPortalPreviewPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  )
}
