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
 *
 * What the agent is told follows Muse's own flight rules (the founder, 2
 * October 2026: "take example from muse and the instructions for flights.
 * ours isnt smart"): know the traveller before asking, assume one adult one
 * way and say so, ask only what changes the route, search the whole trip
 * once, fastest first unless they want the cheapest, a targeted airline
 * search when an expected airline is missing, a short acknowledgement after
 * the card and nothing repeated, and the data provider never named.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";

export const SEARCH_FLIGHTS_TOOL_NAME = "SearchFlights";

const time = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "a 24-hour time like 14:00");
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-10-02");

export const searchFlightsParameters = z.object({
  origin: z.string().trim().min(1).describe("Where the flight leaves from: the exact three-letter airport code (\"SEA\") when the user, their memory or their past trips name the airport; otherwise the city (\"Seattle\"). Never a guessed or ambiguous code."),
  destination: z.string().trim().min(1).describe("Where it goes: an exact airport code when known, otherwise the city."),
  trip: z.enum(["one_way", "round_trip"]).describe("one_way unless the user asked for a return flight too. \"I have to be in LA tomorrow\" is one_way. A round trip is searched as one trip, both flights together."),
  date: day.describe("Departure date, YYYY-MM-DD, worked out from what the user said (\"tomorrow\", \"next Friday\") in the time zone of the airport they leave from. Never move it to a different day than the one they asked for."),
  return_date: day.optional().describe("Only for trip round_trip: the date of the flight back, YYYY-MM-DD, as the user gave it. Never set it for one_way."),
  adults: z.number().int().min(1).max(9).optional().describe("Number of adult travellers. Default 1."),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional().describe("Cabin. Default economy."),
  depart_after: time.optional().describe("Earliest departure, 24-hour local time (\"06:00\"), when the user gave one."),
  arrive_before: time.optional().describe("Latest arrival, 24-hour local time (\"14:00\"), when the user has to be somewhere by a time."),
  refundable_only: z.boolean().optional().describe("true when the user wants refundable fares only."),
  nonstop_only: z.boolean().optional().describe("true when the user wants nonstop flights only."),
  priority: z.enum(["fastest", "cheapest"]).optional().describe("How the options are ranked. Default fastest: the shortest whole journey first, nonstop preferred, with a meaningfully cheaper option kept. cheapest only when the user said the price matters most."),
  airlines: z.array(z.string().trim().regex(/^[A-Za-z0-9]{2}$/, "a two-letter airline code like AS")).max(6).optional().describe("Two-letter airline codes (\"AS\", \"DL\") to search only those airlines: when the user asks for an airline, or for the one targeted search when an airline they prefer or would expect on this route is missing from the first results."),
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
  /** Why it is on the shortlist: Fastest, Cheapest, Refundable, or empty. */
  readonly label?: string;
  readonly airline?: string;
  readonly priceNote?: string;
  readonly returnTimes?: string;
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
  const why = offer.label ? `[${offer.label}] ` : "";
  return `${index + 1}. ${why}${[offer.airline, offer.price, offer.priceNote, times, offer.stops, offer.duration, offer.returnTimes].filter(Boolean).join(" · ")}${terms ? ` (${terms})` : ""}`;
}

export const SEARCH_FLIGHTS_DESCRIPTION = [
  "Search live flights and show the user a results card. Use this for any question about flights: prices, times, the fastest or cheapest way from one place to another, what lands before a given time, refundable fares. Never look up flights on airline websites, Google Flights or other travel sites, and never hand a flight search to a browser or research subagent; this is faster and its data is exact.",
  "Before asking anything, use what you already know: memory, past trips, email and calendar for their home airport, preferred and avoided airlines, cabin, and any meeting the flight has to make. With \"me\" and one date, search one adult, one way, and say that assumption with the result. Ask before searching only when a missing fact would change the route (you don't know where they leave from) or the travellers; ask that one thing in one short question. This search prices adults only: if a child or infant is travelling, say so instead of searching them as adults.",
  "Search the whole trip at once and once per question: a round trip is one search with return_date. Run it again only with different arguments: when an airline they prefer or would expect on the route is missing, run one search with airlines set to it. Its absence then means it isn't in the bookable results, not that the airline doesn't fly there.",
  "The card shows the options, fastest whole journey first, and lets the user pick; it is the answer. Afterwards send one short message: the recommendation and the one reason that decides it, plus any assumption you made. Do not repeat prices, times or terms from the card, add a details section, or ask the user to type which flight they want. Never name the flight data provider. Booking is not available yet.",
].join(" ");

export function createSearchFlightsTool(deps: FlightSearchDependencies) {
  // One turn's searches (2 October 2026: an agent ran the same search six
  // times, posting the same card each time). The same search again is not
  // run and posts nothing.
  const searched = deps.seenSearches ?? new Set<string>();
  return defineCommunicateTool(deps, {
    id: "SEARCH_FLIGHTS",
    name: SEARCH_FLIGHTS_TOOL_NAME,
    description: SEARCH_FLIGHTS_DESCRIPTION,
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
        const named = request.airlines != null ? " For an airline search this means it isn't in the bookable results, not that the airline doesn't fly the route." : "";
        return `No flights matched (${answer.found} found before the filters).${named} Tell the user in one short sentence and offer the one change most likely to find some (another date, allowing a stop, dropping refundable-only).`;
      }
      const entryId = resolved.postMessage(flightCardContent(answer.card), (resolved.now ?? Date.now)());
      const ranked = request.priority === "cheapest" ? "cheapest first" : "fastest whole journey first";
      return [
        `The results card is shown to the user${entryId == null ? "" : ` (entry ${entryId})`}, ${ranked}, out of ${answer.found} offers. Do not list these flights again.`,
        ...answer.summary.map(summaryLine),
        answer.test ? "These are test results (a pretend airline and made-up prices), not real fares; say so in a few words." : "",
        "Now send one short message: the recommendation and the one reason that decides it (for example the time saved, or the money saved for the longer trip), plus the assumptions you made (one adult, one way, the airports). Do not repeat prices, times or terms, add a details section, ask them to type a choice, or name the data provider. Do not search again with the same arguments. Booking is not available yet.",
      ].filter(Boolean).join("\n");
    },
  });
}
