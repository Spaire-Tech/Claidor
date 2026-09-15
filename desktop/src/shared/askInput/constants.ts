/**
 * Asking the person to type something that must not go through the model.
 *
 * **Why this exists.** Every safety rule in this product says the same
 * thing — *never ask somebody to paste a password, a key or a code into
 * chat* (`grok-bot-chat.md` §3.5, `grok-bot-agent-reference.md` §6). A
 * rule like that is unenforceable on its own. Without somewhere else for
 * the value to go, the agent either asks in the open or abandons a step
 * it could have finished, and "sign in to continue" becomes a dead end.
 *
 * **One card, not two.** Grok Bot has a `secret-request` card (§10.4) and
 * a separate `request_user_form` (§14). That split is an artefact of
 * their plumbing, not something a person can see: a login form with an
 * email and a password is the same card as a lone password box. So this
 * carries a list of fields, each of which may be secret, and the founder's
 * seven message kinds stay seven.
 *
 * **What "secret" buys.** A field marked secret is masked as it is typed,
 * is never written into the conversation, never reaches the model's
 * context, and is never logged. It goes from the card to the tool that
 * asked and nowhere else. The card says so, in the card.
 */

export const ASK_INPUT_TOOL = 'ask_user_input';

/** The name the gateway knows this MCP server by. */
export const ASK_INPUT_MCP_SERVER = 'caisra-ask-input';

export const AskInputFieldKind = {
  /** One line. An email, a name, a code. */
  Line: 'line',
  /** One line, masked. A password, an API key, a one-time code. */
  Secret: 'secret',
  /** Several lines. An address, a note. */
  Block: 'block',
} as const;
export type AskInputFieldKind =
  typeof AskInputFieldKind[keyof typeof AskInputFieldKind];

export interface AskInputField {
  /** Returned as the key in `values`. */
  name: string;
  /** The word above the box: "Password", "One-time code". */
  label: string;
  kind: AskInputFieldKind;
  /** Greyed out inside an empty box. Never an example of a real value. */
  placeholder?: string;
  /** Whether Send stays disabled until this is filled. Default true. */
  optional?: boolean;
}

export interface AskInputRequest {
  requestId: string;
  /** The sentence above the fields — what this is for, and why. */
  prompt: string;
  /** Which service or account, when the agent can say. */
  note?: string;
  fields: readonly AskInputField[];
  /**
   * Whether to offer keeping the values on this computer.
   *
   * The agent asks for this; the person decides. A one-time code must
   * never be offered — it is worthless twice and keeping it is a risk for
   * nothing.
   */
  offerToSave?: boolean;
  sessionKey?: string;
}

export const AskInputBehavior = {
  /** They filled it in. `values` is present. */
  Provide: 'provide',
  /** They said no, or the card timed out. */
  Decline: 'decline',
} as const;
export type AskInputBehavior =
  typeof AskInputBehavior[keyof typeof AskInputBehavior];

export interface AskInputResponse {
  behavior: AskInputBehavior;
  /** Field name to what was typed. Absent on decline. */
  values?: Record<string, string>;
  /** Whether they ticked "keep this on this computer". */
  remember?: boolean;
}

/** The bridge route the tool posts to. */
export const ASK_INPUT_ROUTE = '/ask-input';

/** Renderer ↔ main, for the card. */
export const AskInputIpc = {
  /** main → renderer: draw a card. */
  Requested: 'askInput:requested',
  /** main → renderer: the card is gone (timed out, or the turn ended). */
  Dismissed: 'askInput:dismissed',
  /** renderer → main: what they typed, or that they declined. */
  Respond: 'askInput:respond',
} as const;
export type AskInputIpc = typeof AskInputIpc[keyof typeof AskInputIpc];

/**
 * How long a card waits.
 *
 * Longer than the question card's two minutes. Somebody asked for a
 * one-time code has to go and find their phone, and a card that vanishes
 * while they are looking is worse than one that waits.
 */
export const ASK_INPUT_TIMEOUT_MS = 300_000;

/** Fields whose values must never be logged, stored, or sent to a model. */
export function secretFieldNames(fields: readonly AskInputField[]): readonly string[] {
  return fields
    .filter(field => field.kind === AskInputFieldKind.Secret)
    .map(field => field.name);
}

/**
 * What may be said about a response in a log line.
 *
 * Never the values. Not even the non-secret ones: an address typed into
 * this card is not something to leave in a file that gets shared when
 * somebody reports a bug.
 */
export function describeResponse(response: AskInputResponse): string {
  if (response.behavior === AskInputBehavior.Decline) return 'declined';
  const count = Object.keys(response.values ?? {}).length;
  return `provided ${count} field${count === 1 ? '' : 's'}${response.remember ? ', keep' : ''}`;
}
