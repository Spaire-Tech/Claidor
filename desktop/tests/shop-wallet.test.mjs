/**
 * Shop (14 October 2026, the founder: "build the whole shop integration.
 * make sure its the exact flow as link"): the Shop MCP client and its
 * device sign-in, the agents' Shop tools, the checkout card's Shop steps
 * (a spend request approved in the Shop app, as Link's; a Shop checkout
 * paid at Allow), and the "shop" app on the cloud computer. Shop is faked
 * here with the shapes measured against https://mcp.shop.com/ and
 * https://accounts.shop.app that day (tools/list, a search, a checkout made
 * signed out); its signed-in answers (an account, a spend request, a paid
 * checkout) follow Shop's own docs and skill, never yet seen live.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(tool, args) {
  const context = await load("source/packages/context/core.ts", `context-${Math.random().toString(36).slice(2)}`);
  try {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.module.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  } finally {
    await context.dispose();
  }
}

const until = async (check, what) => {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const SPEND_ID = "0199e63b-1234-7abc-8def-123456789abc";
const CARD_ID = "3f1e2d4c-5b6a-4789-8abc-def012345678";
const OTHER_CARD_ID = "4a2e2d4c-5b6a-4789-9abc-def012345679";

/** Shop's account, as `get_account` gives it (Shop's docs: addresses, preferred, cards, budget). */
const ACCOUNT = {
  buyer: { first_name: "Ada", last_name: "Lovelace", email: "a***@example.com" },
  addresses: [{ id: "addr-1", first_name: "Ada", last_name: "Lovelace", street_address: "1 Example Way", address_locality: "Seattle", address_region: "WA", postal_code: "98101", address_country: "US" }],
  preferred_address_id: "addr-1",
  selectable_instruments: [
    { id: CARD_ID, display: { brand: "visa", last_digits: "4242", description: "Chase Sapphire" } },
    { id: OTHER_CARD_ID, display: { brand: "mastercard", last_digits: "1005" } },
  ],
  preferred_instrument_id: CARD_ID,
  payment: { instruments: [{ limit: 50000, remaining_amount: 42000, currency: "USD" }] },
};

/** A search answer in the shape measured live (one product, trimmed). */
const SEARCH = {
  products: [{
    id: "gid://shopify/p/abc",
    title: "ON Cloudsurfer Max",
    description: { plain: "<p><strong>Features:</strong> Double CloudTec Phase&nbsp;foam.</p>" },
    options: [{ name: "Size", values: [{ label: "9" }, { label: "9.5" }] }, { name: "Color", values: [{ label: "Ivory - Salmon" }] }],
    variants: [{
      id: "gid://shopify/ProductVariant/50319744696629",
      title: "Ivory - Salmon / D / 9.5",
      price: { amount: 13995, currency: "USD" },
      list_price: { amount: 17995, currency: "USD" },
      availability: { available: true },
      options: [{ name: "Color", label: "Ivory - Salmon" }, { name: "Size", label: "9.5" }],
      url: "https://www.fit2run.com/products/on-cloudsurfer-max?variant=50319744696629",
      media: [{ type: "image", url: "https://cdn.shopify.com/s/files/shoe.png" }],
      seller: { id: "gid://shopify/Shop/29145366588", name: "Fit2Run", url: "https://www.fit2run.com", domain: "53c4f8-91.myshopify.com" },
      rating: { value: 5, count: 37 },
    }],
  }],
  pagination: { has_next_page: true, cursor: "eyJvZmZzZXQiOjF9" },
  messages: [{ type: "info", content: "Price filtering was applied on a USD basis." }],
  next: ["Show every warning"],
};

/**
 * A fake Shop: its sign-in server and its MCP server in one `fetch`. Each
 * MCP tool answers from `tools[name]` (a function of the arguments and
 * whether a token came), as a JSON-RPC result with `structuredContent`.
 */
function fakeShop(tools = {}) {
  const calls = [];
  const auth = { deviceAnswers: [{ error: "authorization_pending" }], issued: 0, refreshes: 0, revoked: [], refreshRefused: false };
  const fetch = async (url, init = {}) => {
    const address = String(url);
    const body = typeof init.body === "string" ? init.body : "";
    if (address.startsWith("https://accounts.shop.app/")) {
      const form = Object.fromEntries(new URLSearchParams(body));
      calls.push({ kind: "auth", path: new URL(address).pathname, form });
      if (address.endsWith("/oauth/device")) return Response.json({ device_code: "dev-secret", user_code: "WXYZ-1234", verification_uri: "https://accounts.shop.app/device", verification_uri_complete: "https://accounts.shop.app/device?user_code=WXYZ-1234", expires_in: 600, interval: 5 });
      if (address.endsWith("/oauth/token") && form.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
        const next = auth.deviceAnswers.shift() ?? { access_token: `at-${++auth.issued}`, refresh_token: "rt-1", expires_in: 3600, token_type: "Bearer" };
        return Response.json(next, { status: next.error == null ? 200 : 400 });
      }
      if (address.endsWith("/oauth/token") && form.grant_type === "refresh_token") {
        auth.refreshes += 1;
        if (auth.refreshRefused) return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: `at-r${auth.refreshes}`, refresh_token: `rt-${auth.refreshes + 1}`, expires_in: 3600 });
      }
      if (address.endsWith("/oauth/revoke")) { auth.revoked.push(form.token); return new Response(null, { status: 200 }); }
      return new Response("not found", { status: 404 });
    }
    if (address === "https://mcp.shop.com/") {
      const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
      const rpc = JSON.parse(body);
      const name = rpc.params.name;
      const token = (headers.authorization ?? "").replace(/^Bearer /, "") || undefined;
      calls.push({ kind: "tool", name, args: rpc.params.arguments, token, headers });
      const handler = tools[name];
      if (handler == null) return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: `Unknown tool ${name}` } });
      const answer = await handler(rpc.params.arguments, token);
      if (answer instanceof Response) return answer;
      const content = answer.isError === true ? [{ type: "text", text: answer.text ?? "refused" }] : [{ type: "text", text: JSON.stringify(answer.value ?? {}) }];
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { content, ...(answer.isError === true ? {} : { structuredContent: answer.value ?? {} }), isError: answer.isError === true, ...(answer.code == null ? {} : { _meta: { "com.shopify/error": { code: answer.code } } }) } });
    }
    return new Response("unexpected", { status: 500 });
  };
  return { fetch, calls, auth, tool: (name) => calls.filter((call) => call.kind === "tool" && call.name === name) };
}

async function shopFixture(t, tools, options = {}) {
  const client = await load("source/shared/node/shop-wallet/shop-mcp.ts", `shop-mcp-${Math.random().toString(36).slice(2)}`);
  const toolsModule = await load("source/shared/node/shop-wallet/shop-tools.ts", `shop-tools-${Math.random().toString(36).slice(2)}`);
  t.after(client.dispose);
  t.after(toolsModule.dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-shop-root-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shop = fakeShop(tools);
  let clock = options.now ?? 1_800_000_000_000;
  const logs = [];
  const shopClient = client.module.createShopClient({ rootDir: () => root, fetch: shop.fetch, now: () => clock, env: options.env ?? {}, log: (line) => logs.push(line) });
  const wallet = toolsModule.module.createShopTools({ client: shopClient, rootDir: () => root, now: () => clock, sleep: async (ms) => { clock += ms; }, log: (line) => logs.push(line), ...(options.fillCheckout == null ? {} : { fillCheckout: options.fillCheckout }) });
  return { root, shop, client: shopClient, wallet, modules: { client: client.module, tools: toolsModule.module }, logs, tick: (ms) => { clock += ms; }, signIn: () => { mkdirSync(path.join(root, "shop"), { recursive: true }); writeFileSync(path.join(root, "shop", "auth.json"), JSON.stringify({ accessToken: "at-live", refreshToken: "rt-live", expiresAtMs: clock + 3_600_000, clientId: "5c733ab2-1903-400a-891e-7ba20c09e2a3" })); } };
}

test("Shop's answers are read as Shop sends them: JSON or server-sent events, its error code, its text", async (t) => {
  const { module, dispose } = await load("source/shared/node/shop-wallet/shop-mcp.ts", "shop-mcp-read");
  t.after(dispose);
  assert.deepEqual(module.readShopRpcBody('{"jsonrpc":"2.0","id":1,"result":{"isError":false}}'), { jsonrpc: "2.0", id: 1, result: { isError: false } });
  assert.deepEqual(module.readShopRpcBody('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"a":1}}}\n\n'), { jsonrpc: "2.0", id: 1, result: { structuredContent: { a: 1 } } });
  const read = module.readShopToolResult({ result: { content: [{ type: "text", text: "Shopify Catalog rate-limited search_catalog (HTTP 429). Retry after 30 s." }], isError: true, _meta: { "com.shopify/error": { code: "rate_limited", retry_after: 30 } } } });
  assert.deepEqual(read, { ok: true, value: null, text: "Shopify Catalog rate-limited search_catalog (HTTP 429). Retry after 30 s.", isError: true, errorCode: "rate_limited", retryAfterSeconds: 30 });
  // The text read as JSON when there is no structuredContent.
  assert.deepEqual(module.readShopToolResult({ result: { content: [{ type: "text", text: '{"id":"x"}' }] } }).value, { id: "x" });
  // MCP 2025-06-18 is refused by Shop (measured): the RPC error is the answer.
  assert.deepEqual(module.readShopToolResult({ error: { code: -32022, message: "Unsupported protocol version" } }), { ok: false, code: "SHOP_RPC_-32022", message: "Unsupported protocol version" });
  assert.equal(module.SHOP_MCP_PROTOCOL, "2026-07-28");
});

test("connecting Shop is its device sign-in: Shop's page with the code, a token kept in a private file, refreshed, revoked", async (t) => {
  const { root, shop, client, logs, tick } = await shopFixture(t, { get_account: (_args, token) => token == null ? new Response("", { status: 401 }) : { value: ACCOUNT } });
  assert.deepEqual(await client.signInStatus(), { authenticated: false, pending: false });
  const started = await client.startSignIn();
  assert.deepEqual(started, { url: "https://accounts.shop.app/device?user_code=WXYZ-1234", phrase: "WXYZ-1234" });
  const device = shop.calls.find((call) => call.path === "/oauth/device");
  assert.deepEqual(device.form, { client_id: "5c733ab2-1903-400a-891e-7ba20c09e2a3", resource: "https://mcp.shop.com", scope: "personal_agent", device_name: "Simeon" });
  assert.equal(statSync(path.join(root, "shop", "device.json")).mode & 0o777, 0o600, "the device code is a credential: a private file");

  // Not approved yet; asked again within Shop's interval, Shop isn't asked.
  assert.deepEqual(await client.signInStatus(), { authenticated: false, pending: true });
  assert.deepEqual(await client.signInStatus(), { authenticated: false, pending: true });
  assert.equal(shop.calls.filter((call) => call.path === "/oauth/token").length, 1);
  tick(5_000);
  assert.deepEqual(await client.signInStatus(), { authenticated: true, pending: false });
  assert.equal(existsSync(path.join(root, "shop", "device.json")), false);
  const stored = JSON.parse(readFileSync(path.join(root, "shop", "auth.json"), "utf8"));
  assert.equal(stored.accessToken, "at-1");
  assert.equal(stored.refreshToken, "rt-1");
  assert.equal(statSync(path.join(root, "shop", "auth.json")).mode & 0o777, 0o600);
  assert.ok(logs.includes("[shop] connected"));

  // The token goes in the header, with Shop's MCP version.
  assert.equal((await client.call("get_account", {}, "required")).ok, true);
  const sent = shop.tool("get_account")[0];
  assert.equal(sent.token, "at-1");
  assert.equal(sent.headers["mcp-protocol-version"], "2026-07-28");
  assert.equal(sent.headers["mcp-name"], "get_account");

  // About to expire: refreshed first.
  tick(3_600_000);
  await client.call("get_account", {}, "required");
  assert.equal(shop.auth.refreshes, 1);
  assert.equal(shop.tool("get_account").at(-1).token, "at-r1");

  // Signing out revokes both tokens and forgets them.
  await client.signOut();
  assert.equal(existsSync(path.join(root, "shop", "auth.json")), false);
  assert.deepEqual(shop.auth.revoked, ["rt-2", "at-r1"]);
  assert.deepEqual(await client.call("get_account", {}, "required"), { ok: false, code: "NOT_AUTHENTICATED", message: "Shop isn't connected." });
});

test("a refused refresh ends the sign-in; a search still runs signed out; Simeon's own client replaces Shop's when set", async (t) => {
  const { shop, client, signIn, tick } = await shopFixture(t, {
    get_account: (_args, token) => token === "at-live" ? { value: ACCOUNT } : new Response("", { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token"' } }),
    search_catalog: () => ({ value: SEARCH }),
  });
  signIn();
  shop.auth.refreshRefused = true;
  tick(3_600_000);
  assert.equal((await client.call("get_account", {}, "required")).ok, false);
  assert.equal((await client.signInStatus()).authenticated, false, "invalid_grant signs out");
  const searched = await client.call("search_catalog", { catalog: { query: "shoes" } }, "optional");
  assert.equal(searched.ok, true);
  assert.equal(shop.tool("search_catalog")[0].token, undefined, "signed out, no header");

  const own = await shopFixture(t, {}, { env: { SIMEON_SHOP_CLIENT_ID: "simeon-registered-client" } });
  await own.client.startSignIn();
  assert.equal(own.shop.calls.find((call) => call.path === "/oauth/device").form.client_id, "simeon-registered-client");
});

test("the agents' Shop tools: a trimmed search, an account without secrets, orders, and no tool that pays", async (t) => {
  const { shop, wallet, modules, signIn } = await shopFixture(t, {
    search_catalog: () => ({ value: SEARCH }),
    get_account: () => ({ value: { ...ACCOUNT, token: "should-not-show" } }),
    search_orders: (args) => ({ value: { orders: [{ name: "#1001", shop: "Fit2Run" }], echoed: args } }),
  });
  signIn();
  assert.deepEqual(wallet.tools.map((tool) => tool.name), ["search_products", "get_product", "get_account", "search_orders", "prepare_checkout", "wait_for_approval", "pay_checkout", "cancel_purchase"]);
  const found = await wallet.call("search_products", { query: "running shoes", max_price: 15000, size: "9.5", limit: 4 });
  assert.equal(found.isError, false);
  const sent = shop.tool("search_catalog")[0].args.catalog;
  assert.deepEqual(sent, { query: "running shoes", context: { address_country: "US", currency: "USD" }, filters: { price: { max: 15000 }, attributes: [{ name: "Size", values: ["9.5"] }] }, pagination: { limit: 4 } });
  const listed = JSON.parse(found.text);
  assert.deepEqual(listed.products[0], {
    product_id: "gid://shopify/p/abc",
    variant_id: "gid://shopify/ProductVariant/50319744696629",
    title: "ON Cloudsurfer Max",
    variant: "Ivory - Salmon / 9.5",
    price: "$139.95",
    was: "$179.95",
    available: true,
    seller: "Fit2Run",
    shop: "53c4f8-91.myshopify.com",
    url: "https://www.fit2run.com/products/on-cloudsurfer-max?variant=50319744696629",
    image_url: "https://cdn.shopify.com/s/files/shoe.png",
    rating: "5 (37 reviews)",
    options: ["Size: 9, 9.5", "Color: Ivory - Salmon"],
    description: "Features: Double CloudTec Phase foam.",
  });
  assert.equal(listed.next_cursor, "eyJvZmZzZXQiOjF9");
  assert.deepEqual(listed.notes, ["Price filtering was applied on a USD basis."]);
  assert.ok(found.text.length < 1500, "a search costs the agent little");
  assert.match((await wallet.call("search_products", {})).text, /needs query/);

  const account = await wallet.call("get_account", {});
  assert.doesNotMatch(account.text, /should-not-show/);
  assert.match(account.text, /Seattle/);
  await wallet.call("search_orders", { activity: "active", limit: 5 });
  assert.deepEqual(shop.tool("search_orders")[0].args, { activity: "active", pagination: { limit: 5 } });
  assert.match((await wallet.call("create_spend_request", {})).text, /RequestPurchase/);
  assert.equal(modules.tools.scrubShopSecrets({ instrument: { credential: { number: "4242424242424242" } }, continue_url: "https://shop.app/checkouts/x?key=1" }).instrument.credential, "[hidden]");
});

test("a store checked out in the browser is paid with a Shop spend request, exactly as with Link: approved in the Shop app, then the one-time card typed in", async (t) => {
  const filled = [];
  let spendStatus = "pending";
  const { shop, wallet, modules, signIn } = await shopFixture(t, {
    get_account: () => ({ value: ACCOUNT }),
    create_spend_request: (args) => ({ value: { id: SPEND_ID, status: "pending", continue_url: "https://shop.app/approvals/abc", expires_at: "2026-10-14T20:00:00Z", echoed: args } }),
    get_spend_request: () => spendStatus === "consumed"
      ? { value: { id: SPEND_ID, status: "consumed", instrument: { credential: { type: "card", number: "4242 4242 4242 4242", exp_month: 12, exp_year: 30, cvc: "123", name: "Ada Lovelace" }, billing_address: { street_address: "1 Example Way", address_locality: "Seattle", address_region: "WA", postal_code: "98101", address_country: "US" }, display: { last_digits: "9911", funding_instrument: { brand: "visa", last_digits: "4242" } } } } }
      : { value: { id: SPEND_ID, status: spendStatus } },
    cancel_spend_request: () => ({ value: { id: SPEND_ID, status: "cancelled" } }),
    complete_spend_request: (args) => ({ value: { result: { status: args.result.status, recorded_at: "now" } } }),
  }, { fillCheckout: async (args) => { filled.push(args); return { ok: true, page: "ncvss.com", filled: ["card number", "expiry", "security code"], missing: [] }; } });

  signIn();
  // The card's facts: Shop's saved cards, the preferred one paying, the person's name.
  const facts = await wallet.checkoutFacts({ amount: 8000, currency: "usd" });
  assert.deepEqual(facts, { ok: true, paymentMethodId: CARD_ID, card: { brand: "Visa", last4: "4242", name: "Chase Sapphire" }, cards: [{ id: CARD_ID, brand: "Visa", last4: "4242", name: "Chase Sapphire", isDefault: true }, { id: OTHER_CARD_ID, brand: "Mastercard", last4: "1005", name: "", isDefault: false }], holder: "Ada Lovelace" });
  assert.match((await wallet.checkoutFacts({ amount: 8000, currency: "usd", paymentMethodId: "nope" })).message, /no saved card "nope"/);

  // Allow: one spend request for exactly the card, Shop's shapes.
  const spend = await wallet.requestSpend({
    idempotencyKey: "simeon-abc", credentialType: "card", amount: 8000, currency: "usd",
    context: "Buying Linen shirt from NCVSS for $80.00 in total, as the person asked in Simeon, who reviewed and allowed this checkout before Shop was asked.",
    merchantName: "NCVSS", merchantUrl: "https://ncvss.com/checkout/abc", paymentMethodId: OTHER_CARD_ID,
    lineItems: [{ name: "Linen shirt", quantity: 1, unitAmount: 7200 }],
    totals: [{ type: "subtotal", label: "Subtotal", amount: 7200 }, { type: "shipping", label: "Shipping", amount: 800 }, { type: "discount", label: "Welcome", amount: 500 }, { type: "total", label: "Total", amount: 8000 }],
    test: false,
    approval: { approved_at: 1 },
  });
  assert.deepEqual(spend, { ok: true, id: SPEND_ID, status: "pending", approvalUrl: "https://shop.app/approvals/abc" });
  const sent = shop.tool("create_spend_request")[0].args;
  assert.deepEqual(sent.spend_request.business, { name: "NCVSS", url: "https://ncvss.com" });
  assert.equal(sent.spend_request.currency, "USD");
  assert.equal(sent.spend_request.approval_limit, 8000);
  assert.equal(sent.spend_request.instrument_id, OTHER_CARD_ID);
  assert.deepEqual(sent.spend_request.totals, [{ type: "subtotal", amount: 7200 }, { type: "fulfillment", amount: 800 }, { type: "discount", amount: -500 }, { type: "total", amount: 8000 }]);
  assert.deepEqual(sent.spend_request.line_items, [{ item: { title: "Linen shirt", price: 7200 }, quantity: 1 }]);
  assert.match(sent.meta["idempotency-key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(sent.meta["idempotency-key"], modules.tools.shopIdempotencyKey("simeon-abc"), "the same card asks Shop once");
  assert.equal("approval" in sent.spend_request, false, "Shop takes no approval given elsewhere");

  // Watching: pending, then approved and issued (`consumed`): the card's state is approved.
  assert.equal((await wallet.spendStatus(SPEND_ID, 10)).code, "POLLING_TIMEOUT");
  spendStatus = "consumed";
  const approved = await wallet.spendStatus(SPEND_ID, 120);
  assert.equal(approved.ok && approved.status, "consumed");

  // pay_checkout types the card in; the agent never sees it.
  const paid = await wallet.call("pay_checkout", { spend_request_id: SPEND_ID, checkout_url: "ncvss.com" });
  assert.equal(paid.isError, false);
  assert.doesNotMatch(paid.text, /4242/);
  assert.deepEqual(filled[0].card, { number: "4242424242424242", cvc: "123", expMonth: 12, expYear: 2030, billing: { name: "Ada Lovelace", line1: "1 Example Way", line2: "", city: "Seattle", state: "WA", postalCode: "98101", country: "US" } });
  assert.equal(filled[0].pageHint, "ncvss.com");

  // After paying: Shop hears how it went.
  await wallet.reportOutcome({ domain: "ncvss.com", spendRequestId: SPEND_ID, outcome: "success", order: "#1042" });
  assert.deepEqual(shop.tool("complete_spend_request")[0].args, { id: SPEND_ID, result: { status: "success", order: { id: "#1042" } } });
  await wallet.reportOutcome({ domain: "ncvss.com", spendRequestId: SPEND_ID, outcome: "blocked", context: "The page refused the card." });
  assert.deepEqual(shop.tool("complete_spend_request")[1].args.result, { status: "error", failure_code: "other", message: "The page refused the card." });
  assert.equal(await wallet.cancelSpend(SPEND_ID), true);

  // Shop's approval text: no address of any kind, 100 to 500 characters.
  const card = await load("source/shared/node/link-wallet/purchase-card.ts", "shop-intent");
  t.after(card.dispose);
  const intent = card.module.purchaseShopIntent("Get it from https://ncvss.com/x or ncvss.com, mail me at ada@example.com", { merchant: "ncvss.com", total: "$80.00", items: [{ name: "Linen shirt", quantity: 1 }] });
  assert.doesNotMatch(intent, /https?:|ncvss\.com|@/);
  assert.ok(intent.length >= 100 && intent.length <= 500, intent);
});

test("a Shopify store is paid through Shop at Allow: the checkout opened with the saved address and cheapest delivery, its own total on the card, paid once", async (t) => {
  const doc = (status, extra = {}) => ({
    id: "gid://shopify/Checkout/abc?key=secret",
    status,
    currency: "USD",
    line_items: [{ id: "line-1", item: { id: "gid://shopify/ProductVariant/50319744696629", title: "ON Cloudsurfer Max - Ivory - Salmon / D / 9.5", price: 13995, image_url: "https://cdn.shopify.com/s/files/shoe.png" }, quantity: 1 }],
    totals: [{ type: "subtotal", amount: 13995, display_text: "Subtotal" }, { type: "fulfillment", amount: 900, display_text: "Shipping" }, { type: "tax", amount: 1200, display_text: "Tax" }, { type: "total", amount: 16095, display_text: "Total" }],
    payment: { instruments: status === "ready_for_complete" ? [{ id: "saved-1", handler_id: "shop_pay", type: "shop_pay", credential: { type: "shop_token", token: "secret-token" }, display: { brand: "visa", last_digits: "4242" } }] : [] },
    messages: [],
    continue_url: "https://shop.app/checkouts/f/abc?key=secret",
    next: ["Show every warning"],
    ...extra,
  });
  let state = "incomplete";
  let completeAnswer = () => ({ value: doc("completed", { order: { id: "gid://shopify/Order/5551042", name: "#1042" } }) });
  const { shop, wallet, signIn } = await shopFixture(t, {
    get_account: () => ({ value: ACCOUNT }),
    create_checkout: () => ({ value: doc("incomplete", { fulfillment: { methods: [{ id: "m1", type: "shipping", destinations: [] }] }, messages: [{ type: "error", code: "delivery_address_required", content: "A destination address is required in order to continue.", severity: "recoverable" }] }) }),
    update_checkout: (args) => {
      const method = args.checkout.fulfillment.methods[0];
      if (method.groups == null) return { value: doc("incomplete", { fulfillment: { methods: [{ ...method, groups: [{ id: "g1", options: [{ id: "express", totals: [{ type: "total", amount: 2500 }] }, { id: "ground", totals: [{ type: "total", amount: 900 }] }] }] }] } }) };
      state = "ready_for_complete";
      return { value: doc("ready_for_complete", { fulfillment: args.checkout.fulfillment }) };
    },
    get_checkout: () => ({ value: doc(state) }),
    complete_checkout: (args) => completeAnswer(args),
  });
  signIn();
  const prepared = await wallet.call("prepare_checkout", { shop: "53c4f8-91.myshopify.com", items: [{ variant_id: "gid://shopify/ProductVariant/50319744696629" }], merchant_name: "Fit2Run", product_url: "https://www.fit2run.com/products/on-cloudsurfer-max" });
  assert.equal(prepared.isError, false);
  const handle = /(chk_[0-9a-f]{12})/.exec(prepared.text)?.[1];
  assert.ok(handle != null, prepared.text);
  assert.match(prepared.text, /is ready/);
  assert.match(prepared.text, /Total: \$160\.95/);
  assert.doesNotMatch(prepared.text, /key=secret|gid:\/\/shopify\/Checkout/, "the checkout's key stays on the computer");
  const [withAddress, withDelivery] = shop.tool("update_checkout");
  assert.deepEqual(withAddress.args.checkout.fulfillment.methods[0].destinations, [ACCOUNT.addresses[0]], "the saved address, copied unchanged");
  assert.equal(withAddress.args.checkout.fulfillment.methods[0].selected_destination_id, "addr-1");
  assert.equal("next" in withAddress.args.checkout, false, "Shop's own fields are left out of an update");
  assert.equal(withDelivery.args.checkout.fulfillment.methods[0].groups[0].selected_option_id, "ground", "the cheapest delivery");

  // The card's facts: Shop's own figures, read again.
  const card = await wallet.shopCheckoutCard(handle);
  assert.equal(card.ok, true);
  assert.equal(card.amount, 16095);
  assert.equal(card.merchant, "Fit2Run");
  assert.equal(card.domain, "fit2run.com");
  assert.equal(card.imageUrl, "https://cdn.shopify.com/s/files/shoe.png");
  assert.deepEqual(card.totals.map((line) => [line.type, line.amount]), [["subtotal", 13995], ["shipping", 900], ["tax", 1200]]);
  assert.deepEqual(card.facts.cards, [{ id: "saved-1", brand: "Visa", last4: "4242", name: "", isDefault: false }]);
  assert.equal(card.facts.paymentMethodId, "saved-1", "one way to pay: it is the one");

  // A total that moved pays nothing.
  assert.deepEqual(await wallet.completeShopCheckout({ handle, instrumentId: "saved-1", amount: 15000, currency: "usd", idempotencyKey: "k" }), { ok: false, code: "TOTAL_CHANGED", message: "The total changed to $160.95 since the card was shown; nothing was paid." });
  assert.equal(shop.tool("complete_checkout").length, 0);
  // Paid once, the instrument copied exactly as offered with selected: true.
  const done = await wallet.completeShopCheckout({ handle, instrumentId: "saved-1", amount: 16095, currency: "usd", idempotencyKey: "k" });
  assert.deepEqual(done, { ok: true, status: "completed", order: "#1042" });
  const paid = shop.tool("complete_checkout")[0].args;
  assert.deepEqual(paid.checkout.payment.instruments, [{ id: "saved-1", handler_id: "shop_pay", type: "shop_pay", credential: { type: "shop_token", token: "secret-token" }, display: { brand: "visa", last_digits: "4242" }, selected: true }]);
  assert.equal(paid.shop, "53c4f8-91.myshopify.com");

  // No answer: read again, never sent twice.
  completeAnswer = () => new Response("", { status: 502 });
  state = "ready_for_complete";
  const uncertain = await wallet.completeShopCheckout({ handle, instrumentId: "saved-1", amount: 16095, currency: "usd", idempotencyKey: "k2" });
  assert.equal(uncertain.ok, false);
  assert.equal(uncertain.code, "UNCERTAIN");
  assert.equal(shop.tool("complete_checkout").length, 2);

  // The store wants the person on its page: the card links it.
  completeAnswer = () => ({ value: doc("requires_escalation", { messages: [{ type: "error", content: "Confirm your age on the store's page.", severity: "requires_buyer_review" }] }) });
  const escalated = await wallet.completeShopCheckout({ handle, instrumentId: "saved-1", amount: 16095, currency: "usd", idempotencyKey: "k3" });
  assert.deepEqual(escalated, { ok: true, status: "requires_escalation", url: "https://shop.app/checkouts/f/abc?key=secret", message: "Confirm your age on the store's page." });

  // Signed out, the checkout can't be paid by Shop: the agent is told to use the browser.
  const out = await shopFixture(t, { get_account: () => new Response("", { status: 401 }) });
  const refused = await out.wallet.call("prepare_checkout", { shop: "53c4f8-91.myshopify.com", items: [{ variant_id: "v1" }] });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /Shop isn't connected.*browser/s);
});

test("the checkout card answers a Shop card with Shop: the spend request goes to Shop, the wake names Shop's tools; a Shop checkout is placed at Allow", async (t) => {
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "shop-purchase-tool");
  const cards = await load("source/host/extensions/transcript/purchase-cards.ts", "shop-purchase-cards");
  t.after(tool.dispose);
  t.after(cards.dispose);
  const ARGS = { merchant_name: "NCVSS", checkout_url: "https://ncvss.com/checkout/abc", items: [{ name: "Linen shirt", quantity: 1, unit_amount: 8000 }], total: 8000 };
  let message;
  const asked = [];
  const shown = await run(tool.module.createRequestPurchaseTool({
    checkoutFacts: (request) => { asked.push(request); return Promise.resolve({ ok: true, wallet: "shop", paymentMethodId: CARD_ID, card: { brand: "Visa", last4: "4242", name: "Chase Sapphire" }, cards: [] }); },
    capturePreview: async () => undefined,
    emitCard: (posted) => { message = posted; return "t3s1"; },
    markPurchaseDone: async () => ({ ok: true }),
  }), { ...ARGS, wallet: "shop", context: "A shirt from ncvss.com, see https://ncvss.com/x" });
  assert.match(shown, /paid through Shop, is in the chat/);
  assert.match(shown, /approves it in the Shop app/);
  assert.equal(asked[0].wallet, "shop");
  assert.equal(message.purchase.wallet, "shop");
  assert.doesNotMatch(message.purchase.link.context, /ncvss\.com|https/);
  assert.match(await run(tool.module.createRequestPurchaseTool({ checkoutFacts: () => Promise.resolve({ ok: true, wallet: "shop", paymentMethodId: CARD_ID, card: { brand: "Visa", last4: "4242" }, cards: [] }), capturePreview: async () => undefined, emitCard: () => "x", markPurchaseDone: async () => ({ ok: true }) }), { ...ARGS, test: true }), /Shop has no test mode/);

  // The host side: Allow goes to Shop's wallet, never Link's.
  const entry = { kind: "send-message", id: "t3s1", timestampMs: 42, message: structuredClone(message) };
  const db = { entries: [entry], getTranscriptEntries() { return this.entries; }, updateTranscriptEntry(id, update) { const i = this.entries.findIndex((item) => item.id === id); if (i >= 0) this.entries[i] = update(this.entries[i]); } };
  const wakes = [];
  const tm = { sessions: { activeSession: { id: "a1", db }, liveSessions: new Map(), inMemoryTranscriptAgentId: "a1", isAgentGone: () => false }, sessionStore: {}, roster: { emit: () => undefined, emitAgentUpdate: async () => undefined }, backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt) => { wakes.push({ source, prompt }); } } };
  const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
  const linkCalls = [];
  const link = { requestSpend: async () => { linkCalls.push("create"); return { ok: false, code: "X", message: "x" }; }, spendStatus: async () => ({ ok: false, code: "POLLING_TIMEOUT", message: "" }), cancelSpend: async () => true, reportOutcome: async () => undefined };
  const shopCalls = [];
  const looks = [{ ok: true, id: SPEND_ID, status: "consumed" }];
  const shopWallet = { requestSpend: async (input) => { shopCalls.push(["create", input]); return { ok: true, id: SPEND_ID, status: "pending", approvalUrl: "https://shop.app/approvals/abc" }; }, spendStatus: async () => looks.shift() ?? { ok: false, code: "POLLING_TIMEOUT", message: "" }, cancelSpend: async () => true, reportOutcome: async (args) => { shopCalls.push(["report", args]); } };
  await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, { link, shop: shopWallet });
  assert.deepEqual(linkCalls, []);
  assert.equal(shopCalls[0][1].paymentMethodId, CARD_ID);
  await until(() => db.entries[0].purchaseState === "approved", "Shop's approval");
  await until(() => wakes.length === 1, "the wake");
  assert.match(wakes[0].prompt, /approved it in Shop/);
  assert.match(wakes[0].prompt, /server "shop"/);
  assert.match(wakes[0].prompt, /pay_checkout on Shop/);
  await purchases.markPurchaseDone({ agentId: "a1", entryId: "t3s1", outcome: "ordered", order: "#77" }, { link, shop: shopWallet });
  await until(() => shopCalls.some(([kind]) => kind === "report"), "Shop's report");
  assert.equal(shopCalls.find(([kind]) => kind === "report")[1].order, "#77");

  // A Shop checkout's card: Allow places the order, no spend request, the agent only tells the person.
  let checkoutMessage;
  const checkoutShown = await run(tool.module.createRequestPurchaseTool({
    checkoutFacts: () => assert.fail("a Shop checkout doesn't ask a wallet's saved cards"),
    shopCheckoutCard: async (handle) => ({ ok: true, merchant: "Fit2Run", url: "https://www.fit2run.com/products/shoe", domain: "fit2run.com", amount: 16095, currency: "usd", items: [{ name: "ON Cloudsurfer Max", quantity: 1, unitAmount: 13995 }], totals: [{ type: "shipping", label: "Shipping", amount: 900 }], imageUrl: "https://cdn.shopify.com/s/files/shoe.png", facts: { ok: true, paymentMethodId: "saved-1", card: { brand: "Visa", last4: "4242", name: "" }, cards: [{ id: "saved-1", brand: "Visa", last4: "4242", name: "", isDefault: false }] }, handle }),
    persistPicture: async (url) => ({ url: `file:///pictures/${url.split("/").pop()}`, width: 512, height: 512 }),
    capturePreview: async () => undefined,
    emitCard: (posted) => { checkoutMessage = posted; return "t3s2"; },
    markPurchaseDone: async () => ({ ok: true }),
  }), { merchant_name: "Fit2Run", checkout_url: "https://www.fit2run.com/products/shoe", items: [{ name: "Shoe", quantity: 1 }], total: 15000, shop_checkout: "chk_0123456789ab" });
  assert.match(checkoutShown, /\$160\.95 at Fit2Run, paid through Shop/);
  assert.match(checkoutShown, /Shop's total is \$160\.95/);
  assert.deepEqual(checkoutMessage.purchase.shopCheckout, { handle: "chk_0123456789ab" });
  assert.equal(checkoutMessage.purchase.amount, 16095, "Shop's total, not the agent's");
  assert.equal(checkoutMessage.purchase.preview.url, "file:///pictures/shoe.png");
  assert.equal(checkoutMessage.purchase.link.paymentMethodId, "saved-1");

  db.entries.push({ kind: "send-message", id: "t3s2", timestampMs: 43, message: structuredClone(checkoutMessage) });
  const completed = [];
  const shopCheckoutWallet = { ...shopWallet, completeShopCheckout: async (args) => { completed.push(args); return { ok: true, status: "completed", order: "#1042" }; } };
  await purchases.answerPurchase({ agentId: "a1", entryId: "t3s2", allow: true, approval: { approvedAt: Math.round(Date.now() / 1000), userId: "u1", authenticationMethod: "biometric_face" } }, { shop: shopCheckoutWallet });
  assert.equal(completed.length, 1);
  assert.deepEqual([completed[0].handle, completed[0].instrumentId, completed[0].amount], ["chk_0123456789ab", "saved-1", 16095]);
  const placed = db.entries.find((item) => item.id === "t3s2");
  assert.equal(placed.purchaseState, "ordered");
  assert.equal(placed.purchaseOrder, "#1042");
  await until(() => wakes.some((wake) => wake.source === "purchase-ordered"), "the ordered wake");
  assert.match(wakes.find((wake) => wake.source === "purchase-ordered").prompt, /Shop placed the order/);
  assert.match((await purchases.markPurchaseDone({ agentId: "a1", entryId: "t3s2", outcome: "ordered" }, { shop: shopCheckoutWallet })).ok ? "ok" : "no", /ok/, "an ordered card is final");
});

test("the Shop app on the cloud computer signs in with Shop's device code and runs Shop's tools; Link is untouched", async (t) => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/backend-exec.ts", "vendor-backend-shop");
  t.after(dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-shop-backend-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { createVendorMcpBackendExec, SHOP_CONNECTED_CLIENT_ID } = module;
  writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "shop", url: "https://shop.app", connected: false }, { id: "link", url: "https://link.com/agents", connected: false }]));
  const read = (id) => JSON.parse(readFileSync(path.join(root, "vendor-mcp-installs.json"), "utf8")).find((row) => row.id === id);
  let authenticated = false;
  const shopWallet = {
    tools: [{ name: "search_products", title: "Search products", description: "Search.", inputSchema: { type: "object", properties: {} } }],
    signInStatus: async () => ({ authenticated, pending: !authenticated }),
    startSignIn: async () => ({ url: "https://accounts.shop.app/device?user_code=WXYZ-1234", phrase: "WXYZ-1234" }),
    signOut: async () => { authenticated = false; },
    call: async (name, args) => ({ text: `shop ran ${name} ${JSON.stringify(args)}`, isError: false }),
  };
  const linkWallet = { ...shopWallet, signInStatus: async () => ({ authenticated: false, pending: false }), call: async () => assert.fail("Link isn't asked for Shop's tools") };
  const exec = createVendorMcpBackendExec({ rootDir: () => root, now: () => 1_000_000, canStartAuth: true, linkWallet, shopWallet });
  const serverId = exec.serverIdForPlugin("shop");
  const started = await exec.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "https://api.simeonlabs.com/desktop/mcp-oauth/callback" });
  assert.deepEqual([started.requiresAuth, started.authUrl], [true, "https://accounts.shop.app/device?user_code=WXYZ-1234"]);
  assert.match(readFileSync(path.join(root, "vendor-mcp-signin.log"), "utf8"), /shop sign-in started with Shop's device code/);
  authenticated = true;
  await exec.validateTokens([{ serverUrl: "https://shop.app", accountKey: "default" }]);
  assert.equal(read("shop").credential.clientId, SHOP_CONNECTED_CLIENT_ID);
  assert.equal(read("link").credential, undefined, "Link is still not connected");
  const [listed] = await exec.listTools(["shop"]);
  assert.equal(listed.status, "connected");
  const ran = await exec.executeTool({ serverIdentifier: "shop", toolName: "search_products", args: { query: "shoes" }, toolCallId: "c1" });
  assert.equal(ran.result.value.content[0].content.value.text, 'shop ran search_products {"query":"shoes"}');
  await exec.logoutAccount({ serverUrl: "https://shop.app", accountKey: "default" });
  assert.equal(read("shop").credential, undefined);
});

test("SearchProducts searches Shop's catalog with no account, and says so where the computer has no Shop", async (t) => {
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "shop-search-tool");
  t.after(tool.dispose);
  const asked = [];
  const base = { checkoutFacts: () => undefined, capturePreview: async () => undefined, emitCard: () => "x", markPurchaseDone: async () => ({ ok: true }) };
  const search = tool.module.createSearchProductsTool({ ...base, searchProducts: (args) => { asked.push(args); return Promise.resolve({ text: '{"products":[{"title":"Laguna Linen Shirt"}]}', isError: false }); } });
  assert.equal(search.name, "SearchProducts");
  assert.match(await run(search, { query: "linen shirt", max_price: 8000 }), /Laguna Linen Shirt/);
  assert.deepEqual(asked[0], { query: "linen shirt", max_price: 8000 });
  assert.match(await run(tool.module.createSearchProductsTool(base), { query: "x" }), /isn't available here/);
});

test("the agents' instructions and the Shop app's place in the store", async () => {
  const prompt = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  for (const words of ["Shop (MCP server \\\"shop\\\"", "SearchProducts first", "prepare_checkout", "shop_checkout", "Shop always asks in the Shop app"]) assert.ok(prompt.includes(words), words);
  const catalog = await readFile(path.join(repoRoot, "source/shared/node/vendor-mcp/catalog.ts"), "utf8");
  assert.match(catalog, /id: "shop", name: "Shop", category: G\.Finance, url: "https:\/\/shop\.app", boxCli: "shop"/);
});
