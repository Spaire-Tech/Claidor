import { getQueryClient } from '@/utils/api/query'
import { useMutation, useQuery } from '@tanstack/react-query'

export type LessonAttachment = {
  id: string
  filename: string
  url: string
  size: number
  content_type: string
  path?: string
}

export type QuizOption = {
  id: string
  text: string
  image_url?: string | null
  is_correct: boolean
  explanation?: string | null
}

export type QuizQuestion = {
  id: string
  text: string
  type: 'multiple_choice' | 'multiple_select' | 'short_answer'
  graded: boolean
  image_url?: string | null
  options: QuizOption[]
}

export type QuizSettings = {
  title?: string
  description?: string | null
  thumbnail_url?: string | null
  passing_grade: number
  send_email_results: boolean
  prevent_complete_without_passing: boolean
  hide_answers_on_results: boolean
}

export type QuizContent = QuizSettings & {
  questions: QuizQuestion[]
  attachments?: LessonAttachment[]
}

export type CourseLessonRead = {
  id: string
  module_id: string
  title: string
  content_type: string
  content:
    | (Record<string, unknown> & {
        text?: string
        attachments?: LessonAttachment[]
      })
    | null
  video_asset_id: string | null
  duration_seconds: number | null
  position: number
  is_free_preview: boolean
  published: boolean
  mux_upload_id: string | null
  mux_asset_id: string | null
  mux_playback_id: string | null
  // Signed (when the org uses signed playback) HLS URL for creator-side
  // playback — the editor's Play button and sample preview use this.
  mux_playback_url?: string | null
  // Signed storyboard VTT for hover-scrub thumbnails in the preview player.
  mux_storyboard_url?: string | null
  mux_status: string | null
  // Course Assistant transcript pipeline state for video lessons:
  // pending | ready | failed | unavailable (null = not started / not a video).
  transcript_status?: string | null
  // AI lesson-draft pipeline state — drives the lesson editor's "AI is
  // drafting your lesson…" banner: pending | done | failed | cancelled
  // (null = not started / not a video).
  ai_autofill_status?: string | null
  thumbnail_url: string | null
  thumbnail_object_position: string | null
  description?: string | null
  comments_mode?: 'visible' | 'hidden' | 'locked'
  release_at?: string | null
  drip_days?: number | null
  created_at: string
  modified_at: string | null
}

export type MuxUploadRead = {
  upload_id: string
  upload_url: string
}

export type CourseModuleRead = {
  id: string
  course_id: string
  title: string
  description: string | null
  position: number
  status: string
  release_at: string | null
  drip_days: number | null
  // Bonus section — renders as the portal's "Bonus Content" rail; its
  // lessons are unnumbered and don't count toward completion.
  is_bonus?: boolean
  lessons: CourseLessonRead[]
  created_at: string
  modified_at: string | null
}

export type CourseFormat = 'course' | 'series'

// Onboarding presentation choices. These are picked in the create-course
// wizard and persisted on the course so the public portal can render the
// chosen hero / lesson-card layout and trial affordance.
export type HeroVariant = 'marquee' | 'cover'
export type LessonCardVariant = 'spotlight' | 'catalog'
export type TrialMode = 'free_preview' | 'lesson_sample'

// Course Assistant strictness. "course_only" keeps the TA strictly on the
// course material; "course_plus_general" (default) lets it fall back to
// Claude's general subject knowledge, clearly labeled as such.
export type AssistantStrictness = 'course_only' | 'course_plus_general'

// Series-only "Episode Sample" block configuration. The creator picks one
// lesson and a window inside it (start_seconds + duration_seconds), and
// the public landing renders an auto-play-on-scroll sub-hero clip of that
// window. duration_seconds is enforced server-side to 5–180s.
//
// On the public landing endpoint, the same payload is enriched with the
// lesson's playback data (mux_playback_id, signed url, title, poster) so
// the player doesn't have to look the lesson up in flatLessons — public
// lessons that aren't free-preview strip their mux_* fields, but the
// sample intentionally bypasses that gate since it's a marketing slice.
export type CourseSample = {
  enabled: boolean
  lesson_id: string
  start_seconds: number
  duration_seconds: number
  // Public-landing-only fields. Absent in dashboard reads — the editor
  // already has full lesson data via course.modules[].lessons.
  lesson_title?: string | null
  thumbnail_url?: string | null
  mux_playback_id?: string | null
  mux_playback_url?: string | null
}

export type CourseRead = {
  id: string
  product_id: string
  organization_id: string
  title: string | null
  slug: string | null
  course_type: string
  format: CourseFormat
  paywall_enabled: boolean
  paywall_lesson_id: string | null
  paywall_position: number | null
  ai_generated: boolean
  // Course Assistant (stateless TA): master switch + how far it may roam.
  assistant_enabled: boolean
  assistant_strictness: AssistantStrictness
  // Onboarding presentation choices — drive the public portal render.
  hero_variant: HeroVariant
  lesson_card_variant: LessonCardVariant
  trial_mode: TrialMode
  description: string | null
  thumbnail_url: string | null
  thumbnail_object_position: string | null
  instructor_name: string | null
  instructor_bio: string | null
  trailer_url: string | null
  instructor_name_italic: boolean
  instructor_name_bold: boolean
  instructor_name_uppercase: boolean
  landing_overrides: LandingOverrides | null
  sample: CourseSample | null
  modules: CourseModuleRead[]
  created_at: string
  modified_at: string | null
}

export type LandingMediaKind = 'image' | 'video'
export type LandingMedia = {
  kind: LandingMediaKind
  url: string
  name?: string
  /**
   * CSS object-position string (e.g. "50% 30%") used when the media is
   * rendered with object-fit: cover. Persisted on the media slot so the
   * same crop applies wherever the slot is shown — landing, mobile view,
   * customer portal.
   */
  objectPosition?: string
}

// Per-element text formatting. Keyed by the same `path` EditText uses, so
// every editable text on the landing can carry its own size + style overrides
// without touching the value of the text itself. All fields are optional —
// when absent, the parent's inline style (the template's intent) wins.
export type LandingTextFormat = {
  // Multiplier on the element's base font-size. 1 = no change.
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export type LandingTheme = {
  fontHeading: string
  fontBody: string
  accentId: string
  surfaceId: string
  typeScale: number
  headingWeight: number
  bodyWeight: number
  headingItalic: boolean
  headingAlign: 'left' | 'center' | 'right'
  headingTracking: number
  headingLeading: number
  density: 'compact' | 'comfortable' | 'spacious'
  cornerStyle: 'sharp' | 'rounded' | 'pill'
  // Global motion intensity for section entry animations. Applied uniformly
  // so the landing feels cohesive — per-section motion mixing tends to look
  // accidental rather than designed. Defaulted in DEFAULT_THEME.
  motion?: 'none' | 'subtle' | 'pronounced'
}

export type LandingOverrides = {
  text?: Record<string, string>
  media?: Record<string, LandingMedia | null>
  visible?: Record<string, boolean>
  order?: string[]
  theme?: Partial<LandingTheme>
  // Per-text-element formatting overrides, keyed by EditText path. Applied
  // on top of the parent component's inline style so the template's intent
  // is preserved when no override exists.
  textFormat?: Record<string, LandingTextFormat>
  // Per-section "extra gap before this section". Keyed by section id. Value
  // is in pixels. Default treatment when missing: 0 (no extra gap, sections
  // stack flush as the template intends). Driven by the inter-section drag
  // handles on the canvas.
  spacingBefore?: Record<string, number>
  // The full AI-generated landing payload, stored here so the human-facing
  // description stays clean.
  ai_landing?: Record<string, unknown> | null
  // AI-synthesised hero copy from generation — distilled from the creator's
  // inputs, never their raw description. Drives the public hero so the page
  // reads like a streaming detail page, not a settings dump.
  ai_hero?: {
    eyebrow?: string | null
    badge?: string | null
    description?: string | null
    byline?: string | null
    titleLines?: string[] | null
    // Custom price note under the hero CTAs (e.g. "Sample clip free ·
    // one-time purchase"). Empty/absent → the computed default.
    free_line?: string | null
  } | null
  // The creator's light/dark choice from onboarding — the public page and
  // portal render in this theme.
  theme_mode?: 'light' | 'dark'
  // Instructor section copy — AI-polished from the creator's instructor
  // details (their facts, cleaned up), editable afterwards. The round
  // avatar comes from the organization; the square portrait is its own
  // uploaded media.
  ai_instructor?: {
    sub?: string | null
    bio?: string[]
    caption?: string | null
  } | null
  portrait_url?: string | null
  // The round instructor avatar. Defaults to the organization avatar; when the
  // creator crops a course-specific one (zoom + reposition), it's stored here.
  instructor_avatar_url?: string | null
  // Focal point (CSS object-position, e.g. "50.0% 30.0%") for the square
  // instructor portrait — set by dragging it in the editor, same convention as
  // the cover. Absent means centred.
  portrait_object_position?: string | null
  // FAQ — AI-written Q/A pairs grounded in the course facts, editable.
  ai_faq?: { q: string; a: string }[] | null
  // The hero band's badge chips ("All Levels", "Self-paced", …) — creator
  // editable; absent means the design defaults.
  badges?: string[] | null
  // Hero title / description container widths, as a percentage (20–100) of
  // the hero's content area. Set from the landing editor's Width control so
  // the creator decides where the headline wraps. Absent → the design's
  // default max-widths. Landing page only (marquee + cover heroes).
  hero_title_width?: number | null
  hero_desc_width?: number | null
  // Mobile-scoped overrides — set from the Landing tab's PHONE canvas and
  // applied ONLY at phone size (≤640px). Desktop edits never touch these,
  // phone edits never touch the desktop fields. Positions inherit the
  // desktop value until a mobile one is set; widths default to the mobile
  // design (full-width, centered) until set.
  hero_title_width_m?: number | null
  hero_desc_width_m?: number | null
  hero_cover_pos_m?: string | null
  portrait_pos_m?: string | null
  lesson_pos_m?: Record<string, string> | null
  // Spaire Title Style key (see components/Courses/titleFonts.ts) — the
  // "movie title" typeface for the hero headline and the course title in
  // the portal hero. Absent → Classic (the design default).
  hero_title_font?: string | null
}

async function courseApiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Surface the server's real reason for a failed course request instead of a
// generic toast. courseApiFetch throws `Error("API <status>: <body>")` where
// the body is a PolarError JSON `{"error", "detail"}` — so a 402 tier-limit
// block ("Your plan allows N lessons per course. Upgrade…") can be shown to
// the creator rather than swallowed. Returns null when there's nothing useful
// to show. Shared by the course editor and the lesson editor.
export function apiErrorDetail(err: unknown): string | null {
  if (!(err instanceof Error) || !err.message) return null
  const m = /^API \d+:\s*(.*)$/s.exec(err.message)
  if (!m) return err.message
  try {
    const parsed = JSON.parse(m[1]) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* not JSON */
  }
  return m[1] || err.message
}

// Raw, non-invalidating PATCH helpers. The landing editor (useLandingEditor)
// drives the course query cache optimistically and manages its own undo/redo,
// so it must NOT trigger the invalidate-on-success that the useUpdateCourse*
// hooks do — a refetch landing mid-edit is exactly the race that used to drop
// edits. These mirror the mutation bodies but leave the cache to the caller.
export type CourseFieldPatch = {
  title?: string | null
  instructor_name?: string | null
  thumbnail_url?: string | null
  trailer_url?: string | null
  thumbnail_object_position?: string | null
  landing_overrides?: LandingOverrides | null
}
export type LessonFieldPatch = {
  title?: string
  description?: string | null
  thumbnail_url?: string | null
  thumbnail_object_position?: string | null
}
export type ModuleFieldPatch = { title?: string }

export const patchCourseRaw = (courseId: string, body: CourseFieldPatch) =>
  courseApiFetch<CourseRead>(`/v1/courses/${courseId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const patchLessonRaw = (lessonId: string, body: LessonFieldPatch) =>
  courseApiFetch<CourseLessonRead>(`/v1/courses/lessons/${lessonId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const patchModuleRaw = (moduleId: string, body: ModuleFieldPatch) =>
  courseApiFetch<CourseModuleRead>(`/v1/courses/modules/${moduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const useCourseById = (courseId: string | undefined) =>
  useQuery<CourseRead>({
    queryKey: ['courses', { courseId }],
    queryFn: () => courseApiFetch<CourseRead>(`/v1/courses/${courseId}`),
    enabled: !!courseId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      // Poll only while something can still resolve. Terminal states
      // (ready / errored / quota_exceeded / deleted) must NOT poll — the
      // old `mux_status !== 'ready'` check kept every failed upload
      // polling every 5 seconds, forever. Uploads abandoned long enough
      // ago are also given up on client-side (the server reconcile job
      // marks them errored on its own schedule).
      const staleCutoff = Date.now() - 3 * 60 * 60 * 1000
      const stillResolving = (l: CourseLessonRead) =>
        (l.mux_status === 'waiting' || l.mux_status === 'processing') &&
        new Date(l.modified_at ?? l.created_at).getTime() > staleCutoff
      const hasPendingMux = data.modules.some((m) =>
        m.lessons.some(stillResolving),
      )
      // Keep polling while a video is still being transcribed for the Course
      // Assistant, so the outline's transcription chip updates live (Mux
      // becomes "ready" before captions exist, so the mux check alone stops
      // too early). Only 'pending' can resolve — anything else is settled.
      const hasPendingTranscript = data.modules.some((m) =>
        m.lessons.some(
          (l) =>
            l.content_type === 'video' &&
            l.mux_status === 'ready' &&
            l.transcript_status === 'pending',
        ),
      )
      // …and while the AI lesson draft is still being written (it runs
      // right after the transcript lands), so the editor's banner resolves
      // and the drafted fields pop in without a manual refresh.
      const hasPendingAutofill = data.modules.some((m) =>
        m.lessons.some(
          (l) =>
            l.content_type === 'video' &&
            l.mux_status === 'ready' &&
            l.ai_autofill_status === 'pending',
        ),
      )
      return hasPendingMux || hasPendingTranscript || hasPendingAutofill
        ? 5000
        : false
    },
  })

export const useCourseByProduct = (productId: string | undefined) =>
  useQuery<CourseRead>({
    queryKey: ['courses', { productId }],
    queryFn: () =>
      courseApiFetch<CourseRead>(`/v1/courses/product/${productId}`),
    enabled: !!productId,
  })

export const useOrganizationCourses = (organizationId: string | undefined) =>
  useQuery<CourseRead[]>({
    queryKey: ['courses', { organizationId }],
    queryFn: () =>
      courseApiFetch<CourseRead[]>(
        `/v1/courses/organization/${organizationId}`,
      ),
    enabled: !!organizationId,
  })

export const useCreateCourse = () =>
  useMutation({
    mutationFn: (body: {
      product_id: string
      organization_id: string
      title?: string | null
      course_type?: string
      format?: CourseFormat
      paywall_enabled?: boolean
      paywall_position?: number | null
      // Onboarding presentation choices — persisted so the portal renders
      // the hero / lesson-card layout and trial affordance the creator picked.
      hero_variant?: HeroVariant
      lesson_card_variant?: LessonCardVariant
      trial_mode?: TrialMode
      // AI-synthesised hero copy from generation (under landing_overrides.ai_hero).
      landing_overrides?: LandingOverrides | null
      ai_generated?: boolean
      description?: string | null
      thumbnail_url?: string | null
      thumbnail_object_position?: string | null
      instructor_name?: string | null
      instructor_bio?: string | null
      trailer_url?: string | null
      instructor_name_italic?: boolean
      instructor_name_bold?: boolean
      instructor_name_uppercase?: boolean
      modules: {
        title: string
        description?: string | null
        position: number
        lessons: {
          title: string
          content_type: string
          position: number
          // Pre-staged uploads from the wizard: when the user picked a
          // file before the lesson row existed we already started the
          // upload, and pass the resulting identifiers here so the
          // lesson is created already pointing at them.
          mux_upload_id?: string | null
          thumbnail_url?: string | null
          description?: string | null
        }[]
      }[]
    }) =>
      courseApiFetch<CourseRead>('/v1/courses/', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })

export const useUpdateCourse = () =>
  useMutation({
    mutationFn: ({
      courseId,
      body,
    }: {
      courseId: string
      body: {
        title?: string | null
        slug?: string | null
        course_type?: string
        format?: CourseFormat
        paywall_enabled?: boolean
        paywall_position?: number | null
        assistant_enabled?: boolean
        assistant_strictness?: AssistantStrictness
        description?: string | null
        thumbnail_url?: string | null
        thumbnail_object_position?: string | null
        instructor_name?: string | null
        instructor_bio?: string | null
        trailer_url?: string | null
        instructor_name_italic?: boolean
        instructor_name_bold?: boolean
        instructor_name_uppercase?: boolean
        landing_overrides?: LandingOverrides | null
        sample?: CourseSample | null
      }
    }) =>
      courseApiFetch<CourseRead>(`/v1/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: data.id }],
      })
    },
  })

export const useAddCourseModule = () =>
  useMutation({
    mutationFn: ({
      courseId,
      body,
    }: {
      courseId: string
      body: { title: string; description?: string | null; position: number }
    }) =>
      courseApiFetch<CourseModuleRead>(`/v1/courses/${courseId}/modules`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })

export const useUpdateCourseModule = () =>
  useMutation({
    mutationFn: ({
      moduleId,
      body,
    }: {
      moduleId: string
      body: {
        title?: string
        description?: string | null
        position?: number
        status?: string
        release_at?: string | null
        drip_days?: number | null
        is_bonus?: boolean
      }
    }) =>
      courseApiFetch<CourseModuleRead>(`/v1/courses/modules/${moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  })

export const useDeleteCourseModule = () =>
  useMutation({
    mutationFn: (moduleId: string) =>
      courseApiFetch<void>(`/v1/courses/modules/${moduleId}`, {
        method: 'DELETE',
      }),
  })

export const useAddCourseLesson = () =>
  useMutation({
    mutationFn: ({
      moduleId,
      body,
    }: {
      moduleId: string
      body: {
        title: string
        content_type: string
        position: number
        is_free_preview?: boolean
      }
    }) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/modules/${moduleId}/lessons`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),
  })

export const useUpdateCourseLesson = () =>
  useMutation({
    mutationFn: ({
      lessonId,
      body,
    }: {
      lessonId: string
      body: {
        title?: string
        // Move the lesson to another module of the same course (the
        // outline's cross-season drag).
        module_id?: string
        description?: string | null
        content_type?: string
        content?: Record<string, unknown> | null
        video_asset_id?: string | null
        duration_seconds?: number | null
        position?: number
        is_free_preview?: boolean
        published?: boolean
        release_at?: string | null
        drip_days?: number | null
        thumbnail_url?: string | null
        thumbnail_object_position?: string | null
        comments_mode?: 'visible' | 'hidden' | 'locked'
      }
    }) =>
      courseApiFetch<CourseLessonRead>(`/v1/courses/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateCourseQueries,
  })

export const useDeleteCourseLesson = () =>
  useMutation({
    mutationFn: (lessonId: string) =>
      courseApiFetch<void>(`/v1/courses/lessons/${lessonId}`, {
        method: 'DELETE',
      }),
  })

export const useReorderModules = () =>
  useMutation({
    mutationFn: ({
      courseId,
      orderedIds,
    }: {
      courseId: string
      orderedIds: string[]
    }) =>
      courseApiFetch<CourseRead>(`/v1/courses/${courseId}/modules/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
  })

export type CourseEnrollmentProgress = {
  total_lessons: number
  completed_lessons: number
  // Lessons with a recorded partial watch position (started, not finished).
  started_lessons: number
  completion_percent: number
  last_active_at: string | null
}

export type CourseEnrollmentRead = {
  id: string
  customer_id: string
  enrolled_at: string
  customer: {
    id: string
    email: string
    name: string | null
    avatar_url: string | null
  } | null
  progress: CourseEnrollmentProgress | null
}

type EnrollmentsListResource = {
  items: CourseEnrollmentRead[]
  pagination: { page: number; total_count: number }
}

const enrollmentsPath = (
  courseId: string,
  page: number,
  limit: number,
  query?: string,
) =>
  `/v1/courses/${courseId}/enrollments?page=${page}&limit=${limit}` +
  (query ? `&query=${encodeURIComponent(query)}` : '')

export const useCourseEnrollments = (
  courseId: string | undefined,
  options?: { page?: number; limit?: number; query?: string },
) => {
  const page = options?.page ?? 1
  const limit = options?.limit ?? 50
  const query = options?.query?.trim() || undefined
  return useQuery<EnrollmentsListResource>({
    queryKey: ['course-enrollments', courseId, page, limit, query ?? ''],
    queryFn: () =>
      courseApiFetch<EnrollmentsListResource>(
        enrollmentsPath(courseId!, page, limit, query),
      ),
    enabled: !!courseId,
    // Keep the previous page on screen while the next one loads so
    // paginating / typing a search doesn't flash the empty state.
    placeholderData: (prev) => prev,
  })
}

// Every enrollment for a course, walking all pages. Used by the CSV export
// so students beyond the first page aren't silently dropped. Page 1 tells
// us the total; the remaining pages are fetched in parallel.
export const fetchAllCourseEnrollments = async (
  courseId: string,
  query?: string,
): Promise<CourseEnrollmentRead[]> => {
  const limit = 100
  const q = query?.trim() || undefined
  const first = await courseApiFetch<EnrollmentsListResource>(
    enrollmentsPath(courseId, 1, limit, q),
  )
  const totalPages = Math.ceil(first.pagination.total_count / limit)
  if (totalPages <= 1) return first.items
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      courseApiFetch<EnrollmentsListResource>(
        enrollmentsPath(courseId, i + 2, limit, q),
      ),
    ),
  )
  return [...first.items, ...rest.flatMap((r) => r.items)]
}

export const useRevokeCourseEnrollment = (courseId: string | undefined) =>
  useMutation({
    mutationFn: (enrollmentId: string) =>
      courseApiFetch<void>(
        `/v1/courses/${courseId}/enrollments/${enrollmentId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['course-enrollments', courseId],
      })
    },
  })

export const useReorderLessons = () =>
  useMutation({
    mutationFn: ({
      moduleId,
      orderedIds,
    }: {
      moduleId: string
      orderedIds: string[]
    }) =>
      courseApiFetch<CourseModuleRead>(
        `/v1/courses/modules/${moduleId}/lessons/reorder`,
        {
          method: 'POST',
          body: JSON.stringify({ ordered_ids: orderedIds }),
        },
      ),
  })

// --- Customer portal (learner side) ---

export type CustomerCourseEnrollment = {
  enrollment_id: string
  enrolled_at: string
  course: {
    id: string
    title: string | null
    course_type: string
    module_count: number
    lesson_count: number
    thumbnail_url: string | null
    thumbnail_object_position: string | null
    total_duration_seconds: number
    // The creator's landing theme — drives portal-wide dark mode.
    theme_mode?: 'light' | 'dark'
  }
  progress: {
    total_lessons: number
    completed_lessons: number
    completion_percent: number
  }
  completed_at: string | null
}

export type CustomerLessonRead = {
  id: string
  title: string
  content_type: string
  content:
    | (Record<string, unknown> & {
        text?: string
        attachments?: LessonAttachment[]
        questions?: QuizQuestion[]
        passing_grade?: number
        hide_answers_on_results?: boolean
      })
    | null
  position: number
  duration_seconds: number | null
  is_free_preview: boolean
  mux_playback_id: string | null
  mux_playback_url?: string | null
  mux_status: string | null
  thumbnail_url: string | null
  thumbnail_object_position?: string | null
  completed: boolean
  description?: string | null
  comments_mode?: 'visible' | 'hidden' | 'locked'
  locked?: boolean
  locked_until?: string | null
}

export type CustomerModuleRead = {
  id: string
  title: string
  description: string | null
  position: number
  locked: boolean
  locked_until: string | null
  is_bonus?: boolean
  lessons: CustomerLessonRead[]
}

export type CustomerCourseProgress = {
  total_lessons: number
  completed_lessons: number
  completion_percent: number
  completed: Record<string, string>
  // lesson_id -> partial watch position (fraction 0..1) for lessons the
  // student has started but not completed. Server-side twin of the
  // per-device localStorage store, so progress survives closing the tab.
  positions?: Record<string, number>
}

export type CustomerCourseDetail = {
  enrollment_id: string
  enrolled_at: string
  customer_name: string | null
  customer_avatar_url: string | null
  progress: CustomerCourseProgress
  course: {
    id: string
    title: string | null
    description: string | null
    thumbnail_url: string | null
    thumbnail_object_position?: string | null
    instructor_name?: string | null
    instructor_bio?: string | null
    trailer_url?: string | null
    instructor_name_italic?: boolean
    instructor_name_bold?: boolean
    instructor_name_uppercase?: boolean
    course_type: string
    format?: CourseFormat
    paywall_enabled: boolean
    paywall_position: number | null
    hero_variant?: HeroVariant
    lesson_card_variant?: LessonCardVariant
    trial_mode?: TrialMode
    landing_overrides?: LandingOverrides | null
    modules: CustomerModuleRead[]
    lessons?: CustomerLessonRead[]
  }
}

export type CourseLandingLesson = {
  id: string
  module_id?: string
  title: string
  description: string | null
  content_type: string
  position: number
  is_free_preview: boolean
  duration_seconds: number | null
  thumbnail_url: string | null
  // Creator-set crop (CSS object-position, e.g. "50% 30%") for the card
  // thumbnail. The landing endpoint has always sent this; it just wasn't
  // declared here, so the public page silently dropped it.
  thumbnail_object_position?: string | null
  mux_playback_id?: string | null
  mux_status?: string | null
  locked?: boolean
  locked_until?: string | null
  completed?: boolean
}

export type CourseLandingPageData = {
  id: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  thumbnail_object_position?: string | null
  instructor_name?: string | null
  instructor_bio?: string | null
  trailer_url?: string | null
  instructor_name_italic?: boolean
  instructor_name_bold?: boolean
  instructor_name_uppercase?: boolean
  course_type: string
  format?: CourseFormat
  hero_variant?: HeroVariant
  lesson_card_variant?: LessonCardVariant
  trial_mode?: TrialMode
  lesson_count: number
  total_duration_seconds: number
  lessons: CourseLandingLesson[]
  modules?: {
    id: string
    title: string
    description?: string | null
    position: number
  }[]
  paywall_enabled?: boolean
  paywall_position?: number | null
  has_access: boolean
  // Carries ai_hero (the synthesised hero copy from generation) and any
  // human edits. The public hero prefers ai_hero over the raw description.
  landing_overrides?: LandingOverrides | null
  // Series "Episode Sample" payload — present only when configured AND the
  // mux asset is ready to play.
  sample?: {
    enabled: boolean
    lesson_id: string
    start_seconds: number
    duration_seconds: number
    lesson_title: string | null
    thumbnail_url: string | null
    mux_playback_id: string | null
    mux_playback_url: string | null
  } | null
}

async function portalApiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const useCustomerCourses = (token: string | null | undefined) =>
  useQuery<CustomerCourseEnrollment[]>({
    queryKey: ['customer-courses', token],
    queryFn: () =>
      portalApiFetch<CustomerCourseEnrollment[]>(
        '/v1/customer-portal/courses/',
        token!,
      ),
    enabled: !!token,
    // Always re-check on mount and refocus so a course bought via a recent
    // checkout shows up immediately after the customer lands back here.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

export const useCustomerCourse = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useQuery<CustomerCourseDetail>({
    queryKey: ['customer-courses', token, courseId],
    queryFn: () =>
      portalApiFetch<CustomerCourseDetail>(
        `/v1/customer-portal/courses/${courseId}`,
        token!,
      ),
    enabled: !!token && !!courseId,
  })

export const useCreateMuxUpload = () =>
  useMutation({
    mutationFn: (lessonId: string) =>
      courseApiFetch<MuxUploadRead>(
        `/v1/courses/lessons/${lessonId}/mux-upload`,
        {
          method: 'POST',
        },
      ),
    // The server flips the lesson to `mux_status='waiting'` the moment
    // this endpoint runs. Invalidate immediately so the dashboard sees
    // the new status (and the polling loop kicks in) instead of holding
    // onto a stale 'ready' state while the upload is still in flight —
    // without this, replace-video on a previously-ready lesson briefly
    // shows the old video and no progress UI between XHR finishing and
    // the next ambient refetch.
    onSuccess: invalidateCourseQueries,
  })

// "I'll write it myself": stop the AI from auto-filling this lesson's
// details. Only the autofill is cancelled — the transcript keeps
// generating for captions and the Course Assistant.
export const useCancelLessonAiAutofill = () =>
  useMutation({
    mutationFn: (lessonId: string) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/lessons/${lessonId}/ai-autofill/cancel`,
        { method: 'POST' },
      ),
    onSuccess: invalidateCourseQueries,
  })

// Rewrite one editor section from the lesson's video transcript.
// "details" → title + description; "overview" → overview note + takeaways.
// Overwrites that section — only offered once the transcript is ready.
export const useRewriteLessonAi = () =>
  useMutation({
    mutationFn: ({
      lessonId,
      section,
    }: {
      lessonId: string
      section: 'details' | 'overview'
    }) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/lessons/${lessonId}/ai-rewrite`,
        { method: 'POST', body: JSON.stringify({ section }) },
      ),
    onSuccess: invalidateCourseQueries,
  })

export const useRemoveLessonVideo = () =>
  useMutation({
    mutationFn: (lessonId: string) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/lessons/${lessonId}/video`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidateCourseQueries,
  })

// Wizard-only: create a Mux direct upload that isn't attached to a lesson
// yet. Returned upload_id later rides on CourseLessonCreate.mux_upload_id
// so the webhook can attach the Mux asset once it finishes processing.
export const useStageMuxUpload = () =>
  useMutation({
    mutationFn: (organizationId: string) =>
      courseApiFetch<MuxUploadRead>(
        `/v1/courses/staging/mux-upload?organization_id=${organizationId}`,
        { method: 'POST' },
      ),
  })

// Wizard-only: upload an image / video to S3 before the course exists.
// Returns {url, kind}; the URL is passed into the course-create payload.
export const useStageOrgMedia = () =>
  useMutation({
    mutationFn: async ({
      organizationId,
      file,
    }: {
      organizationId: string
      file: File
    }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/staging/media?organization_id=${organizationId}`,
        { method: 'POST', body: form, credentials: 'include' },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<{ url: string; kind: 'image' | 'video' }>
    },
  })

export const usePreviewAccess = () =>
  useMutation({
    mutationFn: (courseId: string) =>
      courseApiFetch<{ token: string; portal_url: string }>(
        `/v1/courses/${courseId}/preview-access`,
        { method: 'POST' },
      ),
  })

export const useUploadLessonThumbnail = () =>
  useMutation({
    mutationFn: async ({
      lessonId,
      file,
    }: {
      lessonId: string
      file: File
    }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/lessons/${lessonId}/thumbnail`,
        { method: 'POST', body: form, credentials: 'include' },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<CourseLessonRead>
    },
    onSuccess: invalidateCourseQueries,
  })

// YouTube-style thumbnail-from-video: the server grabs the frame at the
// requested timestamp from the lesson's processed video and stores it as
// the thumbnail (same S3 pipeline as an uploaded image).
export const useSetLessonThumbnailFromVideo = () =>
  useMutation({
    mutationFn: ({
      lessonId,
      timeSeconds,
    }: {
      lessonId: string
      timeSeconds: number
    }) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/lessons/${lessonId}/thumbnail/from-video`,
        {
          method: 'POST',
          body: JSON.stringify({ time_seconds: timeSeconds }),
        },
      ),
    onSuccess: invalidateCourseQueries,
  })

export const useUploadCourseThumbnail = () =>
  useMutation({
    mutationFn: async ({
      courseId,
      file,
    }: {
      courseId: string
      file: File
    }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/${courseId}/thumbnail`,
        { method: 'POST', body: form, credentials: 'include' },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<CourseRead>
    },
    onSuccess: (data) => {
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: data.id }],
      })
    },
  })

export const useUploadLandingMedia = () =>
  useMutation({
    mutationFn: async ({
      courseId,
      file,
    }: {
      courseId: string
      file: File
    }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/${courseId}/landing-media`,
        { method: 'POST', body: form, credentials: 'include' },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<{ url: string; kind: 'image' | 'video' }>
    },
  })

// Multipart upload over XMLHttpRequest instead of fetch(): fetch cannot
// report request-body progress, so a large file (a 500 MB trailer) gave
// the UI nothing but a spinner. XHR exposes `upload.onprogress`, which we
// forward to `onProgress` so callers can render a real percentage. Errors
// mirror courseApiFetch's `API <status>: <body>` shape so apiErrorDetail()
// can surface the server's message.
export function uploadFileWithProgress<T>(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress)
        onProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(
            xhr.responseText
              ? (JSON.parse(xhr.responseText) as T)
              : (undefined as T),
          )
        } catch {
          reject(new Error('Invalid server response'))
        }
      } else {
        reject(new Error(`API ${xhr.status}: ${xhr.responseText ?? ''}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(form)
  })
}

export const useUploadCourseTrailer = () =>
  useMutation({
    mutationFn: ({
      courseId,
      file,
      onProgress,
    }: {
      courseId: string
      file: File
      // Called with 0–100 as the file uploads, so the editor can show a
      // real progress bar instead of an indefinite "Uploading…".
      onProgress?: (pct: number) => void
    }) =>
      uploadFileWithProgress<CourseRead>(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/${courseId}/trailer`,
        file,
        onProgress,
      ),
    onSuccess: (data) => {
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: data.id }],
      })
    },
  })

const invalidateCourseQueries = () => {
  getQueryClient().invalidateQueries({ queryKey: ['courses'] })
}

export const useUploadLessonAttachment = () =>
  useMutation({
    mutationFn: async ({
      lessonId,
      file,
    }: {
      lessonId: string
      file: File
    }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/lessons/${lessonId}/attachments`,
        { method: 'POST', body: form, credentials: 'include' },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<CourseLessonRead>
    },
    onSuccess: invalidateCourseQueries,
  })

export const useDeleteLessonAttachment = () =>
  useMutation({
    mutationFn: ({
      lessonId,
      attachmentId,
    }: {
      lessonId: string
      attachmentId: string
    }) =>
      courseApiFetch<CourseLessonRead>(
        `/v1/courses/lessons/${lessonId}/attachments/${attachmentId}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidateCourseQueries,
  })

export type QuizAttemptResult = {
  score: number
  passed: boolean
  passing_grade: number
  total_questions: number
  correct_count: number
  answers: {
    question_id: string
    correct: boolean
    correct_option_ids: string[]
    explanations: Record<string, string>
  }[]
}

export const useSubmitQuizAttempt = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useMutation({
    mutationFn: ({
      lessonId,
      answers,
    }: {
      lessonId: string
      answers: { question_id: string; selected_option_ids: string[] }[]
    }) =>
      portalApiFetch<QuizAttemptResult>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/quiz-attempt`,
        token!,
        { method: 'POST', body: JSON.stringify({ answers }) },
      ),
    onSuccess: () => {
      // Broad prefix on purpose: the courses LIST key
      // (['customer-courses', token]) powers the Overview page's stats and
      // Continue rail — a courseId-scoped key never matches it.
      getQueryClient().invalidateQueries({
        queryKey: ['customer-courses', token],
      })
    },
  })

export const useMarkLessonComplete = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useMutation({
    mutationFn: (lessonId: string) =>
      portalApiFetch<void>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/complete`,
        token!,
        { method: 'POST' },
      ),
    onSuccess: () => {
      // Broad prefix — refreshes the course detail AND the Overview page's
      // courses list (see submit-quiz above).
      getQueryClient().invalidateQueries({
        queryKey: ['customer-courses', token],
      })
    },
  })

// Wipe ALL of the customer's progress in a course — completions and
// partial watch positions — so they start from zero. The caller also
// clears the per-device localStorage mirror (spaire_watch:{courseId}).
export const useResetCourseProgress = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useMutation({
    mutationFn: () =>
      portalApiFetch<void>(
        `/v1/customer-portal/courses/${courseId}/progress`,
        token!,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      // Broad prefix — the Overview page's stats/Continue rail read the
      // courses LIST key (['customer-courses', token]), which a
      // courseId-scoped invalidation never matches.
      getQueryClient().invalidateQueries({
        queryKey: ['customer-courses', token],
      })
    },
  })

// Persist a partial watch position for a video lesson. Fire-and-forget
// from the player's throttled progress callback — no cache invalidation,
// the local watchState already reflects the position. A plain function
// (not a mutation) with keepalive so the same call also works from
// pagehide/unmount, when React Query mutations can no longer run.
export const postWatchProgress = (
  token: string,
  courseId: string,
  lessonId: string,
  fraction: number,
): void => {
  try {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/watch-progress`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fraction }),
        keepalive: true,
      },
    ).catch(() => {})
  } catch {
    /* fire-and-forget — the position is still in localStorage */
  }
}

// Mint a signed Mux playback URL for a lesson. Called when the player
// transitions to "playing" so the server can enforce the
// video_views_monthly quota and count the view. The course-read
// response intentionally no longer inlines the URL — bypassing this
// endpoint would also bypass quota enforcement.
export type LessonPlaybackUrlResponse = {
  mux_playback_id: string | null
  mux_playback_url: string | null
  // Signed storyboard VTT for hover-scrub thumbnails (absent/null when
  // the asset has no storyboard).
  mux_storyboard_url?: string | null
}

export const useMintLessonPlaybackUrl = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useMutation<LessonPlaybackUrlResponse, Error, string>({
    mutationFn: (lessonId: string) =>
      portalApiFetch<LessonPlaybackUrlResponse>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/playback-url`,
        token!,
        { method: 'POST' },
      ),
  })

// --- Lesson comments (customer portal) ---

export type LessonCommentRead = {
  id: string
  lesson_id: string
  parent_id: string | null
  content: string
  created_at: string
  is_own: boolean
  author: {
    enrollment_id: string
    name: string | null
    avatar_url?: string | null
    // The course's instructor — drives the badge next to the name.
    is_instructor?: boolean
  }
  // Hearts — total count + whether the requesting customer has liked it.
  likes?: number
  liked?: boolean
  // Instructor moderation (YouTube-style): a pinned comment sorts to the
  // top; instructor_hearted is the single creator heart.
  pinned?: boolean
  instructor_hearted?: boolean
  // True when the REQUESTING customer is the instructor — shows the
  // pin / heart / delete-any controls.
  viewer_is_instructor?: boolean
  // Soft-deleted parents come back as tombstones so their replies stay in
  // the tree. The frontend renders them as "Comment deleted" placeholders.
  deleted?: boolean
}

export const useLessonComments = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useQuery<LessonCommentRead[]>({
    queryKey: ['lesson-comments', token, courseId, lessonId],
    queryFn: () =>
      portalApiFetch<LessonCommentRead[]>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments`,
        token!,
      ),
    enabled: !!token && !!courseId && !!lessonId,
  })

export const useCreateLessonComment = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (body: { content: string; parent_id?: string | null }) =>
      portalApiFetch<LessonCommentRead>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments`,
        token!,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['lesson-comments', token, courseId, lessonId],
      })
    },
  })

// Toggle a heart on a lesson comment. The server flips the like for the
// requesting customer (one per customer — no double-likes) and returns the
// new count + state, which we write straight into the cached comment list.
export const useLikeLessonComment = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (commentId: string) =>
      portalApiFetch<{ liked: boolean; likes: number }>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments/${commentId}/like`,
        token!,
        { method: 'POST' },
      ),
    onSuccess: (res, commentId) => {
      getQueryClient().setQueryData<LessonCommentRead[]>(
        ['lesson-comments', token, courseId, lessonId],
        (prev) =>
          prev?.map((c) =>
            c.id === commentId
              ? { ...c, liked: res.liked, likes: res.likes }
              : c,
          ),
      )
    },
  })

export const useDeleteLessonComment = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (commentId: string) =>
      portalApiFetch<void>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments/${commentId}`,
        token!,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['lesson-comments', token, courseId, lessonId],
      })
    },
  })

// Instructor-only: pin/unpin a comment (at most one pinned per lesson —
// the server unpins siblings) and the single creator heart. Both write the
// fresh state straight into the cached list.
export const usePinLessonComment = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (commentId: string) =>
      portalApiFetch<{ pinned: boolean }>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments/${commentId}/pin`,
        token!,
        { method: 'POST' },
      ),
    onSuccess: (res, commentId) => {
      getQueryClient().setQueryData<LessonCommentRead[]>(
        ['lesson-comments', token, courseId, lessonId],
        (prev) =>
          prev?.map((c) =>
            c.id === commentId
              ? { ...c, pinned: res.pinned }
              : // Single-pin semantics: pinning one unpins the rest.
                res.pinned
                ? { ...c, pinned: false }
                : c,
          ),
      )
    },
  })

export const useInstructorHeartComment = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (commentId: string) =>
      portalApiFetch<{ hearted: boolean }>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/comments/${commentId}/instructor-heart`,
        token!,
        { method: 'POST' },
      ),
    onSuccess: (res, commentId) => {
      getQueryClient().setQueryData<LessonCommentRead[]>(
        ['lesson-comments', token, courseId, lessonId],
        (prev) =>
          prev?.map((c) =>
            c.id === commentId ? { ...c, instructor_hearted: res.hearted } : c,
          ),
      )
    },
  })

// ── Notes ────────────────────────────────────────────────────────────────

export interface CourseNoteRead {
  id: string
  lesson_id: string
  content: string
  created_at: string
  modified_at: string | null
}

// Single fetch of every note in the course; per-lesson selection happens
// client-side via useLessonNote. Previously each lesson had its own
// query that re-downloaded the whole notes collection on every mount.
const courseNotesQueryKey = (
  token: string | null | undefined,
  courseId: string | undefined,
) => ['course-notes', token, courseId]

export const useCourseNotes = (
  token: string | null | undefined,
  courseId: string | undefined,
) =>
  useQuery<CourseNoteRead[]>({
    queryKey: courseNotesQueryKey(token, courseId),
    queryFn: () =>
      portalApiFetch<CourseNoteRead[]>(
        `/v1/customer-portal/courses/${courseId}/notes`,
        token!,
      ),
    enabled: !!token && !!courseId,
  })

export const useLessonNote = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) => {
  const { data, isLoading } = useCourseNotes(token, courseId)
  const note =
    data && lessonId
      ? (data.find((n) => n.lesson_id === lessonId) ?? null)
      : null
  return { data: data ? note : undefined, isLoading }
}

export const useUpsertLessonNote = (
  token: string | null | undefined,
  courseId: string | undefined,
  lessonId: string | null | undefined,
) =>
  useMutation({
    mutationFn: (content: string) =>
      portalApiFetch<CourseNoteRead>(
        `/v1/customer-portal/courses/${courseId}/lessons/${lessonId}/notes`,
        token!,
        { method: 'PUT', body: JSON.stringify({ content }) },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: courseNotesQueryKey(token, courseId),
      })
    },
  })
