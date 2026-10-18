/**
 * Prices the agent can't get wrong (18 October 2026). On the founder's first
 * Haiku test the agent quoted a monitor at $159.99 that Shop's catalog and the
 * shop both sold at $139.99. The products card now shows the catalog's own
 * price for a product from Shop's search, and the checkout card refuses a
 * total the checkout page doesn't show, before the wallet is asked for it.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.SIMEON_TEST_CHROMIUM ?? ""].find((candidate) => candidate.length > 0 && existsSync(candidate));

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

// The end of an Altex checkout's text as Chrome gives it (document.body.innerText), read 18 October 2026.
const ALTEX_CHECKOUT = [
  "Contact", "Email or mobile phone number", "Delivery", "Ship", "Pickup", "Country/Region", "United States",
  "Pay now", "$179.99", "Order summary", "Shopping cart", "Quantity", "1",
  "", "MSI 27\" 1440p WQHD 180Hz 1500R Curved Gaming Monitor | MAG 275CQF E18", "", "1", "$179.99",
  "Discount code or gift card", "Apply", "Cost summary", "Item", "Value",
  "Subtotal", "$179.99", "Shipping", "Enter shipping address", "Total", "USD", "$179.99",
].join("\n");

test("the checkout page's own total: Shopify's, a shop that writes it on one line, other currencies, none named", async () => {
  const { module, dispose } = await load("tests/fixtures/purchase-prices-entry.ts", "prices");
  try {
    const usd = (amount) => module.formatPurchaseMoney(amount, "usd");
    assert.deepEqual(module.labelledTotalsIn(ALTEX_CHECKOUT, "usd"), [17999]);
    assert.deepEqual(module.checkTotalOnPage({ total: 17999, currency: "usd", pageText: ALTEX_CHECKOUT, format: usd }), { ok: true, how: "labelled" });
    const wrong = module.checkTotalOnPage({ total: 15999, currency: "usd", pageText: ALTEX_CHECKOUT, format: usd });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.pageTotal, 17999);
    assert.match(wrong.message, /^The checkout page's total is \$179\.99, not \$159\.99\. Nothing was asked of the wallet\./);
    // The subtotal is not the total, even when it is the same amount: shipping added makes it differ.
    const shipped = ALTEX_CHECKOUT.replace("Enter shipping address\nTotal\nUSD\n$179.99", "$12.00\nTotal\nUSD\n$191.99");
    assert.equal(module.checkTotalOnPage({ total: 17999, currency: "usd", pageText: shipped, format: usd }).ok, false);
    assert.equal(module.checkTotalOnPage({ total: 19199, currency: "usd", pageText: shipped, format: usd }).ok, true);
    // One line, thousands, a colon; a "Total savings" line is not the total.
    assert.deepEqual(module.labelledTotalsIn("Total savings $20.00\nOrder total: $1,234.56", "usd"), [123456]);
    assert.deepEqual(module.labelledTotalsIn("Gesamtsumme\nTotal\n1.234,56 €", "eur"), [123456]);
    assert.deepEqual(module.labelledTotalsIn("Total ¥12,800", "jpy"), [12800]);
    // A count on the total's line is not the total.
    assert.equal(module.checkTotalOnPage({ total: 17999, currency: "jpy", pageText: "Total (2 items) ¥17,999", format: String }).ok, true);
    assert.deepEqual(module.moneyAmountsIn("Pay $80 today, then $9.99 a month", "usd"), [8000, 999]);
    // A quantity before a price is not a thousands digit; a no-break space is.
    assert.deepEqual(module.moneyAmountsIn("Qty 1 179.99", "usd"), [17999]);
    assert.deepEqual(module.moneyAmountsIn("1\u202f234,56 €", "eur"), [123456]);
    // A label whose amount isn't given yet names no total: the scan stops at the first line of words.
    assert.deepEqual(module.labelledTotalsIn("Total\nCalculated at next step\nShipping\n$5.00", "usd"), []);
    // A page that names no total: the card's total must be an amount it shows.
    const unnamed = "Your bag\nLinen shirt $72.00\nDelivery $8.00\nPay $80.00";
    assert.deepEqual(module.checkTotalOnPage({ total: 8000, currency: "usd", pageText: unnamed, format: usd }), { ok: true, how: "shown" });
    assert.match(module.checkTotalOnPage({ total: 9000, currency: "usd", pageText: unnamed, format: usd }).message, /^\$90\.00 isn't on the checkout page \(it shows \$72\.00, \$8\.00, \$80\.00\)/);
    assert.match(module.checkTotalOnPage({ total: 8000, currency: "usd", pageText: "Loading…", format: usd }).message, /^No prices could be read on the checkout page/);
  } finally {
    await dispose();
  }
});

const ARGS = {
  merchant_name: "Altex Computers & Electronics",
  checkout_url: "https://altex.com/checkouts/cn/abc/en-us",
  items: [{ name: "MSI 27\" MAG 275CQF E18", quantity: 1, unit_amount: 17999 }],
  total: 15999,
  currency: "usd",
};

test("RequestPurchase refuses a total the checkout page doesn't show, before the wallet is asked", async () => {
  const { module, dispose } = await load("tests/fixtures/purchase-prices-entry.ts", "prices-request");
  try {
    let asked = 0;
    let card;
    const deps = (pageText) => ({
      readCheckoutPage: async (url) => { assert.equal(url, ARGS.checkout_url); return pageText; },
      checkoutFacts: () => { asked += 1; return Promise.resolve({ ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } }); },
      capturePreview: async () => undefined,
      emitCard: (posted) => { card = posted; return "t3s1"; },
      markPurchaseDone: async () => ({ ok: true }),
    });
    const refused = await run(module.createRequestPurchaseTool(deps(ALTEX_CHECKOUT)), ARGS);
    assert.match(refused, /The checkout page's total is \$179\.99, not \$159\.99/);
    assert.equal(asked, 0, "the wallet is not asked for a total the page doesn't show");
    assert.equal(card, undefined);

    const closed = await run(module.createRequestPurchaseTool(deps(undefined)), ARGS);
    assert.match(closed, /The checkout isn't open in your computer's browser \(no tab on altex\.com could be read\)/);
    assert.equal(asked, 0);

    const shown = await run(module.createRequestPurchaseTool(deps(ALTEX_CHECKOUT)), { ...ARGS, total: 17999 });
    assert.match(shown, /The checkout card for \$179\.99/);
    assert.equal(asked, 1);
    assert.equal(card.purchase.amount, 17999);
  } finally {
    await dispose();
  }
});

test("a products card shows the price Shop's catalog gave, not the agent's copy of it", async () => {
  const { module, dispose } = await load("tests/fixtures/purchase-prices-entry.ts", "prices-products");
  try {
    module.forgetCatalogPricesForTest();
    // A search result as Shop's catalog answers it: the price in cents, the variant as a gid.
    module.rememberProductPrice({ id: "gid://shopify/Product/1", title: "MSI PRO MP275W E2", variants: [{ id: "gid://shopify/ProductVariant/47664962109596", price: { amount: 13999, currency: "USD" } }] });
    module.rememberProductPrice({ id: "gid://shopify/Product/2", title: "Samsung Odyssey G55C", variants: [{ id: "gid://shopify/ProductVariant/222", price: { amount: 14995, currency: "USD" }, list_price: { amount: 19999, currency: "USD" } }] });
    assert.equal(module.catalogPriceFor("47664962109596").price, "$139.99");
    assert.equal(module.catalogPriceFor("gid://shopify/ProductVariant/222").was, "$199.99");
    let card;
    const tool = module.createShowProductsTool({ emitCard: (posted) => { card = posted; return "t3s0"; }, capturePreview: async () => undefined, checkoutFacts: () => undefined, markPurchaseDone: async () => ({ ok: true }) });
    const said = await run(tool, { products: [
      { title: "MSI PRO MP275W E2", url: "https://altex.com/products/msi-pro-mp275w-e2", price: "$159.99", shop_variant_id: "gid://shopify/ProductVariant/47664962109596", shop: "altex-computers-electronics.myshopify.com" },
      { title: "Samsung Odyssey G55C", url: "https://example-shop.com/products/g55c", price: "$149.95", shop_variant_id: "222", shop: "example-shop.myshopify.com" },
      { title: "A monitor from a shop's own page", url: "https://other.example/monitor", price: "$120.00" },
    ] });
    assert.deepEqual(card.products.map((product) => product.price), ["$139.99", "$149.95", "$120.00"]);
    const told = JSON.parse(said).success.currentStep;
    assert.match(told, /The card shows the prices Shop's catalog gave, not the ones you wrote: "MSI PRO MP275W E2" is \$139\.99 \(you wrote \$159\.99\)\. Quote those\./);
    assert.doesNotMatch(told, /Samsung/, "a price written right is not called out");
  } finally {
    await dispose();
  }
});

test("the checkout's text is read off the tab the agent's Chrome has open, and only on that shop's site", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 60_000 }, async () => {
  const { module, dispose } = await load("source/shared/node/link-wallet/checkout-fill.ts", "checkout-fill");
  const page = `<!doctype html><html><body>${ALTEX_CHECKOUT.split("\n").map((line) => `<div>${line.replace(/</g, "&lt;")}</div>`).join("")}</body></html>`;
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end(page); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const checkout = `http://127.0.0.1:${server.address().port}/checkouts/cn/abc/en-us`;
  const profile = await mkdtemp(path.join(os.tmpdir(), "simeon-checkout-text-chrome-"));
  const devtools = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${devtools}`, `--user-data-dir=${profile}`, checkout], { stdio: "ignore" });
  try {
    let text;
    for (let attempt = 0; attempt < 100 && text == null; attempt += 1) {
      text = await module.readCheckoutText({ pageHint: checkout, ports: [devtools] });
      if (text == null) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(text?.includes("Total\nUSD\n$179.99"), String(text));
    const lines = [];
    assert.equal(await module.readCheckoutText({ pageHint: "https://another-shop.example/checkout", ports: [devtools], log: (line) => lines.push(line) }), undefined);
    assert.match(lines.join("\n"), /no page text: no tab on another-shop\.example/);
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    await dispose();
  }
});
