/**
 * Product analytics on its way to the server: an event's properties as typed
 * values, the buffer that sends events in batches once a token is there, and
 * the buffer that only keeps them until analytics is switched on.
 *
 * Nothing here waits for real time: `setTimeout`, `clearTimeout` and
 * `Date.now` are stand-ins while a scenario runs, and a timer fires when the
 * scenario says so.
 */
export const part = "packages/analytics-client";
export const modules = {
  eventData: "source/packages/analytics-client/to-event-data.ts",
  buffer: "source/packages/analytics-client/buffer.ts",
  deferred: "source/packages/analytics-client/deferred-buffer.ts",
};

/** The moment `Date.now()` gives while a scenario runs. */
const NOW = 1_700_000_000_123;

/** A value as a log line shows it, with its kind where a text and a number could be confused. */
const shown = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));

/** What a call threw, by class only: the sentence of an error JavaScript itself raises is the runtime's, not the part's. */
function classThrown(run) {
  try {
    run();
    return "nothing thrown";
  } catch (error) {
    return error?.constructor?.name ?? typeof error;
  }
}

/** How a promise ended. */
async function ending(promise) {
  try {
    return { resolved: await promise };
  } catch (error) {
    return { rejected: error };
  }
}

/** A promise settled from outside. */
function later() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Every microtask done: nothing is left that could still run without a timer. */
const settled = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Runs `run` with stand-in timers and a fixed clock, and puts the real ones
 * back. Every timer set or cleared is a line in `log`; `fire(n)` runs the
 * n-th timer's callback. `handles` says what `setTimeout` gives back: objects
 * with `unref` (as Node does), numbers (as a browser does), zero, or nothing.
 */
async function withStandInTimers(run, { handles = "objects" } = {}) {
  const log = [];
  const timers = [];
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
  const clock = {
    handles,
    fire(number) {
      const timer = timers[number - 1];
      log.push(`timer ${number} fires`);
      timer.fired = true;
      timer.callback();
    },
    waiting: () => timers.filter((timer) => !timer.cleared && !timer.fired).map((timer) => timer.number),
  };
  globalThis.setTimeout = (callback, delay) => {
    const timer = { number: timers.length + 1, callback, delay, cleared: false, fired: false };
    timers.push(timer);
    log.push(`timer ${timer.number} set for ${shown(delay)}`);
    if (clock.handles === "numbers") timer.handle = 1000 + timer.number;
    else if (clock.handles === "zero") timer.handle = 0;
    else if (clock.handles === "nothing") timer.handle = undefined;
    else {
      timer.handle = {
        unref() {
          log.push(`timer ${timer.number} unref`);
        },
      };
    }
    return timer.handle;
  };
  globalThis.clearTimeout = (handle) => {
    const timer = timers.findLast((one) => one.handle === handle);
    if (timer) timer.cleared = true;
    log.push(`timer ${timer ? timer.number : "unknown"} cleared`);
  };
  Date.now = () => NOW;
  try {
    return await run({ log, clock });
  } finally {
    globalThis.setTimeout = real.setTimeout;
    globalThis.clearTimeout = real.clearTimeout;
    Date.now = real.now;
  }
}

/**
 * A token provider, a client and a debug listener that write what they are
 * asked into `log`. `tokens` and `sends` say what each call answers, in turn
 * (the last one from then on): a value to resolve with, or a function to call.
 */
function standIns(log, { tokens = ["token"], sends = [undefined] } = {}) {
  const requests = [];
  const seen = { tokenCalls: 0, sendCalls: 0 };
  const tokenProvider = {
    getAccessToken() {
      const answer = tokens[Math.min(seen.tokenCalls, tokens.length - 1)];
      seen.tokenCalls += 1;
      log.push(`token asked (${seen.tokenCalls})`);
      return typeof answer === "function" ? answer() : Promise.resolve(answer);
    },
  };
  const client = {
    trackEvents(request, options) {
      const answer = sends[Math.min(seen.sendCalls, sends.length - 1)];
      seen.sendCalls += 1;
      requests.push({ request, options });
      log.push(`send ${seen.sendCalls}: ${request.events.map((event) => event.eventName).join(", ")}`);
      return typeof answer === "function" ? answer(request, options) : Promise.resolve(answer);
    },
  };
  const onDebug = (tag, payload) => {
    log.push({ debug: tag, payload });
  };
  return { tokenProvider, client, onDebug, requests, seen };
}

/** The names `count` events are tracked under: e1, e2, … */
function trackMany(buffer, count, from = 1) {
  for (let number = from; number < from + count; number += 1) buffer.track(`e${number}`, null, number);
}

export const scenarios = [
  // --- to-event-data.ts ---
  {
    name: "no properties give an empty record, a new one each time",
    run: ({ eventData }) => {
      const first = eventData.toEventData(undefined);
      const second = eventData.toEventData(undefined);
      return {
        answers: [undefined, null, false, 0, "", Number.NaN, {}].map((props) => ({ given: props, answer: eventData.toEventData(props) })),
        aNewOneEachTime: first !== second,
        aPlainObject: Object.getPrototypeOf(first) === Object.prototype,
        declaredParameters: eventData.toEventData.length,
      };
    },
  },
  {
    name: "a text, a number, a truth and a big whole number each become a value of their own kind",
    run: ({ eventData }) => {
      const out = eventData.toEventData({ name: "Simeon", seconds: 1.5, signedIn: true, bytes: 7n });
      return {
        out,
        keys: Object.keys(out),
        classes: Object.values(out).map((value) => value.constructor.name),
        allOfOneClass: new Set(Object.values(out).map((value) => value.constructor)).size === 1,
        // What each one is on the wire.
        bytes: Object.fromEntries(Object.entries(out).map(([key, value]) => [key, Buffer.from(value.toBinary()).toString("hex")])),
        json: Object.fromEntries(Object.entries(out).map(([key, value]) => [key, value.toJson()])),
      };
    },
  },
  {
    name: "every other kind of value is left out",
    run: ({ eventData }) => {
      const given = {
        kept: "yes",
        nothing: undefined,
        null: null,
        object: { a: 1 },
        list: [1, 2],
        function: () => 1,
        symbol: Symbol("s"),
        date: new Date(0),
        textObject: new String("boxed"),
        numberObject: new Number(5),
        truthObject: new Boolean(true),
        alsoKept: 0,
      };
      const out = eventData.toEventData(given);
      return { keys: Object.keys(out), out };
    },
  },
  {
    name: "edge values are kept as they are given",
    run: ({ eventData }) =>
      eventData.toEventData({
        emptyText: "",
        longText: "x".repeat(300),
        lineEnds: "a\nb\u0000c",
        zero: 0,
        minusZero: -0,
        notANumber: Number.NaN,
        infinity: Number.POSITIVE_INFINITY,
        minusInfinity: Number.NEGATIVE_INFINITY,
        largestSafe: Number.MAX_SAFE_INTEGER,
        beyondSafe: 2 ** 53,
        huge: 1e308,
        tiny: 5e-324,
        fraction: 0.1 + 0.2,
        no: false,
        bigZero: 0n,
        bigMinus: -1n,
        bigBeyondSixtyFourBits: 2n ** 64n,
      }),
  },
  {
    name: "keys come in the order of the properties: whole-number keys first, rising, then the others as written",
    run: ({ eventData }) => {
      const out = eventData.toEventData({ b: 1, a: 2, 10: "ten", 2: "two", "01": "not a whole-number key", "": "empty key", constructor: "own", toString: "own too", "with space": true });
      return { keys: Object.keys(out), own: ["constructor", "toString"].map((key) => Object.hasOwn(out, key)) };
    },
  },
  {
    name: "things that are not plain records: own listable properties are read, whatever the thing is",
    run: ({ eventData }) => {
      class Point {
        constructor() {
          this.x = 1;
          this.label = "p";
        }
        get computed() {
          return "on the class, not read";
        }
      }
      const withInherited = Object.create({ inherited: "not read" });
      withInherited.own = "read";
      const hidden = {};
      Object.defineProperty(hidden, "secret", { value: "not listable", enumerable: false });
      Object.defineProperty(hidden, "shown", { value: "listable", enumerable: true });
      const fn = () => {};
      fn.note = "on a function";
      return {
        aText: eventData.toEventData("ab"),
        aList: eventData.toEventData(["x", 1, null, true, [2]]),
        aNumber: eventData.toEventData(5),
        true: eventData.toEventData(true),
        aFunction: eventData.toEventData(fn),
        aMap: eventData.toEventData(new Map([["k", "v"]])),
        anInstance: eventData.toEventData(new Point()),
        inherited: eventData.toEventData(withInherited),
        notListable: eventData.toEventData(hidden),
        symbolKeys: eventData.toEventData({ [Symbol("s")]: "not read", plain: "read" }),
        noPrototype: eventData.toEventData(Object.assign(Object.create(null), { bare: 1 })),
        aSymbol: classThrown(() => eventData.toEventData(Symbol("s"))),
      };
    },
  },
  {
    name: "every property is read once, in order, before any value is made; one that throws stops it all",
    run: ({ eventData }) => {
      const log = [];
      const props = {
        get first() {
          log.push("first read");
          return "a";
        },
        get second() {
          log.push("second read");
          return 2;
        },
        get third() {
          log.push("third read");
          return {};
        },
      };
      const out = eventData.toEventData(props);
      const mine = new Error("cannot be read");
      let caught;
      try {
        eventData.toEventData({
          ok: 1,
          get broken() {
            throw mine;
          },
        });
      } catch (error) {
        caught = error;
      }
      // A property that takes a later one away while it is read: the later one is not read.
      const vanishing = {
        get first() {
          delete vanishing.second;
          return "a";
        },
        second: "gone before it is read",
        third: "still here",
      };
      return { log, keys: Object.keys(out), theSameError: caught === mine, vanishing: Object.keys(eventData.toEventData(vanishing)) };
    },
  },
  {
    name: "a property named __proto__ is not kept as a key: its value becomes what the record inherits from",
    run: ({ eventData }) => {
      const out = eventData.toEventData(JSON.parse('{"__proto__": "hidden", "a": 1}'));
      const skipped = eventData.toEventData(JSON.parse('{"__proto__": null, "a": 1}'));
      const inherited = Object.getPrototypeOf(out);
      return {
        keys: Object.keys(out),
        hasItAsItsOwn: Object.hasOwn(out, "__proto__"),
        inheritsFromAValue: inherited.constructor === out.a.constructor,
        thatValue: inherited.data,
        whenItsValueIsLeftOut: { keys: Object.keys(skipped), plain: Object.getPrototypeOf(skipped) === Object.prototype },
      };
    },
  },
  {
    name: "the record is made when asked: changing the properties afterwards changes nothing",
    run: ({ eventData }) => {
      const props = { a: "one" };
      const out = eventData.toEventData(props);
      props.a = "two";
      props.b = "new";
      const again = eventData.toEventData(props);
      return { out, again, differentValues: out.a !== again.a };
    },
  },

  // --- deferred-buffer.ts ---
  {
    name: "a deferred buffer keeps what it is tracked, in order, each with its name, properties and time",
    run: ({ deferred }) => {
      const buffer = new deferred.DeferredAnalyticsBuffer();
      const empty = [...buffer.getEvents()];
      const props = { screen: "home" };
      const answers = [buffer.track("first"), buffer.track("second", props), buffer.track("third", { n: 1 }, 123), buffer.track("fourth", undefined, 0)];
      const events = buffer.getEvents();
      return {
        empty,
        answers,
        events,
        keys: events.map((event) => Object.keys(event)),
        thePropertiesAreTheOnesGiven: events[1].props === props,
        declaredParameters: { track: buffer.track.length, flush: buffer.flush.length, getEvents: buffer.getEvents.length, clear: buffer.clear.length, constructor: deferred.DeferredAnalyticsBuffer.length },
      };
    },
  },
  {
    name: "a deferred buffer takes anything as a name, properties or time, and checks none of it",
    run: ({ deferred }) => {
      const buffer = new deferred.DeferredAnalyticsBuffer();
      buffer.track();
      buffer.track(5, "props", "time");
      buffer.track(null, null, null);
      buffer.track("", [], Number.NaN);
      buffer.track("extra", { a: 1 }, 1, "a fourth thing");
      return buffer.getEvents();
    },
  },
  {
    name: "the events list is the deferred buffer's own: the same one each time, and a change to it is a change to the buffer",
    run: ({ deferred }) => {
      const buffer = new deferred.DeferredAnalyticsBuffer();
      buffer.track("first");
      const list = buffer.getEvents();
      const sameList = list === buffer.getEvents();
      list.push({ eventName: "pushed from outside" });
      buffer.track("second");
      list.shift();
      return { sameList, stillTheSame: list === buffer.getEvents(), events: buffer.getEvents(), length: buffer.getEvents().length };
    },
  },
  {
    name: "clearing a deferred buffer starts a new list and leaves the earlier one as it was",
    run: ({ deferred }) => {
      const buffer = new deferred.DeferredAnalyticsBuffer();
      buffer.track("first");
      buffer.track("second");
      const before = buffer.getEvents();
      const answer = buffer.clear();
      const after = buffer.getEvents();
      buffer.track("third");
      const clearedTwice = [buffer.clear(), buffer.clear()];
      return { answer, before, aNewList: before !== after, afterTheNextEvent: after, clearedTwice, empty: buffer.getEvents(), yetAnotherList: buffer.getEvents() !== after };
    },
  },
  {
    name: "flushing a deferred buffer does nothing and resolves to nothing, whatever it is given",
    run: async ({ deferred }) => {
      const buffer = new deferred.DeferredAnalyticsBuffer();
      buffer.track("kept");
      const calls = [buffer.flush(1000), buffer.flush(), buffer.flush(-1), buffer.flush("soon")];
      return {
        promises: calls.map((call) => call instanceof Promise),
        aNewPromiseEachTime: calls[0] !== calls[1],
        endings: await Promise.all(calls.map(ending)),
        events: buffer.getEvents(),
      };
    },
  },
  {
    name: "two deferred buffers share nothing",
    run: ({ deferred }) => {
      const one = new deferred.DeferredAnalyticsBuffer();
      const two = new deferred.DeferredAnalyticsBuffer();
      one.track("only in one");
      return { one: one.getEvents(), two: two.getEvents(), differentLists: one.getEvents() !== two.getEvents() };
    },
  },

  // --- buffer.ts ---
  {
    name: "a new buffer does nothing by itself, and flushing it empty asks for no token and sets no timer",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider, onDebug } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug });
        const call = made.flush(1000);
        return {
          aPromise: call instanceof Promise,
          ended: await ending(call),
          again: await ending(made.flush()),
          log,
          declaredParameters: { track: made.track.length, flush: made.flush.length, constructor: buffer.AnalyticsBuffer.length },
        };
      }),
  },
  {
    name: "the first event sets one timer for the flush interval, 3000 ms unless told; later events set no other while it waits",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log, clock }) => {
        const { client, tokenProvider, onDebug } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug });
        const answers = [made.track("first", { a: 1 }, 1), made.track("second", null, 2), made.track("third", undefined, 3)];
        await settled();
        return { answers, log, waiting: clock.waiting() };
      }),
  },
  {
    name: "when the interval timer fires, a flush runs under its own timer, 2500 ms unless told, and the next event sets a new interval timer",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log, clock }) => {
        const { client, tokenProvider, onDebug } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug });
        made.track("first", null, 1);
        made.track("second", null, 2);
        clock.fire(1);
        log.push("back from the timer");
        await settled();
        log.push("all quiet");
        made.track("third", null, 3);
        made.track("fourth", null, 4);
        await settled();
        return { log, waiting: clock.waiting() };
      }),
  },
  {
    name: "the two waits given are used in place of 3000 and 2500; null and undefined mean the usual, anything else is passed on as it is",
    run: async ({ buffer }) => {
      const out = [];
      for (const given of [50, 0, -1, null, undefined, Number.NaN, "10", 3000.5]) {
        out.push({
          given,
          log: await withStandInTimers(async ({ log, clock }) => {
            const { client, tokenProvider } = standIns(log);
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider, flushIntervalMs: given, normalFlushTimeoutMs: given });
            made.track("event", null, 1);
            clock.fire(1);
            await settled();
            return log;
          }),
        });
      }
      return out;
    },
  },
  {
    name: "what is sent: one request holding the events in order, each with its name, its properties as typed values and its time",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider, onDebug, requests } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug });
        const props = { screen: "home", count: 3, first: true, bytes: 9n, left: null, nested: { no: 1 } };
        made.track("app.opened", props, 1_700_000_000_000);
        props.screen = "changed after tracking";
        made.track("app.closed", undefined, 1_700_000_000_500);
        made.track("", { only: "name is empty" }, 0);
        const ended = await ending(made.flush(900));
        const [{ request, options }] = requests;
        return {
          ended,
          log,
          timesSent: requests.length,
          request,
          requestClass: request.constructor.name,
          eventClasses: request.events.map((event) => event.constructor.name),
          valueClasses: Object.values(request.events[0].eventData).map((value) => value.constructor.name),
          onTheWire: Buffer.from(request.toBinary()).toString("hex"),
          asJson: request.toJson(),
          optionKeys: Object.keys(options),
          signalIsAnAbortSignal: options.signal instanceof AbortSignal,
          signalAborted: options.signal.aborted,
        };
      }),
  },
  {
    name: "an event's time: a number is used as it is, anything else means now; a number that is not whole is refused and nothing is kept",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider, requests } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
        const times = [0, -0, -5, 123, 2 ** 53 + 2, 1e21, undefined, null, "123", 5n, true, {}, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
        const tracked = times.map((time, at) => ({ given: time, threw: classThrown(() => made.track(`event ${at}`, null, time)) }));
        const leftOut = classThrown(() => made.track("no time given"));
        await made.flush(100);
        return { tracked, leftOut, sent: requests[0].request.events.map((event) => ({ name: event.eventName, time: event.timestamp })) };
      }),
  },
  {
    name: "a time that is refused is refused before the properties are read, and sets no timer",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
        const props = {
          get watched() {
            log.push("properties read");
            return 1;
          },
        };
        const refused = classThrown(() => made.track("bad time", props, 0.5));
        const afterRefusal = [...log];
        const mine = new Error("unreadable");
        let caught;
        try {
          made.track("bad properties", { get broken() { throw mine; } }, 1);
        } catch (error) {
          caught = error;
        }
        const afterBadProperties = [...log];
        made.track("good", props, 2);
        await settled();
        return { refused, afterRefusal, theSameError: caught === mine, afterBadProperties, log, flushed: await ending(made.flush(5)) };
      }),
  },
  {
    name: "the buffer limit is 200 unless told: the 199th event only waits, the 200th starts a flush at once, and the interval timer stays",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log, clock }) => {
        const { client, tokenProvider, requests } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
        trackMany(made, 199);
        const after199 = [...log];
        made.track("e200", null, 200);
        const rightAfterThe200th = [...log];
        await settled();
        const names = requests[0].request.events.map((event) => event.eventName);
        made.track("e201", null, 201);
        await settled();
        return { after199, rightAfterThe200th, sentCount: names.length, first: names[0], last: names.at(-1), log: log.slice(rightAfterThe200th.length).map((line) => (typeof line === "string" && line.startsWith("send 1:") ? "send 1: (200 names)" : line)), waiting: clock.waiting() };
      }),
  },
  {
    name: "limits given: an event at or above the limit starts a flush at once and sets no interval timer; below it, it only waits",
    run: async ({ buffer }) => {
      const out = [];
      for (const bufferLimit of [1, 2, 3, 4, 0, -1, null, undefined, Number.NaN, "2", Number.POSITIVE_INFINITY]) {
        out.push({
          bufferLimit,
          log: await withStandInTimers(async ({ log }) => {
            // No token: every flush gives up, and the events stay.
            const { client, tokenProvider } = standIns(log, { tokens: [null] });
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit });
            for (let number = 1; number <= 3; number += 1) {
              made.track(`e${number}`, null, number);
              log.push(`e${number} tracked`);
              await settled();
            }
            return log;
          }),
        });
      }
      return out;
    },
  },
  {
    name: "flush sets a timer for the time it is given and clears it when it is done",
    run: async ({ buffer }) => {
      const out = [];
      for (const timeout of [1500, 0, undefined, "soon"]) {
        out.push({
          timeout,
          log: await withStandInTimers(async ({ log }) => {
            const { client, tokenProvider } = standIns(log);
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit: 1000 });
            made.track("event", null, 1);
            log.push("flush called");
            const call = timeout === undefined ? made.flush() : made.flush(timeout);
            log.push("flush returned its promise");
            await call;
            log.push("flush resolved");
            return log;
          }),
        });
      }
      return out;
    },
  },
  {
    name: "without a token nothing is sent, the events stay, and onDebug is told why",
    run: async ({ buffer }) => {
      const out = [];
      for (const token of [null, undefined, "", 0, false, Number.NaN]) {
        out.push(
          await withStandInTimers(async ({ log }) => {
            const { client, tokenProvider, onDebug, requests } = standIns(log, { tokens: [token, "token at last"] });
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
            made.track("first", null, 1);
            made.track("second", null, 2);
            const first = await ending(made.flush(100));
            const debugKeys = log.filter((line) => typeof line === "object").map((line) => Object.keys(line.payload));
            const second = await ending(made.flush(100));
            return { token, first, debugKeys, second, log, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)) };
          }),
        );
      }
      return out;
    },
  },
  {
    name: "anything truthy counts as a token, and the token itself goes nowhere",
    run: async ({ buffer }) => {
      const out = [];
      for (const token of ["t", " ", 1, true, {}, []]) {
        out.push(
          await withStandInTimers(async ({ log }) => {
            const { client, tokenProvider, requests } = standIns(log, { tokens: [token] });
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
            made.track("event", null, 1);
            await made.flush(100);
            return { token, timesSent: requests.length, givenToTheClient: requests.map(({ request, options }) => [Object.keys(request), Object.keys(options)]) };
          }),
        );
      }
      return out;
    },
  },
  {
    name: "a token check that fails, by rejecting or by throwing, sends nothing and tells onDebug the error",
    run: async ({ buffer }) => {
      const out = {};
      const ways = {
        rejects: (error) => () => Promise.reject(error),
        throws: (error) => () => {
          throw error;
        },
        "rejects with nothing": () => () => Promise.reject(),
        "gives back something that is not a promise but is falsy": () => () => 0,
        "gives back a token that is not a promise": () => () => "plain token",
      };
      for (const [name, way] of Object.entries(ways)) {
        out[name] = await withStandInTimers(async ({ log }) => {
          const mine = new Error("sign-in is down");
          const { client, tokenProvider, onDebug } = standIns(log, { tokens: [way(mine), "token"] });
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
          made.track("first", null, 1);
          const first = await ending(made.flush(100));
          const debug = log.filter((line) => typeof line === "object");
          const told = debug.map((line) => ({ keys: Object.keys(line.payload), theSameError: line.payload.error === mine }));
          const second = await ending(made.flush(100));
          return { first, told, second, log };
        });
      }
      return out;
    },
  },
  {
    name: "a token check that outlasts the flush's timer is given up: nothing is sent, and a token that comes later is not used",
    run: async ({ buffer }) => {
      const out = {};
      for (const lateAnswer of ["resolves", "rejects", "never"]) {
        out[`the late check ${lateAnswer}`] = await withStandInTimers(async ({ log, clock }) => {
          const check = later();
          const { client, tokenProvider, onDebug } = standIns(log, { tokens: [() => check.promise, "token"] });
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
          made.track("first", null, 1);
          made.track("second", null, 2);
          let done = false;
          const call = made.flush(250).then(() => {
            done = true;
            log.push("flush resolved");
          });
          await settled();
          log.push(`still waiting: ${!done}`);
          clock.fire(2);
          await call;
          if (lateAnswer === "resolves") check.resolve("late token");
          if (lateAnswer === "rejects") check.reject(new Error("late failure"));
          await settled();
          log.push("after the late answer");
          await made.flush(250);
          return log;
        });
      }
      return out;
    },
  },
  {
    name: "a send that fails, by rejecting or by throwing, keeps the events, tells onDebug, and flush still resolves",
    run: async ({ buffer }) => {
      const out = {};
      for (const way of ["rejects", "throws"]) {
        out[way] = await withStandInTimers(async ({ log }) => {
          const mine = new Error("server said no");
          const failing = way === "rejects" ? () => Promise.reject(mine) : () => {
            throw mine;
          };
          const { client, tokenProvider, onDebug, requests } = standIns(log, { sends: [failing, undefined] });
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
          made.track("first", null, 1);
          made.track("second", null, 2);
          const first = await ending(made.flush(100));
          const debug = log.filter((line) => typeof line === "object");
          const told = debug.map((line) => ({ tag: line.debug, keys: Object.keys(line.payload), theSameError: line.payload.error === mine }));
          made.track("third", null, 3);
          const second = await ending(made.flush(100));
          return { first, told, second, log, theSameEventsAgain: requests[0].request.events[0] === requests[1].request.events[0], differentRequests: requests[0].request !== requests[1].request };
        });
      }
      return out;
    },
  },
  {
    name: "after a failed send, events beyond the limit are dropped, oldest first; a flush that never sent drops nothing",
    run: async ({ buffer }) => {
      const out = [];
      const table = [
        { bufferLimit: 3, events: 2 },
        { bufferLimit: 3, events: 3 },
        { bufferLimit: 3, events: 4 },
        { bufferLimit: 3, events: 7 },
        { bufferLimit: 1, events: 3 },
        { bufferLimit: 0, events: 2 },
        { bufferLimit: -1, events: 2 },
        { bufferLimit: Number.NaN, events: 4 },
      ];
      for (const { bufferLimit, events } of table) {
        out.push(
          await withStandInTimers(async ({ log }) => {
            // While no token is there the events pile up past the limit; then one send fails, and the next shows what is left.
            const { client, tokenProvider, requests, seen } = standIns(log, { tokens: [null], sends: [() => Promise.reject(new Error("down")), undefined] });
            const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit });
            trackMany(made, events);
            await settled();
            const tokenChecksWhilePilingUp = seen.tokenCalls;
            tokenProvider.getAccessToken = () => Promise.resolve("token");
            await made.flush(100);
            await made.flush(100);
            return { bufferLimit, events, tokenChecksWhilePilingUp, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)) };
          }),
        );
      }
      return out;
    },
  },
  {
    name: "the flush's timer firing during a send aborts the signal the client holds; what the client does then decides the rest",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log, clock }) => {
        const signals = [];
        const stopOnAbort = (request, options) =>
          new Promise((resolve, reject) => {
            signals.push(options.signal);
            options.signal.addEventListener("abort", () => {
              log.push("the client hears the abort");
              reject(new Error("aborted by the timeout"));
            });
          });
        const { client, tokenProvider, onDebug, requests } = standIns(log, { sends: [stopOnAbort, undefined] });
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
        made.track("first", null, 1);
        const call = made.flush(400);
        await settled();
        const abortedBefore = signals[0].aborted;
        clock.fire(2);
        const abortedAfter = signals[0].aborted;
        const ended = await ending(call);
        await made.flush(400);
        return { abortedBefore, abortedAfter, ended, log, aNewSignalEachSend: requests[0].options.signal !== requests[1].options.signal, secondSignalAborted: requests[1].options.signal.aborted };
      }),
  },
  {
    name: "events tracked while a send is under way stay for the next round, and the same flush goes round again for them",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        const trackDuring = (names) => () => {
          for (const name of names) made.track(name, null, 9);
          return Promise.resolve();
        };
        const { client, tokenProvider, onDebug } = standIns(log, { sends: [trackDuring(["third", "fourth"]), trackDuring(["fifth"]), undefined] });
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
        made.track("first", null, 1);
        made.track("second", null, 2);
        log.push("flush called");
        const ended = await ending(made.flush(700));
        log.push("flush resolved");
        return { ended, log };
      }),
  },
  {
    name: "events tracked during a send that fails stay behind the earlier ones, and the flush does not go round again",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        const failWhileTracking = () => {
          made.track("third", null, 3);
          return Promise.reject(new Error("down"));
        };
        const { client, tokenProvider } = standIns(log, { sends: [failWhileTracking, undefined] });
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit: 1000 });
        made.track("first", null, 1);
        made.track("second", null, 2);
        await made.flush(100);
        log.push("first flush resolved");
        await made.flush(100);
        return log;
      }),
  },
  {
    name: "a flush called while another is under way waits for it, and does nothing more when the buffer is then empty",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const sending = later();
        const { client, tokenProvider, seen } = standIns(log, { sends: [() => sending.promise] });
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit: 1000 });
        made.track("first", null, 1);
        const order = [];
        const one = made.flush(100).then(() => order.push("first flush"));
        const two = made.flush(200).then(() => order.push("second flush"));
        const three = made.flush(300).then(() => order.push("third flush"));
        await settled();
        log.push("the send is still under way");
        sending.resolve();
        await Promise.all([one, two, three]);
        return { log, order, tokenChecks: seen.tokenCalls };
      }),
  },
  {
    name: "when the first flush could not send, each waiting flush tries once more itself, one after the other",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const check = later();
        const { client, tokenProvider, onDebug, seen } = standIns(log, { tokens: [() => check.promise, null] });
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
        made.track("first", null, 1);
        const order = [];
        const one = made.flush(100).then(() => order.push("first flush"));
        const two = made.flush(200).then(() => order.push("second flush"));
        const three = made.flush(300).then(() => order.push("third flush"));
        await settled();
        check.resolve(null);
        await Promise.all([one, two, three]);
        return { log, order, tokenChecks: seen.tokenCalls };
      }),
  },
  {
    name: "each event tracked at or above the limit while a flush is under way adds one more flush waiting its turn",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const check = later();
        const { client, tokenProvider, seen, requests } = standIns(log, { tokens: [() => check.promise, null, null, "token"] });
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit: 2 });
        trackMany(made, 5);
        log.push("five events tracked");
        check.resolve(null);
        await settled();
        return { log, tokenChecks: seen.tokenCalls, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)) };
      }),
  },
  {
    name: "the interval timer left waiting when the limit started a flush fires later all the same, for whatever is there then",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log, clock }) => {
        const { client, tokenProvider } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, bufferLimit: 2, flushIntervalMs: 40, normalFlushTimeoutMs: 30 });
        made.track("first", null, 1);
        made.track("second", null, 2);
        await settled();
        log.push("the limit's flush is done; the interval timer still waits");
        made.track("third", null, 3);
        log.push("third tracked: no new timer while the old one waits");
        clock.fire(1);
        await settled();
        log.push("the old timer fired with one event");
        made.track("fourth", null, 4);
        made.track("fifth", null, 5);
        await settled();
        clock.fire(4);
        await settled();
        log.push("the newer timer fired with nothing left");
        return { log, waiting: clock.waiting() };
      }),
  },
  {
    name: "a token provider that flushes again from inside its own check starts a second flush within the first; the one whose token comes late finds nothing left and sends nothing",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        let inner;
        const lateToken = later();
        const tokenProvider = {
          calls: 0,
          getAccessToken() {
            this.calls += 1;
            log.push(`token asked (${this.calls})`);
            if (this.calls > 1) return Promise.resolve("token");
            log.push("the provider calls flush itself");
            inner = made.flush(50).then(() => log.push("the inner flush resolved"));
            log.push("back in the first check");
            return lateToken.promise;
          },
        };
        const { client, onDebug } = standIns(log);
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
        made.track("first", null, 1);
        made.track("second", null, 2);
        const outer = made.flush(900).then(() => log.push("the outer flush resolved"));
        await settled();
        log.push("the inner flush has sent everything; now the first check answers");
        lateToken.resolve("token");
        await outer;
        await inner;
        made.track("third", null, 3);
        await made.flush(70);
        return log;
      }),
  },
  {
    name: "after such a flush within a flush, a later flush waits for the outer one, which sends what was tracked meanwhile",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        let inner;
        const lateToken = later();
        const tokenProvider = {
          calls: 0,
          getAccessToken() {
            this.calls += 1;
            log.push(`token asked (${this.calls})`);
            if (this.calls > 1) return Promise.resolve("token");
            inner = made.flush(50).then(() => log.push("the inner flush resolved"));
            return lateToken.promise;
          },
        };
        const { client, onDebug } = standIns(log);
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
        made.track("first", null, 1);
        const outer = made.flush(900).then(() => log.push("the outer flush resolved"));
        await settled();
        made.track("late", null, 2);
        log.push("a third flush is called while the outer one still waits for its token");
        const third = made.flush(70).then(() => log.push("the third flush resolved"));
        await settled();
        log.push("the first check answers");
        lateToken.resolve("token");
        await Promise.all([outer, inner, third]);
        return log;
      }),
  },
  {
    name: "a token provider that tracks an event while the buffer is at its limit starts a second flush within the first, and both send the same events",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        const tokenProvider = {
          calls: 0,
          getAccessToken() {
            this.calls += 1;
            log.push(`token asked (${this.calls})`);
            if (this.calls === 1) made.track("token.asked", null, 2);
            return Promise.resolve("token");
          },
        };
        const { client, onDebug, requests } = standIns(log);
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1 });
        made.track("first", null, 1);
        log.push("first tracked");
        await settled();
        made.track("afterwards", null, 3);
        await settled();
        return { log, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)), theSameEventTwice: requests[0].request.events[0] === requests[1].request.events[0] };
      }),
  },
  {
    name: "onDebug that tracks an event when a send fails: the new event is counted when the oldest are dropped",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        let made;
        const { client, tokenProvider, requests } = standIns(log, { sends: [() => Promise.reject(new Error("down")), undefined] });
        const onDebug = (tag) => {
          log.push(`onDebug ${tag}`);
          if (tag === "analytics.flush.error") made.track("e3", null, 3);
        };
        made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 2 });
        made.track("e1", null, 1);
        made.track("e2", null, 2);
        await settled();
        return { log, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)) };
      }),
  },
  {
    name: "onDebug that throws while a flush gives up is told again, this time that the token check failed, with what it threw",
    run: async ({ buffer }) => {
      const out = {};
      for (const reason of ["no token", "the token check timed out"]) {
        out[reason] = await withStandInTimers(async ({ log, clock }) => {
          const mine = new Error("the listener broke");
          const told = [];
          const check = later();
          const { client, tokenProvider } = standIns(log, { tokens: [reason === "no token" ? null : () => check.promise] });
          const onDebug = (tag, payload) => {
            told.push({ tag, payload: { ...payload }, keys: Object.keys(payload), itsOwnError: payload.error === mine });
            if (told.length === 1) throw mine;
          };
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
          made.track("first", null, 1);
          const call = made.flush(100);
          if (reason !== "no token") {
            await settled();
            clock.fire(2);
          }
          return { ended: await ending(call), told: told.map(({ tag, keys, itsOwnError, payload }) => ({ tag, keys, itsOwnError, reason: payload.reason, count: payload.count })), log };
        });
      }
      return out;
    },
  },
  {
    name: "onDebug that throws every time makes flush reject with what it threw; a waiting flush is rejected too, and the buffer works again afterwards",
    run: async ({ buffer }) => {
      const out = {};
      const cases = {
        "when there is no token": { tokens: [null, "token"], sends: [undefined] },
        "when the token check fails": { tokens: [() => Promise.reject(new Error("down")), "token"], sends: [undefined] },
        "when the send fails": { tokens: ["token"], sends: [() => Promise.reject(new Error("down")), undefined] },
      };
      for (const [name, answers] of Object.entries(cases)) {
        out[name] = await withStandInTimers(async ({ log }) => {
          const mine = new Error("the listener always breaks");
          const { client, tokenProvider, requests } = standIns(log, answers);
          let breaking = true;
          const onDebug = (tag, payload) => {
            log.push(`onDebug ${tag}${payload.reason ? ` (${payload.reason})` : ""}`);
            if (breaking) throw mine;
          };
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug, bufferLimit: 1000 });
          made.track("first", null, 1);
          const first = made.flush(100);
          const waiting = made.flush(100);
          const endings = await Promise.all([ending(first), ending(waiting)]);
          log.push("both flushes ended");
          breaking = false;
          const afterwards = await ending(made.flush(100));
          return { rejectedWithItsError: endings.map((end) => end.rejected === mine), afterwards, log, sent: requests.map(({ request }) => request.events.map((event) => event.eventName)) };
        });
      }
      return out;
    },
  },
  {
    name: "without onDebug a flush that gives up or fails says nothing and still resolves",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider } = standIns(log, { tokens: [null, () => Promise.reject(new Error("down")), "token"], sends: [() => Promise.reject(new Error("down")), undefined] });
        const made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug: undefined });
        made.track("first", null, 1);
        const endings = [];
        for (let round = 1; round <= 4; round += 1) endings.push(await ending(made.flush(100)));
        const withNull = new buffer.AnalyticsBuffer({ client, tokenProvider: { getAccessToken: () => Promise.resolve(null) }, onDebug: null });
        withNull.track("first", null, 1);
        endings.push(await ending(withNull.flush(100)));
        return { endings, log };
      }),
  },
  {
    name: "the client, the token provider and onDebug are each called as the buffer holds them",
    run: ({ buffer }) =>
      withStandInTimers(async () => {
        const seen = {};
        const tokenProvider = {
          getAccessToken(...given) {
            seen.tokenProvider = { calledOnTheProvider: this === tokenProvider, given: given.length };
            return Promise.resolve("token");
          },
        };
        const client = {
          trackEvents(...given) {
            seen.client = { calledOnTheClient: this === client, given: given.length };
            return Promise.reject(new Error("down"));
          },
        };
        let made;
        const options = {
          client,
          tokenProvider,
          onDebug(...given) {
            seen.onDebug = { calledOnTheBuffer: this === made, calledOnTheOptions: this === options, given: given.length };
          },
        };
        made = new buffer.AnalyticsBuffer(options);
        made.track("first", null, 1);
        await made.flush(100);
        return seen;
      }),
  },
  {
    name: "the options are read once when the buffer is made; the client's and the provider's own methods are looked up at each call",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const { client, tokenProvider, onDebug } = standIns(log);
        const options = { client, tokenProvider, onDebug, bufferLimit: 1000, flushIntervalMs: 11, normalFlushTimeoutMs: 12 };
        const made = new buffer.AnalyticsBuffer(options);
        // Changing the options afterwards changes nothing.
        options.client = { trackEvents: () => log.push("the wrong client") };
        options.tokenProvider = { getAccessToken: () => log.push("the wrong provider") };
        options.flushIntervalMs = 99;
        options.bufferLimit = 1;
        made.track("first", null, 1);
        await made.flush(100);
        // Changing a method on the client the buffer holds is seen.
        client.trackEvents = (request) => {
          log.push(`the replaced method sends ${request.events.length}`);
          return Promise.resolve();
        };
        tokenProvider.getAccessToken = () => {
          log.push("the replaced method gives a token");
          return Promise.resolve("token");
        };
        made.track("second", null, 2);
        await made.flush(100);
        return log;
      }),
  },
  {
    name: "options that are missing or incomplete",
    run: async ({ buffer }) => {
      const noOptions = classThrown(() => new buffer.AnalyticsBuffer());
      const nullOptions = classThrown(() => new buffer.AnalyticsBuffer(null));
      const empty = await withStandInTimers(async ({ log }) => {
        const told = [];
        const made = new buffer.AnalyticsBuffer({ onDebug: (tag, payload) => told.push({ tag, keys: Object.keys(payload), reason: payload.reason, errorClass: payload.error?.constructor?.name, count: payload.count }) });
        const tracked = classThrown(() => made.track("first", null, 1));
        const ended = await ending(made.flush(100));
        return { tracked, ended, told, log };
      });
      const noClient = await withStandInTimers(async ({ log }) => {
        const told = [];
        const { tokenProvider } = standIns(log);
        const made = new buffer.AnalyticsBuffer({ tokenProvider, onDebug: (tag, payload) => told.push({ tag, keys: Object.keys(payload), errorClass: payload.error?.constructor?.name }) });
        made.track("first", null, 1);
        const ended = await ending(made.flush(100));
        return { ended, told, log };
      });
      return { noOptions, nullOptions, empty, noClient };
    },
  },
  {
    name: "timers that are numbers work as well; a timer of zero is forgotten, so every event sets another; no timer at all breaks tracking after the event is kept",
    run: async ({ buffer }) => {
      const numbers = await withStandInTimers(
        async ({ log, clock }) => {
          const { client, tokenProvider } = standIns(log);
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
          made.track("first", null, 1);
          made.track("second", null, 2);
          clock.fire(1);
          await settled();
          return log;
        },
        { handles: "numbers" },
      );
      const zero = await withStandInTimers(
        async ({ log, clock }) => {
          const { client, tokenProvider } = standIns(log);
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
          made.track("first", null, 1);
          made.track("second", null, 2);
          made.track("third", null, 3);
          clock.fire(2);
          await settled();
          return log;
        },
        { handles: "zero" },
      );
      const nothing = await withStandInTimers(
        async ({ log, clock }) => {
          const { client, tokenProvider } = standIns(log);
          const made = new buffer.AnalyticsBuffer({ client, tokenProvider });
          const tracked = classThrown(() => made.track("first", null, 1));
          const flushed = await ending(made.flush(100));
          const flushRejectedWith = flushed.rejected?.constructor?.name ?? "not rejected";
          clock.handles = "objects";
          await made.flush(100);
          return { tracked, flushRejectedWith, log };
        },
        { handles: "nothing" },
      );
      return { numbers, zero, nothing };
    },
  },
  {
    name: "two buffers share nothing",
    run: ({ buffer }) =>
      withStandInTimers(async ({ log }) => {
        const first = standIns(log);
        const second = standIns(log);
        const one = new buffer.AnalyticsBuffer({ client: first.client, tokenProvider: first.tokenProvider });
        const two = new buffer.AnalyticsBuffer({ client: second.client, tokenProvider: second.tokenProvider });
        one.track("only in one", null, 1);
        await two.flush(100);
        await one.flush(100);
        return { one: first.requests.length, two: second.requests.length, log };
      }),
  },
  {
    name: "how many turns of the microtask queue each step of a flush takes",
    run: async ({ buffer }) => {
      /** Notes each turn of the microtask queue, so that what happens between two turns is seen in its place. */
      const countTurns = async (log, turns) => {
        for (let turn = 1; turn <= turns; turn += 1) {
          await null;
          log.push(`turn ${turn}`);
        }
      };
      const paths = {
        "a flush that sends": {},
        "a flush with no token": { tokens: [null] },
        "a flush whose token check rejects": { tokens: [() => Promise.reject(new Error("down"))] },
        "a flush whose send rejects": { sends: [() => Promise.reject(new Error("down"))] },
        "a flush whose send throws": { sends: [() => { throw new Error("down"); }] },
        "a flush that goes round twice": { twice: true },
        "two flushes, the second waiting": { second: true },
        "two flushes with no token, the second trying again": { tokens: [null], second: true },
      };
      const out = {};
      for (const [name, { tokens, sends, twice, second }] of Object.entries(paths)) {
        out[name] = await withStandInTimers(async ({ log }) => {
          let made;
          const once = () => {
            made.track("tracked during the send", null, 2);
            return Promise.resolve();
          };
          const { client, tokenProvider, onDebug } = standIns(log, { tokens, sends: twice ? [once, undefined] : sends });
          made = new buffer.AnalyticsBuffer({ client, tokenProvider, onDebug: (tag, payload) => log.push(`onDebug ${tag}${payload.reason ? ` (${payload.reason})` : ""}`), bufferLimit: 1000 });
          made.track("first", null, 1);
          log.splice(0);
          const calls = [made.flush(100).then(() => log.push("flush resolved"))];
          if (second) calls.push(made.flush(100).then(() => log.push("second flush resolved")));
          log.push("flush called");
          await countTurns(log, 16);
          await Promise.all(calls);
          return log;
        });
      }
      return out;
    },
  },
];
