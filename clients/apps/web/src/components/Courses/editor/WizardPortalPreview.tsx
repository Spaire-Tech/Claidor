'use client'

// WizardPortalPreview — the wizard's final step. The creator sees the page
// the AI generated — GeneratedPortalPage, composed 1:1 from the course-page
// designs — assembled from every choice they made in onboarding:
//
//   • hero variant   (marquee | cover)      → which hero renders up top
//   • card variant   (spotlight | catalog)  → how each lesson tile renders
//   • structure      (modules | episodic)   → module rows vs episode strip
//   • trial          (free_preview N | lesson_sample) → chips / sample screen
//   • theme          (light | dark)         → design's toggle, persisted
//   • pricing        → the hero's buy label
//
// Media renders the designs' liquid-glass placeholders until real media is
// added later in the editor — never the cover photo smeared on every tile.
// Nothing here is decorative: the same fields are persisted on the course at
// Create, and the public page reads them to render this same way.

import type { schemas } from '@spaire/client'
import { useCallback, useEffect, useState } from 'react'
import {
  GeneratedPortalPage,
  type GeneratedGroup,
} from './GeneratedPortalPage'

export type WizardPortalOutline = {
  modules?: Array<
    | {
        title?: string
        description?: string
        lessons?: Array<{
          title?: string
          content_type?: 'text' | 'video'
          description?: string
        } | null> | null
      }
    | null
    | undefined
  >
}

export type WizardPortalDraft = {
  title: string
  /** AI-written hero description (not the creator's raw blob). */
  desc: string
  /** AI-written hero copy — fall back to derived/empty when streaming. */
  eyebrow?: string | null
  badge?: string | null
  byline?: string | null
  titleLines?: string[] | null
  instructorName: string
  instructorBio: string
  instructorSub?: string
  instructorBioParas?: string[]
  portraitCaption?: string
  faq?: { q: string; a: string }[]
  heroVariant: 'marquee' | 'cover'
  cardVariant: 'spotlight' | 'catalog'
  structure: 'modules' | 'episodic'
  trialMode: 'free_preview' | 'lesson_sample'
  freeLessons: number
  paywallEnabled: boolean
  /** e.g. "$89", "Free", "$12 / month" — computed by the wizard. */
  priceLabel: string
  buyLabel: string
  playLabel: string
  freeLine: string
  heroImageUrl: string | null
}

export function WizardPortalPreview({
  organization,
  draft,
  outline,
  onBack,
  onPublish,
  publishing,
}: {
  organization: schemas['Organization']
  draft: WizardPortalDraft
  outline: WizardPortalOutline
  onBack: () => void
  onPublish: () => void
  publishing: boolean
}) {
  const isEpisodic = draft.structure === 'episodic'
  const unit = isEpisodic ? 'episode' : 'lesson'

  // ── theme — the design's toggle; persisted so Create stores the choice. ──
  const [dark, setDark] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem('spaire_theme') === 'dark') setDark(true)
    } catch {
      /* ignore */
    }
  }, [])
  const toggleDark = useCallback(() => {
    setDark((d) => {
      try {
        window.localStorage.setItem('spaire_theme', d ? 'light' : 'dark')
      } catch {
        /* ignore */
      }
      return !d
    })
  }, [])

  // Flatten the outline into render-ready groups. Mirrors finalizeCourse's
  // filter (title-only) so what's previewed is exactly what gets created.
  const isLocked = (flatIdx: number): boolean => {
    if (!draft.paywallEnabled) return false
    if (draft.trialMode === 'lesson_sample') return true
    return flatIdx >= draft.freeLessons
  }

  const groups: GeneratedGroup[] = []
  let flat = 0
  for (const m of outline.modules ?? []) {
    if (!m?.title) continue
    const lessons = (m.lessons ?? [])
      .filter((l): l is { title: string; description?: string } =>
        Boolean(l?.title),
      )
      .map((l) => {
        const flatIdx = flat++
        return {
          title: l.title,
          description: l.description ?? '',
          flatIdx,
          imageUrl: null,
          free: !isLocked(flatIdx),
          locked: isLocked(flatIdx),
        }
      })
    groups.push({ title: m.title, lessons })
  }
  const lessonCount = flat

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Top bar — same shell as the rest of the wizard's final step. */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
          >
            ← Back
          </button>
          <span className="text-[12px] text-gray-500">Portal preview</span>
          <span className="text-[13px] text-gray-400">›</span>
          <span className="truncate text-[13px] font-medium text-gray-900">
            {draft.title || 'Untitled Original'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-gray-400 sm:block">
            This is what buyers and students will see
          </span>
          <button
            type="button"
            disabled={publishing}
            onClick={() => onPublish()}
            className="rounded-md bg-gray-900 px-3.5 py-[7px] text-[12px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? 'Creating…' : 'Create Original'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <GeneratedPortalPage
          brand=""
          title={draft.title || 'Untitled Original'}
          titleLines={draft.titleLines}
          eyebrow={draft.eyebrow || ''}
          badge={
            draft.badge ||
            (draft.structure === 'episodic' ? 'New Series' : 'New Course')
          }
          desc={draft.desc}
          byline={draft.byline || draft.instructorBio || ''}
          instructorName={draft.instructorName || organization.name || ''}
          heroVariant={draft.heroVariant}
          cardVariant={draft.cardVariant}
          structure={draft.structure}
          trialMode={draft.trialMode}
          paywallEnabled={draft.paywallEnabled}
          freeLessons={draft.freeLessons}
          playLabel={draft.playLabel}
          buyLabel={draft.buyLabel}
          freeLine={draft.freeLine}
          coverUrl={draft.heroImageUrl}
          groups={groups}
          lessonCount={lessonCount}
          metaDuration="0 min"
          enrollPriceSub={`${lessonCount} ${unit}${lessonCount === 1 ? '' : 's'} · Lifetime access`}
          unit={unit}
          dark={dark}
          onToggleDark={toggleDark}
          avatarUrl={organization.avatar_url ?? null}
          instructorSub={draft.instructorSub ?? ''}
          instructorBio={draft.instructorBioParas ?? []}
          portraitCaption={draft.portraitCaption ?? ''}
          faq={draft.faq ?? []}
        />
      </div>
    </div>
  )
}

export default WizardPortalPreview
