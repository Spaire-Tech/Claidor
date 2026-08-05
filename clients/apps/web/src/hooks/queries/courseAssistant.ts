import { getQueryClient } from '@/utils/api/query'
import { useMutation, useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------
// Types — mirror polar/course_assistant/schemas.py. Inlined (not imported
// from @spaire/client) so the dev cycle doesn't need `pnpm generate` for
// every backend tweak — same convention as hooks/queries/community.ts.
// ---------------------------------------------------------------------

export type CourseAssistantStatus =
  | 'building'
  | 'ready_for_review'
  | 'live'
  | 'failed'
  | 'disabled'

export interface CourseAssistantSample {
  id: string
  question: string
  answer: string
  citation: string | null
  scope: string | null
  approved: boolean
  edited_answer: string | null
}

export interface CourseAssistantManage {
  course_id: string
  status: CourseAssistantStatus
  configured: boolean
  live: boolean
  is_answerable: boolean
  has_pending_review: boolean
  display_name: string | null
  disclaimer: string | null
  model: string | null
  error: string | null
  sample_questions: CourseAssistantSample[] | null
  draft_lesson_count: number | null
  draft_tokens: number | null
  draft_built_at: string | null
  approved_at: string | null
  approved_lesson_count: number | null
}

// ---------------------------------------------------------------------

async function creatorFetch<T>(
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

const assistantKey = (courseId: string) =>
  ['course-assistant', courseId] as const

const base = (courseId: string) => `/v1/course-assistant/${courseId}`

// Stash the server-returned manage view so the tab doesn't blink between the
// mutation and the refetch, then invalidate to stay consistent.
function cacheManage(courseId: string, data: CourseAssistantManage) {
  const qc = getQueryClient()
  qc.setQueryData(assistantKey(courseId), data)
  qc.invalidateQueries({ queryKey: assistantKey(courseId) })
}

export const useCourseAssistant = (courseId: string | undefined) =>
  useQuery<CourseAssistantManage>({
    queryKey: assistantKey(courseId ?? ''),
    queryFn: () =>
      creatorFetch<CourseAssistantManage>(`${base(courseId!)}/manage`),
    enabled: !!courseId,
    // While building, poll so the tab flips to Review on its own.
    refetchInterval: (query) =>
      query.state.data?.status === 'building' ? 5000 : false,
  })

export const useApproveAssistant = (courseId: string | undefined) =>
  useMutation({
    mutationFn: (payload: {
      display_name?: string | null
      disclaimer?: string | null
    }) =>
      creatorFetch<CourseAssistantManage>(`${base(courseId!)}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => courseId && cacheManage(courseId, data),
  })

export const useRegenerateAssistant = (courseId: string | undefined) =>
  useMutation({
    mutationFn: () =>
      creatorFetch<CourseAssistantManage>(`${base(courseId!)}/regenerate`, {
        method: 'POST',
      }),
    onSuccess: (data) => courseId && cacheManage(courseId, data),
  })

export const useSetAssistantLive = (courseId: string | undefined) =>
  useMutation({
    mutationFn: (live: boolean) =>
      creatorFetch<CourseAssistantManage>(`${base(courseId!)}/live`, {
        method: 'POST',
        body: JSON.stringify({ live }),
      }),
    onSuccess: (data) => courseId && cacheManage(courseId, data),
  })

export const useUpdateAssistantSettings = (courseId: string | undefined) =>
  useMutation({
    mutationFn: (payload: {
      display_name?: string | null
      disclaimer?: string | null
    }) =>
      creatorFetch<CourseAssistantManage>(`${base(courseId!)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => courseId && cacheManage(courseId, data),
  })

export const useUpdateAssistantSample = (courseId: string | undefined) =>
  useMutation({
    mutationFn: (args: {
      sampleId: string
      answer?: string | null
      approved?: boolean | null
    }) =>
      creatorFetch<CourseAssistantManage>(
        `${base(courseId!)}/samples/${args.sampleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            answer: args.answer,
            approved: args.approved,
          }),
        },
      ),
    onSuccess: (data) => courseId && cacheManage(courseId, data),
  })

// ---------------------------------------------------------------------
// Phase 5 — "What students are asking": creator-facing question insights.
// Aggregated server-side (grouped by normalized text); see the backend
// CourseAssistantQuestionsRead schema.
// ---------------------------------------------------------------------

export interface CourseAssistantQuestionItem {
  question: string
  count: number
  asker_count: number
  refused_count: number
  last_asked_at: string
}

export interface CourseAssistantQuestions {
  total_questions: number
  asker_count: number
  refused_count: number
  items: CourseAssistantQuestionItem[]
}

export const useCourseAssistantQuestions = (courseId: string | undefined) =>
  useQuery<CourseAssistantQuestions>({
    queryKey: ['course-assistant-questions', courseId],
    queryFn: () =>
      creatorFetch<CourseAssistantQuestions>(`${base(courseId!)}/questions`),
    enabled: !!courseId,
    staleTime: 30_000,
  })

// ---------------------------------------------------------------------
// Student side (Phase 4) — the "Ask {name}" chat in the course player.
// Authenticated with the customer-session token (Bearer), same as the
// rest of the portal.
// ---------------------------------------------------------------------

export interface CourseAssistantStudentStatus {
  available: boolean
  // v2: the TA is a neutral "Course TA", not the instructor. These drive the
  // header / empty state / compose suggestions and degrade to sane defaults.
  display_name?: string | null
  course_title?: string | null
  disclaimer?: string | null
  // Empty-state starter prompts and the in-compose suggestion chips.
  starters?: string[] | null
  suggestions?: string[] | null
  // 'course_only' | 'course_plus_general' — informs copy only; the backend
  // enforces it in the prompt.
  strictness?: string | null
  // Legacy v1 fields, still tolerated so an old payload doesn't break parsing.
  instructor_name?: string | null
  example_question?: string | null
}

// A grounded source the TA points back to. v2 maps each citation to a concrete
// lesson so the UI can render "Lesson N · Title · 2:40" and jump to it. The
// Anthropic-citation fields (cited_text / char indices) are kept for the
// snippet + back-compat with the v1 stream.
export interface AskCitation {
  lesson_id?: string | null
  lesson_number?: number | null
  lesson_title?: string | null
  // Human label for the moment cited, e.g. "2:40" or "Start here".
  label?: string | null
  // The second in the video the quote came from, for a deep-link that opens
  // the lesson at that moment. Null when it couldn't be placed.
  seconds?: number | null
  thumbnail_url?: string | null
  cited_text?: string | null
  document_title?: string | null
  start_char_index?: number | null
  end_char_index?: number | null
}

export const useCourseAssistantStatus = (
  courseId: string | undefined,
  token: string | null | undefined,
) =>
  useQuery<CourseAssistantStudentStatus>({
    queryKey: ['course-assistant-status', token, courseId],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${base(courseId!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) return { available: false } as CourseAssistantStudentStatus
      return res.json()
    },
    enabled: !!courseId && !!token,
    staleTime: 60_000,
  })

export interface AskHandlers {
  onText: (chunk: string) => void
  onCitations: (citations: AskCitation[]) => void
  // The answer drew on general subject knowledge (not the course) — the UI
  // shows the labeled "General knowledge" note. Fired at most once per answer.
  onGeneral: () => void
  // Suggested follow-up questions to render as chips under the answer.
  onFollow: (suggestions: string[]) => void
  onRefusal: (message: string) => void
  onError: (message: string) => void
  onDone: () => void
}

/**
 * Stream a grounded answer from the assistant over SSE. EventSource can't do
 * POST + auth header, so we POST and parse the SSE frames off the fetch body.
 * Returns an AbortController so the caller can cancel an in-flight answer.
 */
export function streamAsk(
  courseId: string,
  token: string,
  question: string,
  handlers: AskHandlers,
): AbortController {
  const controller = new AbortController()
  ;(async () => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      handlers.onDone()
    }
    try {
      // POST to the SAME-ORIGIN proxy route (not the cross-origin API). The app
      // origin streams SSE token-by-token; the cross-origin API edge buffers it
      // and delivers the whole answer at once. The route forwards our bearer
      // token to the backend over the internal URL.
      const res = await fetch(`/api/course-assistant/${courseId}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        handlers.onError('The assistant is temporarily unavailable.')
        finish()
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        // The server (sse_starlette) ends SSE lines with CRLF ("\r\n"), so
        // frames are separated by "\r\n\r\n". Normalize CRLF → LF before
        // splitting, otherwise the "\n\n" frame boundary never matches and no
        // event is ever parsed (the answer silently never renders). Done on the
        // whole buffer each pass so a CRLF split across chunks still collapses.
        buffer = buffer.replace(/\r\n/g, '\n')
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          let event = 'message'
          let data = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          let payload: {
            text?: string
            citations?: AskCitation[]
            suggestions?: string[]
            message?: string
          }
          try {
            payload = JSON.parse(data)
          } catch {
            continue
          }
          if (event === 'text') handlers.onText(payload.text ?? '')
          else if (event === 'citations')
            handlers.onCitations(payload.citations ?? [])
          else if (event === 'general') handlers.onGeneral()
          else if (event === 'follow')
            handlers.onFollow(payload.suggestions ?? [])
          else if (event === 'refusal')
            handlers.onRefusal(payload.message ?? '')
          else if (event === 'error')
            handlers.onError(payload.message ?? 'Something went wrong.')
          else if (event === 'done') finish()
        }
      }
      finish()
    } catch {
      if (!controller.signal.aborted) {
        handlers.onError('The assistant is temporarily unavailable.')
      }
      finish()
    }
  })()
  return controller
}
