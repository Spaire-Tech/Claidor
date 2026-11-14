/**
 * What the engine tells the server we run about itself: trace headers, the kind of crash report each privacy mode
 * allows, the name of every event, when logs are shipped and how they wait until then, and what a connector's sign-in
 * may say. Nothing is sent from here: the clock, the dice, the random bytes, the polling, the deadline, the hold
 * timer and the server's client are all stand-ins made below, and the answers hold what would have gone out, in order.
 */
export const part = "shared/observability";
export const modules = {
  trace: "source/shared/observability/send-trace.ts",
  privacy: "source/shared/observability/sentry-privacy-mode.ts",
  events: "source/shared/observability/telemetry-events.ts",
  cadence: "source/shared/observability/log-ship-cadence.ts",
  transport: "source/shared/observability/structured-log-transport.ts",
  connectorAuth: "source/shared/observability/connector-auth-telemetry.ts",
};
/** The folder holds other files that are not this part's. */
export const covers = Object.values(modules);

/** The moment every scenario starts at, in milliseconds. */
const START = 1_800_000_000_000;
const SECOND = 1_000;
const HOUR = 60 * 60 * SECOND;

/** What a call gave back, or the class of what it threw: the runtime's own sentence holds inner names and is left out. */
function tried(run) {
  try {
    return { returned: run() };
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
}
async function triedLater(run) {
  try {
    return { returned: await run() };
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error, ...(error?.own === true ? { message: error.message } : {}) };
  }
}
/** An error of the scenario's own making, whose message is safe to keep. */
const own = (message, extra = {}) => Object.assign(new Error(message), { own: true }, extra);

/**
 * The clock, the dice and the random bytes as stand-ins while `run` runs: the time stands still until moved, the
 * dice give `world.random`, and the bytes count up from `world.byte`.
 */
async function withStandIns(run) {
  const real = { now: Date.now, random: Math.random };
  const world = { time: START, random: 0, randomAsked: 0, byte: 0, bytesAsked: [] };
  const crypto = globalThis.crypto;
  Date.now = () => world.time;
  Math.random = () => {
    world.randomAsked += 1;
    return world.random;
  };
  crypto.getRandomValues = function (bytes) {
    world.bytesAsked.push(`${bytes.constructor.name} of ${bytes.length}${this === crypto ? "" : ", called away from crypto"}`);
    for (let at = 0; at < bytes.length; at += 1) {
      bytes[at] = world.byte;
      world.byte = (world.byte + 1) % 256;
    }
    return bytes;
  };
  try {
    return await run(world);
  } finally {
    Date.now = real.now;
    Math.random = real.random;
    delete crypto.getRandomValues;
  }
}

/** All that was queued by promises has run. */
const idle = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------------------------------------------
// Trace headers

const TRACE = "0af7651916cd43dd8448eb211c80319c";
const SPAN = "b7ad6b7169203331";
const header = (flags = "01", { version = "00", trace = TRACE, span = SPAN } = {}) => `${version}-${trace}-${span}-${flags}`;

// ---------------------------------------------------------------------------------------------------------------
// The schedule

const failedWith = (error) => ({ delivered: false, error });
/** A "too many requests" answer; `header` is what its retry-after header says, and `asked` gets the header names read. */
const tooMany = (header, asked = []) => ({
  code: 8,
  ...(header === undefined ? {} : { metadata: { get: (name) => (asked.push(name), header) } }),
});
/** The first moment the schedule says a send is due without being pressed, found from outside. */
function dueAt(schedule) {
  if (schedule.isDue(false, 0)) return 0;
  if (!schedule.isDue(false, Number.MAX_SAFE_INTEGER)) return "never";
  let before = 0;
  let from = Number.MAX_SAFE_INTEGER;
  while (from - before > 1) {
    const middle = before + Math.floor((from - before) / 2);
    if (schedule.isDue(false, middle)) from = middle;
    else before = middle;
  }
  return from;
}
const wait = (schedule, now) => {
  const at = dueAt(schedule);
  return { waits: at === 0 ? "no wait set" : at === "never" ? at : at - now, backingOff: schedule.isBackingOff(), dueIfPressed: schedule.isDue(true, now) };
};

const entry = (message, metadata = {}) => ({ message, metadata });

// ---------------------------------------------------------------------------------------------------------------
// The transport and everything around it

const label = (log) => (log.metadata?.n === undefined ? log.message : `${log.message}#${log.metadata.n}`);
const span = (logs) => (logs.length === 0 ? "none" : logs.length === 1 ? `1: ${label(logs[0])}` : `${logs.length}: ${label(logs[0])} to ${label(logs.at(-1))}`);
const copied = (log) => Object.fromEntries(Object.keys(log).map((key) => [key, key === "metadata" ? { ...log.metadata } : log[key]]));
const deadlinePassed = () => own("Deadline exceeded for submit", { name: "DeadlineExceededError", code: "deadline_exceeded" });

/**
 * A transport's surroundings: the polling, the deadline, the hold timer and the server's client, each writing what
 * it is asked into `events`. `script` says how the server answers each send, in order; with nothing said it takes
 * every entry. `brief` keeps a send as a count and its first and last entry instead of every entry.
 */
function setting(world, { script = [], brief = false, shape = false } = {}) {
  const events = [];
  const ticks = [];
  const waiting = [];
  const deadlines = [];
  const clientFailures = [];
  let clients = 0;
  let sends = 0;
  let onHoldOver;

  const polling = {
    name: "flush",
    start(...given) {
      if (this !== polling) events.push("polling started away from its policy");
      events.push(given.length === 1 ? "polling starts" : `polling starts with ${given.length} arguments`);
      ticks.push(given[0]);
      return { dispose: () => void events.push("polling stops") };
    },
  };
  const identityHoldExpiry = {
    name: "identity",
    arm(...given) {
      if (this !== identityHoldExpiry) events.push("hold timer armed away from its policy");
      events.push(`hold timer armed for "${given[0]}"${given.length === 2 ? "" : ` with ${given.length} arguments`}`);
      onHoldOver = given[1];
      return { dispose: () => void events.push("hold timer stopped") };
    },
  };
  const submitDeadline = {
    name: "submit",
    run(...given) {
      if (this !== submitDeadline) events.push("deadline run away from its policy");
      if (given.length !== 1) events.push(`deadline run with ${given.length} arguments`);
      const controller = new AbortController();
      deadlines.push(controller);
      return given[0](controller.signal);
    },
  };
  function newClient() {
    clients += 1;
    const id = clients;
    events.push(`client ${id} made`);
    if (clientFailures.length > 0) throw clientFailures.shift();
    const client = {
      submitLogs(...given) {
        const [request, options] = given;
        sends += 1;
        const send = sends;
        events.push({
          send,
          client: id,
          ...(shape ? { arguments: given.length, request: Object.keys(request), options: Object.keys(options), signal: options.signal instanceof AbortSignal ? (options.signal.aborted ? "aborted" : "live") : "none", onItsClient: this === client } : {}),
          logs: brief ? span(request.logs) : request.logs.map(copied),
        });
        options.signal.addEventListener("abort", () => void events.push(`send ${send} told to stop: ${options.signal.reason?.name}`));
        const everything = { logsProcessed: request.logs.length, logsDropped: 0 };
        const how = script.shift() ?? {};
        if ("throws" in how) throw how.throws;
        if ("fail" in how) return Promise.reject(how.fail);
        if ("answer" in how) return Promise.resolve(how.answer);
        if ("receipt" in how) return Promise.resolve({ logsProcessed: how.receipt[0], logsDropped: how.receipt[1] });
        if (how.deadline) {
          const error = deadlinePassed();
          deadlines.at(-1).abort(error);
          return Promise.reject(error);
        }
        if (how.wait) return new Promise((resolve, reject) => waiting.push({ resolve: (value = everything) => resolve(value), reject }));
        return Promise.resolve(everything);
      },
    };
    return client;
  }
  return {
    events,
    script,
    waiting,
    deadlines,
    clientFailures,
    polling,
    identityHoldExpiry,
    /** A transport in these surroundings. */
    make(lib, extra = {}) {
      const options = {
        key: "sand",
        platformTags: { client: "host", platform: "stand-in" },
        polling,
        submitDeadline,
        createClient() {
          if (this !== options) events.push("client asked for away from the options");
          return newClient();
        },
        ...extra,
      };
      return new lib.StructuredLogTransport(options);
    },
    /** One round of the polling. */
    async tick() {
      events.push("tick");
      const answer = await ticks.at(-1)();
      if (answer !== undefined) events.push({ tickAnswered: answer });
    },
    holdOver: () => onHoldOver(),
    /** Says in `events` how the entry it is given to ended. */
    settled: (name) => (settlement) => void events.push(`${name} ${settlement}`),
    note: (text) => void events.push(text),
    /** Entries numbered `from` to `to`, queued at the time it is. */
    put(transport, from, to = from, message = "event", level = "info") {
      for (let n = from; n <= to; n += 1) transport.enqueueAt(level, message, { n: String(n) }, world.time);
    },
  };
}
const waitingIn = (transport) => span(transport.capturePending());
/** The drops counted so far, and how far each was reported, for the reasons that have any. */
const drops = (transport) =>
  Object.fromEntries(
    Object.entries(transport.captureCheckpoint().counters)
      .filter(([, counter]) => counter.observed !== 0 || counter.acknowledgedThrough !== 0)
      .map(([reason, counter]) => [reason, `${counter.observed} seen, ${counter.acknowledgedThrough} reported`]),
  );

export const scenarios = [
  // -------------------------------------------------------------------------------------------------------------
  // send-trace.ts
  {
    name: "a trace header is read only in its one exact shape",
    run: ({ trace }) =>
      Object.fromEntries(
        [
          ["sampled", header("01")],
          ["not sampled", header("00")],
          ["flags ff", header("ff")],
          ["flags 0a", header("0a")],
          ["spaces and a line end around it", `  ${header()}\r\n`],
          ["a byte-order mark before it", `\ufeff${header()}`],
          ["a span id of all f", header("01", { span: "f".repeat(16) })],
          ["a trace id with one bit set", header("01", { trace: `${"0".repeat(31)}1` })],
          ["capital letters in the trace id", header("01", { trace: TRACE.toUpperCase() })],
          ["capital letters in the span id", header("01", { span: SPAN.toUpperCase() })],
          ["capital letters in the flags", header("0A")],
          ["version 01", header("01", { version: "01" })],
          ["version ff", header("01", { version: "ff" })],
          ["version 0", header("01", { version: "0" })],
          ["version 000", header("01", { version: "000" })],
          ["a trace id of all zeros", header("01", { trace: "0".repeat(32) })],
          ["a span id of all zeros", header("01", { span: "0".repeat(16) })],
          ["a trace id of 31", header("01", { trace: TRACE.slice(1) })],
          ["a trace id of 33", header("01", { trace: `${TRACE}a` })],
          ["a span id of 15", header("01", { span: SPAN.slice(1) })],
          ["a span id of 17", header("01", { span: `${SPAN}a` })],
          ["flags of one digit", header("1")],
          ["flags of three digits", header("001")],
          ["a letter past f", header("01", { trace: `g${TRACE.slice(1)}` })],
          ["a space inside", `00-${TRACE}-${SPAN} -01`],
          ["a line end inside the flags", `00-${TRACE}-${SPAN}-0\n1`],
          ["three pieces", `00-${TRACE}-${SPAN}`],
          ["five pieces", `${header()}-extra`],
          ["an empty fifth piece", `${header()}-`],
          ["nothing but dashes", "---"],
          ["empty", ""],
          ["only spaces", "   "],
          ["nothing", undefined],
          ["null", null],
          ["a number", 42],
          ["a list holding the header", [header()]],
          ["a text object", new String(header())],
          ["an object", { traceparent: header() }],
        ].map(([name, value]) => [name, trace.parseTraceparent(value)]),
      ),
  },
  {
    name: "a new trace header is made of 16 random bytes, then 8, each byte as two small hex digits",
    run: ({ trace }) =>
      withStandIns((world) => {
        world.byte = 250;
        const made = {
          "nothing said": trace.mintTraceparent(),
          true: trace.mintTraceparent(true),
          false: trace.mintTraceparent(false),
          undefined: trace.mintTraceparent(undefined),
          null: trace.mintTraceparent(null),
          zero: trace.mintTraceparent(0),
          "a word": trace.mintTraceparent("no"),
        };
        return { made, bytesAsked: world.bytesAsked, readBack: trace.parseTraceparent(made.true.traceparent), diceAsked: world.randomAsked };
      }),
  },
  {
    name: "a new trace header from the machine's own random bytes has the shape that is read back, and two differ",
    run: ({ trace }) => {
      const first = trace.mintTraceparent();
      const second = trace.mintTraceparent(false);
      const read = trace.parseTraceparent(first.traceparent);
      return {
        keys: [Object.keys(first), Object.keys(read)],
        shapes: [/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(first.traceparent), /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/.test(second.traceparent)],
        sameIdsReadBack: read.traceId === first.traceId && read.spanId === first.spanId && first.traceparent === `00-${first.traceId}-${first.spanId}-01`,
        flags: [read.traceFlags, trace.parseTraceparent(second.traceparent).traceFlags],
        differ: first.traceId !== second.traceId && first.spanId !== second.spanId,
      };
    },
  },
  {
    name: "random bytes of all zeros still make a header, one that is not read back",
    run: ({ trace }) =>
      withStandIns(() => {
        globalThis.crypto.getRandomValues = (bytes) => bytes.fill(0);
        const made = trace.mintTraceparent();
        const child = trace.deriveChildTraceparent(header());
        return { made, readBack: trace.parseTraceparent(made.traceparent), child, childReadBack: trace.parseTraceparent(child.traceparent) };
      }),
  },
  {
    name: "what the random source gives back is not used, only the bytes it was handed",
    run: ({ trace }) =>
      withStandIns(() => {
        globalThis.crypto.getRandomValues = (bytes) => {
          bytes.fill(0xab);
          return new Uint8Array(bytes.length).fill(0xcd);
        };
        return [trace.mintTraceparent(), trace.deriveChildTraceparent(header("00"))];
      }),
  },
  {
    name: "no header is made when the random source fails or is not there",
    run: ({ trace }) =>
      withStandIns(() => {
        const asked = [];
        globalThis.crypto.getRandomValues = (bytes) => {
          asked.push(bytes.length);
          throw own("no entropy");
        };
        const failing = [trace.mintTraceparent(), trace.mintTraceparent(false), trace.deriveChildTraceparent(header())];
        const whole = Object.getOwnPropertyDescriptor(globalThis, "crypto");
        Object.defineProperty(globalThis, "crypto", { ...whole, get: () => undefined });
        try {
          return { failing, asked, missing: [trace.mintTraceparent(), trace.deriveChildTraceparent(header())] };
        } finally {
          Object.defineProperty(globalThis, "crypto", whole);
        }
      }),
  },
  {
    name: "a child header keeps the trace id, takes a new span id of 8 bytes, and keeps only the sampled bit",
    run: ({ trace }) =>
      withStandIns((world) => {
        world.byte = 9;
        const children = Object.fromEntries(
          [
            ["flags 00", header("00")],
            ["flags 01", header("01")],
            ["flags 02", header("02")],
            ["flags 03", header("03")],
            ["flags fe", header("fe")],
            ["flags ff", header("ff")],
            ["spaces around the parent", `\t${header("01")} `],
          ].map(([name, parent]) => [name, trace.deriveChildTraceparent(parent)]),
        );
        const asked = world.bytesAsked.splice(0);
        const refused = Object.fromEntries(
          [
            ["capital letters", header("01").toUpperCase()],
            ["all zeros for the span", header("01", { span: "0".repeat(16) })],
            ["version 01", header("01", { version: "01" })],
            ["empty", ""],
            ["nothing", undefined],
            ["a number", 7],
          ].map(([name, parent]) => [name, trace.deriveChildTraceparent(parent)]),
        );
        return { children, bytesAsked: asked, refused, bytesAskedForRefused: world.bytesAsked };
      }),
  },
  {
    name: "a send is sampled always at 1 and above, never at 0 and below, and by the dice in between",
    run: ({ trace }) => {
      const said = (value) => (typeof value === "string" ? `"${value}"` : Object.is(value, -0) ? "-0" : String(value));
      // At these ratios the dice are never asked, so none are given.
      const withoutDice = [[], [undefined], [1], [1.5], [Infinity], [0], [-0], [-0.5], [-Infinity], [NaN], [null], [false], [true], ["1"], ["0"], [""]];
      const withDice = [
        ["0.5", 0.4],
        ["0.5", 0.6],
        ["all", 0],
        [0.5, 0.49999],
        [0.5, 0.5],
        [0.5, 0.50001],
        [0.999999, 0.999998],
        [0.999999, 0.999999],
        [Number.MIN_VALUE, 0],
        [Number.MIN_VALUE, Number.MIN_VALUE],
        [0.25, 0],
        [0.25, -1],
        [0.25, NaN],
        [0.25, undefined],
        [1, 0],
        [2, 0],
        [0, 0],
        [-1, -2],
        [NaN, 0],
      ];
      return {
        usualRatio: trace.SEND_TRACE_SAMPLE_RATIO,
        withoutDice: withoutDice.map((given) => `${given.length === 0 ? "nothing said" : said(given[0])}: ${trace.shouldSampleSend(...given)}`),
        withDice: withDice.map(([ratio, dice]) => {
          let asked = 0;
          const sampled = trace.shouldSampleSend(ratio, () => {
            asked += 1;
            return dice;
          });
          return `${said(ratio)}, dice ${said(dice)}: ${sampled}, dice asked ${asked}`;
        }),
      };
    },
  },
  {
    name: "with no dice given, the machine's dice are the ones in place when the question is asked",
    run: ({ trace }) =>
      withStandIns((world) => {
        const answers = [];
        for (const dice of [0.25, 0.75]) {
          world.random = dice;
          answers.push([dice, trace.shouldSampleSend(0.5), trace.shouldSampleSend(0.5, undefined)]);
        }
        const before = world.randomAsked;
        answers.push(["at 1 and at 0 the dice are left alone", trace.shouldSampleSend(1), trace.shouldSampleSend(0), world.randomAsked - before]);
        return { answers, diceAsked: world.randomAsked };
      }),
  },

  // -------------------------------------------------------------------------------------------------------------
  // sentry-privacy-mode.ts
  {
    name: "the privacy modes and their numbers, by name and by number",
    run: ({ privacy }) => Object.entries(privacy.PrivacyMode),
  },
  {
    name: "what a crash report may hold under each privacy mode: all of it only when training is allowed, scrubbed under no-training, otherwise only the bare facts",
    run: ({ privacy }) => {
      const { PrivacyMode, sandSentryPrivacyTierForMode } = privacy;
      const byName = Object.fromEntries(
        Object.keys(PrivacyMode)
          .filter((name) => Number.isNaN(Number(name)))
          .map((name) => [name, sandSentryPrivacyTierForMode(PrivacyMode[name])]),
      );
      const others = [
        ["no mode given", sandSentryPrivacyTierForMode()],
        ["undefined", sandSentryPrivacyTierForMode(undefined)],
        ["null", sandSentryPrivacyTierForMode(null)],
        ["5, a number past the last mode", sandSentryPrivacyTierForMode(5)],
        ["-1", sandSentryPrivacyTierForMode(-1)],
        ["2.5", sandSentryPrivacyTierForMode(2.5)],
        ["NaN", sandSentryPrivacyTierForMode(NaN)],
        ["the text 3", sandSentryPrivacyTierForMode("3")],
        ["the text 2", sandSentryPrivacyTierForMode("2")],
        ["the name of a mode", sandSentryPrivacyTierForMode("USAGE_DATA_TRAINING_ALLOWED")],
        ["true", sandSentryPrivacyTierForMode(true)],
        ["an object", sandSentryPrivacyTierForMode({ mode: 3 })],
        ["a second argument is not looked at", sandSentryPrivacyTierForMode(0, 3)],
      ];
      return { byName, others };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // telemetry-events.ts
  {
    name: "every event name, key and list, as it goes out",
    run: ({ events }) => {
      const names = Object.keys(events).sort();
      return {
        values: Object.fromEntries(names.map((name) => [name, events[name]])),
        lists: names.filter((name) => typeof events[name] === "object").map((name) => `${name}: ${Array.isArray(events[name]) ? "a list" : "an object"}, ${Object.isFrozen(events[name]) ? "frozen" : "not frozen"}`),
        unitOfEachReason: events.TELEMETRY_DROP_REASONS.map((reason) => `${reason}: ${events.TELEMETRY_DROP_UNIT_BY_REASON[reason]}`),
        sameNameTwice: names.filter((name) => typeof events[name] === "string").filter((name, at, all) => all.findIndex((other) => events[other] === events[name]) !== at),
      };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // log-ship-cadence.ts
  {
    name: "the numbers logs are shipped by",
    run: ({ cadence }) => ({
      LOG_SHIP_INTERVAL_MS: cadence.LOG_SHIP_INTERVAL_MS,
      LOG_SHIP_MAX_BATCH_ENTRIES: cadence.LOG_SHIP_MAX_BATCH_ENTRIES,
      LOG_SHIP_MAX_BATCH_BYTES: cadence.LOG_SHIP_MAX_BATCH_BYTES,
      LOG_SHIP_FAILURE_MAX_BACKOFF_MS: cadence.LOG_SHIP_FAILURE_MAX_BACKOFF_MS,
      LOG_SHIP_RATE_LIMIT_MAX_BACKOFF_MS: cadence.LOG_SHIP_RATE_LIMIT_MAX_BACKOFF_MS,
      LOG_SHIP_JITTER_RATIO: cadence.LOG_SHIP_JITTER_RATIO,
    }),
  },
  {
    name: "the wait before the next shipment: 15 s after a delivery, doubling after failures up to 60 s, and after rate limits up to 5 min or the server's own wait if longer",
    run: ({ cadence }) => {
      const rows = [];
      for (const outcome of ["shipped", "failed", "rate_limited"]) {
        for (const streak of [0, 1, 2, 3, 4, 5, 6, 40, 1_100, -1, -Infinity, Infinity, 0.5, NaN, undefined, null, "2"]) {
          rows.push({ outcome, streak });
        }
      }
      for (const retryAfterMs of [0, 1, 29_999, 30_000, 30_001, 299_999, 300_000, 300_001, 1_000_000, -5, NaN, null, undefined, Infinity, "45000"]) {
        rows.push({ outcome: "rate_limited", streak: 1, retryAfterMs });
        rows.push({ outcome: "rate_limited", streak: 9, retryAfterMs });
      }
      rows.push({ outcome: "failed", streak: 1, retryAfterMs: 500_000 }, { outcome: "shipped", streak: 3, retryAfterMs: 500_000 });
      rows.push({ outcome: "throttled", streak: 1 }, { outcome: undefined, streak: 2, retryAfterMs: 70_000 }, { outcome: "SHIPPED", streak: 0 });
      return rows.map((row) => {
        let asked = 0;
        const delay = cadence.nextLogShipDelayMs({ ...row, random: () => ((asked += 1), 0) });
        return `${String(row.outcome)}, streak ${typeof row.streak === "string" ? `"${row.streak}"` : String(row.streak)}${"retryAfterMs" in row ? `, server says ${typeof row.retryAfterMs === "string" ? `"${row.retryAfterMs}"` : String(row.retryAfterMs)}` : ""}: ${String(delay)}${asked === 1 ? "" : ` (dice asked ${asked})`}`;
      });
    },
  },
  {
    name: "up to a quarter of the wait is added by the dice, and the sum is rounded to the nearest millisecond",
    run: ({ cadence }) => {
      const dice = [0, 0.000001, 1 / 7_500, 1 / 3_750, 0.1, 0.3333, 0.5, 0.75, 0.9999, 0.999999999, 1, 2, -1, NaN];
      const of = (input) => dice.map((value) => cadence.nextLogShipDelayMs({ ...input, random: () => value }));
      return {
        dice: dice.map(String),
        shipped: of({ outcome: "shipped", streak: 0 }),
        failedOnce: of({ outcome: "failed", streak: 1 }),
        failedAtTheCap: of({ outcome: "failed", streak: 7 }),
        rateLimitedThrice: of({ outcome: "rate_limited", streak: 3 }),
        serverSays100001: of({ outcome: "rate_limited", streak: 1, retryAfterMs: 100_001 }),
        halfAStreak: of({ outcome: "failed", streak: 0.5 }),
      };
    },
  },
  {
    name: "with no dice given, or null for them, the wait is thrown with the machine's dice in place at that moment",
    run: ({ cadence }) =>
      withStandIns((world) => {
        const answers = [];
        for (const dice of [0, 0.5, 0.8]) {
          world.random = dice;
          answers.push([dice, cadence.nextLogShipDelayMs({ outcome: "shipped", streak: 0 }), cadence.nextLogShipDelayMs({ outcome: "failed", streak: 1, random: null }), cadence.nextLogShipDelayMs({ outcome: "rate_limited", streak: 2, random: undefined })]);
        }
        return { answers, diceAsked: world.randomAsked, "nothing given at all": tried(() => cadence.nextLogShipDelayMs()), "an empty input": cadence.nextLogShipDelayMs({}) };
      }),
  },
  {
    name: "a new schedule is due at once and is not backing off",
    run: ({ cadence }) => {
      const schedule = new cadence.LogShipSchedule();
      const first = { dueAtZero: schedule.isDue(false, 0), dueBeforeZero: schedule.isDue(false, -1), dueBeforeZeroIfPressed: schedule.isDue(true, -1), dueAtNaN: schedule.isDue(false, NaN), dueAtNaNIfPressed: schedule.isDue(true, NaN), backingOff: schedule.isBackingOff() };
      const answers = [schedule.shipNext(), schedule.record({ delivered: true }, 0)];
      return { first, methodsAnswerNothing: answers.every((answer) => answer === undefined), methods: ["isDue", "shipNext", "record", "isBackingOff"].map((name) => `${name}: ${typeof schedule[name]}`) };
    },
  },
  {
    name: "after a delivery the schedule waits 15 s; pressed, it is due at once; a failure makes it wait 30 s, then 60 s, and pressing no longer helps",
    run: ({ cadence }) =>
      withStandIns((world) => {
        const schedule = new cadence.LogShipSchedule();
        const steps = [];
        let now = START;
        const step = (name, result) => {
          schedule.record(result, now);
          steps.push({ after: name, ...wait(schedule, now) });
          now += 100_000;
        };
        step("a delivery", { delivered: true });
        step("a delivery with a receipt", { delivered: true, receipt: { logsProcessed: 3, logsDropped: 1 } });
        step("a failure", failedWith(own("offline")));
        step("a second failure", failedWith(own("offline")));
        step("a third failure", failedWith(own("offline")));
        step("a fourth failure", failedWith(undefined));
        step("a delivery", { delivered: true });
        step("a failure after the delivery", failedWith(null));
        world.random = 0.5;
        step("a failure, the dice at a half", failedWith("a text"));
        step("a delivery, the dice at a half", { delivered: true });
        return { steps, diceAsked: world.randomAsked };
      }),
  },
  {
    name: "a rate limit makes the schedule wait 30 s, then 60 s, up to 5 min, or as long as the server says when that is longer",
    run: ({ cadence }) =>
      withStandIns(() => {
        const schedule = new cadence.LogShipSchedule();
        const steps = [];
        const asked = [];
        let now = START;
        const step = (name, error) => {
          schedule.record(failedWith(error), now);
          steps.push({ after: name, ...wait(schedule, now) });
          now += 1_000_000;
        };
        step("a rate limit with no headers", tooMany());
        step("a second, the server saying 10 s", tooMany("10", asked));
        step("a third, the server saying 600 s", tooMany("600", asked));
        step("a fourth, the server saying 0.5 s", tooMany(" 0.5 ", asked));
        step("a fifth, the server saying minus 3", tooMany("-3", asked));
        step("a sixth, the server naming a date 20 min ahead", tooMany(new Date(now + 20 * 60 * SECOND).toUTCString(), asked));
        step("a seventh, the server naming a date in the past", tooMany(new Date(now - 60 * SECOND).toUTCString(), asked));
        step("an eighth, the server saying words", tooMany("soon", asked));
        step("a ninth, the header empty", tooMany("", asked));
        step("a tenth, the header missing", tooMany(null, asked));
        return { steps, headersRead: asked };
      }),
  },
  {
    name: "a failure ends a run of rate limits and a rate limit ends a run of failures; a delivery ends both",
    run: ({ cadence }) =>
      withStandIns(() => {
        const schedule = new cadence.LogShipSchedule();
        const steps = [];
        let now = START;
        const step = (name, result) => {
          schedule.record(result, now);
          steps.push({ after: name, ...wait(schedule, now) });
          now += 1_000_000;
        };
        step("a rate limit", failedWith(tooMany()));
        step("a rate limit", failedWith(tooMany()));
        step("a failure", failedWith(own("offline")));
        step("a rate limit", failedWith(tooMany()));
        step("a failure", failedWith(own("offline")));
        step("a failure", failedWith(own("offline")));
        step("a rate limit", failedWith(tooMany()));
        step("a delivery", { delivered: true });
        step("a rate limit", failedWith(tooMany()));
        return steps;
      }),
  },
  {
    name: "only an answer whose code is the number 8 counts as a rate limit",
    run: ({ cadence }) =>
      withStandIns(() => {
        const asked = [];
        const errors = [
          ["the number 8", { code: 8 }],
          ["an error carrying 8", Object.assign(new Error("slow down"), { code: 8 })],
          ["the text 8", { code: "8" }],
          ["8.0000001", { code: 8.0000001 }],
          ["14, unavailable, with a header", { code: 14, metadata: { get: (name) => (asked.push(name), "600") } }],
          ["4, deadline exceeded", { code: 4 }],
          ["a list", [8]],
          ["a function carrying 8", Object.assign(() => {}, { code: 8 })],
          ["null", null],
          ["nothing", undefined],
          ["the number 8 itself", 8],
        ];
        const bare = new cadence.LogShipSchedule();
        bare.record({}, START);
        const none = new cadence.LogShipSchedule();
        return {
          "an answer with nothing in it counts as a failure": wait(bare, START),
          "no answer at all": [tried(() => none.record(undefined, START)), wait(none, START)],
          waits: errors.map(([name, error]) => {
            const schedule = new cadence.LogShipSchedule();
            schedule.record(failedWith(error), START);
            schedule.record(failedWith(error), START);
            schedule.record(failedWith(error), START);
            return `${name}: ${wait(schedule, START).waits}`;
          }),
          headersRead: asked,
        };
      }),
  },
  {
    name: "a rate limit whose headers cannot be read stops the recording with that failure: the run of failures is over, the rate limit is not counted, and the wait stays as it was",
    run: ({ cadence }) =>
      withStandIns(() => {
        const schedule = new cadence.LogShipSchedule();
        const seen = [];
        schedule.record(failedWith(own("offline")), START);
        seen.push({ after: "a failure", ...wait(schedule, START) });
        const unreadable = tried(() => schedule.record(failedWith({ code: 8, metadata: { get: () => { throw own("no headers"); } } }), START));
        seen.push({ after: "a rate limit whose headers fail when read", ...unreadable, ...wait(schedule, START) });
        const shapeless = tried(() => schedule.record(failedWith({ code: 8, metadata: {} }), START));
        seen.push({ after: "a rate limit whose headers cannot be asked", ...shapeless, ...wait(schedule, START) });
        schedule.record(failedWith({ code: 8 }), START);
        seen.push({ after: "a rate limit", ...wait(schedule, START) });
        return seen;
      }),
  },
  {
    name: "asking to ship next ends the wait after a delivery, and changes nothing while backing off",
    run: ({ cadence }) =>
      withStandIns(() => {
        const schedule = new cadence.LogShipSchedule();
        const seen = [];
        const look = (name) => seen.push({ after: name, ...wait(schedule, START) });
        schedule.shipNext();
        look("ship next on a new schedule");
        schedule.record({ delivered: true }, START);
        look("a delivery");
        schedule.shipNext();
        look("ship next");
        schedule.record(failedWith(own("offline")), START);
        look("a failure");
        schedule.shipNext();
        look("ship next while backing off");
        schedule.record(failedWith(tooMany()), START);
        schedule.shipNext();
        look("a rate limit, then ship next");
        schedule.record({ delivered: true }, START);
        schedule.shipNext();
        look("a delivery, then ship next");
        return seen;
      }),
  },
  {
    name: "the edges of being due: at the moment itself, not a millisecond before",
    run: ({ cadence }) =>
      withStandIns(() => {
        const schedule = new cadence.LogShipSchedule();
        schedule.record({ delivered: true }, START);
        const afterDelivery = [14_999, 15_000, 15_001].map((after) => `${after}: ${schedule.isDue(false, START + after)}, pressed ${schedule.isDue(true, START + after)}`);
        const odd = ["yes", 1, {}, 0, "", null, undefined, NaN];
        const pressedOddlyAfterDelivery = odd.map((eager) => schedule.isDue(eager, START));
        schedule.record(failedWith(own("offline")), START);
        const afterFailure = [29_999, 30_000, 30_001].map((after) => `${after}: ${schedule.isDue(false, START + after)}, pressed ${schedule.isDue(true, START + after)}`);
        return { afterDelivery, afterFailure, pressedOddlyAfterDelivery, pressedOddlyAfterFailure: odd.map((eager) => schedule.isDue(eager, START)), pressedOddlyWhenDue: odd.map((eager) => schedule.isDue(eager, START + 30_000)) };
      }),
  },
  {
    name: "with no time given, the schedule reads the clock in place at that moment",
    run: ({ cadence }) =>
      withStandIns((world) => {
        const schedule = new cadence.LogShipSchedule();
        const seen = [];
        schedule.record({ delivered: true });
        seen.push(dueAt(schedule) - START);
        world.time = START + 14_999;
        seen.push(schedule.isDue(false), schedule.isDue(false, undefined));
        world.time = START + 15_000;
        seen.push(schedule.isDue(false));
        const asked = [];
        world.time = START + 50_000;
        schedule.record(failedWith(tooMany(new Date(START + 150_000).toUTCString(), asked)));
        seen.push(dueAt(schedule) - START);
        schedule.record(failedWith(own("offline")), undefined);
        seen.push(dueAt(schedule) - START);
        return { seen, headersRead: asked };
      }),
  },
  {
    name: "a batch takes entries in order until the 129th or until the next would pass 262,144 characters, and always takes the first",
    run: ({ cadence }) => {
      const sized = (size, n) => entry("m".repeat(size), { n: String(n) });
      const of = (buffer) => {
        const { batch, remaining, ...rest } = cadence.takeLogShipBatch(buffer);
        return {
          batch: batch.length,
          remaining: remaining.length,
          otherKeys: Object.keys(rest),
          sameEntries: batch.every((taken, at) => taken === buffer[at]) && remaining.every((left, at) => left === buffer[batch.length + at]),
          newLists: batch !== buffer && remaining !== buffer,
        };
      };
      const small = (count) => Array.from({ length: count }, (_, n) => entry("event", { n: String(n) }));
      // Every entry below weighs its message and one key and value: "n" and a digit.
      return {
        empty: of([]),
        one: of(small(1)),
        "127": of(small(127)),
        "128": of(small(128)),
        "129": of(small(129)),
        "300": of(small(300)),
        "one entry far past the size": of([sized(600_000, 0)]),
        "one entry past the size, then a small one": of([sized(262_144, 0), sized(1, 1)]),
        "two that fill the size exactly": of([sized(131_070, 0), sized(131_070, 1), sized(1, 2)]),
        "two that pass the size by one": of([sized(131_070, 0), sized(131_071, 1), sized(1, 2)]),
        "a small one, then one that alone fills the size": of([sized(1, 0), sized(262_142, 1)]),
        "the size is reached exactly by the third": of([sized(100_000, 0), sized(100_000, 1), sized(62_138, 2), sized(1, 3)]),
        "keys count as well as values": of([entry("", { ["k".repeat(131_072)]: "v".repeat(131_072) }), entry("", {}), entry("x", {})]),
        "an entry with nothing in it weighs nothing": of([sized(262_142, 0), entry("", {}), entry("", {}), entry("", { a: "" }), entry("", { a: "b" })]),
        "a character outside the basic plane counts as two": of([entry("😀".repeat(65_536), { n: "" }), entry("😀".repeat(65_535), { n: "" }), entry("", { n: "" }), entry("", { n: "1" })]),
        "a value that is not text has no length, and from there the size no longer stops anything": of([sized(10, 0), entry("x", { n: 5 }), sized(262_144, 2), sized(262_144, 3)]),
        "inherited fields are not counted": of([sized(262_142, 0), entry("", Object.create({ inherited: "x".repeat(100) })), entry("", { a: "b" })]),
        "a frozen list": of(Object.freeze(small(3))),
      };
    },
  },
  {
    name: "a batch and what remains are lists of their own, in the order the entries came",
    run: ({ cadence }) => {
      const buffer = Array.from({ length: 130 }, (_, n) => entry("event", { n: String(n) }));
      const { batch, remaining } = cadence.takeLogShipBatch(buffer);
      batch.pop();
      remaining.push(entry("late"));
      return { batch: span(batch), remaining: span(remaining), bufferUntouched: span(buffer) };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // connector-auth-telemetry.ts
  {
    name: "the connectors that may be named, and the two words for the rest",
    run: ({ connectorAuth }) => ({ known: connectorAuth.KNOWN_CONNECTOR_TAGS, other: connectorAuth.OTHER_CONNECTOR_TAG, unknown: connectorAuth.UNKNOWN_CONNECTOR_TAG }),
  },
  {
    name: "a server's name goes out only as a known connector's, small and without signs; any other name goes out as \"other\", no name as \"unknown\"",
    run: ({ connectorAuth }) => {
      const { boundedConnectorTag, KNOWN_CONNECTOR_TAGS } = connectorAuth;
      const names = [
        "github", "GitHub", "GITHUB", " git hub ", "git-hub", "git_hub", "g.i.t.h.u.b", "github!", "Google Calendar", "google-drive", "Google Docs", "google_sheets", "Google Workspace", "google",
        "hugging face", "Sequential Thinking", "context7", "Context 7", "zoom-info", "Jira", "atlassian/jira", "jira2", "github-enterprise", "my github", "githu", "notion.so", "Sentry.io",
        "acme-internal-crm", "ada@example.com's server", "https://mcp.example.com/sse", "/Users/ada/servers/private.js", "sk-live-0123456789",
        "", " ", "!!!", "---", "日本語", "\u00e9", "0", "7", "G\u0130THUB", "build\u212aite", "\uff47\uff49\uff54\uff48\uff55\uff42", "s\u017fack", "constructor", "__proto__", "has", "size",
      ];
      const byName = Object.fromEntries(names.map((name) => [JSON.stringify(name), boundedConnectorTag(name)]));
      return {
        everyKnownNameIsItself: [...KNOWN_CONNECTOR_TAGS].every((name) => boundedConnectorTag(name) === name && boundedConnectorTag(name.toUpperCase()) === name && boundedConnectorTag(` ${name.split("").join("-")} `) === name),
        byName,
        "nothing given": boundedConnectorTag(),
        undefined: boundedConnectorTag(undefined),
        null: tried(() => boundedConnectorTag(null)),
        "a number": tried(() => boundedConnectorTag(42)),
        "a list": tried(() => boundedConnectorTag(["github"])),
        "an object that can be made small": tried(() => boundedConnectorTag({ toLowerCase: () => "linear!" })),
      };
    },
  },
  {
    name: "the list of known connectors is read each time a name is asked about",
    run: ({ connectorAuth }) => {
      const { boundedConnectorTag, KNOWN_CONNECTOR_TAGS } = connectorAuth;
      const before = [boundedConnectorTag("Acme"), boundedConnectorTag("github")];
      KNOWN_CONNECTOR_TAGS.add("acme");
      KNOWN_CONNECTOR_TAGS.delete("github");
      try {
        return { before, changed: [boundedConnectorTag("Acme"), boundedConnectorTag("github")] };
      } finally {
        KNOWN_CONNECTOR_TAGS.delete("acme");
        KNOWN_CONNECTOR_TAGS.add("github");
      }
    },
  },
  {
    name: "a connector's sign-in report becomes a level and labels in a fixed order; failed and timeout are warnings",
    run: ({ connectorAuth }) => {
      const { connectorAuthTelemetry } = connectorAuth;
      const reports = [
        ["only what must be there", { phase: "start", outcome: "started" }],
        ["everything given", { phase: "callback", outcome: "succeeded", serverName: "GitHub", serverId: "srv_01", reauth: true }],
        ["given in another order", { reauth: false, serverId: "srv_02", serverName: "Linear", outcome: "succeeded", phase: "callback" }],
        ["failed", { phase: "callback", outcome: "failed", serverName: "Notion" }],
        ["timeout", { phase: "wait", outcome: "timeout", serverName: "Slack" }],
        ["Failed with a capital", { phase: "wait", outcome: "Failed" }],
        ["timed_out", { phase: "wait", outcome: "timed_out" }],
        ["cancelled", { phase: "wait", outcome: "cancelled" }],
        ["an empty outcome and phase", { phase: "", outcome: "" }],
        ["a phase and outcome that are sentences", { phase: "waiting for ada@example.com to approve", outcome: "the browser at /Users/ada closed" }],
        ["fields the report does not have are not sent", { phase: "start", outcome: "started", accessToken: "secret", url: "https://example.com/callback?code=1" }],
        ["reauth said as words", { phase: "start", outcome: "started", reauth: "yes" }],
        ["reauth said as 0", { phase: "start", outcome: "started", reauth: 0 }],
        ["reauth null", { phase: "start", outcome: "started", reauth: null }],
        ["nothing in the report", {}],
      ];
      return Object.fromEntries(reports.map(([name, report]) => [name, connectorAuthTelemetry(report, "host")]));
    },
  },
  {
    name: "the surface goes out as given",
    run: ({ connectorAuth }) => ["host", "desktop", "", undefined, 7].map((surface) => connectorAuth.connectorAuthTelemetry({ phase: "start", outcome: "started" }, surface).metadata.surface),
  },
  {
    name: "a server's name never goes out of a sign-in report as written, and its id only when it has the shape of an id",
    run: ({ connectorAuth }) => {
      const { connectorAuthTelemetry } = connectorAuth;
      const labels = (report) => {
        const { metadata } = connectorAuthTelemetry({ phase: "start", outcome: "started", ...report }, "host");
        return `connector ${metadata.connector}, server_id ${metadata.server_id === undefined ? "left out" : JSON.stringify(metadata.server_id)}`;
      };
      const names = ["GitHub", "google-drive", "Acme internal CRM", "ada@example.com", "https://mcp.example.com/sse?token=abc", "/Users/ada/servers/private.js", "", "  "];
      const ids = [
        "srv_01", "a", "A.b_c:d|e-f", "550e8400-e29b-41d4-a716-446655440000", "x".repeat(128), "x".repeat(129), "", " ", "srv 01", " srv_01", "srv_01\n", "srv/01", "ada@example.com",
        "https://mcp.example.com/sse", "/Users/ada/servers/private.js", "C:\\servers\\a", "id,with,commas", "naïve", "日本", "srv_01?x=1", "a+b", "a=b",
      ];
      return {
        names: Object.fromEntries(names.map((serverName) => [JSON.stringify(serverName), labels({ serverName })])),
        ids: Object.fromEntries(ids.map((serverId) => [serverId.length > 100 ? `x times ${serverId.length}` : JSON.stringify(serverId), labels({ serverId })])),
        "an id that is a number": tried(() => labels({ serverId: 12345 })),
        "an id that is null": tried(() => labels({ serverId: null })),
        "a name that is null": tried(() => labels({ serverName: null })),
      };
    },
  },
  {
    name: "a sign-in's failure goes out as its code, domain and whether a retry helps, and of what it carries only the listed fields that are short plain words or numbers",
    run: ({ connectorAuth }) => {
      const { connectorAuthTelemetry } = connectorAuth;
      const withError = (error, report = {}) => connectorAuthTelemetry({ phase: "callback", outcome: "failed", serverName: "GitHub", ...report, error }, "host");
      return {
        "a listed field, a plain word": withError({ code: "SAND-E0203", reason: "not_connected" }),
        "a listed field, a sentence": withError({ code: "SAND-E0204", reason: "the server at https://mcp.example.com said no to ada@example.com" }),
        "a listed field, a path": withError({ code: "SAND-E0204", reason: "/Users/ada/.config/token.json" }),
        "a listed field, 64 and 65 letters": [withError({ code: "SAND-E0205", reason: "r".repeat(64) }).metadata.reason, withError({ code: "SAND-E0205", reason: "r".repeat(65) }).metadata.reason],
        "a listed field, a number, a truth, an object, nothing": [503, 1.5, NaN, Infinity, true, false, { a: 1 }, ["a"], null, undefined, ""].map((reason) => {
          const { metadata } = withError({ code: "SAND-E0205", reason });
          return "reason" in metadata ? metadata.reason : "left out";
        }),
        "fields that are not listed": withError({ code: "SAND-E0203", reason: "refused", message: "Token abc123 rejected", stack: "at /Users/ada/app.js:1", url: "https://example.com", serverName: "Private", httpStatus: 401 }),
        "a failure that lists nothing": withError({ code: "SAND-E0206", reason: "left", errno: "ECONNRESET" }),
        "a field named with a capital goes out small with an underscore": withError({ code: "SAND-E0109", batchEntries: 12, errno: "ECONNRESET" }),
        "a code that is not in the table": withError({ code: "SAND-E9999", reason: "refused" }),
        "a code that is not a text": withError({ code: 203, reason: "refused" }),
        "no code": withError({ reason: "refused" }),
        "a failure's own phase takes the report's place, where the report's was": withError({ code: "SAND-E0601", phase: "window" }),
        "a failure on a report that went well stays information": connectorAuthTelemetry({ phase: "callback", outcome: "succeeded", error: { code: "SAND-E0206" } }, "desktop"),
        "an error that is undefined adds nothing": Object.keys(withError(undefined).metadata),
        "an error that is null": tried(() => withError(null)),
        "an error that is a text": tried(() => withError("SAND-E0203")),
      };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // structured-log-transport.ts: what stands alone
  {
    name: "the transport's numbers, its word for a passed deadline, and the levels by name and number",
    run: ({ transport }) => ({
      MAX_BUFFER_SIZE: transport.MAX_BUFFER_SIZE,
      STRUCTURED_LOG_SUBMIT_DEADLINE_MS: transport.STRUCTURED_LOG_SUBMIT_DEADLINE_MS,
      STRUCTURED_LOG_REPLAY_MAX_AGE_MS: transport.STRUCTURED_LOG_REPLAY_MAX_AGE_MS,
      DEADLINE_EXPIRY_CODE: transport.DEADLINE_EXPIRY_CODE,
      ClientLogLevel: Object.entries(transport.ClientLogLevel),
      levels: ["debug", "info", "warn", "error", "fatal", "INFO", "", undefined, null, 1].map((level) => `${String(level)}: ${transport.toClientLogLevel(level)}`),
    }),
  },
  {
    name: "a failure is a passed deadline only when it is an object whose code is exactly that word",
    run: ({ transport }) => {
      const { isDeadlineExpiry, DEADLINE_EXPIRY_CODE } = transport;
      class Inherits {}
      Inherits.prototype.code = DEADLINE_EXPIRY_CODE;
      return [
        ["an object with the code", { code: DEADLINE_EXPIRY_CODE }],
        ["an error with the code", Object.assign(new Error("late"), { code: DEADLINE_EXPIRY_CODE })],
        ["the code inherited", new Inherits()],
        ["a list with the code", Object.assign([], { code: DEADLINE_EXPIRY_CODE })],
        ["the code in capitals", { code: "DEADLINE_EXCEEDED" }],
        ["the number 4", { code: 4 }],
        ["a code of undefined", { code: undefined }],
        ["no code", {}],
        ["an error with only the name", Object.assign(new Error("late"), { name: "DeadlineExceededError" })],
        ["a function with the code", Object.assign(() => {}, { code: DEADLINE_EXPIRY_CODE })],
        ["the word itself", DEADLINE_EXPIRY_CODE],
        ["null", null],
        ["nothing", undefined],
        ["a number", 4],
      ].map(([name, error]) => `${name}: ${isDeadlineExpiry(error)}`);
    },
  },
  {
    name: "a drop counter id is 16 random bytes as 32 small hex digits",
    run: ({ transport }) =>
      withStandIns((world) => {
        world.byte = 248;
        const ids = [transport.createDropCounterId(), transport.createDropCounterId()];
        const asked = world.bytesAsked.splice(0);
        globalThis.crypto.getRandomValues = (bytes) => {
          bytes.fill(0x0f);
          return new Uint8Array(16);
        };
        ids.push(transport.createDropCounterId());
        globalThis.crypto.getRandomValues = () => {
          throw own("no entropy");
        };
        return { ids, bytesAsked: asked, whenTheSourceFails: tried(() => transport.createDropCounterId()) };
      }),
  },
  {
    name: "a drop counter id from the machine's own random bytes has that shape, and two differ",
    run: ({ transport }) => {
      const ids = [transport.createDropCounterId(), transport.createDropCounterId()];
      return { shapes: ids.map((id) => /^[0-9a-f]{32}$/.test(id)), differ: ids[0] !== ids[1] };
    },
  },
  {
    name: "empty drop counters are five pairs of zeros, new each time",
    run: ({ transport }) => {
      const first = transport.emptyDropCounters();
      const second = transport.emptyDropCounters();
      first.ship_failed.observed = 9;
      first.extra = true;
      return { second, apart: first !== second && first.ship_failed !== second.ship_failed && first.overflow_evicted !== first.replay_expired, third: transport.emptyDropCounters() };
    },
  },
  {
    name: "a copy of drop counters holds the five reasons in the usual order, each with all its counter held, and nothing else",
    run: ({ transport }) => {
      const { cloneDropCounters, emptyDropCounters } = transport;
      const source = { account_rotated: { acknowledgedThrough: 1, observed: 2 }, backend_dropped: { observed: 3, acknowledgedThrough: 4, note: "kept" }, extra: { observed: 99 }, replay_expired: { observed: 5 }, overflow_evicted: {}, ship_failed: { observed: 7, acknowledgedThrough: 8 } };
      const copy = cloneDropCounters(source);
      source.ship_failed.observed = 100;
      copy.account_rotated.observed = 200;
      const empty = emptyDropCounters();
      const ofEmpty = cloneDropCounters(empty);
      return {
        copy,
        sourceAfterTheCopyChanged: source.account_rotated,
        ofEmpty,
        apart: ofEmpty !== empty && ofEmpty.ship_failed !== empty.ship_failed,
        "a reason missing": cloneDropCounters({ ship_failed: { observed: 1, acknowledgedThrough: 0 } }),
        "counters that are numbers and texts": cloneDropCounters({ ship_failed: 5, overflow_evicted: "ab", replay_expired: null, backend_dropped: [7], account_rotated: undefined }),
        "nothing": tried(() => cloneDropCounters(undefined)),
        "null": tried(() => cloneDropCounters(null)),
      };
    },
  },
  {
    name: "a receipt is good when both its counts are whole, not negative, and add up to what was sent",
    run: ({ transport }) =>
      [
        [3, 0, 3],
        [0, 3, 3],
        [2, 1, 3],
        [0, 0, 0],
        [-0, 3, 3],
        [3, -0, 3],
        [2, 0, 3],
        [3, 1, 3],
        [4, -1, 3],
        [-1, 4, 3],
        [1.5, 1.5, 3],
        [3, 0, 3.5],
        ["3", 0, 3],
        [3, "0", 3],
        [3, null, 3],
        [3, undefined, 3],
        [undefined, 3, 3],
        [NaN, 3, 3],
        [3, Infinity, 3],
        [3n, 0n, 3],
        [3, 0, "3"],
        [3, 0, undefined],
        [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER],
        [Number.MAX_SAFE_INTEGER + 1, 0, Number.MAX_SAFE_INTEGER + 1],
        [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER + 1],
      ]
        .map(([logsProcessed, logsDropped, sent]) => `${typeof logsProcessed === "string" ? '"3"' : typeof logsProcessed === "bigint" ? "3n" : Object.is(logsProcessed, -0) ? "-0" : String(logsProcessed)} taken, ${typeof logsDropped === "string" ? '"0"' : typeof logsDropped === "bigint" ? "0n" : Object.is(logsDropped, -0) ? "-0" : String(logsDropped)} dropped, of ${typeof sent === "string" ? '"3"' : String(sent)}: ${transport.isValidLogShipReceipt({ logsProcessed, logsDropped }, sent)}`)
        .concat([
          `other fields beside them: ${transport.isValidLogShipReceipt({ logsProcessed: 1, logsDropped: 0, more: true }, 1)}`,
          `no fields: ${transport.isValidLogShipReceipt({}, 0)}`,
          `a receipt that is null: ${JSON.stringify(tried(() => transport.isValidLogShipReceipt(null, 0)))}`,
          `a receipt that is undefined: ${JSON.stringify(tried(() => transport.isValidLogShipReceipt(undefined, 0)))}`,
        ]),
  },
  {
    name: "labels with no value or an empty one are left out, the rest keep their order",
    run: ({ transport }) => {
      const { cleanStructuredLogMetadata } = transport;
      const given = { b: "2", a: "1", gone: undefined, empty: "", space: " ", zero: "0", word: "undefined", 10: "ten", 2: "two" };
      const cleaned = cleanStructuredLogMetadata(given);
      const frozen = Object.freeze({ a: "1", b: "" });
      return {
        cleaned: Object.entries(cleaned),
        aNewObject: cleaned !== given && Object.getPrototypeOf(cleaned) === Object.prototype,
        givenUntouched: Object.keys(given),
        "of nothing": cleanStructuredLogMetadata({}),
        "of a frozen object": cleanStructuredLogMetadata(frozen),
        "a number, a truth and a function have no length and are left out": cleanStructuredLogMetadata({ number: 5, truth: true, zero: 0, call: () => {}, kept: "x" }),
        "a list or an object with a length is let through as it is": cleanStructuredLogMetadata({ list: ["a"], emptyList: [], sized: { length: 2 }, unsized: { size: 2 } }),
        "inherited labels are not read": cleanStructuredLogMetadata(Object.create({ inherited: "x" }, { own: { value: "y", enumerable: true }, hidden: { value: "z", enumerable: false } })),
        "a label named __proto__ is lost": Object.entries(cleanStructuredLogMetadata(JSON.parse('{"a":"1","__proto__":"x","b":"2"}'))),
        "a label named __proto__ holding an object becomes what the result inherits from": (() => {
          const result = cleanStructuredLogMetadata(JSON.parse('{"a":"1","__proto__":{"length":1,"inherited":"x"}}'));
          return { own: Object.keys(result), inherited: result.inherited };
        })(),
        "a value of null": tried(() => cleanStructuredLogMetadata({ a: "1", b: null })),
        "nothing": tried(() => cleanStructuredLogMetadata(undefined)),
        "null": tried(() => cleanStructuredLogMetadata(null)),
        "a text is read letter by letter": cleanStructuredLogMetadata("ab"),
        "a list is read place by place": cleanStructuredLogMetadata(["x", "", undefined, "y"]),
      };
    },
  },
  {
    name: "a value longer than the limit is cut to it",
    run: ({ transport }) => {
      const { truncateStructuredLogValue } = transport;
      const same = "abcdef";
      return {
        cases: [
          ["abcdef", 7], ["abcdef", 6], ["abcdef", 5], ["abcdef", 1], ["abcdef", 0], ["abcdef", -1], ["abcdef", -6], ["abcdef", -7], ["abcdef", 2.5], ["abcdef", 5.999], ["abcdef", NaN], ["abcdef", Infinity], ["abcdef", -Infinity], ["abcdef", undefined], ["abcdef", null], ["abcdef", "3"],
          ["", 0], ["", 5], ["", -1], ["a😀b", 2], ["a😀b", 3], ["e\u0301", 1],
        ].map(([value, max]) => `${JSON.stringify(value)} at ${typeof max === "string" ? '"3"' : String(max)}: ${JSON.stringify(truncateStructuredLogValue(value, max))}`),
        long: [truncateStructuredLogValue("x".repeat(2_049), 2_048).length, truncateStructuredLogValue("x".repeat(2_048), 2_048).length],
        "a list is cut the same way": truncateStructuredLogValue([1, 2, 3], 2),
        "a number has no length and comes back": truncateStructuredLogValue(12_345, 2),
        "null": tried(() => truncateStructuredLogValue(null, 2)),
        sameTextBack: truncateStructuredLogValue(same, 6) === same,
      };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // structured-log-transport.ts: the transport
  {
    name: "a new transport takes a counter id from 16 random bytes, starts the polling, and sends nothing by itself",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        await idle();
        return {
          events: around.events,
          bytesAsked: world.bytesAsked,
          checkpoint: made.captureCheckpoint(),
          pending: made.capturePending(),
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(made)).filter((name) => ["constructor", "setIdentityTags", "setFlushTickListener", "setFlushSettledListener", "enqueue", "enqueueAt", "shipConfirmed", "capturePending", "captureCheckpoint", "recordDropped", "clearPending", "flushNow", "dispose"].includes(name)).sort(),
          answersNothing: [made.setIdentityTags({}), made.setFlushTickListener(), made.setFlushSettledListener(), made.enqueue("info", "event", {}), made.enqueueAt("info", "event", {}, world.time), made.recordDropped("ship_failed", 0)].every((answer) => answer === undefined),
        };
      }),
  },
  {
    name: "an entry waits with the platform's labels under its own, and is sent with its level as a number, its time as a big whole number, and the key",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { shape: true });
        const made = around.make(transport, { key: "the-key", platformTags: { client: "host", platform: "stand-in", arch: undefined, empty: "", n: "platform's" } });
        made.enqueueAt("debug", "first", { b: "2", a: "1", gone: undefined, empty: "" }, START - 5, around.settled("first"));
        made.enqueueAt("info", "second", { platform: "its own" }, START - 4);
        made.enqueueAt("warn", "third", {}, START - 3, undefined);
        made.enqueueAt("error", "fourth", { n: "4" }, START - 2);
        world.time = START + 7;
        made.enqueue("fatal", "fifth", { n: "5" }, around.settled("fifth"));
        made.enqueue("info", "sixth", {});
        made.enqueueAt("info", "seventh", {}, START + 7, null);
        const waiting = made.capturePending();
        const flushed = await made.flushNow();
        return { waiting, flushed, events: around.events, waitingAfter: made.capturePending(), checkpointAfter: made.captureCheckpoint() };
      }),
  },
  {
    name: "what is read of waiting entries is a copy: changing it changes nothing in the transport",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        const given = { n: "1" };
        made.enqueueAt("info", "event", given, START);
        given.n = "changed after";
        given.added = "after";
        const read = made.capturePending();
        read[0].metadata.n = "changed in the copy";
        read[0].message = "changed in the copy";
        read.push({ message: "pushed" });
        const checkpoint = made.captureCheckpoint();
        checkpoint.counters.ship_failed.observed = 50;
        checkpoint.records.length = 0;
        return { waiting: made.capturePending(), counters: drops(made), sameCounterId: made.captureCheckpoint().counterId === checkpoint.counterId, flushed: await made.flushNow(), events: around.events };
      }),
  },
  {
    name: "identity labels are put first when an entry is sent, not when it is queued, and the entry's own labels win",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        made.enqueueAt("info", "queued before", { n: "1" }, START);
        made.setIdentityTags({ host_bundle_version: "1.2.3", box_store_id: undefined, empty: "", client: "identity's", n: "identity's", last: "z" });
        made.enqueueAt("info", "queued after", { last: "its own" }, START);
        const waiting = made.capturePending();
        await made.flushNow();
        const confirmed = await made.shipConfirmed("warn", "confirmed", { host_bundle_version: "its own" });
        made.recordDropped("account_rotated", 2);
        await made.flushNow();
        made.setIdentityTags({});
        made.enqueueAt("info", "after the labels were taken away", {}, START);
        await made.flushNow();
        return { waiting, confirmed, events: around.events };
      }),
  },
  {
    name: "a transport that is switched off keeps no entry and sends none, and polls only while it has a tick listener; drops counted on it by hand are still reported",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport, { disabled: true });
        around.note("made");
        made.enqueue("error", "event", {}, around.settled("with a listener"));
        made.enqueueAt("info", "event", {}, START);
        const answers = { waiting: made.capturePending(), confirmed: await made.shipConfirmed("error", "crash", {}), flushed: await made.flushNow() };
        made.recordDropped("ship_failed", 2);
        answers.flushedWithDropsCounted = await made.flushNow();
        made.recordDropped("ship_failed", -2);
        made.setFlushTickListener(() => around.note("tick listener called"));
        made.setFlushTickListener(() => around.note("second tick listener called"));
        await around.tick();
        made.setFlushTickListener(undefined);
        around.note("listener taken away");
        made.setFlushTickListener();
        around.note("taken away again");
        made.setFlushTickListener(() => around.note("third tick listener called"));
        await around.tick();
        answers.disposed = await made.dispose();
        answers.confirmedAfterwards = await made.shipConfirmed("error", "crash", {});
        made.setFlushTickListener(() => around.note("never called"));
        return { ...answers, events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "a transport switched off by anything true behaves the same, and one switched off by false or nothing is on",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const [name, disabled] of [["1", 1], ["a word", "no"], ["false", false], ["0", 0], ["undefined", undefined], ["null", null]]) {
          const around = setting(world);
          const made = around.make(transport, { disabled });
          made.enqueueAt("info", "event", {}, START, around.settled("entry"));
          seen[name] = { confirmed: await made.shipConfirmed("info", "confirmed", {}), flushed: await made.flushNow(), events: around.events.map((event) => (typeof event === "string" ? event : `send ${event.send}: ${span(event.logs)}`)) };
        }
        return seen;
      }),
  },
  {
    name: "each round of the polling calls the tick listener first, then sends what is due; a listener that fails is passed over",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        await around.tick();
        made.setFlushTickListener(() => around.note("tick listener called"));
        await around.tick();
        around.put(made, 1, 2);
        await around.tick();
        made.setFlushTickListener(() => {
          around.note("failing tick listener called");
          throw own("listener broke");
        });
        around.put(made, 3, 3, "event", "error");
        await around.tick();
        made.setFlushTickListener(async () => {
          around.note("slow tick listener called");
          await idle();
          around.note("slow tick listener done");
        });
        around.put(made, 4, 4, "event", "error");
        await around.tick();
        await idle();
        made.setFlushTickListener(undefined);
        around.note("listener taken away");
        around.put(made, 5, 5, "event", "error");
        await around.tick();
        return around.events;
      }),
  },
  {
    name: "a round of the polling sends only when the wait since the last shipment is over",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        const at = async (after) => {
          world.time = START + after;
          around.note(`at ${after} ms`);
          await around.tick();
        };
        around.put(made, 1);
        await at(0);
        around.put(made, 2);
        await at(14_999);
        await at(15_000);
        world.random = 0.5;
        around.put(made, 3);
        await at(29_999);
        await at(30_000);
        around.put(made, 4);
        await at(30_000 + 16_874);
        await at(30_000 + 16_875);
        return around.events;
      }),
  },
  {
    name: "an entry at the error level is sent at the next round without waiting, unless the transport is backing off",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{}, {}, { fail: own("offline") }] });
        const made = around.make(transport);
        around.put(made, 1);
        await around.tick();
        around.put(made, 2, 2, "event", "warn");
        await around.tick();
        around.note("an error entry is queued");
        around.put(made, 3, 3, "event", "error");
        await around.tick();
        around.put(made, 4, 4, "event", "error");
        await around.tick();
        around.note("the send failed; another error entry is queued");
        around.put(made, 5, 5, "event", "error");
        await around.tick();
        world.time = START + 29_999;
        await around.tick();
        world.time = START + 30_000;
        await around.tick();
        return { events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "holding for identity needs a hold timer",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const refused = await triedLater(() => around.make(transport, { holdForIdentity: true }));
        let message;
        try {
          around.make(transport, { holdForIdentity: true, identityHoldExpiry: undefined });
        } catch (error) {
          message = { class: error.constructor.name, message: error.message };
        }
        return { refused, message, events: around.events, bytesAsked: world.bytesAsked };
      }),
  },
  {
    name: "while held for identity nothing queued is sent, by rounds or on demand; a confirmed shipment still goes; the labels' arrival ends the hold and sends at once",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        made.setFlushSettledListener(() => around.note("flush settled"));
        around.put(made, 1, 2);
        await around.tick();
        around.note(`flush on demand: ${await made.flushNow()}`);
        around.note(`confirmed: ${await made.shipConfirmed("error", "crash", {})}`);
        made.recordDropped("account_rotated", 1);
        await around.tick();
        around.note("the labels arrive");
        made.setIdentityTags({ host_bundle_version: "1.2.3" });
        around.note("set");
        await idle();
        around.note("the hold timer runs out afterwards");
        around.holdOver();
        await idle();
        around.note("labels set again");
        around.put(made, 3);
        made.setIdentityTags({ host_bundle_version: "1.2.4" });
        await idle();
        return { events: around.events, waiting: waitingIn(made) };
      }),
  },
  {
    name: "the hold ends by itself when its timer runs out, and what waited is sent without identity labels",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        around.put(made, 1);
        around.note("the hold timer runs out");
        around.holdOver();
        around.note("ran out");
        await idle();
        around.note("the labels arrive late");
        around.put(made, 2);
        made.setIdentityTags({ host_bundle_version: "1.2.3" });
        await idle();
        await around.tick();
        world.time = START + 15_000;
        await around.tick();
        return around.events;
      }),
  },
  {
    name: "the end of a hold with nothing waiting sends nothing, and with only drops counted sends their report",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const name of ["nothing waiting", "drops counted"]) {
          const around = setting(world);
          const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
          if (name === "drops counted") made.recordDropped("overflow_evicted", 2);
          made.setIdentityTags({ id: "x" });
          await idle();
          seen[name] = around.events;
        }
        return seen;
      }),
  },
  {
    name: "only the value true holds for identity",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const [name, holdForIdentity] of [["1", 1], ["a word", "true"], ["false", false], ["undefined", undefined]]) {
          const around = setting(world, { brief: true });
          const made = around.make(transport, { holdForIdentity, identityHoldExpiry: around.identityHoldExpiry });
          around.put(made, 1);
          seen[name] = { flushed: await made.flushNow(), events: around.events };
        }
        return seen;
      }),
  },
  {
    name: "closing a held transport stops the polling, then the hold timer, and sends what waits",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        around.put(made, 1, 3);
        const closed = await made.dispose();
        around.note("the hold timer runs out afterwards, the labels arrive afterwards");
        around.holdOver();
        made.setIdentityTags({ id: "x" });
        await idle();
        return { closed, events: around.events };
      }),
  },
  {
    name: "a transport that is switched off and held arms the hold timer and starts no polling",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport, { disabled: true, holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        made.setIdentityTags({ id: "x" });
        await idle();
        return { events: around.events, closed: await made.dispose() };
      }),
  },
  {
    name: "the 128th waiting entry sets off a send without a round; 127 wait for the round",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        around.put(made, 1, 127);
        await idle();
        around.note(`127 queued, waiting ${waitingIn(made)}`);
        around.put(made, 128);
        around.note("the 128th queued");
        await idle();
        around.note(`waiting ${waitingIn(made)}`);
        around.put(made, 129, 255);
        await idle();
        around.note(`127 more queued, waiting ${waitingIn(made)}`);
        await around.tick();
        world.time = START + 15_000;
        await around.tick();
        return around.events;
      }),
  },
  {
    name: "a send set off by a full buffer goes on, batch after batch of 128, until nothing waits",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        made.setFlushSettledListener(() => around.note(`flush settled, waiting ${waitingIn(made)}`));
        around.put(made, 1, 300);
        around.note("300 queued");
        await idle();
        around.put(made, 301, 310);
        await idle();
        around.note(`10 more queued, waiting ${waitingIn(made)}`);
        return around.events;
      }),
  },
  {
    name: "a send set off by a full buffer stops at a failure, and goes on from the first round after the back-off",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{}, { fail: own("offline") }] });
        const made = around.make(transport);
        around.put(made, 1, 300);
        await idle();
        around.note(`the second batch failed; waiting ${waitingIn(made)}; an error entry is queued`);
        around.put(made, 301, 301, "event", "error");
        await idle();
        await around.tick();
        world.time = START + 29_999;
        await around.tick();
        world.time = START + 30_000;
        await around.tick();
        await idle();
        return { events: around.events, counters: drops(made), waiting: waitingIn(made) };
      }),
  },
  {
    name: "a full buffer sets off no send while held for identity; the end of the hold sends all of it, batch after batch",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        around.put(made, 1, 200);
        await idle();
        around.note("200 queued while held");
        made.setIdentityTags({ id: "x" });
        await idle();
        around.note(`waiting ${waitingIn(made)}`);
        around.put(made, 201);
        await idle();
        around.note(`one more queued, waiting ${waitingIn(made)}`);
        await around.tick();
        await idle();
        around.note(`waiting ${waitingIn(made)}`);
        const exact = setting(world, { brief: true });
        const full = exact.make(transport, { holdForIdentity: true, identityHoldExpiry: exact.identityHoldExpiry });
        exact.put(full, 1, 128);
        full.setIdentityTags({ id: "x" });
        await idle();
        exact.put(full, 129);
        world.time = START + 15_000;
        await exact.tick();
        return { events: around.events, heldWithExactly128: exact.events };
      }),
  },
  {
    name: "a failed send puts its batch back before what was queued meanwhile, counts one failed attempt, makes a new client for the next, and each failure doubles the wait up to a minute",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }, { fail: own("offline") }, { throws: own("offline at once") }, { fail: undefined }] });
        const made = around.make(transport);
        around.put(made, 1, 2);
        made.enqueueAt("info", "event", { n: "with a listener" }, START, around.settled("the entry with a listener"));
        const first = made.flushNow();
        await idle();
        around.put(made, 3);
        around.note(`in flight, waiting ${waitingIn(made)}`);
        around.waiting[0].reject(own("offline"));
        around.note(`flush on demand: ${await first}; waiting ${waitingIn(made)}`);
        const round = async (after) => {
          world.time = START + after;
          around.note(`at ${after} ms`);
          await around.tick();
        };
        await round(29_999);
        await round(30_000);
        await round(30_000 + 59_999);
        await round(30_000 + 60_000);
        await round(90_000 + 59_999);
        await round(90_000 + 60_000);
        await round(150_000 + 59_999);
        const before = drops(made);
        await round(150_000 + 60_000);
        return { events: around.events, countersBeforeTheLastRound: before, counters: drops(made), waiting: waitingIn(made) };
      }),
  },
  {
    name: "a rate-limited send waits as the schedule says: 30 s, the server's own wait when longer, and back to 15 s after a delivery",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const asked = [];
        const around = setting(world, { brief: true, script: [{ fail: tooMany() }, { fail: tooMany("120", asked) }, {}, {}] });
        const made = around.make(transport);
        around.put(made, 1);
        const round = async (after) => {
          world.time = START + after;
          around.note(`at ${after} ms`);
          await around.tick();
        };
        await round(0);
        await round(29_999);
        await round(30_000);
        await round(30_000 + 119_999);
        await round(30_000 + 120_000);
        around.put(made, 2);
        await round(150_000 + 14_999);
        await round(150_000 + 15_000);
        return { events: around.events, headersRead: asked, counters: drops(made) };
      }),
  },
  {
    name: "counted drops are reported as warnings, one per reason in a fixed order, with the running total and the counter id, and are done with only when the server takes them all",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { script: [{}, { receipt: [1, 1] }, { receipt: [5, 0] }, { answer: {} }, { fail: own("offline") }, {}, {}] });
        const made = around.make(transport);
        for (const [reason, count] of [["account_rotated", 2], ["ship_failed", 1], ["replay_expired", 0], ["backend_dropped", -3], ["overflow_evicted", 4], ["ship_failed", 2]]) made.recordDropped(reason, count);
        const steps = [];
        const step = async (name, run) => {
          steps.push({ step: name, answer: await run(), counters: drops(made) });
        };
        await step("everything taken", () => made.flushNow());
        await step("nothing left to report", () => made.flushNow());
        made.recordDropped("ship_failed", 2);
        made.recordDropped("backend_dropped", 1);
        await step("one of two reports dropped by the server", () => made.flushNow());
        world.time = START + 60_000;
        await step("the server says it took more than were sent", () => made.flushNow());
        await step("an answer without counts", () => made.flushNow());
        await step("the send fails", () => made.flushNow());
        await step("a round while backing off", () => around.tick());
        world.time = START + 60_000 + 30_000;
        await step("a round after the back-off", () => around.tick());
        made.recordDropped("replay_expired", 1);
        await step("a round during the wait after a shipment", () => around.tick());
        world.time = START + 90_000 + 15_000;
        await step("a round after it", () => around.tick());
        return { steps, events: around.events };
      }),
  },
  {
    name: "a count of drops stops at the largest whole number, and odd counts are added as they are",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        made.recordDropped("ship_failed", Number.MAX_SAFE_INTEGER - 1);
        made.recordDropped("ship_failed", 5);
        made.recordDropped("overflow_evicted", 0.5);
        made.recordDropped("replay_expired", "3");
        made.recordDropped("backend_dropped", NaN);
        made.recordDropped("account_rotated", Infinity);
        const unknown = tried(() => made.recordDropped("lost_in_transit", 1));
        const unknownZero = tried(() => made.recordDropped("lost_in_transit", 0));
        const counters = made.captureCheckpoint().counters;
        const flushed = await made.flushNow();
        return { counters, unknown, unknownZero, flushed, events: around.events, countersAfter: made.captureCheckpoint().counters };
      }),
  },
  {
    name: "entries the server says it dropped are counted from a good receipt, every entry of the batch is told it was delivered, and the count is reported in the same pass",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ receipt: [2, 1] }, {}, { receipt: [0, 2] }, { receipt: [0, 1] }, { receipt: [0, 1] }, { receipt: [2, 2] }, {}, { answer: undefined }, { answer: "ok" }, {}] });
        const made = around.make(transport);
        const steps = [];
        const step = async (name, from, to) => {
          for (let n = from; n <= to; n += 1) made.enqueueAt("info", "event", { n: String(n) }, START, around.settled(`entry ${n}`));
          around.note(name);
          steps.push({ step: name, flushed: await triedLater(() => made.flushNow()), counters: drops(made), waiting: waitingIn(made) });
        };
        await step("two of three taken, one dropped", 1, 3);
        await step("none of two taken; the report of it refused twice", 4, 5);
        await step("a receipt that does not add up; then the report is taken", 6, 7);
        await step("no answer at all", 8, 8);
        await step("an answer that is a text", 9, 9);
        return { steps, events: around.events };
      }),
  },
  {
    name: "entries older than 17 hours are dropped at the send, told so, counted and reported; one of exactly 17 hours is sent",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        made.setFlushSettledListener(() => around.note("flush settled"));
        const queue = (name, age) => made.enqueueAt("info", name, {}, world.time - age, around.settled(name));
        queue("17 h and 1 ms old", 17 * HOUR + 1);
        queue("exactly 17 h old", 17 * HOUR);
        queue("a day old", 24 * HOUR);
        queue("new", 0);
        queue("from 17 h ahead", -17 * HOUR);
        queue("from the year 1970", world.time);
        const first = { flushed: await made.flushNow(), counters: drops(made) };
        around.note("only old entries wait");
        queue("old, alone", 18 * HOUR);
        queue("older, alone", 19 * HOUR);
        const second = { flushed: await made.flushNow(), counters: drops(made), waiting: waitingIn(made) };
        around.note("an entry grows old while it waits");
        queue("young when queued", 0);
        world.time += 17 * HOUR + 1;
        queue("queued 17 h and 1 ms later", 0);
        const third = { flushed: await made.flushNow(), counters: drops(made) };
        return { first, second, third, events: around.events };
      }),
  },
  {
    name: "an entry whose time is not a number vanishes at the send without a word, and one whose time is not whole stops the send and stays stuck",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        made.enqueueAt("info", "no time", {}, NaN, around.settled("no time"));
        made.enqueueAt("info", "no time either", {}, undefined, around.settled("no time either"));
        const vanished = { flushed: await made.flushNow(), waiting: waitingIn(made), counters: drops(made) };
        around.note("an entry with half a millisecond");
        made.enqueueAt("info", "half", {}, START + 0.5, around.settled("half"));
        around.put(made, 1);
        const stuck = { flushed: await triedLater(() => made.flushNow()), waiting: waitingIn(made), again: await triedLater(() => made.flushNow()), counters: drops(made) };
        around.note("a new entry is queued and sent; the stuck ones are gone");
        around.put(made, 2);
        const after = { flushed: await made.flushNow(), waiting: waitingIn(made), counters: drops(made) };
        around.note("text for a time");
        made.enqueueAt("info", "text time", {}, String(START), around.settled("text time"));
        const text = { flushed: await made.flushNow() };
        return { vanished, stuck, after, text, events: around.events };
      }),
  },
  {
    name: "the buffer holds 1,000 entries: past that, host and box log lines go first, oldest first, then the oldest of the rest, each told and counted",
    run: ({ transport, events }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        const queue = (n, message = "event") => made.enqueueAt("info", message, { n: String(n) }, START, around.settled(`${message}#${n}`));
        queue(1);
        queue(2, events.HOST_LOG_EVENT);
        queue(3);
        queue(4, events.BOX_LOG_EVENT);
        queue(5, "sand.host.logs");
        around.put(made, 6, 999);
        queue(1_000, events.HOST_LOG_EVENT);
        around.note(`1,000 queued, counters ${JSON.stringify(drops(made))}`);
        const seen = [];
        for (let n = 1_001; n <= 1_006; n += 1) {
          queue(n, n === 1_002 ? events.BOX_LOG_EVENT : n === 1_006 ? events.HOST_LOG_EVENT : "event");
          seen.push(`after #${n}: ${made.capturePending().length} waiting, the first four ${made.capturePending().slice(0, 4).map(label).join(", ")}, the last ${label(made.capturePending().at(-1))}`);
        }
        return { seen, events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "a batch that failed is put back and the buffer cut to 1,000 again, the failed batch's oldest entries going after the log lines",
    run: ({ transport, events }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }, { fail: own("offline") }] });
        const made = around.make(transport);
        for (let n = 1; n <= 100; n += 1) made.enqueueAt("info", "event", { n: String(n) }, START, n <= 3 || n === 100 ? around.settled(`event#${n}`) : undefined);
        const flushing = made.flushNow();
        await idle();
        around.put(made, 101, 548);
        made.enqueueAt("info", events.BOX_LOG_EVENT, { n: "549" }, START, around.settled("box log#549"));
        around.put(made, 550, 1_097);
        made.enqueueAt("info", events.HOST_LOG_EVENT, { n: "1098" }, START, around.settled("host log#1098"));
        around.note(`in flight, ${made.capturePending().length} held in all`);
        around.waiting[0].reject(own("offline"));
        const flushed = await flushing;
        await idle();
        const waiting = made.capturePending();
        return { flushed, events: around.events, waiting: `${waiting.length}: ${waiting.slice(0, 3).map(label).join(", ")} to ${label(waiting.at(-1))}`, counters: drops(made) };
      }),
  },
  {
    name: "a transport started from a checkpoint takes its counter id, its counts and its last 1,000 entries, as copies, and reports and sends them",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const checkpoint = {
          counterId: "kept-id",
          counters: { ...transport.emptyDropCounters(), ship_failed: { observed: 4, acknowledgedThrough: 1 }, replay_expired: { observed: 2, acknowledgedThrough: 2 } },
          records: [
            { level: "warn", message: "restored", metadata: { n: "1", client: "the checkpoint's" }, timestamp: START - HOUR, onSettled: around.settled("restored#1") },
            { level: "info", message: "restored", metadata: { n: "2" }, timestamp: START - 2 * HOUR, extra: "kept beside" },
          ],
        };
        const made = around.make(transport, { initialCheckpoint: checkpoint });
        checkpoint.counters.ship_failed.observed = 400;
        checkpoint.records[0].metadata.n = "changed after";
        checkpoint.records.push({ level: "info", message: "pushed after", metadata: {}, timestamp: START });
        const taken = made.captureCheckpoint();
        const flushed = await made.flushNow();
        return { taken, flushed, events: around.events, bytesAsked: world.bytesAsked, after: made.captureCheckpoint() };
      }),
  },
  {
    name: "of a checkpoint with more than 1,000 entries the oldest are left behind without a word, and an empty or missing counter id is handled as given",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const records = Array.from({ length: 1_003 }, (_, at) => ({ level: "info", message: "restored", metadata: { n: String(at + 1) }, timestamp: START, ...(at < 4 ? { onSettled: around.settled(`restored#${at + 1}`) } : {}) }));
        const made = around.make(transport, { initialCheckpoint: { counterId: "", counters: transport.emptyDropCounters(), records } });
        const first = { waiting: waitingIn(made), counterId: made.captureCheckpoint().counterId, counters: drops(made) };
        await idle();
        around.note("nothing was sent by itself");
        const flushed = await made.flushNow();
        const ids = {};
        for (const [name, counterId] of [["null", null], ["undefined", undefined], ["0", 0]]) {
          ids[name] = around.make(transport, { initialCheckpoint: { counterId, counters: transport.emptyDropCounters(), records: [] } }).captureCheckpoint().counterId;
        }
        const bare = tried(() => around.make(transport, { initialCheckpoint: {} }));
        const noRecords = around.make(transport, { initialCheckpoint: { counterId: "x", counters: {}, records: undefined } }).captureCheckpoint();
        return { first, flushed, events: around.events.filter((event) => event !== "polling starts"), ids, bytesAsked: world.bytesAsked, "a checkpoint with nothing in it": bare, "a checkpoint with no entries and no counts": noRecords };
      }),
  },
  {
    name: "a confirmed shipment goes at once and alone, past the buffer and the schedule, and says whether it was delivered",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { script: [{}, { fail: own("offline") }, { receipt: [0, 1] }, { answer: null }, { fail: tooMany() }] });
        const made = around.make(transport);
        around.put(made, 1);
        world.time = START + 3;
        const answers = [];
        answers.push(await made.shipConfirmed("error", "crash", { reason: "first", gone: undefined, empty: "", platform: "its own" }));
        around.note(`waiting ${waitingIn(made)}; counters ${JSON.stringify(drops(made))}`);
        answers.push(await made.shipConfirmed("info", "confirmed", { n: "2" }));
        around.note(`counters ${JSON.stringify(drops(made))}`);
        answers.push(await made.shipConfirmed("warn", "confirmed", { n: "3" }));
        around.note(`counters ${JSON.stringify(drops(made))}`);
        answers.push(await made.shipConfirmed("debug", "confirmed", { n: "4" }));
        answers.push(await made.shipConfirmed("info", "confirmed", { n: "5" }));
        around.note(`counters ${JSON.stringify(drops(made))}; the queued entry still goes at the next round`);
        await around.tick();
        return { answers, events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "a confirmed shipment whose labels cannot be read fails as a promise, not at the call",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const made = around.make(transport);
        let promise;
        const atTheCall = tried(() => {
          promise = made.shipConfirmed("info", "confirmed", { broken: null });
          return promise instanceof Promise;
        });
        return { atTheCall, later: await triedLater(() => promise), events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "clearing what is pending stops the send in flight, tells every entry it was dropped, forgets the counts, takes a new counter id and a new client, and ends when the flight has landed",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { script: [{ wait: true }] });
        const made = around.make(transport);
        made.setFlushSettledListener(() => around.note("flush settled"));
        const queue = (n) => made.enqueueAt("info", "event", { n: String(n) }, START, around.settled(`entry ${n}`));
        queue(1);
        queue(2);
        made.recordDropped("account_rotated", 3);
        const flushing = made.flushNow().then((answer) => around.note(`flush on demand: ${answer}`));
        await idle();
        queue(3);
        const before = made.captureCheckpoint();
        around.note("clearing");
        const clearing = made.clearPending();
        around.note(`cleared; waiting ${waitingIn(made)}`);
        clearing.then((answer) => around.note(`clearing done: ${String(answer)}`));
        await idle();
        around.note("the flight lands, every entry taken");
        around.waiting[0].resolve();
        await flushing;
        await clearing;
        const after = made.captureCheckpoint();
        queue(4);
        around.note(`flush on demand: ${await made.flushNow()}`);
        return { before: { counterId: before.counterId, records: span(before.records), counters: before.counters.account_rotated }, after, events: around.events, bytesAsked: world.bytesAsked };
      }),
  },
  {
    name: "clearing with nothing in flight answers nothing, and can be asked again and again",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        const answers = [await made.clearPending(), await made.clearPending()];
        const ids = [made.captureCheckpoint().counterId];
        around.put(made, 1);
        made.enqueueAt("info", "event", { n: "2" }, START, (settlement) => {
          around.note(`entry 2 ${settlement}`);
          if (settlement === "dropped") throw own("listener broke");
        });
        made.enqueueAt("info", "event", { n: "3" }, START, around.settled("entry 3"));
        const broken = tried(() => made.clearPending());
        ids.push(made.captureCheckpoint().counterId);
        around.note(`a listener broke the clearing; waiting ${waitingIn(made)}`);
        const flushed = await made.flushNow();
        return { answers: answers.map(String), broken: broken.threw ?? broken.returned.constructor.name, ids, flushed, events: around.events, bytesAsked: world.bytesAsked.length };
      }),
  },
  {
    name: "a failed flight that lands after a clearing puts nothing back and counts nothing",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }, { wait: true }] });
        const made = around.make(transport);
        around.put(made, 1, 2);
        const flushing = made.flushNow();
        await idle();
        const clearing = made.clearPending();
        around.note("the flight fails after the clearing");
        around.waiting[0].reject(own("offline"));
        const answers = [await flushing, await clearing];
        around.note(`waiting ${waitingIn(made)}; counters ${JSON.stringify(drops(made))}`);
        around.note("a confirmed shipment in flight when cleared");
        const confirming = made.shipConfirmed("error", "crash", {});
        await idle();
        await made.clearPending();
        around.waiting[1].reject(own("offline"));
        answers.push(await confirming);
        around.note(`waiting ${waitingIn(made)}; counters ${JSON.stringify(drops(made))}`);
        return { answers: answers.map(String), events: around.events };
      }),
  },
  {
    name: "a report of drops in flight when pending is cleared is not counted as taken or as failed, whichever way it lands",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const [name, land] of [["lands well", (flight) => flight.resolve()], ["fails", (flight) => flight.reject(own("offline"))]]) {
          for (const how of ["only drops waited", "an old entry was dropped first", "after a delivered batch"]) {
            const around = setting(world, { brief: true, script: how === "after a delivered batch" ? [{ receipt: [0, 1] }, { wait: true }] : [{ wait: true }] });
            const made = around.make(transport);
            made.setFlushSettledListener(() => around.note("flush settled"));
            if (how === "only drops waited") made.recordDropped("account_rotated", 1);
            if (how === "an old entry was dropped first") made.enqueueAt("info", "old", {}, START - 18 * HOUR);
            if (how === "after a delivered batch") around.put(made, 1);
            const flushing = made.flushNow();
            await idle();
            around.note(`counters before clearing ${JSON.stringify(drops(made))}`);
            const clearing = made.clearPending();
            land(around.waiting[0]);
            const flushed = await flushing;
            await clearing;
            around.put(made, 2);
            // After a delivered batch the schedule waits its 15 s, whatever became of the report.
            if (how === "after a delivered batch") await around.tick();
            if (how === "after a delivered batch") world.time = START + 15_000;
            await around.tick();
            world.time = START;
            seen[`${how}, the report ${name}`] = { flushed, counters: drops(made), events: around.events };
          }
        }
        return seen;
      }),
  },
  {
    name: "closing sends what waits and says whether all of it went; a second closing only says how things stand",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        made.setFlushTickListener(() => around.note("tick listener called"));
        const records = Array.from({ length: 300 }, (_, at) => ({ level: "info", message: "restored", metadata: { n: String(at + 1) }, timestamp: START }));
        const restored = around.make(transport, { initialCheckpoint: { counterId: "x", counters: transport.emptyDropCounters(), records } });
        const answers = { empty: [await made.dispose(), await made.dispose()], threeBatches: await restored.dispose() };
        made.enqueue("info", "event", {}, around.settled("queued after closing"));
        made.enqueueAt("info", "event", {}, START);
        answers.afterClosing = { waiting: waitingIn(made), confirmed: await made.shipConfirmed("error", "crash", {}), flushed: await made.flushNow() };
        made.recordDropped("account_rotated", 1);
        answers.withADropCountedAfterClosing = [await made.flushNow(), await made.dispose()];
        made.setFlushTickListener(() => around.note("never called"));
        made.setFlushTickListener(undefined);
        await made.clearPending();
        answers.afterClearing = [await made.flushNow(), await made.dispose()];
        return { ...answers, events: around.events };
      }),
  },
  {
    name: "closing while the server is out of reach tells what waits that it was dropped, unless the transport was told to keep it",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const [name, retainUndeliveredOnDispose] of [["nothing said", undefined], ["told to keep", true], ["told by a word", "yes"], ["told not to", false]]) {
          const around = setting(world, { brief: true, script: [{ fail: own("offline") }] });
          const made = around.make(transport, { retainUndeliveredOnDispose });
          for (let n = 1; n <= 3; n += 1) made.enqueueAt("info", "event", { n: String(n) }, START, around.settled(`entry ${n}`));
          const closed = await made.dispose();
          around.note("closed");
          const again = await made.dispose();
          await around.tick();
          around.note("a round 30 s later, as if it had been under way");
          world.time = START + 30_000;
          await around.tick();
          await idle();
          world.time = START;
          seen[name] = { closed, again, waiting: waitingIn(made), counters: drops(made), flushedAfterwards: await made.flushNow(), events: around.events };
        }
        return seen;
      }),
  },
  {
    name: "closing with a report of drops the server does not take says not all went, and keeps the count",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{}, { receipt: [0, 1] }, { receipt: [0, 1] }] });
        const made = around.make(transport);
        around.put(made, 1);
        made.recordDropped("overflow_evicted", 6);
        const closed = await made.dispose();
        return { closed, again: await made.dispose(), counters: drops(made), events: around.events };
      }),
  },
  {
    name: "closing in the middle of a send set off by a full buffer lets the closing send the rest",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }] });
        const made = around.make(transport);
        around.put(made, 1, 300);
        await idle();
        const closing = made.dispose().then((answer) => around.note(`closed: ${answer}`));
        around.note("closing asked while the first batch is in flight");
        around.waiting[0].resolve();
        await closing;
        await idle();
        return around.events;
      }),
  },
  {
    name: "clearing in the middle of a send set off by a full buffer ends that send; a new full buffer sets off another",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }] });
        const made = around.make(transport);
        around.put(made, 1, 300);
        await idle();
        const clearing = made.clearPending();
        around.note(`cleared, waiting ${waitingIn(made)}`);
        around.put(made, 301, 400);
        around.waiting[0].resolve();
        await clearing;
        await idle();
        around.note(`100 queued after the clearing, waiting ${waitingIn(made)}`);
        around.put(made, 401, 428);
        await idle();
        around.note(`28 more, waiting ${waitingIn(made)}`);
        return around.events;
      }),
  },
  {
    name: "sends go one after another: a second flush waits for the first, and a round during a flush sends what was queued meanwhile",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ wait: true }, { wait: true }] });
        const made = around.make(transport);
        made.setFlushSettledListener(() => around.note("flush settled"));
        around.put(made, 1, 2);
        const first = made.flushNow().then((answer) => around.note(`first flush on demand: ${answer}`));
        await idle();
        around.put(made, 3);
        const second = made.flushNow().then((answer) => around.note(`second flush on demand: ${answer}`));
        const ticking = around.tick().then(() => around.note("round done"));
        const confirming = made.shipConfirmed("error", "crash", {}).then((answer) => around.note(`confirmed: ${answer}`));
        await idle();
        around.note(`two in flight, waiting ${waitingIn(made)}`);
        around.waiting[0].resolve();
        await idle();
        around.note("first landed");
        around.waiting[1].resolve();
        await Promise.all([first, second, ticking, confirming]);
        return around.events;
      }),
  },
  {
    name: "the settled listener is called after every pass of a flush, waited for, and not called while held; when it fails, a flush on demand fails with it and a round writes it to the console",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{}, { fail: own("offline") }] });
        const made = around.make(transport);
        made.setFlushSettledListener(async () => {
          around.note("settled listener called");
          await idle();
          around.note("settled listener done");
        });
        around.put(made, 1);
        around.note(`flush on demand: ${await made.flushNow()}`);
        around.put(made, 2);
        around.note(`flush on demand: ${await made.flushNow()}`);
        around.note(`flush on demand again: ${await made.flushNow()}`);
        around.note(`flush on demand with nothing waiting: ${await made.flushNow()}`);
        around.put(made, 3);
        made.setFlushSettledListener(() => {
          around.note("failing settled listener called");
          throw own("settled listener broke");
        });
        around.note(`flush on demand: ${JSON.stringify(await triedLater(() => made.flushNow()))}; waiting ${waitingIn(made)}`);
        around.put(made, 4);
        const real = console.error;
        console.error = (...given) => void around.note({ console: given.map((value) => (value instanceof Error ? `${value.constructor.name}: ${value.message}` : value)) });
        try {
          world.time = START + HOUR;
          await around.tick();
          around.put(made, 5);
          world.time = START + 2 * HOUR;
          made.setFlushSettledListener(() => Promise.reject(own("settled listener broke late")));
          await around.tick();
        } finally {
          console.error = real;
        }
        made.setFlushSettledListener(undefined);
        around.put(made, 6);
        around.note(`flush on demand with no listener: ${await made.flushNow()}`);
        return { events: around.events, counters: drops(made) };
      }),
  },
  {
    name: "the first passed deadline of a run queues one warning about it with the size of the batch; later ones in the run do not, and a delivery or another kind of failure starts a new run",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { script: [{ deadline: true }, { deadline: true }, { fail: own("offline") }, { deadline: true }, {}, {}, { deadline: true }, { fail: { code: "deadline_exceeded" } }, {}, {}] });
        const made = around.make(transport);
        made.enqueueAt("info", "event", { n: "1" }, START);
        made.enqueueAt("info", "event", { n: "2" }, START);
        const steps = [];
        const step = async (name, run = () => made.flushNow()) => {
          world.time += 1;
          const answer = await run();
          steps.push({ step: name, answer, waiting: made.capturePending().map((log) => `${label(log)} (${Object.entries(log.metadata).filter(([key]) => !["client", "platform", "n"].includes(key)).map(([key, value]) => `${key}=${value}`).join(" ")})`), counters: drops(made) });
        };
        await step("a deadline passes");
        await step("a second passes");
        await step("another kind of failure");
        await step("a deadline passes again");
        await step("all delivered");
        await step("a confirmed shipment passes its deadline", () => made.shipConfirmed("error", "crash", {}));
        await step("a confirmed shipment fails with the bare code", () => made.shipConfirmed("error", "crash", {}));
        await step("all delivered again");
        return { steps, events: around.events.map((event) => (typeof event === "string" ? event : { send: event.send, client: event.client, logs: span(event.logs) })) };
      }),
  },
  {
    name: "a warning about a passed deadline is not queued once the transport is closed",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ deadline: true }, { deadline: true }] });
        const made = around.make(transport, { retainUndeliveredOnDispose: true });
        around.put(made, 1);
        const closed = await made.dispose();
        return { closed, waiting: waitingIn(made), counters: drops(made), events: around.events };
      }),
  },
  {
    name: "the server's client is told to stop when the deadline's signal says so, with the deadline's own reason, and when pending is cleared",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, shape: true, script: [{ wait: true }, { wait: true }, { wait: true }] });
        const made = around.make(transport);
        around.put(made, 1);
        const first = made.flushNow();
        await idle();
        const reason = deadlinePassed();
        around.deadlines[0].abort(reason);
        around.waiting[0].reject(reason);
        around.note(`flush on demand: ${await first}`);
        const confirming = made.shipConfirmed("error", "crash", {});
        const second = made.flushNow();
        await idle();
        around.note("clearing with two sends in flight");
        const clearing = made.clearPending();
        around.waiting[1].resolve();
        around.waiting[2].resolve();
        around.note(`confirmed: ${await confirming}; flush on demand: ${await second}`);
        await clearing;
        around.note("a send that has landed is not told to stop by a later clearing");
        around.put(made, 2);
        await made.flushNow();
        await made.clearPending();
        return around.events;
      }),
  },
  {
    name: "the client is made at the first send, kept while sends are delivered, made anew after a failure, and a failed send of an older client leaves the newer one in place",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{}, {}, { wait: true }, { fail: own("offline") }, { wait: true }, {}, {}] });
        const made = around.make(transport);
        await made.shipConfirmed("info", "confirmed", { n: "1" });
        around.put(made, 2);
        await made.flushNow();
        around.note("a flight of client 1 stays in the air; a confirmed shipment fails meanwhile, and another makes client 2");
        around.put(made, 3);
        const flushing = made.flushNow();
        await idle();
        await made.shipConfirmed("info", "confirmed", { n: "4" });
        const confirming = made.shipConfirmed("info", "confirmed", { n: "5" });
        await idle();
        around.note("the flight of client 1 fails");
        around.waiting[0].reject(own("offline"));
        await flushing;
        around.waiting[1].resolve();
        await confirming;
        await made.shipConfirmed("info", "confirmed", { n: "6" });
        world.time = START + HOUR;
        await made.flushNow();
        return around.events;
      }),
  },
  {
    name: "when no client can be made the flush fails with that failure and its batch is left stuck: it waits forever, and is lost without a word when the next batch is taken",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        for (let n = 1; n <= 2; n += 1) made.enqueueAt("info", "event", { n: String(n) }, START, around.settled(`entry ${n}`));
        around.clientFailures.push(own("no client"), own("still no client"));
        const steps = [];
        const step = async (name, run) => {
          steps.push({ step: name, answer: await triedLater(run), waiting: waitingIn(made), counters: drops(made) });
        };
        await step("a flush on demand", () => made.flushNow());
        await step("a confirmed shipment", () => made.shipConfirmed("error", "crash", {}));
        await step("a flush on demand, a client can be made now", () => made.flushNow());
        await step("a round", () => around.tick());
        made.enqueueAt("info", "event", { n: "3" }, START, around.settled("entry 3"));
        await step("a new entry, then a flush on demand", () => made.flushNow());
        return { steps, events: around.events };
      }),
  },
  {
    name: "a listener that fails when told its entry was delivered stops the pass there: later entries of the batch are not told, and the schedule does not hear of the delivery",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true, script: [{ receipt: [2, 1] }] });
        const made = around.make(transport);
        made.enqueueAt("info", "event", { n: "1" }, START, around.settled("entry 1"));
        made.enqueueAt("info", "event", { n: "2" }, START, () => {
          around.note("entry 2's listener fails");
          throw own("listener broke");
        });
        made.enqueueAt("info", "event", { n: "3" }, START, around.settled("entry 3"));
        const flushed = await triedLater(() => made.flushNow());
        around.note(`waiting ${waitingIn(made)}; counters ${JSON.stringify(drops(made))}`);
        around.put(made, 4);
        await around.tick();
        return { flushed, events: around.events };
      }),
  },
  {
    name: "a listener that fails when told its entry was dropped fails the call that dropped it",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const broken = () => {
          throw own("listener broke");
        };
        const off = around.make(transport, { disabled: true });
        const whenOff = tried(() => off.enqueue("info", "event", {}, broken));
        const made = around.make(transport, { holdForIdentity: true, identityHoldExpiry: around.identityHoldExpiry });
        made.enqueueAt("info", "event", { n: "0" }, START, broken);
        around.put(made, 1, 999);
        const atOverflow = tried(() => made.enqueueAt("info", "event", { n: "1000" }, START, around.settled("entry 1000")));
        const afterOverflow = `${made.capturePending().length} waiting from ${label(made.capturePending()[0])}; counters ${JSON.stringify(drops(made))}`;
        const old = around.make(transport);
        old.enqueueAt("info", "old", {}, START - 18 * HOUR, broken);
        old.enqueueAt("info", "old too", {}, START - 18 * HOUR, around.settled("old too"));
        const atExpiry = await triedLater(() => old.flushNow());
        const afterExpiry = `waiting ${waitingIn(old)}; counters ${JSON.stringify(drops(old))}`;
        const closing = around.make(transport);
        around.script.push({ fail: own("offline") });
        closing.enqueueAt("info", "event", { n: "c" }, START, broken);
        const atClosing = await triedLater(() => closing.dispose());
        return { whenOff, atOverflow, afterOverflow, atExpiry, afterExpiry, atClosing, waitingAfterClosing: waitingIn(closing), events: around.events.filter((event) => !String(event).startsWith("polling")) };
      }),
  },
  {
    name: "clearing after a flush that failed still ends, answering nothing, and the next flush goes as usual",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world, { brief: true });
        const made = around.make(transport);
        made.setFlushSettledListener(() => {
          throw own("settled listener broke");
        });
        around.put(made, 1);
        const failed = await triedLater(() => made.flushNow());
        const cleared = await triedLater(() => made.clearPending());
        made.setFlushSettledListener(undefined);
        around.put(made, 2);
        return { failed, cleared, flushed: await made.flushNow(), events: around.events };
      }),
  },
  {
    name: "an error entry ends the wait only after it is queued and the overflow dealt with: when a listener fails there, the wait goes on",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const seen = {};
        for (const name of ["the overflow's listener fails", "the overflow's listener is sound"]) {
          const around = setting(world, { brief: true, script: [{}, { wait: true }] });
          const made = around.make(transport);
          around.put(made, 1);
          await made.flushNow();
          around.put(made, 2);
          const flushing = made.flushNow();
          await idle();
          made.enqueueAt("info", "event", { n: "oldest" }, START, (settlement) => {
            around.note(`the oldest entry ${settlement}`);
            if (name === "the overflow's listener fails") throw own("listener broke");
          });
          around.put(made, 3, 1_001);
          const queued = tried(() => made.enqueueAt("error", "event", { n: "error" }, START));
          const clearing = made.clearPending();
          around.waiting[0].resolve();
          await flushing;
          await clearing;
          around.put(made, 1_002);
          await around.tick();
          seen[name] = { queued, events: around.events };
        }
        return seen;
      }),
  },
  {
    name: "a transport cannot be made without its platform labels, and reads its polling, deadline and client only when it needs them",
    run: ({ transport }) =>
      withStandIns(async (world) => {
        const around = setting(world);
        const noLabels = tried(() => new transport.StructuredLogTransport({ key: "sand", polling: around.polling }));
        const noPolling = tried(() => new transport.StructuredLogTransport({ key: "sand", platformTags: {} }));
        const noOptions = tried(() => new transport.StructuredLogTransport());
        const bare = new transport.StructuredLogTransport({ key: "sand", platformTags: {}, disabled: true });
        const lazy = new transport.StructuredLogTransport({ platformTags: { a: "1" }, polling: around.polling });
        lazy.enqueueAt("info", "event", {}, START);
        const noClient = await triedLater(() => lazy.flushNow());
        return { noLabels, noPolling, noOptions, bareClosed: await bare.dispose(), noClient, lazyWaiting: lazy.capturePending(), events: around.events, bytesAsked: world.bytesAsked.length };
      }),
  },
];
