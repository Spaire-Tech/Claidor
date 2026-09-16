import { createLibrary, createParser, defineComponent } from '@openuidev/lang-core';
import { presentationLibrary, reportLibrary } from '@openuidev/thesys';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';

import { build, render } from '../../../scripts/generate-artifact-prompts.mjs';
import * as generated from './prompts.generated';

/** A board deck and a memo the way the brief asks for them, checked against OpenUI's own libraries. */
export const DECK = `root = SlideShow("Q4 Board Update", "Spaire, September 2026", [s1, s2, s3, s4, s5])
s1 = Slide("s1", StandardTitle("Q4 Board Update", "Where we are, and what we ask of you", "September 2026"))
s2 = Slide("s2", HeroMetric("€1.2M", "Annual recurring revenue, up 38% on the quarter"))
s3 = Slide("s3", KeyInfoWithTitle("Three things that moved", [{title: "Pipeline", description: "42 qualified conversations, 11 in contract"}, {title: "Churn", description: "Two logos lost, both under €5k"}, {title: "Hiring", description: "Two engineers start in October"}]))
s4 = Slide("s4", SectionBreakClassic("What we ask"))
s5 = Slide("s5", NumberedKeyPoint([{title: "Approve the Series A timeline", body: "Open the round in January"}, {title: "Confirm the hiring plan", body: "Six roles by March"}]))
`;

export const MEMO = `root = ReportView("OHADA arbitration clauses", "A note for the deal team", [p1, p2])
p1 = Page("p1", MinimalFrontPage("OHADA arbitration clauses", TextContent("What a seat in Abidjan changes, and what it does not."), "A note for the deal team"))
p2 = Page("p2", ContentPage([h, t, k]))
h = Headline("The short answer", "Three points the clause must settle")
t = TextContent("The CCJA administers the arbitration; the seat fixes the courts that supervise it; the law of the contract stays what the parties chose.")
k = KeyMetrics("row", [{title: "Seat", text: "Abidjan"}, {title: "Rules", text: "CCJA 2017"}, {title: "Language", text: "French"}])
`;

/**
 * The viewers' libraries, as the package builds them internally: the same
 * components with the viewer's root in place of the exported one.
 */
const viewer = (library: typeof presentationLibrary, dropRoot: string, root: ReturnType<typeof defineComponent>) => createLibrary({
  root: root.name,
  components: [root, ...Object.values(library.components).filter(one => one.name !== dropRoot)],
});
const SLIDE_SHOW = defineComponent({
  name: 'SlideShow', description: 'The deck.', component: null,
  props: z.object({ title: z.string(), subtitle: z.string().optional(), slides: z.array(presentationLibrary.components.Slide.ref).min(1) }),
});
const REPORT_VIEW = defineComponent({
  name: 'ReportView', description: 'The report.', component: null,
  props: z.object({ title: z.string(), subtitle: z.string().optional(), pages: z.array(reportLibrary.components.Page.ref).min(1) }),
});

describe('the generated artifact prompts', () => {
  test('match what the installed package generates', () => {
    // Regenerate and compare: the file cannot drift from the package.
    expect(render(build())).toBe(render({
      version: generated.ARTIFACT_LIBRARY_VERSION,
      presentation: generated.PRESENTATION_SIGNATURES,
      report: generated.REPORT_SIGNATURES,
    }));
    expect(generated.PRESENTATION_SIGNATURES).toContain('SlideShow(title: string');
    expect(generated.PRESENTATION_SIGNATURES).not.toContain('Presentation(metadata:');
    expect(generated.REPORT_SIGNATURES).toContain('ReportView(title: string');
  });

  test('the deck parses clean against the presentation library', () => {
    const result = createParser(viewer(presentationLibrary, 'Presentation', SLIDE_SHOW).toJSONSchema()).parse(DECK);
    expect(result.meta.errors).toEqual([]);
    expect(result.meta.unresolved).toEqual([]);
    expect(result.root?.typeName).toBe('SlideShow');
  });

  test('the memo parses clean against the report library', () => {
    const result = createParser(viewer(reportLibrary, 'Report', REPORT_VIEW).toJSONSchema()).parse(MEMO);
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.typeName).toBe('ReportView');
  });
});
