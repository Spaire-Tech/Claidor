/**
 * A turn does not wait for its connectors (16 October 2026).
 *
 * The founder's log on the cloud computer: before each answer the engine
 * asked every installed connector for its tools, about 1.8 s for each one
 * not signed in and 3 s for one that was, and the turn waited for all of
 * them. What it waited for, the snapshot of connected connectors, is only
 * read by the next turn's prompt: this turn's prompt is built first.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (name) => readFile(path.join(repoRoot, "source", name), "utf8");

test("the prompt is built before the turn asks for its tools", async () => {
  const owner = await src("host/runner/production-turn-agent-owner.ts");
  const body = owner.slice(owner.indexOf("export async function createProductionTurnAgentRunInput"));
  assert.ok(body.indexOf("assembleGeneratedTurnAction(") > 0);
  assert.ok(body.indexOf("assembleGeneratedTurnAction(") < body.indexOf("createTurnAgentRunInputProjection("));
});

test("the connector snapshot is refreshed in the background, one refresh at a time", async () => {
  const composition = await src("host/host-runner-composition.ts");
  const getTools = composition.slice(composition.indexOf("getTools: async (runContext: Context) =>"));
  const block = getTools.slice(0, getTools.indexOf("refreshAccountConfig"));
  assert.match(block, /void refreshMcpTurnSnapshot\(false\)/);
  assert.match(block, /void refreshMcpTurnSnapshot\(true\)/);
  assert.doesNotMatch(block, /await refreshMcpTurnSnapshot/);
  const refresh = composition.slice(composition.indexOf("const refreshMcpTurnSnapshot"));
  assert.match(refresh.slice(0, 300), /if \(mcpTurnSnapshotRefreshing\) return;/);
  assert.match(refresh.slice(0, 1200), /finally \{\s*mcpTurnSnapshotRefreshing = false;/);
});
