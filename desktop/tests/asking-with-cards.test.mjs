/**
 * Questions as cards, asked before choosing for the person (10 November 2026). The founder, of
 * Maya picking a dozen red roses for "can you find me flowers to buy for my girl. canada
 * flowers", then answering "ask me more info" with four questions in one paragraph: "my
 * expectations would be that she ask me questions with cards. additional info, as i did it on
 * purpose to be vague." Nothing was broken: the brief kept the card for "the rare occasion" and
 * read a private preference as one of "several reasonable readings" to pick from.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the brief asks with cards, before choosing, for what only the person knows", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "asking-brief");
  try {
    const brief = module.DEFAULT_SAND_SYSTEM_PROMPT;
    for (const gone of ["On the rare occasion you genuinely need a decision", "## Asking for decisions", "if you need a decision first, ask with a widget rather than stalling"]) {
      assert.equal(brief.includes(gone), false, gone);
    }
    assert.match(brief, /\n## Asking the user\n/);
    assert.match(brief, /a decision or a detail only they know, ask with a question widget \(the question card\), never in prose: \{"type":"widget"/);
    assert.match(brief, /ask with a question card rather than stalling or guessing/);
    // Before, not after: the person's taste is never one of the readings the agent picks from.
    assert.match(brief, /ask before you search or pick, not after: "find me flowers to buy for my girl" gets one card asking the occasion, her taste and the budget/);
    assert.match(brief, /never your own pick first with the questions afterwards/);
    assert.match(brief, /When they ask you to ask them \("ask me more", "ask me questions first"\), always ask, with cards\./);
    assert.match(brief, /How to do the work is yours to decide; what the user likes, wants or plans is not yours to guess/);
    // The questions in one card that goes through them one at a time (10 November 2026), never in a paragraph.
    assert.equal(brief.includes("One question per card"), false);
    assert.match(brief, /Ask what you need in one card, not one card per question: with two to four questions, put them all in questions/);
    assert.match(brief, /"\(skipped\)" for one they skipped/);
    assert.match(brief, /If the reply answers only the first question \(an older app shows only that one\), ask the rest the same way\./);
    assert.match(brief, /Never write the questions out in a message, as a list or in a paragraph, not even with a card after it\./);
    // The usual answers to a question about taste are not invented options; the person can type their own.
    assert.match(brief, /That rule is about facts \(an account, a person, an address, a product\)/);
    assert.match(brief, /the options are the usual answers \("Birthday", "Anniversary", "Just because"\) with allowCustom: true/);
    // Low-stakes calls stay the agent's own.
    assert.match(brief, /don't reach for it reflexively for a low-stakes call you could just make/);
    assert.match(brief, /Your default is to act, not to ask\./);
  } finally {
    await dispose();
  }
});

test("SendMessage's own description no longer says to ask rarely", async () => {
  const { module, dispose } = await load("source/shared/sand-tools.ts", "asking-tools");
  try {
    const description = module.SAND_TOOLS.find((tool) => tool.name === "SendMessage").description;
    assert.equal(description.includes("but ask rarely"), false);
    assert.match(description, /ask that before you choose for them, in one widget, never as a list of questions in text/);
    assert.match(description, /put two to four questions in the widget's questions/);
    assert.match(description, /For a question about the user's own taste or plans, the options are the usual answers, with allowCustom: true\./);
  } finally {
    await dispose();
  }
});

test("a card with several questions: the first is the card's own, and the reply has a line each", async () => {
  const { module: widgets, dispose } = await load("source/shared/sand-widgets.ts", "asking-widgets");
  const { module: schema, dispose: disposeSchema } = await load("source/host/runner/tools/send-message-schema.ts", "asking-schema");
  try {
    const city = { prompt: "Which city is she in?", options: [{ label: "Toronto" }, { label: "Montreal" }], allowCustom: true };
    const budget = { prompt: "Budget?", options: [{ label: "Under $75 CAD" }, { label: "$75\u2013$125 CAD" }] };
    const occasion = { prompt: "What's the occasion", options: [{ label: "Birthday" }, { label: "Just because" }], multiSelect: true };
    // The whole set in questions: the card's own question is the first.
    const whole = widgets.normalizeSandWidget({ questions: [city, budget, occasion] });
    assert.equal(whole.prompt, "Which city is she in?");
    assert.deepEqual(whole.options, city.options);
    assert.equal(whole.allowCustom, true);
    assert.equal(whole.questions.length, 3);
    // The first written at the top and the others in questions: all three kept, in order.
    const split = widgets.normalizeSandWidget({ prompt: city.prompt, options: city.options, questions: [budget, occasion] });
    assert.deepEqual(split.questions.map((q) => q.prompt), ["Which city is she in?", "Budget?", "What's the occasion"]);
    // The first repeated at the top, as models do: not counted twice.
    const repeated = widgets.normalizeSandWidget({ prompt: city.prompt, options: city.options, questions: [city, budget] });
    assert.equal(repeated.questions.length, 2);
    // One question in questions is a card's own.
    const one = widgets.normalizeSandWidget({ questions: [budget], dismissOnMoveOn: true });
    assert.equal(one.prompt, "Budget?");
    assert.equal(one.questions, undefined);
    assert.equal(one.dismissOnMoveOn, true);
    // SendMessage takes it, and refuses a fifth question.
    const sent = schema.sendMessageParameters.safeParse({ type: "widget", widget: { questions: [city, budget, occasion] }, final: true });
    assert.equal(sent.success, true, JSON.stringify(sent.error?.issues));
    assert.equal(sent.data.widget.prompt, "Which city is she in?");
    assert.equal(sent.data.widget.questions.length, 3);
    const five = schema.sendMessageParameters.safeParse({ type: "widget", widget: { questions: [city, budget, occasion, { ...budget, prompt: "When?" }, { ...budget, prompt: "Note?" }] } });
    assert.equal(five.success, false);
    assert.equal(schema.sendMessageEndsTurn({ type: "widget", widget: whole }), true);
    // The reply: a line per question, the question then the answer; skipped ones say so; read back the same.
    const prompts = whole.questions.map((q) => q.prompt);
    const reply = widgets.formatQuestionsReply(prompts, ["Toronto", null, "Birthday\nJust because"]);
    assert.equal(reply, "Which city is she in? Toronto\nBudget? (skipped)\nWhat's the occasion: Birthday, Just because");
    assert.deepEqual(widgets.readQuestionsReply(prompts, reply), ["Toronto", null, "Birthday, Just because"]);
    // An older app answers the card's own question only.
    assert.deepEqual(widgets.readQuestionsReply(prompts, "Toronto"), ["Toronto", null, null]);
    // What the agent's history and the chat list show.
    assert.equal(widgets.summarizeWidget(whole).split("\n").length, 3);
    assert.equal(widgets.widgetReplyPreview(whole, reply), "Toronto · Birthday, Just because");
    assert.equal(widgets.widgetReplyPreview({ prompt: "Send it?", options: [{ label: "Yes" }] }, "Yes"), "Yes");
  } finally {
    await dispose();
    await disposeSchema();
  }
});
