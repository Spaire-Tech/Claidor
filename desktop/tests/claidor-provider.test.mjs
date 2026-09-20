import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function responsesStream(text) {
  return sse([
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

function functionCallStream(name, args) {
  const item = { type: "function_call", id: "fc_1", call_id: "call_1", name, arguments: "" };
  return sse([
    { type: "response.created", response: { id: "resp_2", created_at: 1_700_000_001, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 0, delta: JSON.stringify(args) },
    { type: "response.output_item.done", output_index: 0, item: { ...item, arguments: JSON.stringify(args), status: "completed" } },
    { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ]);
}

test("claidor is a provider everywhere a provider is listed", async () => {
  const shared = await loadModule("source/shared/inference-router.ts", "shared-inference-router");
  const router = await loadModule("source/node-agent-coordinator/inference-router.ts", "coordinator-inference-router");
  try {
    assert.ok(shared.module.SAND_INFERENCE_PROVIDERS.includes("claidor"));
    assert.ok(shared.module.isSandInferenceProvider("claidor"));
    assert.deepEqual(Object.keys(shared.module.emptySandInferenceRouterUsage().providers).sort(), [...shared.module.SAND_INFERENCE_PROVIDERS].sort());

    // The second, independent list the brief warns about: stored history must
    // survive a reload for every local provider, claidor included.
    const store = router.module.parseInferenceRouterTranscriptStore({
      schemaVersion: 2,
      agents: { agent: shared.module.SAND_INFERENCE_PROVIDERS.filter((provider) => provider !== "cursor").map((provider, index) => ({
        provider, role: "user", content: `hello from ${provider}`, id: `t${index}u`, timestampMs: index,
      })) },
    });
    assert.deepEqual(store.agents.agent.map((entry) => entry.provider), shared.module.SAND_INFERENCE_PROVIDERS.filter((provider) => provider !== "cursor"));
  } finally {
    await shared.dispose();
    await router.dispose();
  }
});

test("claidor turns pass through to the host's full loop by default", async () => {
  const router = await loadModule("source/node-agent-coordinator/inference-router.ts", "coordinator-inference-router-switch");
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dataDir = path.join(router.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claidor" }));
    const events = [];
    const make = (env) => router.module.createCoordinatorInferenceRouter({
      dataDir, env, postEvent: (family, payload) => events.push({ family, payload }), dispatchRemote: async () => { throw new Error("box unreachable"); },
    });

    assert.equal(router.module.routesClaidorThroughHost({}), true);
    assert.equal(router.module.routesClaidorThroughHost({ SAND_CLAIDOR_FULL_AGENT: "1" }), true);
    assert.equal(router.module.routesClaidorThroughHost({ SAND_CLAIDOR_FULL_AGENT: "off" }), false);

    const passthrough = await make({}).dispatch("sendPrompt", { agentId: "a", prompt: "x" });
    assert.deepEqual(passthrough, { handled: false });
    const tail = await make({}).dispatch("getAgentTranscriptTail", { id: "a" });
    assert.deepEqual(tail, { handled: false });

    const local = await make({ SAND_CLAIDOR_FULL_AGENT: "off" }).dispatch("sendPrompt", { agentId: "a", prompt: "x" });
    assert.equal(local.handled, true);
    assert.equal(local.value.provider, "claidor");
    // The local turn runs in the background; with no credential source registered
    // in this bundle it settles as a router error. Wait for it before disposing.
    const deadline = Date.now() + 8_000;
    while (!events.some((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const settled = events.find((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message");
    assert.match(settled.payload.entry.message.content, /no signed-in credential source/);
  } finally {
    await router.dispose();
  }
});

test("a Claidor turn does not wait on a hung box", async () => {
  const router = await loadModule("source/node-agent-coordinator/inference-router.ts", "coordinator-inference-router-hung-box");
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dataDir = path.join(router.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claidor" }));
    const events = [];
    const hung = router.module.createCoordinatorInferenceRouter({
      dataDir,
      env: { SAND_CLAIDOR_FULL_AGENT: "off" },
      postEvent: (family, payload) => events.push({ family, payload }),
      dispatchRemote: () => new Promise(() => {}),
    });
    const started = Date.now();
    const local = await hung.dispatch("sendPrompt", { agentId: "a", prompt: "hello" });
    assert.equal(local.handled, true);
    assert.ok(Date.now() - started < 500, "admission must not wait on the box");
    const deadline = Date.now() + 8_000;
    while (!events.some((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const settled = events.find((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message");
    assert.match(settled.payload.entry.message.content, /no signed-in credential source/);
    assert.ok(Date.now() - started < 6_000, "a hung box must not stall the turn");
  } finally {
    await router.dispose();
  }
});

test("a Claidor host-loop send is admitted without waiting on the box", async () => {
  const router = await loadModule("source/node-agent-coordinator/inference-router.ts", "coordinator-inference-router-host-admit");
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dataDir = path.join(router.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claidor" }));
    const hung = router.module.createCoordinatorInferenceRouter({
      dataDir,
      env: {},
      postEvent: () => {},
      dispatchRemote: () => new Promise(() => {}),
    });
    const started = Date.now();
    const passthrough = await hung.dispatch("sendPrompt", { agentId: "a", prompt: "hello" });
    assert.deepEqual(passthrough, { handled: false });
    assert.ok(Date.now() - started < 500, "host-loop admission must not wait on the box");
  } finally {
    await router.dispose();
  }
});

test("the claidor provider speaks the Responses wire to our proxy with the signed-in token", async () => {
  const loaded = await loadModule("source/host/extensions/inference/provider-session.ts", "provider-session");
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const requests = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.claidor.com";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      requests.push({ url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
      return responsesStream("bonjour");
    };
    const { claidorProxyBaseUrl, configuredClaidorModel, setClaidorCredentialSource, runRoutedProviderText, DEFAULT_CLAIDOR_MODEL } = loaded.module;

    assert.equal(claidorProxyBaseUrl("https://api.claidor.com"), "https://api.claidor.com/desktop/api/proxy/v1");
    assert.equal(claidorProxyBaseUrl("https://api.claidor.com/"), "https://api.claidor.com/desktop/api/proxy/v1");
    assert.equal(configuredClaidorModel(), DEFAULT_CLAIDOR_MODEL);
    assert.equal(DEFAULT_CLAIDOR_MODEL, "gpt-5.6-terra");

    setClaidorCredentialSource(null);
    await assert.rejects(() => runRoutedProviderText("claidor", [{ role: "user", content: "hi" }]), /no signed-in credential source/);
    assert.deepEqual(requests, []);

    let minted = 0;
    setClaidorCredentialSource({ getAccessToken: async () => { minted += 1; return `claidor_da_token_${minted}`; } });
    const deltas = [];
    const text = await runRoutedProviderText("claidor", [{ role: "user", content: "say hello" }], { onTextDelta: (delta) => deltas.push(delta) });

    assert.equal(text, "bonjour");
    assert.equal(deltas.join(""), "bonjour");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.claidor.com/desktop/api/proxy/v1/responses");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_token_1");
    assert.equal(requests[0].body.model, "gpt-5.6-terra");
    assert.equal(requests[0].body.stream, true);
    assert.ok(JSON.stringify(requests[0].body.input).includes("say hello"));
    assert.equal(minted, 1);

    // A connector tool: the model asks for it, the router runs it, the model
    // answers with the result. Two requests, one tool execution, fresh token each.
    requests.length = 0;
    const executed = [];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      requests.push({ url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
      return requests.length === 1 ? functionCallStream("gmail_search", { query: "invoices" }) : responsesStream("3 invoices");
    };
    const toolText = await runRoutedProviderText("claidor", [{ role: "user", content: "any invoices?" }], {
      tools: [{ name: "gmail_search", providerIdentifier: "gmail", toolName: "search", description: "Search mail", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }],
      executeTool: async (definition, args, toolCallId) => { executed.push({ name: definition.name, args, toolCallId }); return { hits: 3 }; },
    });
    assert.equal(toolText, "3 invoices");
    assert.deepEqual(executed, [{ name: "gmail_search", args: { query: "invoices" }, toolCallId: "call_1" }]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.tools?.[0]?.name, "gmail_search");
    assert.equal(requests[0].body.tools?.[0]?.type, "function");
    const secondInput = JSON.stringify(requests[1].body.input);
    assert.ok(secondInput.includes("call_1"));
    assert.ok(secondInput.includes("\"hits\":3") || secondInput.includes("hits"));
    assert.equal(requests[1].headers.get("authorization"), "Bearer claidor_da_token_3");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
});

test("every connector wrapper between electron-main and the coordinator forwards the inference credential", async () => {
  const egress = await loadModule("source/electron-main/box/remote-connector-egress.ts", "remote-connector-egress");
  const pause = await loadModule("source/electron-main/box/box-client-pause.ts", "box-client-pause");
  try {
    const credential = { accessToken: "claidor_da_x", backendUrl: "https://api.claidor.com/", expiresAtMs: 1 };
    const base = { connect: async () => ({}), issueLocalExecDaemonCredential: async () => undefined, issueInferenceCredential: async () => credential };

    const observed = egress.module.createEgressConnectionObserver().wrap(base);
    assert.deepEqual(await observed.issueInferenceCredential(), credential);

    let paused = false;
    const guarded = pause.module.wrapRemoteHostConnectorWithClientPause(base, () => paused);
    assert.deepEqual(await guarded.issueInferenceCredential(), credential);
    paused = true;
    assert.equal(await guarded.issueInferenceCredential(), undefined);

    const without = egress.module.createEgressConnectionObserver().wrap({ connect: async () => ({}) });
    assert.equal(without.issueInferenceCredential, undefined);
  } finally {
    await egress.dispose();
    await pause.dispose();
  }
});

test("the product lock ignores stored providers and leftover Claude Code", async () => {
  const shared = await loadModule("source/shared/inference-router.ts", "product-inference-lock");
  const storeLoaded = await loadModule("source/shared/node/settings/sand-settings-store.ts", "settings-store-lock");
  const router = await loadModule("source/node-agent-coordinator/inference-router.ts", "coordinator-lock");
  const previousClaude = process.env.CAISRA_CLAUDE_CODE;
  const previousOverride = process.env.SAND_INFERENCE_PROVIDER;
  try {
    delete process.env.CAISRA_CLAUDE_CODE;
    delete process.env.SAND_INFERENCE_PROVIDER;

    const { resolveProductInferenceProvider, PRODUCT_INFERENCE_PROVIDER } = shared.module;
    assert.equal(PRODUCT_INFERENCE_PROVIDER, "claidor");
    assert.equal(resolveProductInferenceProvider({}), "claidor");
    assert.equal(resolveProductInferenceProvider({ CAISRA_CLAUDE_CODE: "1" }), "claidor");
    assert.equal(resolveProductInferenceProvider({ CAISRA_CLAUDE_CODE: "0", SAND_INFERENCE_PROVIDER: "openrouter" }), "claidor");
    assert.equal(resolveProductInferenceProvider({ SAND_INFERENCE_PROVIDER: "claude-code" }), "claidor");
    assert.equal(resolveProductInferenceProvider({ SAND_INFERENCE_PROVIDER: "cursor" }), "claidor");
    assert.equal(resolveProductInferenceProvider({ SAND_INFERENCE_PROVIDER: "not-a-provider" }), "claidor");

    const settingsPath = path.join(storeLoaded.dataDir, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ version: 1, inferenceProvider: "claude-code" }));
    const store = new storeLoaded.module.SandSettingsStore(settingsPath);
    assert.equal(store.getInferenceProvider(), "claidor");
    store.setInferenceProvider("openrouter");
    assert.equal(store.getInferenceProvider(), "claidor");
    assert.equal(JSON.parse(await readFile(settingsPath, "utf8")).inferenceProvider, "claidor");

    const dataDir = path.join(router.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claude-code" }));
    const created = router.module.createCoordinatorInferenceRouter({
      dataDir,
      env: {},
      postEvent: () => {},
      dispatchRemote: async () => { throw new Error("unused"); },
    });
    assert.equal(created.provider(), "claidor");
  } finally {
    if (previousClaude === undefined) delete process.env.CAISRA_CLAUDE_CODE;
    else process.env.CAISRA_CLAUDE_CODE = previousClaude;
    if (previousOverride === undefined) delete process.env.SAND_INFERENCE_PROVIDER;
    else process.env.SAND_INFERENCE_PROVIDER = previousOverride;
    await shared.dispose();
    await storeLoaded.dispose();
    await router.dispose();
  }
});
