/**
 * A connected connector can be called (26 September 2026).
 *
 * On a Mac, Notion connected through its card and the agent then said it
 * "didn't have the Notion write command available". The brief tells it to
 * read a tool with GetMcpTools and call it with CallMcpTool
 * (`system-prompt.ts`), and the reconstruction builds both
 * (`createTurnMcpMetaToolFactory`) plus the executors they run through
 * (`createTurnLocalResourceProjection`), but nothing ever supplied the
 * per-turn MCP projection, so no turn offered either tool (the box log's
 * `offered=` list had InstallPlugin and AuthenticateMcpServer and neither).
 *
 * Offline: the real tools handoff offers the pair when the turn carries the
 * projection, binds their descriptors to the loop's turn-start snapshot, and
 * offers neither without it; the composition supplies the projection from
 * the MCP service and the owner hands it to the turn.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = path.join(repoRoot, `.tmp-connector-tools-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/connector-tools-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const MODES = { hostShell: "shadow", boxShell: "shadow", mcp: "shadow", computer: "shadow", automationWrite: "off", cloudAgent: "shadow", subagentLaunch: "shadow" };

function projection(seen) {
  return {
    mcpForTurn: { createExecutor: () => ({ execute: async () => { throw new Error("not called"); } }), createStateExecutor: () => ({ execute: async () => { throw new Error("not called"); } }) },
    persistImage: undefined,
    textSpiller: undefined,
    isSubagentRunner: false,
    beginObservation: () => () => {},
    boundedConnectorTag: (id) => id,
    mcpErrorClassOf: () => "Error",
    takeMcpExecErrorClass: () => undefined,
    emitConnectorCard: () => {},
    cancelThisRun: () => {},
    reportDiagnostic: () => {},
    errorLogTag: () => "Error",
    mcpMeta: { getMcpTools: () => { seen.push("static"); return []; }, callOptions: {} },
  };
}

function agentTools(module, turnExtras, propsExtras) {
  const turn = { autoReviewModes: MODES, ...turnExtras };
  const props = { resourceAccessor: { get: () => undefined }, ...propsExtras };
  const toolHost = module.createProductionTurnToolsetHost({
    turn,
    props,
    factoryProvider: { createWebSearchToolInputs: () => ({ dependencies: { search: async () => ({ results: [] }) } }) },
    isSubagentRunner: false,
    isSharedRoomRunner: false,
    isBoxScopedSubagent: false,
    isComputerUseSubagent: false,
    isBrowserUseSubagent: false,
    isSystemPromptOverridden: false,
    remoteBoxHasDesktop: false,
    getConversationId: () => "agent-1",
    getRemoteBoxAvailable: () => false,
    cloudAgentsDisabledByTeam: () => false,
    spotlightEnabled: () => false,
  });
  const handoff = module.createTurnAgentToolsHandoff({ toolHost, turn });
  return handoff.toolsGenerator(props).getAllTools().map((tool) => tool.name).sort();
}

test("a turn carrying the MCP projection offers GetMcpTools and CallMcpTool; one without offers neither", async () => {
  const { module, dispose } = await load();
  try {
    const seen = [];
    const snapshot = [{ providerIdentifier: "notion", name: "notion-create-pages", toolName: "notion-create-pages", description: "Create pages", inputSchema: { type: "object", properties: {} } }];
    const withMcp = agentTools(module, { mcp: projection(seen) }, { mcpTools: snapshot });
    assert.ok(withMcp.includes("GetMcpTools"), withMcp.join(","));
    assert.ok(withMcp.includes("CallMcpTool"), withMcp.join(","));
    // The descriptors come from the loop's own turn-start snapshot, not the
    // composition's placeholder.
    assert.deepEqual(seen, []);

    const without = agentTools(module, {}, { mcpTools: snapshot });
    assert.equal(without.includes("GetMcpTools"), false);
    assert.equal(without.includes("CallMcpTool"), false);
  } finally {
    await dispose();
  }
});

test("the composition supplies the MCP service's projection and the owner hands it to the turn", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /const productionTurnMcpProjection = \(\): TurnMcpProjectionInput \| undefined => \{/);
  assert.match(composition, /const createExecutor = method\(service \?\? \{\}, "createExecutor"\);/);
  assert.match(composition, /const projection = productionTurnMcpProjection\(\);\n\s*return projection === undefined \? \{\} : \{ mcp: projection \};/);
  const owner = await readFile(path.join(repoRoot, "source/host/runner/production-turn-agent-owner.ts"), "utf8");
  assert.match(owner, /\.\.\.\(projectionInput\.mcp === undefined \? \{\} : \{ mcp: projectionInput\.mcp \}\),/);
  const service = await readFile(path.join(repoRoot, "source/host/extensions/mcp/mcp-service.ts"), "utf8");
  assert.match(service, /createExecutor: \(persistImage: unknown, spillLargeText: unknown, auditIdentity: unknown\) => new SandMcpExecutor\(/);
  assert.match(service, /createStateExecutor: \(\) => createSandMcpStateExecutor\(/);
});
