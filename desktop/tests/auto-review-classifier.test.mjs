/**
 * Auto-review's risky-or-safe classifier runs on Simeon's own model path.
 * Until 24 September 2026 it asked Cursor's `ClassifySandAutoReview`, which
 * Simeon Labs' server does not serve, so every classification failed and an
 * enforced review blocked everything (`runSandAutoReviewClassifier` falls
 * closed to `reject`).
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function fakeExecutor(answer) {
  const messages = [];
  return {
    messages,
    appendMessages: (value) => { messages.push(...(Array.isArray(value) ? value : [value])); },
    getState: () => ({}),
    getMessages: () => messages,
    clearMessages: () => { messages.length = 0; },
    stream: () => ({ fullStream: (async function* () { yield { type: "text-delta", textDelta: answer.slice(0, 5) }; yield { type: "text-delta", textDelta: answer.slice(5) }; })() }),
  };
}

test("the classifier asks the cheap model with the action and the conversation, and reads allow or block back", async () => {
  const { module, dispose } = await load("source/host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts", "auto-review-classifier");
  const proto = await load("source/packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.ts", "classifier-proto");
  const bufbuild = await import("@bufbuild/protobuf");
  const contextModule = await load("source/packages/context/core.ts", "context-core");
  try {
    const { SmartModeClassifierArgs, SmartModeRiskTarget, SmartModeClassifierConversationMessage, SmartModeClassifierDecision } = proto.module;
    const args = new SmartModeClassifierArgs({
      toolCallId: "call-1",
      target: new SmartModeRiskTarget({ action: "shell", arguments: bufbuild.Struct.fromJson({ command: "rm -rf ~/Documents", personal_instructions: { block: ["never delete my documents"] } }) }),
      conversationContext: [new SmartModeClassifierConversationMessage({ role: "user", content: "clean up my downloads folder" })],
    });
    const lines = [];
    const blocking = fakeExecutor('{"decision":"block","reason":"This deletes your Documents folder, which the task did not ask for.","proposedAllowRule":"allow deleting inside ~/Downloads"}');
    const executor = module.createSimeonSmartModeClassifierExecutor({ createExecutor: () => blocking, log: (line) => lines.push(line) });
    const ctx = contextModule.module.createContext();
    const result = await executor.execute(ctx, args);
    assert.equal(result.result.case, "success");
    assert.equal(result.result.value.decision, SmartModeClassifierDecision.BLOCK);
    assert.match(result.result.value.blockReason, /Documents folder/);
    assert.equal(result.result.value.proposedAllowRule, "allow deleting inside ~/Downloads");
    assert.equal(blocking.messages[0].role, "system");
    assert.match(blocking.messages[1].content, /Action kind: shell/);
    assert.match(blocking.messages[1].content, /rm -rf ~\/Documents/);
    assert.match(blocking.messages[1].content, /never delete my documents/);
    assert.match(blocking.messages[1].content, /user: clean up my downloads folder/);
    assert.match(lines[0], /\[claidor\] auto-review action=shell mode=enforce verdict=block/);

    const allowing = module.createSimeonSmartModeClassifierExecutor({ createExecutor: () => fakeExecutor("Sure. {\"decision\": \"ALLOW\"}"), log: () => {} });
    const allowed = await allowing.execute(contextModule.module.createContext(), args);
    assert.equal(allowed.result.case, "success");
    assert.equal(allowed.result.value.decision, SmartModeClassifierDecision.ALLOW);

    const garbled = module.createSimeonSmartModeClassifierExecutor({ createExecutor: () => fakeExecutor("I cannot decide."), log: () => {} });
    const unreadable = await garbled.execute(contextModule.module.createContext(), args);
    assert.equal(unreadable.result.case, "error", "an unreadable answer is an error, which the caller treats as reject");

    assert.equal(module.parseSmartModeClassifierAnswer('{"decision":"maybe"}'), null);
  } finally {
    await dispose();
    await proto.dispose();
    await contextModule.dispose();
  }
});

test("the auto-review extension binds the Simeon classifier, not Cursor's", async () => {
  const extension = await readFile(path.join(repoRoot, "source/host/extensions/auto-review/extension.ts"), "utf8");
  assert.match(extension, /createSimeonSmartModeClassifierExecutor\(\{/);
  assert.match(extension, /HostExtensions\.Inference,/);
  assert.match(extension, /isSummarizationSession: true,/, "the cheap session, the way memory synthesis runs");
  assert.doesNotMatch(extension, /createClassifierExecutor: createSandBackendSmartModeClassifierExecutor/);
});
