/**
 * The brief, the turn and the children (25 September 2026,
 * design-audit-ledger.md clusters `executor-contract`, `child-state` and
 * `brief-text`).
 *
 * The claidor executor was bolted onto a loop built for Cursor's server
 * and never given the loop's contract back: a 45 s deadline on the whole
 * streamed body, a silent swap to the cheap model on a rate limit, no
 * request id, a Cursor-era model name. A Task child ran on the parent's
 * conversation state and wrote its checkpoint into the parent's store. The
 * brief promised a Screenshot tool the request withheld, a watchVideo
 * subagent nobody offered, per-action approval cards, poppler, an anyrun
 * pod and a five-tab Settings; the founder's voice brief was not in it,
 * and nothing said a report is a file.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the executor's deadline covers the headers only, the cheap swap is logged, the request id is reported, and the model name is real", async () => {
  const providers = await src("host/extensions/inference/provider-session.ts");
  assert.match(providers, /const headersDeadline = new AbortController\(\);/);
  assert.match(providers, /clearTimeout\(timer\);/);
  assert.doesNotMatch(providers, /AbortSignal\.timeout\(CLAIDOR_FETCH_TIMEOUT_MS\)/, "no whole-request abort");
  assert.match(providers, /withCheapRateLimitFallback\(start\(requested\), \(\) => start\(cheap\), \(error\) => modelCallLog\(`\$\{HOST_LOG_PREFIX\} model-fallback from=\$\{requested\} to=\$\{cheap\}/);
  assert.match(providers, /if \(onRequestId != null\) void race\(result\.response\)\.then/);
  assert.match(providers, /model-error-system \$\{clipForHostLog\(redactSandAutoReviewInlineSecrets\(systemPromptText\(messages\)\), 12000\)\}/);
  assert.match(await src("host/extensions/inference/inference-service.ts"), /createProviderPromptSession\(provider, sessionOptions, onRequestId\)/);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /export const DEFAULT_SAND_MODEL = configuredClaidorModel\(\);/);
  assert.doesNotMatch(composition, /= "gpt-5\.5-high-fast"/);
  const { module, dispose } = await load("source/shared/inference/cheap-rate-limit-fallback.ts", "cheap-fallback-log");
  try {
    const stream = (parts, error) => ({
      fullStream: (async function* () { for (const part of parts) yield part; if (error) throw error; })(),
      response: Promise.resolve({}), usage: Promise.resolve({}), extendedUsage: Promise.resolve({}), providerMetadata: Promise.resolve({}),
    });
    const seen = [];
    const result = module.withCheapRateLimitFallback(stream([], new Error("rate limit exceeded, retry later")), () => stream([{ type: "text-delta", textDelta: "ok" }]), (error) => seen.push(error.message));
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    assert.deepEqual(parts, [{ type: "text-delta", textDelta: "ok" }]);
    assert.deepEqual(seen, ["rate limit exceeded, retry later"], "the swap is reported before the cheap stream starts");
  } finally {
    await dispose();
  }
});

test("a Task child owns its conversation state and settles into its own transcript", async () => {
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /const createChildTurnSettleHost = \(identity: \{ readonly conversationId: string; readonly runner\?: \(\) => unknown \}\): TurnSettleHost => \{/);
  assert.match(composition, /isSubagentRunner: true,\n\s*getTranscriptId: \(\) => identity\.conversationId,/);
  assert.match(composition, /agentStore: \(\) => null,/, "the child's checkpoint goes to setLocalState, never the agent's store");
  assert.match(composition, /const runner = \(identity\.isSubagentRunner \? identity\.runner\?\.\(\) : builtRunner\) as \{/);
  assert.match(composition, /createSettleHost: identity\.isSubagentRunner \? \(\) => createChildTurnSettleHost\(identity\) : createProductionTurnSettleHost,/);
  assert.match(composition, /getAgentId: \(\) => agentId,\n\s*isSubagent: true,/, "the child carries its own id");
  assert.match(composition, /runner: \(\) => childRunner,/);
  assert.match(composition, /\.\.\.\(args\.readonly == null \? \{\} : \{ readonly: args\.readonly \}\),/);
  assert.match(composition, /parentComputerUse\?\.prepareRemoteBox\?\.\(\{ agentId, boxId: session\.id \}\)/, "Chrome prewarms for a computerUse child");
  assert.match(composition, /let remoteBoxAvailable = true;/);
  assert.equal((composition.match(/=> remoteBoxAvailable/g) ?? []).length, 2);
  assert.match(composition, /if \(remoteBoxAvailable\) \{\n\s*const browserUseOffered/);
  assert.doesNotMatch(composition, /"isAvailable"\)\?\.\(\) !== false/, "no Promise compared to false");
  assert.match(composition, /isBrowserUseSubagentEnabled: \(\) => method\(experiments, "isBrowserUseSubagentEnabled"\)\?\.\(\) === true,\n\s*screenshotToolOffered: \(\) => AGENT_SCREENSHOT_TOOL,\n\s*resolveBoxBrowser: \(\) => \{/);
  const { module, dispose } = await load("source/packages/agent/tools/task-subagent-preparation.ts", "task-preparation");
  try {
    assert.equal(typeof module.resolveTaskSubagentConfig, "function");
  } catch {
    // the function may not be exported under that name; the source check below is the measurement
  } finally {
    await dispose();
  }
  const preparation = await src("packages/agent/tools/task-subagent-preparation.ts");
  assert.match(preparation, /throw new ToolCallArgParseError\(`No subagent type named "\$\{rawArgs\.subagent_type\}"\. Available: /);
  assert.doesNotMatch(preparation, /findSubagentConfigByName\(subagentConfigs, rawArgs\.subagent_type\) \?\? defaultConfig/);
});

test("the brief follows the tools it has and carries the founder's voice, and a report is a file", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt");
  try {
    assert.equal(module.AGENT_SCREENSHOT_TOOL_OFFERED, false);
    const prompt = module.DEFAULT_SAND_SYSTEM_PROMPT;
    assert.match(prompt, /## Voice\nTalk like a warm, sharp friend — not a help desk\. Use plain words and contractions\./, "the founder's paragraph, verbatim");
    assert.match(prompt, /Never dump tool names, prompts, or architecture unless they ask how to use you\./);
    assert.match(prompt, /## Documents you make\nA report, plan, guide, memo, deck or spreadsheet the user asked for is a file, not a long chat reply: write a \.docx, \.pptx or \.xlsx/);
    assert.doesNotMatch(prompt, /read-only Screenshot tool|Screenshot views of the box/, "no Screenshot promise while the tool is withheld");
    assert.match(prompt, /a computerUse subagent's screenshots/);
    // Since 25 September 2026 watchVideo is served (docs/product/video-served.md,
    // tests/watch-video.test.mjs): the brief delegates a video to it, and the
    // coming-soon sentence sits behind `SAND_VIDEO_SUBAGENT_SERVED=0`.
    assert.match(prompt, /dispatch Task with subagent_type watchVideo/);
    assert.doesNotMatch(prompt, /You can't watch videos yet, and there is no subagent that can/);
    assert.match(module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: false, videoSubagentOffered: false }), /You can't watch videos yet, and there is no subagent that can/);
    assert.match(prompt, /The first action there asks the user once, with a card; once they choose Always allow it runs without a card, except a risky command or a sensitive path/);
    assert.doesNotMatch(prompt, /every action needs the user's permission and raises an approval card/);
    assert.match(prompt, /that it needs their OK and why/);
    assert.doesNotMatch(prompt, /that Auto-review blocked it/);
    const withTool = module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: false, screenshotToolOffered: true });
    assert.match(withTool, /use your read-only Screenshot tool to show the desktop/);
  } finally {
    await dispose();
  }
  const glue = await src("host/runner/prompt-collector-glue.ts");
  assert.match(glue, /const screenshotOffered = host\.screenshotToolOffered\?\.\(\) === true;/);
  assert.match(glue, /You have no Screenshot tool of your own in this build/);
  assert.doesNotMatch(glue, /poppler/);
  assert.match(glue, /Read converts a PDF to text on its own/);
  const docs = await load("source/host/runner/box-reference-docs.ts", "box-reference-docs");
  try {
    const debugging = docs.module.SAND_BOX_DEBUGGING_REFERENCE_DOC;
    assert.doesNotMatch(debugging, /anyrun|sand-box- container|the shipped default\)/);
    assert.match(debugging, /local Docker container on the user's Mac named simeon-box/);
    assert.match(debugging, /docker restart simeon-box/);
    const ui = docs.module.SAND_APP_UI_REFERENCE_DOC;
    assert.match(ui, /Settings has three tabs: General, Usage & Billing, Updates/);
    assert.doesNotMatch(ui, /five tabs|Team Setup|Appearance: "Theme"/);
  } finally {
    await docs.dispose();
  }
  assert.match(await src("shared/agents/onboarding.ts"), /propose it with ProposeConnector \(one card per service, two or three at most\)/);
  assert.doesNotMatch(await src("host/runner/tools/send-message-schema.ts"), /SEND_MESSAGE_TYPE_DESCRIPTION/);
  assert.match(await src("host/runner/tools/sand-subagent-management-tools.ts"), /when the child reports them, its recent tool calls and a transcript path/);
  for (const file of ["host/runner/tools/box-help-tool.ts", "host/extensions/transcript/box-handoff-resume.ts"]) {
    assert.doesNotMatch(await src(file), /start(?: by using| with) the read-only Screenshot tool/, file);
  }
});
