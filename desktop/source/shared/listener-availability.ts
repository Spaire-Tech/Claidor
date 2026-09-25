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

export const ROUTINES_AWAY_COMING_SOON_SENTENCE =
  "A routine fires while Simeon is open on this computer and the computer is awake; running while the user is away is coming soon.";

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
