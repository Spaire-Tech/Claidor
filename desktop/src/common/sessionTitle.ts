export const SESSION_TITLE_MAX_CHARS = 50;

const GOAL_START_COMMAND_PREFIX_RE = /^\/goal\s+(?:start|set|create)\s+/i;

export function stripGoalCommandPrefixForDisplay(input: string): string {
  return input.replace(GOAL_START_COMMAND_PREFIX_RE, '');
}

export function buildSessionTitleFromInput(
  input: string | null | undefined,
  defaultTitle: string
): string {
  const normalizedInput = typeof input === 'string'
    ? stripGoalCommandPrefixForDisplay(input).replace(/\s+/g, ' ').trim()
    : '';

  if (!normalizedInput) {
    return defaultTitle;
  }

  const title = Array.from(normalizedInput)
    .slice(0, SESSION_TITLE_MAX_CHARS)
    .join('')
    .trim();
  return title || defaultTitle;
}

// ── A name for the chat ──────────────────────────────────────────────────────
//
// The truncation above is a placeholder, not a name: « Please help me fix the
// login fail… » is the first thing the person typed, not what the chat is
// about. After the first exchange settles, the cheapest model on the account
// reads that exchange and writes a real name. Everything in this section is
// pure so the rules can be tested without a model, a network or a clock.

/**
 * Where a session's name came from. This decides whether the app may name
 * the chat again: only a name it has not yet improved is open to a model
 * call, and a name the person typed is closed for ever.
 */
export const SessionTitleSource = {
  /** The truncation above: a placeholder until something better arrives. */
  Fallback: 'fallback',
  /** The cheap model read the first exchange and named the chat. Done. */
  Assistant: 'assistant',
  /** The person typed it. It wins for ever after. */
  Person: 'person',
} as const;
export type SessionTitleSource = typeof SessionTitleSource[keyof typeof SessionTitleSource];

/**
 * Rows written before this existed carry no source, and an unknown value is
 * not a licence to overwrite a name: anything that is not recognised is read
 * as the person's.
 */
export const normalizeSessionTitleSource = (
  value: string | null | undefined,
): SessionTitleSource => {
  const normalized = (value ?? '').trim();
  if (!normalized) return SessionTitleSource.Fallback;
  if (normalized === SessionTitleSource.Fallback) return SessionTitleSource.Fallback;
  if (normalized === SessionTitleSource.Assistant) return SessionTitleSource.Assistant;
  return SessionTitleSource.Person;
};

/** A chat is named once, and never again once it has a name worth keeping. */
export const canNameSession = (source: string | null | undefined): boolean => (
  normalizeSessionTitleSource(source) === SessionTitleSource.Fallback
);

/** A name is a few words, not a sentence. */
export const SESSION_TITLE_MAX_WORDS = 5;

/**
 * How much of the first exchange the model is shown. The call is paid for
 * per token, so the excerpt is capped rather than trusted to be short: one
 * pasted contract must not turn a fixed cost into an open one.
 */
export const SESSION_NAMING_EXCERPT_MAX_CHARS = 600;

export const buildSessionNamingExcerpt = (text: string | null | undefined): string => {
  const normalized = typeof text === 'string'
    ? stripGoalCommandPrefixForDisplay(text).replace(/\s+/g, ' ').trim()
    : '';
  return Array.from(normalized).slice(0, SESSION_NAMING_EXCERPT_MAX_CHARS).join('').trim();
};

/**
 * What the cheap model is asked. It is deliberately dull: one job, one line
 * back, no room to be helpful about anything else.
 */
export const buildSessionNamingPrompt = (exchange: {
  question: string | null | undefined;
  answer?: string | null | undefined;
}): string | null => {
  const question = buildSessionNamingExcerpt(exchange.question);
  if (!question) return null;
  const answer = buildSessionNamingExcerpt(exchange.answer);
  const lines = [
    'Name this conversation for a sidebar list.',
    '',
    `Person: ${question}`,
  ];
  if (answer) lines.push(`Assistant: ${answer}`);
  lines.push(
    '',
    `Reply with the name only: three to ${SESSION_TITLE_MAX_WORDS} words describing what the`,
    'conversation is about. No quotation marks, no full stop, no preamble.',
  );
  return lines.join('\n');
};

/** Wrappers a model puts around a name when it cannot help itself. */
const NAMING_REPLY_PREFIX_RE = /^(?:title|name|here(?:'s| is) (?:the|a) (?:title|name))\s*[:\-—]\s*/i;
const SURROUNDING_QUOTES_RE = /^["'“”‘’`*]+|["'“”‘’`*]+$/g;
const TRAILING_STOP_RE = /[.!?,;:]+$/;

/**
 * The model's reply, read as a name — or nothing. Nothing is a perfectly
 * good answer here: the caller keeps the truncation, and the chat is never
 * nameless. Anything that arrives as a sentence, a paragraph, a refusal or
 * an apology fails these rules and is discarded rather than shown.
 */
export const parseModelSessionTitle = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string') return null;
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean);
  if (!firstLine) return null;

  const title = firstLine
    .replace(NAMING_REPLY_PREFIX_RE, '')
    .replace(SURROUNDING_QUOTES_RE, '')
    .replace(TRAILING_STOP_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return null;

  // A name has no punctuation a sentence would need, and no markup.
  if (/[\n<>{}[\]|]/.test(title)) return null;
  if (title.split(' ').length > SESSION_TITLE_MAX_WORDS) return null;
  if (Array.from(title).length > SESSION_TITLE_MAX_CHARS) return null;
  return title;
};

/**
 * The name to store after a naming call: the model's, when it gave one worth
 * keeping, and otherwise the name the chat already has.
 */
export const buildSessionTitleFromModelReply = (
  raw: string | null | undefined,
  fallbackTitle: string,
): { title: string; source: SessionTitleSource } => {
  const title = parseModelSessionTitle(raw);
  return title
    ? { title, source: SessionTitleSource.Assistant }
    : { title: fallbackTitle, source: SessionTitleSource.Fallback };
};
