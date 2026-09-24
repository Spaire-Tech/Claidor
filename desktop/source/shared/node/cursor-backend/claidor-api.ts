import { getConfiguredBackendUrl } from "../cursor-token.js";

// Claidor's metered doors for the desktop app, all under one prefix on the
// API host: the model proxy (`/responses`, `/messages`, `/chat/completions`),
// speech, and — since 19 September 2026 — web search, pictures and dictation
// (`server/polar/desktop/capabilities.py`). Measured, not recalled: the
// router in `server/polar/desktop/endpoints.py` carries `prefix="/desktop"`,
// and `POST https://api.simeonlabs.com/api/proxy/v1/models` answers 404 while
// `/desktop/api/proxy/v1/...` answers. Every caller builds its address here
// so there is one place for that fact to live.
export const CLAIDOR_PROXY_PREFIX = "desktop/api/proxy/v1";
export const CLAIDOR_COMPOSIO_PREFIX = "desktop/api/proxy/composio";
// The account doors — profile, quota, the model menu, sign-out, feedback —
// sit one level up, under `/desktop/api`, and answer the app's own envelope
// `{ code, data }` (`_ok` in `server/polar/desktop/endpoints.py`) rather
// than a provider's shape. Added 24 September 2026 when the account screens
// were moved off Cursor's Connect RPCs.
export const CLAIDOR_API_PREFIX = "desktop/api";

export interface ClaidorApiAuth {
  readonly getAccessToken: () => Promise<string>;
  readonly backendUrl?: string;
}

export function claidorProxyBaseUrl(backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(CLAIDOR_PROXY_PREFIX, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

export function claidorProxyUrl(path: string, backendUrl?: string): string {
  return `${claidorProxyBaseUrl(backendUrl)}/${path.replace(/^\/+/, "")}`;
}

export function claidorComposioBaseUrl(backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(CLAIDOR_COMPOSIO_PREFIX, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

export function claidorComposioUrl(path: string, backendUrl?: string): string {
  return `${claidorComposioBaseUrl(backendUrl)}/${path.replace(/^\/+/, "")}`;
}

export class ClaidorApiError extends Error {
  constructor(message: string, readonly status: number, readonly kind?: string) {
    super(message);
    this.name = "ClaidorApiError";
  }
}

// The server's one error shape, which is also both providers' own
// (`proxy_common.error_response`): `{ error: { type, message } }`.
export async function claidorErrorFromResponse(response: Response): Promise<ClaidorApiError> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { type?: unknown; message?: unknown } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.length > 0) {
      return new ClaidorApiError(message, response.status, typeof parsed.error?.type === "string" ? parsed.error.type : undefined);
    }
  } catch {
    // not JSON; fall through to the status line
  }
  return new ClaidorApiError(text.trim().length > 0 ? text.trim().slice(0, 500) : `Claidor answered ${response.status}.`, response.status);
}

export interface ClaidorProxyRequest {
  readonly json?: unknown;
  readonly form?: FormData;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

// One authenticated call to a door under the prefix. The body is JSON or a
// multipart form, never both; a non-2xx answer becomes a `ClaidorApiError`
// carrying the server's own sentence, which is the thing worth showing.
export async function claidorProxyRequest(auth: ClaidorApiAuth, path: string, request: ClaidorProxyRequest = {}): Promise<Response> {
  const token = await auth.getAccessToken();
  const headers = new Headers({ authorization: `Bearer ${token}`, accept: "application/json" });
  let body: BodyInit | undefined;
  if (request.form != null) {
    body = request.form;
  } else if (request.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(request.json);
  }
  const doFetch = request.fetch ?? fetch;
  const response = await doFetch(claidorProxyUrl(path, auth.backendUrl), {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
  if (!response.ok) throw await claidorErrorFromResponse(response);
  return response;
}

export function claidorApiBaseUrl(backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(CLAIDOR_API_PREFIX, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

export function claidorApiUrl(path: string, backendUrl?: string): string {
  return `${claidorApiBaseUrl(backendUrl)}/${path.replace(/^\/+/, "")}`;
}

export interface ClaidorApiRequest {
  readonly method?: "GET" | "POST";
  readonly json?: unknown;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

// One authenticated call to an account door, with the envelope opened: the
// `data` of a `{ code: 0, data }` answer, or a `ClaidorApiError` carrying
// the server's own `message` when `code` is not 0 or the status is not 2xx.
// A `_fail` answer travels at HTTP 200 unless the app keys on the status,
// so the code is read before the status is trusted.
export async function claidorApiData<T = unknown>(auth: ClaidorApiAuth, path: string, request: ClaidorApiRequest = {}): Promise<T> {
  const token = await auth.getAccessToken();
  const headers = new Headers({ authorization: `Bearer ${token}`, accept: "application/json" });
  const method = request.method ?? (request.json === undefined ? "GET" : "POST");
  let body: BodyInit | undefined;
  if (request.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(request.json);
  }
  const doFetch = request.fetch ?? fetch;
  const response = await doFetch(claidorApiUrl(path, auth.backendUrl), {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
  if (!response.ok) throw await claidorErrorFromResponse(response);
  const parsed = (await response.json().catch(() => null)) as { code?: unknown; data?: unknown; message?: unknown } | null;
  if (parsed == null || typeof parsed !== "object") throw new ClaidorApiError(`Claidor answered ${path} with something that is not JSON.`, response.status);
  if (parsed.code !== undefined && parsed.code !== 0) {
    const message = typeof parsed.message === "string" && parsed.message.length > 0 ? parsed.message : `Claidor refused ${path} (code ${String(parsed.code)}).`;
    throw new ClaidorApiError(message, response.status, `code-${String(parsed.code)}`);
  }
  return (parsed.code === undefined ? parsed : parsed.data) as T;
}
