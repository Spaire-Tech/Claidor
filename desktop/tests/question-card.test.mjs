/**
 * The question card, as the upstream app's (28 October 2026, its card rules:
 * "dismissOnMoveOn: only for low-stakes questions that become moot if they
 * send a newer message without answering; auto-dismisses then"; "User can
 * dismiss without answering → treat as decline"). A question without the
 * mark stays open until it is answered or dismissed; every open question was
 * closed at the next turn of any kind, a background one included. A dismissed
 * question is told to the agent at once as a decline. Picking sends the
 * option's own reply (`value`), several picked go one per line.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-question-"));
  const entry = path.join(dir, "entry.ts");
  await writeFile(entry, `export * from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/transcript-store.ts"))};\nexport { WidgetResponses } from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/widget-responses.ts"))};\n`);
  const outfile = path.join(dir, "question.mjs");
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const question = (id, widget, extra = {}) => ({ kind: "send-message", id, timestampMs: 1, message: { type: "widget", widget }, ...extra });

test("only a question marked dismissOnMoveOn closes, and only when the person writes; a dismissed one is a decline", async () => {
  const { module, dispose } = await load();
  try {
    const entries = [
      question("live", { prompt: "Which account?", options: [{ label: "Work" }, { label: "Home" }] }),
      question("moot", { prompt: "Want a summary too?", options: [{ label: "Yes" }], dismissOnMoveOn: true }),
      question("gone", { prompt: "Delete the old ones?", options: [{ label: "Delete", style: "danger" }] }, { widgetDismissed: true }),
    ];
    const updates = [];
    const session = { id: "iris", db: { getTranscriptEntries: () => entries, updateTranscriptEntry: (id, update) => { const at = entries.findIndex((one) => one.id === id); entries[at] = update(entries[at]); updates.push(id); } } };
    const widgets = new module.WidgetResponses({ sessions: { activeSession: { id: "someone-else" } }, roster: { emit() {} } });

    // A background turn closes nothing that is still open.
    const background = widgets.collectUnansweredQuestionPrompts(session);
    assert.deepEqual(background.skippedQuestionPrompts, []);
    assert.deepEqual(background.dismissedQuestionPrompts, ["Delete the old ones? — Delete"]);
    assert.deepEqual(updates, ["gone"]);
    assert.equal(entries[0].widgetSkipped, undefined, "the live question stays open");
    assert.equal(entries[1].widgetSkipped, undefined, "the moot one waits for the person to write");

    // The person writes: the moot one closes, the live one stays.
    const written = widgets.collectUnansweredQuestionPrompts(session, { movedOn: true });
    assert.deepEqual(written.skippedQuestionPrompts, ["Want a summary too? — Yes"]);
    assert.equal(entries[1].widgetSkipped, true);
    assert.equal(entries[0].widgetSkipped, undefined);
  } finally {
    await dispose();
  }
});

test("dismissing a question tells the agent at once that it was declined, and it may end without a word", async () => {
  const { module, dispose } = await load();
  try {
    module.setTranscript([question("q1", { prompt: "Which account?", options: [{ label: "Work" }] })]);
    const wakes = [];
    const widgets = new module.WidgetResponses({
      sessions: { activeSession: { id: "iris", db: { updateTranscriptEntry() {} } }, ensureActionTarget: async () => {} },
      roster: { emit() {} },
      backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt, title, options) => { wakes.push({ agentId, source, prompt, options }); } },
    });
    assert.deepEqual(await widgets.dismissWidget({ entryId: "q1", agentId: "iris" }), { accepted: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0].source, "question-dismissed");
    assert.match(wakes[0].prompt, /dismissed your question "Which account\?" without answering\. Take it as declined and don't ask it again/);
    assert.deepEqual(wakes[0].options, { isSilenceAllowed: true });
    assert.deepEqual(await widgets.dismissWidget({ entryId: "q1", agentId: "iris" }), { accepted: false }, "once");
    assert.equal(wakes.length, 1);
  } finally {
    await dispose();
  }
});

test("the agent is told declines in plain words; the person writing closes moot questions; the schema takes multiSelect", async () => {
  const glue = await readFile(path.join(repoRoot, "source/host/runner/prompt-collector-glue.ts"), "utf8");
  assert.equal(glue.split("Questions the user dismissed or moved past without answering; take each as declined and don't ask it again:").length - 1, 2);
  assert.doesNotMatch(glue, /Unanswered questions:/);
  const runtime = await readFile(path.join(repoRoot, "source/host/extensions/transcript/turn-runtime.ts"), "utf8");
  assert.match(runtime, /collectUnansweredQuestionPrompts\(session, \{ movedOn: true \}\)/);
  const widgets = await readFile(path.join(repoRoot, "source/shared/sand-widgets.ts"), "utf8");
  assert.match(widgets, /multiSelect: z\n\s*\.boolean\(\)/);
  const brief = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  assert.match(brief, /Use style "primary" for the path you recommend and style "danger" for destructive choices\. Set multiSelect: true/);
  // Both apps send the option's own reply, never its label.
  for (const file of ["ios/Simeon/Cards.swift", "mac/Simeon/Cards.swift"]) {
    const cards = await readFile(path.join(repoRoot, "..", file), "utf8");
    assert.doesNotMatch(cards, /give\(option\.label\)|store\.answer\(option\.label/, file);
    assert.match(cards, /option\.value/, file);
  }
});
