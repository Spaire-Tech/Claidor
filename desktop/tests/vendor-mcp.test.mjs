import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
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
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the store is vendor MCPs that can Connect, then Coming soon for the rest", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-catalog");
  try {
    const {
      VENDOR_MCP_CONNECTORS,
      vendorMcpConnectorById,
      isVendorMcpPluginId,
      isVendorMcpComingSoon,
    } = loaded.module;
    // 28 September 2026: the eighteen Coming soon cards are apps Simeon Labs' server serves (`appsToolkit`), and thirteen more were appended.
    assert.equal(VENDOR_MCP_CONNECTORS.length, 52);
    const ids = VENDOR_MCP_CONNECTORS.map((item) => item.id);
    assert.equal(new Set(ids).size, 52);
    const vendors = VENDOR_MCP_CONNECTORS.filter((item) => item.appsToolkit == null);
    const apps = VENDOR_MCP_CONNECTORS.filter((item) => item.appsToolkit != null);
    assert.equal(vendors.length, 21);
    assert.equal(apps.length, 31);
    assert.equal(VENDOR_MCP_CONNECTORS.some((item) => item.comingSoon === true), false);
    assert.ok(VENDOR_MCP_CONNECTORS.every((item) => typeof item.url === "string" && item.url.startsWith("https://")));
    assert.ok(apps.every((item) => item.url.endsWith(`/desktop/api/apps/mcp/${item.appsToolkit}`)));
    assert.ok(vendors.every((item) => !item.url.includes("/desktop/api/apps/")));
    assert.equal(ids.indexOf("wix"), 17, "a connector's server id is its place in the list; nothing before the end moves");
    assert.equal(vendorMcpConnectorById("notion")?.url, "https://mcp.notion.com/mcp");
    assert.equal(isVendorMcpPluginId("gmail"), true);
    assert.equal(isVendorMcpComingSoon("gmail"), false);
    assert.equal(isVendorMcpComingSoon("notion"), false);
    assert.equal(vendorMcpConnectorById("slack")?.appsToolkit, "slack");
    assert.equal(vendorMcpConnectorById("github")?.appsToolkit, "github");
    assert.equal(isVendorMcpPluginId("999"), false);
    assert.equal(VENDOR_MCP_CONNECTORS.some((item) => /fathom|mercury|composio/i.test(`${item.id} ${item.name}`)), false);
  } finally {
    await loaded.dispose();
  }
});

test("the marketplace listing is our store, including Coming soon cards", async () => {
  const marketplace = await load("source/shared/node/vendor-mcp/marketplace.ts", "vendor-marketplace");
  const views = await load("source/shared/node/mcp/mcp-marketplace-view.ts", "mcp-marketplace-view");
  try {
    const notion = marketplace.module.vendorConnectorToPlugin({
      id: "notion",
      name: "Notion",
      category: "Files & Docs",
      description: "Search, read, and write pages and databases.",
      url: "https://mcp.notion.com/mcp",
    });
    assert.equal(notion.pluginId, "notion");
    assert.equal(notion.vendorMcpUrl, "https://mcp.notion.com/mcp");
    assert.equal(notion.comingSoon, undefined);
    assert.equal(notion.variableFields.length, 0);

    const gmail = marketplace.module.vendorConnectorToPlugin({
      id: "gmail",
      name: "Gmail",
      category: "Mail & Calendar",
      description: "Coming soon. Google needs an app we register first.",
      comingSoon: true,
    });
    assert.equal(gmail.comingSoon, true);
    assert.equal(gmail.vendorMcpUrl, undefined);

    const signedOut = await marketplace.module.fetchVendorMarketplacePlugins(async () => null);
    assert.equal(signedOut.plugins.length, 52);
    assert.equal(signedOut.includesPrivateMarketplaces, false);
    assert.ok(signedOut.plugins.some((plugin) => plugin.pluginId === "notion" && plugin.vendorMcpUrl === "https://mcp.notion.com/mcp"));
    // Signed out, the server cannot be asked: an app stays Coming soon, with no address.
    const outGmail = signedOut.plugins.find((plugin) => plugin.pluginId === "gmail");
    assert.equal(outGmail.comingSoon, true);
    assert.equal(outGmail.vendorMcpUrl, undefined);

    // A server that does not serve apps (not deployed, no key): Coming soon, and the vendors are untouched.
    const unserved = await marketplace.module.fetchVendorMarketplacePlugins(async () => "simeon_da_test", undefined, { appsAvailable: async () => false });
    const soonGmail = unserved.plugins.find((plugin) => plugin.pluginId === "gmail");
    assert.equal(soonGmail.comingSoon, true);
    assert.equal(soonGmail.vendorMcpUrl, undefined);
    assert.match(soonGmail.description, /^Coming soon\. /);
    assert.ok(unserved.plugins.some((plugin) => plugin.pluginId === "notion" && plugin.vendorMcpUrl === "https://mcp.notion.com/mcp" && plugin.comingSoon == null));

    const signedIn = await marketplace.module.fetchVendorMarketplacePlugins(async () => "simeon_da_test", undefined, { appsAvailable: async () => true });
    assert.equal(signedIn.includesPrivateMarketplaces, true);
    assert.ok(signedIn.plugins.some((plugin) => plugin.pluginId === "gmail" && plugin.comingSoon == null && plugin.vendorMcpUrl.endsWith("/desktop/api/apps/mcp/gmail")));
    assert.equal(signedIn.plugins.find((plugin) => plugin.pluginId === "gmail").homepage, undefined);

    const view = views.module.marketplacePluginToView(signedIn.plugins.find((plugin) => plugin.pluginId === "gmail"));
    assert.equal(view.id, "gmail");
    assert.equal(view.comingSoon, undefined);
    assert.equal(view.displayName, "Gmail");
    assert.match(view.iconUrl, /^data:image\//);
    const notionView = views.module.marketplacePluginToView(signedIn.plugins.find((plugin) => plugin.pluginId === "notion"));
    assert.match(notionView.iconUrl, /^data:image\//);
    assert.ok(signedIn.plugins.every((plugin) => typeof plugin.logoUrl === "string" && plugin.logoUrl.length > 0));
  } finally {
    await marketplace.dispose();
    await views.dispose();
  }
});

test("connected vendor installs become enabled user plugins; Coming soon never does", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/marketplace.ts", "vendor-effective");
  try {
    const connected = await loaded.module.fetchVendorEffectivePlugins(new Set(["notion", "gmail", "unknown-app"]));
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["gmail", "notion"]);
    assert.equal(connected[0].isEnabled, true);
    assert.equal(connected[0].installMode, "user");
    assert.deepEqual(await loaded.module.fetchVendorEffectivePlugins(new Set()), []);
  } finally {
    await loaded.dispose();
  }
});

test("vendor installs persist under the sand root", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs");
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-vendor-root-"));
  try {
    const { loadVendorMcpInstalls, upsertVendorMcpInstall, removeVendorMcpInstall, vendorMcpInstallsPath } = loaded.module;
    assert.deepEqual(loadVendorMcpInstalls(root), []);
    upsertVendorMcpInstall(root, { id: "notion", url: "https://mcp.notion.com/mcp", connected: false });
    upsertVendorMcpInstall(root, { id: "linear", url: "https://mcp.linear.app/mcp", connected: true });
    upsertVendorMcpInstall(root, { id: "notion", url: "https://mcp.notion.com/mcp", connected: true });
    const saved = loadVendorMcpInstalls(root);
    assert.deepEqual(saved.map((item) => item.id).toSorted(), ["linear", "notion"]);
    assert.equal(saved.find((item) => item.id === "notion")?.connected, true);
    assert.equal(removeVendorMcpInstall(root, "linear"), true);
    assert.equal(removeVendorMcpInstall(root, "linear"), false);
    assert.deepEqual(loadVendorMcpInstalls(root).map((item) => item.id), ["notion"]);
    const written = JSON.parse(await readFile(vendorMcpInstallsPath(root), "utf8"));
    assert.equal(written[0].id, "notion");
  } finally {
    await loaded.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("vendor OAuth discovers the issuer, registers Simeon, and opens the vendor page", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/oauth.ts", "vendor-oauth");
  try {
    const { protectedResourceUrls, startVendorMcpOAuth, connectThroughVendorMcp } = loaded.module;
    assert.deepEqual(protectedResourceUrls("https://mcp.notion.com/mcp"), [
      "https://mcp.notion.com/.well-known/oauth-protected-resource/mcp",
      "https://mcp.notion.com/.well-known/oauth-protected-resource",
    ]);

    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
      if (String(url).includes("oauth-protected-resource")) {
        return json({ authorization_servers: ["https://auth.notion.com"] });
      }
      if (String(url).includes("oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://auth.notion.com/authorize",
          token_endpoint: "https://auth.notion.com/token",
          registration_endpoint: "https://auth.notion.com/register",
        });
      }
      if (String(url).endsWith("/register")) {
        return json({ client_id: "simeon-client" });
      }
      return json({ error: "unexpected" }, 500);
    };

    const started = await startVendorMcpOAuth({
      pluginId: "notion",
      mcpUrl: "https://mcp.notion.com/mcp",
      fetch: fetchImpl,
    });
    assert.match(started.authorizationUrl, /^https:\/\/auth\.notion\.com\/authorize\?/);
    assert.match(started.authorizationUrl, /client_id=simeon-client/);
    assert.match(started.authorizationUrl, /code_challenge=/);
    assert.equal(started.pending.pluginId, "notion");
    assert.equal(started.pending.clientId, "simeon-client");
    assert.equal(JSON.parse(calls.find((call) => call.method === "POST").body).client_name, "Simeon");

    const noDcr = async (url) => {
      if (String(url).includes("oauth-protected-resource")) {
        return json({ authorization_servers: ["https://slack.com"] });
      }
      return json({
        authorization_endpoint: "https://slack.com/oauth/v2/authorize",
        token_endpoint: "https://slack.com/api/oauth.v2.access",
      });
    };
    await assert.rejects(
      () => startVendorMcpOAuth({ pluginId: "slack", mcpUrl: "https://mcp.slack.com/mcp", fetch: noDcr }),
      /coming soon/i,
    );

    const opened = [];
    assert.equal(
      await connectThroughVendorMcp({
        pluginId: "notion",
        mcpUrl: "https://mcp.notion.com/mcp",
        fetch: fetchImpl,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
      "started",
    );
    assert.equal(opened.length, 1);
    await assert.rejects(
      () => connectThroughVendorMcp({ pluginId: "notion", mcpUrl: "https://mcp.notion.com/mcp" }),
      /Plugins overlay/,
    );
  } finally {
    await loaded.dispose();
  }
});

test("getCatalog lists our store; live Connect goes to the vendor, Coming soon does not", async () => {
  const loaded = await load("source/shared/node/mcp/mcp-catalog-flow.ts", "vendor-catalog-flow");
  const marketplace = await load("source/shared/node/vendor-mcp/marketplace.ts", "vendor-catalog-flow-market");
  const served = (available) => (token, machine) => marketplace.module.fetchVendorMarketplacePlugins(token, machine, { appsAvailable: async () => available });
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
      connectVendorMcp: async (plugin) => {
        connected.push(plugin);
      },
      fetchMarketplace: served(true),
    });

    const views = await flow.getCatalog(async () => "simeon_da_test");
    assert.equal(views.length, 52);
    assert.ok(views.some((view) => view.id === "notion" && view.vendorMcpUrl === "https://mcp.notion.com/mcp"));
    assert.ok(views.some((view) => view.id === "gmail" && view.comingSoon == null && view.vendorMcpUrl.endsWith("/desktop/api/apps/mcp/gmail")));
    assert.equal(views.some((view) => view.comingSoon === true), false);

    await flow.installEntry({ entryId: "notion" }, async () => "simeon_da_test");
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion"]);
    assert.deepEqual(installs, []);

    await flow.installEntry({ entryId: "gmail" }, async () => "simeon_da_test");
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion", "gmail"]);

    // A server that does not serve apps: the app card refuses Connect as Coming soon; a vendor still connects.
    const unserved = new loaded.module.SandMcpCatalogFlow({
      getMachineId: async () => "machine",
      requireAccountWriter: () => ({ installPlugin: async () => {} }),
      reloadServers: async () => ({ servers: [] }),
      bestEffortToken: async (token) => (typeof token === "function" ? token() : null),
      connectVendorMcp: async (plugin) => { connected.push(plugin); },
      fetchMarketplace: served(false),
    });
    const soonViews = await unserved.getCatalog(async () => "simeon_da_test");
    assert.ok(soonViews.some((view) => view.id === "gmail" && view.comingSoon === true));
    await assert.rejects(() => unserved.installEntry({ entryId: "gmail" }, async () => "simeon_da_test"), /coming soon/i);
    await unserved.installEntry({ entryId: "linear" }, async () => "simeon_da_test");
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion", "gmail", "linear"]);

    const missing = new loaded.module.SandMcpCatalogFlow({
      getMachineId: async () => "machine",
      requireAccountWriter: () => ({
        installPlugin: async (request) => {
          installs.push(request);
        },
      }),
      reloadServers: async () => ({ servers: [] }),
      bestEffortToken: async () => "token",
      fetchMarketplace: served(false),
    });
    await missing.getCatalog(async () => "token");
    await assert.rejects(() => missing.installEntry({ entryId: "notion" }, async () => "token"), /Plugins overlay/);
  } finally {
    await loaded.dispose();
    await marketplace.dispose();
  }
});

test("every store card has a logo, and in-repo data marks skip a network fetch", async () => {
  const marketplace = await load("source/shared/node/vendor-mcp/marketplace.ts", "vendor-logos");
  try {
    const listing = await marketplace.module.fetchVendorMarketplacePlugins();
    assert.equal(listing.plugins.length, 52);
    assert.ok(listing.plugins.every((plugin) => typeof plugin.logoUrl === "string" && plugin.logoUrl.length > 0));
    const notion = listing.plugins.find((plugin) => plugin.pluginId === "notion");
    assert.match(notion.logoUrl, /^data:image\//);
    const slack = listing.plugins.find((plugin) => plugin.pluginId === "slack");
    assert.match(slack.logoUrl, /^data:image\//);
    const linear = listing.plugins.find((plugin) => plugin.pluginId === "linear");
    assert.match(linear.logoUrl, /^https:\/\/www\.google\.com\/s2\/favicons\?/);
    const resolver = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/shared/node/mcp/mcp-marketplace-logo.ts"),
      "utf8",
    );
    assert.match(resolver, /parsed\.protocol === "data:" && url\.startsWith\("data:image\/"\)/);
  } finally {
    await marketplace.dispose();
  }
});

test("the apps service is asked once a minute, and only a clear yes offers Connect (28 September 2026)", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/apps-availability.ts", "apps-availability");
  try {
    const answers = { yes: () => Response.json({ available: true }), off: () => Response.json({ available: false }), missing: () => Response.json({ detail: "Not Found" }, { status: 404 }), down: () => { throw new TypeError("fetch failed"); } };
    for (const [name, expected] of [["yes", true], ["off", false], ["missing", false], ["down", false]]) {
      module.resetAppsAvailabilityCache();
      const seen = [];
      const fetch = async (url, init) => { seen.push([url, init.headers.authorization]); return answers[name](); };
      assert.equal(await module.isAppsServiceAvailable({ getAccessToken: async () => "tok", backendUrl: "https://api.simeonlabs.com", fetch }), expected, name);
      assert.deepEqual(seen, [["https://api.simeonlabs.com/desktop/api/apps", "Bearer tok"]]);
    }
    module.resetAppsAvailabilityCache();
    let calls = 0;
    const fetch = async () => { calls += 1; return Response.json({ available: true }); };
    let now = 0;
    const ask = () => module.isAppsServiceAvailable({ getAccessToken: async () => "tok", backendUrl: "https://api.simeonlabs.com", fetch, now: () => now });
    await ask(); await ask();
    assert.equal(calls, 1, "cached");
    now = 61_000;
    await ask();
    assert.equal(calls, 2, "asked again after a minute");
    module.resetAppsAvailabilityCache();
    assert.equal(await module.isAppsServiceAvailable({ getAccessToken: async () => null, backendUrl: "https://api.simeonlabs.com", fetch }), false, "signed out is never available");
  } finally {
    await dispose();
  }
});
