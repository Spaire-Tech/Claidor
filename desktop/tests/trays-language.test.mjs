/**
 * What the host itself tells the person (20 October 2026): the spend
 * guard's card and a channel message that did not go, in the person's
 * language (`userLanguage`); English, or none, reads as before, and the
 * agent's own notice stays English.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the spend guard's card is in the person's language and is known whatever the language it was asked in", async () => {
  const { module, dispose } = await load("source/host/extensions/transcript/sand-automation-spend-guard.ts", "spend-guard-language");
  try {
    const { buildSpendGuardNudgeWidget, buildSpendGuardPausedWidget, isSpendGuardCard, SPEND_GUARD_ANSWER_VALUES } = module;
    assert.equal(buildSpendGuardNudgeWidget().prompt, "You've been away for a bit — keep my routines running?");
    const french = buildSpendGuardNudgeWidget("fr");
    assert.match(french.prompt, /routines/);
    assert.notEqual(french.prompt, buildSpendGuardNudgeWidget().prompt);
    assert.deepEqual(french.options.map((option) => option.value), buildSpendGuardNudgeWidget().options.map((option) => option.value));
    assert.equal(isSpendGuardCard(french, SPEND_GUARD_ANSWER_VALUES.keep), true, "a French card still answers");
    assert.equal(isSpendGuardCard(buildSpendGuardPausedWidget("fr"), SPEND_GUARD_ANSWER_VALUES.resume), true);
    assert.equal(isSpendGuardCard({ prompt: "Something else", options: french.options }, SPEND_GUARD_ANSWER_VALUES.keep), false);
  } finally {
    await dispose();
  }
});

test("a channel message that did not go: the tray in the person's language, the agent's notice in English", async () => {
  const { module, dispose } = await load("source/shared/channel-messaging.ts", "channel-language");
  try {
    const { humanizeChannelDeliveryFailure } = module;
    assert.equal(humanizeChannelDeliveryFailure("nowhere", "x"), "\"nowhere\" isn't a valid channel address, so that message wasn't delivered.");
    assert.equal(humanizeChannelDeliveryFailure("nowhere", "x", "fr"), "« nowhere » n’est pas une adresse de canal valide, alors ce message n’a pas été remis.");
    assert.equal(humanizeChannelDeliveryFailure("nowhere", "x", "en"), humanizeChannelDeliveryFailure("nowhere", "x"));
  } finally {
    await dispose();
  }
});
