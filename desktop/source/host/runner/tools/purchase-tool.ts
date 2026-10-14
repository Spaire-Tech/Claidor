/**
 * RequestPurchase and MarkPurchaseDone (13 October 2026): the agent's side
 * of the checkout card (`shared/node/link-wallet/purchase-card.ts`).
 *
 * RequestPurchase is the only way an agent starts a payment. It checks the
 * person's Link first (connected, nothing to verify, the amount within their
 * limits, the card that pays), takes a picture of the checkout tab, and
 * posts the card; the turn then ends, as after a question. Link is asked
 * for nothing until the person presses Allow on the card, and the agent is
 * woken once Link has approved (or the person or Link said no).
 * MarkPurchaseDone closes the card after the agent paid: ordered with the
 * shop's order number, failed, or canceled.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import {
  PURCHASE_MESSAGE_TYPE,
  formatPurchaseMoney,
  purchaseCardText,
  purchaseDomain,
  purchaseLinkContext,
  type PurchaseCardData,
  type PurchaseCardMessage,
} from "../../../shared/node/link-wallet/purchase-card.js";
import { PRODUCTS_MESSAGE_TYPE, productsCardText, type ProductCardItem, type ProductsCardMessage } from "../../../shared/node/link-wallet/product-card.js";
import type { CheckoutFacts } from "../../../shared/node/link-wallet/link-tools.js";

const amount = (description: string) => z.number().int().min(0).describe(description);

export const requestPurchaseParameters = z.object({
  merchant_name: z.string().trim().min(1).describe("The shop as the person knows it, e.g. \"Allbirds\"."),
  checkout_url: z.string().trim().min(1).describe("The address of the checkout page open in the browser, at its last step before paying. The card shows this page and Review order opens it."),
  items: z.array(z.object({
    name: z.string().trim().min(1).describe("The item as the checkout names it."),
    quantity: z.number().int().min(1).default(1),
    unit_amount: amount("Price of one, in the smallest unit (cents).").optional(),
    description: z.string().trim().optional().describe("Size, colour, variant."),
  })).min(1).describe("Exactly what is in the cart."),
  total: z.number().int().min(1).describe("The final total the checkout shows, shipping and tax included, in the smallest unit (1999 is $19.99)."),
  currency: z.string().trim().length(3).default("usd").describe("The checkout's currency, three letters."),
  totals: z.array(z.object({
    type: z.enum(["subtotal", "shipping", "tax", "discount", "fee", "tip", "fulfillment", "total"]),
    label: z.string().trim().min(1).describe("As the checkout writes it, e.g. \"Shipping\"."),
    amount: amount("Smallest unit."),
  })).optional().describe("The checkout's own lines: subtotal, shipping, tax, discount."),
  payment_method_id: z.string().trim().optional().describe("Only when the person named a card: its Link payment method id from get_wallet. Leave it out otherwise; the card shows their default and lets them choose among their cards."),
  context: z.string().trim().optional().describe("What the person reads in Link when approving: what is bought, from whom, and why. Spelled out for you when short."),
  credential_type: z.enum(["card", "link_pay_token"]).default("card").describe("\"card\" for a normal card form (almost always). \"link_pay_token\" only when the checkout page holds a `.AiAgentPaymentSteering` block with both input[name=\"link_pay_token\"] and data-stripe-merchant-account in the same frame."),
  merchant_account_id: z.string().trim().optional().describe("acct_… from that block's data-stripe-merchant-account, for link_pay_token only."),
  test: z.boolean().optional().describe("Link's test mode: a test card, nothing charged. Only when the person asked to try purchases out."),
});

export const markPurchaseDoneParameters = z.object({
  entry_id: z.string().trim().min(1).describe("The checkout card's entry id, from the wake that said the purchase was approved."),
  outcome: z.enum(["ordered", "failed", "canceled"]).describe("\"ordered\" once the shop confirmed the order; \"failed\" when it did not go through; \"canceled\" when you stopped before paying (the checkout changed, the person changed their mind)."),
  order_number: z.string().trim().optional().describe("The shop's order or confirmation number, for \"ordered\"."),
  detail: z.string().trim().optional().describe("One plain sentence the person reads: what failed or why it was canceled; for ordered, the delivery estimate."),
});

export interface PurchaseToolDependencies {
  /** The person's Link before the card; undefined when this computer has no Link. */
  checkoutFacts(request: { readonly amount: number; readonly currency: string; readonly paymentMethodId?: string }): Promise<CheckoutFacts> | undefined;
  /** The checkout tab's picture (and the shop's icon), saved where the apps can read them; undefined when no tab on that site could be taken. */
  capturePreview(checkoutUrl: string): Promise<{ readonly url: string; readonly width?: number; readonly height?: number; readonly iconUrl?: string } | undefined>;
  /** Appends the card (the checkout card, or the products card); returns its entry id when the transport reports one. */
  emitCard(message: PurchaseCardMessage | ProductsCardMessage, timestampMs: number): string | undefined;
  markPurchaseDone(args: { readonly entryId: string; readonly outcome: "ordered" | "failed" | "canceled"; readonly order?: string; readonly detail?: string }): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  now?: () => number;
}

export const showProductsParameters = z.object({
  products: z.array(z.object({
    title: z.string().trim().min(1).max(200).describe("The product's name as the shop writes it."),
    url: z.string().trim().min(1).describe("The product's own page on the shop (https)."),
    price: z.string().trim().max(40).optional().describe("The price exactly as the shop shows it, with its currency: \"$2.23\". Leave out when the page shows none."),
    seller: z.string().trim().max(120).optional().describe("Who makes or sells it, as the page names them."),
    image_url: z.string().trim().optional().describe("The product's own picture from its page (https; og:image or the main product photo), never a made-up or generic one."),
    description: z.string().trim().max(200).optional().describe("One short line: format, size, what's included."),
  })).min(1).max(6).describe("What you found, best first: one product when there is one to buy, up to six to choose from."),
});

/** One product as the card carries it: https addresses only, the shop's site named. */
export function productFromArgs(product: z.infer<typeof showProductsParameters>["products"][number]): ProductCardItem | string {
  const url = product.url.includes("://") ? product.url : `https://${product.url}`;
  const domain = purchaseDomain(url);
  if (domain.length === 0 || !/^https:\/\//i.test(url)) return `"${product.title}": url must be the https address of the product's own page.`;
  const image = (product.image_url ?? "").trim();
  const price = product.price ?? "", seller = product.seller ?? "", description = product.description ?? "";
  return {
    title: product.title,
    url,
    domain,
    ...(price.length > 0 ? { price } : {}),
    ...(seller.length > 0 ? { seller } : {}),
    ...(/^https:\/\/\S+$/i.test(image) ? { imageUrl: image } : {}),
    ...(description.length > 0 ? { description } : {}),
  };
}

export function createShowProductsTool(deps: PurchaseToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "SHOW_PRODUCTS",
    name: "ShowProducts",
    description: "Show the person products to buy as cards, before any checkout: each one's picture, name, seller and price, as its shop shows them. They open one and press Buy (you're told exactly which, and you then buy it through the checkout card) or View website. Use it whenever they want to buy something and you've found it on a shop's own pages: one product, or up to six to choose from. Don't list the products again in text.",
    parameters: showProductsParameters,
    describeActivity: (args: z.infer<typeof showProductsParameters>) => ({ detail: args.products.length === 1 ? `Showing ${args.products[0]?.title ?? "a product"}` : `Showing ${args.products.length} products` }),
    execute: async (_ctx, args: z.infer<typeof showProductsParameters>, resolved) => {
      const products: ProductCardItem[] = [];
      for (const given of args.products) {
        const product = productFromArgs(given);
        if (typeof product === "string") return product;
        products.push(product);
      }
      const message: ProductsCardMessage = { type: PRODUCTS_MESSAGE_TYPE, content: productsCardText(products), products };
      const entryId = resolved.emitCard(message, (resolved.now ?? Date.now)());
      return `The products card is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. The person opens one and presses Buy (you're woken with which one, to buy it through the checkout card) or View website. Don't list them again in text; at most one short line on which you'd pick and why, then stop.`;
    },
  });
}

export const PURCHASE_SHOWN_NOTE = "Nothing has been paid and Link has not been asked yet. The person checks the card (Review order opens your computer's screen on the checkout), picks the Link card that pays on it, and presses Allow or Deny; Allow sends it to Link, which asks them to approve it in the Link app, and you are woken once Link approves (then you pay with pay_checkout and place the order) or when they say no. Stop here: say nothing more this turn, don't ask which card or for a go-ahead in chat, and don't touch the checkout until you are woken.";

export function purchaseCardFromArgs(args: z.infer<typeof requestPurchaseParameters>, facts: Extract<CheckoutFacts, { ok: true }>, preview: (NonNullable<PurchaseCardData["preview"]> & { readonly iconUrl?: string }) | undefined): PurchaseCardMessage | string {
  const url = args.checkout_url.includes("://") ? args.checkout_url : `https://${args.checkout_url}`;
  const domain = purchaseDomain(url);
  if (domain.length === 0 || !/^https:\/\//i.test(url)) return "checkout_url must be the https address of the checkout page open in the browser.";
  if (args.credential_type === "link_pay_token" && (args.merchant_account_id ?? "").length === 0) return "link_pay_token needs merchant_account_id (acct_… from the checkout's data-stripe-merchant-account). Without it, use credential_type card.";
  if (args.credential_type === "link_pay_token" && args.test === true) return "Link's test mode works only with credential_type card.";
  const currency = args.currency.toLowerCase();
  const total = formatPurchaseMoney(args.total, currency);
  const items = args.items.map((item) => ({ name: item.name, quantity: item.quantity, ...(item.unit_amount == null ? {} : { unitAmount: item.unit_amount }), ...(item.description == null || item.description.length === 0 ? {} : { description: item.description }) }));
  const totals = (args.totals ?? []).map((line) => ({ type: line.type, label: line.label, amount: line.amount }));
  const base = { merchant: args.merchant_name, domain, total, items };
  const choices = (facts.cards as typeof facts.cards | undefined) ?? [];
  const purchase: PurchaseCardData = {
    merchant: args.merchant_name,
    domain,
    url,
    amount: args.total,
    currency,
    total,
    items,
    totals,
    ...(facts.card.last4.length > 0 || facts.card.brand.length > 0 ? { card: { brand: facts.card.brand, last4: facts.card.last4, ...((facts.card.name ?? "").length > 0 ? { name: facts.card.name } : {}) } } : {}),
    ...(choices.length > 1 ? { cards: choices.map((one) => ({ id: one.id, brand: one.brand, last4: one.last4, ...((one.name ?? "").length > 0 ? { name: one.name } : {}), ...(one.isDefault ? { isDefault: true } : {}) })) } : {}),
    ...(preview == null ? {} : { preview: { url: preview.url, ...(preview.width == null ? {} : { width: preview.width }), ...(preview.height == null ? {} : { height: preview.height }) } }),
    ...(preview?.iconUrl == null ? {} : { icon: { url: preview.iconUrl } }),
    test: args.test === true,
    link: {
      credentialType: args.credential_type,
      ...(args.merchant_account_id == null || args.merchant_account_id.length === 0 ? {} : { merchantAccountId: args.merchant_account_id }),
      ...(facts.paymentMethodId.length === 0 ? {} : { paymentMethodId: facts.paymentMethodId }),
      context: purchaseLinkContext(args.context ?? "", base),
      test: args.test === true,
    },
  };
  return { type: PURCHASE_MESSAGE_TYPE, content: purchaseCardText(purchase), purchase };
}

export function createRequestPurchaseTool(deps: PurchaseToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "REQUEST_PURCHASE",
    name: "RequestPurchase",
    description: "Show the person the checkout card for one purchase they asked for: the shop, a picture of the checkout (Review order opens your computer's screen on it), the Link card that pays (they can switch cards on it) and the total, with Allow and Deny. It is the only way to pay for anything. Call it once the shop's checkout is open in the browser at its last step before paying, with the exact items and final total (shipping and tax included), and after you told the person what the order is. It checks their Link (connected, limits, cards) first and says what's wrong if anything is. Your turn ends with the card.",
    parameters: requestPurchaseParameters,
    describeActivity: (args: z.infer<typeof requestPurchaseParameters>) => ({ detail: `Preparing the checkout at ${args.merchant_name}` }),
    execute: async (_ctx, args: z.infer<typeof requestPurchaseParameters>, resolved) => {
      const asked = resolved.checkoutFacts({ amount: args.total, currency: args.currency, ...(args.payment_method_id == null || args.payment_method_id.length === 0 ? {} : { paymentMethodId: args.payment_method_id }) });
      if (asked == null) return "Link runs on the cloud computer and isn't available here, so nothing can be bought from this conversation.";
      const facts = await asked;
      if (!facts.ok) return facts.message;
      const preview = await resolved.capturePreview(args.checkout_url).catch(() => undefined);
      const message = purchaseCardFromArgs(args, facts, preview);
      if (typeof message === "string") return message;
      const entryId = resolved.emitCard(message, (resolved.now ?? Date.now)());
      const card = facts.card.last4.length > 0 ? ` with ${facts.card.brand} ending ${facts.card.last4}` : (message.purchase.cards ?? []).length > 1 ? ` (the person picks which of their ${message.purchase.cards?.length} Link cards pays)` : "";
      return `The checkout card for ${message.purchase.total} at ${message.purchase.domain}${card} is in the chat${entryId == null ? "" : ` (entry ${entryId})`}${preview == null ? " (no picture: the checkout tab couldn't be found on your computer's browser; keep it open there)" : ""}. ${PURCHASE_SHOWN_NOTE}`;
    },
  });
}

export function createMarkPurchaseDoneTool(deps: PurchaseToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "MARK_PURCHASE_DONE",
    name: "MarkPurchaseDone",
    description: "After a checkout card was approved and you paid (or stopped), say how it went so the card shows it: ordered (with the shop's order number), failed, or canceled. Call it exactly once per approved card.",
    parameters: markPurchaseDoneParameters,
    execute: async (_ctx, args: z.infer<typeof markPurchaseDoneParameters>, resolved) => {
      const done = await resolved.markPurchaseDone({ entryId: args.entry_id, outcome: args.outcome, ...(args.order_number == null ? {} : { order: args.order_number }), ...(args.detail == null ? {} : { detail: args.detail }) });
      if (!done.ok) return done.message;
      if (args.outcome === "ordered") return "The card shows the order. Tell the person in a line or two what was ordered and when it arrives.";
      return "The card shows it didn't go through. Tell the person plainly, and don't try again unless they ask.";
    },
  });
}
