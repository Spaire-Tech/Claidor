// The agents' Shop tools and the checkout card's Shop steps (14 October 2026,
// the founder: "build the whole shop integration. make sure its the exact
// flow as link"). Offered as the "shop" app's tools so they list and run
// like any connected app's (`vendor-mcp/backend-exec.ts`), each one a Shop
// MCP call made by `shop-mcp.ts`.
//
// A purchase with Shop goes as one with Link does, and the person keeps the
// same say: the agent shows the products (ShowProducts, from Shop's own
// search), then the checkout card (RequestPurchase), and nothing is paid
// until they press Allow there. Two ways to pay, both Shop's own:
//   - a store that runs on Shopify, with the person's Shop connected: Simeon
//     opens the checkout with the merchant through Shop (`prepare_checkout`:
//     their saved address, the cheapest delivery), the card shows Shop's own
//     items and totals, and Allow pays it with the Shop Pay card they picked
//     on it (`complete_checkout`), once, after checking the total is still
//     the one they saw. No browser, no second app: the Allow is the approval,
//     as Shop's docs ask ("have the user confirm one exact instrument with
//     the current merchant, items, quantities, and total");
//   - any other store, checked out in the computer's browser: Allow asks Shop
//     for a one-time card (a spend request), which the person approves in the
//     Shop app; once they have, `pay_checkout` types it into the page without
//     the agent ever seeing it, exactly as Link's.
// Every answer here is scrubbed of card numbers, codes and tokens; a
// checkout's id and its `continue_url` (each carries a key to the checkout)
// stay in a file on this computer, the agent gets a short handle for them.

import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shopDir, type ShopAnswer, type ShopClient } from "./shop-mcp.js";
import { fillAnswer, type CheckoutFacts, type LinkCardChoice, type LinkToolDefinition, type LinkToolResult, type SpendAnswer, type SpendRequestInput } from "../link-wallet/link-tools.js";
import { formatPurchaseMoney } from "../link-wallet/purchase-card.js";
import { rememberCatalogPrice } from "./catalog-prices.js";
import type { CheckoutCard, fillCheckout as FillCheckout } from "../link-wallet/checkout-fill.js";

const string = (description: string): Record<string, unknown> => ({ type: "string", description });
const integer = (description: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: "integer", description, ...extra });
const object = (properties: Record<string, unknown>, required: readonly string[] = []): Record<string, unknown> => ({ type: "object", properties, required: [...required], additionalProperties: false });

export const SHOP_TOOLS: readonly LinkToolDefinition[] = [
  {
    name: "search_products",
    title: "Search products",
    description: "Search millions of stores that run on Shopify (the Shopify Catalog) by words, or for products like one you have; with the person's Shop connected, results can use their saved preferences (SearchProducts does the same with no account). Each result: product_id, variant_id (the featured size and colour), title, price as the shop charges it, was (the list price when it's on sale), available, seller, shop (the store's Shopify domain, for prepare_checkout), url (the product's own page), image_url, rating, options (the sizes and colours there are). Put hard requirements in the filters (max_price, size, color, ships_to) and write query in the person's own words, never narrower. Show what fits with ShowProducts, passing each one's image_url, variant_id and shop. Stores that don't run on Shopify aren't here: look for those in the browser.",
    inputSchema: object({
      query: string("What to look for, in the person's words: \"rain jacket\", not \"best rain jacket\". Required unless like_product_id is given."),
      like_product_id: string("A product_id or variant_id from an earlier result, to find similar ones (query then narrows them)."),
      country: string("The person's country, two letters (default US)."),
      currency: string("Three letters (default USD). Set it whenever you filter on price."),
      min_price: integer("Lowest price for one, in the smallest unit (cents)."),
      max_price: integer("Highest price for one, in the smallest unit (8000 is $80.00)."),
      size: string("A size the product must come in."),
      color: string("A colour it must come in."),
      ships_to: string("Only products that ship to this country (two letters)."),
      shops: { type: "array", items: { type: "string" }, description: "Only these stores (their shop domains from earlier results, or their own domains)." },
      limit: integer("How many, 1 to 20 (default 8).", { minimum: 1, maximum: 20 }),
      cursor: string("For the next page: next_cursor from the previous answer, with the same query and filters."),
    }),
  },
  {
    name: "get_product",
    title: "Product details",
    description: "One product's details: its options (every size and colour), the variant for the options you pick (its variant_id, price and stock), description and rating. Use it only when the person wants another size or colour than search_products featured, or for a fact the search didn't give. Copy option names and labels exactly as returned.",
    inputSchema: object({
      product_id: string("product_id (or a variant_id) from search_products."),
      options: { type: "object", additionalProperties: { type: "string" }, description: "The options to pick, by name: {\"Size\": \"M\", \"Color\": \"Black\"}." },
      country: string("Two letters (default US)."),
      currency: string("Three letters (default USD)."),
    }, ["product_id"]),
  },
  {
    name: "get_account",
    title: "Shop account",
    description: "The person's Shop account, once connected: their name, saved delivery addresses (the preferred one first), the saved cards Shop can pay with (the checkout card lets them choose; never ask which card) and the Shop Pay budget they gave this connection. Use the preferred address for a checkout's delivery; ask only when there are several and none is preferred. When you show an address or card to the person, show only the city, the ZIP or the last four digits.",
    inputSchema: object({}),
  },
  {
    name: "search_orders",
    title: "Orders",
    description: "The person's orders and shipments that Shop tracks (from Shopify stores and from the email receipts they let Shop read): what was bought, from whom, the status and the carrier's latest event. Leave query out for the recent ones. \"Fulfilled\" or \"label created\" doesn't mean shipped or delivered: read the carrier's events.",
    inputSchema: object({
      query: string("A shop, an item or an order number."),
      activity: { type: "string", enum: ["active", "past", "all"], description: "active: not delivered yet; past; all (default)." },
      date_from: string("YYYY-MM-DD, placed on or after."),
      date_to: string("YYYY-MM-DD, placed on or before."),
      limit: integer("1 to 25 (default 10).", { minimum: 1, maximum: 25 }),
    }),
  },
  {
    name: "prepare_checkout",
    title: "Prepare a Shop checkout",
    description: "For products from search_products (a store that runs on Shopify) the person wants to buy: opens the checkout with that store through Shop, with their saved delivery address and the cheapest delivery, and says whether Shop can pay it with their Shop Pay card. Needs Shop connected. When it says the checkout is ready, call RequestPurchase with shop_checkout set to the checkout it gives (and the items and total it reports): the person checks the checkout card and presses Allow, and Shop places the order, no browser needed. When it isn't ready, it says why and what to do instead.",
    inputSchema: object({
      shop: string("The store's shop domain from search_products (\"53c4f8-91.myshopify.com\"), exactly."),
      items: { type: "array", minItems: 1, items: object({ variant_id: string("variant_id from search_products or get_product, exactly."), quantity: integer("How many (default 1).", { minimum: 1 }) }, ["variant_id"]), description: "What to buy from this one store." },
      merchant_name: string("The store as the person knows it, for the checkout card."),
      product_url: string("The product's page (its url from search_products): what Review order opens."),
      discount_code: string("A discount code the person gave you."),
      phone: string("The person's phone, from Link's get_wallet: many stores won't take an order without one."),
      email: string("The person's email, from Link's get_wallet, when Shop's account doesn't show it in full."),
    }, ["shop", "items"]),
  },
  {
    name: "wait_for_approval",
    title: "Wait for approval",
    description: "Rarely needed: Simeon watches Shop for every checkout card and wakes you when the person approves or declines in the Shop app. Use it only when you were told a purchase is approved but pay_checkout says otherwise. Says where a spend request stands: pending, approved, consumed (the card was issued), expired or cancelled.",
    inputSchema: object({ spend_request_id: string("The spend request id you were given when the person allowed the checkout card."), wait_seconds: integer("How long to wait this time, 10 to 600. Default 120.", { minimum: 10, maximum: 600 }) }, ["spend_request_id"]),
  },
  {
    name: "pay_checkout",
    title: "Fill in the payment",
    description: "For a purchase the person approved in Shop: puts Shop's one-time card into the checkout page open in the browser, without you ever seeing the card number. Have the checkout's payment step on screen first. It fills the card number, expiry, security code and, where the page asks, the name on the card and billing ZIP, then says which fields it filled. It does not press Pay: check the order summary matches what the person approved, then press the page's Pay or Place order button yourself. If it finds no card fields, open the payment step (or the card option) and call it again.",
    inputSchema: object({ spend_request_id: string("The approved spend request id."), checkout_url: string("The checkout page's address, or just its domain, so the right browser tab is used.") }, ["spend_request_id"]),
  },
  {
    name: "cancel_purchase",
    title: "Cancel a purchase",
    description: "Cancels a Shop spend request that is waiting for approval or approved but not yet used, e.g. when the person changes their mind or the total changed (then show a new checkout card with RequestPurchase).",
    inputSchema: object({ spend_request_id: string("The spend request id.") }, ["spend_request_id"]),
  },
];

const SECRET_KEYS = new Set(["credential", "number", "card_number", "pan", "cvc", "cvv", "security_code", "token", "access_token", "refresh_token", "device_code", "continue_url"]);

/** Every answer without card details, tokens or a checkout's key, whatever Shop put where. */
export function scrubShopSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubShopSecrets);
  if (value == null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEYS.has(key) && item != null ? "[hidden]" : scrubShopSecrets(item)]));
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const record = (value: unknown): Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item)) : [];
const money = (value: unknown): string => { const price = record(value); const amount = Number(price.amount); return Number.isFinite(amount) ? formatPurchaseMoney(amount, text(price.currency) || "usd") : ""; };
/** HTML out, whitespace folded, cut at `max`. */
const plain = (value: unknown, max: number): string => {
  const words = text(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return words.length > max ? `${words.slice(0, max - 1)}…` : words;
};

const NOT_CONNECTED = "Shop isn't connected. Call AuthenticateMcpServer for the Shop app so the person can approve the connection in Shop; then try again.";

/** One search result as the agent needs it: the featured variant's facts, no more (a raw result is about 10 KB). */
export function shopProductSummary(product: Record<string, unknown>): Record<string, unknown> {
  const variant = records(product.variants)[0] ?? {};
  const seller = record(variant.seller);
  const rating = record(variant.rating ?? product.rating);
  const image = text(records(variant.media)[0]?.url) || text(records(product.media)[0]?.url);
  const options = records(product.options).map((option) => `${text(option.name)}: ${records(option.values).map((value) => text(value.label)).filter((label) => label.length > 0).slice(0, 20).join(", ")}`).filter((line) => !line.endsWith(": "));
  const chosen = records(variant.options).map((option) => text(option.label)).filter((label) => label.length > 0).join(" / ");
  const was = money(variant.list_price);
  const price = money(variant.price);
  const ratingValue = Number(rating.value);
  const condition = conditionOf(variant);
  return {
    product_id: text(product.id),
    variant_id: text(variant.id),
    title: text(product.title) || text(variant.title),
    ...(chosen.length > 0 ? { variant: chosen } : {}),
    ...(condition === undefined ? {} : { condition }),
    ...(price.length > 0 ? { price } : {}),
    ...(was.length > 0 && was !== price ? { was } : {}),
    available: record(variant.availability).available !== false,
    ...(text(seller.name).length > 0 ? { seller: text(seller.name) } : {}),
    ...(text(seller.url).length > 0 ? { store_site: text(seller.url) } : {}),
    ...(text(seller.domain).length > 0 ? { shop: text(seller.domain) } : {}),
    ...(text(variant.url).length > 0 ? { url: text(variant.url) } : {}),
    ...(image.length > 0 ? { image_url: image } : {}),
    ...(Number.isFinite(ratingValue) && ratingValue > 0 ? { rating: `${ratingValue}${Number(rating.count) > 0 ? ` (${Number(rating.count)} reviews)` : ""}` } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(plain(record(product.description).plain ?? product.description, 160).length > 0 ? { description: plain(record(product.description).plain ?? product.description, 160) } : {}),
  };
}

/**
 * Who's buying, for Shop's checkout (`buyer`): the account's name, and the
 * phone and email the agent read from Link's wallet, else the account's own
 * when Shop shows them in full (it masks them: "a***@example.com"). Many
 * stores won't take an order without a phone; on 18 October 2026 Shop's
 * checkout at G-electronic stopped there, with none sent.
 */
export function checkoutBuyer(account: Record<string, unknown>, address: Record<string, unknown> | undefined, given: { readonly phone: string; readonly email: string }): Record<string, string> | undefined {
  const whole = (value: string): string => (value.includes("*") ? "" : value);
  const phone = e164(given.phone) || e164(whole(text(account.phone_number) || text(account.phone))) || e164(whole(text(address?.phone_number) || text(address?.phone)));
  const email = (given.email.includes("@") ? given.email : "") || (whole(text(account.email)).includes("@") ? text(account.email) : "");
  const buyer: Record<string, string> = {
    ...(text(account.first_name).length > 0 ? { first_name: text(account.first_name) } : {}),
    ...(text(account.last_name).length > 0 ? { last_name: text(account.last_name) } : {}),
    ...(email.length > 0 ? { email } : {}),
    ...(phone.length > 0 ? { phone_number: phone } : {}),
  };
  return Object.keys(buyer).length > 0 ? buyer : undefined;
}

/** The account's address for delivery, with the phone on it when it has none of its own (or only a masked one). */
export function withDeliveryPhone(address: Record<string, unknown>, phone: string): Record<string, unknown> {
  const own = text(address.phone_number) || text(address.phone);
  if (phone.length === 0 || (own.length > 0 && !own.includes("*"))) return address;
  const { phone: _masked, ...rest } = address;
  return { ...rest, phone_number: phone };
}

/** A delivery address as Link's wallet keeps it, as far as matching it to Shop's needs. */
export interface LinkDeliveryAddress {
  readonly line1: string;
  readonly line2: string;
  readonly postalCode: string;
}

/** "123 Main" of "123 Main Street": the house number and the street's first word, lower case. */
const streetKey = (line: string): string => line.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");

/**
 * The account's address with the apartment, suite or unit that Link's
 * wallet has for the same place (same ZIP, house number and street) when
 * Shop's has none (19 October 2026, OfficeTap through Shop asked for one:
 * Shop's saved address had no apartment line, Link's had it).
 */
export function withLinkLine2(address: Record<string, unknown>, link: readonly LinkDeliveryAddress[]): Record<string, unknown> {
  const line1 = text(address.street_address) || text(address.line1);
  if (text(address.extended_address).length > 0 || text(address.line2).length > 0 || /\b(apt|apartment|suite|ste|unit)\b\.?\s*\w|#\s*\w/i.test(line1)) return address;
  const zip = text(address.postal_code).slice(0, 5);
  const same = link.find((place) => place.line2.length > 0 && place.postalCode.trim().slice(0, 5) === zip && zip.length > 0 && streetKey(place.line1) === streetKey(line1) && streetKey(line1).includes(" "));
  return same == null ? address : { ...address, extended_address: same.line2.trim() };
}

/** A phone in E.164 as Shop asks ("+15551234567"); a ten-digit number is taken as North American. "" when it can't be. */
export function e164(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const bare = digits.replace(/\+/g, "");
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  return "";
}

/**
 * New or used, as the catalog marks a variant (`condition: ["secondhand"]`).
 * Kept since 18 October 2026: 8 of the 20 cheapest monitors the founder's
 * agent was shown were used, and nothing said so.
 */
export function conditionOf(variant: Record<string, unknown>): string | undefined {
  const raw = (Array.isArray(variant.condition) ? variant.condition : [variant.condition]).map((one) => text(one).toLowerCase()).find((one) => one.length > 0);
  if (raw === undefined) return undefined;
  return raw === "secondhand" || raw === "used" ? "used" : raw;
}

/** The featured variant's price (and whether it's used) as the catalog gave it, kept for the products card (`catalog-prices.ts`). */
export function rememberProductPrice(product: Record<string, unknown>): void {
  const variant = records(product.variants)[0] ?? {};
  const raw = record(variant.price);
  const amount = Number(raw.amount);
  const price = money(variant.price);
  if (text(variant.id).length === 0 || !Number.isFinite(amount) || price.length === 0) return;
  const was = money(variant.list_price);
  const condition = conditionOf(variant);
  const rating = record(variant.rating ?? product.rating);
  const stars = Number(rating.value), reviews = Number(rating.count);
  rememberCatalogPrice(text(variant.id), {
    amount,
    currency: text(raw.currency).toLowerCase() || "usd",
    price,
    ...(was.length > 0 && was !== price ? { was } : {}),
    ...(condition === undefined ? {} : { condition }),
    ...(Number.isFinite(stars) && stars > 0 ? { rating: Math.round(stars * 10) / 10, ...(Number.isInteger(reviews) && reviews > 0 ? { reviews } : {}) } : {}),
  });
}

/** Shop's messages, as lines the agent and the person can read. */
function messageLines(value: unknown): string[] {
  return records(value).map((message) => text(message.content) || text(message.text)).filter((line) => line.length > 0);
}

/** A Shop card ("saved card", a checkout's payment instrument) as the checkout card's chooser shows it. */
export function shopCardOf(instrument: Record<string, unknown>): { readonly brand: string; readonly last4: string; readonly name: string } {
  const display = record(instrument.display);
  const funding = record(display.funding_instrument);
  const source = Object.keys(funding).length > 0 ? { ...display, ...funding } : display;
  const brandRaw = text(source.brand) || text(source.card_brand) || text(source.network) || text(instrument.brand);
  const brands: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", master: "Mastercard", amex: "Amex", american_express: "Amex", discover: "Discover", jcb: "JCB", diners: "Diners Club", diners_club: "Diners Club", unionpay: "UnionPay" };
  const lower = brandRaw.toLowerCase().replace(/[\s-]+/g, "_");
  const last4 = (text(source.last_digits) || text(source.last4) || text(display.last_digits)).replace(/\D/g, "").slice(-4);
  const handler = text(instrument.handler_id) || text(instrument.type);
  const name = (text(source.description) || text(display.description) || text(display.name)).slice(0, 60);
  return {
    brand: brands[lower] ?? (brandRaw.length > 0 ? brandRaw.charAt(0).toUpperCase() + brandRaw.slice(1) : /shop_pay/.test(handler) ? "Shop Pay" : "Card"),
    last4,
    name,
  };
}

/** A UUID made from a key (Shop wants UUIDs for idempotency): the same key, the same UUID. */
export function shopIdempotencyKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Our totals' kinds as Shop names them; a discount is negative there. */
export function shopTotals(lines: readonly { readonly type: string; readonly amount: number }[], total: number): { type: string; amount: number }[] {
  const kinds: Record<string, string> = { subtotal: "subtotal", shipping: "fulfillment", fulfillment: "fulfillment", tax: "tax", discount: "discount", fee: "fee", tip: "fee" };
  const mapped = lines
    .filter((line) => line.type !== "total" && kinds[line.type] != null && Number.isInteger(line.amount))
    .map((line) => ({ type: kinds[line.type] as string, amount: kinds[line.type] === "discount" ? -Math.abs(line.amount) : Math.abs(line.amount) }))
    .filter((line) => !(line.type === "discount" && line.amount === 0));
  return [...mapped, { type: "total", amount: total }];
}

/** The card from an issued Shop instrument (`get_spend_request` once approved): its credential and billing address, whatever Shop named the fields. */
export function cardFromShopInstrument(value: unknown): CheckoutCard {
  const instrument = record(value);
  const credential = record(instrument.credential);
  const card = Object.keys(record(credential.card)).length > 0 ? record(credential.card) : credential;
  const number = (text(card.number) || text(card.card_number) || text(card.pan)).replace(/\s+/g, "");
  const cvc = text(card.cvc) || text(card.cvv) || text(card.security_code);
  let month = Number(card.exp_month ?? card.expiry_month ?? card.expiration_month ?? card.month);
  let year = Number(card.exp_year ?? card.expiry_year ?? card.expiration_year ?? card.year);
  const expiry = text(card.expiry) || text(card.expiration) || text(card.exp);
  if ((!Number.isInteger(month) || !Number.isInteger(year)) && /^\d{1,2}\s*\/\s*\d{2,4}$/.test(expiry)) {
    const [m, y] = expiry.split("/").map((part) => Number(part.trim()));
    month = m as number; year = y as number;
  }
  if (!/^\d{12,19}$/.test(number) || !/^\d{3,4}$/.test(cvc) || !Number.isInteger(month) || !Number.isInteger(year)) throw new Error("Shop's card has no complete card");
  const billing = record(instrument.billing_address ?? credential.billing_address);
  const holder = text(card.name) || text(card.cardholder_name) || [text(billing.first_name), text(billing.last_name)].filter((part) => part.length > 0).join(" ");
  return {
    number,
    cvc,
    expMonth: month,
    expYear: year < 100 ? 2000 + year : year,
    ...(Object.keys(billing).length === 0 ? {} : {
      billing: {
        name: holder,
        line1: text(billing.street_address) || text(billing.line1),
        line2: text(billing.extended_address) || text(billing.line2),
        city: text(billing.address_locality) || text(billing.city),
        state: text(billing.address_region) || text(billing.state),
        postalCode: text(billing.postal_code),
        country: text(billing.address_country) || text(billing.country),
      },
    }),
  };
}

/** A Shop checkout this computer opened, under its handle: the id and link carry a key to it, so they stay here. */
interface StoredCheckout {
  readonly shop: string;
  readonly id: string;
  readonly continueUrl?: string;
  readonly merchant?: string;
  readonly productUrl?: string;
  readonly createdAtMs: number;
}

/** What the checkout card needs from a Shop checkout (`shopCheckoutCard`). */
export type ShopCheckoutFacts =
  | {
    readonly ok: true;
    readonly merchant?: string;
    /** The product's page, else the store's own address (what Review order opens). */
    readonly url: string;
    readonly domain: string;
    readonly amount: number;
    readonly currency: string;
    readonly items: readonly { readonly name: string; readonly quantity: number; readonly unitAmount?: number; readonly description?: string }[];
    readonly totals: readonly { readonly type: string; readonly label: string; readonly amount: number }[];
    readonly imageUrl?: string;
    /** The store's icon, once the host kept it where the apps read it. */
    readonly iconUrl?: string;
    readonly facts: Extract<CheckoutFacts, { ok: true }>;
  }
  | { readonly ok: false; readonly message: string };

/** How paying a Shop checkout went (`completeShopCheckout`). */
export type ShopCheckoutOutcome =
  | { readonly ok: true; readonly status: "completed"; readonly order: string }
  | { readonly ok: true; readonly status: "requires_escalation"; readonly url?: string; readonly message: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export interface ShopToolsOptions {
  readonly client: ShopClient;
  readonly rootDir: () => string;
  /** Types the card into the checkout (`checkout-fill.ts`); absent where there is no browser to fill. */
  readonly fillCheckout?: typeof FillCheckout;
  /**
   * Whether the person's Link is connected: when Shop can't finish a
   * checkout, the agent goes on to the store's own checkout and pays with
   * Link rather than sending them Shop's page (18 October 2026, the founder:
   * "the shop confusion is annoying. knowing it could clearly use link").
   */
  readonly linkConnected?: () => boolean;
  /** Link's saved delivery addresses (`link-tools.ts`), for what Shop's saved one lacks: the apartment line. */
  readonly linkAddresses?: () => Promise<readonly LinkDeliveryAddress[]>;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (message: string) => void;
}

export function createShopTools(options: ShopToolsOptions) {
  const { client } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? (() => undefined);
  /** One `get_spend_request` at a time per request: Shop says never two at once (each may issue the card). */
  const reading = new Map<string, Promise<ShopAnswer>>();

  const checkoutsFile = (): string => join(shopDir(options.rootDir()), "checkouts.json");
  const readCheckouts = (): Record<string, StoredCheckout> => {
    try { const value = JSON.parse(readFileSync(checkoutsFile(), "utf8")) as unknown; return value != null && typeof value === "object" ? value as Record<string, StoredCheckout> : {}; } catch { return {}; }
  };
  const writeCheckouts = (all: Record<string, StoredCheckout>): void => {
    const dir = shopDir(options.rootDir());
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { chmodSync(dir, 0o700); } catch { /* best effort */ }
    // Shop's checkouts last six hours; older ones and all but the latest fifty go.
    const kept = Object.entries(all).filter(([, item]) => now() - item.createdAtMs < 6 * 3_600_000).sort((a, b) => b[1].createdAtMs - a[1].createdAtMs).slice(0, 50);
    const temporary = `${checkoutsFile()}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(kept)), { mode: 0o600 });
    renameSync(temporary, checkoutsFile());
  };
  const storeCheckout = (item: StoredCheckout): string => {
    const handle = `chk_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    writeCheckouts({ ...readCheckouts(), [handle]: item });
    return handle;
  };
  const storedCheckout = (handle: string): StoredCheckout | undefined => readCheckouts()[handle.trim()];

  const answerText = (answer: ShopAnswer, lead?: string): LinkToolResult => {
    if (!answer.ok) return { text: answer.code === "NOT_AUTHENTICATED" ? NOT_CONNECTED : `Shop: ${answer.message} (${answer.code})`, isError: true };
    if (answer.isError) return { text: `Shop: ${answer.text || "it refused this."}${answer.errorCode == null ? "" : ` (${answer.errorCode})`}`, isError: true };
    const body = JSON.stringify(scrubShopSecrets(answer.value ?? answer.text), null, 1);
    return { text: lead == null ? body : `${lead}\n${body}`, isError: false };
  };

  /** One spend request read, never two at once. */
  const readSpend = (id: string): Promise<ShopAnswer> => {
    const running = reading.get(id);
    if (running != null) return running;
    const next = client.call("get_spend_request", { id }, "required").finally(() => reading.delete(id));
    reading.set(id, next);
    return next;
  };

  const spendAnswer = (answer: ShopAnswer): SpendAnswer => {
    if (!answer.ok) return { ok: false, code: answer.code, message: answer.code === "NOT_AUTHENTICATED" ? "Shop isn't connected any more." : answer.message };
    if (answer.isError) return { ok: false, code: answer.errorCode ?? "SHOP_REFUSED", message: answer.text || "Shop refused this purchase." };
    const root = record(answer.value);
    const request = Object.keys(record(root.spend_request)).length > 0 ? record(root.spend_request) : root;
    const id = text(request.id);
    if (id.length === 0) return { ok: false, code: "NO_SPEND_REQUEST", message: "Shop answered without a purchase request." };
    const url = text(request.continue_url) || text(root.continue_url);
    return { ok: true, id, status: text(request.status), ...(url.startsWith("https://") ? { approvalUrl: url } : {}) };
  };

  /** The person's account: their saved cards (the chooser), addresses, name; NOT_CONNECTED when Shop isn't. */
  const account = async (): Promise<{ readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly message: string }> => {
    const answer = await client.call("get_account", {}, "required");
    if (!answer.ok) return { ok: false, message: answer.code === "NOT_AUTHENTICATED" ? NOT_CONNECTED : `Shop: ${answer.message} (${answer.code})` };
    if (answer.isError) return { ok: false, message: `Shop: ${answer.text || "it couldn't read the account."}` };
    return { ok: true, value: record(answer.value) };
  };

  const cardsOf = (value: Record<string, unknown>): { readonly cards: LinkCardChoice[]; readonly preferred: string } => {
    const preferred = text(value.preferred_instrument_id);
    const cards = records(value.selectable_instruments).filter((item) => text(item.id).length > 0).map((item): LinkCardChoice => ({ id: text(item.id), ...shopCardOf(item), isDefault: text(item.id) === preferred }));
    return { cards, preferred };
  };

  /**
   * Before a checkout card paid with a Shop spend request: Shop is connected
   * and which saved card pays (the one asked for, else the preferred or only
   * one; "" when the person picks on the card). Shop has no per-purchase
   * limits of its own to check; the card's total is the request's limit.
   */
  const checkoutFacts = async (request: { readonly amount: number; readonly currency: string; readonly paymentMethodId?: string }): Promise<CheckoutFacts> => {
    const read = await account();
    if (!read.ok) return { ok: false, message: read.message };
    const { cards, preferred } = cardsOf(read.value);
    const buyer = record(read.value.buyer);
    const holderName = [text(buyer.first_name), text(buyer.last_name)].filter((part) => part.length > 0).join(" ") || text(buyer.name);
    const holder = holderName.length > 0 ? { holder: holderName } : {};
    if (cards.length === 0) {
      const lines = messageLines(read.value.messages);
      return { ok: false, message: `The person has no saved card in Shop that an agent can pay with${lines.length > 0 ? ` (${lines.join(" ")})` : ""}. Ask them to add one in the Shop app, then call RequestPurchase again.` };
    }
    const wanted = request.paymentMethodId?.trim() ?? "";
    const chosen = wanted.length > 0 ? cards.find((card) => card.id === wanted) : cards.find((card) => card.id === preferred) ?? (cards.length === 1 ? cards[0] : undefined);
    if (wanted.length > 0 && chosen == null) return { ok: false, message: `Shop has no saved card "${wanted}" for this person. Leave payment_method_id out: the card lets them choose.` };
    if (chosen == null) return { ok: true, paymentMethodId: "", card: { brand: "", last4: "", name: "" }, cards, ...holder };
    return { ok: true, paymentMethodId: chosen.id, card: { brand: chosen.brand, last4: chosen.last4, name: chosen.name }, cards, ...holder };
  };

  /**
   * At Allow, for a store checked out in the browser: Shop is asked for a
   * one-time card for exactly this purchase (a spend request, its limit the
   * card's total), and Shop asks the person to approve it in the Shop app.
   * Shop has no approval given elsewhere to take, so `approval` is not sent.
   */
  const requestSpend = async (input: SpendRequestInput): Promise<SpendAnswer> => {
    const url = (() => { try { return new URL(input.merchantUrl).origin; } catch { return ""; } })();
    if (url.length === 0) return { ok: false, code: "BAD_MERCHANT_URL", message: "The checkout's address isn't one Shop can name as the store." };
    const items = input.lineItems.filter((item) => Number.isInteger(item.unitAmount)).map((item) => ({ item: { title: item.name.slice(0, 200), price: item.unitAmount as number }, quantity: item.quantity }));
    const instrument = (input.paymentMethodId ?? "").trim();
    const answer = await client.call("create_spend_request", {
      spend_request: {
        business: { name: input.merchantName.slice(0, 200), url },
        currency: (input.currency || "usd").toUpperCase(),
        ...(items.length === input.lineItems.length && items.length > 0 ? { line_items: items } : {}),
        totals: shopTotals(input.totals, input.amount),
        approval_limit: input.amount,
        ...(UUID.test(instrument) ? { instrument_id: instrument } : {}),
        context: { intent: input.context.slice(0, 500) },
      },
      meta: { "idempotency-key": shopIdempotencyKey(input.idempotencyKey) },
    }, "required");
    const spend = spendAnswer(answer);
    if (spend.ok) log(`[shop] purchase requested: ${spend.status} ${spend.id}`);
    else log(`[shop] purchase request refused: ${spend.code} ${spend.message.split("\n")[0]?.slice(0, 200) ?? ""}`);
    return spend;
  };

  /** Where a spend request stands, looking every five seconds for up to `seconds` while it is pending. */
  const spendStatus = async (id: string, seconds: number): Promise<SpendAnswer | { readonly ok: false; readonly code: "POLLING_TIMEOUT"; readonly message: string }> => {
    const started = now();
    for (;;) {
      const answer = spendAnswer(await readSpend(id));
      if (!answer.ok || answer.status !== "pending") return answer;
      if (now() - started >= Math.max(0, seconds) * 1000) return { ok: false, code: "POLLING_TIMEOUT", message: `Still waiting for the person to approve in the Shop app after ${seconds} seconds.` };
      await sleep(5_000);
    }
  };

  const cancelSpend = async (id: string): Promise<boolean> => {
    const answer = await client.call("cancel_spend_request", { id }, "required");
    return answer.ok && !answer.isError;
  };

  /** Shop's record of how a purchase went (`complete_spend_request`; best effort). */
  const reportOutcome = async (args: { readonly domain: string; readonly spendRequestId: string; readonly outcome: "success" | "blocked" | "abandoned"; readonly context?: string; readonly order?: string }): Promise<void> => {
    if (args.spendRequestId.length === 0) return;
    const order = args.order?.trim() ?? "";
    const result = args.outcome === "success"
      ? { status: "success", ...(order.length > 0 ? { order: { id: order.slice(0, 120) } } : {}) }
      : { status: "error", failure_code: "other", message: (args.context?.trim() || (args.outcome === "abandoned" ? "Canceled before paying." : "The purchase didn't go through.")).slice(0, 500) };
    const answer = await client.call("complete_spend_request", { id: args.spendRequestId, result }, "required");
    if (!answer.ok || answer.isError) log(`[shop] report failed: ${answer.ok ? answer.errorCode ?? "refused" : answer.code}`);
  };

  /** One approved spend request's one-time card, handed to `use`; it never touches the disk. */
  const withCard = async <T>(id: string, use: (card: CheckoutCard) => Promise<T>): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }> => {
    const answer = await readSpend(id);
    if (!answer.ok) return { ok: false, message: answer.code === "NOT_AUTHENTICATED" ? NOT_CONNECTED : `Shop: ${answer.message} (${answer.code})` };
    if (answer.isError) return { ok: false, message: answer.errorCode === "materialization_in_progress" ? "Shop is still preparing the card; try pay_checkout again in a few seconds." : `Shop: ${answer.text || "it refused."}` };
    const request = Object.keys(record(record(answer.value).spend_request)).length > 0 ? record(record(answer.value).spend_request) : record(answer.value);
    const status = text(request.status);
    if (status === "pending") return { ok: false, message: "This purchase isn't approved yet: call wait_for_approval first." };
    if (status !== "consumed" && status !== "approved") return { ok: false, message: `This purchase is ${status || "not approved"}: tell the person, and create a new purchase only if they ask.` };
    const instrument = request.instrument ?? record(answer.value).instrument;
    if (instrument == null) return { ok: false, message: "Shop approved it but hasn't issued the card yet; try pay_checkout again in a few seconds." };
    let card: CheckoutCard;
    try { card = cardFromShopInstrument(instrument); } catch (error) { return { ok: false, message: `Shop's card could not be read: ${error instanceof Error ? error.message : String(error)}` }; }
    return { ok: true, value: await use(card) };
  };

  /** A checkout's document without what Shop fills in itself, for `update_checkout` (which replaces the whole document). */
  const editable = (doc: Record<string, unknown>): Record<string, unknown> => {
    const { next: _next, signals: _signals, attribution: _attribution, ...rest } = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    return rest;
  };

  const update = async (shop: string, doc: Record<string, unknown>, key: string): Promise<Record<string, unknown> | undefined> => {
    const answer = await client.call("update_checkout", { shop, id: text(doc.id), checkout: editable(doc), meta: { "idempotency-key": shopIdempotencyKey(key) } }, "required");
    return answer.ok && !answer.isError ? record(answer.value) : undefined;
  };

  /** The account's preferred address (else its only one), copied unchanged. */
  const preferredAddress = (value: Record<string, unknown>): Record<string, unknown> | undefined => {
    const addresses = records(value.addresses);
    const preferred = text(value.preferred_address_id);
    return addresses.find((item) => text(item.id) === preferred) ?? (addresses.length === 1 ? addresses[0] : undefined);
  };

  /** One option's price, for choosing the cheapest delivery. */
  const optionCost = (option: Record<string, unknown>): number => {
    const totals = records(option.totals);
    const total = totals.find((line) => text(line.type) === "total") ?? totals[0];
    const amount = Number(total?.amount ?? record(option.price).amount ?? option.amount);
    return Number.isFinite(amount) ? amount : Number.MAX_SAFE_INTEGER;
  };

  /**
   * `prepare_checkout`: the checkout opened through Shop, the delivery
   * address and the cheapest delivery filled in from the account, then read
   * once more; ready when Shop says `ready_for_complete` and offers a way to
   * pay. The checkout is kept here under a handle.
   */
  const prepareCheckout = async (args: Record<string, unknown>): Promise<LinkToolResult> => {
    const shop = text(args.shop).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    const items = records(args.items).map((item) => ({ id: text(item.variant_id), quantity: Math.max(1, Math.round(Number(item.quantity ?? 1)) || 1) })).filter((item) => item.id.length > 0);
    if (shop.length === 0 || items.length === 0) return { text: "prepare_checkout needs shop (the store's shop domain from search_products) and items with their variant_id.", isError: true };
    const read = await account();
    if (!read.ok) return { text: `${read.message} Without Shop, buy it in the browser: open the product's page and go through its checkout, then RequestPurchase.`, isError: true };
    const saved = preferredAddress(read.value);
    const key = `${shop}\u0000${JSON.stringify(items)}\u0000${now()}`;
    const buyer = checkoutBuyer(record(read.value.buyer), saved, { phone: text(args.phone), email: text(args.email) });
    // The delivery address carries the phone too: a store's delivery method
    // can want one on the address itself, whatever the buyer has (18 October
    // 2026, Deskery through Shop: "Enter a phone number to use this delivery
    // method", the phone having gone on the buyer only). And the apartment
    // line Link has for the same place when Shop's lacks it (OfficeTap).
    const link = saved == null || options.linkAddresses == null ? [] : await options.linkAddresses().catch(() => []);
    const completed = saved == null ? undefined : withLinkLine2(saved, link);
    if (completed !== saved) log("[shop] delivery address: apartment line from Link");
    const address = completed == null ? undefined : withDeliveryPhone(completed, buyer?.phone_number ?? "");
    const created = await client.call("create_checkout", {
      shop,
      checkout: { line_items: items.map((item) => ({ item: { id: item.id }, quantity: item.quantity })), context: { address_country: text(address?.address_country) || "US" }, ...(buyer === undefined ? {} : { buyer }) },
      meta: { "idempotency-key": shopIdempotencyKey(`${key}\u0000create`) },
    }, "required");
    if (!created.ok || created.isError) return answerText(created);
    let doc = record(created.value);
    if (text(doc.id).length === 0) return { text: "Shop opened no checkout for this.", isError: true };
    // The delivery address: the account's preferred one, where the checkout
    // has a delivery method waiting for one, or has it chosen without the
    // phone or the apartment line this one now carries.
    const methods = records(record(doc.fulfillment).methods);
    const phoneOf = (place: Record<string, unknown> | undefined): string => { const own = text(place?.phone_number) || text(place?.phone); return own.includes("*") ? "" : own; };
    const chosenIncomplete = (method: Record<string, unknown>): boolean => {
      const chosen = text(method.selected_destination_id);
      const place = records(method.destinations).find((item) => text(item.id) === chosen);
      const lacksPhone = phoneOf(place).length === 0 && phoneOf(address).length > 0;
      const lacksLine2 = text(place?.extended_address).length === 0 && text(address?.extended_address).length > 0;
      return chosen.length > 0 && chosen === text(address?.id) && (lacksPhone || lacksLine2);
    };
    if (address != null && methods.length > 0 && (methods.every((method) => text(method.selected_destination_id).length === 0) || chosenIncomplete(methods[0]!))) {
      const withAddress = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      const first = records(record(withAddress.fulfillment).methods)[0] as Record<string, unknown>;
      first.destinations = [...records(first.destinations).filter((item) => text(item.id) !== text(address.id)), address];
      first.selected_destination_id = text(address.id);
      doc = await update(shop, withAddress, `${key}\u0000address`) ?? doc;
    }
    // The cheapest delivery, where a group of options has none chosen.
    const groups = records(record(doc.fulfillment).methods).flatMap((method) => records(method.groups));
    if (groups.some((group) => text(group.selected_option_id).length === 0 && records(group.options).length > 0)) {
      const withDelivery = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      for (const method of records(record(withDelivery.fulfillment).methods)) {
        for (const group of records(method.groups)) {
          const options = records(group.options);
          if (text(group.selected_option_id).length > 0 || options.length === 0) continue;
          const cheapest = [...options].sort((a, b) => optionCost(a) - optionCost(b))[0];
          if (cheapest != null) group.selected_option_id = text(cheapest.id);
        }
      }
      doc = await update(shop, withDelivery, `${key}\u0000delivery`) ?? doc;
    }
    const discount = text(args.discount_code);
    if (discount.length > 0) {
      const withCode = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      withCode.discounts = { ...record(withCode.discounts), codes: [discount] };
      doc = await update(shop, withCode, `${key}\u0000discount`) ?? doc;
    }
    const status = text(doc.status);
    const instruments = records(record(doc.payment).instruments);
    const lines = messageLines(doc.messages);
    const totals = records(doc.totals).map((line) => `${text(line.display_text) || text(line.type)}: ${formatPurchaseMoney(Number(line.amount), text(doc.currency) || "usd")}`);
    const bought = records(doc.line_items).map((line) => `${text(record(line.item).title)} ×${Number(line.quantity) || 1}`);
    const productUrl = text(args.product_url);
    const handle = storeCheckout({ shop, id: text(doc.id), ...(text(doc.continue_url).startsWith("https://") ? { continueUrl: text(doc.continue_url) } : {}), ...(text(args.merchant_name).length > 0 ? { merchant: text(args.merchant_name) } : {}), ...(/^https:\/\//.test(productUrl) ? { productUrl } : {}), createdAtMs: now() });
    log(`[shop] checkout ${handle} at ${shop}: ${status}${instruments.length > 0 ? `, ${instruments.length} way(s) to pay` : ", nothing to pay with"}`);
    const summary = [`Items: ${bought.join(", ")}.`, `Totals: ${totals.join("; ")}.`, ...(lines.length > 0 ? [`Shop says: ${lines.join(" ")}`] : [])].join(" ");
    if (status === "ready_for_complete" && instruments.length > 0) {
      return { text: `The Shop checkout ${handle} is ready. ${summary} Now call RequestPurchase with shop_checkout "${handle}", merchant_name, checkout_url (the product's page), these items and the total; the person checks the card and presses Allow, and Shop places the order with their Shop Pay card. Show every warning above to them first.`, isError: false };
    }
    if (status === "completed") return { text: `Shop says this checkout is already completed. ${summary}`, isError: false };
    // Shop's own page to review and pay it, which its tool asks to be shared
    // unchanged (18 October 2026: the agent was sent to the store's site
    // instead, which wanted the same sign-in Shop had stopped at).
    const continueUrl = text(doc.continue_url);
    // With Link connected the store's own checkout comes next, paid with
    // Link, and Shop's page only if that fails; without it, Shop's page.
    if (options.linkConnected?.() === true) {
      const page = /^https:\/\//.test(productUrl) ? ` (${productUrl})` : "";
      return {
        text: `Shop can't finish this checkout by itself (${status || "no status"}). ${summary} The person's Link is connected, so finish it at the store's own checkout and pay with Link, without asking them first: say in one line that you're finishing it at the store with Link, then send a browser subagent to the product's page${page} to add it to the cart and go through the store's checkout as a guest, with the contact and delivery details from Link's get_wallet, stopping at the last step before paying; then call RequestPurchase as for any store.${continueUrl.startsWith("https://") ? ` Only if the store's checkout won't work, send them Shop's own page to pay there: ${continueUrl}` : ""}`,
        isError: false,
      };
    }
    if (continueUrl.startsWith("https://")) {
      return {
        text: `Shop can't finish this checkout by itself (${status || "no status"}). ${summary} Send the person Shop's own page for it, unchanged, as a link to review and pay there (they're signed in to Shop on their phone): ${continueUrl} Say in one line what's in it and why Shop needs them; nothing is paid until they pay on that page. If they'd rather not, go on to the next comparable item.`,
        isError: false,
      };
    }
    return {
      text: `Shop can't finish this checkout by itself (${status || "no status"}). ${summary} Buy it in the browser instead: open the product's page, add it to the cart and go to the store's checkout, then call RequestPurchase as for any store.`,
      isError: false,
    };
  };

  /**
   * What the checkout card shows for a Shop checkout, read afresh: Shop's own
   * items, totals and ways to pay, never the agent's. Not ready, or nothing
   * to pay with, says why.
   */
  const shopCheckoutCard = async (handle: string): Promise<ShopCheckoutFacts> => {
    const stored = storedCheckout(handle);
    if (stored == null) return { ok: false, message: `No Shop checkout "${handle}" on this computer (checkouts last six hours). Call prepare_checkout again.` };
    const answer = await client.call("get_checkout", { shop: stored.shop, id: stored.id }, "required");
    if (!answer.ok || answer.isError) return { ok: false, message: answerText(answer).text };
    const doc = record(answer.value);
    if (text(doc.status) !== "ready_for_complete") return { ok: false, message: `This Shop checkout is ${text(doc.status) || "not ready"}, not ready to pay${messageLines(doc.messages).length > 0 ? `: ${messageLines(doc.messages).join(" ")}` : ""}. Call prepare_checkout again, or buy it in the browser.` };
    const instruments = records(record(doc.payment).instruments).filter((item) => text(item.id).length > 0);
    if (instruments.length === 0) return { ok: false, message: "Shop offers no way to pay this checkout for the person. Buy it in the browser instead." };
    const currency = text(doc.currency).toLowerCase() || "usd";
    const totals = records(doc.totals);
    const total = Number(totals.find((line) => text(line.type) === "total")?.amount);
    if (!Number.isInteger(total) || total <= 0) return { ok: false, message: "Shop's checkout has no total." };
    const kinds: Record<string, string> = { subtotal: "subtotal", fulfillment: "shipping", shipping: "shipping", tax: "tax", discount: "discount", items_discount: "discount", fee: "fee", total: "total" };
    const cards = instruments.map((item): LinkCardChoice => ({ id: text(item.id), ...shopCardOf(item), isDefault: item.selected === true }));
    const only = cards.length === 1 ? cards[0] : undefined;
    const lineItems = records(doc.line_items);
    const image = lineItems.map((line) => text(record(line.item).image_url)).find((url) => url.startsWith("https://"));
    const url = stored.productUrl ?? `https://${stored.shop}`;
    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return stored.shop; } })();
    return {
      ok: true,
      ...(stored.merchant == null ? {} : { merchant: stored.merchant }),
      url,
      domain,
      amount: total,
      currency,
      items: lineItems.map((line) => {
        const item = record(line.item);
        const price = Number(item.price);
        return { name: text(item.title) || "Item", quantity: Math.max(1, Number(line.quantity) || 1), ...(Number.isInteger(price) ? { unitAmount: price } : {}) };
      }),
      totals: totals.filter((line) => kinds[text(line.type)] != null && kinds[text(line.type)] !== "total" && Number.isInteger(Number(line.amount))).map((line) => ({ type: kinds[text(line.type)] as string, label: text(line.display_text) || text(line.type), amount: Math.abs(Number(line.amount)) })),
      ...(image == null ? {} : { imageUrl: image }),
      facts: { ok: true, paymentMethodId: only?.id ?? "", card: only == null ? { brand: "", last4: "", name: "" } : { brand: only.brand, last4: only.last4, name: only.name }, cards },
    };
  };

  /**
   * At Allow on a Shop checkout's card: read afresh, still ready and still
   * the total the person saw, then paid once with the way to pay they picked
   * (copied exactly as Shop offered it, `selected: true`). An answer that
   * never came back is read again, never sent twice.
   */
  const completeShopCheckout = async (args: { readonly handle: string; readonly instrumentId?: string; readonly amount: number; readonly currency: string; readonly idempotencyKey: string }): Promise<ShopCheckoutOutcome> => {
    const stored = storedCheckout(args.handle);
    if (stored == null) return { ok: false, code: "NO_CHECKOUT", message: "This Shop checkout is no longer on the computer (they last six hours)." };
    const read = await client.call("get_checkout", { shop: stored.shop, id: stored.id }, "required");
    if (!read.ok || read.isError) return { ok: false, code: read.ok ? read.errorCode ?? "SHOP_REFUSED" : read.code, message: read.ok ? read.text : read.message };
    const doc = record(read.value);
    const status = text(doc.status);
    if (status === "completed") return { ok: true, status: "completed", order: orderLabel(doc.order) };
    if (status === "requires_escalation") return { ok: true, status: "requires_escalation", ...(text(doc.continue_url).startsWith("https://") ? { url: text(doc.continue_url) } : {}), message: messageLines(doc.messages).join(" ") || "The shop needs you to finish a step on its page." };
    if (status !== "ready_for_complete") return { ok: false, code: "CHECKOUT_NOT_READY", message: `The checkout is ${status || "not ready"}; nothing was paid.` };
    const total = Number(records(doc.totals).find((line) => text(line.type) === "total")?.amount);
    if (total !== args.amount || (text(doc.currency).toLowerCase() || "usd") !== args.currency.toLowerCase()) {
      return { ok: false, code: "TOTAL_CHANGED", message: `The total changed to ${formatPurchaseMoney(total, text(doc.currency) || "usd")} since the card was shown; nothing was paid.` };
    }
    const instruments = records(record(doc.payment).instruments);
    const wanted = args.instrumentId?.trim() ?? "";
    const instrument = wanted.length > 0 ? instruments.find((item) => text(item.id) === wanted) : instruments.length === 1 ? instruments[0] : undefined;
    if (instrument == null) return { ok: false, code: "NO_INSTRUMENT", message: wanted.length > 0 ? "The card picked is no longer offered for this checkout; nothing was paid." : "Choose the card that pays, then press Allow." };
    const sent = await client.call("complete_checkout", {
      shop: stored.shop,
      id: stored.id,
      checkout: { payment: { instruments: [{ ...JSON.parse(JSON.stringify(instrument)) as Record<string, unknown>, selected: true }] } },
      meta: { "idempotency-key": shopIdempotencyKey(`${args.idempotencyKey}\u0000complete`) },
    }, "required");
    const settle = async (): Promise<ShopCheckoutOutcome> => {
      // Shop says: after an uncertain completion read the checkout; only completed with an order confirms it.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const again = await client.call("get_checkout", { shop: stored.shop, id: stored.id }, "required");
        const after = again.ok && !again.isError ? record(again.value) : undefined;
        if (after != null && text(after.status) === "completed" && after.order != null) return { ok: true, status: "completed", order: orderLabel(after.order) };
        if (after != null && text(after.status) === "requires_escalation") return { ok: true, status: "requires_escalation", ...(text(after.continue_url).startsWith("https://") ? { url: text(after.continue_url) } : {}), message: messageLines(after.messages).join(" ") || "The shop needs you to finish a step on its page." };
        if (after != null && text(after.status) !== "complete_in_progress") break;
        await sleep(3_000);
      }
      return { ok: false, code: "UNCERTAIN", message: "Shop didn't confirm the order. Check the Shop app or your email before trying again." };
    };
    if (!sent.ok) {
      log(`[shop] completing ${args.handle} got no answer (${sent.code}); reading it again`);
      return await settle();
    }
    if (sent.isError) return { ok: false, code: sent.errorCode ?? "SHOP_REFUSED", message: sent.text || "Shop refused the payment; nothing was paid." };
    const done = record(sent.value);
    if (text(done.status) === "completed" && done.order != null) return { ok: true, status: "completed", order: orderLabel(done.order) };
    if (text(done.status) === "requires_escalation") return { ok: true, status: "requires_escalation", ...(text(done.continue_url).startsWith("https://") ? { url: text(done.continue_url) } : {}), message: messageLines(done.messages).join(" ") || "The shop needs you to finish a step on its page." };
    return await settle();
  };

  /** A Shop checkout handed to the person (`requires_escalation`): where it stands now. */
  const shopCheckoutStatus = async (handle: string): Promise<{ readonly status: "completed"; readonly order: string } | { readonly status: "waiting" | "canceled" | "gone" }> => {
    const stored = storedCheckout(handle);
    if (stored == null) return { status: "gone" };
    const read = await client.call("get_checkout", { shop: stored.shop, id: stored.id }, "required");
    const doc = read.ok && !read.isError ? record(read.value) : undefined;
    if (doc == null) return { status: "waiting" };
    if (text(doc.status) === "completed" && doc.order != null) return { status: "completed", order: orderLabel(doc.order) };
    if (text(doc.status) === "canceled") return { status: "canceled" };
    return { status: "waiting" };
  };

  const call = async (name: string, args: Record<string, unknown>): Promise<LinkToolResult> => {
    switch (name) {
      case "search_products": {
        const query = text(args.query);
        const like = text(args.like_product_id);
        if (query.length === 0 && like.length === 0) return { text: "search_products needs query (or like_product_id).", isError: true };
        const currency = (text(args.currency) || "USD").toUpperCase();
        const filters: Record<string, unknown> = {};
        const min = Number(args.min_price), max = Number(args.max_price);
        if (Number.isInteger(min) || Number.isInteger(max)) filters.price = { ...(Number.isInteger(min) ? { min } : {}), ...(Number.isInteger(max) ? { max } : {}) };
        const attributes = [["Size", text(args.size)], ["Color", text(args.color)]].filter(([, value]) => (value as string).length > 0).map(([attribute, value]) => ({ name: attribute, values: [value] }));
        if (attributes.length > 0) filters.attributes = attributes;
        if (text(args.ships_to).length > 0) filters.ships_to = { country: text(args.ships_to).toUpperCase() };
        const shops = Array.isArray(args.shops) ? args.shops.map(text).filter((item) => item.length > 0) : [];
        if (shops.length > 0) filters.shops = shops;
        const limit = Math.max(1, Math.min(20, Math.round(Number(args.limit ?? 8)) || 8));
        const answer = await client.call("search_catalog", {
          catalog: {
            ...(query.length > 0 ? { query } : {}),
            ...(like.length > 0 ? { like: [{ id: like }] } : {}),
            context: { address_country: (text(args.country) || "US").toUpperCase(), currency },
            ...(Object.keys(filters).length > 0 ? { filters } : {}),
            pagination: { limit, ...(text(args.cursor).length > 0 ? { cursor: text(args.cursor) } : {}) },
          },
        }, "optional");
        if (!answer.ok || answer.isError) return answerText(answer);
        const value = record(answer.value);
        for (const product of records(value.products)) rememberProductPrice(product);
        const products = records(value.products).map(shopProductSummary);
        const pagination = record(value.pagination);
        const notes = messageLines(value.messages);
        log(`[shop] search: ${products.length} product(s)`);
        return { text: JSON.stringify({ products, ...(pagination.has_next_page === true && text(pagination.cursor).length > 0 ? { next_cursor: text(pagination.cursor) } : {}), ...(notes.length > 0 ? { notes } : {}) }, null, 1), isError: false };
      }
      case "get_product": {
        const id = text(args.product_id);
        if (id.length === 0) return { text: "product_id is required.", isError: true };
        const chosen = Object.entries(record(args.options)).map(([optionName, label]) => ({ name: optionName, label: text(label) })).filter((pick) => pick.label.length > 0);
        const answer = await client.call("get_product", { catalog: { id, ...(chosen.length > 0 ? { selected: chosen } : {}), context: { address_country: (text(args.country) || "US").toUpperCase(), currency: (text(args.currency) || "USD").toUpperCase() } } }, "optional");
        if (!answer.ok || answer.isError) return answerText(answer);
        const value = record(answer.value);
        const product = Object.keys(record(value.product)).length > 0 ? record(value.product) : value;
        rememberProductPrice(product);
        const notes = messageLines(value.messages);
        return { text: JSON.stringify({ ...shopProductSummary(product), ...(notes.length > 0 ? { notes } : {}) }, null, 1), isError: false };
      }
      case "get_account": {
        const read = await account();
        if (!read.ok) return { text: read.message, isError: true };
        return { text: JSON.stringify(scrubShopSecrets(read.value), null, 1), isError: false };
      }
      case "search_orders": {
        const query: Record<string, unknown> = {};
        for (const key of ["query", "activity", "date_from", "date_to"] as const) if (text(args[key]).length > 0) query[key] = text(args[key]);
        if (args.limit != null) query.pagination = { limit: Math.max(1, Math.min(25, Math.round(Number(args.limit)) || 10)) };
        return answerText(await client.call("search_orders", query, "required"));
      }
      case "prepare_checkout":
        return await prepareCheckout(args);
      case "wait_for_approval": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        const seconds = Math.max(10, Math.min(600, Math.round(Number(args.wait_seconds ?? 120)) || 120));
        const answer = await spendStatus(id, seconds);
        if (!answer.ok) return { text: answer.code === "POLLING_TIMEOUT" ? `${answer.message} Call wait_for_approval again, or remind them.` : `Shop: ${answer.message} (${answer.code})`, isError: answer.code !== "POLLING_TIMEOUT" };
        return { text: JSON.stringify({ id: answer.id, status: answer.status }), isError: false };
      }
      case "pay_checkout": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        if (options.fillCheckout == null) return { text: "This computer has no browser to fill a checkout in.", isError: true };
        const fill = options.fillCheckout;
        const used = await withCard(id, async (card) => await fill({ card, pageHint: text(args.checkout_url) }));
        if (!used.ok) return { text: used.message, isError: true };
        return fillAnswer(used.value);
      }
      case "cancel_purchase": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        const answer = await client.call("cancel_spend_request", { id }, "required");
        return answerText(answer, answer.ok && !answer.isError ? "Canceled." : undefined);
      }
      case "create_purchase":
      case "create_spend_request":
        return { text: "Purchases start with RequestPurchase, which shows the person the checkout card; Shop is asked only when they press Allow.", isError: true };
      default:
        return { text: `Shop has no tool "${name}". Its tools: ${SHOP_TOOLS.map((tool) => tool.name).join(", ")}.`, isError: true };
    }
  };

  /** Starts Shop's device sign-in; a forced one signs out first. Already connected answers so. */
  const startSignIn = async (forceReauth: boolean): Promise<{ readonly authenticated: true } | { readonly url: string; readonly phrase: string } | { readonly error: string }> => {
    if (forceReauth) await client.signOut();
    else if ((await client.signInStatus()).authenticated) return { authenticated: true };
    return await client.startSignIn();
  };

  return {
    tools: SHOP_TOOLS,
    call,
    signInStatus: client.signInStatus,
    /** Whether a Shop sign-in is kept on this computer (no call made). */
    hasSignIn: client.hasSignIn,
    startSignIn,
    signOut: client.signOut,
    checkoutFacts,
    requestSpend,
    spendStatus,
    cancelSpend,
    reportOutcome,
    withCard,
    shopCheckoutCard,
    completeShopCheckout,
    shopCheckoutStatus,
  };
}

export type ShopTools = ReturnType<typeof createShopTools>;

/** An order as the card names it: its name or number ("#1042"), never Shop's long id. */
function orderLabel(value: unknown): string {
  const order = record(value);
  const label = text(order.name) || text(order.number) || text(order.order_number) || text(order.confirmation_number);
  if (label.length > 0) return label.slice(0, 80);
  const id = text(order.id);
  const tail = /(\d+)(?:\?.*)?$/.exec(id)?.[1];
  return tail != null ? `#${tail}` : "placed";
}
