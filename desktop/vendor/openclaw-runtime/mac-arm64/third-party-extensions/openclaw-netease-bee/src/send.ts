import type { BeeConfig, BeeSendResult } from "./types.js";

/** Token API URL */
const BEE_TOKEN_API_URL = "https://api.mifengs.com/worklife-go/api/v1/claw/im/oauth2/accessToken";

/** Message send API URL */
const BEE_HTTP_API_URL = "https://api.mifengs.com/worklife-go/api/v1/claw/im/send";

/** Fixed HTTP from identifier */
const HTTP_FROM = "youdaoClaw";

/** Max characters per message chunk */
const MAX_CHUNK_LENGTH = 1500;

/** Cached token state */
interface TokenState {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenState>();

/**
 * Get (or refresh) the access token for the Bee HTTP API.
 */
export async function getAccessToken(config: BeeConfig): Promise<string> {
  const cacheKey = config.clientId;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const response = await fetch(BEE_TOKEN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey: config.clientId, appSecret: config.secret }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Bee token API error ${response.status}: ${text}`);
  }

  const result = JSON.parse(text);
  const accessToken: string =
    result.data?.accessToken ?? result.accessToken ?? result.access_token;
  const expiresIn: number =
    result.data?.expireIn ?? result.data?.expiresIn ?? result.expireIn ?? result.expiresIn ?? 7200;

  if (!accessToken) {
    throw new Error(`Bee token API returned no accessToken: ${text}`);
  }

  tokenCache.set(cacheKey, { accessToken, expiresAt: now + expiresIn * 1000 });
  return accessToken;
}

/**
 * Invalidate cached token (e.g. after 1440000 error).
 */
export function clearAccessToken(clientId: string): void {
  tokenCache.delete(clientId);
}

/**
 * Split long text into chunks no longer than MAX_CHUNK_LENGTH.
 */
export function splitMessageIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let idx = remaining.lastIndexOf("\n", maxLength);
    if (idx === -1 || idx < maxLength * 0.5) idx = remaining.lastIndexOf(" ", maxLength);
    if (idx === -1 || idx < maxLength * 0.5) idx = maxLength;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}

/**
 * Send a text message via the Bee HTTP API.
 * Handles token auto-refresh and splitting long messages.
 */
export async function sendBeeText(
  config: BeeConfig,
  chatId: string,
  text: string,
  isRetry = false,
): Promise<BeeSendResult> {
  const chunks = splitMessageIntoChunks(text);
  let accessToken: string;
  try {
    accessToken = await getAccessToken(config);
  } catch (err) {
    return { success: false, error: String(err) };
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload = {
      from: HTTP_FROM,
      appKey: config.clientId,
      accessToken,
      chatType: "single",
      msgType: "text",
      chatId,
      content: JSON.stringify({ text: chunk }),
    };

    try {
      const response = await fetch(BEE_HTTP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      let result: unknown;
      try { result = JSON.parse(responseText); } catch { result = responseText; }

      // Token expired — clear and retry once
      if (result && typeof result === "object" && (result as Record<string, unknown>).code === 1440000) {
        if (isRetry) {
          return { success: false, error: `Token validation failed after retry` };
        }
        clearAccessToken(config.clientId);
        return sendBeeText(config, chatId, text, true);
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }

    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { success: true };
}
