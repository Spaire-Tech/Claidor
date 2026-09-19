import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the curated catalog is forty-three verified Composio slugs", async () => {
  const loaded = await load("source/shared/node/composio/catalog.ts", "composio-catalog");
  try {
    const { COMPOSIO_CONNECTORS, composioConnectorById, composioConnectorByToolkit, isComposioPluginId } = loaded.module;
    assert.equal(COMPOSIO_CONNECTORS.length, 43);
    const ids = COMPOSIO_CONNECTORS.map((item) => item.id);
    const toolkits = COMPOSIO_CONNECTORS.map((item) => item.toolkit);
    assert.equal(new Set(ids).size, 43);
    assert.equal(new Set(toolkits).size, 43);
    assert.ok(COMPOSIO_CONNECTORS.every((item) => item.id.length > 0 && item.toolkit.length > 0 && item.name.length > 0));
    assert.equal(COMPOSIO_CONNECTORS.some((item) => /fathom|mercury/i.test(`${item.id} ${item.toolkit} ${item.name}`)), false);
    assert.equal(composioConnectorById("gmail")?.toolkit, "gmail");
    assert.equal(composioConnectorByToolkit("googlecalendar")?.id, "google-calendar");
    assert.equal(composioConnectorByToolkit("GOOGLECALENDAR")?.name, "Google Calendar");
    assert.equal(isComposioPluginId("gmail"), true);
    assert.equal(isComposioPluginId("999"), false);
  } finally {
    await loaded.dispose();
  }
});

test("the marketplace listing is the static Composio catalog, not Cursor", async () => {
  const marketplace = await load("source/shared/node/composio/marketplace.ts", "composio-marketplace");
  const listing = await load("source/shared/node/mcp/mcp-marketplace.ts", "mcp-marketplace");
  try {
    const gmail = marketplace.module.composioConnectorToPlugin({
      id: "gmail",
      name: "Gmail",
      toolkit: "gmail",
      category: "Mail & Calendar",
      description: "Search, read, draft, and manage email.",
    });
    assert.equal(gmail.pluginId, "gmail");
    assert.equal(gmail.composioToolkit, "gmail");
    assert.equal(gmail.variableFields.length, 0);

    const signedOut = await marketplace.module.fetchComposioMarketplacePlugins(async () => null);
    assert.equal(signedOut.plugins.length, 43);
    assert.equal(signedOut.includesPrivateMarketplaces, false);
    assert.ok(signedOut.plugins.every((plugin) => typeof plugin.composioToolkit === "string"));

    const signedIn = await marketplace.module.fetchComposioMarketplacePlugins(async () => "claidor_da_test");
    assert.equal(signedIn.includesPrivateMarketplaces, true);

    const throughDefault = await listing.module.fetchMarketplaceMcpPlugins(async () => "token");
    assert.equal(throughDefault.plugins.length, 43);
    assert.equal(throughDefault.plugins.find((plugin) => plugin.pluginId === "gmail")?.composioToolkit, "gmail");
    assert.equal(throughDefault.includesPrivateMarketplaces, true);

    const view = listing.module.marketplacePluginToView(throughDefault.plugins.find((plugin) => plugin.pluginId === "notion"));
    assert.equal(view.id, "notion");
    assert.equal(view.composioToolkit, "notion");
    assert.equal(view.displayName, "Notion");
  } finally {
    await marketplace.dispose();
    await listing.dispose();
  }
});

test("connected toolkits become enabled user plugins, and a 503 degrades to none", async () => {
  const loaded = await load("source/shared/node/composio/marketplace.ts", "composio-effective");
  try {
    const connected = await loaded.module.fetchComposioEffectivePlugins({
      listToolkitState: async () => [
        { toolkit: "gmail", connected: true },
        { toolkit: "notion", connected: false },
        { toolkit: "unknown-app", connected: true },
      ],
    });
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["gmail"]);
    assert.equal(connected[0].isEnabled, true);
    assert.equal(connected[0].installMode, "user");

    const empty = await loaded.module.fetchComposioEffectivePlugins({
      listToolkitState: async () => {
        throw new Error("Apps are not switched on for this server yet.");
      },
    });
    assert.deepEqual(empty, []);
  } finally {
    await loaded.dispose();
  }
});

test("the Claidor Composio client talks session, link, toolkits, and disconnect", async () => {
  const loaded = await load("source/shared/node/composio/composio-api.ts", "composio-api");
  const urls = await load("source/shared/node/cursor-backend/claidor-api.ts", "claidor-api");
  try {
    assert.equal(
      urls.module.claidorComposioUrl("api/v3.1/tool_router/session", "https://api.claidor.com/"),
      "https://api.claidor.com/desktop/api/proxy/composio/api/v3.1/tool_router/session",
    );
    assert.equal(loaded.module.composioFailureMessage(401), "You are signed out. Sign in again to connect apps.");
    assert.equal(loaded.module.composioFailureMessage(503), "Apps are not switched on for this server yet.");
    assert.equal(loaded.module.toolkitForPluginId("google-calendar"), "googlecalendar");
    assert.equal(loaded.module.toolkitForPluginId("999"), undefined);

    const calls = [];
    const api = loaded.module.createComposioApi({
      getAccessToken: async () => "claidor_da_test",
      backendUrl: "https://api.claidor.com/",
      fetch: async (url, init) => {
        calls.push({ url: String(url), method: init.method, body: init.body });
        if (String(url).endsWith("/tool_router/session") && init.method === "POST") {
          return json({ session_id: "sess_1" });
        }
        if (String(url).includes("/toolkits") && init.method === "GET") {
          return json({
            items: [
              { slug: "gmail", connected_account: { id: "ca_1", status: "ACTIVE" } },
              { slug: "notion", connected_account: null },
            ],
          });
        }
        if (String(url).endsWith("/link") && init.method === "POST") {
          return json({ redirect_url: "https://connect.composio.dev/gmail" });
        }
        if (String(url).includes("/connected_accounts/ca_1") && init.method === "DELETE") {
          return json({});
        }
        return json({ error: { message: `unexpected ${init.method} ${url}` } }, 500);
      },
    });

    assert.equal(await api.authorizationUrl("Gmail"), "https://connect.composio.dev/gmail");
    const states = await api.listToolkitState();
    assert.deepEqual(states, [
      { toolkit: "gmail", connected: true, connectedAccountId: "ca_1" },
      { toolkit: "notion", connected: false },
    ]);
    assert.equal((await api.toolkitState("gmail")).connected, true);
    assert.equal((await api.toolkitState("dropbox")).connected, false);
    assert.equal(await api.disconnect("gmail"), true);
    assert.equal(calls.some((call) => call.method === "DELETE" && call.url.includes("connected_accounts/ca_1")), true);
    assert.equal(JSON.parse(calls[0].body).user_id, "default");

    const signedOut = loaded.module.createComposioApi({
      getAccessToken: async () => null,
      backendUrl: "https://api.claidor.com/",
      fetch: async () => {
        throw new Error("fetch should not run while signed out");
      },
    });
    await assert.rejects(() => signedOut.listToolkitState(), /signed out/i);

    const unavailable = loaded.module.createComposioApi({
      getAccessToken: async () => "token",
      backendUrl: "https://api.claidor.com/",
      fetch: async () => json({ error: { message: "missing key" } }, 503),
    });
    await assert.rejects(() => unavailable.listToolkitState(), /not switched on/i);
  } finally {
    await loaded.dispose();
    await urls.dispose();
  }
});

test("connect opens the Composio link and polls until the toolkit is live", async () => {
  const loaded = await load("source/shared/node/composio/composio-api.ts", "composio-connect");
  try {
    const opened = [];
    let connected = false;
    const api = {
      toolkitState: async () => ({ toolkit: "gmail", connected }),
      authorizationUrl: async (toolkit) => `https://connect.example/${toolkit}`,
    };
    assert.equal(
      await loaded.module.connectThroughComposio("gmail", {
        api: { ...api, toolkitState: async () => ({ toolkit: "gmail", connected: true }) },
      }),
      "already-authenticated",
    );
    await assert.rejects(
      () => loaded.module.connectThroughComposio("gmail", { api }),
      /Plugins overlay/,
    );

    const connecting = loaded.module.connectThroughComposio("gmail", {
      api,
      openExternal: async (url) => {
        opened.push(url);
        connected = true;
      },
      wait: async () => {},
      pollIntervalMs: 1,
      timeoutMs: 50,
    });
    assert.equal(await connecting, "connected");
    assert.deepEqual(opened, ["https://connect.example/gmail"]);
  } finally {
    await loaded.dispose();
  }
});

test("getCatalog lists Composio cards and install talks to Composio, not Cursor BigInt ids", async () => {
  const loaded = await load("source/shared/node/mcp/mcp-catalog-flow.ts", "composio-catalog-flow");
  try {
    const connected = [];
    const installs = [];
    const flow = new loaded.module.SandMcpCatalogFlow({
      getMachineId: async () => "machine",
      requireAccountWriter: () => ({
        installPlugin: async (request) => {
          installs.push(request);
        },
      }),
      reloadServers: async () => ({ servers: [] }),
      bestEffortToken: async (token) => (typeof token === "function" ? token() : null),
      connectComposioToolkit: async (toolkit) => {
        connected.push(toolkit);
      },
    });

    const views = await flow.getCatalog(async () => "claidor_da_test");
    assert.equal(views.length, 43);
    assert.ok(views.some((view) => view.id === "gmail" && view.composioToolkit === "gmail"));
    assert.ok(views.some((view) => view.id === "linkedin"));
    assert.deepEqual([...views].map((view) => view.displayName), [...views].map((view) => view.displayName).toSorted((a, b) => a.localeCompare(b)));

    await flow.installEntry({ entryId: "gmail" }, async () => "claidor_da_test");
    assert.deepEqual(connected, ["gmail"]);
    assert.deepEqual(installs, []);

    const missing = new loaded.module.SandMcpCatalogFlow({
      getMachineId: async () => "machine",
      requireAccountWriter: () => ({
        installPlugin: async (request) => {
          installs.push(request);
        },
      }),
      reloadServers: async () => ({ servers: [] }),
      bestEffortToken: async () => "token",
    });
    await missing.getCatalog(async () => "token");
    await assert.rejects(() => missing.installEntry({ entryId: "gmail" }, async () => "token"), /needs Composio/);
  } finally {
    await loaded.dispose();
  }
});
