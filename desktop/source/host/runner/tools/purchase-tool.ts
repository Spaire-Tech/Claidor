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
  payment_method_id: z.string().trim().optional().describe("The Link payment method id from get_wallet when the person chose a card; leave out for their default."),
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
  /** The checkout tab's picture, saved where the apps can read it; undefined when no tab is on that site. */
  capturePreview(checkoutUrl: string): Promise<{ readonly url: string; readonly width?: number; readonly height?: number } | undefined>;
  /** Appends the card; returns its entry id when the transport reports one. */
  emitCard(message: PurchaseCardMessage, timestampMs: number): string | undefined;
  markPurchaseDone(args: { readonly entryId: string; readonly outcome: "ordered" | "failed" | "canceled"; readonly order?: string; readonly detail?: string }): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  now?: () => number;
}

export const PURCHASE_SHOWN_NOTE = "Nothing has been paid and Link has not been asked yet. The person checks the card and presses Allow or Deny; Allow sends it to Link, which asks them to approve it in the Link app, and you are woken once Link approves (then you pay with pay_checkout and place the order) or when they say no. Stop here: say nothing more this turn, don't ask again in chat, and don't touch the checkout until you are woken.";

export function purchaseCardFromArgs(args: z.infer<typeof requestPurchaseParameters>, facts: Extract<CheckoutFacts, { ok: true }>, preview: PurchaseCardData["preview"]): PurchaseCardMessage | string {
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
  const purchase: PurchaseCardData = {
    merchant: args.merchant_name,
    domain,
    url,
    amount: args.total,
    currency,
    total,
    items,
    totals,
    ...(facts.card.last4.length > 0 || facts.card.brand.length > 0 ? { card: facts.card } : {}),
    ...(preview == null ? {} : { preview }),
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
    description: "Show the person the checkout card for one purchase they asked for: the shop, a picture of the checkout, the Link card that pays and the total, with Allow and Deny. It is the only way to pay for anything. Call it once the shop's checkout is open in the browser at its last step before paying, with the exact items and final total (shipping and tax included), and after you told the person what the order is. It checks their Link (connected, limits, card) first and says what's wrong if anything is. Your turn ends with the card.",
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
      const card = facts.card.last4.length > 0 ? ` with ${facts.card.brand} ending ${facts.card.last4}` : "";
      return `The checkout card for ${message.purchase.total} at ${message.purchase.domain}${card} is in the chat${entryId == null ? "" : ` (entry ${entryId})`}${preview == null ? " (no picture: no browser tab was on that site)" : ""}. ${PURCHASE_SHOWN_NOTE}`;
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
