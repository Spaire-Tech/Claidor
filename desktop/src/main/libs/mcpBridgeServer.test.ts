import { describe, expect, test } from 'vitest';

import {
  LIBRARY_BRIDGE_SEARCH_PATH,
  LibraryContentLimits,
  LibraryDocumentKind,
  type LibrarySearchResponse,
} from '../../shared/library/contentConstants';
import { type AskUserRequest, type LibrarySearchBridgeRequest, McpBridgeServer } from './mcpBridgeServer';

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
          sessionKey: 'agent:main:maties:session-a',
          questions: makeQuestions(),
        }),
      });

      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toEqual({ behavior: 'allow' });
      expect(received).toHaveLength(1);
      expect(received[0].sessionKey).toBe('agent:main:maties:session-a');
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
      { sessionKey: 'agent:main:maties:session-b' },
    )).resolves.toEqual({ behavior: 'deny' });

    expect(received).toHaveLength(1);
    expect(received[0].sessionKey).toBe('agent:main:maties:session-b');
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

describe('McpBridgeServer library search', () => {
  const secret = 'library-test-secret';

  const postSearch = (url: string, body: unknown, withSecret = true) => fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withSecret ? { 'x-mcp-bridge-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });

  const makeResponse = (): LibrarySearchResponse => ({
    hits: [{
      documentId: 'doc-1',
      filePath: '/Users/ada/Documents/lease.pdf',
      fileName: 'lease.pdf',
      kind: LibraryDocumentKind.Pdf,
      locator: { page: 3 },
      text: 'The lease runs for three years from 1 January.',
      score: 0.83,
      modifiedAt: 1_700_000_000_000,
    }],
    documentCount: 12,
    vectorsUsed: true,
    tookMs: 4,
  });

  test('exposes the search callback URL on the bridge path once started', async () => {
    const server = new McpBridgeServer(secret);
    expect(server.librarySearchCallbackUrl).toBeNull();
    try {
      await server.start();
      expect(server.librarySearchCallbackUrl).toBe(`http://127.0.0.1:${server.port}${LIBRARY_BRIDGE_SEARCH_PATH}`);
    } finally {
      await server.stop();
    }
  });

  test('rejects requests without the secret', async () => {
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      server.onLibrarySearch(async () => makeResponse());

      const response = await postSearch(server.librarySearchCallbackUrl!, { query: 'lease' }, false);
      expect(response.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  test('rejects an empty or oversized query with 400', async () => {
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      server.onLibrarySearch(async () => makeResponse());

      const empty = await postSearch(server.librarySearchCallbackUrl!, { query: '   ' });
      expect(empty.status).toBe(400);
      await expect(empty.json()).resolves.toEqual({ error: expect.stringContaining('query') });

      const missing = await postSearch(server.librarySearchCallbackUrl!, {});
      expect(missing.status).toBe(400);

      const tooLong = await postSearch(server.librarySearchCallbackUrl!, {
        query: 'x'.repeat(LibraryContentLimits.MaxQueryLength + 1),
      });
      expect(tooLong.status).toBe(400);
      await expect(tooLong.json()).resolves.toEqual({ error: expect.stringContaining(String(LibraryContentLimits.MaxQueryLength)) });
    } finally {
      await server.stop();
    }
  });

  test('forwards a valid search to the callback and round-trips the JSON', async () => {
    const server = new McpBridgeServer(secret);
    const received: LibrarySearchBridgeRequest[] = [];
    try {
      await server.start();
      server.onLibrarySearch(async (request) => {
        received.push(request);
        return makeResponse();
      });

      const response = await postSearch(server.librarySearchCallbackUrl!, {
        query: '  lease term  ',
        folder: '/Users/ada/Documents',
        limit: 5,
        sessionKey: 'agent:main:maties:session-c',
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(makeResponse());

      expect(received).toEqual([{
        query: 'lease term',
        folder: '/Users/ada/Documents',
        limit: 5,
        sessionKey: 'agent:main:maties:session-c',
      }]);
    } finally {
      await server.stop();
    }
  });

  test('defaults and clamps the limit', async () => {
    const server = new McpBridgeServer(secret);
    const limits: Array<number | undefined> = [];
    try {
      await server.start();
      server.onLibrarySearch(async (request) => {
        limits.push(request.limit);
        return makeResponse();
      });

      await postSearch(server.librarySearchCallbackUrl!, { query: 'a' });
      await postSearch(server.librarySearchCallbackUrl!, { query: 'a', limit: 0 });
      await postSearch(server.librarySearchCallbackUrl!, { query: 'a', limit: 999 });
      await postSearch(server.librarySearchCallbackUrl!, { query: 'a', limit: 'three' });

      expect(limits).toEqual([
        LibraryContentLimits.DefaultSearchResults,
        1,
        LibraryContentLimits.MaxSearchResults,
        LibraryContentLimits.DefaultSearchResults,
      ]);
    } finally {
      await server.stop();
    }
  });

  test('answers 503 when no callback is registered', async () => {
    const server = new McpBridgeServer(secret);
    try {
      await server.start();

      const response = await postSearch(server.librarySearchCallbackUrl!, { query: 'lease' });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'The library is not available.' });
    } finally {
      await server.stop();
    }
  });

  test('answers 500 with the message when the callback throws', async () => {
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      server.onLibrarySearch(async () => {
        throw new Error('index locked');
      });

      const response = await postSearch(server.librarySearchCallbackUrl!, { query: 'lease' });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'index locked' });
    } finally {
      await server.stop();
    }
  });
});
