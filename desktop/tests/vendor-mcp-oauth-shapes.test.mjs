/**
 * What the vendors actually advertise, measured 24 September 2026 (evening)
 * against every live connector's metadata: fifteen take a self-registered
 * public client (the flow as built); Airtable, monday.com and Stripe publish
 * their metadata at the RFC 8414 path form our discovery never tried; Miro,
 * Vercel, Supabase and monday.com take no public client, only one with a
 * secret; Asana has no registration endpoint; Figma's registration answers
 * 403 to every client not on its MCP Catalog. This file pins the flow to
 * those shapes.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A vendor whose issuer carries a path, takes only client_secret_post, and names one scope on the resource. */
function pathVendor(calls) {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const raw = init?.body == null ? null : typeof init.body === "string" ? init.body : init.body.toString();
    const body = raw != null && raw.startsWith("{") ? JSON.parse(raw) : null;
    const form = raw != null && !raw.startsWith("{") ? Object.fromEntries(new URLSearchParams(raw)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body, form });
    if (url === "https://mcp.example.com/.well-known/oauth-protected-resource/mcp") return json({ resource: "https://mcp.example.com/mcp", authorization_servers: ["https://auth.example.com/oauth2/v1"], scopes_supported: ["mcp:connect"] });
    if (url === "https://auth.example.com/.well-known/oauth-authorization-server/oauth2/v1") return json({ issuer: "https://auth.example.com/oauth2/v1", authorization_endpoint: "https://auth.example.com/authorize", token_endpoint: "https://auth.example.com/token", registration_endpoint: "https://auth.example.com/register", token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] });
    if (url === "https://auth.example.com/register") return json({ client_id: "cid-1", client_secret: "shh" }, 201);
    if (url === "https://auth.example.com/token") return json({ access_token: "tok-1", refresh_token: "ref-1", expires_in: 3600 });
    return new Response("not found", { status: 404 });
  };
}

test("metadata is found at the RFC 8414 path form, a confidential client is registered when no public one is allowed, and the resource's scope is asked for", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/oauth.ts", "vendor-oauth-shapes");
  try {
    assert.deepEqual(module.authorizationServerMetadataUrls("https://airtable.com/oauth2/v1"), [
      "https://airtable.com/.well-known/oauth-authorization-server/oauth2/v1",
      "https://airtable.com/oauth2/v1/.well-known/oauth-authorization-server",
      "https://airtable.com/.well-known/openid-configuration/oauth2/v1",
      "https://airtable.com/oauth2/v1/.well-known/openid-configuration",
    ]);
    assert.deepEqual(module.authorizationServerMetadataUrls("https://mcp.notion.com"), [
      "https://mcp.notion.com/.well-known/oauth-authorization-server",
      "https://mcp.notion.com/.well-known/openid-configuration",
    ]);
    assert.equal(module.registrationAuthMethod({ token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"] }), "none");
    assert.equal(module.registrationAuthMethod({}), "none", "a vendor that names no method takes a public client");
    assert.equal(module.registrationAuthMethod({ token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] }), "client_secret_post");
    assert.equal(module.registrationAuthMethod({ token_endpoint_auth_methods_supported: ["private_key_jwt"] }), null);

    const calls = [];
    const started = await module.startVendorMcpOAuth({ pluginId: "example", mcpUrl: "https://mcp.example.com/mcp", redirectUri: "http://localhost:8787/callback", fetch: pathVendor(calls), remember: false });
    const registration = calls.find((call) => call.url === "https://auth.example.com/register");
    assert.equal(registration.body.token_endpoint_auth_method, "client_secret_post");
    assert.equal(registration.body.scope, "mcp:connect");
    assert.deepEqual(registration.body.grant_types, ["authorization_code", "refresh_token"]);
    assert.equal(started.pending.clientId, "cid-1");
    assert.equal(started.pending.clientSecret, "shh");
    const authorize = new URL(started.authorizationUrl);
    assert.equal(authorize.searchParams.get("scope"), "mcp:connect");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorize.searchParams.get("state").startsWith("vendor-example-"));

    const grant = await module.exchangeVendorMcpCode({ pending: started.pending, code: "code-1", fetch: pathVendor(calls), now: 1_000 });
    const exchange = calls.filter((call) => call.url === "https://auth.example.com/token").at(-1);
    assert.equal(exchange.form.client_secret, "shh", "a confidential client sends its secret at the token endpoint");
    assert.equal(exchange.form.code_verifier, started.pending.verifier);
    assert.equal(grant.clientSecret, "shh", "and keeps it for the refresh");
    const refreshed = await module.refreshVendorMcpGrant({ grant, fetch: pathVendor(calls), now: 2_000 });
    const refresh = calls.filter((call) => call.url === "https://auth.example.com/token").at(-1);
    assert.equal(refresh.form.grant_type, "refresh_token");
    assert.equal(refresh.form.client_secret, "shh");
    assert.equal(refreshed.accessToken, "tok-1");
  } finally {
    await dispose();
  }
});

test("an app we registered by hand skips dynamic registration and signs in as a public client under our name", async () => {
  // Dropbox, 24 September 2026: its registration endpoint answers every
  // client with the one shared id `ydww2fwnzkxganl` and echoes `client_name`
  // back, yet the consent page says "Self host app (Unknown agent)". Only an
  // app from its App Console carries the name Simeon, so the catalog can
  // hold that app's key and the flow must never call /register with it.
  const { module, dispose } = await load("source/shared/node/vendor-mcp/oauth.ts", "vendor-oauth-own-app");
  try {
    const calls = [];
    const dropbox = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push(url);
      if (url === "https://mcp.dropbox.example/.well-known/oauth-protected-resource/mcp") return json({ resource: "https://mcp.dropbox.example/mcp", authorization_servers: ["https://www.dropbox.example"], scopes_supported: ["files.metadata.read", "files.content.read"] });
      if (url === "https://www.dropbox.example/.well-known/oauth-authorization-server") return json({ issuer: "https://www.dropbox.example", authorization_endpoint: "https://www.dropbox.example/oauth2/authorize", token_endpoint: "https://api.dropbox.example/oauth2/token", registration_endpoint: "https://www.dropbox.example/oauth2/register", token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"] });
      if (url === "https://api.dropbox.example/oauth2/token") return json({ access_token: "tok", refresh_token: "ref", expires_in: 14400 });
      return new Response("not found", { status: 404 });
    };
    const started = await module.startVendorMcpOAuth({ pluginId: "dropbox", mcpUrl: "https://mcp.dropbox.example/mcp", clientId: "simeonappkey", fetch: dropbox, remember: false });
    assert.ok(!calls.some((url) => url.endsWith("/oauth2/register")), "no dynamic registration with our own app");
    assert.equal(started.pending.clientId, "simeonappkey");
    assert.equal(started.pending.clientSecret, undefined, "a public client: no secret ships in the app");
    const authorize = new URL(started.authorizationUrl);
    assert.equal(authorize.searchParams.get("client_id"), "simeonappkey");
    assert.equal(authorize.searchParams.get("scope"), "files.metadata.read files.content.read");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const grant = await module.exchangeVendorMcpCode({ pending: started.pending, code: "c", fetch: dropbox, now: 0 });
    assert.equal(grant.clientId, "simeonappkey");
    assert.equal(grant.accessToken, "tok");
  } finally {
    await dispose();
  }
});

test("the catalog's own-app keys are pinned to the connectors that carry them", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-catalog-own-app");
  try {
    const withKey = module.VENDOR_MCP_CONNECTORS.filter((connector) => typeof connector.clientId === "string");
    for (const connector of withKey) {
      assert.equal(connector.comingSoon, undefined, `${connector.id}: an own app is a live connector`);
      assert.equal(typeof connector.url, "string", `${connector.id}: an own app needs the vendor's MCP url`);
      assert.ok(connector.clientId.length > 0, `${connector.id}: an empty key would be sent as a client id`);
    }
  } finally {
    await dispose();
  }
});

test("a registration the vendor refuses names the status in the error, and a vendor with neither method is 'an app we register first'", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/oauth.ts", "vendor-oauth-refusal");
  try {
    const refusing = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/.well-known/oauth-protected-resource/mcp")) return json({ authorization_servers: ["https://api.figma.example"], scopes_supported: ["mcp:connect"] });
      if (url === "https://api.figma.example/.well-known/oauth-authorization-server") return json({ authorization_endpoint: "https://www.figma.example/oauth/mcp", token_endpoint: "https://api.figma.example/v1/oauth/token", registration_endpoint: "https://api.figma.example/v1/oauth/mcp/register", token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] });
      if (url.endsWith("/register")) return new Response("Forbidden", { status: 403, headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    };
    await assert.rejects(
      () => module.startVendorMcpOAuth({ pluginId: "figma", mcpUrl: "https://mcp.figma.example/mcp", fetch: refusing, remember: false }),
      /Could not register Simeon with the vendor for figma \(403 Forbidden\)/,
    );
    const jwtOnly = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/.well-known/oauth-protected-resource/mcp")) return json({ authorization_servers: ["https://auth.only.example"] });
      if (url === "https://auth.only.example/.well-known/oauth-authorization-server") return json({ authorization_endpoint: "https://auth.only.example/a", token_endpoint: "https://auth.only.example/t", registration_endpoint: "https://auth.only.example/r", token_endpoint_auth_methods_supported: ["private_key_jwt"] });
      return new Response("", { status: 404 });
    };
    await assert.rejects(() => module.startVendorMcpOAuth({ pluginId: "only", mcpUrl: "https://mcp.only.example/mcp", fetch: jwtOnly, remember: false }), /needs an app we register first/);
  } finally {
    await dispose();
  }
});

test("Figma and Asana are coming soon with the reason, and the Mac writes every sign-in outcome to vendor-mcp-signin.log", async () => {
  const catalog = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-catalog-soon");
  const backend = await load("source/shared/node/vendor-mcp/backend-exec.ts", "vendor-backend-log");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-signin-log-"));
  try {
    const figma = catalog.module.vendorMcpConnectorById("figma");
    assert.equal(figma.comingSoon, true);
    assert.match(figma.description, /MCP Catalog/);
    assert.equal(catalog.module.vendorMcpConnectorById("asana").comingSoon, true);
    const exec = backend.module.createVendorMcpBackendExec({ rootDir: () => root, fetch: async () => new Response("", { status: 404 }), canStartAuth: true, now: () => 1_700_000_000_000 });
    const status = await exec.checkAuthStatus({ serverId: exec.serverIdForPlugin("figma"), accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.equal(status.isAvailable, false);
    assert.match(status.error, /Figma only admits MCP clients listed in its MCP Catalog/);
    const log = await readFile(path.join(root, "vendor-mcp-signin.log"), "utf8");
    assert.match(log, /^2023-11-14T22:13:20\.000Z figma sign-in refused: Coming soon\. Figma only admits MCP clients/m);
  } finally {
    await rm(root, { recursive: true, force: true });
    await catalog.dispose();
    await backend.dispose();
  }
});
