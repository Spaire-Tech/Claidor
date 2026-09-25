/**
 * Event listeners are Coming Soon on Simeon (25 September 2026,
 * design-audit-ledger.md cluster `listeners-coming-soon`).
 *
 * A listener routine (Slack, GitHub, Microsoft Teams, Linear, Sentry,
 * PagerDuty) fires through a relay Grok Bot reaches on Cursor's server:
 * `/sand/listener-subscriptions`, `/sand/listener-events/poll`,
 * `/sand/automation-events/poll`, plus `AutomationsService` and the
 * dashboard's Slack/GitHub account connections. Simeon Labs' server serves
 * none of them (`server/polar/desktop/*.py`: fourteen HTTP routes, no
 * Connect RPC, no `/sand/*`). No flag or gate turns that on, so by the
 * founder's rule the feature is Coming Soon, and it says so at every reach
 * point: the update_state tool refuses a listener trigger with the
 * sentence below, the agent's brief offers cron schedules only, the
 * connect URL is not cursor.com, and the box does not poll the relay.
 *
 * When the relay exists, `SAND_LISTENER_RELAY_SERVED=1` in the box's
 * environment restores Grok Bot's listener paths unchanged.
 */
export const LISTENER_RELAY_SERVED_ENV = "SAND_LISTENER_RELAY_SERVED";

export const LISTENERS_COMING_SOON_SENTENCE =
  "Event listeners (Slack, GitHub, Microsoft Teams, Linear, Sentry, PagerDuty) are coming soon on Simeon. For now a routine fires on a cron schedule; use one, bounded to the hours that matter.";

// The founder, 25 September 2026: the Mac can be awake while the app is
// closed, and a routine should still execute. The box stays up on quit when
// a routine is enabled and renews its own model credential
// (electron-main/box/local-docker-host-connector.ts, `stopLocalDockerBoxOnQuit`).
export const ROUTINES_AWAY_COMING_SOON_SENTENCE =
  "A routine fires while this computer is awake, whether Simeon is open or closed; it cannot fire while the computer is asleep or off, and it does not run anywhere else.";

export function isListenerRelayServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LISTENER_RELAY_SERVED_ENV]?.trim() === "1";
}

/** True when a trigger, in any of the tool's three shapes, carries a member that is not a cron schedule. */
export function triggerHasListener(trigger: unknown): boolean {
  const members = Array.isArray(trigger)
    ? trigger
    : trigger != null && typeof trigger === "object" && (trigger as { type?: unknown }).type === "group"
      ? (trigger as { listeners?: unknown }).listeners
      : [trigger];
  return Array.isArray(members) && members.some((member) => member != null && typeof member === "object" && (member as { type?: unknown }).type !== "cron");
}
