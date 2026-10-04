/**
 * Three things the founder found testing the app on 28 September 2026:
 * "Always allow" came back "Allowed once" (the card downgrades whenever the
 * block carries no proposedAllowRule), a new agent's first message had no
 * options (a real widget on a text message was dropped), and a group showed
 * one mark instead of its members' faces (no roster row said isGroup).
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("a block with no rule from the reviewer still carries one, so Always allow can save it", async () => {
  const { module, dispose } = await load("source/host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts", "classifier-rule");
  const proto = await load("source/packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.ts", "classifier-proto-rule");
  const bufbuild = await import("@bufbuild/protobuf");
  try {
    const { SmartModeClassifierArgs, SmartModeRiskTarget } = proto.module;
    const args = new SmartModeClassifierArgs({ target: new SmartModeRiskTarget({ action: "shell", arguments: bufbuild.Struct.fromJson({ command: "git push origin main" }) }) });
    assert.equal(module.fallbackAllowRule(args), "Allow shell: git push origin main");
    const parsed = module.parseSmartModeClassifierAnswer('{"decision":"block","reason":"Pushes to main."}', module.fallbackAllowRule(args));
    assert.equal(parsed.proposedAllowRule, "Allow shell: git push origin main");
    const given = module.parseSmartModeClassifierAnswer('{"decision":"block","reason":"x","proposedAllowRule":"allow pushes to my branches"}', "fallback");
    assert.equal(given.proposedAllowRule, "allow pushes to my branches");
    assert.match(module.SIMEON_AUTO_REVIEW_SYSTEM_PROMPT, /A block answer always carries proposedAllowRule/);
  } finally {
    await dispose();
    await proto.dispose();
  }
});

test("a real question on a text message is sent after it; blank and padded ones are still dropped", async () => {
  const { module, dispose } = await load("source/host/runner/tools/send-message-schema.ts", "send-message-follow-up");
  try {
    const real = { type: "text", content: "Hey, I'm Nova.", widget: { prompt: "Where should I start?", options: [{ label: "Plan my week" }, { label: "Clean my inbox" }, { label: "Research a topic" }] } };
    assert.equal(module.followUpWidgetOf(real).prompt, "Where should I start?");
    assert.equal(module.followUpWidgetOf({ ...real, widget: { prompt: "", options: [{ label: "" }] } }), undefined);
    assert.equal(module.followUpWidgetOf({ ...real, widget: { prompt: "x", options: [{ label: "x" }, { label: "x" }] } }), undefined);
    assert.equal(module.followUpWidgetOf({ ...real, type: "widget" }), undefined);
    const parsed = module.sendMessageParameters.parse(real);
    assert.equal(parsed.widget, undefined, "the text message itself still carries no widget");
  } finally {
    await dispose();
  }
});

test("a group's roster row says isGroup with its members, from its own group.json", async () => {
  const { module, dispose } = await load("source/host/extensions/session/session-summaries.ts", "session-summaries-group");
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-group-row-"));
  try {
    const dir = path.join(root, "group-1");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "group.json"), JSON.stringify({ version: 1, memberIds: ["a", "b", "c"] }));
    await writeFile(path.join(dir, "profile.md"), "---\nname: Launch squad\n---\n");
    const row = await module.buildSummary({ dbPath: path.join(dir, "store.db"), dirName: "group-1", includeBlank: true, readAvatar: async () => ({ dataUrl: "data:x", version: "1" }) });
    assert.equal(row.isGroup, true);
    assert.deepEqual(row.memberIds, ["a", "b", "c"]);
    assert.equal(row.avatarDataUrl, null, "a group draws its members, never a photo of its own");
    const solo = path.join(root, "solo");
    await mkdir(solo, { recursive: true });
    const single = await module.buildSummary({ dbPath: path.join(solo, "store.db"), dirName: "solo", includeBlank: true, readAvatar: async () => null });
    assert.equal(single.isGroup, false);
    assert.deepEqual(single.memberIds, []);
  } finally {
    await dispose();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("a new agent's first turn is the upstream app's opening: a hello, then a question card with its help text", async () => {
  const { module, dispose } = await load("source/shared/agents/onboarding.ts", "onboarding-opening");
  try {
    const prompt = module.SAND_ONBOARDING_KICKSTART_PROMPT;
    assert.match(prompt, /blank slate and would like to know what they want you for before you start guessing/);
    assert.match(prompt, /allowCustom set to true/);
    assert.match(prompt, /Pick one, or type your own\. You can hand me a real task instead, and I'll just start on it\./);
    assert.match(prompt, /offer any choice as a question widget/, "the upstream app's own last sentence stays");
    assert.doesNotMatch(prompt, /Grok|the upstream app/);
  } finally {
    await dispose();
  }
});

test("getting started keeps asking with cards and proposes connectors on the turns after the first", async () => {
  const { module, dispose } = await load("source/shared/agents/onboarding.ts", "onboarding-next-turns");
  try {
    const prompt = module.SAND_ONBOARDING_KICKSTART_PROMPT;
    assert.match(prompt, /Getting started carries on the same way on your next turns/);
    assert.match(prompt, /never a question written in prose/);
    assert.match(prompt, /check what's connected with SearchPlugins/);
    assert.match(prompt, /propose the two or three that fit with ProposeConnector/);
  } finally {
    await dispose();
  }
});
