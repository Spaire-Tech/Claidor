/**
 * The client that takes the caller's context into every call it makes: a span around the call, the trace in the
 * headers, the context's cancel signal, and the context itself handed on to the transport.
 *
 * Nothing here goes over a network. The transport is a stand-in that writes down what it is given and answers
 * from a script; the tracer is a stand-in whose spans write down what is done to them. Both write to one log,
 * so the order of everything the part does is kept.
 */
import { trace } from "@opentelemetry/api";

export const part = "packages/context-rpc";
export const modules = {
  rpc: "source/packages/context-rpc/index.ts",
  // Not this part's code: the contexts the part is given are real ones, made by the package it is built on.
  context: "source/packages/context/core.ts",
};

/** The kinds of method the client library knows, by their numbers on a service. */
const UNARY = 0;
const SERVER_STREAM = 1;
const CLIENT_STREAM = 2;
const BOTH_WAYS = 3;

/** A made-up service: one method of each kind, and one of a kind the client library does not know. */
const DESK = {
  typeName: "recorded.v1.Desk",
  methods: {
    ask: { name: "Ask", kind: UNARY },
    watch: { name: "Watch", kind: SERVER_STREAM },
    send: { name: "Send", kind: CLIENT_STREAM },
    talk: { name: "Talk", kind: BOTH_WAYS },
    odd: { name: "Odd", kind: 7 },
  },
};

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

/** Whether `from` is `context` or one of the contexts it was made from. */
function comesFrom(context, from) {
  for (let at = context; at !== undefined; at = at.getParent()) if (at === from) return true;
  return false;
}

/**
 * One case's surroundings: the log, a real context, a tracer and a transport that write to the log, and the
 * client under test. What the transport answers is set by the case (`answers.unary`, `answers.stream`).
 */
function makeDesk({ rpc, context }) {
  const log = [];
  const desk = {
    log,
    /** The context the case passes to the client. */
    ctx: context.createContext().withName("turn"),
    /** What a span says of itself, by its number; null for a span with no `spanContext` at all. */
    spanContext: (number) => ({ traceId: TRACE_ID, spanId: `b7ad6b716920333${number}`, traceFlags: 1 }),
    /** Span methods that fail: for a method's name, the errors to throw, one per call (undefined: not that time). */
    spanFails: {},
    answers: {
      unary: async () => ({ header: new Headers(), trailer: new Headers(), message: { said: "yes" } }),
      stream: async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(log, "the stream", []) }),
    },
    /** What the transport was given, call by call, as the things themselves. */
    calls: [],
    /** The contexts the caller's own headers function was given. */
    headerContexts: [],
    callersSignal: undefined,
    callersValues: undefined,
  };

  let spanCount = 0;
  const spanLabels = new Map();
  const startSpan = (tracer, name, options, parent) => {
    spanCount += 1;
    const number = spanCount;
    const label = `span ${number}`;
    const did = (method, ...given) => {
      log.push([label, method, ...given]);
      const failure = desk.spanFails[method]?.shift();
      if (failure !== undefined) throw failure;
    };
    const span = {
      setAttribute: (key, value) => { did("setAttribute", key, value); return span; },
      recordException: (error) => did("recordException", error),
      setStatus: (status) => { did("setStatus", status); return span; },
      end: (...given) => did("end", ...given),
    };
    if (desk.spanContext !== null) span.spanContext = () => { did("spanContext"); return desk.spanContext(number); };
    spanLabels.set(span, label);
    log.push([`tracer ${tracer}`, "startSpan", { name, options, under: parent === undefined ? null : spanLabels.get(trace.getSpan(parent)) ?? "a span not made here" }]);
    return span;
  };
  desk.tracing = { getTracer: (name) => ({ startSpan: (spanName, options, parent) => startSpan(name, spanName, options, parent) }) };

  desk.whichSignal = (signal) => {
    if (signal === undefined) return "none";
    const which = signal === desk.ctx.signal ? "the context's own" : signal === desk.callersSignal ? "the caller's own" : "a third one";
    return signal.aborted ? [which, "aborted", signal.reason] : which;
  };
  desk.whatValues = (values) => {
    if (values === undefined || values === null) return values;
    return {
      theCallersOwn: values === desk.callersValues,
      holds: Object.getOwnPropertySymbols(values).map((symbol) => [symbol.description, desk.whatHeld(values[symbol])]),
    };
  };
  desk.whatHeld = (value) => {
    if (typeof value?.getPath !== "function") return value;
    return {
      context: value.getPath(),
      madeFromTheCallers: comesFrom(value, desk.ctx),
      ...(desk.headerContexts.length === 0 ? {} : { theOneTheHeadersFunctionGot: value === desk.headerContexts.at(-1) }),
    };
  };
  const given = (service, method, signal, timeoutMs, header, contextValues) => ({
    service: service.typeName,
    method: method.name,
    localName: method.localName,
    signal: desk.whichSignal(signal),
    timeoutMs,
    header: header instanceof Headers ? [...header] : { notHeaders: header },
    contextValues: desk.whatValues(contextValues),
  });
  desk.transport = {
    unary(service, method, signal, timeoutMs, header, input, contextValues) {
      const call = { signal, header, input, contextValues };
      desk.calls.push(call);
      log.push(["transport", "unary", { ...given(service, method, signal, timeoutMs, header, contextValues), input }]);
      return desk.answers.unary(call);
    },
    stream(service, method, signal, timeoutMs, header, input, contextValues) {
      const call = { signal, header, input, contextValues };
      desk.calls.push(call);
      log.push(["transport", "stream", given(service, method, signal, timeoutMs, header, contextValues)]);
      return desk.answers.stream(call);
    },
  };

  /** The client under test, with the part's options (none at all when left out). */
  desk.client = (options) => (options === undefined ? rpc.createContextPropagatingClient(DESK, desk.transport) : rpc.createContextPropagatingClient(DESK, desk.transport, options));
  /** A headers function for the part's options that keeps the context it is given. */
  desk.headersFrom = (make) => (ctx) => { desk.headerContexts.push(ctx); log.push(["the headers function", "asked", { context: ctx.getPath() }]); return make(ctx); };

  /** Listening to a signal, and no longer listening, written to the log; each listener is named by when it first came. */
  const listeners = [];
  desk.watch = (signal, label) => {
    for (const method of ["addEventListener", "removeEventListener"]) {
      signal[method] = (type, listener, options) => {
        if (!listeners.includes(listener)) listeners.push(listener);
        log.push([label, method, type, `listener ${listeners.indexOf(listener) + 1}`, ...(options === undefined ? [] : [options])]);
        return AbortSignal.prototype[method].call(signal, type, listener, options);
      };
    }
    return signal;
  };
  return desk;
}

/** A case at a desk: the tracer is set for the time of the case, and the log comes back with what the case answers. */
const atDesk = (body, { tracer = true } = {}) => async (modules) => {
  const desk = makeDesk(modules);
  if (tracer) trace.setGlobalTracerProvider(desk.tracing);
  try {
    const outcome = await body(desk, modules);
    return { outcome, log: desk.log };
  } finally {
    if (tracer) trace.disable();
  }
};

/** What a piece of work came to: what it answered, or what it threw. */
async function outcomeOf(work) {
  try {
    return { answered: await work() };
  } catch (error) {
    return { threw: error };
  }
}

/** The same, for work that must fail before it ever hands back a promise. */
function atOnce(work) {
  try {
    const answered = work();
    return { answeredAtOnce: answered instanceof Promise ? "a promise" : answered };
  } catch (error) {
    return { threwAtOnce: error };
  }
}

/**
 * A stream that follows a script: each step is `{ value }` or `{ error }`, and after the last it is done. Its
 * iterator writes each call to the log, and can be made without `return` or `throw`.
 */
function scripted(log, label, steps, { canReturn = true, canThrow = true } = {}) {
  let at = 0;
  const iterator = {
    async next() {
      const step = steps[at];
      at += 1;
      log.push([label, "next"]);
      if (step === undefined) return { done: true, value: undefined };
      if ("error" in step) throw step.error;
      return { done: false, value: step.value };
    },
  };
  if (canReturn) iterator.return = async (value) => { log.push([label, "return", value]); return { done: true, value: `the stream's answer to return(${String(value)})` }; };
  if (canThrow) iterator.throw = async (error) => { log.push([label, "throw", error]); return { done: true, value: "the stream's answer to throw" }; };
  return { [Symbol.asyncIterator]: () => iterator };
}

/** Every item of a stream, and how the reading ended. */
async function readAll(stream) {
  const items = [];
  try {
    for await (const item of stream) items.push(item);
    return { items, ended: "done" };
  } catch (error) {
    return { items, ended: "failed", threw: error };
  }
}

/** An error of the runtime's own: its class is kept, its sentence is not (it differs from one Node to the next). */
const runtimeError = (error) => ({ aRuntimeError: error?.constructor?.name ?? typeof error });
/** The log with the runtime's errors and their sentences taken out, for a case where the runtime itself throws. */
function withoutRuntimeSentences(log, thrown) {
  const clean = (value) => {
    if (value === thrown) return { theErrorThrown: runtimeError(value).aRuntimeError };
    if (value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.message === "string" && thrown instanceof Error && value.message === thrown.message) return { ...value, message: "the thrown error's own sentence" };
    return Array.isArray(value) ? value.map(clean) : value;
  };
  return log.map(clean);
}

/** A promise settled from outside. */
function later() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const SHAPE = [
  {
    name: "the client holds the service's methods under their local names; one of an unknown kind is left out; each reading gives a new function",
    run: atDesk((desk) => {
      const client = desk.client();
      return {
        keys: Object.keys(client),
        has: ["ask", "watch", "send", "talk", "odd", "toString"].map((name) => [name, name in client, typeof client[name]]),
        notThere: [client.odd, client.nothing, client[Symbol.asyncIterator], client.then],
        aNewFunctionEachTime: client.ask !== client.ask,
        parametersWithoutDefaults: client.ask.length,
        functionName: client.ask.name,
        cannotBeMadeWithNew: (() => { try { new client.ask(); return false; } catch { return true; } })(),
        anOrdinaryObjectBehind: Object.getPrototypeOf(client) === Object.prototype,
        aNoteLeftOnIt: ((client.note = "kept"), [client.note, Object.keys(client)]),
        aMethodTakenOff: (delete client.talk, [typeof client.talk, Object.keys(client)]),
      };
    }),
  },
  {
    name: "what the client object inherits is wrapped like a method: toString and hasOwnProperty answer at once, through a span of their own",
    run: atDesk((desk) => {
      const client = desk.client();
      return [client.toString(desk.ctx), client.hasOwnProperty(desk.ctx, "ask"), client.hasOwnProperty(desk.ctx, "odd")];
    }),
  },
  {
    name: "valueOf hands back the bare client, whose calls go out with nothing added",
    run: atDesk(async (desk) => {
      const client = desk.client();
      const bare = client.valueOf(desk.ctx);
      return { notTheWrappedOne: bare !== client, keys: Object.keys(bare), answer: await bare.ask({ question: "bare" }, { timeoutMs: 3 }) };
    }),
  },
  {
    name: "a symbol that names a function on the client is spelled out in the span's name",
    run: atDesk((desk) => {
      const client = desk.client();
      const mark = Symbol("recorded.mark");
      const bare = client.valueOf(desk.ctx);
      bare[mark] = function (input) { return `marked ${input}`; };
      return client[mark](desk.ctx, "this");
    }),
  },
];

/** A function put on the client object, so that what the part hands a method is seen as it is. */
function probeOn(client, desk) {
  const bare = client.valueOf(desk.ctx);
  desk.log.length = 0;
  client.probe = function (input, options) {
    return {
      calledOnTheBareClient: this === bare,
      argumentCount: arguments.length,
      input,
      optionKeys: Reflect.ownKeys(options).map(String),
      headers: [...options.headers],
      signal: desk.whichSignal(options.signal),
      contextValues: desk.whatValues(options.contextValues),
      timeoutMs: options.timeoutMs,
    };
  };
  return client;
}

const WHAT_A_METHOD_GETS = [
  {
    name: "a method is called on the bare client with two things: the input, and options that are a new object, always with headers, signal and context values",
    run: atDesk((desk) => {
      const client = probeOn(desk.client(), desk);
      return [client.probe(desk.ctx), client.probe(desk.ctx, "the input"), client.probe(desk.ctx, "the input", {}, "a fourth thing")];
    }),
  },
  {
    name: "the options keep the caller's keys in the caller's order, the three the part sets taking the place of the caller's or coming last",
    run: atDesk((desk) => {
      const client = probeOn(desk.client({ enableAbortSignal: true }), desk);
      const mark = Symbol("recorded.option");
      const caller = new AbortController();
      desk.callersSignal = caller.signal;
      desk.callersValues = { set(key, value) { this[key.id] = value; return this; } };
      const options = { contextValues: desk.callersValues, timeoutMs: 40, signal: caller.signal, onTrailer: () => {}, [mark]: "kept", headers: { "x-caller": "1" }, anythingElse: true };
      const got = client.probe(desk.ctx, "the input", options);
      return { got, theCallersOptionsUntouched: Reflect.ownKeys(options).map(String), stillTheCallersHeaders: Object.keys(options.headers), stillTheCallersSignal: options.signal === caller.signal };
    }),
  },
  {
    name: "options the caller only inherits: the headers, the signal and the context values are read all the same, and the rest (a timeout) is not passed on",
    run: atDesk((desk) => {
      const client = probeOn(desk.client(), desk);
      const caller = new AbortController();
      desk.callersSignal = caller.signal;
      const inherited = Object.create({ timeoutMs: 40, headers: { "x-inherited": "1" }, signal: caller.signal });
      const hidden = Object.defineProperty({}, "timeoutMs", { value: 40, enumerable: false });
      return [client.probe(desk.ctx, 1, inherited), client.probe(desk.ctx, 2, hidden)];
    }),
  },
];

const UNARY_CALLS = [
  {
    name: "a unary call: a client span named for the method, the trace in two headers, the context handed to the transport, the span closed OK on the answer",
    run: atDesk(async (desk) => {
      const message = { said: "yes" };
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message });
      const answer = await desk.client().ask(desk.ctx, { question: "one" });
      return { theTransportsOwnMessage: answer === message, answer };
    }),
  },
  {
    name: "with no tracer set up, the trace headers carry a trace of zeros",
    run: atDesk(async (desk) => desk.client().ask(desk.ctx, { question: "untraced" }), { tracer: false }),
  },
  {
    name: "the call's own options pass through: the timeout, and the callbacks for the answer's header and trailer",
    run: atDesk(async (desk) => {
      desk.answers.unary = async () => ({ header: new Headers({ "x-desk": "open" }), trailer: new Headers({ "x-desk": "closed" }), message: "done" });
      return desk.client().ask(desk.ctx, { question: "timed" }, {
        timeoutMs: 250,
        onHeader: (header) => desk.log.push(["the caller", "onHeader", [...header]]),
        onTrailer: (trailer) => desk.log.push(["the caller", "onTrailer", [...trailer]]),
      });
    }),
  },
  {
    name: "options left out, undefined or empty make the same call",
    run: atDesk(async (desk) => {
      const client = desk.client();
      desk.spanContext = () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1 });
      await client.ask(desk.ctx, 1);
      await client.ask(desk.ctx, 1, undefined);
      await client.ask(desk.ctx, 1, {});
      const sent = desk.log.filter(([who]) => who === "transport").map(([, , call]) => JSON.stringify(call));
      return { calls: sent.length, allTheSame: new Set(sent).size === 1 };
    }),
  },
  {
    name: "null for options: the runtime's error comes out at once, recorded on the span",
    run: async (modules) => {
      let thrown;
      const { outcome, log } = await atDesk((desk) => {
        const result = atOnce(() => desk.client().ask(desk.ctx, 1, null));
        thrown = result.threwAtOnce;
        return { threwAtOnce: runtimeError(thrown) };
      })(modules);
      return { outcome, log: withoutRuntimeSentences(log, thrown) };
    },
  },
  {
    name: "no context: the runtime's error comes out before any span is started",
    run: atDesk((desk) => {
      const result = atOnce(() => desk.client().ask(undefined, 1));
      return { threwAtOnce: runtimeError(result.threwAtOnce) };
    }),
  },
  {
    name: "the caller's options are read in a fixed order: the headers, the signal, the context values, then all of them together",
    run: atDesk(async (desk) => {
      const reads = [];
      const options = new Proxy({ timeoutMs: 9, headers: { "x-caller": "1" }, onHeader: undefined }, {
        get(target, name) { reads.push(["get", String(name)]); return target[name]; },
        has(target, name) { reads.push(["has", String(name)]); return name in target; },
        ownKeys(target) { reads.push(["ownKeys"]); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, name) { reads.push(["describe", String(name)]); return Reflect.getOwnPropertyDescriptor(target, name); },
      });
      await desk.client().ask(desk.ctx, 1, options);
      const first = [...reads];
      reads.length = 0;
      await desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1, options);
      return { asItIs: first, withTheContextsSignal: reads };
    }),
  },
  {
    name: "the part's own options: trace headers and the headers function are read once, when the client is made; whether to use the context's signal is read again at every call",
    run: atDesk(async (desk) => {
      const reads = [];
      const own = { injectTraceHeaders: false, extractHeaders: undefined, enableAbortSignal: false };
      const client = desk.client(new Proxy(own, { get(target, name) { reads.push(String(name)); return target[name]; } }));
      const whenMade = [...reads];
      reads.length = 0;
      await client.ask(desk.ctx, 1);
      own.injectTraceHeaders = true;
      own.extractHeaders = () => ({ "x-late": "yes" });
      own.enableAbortSignal = true;
      await client.ask(desk.ctx, 2);
      return { whenMade, atTheTwoCalls: reads, sent: desk.calls.map((call) => ({ header: [...call.header], signal: desk.whichSignal(call.signal) })) };
    }),
  },
  {
    name: "null for the part's own options: the runtime's error when the client is made",
    run: atDesk((desk) => {
      const result = atOnce(() => desk.client(null));
      return { threwAtOnce: runtimeError(result.threwAtOnce) };
    }),
  },
  {
    name: "a call made with the context of another call starts its span under that call's span",
    run: atDesk(async (desk) => {
      const client = desk.client();
      await client.ask(desk.ctx, "outer");
      const inner = desk.calls[0].contextValues;
      const held = inner[Object.getOwnPropertySymbols(inner)[0]];
      await client.watch(held, "inner");
      return { secondCallHolds: desk.whatValues(desk.calls[1].contextValues) };
    }),
  },
];

/** What a span may say of itself, and so what trace headers go out. */
const SPAN_CONTEXTS = [
  ["flags of 1", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1 })],
  ["flags of 0", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 0 })],
  ["no flags: 00", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331" })],
  ["flags of null: 00", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: null })],
  ["flags of 15: 0f", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 15 })],
  ["flags of 16: 10", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 16 })],
  ["flags of 255: ff", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 255 })],
  ["flags of 256: three digits", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 256 })],
  ["flags of one and a half: written in sixteens as they are", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1.5 })],
  ["flags below zero: the sign stays", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: -1 })],
  ["flags given as words: used as they are", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: "7" })],
  ["ids that are not text: made text", () => ({ traceId: 12, spanId: 34, traceFlags: 1 })],
  ["a trace state that can write itself", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: { serialize: () => "vendor=one,other=two", toString: () => "not this" } })],
  ["a trace state that cannot: it is turned to text", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: { serialize: "not a function", toString: () => "vendor=text" } })],
  ["a trace state that is already text", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: "vendor=plain" })],
  ["an empty trace state: no third header", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: "" })],
  ["no trace id: no headers", () => ({ traceId: "", spanId: "b7ad6b7169203331", traceFlags: 1 })],
  ["no span id: no headers", () => ({ traceId: TRACE_ID, spanId: "", traceFlags: 1 })],
  ["nothing at all: no headers", () => undefined],
  ["null: no headers", () => null],
  ["a span that cannot say: no headers", null],
  ["a span that fails to say: no headers, and the call goes on", () => { throw new Error("no trace today"); }],
  ["a trace state that fails to write itself: the two headers already made stay", () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: { serialize: () => { throw new Error("no state today"); } } })],
];

const TRACE_HEADERS = [
  ...SPAN_CONTEXTS.map(([name, spanContext]) => ({
    name: `trace headers, the span saying of itself: ${name}`,
    run: atDesk(async (desk) => {
      desk.spanContext = spanContext;
      const answer = await desk.client().ask(desk.ctx, 1);
      return { answer, header: [...desk.calls[0].header] };
    }),
  })),
  {
    name: "trace headers turned off: the span is not asked about itself and no header is added",
    run: atDesk(async (desk) => {
      await desk.client({ injectTraceHeaders: false }).ask(desk.ctx, 1, { headers: { "x-caller": "kept" } });
      return [...desk.calls[0].header];
    }),
  },
  {
    name: "trace headers are on when the setting is left out or true, and off for false, zero, null and empty words",
    run: atDesk(async (desk) => {
      const sent = [];
      for (const injectTraceHeaders of [undefined, true, false, 0, null, ""]) {
        await desk.client({ injectTraceHeaders }).ask(desk.ctx, 1);
        sent.push([String(injectTraceHeaders), desk.calls.at(-1).header.has("traceparent")]);
      }
      return sent;
    }),
  },
];

/** Whose header wins: the caller's own, the trace's, the headers function's. Each row: the part's options, the call's headers. */
const HEADER_ROWS = [
  ["the caller's headers as a plain object, names made lower case", {}, () => ({ "X-Caller": "one", Accept: "text/plain" })],
  ["the caller's headers as Headers", {}, () => new Headers([["x-caller", "one"], ["x-twice", "a"], ["x-twice", "b"]])],
  ["the caller's headers as a list of pairs: taken as an object, so each pair lands under its place in the list", {}, () => [["x-caller", "one"], ["x-other", "two"]]],
  ["a value that is not text is made text", {}, () => ({ "x-count": 5, "x-none": null, "x-list": ["a", "b"] })],
  ["the trace's header wins over the caller's of the same name", {}, () => ({ TraceParent: "the caller's", "x-caller": "kept" })],
  ["the headers function's header wins over the trace's and the caller's", { extract: () => ({ traceparent: "the function's", "x-caller": "the function's", "x-added": "yes" }) }, () => ({ "x-caller": "the caller's" })],
  ["the headers function answering Headers", { extract: () => new Headers({ "x-added": "as headers" }) }, () => undefined],
  ["the headers function answering nothing: only the trace's", { extract: () => undefined }, () => undefined],
  ["the headers function answering null", { extract: () => null }, () => undefined],
  ["the headers function answering an empty object", { extract: () => ({}) }, () => undefined],
  ["no trace headers and a headers function: only its own", { inject: false, extract: () => ({ "x-added": "alone" }) }, () => ({ "x-caller": "kept" })],
  ["no trace headers and a headers function answering nothing: only the caller's", { inject: false, extract: () => undefined }, () => ({ "x-caller": "kept" })],
  ["no headers from anyone: empty Headers all the same", { inject: false }, () => undefined],
  ["cookies set twice by the caller: the last one stays", {}, () => new Headers([["set-cookie", "a=1"], ["set-cookie", "b=2"]])],
  ["the caller's headers as words: each letter lands under its place", { inject: false }, () => "ab"],
  ["the caller's headers as a number: nothing", { inject: false }, () => 5],
  ["the caller's headers as null, zero or empty words: nothing", { inject: false, extract: () => 0 }, () => null],
  ["the headers function answering words: each letter lands under its place", { inject: false, extract: () => "ok" }, () => undefined],
];

const HEADERS = [
  ...HEADER_ROWS.map(([name, { inject, extract }, callers]) => ({
    name: `headers: ${name}`,
    run: atDesk(async (desk) => {
      const options = { ...(inject === undefined ? {} : { injectTraceHeaders: inject }), ...(extract === undefined ? {} : { extractHeaders: desk.headersFrom(extract) }) };
      const headers = callers();
      await desk.client(options).ask(desk.ctx, 1, headers === undefined ? {} : { headers });
      const sent = desk.calls[0].header;
      return { areHeaders: sent instanceof Headers, notTheCallersOwn: sent !== headers, sent: [...sent] };
    }),
  })),
  {
    name: "the headers function is given the span's context, and reads what the caller's context carries",
    run: atDesk(async (desk, { context }) => {
      const tenant = context.createKey(Symbol("recorded.tenant"), "nobody");
      desk.ctx = desk.ctx.with(tenant, "acme");
      await desk.client({ extractHeaders: desk.headersFrom((ctx) => ({ "x-tenant": ctx.get(tenant) })) }).ask(desk.ctx, 1);
      return [...desk.calls[0].header];
    }),
  },
  {
    name: "a header name that cannot be one: the runtime's error comes out at once, recorded on the span",
    run: async (modules) => {
      let thrown;
      const { outcome, log } = await atDesk((desk) => {
        const result = atOnce(() => desk.client().ask(desk.ctx, 1, { headers: { "not a name": "x" } }));
        thrown = result.threwAtOnce;
        return { threwAtOnce: runtimeError(thrown), transportCalled: desk.calls.length };
      })(modules);
      return { outcome, log: withoutRuntimeSentences(log, thrown) };
    },
  },
  {
    name: "the headers function failing: its error comes out at once, recorded on the span, and nothing is sent",
    run: atDesk((desk) => {
      const failure = new Error("no headers today");
      const result = atOnce(() => desk.client({ extractHeaders: desk.headersFrom(() => { throw failure; }) }).ask(desk.ctx, 1));
      return { theSameError: result.threwAtOnce === failure, transportCalled: desk.calls.length };
    }),
  },
  {
    name: "the headers function throwing what is not an error: it comes out as it is, and the span is told \"RPC call failed\"",
    run: atDesk((desk) => atOnce(() => desk.client({ extractHeaders: () => { throw "just words"; } }).ask(desk.ctx, 1))),
  },
];

const CONTEXT_VALUES = [
  {
    name: "the caller's own context values are used and kept, with the context added under the part's key",
    run: atDesk(async (desk) => {
      const mine = Symbol("recorded.mine");
      desk.callersValues = { [mine]: "kept", set(key, value) { this[key.id] = value; return this; } };
      await desk.client().ask(desk.ctx, 1, { contextValues: desk.callersValues });
      return { whatTheTransportGot: desk.whatValues(desk.calls[0].contextValues) };
    }),
  },
  {
    name: "what the context values answer to set() is what goes out",
    run: atDesk(async (desk) => {
      const other = { other: true };
      const sets = [];
      desk.callersValues = { set(key, value) { sets.push({ key: key.id.description, default: key.defaultValue, aContext: typeof value.getPath === "function" }); return other; } };
      await desk.client().ask(desk.ctx, 1, { contextValues: desk.callersValues });
      return { sets, theTransportGotTheAnswer: desk.calls[0].contextValues === other };
    }),
  },
  {
    name: "the context values failing to set: the error comes out at once, recorded on the span, and nothing is sent",
    run: atDesk((desk) => {
      const failure = new RangeError("no room");
      const result = atOnce(() => desk.client().ask(desk.ctx, 1, { contextValues: { set() { throw failure; } } }));
      return { theSameError: result.threwAtOnce === failure, transportCalled: desk.calls.length };
    }),
  },
  {
    name: "the part's key is one and the same for every call and every client",
    run: atDesk(async (desk) => {
      await desk.client().ask(desk.ctx, 1);
      await desk.client({ injectTraceHeaders: false }).watch(desk.ctx, 2);
      const keys = desk.calls.map((call) => Object.getOwnPropertySymbols(call.contextValues));
      return { each: keys.map((list) => list.map((key) => key.description)), theSameKey: keys[0][0] === keys[1][0], separateValues: desk.calls[0].contextValues !== desk.calls[1].contextValues };
    }),
  },
];

/** A unary call that fails: what the transport threw, by name. */
const FAILURES = [
  ["an error", () => new Error("the desk is closed")],
  ["an error of another class, with fields of its own", () => Object.assign(new TypeError("[unavailable] no route"), { code: 14, rawMessage: "no route" })],
  ["an error with no message", () => new Error("")],
  ["words", () => "just words"],
  ["a number", () => 503],
  ["zero", () => 0],
  ["nothing", () => undefined],
  ["null", () => null],
  ["an object that is not an error", () => ({ message: "looks like one", code: 2 })],
];

const UNARY_FAILURES = [
  ...FAILURES.map(([name, make]) => ({
    name: `a unary call failing with ${name}: the same thing comes out, and the span records it and closes`,
    run: atDesk(async (desk) => {
      const failure = make();
      desk.answers.unary = async () => { throw failure; };
      const result = await outcomeOf(() => desk.client().ask(desk.ctx, 1));
      return { theSameThing: "threw" in result && Object.is(result.threw, failure), threw: result.threw };
    }),
  })),
  {
    name: "the span failing to close after a good answer: the caller gets the span's error, and the span is told of it and closed again",
    run: atDesk(async (desk) => {
      const failure = new Error("the span would not close");
      desk.spanFails.end = [failure];
      const result = await outcomeOf(() => desk.client().ask(desk.ctx, 1));
      return { theSpansError: result.threw === failure };
    }),
  },
  {
    name: "the span failing to take its status after a good answer: the same, and it is closed once",
    run: atDesk(async (desk) => {
      const failure = new Error("no status today");
      desk.spanFails.setStatus = [failure];
      const result = await outcomeOf(() => desk.client().ask(desk.ctx, 1));
      return { theSpansError: result.threw === failure };
    }),
  },
  {
    name: "the span failing to close after an answer given at once: the error comes out at once, the span told of it and closed again",
    run: atDesk((desk) => {
      const failure = new Error("the span would not close");
      desk.spanFails.end = [failure];
      const result = atOnce(() => desk.client().toString(desk.ctx));
      return { theSpansError: result.threwAtOnce === failure };
    }),
  },
  {
    name: "the span failing while a failure is recorded: the span's error comes out in place of the call's, and the span is not closed",
    run: atDesk(async (desk) => {
      const failure = new Error("nothing can be recorded");
      desk.spanFails.recordException = [failure];
      desk.answers.unary = async () => { throw new Error("the desk is closed"); };
      const result = await outcomeOf(() => desk.client().ask(desk.ctx, 1));
      return { theSpansError: result.threw === failure };
    }),
  },
];

/** Answers that are not what a transport gives, reached through the function every object has that hands an object back as it is. */
const ODD_ANSWERS = [
  {
    name: "an answer given at once that is an object, a thing with a then that is no function, or nothing: handed back as it is, the span closed OK",
    run: atDesk((desk) => {
      const client = desk.client();
      const object = { plain: true };
      const notThenable = { then: "soon" };
      return {
        theObjectItself: client.constructor(desk.ctx, object) === object,
        theThingItself: client.constructor(desk.ctx, notThenable) === notThenable,
        nothing: client.__lookupGetter__(desk.ctx, "ask"),
      };
    }),
  },
  {
    name: "an answer given at once that can be awaited but is no promise: its then is called, and what then hands back must have a catch",
    run: async (modules) => {
      let thrown;
      const { outcome, log } = await atDesk(async (desk) => {
        const client = desk.client();
        const settled = { then(onDone) { desk.log.push(["the answer", "then"]); return Promise.resolve("through then").then(onDone); } };
        const good = await client.constructor(desk.ctx, settled);
        const bare = { then() { desk.log.push(["the other answer", "then"]); return undefined; } };
        const result = atOnce(() => client.constructor(desk.ctx, bare));
        thrown = result.threwAtOnce;
        return { good, threwAtOnce: runtimeError(thrown) };
      })(modules);
      return { outcome, log: withoutRuntimeSentences(log, thrown) };
    },
  },
  {
    name: "an answer given at once that is a stream with return and throw of its own: wrapped, and both reach it",
    run: atDesk(async (desk) => {
      const client = desk.client();
      const source = scripted(desk.log, "the stream", [{ value: "a" }, { value: "b" }]);
      const first = client.constructor(desk.ctx, source);
      const reader = first[Symbol.asyncIterator]();
      const read = [await reader.next(), await reader.return("enough"), await reader.next()];
      const second = client.constructor(desk.ctx, scripted(desk.log, "the second stream", [{ value: "c" }]));
      const failure = new Error("the reader gave up");
      const thrown = await second[Symbol.asyncIterator]().throw(failure);
      return { notTheStreamItself: first !== source, keys: Reflect.ownKeys(first).map(String), read, thrown };
    }),
  },
];

/** A stand-in context that keeps nothing it is given: a span put on it is not found again. */
function forgetful(log) {
  const ctx = {
    name: "forgetful",
    signal: new AbortController().signal,
    get: (key) => key.defaultValue,
    with: () => ctx,
    withName: (name) => { log.push(["the context", "withName", name]); return ctx; },
    getParent: () => undefined,
    getPath: () => ["forgetful"],
  };
  return ctx;
}

/** Something thrown that fails when it is turned into words. */
const wordless = () => ({ toString() { throw new RangeError("no words for this"); } });

const WITHOUT_A_SPAN = [
  {
    name: "a context that keeps nothing: calls and streams go out and come back all the same, and the span that was started is told nothing",
    run: atDesk(async (desk) => {
      desk.ctx = forgetful(desk.log);
      const client = desk.client({ enableAbortSignal: true, extractHeaders: desk.headersFrom(() => ({ "x-added": "yes" })) });
      const good = await client.ask(desk.ctx, 1);
      desk.answers.unary = async () => { throw "just words"; };
      const bad = await outcomeOf(() => client.ask(desk.ctx, 2));
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }, { error: new Error("the line dropped") }]) });
      const stream = await readAll(client.watch(desk.ctx, 3));
      return { good, bad, stream, atOnce: client.toString(desk.ctx) };
    }),
  },
  {
    name: "a thrown thing that cannot be made into words: with a span, that failure comes out in place of it and the span is left open; with none, the thing itself comes out",
    run: atDesk(async (desk) => {
      const thing = wordless();
      desk.answers.unary = async () => { throw thing; };
      const withASpan = await outcomeOf(() => desk.client().ask(desk.ctx, 1));
      const atOnceWithASpan = atOnce(() => desk.client({ extractHeaders: () => { throw thing; } }).ask(desk.ctx, 2));
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ error: thing }]) });
      const streamWithASpan = await readAll(desk.client().watch(desk.ctx, 3));
      desk.log.push(["the caller", "goes on with a context that keeps nothing"]);
      desk.ctx = forgetful(desk.log);
      const withNone = await outcomeOf(() => desk.client().ask(desk.ctx, 4));
      const streamWithNone = await readAll(desk.client().watch(desk.ctx, 5));
      return {
        withASpan: withASpan.threw,
        atOnceWithASpan: atOnceWithASpan.threwAtOnce,
        streamWithASpan: streamWithASpan.threw,
        withNone: withNone.threw === thing,
        streamWithNone: streamWithNone.threw === thing,
      };
    }),
  },
];

const STREAMS = [
  {
    name: "a thing that only says it is a stream: wrapped all the same, and reading it is the runtime's error, the span left open",
    run: atDesk((desk) => {
      const client = desk.client();
      const wrapped = client.constructor(desk.ctx, { [Symbol.asyncIterator]: "not a function" });
      const result = atOnce(() => wrapped[Symbol.asyncIterator]());
      return { keys: Reflect.ownKeys(wrapped).map(String), threwAtOnce: runtimeError(result.threwAtOnce) };
    }),
  },
  {
    name: "a stream whose return is there but is no function: the span closes OK, then the runtime's error comes out",
    run: atDesk(async (desk) => {
      const client = desk.client();
      const reader = client.constructor(desk.ctx, { [Symbol.asyncIterator]: () => ({ next: "no", return: "no", throw: "no" }) })[Symbol.asyncIterator]();
      const returned = await outcomeOf(() => reader.return());
      const next = await outcomeOf(() => reader.next());
      return { returned: runtimeError(returned.threw), next: runtimeError(next.threw) };
    }),
  },
  {
    name: "a server stream: the one message goes out as a stream of one, the span stays open until the last item is read, then closes OK",
    run: atDesk(async (desk) => {
      desk.answers.stream = async (call) => {
        const sent = [];
        for await (const message of call.input) sent.push(message);
        desk.log.push(["transport", "was sent", sent]);
        return { header: new Headers({ "x-desk": "open" }), trailer: new Headers({ "x-desk": "closed" }), message: scripted(desk.log, "the stream", [{ value: "a" }, { value: "b" }]) };
      };
      const stream = desk.client().watch(desk.ctx, { topic: "news" }, {
        onHeader: (header) => desk.log.push(["the caller", "onHeader", [...header]]),
        onTrailer: (trailer) => desk.log.push(["the caller", "onTrailer", [...trailer]]),
      });
      desk.log.push(["the caller", "holds the stream", { isPromise: stream instanceof Promise, keys: Reflect.ownKeys(stream).map(String) }]);
      const reader = stream[Symbol.asyncIterator]();
      desk.log.push(["the caller", "holds a reader", Object.keys(reader)]);
      const read = [];
      for (let step = await reader.next(); ; step = await reader.next()) {
        read.push(step);
        desk.log.push(["the caller", "read", step]);
        if (step.done) break;
      }
      return read;
    }),
  },
  {
    name: "a stream nobody reads: the transport is asked, and the span is left open",
    run: atDesk(async (desk) => {
      desk.client().watch(desk.ctx, 1);
      await Promise.resolve();
      return desk.calls.length;
    }),
  },
  {
    name: "a stream cut short by an error: the reader gets the items so far and the same error, the span records it and closes",
    run: atDesk(async (desk) => {
      const failure = new Error("the line dropped");
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }, { error: failure }, { value: "never" }]) });
      const result = await readAll(desk.client().watch(desk.ctx, 1));
      return { items: result.items, ended: result.ended, theSameError: result.threw === failure };
    }),
  },
  {
    name: "a stream cut short by what is not an error: the span is told \"Stream failed\"",
    run: atDesk(async (desk) => {
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ error: "just words" }]) });
      return readAll(desk.client().watch(desk.ctx, 1));
    }),
  },
  {
    name: "a stream cut short by nothing, zero or empty words: the span closes OK as if it had ended well",
    run: atDesk(async (desk) => {
      const results = [];
      for (const failure of [undefined, 0, "", null, false]) {
        desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ error: failure }]) });
        const result = await readAll(desk.client().watch(desk.ctx, 1));
        results.push({ ended: result.ended, theSameThing: Object.is(result.threw, failure) });
      }
      return results;
    }),
  },
  {
    name: "a stream that cannot be opened: the first reading fails with the transport's error, recorded on the span",
    run: atDesk(async (desk) => {
      const failure = new Error("no such desk");
      desk.answers.stream = async () => { throw failure; };
      const result = await readAll(desk.client().watch(desk.ctx, 1));
      return { ended: result.ended, theSameError: result.threw === failure };
    }),
  },
  {
    name: "the transport failing the stream call itself: the error comes out at once, recorded on the span",
    run: atDesk((desk) => {
      const failure = new Error("the transport is gone");
      desk.answers.stream = () => { throw failure; };
      const result = atOnce(() => desk.client().watch(desk.ctx, 1));
      return { theSameError: result.threwAtOnce === failure };
    }),
  },
  {
    name: "a reader who stops early: the span closes OK; the client library's reader has no return, so the transport's stream is not told",
    run: atDesk(async (desk) => {
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }, { value: "b" }, { value: "c" }]) });
      const items = [];
      for await (const item of desk.client().watch(desk.ctx, 1)) {
        items.push(item);
        if (items.length === 2) break;
      }
      const reader = desk.client().watch(desk.ctx, 2)[Symbol.asyncIterator]();
      return { items, returnOnAFreshReader: await reader.return("given"), thenNext: await reader.next() };
    }),
  },
  {
    name: "throw on a reader of a server stream: the span records the error and the same error comes back out",
    run: atDesk(async (desk) => {
      const failure = new Error("the reader gave up");
      const reader = desk.client().watch(desk.ctx, 1)[Symbol.asyncIterator]();
      const result = await outcomeOf(() => reader.throw(failure));
      const again = await outcomeOf(() => reader.throw(new Error("a second time")));
      return { theSameError: result.threw === failure, again: again.threw };
    }),
  },
  {
    name: "throw with nothing on a reader: the span closes OK and nothing comes back out as the failure",
    run: atDesk(async (desk) => outcomeOf(() => desk.client().watch(desk.ctx, 1)[Symbol.asyncIterator]().throw())),
  },
  {
    name: "after a stream has ended, nothing more is told to the span: reading on, returning, throwing",
    run: atDesk(async (desk) => {
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }]) });
      const reader = desk.client().watch(desk.ctx, 1)[Symbol.asyncIterator]();
      const read = [await reader.next(), await reader.next()];
      desk.log.push(["the caller", "goes on after the end"]);
      return { read, more: [await reader.next(), await reader.return("late"), await outcomeOf(() => reader.throw(new Error("late")))] };
    }),
  },
  {
    name: "each reading of the same stream closes the span once more",
    run: atDesk(async (desk) => {
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }]) });
      const stream = desk.client().watch(desk.ctx, 1);
      const first = await readAll(stream);
      desk.log.push(["the caller", "reads the same stream again"]);
      const second = await readAll(stream);
      return { first, second, aNewReaderEachTime: stream[Symbol.asyncIterator]() !== stream[Symbol.asyncIterator]() };
    }),
  },
  {
    name: "a unary answer that is itself a stream: wrapped when it comes, the span left open until it is read to the end",
    run: atDesk(async (desk) => {
      const inner = scripted(desk.log, "the stream", [{ value: "a" }, { value: "b" }]);
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message: inner });
      const stream = await desk.client().ask(desk.ctx, 1);
      desk.log.push(["the caller", "holds the answer", { theStreamItself: stream === inner }]);
      return readAll(stream);
    }),
  },
  {
    name: "a unary answer that is a stream, stopped early and thrown at: return and throw reach the stream and its answers come back",
    run: atDesk(async (desk) => {
      const client = desk.client();
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }, { value: "b" }]) });
      const first = (await client.ask(desk.ctx, 1))[Symbol.asyncIterator]();
      const returned = [await first.next(), await first.return("enough"), await first.return("again")];
      const second = (await client.ask(desk.ctx, 2))[Symbol.asyncIterator]();
      const failure = new Error("the reader gave up");
      const thrown = await second.throw(failure);
      return { returned, thrown };
    }),
  },
  {
    name: "a unary answer that is a stream without return or throw of its own: return answers done, throw gives the error back",
    run: atDesk(async (desk) => {
      const client = desk.client();
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }], { canReturn: false, canThrow: false }) });
      const first = (await client.ask(desk.ctx, 1))[Symbol.asyncIterator]();
      const returned = await first.return("enough");
      const second = (await client.ask(desk.ctx, 2))[Symbol.asyncIterator]();
      const failure = new Error("the reader gave up");
      const result = await outcomeOf(() => second.throw(failure));
      return { returned, theSameError: result.threw === failure };
    }),
  },
  {
    name: "a stream's own return or throw failing: the failure comes out, after the span is closed",
    run: atDesk(async (desk) => {
      const client = desk.client();
      const broken = (label) => ({ [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: label }),
        return: async () => { throw new Error(`${label}: return failed`); },
        throw: async () => { throw new Error(`${label}: throw failed`); },
      }) });
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message: broken("first") });
      const first = (await client.ask(desk.ctx, 1))[Symbol.asyncIterator]();
      const returned = await outcomeOf(() => first.return());
      desk.answers.unary = async () => ({ header: new Headers(), trailer: new Headers(), message: broken("second") });
      const second = (await client.ask(desk.ctx, 2))[Symbol.asyncIterator]();
      const thrown = await outcomeOf(() => second.throw(new Error("the reader gave up")));
      return { returned, thrown };
    }),
  },
  {
    name: "a client stream: the caller's own stream goes to the transport, and the one message that comes back is the answer",
    run: atDesk(async (desk) => {
      const outgoing = scripted(desk.log, "the caller's stream", [{ value: "part one" }, { value: "part two" }]);
      desk.answers.stream = async (call) => {
        desk.log.push(["transport", "holds", { theCallersOwnStream: call.input === outgoing }]);
        return { header: new Headers({ "x-desk": "open" }), trailer: new Headers({ "x-desk": "closed" }), message: scripted(desk.log, "the stream", [{ value: { received: 2 } }]) };
      };
      return desk.client().send(desk.ctx, outgoing, { onHeader: () => desk.log.push(["the caller", "onHeader"]), onTrailer: () => desk.log.push(["the caller", "onTrailer"]) });
    }),
  },
  {
    name: "a client stream answered with no message, or with two: the client library's error, recorded on the span",
    run: async (modules) => {
      // The library's error carries headers and more of its own; its name, sentence and code are what is kept.
      const brief = (value) => (value instanceof Error ? { anError: value.name, message: value.message, code: value.code } : value);
      const { outcome, log } = await atDesk(async (desk) => {
        const client = desk.client();
        const errors = [];
        for (const steps of [[], [{ value: "one" }, { value: "two" }]]) {
          desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", steps) });
          const result = await outcomeOf(() => client.send(desk.ctx, scripted(desk.log, "the caller's stream", [])));
          errors.push(brief(result.threw));
        }
        return errors;
      })(modules);
      return { outcome, log: log.map((entry) => entry.map(brief)) };
    },
  },
  {
    name: "a stream both ways: the caller's stream goes out, the answers come back wrapped, the span closes at the end",
    run: atDesk(async (desk) => {
      const outgoing = scripted(desk.log, "the caller's stream", [{ value: "hello" }]);
      desk.answers.stream = async (call) => {
        desk.log.push(["transport", "holds", { theCallersOwnStream: call.input === outgoing }]);
        return { header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "hello back" }]) };
      };
      return readAll(desk.client().talk(desk.ctx, outgoing));
    }),
  },
];

/** Which signal goes out, by the part's own setting and what the caller passes. */
const SIGNALS = [
  {
    name: "signals, not asked to use the context's: the caller's signal goes out as it is, or none; the context's is never looked at",
    run: atDesk(async (desk) => {
      const [cancelable, cancel] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      desk.watch(desk.ctx.signal, "the context's signal");
      desk.callersSignal = desk.watch(new AbortController().signal, "the caller's signal");
      cancel(new Error("the turn was stopped"));
      for (const options of [undefined, {}, { enableAbortSignal: false }, { enableAbortSignal: "yes" }, { enableAbortSignal: 1 }]) {
        await desk.client(options).ask(desk.ctx, "no signal");
        await desk.client(options).ask(desk.ctx, "a signal", { signal: desk.callersSignal });
      }
      return desk.log.filter(([who]) => who === "transport").map(([, , call]) => [call.input, call.signal]);
    }),
  },
  {
    name: "signals, asked to use the context's, the caller passing none: the context's own signal goes out and nobody listens to it",
    run: atDesk(async (desk) => {
      const [cancelable] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      desk.watch(desk.ctx.signal, "the context's signal");
      await desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1);
      return desk.calls[0].signal === desk.ctx.signal;
    }),
  },
  {
    name: "a call cancelled through its context: the transport, holding the context's own signal, fails the call with the reason, and the span records it",
    run: atDesk(async (desk) => {
      const [cancelable, cancel] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      // A transport that, like a real one, fails the call when its signal fires, with the signal's reason.
      desk.answers.unary = (call) => new Promise((resolve, reject) => {
        call.signal.addEventListener("abort", () => reject(call.signal.reason), { once: true });
        queueMicrotask(() => cancel(new Error("the turn was stopped")));
      });
      const result = await outcomeOf(() => desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1));
      return { threw: result.threw, theContextsReason: result.threw === desk.ctx.signal.reason, theTransportsSignal: desk.whichSignal(desk.calls[0].signal) };
    }),
  },
  {
    name: "signals, asked to use the context's, the caller passing that very signal: it goes out as it is",
    run: atDesk(async (desk) => {
      desk.watch(desk.ctx.signal, "the context's signal");
      await desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1, { signal: desk.ctx.signal });
      return desk.calls[0].signal === desk.ctx.signal;
    }),
  },
  {
    name: "signals, both: a third signal goes out that listens to the two, once each, and stops listening when the answer has come",
    run: atDesk(async (desk) => {
      const [cancelable, cancel] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      const caller = new AbortController();
      desk.callersSignal = desk.watch(caller.signal, "the caller's signal");
      desk.watch(desk.ctx.signal, "the context's signal");
      await desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1, { signal: caller.signal });
      const sent = desk.calls[0].signal;
      cancel(new Error("the turn was stopped, too late"));
      caller.abort(new Error("the caller gave up, too late"));
      return { aThirdSignal: sent !== desk.ctx.signal && sent !== caller.signal, stoppedAfterTheAnswer: sent.aborted };
    }),
  },
  ...[
    ["the context is cancelled while the call is out: the call is stopped with the context's reason", { context: "during" }],
    ["the caller's signal fires while the call is out: the call is stopped with the caller's reason", { caller: "during" }],
    ["the context was cancelled before the call: the signal goes out already stopped, with the context's reason", { context: "before" }],
    ["the caller's signal had fired before the call: already stopped, with the caller's reason", { caller: "before" }],
    ["both had fired before the call: the context's reason is the one kept", { context: "before", caller: "before" }],
    ["both fire while the call is out, the caller's first: the first reason is the one kept", { caller: "during", context: "during" }],
  ].map(([name, when]) => ({
    name: `signals, both: ${name}`,
    run: atDesk(async (desk) => {
      const [cancelable, cancel] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      const caller = new AbortController();
      desk.callersSignal = caller.signal;
      const fire = { context: () => cancel(new Error("the turn was stopped")), caller: () => caller.abort(new Error("the caller gave up")) };
      for (const who of Object.keys(when)) if (when[who] === "before") fire[who]();
      // A transport that, like a real one, fails the call when its signal fires, with the signal's reason.
      desk.answers.unary = (call) => new Promise((resolve, reject) => {
        if (call.signal.aborted) return reject(call.signal.reason);
        call.signal.addEventListener("abort", () => reject(call.signal.reason), { once: true });
        queueMicrotask(() => { for (const who of Object.keys(when)) if (when[who] === "during") fire[who](); });
      });
      const result = await outcomeOf(() => desk.client({ enableAbortSignal: true }).ask(desk.ctx, 1, { signal: caller.signal }));
      return { threw: result.threw, theContextsReason: result.threw === desk.ctx.signal.reason, theCallersReason: result.threw === caller.signal.reason };
    }),
  })),
  {
    name: "signals, both: the listening stops after a failed call, after a call that fails at once, and after an answer given at once",
    run: atDesk(async (desk) => {
      const caller = new AbortController();
      desk.callersSignal = desk.watch(caller.signal, "the caller's signal");
      desk.watch(desk.ctx.signal, "the context's signal");
      const client = desk.client({ enableAbortSignal: true });
      desk.answers.unary = async () => { throw new Error("the desk is closed"); };
      await outcomeOf(() => client.ask(desk.ctx, 1, { signal: caller.signal }));
      desk.log.push(["the caller", "calls a stream whose transport fails at once"]);
      desk.answers.stream = () => { throw new Error("the transport is gone"); };
      atOnce(() => client.watch(desk.ctx, 2, { signal: caller.signal }));
      desk.log.push(["the caller", "asks for an answer given at once"]);
      return client.hasOwnProperty(desk.ctx, "ask", { signal: caller.signal });
    }),
  },
  {
    name: "signals, both: failing before the two are joined leaves nothing to stop listening to",
    run: atDesk((desk) => {
      const caller = new AbortController();
      desk.callersSignal = desk.watch(caller.signal, "the caller's signal");
      desk.watch(desk.ctx.signal, "the context's signal");
      return atOnce(() => desk.client({ enableAbortSignal: true, extractHeaders: () => { throw "no headers"; } }).ask(desk.ctx, 1, { signal: caller.signal }));
    }),
  },
  {
    name: "signals, both, on a stream: the listening lasts as long as the reading, so a cancel in the middle reaches the transport; it stops when the stream ends",
    run: atDesk(async (desk) => {
      const [cancelable, cancel] = desk.ctx.withCancel();
      desk.ctx = cancelable;
      const caller = new AbortController();
      desk.callersSignal = desk.watch(caller.signal, "the caller's signal");
      desk.watch(desk.ctx.signal, "the context's signal");
      const gate = later();
      // A transport whose stream, like a real one, is cut short when its signal fires.
      desk.answers.stream = async (call) => ({
        header: new Headers(),
        trailer: new Headers(),
        message: { [Symbol.asyncIterator]: () => {
          let sent = 0;
          return { next: async () => {
            sent += 1;
            if (sent === 1) return { done: false, value: "a" };
            await gate.promise;
            if (call.signal.aborted) throw call.signal.reason;
            return { done: true, value: undefined };
          } };
        } },
      });
      const reader = desk.client({ enableAbortSignal: true }).watch(desk.ctx, 1, { signal: caller.signal })[Symbol.asyncIterator]();
      const first = await reader.next();
      desk.log.push(["the caller", "cancels the context in the middle of the stream"]);
      cancel(new Error("the turn was stopped"));
      gate.resolve();
      const second = await outcomeOf(() => reader.next());
      return { first, theContextsReason: second.threw === desk.ctx.signal.reason, threw: second.threw, theTransportsSignal: desk.whichSignal(desk.calls[0].signal) };
    }),
  },
  {
    name: "signals, both, on a stream: the listening stops when the stream is read to its end, when the reader stops early, and when the reader throws",
    run: atDesk(async (desk) => {
      const caller = new AbortController();
      desk.callersSignal = desk.watch(caller.signal, "the caller's signal");
      desk.watch(desk.ctx.signal, "the context's signal");
      const client = desk.client({ enableAbortSignal: true });
      desk.answers.stream = async () => ({ header: new Headers(), trailer: new Headers(), message: scripted(desk.log, "the stream", [{ value: "a" }]) });
      await readAll(client.watch(desk.ctx, 1, { signal: caller.signal }));
      desk.log.push(["the caller", "stops a second stream early"]);
      await client.watch(desk.ctx, 2, { signal: caller.signal })[Symbol.asyncIterator]().return();
      desk.log.push(["the caller", "throws at a third stream"]);
      await outcomeOf(() => client.watch(desk.ctx, 3, { signal: caller.signal })[Symbol.asyncIterator]().throw(new Error("the reader gave up")));
      desk.log.push(["the caller", "reads a fourth stream twice"]);
      const stream = client.watch(desk.ctx, 4, { signal: caller.signal });
      await readAll(stream);
      await readAll(stream);
      return desk.calls.length;
    }),
  },
];

export const scenarios = [...SHAPE, ...UNARY_CALLS, ...TRACE_HEADERS, ...HEADERS, ...CONTEXT_VALUES, ...UNARY_FAILURES, ...ODD_ANSWERS, ...STREAMS, ...SIGNALS, ...WHAT_A_METHOD_GETS, ...WITHOUT_A_SPAN];
