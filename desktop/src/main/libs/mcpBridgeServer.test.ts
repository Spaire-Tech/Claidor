import { describe, expect, test } from 'vitest';

import type { RosterAsk } from '../../shared/staffing/roster';
import { type AskUserRequest, McpBridgeServer } from './mcpBridgeServer';

const makeQuestions = (): AskUserRequest['questions'] => [{
  question: 'Continue?',
  options: [
    { label: 'Yes' },
    { label: 'No' },
  ],
}];

describe('McpBridgeServer AskUser session attribution', () => {
  test('passes sessionKey from HTTP AskUser callback requests', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    const received: AskUserRequest[] = [];

    try {
      await server.start();
      const url = server.askUserCallbackUrl;
      expect(url).toBeTruthy();

      server.onAskUser(request => {
        received.push(request);
        server.resolveAskUser(request.requestId, { behavior: 'allow' });
      });

      const response = await fetch(url!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ask-user-secret': secret,
        },
        body: JSON.stringify({
          sessionKey: 'agent:main:lobsterai:session-a',
          questions: makeQuestions(),
        }),
      });

      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toEqual({ behavior: 'allow' });
      expect(received).toHaveLength(1);
      expect(received[0].sessionKey).toBe('agent:main:lobsterai:session-a');
    } finally {
      await server.stop();
    }
  });

  test('passes sessionKey from internal AskUser requests', async () => {
    const server = new McpBridgeServer('test-secret');
    const received: AskUserRequest[] = [];

    server.onAskUser(request => {
      received.push(request);
      server.resolveAskUser(request.requestId, { behavior: 'deny' });
    });

    await expect(server.askUserInternal(
      makeQuestions(),
      1_000,
      { sessionKey: 'agent:main:lobsterai:session-b' },
    )).resolves.toEqual({ behavior: 'deny' });

    expect(received).toHaveLength(1);
    expect(received[0].sessionKey).toBe('agent:main:lobsterai:session-b');
  });
});

describe('McpBridgeServer browser bridge', () => {
  test('authenticates and forwards browser tool requests', async () => {
    const secret = 'browser-test-secret';
    const server = new McpBridgeServer(secret);

    try {
      await server.start();
      server.onBrowserTool(async request => ({
        content: [{ type: 'text', text: request.tool }],
        structuredContent: { args: request.args },
      }));

      const unauthorized = await fetch(server.browserCallbackUrl!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool: 'list_pages', args: {} }),
      });
      expect(unauthorized.status).toBe(401);

      const response = await fetch(server.browserCallbackUrl!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mcp-bridge-secret': secret,
        },
        body: JSON.stringify({ tool: 'navigate_page', args: { pageId: 7 } }),
      });
      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toEqual({
        content: [{ type: 'text', text: 'navigate_page' }],
        structuredContent: { args: { pageId: 7 } },
      });
    } finally {
      await server.stop();
    }
  });
});

describe('McpBridgeServer standing up an agent', () => {
  const brief = {
    name: 'Projects Manager',
    label: 'Project ops',
    job: 'Runs projects; specialists claim tasks.',
    antiJobs: ["Won't do specialist work itself"],
  };
  const post = (url: string, secret: string, body: unknown) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': secret },
    body: JSON.stringify(body),
  });

  test('the card goes up, Stand up creates the agent, and the tool gets its id', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    const shown: unknown[] = [];
    const performed: unknown[] = [];
    try {
      await server.start();
      server.onCreateAgent(ask => {
        shown.push(ask);
        server.resolveCreateAgent(ask.requestId, { behavior: 'allow' });
      });
      server.setCreateAgentPerformer(async input => {
        performed.push(input);
        return { agentId: 'agent-42', name: input.name };
      });

      const response = await post(server.createAgentCallbackUrl!, secret, brief);
      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toEqual({
        behavior: 'created', agentId: 'agent-42', name: 'Projects Manager',
      });
      expect(shown).toHaveLength(1);
      expect(shown[0]).toMatchObject(brief);
      expect(performed).toEqual([brief]);
    } finally {
      await server.stop();
    }
  });

  test('Not now creates nothing and tells the tool so', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    let performed = 0;
    try {
      await server.start();
      server.onCreateAgent(ask => server.resolveCreateAgent(ask.requestId, { behavior: 'decline' }));
      server.setCreateAgentPerformer(async () => {
        performed += 1;
        return { agentId: 'never', name: 'never' };
      });
      const response = await post(server.createAgentCallbackUrl!, secret, brief);
      await expect(response.json()).resolves.toEqual({ behavior: 'declined' });
      expect(performed).toBe(0);
    } finally {
      await server.stop();
    }
  });

  test('a brief with no anti-jobs never reaches the card', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    let shown = 0;
    try {
      await server.start();
      server.onCreateAgent(() => { shown += 1; });
      server.setCreateAgentPerformer(async () => ({ agentId: 'never', name: 'never' }));
      const response = await post(server.createAgentCallbackUrl!, secret, { ...brief, antiJobs: [] });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ behavior: 'failed' });
      expect(shown).toBe(0);
    } finally {
      await server.stop();
    }
  });

  test('with nobody to draw the card, the tool is declined rather than left waiting', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      const response = await post(server.createAgentCallbackUrl!, secret, brief);
      await expect(response.json()).resolves.toEqual({ behavior: 'declined' });
    } finally {
      await server.stop();
    }
  });
});

describe('McpBridgeServer proposing a starter team', () => {
  const post = (url: string, secret: string, body: unknown) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': secret },
    body: JSON.stringify(body),
  });

  test('the card goes up with the founder\'s three; Stand them up stands each up and the tool is told who is in', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    const shown: RosterAsk[] = [];
    const performed: string[] = [];
    try {
      await server.start();
      server.onRoster(ask => {
        shown.push(ask);
        server.resolveRoster(ask.requestId, { behavior: 'standUp', slugs: ask.team.map(one => one.slug) });
      });
      server.setCreateAgentPerformer(async input => {
        performed.push(input.name);
        return { agentId: `agent-${performed.length}`, name: input.name };
      });

      const response = await post(server.proposeTeamCallbackUrl!, secret, { workType: 'Founder / Business Owner' });
      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.behavior).toBe('stoodUp');
      expect(result.agents.map((one: { name: string }) => one.name)).toEqual(['Projects Manager', 'Outbound Prospecting', 'GTM Loop Closer']);
      expect(result.failed).toEqual([]);
      expect(shown).toHaveLength(1);
      expect(shown[0].workType).toBe('Founder / Business Owner');
      expect(shown[0].team).toHaveLength(3);
      expect(performed).toEqual(['Projects Manager', 'Outbound Prospecting', 'GTM Loop Closer']);
    } finally {
      await server.stop();
    }
  });

  test('a swapped-in alternate is stood up, and one that fails is reported, not hidden', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      server.onRoster(ask => {
        server.resolveRoster(ask.requestId, { behavior: 'standUp', slugs: [ask.team[0].slug, ask.alternates[0].slug] });
      });
      server.setCreateAgentPerformer(async input => {
        if (input.name === 'Projects Manager') throw new Error('the engine is restarting');
        return { agentId: 'agent-x', name: input.name };
      });
      const response = await post(server.proposeTeamCallbackUrl!, secret, { workType: 'Founder / Business Owner' });
      const result = await response.json();
      expect(result.behavior).toBe('stoodUp');
      expect(result.agents).toHaveLength(1);
      expect(result.failed).toEqual([{ slug: 'projects-manager', name: 'Projects Manager', reason: 'the engine is restarting' }]);
    } finally {
      await server.stop();
    }
  });

  test('an answer naming a row that was never on the card is refused and the card stays up', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    let performed = 0;
    try {
      await server.start();
      server.onRoster(ask => {
        server.resolveRoster(ask.requestId, { behavior: 'standUp', slugs: ['skippy', 'cooper'] });
        // The refusal leaves the promise pending; a real answer settles it.
        server.resolveRoster(ask.requestId, { behavior: 'decline' });
      });
      server.setCreateAgentPerformer(async () => {
        performed += 1;
        return { agentId: 'never', name: 'never' };
      });
      const response = await post(server.proposeTeamCallbackUrl!, secret, { workType: 'Finance' });
      await expect(response.json()).resolves.toEqual({ behavior: 'declined' });
      expect(performed).toBe(0);
    } finally {
      await server.stop();
    }
  });

  test('Something else comes back as the line they typed, and nothing is created', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    let performed = 0;
    try {
      await server.start();
      server.onRoster(ask => server.resolveRoster(ask.requestId, { behavior: 'somethingElse', text: 'someone for grants' }));
      server.setCreateAgentPerformer(async () => {
        performed += 1;
        return { agentId: 'never', name: 'never' };
      });
      const response = await post(server.proposeTeamCallbackUrl!, secret, { workType: 'Student' });
      await expect(response.json()).resolves.toEqual({ behavior: 'somethingElse', text: 'someone for grants' });
      expect(performed).toBe(0);
    } finally {
      await server.stop();
    }
  });

  test('an unknown work type with no picks never reaches the card', async () => {
    const secret = 'test-secret';
    const server = new McpBridgeServer(secret);
    let shown = 0;
    try {
      await server.start();
      server.onRoster(() => { shown += 1; });
      server.setCreateAgentPerformer(async () => ({ agentId: 'never', name: 'never' }));
      const response = await post(server.proposeTeamCallbackUrl!, secret, { workType: 'I run a bakery' });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ behavior: 'failed' });
      expect(shown).toBe(0);
    } finally {
      await server.stop();
    }
  });
});
