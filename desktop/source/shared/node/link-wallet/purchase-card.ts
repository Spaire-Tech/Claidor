// The checkout card (13 October 2026, the founder: "we also need a card for
// each payment … i'll let you make sure we implement this all logically").
// One card for each purchase, in the chat, before any money is asked for:
//
//   1. The agent has the shop's checkout open on the cloud computer, at its
//      last step before paying, and has told the person what is in the order
//      (items, delivery, price, terms). It calls RequestPurchase, which reads
//      the person's Link card and limits, takes a picture of the checkout and
//      posts this card: the shop, the picture with "Review order", the card
//      that pays ("Visa •••• 1234 · Pay with Link"), the total, Deny and Allow.
//      The agent's turn ends there.
//   2. Deny: nothing is asked of Link; the agent is told once.
//      Allow: Simeon asks Link for a one-time card for exactly this purchase
//      (a spend request), and Link asks the person to approve it in the Link
//      app (or at the approval link the card shows). The host watches Link,
//      not the agent, so waiting costs nothing.
//   3. Approved in Link: the agent is woken to put the one-time card into
//      the checkout (`pay_checkout`), place the order once and say how it
//      went (MarkPurchaseDone), which the card then shows.
//
// What the card carries is what the person sees and what Link needs at
// Allow; never a card number. Its state lives on the entry (`purchaseState`
// and the fields beside it), stamped by the host (`purchase-cards.ts`).

import { createHash } from "node:crypto";

export const PURCHASE_MESSAGE_TYPE = "purchase";

/**
 * review: waiting for the person's Allow or Deny. sending: Allow pressed,
 * Link being asked. approving: Link asked the person to approve (in the Link
 * app or at `purchaseActionUrl`). approved: Link approved, the agent is
 * paying. ordered: the agent placed the order. failed, denied, expired,
 * canceled: nothing more happens.
 */
export type PurchaseState = "review" | "sending" | "approving" | "approved" | "ordered" | "failed" | "denied" | "expired" | "canceled";

export const PURCHASE_FINAL_STATES: ReadonlySet<PurchaseState> = new Set(["ordered", "failed", "denied", "expired", "canceled"]);

export interface PurchaseItem {
  readonly name: string;
  readonly quantity: number;
  /** One item's price, in the currency's smallest unit. */
  readonly unitAmount?: number;
  /** Size, colour, variant. */
  readonly description?: string;
}

export interface PurchaseTotalLine {
  /** subtotal, shipping, tax, discount, fee, tip, fulfillment or total. */
  readonly type: string;
  readonly label: string;
  readonly amount: number;
}

/** What Link needs to make the one-time card at Allow. A payment method id is Link's opaque id, never a card number. */
export interface PurchaseLinkRequest {
  readonly credentialType: "card" | "link_pay_token";
  readonly merchantAccountId?: string;
  readonly paymentMethodId?: string;
  /** What the person reads in the Link app when approving: 100 characters or more. */
  readonly context: string;
  readonly test: boolean;
}

export interface PurchaseCardData {
  /** The shop as the person knows it. */
  readonly merchant: string;
  /** The checkout's site, "ncvss.com". */
  readonly domain: string;
  /** The checkout page ("Review order" opens it). */
  readonly url: string;
  /** The total, shipping and tax included, in the smallest unit. */
  readonly amount: number;
  readonly currency: string;
  /** The total as the card writes it: "$80.00". */
  readonly total: string;
  readonly items: readonly PurchaseItem[];
  readonly totals: readonly PurchaseTotalLine[];
  /** The Link card that pays: "Visa", "1234". */
  readonly card?: { readonly brand: string; readonly last4: string };
  /** The checkout as it looked when the card was made (a picture in the agent's folder). */
  readonly preview?: { readonly url: string; readonly width?: number; readonly height?: number };
  /** Link's test mode: a test card, nothing charged. */
  readonly test: boolean;
  readonly link: PurchaseLinkRequest;
}

export interface PurchaseCardMessage {
  readonly type: typeof PURCHASE_MESSAGE_TYPE;
  /** The card in words, for an app from before the card (it draws `content` as a message). */
  readonly content: string;
  readonly purchase: PurchaseCardData;
}

/** The entry's own fields beside the message, stamped as the purchase moves. */
export interface PurchaseEntryFields {
  readonly purchaseState?: PurchaseState;
  /** One line under the card: Link's own words, a failure, or the order's number. */
  readonly purchaseNote?: string;
  /** Where the person approves (Link's approval page) or does what Link asks first. */
  readonly purchaseActionUrl?: string;
  readonly purchaseSpendRequestId?: string;
  readonly purchaseOrder?: string;
}

/** Currencies without minor units (Stripe's list), so 500 JPY is ¥500. */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

/** An amount in the smallest unit as the person reads it: 8000 usd → "$80.00". */
export function formatPurchaseMoney(amount: number, currency: string): string {
  const code = (currency || "usd").toLowerCase();
  const value = ZERO_DECIMAL.has(code) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code.toUpperCase() }).format(value);
  } catch {
    return `${value.toFixed(ZERO_DECIMAL.has(code) ? 0 : 2)} ${code.toUpperCase()}`;
  }
}

/** "shop.example.com" from an address or a bare domain; "" when there is none. */
export function purchaseDomain(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** "Wireless earbuds ×2, Case" */
export function purchaseItemsLine(items: readonly PurchaseItem[]): string {
  return items.map((item) => item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name).join(", ");
}

/** The card in words: what an app from before the card shows, and the chat list's line. */
export function purchaseCardText(card: Pick<PurchaseCardData, "domain" | "merchant" | "total">): string {
  return `Checkout at ${card.domain || card.merchant} · ${card.total}`;
}

/**
 * What Link shows the person when they approve: the agent's words when they
 * are long enough, else the purchase spelled out (Link refuses under 100
 * characters).
 */
export function purchaseLinkContext(given: string, card: Pick<PurchaseCardData, "merchant" | "domain" | "total" | "items">): string {
  const words = given.trim().replace(/\s+/g, " ");
  if (words.length >= 100) return words.slice(0, 1000);
  const items = purchaseItemsLine(card.items);
  const spelled = `${words.length > 0 ? `${words.replace(/[.\s]+$/, "")}. ` : ""}Buying ${items.length > 0 ? items : "the order in the cart"} from ${card.merchant} (${card.domain}) for ${card.total} in total, as the person asked in Simeon, who reviewed and allowed this checkout before Link was asked.`;
  return spelled.length >= 100 ? spelled : `${spelled} Simeon's agent placed the order on the shop's own checkout page.`;
}

/** Link's idempotency key for one card: the same Allow pressed twice (or from two devices) asks Link once. */
export function purchaseIdempotencyKey(agentId: string, entryId: string, timestampMs: number | undefined): string {
  return `simeon-${createHash("sha256").update(`${agentId}\u0000${entryId}\u0000${timestampMs ?? 0}`).digest("hex").slice(0, 40)}`;
}

/** Link's spend-request status as the card's state (`approving` covers created, pending_approval and requires_action). */
export function purchaseStateForLinkStatus(status: string): PurchaseState | undefined {
  switch (status) {
    case "created":
    case "pending_approval":
    case "requires_action":
      return "approving";
    case "approved":
      return "approved";
    case "submitted":
    case "succeeded":
      return "approved";
    case "denied":
      return "denied";
    case "expired":
      return "expired";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}

const describe = (card: PurchaseCardData): string => `${card.merchant} (${card.domain}) for ${card.total}`;

/** The person pressed Deny: Link was never asked. */
export function buildPurchaseDeniedWakePrompt(entryId: string, card: PurchaseCardData): string {
  return `[The person pressed Deny on the checkout card for ${describe(card)} (entry ${entryId}). Nothing was paid and Link was never asked. Do not buy it by any route, and do not show the card again unless they ask; leave the cart as it is. If they said why, follow that; otherwise one short line at most.]`;
}

/** Link approved: the agent pays, places the order once, and reports. */
export function buildPurchaseApprovedWakePrompt(entryId: string, card: PurchaseCardData, spendRequestId: string): string {
  return [
    `[The person allowed the checkout card for ${describe(card)} (entry ${entryId}) and approved it in Link (spend request ${spendRequestId}${card.test ? ", Link test mode: a test card, nothing is charged" : ""}). Finish the purchase now:`,
    `1. Check the checkout in the browser still shows the same items, delivery and total. If anything changed, don't pay: call cancel_purchase on Link (CallMcpTool, server "link") with spend_request_id "${spendRequestId}", call MarkPurchaseDone with outcome "canceled" and say what changed.`,
    `2. Call pay_checkout on Link with spend_request_id "${spendRequestId}" and checkout_url "${card.url}". It types the one-time card into the page; you never see or type card details.`,
    "3. Have the browser subagent press the page's Place order (or Pay) button once, telling it the person approved this exact order in Simeon and in Link and the card is already filled in, and have it read back the confirmation (order number, delivery estimate).",
    `4. Call MarkPurchaseDone with entry_id "${entryId}": outcome "ordered" with the order number once the shop confirms it, or "failed" with one plain sentence. If you can't tell whether the order went through, say exactly that and never press Pay again.`,
    "Then tell the person in one or two lines what was ordered and when it arrives.]",
  ].join("\n");
}

/** Link denied it, it ran out of time, it was canceled, or Link refused to make the card. */
export function buildPurchaseClosedWakePrompt(entryId: string, card: PurchaseCardData, state: PurchaseState, detail?: string): string {
  const what = state === "denied"
    ? "was declined in Link"
    : state === "expired"
      ? "was not approved in Link within 30 minutes and expired"
      : state === "canceled"
        ? "was canceled"
        : `could not be set up with Link${detail != null && detail.length > 0 ? `: ${detail}` : ""}`;
  return `[The purchase on the checkout card for ${describe(card)} (entry ${entryId}) ${what}. Nothing was paid. Tell the person in one line and wait for them; don't start another purchase unless they ask.]`;
}

/** Link needs the person to do something first that does not resume by itself (verify, change the card). */
export function buildPurchaseActionWakePrompt(entryId: string, card: PurchaseCardData, message: string): string {
  return `[Link needs the person to do something before the purchase on the checkout card for ${describe(card)} (entry ${entryId}) can go ahead: "${message}". The card shows them the link. Once they say it's done, call RequestPurchase again for the same checkout; nothing was paid.]`;
}
