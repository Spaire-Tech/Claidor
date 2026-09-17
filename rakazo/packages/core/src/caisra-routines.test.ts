import type { Routine } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  CAISRA_NO_TRIGGER,
  caisraRoutineCanFire,
  caisraRoutineSummary,
  caisraTriggerMenu,
} from "./caisra-routines.js";

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "rt_1",
    botId: "bot_1",
    name: "Morning brief",
    prompt: "Summarise overnight email",
    crons: [],
    timezone: "Europe/Lisbon",
    active: true,
    notify: true,
    webhookEnabled: false,
    githubEnabled: false,
    messageProvider: null,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

describe("caisraRoutineSummary", () => {
  it("lists every schedule, because a routine can carry several", () => {
    expect(caisraRoutineSummary(routine({ crons: ["0 9 * * *", "0 17 * * 1-5"] }))).toBe(
      "Every day at 9:00 AM · Weekdays at 5:00 PM",
    );
  });

  it("names a one-shot as a one-time run rather than as cron", () => {
    expect(caisraRoutineSummary(routine({ crons: ["@once"] }))).toBe("One-time");
  });

  it("puts the inbound triggers after the schedules", () => {
    const summary = caisraRoutineSummary(
      routine({
        crons: ["0 * * * *"],
        webhookEnabled: true,
        githubEnabled: true,
        messageProvider: "slack",
      }),
    );
    expect(summary).toBe("Every hour · When a webhook fires · On a Git event · Slack message");
  });

  it("says paused and nothing else, so a paused routine never reads as armed", () => {
    expect(caisraRoutineSummary(routine({ active: false, crons: ["0 9 * * *"] }))).toBe("Paused");
  });

  it("says so plainly when nothing can fire it", () => {
    expect(caisraRoutineSummary(routine())).toBe("No trigger yet");
  });
});

describe("caisraRoutineCanFire", () => {
  it("is false only when every trigger is off — the backend's own rule", () => {
    expect(caisraRoutineCanFire(routine())).toBe(false);
    expect(caisraRoutineCanFire(routine({ crons: ["0 9 * * *"] }))).toBe(true);
    expect(caisraRoutineCanFire(routine({ webhookEnabled: true }))).toBe(true);
    expect(caisraRoutineCanFire(routine({ githubEnabled: true }))).toBe(true);
    expect(caisraRoutineCanFire(routine({ messageProvider: "slack" }))).toBe(true);
  });

  it("carries the sentence the backend rejects with", () => {
    expect(CAISRA_NO_TRIGGER).toBe("Add a schedule, webhook, GitHub, or message trigger");
  });
});

describe("caisraTriggerMenu", () => {
  it("gives every unavailable trigger a reason, never a bare grey row", () => {
    const menu = caisraTriggerMenu(routine(), { slackAvailable: false });
    for (const option of menu) {
      if (!option.available) expect(option.why).toBeTruthy();
      else expect(option.why).toBeUndefined();
    }
  });

  it("opens Slack once Slack is connected", () => {
    const off = caisraTriggerMenu(routine(), { slackAvailable: false });
    const on = caisraTriggerMenu(routine(), { slackAvailable: true });
    expect(off.find((o) => o.id === "slack")).toMatchObject({
      available: false,
      why: "Slack is not connected",
    });
    expect(on.find((o) => o.id === "slack")).toMatchObject({ available: true });
  });

  it("closes a trigger that is already on", () => {
    const menu = caisraTriggerMenu(routine({ webhookEnabled: true, githubEnabled: true }), {
      slackAvailable: true,
    });
    expect(menu.find((o) => o.id === "webhook")).toMatchObject({
      available: false,
      why: "Already on",
    });
    expect(menu.find((o) => o.id === "github")).toMatchObject({
      available: false,
      why: "Already on",
    });
  });
});
