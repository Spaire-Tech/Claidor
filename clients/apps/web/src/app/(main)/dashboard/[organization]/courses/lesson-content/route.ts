'use server'

import { getAuthenticatedUser } from '@/utils/user'
import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

const courseSystemPrompt = `You are an expert instructional designer writing a single course lesson.
Write the lesson as clear, engaging, pedagogically-sound markdown.

Structure:
- Open with a 1-2 sentence hook that sets context and states what the learner will walk away with.
- Use ## for major section headings and ### for sub-sections. Do NOT put the lesson title as an H1 — it is already rendered by the UI.
- Explain concepts concretely, with examples. Prefer short paragraphs over walls of text.
- Use fenced code blocks with language hints where relevant.
- Use ordered lists for step-by-step instructions, bullets for enumerations.
- End with a short "Key takeaways" bulleted recap (3-5 points).

When the content_type is "video", write a tight video script instead of markdown body:
- Start with a 1-sentence hook to grab attention.
- Use [VISUAL: ...] / [SCREEN: ...] cues in brackets for what the viewer sees.
- Use conversational second-person voice as if speaking to the camera.
- Keep it focused and skimmable. No filler.
- Aim for 300-600 words.

Respond with ONLY the lesson body. No preamble, no meta commentary, no outer quotes.`

const seriesSystemPrompt = `You are a story producer writing the show-notes / companion text for a single episode of a narrative series. The episode is meant to be watched (or listened to), not "completed". You are NOT writing a lesson — you are writing what sits next to a Netflix episode page.

Structure (markdown):
- Open with a single short paragraph (2-4 sentences) that frames what this episode is about, in the creator's world. Specific names, places, moments. No "in this lesson you will learn".
- Optional second paragraph: one piece of context the viewer should hold while watching — a tension, a backstory beat, a question the episode sits inside.
- Optional short bulleted list titled "## What's in this episode" — 3-5 bullets, each a concrete moment or theme, not a learning objective. Each bullet starts with a noun phrase (no instructional verbs).
- Optional "## Mentioned in this episode" list — books, people, places, songs, exact moments the creator references — IF the input gives you enough to ground them. Do NOT invent specifics.

Tone:
- Editorial, restrained, present-tense where natural. No exclamation points, no emojis.
- Avoid every instructional cliché: "learn", "master", "step-by-step", "you'll discover", "by the end of this lesson", "key takeaways".
- Do NOT use the word "lesson". Use "episode".
- No "Key takeaways" recap at the end — this is a watching experience, not a study session.
- Keep total length tight — 150-350 words. Less is fine.

When the content_type is "video", you may instead write a brief shooting note rather than show-notes — a short scene-setter (2-3 sentences) the creator can read before the camera rolls, plus 3-5 bracketed beats they want to hit: [BEAT: ...]. Keep it human, in their voice. 200-400 words.

Respond with ONLY the body. No preamble, no meta commentary, no outer quotes.`

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const {
    courseTitle,
    courseDescription,
    targetAudience,
    moduleTitle,
    lessonTitle,
    contentType,
    format,
  } = await req.json()

  if (!lessonTitle) {
    return new Response('lessonTitle is required', { status: 400 })
  }

  const isSeries = format === 'series'
  const systemPrompt = isSeries ? seriesSystemPrompt : courseSystemPrompt

  const prompt = isSeries
    ? `Write the show-notes / companion text for:

Series: ${courseTitle ?? 'Untitled series'}${
        courseDescription ? `\nSeries description: ${courseDescription}` : ''
      }${targetAudience ? `\nIntended audience: ${targetAudience}` : ''}
Episode title: ${lessonTitle}
Content type: ${contentType ?? 'video'}

Write the episode text now.`
    : `Write the lesson body for:

Course: ${courseTitle ?? 'Untitled course'}${
        courseDescription ? `\nCourse description: ${courseDescription}` : ''
      }${targetAudience ? `\nTarget audience: ${targetAudience}` : ''}
Module: ${moduleTitle ?? ''}
Lesson title: ${lessonTitle}
Content type: ${contentType ?? 'text'}

Write the lesson now.`

  const result = streamText({
    model: anthropic('claude-opus-4-7'),
    system: systemPrompt,
    prompt,
  })

  return result.toTextStreamResponse()
}
