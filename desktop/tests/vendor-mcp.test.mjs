import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

test("the store is vendor MCPs that can Connect, then Coming soon for the rest", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-catalog");
  try {
    const {
      VENDOR_MCP_CONNECTORS,
      vendorMcpConnectorById,
      isVendorMcpPluginId,
      isVendorMcpComingSoon,
    } = loaded.module;
    assert.equal(VENDOR_MCP_CONNECTORS.length, 39);
    const ids = VENDOR_MCP_CONNECTORS.map((item) => item.id);
    assert.equal(new Set(ids).size, 39);
    const live = VENDOR_MCP_CONNECTORS.filter((item) => item.comingSoon !== true);
    const soon = VENDOR_MCP_CONNECTORS.filter((item) => item.comingSoon === true);
    // 24 September (evening): Figma (MCP Catalog allowlist) and Asana (no registration endpoint) moved to coming soon.
    assert.equal(live.length, 21);
    assert.equal(soon.length, 18);
    assert.ok(live.every((item) => typeof item.url === "string" && item.url.startsWith("https://")));
    assert.ok(soon.every((item) => item.url == null));
    assert.equal(vendorMcpConnectorById("notion")?.url, "https://mcp.notion.com/mcp");
    assert.equal(isVendorMcpPluginId("gmail"), true);
    assert.equal(isVendorMcpComingSoon("gmail"), true);
    assert.equal(isVendorMcpComingSoon("notion"), false);
    assert.equal(isVendorMcpComingSoon("slack"), true);
    assert.equal(isVendorMcpComingSoon("github"), true);
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
    assert.equal(signedOut.plugins.length, 39);
    assert.equal(signedOut.includesPrivateMarketplaces, false);
    assert.ok(signedOut.plugins.some((plugin) => plugin.pluginId === "notion" && plugin.vendorMcpUrl === "https://mcp.notion.com/mcp"));
    assert.ok(signedOut.plugins.some((plugin) => plugin.pluginId === "gmail" && plugin.comingSoon === true));

    const signedIn = await marketplace.module.fetchVendorMarketplacePlugins(async () => "claidor_da_test");
    assert.equal(signedIn.includesPrivateMarketplaces, true);

    const view = views.module.marketplacePluginToView(signedIn.plugins.find((plugin) => plugin.pluginId === "gmail"));
    assert.equal(view.id, "gmail");
    assert.equal(view.comingSoon, true);
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
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion"]);
    assert.equal(connected[0].isEnabled, true);
    assert.equal(connected[0].installMode, "user");
    assert.deepEqual(await loaded.module.fetchVendorEffectivePlugins(new Set()), []);
  } finally {
    await loaded.dispose();
  }
});

test("vendor installs persist under the sand root", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-root-"));
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
        return json({ client_id: "caisra-client" });
      }
      return json({ error: "unexpected" }, 500);
    };

    const started = await startVendorMcpOAuth({
      pluginId: "notion",
      mcpUrl: "https://mcp.notion.com/mcp",
      fetch: fetchImpl,
    });
    assert.match(started.authorizationUrl, /^https:\/\/auth\.notion\.com\/authorize\?/);
    assert.match(started.authorizationUrl, /client_id=caisra-client/);
    assert.match(started.authorizationUrl, /code_challenge=/);
    assert.equal(started.pending.pluginId, "notion");
    assert.equal(started.pending.clientId, "caisra-client");
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
    });

    const views = await flow.getCatalog(async () => "claidor_da_test");
    assert.equal(views.length, 39);
    assert.ok(views.some((view) => view.id === "notion" && view.vendorMcpUrl === "https://mcp.notion.com/mcp"));
    assert.ok(views.some((view) => view.id === "gmail" && view.comingSoon === true));
    assert.ok(views.some((view) => view.id === "linkedin" && view.comingSoon === true));
    const names = views.map((view) => view.displayName);
    const firstSoon = names.indexOf("Gmail");
    const lastLive = names.lastIndexOf("Wix");
    assert.ok(firstSoon > lastLive, "Coming soon cards belong after the live shelf");

    await flow.installEntry({ entryId: "notion" }, async () => "claidor_da_test");
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion"]);
    assert.deepEqual(installs, []);

    await assert.rejects(
      () => flow.installEntry({ entryId: "gmail" }, async () => "claidor_da_test"),
      /coming soon/i,
    );
    assert.deepEqual(connected.map((plugin) => plugin.pluginId), ["notion"]);

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
    await assert.rejects(() => missing.installEntry({ entryId: "notion" }, async () => "token"), /Plugins overlay/);
  } finally {
    await loaded.dispose();
  }
});

test("every store card has a logo, and in-repo data marks skip a network fetch", async () => {
  const marketplace = await load("source/shared/node/vendor-mcp/marketplace.ts", "vendor-logos");
  try {
    const listing = await marketplace.module.fetchVendorMarketplacePlugins();
    assert.equal(listing.plugins.length, 39);
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
