/**
 * Composio, as a Caisra extension.
 *
 * Ported from `extensions/composio/` of ComposioHQ/openclaw-composio
 * (MIT; see NOTICE.md). What the original does, from its code: it
 * registers six agent tools — search, execute, multi-execute, manage
 * connections, and two that run Python or bash in Composio's remote
 * sandbox — plus a `composio` CLI, and prepends a how-to block to every
 * turn.
 *
 * What is kept: search, execute, and connections. What is not:
 *
 * - The remote workbench and remote bash. They run code on Composio's
 *   servers, which is the opposite of "one computer, this one", and
 *   nothing there asks first.
 * - Multi-execute. Fifty writes in one call is fifty actions with one
 *   approval; one at a time is the rule here.
 * - The CLI. Nobody runs the engine's CLI on this product.
 * - The SDK. See `client.ts`.
 *
 * The how-to block moved from `prependContext` (re-sent every turn) to
 * `appendSystemContext`, which the engine lets providers cache.
 */
import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

import { COMPOSIO_BASE_URL, ComposioClient, type ComposioClientConfig } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const stringList = (value: unknown): string[] | undefined => (
  Array.isArray(value)
    ? value.filter((one): one is string => typeof one === 'string' && one.trim() !== '').map(one => one.trim())
    : undefined
);

/**
 * `baseUrl` is the app's local token proxy and is all the config there
 * is; the server behind it holds the key. `apiKey` (with Composio's own
 * address) is the direct route, for a test.
 */
const parsePluginConfig = (value: unknown): ComposioClientConfig | null => {
  const raw = isRecord(value) ? value : {};
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  const baseUrl = (typeof raw.baseUrl === 'string' && raw.baseUrl.trim()) || (apiKey ? COMPOSIO_BASE_URL : '');
  if (!baseUrl) return null;
  return {
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    userId: (typeof raw.userId === 'string' && raw.userId.trim()) || 'default',
    ...(stringList(raw.allowedToolkits)?.length ? { allowedToolkits: stringList(raw.allowedToolkits) } : {}),
    ...(stringList(raw.blockedToolkits)?.length ? { blockedToolkits: stringList(raw.blockedToolkits) } : {}),
  };
};

const asText = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  details: value,
});

const asFailure = (error: unknown, details: Record<string, unknown> = {}) => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    details: { ...details, error: message },
  };
};

const GUIDANCE = [
  '## Apps through Composio',
  '',
  'The person\'s apps — mail, calendar, files, chat, tasks, CRM, code — are reachable through three tools:',
  '',
  '1. `composio_search_tools` — describe what you want to do ("send an email", "list open pull requests"). It returns tool slugs with their input schemas.',
  '2. `composio_manage_connections` — `status` says which apps the person has signed into; `connect` returns a sign-in link for one. Give that link to the person as a plain URL and wait; do not open it yourself.',
  '3. `composio_execute_tool` — run one tool by its exact slug from the search, with arguments matching its schema.',
  '',
  'Slugs are uppercase (`GMAIL_SEND_EMAIL`); never invent one. Anything that sends, writes, deletes or pays is an action on the person\'s behalf: say what you are about to do and ask first, every time.',
].join('\n');

const plugin = {
  id: 'composio',
  name: 'Composio',
  description: 'Lets a Caisra agent reach the person\'s apps through Composio.',
  configSchema: {
    parse(value: unknown) {
      return isRecord(value) ? value : {};
    },
    uiHints: {
      baseUrl: { label: 'Address', advanced: true },
      apiKey: { label: 'API key (direct route only)', sensitive: true, advanced: true },
      userId: { label: 'User id', advanced: true },
      allowedToolkits: { label: 'Allowed toolkits', advanced: true },
      blockedToolkits: { label: 'Blocked toolkits', advanced: true },
    },
  },
  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);
    if (!config) {
      api.logger.info('[composio] no address to reach Composio through; nothing registered.');
      return;
    }

    const client = new ComposioClient(config);

    api.registerTool({
      name: 'composio_search_tools',
      label: 'Find an app tool',
      description:
        'Find tools across the person\'s apps (Gmail, Slack, Notion, GitHub, and more) by describing '
        + 'what you want to do. Returns tool slugs with their input schemas.',
      parameters: Type.Object({
        query: Type.String({ description: 'What you want to do, e.g. "send an email" or "create a GitHub issue".' }),
        limit: Type.Optional(Type.Number({ description: 'At most this many tools (default 10, max 50).' })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const query = String(params.query ?? '').trim();
        if (!query) return asFailure('query is required');
        const limit = Math.min(typeof params.limit === 'number' && params.limit > 0 ? Math.floor(params.limit) : 10, 50);
        try {
          const tools = await client.searchTools(query, limit);
          return asText({ query, count: tools.length, tools });
        } catch (error) {
          return asFailure(error, { query });
        }
      },
    });

    api.registerTool({
      name: 'composio_execute_tool',
      label: 'Run an app tool',
      description:
        'Run one tool from composio_search_tools by its exact slug. The app must be connected '
        + '(composio_manage_connections says which are). Ask the person before anything that sends, writes or deletes.',
      parameters: Type.Object({
        tool_slug: Type.String({ description: 'The slug from the search, e.g. GMAIL_SEND_EMAIL.' }),
        arguments: Type.Optional(Type.Unknown({ description: 'Arguments matching the tool\'s input schema.' })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const slug = String(params.tool_slug ?? '').trim();
        if (!slug) return asFailure('tool_slug is required');
        const args = isRecord(params.arguments) ? params.arguments : {};
        try {
          const result = await client.executeTool(slug, args);
          return result.ok
            ? asText({ tool_slug: slug, success: true, data: result.data })
            : asFailure(result.error, { tool_slug: slug, success: false });
        } catch (error) {
          return asFailure(error, { tool_slug: slug, success: false });
        }
      },
    });

    api.registerTool({
      name: 'composio_manage_connections',
      label: 'App sign-ins',
      description:
        'Which apps the person has signed into through Composio, and a sign-in link for one that is not. '
        + 'Hand the link to the person as a URL; they open it, not you.',
      parameters: Type.Object({
        // A flat enum rather than a union of literals: some providers
        // refuse `anyOf` in a tool schema.
        action: Type.Unsafe<'status' | 'connect'>({
          type: 'string',
          enum: ['status', 'connect'],
          description: '"status" lists connected apps; "connect" returns a sign-in link for `toolkit`.',
        }),
        toolkit: Type.Optional(Type.String({ description: 'Toolkit slug for "connect", e.g. gmail, slack, notion.' })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const action = String(params.action ?? 'status');
        try {
          if (action === 'connect') {
            const toolkit = String(params.toolkit ?? '').trim().toLowerCase();
            if (!toolkit) return asFailure('toolkit is required for "connect"');
            const url = await client.authorizationUrl(toolkit);
            return asText({
              action,
              toolkit,
              url,
              instructions: `Give this link to the person to sign into ${toolkit}. Once they have, the app is connected.`,
            });
          }
          const toolkits = await client.toolkits();
          const connected = toolkits.filter(one => one.connected).map(one => one.toolkit).sort();
          return asText({ action: 'status', connected });
        } catch (error) {
          return asFailure(error, { action });
        }
      },
    });

    api.on('before_prompt_build', () => ({ appendSystemContext: GUIDANCE }));

    api.logger.info('[composio] registered three tools.');
  },
};

export default plugin;
