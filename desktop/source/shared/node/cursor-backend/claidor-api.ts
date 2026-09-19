import { getConfiguredBackendUrl } from "../cursor-token.js";

// Claidor's metered doors for the desktop app, all under one prefix on the
// API host: the model proxy (`/responses`, `/messages`, `/chat/completions`),
// speech, and — since 19 September 2026 — web search, pictures and dictation
// (`server/polar/desktop/capabilities.py`). Measured, not recalled: the
// router in `server/polar/desktop/endpoints.py` carries `prefix="/desktop"`,
// and `POST https://api.claidor.com/api/proxy/v1/models` answers 404 while
// `/desktop/api/proxy/v1/...` answers. Every caller builds its address here
// so there is one place for that fact to live.
export const CLAIDOR_PROXY_PREFIX = "desktop/api/proxy/v1";

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
