import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCK_WIDTH,
  FRAME_GAP,
  FRAME_PAD_X,
  FRAME_PAD_Y,
  RAIL_WIDTH,
  SIDEBAR_WIDTH,
  WINDOW_MAX_HEIGHT,
  WINDOW_MAX_WIDTH,
} from "@rakazo/core";
import { describe, expect, test } from "vitest";

/**
 * The design is held against its source, by a machine.
 *
 * **Why this file exists.** Every fault in this app's look was found by the
 * founder opening a screenshot: a window radius of 18 where the canvas says 40,
 * a conversation pane with no inset, a sidebar search drawn as an icon where
 * the design has a field. Each time the answer was the same — I had not read
 * the file, I had written from memory of a picture — and each time the cost of
 * finding it landed on them.
 *
 * So this reads the founder's own `tokens.ts` and holds every value in
 * `tokens.css` against it. Their tree does the same thing internally
 * (`design/tokens.test.ts` keeps `tokens.ts` and `tokens.css` in agreement);
 * this is that idea carried across into the fork, where the two halves are now
 * in different repositories and nothing else connects them.
 *
 * `desktop/` is frozen, which makes it a good source of truth: it cannot move
 * under us. If it is ever removed, this test says so plainly rather than
 * passing on an empty read.
 *
 * What it cannot check is layout, spacing and shape — those live in JSX in
 * their tree and CSS in ours, and comparing them would mean comparing two
 * languages. Those still need reading. This covers the half that is mechanical,
 * which is the half that drifted silently.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DESIGN = join(HERE, "../../../../desktop/src/renderer/design/tokens.ts");
const OURS = join(HERE, "tokens.css");

/** `{ ink: '#0d0d0d', … }` out of `export const <name> = { … } as const;`. */
function group(source: string, name: string): Map<string, string> {
  const block = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(source);
  if (!block) throw new Error(`the design has no \`${name}\` group any more`);
  const found = new Map<string, string>();
  for (const line of block[1].split("\n")) {
    // `key: value,` with the value either quoted or a bare number. Comment
    // lines and blank lines fall through.
    const pair = /^\s{2}([A-Za-z][A-Za-z0-9]*): (?:'([^']*)'|([-\d.]+)),/.exec(line);
    if (pair) found.set(pair[1], pair[2] ?? pair[3]);
  }
  return found;
}

/** `--ink: #0d0d0d;` out of our stylesheet. */
function customProperties(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    found.set(match[1], match[2].replace(/\s+/g, " ").trim());
  }
  return found;
}

/**
 * The two spellings of the same value, made comparable.
 *
 * The design writes CSS the way a person types it — `rgba(0,0,0,.08)`, `999`,
 * `-.01em` — and our stylesheet is formatted by Biome, which writes
 * `rgba(0, 0, 0, 0.08)`, `999px` and `-0.01em`. None of that is a difference in
 * the design, so none of it should fail here; anything left over is.
 */
function normalise(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      // A bare `.08` and a written-out `0.08` are one number.
      .replace(/(^|[^0-9a-z])\.(\d)/g, "$10.$2")
      // `999` in TypeScript is `999px` in CSS.
      .replace(/(\d)px/g, "$1")
      .replace(/;$/, "")
  );
}

/**
 * Which group in the design a custom property comes from, by its prefix, and
 * what the key is called there. `--accent-hover` is `color.accentHover`;
 * `--shadow-dock-active` is `shadow.dockActive`.
 */
const PREFIXES: readonly { prefix: string; group: string }[] = [
  { prefix: "line-", group: "line" },
  { prefix: "shadow-", group: "shadow" },
  { prefix: "glass-", group: "glass" },
  { prefix: "text-", group: "text" },
  { prefix: "track-", group: "tracking" },
  { prefix: "radius-", group: "radius" },
  // Anything with no prefix of its own is a colour.
  { prefix: "", group: "color" },
];

/**
 * Properties that are ours rather than the design's, and why.
 *
 * The frame and the widths come from `layout.ts`, not `tokens.ts`, and are
 * checked against `@rakazo/core` further down. The faces are a stack rather
 * than a token. Nothing else belongs here: this list is the only way a value
 * escapes the check, so adding to it is a decision, not a convenience.
 */
const NOT_FROM_TOKENS = new Set([
  "--frame-pad-x",
  "--frame-pad-y",
  "--frame-gap",
  "--window-max-w",
  "--window-max-h",
  "--sidebar-w",
  "--rail-w",
  "--font-ui",
  "--font-mono",
]);

const design = readFileSync(DESIGN, "utf8");
const ours = customProperties(readFileSync(OURS, "utf8"));
const groups = new Map(
  ["color", "line", "shadow", "glass", "text", "tracking", "radius"].map((name) => [
    name,
    group(design, name),
  ]),
);

/** `accent-hover` → `accentHover`. */
const camel = (kebab: string) => kebab.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/** Where a custom property should be found in the design, or nothing. */
function sourceOf(property: string): { group: string; key: string } | undefined {
  const bare = property.slice(2);
  for (const { prefix, group: name } of PREFIXES) {
    if (!bare.startsWith(prefix)) continue;
    const key = camel(bare.slice(prefix.length));
    if (groups.get(name)?.has(key)) return { group: name, key };
  }
  return undefined;
}

describe("the design is the founder's, and this is how we know", () => {
  test("the design file is there and has something in it", () => {
    // A frozen tree can still be deleted. An empty read would make every
    // assertion below pass on nothing, which is worse than failing.
    expect(design.length).toBeGreaterThan(4000);
    expect(groups.get("color")?.get("accent")).toBe("#0071e3");
    expect(ours.size).toBeGreaterThan(40);
  });

  test("every token we define says what the design says", () => {
    const wrong: string[] = [];
    for (const [property, value] of ours) {
      if (NOT_FROM_TOKENS.has(property)) continue;
      const source = sourceOf(property);
      if (!source) {
        wrong.push(`${property} is in no group of the design`);
        continue;
      }
      const theirs = groups.get(source.group)?.get(source.key) as string;
      if (normalise(theirs) !== normalise(value)) {
        wrong.push(`${property} is ${value}, and ${source.group}.${source.key} is ${theirs}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("the shapes that decide how the app reads are the canvas's", () => {
    // Named one by one because these are the ones that were wrong on screen
    // and nobody but the founder noticed. A regression here is the regression.
    expect(normalise(ours.get("--radius-window") as string)).toBe("40");
    expect(normalise(ours.get("--radius-pane") as string)).toBe("28");
    expect(normalise(ours.get("--radius-row") as string)).toBe("16");
    expect(normalise(ours.get("--radius-bubble") as string)).toBe("17");
    expect(normalise(ours.get("--text-sidebar-title") as string)).toBe("18");
  });

  test("the frame is the one layout.ts counted out of the canvas", () => {
    const px = (property: string) => Number(normalise(ours.get(property) as string));
    expect(px("--frame-pad-x")).toBe(FRAME_PAD_X);
    expect(px("--frame-pad-y")).toBe(FRAME_PAD_Y);
    expect(px("--frame-gap")).toBe(FRAME_GAP);
    expect(px("--window-max-w")).toBe(WINDOW_MAX_WIDTH);
    expect(px("--window-max-h")).toBe(WINDOW_MAX_HEIGHT);
    expect(px("--sidebar-w")).toBe(SIDEBAR_WIDTH);
    expect(px("--rail-w")).toBe(RAIL_WIDTH);
  });

  test("the dock is 52px buttons in 11px of padding, which is what 74 means", () => {
    expect(DOCK_WIDTH).toBe(52 + 11 * 2);
    const dock = readFileSync(join(HERE, "dock.css"), "utf8");
    expect(dock).toContain(`width: ${DOCK_WIDTH}px`);
    expect(dock).toContain("width: 52px");
    expect(dock).toContain("padding: 11px");
  });
});
