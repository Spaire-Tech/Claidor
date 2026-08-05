// Shared editorial stylebook for the AI landing-page generator and the
// per-field rewrite endpoint. Both routes import from here so a creator
// who clicks "✨ Rewrite" doesn't drop out of the same voice scaffolding
// that produced the original page.
//
// Design notes:
// - Positive constraints over negative ones. Banning specific clichés just
//   pushes the model into the next tier of clichés. Requiring a proper
//   noun / number / concrete object per long-form field is what produces
//   specificity.
// - The grounding step ("internally name the textures and the lexicon")
//   lives in the prompt as a thinking instruction, not as a separate
//   schema field — Anthropic's tool-call output doesn't honor schema
//   property order, and making the brief a required field stalls
//   `experimental_useObject` on partial streams.
// - Cardinality is normalized post-stream because Zod min/max stalls
//   `useObject` on partial JSON. The shape is enforced in the prompt and
//   then padded/sliced once the stream completes.

export const SHARED_STYLEBOOK = `
EDITORIAL CONTRACT — applies to every string you emit.

Voice
- Editorial, declarative, quiet. No exclamation points. No emojis. No markdown.
  No italics, em-dash-as-italics, or quote marks around strings. Plain text only.
- The UI handles all styling. You write words, not formatting.
- Pricing is rendered by the UI. NEVER emit a currency symbol or a price number
  anywhere, including paywall fields and FAQ answers.

Specificity (this is the rule that matters most)
- Every long-form field (description, value_prop.description, learn_item.description,
  faq answer, instructor_pull_quote, created_by_quote, created_by_bio, review.text)
  must contain at least one of: a proper noun from the inputs, a specific number,
  or a concrete physical object / place / ritual named in the bio. If you can't
  ground it, write a shorter sentence — don't pad with abstractions.
- Reuse the same 4-6 subject-specific words and phrases across multiple fields so
  the voice is consistent. Skip the abstractions a competitor would default to.
- One concrete detail beats five abstractions. If you wrote a sentence that
  would still make sense for a different subject, rewrite it.

Cadence
- Vary sentence length within a paragraph. No three consecutive sentences that
  start with the same pronoun ("you", "she", "we", "the").
- No hedging ("maybe", "kind of", "might", "perhaps", "a bit").
- No filler intensifiers ("really", "very", "truly", "genuinely").

Cardinality (enforced by the renderer — do not violate)
- sections: exactly 4 entries for a course, exactly 0 for a series.
- learn_items: exactly 4 entries. Each one is a moment / outcome / scene the
  card surfaces; the description sits behind a "Read more" tap, so titles
  must work on their own as a one-line headline.
- faq_items: exactly 7 entries.
- final_cta_guarantees: exactly 4 short strings (1-3 words each).
- value_props: exactly 4 entries.
- reviews: ALWAYS return an empty array []. The creator adds their own.
`.trim()

// Cadence rules — describe the SHAPE of each field, never show a copyable
// phrase. Concrete example strings here would leak into output verbatim
// (models follow examples harder than they follow rules). Two registers
// are offered so the model can lean into the one that fits the subject.
const CADENCE_REGISTERS: { register: string; rules: string[] }[] = [
  {
    register: 'instructional (a course teaching a craft)',
    rules: [
      'Tagline: 5-8 words, no period. Names what the learner will be able to do or how their thinking will shift. Starts with a strong verb that is NOT "build", "master", "unlock", or "transform".',
      'Description: 2 sentences, 200-360 chars. First sentence names the instructor in one specific phrase (role + signature credit). Second sentence names what the course sits inside — a body of work, a domain, a recurring problem — and references the real lesson count by number.',
      'Outcome (learn_item.title): one short sentence ending in a period. Names a concrete thing the learner will be able to DO, not a topic. 4-9 words. The title shows alone on a card by default — it must work as a standalone headline.',
      'FAQ answer: 1-3 sentences, 120-380 chars. Names a specific number, format detail, or device when possible. No marketing voice.',
    ],
  },
  {
    register: 'observational (a series, an artist letting you in)',
    rules: [
      'Tagline: 5-9 words, no period. Evocative, in the creator\'s voice. Not instructional. Not a question. Names the feeling, the week, the territory — not what you\'ll learn.',
      'Description: 2 sentences, 200-360 chars. First sentence names the creator in one specific phrase (role + credit). Second sentence names what the season sits inside — a moment, a year, a body of work — and references the real episode count by number.',
      'Watch-item (learn_item.title): one short sentence ending in a period. Names a moment the viewer will witness, not a skill they\'ll acquire. 4-9 words. The title shows alone on a card by default — it must work as a standalone headline.',
      'FAQ answer: 1-3 sentences, 120-380 chars. Concrete runtime, episode count, format. Frame around watching, never learning.',
    ],
  },
]

// Return both registers as cadence guidance. The model picks which to
// lean into based on the format and the subject. We give STRUCTURE only —
// no example phrases the model could copy verbatim.
export function pickCadenceDemos(
  _title: string,
  _description: string,
  _bio: string,
  format: 'course' | 'series',
): string {
  // Series leans observational; course leans instructional. We surface
  // the matching register first but include both so the model can blend.
  const ordered =
    format === 'series'
      ? [CADENCE_REGISTERS[1], CADENCE_REGISTERS[0]]
      : [CADENCE_REGISTERS[0], CADENCE_REGISTERS[1]]
  return ordered
    .map(
      (r) =>
        `CADENCE — ${r.register}:\n${r.rules.map((l) => `  - ${l}`).join('\n')}`,
    )
    .join('\n\n')
}

// ── Cardinality normalization ────────────────────────────────────────────
//
// The streaming schema can't enforce min/max because partial JSON would
// stall useObject. So we normalize post-stream before we persist the
// landing payload. This is what guarantees the renderer always gets the
// shape it expects (4 sections, 6 learn_items, 7 faq_items, 4 guarantees,
// 4 value_props).

const PLACEHOLDER_SECTION = { title: 'Season' }
const PLACEHOLDER_VALUE_PROP = { title: '', description: '' }
const PLACEHOLDER_LEARN = { title: '', description: '' }
const PLACEHOLDER_FAQ = { question: '', answer: '' }

function clampArray<T>(arr: unknown, n: number, filler: T): T[] {
  const list = Array.isArray(arr) ? (arr as T[]) : []
  if (list.length === n) return list
  if (list.length > n) return list.slice(0, n)
  return [...list, ...Array.from({ length: n - list.length }, () => filler)]
}

export function normalizeLandingCardinality(
  landing: Record<string, unknown> | null | undefined,
  format: 'course' | 'series',
): Record<string, unknown> {
  if (!landing || typeof landing !== 'object') return {}
  const out: Record<string, unknown> = { ...landing }

  out.value_props = clampArray(out.value_props, 4, { ...PLACEHOLDER_VALUE_PROP })
  out.learn_items = clampArray(out.learn_items, 4, { ...PLACEHOLDER_LEARN })
  out.faq_items = clampArray(out.faq_items, 7, { ...PLACEHOLDER_FAQ })

  const guarantees = Array.isArray(out.final_cta_guarantees)
    ? (out.final_cta_guarantees as string[])
    : []
  out.final_cta_guarantees =
    guarantees.length >= 4
      ? guarantees.slice(0, 4)
      : [...guarantees, ...Array.from({ length: 4 - guarantees.length }, () => '')]

  if (format === 'series') {
    out.sections = []
    out.sections_label = ''
    out.sections_heading = ''
    out.sections_subheading = ''
  } else {
    out.sections = clampArray(out.sections, 4, { ...PLACEHOLDER_SECTION })
  }

  // Reviews always normalized to empty — never ship fabricated testimonials.
  out.reviews = []

  // episode_descriptions varies in length by the series' episode count,
  // so we don't clamp to a fixed size. Just ensure it's an array of
  // strings — the carousel reads by index and falls back to
  // lesson.description if a slot is missing.
  out.episode_descriptions = Array.isArray(out.episode_descriptions)
    ? (out.episode_descriptions as unknown[]).map((s) =>
        typeof s === 'string' ? s : '',
      )
    : []

  return out
}
