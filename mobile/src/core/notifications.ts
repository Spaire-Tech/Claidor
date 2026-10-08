/**
 * Notifications on the phone: the device's registration with Simeon Labs'
 * server, and what a tapped notification opens.
 *
 * The server's half (`/desktop/push-devices`, the sends from the box) is
 * written alongside this (8 October 2026); this file is the contract:
 *
 *   POST   {api}/desktop/push-devices  {"expo_push_token": "<token>", "platform": "ios"}
 *   DELETE {api}/desktop/push-devices  {"expo_push_token": "<token>"}
 *
 * both with `Authorization: Bearer <accessToken>`; and a notification's
 * data is `{"agentId": string, "kind": "agent-done" | "agent-needs-input"}`.
 */

export const PUSH_DEVICES_PATH = "/desktop/push-devices";
export const PUSH_PLATFORM = "ios";

export type AgentNotificationKind = "agent-done" | "agent-needs-input";
export const AGENT_NOTIFICATION_KINDS: readonly AgentNotificationKind[] = ["agent-done", "agent-needs-input"];

export interface AgentNotification {
  readonly agentId: string;
  readonly kind: AgentNotificationKind;
}

/**
 * The agent a notification is about, from its data, or null. A kind the app
 * does not know yet still opens its agent: the agent is what the person
 * tapped, and a newer server may say more about why.
 */
export function agentOfNotification(data: unknown): AgentNotification | null {
  if (data == null || typeof data !== "object") return null;
  const { agentId, kind } = data as { agentId?: unknown; kind?: unknown };
  if (typeof agentId !== "string" || agentId.trim().length === 0 || agentId.length > 200) return null;
  return { agentId: agentId.trim(), kind: AGENT_NOTIFICATION_KINDS.includes(kind as AgentNotificationKind) ? kind as AgentNotificationKind : "agent-done" };
}

/**
 * Opens the agent in the window: the bridge's `__simeonNative.openAgent`
 * (`desktop/web/bridge.ts`) pushes the same main event a click on the Mac's
 * notification pushes (`focus-agent`, `os-notification-manager.ts`).
 * Guarded, so a page without the bridge is left alone.
 */
export function openAgentScript(agentId: string): string {
  return `(function () {
  var native = window.__simeonNative;
  if (native && typeof native.openAgent === "function") native.openAgent(${JSON.stringify(agentId)});
})();
true;`;
}

export interface JsonRequest {
  readonly url: string;
  readonly init: { readonly method: "POST" | "DELETE"; readonly headers: Record<string, string>; readonly body: string };
}

const headers = (accessToken: string): Record<string, string> => ({ authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json" });

export function registerDeviceRequest(api: string, accessToken: string, expoPushToken: string): JsonRequest {
  return { url: `${api}${PUSH_DEVICES_PATH}`, init: { method: "POST", headers: headers(accessToken), body: JSON.stringify({ expo_push_token: expoPushToken, platform: PUSH_PLATFORM }) } };
}

export function unregisterDeviceRequest(api: string, accessToken: string, expoPushToken: string): JsonRequest {
  return { url: `${api}${PUSH_DEVICES_PATH}`, init: { method: "DELETE", headers: headers(accessToken), body: JSON.stringify({ expo_push_token: expoPushToken }) } };
}

/**
 * Taps waiting for the window. A tap can arrive before the page is up (the
 * app was closed: the tap launched it) or while it is reloading; the agent
 * opens once the bridge says the window listens (`simeon.ready`). Only the
 * last tap counts, and each notification opens once, however many times
 * iOS reports the same response (the launch response is reported both by
 * `getLastNotificationResponse` and by the listener).
 */
export class AgentOpenQueue {
  private pending: string | null = null;
  private ready = false;
  private readonly seen = new Set<string>();

  constructor(private readonly open: (agentId: string) => void) {}

  /** A tapped notification, by its request identifier. */
  tapped(responseId: string, data: unknown): void {
    if (this.seen.has(responseId)) return;
    this.seen.add(responseId);
    const agent = agentOfNotification(data);
    if (agent == null) return;
    if (this.ready) this.open(agent.agentId);
    else this.pending = agent.agentId;
  }

  /** The window listens: open what waited. */
  windowReady(): void {
    this.ready = true;
    const waiting = this.pending;
    this.pending = null;
    if (waiting != null) this.open(waiting);
  }

  /** The page is going away (a reload, a sign-out): hold taps until it is back. */
  windowGone(): void { this.ready = false; }

  get waiting(): string | null { return this.pending; }
}
