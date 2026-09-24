import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry = "source/shared/node/cursor-backend/backend-mcp-exec.ts") {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "grok-backend-mcp-exec-"));
  const output = path.join(temporary, "backend-mcp-exec.mjs");
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("MCP discovery accepts both routed JSON and native generated values", async () => {
  const loaded = await loadModule("source/shared/node/mcp/mcp-validation.ts");
  try {
    assert.deepEqual(loaded.module.toJsonArgs({
      query: "in:inbox",
      pageSize: 1,
      native: { toJson: () => ({ retained: true }) },
    }), {
      query: "in:inbox",
      pageSize: 1,
      native: { retained: true },
    });
  } finally {
    await loaded.dispose();
  }
});

test("routed MCP JSON arguments become a protobuf Struct before backend serialization", async () => {
  const loaded = await loadModule();
  try {
    let captured;
    const backend = loaded.module.createDashboardSandBackendMcpExec({
      getAccessToken: async () => "unused",
      getMachineId: async () => "unused",
      createClient: () => ({
        executeSandMcpTool: async request => {
          captured = request;
          // This is the operation that failed in the real Connect serializer when
          // routed providers supplied a plain object instead of a Struct.
          assert.deepEqual(request.args.toJson(), { query: "in:inbox", pageSize: 1 });
          return { result: { result: { case: "success", value: { content: [] } } } };
        },
      }),
    });
    const result = await backend.executeTool({
      serverIdentifier: "user-Gmail",
      toolName: "search_threads",
      args: { query: "in:inbox", pageSize: 1 },
      toolCallId: "call-1",
      agentId: "agent-1",
    });
    assert.equal(result.result.case, "success");
    assert.equal(typeof captured.args.toBinary, "function");
  } finally {
    await loaded.dispose();
  }
});

test("MCP auth wait registry resumes by name even when registered with serverId", async () => {
  const loaded = await loadModule("source/host/mcp-auth/mcp-auth-wait-registry.ts");
  try {
    const registry = new loaded.module.McpAuthWaitRegistry({ now: () => 1_000 });
    registry.register({
      agentId: "agent-wait",
      connector: "Gmail",
      serverId: "42",
    });
    // Desktop OAuth completion sometimes reports a different id shape; name
    // match must still recover the agent that emitted the connect card.
    assert.equal(
      registry.take({ serverId: "999", serverName: "Gmail" }),
      "agent-wait",
    );
    assert.equal(registry.take({ serverId: "999", serverName: "Gmail" }), null);
  } finally {
    await loaded.dispose();
  }
});

test("MCP auth wait registry prefers serverId match when both are present", async () => {
  const loaded = await loadModule("source/host/mcp-auth/mcp-auth-wait-registry.ts");
  try {
    const registry = new loaded.module.McpAuthWaitRegistry({ now: () => 1_000 });
    registry.register({ agentId: "agent-a", connector: "Slack", serverId: "7" });
    registry.register({ agentId: "agent-b", connector: "Notion", serverId: "8" });
    assert.equal(registry.take({ serverId: "8", serverName: "Notion" }), "agent-b");
    assert.equal(registry.take({ serverId: "7", serverName: "Slack" }), "agent-a");
  } finally {
    await loaded.dispose();
  }
});

test("host MCP auth completion resumes via noteAuthCompletedElsewhere agent id", async () => {
  const loaded = await loadModule("source/host/mcp-auth/host-mcp-auth-completion.ts");
  try {
    const {
      HostMcpAuthCompletion,
      resolveMcpAuthResumeAgentId,
      CONNECTOR_CARD_TRIGGER_SENTINEL,
    } = loaded.module;

    assert.equal(
      resolveMcpAuthResumeAgentId({
        requestingAgentId: CONNECTOR_CARD_TRIGGER_SENTINEL,
        watchAgentId: "agent-from-watch",
        waitingAgentId: "agent-from-card",
      }),
      "agent-from-watch",
    );
    assert.equal(
      resolveMcpAuthResumeAgentId({
        requestingAgentId: null,
        watchAgentId: undefined,
        waitingAgentId: "agent-from-card",
      }),
      "agent-from-card",
    );

    const resumed = [];
    let notedArgs = null;
    const completion = new HostMcpAuthCompletion({
      getMcp: () => ({
        noteAuthCompletedElsewhere: (serverId, accountKey) => {
          notedArgs = { serverId, accountKey };
          return "agent-from-watch";
        },
        management: { restart: async () => {} },
      }),
      getTranscript: () => ({
        resumeAfterMcpAuth: async (agentId, serverName, accountKey) => {
          resumed.push({ agentId, serverName, accountKey });
        },
      }),
    });

    completion.resolve({
      serverId: "42",
      serverName: "Gmail",
      accountKey: "default",
      outcome: "ok",
      requestingAgentId: null,
    });

    assert.deepEqual(notedArgs, { serverId: "42", accountKey: "default" });
    assert.deepEqual(resumed, [
      { agentId: "agent-from-watch", serverName: "Gmail", accountKey: "default" },
    ]);
  } finally {
    await loaded.dispose();
  }
});

test("host MCP auth completion falls back to wait registry when watch returns void/null", async () => {
  const loaded = await loadModule("source/host/mcp-auth/host-mcp-auth-completion.ts");
  try {
    const { HostMcpAuthCompletion } = loaded.module;
    const resumed = [];
    const completion = new HostMcpAuthCompletion({
      getMcp: () => ({
        // Simulates the pre-fix mcp-service void contract / cleared watch.
        noteAuthCompletedElsewhere: () => undefined,
        management: { restart: async () => {} },
      }),
      getTranscript: () => ({
        resumeAfterMcpAuth: async (agentId, serverName, accountKey) => {
          resumed.push({ agentId, serverName, accountKey });
        },
      }),
    });
    completion.registerConnectCard({
      agentId: "agent-card",
      connector: "GitHub",
      serverId: "9",
    });
    completion.resolve({
      serverId: "9",
      serverName: "GitHub",
      accountKey: "work",
      outcome: "ok",
    });
    assert.deepEqual(resumed, [
      { agentId: "agent-card", serverName: "GitHub", accountKey: "work" },
    ]);
  } finally {
    await loaded.dispose();
  }
});
