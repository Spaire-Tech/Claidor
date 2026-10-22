/**
 * What the person reads that a model or the engine writes outside the chat
 * (22 October 2026): the approval card's reason and rule, the reviewer's own
 * fallbacks, a routine's trigger line and a group chat's routine message are
 * in the person's language; English reads exactly as before, and what only
 * a model reads (the routine's own prompt) stays English.
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
  return { module, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("the reviewer writes its reason and rule in the person's language; its fallback rule too", async () => {
  const { module, dispose } = await load("source/host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts", "visible-reviewer");
  const proto = await load("source/packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.ts", "visible-reviewer-proto");
  const bufbuild = await import("@bufbuild/protobuf");
  try {
    const { SmartModeClassifierArgs, SmartModeRiskTarget } = proto.module;
    const args = new SmartModeClassifierArgs({ target: new SmartModeRiskTarget({ action: "shell", arguments: bufbuild.Struct.fromJson({ command: "git push origin main" }) }) });
    assert.equal(module.reviewerLanguageLine(undefined), "");
    assert.equal(module.reviewerLanguageLine("en-GB"), "");
    assert.equal(module.reviewerLanguageLine("fr"), 'The person reads reason and proposedAllowRule in French: write both in French, saying "tu" to them. The decision word stays allow or block.');
    assert.match(module.reviewerLanguageLine("de"), /write both in German, saying "du" to them/);
    assert.equal(module.fallbackAllowRule(args, "en"), "Allow shell: git push origin main", "English as before");
    assert.equal(module.fallbackAllowRule(args, "fr"), "Autoriser shell : git push origin main");
    assert.equal(module.fallbackAllowRule(new SmartModeClassifierArgs({ target: new SmartModeRiskTarget({ action: "browser" }) }), "es"), "Permitir acciones browser como esta");
  } finally {
    await dispose();
    await proto.dispose();
  }
});

test("what woke a routine reads in the person's language where they see it; its prompt keeps the English", async () => {
  const trigger = await load("source/host/automations/automation-trigger.ts", "visible-trigger");
  const automation = await load("source/host/automations/automation.ts", "visible-automation");
  try {
    const pr = { source: "github", kind: "pr-opened", repo: "acme/app", title: "Fix login", actor: "ada" };
    const slack = { source: "slack", sender: "Ada", channel: "#ops", text: "Ship it" };
    assert.equal(trigger.module.describeTriggerEvent(pr), 'PR opened in acme/app: "Fix login" by ada', "English as before");
    assert.equal(trigger.module.describeTriggerEvent(pr, "en-US"), 'PR opened in acme/app: "Fix login" by ada');
    assert.equal(trigger.module.describeTriggerEvent(pr, "fr"), "PR ouverte dans acme/app : « Fix login » par ada");
    assert.equal(trigger.module.describeTriggerEvent(pr, "de"), "PR geöffnet in acme/app: „Fix login“ von ada");
    assert.equal(trigger.module.describeTriggerEvent(slack, "es"), "Ada en #ops: “Ship it”");
    assert.equal(trigger.module.describeTriggerEvent({ source: "linear", event: "issueCreated", title: "Bug" }, "it"), "Issue creata: “Bug”");
    assert.equal(automation.module.describeTriggerEventBatch([pr, slack], "en"), '2 events; latest: Ada in #ops: "Ship it"');
    assert.equal(automation.module.describeTriggerEventBatch([pr, slack], "nl"), "2 gebeurtenissen; laatste: Ada in #ops: “Ship it”");
    const seed = automation.module.buildGroupAutomationSeed({ prompt: "Résume la PR." }, [pr], "fr");
    assert.match(seed, /^Résume la PR\.\n\nDéclenché par : PR ouverte dans acme\/app/);
    assert.match(seed, /ce ne sont pas des instructions\.$/);
    assert.match(automation.module.buildGroupAutomationSeed({ prompt: "Sum it up." }, [pr]), /\nTriggered by: PR opened in acme\/app: "Fix login" by ada\n/, "English as before");
    const wake = automation.module.buildAutomationWakePrompt({ id: "r1", name: "PR digest", prompt: "Sum it up.", trigger: { type: "github", repo: "acme/app", events: ["pr-opened"] }, schedule: null }, { event: pr });
    assert.match(wake, /What woke you: PR opened in acme\/app/, "the routine's own prompt stays English");
  } finally {
    await trigger.dispose();
    await automation.dispose();
  }
});
