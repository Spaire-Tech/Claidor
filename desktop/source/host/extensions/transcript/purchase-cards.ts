/**
 * The checkout card's host side (13 October 2026; the card itself and the
 * whole path are described in `shared/node/link-wallet/purchase-card.ts`).
 *
 * RequestPurchase posts the card and the agent's turn ends. The apps answer
 * with `answerPurchase`:
 *   - Deny: the card says Denied and the agent is told once; Link was never
 *     asked.
 *   - Allow: the card says it is asking Link, Simeon makes the spend request
 *     (one per card: its idempotency key is the card's), and the card shows
 *     Link's approval link while Link asks the person in the Link app. This
 *     side then watches Link (`spend-request retrieve` waiting for a change,
 *     two minutes a look, until Link's 30 minutes are up), so the agent
 *     spends nothing while the person approves. Approved wakes the agent to
 *     pay; declined, expired or canceled closes the card and tells it.
 *   - `resume`: an app showing a card that is still with Link asks this side
 *     to make sure someone is watching it (after a restart nobody is). It
 *     never answers a card that waits on the person.
 * MarkPurchaseDone (the agent, after paying) closes the card as ordered,
 * failed or canceled and tells Link how it went.
 * A purchase that ends settles the products card whose Buy led to it: the
 * product shows Bought once ordered, and Buying goes otherwise.
 *
 * The card's entry may belong to any agent, open or not, so each change is
 * written to that agent's own transcript and sent to the apps with its id.
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import { updateEntry } from "./transcript-store.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";
import {
  PURCHASE_FINAL_STATES,
  PURCHASE_MESSAGE_TYPE,
  buildPurchaseActionWakePrompt,
  buildPurchaseApprovedWakePrompt,
  buildPurchaseClosedWakePrompt,
  buildPurchaseDeniedWakePrompt,
  buildShopEscalatedWakePrompt,
  buildShopOrderedWakePrompt,
  buildShopUncertainWakePrompt,
  linkApprovalDetails,
  purchaseApprovalFrom,
  purchaseIdempotencyKey,
  purchaseStateForLinkStatus,
  purchaseWalletOf,
  type PurchaseCardData,
  type PurchaseEntryFields,
  type PurchaseState,
} from "../../../shared/node/link-wallet/purchase-card.js";
import { LINK_ACTION_DEFAULT, type LinkTools, type SpendAnswer } from "../../../shared/node/link-wallet/link-tools.js";
import type { ShopTools } from "../../../shared/node/shop-wallet/shop-tools.js";
import { buildFlightFailedWakePrompt, buildFlightUncertainWakePrompt, purchaseFlightOf } from "../../../shared/node/flight-booking/flight-booking.js";
import { PRODUCTS_MESSAGE_TYPE, buildProductBuyWakePrompt, productBoughtBy, type ProductCardItem, type ProductsEntryFields } from "../../../shared/node/link-wallet/product-card.js";

type PurchaseEntry = TranscriptEntry & PurchaseEntryFields & { readonly message: { readonly type: typeof PURCHASE_MESSAGE_TYPE; readonly purchase: PurchaseCardData } };
type ProductsEntry = TranscriptEntry & ProductsEntryFields & { readonly message: { readonly type: typeof PRODUCTS_MESSAGE_TYPE; readonly products: readonly ProductCardItem[] } };

/** A change to the card's fields; a field set to undefined is removed. */
type PurchasePatch = { readonly [K in keyof PurchaseEntryFields]?: PurchaseEntryFields[K] | undefined };

/**
 * A wallet's steps this side uses: Link's (`link-tools.ts`) or Shop's
 * (`shop-wallet/shop-tools.ts`, which also pays a Shop checkout itself).
 */
export type PurchaseWallet = Pick<LinkTools, "requestSpend" | "spendStatus" | "cancelSpend"> & {
  reportOutcome(args: { readonly domain: string; readonly spendRequestId: string; readonly outcome: "success" | "blocked" | "abandoned"; readonly context?: string; readonly order?: string }): Promise<void>;
} & Partial<Pick<LinkTools, "checkoutFacts">> & Partial<Pick<ShopTools, "completeShopCheckout" | "shopCheckoutStatus">>;

/** The box's wallets, by name (the gateway's); a card is answered by its own (`PurchaseCardData.wallet`). */
export interface PurchaseWallets {
  readonly link?: PurchaseWallet;
  readonly shop?: PurchaseWallet;
}

/** The wallet that answers a card: one given for every card (the tests', the flights'), else the card's own of the box's. */
export function purchaseWalletFor(card: Pick<PurchaseCardData, "wallet">, wallets: PurchaseWallet | PurchaseWallets | undefined): PurchaseWallet | undefined {
  if (wallets == null) return undefined;
  if (typeof (wallets as PurchaseWallet).requestSpend === "function") return wallets as PurchaseWallet;
  const named = wallets as PurchaseWallets;
  return card.wallet === "shop" ? named.shop : named.link;
}

/** Link gives the person 30 minutes to approve; the watch stops a little after. */
const WATCH_LIMIT_MS = 35 * 60_000;
/** One look waits this long for Link to move on. */
const WATCH_STEP_SECONDS = 120;
/** A Shop checkout handed to the person on the store's page is watched while Shop keeps it (six hours). */
const SHOP_CHECKOUT_WATCH_LIMIT_MS = 6 * 3_600_000;

export function isPurchaseEntry(entry: unknown): entry is PurchaseEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; purchase?: unknown } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === PURCHASE_MESSAGE_TYPE && record.message.purchase != null && typeof record.message.purchase === "object";
}

/** The products card (`product-card.ts`). */
export function isProductsEntry(entry: unknown): entry is ProductsEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; products?: unknown } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === PRODUCTS_MESSAGE_TYPE && Array.isArray(record.message.products);
}

export function purchaseStateOf(entry: PurchaseEntry): PurchaseState {
  return entry.purchaseState ?? "review";
}

export interface PurchaseCardsOptions {
  /** Waits between a failed look at Link and the next (tests make it 0). */
  readonly retryDelayMs?: number;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

export class PurchaseCards {
  /** Cards Link is being watched for, by agent and entry. */
  private readonly watching = new Set<string>();
  private readonly retryDelayMs: number;
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  constructor(private readonly tm: TranscriptManagerLike, options: PurchaseCardsOptions = {}) {
    this.retryDelayMs = options.retryDelayMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`));
  }

  /**
   * The person's Allow or Deny on a card, or an app asking that a card with
   * Link is watched (`resume`). Allow carries the card they picked on it
   * (`paymentMethodId`, one of the card's own `cards`), checked with Link
   * again before the card is taken; a card Link won't let an agent use
   * leaves the card waiting with a line saying so.
   */
  async answerPurchase(args: { readonly agentId: string; readonly entryId: string; readonly allow?: boolean; readonly resume?: boolean; readonly paymentMethodId?: string; readonly approval?: unknown }, wallets: PurchaseWallet | PurchaseWallets | undefined): Promise<TranscriptEntry | null> {
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return null;
    const state = purchaseStateOf(current);
    const wallet = purchaseWalletFor(current.message.purchase, wallets);
    if (args.resume === true) {
      if (state === "approving" && current.message.purchase.shopCheckout != null && wallet != null) this.watchShopCheckout(args.agentId, args.entryId, current.message.purchase.shopCheckout.handle, wallet);
      else if ((state === "approving" || state === "sending") && current.purchaseSpendRequestId != null && wallet != null) this.watch(args.agentId, args.entryId, current.purchaseSpendRequestId, wallet);
      if (state === "approved" && purchaseFlightOf(current.message.purchase) != null && this.tm.flightBookings?.isPaying?.(args.agentId, args.entryId) !== true) return await this.flightInterrupted(args.agentId, args.entryId, current, wallet);
      return current;
    }
    if (state !== "review") return current;
    const card = current.message.purchase;
    if (args.allow !== true) {
      let took = false;
      const denied = await this.stamp(args.agentId, args.entryId, (entry) => {
        if (purchaseStateOf(entry) !== "review") return null;
        took = true;
        return { purchaseState: "denied" };
      });
      if (!took) return denied;
      this.log(`[purchase] denied on the card ${args.agentId}/${args.entryId}`);
      this.tm.flightBookings?.flightClosed?.(args.agentId, card);
      this.wake(args.agentId, "purchase-denied", buildPurchaseDeniedWakePrompt(args.entryId, card));
      return denied;
    }
    if (wallet == null) {
      const name = purchaseWalletOf(card).name;
      const failed = await this.stamp(args.agentId, args.entryId, () => ({ purchaseState: "failed", purchaseNote: say(this.language(), "purchase.walletMissing", { wallet: name }) }));
      this.wake(args.agentId, "purchase-failed", buildPurchaseClosedWakePrompt(args.entryId, card, "failed", `${name} isn't available on this computer`));
      return failed;
    }
    const picked = await this.pickedCard(args, current, wallet);
    if (!picked.ok) return picked.entry;
    // Sending first, so a second Allow (another device, a double tap) finds the card taken; only the Allow that took it asks Link.
    let took = false;
    const sending = await this.stamp(args.agentId, args.entryId, (entry) => {
      if (purchaseStateOf(entry) !== "review") return null;
      took = true;
      return { purchaseState: "sending", purchaseNote: undefined, ...(picked.change ?? {}) };
    });
    if (!took) return sending;
    const paymentMethodId = picked.paymentMethodId;
    // A Shop checkout: Shop pays it now, with the card picked; no spend request, no app to approve in.
    if (card.shopCheckout != null) return await this.payShopCheckout(args.agentId, args.entryId, current, paymentMethodId, wallet, args.approval);
    // The person's Allow, confirmed on their device (Face ID, Touch ID), handed to Link as the approval (14 October 2026); without one, Link asks in its app.
    const approval = purchaseApprovalFrom(args.approval, this.now());
    if (args.approval != null && approval == null) this.log(`[purchase] ${args.agentId}/${args.entryId}: an approval without an account or out of time; Link asks in its app`);
    const spend = await wallet.requestSpend({
      idempotencyKey: purchaseIdempotencyKey(args.agentId, args.entryId, current.timestampMs),
      credentialType: card.link.credentialType,
      amount: card.amount,
      currency: card.currency,
      context: card.link.context,
      merchantName: card.merchant,
      merchantUrl: card.url,
      ...(card.link.merchantAccountId == null ? {} : { merchantAccountId: card.link.merchantAccountId }),
      ...(paymentMethodId == null ? {} : { paymentMethodId }),
      lineItems: card.items,
      totals: card.totals,
      test: card.test,
      ...(approval == null ? {} : { approval: linkApprovalDetails(approval, { agentId: args.agentId, entryId: args.entryId }) }),
    }).catch((error: unknown): SpendAnswer => ({ ok: false, code: "LINK_FAILED", message: error instanceof Error ? error.message : String(error) }));
    const named = purchaseWalletOf(card).name;
    this.log(`[purchase] allowed ${args.agentId}/${args.entryId}${card.wallet === "shop" ? " with Shop" : ""}${approval == null ? "" : approval.authenticationMethod == null ? " (approved in Simeon)" : ` (approved in Simeon, ${approval.authenticationMethod})`}: ${spend.ok ? `${spend.status} ${spend.id}${spend.approvedInSimeon === true ? `, ${named} took it` : approval == null ? "" : `, ${named} asks in its app`}` : `failed ${spend.code}`}`);
    return await this.apply(args.agentId, args.entryId, spend, wallet);
  }

  /**
   * Which Link card pays at Allow: the one the person picked on the card when
   * it is one the card offered and Link still lets an agent use it, else the
   * card's own. A pick Link refuses, or none on a card that asks for one,
   * leaves the card waiting with a line for the person.
   */
  private async pickedCard(args: { readonly agentId: string; readonly entryId: string; readonly paymentMethodId?: string }, current: PurchaseEntry, wallet: PurchaseWallet): Promise<{ readonly ok: true; readonly paymentMethodId?: string; readonly change?: PurchasePatch } | { readonly ok: false; readonly entry: TranscriptEntry | null }> {
    const card = current.message.purchase;
    const own = current.purchasePaymentMethodId ?? card.link.paymentMethodId;
    const asked = args.paymentMethodId?.trim() ?? "";
    const offered = asked.length > 0 ? (card.cards ?? []).find((one) => one.id === asked) : undefined;
    const keepWaiting = async (note: string): Promise<{ readonly ok: false; readonly entry: TranscriptEntry | null }> => {
      this.log(`[purchase] card not taken ${args.agentId}/${args.entryId}: ${note}`);
      return { ok: false, entry: await this.stamp(args.agentId, args.entryId, (entry) => purchaseStateOf(entry) !== "review" ? null : { purchaseNote: note }) };
    };
    if (offered == null || offered.id === own) {
      if (asked.length > 0 && offered == null) this.log(`[purchase] ${args.agentId}/${args.entryId}: a card the checkout card didn't offer was asked for; its own pays`);
      if ((own ?? "").length === 0 && (card.cards ?? []).length > 1) return await keepWaiting(say(this.language(), "purchase.chooseCard"));
      return { ok: true, ...((own ?? "").length === 0 ? {} : { paymentMethodId: own }) };
    }
    // A Shop checkout's ways to pay are the checkout's own, checked again when it is paid; a wallet's saved card is checked with the wallet now.
    if (wallet.checkoutFacts != null && card.shopCheckout == null) {
      const name = purchaseWalletOf(card).name;
      const facts = await wallet.checkoutFacts({ amount: card.amount, currency: card.currency, paymentMethodId: offered.id }).catch((error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }));
      // The wallet's sentence is the agent's (English); the person's is said here.
      if (!facts.ok) return await keepWaiting(/can't be used for purchases by an agent/.test(facts.message) ? say(this.language(), "purchase.cardRefused", { wallet: name, card: offered.name || offered.brand, last4: offered.last4 }) : say(this.language(), "purchase.cardCheckFailed", { wallet: name }));
    }
    return { ok: true, paymentMethodId: offered.id, change: { purchasePaymentMethodId: offered.id, purchaseCard: { brand: offered.brand, last4: offered.last4, ...(offered.name == null || offered.name.length === 0 ? {} : { name: offered.name }) } } };
  }

  /**
   * "Buy" on one product of a products card (14 October 2026): the card marks
   * it, and the agent is woken to buy exactly that one through the checkout
   * card. The same product pressed again (a double tap, a second device), or
   * one already bought, wakes nobody.
   */
  async buyProduct(args: { readonly agentId: string; readonly entryId: string; readonly index: number }): Promise<TranscriptEntry | null> {
    const current = await this.readAs(args.agentId, args.entryId, isProductsEntry);
    if (current == null) return null;
    const product = Number.isInteger(args.index) ? current.message.products[args.index] : undefined;
    if (product == null) return current;
    let took = false;
    const stamped = await this.stampAs(args.agentId, args.entryId, isProductsEntry, (entry) => {
      if (entry.productsBuying === args.index || entry.productsBought?.includes(args.index) === true) return null;
      took = true;
      return { productsBuying: args.index };
    });
    if (!took) return stamped;
    this.log(`[purchase] buy pressed on product ${args.index} ${args.agentId}/${args.entryId} (${product.domain})`);
    this.wake(args.agentId, "product-buy", buildProductBuyWakePrompt(args.entryId, product));
    return stamped;
  }

  /** The agent's word after paying: ordered (with the order's number), failed, or canceled. */
  async markPurchaseDone(args: { readonly agentId: string; readonly entryId: string; readonly outcome: "ordered" | "failed" | "canceled"; readonly order?: string; readonly detail?: string }, wallets: PurchaseWallet | PurchaseWallets | undefined): Promise<{ readonly ok: true; readonly entry: TranscriptEntry } | { readonly ok: false; readonly message: string }> {
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return { ok: false, message: `No checkout card with entry id "${args.entryId}" in this chat.` };
    if (purchaseFlightOf(current.message.purchase) != null) return { ok: false, message: "Simeon books flights itself and closes their card; there is nothing to mark. Wait to be told how the booking went." };
    const wallet = purchaseWalletFor(current.message.purchase, wallets);
    const state = purchaseStateOf(current);
    if (current.message.purchase.shopCheckout != null && !PURCHASE_FINAL_STATES.has(state)) return { ok: false, message: "Shop pays this checkout itself and the card shows how it went; there is nothing to mark." };
    if (state === "review" || state === "sending" || state === "approving") return { ok: false, message: "This purchase isn't approved yet: nothing to mark. Wait to be woken." };
    if (PURCHASE_FINAL_STATES.has(state)) return { ok: true, entry: current };
    const order = args.order?.trim() ?? "";
    const detail = args.detail?.trim() ?? "";
    const stamped = await this.stamp(args.agentId, args.entryId, () => ({
      purchaseState: args.outcome,
      ...(order.length > 0 ? { purchaseOrder: order.slice(0, 80) } : {}),
      ...(detail.length > 0 ? { purchaseNote: detail.slice(0, 300) } : {}),
    }));
    if (stamped == null) return { ok: false, message: "The card could not be updated." };
    const id = current.purchaseSpendRequestId;
    if (wallet != null && id != null) {
      void wallet.reportOutcome({ domain: current.message.purchase.domain, spendRequestId: id, outcome: args.outcome === "ordered" ? "success" : args.outcome === "failed" ? "blocked" : "abandoned", ...(detail.length > 0 ? { context: detail } : {}), ...(order.length > 0 ? { order } : {}) }).catch(() => undefined);
      // A purchase dropped before its card was used: the one-time card goes too.
      if (args.outcome === "canceled") void wallet.cancelSpend(id).catch(() => false);
    }
    this.log(`[purchase] ${args.outcome} ${args.agentId}/${args.entryId}`);
    return { ok: true, entry: stamped };
  }

  /** What one answer from Link means for the card, and whom it wakes. */
  private async apply(agentId: string, entryId: string, spend: SpendAnswer, wallet: PurchaseWallet): Promise<TranscriptEntry | null> {
    const current = await this.read(agentId, entryId);
    if (current == null) return null;
    const card = current.message.purchase;
    if (!spend.ok) {
      let failed = false;
      const stamped = await this.stamp(agentId, entryId, (entry) => {
        if (PURCHASE_FINAL_STATES.has(purchaseStateOf(entry)) || purchaseStateOf(entry) === "approved") return null;
        failed = true;
        return { purchaseState: "failed", purchaseNote: spendFailureNote(spend, purchaseWalletOf(card).name, this.language()) };
      });
      if (failed) {
        this.tm.flightBookings?.flightClosed?.(agentId, card);
        this.wake(agentId, "purchase-failed", buildPurchaseClosedWakePrompt(entryId, card, "failed", spend.message));
      }
      return stamped;
    }
    const state = purchaseStateForLinkStatus(spend.status) ?? "approving";
    if (state === "approving") {
      const stamped = await this.stamp(agentId, entryId, () => ({
        purchaseState: "approving",
        purchaseSpendRequestId: spend.id,
        ...(spend.action != null ? { purchaseNote: this.actionNote(spend.action.message) } : {}),
        ...((spend.action?.url ?? spend.approvalUrl) == null ? {} : { purchaseActionUrl: spend.action?.url ?? spend.approvalUrl }),
      }));
      if (spend.action != null && !spend.action.resumes) {
        // Link wants something done first that does not come back by itself: this request is over.
        await this.stamp(agentId, entryId, () => ({ purchaseState: "failed", purchaseNote: spend.action == null ? say(this.language(), "purchase.linkNeedsActionFirst") : this.actionNote(spend.action.message) }));
        this.wake(agentId, "purchase-action", buildPurchaseActionWakePrompt(entryId, card, spend.action.message));
        return await this.read(agentId, entryId);
      }
      this.watch(agentId, entryId, spend.id, wallet);
      return stamped;
    }
    let moved = false;
    const stamped = await this.stamp(agentId, entryId, (entry) => {
      if (PURCHASE_FINAL_STATES.has(purchaseStateOf(entry)) || purchaseStateOf(entry) === state) return null;
      moved = true;
      return { purchaseState: state, purchaseSpendRequestId: spend.id, purchaseNote: undefined };
    });
    if (!moved) return stamped;
    if (state === "approved" && purchaseFlightOf(card) != null) {
      // A flight: Simeon pays the airline itself (`flight-bookings.ts`); the agent is told how it went.
      const flights = this.tm.flightBookings;
      if (flights?.payApprovedFlight == null) {
        await this.stamp(agentId, entryId, () => ({ purchaseState: "failed", purchaseNote: say(this.language(), "flight.unavailable") }));
        void wallet.cancelSpend(spend.id).catch(() => false);
        return await this.read(agentId, entryId);
      }
      void Promise.resolve(flights.payApprovedFlight(agentId, entryId, card, spend.id)).catch((error: unknown) => this.log(`[flight] paying ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
      return stamped;
    }
    if (state === "approved") this.wake(agentId, "purchase-approved", buildPurchaseApprovedWakePrompt(entryId, card, spend.id));
    else {
      this.tm.flightBookings?.flightClosed?.(agentId, card);
      this.wake(agentId, `purchase-${state}`, buildPurchaseClosedWakePrompt(entryId, card, state));
    }
    return stamped;
  }

  /**
   * Allow on a Shop checkout's card: Shop pays it with the card the person
   * picked, after checking it is still ready and still the total they saw
   * (`shop-tools.ts`). Placed: the card shows the order and the agent only
   * tells them. The store wants a step on its own page: the card links it
   * and the checkout is watched. Anything else closes the card, nothing paid
   * (or, when Shop never answered, says so plainly).
   */
  private async payShopCheckout(agentId: string, entryId: string, current: PurchaseEntry, instrumentId: string | undefined, wallet: PurchaseWallet, approval: unknown): Promise<TranscriptEntry | null> {
    const card = current.message.purchase;
    const handle = card.shopCheckout?.handle ?? "";
    const confirmed = purchaseApprovalFrom(approval, this.now());
    const language = this.language();
    if (wallet.completeShopCheckout == null) {
      await this.stamp(agentId, entryId, () => ({ purchaseState: "failed", purchaseNote: say(language, "purchase.walletMissing", { wallet: "Shop" }) }));
      this.wake(agentId, "purchase-failed", buildPurchaseClosedWakePrompt(entryId, card, "failed", "Shop isn't available on this computer"));
      return await this.read(agentId, entryId);
    }
    const outcome = await wallet.completeShopCheckout({ handle, ...(instrumentId == null ? {} : { instrumentId }), amount: card.amount, currency: card.currency, idempotencyKey: purchaseIdempotencyKey(agentId, entryId, current.timestampMs), ...(language == null ? {} : { language }) })
      .catch((error: unknown) => ({ ok: false as const, code: "UNCERTAIN", message: say(language, "purchase.shopUnconfirmed", { why: error instanceof Error ? error.message : String(error) }) }));
    this.log(`[purchase] allowed ${agentId}/${entryId} with Shop checkout${confirmed?.authenticationMethod == null ? "" : ` (${confirmed.authenticationMethod})`}: ${outcome.ok ? outcome.status : `failed ${outcome.code}`}`);
    if (outcome.ok && outcome.status === "completed") {
      const stamped = await this.stamp(agentId, entryId, () => ({ purchaseState: "ordered", purchaseOrder: outcome.order.slice(0, 80), purchaseNote: undefined, purchaseActionUrl: undefined }));
      this.wake(agentId, "purchase-ordered", buildShopOrderedWakePrompt(entryId, card, outcome.order));
      return stamped;
    }
    if (outcome.ok) {
      const stamped = await this.stamp(agentId, entryId, () => ({ purchaseState: "approving", purchaseNote: outcome.message.slice(0, 300), ...(outcome.url == null ? {} : { purchaseActionUrl: outcome.url }) }));
      this.wake(agentId, "purchase-action", buildShopEscalatedWakePrompt(entryId, card, outcome.message));
      this.watchShopCheckout(agentId, entryId, handle, wallet);
      return stamped;
    }
    const stamped = await this.stamp(agentId, entryId, () => ({ purchaseState: "failed", purchaseNote: plainWalletError(outcome.message, "Shop", language) }));
    this.wake(agentId, "purchase-failed", outcome.code === "UNCERTAIN" ? buildShopUncertainWakePrompt(entryId, card) : buildPurchaseClosedWakePrompt(entryId, card, "failed", outcome.message));
    return stamped;
  }

  /** Watches a Shop checkout the person finishes on the store's page, until it is ordered or canceled; one watch per card. */
  private watchShopCheckout(agentId: string, entryId: string, handle: string, wallet: PurchaseWallet): void {
    const key = `${agentId}\u0000${entryId}`;
    if (this.watching.has(key) || wallet.shopCheckoutStatus == null) return;
    const status = wallet.shopCheckoutStatus;
    this.watching.add(key);
    const started = this.now();
    void (async () => {
      try {
        while (this.now() - started < SHOP_CHECKOUT_WATCH_LIMIT_MS) {
          await new Promise((resolve) => setTimeout(resolve, this.now() - started < 10 * 60_000 ? Math.min(this.retryDelayMs, 10_000) : Math.min(this.retryDelayMs * 6, 60_000)));
          const current = await this.read(agentId, entryId);
          if (current == null || purchaseStateOf(current) !== "approving") return;
          const seen = await status(handle).catch(() => ({ status: "waiting" as const }));
          if (seen.status === "waiting") continue;
          const card = current.message.purchase;
          if (seen.status === "completed") {
            await this.stamp(agentId, entryId, (entry) => purchaseStateOf(entry) !== "approving" ? null : { purchaseState: "ordered", purchaseOrder: seen.order.slice(0, 80), purchaseNote: undefined, purchaseActionUrl: undefined });
            this.wake(agentId, "purchase-ordered", buildShopOrderedWakePrompt(entryId, card, seen.order));
          } else {
            await this.stamp(agentId, entryId, (entry) => purchaseStateOf(entry) !== "approving" ? null : { purchaseState: seen.status === "canceled" ? "canceled" : "expired", purchaseActionUrl: undefined });
            this.wake(agentId, `purchase-${seen.status === "canceled" ? "canceled" : "expired"}`, buildPurchaseClosedWakePrompt(entryId, card, seen.status === "canceled" ? "canceled" : "expired"));
          }
          return;
        }
      } finally {
        this.watching.delete(key);
      }
    })();
  }

  /** Watches Link for one card until it is approved, declined or out of time; one watch per card. */
  private watch(agentId: string, entryId: string, spendRequestId: string, wallet: PurchaseWallet): void {
    const key = `${agentId}\u0000${entryId}`;
    if (this.watching.has(key)) return;
    this.watching.add(key);
    const started = this.now();
    void (async () => {
      try {
        while (this.now() - started < WATCH_LIMIT_MS) {
          const current = await this.read(agentId, entryId);
          if (current == null || purchaseStateOf(current) !== "approving") return;
          const answer = await wallet.spendStatus(spendRequestId, WATCH_STEP_SECONDS).catch((error: unknown) => ({ ok: false as const, code: "LINK_FAILED", message: error instanceof Error ? error.message : String(error) }));
          if (!answer.ok) {
            if (answer.code === "POLLING_TIMEOUT") continue;
            this.log(`[purchase] watching ${spendRequestId} failed: ${answer.code} ${(answer.message.split("\n")[0] ?? "").slice(0, 200)}`);
            if (answer.code === "NOT_AUTHENTICATED" || answer.code === "NOT_FOUND") { await this.apply(agentId, entryId, answer, wallet); return; }
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
            continue;
          }
          if (purchaseStateForLinkStatus(answer.status) === "approving" && (answer.action == null || answer.action.resumes)) {
            // 3-D Secure and the like: the card shows Link's page, and the request goes on by itself once it's done.
            const action = answer.action;
            const note = action == null ? undefined : this.actionNote(action.message);
            if (action != null) await this.stamp(agentId, entryId, (entry) => entry.purchaseNote === note ? null : { purchaseNote: note, ...(action.url == null ? {} : { purchaseActionUrl: action.url }) });
            continue;
          }
          await this.apply(agentId, entryId, answer, wallet);
          return;
        }
        // Link's 30 minutes are over and nothing came back: say so rather than wait forever.
        const current = await this.read(agentId, entryId);
        if (current != null && purchaseStateOf(current) === "approving") {
          const last = await wallet.spendStatus(spendRequestId, 0).catch(() => undefined);
          const settled = last != null && last.ok && purchaseStateForLinkStatus(last.status) !== "approving";
          // Still waiting at the wallet (Shop's own window may be longer): withdrawn, so a late approval issues no card nobody uses.
          if (!settled) void wallet.cancelSpend(spendRequestId).catch(() => false);
          await this.apply(agentId, entryId, settled ? last : { ok: true, id: spendRequestId, status: "expired" }, wallet);
        }
      } finally {
        this.watching.delete(key);
      }
    })();
  }

  /** A change to a checkout card from elsewhere on the host (a flight being paid, `flight-bookings.ts`). */
  update(agentId: string, entryId: string, change: (entry: PurchaseEntry) => PurchasePatch | null): Promise<TranscriptEntry | null> {
    return this.stamp(agentId, entryId, change);
  }

  wakeAgent(agentId: string, source: string, prompt: string): void {
    this.wake(agentId, source, prompt);
  }

  /**
   * An approved flight nobody is paying any more: the computer restarted
   * while Simeon paid it. Before the order was asked for, nothing was booked
   * and the one-time card goes; once it was asked for, nobody can say.
   */
  private async flightInterrupted(agentId: string, entryId: string, current: PurchaseEntry, wallet: PurchaseWallet | undefined): Promise<TranscriptEntry | null> {
    const flight = purchaseFlightOf(current.message.purchase);
    if (flight == null) return current;
    const booking = current.purchaseStep === "booking";
    let took = false;
    const stamped = await this.stamp(agentId, entryId, (entry) => {
      if (purchaseStateOf(entry) !== "approved") return null;
      took = true;
      return booking
        ? { purchaseState: "failed", purchaseStep: "uncertain", purchaseNote: say(this.language(), "flight.restartedBooking") }
        : { purchaseState: "failed", purchaseStep: undefined, purchaseNote: say(this.language(), "flight.restartedPaying") };
    });
    if (!took) return stamped;
    this.log(`[flight] ${booking ? "uncertain" : "not booked"} after a restart ${agentId}/${entryId}`);
    if (!booking && wallet != null && current.purchaseSpendRequestId != null) void wallet.cancelSpend(current.purchaseSpendRequestId).catch(() => false);
    this.tm.flightBookings?.flightClosed?.(agentId, current.message.purchase);
    this.wake(agentId, booking ? "flight-uncertain" : "flight-failed", booking ? buildFlightUncertainWakePrompt(entryId, flight) : buildFlightFailedWakePrompt(entryId, flight, "the computer restarted before it was paid."));
    return stamped;
  }

  private wake(agentId: string, source: string, prompt: string): void {
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(agentId, source, prompt, say(this.language(), "purchase.followUpFailed")))
      .catch((error: unknown) => this.log(`[purchase] wake ${source} failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  /** The person's language (`userLanguage`): the card's lines are theirs. */
  private language(): string | undefined {
    return this.tm.userLanguage?.();
  }

  /** What Link asks of the person: its own sentence, or ours when it gave none. */
  private actionNote(message: string): string {
    return message === LINK_ACTION_DEFAULT ? say(this.language(), "purchase.linkNeedsAction") : message;
  }

  private liveSession(agentId: string): any {
    return this.tm.sessions?.activeSession?.id === agentId ? this.tm.sessions.activeSession : (this.tm.sessions?.liveSessions?.get(agentId) ?? null);
  }

  private read(agentId: string, entryId: string): Promise<PurchaseEntry | null> {
    return this.readAs(agentId, entryId, isPurchaseEntry);
  }

  private async readAs<E>(agentId: string, entryId: string, is: (entry: unknown) => entry is E): Promise<E | null> {
    const found = (await this.entriesOf(agentId)).find((entry) => (entry as { id?: unknown }).id === entryId);
    return is(found) ? found : null;
  }

  private async entriesOf(agentId: string): Promise<unknown[]> {
    if (this.tm.sessions?.isAgentGone?.(agentId) === true) return [];
    const live = this.liveSession(agentId);
    return live != null
      ? live.db.getTranscriptEntries()
      : await Promise.resolve(this.tm.sessionStore?.readAgentTranscriptEntries?.(agentId) ?? []);
  }

  /**
   * Writes a change to the card in its agent's transcript and sends it to the
   * apps; null from `change` leaves it as it is. A change that ends the
   * purchase also settles the products card it came from.
   */
  private async stamp(agentId: string, entryId: string, change: (entry: PurchaseEntry) => PurchasePatch | null): Promise<TranscriptEntry | null> {
    const seen: { ended?: PurchaseState } = {};
    const stamped = await this.stampAs(agentId, entryId, isPurchaseEntry, (entry) => {
      const patch = change(entry);
      const next = patch?.purchaseState;
      if (next != null && PURCHASE_FINAL_STATES.has(next) && !PURCHASE_FINAL_STATES.has(purchaseStateOf(entry))) seen.ended = next;
      return patch;
    });
    if (seen.ended != null && stamped != null) {
      await this.settleProductsBuy(agentId, entryId, seen.ended).catch((error: unknown) => this.log(`[purchase] settling the products card for ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
    }
    return stamped;
  }

  /**
   * The products card whose Buy led to a purchase that just ended (18 October
   * 2026, the founder: "make it blue … then bought … once that is done - in
   * green"): the nearest one above the checkout card with a product pressed.
   * Ordered at that product's store, or at the one other product's on the
   * card (`productBoughtBy`), that product shows Bought. Anything else clears
   * Buying, so the card never says Buying with nothing under way, and the
   * person can press Buy again.
   */
  private async settleProductsBuy(agentId: string, entryId: string, state: PurchaseState): Promise<void> {
    const entries = await this.entriesOf(agentId);
    const at = entries.findIndex((entry) => (entry as { id?: unknown }).id === entryId);
    const purchase = entries[at];
    if (!isPurchaseEntry(purchase) || purchaseFlightOf(purchase.message.purchase) != null) return;
    const products = entries.slice(0, at).reverse().find((entry): entry is ProductsEntry => isProductsEntry(entry) && entry.productsBuying != null);
    const pressed = products?.productsBuying;
    if (products == null || pressed == null) return;
    const bought = state === "ordered" ? productBoughtBy(products.message.products, pressed, purchase.message.purchase) : undefined;
    await this.stampAs(agentId, products.id, isProductsEntry, (entry) => entry.productsBuying !== pressed ? null : {
      productsBuying: undefined,
      ...(bought == null ? {} : { productsBought: [...new Set([...(entry.productsBought ?? []), bought])] }),
    });
    this.log(`[purchase] products card ${agentId}/${products.id}: ${bought == null ? `product ${pressed} no longer buying (${state} at ${purchase.message.purchase.domain})` : `product ${bought} bought`}`);
  }

  private async stampAs<E extends TranscriptEntry>(agentId: string, entryId: string, is: (entry: unknown) => entry is E, change: (entry: E) => Readonly<Record<string, unknown>> | null): Promise<TranscriptEntry | null> {
    let result: TranscriptEntry | null = null;
    const applyTo = (entry: TranscriptEntry): TranscriptEntry => {
      if (!is(entry)) return entry;
      const patch = change(entry);
      if (patch == null) return entry;
      const next = { ...entry } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      return next as TranscriptEntry;
    };
    const live = this.liveSession(agentId);
    if (live != null) {
      const current = (live.db.getTranscriptEntries() as TranscriptEntry[]).find((entry) => entry.id === entryId);
      if (!is(current)) return null;
      const next = applyTo(current);
      if (next === current) return current;
      live.db.updateTranscriptEntry(entryId, () => next);
      const inMemory = this.tm.sessions?.activeSession?.id === agentId && (this.tm.sessions?.inMemoryTranscriptAgentId == null || this.tm.sessions.inMemoryTranscriptAgentId === agentId)
        ? updateEntry(entryId, () => next)
        : null;
      result = inMemory ?? next;
    } else {
      const withDb = this.tm.sessionStore?.withAgentDb;
      if (typeof withDb !== "function") return null;
      result = await withDb.call(this.tm.sessionStore, agentId, (db: { getTranscriptEntries(): TranscriptEntry[]; updateTranscriptEntry(id: string, update: (entry: TranscriptEntry) => TranscriptEntry): void }) => {
        const current = db.getTranscriptEntries().find((entry) => entry.id === entryId);
        if (!is(current)) return null;
        const next = applyTo(current);
        if (next !== current) db.updateTranscriptEntry(entryId, () => next);
        return next;
      });
      if (result == null) return null;
    }
    this.tm.roster.emit({ type: "updated", entry: result }, agentId);
    void this.tm.roster.emitAgentUpdate?.(agentId);
    return result;
  }
}

/** The wallet's own error, short enough for one line on the card. */
function plainWalletError(message: string, wallet: string, language: string | undefined): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  if (line.length === 0) return say(language, "purchase.walletFailed", { wallet });
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

/** A spend request that failed, for the card: the wallet's words, or Simeon's own (not connected, no request) in the person's language. */
function spendFailureNote(spend: { readonly code: string; readonly message: string }, wallet: string, language: string | undefined): string {
  if (spend.code === "NOT_AUTHENTICATED") return say(language, "purchase.walletDisconnected", { wallet });
  if (spend.code === "NO_SPEND_REQUEST") return say(language, "purchase.walletNoRequest", { wallet });
  return plainWalletError(spend.message, wallet, language);
}
