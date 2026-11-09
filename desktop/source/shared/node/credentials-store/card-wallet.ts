// Paying with a card the person saved in the Credentials Store (9 November
// 2026, the founder: "actual cards there that the agent can use to make
// payments"). It plugs into the checkout card as a third wallet beside Link
// and Shop (`purchase-card.ts`, wallet "card"):
//
//   - Before the card: the saved cards (the network, the last four, the
//     name), an expired one left out; the one the person named, else the
//     first, pays, and the card's chooser offers the others.
//   - Allow, confirmed with Face ID or Touch ID on the person's own device,
//     is the approval: there is no other app to approve in. Without that
//     confirmation nothing is approved.
//   - Approved: the agent checks the checkout and calls PayWithSavedCard,
//     which reads the card from Simeon Labs' server and types it into the
//     checkout on the card's own site only (`fillCheckout`'s `strictSite`).
//     The agent never sees the number or the security code.

import { cardExpired, cardTitle, type CredentialsStore, type StoredCard } from "./credentials-store.js";
import type { CheckoutFacts, LinkCardChoice, SpendAnswer, SpendRequestInput } from "../link-wallet/link-tools.js";
import type { CheckoutFillResult, fillCheckout as FillCheckout } from "../link-wallet/checkout-fill.js";
import { purchaseDomain } from "../link-wallet/purchase-card.js";

/** A saved card's purchase id: the checkout card's own key, so the same card is never approved twice. */
const PURCHASE_PREFIX = "card-";

export interface StoredCardWalletOptions {
  readonly store: CredentialsStore;
  readonly fill: typeof FillCheckout;
  /** The DevTools ports to look at, the agent's own Chrome first. */
  readonly ports?: (agentId: string) => readonly number[];
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

function choiceOf(card: StoredCard): LinkCardChoice {
  return { id: card.id, brand: card.brand, last4: card.last4, name: card.name.trim(), isDefault: false };
}

export function createStoredCardWallet(options: StoredCardWalletOptions) {
  const log = (line: string): void => options.log?.(`[purchase] ${line}`);

  /** The saved cards an agent may pay with: those not expired. */
  const usable = async (): Promise<{ readonly ok: true; readonly cards: readonly StoredCard[] } | { readonly ok: false; readonly message: string }> => {
    const listed = await options.store.list();
    if (!listed.ok) return { ok: false, message: `The Credentials Store couldn't be read: ${listed.message}` };
    const now = options.now?.() ?? new Date();
    const cards = listed.entries.filter((entry): entry is StoredCard => entry.kind === "card" && !cardExpired(entry.expiry, now));
    return { ok: true, cards };
  };

  /** Whether the person has a card saved an agent may pay with. */
  const hasCards = async (): Promise<boolean> => {
    const read = await usable();
    return read.ok && read.cards.length > 0;
  };

  const checkoutFacts = async (request: { readonly amount: number; readonly currency: string; readonly paymentMethodId?: string }): Promise<CheckoutFacts> => {
    const read = await usable();
    if (!read.ok) return read;
    if (read.cards.length === 0) return { ok: false, message: "No card is saved in the user's Credentials Store (or the saved ones have expired). Offer to keep one with RequestStoreEntry (kind card), or pay with Link." };
    const asked = request.paymentMethodId?.trim() ?? "";
    const paying = asked.length > 0 ? read.cards.find((card) => card.id === asked) : read.cards[0];
    if (paying == null) return { ok: false, message: "That card isn't in the user's Credentials Store: use an entry_id ListStoredCredentials gives, or leave it out." };
    return { ok: true, paymentMethodId: paying.id, card: { brand: paying.brand, last4: paying.last4, name: paying.name.trim() || cardTitle(paying) }, cards: read.cards.map(choiceOf), ...(paying.cardholder.length > 0 ? { holder: paying.cardholder } : {}) };
  };

  /** Allow: approved at once when the person confirmed it on their device; nothing else asks. */
  const requestSpend = async (request: SpendRequestInput): Promise<SpendAnswer> => {
    if (request.approval == null) return { ok: false, code: "NOT_CONFIRMED", message: "Allow needs your OK on your device (Face ID or Touch ID). Nothing was paid." };
    const id = request.paymentMethodId ?? "";
    const read = await usable();
    if (!read.ok) return { ok: false, code: "STORE_FAILED", message: read.message };
    const card = read.cards.find((one) => one.id === id);
    if (card == null) return { ok: false, code: "NO_CARD", message: "That card isn't in your Credentials Store anymore, or it has expired. Nothing was paid." };
    log(`allowed with a saved card for ${purchaseDomain(request.merchantUrl) || request.merchantName}`);
    return { ok: true, id: `${PURCHASE_PREFIX}${request.idempotencyKey}`, status: "approved", approvedInSimeon: true };
  };

  const spendStatus = async (id: string): Promise<SpendAnswer> => ({ ok: true, id, status: "approved" });
  const cancelSpend = async (): Promise<boolean> => true;
  const reportOutcome = async (): Promise<void> => undefined;

  /**
   * The saved card typed into the checkout, on the checkout's own site
   * only. What comes back is which fields went in, never a value.
   */
  const pay = async (args: { readonly agentId: string; readonly cardId: string; readonly checkoutUrl: string }): Promise<CheckoutFillResult> => {
    const read = await options.store.readCard(args.cardId);
    if (!read.ok) return read;
    const site = purchaseDomain(args.checkoutUrl);
    const filled = await options.fill({ card: read.fill, pageHint: site, strictSite: true, ...(options.ports == null ? {} : { ports: options.ports(args.agentId) }) });
    log(`saved card ${filled.ok ? `typed on ${filled.page}: ${filled.filled.join(", ")}${filled.missing.length > 0 ? `; missing ${filled.missing.join(", ")}` : ""}` : `not typed: ${filled.message}`}`);
    return filled;
  };

  return { checkoutFacts, requestSpend, spendStatus, cancelSpend, reportOutcome, hasCards, pay };
}

export type StoredCardWallet = ReturnType<typeof createStoredCardWallet>;
