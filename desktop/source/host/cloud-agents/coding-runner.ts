/**
 * The person's computer taking its cloud agents' coding work from Simeon
 * Labs' server, one turn at a time (11 November 2026;
 * `server/simeon/sand/cloud_agents_computer.py`).
 *
 * The cloud runner's loop (`runner/src/loop.ts`), here: claim a turn, do it
 * (`coding-run.ts`), report it, again. A heartbeat every half minute keeps
 * the lease and carries what was found so far, and its answer says when the
 * person asked the work to stop; the turn is then cut short. A launch or a
 * follow-up from this computer asks at once (`kick`); otherwise it asks once
 * a minute, which also takes back a turn whose lease ran out while the
 * engine was restarting. While a turn runs the computer counts as busy, so
 * it is not put to sleep under the work (`sand-host.ts`, `getHealth`).
 */
import os from "node:os";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import type { CodingJob, CodingOutcome, CodingWork } from "./coding-run.js";

export const COMPUTER_PATH = "/desktop/api/cloud-agents/computer";
const CLAIM_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
/** A report that didn't reach the server is tried this many times; then the lease runs out and the turn comes back. */
const REPORT_TRIES = 4;

export interface ComputerServer {
  claim(runner: string): Promise<CodingJob | null>;
  heartbeat(id: string, runner: string, work: CodingWork | undefined): Promise<{ readonly cancelRequested: boolean }>;
  complete(id: string, runner: string, body: { readonly result: string; readonly messages: readonly { role: string; text: string }[]; readonly work: CodingWork }): Promise<void>;
  fail(id: string, runner: string, body: { readonly reason: string; readonly retryable: boolean; readonly work?: CodingWork }): Promise<void>;
}

/** The server's side over HTTP, with the computer's own credential (`get_desktop_or_box_session`). */
export function createComputerServer(deps: {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}): ComputerServer {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const post = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
    const backendUrl = deps.getBackendUrl();
    const token = await deps.getAccessToken({ backendUrl });
    if (token.length === 0) throw new Error(`no credential for ${backendUrl}`);
    const response = await fetchImpl(new URL(`${COMPUTER_PATH}${path}`, backendUrl).toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return await response.json() as unknown;
  };
  return {
    claim: async (runner) => {
      const answer = await post("/claim", { runner }) as { job?: CodingJob | null };
      return answer.job ?? null;
    },
    heartbeat: async (id, runner, work) => {
      const answer = await post(`/jobs/${encodeURIComponent(id)}/heartbeat`, { runner, ...(work === undefined ? {} : { work }) }) as { cancelRequested?: unknown };
      return { cancelRequested: answer.cancelRequested === true };
    },
    complete: async (id, runner, body) => { await post(`/jobs/${encodeURIComponent(id)}/complete`, { runner, ...body }); },
    fail: async (id, runner, body) => { await post(`/jobs/${encodeURIComponent(id)}/fail`, { runner, ...body }); },
  };
}

export interface CodingRunnerDeps {
  readonly server: ComputerServer;
  readonly run: (job: CodingJob, signal: AbortSignal, onWork: (work: CodingWork) => void) => Promise<CodingOutcome>;
  readonly runnerName?: string;
  readonly claimIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly log?: (line: string) => void;
  readonly wait?: (ms: number) => Promise<void>;
}

export class CodingRunner {
  private readonly name: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private working = false;
  private askAgain = false;
  private stopped = false;
  private current: { readonly id: string; readonly abort: AbortController } | undefined;

  constructor(private readonly deps: CodingRunnerDeps) {
    this.name = deps.runnerName ?? `computer-${os.hostname()}-${process.pid}`.slice(0, 120);
  }

  private log(line: string): void { (this.deps.log ?? logHostLine)(`${HOST_LOG_PREFIX} coding ${line}`); }

  /** Asks once a minute from now, and once at once. */
  start(): void {
    if (this.timer !== undefined || this.stopped) return;
    this.timer = setInterval(() => this.kick(), this.deps.claimIntervalMs ?? CLAIM_INTERVAL_MS);
    this.timer.unref?.();
    this.kick();
  }

  /** The turn running ends; nothing more is taken. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.current?.abort.abort();
  }

  /** A turn is being done on this computer. */
  isBusy(): boolean { return this.working; }

  /** Asks for work now (after a launch or a follow-up); while a turn runs, right after it. */
  kick(): void {
    if (this.stopped) return;
    if (this.working) { this.askAgain = true; return; }
    this.working = true;
    void this.drain().finally(() => { this.working = false; });
  }

  /** Takes turns until there is none. */
  private async drain(): Promise<void> {
    for (;;) {
      this.askAgain = false;
      let job: CodingJob | null;
      try {
        job = await this.deps.server.claim(this.name);
      } catch (error) {
        this.log(`claim didn't reach the server: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (job === null) {
        if (this.askAgain && !this.stopped) continue;
        return;
      }
      await this.work(job);
      if (this.stopped) return;
    }
  }

  private async work(job: CodingJob): Promise<void> {
    const abort = new AbortController();
    this.current = { id: job.id, abort };
    let latest: CodingWork | undefined;
    this.log(`job=${job.id} bcId=${job.bcId} claimed attempt=${job.attempts}`);
    const beat = setInterval(() => {
      this.deps.server.heartbeat(job.id, this.name, latest).then((state) => {
        if (state.cancelRequested && !abort.signal.aborted) {
          this.log(`job=${job.id} the person asked it to stop`);
          abort.abort();
        }
      }).catch((error) => this.log(`job=${job.id} heartbeat didn't reach the server: ${error instanceof Error ? error.message : String(error)}`));
    }, this.deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
    beat.unref?.();
    let outcome: CodingOutcome;
    try {
      outcome = await this.deps.run(job, abort.signal, (work) => { latest = work; });
    } catch (error) {
      outcome = { kind: "failed", reason: `The coding stopped on the computer: ${error instanceof Error ? error.message : String(error)}`, retryable: true };
    } finally {
      clearInterval(beat);
      this.current = undefined;
    }
    await this.report(job, outcome);
  }

  private async report(job: CodingJob, outcome: CodingOutcome): Promise<void> {
    const wait = this.deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 1; attempt <= REPORT_TRIES; attempt += 1) {
      try {
        if (outcome.kind === "done") {
          await this.deps.server.complete(job.id, this.name, { result: outcome.text, messages: outcome.text === "" ? [] : [{ role: "assistant", text: outcome.text }], work: outcome.work });
        } else {
          await this.deps.server.fail(job.id, this.name, { reason: outcome.reason, retryable: outcome.retryable, ...(outcome.work === undefined ? {} : { work: outcome.work }) });
        }
        this.log(`job=${job.id} reported ${outcome.kind}`);
        return;
      } catch (error) {
        this.log(`job=${job.id} report try ${attempt} didn't reach the server: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt < REPORT_TRIES) await wait(attempt * 5_000);
      }
    }
  }
}
