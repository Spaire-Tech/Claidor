import { describe, expect, test } from "vitest";
import type { SettingsInput } from "./caisra-settings.js";
import {
  EXEC_POLICY_OPTIONS,
  ExecPolicy,
  execPolicyLabel,
  SETTINGS_TABS,
  SettingsRowKind,
  SettingsTab,
  settingsFor,
  tabForRow,
  usageLine,
} from "./caisra-settings.js";

const input = (over: Partial<SettingsInput> = {}): SettingsInput => ({
  accountName: "Bass Fall",
  accountEmail: "bass@example.com",
  computerName: "Bass’s MacBook Pro",
  execPolicy: ExecPolicy.Ask,
  memoryEnabled: true,
  ...over,
});

const rowsOf = (tab: SettingsTab, over: Partial<SettingsInput> = {}) =>
  settingsFor(tab, input(over)).flatMap((group) => group.rows);

describe("the tabs", () => {
  test("are the canvas's four, in its order", () => {
    expect(SETTINGS_TABS).toEqual(["General", "Computer", "Usage & Billing", "Updates"]);
  });

  test("every tab has something on it", () => {
    // A tab that opens onto nothing is worse than no tab. If a future change
    // empties one, this is where it shows up.
    for (const tab of SETTINGS_TABS) {
      expect(settingsFor(tab, input()).length, tab).toBeGreaterThan(0);
    }
  });

  test("an empty group never reaches the screen", () => {
    for (const group of settingsFor(SettingsTab.Usage, input())) {
      expect(group.rows.length, group.title).toBeGreaterThan(0);
    }
  });

  test("the usage meter is there only once the server has answered", () => {
    expect(rowsOf(SettingsTab.Usage).some((one) => one.id === "usage")).toBe(false);
    const row = rowsOf(SettingsTab.Usage, {
      usage: { fraction: 0.74, value: "74%", desc: "Ends in 6 days" },
    }).find((one) => one.id === "usage");
    if (row?.kind !== SettingsRowKind.Meter) throw new Error("not a meter");
    expect(row.fraction).toBeCloseTo(0.74);
    expect(row.value).toBe("74%");
  });

  test("and with no figure the tab says so rather than showing nothing", () => {
    const row = rowsOf(SettingsTab.Usage).find((one) => one.id === "refresh-usage");
    expect(row?.desc).toContain("has not come back");
  });
});

describe("the Computer tab", () => {
  test("offers the three answers, and asking is one of them", () => {
    const row = rowsOf(SettingsTab.Computer).find((one) => one.id === "exec-policy");
    expect(row?.kind).toBe(SettingsRowKind.Select);
    expect(EXEC_POLICY_OPTIONS.map((one) => one.value)).toEqual([
      ExecPolicy.Ask,
      ExecPolicy.Auto,
      ExecPolicy.Allow,
    ]);
  });

  test("every option says what happens, not what it is called", () => {
    for (const option of EXEC_POLICY_OPTIONS) {
      expect(option.hint, option.value).toBeTruthy();
    }
    expect(execPolicyLabel(ExecPolicy.Auto)).toBe("Check, then ask");
  });

  test("the working folder is offered only when there is one", () => {
    expect(rowsOf(SettingsTab.Computer).some((one) => one.id === "working-directory")).toBe(false);
    expect(
      rowsOf(SettingsTab.Computer, { workingDirectory: "~/Work" }).some(
        (one) => one.id === "working-directory",
      ),
    ).toBe(true);
  });
});

describe("what is deliberately absent", () => {
  test("no row anywhere asks for a key or an allowance", () => {
    // The founder: "my users should never put a key. everything happens under
    // the hood. not a setting." There was a Models group for a day; this is
    // what keeps it from coming back by accident.
    const everything = SETTINGS_TABS.flatMap((tab) => rowsOf(tab));
    const words = everything.map((row) => `${row.id} ${row.label} ${row.desc ?? ""}`.toLowerCase());
    for (const line of words) {
      expect(line).not.toContain("api key");
      expect(line).not.toContain("allowance");
    }
    expect(everything.some((row) => row.id.includes("model"))).toBe(false);
  });
});

describe("a deep link finds its row", () => {
  test("on whichever tab the row happens to live", () => {
    expect(tabForRow("memory", input())).toBe(SettingsTab.General);
    expect(tabForRow("exec-policy", input())).toBe(SettingsTab.Computer);
    expect(tabForRow("version", input())).toBe(SettingsTab.Updates);
  });

  test("and says nothing for a row that does not exist", () => {
    expect(tabForRow("nope", input())).toBeUndefined();
  });
});

describe("the usage line", () => {
  test("says nothing at all before the server has answered", () => {
    // Not zero percent. Zero percent is a claim; this is not knowing.
    expect(usageLine(undefined)).toEqual({ title: "Usage", value: "", spent: false });
    expect(usageLine({ creditsLimit: 0, creditsUsed: 0 }).fraction).toBeUndefined();
  });

  test("never rounds up to 100% while something is left", () => {
    const nearly = usageLine({ creditsLimit: 1000, creditsUsed: 999 });
    expect(nearly.value).toBe("99%");
    expect(nearly.spent).toBe(false);
  });

  test("and says it plainly once it is gone", () => {
    const gone = usageLine({ creditsLimit: 1000, creditsUsed: 1000 });
    expect(gone.value).toBe("All used");
    expect(gone.spent).toBe(true);
    expect(gone.fraction).toBe(1);
  });

  test("takes the plan's name when the server gave one", () => {
    expect(usageLine({ planName: "Team", creditsLimit: 10, creditsUsed: 5 }).title).toBe("Team");
  });
});
