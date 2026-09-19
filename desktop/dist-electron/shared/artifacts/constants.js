"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARTIFACT_ROOTS = exports.ArtifactKind = void 0;
exports.rootComponentOf = rootComponentOf;
exports.artifactKindOf = artifactKindOf;
exports.artifactTitleOf = artifactTitleOf;
exports.artifactCountOf = artifactCountOf;
exports.ArtifactKind = {
    Presentation: 'presentation',
    Report: 'report',
};
/**
 * The root component of each artifact's program: the one OpenUI's viewers
 * parse (`SlideShow(title, subtitle?, slides)`, `ReportView(title,
 * subtitle?, pages)`), which is the shape their cloud emits. Their
 * exported libraries name a different root (`Presentation(metadata, …)`)
 * that the viewers do not read; the prompt is rewritten to these
 * (`scripts/generate-artifact-prompts.mjs`).
 */
exports.ARTIFACT_ROOTS = {
    [exports.ArtifactKind.Presentation]: 'SlideShow',
    [exports.ArtifactKind.Report]: 'ReportView',
};
const ROOT_LINE = /^\s*root\s*=\s*([A-Za-z][A-Za-z0-9]*)\s*\(/m;
/** The root component named by a program, or undefined when there is none. */
function rootComponentOf(program) {
    return ROOT_LINE.exec(program)?.[1];
}
/** Which artifact a program is, or undefined when it is answer cards. */
function artifactKindOf(program) {
    const root = rootComponentOf(program);
    if (!root)
        return undefined;
    for (const kind of Object.values(exports.ArtifactKind)) {
        if (exports.ARTIFACT_ROOTS[kind] === root)
            return kind;
    }
    return undefined;
}
/**
 * The title a deck or a report carries, the first argument of its root
 * line, for the sidebar preview: `root = SlideShow("Q4 Board Update", …`.
 * The same reading OpenUI's chip does.
 */
function artifactTitleOf(program) {
    const match = /^\s*root\s*=\s*(?:SlideShow|ReportView)\s*\(\s*"((?:[^"\\]|\\.)*)"/m.exec(program);
    return match ? match[1].replace(/\\(.)/g, '$1') : undefined;
}
/**
 * How many slides or pages a program declares: its `Slide(` or `Page(`
 * statements, for the line under the name on the card.
 */
function artifactCountOf(program, kind) {
    const unit = kind === exports.ArtifactKind.Presentation ? 'Slide' : 'Page';
    return (program.match(new RegExp(`^\\s*[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*${unit}\\s*\\(`, 'gm')) ?? []).length;
}
//# sourceMappingURL=constants.js.map