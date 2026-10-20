/**
 * Booking a flight, the host's side (13 October 2026; the path is described
 * in `shared/node/flight-booking/flight-booking.ts`).
 *
 *   - `startFlightBooking` (the apps' "Book with Simeon" on a flight in the
 *     search card): the offer is asked for again and the traveller form is
 *     posted in that agent's chat. The agent's BookFlight posts the same form
 *     from its turn (`prepareFlightForm`).
 *   - `submitFlightPassengers` (the form's Continue): the details are checked
 *     and kept in a file only this computer reads, the form keeps the names,
 *     the person's Link is checked, and the flight's checkout card is posted.
 *   - `payApprovedFlight` (from `purchase-cards.ts`, once Link approved the
 *     checkout card): the price is checked again, Duffel's card form is
 *     filled with the one-time Link card on the cloud computer, the bank
 *     checks it, the order is placed, and the card shows the booking
 *     reference. The agent is told how it went. An order whose answer never
 *     came is asked after for a few hours (`settle`), and the card says
 *     Booked once Duffel has it.
 *
 * A flight that changed since the person last saw it (the price, the times,
 * the fare's terms) says so on the form and on the checkout card
 * (`flightChanges`, 19 October 2026, from Muse's rule).
 *
 * The composition hands this its services (`setFlightBookingServices`): the
 * server, the box's Link, the agent's browser and where files go.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import {
  DUFFEL_TEST_CARD,
  FLIGHT_PASSENGERS_MESSAGE_TYPE,
  buildFlightBookedWakePrompt,
  buildFlightFailedWakePrompt,
  buildFlightUncertainWakePrompt,
  checkTravellers,
  flightBlock,
  flightChanges,
  flightCheckoutCard,
  flightPassengersMessage,
  purchaseFlightOf,
  travellerNames,
  travellerPrefill,
  type FlightBlock,
  type FlightLook,
  type FlightOfferFacts,
  type FlightPassengersEntryFields,
  type FlightPassengersMessage,
  type FlightTraveller,
  type PurchaseFlight,
} from "../../../shared/node/flight-booking/flight-booking.js";
import { duffelPayPageUrl, payOnDuffelPage, sayOnPayPage } from "../../../shared/node/flight-booking/duffel-pay.js";
import type { PurchaseCardData } from "../../../shared/node/link-wallet/purchase-card.js";
import type { LinkTools } from "../../../shared/node/link-wallet/link-tools.js";
import { createSendMessageEntry } from "./send-message-shaping.js";
import { nextEntryId } from "./transcript-entry-ids.js";
import { getTranscript, updateEntry } from "./transcript-store.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

/** The box's Link steps a booking uses (`link-tools.ts`). */
export type FlightWallet = Pick<LinkTools, "checkoutFacts" | "withCard" | "personFacts" | "reportOutcome" | "cancelSpend">;

export interface FlightBookingServices {
  /** Simeon Labs' server (`desktop/api/<path>`): the `data` of its answer; throws with the server's own sentence. */
  api<T>(path: string, json: unknown): Promise<T>;
  wallet(): FlightWallet | undefined;
  /** The agent's own Chrome on the box (its DevTools port). */
  browserPort(agentId: string): number;
  /** The server's address, for the pay page. */
  backendUrl(): string;
  /** Where the travellers' details wait between the form and the order. */
  dataDir(): string;
  readonly pay?: typeof payOnDuffelPage;
  readonly say?: typeof sayOnPayPage;
}

type FormEntry = TranscriptEntry & FlightPassengersEntryFields & { readonly message: FlightPassengersMessage };
type FormPatch = { readonly [K in keyof FlightPassengersEntryFields]?: FlightPassengersEntryFields[K] | undefined } & { readonly message?: FlightPassengersMessage };

/** The form once answered: what Link filled in (email, phone) leaves the chat with it. */
const withoutPrefill = (message: FlightPassengersMessage): FlightPassengersMessage => ({ ...message, prefill: [] });

interface SavedTravellers {
  readonly offerId: string;
  readonly travellers: readonly FlightTraveller[];
  readonly savedAtMs: number;
}

/** Details nobody booked with are gone after a day. */
const KEEP_TRAVELLERS_MS = 24 * 60 * 60_000;

/**
 * After an order whose answer never came, Duffel is asked again this long
 * after it, then after each wait in turn: an order can take a couple of
 * hours to show in its list (its "Order creation response handling").
 */
export const SETTLE_WAITS_MS: readonly number[] = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000];

type BookedAnswer = { booked?: boolean; uncertain?: boolean; message?: string; bookingReference?: string; orderId?: string; test?: boolean };

export function isFlightFormEntry(entry: unknown): entry is FormEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; flight?: { offerId?: unknown } } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === FLIGHT_PASSENGERS_MESSAGE_TYPE && typeof record.message.flight?.offerId === "string";
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const safe = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
const sentence = (error: unknown, fallback: string): string => {
  const said = error instanceof Error ? error.message.trim() : "";
  return said.length > 0 ? said : fallback;
};

/** One flight on a search card's message (```simeon-flights), as the card drew it. */
export function offerOnSearchCard(entry: unknown, index: number): Record<string, unknown> | undefined {
  const message = (entry as { message?: { content?: unknown } } | null | undefined)?.message;
  const content = text(message?.content) || text((entry as { content?: unknown } | null | undefined)?.content);
  const block = /```simeon-flights\s*\n([\s\S]*?)\n```/.exec(content)?.[1];
  if (block == null) return undefined;
  try {
    const card = JSON.parse(block) as { offers?: unknown };
    const offer = (Array.isArray(card.offers) ? card.offers : [])[index];
    return offer != null && typeof offer === "object" ? offer as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** The offer id of one flight on a search card's message. */
export function offerIdOnSearchCard(entry: unknown, index: number): string {
  return text(offerOnSearchCard(entry, index)?.offerId);
}

export class FlightBookings {
  private services: FlightBookingServices | undefined;
  /** Forms being sent on (Continue pressed twice). */
  private readonly submitting = new Set<string>();
  /** Checkout cards being paid. */
  private readonly paying = new Set<string>();
  private readonly log: (line: string) => void;
  private readonly settleWaitsMs: readonly number[];

  constructor(private readonly tm: TranscriptManagerLike, options: { readonly log?: (line: string) => void; readonly settleWaitsMs?: readonly number[] } = {}) {
    this.log = options.log ?? ((line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`));
    this.settleWaitsMs = options.settleWaitsMs ?? SETTLE_WAITS_MS;
  }

  setFlightBookingServices(services: FlightBookingServices | undefined): void {
    this.services = services;
  }

  /**
   * The offer again and what the form starts with (Link's name, email and
   * phone); what changed since `seen` (the search card's flight) says so on
   * it. The form is in the person's language; a refusal is in `language`
   * (the person's from the apps' Book, English for the agent's BookFlight).
   */
  async prepareFlightForm(offerId: string, seen?: FlightLook, language?: string): Promise<{ readonly ok: true; readonly message: FlightPassengersMessage; readonly offer: FlightOfferFacts } | { readonly ok: false; readonly message: string }> {
    const services = this.services;
    if (services == null) return { ok: false, message: say(language, "flight.unavailable") };
    if (!/^off_[A-Za-z0-9_]{6,80}$/.test(offerId)) return { ok: false, message: say(language, "flight.olderSearch") };
    let offer: FlightOfferFacts;
    try {
      offer = await services.api<FlightOfferFacts>("flights/offer", { offer_id: offerId });
    } catch (error) {
      return { ok: false, message: sentence(error, say(language, "flight.checkFailed")) };
    }
    const person = await services.wallet()?.personFacts().catch(() => undefined);
    const shown = this.language();
    const changed = seen == null ? undefined : flightChanges(seen, { ...(offer.card ?? {}), total: offer.total }, shown);
    return { ok: true, message: flightPassengersMessage(offer, travellerPrefill(offer.passengers.length, person), changed, shown), offer };
  }

  /** "Book with Simeon" on a flight: the traveller form in that agent's chat (the one already open for that flight, if any). */
  async startFlightBooking(args: { readonly agentId: string; readonly entryId?: string; readonly offerIndex?: number; readonly offerId?: string }): Promise<{ readonly ok: true; readonly entryId: string } | { readonly ok: false; readonly message: string }> {
    const language = this.language();
    const agentId = text(args.agentId);
    if (agentId.length === 0) return { ok: false, message: say(language, "flight.noChat") };
    const entries = await this.entries(agentId);
    let offerId = text(args.offerId);
    let seen: Record<string, unknown> | undefined;
    if (offerId.length === 0) {
      const card = entries.find((entry) => entry.id === args.entryId);
      if (card == null) return { ok: false, message: say(language, "flight.cardGone") };
      seen = offerOnSearchCard(card, Math.max(0, Math.floor(Number(args.offerIndex ?? 0))));
      offerId = text(seen?.offerId);
    }
    const open = entries.find((entry) => isFlightFormEntry(entry) && entry.message.flight.offerId === offerId && (entry.passengersState ?? "open") === "open");
    if (open != null) return { ok: true, entryId: open.id };
    const prepared = await this.prepareFlightForm(offerId, seen, language);
    if (!prepared.ok) return prepared;
    const entry = await this.append(agentId, prepared.message as unknown as Record<string, unknown>);
    if (entry == null) return { ok: false, message: say(language, "flight.formNotAdded") };
    this.log(`[flight] form ${agentId}/${entry.id} for ${offerId} (${prepared.offer.total}${prepared.offer.test ? ", test" : ""})${prepared.message.flight.changed != null ? `; ${prepared.message.flight.changed}` : ""}`);
    return { ok: true, entryId: entry.id };
  }

  /** The form's Continue (or its Cancel): the travellers kept on this computer, and the flight's checkout card. */
  async submitFlightPassengers(args: { readonly agentId: string; readonly entryId: string; readonly passengers?: unknown; readonly cancel?: boolean }): Promise<{ readonly ok: true; readonly entryId: string } | { readonly ok: false; readonly message: string; readonly index?: number; readonly field?: string }> {
    const services = this.services;
    const language = this.language();
    const form = await this.readForm(args.agentId, args.entryId);
    if (form == null) return { ok: false, message: say(language, "flight.formGone") };
    const state = form.passengersState ?? "open";
    if (state === "saved" && form.passengersCheckoutId != null) return { ok: true, entryId: form.passengersCheckoutId };
    if (state !== "open") return { ok: false, message: say(language, "flight.formClosed") };
    if (args.cancel === true) {
      await this.stampForm(args.agentId, args.entryId, (entry) => (entry.passengersState ?? "open") === "open" ? { passengersState: "canceled", passengersNote: undefined, message: withoutPrefill(entry.message) } : null);
      return { ok: true, entryId: args.entryId };
    }
    if (services == null) return { ok: false, message: say(language, "flight.unavailable") };
    const flight: FlightBlock = form.message.flight;
    const checked = checkTravellers(args.passengers, flight, new Date(), language);
    if (!checked.ok) return checked;
    const key = `${args.agentId}\u0000${args.entryId}`;
    if (this.submitting.has(key)) return { ok: false, message: say(language, "flight.alreadyOnIt") };
    this.submitting.add(key);
    try {
      let offer: FlightOfferFacts;
      try {
        offer = await services.api<FlightOfferFacts>("flights/offer", { offer_id: flight.offerId });
      } catch (error) {
        const said = sentence(error, say(language, "flight.checkFailed"));
        await this.stampForm(args.agentId, args.entryId, () => ({ passengersNote: said }));
        return { ok: false, message: said };
      }
      const wallet = services.wallet();
      if (wallet == null) return { ok: false, message: say(language, "flight.noLink") };
      const facts = await wallet.checkoutFacts({ amount: offer.amountMinor, currency: offer.currency, ...(language == null ? {} : { language }) });
      if (!facts.ok) {
        // Link's words for the person (not the agent's): connect Link, verify, a limit.
        const said = facts.person ?? facts.message.replace(/ Tell them;.*$/, "").replace(/ Send them this link in the chat/, " Open Link");
        await this.stampForm(args.agentId, args.entryId, () => ({ passengersNote: said }));
        return { ok: false, message: said };
      }
      this.saveTravellers(args.agentId, args.entryId, { offerId: offer.offerId, travellers: checked.travellers, savedAtMs: Date.now() });
      // What changed since the form showed it: a fresh decision, on the card before Allow.
      const changed = flightChanges(flight, flightBlock(offer), language);
      const card = flightCheckoutCard({ offer, formEntryId: args.entryId, travellers: checked.travellers, card: facts.card, ...(facts.paymentMethodId.length === 0 ? {} : { paymentMethodId: facts.paymentMethodId }), ...((facts.cards ?? []).length > 1 ? { cards: facts.cards } : {}), ...(changed == null ? {} : { changed }), ...(language == null ? {} : { language }) });
      const appended = await this.append(args.agentId, card as unknown as Record<string, unknown>);
      if (appended == null) {
        this.forgetTravellers(args.agentId, args.entryId);
        return { ok: false, message: say(language, "flight.cardNotAdded") };
      }
      await this.stampForm(args.agentId, args.entryId, (entry) => ({ passengersState: "saved", passengersNames: travellerNames(checked.travellers), passengersCheckoutId: appended.id, passengersNote: undefined, message: withoutPrefill(entry.message) }));
      this.log(`[flight] travellers saved ${args.agentId}/${args.entryId}: ${checked.travellers.length}, checkout ${appended.id} (${offer.total}${offer.test ? ", test" : ""})${changed == null ? "" : `; ${changed}`}`);
      return { ok: true, entryId: appended.id };
    } finally {
      this.submitting.delete(key);
    }
  }

  /** Link approved the flight's checkout card: pay the airline through Duffel and book. */
  async payApprovedFlight(agentId: string, entryId: string, card: PurchaseCardData, spendRequestId: string): Promise<void> {
    const flight = purchaseFlightOf(card);
    if (flight == null) return;
    const key = `${agentId}\u0000${entryId}`;
    if (this.paying.has(key)) return;
    this.paying.add(key);
    const purchases = this.tm.purchaseCards;
    const services = this.services;
    const wallet = services?.wallet();
    const language = this.language();
    const step = (purchaseStep: "paying" | "verify" | "booking", purchaseNote: string) => purchases.update(agentId, entryId, (entry: { purchaseState?: string }) => entry.purchaseState === "approved" ? { purchaseStep, purchaseNote } : null);
    const fail = async (reason: string): Promise<void> => {
      this.log(`[flight] not booked ${agentId}/${entryId}: ${reason}`);
      await purchases.update(agentId, entryId, () => ({ purchaseState: "failed", purchaseStep: undefined, purchaseNote: reason.length > 200 ? `${reason.slice(0, 197)}…` : reason }));
      if (wallet != null) {
        void wallet.reportOutcome({ domain: card.domain, spendRequestId, outcome: "blocked", context: reason }).catch(() => undefined);
        void wallet.cancelSpend(spendRequestId).catch(() => false);
      }
      this.forgetTravellers(agentId, flight.formEntryId);
      purchases.wakeAgent(agentId, "flight-failed", buildFlightFailedWakePrompt(entryId, flight, reason));
    };
    try {
      if (services == null || wallet == null) return await fail(say(language, "flight.unavailable"));
      const saved = this.loadTravellers(agentId, flight.formEntryId);
      if (saved == null || saved.offerId !== flight.offerId) return await fail(say(language, "flight.travellersGone"));
      await step("paying", say(language, "flight.paying"));

      // The price again: never more than the person approved.
      let offer: FlightOfferFacts;
      try {
        offer = await services.api<FlightOfferFacts>("flights/offer", { offer_id: flight.offerId });
      } catch (error) {
        return await fail(sentence(error, say(language, "flight.checkFailedShort")));
      }
      if (offer.amountMinor !== card.amount || offer.currency.toLowerCase() !== card.currency.toLowerCase()) return await fail(say(language, "flight.priceChanged", { total: offer.total }));

      let clientKey: string;
      try {
        clientKey = (await services.api<{ clientKey?: string }>("flights/client-key", {})).clientKey ?? "";
      } catch (error) {
        return await fail(sentence(error, say(language, "flight.payFormFailed")));
      }
      if (clientKey.length === 0) return await fail(say(language, "flight.payFormFailed"));

      const port = services.browserPort(agentId);
      const pay = services.pay ?? payOnDuffelPage;
      const holder = saved.travellers[0] == null ? "" : `${saved.travellers[0].given_name} ${saved.travellers[0].family_name}`;
      const paid = await wallet.withCard(spendRequestId, async (linkCard) => {
        // Duffel's test mode knows only its own test cards; Link's test card is not one of them.
        const typed = offer.test ? { ...linkCard, number: DUFFEL_TEST_CARD, cvc: /^\d{3}$/.test(linkCard.cvc) ? linkCard.cvc : "123" } : linkCard;
        if (offer.test) this.log(`[flight] Duffel test mode: Duffel's test card typed in place of Link's for ${agentId}/${entryId}`);
        return await pay({
          port,
          pageUrl: duffelPayPageUrl(services.backendUrl(), clientKey, [flight.route, flight.date, card.total].filter((part) => part != null && part.length > 0).join(" · ")),
          offerId: offer.offerId,
          card: typed,
          holder,
          onChallenge: () => { void step("verify", say(language, "flight.bankCheck")); },
          ...(language == null ? {} : { language }),
        });
      });
      if (!paid.ok) return await fail(paid.message);
      const result = paid.value;
      if (!result.ok) {
        this.log(`[flight] pay page stopped at ${result.stage}: filled ${(result.filled ?? []).join(", ") || "nothing"}${(result.missing ?? []).length > 0 ? `; not found: ${(result.missing ?? []).join(", ")}` : ""}${result.fieldsSeen != null && result.fieldsSeen.length > 0 ? `; the form's fields: ${result.fieldsSeen}` : ""}`);
        return await fail(say(language, "flight.payFailed", { why: result.message }));
      }
      this.log(`[flight] card confirmed ${agentId}/${entryId}${result.challenged ? " after the bank's check" : ""}; booking`);
      await step("booking", say(language, "flight.booking"));

      let order: BookedAnswer;
      try {
        order = await services.api("flights/order", { offer_id: offer.offerId, passengers: saved.travellers, amount: offer.amount, currency: offer.currency, three_d_secure_session_id: result.threeDSecureSessionId });
      } catch (error) {
        // Only the server's clear no (a 4xx with its sentence) means nothing was booked; a lost answer may have booked it.
        const status = (error as { status?: unknown } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return await fail(sentence(error, say(language, "flight.notAccepted")));
        this.log(`[flight] the order's answer was lost ${agentId}/${entryId}: ${sentence(error, "no answer")}`);
        order = { booked: false, uncertain: true };
      }
      const sayOnPage = services.say ?? sayOnPayPage;
      if (order.booked === true) {
        const reference = text(order.bookingReference);
        await this.booked(agentId, entryId, flight, card, spendRequestId, order, offer.test);
        void sayOnPage(port, reference.length > 0 ? say(language, "flight.bookedPageRef", { reference }) : say(language, "flight.bookedPage")).catch(() => undefined);
        return;
      }
      // The airline never answered: it may have the booking. Never ask again; ask Duffel after it for a while.
      const said = text(order.message) || say(language, "flight.noAnswer");
      await purchases.update(agentId, entryId, () => ({ purchaseState: "failed", purchaseStep: "uncertain", purchaseNote: said }));
      this.forgetTravellers(agentId, flight.formEntryId);
      this.log(`[flight] uncertain ${agentId}/${entryId}`);
      purchases.wakeAgent(agentId, "flight-uncertain", buildFlightUncertainWakePrompt(entryId, flight));
      this.settle(agentId, entryId, flight, card, spendRequestId, offer.test);
    } catch (error) {
      await fail(sentence(error, say(language, "flight.payError")));
    } finally {
      this.paying.delete(key);
    }
  }

  /** The card says Booked (the reference, or that it comes by email), Link hears it went through, and the agent is told. */
  private async booked(agentId: string, entryId: string, flight: PurchaseFlight, card: PurchaseCardData, spendRequestId: string, order: BookedAnswer, test: boolean): Promise<void> {
    const reference = text(order.bookingReference);
    const note = reference.length > 0 ? say(this.language(), "flight.bookedWith", { airline: flight.airline }) : say(this.language(), "flight.bookedWithEmail", { airline: flight.airline });
    await this.tm.purchaseCards.update(agentId, entryId, () => ({ purchaseState: "ordered", purchaseStep: undefined, purchaseOrder: reference.slice(0, 80), purchaseNote: note }));
    void this.services?.wallet()?.reportOutcome({ domain: card.domain, spendRequestId, outcome: "success" }).catch(() => undefined);
    this.forgetTravellers(agentId, flight.formEntryId);
    this.log(`[flight] booked ${agentId}/${entryId}: ${reference || "(reference to come)"} ${text(order.orderId)}${order.test === true ? " (test)" : ""}`);
    this.tm.purchaseCards.wakeAgent(agentId, "flight-booked", buildFlightBookedWakePrompt(entryId, flight, reference, order.test === true || test));
  }

  /**
   * An order whose answer never came: Duffel asked after it at each of
   * `SETTLE_WAITS_MS` (`POST desktop/api/flights/order-status`), and the card
   * says Booked once it has it. Nothing here says "not booked": a missing
   * order may still show later, so the card keeps "Not confirmed" and its
   * note says to look for the airline's email. A restart ends the asking.
   */
  private settle(agentId: string, entryId: string, flight: PurchaseFlight, card: PurchaseCardData, spendRequestId: string, test: boolean, attempt = 0): void {
    const wait = this.settleWaitsMs[attempt];
    if (wait == null) {
      this.log(`[flight] still not confirmed ${agentId}/${entryId} after ${attempt} checks`);
      void this.tm.purchaseCards.update(agentId, entryId, (entry: { purchaseStep?: string }) => entry.purchaseStep === "uncertain" ? { purchaseNote: say(this.language(), "flight.stillUnconfirmed") } : null);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const services = this.services;
        if (services == null) return;
        let answer: BookedAnswer | undefined;
        try {
          answer = await services.api<BookedAnswer>("flights/order-status", { offer_id: flight.offerId });
        } catch (error) {
          // The server knows of no such order (or the asking is over): stop; anything else, ask again later.
          if ((error as { status?: unknown } | null)?.status === 404) return;
        }
        if (answer?.booked === true) {
          this.log(`[flight] the lost order was found ${agentId}/${entryId}`);
          await this.booked(agentId, entryId, flight, card, spendRequestId, answer, test);
          return;
        }
        this.settle(agentId, entryId, flight, card, spendRequestId, test, attempt + 1);
      })().catch(() => undefined);
    }, wait);
    (timer as { unref?: () => void }).unref?.();
  }

  /** The person's language (`userLanguage`): the form's and the card's lines are theirs. */
  private language(): string | undefined {
    return this.tm.userLanguage?.();
  }

  /** Whether this card is being paid now (a restart stops it). */
  isPaying(agentId: string, entryId: string): boolean {
    return this.paying.has(`${agentId}\u0000${entryId}`);
  }

  /** The flight's checkout card closed without booking (denied, expired, canceled): its travellers' details go. */
  flightClosed(agentId: string, card: PurchaseCardData): void {
    const flight = purchaseFlightOf(card);
    if (flight != null) this.forgetTravellers(agentId, flight.formEntryId);
  }

  // --- the travellers' file ---------------------------------------------------

  private travellersDir(): string | undefined {
    const root = this.services?.dataDir();
    return root == null || root.length === 0 ? undefined : join(root, "flight-travellers");
  }

  private travellersFile(agentId: string, formEntryId: string): string | undefined {
    const dir = this.travellersDir();
    return dir == null ? undefined : join(dir, `${safe(agentId)}--${safe(formEntryId)}.json`);
  }

  private saveTravellers(agentId: string, formEntryId: string, saved: SavedTravellers): void {
    const dir = this.travellersDir();
    const file = this.travellersFile(agentId, formEntryId);
    if (dir == null || file == null) throw new Error("No place on this computer for the travellers' details.");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Old details nobody booked with go first.
    try {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (Date.now() - statSync(path).mtimeMs > KEEP_TRAVELLERS_MS) rmSync(path, { force: true });
      }
    } catch { /* nothing to tidy */ }
    writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
  }

  private loadTravellers(agentId: string, formEntryId: string): SavedTravellers | undefined {
    const file = this.travellersFile(agentId, formEntryId);
    if (file == null) return undefined;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as SavedTravellers;
      if (Date.now() - saved.savedAtMs > KEEP_TRAVELLERS_MS) return undefined;
      return Array.isArray(saved.travellers) && saved.travellers.length > 0 ? saved : undefined;
    } catch {
      return undefined;
    }
  }

  private forgetTravellers(agentId: string, formEntryId: string): void {
    const file = this.travellersFile(agentId, formEntryId);
    if (file != null) rmSync(file, { force: true });
  }

  // --- the agent's transcript ---------------------------------------------------

  private liveSession(agentId: string): any {
    return this.tm.sessions?.activeSession?.id === agentId ? this.tm.sessions.activeSession : (this.tm.sessions?.liveSessions?.get(agentId) ?? null);
  }

  private async entries(agentId: string): Promise<TranscriptEntry[]> {
    if (this.tm.sessions?.isAgentGone?.(agentId) === true) return [];
    const live = this.liveSession(agentId);
    if (live != null) return live.db.getTranscriptEntries() as TranscriptEntry[];
    return await Promise.resolve(this.tm.sessionStore?.readAgentTranscriptEntries?.(agentId) ?? []) as TranscriptEntry[];
  }

  private async readForm(agentId: string, entryId: string): Promise<FormEntry | null> {
    const found = (await this.entries(agentId)).find((entry) => entry.id === entryId);
    return isFlightFormEntry(found) ? found : null;
  }

  /** A card from the host, not a turn, in any agent's chat: written to its transcript and sent to the apps with its id. */
  private async append(agentId: string, message: Record<string, unknown>): Promise<TranscriptEntry | null> {
    if (this.tm.sessions?.isAgentGone?.(agentId) === true) return null;
    const now = Date.now();
    const sessions = this.tm.sessions;
    if (sessions?.activeSession?.id === agentId && (sessions.inMemoryTranscriptAgentId == null || sessions.inMemoryTranscriptAgentId === agentId)) {
      const entry = createSendMessageEntry(nextEntryId(getTranscript(), "send-message"), message as never, now);
      this.tm.appendEntry(entry);
      void this.tm.roster.emitAgentUpdate?.(agentId);
      return entry;
    }
    const live = this.liveSession(agentId);
    let entry: TranscriptEntry | null = null;
    if (live != null) {
      entry = createSendMessageEntry(nextEntryId(live.db.getTranscriptEntries(), "send-message"), message as never, now);
      live.db.appendTranscriptEntry(entry);
    } else {
      const withDb = this.tm.sessionStore?.withAgentDb;
      if (typeof withDb !== "function") return null;
      entry = await withDb.call(this.tm.sessionStore, agentId, (db: { getTranscriptEntries(): TranscriptEntry[]; appendTranscriptEntry(entry: TranscriptEntry): boolean }) => {
        const made = createSendMessageEntry(nextEntryId(db.getTranscriptEntries(), "send-message"), message as never, now);
        return db.appendTranscriptEntry(made) ? made : null;
      });
      if (entry == null) return null;
    }
    this.tm.roster.emit({ type: "appended", entry }, agentId);
    void this.tm.roster.emitAgentUpdate?.(agentId);
    return entry;
  }

  /** Writes a change to the form in its agent's transcript and sends it to the apps; null from `change` leaves it. */
  private async stampForm(agentId: string, entryId: string, change: (entry: FormEntry) => FormPatch | null): Promise<TranscriptEntry | null> {
    const applyTo = (entry: TranscriptEntry): TranscriptEntry => {
      if (!isFlightFormEntry(entry)) return entry;
      const patch = change(entry);
      if (patch == null) return entry;
      const next = { ...entry } as Record<string, unknown>;
      for (const [field, value] of Object.entries(patch)) {
        if (value === undefined) delete next[field];
        else next[field] = value;
      }
      return next as TranscriptEntry;
    };
    let result: TranscriptEntry | null;
    const live = this.liveSession(agentId);
    if (live != null) {
      const current = (live.db.getTranscriptEntries() as TranscriptEntry[]).find((entry) => entry.id === entryId);
      if (current == null) return null;
      const next = applyTo(current);
      if (next === current) return current;
      live.db.updateTranscriptEntry(entryId, () => next);
      const sessions = this.tm.sessions;
      const inMemory = sessions?.activeSession?.id === agentId && (sessions.inMemoryTranscriptAgentId == null || sessions.inMemoryTranscriptAgentId === agentId) ? updateEntry(entryId, () => next) : null;
      result = inMemory ?? next;
    } else {
      const withDb = this.tm.sessionStore?.withAgentDb;
      if (typeof withDb !== "function") return null;
      result = await withDb.call(this.tm.sessionStore, agentId, (db: { getTranscriptEntries(): TranscriptEntry[]; updateTranscriptEntry(id: string, update: (entry: TranscriptEntry) => TranscriptEntry): void }) => {
        const current = db.getTranscriptEntries().find((entry) => entry.id === entryId);
        if (current == null) return null;
        const next = applyTo(current);
        if (next !== current) db.updateTranscriptEntry(entryId, () => next);
        return next;
      });
      if (result == null) return null;
    }
    this.tm.roster.emit({ type: "updated", entry: result }, agentId);
    return result;
  }
}
