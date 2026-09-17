import { describe, expect, it } from "vitest";
import {
  CaisraArtifactKind,
  caisraArtifactCount,
  caisraArtifactKind,
  caisraArtifactTitle,
  hasCards,
  normaliseCardProgram,
  splitCardSegments,
  stripCards,
} from "./caisra-cards.js";

describe("normaliseCardProgram", () => {
  it("corrects the names a model reaches for from the public docs", () => {
    // The founder's first live run came back as a heading and one line: the
    // parser drops the child it cannot resolve and every sibling after it.
    const written = [
      "root = Card([head, body, buttons])",
      'head = CardHeader("Three days in Tokyo", "East side only")',
      'body = ListBlock([one], "icon")',
      'buttons = Buttons([Button("Swap day two")])',
    ].join("\n");
    const { program, corrected } = normaliseCardProgram(written);
    expect(program).toContain('head = Header("Three days in Tokyo"');
    expect(program).toContain("body = List([one]");
    expect(program).toContain("buttons = ButtonGroup([Button");
    expect(corrected).toEqual(["CardHeader", "ListBlock", "Buttons"]);
  });

  it("leaves a name alone unless it is being called", () => {
    const { program, corrected } = normaliseCardProgram(
      'root = Card([a])\na = TextContent("Use CardHeader for the title")',
    );
    expect(program).toContain("Use CardHeader for the title");
    expect(corrected).toEqual([]);
  });

  it("does not touch a longer name that ends with one of ours", () => {
    expect(normaliseCardProgram('x = MyCallout("info", "t", "d")').corrected).toEqual([]);
  });

  it("leaves FollowUpItem and Carousel alone, because renaming would parse and be wrong", () => {
    // Their shapes differ. A card that parses and is wrong is worse than one
    // that fails, because nobody finds it.
    expect(normaliseCardProgram('x = FollowUpItem("Make it vegetarian")').corrected).toEqual([]);
    expect(normaliseCardProgram("x = Carousel([[a]])").corrected).toEqual([]);
  });
});

const PROACTIVE = [
  "Two weeks, built so you cook once and eat twice.",
  "",
  "```openui-lang",
  "root = Card([head])",
  'head = Header("14-Day Meal Plan", "Balanced breakfasts, lunches and dinners")',
  "```",
  "",
  "I have written it up as a document as well, so you have something to send on.",
  "",
  "```openui-lang",
  'root = ReportView("14-Day Meal Plan", "Two weeks of meals", [p1])',
  'p1 = Page("p1", StandardFrontPage("14-Day Meal Plan"))',
  "```",
].join("\n");

describe("splitCardSegments", () => {
  it("walks every fence, so one reply can carry an answer, a line and a document", () => {
    // This is the shape of "offer it before they ask": the card, the plain
    // sentence, the document. Nothing in the code ever forbade it; two rules
    // in the brief did, and both are gone.
    const segments = splitCardSegments(PROACTIVE);
    expect(segments.map((one) => one.kind)).toEqual(["text", "card", "text", "card"]);
    expect(segments[2]).toMatchObject({
      text: "I have written it up as a document as well, so you have something to send on.",
    });
  });

  it("keeps a reply with no fence as one piece of text", () => {
    expect(splitCardSegments("Just a sentence.")).toEqual([
      { kind: "text", text: "Just a sentence." },
    ]);
  });

  it("accepts the bare `openui` fence a model sometimes writes", () => {
    const segments = splitCardSegments("```openui\nroot = Card([])\n```");
    expect(segments).toEqual([{ kind: "card", program: "root = Card([])" }]);
  });

  it("does not treat a fence inside a sentence as one", () => {
    expect(hasCards("Write ```openui-lang``` to open a block.")).toBe(false);
  });

  it("leaves a preview line with the prose and none of the program", () => {
    expect(stripCards(PROACTIVE)).toBe(
      "Two weeks, built so you cook once and eat twice.\n\nI have written it up as a document as well, so you have something to send on.",
    );
  });
});

describe("caisraArtifactKind", () => {
  it("tells a deck, a report and answer cards apart by the root line", () => {
    expect(caisraArtifactKind('root = SlideShow("Q4", "", [s1])')).toBe(
      CaisraArtifactKind.Presentation,
    );
    expect(caisraArtifactKind('root = ReportView("Big Tech", "", [p1])')).toBe(
      CaisraArtifactKind.Report,
    );
    expect(caisraArtifactKind("root = Card([a, b])")).toBeUndefined();
    expect(caisraArtifactKind('a = Header("no root here")')).toBeUndefined();
  });

  it("reads the title and the count for the card in the thread", () => {
    const deck = [
      'root = SlideShow("Q4 Board Update", "September 2026", [s1, s2])',
      's1 = Slide("s1", StandardTitle("Q4"))',
      's2 = Slide("s2", HeroMetric("€1.2M"))',
    ].join("\n");
    expect(caisraArtifactTitle(deck)).toBe("Q4 Board Update");
    expect(caisraArtifactCount(deck, CaisraArtifactKind.Presentation)).toBe(2);
    expect(caisraArtifactCount(deck, CaisraArtifactKind.Report)).toBe(0);
  });

  it("unescapes a quoted title rather than showing the backslashes", () => {
    expect(caisraArtifactTitle('root = ReportView("The \\"big\\" year", "", [])')).toBe(
      'The "big" year',
    );
  });
});
