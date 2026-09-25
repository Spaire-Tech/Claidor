/**
 * Watching a video, served (25 September 2026, docs/product/video-served.md).
 *
 * Grok Bot's watchVideo / videoReview subagents were in the tree and
 * refused: nothing registered them (`resolveSubagentConfigs`), the
 * executor spoke only the Responses wire (no video part) and dropped
 * `providerOptions.cursor.videoFps`, and the brief said "You can't watch
 * videos yet". Offline, this measures: (1) the two configs are registered
 * on the Gemini model and the Task tool's own resolver accepts them;
 * (2) a video child's session runs on the video model at low effort and
 * speaks Gemini's wire through Simeon Labs' proxy with the video's bytes,
 * mime type and frame rate on the request; (3) the brief follows the
 * served switch; (4) the Mac keeps the video model off the picker and
 * forwards the switches into the box.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-video-"));
  const outfile = path.join(temporary, "video.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/watch-video-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron", "jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const ENV_KEYS = ["SAND_DATA_ROOT", "SAND_BACKEND_URL", "SAND_VIDEO_SUBAGENT_SERVED", "SAND_CLAIDOR_VIDEO_MODEL"];
function pin(module, dataDir) {
  const previous = {};
  for (const key of ENV_KEYS) { previous[key] = process.env[key]; delete process.env[key]; }
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_video" });
  return () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

// Gemini's `alt=sse` stream: whole GenerateContentResponse objects, the
// usage cumulative on each, a function call as its own part.
function geminiStream(chunks) {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const PRODUCTION_TASK_OPTIONS = {
  subagentModelForcePolicy: "none",
  parentMaxMode: false,
  compareModelCosts: () => 0,
  isModelBlocked: () => false,
  isModelValid: () => true,
};

test("the two video subagents are registered on the Gemini model and the Task tool's resolver accepts them", async () => {
  const { module, dataDir, dispose } = await load();
  const unpin = pin(module, dataDir);
  try {
    const configs = module.createSandVideoSubagentConfigs();
    assert.deepEqual(configs.map((config) => module.getSubagentTypeName(config.subagent_type)), ["watchVideo", "videoReview"]);
    assert.ok(configs.every((config) => module.isGeminiVideoSubagentType(config.subagent_type)), "the proto cases are the real ones, so a Task may carry a video");
    assert.ok(configs.every((config) => config.userRequestedModelId === "gemini-2.5-flash"));
    assert.match(configs[0].description, /file_attachments/);
    assert.match(configs[0].description, /15 MB/);
    // The Task tool's own model resolution, with the production options
    // (turn-toolset.ts ~1383): the pinned Gemini id comes back, so the
    // attachment path's `isGeminiModelId` check passes and the video travels.
    const subagentModels = module.createSubagentModels({ "gpt-5.6-terra": { slug: "gpt-5.6-terra" } });
    for (const config of configs) {
      const resolved = await module.resolveSubagentModel({ subagentConfig: config, parentModelId: "gpt-5.6-terra", subagentModels, ...PRODUCTION_TASK_OPTIONS });
      assert.equal(resolved, "gemini-2.5-flash");
      assert.ok(module.isGeminiModelId(resolved));
    }
    // The Task tool normalises the name the model writes.
    assert.equal(module.normalizeSubagentTypeName("watch_video"), "watchvideo");
    assert.equal(module.normalizeSubagentTypeName("mediaReview"), "videoreview");
    assert.ok(module.isVideoSubagentType("watchVideo") && module.isVideoSubagentType("video-review") && module.isVideoSubagentType("mediaReview"));
    assert.ok(!module.isVideoSubagentType("computerUse"));
    // The switch, and the model it names.
    assert.equal(module.isVideoSubagentServed(), true);
    process.env.SAND_VIDEO_SUBAGENT_SERVED = "0";
    assert.equal(module.isVideoSubagentServed(), false);
    process.env.SAND_CLAIDOR_VIDEO_MODEL = "gemini-2.5-pro";
    assert.equal(module.createSandVideoSubagentConfigs()[0].userRequestedModelId, "gemini-2.5-pro");
  } finally {
    unpin();
    await dispose();
  }
});

test("the composition registers the configs behind the switch and puts a video child on the video model", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /if \(isVideoSubagentServed\(\)\) configs\.push\(\.\.\.createSandVideoSubagentConfigs\(\)\);/);
  assert.match(composition, /const isVideoTurn = identity\.isSubagentRunner && isVideoSubagentType\(identity\.subagentType\);/);
  assert.match(composition, /const turnModelId = isVideoTurn \? configuredClaidorVideoModel\(\) : staticModelId;/, "the child's state carries the Gemini id, so the video is accepted");
  assert.match(composition, /staticConfig: \{\n\s*modelId: turnModelId,/);
  assert.match(composition, /\.\.\.\(isVideoTurn \? \{ isVideoSubagent: true \} : \{\}\),/, "the executor is put on the video model by the flag");
  const shell = await readFile(path.join(repoRoot, "source/host/runner/turn-run-shell.ts"), "utf8");
  assert.match(shell, /isVideoSubagent: input\.isVideoSubagent/);
  const owner = await readFile(path.join(repoRoot, "source/host/runner/production-turn-agent-owner.ts"), "utf8");
  assert.match(owner, /isVideoSubagent: input\.isVideoSubagent/);
});

test("a video child's session speaks Gemini's wire through the proxy with the video's mime type and fps, on the video model at low effort", async () => {
  const { module, dataDir, dispose } = await load();
  const unpin = pin(module, dataDir);
  const previousFetch = globalThis.fetch;
  const requests = [];
  const logLines = [];
  module.setModelCallLog((line) => logLines.push(line));
  try {
    assert.equal(module.claidorModelForSession({ isVideoSubagent: true }), "gemini-2.5-flash");
    assert.equal(module.claidorModelForSession({ isVideoSubagent: true, modelId: "gemini-2.5-flash" }), "gemini-2.5-flash");
    assert.equal(module.claidorReasoningEffortForSession({ isVideoSubagent: true }, {}), "low");
    // By the flag only: the summarization session names gemini-2.5-flash too (Grok Bot's SAND_SUMMARIZATION_MODEL_ID) and stays on Luna.
    assert.equal(module.isConfiguredClaidorModelId("gemini-2.5-flash"), false);
    assert.equal(module.claidorModelForSession({ modelId: "gemini-2.5-flash" }), "gpt-5.6-terra");
    assert.equal(module.claidorModelForSession({ isSummarizationSession: true, modelId: "gemini-2.5-flash" }), "gpt-5.6-luna");
    assert.equal(module.claidorGeminiEndpoint("gemini-2.5-flash", "https://api.simeonlabs.com"), "https://api.simeonlabs.com/desktop/api/proxy/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");

    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
      return geminiStream([
        { responseId: "resp-video-1", candidates: [{ content: { role: "model", parts: [{ text: "A cat " }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2 } },
        { candidates: [{ content: { role: "model", parts: [{ text: "knocks a glass off the table." }, { functionCall: { name: "Shell", args: { command: "echo seen" } } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 } },
      ]);
    };
    const video = "AAAAGGZ0eXBtcDQy";
    const state = [
      { role: "system", content: "You are Simeon running as the watchVideo subagent." },
      { role: "user", content: [
        { type: "text", text: "What happens in this clip?" },
        // The part exactly as context-processing.ts writes the inline video (~293).
        { type: "image", image: `data:video/mp4;base64,${video}`, mimeType: "video/mp4", providerOptions: { cursor: { videoFps: 4 } } },
      ] },
    ];
    const definitions = [{ name: "Shell", description: "Run a command", parameters: { jsonSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, properties: { command: { type: "string", description: "the command" }, block_until_ms: { type: ["number", "null"], default: 0 } }, required: ["command"] } } }];
    const executor = module.createProviderPromptSession("claidor", { isVideoSubagent: true, modelId: "gemini-2.5-flash" }).getExecutor(state);
    const result = executor.stream({}, "inv-video", definitions);
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    const answer = await result.response;
    const usage = await result.usage;
    const extended = await result.extendedUsage;

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request.url, "https://api.simeonlabs.com/desktop/api/proxy/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
    assert.equal(request.headers.get("authorization"), "Bearer claidor_da_video");
    assert.deepEqual(request.body.systemInstruction, { parts: [{ text: "You are Simeon running as the watchVideo subagent." }] });
    assert.deepEqual(request.body.contents, [{ role: "user", parts: [
      { text: "What happens in this clip?" },
      { inlineData: { mimeType: "video/mp4", data: video }, videoMetadata: { fps: 4 } },
    ] }]);
    assert.equal(request.body.model, undefined, "the model is on the path, as Gemini's wire has it");
    // The tool schema in Gemini's OpenAPI subset: no $schema, no
    // additionalProperties, no default; a ["number","null"] type is nullable.
    assert.deepEqual(request.body.tools, [{ functionDeclarations: [{ name: "Shell", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string", description: "the command" }, block_until_ms: { type: "number", nullable: true } }, required: ["command"] } }] }]);

    assert.deepEqual(parts.filter((part) => part.type === "text-delta").map((part) => part.textDelta), ["A cat ", "knocks a glass off the table."]);
    const call = parts.find((part) => part.type === "tool-call");
    assert.ok(call, "a functionCall part is a tool-call the loop can run");
    assert.equal(call.toolName, "Shell");
    assert.deepEqual(call.args, { command: "echo seen" });
    assert.ok(typeof call.toolCallId === "string" && call.toolCallId.length > 0);
    assert.equal(answer.modelId, "gemini-2.5-flash");
    assert.equal(answer.id, "inv-video");
    assert.deepEqual(usage, { promptTokens: 1000, completionTokens: 25, totalTokens: 1025 });
    assert.equal(extended.inputTokens, 900);
    assert.equal(extended.cacheReadTokens, 100);
    assert.equal(extended.outputTokens, 25);
    // The two host-log lines: what was sent, and the call's meter.
    assert.ok(logLines.some((line) => line.includes("[claidor] video model=gemini-2.5-flash parts=1 video/mp4@4fps") && line.includes("offered=Shell")), logLines.join("\n"));
    assert.ok(logLines.some((line) => line.startsWith("[claidor] model=gemini-2.5-flash effort=low input=1000 cached=100 output=25 reasoning=5") && line.includes("tools=Shell(")), logLines.join("\n"));
  } finally {
    module.setModelCallLog(null);
    globalThis.fetch = previousFetch;
    unpin();
    await dispose();
  }
});

test("the request conversion folds the loop's tool rounds into Gemini's roles and carries a signed-URL video as fileData", async () => {
  const { module, dispose } = await load();
  try {
    const request = module.toGeminiRequest([
      { role: "system", content: [{ type: "text", text: "sys" }] },
      { role: "user", content: [{ type: "text", text: "watch" }, { type: "image", image: new URL("https://store.simeonlabs.com/v/1?sig=x"), mimeType: "video/webm", providerOptions: { cursor: { mimeType: "video/webm", videoFps: 0.5 } } }] },
      { role: "assistant", content: [{ type: "text", text: "Looking." }, { type: "tool-call", toolCallId: "c1", toolName: "Shell", args: { command: "ls" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "Shell", result: "a.mp4" }] },
      { role: "user", content: [{ type: "text", text: "Image output of the tool call(s) above." }, { type: "image", image: `data:image/png;base64,iVBORw0KGgo=`, mimeType: "image/png" }] },
    ], [{ name: "Shell", parameters: { type: "object", properties: {} }, source: {} }]);
    assert.deepEqual(request.systemInstruction, { parts: [{ text: "sys" }] });
    assert.deepEqual(request.contents, [
      { role: "user", parts: [{ text: "watch" }, { fileData: { mimeType: "video/webm", fileUri: "https://store.simeonlabs.com/v/1?sig=x" }, videoMetadata: { fps: 0.5 } }] },
      { role: "model", parts: [{ text: "Looking." }, { functionCall: { name: "Shell", args: { command: "ls" } } }] },
      // The tool's answer and the image turn that follows it fold into one user content: Gemini wants the roles to alternate.
      { role: "user", parts: [{ functionResponse: { name: "Shell", response: { result: "a.mp4" } } }, { text: "Image output of the tool call(s) above." }, { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }] },
    ]);
    assert.deepEqual(request.videoParts, [{ mimeType: "video/webm", fps: 0.5, uri: "https://store.simeonlabs.com/v/1?sig=x" }]);
    // A tool with no parameters is declared without a `parameters` object (Gemini refuses an empty one).
    assert.deepEqual(request.tools, [{ functionDeclarations: [{ name: "Shell" }] }]);
    assert.deepEqual(module.usageOf({ promptTokenCount: 10, cachedContentTokenCount: 4, candidatesTokenCount: 3, thoughtsTokenCount: 1 }), { inputTokens: 6, outputTokens: 4, cacheReadTokens: 4, cacheWriteTokens: 0, reasoningTokens: 1 });
  } finally {
    await dispose();
  }
});

test("the brief follows the served switch, and a video child's prompt says the video is in its message", async () => {
  const { module, dataDir, dispose } = await load();
  const unpin = pin(module, dataDir);
  try {
    assert.doesNotMatch(module.DEFAULT_SAND_SYSTEM_PROMPT, /You can't watch videos yet/, "the coming-soon sentence is gone from the served brief");
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /dispatch Task with subagent_type watchVideo \(or videoReview/);
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /up to 15 MB in this build/);
    const off = module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: false, videoSubagentOffered: false });
    assert.ok(off.includes(module.VIDEO_COMING_SOON_SENTENCE), "with the switch off the brief says so");
    assert.doesNotMatch(off, /subagent_type watchVideo/);
    process.env.SAND_VIDEO_SUBAGENT_SERVED = "0";
    assert.ok(module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: false }).includes(module.VIDEO_COMING_SOON_SENTENCE), "the default reads the environment");
    const child = module.buildSandSubagentSystemPrompt({ subagentType: "watchVideo" });
    assert.match(child, /^You are Simeon running as the watchVideo subagent\./);
    assert.match(child, /attached to the task message itself/);
    assert.doesNotMatch(module.buildSandSubagentSystemPrompt({ subagentType: "computerUse" }), /attached to the task message itself/);
    assert.ok(module.isMediaReviewSubagentType("videoReview") && module.isMediaReviewSubagentType("watch-video"));
  } finally {
    unpin();
    await dispose();
  }
});

test("the Mac keeps the video model off the picker and forwards the switches into the box", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.availableModelFromClaidorRow({ modelId: "gemini-2.5-flash", role: "video", supportsVideo: true }), null);
    assert.ok(module.availableModelFromClaidorRow({ modelId: "gpt-5.6-terra", role: "primary" }) != null);
    assert.ok(module.SERVED_SWITCH_ENVS.includes("SAND_VIDEO_SUBAGENT_SERVED"));
    assert.ok(module.SERVED_SWITCH_ENVS.includes("SAND_CLAIDOR_VIDEO_MODEL"));
  } finally {
    await dispose();
  }
});
