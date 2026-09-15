import type { AskInputField } from '../../../shared/askInput/constants';

/**
 * What may appear in a thread. Seven kinds, and the list is closed.
 *
 * This is the discipline that makes the app feel unlike an AI app. The
 * engine emits a great deal more than this — thinking blocks, tool calls,
 * tool results, streaming partials, token counts — and none of it belongs
 * in front of a person.
 *
 * **It was five, and the founder made it seven on 15 September 2026.**
 * `docs/product/direction.md` §2 fixed a closed list of five and said
 * adding to it is a product decision, not a convenience. Two were added
 * deliberately, after being put to the founder as a decision:
 *
 *   - `attachment` — a file as the whole message. A produced document
 *     arriving as a lone chip inside an otherwise empty bubble was a
 *     text item pretending to be something else.
 *   - `secret` — a masked field for a password, key or code. The rule
 *     "never ask somebody to paste a credential into chat" is
 *     unenforceable without somewhere else to put it, and a value typed
 *     here never enters the transcript or the model's context.
 *
 * Adding an eighth is the same decision again. If something does not fit
 * these seven, the honest move is usually to say it as a `text` in the
 * agent's own voice.
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
  /** A file as the whole message, rather than named inside a sentence. */
  Attachment: 'attachment',
  /** A masked field. What is typed never reaches the transcript. */
  Secret: 'secret',
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
  /**
   * The bulk behind this answer, collapsed under it.
   *
   * A long digest, a list of rows, the noisy middle of a job. The bubble
   * carries the point; this is what it is based on, one click away. Never
   * the answer itself — `details.ts` refuses to collapse a reply that has
   * no summary in front of it.
   */
  details?: string;
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

export interface AttachmentItem {
  kind: typeof ThreadItemKind.Attachment;
  id: string;
  from: Speaker;
  /** The file's name, as a person reads it. */
  name: string;
  /** Where it is on this computer. Absolute. */
  path: string;
  /** Bytes, when known. Absent rather than zero when it is not. */
  size?: number;
  /**
   * An image this can show rather than describe.
   *
   * The canvas puts a produced picture in the thread, not behind a
   * paperclip. Anything else is the file's name and a way to open it.
   */
  image?: boolean;
  agentId?: string;
  agentName?: string;
  at: number;
}

/**
 * A card asking the person to type something the model must not see.
 *
 * One field or several — a lone password box and a login form with an
 * email beside it are the same card, and splitting them would be
 * plumbing showing through. Every field marked secret is masked, kept out
 * of the transcript, and never sent to the model.
 */
export interface SecretItem {
  kind: typeof ThreadItemKind.Secret;
  id: string;
  /** What is being asked for, in a sentence. */
  text: string;
  /** Which service or account it is for, when the agent can say. */
  note?: string;
  fields: readonly AskInputField[];
  /**
   * Whether the values may be kept for later.
   *
   * A one-time code must not be; a password for a site the agent will
   * visit again might reasonably be. The agent asks; the person decides.
   */
  offerToSave?: boolean;
  at: number;
}

export type ThreadItem =
  | TextItem
  | SystemItem
  | StatusItem
  | ChoiceItem
  | AuthItem
  | AttachmentItem
  | SecretItem;

/** What the person chose on an approval card. */
export const AuthDecision = {
  Always: 'always',
  Once: 'once',
  Never: 'never',
} as const;
export type AuthDecision = typeof AuthDecision[keyof typeof AuthDecision];
