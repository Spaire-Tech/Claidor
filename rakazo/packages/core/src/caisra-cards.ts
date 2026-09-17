/**
 * The answer cards and the artifacts: one language, two roots, one fence.
 *
 * Moved across from `desktop/src/shared/cards/` and `shared/artifacts/`, which
 * is where this was worked out in front of the founder over two days. The
 * renderer alone is not the feature; everything that makes a card arrive
 * whole and in the right place is here.
 *
 * An agent writes one fenced `openui-lang` block in its reply. The text on
 * either side stays text. What the block is depends on its first `root =`
 * line: `SlideShow` is a deck, `ReportView` is a report, and anything else is
 * answer cards. That split is why a reply can carry a card, a plain line and
 * a document in that order, which is what "offer it before they ask" needs.
 */

export const CARD_FENCE = "openui-lang";

/* ------------------------------------------------------------------ *
 * The near-miss component names
 * ------------------------------------------------------------------ */

/**
 * **Why this exists.** The founder, 18 September, on the first live run: *"the
 * openui was produced. just without cards nor pictures."* The block was
 * emitted and came out as a heading and one line.
 *
 * A broken statement does not fail loudly: the parser drops the child it
 * cannot resolve *and every sibling after it*, and renders what is left. So
 * one bad name in the middle of a twelve-part answer deletes everything after
 * it and says nothing.
 *
 * **Why the names are wrong.** OpenUI ships two chat libraries.
 * `openuiChatLibrary` in `@openuidev/react-ui` is the one in their public
 * docs, their examples and their scaffold, so it is the one a model has read.
 * We render with `chatLibrary` from `@openuidev/thesys`, a superset that names
 * several of the same things differently. A model reaching for what it knows
 * writes `CardHeader` where we want `Header`, and the rest of the card goes
 * with it. Reproduced at the time: the founder's Tokyo itinerary, written the
 * way a model writes it, survived as `['TextContent']`. With the six names
 * corrected it survived whole.
 *
 * **Why renaming is safe here and not in general.** Only pairs whose arguments
 * are in the same order are listed, checked against both specs.
 * `FollowUpItem` and `Carousel` are deliberately absent: their shapes differ,
 * and a rename that parses and is wrong is worse than one that fails.
 *
 * This is a floor, not a plan. The brief names the right components; this
 * catches the model reaching past it, and says so in the log when it does.
 */
export const CARD_COMPONENT_ALIASES: Readonly<Record<string, string>> = {
  CardHeader: "Header",
  Callout: "CalloutV2",
  TextCallout: "CalloutV2",
  ListBlock: "List",
  Buttons: "ButtonGroup",
  SectionItem: "SectionBlockItem",
};

/**
 * A component call is a name followed by `(`. Anchored so `MyCallout(` and
 * `xCardHeader(` are left alone, and a name inside a string is not touched
 * unless it is being called, which openui-lang does not do.
 */
const CALL = new RegExp(
  `(^|[^A-Za-z0-9_])(${Object.keys(CARD_COMPONENT_ALIASES).join("|")})\\s*\\(`,
  "g",
);

/** The program with the aliases corrected, and which ones were found. */
export function normaliseCardProgram(program: string): {
  program: string;
  corrected: readonly string[];
} {
  const corrected = new Set<string>();
  const out = program.replace(CALL, (_all, before: string, name: string) => {
    corrected.add(name);
    return `${before}${CARD_COMPONENT_ALIASES[name]}(`;
  });
  return { program: out, corrected: [...corrected] };
}

/* ------------------------------------------------------------------ *
 * Finding the blocks in a reply
 * ------------------------------------------------------------------ */

export type CaisraCardSegment = { kind: "text"; text: string } | { kind: "card"; program: string };

/**
 * A fence line with the card language, or the bare `openui` the model
 * sometimes writes, closed by the next fence line. Anchored to line starts so
 * a fence inside a sentence is not one.
 */
const CARD_BLOCK = new RegExp(
  `^[ \\t]*\`\`\`[ \\t]*(?:${CARD_FENCE}|openui)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\`\`\`[ \\t]*$`,
  "gim",
);

/**
 * The reply in order: text, card, text, card. Empty text between fences is
 * dropped.
 *
 * Walking *every* fence rather than the first is what lets one reply carry an
 * answer, a plain line and a document. Two rules used to forbid that ("one
 * block per reply at most", "no cards in the same reply as an artifact") and
 * both are gone; the code never had the restriction.
 */
export function splitCardSegments(content: string): CaisraCardSegment[] {
  const out: CaisraCardSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(CARD_BLOCK)) {
    const before = content.slice(last, match.index).trim();
    if (before) out.push({ kind: "text", text: before });
    const program = (match[1] ?? "").trim();
    if (program) out.push({ kind: "card", program });
    last = match.index + match[0].length;
  }
  const after = content.slice(last).trim();
  if (after) out.push({ kind: "text", text: after });
  return out;
}

/** The reply without its blocks, for a preview line in the conversation list. */
export function stripCards(content: string): string {
  return splitCardSegments(content)
    .filter((one): one is Extract<CaisraCardSegment, { kind: "text" }> => one.kind === "text")
    .map((one) => one.text)
    .join("\n\n");
}

/** Whether a reply carries a block at all. */
export function hasCards(content: string): boolean {
  return splitCardSegments(content).some((one) => one.kind === "card");
}

/* ------------------------------------------------------------------ *
 * Which of the two a block is
 * ------------------------------------------------------------------ */

export const CaisraArtifactKind = {
  Presentation: "presentation",
  Report: "report",
} as const;
export type CaisraArtifactKind = (typeof CaisraArtifactKind)[keyof typeof CaisraArtifactKind];

/**
 * The root component of each artifact's program: the one OpenUI's viewers
 * parse, which is the shape their cloud emits. Their exported libraries name a
 * different root that the viewers do not read.
 */
export const CAISRA_ARTIFACT_ROOTS: Readonly<Record<CaisraArtifactKind, string>> = {
  [CaisraArtifactKind.Presentation]: "SlideShow",
  [CaisraArtifactKind.Report]: "ReportView",
};

const ROOT_LINE = /^\s*root\s*=\s*([A-Za-z][A-Za-z0-9]*)\s*\(/m;

/** The root component a program names, or undefined when it names none. */
export function rootComponentOf(program: string): string | undefined {
  return ROOT_LINE.exec(program)?.[1];
}

/** Which artifact a program is, or undefined when it is answer cards. */
export function caisraArtifactKind(program: string): CaisraArtifactKind | undefined {
  const root = rootComponentOf(program);
  if (!root) return undefined;
  for (const kind of Object.values(CaisraArtifactKind)) {
    if (CAISRA_ARTIFACT_ROOTS[kind] === root) return kind;
  }
  return undefined;
}

/**
 * The title a deck or a report carries: the first argument of its root line,
 * for the card in the thread. The same reading OpenUI's own chip does.
 */
export function caisraArtifactTitle(program: string): string | undefined {
  const match = /^\s*root\s*=\s*(?:SlideShow|ReportView)\s*\(\s*"((?:[^"\\]|\\.)*)"/m.exec(program);
  return match?.[1]?.replace(/\\(.)/g, "$1");
}

/** How many slides or pages a program declares, for the line under the name. */
export function caisraArtifactCount(program: string, kind: CaisraArtifactKind): number {
  const unit = kind === CaisraArtifactKind.Presentation ? "Slide" : "Page";
  const pattern = new RegExp(`^\\s*[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*${unit}\\s*\\(`, "gm");
  return (program.match(pattern) ?? []).length;
}
