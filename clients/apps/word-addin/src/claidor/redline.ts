/**
 * The Claidor check engine, from the task pane.
 *
 * Three routes, deliberately separate. `/check` is arithmetic on text and
 * answers in milliseconds; `/judge` reads the whole document a window at a
 * time and takes tens of seconds; `/terms` is the definitions index, where
 * nothing is a defect. Joining them would make every check as slow as the
 * slowest, so the panel runs `/check` first and shows what it knows.
 *
 * Everything goes through upstream's `request`, which carries the bearer
 * token, one silent refresh-and-retry on a 401, an abort signal and a
 * deadline. There is no second HTTP stack here on purpose: a fork that
 * grows a parallel client ends up with two answers to "am I signed in".
 *
 * In the community (bring-your-own-key) build `request` routes to the local
 * shim, which does not implement these paths and raises REQUIRES_ACCOUNT.
 * That is correct: the engine is a server, and there is no server there.
 */

import { request } from "@/api/http";
import type { Review, Terms } from "./locate";

export const CHECK_PATH = "/v1/redline/check";
export const JUDGE_PATH = "/v1/redline/judge";
export const TERMS_PATH = "/v1/redline/terms";

/**
 * A model reading a 186-page agreement in overlapping windows is minutes of
 * work, not seconds. The default 120s deadline would abort it mid-document
 * and report a timeout for a call that was going to succeed.
 */
export const JUDGE_TIMEOUT_MS = 600_000;

/** The mechanical checks: defined terms, cross-references, numbering, style. */
export function check(text: string, signal?: AbortSignal): Promise<Review> {
  return request<Review>(CHECK_PATH, { method: "POST", body: { text }, signal });
}

/**
 * Contradictions and miscalculations, which need a model.
 *
 * Nothing a model proposes reaches this response until code has checked it:
 * every quote is verified against the document and every sum is recomputed
 * server-side. What comes back is therefore quotable, not merely plausible.
 */
export function judge(text: string, signal?: AbortSignal): Promise<Review> {
  return request<Review>(JUDGE_PATH, {
    method: "POST",
    body: { text },
    signal,
    timeoutMs: JUDGE_TIMEOUT_MS,
  });
}

/** Every defined term, with its meaning, its uses and what it rests on. */
export function terms(text: string, signal?: AbortSignal): Promise<Terms> {
  return request<Terms>(TERMS_PATH, { method: "POST", body: { text }, signal });
}
