import { VOICE_BRIEF } from '../../../shared/agent/voiceBrief';

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
  /**
   * The voice's own sphere: five colours, from the 15 September canvas.
   *
   * A voice is a picture of its own and not the agent's. The first build
   * drew every voice from the agent's face, which made "pick a voice with
   * a different colour, get a default blue" — the sphere was never the
   * voice's to begin with.
   */
  colors: readonly string[];
}

/** `direction.md` §4: "Seven voices in the picker". In its order. */
export const VOICES: readonly Voice[] = [
  { id: 'concise', name: 'Concise', description: 'Says only what matters', seed: 101, colors: ['#4f9a2e', '#2a7fa8', '#c9b755', '#e8f0d8', '#4f9c7a'] },
  { id: 'balanced', name: 'Balanced', description: 'Even and unhurried', seed: 202, colors: ['#2f6ab8', '#3f93ad', '#6a56b0', '#dbe6f5', '#4a7fc4'] },
  { id: 'warm', name: 'Warm', description: 'Encouraging and reassuring', seed: 303, colors: ['#c07a28', '#bf6a4a', '#c9a03d', '#f5e4d2', '#c4854a'] },
  { id: 'direct', name: 'Direct', description: 'Straight to the point', seed: 404, colors: ['#3a4a63', '#2a6f8f', '#5a6f8f', '#dfe6ef', '#44607f'] },
  { id: 'sassy', name: 'Sassy', description: 'Dry, with a bit of edge', seed: 505, colors: ['#bf4a86', '#c07a28', '#8f5cad', '#f2dae5', '#c45f92'] },
  { id: 'curious', name: 'Curious', description: 'Asks before assuming', seed: 606, colors: ['#6d4bb8', '#3f66b8', '#a85fa0', '#e2d8f2', '#7d5cc4'] },
  { id: 'formal', name: 'Formal', description: 'Measured and precise', seed: 707, colors: ['#33506e', '#4a6b85', '#6b7f96', '#e3e9f0', '#3d5c7d'] },
];

/**
 * The one the picker opens on when nothing is chosen yet.
 *
 * Not the one an agent is created with: the 15 September canvas starts
 * the form at "No voice yet / Add", and a voice is chosen or it is not.
 */
export const DEFAULT_VOICE_ID = 'balanced';

export const voiceById = (id: string | undefined): Voice | undefined =>
  VOICES.find(voice => voice.id === id);

/**
 * The founder's wording, verbatim. One copy, in `shared/`, because the
 * twelve role agents are built in the main process and must not drift
 * from the ones somebody creates here.
 */
export { VOICE_BRIEF };

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
