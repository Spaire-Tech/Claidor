import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The REST half of a connector: JSON calls with one retry on a 429 (Discord
 * answers `retry_after` seconds in the body, Slack a `Retry-After` header),
 * and the bytes of a `file://` attachment for an upload. The clock is
 * injectable so the offline test never sleeps.
 */
export interface ChannelHttpOptions {
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetryAfterMs?: number;
}

export class ChannelHttpError extends Error {
  constructor(readonly status: number, readonly body: string, message?: string) {
    super(message ?? `HTTP ${status}${body.length > 0 ? `: ${body.slice(0, 200)}` : ""}`);
    this.name = "ChannelHttpError";
  }
}

export const DEFAULT_MAX_RETRY_AFTER_MS = 15_000;

function retryAfterMs(response: Response, body: string): number | null {
  const header = response.headers.get("retry-after");
  if (header != null && /^\d+(\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header) * 1000);
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (typeof parsed.retry_after === "number") return Math.ceil(parsed.retry_after * 1000);
  } catch {}
  return 1000;
}

export function createChannelHttp(options: ChannelHttpOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxRetryAfter = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  async function request(url: string, init: RequestInit): Promise<{ status: number; text: string; headers: Headers }> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await doFetch(url, init);
      const text = await response.text();
      if (response.status === 429 && attempt === 0) {
        const wait = Math.min(retryAfterMs(response, text) ?? 1000, maxRetryAfter);
        await sleep(wait);
        continue;
      }
      return { status: response.status, text, headers: response.headers };
    }
  }
  return {
    async json<T = Record<string, unknown>>(url: string, init: RequestInit & { readonly expectOk?: boolean }): Promise<T> {
      const { status, text } = await request(url, init);
      if (status < 200 || status >= 300) throw new ChannelHttpError(status, text);
      if (text.length === 0) return {} as T;
      try { return JSON.parse(text) as T; } catch { throw new ChannelHttpError(status, text, `Unreadable reply from ${new URL(url).host}`); }
    },
    async raw(url: string, init: RequestInit): Promise<{ status: number; text: string }> {
      const { status, text } = await request(url, init);
      return { status, text };
    },
  };
}

export type ChannelHttp = ReturnType<typeof createChannelHttp>;

/** The bytes and name of a `file://` attachment; an https URL is not fetched, it travels as a link. */
export async function readAttachmentFile(url: string): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> } | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "file:") return null;
  const path = fileURLToPath(parsed);
  const bytes = new Uint8Array(await readFile(path));
  return { name: basename(path) || "attachment", bytes };
}

/** Text split at a platform's message limit, on a line or a space where one is near. */
export function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
