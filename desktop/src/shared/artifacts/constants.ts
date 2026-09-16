/**
 * The artifacts: a slide deck or a report, standing on their own.
 *
 * **Why this exists.** The founder, 17 September: *"for the artifacts,
 * openui is golden - i meant the docs, excel, slides etc... i want my
 * artifacts to look exactly like open ui's. i want a complete replica
 * here for the design."* OpenUI's own artifact components (`Presentation`
 * and `Report`, from `@openuidev/thesys`, MIT) are used whole, with their
 * libraries and their stylesheet, so the replica is exact by
 * construction. What is ours is how one reaches the thread: the agent
 * writes the deck or the report as one fenced `openui-lang` block whose
 * root is `Presentation(...)` or `Report(...)`, and the app draws it as
 * OpenUI's chip, which opens OpenUI's full-screen deck or report.
 *
 * **What is not here.** OpenUI has no spreadsheet artifact: nothing in
 * their libraries is an Excel or a workbook. A report can carry a table
 * and charts. A real `.xlsx` is a file the agent writes with its file
 * tools, which is a different thing and already a card in the thread.
 *
 * The answer cards (`shared/cards/`) and the artifacts share the fence
 * and the language; what separates them is the root component, which is
 * why `artifactKindOf` reads only the first `root =` line.
 */

export const ArtifactKind = {
  Presentation: 'presentation',
  Report: 'report',
} as const;
export type ArtifactKind = typeof ArtifactKind[keyof typeof ArtifactKind];

/**
 * The root component of each artifact's program: the one OpenUI's viewers
 * parse (`SlideShow(title, subtitle?, slides)`, `ReportView(title,
 * subtitle?, pages)`), which is the shape their cloud emits. Their
 * exported libraries name a different root (`Presentation(metadata, …)`)
 * that the viewers do not read; the prompt is rewritten to these
 * (`scripts/generate-artifact-prompts.mjs`).
 */
export const ARTIFACT_ROOTS: Readonly<Record<ArtifactKind, string>> = {
  [ArtifactKind.Presentation]: 'SlideShow',
  [ArtifactKind.Report]: 'ReportView',
};

const ROOT_LINE = /^\s*root\s*=\s*([A-Za-z][A-Za-z0-9]*)\s*\(/m;

/** The root component named by a program, or undefined when there is none. */
export function rootComponentOf(program: string): string | undefined {
  return ROOT_LINE.exec(program)?.[1];
}

/** Which artifact a program is, or undefined when it is answer cards. */
export function artifactKindOf(program: string): ArtifactKind | undefined {
  const root = rootComponentOf(program);
  if (!root) return undefined;
  for (const kind of Object.values(ArtifactKind)) {
    if (ARTIFACT_ROOTS[kind] === root) return kind;
  }
  return undefined;
}

/**
 * The title a deck or a report carries, the first argument of its root
 * line, for the sidebar preview: `root = SlideShow("Q4 Board Update", …`.
 * The same reading OpenUI's chip does.
 */
export function artifactTitleOf(program: string): string | undefined {
  const match = /^\s*root\s*=\s*(?:SlideShow|ReportView)\s*\(\s*"((?:[^"\\]|\\.)*)"/m.exec(program);
  return match ? match[1].replace(/\\(.)/g, '$1') : undefined;
}
