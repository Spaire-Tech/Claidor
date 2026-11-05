/**
 * Link, Stripe's agent wallet (13 October 2026): the CLI runner, the agents'
 * tools and the checkout filler (source/shared/node/link-wallet/). The CLI
 * is faked here (its answers as `@stripe/link-cli` 0.27.1 printed them);
 * the filler runs against a real Chromium over DevTools when one is on this
 * machine (/opt/pw-browsers, or SIMEON_CHROMIUM).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
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

/** A CLI that answers from a script and writes down every command (without the --auth/--format tail). */
function fakeCli(answers) {
  const calls = [];
  const exec = async (_file, args, options) => {
    const auth = args.indexOf("--auth");
    const command = args.slice(0, auth);
    calls.push({ command, env: options.env });
    const key = command.join(" ");
    const match = Object.keys(answers).find((prefix) => key.startsWith(prefix));
    const answer = match == null ? { code: 0, value: {} } : typeof answers[match] === "function" ? answers[match](command) : answers[match];
    return { code: answer.code ?? 0, stdout: JSON.stringify(answer.value), stderr: "" };
  };
  return { exec, calls };
}

test("the runner reads Link's answers: the last state of a poll, an error object, an install when the image has none", async (t) => {
  const { module, dispose } = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli");
  t.after(dispose);
  const { parseLinkCliOutput, readLinkCliAnswer, createLinkCli, LINK_CLI_VERSION } = module;
  assert.deepEqual(parseLinkCliOutput('[\n {"authenticated": false, "pending": true},\n {"authenticated": true}\n]'), { authenticated: true });
  assert.deepEqual(parseLinkCliOutput('link-cli: a newer version\n{"id":"lsrq_1"}'), { id: "lsrq_1" });
  // A list is kept whole: `payment-methods list` prints the cards themselves (14 October 2026: read as states, only the last card came back).
  assert.deepEqual(parseLinkCliOutput('[{"id":"csmrpd_a"},{"id":"csmrpd_b"}]', { list: true }), [{ id: "csmrpd_a" }, { id: "csmrpd_b" }]);
  assert.deepEqual(readLinkCliAnswer({ code: 0, stdout: "[]", stderr: "" }, { list: true }), { ok: true, value: [] });
  assert.deepEqual(readLinkCliAnswer({ code: 1, stdout: '{"code":"NOT_AUTHENTICATED","message":"Not authenticated."}', stderr: "" }), { ok: false, code: "NOT_AUTHENTICATED", message: "Not authenticated." });
  // An error object printed with exit 0 is still an error.
  assert.equal(readLinkCliAnswer({ code: 0, stdout: '{"code":"NOT_AUTHENTICATED","message":"Not authenticated.","cta":{}}', stderr: "" }).ok, false);
  assert.deepEqual(readLinkCliAnswer({ code: 0, stdout: '{"id":"lsrq_1","status":"approved"}', stderr: "" }), { ok: true, value: { id: "lsrq_1", status: "approved" } });

  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-root-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = new Set();
  const ran = [];
  const cli = createLinkCli({
    rootDir: () => root,
    env: { PATH: "/usr/bin" },
    exists: (file) => files.has(file),
    exec: async (file, args, options) => {
      ran.push({ file, args, env: options.env });
      if (args[0] === "install") { files.add(path.join(root, "link", "cli", "node_modules", "@stripe", "link-cli", "dist", "cli.js")); return { code: 0, stdout: "", stderr: "" }; }
      return { code: 0, stdout: '{"authenticated":false}', stderr: "" };
    },
  });
  assert.equal(cli.present(), false);
  const answer = await cli.run(["auth", "status"]);
  assert.deepEqual(answer, { ok: true, value: { authenticated: false } });
  const install = ran.find((item) => item.args[0] === "install");
  assert.ok(install.args.includes(`@stripe/link-cli@${LINK_CLI_VERSION}`), "the pinned version");
  assert.ok(install.args.includes("--ignore-scripts"), "no install script (it fetches skills with npx)");
  const status = ran.at(-1);
  assert.ok(status.args.at(-7).endsWith("cli.js"), "run with node from the data volume");
  assert.deepEqual(status.args.slice(-6, -4), ["auth", "status"]);
  assert.deepEqual(status.args.slice(-4), ["--auth", path.join(root, "link", "auth.json"), "--format", "json"], "the sign-in lives on the data volume");
  assert.equal(status.env.NO_UPDATE_NOTIFIER, "1");
  assert.equal(status.env.HOME, path.join(root, "link"));

  // The sign-in names the computer "your cloud computer" in Link, not its container's id (14 October 2026); no other command is touched.
  await cli.run(["auth", "login", "--client-name", "Simeon"]);
  const login = ran.at(-1);
  const preload = path.join(root, "link", "device-label.cjs");
  assert.equal(login.env.SIMEON_LINK_DEVICE_LABEL, "your cloud computer");
  assert.equal(login.env.NODE_OPTIONS, `--require ${JSON.stringify(preload)}`);
  assert.equal(status.env.NODE_OPTIONS, undefined);
  assert.equal(status.env.SIMEON_LINK_DEVICE_LABEL, undefined);
  // Node answers that name for the hostname an ES module imports, as the CLI does (`import { hostname } from "os"`).
  const probe = path.join(root, "probe.mjs");
  writeFileSync(probe, 'import { hostname } from "os";\nconsole.log(`Simeon on ${hostname()}`);\n');
  const { execFileSync } = await import("node:child_process");
  const probed = execFileSync(process.execPath, [probe], { env: { PATH: process.env.PATH, NODE_OPTIONS: login.env.NODE_OPTIONS, SIMEON_LINK_DEVICE_LABEL: login.env.SIMEON_LINK_DEVICE_LABEL }, encoding: "utf8" });
  assert.equal(probed.trim(), "Simeon on your cloud computer");

  // The image's copy wins, and no install runs.
  files.add("/usr/local/bin/link-cli");
  ran.length = 0;
  await cli.run(["sources", "list"]);
  assert.equal(ran.length, 1);
  assert.equal(ran[0].file, "/usr/local/bin/link-cli");
});

test("the tools build Link's commands, hide cards and tokens, and sign in with the device code", async (t) => {
  const tools = await load("source/shared/node/link-wallet/link-tools.ts", "link-tools");
  const runner = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli-2");
  t.after(tools.dispose);
  t.after(runner.dispose);
  const { createLinkTools, LINK_TOOLS, scrubLinkSecrets, cardFromFile, linkPairs } = tools.module;
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  let signedIn = false;
  let userInfo = { name: "Bass Lee", agent_wallet_spend_limits: { per_transaction: { limit: 50000 }, daily: { limit: 50000, used: 45000, remaining: 5000 }, thirty_day: { limit: 2000000, used: 45000, remaining: 1955000 } }, agent_wallet_verification_requirement: { status: "not_required", action_url: null } };
  let methods = [{ id: "csmrpd_visa", type: "card", is_default: true, name: "Visa", card_details: { brand: "visa", last4: "1234" } }, { id: "csmrpd_mc", type: "card", is_default: false, name: "Mastercard", card_details: { brand: "mastercard", last4: "5678" } }];
  const fake = fakeCli({
    "user-info retrieve": () => ({ value: userInfo }),
    "payment-methods list": () => ({ value: methods }),
    "auth status": () => ({ value: signedIn ? { authenticated: true, scope: "userinfo:read payment_methods.agentic" } : { authenticated: false, pending: true, verification_url: "https://app.link.com/device/setup?code=warmth-woo-won-charm", phrase: "warmth-woo-won-charm" } }),
    "auth login": { value: [{ verification_url: "https://app.link.com/device/setup?code=warmth-woo-won-charm", phrase: "warmth-woo-won-charm", instruction: "Present the verification_url…" }] },
    "auth logout": { value: { authenticated: false } },
    // As the CLI prints them: a list command its list, a streamed step (create, retrieve, auth) its states as one array.
    "shipping-address list": { value: [{ id: "csmrsa_home", city: "San Francisco", postal_code: "94103", is_default: true }, { id: "csmrsa_work", city: "Oakland", postal_code: "94607", is_default: false }] },
    "spend-request list": { value: [{ id: "lsrq_old", status: "approved" }, { id: "lsrq_1", status: "pending_approval" }] },
    "spend-request create": { value: [{ id: "lsrq_1", status: "pending_approval", credential_type: "card", amount: 3500, approval_url: "https://app.link.com/activity/approve/lsrq_1", instruction: "Present the approval_url…" }] },
    "spend-request retrieve lsrq_wait": { code: 1, value: { code: "POLLING_TIMEOUT", message: "Polling timed out" } },
    "spend-request retrieve lsrq_1 --include card": (command) => {
      writeFileSync(command[command.indexOf("--output-file") + 1], JSON.stringify({ spend_request_id: "lsrq_1", card: { number: "4242424242424242", cvc: "123", exp_month: 12, exp_year: 2031, billing_address: { name: "Bass Lee", postal_code: "94103" } } }));
      return { value: { id: "lsrq_1", status: "approved", card_output_file: "…" } };
    },
    "spend-request retrieve lsrq_1": { value: { id: "lsrq_1", status: "approved", credential_type: "card", card: { brand: "visa", last4: "4242", number: "4242424242424242", cvc: "123" } } },
    // Link asking the person for a step of its own before the card (19 October 2026, the founder's Mastercard ending 1005).
    "spend-request retrieve lsrq_act": { value: { id: "lsrq_act", status: "requires_action", credential_type: "card", status_details: { requires_action: { next_action: { type: "re_authorize", display_message: "Confirm your Mastercard ending 1005 to keep using it.", action_url: "https://app.link.com/actions/abc", resolution: "create_new_spend_request" } } } } },
    "spend-request retrieve lsrq_late --include card": { value: { id: "lsrq_late", status: "requires_action", status_details: { requires_action: { next_action: { type: "three_d_secure", display_message: "Your bank wants to confirm this purchase.", action_url: "https://app.link.com/actions/3ds", resolution: "auto_resume" } } } } },
    "spend-request retrieve lsrq_late": { value: { id: "lsrq_late", status: "approved", credential_type: "card" } },
    "sources list": { code: 1, value: { code: "NOT_AUTHENTICATED", message: "Not authenticated." } },
    "transactions list": { value: { data: [{ id: "lbctxn_1", amount: -4999, description: "ACME Coffee" }], has_more: false } },
  });
  const cli = runner.module.createLinkCli({ rootDir: () => root, env: {}, exists: () => true, exec: fake.exec });
  const filled = [];
  const link = createLinkTools({ cli, rootDir: () => root, fillCheckout: async (options) => { filled.push(options); return { ok: true, page: "shop.example.com", filled: ["card number", "expiry", "security code"], missing: [] }; } });

  // No tool starts a payment: purchases begin with the checkout card (RequestPurchase).
  assert.deepEqual(LINK_TOOLS.map((tool) => tool.name), ["get_wallet", "wait_for_approval", "pay_checkout", "cancel_purchase", "list_purchases", "list_accounts", "get_balances", "list_transactions"]);
  for (const tool of LINK_TOOLS) assert.equal(tool.inputSchema.type, "object", tool.name);

  // Sign-in: the page with the code in it, then connected once approved.
  assert.deepEqual(await link.startSignIn(false), { url: "https://app.link.com/device/setup?code=warmth-woo-won-charm", phrase: "warmth-woo-won-charm", via: "device" });
  const login = fake.calls.find((call) => call.command[0] === "auth" && call.command[1] === "login").command;
  assert.deepEqual(login.slice(0, 4), ["auth", "login", "--client-name", "Simeon"]);
  assert.deepEqual(login.filter((_item, index) => login[index - 1] === "--source-actions"), ["read_link_transactions", "read_external_transactions", "read_balances", "read_source_details"]);
  assert.deepEqual(await link.signInStatus(), { authenticated: false, pending: true });
  signedIn = true;
  assert.deepEqual(await link.signInStatus(), { authenticated: true, pending: false });

  // The old direct purchase points the agent at the checkout card and asks Link for nothing.
  const direct = await link.call("create_purchase", { merchant_name: "Stripe Press", merchant_url: "https://press.stripe.com", context: "x".repeat(100), amount: 3500 });
  assert.equal(direct.isError, true);
  assert.match(direct.text, /RequestPurchase/);
  assert.equal(fake.calls.some((call) => call.command[1] === "create"), false);

  // Before the card: the default card, every card the person may switch to on the card (14 October 2026), and the limits the amount must fit in (here $50 left today).
  const bothCards = [{ id: "csmrpd_visa", brand: "Visa", last4: "1234", name: "Visa", isDefault: true }, { id: "csmrpd_mc", brand: "Mastercard", last4: "5678", name: "Mastercard", isDefault: false }];
  assert.deepEqual(await link.checkoutFacts({ amount: 3500, currency: "usd" }), { ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234", name: "Visa" }, cards: bothCards, holder: "Bass Lee" });
  assert.deepEqual((await link.checkoutFacts({ amount: 3500, currency: "usd", paymentMethodId: "csmrpd_mc" })).card, { brand: "Mastercard", last4: "5678", name: "Mastercard" });
  // The wallet shows every card and address, not the last of each.
  const wallet = JSON.parse((await link.call("get_wallet", {})).text);
  assert.deepEqual(wallet.payment_methods.map((method) => method.id), ["csmrpd_visa", "csmrpd_mc"]);
  assert.deepEqual(wallet.shipping_addresses.map((address) => address.id), ["csmrsa_home", "csmrsa_work"]);
  // One card, the default (the founder's wallet, 14 October 2026): it pays.
  const allCards = methods;
  methods = [{ id: "csmrpd_rh", type: "card", is_default: true, name: "Robinhood Cash Card", card_details: { brand: "visa", last4: "2862" } }];
  assert.deepEqual(await link.checkoutFacts({ amount: 248, currency: "usd" }), { ok: true, paymentMethodId: "csmrpd_rh", card: { brand: "Visa", last4: "2862", name: "Robinhood Cash Card" }, cards: [{ id: "csmrpd_rh", brand: "Visa", last4: "2862", name: "Robinhood Cash Card", isDefault: true }], holder: "Bass Lee" });
  // A default Link won't let an agent pay with: the one that can pays, and it is never offered on the card.
  methods = [{ ...allCards[0], capabilities: { agentic_payments: { eligible: false, ineligibility_reasons: ["unsupported_funding_type"] } } }, allCards[1]];
  const ineligible = await link.checkoutFacts({ amount: 3500, currency: "usd" });
  assert.equal(ineligible.ok, true);
  assert.equal(ineligible.paymentMethodId, "csmrpd_mc");
  assert.deepEqual(ineligible.cards.map((card) => card.id), ["csmrpd_mc"]);
  // Named by the agent, it is refused before the checkout card, pointing at the card's own chooser.
  const named = await link.checkoutFacts({ amount: 3500, currency: "usd", paymentMethodId: "csmrpd_visa" });
  assert.equal(named.ok, false);
  assert.match(named.message, /Visa ending 1234 can't be used for purchases by an agent \(unsupported funding type\)\. Leave payment_method_id out/);
  // No card an agent can use: said before the card.
  methods = allCards.map((method) => ({ ...method, capabilities: { agentic_payments: { eligible: false } } }));
  assert.match((await link.checkoutFacts({ amount: 3500, currency: "usd" })).message, /none of the person's cards can be used/);
  methods = allCards;
  const overDay = await link.checkoutFacts({ amount: 6000, currency: "usd" });
  assert.equal(overDay.ok, false);
  assert.match(overDay.message, /\$50\.00 the person's Link limits leave today/);
  assert.match((await link.checkoutFacts({ amount: 60000, currency: "usd" })).message, /limit of \$500\.00 a purchase/);
  methods = methods.map((method) => ({ ...method, is_default: false }));
  const which = await link.checkoutFacts({ amount: 3500, currency: "usd" });
  assert.equal(which.ok, true, "several cards and no default: the person picks on the card, never in a typed question");
  assert.equal(which.paymentMethodId, "");
  assert.deepEqual(which.cards.map((card) => card.last4), ["1234", "5678"]);
  userInfo = { ...userInfo, agent_wallet_verification_requirement: { status: "identity_verification", action_url: "https://link.com/verify/abc" } };
  assert.match((await link.checkoutFacts({ amount: 3500, currency: "usd", paymentMethodId: "csmrpd_visa" })).message, /https:\/\/link\.com\/verify\/abc/);

  // At Allow: the flags Link takes, approval asked for, one key per card, commas out of the item names.
  const spend = await link.requestSpend({ idempotencyKey: "simeon-abc", credentialType: "card", amount: 3500, currency: "usd", context: "Buying 'Working in Public' from press.stripe.com because the person asked for it; one copy, shipped to their saved address.", merchantName: "Stripe Press", merchantUrl: "https://press.stripe.com/checkout", paymentMethodId: "csmrpd_visa", lineItems: [{ name: "Working in Public, hardcover", unitAmount: 3500, quantity: 1 }], totals: [{ type: "total", label: "Total", amount: 3500 }], test: true });
  assert.deepEqual(spend, { ok: true, id: "lsrq_1", status: "pending_approval", approvalUrl: "https://app.link.com/activity/approve/lsrq_1" });
  const create = fake.calls.find((call) => call.command[1] === "create").command;
  for (const flag of ["--merchant-name", "--merchant-url", "--context", "--amount", "--request-approval", "--line-item", "--total", "--payment-method-id", "--test"]) assert.ok(create.includes(flag), flag);
  assert.equal(create[create.indexOf("--idempotency-key") + 1], "simeon-abc");
  assert.equal(create[create.indexOf("--line-item") + 1], "name:Working in Public hardcover,unit_amount:3500,quantity:1");
  assert.equal(create[create.indexOf("--credential-type") + 1], "card");
  assert.equal((await link.spendStatus("lsrq_wait", 10)).code, "POLLING_TIMEOUT");

  // Waiting runs out without an error, and a card in an answer never reaches the agent.
  const waiting = await link.call("wait_for_approval", { spend_request_id: "lsrq_wait", wait_seconds: 10 });
  assert.equal(waiting.isError, false);
  assert.match(waiting.text, /Still waiting/);
  const paid = await link.call("pay_checkout", { spend_request_id: "lsrq_1", checkout_url: "shop.example.com" });
  assert.equal(paid.isError, false, paid.text);
  assert.equal(filled.length, 1);
  assert.equal(filled[0].card.number, "4242424242424242", "the filler got the card");
  assert.equal(filled[0].pageHint, "shop.example.com");
  assert.doesNotMatch(paid.text, /4242424242424242|123/);
  assert.deepEqual(readdirSync(path.join(root, "link")).filter((name) => name.startsWith("card-")), [], "the card file is gone");
  // Link asks the person for a step first: its words and its page reach the agent, and no card is typed.
  const step = await link.call("pay_checkout", { spend_request_id: "lsrq_act", checkout_url: "shop.example.com" });
  assert.equal(step.isError, true);
  assert.equal(step.text, 'Link won\'t release the card until the person does one thing at Link: "Confirm your Mastercard ending 1005 to keep using it.". Send them Link\'s page for it in the chat, unchanged: https://app.link.com/actions/abc Once they say it\'s done, this purchase can\'t go on: call RequestPurchase again for a new checkout card. Nothing was paid.');
  const bank = await link.call("pay_checkout", { spend_request_id: "lsrq_late", checkout_url: "shop.example.com" });
  assert.match(bank.text, /"Your bank wants to confirm this purchase\."\. Send them Link's page for it in the chat, unchanged: https:\/\/app\.link\.com\/actions\/3ds Once they say it's done, call pay_checkout again\./);
  assert.equal(filled.length, 1, "nothing typed for either");
  const retrieved = await link.call("list_purchases", {});
  assert.doesNotMatch(JSON.stringify(scrubLinkSecrets({ card: { number: "4242424242424242", cvc: "123", last4: "4242" } })), /4242424242424242|"123"/);
  assert.equal(retrieved.isError, false);
  assert.deepEqual(JSON.parse(retrieved.text).map((purchase) => purchase.id), ["lsrq_old", "lsrq_1"], "every purchase, not the last");

  // Not connected: the agent is told to start the sign-in, not given Link's raw words.
  const accounts = await link.call("list_accounts", {});
  assert.equal(accounts.isError, true);
  assert.match(accounts.text, /AuthenticateMcpServer/);
  const transactions = await link.call("list_transactions", { start_date: "2026-09-01", end_date: "2026-09-30", source_ids: ["csmrpd_1"] });
  assert.match(transactions.text, /ACME Coffee/);
  const list = fake.calls.find((call) => call.command[0] === "transactions").command;
  assert.deepEqual(list, ["transactions", "list", "--limit", "100", "--start-date", "2026-09-01", "--end-date", "2026-09-30", "--source", "csmrpd_1"]);

  assert.equal(linkPairs({ name: "A, B\nC", amount: 5, empty: "" }), "name:A B C,amount:5");
  assert.deepEqual(cardFromFile({ card: { number: "4242 4242 4242 4242", cvc: "123", exp_month: 1, exp_year: 31 } }), { number: "4242424242424242", cvc: "123", expMonth: 1, expYear: 2031 });
  assert.throws(() => cardFromFile({ card: { number: "4242", cvc: "1" } }));
});

test("Allow approved in Simeon is handed to Link as the approval; Link refusing it asks in the Link app; a CLI that never answers makes nothing twice", async (t) => {
  const tools = await load("source/shared/node/link-wallet/link-tools.ts", "link-tools-approve");
  const runner = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli-approve");
  const card = await load("source/shared/node/link-wallet/purchase-card.ts", "purchase-card-approve");
  t.after(tools.dispose);
  t.after(runner.dispose);
  t.after(card.dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-approve-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { linkApprovalDetails, purchaseApprovalFrom } = card.module;

  // The apps' approval: an account, a time near now; Face ID named as Link names it.
  const now = 1_760_430_000_000;
  const approval = purchaseApprovalFrom({ approvedAt: now / 1000, authenticationMethod: "biometric_face", deviceType: "mobile", userId: "8a6b0b0e-user", userName: "Bass Fall" }, now);
  assert.deepEqual(linkApprovalDetails(approval, { agentId: "nora", entryId: "t3s1" }), { approved_at: now / 1000, approval_method: "click", app_name: "Simeon", external_user_id: "8a6b0b0e-user", external_user_name: "Bass Fall", device_type: "mobile", authentication_method: "biometric_face", agent_log_id: "t3s1", external_session_id: "nora" });
  assert.equal(purchaseApprovalFrom({ approvedAt: now / 1000 }, now), undefined, "no account, no approval");
  assert.equal(purchaseApprovalFrom({ approvedAt: now / 1000 - 3600, userId: "u" }, now), undefined, "an hour old, no approval");
  assert.equal(purchaseApprovalFrom({ approvedAt: now / 1000, userId: "u", authenticationMethod: "retina" }, now).authenticationMethod, undefined, "only Link's own words for how");

  let delegatedAnswer = { value: [{ id: "lsrq_9", status: "approved", credential_type: "card" }] };
  const fake = fakeCli({
    "spend-request create": (command) => command.includes("--approve") ? delegatedAnswer : { value: [{ id: "lsrq_10", status: "pending_approval", approval_url: "https://app.link.com/activity/approve/lsrq_10" }] },
  });
  const cli = runner.module.createLinkCli({ rootDir: () => root, env: {}, exists: () => true, exec: fake.exec });
  const lines = [];
  const link = tools.module.createLinkTools({ cli, rootDir: () => root, log: (line) => lines.push(line) });
  const base = { idempotencyKey: "simeon-abc", credentialType: "card", amount: 247, currency: "usd", context: "x".repeat(120), merchantName: "Gumroad", merchantUrl: "https://gumroad.com/checkout", paymentMethodId: "csmrpd_mc", lineItems: [{ name: "Practice Book", unitAmount: 223, quantity: 1 }], totals: [{ type: "total", label: "Total", amount: 247 }], test: false, approval: linkApprovalDetails(approval, { agentId: "nora", entryId: "t3s1" }) };
  const creates = () => fake.calls.filter((call) => call.command[1] === "create").map((call) => call.command);

  // Link takes it: approved at once, no Link app, one request.
  const taken = await link.requestSpend(base);
  assert.deepEqual(taken, { ok: true, id: "lsrq_9", status: "approved", approvedInSimeon: true });
  const [sent] = creates();
  assert.ok(sent.includes("--approve"));
  // The CLI asks in the Link app unless told not to (19 October 2026: without this flag, Allow ended at Link's approval page).
  assert.ok(sent.includes("--no-request-approval") && !sent.includes("--request-approval"), "nothing asked in the Link app");
  assert.equal(sent[sent.indexOf("--idempotency-key") + 1], "simeon-abc-approved", "its own key");
  assert.deepEqual(JSON.parse(sent[sent.indexOf("--approval-detail") + 1]), base.approval);
  assert.match(lines.at(-1), /purchase approved in Simeon: approved lsrq_9/);

  // Link refuses Simeon's approval: the same purchase is asked in the Link app, with the card's own key.
  fake.calls.length = 0;
  delegatedAnswer = { code: 1, value: { code: "permission_denied", message: "This client cannot approve spend requests." } };
  const asked = await link.requestSpend(base);
  assert.deepEqual(asked, { ok: true, id: "lsrq_10", status: "pending_approval", approvalUrl: "https://app.link.com/activity/approve/lsrq_10" });
  const [first, second] = creates();
  assert.ok(first.includes("--approve"));
  assert.ok(second.includes("--request-approval") && !second.includes("--approve"));
  assert.equal(second[second.indexOf("--idempotency-key") + 1], "simeon-abc");
  assert.ok(lines.some((line) => /approval in Simeon refused: permission_denied This client cannot approve spend requests\.; asking in the Link app/.test(line)));

  // The CLI dies both times: nothing is made the other way (the first may yet stand at Link).
  fake.calls.length = 0;
  delegatedAnswer = { code: 2, value: null };
  const lost = await link.requestSpend(base);
  assert.equal(lost.ok, false);
  assert.equal(lost.code, "LINK_CLI_FAILED");
  assert.equal(creates().length, 2);
  assert.ok(creates().every((command) => command.includes("--approve")), "asked again the same way, never in the Link app");

  // Link has no approval policy for Simeon (19 October 2026, a 409): the next purchases ask in the Link app at once, for an hour.
  fake.calls.length = 0;
  let clock = 1_800_000_000_000;
  const policyLines = [];
  const timed = tools.module.createLinkTools({ cli, rootDir: () => root, log: (line) => policyLines.push(line), now: () => clock });
  delegatedAnswer = { code: 1, value: { code: "spend_request_conflict", message: "no approval policy is configured" } };
  await timed.requestSpend(base);
  assert.equal(creates().length, 2, "offered once, refused, asked in the Link app");
  fake.calls.length = 0;
  await timed.requestSpend(base);
  assert.equal(creates().length, 1);
  assert.ok(creates()[0].includes("--request-approval") && !creates()[0].includes("--approve"));
  assert.ok(policyLines.includes("[link] approval in Simeon skipped: Link has no approval policy for Simeon; asking in the Link app"));
  clock += tools.module.LINK_NO_POLICY_RECHECK_MS;
  fake.calls.length = 0;
  await timed.requestSpend(base);
  assert.ok(creates()[0].includes("--approve"), "offered again an hour on");

  // No approval from the apps: as before, asked in the Link app only.
  fake.calls.length = 0;
  const { approval: _none, ...withoutApproval } = base;
  await link.requestSpend(withoutApproval);
  assert.equal(creates().length, 1);
  assert.ok(creates()[0].includes("--request-approval"));
});

test("a request Link made but didn't approve with Simeon's approval is asked in the Link app as it is, and Link's page opens on the person's email", async (t) => {
  const runner = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli-not-taken");
  const tools = await load("source/shared/node/link-wallet/link-tools.ts", "link-tools-not-taken");
  t.after(runner.dispose);
  t.after(tools.dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-not-taken-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fake = fakeCli({
    "spend-request create": { value: [{ id: "lsrq_11", status: "created" }] },
    "spend-request request-approval": { value: [{ id: "lsrq_11", status: "pending_approval", approval_url: "https://app.link.com/activity/approve/lsrq_11?ref=cli" }] },
    "user-info retrieve": { value: { name: "Ada Lovelace", email: "ada+shop@example.com" } },
  });
  const cli = runner.module.createLinkCli({ rootDir: () => root, env: {}, exists: () => true, exec: fake.exec });
  const lines = [];
  const link = tools.module.createLinkTools({ cli, rootDir: () => root, log: (line) => lines.push(line) });
  const approval = { approved_at: 1_760_430_000, approval_method: "click", app_name: "Simeon", external_user_id: "u1" };
  const answer = await link.requestSpend({ idempotencyKey: "simeon-def", credentialType: "card", amount: 3487, currency: "usd", context: "x".repeat(120), merchantName: "BZBox", merchantUrl: "https://bzbox.com/checkout", lineItems: [{ name: "Kit", unitAmount: 3487, quantity: 1 }], totals: [{ type: "total", label: "Total", amount: 3487 }], test: false, approval });
  assert.deepEqual(answer, { ok: true, id: "lsrq_11", status: "pending_approval", approvalUrl: "https://app.link.com/activity/approve/lsrq_11?ref=cli&fromEmail=ada%2Bshop%40example.com" });
  const commands = fake.calls.map((call) => call.command.slice(0, 2).join(" "));
  assert.equal(commands.filter((command) => command === "spend-request create").length, 1, "one request, never a second");
  assert.deepEqual(fake.calls.find((call) => call.command[1] === "request-approval").command.slice(0, 3), ["spend-request", "request-approval", "lsrq_11"]);
  assert.ok(lines.includes("[link] approval in Simeon not taken: created lsrq_11; asking in the Link app"));
});

const chromiumPath = process.env.SIMEON_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

test("the filler types the card into a checkout's own fields and its payment frame, and leaves shipping alone", { skip: !existsSync(chromiumPath) && "no Chromium on this machine (set SIMEON_CHROMIUM)" }, async (t) => {
  const { module, dispose } = await load("source/shared/node/link-wallet/checkout-fill.ts", "checkout-fill");
  t.after(dispose);
  const playwright = createRequire(import.meta.url)("playwright-core");

  // The shop on one origin, its payment frame on another (as Stripe's is).
  const pages = {
    "/checkout": `<!doctype html><title>Shop</title>
      <h1>Checkout</h1>
      <label>Shipping ZIP <input name="shipping_zip" autocomplete="shipping postal-code"></label>
      <label>Name on card <input name="ccname" autocomplete="cc-name"></label>
      <iframe id="pay" src="http://localhost:PORT/frame" style="width:600px;height:200px"></iframe>`,
    "/frame": `<!doctype html><input name="cardnumber" placeholder="1234 1234 1234 1234"><input name="exp-date" placeholder="MM / YY"><input name="cvc" placeholder="CVC"><input name="postal" placeholder="ZIP">`,
    "/plain": `<!doctype html><title>Plain</title><form><input autocomplete="cc-number"><select autocomplete="cc-exp-month"><option value="">MM</option>${Array.from({ length: 12 }, (_u, i) => `<option value="${String(i + 1).padStart(2, "0")}">${String(i + 1).padStart(2, "0")}</option>`).join("")}</select><select autocomplete="cc-exp-year"><option value="">YYYY</option><option>2030</option><option>2031</option></select><input autocomplete="cc-csc"></form>`,
    "/token": `<!doctype html><title>Stripe checkout</title><div class="AiAgentPaymentSteering" data-stripe-merchant-account="acct_1" style="display:none"><input name="link_pay_token"></div><script>window.got=[];document.querySelector('input[name="link_pay_token"]').addEventListener('input',e=>window.got.push(e.target.value))</script>`,
  };
  const server = createServer((request, response) => {
    const body = pages[request.url];
    response.writeHead(body == null ? 404 : 200, { "content-type": "text/html" });
    response.end((body ?? "").replace("PORT", String(server.address().port)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const port = 9300 + Math.floor(Math.random() * 500);
  const browser = await playwright.chromium.launch({ executablePath: chromiumPath, args: ["--no-sandbox", `--remote-debugging-port=${port}`, "--site-per-process"] });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const base = `http://127.0.0.1:${server.address().port}`;
  const checkout = await context.newPage();
  await checkout.goto(`${base}/checkout`);
  await checkout.frameLocator("#pay").locator('input[name="cardnumber"]').waitFor();

  const card = { number: "4242424242424242", cvc: "123", expMonth: 4, expYear: 2031, billing: { name: "Bass Lee", line1: "", line2: "", city: "", state: "", postalCode: "94103", country: "US" } };
  const result = await module.fillCheckout({ card, pageHint: "127.0.0.1", ports: [port], loadPlaywright: () => playwright, keyDelayMs: 5 });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual([...result.filled].sort(), ["billing ZIP", "card number", "expiry", "name on card", "security code"]);
  assert.deepEqual(result.missing, []);
  assert.doesNotMatch(JSON.stringify(result), /4242424242424242/, "the answer carries no card number");
  const frame = checkout.frameLocator("#pay");
  assert.equal(await frame.locator('input[name="cardnumber"]').inputValue(), "4242424242424242");
  assert.equal(await frame.locator('input[name="exp-date"]').inputValue(), "04/31");
  assert.equal(await frame.locator('input[name="cvc"]').inputValue(), "123");
  assert.equal(await frame.locator('input[name="postal"]').inputValue(), "94103");
  assert.equal(await checkout.locator('input[name="ccname"]').inputValue(), "Bass Lee");
  assert.equal(await checkout.locator('input[name="shipping_zip"]').inputValue(), "", "the shipping ZIP is not the card's");
  assert.equal(browser.isConnected(), true, "the person's Chrome stays open");
  assert.equal(await checkout.title(), "Shop");

  // Month and year as lists.
  const plain = await context.newPage();
  await plain.goto(`${base}/plain`);
  const second = await module.fillCheckout({ card, pageHint: `${base}/plain`, ports: [port], loadPlaywright: () => playwright, keyDelayMs: 5 });
  assert.equal(second.ok, true, second.message);
  assert.equal(await plain.locator('select[autocomplete="cc-exp-month"]').inputValue(), "04");
  assert.equal(await plain.locator('select[autocomplete="cc-exp-year"]').inputValue(), "2031");
  assert.equal(await plain.locator('input[autocomplete="cc-csc"]').inputValue(), "123");

  // Link's pay token, set the way Stripe's page reads it.
  const tokenPage = await context.newPage();
  await tokenPage.goto(`${base}/token`);
  const token = await module.fillCheckout({ linkPayToken: "lpt_test_1", pageHint: `${base}/token`, ports: [port], loadPlaywright: () => playwright });
  assert.equal(token.ok, true, token.message);
  assert.deepEqual(await tokenPage.evaluate(() => window.got), ["lpt_test_1"]);

  // No card fields: said plainly.
  const blank = await context.newPage();
  await blank.goto(`${base}/token`);
  const none = await module.fillCheckout({ card, pageHint: `${base}/token`, ports: [port], loadPlaywright: () => playwright });
  assert.equal(none.ok, false);

  // The checkout card's picture: a JPEG of the shop's own tab, never another site's.
  const shot = await module.captureCheckout({ pageHint: `${base}/checkout`, ports: [port], loadPlaywright: () => playwright });
  assert.equal(shot?.page, "127.0.0.1");
  assert.deepEqual([...shot.jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff], "a JPEG");
  assert.equal(await module.captureCheckout({ pageHint: "https://shop.example.com/checkout", ports: [port], loadPlaywright: () => playwright }), undefined, "no tab on that site, no picture");
  assert.equal(await checkout.title(), "Shop", "the page is left as it was");
});

test("the Link app signs in with Link's device code, lists its tools once connected and runs them, in the box only", async (t) => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/backend-exec.ts", "vendor-backend-link");
  t.after(dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-backend-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { createVendorMcpBackendExec, LINK_CONNECTED_CLIENT_ID } = module;
  writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "link", url: "https://link.com/agents", connected: false }]));
  const read = () => JSON.parse(readFileSync(path.join(root, "vendor-mcp-installs.json"), "utf8")).find((row) => row.id === "link");

  let authenticated = false;
  const asked = [];
  const linkWallet = {
    tools: [{ name: "get_wallet", title: "Link wallet", description: "The wallet.", inputSchema: { type: "object", properties: {} } }],
    signInStatus: async () => { asked.push("status"); return { authenticated, pending: !authenticated }; },
    startSignIn: async (force) => { asked.push(force ? "login (again)" : "login"); return { url: "https://app.link.com/device/setup?code=warmth-woo-won-charm", phrase: "warmth-woo-won-charm" }; },
    signOut: async () => { asked.push("logout"); authenticated = false; },
    call: async (name, args) => ({ text: `ran ${name} ${JSON.stringify(args)}`, isError: false }),
  };
  let clock = 1_000_000;
  const changed = [];
  const exec = createVendorMcpBackendExec({ rootDir: () => root, now: () => clock, canStartAuth: true, linkWallet, onCredentialChanged: (id) => changed.push(id) });
  const serverId = exec.serverIdForPlugin("link");
  assert.ok(Number(serverId) > 900_000, "Link has its place in the catalogue");

  const [before] = await exec.listTools(["link"]);
  assert.equal(before.status, "needsAuth");
  const started = await exec.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "https://api.simeonlabs.com/desktop/mcp-oauth/callback" });
  assert.deepEqual([started.requiresAuth, started.hasValidToken, started.authUrl], [true, false, "https://app.link.com/device/setup?code=warmth-woo-won-charm"], "the sheet opens Link's page with the code in it");
  assert.match(readFileSync(path.join(root, "vendor-mcp-signin.log"), "utf8"), /link sign-in started with Link's device code/);

  // The person approves in Link; the watch's check finishes it and marks the row.
  authenticated = true;
  assert.deepEqual(await exec.validateTokens([{ serverUrl: "https://link.com/agents", accountKey: "default" }]), [{ serverUrl: "https://link.com/agents", accountKey: "default", hasValidToken: true }]);
  assert.equal(read().credential.clientId, LINK_CONNECTED_CLIENT_ID);
  assert.equal(read().credential.refreshToken, undefined, "a marker, no token");
  assert.deepEqual(changed, ["link"]);

  const [after] = await exec.listTools(["link"]);
  assert.equal(after.status, "connected");
  assert.deepEqual(after.tools.map((tool) => tool.name), ["get_wallet"]);
  const ran = await exec.executeTool({ serverIdentifier: "link", toolName: "get_wallet", args: { a: 1 }, toolCallId: "c1" });
  assert.equal(ran.result.case, "success");
  assert.equal(ran.result.value.content[0].content.value.text, 'ran get_wallet {"a":1}');

  // Listings ask the CLI at most every 20 s.
  const asks = asked.filter((item) => item === "status").length;
  await exec.listTools(["link"]);
  assert.equal(asked.filter((item) => item === "status").length, asks);

  // Removing the account signs Link out and clears the mark.
  await exec.logoutAccount({ serverUrl: "https://link.com/agents", accountKey: "default" });
  assert.ok(asked.includes("logout"));
  assert.equal(read().credential, undefined);

  // Where there is no Link (the retired Electron app), it says where Link runs.
  const elsewhere = createVendorMcpBackendExec({ rootDir: () => root, now: () => clock, canStartAuth: true });
  const there = await elsewhere.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "x" });
  assert.equal(there.isAvailable, false);
  assert.match(there.error, /cloud computer/);
});

test("an app that moved from our apps service to its maker's own server is read at the new address and asks to sign in once", async (t) => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs-moved");
  t.after(dispose);
  const { parseVendorMcpStore, atCatalogAddress } = module;
  const marker = { accessToken: "connected", tokenEndpoint: "https://api.simeonlabs.com/desktop/api/apps/asana/status", clientId: "simeon-apps" };
  const { installs } = parseVendorMcpStore([
    { id: "asana", url: "https://api.simeonlabs.com/desktop/api/apps/mcp/asana", connected: true, credential: marker, installedAtMs: 5, credentialAtMs: 6 },
    { id: "gmail", url: "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail", connected: true, credential: marker },
    { id: "notion", url: "https://mcp.notion.com/mcp", connected: true, credential: { accessToken: "tok", tokenEndpoint: "https://api.notion.com/token", clientId: "c" } },
  ]);
  const [asana, gmail, notion] = installs;
  assert.deepEqual(asana, { id: "asana", url: "https://mcp.asana.com/mcp", connected: false, installedAtMs: 5 }, "Asana's own server, no Composio mark");
  assert.equal(gmail.url, "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail", "an app still on our service stays");
  assert.equal(gmail.credential.clientId, "simeon-apps");
  assert.equal(notion.credential.accessToken, "tok", "a vendor's own sign-in is kept");
  // A row already at the new address, or one a test wrote at any other address, is left alone.
  const own = { id: "asana", url: "https://mcp.asana.com/mcp", connected: true, credential: { accessToken: "a", tokenEndpoint: "https://app.asana.com/token", clientId: "x" } };
  assert.equal(atCatalogAddress(own), own);
});
