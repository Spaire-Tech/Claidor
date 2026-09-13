import EventEmitter from 'node:events';

import { expect, test } from 'vitest';

import { IMCoworkHandler } from './imCoworkHandler';

class FakeRuntime extends EventEmitter {
  startCalls: Array<{ sessionId: string; prompt: string; options: Record<string, unknown> }> = [];
  continueCalls: Array<{ sessionId: string; prompt: string; options: Record<string, unknown> }> = [];

  async startSession(sessionId: string, prompt: string, options = {}) {
    this.startCalls.push({ sessionId, prompt, options });
  }

  async continueSession(sessionId: string, prompt: string, options = {}) {
    this.continueCalls.push({ sessionId, prompt, options });
  }

  stopSession() {}
  stopAllSessions() {}
  respondToPermission() {}
  isSessionActive() { return false; }
  getSessionConfirmationMode() { return 'text'; }
}

class FakeCoworkStore {
  config = {
    workingDirectory: process.cwd(),
    systemPrompt: '',
    executionMode: 'auto',
    agentEngine: 'openclaw',
  };
  sessions = new Map<string, Record<string, unknown>>();
  sessionCounter = 0;
  messageCounter = 0;

  getConfig() {
    return this.config;
  }

  getAgent() {
    return null;
  }

  createSession(title: string, cwd: string, systemPrompt: string, executionMode: string) {
    const id = `session-${++this.sessionCounter}`;
    const session = {
      id,
      title,
      cwd,
      systemPrompt,
      executionMode,
      claudeSessionId: null,
      status: 'idle',
      messages: [] as Array<Record<string, unknown>>,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string) {
    return this.sessions.get(id) || null;
  }

  updateSession(id: string, updates: Record<string, unknown>) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, updates);
  }

  addMessage(sessionId: string, message: Record<string, unknown>) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const created = {
      id: `message-${++this.messageCounter}`,
      timestamp: Date.now(),
      ...message,
    };
    (session.messages as Array<Record<string, unknown>>).push(created);
    return created;
  }
}

class FakeIMStore {
  mappings: Array<Record<string, unknown>> = [];
  settings = { skillsEnabled: false };

  getIMSettings() {
    return this.settings;
  }

  listSessionMappings() {
    return [...this.mappings];
  }

  getSessionMapping(imConversationId: string, platform: string) {
    return this.mappings.find((entry) => (
      entry.imConversationId === imConversationId && entry.platform === platform
    )) || null;
  }

  getSessionMappingByCoworkSessionId(coworkSessionId: string) {
    return this.mappings.find((entry) => entry.coworkSessionId === coworkSessionId) || null;
  }

  createSessionMapping(imConversationId: string, platform: string, coworkSessionId: string) {
    const mapping = {
      imConversationId,
      platform,
      coworkSessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.mappings.push(mapping);
    return mapping;
  }

  updateSessionLastActive(imConversationId: string, platform: string) {
    const mapping = this.getSessionMapping(imConversationId, platform);
    if (mapping) {
      mapping.lastActiveAt = Date.now();
    }
  }

  deleteSessionMapping(imConversationId: string, platform: string) {
    this.mappings = this.mappings.filter((entry) => (
      entry.imConversationId !== imConversationId || entry.platform !== platform
    ));
  }
}

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'nim',
    messageId: 'im-msg-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    senderName: 'Tester',
    content: 'Remind me to drink water in 2 minutes',
    chatType: 'direct',
    timestamp: Date.parse('2026-03-15T16:28:00+08:00'),
    ...overrides,
  };
}

test('IM scheduled-task requests bypass agent execution and create a real cron.add turn', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  let createdParams: Record<string, unknown> | null = null;

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    detectScheduledTaskRequest: async () => ({
      kind: 'create',
      sourceText: 'Remind me to drink water in 2 minutes',
      reminderBody: 'drink water',
      delayMs: 120000,
      delayLabel: 'in 2 minutes',
      runAt: new Date('2026-03-15T16:30:00+08:00'),
      scheduleAt: '2026-03-15T16:30:00+08:00',
      taskName: 'Drink water reminder',
      payloadText: '⏰ Reminder: drink water',
      confirmationText: 'Got it, your reminder is set! I will remind you in 2 minutes (16:30): drink water.',
    }),
    createScheduledTask: async (params: Record<string, unknown>) => {
      createdParams = params;
      return {
        id: 'job-1',
        name: (params.request as Record<string, unknown>).taskName,
        agentId: 'main',
        sessionKey: `agent:main:maties:${params.sessionId}`,
        payloadText: (params.request as Record<string, unknown>).payloadText,
        scheduleAt: (params.request as Record<string, unknown>).scheduleAt,
      };
    },
  });

  const reply = await handler.processMessage(createMessage());

  expect(reply).toMatch(/in 2 minutes \(16:30\): drink water/u);
  expect(runtime.startCalls.length).toBe(0);
  expect(runtime.continueCalls.length).toBe(0);
  expect(createdParams).toBeTruthy();
  expect((createdParams!.request as Record<string, unknown>).taskName).toBe('Drink water reminder');
  expect((createdParams!.request as Record<string, unknown>).payloadText).toBe('⏰ Reminder: drink water');

  const [session] = [...coworkStore.sessions.values()];
  expect(session).toBeTruthy();
  expect(
    (session.messages as Array<Record<string, unknown>>).map((message) => message.type),
  ).toEqual(['user', 'tool_use', 'tool_result', 'assistant']);
  expect(((session.messages as Array<Record<string, unknown>>)[1].metadata as Record<string, unknown>).toolName).toBe('cron');
  expect(((session.messages as Array<Record<string, unknown>>)[1].metadata as Record<string, unknown>).toolInput as Record<string, unknown>).toHaveProperty('action', 'add');
  expect(((session.messages as Array<Record<string, unknown>>)[2].metadata as Record<string, unknown>).isError).toBe(false);

  handler.destroy();
});

test.skip('async reminder turns on IM-created sessions relay back to the original IM conversation', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  const relayedReplies: Array<{ platform: string; conversationId: string; text: string }> = [];

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    detectScheduledTaskRequest: async () => ({
      kind: 'create',
      sourceText: 'Remind me to drink water in 2 minutes',
      reminderBody: 'drink water',
      delayMs: 120000,
      delayLabel: 'in 2 minutes',
      runAt: new Date('2026-03-15T16:30:00+08:00'),
      scheduleAt: '2026-03-15T16:30:00+08:00',
      taskName: 'Drink water reminder',
      payloadText: '⏰ Reminder: drink water',
      confirmationText: 'Got it, your reminder is set! I will remind you in 2 minutes (16:30): drink water.',
    }),
    createScheduledTask: async (params: Record<string, unknown>) => ({
      id: 'job-1',
      name: (params.request as Record<string, unknown>).taskName,
      agentId: 'main',
      sessionKey: `agent:main:maties:${params.sessionId}`,
      payloadText: (params.request as Record<string, unknown>).payloadText,
      scheduleAt: (params.request as Record<string, unknown>).scheduleAt,
    }),
    sendAsyncReply: async (platform: string, conversationId: string, text: string) => {
      relayedReplies.push({ platform, conversationId, text });
      return true;
    },
  });

  await handler.processMessage(createMessage());
  const [session] = [...coworkStore.sessions.values()];

  runtime.emit('message', session.id, {
    id: 'system-1',
    type: 'system',
    content: '⏰ Reminder: drink water',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', session.id, {
    id: 'assistant-1',
    type: 'assistant',
    content: '⏰ Time to drink water! Get up and have a glass.',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', session.id, null);

  await new Promise((resolve) => setImmediate(resolve));

  expect(relayedReplies).toEqual([
    {
      platform: 'nim',
      conversationId: 'conv-1',
      text: '⏰ Time to drink water! Get up and have a glass.',
    },
  ]);

  handler.destroy();
});

test('async reminder turns on channel-synced sessions are tracked lazily and relay back', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  const relayedReplies: Array<{ platform: string; conversationId: string; text: string }> = [];

  const session = coworkStore.createSession('IM-dingtalk', process.cwd(), '', 'auto');
  imStore.createSessionMapping('default:user-42', 'dingtalk', session.id as string);

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    sendAsyncReply: async (platform: string, conversationId: string, text: string) => {
      relayedReplies.push({ platform, conversationId, text });
      return true;
    },
  });

  runtime.emit('message', session.id, {
    id: 'system-1',
    type: 'system',
    content: '⏰ Reminder: meeting',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', session.id, {
    id: 'assistant-1',
    type: 'assistant',
    content: 'Time is up, remember the meeting.',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', session.id, null);

  await new Promise((resolve) => setImmediate(resolve));

  expect(relayedReplies).toEqual([
    {
      platform: 'dingtalk',
      conversationId: 'default:user-42',
      text: 'Time is up, remember the meeting.',
    },
  ]);

  handler.destroy();
});

test('falls back to normal agent execution when detector does not recognize a scheduled task', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    detectScheduledTaskRequest: async () => null,
  });

  const pending = handler.processMessage(createMessage({ content: 'Summarize the notes from the meeting today' }));
  await new Promise((resolve) => setImmediate(resolve));

  expect(runtime.startCalls.length).toBe(1);
  expect(runtime.startCalls[0].prompt).toBe('Summarize the notes from the meeting today');

  runtime.emit('message', 'session-1', {
    id: 'assistant-1',
    type: 'assistant',
    content: 'Here is the meeting notes summary.',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', 'session-1', null);

  const reply = await pending;
  expect(reply).toBe('Here is the meeting notes summary.');

  handler.destroy();
});

test('uses only current-turn store messages when completing an IM reply', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
  });

  const pending = handler.processMessage(createMessage({ content: 'Check the staging logs' }));
  await new Promise((resolve) => setImmediate(resolve));

  const sessionId = 'session-1';
  coworkStore.addMessage(sessionId, {
    id: 'old-user',
    type: 'user',
    content: 'Previous-turn question',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'old-assistant',
    type: 'assistant',
    content: 'Previous-turn answer that must not appear in this IM reply.',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'current-user',
    type: 'user',
    content: 'Check the staging logs',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'current-assistant',
    type: 'assistant',
    content: 'Final answer for the current turn.',
    metadata: {},
  });

  runtime.emit('message', sessionId, {
    id: 'current-user',
    type: 'user',
    content: 'Check the staging logs',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', sessionId, {
    id: 'current-assistant',
    type: 'assistant',
    content: 'Current-turn streaming snapshot',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', sessionId, null);

  const reply = await pending;
  expect(reply).toBe('Final answer for the current turn.');
  expect(reply).not.toContain('Previous-turn answer');

  handler.destroy();
});

test('falls back to current user boundary when reconciled store message ids changed', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
  });

  const pending = handler.processMessage(createMessage({ content: 'Keep investigating the error' }));
  await new Promise((resolve) => setImmediate(resolve));

  const sessionId = 'session-1';
  coworkStore.addMessage(sessionId, {
    id: 'history-user',
    type: 'user',
    content: 'Historical question',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'history-assistant',
    type: 'assistant',
    content: 'Historical answer that must not be sent.',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'store-current-user',
    type: 'user',
    content: 'Keep investigating the error',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'runtime-tool-use',
    type: 'tool_use',
    content: 'Using tool: exec',
    metadata: { toolName: 'exec', toolUseId: 'tool-1' },
  });
  coworkStore.addMessage(sessionId, {
    id: 'store-current-assistant',
    type: 'assistant',
    content: 'Final answer for the current turn found via the boundary.',
    metadata: {},
  });

  runtime.emit('message', sessionId, {
    id: 'runtime-current-user',
    type: 'user',
    content: 'Keep investigating the error',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', sessionId, {
    id: 'runtime-tool-use',
    type: 'tool_use',
    content: 'Using tool: exec',
    timestamp: Date.now(),
    metadata: { toolName: 'exec', toolUseId: 'tool-1' },
  });
  runtime.emit('message', sessionId, {
    id: 'runtime-current-assistant',
    type: 'assistant',
    content: 'Current-turn streaming snapshot',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', sessionId, null);

  const reply = await pending;
  expect(reply).toBe('Final answer for the current turn found via the boundary.');
  expect(reply).not.toContain('Historical answer');

  handler.destroy();
});

test('strips thinking blocks from normal IM replies', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
  });

  const pending = handler.processMessage(createMessage({ content: 'Give me the conclusion' }));
  await new Promise((resolve) => setImmediate(resolve));

  const sessionId = 'session-1';
  coworkStore.addMessage(sessionId, {
    id: 'current-user',
    type: 'user',
    content: 'Give me the conclusion',
    metadata: {},
  });
  coworkStore.addMessage(sessionId, {
    id: 'thinking-message',
    type: 'assistant',
    content: 'This structured thinking must not be sent',
    metadata: { isThinking: true },
  });
  coworkStore.addMessage(sessionId, {
    id: 'current-assistant',
    type: 'assistant',
    content: '<think>internal reasoning</think>Final answer',
    metadata: {},
  });

  runtime.emit('message', sessionId, {
    id: 'current-user',
    type: 'user',
    content: 'Give me the conclusion',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', sessionId, {
    id: 'thinking-message',
    type: 'assistant',
    content: 'This structured thinking must not be sent',
    timestamp: Date.now(),
    metadata: { isThinking: true },
  });
  runtime.emit('message', sessionId, {
    id: 'current-assistant',
    type: 'assistant',
    content: '<think>internal reasoning</think>Final answer',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', sessionId, null);

  const reply = await pending;
  expect(reply).toBe('Final answer');

  handler.destroy();
});

test('does not relay thinking content for raw async reminder replies', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  const relayedReplies: Array<{ platform: string; conversationId: string; text: string }> = [];

  const session = coworkStore.createSession('IM-dingtalk', process.cwd(), '', 'auto');
  imStore.createSessionMapping('default:user-42', 'dingtalk', session.id as string);

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    sendAsyncReply: async (platform: string, conversationId: string, text: string) => {
      relayedReplies.push({ platform, conversationId, text });
      return true;
    },
  });

  runtime.emit('message', session.id, {
    id: 'system-1',
    type: 'system',
    content: '⏰ Reminder: meeting',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', session.id, {
    id: 'thinking-1',
    type: 'assistant',
    content: 'internal reasoning',
    timestamp: Date.now(),
    metadata: { isThinking: true },
  });
  runtime.emit('message', session.id, {
    id: 'assistant-1',
    type: 'assistant',
    content: '<thinking>decide the reminder tone first</thinking>Time is up, remember the meeting.',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', session.id, null);

  await new Promise((resolve) => setImmediate(resolve));

  expect(relayedReplies).toEqual([
    {
      platform: 'dingtalk',
      conversationId: 'default:user-42',
      text: 'Time is up, remember the meeting.',
    },
  ]);

  handler.destroy();
});
