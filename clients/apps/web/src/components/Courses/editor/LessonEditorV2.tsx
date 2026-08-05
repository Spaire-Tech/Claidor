'use client'

// LessonEditorV2 — the redesigned lesson editor, a faithful port of the
// design (Lesson Editor.html) wired to REAL persistence:
//
//   Video         → Mux direct upload (useCreateMuxUpload + PUT), local
//                   preview while transcoding, Replace, Play → WatchPlayer
//   Title/Desc    → lesson.title / lesson.description
//   Overview note + takeaways → lesson.content.overview / .takeaways[]
//   Resources     → lesson attachments (upload/delete to S3)
//   Free preview  → lesson.is_free_preview
//   Captions      → lesson.content.captions (drives Mux subtitles + player)
//   Discussion    → comments_mode (visible | hidden) — gated to enrolled
//   Automations   → cards linking to the sequence builder
//
// Everything autosaves (debounced); the header shows Saved / Saving…. The
// design's "Offline downloads" row is intentionally omitted per product.

import {
  apiErrorDetail,
  CourseLessonRead,
  CourseModuleRead,
  CourseRead,
  LessonAttachment,
  useCancelLessonAiAutofill,
  useCreateMuxUpload,
  useDeleteLessonAttachment,
  useRemoveLessonVideo,
  useRewriteLessonAi,
  useSetLessonThumbnailFromVideo,
  useUpdateCourse,
  useUpdateCourseLesson,
  useUploadLessonAttachment,
  useUploadLessonThumbnail,
} from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../Toast/use-toast'
import { RepositionInPortal } from '../watch/RepositionInPortal'
import { WatchPlayer } from '../watch/WatchPlayer'
import {
  lessonVideoUploadStore,
  useLessonVideoUpload,
} from './lessonVideoUploadStore'
import { SampleSettingsPopover } from './SeriesSampleBlock'

type SaveState = 'saved' | 'saving' | 'error'

function fmtBytes(n: number): string {
  return n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`
}
function fmtDur(secs?: number | null): string {
  const s = Math.max(0, Math.round(secs ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// The lesson's JSONB `content` carries the creator-authored extras. We read
// with fallbacks and always merge (never clobber attachments / textContent).
type LessonContent = {
  attachments?: LessonAttachment[]
  // `text` is the long-form lesson body (Markdown). The lesson page
  // (MasterClassLessonViewer) renders it — so a text lesson authored here
  // actually shows up. (The legacy `textContent` key is unused.)
  text?: string
  overview?: string
  takeaways?: string[]
  captions?: boolean
  [k: string]: unknown
}

export function LessonEditorV2({
  lesson,
  module,
  course,
  organization,
  organizationSlug,
  onDelete,
}: {
  lesson: CourseLessonRead
  module: CourseModuleRead
  course: CourseRead
  organization: schemas['Organization']
  organizationSlug: string
  onDelete?: () => void
}) {
  const router = useRouter()
  const pageRef = useRef<HTMLElement>(null)
  // Always open a lesson scrolled to the very top — when you switch lessons the
  // editor remounts (key=lesson.id) but the surrounding canvas can retain its
  // previous scroll offset, leaving you halfway down the new lesson.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
    pageRef.current?.scrollTo?.(0, 0)
    let el: HTMLElement | null = pageRef.current?.parentElement ?? null
    while (el) {
      if (el.scrollTop > 0) el.scrollTop = 0
      el = el.parentElement
    }
  }, [])
  const updateLesson = useUpdateCourseLesson()
  const updateCourse = useUpdateCourse()
  const createMuxUpload = useCreateMuxUpload()
  const removeVideo = useRemoveLessonVideo()
  const uploadAttachment = useUploadLessonAttachment()
  const deleteAttachment = useDeleteLessonAttachment()
  const uploadThumbnail = useUploadLessonThumbnail()

  const isEpisodic = course.format === 'series'
  const content = (lesson.content ?? {}) as LessonContent

  // ── Free sample for THIS lesson (course-level, single sample) ──
  const [sampleOpen, setSampleOpen] = useState(false)
  const courseSample = course.sample
  const isSampleLesson = Boolean(
    courseSample?.enabled && courseSample.lesson_id === lesson.id,
  )
  const removeSample = () => {
    void updateCourse.mutateAsync({
      courseId: course.id,
      body: { sample: null },
    })
  }

  // ── local editable state (seeded from the lesson; autosaves) ──
  const [title, setTitle] = useState(lesson.title ?? '')
  const [desc, setDesc] = useState(lesson.description ?? '')
  const [overview, setOverview] = useState(content.overview ?? '')
  const [body, setBody] = useState(content.text ?? '')
  const [takeaways, setTakeaways] = useState<string[]>(
    content.takeaways && content.takeaways.length > 0
      ? content.takeaways
      : ['', ''],
  )
  const [freePreview, setFreePreview] = useState(
    Boolean(lesson.is_free_preview),
  )
  const [captions, setCaptions] = useState(content.captions !== false)
  const [discussion, setDiscussion] = useState(
    (lesson.comments_mode ?? 'visible') !== 'hidden',
  )
  const [attachments, setAttachments] = useState<LessonAttachment[]>(
    content.attachments ?? [],
  )
  const [published, setPublished] = useState(Boolean(lesson.published))
  const [saveState, setSaveState] = useState<SaveState>('saved')

  // ── video upload (Mux) ──
  // The in-flight upload lives in a module-level store keyed by lesson id,
  // NOT in component state — the editor remounts when you switch lessons
  // (key=lesson.id) but the upload's XHR keeps running, so keeping progress
  // in the store means coming back to the lesson shows the same live bar
  // (and Cancel button) instead of a mystery "Processing…" with no percent.
  const upload = useLessonVideoUpload(lesson.id)
  const uploadPct = upload?.pct ?? null
  const localVideoUrl = upload?.localUrl ?? null
  const uploadPrevPlaybackId = upload?.prevPlaybackId ?? null
  const [playing, setPlaying] = useState(false)
  // The upload/transcode pipeline has real terminal failure states — don't
  // fold them into "Processing…" (which used to spin forever on a failed
  // transcode or an over-quota upload).
  const status = lesson.mux_status
  const uploading = uploadPct != null
  const processing = uploading || status === 'waiting' || status === 'processing'
  const videoErrored = !uploading && status === 'errored'
  const quotaExceeded = status === 'quota_exceeded'
  const hasVideo = Boolean(
    lesson.mux_playback_id ||
      localVideoUrl ||
      processing ||
      videoErrored ||
      quotaExceeded,
  )
  const playable = Boolean(lesson.mux_playback_id) && !processing

  // Closing/refreshing the tab mid-upload kills the PUT and used to leave the
  // lesson "waiting" forever. Warn first — the server-side reconcile job now
  // also times abandoned uploads out, but not losing the upload is better.
  useEffect(() => {
    if (uploadPct == null) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploadPct])
  // Drop the local preview once the freshly-uploaded asset is ready — i.e.
  // when a NEW playback id (different from the one the lesson had when this
  // upload started) has landed. The store owns the object URL's lifetime, so
  // this must NOT run on unmount (the upload may still be going).
  useEffect(() => {
    if (!localVideoUrl) return
    if (lesson.mux_status !== 'ready' || !lesson.mux_playback_id) return
    if (lesson.mux_playback_id === uploadPrevPlaybackId) return
    lessonVideoUploadStore.clear(lesson.id, { revoke: true })
  }, [
    lesson.mux_status,
    lesson.mux_playback_id,
    lesson.id,
    localVideoUrl,
    uploadPrevPlaybackId,
  ])

  // ── debounced autosave of the content JSONB + scalar fields ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Record<string, unknown>>({})
  const queueSave = useCallback(
    (patch: Record<string, unknown>) => {
      pending.current = { ...pending.current, ...patch }
      setSaveState('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const body = pending.current
        pending.current = {}
        try {
          await updateLesson.mutateAsync({ lessonId: lesson.id, body })
          setSaveState('saved')
        } catch {
          setSaveState('error')
          toast({ title: 'Could not save', description: 'Please try again.' })
        }
      }, 600)
    },
    [lesson.id, updateLesson],
  )
  // Accumulate every content edit into a ref (seeded from the lesson once at
  // mount). Two edits inside the same 600ms debounce window must not clobber
  // each other — the old code rebuilt `next` from the prop each time, so the
  // edit that landed first was silently dropped because the prop hadn't
  // refetched yet.
  const contentRef = useRef<LessonContent>({ ...content })
  const saveContent = useCallback(
    (patch: Partial<LessonContent>) => {
      contentRef.current = { ...contentRef.current, ...patch }
      queueSave({ content: contentRef.current })
    },
    [queueSave],
  )

  // ── field handlers ──
  const onTitle = (v: string) => {
    setTitle(v)
    queueSave({ title: v })
  }
  const onDesc = (v: string) => {
    setDesc(v)
    queueSave({ description: v })
  }
  const onOverview = (v: string) => {
    setOverview(v)
    saveContent({ overview: v })
  }
  const onBody = (v: string) => {
    setBody(v)
    saveContent({ text: v })
  }
  const setTakeaway = (i: number, v: string) => {
    const next = [...takeaways]
    next[i] = v
    setTakeaways(next)
    saveContent({ takeaways: next.filter((t) => t.trim()) })
  }
  const addTakeaway = () => setTakeaways((t) => [...t, ''])
  const removeTakeaway = (i: number) => {
    const next = takeaways.filter((_, j) => j !== i)
    setTakeaways(next)
    saveContent({ takeaways: next.filter((t) => t.trim()) })
  }
  const toggleFree = () => {
    const v = !freePreview
    setFreePreview(v)
    queueSave({ is_free_preview: v })
  }
  const toggleCaptions = () => {
    const v = !captions
    setCaptions(v)
    saveContent({ captions: v })
  }
  const toggleDiscussion = () => {
    const v = !discussion
    setDiscussion(v)
    queueSave({ comments_mode: v ? 'visible' : 'hidden' })
  }

  // ── AI lesson draft ──
  // While the video uploads/transcodes/transcribes, the AI is queued to write
  // the lesson's description, overview and takeaways from the transcript.
  // The banner tells the creator to hang tight, with an opt-out; once the
  // transcript exists, per-section "Rewrite with AI" buttons take over.
  const cancelAiAutofill = useCancelLessonAiAutofill()
  const rewriteAi = useRewriteLessonAi()
  const aiStatus = lesson.ai_autofill_status ?? null
  // Optimistic hide so the banner disappears the instant they click.
  const [aiCancelled, setAiCancelled] = useState(false)
  const [rewriting, setRewriting] = useState<null | 'details' | 'overview'>(
    null,
  )
  const aiDrafting =
    hasVideo &&
    captions &&
    !aiCancelled &&
    !videoErrored &&
    !quotaExceeded &&
    // 'pending' is authoritative once the asset attaches; before that (while
    // the upload/transcode is still running) the status is null, so lean on
    // the processing state to show the banner from the very first second.
    (aiStatus === 'pending' || (aiStatus == null && processing))
  const transcriptReady =
    lesson.content_type === 'video' && lesson.transcript_status === 'ready'

  const onCancelAi = () => {
    setAiCancelled(true)
    cancelAiAutofill.mutate(lesson.id, {
      onError: () => setAiCancelled(false),
    })
  }

  const onRewriteAi = async (section: 'details' | 'overview') => {
    if (rewriting) return
    setRewriting(section)
    try {
      const updated = await rewriteAi.mutateAsync({
        lessonId: lesson.id,
        section,
      })
      // The server already persisted the rewrite — adopt it locally (state +
      // the autosave ref, so a queued content save can't resurrect old copy).
      if (section === 'details') {
        setTitle(updated.title ?? '')
        setDesc(updated.description ?? '')
      } else {
        const c = (updated.content ?? {}) as LessonContent
        setOverview(c.overview ?? '')
        setTakeaways(
          c.takeaways && c.takeaways.length > 0 ? c.takeaways : ['', ''],
        )
        contentRef.current = {
          ...contentRef.current,
          overview: c.overview,
          takeaways: c.takeaways,
        }
      }
      toast({
        title:
          section === 'details'
            ? 'Details rewritten from the video'
            : 'Overview rewritten from the video',
      })
    } catch (err) {
      toast({
        title: 'Rewrite failed',
        description: apiErrorDetail(err) ?? 'Please try again.',
      })
    } finally {
      setRewriting(null)
    }
  }

  // When the AI draft lands while this editor is open, pull the freshly
  // written copy into any still-empty local fields (mount-time seeding covers
  // the closed-editor case). Guarded on the status *transition* so it fires
  // exactly once and never overwrites something the creator typed meanwhile.
  const prevAiStatus = useRef(aiStatus)
  useEffect(() => {
    const prev = prevAiStatus.current
    if (aiStatus === prev) return
    prevAiStatus.current = aiStatus
    if (aiStatus !== 'done') return
    const c = (lesson.content ?? {}) as LessonContent
    if (!desc.trim() && lesson.description) {
      setDesc(lesson.description)
    }
    if (!overview.trim() && c.overview) {
      setOverview(c.overview)
      contentRef.current = { ...contentRef.current, overview: c.overview }
    }
    if (
      !takeaways.some((t) => t.trim()) &&
      c.takeaways &&
      c.takeaways.length > 0
    ) {
      setTakeaways(c.takeaways)
      contentRef.current = { ...contentRef.current, takeaways: c.takeaways }
    }
    toast({
      title: 'AI drafted this lesson from the video',
      description: 'Review the details and overview — edit anything freely.',
    })
  }, [aiStatus, lesson.description, lesson.content, desc, overview, takeaways])

  const pickVideo = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      // Register the upload in the store BEFORE any awaits, so the bar shows
      // instantly and survives navigating away and back. begin() aborts and
      // revokes any prior attempt for this lesson and hands back a token; the
      // handlers below use it to bow out if a newer upload supersedes them.
      const lessonId = lesson.id
      const localUrl = URL.createObjectURL(file)
      const token = lessonVideoUploadStore.begin(
        lessonId,
        localUrl,
        lesson.mux_playback_id ?? null,
      )
      // Only reset the lesson's video state on failure once the server has
      // actually staged the new upload — before that point the lesson still
      // owns its previous (intact) video and must be left alone.
      let staged = false
      let aborted = false
      try {
        const { upload_url } = await createMuxUpload.mutateAsync(lessonId)
        staged = true
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          lessonVideoUploadStore.attachXhr(lessonId, token, xhr)
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable)
              lessonVideoUploadStore.progress(
                lessonId,
                token,
                Math.round((ev.loaded / ev.total) * 100),
              )
          }
          xhr.onload = () => {
            // onload fires for ANY response — a 4xx/5xx from the video host
            // is a failed upload, not a success.
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`The video host rejected the upload (HTTP ${xhr.status}).`))
          }
          xhr.onerror = () =>
            reject(new Error('Check your connection and try again.'))
          xhr.onabort = () => {
            aborted = true
            reject(new Error('Upload canceled'))
          }
          xhr.open('PUT', upload_url)
          xhr.send(file)
        })
        // Bytes all sent; the host is transcoding. Keep the preview, drop the
        // percentage (the lesson's mux_status now drives "Processing…").
        lessonVideoUploadStore.settled(lessonId, token)
        toast({ title: 'Video uploaded — processing now' })
      } catch (err) {
        // A newer upload for this lesson has taken over (e.g. the creator
        // re-picked, which aborted this one) — leave its state untouched.
        if (!lessonVideoUploadStore.isCurrent(lessonId, token)) return
        lessonVideoUploadStore.clear(lessonId, { revoke: true, token })
        if (staged) {
          // Clear the staged 'waiting' state and cancel the upload at the
          // host — otherwise the lesson sits "waiting" (and polls) forever.
          void removeVideo.mutateAsync(lessonId).catch(() => undefined)
        }
        if (aborted) {
          toast({ title: 'Upload canceled' })
        } else {
          toast({
            title: 'Video upload failed',
            description: apiErrorDetail(err) ?? 'Please try again.',
          })
        }
      }
    }
    input.click()
  }

  // Abort the in-flight PUT (read from the store so a remounted editor can
  // still cancel an upload it didn't start); the catch handler above resets
  // state and releases the staged upload server-side.
  const cancelUpload = () => lessonVideoUploadStore.get(lesson.id)?.xhr?.abort()

  const clearVideo = async () => {
    try {
      await removeVideo.mutateAsync(lesson.id)
      lessonVideoUploadStore.clear(lesson.id, { revoke: true })
      toast({ title: 'Video removed' })
    } catch (err) {
      toast({
        title: 'Failed to remove video',
        description: apiErrorDetail(err) ?? 'Please try again.',
      })
    }
  }

  const pickResource = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const updated = await uploadAttachment.mutateAsync({
          lessonId: lesson.id,
          file,
        })
        const nextAttachments =
          ((updated.content as LessonContent)?.attachments as
            | LessonAttachment[]
            | undefined) ?? []
        // Keep the autosave ref in step with the server's attachment write so
        // a queued content save can't overwrite the just-uploaded file.
        contentRef.current = {
          ...contentRef.current,
          attachments: nextAttachments,
        }
        setAttachments(nextAttachments)
        toast({ title: `Attached ${file.name}` })
      } catch {
        toast({ title: 'Failed to upload attachment' })
      }
    }
    input.click()
  }
  const removeResource = async (id: string) => {
    try {
      const updated = await deleteAttachment.mutateAsync({
        lessonId: lesson.id,
        attachmentId: id,
      })
      const nextAttachments =
        ((updated.content as LessonContent)?.attachments as
          | LessonAttachment[]
          | undefined) ?? []
      contentRef.current = {
        ...contentRef.current,
        attachments: nextAttachments,
      }
      setAttachments(nextAttachments)
    } catch {
      toast({ title: 'Failed to remove file' })
    }
  }

  // Publish / unpublish are deliberate actions, so persist them immediately
  // (not via the debounce) and only confirm once the server agrees — the old
  // code toasted "published" before the request had even fired, and left the
  // button showing the new state even if the save failed.
  const setPublishedState = async (next: boolean) => {
    const prev = published
    setPublished(next)
    setSaveState('saving')
    try {
      await updateLesson.mutateAsync({
        lessonId: lesson.id,
        body: { published: next },
      })
      setSaveState('saved')
      toast({ title: next ? 'Lesson published' : 'Saved as draft' })
    } catch {
      setPublished(prev)
      setSaveState('error')
      toast({
        title: next ? 'Could not publish' : 'Could not save draft',
        description: 'Please try again.',
      })
    }
  }
  const publish = () => void setPublishedState(true)
  const saveDraft = () => void setPublishedState(false)

  // ── thumbnail (lesson card cover image, drag to reposition) ──
  const [thumbUrl, setThumbUrl] = useState<string | null>(
    lesson.thumbnail_url ?? null,
  )
  const parsePos = (p?: string | null): { x: number; y: number } => {
    const m = /([\d.]+)%\s+([\d.]+)%/.exec(p ?? '')
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 }
  }
  const [thumbPos, setThumbPos] = useState(
    parsePos(lesson.thumbnail_object_position),
  )
  const thumbTileRef = useRef<HTMLDivElement | null>(null)
  // The "Reposition in portal" overlay (drag + replace in real context).
  const [reposOpen, setReposOpen] = useState(false)
  const [reposBusy, setReposBusy] = useState(false)

  const uploadThumbnailFile = async (file: File) => {
    setReposBusy(true)
    setThumbUrl(URL.createObjectURL(file))
    setThumbPos({ x: 50, y: 50 })
    setAppliedFrame(null)
    queueSave({ thumbnail_object_position: '50.0% 50.0%' })
    try {
      const updated = await uploadThumbnail.mutateAsync({
        lessonId: lesson.id,
        file,
      })
      setThumbUrl(updated.thumbnail_url ?? null)
      toast({ title: 'Thumbnail updated' })
    } catch {
      toast({ title: 'Thumbnail upload failed' })
    } finally {
      setReposBusy(false)
    }
  }
  const pickThumbnail = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void uploadThumbnailFile(file)
    }
    input.click()
  }
  const clearThumbnail = () => {
    setThumbUrl(null)
    setThumbPos({ x: 50, y: 50 })
    setAppliedFrame(null)
    queueSave({ thumbnail_url: null, thumbnail_object_position: null })
  }
  const onRepositionThumb = (pos: string) => {
    setThumbPos(parsePos(pos))
    queueSave({ thumbnail_object_position: pos })
  }

  // ── thumbnail from video (YouTube-style) ── once the video is processed,
  //    offer three frames from it as one-click thumbnail options next to
  //    the custom upload. Picking one has the SERVER grab that exact frame
  //    and store it through the same S3 pipeline as an uploaded image.
  const thumbFromVideo = useSetLessonThumbnailFromVideo()
  const [frameBusy, setFrameBusy] = useState<number | null>(null)
  // Session-local highlight of the applied frame (the stored thumbnail is
  // a plain image — it doesn't remember which timestamp it came from).
  const [appliedFrame, setAppliedFrame] = useState<number | null>(null)
  const frameReady =
    Boolean(lesson.mux_playback_id) && lesson.mux_status === 'ready'
  const frameTimes = useMemo(() => {
    if (!frameReady) return []
    const d = lesson.duration_seconds ?? 0
    // Same spread YouTube uses: three stills across the video. Short or
    // unknown durations fall back to early seconds.
    const times =
      d >= 8
        ? [0.15, 0.45, 0.78].map((f) => Math.round(d * f))
        : d >= 3
          ? [1, Math.round(d / 2), Math.max(2, d - 1)]
          : [0, 1, 2]
    return [...new Set(times)]
  }, [frameReady, lesson.duration_seconds])
  const frameSrc = (t: number, width = 480) =>
    `https://image.mux.com/${lesson.mux_playback_id}/thumbnail.jpg?time=${t}&width=${width}`
  const applyFrame = async (t: number) => {
    if (frameBusy != null) return
    setFrameBusy(t)
    try {
      const updated = await thumbFromVideo.mutateAsync({
        lessonId: lesson.id,
        timeSeconds: t,
      })
      setThumbUrl(updated.thumbnail_url ?? null)
      setThumbPos({ x: 50, y: 50 })
      setAppliedFrame(t)
      toast({ title: 'Thumbnail updated' })
    } catch {
      toast({ title: "Couldn't grab that frame", description: 'Try again.' })
    } finally {
      setFrameBusy(null)
    }
  }
  const fmtFrameTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const unitCap = isEpisodic ? 'Episode' : 'Lesson'
  const lessonIdx = useMemo(() => {
    const sorted = [...module.lessons].sort((a, b) => a.position - b.position)
    return sorted.findIndex((l) => l.id === lesson.id) + 1
  }, [module.lessons, lesson.id])

  // Standalone, course-linked automation builder (NOT the email-marketing
  // tabbed area) — returns to this lesson when done.
  const automationHref = `/dashboard/${organizationSlug}/courses/${course.id}/automations/new?lesson_id=${lesson.id}`

  return (
    <div className="led">
      {/* ════════ HEADER ════════ */}
      <header className="topbar">
        <button className="tb-back" type="button" onClick={onDelete}>
          <Ico d="M15 5l-7 7 7 7" w={2.4} s={16} />
          {isEpisodic ? 'Episodes' : 'Lessons'}
        </button>
        <div className="tb-crumb">
          <div className="tb-lesson">
            {course.title} · {unitCap} {lessonIdx}
          </div>
        </div>
        <span
          className="tb-status"
          style={saveState === 'error' ? { color: '#dc2626' } : undefined}
        >
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'error'
              ? 'Couldn’t save'
              : 'Saved'}
        </span>
        <div className="tb-actions">
          <button className="btn-glass" type="button" onClick={saveDraft}>
            Save as draft
          </button>
          <button className="btn-main" type="button" onClick={publish}>
            {published ? 'Published' : 'Publish'}
          </button>
        </div>
      </header>

      <main className="page" ref={pageRef}>
        {/* ════════ VIDEO ════════ */}
        <section className="sec">
          <div className="sec-h">Video</div>
          <div className="card">
            <div className={`media-zone ${hasVideo ? 'filled' : ''}`}>
              <div className="ph-ambient" />
              <div className="glass-tint" />
              <div
                className="photo"
                style={
                  lesson.thumbnail_url
                    ? { backgroundImage: `url("${lesson.thumbnail_url}")` }
                    : undefined
                }
              />
              <div className="photo-shade" />
              {/* Local preview while the upload/transcode runs — the file is
                  already on this machine, so show it instead of a blank tile
                  (or, worse, the previous video). */}
              {localVideoUrl && processing && (
                <video
                  className="local-preview"
                  src={localVideoUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                />
              )}
              {!hasVideo && (
                <div className="ph-cta">
                  <span className="ph-ic" onClick={pickVideo}>
                    <Ico
                      d="M12 16V4 M7.5 8.5 12 4l4.5 4.5 M5 20h14"
                      w={1.8}
                      s={22}
                    />
                  </span>
                  <span className="ph-k">Add your lesson video</span>
                  <span className="ph-s">
                    MP4 or MOV. You can replace it anytime.
                  </span>
                </div>
              )}
              {hasVideo && (
                <>
                  <span className="media-dur">
                    <Ico d="M12 12a9 9 0 1 0 0 0 M12 7v5l3 2" w={1.9} s={11} />
                    {uploading
                      ? `Uploading ${uploadPct}%`
                      : processing
                        ? 'Processing…'
                        : videoErrored
                          ? 'Upload failed'
                          : fmtDur(lesson.duration_seconds)}
                  </span>
                  {uploading ? (
                    <button
                      className="media-replace show"
                      type="button"
                      onClick={cancelUpload}
                    >
                      <Ico d="M5 5l14 14M19 5L5 19" w={2.2} s={12} />
                      Cancel upload
                    </button>
                  ) : (
                    <button
                      className="media-replace"
                      type="button"
                      onClick={pickVideo}
                    >
                      <Ico d="M20 11A8 8 0 1 0 19 15 M20 4v7h-7" w={2.2} s={12} />
                      Replace
                    </button>
                  )}
                  {playable && (
                    <button
                      className="media-playbtn"
                      type="button"
                      aria-label="Play"
                      onClick={() => setPlaying(true)}
                    >
                      <Ico
                        d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z"
                        fill
                        s={22}
                      />
                    </button>
                  )}
                  {uploading && (
                    <div className="upload-track" aria-hidden>
                      <div
                        className="upload-fill"
                        style={{ width: `${uploadPct ?? 0}%` }}
                      />
                    </div>
                  )}
                  {videoErrored && (
                    <div className="vid-alert">
                      <span className="vid-alert-t">
                        Video processing failed
                      </span>
                      <span className="vid-alert-s">
                        The video host couldn’t process this file. Try
                        uploading it again — if it keeps failing, re-export
                        the video as MP4 (H.264) first.
                      </span>
                      <div className="vid-alert-actions">
                        <button
                          className="btn-main"
                          type="button"
                          onClick={pickVideo}
                        >
                          Try again
                        </button>
                        <button
                          className="btn-dark"
                          type="button"
                          onClick={() => void clearVideo()}
                        >
                          Remove video
                        </button>
                      </div>
                    </div>
                  )}
                  {quotaExceeded && !uploading && (
                    <div className="vid-alert">
                      <span className="vid-alert-t">
                        Video hours limit reached
                      </span>
                      <span className="vid-alert-s">
                        This video pushed your plan past its hosted video
                        hours, so students can’t play this{' '}
                        {unitCap.toLowerCase()}. Free up hours by removing or
                        shortening other videos, or upgrade your plan.
                      </span>
                      <div className="vid-alert-actions">
                        <button
                          className="btn-main"
                          type="button"
                          onClick={pickVideo}
                        >
                          Replace video
                        </button>
                        <button
                          className="btn-dark"
                          type="button"
                          onClick={() => void clearVideo()}
                        >
                          Remove video
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {hasVideo && (
              <div className="auto-rows">
                <AutoRow
                  label="Captions"
                  sub="Auto-generated from the audio on upload"
                  ready={!processing && captions}
                  busy={processing}
                />
              </div>
            )}
            {/* Thumbnail — lesson card cover image, drag to reposition */}
            <div className="thumb-row">
              <div className="thumb-head">
                <span className="thumb-t">Thumbnail</span>
                <span className="thumb-s">
                  Shown on the {unitCap.toLowerCase()} card and in the rail.
                </span>
                <button
                  className={`thumb-clear ${thumbUrl ? 'show' : ''}`}
                  type="button"
                  onClick={clearThumbnail}
                >
                  Remove
                </button>
              </div>
              <div
                ref={thumbTileRef}
                className={`thumb-tile ${thumbUrl ? 'filled' : ''}`}
                role="button"
                aria-label={
                  thumbUrl ? 'Reposition thumbnail in portal' : 'Add thumbnail'
                }
                onClick={() =>
                  thumbUrl ? setReposOpen(true) : pickThumbnail()
                }
              >
                <div className="ph-ambient" />
                <div className="glass-tint" />
                <div
                  className="photo"
                  style={{
                    backgroundImage: thumbUrl
                      ? `url("${thumbUrl}")`
                      : undefined,
                    backgroundPosition: `${thumbPos.x}% ${thumbPos.y}%`,
                  }}
                />
                {/* Empty → pick a file. Filled → a centered CTA that opens
                    the portal preview where the image is repositioned and
                    replaced in context (matches how it actually renders). */}
                <div className="thumb-cta">
                  <span className="thumb-ic">
                    {thumbUrl ? (
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
                        <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
                      </svg>
                    ) : (
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
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="M21 15l-4.35-4.35a1.4 1.4 0 0 0-2 0L5 20" />
                      </svg>
                    )}
                  </span>
                  <span className="ph-k">
                    {thumbUrl ? 'Reposition in portal' : 'Add a thumbnail'}
                  </span>
                </div>
              </div>
              {/* YouTube-style picker — upload a custom image, or one-click
                  a frame pulled from the processed video. */}
              {frameTimes.length > 0 && (
                <div className="tf">
                  <div className="tf-label">
                    Or pick a frame from the video
                  </div>
                  <div className="tf-row">
                    <button
                      type="button"
                      className="tf-tile tf-upload"
                      onClick={pickThumbnail}
                      disabled={frameBusy != null || reposBusy}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 20h16" />
                      </svg>
                      <span>Upload</span>
                    </button>
                    {frameTimes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`tf-tile ${
                          appliedFrame === t ? 'active' : ''
                        }`}
                        onClick={() => void applyFrame(t)}
                        disabled={frameBusy != null}
                        aria-label={`Use the frame at ${fmtFrameTime(t)} as the thumbnail`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frameSrc(t)} alt="" loading="lazy" />
                        <span className="tf-time">{fmtFrameTime(t)}</span>
                        {frameBusy === t && (
                          <span className="tf-spin" aria-hidden />
                        )}
                        {appliedFrame === t && frameBusy == null && (
                          <span className="tf-check" aria-hidden>
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4.5 12.8 9.6 18 19.5 6.5" />
                            </svg>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ════════ AI LESSON DRAFT (banner while the AI writes the page) ════════ */}
        {aiDrafting && (
          <section className="sec">
            <div className="ai-banner" role="status">
              <span className="ai-spin" aria-hidden />
              <div className="ai-b-main">
                <div className="ai-b-t">
                  Our AI is writing this {unitCap.toLowerCase()} for you
                </div>
                <div className="ai-b-s">
                  Once the video finishes transcribing, the description,
                  overview and takeaways below will fill in automatically.
                  Anything you write yourself is always kept.
                </div>
              </div>
              <button
                className="btn-glass"
                type="button"
                onClick={onCancelAi}
              >
                I’ll write it myself
              </button>
            </div>
          </section>
        )}

        {/* ════════ LESSON DETAILS ════════ */}
        <section className="sec">
          <div className="sec-h sec-h-row">
            <span>{unitCap} details</span>
            {transcriptReady && (
              <button
                className="ai-rewrite"
                type="button"
                disabled={rewriting !== null}
                onClick={() => void onRewriteAi('details')}
              >
                {rewriting === 'details' ? (
                  <>
                    <span className="ai-spin sm" aria-hidden />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <SparkleIco />
                    Rewrite with AI
                  </>
                )}
              </button>
            )}
          </div>
          <div className="card">
            <div className="field">
              <div className="f-label">Title</div>
              <input
                className="f-input title"
                value={title}
                spellCheck={false}
                onChange={(e) => onTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <div className="f-label">Description</div>
              <Autosize
                className="f-area"
                value={desc}
                onChange={onDesc}
                placeholder="One line, shown on the card and under the title."
              />
            </div>
          </div>
          <p className="sec-sub">
            The description appears on the {unitCap.toLowerCase()} card and
            under the title in the course page.
          </p>
        </section>

        {/* ════════ OVERVIEW ════════ */}
        <section className="sec">
          <div className="sec-h sec-h-row">
            <span>{unitCap} overview</span>
            {transcriptReady && (
              <button
                className="ai-rewrite"
                type="button"
                disabled={rewriting !== null}
                onClick={() => void onRewriteAi('overview')}
              >
                {rewriting === 'overview' ? (
                  <>
                    <span className="ai-spin sm" aria-hidden />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <SparkleIco />
                    Rewrite with AI
                  </>
                )}
              </button>
            )}
          </div>
          <div className="card">
            <div className="field">
              <div className="f-label">Your note to students</div>
              <Autosize
                className="f-area"
                value={overview}
                onChange={onOverview}
                placeholder="Write like you’re talking to one student. Why does this lesson matter? What should they do, not just watch?"
              />
            </div>
            <div className="field">
              <div className="f-label">In this {unitCap.toLowerCase()}</div>
            </div>
            <div className="learn-list">
              {takeaways.map((t, i) => (
                <div className="learn-row" key={i}>
                  <span className="ck">
                    <Ico d="m5 12.5 4.5 4.5L19 6.5" w={2.6} s={11} />
                  </span>
                  <input
                    spellCheck={false}
                    placeholder="A takeaway students can act on…"
                    value={t}
                    onChange={(e) => setTakeaway(i, e.target.value)}
                  />
                  <button
                    className="row-x"
                    type="button"
                    aria-label="Remove"
                    onClick={() => removeTakeaway(i)}
                  >
                    <Ico d="M5 5l14 14M19 5L5 19" w={2.2} s={12} />
                  </button>
                </div>
              ))}
            </div>
            <button className="add-row" type="button" onClick={addTakeaway}>
              <Ico d="M12 5v14M5 12h14" w={2.2} s={14} />
              Add a takeaway
            </button>
          </div>
          <p className="sec-sub">
            Students see this before pressing play. Three or four takeaways is
            plenty.
          </p>
        </section>

        {/* ════════ LESSON CONTENT (body) ════════
            Video lessons don't get a long-form body editor — the video (plus
            overview + takeaways above) IS the lesson. For text-only lessons
            this textarea is the entire lesson body, so it stays. */}
        {!hasVideo && (
          <section className="sec">
            <div className="sec-h">{unitCap} content</div>
            <div className="card">
              <div className="field">
                <Autosize
                  className="f-area"
                  value={body}
                  onChange={onBody}
                  placeholder="Write the lesson here. Markdown is supported — this is shown on the lesson page."
                />
              </div>
            </div>
            <p className="sec-sub">
              Long-form text shown on the {unitCap.toLowerCase()} page. For a
              text-only {unitCap.toLowerCase()}, this is the lesson body.
            </p>
          </section>
        )}

        {/* ════════ RESOURCES ════════ */}
        <section className="sec">
          <div className="sec-h">Resources</div>
          <div className="card">
            <div>
              {attachments.map((r) => (
                <div className="res-row" key={r.id}>
                  <span className="ar-ico">
                    <Ico
                      d="M7 3h7l5 5v13H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5"
                      w={1.9}
                      s={16}
                    />
                  </span>
                  <div className="res-main">
                    <div className="res-n">{r.filename}</div>
                    <div className="res-m">
                      {(
                        r.content_type?.split('/').pop() ?? 'file'
                      ).toUpperCase()}{' '}
                      · {fmtBytes(r.size)}
                    </div>
                  </div>
                  <button
                    className="row-x"
                    type="button"
                    aria-label="Remove file"
                    onClick={() => removeResource(r.id)}
                  >
                    <Ico d="M5 5l14 14M19 5L5 19" w={2.2} s={12} />
                  </button>
                </div>
              ))}
            </div>
            <button className="add-row" type="button" onClick={pickResource}>
              <Ico d="M12 5v14M5 12h14" w={2.2} s={14} />
              Add a file
            </button>
          </div>
          <p className="sec-sub">
            Workbooks, drill sheets, templates — shown to students alongside the
            lesson.
          </p>
        </section>

        {/* ════════ STUDENT EXPERIENCE ════════ */}
        <section className="sec">
          <div className="sec-h">Student experience</div>
          <div className="card">
            <QRow
              t="Free preview"
              s="Let anyone watch this lesson without enrolling. Great for a first lesson."
              on={freePreview}
              onClick={toggleFree}
            />
            {(lesson.content_type === 'video' || hasVideo) && (
              <div className="q-row">
                <div className="q-main">
                  {!hasVideo ? (
                    <>
                      <div className="q-t">Free sample</div>
                      <div className="q-s">
                        Add a video to this {unitCap.toLowerCase()} to clip a
                        free sample for the landing.
                      </div>
                    </>
                  ) : isSampleLesson && courseSample ? (
                    <>
                      <div className="q-t">Free sample · on the landing</div>
                      <div className="q-s">
                        {fmtDur(courseSample.start_seconds)}–
                        {fmtDur(
                          courseSample.start_seconds +
                            courseSample.duration_seconds,
                        )}{' '}
                        · {courseSample.duration_seconds}s clip from this{' '}
                        {unitCap.toLowerCase()}.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="q-t">Free sample</div>
                      <div className="q-s">
                        Show a short, free clip from this{' '}
                        {unitCap.toLowerCase()} on the landing.
                        {courseSample?.enabled
                          ? ' Replaces the course’s current sample.'
                          : ''}
                      </div>
                    </>
                  )}
                </div>
                {hasVideo &&
                  (isSampleLesson ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn-glass"
                        type="button"
                        onClick={() => setSampleOpen(true)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-glass"
                        type="button"
                        onClick={removeSample}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-main"
                      type="button"
                      onClick={() => setSampleOpen(true)}
                    >
                      Set sample
                    </button>
                  ))}
              </div>
            )}
            <QRow
              t="Captions"
              s="Show subtitles on this lesson’s video."
              on={captions}
              onClick={toggleCaptions}
            />
            <QRow
              t="Discussion"
              s="A comment thread under the lesson, for enrolled students. You can join in any time."
              on={discussion}
              onClick={toggleDiscussion}
            />
          </div>
        </section>

        {/* ════════ AUTOMATIONS ════════ */}
        <section className="sec">
          <div className="sec-h">
            When a student finishes this {unitCap.toLowerCase()}
          </div>
          <div className="auto-cards">
            <button
              className="atc new"
              type="button"
              onClick={() => router.push(automationHref)}
            >
              <div className="atc-k">
                <span className="atc-t">New automation</span>
              </div>
              <span className="atc-s">
                Build a sequence from a blank canvas.
              </span>
            </button>
          </div>
        </section>
      </main>

      {playing && lesson.mux_playback_id && (
        <WatchPlayer
          lesson={{
            n: lessonIdx,
            title: title || lesson.title,
            thumbnailUrl: lesson.thumbnail_url,
            muxPlaybackId: lesson.mux_playback_id,
            // Signed HLS URL from the API — required once assets use the
            // signed playback policy (the bare playback id 403s).
            playbackUrl: lesson.mux_playback_url ?? null,
            storyboardUrl: lesson.mux_storyboard_url ?? null,
          }}
          courseTitle={course.title ?? 'Course'}
          instructorName={course.instructor_name}
          onClose={() => setPlaying(false)}
        />
      )}

      {reposOpen && (
        <RepositionInPortal
          imageUrl={thumbUrl}
          position={`${thumbPos.x}% ${thumbPos.y}%`}
          title={title || lesson.title}
          lessonLabel={`${unitCap} ${lessonIdx}`}
          description={desc}
          instructorName={course.instructor_name}
          busy={reposBusy}
          onReposition={onRepositionThumb}
          onReplace={(file) => void uploadThumbnailFile(file)}
          onClose={() => setReposOpen(false)}
        />
      )}

      <SampleSettingsPopover
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        course={course}
        initial={course.sample}
        unit={isEpisodic ? 'episode' : 'lesson'}
        lockedLessonId={lesson.id}
      />

      <LessonEditorStyles />
    </div>
  )
}

/* ── small building blocks ── */

// Four-point sparkle for the AI affordances — filled, inherits currentColor.
function SparkleIco() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.6l2.2 5.9 5.9 2.2-5.9 2.2L12 18.8l-2.2-5.9-5.9-2.2 5.9-2.2L12 2.6z" />
      <path d="M19.6 15.4l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z" />
    </svg>
  )
}

function Ico({
  d,
  s = 24,
  w = 1.9,
  fill = false,
}: {
  d: string
  s?: number
  w?: number
  fill?: boolean
}) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i ? 'M' : '') + seg} />
      ))}
    </svg>
  )
}

function QRow({
  t,
  s,
  on,
  onClick,
}: {
  t: string
  s: string
  on: boolean
  onClick: () => void
}) {
  return (
    <div className="q-row">
      <div className="q-main">
        <div className="q-t">{t}</div>
        <div className="q-s">{s}</div>
      </div>
      <button
        className={`sw ${on ? 'on' : ''}`}
        type="button"
        aria-label={t}
        onClick={onClick}
      />
    </div>
  )
}

function AutoRow({
  label,
  sub,
  ready,
  busy,
}: {
  label: string
  sub: string
  ready: boolean
  busy: boolean
}) {
  return (
    <div className="auto-row">
      <div className="ar-main">
        <div className="ar-t">{label}</div>
        <div className="ar-s">{sub}</div>
      </div>
      <span className={`ar-state ${ready ? 'ready' : ''}`}>
        {busy ? (
          <>
            <span className="spin" />
            Processing
          </>
        ) : ready ? (
          <>
            <Ico d="m5 12.5 4.5 4.5L19 6.5" w={2.6} s={13} />
            Ready
          </>
        ) : (
          'Off'
        )}
      </span>
    </div>
  )
}

// Auto-growing textarea — matches the design's `autosize`.
function Autosize({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(() => {
    fit()
  }, [fit, value])
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => {
        onChange(e.target.value)
        fit()
      }}
    />
  )
}

export default LessonEditorV2

// styled-jsx port of Lesson Editor.html, scoped under `.led`.
function LessonEditorStyles() {
  return (
    <style jsx global>{`
      .led {
        --bg: #f5f5f7;
        --card: #ffffff;
        --text: #1d1d1f;
        --text-2: #86868b;
        --blue: var(--color-ce-accent);
        --hair: rgba(0, 0, 0, 0.1);
        --ans: #4a4a4f;
        --band: 255, 255, 255;
        --sf:
          -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
          system-ui, sans-serif;
        --po:
          'Poppins', var(--font-poppins), -apple-system, system-ui, sans-serif;
        font-family: var(--sf);
        background: var(--bg);
        color: var(--text);
        min-height: 100%;
        letter-spacing: -0.014em;
        -webkit-font-smoothing: antialiased;
      }
      body.dark .led {
        --bg: #141416;
        --card: #1d1d20;
        --text: #f5f5f7;
        --text-2: rgba(245, 245, 247, 0.6);
        --hair: rgba(245, 245, 247, 0.14);
        --ans: rgba(245, 245, 247, 0.78);
        --band: 29, 29, 32;
      }
      .led * {
        box-sizing: border-box;
      }
      .led button {
        font-family: inherit;
        cursor: pointer;
        border: none;
        background: none;
        color: inherit;
      }
      .led input,
      .led textarea {
        font-family: var(--sf);
        color: var(--text);
        background: transparent;
        border: none;
        outline: none;
        letter-spacing: -0.014em;
      }
      /* The app's global form styles add a 1px box-shadow focus ring (the
         "black box/underline" around writable fields). The design has none —
         these are borderless inline fields — so neutralise it on focus. */
      .led input:focus,
      .led textarea:focus,
      .led input:focus-visible,
      .led textarea:focus-visible {
        outline: none;
        box-shadow: none;
      }
      .led input::placeholder,
      .led textarea::placeholder {
        color: var(--text-2);
        opacity: 0.8;
      }

      .led .topbar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 28px;
        background: rgba(var(--band), 0.8);
        -webkit-backdrop-filter: blur(30px) saturate(150%);
        backdrop-filter: blur(30px) saturate(150%);
        border-bottom: 1px solid var(--hair);
      }
      .led .tb-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 500;
        color: var(--blue);
        padding: 6px 8px 6px 2px;
        border-radius: 8px;
      }
      .led .tb-back:hover {
        opacity: 0.7;
      }
      .led .tb-crumb {
        flex: 1;
        min-width: 0;
      }
      .led .tb-lesson {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .led .tb-status {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-2);
        white-space: nowrap;
      }
      .led .tb-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .led .btn-glass {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 16px;
        border-radius: 980px;
        background: rgba(125, 125, 135, 0.14);
        color: var(--text);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition:
          background 0.18s,
          transform 0.16s;
      }
      .led .btn-glass:hover {
        background: rgba(125, 125, 135, 0.26);
      }
      .led .btn-glass:active {
        transform: scale(0.96);
      }
      .led .btn-main {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 18px;
        border-radius: 980px;
        background: var(--blue);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition:
          opacity 0.16s,
          transform 0.16s;
      }
      .led .btn-main:hover {
        opacity: 0.85;
      }
      .led .btn-main:active {
        transform: scale(0.96);
      }

      .led .page {
        max-width: 720px;
        margin: 0 auto;
        padding: 36px 24px 120px;
      }
      .led .sec {
        margin-top: 40px;
      }
      .led .sec:first-child {
        margin-top: 0;
      }
      .led .sec-h {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-2);
        margin: 0 18px 8px;
      }
      .led .sec-sub {
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-2);
        margin: 8px 18px 0;
      }
      /* Section header row: label left, "Rewrite with AI" pill right. */
      .led .sec-h-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .led .ai-rewrite {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 12px;
        border-radius: 980px;
        background: var(--color-ce-accent-tint);
        color: var(--blue);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.01em;
        text-transform: none;
        white-space: nowrap;
        transition:
          background 0.18s,
          opacity 0.16s;
      }
      .led .ai-rewrite:hover {
        background: var(--color-ce-accent-tint-strong);
      }
      .led .ai-rewrite:disabled {
        opacity: 0.55;
        cursor: default;
      }
      /* "AI is writing this lesson" banner — blue-tinted glass card. */
      .led .ai-banner {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--color-ce-accent-tint);
        border: 1px solid var(--color-ce-accent-border);
      }
      .led .ai-b-main {
        flex: 1;
        min-width: 0;
      }
      .led .ai-b-t {
        font-size: 14px;
        font-weight: 650;
        color: var(--text);
        letter-spacing: -0.014em;
      }
      .led .ai-b-s {
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-2);
        margin-top: 2px;
      }
      .led .ai-spin {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid var(--color-ce-accent-ring);
        border-top-color: var(--blue);
        animation: led-spin 0.8s linear infinite;
      }
      .led .ai-spin.sm {
        width: 11px;
        height: 11px;
      }
      .led .card {
        background: var(--card);
        border-radius: 18px;
        border: 1px solid var(--hair);
        overflow: hidden;
      }
      .led .field {
        padding: 14px 18px;
      }
      .led .field + .field {
        border-top: 1px solid var(--hair);
      }
      .led .f-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-2);
        margin-bottom: 6px;
      }
      .led .f-input {
        width: 100%;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      .led .f-input.title {
        font-family: var(--po);
        font-size: 21px;
      }
      .led .f-area {
        width: 100%;
        min-height: 44px;
        font-size: 15px;
        line-height: 1.55;
        font-weight: 400;
        color: var(--ans);
        resize: none;
        overflow: hidden;
      }

      .led .media-zone {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        display: grid;
        place-items: center;
      }
      .led .ph-ambient {
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
      .led .glass-tint {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.18);
        -webkit-backdrop-filter: blur(60px) saturate(140%);
        backdrop-filter: blur(60px) saturate(140%);
      }
      .led .media-zone .photo {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
        display: none;
      }
      .led .media-zone .photo-shade {
        position: absolute;
        inset: 0;
        display: none;
        background: linear-gradient(
          0deg,
          rgba(5, 5, 8, 0.5) 0%,
          rgba(5, 5, 8, 0.14) 36%,
          transparent 56%
        );
      }
      .led .media-zone.filled .photo,
      .led .media-zone.filled .photo-shade {
        display: block;
      }
      .led .media-zone.filled .ph-ambient,
      .led .media-zone.filled .glass-tint,
      .led .media-zone.filled .ph-cta {
        display: none;
      }
      .led .ph-cta {
        position: relative;
        z-index: 2;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 13px;
        color: #fff;
        text-align: center;
        padding: 0 24px;
      }
      .led .ph-cta .ph-ic {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.14);
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition:
          background 0.2s,
          transform 0.18s;
      }
      .led .ph-cta .ph-ic:hover {
        background: rgba(255, 255, 255, 0.28);
        transform: scale(1.06);
      }
      .led .ph-cta .ph-k {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .led .ph-cta .ph-s {
        font-size: 13px;
        color: rgba(235, 235, 245, 0.66);
        margin-top: -7px;
        max-width: 40ch;
        line-height: 1.45;
      }
      .led .media-dur {
        position: absolute;
        right: 14px;
        top: 14px;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.92);
        font-variant-numeric: tabular-nums;
        background: rgba(0, 0, 0, 0.42);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        padding: 5px 10px 5px 8px;
        border-radius: 980px;
      }
      .led .media-replace {
        position: absolute;
        left: 14px;
        top: 14px;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 13px;
        border-radius: 980px;
        background: rgba(10, 11, 13, 0.46);
        color: #fff;
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        transition:
          opacity 0.2s,
          background 0.18s;
      }
      .led .media-zone.filled:hover .media-replace {
        opacity: 1;
      }
      .led .media-replace:hover {
        background: rgba(40, 40, 46, 0.7);
      }
      .led .media-playbtn {
        position: absolute;
        z-index: 2;
        display: grid;
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        -webkit-backdrop-filter: blur(30px) saturate(150%);
        backdrop-filter: blur(30px) saturate(150%);
        place-items: center;
        padding-left: 4px;
        transition:
          background 0.2s,
          transform 0.16s;
      }
      .led .media-playbtn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }
      .led .media-replace.show {
        opacity: 1;
      }
      .led .media-zone .local-preview {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #000;
        z-index: 1;
      }
      .led .upload-track {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 4px;
        z-index: 3;
        background: rgba(255, 255, 255, 0.25);
      }
      .led .upload-fill {
        height: 100%;
        background: var(--blue);
        transition: width 0.25s ease;
      }
      .led .vid-alert {
        position: absolute;
        inset: 0;
        z-index: 4;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 0 32px;
        text-align: center;
        color: #fff;
        background: rgba(10, 11, 13, 0.62);
        -webkit-backdrop-filter: blur(12px) saturate(140%);
        backdrop-filter: blur(12px) saturate(140%);
      }
      .led .vid-alert-t {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.015em;
      }
      .led .vid-alert-s {
        font-size: 13px;
        line-height: 1.5;
        color: rgba(235, 235, 245, 0.75);
        max-width: 52ch;
      }
      .led .vid-alert-actions {
        display: flex;
        gap: 10px;
        margin-top: 6px;
      }
      .led .btn-dark {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 16px;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        transition: background 0.18s;
      }
      .led .btn-dark:hover {
        background: rgba(255, 255, 255, 0.28);
      }

      .led .auto-rows {
        border-top: 1px solid var(--hair);
      }
      .led .auto-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 13px 18px;
      }
      .led .auto-row + .auto-row {
        border-top: 1px solid var(--hair);
      }
      .led .ar-main {
        flex: 1;
        min-width: 0;
      }
      .led .ar-t {
        font-size: 14.5px;
        font-weight: 600;
      }
      .led .ar-s {
        font-size: 12.5px;
        color: var(--text-2);
        margin-top: 1px;
      }
      .led .ar-state {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-2);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      .led .ar-state.ready {
        color: #23a050;
      }
      .led .ar-state .spin {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(125, 125, 135, 0.3);
        border-top-color: var(--text);
        animation: led-spin 0.8s linear infinite;
      }
      @keyframes led-spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* thumbnail — full-width zone, drag to reposition */
      .led .thumb-row {
        padding: 14px 18px 18px;
        border-top: 1px solid var(--hair);
      }
      .led .thumb-head {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }
      .led .thumb-t {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .led .thumb-s {
        flex: 1;
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-2);
      }
      .led .thumb-clear {
        font-size: 13px;
        font-weight: 500;
        color: var(--blue);
        padding: 2px 0;
        display: none;
      }
      .led .thumb-clear.show {
        display: inline-block;
      }
      .led .thumb-clear:hover {
        text-decoration: underline;
      }
      .led .thumb-tile {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        margin-top: 12px;
        border-radius: 14px;
        overflow: hidden;
        display: grid;
        place-items: center;
        touch-action: none;
      }
      .led .thumb-tile::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 2;
        border-radius: 14px;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        pointer-events: none;
      }
      .led .thumb-tile.filled {
        cursor: grab;
      }
      .led .thumb-tile.filled.dragging {
        cursor: grabbing;
      }
      .led .thumb-tile .ph-ambient {
        filter: blur(30px);
      }
      .led .thumb-tile .photo {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: 50% 50%;
        display: none;
      }
      .led .thumb-tile.filled .photo {
        display: block;
      }
      .led .thumb-tile.filled .ph-ambient,
      .led .thumb-tile.filled .glass-tint {
        display: none;
      }
      /* When filled the CTA stays — it's now "Reposition in portal" — over
         a subtle scrim so it reads on any image; the scrim deepens on hover. */
      .led .thumb-tile.filled::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        background: rgba(0, 0, 0, 0.28);
        transition: background 0.2s;
      }
      .led .thumb-tile.filled:hover::after {
        background: rgba(0, 0, 0, 0.42);
      }
      .led .thumb-cta {
        position: relative;
        z-index: 2;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        color: #fff;
        text-align: center;
      }
      .led .thumb-cta .thumb-ic {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.16);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        backdrop-filter: blur(20px) saturate(150%);
        display: grid;
        place-items: center;
        transition:
          background 0.2s,
          transform 0.18s;
      }
      .led .thumb-tile:hover .thumb-ic {
        background: rgba(255, 255, 255, 0.28);
        transform: scale(1.06);
      }
      .led .thumb-cta .ph-k {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .led .thumb-replace {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 3;
        display: none;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px;
        border-radius: 980px;
        background: rgba(10, 11, 13, 0.46);
        color: #fff;
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        transition:
          opacity 0.2s,
          background 0.18s;
      }
      .led .thumb-tile.filled .thumb-replace {
        display: inline-flex;
      }
      .led .thumb-tile.filled:hover .thumb-replace {
        opacity: 1;
      }
      .led .thumb-replace:hover {
        background: rgba(40, 40, 46, 0.7);
      }
      .led .thumb-hint {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 3;
        display: none;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px;
        border-radius: 980px;
        background: rgba(10, 11, 13, 0.46);
        color: rgba(255, 255, 255, 0.92);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }
      .led .thumb-tile.filled .thumb-hint {
        display: inline-flex;
      }
      .led .thumb-tile.filled:hover .thumb-hint {
        opacity: 1;
      }

      /* ── thumbnail-from-video strip (YouTube-style): an Upload tile plus
         three frames pulled from the processed video. Selected wears the
         accent ring + check. ── */
      .led .tf {
        margin-top: 12px;
      }
      .led .tf-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-2);
        margin-bottom: 8px;
      }
      .led .tf-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      .led .tf-tile {
        position: relative;
        aspect-ratio: 16 / 9;
        border-radius: 10px;
        overflow: hidden;
        padding: 0;
        background: rgba(125, 125, 135, 0.1);
        box-shadow: inset 0 0 0 1px var(--hair);
        cursor: pointer;
        transition:
          box-shadow 0.15s,
          opacity 0.15s;
      }
      .led .tf-tile:disabled {
        cursor: default;
        opacity: 0.6;
      }
      .led .tf-tile:hover:not(:disabled) {
        box-shadow: inset 0 0 0 1px rgba(125, 125, 135, 0.55);
      }
      .led .tf-tile.active {
        box-shadow:
          0 0 0 2px var(--color-ce-accent),
          inset 0 0 0 1px transparent;
      }
      .led .tf-tile img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .led .tf-upload {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        color: var(--text-2);
        font-size: 11.5px;
        font-weight: 600;
      }
      .led .tf-upload:hover:not(:disabled) {
        color: var(--text-1);
      }
      .led .tf-time {
        position: absolute;
        bottom: 5px;
        right: 5px;
        padding: 2px 6px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.72);
        color: #fff;
        font-size: 10.5px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
      .led .tf-check {
        position: absolute;
        top: 5px;
        left: 5px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--color-ce-accent);
        color: #fff;
        display: grid;
        place-items: center;
      }
      .led .tf-spin {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.35);
      }
      .led .tf-spin::after {
        content: '';
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        animation: tf-rot 0.7s linear infinite;
      }
      @keyframes tf-rot {
        to {
          transform: rotate(360deg);
        }
      }

      .led .learn-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 18px;
      }
      .led .learn-row + .learn-row {
        border-top: 1px solid var(--hair);
      }
      .led .learn-row .ck {
        flex: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(125, 125, 135, 0.14);
        color: var(--text-2);
        display: grid;
        place-items: center;
      }
      .led .learn-row input {
        flex: 1;
        font-size: 14.5px;
        font-weight: 500;
      }
      .led .row-x {
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: var(--text-2);
        display: grid;
        place-items: center;
        opacity: 0;
        transition:
          opacity 0.15s,
          background 0.15s;
      }
      .led .learn-row:hover .row-x,
      .led .res-row:hover .row-x {
        opacity: 1;
      }
      .led .row-x:hover {
        background: rgba(125, 125, 135, 0.16);
        color: var(--text);
      }
      .led .add-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 12px 18px;
        border-top: 1px solid var(--hair);
        font-size: 14px;
        font-weight: 600;
        color: var(--blue);
        transition: opacity 0.15s;
      }
      .led .add-row:hover {
        opacity: 0.7;
      }

      .led .res-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 18px;
      }
      .led .res-row + .res-row {
        border-top: 1px solid var(--hair);
      }
      .led .ar-ico {
        flex: none;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: rgba(125, 125, 135, 0.12);
        color: var(--text);
        display: grid;
        place-items: center;
      }
      .led .res-main {
        flex: 1;
        min-width: 0;
      }
      .led .res-n {
        font-size: 14.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .led .res-m {
        font-size: 12.5px;
        color: var(--text-2);
        margin-top: 1px;
      }

      .led .q-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
      }
      .led .q-row + .q-row {
        border-top: 1px solid var(--hair);
      }
      .led .q-main {
        flex: 1;
        min-width: 0;
      }
      .led .q-t {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .led .q-s {
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-2);
        margin-top: 2px;
      }
      .led .sw {
        flex: none;
        position: relative;
        width: 46px;
        height: 28px;
        border-radius: 980px;
        background: rgba(125, 125, 135, 0.32);
        transition: background 0.25s ease;
      }
      .led .sw::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        transition: transform 0.25s cubic-bezier(0.2, 1, 0.3, 1);
      }
      .led .sw.on {
        background: var(--blue);
      }
      .led .sw.on::after {
        transform: translateX(18px);
      }

      .led .auto-cards {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .led .atc {
        background: var(--card);
        border: 1px solid var(--hair);
        border-radius: 16px;
        padding: 16px 18px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition:
          transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1),
          box-shadow 0.2s;
      }
      .led .atc:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      }
      .led .atc-k {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .led .atc-t {
        font-size: 14.5px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .led .atc-s {
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-2);
      }
      .led .atc-badge {
        flex: none;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 3px 8px;
        border-radius: 980px;
        background: rgba(125, 125, 135, 0.14);
        color: var(--text-2);
      }
      .led .atc.new {
        border-style: dashed;
      }
      .led .atc.new .atc-t {
        color: var(--blue);
      }

      @media (max-width: 680px) {
        .led .topbar {
          padding: 12px 16px;
        }
        .led .tb-status {
          display: none;
        }
        .led .page {
          padding: 24px 14px 100px;
        }
        .led .auto-cards {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  )
}
