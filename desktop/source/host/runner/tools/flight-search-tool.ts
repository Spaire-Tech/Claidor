/**
 * SearchFlights (2 October 2026; the founder: "Duffel is fine then", "lets
 * build in test mode then", and "you sure the agent will know when to use
 * duffel"). Flights are looked up through Simeon Labs' server
 * (`POST /desktop/api/flights/search`, server/simeon/desktop/flights.py),
 * which asks Duffel, so the agent never drives an airline site or Google
 * Flights for a price.
 *
 * The tool posts the results card itself, as the message the window draws
 * as the flight card (one ```simeon-flights block), so the card is never
 * the model's retyping of the data. The agent gets back a short summary and
 * writes only the one line under the card.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";

export const SEARCH_FLIGHTS_TOOL_NAME = "SearchFlights";

const time = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "a 24-hour time like 14:00");
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-10-02");

export const searchFlightsParameters = z.object({
  origin: z.string().trim().min(1).describe("Where the flight leaves from: a city (\"Seattle\") or an airport code (\"SEA\")."),
  destination: z.string().trim().min(1).describe("Where it goes: a city or an airport code."),
  trip: z.enum(["one_way", "round_trip"]).describe("one_way unless the user asked for a return flight too. \"I have to be in LA tomorrow\" is one_way."),
  date: day.describe("Departure date, YYYY-MM-DD, worked out from what the user said (\"tomorrow\", \"next Friday\") in their own time zone."),
  return_date: day.optional().describe("Only for trip round_trip: the date of the flight back, YYYY-MM-DD, as the user gave it. Never set it for one_way."),
  adults: z.number().int().min(1).max(9).optional().describe("Number of adult travellers. Default 1."),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional().describe("Cabin. Default economy."),
  depart_after: time.optional().describe("Earliest departure, 24-hour local time (\"06:00\"), when the user gave one."),
  arrive_before: time.optional().describe("Latest arrival, 24-hour local time (\"14:00\"), when the user has to be somewhere by a time."),
  refundable_only: z.boolean().optional().describe("true when the user wants refundable fares only."),
  nonstop_only: z.boolean().optional().describe("true when the user wants nonstop flights only."),
});

export type SearchFlightsArgs = z.infer<typeof searchFlightsParameters>;

/** What the server is sent: the trip folded into whether a return date goes with it. */
export function serverSearchArgs(args: SearchFlightsArgs): Record<string, unknown> | string {
  const { trip, return_date: returnDate, ...rest } = args;
  if (trip === "round_trip") {
    if (returnDate == null) return "A round trip needs return_date. Ask the user when they fly back, or search one_way.";
    if (returnDate < args.date) return "return_date is before date. Check the dates the user gave.";
    return { ...rest, return_date: returnDate };
  }
  return { ...rest };
}

function searchSignature(args: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(args).sort().map((key) => [key, args[key]]));
}

export interface FlightSummary {
  readonly airline?: string;
  readonly price?: string;
  readonly depart?: string;
  readonly arrive?: string;
  readonly stops?: string;
  readonly duration?: string;
  readonly refundable?: string;
  readonly changeable?: string;
  readonly bags?: string;
}

export interface FlightSearchAnswer {
  readonly card: Record<string, unknown> | null;
  readonly summary: readonly FlightSummary[];
  readonly test: boolean;
  readonly found: number;
}

export interface FlightSearchDependencies {
  /** The server's flight search; throws with the server's own sentence when it refuses. */
  search(args: Record<string, unknown>): Promise<FlightSearchAnswer>;
  /** Posts a text message to the person; returns the entry id when the transport reports one. */
  postMessage(content: string, timestampMs: number): string | undefined;
  /** The searches this turn has run, kept by the turn so a rebuilt tool still sees them. */
  readonly seenSearches?: Set<string>;
  now?: () => number;
}

/** The message the window draws as the flight card. */
export function flightCardContent(card: Record<string, unknown>): string {
  return `\`\`\`simeon-flights\n${JSON.stringify(card)}\n\`\`\``;
}

function summaryLine(offer: FlightSummary, index: number): string {
  const times = [offer.depart, offer.arrive].filter(Boolean).join("–");
  const terms = [offer.refundable ? `cancellation: ${offer.refundable}` : "", offer.changeable ? `changes: ${offer.changeable}` : "", offer.bags ? `bags: ${offer.bags}` : ""].filter(Boolean).join("; ");
  return `${index + 1}. ${[offer.airline, offer.price, times, offer.stops, offer.duration].filter(Boolean).join(" · ")}${terms ? ` (${terms})` : ""}`;
}

export function createSearchFlightsTool(deps: FlightSearchDependencies) {
  // One turn's searches (2 October 2026: an agent ran the same search six
  // times, posting the same card each time). The same search again is not
  // run and posts nothing.
  const searched = deps.seenSearches ?? new Set<string>();
  return defineCommunicateTool(deps, {
    id: "SEARCH_FLIGHTS",
    name: SEARCH_FLIGHTS_TOOL_NAME,
    description: "Search live flights and show the user a results card. Use this for any question about flights: prices, times, the cheapest or fastest way from one place to another, what lands before a given time, refundable fares. Never look up flights on airline websites, Google Flights or other travel sites; this is faster and its data is exact. The card with the options is shown to the user by this tool, so do not list the flights again: afterwards, send one short message with the best pick and, only if it could change the answer, the assumption you made. If you don't know where they are flying from, ask that one thing first. Booking is not available yet.",
    parameters: searchFlightsParameters,
    describeActivity: (args: SearchFlightsArgs) => ({ detail: `Searching flights to ${args.destination}` }),
    execute: async (_ctx, args: SearchFlightsArgs, resolved) => {
      const request = serverSearchArgs(args);
      if (typeof request === "string") return request;
      const signature = searchSignature(request);
      if (searched.has(signature)) {
        return "You already ran this exact search in this turn and its card is shown. Do not run it again. If something about it was wrong, change the arguments (for a one-way trip use trip one_way with no return_date); otherwise send your one line about the results.";
      }
      searched.add(signature);
      let answer: FlightSearchAnswer;
      try {
        answer = await resolved.search(request);
      } catch (error) {
        const said = error instanceof Error && error.message.length > 0 ? error.message : "The flight search failed.";
        return `The flight search did not work: ${said} Tell the user in one plain sentence; do not look the flights up on a website instead.`;
      }
      if (answer.card == null || answer.summary.length === 0) {
        return `No flights matched (${answer.found} found before the filters). Tell the user in one short sentence and offer the one change most likely to find some (another date, allowing a stop, dropping refundable-only).`;
      }
      const entryId = resolved.postMessage(flightCardContent(answer.card), (resolved.now ?? Date.now)());
      return [
        `The results card is shown to the user${entryId == null ? "" : ` (entry ${entryId})`}, cheapest first. Do not list these flights again.`,
        ...answer.summary.map(summaryLine),
        answer.test ? "These are Duffel test-mode results (a pretend airline and made-up prices), not real fares; say so in a few words." : "",
        "Now send one short message: the best pick for what they asked and why in a few words, plus an assumption only if it could change the answer. Do not search again with the same arguments. Booking is not available yet.",
      ].filter(Boolean).join("\n");
    },
  });
}
