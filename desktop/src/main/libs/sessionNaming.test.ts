import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SessionTitleSource } from '../../common/sessionTitle';
import {
  createSessionNamingService,
  DEFAULT_SESSION_NAMING_MODEL_ID,
  findFirstExchange,
  pickCheapestNamingModelId,
  readAnthropicReplyText,
  type SessionNamingDeps,
  type SessionNamingSession,
} from './sessionNaming';

describe('choosing the model', () => {
  test('takes the cheapest of the models this call can speak to', () => {
    const rows = [
      { modelId: 'claude-sonnet-5', apiFormat: 'anthropic', costMultiplier: 1 },
      { modelId: 'claude-opus-5', apiFormat: 'anthropic', costMultiplier: 5 },
      { modelId: 'claude-haiku-4-5-20251001', apiFormat: 'anthropic', costMultiplier: 0.2 },
      // Cheaper still in credits, but it speaks a different wire format;
      // this call speaks Anthropic's /v1/messages and nothing else.
      { modelId: 'gpt-5.6-luna', apiFormat: 'openai', costMultiplier: 0.067 },
    ];
    expect(pickCheapestNamingModelId(rows)).toBe('claude-haiku-4-5-20251001');
  });

  test('skips a model the account cannot reach', () => {
    const rows = [
      { modelId: 'cheap-but-locked', apiFormat: 'anthropic', costMultiplier: 0.1, accessible: false },
      { modelId: 'claude-haiku-4-5-20251001', apiFormat: 'anthropic', costMultiplier: 0.2 },
    ];
    expect(pickCheapestNamingModelId(rows)).toBe('claude-haiku-4-5-20251001');
  });

  test('an empty or unreadable list chooses nothing, and the caller falls back', () => {
    expect(pickCheapestNamingModelId([])).toBeNull();
    expect(pickCheapestNamingModelId([{ modelId: '', apiFormat: 'anthropic' }])).toBeNull();
  });
});

describe('reading what came back', () => {
  test('takes the text of an Anthropic reply', () => {
    expect(readAnthropicReplyText({ content: [{ type: 'text', text: 'Fixing the login failure' }] }))
      .toBe('Fixing the login failure');
    expect(readAnthropicReplyText({ content: [] })).toBeNull();
    expect(readAnthropicReplyText({ error: { message: 'no' } })).toBeNull();
    expect(readAnthropicReplyText(null)).toBeNull();
  });

  test('finds the first thing asked and the first thing answered', () => {
    expect(findFirstExchange([
      { type: 'system', content: 'session started' },
      { type: 'user', content: 'find my invoices' },
      { type: 'tool_use', content: '' },
      { type: 'assistant', content: 'I found eleven.' },
      { type: 'user', content: 'and the receipts?' },
    ])).toEqual({ question: 'find my invoices', answer: 'I found eleven.' });

    expect(findFirstExchange([{ type: 'assistant', content: 'hello' }])).toBeNull();
    // A question with no answer yet is still a question worth naming.
    expect(findFirstExchange([{ type: 'user', content: 'hi' }]))
      .toEqual({ question: 'hi', answer: '' });
  });
});

describe('naming a session', () => {
  const NAMED = 'Finding last quarter invoices';

  let session: SessionNamingSession;
  let applied: Array<{ sessionId: string; title: string }>;
  let notified: string[];
  let fetchWithAuth: ReturnType<typeof vi.fn>;

  const modelsResponse = () => new Response(
    JSON.stringify({
      code: 0,
      data: [{ modelId: 'claude-haiku-4-5-20251001', apiFormat: 'anthropic', costMultiplier: 0.2 }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const namingResponse = (text: string) => new Response(
    JSON.stringify({ content: [{ type: 'text', text }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const buildDeps = (overrides: Partial<SessionNamingDeps> = {}): SessionNamingDeps => ({
    getServerBaseUrl: () => 'https://api.example.test/desktop',
    fetchWithAuth: fetchWithAuth as unknown as SessionNamingDeps['fetchWithAuth'],
    isSignedIn: () => true,
    getSession: () => session,
    getFirstMessages: () => [
      { type: 'user', content: 'find last quarter’s invoices please' },
      { type: 'assistant', content: 'I found eleven of them.' },
    ],
    applyTitle: (sessionId, title) => {
      applied.push({ sessionId, title });
      session = { ...session, title, titleSource: SessionTitleSource.Assistant };
    },
    notifySessionChanged: (sessionId) => notified.push(sessionId),
    buildModelHeaders: () => ({ Accept: 'application/json' }),
    ...overrides,
  });

  beforeEach(() => {
    session = {
      id: 'session-1',
      title: 'find last quarter’s invoices please',
      titleSource: SessionTitleSource.Fallback,
    };
    applied = [];
    notified = [];
    fetchWithAuth = vi.fn(async (url: string) => (
      url.includes('/api/models/available') ? modelsResponse() : namingResponse(NAMED)
    ));
  });

  test('names a chat that still carries the truncation, and says so once', async () => {
    const service = createSessionNamingService(buildDeps());
    await service.nameSessionNow('session-1');

    expect(applied).toEqual([{ sessionId: 'session-1', title: NAMED }]);
    expect(notified).toEqual(['session-1']);

    const namingCall = fetchWithAuth.mock.calls
      .find(([url]) => String(url).includes('/api/proxy/v1/messages'));
    expect(namingCall).toBeDefined();
    const body = JSON.parse(String((namingCall?.[1] as RequestInit).body));
    expect(body.model).toBe(DEFAULT_SESSION_NAMING_MODEL_ID);
    expect(body.messages).toHaveLength(1);
  });

  test('once per chat and never per message', async () => {
    const service = createSessionNamingService(buildDeps());
    await service.nameSessionNow('session-1');
    await service.nameSessionNow('session-1');
    await service.nameSessionNow('session-1');

    expect(applied).toHaveLength(1);
    const namingCalls = fetchWithAuth.mock.calls
      .filter(([url]) => String(url).includes('/api/proxy/v1/messages'));
    expect(namingCalls).toHaveLength(1);
  });

  test('a name the person typed is never touched', async () => {
    session = { ...session, title: 'Invoices', titleSource: SessionTitleSource.Person };
    const service = createSessionNamingService(buildDeps());
    await service.nameSessionNow('session-1');

    expect(applied).toEqual([]);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  test('a rename that lands while the model is thinking still wins', async () => {
    const service = createSessionNamingService(buildDeps({
      fetchWithAuth: (async (url: string) => {
        if (String(url).includes('/api/models/available')) return modelsResponse();
        // The person renames the chat between the request and its answer.
        session = { ...session, title: 'Invoices', titleSource: SessionTitleSource.Person };
        return namingResponse(NAMED);
      }) as unknown as SessionNamingDeps['fetchWithAuth'],
    }));
    await service.nameSessionNow('session-1');

    expect(applied).toEqual([]);
    expect(session.title).toBe('Invoices');
  });

  test('offline, the chat keeps the truncation rather than going nameless', async () => {
    const service = createSessionNamingService(buildDeps({ isSignedIn: () => false }));
    await service.nameSessionNow('session-1');

    expect(applied).toEqual([]);
    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(session.title).toBe('find last quarter’s invoices please');
  });

  test('a failed call is not an error the person ever sees', async () => {
    const service = createSessionNamingService(buildDeps({
      fetchWithAuth: (async () => {
        throw new Error('network is down');
      }) as unknown as SessionNamingDeps['fetchWithAuth'],
    }));
    await expect(service.nameSessionNow('session-1')).resolves.toBeUndefined();

    expect(applied).toEqual([]);
    expect(session.titleSource).toBe(SessionTitleSource.Fallback);
  });

  test('a reply that is not a name is discarded, not shown', async () => {
    const service = createSessionNamingService(buildDeps({
      fetchWithAuth: (async (url: string) => (
        String(url).includes('/api/models/available')
          ? modelsResponse()
          : namingResponse('I am sorry, but I cannot name this conversation for you.')
      )) as unknown as SessionNamingDeps['fetchWithAuth'],
    }));
    await service.nameSessionNow('session-1');

    expect(applied).toEqual([]);
    expect(session.title).toBe('find last quarter’s invoices please');
  });
});
