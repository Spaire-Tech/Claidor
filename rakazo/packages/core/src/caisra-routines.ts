import type { Routine } from "@rakazo/contracts";
import { formatCron } from "./cron.js";

/**
 * What Caisra's routines screen says, from what a routine is.
 *
 * A routine on this backend is not "a cron". It carries **several** schedules
 * plus three inbound triggers — a webhook, a Git event, and one message
 * provider — and any one of them can fire it. The screen has to say that in a
 * line, and the rule for when a routine is savable is not a display detail: the
 * backend rejects a routine with no trigger at all
 * (`routines.update`'s refinement, `packages/contracts/src/rpc.ts`), and the
 * sentence below is the one it rejects with.
 *
 * This lives in core rather than in the screen for the same reason the thread's
 * mapping does: it is product wording with a test on it, and the same wording
 * has to hold on web, on desktop and on mobile.
 */

/** The backend's own words when a routine has nothing to fire it. */
export const CAISRA_NO_TRIGGER = "Add a schedule, webhook, GitHub, or message trigger";

/** Everything that can start a routine, as the screen offers it. */
export type CaisraRoutineTriggers = Pick<
  Routine,
  "crons" | "webhookEnabled" | "githubEnabled" | "messageProvider"
>;

/** True when at least one thing can fire this routine. */
export function caisraRoutineCanFire(triggers: CaisraRoutineTriggers): boolean {
  return (
    triggers.crons.length > 0 ||
    triggers.webhookEnabled ||
    triggers.githubEnabled ||
    triggers.messageProvider !== null
  );
}

/**
 * One line under the routine's name.
 *
 * Paused comes first and alone: a paused routine's triggers are true and
 * irrelevant, and listing them reads as though it were about to run.
 */
export function caisraRoutineSummary(routine: Routine): string {
  if (!routine.active) return "Paused";
  const parts: string[] = [];
  for (const cron of routine.crons) parts.push(formatCron(cron));
  if (routine.webhookEnabled) parts.push("When a webhook fires");
  if (routine.githubEnabled) parts.push("On a Git event");
  if (routine.messageProvider)
    parts.push(`${messageProviderLabel(routine.messageProvider)} message`);
  return parts.length > 0 ? parts.join(" · ") : "No trigger yet";
}

function messageProviderLabel(provider: string): string {
  if (provider === "slack") return "Slack";
  if (provider === "teams") return "Teams";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** A trigger the person can add, and — when they cannot — why not. */
export type CaisraTriggerOption = {
  id: string;
  label: string;
  /** False when the row is shown but cannot be picked. */
  available: boolean;
  /** Present only when `available` is false. Shown on the row, never hidden. */
  why?: string;
};

/**
 * The Add-trigger menu.
 *
 * Unavailable triggers stay on the menu with the reason beside them. Removing
 * them would be tidier and would leave the person guessing why Caisra can
 * watch a webhook but not a Teams message; a greyed row that says "not
 * connected" answers the question where it is asked.
 */
export function caisraTriggerMenu(
  triggers: CaisraRoutineTriggers,
  options: { slackAvailable: boolean },
): CaisraTriggerOption[] {
  return [
    { id: "schedule", label: "On a schedule", available: true },
    {
      id: "slack",
      label: "Slack message",
      available: options.slackAvailable && triggers.messageProvider !== "slack",
      ...(options.slackAvailable
        ? triggers.messageProvider === "slack"
          ? { why: "Already on" }
          : {}
        : { why: "Slack is not connected" }),
    },
    { id: "teams", label: "Teams message", available: false, why: "Teams is not connected" },
    { id: "linear", label: "Linear issue", available: false, why: "Not yet" },
    { id: "sentry", label: "Sentry alert", available: false, why: "Not yet" },
    { id: "pagerduty", label: "PagerDuty incident", available: false, why: "Not yet" },
    {
      id: "github",
      label: "Git event",
      available: !triggers.githubEnabled,
      ...(triggers.githubEnabled ? { why: "Already on" } : {}),
    },
    {
      id: "webhook",
      label: "Webhook",
      available: !triggers.webhookEnabled,
      ...(triggers.webhookEnabled ? { why: "Already on" } : {}),
    },
  ];
}
