import {
  CHECKOUT_FIELDS,
  CHECKOUT_SENTENCES,
  captureCheckout,
  checkoutCardValues,
  checkoutMissing,
  fetchCheckoutIcon,
  fillCheckout,
  readCheckoutText,
  type CheckoutFillResult,
  type CheckoutPicture,
  type FillCheckoutOptions,
} from "../../../shared/node/link-wallet/checkout-fill.js";
import { hostOfAddress } from "../../../shared/node/link-wallet/box-chrome-tabs.js";
import { appTaskOf, askApp } from "./app-browser-forms.js";
import type { AppBrowserRoute } from "./app-browser-route.js";

/**
 * The checkout card where the agent's page is (docs/app-browser/README.md,
 * step 3c, 4 November 2026): what the checkout says (the card's total is
 * checked against it), its picture for Review order, and Link's one-time
 * card or pay token put into it after the person allows the purchase. For a
 * task in the Mac or Windows app's browser (`AppBrowserRoute.where`) each
 * goes to that app as one `checkout` step, with the fields' marks the
 * computer uses (`CHECKOUT_FIELDS`), and the app types the card into its own
 * tab, a payment provider's frame of another site included. The answer says
 * which fields went in, never what, and the agent reads the computer's own
 * sentences. Every other task uses the computer's Chrome exactly as before
 * (`checkout-fill.ts`). The card and the token are never logged, here or in
 * the app.
 */

type PageRead = { readonly pageHint: string; readonly ports?: readonly number[]; readonly log?: (line: string) => void };

/** The computer's own (`checkout-fill.ts`); a test hands in others. */
export interface BoxCheckout {
  fill(options: FillCheckoutOptions): Promise<CheckoutFillResult>;
  read(options: PageRead): Promise<string | undefined>;
  capture(options: PageRead): Promise<CheckoutPicture | undefined>;
  icon(address: string | undefined): Promise<CheckoutPicture["icon"]>;
}

export interface RoutedCheckout {
  /** Where `options.agentId`'s page is; the computer's without one. */
  fill(options: FillCheckoutOptions): Promise<CheckoutFillResult>;
  read(agentId: string, options: PageRead): Promise<string | undefined>;
  capture(agentId: string, options: PageRead): Promise<CheckoutPicture | undefined>;
}

const BOX_CHECKOUT: BoxCheckout = { fill: fillCheckout, read: readCheckoutText, capture: captureCheckout, icon: (address) => fetchCheckoutIcon(address) };

/** Typing a card at 35 ms a key, frames looked through, takes a while. */
export const APP_CHECKOUT_FILL_TIMEOUT_MS = 60_000;
/** The checkout's text or picture: the app tries two tabs, each up to 10 seconds, as the computer reads its tabs. */
export const APP_CHECKOUT_READ_TIMEOUT_MS = 25_000;
/** A picture larger than this is not the checkout's. */
const PICTURE_MAX_BYTES = 8 * 1024 * 1024;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
}

export function routedCheckout(route: () => AppBrowserRoute | undefined, box: BoxCheckout = BOX_CHECKOUT): RoutedCheckout {
  const pageOf = (data: Record<string, unknown>): string => (typeof data.page === "string" ? data.page : "");
  const kinds = new Set<string>(CHECKOUT_FIELDS.map((field) => field.kind));

  return {
    async fill(options) {
      const app = options.agentId == null ? undefined : appTaskOf(route(), options.agentId);
      if (app === undefined || options.agentId == null) return await box.fill(options);
      const agentId = options.agentId;
      if (options.card == null && options.linkPayToken == null) return { ok: false, message: "Nothing to fill in." };
      const hint = options.pageHint?.trim() ?? "";
      if (options.linkPayToken != null) {
        const answer = await askApp(app, agentId, "checkout", { action: "token", pageHint: hint, token: options.linkPayToken }, APP_CHECKOUT_FILL_TIMEOUT_MS);
        if (!answer.ok) return answer;
        return answer.data.found === true ? { ok: true, page: pageOf(answer.data), filled: ["Link pay token"], missing: [] } : { ok: false, message: CHECKOUT_SENTENCES.noLinkBlock };
      }
      const { values, expiryLong } = checkoutCardValues(options.card as NonNullable<FillCheckoutOptions["card"]>);
      const answer = await askApp(app, agentId, "checkout", {
        action: "fill",
        pageHint: hint,
        fields: CHECKOUT_FIELDS,
        values,
        expiryLong,
        keyDelayMs: options.keyDelayMs ?? 35,
      }, APP_CHECKOUT_FILL_TIMEOUT_MS);
      if (!answer.ok) return answer;
      const page = pageOf(answer.data);
      if (answer.data.found !== true) return { ok: false, message: CHECKOUT_SENTENCES.noCardFields(answer.data.hinted === true ? `on ${page || hostOfAddress(hint)}` : "in any open tab") };
      const filled = new Set(strings(answer.data.filled).filter((kind) => kinds.has(kind)));
      if (!filled.has("card number")) return { ok: false, message: CHECKOUT_SENTENCES.numberNotFilled(page) };
      return { ok: true, page, filled: [...filled], missing: checkoutMissing(filled) };
    },

    async read(agentId, options) {
      const app = appTaskOf(route(), agentId);
      if (app === undefined) return await box.read(options);
      const answer = await askApp(app, agentId, "checkout", { action: "read", pageHint: options.pageHint }, APP_CHECKOUT_READ_TIMEOUT_MS);
      if (!answer.ok) {
        options.log?.(`no page text: ${answer.message}`);
        return undefined;
      }
      const text = typeof answer.data.text === "string" && answer.data.text.trim().length > 0 ? answer.data.text : undefined;
      if (text === undefined) options.log?.(`no page text: the tab on ${pageOf(answer.data) || hostOfAddress(options.pageHint)} in the app's browser said nothing`);
      return text;
    },

    async capture(agentId, options) {
      const app = appTaskOf(route(), agentId);
      if (app === undefined) return await box.capture(options);
      const answer = await askApp(app, agentId, "checkout", { action: "picture", pageHint: options.pageHint }, APP_CHECKOUT_READ_TIMEOUT_MS);
      if (!answer.ok) {
        options.log?.(`no picture: ${answer.message}`);
        return undefined;
      }
      const encoded = typeof answer.data.jpegB64 === "string" ? answer.data.jpegB64 : "";
      const jpeg = encoded.length > 0 && encoded.length <= (PICTURE_MAX_BYTES * 4) / 3 + 4 ? new Uint8Array(Buffer.from(encoded, "base64")) : new Uint8Array();
      if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
        options.log?.("no picture: the app's browser sent none");
        return undefined;
      }
      const icon = await box.icon(typeof answer.data.iconUrl === "string" ? answer.data.iconUrl : undefined).catch(() => undefined);
      return { page: pageOf(answer.data), jpeg, ...(icon == null ? {} : { icon }) };
    },
  };
}
