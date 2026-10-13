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
 *
 * The card's entry may belong to any agent, open or not, so each change is
 * written to that agent's own transcript and sent to the apps with its id.
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { updateEntry } from "./transcript-store.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";
import {
  PURCHASE_FINAL_STATES,
  PURCHASE_MESSAGE_TYPE,
  buildPurchaseActionWakePrompt,
  buildPurchaseApprovedWakePrompt,
  buildPurchaseClosedWakePrompt,
  buildPurchaseDeniedWakePrompt,
  purchaseIdempotencyKey,
  purchaseStateForLinkStatus,
  type PurchaseCardData,
  type PurchaseEntryFields,
  type PurchaseState,
} from "../../../shared/node/link-wallet/purchase-card.js";
import type { LinkTools, SpendAnswer } from "../../../shared/node/link-wallet/link-tools.js";

type PurchaseEntry = TranscriptEntry & PurchaseEntryFields & { readonly message: { readonly type: typeof PURCHASE_MESSAGE_TYPE; readonly purchase: PurchaseCardData } };

/** A change to the card's fields; a field set to undefined is removed. */
type PurchasePatch = { readonly [K in keyof PurchaseEntryFields]?: PurchaseEntryFields[K] | undefined };

/** The Link wallet's steps this side uses (`link-tools.ts`). */
export type PurchaseWallet = Pick<LinkTools, "requestSpend" | "spendStatus" | "cancelSpend" | "reportOutcome">;

/** Link gives the person 30 minutes to approve; the watch stops a little after. */
const WATCH_LIMIT_MS = 35 * 60_000;
/** One look waits this long for Link to move on. */
const WATCH_STEP_SECONDS = 120;

export function isPurchaseEntry(entry: unknown): entry is PurchaseEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; purchase?: unknown } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === PURCHASE_MESSAGE_TYPE && record.message.purchase != null && typeof record.message.purchase === "object";
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

  /** The person's Allow or Deny on a card, or an app asking that a card with Link is watched (`resume`). */
  async answerPurchase(args: { readonly agentId: string; readonly entryId: string; readonly allow?: boolean; readonly resume?: boolean }, wallet: PurchaseWallet | undefined): Promise<TranscriptEntry | null> {
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return null;
    const state = purchaseStateOf(current);
    if (args.resume === true) {
      if ((state === "approving" || state === "sending") && current.purchaseSpendRequestId != null && wallet != null) this.watch(args.agentId, args.entryId, current.purchaseSpendRequestId, wallet);
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
      this.wake(args.agentId, "purchase-denied", buildPurchaseDeniedWakePrompt(args.entryId, card));
      return denied;
    }
    if (wallet == null) {
      const failed = await this.stamp(args.agentId, args.entryId, () => ({ purchaseState: "failed", purchaseNote: "Link isn't on this computer." }));
      this.wake(args.agentId, "purchase-failed", buildPurchaseClosedWakePrompt(args.entryId, card, "failed", "Link isn't available on this computer"));
      return failed;
    }
    // Sending first, so a second Allow (another device, a double tap) finds the card taken; only the Allow that took it asks Link.
    let took = false;
    const sending = await this.stamp(args.agentId, args.entryId, (entry) => {
      if (purchaseStateOf(entry) !== "review") return null;
      took = true;
      return { purchaseState: "sending" };
    });
    if (!took) return sending;
    const spend = await wallet.requestSpend({
      idempotencyKey: purchaseIdempotencyKey(args.agentId, args.entryId, current.timestampMs),
      credentialType: card.link.credentialType,
      amount: card.amount,
      currency: card.currency,
      context: card.link.context,
      merchantName: card.merchant,
      merchantUrl: card.url,
      ...(card.link.merchantAccountId == null ? {} : { merchantAccountId: card.link.merchantAccountId }),
      ...(card.link.paymentMethodId == null ? {} : { paymentMethodId: card.link.paymentMethodId }),
      lineItems: card.items,
      totals: card.totals,
      test: card.test,
    }).catch((error: unknown): SpendAnswer => ({ ok: false, code: "LINK_FAILED", message: error instanceof Error ? error.message : String(error) }));
    this.log(`[purchase] allowed ${args.agentId}/${args.entryId}: ${spend.ok ? `${spend.status} ${spend.id}` : `failed ${spend.code}`}`);
    return await this.apply(args.agentId, args.entryId, spend, wallet);
  }

  /** The agent's word after paying: ordered (with the order's number), failed, or canceled. */
  async markPurchaseDone(args: { readonly agentId: string; readonly entryId: string; readonly outcome: "ordered" | "failed" | "canceled"; readonly order?: string; readonly detail?: string }, wallet: PurchaseWallet | undefined): Promise<{ readonly ok: true; readonly entry: TranscriptEntry } | { readonly ok: false; readonly message: string }> {
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return { ok: false, message: `No checkout card with entry id "${args.entryId}" in this chat.` };
    const state = purchaseStateOf(current);
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
      void wallet.reportOutcome({ domain: current.message.purchase.domain, spendRequestId: id, outcome: args.outcome === "ordered" ? "success" : args.outcome === "failed" ? "blocked" : "abandoned", ...(detail.length > 0 ? { context: detail } : {}) }).catch(() => undefined);
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
        return { purchaseState: "failed", purchaseNote: plainLinkError(spend.message) };
      });
      if (failed) this.wake(agentId, "purchase-failed", buildPurchaseClosedWakePrompt(entryId, card, "failed", spend.message));
      return stamped;
    }
    const state = purchaseStateForLinkStatus(spend.status) ?? "approving";
    if (state === "approving") {
      const stamped = await this.stamp(agentId, entryId, () => ({
        purchaseState: "approving",
        purchaseSpendRequestId: spend.id,
        ...(spend.action != null ? { purchaseNote: spend.action.message } : {}),
        ...((spend.action?.url ?? spend.approvalUrl) == null ? {} : { purchaseActionUrl: spend.action?.url ?? spend.approvalUrl }),
      }));
      if (spend.action != null && !spend.action.resumes) {
        // Link wants something done first that does not come back by itself: this request is over.
        await this.stamp(agentId, entryId, () => ({ purchaseState: "failed", purchaseNote: spend.action?.message ?? "Link needs something from you first." }));
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
    if (state === "approved") this.wake(agentId, "purchase-approved", buildPurchaseApprovedWakePrompt(entryId, card, spend.id));
    else this.wake(agentId, `purchase-${state}`, buildPurchaseClosedWakePrompt(entryId, card, state));
    return stamped;
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
            this.log(`[purchase] watching ${spendRequestId} failed: ${answer.code}`);
            if (answer.code === "NOT_AUTHENTICATED" || answer.code === "NOT_FOUND") { await this.apply(agentId, entryId, answer, wallet); return; }
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
            continue;
          }
          if (purchaseStateForLinkStatus(answer.status) === "approving" && (answer.action == null || answer.action.resumes)) {
            // 3-D Secure and the like: the card shows Link's page, and the request goes on by itself once it's done.
            const action = answer.action;
            if (action != null) await this.stamp(agentId, entryId, (entry) => entry.purchaseNote === action.message ? null : { purchaseNote: action.message, ...(action.url == null ? {} : { purchaseActionUrl: action.url }) });
            continue;
          }
          await this.apply(agentId, entryId, answer, wallet);
          return;
        }
        // Link's 30 minutes are over and nothing came back: say so rather than wait forever.
        const current = await this.read(agentId, entryId);
        if (current != null && purchaseStateOf(current) === "approving") {
          const last = await wallet.spendStatus(spendRequestId, 0).catch(() => undefined);
          await this.apply(agentId, entryId, last != null && last.ok && purchaseStateForLinkStatus(last.status) !== "approving" ? last : { ok: true, id: spendRequestId, status: "expired" }, wallet);
        }
      } finally {
        this.watching.delete(key);
      }
    })();
  }

  private wake(agentId: string, source: string, prompt: string): void {
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(agentId, source, prompt, "The purchase follow-up failed"))
      .catch((error: unknown) => this.log(`[purchase] wake ${source} failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  private liveSession(agentId: string): any {
    return this.tm.sessions?.activeSession?.id === agentId ? this.tm.sessions.activeSession : (this.tm.sessions?.liveSessions?.get(agentId) ?? null);
  }

  private async read(agentId: string, entryId: string): Promise<PurchaseEntry | null> {
    if (this.tm.sessions?.isAgentGone?.(agentId) === true) return null;
    const live = this.liveSession(agentId);
    const entries: unknown[] = live != null
      ? live.db.getTranscriptEntries()
      : await Promise.resolve(this.tm.sessionStore?.readAgentTranscriptEntries?.(agentId) ?? []);
    const found = entries.find((entry) => (entry as { id?: unknown }).id === entryId);
    return isPurchaseEntry(found) ? found : null;
  }

  /** Writes a change to the card in its agent's transcript and sends it to the apps; null from `change` leaves it as it is. */
  private async stamp(agentId: string, entryId: string, change: (entry: PurchaseEntry) => PurchasePatch | null): Promise<TranscriptEntry | null> {
    let result: TranscriptEntry | null = null;
    const applyTo = (entry: TranscriptEntry): TranscriptEntry => {
      if (!isPurchaseEntry(entry)) return entry;
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
      if (!isPurchaseEntry(current)) return null;
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
        if (!isPurchaseEntry(current)) return null;
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

/** Link's own error, short enough for one line on the card. */
function plainLinkError(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  if (line.length === 0) return "Link couldn't set this up.";
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
