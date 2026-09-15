/**
 * Which model a turn runs on: the fast one for a plain question, the
 * strong one for a job.
 *
 * The founder, on the Max plan: *"maybe we can do sonnet for simple
 * questions, then the moment its a job, we use opus?"* Yes — and the
 * whole feature is this one decision, made in the main process right
 * before the run starts (`main.ts`, under the Claude Code mechanic of
 * `claudeCodeMode.ts`), with no second model call: every call spawns
 * Claude Code, and a classifier call would add seconds to every message.
 * Nothing in the renderer knows a model exists.
 *
 * The two mistakes are not equal. The strong model answering a simple
 * question wastes a little of the limit. The fast model running a job is
 * another DoorDash afternoon. So the rule leans: **strong whenever in
 * doubt**, fast only when the message is plainly a question and the
 * conversation is not already a job.
 */

export const TurnRoute = {
  /** A plain question: the fast model. */
  Fast: 'fast',
  /** A job, or anything unclear: the strong model. */
  Strong: 'strong',
} as const;
export type TurnRoute = typeof TurnRoute[keyof typeof TurnRoute];

export interface TurnSignals {
  text: string;
  /** A room: several agents, always a job. */
  inRoom?: boolean;
  /** The reply before this message used a tool: the conversation is a job. */
  lastTurnUsedTools?: boolean;
  /** Something is attached (files ride in the text as lines; see `attach.ts`). */
  hasAttachments?: boolean;
}

/** Longer than this is not a quick question, whatever it looks like. */
const FAST_MAX_CHARS = 240;

/** Verbs that make a message an ask to do something. Word-bounded, any case. */
const ACTION_VERBS = [
  'find', 'search', 'look up', 'lookup', 'check', 'book', 'order', 'buy', 'send', 'email', 'mail', 'reply',
  'make', 'create', 'write', 'draft', 'build', 'generate', 'open', 'go to', 'visit', 'browse', 'download',
  'upload', 'save', 'delete', 'remove', 'move', 'rename', 'edit', 'change', 'update', 'fix', 'run', 'install',
  'schedule', 'remind', 'set up', 'setup', 'add', 'put', 'fill', 'submit', 'sign', 'log in', 'login', 'pay',
  'compare', 'summarize', 'summarise', 'translate', 'convert', 'export', 'import', 'organize', 'organise',
  'plan', 'prepare', 'clean', 'sort', 'list', 'get me', 'grab', 'fetch', 'post', 'share', 'call', 'text',
  'message', 'do', 'start', 'stop', 'cancel', 'continue', 'finish', 'try', 'help me', 'can you',
  'could you', 'would you', 'please',
];

const ACTION_PATTERN = new RegExp(
  `(^|[^a-z])(${ACTION_VERBS.map(verb => verb.replace(/ /g, '\\s+')).join('|')})([^a-z]|$)`,
  'i',
);

const LINK_PATTERN = /https?:\/\/|www\.|\S+\.(com|org|net|io|fr|dev|app|co)(\/|\s|$)/i;
const PATH_PATTERN = /(^|\s)(\/|~\/|[A-Za-z]:\\)\S+|\.(pdf|docx?|xlsx?|pptx?|csv|png|jpe?g|zip|md|txt)(\s|$)/i;

/**
 * Fast only when every one of these holds: not a room, the last reply
 * used no tool, nothing attached, the text is short, carries no link or
 * path, asks no action, and reads as a question (ends with `?`, or opens
 * with a question word).
 */
export function routeTurn(signals: TurnSignals): TurnRoute {
  if (signals.inRoom || signals.lastTurnUsedTools || signals.hasAttachments) return TurnRoute.Strong;
  const text = signals.text.trim();
  if (!text || text.length > FAST_MAX_CHARS) return TurnRoute.Strong;
  if (LINK_PATTERN.test(text) || PATH_PATTERN.test(text)) return TurnRoute.Strong;
  if (ACTION_PATTERN.test(text)) return TurnRoute.Strong;
  const asksAQuestion = text.endsWith('?')
    || /^(what|who|when|where|why|how|which|is|are|was|were|does|do|did|can|should|will|would|could|explain|define|tell me)\b/i.test(text);
  return asksAQuestion ? TurnRoute.Fast : TurnRoute.Strong;
}

/**
 * Whether the reply before this message used a tool: any tool use after
 * the last thing the person said.
 */
export function lastTurnUsedTools(messages: readonly { type: string }[]): boolean {
  let sawTool = false;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const one = messages[i];
    if (one.type === 'user') break;
    if (one.type === 'tool_use' || one.type === 'tool_result') sawTool = true;
  }
  return sawTool;
}
