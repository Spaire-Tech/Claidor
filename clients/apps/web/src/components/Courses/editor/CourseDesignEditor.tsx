'use client'

// CourseDesignEditor — the dashboard Customize canvas. Renders the SAME
// GeneratedPortalPage the public sees, in editable mode, and wires the
// design's creator affordances to the existing (S3/Mux-backed) endpoints:
//
//   Add / Change cover   → POST /courses/{id}/thumbnail  (S3)
//   ⤧ Reposition         → drag the cover; debounced PATCH of
//                          thumbnail_object_position
//   Add / Change trailer → POST /courses/{id}/trailer    (S3)
//   hover-trailer peek   → plays muted while hovering, snaps back on
//                          scroll/leave (the original HeroMedia behavior)
//   per-lesson stills    → POST lesson thumbnail (S3)
//   Set up sample        → jumps to the existing sample settings (Outline
//                          tab) until its dedicated sheet lands here
//   theme toggle         → persists landing_overrides.theme_mode
//
// The creator edits the real page, not a parallel mock — what they see is
// what buyers get.

import { AvatarCropModal } from '@/components/Customization/InlineEdit/AvatarCropModal'
import {
  useUploadCourseThumbnail,
  useUploadCourseTrailer,
  useUploadLandingMedia,
  useUploadLessonThumbnail,
  type CourseRead,
} from '@/hooks/queries/courses'
import { useProduct } from '@/hooks/queries/products'
import type { schemas } from '@spaire/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../Toast/use-toast'
import { formatProductPrice, isRecurringProduct } from '../courseLandingPrice'
import {
  GeneratedPortalPage,
  type EditField,
  type GeneratedGroup,
} from './GeneratedPortalPage'
import { SampleSettingsPopover } from './SeriesSampleBlock'
import {
  courseTrailerUploadStore,
  useCourseTrailerUpload,
} from './courseTrailerUploadStore'
import type { LandingEditor, OverridesPatch } from './useLandingEditor'

// Default band badges. Single source so the editor seeds the exact chips the
// renderer shows when no override exists (kept in sync with GeneratedPortalPage).
const DEFAULT_BADGES = [
  'All Levels',
  'Self-paced',
  'Captions',
  'Mobile & Desktop',
]

function pickFile(accept: string, cb: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const f = input.files && input.files[0]
    if (f) cb(f)
  }
  input.click()
}

function formatPrice(product: schemas['Product'] | undefined): {
  priceLabel: string
  recurring: boolean
} {
  // Shared with the public landing so the editor never quotes a different
  // price string than buyers see.
  return {
    priceLabel: formatProductPrice(product) || '—',
    recurring: isRecurringProduct(product),
  }
}

export function CourseDesignEditor({
  course,
  organization,
  editor,
  onBusyChange,
  mode = 'full',
}: {
  course: CourseRead
  organization?: schemas['Organization']
  /** The shared edit pipeline (optimistic writes + undo/redo + save status). */
  editor: LandingEditor
  /** Reports in-flight uploads so the host status bar can show "Saving…". */
  onBusyChange?: (saving: boolean) => void
  /**
   * 'full' — the desktop canvas: every creator affordance.
   * 'reposition' — the phone canvas: renders exactly what a phone visitor
   * sees (the mobile stylesheet applied via GeneratedPortalPage's
   * phoneCanvas class), with direct manipulation kept for the edits that
   * matter at phone size: drag the cover / lesson stills / portrait into
   * place, and drag the hero width containers. No pills, no theme toggle,
   * no touch-to-edit text.
   */
  mode?: 'full' | 'reposition'
}) {
  const repositionOnly = mode === 'reposition'
  const uploadThumb = useUploadCourseThumbnail()
  const uploadTrailer = useUploadCourseTrailer()
  const uploadLessonThumb = useUploadLessonThumbnail()
  const uploadLandingMedia = useUploadLandingMedia()
  const { data: product } = useProduct(course.product_id)
  const { commit, record } = editor

  // Every landing_overrides edit sends only the subtree it changed; the
  // backend deep-merges, so siblings (ai_hero / ai_instructor / ai_faq / …)
  // are never wiped by a stale blob, and each edit carries its own inverse so
  // it can be undone. `null` in `invert` resets a key that didn't exist before.
  const commitOverrides = useCallback(
    (patch: OverridesPatch, invert: OverridesPatch, label: string) => {
      commit({
        apply: { kind: 'overrides', patch },
        invert: { kind: 'overrides', patch: invert },
        label,
      })
    },
    [commit],
  )

  const isEpisodic = course.format === 'series'
  const unit = isEpisodic ? 'episode' : 'lesson'
  const unitCap = isEpisodic ? 'Episode' : 'Lesson'
  const trialMode = course.trial_mode ?? 'free_preview'

  // ── theme (persisted on the course; the query cache is the single source of
  //    truth, so the toggle can't drift from the server like the old local
  //    useState did) ──────────────────────────────────────────────────────
  const dark = course.landing_overrides?.theme_mode === 'dark'
  const toggleDark = useCallback(() => {
    const prev = course.landing_overrides?.theme_mode ?? null
    commitOverrides(
      { theme_mode: dark ? 'light' : 'dark' },
      { theme_mode: prev },
      'Toggle theme',
    )
  }, [commitOverrides, dark, course.landing_overrides?.theme_mode])

  // ── cover ─────────────────────────────────────────────────────────────────
  const [coverBusy, setCoverBusy] = useState(false)
  const onAddCover = useCallback(() => {
    pickFile('image/*', async (file) => {
      setCoverBusy(true)
      const prevUrl = course.thumbnail_url ?? null
      try {
        const updated = await uploadThumb.mutateAsync({
          courseId: course.id,
          file,
        })
        // The upload endpoint already persisted the new cover; record it so
        // it can be undone back to the previous one (the old S3 object stays).
        record({
          apply: {
            kind: 'course',
            body: { thumbnail_url: updated.thumbnail_url },
          },
          invert: { kind: 'course', body: { thumbnail_url: prevUrl } },
          label: 'Change cover',
        })
        toast({ title: 'Cover updated' })
      } catch {
        toast({ title: 'Upload failed', description: 'Please try again.' })
      } finally {
        setCoverBusy(false)
      }
    })
  }, [course.id, course.thumbnail_url, uploadThumb, record])

  // ── reposition (debounced commit; one undo step per drag gesture). The
  //    phone canvas writes the MOBILE-scoped override key instead of the
  //    course field, so a phone reposition never moves the desktop cover. ──
  const repositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCoverPosition = useCallback(
    (pos: string) => {
      if (repositionTimer.current) clearTimeout(repositionTimer.current)
      // Capture the pre-gesture value now (the cache isn't optimistically
      // moved during the drag — livePos handles the live preview), so undo
      // restores where the cover started.
      if (repositionOnly) {
        const prev = course.landing_overrides?.hero_cover_pos_m ?? null
        repositionTimer.current = setTimeout(() => {
          if (pos === prev) return
          commitOverrides(
            { hero_cover_pos_m: pos },
            { hero_cover_pos_m: prev },
            'Reposition cover (phone)',
          )
        }, 600)
        return
      }
      const prev = course.thumbnail_object_position ?? null
      repositionTimer.current = setTimeout(() => {
        if (pos === prev) return
        commit({
          apply: { kind: 'course', body: { thumbnail_object_position: pos } },
          invert: {
            kind: 'course',
            body: { thumbnail_object_position: prev },
          },
          label: 'Reposition cover',
        })
      }, 600)
    },
    [
      course.thumbnail_object_position,
      course.landing_overrides?.hero_cover_pos_m,
      repositionOnly,
      commit,
      commitOverrides,
    ],
  )

  // ── hero container widths (debounced commit; one undo step per adjust,
  //    mirrors onCoverPosition). `null` resets a knob to the design default —
  //    the overrides merge deletes the key on null. ──────────────────────────
  const heroWidthTimers = useRef<{
    title?: ReturnType<typeof setTimeout>
    desc?: ReturnType<typeof setTimeout>
  }>({})
  const onHeroWidth = useCallback(
    (which: 'title' | 'desc', pct: number | null) => {
      // The phone canvas adjusts the MOBILE width keys only — a phone width
      // never re-wraps the desktop hero and vice-versa.
      const key =
        which === 'title'
          ? repositionOnly
            ? 'hero_title_width_m'
            : 'hero_title_width'
          : repositionOnly
            ? 'hero_desc_width_m'
            : 'hero_desc_width'
      const timers = heroWidthTimers.current
      if (timers[which]) clearTimeout(timers[which])
      const prev = course.landing_overrides?.[key] ?? null
      timers[which] = setTimeout(() => {
        if (pct === prev) return
        commitOverrides(
          { [key]: pct },
          { [key]: prev },
          which === 'title'
            ? 'Adjust title width'
            : 'Adjust description width',
        )
      }, 600)
    },
    [course.landing_overrides, commitOverrides, repositionOnly],
  )

  // ── title style (Spaire Title Styles — the "movie title" typeface for the
  //    hero headline). One overrides commit per pick; `null` = Classic. ──────
  const onHeroTitleFont = useCallback(
    (key: string | null) => {
      const prev = course.landing_overrides?.hero_title_font ?? null
      if (key === prev) return
      commitOverrides(
        { hero_title_font: key },
        { hero_title_font: prev },
        'Change title style',
      )
    },
    [course.landing_overrides?.hero_title_font, commitOverrides],
  )

  // ── trailer ───────────────────────────────────────────────────────────────
  // The in-flight trailer upload lives in a module-level store keyed by
  // course id, NOT component state — the customize editor unmounts when you
  // switch tabs but the upload's XHR keeps running, so keeping progress in
  // the store means coming back shows the same live percentage. A trailer
  // can be up to 500 MB, so a bare "Uploading…" (or nothing, after a tab
  // switch) left the creator with no idea whether it was working or stuck.
  const trailerUpload = useCourseTrailerUpload(course.id)
  const trailerBusy = trailerUpload != null
  const trailerPct = trailerUpload?.pct ?? null
  const onAddTrailer = useCallback(() => {
    pickFile('video/*', async (file) => {
      const courseId = course.id
      const prevUrl = course.trailer_url ?? null
      // Register in the store before any await so the bar shows instantly
      // and survives navigating away and back; the token lets this attempt
      // detect if a newer upload (a re-pick) has superseded it.
      const token = courseTrailerUploadStore.begin(courseId)
      try {
        const updated = await uploadTrailer.mutateAsync({
          courseId,
          file,
          onProgress: (pct) =>
            courseTrailerUploadStore.progress(courseId, token, pct),
        })
        if (courseTrailerUploadStore.isCurrent(courseId, token)) {
          record({
            apply: {
              kind: 'course',
              body: { trailer_url: updated.trailer_url },
            },
            invert: { kind: 'course', body: { trailer_url: prevUrl } },
            label: 'Change trailer',
          })
          toast({ title: 'Trailer updated' })
        }
      } catch {
        if (courseTrailerUploadStore.isCurrent(courseId, token))
          toast({ title: 'Upload failed', description: 'Please try again.' })
      } finally {
        courseTrailerUploadStore.clear(courseId, token)
      }
    })
  }, [course.id, course.trailer_url, uploadTrailer, record])

  // ── lessons → render groups; per-lesson stills ────────────────────────────
  const flatLessons = useMemo(
    () =>
      [...course.modules]
        .sort((a, b) => a.position - b.position)
        .flatMap((m) => [...m.lessons].sort((a, b) => a.position - b.position)),
    [course.modules],
  )

  const paywallEnabled = course.paywall_enabled
  const freeCount =
    trialMode === 'free_preview' ? Math.max(0, course.paywall_position ?? 0) : 0
  const isLocked = (flatIdx: number) => {
    if (!paywallEnabled) return false
    if (trialMode === 'lesson_sample') return true
    return flatIdx >= freeCount
  }

  const fmtDur = (secs: number | null) =>
    secs ? `${Math.max(1, Math.round(secs / 60))}m` : null
  const totalSecs = flatLessons.reduce(
    (a, l) => a + (l.duration_seconds ?? 0),
    0,
  )
  const metaDuration =
    totalSecs <= 0
      ? '0 min'
      : totalSecs >= 3600
        ? `${Math.floor(totalSecs / 3600)}h ${Math.round((totalSecs % 3600) / 60)}m`
        : `${Math.round(totalSecs / 60)} min`

  const lessonPosMobile = course.landing_overrides?.lesson_pos_m ?? undefined
  const groups: GeneratedGroup[] = useMemo(() => {
    let flat = 0
    // On the phone canvas each still shows (and edits) its MOBILE focal
    // point, inheriting the desktop one until a phone-specific drag lands.
    const posFor = (l: (typeof flatLessons)[number]) =>
      repositionOnly
        ? (lessonPosMobile?.[l.id] ?? l.thumbnail_object_position ?? null)
        : (l.thumbnail_object_position ?? null)
    if (isEpisodic) {
      return [
        {
          title: null,
          lessons: flatLessons.map((l) => {
            const flatIdx = flat++
            return {
              title: l.title,
              description: l.description ?? '',
              flatIdx,
              imageUrl: l.thumbnail_url ?? null,
              imagePosition: posFor(l),
              durationLabel: fmtDur(l.duration_seconds),
              free: !isLocked(flatIdx),
              locked: isLocked(flatIdx),
            }
          }),
        },
      ]
    }
    return [...course.modules]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        title: m.title,
        lessons: [...m.lessons]
          .sort((a, b) => a.position - b.position)
          .map((l) => {
            const flatIdx = flat++
            return {
              title: l.title,
              description: l.description ?? '',
              flatIdx,
              imageUrl: l.thumbnail_url ?? null,
              imagePosition: posFor(l),
              durationLabel: fmtDur(l.duration_seconds),
              free: !isLocked(flatIdx),
              locked: isLocked(flatIdx),
            }
          }),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    course.modules,
    isEpisodic,
    paywallEnabled,
    trialMode,
    freeCount,
    repositionOnly,
    lessonPosMobile,
  ])

  const [lessonImageBusy, setLessonImageBusy] = useState<number | null>(null)
  const uploadLessonImage = useCallback(
    async (
      lesson: CourseRead['modules'][number]['lessons'][number],
      file: File,
    ) => {
      const prevUrl = lesson.thumbnail_url ?? null
      const updated = await uploadLessonThumb.mutateAsync({
        lessonId: lesson.id,
        file,
      })
      record({
        apply: {
          kind: 'lesson',
          lessonId: lesson.id,
          body: { thumbnail_url: updated.thumbnail_url },
        },
        invert: {
          kind: 'lesson',
          lessonId: lesson.id,
          body: { thumbnail_url: prevUrl },
        },
        label: `Change ${unit} image`,
      })
    },
    [uploadLessonThumb, record, unit],
  )

  const onAddLessonImage = useCallback(
    (flatIdx: number) => {
      const lesson = flatLessons[flatIdx]
      if (!lesson) return
      pickFile('image/*', async (file) => {
        setLessonImageBusy(flatIdx)
        try {
          await uploadLessonImage(lesson, file)
          toast({ title: `${unitCap} image updated` })
        } catch {
          toast({ title: 'Upload failed', description: 'Please try again.' })
        } finally {
          setLessonImageBusy(null)
        }
      })
    },
    [flatLessons, uploadLessonImage, unitCap],
  )

  // Per-lesson still reposition — debounced commit; one undo step per drag.
  // On the phone canvas the focal point lands in the mobile-only map
  // (landing_overrides.lesson_pos_m) so desktop stills never move.
  const lessonReposTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onRepositionLesson = useCallback(
    (flatIdx: number, pos: string) => {
      const lesson = flatLessons[flatIdx]
      if (!lesson) return
      if (lessonReposTimer.current) clearTimeout(lessonReposTimer.current)
      if (repositionOnly) {
        const prev = course.landing_overrides?.lesson_pos_m?.[lesson.id] ?? null
        lessonReposTimer.current = setTimeout(() => {
          if (pos === prev) return
          commitOverrides(
            { lesson_pos_m: { [lesson.id]: pos } },
            { lesson_pos_m: { [lesson.id]: prev } },
            `Reposition ${unit} image (phone)`,
          )
        }, 600)
        return
      }
      const prev = lesson.thumbnail_object_position ?? null
      lessonReposTimer.current = setTimeout(() => {
        if (pos === prev) return
        commit({
          apply: {
            kind: 'lesson',
            lessonId: lesson.id,
            body: { thumbnail_object_position: pos },
          },
          invert: {
            kind: 'lesson',
            lessonId: lesson.id,
            body: { thumbnail_object_position: prev },
          },
          label: `Reposition ${unit} image`,
        })
      }, 600)
    },
    [
      flatLessons,
      course.landing_overrides?.lesson_pos_m,
      repositionOnly,
      commit,
      commitOverrides,
      unit,
    ],
  )

  // Replace a still from inside the reposition overlay (it hands back a File).
  const onReplaceLessonImage = useCallback(
    async (flatIdx: number, file: File) => {
      const lesson = flatLessons[flatIdx]
      if (!lesson) return
      setLessonImageBusy(flatIdx)
      try {
        await uploadLessonImage(lesson, file)
        toast({ title: `${unitCap} image updated` })
      } catch {
        toast({ title: 'Upload failed', description: 'Please try again.' })
      } finally {
        setLessonImageBusy(null)
      }
    },
    [flatLessons, uploadLessonImage, unitCap],
  )

  // ── modules, in render order — for moduleTitle edits by groupIdx ──────────
  const sortedModules = useMemo(
    () => [...course.modules].sort((a, b) => a.position - b.position),
    [course.modules],
  )

  // ── touch-to-edit text → persist to the right field ──────────────────────
  const aiHero = course.landing_overrides?.ai_hero ?? null
  const aiInstructor = course.landing_overrides?.ai_instructor ?? null
  // Stable refs so the edit callbacks below don't rebuild every render (the
  // `?? []` / `?? DEFAULT_BADGES` fallbacks would otherwise be fresh each time).
  const aiFaq = useMemo(
    () => course.landing_overrides?.ai_faq ?? [],
    [course.landing_overrides?.ai_faq],
  )
  const badgeList = useMemo(
    () => course.landing_overrides?.badges ?? DEFAULT_BADGES,
    [course.landing_overrides?.badges],
  )

  // ── instructor portrait (its own media slot, S3-backed) ──────────────────
  const [portraitBusy, setPortraitBusy] = useState(false)
  const onAddPortrait = useCallback(() => {
    pickFile('image/*', async (file) => {
      setPortraitBusy(true)
      const prev = course.landing_overrides?.portrait_url ?? null
      try {
        const { url } = await uploadLandingMedia.mutateAsync({
          courseId: course.id,
          file,
        })
        commitOverrides(
          { portrait_url: url },
          { portrait_url: prev },
          'Change portrait',
        )
        toast({ title: 'Portrait updated' })
      } catch {
        toast({ title: 'Upload failed', description: 'Please try again.' })
      } finally {
        setPortraitBusy(false)
      }
    })
  }, [
    course.id,
    course.landing_overrides?.portrait_url,
    uploadLandingMedia,
    commitOverrides,
  ])

  // ── portrait reposition (debounced commit; one undo step per drag gesture,
  //    mirrors onCoverPosition) ───────────────────────────────────────────────
  const portraitReposTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPortraitPosition = useCallback(
    (pos: string) => {
      if (portraitReposTimer.current) clearTimeout(portraitReposTimer.current)
      // Phone canvas → mobile-only key (see onCoverPosition).
      const key = repositionOnly ? 'portrait_pos_m' : 'portrait_object_position'
      const prev = course.landing_overrides?.[key] ?? null
      portraitReposTimer.current = setTimeout(() => {
        if (pos === prev) return
        commitOverrides(
          { [key]: pos },
          { [key]: prev },
          repositionOnly ? 'Reposition portrait (phone)' : 'Reposition portrait',
        )
      }, 600)
    },
    [course.landing_overrides, repositionOnly, commitOverrides],
  )

  // ── instructor avatar (round) — reuses the Space avatar crop editor
  //    (zoom + reposition) and the course-scoped landing media upload, so a
  //    per-course avatar can be set without touching the global org avatar.
  //    Falls back to the org avatar when none is set. ─────────────────────────
  const [avatarEditFile, setAvatarEditFile] = useState<File | null>(null)
  const pickAvatar = useCallback(() => {
    pickFile('image/*', (file) => setAvatarEditFile(file))
  }, [])
  const onAvatarCropSave = useCallback(
    async (blob: Blob) => {
      const file = new File([blob], 'instructor-avatar.jpg', {
        type: 'image/jpeg',
      })
      const prev = course.landing_overrides?.instructor_avatar_url ?? null
      try {
        const { url } = await uploadLandingMedia.mutateAsync({
          courseId: course.id,
          file,
        })
        commitOverrides(
          { instructor_avatar_url: url },
          { instructor_avatar_url: prev },
          'Change instructor photo',
        )
        toast({ title: 'Instructor photo updated' })
      } catch {
        toast({ title: 'Upload failed', description: 'Please try again.' })
      } finally {
        setAvatarEditFile(null)
      }
    },
    [
      course.id,
      course.landing_overrides?.instructor_avatar_url,
      uploadLandingMedia,
      commitOverrides,
    ],
  )
  const onAvatarDelete = useCallback(() => {
    const prev = course.landing_overrides?.instructor_avatar_url ?? null
    if (prev) {
      commitOverrides(
        { instructor_avatar_url: null },
        { instructor_avatar_url: prev },
        'Remove instructor photo',
      )
    }
    setAvatarEditFile(null)
  }, [course.landing_overrides?.instructor_avatar_url, commitOverrides])

  const onEditText = useCallback(
    (
      field: EditField,
      value: string,
      ctx?: { flatIdx?: number; groupIdx?: number; idx?: number },
    ) => {
      const ov = course.landing_overrides ?? {}
      switch (field) {
        case 'title':
          commit({
            apply: { kind: 'course', body: { title: value } },
            invert: { kind: 'course', body: { title: course.title ?? null } },
            label: 'Edit title',
          })
          break
        case 'heroTitle': {
          // The cover hero shows ai_hero.titleLines (the multi-line headline),
          // so editing the hero must write THAT — not the flat course.title —
          // or the change wouldn't show on the public page. One line per row;
          // empty clears it back to the course title fallback.
          const lines = value
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
          const prev =
            (ov.ai_hero as { titleLines?: string[] | null } | undefined)
              ?.titleLines ?? null
          commitOverrides(
            { ai_hero: { titleLines: lines.length > 0 ? lines : null } },
            { ai_hero: { titleLines: prev } },
            'Edit headline',
          )
          break
        }
        case 'instructorName':
          commit({
            apply: { kind: 'course', body: { instructor_name: value } },
            invert: {
              kind: 'course',
              body: { instructor_name: course.instructor_name ?? null },
            },
            label: 'Edit instructor name',
          })
          break
        case 'freeLine': {
          // The price note under the hero CTAs. Clearing it falls back to
          // the computed default (pricing-derived).
          const prev =
            (ov.ai_hero as { free_line?: string | null } | undefined)
              ?.free_line ?? null
          commitOverrides(
            { ai_hero: { free_line: value.trim() ? value : null } },
            { ai_hero: { free_line: prev } },
            'Edit price note',
          )
          break
        }
        case 'desc':
        case 'byline':
        case 'eyebrow':
        case 'badge': {
          const key =
            field === 'desc'
              ? 'description'
              : (field as 'byline' | 'eyebrow' | 'badge')
          const prev =
            (ov.ai_hero as Record<string, unknown> | undefined)?.[key] ?? null
          commitOverrides(
            { ai_hero: { [key]: value } },
            { ai_hero: { [key]: prev } },
            'Edit hero copy',
          )
          break
        }
        case 'lessonTitle':
        case 'lessonDesc': {
          const lesson =
            ctx?.flatIdx != null ? flatLessons[ctx.flatIdx] : undefined
          if (!lesson) break
          if (field === 'lessonTitle') {
            commit({
              apply: {
                kind: 'lesson',
                lessonId: lesson.id,
                body: { title: value },
              },
              invert: {
                kind: 'lesson',
                lessonId: lesson.id,
                body: { title: lesson.title },
              },
              label: `Edit ${unit} title`,
            })
          } else {
            commit({
              apply: {
                kind: 'lesson',
                lessonId: lesson.id,
                body: { description: value },
              },
              invert: {
                kind: 'lesson',
                lessonId: lesson.id,
                body: { description: lesson.description ?? null },
              },
              label: `Edit ${unit} description`,
            })
          }
          break
        }
        case 'moduleTitle': {
          const mod =
            ctx?.groupIdx != null ? sortedModules[ctx.groupIdx] : undefined
          if (!mod) break
          commit({
            apply: { kind: 'module', moduleId: mod.id, body: { title: value } },
            invert: {
              kind: 'module',
              moduleId: mod.id,
              body: { title: mod.title },
            },
            label: 'Edit module title',
          })
          break
        }
        case 'instructorSub': {
          const prev = aiInstructor?.sub ?? null
          commitOverrides(
            { ai_instructor: { sub: value } },
            { ai_instructor: { sub: prev } },
            'Edit instructor copy',
          )
          break
        }
        case 'instructorBioP': {
          if (ctx?.idx == null) break
          const i = ctx.idx
          const prevBio = aiInstructor?.bio ?? []
          const nextBio = [...prevBio]
          nextBio[i] = value
          commitOverrides(
            { ai_instructor: { bio: nextBio } },
            { ai_instructor: { bio: prevBio } },
            'Edit instructor bio',
          )
          break
        }
        case 'portraitCaption': {
          const prev = aiInstructor?.caption ?? null
          commitOverrides(
            { ai_instructor: { caption: value } },
            { ai_instructor: { caption: prev } },
            'Edit portrait caption',
          )
          break
        }
        case 'bdg': {
          if (ctx?.idx == null) break
          const i = ctx.idx
          const nextBadges = [...badgeList]
          nextBadges[i] = value
          commitOverrides(
            { badges: nextBadges },
            { badges: badgeList },
            'Edit badge',
          )
          break
        }
        case 'faqQ':
        case 'faqA': {
          if (ctx?.idx == null) break
          const i = ctx.idx
          const key = field === 'faqQ' ? 'q' : 'a'
          const nextFaq = aiFaq.map((f, j) =>
            j === i ? { ...f, [key]: value } : f,
          )
          commitOverrides({ ai_faq: nextFaq }, { ai_faq: aiFaq }, 'Edit FAQ')
          break
        }
      }
    },
    [
      course.landing_overrides,
      course.title,
      course.instructor_name,
      flatLessons,
      sortedModules,
      aiInstructor,
      aiFaq,
      badgeList,
      unit,
      commit,
      commitOverrides,
    ],
  )

  // ── add / remove for the fixed-count lists (FAQ, badges, bio paragraphs).
  //    Each is one overrides edit (whole array replaces) with its inverse, so
  //    adding/removing is a single undo step. ────────────────────────────────
  const onAddFaq = useCallback(() => {
    const next = [...aiFaq, { q: '', a: '' }]
    commitOverrides({ ai_faq: next }, { ai_faq: aiFaq }, 'Add FAQ')
  }, [aiFaq, commitOverrides])
  const onRemoveFaq = useCallback(
    (idx: number) => {
      const next = aiFaq.filter((_, j) => j !== idx)
      commitOverrides({ ai_faq: next }, { ai_faq: aiFaq }, 'Remove FAQ')
    },
    [aiFaq, commitOverrides],
  )
  const onAddBadge = useCallback(() => {
    const next = [...badgeList, 'New badge']
    commitOverrides({ badges: next }, { badges: badgeList }, 'Add badge')
  }, [badgeList, commitOverrides])
  const onRemoveBadge = useCallback(
    (idx: number) => {
      const next = badgeList.filter((_, j) => j !== idx)
      commitOverrides({ badges: next }, { badges: badgeList }, 'Remove badge')
    },
    [badgeList, commitOverrides],
  )
  const onAddBioParagraph = useCallback(() => {
    const prevBio = aiInstructor?.bio ?? []
    const next = [...prevBio, '']
    commitOverrides(
      { ai_instructor: { bio: next } },
      { ai_instructor: { bio: prevBio } },
      'Add bio paragraph',
    )
  }, [aiInstructor, commitOverrides])
  const onRemoveBioParagraph = useCallback(
    (idx: number) => {
      const prevBio = aiInstructor?.bio ?? []
      const next = prevBio.filter((_, j) => j !== idx)
      commitOverrides(
        { ai_instructor: { bio: next } },
        { ai_instructor: { bio: prevBio } },
        'Remove bio paragraph',
      )
    },
    [aiInstructor, commitOverrides],
  )

  // ── section visibility (landing_overrides.visible). Hiding a body section
  //    drops it from the public page and moves it to the editor's hidden bar;
  //    one undo step, reversible. ────────────────────────────────────────────
  const onSetSectionHidden = useCallback(
    (id: string, hidden: boolean) => {
      const prev = course.landing_overrides?.visible?.[id] ?? null
      commitOverrides(
        { visible: { [id]: !hidden } },
        { visible: { [id]: prev } },
        hidden ? 'Hide section' : 'Show section',
      )
    },
    [course.landing_overrides?.visible, commitOverrides],
  )

  // ── hero copy (the AI-written hero, falling back to course fields) ────────
  const [sampleOpen, setSampleOpen] = useState(false)
  const { priceLabel, recurring } = formatPrice(product)
  // Free is a property of the PRODUCT price, not the paywall toggle —
  // matching PublicPortalView, so the editor preview never promises
  // "Enroll Free" for a course checkout will charge for.
  const isFreeProduct = formatProductPrice(product) === 'Free'
  const cadence = recurring ? 'cancel anytime' : 'one-time purchase'
  const enrollPriceSub = isFreeProduct
    ? `${flatLessons.length} ${unit}${flatLessons.length === 1 ? '' : 's'} · Free`
    : recurring
      ? `Subscription · ${flatLessons.length} ${unit}${flatLessons.length === 1 ? '' : 's'} · cancel anytime`
      : `One-time purchase · ${flatLessons.length} ${unit}${flatLessons.length === 1 ? '' : 's'} · Lifetime access`
  const buyLabel = isFreeProduct
    ? 'Enroll Free'
    : recurring
      ? `Subscribe — ${priceLabel}`
      : `Buy — ${priceLabel}`
  const playLabel =
    isFreeProduct || !paywallEnabled
      ? 'Start Watching'
      : trialMode === 'lesson_sample'
        ? 'Play Sample'
        : freeCount > 0
          ? `Play ${unitCap} 1 Free`
          : 'Watch Preview'
  const freeLineDefault = isFreeProduct
    ? 'Free for everyone'
    : !paywallEnabled
      ? `All ${unit}s free to watch · ${cadence}`
      : trialMode === 'lesson_sample'
        ? `Sample clip free · ${cadence}`
        : freeCount > 0
          ? `${freeCount} ${unit}${freeCount === 1 ? '' : 's'} free · ${cadence}`
          : cadence
  // Creator-edited price note wins over the computed default.
  const freeLine =
    (aiHero as { free_line?: string | null } | null | undefined)?.free_line ||
    freeLineDefault

  const sample = course.sample
  const sampleLesson = sample?.lesson_id
    ? flatLessons.find((l) => l.id === sample.lesson_id)
    : null
  const samplePlayable = Boolean(
    sample?.enabled && sampleLesson?.mux_playback_id,
  )

  // Report in-flight uploads to the host bar (text/position/override saves
  // report their own status through the editor pipeline).
  const busy =
    uploadThumb.isPending ||
    uploadTrailer.isPending ||
    uploadLessonThumb.isPending ||
    uploadLandingMedia.isPending ||
    coverBusy ||
    trailerBusy ||
    portraitBusy ||
    lessonImageBusy != null
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  return (
    <>
      <GeneratedPortalPage
        brand=""
        title={course.title ?? 'Untitled Original'}
        titleLines={aiHero?.titleLines ?? null}
        eyebrow={aiHero?.eyebrow || ''}
        badge={aiHero?.badge || (isEpisodic ? 'New Series' : 'New Course')}
        desc={aiHero?.description || course.description || ''}
        byline={aiHero?.byline || course.instructor_bio || ''}
        instructorName={course.instructor_name ?? ''}
        heroVariant={course.hero_variant ?? 'cover'}
        cardVariant={course.lesson_card_variant ?? 'catalog'}
        structure={isEpisodic ? 'episodic' : 'modules'}
        trialMode={trialMode}
        paywallEnabled={paywallEnabled}
        freeLessons={freeCount}
        playLabel={playLabel}
        buyLabel={buyLabel}
        freeLine={freeLine}
        coverUrl={course.thumbnail_url}
        // The phone canvas shows (and edits) the mobile focal point,
        // inheriting the desktop one until a phone-specific drag lands.
        coverPosition={
          repositionOnly
            ? (course.landing_overrides?.hero_cover_pos_m ??
              course.thumbnail_object_position)
            : course.thumbnail_object_position
        }
        sampleImageUrl={sampleLesson?.thumbnail_url ?? null}
        samplePlayable={samplePlayable}
        samplePlaybackId={sampleLesson?.mux_playback_id ?? null}
        samplePlaybackUrl={
          (sampleLesson as { mux_playback_url?: string | null } | null)
            ?.mux_playback_url ?? null
        }
        sampleStart={sample?.start_seconds ?? 0}
        sampleDuration={sample?.duration_seconds ?? 0}
        // Preview the public, not-yet-enrolled state: when a clip sample is the
        // trial, the hero leads with the trailer and the sample takes the
        // secondary slot — the same swap the live landing does. Without this the
        // editor never showed that arrangement.
        playStartsSample={trialMode === 'lesson_sample' && samplePlayable}
        groups={groups}
        lessonCount={flatLessons.length}
        metaDuration={metaDuration}
        enrollPriceSub={enrollPriceSub}
        unit={unit}
        dark={dark}
        onToggleDark={repositionOnly ? undefined : toggleDark}
        editable
        phoneCanvas={repositionOnly}
        // Mirror the public page's trailer-button rule on the phone canvas
        // (the full editor keeps the default so the "Add trailer" slot shows).
        showTrailerButton={
          repositionOnly
            ? !!course.trailer_url ||
              (trialMode === 'lesson_sample' && samplePlayable)
            : undefined
        }
        trailerUrl={course.trailer_url}
        onAddCover={repositionOnly ? undefined : onAddCover}
        coverBusy={coverBusy}
        onAddTrailer={repositionOnly ? undefined : onAddTrailer}
        trailerBusy={trailerBusy}
        trailerPct={trailerPct}
        onCoverPosition={onCoverPosition}
        // Widths are per-surface: the phone canvas reads/writes the mobile
        // keys (default = the mobile design, full-width centered), desktop
        // the desktop keys.
        heroTitleWidth={
          repositionOnly
            ? (course.landing_overrides?.hero_title_width_m ?? null)
            : (course.landing_overrides?.hero_title_width ?? null)
        }
        heroDescWidth={
          repositionOnly
            ? (course.landing_overrides?.hero_desc_width_m ?? null)
            : (course.landing_overrides?.hero_desc_width ?? null)
        }
        onHeroWidth={onHeroWidth}
        heroTitleFont={course.landing_overrides?.hero_title_font ?? null}
        onHeroTitleFont={repositionOnly ? undefined : onHeroTitleFont}
        onAddLessonImage={repositionOnly ? undefined : onAddLessonImage}
        onRepositionLesson={onRepositionLesson}
        onReplaceLessonImage={onReplaceLessonImage}
        lessonImageBusy={lessonImageBusy}
        onConfigureSample={
          repositionOnly ? undefined : () => setSampleOpen(true)
        }
        onEditText={repositionOnly ? undefined : onEditText}
        onAddFaq={repositionOnly ? undefined : onAddFaq}
        onRemoveFaq={repositionOnly ? undefined : onRemoveFaq}
        onAddBadge={repositionOnly ? undefined : onAddBadge}
        onRemoveBadge={repositionOnly ? undefined : onRemoveBadge}
        onAddBioParagraph={repositionOnly ? undefined : onAddBioParagraph}
        onRemoveBioParagraph={
          repositionOnly ? undefined : onRemoveBioParagraph
        }
        sectionVisible={course.landing_overrides?.visible}
        onSetSectionHidden={repositionOnly ? undefined : onSetSectionHidden}
        avatarUrl={
          course.landing_overrides?.instructor_avatar_url ??
          organization?.avatar_url ??
          null
        }
        onEditAvatar={repositionOnly ? undefined : pickAvatar}
        instructorSub={aiInstructor?.sub ?? ''}
        instructorBio={aiInstructor?.bio ?? []}
        portraitUrl={course.landing_overrides?.portrait_url ?? null}
        portraitPosition={
          repositionOnly
            ? (course.landing_overrides?.portrait_pos_m ??
              course.landing_overrides?.portrait_object_position ??
              null)
            : (course.landing_overrides?.portrait_object_position ?? null)
        }
        portraitCaption={aiInstructor?.caption ?? ''}
        onAddPortrait={repositionOnly ? undefined : onAddPortrait}
        onPortraitPosition={onPortraitPosition}
        portraitBusy={portraitBusy}
        faq={aiFaq}
        badges={course.landing_overrides?.badges ?? undefined}
      />
      {/* Sample picker — the sheet with the live video scrub preview (episode
          picker + inline clip player + start/duration sliders). It saves
          course.sample itself via useUpdateCourse. */}
      <SampleSettingsPopover
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        course={course}
        initial={course.sample ?? null}
        unit={isEpisodic ? 'episode' : 'lesson'}
      />
      {/* Instructor avatar crop editor — zoom + reposition, ported from the
          Space avatar editor. Saves a course-scoped avatar (landing media). */}
      {avatarEditFile && (
        <AvatarCropModal
          src={avatarEditFile}
          variant="builder"
          onSave={onAvatarCropSave}
          onCancel={() => setAvatarEditFile(null)}
          onReplace={pickAvatar}
          onDelete={
            course.landing_overrides?.instructor_avatar_url
              ? onAvatarDelete
              : undefined
          }
        />
      )}
    </>
  )
}

// Minimal sample configuration — pick the source lesson and the clip window.
// Persists to course.sample; the backend embeds the Mux playback id on the
// public payload once the lesson's asset is ready.
export function SampleSettingsModal({
  course,
  lessons,
  onClose,
  onSave,
}: {
  course: CourseRead
  lessons: CourseRead['modules'][number]['lessons']
  onClose: () => void
  onSave: (next: {
    enabled: boolean
    lesson_id: string
    start_seconds: number
    duration_seconds: number
  }) => void
}) {
  const existing = course.sample
  const videoLessons = lessons.filter((l) => l.content_type === 'video')
  const [lessonId, setLessonId] = useState(
    existing?.lesson_id ?? videoLessons[0]?.id ?? '',
  )
  const [startStr, setStartStr] = useState(String(existing?.start_seconds ?? 0))
  const [durStr, setDurStr] = useState(
    String(existing?.duration_seconds ?? 120),
  )
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)

  const selected = lessons.find((l) => l.id === lessonId)
  const ready = (selected?.mux_status ?? '').toLowerCase() === 'ready'

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(20,20,22,0.34)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          background: '#fff',
          borderRadius: 20,
          padding: '24px 24px 20px',
          boxShadow: '0 40px 100px -28px rgba(0,0,0,0.5)',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
          color: '#1d1d1f',
        }}
      >
        <h2 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>
          Free sample
        </h2>
        <p style={{ fontSize: 13.5, color: '#86868b', margin: '6px 0 18px' }}>
          Pick a video lesson and the clip window prospects can watch for free.
        </p>

        <label style={labelStyle}>Source lesson</label>
        <select
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          style={inputStyle}
        >
          {videoLessons.length === 0 && (
            <option value="">No video lessons yet</option>
          )}
          {videoLessons.map((l, i) => (
            <option key={l.id} value={l.id}>
              {i + 1}. {l.title}
            </option>
          ))}
        </select>
        {lessonId && !ready && (
          <p style={{ fontSize: 12, color: '#c2410c', marginTop: 6 }}>
            This lesson's video isn't processed yet — the sample will start
            playing once it's ready.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start (seconds)</label>
            <input
              type="number"
              min={0}
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Length (seconds)</label>
            <input
              type="number"
              min={5}
              value={durStr}
              onChange={(e) => setDurStr(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginTop: 16,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Show the free sample on the course page
        </label>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 22,
          }}
        >
          <button type="button" onClick={onClose} style={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!lessonId}
            onClick={() =>
              onSave({
                enabled,
                lesson_id: lessonId,
                start_seconds: Math.max(0, parseInt(startStr || '0', 10) || 0),
                duration_seconds: Math.max(
                  5,
                  parseInt(durStr || '120', 10) || 120,
                ),
              })
            }
            style={{ ...btnPrimary, opacity: lessonId ? 1 : 0.4 }}
          >
            Save sample
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#86868b',
  marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 10,
  border: '1.5px solid #e8e8ed',
  fontSize: 14,
  background: '#fff',
  color: '#1d1d1f',
}
const btnGhost: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 980,
  background: 'none',
  boxShadow: 'inset 0 0 0 1px #e8e8ed',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 980,
  background: '#1d1d1f',
  color: '#fff',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

export default CourseDesignEditor
