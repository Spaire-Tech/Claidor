/**
 * Claude through Simeon Labs' proxy, on Anthropic's own Messages wire
 * (13 October 2026, the founder: move from OpenAI to Claude "without losing
 * productivity"). The server decides when Claude answers (`ModelPolicy`,
 * `simeon-model-roles.ts`); this file is what a Claude request needs that
 * the AI SDK's Anthropic provider (@ai-sdk/anthropic 1.2) does not write
 * itself. Every rule below was read off platform.claude.com/docs on
 * 13 October 2026:
 *
 * - **Effort.** `output_config.effort` (low … max) sets how much a Claude
 *   5.5 model thinks; the provider does not know the field, so the body is
 *   rewritten on its way out, the way `withPromptCacheKey` adds OpenAI's key.
 *   Our levels are OpenAI's; `none` reads as `low`.
 * - **Thinking.** On by default on every 5.5 model ("adaptive", with the
 *   text omitted and only a `signature` returned). Each thinking block must
 *   go back unchanged on later calls, and on the 5.5 models a block whose
 *   earlier prompt changed (a new system prompt, a summary) is refused with
 *   a 400 unless the request asks for such blocks to be dropped
 *   (`block_binding.prefix_mismatch_behavior: "drop_block"`, beta header
 *   `thinking-binding-controls-2026-08-01`). The loop rewrites its prompt
 *   when it summarizes a chat, so every request asks for the drop.
 * - **Caching.** Nothing is cached unless the request says where. One
 *   breakpoint after the system prompt (tools come before it, so it covers
 *   both) and the top-level `cache_control`, which the API moves to the last
 *   block of each request itself. A five-minute entry costs 1.25x to write
 *   and 0.05x to read on Sonnet and Opus 5.5 (`pricing.py`).
 * - **Sampling.** Temperature, top_p and top_k are not sent with thinking.
 */
import { isProviderRateLimitError } from "../../../shared/provider-rate-limit.js";

export function isClaudeModelId(id: string | undefined): boolean {
  return typeof id === "string" && /^claude-/.test(id.trim());
}

export const CLAUDE_THINKING_BINDING_BETA = "thinking-binding-controls-2026-08-01";

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

export function claudeEffortFor(effort: string | undefined): ClaudeEffort {
  const level = effort?.trim().toLowerCase();
  if (level === "none" || level === "minimal") return "low";
  return (CLAUDE_EFFORTS as readonly string[]).includes(level ?? "") ? level as ClaudeEffort : "high";
}

const EPHEMERAL = { type: "ephemeral" } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** The request body as Claude needs it: effort, thinking that survives a rewritten prompt, cache breakpoints, no sampling knobs. */
export function withClaudeRequestOptions(body: unknown, effort: ClaudeEffort): unknown {
  if (typeof body !== "string") return body;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return body; }
  if (!isRecord(parsed)) return body;
  const next: Record<string, unknown> = { ...parsed };
  next.output_config = { ...(isRecord(parsed.output_config) ? parsed.output_config : {}), effort };
  next.thinking = { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } };
  delete next.temperature;
  delete next.top_p;
  delete next.top_k;
  if (typeof next.system === "string" && next.system.length > 0) {
    next.system = [{ type: "text", text: next.system, cache_control: EPHEMERAL }];
  } else if (Array.isArray(next.system) && next.system.length > 0) {
    const blocks = next.system.map((block) => isRecord(block) ? { ...block } : block);
    const last = blocks.at(-1);
    if (isRecord(last) && last.cache_control === undefined) last.cache_control = EPHEMERAL;
    next.system = blocks;
  }
  if (next.cache_control === undefined) next.cache_control = EPHEMERAL;
  return JSON.stringify(next);
}

/** Adds the thinking-binding beta to whatever `anthropic-beta` the request already carries. */
export function withClaudeBetaHeader(headers: Headers): Headers {
  const current = (headers.get("anthropic-beta") ?? "").split(",").map((one) => one.trim()).filter((one) => one.length > 0);
  if (!current.includes(CLAUDE_THINKING_BINDING_BETA)) current.push(CLAUDE_THINKING_BINDING_BETA);
  headers.set("anthropic-beta", current.join(","));
  // The provider sends its own placeholder key; the proxy reads the bearer.
  headers.delete("x-api-key");
  return headers;
}

/**
 * A Claude call's usage, from the provider's numbers. Anthropic counts the
 * three kinds of prompt token apart (`promptTokens` is the uncached part
 * alone) where OpenAI's prompt total includes its cached part.
 */
export function claudeUsage(promptTokens: number, metadata: Record<string, unknown> | undefined): { readonly uncached: number; readonly cacheRead: number; readonly cacheWrite: number; readonly prompt: number } {
  const read = typeof metadata?.cacheReadInputTokens === "number" ? metadata.cacheReadInputTokens : 0;
  const write = typeof metadata?.cacheCreationInputTokens === "number" ? metadata.cacheCreationInputTokens : 0;
  const uncached = Math.max(0, promptTokens);
  return { uncached, cacheRead: read, cacheWrite: write, prompt: uncached + read + write };
}

function statusOf(error: unknown): number | undefined {
  const record = error as { statusCode?: unknown; lastError?: unknown; errors?: unknown } | null;
  if (typeof record?.statusCode === "number") return record.statusCode;
  // The AI SDK's RetryError, after its own retries: the last attempt's error.
  if (record?.lastError != null) return statusOf(record.lastError);
  return undefined;
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  try { return JSON.stringify(error) ?? String(error); } catch { return String(error); }
}

/**
 * Whether a failed Claude call should be answered by the fallback instead:
 * Anthropic overloaded (529) or rate limiting (429), a server error, the
 * proxy unable to reach it, or no answer at all. Not a refusal of the
 * request itself (400), a sign-in (401) or a spent allowance (402): the
 * other provider would refuse those the same way, or they are ours to fix.
 */
export function isClaudeProviderFailure(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return status === 408 || status === 409 || status === 429 || status >= 500;
  const text = textOf(error);
  if (/overloaded|api_error|internal server error|service unavailable|bad gateway|gateway timeout/i.test(text)) return true;
  if (isProviderRateLimitError(error)) return true;
  // Nothing came back: the connection, not the request.
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|terminated|did not answer within/i.test(text);
}
