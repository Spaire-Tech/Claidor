/**
 * What the host is started with and timed by: the extensions (declared,
 * ordered by their peers, started one after another, stopped in reverse),
 * the host's events by topic, and the timing policies (debounce, retry,
 * idle watchdog, polling, expiry, deadline) with the clock they run on.
 *
 * Nothing here waits on the machine: the policies are given a clock that
 * only moves when a scenario says so, and where the part goes to the
 * machine's own timers they are replaced for the length of the scenario.
 * One scenario uses the real timers, for a few milliseconds.
 */
import { getEventListeners } from "node:events";

export const part = "internal";
export const modules = {
  extensions: "source/internal/host-extensions.ts",
  scheduling: "source/internal/scheduling.ts",
};

/** Lets everything already promised finish: one whole turn of the event loop, no clock involved. */
const drained = () => new Promise((resolve) => setImmediate(resolve));

/** How many turns of the promise queue pass before a promise is kept or broken. */
async function turnsUntil(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  return turnsUntilTrue(() => done);
}

/** How many turns of the promise queue pass before `check` holds. */
async function turnsUntilTrue(check) {
  for (let turns = 0; turns <= 200; turns += 1) {
    if (check()) return turns;
    await null;
  }
  return "never";
}

/** The one TypeError the part words itself; every other is the runtime's. */
const OWN_TYPE_ERRORS = new Set(["name must not be empty"]);

/** A failure as it is kept. The words of one the runtime raises are the runtime's, and differ between its versions: only its class is kept. */
function told(thrown) {
  if (thrown instanceof TypeError && !OWN_TYPE_ERRORS.has(thrown.message)) return { raisedByTheRuntime: "TypeError" };
  return thrown;
}

/** What a call did at once: handed something back, or threw. */
function tried(run) {
  try {
    return { gave: run() };
  } catch (thrown) {
    return { threw: told(thrown) };
  }
}

/** What a call did: threw at once, handed something back at once, or made a promise that was then kept or broken. */
async function outcomeOf(run) {
  let handed;
  try {
    handed = run();
  } catch (thrown) {
    return { threwAtOnce: told(thrown) };
  }
  if (!(handed instanceof Promise)) return { handedBackAtOnce: handed };
  try {
    return { kept: await handed };
  } catch (thrown) {
    return { broken: told(thrown) };
  }
}

/** The class a value was made by, to tell an Error named "AbortError" from the runtime's own DOMException. */
const classOf = (value) => (value !== null && typeof value === "object" ? Object.getPrototypeOf(value)?.constructor?.name ?? "(none)" : typeof value);

/** How each own field of an error but its trace is held: its value and whether it can be written over, listed and removed. */
function held(error) {
  const out = {};
  for (const [name, { value, writable, enumerable, configurable }] of Object.entries(Object.getOwnPropertyDescriptors(error))) {
    if (name !== "stack") out[name] = { value, writable, enumerable, configurable };
  }
  return out;
}

/** An error with what the usual record leaves out: how it prints, its class, and its own fields as they are held and listed. */
function shown(error) {
  return { kept: error, printed: String(error), class: classOf(error), held: held(error), listed: Object.keys(error) };
}

/** What kind of thing each field of an object is, in the object's own order: the shape of what the part hands back, without the inner names of its functions. */
const shapeOf = (value) => Object.fromEntries(Object.keys(value).map((key) => [key, typeof value[key] === "function" ? `function taking ${value[key].length}` : classOf(value[key])]));

/** How many listeners wait for a real signal's abort. */
const listening = (signal) => getEventListeners(signal, "abort").length;

/**
 * A clock that only moves when told. Everything asked of it is written in
 * the log in the order it was asked: each timer set (numbered from 1) with
 * its delay, each one dropped. `run` runs a waiting timer as a clock does
 * when its time has come; `runAnyway` runs a timer's callback whatever
 * became of it, as a clock that forgot a drop would.
 */
function manualClock(log) {
  const timers = [];
  const clock = {
    now() {
      log.push("clock: asked the time");
      return 0;
    },
    monotonicNow() {
      log.push("clock: asked the steady time");
      return 0;
    },
    schedule(...asked) {
      const [delayMs, callback] = asked;
      const timer = { callback, state: "waiting" };
      const number = timers.push(timer);
      const oddly = [asked.length === 2 ? null : `asked with ${asked.length} things`, this === clock ? null : "not asked as the clock's own", typeof callback === "function" ? null : "without a callback"].filter(Boolean);
      log.push(`clock: timer ${number} set for ${Object.is(delayMs, -0) ? "-0" : String(delayMs)}${oddly.length === 0 ? "" : ` (${oddly.join(", ")})`}`);
      const handle = {
        dispose(...extra) {
          const odd = [timer.state === "waiting" ? null : `though it had ${timer.state === "ran" ? "run" : "been dropped"}`, this === handle ? null : "not asked as the timer's own", extra.length === 0 ? null : `asked with ${extra.length} things`].filter(Boolean);
          log.push(`clock: timer ${number} dropped${odd.length === 0 ? "" : ` (${odd.join(", ")})`}`);
          if (timer.state === "waiting") timer.state = "dropped";
        },
      };
      return handle;
    },
  };
  return {
    clock,
    timers,
    run(number) {
      const timer = timers[number - 1];
      if (timer === undefined || timer.state !== "waiting") {
        log.push(`clock: timer ${number} is not waiting`);
        return undefined;
      }
      timer.state = "ran";
      log.push(`clock: timer ${number} runs`);
      return timer.callback();
    },
    runAnyway(number) {
      log.push(`clock: timer ${number} runs anyway`);
      return timers[number - 1].callback();
    },
    waiting: () => timers.flatMap((timer, at) => (timer.state === "waiting" ? [at + 1] : [])),
  };
}

/**
 * A clock that runs every timer at once, inside the call that sets it, as
 * a clock made for "no waiting" might. A timer of it that is dropped has
 * always run already, and the log says so.
 */
function hastyClock(log) {
  let timers = 0;
  return {
    now: () => 0,
    monotonicNow: () => 0,
    schedule(delayMs, callback) {
      timers += 1;
      const number = timers;
      log.push(`clock: timer ${number} set for ${delayMs} and run at once`);
      callback();
      log.push(`clock: timer ${number} has run; the call that set it returns`);
      return { dispose() { log.push(`clock: timer ${number} dropped, though it had run`); } };
    },
  };
}

/**
 * The machine's own timer functions replaced, for the length of `run`, by
 * ones that only note what they are asked. A timer's handle is an object
 * that can be unref'd, as Node's is, or a plain number, as a browser's is.
 */
async function withTimers(log, run, { handles = "objects" } = {}) {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const timers = [];
  globalThis.setTimeout = function (...asked) {
    const [callback, delay] = asked;
    const timer = { callback };
    const number = timers.push(timer);
    log.push(`setTimeout: timer ${number} for ${Object.is(delay, -0) ? "-0" : String(delay)}${asked.length === 2 ? "" : ` (asked with ${asked.length} things)`}`);
    timer.handle = handles === "numbers" ? 1000 + number : { unref(...extra) { log.push(`timer ${number}: unref${extra.length === 0 && this === timer.handle ? "" : " (asked oddly)"}`); return this; } };
    return timer.handle;
  };
  globalThis.clearTimeout = function (...asked) {
    const at = timers.findIndex((timer) => timer.handle === asked[0]);
    log.push(`clearTimeout: ${at === -1 ? "something that is no timer of ours" : `timer ${at + 1}`}${asked.length === 1 ? "" : ` (asked with ${asked.length} things)`}`);
  };
  try {
    return await run({
      timers,
      /** Runs a timer's callback, as the machine does when the time has come (and as it would not after a clearTimeout: that is the scenario's to respect). */
      fire(number) {
        log.push(`timer ${number} fires`);
        return timers[number - 1].callback();
      },
    });
  } finally {
    globalThis.setTimeout = real.setTimeout;
    globalThis.clearTimeout = real.clearTimeout;
  }
}

/**
 * A signal that notes what is asked of it, and aborts when told. A
 * listener asked for once is forgotten when it has been called, as a real
 * signal forgets it.
 */
function notingSignal(log, { aborted = false, reason } = {}) {
  const listeners = [];
  const signal = {
    aborted,
    reason,
    addEventListener(...asked) {
      const [type, listener, options] = asked;
      const number = listeners.push({ listener, live: true, once: options?.once === true });
      log.push(`signal: listener ${number} added for "${type}" with ${JSON.stringify(options)}${asked.length === 3 ? "" : ` (asked with ${asked.length} things)`}`);
    },
    removeEventListener(...asked) {
      const [type, listener] = asked;
      const at = listeners.findIndex((entry) => entry.listener === listener);
      log.push(`signal: ${at === -1 ? "a listener it never had" : `listener ${at + 1}`} removed for "${type}"${at !== -1 && !listeners[at].live ? " (it was gone already)" : ""}${asked.length === 2 ? "" : ` (asked with ${asked.length} things)`}`);
      if (at !== -1) listeners[at].live = false;
    },
  };
  return {
    signal,
    abort(why) {
      signal.aborted = true;
      signal.reason = why;
      log.push("signal: aborts");
      listeners.forEach((entry, at) => {
        if (!entry.live) return;
        if (entry.once) entry.live = false;
        log.push(`signal: listener ${at + 1} is told`);
        entry.listener();
      });
    },
    live: () => listeners.filter((entry) => entry.live).length,
  };
}

/**
 * The promises broken with nobody listening while `run` runs. The test
 * runner's own watch for them is put aside for that long, and put back.
 */
async function unheardDuring(run) {
  const kept = process.listeners("unhandledRejection");
  const unheard = [];
  const note = (reason) => { unheard.push(reason); };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", note);
  try {
    const result = await run();
    await drained();
    await drained();
    return { result, unheard };
  } finally {
    process.off("unhandledRejection", note);
    for (const listener of kept) process.on("unhandledRejection", listener);
  }
}

/** An object whose fields note each time they are read, under `label`. */
function notingReads(log, label, fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(out, key, { enumerable: true, get() { log.push(`${label}.${key} read`); return value; } });
  }
  return out;
}

/** A plain extension that notes its start in the log and answers with `api`. */
function extension(log, id, dependencies, api = `${id}'s api`) {
  return {
    id,
    dependencies,
    start(context) {
      log.push(`${id} starts with ${JSON.stringify(context.deps)}`);
      return api;
    },
  };
}

/** A list of extensions from a table of ids and their peers. */
const graph = (table) => Object.entries(table).map(([id, dependencies]) => ({ id, dependencies }));

/** Options that are right for each policy, to change one thing at a time. */
const RIGHT = {
  debounce: { name: "p", delayMs: 10 },
  retry: { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 },
  watchdog: { name: "p", idleMs: 10 },
  polling: { name: "p", intervalMs: 10 },
  expiry: { name: "p", ttlMs: 10 },
  deadline: { name: "p", timeoutMs: 10 },
};

/** Each policy's maker over a given clock, its maker over the machine's clock where it has one, and the name of its number. */
const makers = (scheduling) => ({
  debounce: { make: scheduling.createDebouncePolicy, real: scheduling.createRealDebouncePolicy, number: "delayMs" },
  retry: { make: scheduling.createRetryPolicy, real: scheduling.createRealRetryPolicy, number: "initialDelayMs" },
  watchdog: { make: scheduling.createIdleWatchdogPolicy, real: scheduling.createRealIdleWatchdogPolicy, number: "idleMs" },
  polling: { make: scheduling.createPollingPolicy, real: scheduling.createRealPollingPolicy, number: "intervalMs" },
  expiry: { make: scheduling.createExpiryPolicy, real: scheduling.createRealExpiryPolicy, number: "ttlMs" },
  deadline: { make: scheduling.createDeadlinePolicy, real: undefined, number: "timeoutMs" },
});

/** Whether two answers are kept the same way (an error with its class and words, not as the empty object JSON makes of it). */
const keptAlike = (tools, one, other) => JSON.stringify(tools.plain(one)) === JSON.stringify(tools.plain(other));

/** A policy as it is kept: its name and the shape of the rest. */
const policyShown = (policy) => ({ name: policy.name, shape: shapeOf(policy), frozen: Object.isFrozen(policy) });

export const scenarios = [
  // ───────────────────────────── declaring an extension ─────────────────────────────
  {
    name: "a declaration is its options with the kind in front, frozen, and its peers copied into a frozen list",
    run: ({ extensions }) => {
      const peers = ["b", "c"];
      const start = () => "api";
      const options = { id: "a", dependencies: peers, start };
      const declaration = extensions.defineHostExtension(options);
      peers.push("added after");
      return {
        parameters: extensions.defineHostExtension.length,
        keys: Object.keys(declaration),
        kind: declaration.kind,
        id: declaration.id,
        dependencies: declaration.dependencies,
        sameStart: declaration.start === start,
        frozen: Object.isFrozen(declaration),
        peersFrozen: Object.isFrozen(declaration.dependencies),
        peersAreACopy: declaration.dependencies !== peers,
        peersAreAnArray: Array.isArray(declaration.dependencies),
        aPlainObject: Object.getPrototypeOf(declaration) === Object.prototype,
        optionsLeftAlone: { keys: Object.keys(options), frozen: Object.isFrozen(options), peersFrozen: Object.isFrozen(peers), samePeers: options.dependencies === peers, peers },
      };
    },
  },
  {
    name: "a declaration keeps the order and the extras of its options, and options that name a kind replace it",
    run: ({ extensions }) => [
      { dependencies: ["x"], start: null, id: "the id comes last" },
      { id: "a", dependencies: [], start: 1, extra: "kept", another: { deep: true } },
      { id: "a", dependencies: [], kind: "something else" },
      { kind: "named first", id: "a", dependencies: ["p"] },
      { dependencies: [] },
      { id: "", dependencies: [], 2: "two", 1: "one" },
      { id: 7, dependencies: [], start: undefined },
    ].map((options) => {
      const declaration = extensions.defineHostExtension(options);
      return { keys: Object.keys(declaration), is: declaration };
    }),
  },
  {
    name: "options carry over what they own and show, symbols included; what they inherit or hide stays behind, except the peers, which are read wherever they are",
    run: ({ extensions }) => {
      const mark = Symbol("mark");
      const options = Object.create({ inherited: "left behind", dependencies: ["from the prototype"] });
      options.id = "a";
      options[mark] = "carried";
      Object.defineProperty(options, "hidden", { value: "left behind", enumerable: false });
      const declaration = extensions.defineHostExtension(options);
      return {
        keys: Object.keys(declaration),
        dependencies: declaration.dependencies,
        symbol: declaration[mark],
        inherited: "inherited" in declaration,
        hidden: "hidden" in declaration,
      };
    },
  },
  {
    name: "peers may be any list that can be walked: a set, a text, a generator, a list with holes",
    run: ({ extensions }) => [
      new Set(["b", "a", "b"]),
      "abc",
      (function* () { yield "one"; yield "two"; })(),
      [],
      ["twice", "twice"],
      [1, null, undefined, { not: "a text" }],
      new Array(2),
    ].map((dependencies) => {
      const declaration = extensions.defineHostExtension({ id: "a", dependencies });
      return { peers: declaration.dependencies, anArray: Array.isArray(declaration.dependencies), frozen: Object.isFrozen(declaration.dependencies), length: declaration.dependencies.length };
    }),
  },
  {
    name: "the options are read once whole, in their order, then the peers once more, and those are the ones walked",
    run: ({ extensions }) => {
      const log = [];
      const peers = (label) => ({ [Symbol.iterator]() { log.push(`${label} walked`); return ["x", "y"][Symbol.iterator](); } });
      let reads = 0;
      const options = {};
      Object.defineProperty(options, "id", { enumerable: true, get() { log.push("id read"); return "a"; } });
      Object.defineProperty(options, "dependencies", { enumerable: true, get() { reads += 1; log.push(`dependencies read (${reads})`); return peers(`the peers of read ${reads}`); } });
      Object.defineProperty(options, "start", { enumerable: true, get() { log.push("start read"); return null; } });
      Object.defineProperty(options, "extra", { enumerable: true, get() { log.push("extra read"); return 1; } });
      const declaration = extensions.defineHostExtension(options);
      return { log, keys: Object.keys(declaration), dependencies: declaration.dependencies };
    },
  },
  {
    name: "options with no peers that can be walked are refused by the runtime, whatever else they hold",
    run: ({ extensions }) => [
      [],
      [undefined],
      [null],
      [{}],
      [{ id: "a" }],
      [{ id: "a", dependencies: null }],
      [{ id: "a", dependencies: undefined }],
      [{ id: "a", dependencies: 5 }],
      [{ id: "a", dependencies: {} }],
      [7],
      ["a text"],
    ].map((given) => tried(() => extensions.defineHostExtension(...given))),
  },
  {
    name: "every call makes a declaration of its own, and a declaration can be declared again",
    run: ({ extensions }) => {
      const options = { id: "a", dependencies: ["b"], start: null };
      const first = extensions.defineHostExtension(options);
      const second = extensions.defineHostExtension(options);
      const again = extensions.defineHostExtension(first);
      return {
        differentObjects: first !== second,
        differentPeerLists: first.dependencies !== second.dependencies,
        first,
        second,
        again: { keys: Object.keys(again), is: again, itsOwnObject: again !== first, itsOwnPeers: again.dependencies !== first.dependencies, frozen: Object.isFrozen(again) },
      };
    },
  },

  // ───────────────────────────── the host's events ─────────────────────────────
  {
    name: "an event reaches every handler of its topic in the order they subscribed, with the payload itself and nothing else",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: () => log.push("a failure was reported") });
      const payload = { id: 7 };
      const handler = (label) => function (...given) {
        log.push(`${label}: ${given.length} thing, ${given[0] === payload ? "the payload itself" : JSON.stringify(given[0])}, ${this === undefined ? "no this" : "a this"}`);
        return `${label}'s answer is dropped`;
      };
      bus.on("saved", handler("first"));
      bus.on("closed", handler("another topic"));
      bus.on("saved", handler("second"));
      bus.on("saved", handler("third"));
      const emitted = bus.emit("saved", payload);
      log.push("emit has returned");
      const answer = await emitted;
      const other = await bus.emit("closed", "a text");
      return {
        made: { parameters: extensions.createHostEvents.length, shape: shapeOf(bus), frozen: Object.isFrozen(bus), aPlainObject: Object.getPrototypeOf(bus) === Object.prototype },
        log,
        aPromise: emitted instanceof Promise,
        answer,
        other,
      };
    },
  },
  {
    name: "an event nobody listens to, or whose listeners have all left, does nothing and reads none of its options",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents(notingReads(log, "options", { onHandlerFailure: () => log.push("a failure was reported") }));
      const how = () => notingReads(log, "emit options", { failureMode: "reject" });
      const never = await outcomeOf(() => bus.emit("never heard of", 1, how()));
      const leave = bus.on("left", () => { log.push("the handler that left runs"); throw new Error("never thrown"); });
      leave();
      const left = await outcomeOf(() => bus.emit("left", 1, how()));
      return { never, left, log };
    },
  },
  {
    name: "a handler subscribed twice is called once and is gone at the first unsubscribe; one that comes back goes to the end",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: () => log.push("a failure was reported") });
      const a = () => { log.push("a"); };
      const b = () => { log.push("b"); };
      const leaveOnce = bus.on("t", a);
      const leaveTwice = bus.on("t", a);
      const leaveB = bus.on("t", b);
      await bus.emit("t");
      log.push("— one of a's two unsubscribes is called —");
      const handed = leaveOnce();
      await bus.emit("t");
      log.push("— a's other unsubscribe, then the first again: nothing left to do —");
      leaveTwice();
      leaveOnce();
      await bus.emit("t");
      log.push("— a subscribes again —");
      bus.on("t", a);
      await bus.emit("t");
      log.push("— an unsubscribe from a's earlier time is called: a is gone again —");
      leaveTwice();
      await bus.emit("t");
      log.push("— a subscribes once more, and b leaves —");
      bus.on("t", a);
      leaveB();
      await bus.emit("t");
      log.push("— a leaves by a new unsubscribe: the topic is empty —");
      bus.on("t", a)();
      log.push(`an event for the empty topic handed back ${await bus.emit("t")}`);
      return { log, unsubscribeHandsBack: handed, differentUnsubscribes: leaveOnce !== leaveTwice, unsubscribe: `function taking ${leaveOnce.length}` };
    },
  },
  {
    name: "handlers that fail are reported one by one, in their order, once every handler has finished, and the event still succeeds",
    run: async ({ extensions }) => {
      const log = [];
      const options = {
        onHandlerFailure(...given) {
          log.push({ reported: given, asTheOptionsOwn: this === options });
          return "what the reporter hands back is dropped";
        },
      };
      const bus = extensions.createHostEvents(options);
      const atOnce = new Error("thrown at once");
      const later = new RangeError("rejected later");
      bus.on("saved", () => { log.push("handler 1 runs"); throw atOnce; });
      bus.on("saved", async () => { log.push("handler 2 runs"); await null; await null; await null; log.push("handler 2 finishes"); return "fine"; });
      bus.on("saved", async () => { log.push("handler 3 runs"); await null; throw later; });
      bus.on("saved", () => { log.push("handler 4 runs"); return Promise.reject("a text, not an error"); });
      bus.on("saved", () => { log.push("handler 5 runs"); return Promise.reject(undefined); });
      bus.on("saved", () => { log.push("handler 6 runs"); return { then(resolve, reject) { reject(null); } }; });
      bus.on("saved", () => { log.push("handler 7 runs"); return "fine"; });
      const emitted = bus.emit("saved", { id: 7 });
      log.push("emit has returned");
      const answer = await outcomeOf(() => emitted);
      return { log, answer };
    },
  },
  {
    name: "asked to reject, the event fails with the first handler's failure, after every handler has finished and every failure is reported",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: (topic, error) => log.push(`reported for ${topic}: ${String(error)}`) });
      const first = new Error("the first failure");
      bus.on("saved", () => "fine");
      bus.on("saved", async () => { await null; await null; throw first; });
      bus.on("saved", () => { throw new Error("thrown sooner, but subscribed later"); });
      const answer = await outcomeOf(() => bus.emit("saved", 1, { failureMode: "reject" }));
      return { log, answer, theFirstItself: answer.broken === first };
    },
  },
  {
    name: "only the word \"reject\" makes an event fail, and a first failure that is nothing at all still fails it",
    run: async ({ extensions }) => {
      const bus = extensions.createHostEvents({ onHandlerFailure() {} });
      bus.on("fails", () => { throw new Error("failed"); });
      bus.on("fails with nothing", () => Promise.reject(undefined));
      bus.on("fails with nothing", () => Promise.reject(new Error("the second failure is not the one")));
      bus.on("fails with null", () => Promise.reject(null));
      bus.on("fine", () => "fine");
      const modes = [undefined, null, {}, { failureMode: undefined }, { failureMode: "resolve" }, { failureMode: "REJECT" }, { failureMode: true }, { failureMode: ["reject"] }, "reject", { failureMode: "reject" }];
      const byMode = [];
      for (const mode of modes) byMode.push([mode, await outcomeOf(() => bus.emit("fails", 1, mode))]);
      return {
        byMode,
        nothing: await outcomeOf(() => bus.emit("fails with nothing", 1, { failureMode: "reject" })),
        null: await outcomeOf(() => bus.emit("fails with null", 1, { failureMode: "reject" })),
        fine: await outcomeOf(() => bus.emit("fine", 1, { failureMode: "reject" })),
      };
    },
  },
  {
    name: "how an event is to fail is read once for each failure, after that failure is reported, and not at all when nothing fails",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: (topic, error) => log.push(`reported: ${error.message}`) });
      bus.on("two fail", () => { throw new Error("one"); });
      bus.on("two fail", () => "fine");
      bus.on("two fail", () => { throw new Error("two"); });
      bus.on("none fails", () => "fine");
      const twoFail = await outcomeOf(() => bus.emit("two fail", 1, notingReads(log, "emit options", { failureMode: "reject" })));
      log.push("— an event where nothing fails —");
      const noneFails = await outcomeOf(() => bus.emit("none fails", 1, notingReads(log, "emit options", { failureMode: "reject" })));
      return { log, twoFail, noneFails };
    },
  },
  {
    name: "a handler that subscribes or unsubscribes during an event changes the next event, not this one",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: () => log.push("a failure was reported") });
      const late = () => { log.push("the late one runs"); };
      let leaveLast;
      bus.on("t", () => {
        log.push("the first runs: it lets the last one go and brings a late one in");
        leaveLast();
        bus.on("t", late);
      });
      leaveLast = bus.on("t", () => { log.push("the last one runs, though it was let go"); });
      await bus.emit("t");
      log.push("— the same event again —");
      await bus.emit("t");
      return log;
    },
  },
  {
    name: "when reporting a failure itself fails, the event fails with that, whatever was asked, and the failures after it are never reported",
    run: async ({ extensions }) => {
      const log = [];
      const reporterFails = new Error("the reporter failed");
      const bus = extensions.createHostEvents({
        onHandlerFailure(topic, error) {
          log.push(`asked to report: ${error.message}`);
          if (error.message === "two") throw reporterFails;
        },
      });
      bus.on("t", () => { throw new Error("one"); });
      bus.on("t", () => { throw new Error("two"); });
      bus.on("t", () => { throw new Error("three"); });
      const quietly = await outcomeOf(() => bus.emit("t", 1));
      const asked = await outcomeOf(() => bus.emit("t", 1, { failureMode: "reject" }));
      return { log, quietly, asked, same: quietly.broken === reporterFails && asked.broken === reporterFails };
    },
  },
  {
    name: "the reporter is looked up on the options at each failure: one put there later is used, and events made with none fail only once a handler does",
    run: async ({ extensions }) => {
      const log = [];
      const options = { onHandlerFailure: () => log.push("the first reporter") };
      const bus = extensions.createHostEvents(options);
      bus.on("fails", () => { throw new Error("failed"); });
      await bus.emit("fails");
      options.onHandlerFailure = () => log.push("the reporter put there later");
      await bus.emit("fails");
      const without = [];
      for (const given of [[], [undefined], [null], [{}], [{ onHandlerFailure: "not a function" }]]) {
        const made = tried(() => extensions.createHostEvents(...given));
        if (made.threw) { without.push({ made }); continue; }
        made.gave.on("fine", () => "fine");
        made.gave.on("fails", () => { throw new Error("failed"); });
        without.push({ made: "made", fine: await outcomeOf(() => made.gave.emit("fine")), fails: await outcomeOf(() => made.gave.emit("fails")), failsAsked: await outcomeOf(() => made.gave.emit("fails", 1, { failureMode: "reject" })) });
      }
      return { log, without };
    },
  },
  {
    name: "topics are told apart as a map tells its keys apart, and two sets of events share nothing",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure() {} });
      const other = extensions.createHostEvents({ onHandlerFailure() {} });
      const object = { a: "topic" };
      const topics = [["the text 1", "1"], ["the number 1", 1], ["nothing", undefined], ["null", null], ["not a number", Number.NaN], ["zero", 0], ["an object", object], ["the empty text", ""], ["Saved", "Saved"], ["saved", "saved"]];
      for (const [label, topic] of topics) bus.on(topic, () => { log.push(`heard under ${label}`); });
      other.on("saved", () => { log.push("heard by the other set of events"); });
      for (const [label, topic] of [...topics, ["minus zero", -0], ["an object that looks the same", { a: "topic" }], ["saved with a space", "saved "]]) {
        log.push(`— emitted under ${label} —`);
        await bus.emit(topic);
      }
      return log;
    },
  },
  {
    name: "handlers that take time are all waited for, even when another has failed already and the event is to reject",
    run: async ({ extensions }) => {
      const log = [];
      const bus = extensions.createHostEvents({ onHandlerFailure: (topic, error) => log.push(`reported: ${error.message}`) });
      let finish;
      const slow = new Promise((resolve) => { finish = resolve; });
      bus.on("t", () => { log.push("the failing handler runs"); throw new Error("failed at once"); });
      bus.on("t", async () => { log.push("the slow handler runs"); await slow; log.push("the slow handler finishes"); });
      let answered = "not answered";
      const emitted = bus.emit("t", 1, { failureMode: "reject" }).then(() => { answered = "succeeded"; }, (error) => { answered = `failed with: ${error.message}`; });
      await drained();
      log.push(`— while the slow handler is still at work the event has ${answered} —`);
      finish();
      await emitted;
      log.push(`— after it the event has ${answered} —`);
      return log;
    },
  },
  {
    name: "how soon an event answers, in turns of the promise queue",
    run: async ({ extensions }) => {
      const bus = extensions.createHostEvents({ onHandlerFailure() {} });
      bus.on("one", () => "fine");
      bus.on("three", () => "fine");
      bus.on("three", () => "fine");
      bus.on("three", () => "fine");
      bus.on("slow", async () => { await null; await null; await null; await null; });
      bus.on("fails", () => { throw new Error("failed"); });
      bus.on("fails later", async () => { await null; await null; throw new Error("failed"); });
      return {
        nobodyListens: await turnsUntil(bus.emit("nobody", 1)),
        oneHandler: await turnsUntil(bus.emit("one", 1)),
        threeHandlers: await turnsUntil(bus.emit("three", 1)),
        aHandlerThatWaitsFourTurns: await turnsUntil(bus.emit("slow", 1)),
        aFailureReported: await turnsUntil(bus.emit("fails", 1)),
        aFailureRejected: await turnsUntil(bus.emit("fails", 1, { failureMode: "reject" })),
        aLaterFailureRejected: await turnsUntil(bus.emit("fails later", 1, { failureMode: "reject" })),
      };
    },
  },
  {
    name: "emit and on work the same when taken off the object they came on",
    run: async ({ extensions }) => {
      const log = [];
      const { emit, on } = extensions.createHostEvents({ onHandlerFailure: (topic, error) => log.push(`reported: ${error.message}`) });
      const leave = on("t", (payload) => { log.push(`heard ${payload}`); throw new Error("failed"); });
      const answer = await outcomeOf(() => emit("t", "once"));
      leave();
      await emit("t", "twice");
      return { log, answer };
    },
  },

  // ───────────────────────────── the two errors of extensions ─────────────────────────────
  {
    name: "a graph error is an error under its own name, with the name as its one listed field",
    run: ({ extensions }) => {
      const { HostExtensionGraphError } = extensions;
      const error = new HostExtensionGraphError("the peers do not add up");
      return {
        shown: shown(error),
        isError: error instanceof Error,
        isGraphError: error instanceof HostExtensionGraphError,
        isStartError: error instanceof extensions.HostExtensionStartError,
        madeDirectlyFromError: Object.getPrototypeOf(HostExtensionGraphError) === Error,
        itsMakerIsTheClass: error.constructor === HostExtensionGraphError,
        className: HostExtensionGraphError.name,
        parameters: HostExtensionGraphError.length,
        ofTheClass: Object.getOwnPropertyNames(HostExtensionGraphError).sort(),
        ofEveryOne: Object.getOwnPropertyNames(HostExtensionGraphError.prototype).sort(),
        asJson: JSON.stringify(error),
        otherMessages: [[], [undefined], [null], [""], [12], [{ a: 1 }], ["first", "second, not read"]].map((given) => shown(new HostExtensionGraphError(...given))),
      };
    },
  },
  {
    name: "a start error names the extension in its message and in a field, and keeps what was thrown as its cause, even when that is nothing",
    run: ({ extensions }) => {
      const { HostExtensionStartError } = extensions;
      const cause = new Error("the port is taken");
      const error = new HostExtensionStartError("auth", cause);
      return {
        shown: shown(error),
        sameCause: error.cause === cause,
        isError: error instanceof Error,
        isStartError: error instanceof HostExtensionStartError,
        isGraphError: error instanceof extensions.HostExtensionGraphError,
        madeDirectlyFromError: Object.getPrototypeOf(HostExtensionStartError) === Error,
        itsMakerIsTheClass: error.constructor === HostExtensionStartError,
        className: HostExtensionStartError.name,
        parameters: HostExtensionStartError.length,
        ofTheClass: Object.getOwnPropertyNames(HostExtensionStartError).sort(),
        ofEveryOne: Object.getOwnPropertyNames(HostExtensionStartError.prototype).sort(),
        asJson: JSON.stringify(error),
        otherCauses: [["auth"], ["auth", undefined], ["auth", null], ["auth", "a text"], ["auth", 0], ["auth", false], ["auth", { code: "EADDRINUSE" }], ["auth", new extensions.HostExtensionGraphError("a graph error underneath")]].map((given) => {
          const made = new HostExtensionStartError(...given);
          return { shown: shown(made), ownsACause: Object.hasOwn(made, "cause") };
        }),
        otherIds: [[], [undefined, "c"], [null, "c"], ["", "c"], [12, "c"], [{ an: "object" }, "c"], [["a", "list"], "c"], ["two\nlines", "c"], ['with "quotes"', "c"]].map((given) => shown(new HostExtensionStartError(...given))),
      };
    },
  },

  // ───────────────────────────── the order extensions start in ─────────────────────────────
  {
    name: "extensions with no peers start in the order of their ids as texts, capital letters first, whatever order they were given in",
    run: ({ extensions }) => {
      const given = graph({ b: [], a: [], B: [], a10: [], a2: [], "é": [], "": [], _: [], "a b": [], Z: [], zz: [], z: [] });
      const before = JSON.stringify(given);
      const order = extensions.resolveHostExtensionBootOrder(given);
      const again = extensions.resolveHostExtensionBootOrder(given);
      return {
        parameters: extensions.resolveHostExtensionBootOrder.length,
        order,
        theListIsLeftAlone: JSON.stringify(given) === before,
        aNewListEachTime: order !== again,
        sameOrderEachTime: JSON.stringify(order) === JSON.stringify(again),
        none: extensions.resolveHostExtensionBootOrder([]),
        one: extensions.resolveHostExtensionBootOrder(graph({ only: [] })),
        declared: extensions.resolveHostExtensionBootOrder([extensions.defineHostExtension({ id: "y", dependencies: ["x"], start: null }), extensions.defineHostExtension({ id: "x", dependencies: [], start: null })]),
      };
    },
  },
  {
    name: "an extension starts after all its peers, and each time the first by id among those ready goes next",
    run: ({ extensions }) => [
      { a: ["b"], b: [] },
      { a: [], b: ["a"] },
      { a: ["b"], b: ["c"], c: ["d"], d: [] },
      { a: ["c"], b: [], c: [] },
      { a: ["b"], b: [], c: [] },
      { top: ["left", "right"], left: ["base"], right: ["base"], base: [] },
      { z: [], y: ["z"], x: ["z"], w: ["x", "y"], a: ["w"] },
      { a: ["z"], b: ["a"], c: [], z: ["c"] },
      { m: ["a", "z"], z: [], a: [] },
      { session: ["transcript", "auth"], transcript: ["turns"], turns: ["auth", "inference"], inference: ["auth"], auth: [], notifications: [] },
      { a: ["b", "b", "b"], b: [] },
      { 10: [], 9: [], 1: ["9"] },
    ].map((table) => [table, tried(() => extensions.resolveHostExtensionBootOrder(graph(table)))]),
  },
  {
    name: "two extensions with one id are refused before any peer is looked at",
    run: ({ extensions }) => [
      [{ id: "a", dependencies: [] }, { id: "a", dependencies: [] }],
      [{ id: "a", dependencies: ["missing"] }, { id: "b", dependencies: ["b"] }, { id: "a", dependencies: [] }],
      [{ id: "a", dependencies: [] }, { id: "b", dependencies: [] }, { id: "b", dependencies: [] }, { id: "a", dependencies: [] }],
      [{ id: "", dependencies: [] }, { id: "", dependencies: [] }],
      [{ id: 'with "quotes"', dependencies: [] }, { id: 'with "quotes"', dependencies: [] }],
      [{ id: "a", dependencies: [] }, { id: "A", dependencies: [] }],
      [{ id: "1", dependencies: [] }, { id: 1, dependencies: [] }],
      [{ id: 1, dependencies: [] }, { id: "1", dependencies: [] }],
      [{ id: 1, dependencies: ["1"] }, { id: "1", dependencies: [] }, { id: "0", dependencies: [1] }],
      [{ id: 1, dependencies: [] }, { id: 1, dependencies: [] }],
      [{ id: Number.NaN, dependencies: [] }, { id: Number.NaN, dependencies: [] }],
      [{ id: undefined, dependencies: [] }, { dependencies: [] }],
    ].map((given) => tried(() => extensions.resolveHostExtensionBootOrder(given))),
  },
  {
    name: "an extension that is its own peer, or whose peer is not in the list, is refused: the first such peer of the first such extension is the one named",
    run: ({ extensions }) => [
      { a: ["a"] },
      { a: ["missing"] },
      { a: ["missing", "a"] },
      { a: ["a", "missing"] },
      { a: ["b", "gone", "also gone"], b: [] },
      { a: ["b"], b: ["gone"], c: ["c"] },
      { z: ["z"], a: ["gone"] },
      { a: ["b"], b: ["b"] },
      { a: ["A"] },
      { a: [""] },
      { "": [""] },
      { a: ['with "quotes"'] },
      { a: [1] },
      { 1: [1] },
      { 1: ["1"] },
      { a: [undefined] },
      { a: [null] },
      { a: [{ an: "object" }] },
    ].map((table) => [table, tried(() => extensions.resolveHostExtensionBootOrder(graph(table)))]),
  },
  {
    name: "peers that wait on each other are refused, and the circle is named from its first id round to the same id",
    run: ({ extensions }) => [
      { a: ["b"], b: ["a"] },
      { b: ["a"], a: ["b"] },
      { a: ["b"], b: ["c"], c: ["a"] },
      { a: ["b"], b: ["c"], c: ["b"] },
      { a: ["d"], b: ["c"], c: ["b"], d: ["a"] },
      { x: ["y"], y: ["x"], a: ["b"], b: ["a"] },
      { free: [], a: ["b"], b: ["a"] },
      { m: ["a", "z"], z: ["m"], a: [] },
      { m: ["z", "a"], z: ["m"], a: [] },
      { a: ["c", "b"], b: ["a"], c: ["a"] },
      { a: ["b"], b: ["c"], c: ["d"], d: ["e"], e: ["c"] },
      { hub: ["a"], a: ["b", "c"], b: ["d"], c: ["hub"], d: [] },
      { a: ["b"], b: ["a"], waits: ["a"], "waits too": ["waits"] },
      { B: ["a"], a: ["B"] },
      { 2: ["10"], 10: ["2"] },
    ].map((table) => [table, tried(() => extensions.resolveHostExtensionBootOrder(graph(table)))]),
  },
  {
    name: "peers may be any list that can be walked, more than once: a set works, and so does a list of extensions that is a set",
    run: ({ extensions }) => ({
      setsOfPeers: tried(() => extensions.resolveHostExtensionBootOrder([{ id: "a", dependencies: new Set(["b", "c"]) }, { id: "b", dependencies: new Set() }, { id: "c", dependencies: new Set(["b"]) }])),
      aSetOfPeersWithOneMissing: tried(() => extensions.resolveHostExtensionBootOrder([{ id: "a", dependencies: new Set(["b", "gone"]) }, { id: "b", dependencies: [] }])),
      aTextOfPeers: tried(() => extensions.resolveHostExtensionBootOrder([{ id: "a", dependencies: "bc" }, { id: "b", dependencies: "" }, { id: "c", dependencies: "b" }])),
      aSetOfExtensions: tried(() => extensions.resolveHostExtensionBootOrder(new Set([{ id: "b", dependencies: ["a"] }, { id: "a", dependencies: [] }]))),
    }),
  },
  {
    name: "a list of extensions that can be walked only once is ordered without its peers being checked, and a peer that is not there is then told as a circle of everything left",
    run: ({ extensions }) => {
      const once = function* (list) { yield* list; };
      return {
        allThere: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ b: ["a"], a: [] })))),
        aPeerMissing: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ a: ["gone"] })))),
        twoWithPeersMissing: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ b: ["gone"], free: [], a: ["also gone"] })))),
        itsOwnPeer: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ a: ["a"] })))),
        aDeadEndBeforeACircle: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ a: ["gone"], b: ["c"], c: ["b"] })))),
        aDeadEndBesideACircle: tried(() => extensions.resolveHostExtensionBootOrder(once(graph({ a: ["0 gone", "b"], b: ["a"] })))),
        peersWalkedOnlyOnce: tried(() => extensions.resolveHostExtensionBootOrder([{ id: "a", dependencies: once(["gone"]) }])),
      };
    },
  },
  {
    name: "what cannot be walked as a list of extensions with peers is refused by the runtime",
    run: ({ extensions }) => [
      [],
      [undefined],
      [null],
      [5],
      [{}],
      [[undefined]],
      [[null]],
      [[{ id: "a" }]],
      [[{ id: "a", dependencies: null }]],
      [[{ id: "a", dependencies: 5 }]],
      [[{ id: "a", dependencies: [] }, 5]],
      ["ab"],
    ].map((given) => tried(() => extensions.resolveHostExtensionBootOrder(...given))),
  },
  {
    name: "an extension with no id at all is counted, then refused when its turn to start comes",
    run: ({ extensions }) => ({
      alone: tried(() => extensions.resolveHostExtensionBootOrder([{ dependencies: [] }])),
      afterOthers: tried(() => extensions.resolveHostExtensionBootOrder([{ id: undefined, dependencies: [] }, { id: "a", dependencies: [] }, { id: "b", dependencies: ["a"] }])),
      asAPeer: tried(() => extensions.resolveHostExtensionBootOrder([{ id: undefined, dependencies: ["a"] }, { id: "a", dependencies: [] }])),
      nullIsAnIdLikeAnother: tried(() => extensions.resolveHostExtensionBootOrder([{ id: null, dependencies: [] }, { id: "a", dependencies: [null] }])),
      besideACircle: tried(() => extensions.resolveHostExtensionBootOrder([{ id: undefined, dependencies: [] }, { id: "a", dependencies: ["b"] }, { id: "b", dependencies: ["a"] }])),
      waitingOnACircle: tried(() => extensions.resolveHostExtensionBootOrder([{ id: undefined, dependencies: ["a"] }, { id: "a", dependencies: ["b"] }, { id: "b", dependencies: ["a"] }])),
      inACircle: tried(() => extensions.resolveHostExtensionBootOrder([{ id: undefined, dependencies: ["a"] }, { id: "a", dependencies: [undefined] }])),
    }),
  },
  {
    name: "each extension's id and peers are read in a fixed order: the ids twice each, then every list of peers, then, for the check, the peers again and the id once for each peer",
    run: ({ extensions }) => {
      const log = [];
      const order = extensions.resolveHostExtensionBootOrder([
        notingReads(log, "a", { id: "a", dependencies: ["b", "c"], start: null, kind: "host-extension" }),
        notingReads(log, "b", { id: "b", dependencies: [], start: null, kind: "host-extension" }),
        notingReads(log, "c", { id: "c", dependencies: ["b"], start: null, kind: "host-extension" }),
      ]);
      const refused = [];
      const twice = tried(() => extensions.resolveHostExtensionBootOrder([notingReads(refused, "first", { id: "a", dependencies: [] }), notingReads(refused, "second", { id: "a", dependencies: [] })]));
      refused.push("— its own peer —");
      const own = tried(() => extensions.resolveHostExtensionBootOrder([notingReads(refused, "own", { id: "a", dependencies: ["a"] })]));
      refused.push("— a peer not there —");
      const gone = tried(() => extensions.resolveHostExtensionBootOrder([notingReads(refused, "lonely", { id: "a", dependencies: ["gone"] })]));
      return { order, log, refused, twice, own, gone };
    },
  },
  {
    name: "an extension whose peers change between two reads passes the check with the second answer and is ordered by the first",
    run: ({ extensions }) => {
      const changing = (id, first, then) => {
        let reads = 0;
        return { id, get dependencies() { reads += 1; return reads === 1 ? first : then; } };
      };
      return {
        aPeerOnlyAtFirst: tried(() => extensions.resolveHostExtensionBootOrder([changing("a", ["gone"], [])])),
        twoOfThem: tried(() => extensions.resolveHostExtensionBootOrder([changing("b", ["gone"], []), changing("a", ["also gone"], []), { id: "free", dependencies: [] }])),
        itselfOnlyAtFirst: tried(() => extensions.resolveHostExtensionBootOrder([changing("a", ["a"], [])])),
        aPeerOnlyLater: tried(() => extensions.resolveHostExtensionBootOrder([changing("a", [], ["gone"])])),
        aRealPeerOnlyAtFirst: tried(() => extensions.resolveHostExtensionBootOrder([changing("a", ["b"], []), { id: "b", dependencies: [] }])),
      };
    },
  },

  // ───────────────────────────── starting and stopping extensions ─────────────────────────────
  {
    name: "extensions start one after another in their order, each called as its own with its peers' answers, the host itself and a way to leave a teardown",
    run: async ({ extensions }) => {
      const log = [];
      const host = { the: "host" };
      const declare = (id, dependencies, api) => {
        const declaration = extensions.defineHostExtension({
          id,
          dependencies,
          start(...given) {
            const [context] = given;
            log.push({
              starts: id,
              given: given.length,
              calledAsItsOwn: this === declaration,
              context: Object.keys(context),
              deps: context.deps,
              depsAreAPlainObject: Object.getPrototypeOf(context.deps) === Object.prototype,
              theHostItself: context.host === host,
              onStop: `function taking ${context.onStop.length}`,
            });
            return api;
          },
        });
        return declaration;
      };
      const sessionApi = { open: "a session" };
      const given = [declare("session", ["transcript", "auth"], sessionApi), declare("transcript", ["auth"], "the transcript"), declare("auth", [], undefined), declare("notifications", [], null)];
      const started = await extensions.startHostExtensions({ extensions: given, host, onStopFailure: () => log.push("a teardown failure was reported") });
      return {
        parameters: extensions.startHostExtensions.length,
        log,
        shape: shapeOf(started),
        frozen: { theAnswer: Object.isFrozen(started), itsOrder: Object.isFrozen(started.order), itsApis: Object.isFrozen(started.apis) },
        order: started.order,
        apis: started.apis,
        apiKeys: Object.keys(started.apis),
        theApiItself: started.apis.session === sessionApi,
        apisAreAPlainObject: Object.getPrototypeOf(started.apis) === Object.prototype,
        stopped: await outcomeOf(() => started.stop()),
      };
    },
  },
  {
    name: "extensions need not be declared: any object with an id, peers and a start will do, and its kind is never looked at",
    run: async ({ extensions }) => {
      const log = [];
      const started = await extensions.startHostExtensions({
        extensions: [extension(log, "b", ["a"]), { ...extension(log, "a", []), kind: "something else" }, Object.assign(Object.create({ inherited: true }), extension(log, "c", new Set(["a", "b"])))],
        host: undefined,
        onStopFailure() {},
      });
      return { log, order: started.order, apis: started.apis };
    },
  },
  {
    name: "each start is waited for before the next begins, and its answer is what its peers are given",
    run: async ({ extensions }) => {
      const log = [];
      const gates = {};
      const slow = (id, dependencies) => ({
        id,
        dependencies,
        start(context) {
          log.push(`${id} starts with ${JSON.stringify(context.deps)}`);
          return new Promise((resolve) => { gates[id] = resolve; });
        },
      });
      let state = "still starting";
      const starting = extensions.startHostExtensions({ extensions: [slow("c", ["b"]), slow("b", ["a"]), slow("a", [])], host: null, onStopFailure() {} });
      starting.then(() => { state = "started"; });
      for (const id of ["a", "b", "c"]) {
        await drained();
        log.push(`— everything is ${state}; ${id} finishes starting —`);
        gates[id](`${id} is up`);
      }
      const started = await starting;
      log.push(`— everything is ${state} —`);
      return { log, order: started.order, apis: started.apis };
    },
  },
  {
    name: "a start may answer with any thenable, and what it resolves to is the extension's answer",
    run: async ({ extensions }) => {
      const log = [];
      const thenable = { then(resolve) { log.push("the thenable is asked"); resolve("what the thenable resolved to"); } };
      const started = await extensions.startHostExtensions({ extensions: [{ id: "a", dependencies: [], start: () => thenable }, extension(log, "b", ["a"])], host: null, onStopFailure() {} });
      return { log, apis: started.apis };
    },
  },
  {
    name: "leaving a teardown hands back how many are left so far, across all extensions",
    run: async ({ extensions }) => {
      const handed = [];
      const leaving = (id, dependencies, count) => ({
        id,
        dependencies,
        start({ onStop }) {
          for (let nth = 1; nth <= count; nth += 1) handed.push([`${id}'s teardown ${nth}`, onStop(() => {})]);
        },
      });
      const started = await extensions.startHostExtensions({ extensions: [leaving("a", [], 2), leaving("b", ["a"], 0), leaving("c", ["b"], 3)], host: null, onStopFailure() {} });
      await started.stop();
      return { handed, order: started.order };
    },
  },
  {
    name: "stop runs the teardowns last left first, one at a time, each waited for, and reports the ones that fail",
    run: async ({ extensions }) => {
      const log = [];
      let finishSlow;
      const leaving = (id, dependencies, teardowns) => ({
        id,
        dependencies,
        start({ onStop }) {
          for (const teardown of teardowns) onStop(teardown);
          return id;
        },
      });
      const failure = new Error("b's teardown failed");
      const options = {
        extensions: [
          leaving("a", [], [
            function (...given) { log.push(`a's first teardown runs (${given.length} things given, called as the own of ${this === undefined ? "nothing" : `an object with ${Object.keys(this).join(" and ")}, whose extensionId is ${this.extensionId}`})`); return "dropped"; },
            () => { log.push("a's second teardown runs and takes its time"); return new Promise((resolve) => { finishSlow = resolve; }).then(() => { log.push("a's second teardown finishes"); }); },
          ]),
          leaving("b", ["a"], [
            () => { log.push("b's first teardown runs and fails"); throw failure; },
            async () => { log.push("b's second teardown runs and fails later"); await null; throw "a text, not an error"; },
          ]),
          leaving("c", ["b"], [() => { log.push("c's teardown runs"); }]),
        ],
        host: null,
        onStopFailure(...given) {
          log.push({ reported: given, asTheOptionsOwn: this === options });
          return "dropped";
        },
      };
      const started = await extensions.startHostExtensions(options);
      let state = "still stopping";
      const stopping = started.stop().then((value) => { state = `stopped, handing back ${value === undefined ? "nothing" : value}`; });
      log.push("stop has returned");
      await drained();
      log.push(`— stop is ${state} —`);
      finishSlow();
      await stopping;
      log.push(`— stop is ${state} —`);
      const again = await outcomeOf(() => started.stop());
      log.push(`a second stop ${"kept" in again && again.kept === undefined ? "runs nothing and hands back nothing" : "does something else"}`);
      return log;
    },
  },
  {
    name: "a teardown left after everything has started, or while stopping, runs at the next stop",
    run: async ({ extensions }) => {
      const log = [];
      let leave;
      const started = await extensions.startHostExtensions({
        extensions: [{ id: "a", dependencies: [], start({ onStop }) { leave = onStop; onStop(() => { log.push("the teardown left at start runs, and leaves another"); log.push(`leaving it hands back ${leave(() => { log.push("the teardown left while stopping runs"); })}`); }); } }],
        host: null,
        onStopFailure() {},
      });
      log.push(`leaving one after the start hands back ${leave(() => { log.push("the teardown left after the start runs"); })}`);
      log.push("— first stop —");
      await started.stop();
      log.push("— second stop —");
      await started.stop();
      log.push("— third stop —");
      await started.stop();
      log.push(`leaving one after all that hands back ${leave(() => { log.push("the last teardown runs"); })}`);
      log.push("— fourth stop —");
      await started.stop();
      return log;
    },
  },
  {
    name: "a teardown left twice runs twice, and one that is no function is taken all the same and reported as a failure when its turn comes",
    run: async ({ extensions }) => {
      const log = [];
      const twice = () => { log.push("the teardown left twice runs"); };
      const handed = [];
      const started = await extensions.startHostExtensions({
        extensions: [{ id: "a", dependencies: [], start({ onStop }) { handed.push(onStop(twice), onStop(undefined), onStop("not a function"), onStop(twice), onStop()); } }],
        host: null,
        onStopFailure: (id, error) => log.push({ reported: [id, told(error)] }),
      });
      const stopped = await outcomeOf(() => started.stop());
      return { handed, log, stopped };
    },
  },
  {
    name: "when reporting a failed teardown itself fails, stop fails with that and the teardowns not yet run are lost",
    run: async ({ extensions }) => {
      const log = [];
      const reporterFails = new Error("the reporter failed");
      const started = await extensions.startHostExtensions({
        extensions: [{
          id: "a",
          dependencies: [],
          start({ onStop }) {
            onStop(() => { log.push("the teardown left first would run last"); });
            onStop(() => { log.push("the teardown left second runs and fails"); throw new Error("failed"); });
            onStop(() => { log.push("the teardown left third runs"); });
          },
        }],
        host: null,
        onStopFailure(id, error) { log.push(`asked to report ${id}: ${error.message}`); throw reporterFails; },
      });
      const first = await outcomeOf(() => started.stop());
      log.push("— a second stop —");
      const second = await outcomeOf(() => started.stop());
      return { log, first, theReportersOwn: first.broken === reporterFails, second };
    },
  },
  {
    name: "an extension that fails to start: what had started is torn down in reverse, its own teardowns first, nothing after it starts, and the failure names it and carries what was thrown",
    run: async ({ extensions }) => {
      const results = [];
      for (const [label, fail] of [
        ["throws at once", () => { throw new Error("no port"); }],
        ["rejects later", async () => { await null; await null; throw new Error("no port, later"); }],
        ["throws a text", () => { throw "a text"; }],
        ["throws nothing at all", () => { throw undefined; }],
        ["rejects with null", () => Promise.reject(null)],
        ["throws a start error of another extension", () => { throw new extensions.HostExtensionStartError("inner", "inner cause"); }],
      ]) {
        const log = [];
        const leaving = (id, dependencies, body = () => `${id}'s api`) => ({
          id,
          dependencies,
          start(context) {
            log.push(`${id} starts`);
            context.onStop(() => { log.push(`${id}'s teardown runs`); });
            return body(context);
          },
        });
        const answer = await outcomeOf(() => extensions.startHostExtensions({
          extensions: [leaving("a", []), leaving("b", ["a"]), leaving("c", ["b"], ({ onStop }) => { onStop(() => { log.push("c's second teardown runs"); }); return fail(); }), leaving("d", ["c"])],
          host: null,
          onStopFailure: () => log.push("a teardown failure was reported"),
        }));
        const error = answer.broken;
        results.push({ when: label, log, failure: shown(error), isStartError: error instanceof extensions.HostExtensionStartError, ownsACause: Object.hasOwn(error, "cause") });
      }
      return results;
    },
  },
  {
    name: "what was thrown is the cause itself, and a failed teardown on the way out is reported without hiding the start's failure",
    run: async ({ extensions }) => {
      const log = [];
      const thrown = new Error("c could not start");
      const answer = await outcomeOf(() => extensions.startHostExtensions({
        extensions: [
          { id: "a", dependencies: [], start({ onStop }) { onStop(() => { log.push("a's teardown runs"); }); } },
          { id: "b", dependencies: ["a"], start({ onStop }) { onStop(async () => { log.push("b's teardown runs and fails"); throw new Error("b's teardown failed"); }); } },
          { id: "c", dependencies: ["b"], start() { throw thrown; } },
        ],
        host: null,
        onStopFailure: (id, error) => log.push(`reported ${id}: ${error.message}`),
      }));
      return { log, answer, theCauseItself: answer.broken.cause === thrown };
    },
  },
  {
    name: "when the report of a failed teardown fails on the way out of a failed start, that is what comes out, not the start error",
    run: async ({ extensions }) => {
      const log = [];
      const reporterFails = new Error("the reporter failed");
      const answer = await outcomeOf(() => extensions.startHostExtensions({
        extensions: [
          { id: "a", dependencies: [], start({ onStop }) { onStop(() => { log.push("a's teardown would run last"); }); } },
          { id: "b", dependencies: ["a"], start({ onStop }) { onStop(() => { log.push("b's teardown runs and fails"); throw new Error("b's teardown failed"); }); } },
          { id: "c", dependencies: ["b"], start() { log.push("c fails to start"); throw new Error("c could not start"); } },
        ],
        host: null,
        onStopFailure(id, error) { log.push(`asked to report ${id}: ${error.message}`); throw reporterFails; },
      }));
      return { log, answer, theReportersOwn: answer.broken === reporterFails };
    },
  },
  {
    name: "extensions that cannot be ordered break the promise of a start, never throw at once, and nothing starts",
    run: async ({ extensions }) => {
      const log = [];
      const out = [];
      for (const table of [{ a: [], b: ["gone"] }, { a: ["a"] }, { a: ["b"], b: ["a"] }]) {
        out.push(await outcomeOf(() => extensions.startHostExtensions({ extensions: Object.entries(table).map(([id, dependencies]) => extension(log, id, dependencies)), host: null, onStopFailure() {} })));
      }
      out.push(await outcomeOf(() => extensions.startHostExtensions({ extensions: [extension(log, "a", []), extension(log, "a", [])], host: null, onStopFailure() {} })));
      for (const given of [[], [undefined], [null], [{}], [{ extensions: null }], [{ extensions: new Set() }]]) out.push(await outcomeOf(() => extensions.startHostExtensions(...given)));
      return { out, started: log };
    },
  },
  {
    name: "nothing to start: an empty order, no answers, and a stop with nothing to do",
    run: async ({ extensions }) => {
      const started = await extensions.startHostExtensions({ extensions: [], host: null, onStopFailure() {} });
      const minimal = await outcomeOf(() => extensions.startHostExtensions({ extensions: [] }));
      return { order: started.order, apis: started.apis, shape: shapeOf(started), stopped: await outcomeOf(() => started.stop()), withoutHostOrReporter: { order: minimal.kept.order, apis: minimal.kept.apis } };
    },
  },
  {
    name: "an extension with no start that can be called fails to start like any other, with the runtime's refusal as the cause",
    run: async ({ extensions }) => {
      const out = [];
      for (const start of [undefined, null, "not a function", 5]) {
        const log = [];
        const answer = await outcomeOf(() => extensions.startHostExtensions({ extensions: [{ id: "b", dependencies: ["a"], start }, { id: "a", dependencies: [], start({ onStop }) { onStop(() => { log.push("a's teardown runs"); }); } }], host: null, onStopFailure() {} }));
        out.push({ log, name: answer.broken.name, message: answer.broken.message, extensionId: answer.broken.extensionId, cause: told(answer.broken.cause) });
      }
      return out;
    },
  },
  {
    name: "a start with no reporter for teardowns fails only when a teardown does",
    run: async ({ extensions }) => {
      const log = [];
      const started = await extensions.startHostExtensions({
        extensions: [{ id: "a", dependencies: [], start({ onStop }) { onStop(() => { log.push("the first teardown would run last"); }); onStop(() => { log.push("the second teardown fails"); throw new Error("failed"); }); } }],
        host: null,
      });
      return { stopped: await outcomeOf(() => started.stop()), log };
    },
  },
  {
    name: "the options of a start are read as it goes: the list twice, the host once for each extension, the reporter at each failed teardown",
    run: async ({ extensions }) => {
      const log = [];
      const failing = (id, dependencies) => ({ id, dependencies, start({ onStop, host }) { log.push(`${id} starts with the host "${host}"`); onStop(() => { log.push(`${id}'s teardown fails`); throw new Error("failed"); }); } });
      const options = notingReads(log, "options", { extensions: [failing("a", []), failing("b", ["a"])], host: "the host", onStopFailure: (id) => log.push(`reported ${id}`) });
      const started = await extensions.startHostExtensions(options);
      log.push("— started; now stop —");
      await started.stop();
      return log;
    },
  },
  {
    name: "each extension is read in a fixed order while starting: after the ordering, every id once more, then its peers and its start when its turn comes",
    run: async ({ extensions }) => {
      const log = [];
      const started = await extensions.startHostExtensions({
        extensions: [
          notingReads(log, "b", { id: "b", dependencies: ["a"], start: () => { log.push("b starts"); return "b's api"; }, kind: "host-extension" }),
          notingReads(log, "a", { id: "a", dependencies: [], start: () => { log.push("a starts"); return "a's api"; }, kind: "host-extension" }),
        ],
        host: null,
        onStopFailure() {},
      });
      return { log, order: started.order };
    },
  },
  {
    name: "an extension whose id changes after the ordering cannot be found again when its turn comes: the start fails with a graph error, and what had started before it is left running",
    run: async ({ extensions }) => {
      const log = [];
      let reads = 0;
      const changing = { get id() { reads += 1; return reads <= 2 ? "b" : "c"; }, dependencies: [], start() { log.push("the changing one starts"); } };
      const before = { id: "a", dependencies: [], start({ onStop }) { log.push("a starts"); onStop(() => { log.push("a's teardown runs"); }); } };
      const answer = await outcomeOf(() => extensions.startHostExtensions({ extensions: [changing, before], host: null, onStopFailure: () => log.push("a teardown failure was reported") }));
      return { answer, isGraphError: answer.broken instanceof extensions.HostExtensionGraphError, log, idReads: reads };
    },
  },
  {
    name: "answers are kept on a plain object under the ids: whole numbers come first in number order, and an extension called __proto__ becomes what the others' answers inherit",
    run: async ({ extensions }) => {
      const log = [];
      const numbered = await extensions.startHostExtensions({ extensions: [extension(log, "b", ["10", "2"]), extension(log, "10", []), extension(log, "2", []), extension(log, "a", ["b"])], host: null, onStopFailure() {} });
      const protoApi = { inheritedBy: "the answers" };
      const odd = await extensions.startHostExtensions({ extensions: [{ id: "__proto__", dependencies: [], start: () => protoApi }, extension(log, "z", ["__proto__"]), extension(log, "toString", [])], host: null, onStopFailure() {} });
      return {
        log,
        numbered: { order: numbered.order, apiKeys: Object.keys(numbered.apis) },
        odd: { order: odd.order, apiKeys: Object.keys(odd.apis), theAnswersInheritIt: Object.getPrototypeOf(odd.apis) === protoApi, toString: odd.apis.toString },
      };
    },
  },
  {
    name: "two starts of the same extensions are two separate runs, each with its own answers and teardowns",
    run: async ({ extensions }) => {
      const log = [];
      let runs = 0;
      const given = [{ id: "a", dependencies: [], start({ onStop }) { runs += 1; const run = runs; onStop(() => { log.push(`the teardown of run ${run}`); }); return `the answer of run ${run}`; } }];
      const first = await extensions.startHostExtensions({ extensions: given, host: null, onStopFailure() {} });
      const second = await extensions.startHostExtensions({ extensions: given, host: null, onStopFailure() {} });
      await second.stop();
      log.push("— the second run is stopped; now the first —");
      await first.stop();
      return { log, first: first.apis, second: second.apis, differentAnswers: first.apis !== second.apis, differentOrders: first.order !== second.order, differentStops: first.stop !== second.stop };
    },
  },
  {
    name: "how soon a start and a stop answer, in turns of the promise queue",
    run: async ({ extensions }) => {
      const plainOnes = (count) => Array.from({ length: count }, (unused, at) => ({ id: `e${at}`, dependencies: [], start({ onStop }) { onStop(() => {}); return at; } }));
      const start = (given) => extensions.startHostExtensions({ extensions: given, host: null, onStopFailure() {} });
      const failing = { id: "z", dependencies: [], start() { throw new Error("failed"); } };
      const turns = {};
      const none = start([]);
      turns.nothingToStart = await turnsUntil(none);
      const one = start(plainOnes(1));
      turns.oneExtension = await turnsUntil(one);
      const three = start(plainOnes(3));
      turns.threeExtensions = await turnsUntil(three);
      turns.anExtensionThatStartsAfterThreeTurns = await turnsUntil(start([{ id: "a", dependencies: [], async start() { await null; await null; await null; } }]));
      turns.aFailedStart = await turnsUntil(start([failing]));
      turns.aFailedStartAfterOneStarted = await turnsUntil(start([...plainOnes(1), failing]));
      turns.extensionsThatCannotBeOrdered = await turnsUntil(start([{ id: "a", dependencies: ["a"] }]));
      turns.stopWithNothing = await turnsUntil((await none).stop());
      turns.stopWithOneTeardown = await turnsUntil((await one).stop());
      turns.stopWithThreeTeardowns = await turnsUntil((await three).stop());
      turns.aSecondStop = await turnsUntil((await three).stop());
      return turns;
    },
  },

  // ───────────────────────────── the deadline error and the machine's clock ─────────────────────────────
  {
    name: "a deadline error names its policy in its message and in a field, and carries the code deadline_exceeded",
    run: ({ scheduling }) => {
      const { DeadlineExceededError } = scheduling;
      const error = new DeadlineExceededError("gateway-connect");
      const other = new DeadlineExceededError("another");
      const before = held(error);
      error.code = "written over";
      error.policyName = "changed";
      return {
        shown: shown(other),
        held: before,
        afterWritingOver: { held: held(error), message: error.message, theOtherIsUntouched: held(other) },
        isError: other instanceof Error,
        isDeadlineError: other instanceof DeadlineExceededError,
        madeDirectlyFromError: Object.getPrototypeOf(DeadlineExceededError) === Error,
        itsMakerIsTheClass: other.constructor === DeadlineExceededError,
        className: DeadlineExceededError.name,
        parameters: DeadlineExceededError.length,
        ofTheClass: Object.getOwnPropertyNames(DeadlineExceededError).sort(),
        ofEveryOne: Object.getOwnPropertyNames(DeadlineExceededError.prototype).sort(),
        asJson: JSON.stringify(other),
        otherNames: [[], [undefined], [null], [""], [" "], [12], [{ a: 1 }], [["a", "list"]], ["two\nlines"], ["first", "second, not read"]].map((given) => shown(new DeadlineExceededError(...given))),
      };
    },
  },
  {
    name: "the machine's clock: the time from Date.now, the steady time from performance.now, each asked every time",
    run: ({ scheduling }) => {
      const { realClock } = scheduling;
      const realNow = Date.now;
      const asked = [];
      let wall = 1_700_000_000_000;
      let steady = 42.5;
      Date.now = (...given) => { asked.push(`Date.now (${given.length} things given)`); wall += 1; return wall; };
      performance.now = (...given) => { asked.push(`performance.now (${given.length} things given)`); steady += 0.25; return steady; };
      try {
        const { now, monotonicNow } = realClock;
        return {
          shape: shapeOf(realClock),
          frozen: Object.isFrozen(realClock),
          aPlainObject: Object.getPrototypeOf(realClock) === Object.prototype,
          now: [realClock.now(), realClock.now("ignored"), now()],
          monotonicNow: [realClock.monotonicNow(), realClock.monotonicNow("ignored"), monotonicNow()],
          asked,
        };
      } finally {
        Date.now = realNow;
        delete performance.now;
      }
    },
  },
  {
    name: "the machine's clock refuses a delay that is not a finite number of zero or more, before any timer is set",
    run: async ({ scheduling }) => {
      const log = [];
      const delays = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.001, -Number.MIN_VALUE, "5", "", null, undefined, true, 5n, [5], { valueOf: () => 5 }, 0, -0, Number.MIN_VALUE, 0.5, 1, 2 ** 31, Number.MAX_VALUE];
      const answers = await withTimers(log, () => delays.map((delay) => {
        const answer = tried(() => scheduling.realClock.schedule(delay, () => {}));
        return [typeof delay === "bigint" ? "5n" : delay, answer.threw ?? shapeOf(answer.gave)];
      }));
      return { answers, withNoDelayAtAll: await withTimers(log, () => tried(() => scheduling.realClock.schedule())), log };
    },
  },
  {
    name: "the machine's clock sets one timer that does not keep the process alive, and runs the callback once, with nothing, when it fires",
    run: async ({ scheduling }) => {
      const log = [];
      await withTimers(log, ({ fire }) => {
        const scheduled = scheduling.realClock.schedule(250, function (...given) { log.push(`the callback runs (${given.length} things given, ${this === undefined ? "no this" : "a this"})`); return "dropped"; });
        log.push(`schedule handed back ${JSON.stringify(shapeOf(scheduled))}`);
        log.push(`firing handed back ${fire(1)}`);
        log.push("— dropped after it ran: nothing to clear —");
        log.push(`dispose handed back ${scheduled.dispose()}`);
        log.push("— a machine that fired it twice —");
        fire(1);
      });
      return log;
    },
  },
  {
    name: "a timer of the machine's clock dropped before it fires is cleared once and never runs",
    run: async ({ scheduling }) => {
      const log = [];
      await withTimers(log, ({ fire }) => {
        const first = scheduling.realClock.schedule(10, () => log.push("the first callback runs"));
        const second = scheduling.realClock.schedule(20, () => log.push("the second callback runs"));
        const { dispose } = first;
        log.push(`dispose, taken off its object, handed back ${dispose()}`);
        first.dispose();
        log.push("— a machine that fired the cleared timer all the same —");
        fire(1);
        log.push("— the second timer is its own —");
        fire(2);
        second.dispose();
      });
      return log;
    },
  },
  {
    name: "a timer that is a plain number, as a browser's is, is set and cleared the same without being unref'd",
    run: async ({ scheduling }) => {
      const log = [];
      await withTimers(log, ({ fire }) => {
        const dropped = scheduling.realClock.schedule(5, () => log.push("the dropped callback runs"));
        dropped.dispose();
        scheduling.realClock.schedule(0, () => log.push("the callback runs"));
        fire(2);
      }, { handles: "numbers" });
      return log;
    },
  },
  {
    name: "a callback that throws: the throw goes to whoever fired the timer, and the timer is spent all the same",
    run: async ({ scheduling }) => {
      const log = [];
      const failure = new Error("the callback failed");
      const fired = await withTimers(log, ({ fire }) => {
        const scheduled = scheduling.realClock.schedule(1, () => { log.push("the callback runs and throws"); throw failure; });
        const first = tried(() => fire(1));
        const second = tried(() => fire(1));
        scheduled.dispose();
        return { first, second, theSameFailure: first.threw === failure };
      });
      return { log, fired };
    },
  },
  {
    name: "with the machine's real timers: nothing runs at once, a timer runs when its time has come, and a dropped one never does",
    run: async ({ scheduling }) => {
      const log = [];
      const realSetTimeout = globalThis.setTimeout;
      const handles = [];
      globalThis.setTimeout = (...given) => { const handle = realSetTimeout(...given); handles.push(handle); return handle; };
      let ran;
      const whenRan = new Promise((resolve) => { ran = resolve; });
      try {
        scheduling.realClock.schedule(0, () => { log.push("the timer of 0 runs"); });
        scheduling.realClock.schedule(5, () => { log.push("the timer of 5 runs"); ran(); });
        const dropped = scheduling.realClock.schedule(1, () => { log.push("the dropped timer runs"); });
        dropped.dispose();
        log.push("three timers set, one of them dropped; nothing has run yet");
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
      // The part's timers do not hold the process: this one does, while they are waited for.
      const holding = realSetTimeout(() => {}, 900);
      await whenRan;
      await new Promise((resolve) => realSetTimeout(resolve, 10));
      clearTimeout(holding);
      return { log, timersThatKeepTheProcessAlive: handles.filter((handle) => handle.hasRef()).length, timersSet: handles.length };
    },
  },

  // ───────────────────────────── what every policy checks when it is made ─────────────────────────────
  {
    name: "every policy but the deadline refuses a name that is empty or only blanks, with a TypeError, and keeps the name as given",
    run: ({ scheduling }, tools) => {
      const names = ["", " ", "\t\n ", "\u00a0", "\ufeff", "\u2028", "\u200b", " padded ", "x", "0", undefined, null, 5, { trim: () => "" }, { trim: () => "not empty" }, ["in a list"]];
      const out = {};
      for (const [kind, { make, real }] of Object.entries(makers(scheduling))) {
        if (kind === "deadline") continue;
        const clock = manualClock([]).clock;
        out[kind] = names.map((name) => {
          const made = tried(() => make(clock, { ...RIGHT[kind], name }));
          const madeReal = tried(() => real({ ...RIGHT[kind], name }));
          return [name, made.threw ?? made.gave.name, keptAlike(tools, madeReal.threw ?? madeReal.gave.name, made.threw ?? made.gave.name) ? "the same over the machine's clock" : madeReal];
        });
      }
      return out;
    },
  },
  {
    name: "a deadline refuses only a name of no length, with a RangeError, and does not mind blanks",
    run: ({ scheduling }) => {
      const clock = manualClock([]).clock;
      return ["", " ", "\t", "x", [], ["in a list"], { length: 0 }, { length: 1 }, 5, true, undefined, null].map((name) => {
        const made = tried(() => scheduling.createDeadlinePolicy(clock, { name, timeoutMs: 10 }));
        return [name, made.threw ?? made.gave.name];
      });
    },
  },
  {
    name: "every policy refuses a number that is not finite or is below zero, by the number's own name; zero is right for all but polling",
    run: ({ scheduling }, tools) => {
      const numbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -Number.MIN_VALUE, "5", null, undefined, true, 0, -0, Number.MIN_VALUE, 0.5, 1, Number.MAX_VALUE];
      const out = {};
      for (const [kind, { make, real, number }] of Object.entries(makers(scheduling))) {
        const clock = manualClock([]).clock;
        out[kind] = numbers.map((value) => {
          const options = { ...RIGHT[kind], [number]: value, ...(kind === "retry" ? { maxDelayMs: Number.MAX_VALUE } : {}) };
          const made = tried(() => make(clock, options));
          const madeReal = real === undefined ? "no maker over the machine's clock" : tried(() => real(options));
          const said = made.threw ?? "made";
          return [value, said, real === undefined ? madeReal : keptAlike(tools, madeReal.threw ?? "made", said) ? "the same over the machine's clock" : madeReal];
        });
      }
      return out;
    },
  },
  {
    name: "the name is checked before the number, and options that are missing are refused by the runtime",
    run: ({ scheduling }) => {
      const out = {};
      for (const [kind, { make, real, number }] of Object.entries(makers(scheduling))) {
        const clock = manualClock([]).clock;
        out[kind] = {
          bothWrong: tried(() => make(clock, { ...RIGHT[kind], name: "", [number]: -1 })),
          noOptions: tried(() => make(clock)),
          nullOptions: tried(() => make(clock, null)),
          emptyOptions: tried(() => make(clock, {})),
          noClockIsFineUntilItIsNeeded: policyShown(make(undefined, RIGHT[kind])),
          parameters: make.length,
          overTheMachinesClock: real === undefined ? "no maker" : { bothWrong: tried(() => real({ ...RIGHT[kind], name: "", [number]: -1 })), noOptions: tried(() => real()), made: policyShown(real(RIGHT[kind])), parameters: real.length },
          made: policyShown(make(clock, RIGHT[kind])),
        };
      }
      return out;
    },
  },
  {
    name: "a retry policy checks, in this order: the name, the tries, the first wait, the longest wait, that the longest is not below the first, the growth",
    run: ({ scheduling }, tools) => {
      const clock = manualClock([]).clock;
      const right = { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 };
      return [
        {},
        { maxAttempts: 0 },
        { maxAttempts: 1 },
        { maxAttempts: 1.5 },
        { maxAttempts: -1 },
        { maxAttempts: Number.NaN },
        { maxAttempts: Number.POSITIVE_INFINITY },
        { maxAttempts: "3" },
        { maxAttempts: undefined },
        { maxAttempts: null },
        { maxAttempts: 2 ** 53 },
        { maxAttempts: 1e21 },
        { initialDelayMs: -1 },
        { initialDelayMs: -0 },
        { initialDelayMs: 0 },
        { initialDelayMs: Number.NaN },
        { initialDelayMs: Number.POSITIVE_INFINITY },
        { initialDelayMs: "10" },
        { initialDelayMs: undefined },
        { maxDelayMs: -1 },
        { maxDelayMs: Number.NaN },
        { maxDelayMs: Number.POSITIVE_INFINITY },
        { maxDelayMs: "100" },
        { maxDelayMs: undefined },
        { maxDelayMs: 9.999 },
        { maxDelayMs: 10 },
        { initialDelayMs: 0, maxDelayMs: 0 },
        { initialDelayMs: 100.5, maxDelayMs: 100 },
        { backoffFactor: 0.999 },
        { backoffFactor: 1 },
        { backoffFactor: 1.0001 },
        { backoffFactor: 0 },
        { backoffFactor: -2 },
        { backoffFactor: Number.NaN },
        { backoffFactor: Number.POSITIVE_INFINITY },
        { backoffFactor: "2" },
        { backoffFactor: null },
        { backoffFactor: undefined },
        { shouldRetry: null },
        { shouldRetry: undefined },
        { shouldRetry: "not a function" },
        { name: " ", maxAttempts: 0, initialDelayMs: -1, maxDelayMs: -1, backoffFactor: 0 },
        { maxAttempts: 0, initialDelayMs: -1, maxDelayMs: -1, backoffFactor: 0 },
        { initialDelayMs: -1, maxDelayMs: -1, backoffFactor: 0 },
        { maxDelayMs: -1, backoffFactor: 0 },
        { initialDelayMs: 200, backoffFactor: 0 },
        { initialDelayMs: 200, maxDelayMs: Number.NaN },
      ].map((changed) => {
        const options = { ...right, ...changed };
        const made = tried(() => scheduling.createRetryPolicy(clock, options));
        const madeReal = tried(() => scheduling.createRealRetryPolicy(options));
        const said = made.threw ?? policyShown(made.gave);
        return [changed, said, keptAlike(tools, madeReal.threw ?? policyShown(madeReal.gave), said) ? "the same over the machine's clock" : madeReal];
      });
    },
  },
  {
    name: "polling refuses an interval of zero in its own words, after the check every policy makes",
    run: ({ scheduling }) => {
      const clock = manualClock([]).clock;
      return [0, -0, Number.MIN_VALUE, -1, Number.NaN, 0.001].map((intervalMs) => [intervalMs, tried(() => scheduling.createPollingPolicy(clock, { name: "p", intervalMs })).threw ?? "made", tried(() => scheduling.createRealPollingPolicy({ name: "p", intervalMs })).threw ?? "made"]);
    },
  },

  // ───────────────────────────── debounce ─────────────────────────────
  {
    name: "a debounced function runs once, when the calls have stopped for the delay, with the last call's arguments and no this",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 });
      const save = policy.wrap(function (...given) {
        log.push(`fn runs with ${JSON.stringify(given)} and ${this === undefined ? "no this" : "a this"}`);
        return "what fn hands back is dropped";
      });
      const handed = [save("first", 1), save("second", 2), { save }.save("third", 3)];
      log.push(`the three calls handed back ${JSON.stringify(handed.map((value) => (value === undefined ? "nothing" : value)))}`);
      log.push(`the timer's callback handed back ${time.run(3)}`);
      log.push("— called again after it ran, with nothing —");
      save();
      time.run(4);
      return { log, wrapped: { is: typeof save, taking: save.length, listed: Object.keys(save), dispose: `function taking ${save.dispose.length}` }, wrapTakes: policy.wrap.length };
    },
  },
  {
    name: "disposing a debounced function drops the call that was waiting and every call after, and can be done twice",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const save = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap((...given) => { log.push(`fn runs with ${JSON.stringify(given)}`); });
      save("waiting");
      log.push(`dispose handed back ${save.dispose()}`);
      save.dispose();
      log.push(`a call after handed back ${save("after")}`);
      const idle = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap(() => { log.push("fn runs"); });
      log.push("— one disposed with nothing waiting —");
      idle.dispose();
      idle();
      const ran = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap(() => { log.push("fn runs"); });
      log.push("— one disposed after it ran: the timer that ran is not dropped —");
      ran();
      time.run(2);
      ran.dispose();
      const { dispose } = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap(() => {});
      log.push(`— dispose taken off its function works: handed back ${dispose()} —`);
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "each wrapped function keeps its own wait, and the delay is the options' at the time of each call",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "save", delayMs: 100 };
      const policy = scheduling.createDebouncePolicy(time.clock, options);
      const { wrap } = policy;
      const a = wrap(() => { log.push("a runs"); });
      const b = policy.wrap(() => { log.push("b runs"); });
      a();
      b();
      a();
      log.push("— the options are changed after the policy was made —");
      options.delayMs = 5;
      options.name = "renamed";
      b();
      a.dispose();
      time.run(4);
      log.push("— a delay the policy would have refused is passed on as it is —");
      options.delayMs = -1;
      b();
      return { log, name: policy.name };
    },
  },
  {
    name: "a debounced function that throws: the throw goes to whoever ran the timer, and the next call starts a new wait",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const failure = new Error("fn failed");
      const save = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap((what) => { log.push(`fn runs with ${what}`); if (what === "bad") throw failure; });
      save("bad");
      const ran = tried(() => time.run(1));
      save("good");
      time.run(2);
      return { log, ran, theSameFailure: ran.threw === failure };
    },
  },
  {
    name: "a debounced function called from inside itself starts a new wait, and nothing is dropped for it",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      let rounds = 0;
      const save = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap((what) => {
        rounds += 1;
        log.push(`fn runs with ${what}`);
        if (rounds < 3) save(`round ${rounds + 1}`);
      });
      save("round 1");
      time.run(1);
      time.run(2);
      time.run(3);
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "debounce trusts its clock: a timer that runs after it was dropped still runs fn, and what waits after it is forgotten, not dropped",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const save = scheduling.createDebouncePolicy(time.clock, { name: "save", delayMs: 250 }).wrap((what) => { log.push(`fn runs with ${what}`); });
      save("first");
      save("second");
      time.runAnyway(1);
      log.push("— a third call: the second's timer is not dropped —");
      save("third");
      time.run(2);
      time.run(3);
      log.push("— after dispose —");
      save("fourth");
      save.dispose();
      time.runAnyway(4);
      return log;
    },
  },
  {
    name: "debounce over the machine's clock sets and clears the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRealDebouncePolicy({ name: "save", delayMs: 300 });
      await withTimers(log, ({ fire }) => {
        const save = policy.wrap((what) => { log.push(`fn runs with ${what}`); });
        save("first");
        save("second");
        fire(2);
        save("third");
        save.dispose();
      });
      return { log, policy: policyShown(policy) };
    },
  },

  // ───────────────────────────── retry: the wait before a try ─────────────────────────────
  {
    name: "the wait before another try starts at the first wait and grows by the factor with each try, up to the longest wait",
    run: ({ scheduling }) => {
      const tries = [1, 2, 3, 4, 5, 6, 11, 100, 1025, 5000, Number.MAX_SAFE_INTEGER];
      return [
        { initialDelayMs: 100, maxDelayMs: 1000 },
        { initialDelayMs: 100, maxDelayMs: 1000, backoffFactor: null },
        { initialDelayMs: 100, maxDelayMs: 1000, backoffFactor: 1 },
        { initialDelayMs: 10, maxDelayMs: 50, backoffFactor: 1.5 },
        { initialDelayMs: 0.1, maxDelayMs: 3, backoffFactor: 2 },
        { initialDelayMs: 1, maxDelayMs: Number.MAX_VALUE, backoffFactor: 10 },
        { initialDelayMs: 0, maxDelayMs: 0 },
        { initialDelayMs: 0, maxDelayMs: 500 },
        { initialDelayMs: -0, maxDelayMs: 500 },
        { initialDelayMs: 500, maxDelayMs: 500 },
        { initialDelayMs: 1e308, maxDelayMs: 1.7e308 },
        { initialDelayMs: Number.MIN_VALUE, maxDelayMs: 1, backoffFactor: 1.5 },
        { initialDelayMs: 3, maxDelayMs: 1e300, backoffFactor: Number.MAX_VALUE },
      ].map((changed) => {
        const log = [];
        const time = manualClock(log);
        const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, ...changed });
        for (const attempt of tries) policy.schedule(attempt).dispose();
        return [changed, log.filter((line) => line.includes("set for")).map((line) => line.replace(/^.* set for /, ""))];
      });
    },
  },
  {
    name: "a wait can only be asked for a try that is a whole number of one or more; anything else is refused at once and no timer is set",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const answers = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined, true, 1n, 1, 2, 4, 1e21].map((attempt) => {
        const answer = tried(() => policy.schedule(attempt));
        return [typeof attempt === "bigint" ? "1n" : attempt, answer.threw ?? shapeOf(answer.gave)];
      });
      return { answers, withNoTry: tried(() => policy.schedule()), log, scheduleTakes: policy.schedule.length, moreThanTheTriesAllowedIsFine: "the fourth try above, of three" };
    },
  },
  {
    name: "a wait is a promise kept with nothing when the clock runs its timer, and dropping it after that changes nothing",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const wait = policy.schedule(2);
      const answer = outcomeOf(() => wait.elapsed);
      log.push(`the timer's callback handed back ${time.run(1)}`);
      const turns = await turnsUntil(wait.elapsed);
      log.push(`dispose after the wait is over handed back ${wait.dispose()}`);
      time.runAnyway(1);
      return { log, answer: await answer, turnsUntilKept: turns, elapsedIsAPromise: wait.elapsed instanceof Promise, listed: Object.keys(wait) };
    },
  },
  {
    name: "a wait that is dropped breaks its promise with an Error named AbortError, once, and its timer is dropped",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const wait = policy.schedule(1);
      const { dispose } = wait;
      log.push(`dispose, taken off its object, handed back ${dispose()}`);
      const turns = await turnsUntil(wait.elapsed);
      wait.dispose();
      time.runAnyway(1);
      const answer = await outcomeOf(() => wait.elapsed);
      const other = policy.schedule(1);
      other.dispose();
      const otherAnswer = await outcomeOf(() => other.elapsed);
      return { log, answer, class: classOf(answer.broken), held: held(answer.broken), turnsUntilBroken: turns, aNewErrorEachTime: answer.broken !== otherAnswer.broken };
    },
  },
  {
    name: "a wait nobody listens to can be dropped, or cut short by its signal, without a broken promise going unheard",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const { unheard } = await unheardDuring(async () => {
        policy.schedule(1).dispose();
        const controller = new AbortController();
        policy.schedule(1, controller.signal);
        controller.abort(new Error("stop"));
        const aborted = new AbortController();
        aborted.abort(new Error("stopped before"));
        policy.schedule(1, aborted.signal);
      });
      return { unheard, log };
    },
  },
  {
    name: "a wait given a signal is broken with the signal's reason when it aborts, its timer dropped, and it stops listening when it ends either way",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const reason = new Error("the caller gave up");

      const aborting = new AbortController();
      const cut = policy.schedule(1, aborting.signal);
      log.push(`listening to the signal: ${listening(aborting.signal)}`);
      aborting.abort(reason);
      const cutAnswer = await outcomeOf(() => cut.elapsed);
      log.push(`after the abort, listening: ${listening(aborting.signal)}`);
      cut.dispose();

      log.push("— a wait that runs its course —");
      const patient = new AbortController();
      const kept = policy.schedule(1, patient.signal);
      time.run(2);
      log.push(`after the timer ran, listening: ${listening(patient.signal)}`);
      patient.abort(reason);
      const keptAnswer = await outcomeOf(() => kept.elapsed);

      log.push("— a wait that is dropped —");
      const unused = new AbortController();
      const dropped = policy.schedule(1, unused.signal);
      dropped.dispose();
      log.push(`after the drop, listening: ${listening(unused.signal)}`);
      unused.abort(reason);
      const droppedAnswer = await outcomeOf(() => dropped.elapsed);

      log.push("— a signal that had aborted already: the timer is set, then dropped, and nothing listens —");
      const before = new AbortController();
      before.abort(reason);
      const late = policy.schedule(3, before.signal);
      log.push(`listening: ${listening(before.signal)}`);
      const lateAnswer = await outcomeOf(() => late.elapsed);
      const turns = await turnsUntil(policy.schedule(1, before.signal).elapsed);

      return { log, cutAnswer, theReasonItself: cutAnswer.broken === reason, keptAnswer, droppedAnswer, droppedWithItsOwnError: classOf(droppedAnswer.broken), lateAnswer, lateWithTheReasonItself: lateAnswer.broken === reason, turnsUntilBrokenWhenAbortedBefore: turns };
    },
  },
  {
    name: "a signal aborted with no reason gives the runtime's own AbortError, and one whose reason is null gets a new DOMException saying the operation was aborted",
    run: async ({ scheduling }) => {
      const time = manualClock([]);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      const out = {};
      for (const [label, abort] of [["no reason", (controller) => controller.abort()], ["null", (controller) => controller.abort(null)], ["a text", (controller) => controller.abort("a text")], ["zero", (controller) => controller.abort(0)], ["false", (controller) => controller.abort(false)], ["an empty text", (controller) => controller.abort("")]]) {
        const during = new AbortController();
        const cut = policy.schedule(1, during.signal);
        abort(during);
        const duringAnswer = await outcomeOf(() => cut.elapsed);
        const before = new AbortController();
        abort(before);
        const beforeAnswer = await outcomeOf(() => policy.schedule(1, before.signal).elapsed);
        const again = await outcomeOf(() => policy.schedule(1, before.signal).elapsed);
        out[label] = {
          abortedDuring: duringAnswer,
          class: classOf(duringAnswer.broken),
          theSignalsOwnReason: Object.is(duringAnswer.broken, during.signal.reason),
          abortedBefore: beforeAnswer,
          classBefore: classOf(beforeAnswer.broken),
          theSameEachTime: Object.is(beforeAnswer.broken, again.broken),
        };
      }
      return out;
    },
  },
  {
    name: "what a wait asks of its signal: one listener for abort, once, and the same listener removed when the wait ends",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "p", maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
      log.push("— the timer runs —");
      const first = notingSignal(log);
      policy.schedule(1, first.signal);
      time.run(1);
      log.push("— the signal aborts —");
      const second = notingSignal(log);
      const cut = policy.schedule(1, second.signal);
      second.abort("the reason");
      log.push("— the wait is dropped —");
      const third = notingSignal(log);
      policy.schedule(1, third.signal).dispose();
      log.push("— the signal had aborted already —");
      const fourth = notingSignal(log, { aborted: true, reason: "an earlier reason" });
      const late = policy.schedule(1, fourth.signal);
      log.push("— a signal that had aborted with no reason kept —");
      const fifth = notingSignal(log, { aborted: true });
      const bare = policy.schedule(1, fifth.signal);
      log.push("— null in the signal's place is no signal —");
      policy.schedule(1, null).dispose();
      return { log, cut: await outcomeOf(() => cut.elapsed), late: await outcomeOf(() => late.elapsed), bare: await outcomeOf(() => bare.elapsed) };
    },
  },

  // ───────────────────────────── retry: work tried again ─────────────────────────────
  {
    name: "work that succeeds is asked once, with the number of the try and a signal, and its answer is handed on",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1000, shouldRetry: () => { log.push("shouldRetry is asked"); return true; } });
      const seen = [];
      const work = function (...given) {
        seen.push(given[1]);
        log.push(`work asked with ${given.length} things: try ${given[0]}, ${given[1] instanceof AbortSignal ? `a signal that has ${given[1].aborted ? "" : "not "}aborted` : "no signal"}, ${this === undefined ? "no this" : "a this"}`);
        return Promise.resolve({ the: "answer" });
      };
      const running = policy.runWithRetry(work);
      const withNone = await outcomeOf(() => running);
      const controller = new AbortController();
      const withOne = await outcomeOf(() => policy.runWithRetry(work, controller.signal));
      const plain = await outcomeOf(() => policy.runWithRetry(() => "not a promise"));
      const nothing = await outcomeOf(() => policy.runWithRetry(() => undefined));
      const { runWithRetry } = policy;
      const takenOff = await outcomeOf(() => runWithRetry(async (attempt) => `try ${attempt}, taken off the policy`));
      return {
        log,
        aPromise: running instanceof Promise,
        withNone,
        withOne,
        theCallersSignalItself: seen[1] === controller.signal,
        aSignalOfItsOwnOtherwise: seen[0] !== controller.signal,
        afterwardsListeningToTheCallersSignal: listening(controller.signal),
        plain,
        nothing,
        takenOff,
        runWithRetryTakes: policy.runWithRetry.length,
      };
    },
  },
  {
    name: "work that fails is tried again after each wait, up to the number of tries, and the last failure is what comes out",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, {
        name: "fetch",
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 250,
        shouldRetry(...given) {
          log.push(`shouldRetry asked with ${given.length} things: "${given[0].message}" after try ${given[1]}, ${this === undefined ? "no this" : "a this"}`);
          return "any true thing";
        },
      });
      const failures = [1, 2, 3, 4].map((nth) => new Error(`failure ${nth}`));
      const signals = [];
      let state = "still trying";
      const running = policy.runWithRetry(async (attempt, signal) => { signals.push(signal); log.push(`try ${attempt}`); throw failures[attempt - 1]; });
      const answer = outcomeOf(() => running);
      running.then(() => { state = "kept"; }, () => { state = "broken"; });
      for (const timer of [1, 2, 3]) {
        await drained();
        log.push(`— the promise is ${state}; the clock moves —`);
        time.run(timer);
      }
      await drained();
      log.push(`— the promise is ${state} —`);
      const result = await answer;
      return { log, result, theLastFailureItself: result.broken === failures[3], theSameSignalEveryTry: signals.every((signal) => signal === signals[0]), stillWaiting: time.waiting() };
    },
  },
  {
    name: "work that succeeds on a later try: its answer comes out and nothing is left waiting",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 5, initialDelayMs: 100, maxDelayMs: 1000 });
      const answer = outcomeOf(() => policy.runWithRetry(async (attempt) => {
        log.push(`try ${attempt}`);
        if (attempt < 3) throw new Error(`failure ${attempt}`);
        return `the answer of try ${attempt}`;
      }));
      await drained();
      time.run(1);
      await drained();
      time.run(2);
      return { result: await answer, log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "shouldRetry decides after each failure but the last: a no ends the tries with that failure, and it is not asked when no try is left",
    run: async ({ scheduling }) => {
      const out = [];
      for (const [label, maxAttempts, verdicts] of [["one try only", 1, []], ["no at once", 3, [false]], ["yes then no", 5, [true, false]], ["yes then nothing at all", 5, [1, undefined]], ["yes then zero", 5, ["yes", 0]], ["yes to the end", 3, [true, true, true]]]) {
        const log = [];
        const time = manualClock(log);
        const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: (error, attempt) => { log.push(`shouldRetry is asked after try ${attempt} and says ${JSON.stringify(verdicts[attempt - 1]) ?? "nothing"}`); return verdicts[attempt - 1]; } });
        const answer = outcomeOf(() => policy.runWithRetry((attempt) => { log.push(`try ${attempt}`); return Promise.reject(new Error(`failure ${attempt}`)); }));
        for (let timer = 1; timer <= maxAttempts; timer += 1) {
          await drained();
          time.run(timer);
        }
        out.push({ when: label, log: log.filter((line) => !line.startsWith("clock: timer") || line.includes("set for")), result: await answer });
      }
      return out;
    },
  },
  {
    name: "work that throws at once, or fails with something that is no error, is a failure like any other; a shouldRetry that throws ends the tries with what it threw",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: (error, attempt) => { log.push(`shouldRetry is asked about ${JSON.stringify(error) ?? String(error)}`); return true; } });
      const thrown = ["a text", undefined, null];
      const atOnce = outcomeOf(() => policy.runWithRetry((attempt) => { log.push(`try ${attempt} throws at once`); throw thrown[attempt - 1]; }));
      await drained();
      time.run(1);
      await drained();
      time.run(2);
      const atOnceResult = await atOnce;
      const judgeFails = new Error("shouldRetry failed");
      const judged = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: () => { throw judgeFails; } });
      const judgedResult = await outcomeOf(() => judged.runWithRetry(async () => { throw new Error("the work's failure"); }));
      const notCallable = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: "not a function" });
      const notCallableResult = await outcomeOf(() => notCallable.runWithRetry(async () => { throw new Error("the work's failure"); }));
      const noWork = await outcomeOf(() => scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1 }).runWithRetry());
      return { log, atOnceResult, judgedResult, theJudgesOwn: judgedResult.broken === judgeFails, notCallableResult, noWork, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a signal that has aborted before the work is asked: the work is never asked and the reason comes out",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 });
      const reason = new Error("gave up before");
      const controller = new AbortController();
      controller.abort(reason);
      const answer = await outcomeOf(() => policy.runWithRetry(async () => { log.push("the work is asked"); }, controller.signal));
      const noReason = new AbortController();
      noReason.abort(null);
      const bare = await outcomeOf(() => policy.runWithRetry(async () => { log.push("the work is asked"); }, noReason.signal));
      return { log, answer, theReasonItself: answer.broken === reason, afterwardsListening: listening(controller.signal), bare, bareClass: classOf(bare.broken), turns: await turnsUntil(policy.runWithRetry(async () => {}, controller.signal)) };
    },
  },
  {
    name: "a signal that aborts while the work is at it: the reason comes out at once, whatever the work does after, and the tries stop",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: () => { log.push("shouldRetry is asked"); return true; } });
      const reason = new Error("gave up during");
      const { result, unheard } = await unheardDuring(async () => {
        const controller = new AbortController();
        let failLater;
        let state = "still trying";
        const running = policy.runWithRetry((attempt, signal) => { log.push(`try ${attempt}`); signal.addEventListener("abort", () => log.push("the work's signal aborts")); return new Promise((resolve, reject) => { failLater = reject; }); }, controller.signal);
        const answer = outcomeOf(() => running);
        running.then(() => { state = "kept"; }, () => { state = "broken"; });
        await drained();
        log.push(`— the promise is ${state}; the signal aborts —`);
        controller.abort(reason);
        const turns = await turnsUntil(running);
        log.push(`— the promise is ${state} —`);
        failLater(new Error("the work fails long after"));
        await drained();
        return { answer: await answer, turns, listening: listening(controller.signal) - 1 };
      });
      return { log, answer: result.answer, theReasonItself: result.answer.broken === reason, turnsFromTheAbort: result.turns, afterwardsThePolicyIsListening: result.listening, unheard, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a signal that aborts during the wait between tries: the timer is dropped and the reason comes out",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 });
      const reason = new Error("gave up while waiting");
      const { result, unheard } = await unheardDuring(async () => {
        const controller = new AbortController();
        const running = policy.runWithRetry(async (attempt) => { log.push(`try ${attempt}`); throw new Error(`failure ${attempt}`); }, controller.signal);
        const answer = outcomeOf(() => running);
        await drained();
        log.push(`— waiting; listening to the signal: ${listening(controller.signal)} —`);
        controller.abort(reason);
        const turns = await turnsUntil(running);
        return { answer: await answer, turns, listening: listening(controller.signal) };
      });
      return { log, answer: result.answer, theReasonItself: result.answer.broken === reason, turnsFromTheAbort: result.turns, afterwardsListening: result.listening, unheard, stillWaiting: time.waiting() };
    },
  },
  {
    name: "work that aborts its signal and then fails: the signal's reason comes out, not the work's failure, and nobody is asked whether to retry",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: () => { log.push("shouldRetry is asked"); return true; } });
      const out = {};
      for (const [label, reason] of [["a reason", new Error("gave up")], ["null", null]]) {
        const controller = new AbortController();
        const answer = await outcomeOf(() => policy.runWithRetry(async (attempt) => { log.push(`try ${attempt} aborts the signal, then fails`); controller.abort(reason); throw new Error("the work's own failure"); }, controller.signal));
        out[label] = { answer, class: classOf(answer.broken), theSignalsOwnReason: Object.is(answer.broken, controller.signal.reason), afterwardsListening: listening(controller.signal) };
      }
      return { log, out, timersSet: time.timers.length };
    },
  },
  {
    name: "what trying again asks of its signal: one listener for the whole run, one more for each wait, each removed when its part is over",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1 });
      const noted = notingSignal(log);
      const answer = outcomeOf(() => policy.runWithRetry(async (attempt, signal) => { log.push(`try ${attempt}, given ${signal === noted.signal ? "the caller's signal itself" : "another signal"}`); throw new Error(`failure ${attempt}`); }, noted.signal));
      await drained();
      time.run(1);
      const result = await answer;
      log.push("— a run cut short during its wait —");
      const cutSignal = notingSignal(log);
      const cut = outcomeOf(() => policy.runWithRetry(async (attempt) => { log.push(`try ${attempt}`); throw new Error(`failure ${attempt}`); }, cutSignal.signal));
      await drained();
      cutSignal.abort("the reason");
      const cutAnswer = await cut;
      log.push("— a signal that had aborted already: it is listened to all the same, until the run ends —");
      const before = notingSignal(log, { aborted: true, reason: "an earlier reason" });
      const refused = await outcomeOf(() => policy.runWithRetry(async () => { log.push("the work is asked"); }, before.signal));
      return { log, result, cut: cutAnswer, refused, stillListening: [noted.live(), cutSignal.live(), before.live()] };
    },
  },
  {
    name: "the wait between tries is asked of the policy as it is then: a schedule put on it later is the one used, and the number of tries is the options' at that time",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "fetch", maxAttempts: 2, initialDelayMs: 100, maxDelayMs: 1000, backoffFactor: 3, shouldRetry: () => true };
      const policy = scheduling.createRetryPolicy(time.clock, options);
      const own = policy.schedule;
      policy.schedule = function (...given) {
        log.push(`the schedule put there later is asked with ${given.length} things: try ${given[0]}, ${given[1] === undefined ? "no signal" : "a signal"}, ${this === policy ? "as the policy's own" : "not as the policy's own"}`);
        return { elapsed: Promise.resolve(), dispose() { log.push("its wait is dropped"); } };
      };
      const first = await outcomeOf(() => policy.runWithRetry(async (attempt) => { log.push(`try ${attempt}`); throw new Error(`failure ${attempt}`); }));
      log.push("— the options are changed after the policy was made: more tries, other waits, another growth, another judge —");
      policy.schedule = own;
      Object.assign(options, { name: "renamed", maxAttempts: 3, initialDelayMs: 7, maxDelayMs: 20, backoffFactor: 1, shouldRetry: () => false });
      const second = outcomeOf(() => policy.runWithRetry(async (attempt) => { log.push(`try ${attempt}`); throw new Error(`failure ${attempt}`); }));
      await drained();
      time.run(1);
      await drained();
      time.run(2);
      return { log, first, second: await second, name: policy.name };
    },
  },
  {
    name: "work that throws at once, with a signal that aborts during the wait after it: the reason comes out, and one broken promise is left unheard; work that fails by its promise leaves none",
    run: async ({ scheduling }) => {
      const out = {};
      {
        const time = manualClock([]);
        const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 4, initialDelayMs: 1, maxDelayMs: 1 });
        const reason = new Error("gave up from inside the work");
        const { result, unheard } = await unheardDuring(async () => {
          const controller = new AbortController();
          return outcomeOf(() => policy.runWithRetry(() => { controller.abort(reason); throw new Error("failed at once"); }, controller.signal));
        });
        out["aborts its own signal, then throws at once"] = { answer: result, unheard, theUnheardIsTheReason: unheard.map((left) => left === reason), timersSet: time.timers.length };
      }
      for (const [label, work] of [["throws at once", () => { throw new Error("failed at once"); }], ["fails by its promise", async () => { throw new Error("failed by its promise"); }], ["throws at once, then by its promise", (attempt) => { if (attempt === 1) throw new Error("failed at once"); return Promise.reject(new Error("failed by its promise")); }]]) {
        const time = manualClock([]);
        const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 4, initialDelayMs: 1, maxDelayMs: 1 });
        const reason = new Error("gave up while waiting");
        const { result, unheard } = await unheardDuring(async () => {
          const controller = new AbortController();
          const answer = outcomeOf(() => policy.runWithRetry(work, controller.signal));
          await drained();
          if (label.includes("then")) {
            time.run(1);
            await drained();
          }
          controller.abort(reason);
          return answer;
        });
        out[label] = { answer: result, unheard, theUnheardIsTheReason: unheard.map((left) => left === reason) };
      }
      return out;
    },
  },
  {
    name: "how soon trying again answers, in turns of the promise queue",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1 });
      const once = scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1 });
      const turns = {
        workThatAnswers: await turnsUntil(policy.runWithRetry(async () => "answer")),
        workThatAnswersWithNoPromise: await turnsUntil(policy.runWithRetry(() => "answer")),
        workThatAnswersAfterThreeTurns: await turnsUntil(policy.runWithRetry(async () => { await null; await null; await null; return "answer"; })),
        theOnlyTryFails: await turnsUntil(once.runWithRetry(async () => { throw new Error("failed"); })),
        theOnlyTryThrowsAtOnce: await turnsUntil(once.runWithRetry(() => { throw new Error("failed"); })),
        shouldRetrySaysNo: await turnsUntil(scheduling.createRetryPolicy(time.clock, { name: "fetch", maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1, shouldRetry: () => false }).runWithRetry(async () => { throw new Error("failed"); })),
      };
      const failing = policy.runWithRetry(async () => { throw new Error("failed"); });
      turns.untilTheWaitIsAskedAfterAFailure = await turnsUntilTrue(() => time.timers.length === 1);
      time.run(1);
      turns.fromTheClockToTheLastFailure = await turnsUntil(failing);
      const atOnce = policy.runWithRetry(() => { throw new Error("failed"); });
      turns.untilTheWaitIsAskedAfterAThrowAtOnce = await turnsUntilTrue(() => time.timers.length === 2);
      time.run(2);
      turns.fromTheClockToTheLastThrow = await turnsUntil(atOnce);
      return turns;
    },
  },
  {
    name: "trying again over the machine's clock waits on the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRealRetryPolicy({ name: "fetch", maxAttempts: 3, initialDelayMs: 200, maxDelayMs: 300 });
      const result = await withTimers(log, async ({ fire }) => {
        const answer = outcomeOf(() => policy.runWithRetry(async (attempt) => { log.push(`try ${attempt}`); if (attempt < 3) throw new Error(`failure ${attempt}`); return "the answer"; }));
        await drained();
        fire(1);
        await drained();
        fire(2);
        const wait = policy.schedule(1);
        wait.dispose();
        return { answer: await answer, dropped: await outcomeOf(() => wait.elapsed) };
      });
      return { log, result, policy: policyShown(policy), parameters: scheduling.createRealRetryPolicy.length };
    },
  },

  // ───────────────────────────── the idle watchdog ─────────────────────────────
  {
    name: "a watchdog is armed at once, each kick starts the wait over, and left alone it calls onIdle once, with nothing",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createIdleWatchdogPolicy(time.clock, { name: "stream", idleMs: 30_000 });
      const watch = policy.arm(function (...given) { log.push(`onIdle runs (${given.length} things given, ${this === undefined ? "no this" : "a this"})`); return "dropped"; });
      log.push(`armed: ${JSON.stringify(shapeOf(watch))}`);
      log.push(`kick handed back ${watch.kick()}`);
      watch.kick("ignored");
      log.push(`the timer's callback handed back ${time.run(3)}`);
      return { log, armTakes: policy.arm.length, stillWaiting: time.waiting() };
    },
  },
  {
    name: "after a watchdog has barked a kick arms it again; once disposed, kicks do nothing and a second dispose does nothing",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const watch = scheduling.createIdleWatchdogPolicy(time.clock, { name: "stream", idleMs: 500 }).arm(() => { log.push("onIdle runs"); });
      time.run(1);
      log.push("— a kick after it barked: no timer to drop, a new one set —");
      watch.kick();
      time.run(2);
      watch.kick();
      log.push(`dispose handed back ${watch.dispose()}`);
      watch.dispose();
      watch.kick();
      log.push("— one disposed after it barked: nothing to drop —");
      const barked = scheduling.createIdleWatchdogPolicy(time.clock, { name: "stream", idleMs: 500 }).arm(() => { log.push("onIdle runs"); });
      time.run(4);
      barked.dispose();
      barked.kick();
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "each arming of a watchdog is its own; kick and dispose work taken off their object; the idle time is the options' at each arming and kick",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "stream", idleMs: 100 };
      const policy = scheduling.createIdleWatchdogPolicy(time.clock, options);
      const { arm } = policy;
      const first = arm(() => { log.push("the first barks"); });
      const second = policy.arm(() => { log.push("the second barks"); });
      const { kick, dispose } = first;
      kick();
      options.idleMs = 7;
      options.name = "renamed";
      second.kick();
      dispose();
      time.run(4);
      first.kick();
      return { log, name: policy.name, stillWaiting: time.waiting() };
    },
  },
  {
    name: "an onIdle that throws: the throw goes to whoever ran the timer, and the watchdog can still be kicked; a clock that runs a dropped timer still makes it bark",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const failure = new Error("onIdle failed");
      const watch = scheduling.createIdleWatchdogPolicy(time.clock, { name: "stream", idleMs: 500 }).arm(() => { log.push("onIdle runs and throws"); throw failure; });
      const ran = tried(() => time.run(1));
      watch.kick();
      watch.kick();
      log.push("— the clock runs the timer the last kick dropped: it barks, and the timer still waiting is forgotten, not dropped —");
      const anyway = tried(() => time.runAnyway(2));
      watch.kick();
      watch.dispose();
      log.push("— and after dispose —");
      const after = tried(() => time.runAnyway(4));
      return { log, ran, theSameFailure: ran.threw === failure && anyway.threw === failure && after.threw === failure, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a watchdog over the machine's clock sets and clears the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRealIdleWatchdogPolicy({ name: "stream", idleMs: 45_000 });
      await withTimers(log, ({ fire }) => {
        const watch = policy.arm(() => { log.push("onIdle runs"); });
        watch.kick();
        fire(2);
        watch.kick();
        watch.dispose();
      });
      return { log, policy: policyShown(policy), parameters: scheduling.createRealIdleWatchdogPolicy.length };
    },
  },

  // ───────────────────────────── polling ─────────────────────────────
  {
    name: "polling runs its first tick at once, with nothing, and each next tick one interval after the tick before has finished",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5_000 });
      const finish = [];
      const polling = policy.start(function (...given) {
        log.push(`tick ${finish.length + 1} runs (${given.length} things given, ${this === undefined ? "no this" : "a this"})`);
        return new Promise((resolve) => { finish.push(resolve); });
      });
      log.push(`start has returned ${JSON.stringify(shapeOf(polling))}`);
      await drained();
      log.push("— the first tick is still at it: nothing is set —");
      finish[0]("what a tick resolves to is dropped");
      const turnsToTheTimer = await turnsUntilTrue(() => time.timers.length === 1);
      log.push(`the timer's callback handed back ${time.run(1)}`);
      finish[1]();
      await drained();
      time.run(2);
      log.push(`dispose handed back ${polling.dispose()}`);
      finish[2]();
      await drained();
      return { log, turnsFromATicksEndToItsTimer: turnsToTheTimer, startTakes: policy.start.length, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a tick that fails, by throwing at once or by its promise, ends the polling quietly: nothing more is set and nothing is left unheard",
    run: async ({ scheduling }) => {
      const out = {};
      for (const [label, fail] of [["throws at once on the first tick", (nth) => { throw new Error("failed"); }], ["fails by its promise on the first tick", async () => { throw new Error("failed"); }], ["throws at once on the second tick", (nth) => { if (nth === 2) throw new Error("failed"); return Promise.resolve(); }], ["fails by its promise on the second tick", (nth) => (nth === 2 ? Promise.reject(undefined) : Promise.resolve())]]) {
        const log = [];
        const time = manualClock(log);
        const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5 });
        let ticks = 0;
        const signal = new AbortController().signal;
        const { result, unheard } = await unheardDuring(async () => {
          const started = tried(() => policy.start(() => { ticks += 1; log.push(`tick ${ticks} runs`); return fail(ticks); }, signal));
          await drained();
          const ran = tried(() => time.run(1));
          await drained();
          log.push(`listening to the signal: ${listening(signal)}`);
          started.gave.dispose();
          return { started: started.threw ?? shapeOf(started.gave), ran };
        });
        out[label] = { log, result, unheard, stillWaiting: time.waiting() };
      }
      return out;
    },
  },
  {
    name: "disposing polling drops the timer that waits; a tick still at it finishes, and no other follows; dispose can be done twice and taken off its object",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5 });
      const { start } = policy;
      const waiting = start(async () => { log.push("a tick runs"); });
      await drained();
      const { dispose } = waiting;
      log.push("— disposed while its timer waits —");
      dispose();
      waiting.dispose();
      time.runAnyway(1);
      await drained();
      log.push("— disposed while a tick is at it —");
      let finish;
      const busy = policy.start(() => { log.push("a slow tick runs"); return new Promise((resolve) => { finish = resolve; }); });
      busy.dispose();
      finish();
      await drained();
      log.push("— two pollings of one policy are separate —");
      const one = policy.start(async () => { log.push("one ticks"); });
      const two = policy.start(async () => { log.push("two ticks"); });
      await drained();
      one.dispose();
      time.run(3);
      await drained();
      two.dispose();
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "polling given a signal that has aborted already never ticks; one that aborts later stops it as dispose does, and it stops listening when it ends",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5 });
      const before = new AbortController();
      before.abort();
      const never = policy.start(async () => { log.push("a tick runs, though the signal had aborted"); }, before.signal);
      log.push(`aborted before: ${JSON.stringify(shapeOf(never))}, listening: ${listening(before.signal)}`);
      never.dispose();

      const during = new AbortController();
      policy.start(async () => { log.push("a tick runs"); }, during.signal);
      log.push(`started: listening ${listening(during.signal)}`);
      await drained();
      log.push("— the signal aborts while the timer waits —");
      during.abort();
      log.push(`listening ${listening(during.signal)}`);

      const disposed = new AbortController();
      const polling = policy.start(async () => { log.push("a tick runs"); }, disposed.signal);
      await drained();
      log.push("— disposed by hand: it stops listening, and a later abort changes nothing —");
      polling.dispose();
      log.push(`listening ${listening(disposed.signal)}`);
      disposed.abort();

      const failing = new AbortController();
      policy.start(async () => { log.push("a tick runs and fails"); throw new Error("failed"); }, failing.signal);
      await drained();
      log.push(`— after a tick failed: listening ${listening(failing.signal)} —`);
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "what polling asks of its signal: one listener for abort, once, and the same listener removed when the polling ends",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5 });
      log.push("— disposed by hand —");
      const first = notingSignal(log);
      policy.start(async () => {}, first.signal).dispose();
      log.push("— the signal aborts —");
      const second = notingSignal(log);
      policy.start(async () => {}, second.signal);
      await drained();
      second.abort("the reason is not looked at");
      log.push("— the signal had aborted already —");
      const third = notingSignal(log, { aborted: true });
      policy.start(async () => { log.push("a tick runs"); }, third.signal);
      log.push("— null in the signal's place is no signal —");
      policy.start(async () => {}, null).dispose();
      return log;
    },
  },
  {
    name: "a tick that hands back no promise: the runtime's refusal comes out of start, or of the clock's run, and the polling is left as it was, still listening",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createPollingPolicy(time.clock, { name: "inbox", intervalMs: 5 });
      const signal = new AbortController().signal;
      const atStart = tried(() => policy.start(() => { log.push("the first tick hands back nothing"); }, signal));
      log.push(`after start failed, listening to the signal: ${listening(signal)}`);
      let ticks = 0;
      const later = policy.start(() => { ticks += 1; log.push(`tick ${ticks} runs`); return ticks === 1 ? Promise.resolve() : "a text, not a promise"; });
      await drained();
      const atRun = tried(() => time.run(1));
      await drained();
      log.push("— nothing is set after that; dispose still works —");
      later.dispose();
      const noTick = tried(() => policy.start());
      return { log, atStart, atRun, noTickEndsQuietly: noTick.threw ?? shapeOf(noTick.gave), stillWaiting: time.waiting() };
    },
  },
  {
    name: "a tick may hand back any thenable; the interval is the options' at the time each tick ends; a clock that runs a dropped timer starts no tick",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "inbox", intervalMs: 5 };
      const policy = scheduling.createPollingPolicy(time.clock, options);
      const polling = policy.start(() => ({
        then(...given) {
          log.push(`the thenable is asked with ${given.length} things: ${given.map((each) => typeof each).join(", ")}`);
          given[0]();
        },
      }));
      options.intervalMs = 0;
      options.name = "renamed";
      time.run(1);
      polling.dispose();
      log.push("— disposed; the clock runs the dropped timer all the same —");
      time.runAnyway(2);
      return { log, name: policy.name };
    },
  },
  {
    name: "polling over the machine's clock sets and clears the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRealPollingPolicy({ name: "inbox", intervalMs: 60_000 });
      await withTimers(log, async ({ fire }) => {
        const polling = policy.start(async () => { log.push("a tick runs"); });
        await drained();
        fire(1);
        await drained();
        polling.dispose();
      });
      return { log, policy: policyShown(policy), parameters: scheduling.createRealPollingPolicy.length };
    },
  },

  // ───────────────────────────── expiry ─────────────────────────────
  {
    name: "expiry keeps one timer for each key: arming a key again drops its earlier timer, and a timer that runs calls its own onExpire, with nothing",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createExpiryPolicy(time.clock, { name: "typing", ttlMs: 4_000 });
      const typing = (who) => function (...given) { log.push(`${who} expires (${given.length} things given, ${this === undefined ? "no this" : "a this"})`); return "dropped"; };
      const ada = policy.arm("ada", typing("ada"));
      log.push(`armed: ${JSON.stringify(shapeOf(ada))}`);
      policy.arm("bo", typing("bo"));
      policy.arm("ada", typing("ada, armed again"));
      policy.arm("cy", typing("cy"));
      log.push(`the timer's callback handed back ${time.run(2)}`);
      time.run(3);
      log.push("— ada is armed after her timer ran: nothing to drop —");
      policy.arm("ada", typing("ada, a third time"));
      return { log, armTakes: policy.arm.length, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a handle drops only its own timer: one from an earlier arming of the key does nothing, nor does one whose timer has run, nor a second dispose",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createExpiryPolicy(time.clock, { name: "typing", ttlMs: 4_000 });
      const first = policy.arm("ada", () => { log.push("the first arming expires"); });
      const second = policy.arm("ada", () => { log.push("the second arming expires"); });
      log.push(`the earlier handle: dispose handed back ${first.dispose()}`);
      const { dispose } = second;
      log.push(`the current handle, taken off its object: dispose handed back ${dispose()}`);
      second.dispose();
      log.push("— armed again after the drop: nothing to drop —");
      const third = policy.arm("ada", () => { log.push("the third arming expires"); });
      time.run(3);
      third.dispose();
      log.push("— armed again after it ran, then the old handles are tried once more —");
      policy.arm("ada", () => { log.push("the fourth arming expires"); });
      first.dispose();
      second.dispose();
      third.dispose();
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "a timer that runs forgets its key before calling onExpire, so an onExpire may arm the key again, and one that throws leaves the key free",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createExpiryPolicy(time.clock, { name: "typing", ttlMs: 4_000 });
      let rounds = 0;
      const again = () => {
        rounds += 1;
        log.push(`round ${rounds} expires`);
        if (rounds < 3) policy.arm("ada", again);
      };
      policy.arm("ada", again);
      time.run(1);
      time.run(2);
      time.run(3);
      const failure = new Error("onExpire failed");
      policy.arm("bo", () => { log.push("bo expires and throws"); throw failure; });
      const ran = tried(() => time.run(4));
      log.push("— bo is armed again: nothing to drop —");
      policy.arm("bo", () => {});
      return { log, ran, theSameFailure: ran.threw === failure, stillWaiting: time.waiting() };
    },
  },
  {
    name: "expiry trusts its clock: a dropped timer that runs all the same forgets the key's newer timer, whose handle then does nothing",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createExpiryPolicy(time.clock, { name: "typing", ttlMs: 4_000 });
      policy.arm("ada", () => { log.push("the first arming expires"); });
      const second = policy.arm("ada", () => { log.push("the second arming expires"); });
      time.runAnyway(1);
      log.push("— the newer handle is disposed: its timer is not dropped —");
      second.dispose();
      log.push("— the key is armed again: the second timer is not dropped either —");
      policy.arm("ada", () => { log.push("the third arming expires"); });
      time.run(2);
      log.push("— the second timer ran and forgot the third; the third's own run finds nothing to forget and still expires —");
      time.run(3);
      return { log, stillWaiting: time.waiting() };
    },
  },
  {
    name: "keys are told apart as a map tells them apart, two policies share nothing, and the time to live is the options' at each arming",
    run: ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "typing", ttlMs: 100 };
      const policy = scheduling.createExpiryPolicy(time.clock, options);
      const other = scheduling.createExpiryPolicy(time.clock, { name: "other", ttlMs: 9 });
      const { arm } = policy;
      const object = { a: "key" };
      for (const [label, key] of [["the text 1", "1"], ["the number 1", 1], ["the empty text", ""], ["nothing", undefined], ["null", null], ["not a number", Number.NaN], ["zero", 0], ["an object", object]]) {
        log.push(`— ${label} —`);
        arm(key, () => {});
      }
      log.push("— the other policy arms the text 1: nothing of the first is dropped —");
      other.arm("1", () => {});
      options.ttlMs = 7;
      options.name = "renamed";
      for (const [label, key] of [["the text 1 again", "1"], ["not a number again", Number.NaN], ["minus zero", -0], ["the same object", object], ["an object that looks the same", { a: "key" }], ["no key at all", undefined]]) {
        log.push(`— ${label} —`);
        policy.arm(key, () => {});
      }
      return { log, name: policy.name, stillWaiting: time.waiting() };
    },
  },
  {
    name: "expiry over the machine's clock sets and clears the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRealExpiryPolicy({ name: "typing", ttlMs: 6_000 });
      await withTimers(log, ({ fire }) => {
        policy.arm("ada", () => { log.push("ada expires"); });
        const again = policy.arm("ada", () => { log.push("ada, armed again, expires"); });
        policy.arm("bo", () => { log.push("bo expires"); });
        fire(3);
        again.dispose();
      });
      return { log, policy: policyShown(policy), parameters: scheduling.createRealExpiryPolicy.length };
    },
  },

  // ───────────────────────────── the deadline ─────────────────────────────
  {
    name: "work that finishes within its deadline: its answer comes out, the timer is dropped, and the signal it was given never aborts",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      const seen = [];
      const work = function (...given) {
        seen.push(given[0]);
        log.push(`work asked with ${given.length} thing: ${given[0] instanceof AbortSignal ? `a signal that has ${given[0].aborted ? "" : "not "}aborted` : "no signal"}, ${this === undefined ? "no this" : "a this"}`);
        return Promise.resolve({ the: "answer" });
      };
      const running = policy.run(work);
      log.push("run has returned");
      const answer = await outcomeOf(() => running);
      const caller = new AbortController();
      const withSignal = await outcomeOf(() => policy.run(work, caller.signal));
      const plain = await outcomeOf(() => policy.run(() => "not a promise"));
      const nothing = await outcomeOf(() => policy.run(() => undefined));
      const { run } = policy;
      const takenOff = await outcomeOf(() => run(async () => "taken off the policy"));
      return {
        log,
        aPromise: running instanceof Promise,
        answer,
        withSignal,
        aSignalOfItsOwnEachRun: seen[0] !== seen[1] && seen[1] !== caller.signal,
        neitherAbortedAfterwards: seen.map((signal) => signal.aborted),
        afterwardsListeningToTheCallersSignal: listening(caller.signal),
        plain,
        nothing,
        takenOff,
        runTakes: policy.run.length,
        stillWaiting: time.waiting(),
      };
    },
  },
  {
    name: "work that fails within its deadline, by its promise or by throwing at once: its failure comes out and the timer is dropped",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      const failure = new Error("the work failed");
      const caller = new AbortController();
      const byPromise = await outcomeOf(() => policy.run(async () => { throw failure; }, caller.signal));
      log.push("— thrown at once —");
      const atOnce = await outcomeOf(() => policy.run(() => { throw failure; }, caller.signal));
      log.push("— failing with nothing at all —");
      const withNothing = await outcomeOf(() => policy.run(() => Promise.reject(undefined)));
      log.push("— no work given —");
      const noWork = await outcomeOf(() => policy.run());
      return { log, byPromise, atOnce, theSameFailure: byPromise.broken === failure && atOnce.broken === failure, withNothing, noWork, afterwardsListeningToTheCallersSignal: listening(caller.signal), stillWaiting: time.waiting() };
    },
  },
  {
    name: "work that outlasts its deadline: a deadline error naming the policy comes out, the work's signal aborts with that same error, and what the work does after is not heard",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      const caller = new AbortController();
      const { result, unheard } = await unheardDuring(async () => {
        let signal;
        let failLater;
        let state = "still running";
        const running = policy.run((given) => {
          signal = given;
          given.addEventListener("abort", () => log.push(`the work's signal aborts; the run is ${state}`));
          return new Promise((resolve, reject) => { failLater = reject; });
        }, caller.signal);
        const answer = outcomeOf(() => running);
        running.then(() => { state = "kept"; }, () => { state = "broken"; });
        await drained();
        log.push(`— the run is ${state}; listening to the caller's signal: ${listening(caller.signal)}; the clock moves —`);
        log.push(`the timer's callback handed back ${time.run(1)}`);
        const turns = await turnsUntil(running);
        log.push(`— the run is ${state} —`);
        failLater(new Error("the work fails long after"));
        await drained();
        const settled = await answer;
        return { answer: settled, turns, shown: shown(settled.broken), isDeadlineError: settled.broken instanceof scheduling.DeadlineExceededError, theSignalsReasonIsTheError: signal.reason === settled.broken, signalAborted: signal.aborted };
      });
      return { log, ...result, unheard, afterwardsListeningToTheCallersSignal: listening(caller.signal), stillWaiting: time.waiting() };
    },
  },
  {
    name: "a deadline whose caller had given up already: the reason comes out, no timer is set and the work is never asked",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      const reason = new Error("gave up before");
      const caller = new AbortController();
      caller.abort(reason);
      const answer = await outcomeOf(() => policy.run(async () => { log.push("the work is asked"); }, caller.signal));
      const bare = new AbortController();
      bare.abort(null);
      const withNull = await outcomeOf(() => policy.run(async () => { log.push("the work is asked"); }, bare.signal));
      const again = await outcomeOf(() => policy.run(async () => {}, bare.signal));
      const plainAbort = new AbortController();
      plainAbort.abort();
      const withDefault = await outcomeOf(() => policy.run(async () => {}, plainAbort.signal));
      return {
        log,
        answer,
        theReasonItself: answer.broken === reason,
        listening: listening(caller.signal),
        withNull,
        withNullClass: classOf(withNull.broken),
        aNewOneEachTime: withNull.broken !== again.broken,
        withDefault,
        theSignalsOwnDefault: withDefault.broken === plainAbort.signal.reason,
        turns: await turnsUntil(policy.run(async () => {}, caller.signal)),
        timersSet: time.timers.length,
      };
    },
  },
  {
    name: "a deadline whose caller gives up while the work is at it: the reason comes out, the work's signal aborts with it, the timer is dropped and nothing listens after",
    run: async ({ scheduling }) => {
      const out = {};
      for (const [label, abort] of [["with a reason", (controller) => controller.abort(new Error("gave up during"))], ["with no reason", (controller) => controller.abort()], ["with null", (controller) => controller.abort(null)]]) {
        const log = [];
        const time = manualClock(log);
        const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
        const caller = new AbortController();
        let signal;
        const running = policy.run((given) => { signal = given; given.addEventListener("abort", () => log.push("the work's signal aborts")); return new Promise(() => {}); }, caller.signal);
        const answer = outcomeOf(() => running);
        await drained();
        log.push(`— listening to the caller's signal: ${listening(caller.signal)}; the caller gives up —`);
        abort(caller);
        const turns = await turnsUntil(running);
        const settled = await answer;
        out[label] = {
          log,
          answer: settled,
          class: classOf(settled.broken),
          theCallersReasonItself: Object.is(settled.broken, caller.signal.reason),
          theWorksSignalHasTheSameReason: Object.is(signal.reason, settled.broken),
          turnsFromTheAbort: turns,
          afterwardsListening: listening(caller.signal),
          stillWaiting: time.waiting(),
        };
      }
      return out;
    },
  },
  {
    name: "work that makes its caller give up, or its deadline pass, from inside itself: if it then never answers the reason or the deadline error comes out; if it fails, its own failure does, and when it fails by throwing at once a broken promise is left unheard",
    run: async ({ scheduling }) => {
      const out = {};
      const reason = new Error("gave up from inside the work");
      for (const [label, work] of [
        ["gives up, then never answers", ({ caller }) => { caller.abort(reason); return new Promise(() => {}); }],
        ["gives up, then fails by its promise", ({ caller }) => { caller.abort(reason); return Promise.reject(new Error("the work's own failure")); }],
        ["gives up, then throws at once", ({ caller }) => { caller.abort(reason); throw new Error("the work's own failure"); }],
        ["the deadline passes, then never answers", ({ time }) => { time.run(1); return new Promise(() => {}); }],
        ["the caller gives up, then the deadline passes, then never answers", ({ caller, time }) => { caller.abort(reason); time.run(1); return new Promise(() => {}); }],
        ["the deadline passes, then the caller gives up, then never answers", ({ caller, time }) => { time.run(1); caller.abort(reason); return new Promise(() => {}); }],
        ["the deadline passes, then throws at once", ({ time }) => { time.run(1); throw new Error("the work's own failure"); }],
      ]) {
        const log = [];
        const time = manualClock(log);
        const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
        const caller = new AbortController();
        let signal;
        const { result, unheard } = await unheardDuring(() => outcomeOf(() => policy.run((given) => { signal = given; return work({ caller, time }); }, caller.signal)));
        out[label] = {
          log,
          answer: result,
          theReasonItself: result.broken === reason,
          theWorksSignal: { aborted: signal.aborted, withWhatCameOut: signal.reason === result.broken, withTheReason: signal.reason === reason, withADeadlineError: signal.reason instanceof scheduling.DeadlineExceededError },
          unheard,
          theUnheardIsWhatTheWorksSignalAbortedWith: unheard.map((left) => left === signal.reason),
          afterwardsListening: listening(caller.signal),
        };
      }
      return out;
    },
  },
  {
    name: "what a deadline asks of its caller's signal: one listener for abort, once, removed after the timer is dropped, however the run ends",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      log.push("— the work answers —");
      await outcomeOf(() => policy.run(async () => "answer", notingSignal(log).signal));
      log.push("— the work throws at once —");
      await outcomeOf(() => policy.run(() => { throw new Error("failed"); }, notingSignal(log).signal));
      log.push("— the deadline passes —");
      const passed = outcomeOf(() => policy.run(() => new Promise(() => {}), notingSignal(log).signal));
      await drained();
      time.run(3);
      await passed;
      log.push("— the caller gives up —");
      const given = notingSignal(log);
      const gaveUp = outcomeOf(() => policy.run(() => new Promise(() => {}), given.signal));
      await drained();
      given.abort("the reason");
      const gaveUpAnswer = await gaveUp;
      log.push("— the caller had given up already —");
      const before = await outcomeOf(() => policy.run(async () => { log.push("the work is asked"); }, notingSignal(log, { aborted: true, reason: "an earlier reason" }).signal));
      log.push("— null in the signal's place is no signal —");
      const withNull = await outcomeOf(() => policy.run(async () => "answer", null));
      return { log, gaveUp: gaveUpAnswer, before, withNull };
    },
  },
  {
    name: "the error of a passed deadline names the policy as the options name it then, and the time allowed is the options' at each run",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const options = { name: "connect", timeoutMs: 8_000 };
      const policy = scheduling.createDeadlinePolicy(time.clock, options);
      const first = outcomeOf(() => policy.run(() => new Promise(() => {})));
      options.name = "renamed";
      options.timeoutMs = 3;
      await drained();
      time.run(1);
      const second = outcomeOf(() => policy.run(() => new Promise(() => {})));
      await drained();
      time.run(2);
      return { log, name: policy.name, first: await first, second: await second };
    },
  },
  {
    name: "a deadline over a clock that refuses: the refusal comes out, the work is never asked, and the listener put on the caller's signal is left there, to break a promise nobody hears if the caller gives up later",
    run: async ({ scheduling }) => {
      const log = [];
      const refusal = new RangeError("the clock refused");
      const policy = scheduling.createDeadlinePolicy({ schedule() { log.push("the clock is asked and refuses"); throw refusal; } }, { name: "connect", timeoutMs: 8_000 });
      const caller = new AbortController();
      const answer = await outcomeOf(() => policy.run(async () => { log.push("the work is asked"); }, caller.signal));
      const leftListening = listening(caller.signal);
      const { unheard } = await unheardDuring(async () => { caller.abort(new Error("gave up after")); });
      return { log, answer, theClocksOwn: answer.broken === refusal, leftListening, unheardWhenTheCallerGivesUpLater: unheard };
    },
  },
  {
    name: "a deadline trusts its clock: a timer that runs after the work has answered still aborts the signal the work was given, and nothing else changes",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      let signal;
      const { result, unheard } = await unheardDuring(async () => {
        const answer = await outcomeOf(() => policy.run(async (given) => { signal = given; return "the answer"; }));
        log.push(`— the work has answered; its signal has ${signal.aborted ? "" : "not "}aborted; the dropped timer runs all the same —`);
        time.runAnyway(1);
        return answer;
      });
      return { log, answer: result, signalAborted: signal.aborted, reason: shown(signal.reason), unheard };
    },
  },
  {
    name: "how soon a deadline answers, in turns of the promise queue",
    run: async ({ scheduling }) => {
      const time = manualClock([]);
      const policy = scheduling.createDeadlinePolicy(time.clock, { name: "connect", timeoutMs: 8_000 });
      const aborted = new AbortController();
      aborted.abort();
      const turns = {
        workThatAnswers: await turnsUntil(policy.run(async () => "answer")),
        workThatAnswersWithNoPromise: await turnsUntil(policy.run(() => "answer")),
        workThatAnswersAfterThreeTurns: await turnsUntil(policy.run(async () => { await null; await null; await null; return "answer"; })),
        workThatFails: await turnsUntil(policy.run(async () => { throw new Error("failed"); })),
        workThatThrowsAtOnce: await turnsUntil(policy.run(() => { throw new Error("failed"); })),
        aCallerWhoHadGivenUp: await turnsUntil(policy.run(async () => "answer", aborted.signal)),
      };
      const passing = policy.run(() => new Promise(() => {}));
      await drained();
      time.run(time.timers.length);
      turns.fromTheClockToTheDeadlineError = await turnsUntil(passing);
      return turns;
    },
  },
  {
    name: "a deadline over the machine's clock sets and clears the machine's timers",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createDeadlinePolicy(scheduling.realClock, { name: "connect", timeoutMs: 15_000 });
      const result = await withTimers(log, async ({ fire }) => {
        const inTime = await outcomeOf(() => policy.run(async () => "the answer"));
        const late = outcomeOf(() => policy.run(() => new Promise(() => {})));
        await drained();
        fire(2);
        return { inTime, late: await late };
      });
      return { log, result };
    },
  },

  // ───────────────────────────── the clock a policy is given ─────────────────────────────
  {
    name: "a policy asks its clock for nothing but timers: never the time, and each timer with a delay and a callback, as the clock's own",
    run: async ({ scheduling }) => {
      const log = [];
      const time = manualClock(log);
      const debounced = scheduling.createDebouncePolicy(time.clock, RIGHT.debounce).wrap(() => {});
      debounced();
      debounced.dispose();
      const retry = scheduling.createRetryPolicy(time.clock, RIGHT.retry);
      retry.schedule(1).dispose();
      const watch = scheduling.createIdleWatchdogPolicy(time.clock, RIGHT.watchdog).arm(() => {});
      watch.dispose();
      const polling = scheduling.createPollingPolicy(time.clock, RIGHT.polling).start(async () => {});
      await drained();
      polling.dispose();
      scheduling.createExpiryPolicy(time.clock, RIGHT.expiry).arm("key", () => {}).dispose();
      await scheduling.createDeadlinePolicy(time.clock, RIGHT.deadline).run(async () => {});
      return log;
    },
  },
  {
    name: "over a clock that runs timers at once, a debounced function and a watchdog run inside the very call that sets them, and the timer that has run is dropped at the next call",
    run: ({ scheduling }) => {
      const log = [];
      const clock = hastyClock(log);
      const save = scheduling.createDebouncePolicy(clock, { name: "save", delayMs: 0 }).wrap((what) => { log.push(`fn runs with ${what}`); });
      save("first");
      log.push("— the first call has returned; a second —");
      save("second");
      log.push("— dispose, then a call after it —");
      save.dispose();
      save("third");
      log.push("— a watchdog —");
      const watch = scheduling.createIdleWatchdogPolicy(clock, { name: "stream", idleMs: 0 }).arm(() => { log.push("onIdle runs"); });
      log.push("— arm has returned; a kick —");
      watch.kick();
      log.push("— dispose, then a kick after it —");
      watch.dispose();
      watch.kick();
      return log;
    },
  },
  {
    name: "over a clock that runs timers at once, polling ticks again as soon as each tick has finished; disposed from inside a tick nothing is dropped, disposed between ticks the timer that has run is",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createPollingPolicy(hastyClock(log), { name: "inbox", intervalMs: 1 });
      let ticks = 0;
      const fromInside = policy.start(() => {
        ticks += 1;
        log.push(`tick ${ticks} runs`);
        if (ticks === 3) {
          log.push("the third tick disposes the polling");
          fromInside.dispose();
        }
        return Promise.resolve();
      });
      await drained();
      fromInside.dispose();
      log.push("— another polling, whose second tick takes its time —");
      let later = 0;
      let finish;
      const fromOutside = policy.start(() => {
        later += 1;
        log.push(`tick ${later} runs`);
        return later === 2 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve();
      });
      await drained();
      log.push("— disposed while the second tick is at it —");
      fromOutside.dispose();
      finish();
      await drained();
      return log;
    },
  },
  {
    name: "over a clock that runs timers at once, an expiry calls onExpire inside the arming and keeps the key as armed, with a timer that has run",
    run: ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createExpiryPolicy(hastyClock(log), { name: "typing", ttlMs: 0 });
      const first = policy.arm("ada", () => { log.push("the first arming expires"); });
      log.push("— the first arming has returned; the key is armed again —");
      const second = policy.arm("ada", () => { log.push("the second arming expires"); });
      log.push("— the first handle is disposed: nothing; then the second, twice —");
      first.dispose();
      second.dispose();
      second.dispose();
      return log;
    },
  },
  {
    name: "over a clock that runs timers at once, a deadline has passed before the work is asked: the work gets a signal aborted with the deadline error, and still wins if it answers at once",
    run: async ({ scheduling }) => {
      const out = {};
      for (const [label, work] of [
        ["answers at once", async () => "the answer"],
        ["answers with no promise", () => "the answer"],
        ["answers a turn later", async () => { await null; return "the answer"; }],
        ["never answers", () => new Promise(() => {})],
        ["fails by its promise", async () => { throw new Error("the work's own failure"); }],
        ["throws at once", () => { throw new Error("the work's own failure"); }],
      ]) {
        const log = [];
        const policy = scheduling.createDeadlinePolicy(hastyClock(log), { name: "connect", timeoutMs: 0 });
        let signal;
        const { result, unheard } = await unheardDuring(() => outcomeOf(() => policy.run((given) => {
          signal = given;
          log.push(`the work is asked, with a signal that has ${given.aborted ? "" : "not "}aborted`);
          return work();
        })));
        out[label] = { log, answer: result, theWorksSignalAbortedWithADeadlineError: signal.reason instanceof scheduling.DeadlineExceededError, unheard, theUnheardIsThatError: unheard.map((left) => left === signal.reason) };
      }
      return out;
    },
  },
  {
    name: "over a clock that runs timers at once, a wait before another try is over before its signal is looked at: it is kept even if the signal had aborted, and the listener it then adds is never removed",
    run: async ({ scheduling }) => {
      const log = [];
      const policy = scheduling.createRetryPolicy(hastyClock(log), { name: "fetch", maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 });
      const plain = policy.schedule(1);
      const plainAnswer = await outcomeOf(() => plain.elapsed);
      log.push("— with a signal —");
      const noted = notingSignal(log);
      const withSignal = policy.schedule(1, noted.signal);
      const withSignalAnswer = await outcomeOf(() => withSignal.elapsed);
      log.push("— dropped after that, then the signal aborts —");
      withSignal.dispose();
      noted.abort("too late to matter");
      log.push("— with a signal that had aborted already —");
      const before = notingSignal(log, { aborted: true, reason: "an earlier reason" });
      const lateAnswer = await outcomeOf(() => policy.schedule(1, before.signal).elapsed);
      log.push("— work that fails twice, then answers, with a real signal —");
      const controller = new AbortController();
      const run = await outcomeOf(() => policy.runWithRetry(async (attempt) => {
        log.push(`try ${attempt}`);
        if (attempt < 3) throw new Error(`failure ${attempt}`);
        return "the answer";
      }, controller.signal));
      return { log, plainAnswer, withSignalAnswer, lateAnswer, stillListeningToTheNotedSignal: noted.live(), run, leftListeningToTheRealSignalAfterTheRun: listening(controller.signal) };
    },
  },
  {
    name: "the policies over the machine's clock ask that clock for their timers as it is at the time, so a schedule put on it later is the one they use",
    run: async ({ scheduling }, tools) => {
      const fresh = (await tools.fresh()).scheduling;
      const log = [];
      const time = manualClock(log);
      const policies = {
        debounce: fresh.createRealDebouncePolicy(RIGHT.debounce),
        retry: fresh.createRealRetryPolicy(RIGHT.retry),
        watchdog: fresh.createRealIdleWatchdogPolicy(RIGHT.watchdog),
        polling: fresh.createRealPollingPolicy(RIGHT.polling),
        expiry: fresh.createRealExpiryPolicy(RIGHT.expiry),
      };
      const own = fresh.realClock.schedule;
      fresh.realClock.schedule = function (delayMs, callback) {
        log.push(`the schedule put on the machine's clock is asked, ${this === fresh.realClock ? "as that clock's own" : "not as that clock's own"}`);
        return time.clock.schedule(delayMs, callback);
      };
      try {
        policies.debounce.wrap(() => {})();
        policies.retry.schedule(1);
        policies.watchdog.arm(() => {});
        policies.polling.start(async () => {});
        await drained();
        policies.expiry.arm("key", () => {});
      } finally {
        fresh.realClock.schedule = own;
      }
      return { log, theClockOfAnotherLoadIsAnother: fresh.realClock !== scheduling.realClock, andWasLeftAlone: scheduling.realClock.schedule !== fresh.realClock.schedule };
    },
  },
];
