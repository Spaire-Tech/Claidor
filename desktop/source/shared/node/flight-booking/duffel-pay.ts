// Paying a flight on Duffel's card form, on the cloud computer (13 October
// 2026; the whole path is in `flight-booking.ts`). Simeon opens its pay page
// (`GET /desktop/flights/pay`, `server/simeon/desktop/flight_pay.html`) in the
// agent's own Chrome over DevTools, with the component client key in the
// address's fragment. The page holds Duffel's card form (an iframe on
// api.duffel.cards); this types the one-time Link card and its billing
// address into it, has the page turn it into a Duffel card id, and runs the
// bank check (3-D Secure). The card stays in this process and the form; what
// comes back is the bank check's session id for the order.
//
// The form's fields are found the way `checkout-fill.ts` finds a shop's:
// autocomplete first, then names and labels. Nothing here has seen Duffel's
// form from the inside yet (it needs a live client key), so when a field is
// not found the log lists the fields the form does have (their names and
// labels, never a value): the first real run says what to add.

import { choose, firstEditable, loadBoxPlaywright, typeInto, type CheckoutCard, type Frame, type Locator, type PlaywrightLike } from "../link-wallet/checkout-fill.js";

const CARDS_ORIGIN = "https://api.duffel.cards";

type PayFrame = Frame & { getByLabel?(label: RegExp, options?: Record<string, unknown>): Locator };
interface PayPage {
  url(): string;
  frames(): PayFrame[];
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  evaluate<R>(fn: (arg: never) => R, arg?: unknown): Promise<R>;
  bringToFront(): Promise<void>;
}
interface PayContext {
  pages(): PayPage[];
  newPage(): Promise<PayPage>;
}
interface PayBrowser {
  contexts(): PayContext[];
  close(): Promise<void>;
}
export interface PayPlaywright {
  chromium: { connectOverCDP(endpoint: string, options?: Record<string, unknown>): Promise<PayBrowser> };
}

/** The pay page's own state (`window.simeonPay.status()`). */
export interface PayPageStatus {
  readonly phase: "loading" | "form" | "verifying" | "challenge" | "ready" | "failed";
  readonly valid?: boolean;
  readonly card?: { readonly id?: string; readonly last_4_digits?: string; readonly brand?: string; readonly live_mode?: boolean } | null;
  readonly session?: { readonly id?: string; readonly status?: string; readonly live_mode?: boolean } | null;
  readonly error?: string | null;
}

export type DuffelPayResult =
  | { readonly ok: true; readonly threeDSecureSessionId: string; readonly cardLast4: string; readonly filled: readonly string[]; readonly challenged: boolean }
  | { readonly ok: false; readonly stage: "browser" | "form" | "card" | "verify"; readonly message: string; readonly filled?: readonly string[]; readonly missing?: readonly string[]; readonly fieldsSeen?: string };

export interface DuffelPayOptions {
  /** The agent's Chrome DevTools port on the box (9222 + its window). */
  readonly port: number;
  /** The pay page with the client key in its fragment. */
  readonly pageUrl: string;
  readonly offerId: string;
  readonly card: CheckoutCard;
  /** The name on the card when Link gives no billing name. */
  readonly holder: string;
  /** The bank wants the person: the check is on the page, in front. */
  readonly onChallenge?: () => void;
  readonly loadPlaywright?: () => PayPlaywright;
  readonly keyDelayMs?: number;
  /** How long the bank check may take, the person's part included. */
  readonly verifyTimeoutMs?: number;
  readonly pollMs?: number;
}

type FieldKind = "name on card" | "card number" | "expiry" | "expiry month" | "expiry year" | "security code" | "address line 1" | "address line 2" | "city" | "region" | "postal code" | "country";

const any = (selectors: readonly string[]): string => selectors.join(", ");
const FIELDS: Record<FieldKind, { readonly selector: string; readonly label: RegExp }> = {
  "name on card": { selector: any(['[autocomplete="cc-name"]', '[autocomplete$=" cc-name"]', 'input[name="cardholderName"]', 'input[name="cardholder_name"]', 'input[name="name"]', 'input[id="name"]', 'input[name*="holder" i]']), label: /name on( the)? card|card ?holder|full name|^name$/i },
  "card number": { selector: any(['input[autocomplete="cc-number"]', 'input[autocomplete$=" cc-number"]', 'input[name="cardNumber"]', 'input[name="card_number"]', 'input[name="number"]', 'input[id="number"]', 'input[name*="number" i][inputmode="numeric"]']), label: /card number|^number$/i },
  expiry: { selector: any(['input[autocomplete="cc-exp"]', 'input[autocomplete$=" cc-exp"]', 'input[name="expiry"]', 'input[name="expiryDate"]', 'input[name="expiry_date"]', 'input[name="exp"]', 'input[placeholder*="MM" i]']), label: /expir|exp\.? date|valid (thru|until)/i },
  "expiry month": { selector: any(['[autocomplete="cc-exp-month"]', '[autocomplete$=" cc-exp-month"]', '[name*="expiry_month" i]', '[name*="exp_month" i]', '[name*="expiryMonth" i]']), label: /expiry month|exp(iration)? month/i },
  "expiry year": { selector: any(['[autocomplete="cc-exp-year"]', '[autocomplete$=" cc-exp-year"]', '[name*="expiry_year" i]', '[name*="exp_year" i]', '[name*="expiryYear" i]']), label: /expiry year|exp(iration)? year/i },
  "security code": { selector: any(['input[autocomplete="cc-csc"]', 'input[autocomplete$=" cc-csc"]', 'input[name="cvc"]', 'input[name="cvv"]', 'input[name="securityCode"]', 'input[name="security_code"]', 'input[id="cvc"]']), label: /cvc|cvv|security code/i },
  "address line 1": { selector: any(['[autocomplete="address-line1"]', '[autocomplete$=" address-line1"]', '[autocomplete="street-address"]', 'input[name="address_line_1"]', 'input[name="addressLine1"]', 'input[name="line1"]', 'input[name="street"]']), label: /address( line)? ?1|street address|^address$|^street$/i },
  "address line 2": { selector: any(['[autocomplete="address-line2"]', '[autocomplete$=" address-line2"]', 'input[name="address_line_2"]', 'input[name="addressLine2"]', 'input[name="line2"]']), label: /address( line)? ?2|apartment|suite|unit/i },
  city: { selector: any(['[autocomplete="address-level2"]', '[autocomplete$=" address-level2"]', 'input[name="city"]', 'input[name="address_city"]', 'input[name="town"]']), label: /city|town/i },
  region: { selector: any(['[autocomplete="address-level1"]', '[autocomplete$=" address-level1"]', '[name="region"]', '[name="state"]', '[name="address_region"]', '[name="province"]']), label: /state|region|province|county/i },
  "postal code": { selector: any(['[autocomplete="postal-code"]', '[autocomplete$=" postal-code"]', 'input[name="postal_code"]', 'input[name="postalCode"]', 'input[name="postcode"]', 'input[name="zip"]', 'input[name="address_postal_code"]']), label: /post(al)? ?code|zip/i },
  country: { selector: any(['[autocomplete="country"]', '[autocomplete$=" country"]', '[autocomplete="country-name"]', 'select[name*="country" i]', 'input[name*="country" i]']), label: /country/i },
};

const two = (value: number): string => String(value).padStart(2, "0");

function countryNames(code: string): string[] {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper.length > 0 ? [code.trim()] : [];
  let name: string | undefined;
  try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper); } catch { name = undefined; }
  return [upper, ...(name == null || name === upper ? [] : [name])];
}

/** The fields Duffel's form must get, in the order a person fills them. */
function valuesFor(card: CheckoutCard, holder: string): Partial<Record<FieldKind, string[]>> {
  const billing = card.billing;
  const name = billing?.name?.trim() || holder.trim();
  return {
    ...(name.length > 0 ? { "name on card": [name] } : {}),
    "card number": [card.number],
    expiry: [`${two(card.expMonth)}/${two(card.expYear % 100)}`],
    "expiry month": [two(card.expMonth), String(card.expMonth)],
    "expiry year": [String(card.expYear), two(card.expYear % 100)],
    "security code": [card.cvc],
    ...(billing?.line1 ? { "address line 1": [billing.line1] } : {}),
    ...(billing?.line2 ? { "address line 2": [billing.line2] } : {}),
    ...(billing?.city ? { city: [billing.city] } : {}),
    ...(billing?.state ? { region: [billing.state] } : {}),
    ...(billing?.postalCode ? { "postal code": [billing.postalCode] } : {}),
    ...(billing?.country ? { country: countryNames(billing.country) } : {}),
  };
}

async function byLabel(frame: PayFrame, label: RegExp): Promise<Locator | undefined> {
  if (typeof frame.getByLabel !== "function") return undefined;
  const all = frame.getByLabel(label);
  const count = await all.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 4); index += 1) {
    const field = all.nth(index);
    if (await field.isVisible().catch(() => false) && await field.isEditable().catch(() => false)) return field;
  }
  return undefined;
}

/** The form's fields by name and label, never a value: for the log when one is missing. */
async function describeFields(frames: readonly Frame[]): Promise<string> {
  const seen: string[] = [];
  for (const frame of frames) {
    const fields = await frame.evaluate(() => {
      const doc = (globalThis as unknown as { document: { querySelectorAll(selector: string): ArrayLike<{ tagName: string; getAttribute(name: string): string | null; labels?: ArrayLike<{ textContent: string | null }> | null }> } }).document;
      return Array.from(doc.querySelectorAll("input, select, textarea")).map((element) => {
        const label = element.labels != null && element.labels.length > 0 ? (element.labels[0]?.textContent ?? "").trim() : "";
        return [element.tagName.toLowerCase(), element.getAttribute("name"), element.getAttribute("id"), element.getAttribute("autocomplete"), element.getAttribute("aria-label") ?? label, element.getAttribute("type")].filter((part) => part != null && part.length > 0).join("|");
      });
    }).catch(() => [] as string[]);
    if (fields.length > 0) seen.push(`${frame.url().split("?")[0]}: ${fields.join("; ")}`);
  }
  return seen.join(" / ").slice(0, 1500);
}

async function status(page: PayPage): Promise<PayPageStatus | undefined> {
  return await page.evaluate(() => {
    const pay = (globalThis as unknown as { simeonPay?: { status(): unknown } }).simeonPay;
    return pay == null ? undefined : pay.status();
  }).catch(() => undefined) as PayPageStatus | undefined;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function payOnDuffelPage(options: DuffelPayOptions): Promise<DuffelPayResult> {
  let playwright: PayPlaywright;
  try { playwright = (options.loadPlaywright ?? (loadBoxPlaywright as unknown as () => PayPlaywright))(); } catch (error) { return { ok: false, stage: "browser", message: `The browser can't be reached from here: ${error instanceof Error ? error.message : String(error)}` }; }
  let browser: PayBrowser;
  try { browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${options.port}`, { timeout: 8000 }); } catch (error) { return { ok: false, stage: "browser", message: `The computer's browser didn't answer (${error instanceof Error ? error.message : String(error)}).` }; }
  const poll = options.pollMs ?? 1000;
  try {
    const context = browser.contexts()[0];
    if (context == null) return { ok: false, stage: "browser", message: "The computer's browser has no window open." };
    const page = await context.newPage();
    await page.goto(options.pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.bringToFront().catch(() => undefined);

    // The card form, ready in its frame.
    let ready: PayPageStatus | undefined;
    for (let waited = 0; waited < 40_000; waited += poll) {
      ready = await status(page);
      if (ready?.phase === "failed") return { ok: false, stage: "form", message: ready.error ?? "The payment page couldn't start." };
      if (ready?.phase === "form" && page.frames().some((frame) => frame.url().startsWith(CARDS_ORIGIN))) break;
      await pause(poll);
    }
    if (ready?.phase !== "form") return { ok: false, stage: "form", message: "Duffel's card form didn't load." };
    await pause(Math.min(1500, poll * 2));

    // The card and its billing address, typed in Duffel's frames only (never the page around them).
    const frames = page.frames().filter((frame) => frame.url().startsWith(CARDS_ORIGIN) || /^https:\/\/[^/]*evervault\.com\//.test(frame.url()));
    const values = valuesFor(options.card, options.holder);
    const delay = options.keyDelayMs ?? 35;
    const filled = new Set<FieldKind>();
    for (const kind of Object.keys(FIELDS) as FieldKind[]) {
      const value = values[kind];
      if (value == null || value.length === 0) continue;
      if ((kind === "expiry month" || kind === "expiry year") && filled.has("expiry")) continue;
      if (kind === "expiry" && filled.has("expiry month")) continue;
      for (const frame of frames) {
        const field = await firstEditable(frame, FIELDS[kind].selector) ?? await byLabel(frame, FIELDS[kind].label);
        if (field == null) continue;
        const done = kind === "country" || kind === "region" || kind === "expiry month" || kind === "expiry year"
          ? await choose(field, value, delay).catch(() => false)
          : await typeInto(field, value[0] ?? "", delay).catch(() => false);
        if (done) { filled.add(kind); break; }
      }
    }
    const needed: FieldKind[] = ["card number", filled.has("expiry month") ? "expiry month" : "expiry", "security code"];
    if (filled.has("expiry month")) needed.push("expiry year");
    const missing = needed.filter((kind) => !filled.has(kind));
    const absent = (Object.keys(values) as FieldKind[]).filter((kind) => !filled.has(kind) && kind !== "expiry month" && kind !== "expiry year" && kind !== "expiry" && !needed.includes(kind));
    if (missing.length > 0) return { ok: false, stage: "card", message: `Duffel's card form had no ${missing.join(", ")} field that could be filled.`, filled: [...filled], missing: [...missing, ...absent], fieldsSeen: await describeFields(frames) };

    // Duffel keeps the card for 25 minutes under an id.
    const made = await page.evaluate(() => (globalThis as unknown as { simeonPay: { createCard(): Promise<{ ok: boolean; card?: { id?: string; last_4_digits?: string }; error?: string }> } }).simeonPay.createCard()).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }) as { ok: boolean; card?: { id?: string; last_4_digits?: string }; error?: string });
    const cardId = made.ok ? made.card?.id ?? "" : "";
    if (!made.ok || cardId.length === 0) return { ok: false, stage: "card", message: made.error ?? "Duffel's card form didn't take the card.", filled: [...filled], missing: absent, fieldsSeen: await describeFields(frames) };

    // The bank check: most cards pass without a word; some banks want the person.
    await page.evaluate((args: never) => {
      const { offerId, cardId: id } = args as unknown as { offerId: string; cardId: string };
      (globalThis as unknown as { simeonPay: { verify(offer: string, card: string): boolean } }).simeonPay.verify(offerId, id);
    }, { offerId: options.offerId, cardId } as never);
    let challenged = false;
    const limit = options.verifyTimeoutMs ?? 10 * 60_000;
    for (let waited = 0; waited < limit; waited += poll) {
      const now = await status(page);
      if (now?.phase === "ready" && now.session?.id != null) return { ok: true, threeDSecureSessionId: now.session.id, cardLast4: made.card?.last_4_digits ?? "", filled: [...filled], challenged };
      if (now?.phase === "failed") return { ok: false, stage: "verify", message: now.error ?? "The bank didn't confirm the card.", filled: [...filled] };
      if (now?.phase === "challenge" && !challenged) {
        challenged = true;
        await page.bringToFront().catch(() => undefined);
        options.onChallenge?.();
      }
      await pause(poll);
    }
    return { ok: false, stage: "verify", message: challenged ? "The bank's check wasn't finished in time." : "The bank didn't answer in time.", filled: [...filled] };
  } catch (error) {
    return { ok: false, stage: "browser", message: `The payment page stopped: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    // Disconnects only: the tab stays, with the page's last words on it.
    await browser.close().catch(() => undefined);
  }
}

/** The pay page's address for one payment: the client key and the flight's line ride in the fragment, which no server sees. */
export function duffelPayPageUrl(backendUrl: string, clientKey: string, what: string): string {
  const base = new URL("/desktop/flights/pay", backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`);
  base.hash = new URLSearchParams({ key: clientKey, what }).toString();
  return base.toString();
}

/** Says something on the open pay page (its status line), best effort. */
export async function sayOnPayPage(port: number, words: string, loadPlaywright?: () => PayPlaywright): Promise<void> {
  try {
    const browser = await (loadPlaywright ?? (loadBoxPlaywright as unknown as () => PayPlaywright))().chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 4000 });
    try {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          if (!page.url().includes("/desktop/flights/pay")) continue;
          await page.evaluate((line: never) => { (globalThis as unknown as { simeonPay?: { say(text: string): void } }).simeonPay?.say(line as unknown as string); }, words as never).catch(() => undefined);
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch { /* the page was closed; nothing to say */ }
}

export type { PlaywrightLike };
