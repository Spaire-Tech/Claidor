import { randomUUID } from "node:crypto";

import type { Clock } from "../../../internal/scheduling.js";
import {
  APP_BROWSER_TASK_IDLE_MS,
  LOCAL_BROWSER_LIVENESS_WINDOW_MS,
  LOCAL_BROWSER_PROTOCOL,
  LOCAL_BROWSER_RECONNECT_GRACE_MS,
  LOCAL_BROWSER_STEP_DEADLINE_MS,
  appBrowserClosedMessage,
  appBrowserPlace,
  appBrowserStoppedMessage,
  appBrowserTimeoutMessage,
} from "../../../shared/local-browser-gateway.js";
import type { AppBrowserChoice, AppBrowserLive, AppBrowserRoute, AppBrowserStep } from "../../runner/tools/app-browser-route.js";

/**
 * The browser in the app, the engine's side (docs/app-browser/README.md,
 * step 1, 4 November 2026). A Mac or Windows app with a browser opens
 * `GET /local-browser/requests` (the engine's frames, as server-sent
 * events) and answers on `POST /local-browser/responses`, as local exec
 * does (`local-exec-bridge.ts`). Its hello says it has a browser; the
 * agent's browser steps then go to it, when the server's switch is on.
 *
 * A task stays where it started. Each agent's tab (its view) keeps the
 * browser its first step went to: the app's, named by the browser session
 * its hello gave, or the computer's. Only a step that opens an address may
 * choose again, once the computer's task has been idle ten minutes or the
 * app's browser it was in has closed. Any other step on a closed app
 * browser fails with a plain sentence, and the view's next steps go to the
 * computer: the page is never moved without the agent being told.
 */

export interface LocalBrowserFrame { readonly kind: string; readonly requestId?: string; readonly [key: string]: unknown; }

export interface LocalBrowserReport {
  readonly event: "registered" | "detached" | "hello" | "refused-hello" | "route" | "closed" | "timeout" | "stopped";
  readonly [key: string]: unknown;
}

export interface LocalBrowserBridgeDeps {
  readonly clock: Clock;
  /** The server's switch (`SIMEON_APP_BROWSER`), read for each new task. */
  readonly enabled: () => boolean;
  readonly randomId?: () => string;
  readonly reconnectGraceMs?: number;
  readonly taskIdleMs?: number;
  readonly report?: (report: LocalBrowserReport) => void;
}

interface Hello { readonly platform: string; readonly label?: string; readonly deviceId?: string; readonly browserSession: string; }

interface Provider {
  readonly id: string;
  readonly send: (frame: LocalBrowserFrame) => void;
  readonly registeredAt: number;
  lastSeenAt: number;
  hasHeartbeat: boolean;
  hello?: Hello;
}

interface Pending {
  readonly provider: Provider;
  readonly place: string;
  readonly resolve: (frame: LocalBrowserFrame) => void;
  readonly reject: (error: Error) => void;
}

type Task =
  | { readonly route: "box"; lastStepAt: number }
  | { readonly route: "app"; readonly browserSession: string; readonly place: string; lastStepAt: number };

export class LocalBrowserError extends Error { override readonly name = "LocalBrowserError"; }

function abortError(): Error {
  const error = new Error("The browser step was cancelled.");
  error.name = "AbortError";
  return error;
}

const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export class LocalBrowserBridge implements AppBrowserRoute {
  private readonly providers = new Map<string, Provider>();
  private readonly pending = new Map<string, Pending>();
  private readonly tasks = new Map<string, Task>();
  private readonly helloWaiters = new Set<() => void>();
  private readonly graceMs: number;
  private readonly idleMs: number;

  constructor(private readonly deps: LocalBrowserBridgeDeps) {
    this.graceMs = deps.reconnectGraceMs ?? LOCAL_BROWSER_RECONNECT_GRACE_MS;
    this.idleMs = deps.taskIdleMs ?? APP_BROWSER_TASK_IDLE_MS;
  }

  isEnabled(): boolean { return this.deps.enabled(); }

  registerProvider(send: (frame: LocalBrowserFrame) => void): () => void {
    const now = this.deps.clock.now();
    const provider: Provider = { id: this.deps.randomId?.() ?? randomUUID(), send, registeredAt: now, lastSeenAt: now, hasHeartbeat: false };
    this.providers.set(provider.id, provider);
    this.deps.report?.({ event: "registered", providerId: provider.id, providers: this.providers.size });
    try { send({ kind: "welcome", providerId: provider.id, protocol: LOCAL_BROWSER_PROTOCOL, enabled: this.deps.enabled() }); } catch {}
    return () => {
      if (!this.providers.delete(provider.id)) return;
      this.deps.report?.({ event: "detached", providerId: provider.id, providers: this.providers.size, hadHello: provider.hello !== undefined });
      for (const [requestId, pending] of this.pending) {
        if (pending.provider !== provider) continue;
        this.pending.delete(requestId);
        pending.reject(new LocalBrowserError(appBrowserStoppedMessage(pending.place)));
      }
    };
  }

  submitResponses(batch: { readonly providerId?: unknown; readonly frames?: unknown }): void {
    // Only the stream that was sent a request may answer it: no fallback to another provider.
    const provider = typeof batch?.providerId === "string" ? this.providers.get(batch.providerId) : undefined;
    if (provider === undefined || !Array.isArray(batch.frames)) return;
    for (const raw of batch.frames as unknown[]) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
      const frame = raw as LocalBrowserFrame;
      if (frame.kind === "hello") { this.hello(provider, frame); continue; }
      if (frame.kind === "ping") { provider.hasHeartbeat = true; provider.lastSeenAt = this.deps.clock.now(); continue; }
      if (frame.kind === "response" && typeof frame.requestId === "string") {
        const pending = this.pending.get(frame.requestId);
        if (pending === undefined || pending.provider !== provider) continue;
        this.pending.delete(frame.requestId);
        provider.lastSeenAt = this.deps.clock.now();
        pending.resolve(frame);
      }
    }
  }

  private hello(provider: Provider, frame: LocalBrowserFrame): void {
    const platform = frame.platform === "mac" || frame.platform === "windows" ? frame.platform : undefined;
    const session = typeof frame.browserSession === "string" && SESSION_PATTERN.test(frame.browserSession) ? frame.browserSession : undefined;
    if (frame.protocol !== LOCAL_BROWSER_PROTOCOL || frame.browser !== true || platform === undefined || session === undefined) {
      this.deps.report?.({ event: "refused-hello", providerId: provider.id, protocol: typeof frame.protocol === "number" ? frame.protocol : null, browser: frame.browser === true, platform: platform ?? null, session: session !== undefined });
      return;
    }
    provider.hello = {
      platform,
      browserSession: session,
      ...(typeof frame.label === "string" && frame.label.length > 0 ? { label: frame.label.slice(0, 120) } : {}),
      ...(typeof frame.deviceId === "string" && frame.deviceId.length > 0 ? { deviceId: frame.deviceId.slice(0, 120) } : {}),
    };
    provider.lastSeenAt = this.deps.clock.now();
    this.deps.report?.({ event: "hello", providerId: provider.id, platform, helloDelayMs: provider.lastSeenAt - provider.registeredAt });
    for (const wake of [...this.helloWaiters]) wake();
  }

  private isLive(provider: Provider, now: number): boolean {
    return provider.hello !== undefined && (!provider.hasHeartbeat || now - provider.lastSeenAt <= LOCAL_BROWSER_LIVENESS_WINDOW_MS);
  }

  /** The live app browser a new task goes to: the one heard from last. */
  private best(now: number): Provider | undefined {
    let best: Provider | undefined;
    for (const provider of this.providers.values()) {
      if (!this.isLive(provider, now)) continue;
      if (best === undefined || provider.lastSeenAt >= best.lastSeenAt) best = provider;
    }
    return best;
  }

  private forSession(browserSession: string, now: number): Provider | undefined {
    let found: Provider | undefined;
    for (const provider of this.providers.values()) {
      if (provider.hello?.browserSession !== browserSession || !this.isLive(provider, now)) continue;
      if (found === undefined || provider.lastSeenAt >= found.lastSeenAt) found = provider;
    }
    return found;
  }

  /** The session's stream, waiting a little for one that dropped to come back. */
  private async awaitSession(browserSession: string, signal: AbortSignal | undefined): Promise<Provider | undefined> {
    const now = this.deps.clock.now();
    const present = this.forSession(browserSession, now);
    if (present !== undefined || this.graceMs <= 0) return present;
    return await new Promise<Provider | undefined>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (provider: Provider | undefined) => {
        this.helloWaiters.delete(check);
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(provider);
      };
      const check = () => { const provider = this.forSession(browserSession, this.deps.clock.now()); if (provider !== undefined) finish(provider); };
      const onAbort = () => finish(undefined);
      this.helloWaiters.add(check);
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => finish(undefined), this.graceMs);
    });
  }

  private fresh(viewId: string, now: number): Task {
    const live = this.deps.enabled() ? this.best(now) : undefined;
    const task: Task = live?.hello === undefined
      ? { route: "box", lastStepAt: now }
      : { route: "app", browserSession: live.hello.browserSession, place: appBrowserPlace(live.hello.platform), lastStepAt: now };
    this.tasks.set(viewId, task);
    this.deps.report?.({ event: "route", viewId, route: task.route, ...(task.route === "app" ? { place: task.place } : {}) });
    return task;
  }

  async choose(viewId: string, options: { readonly opensAddress: boolean; readonly signal?: AbortSignal }): Promise<AppBrowserChoice> {
    const now = this.deps.clock.now();
    let task = this.tasks.get(viewId);
    if (task === undefined || (task.route === "box" && options.opensAddress && now - task.lastStepAt > this.idleMs)) task = this.fresh(viewId, now);
    task.lastStepAt = now;
    if (task.route === "box") return { route: "box" };
    const provider = await this.awaitSession(task.browserSession, options.signal);
    if (options.signal?.aborted === true) throw abortError();
    if (provider !== undefined) return { route: "app", browserSession: task.browserSession, place: task.place };
    // The app's browser this task was in has closed.
    if (options.opensAddress) {
      const next = this.fresh(viewId, this.deps.clock.now());
      return next.route === "app" ? { route: "app", browserSession: next.browserSession, place: next.place } : { route: "box" };
    }
    this.tasks.set(viewId, { route: "box", lastStepAt: this.deps.clock.now() });
    this.deps.report?.({ event: "closed", viewId, place: task.place });
    return { route: "gone", message: appBrowserClosedMessage(task.place) };
  }

  async request(choice: AppBrowserLive, step: AppBrowserStep, options: { readonly signal?: AbortSignal; readonly timeoutMs: number }): Promise<Record<string, unknown>> {
    if (options.signal?.aborted === true) throw abortError();
    const provider = this.forSession(choice.browserSession, this.deps.clock.now());
    if (provider === undefined) throw new LocalBrowserError(appBrowserStoppedMessage(choice.place));
    const requestId = this.deps.randomId?.() ?? randomUUID();
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancel = () => { try { provider.send({ kind: "cancel", requestId }); } catch {} };
      const settle = () => { this.pending.delete(requestId); if (timer !== undefined) clearTimeout(timer); options.signal?.removeEventListener("abort", onAbort); };
      const onAbort = () => { settle(); cancel(); reject(abortError()); };
      this.pending.set(requestId, {
        provider,
        place: choice.place,
        resolve: (frame) => { settle(); resolve(frame); },
        reject: (error) => { settle(); this.deps.report?.({ event: "stopped", op: step.op, place: choice.place }); reject(error); },
      });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        settle();
        cancel();
        this.deps.report?.({ event: "timeout", op: step.op, place: choice.place, timeoutMs: options.timeoutMs });
        reject(new LocalBrowserError(appBrowserTimeoutMessage(choice.place, options.timeoutMs)));
      }, options.timeoutMs);
      try {
        provider.send({ ...step, kind: "request", requestId, protocol: LOCAL_BROWSER_PROTOCOL, deadlineMs: Math.min(LOCAL_BROWSER_STEP_DEADLINE_MS, options.timeoutMs) });
      } catch {
        settle();
        reject(new LocalBrowserError(appBrowserStoppedMessage(choice.place)));
      }
    });
  }
}
