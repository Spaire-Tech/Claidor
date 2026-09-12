/**
 * Naming a chat by what it is about (docs/maties/plan.md).
 *
 * The sidebar used to show the first fifty characters the person typed,
 * which is a placeholder, not a name. After the first exchange has settled —
 * the reply is already on screen, nothing here is on that path — the cheapest
 * model on the account reads the exchange and writes three to five words.
 *
 * Every rule below exists for a reason, and each is a line in this file:
 *
 * - the cheapest model, because this cost is paid on every conversation;
 * - never on the answer's path, because a name is not worth a slower reply;
 * - once per chat, never per message, because the cost must stay a fixed
 *   one per conversation rather than one that grows with its length;
 * - the excerpt is capped, so a pasted contract cannot turn that fixed cost
 *   into an open one;
 * - a failure, a refusal or no network leaves the truncation in place, so a
 *   chat is never nameless;
 * - a name the person typed is never touched again.
 */

import {
  buildSessionNamingPrompt,
  canNameSession,
  parseModelSessionTitle,
  SESSION_TITLE_MAX_WORDS,
} from '../../common/sessionTitle';

/**
 * The model the app falls back to when the account's list cannot be read.
 * The list is the authority; this is the entry the list is expected to hold
 * (`server/polar/desktop/pricing.py`), so a naming call still happens when
 * the network answers the proxy but not the catalogue.
 */
export const DEFAULT_SESSION_NAMING_MODEL_ID = 'claude-haiku-4-5-20251001';

/**
 * The naming call speaks Anthropic's `/v1/messages`, so the choice is made
 * among the models that speak it. On the published list that is Haiku, at
 * x0.2 the cheapest of them.
 */
const ANTHROPIC_API_FORMAT = 'anthropic';

/** A name is a handful of words; this is several times what it needs. */
const NAMING_MAX_OUTPUT_TOKENS = 32;

/** The naming call is background work. It never gets to hang about. */
const NAMING_REQUEST_TIMEOUT_MS = 10_000;

/** How many of a session's first messages are read to find the exchange. */
const FIRST_EXCHANGE_MESSAGE_LIMIT = 8;

/** The model catalogue changes rarely; once an app run is often enough. */
const MODEL_CATALOGUE_TTL_MS = 60 * 60_000;

export type SessionNamingMessage = {
  type: string;
  content: string;
};

export type SessionNamingSession = {
  id: string;
  title: string;
  titleSource: string;
};

export type SessionNamingDeps = {
  getServerBaseUrl: () => string;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  isSignedIn: () => boolean;
  getSession: (sessionId: string) => SessionNamingSession | null;
  /** The session's first messages, oldest first. */
  getFirstMessages: (sessionId: string, limit: number) => SessionNamingMessage[];
  applyTitle: (sessionId: string, title: string) => void;
  notifySessionChanged: (sessionId: string) => void;
  /** Request headers the server model endpoints expect. */
  buildModelHeaders: () => Record<string, string>;
};

type AvailableModelRow = {
  modelId?: unknown;
  apiFormat?: unknown;
  provider?: unknown;
  costMultiplier?: unknown;
  accessible?: unknown;
};

/** The first thing the person asked and the first thing Maties answered. */
export const findFirstExchange = (
  messages: readonly SessionNamingMessage[],
): { question: string; answer: string } | null => {
  const question = messages.find((message) => message.type === 'user' && message.content.trim());
  if (!question) return null;
  const questionAt = messages.indexOf(question);
  const answer = messages
    .slice(questionAt + 1)
    .find((message) => message.type === 'assistant' && message.content.trim());
  return { question: question.content, answer: answer?.content ?? '' };
};

/**
 * The cheapest model on the account that speaks the format this call uses.
 * `costMultiplier` is the server's own weight (`desktop/pricing.py`), so
 * « cheapest » means what the account is actually charged, not a guess.
 */
export const pickCheapestNamingModelId = (rows: readonly AvailableModelRow[]): string | null => {
  let cheapestId: string | null = null;
  let cheapestCost = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const modelId = typeof row.modelId === 'string' ? row.modelId.trim() : '';
    if (!modelId) continue;
    if (row.accessible === false) continue;
    const format = typeof row.apiFormat === 'string'
      ? row.apiFormat.trim().toLowerCase()
      : typeof row.provider === 'string' ? row.provider.trim().toLowerCase() : '';
    if (format !== ANTHROPIC_API_FORMAT) continue;
    const cost = typeof row.costMultiplier === 'number' && Number.isFinite(row.costMultiplier)
      ? row.costMultiplier
      : Number.POSITIVE_INFINITY;
    if (cost < cheapestCost) {
      cheapestCost = cost;
      cheapestId = modelId;
    }
  }
  return cheapestId;
};

/** The text of an Anthropic `/v1/messages` reply, or nothing. */
export const readAnthropicReplyText = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') return null;
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type === 'text' && typeof text === 'string') parts.push(text);
  }
  const joined = parts.join('\n').trim();
  return joined || null;
};

export type SessionNamingService = {
  /**
   * Names the session if it is still carrying the truncation. Returns as
   * soon as the work is scheduled; the caller never waits for a model.
   */
  nameSession: (sessionId: string) => void;
  /** Awaits the naming of one session. For tests and for shutdown. */
  nameSessionNow: (sessionId: string) => Promise<void>;
};

export const createSessionNamingService = (
  deps: SessionNamingDeps,
): SessionNamingService => {
  // One attempt per session per app run, whether it succeeded or not: a
  // chat that could not be named (no network, a refusal) keeps its
  // truncation and is not asked about again on the next message.
  const attempted = new Set<string>();
  let cachedModelId: string | null = null;
  let cachedModelAt = 0;

  const resolveNamingModelId = async (): Promise<string> => {
    const now = Date.now();
    if (cachedModelId && now - cachedModelAt < MODEL_CATALOGUE_TTL_MS) return cachedModelId;
    try {
      const response = await deps.fetchWithAuth(
        `${deps.getServerBaseUrl()}/api/models/available`,
        {
          headers: deps.buildModelHeaders(),
          signal: AbortSignal.timeout(NAMING_REQUEST_TIMEOUT_MS),
        },
      );
      if (response.ok) {
        const body = (await response.json()) as { code?: number; data?: unknown };
        if (body.code === 0 && Array.isArray(body.data)) {
          const cheapest = pickCheapestNamingModelId(body.data as AvailableModelRow[]);
          if (cheapest) {
            cachedModelId = cheapest;
            cachedModelAt = now;
            return cheapest;
          }
        }
      }
    } catch (error) {
      console.debug('[SessionNaming] could not read the model list; using the default:', error);
    }
    return DEFAULT_SESSION_NAMING_MODEL_ID;
  };

  const requestName = async (prompt: string): Promise<string | null> => {
    const modelId = await resolveNamingModelId();
    const response = await deps.fetchWithAuth(
      `${deps.getServerBaseUrl()}/api/proxy/v1/messages`,
      {
        method: 'POST',
        headers: { ...deps.buildModelHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          max_tokens: NAMING_MAX_OUTPUT_TOKENS,
          temperature: 0,
          system: `You name conversations. Reply with three to ${SESSION_TITLE_MAX_WORDS} words and nothing else.`,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(NAMING_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.debug(`[SessionNaming] the naming call answered HTTP ${response.status}.`);
      return null;
    }
    return parseModelSessionTitle(readAnthropicReplyText(await response.json()));
  };

  const nameSessionNow = async (sessionId: string): Promise<void> => {
    const id = sessionId.trim();
    if (!id || attempted.has(id)) return;

    const session = deps.getSession(id);
    // A name the person typed, or one this already wrote, is left alone.
    if (!session || !canNameSession(session.titleSource)) return;
    if (!deps.isSignedIn()) return;

    const exchange = findFirstExchange(deps.getFirstMessages(id, FIRST_EXCHANGE_MESSAGE_LIMIT));
    if (!exchange) return;
    const prompt = buildSessionNamingPrompt(exchange);
    if (!prompt) return;

    attempted.add(id);
    try {
      const title = await requestName(prompt);
      if (!title) return;
      // The person may have renamed the chat while the model was thinking.
      const current = deps.getSession(id);
      if (!current || !canNameSession(current.titleSource)) return;
      deps.applyTitle(id, title);
      deps.notifySessionChanged(id);
      console.log(`[SessionNaming] named session ${id}.`);
    } catch (error) {
      // The truncation stays. A chat is never nameless.
      console.debug(`[SessionNaming] could not name session ${id}:`, error);
    }
  };

  return {
    nameSession: (sessionId: string) => {
      void nameSessionNow(sessionId).catch((error) => {
        console.debug('[SessionNaming] naming failed:', error);
      });
    },
    nameSessionNow,
  };
};
