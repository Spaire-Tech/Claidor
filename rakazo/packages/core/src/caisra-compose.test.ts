import { describe, expect, test } from "vitest";
import {
  ComposeAction,
  ComposeRowKind,
  canCreate,
  composeRows,
  DEFAULT_VOICE_ID,
  MAX_SHORTCUTS,
  rowForShortcut,
  VOICES,
  voiceById,
} from "./caisra-compose.js";

const agents = [
  { id: "yodo", name: "Yodo" },
  { id: "comms", name: "Comms" },
  { id: "expenses", name: "Expenses" },
];

describe("the compose picker", () => {
  test("puts the action above the agents", () => {
    const rows = composeRows({ agents, query: "" });
    expect(rows[0]?.kind).toBe(ComposeRowKind.Action);
    expect(rows[0]?.id).toBe(ComposeAction.NewAgent);
    expect(rows.slice(1).every((row) => row.kind === ComposeRowKind.Agent)).toBe(true);
  });

  test("filters both halves by the same word", () => {
    expect(composeRows({ agents, query: "cre" }).map((row) => row.label)).toEqual([
      "Create new agent",
    ]);
    expect(composeRows({ agents, query: "comm" }).map((row) => row.label)).toEqual(["Comms"]);
  });

  test("numbers after filtering, so ⌘1 is the first row on screen", () => {
    // Not the first row of an unfiltered list nobody can see.
    const rows = composeRows({ agents, query: "comm" });
    expect(rows[0]?.key).toBe("1");
    expect(rowForShortcut(rows, "1")?.id).toBe("comms");
  });

  test("stops handing out shortcuts after the ninth row", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `a${index}`,
      name: `Agent ${index}`,
    }));
    const rows = composeRows({ agents: many, query: "" });
    expect(rows.filter((row) => row.key).length).toBe(MAX_SHORTCUTS);
    expect(rowForShortcut(rows, "9")).toBeDefined();
    expect(rows[MAX_SHORTCUTS]?.key).toBeUndefined();
  });

  test("says nothing rather than lying when a search matches nobody", () => {
    expect(composeRows({ agents, query: "zzz" })).toEqual([]);
  });

  test("offers no group chat, because there is nothing behind it", () => {
    const labels = composeRows({ agents, query: "" }).map((row) => row.label.toLowerCase());
    expect(labels.some((label) => label.includes("group"))).toBe(false);
  });
});

describe("creating", () => {
  test("needs a name and nothing else", () => {
    expect(canCreate("")).toBe(false);
    expect(canCreate("   ")).toBe(false);
    expect(canCreate("Perrin")).toBe(true);
  });
});

describe("the voices", () => {
  test("are the founder's seven, in their order", () => {
    expect(VOICES.map((one) => one.id)).toEqual([
      "concise",
      "balanced",
      "warm",
      "direct",
      "sassy",
      "curious",
      "formal",
    ]);
  });

  test("each carries its own five colours and its own seed", () => {
    // A voice is a picture of its own. The first desktop build drew every
    // voice from the agent's face, so picking a different voice gave you the
    // same blue; the sphere was never the voice's to begin with.
    const seeds = new Set(VOICES.map((one) => one.seed));
    expect(seeds.size).toBe(VOICES.length);
    for (const voice of VOICES) {
      expect(voice.colors, voice.id).toHaveLength(5);
      expect(voice.description, voice.id).toBeTruthy();
    }
    const palettes = new Set(VOICES.map((one) => one.colors.join(",")));
    expect(palettes.size).toBe(VOICES.length);
  });

  test("no voice at all is a real answer", () => {
    // The form starts at "No voice yet" rather than at a default nobody chose.
    expect(voiceById("")).toBeUndefined();
    expect(voiceById(undefined)).toBeUndefined();
    expect(voiceById("nope")).toBeUndefined();
    expect(voiceById(DEFAULT_VOICE_ID)?.name).toBe("Balanced");
  });
});
