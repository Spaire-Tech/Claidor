/**
 * The agent proposes a connector and the person sees a proposal card (25
 * September 2026; the founder: "i want Agent proposes a connector → user
 * sees a connector proposal card").
 *
 * The pinned 0.18.0 renderer's connector card offers Add when the named
 * service is in the catalogue and has no server row (recovered projection
 * `frontend/.../views/connector.tsx`, `actionLabel`), and shows the message's
 * `reason` under the name. What was missing was host-side: a way for the
 * agent to emit that card. ProposeConnector emits `{type: "connector",
 * variant: "propose", reason}` with no serverId; the brief tells the agent
 * to propose that way and never in text.
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
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const plugins = {
  notion: { pluginId: "notion", name: "notion", displayName: "Notion", description: "Pages and databases.", category: "Docs", isInstalled: false, connectorCount: 1, skills: [], fields: [], servers: [] },
  figma: { pluginId: "figma", name: "figma", displayName: "Figma", description: "Coming soon. Figma only admits MCP clients listed in its MCP Catalog.", category: "Creativity", isInstalled: false, comingSoon: true, connectorCount: 1, skills: [], fields: [], servers: [] },
  linear: { pluginId: "linear", name: "linear", displayName: "Linear", description: "Issues.", category: "Productivity", isInstalled: true, connectorCount: 1, skills: [], fields: [], servers: [{ id: "900001", serverIdentifier: "linear", name: "Linear", status: "needsAuth", accountKey: "default", transport: "http", toolCount: 0 }] },
  slack: { pluginId: "slack", name: "slack", displayName: "Slack", description: "Chat.", category: "Chat", isInstalled: true, connectorCount: 1, skills: [], fields: [], servers: [{ id: "900002", serverIdentifier: "slack", name: "Slack", status: "connected", accountKey: "default", transport: "http", toolCount: 12 }] },
};

let createContext;
async function run(tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  const result = await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" });
  return JSON.stringify(result);
}

test("ProposeConnector emits the proposal card, refuses a coming-soon service, and hands an installed one its connect card", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-mcp-management-tools.ts", "mcp-management-tools");
  const context = await load("source/packages/context/core.ts", "context-core");
  createContext = context.module.createContext;
  try {
    const cards = [];
    const deps = { listPlugins: async () => Object.values(plugins), getPlugin: async (id) => plugins[id] ?? null, install: async () => {}, listInstalled: async () => [] };
    const tools = module.createMcpManagementTools(deps, () => "a1", () => false, () => false, (card) => cards.push(card));
    const propose = tools.find((tool) => tool.name === "ProposeConnector");
    assert.ok(propose, "the tool is offered beside SearchPlugins");
    assert.match(propose.descriptionGenerator(), /never propose a connector in plain text or with a question widget/);

    const proposed = await run(propose, { plugin_id: "notion", reason: "to read the brief you mentioned" });
    assert.deepEqual(cards, [{ connector: "Notion", variant: "propose", reason: "to read the brief you mentioned" }], "a proposal names the service and the reason, and no server row");
    assert.match(proposed, /Proposed Notion \(plugin notion\)\. Its proposal card is now in the chat/);
    assert.match(proposed, /Do not install it yourself/);

    const comingSoon = await run(propose, { plugin_id: "figma", reason: "x" });
    assert.equal(cards.length, 1, "no card for a coming-soon service");
    assert.match(comingSoon, /Figma is coming soon and cannot be connected yet: Coming soon\./);

    await run(propose, { plugin_id: "linear", reason: "x" });
    assert.deepEqual(cards[1], { connector: "Linear", serverId: "900001", variant: "connect" }, "an installed service that needs a sign-in gets its connect card");
    const connected = await run(propose, { plugin_id: "slack", reason: "x" });
    assert.equal(cards.length, 2);
    assert.match(connected, /Slack is already installed and connected; use its tools/);
    assert.match(await run(propose, { plugin_id: "nope", reason: "x" }), /No plugin with id \\"nope\\"/);
  } finally {
    await context.dispose();
    await dispose();
  }
});

test("the proposal reaches the transcript as a connector card without a server id, and the brief proposes with it", async () => {
  const { module, dispose } = await load("source/host/runner/tools/box-help-tool.ts", "box-help-tool");
  try {
    assert.deepEqual(module.connectorCardEmissionToMessage({ connector: "Notion", variant: "propose", reason: "to read the brief" }), { type: "connector", connector: "Notion", variant: "propose", reason: "to read the brief" });
    assert.deepEqual(module.connectorCardEmissionToMessage({ connector: "Linear", serverId: "900001", variant: "connect" }), { type: "connector", connector: "Linear", serverId: "900001", variant: "connect" }, "the connect card is unchanged");
  } finally {
    await dispose();
  }
  const prompt = await src("host/runner/system-prompt.ts");
  assert.match(prompt, /propose it with ProposeConnector: the user sees a card with the service, your one-line reason and a Connect button/);
  assert.doesNotMatch(prompt, /name it in plain text and ask; once the user agrees, install it/);
});

// 15 October 2026: Simeon told the founder there was no Instagram connector
// and offered the computer's browser; the connector was in the catalogue all
// along. Every agent's brief names every connector, and no line names one as
// a service without a connector.
test("every agent's brief names every connector in Simeon's catalogue", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt");
  const catalogue = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-catalog");
  try {
    const brief = module.DEFAULT_SAND_SYSTEM_PROMPT;
    const offered = catalogue.module.VENDOR_MCP_CONNECTORS.filter((item) => item.comingSoon !== true);
    assert.ok(offered.length > 50, `the catalogue has its connectors: ${offered.length}`);
    for (const item of offered) assert.ok(brief.includes(item.name), `the brief names ${item.name}`);
    assert.match(brief, /never say there is no connector for it, and offer the connector before the box's browser/);
    assert.doesNotMatch(brief, /chat apps \([^)]*Instagram/, "Instagram is not given as a service without a connector");
    assert.doesNotMatch(brief, /an Add button/, "the card's button is Connect");
    assert.equal(module.SAND_SYSTEM_PROMPT_CLOUD_AGENTS_DISABLED.includes(module.SIMEON_CONNECTOR_NAMES), true, "the brief without cloud agents names them too");
  } finally {
    await dispose();
    await catalogue.dispose();
  }
});
