/**
 * What may appear in a thread. Five kinds, and the list is closed.
 *
 * This is the discipline that makes the app feel unlike an AI app. The
 * engine emits a great deal more than this — thinking blocks, tool calls,
 * tool results, streaming partials, token counts — and none of it belongs
 * in front of a person. Everything the agent does is either a sentence, a
 * shimmer, a question, or a permission.
 *
 * Adding a sixth kind is a product decision, not a convenience. If
 * something does not fit these five, the honest move is usually to say it
 * as a `text` in the agent's own voice.
 */

export const ThreadItemKind = {
  /** A bubble. From the person or the agent. */
  Text: 'text',
  /** A centred grey line. Something happened; nobody needs to reply. */
  System: 'system',
  /** A shimmering verb while work is in flight. Removed when it ends. */
  Status: 'status',
  /** A question with lettered options, and optionally a free-text answer. */
  Choice: 'choice',
  /** The approval card, with the real command behind a disclosure. */
  Auth: 'auth',
} as const;
export type ThreadItemKind = typeof ThreadItemKind[keyof typeof ThreadItemKind];

/** Who a bubble belongs to. */
export const Speaker = {
  Person: 'person',
  Agent: 'agent',
} as const;
export type Speaker = typeof Speaker[keyof typeof Speaker];

export interface TextItem {
  kind: typeof ThreadItemKind.Text;
  id: string;
  from: Speaker;
  text: string;
  /**
   * The agent this bubble came from, when the thread has more than one.
   * Undefined in a one-to-one thread, where the header already says.
   */
  agentId?: string;
  /** What that agent is called, for the small line above its bubble. */
  agentName?: string;
  /** True while the text is still arriving, so voice mode can stream it. */
  streaming?: boolean;
  at: number;
}

export interface SystemItem {
  kind: typeof ThreadItemKind.System;
  id: string;
  text: string;
  at: number;
}

export interface StatusItem {
  kind: typeof ThreadItemKind.Status;
  id: string;
  /** A plain verb. Never a tool name — see `toolVerbs.ts`. */
  verb: string;
  agentId?: string;
  at: number;
}

export interface ChoiceOption {
  /** The letter or digit on the key cap. */
  key: string;
  label: string;
  hint?: string;
}

export interface ChoiceItem {
  kind: typeof ThreadItemKind.Choice;
  id: string;
  text: string;
  note?: string;
  options: readonly ChoiceOption[];
  /** Whether the card offers "Type your own answer". */
  freeform?: boolean;
  at: number;
}

export interface AuthItem {
  kind: typeof ThreadItemKind.Auth;
  id: string;
  /** The question, in a sentence. */
  text: string;
  /** The machine this concerns, as the person would identify it. */
  deviceId?: string;
  /** What else this decision covers. */
  note?: string;
  /**
   * The literal command, shown behind a disclosure triangle.
   *
   * Not a summary and not a paraphrase: the whole point of the card is
   * that somebody can read exactly what they are agreeing to. An approval
   * prompt that hides the command is a worse prompt than none, because it
   * teaches people that approving is meaningless.
   */
  command?: string;
  at: number;
}

export type ThreadItem = TextItem | SystemItem | StatusItem | ChoiceItem | AuthItem;

/** What the person chose on an approval card. */
export const AuthDecision = {
  Always: 'always',
  Once: 'once',
  Never: 'never',
} as const;
export type AuthDecision = typeof AuthDecision[keyof typeof AuthDecision];
