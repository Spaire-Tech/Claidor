// Booking a flight (13 October 2026, the founder: "we can book thru duffel.
// all we need is a form. when they enter their info then we take care of
// checkouts thru link etc."). The whole path, from the search card to the
// airline's booking reference:
//
//   1. "Book with Simeon" on a flight in the search card (the apps'
//      `startFlightBooking`), or the agent's BookFlight when the person asks
//      in words. Simeon asks Duffel for that offer again (prices hold for
//      minutes, `server/simeon/desktop/flight_booking.py`) and posts the
//      traveller form in the chat: one block per traveller, the names as on
//      their ID, title, gender, date of birth, email and phone, and the
//      passport only when the airline needs it. What Link knows (the
//      person's name, email, phone) is filled in already.
//   2. The person checks it and presses Continue (`submitFlightPassengers`).
//      The details go to a file only this computer reads (never the chat or
//      the agent); the form keeps only the names. Simeon checks their Link
//      (connected, limits, the card that pays) and posts the flight's
//      checkout card: the purchase card (`link-wallet/purchase-card.ts`) with
//      a flight block, so Allow, Deny and Link's approval work as for any
//      purchase.
//   3. Approved in Link: Simeon pays, not the agent. It opens Duffel's card
//      form on the cloud computer (`duffel-pay.ts`), types the one-time Link
//      card in (it never reaches Simeon's servers or the agent), confirms it
//      with the bank (3-D Secure; when the bank wants the person, the card
//      says so and the check is on the computer), and places the order. The
//      card shows the airline's booking reference, and the agent is told.
//
// Duffel's test mode (a `duffel_test_` key, before Duffel switches card
// payments on) books its pretend airline with a test card: Link's own test
// card is not one Duffel's test mode knows, so Duffel's is typed instead, and
// the log says so.

import {
  PURCHASE_MESSAGE_TYPE,
  formatPurchaseMoney,
  purchaseLinkContext,
  type PurchaseCardData,
  type PurchaseCardMessage,
} from "../link-wallet/purchase-card.js";

export const FLIGHT_PASSENGERS_MESSAGE_TYPE = "flight-passengers";

/** Duffel's test Visa that passes without a bank check (Duffel's card payments guide). */
export const DUFFEL_TEST_CARD = "4111110116638870";

/** The offer as Duffel has it now (`POST /desktop/api/flights/offer`). */
export interface FlightOfferFacts {
  readonly offerId: string;
  /** Duffel's own amount, "361.20". */
  readonly amount: string;
  readonly currency: string;
  /** The same in the smallest unit, as Link counts it. */
  readonly amountMinor: number;
  /** "$361.20" */
  readonly total: string;
  readonly expiresAt?: string;
  readonly priceGuaranteedUntil?: string;
  readonly documentsRequired: boolean;
  readonly passengers: readonly { readonly id: string; readonly type: string }[];
  readonly airline: string;
  readonly airlineCode?: string;
  readonly conditionsUrl?: string;
  /** "Seattle to Los Angeles" */
  readonly route: string;
  readonly roundTrip?: boolean;
  /** The flight as the search card draws it (`offer_for_card`). */
  readonly card?: Record<string, unknown> | null;
  readonly test: boolean;
}

/** The flight on the form and the checkout card: what the person reads. */
export interface FlightBlock {
  readonly offerId: string;
  readonly route: string;
  readonly airline: string;
  readonly logo?: string;
  readonly date?: string;
  readonly from?: string;
  readonly to?: string;
  readonly depart?: string;
  readonly arrive?: string;
  readonly duration?: string;
  readonly stops?: string;
  readonly priceNote?: string;
  readonly returnTimes?: string;
  readonly total: string;
  readonly documentsRequired: boolean;
  readonly conditionsUrl?: string;
  readonly passengers: readonly { readonly id: string; readonly type: string }[];
  readonly test: boolean;
}

/** One traveller, as Duffel's order takes them. */
export interface FlightTraveller {
  readonly id: string;
  readonly title: "mr" | "ms" | "mrs" | "miss" | "dr";
  readonly gender: "m" | "f";
  readonly given_name: string;
  readonly family_name: string;
  /** YYYY-MM-DD */
  readonly born_on: string;
  readonly email: string;
  /** E.164, "+12065550100" */
  readonly phone_number: string;
  readonly passport?: { readonly number: string; readonly issuing_country_code: string; readonly expires_on: string };
}

/** What the form starts with: what Link knows of the person, for the first traveller. */
export interface TravellerPrefill {
  readonly given_name?: string;
  readonly family_name?: string;
  readonly email?: string;
  readonly phone_number?: string;
}

export interface FlightPassengersMessage {
  readonly type: typeof FLIGHT_PASSENGERS_MESSAGE_TYPE;
  /** The form in words, for an app from before it. */
  readonly content: string;
  readonly flight: FlightBlock;
  /** One per traveller, in the offer's order; empty fields where nothing is known. */
  readonly prefill: readonly TravellerPrefill[];
}

/**
 * The form's own fields beside the message: open (waiting for the person),
 * saved (details kept on the computer; `passengersNames` is all the chat
 * keeps), canceled.
 */
export interface FlightPassengersEntryFields {
  readonly passengersState?: "open" | "saved" | "canceled";
  readonly passengersNames?: readonly string[];
  /** Why Continue did not go through (Link not connected, a field). */
  readonly passengersNote?: string;
  /** The checkout card the form led to. */
  readonly passengersCheckoutId?: string;
}

/** The flight block on a checkout card: the flight, its travellers' names, and the form it came from. */
export interface PurchaseFlight extends FlightBlock {
  readonly formEntryId: string;
  readonly travellers: readonly string[];
}

/** Where Simeon is while paying an approved flight (on the checkout card's entry, beside `purchaseState` "approved"). */
export type FlightPayStep = "paying" | "verify" | "booking";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function flightBlock(offer: FlightOfferFacts): FlightBlock {
  const card = offer.card ?? {};
  const field = (key: string): string | undefined => {
    const value = text(card[key]);
    return value.length > 0 ? value : undefined;
  };
  const optional = (key: string, value: string | undefined) => (value == null || value.length === 0 ? {} : { [key]: value });
  return {
    offerId: offer.offerId,
    route: offer.route,
    airline: offer.airline,
    ...optional("logo", field("logo")),
    ...optional("date", field("date")),
    ...optional("from", field("from")),
    ...optional("to", field("to")),
    ...optional("depart", field("depart")),
    ...optional("arrive", field("arrive")),
    ...optional("duration", field("duration")),
    ...optional("stops", field("stops")),
    ...optional("priceNote", field("priceNote")),
    ...optional("returnTimes", field("returnTimes")),
    total: offer.total,
    documentsRequired: offer.documentsRequired,
    ...optional("conditionsUrl", offer.conditionsUrl),
    passengers: offer.passengers.map((one) => ({ id: one.id, type: one.type })),
    test: offer.test,
  };
}

/** "Seattle to Los Angeles · Tue, Nov 12 · $361.20" */
export function flightLine(flight: Pick<FlightBlock, "route" | "date" | "total">): string {
  return [flight.route, flight.date, flight.total].filter((part) => part != null && part.length > 0).join(" · ");
}

/** Link's name, email and phone for the first traveller; the others start empty. */
export function travellerPrefill(passengerCount: number, link: { readonly name?: string; readonly email?: string; readonly phone?: string } | undefined): TravellerPrefill[] {
  const name = text(link?.name).split(/\s+/).filter((part) => part.length > 0);
  const first: TravellerPrefill = {
    ...(name.length > 1 ? { given_name: name.slice(0, -1).join(" "), family_name: name[name.length - 1] as string } : name.length === 1 ? { given_name: name[0] as string } : {}),
    ...(text(link?.email).length > 0 ? { email: text(link?.email) } : {}),
    ...(text(link?.phone).length > 0 ? { phone_number: text(link?.phone) } : {}),
  };
  return Array.from({ length: Math.max(1, passengerCount) }, (_unused, index) => (index === 0 ? first : {}));
}

export function flightPassengersMessage(offer: FlightOfferFacts, prefill: readonly TravellerPrefill[]): FlightPassengersMessage {
  const flight = flightBlock(offer);
  return { type: FLIGHT_PASSENGERS_MESSAGE_TYPE, content: `Traveller details for ${flightLine(flight)}`, flight, prefill };
}

const TITLES = new Set(["mr", "ms", "mrs", "miss", "dr"]);
const NAME = /^[^\d!"#$%&()*+,./:;<=>?@[\\\]^_`{|}~]{1,40}$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;
const PHONE = /^\+[1-9]\d{6,14}$/;

export type TravellerCheck =
  | { readonly ok: true; readonly travellers: readonly FlightTraveller[] }
  | { readonly ok: false; readonly message: string; readonly index?: number; readonly field?: string };

function day(value: unknown): Date | undefined {
  const given = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(given)) return undefined;
  const parsed = new Date(`${given}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== given ? undefined : parsed;
}

/**
 * The form's travellers checked before anything is kept (the server checks
 * them again): one for each passenger on the offer, every field as Duffel
 * needs it, and the passport when the airline asks for one.
 */
export function checkTravellers(given: unknown, flight: Pick<FlightBlock, "passengers" | "documentsRequired">, today: Date = new Date()): TravellerCheck {
  if (!Array.isArray(given) || given.length !== flight.passengers.length) return { ok: false, message: `Fill in all ${flight.passengers.length === 1 ? "the traveller's details" : `${flight.passengers.length} travellers' details`}.` };
  const now = today.toISOString().slice(0, 10);
  const travellers: FlightTraveller[] = [];
  for (const [index, raw] of given.entries()) {
    const one = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const who = flight.passengers.length > 1 ? `Traveller ${index + 1}: ` : "";
    const refuse = (field: string, message: string): TravellerCheck => ({ ok: false, message: `${who}${message}`, index, field });
    const expected = flight.passengers[index]?.id ?? "";
    const id = text(one.id) || expected;
    if (id !== expected) return refuse("id", "this traveller isn't on the flight.");
    const given_name = text(one.given_name).replace(/\s+/g, " ");
    const family_name = text(one.family_name).replace(/\s+/g, " ");
    if (!NAME.test(given_name)) return refuse("given_name", "write the first name as on the ID.");
    if (!NAME.test(family_name)) return refuse("family_name", "write the last name as on the ID.");
    const title = text(one.title).toLowerCase().replace(/\.$/, "");
    if (!TITLES.has(title)) return refuse("title", "choose a title.");
    const gender = text(one.gender).toLowerCase();
    if (gender !== "m" && gender !== "f") return refuse("gender", "choose the gender on the ID.");
    const born = day(one.born_on);
    if (born == null || text(one.born_on) >= now || born.getUTCFullYear() < 1900) return refuse("born_on", "the date of birth isn't right.");
    const email = text(one.email);
    if (!EMAIL.test(email)) return refuse("email", "the email address isn't right.");
    const phone = text(one.phone_number).replace(/[\s().-]/g, "");
    if (!PHONE.test(phone)) return refuse("phone_number", "the phone number needs its country code, like +1 206 555 0100.");
    const passportGiven = one.passport != null && typeof one.passport === "object" ? one.passport as Record<string, unknown> : undefined;
    let passport: FlightTraveller["passport"];
    if (passportGiven != null && text(passportGiven.number).length > 0) {
      const number = text(passportGiven.number).replace(/\s+/g, "");
      const country = text(passportGiven.issuing_country_code).toUpperCase();
      const expires = day(passportGiven.expires_on);
      if (!/^[A-Za-z0-9]{5,20}$/.test(number)) return refuse("passport", "the passport number isn't right.");
      if (!/^[A-Z]{2}$/.test(country)) return refuse("passport", "choose the passport's country.");
      if (expires == null || text(passportGiven.expires_on) <= now) return refuse("passport", "that passport has expired.");
      passport = { number, issuing_country_code: country, expires_on: text(passportGiven.expires_on) };
    } else if (flight.documentsRequired) {
      return refuse("passport", "this airline needs the passport.");
    }
    travellers.push({ id, title: title as FlightTraveller["title"], gender, given_name, family_name, born_on: text(one.born_on), email, phone_number: phone, ...(passport == null ? {} : { passport }) });
  }
  return { ok: true, travellers };
}

export function travellerNames(travellers: readonly Pick<FlightTraveller, "given_name" | "family_name">[]): string[] {
  return travellers.map((one) => `${one.given_name} ${one.family_name}`.trim());
}

/** "duffel.com", or the airline's own site when Duffel gives its conditions of carriage. */
function flightDomain(conditionsUrl: string | undefined): string {
  try {
    if (conditionsUrl != null && conditionsUrl.startsWith("https://")) return new URL(conditionsUrl).hostname.replace(/^www\./, "");
  } catch { /* not an address */ }
  return "duffel.com";
}

/**
 * The flight's checkout card: the purchase card with the flight on it, so
 * Allow, Deny and Link's approval are the same as for any purchase; Simeon
 * pays it itself once Link approves (`flight-bookings.ts`).
 */
export function flightCheckoutCard(args: {
  readonly offer: FlightOfferFacts;
  readonly formEntryId: string;
  readonly travellers: readonly FlightTraveller[];
  readonly card: { readonly brand: string; readonly last4: string; readonly name?: string };
  readonly paymentMethodId?: string;
  /** The person's Link cards an agent may pay with: with several, the card's chooser (as on every checkout card). */
  readonly cards?: readonly { readonly id: string; readonly brand: string; readonly last4: string; readonly name?: string; readonly isDefault?: boolean }[];
}): PurchaseCardMessage {
  const flight = flightBlock(args.offer);
  const names = travellerNames(args.travellers);
  const currency = args.offer.currency.toLowerCase();
  const total = formatPurchaseMoney(args.offer.amountMinor, currency);
  const domain = flightDomain(args.offer.conditionsUrl);
  const description = [flight.priceNote, names.join(", ")].filter((part) => part != null && part.length > 0).join(" · ");
  const items = [{ name: `Flight ${flight.route}${flight.date == null ? "" : `, ${flight.date}`}`, quantity: 1, unitAmount: args.offer.amountMinor, ...(description.length > 0 ? { description } : {}) }];
  const times = [flight.depart, flight.arrive].filter((part) => part != null && part.length > 0).join(" to ");
  const said = `Flight ${flight.route} on ${flight.airline}${flight.date == null ? "" : `, ${flight.date}`}${times.length > 0 ? `, ${times}` : ""}, for ${names.join(" and ")}, paid to the airline through Duffel, as the person asked in Simeon and allowed on its checkout card.`;
  const purchase: PurchaseCardData & { readonly flight: PurchaseFlight } = {
    merchant: flight.airline || "Airline",
    domain,
    url: args.offer.conditionsUrl != null && args.offer.conditionsUrl.startsWith("https://") ? args.offer.conditionsUrl : "https://duffel.com",
    amount: args.offer.amountMinor,
    currency,
    total,
    items,
    totals: [{ type: "total", label: "Total", amount: args.offer.amountMinor }],
    ...(args.card.brand.length > 0 || args.card.last4.length > 0 ? { card: { brand: args.card.brand, last4: args.card.last4, ...((args.card.name ?? "").length > 0 ? { name: args.card.name } : {}) } } : {}),
    ...((args.cards ?? []).length > 1 ? { cards: (args.cards ?? []).map((one) => ({ id: one.id, brand: one.brand, last4: one.last4, ...((one.name ?? "").length > 0 ? { name: one.name } : {}), ...(one.isDefault === true ? { isDefault: true } : {}) })) } : {}),
    test: args.offer.test,
    link: {
      credentialType: "card",
      ...(args.paymentMethodId == null || args.paymentMethodId.length === 0 ? {} : { paymentMethodId: args.paymentMethodId }),
      context: purchaseLinkContext(said, { merchant: flight.airline, domain, total, items }),
      test: args.offer.test,
    },
    flight: { ...flight, total, formEntryId: args.formEntryId, travellers: names },
  };
  return { type: PURCHASE_MESSAGE_TYPE, content: `Flight ${flightLine({ route: flight.route, ...(flight.date == null ? {} : { date: flight.date }), total })}`, purchase };
}

export function purchaseFlightOf(card: PurchaseCardData): PurchaseFlight | undefined {
  const flight = (card as { readonly flight?: unknown }).flight;
  return flight != null && typeof flight === "object" && text((flight as { offerId?: unknown }).offerId).length > 0 ? flight as PurchaseFlight : undefined;
}

const flightWords = (flight: Pick<PurchaseFlight, "route" | "airline" | "total" | "date">): string => `${flight.route}${flight.date == null ? "" : ` on ${flight.date}`} with ${flight.airline} (${flight.total})`;

/** The tool's answer once the form is in the chat. */
export const FLIGHT_FORM_SHOWN_NOTE = "The traveller form is in the chat. The person fills it in and presses Continue; then the flight's checkout card shows, they allow it and approve it in Link, and Simeon pays the airline and books it. You are told when it is booked or if it fails. Stop here: say nothing more this turn, don't ask for their details in chat, and don't book it any other way.";

export function buildFlightBookedWakePrompt(entryId: string, flight: PurchaseFlight, reference: string, test: boolean): string {
  return `[The flight ${flightWords(flight)} for ${flight.travellers.join(" and ")} is booked: booking reference ${reference}${test ? " (Duffel's test mode: a pretend airline, nothing charged, no real ticket)" : ""}. The checkout card (entry ${entryId}) shows it. Tell the person in one line: booked, the reference, and that the airline emails the ticket to the traveller. Don't book it again.]`;
}

export function buildFlightFailedWakePrompt(entryId: string, flight: PurchaseFlight, reason: string): string {
  return `[The flight ${flightWords(flight)} was not booked (checkout card ${entryId}): ${reason} Nothing was booked. Tell the person in one plain line. If the price or the flight is gone, offer a fresh search; don't retry on your own.]`;
}

export function buildFlightUncertainWakePrompt(entryId: string, flight: PurchaseFlight): string {
  return `[It isn't certain whether the flight ${flightWords(flight)} was booked: the airline didn't answer in time (checkout card ${entryId}). Never book it again. Tell the person in one line to check the traveller's email for the airline's confirmation before anything else, and that you'll help if nothing arrives.]`;
}
