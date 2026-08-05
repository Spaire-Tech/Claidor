import { z } from 'zod'

// Generation output for a Spaire Original. Two halves:
//   • modules/lessons — the STRUCTURE + per-item COPY (title + description).
//   • hero — the presentation copy for the top of the course page, written
//     FROM the creator's inputs (never their raw description verbatim).
// Modules come first so the visible outline streams first; the hero block
// fills in after. Arrays/strings are intentionally unbounded — strict
// cardinality stalls useObject on streamed partial JSON; the prompt enforces
// counts and lengths instead.
export const outlineSchema = z.object({
  // One clause for the outline header's subtitle: "Four modules, shaped from
  // your answers — {arc}." Written from the course's subject (e.g. "a clear
  // arc from setup to the shots that decide a round"). Streams first so the
  // header fills in immediately. Optional so partial JSON never stalls.
  arc: z.string().optional(),
  modules: z.array(
    z.object({
      // 1–2 word chapter label shown above the module title on the outline
      // timeline ("Foundations", "The Engine", "Scoring", "The Mind").
      kicker: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      lessons: z.array(
        z.object({
          title: z.string(),
          content_type: z.enum(['text', 'video']),
          // The AI writes this — a real lesson/episode description, not a
          // placeholder. Register depends on structure (instructional for
          // modules, scene-grounded narrative for episodic).
          description: z.string(),
        }),
      ),
    }),
  ),
  // Instructor section copy. "sub" is a one-line credential; "bio" is
  // EXACTLY two paragraphs POLISHED from the creator's own instructor text —
  // their facts and voice, cleaned up, never invented. Optional so partial
  // JSON never stalls.
  instructor: z
    .object({
      sub: z.string(),
      bio: z.array(z.string()),
    })
    .optional(),
  // FAQ — five Q/A pairs grounded in the course's real facts (pricing,
  // trial, structure, access).
  faq: z
    .array(
      z.object({
        q: z.string(),
        a: z.string(),
      }),
    )
    .optional(),
  // Hero presentation copy — what the course-page hero renders.
  hero: z.object({
    // "Documentary Series · Golf" — format · subject, ≤ 5 words.
    eyebrow: z.string(),
    // "New Series" / "New Course" / "Documentary" — ≤ 3 words.
    badge: z.string(),
    // 1–2 sentences synthesised from instructor + subject. NOT the raw
    // creator description; distil the essence regardless of input length.
    description: z.string(),
    // One credential sentence ≤ 90 chars (no "— with" prefix; UI adds it).
    byline: z.string(),
    // The creator's title split across 1–2 lines for the Cover hero's
    // balance wrap. Verbatim words — only the break is chosen.
    titleLines: z.array(z.string()),
  }),
})

export type CourseOutline = z.infer<typeof outlineSchema>

// The full landing page is AI-generated. The UI only renders structure
// (layout, colors, typography) — every string below comes from the model.
//
// IMPORTANT: array fields are NOT bounded with min/max here on purpose. The
// `useObject` hook only fires onFinish once Zod validates the streamed JSON;
// strict cardinality on a streaming partial commonly stalls it. Cardinality
// is enforced in the prompt instead.
export const landingSchema = z.object({
  // Hero
  eyebrow: z.string(),
  series_label: z.string(),
  tagline: z.string(),
  description: z.string(),
  level: z.string(),

  // Value strip
  value_props_label: z.string(),
  value_props: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    }),
  ),

  // Curriculum
  curriculum_label: z.string(),
  curriculum_heading: z.string(),
  curriculum_subheading: z.string(),

  // Sections module (roadmap of modules — title + per-module image)
  sections_label: z.string(),
  sections_heading: z.string(),
  sections_subheading: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
    }),
  ),

  // Paywall / unlock-lessons card
  paywall_eyebrow: z.string(),
  paywall_title: z.string(),
  paywall_subtitle: z.string(),
  paywall_price_sub: z.string(),
  paywall_cta: z.string(),

  // Final CTA guarantee strip (4 short pills)
  final_cta_guarantees: z.array(z.string()),

  // Full lesson list
  lessons_label: z.string(),
  lessons_heading: z.string(),
  lessons_subheading: z.string(),

  // Created by — author intro section. The eyebrow renders the creator's
  // name; the headline is a one-sentence credentials line; the bio is one
  // or two paragraphs (a single \n splits paragraphs).
  created_by_eyebrow: z.string(),
  created_by_quote: z.string(),
  created_by_headline: z.string(),
  created_by_bio: z.string(),

  // Instructor
  instructor_label: z.string(),
  instructor_pull_quote: z.string(),
  instructor_credentials: z.array(
    z.object({
      number: z.string(),
      label: z.string(),
    }),
  ),

  // Reviews
  reviews_label: z.string(),
  reviews: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      text: z.string(),
    }),
  ),

  // What you'll learn — outcomes strip. Two-column numbered grid (6 items).
  // Title splits across two lines via `learn_title` + `learn_title_em`
  // (lighter weight / colour for the em half).
  learn_eyebrow: z.string(),
  learn_title: z.string(),
  learn_title_em: z.string(),
  learn_items: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    }),
  ),

  // Per-episode descriptions for the series carousel. One short
  // description per episode (1-2 sentences, ≤ 200 chars). Optional —
  // stays undefined until the AI emits it, which avoids stalling
  // useObject on the partial stream.
  episode_descriptions: z.array(z.string()).optional(),

  // FAQ — minimal accordion right before the final CTA. 7 items.
  faq_eyebrow: z.string(),
  faq_title: z.string(),
  faq_title_em: z.string(),
  faq_items: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),

  // Final CTA
  final_cta_label: z.string(),
  final_cta_title: z.string(),
  final_cta_subtitle: z.string(),
  final_cta_primary: z.string(),
  final_cta_secondary: z.string(),
})

export type CourseLanding = z.infer<typeof landingSchema>
