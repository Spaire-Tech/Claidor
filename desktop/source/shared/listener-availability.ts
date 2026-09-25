/**
 * Event listeners are served by Simeon Labs' server since 25 September
 * 2026 (`server/polar/sand/listeners*.py`, `docs/product/listeners-served.md`).
 *
 * A listener routine (Slack, GitHub, Linear, Sentry, PagerDuty) fires
 * through the relay Grok Bot reached on Cursor's server:
 * `/sand/listener-subscriptions`, `/sand/listener-events/poll`,
 * `/sand/automation-events/poll`, `/sand/automation-runs/complete`, plus
 * `AutomationsService` and the dashboard's Slack/GitHub account
 * connections. All of it is now at the root of the API host, so the
 * listener paths are on by default and the app is unchanged. What still
 * waits on the founder: registering Simeon's Slack app and GitHub App and
 * setting their keys on Render (the install page and the log name the
 * missing key); Microsoft Teams has no bot and stays Coming Soon.
 *
 * `SAND_LISTENER_RELAY_SERVED=0` in the box's environment restores the
 * earlier Coming Soon paths: the update_state tool refuses a listener
 * trigger with the sentence below, the agent's brief offers cron
 * schedules only, the connect URL is null, and the box does not poll.
 */
export const LISTENER_RELAY_SERVED_ENV = "SAND_LISTENER_RELAY_SERVED";

// The sentence of the `=0` path, kept verbatim: tests and the earlier
// records pin it.
export const LISTENERS_COMING_SOON_SENTENCE =
  "Event listeners (Slack, GitHub, Microsoft Teams, Linear, Sentry, PagerDuty) are coming soon on Simeon. For now a routine fires on a cron schedule; use one, bounded to the hours that matter.";

// The founder, 25 September 2026: the Mac can be awake while the app is
// closed, and a routine should still execute. The box stays up on quit when
// a routine is enabled and renews its own model credential
// (electron-main/box/local-docker-host-connector.ts, `stopLocalDockerBoxOnQuit`).
export const ROUTINES_AWAY_COMING_SOON_SENTENCE =
  "A routine fires while this computer is awake, whether Simeon is open or closed; it cannot fire while the computer is asleep or off, and it does not run anywhere else.";

// On by default since 25 September 2026: `polar/sand/listeners.py` serves
// the relay routes at the root of the API host. "0" turns the paths off.
export function isListenerRelayServed(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[LISTENER_RELAY_SERVED_ENV]?.trim();
  return raw === "0" ? false : true;
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
