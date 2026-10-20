import { readFile } from "node:fs/promises";

import type { Clock, RetryPolicy } from "../../../internal/scheduling.js";
import { errorLogTag } from "../../../shared/errors.js";
import { getAccessTokenExpiryMs, getConfiguredBackendUrl } from "../../../shared/node/simeon-token.js";
import { getSandBackendClientHeaders } from "../../../shared/node/sand-client-metadata.js";

export class SandCredentialRenewalError extends Error {
  constructor(message: string) { super(message); this.name = "SandCredentialRenewalError"; }
}

export class SandCredentialNotReadyError extends SandCredentialRenewalError {
  constructor(message: string) { super(message); this.name = "SandCredentialNotReadyError"; }
}

export const SAND_INFERENCE_RENEWAL_CREDENTIAL_ENV = "SAND_INFERENCE_RENEWAL_CREDENTIAL";
export const SAND_DEV_INFERENCE_TOKEN_FILE_ENV = "SAND_DEV_INFERENCE_TOKEN_FILE";
export const REFRESH_LEEWAY_MS = 2 * 60 * 1_000;
export const MIN_REFRESH_INTERVAL_MS = 30 * 1_000;
export const MAX_REFRESH_INTERVAL_MS = 30 * 60 * 1_000;
export const CREDENTIAL_RETRY_BASE_DELAY_MS = 5 * 1_000;
export const CREDENTIAL_RETRY_MAX_DELAY_MS = 5 * 60 * 1_000;
export const DEV_TOKEN_FILE_POLL_MS = 1_000;
export const DEFAULT_TTL_MS = 10 * 60 * 1_000;
export const RENEWAL_PATH = "/sand-box/inference-credential";

export interface InferenceCredential { readonly accessToken: string; readonly expiresAtMs: number; }
/**
 * The token file the Mac writes into a local Docker box
 * (`/run/grok-bot/inference.json`), which since 25 September 2026 may also
 * carry the box's own renewal credential: the box keeps running after Simeon
 * quits so routines fire while the Mac is awake, and with the app gone
 * nothing rewrites the file, so a stale file is renewed at RENEWAL_PATH
 * with that credential instead of being waited on.
 */
export interface DevInferenceCredentialFile extends InferenceCredential { readonly renewalCredential?: string; }
export interface RenewalResult {
  readonly outcome: "renewed" | "failed";
  readonly consecutiveFailures: number;
  readonly durationMs: number;
  readonly errorSummary: string | undefined;
}

function credentialFromPayload(parsed: unknown, absentMessage: string): InferenceCredential {
  const record = parsed as Record<string, unknown>;
  const accessToken = typeof record.accessToken === "string" ? record.accessToken : "";
  if (accessToken.length === 0) throw new SandCredentialRenewalError(absentMessage);
  const expiresAtMs = typeof record.expiresAtMs === "number" && Number.isFinite(record.expiresAtMs)
    ? record.expiresAtMs
    : getAccessTokenExpiryMs(accessToken) ?? Date.now() + DEFAULT_TTL_MS;
  return { accessToken, expiresAtMs };
}

export async function renewSandBoxInferenceCredential(args: {
  readonly backendUrl: string;
  readonly credential: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<InferenceCredential> {
  const response = await (args.fetchImpl ?? fetch)(new URL(RENEWAL_PATH, args.backendUrl).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", ...getSandBackendClientHeaders() },
    body: JSON.stringify({ credential: args.credential })
  });
  if (!response.ok) throw new SandCredentialRenewalError(`Sand inference-credential renewal failed (HTTP ${response.status}).`);
  return credentialFromPayload(await response.json(), "Sand inference-credential renewal returned no token.");
}

export async function readDevInferenceCredentialFile(args: {
  readonly path: string;
  readonly readFileImpl?: (path: string) => Promise<string>;
}): Promise<DevInferenceCredentialFile> {
  try {
    const raw = await (args.readFileImpl ?? ((path) => readFile(path, "utf8")))(args.path);
    const parsed = JSON.parse(raw) as unknown;
    const credential = credentialFromPayload(parsed, `Dev inference token file ${args.path} has no accessToken yet.`);
    const renewalCredential = typeof parsed === "object" && parsed != null ? (parsed as { renewalCredential?: unknown }).renewalCredential : undefined;
    return typeof renewalCredential === "string" && renewalCredential.length > 0 ? { ...credential, renewalCredential } : credential;
  } catch (error) {
    if (error instanceof SandCredentialNotReadyError) throw error;
    if (error instanceof SandCredentialRenewalError) throw new SandCredentialNotReadyError(error.message);
    const code = error != null && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT" || error instanceof SyntaxError) {
      throw new SandCredentialNotReadyError(`Dev inference token file ${args.path} has no accessToken yet.`);
    }
    throw error;
  }
}

// A new box asks for its first credential seconds after it starts, before
// the server has saved the credential it was made with (the broker writes it
// in the same request that waits for the box to answer). Those first refusals
// are retried at the base delay, not backed off, so the box has its
// credential seconds after the server saves it instead of minutes
// (15 October 2026: backups and connector sign-ins failing "Waiting for a
// model credential" for a minute or two after every restart).
export const FIRST_CREDENTIAL_FAST_RETRIES = 24;

export class SandInferenceCredentialRenewer {
  private readonly abort = new AbortController();
  private loop: Promise<void> | undefined;
  private consecutiveFailures = 0;
  private renewedOnce = false;
  private interruptRefreshWait: (() => void) | undefined;
  private interruptBackoffWait: (() => void) | undefined;
  private onDemandRenewal: PromiseWithResolvers<void> | undefined;

  constructor(private readonly options: {
    readonly getCredential: () => string | null;
    readonly renew: (credential: string) => Promise<InferenceCredential>;
    readonly setCredential: (credential: InferenceCredential) => void;
    readonly onResult?: (result: RenewalResult) => void;
    readonly retry: RetryPolicy;
    readonly clock: Clock;
  }) {}

  start(): void { this.loop ??= this.run(); }
  close(): void { this.abort.abort(); }

  requestImmediateRenewal(): Promise<boolean> {
    if (this.onDemandRenewal !== undefined) return this.onDemandRenewal.promise.then(() => true);
    // A refused credential's backoff is cut short too (20 October 2026): a sign-out revoked it, the next sign-in made it
    // good again without a new box (`revive_box_credential`), and the box's first model call waited out up to five minutes.
    const interrupt = this.interruptRefreshWait ?? this.interruptBackoffWait;
    if (interrupt === undefined) return Promise.resolve(false);
    this.onDemandRenewal = Promise.withResolvers<void>();
    const result = this.onDemandRenewal.promise.then(() => true);
    interrupt();
    return result;
  }

  private async run(): Promise<void> {
    try {
      while (!this.abort.signal.aborted) {
        const next = await this.cycle();
        this.completeOnDemandRenewal();
        if (next === null) return;
        await this.waitFor(next);
      }
    } finally { this.completeOnDemandRenewal(); }
  }

  private completeOnDemandRenewal(): void { this.onDemandRenewal?.resolve(); this.onDemandRenewal = undefined; }

  private async cycle(): Promise<{ kind: "refresh"; delayMs: number } | { kind: "backoff"; attempt: number } | null> {
    const cycleStartedAtMs = Date.now();
    try {
      const credential = this.options.getCredential();
      if (credential == null || credential.length === 0) return { kind: "refresh", delayMs: MAX_REFRESH_INTERVAL_MS };
      const renewed = await this.options.renew(credential);
      if (this.abort.signal.aborted) return null;
      this.options.setCredential(renewed);
      this.consecutiveFailures = 0;
      this.renewedOnce = true;
      this.reportResult("renewed", Date.now() - cycleStartedAtMs);
      const untilRefresh = renewed.expiresAtMs - Date.now() - REFRESH_LEEWAY_MS;
      return { kind: "refresh", delayMs: Math.min(Math.max(untilRefresh, MIN_REFRESH_INTERVAL_MS), MAX_REFRESH_INTERVAL_MS) };
    } catch (error) {
      if (this.abort.signal.aborted) return null;
      if (error instanceof SandCredentialNotReadyError) return { kind: "refresh", delayMs: DEV_TOKEN_FILE_POLL_MS };
      this.consecutiveFailures += 1;
      this.reportResult("failed", Date.now() - cycleStartedAtMs, redactRenewalErrorForReport(error instanceof Error ? error.message : String(error)));
      return { kind: "backoff", attempt: this.consecutiveFailures };
    }
  }

  private async waitFor(next: { kind: "refresh"; delayMs: number } | { kind: "backoff"; attempt: number }): Promise<void> {
    const signal = this.abort.signal;
    if (signal.aborted) return;
    if (next.kind === "backoff") {
      const attempt = !this.renewedOnce && next.attempt <= FIRST_CREDENTIAL_FAST_RETRIES ? 1 : next.attempt;
      const cut = new AbortController();
      const finish = () => cut.abort();
      this.interruptBackoffWait = finish;
      signal.addEventListener("abort", finish, { once: true });
      try {
        await this.options.retry.schedule(attempt, cut.signal).elapsed.catch((error) => {
          if (!cut.signal.aborted) console.warn(`[sand-credential-renewer] backoff wait failed (${errorLogTag(error)})`);
        });
      } finally {
        signal.removeEventListener("abort", finish);
        if (this.interruptBackoffWait === finish) this.interruptBackoffWait = undefined;
      }
      return;
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      let scheduled: { dispose(): void };
      const finish = () => {
        if (settled) return;
        settled = true;
        scheduled.dispose();
        signal.removeEventListener("abort", finish);
        if (this.interruptRefreshWait === finish) this.interruptRefreshWait = undefined;
        resolve();
      };
      scheduled = this.options.clock.schedule(next.delayMs, finish);
      this.interruptRefreshWait = finish;
      signal.addEventListener("abort", finish, { once: true });
    });
  }

  private reportResult(outcome: "renewed" | "failed", durationMs: number, errorSummary?: string): void {
    try { this.options.onResult?.({ outcome, consecutiveFailures: this.consecutiveFailures, durationMs, errorSummary }); }
    catch {}
  }
}

export function redactRenewalErrorForReport(raw: string): string {
  return raw.replace(/https?:\/\/\S+/gi, "<url>").replace(/\/[^\s"']+/g, "<path>").replace(/[A-Za-z0-9_-]{24,}/g, "<id>").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function getSandInferenceBackendUrl(): string { return getConfiguredBackendUrl(); }
