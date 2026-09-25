/**
 * Cloud agents are served (25 September 2026, `polar/sand/cloud_agents.py`
 * over the maty queue; `docs/product/cloud-agents-served.md`).
 *
 * The client is Grok Bot's own, unchanged in what it sends:
 * `SandCloudAgentManager` composes each Connect request and reads each
 * answer. This drives it against an in-process Connect JSON server that
 * answers the shapes Simeon Labs' server writes (the same field names
 * `server/tests/sand/test_cloud_agents.py` asserts), so one launch, one
 * info poll, one list, the model catalogue and the transcript dump come
 * through the real transport and the card's fields are what the server
 * said. The brief's cloud-agent sections say Simeon, not Cursor.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
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

/** The projection `polar/sand/cloud_agents_service.py` writes, in memory. */
function simeonServer() {
  const agents = new Map();
  const seen = [];
  const composerOf = (agent) => ({ bcId: agent.bcId, createdAtMs: 1_758_800_000_000, updatedAtMs: 1_758_800_001_000, name: agent.name, branchName: "", repoUrl: agent.repoUrl, isArchived: false, status: agent.status, prUrl: "", isPrMerged: false, linesAdded: 0, linesRemoved: 0, filesChanged: 0, commitCount: 0, workspaceRootPath: "/workspace", hasStartedVm: agent.status !== 4, isKilled: false, ...(agent.modelId ? { requestedModel: { modelId: agent.modelId } } : {}) });
  const detailedOf = (agent) => ({ composer: composerOf(agent), status: agent.status, baseBranch: "main", prompt: { text: agent.prompt }, prs: [], autoCreatePr: false, autoBranch: false, environmentName: "Simeon's computer", ...(agent.status === 2 ? { summary: agent.summary } : {}) });
  const models = { models: [
    { name: "gpt-5.6-terra", defaultOn: true, serverModelName: "gpt-5.6-terra", clientDisplayName: "GPT-5.6 Terra", tagline: "The loop's model.", vendorName: "openai", supportsAgent: true, supportsImages: true, supportsThinking: false, supportsMaxMode: false, supportsNonMaxMode: true, isHidden: false, isChatOnly: false, isLongContextOnly: false, isRecommendedForBackgroundComposer: true, contextTokenLimit: 400000, price: 0.6667, parameterDefinitions: [], variants: [], idAliases: [], legacySlugs: [] },
    { name: "gpt-5.6-luna", defaultOn: false, serverModelName: "gpt-5.6-luna", clientDisplayName: "GPT-5.6 Luna", vendorName: "openai", supportsAgent: true, supportsImages: true, supportsThinking: false, supportsMaxMode: false, supportsNonMaxMode: true, isHidden: false, isChatOnly: false, isLongContextOnly: false, parameterDefinitions: [], variants: [], idAliases: [], legacySlugs: [] },
  ], modelNames: ["gpt-5.6-terra", "gpt-5.6-luna"], useModelParameters: true };
  const answer = (pathname, body) => {
    switch (pathname) {
      case "/aiserver.v1.DashboardService/GetUserPrivacyMode": return [200, { privacyMode: 2, isEnforcedByTeam: false }];
      case "/aiserver.v1.AiService/AvailableModels": return [200, models];
      case "/aiserver.v1.BackgroundComposerService/StartBackgroundComposerFromSnapshot": {
        const text = body.conversationAction?.userMessageAction?.userMessage?.text ?? "";
        if (!body.bcId || !text) return [400, { code: "invalid_argument", message: "A cloud agent needs something to do." }];
        const agent = { bcId: body.bcId, name: body.name ?? "", repoUrl: body.repoUrl ?? "", prompt: text, status: 4, modelId: body.requestedModels?.[0]?.modelId ?? "", conversation: [{ text, type: 1, bubbleId: `${body.bcId}-0`, isAgentic: true, createdAt: "1" }] };
        agents.set(body.bcId, agent);
        return [200, { composer: composerOf(agent), initialRunId: "job-1", wasSwappedToDefault: false }];
      }
      case "/aiserver.v1.BackgroundComposerService/GetBackgroundComposerInfo": {
        const agent = agents.get(body.bcId);
        return agent ? [200, { composer: detailedOf(agent) }] : [404, { code: "not_found", message: `There is no cloud agent '${body.bcId}'.` }];
      }
      case "/aiserver.v1.BackgroundComposerService/ListBackgroundComposers": return [200, { composers: [...agents.values()].map(composerOf), didLoadStatus: true, hasMore: false, participants: [], pinnedBcIds: [], didLoadPinnedState: false }];
      case "/aiserver.v1.BackgroundComposerService/GetBackgroundComposerConversation": { const agent = agents.get(body.bcId); return agent ? [200, { conversation: agent.conversation }] : [404, { code: "not_found", message: "no" }]; }
      case "/aiserver.v1.BackgroundComposerService/GetPullRequestMergeStatus": return [200, { isMerged: false, isClosed: false, isDraft: false, state: "" }];
      case "/aiserver.v1.BackgroundComposerService/GetOptimizedDiffDetails": return [200, { diff: { diffs: [], diffType: 0 }, submoduleDiffs: [] }];
      case "/aiserver.v1.BackgroundComposerService/ListBackgroundComposerArtifacts": return [200, { artifacts: [] }];
      case "/aiserver.v1.BackgroundComposerService/ListEnvironments": return [200, { environments: [{ publicId: "simeon-computer", name: "Simeon's computer", repoConfig: { repos: [] }, createdAtMs: "0", updatedAtMs: "0" }] }];
      case "/aiserver.v1.BackgroundComposerService/AddAsyncFollowupBackgroundComposer": { const agent = agents.get(body.bcId); if (!agent) return [404, { code: "not_found", message: "no" }]; agent.conversation.push({ text: body.followupConversationAction?.userMessageAction?.userMessage?.text ?? "", type: 1, bubbleId: `${body.bcId}-${agent.conversation.length}`, isAgentic: true, createdAt: "3" }); return [200, { runId: "job-2" }]; }
      case "/aiserver.v1.BackgroundComposerService/PauseBackgroundComposer": case "/aiserver.v1.BackgroundComposerService/RenameBackgroundComposer": case "/aiserver.v1.BackgroundComposerService/ArchiveBackgroundComposer": case "/aiserver.v1.BackgroundComposerService/DeleteBackgroundComposer": return [200, {}];
      default: return [404, { code: "unimplemented", message: `${pathname} is not served by Simeon Labs' server.` }];
    }
  };
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = { notJson: raw }; }
      seen.push({ path: request.url, headers: request.headers, body });
      const [status, payload] = answer(request.url, body);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
  });
  return {
    agents, seen,
    finish(bcId, summary) { const agent = agents.get(bcId); agent.status = 2; agent.summary = summary; agent.conversation.push({ text: summary, type: 2, bubbleId: `${bcId}-r`, isAgentic: true, createdAt: "2" }); },
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("the manager launches, polls, lists, dumps and reads the catalogue through Simeon Labs' Connect surface", async () => {
  const fake = simeonServer();
  const baseUrl = await fake.listen();
  const previous = { backend: process.env.SAND_BACKEND_URL, served: process.env.SAND_CLOUD_AGENTS_SERVED, connect: process.env.SAND_CONNECT_SERVED };
  process.env.SAND_BACKEND_URL = baseUrl;
  delete process.env.SAND_CLOUD_AGENTS_SERVED;
  delete process.env.SAND_CONNECT_SERVED;
  const service = await load("source/host/extensions/cloud-agents/cloud-agents-service.ts", "cloud-agents-service");
  const trace = await load("source/packages/agent-transcript/trace-format.ts", "trace-format");
  try {
    const { SandCloudAgentManager } = service.module;
    const { convertConversationMessagesToTrace, HistoryVisibilityMode } = trace.module;
    const manager = new SandCloudAgentManager({
      getCursorAccessToken: async () => "claidor_da_test",
      getMachineId: async () => "machine-1",
      completionPolling: { start: () => ({ dispose() {} }) },
      clock: { monotonicNow: () => Date.now() },
      convertConversationMessagesToTrace: (conversation) => convertConversationMessagesToTrace(conversation, HistoryVisibilityMode.NO_PREAMBLE),
    });

    const launched = await manager.launch({ prompt: "Summarise the README.", repoUrl: "simeonlabs/demo", startingRef: "main", title: "Readme summary", modelId: "gpt-5.6-terra" });
    assert.match(launched.bcId, /^bc-[0-9a-f-]{36}$/);
    assert.equal(launched.url, `https://app.simeonlabs.com/agents/${launched.bcId}`, "the card's link is Simeon's page, not cursor.com");
    const start = fake.seen.find((entry) => entry.path.endsWith("/StartBackgroundComposerFromSnapshot"));
    assert.ok(start, "the launch reached the server");
    assert.equal(start.headers.authorization, "Bearer claidor_da_test");
    assert.equal(start.headers["x-cursor-client-type"], "sand");
    assert.equal(start.body.bcId, launched.bcId);
    assert.equal(start.body.repoUrl, "https://github.com/simeonlabs/demo");
    assert.equal(start.body.baseBranch, "main");
    assert.equal(start.body.name, "Readme summary");
    assert.equal(start.body.conversationAction.userMessageAction.userMessage.text, "Summarise the README.");
    assert.deepEqual(start.body.requestedModels.map((model) => model.modelId), ["gpt-5.6-terra"]);
    assert.ok(fake.seen.some((entry) => entry.path.endsWith("/GetUserPrivacyMode")), "the privacy pre-flight went to our DashboardService");

    let info = await manager.getInfo(launched.bcId);
    assert.deepEqual(info, { bcId: launched.bcId, status: "creating", name: "Readme summary", prompt: "Summarise the README.", branchName: "", prUrl: "", prState: "none", prNumber: null, filesChanged: 0, linesAdded: 0, linesRemoved: 0, files: [] });

    fake.finish(launched.bcId, "The README says hello.");
    info = await manager.getInfo(launched.bcId, false);
    assert.equal(info.status, "finished");
    assert.equal(info.prState, "none", "no PR shape reads as none");
    const detail = await manager.get(launched.bcId);
    assert.equal(detail.status, "finished");
    assert.equal(detail.url, launched.url);
    assert.equal(detail.error, null);

    assert.equal(await manager.getInfo("bc-nobody"), null, "a not_found answer reads as null, the way the card's provider expects");

    const listed = await manager.list();
    assert.deepEqual(listed.map((row) => [row.bcId, row.status, row.name, row.isArchived]), [[launched.bcId, "finished", "Readme summary", false]]);

    const dump = await manager.getTranscriptDump({ bcId: launched.bcId });
    assert.equal(dump.status, "finished");
    assert.equal(dump.lineCount, 2);
    const lines = dump.jsonl.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(lines, [{ role: "user", text: "Summarise the README." }, { role: "assistant", text: "The README says hello." }]);

    const reply = await manager.reply({ bcId: launched.bcId, prompt: "And the LICENSE?" });
    assert.equal(reply.runId, "job-2");
    const followup = fake.seen.find((entry) => entry.path.endsWith("/AddAsyncFollowupBackgroundComposer"));
    assert.equal(followup.body.followupConversationAction.userMessageAction.userMessage.text, "And the LICENSE?");
    // Protobuf JSON leaves a default (false) field out, so the server reads an absent `synchronous` as not interrupting.
    assert.notEqual(followup.body.synchronous, true);

    const catalogue = await manager.listModels();
    assert.deepEqual(catalogue.map((entry) => [entry.id, entry.displayName, entry.aliases]), [["gpt-5.6-terra", "GPT-5.6 Terra", []], ["gpt-5.6-luna", "GPT-5.6 Luna", []]]);

    await manager.cancel(launched.bcId);
    await manager.rename(launched.bcId, "Renamed");
    await manager.setArchived(launched.bcId, true);
    assert.deepEqual(await manager.listArtifacts(launched.bcId), []);
    await manager.delete(launched.bcId);
    const paths = fake.seen.map((entry) => entry.path.split("/").pop());
    for (const method of ["PauseBackgroundComposer", "RenameBackgroundComposer", "ArchiveBackgroundComposer", "ListBackgroundComposerArtifacts", "DeleteBackgroundComposer"]) assert.ok(paths.includes(method), method);
    manager.dispose();
  } finally {
    for (const [key, value] of [["SAND_BACKEND_URL", previous.backend], ["SAND_CLOUD_AGENTS_SERVED", previous.served], ["SAND_CONNECT_SERVED", previous.connect]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await service.dispose();
    await trace.dispose();
    await fake.close();
  }
});

test("the brief and the app say Simeon where Grok Bot said Cursor, and the card opens Simeon's page", async () => {
  delete process.env.SAND_CLOUD_AGENTS_SERVED;
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt-served");
  try {
    const enabled = module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: true });
    assert.doesNotMatch(enabled, /cursor\.com/);
    assert.doesNotMatch(enabled, /## Origin/);
    assert.match(enabled, /## Repositories/);
    assert.match(enabled, /Simeon's cloud runner/);
    assert.match(enabled, /does not check the repository out, push a branch or open a pull request yet/);
    assert.doesNotMatch(enabled, /mobile-ios-mac/, "no self-hosted pool is offered");
    assert.match(enabled, /"type":"environment","name":"Simeon's computer"/);
    assert.match(enabled, /CloudAgent tool \(action "launch"\)/, "Grok Bot's structure is kept");
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /## Repositories/, "served by default");
  } finally {
    await dispose();
  }
  const availability = await load("source/shared/cloud-agents-availability.ts", "availability-served");
  try {
    assert.equal(availability.module.isCloudAgentsServed({}), true);
    assert.equal(availability.module.cloudAgentWebUrl("bc-1"), "https://app.simeonlabs.com/agents/bc-1");
    assert.equal(availability.module.cloudAgentWebUrl("bc-1", { SAND_CLOUD_AGENTS_WEB_BASE: "https://simeon.test" }), "https://simeon.test/agents/bc-1");
  } finally {
    await availability.dispose();
  }
  assert.match(await src("electron-main/main-edge.ts"), /openCloudAgent: async \(raw\) => \{[^\n]*cloudAgentWebUrl\(bcId\)/);
  assert.doesNotMatch(await src("electron-main/main-edge.ts"), /https:\/\/cursor\.com/);
  for (const file of ["host/extensions/cloud-agents/cloud-agents-service.ts", "host/extensions/cloud-agents/cloud-agent-poll-loop.ts", "host/cloud-agents/cloud-agent-tool.ts", "shared/channel-messaging.ts", "packages/agent/prompts/cloud/no-repository-access.ts"]) {
    assert.ok(!(await src(file)).includes("cursor.com"), `${file} names no cursor.com`);
  }
  assert.match(await src("shared/cloud-agents-availability.ts"), /Cloud agents are served/);
});
