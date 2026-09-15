/**
 * The app's own side of Composio: the three calls the Connect button
 * needs, and the one Disconnect needs.
 *
 * A twin of `openclaw-extensions/composio/client.ts`, on purpose. The
 * extension is copied into the engine's runtime alone and cannot import
 * from `src/`; main cannot import from the extension without moving the
 * electron build's root. Same paths, same header, same reading of the
 * answers — from `@composio/client` 0.1.0-alpha.76,
 * `resources/tool-router/session/session.mjs`:
 *
 *   POST   /api/v3.1/tool_router/session               { user_id }  → { session_id }
 *   POST   /api/v3.1/tool_router/session/{id}/link     { toolkit }  → { redirect_url }
 *   GET    /api/v3.1/tool_router/session/{id}/toolkits              → items[].connected_account
 *   DELETE /api/v3.1/connected_accounts/{id}
 */

export const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

/** One computer, one person. Composio scopes sign-ins by this. */
export const COMPOSIO_USER_ID = 'default';

export interface ComposioToolkitState {
  toolkit: string;
  connected: boolean;
  connectedAccountId?: string;
}

export interface ComposioApi {
  /** The sign-in link for a toolkit: Composio's page, then the vendor's. */
  authorizationUrl: (toolkit: string) => Promise<string>;
  /** Whether this person is signed into a toolkit, as Composio has it. */
  toolkitState: (toolkit: string) => Promise<ComposioToolkitState>;
  /** Remove the sign-in on Composio's side. False when there was none. */
  disconnect: (toolkit: string) => Promise<boolean>;
}

export interface ComposioApiOptions {
  apiKey: string;
  userId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const describeFailure = (status: number, payload: unknown): string => {
  if (isRecord(payload)) {
    const error = payload.error;
    if (typeof error === 'string' && error.trim()) return `HTTP ${status}: ${error.trim()}`;
    if (isRecord(error) && typeof error.message === 'string') return `HTTP ${status}: ${error.message}`;
    if (typeof payload.message === 'string') return `HTTP ${status}: ${payload.message}`;
  }
  return `HTTP ${status}`;
};

export function createComposioApi(options: ComposioApiOptions): ComposioApi {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? COMPOSIO_BASE_URL).replace(/\/+$/, '');
  const userId = options.userId ?? COMPOSIO_USER_ID;
  let sessionId: Promise<string> | null = null;

  const request = async <T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        'x-api-key': options.apiKey,
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
      // The provider's own sentence, into the log and the card. The
      // `upstream_refused` lesson: a refusal without its reason is two
      // hours of guessing.
      const reason = response.status === 401
        ? 'Composio refused the API key. Check it in Settings.'
        : `Composio ${describeFailure(response.status, payload)}`;
      console.warn(`[Connections] composio ${method} ${path} — ${reason}`);
      throw new Error(reason);
    }
    return payload as T;
  };

  const session = (): Promise<string> => {
    if (!sessionId) {
      sessionId = request<{ session_id?: string }>('POST', '/api/v3.1/tool_router/session', { user_id: userId })
        .then(created => {
          if (typeof created.session_id !== 'string' || !created.session_id) {
            throw new Error('Composio did not return a session id.');
          }
          return created.session_id;
        })
        .catch(error => {
          sessionId = null;
          throw error;
        });
    }
    return sessionId;
  };

  const toolkits = async (): Promise<ComposioToolkitState[]> => {
    const id = await session();
    const listed = await request<{
      items?: Array<{ slug?: string; connected_account?: { id?: string; status?: string } | null }>;
    }>('GET', `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/toolkits`);
    return (listed.items ?? [])
      .filter((item): item is { slug: string; connected_account?: { id?: string; status?: string } | null } => (
        typeof item.slug === 'string'
      ))
      .map(item => {
        const account = item.connected_account;
        const active = !!account && (account.status ?? '').toUpperCase() === 'ACTIVE';
        return {
          toolkit: item.slug.toLowerCase(),
          connected: active,
          ...(active && account?.id ? { connectedAccountId: account.id } : {}),
        };
      });
  };

  return {
    async authorizationUrl(toolkit) {
      const id = await session();
      const link = await request<{ redirect_url?: string }>(
        'POST',
        `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/link`,
        { toolkit: toolkit.toLowerCase() },
      );
      if (typeof link.redirect_url !== 'string' || !link.redirect_url) {
        throw new Error(`Composio gave no sign-in link for ${toolkit}.`);
      }
      return link.redirect_url;
    },

    async toolkitState(toolkit) {
      const slug = toolkit.toLowerCase();
      return (await toolkits()).find(one => one.toolkit === slug) ?? { toolkit: slug, connected: false };
    },

    async disconnect(toolkit) {
      const state = await this.toolkitState(toolkit);
      if (!state.connectedAccountId) return false;
      await request('DELETE', `/api/v3.1/connected_accounts/${encodeURIComponent(state.connectedAccountId)}`);
      return true;
    },
  };
}
