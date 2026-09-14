import { describe, expect, test } from 'vitest';

import {
  ASK_USER_TOOL,
  askUserQuestions,
  authQuestion,
  choiceId,
  commandFromToolInput,
  decisionNote,
  type EngineMessage,
  type EnginePermissionRequest,
  parseChoiceId,
  splitIntoBubbles,
  toThreadItems,
} from './fromEngine';
import { allVerbs, GENERIC_VERB, verbForTool } from './toolVerbs';
import { ThreadItemKind } from './types';

let clock = 1_700_000_000_000;
const msg = (m: Partial<EngineMessage> & Pick<EngineMessage, 'type'>): EngineMessage => ({
  id: `m${clock}`,
  content: '',
  timestamp: (clock += 1000),
  ...m,
});

describe('what a person never sees', () => {
  test('thinking is dropped', () => {
    const items = toThreadItems([
      msg({ type: 'assistant', content: 'Let me consider…', metadata: { isThinking: true } }),
      msg({ type: 'assistant', content: 'Two of the figures do not match.' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: ThreadItemKind.Text });
  });

  test('a tool result is dropped, and it takes its status with it', () => {
    const items = toThreadItems([
      msg({ type: 'tool_use', metadata: { toolName: 'bash', toolUseId: 't1' } }),
      msg({ type: 'tool_result', content: 'total 48\ndrwxr-xr-x …', metadata: { toolUseId: 't1' } }),
    ]);
    // The whole exchange leaves nothing behind — which is the design's
    // "removed when the work finishes".
    expect(items).toEqual([]);
  });

  test('work still in flight keeps its status', () => {
    const items = toThreadItems([
      msg({ type: 'tool_use', metadata: { toolName: 'web_search', toolUseId: 't1' } }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({ kind: ThreadItemKind.Status, verb: 'Searching the web' }),
    ]);
  });

  test('a tool name never reaches the thread', () => {
    const items = toThreadItems([
      msg({ type: 'tool_use', metadata: { toolName: 'mcp__gmail__send_message', toolUseId: 'a' } }),
      msg({ type: 'tool_use', metadata: { toolName: 'sessions_spawn', toolUseId: 'b' } }),
      msg({ type: 'tool_use', metadata: { toolName: 'some_future_tool', toolUseId: 'c' } }),
    ]);
    const written = JSON.stringify(items);
    for (const forbidden of ['mcp__', 'sessions_spawn', 'some_future_tool', '_']) {
      expect(written).not.toContain(forbidden);
    }
  });

  test('an empty reply makes no bubble', () => {
    expect(toThreadItems([
      msg({ type: 'assistant', content: '   ' }),
      msg({ type: 'user', content: '' }),
    ])).toEqual([]);
  });
});

describe('errors', () => {
  test('are system lines, not a red banner', () => {
    const items = toThreadItems([
      msg({ type: 'assistant', content: '', metadata: { isError: true, error: 'The file is locked.' } }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({ kind: ThreadItemKind.System, text: 'The file is locked.' }),
    ]);
  });

  test('fall back to the message body when there is no error text', () => {
    const items = toThreadItems([
      msg({ type: 'assistant', content: 'That did not work.', metadata: { isError: true } }),
    ]);
    expect(items[0]).toMatchObject({ kind: ThreadItemKind.System, text: 'That did not work.' });
  });
});

describe('text arrives as texts', () => {
  test('a reply splits on blank lines', () => {
    expect(splitIntoBubbles('One.\n\nTwo.\n\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });

  test('never more than three bubbles, and nothing is lost', () => {
    const parts = splitIntoBubbles('A\n\nB\n\nC\n\nD\n\nE');
    expect(parts).toHaveLength(3);
    // The tail is kept in the last bubble rather than dropped: losing an
    // answer to a formatting rule would be the app eating it.
    expect(parts[2]).toBe('C\n\nD\n\nE');
    expect(parts.join('\n\n')).toBe('A\n\nB\n\nC\n\nD\n\nE');
  });

  test('one paragraph stays one bubble', () => {
    const items = toThreadItems([msg({ type: 'assistant', content: 'Cleared them.' })]);
    expect(items).toHaveLength(1);
  });

  test('a streaming reply is not split while it is still arriving', () => {
    // Splitting a half-arrived answer would make bubbles appear and then
    // re-split as more lands.
    const items = toThreadItems([
      msg({ type: 'assistant', content: 'One.\n\nTwo.', metadata: { isStreaming: true } }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ streaming: true });
  });

  test('split bubbles get distinct ids so a list can key them', () => {
    const items = toThreadItems([
      msg({ id: 'reply', type: 'assistant', content: 'One.\n\nTwo.' }),
    ]);
    expect(items.map(i => i.id)).toEqual(['reply:0', 'reply:1']);
  });
});

describe('the approval card', () => {
  const request = {
    requestId: 'r1',
    toolName: 'bash',
    toolInput: { command: 'ls -t ~/Documents/**/*.xlsx | head -1' },
  };

  test('shows the real command, not a summary', () => {
    const items = toThreadItems([], { pending: [request], agentName: 'Perrin', deviceId: '6c0f8fd9' });
    expect(items).toEqual([
      expect.objectContaining({
        kind: ThreadItemKind.Auth,
        command: 'ls -t ~/Documents/**/*.xlsx | head -1',
        deviceId: '6c0f8fd9',
      }),
    ]);
  });

  test('falls back to the whole input rather than showing nothing', () => {
    expect(commandFromToolInput({ pattern: '*.xlsx', limit: 1 }))
      .toBe('{\n  "pattern": "*.xlsx",\n  "limit": 1\n}');
    expect(commandFromToolInput({})).toBeUndefined();
  });

  test('asks in a sentence, naming nothing technical', () => {
    const question = authQuestion('Perrin', 'bash');
    expect(question).toBe('Allow Perrin to continue — running commands on your computer?');
    expect(question).not.toContain('bash');
  });

  test('names the agent, never its id', () => {
    // The first build passed `agentId` through to the question and the
    // card read "Allow juno to continue". A person is being asked to
    // trust something that cannot say its own name.
    const items = toThreadItems([], {
      agentId: 'engineering-lead',
      agentName: 'Engineering Lead',
      pending: [request],
    });
    expect(items[0]).toMatchObject({
      text: 'Allow Engineering Lead to continue — running commands on your computer?',
    });
    expect((items[0] as { text: string }).text).not.toContain('engineering-lead');
  });

  test('says "this agent" rather than an id when the name is missing', () => {
    const items = toThreadItems([], { agentId: 'juno', pending: [request] });
    expect((items[0] as { text: string }).text).toContain('this agent');
    expect((items[0] as { text: string }).text).not.toContain('juno');
  });

  test('waits at the bottom, where the person is looking', () => {
    const items = toThreadItems(
      [msg({ type: 'assistant', content: 'On it.' })],
      { pending: [request] },
    );
    expect(items[items.length - 1].kind).toBe(ThreadItemKind.Auth);
  });

  test('answering it leaves one plain line', () => {
    expect(decisionNote('Perrin', 'always'))
      .toBe('Perrin can run commands on your computer from now on.');
    expect(decisionNote('Perrin', 'never'))
      .toBe("Declined. Perrin can't run commands on your computer.");
  });
});

describe('group threads', () => {
  test('carry the sender, so a bubble knows whose orb to wear', () => {
    const items = toThreadItems([msg({ type: 'assistant', content: 'Mira here.' })], {
      agentId: 'mira',
      group: true,
    });
    expect(items[0]).toMatchObject({ agentId: 'mira' });
  });

  test('a one-to-one thread does not, because the header already says', () => {
    const items = toThreadItems([msg({ type: 'assistant', content: 'Hi.' })], { agentId: 'mira' });
    expect(items[0]).not.toHaveProperty('agentId');
  });
});

describe('verbs', () => {
  test('every tool the engine ships has one', () => {
    for (const tool of ['read', 'write', 'edit', 'bash', 'grep', 'glob',
      'web_search', 'web_fetch', 'memory_search', 'sessions_spawn', 'image_generate']) {
      expect(verbForTool(tool), tool).not.toBe(GENERIC_VERB);
    }
  });

  test('a connector tool names the service a person recognises', () => {
    expect(verbForTool('mcp__gmail__send_message')).toBe('Working in Gmail');
    expect(verbForTool('mcp__google-calendar__create_event')).toBe('Working in Google Calendar');
  });

  test('an unknown tool is a sentence, never its own name', () => {
    expect(verbForTool('quantum_flux')).toBe(GENERIC_VERB);
    expect(verbForTool(undefined)).toBe(GENERIC_VERB);
    expect(verbForTool('')).toBe(GENERIC_VERB);
  });

  test('a specific verb beats its family default', () => {
    expect(verbForTool('browser_navigate')).toBe('Opening a page');
    expect(verbForTool('browser_something_new')).toBe('Using the browser');
  });

  test('every verb reads as something a person would say', () => {
    for (const verb of allVerbs()) {
      expect(verb, verb).toMatch(/^[A-Z]/);
      expect(verb, verb).not.toMatch(/[_{}[\]]/);
      expect(verb.length, verb).toBeLessThan(40);
    }
  });
});

describe('the agent asking a question', () => {
  const ask = (questions: unknown, requestId = 'r1'): EnginePermissionRequest => ({
    requestId,
    toolName: ASK_USER_TOOL,
    toolInput: { questions },
  });

  const one = {
    question: 'How do you want me to get at it?',
    header: 'Two ways in',
    options: [
      { label: 'Try again on this Mac', description: "I'll approve the next request" },
      { label: 'Different file' },
    ],
  };

  test('becomes a choice card, not an approval prompt', () => {
    // This is the whole of review item 19. AskUserQuestion arrives as a
    // permission request, and every permission request was drawn as the
    // approval card — so a question with three options appeared as
    // "Allow X to continue", with the question hidden behind a
    // disclosure triangle.
    const [item] = toThreadItems([], { pending: [ask([one])] });
    expect(item.kind).toBe(ThreadItemKind.Choice);
    if (item.kind !== ThreadItemKind.Choice) throw new Error('not a choice');
    expect(item.text).toBe('How do you want me to get at it?');
    expect(item.note).toBe('Two ways in');
  });

  test('options are lettered from A, as the canvas letters them', () => {
    const [item] = toThreadItems([], { pending: [ask([one])] });
    if (item.kind !== ThreadItemKind.Choice) throw new Error('not a choice');
    expect(item.options.map(o => o.key)).toEqual(['A', 'B']);
    expect(item.options[0].label).toBe('Try again on this Mac');
    expect(item.options[0].hint).toBe("I'll approve the next request");
    expect(item.options[1]).not.toHaveProperty('hint');
  });

  test('every card offers a free answer', () => {
    const [item] = toThreadItems([], { pending: [ask([one])] });
    if (item.kind !== ThreadItemKind.Choice) throw new Error('not a choice');
    expect(item.freeform).toBe(true);
  });

  test('several questions are several cards, in order', () => {
    const two = { ...one, question: 'And after that?' };
    const items = toThreadItems([], { pending: [ask([one, two])] });
    expect(items).toHaveLength(2);
    expect(items.map(i => i.id)).toEqual(['choice:r1:0', 'choice:r1:1']);
  });

  test('an answered question leaves, and the rest stay', () => {
    // The request is open until all of them are answered. Without this,
    // a card you have already pressed sits there waiting to be pressed
    // again — the dead control, one more time.
    const two = { ...one, question: 'And after that?' };
    const items = toThreadItems([], {
      pending: [ask([one, two])],
      answered: { r1: { [one.question]: 'Try again on this Mac' } },
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('choice:r1:1');
  });

  test('anything else is still the approval card', () => {
    const [item] = toThreadItems([], {
      pending: [{ requestId: 'r2', toolName: 'Bash', toolInput: { command: 'ls' } }],
    });
    expect(item.kind).toBe(ThreadItemKind.Auth);
  });
});

describe('askUserQuestions', () => {
  const ask = (questions: unknown): EnginePermissionRequest => ({
    requestId: 'r1',
    toolName: ASK_USER_TOOL,
    toolInput: { questions },
  });

  test('is empty for any other tool', () => {
    expect(askUserQuestions({ requestId: 'r', toolName: 'Bash', toolInput: {} })).toEqual([]);
  });

  test('survives a model writing nonsense', () => {
    // The input is a tool call written by a model, so its shape is a
    // claim rather than a guarantee.
    expect(askUserQuestions(ask(undefined))).toEqual([]);
    expect(askUserQuestions(ask('questions'))).toEqual([]);
    expect(askUserQuestions(ask([null, 42, 'x']))).toEqual([]);
  });

  test('drops a question with no text, and one with no options', () => {
    expect(askUserQuestions(ask([
      { question: '  ', options: [{ label: 'A' }] },
      { question: 'Real?', options: [] },
      { question: 'Real?', options: [{ label: '   ' }] },
    ]))).toEqual([]);
  });

  test('keeps a good one out of a bad list', () => {
    const kept = askUserQuestions(ask([
      null,
      { question: 'Which?', options: [{ label: 'This' }, { label: '' }] },
    ]));
    expect(kept).toHaveLength(1);
    expect(kept[0].options).toEqual([{ label: 'This' }]);
  });

  test('carries multiSelect only when it is really set', () => {
    const [q] = askUserQuestions(ask([{ question: 'Which?', options: [{ label: 'A' }], multiSelect: true }]));
    expect(q.multiSelect).toBe(true);
    const [plain] = askUserQuestions(ask([{ question: 'Which?', options: [{ label: 'A' }] }]));
    expect(plain).not.toHaveProperty('multiSelect');
  });
});

describe('choice ids', () => {
  test('go there and back', () => {
    expect(parseChoiceId(choiceId('abc-123', 2))).toEqual({ requestId: 'abc-123', index: 2 });
  });

  test('survive a request id with colons in it', () => {
    expect(parseChoiceId(choiceId('a:b:c', 0))).toEqual({ requestId: 'a:b:c', index: 0 });
  });

  test('are undefined for anything else', () => {
    expect(parseChoiceId('auth:abc')).toBeUndefined();
    expect(parseChoiceId('msg-1')).toBeUndefined();
  });
});
