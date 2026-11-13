/**
 * Waiting on the chat's card to connect Claude or ChatGPT (13 November 2026,
 * the founder: "when neither of them is connected, the user is given a
 * choice of both cards to connect").
 *
 * A launch that found neither connected leaves the card in the agent's chat
 * (`cloud-agents-service.ts`, `codingReady`) and the agent's turn ends. The
 * person connects one from the card, in the app: Claude signs in on this
 * computer, ChatGPT on Simeon Labs' server. Either way the server's model
 * list is what says a program can code now (`codingChoice`), so it is read
 * again every few seconds while an agent waits, and the agent is resumed the
 * moment one is there, as after the Connect GitHub card. An agent nobody
 * connected for is forgotten after twenty minutes: the card still works, and
 * the person's next message launches.
 */
import type { CodingChoice } from "./coding-choice.js";

export const MODEL_CONNECT_POLL_MS = 6_000;
export const MODEL_CONNECT_LIFETIME_MS = 20 * 60_000;

export interface ModelConnectWaitDeps {
  /** What the coding would run on now; none while neither is connected. */
  readonly connected: () => CodingChoice | undefined;
  /** Reads the server's model list again. */
  readonly read: () => Promise<unknown>;
  /** One is connected: the agent that waited goes on. */
  readonly onConnected: (agentId: string, choice: CodingChoice) => void;
  readonly intervalMs?: number;
  readonly lifetimeMs?: number;
  readonly now?: () => number;
}

export class ModelConnectWait {
  /** Each waiting agent, and until when it is waited for. */
  private readonly waiting = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private checking = false;

  constructor(private readonly deps: ModelConnectWaitDeps) {}

  /** `agentId` waits from now (its card was just shown). */
  wait(agentId: string): void {
    const now = (this.deps.now ?? Date.now)();
    this.waiting.set(agentId, now + (this.deps.lifetimeMs ?? MODEL_CONNECT_LIFETIME_MS));
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.check(), this.deps.intervalMs ?? MODEL_CONNECT_POLL_MS);
    this.timer.unref?.();
  }

  /** Agents waiting now. */
  size(): number { return this.waiting.size; }

  /** One look: the list read again, and every waiting agent resumed when a program can code. */
  async check(): Promise<void> {
    if (this.checking || this.waiting.size === 0) return;
    this.checking = true;
    try {
      const now = (this.deps.now ?? Date.now)();
      for (const [agentId, until] of this.waiting) if (until <= now) this.waiting.delete(agentId);
      if (this.waiting.size > 0) {
        await this.deps.read().catch(() => undefined);
        const choice = this.deps.connected();
        if (choice !== undefined) {
          const agents = [...this.waiting.keys()];
          this.waiting.clear();
          for (const agentId of agents) {
            try { this.deps.onConnected(agentId, choice); } catch { /* the caller's own trouble */ }
          }
        }
      }
    } finally {
      this.checking = false;
      if (this.waiting.size === 0) this.stop();
    }
  }

  private stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.waiting.clear();
    this.stop();
  }
}
