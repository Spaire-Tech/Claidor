/**
 * Composio's Tool Router, over its REST API.
 *
 * The upstream plugin went through `@composio/core`, which drags in the
 * OpenAI SDK, undici and pusher-js for what is, in the end, six HTTP
 * calls. Those six are here, against the paths the SDK itself uses
 * (`@composio/client` 0.1.0-alpha.76, `resources/tool-router/session`):
 *
 *   POST   /api/v3.1/tool_router/session                 → { session_id }
 *   POST   /api/v3.1/tool_router/session/{id}/search     → results + tool_schemas
 *   POST   /api/v3.1/tool_router/session/{id}/execute    → { data, error }
 *   POST   /api/v3.1/tool_router/session/{id}/link       → { redirect_url }
 *   GET    /api/v3.1/tool_router/session/{id}/toolkits   → items[].connected_account
 *   DELETE /api/v3.1/connected_accounts/{id}
 *
 * Authentication is the `x-api-key` header, as the SDK sends it.
 *
 * A twin of this lives in `src/main/libs/composio/composioApi.ts` for the
 * app's own side (the Connect button). They cannot share a file: an
 * extension is copied into the engine's runtime on its own, and anything
 * it imports from `src/` is not there.
 */

export const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

export interface ComposioClientConfig {
  apiKey: string;
  userId: string;
  allowedToolkits?: readonly string[];
  blockedToolkits?: readonly string[];
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface FoundTool {
  slug: string;
  toolkit: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolkitConnection {
  toolkit: string;
  connected: boolean;
  connectedAccountId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

/** What the API said, in one sentence, so a refusal reaches the log intact. */
const describeFailure = (status: number, payload: unknown): string => {
  if (isRecord(payload)) {
    const error = payload.error;
    if (typeof error === 'string' && error.trim()) return `HTTP ${status}: ${error.trim()}`;
    if (isRecord(error) && typeof error.message === 'string') return `HTTP ${status}: ${error.message}`;
    if (typeof payload.message === 'string') return `HTTP ${status}: ${payload.message}`;
  }
  return `HTTP ${status}`;
};

export class ComposioClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private sessionId: Promise<string> | null = null;

  constructor(private readonly config: ComposioClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    this.baseUrl = (config.baseUrl ?? COMPOSIO_BASE_URL).replace(/\/+$/, '');
  }

  /** The key stays on the server side of `x-api-key`; it is never returned. */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-api-key': this.config.apiKey,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Composio refused the API key. Check it in Settings.');
      }
      throw new Error(`Composio ${describeFailure(response.status, payload)}`);
    }
    return payload as T;
  }

  isToolkitAllowed(toolkit: string): boolean {
    const slug = toolkit.toLowerCase();
    if (this.config.blockedToolkits?.some(one => one.toLowerCase() === slug)) return false;
    const allowed = this.config.allowedToolkits;
    if (allowed && allowed.length > 0) return allowed.some(one => one.toLowerCase() === slug);
    return true;
  }

  /**
   * One session per process, made on first use. Composio scopes sign-ins
   * by user id, not by session, so a session lost to a restart costs one
   * request and nothing else.
   */
  private session(): Promise<string> {
    if (!this.sessionId) {
      this.sessionId = this.request<{ session_id?: string }>(
        'POST',
        '/api/v3.1/tool_router/session',
        { user_id: this.config.userId },
      ).then(created => {
        if (typeof created.session_id !== 'string' || !created.session_id) {
          throw new Error('Composio did not return a session id.');
        }
        return created.session_id;
      }).catch(error => {
        // A failed attempt must not be cached as the answer.
        this.sessionId = null;
        throw error;
      });
    }
    return this.sessionId;
  }

  async searchTools(useCase: string, limit: number): Promise<FoundTool[]> {
    const id = await this.session();
    const found = await this.request<{
      results?: Array<{ primary_tool_slugs?: string[]; related_tool_slugs?: string[] }>;
      tool_schemas?: Record<string, { toolkit?: string; description?: string; input_schema?: Record<string, unknown> }>;
      error?: string | null;
    }>('POST', `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/search`, {
      queries: [{ use_case: useCase }],
    });
    if (found.error) throw new Error(found.error);

    const schemas = found.tool_schemas ?? {};
    const seen = new Set<string>();
    const tools: FoundTool[] = [];
    for (const result of found.results ?? []) {
      for (const slug of [...(result.primary_tool_slugs ?? []), ...(result.related_tool_slugs ?? [])]) {
        if (seen.has(slug)) continue;
        seen.add(slug);
        const schema = schemas[slug];
        const toolkit = (schema?.toolkit || slug.split('_')[0] || '').toLowerCase();
        if (!this.isToolkitAllowed(toolkit)) continue;
        tools.push({
          slug,
          toolkit,
          description: schema?.description ?? '',
          inputSchema: schema?.input_schema ?? {},
        });
        if (tools.length >= limit) return tools;
      }
    }
    return tools;
  }

  async executeTool(
    slug: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const toolkit = (slug.split('_')[0] ?? '').toLowerCase();
    if (!this.isToolkitAllowed(toolkit)) {
      return { ok: false, error: `The ${toolkit} toolkit is not allowed on this computer.` };
    }
    const id = await this.session();
    const result = await this.request<{ data?: unknown; error?: string | null }>(
      'POST',
      `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/execute`,
      { tool_slug: slug, arguments: args },
    );
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, data: result.data ?? null };
  }

  /** The sign-in link for one toolkit. Composio's page, then the vendor's. */
  async authorizationUrl(toolkit: string): Promise<string> {
    if (!this.isToolkitAllowed(toolkit)) {
      throw new Error(`The ${toolkit} toolkit is not allowed on this computer.`);
    }
    const id = await this.session();
    const link = await this.request<{ redirect_url?: string }>(
      'POST',
      `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/link`,
      { toolkit: toolkit.toLowerCase() },
    );
    if (typeof link.redirect_url !== 'string' || !link.redirect_url) {
      throw new Error(`Composio gave no sign-in link for ${toolkit}.`);
    }
    return link.redirect_url;
  }

  /** Every toolkit the session knows, with whether this person is signed in. */
  async toolkits(): Promise<ToolkitConnection[]> {
    const id = await this.session();
    const listed = await this.request<{
      items?: Array<{ slug?: string; connected_account?: { id?: string; status?: string } | null }>;
    }>('GET', `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/toolkits`);
    return (listed.items ?? [])
      .filter(item => typeof item.slug === 'string' && this.isToolkitAllowed(item.slug))
      .map(item => {
        const account = item.connected_account;
        const active = !!account && (account.status ?? '').toUpperCase() === 'ACTIVE';
        return {
          toolkit: (item.slug as string).toLowerCase(),
          connected: active,
          ...(active && account?.id ? { connectedAccountId: account.id } : {}),
        };
      });
  }

  async disconnect(toolkit: string): Promise<boolean> {
    const found = (await this.toolkits()).find(one => one.toolkit === toolkit.toLowerCase());
    if (!found?.connectedAccountId) return false;
    await this.request('DELETE', `/api/v3.1/connected_accounts/${encodeURIComponent(found.connectedAccountId)}`);
    return true;
  }
}
