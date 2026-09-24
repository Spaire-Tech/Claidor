/**
 * Seats run on routes (24 September 2026): a route is the job a teammate does,
 * and it decides the model and the reasoning effort of every turn on that
 * agent. Simeon picks one when it creates a teammate (CreateAgent `route`),
 * the person can change it (UpdateAgent `route`, or the profile file), and a
 * turn with no route runs exactly as before routes existed.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the route table names three jobs, each a tier and an effort, and looks up leniently", async () => {
  const { module, dispose } = await load("source/shared/agents/model-routes.ts", "routes");
  try {
    const { SAND_MODEL_ROUTES, SAND_MODEL_ROUTE_IDS, findSandModelRoute, describeSandModelRoutes } = module;
    assert.deepEqual(SAND_MODEL_ROUTE_IDS, ["frontier", "everyday", "quick"]);
    for (const route of SAND_MODEL_ROUTES) {
      assert.ok(["primary", "cheap"].includes(route.tier), route.id);
      assert.ok(["minimal", "low", "medium", "high"].includes(route.effort), route.id);
      assert.ok(route.description.length > 20, route.id);
    }
    assert.equal(findSandModelRoute("frontier").effort, "high");
    assert.equal(findSandModelRoute(" Quick ").tier, "cheap");
    assert.equal(findSandModelRoute(""), undefined);
    assert.equal(findSandModelRoute(undefined), undefined);
    assert.equal(findSandModelRoute("astra"), undefined);
    for (const id of SAND_MODEL_ROUTE_IDS) assert.match(describeSandModelRoutes(), new RegExp(`"${id}": `));
  } finally {
    await dispose();
  }
});

test("a route resolves to Terra or Luna and its own effort; no route leaves the executor's defaults alone", async () => {
  const saved = { model: process.env.SAND_CLAIDOR_MODEL, cheap: process.env.SAND_CLAIDOR_CHEAP_MODEL };
  delete process.env.SAND_CLAIDOR_MODEL;
  delete process.env.SAND_CLAIDOR_CHEAP_MODEL;
  const { module, dispose } = await load("source/host/extensions/inference/provider-session.ts", "provider-session");
  try {
    const { claidorSessionForRoute, claidorReasoningEffortForSession, claidorModelForSession, createProviderPromptSession } = module;
    assert.deepEqual(claidorSessionForRoute("frontier"), { modelId: "gpt-5.6-terra", reasoningEffort: "high" });
    assert.deepEqual(claidorSessionForRoute("everyday"), { modelId: "gpt-5.6-terra", reasoningEffort: "medium" });
    assert.deepEqual(claidorSessionForRoute("quick"), { modelId: "gpt-5.6-luna", reasoningEffort: "low" });
    assert.equal(claidorSessionForRoute(""), undefined);
    assert.equal(claidorSessionForRoute(undefined), undefined);
    assert.equal(claidorSessionForRoute("nope"), undefined);

    // The explicit effort wins over the role's default; an unknown value does not.
    assert.equal(claidorReasoningEffortForSession({ reasoningEffort: "medium" }, {}), "medium");
    assert.equal(claidorReasoningEffortForSession({ reasoningEffort: "low" }, {}), "low");
    assert.equal(claidorReasoningEffortForSession({ reasoningEffort: "bogus" }, {}), "high");
    assert.equal(claidorReasoningEffortForSession({}, {}), "high");
    assert.equal(claidorReasoningEffortForSession({ cheap: true }, {}), "low");

    // The route's model and effort arrive on the wire through the same session options the turn shell builds.
    const quick = claidorSessionForRoute("quick");
    assert.equal(claidorModelForSession({ modelId: quick.modelId }), "gpt-5.6-luna");
    assert.equal(createProviderPromptSession("claidor", { modelId: quick.modelId, reasoningEffort: quick.reasoningEffort }).getModelId(), "gpt-5.6-luna");

    // The environment's model override still flows through a route.
    process.env.SAND_CLAIDOR_CHEAP_MODEL = "gpt-5.6-luna-next";
    assert.equal(claidorSessionForRoute("quick").modelId, "gpt-5.6-luna-next");
  } finally {
    if (saved.model === undefined) delete process.env.SAND_CLAIDOR_MODEL; else process.env.SAND_CLAIDOR_MODEL = saved.model;
    if (saved.cheap === undefined) delete process.env.SAND_CLAIDOR_CHEAP_MODEL; else process.env.SAND_CLAIDOR_CHEAP_MODEL = saved.cheap;
    await dispose();
  }
});

test("the profile file carries the route, lower-cased, and an old file without one reads as the default", async () => {
  const { module, dispose } = await load("source/host/agents/agent-profile.ts", "agent-profile");
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-profile-route-"));
  try {
    const { writeSandProfileFile, readSandProfileFile } = module;
    const file = path.join(dir, "profile.json");
    writeSandProfileFile(file, { name: "Claude · research", description: "", title: "", avatarShape: "", avatarColor: "", modelRoute: " Frontier " });
    assert.equal(JSON.parse(await readFile(file, "utf8")).modelRoute, "frontier");
    assert.equal(readSandProfileFile(file).modelRoute, "frontier");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, JSON.stringify({ name: "Old", description: "", title: "", avatarShape: "", avatarColor: "" }));
    assert.equal(readSandProfileFile(file).modelRoute, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

test("CreateAgent and UpdateAgent take a route and hand it to the host; the turn reads it off the seat", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-agent-management-tools.ts", "agent-tools");
  try {
    const { createAgentParameters, updateAgentParameters } = module;
    assert.equal(createAgentParameters.parse({ name: "R", route: "quick" }).route, "quick");
    assert.equal(createAgentParameters.parse({ name: "R" }).route, undefined);
    assert.throws(() => createAgentParameters.parse({ name: "R", route: "astra" }));
    assert.equal(updateAgentParameters.parse({ agent_id: "a", route: "everyday" }).route, "everyday");
    const description = createAgentParameters.shape.route.description;
    assert.match(description, /"frontier": /);
    assert.match(description, /"quick": /);
  } finally {
    await dispose();
  }
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /claidorSessionForRoute\(hooks\.agentProfileProvider\?\.\(\)\?\.modelRoute\)/);
  assert.match(composition, /modelId: routed\.modelId, reasoningEffort: routed\.reasoningEffort/);
  assert.match(composition, /input\.route === undefined \? \{\} : \{ modelRoute: input\.route \}/);
  assert.match(composition, /patch\.route === undefined \? \{\} : \{ modelRoute: patch\.route \}/);
  const shell = await readFile(path.join(repoRoot, "source/host/runner/turn-run-shell.ts"), "utf8");
  assert.match(shell, /reasoningEffort: input\.reasoningEffort/);
  const watch = await readFile(path.join(repoRoot, "source/host/extensions/transcript/profile-watch.ts"), "utf8");
  assert.match(watch, /modelRoute: profile\?\.modelRoute \?\? ""/);
});
