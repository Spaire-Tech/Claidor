/**
 * The context handed down every call of the engine: what can cancel the work, the values and names it carries,
 * the logger that writes a line for it, and the spans that time it.
 *
 * Three things here stand in for the machine, each put back when a scenario ends:
 * - the clock and the timers (`Date`, `setTimeout`, `clearTimeout` on the global object), so that a time is a
 *   fixed number and a timer is only what was asked of it;
 * - the console, so that a written line is kept instead of shown;
 * - OpenTelemetry's tracer provider, so that a span is only what was asked of it.
 *
 * The terminal backend decides once, when the part is loaded, whether it writes in colour (from
 * `process.env` and `process.stdout`) and which console it writes to. The load the test makes therefore
 * depends on where the test runs (a terminal or not). The scenarios that record its lines ask for a load
 * of their own (`tools.fresh()`) while a stand-in `process` is on the global object, which fixes that
 * choice, and that is also how the choice itself is recorded.
 */
import { getEventListeners } from "node:events";
import vm from "node:vm";
import openTelemetry from "@opentelemetry/api";

const { context: activeContexts, trace, ROOT_CONTEXT, createContextKey } = openTelemetry;

export const part = "packages/context";
export const modules = {
  abortReason: "source/packages/context/abort-reason.ts",
  browserBridge: "source/packages/context/browser-bridge.ts",
  core: "source/packages/context/core.ts",
  index: "source/packages/context/index.ts",
  logger: "source/packages/context/logger.ts",
  otel: "source/packages/context/otel.ts",
};

/** 13 November 2026, 09:08:07.065 UTC: the time the stand-in clock starts at. */
const AT = Date.UTC(2026, 10, 13, 9, 8, 7, 65);

/**
 * What a call gives back, or what it throws, kept either way. When the runtime itself refuses to call
 * what is not a function, its sentence names the variable as the build happened to call it
 * ("context2.get is not a function"), which is no part of what the code does: such an error is kept by
 * its class alone.
 */
function attempt(run) {
  try {
    return { returned: run() };
  } catch (error) {
    if (error instanceof TypeError && error.message.endsWith(" is not a function")) return { threw: "a TypeError of the runtime's own: what was to be called is not a function" };
    return { threw: error };
  }
}

/** Things on the global object replaced while `run` runs (and until its promise settles), then put back. */
function withGlobals(standIns, run) {
  const kept = Object.keys(standIns).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const putBack = () => {
    for (const [name, descriptor] of kept) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  for (const [name, value] of Object.entries(standIns)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: false });
  let result;
  try {
    result = run();
  } catch (error) {
    putBack();
    throw error;
  }
  if (result !== null && typeof result === "object" && typeof result.then === "function") return result.finally(putBack);
  putBack();
  return result;
}

/** A clock that starts at `at` and moves `step` ms each time the time is read; `state.reads` counts the readings, and `onRead` is told of each. */
function clock(at = AT, step = 1_000, onRead = () => {}) {
  const RealDate = Date;
  const state = { reads: 0 };
  const read = () => {
    onRead();
    return at + step * state.reads++;
  };
  function StandInDate(...given) {
    return given.length === 0 ? new RealDate(read()) : new RealDate(...given);
  }
  StandInDate.prototype = RealDate.prototype;
  StandInDate.now = read;
  StandInDate.UTC = RealDate.UTC;
  StandInDate.parse = RealDate.parse;
  return { Date: StandInDate, state };
}

/** Timers that only write down what is asked of them; `ring(n)` runs the callback of the nth timer asked for. */
function timers() {
  const asked = [];
  const callbacks = [];
  return {
    asked,
    globals: {
      setTimeout: (callback, ms, ...more) => {
        const id = { timer: callbacks.length };
        callbacks.push(callback);
        asked.push({ set: id.timer, ms, more: more.length });
        return id;
      },
      clearTimeout: (id) => {
        asked.push({ clear: id?.timer });
      },
    },
    ring: (n) => {
      asked.push({ ring: n });
      callbacks[n]();
    },
  };
}

/** What a context says of itself. */
const sees = (context) => ({ canceled: context.canceled, reason: context.reason, name: context.name, path: context.getPath() });
/** How many listeners wait for a context's signal to abort. */
const listening = (context) => getEventListeners(context.signal, "abort").length;
/** How many of the machine's real timers are waiting. */
const realTimers = () => process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;

/** A backend that keeps what it is handed. A context is told by its label, never written out. */
function keeping(labels = new Map()) {
  const entries = [];
  const label = (context) => labels.get(context) ?? (context === undefined ? "none" : "another context");
  const backend = {
    log(context, entry) {
      entries.push({
        calledOnTheBackend: this === backend,
        context: label(context),
        entry: Object.fromEntries(Object.entries(entry).map(([field, value]) => [field, field === "context" ? label(value) : value])),
      });
      return "what the backend gives back";
    },
  };
  return { backend, entries };
}

/** The lines written through a console while `run` runs, each under the method it went through. */
function written(run, target = console) {
  const lines = [];
  const kept = {};
  for (const method of ["log", "warn", "error"]) {
    kept[method] = target[method];
    target[method] = (...given) => {
      lines.push({ [method]: given.length === 1 ? given[0] : given });
    };
  }
  let outcome;
  try {
    outcome = attempt(run);
  } finally {
    Object.assign(target, kept);
  }
  return "threw" in outcome ? { lines, threw: outcome.threw } : lines;
}

/** A text without the codes that colour it. */
const colourless = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, "");

/** The part loaded once more while `standIns` are on the global object: what it reads only when it is loaded, it reads from them. */
const loadedWith = (tools, standIns) => withGlobals(standIns, () => tools.fresh());

const keptLoads = new WeakMap();
/** One such load for all the scenarios of a run, kept under the logger module the run handed out. */
function loadKept(logger, tools, name, standIns) {
  if (!keptLoads.has(logger)) keptLoads.set(logger, new Map());
  const loads = keptLoads.get(logger);
  if (!loads.has(name)) loads.set(name, loadedWith(tools, standIns));
  return loads.get(name);
}
/** The part as it is where nothing asks for colour. */
const plainLoad = (logger, tools) => loadKept(logger, tools, "plain", { process: { env: {}, stdout: { isTTY: false } } });
/** The part as it is where colour is asked for. */
const colouredLoad = (logger, tools) => loadKept(logger, tools, "coloured", { process: { env: { FORCE_COLOR: "1" } } });
/** The terminal backend of a load. */
const terminalOf = (loaded) => loaded.logger.loggerKey.defaultValue;

/** An entry as a logger makes it, at the stand-in clock's start unless told. */
const entryOf = (fields) => ({ level: "info", message: "a line", timestamp: new Date(AT), ...fields });
/** How the terminal backend writes one value added to a line: the text after "meta=". */
function shown(terminal, value) {
  const lines = written(() => terminal.log(undefined, entryOf({ metadata: { v: value } })));
  if (!Array.isArray(lines)) return { threw: lines.threw, wrote: lines.lines.length };
  const text = lines[0].log;
  return text.slice(text.indexOf("meta=") + 5);
}
/** `innermost` wrapped `levels` times. */
function nested(levels, innermost, wrap = (inner) => ({ in: inner })) {
  let value = innermost;
  for (let level = 0; level < levels; level += 1) value = wrap(value);
  return value;
}

const ACTIVE = createContextKey("recorded: which context was active");
/** A context manager that says one marked context is active. */
const markedContexts = {
  active: () => ROOT_CONTEXT.setValue(ACTIVE, "the stand-in's active context"),
  with: (_context, fn, thisArg, ...given) => fn.call(thisArg, ...given),
  bind: (_context, target) => target,
  enable() {
    return this;
  },
  disable() {
    return this;
  },
};

/** Tracing that only writes down what is asked of it (in `asked`): a provider, its tracer and the spans it starts. */
function tracingStandIn(asked = []) {
  const spans = [];
  const about = (given) => {
    if (given === undefined) return undefined;
    const above = trace.getSpan(given);
    return { active: given.getValue(ACTIVE), above: above === undefined ? undefined : (above.label ?? above.spanContext()) };
  };
  const tracer = {
    startSpan(...given) {
      const [name, options, under] = given;
      const label = `span ${spans.length + 1}, "${name}"`;
      const span = {
        label,
        setAttribute(key, value) {
          asked.push({ on: label, setAttribute: [key, value] });
          return span;
        },
        end(...times) {
          asked.push({ on: label, end: times });
        },
        spanContext() {
          asked.push({ on: label, spanContext: "asked" });
          return { traceId: `trace of ${label}`, spanId: `id of ${label}`, traceFlags: 1 };
        },
        isRecording: () => true,
      };
      spans.push(span);
      asked.push({ startSpan: name, given: given.length, options, under: about(under), started: label });
      return span;
    },
  };
  const provider = {
    getTracer(...given) {
      asked.push({ getTracer: given[0] });
      return tracer;
    },
  };
  return { asked, spans, tracer, provider };
}

/** Run with the stand-in tracing as OpenTelemetry's own (and, if asked, the marked active context), and without them afterwards. */
function traced(run, { marked = false, tracing = tracingStandIn() } = {}) {
  trace.disable();
  trace.setGlobalTracerProvider(tracing.provider);
  if (marked) activeContexts.setGlobalContextManager(markedContexts);
  try {
    return run(tracing);
  } finally {
    trace.disable();
    activeContexts.disable();
  }
}

/** How many contexts stand between `context` and `from` (0 when they are the same one). */
function stepsBack(context, from) {
  let steps = 0;
  for (let current = context; current !== from; current = current.getParent()) {
    if (current === undefined) return "not made from it";
    steps += 1;
  }
  return steps;
}

/** How many contexts a context was made from, one after the other. */
function depthOf(context) {
  let depth = 0;
  for (let current = context.getParent(); current !== undefined; current = current.getParent()) depth += 1;
  return depth;
}

/** A context that writes down what is asked of it, and answers as the real one it stands on. */
function watching(context, asked = []) {
  const told = (key) => key?.symbol?.description ?? String(key);
  return {
    asked,
    get name() {
      asked.push("name");
      return context.name;
    },
    get: (key) => {
      asked.push(`get ${told(key)}`);
      return context.get(key);
    },
    with: (key, value) => {
      asked.push(`with ${told(key)}`);
      return watching(context.with(key, value), asked);
    },
    withName: (name) => {
      asked.push(`withName ${name}`);
      return watching(context.withName(name), asked);
    },
  };
}

export const scenarios = [
  // ───────────────────────────── abort-reason.ts ─────────────────────────────
  {
    name: "an abort reason is told by its kind: an error by its name and message, a text by its words, nothing, or else its type",
    run: ({ abortReason }) => {
      const { getAbortReasonInfo } = abortReason;
      class ToolCallAbortedError extends Error {
        constructor(message) {
          super(message);
          this.name = "ToolCallAbortedError";
        }
      }
      const controller = new AbortController();
      controller.abort();
      const numbered = new Error("named by a number");
      numbered.name = 404;
      const told = {
        "an error": new Error("boom"),
        "a type error": new TypeError("wrong type"),
        "an error of the engine's own kind": new ToolCallAbortedError("the person stopped it"),
        "an error with an empty message": new Error(""),
        "an error with no message": new Error(),
        "what a controller aborts with when given nothing": controller.signal.reason,
        "a timeout as the runtime makes it": new DOMException("The operation was aborted due to timeout", "TimeoutError"),
        "an error whose name is a number": numbered,
        "an object that only inherits from Error": Object.create(Error.prototype),
        "an error made in another realm": vm.runInNewContext("new Error('made elsewhere')"),
        "an object that only looks like an error": { name: "Error", message: "only looks like one" },
        "a text": "a text",
        "an empty text": "",
        "a boxed text": new String("boxed"),
        undefined,
        null: null,
        zero: 0,
        "a number": 1.5,
        "not a number": Number.NaN,
        true: true,
        false: false,
        "a big number": 10n,
        "a symbol": Symbol("why"),
        "a function": () => {},
        "a list": [],
        "an object": {},
      };
      return { ...Object.fromEntries(Object.entries(told).map(([label, reason]) => [label, getAbortReasonInfo(reason)])), "no argument": getAbortReasonInfo(), takes: getAbortReasonInfo.length };
    },
  },

  // ───────────────────────────────── core.ts ─────────────────────────────────
  {
    name: "a key is its symbol and its default value, in that order, whatever they are",
    run: ({ core }) => {
      const symbol = Symbol("recorded");
      const fallback = { a: 1 };
      const key = core.createKey(symbol, fallback);
      return {
        fields: Object.keys(key),
        theSymbolGiven: key.symbol === symbol,
        theDefaultGiven: key.defaultValue === fallback,
        anotherObjectEachTime: core.createKey(symbol, fallback) !== key,
        others: [core.createKey(Symbol("n"), 0), core.createKey(Symbol(), undefined), core.createKey(Symbol.for("shared"), null), core.createKey("not a symbol", "text"), core.createKey()],
        canBeWrittenOn: !Object.isFrozen(key) && Object.isExtensible(key),
        aPlainObject: Object.getPrototypeOf(key) === Object.prototype,
        takes: core.createKey.length,
      };
    },
  },
  {
    name: "a new context: not canceled, no reason, no name, nothing before it, an empty path, a signal of its own",
    run: ({ core }) => {
      const first = core.createContext();
      const second = core.createContext("ignored");
      return {
        first: sees(first),
        before: first.getParent(),
        signal: { isAnAbortSignal: first.signal instanceof AbortSignal, aborted: first.signal.aborted, theSameAtEachRead: first.signal === first.signal, anotherForEachContext: first.signal !== second.signal },
        second: sees(second),
        notTheSameContext: first !== second,
        takes: core.createContext.length,
        listening: listening(first),
      };
    },
  },
  {
    name: "what a context shows when its fields are listed: the one before it, its values, its name, its signal",
    run: ({ core }) => {
      const colour = core.createKey(Symbol("colour"), "none");
      const size = core.createKey(Symbol("size"), 0);
      const root = core.createContext();
      const made = {
        root,
        named: root.withName("a"),
        "with one value": root.with(colour, "red"),
        "with two values": root.with(colour, "red").with(size, 2),
        "named after two values": root.with(colour, "red").with(size, 2).withName("b"),
        cancelable: root.withCancel()[0],
        detached: root.withDetached(),
      };
      const kind = (value) => (value instanceof Map ? `a map of ${value.size}` : value instanceof AbortSignal ? "a signal" : value === undefined ? "undefined" : typeof value === "object" ? "a context" : value);
      return {
        fields: Object.fromEntries(Object.entries(made).map(([label, context]) => [label, Object.entries(context).map(([field, value]) => `${field}: ${kind(value)}`)])),
        className: root.constructor.name,
        oneClassForAll: Object.values(made).every((context) => Object.getPrototypeOf(context) === Object.getPrototypeOf(root)),
        asJson: JSON.stringify(root.withName("a").with(colour, "red").withName("b")),
        fieldsCanBeWritten: Object.entries(Object.getOwnPropertyDescriptors(root)).map(([field, { writable, enumerable, configurable }]) => ({ field, writable, enumerable, configurable })),
        canceledAndReasonAreReadOnTheClass: ["canceled", "reason"].map((field) => typeof Object.getOwnPropertyDescriptor(Object.getPrototypeOf(root), field)?.get),
        canBeAddedTo: { extensible: Object.isExtensible(root), sealed: Object.isSealed(root), frozen: Object.isFrozen(root) },
        asText: String(root),
      };
    },
  },
  {
    name: "a value set on a context is read from it and from every context made from it, never from the one before",
    run: ({ core }) => {
      const colour = core.createKey(Symbol("colour"), "none");
      const size = core.createKey(Symbol("size"), 0);
      const held = { an: "object" };
      const thing = core.createKey(Symbol("thing"), undefined);
      const root = core.createContext();
      const red = root.with(colour, "red");
      const big = red.with(size, 10);
      const blue = big.with(colour, "blue");
      const named = blue.withName("n");
      const [cancelable] = named.withCancel();
      const detached = cancelable.withDetached();
      const last = detached.with(thing, held);
      const sameSymbol = core.createKey(colour.symbol, "another default");
      const read = (context) => [context.get(colour), context.get(size), context.get(thing)];
      return {
        root: read(root),
        red: read(red),
        big: read(big),
        blue: read(blue),
        named: read(named),
        cancelable: read(cancelable),
        detached: read(detached),
        last: read(last),
        theVeryObjectSet: last.get(thing) === held,
        aNewContextEachTime: root.with(colour, "red") !== red,
        madeFromTheOneAsked: [red.getParent() === root, big.getParent() === red, blue.getParent() === big],
        noNameOfItsOwn: [red.name, blue.name],
        theSameSignalAsBefore: [red.signal === root.signal, blue.signal === root.signal],
        aKeyIsItsSymbol: { set: blue.get(sameSymbol), unset: root.get(sameSymbol) },
        branchesDoNotMix: [root.with(size, 1).get(colour), red.with(size, 1).get(size), red.get(size)],
        notAKey: {
          read: [undefined, null, {}, "text", { defaultValue: "its own default" }].map((key) => attempt(() => blue.get(key))),
          set: [attempt(() => root.with(undefined, 1)), attempt(() => root.with(null, 1)), root.with({}, "under no symbol").get({ defaultValue: "unused" }), root.with({ symbol: "a text for a symbol" }, 1).get({ symbol: "a text for a symbol" })],
        },
      };
    },
  },
  {
    name: "a value of null or undefined is given as it is by the context that holds it, and as the default by those made from it by name or cancel",
    run: ({ core }) => {
      const key = core.createKey(Symbol("maybe"), "the default");
      const other = core.createKey(Symbol("other"), "other default");
      const root = core.createContext();
      const cases = {};
      for (const [label, value] of [["null", null], ["undefined", undefined], ["zero", 0], ["an empty text", ""], ["false", false], ["not a number", Number.NaN]]) {
        const holder = root.with(key, "set above").with(key, value);
        cases[label] = {
          holder: holder.get(key),
          "made from it by name": holder.withName("n").get(key),
          "made from it by cancel": holder.withCancel()[0].get(key),
          "made from it detached": holder.withDetached().get(key),
          "made from it by another value": holder.with(other, 1).get(key),
          "made by another value, then by name": holder.with(other, 1).withName("n").get(key),
        };
      }
      const nothingByDefault = core.createKey(Symbol("nothing by default"), null);
      return {
        cases,
        defaults: [root.get(nothingByDefault), root.with(nothingByDefault, undefined).get(nothingByDefault), root.with(nothingByDefault, undefined).withName("n").get(nothingByDefault), root.get(core.createKey(Symbol("u"), undefined))],
      };
    },
  },
  {
    name: "a name stays on the context it was given to; the path lists the names from the first to the last and skips the empty ones",
    run: ({ core }) => {
      const key = core.createKey(Symbol("k"), 0);
      const root = core.createContext();
      const turn = root.withName("turn");
      const tool = turn.with(key, 1).withName("tool");
      const [cancelable] = tool.withCancel();
      const step = cancelable.withDetached().withName("").withName("step");
      const path = step.getPath();
      path.push("added by the caller");
      return {
        turn: sees(turn),
        tool: sees(tool),
        cancelable: sees(cancelable),
        step: sees(step),
        theEmptyNameIsKept: step.getParent().name,
        aFreshListEachTime: step.getPath(),
        sameNameTwice: root.withName("a").withName("a").getPath(),
        aSlashIsNotSplit: root.withName("a/b").withName("c").getPath(),
        namesThatAreNotTexts: [7, 0, null, undefined, false, true, ["x"]].map((name) => {
          const named = root.withName("first").withName(name);
          return { name: named.name, path: named.getPath() };
        }),
        noName: root.withName().name,
        before: [turn.getParent() === root, tool.getParent().getParent() === turn],
        theSameSignalAsBefore: turn.signal === root.signal,
        aNewContextEachTime: root.withName("turn") !== turn,
      };
    },
  },
  {
    name: "a value, a path and a cancel are carried through five thousand contexts made one from another",
    run: ({ core }) => {
      const key = core.createKey(Symbol("k"), "unset");
      const [first, cancel] = core.createContext().with(key, "from the first").withCancel();
      let context = first;
      // One in a hundred can be canceled: a cancel goes down from one to the next, each inside the one before.
      for (let made = 0; made < 5_000; made += 1) context = made % 1_000 === 0 ? context.withName(`n${made}`) : made % 100 === 50 ? context.withCancel()[0] : context.withName("");
      const before = { value: context.get(key), unset: context.get(core.createKey(Symbol("other"), "its default")), path: context.getPath(), canceled: context.canceled };
      cancel("from the first");
      return { before, after: { canceled: context.canceled, reason: context.reason } };
    },
  },
  {
    name: "a cancel stops its own context with the reason given, and everything made from it; the one before goes on",
    run: ({ core }) => {
      const cases = {};
      const reasons = { "an error": new Error("stop"), "a text": "stop", nothing: undefined, null: null, zero: 0, "an object": { why: "because" } };
      for (const [label, reason] of Object.entries(reasons)) {
        const root = core.createContext();
        const [context, cancel] = root.withName("work").withCancel();
        const byName = context.withName("step");
        const [inner] = byName.withCancel();
        const detached = byName.withDetached();
        const before = context.canceled;
        const returned = label === "nothing" ? cancel() : cancel(reason);
        cases[label] = {
          before,
          returned,
          context: sees(context),
          theReasonGiven: context.reason === reason,
          below: { byName: byName.canceled, inner: inner.canceled, detached: detached.canceled },
          theSameReasonBelow: [byName.reason === context.reason, inner.reason === context.reason],
          above: root.canceled,
        };
      }
      const root = core.createContext();
      const given = root.withCancel();
      const [pair, cancelPair] = given;
      return {
        cases,
        whatWithCancelGives: { aPair: Array.isArray(given) && given.length === 2, cancelTakes: cancelPair.length, cancelIsNamed: cancelPair.name, before: pair.getParent() === root, aSignalOfItsOwn: pair.signal !== root.signal, noName: pair.name },
      };
    },
  },
  {
    name: "a cancel used again changes nothing, and a context made from a canceled one is canceled from the start with the same reason",
    run: ({ core }) => {
      const first = new Error("first");
      const [context, cancel] = core.createContext().withCancel();
      cancel(first);
      cancel(new Error("second"));
      cancel();
      const [late, cancelLate] = context.withCancel();
      const lateBefore = { canceled: late.canceled, theSameReason: late.reason === first };
      cancelLate("a reason of its own");
      const [inner, cancelInner] = core.createContext().withCancel()[0].withCancel();
      const [outer, cancelOuter] = inner.getParent().withCancel();
      cancelInner("inner first");
      const others = { parentOfInner: inner.getParent().canceled, sibling: outer.canceled };
      cancelOuter("the sibling later");
      return {
        afterThree: { canceled: context.canceled, theFirstReason: context.reason === first },
        lateBefore,
        lateAfterItsOwnCancel: late.reason === first,
        listeningToACanceledOne: listening(context),
        aCancelBelowLeavesTheRest: others,
        eachKeepsItsOwnReason: [inner.reason, outer.reason],
      };
    },
  },
  {
    name: "when a context is canceled, those made from it hear it in the order they were made, each before whoever listens to it after",
    run: ({ core }) => {
      const heard = [];
      const hear = (label, context) => context.signal.addEventListener("abort", () => heard.push(`${label}: ${String(context.reason)}`));
      const [a, cancelA] = core.createContext().withCancel();
      hear("a, asked before any was made from it", a);
      const [b] = a.withCancel();
      const [c] = a.withCancel();
      const [d] = b.withCancel();
      const named = c.withName("n");
      const detached = b.withDetached();
      hear("d", d);
      hear("b", b);
      hear("c", c);
      hear("c by name", named);
      hear("detached from b", detached);
      hear("a, asked after", a);
      cancelA("stop");
      return heard;
    },
  },
  {
    name: "each context that can be canceled listens to the one before it once, until that one is canceled; names, values and detaching listen to nothing",
    run: ({ core }) => {
      const clockwork = timers();
      const time = clock(AT, 0);
      return withGlobals({ ...clockwork.globals, Date: time.Date }, () => {
        const key = core.createKey(Symbol("k"), 0);
        const [parent, cancelParent] = core.createContext().withCancel();
        const counts = { "at first": listening(parent) };
        const [first, cancelFirst] = parent.withCancel();
        counts["after one cancelable"] = listening(parent);
        parent.withName("n");
        parent.with(key, 1);
        parent.withDetached();
        counts["after a name, a value and a detached one"] = listening(parent);
        const limited = parent.withTimeout(1_000);
        counts["after a timeout"] = listening(parent);
        counts["on the timeout's own signal"] = listening(limited);
        parent.withDeadline(new Date(AT + 10));
        counts["after a deadline to come"] = listening(parent);
        const passed = parent.withDeadline(new Date(AT - 10));
        counts["after a deadline already passed"] = listening(parent);
        counts["on the passed deadline's own signal"] = listening(passed);
        const [both] = parent.withTimeoutAndCancel(1_000);
        counts["after a timeout with a cancel"] = listening(parent);
        counts["on the cancel under that timeout"] = listening(both.getParent());
        counts["on that timeout's own signal"] = listening(both);
        cancelFirst();
        counts["after the first one was canceled by itself"] = listening(parent);
        counts["on the first one"] = listening(first);
        for (let more = 0; more < 4; more += 1) parent.withCancel();
        counts["after four more"] = listening(parent);
        cancelParent();
        counts["after the parent was canceled"] = listening(parent);
        counts["on the timeout's own signal, after"] = listening(limited);
        parent.withCancel();
        parent.withTimeout(5);
        counts["after more were made from the canceled parent"] = listening(parent);
        return counts;
      });
    },
  },
  {
    name: "a detached context is reached by no cancel above it, and keeps the names and values of the one before",
    run: ({ core }) => {
      const key = core.createKey(Symbol("k"), "unset");
      const [parent, cancel] = core.createContext().withName("turn").with(key, "kept").withCancel();
      const early = parent.withDetached();
      cancel("stop");
      const late = parent.withDetached();
      const [below, cancelBelow] = late.withName("after").withCancel();
      cancelBelow("only below");
      return {
        parent: sees(parent),
        early: sees(early),
        late: sees(late),
        values: [early.get(key), late.get(key)],
        before: [early.getParent() === parent, late.getParent() === parent],
        signalsOfTheirOwn: [early.signal !== parent.signal, late.signal !== early.signal],
        below: sees(below),
        lateAfterTheCancelBelow: late.canceled,
        aNewContextEachTime: parent.withDetached() !== parent.withDetached(),
      };
    },
  },
  {
    name: "a timeout asks for one timer of the length given and, when it rings, cancels with 'context deadline exceeded'",
    run: ({ core }) => {
      const clockwork = timers();
      return withGlobals(clockwork.globals, () => {
        const root = core.createContext().withName("turn");
        const limited = root.withTimeout(1_000);
        const second = root.withTimeout(1_000);
        const before = sees(limited);
        const [below] = limited.withCancel();
        clockwork.ring(0);
        const after = sees(limited);
        const reason = limited.reason;
        clockwork.ring(0);
        clockwork.ring(1);
        return {
          before,
          after,
          theReason: { isAnError: reason instanceof Error, name: reason.name, message: reason.message, fields: Object.keys(reason), cause: reason.cause },
          belowIsCanceledWithIt: below.reason === reason,
          before2: limited.getParent() === root,
          rootGoesOn: root.canceled,
          ringingAgainKeepsTheReason: limited.reason === reason,
          anErrorOfItsOwnForEach: second.canceled && second.reason !== reason,
          asked: clockwork.asked,
          aSignalOfItsOwn: limited.signal !== root.signal,
          noName: limited.name,
        };
      });
    },
  },
  {
    name: "a timeout's timer is cleared when the context is canceled from above first, and the reason is the one from above",
    run: ({ core }) => {
      const clockwork = timers();
      return withGlobals(clockwork.globals, () => {
        const stop = new Error("stopped from above");
        const [parent, cancel] = core.createContext().withCancel();
        const outer = parent.withTimeout(500);
        const inner = outer.withTimeout(100);
        const longer = outer.withTimeout(900);
        cancel(stop);
        const afterCancel = [outer, inner, longer].map((context) => ({ canceled: context.canceled, theReasonFromAbove: context.reason === stop }));
        clockwork.ring(0);
        clockwork.ring(1);
        const [parent2] = core.createContext().withCancel();
        const outer2 = parent2.withTimeout(50);
        const inner2 = outer2.withTimeout(10);
        const longer2 = outer2.withTimeout(90);
        clockwork.ring(3);
        return {
          afterCancel,
          afterRingingAnyway: [outer, inner, longer].map((context) => context.reason === stop),
          whenTheOuterOneRings: { outer: outer2.reason.message, innerHasTheOutersReason: inner2.reason === outer2.reason, longerHasTheOutersReason: longer2.reason === outer2.reason, parent: parent2.canceled },
          asked: clockwork.asked,
        };
      });
    },
  },
  {
    name: "a timeout made from a context already canceled is canceled from the start, and its timer is asked for all the same and never cleared",
    run: ({ core }) => {
      const clockwork = timers();
      return withGlobals(clockwork.globals, () => {
        const stop = new Error("already stopped");
        const [parent, cancel] = core.createContext().withCancel();
        cancel(stop);
        const limited = parent.withTimeout(60_000);
        const atOnce = { canceled: limited.canceled, theParentsReason: limited.reason === stop };
        const waiting = listening(limited);
        clockwork.ring(0);
        return { atOnce, waitingOnItsOwnSignal: waiting, afterItRings: limited.reason === stop, asked: clockwork.asked };
      });
    },
  },
  {
    name: "the length of a timeout is handed to the timer as it is, whatever it is",
    run: ({ core }) => {
      const clockwork = timers();
      return withGlobals(clockwork.globals, () => {
        const root = core.createContext();
        const lengths = [0, 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, "20", null, undefined];
        const canceledAtOnce = lengths.map((ms) => root.withTimeout(ms).canceled);
        root.withTimeout();
        return { canceledAtOnce, asked: clockwork.asked };
      });
    },
  },
  {
    name: "with the machine's own timers: a short timeout cancels in time, a cancel by hand comes first and keeps its reason, and a canceled timeout leaves no timer waiting",
    run: async ({ core }) => {
      const root = core.createContext();
      const waitingAtFirst = realTimers();
      const [parent, cancelParent] = root.withCancel();
      const long = parent.withTimeout(30_000);
      const waitingWithALongOne = realTimers() - waitingAtFirst;
      cancelParent("no need to wait");
      const waitingAfterItsCancel = realTimers() - waitingAtFirst;
      const short = root.withTimeout(20);
      const none = root.withTimeout(0);
      const [byHand, cancel] = root.withTimeoutAndCancel(20);
      const atOnce = [short, none, byHand].map((context) => context.canceled);
      cancel("by hand");
      await new Promise((done) => setTimeout(done, 90));
      return {
        waitingWithALongOne,
        waitingAfterItsCancel,
        long: long.reason,
        atOnce,
        after: [short, none].map((context) => ({ canceled: context.canceled, reason: context.reason })),
        byHand: { canceled: byHand.canceled, reason: byHand.reason },
        root: root.canceled,
      };
    },
  },
  {
    name: "a deadline later than now is a timeout of what is left; one at now, before now or of no date is canceled at once and asks for no timer",
    run: ({ core }) => {
      const one = (deadlineOf, canceledParent = false) => {
        const clockwork = timers();
        const time = clock(AT, 0);
        return withGlobals({ ...clockwork.globals, Date: time.Date }, () => {
          const [parent, cancel] = core.createContext().withName("turn").withCancel();
          const stop = new Error("stopped before");
          if (canceledParent) cancel(stop);
          const outcome = attempt(() => parent.withDeadline(deadlineOf()));
          if ("threw" in outcome) return { threw: outcome.threw, asked: clockwork.asked, clockRead: time.state.reads };
          const context = outcome.returned;
          return {
            context: sees(context),
            theParentsReason: canceledParent ? context.reason === stop : undefined,
            before: context.getParent() === parent,
            aSignalOfItsOwn: context.signal !== parent.signal,
            asked: clockwork.asked,
            clockRead: time.state.reads,
            parent: parent.canceled,
          };
        });
      };
      return {
        "one millisecond from now": one(() => new Date(AT + 1)),
        "a quarter of a second from now": one(() => new Date(AT + 250)),
        "the last moment a date can hold": one(() => new Date(8.64e15)),
        "now": one(() => new Date(AT)),
        "one millisecond ago": one(() => new Date(AT - 1)),
        "long ago": one(() => new Date(0)),
        "no date at all": one(() => new Date(Number.NaN)),
        "to come, from a canceled context": one(() => new Date(AT + 250), true),
        "passed, from a canceled context": one(() => new Date(AT - 250), true),
        "a number instead of a date": one(() => AT + 250),
        "nothing instead of a date": one(() => undefined),
        "an object that tells its time": one(() => ({ getTime: () => AT + 40 })),
      };
    },
  },
  {
    name: "the clock is read once for each deadline, and each deadline that has passed cancels with an error of its own",
    run: ({ core }) => {
      const clockwork = timers();
      const time = clock(AT, 100);
      return withGlobals({ ...clockwork.globals, Date: time.Date }, () => {
        const root = core.createContext();
        const deadline = new Date(AT + 150);
        const made = [root.withDeadline(deadline), root.withDeadline(deadline), root.withDeadline(deadline), root.withDeadline(deadline)];
        return {
          canceled: made.map((context) => context.canceled),
          messages: made.map((context) => context.reason?.message),
          errorsOfTheirOwn: made[2].reason !== made[3].reason && made[2].reason instanceof Error,
          asked: clockwork.asked,
          clockRead: time.state.reads,
        };
      });
    },
  },
  {
    name: "a timeout with a cancel: the cancel is one context above the timeout, and either one stops the work",
    run: ({ core }) => {
      const one = (finish) => {
        const clockwork = timers();
        return withGlobals(clockwork.globals, () => {
          const root = core.createContext().withName("turn");
          const pair = root.withTimeoutAndCancel(750);
          const [context, cancel] = pair;
          const between = context.getParent();
          const start = { pair: pair.length, context: sees(context), stepsBack: stepsBack(context, root), signals: [context.signal !== between.signal, between.signal !== root.signal] };
          const returned = finish(cancel, clockwork);
          return { start, returned, context: sees(context), between: sees(between), root: root.canceled, asked: clockwork.asked };
        });
      };
      return {
        "canceled by hand": one((cancel) => cancel("by hand")),
        "canceled by hand with nothing": one((cancel) => cancel()),
        "the timer rings": one((_cancel, clockwork) => clockwork.ring(0)),
        "the timer rings, then the cancel": one((cancel, clockwork) => {
          clockwork.ring(0);
          return cancel("too late");
        }),
        "the cancel, then the timer rings": one((cancel, clockwork) => {
          cancel("first");
          clockwork.ring(0);
        }),
      };
    },
  },
  {
    name: "a context asks the one before it through what that one answers itself: its get, its name, its parent, its signal, its own timeout and cancel",
    run: ({ core }) => {
      const clockwork = timers();
      const time = clock(AT, 0);
      return withGlobals({ ...clockwork.globals, Date: time.Date }, () => {
        const key = core.createKey(Symbol("k"), "the default");
        const asked = [];
        const base = core.createContext().withName("base").with(key, "from the base");

        const answering = Object.create(base);
        answering.get = (wanted) => {
          asked.push("get");
          return wanted === key ? "from the stand-in" : base.get(wanted);
        };
        const valueBelow = [answering.withName("n").get(key), answering.withCancel()[0].get(key), answering.with(core.createKey(Symbol("o"), 0), 1).get(key)];

        const renamed = Object.create(base);
        Object.defineProperty(renamed, "name", { value: "renamed" });
        renamed.getParent = () => core.createContext().withName("another line");
        const pathBelow = renamed.withName("leaf").getPath();
        const pathOfItself = renamed.getPath();

        const [stopped, cancelStopped] = core.createContext().withCancel();
        cancelStopped("the stand-in's signal");
        const resignalled = Object.create(base);
        Object.defineProperty(resignalled, "signal", { value: stopped.signal });
        const signalBelow = {
          itself: { canceled: resignalled.canceled, reason: resignalled.reason },
          byName: resignalled.withName("n").canceled,
          byCancel: resignalled.withCancel()[0].reason,
          byTimeout: resignalled.withTimeout(5).reason,
          detached: resignalled.withDetached().canceled,
        };
        const unsignalled = Object.create(base);
        Object.defineProperty(unsignalled, "signal", { value: undefined });
        const withoutASignal = { byName: unsignalled.withName("n").signal instanceof AbortSignal, byValue: unsignalled.with(key, 1).canceled };

        const timed = Object.create(base);
        timed.withTimeout = (ms) => {
          asked.push(`withTimeout ${ms}`);
          return "what its own withTimeout gives";
        };
        const deadlineBelow = [timed.withDeadline(new Date(AT + 300)), sees(timed.withDeadline(new Date(AT - 300)))];
        const canceling = Object.create(base);
        canceling.withCancel = () => {
          asked.push("withCancel");
          return [timed, "its own cancel"];
        };
        const bothBelow = canceling.withTimeoutAndCancel(40);

        return { valueBelow, pathBelow, pathOfItself, signalBelow, withoutASignal, deadlineBelow, bothBelow, asked, timersAsked: clockwork.asked };
      });
    },
  },

  // ──────────────────────────────── logger.ts ────────────────────────────────
  {
    name: "the logger key is a symbol named loggerBackend and the terminal backend; a context with no backend of its own gives that one",
    run: ({ core, logger }) => {
      const { loggerKey, getLoggerBackend } = logger;
      const mine = { log() {} };
      const root = core.createContext();
      const asked = [];
      const standIn = {
        get: (key) => {
          asked.push(key === loggerKey);
          return mine;
        },
      };
      return {
        fields: Object.keys(loggerKey),
        symbol: loggerKey.symbol,
        terminalBackend: { fields: Object.keys(loggerKey.defaultValue), logTakes: loggerKey.defaultValue.log.length },
        unset: getLoggerBackend(root) === loggerKey.defaultValue,
        unsetBelow: getLoggerBackend(root.withName("n").withCancel()[0]) === loggerKey.defaultValue,
        set: getLoggerBackend(root.with(loggerKey, mine)) === mine,
        setBelow: getLoggerBackend(root.with(loggerKey, mine).withName("n")) === mine,
        aStandInContext: { given: getLoggerBackend(standIn) === mine, askedWithTheKey: asked },
        notAContext: [attempt(() => getLoggerBackend({})), attempt(() => getLoggerBackend(undefined)), attempt(() => getLoggerBackend())],
        takes: getLoggerBackend.length,
      };
    },
  },
  {
    name: "each of a logger's four methods hands the context's backend one entry: level, message, context, the error if any, what was added, the time",
    run: ({ core, logger }) => {
      const labels = new Map();
      const { backend, entries } = keeping(labels);
      const context = core.createContext().withName("turn").with(logger.loggerKey, backend);
      labels.set(context, "the context logged with");
      const log = logger.createLogger("recorded");
      const failure = new Error("it failed");
      const added = { where: "here" };
      const time = clock();
      const returned = withGlobals({ Date: time.Date }, () => [
        log.debug(context, "a debug line"),
        log.info(context, "an info line", { n: 1 }),
        log.warn(context, "a warning", {}),
        log.error(context, "an error", failure, added),
        log.error(context, "an error with nothing thrown"),
        log.error(context, "an error that is a text", "it failed", undefined),
        log.info(context, "what was added is a text", "text"),
        log.debug(context),
        log.info(context, 42, null),
      ]);
      const seen = [];
      const other = { log: (_context, entry) => seen.push(entry) };
      log.error(context.with(logger.loggerKey, other), "kept as given", failure, added);
      return {
        methods: Object.keys(log),
        named: Object.values(log).map((method) => method.name),
        take: Object.values(log).map((method) => method.length),
        returned,
        entries,
        clockRead: time.state.reads,
        theErrorAndTheAddedAreTheOnesGiven: [seen[0].error === failure, seen[0].metadata === added, seen[0].timestamp instanceof Date],
      };
    },
  },
  {
    name: "a logger's name changes nothing, its methods work on their own, and the backend is read again from the context at each line",
    run: ({ core, logger }) => {
      const labels = new Map();
      const first = keeping(labels);
      const second = keeping(labels);
      const root = core.createContext();
      const one = root.with(logger.loggerKey, first.backend);
      const two = one.withName("deeper").with(logger.loggerKey, second.backend);
      const below = two.withName("below").withCancel()[0];
      labels.set(one, "one").set(two, "two").set(below, "below two");
      const time = clock();
      withGlobals({ Date: time.Date }, () => {
        const { info } = logger.createLogger("a name");
        const { warn } = logger.createLogger();
        const { error } = logger.createLogger(42);
        info(one, "to the first");
        info(two, "to the second");
        warn(below, "to the second, from below");
        error(one, "to the first again", "why");
      });
      const asked = [];
      const mine = { log: (_context, entry) => asked.push(`log ${entry.message}`) };
      const standIn = {
        get: (key) => {
          asked.push(`get ${key.symbol.description}`);
          return mine;
        },
      };
      logger.createLogger("x").info(standIn, "once");
      logger.createLogger("x").info(standIn, "twice");
      const noBackend = attempt(() => logger.createLogger("x").info({ get: () => undefined }, "m"));
      const cannotLog = root.with(logger.loggerKey, {});
      const throws = root.with(logger.loggerKey, {
        log() {
          throw new Error("thrown by the backend");
        },
      });
      const badBackends = {
        "a backend that cannot log": attempt(() => logger.createLogger("x").warn(cannotLog, "m")),
        "a backend that cannot log, under attributes": attempt(() => logger.createLogger("x").warn(logger.withLogAttributes(cannotLog, { a: 1 }), "m")),
        "a backend that throws": attempt(() => logger.createLogger("x").error(throws, "m", "why")),
        "a backend that throws, under attributes": attempt(() => logger.createLogger("x").error(logger.withLogAttributes(throws, { a: 1 }), "m", "why")),
      };
      const notAContext = [attempt(() => logger.createLogger("x").info({}, "m")), attempt(() => logger.createLogger("x").info(undefined, "m"))];
      return {
        first: first.entries,
        second: second.entries,
        aLoggerOfItsOwnEachTime: logger.createLogger("a") !== logger.createLogger("a"),
        takes: logger.createLogger.length,
        aStandInContextIsAsked: asked,
        noBackend,
        badBackends,
        notAContext,
      };
    },
  },
  {
    name: "attributes added to a context come before what each line adds, and the line wins where both name the same thing",
    run: ({ core, logger }) => {
      const labels = new Map();
      const { backend, entries } = keeping(labels);
      const base = core.createContext().withName("turn").with(logger.loggerKey, backend);
      const attributes = { tool: "Shell", attempt: 1 };
      const withAttributes = logger.withLogAttributes(base, attributes);
      attributes.tool = "changed after";
      attributes.late = true;
      const twice = logger.withLogAttributes(withAttributes.withName("inner"), { attempt: 2, model: "m", id: 7 });
      labels.set(base, "base").set(withAttributes, "with attributes").set(twice, "with attributes twice");
      const log = logger.createLogger("recorded");
      const time = clock();
      const returned = withGlobals({ Date: time.Date }, () => [
        log.info(withAttributes, "nothing added"),
        log.info(withAttributes, "something added", { extra: 1, attempt: "from the line" }),
        log.error(withAttributes, "an error", new Error("it failed"), { extra: 2 }),
        log.info(twice, "twice, nothing added"),
        log.warn(twice, "twice, something added", { id: "from the line", tool: "from the line", z: 0 }),
        log.info(base, "the context before is as it was", { own: true }),
        log.info(withAttributes, "added: a text", "ab"),
        log.info(withAttributes, "added: a list", ["x"]),
        log.info(withAttributes, "added: null", null),
      ]);
      return {
        returned,
        entries,
        madeFromTheContextGiven: [withAttributes.getParent() === base, sees(withAttributes), twice.getPath()],
        aBackendOfItsOwn: logger.getLoggerBackend(withAttributes) !== backend && Object.entries(logger.getLoggerBackend(withAttributes)).map(([field, value]) => [field, value.name, value.length]),
        takes: logger.withLogAttributes.length,
      };
    },
  },
  {
    name: "attributes: the backend is the one the context had when they were added, the entry handed on is a new one with the same time, and nothing comes back",
    run: ({ core, logger }) => {
      const labels = new Map();
      const before = keeping(labels);
      const after = keeping(labels);
      const base = core.createContext().with(logger.loggerKey, before.backend);
      const withAttributes = logger.withLogAttributes(base, { a: 1 });
      const rebound = withAttributes.with(logger.loggerKey, after.backend);
      const middle = logger.getLoggerBackend(withAttributes);
      labels.set(withAttributes, "with attributes").set(rebound, "with another backend set after");
      const when = new Date(AT);
      const handed = [];
      const direct = { log: (context, entry) => handed.push({ context, entry }) };
      const overDirect = logger.getLoggerBackend(logger.withLogAttributes(core.createContext().with(logger.loggerKey, direct), { a: 1 }));
      const entry = { level: "info", message: "handed straight to the backend", timestamp: when };
      const returned = [
        middle.log(rebound, { level: "info", message: "through the attributes", timestamp: when, metadata: { b: 2 } }),
        middle.log(undefined, { message: "an entry with only a message" }),
        overDirect.log("any first argument", entry),
      ];
      logger.createLogger("x").info(rebound, "the backend set after takes the line, with no attributes");
      const noAttributes = keeping(labels);
      const none = [undefined, null, "ab"].map((attributes) => {
        const context = logger.withLogAttributes(core.createContext().with(logger.loggerKey, noAttributes.backend), attributes);
        logger.getLoggerBackend(context).log(undefined, { level: "info", message: `attributes: ${String(attributes)}`, timestamp: when, metadata: { own: 1 } });
        return true;
      });
      const asked = [];
      const standIn = {
        get: (key) => {
          asked.push(`get ${key.symbol.description}`);
          return before.backend;
        },
        with: (key, value) => {
          asked.push(`with ${key.symbol.description}`);
          return { whatItsOwnWithGives: Object.keys(value) };
        },
      };
      return {
        returned,
        before: before.entries,
        after: after.entries.map(({ entry: { timestamp, ...rest }, ...call }) => ({ ...call, entry: rest })),
        handedOn: { fields: Object.keys(handed[0].entry), firstArgument: handed[0].context, aNewEntry: handed[0].entry !== entry, theSameTime: handed[0].entry.timestamp === when, theEntryGivenIsUntouched: Object.keys(entry) },
        none,
        noAttributes: noAttributes.entries,
        aStandInContext: { given: logger.withLogAttributes(standIn, { a: 1 }), asked },
        notAContext: [attempt(() => logger.withLogAttributes({}, { a: 1 })), attempt(() => logger.withLogAttributes({ get: () => before.backend }, { a: 1 })), attempt(() => logger.withLogAttributes(undefined, { a: 1 }))],
      };
    },
  },
  {
    name: "the terminal backend writes a line: the time of day, the level in five places, the message, the path of the context, through the console's log, warn or error",
    run: async ({ logger }, tools) => {
      const { core, ...loaded } = await plainLoad(logger, tools);
      const terminal = terminalOf(loaded);
      const root = core.createContext();
      const named = root.withName("turn").withName("tool");
      const line = (fields, first) => written(() => terminal.log(first, entryOf(fields)));
      return {
        levels: ["debug", "info", "warn", "error"].map((level) => line({ level, message: `a ${level} line`, context: named })),
        "no names on the way": line({ context: root }),
        "names with a slash and an empty one": line({ context: root.withName("a/b").withName("").withName("c") }),
        "no context in the entry": line({}, named),
        "the path is the entry's context, not the first argument": line({ context: root.withName("in the entry") }, root.withName("first argument")),
        "an object that tells a path": line({ context: { getPath: () => ["x", "y"] } }),
        "an object that tells an empty path": line({ context: { getPath: () => [], other: 1 } }),
        "an object that tells its path as a text": line({ context: { getPath: () => "a/b" } }),
        "an object that tells an empty text": line({ context: { getPath: () => "" } }),
        "an object that tells no path": line({ context: { getPath: () => undefined } }),
        "an object that tells a path of things that are not texts": line({ context: { getPath: () => [1, null, ["x", "y"], undefined] } }),
        "an object whose path throws": line({ context: { getPath: () => { throw new Error("no path"); } } }),
        "its log, taken off it, works on its own": (() => {
          const { log } = terminal;
          return written(() => log.call(undefined, named, entryOf({ context: named })));
        })(),
        "how often the path is asked for": (() => {
          const asked = [];
          line({ context: { getPath: () => (asked.push("getPath"), ["x"]) } });
          return asked;
        })(),
        "what the backend gives back": (() => {
          let returned = "not called";
          written(() => {
            returned = terminal.log(named, entryOf({}));
          });
          return returned;
        })(),
      };
    },
  },
  {
    name: "the time of day is twelve characters cut from the time as the world writes it, at the same place whatever the year",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const line = (timestamp) => written(() => terminal.log(undefined, { level: "info", message: "m", timestamp }));
      return {
        midnight: line(new Date(Date.UTC(2026, 0, 1))),
        "the last millisecond of a day": line(new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999))),
        "a year of five figures": line(new Date(Date.UTC(12_026, 5, 6, 7, 8, 9, 10))),
        "a year before the first": line(new Date(Date.UTC(-1, 5, 6, 7, 8, 9, 10))),
        "no date at all": line(new Date(Number.NaN)),
        "a number instead of a date": line(AT),
        "a text instead of a date": line("2026-11-13T09:08:07.065Z"),
        "nothing": line(undefined),
        "an object that writes itself": line({ toISOString: () => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" }),
      };
    },
  },
  {
    name: "a level that is not one of the four writes nothing and throws; a message is written as it prints",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const line = (fields) => written(() => terminal.log(undefined, { message: "m", timestamp: new Date(AT), ...fields }));
      return {
        levels: Object.fromEntries(["trace", "INFO", "", "fatal", "Warn"].map((level) => [`"${level}"`, line({ level })])),
        "a level that is a number": line({ level: 5 }),
        "no level": line({}),
        "a level of null": line({ level: null }),
        "an object that writes itself as a level": line({ level: { toUpperCase: () => "CUSTOM" } }),
        "no entry": written(() => terminal.log(undefined, undefined)),
        messages: [42, null, undefined, "", ["a", "b"], { toString: () => "printed" }, "two\nlines", " spaces kept "].map((message) => line({ level: "info", message })),
        "an error line's message that is not a text": line({ level: "error", message: 42 }),
      };
    },
  },
  {
    name: "a level that is not one of the four is found out last: the path is asked for and what was added is written out before the line is refused",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const asked = [];
      const telling = { getPath: () => (asked.push("the path is asked for"), ["turn"]) };
      const keyed = new Map([
        [
          {
            toString() {
              asked.push("a key is asked for its text");
              return "k";
            },
          },
          1,
        ],
      ]);
      const broken = {
        get field() {
          asked.push("a field is read");
          throw new Error("thrown by a field");
        },
      };
      const line = (fields) => {
        asked.push(`— ${Object.keys(fields).join(", ")} —`);
        return written(() => terminal.log(undefined, { message: "m", timestamp: new Date(AT), ...fields }));
      };
      return {
        "a level unknown, a path, something added": line({ level: "trace", context: telling, metadata: { keyed } }),
        "a level unknown, a field that throws": line({ level: "trace", context: telling, metadata: broken }),
        "a level unknown, an error that throws": line({ level: "trace", context: telling, error: broken }),
        "a level unknown, no date": line({ level: "trace", timestamp: new Date(Number.NaN), context: telling }),
        "no level, a path": line({ context: telling }),
        "a level known, a field that throws": line({ level: "info", context: telling, metadata: broken }),
        asked,
      };
    },
  },
  {
    name: "a message that is not a text is left as it prints; only on an error line in colour is a missing message written out as the word",
    run: async ({ logger }, tools) => {
      const plain = terminalOf(await plainLoad(logger, tools));
      const coloured = terminalOf(await colouredLoad(logger, tools));
      const messages = { "a number": 42, null: null, undefined, "an empty text": "", "a list": ["a", "b"], "a text": "text" };
      const lines = (terminal, level) => Object.fromEntries(Object.entries(messages).map(([label, message]) => [label, written(() => terminal.log(undefined, entryOf({ level, message })))]));
      return { "plain, info": lines(plain, "info"), "plain, error": lines(plain, "error"), "in colour, info": lines(coloured, "info"), "in colour, warn": lines(coloured, "warn"), "in colour, error": lines(coloured, "error") };
    },
  },
  {
    name: "what a thing is taken for when it could be two: a summary before anything, a date or a pattern before an error, an error before a list, a map or bytes; the error of a line is an error first",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const things = () => ({
        "a list that is also a summary": Object.assign([1], { kind: "summary", summary: "a list" }),
        "an error that is also a summary": Object.assign(new Error("m"), { kind: "summary", summary: "an error", stack: "Error: m\n    at a place" }),
        "a date that is also a summary": Object.assign(new Date(AT), { kind: "summary", summary: "a date" }),
        "a date with a message": Object.assign(new Date(AT), { message: "dated" }),
        "a pattern with a name": Object.assign(/x/, { name: "named" }),
        "a list with a message": Object.assign([1, 2], { message: "listed" }),
        "a map with a name": Object.assign(new Map([["k", 1]]), { name: "mapped" }),
        "a set with a cause": Object.assign(new Set([1]), { cause: "why" }),
        "an array buffer with a name": Object.assign(new ArrayBuffer(2), { name: "buffered" }),
        "a function with a message": Object.assign(function named() {}, { message: "ignored" }),
        "a boxed text with a name": Object.assign(new String("ab"), { name: "boxed" }),
        "an object with a name and fields": { name: "Shell", args: ["ls"], cause: { code: 1 } },
      });
      const line = (fields) => {
        const lines = written(() => terminal.log(undefined, entryOf(fields)));
        return Array.isArray(lines) ? lines[0].log : lines;
      };
      const ways = { "among what was added": (thing) => shown(terminal, thing), "as what was added": (thing) => line({ metadata: thing }), "as the context": (thing) => line({ context: thing }), "as the error": (thing) => line({ error: thing }) };
      return Object.fromEntries(Object.entries(ways).map(([way, write]) => [way, Object.fromEntries(Object.entries(things()).map(([label, thing]) => [label, write(thing)]))]));
    },
  },
  {
    name: "a logger's line, step by step: the time is taken, the backend is read from the context, the backend is handed the entry",
    run: ({ core, logger }) => {
      const steps = [];
      const time = clock(AT, 1_000, () => steps.push("the clock is read"));
      const backend = { log: (_context, entry) => steps.push(`the backend is handed "${entry.message}"`) };
      const base = core.createContext().with(logger.loggerKey, backend);
      withGlobals({ Date: time.Date }, () => {
        const log = logger.createLogger("recorded");
        log.info(watching(base, steps), "a line");
        log.error(watching(base, steps), "an error", "why");
        steps.push("— attributes are added —");
        const withAttributes = logger.withLogAttributes(watching(base, steps), { a: 1 });
        steps.push("— a line through them —");
        log.warn(withAttributes, "with attributes");
        steps.push("— no backend to be had —");
        try {
          log.info({ get: (key) => (steps.push(`get ${key.symbol.description}, which throws`), undefined.backend) }, "never handed");
        } catch (error) {
          steps.push(`thrown: ${error.constructor.name}`);
        }
      });
      return steps;
    },
  },
  {
    name: "a context in the entry that is no context is written as context=, when it holds anything; what was added is written as meta=, when it holds anything",
    run: async ({ logger }, tools) => {
      const { core, ...loaded } = await plainLoad(logger, tools);
      const terminal = terminalOf(loaded);
      const line = (fields) => {
        const lines = written(() => terminal.log(undefined, entryOf(fields)));
        return Array.isArray(lines) ? lines[0].log : lines;
      };
      const contexts = {
        "an object": { requestId: "r-1", attempt: 2 },
        "an empty object": {},
        "a text": "abc",
        "an empty text": "",
        "a number": 5,
        zero: 0,
        true: true,
        false: false,
        null: null,
        "a list": ["a", 1],
        "an empty list": [],
        "an object whose getPath is not a function": { getPath: "no", id: 1 },
        "a function": function namedFunction() {},
        "a function with a field": Object.assign(() => {}, { field: 1 }),
        "an error": new Error("as context"),
        "a map": new Map([["k", 1]]),
        "a date": new Date(AT),
      };
      const added = {
        "an object": { n: 1, text: "t" },
        "an empty object": {},
        undefined,
        null: null,
        "a list": ["a"],
        "an empty list": [],
        "a text": "ab",
        "an empty text": "",
        "a number": 5,
        true: true,
        "an object with a name": { name: "Shell", args: ["ls"] },
        "an object with a message": { message: "hello", n: 1 },
        "a map": new Map([["k", 1]]),
        "a real context": core.createContext().withName("inside"),
      };
      return {
        context: Object.fromEntries(Object.entries(contexts).map(([label, context]) => [label, line({ context })])),
        added: Object.fromEntries(Object.entries(added).map(([label, metadata]) => [label, line({ metadata })])),
        "all three at once": line({ context: { id: 1 }, metadata: { n: 2 }, error: "why" }),
        "a path and what was added": line({ context: core.createContext().withName("turn"), metadata: { n: 2 } }),
      };
    },
  },
  {
    name: "an error is written after the line as error=, by its name and message, and the lines of its trace follow, each trimmed and two spaces in",
    run: async ({ logger }, tools) => {
      const { core, ...loaded } = await plainLoad(logger, tools);
      const terminal = terminalOf(loaded);
      const line = (error, fields = {}) => written(() => terminal.log(undefined, entryOf({ level: "error", message: "it went wrong", error, ...fields })));
      const traced = (error, stack) => Object.assign(error, { stack });
      const loop = traced(new Error("around"), undefined);
      loop.cause = loop;
      const typed = traced(new TypeError("wrong type"), "TypeError: wrong type\n    at first (file:///a.js:1:2)\n    at second (file:///b.js:3:4)");
      return {
        "a traced error": line(typed),
        "a trace with blank lines and odd spacing": line(traced(new Error("odd"), "Error: odd\n\n   \n\tat tabbed\nno indent at all\n      at deep   \n")),
        "a trace of one line": line(traced(new Error("short"), "Error: short")),
        "an empty trace": line(traced(new Error("empty trace"), "")),
        "a trace that is not a text": line(traced(new Error("no trace"), 42)),
        "a trace whose first line is not the error": line(traced(new Error("first line dropped"), "at dropped\nat kept")),
        "with a context path and what was added": line(typed, { context: core.createContext().withName("turn"), metadata: { n: 1 } }),
        "on an info line": line(typed, { level: "info" }),
        "an error with no message": line(traced(new Error(""), "Error\n at somewhere")),
        "an error whose name is not a text": line(traced(Object.assign(new Error("m"), { name: 404 }), undefined)),
        "an error with a cause": line(traced(new Error("outer", { cause: traced(new RangeError("inner"), "RangeError: inner\n at innerPlace") }), "Error: outer\n at outerPlace")),
        "causes three deep, the last a text": line(traced(new Error("one", { cause: traced(new Error("two", { cause: traced(new Error("three", { cause: "the root of it" }), "") }), "") }), "")),
        "a cause that is the error itself": line(loop),
        "a cause that is an object": line(traced(new Error("with details", { cause: { code: "E_FAIL", retry: false } }), "")),
        "a cause of null": line(traced(new Error("null cause", { cause: null }), "")),
        "a cause of undefined": line(traced(Object.assign(new Error("undefined cause"), { cause: undefined }), "")),
        "an object with a message": line({ message: "only a message" }),
        "an object with a name": line({ name: "OnlyAName" }),
        "an object with a trace": line({ stack: "Thing: ignored first line\n at kept" }),
        "an object with a cause": line({ cause: "why" }),
        "an object with a message that is not a text": line({ message: 42, name: "Named" }),
        "an object with other fields": line({ code: "E_FAIL", n: 1 }),
        "an empty object": line({}),
        "a text": line("it failed"),
        "a number": line(404),
        null: line(null),
        false: line(false),
        "a list": line(["a", new Error("in a list")]),
        "an abort as the runtime makes it": line(traced(new DOMException("This operation was aborted", "AbortError"), "AbortError: This operation was aborted\n at abort")),
        undefined: line(undefined),
      };
    },
  },
  {
    name: "values added to a line are written short: texts in quotes and cut at 200, numbers, dates, patterns, functions and symbols as they print",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const values = {
        "a text": "hello",
        "an empty text": "",
        "a text with quotes and a new line": 'say "hi"\nnext \\ tab\t',
        "a text of 199": "a".repeat(199),
        "a text of 200": "b".repeat(200),
        "a text of 201": "c".repeat(201),
        "a text of 500": "d".repeat(500),
        "a text cut inside a character of two halves": `${"e".repeat(199)}\u{1F600}!`,
        zero: 0,
        "minus zero": -0,
        "a fraction": 0.1,
        "a large number": 1e21,
        "not a number": Number.NaN,
        infinity: Number.NEGATIVE_INFINITY,
        true: true,
        false: false,
        "a big number": 12345678901234567890n,
        "a symbol": Symbol("why"),
        "a symbol with no description": Symbol(),
        null: null,
        undefined,
        "a named function": function namedFunction() {},
        "an arrow function": () => {},
        "a class": class Shape {},
        "a date": new Date(AT),
        "no date at all": new Date(Number.NaN),
        "a pattern": /a+b/gi,
        "a boxed number": new Number(5),
        "a boxed text": new String("ab"),
        "a summary": { kind: "summary", summary: "3 files" },
        "a summary with other fields": { kind: "summary", summary: "", more: 1 },
        "a summary whose words are not a text": { kind: "summary", summary: 3 },
        "a summary of another kind": { kind: "other", summary: "3 files" },
        "an error": new RangeError("out of range"),
        "an error with a cause": new Error("outer", { cause: new Error("inner") }),
        "a promise": Promise.resolve(1),
        "a weak map": new WeakMap(),
        "an address": new URL("https://example.com/a?b=1"),
      };
      return Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
    },
  },
  {
    name: "lists are written in brackets, 40 items at most with the rest counted, and a gap in a list is left blank",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const gaps = [1, , 3, , ,];
      const extra = Object.assign(["a"], { more: "ignored" });
      const values = {
        "an empty list": [],
        "a list": [1, "two", null, undefined, true],
        "lists in a list": [[1, [2, [3]]], []],
        "a list of 39": Array.from({ length: 39 }, (_, at) => at),
        "a list of 40": Array.from({ length: 40 }, (_, at) => at),
        "a list of 41": Array.from({ length: 41 }, (_, at) => at),
        "a list of 100": Array.from({ length: 100 }, (_, at) => at),
        "a list with gaps": gaps,
        "a list of nothing but gaps": new Array(3),
        "a list with a field": extra,
        "a set": new Set([1, "two", [3]]),
        "an empty set": new Set(),
        "a set of 41": new Set(Array.from({ length: 41 }, (_, at) => at)),
        "objects in a list": [{ a: 1 }, { b: [2] }],
        "an error in a list": [new Error("in a list")],
      };
      return Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
    },
  },
  {
    name: "objects are written field by field, 50 fields at most with the rest counted; a field named name, message, stack or cause makes the object an error",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const fields = (count) => Object.fromEntries(Array.from({ length: count }, (_, at) => [`f${at}`, at]));
      class Point {
        x = 1;
        y = 2;
        #hidden = 3;
        get sum() {
          return this.x + this.y + this.#hidden;
        }
      }
      const withHidden = { shown: 1 };
      Object.defineProperty(withHidden, "hidden", { value: 2, enumerable: false });
      withHidden[Symbol("s")] = 3;
      const getter = {
        get computed() {
          return "computed when written";
        },
      };
      const inherited = Object.create({ fromAbove: 1 });
      inherited.own = 2;
      const values = {
        "an empty object": {},
        "an object": { a: 1, b: "two", c: null, d: undefined },
        "objects in an object": { a: { b: { c: {} } } },
        "numbered fields come first": { b: 1, 2: "two", a: 3, 1: "one" },
        "an object of 49 fields": fields(49),
        "an object of 50 fields": fields(50),
        "an object of 51 fields": fields(51),
        "an object made by a class": new Point(),
        "an object with no prototype": Object.assign(Object.create(null), { a: 1 }),
        "hidden and symbol fields are left out": withHidden,
        "a field that is computed": getter,
        "fields from above are left out": inherited,
        "an object with a name": { name: "Shell", args: ["ls"] },
        "an object with a name that is not a text": { name: 7, id: 1 },
        "an object with a message": { message: "hello", id: 1 },
        "an object with an empty message": { message: "", id: 1 },
        "an object with a name and a message": { name: "Tool", message: "ran" },
        "an object with a stack": { stack: "anything", id: 1 },
        "an object with a cause": { cause: { deeper: true }, id: 1 },
        "an object with a cause of undefined": { cause: undefined, id: 1 },
        "an object that inherits a name": Object.create({ name: "FromAbove" }),
        "a field that throws when read": {
          get broken() {
            throw new Error("thrown by a field");
          },
        },
      };
      return Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
    },
  },
  {
    name: "maps are written as Map{key => value}, 50 pairs at most with the rest counted; a key that cannot be written as a text stops the line",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const pairs = (count) => new Map(Array.from({ length: count }, (_, at) => [`k${at}`, at]));
      const asked = [];
      const telling = {
        toString() {
          asked.push("toString");
          return "told";
        },
      };
      const values = {
        "an empty map": new Map(),
        "a map": new Map([["a", 1], [2, "two"], [null, undefined]]),
        "keys that are objects, lists, symbols and dates": new Map([[{ id: 1 }, "object"], [[1, 2], "list"], [Symbol("s"), "symbol"], [new Date(AT), "date"]]),
        "a map in a map": new Map([["outer", new Map([["inner", new Map()]])]]),
        "a map of 49": pairs(49),
        "a map of 50": pairs(50),
        "a map of 51": pairs(51),
        "a key that tells its own text": new Map([[telling, 1]]),
        "a key with no prototype": new Map([["fine", 1], [Object.create(null), 2]]),
        "a key that throws when written": new Map([
          [
            {
              toString() {
                throw new Error("thrown by a key");
              },
            },
            1,
          ],
        ]),
        "a map with a field": Object.assign(new Map([["k", 1]]), { field: "ignored" }),
      };
      const rendered = Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
      return { ...rendered, "the key was asked for its text": asked };
    },
  },
  {
    name: "bytes are written as their kind and how many: ArrayBuffer(n), Uint8Array(n), Buffer(n); where the kind cannot be read, TypedArray",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const unnamed = new Uint8Array(2);
      Object.defineProperty(unnamed, "constructor", { value: undefined });
      const namedByNothing = new Uint8Array(3);
      Object.defineProperty(namedByNothing, "constructor", { value: {} });
      const namedEmpty = new Uint8Array(4);
      Object.defineProperty(namedEmpty, "constructor", { value: { name: "" } });
      const values = {
        "an array buffer": new ArrayBuffer(8),
        "an empty array buffer": new ArrayBuffer(0),
        "bytes": new Uint8Array([1, 2, 3]),
        "no bytes": new Uint8Array(0),
        "numbers of eight bytes each": new Float64Array(2),
        "a part of a buffer": new Uint16Array(new ArrayBuffer(16), 4, 3),
        "a data view": new DataView(new ArrayBuffer(8), 2),
        "a node buffer": Buffer.from("abc"),
        "a shared buffer": new SharedArrayBuffer(4),
        "bytes whose kind is hidden": unnamed,
        "bytes whose kind has no name": namedByNothing,
        "bytes whose kind has an empty name": namedEmpty,
        "bytes with a name field": Object.assign(new Uint8Array(1), { name: "treated as an error" }),
      };
      return Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
    },
  },
  {
    name: "where the machine has no ArrayBuffer, or one that cannot tell a view, bytes are written like any object",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const values = () => ({
        "an array buffer": shown(terminal, new RealArrayBuffer(8)),
        bytes: shown(terminal, new Uint8Array([1, 2])),
        "an object": shown(terminal, { a: 1 }),
        "an object with no prototype": shown(terminal, Object.assign(Object.create(null), { a: 1 })),
        "a map": shown(terminal, new Map([["k", 1]])),
      });
      const RealArrayBuffer = ArrayBuffer;
      function CannotTell() {}
      function SaysYesToAll() {}
      SaysYesToAll.isView = () => true;
      return {
        "no ArrayBuffer": withGlobals({ ArrayBuffer: undefined }, values),
        "an ArrayBuffer that cannot tell a view": withGlobals({ ArrayBuffer: CannotTell }, values),
        "an ArrayBuffer that calls everything a view": withGlobals({ ArrayBuffer: SaysYesToAll }, () => {
          const line = (metadata) => {
            const lines = written(() => terminal.log(undefined, entryOf({ metadata })));
            return Array.isArray(lines) ? lines[0].log : lines;
          };
          return {
            "an object": line({ a: 1 }),
            "an object that says how many bytes it has": line({ byteLength: 12 }),
            "an object with no prototype": line(Object.assign(Object.create(null), { a: 1 })),
            "an object whose kind has no name": line({ constructor: {}, byteLength: 3 }),
            "an object made by a class": line(new (class Shape { side = 1; })()),
            "a list": line([1]),
            "an object inside what was added": shown(terminal, { a: 1 }),
          };
        }),
        "the machine's own, after": values(),
      };
    },
  },
  {
    name: "six levels deep, lists, maps and objects are written by their kind only; texts and numbers are written at any depth, and so are errors",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const inList = (inner) => [inner];
      const inMap = (inner) => new Map([["k", inner]]);
      const inCause = (inner) => new Error("e", { cause: inner });
      class Shape {
        side = 1;
      }
      const Anonymous = (() => class {})();
      const values = {
        "an object four levels in": nested(4, { leaf: 1 }),
        "an object five levels in": nested(5, { leaf: 1 }),
        "an object six levels in": nested(6, { leaf: 1 }),
        "an empty object five levels in": nested(5, {}),
        "a text five levels in": nested(5, "deep"),
        "a text six levels in": nested(6, "deep"),
        "an object made by a class, five levels in": nested(5, new Shape()),
        "an object made by a class with no name, five levels in": nested(5, new Anonymous()),
        "an object with no prototype, five levels in": nested(5, Object.create(null)),
        "an object whose constructor has no name, five levels in": nested(5, { constructor: {} }),
        "a list four levels in": nested(4, [1, 2, 3], inList),
        "a list five levels in": nested(5, [1, 2, 3], inList),
        "an empty list five levels in": nested(5, []),
        "a map four levels in": nested(4, new Map([["a", 1]]), inMap),
        "a map five levels in": nested(5, new Map([["a", 1], ["b", 2]]), inMap),
        "a set five levels in": nested(5, new Set([1, 2])),
        "bytes five levels in": nested(5, new Uint8Array(2)),
        "a date five levels in": nested(5, new Date(AT)),
        "an error five levels in": nested(5, new Error("deep error", { cause: { still: "written" } })),
        "causes eight deep": nested(8, "the root", inCause),
        "an object under four causes": nested(4, { a: 1 }, inCause),
        "an object under five causes": nested(5, { a: 1 }, inCause),
        "a summary five levels in": nested(5, { kind: "summary", summary: "kept short" }),
        "a map's key five levels in": nested(4, new Map([[{ key: 1 }, [1]]]), inList),
      };
      return Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
    },
  },
  {
    name: "a thing that holds itself is written as [Circular] where it comes round; the same thing held twice side by side is written twice",
    run: async ({ logger }, tools) => {
      const terminal = terminalOf(await plainLoad(logger, tools));
      const object = { id: 1 };
      object.self = object;
      const list = [1];
      list.push(list);
      const map = new Map();
      map.set("self", map).set(map, "as a key");
      const set = new Set();
      set.add(set);
      const error = new Error("round");
      error.cause = { back: error };
      const a = {};
      const b = { a };
      a.b = b;
      const shared = { shared: true };
      const values = {
        "an object in itself": object,
        "a list in itself": list,
        "a map in itself, as a value and as a key": map,
        "a set in itself": set,
        "an error whose cause leads back to it": error,
        "two objects in each other": a,
        "the same object twice": { first: shared, second: shared, list: [shared, shared] },
        "an object in itself, four levels in": nested(4, object),
        "an object in itself, five levels in": nested(5, object),
      };
      const rendered = Object.fromEntries(Object.entries(values).map(([label, value]) => [label, shown(terminal, value)]));
      const twoLines = written(() => {
        terminal.log(undefined, entryOf({ context: object, metadata: object, error: object }));
        terminal.log(undefined, entryOf({ metadata: { again: object } }));
      });
      return { ...rendered, "the same object as context, as what was added and as the error, then on a second line": twoLines };
    },
  },
  {
    name: "a context put among what is added is written as an error would be, by its name alone, or as Error when it has none",
    run: async ({ logger }, tools) => {
      const { core, ...loaded } = await plainLoad(logger, tools);
      const terminal = terminalOf(loaded);
      const colour = core.createKey(Symbol("colour"), "none");
      const root = core.createContext();
      const [canceled, cancel] = root.withName("stopped").withCancel();
      cancel("stop");
      return {
        "a new context": shown(terminal, root),
        "a named context": shown(terminal, root.withName("turn")),
        "a context made from a named one": shown(terminal, root.withName("turn").with(colour, "red")),
        "a context with an empty name": shown(terminal, root.withName("")),
        "a context whose name is a number": shown(terminal, root.withName(7)),
        "a canceled context": shown(terminal, canceled),
        "a named context five levels in": shown(terminal, nested(5, root.withName("deep"))),
        "a context as the error of a line": written(() => terminal.log(undefined, entryOf({ level: "error", error: root.withName("as the error") }))),
        "a context as what was added": written(() => terminal.log(undefined, entryOf({ metadata: root.withName("as what was added") }))),
        "the terminal backend, as a value": shown(terminal, root.get(loaded.logger.loggerKey)),
        "a key": shown(terminal, colour),
      };
    },
  },
  {
    name: "in colour: each part of a line and each kind of value has its own colour, and every coloured piece ends with a reset",
    run: async ({ logger }, tools) => {
      const { core, ...loaded } = await colouredLoad(logger, tools);
      const terminal = terminalOf(loaded);
      const named = core.createContext().withName("turn").withName("tool");
      const round = { id: 1 };
      round.self = round;
      const everything = {
        text: "hello",
        number: 1.5,
        big: 10n,
        yes: true,
        nothing: null,
        missing: undefined,
        symbol: Symbol("s"),
        fn: function namedFunction() {},
        date: new Date(AT),
        noDate: new Date(Number.NaN),
        pattern: /x/g,
        summary: { kind: "summary", summary: "3 files" },
        error: new RangeError("out of range", { cause: "why" }),
        list: [1, "two"],
        emptyList: [],
        longList: Array.from({ length: 42 }, (_, at) => at),
        buffer: new ArrayBuffer(4),
        bytes: new Uint8Array(3),
        map: new Map([["k", 1]]),
        emptyMap: new Map(),
        set: new Set(["s"]),
        object: { inner: {} },
        round,
        deep: nested(5, { a: 1 }),
        deepList: nested(5, [1], (inner) => [inner]),
        deepMap: nested(5, new Map([["a", 1]]), (inner) => [inner]),
      };
      const failure = Object.assign(new TypeError("wrong type", { cause: new Error("inner") }), { stack: "TypeError: wrong type\n    at first (file:///a.js:1:2)\n    at second" });
      return {
        debug: written(() => terminal.log(named, entryOf({ level: "debug", message: "a debug line", context: named }))),
        info: written(() => terminal.log(named, entryOf({ level: "info", message: "an info line", context: named, metadata: { n: 1 } }))),
        warn: written(() => terminal.log(named, entryOf({ level: "warn", message: "a warning", context: { requestId: "r-1" } }))),
        error: written(() => terminal.log(named, entryOf({ level: "error", message: "an error", context: named, metadata: { n: 1 }, error: failure }))),
        "an error that is a text": written(() => terminal.log(named, entryOf({ level: "error", message: "an error", error: "it failed" }))),
        "every kind of value": written(() => terminal.log(named, entryOf({ metadata: everything }))),
        "an object of 51 fields": written(() => terminal.log(named, entryOf({ metadata: Object.fromEntries(Array.from({ length: 51 }, (_, at) => [`f${at}`, at])) }))),
        "a map of 51": written(() => terminal.log(named, entryOf({ metadata: { m: new Map(Array.from({ length: 51 }, (_, at) => [at, at])) } }))),
      };
    },
  },
  {
    name: "colour is decided once, when the file is loaded, from the environment then: NO_COLOR and a dumb terminal say no, FORCE_COLOR says yes or no, and otherwise a terminal says yes",
    run: async ({ core }, tools) => {
      const named = core.createContext().withName("turn");
      const inheritsNoColor = Object.create({ NO_COLOR: "1" });
      const machines = {
        "no process at all": undefined,
        "a process with nothing in it": {},
        "no environment, a terminal": { stdout: { isTTY: true } },
        "an environment of null, a terminal": { env: null, stdout: { isTTY: true } },
        "an empty environment, no output": { env: {} },
        "an empty environment, an output that says nothing": { env: {}, stdout: {} },
        "an empty environment, not a terminal": { env: {}, stdout: { isTTY: false } },
        "an empty environment, a terminal": { env: {}, stdout: { isTTY: true } },
        "a terminal that says yes in its own way": { env: {}, stdout: { isTTY: "yes" } },
        "NO_COLOR=1, a terminal": { env: { NO_COLOR: "1" }, stdout: { isTTY: true } },
        "NO_COLOR empty, a terminal": { env: { NO_COLOR: "" }, stdout: { isTTY: true } },
        "NO_COLOR there with no value, a terminal": { env: { NO_COLOR: undefined }, stdout: { isTTY: true } },
        "NO_COLOR from above, a terminal": { env: inheritsNoColor, stdout: { isTTY: true } },
        "NO_COLOR and FORCE_COLOR=1": { env: { NO_COLOR: "1", FORCE_COLOR: "1" }, stdout: { isTTY: true } },
        "no_color in small letters, a terminal": { env: { no_color: "1" }, stdout: { isTTY: true } },
        "TERM=dumb, a terminal": { env: { TERM: "dumb" }, stdout: { isTTY: true } },
        "TERM=dumb and FORCE_COLOR=1": { env: { TERM: "dumb", FORCE_COLOR: "1" }, stdout: { isTTY: true } },
        "TERM=DUMB, a terminal": { env: { TERM: "DUMB" }, stdout: { isTTY: true } },
        "TERM=xterm, not a terminal": { env: { TERM: "xterm" }, stdout: { isTTY: false } },
        "FORCE_COLOR=1, not a terminal": { env: { FORCE_COLOR: "1" }, stdout: { isTTY: false } },
        "FORCE_COLOR=true, not a terminal": { env: { FORCE_COLOR: "true" }, stdout: { isTTY: false } },
        "FORCE_COLOR=1, no output": { env: { FORCE_COLOR: "1" } },
        "FORCE_COLOR=0, a terminal": { env: { FORCE_COLOR: "0" }, stdout: { isTTY: true } },
        "FORCE_COLOR=0, not a terminal": { env: { FORCE_COLOR: "0" }, stdout: { isTTY: false } },
        "FORCE_COLOR=2, not a terminal": { env: { FORCE_COLOR: "2" }, stdout: { isTTY: false } },
        "FORCE_COLOR=2, a terminal": { env: { FORCE_COLOR: "2" }, stdout: { isTTY: true } },
        "FORCE_COLOR empty, a terminal": { env: { FORCE_COLOR: "" }, stdout: { isTTY: true } },
        "FORCE_COLOR=false, a terminal": { env: { FORCE_COLOR: "false" }, stdout: { isTTY: true } },
        "FORCE_COLOR=TRUE, not a terminal": { env: { FORCE_COLOR: "TRUE" }, stdout: { isTTY: false } },
        "FORCE_COLOR the number 1, not a terminal": { env: { FORCE_COLOR: 1 }, stdout: { isTTY: false } },
        "FORCE_COLOR the number 0, a terminal": { env: { FORCE_COLOR: 0 }, stdout: { isTTY: true } },
      };
      const coloured = {};
      for (const [label, machine] of Object.entries(machines)) {
        const terminal = terminalOf(await loadedWith(tools, { process: machine }));
        const lines = written(() => terminal.log(named, entryOf({ context: named, metadata: { n: 1 } })));
        coloured[label] = lines[0].log.includes("\u001b[") ? "in colour" : lines[0].log;
      }
      const decided = terminalOf(await loadedWith(tools, { process: { env: { FORCE_COLOR: "1" }, stdout: { isTTY: false } } }));
      const later = withGlobals({ process: { env: { NO_COLOR: "1" }, stdout: { isTTY: false } } }, () => written(() => decided.log(named, entryOf({}))));
      const plain = terminalOf(await loadedWith(tools, { process: { env: {}, stdout: { isTTY: false } } }));
      const laterStill = withGlobals({ process: { env: { FORCE_COLOR: "1" }, stdout: { isTTY: true } } }, () => written(() => plain.log(named, entryOf({}))));
      return { coloured, "decided in colour, then the environment says no": later, "decided plain, then the environment says yes": laterStill };
    },
  },
  {
    name: "the console written to is the one that was there when the file was loaded, and its log, warn and error are looked up at each line",
    run: async ({ core }, tools) => {
      const standInConsole = (label) => {
        const lines = [];
        const standIn = Object.create(console);
        for (const method of ["log", "warn", "error"]) {
          standIn[method] = function (...given) {
            lines.push(`${label}, ${method}${this === standIn ? "" : ", called on something else"}${given.length === 1 ? "" : `, given ${given.length} things`}: ${given[0]}`);
          };
        }
        return { standIn, lines };
      };
      const atLoad = standInConsole("the console at load");
      const later = standInConsole("a console put in its place later");
      const key = (await loadedWith(tools, { console: atLoad.standIn, process: { env: {}, stdout: { isTTY: false } } })).logger.loggerKey;
      const named = core.createContext().withName("turn");
      const throughTheReal = written(() => key.defaultValue.log(named, entryOf({ message: "with the machine's console back" })));
      withGlobals({ console: later.standIn }, () => {
        key.defaultValue.log(named, entryOf({ message: "with another console in its place" }));
        key.defaultValue.log(named, entryOf({ level: "warn", message: "a warning" }));
        key.defaultValue.log(named, entryOf({ level: "error", message: "an error", error: "why" }));
      });
      atLoad.standIn.log = (text) => atLoad.lines.push(`the console at load, a log put on it after: ${text}`);
      key.defaultValue.log(named, entryOf({ message: "after its log was replaced" }));
      delete atLoad.standIn.warn;
      const withoutItsOwnWarn = written(() => key.defaultValue.log(named, entryOf({ level: "warn", message: "its warn is the machine's again" })));
      return { atLoad: atLoad.lines, later: later.lines, throughTheReal, withoutItsOwnWarn };
    },
  },
  {
    name: "the backend the test itself loaded writes through the machine's console, and a logger with no backend set reaches it",
    run: ({ core, logger }) => {
      const named = core.createContext().withName("turn").withName("tool");
      const log = logger.createLogger("recorded");
      const time = clock();
      const lines = withGlobals({ Date: time.Date }, () =>
        written(() => {
          log.debug(named, "a debug line");
          log.info(named, "an info line", { n: 1 });
          log.warn(logger.withLogAttributes(named, { tool: "Shell" }), "a warning", { n: 2 });
          log.error(named, "an error", Object.assign(new Error("it failed"), { stack: "Error: it failed\n    at somewhere (file:///a.js:1:2)" }), { n: 3 });
          log.info(core.createContext(), "no names, nothing added");
        }),
      );
      const direct = written(() => logger.loggerKey.defaultValue.log(named, entryOf({ context: named, metadata: { direct: true } })));
      let nothingComesBack = "not called";
      written(() => {
        nothingComesBack = [logger.loggerKey.defaultValue.log(named, entryOf({})), logger.getLoggerBackend(named).log(named, entryOf({}))].every((value) => value === undefined);
      });
      const scrubbed = (written) => written.map((line) => Object.fromEntries(Object.entries(line).map(([method, text]) => [method, colourless(text)])));
      return { lines: scrubbed(lines), direct: scrubbed(direct), nothingComesBack, clockRead: time.state.reads };
    },
  },

  // ───────────────────────────────── otel.ts ─────────────────────────────────
  {
    name: "a tracer is asked of OpenTelemetry by name, 'context-tracer' unless another is given",
    run: ({ otel }) => {
      const withTracing = traced((tracing) => {
        const tracers = [otel.getTracer(), otel.getTracer("mine"), otel.getTracer(undefined), otel.getTracer(""), otel.getTracer(null), otel.getTracer(7)];
        return { theStandInsTracer: tracers.map((tracer) => tracer === tracing.tracer), asked: tracing.asked };
      });
      const tracer = otel.getTracer();
      const span = tracer.startSpan("nobody listens");
      return {
        withTracing,
        withNoTracingSetUp: { startSpan: typeof tracer.startSpan, recording: span.isRecording(), spanContext: span.spanContext() },
        takes: otel.getTracer.length,
      };
    },
  },
  {
    name: "a span is started under the context's own name, or 'anonymous-context'; the first one is also kept as the root, with the time it started",
    run: ({ core, otel }) => {
      const time = clock(AT, 7);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const key = core.createKey(Symbol("k"), 0);
          const root = core.createContext();
          const options = { kind: 2, attributes: { "rpc.method": "run" } };
          const unnamed = otel.withSpan(root);
          const named = otel.withSpan(root.withName("turn"), options);
          const nameAbove = otel.withSpan(root.withName("turn").with(key, 1));
          const emptyName = otel.withSpan(root.withName(""));
          const child = otel.withSpan(named.withName("tool"), options);
          const grandchild = otel.withSpan(child.withName("step"));
          const unnamedChild = otel.withSpan(named);
          return {
            asked: tracing.asked,
            theOptionsGiven: tracing.spans.length === 7 && [1, 4].map((at) => tracing.asked.filter((call) => "startSpan" in call)[at].options === options),
            spans: [unnamed, named, nameAbove, emptyName, child, grandchild, unnamedChild].map((context) => otel.getSpan(context)?.label),
            contextsMadeOnTheWay: { unnamed: stepsBack(unnamed, root), named: stepsBack(named, root), child: stepsBack(child, named), grandchild: stepsBack(grandchild, child) },
            paths: [unnamed.getPath(), named.getPath(), child.getPath(), grandchild.getPath()],
            noNameOfItsOwn: [named.name, child.name],
            noSpanBefore: [otel.getSpan(root), otel.getSpan(root.withName("turn"))],
            clockRead: time.state.reads,
            takes: [otel.withSpan.length, otel.getSpan.length],
          };
        }),
      );
    },
  },
  {
    name: "attributes to hand down are set on the span of the context they are added to, and on every span started below it, in the order they were added",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { INHERITABLE_SPAN_ATTRIBUTES_KEY, withInheritableAttribute, withSpan } = otel;
          const root = core.createContext().withName("turn");
          const byDefault = root.get(INHERITABLE_SPAN_ATTRIBUTES_KEY);
          const beforeAnySpan = withInheritableAttribute(withInheritableAttribute(root, "team", "blue"), "dev", true);
          const spanned = withSpan(beforeAnySpan);
          tracing.asked.push("— a span is there now —");
          const more = withInheritableAttribute(withInheritableAttribute(withInheritableAttribute(spanned, "9", "nine"), "team", "red"), "1", ["one"]);
          tracing.asked.push("— a span below —");
          const below = withSpan(more.withName("tool"));
          tracing.asked.push("— a span beside, from before the later attributes —");
          withSpan(spanned.withName("beside"));
          const fromAbove = Object.create({ inherited: "from above" });
          fromAbove.own = "own";
          tracing.asked.push("— attributes that are an object with fields from above —");
          const handed = root.with(INHERITABLE_SPAN_ATTRIBUTES_KEY, fromAbove);
          withSpan(handed);
          const added = withInheritableAttribute(handed, "added", 1);
          return {
            key: { fields: Object.keys(INHERITABLE_SPAN_ATTRIBUTES_KEY), symbol: INHERITABLE_SPAN_ATTRIBUTES_KEY.symbol, default: INHERITABLE_SPAN_ATTRIBUTES_KEY.defaultValue },
            byDefault: { value: byDefault, theSameObjectForAll: byDefault === core.createContext().get(INHERITABLE_SPAN_ATTRIBUTES_KEY) && byDefault === INHERITABLE_SPAN_ATTRIBUTES_KEY.defaultValue, untouchedAfter: Object.keys(byDefault) },
            asked: tracing.asked,
            attributes: { beforeAnySpan: beforeAnySpan.get(INHERITABLE_SPAN_ATTRIBUTES_KEY), more: more.get(INHERITABLE_SPAN_ATTRIBUTES_KEY), below: below.get(INHERITABLE_SPAN_ATTRIBUTES_KEY), root: root.get(INHERITABLE_SPAN_ATTRIBUTES_KEY), addedToTheObjectFromAbove: added.get(INHERITABLE_SPAN_ATTRIBUTES_KEY) },
            aNewObjectEachTime: more.get(INHERITABLE_SPAN_ATTRIBUTES_KEY) !== spanned.get(INHERITABLE_SPAN_ATTRIBUTES_KEY),
            madeFromTheContextGiven: [stepsBack(beforeAnySpan, root), stepsBack(more, spanned)],
            takes: withInheritableAttribute.length,
          };
        }),
      );
    },
  },
  {
    name: "the attributes every context starts with are one object: what is written on it is set on every span, until it is taken off",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const shared = core.createContext().get(otel.INHERITABLE_SPAN_ATTRIBUTES_KEY);
          shared.leaked = "to all";
          try {
            otel.withSpan(core.createContext().withName("elsewhere"));
            otel.reportEvent(otel.withSpan(core.createContext().withName("other")), "seen");
          } finally {
            delete shared.leaked;
          }
          otel.withSpan(core.createContext().withName("after"));
          return tracing.asked.filter((call) => "setAttribute" in call || "startSpan" in call).map((call) => ("startSpan" in call ? `start ${call.started}` : `${call.on}: ${call.setAttribute.join("=")}`));
        }),
      );
    },
  },
  {
    name: "the values a context carries for spans and for logging are kept under symbols with these names, in the order they were set",
    run: ({ core, logger, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced(() => {
          const carried = (context) => [...Object.values(context).find((held) => held instanceof Map).keys()].map((symbol) => symbol.description);
          const root = core.createContext();
          const elsewhere = { traceId: "t", spanId: "s", traceFlags: 1 };
          return {
            "a new context": carried(root),
            "a first span": carried(otel.withSpan(root)),
            "a span below, by name": carried(otel.withSpan(otel.withSpan(root).withName("below"))),
            "a span below, with no name between": carried(otel.withSpan(otel.withSpan(root))),
            "child spans suppressed": carried(otel.withSuppressedChildSpans(root)),
            "an attribute to hand down": carried(otel.withInheritableAttribute(root, "k", 1)),
            "a backend, an attribute, suppressed, then a span": carried(otel.withSpan(otel.withSuppressedChildSpans(otel.withInheritableAttribute(root.with(logger.loggerKey, { log() {} }), "k", 1)))),
            "log attributes": carried(logger.withLogAttributes(root, { a: 1 })),
            "from a span known elsewhere": carried(otel.createContextFromSpanContext(elsewhere)),
            "standing for a span known elsewhere, on a context with a span": carried(otel.createContextFromRemoteSpanContext(elsewhere, undefined, otel.withSpan(root))),
          };
        }),
      );
    },
  },
  {
    name: "with child spans suppressed: under a span no further span is started and the same context comes back; with no span above, one is started",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { withSuppressedChildSpans, withSpan, getSpan } = otel;
          const root = core.createContext().withName("turn");
          const spanned = withSpan(root);
          const quiet = withSuppressedChildSpans(spanned);
          tracing.asked.push("— suppressed under a span —");
          const below = withSpan(quiet.withName("tool"));
          const quietTool = quiet.withName("tool");
          const sameContext = withSpan(quietTool) === quietTool;
          tracing.asked.push("— suppressed with no span above —");
          const quietRoot = withSuppressedChildSpans(root);
          const first = withSpan(quietRoot.withName("first"));
          tracing.asked.push("— and below the span that was started —");
          const second = withSpan(first.withName("second"));
          return {
            asked: tracing.asked,
            sameContext,
            theSpanAbove: getSpan(below) === getSpan(spanned),
            madeFromTheContextGiven: [stepsBack(quiet, spanned), quiet.name, quiet.getPath()],
            first: getSpan(first)?.label,
            secondIsFirst: getSpan(second) === getSpan(first),
            takes: withSuppressedChildSpans.length,
          };
        }),
      );
    },
  },
  {
    name: "createSpan gives the context and its span together, and ends the span when let go, as often as it is let go; a suppressed one ends nothing",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { createSpan, DisposableSpan, getSpan, withSuppressedChildSpans } = otel;
          const root = core.createContext();
          const options = { kind: 1 };
          const held = createSpan(root.withName("turn"), options);
          const unnamed = createSpan(root);
          const below = createSpan(held.ctx.withName("tool"));
          const quiet = withSuppressedChildSpans(held.ctx).withName("quiet");
          tracing.asked.push("— suppressed under a span —");
          const suppressed = createSpan(quiet);
          tracing.asked.push("— suppressed with no span above —");
          const quietRoot = createSpan(withSuppressedChildSpans(root).withName("alone"));
          tracing.asked.push("— let go: held twice, below, the suppressed one, the one started alone —");
          const returned = [held[Symbol.dispose](), held[Symbol.dispose](), below[Symbol.dispose](), suppressed[Symbol.dispose](), quietRoot[Symbol.dispose]()];
          return {
            asked: tracing.asked,
            returned,
            held: { fields: Object.keys(held), isADisposableSpan: held instanceof DisposableSpan, className: held.constructor.name, span: held.span.label, theContextsSpan: getSpan(held.ctx) === held.span, contextsMadeOnTheWay: stepsBack(held.ctx, root), endsWhenLetGo: Object.values(held)[2] },
            unnamed: unnamed.span.label,
            below: below.span.label,
            suppressed: { theSameContext: suppressed.ctx === quiet, theSpanAbove: suppressed.span === held.span, endsWhenLetGo: Object.values(suppressed)[2] },
            quietRoot: { span: quietRoot.span.label, endsWhenLetGo: Object.values(quietRoot)[2] },
            takes: createSpan.length,
          };
        }),
      );
    },
  },
  {
    name: "a DisposableSpan made by hand ends its span when let go unless told not to, and holds the context and span it was given",
    run: ({ core, otel }) => {
      const { DisposableSpan } = otel;
      const context = core.createContext();
      const ended = [];
      const spanFor = (label) => ({ label, end: (...given) => ended.push({ [label]: given }) });
      const made = {
        "told nothing": new DisposableSpan(context, spanFor("told nothing")),
        "told yes": new DisposableSpan(context, spanFor("told yes"), true),
        "told no": new DisposableSpan(context, spanFor("told no"), false),
        "told undefined": new DisposableSpan(context, spanFor("told undefined"), undefined),
        "told null": new DisposableSpan(context, spanFor("told null"), null),
        "told zero": new DisposableSpan(context, spanFor("told zero"), 0),
        "told a text": new DisposableSpan(context, spanFor("told a text"), "yes"),
      };
      const returned = Object.values(made).map((disposable) => disposable[Symbol.dispose]());
      const noSpan = attempt(() => new DisposableSpan(context)[Symbol.dispose]());
      return {
        ended,
        returned,
        fields: Object.fromEntries(Object.entries(made).map(([label, disposable]) => [label, Object.entries(disposable).map(([field, value]) => `${field}: ${field === "ctx" ? value === context : field === "span" ? value.label : String(value)}`)])),
        whatCanBeDoneWithOne: Object.getOwnPropertyNames(DisposableSpan.prototype).concat(Object.getOwnPropertySymbols(DisposableSpan.prototype).map((symbol) => (symbol === Symbol.dispose ? "Symbol.dispose" : String(symbol)))),
        takes: DisposableSpan.length,
        noSpan,
        notCalledWithNew: attempt(() => DisposableSpan(context, spanFor("x"))).threw instanceof TypeError,
      };
    },
  },
  {
    name: "what a span is known by elsewhere: its trace, its id, its flags (0 when child spans are suppressed) and its state as a text; nothing when there is no span or it cannot say",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { getSpanContextData, withSpan, withSuppressedChildSpans, getSpan } = otel;
          const root = core.createContext();
          const spanned = withSpan(root.withName("turn"));
          const span = getSpan(spanned);
          const says = (spanContext) => {
            span.spanContext = () => {
              tracing.asked.push("the span is asked what it is known by");
              return typeof spanContext === "function" ? spanContext() : spanContext;
            };
            return [getSpanContextData(spanned), getSpanContextData(withSuppressedChildSpans(spanned))];
          };
          const plainAnswer = [getSpanContextData(spanned), getSpanContextData(withSuppressedChildSpans(spanned)), getSpanContextData(spanned.withName("below").withCancel()[0])];
          const flagsRead = [];
          const watchedFlags = {
            traceId: "t",
            spanId: "s",
            get traceFlags() {
              flagsRead.push("read");
              return 3;
            },
          };
          return {
            plainAnswer,
            fields: Object.keys(plainAnswer[0]),
            "a state that writes itself": says({ traceId: "t", spanId: "s", traceFlags: 1, traceState: { toString: () => "vendor=value" } }),
            "a state that is a text": says({ traceId: "t", spanId: "s", traceFlags: 1, traceState: "" }),
            "a state of null": says({ traceId: "t", spanId: "s", traceFlags: 1, traceState: null }),
            "flags of zero and other fields": says({ traceId: "t", spanId: "s", traceFlags: 0, isRemote: true, extra: "left out" }),
            "missing fields": says({}),
            "the flags are not read when suppressed": [says(watchedFlags), flagsRead],
            "a span that says nothing": says(undefined),
            "a span that throws": says(() => {
              throw new Error("cannot say");
            }),
            "a state that throws": says({ traceId: "t", spanId: "s", traceFlags: 1, traceState: { toString: () => { throw new Error("no state"); } } }),
            "no span": [getSpanContextData(root), getSpanContextData(withSuppressedChildSpans(root))],
            "a context that throws": getSpanContextData({ get: () => { throw new Error("no context"); } }),
            "not a context": [getSpanContextData({}), getSpanContextData(undefined), getSpanContextData()],
            asked: tracing.asked,
            takes: getSpanContextData.length,
          };
        }),
      );
    },
  },
  {
    name: "a context made from a span known elsewhere starts a span under it, 'child.span' unless named, on a new context or the one given",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { createContextFromSpanContext, getSpan } = otel;
          const elsewhere = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: 1 };
          const existing = core.createContext().withName("existing");
          const made = {
            "only the span": createContextFromSpanContext(elsewhere),
            named: createContextFromSpanContext(elsewhere, "remote.turn"),
            "an empty name": createContextFromSpanContext(elsewhere, ""),
            "on a context": createContextFromSpanContext(elsewhere, undefined, existing),
            "named, on a context": createContextFromSpanContext(elsewhere, "remote.turn", existing),
            "more fields, and said not to be remote": createContextFromSpanContext({ ...elsewhere, isRemote: false, traceState: "kept", extra: "kept too" }, "more"),
            "no flags": createContextFromSpanContext({ traceId: "t", spanId: "s" }),
            "nothing known": createContextFromSpanContext(undefined, "from nothing"),
          };
          const theGivenIsUntouched = Object.keys(elsewhere);
          return {
            asked: tracing.asked,
            made: Object.fromEntries(Object.entries(made).map(([label, context]) => [label, { span: getSpan(context)?.label, name: context.name, path: context.getPath(), madeFromTheOneGiven: stepsBack(context, existing), depth: depthOf(context), canceled: context.canceled }])),
            theGivenIsUntouched,
            clockRead: time.state.reads,
            takes: createContextFromSpanContext.length,
          };
        }),
      );
    },
  },
  {
    name: "a context made to stand for a span known elsewhere starts nothing: its span only repeats what was given, marked as remote",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { createContextFromRemoteSpanContext, getSpan, getSpanContextData, withSpan, reportEvent } = otel;
          const elsewhere = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: 1 };
          const existing = core.createContext().withName("existing");
          const made = {
            "only the span": createContextFromRemoteSpanContext(elsewhere),
            named: createContextFromRemoteSpanContext(elsewhere, "remote.turn"),
            "an empty name": createContextFromRemoteSpanContext(elsewhere, ""),
            "on a context": createContextFromRemoteSpanContext(elsewhere, undefined, existing),
            "named, on a context": createContextFromRemoteSpanContext(elsewhere, "remote.turn", existing),
            "more fields, and said not to be remote": createContextFromRemoteSpanContext({ ...elsewhere, isRemote: false, traceState: { toString: () => "vendor=value" }, extra: "kept too" }, "more"),
            "nothing known": createContextFromRemoteSpanContext(undefined, "from nothing"),
          };
          const askedBefore = tracing.asked.length;
          const below = withSpan(made.named.withName("below"));
          reportEvent(made.named, "arrived");
          return {
            askedWhileMaking: askedBefore,
            made: Object.fromEntries(
              Object.entries(made).map(([label, context]) => {
                const span = getSpan(context);
                const { traceState, ...known } = span.spanContext();
                return [label, { known, state: traceState === undefined ? undefined : String(traceState), recording: span.isRecording(), data: getSpanContextData(context), name: context.name, path: context.getPath(), madeFromTheOneGiven: stepsBack(context, existing), depth: depthOf(context) }];
              }),
            ),
            aSpanBelowAndAnEvent: tracing.asked,
            below: getSpan(below).label,
            clockRead: time.state.reads,
            takes: createContextFromRemoteSpanContext.length,
          };
        }),
      );
    },
  },
  {
    name: "a finished span is recorded only under a span, and not where child spans are suppressed: started with the options given and ended at the time given",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { recordCompletedSpanIfParented, withSpan, withSuppressedChildSpans, getSpan } = otel;
          const root = core.createContext().withName("turn");
          const noSpan = [recordCompletedSpanIfParented(root, { startTime: 1 }, 2), recordCompletedSpanIfParented(withSuppressedChildSpans(root))];
          const askedWithNoSpan = tracing.asked.length;
          const spanned = withSpan(root);
          const options = { startTime: AT - 500, attributes: { durationMs: 500 } };
          tracing.asked.push("— under a span —");
          const recorded = recordCompletedSpanIfParented(spanned.withName("slow"), options, AT);
          const noEnd = recordCompletedSpanIfParented(spanned.withName("no end given"), options);
          const nothingGiven = recordCompletedSpanIfParented(spanned);
          const endTimes = [recordCompletedSpanIfParented(spanned.withName("a date"), undefined, new Date(AT)), recordCompletedSpanIfParented(spanned.withName("a pair"), undefined, [1, 2]), recordCompletedSpanIfParented(spanned.withName("zero"), undefined, 0)];
          tracing.asked.push("— suppressed under a span —");
          const suppressed = recordCompletedSpanIfParented(withSuppressedChildSpans(spanned).withName("quiet"), options, AT);
          return {
            noSpan,
            askedWithNoSpan,
            asked: tracing.asked,
            returned: [recorded?.label, noEnd?.label, nothingGiven?.label, ...endTimes.map((span) => span?.label)],
            suppressed,
            theContextGivenKeepsItsSpan: getSpan(spanned).label,
            takes: recordCompletedSpanIfParented.length,
          };
        }),
      );
    },
  },
  {
    name: "an event is a span of no length under the context's span; how long after the root span started is written on the root span and on the event",
    run: ({ core, otel }) => {
      const time = clock(AT, 7);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { reportEvent, withSpan, withSuppressedChildSpans, withInheritableAttribute, createContextFromSpanContext } = otel;
          const root = core.createContext().withName("turn");
          const returned = [reportEvent(root, "no span, nothing happens")];
          tracing.asked.push("— under the root span —");
          const spanned = withSpan(root);
          returned.push(reportEvent(spanned, "first_token"));
          tracing.asked.push("— under a span below it, with attributes to hand down —");
          const below = withSpan(withInheritableAttribute(spanned, "team", "blue").withName("tool"));
          returned.push(reportEvent(below, "tool.started"));
          tracing.asked.push("— where child spans are suppressed —");
          returned.push(reportEvent(withSuppressedChildSpans(below), "still told"));
          tracing.asked.push("— under a span made from one known elsewhere: no root, no start time —");
          const remote = createContextFromSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, "remote");
          returned.push(reportEvent(remote, "arrived"));
          tracing.asked.push("— names that are not plain —");
          returned.push(reportEvent(spanned, ""), reportEvent(spanned, undefined), reportEvent(spanned, "with spaces and.dots"));
          return { asked: tracing.asked, returned, clockRead: time.state.reads, takes: reportEvent.length };
        }),
      );
    },
  },
  {
    name: "an event never throws: whatever fails on the way stops it there and is swallowed",
    run: ({ core, otel }) => {
      const time = clock(AT, 7);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { reportEvent, withSpan, getSpan } = otel;
          const fails = (label) => () => {
            tracing.asked.push(`${label} throws`);
            throw new Error(label);
          };
          const outcomes = {};
          const fresh = (name) => withSpan(core.createContext().withName(name));
          const startFails = fresh("a tracer that cannot start");
          const startSpan = tracing.tracer.startSpan;
          tracing.tracer.startSpan = fails("startSpan");
          outcomes["the event's span cannot be started"] = attempt(() => reportEvent(startFails, "e"));
          tracing.tracer.startSpan = startSpan;

          const rootFails = fresh("a root that cannot be written on");
          getSpan(rootFails).setAttribute = fails("setAttribute on the root span");
          outcomes["the root span cannot be written on"] = attempt(() => reportEvent(rootFails, "e"));

          const eventFails = fresh("an event that cannot be written on");
          tracing.tracer.startSpan = (...given) => Object.assign(startSpan(...given), { setAttribute: fails("setAttribute on the event's span") });
          outcomes["the event's span cannot be written on"] = attempt(() => reportEvent(eventFails, "e"));
          tracing.tracer.startSpan = (...given) => Object.assign(startSpan(...given), { end: fails("end") });
          outcomes["the event's span cannot be ended"] = attempt(() => reportEvent(eventFails, "e2"));
          tracing.tracer.startSpan = startSpan;

          const getTracer = tracing.provider.getTracer;
          tracing.provider.getTracer = fails("getTracer");
          outcomes["no tracer can be had"] = attempt(() => reportEvent(eventFails, "e3"));
          outcomes["no tracer can be had, for a span"] = attempt(() => withSpan(core.createContext()));
          tracing.provider.getTracer = getTracer;

          outcomes["a context that throws"] = attempt(() => reportEvent({ get: fails("the context's get") }, "e"));
          outcomes["not a context"] = [attempt(() => reportEvent({}, "e")), attempt(() => reportEvent(undefined, "e")), attempt(() => reportEvent())];
          return { outcomes, asked: tracing.asked };
        }),
      );
    },
  },
  {
    name: "a tracer that cannot start a span, or a span that cannot be written on or ended, stops everything but an event with the runtime's own error",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced((tracing) => {
          const { withSpan, createSpan, withInheritableAttribute, recordCompletedSpanIfParented, createContextFromSpanContext, reportEvent } = otel;
          const root = core.createContext().withName("turn");
          const spanned = withSpan(root);
          const startSpan = tracing.tracer.startSpan;
          const outcomes = {};
          tracing.tracer.startSpan = undefined;
          outcomes["a tracer that cannot start a span"] = { withSpan: attempt(() => withSpan(root)), createSpan: attempt(() => createSpan(root)), createContextFromSpanContext: attempt(() => createContextFromSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 })), reportEvent: attempt(() => reportEvent(spanned, "e")), underASpan: attempt(() => withSpan(spanned.withName("below"))) };
          tracing.tracer.startSpan = (...given) => Object.assign(startSpan(...given), { setAttribute: undefined });
          const mute = withSpan(root.withName("cannot be written on"));
          outcomes["a span that cannot be written on"] = {
            "nothing to hand down": mute !== undefined,
            "an attribute added to its context": attempt(() => withInheritableAttribute(mute, "k", 1)),
            "a span started where there are attributes to hand down": attempt(() => withSpan(withInheritableAttribute(root, "k", 1))),
            "an event under it": attempt(() => reportEvent(mute, "e")),
          };
          tracing.tracer.startSpan = (...given) => Object.assign(startSpan(...given), { end: undefined });
          outcomes["a span that cannot be ended"] = {
            "a finished span": attempt(() => recordCompletedSpanIfParented(spanned.withName("finished"), undefined, AT)),
            "a span let go": attempt(() => createSpan(root.withName("held"))[Symbol.dispose]()),
            "an event": attempt(() => reportEvent(spanned, "e")),
          };
          tracing.tracer.startSpan = startSpan;
          return { outcomes, asked: tracing.asked };
        }),
      );
    },
  },
  {
    name: "a span is started on top of whatever context OpenTelemetry says is active, with the span above put on it; a first span is handed no context at all",
    run: ({ core, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced(
          (tracing) => {
            const { withSpan, reportEvent, createContextFromSpanContext, recordCompletedSpanIfParented, createSpan } = otel;
            const first = withSpan(core.createContext().withName("first"));
            withSpan(first.withName("below"));
            createSpan(first.withName("below, by createSpan"));
            reportEvent(first, "event");
            recordCompletedSpanIfParented(first.withName("finished"), undefined, AT);
            createContextFromSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, "remote");
            return tracing.asked.filter((call) => "startSpan" in call).map(({ startSpan, given, under }) => ({ startSpan, given, under }));
          },
          { marked: true },
        ),
      );
    },
  },
  {
    name: "what each of the span functions asks of the context it is given, in order",
    run: ({ core, logger, otel }) => {
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced(() => {
          const root = core.createContext().withName("turn");
          const spanned = otel.withSpan(root);
          const quiet = otel.withSuppressedChildSpans(spanned);
          const quietRoot = otel.withSuppressedChildSpans(root);
          const asks = (context, run) => {
            const watched = watching(context);
            run(watched);
            return watched.asked;
          };
          const on = (run) => ({ "no span": asks(root, run), "under a span": asks(spanned, run), "suppressed under a span": asks(quiet, run), "suppressed, no span": asks(quietRoot, run) });
          return {
            withSpan: on((context) => otel.withSpan(context)),
            getSpan: on((context) => otel.getSpan(context)),
            createSpan: on((context) => otel.createSpan(context)),
            withSuppressedChildSpans: on((context) => otel.withSuppressedChildSpans(context)),
            withInheritableAttribute: on((context) => otel.withInheritableAttribute(context, "k", 1)),
            getSpanContextData: on((context) => otel.getSpanContextData(context)),
            recordCompletedSpanIfParented: on((context) => otel.recordCompletedSpanIfParented(context)),
            reportEvent: on((context) => otel.reportEvent(context, "e")),
            createContextFromSpanContext: [asks(root, (context) => otel.createContextFromSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, undefined, context)), asks(root, (context) => otel.createContextFromSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, "named", context))],
            createContextFromRemoteSpanContext: [asks(root, (context) => otel.createContextFromRemoteSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, undefined, context)), asks(root, (context) => otel.createContextFromRemoteSpanContext({ traceId: "t", spanId: "s", traceFlags: 1 }, "named", context))],
            "a logger's line": asks(root.with(logger.loggerKey, { log() {} }), (context) => logger.createLogger("x").info(context, "m")),
            withLogAttributes: asks(root.with(logger.loggerKey, { log() {} }), (context) => logger.withLogAttributes(context, { a: 1 })),
            getLoggerBackend: asks(root, (context) => logger.getLoggerBackend(context)),
            notAContext: {
              withSpan: [attempt(() => otel.withSpan({})), attempt(() => otel.withSpan(undefined))],
              getSpan: [attempt(() => otel.getSpan({})), attempt(() => otel.getSpan(undefined))],
              createSpan: [attempt(() => otel.createSpan({})), attempt(() => otel.createSpan(undefined))],
              withSuppressedChildSpans: [attempt(() => otel.withSuppressedChildSpans({})), attempt(() => otel.withSuppressedChildSpans(undefined))],
              withInheritableAttribute: [attempt(() => otel.withInheritableAttribute({}, "k", 1)), attempt(() => otel.withInheritableAttribute(undefined, "k", 1))],
              recordCompletedSpanIfParented: [attempt(() => otel.recordCompletedSpanIfParented({})), attempt(() => otel.recordCompletedSpanIfParented(undefined))],
              createContextFromSpanContext: [attempt(() => otel.createContextFromSpanContext({ traceId: "t", spanId: "s" }, "n", {})), attempt(() => otel.createContextFromSpanContext({ traceId: "t", spanId: "s" }, undefined, {}))],
              createContextFromRemoteSpanContext: [attempt(() => otel.createContextFromRemoteSpanContext({ traceId: "t", spanId: "s" }, "n", {})), attempt(() => otel.createContextFromRemoteSpanContext({ traceId: "t", spanId: "s" }, undefined, {}))],
            },
          };
        }),
      );
    },
  },
  {
    name: "each span function, step by step: what it asks of the tracer, the context, the spans and the clock, in order",
    run: ({ core, otel }) => {
      const steps = [];
      const time = clock(AT, 7, () => steps.push("the clock is read"));
      return withGlobals({ Date: time.Date }, () => {
        const tracing = tracingStandIn(steps);
        return traced(() => {
          const elsewhere = { traceId: "t", spanId: "s", traceFlags: 1 };
          const root = otel.withInheritableAttribute(core.createContext().withName("turn"), "team", "blue");
          const spanned = otel.withSpan(root);
          const quiet = otel.withSuppressedChildSpans(spanned);
          steps.length = 0;
          const told = {};
          const step = (label, run) => {
            const outcome = attempt(run);
            told[label] = steps.splice(0).map((entry) => (typeof entry === "string" ? entry : "startSpan" in entry ? `the tracer starts "${entry.startSpan}", given ${entry.given}` : "getTracer" in entry ? "a tracer is asked for" : `${entry.on}: ${Object.keys(entry).filter((field) => field !== "on")[0]}`));
            if ("threw" in outcome) told[label].push(`thrown: ${typeof outcome.threw === "string" ? outcome.threw : outcome.threw.constructor.name}`);
          };
          step("withSpan, a first span", () => otel.withSpan(watching(root, steps)));
          step("withSpan, under a span", () => otel.withSpan(watching(spanned.withName("tool"), steps)));
          step("withSpan, suppressed under a span", () => otel.withSpan(watching(quiet, steps)));
          step("withSpan, not a context", () => otel.withSpan({}));
          step("createSpan, under a span", () => otel.createSpan(watching(spanned.withName("tool"), steps))[Symbol.dispose]());
          step("createSpan, suppressed under a span", () => otel.createSpan(watching(quiet, steps))[Symbol.dispose]());
          step("createSpan, not a context", () => otel.createSpan({}));
          step("withInheritableAttribute, under a span", () => otel.withInheritableAttribute(watching(spanned, steps), "k", 1));
          step("getSpanContextData, under a span", () => otel.getSpanContextData(watching(spanned, steps)));
          step("recordCompletedSpanIfParented, under a span", () => otel.recordCompletedSpanIfParented(watching(spanned.withName("finished"), steps), undefined, AT));
          step("recordCompletedSpanIfParented, not a context", () => otel.recordCompletedSpanIfParented({}));
          step("reportEvent, under a span", () => otel.reportEvent(watching(spanned, steps), "event"));
          step("reportEvent, no span", () => otel.reportEvent(watching(core.createContext(), steps), "event"));
          step("reportEvent, not a context", () => otel.reportEvent({}, "event"));
          step("createContextFromSpanContext, named, on a context", () => otel.createContextFromSpanContext(elsewhere, "remote", watching(root, steps)));
          step("createContextFromSpanContext, on something that is no context", () => otel.createContextFromSpanContext(elsewhere, "remote", {}));
          step("createContextFromRemoteSpanContext, named, on a context", () => otel.createContextFromRemoteSpanContext(elsewhere, "remote", watching(root, steps)));
          step("createContextFromRemoteSpanContext, on something that is no context", () => otel.createContextFromRemoteSpanContext(elsewhere, undefined, {}));
          return told;
        }, { tracing });
      });
    },
  },
  {
    name: "with no tracing set up, spans are started and ended all the same and record nothing: no trace, no id, flags of 0",
    run: ({ core, otel }) => {
      trace.disable();
      const root = core.createContext().withName("turn");
      const held = otel.createSpan(root);
      const below = otel.createSpan(held.ctx.withName("tool"));
      const remote = otel.createContextFromSpanContext({ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: 1 }, "remote");
      const returned = [otel.reportEvent(below.ctx, "event"), otel.recordCompletedSpanIfParented(below.ctx.withName("finished"), undefined, AT)?.isRecording(), below[Symbol.dispose](), held[Symbol.dispose]()];
      return {
        held: { recording: held.span.isRecording(), data: otel.getSpanContextData(held.ctx) },
        below: { recording: below.span.isRecording(), data: otel.getSpanContextData(below.ctx), aSpanOfItsOwn: below.span !== held.span },
        underASpanKnownElsewhere: otel.getSpanContextData(remote),
        returned,
      };
    },
  },

  {
    name: "each load of the part has keys of its own: what is set under one load's keys the other does not see, though either can use the other's contexts",
    run: async ({ core, logger, otel }, tools) => {
      const other = await tools.fresh();
      const time = clock(AT, 0);
      return withGlobals({ Date: time.Date }, () =>
        traced(() => {
          const backend = { log() {} };
          const mine = otel.withSpan(otel.withInheritableAttribute(core.createContext().withName("turn").with(logger.loggerKey, backend), "k", 1));
          return {
            here: { backend: logger.getLoggerBackend(mine) === backend, span: otel.getSpan(mine)?.label, attributes: mine.get(otel.INHERITABLE_SPAN_ATTRIBUTES_KEY), data: otel.getSpanContextData(mine) },
            there: {
              backend: other.logger.getLoggerBackend(mine) === other.logger.loggerKey.defaultValue,
              span: other.otel.getSpan(mine),
              attributes: mine.get(other.otel.INHERITABLE_SPAN_ATTRIBUTES_KEY),
              data: other.otel.getSpanContextData(mine),
            },
            keysOfTheirOwn: [logger.loggerKey !== other.logger.loggerKey, logger.loggerKey.symbol !== other.logger.loggerKey.symbol, otel.INHERITABLE_SPAN_ATTRIBUTES_KEY.symbol !== other.otel.INHERITABLE_SPAN_ATTRIBUTES_KEY.symbol, logger.loggerKey.defaultValue !== other.logger.loggerKey.defaultValue],
            notSharedByName: [Symbol.keyFor(logger.loggerKey.symbol), Symbol.keyFor(otel.INHERITABLE_SPAN_ATTRIBUTES_KEY.symbol)],
            theOthersFunctionsOnThisContext: {
              path: other.logger.withLogAttributes(mine, { a: 1 }).withName("there").getPath(),
              aFirstSpanForTheOther: other.otel.getSpan(other.otel.withSpan(mine.withName("there")))?.label,
              aContextOfTheOthersHere: otel.getSpan(otel.withSpan(other.core.createContext().withName("from there")))?.label,
            },
          };
        }),
      );
    },
  },

  // ──────────────────────────────── index.ts ─────────────────────────────────
  {
    name: "the index hands on everything the five files export, the very same things, and the browser bridge exports nothing",
    run: ({ abortReason, browserBridge, core, index, logger, otel }) => {
      const files = { abortReason, browserBridge, core, logger, otel };
      const from = {};
      for (const name of Object.keys(index).sort()) {
        const homes = Object.entries(files).filter(([, file]) => name in file && file[name] === index[name]).map(([label]) => label);
        from[name] = homes.length === 1 ? homes[0] : homes;
      }
      const all = Object.values(files).flatMap((file) => Object.keys(file));
      return { from, nothingLeftOut: all.every((name) => name in index), nothingTwice: new Set(all).size === all.length, browserBridge: Object.keys(browserBridge) };
    },
  },
];
