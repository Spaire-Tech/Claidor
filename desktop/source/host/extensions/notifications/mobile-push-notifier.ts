/**
 * The person's iPhone hears what the Mac hears (8 October 2026, the founder:
 * "i want the app ready. mobile ios... plus other stuff, like notification
 * etc.").
 *
 * The Mac raises its own notification when an agent finishes a turn or needs
 * the person (`electron-main/notifications/os-notification-manager.ts`); with
 * the Mac closed nothing watched. The agents run here, in the box, so the box
 * runs the Mac's own decision (`SandOsNotificationDecider`) over the same
 * agents list and posts each notification to `POST /desktop/push`, which
 * sends it to the person's phones through Expo (`server/simeon/desktop/push.py`).
 * The upstream app sent the same news over
 * `ComputerService.NotifySandAgentTurnFinished`, which Simeon's server only
 * logs; the box no longer calls it.
 *
 * - The agents as the host found them at start are the baseline and never
 *   fire: a restart is not news.
 * - The agent's notify setting and a hidden agent count exactly as on the Mac
 *   (the decider's `shouldNotify`).
 * - The Mac's window is taken as unfocused: a person looking at the Mac still
 *   gets the push on the phone (docs/services-agents.md §12, a known
 *   limitation for now).
 * - The same agent's same news at most once in 30 s, the server's own cap.
 * - Fire and forget: a post that fails or takes over 10 s is one log line and
 *   nothing else. A turn never waits on it.
 */
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { getSandBackendClientHeaders } from "../../../shared/node/sand-client-metadata.js";
import { buildNotificationContent, SandOsNotificationDecider, toNotificationSnapshot, type NotificationAgent, type NotificationTransition } from "../../../shared/os-notification.js";

export const SAND_PHONE_PUSH_PATH = "/desktop/push";
export const SAND_PHONE_PUSH_TIMEOUT_MS = 10_000;
export const SAND_PHONE_PUSH_THROTTLE_MS = 30_000;

/** Only the host in the person's computer pushes: the box's supervisor sets
 * `SAND_HOST_IN_BOX=1` (`box/bin/simeon-supervisor.mjs`), and a host under
 * test or anywhere else stays quiet. The local-docker computer (internal
 * testing) runs the same image, so it pushes to the tester's own phone. */
export function isSandPhonePushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SAND_HOST_IN_BOX === "1";
}

/** The body of `POST /desktop/push`, as the server reads it. */
export interface MobilePush { readonly agent_id: string; readonly kind: NotificationTransition["kind"]; readonly title: string; readonly body: string; }

export function mobilePushFor(transition: NotificationTransition): MobilePush {
  const { title, body } = buildNotificationContent(transition);
  return { agent_id: transition.agentId, kind: transition.kind, title, body };
}

function describe(error: unknown): string {
  return clipForHostLog(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

export function createSandMobilePushSender(deps: {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}): (push: MobilePush) => Promise<void> {
  const log = deps.log ?? logHostLine;
  return async (push) => {
    const what = `agent=${push.agent_id} kind=${push.kind}`;
    try {
      const backendUrl = deps.getBackendUrl();
      const accessToken = await deps.getAccessToken({ backendUrl });
      const response = await (deps.fetchImpl ?? fetch)(new URL(SAND_PHONE_PUSH_PATH, backendUrl).toString(), {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json", ...getSandBackendClientHeaders() },
        body: JSON.stringify(push),
        signal: AbortSignal.timeout(deps.timeoutMs ?? SAND_PHONE_PUSH_TIMEOUT_MS)
      });
      const answer = clipForHostLog(await response.text().catch(() => ""), 120);
      log(`${HOST_LOG_PREFIX} phone push ${response.ok ? "posted" : "failed"} ${what} status=${response.status} ${answer}`.trimEnd());
    } catch (error) {
      log(`${HOST_LOG_PREFIX} phone push failed ${what} error=${describe(error)}`);
    }
  };
}

export class SandMobilePushNotifier {
  private readonly decider = new SandOsNotificationDecider(SAND_PHONE_PUSH_THROTTLE_MS);
  private readonly now: () => number;
  private hasSeededBaseline = false;
  private preSeedUpserts: NotificationAgent[] = [];

  constructor(private readonly deps: { readonly send: (push: MobilePush) => Promise<void>; readonly now?: () => number }) {
    this.now = deps.now ?? Date.now;
  }

  seedBaseline(agents: readonly NotificationAgent[]): void {
    this.decider.seedBaseline(agents.map(toNotificationSnapshot));
    this.flushPreSeedUpserts();
  }

  handleAgentsEvent(event: { readonly agents: readonly NotificationAgent[] }): void {
    const transitions = this.decider.decide({ agents: event.agents.map(toNotificationSnapshot), isWindowFocused: false, nowMs: this.now() });
    this.flushPreSeedUpserts();
    for (const transition of transitions) this.fire(transition);
  }

  handleAgentUpsertedEvent(event: { readonly agent: NotificationAgent }): void {
    if (!this.hasSeededBaseline) { this.preSeedUpserts.push(event.agent); return; }
    for (const transition of this.decider.decideAgent(toNotificationSnapshot(event.agent), { isWindowFocused: false, nowMs: this.now() })) this.fire(transition);
  }

  forget(agentId: string): void { this.decider.forget(agentId); }

  private flushPreSeedUpserts(): void {
    if (this.hasSeededBaseline) return;
    this.hasSeededBaseline = true;
    const buffered = this.preSeedUpserts;
    this.preSeedUpserts = [];
    for (const agent of buffered) this.handleAgentUpsertedEvent({ agent });
  }

  private fire(transition: NotificationTransition): void {
    let push: MobilePush;
    try { push = mobilePushFor(transition); }
    catch (error) { logHostLine(`${HOST_LOG_PREFIX} phone push failed agent=${transition.agentId} kind=${transition.kind} error=${describe(error)}`); return; }
    void this.deps.send(push).catch(() => {});
  }
}
