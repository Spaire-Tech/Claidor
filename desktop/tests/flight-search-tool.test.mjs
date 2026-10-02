/**
 * SearchFlights (2 October 2026): the agents' flight tool. It asks Simeon Labs' server
 * (server/simeon/desktop/flights.py, Duffel behind it), posts the results card itself, and
 * hands the agent a short summary to write its one line from. The card it posts is the
 * message the window draws as the flight card.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(tool, args) {
  const context = await load("source/packages/context/core.ts", `context-${Math.random().toString(36).slice(2)}`);
  try {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.module.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  } finally {
    await context.dispose();
  }
}

// The server's answer, in the shape flights.py writes (tests/desktop/test_flights.py pins it there).
const CARD = {
  title: "Seattle to Los Angeles", subtitle: "Test results · Fri, Oct 2 · Refundable · 1 adult", test: true,
  offers: [{
    airline: "Duffel Airways", logo: "https://assets.duffel.com/ZZ.svg", price: "$361.20", priceNote: "1 adult · Economy", date: "Fri, Oct 2",
    from: "SEA", fromCity: "Seattle", to: "LAX", toCity: "Los Angeles", depart: "6:00 AM", arrive: "12:18 PM", duration: "6h 18m", stops: "1 stop",
    refundable: "Full refund", changeable: "$75.00 fee", bags: "1 carry-on",
    legs: [
      { from: "SEA", fromCity: "Seattle", to: "PHX", toCity: "Phoenix", depart: "6:00 AM", arrive: "9:10 AM", flight: "ZZ 3792", carrier: "Duffel Airways", logo: "", cabin: "Economy", duration: "3h 10m", layover: "1h 38m in Phoenix" },
      { from: "PHX", fromCity: "Phoenix", to: "LAX", toCity: "Los Angeles", depart: "10:48 AM", arrive: "12:18 PM", flight: "ZZ 2027", carrier: "Duffel Airways", logo: "", cabin: "Economy", duration: "1h 30m" },
    ],
  }],
};
const ANSWER = { card: CARD, summary: [{ airline: "Duffel Airways", price: "$361.20", depart: "6:00 AM", arrive: "12:18 PM", stops: "1 stop", duration: "6h 18m", refundable: "Full refund", changeable: "$75.00 fee", bags: "1 carry-on" }], test: true, found: 12 };

test("the tool posts the card, tells the agent not to repeat it, and flags test results", async () => {
  const { module, dispose } = await load("source/host/runner/tools/flight-search-tool.ts", "flight-tool");
  try {
    const posted = [];
    const searched = [];
    const tool = module.createSearchFlightsTool({ search: async (args) => { searched.push(args); return ANSWER; }, postMessage: (content, at) => { posted.push(content); return "m-1"; }, now: () => 5 });
    assert.equal(tool.name, "SearchFlights");
    assert.match(tool.descriptionGenerator?.() ?? tool.description, /Never look up flights on airline websites, Google Flights/);
    const args = { origin: "Seattle", destination: "Los Angeles", trip: "one_way", date: "2026-10-02", arrive_before: "14:00", refundable_only: true };
    const text = await run(tool, args);
    const { trip: _trip, ...sent } = args;
    assert.deepEqual(searched, [sent], "the trip is folded away; the server only sees whether a return date goes with it");
    assert.equal(posted.length, 1);
    assert.equal(posted[0], `\`\`\`simeon-flights\n${JSON.stringify(CARD)}\n\`\`\``);
    assert.match(text, /The results card is shown to the user \(entry m-1\)/);
    assert.match(text, /Do not list these flights again/);
    assert.match(text, /1\. Duffel Airways · \$361\.20 · 6:00 AM–12:18 PM · 1 stop · 6h 18m \(cancellation: Full refund; changes: \$75\.00 fee; bags: 1 carry-on\)/);
    assert.match(text, /These are test results/);
    assert.doesNotMatch(text, /Duffel\b(?! Airways)/, "the data provider is never named to the agent's user");
  } finally {
    await dispose();
  }
});

test("no match and a refusal post nothing and tell the agent what to say", async () => {
  const { module, dispose } = await load("source/host/runner/tools/flight-search-tool.ts", "flight-tool-empty");
  try {
    const posted = [];
    const empty = module.createSearchFlightsTool({ search: async () => ({ card: null, summary: [], test: false, found: 3 }), postMessage: (c) => { posted.push(c); } });
    assert.match(await run(empty, { origin: "SEA", destination: "LAX", trip: "one_way", date: "2026-10-02" }), /No flights matched \(3 found before the filters\)/);
    const refused = module.createSearchFlightsTool({ search: async () => { throw new Error("Flight search is not switched on yet."); }, postMessage: (c) => { posted.push(c); } });
    const said = await run(refused, { origin: "SEA", destination: "LAX", trip: "one_way", date: "2026-10-02" });
    assert.match(said, /Flight search is not switched on yet\./);
    assert.match(said, /do not look the flights up on a website instead/);
    assert.deepEqual(posted, []);
  } finally {
    await dispose();
  }
});

test("the window reads the card the tool posts", async () => {
  const { module, dispose } = await load("source/host/runner/tools/flight-search-tool.ts", "flight-tool-window");
  try {
    const patch = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href);
    const source = patch.FLIGHTS_REPLACEMENTS.find(([label]) => label === "flights-components")[2];
    const parseSource = source.slice(source.indexOf("function __simeonFlightsParse"), source.indexOf("function __simeonInitials"));
    const parse = new Function(`${parseSource}; return __simeonFlightsParse;`)();
    const card = parse(module.flightCardContent(CARD));
    assert.equal(card.title, "Seattle to Los Angeles");
    assert.equal(card.subtitle, "Test results · Fri, Oct 2 · Refundable · 1 adult");
    assert.equal(card.offers[0].legs[0].layover, "1h 38m in Phoenix");
    assert.equal(card.offers[0].changeable, "$75.00 fee");
    assert.equal(parse("just text"), null);
  } finally {
    await dispose();
  }
});

test("main agents get the tool and the rule; children and shared rooms do not get the tool", async () => {
  const toolset = await readFile(path.join(repoRoot, "source/host/runner/tools/turn-toolset.ts"), "utf8");
  assert.match(toolset, /if \(!host\.isSubagentRunner\) \{[\s\S]*?const flights = factories\.flights\?\.\(\);/);
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /\.\.\.\(isSharedRoomTurn\s*\? \{\}\s*: \{\s*createFlightToolInputs:/);
  assert.match(composition, /simeonApiData<FlightSearchAnswer>\(.*"flights\/search", \{ method: "POST", json: args/);
  const prompt = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  assert.match(prompt, /Flights go through SearchFlights whenever you have it/);
});

test("one way drops a stray return date, a round trip needs one, and the same search is not run twice in a turn", async () => {
  const { module, dispose } = await load("source/host/runner/tools/flight-search-tool.ts", "flight-tool-trip");
  try {
    assert.deepEqual(module.serverSearchArgs({ origin: "SEA", destination: "LAX", trip: "one_way", date: "2026-10-02", return_date: "2026-10-02" }), { origin: "SEA", destination: "LAX", date: "2026-10-02" });
    assert.match(module.serverSearchArgs({ origin: "SEA", destination: "LAX", trip: "round_trip", date: "2026-10-02" }), /needs return_date/);
    assert.match(module.serverSearchArgs({ origin: "SEA", destination: "LAX", trip: "round_trip", date: "2026-10-05", return_date: "2026-10-02" }), /before date/);
    assert.deepEqual(module.serverSearchArgs({ origin: "SEA", destination: "LAX", trip: "round_trip", date: "2026-10-02", return_date: "2026-10-04" }).return_date, "2026-10-04");

    const posted = [];
    let searches = 0;
    const seen = new Set();
    const deps = { search: async () => { searches += 1; return ANSWER; }, postMessage: (c) => { posted.push(c); }, seenSearches: seen };
    const ask = { origin: "Seattle", destination: "Los Angeles", trip: "one_way", date: "2026-10-02" };
    await run(module.createSearchFlightsTool(deps), ask);
    const again = await run(module.createSearchFlightsTool(deps), ask);
    assert.match(again, /You already ran this exact search in this turn/);
    assert.equal(searches, 1, "a tool rebuilt in the same turn still remembers");
    assert.equal(posted.length, 1, "one card, not six");
    await run(module.createSearchFlightsTool(deps), { ...ask, date: "2026-10-03" });
    assert.equal(searches, 2, "a different search runs");
  } finally {
    await dispose();
  }
});

test("the agent is told Muse's flight rules, and ranking and airlines reach the server", async () => {
  const { module, dispose } = await load("source/host/runner/tools/flight-search-tool.ts", "flight-tool-muse");
  try {
    const description = module.SEARCH_FLIGHTS_DESCRIPTION;
    for (const rule of [/memory, past trips, email and calendar/, /one adult, one way, and say that assumption/, /Ask before searching only when a missing fact would change the route/, /airlines set to it/, /not that the airline doesn't fly there/, /Do not repeat prices, times or terms/, /ask the user to type which flight/, /Never name the flight data provider/]) {
      assert.match(description, rule);
    }
    const searched = [];
    const tool = module.createSearchFlightsTool({ search: async (args) => { searched.push(args); return ANSWER; }, postMessage: () => "m-2" });
    const text = await run(tool, { origin: "SEA", destination: "LAX", trip: "one_way", date: "2026-10-02", priority: "cheapest", airlines: ["AS"] });
    assert.deepEqual(searched[0].airlines, ["AS"]);
    assert.equal(searched[0].priority, "cheapest");
    assert.match(text, /cheapest first, out of 12 offers/);
  } finally {
    await dispose();
  }
});
