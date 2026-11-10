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
    assert.match(brief, /ask before you search or pick, not after: "find me flowers to buy for my girl" gets a card on the occasion/);
    assert.match(brief, /never your own pick first with the questions afterwards/);
    assert.match(brief, /When they ask you to ask them \("ask me more", "ask me questions first"\), always ask, with cards\./);
    assert.match(brief, /How to do the work is yours to decide; what the user likes, wants or plans is not yours to guess/);
    // One card at a time (a card is one question and ends the turn), never the questions in a paragraph.
    assert.match(brief, /One question per card, and a card ends your turn: ask the question that matters most first/);
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
    assert.match(description, /ask that before you choose for them, one widget at a time, never as a list of questions in text/);
    assert.match(description, /For a question about the user's own taste or plans, the options are the usual answers, with allowCustom: true\./);
  } finally {
    await dispose();
  }
});
