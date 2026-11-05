// Putting Link's one-time card into a merchant's checkout without the agent
// ever reading it (13 October 2026). The agent opens the checkout in the
// cloud computer's Chrome; this connects to that Chrome over its DevTools
// port (127.0.0.1:9223 for the first desktop, 9222+N for window N,
// `box/bin/box-chrome`), finds the tab (by the address the agent gives, else
// the one with card fields), finds the card fields in the page and in its
// payment frames (Stripe, Shopify, Braintree, Adyen and plain forms), and
// types the card in. It leaves the Pay button to the agent, which checks the
// order first. The card itself stays in this process; what comes back is
// which fields were filled.
//
// A billing ZIP or name is filled only where the field is plainly the
// card's (inside a payment frame beside the card number, or marked
// `billing` / `cc-name`), never a shipping address's.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { activateTab, hostOfAddress, listTabsOn, tabCommand, tabsShowing, wakeSleepingTabs, type BoxChromeTab } from "./box-chrome-tabs.js";

export interface CheckoutCard {
  readonly number: string;
  readonly cvc: string;
  readonly expMonth: number;
  readonly expYear: number;
  readonly billing?: {
    readonly name: string;
    readonly line1: string;
    readonly line2: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly country: string;
  };
}

export type CheckoutFillResult =
  | { readonly ok: true; readonly page: string; readonly filled: readonly string[]; readonly missing: readonly string[] }
  | { readonly ok: false; readonly message: string };

/** The few Playwright calls used here, so a test can hand in the real one and the box finds its own. */
export interface Locator {
  count(): Promise<number>;
  nth(index: number): Locator;
  isVisible(): Promise<boolean>;
  isEditable(): Promise<boolean>;
  click(options?: Record<string, unknown>): Promise<void>;
  fill(value: string, options?: Record<string, unknown>): Promise<void>;
  pressSequentially(value: string, options?: Record<string, unknown>): Promise<void>;
  selectOption(values: unknown, options?: Record<string, unknown>): Promise<unknown>;
  inputValue(options?: Record<string, unknown>): Promise<string>;
  evaluate<R>(fn: (element: never, arg: never) => R, arg?: unknown): Promise<R>;
  getAttribute(name: string): Promise<string | null>;
}
export interface Frame {
  url(): string;
  locator(selector: string): Locator;
  evaluate<R>(fn: (arg: never) => R, arg?: unknown): Promise<R>;
}
interface Page {
  url(): string;
  frames(): Frame[];
  mainFrame(): Frame;
  bringToFront(): Promise<void>;
  screenshot(options?: Record<string, unknown>): Promise<Uint8Array>;
}
interface Browser {
  contexts(): { pages(): Page[] }[];
  close(): Promise<void>;
}
export interface PlaywrightLike {
  chromium: { connectOverCDP(endpoint: string, options?: Record<string, unknown>): Promise<Browser> };
}

export interface FillCheckoutOptions {
  readonly card?: CheckoutCard;
  readonly linkPayToken?: string;
  /** The checkout's address or domain, as the agent gave it. */
  readonly pageHint?: string;
  /** DevTools ports to look at; by default the first desktop's and fifteen fork windows'. */
  readonly ports?: readonly number[];
  readonly loadPlaywright?: () => PlaywrightLike;
  /** Pause between typed keys, so masked fields keep up. */
  readonly keyDelayMs?: number;
}

/** The DevTools ports Chrome uses on the box: 9223 for :1, 9222+N for a fork window :N. */
export const BOX_CHROME_PORTS: readonly number[] = Array.from({ length: 16 }, (_unused, index) => 9223 + index);

type FieldKind = "card number" | "expiry" | "expiry month" | "expiry year" | "security code" | "name on card" | "billing ZIP";

const any = (selectors: readonly string[]): string => selectors.join(", ");
/** Each card field's usual marks: autocomplete first, then the payment providers' own names. */
const SELECTORS: Record<FieldKind, string> = {
  "card number": any([
    'input[autocomplete="cc-number"]', 'input[autocomplete$=" cc-number"]', 'input[name="cardnumber"]', 'input[name="cardNumber"]', 'input[name="card-number"]', 'input[name="card_number"]',
    'input[name="number"][autocomplete*="cc"]', 'input[id="number"]', 'input[id="card-number"]', 'input[id="cardNumber"]', 'input[id="credit-card-number"]',
    'input[data-elements-stable-field-name="cardNumber"]', 'input[data-fieldtype="encryptedCardNumber"]', 'input[placeholder="1234 1234 1234 1234"]',
    'input[aria-label*="card number" i]', 'input[placeholder*="card number" i]',
  ]),
  expiry: any([
    'input[autocomplete="cc-exp"]', 'input[autocomplete$=" cc-exp"]', 'input[name="exp-date"]', 'input[name="expiry"]', 'input[name="cardExpiry"]', 'input[name="expirationDate"]', 'input[name="cc-exp"]',
    'input[id="expiry"]', 'input[id="expiration"]', 'input[id="cardExpiry"]', 'input[data-elements-stable-field-name="cardExpiry"]', 'input[data-fieldtype="encryptedExpiryDate"]',
    'input[placeholder*="MM / YY" i]', 'input[placeholder*="MM/YY" i]', 'input[placeholder*="MM / YYYY" i]', 'input[aria-label*="expiration date" i]', 'input[aria-label*="expiry" i]',
  ]),
  "expiry month": any(['[autocomplete="cc-exp-month"]', '[autocomplete$=" cc-exp-month"]', 'select[name*="exp_month" i]', 'select[name*="expmonth" i]', 'select[name*="expiry_month" i]', 'select[name*="expirationMonth" i]', 'input[name*="exp_month" i]', 'input[data-fieldtype="encryptedExpiryMonth"]']),
  "expiry year": any(['[autocomplete="cc-exp-year"]', '[autocomplete$=" cc-exp-year"]', 'select[name*="exp_year" i]', 'select[name*="expyear" i]', 'select[name*="expiry_year" i]', 'select[name*="expirationYear" i]', 'input[name*="exp_year" i]', 'input[data-fieldtype="encryptedExpiryYear"]']),
  "security code": any([
    'input[autocomplete="cc-csc"]', 'input[autocomplete$=" cc-csc"]', 'input[name="cvc"]', 'input[name="cvv"]', 'input[name="cvv2"]', 'input[name="verification_value"]', 'input[name="securityCode"]', 'input[name="cardCvc"]', 'input[name="card_cvc"]',
    'input[id="cvc"]', 'input[id="cvv"]', 'input[id="verification_value"]', 'input[id="securityCode"]', 'input[data-elements-stable-field-name="cardCvc"]', 'input[data-fieldtype="encryptedSecurityCode"]',
    'input[placeholder="CVC"]', 'input[placeholder="CVV"]', 'input[aria-label*="security code" i]', 'input[aria-label*="cvc" i]', 'input[aria-label*="cvv" i]',
  ]),
  "name on card": any([
    'input[autocomplete="cc-name"]', 'input[autocomplete$=" cc-name"]', 'input[name="ccname"]', 'input[name="cardholderName"]', 'input[name="cardholder-name"]', 'input[name="cardHolderName"]', 'input[name="billingName"]',
    'input[id="cardholder-name"]', 'input[id="cardholderName"]', 'input[aria-label*="name on card" i]', 'input[placeholder*="name on card" i]', 'input[aria-label*="cardholder" i]',
  ]),
  "billing ZIP": any(['input[autocomplete*="billing postal-code"]', 'input[name="billingPostalCode"]', 'input[name="billing_postal_code"]', 'input[id="billingPostalCode"]']),
};
/** In a payment frame that holds the card number, these are the card's own too (Stripe's `postal`, Shopify's `name`). */
const FRAME_ONLY: Partial<Record<FieldKind, string>> = {
  "name on card": any(['input[name="name"]', 'input[id="name"]']),
  "billing ZIP": any(['input[name="postal"]', 'input[name="postalCode"]', 'input[name="zip"]', 'input[autocomplete="postal-code"]', 'input[data-elements-stable-field-name="postalCode"]']),
};

/**
 * Where the browser helper writes Simeon's own copy of playwright-core on the
 * computer, one folder per version (`SAND_BROWSER_DRIVER_BOX_DIR` and
 * `SAND_BROWSER_PLAYWRIGHT_BOX_DIR` in `host/runner/tools/`): the computer's
 * image may carry none, and the helper has run before any checkout.
 */
export const BOX_BROWSER_HELPER_DIR = "/tmp/.sand-browser";

/** Simeon's own copies of playwright-core the browser helper left on this computer, newest first. */
function ownPlaywrightCopies(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.startsWith("playwright-core-") && existsSync(join(dir, name, "lib", "playwright-core.cjs"))).sort().reverse().map((name) => join(dir, name, "lib", "playwright-core.cjs"));
  } catch {
    return [];
  }
}

/**
 * playwright-core from wherever the box image put it, else Simeon's own copy
 * beside the browser helper (as the helper itself finds it,
 * `sand-browser-driver-source.ts`). Until 14 October 2026 only the image's
 * places were tried, so on an image without one the card was never typed in.
 */
export function loadBoxPlaywright(helperDir: string = BOX_BROWSER_HELPER_DIR): PlaywrightLike {
  const roots = [process.env.SAND_PLAYWRIGHT_NODE_MODULES ?? "", "/node_modules", ...String(process.env.NODE_PATH ?? "").split(":"), "/workspace/node_modules", "/home/box/node_modules", "/usr/local/lib/node_modules", "/usr/lib/node_modules", "/opt/node_modules"];
  try { roots.push(execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim()); } catch { /* not on the PATH */ }
  let lastError: unknown;
  for (const root of roots.filter((item) => item.length > 0)) {
    try { return createRequire(join(root.replace(/\/+$/, ""), "noop.js"))("playwright-core") as PlaywrightLike; } catch (error) { lastError = error; }
  }
  for (const library of ownPlaywrightCopies(helperDir)) {
    try {
      const bundled = createRequire(library)(library) as { core?: PlaywrightLike };
      if (bundled.core?.chromium != null) return bundled.core;
    } catch (error) { lastError = error; }
  }
  throw new Error(`playwright-core is not on this computer (${lastError instanceof Error ? lastError.message : String(lastError)})`);
}

const two = (value: number): string => String(value).padStart(2, "0");
const hostOf = hostOfAddress;

export async function firstEditable(frame: Frame, selector: string): Promise<Locator | undefined> {
  const all = frame.locator(selector);
  const count = await all.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 6); index += 1) {
    const field = all.nth(index);
    if (await field.isVisible().catch(() => false) && await field.isEditable().catch(() => false)) return field;
  }
  return undefined;
}

export async function typeInto(field: Locator, value: string, delay: number): Promise<boolean> {
  await field.click({ timeout: 5000 }).catch(() => undefined);
  await field.fill("", { timeout: 5000 }).catch(() => undefined);
  await field.pressSequentially(value, { delay, timeout: 20_000 });
  return (await field.inputValue({ timeout: 2000 }).catch(() => "")).replace(/\D/g, "").length > 0 || /[a-z]/i.test(value);
}

export async function choose(field: Locator, options: readonly string[], delay: number): Promise<boolean> {
  const tag = await field.evaluate((element: never) => (element as unknown as { tagName: string }).tagName.toLowerCase()).catch(() => "input");
  if (tag !== "select") return await typeInto(field, options[0] ?? "", delay);
  for (const option of options) {
    try { await field.selectOption({ value: option }, { timeout: 2000 }); return true; } catch { /* next spelling */ }
    try { await field.selectOption({ label: option }, { timeout: 2000 }); return true; } catch { /* next spelling */ }
  }
  return false;
}

/** The pages of every Chrome on the box, with the DevTools connection each came from. */
async function openPages(playwright: PlaywrightLike, ports: readonly number[]): Promise<{ browsers: Browser[]; pages: Page[] }> {
  const browsers: Browser[] = [];
  const pages: Page[] = [];
  await Promise.all(ports.map(async (port) => {
    try {
      const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 4000 });
      browsers.push(browser);
      for (const context of browser.contexts()) pages.push(...context.pages());
    } catch { /* no Chrome on this port */ }
  }));
  return { browsers, pages };
}

/** The checkout's picture for the purchase card, with the shop's own icon when Chrome has one. */
export interface CheckoutPicture {
  /** The tab's site, "gumroad.com". */
  readonly page: string;
  readonly jpeg: Uint8Array;
  /** The shop's icon (Review order wears it), as the shop serves it. */
  readonly icon?: { readonly bytes: Uint8Array; readonly mimeType: string };
}

const ICON_TYPES: Readonly<Record<string, string>> = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/gif": "image/gif", "image/webp": "image/webp", "image/x-icon": "image/x-icon", "image/vnd.microsoft.icon": "image/x-icon", "image/ico": "image/x-icon" };

/** The shop's icon from the address Chrome lists for its tab: a small picture the apps can draw (no SVG), or nothing. */
export async function fetchCheckoutIcon(address: string | undefined, fetchImpl: typeof fetch = fetch): Promise<CheckoutPicture["icon"]> {
  if (address == null || !/^https:\/\//i.test(address)) return undefined;
  try {
    const response = await fetchImpl(address, { signal: AbortSignal.timeout(4000), redirect: "follow" });
    if (!response.ok) return undefined;
    const type = ICON_TYPES[(response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? ""];
    if (type == null) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength <= 256 * 1024 ? { bytes, mimeType: type } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The checkout as the person will check it on the purchase card: one JPEG
 * of the tab on the shop's site (the address the agent gave, else its
 * domain), as it shows now, from the agent's own Chrome first (`ports` in
 * order). Taken over that tab's own DevTools socket (`box-chrome-tabs.ts`);
 * a tab that doesn't draw (behind another, or asleep) is brought to the
 * front once and taken again. Nothing on the page is touched. Nothing when
 * no tab is on that site, so the card never shows another shop's page; each
 * reason goes to `log`.
 */
export async function captureCheckout(options: { readonly pageHint: string; readonly ports?: readonly number[]; readonly log?: (line: string) => void; readonly fetchImpl?: typeof fetch }): Promise<CheckoutPicture | undefined> {
  const log = options.log ?? (() => undefined);
  const hint = options.pageHint.trim();
  if (hint.length === 0) { log("no picture: no checkout address"); return undefined; }
  const ports = options.ports ?? BOX_CHROME_PORTS;
  const tabs = await listTabsOn(ports);
  if (tabs.length === 0) { log(`no picture: no Chrome answered on ${ports.length === 1 ? `port ${ports[0]}` : `ports ${ports[0]}–${ports[ports.length - 1]}`}`); return undefined; }
  const showing = tabsShowing(tabs, hint);
  if (showing.length === 0) { log(`no picture: no tab on ${hostOf(hint)} (open: ${[...new Set(tabs.map((tab) => hostOf(tab.url)))].slice(0, 8).join(", ") || "none"})`); return undefined; }
  for (const tab of showing.slice(0, 2)) {
    const jpeg = await screenshotTab(tab);
    if (jpeg == null) { log(`no picture: the tab on ${hostOf(tab.url)} (port ${tab.port}) didn't draw`); continue; }
    const icon = await fetchCheckoutIcon(tab.faviconUrl, options.fetchImpl);
    return { page: hostOf(tab.url), jpeg, ...(icon == null ? {} : { icon }) };
  }
  return undefined;
}

/**
 * The checkout's text as the person reads it (`document.body.innerText`),
 * from the same tab `captureCheckout` takes its picture of, so the card's
 * total can be checked against the page (`checkout-total.ts`). Nothing on
 * the page is touched; nothing when no tab is on that site.
 */
export async function readCheckoutText(options: { readonly pageHint: string; readonly ports?: readonly number[]; readonly log?: (line: string) => void }): Promise<string | undefined> {
  const log = options.log ?? (() => undefined);
  const hint = options.pageHint.trim();
  if (hint.length === 0) { log("no page text: no checkout address"); return undefined; }
  const tabs = await listTabsOn(options.ports ?? BOX_CHROME_PORTS);
  const showing = tabsShowing(tabs, hint);
  if (showing.length === 0) { log(`no page text: no tab on ${hostOf(hint)}`); return undefined; }
  const read = async (tab: BoxChromeTab): Promise<string | undefined> => {
    const answer = await tabCommand<{ result?: { value?: unknown } }>(tab, "Runtime.evaluate", { expression: "document.body ? document.body.innerText : ''", returnByValue: true }, 5000);
    const value = answer?.result?.value;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  };
  for (const tab of showing.slice(0, 2)) {
    const first = await read(tab);
    if (first != null) return first;
    // A tab Chrome put to sleep answers once it is in front.
    await activateTab(tab);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const second = await read(tab);
    if (second != null) return second;
    log(`no page text: the tab on ${hostOf(tab.url)} (port ${tab.port}) didn't answer`);
  }
  return undefined;
}

async function screenshotTab(tab: BoxChromeTab): Promise<Uint8Array | undefined> {
  const take = async (): Promise<Uint8Array | undefined> => {
    const shot = await tabCommand<{ data?: unknown }>(tab, "Page.captureScreenshot", { format: "jpeg", quality: 70 }, 8000);
    if (typeof shot?.data !== "string" || shot.data.length === 0) return undefined;
    const jpeg = new Uint8Array(Buffer.from(shot.data, "base64"));
    return jpeg[0] === 0xff && jpeg[1] === 0xd8 ? jpeg : undefined;
  };
  const first = await take();
  if (first != null) return first;
  await activateTab(tab);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return await take();
}

/**
 * The DevTools ports whose Chrome has the checkout open, woken for
 * Playwright: it attaches to every tab of a Chrome it connects to, and one
 * Chrome put to sleep (Memory Saver, after half an hour waiting on Link) held
 * the connection until it timed out. All of `ports` when no tab shows it.
 */
async function checkoutPorts(hint: string, ports: readonly number[]): Promise<readonly number[]> {
  if (hint.length === 0) return ports;
  const showing = tabsShowing(await listTabsOn(ports), hint);
  if (showing.length === 0) return ports;
  const chosen = [...new Set(showing.map((tab) => tab.port))];
  await Promise.all(chosen.map((port) => wakeSleepingTabs(port)));
  return chosen;
}

async function hasCardFields(page: Page): Promise<boolean> {
  for (const frame of page.frames()) if (await firstEditable(frame, SELECTORS["card number"]) != null) return true;
  return false;
}

async function hasPayToken(page: Page): Promise<Frame | undefined> {
  for (const frame of page.frames()) {
    const found = await frame.evaluate(() => {
      const doc = (globalThis as unknown as { document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null } }).document;
      return doc.querySelector(".AiAgentPaymentSteering") != null && doc.querySelector('input[name="link_pay_token"]') != null;
    }).catch(() => false);
    if (found) return frame;
  }
  return undefined;
}

export async function fillCheckout(options: FillCheckoutOptions): Promise<CheckoutFillResult> {
  if (options.card == null && options.linkPayToken == null) return { ok: false, message: "Nothing to fill in." };
  let playwright: PlaywrightLike;
  try { playwright = (options.loadPlaywright ?? loadBoxPlaywright)(); } catch (error) { return { ok: false, message: `The browser can't be reached from here: ${error instanceof Error ? error.message : String(error)}` }; }
  const hint = options.pageHint?.trim() ?? "";
  const { browsers, pages } = await openPages(playwright, await checkoutPorts(hint, options.ports ?? BOX_CHROME_PORTS));
  try {
    if (pages.length === 0) return { ok: false, message: "No browser is open on this computer. Open the checkout page first." };
    // The tab whose address holds the agent's words, else any tab on that site (shop.example.com, checkout.shop.example.com).
    const byAddress = hint.length === 0 ? [] : pages.filter((page) => page.url().includes(hint));
    const bySite = hint.length === 0 ? [] : pages.filter((page) => hostOf(page.url()) === hostOf(hint) || hostOf(page.url()).endsWith(`.${hostOf(hint)}`));
    const hinted = hint.length === 0 ? pages : byAddress.length > 0 ? byAddress : bySite;
    const candidates = hinted.length > 0 ? hinted : pages;
    const delay = options.keyDelayMs ?? 35;

    if (options.linkPayToken != null) {
      for (const page of candidates) {
        const frame = await hasPayToken(page);
        if (frame == null) continue;
        await frame.evaluate((token: never) => {
          const doc = (globalThis as unknown as { document: { querySelector(selector: string): unknown } }).document;
          const input = doc.querySelector('input[name="link_pay_token"]') as { dispatchEvent(event: unknown): void } | null;
          const view = globalThis as unknown as { HTMLInputElement: { prototype: object }; Event: new (type: string, init: object) => unknown };
          const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
          if (input == null || setter == null) return;
          setter.call(input, token);
          input.dispatchEvent(new view.Event("input", { bubbles: true }));
          input.dispatchEvent(new view.Event("change", { bubbles: true }));
        }, options.linkPayToken as never);
        return { ok: true, page: hostOf(page.url()), filled: ["Link pay token"], missing: [] };
      }
      return { ok: false, message: "The checkout's Link block (.AiAgentPaymentSteering with link_pay_token) isn't on the open page. Open the checkout's payment step; if the block never shows, cancel this purchase and create a card one." };
    }

    const card = options.card as CheckoutCard;
    let page: Page | undefined;
    for (const candidate of candidates) if (await hasCardFields(candidate)) { page = candidate; break; }
    if (page == null) {
      const where = hinted.length > 0 ? `on ${hostOf(hinted[0]?.url() ?? hint)}` : "in any open tab";
      return { ok: false, message: `No card fields ${where}. Open the checkout's payment step (pick "card" if the page offers several ways to pay), then call pay_checkout again.` };
    }
    await page.bringToFront().catch(() => undefined);

    const filled = new Set<FieldKind>();
    const values: Record<FieldKind, string[]> = {
      "card number": [card.number],
      expiry: [`${two(card.expMonth)}/${two(card.expYear % 100)}`],
      "expiry month": [two(card.expMonth), String(card.expMonth)],
      "expiry year": [String(card.expYear), two(card.expYear % 100)],
      "security code": [card.cvc],
      "name on card": card.billing?.name ? [card.billing.name] : [],
      "billing ZIP": card.billing?.postalCode ? [card.billing.postalCode] : [],
    };
    const numberFrames: Frame[] = [];
    for (const frame of page.frames()) {
      for (const kind of Object.keys(SELECTORS) as FieldKind[]) {
        if (filled.has(kind) || (values[kind] ?? []).length === 0) continue;
        if ((kind === "expiry month" || kind === "expiry year") && filled.has("expiry")) continue;
        let field = await firstEditable(frame, SELECTORS[kind]);
        // A payment frame's own name and ZIP, beside the card number in that frame.
        if (field == null && FRAME_ONLY[kind] != null && frame !== page.mainFrame() && (numberFrames.includes(frame) || await firstEditable(frame, SELECTORS["card number"]) != null)) field = await firstEditable(frame, FRAME_ONLY[kind] as string);
        if (field == null) continue;
        let value = values[kind];
        if (kind === "expiry") {
          const placeholder = (await field.getAttribute("placeholder").catch(() => null)) ?? "";
          if (/yyyy/i.test(placeholder)) value = [`${two(card.expMonth)}/${card.expYear}`];
        }
        const done = kind === "expiry month" || kind === "expiry year" ? await choose(field, value, delay) : await typeInto(field, value[0] ?? "", delay).catch(() => false);
        if (done) { filled.add(kind); if (kind === "card number") numberFrames.push(frame); }
      }
    }
    if (!filled.has("card number")) return { ok: false, message: `The card number field on ${hostOf(page.url())} could not be filled. Click into it once and call pay_checkout again.` };
    const expected: FieldKind[] = ["card number", filled.has("expiry month") || filled.has("expiry year") ? "expiry month" : "expiry", "security code"];
    if (filled.has("expiry month")) expected.push("expiry year");
    return { ok: true, page: hostOf(page.url()), filled: [...filled], missing: expected.filter((kind) => !filled.has(kind)) };
  } finally {
    // Disconnects; the person's Chrome and its tabs stay open.
    await Promise.all(browsers.map((browser) => browser.close().catch(() => undefined)));
  }
}
