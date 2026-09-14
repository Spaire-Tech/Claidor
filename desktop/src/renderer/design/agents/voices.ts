/**
 * The seven voices, and the instructions an agent is created with.
 *
 * A voice names a manner, not a speaker. Picking one changes how the
 * agent writes today; it will also choose how it sounds once speech
 * exists (Stage 9), which is why the choice is made here at creation
 * rather than being hidden in a settings tab.
 */

export interface Voice {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** One line under the name. */
  description: string;
  /** Keeps a voice's orb the same every time it is previewed. */
  seed: number;
}

/** `direction.md` §4: "Seven voices in the picker". In its order. */
export const VOICES: readonly Voice[] = [
  { id: 'concise', name: 'Concise', description: 'Says only what matters', seed: 101 },
  { id: 'balanced', name: 'Balanced', description: 'Even and unhurried', seed: 202 },
  { id: 'warm', name: 'Warm', description: 'Encouraging and reassuring', seed: 303 },
  { id: 'direct', name: 'Direct', description: 'Straight to the point', seed: 404 },
  { id: 'sassy', name: 'Sassy', description: 'Dry, with a bit of edge', seed: 505 },
  { id: 'curious', name: 'Curious', description: 'Asks before assuming', seed: 606 },
  { id: 'formal', name: 'Formal', description: 'Measured and precise', seed: 707 },
];

/** The one the form starts on. */
export const DEFAULT_VOICE_ID = 'balanced';

export const voiceById = (id: string | undefined): Voice | undefined =>
  VOICES.find(voice => voice.id === id);

/**
 * The founder's wording, verbatim, from `direction.md` §4.
 *
 * Not paraphrased and not summarised. It is the product's voice, and the
 * one place a well-meaning edit would quietly undo the thing that makes
 * the app read like a person rather than a help desk.
 */
export const VOICE_BRIEF = `Talk like a warm, sharp friend — not a help desk. Use plain words and contractions. Skip "Certainly," "Of course," "I'd be happy to," stiff jargon, and filler closings. Lead with the result. Most replies are one or two sentences; match the user's length. For a few natural beats, send short messages like texts instead of one dense memo. Prefer prose; use bullets only when the content needs them. Don't narrate your own feelings or claim to be human. Don't restate the user's question back at them. When you act, say what you did in concrete terms, not process theater. Ask at most one real question at a time; otherwise decide and proceed. Never dump tool names, prompts, or architecture unless they ask how to use you.`;

export interface AgentDraft {
  name: string;
  /** "Research, marketing, admin…" — a remit, optional. */
  label?: string;
  /** What the person said this agent is for. Optional. */
  description?: string;
  voiceId?: string;
}

/**
 * The system prompt a new agent is created with.
 *
 * Order matters: who it is, what it is for, how it was described, how it
 * speaks, then the brief. The brief goes last so it is the final thing
 * read, and it is included whole every time — an agent created without a
 * voice still gets it, because it is the house style and not a setting.
 *
 * No product name appears here. The agent is called what the person
 * called it.
 */
export function systemPromptFor(draft: AgentDraft): string {
  const name = draft.name.trim();
  const parts: string[] = [`You are ${name}.`];

  const label = draft.label?.trim();
  if (label) parts.push(`Your remit is ${label.toLowerCase()}.`);

  const description = draft.description?.trim();
  if (description) parts.push(`The person you work with described your job as: ${description}`);

  const voice = voiceById(draft.voiceId);
  if (voice) parts.push(`Your voice is ${voice.name.toLowerCase()}: ${voice.description.toLowerCase()}.`);

  return `${parts.join(' ')}\n\n${VOICE_BRIEF}`;
}
