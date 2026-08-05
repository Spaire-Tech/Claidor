import { outlineSchema } from '@/components/Courses/schemas'
import { getAuthenticatedUser } from '@/utils/user'
import { z } from 'zod'

// Streaming generation can run ~40s; give the function room so the platform
// doesn't kill it mid-stream (the "loads forever then fails" symptom).
export const maxDuration = 300
export const runtime = 'nodejs'

// JSON Schema for Anthropic's structured outputs (output_config.format),
// derived from the Zod schema so the two never drift. Computed lazily (NOT
// at module load) and cached — a throw here must never take down the route
// module itself (that 404s the whole endpoint).
let cachedJsonSchema: Record<string, unknown> | null = null
function outlineJsonSchema(): Record<string, unknown> {
  if (cachedJsonSchema) return cachedJsonSchema
  const js = z.toJSONSchema(outlineSchema) as Record<string, unknown>
  delete js['$schema']
  // The Zod schema marks arc/kicker/instructor/faq OPTIONAL so the client's
  // partial-JSON streaming never stalls — but with constrained decoding the
  // model legally OMITS optional fields, which silently dropped the
  // instructor + FAQ sections from generated pages. The API-side schema
  // requires everything the page renders; the client stays lenient.
  js['required'] = ['arc', 'modules', 'instructor', 'faq', 'hero']
  const moduleItems = (
    (js['properties'] as Record<string, unknown> | undefined)?.['modules'] as
      | Record<string, unknown>
      | undefined
  )?.['items'] as Record<string, unknown> | undefined
  if (moduleItems) {
    moduleItems['required'] = ['kicker', 'title', 'description', 'lessons']
  }
  cachedJsonSchema = js
  return js
}

// ─────────────────────────────────────────────────────────────────────────────
// Spaire Original generation. Produces the STRUCTURE (modules/lessons) and all
// the WRITING that the course page renders: each lesson's description + the
// hero block (eyebrow, badge, hero description, instructor credential, title
// break). The field contracts below are derived directly from the course-page
// designs — lengths and registers are not decorative, they're what the layout
// slots can hold.
//
// The cardinal rule for the hero description: the creator's typed description
// is SOURCE MATERIAL, never the output. We synthesise a fresh 1–2 sentence
// hero line from who the instructor is and what the subject is — and we ignore
// the length of their input entirely. A page-long brief becomes one clean line.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_HERO_RULES = `THE HERO BLOCK — written from the inputs, for the top of the page:
- "eyebrow": "<Format> · <Subject>" — e.g. "Documentary Series · Golf", "Course · Persuasive Writing". ≤ 5 words, title case, no period.
- "badge": a short shelf label — Series: "New Series" / "Limited Series" / "Documentary" / "Original Series"; Course: "New Course" / "Masterclass". ≤ 3 words, no period.
- "description": THE most important field. 1–2 sentences, 120–220 characters, that introduce this Original. Lead with WHO the instructor is in one specific phrase, then what the work is. Ground it in their bio (a real credential, place, or number) and the subject. This is NOT the creator's description — if their input is a page long, ignore its length and distil the essence into one cinematic line. Never paste their words. No exclamation points, no clichés ("level up", "unlock", "take your X to the next level").
- "byline": the instructor's credibility in ONE sentence ≤ 90 chars, drawn from the bio (e.g. "Two-time major champion and former world No. 1."). Do NOT prefix with "with" or "— with"; the page adds that.
- "titleLines": the creator's title, VERBATIM, split into 1–2 array entries for a two-line display. Choose a natural break (["The Golfer's", "Blueprint"]); if it's short, return one entry. Do not reword the title.

THE INSTRUCTOR SECTION — written from the creator's instructor details:
- "instructor.sub": ONE credential sentence ≤ 140 chars drawn from their bio — real numbers, titles, places. No marketing adjectives.
- "instructor.bio": EXACTLY 2 paragraphs. This is a POLISH of the creator's own instructor text, NOT a rewrite: keep their facts, their claims, and their voice; reuse their phrases where they work; fix grammar and shape the flow. Paragraph 1 — who they are (the story behind the credential). Paragraph 2 — how they teach THIS course ("In this course, …"). If their input is thin, stay modest: expand on the subject and teaching approach, never invent credentials. 50–90 words per paragraph.

THE FAQ — exactly 5 Q/A pairs in Apple's plain register:
- Ground every answer in THIS course's real facts: what's included (seasons/episodes, the free sample or preview), where to watch (in a web browser on desktop and phone — NEVER on a TV or a streaming device), the experience level (from the audience), access length, and the billing model (one-time vs subscription — use the price context given).
- Questions are a buyer's words ("What's included when I enroll?", "Do I need to be experienced?"). Answers 1–3 sentences, concrete, no hedging, no exclamation points.

HONESTY — never claim a feature that isn't real. The course is watched in a web browser on desktop and phone ONLY; do NOT say it plays on TV, Apple TV, Roku, Chromecast, or any streaming device. Do NOT invent captions/subtitles, downloads, offline viewing, certificates, community/Discord, live calls, coaching, or a mobile app unless the inputs state them. Do not promise specific outcomes or results.

NEVER write the words "Spaire Original" or "Spaire Originals" in ANY field (eyebrow, badge, description, byline, FAQ, or anywhere else). Do not reference a channel or brand name — write only about the creator, the subject, and the work itself.`

const courseSystemPrompt = `You are the lead instructional designer AND editorial writer for Spaire — a premium creator platform whose course pages read like a streaming service, not a Udemy listing. You produce the full structure and copy for ONE course.

STRUCTURE
- Create EXACTLY 4 seasons (returned as the "modules" array) — no more, no fewer. The outline page renders a four-stop timeline; four seasons, a complete arc from first principles to mastery. NEVER use the word "module" in any written copy — the product calls these seasons.
- Each season: a "kicker" (a 1–2 word label naming its role in the arc — "Foundations", "The Engine", "Scoring", "The Mind") and a clear 1–3 word "title" ("The Setup", "The Full Swing", "The Short Game"). Kicker and title must not repeat each other.
- Each season: 3–6 focused lessons. NEVER more than 6 per season — cut or merge before exceeding it.
- ALWAYS: Season 1's FIRST lesson MUST be titled exactly "Meet Your Instructor" with content_type "video". Its description is a warm 80–130 char introduction to WHO the instructor is and why they are the right person to teach this, written strictly from the instructor bio provided — never invented. If no bio was given, keep it about the subject and their approach. Every OTHER lesson teaches the material.
- "arc": one clause completing the sentence "Four seasons, shaped from your answers — {arc}." It MUST name the actual journey of THIS course in its own vocabulary (e.g. for golf: "a clear arc from setup to the shots that decide a round"). Lowercase start, ≤ 90 chars, no period. Never generic ("a journey from beginner to expert").
- Lesson "title": specific and concrete, 2–4 words, works on one line ("Grip & Setup", "Pre-Shot Routine"). Not vague ("Setup"), not a sentence.
- Lesson "description": the instructional register — a fragment, then one sentence. 80–130 characters. Name the concrete skill, move, or mistake. Example shape (do NOT copy the words): "Where every swing begins. The neutral grip, pressure points, and a setup you can repeat under pressure." Every description must be specific to THIS lesson; no two interchangeable.
- "content_type": "video" for demonstrations/walkthroughs (the default), "text" for conceptual or reference lessons.
- Start foundational, progress to application. Tailor depth and examples to the instructor's bio and subject.
- Paywall on: front-load the opening lessons so the free preview earns the purchase. Free: pace evenly, every lesson is core.

${SHARED_HERO_RULES}

Voice: confident, concrete, no marketing fluff. Names of things over abstractions. Return the JSON now and stop.`

// Episodic Originals are stored as a Course with format='series' and a single
// implicit module holding every episode; the UI relabels lessons → episodes.
const seriesSystemPrompt = `You are a story editor AND writer for a premium Spaire Original series — closer to a documentary producer than a course designer. You shape a season the creator can record into the camera, and you write the copy a streaming detail page would carry.

STRUCTURE
- "arc": one clause completing "Six episodes, in order — {arc}", naming THIS season's actual journey in its own vocabulary (e.g. for golf: "a season that builds from the first swing to the round that counts"). Lowercase start, ≤ 90 chars, no period, never generic.
- Return EXACTLY ONE entry in the "modules" array (the season). Its "kicker" is "Season"; its "title" is the season tagline (2–6 words, editorial, NOT "Season 1"); its "description" is one sentence framing the arc.
- Inside it, return EXACTLY 6 "lessons" — the episodes; the outline page renders a six-card grid. Self-contained, no "Episode 1 → 2" dependency, no homework, no quizzes. Let the opening episode plant a thread the final episode pays off.
- ALWAYS: the FIRST episode MUST be titled exactly "Meet Your Instructor" with content_type "video" — the creator introducing themselves (who they are, what they've done, why this story), written strictly from the instructor bio provided, never invented. This is the ONE exception to the story-title rule below. Episodes 2–6 are the season.
- Episode "title" (episodes 2–6): a story title, 2–4 words, evocative and concrete — a moment, place, or stakes ("The Wager", "Eighteen Inches", "Sand"). Never the "How to X" / "5 ways to Y" cadence.
- Episode "description": the narrative register — 1–2 sentences that set a SCENE. Name a place, a moment, a person, the stakes. Example shape (do NOT copy the words): "Pebble Beach, dawn. Jack bets a stranger he can fix any swing in one round — and explains why he always wins." Frame around watching ("Inside…", "A walk through…"), never "you'll learn".
- "content_type": "video" by default; "text" only for a genuinely written piece (a letter, a journal entry).
- No exclamation points. No clichés ("mindset shift", "unlock", "level up"). No instructional verbs ("learn to", "master").
- Tailor everything to the creator's bio: name the sport, the rituals, the opponents, the rounds, the decisions. Series live or die by specificity.
- Paywall on: the first 2–3 episodes must hook on their own — open with the most magnetic, story-driven ones.

${SHARED_HERO_RULES}

Return the JSON now and stop.`

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const {
    title,
    description,
    targetAudience,
    differentiator,
    instructorName,
    instructorBio,
    paywallEnabled,
    freePreviewLessons,
    format,
    // Onboarding choices — each shapes the generation; the wizard passes them.
    trialMode,
    heroVariant,
    lessonCardVariant,
    billingType,
    priceLabel,
    // Masterclass Architect: when the creator picked an evidence-based
    // proposal, it arrives here as the outline's skeleton — the generator
    // polishes it instead of inventing structure from scratch.
    architect,
  } = await req.json()

  if (!title) {
    return new Response('Title is required', { status: 400 })
  }

  const isSeries = format === 'series'
  const systemPrompt = isSeries ? seriesSystemPrompt : courseSystemPrompt
  const unit = isSeries ? 'episode' : 'lesson'

  const lines = [
    `Title (use verbatim): ${title}`,
    // The creator's description is SOURCE MATERIAL for the hero + grounding —
    // never to be echoed verbatim. Flagged as such so the model distils it.
    description
      ? `Creator's brief (SOURCE MATERIAL — distil, never echo verbatim): ${description}`
      : null,
    targetAudience ? `Audience: ${targetAudience}` : null,
    differentiator ? `What makes it different: ${differentiator}` : null,
    instructorName ? `Instructor name (use verbatim): ${instructorName}` : null,
    instructorBio
      ? `Instructor bio (ground the hero description + byline in this): ${instructorBio}`
      : `Instructor bio: (none provided — keep the hero description about the work, not invented credentials)`,
    `Structure: ${
      isSeries
        ? 'limited series — one complete run of self-contained episodes, finished at launch'
        : 'seasons — groups of lessons released on a schedule, watched together'
    }`,
    typeof paywallEnabled === 'boolean'
      ? `Paywall: ${paywallEnabled ? 'enabled' : isSeries ? 'disabled (free series)' : 'disabled (free course)'}`
      : null,
    paywallEnabled &&
    trialMode === 'free_preview' &&
    typeof freePreviewLessons === 'number'
      ? `Trial: free preview — the first ${freePreviewLessons} ${unit}${freePreviewLessons === 1 ? '' : 's'} play in full. Front-load a complete, satisfying opening arc, and make ${unit} ${freePreviewLessons + 1} open the paid arc with a strong hook.`
      : null,
    paywallEnabled && trialMode === 'lesson_sample'
      ? `Trial: lesson sample — prospects see only a short clip from one ${unit}. Design at least one mid-${isSeries ? 'season' : 'course'} ${unit} as a strong standalone showcase to clip from.`
      : null,
    billingType
      ? `Billing: ${billingType === 'subscription' ? `subscription${priceLabel ? ` (${priceLabel})` : ''}` : `one-time purchase${priceLabel ? ` (${priceLabel})` : ''}`}`
      : null,
    heroVariant
      ? `Hero layout: ${
          heroVariant === 'marquee'
            ? 'Marquee — cinematic full-bleed; the title reads like a show name, keep it evocative'
            : 'Cover — editorial; the title carries explanatory weight and breaks across two lines'
        }`
      : null,
    lessonCardVariant
      ? `${isSeries ? 'Episode' : 'Lesson'} cards: ${
          lessonCardVariant === 'spotlight'
            ? `Spotlight — title sits OVER the image; keep each ${unit} title ≤ 4 words so it never wraps`
            : 'Catalog — title + 2-line description sit below the image; the description does real work here'
        }`
      : null,
  ].filter(Boolean)

  // Masterclass Architect skeleton: the proposal's seasons/episodes were
  // derived from the creator's real catalogue (with per-episode footage
  // statuses), so structure-invention rules step aside — the generator's job
  // becomes polish, not architecture.
  const architectProposal = architect?.proposal ?? null
  const architectBlock = architectProposal
    ? `\nARCHITECT PROPOSAL (the skeleton — FOLLOW IT):\nThis outline was derived from the creator's real published catalogue. Reproduce its structure faithfully: one entry in the "modules" array per season (entry title = season title), its episodes as the lessons IN ORDER. Polish titles/descriptions into the register above — never reorder, drop, or invent episodes. Episodes with status "have" or "refilm" are grounded in existing videos (source ids listed) — keep their titles recognizably close to that material; status "film" episodes are new ground. All episodes are content_type "video" unless clearly conceptual.${
        architect?.mirror_pattern
          ? `\nAudience pattern (ground the hero copy in this): ${architect.mirror_pattern}`
          : ''
      }\n${JSON.stringify(architectProposal)}`
    : ''

  const structureRule = architectProposal
    ? 'Reproduce the ARCHITECT PROPOSAL: one season entry in the "modules" array per season, its episodes as lessons, in order. If a season has more than 6 episodes, keep them all anyway — the skeleton wins over the 6-lesson cap.'
    : isSeries
      ? 'Always produce one season entry containing EXACTLY 6 episodes.'
      : 'Always produce EXACTLY 4 seasons in the "modules" array, each with 3–6 lessons (never more than 6).'

  const intro = `${
    isSeries
      ? 'Shape the season and write every field for this Original:'
      : 'Build the course and write every field for this Original:'
  }\n${lines.join('\n')}${architectBlock}\n\nOUTPUT ORDER & COMPLETENESS (critical):\n- Emit "arc" FIRST (one short clause), then the "modules" array fully populated, then "hero", then "instructor" (sub + exactly 2 bio paragraphs, POLISHED from the creator's text — never invented), then "faq" (exactly 5 Q/A pairs) LAST.\n- NEVER return an empty "modules" array. ${structureRule}\n- Every lesson/episode MUST have a non-empty "description"; every season a "kicker".\n\nReturn the JSON object now and stop. Do not add prose after the JSON.`

  // ── Generation via Anthropic's native structured outputs ──────────────────
  // We DON'T use the AI SDK's streamObject here: for claude-opus-4-7 the SDK
  // falls back to a streaming tool-call that intermittently returns nothing
  // (the "outline came back empty / 422" symptom). Anthropic's
  // `output_config.format` (JSON-schema constrained decoding) is reliable —
  // verified at 100% across course + series runs — so we call /v1/messages
  // directly, stream the JSON text deltas, and re-emit them as the same plain
  // text stream the client's useObject already consumes (it accumulates the
  // text and parses partial JSON). The Zod schema is converted to JSON
  // Schema lazily (see outlineJsonSchema).
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[outline] ANTHROPIC_API_KEY is not set')
    return new Response('Generator not configured', { status: 500 })
  }
  // Build the endpoint EXACTLY like @ai-sdk/anthropic does (the provider that
  // already worked in this environment): baseURL defaults to
  // https://api.anthropic.com/v1 (overridable via ANTHROPIC_BASE_URL) and the
  // request goes to `${baseURL}/messages`. Matching this avoids any URL
  // mismatch with whatever gateway/base the deployment is configured for.
  const base = (
    process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'
  ).replace(/\/+$/, '')
  const messagesUrl = `${base}/messages`

  // Don't let a stuck upstream hang the request for minutes — abort well
  // inside the function budget and surface a clean error instead.
  const abort = new AbortController()
  const abortTimer = setTimeout(() => abort.abort(), 240_000)

  let upstream: Response
  try {
    upstream = await fetch(messagesUrl, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 16000,
        system: systemPrompt,
        stream: true,
        output_config: {
          format: { type: 'json_schema', schema: outlineJsonSchema() },
        },
        messages: [{ role: 'user', content: intro }],
      }),
    })
  } catch (err) {
    clearTimeout(abortTimer)
    console.error('[outline] upstream fetch failed:', err)
    return new Response('Generator unavailable', { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(abortTimer)
    const detail = await upstream.text().catch(() => '')
    console.error(
      '[outline] upstream error:',
      upstream.status,
      detail.slice(0, 500),
    )
    return new Response('Generation failed', { status: upstream.status })
  }

  // Pipe the Anthropic SSE stream → a plain text stream of just the JSON text
  // deltas, which is exactly what the client's useObject accumulates and
  // parses. Using pipeThrough(TransformStream) (rather than a hand-pulled
  // ReadableStream) is the idiomatic, backpressure-friendly primitive the
  // runtime/proxy handle cleanly. The final outcome is logged so an empty
  // generation is never silent.
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let jsonText = ''
  let stopReason: string | null = null

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sseBuffer += decoder.decode(chunk, { stream: true })
      let nl: number
      while ((nl = sseBuffer.indexOf('\n')) >= 0) {
        const line = sseBuffer.slice(0, nl)
        sseBuffer = sseBuffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const ev = JSON.parse(payload)
          if (
            ev.type === 'content_block_delta' &&
            ev.delta?.type === 'text_delta' &&
            typeof ev.delta.text === 'string'
          ) {
            jsonText += ev.delta.text
            controller.enqueue(new TextEncoder().encode(ev.delta.text))
          } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
            stopReason = ev.delta.stop_reason
          } else if (ev.type === 'error') {
            console.error('[outline] stream error event:', ev.error)
          }
        } catch {
          /* ignore keepalive / non-JSON lines */
        }
      }
    },
    flush() {
      clearTimeout(abortTimer)
      let moduleCount = 0
      let lessonCount = 0
      try {
        const obj = JSON.parse(jsonText)
        moduleCount = obj?.modules?.length ?? 0
        lessonCount =
          obj?.modules?.reduce(
            (acc: number, m: { lessons?: unknown[] }) =>
              acc + (m.lessons?.length ?? 0),
            0,
          ) ?? 0
      } catch {
        /* partial/invalid — logged as an error below */
      }
      console[moduleCount === 0 ? 'error' : 'log'](
        '[outline] finished:',
        JSON.stringify({
          format: isSeries ? 'series' : 'course',
          moduleCount,
          lessonCount,
          stopReason,
          textLength: jsonText.length,
        }),
      )
    },
  })

  return new Response(upstream.body.pipeThrough(transform), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      // Defeat proxy buffering of the streamed response.
      'x-accel-buffering': 'no',
    },
  })
}
