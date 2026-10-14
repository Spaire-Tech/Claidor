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

/** One card in the checkout card's chooser. */
export interface PurchaseCardChoice {
  readonly id: string;
  readonly brand: string;
  readonly last4: string;
  readonly name?: string;
  readonly isDefault?: boolean;
}

/**
 * What the wallet needs at Allow (Link's, or Shop's since 14 October 2026:
 * the field keeps its first name). A payment method id is the wallet's
 * opaque id (a Link payment method, a Shop saved card or a Shop checkout's
 * way to pay), never a card number.
 */
export interface PurchaseLinkRequest {
  readonly credentialType: "card" | "link_pay_token";
  readonly merchantAccountId?: string;
  readonly paymentMethodId?: string;
  /** What the person reads in the Link app (or the Shop app) when approving: 100 characters or more (Shop: at most 500, no links). */
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
  /** The Link card that pays: "Visa", "1234", its name in Link ("Mastercard Debit"); none when the person picks on the card. */
  readonly card?: { readonly brand: string; readonly last4: string; readonly name?: string };
  /**
   * The person's Link cards an agent may pay with, when there are several
   * (14 October 2026): the card's chooser, each with its network's mark. The
   * pick rides with Allow (`answerPurchase`'s `paymentMethodId`); ids are
   * Link's opaque ones, never card numbers.
   */
  readonly cards?: readonly PurchaseCardChoice[];
  /** The checkout as it looked when the card was made (a picture in the agent's folder). */
  readonly preview?: { readonly url: string; readonly width?: number; readonly height?: number };
  /** The shop's own icon, which Review order wears (a picture in the agent's folder). */
  readonly icon?: { readonly url: string };
  /** Link's test mode: a test card, nothing charged. */
  readonly test: boolean;
  readonly link: PurchaseLinkRequest;
  /**
   * The wallet that pays (14 October 2026): Link (absent, as every card
   * before Shop) or Shop. The card names it beside the card that pays
   * ("· Link by Stripe", "· Shop") and Allow asks it.
   */
  readonly wallet?: PurchaseWalletName;
  /**
   * A Shop checkout Simeon opened with a Shopify store (`shop-tools.ts`,
   * `prepare_checkout`), by the handle it is kept under on the computer: the
   * card's items and totals are Shop's own, and Allow pays it with Shop Pay,
   * no browser and no second approval.
   */
  readonly shopCheckout?: { readonly handle: string };
}

export type PurchaseWalletName = "link" | "shop";

/** The wallet a card is paid with, as the agent and the person name it. */
export function purchaseWalletOf(card: Pick<PurchaseCardData, "wallet">): { readonly id: PurchaseWalletName; readonly name: string; readonly app: string } {
  return card.wallet === "shop" ? { id: "shop", name: "Shop", app: "the Shop app" } : { id: "link", name: "Link", app: "the Link app" };
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
  /** The card the person picked on the card at Allow, when it isn't the one the card was made with. */
  readonly purchasePaymentMethodId?: string;
  readonly purchaseCard?: { readonly brand: string; readonly last4: string; readonly name?: string };
  readonly purchaseSpendRequestId?: string;
  readonly purchaseOrder?: string;
  /**
   * A flight's checkout card only (`flight-booking/flight-booking.ts`): where
   * Simeon is while paying it after Link approved (paying, verify: the bank
   * wants the person, booking), or uncertain when the airline never answered.
   */
  readonly purchaseStep?: "paying" | "verify" | "booking" | "uncertain";
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

/**
 * What Shop shows the person when they approve (its `context.intent`): 100
 * to 500 characters, with no links, card details, email or postal
 * addresses, so the agent's words go without any address and the purchase
 * is spelled out when they are short.
 */
export function purchaseShopIntent(given: string, card: Pick<PurchaseCardData, "merchant" | "total" | "items">): string {
  const noAddresses = (value: string): string => value
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|io|shop|store|app|us|ca|uk)\b/gi, "")
    .replace(/\d[\d\s-]{11,}\d/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const words = noAddresses(given);
  if (words.length >= 100) return words.slice(0, 500);
  const items = purchaseItemsLine(card.items);
  const merchant = noAddresses(card.merchant);
  const spelled = noAddresses(`${words.length > 0 ? `${words.replace(/[.\s]+$/, "")}. ` : ""}Buying ${items.length > 0 ? items : "the order in the cart"}${merchant.length > 0 ? ` from ${merchant}` : ""} for ${card.total} in total, as the person asked in Simeon, who reviewed and allowed this checkout before Shop was asked.`);
  return (spelled.length >= 100 ? spelled : `${spelled} Simeon's agent pays on the store's own checkout page.`).slice(0, 500);
}

/**
 * The person's approval of one checkout card, given in Simeon (14 October
 * 2026): Allow, confirmed with Face ID or Touch ID on their own device. As
 * Muse does ("that tap is the real yes/no"), Simeon hands it to Link as the
 * approval (Link's delegated approval, `spend-request create --approve
 * --approval-detail`), so Link makes the one-time card without asking again
 * in the Link app. Link may refuse that for Simeon; the purchase is then
 * asked of the person in the Link app, as before.
 */
export interface PurchaseApproval {
  /** When the person approved, unix seconds, from their device. */
  readonly approvedAt: number;
  /** How they confirmed it on the device: Face ID, Touch ID; none when the device has neither (its passcode, or nothing). */
  readonly authenticationMethod?: "biometric_face" | "biometric_fingerprint";
  /** "mobile" from the iPhone; none from the Mac. */
  readonly deviceType?: "mobile" | "web";
  /** The person's account on Simeon Labs' server. */
  readonly userId: string;
  readonly userName?: string;
}

/** An approval as the apps send it (`answerPurchase`'s `approval`), or undefined when it isn't one: no account id, or a time more than ten minutes from now. */
export function purchaseApprovalFrom(value: unknown, nowMs: number): PurchaseApproval | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const at = typeof record.approvedAt === "number" && Number.isFinite(record.approvedAt) ? Math.round(record.approvedAt) : NaN;
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  if (!Number.isFinite(at) || Math.abs(at * 1000 - nowMs) > 10 * 60_000 || userId.length === 0 || userId.length > 200) return undefined;
  const method = record.authenticationMethod === "biometric_face" || record.authenticationMethod === "biometric_fingerprint" ? record.authenticationMethod : undefined;
  const device = record.deviceType === "mobile" || record.deviceType === "web" ? record.deviceType : undefined;
  const name = typeof record.userName === "string" ? record.userName.trim().slice(0, 120) : "";
  return { approvedAt: at, userId, ...(method == null ? {} : { authenticationMethod: method }), ...(device == null ? {} : { deviceType: device }), ...(name.length > 0 ? { userName: name } : {}) };
}

/** Link's `approval_details` for one approval: Simeon, a click, who and when, and how they confirmed it; the card's entry as the agent's log. */
export function linkApprovalDetails(approval: PurchaseApproval, card: { readonly agentId: string; readonly entryId: string }): Record<string, string | number> {
  return {
    approved_at: approval.approvedAt,
    approval_method: "click",
    app_name: "Simeon",
    external_user_id: approval.userId,
    ...(approval.userName == null ? {} : { external_user_name: approval.userName }),
    ...(approval.deviceType == null ? {} : { device_type: approval.deviceType }),
    ...(approval.authenticationMethod == null ? {} : { authentication_method: approval.authenticationMethod }),
    agent_log_id: card.entryId,
    external_session_id: card.agentId,
  };
}

/** Link's idempotency key for one card: the same Allow pressed twice (or from two devices) asks Link once. */
export function purchaseIdempotencyKey(agentId: string, entryId: string, timestampMs: number | undefined): string {
  return `simeon-${createHash("sha256").update(`${agentId}\u0000${entryId}\u0000${timestampMs ?? 0}`).digest("hex").slice(0, 40)}`;
}

/**
 * A spend request's status as the card's state: Link's (`approving` covers
 * created, pending_approval and requires_action) and Shop's (pending, then
 * approved and consumed once it issued the card).
 */
export function purchaseStateForLinkStatus(status: string): PurchaseState | undefined {
  switch (status) {
    case "created":
    case "pending_approval":
    case "requires_action":
    case "pending":
      return "approving";
    case "approved":
    case "consumed":
      return "approved";
    case "submitted":
    case "succeeded":
      return "approved";
    case "denied":
    case "declined":
    case "rejected":
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

/** The wallet approved: the agent pays, places the order once, and reports. */
export function buildPurchaseApprovedWakePrompt(entryId: string, card: PurchaseCardData, spendRequestId: string): string {
  const wallet = purchaseWalletOf(card);
  return [
    `[The person allowed the checkout card for ${describe(card)} (entry ${entryId}) and approved it in ${wallet.name} (spend request ${spendRequestId}${card.test ? ", Link test mode: a test card, nothing is charged" : ""}). Finish the purchase now:`,
    `1. Check the checkout in the browser still shows the same items, delivery and total. If anything changed, don't pay: call cancel_purchase on ${wallet.name} (CallMcpTool, server "${wallet.id}") with spend_request_id "${spendRequestId}", call MarkPurchaseDone with outcome "canceled" and say what changed.`,
    `2. Call pay_checkout on ${wallet.name} (server "${wallet.id}") with spend_request_id "${spendRequestId}" and checkout_url "${card.url}". It types the one-time card into the page; you never see or type card details.`,
    `3. Have the browser subagent press the page's Place order (or Pay) button once, telling it the person approved this exact order in Simeon and in ${wallet.name} and the card is already filled in, and have it read back the confirmation (order number, delivery estimate).`,
    `4. Call MarkPurchaseDone with entry_id "${entryId}": outcome "ordered" with the order number once the shop confirms it, or "failed" with one plain sentence. If you can't tell whether the order went through, say exactly that and never press Pay again.`,
    "Then tell the person in one or two lines what was ordered and when it arrives.]",
  ].join("\n");
}

/** The wallet denied it, it ran out of time, it was canceled, or the wallet refused to make the card. */
export function buildPurchaseClosedWakePrompt(entryId: string, card: PurchaseCardData, state: PurchaseState, detail?: string): string {
  const wallet = purchaseWalletOf(card).name;
  const what = state === "denied"
    ? `was declined in ${wallet}`
    : state === "expired"
      ? `was not approved in ${wallet} within 30 minutes and expired`
      : state === "canceled"
        ? "was canceled"
        : `could not be set up with ${wallet}${detail != null && detail.length > 0 ? `: ${detail}` : ""}`;
  return `[The purchase on the checkout card for ${describe(card)} (entry ${entryId}) ${what}. Nothing was paid. Tell the person in one line and wait for them; don't start another purchase unless they ask.]`;
}

/** Link needs the person to do something first that does not resume by itself (verify, change the card). */
export function buildPurchaseActionWakePrompt(entryId: string, card: PurchaseCardData, message: string): string {
  return `[${purchaseWalletOf(card).name} needs the person to do something before the purchase on the checkout card for ${describe(card)} (entry ${entryId}) can go ahead: "${message}". The card shows them the link. Once they say it's done, call RequestPurchase again for the same checkout; nothing was paid.]`;
}

/** A Shop checkout's card: Shop placed the order at Allow; the agent only tells the person. */
export function buildShopOrderedWakePrompt(entryId: string, card: PurchaseCardData, order: string): string {
  return `[The person allowed the checkout card for ${describe(card)} (entry ${entryId}) and Shop placed the order with their Shop Pay card (order ${order}). Nothing more to do on the store's site and no MarkPurchaseDone: the card already shows the order. Tell the person in one or two lines what was ordered; the store emails the confirmation and Shop tracks the delivery (search_orders on Shop).]`;
}

/** A Shop checkout Shop never confirmed: nobody can say whether it was paid. */
export function buildShopUncertainWakePrompt(entryId: string, card: PurchaseCardData): string {
  return `[The person allowed the checkout card for ${describe(card)} (entry ${entryId}), but Shop never confirmed whether the order went through. Don't try to buy it again by any route. Tell the person in one line to check the Shop app or their email for the order before anything else.]`;
}

/** A Shop checkout the store wants the person to finish on its page (`requires_escalation`): the card links it. */
export function buildShopEscalatedWakePrompt(entryId: string, card: PurchaseCardData, message: string): string {
  return `[The person allowed the checkout card for ${describe(card)} (entry ${entryId}), but the store needs them to finish a step on its own checkout page before Shop can place the order: "${message}". The card shows them the button for it, and nothing was paid yet. Tell them in one line; you'll be told if the order goes through.]`;
}
