/**
 * BookFlight (13 October 2026): the agent's way to book a flight the person
 * picked in words ("book the 6:49 Alaska one"). The apps' "Book with Simeon"
 * on the search card does the same without the agent. Either way the
 * traveller form goes into the chat and the agent's turn ends; the person
 * fills it in, allows the flight's checkout card and approves it in Link, and
 * Simeon pays the airline and books it (`shared/node/flight-booking/`). The
 * agent never sees or types the travellers' details or the card.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import { FLIGHT_FORM_SHOWN_NOTE, type FlightPassengersMessage } from "../../../shared/node/flight-booking/flight-booking.js";

export const BOOK_FLIGHT_TOOL_NAME = "BookFlight";

export const bookFlightParameters = z.object({
  offer_id: z.string().trim().regex(/^off_[A-Za-z0-9_]{6,80}$/, "the flight's offer id (off_…) from SearchFlights").describe("The offer id (off_…) of the flight the person chose, from the SearchFlights results you were given."),
});

export interface BookFlightDependencies {
  /** The offer asked for again and the traveller form for it; the server's own sentence when it can't be booked. */
  prepareForm(offerId: string): Promise<{ readonly ok: true; readonly message: FlightPassengersMessage } | { readonly ok: false; readonly message: string }>;
  /** Appends the form; returns its entry id when the transport reports one. */
  emitForm(message: FlightPassengersMessage, timestampMs: number): string | undefined;
  now?: () => number;
}

export const BOOK_FLIGHT_DESCRIPTION = "Book a flight the person chose from the SearchFlights results: it shows them the traveller form (names as on their ID, date of birth, contact details, the passport only when the airline needs it), then the flight's checkout card to allow and approve in Link; Simeon then pays the airline with their Link card and books it. Use it only when the person clearly asked to book that flight; never ask for their details in chat and never book a flight on a website. Your turn ends with the form.";

export function createBookFlightTool(deps: BookFlightDependencies) {
  return defineCommunicateTool(deps, {
    id: "BOOK_FLIGHT",
    name: BOOK_FLIGHT_TOOL_NAME,
    description: BOOK_FLIGHT_DESCRIPTION,
    parameters: bookFlightParameters,
    describeActivity: () => ({ detail: "Preparing the booking" }),
    execute: async (_ctx, args: z.infer<typeof bookFlightParameters>, resolved) => {
      const prepared = await resolved.prepareForm(args.offer_id);
      if (!prepared.ok) return `The flight can't be booked: ${prepared.message} Tell the person in one plain sentence.`;
      const entryId = resolved.emitForm(prepared.message, (resolved.now ?? Date.now)());
      return `The traveller form for ${prepared.message.flight.route} (${prepared.message.flight.total}${prepared.message.flight.test ? ", Duffel's test mode: a pretend airline, nothing charged" : ""}) is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. ${FLIGHT_FORM_SHOWN_NOTE}`;
    },
  });
}
