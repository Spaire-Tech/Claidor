import { ClaidorApiError, claidorComposioUrl } from "../cursor-backend/claidor-api.js";
import { getConfiguredBackendUrl } from "../cursor-token.js";
import { composioConnectorById, composioConnectorByToolkit } from "./catalog.js";

export const COMPOSIO_USER_ID = "default";
export const COMPOSIO_CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
export const COMPOSIO_POLL_INTERVAL_MS = 2_000;

export interface ComposioToolkitState {
  readonly toolkit: string;
  readonly connected: boolean;
  readonly connectedAccountId?: string;
}

export interface ComposioApi {
  authorizationUrl(toolkit: string): Promise<string>;
  toolkitState(toolkit: string): Promise<ComposioToolkitState>;
  listToolkitState(): Promise<ComposioToolkitState[]>;
  disconnect(toolkit: string): Promise<boolean>;
}

export interface ComposioApiOptions {
  readonly getAccessToken: () => Promise<string | null | undefined>;
  readonly backendUrl?: string;
  readonly fetch?: typeof fetch;
  readonly userId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

function describeFailure(status: number, payload: unknown): string {
  if (isRecord(payload)) {
    const error = payload.error;
    if (typeof error === "string" && error.trim().length > 0) return `HTTP ${status}: ${error.trim()}`;
    if (isRecord(error) && typeof error.message === "string") return `HTTP ${status}: ${error.message}`;
    if (typeof payload.message === "string") return `HTTP ${status}: ${payload.message}`;
  }
  return `HTTP ${status}`;
}

export function composioFailureMessage(status: number, payload?: unknown): string {
  if (status === 401) return "You are signed out. Sign in again to connect apps.";
  if (status === 503) return "Apps are not switched on for this server yet.";
  return `Composio ${describeFailure(status, payload)}`;
}

export function createComposioApi(options: ComposioApiOptions): ComposioApi {
  const fetchImpl = options.fetch ?? fetch;
  const userId = options.userId ?? COMPOSIO_USER_ID;
  const backendUrl = options.backendUrl ?? getConfiguredBackendUrl();
  let sessionId: Promise<string> | null = null;

  const request = async <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> => {
    const token = await options.getAccessToken();
    if (token == null || token.length === 0) throw new Error(composioFailureMessage(401));
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetchImpl(claidorComposioUrl(path, backendUrl), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim().length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
        throw new ClaidorApiError(composioFailureMessage(response.status, payload), response.status, typeof payload.error.type === "string" ? payload.error.type : undefined);
      }
      if (response.status === 401 || response.status === 503) throw new Error(composioFailureMessage(response.status, payload));
      throw new Error(composioFailureMessage(response.status, payload));
    }
    return payload as T;
  };

  const session = (): Promise<string> => {
    sessionId ??= request<{ session_id?: string }>("POST", "api/v3.1/tool_router/session", { user_id: userId })
      .then((created) => {
        if (typeof created.session_id !== "string" || created.session_id.length === 0) {
          throw new Error("Composio did not return a session id.");
        }
        return created.session_id;
      })
      .catch((error) => {
        sessionId = null;
        throw error;
      });
    return sessionId;
  };

  const toolkits = async (): Promise<ComposioToolkitState[]> => {
    const id = await session();
    const listed = await request<{
      items?: Array<{ slug?: string; connected_account?: { id?: string; status?: string } | null }>;
    }>("GET", `api/v3.1/tool_router/session/${encodeURIComponent(id)}/toolkits`);
    return (listed.items ?? [])
      .filter((item): item is { slug: string; connected_account?: { id?: string; status?: string } | null } => typeof item.slug === "string")
      .map((item) => {
        const account = item.connected_account;
        const active = account != null && (account.status ?? "").toUpperCase() === "ACTIVE";
        return {
          toolkit: item.slug.toLowerCase(),
          connected: active,
          ...(active && account?.id != null && account.id.length > 0 ? { connectedAccountId: account.id } : {}),
        };
      });
  };

  return {
    async authorizationUrl(toolkit) {
      const id = await session();
      const link = await request<{ redirect_url?: string }>(
        "POST",
        `api/v3.1/tool_router/session/${encodeURIComponent(id)}/link`,
        { toolkit: toolkit.toLowerCase() },
      );
      if (typeof link.redirect_url !== "string" || link.redirect_url.length === 0) {
        throw new Error(`Composio gave no sign-in link for ${toolkit}.`);
      }
      return link.redirect_url;
    },
    async listToolkitState() {
      return await toolkits();
    },
    async toolkitState(toolkit) {
      const slug = toolkit.toLowerCase();
      return (await toolkits()).find((one) => one.toolkit === slug) ?? { toolkit: slug, connected: false };
    },
    async disconnect(toolkit) {
      const state = await this.toolkitState(toolkit);
      if (state.connectedAccountId == null) return false;
      await request("DELETE", `api/v3.1/connected_accounts/${encodeURIComponent(state.connectedAccountId)}`);
      return true;
    },
  };
}

export interface ComposioConnectDeps {
  readonly api: ComposioApi;
  readonly openExternal?: (url: string) => Promise<unknown>;
  readonly wait?: (ms: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function connectThroughComposio(toolkit: string, deps: ComposioConnectDeps): Promise<"connected" | "already-authenticated"> {
  const slug = toolkit.toLowerCase();
  if ((await deps.api.toolkitState(slug)).connected) return "already-authenticated";
  if (deps.openExternal == null) throw new Error("Connecting apps needs the desktop Plugins overlay.");
  const url = await deps.api.authorizationUrl(slug);
  await deps.openExternal(url);
  const wait = deps.wait ?? sleep;
  const interval = deps.pollIntervalMs ?? COMPOSIO_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? COMPOSIO_CONNECT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await wait(interval);
    if ((await deps.api.toolkitState(slug)).connected) return "connected";
  }
  const name = composioConnectorByToolkit(slug)?.name ?? slug;
  throw new Error(`${name} was not connected.`);
}

export function toolkitForPluginId(pluginId: string): string | undefined {
  return composioConnectorById(pluginId)?.toolkit ?? composioConnectorByToolkit(pluginId)?.toolkit;
}
