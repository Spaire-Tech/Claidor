'use server'

import { SHARED_STYLEBOOK } from '@/components/Courses/landing-style'
import { getAuthenticatedUser } from '@/utils/user'
import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

// Per-field rewrite. Inherits the same editorial stylebook the main
// landing generator uses, plus a snapshot of nearby fields, so a rewrite
// holds the original voice instead of dropping into a generic copywriter
// persona.

const REWRITE_SYSTEM = `You are the lead editorial copywriter for Spaire. You are rewriting a single field on a landing page that already exists. Match the voice and lexicon of the surrounding fields — do not introduce a new register.

${SHARED_STYLEBOOK}

Respond with ONLY the rewritten line(s). No quotes around the output. No preamble. No commentary. No markdown.`

type RewriteContext = {
  courseTitle?: string | null
  instructor?: string | null
  lessonTitle?: string | null
  lessonIndex?: number | null
  format?: 'course' | 'series' | null
  // A small snapshot of the surrounding fields the creator can see — the
  // hero tagline, description, instructor pull-quote, etc. Caller picks
  // whichever are relevant; we just paste them as context.
  nearbyFields?: Record<string, string> | null
}

function formatNearby(nearby: RewriteContext['nearbyFields']): string | null {
  if (!nearby) return null
  const entries = Object.entries(nearby).filter(([, v]) => !!v && v.trim())
  if (!entries.length) return null
  return `Surrounding fields (match this voice):\n${entries
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n')}`
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = (await req.json()) as {
    intent?: string
    current?: string
    hint?: string
    kind?: string
    context?: RewriteContext
  }
  const { intent, current, hint, kind, context } = body

  // Only require `current` for generic rewrites; description-style generation
  // can run from scratch as long as we have lesson context.
  if (kind !== 'free_preview_description' && !current) {
    return new Response('current is required', { status: 400 })
  }

  const isSeries = context?.format === 'series'
  const nearbyBlock = formatNearby(context?.nearbyFields)

  let prompt: string
  if (kind === 'free_preview_description') {
    const lines: (string | null)[] = [
      `Task: write a free-preview ${isSeries ? 'episode' : 'lesson'} description for a landing page.`,
      context?.courseTitle
        ? `${isSeries ? 'Series' : 'Course'}: "${context.courseTitle}"`
        : null,
      context?.instructor
        ? `${isSeries ? 'Creator' : 'Instructor'}: ${context.instructor}`
        : null,
      context?.lessonIndex && context?.lessonTitle
        ? `${isSeries ? 'Episode' : 'Lesson'} ${context.lessonIndex}: "${context.lessonTitle}"`
        : context?.lessonTitle
          ? `${isSeries ? 'Episode' : 'Lesson'} title: "${context.lessonTitle}"`
          : null,
      current ? `Current draft: "${current}"` : null,
      nearbyBlock,
      `Style: 1-2 sentences, concrete, grounded in a specific detail from the inputs. No hype. No quotes around the output.`,
      intent ? `Direction: ${intent}` : null,
      ``,
      `Description:`,
    ]
    prompt = lines.filter((l): l is string => l !== null).join('\n')
  } else {
    const lines: (string | null)[] = [
      `Field: ${hint ?? 'landing page copy'}`,
      `Current: "${current}"`,
      nearbyBlock,
      `Goal: ${intent ?? 'Make it punchier, 5-9 words. Ground it in a specific detail from the surrounding fields.'}`,
      ``,
      `Rewrite:`,
    ]
    prompt = lines.filter((l): l is string => l !== null).join('\n')
  }

  const result = streamText({
    model: anthropic('claude-opus-4-7'),
    system: REWRITE_SYSTEM,
    prompt,
  })

  return result.toTextStreamResponse()
}
