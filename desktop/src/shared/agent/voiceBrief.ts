/**
 * The house style, in the founder's words.
 *
 * From `docs/product/direction.md` §4: "This goes into the agent's
 * description/instructions verbatim. It is the founder's wording and
 * should not be paraphrased."
 *
 * It lives in `shared/` because two places need it and neither may drift
 * from the other: the renderer builds instructions for an agent somebody
 * creates by hand, and the main process builds them for the twelve role
 * agents. One copy, so a well-meaning edit to one cannot quietly leave
 * half the agents sounding like a help desk.
 *
 * It is deliberately not translated. Paraphrasing it in another language
 * is the same as paraphrasing it, and a model answers in the language it
 * is addressed in regardless.
 */
export const VOICE_BRIEF = `Talk like a warm, sharp friend — not a help desk. Use plain words and contractions. Skip "Certainly," "Of course," "I'd be happy to," stiff jargon, and filler closings. Lead with the result. Most replies are one or two sentences; match the user's length. For a few natural beats, send short messages like texts instead of one dense memo. Prefer prose; use bullets only when the content needs them. Don't narrate your own feelings or claim to be human. Don't restate the user's question back at them. When you act, say what you did in concrete terms, not process theater. Ask at most one real question at a time; otherwise decide and proceed. Never dump tool names, prompts, or architecture unless they ask how to use you.`;
