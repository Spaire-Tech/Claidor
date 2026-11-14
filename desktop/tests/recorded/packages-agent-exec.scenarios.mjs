/**
 * The layer between an agent's tools and whatever carries them out: a tool's request is shaped into a message
 * and sent to the side that does the work, the answers are read back, and on that other side each message is
 * handed to the executor registered for it and its answers are sent home.
 *
 * Nothing real is used. Every executor, connection, clock, timer, tracer and metrics backend is a stand-in made
 * here, and the stand-ins write to one log, so the order of everything the part does is kept. What goes on the
 * wire is kept as its plain form and as its bytes.
 *
 * These are 24 of the folder's files, the ones the published engine holds; the others are written down in a
 * file of their own.
 */
import { trace } from "@opentelemetry/api";

export const part = "packages/agent-exec";
export const modules = {
  conflictNotice: "source/packages/agent-exec/agent-store-conflict-notice.ts",
  toolsFile: "source/packages/agent-exec/agent-tools-file.ts",
  backgroundShell: "source/packages/agent-exec/background-shell.ts",
  workMetadata: "source/packages/agent-exec/background-work-metadata.ts",
  canvasDiagnostics: "source/packages/agent-exec/canvas-diagnostics.ts",
  computerUse: "source/packages/agent-exec/computer-use.ts",
  controlled: "source/packages/agent-exec/controlled.ts",
  del: "source/packages/agent-exec/delete.ts",
  hookExecutor: "source/packages/agent-exec/hook-executor.ts",
  ls: "source/packages/agent-exec/ls.ts",
  mcp: "source/packages/agent-exec/mcp.ts",
  read: "source/packages/agent-exec/read.ts",
  readonly: "source/packages/agent-exec/readonly-resource-accessor.ts",
  remote: "source/packages/agent-exec/remote.ts",
  requestContext: "source/packages/agent-exec/request-context.ts",
  resources: "source/packages/agent-exec/resource-provider.ts",
  serialization: "source/packages/agent-exec/serialization.ts",
  shellStream: "source/packages/agent-exec/shell-stream.ts",
  shell: "source/packages/agent-exec/shell.ts",
  smartMode: "source/packages/agent-exec/smart-mode-classifier.ts",
  subagentAwait: "source/packages/agent-exec/subagent-await.ts",
  subagentControl: "source/packages/agent-exec/subagent-control.ts",
  subagent: "source/packages/agent-exec/subagent.ts",
  write: "source/packages/agent-exec/write.ts",
  // Not this part's code: the contexts the part is given are real ones, made by the package it is built on.
  context: "source/packages/context/core.ts",
};
/** The part's own files: the folder holds others, which are not counted here. */
export const covers = Object.values(modules).filter((file) => file.startsWith("source/packages/agent-exec/"));

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/** A message as it goes on the wire: its type, its plain form and its bytes. */
function wire(message) {
  if (message === undefined || message === null || typeof message.toBinary !== "function") return { notAMessage: message };
  return { type: message.getType().typeName, json: message.toJson(), bytes: hex(message.toBinary()) };
}

/** The two envelopes of the wire, as the part's own code makes them, so that a scenario can make any message of either. */
function envelopes({ serialization }) {
  const ExecServerMessage = serialization.createServerSerializer("lsArgs")(0, {}).getType();
  const ExecClientMessage = serialization.createClientSerializer("lsResult")(0, {}).getType();
  return {
    /** A message from the side that asks, from its plain form. */
    server: (json) => ExecServerMessage.fromJson(json),
    /** A message from the side that does the work, from its plain form. */
    client: (json) => ExecClientMessage.fromJson(json),
    /** Notes a hook left for the model, as the messages carry them. */
    carriers: (...notes) => ExecClientMessage.fromJson({ hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }).hookAdditionalContexts,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Everything already asked for has happened: three turns of the event loop, each after all the promises before it. */
async function settle() {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** What a piece of work came to: what it answered, or what it threw. */
async function outcomeOf(work) {
  try {
    return { answered: await work() };
  } catch (error) {
    return { threw: error };
  }
}

/** What a piece of work that does not wait came to. */
function outcomeNow(work) {
  try {
    return { answered: work() };
  } catch (error) {
    return { threw: error };
  }
}

/** A failure the runtime itself raised is kept by its class only: its sentence is the runtime's, and changes with it. */
const classOnly = (outcome) => (outcome.threw instanceof Error ? { threwA: outcome.threw.constructor.name } : outcome);

/** Whether `from` is `context` or one of the contexts it was made from. */
function comesFrom(context, from) {
  for (let at = context; at !== undefined; at = at.getParent()) if (at === from) return true;
  return false;
}

/**
 * The key the part reads its metrics backend under. The part does not export it, so it is taken from the part
 * at work: a manager with no handler counts a failure on the context it was given, and that context here is a
 * stand-in that keeps what it is asked for.
 */
function metricsKeyOf({ controlled, serialization }) {
  const asked = [];
  const probe = { withCancel: () => [probe, () => {}], get: (key) => { asked.push(key); return key.defaultValue; } };
  const error = console.error;
  console.error = () => {};
  try {
    new controlled.SimpleControlledExecManager().handle(probe, serialization.createServerSerializer("lsArgs")(0, {}));
  } finally {
    console.error = error;
  }
  return asked.find((key) => key.symbol.description === "metricsBackend");
}

/**
 * One case's surroundings: the log, a real context that carries a metrics backend writing to the log, and what a
 * case needs to tell one context from another.
 */
function makeDesk(given) {
  const log = [];
  const { context } = given;
  const callersKey = context.createKey(Symbol("recorded.whose"), "nobody's");
  const desk = { log, ...envelopes(given) };
  /** What a context is, as the stand-ins write it down. */
  desk.about = (ctx) => ({
    path: ctx.getPath(),
    whose: ctx === desk.ctx ? "the caller's own" : comesFrom(ctx, desk.ctx) ? "one made from the caller's" : "another",
    carries: ctx.get(callersKey),
    canceled: ctx.canceled,
  });
  const backend = Object.fromEntries(
    ["record", "increment", "gauge", "histogram"].map((method) => [method, (ctx, handle, value, labels) => { log.push(["metrics", method, { ...handle }, value, labels, desk.about(ctx)]); }]),
  );
  desk.ctx = context.createContext().with(metricsKeyOf(given), backend).with(callersKey, "the caller's values").withName("turn");
  return desk;
}

/** A tracer whose spans write to the log what is done to them. `spanContext` says what a span is known by elsewhere. */
function tracing(log, spanContext = (number) => ({ traceId: TRACE_ID, spanId: `b7ad6b716920333${number}`, traceFlags: 1 })) {
  let count = 0;
  const startSpan = (tracer, name, options, parent) => {
    count += 1;
    const number = count;
    const label = `span ${number}`;
    log.push([`tracer ${tracer}`, "startSpan", { name, options, under: parent === undefined ? null : "a span" }]);
    const span = {
      setAttribute: (key, value) => { log.push([label, "setAttribute", key, value]); return span; },
      end: (...times) => { log.push([label, "end", ...times]); },
      spanContext: () => { log.push([label, "spanContext"]); return spanContext(number); },
    };
    return span;
  };
  return { getTracer: (tracer) => ({ startSpan: (name, options, parent) => startSpan(tracer, name, options, parent) }) };
}

/** The tracer set for the time of a piece of work. */
async function traced(provider, work) {
  trace.setGlobalTracerProvider(provider);
  try {
    return await work();
  } finally {
    trace.disable();
  }
}

/** `console.info` and `console.error` written to the log for the time of a piece of work. */
async function overheard(log, work) {
  const real = { info: console.info, error: console.error };
  console.info = (...said) => { log.push(["console.info", ...said]); };
  console.error = (...said) => { log.push(["console.error", ...said]); };
  try {
    return await work();
  } finally {
    Object.assign(console, real);
  }
}

/** The clock the part measures with, held at whatever the case sets (`clock.now`, in ms). */
async function clocked(work) {
  const clock = { now: 1_000 };
  const own = Object.getOwnPropertyDescriptor(performance, "now");
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => clock.now });
  try {
    return await work(clock);
  } finally {
    if (own === undefined) delete performance.now;
    else Object.defineProperty(performance, "now", own);
  }
}

/**
 * The timers the part asks for, written to the log and rung only when the case says so (`timers.ring(number)`),
 * so that no case waits for a real one.
 */
async function timed(log, work) {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const asked = [];
  globalThis.setTimeout = (ring, ms) => {
    const timer = { number: asked.length + 1, ring, cleared: false, rang: false };
    asked.push(timer);
    log.push(["timer", `${timer.number} is set`, ms]);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    log.push(["timer", timer === undefined ? "none to clear" : `${timer.number} is cleared`]);
    if (timer !== undefined) timer.cleared = true;
  };
  const timers = {
    ring(number) {
      const timer = asked[number - 1];
      log.push(["timer", `${number} rings${timer.cleared ? ", though cleared" : ""}`]);
      timer.rang = true;
      timer.ring();
    },
    /** The timers still to ring: set, and neither cleared nor rung. */
    left: () => asked.filter((timer) => !timer.cleared && !timer.rang).map((timer) => timer.number),
  };
  try {
    return await work(timers);
  } finally {
    Object.assign(globalThis, real);
  }
}

/** Failures nobody caught while a piece of work ran, kept instead of ending the run. */
async function unhandled(work) {
  const others = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  const seen = [];
  const mine = (reason) => { seen.push(reason); };
  process.on("unhandledRejection", mine);
  try {
    const outcome = await work();
    await settle();
    return { outcome, leftUncaught: seen };
  } finally {
    process.removeListener("unhandledRejection", mine);
    for (const listener of others) process.on("unhandledRejection", listener);
  }
}

/**
 * A stream that answers from a script and writes down each time it is asked. A step is a message to give,
 * `{ fails: error }`, `{ waitsFor: promise }` (the steps after it come once the promise has), or `{ never: true }`
 * (asked, it never answers). After the last step the stream ends.
 */
function scripted(log, label, steps) {
  let at = 0;
  let asked = 0;
  const iterator = {
    async next() {
      asked += 1;
      log.push([label, `is asked (${asked})`]);
      while (at < steps.length && steps[at].waitsFor !== undefined) {
        await steps[at].waitsFor;
        at += 1;
      }
      if (at >= steps.length) {
        log.push([label, "ends"]);
        return { done: true, value: undefined };
      }
      const step = steps[at];
      at += 1;
      if ("fails" in step) {
        log.push([label, "fails", step.fails]);
        throw step.fails;
      }
      if (step.never === true) return new Promise(() => {});
      log.push([label, "gives", typeof step.toBinary === "function" ? wire(step) : step]);
      return { done: false, value: step };
    },
    async return(value) {
      log.push([label, "is told to stop"]);
      return { done: true, value };
    },
  };
  return {
    [Symbol.asyncIterator]() {
      log.push([label, "is opened"]);
      return iterator;
    },
  };
}

/**
 * The side that does the work, as the part's sending half sees it: it is given a context and a function that
 * makes the message for a number, asks that function for each number in `numbers`, and answers with `stream`.
 */
function connection(desk, { numbers = [7], steps = [] } = {}) {
  const made = [];
  return {
    made,
    createExecInstance(ctx, createMessage, ...more) {
      desk.log.push(["connection", "createExecInstance", desk.about(ctx), ...(more.length === 0 ? [] : [{ moreArguments: more.length }])]);
      for (const number of numbers) {
        const message = createMessage(number);
        made.push(message);
        desk.log.push(["connection", `the message for ${number}`, wire(message)]);
      }
      return scripted(desk.log, "the answers", steps);
    },
  };
}

/** A fixed place for an error's trace, so that what is sent of it reads the same everywhere. */
function failure(message, { name, stack = `Error: ${message}\n    at a fixed place` } = {}) {
  const error = new Error(message);
  if (name !== undefined) error.name = name;
  error.stack = stack;
  return error;
}

export const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

// ---------------------------------------------------------------------------------------------------------------
// What is known of a piece of background work (background-work-metadata.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("what is known of background work is written as text: a title and a folder that are not blank, a start time above zero cut to whole ms", ({ workMetadata }) => {
  const { encodeBackgroundWorkMetadata } = workMetadata;
  return [
    {},
    { title: "Build", cwd: "/work", startTimeMs: 1_700_000_000_123 },
    { startTimeMs: 5, cwd: "/work", title: "Build" },
    { title: "" },
    { title: "   " },
    { title: " padded " },
    { title: 7 },
    { title: null },
    { cwd: "" },
    { cwd: "\t\n" },
    { cwd: " /with spaces " },
    { cwd: ["/work"] },
    { startTimeMs: 0 },
    { startTimeMs: -1 },
    { startTimeMs: 0.5 },
    { startTimeMs: 1 },
    { startTimeMs: 1.999 },
    { startTimeMs: Number.NaN },
    { startTimeMs: Number.POSITIVE_INFINITY },
    { startTimeMs: Number.NEGATIVE_INFINITY },
    { startTimeMs: "12" },
    { startTimeMs: 1e21 },
    { startTimeMs: Number.MAX_SAFE_INTEGER },
    { title: "Only a title", startTimeMs: 0 },
    { other: "ignored", title: "Kept" },
  ].map((metadata) => encodeBackgroundWorkMetadata(metadata));
});

scenario("writing what is known of background work fails on nothing at all", ({ workMetadata }) => [
  classOnly(outcomeNow(() => workMetadata.encodeBackgroundWorkMetadata(undefined))),
  classOnly(outcomeNow(() => workMetadata.encodeBackgroundWorkMetadata(null))),
]);

scenario("what is known of background work is read back from text, and what is missing or of another kind is left out", ({ workMetadata }) => {
  const { decodeBackgroundWorkMetadata } = workMetadata;
  return [
    undefined,
    null,
    {},
    { title: "Build", cwd: "/work", startTimeMs: "1700000000123" },
    { startTimeMs: "5", cwd: "/work", title: "Build" },
    { title: "" },
    { title: "  " },
    { title: " padded " },
    { title: 7 },
    { cwd: "" },
    { cwd: " " },
    { cwd: { path: "/work" } },
    { startTimeMs: "" },
    { startTimeMs: "0" },
    { startTimeMs: "-3" },
    { startTimeMs: "0.5" },
    { startTimeMs: "1" },
    { startTimeMs: "12.7" },
    { startTimeMs: "1e3" },
    { startTimeMs: " 5 " },
    { startTimeMs: "0x10" },
    { startTimeMs: "abc" },
    { startTimeMs: "12abc" },
    { startTimeMs: "Infinity" },
    { startTimeMs: "NaN" },
    { startTimeMs: 12 },
    { startTimeMs: true },
    { other: "ignored", cwd: "/kept" },
  ].map((metadata) => decodeBackgroundWorkMetadata(metadata));
});

scenario("what is written of background work reads back the same, but for the part of a ms", ({ workMetadata }) => {
  const { encodeBackgroundWorkMetadata, decodeBackgroundWorkMetadata } = workMetadata;
  return [
    { title: "Build", cwd: "/work", startTimeMs: 1_700_000_000_123.9 },
    { title: "t" },
    { startTimeMs: 0.5 },
  ].map((metadata) => decodeBackgroundWorkMetadata(encodeBackgroundWorkMetadata(metadata)));
});

// ---------------------------------------------------------------------------------------------------------------
// The computer tool's actions, counted (computer-use.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("the computer tool's actions are counted by kind, and an action of no kind or an unknown one is counted only in the total", ({ computerUse }) => {
  const { summarizeComputerUseActions } = computerUse;
  const action = (kind) => ({ action: { case: kind } });
  const everyKind = ["mouseMove", "click", "mouseDown", "mouseUp", "drag", "scroll", "type", "key", "wait", "screenshot", "cursorPosition"];
  return [
    summarizeComputerUseActions([]),
    summarizeComputerUseActions(everyKind.map(action)),
    summarizeComputerUseActions([...everyKind, ...everyKind.slice(0, 3), "click"].map(action)),
    summarizeComputerUseActions([action(undefined), action("zoom"), action("Click"), action("mouse_move"), action("click")]),
    ...everyKind.map((kind) => summarizeComputerUseActions([action(kind)])),
    Object.keys(summarizeComputerUseActions([]).actionCounts),
  ];
});

scenario("counting the computer tool's actions fails on an action that has no action in it", ({ computerUse }) => [
  classOnly(outcomeNow(() => computerUse.summarizeComputerUseActions([{}]))),
  classOnly(outcomeNow(() => computerUse.summarizeComputerUseActions([null]))),
  classOnly(outcomeNow(() => computerUse.summarizeComputerUseActions(undefined))),
]);

scenario("a screenshot is taken two seconds after the computer tool's last action", ({ computerUse }) => computerUse.COMPUTER_USE_SCREENSHOT_SETTLE_DELAY_MS);

// ---------------------------------------------------------------------------------------------------------------
// MCP servers: their names, their tools' files, what changed about them (mcp.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("the names the built-in MCP providers go by", ({ mcp }) => ({
  SIMEON_PLAYWRIGHT_PROVIDER_ID: mcp.SIMEON_PLAYWRIGHT_PROVIDER_ID,
  SIMEON_IDE_BROWSER_PROVIDER_ID: mcp.SIMEON_IDE_BROWSER_PROVIDER_ID,
  SIMEON_SELF_CONTROL_PROVIDER_ID: mcp.SIMEON_SELF_CONTROL_PROVIDER_ID,
  CUSTOM_USER_TOOLS_PROVIDER_ID: mcp.CUSTOM_USER_TOOLS_PROVIDER_ID,
  SIMEON_DYNAMIC_TOOLS_NAMESPACE: mcp.SIMEON_DYNAMIC_TOOLS_NAMESPACE,
  NON_AUTHENTICATABLE_MCP_PROVIDER_IDS: mcp.NON_AUTHENTICATABLE_MCP_PROVIDER_IDS,
  BROWSER_MCP_PROVIDER_IDS: mcp.BROWSER_MCP_PROVIDER_IDS,
  McpLeaseChangeReason: mcp.McpLeaseChangeReason,
}));

scenario("the first-party tools are under their namespace's name or its earlier one, and under no other spelling", ({ mcp }) =>
  ["simeon", "cursor", "Simeon", "CURSOR", " simeon", "simeon ", "", undefined, null, "simeon-dev-control", 0].map((namespace) => [namespace, mcp.isFirstPartyToolsNamespace(namespace)]));

scenario("a person can sign in to any MCP server but the built-in ones", ({ mcp }) =>
  [...mcp.NON_AUTHENTICATABLE_MCP_PROVIDER_IDS, "github", "", "FSD", "fsd ", "cursor-app-control-2", undefined].map((server) => [server, mcp.supportsInteractiveMcpAuth(server)]));

scenario("a tool's file holds its name, description, arguments and where it comes from, each key there even when not given", ({ mcp }) => {
  const { buildMcpToolFileContent } = mcp;
  const schema = { type: "object", properties: { query: { type: "string" } } };
  const full = buildMcpToolFileContent({ toolName: "search", description: "Search the docs", inputSchema: schema, outputSchema: { type: "string" }, plugin: "docs", marketplace: "main", pluginId: "p1", marketplaceId: "m1", extra: "left out" });
  const bare = buildMcpToolFileContent({ toolName: "ping" });
  return {
    full,
    fullKeys: Object.keys(full),
    theSchemaItselfIsHandedOn: full.arguments === schema,
    bare,
    bareKeys: Object.keys(bare),
    asWritten: JSON.stringify(bare),
    nothing: classOnly(outcomeNow(() => buildMcpToolFileContent(undefined))),
  };
});

scenario("a tool's input schema is read from its text when the text is JSON, and nothing comes of text that is not", ({ mcp }) =>
  [undefined, "", "{}", '{"type":"object","properties":{"a":{"type":"number"}}}', "[1,2]", '"text"', "12", "true", "null", "{", "{'a':1}", " { \"a\" : 1 } ", "undefined"].map((text) => [text, outcomeNow(() => mcp.parseMcpInputSchemaJson(text))]));

scenario("a tool's input schema comes from its text first, and from the schema it holds when the text gives nothing or null", ({ mcp }) => {
  const asked = [];
  const held = (answer) => ({ toJson: () => { asked.push(answer); return answer; } });
  const cases = [
    {},
    { inputSchemaJson: '{"from":"text"}' },
    { inputSchemaJson: '{"from":"text"}', inputSchema: held({ from: "held" }) },
    { inputSchemaJson: "not json", inputSchema: held({ from: "held, after bad text" }) },
    { inputSchemaJson: "null", inputSchema: held({ from: "held, after a null text" }) },
    { inputSchemaJson: "false", inputSchema: held({ from: "held, never asked" }) },
    { inputSchemaJson: "0", inputSchema: held({ from: "held, never asked" }) },
    { inputSchemaJson: '""', inputSchema: held({ from: "held, never asked" }) },
    { inputSchema: held({ from: "held alone" }) },
    { inputSchema: held(null) },
    { inputSchemaJson: "not json" },
    { inputSchemaJson: "null" },
  ];
  return { answers: cases.map((tool) => mcp.mcpInputSchemaToJson(tool)), heldSchemasAsked: asked, nothing: classOnly(outcomeNow(() => mcp.mcpInputSchemaToJson(undefined))) };
});

scenario("a change that names no servers is a change to all of them", ({ mcp }) =>
  [undefined, {}, { reason: "simeon_mcp_lease_settings" }, { serverIdentifiers: undefined }, { serverIdentifiers: [] }, { serverIdentifiers: ["a"] }, { serverIdentifiers: null }].map((event) => mcp.isFullMcpLeaseInvalidation(event)));

scenario("a change to all servers fails to be judged on null", ({ mcp }) => classOnly(outcomeNow(() => mcp.isFullMcpLeaseInvalidation(null))));

scenario("two changes are merged into one: all servers if either says all, otherwise each server once, with the first reason given", ({ mcp }) => {
  const { mergeMcpLeaseEvents } = mcp;
  const a = { serverIdentifiers: ["a", "b"], reason: "first" };
  const b = { serverIdentifiers: ["b", "c"], reason: "second" };
  const all = { reason: "all of them" };
  const allNoReason = {};
  return {
    none: mergeMcpLeaseEvents(),
    oneIsGivenBackAsItIs: mergeMcpLeaseEvents(a) === a,
    oneUndefined: mergeMcpLeaseEvents(undefined),
    both: mergeMcpLeaseEvents(a, b),
    bothTheOtherWay: mergeMcpLeaseEvents(b, a),
    noReasonOnTheFirst: mergeMcpLeaseEvents({ serverIdentifiers: ["x"] }, b),
    noReasonOnEither: mergeMcpLeaseEvents({ serverIdentifiers: ["x"] }, { serverIdentifiers: ["x", "y"] }),
    anEmptyReasonCounts: mergeMcpLeaseEvents({ serverIdentifiers: ["x"], reason: "" }, b),
    emptyLists: mergeMcpLeaseEvents({ serverIdentifiers: [] }, { serverIdentifiers: [] }),
    repeatsWithinOne: mergeMcpLeaseEvents({ serverIdentifiers: ["a", "a", "b"] }, { serverIdentifiers: ["b", "b", "a", "c"] }),
    secondSaysAll: mergeMcpLeaseEvents(a, all),
    secondSaysAllWithoutReason: mergeMcpLeaseEvents(a, allNoReason),
    secondIsUndefined: mergeMcpLeaseEvents(a, undefined),
    firstIsUndefined: mergeMcpLeaseEvents(undefined, b),
    firstIsUndefinedTheSecondIsGivenBackAsItIs: mergeMcpLeaseEvents(undefined, b) === b,
    bothUndefined: mergeMcpLeaseEvents(undefined, undefined),
    firstSaysAll: mergeMcpLeaseEvents(all, b),
    firstSaysAllWithoutReason: mergeMcpLeaseEvents(allNoReason, b),
    bothSayAll: mergeMcpLeaseEvents(all, { reason: "the other" }),
    secondSaysAllAndOnlyItHasAReason: mergeMcpLeaseEvents({ serverIdentifiers: ["x"] }, all),
    secondSaysAllAndNeitherHasAReason: mergeMcpLeaseEvents({ serverIdentifiers: ["x"] }, allNoReason),
    firstIsUndefinedAndTheSecondSaysAll: mergeMcpLeaseEvents(undefined, all),
    firstSaysAllTheSecondIsUndefined: mergeMcpLeaseEvents(all, undefined),
    aListOfNullIsNoServerButNotAll: [
      mergeMcpLeaseEvents({ serverIdentifiers: null, reason: "first" }, b),
      mergeMcpLeaseEvents(a, { serverIdentifiers: null }),
      mergeMcpLeaseEvents({ serverIdentifiers: null }, { serverIdentifiers: null }),
    ],
    aThirdIsNotLookedAt: mergeMcpLeaseEvents(a, b, { reason: "third" }),
    aThirdIsNotLookedAtEvenWhenItSaysAll: mergeMcpLeaseEvents(a, b, undefined),
    keysOfAMerge: Object.keys(mergeMcpLeaseEvents(a, b)),
    keysWhenAll: Object.keys(mergeMcpLeaseEvents(a, all)),
    theFirstIsNotChanged: [a, b],
  };
});

scenario("merging two changes fails when the first is null", ({ mcp }) => [
  classOnly(outcomeNow(() => mcp.mergeMcpLeaseEvents(null, { serverIdentifiers: ["a"] }))),
  classOnly(outcomeNow(() => mcp.mergeMcpLeaseEvents({ serverIdentifiers: ["a"] }, null))),
]);

scenario("why an MCP server's tools cannot be used, told for the three states that stop them", ({ mcp }) =>
  ["needsAuth", "error", "loading", "connected", "ready", "", "NeedsAuth", "needsauth", " error", undefined, null].map((status) => {
    const reason = mcp.mcpServerUnavailableReason(status);
    return [status, reason, reason === undefined ? null : reason.length];
  }));

// ---------------------------------------------------------------------------------------------------------------
// Notices that someone else changed the agent's files (agent-store-conflict-notice.ts)
// ---------------------------------------------------------------------------------------------------------------

/** An executor that writes down what it is asked and answers with one promise, which the case can compare. */
function noticeExecutor() {
  const asked = [];
  const answer = Promise.resolve({ kind: "answered" });
  return { asked, answer, execute(...all) { const [ctx, args, options] = all; asked.push({ ctx, args, keys: Object.keys(args), options, argumentsGiven: all.length }); return answer; } };
}

scenario("asking for notices after a sync sends the conversation, the paths written, the time allowed and eagerness only when each is given", ({ conflictNotice }) => {
  const executor = noticeExecutor();
  const paths = ["/work/a.txt"];
  const given = [
    undefined,
    null,
    {},
    { conversationId: "c1" },
    { conversationId: "" },
    { conversationId: undefined, writtenPaths: undefined, timeoutMs: undefined, eager: undefined },
    { writtenPaths: paths },
    { writtenPaths: [] },
    { timeoutMs: 0 },
    { timeoutMs: 250 },
    { eager: true },
    { eager: false },
    { eager: "true" },
    { eager: 1 },
    { eager: true, timeoutMs: 250, writtenPaths: paths, conversationId: "c1", other: "left out" },
    { conversationId: null, writtenPaths: null, timeoutMs: null },
  ];
  const returned = given.map((args) => conflictNotice.conflictNoticeSyncAndPeek(executor, "the context", args, { execId: "e1" }));
  const withoutOptions = conflictNotice.conflictNoticeSyncAndPeek(executor, "the context");
  return {
    asked: executor.asked,
    theExecutorsOwnPromiseIsGivenBack: [...returned, withoutOptions].every((promise) => promise === executor.answer),
    thePathsThemselvesAreHandedOn: executor.asked[6].args.writtenPaths === paths,
  };
});

scenario("asking for notices without a sync sends only the conversation", ({ conflictNotice }) => {
  const executor = noticeExecutor();
  const returned = [undefined, null, {}, { conversationId: "c1" }, { conversationId: "" }, { conversationId: null }, { conversationId: "c1", writtenPaths: ["/a"], eager: true }].map((args) =>
    conflictNotice.conflictNoticePeek(executor, "the context", args, "the options"));
  return { asked: executor.asked, theExecutorsOwnPromiseIsGivenBack: returned.every((promise) => promise === executor.answer) };
});

scenario("an executor that fails as it is asked for notices fails the asking at once, not later", ({ conflictNotice }) => {
  const boom = new Error("the executor is gone");
  const executor = { execute() { throw boom; } };
  return [
    outcomeNow(() => conflictNotice.conflictNoticeSyncAndPeek(executor, "the context", {})),
    outcomeNow(() => conflictNotice.conflictNoticePeek(executor, "the context", {})),
  ];
});

scenario("notices are marked read, given back or their paths noted only when there are some, and nothing comes back", async ({ conflictNotice }) => {
  const out = {};
  for (const [name, op] of [["ack", conflictNotice.conflictNoticeAck], ["release", conflictNotice.conflictNoticeRelease], ["note", conflictNotice.conflictNoticeNoteDeferredEagerWrittenPaths]]) {
    const executor = noticeExecutor();
    const ids = ["e1", "e2"];
    const answers = [
      await op(executor, "the context", []),
      await op(executor, "the context", [], { conversationId: "c1" }, "the options"),
      await op(executor, "the context", ids),
      await op(executor, "the context", ids, null),
      await op(executor, "the context", ids, {}),
      await op(executor, "the context", ids, { conversationId: "c1" }, "the options"),
      await op(executor, "the context", ids, { conversationId: "" }),
      await op(executor, "the context", ids, { conversationId: undefined }),
      await op(executor, "the context", ["one"], { conversationId: "c1", other: "left out" }),
    ];
    const first = op(executor, "the context", ids);
    out[name] = {
      asked: executor.asked,
      answers,
      aPromiseOfItsOwn: first instanceof Promise && first !== executor.answer,
      theListItselfIsHandedOn: Object.values(executor.asked[0].args)[1] === ids,
    };
  }
  return out;
});

scenario("marking notices waits for the executor, and its failure is the marking's failure", async ({ conflictNotice }) => {
  const order = [];
  const gate = deferred();
  const slow = { execute: async () => { order.push("the executor is asked"); await gate.promise; order.push("the executor answers"); } };
  const waiting = conflictNotice.conflictNoticeAck(slow, "the context", ["e1"]).then(() => order.push("the marking is done"));
  order.push("the marking was started");
  gate.resolve();
  await waiting;
  const boom = new Error("no such notice");
  const failing = { execute: async () => { throw boom; } };
  const throwing = { execute() { throw boom; } };
  const outcomes = [];
  for (const op of [conflictNotice.conflictNoticeAck, conflictNotice.conflictNoticeRelease, conflictNotice.conflictNoticeNoteDeferredEagerWrittenPaths]) {
    outcomes.push(await outcomeOf(() => op(failing, "the context", ["e1"])));
    // A failure as it is asked comes back as a failed promise too, never at once.
    const promise = outcomeNow(() => op(throwing, "the context", ["e1"]));
    outcomes.push(promise.answered instanceof Promise ? await outcomeOf(() => promise.answered) : "failed at once");
    outcomes.push(classOnly(await outcomeOf(() => op(failing, "the context", null))));
  }
  return { order, outcomes };
});

scenario("the far side has no notices to give: it answers each request with nothing done", async ({ conflictNotice }) => {
  const stub = new conflictNotice.RemoteAgentStoreConflictNoticeStub();
  const answers = [];
  for (const args of [{ op: "ack" }, { op: "release" }, { op: "noteDeferredEagerWrittenPaths" }, { op: "peek" }, { op: "syncAndPeek" }, { op: "Ack" }, {}, { op: "ack", eventIds: ["e1", "e2"] }]) {
    answers.push([args, await stub.execute("the context", args)]);
  }
  const first = await stub.execute("the context", { op: "ack" });
  const second = await stub.execute("the context", { op: "ack" });
  return {
    answers,
    aNewAnswerEachTime: first !== second,
    aPromise: stub.execute("the context", {}) instanceof Promise,
    onNothing: [classOnly(await outcomeOf(() => stub.execute("the context", undefined))), classOnly(await outcomeOf(() => stub.execute("the context", null)))],
    throughTheHelpers: [
      await conflictNotice.conflictNoticeSyncAndPeek(stub, "the context", { conversationId: "c1", eager: true }),
      await conflictNotice.conflictNoticePeek(stub, "the context"),
      await conflictNotice.conflictNoticeAck(stub, "the context", ["e1"]),
    ],
  };
});

scenario("the notices' resource gives the far side's empty answerer to whoever asks, and registers nothing on the near side", async ({ conflictNotice }) => {
  const resource = conflictNotice.agentStoreConflictNoticeExecutorResource;
  const first = resource.remoteImplementation("any manager");
  const second = resource.remoteImplementation(undefined);
  const registered = [];
  const manager = { register: (handler) => { registered.push(handler); } };
  return {
    keys: Object.keys(resource),
    symbol: [typeof resource.symbol, resource.symbol.description, String(resource.symbol)],
    isTheStub: [first instanceof conflictNotice.RemoteAgentStoreConflictNoticeStub, second instanceof conflictNotice.RemoteAgentStoreConflictNoticeStub],
    aNewOneEachTime: first !== second,
    itAnswers: await first.execute("the context", { op: "release" }),
    registering: [resource.registerControlledImplementation(first, manager), resource.registerControlledImplementation(undefined, undefined)],
    registered,
  };
});

// ---------------------------------------------------------------------------------------------------------------
// Resources and where their implementations are found (resource-provider.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("a resource is a mark of its own and the two ways to get its implementation, kept as given", ({ resources }) => {
  const remote = () => "far";
  const controlled = () => "near";
  const first = resources.createResource(remote, controlled);
  const second = resources.createResource(remote, controlled);
  return {
    keys: Object.keys(first),
    symbol: [typeof first.symbol, first.symbol.description, String(first.symbol)],
    aMarkOfItsOwn: first.symbol !== second.symbol,
    theFunctionsGiven: [first.remoteImplementation === remote, first.registerControlledImplementation === controlled],
    withNothing: outcomeNow(() => Object.entries(resources.createResource()).map(([key, value]) => [key, typeof value])),
  };
});

scenario("a resource and its implementation are paired as they are", ({ resources }) => {
  const resource = resources.createResource(() => "far", () => {});
  const implementation = { execute() {} };
  const entry = resources.resourceEntry(resource, implementation);
  return { isAList: Array.isArray(entry), length: entry.length, same: [entry[0] === resource, entry[1] === implementation], ofNothing: resources.resourceEntry() };
});

scenario("the far side's implementation of a resource is made anew from the connection each time it is asked for", ({ resources }) => {
  const asked = [];
  const resource = resources.createResource((manager) => { asked.push(manager); return { number: asked.length }; }, () => {});
  const accessor = new resources.RemoteResourceAccessor("the connection");
  const got = [accessor.get(resource), accessor.get(resource)];
  const without = new resources.RemoteResourceAccessor();
  return {
    got,
    asked,
    withNoConnection: without.get(resources.createResource((manager) => ["made with", manager], () => {})),
    aResourceWithNoFarSide: classOnly(outcomeNow(() => accessor.get({ symbol: Symbol("bare") }))),
    aFailingOne: outcomeNow(() => accessor.get(resources.createResource(() => { throw new Error("cannot reach it"); }, () => {}))),
  };
});

scenario("a registry keeps one implementation for each resource, the last registered, in the order the resources first came", ({ resources }) => {
  const registry = new resources.RegistryResourceAccessor();
  const make = () => resources.createResource(() => "far", () => {});
  const [a, b, c, never] = [make(), make(), make(), make()];
  const before = { entries: registry.entries(), get: registry.get(a) };
  const returns = [registry.register(a, "first of a"), registry.register(b, "b"), registry.register(c, undefined), registry.register(a, "second of a")];
  const entries = registry.entries();
  return {
    before,
    returns,
    got: [registry.get(a), registry.get(b), registry.get(c), registry.get(never)],
    order: entries.map(([resource, value]) => [resource === a ? "a" : resource === b ? "b" : resource === c ? "c" : "another", value]),
    eachEntryIsAPair: entries.every((entry) => Array.isArray(entry) && entry.length === 2),
    aNewListEachTime: registry.entries() !== entries,
    foundByTheMarkAlone: registry.get({ symbol: b.symbol }),
    separateRegistries: new resources.RegistryResourceAccessor().get(a),
    onNothing: [classOnly(outcomeNow(() => registry.get(undefined))), classOnly(outcomeNow(() => registry.register(undefined, "x")))],
  };
});

scenario("an accessor laid over another answers with its own implementations first, the last given for a resource, and asks the one below for the rest", ({ resources }) => {
  const make = () => resources.createResource(() => "far", () => {});
  const [a, b, c, d] = [make(), make(), make(), make()];
  const asked = [];
  const below = { get: (resource) => { asked.push(resource === a ? "a" : resource === b ? "b" : resource === c ? "c" : resource === d ? "d" : "another"); return `from below`; } };
  const local = { execute() {} };
  const over = new resources.CombinedResourceAccessor(below, [resources.resourceEntry(a, "first of a"), [b, local], [a, "second of a"], [c, undefined]]);
  const none = new resources.CombinedResourceAccessor(below, []);
  return {
    got: [over.get(a), over.get(b) === local, over.get(c), over.get(d), over.get({ symbol: b.symbol }) === local],
    asked: [...asked],
    withNoneOfItsOwn: [none.get(a), none.get(d)],
    overAnotherOfItsKind: new resources.CombinedResourceAccessor(over, [[d, "d on top"]]).get(a),
    theListIsReadOnce: (() => {
      const entries = [[a, "at the start"]];
      const accessor = new resources.CombinedResourceAccessor(below, entries);
      entries.push([d, "added later"]);
      entries[0][1] = "changed later";
      return [accessor.get(a), accessor.get(d)];
    })(),
    failures: [
      classOnly(outcomeNow(() => new resources.CombinedResourceAccessor(below))),
      classOnly(outcomeNow(() => new resources.CombinedResourceAccessor(below, [undefined]))),
      classOnly(outcomeNow(() => new resources.CombinedResourceAccessor(undefined, []).get(d))),
      outcomeNow(() => new resources.CombinedResourceAccessor(undefined, [[a, "its own, with nothing below"]]).get(a)),
      classOnly(outcomeNow(() => over.get(undefined))),
    ],
  };
});

// ---------------------------------------------------------------------------------------------------------------
// A request or an answer put into the wire's envelope, and taken out of it (serialization.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("a request is put into the asking side's envelope under its own name, with the number it is known by", (given) => {
  const { serialization } = given;
  const { server } = envelopes(given);
  const args = server({ shellArgs: { command: "ls -la", workingDirectory: "/work", toolCallId: "call-1" } }).message.value;
  const shell = serialization.createServerSerializer("shellArgs");
  const made = shell(7, args);
  return {
    made: wire(made),
    theRequestItselfIsInside: made.message.value === args,
    asAStreamOfTheSameRequest: wire(serialization.createServerSerializer("shellStreamArgs")(8, args)),
    numbers: [0, 1, 4_294_967_295].map((id) => wire(shell(id, args))),
    plainFieldsBecomeARequest: wire(serialization.createServerSerializer("lsArgs")(3, { path: "/work", ignore: ["node_modules"] })),
    nothingBecomesAnEmptyRequest: outcomeNow(() => { const empty = serialization.createServerSerializer("deleteArgs")(4, undefined); return [empty.message, wire(empty)]; }),
    aNameTheEnvelopeDoesNotHave: outcomeNow(() => { const odd = serialization.createServerSerializer("noSuchArgs")(5, { a: 1 }); return [odd.id, odd.message, hex(odd.toBinary())]; }),
    eachCallMakesANewEnvelope: shell(7, args) !== shell(7, args),
  };
});

scenario("an answer is put into the answering side's envelope under its own name, with the request's number", (given) => {
  const { serialization } = given;
  const { client } = envelopes(given);
  const result = client({ shellResult: { success: { command: "ls -la", exitCode: 0, stdout: "a\nb\n" } } }).message.value;
  const shell = serialization.createClientSerializer("shellResult");
  const made = shell(7, result);
  return {
    made: wire(made),
    theAnswerItselfIsInside: made.message.value === result,
    whatElseTheEnvelopeHolds: { execId: made.execId, localExecutionTimeMs: made.localExecutionTimeMs, hookAdditionalContexts: made.hookAdditionalContexts },
    plainFieldsBecomeAnAnswer: wire(serialization.createClientSerializer("lsResult")(3, { result: { case: "error", value: { path: "/work", error: "no such folder" } } })),
    nothingBecomesAnEmptyAnswer: outcomeNow(() => { const empty = serialization.createClientSerializer("deleteResult")(4, undefined); return [empty.message, wire(empty)]; }),
    aNameTheEnvelopeDoesNotHave: outcomeNow(() => { const odd = serialization.createClientSerializer("noSuchResult")(5, { a: 1 }); return [odd.id, odd.message, hex(odd.toBinary())]; }),
  };
});

scenario("a request is taken out of the asking side's envelope only when it is the one looked for", (given) => {
  const { serialization } = given;
  const { server } = envelopes(given);
  const message = server({ id: 12, execId: "exec-1", shellArgs: { command: "pwd" } });
  const shell = serialization.createServerDeserializer("shellArgs");
  const found = shell(message);
  return {
    found: { keys: Object.keys(found), id: found.id, args: wire(found.args), theRequestItself: found.args === message.message.value },
    asAnotherRequest: [serialization.createServerDeserializer("shellStreamArgs")(message), serialization.createServerDeserializer("writeArgs")(message)],
    anEmptyEnvelope: shell(server({ id: 13 })),
    anEnvelopeNumberedZero: shell(server({ shellArgs: {} })).id,
    lookingForNoName: [serialization.createServerDeserializer(undefined)(server({ id: 14 })), serialization.createServerDeserializer(undefined)(message)],
    aPlainLookAlike: shell({ id: "any", message: { case: "shellArgs", value: "anything" } }),
    notAnEnvelope: [classOnly(outcomeNow(() => shell({}))), classOnly(outcomeNow(() => shell(undefined)))],
  };
});

scenario("an answer is taken out of the answering side's envelope only when it is the one looked for", (given) => {
  const { serialization } = given;
  const { client } = envelopes(given);
  const message = client({ id: 12, shellResult: { rejected: { command: "rm -rf /", reason: "not allowed" } } });
  const shell = serialization.createClientDeserializer("shellResult");
  return {
    found: wire(shell(message)),
    theAnswerItself: shell(message) === message.message.value,
    asAnotherAnswer: [serialization.createClientDeserializer("shellStream")(message), serialization.createClientDeserializer("writeResult")(message)],
    anEmptyEnvelope: shell(client({ id: 13 })),
    lookingForNoName: [serialization.createClientDeserializer(undefined)(client({ id: 14 })), serialization.createClientDeserializer(undefined)(message)],
    aPlainLookAlike: shell({ message: { case: "shellResult", value: "anything" } }),
    notAnEnvelope: [classOnly(outcomeNow(() => shell({}))), classOnly(outcomeNow(() => shell(undefined)))],
  };
});

scenario("what one side puts into an envelope the other takes out, through the bytes", (given) => {
  const { serialization } = given;
  const { server, client } = envelopes(given);
  const request = serialization.createServerSerializer("writeArgs")(21, server({ writeArgs: { path: "/work/a.txt", fileText: "héllo\n", toolCallId: "call-w" } }).message.value);
  const arrived = request.getType().fromBinary(request.toBinary());
  const read = serialization.createServerDeserializer("writeArgs")(arrived);
  const answer = serialization.createClientSerializer("writeResult")(read.id, client({ writeResult: { success: { path: "/work/a.txt", linesCreated: 1, fileSize: 7 } } }).message.value);
  const back = answer.getType().fromBinary(answer.toBinary());
  return { request: wire(request), read: { id: read.id, args: wire(read.args) }, answer: wire(answer), taken: wire(serialization.createClientDeserializer("writeResult")(back)) };
});

// ---------------------------------------------------------------------------------------------------------------
// Long tool output written to a file instead of being sent whole (agent-tools-file.ts)
// ---------------------------------------------------------------------------------------------------------------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** The pieces of an MCP tool's answer, from their plain form. */
function mcpContent(given, items) {
  return envelopes(given).client({ mcpResult: { success: { content: items } } }).message.value.result.value.content;
}

/** Where a piece of output was written, as the messages carry it. */
function outputLocation(given, json) {
  return mcpContent(given, [{ text: { text: "", outputLocation: json } }])[0].content.value.outputLocation;
}

scenario("the sizes above which a tool's output goes to a file", ({ toolsFile }) => ({
  MCP_TEXT_FILE_THRESHOLD_BYTES: toolsFile.MCP_TEXT_FILE_THRESHOLD_BYTES,
  AGENT_TOOLS_FILE_WRITE_THRESHOLD_BYTES: toolsFile.AGENT_TOOLS_FILE_WRITE_THRESHOLD_BYTES,
}));

scenario("an MCP tool's text is left as it is up to the size allowed, counted in bytes, and written out one byte above", async (given) => {
  const { toolsFile } = given;
  const cases = [];
  const where = outputLocation(given, { filePath: "/work/agent-tools/out.txt", sizeBytes: "5", lineCount: "1" });
  for (const [what, texts, thresholdBytes] of [
    ["four bytes, four allowed", ["abcd"], 4],
    ["five bytes, four allowed", ["abcde"], 4],
    ["two letters of two bytes each, four allowed", ["éé"], 4],
    ["two letters of two bytes each, three allowed", ["éé"], 3],
    ["two texts and the blank line between them, six allowed", ["ab", "cd"], 6],
    ["two texts and the blank line between them, five allowed", ["ab", "cd"], 5],
    ["none allowed", ["abcde"], 0],
    ["less than none allowed", ["abcde"], -1],
    ["no number allowed", ["abcde"], Number.NaN],
    ["no end allowed", ["abcde"], Number.POSITIVE_INFINITY],
    ["empty text, one allowed", [""], 1],
    ["no text at all, one allowed", [], 1],
  ]) {
    const written = [];
    const items = mcpContent(given, texts.map((text) => ({ text: { text } })));
    const result = await toolsFile.materializeMcpTextOutput({ contentItems: items, thresholdBytes, write: async (text) => { written.push(text); return where; } });
    cases.push([what, { written, theSameListBack: result === items, result: result.map((item) => wire(item)) }]);
  }
  return cases;
});

scenario("an MCP tool's long text is written once, all its plain texts joined by a blank line, and one pointer to the file takes the place of the first", async (given) => {
  const { toolsFile } = given;
  const items = mcpContent(given, [
    { image: { data: "aW1hZ2U=", mimeType: "image/png" } },
    { text: { text: "first" } },
    { text: { text: "already in a file", outputLocation: { filePath: "/work/agent-tools/earlier.txt", sizeBytes: "17", lineCount: "1" } } },
    { text: { text: "" } },
    { text: { text: "second\nline" } },
    { image: { data: "bW9yZQ==", mimeType: "image/jpeg" } },
    { text: { text: "third" } },
  ]);
  const where = outputLocation(given, { filePath: "/work/agent-tools/new.txt", sizeBytes: "31", lineCount: "8" });
  const written = [];
  const result = await toolsFile.materializeMcpTextOutput({ contentItems: items, thresholdBytes: 10, write: async (...all) => { written.push(all); return where; } });
  return {
    written,
    result: result.map((item) => wire(item)),
    whichAreTheGivenOnes: result.map((item) => items.indexOf(item)),
    aNewList: result !== items,
    thePointerHoldsTheVeryPlaceGiven: result[1].content.value.outputLocation === where,
    theGivenListIsNotChanged: items.map((item) => item.content.case),
  };
});

scenario("when an MCP tool's long text cannot be written nothing comes back, and a failure to write is the failure", async (given) => {
  const { toolsFile } = given;
  const items = mcpContent(given, [{ text: { text: "long enough" } }]);
  const boom = new Error("disk gone");
  return {
    notWritten: await outcomeOf(() => toolsFile.materializeMcpTextOutput({ contentItems: items, thresholdBytes: 1, write: async () => undefined })),
    writingFails: await outcomeOf(() => toolsFile.materializeMcpTextOutput({ contentItems: items, thresholdBytes: 1, write: async () => { throw boom; } })),
    aPlaceThatIsNotAMessage: await outcomeOf(async () => (await toolsFile.materializeMcpTextOutput({ contentItems: items, thresholdBytes: 1, write: async () => ({ filePath: "/plain", sizeBytes: 3n, lineCount: 1n }) })).map((item) => wire(item))),
    onlyPiecesAlreadyInFiles: await outcomeOf(async () => {
      const filed = mcpContent(given, [{ text: { text: "x".repeat(50), outputLocation: { filePath: "/f" } } }, { image: { data: "aQ==", mimeType: "image/png" } }]);
      const written = [];
      const result = await toolsFile.materializeMcpTextOutput({ contentItems: filed, thresholdBytes: 1, write: async (text) => { written.push(text); return undefined; } });
      return { written, theSameListBack: result === filed };
    }),
    noPieces: classOnly(await outcomeOf(() => toolsFile.materializeMcpTextOutput({ thresholdBytes: 1, write: async () => undefined }))),
    nothing: classOnly(await outcomeOf(() => toolsFile.materializeMcpTextOutput())),
  };
});

/** A writer that writes down the request it is given and answers from the case. */
function writer(given, answer) {
  const asked = [];
  const { client } = envelopes(given);
  return {
    asked,
    execute: async (...all) => {
      const [ctx, args] = all;
      asked.push({ ctx, argumentsGiven: all.length, args: { ...wire(args), json: { ...args.toJson(), path: String(args.path).replace(UUID, "<uuid>") }, bytes: `${args.toBinary().length} bytes` } });
      return typeof answer === "function" ? answer(args) : client({ writeResult: answer }).message.value;
    },
  };
}

scenario("long output is written under agent-tools in the project folder, in a file named by a new id, and the place it was written comes back with its size and lines", async (given) => {
  const { toolsFile } = given;
  const out = [];
  const paths = [];
  for (const [what, content] of [
    ["one line", "hello"],
    ["three lines", "a\nb\nc"],
    ["a line end at the end", "a\n"],
    ["nothing", ""],
    ["letters of more than one byte", "héllo wörld ✓"],
    ["a windows line end", "a\r\nb"],
  ]) {
    const to = writer(given, (args) => { paths.push(args.path); return envelopes(given).client({ writeResult: { success: { path: `/resolved${args.path}`, linesCreated: 99, fileSize: 99 } } }).message.value; });
    const where = await toolsFile.writeToAgentToolsFile("the context", to, { content, projectDir: "/work/project", osPlatform: "linux", toolCallId: "call-7" });
    out.push([what, { asked: to.asked, where: { ...wire(where), json: { ...where.toJson(), filePath: where.filePath.replace(UUID, "<uuid>") }, bytes: undefined }, sizeBytes: where.sizeBytes, lineCount: where.lineCount }]);
  }
  return {
    out,
    aNewNameEachTime: new Set(paths).size === paths.length,
    namedByAnId: paths.every((path) => /^\/work\/project\/agent-tools\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/.test(path)),
  };
});

scenario("the file's path is joined the Windows way only for win32, whatever machine this runs on", async (given) => {
  const { toolsFile } = given;
  const out = [];
  for (const [projectDir, osPlatform] of [
    ["C:\\Users\\me\\project", "win32"],
    ["C:/Users/me/project", "win32"],
    ["C:\\Users\\me\\project", "linux"],
    ["/work/project", "darwin"],
    ["/work/project/", "linux"],
    ["/work//project/../other", "linux"],
    ["relative/dir", undefined],
    ["", "linux"],
    ["", "win32"],
    ["/work/project", "Win32"],
    ["/work/project", "windows"],
  ]) {
    const to = writer(given, { success: { path: "/anywhere" } });
    await toolsFile.writeToAgentToolsFile("the context", to, { content: "x", projectDir, osPlatform, toolCallId: "call-7" });
    out.push([projectDir, osPlatform, to.asked[0].args.json.path]);
  }
  return out;
});

scenario("long output is cut to the most a file may hold before it is written: fifty MB of text unless the caller says", async (given) => {
  const { toolsFile } = given;
  const out = [];
  const limit = 1024 * 1024 * 50;
  for (const [what, content, maxSize] of [
    ["ten letters, at most four", "abcdefghij", 4],
    ["ten letters, at most ten", "abcdefghij", 10],
    ["ten letters, at most eleven", "abcdefghij", 11],
    ["ten letters, at most none", "abcdefghij", 0],
    ["ten letters, at most minus three", "abcdefghij", -3],
    ["ten letters, no number", "abcdefghij", Number.NaN],
    ["ten letters, null for the most", "abcdefghij", null],
    ["a cut through a letter made of two halves", "a😀b", 2],
    ["lines cut off", "one\ntwo\nthree", 5],
    ["one below fifty MB", "x".repeat(limit - 1), undefined],
    ["fifty MB", "x".repeat(limit), undefined],
    ["one above fifty MB", "x".repeat(limit + 1), undefined],
    ["one above fifty MB, and more allowed", "x".repeat(limit + 1), limit + 1],
  ]) {
    let sent;
    const to = { execute: async (ctx, args) => { sent = args.fileText; return envelopes(given).client({ writeResult: { success: { path: "/anywhere" } } }).message.value; } };
    const where = await toolsFile.writeToAgentToolsFile("the context", to, { content, projectDir: "/p", osPlatform: "linux", toolCallId: "t", maxSize });
    out.push([what, { lettersSent: sent.length, sent: sent.length > 40 ? `${sent.slice(0, 3)}… (${sent.length} letters)` : sent, sizeBytes: where.sizeBytes, lineCount: where.lineCount }]);
  }
  return out;
});

scenario("when the file was not written nothing comes back, whatever the reason given", async (given) => {
  const { toolsFile } = given;
  const out = [];
  for (const answer of [
    { permissionDenied: { path: "/p/agent-tools/x.txt", error: "read only" } },
    { noSpace: { path: "/p/agent-tools/x.txt" } },
    { error: { path: "/p/agent-tools/x.txt", error: "boom" } },
    { rejected: { path: "/p/agent-tools/x.txt", reason: "no" } },
    {},
  ]) {
    const to = writer(given, answer);
    out.push([Object.keys(answer)[0] ?? "no answer inside", await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", to, { content: "x", projectDir: "/p", osPlatform: "linux", toolCallId: "t" }))]);
  }
  const boom = new Error("the writer is gone");
  out.push(["an answer of a kind not known", await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", { execute: async () => ({ result: { case: "moved", value: {} } }) }, { content: "x", projectDir: "/p", osPlatform: "linux", toolCallId: "t" }))]);
  out.push(["the writer fails", await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", { execute: async () => { throw boom; } }, { content: "x", projectDir: "/p", osPlatform: "linux", toolCallId: "t" }))]);
  out.push(["the writer answers nothing", classOnly(await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", { execute: async () => undefined }, { content: "x", projectDir: "/p", osPlatform: "linux", toolCallId: "t" })))]);
  out.push(["no content", classOnly(await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", writer(given, {}), { projectDir: "/p", osPlatform: "linux", toolCallId: "t" })))]);
  out.push(["no project folder", classOnly(await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", writer(given, {}), { content: "x", osPlatform: "linux", toolCallId: "t" })))]);
  out.push(["no details at all", classOnly(await outcomeOf(() => toolsFile.writeToAgentToolsFile("the context", writer(given, {})))) ]);
  return out;
});

scenario("the place output was written is told in two lines: the file, then its size in bytes below 1,024 and in KB to one decimal from there, and its lines", (given) => {
  const { toolsFile } = given;
  const told = (json, opts) => {
    const text = toolsFile.describeOutputLocation(outputLocation(given, json), ...(opts === undefined ? [] : [opts]));
    return [text, text.length];
  };
  return [
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "0", lineCount: "0" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1", lineCount: "1" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1023", lineCount: "12" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1024", lineCount: "12" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1025", lineCount: "12" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1075", lineCount: "12" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1076", lineCount: "12" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "1536", lineCount: "40" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "52428800", lineCount: "1000000" }),
    told({ filePath: "/work/project/agent-tools/out.txt", sizeBytes: "9007199254740993", lineCount: "9007199254740993" }),
    told({}),
    told({ filePath: "C:\\Users\\me\\out.txt", sizeBytes: "20", lineCount: "2" }, { leadText: "Search results" }),
    told({ filePath: "/f", sizeBytes: "20", lineCount: "2" }, {}),
    told({ filePath: "/f", sizeBytes: "20", lineCount: "2" }, { leadText: undefined }),
    told({ filePath: "/f", sizeBytes: "20", lineCount: "2" }, { leadText: "" }),
    told({ filePath: "/f", sizeBytes: "20", lineCount: "2" }, { leadText: null }),
    (() => { const text = toolsFile.describeOutputLocation({ filePath: "/plain", sizeBytes: 2048, lineCount: 3 }); return [text, text.length]; })(),
    classOnly(outcomeNow(() => toolsFile.describeOutputLocation(undefined))),
  ];
});

// ---------------------------------------------------------------------------------------------------------------
// A subagent that may only read (readonly-resource-accessor.ts)
// ---------------------------------------------------------------------------------------------------------------

/** An accessor below that writes down which resource it is asked for and answers with a name. */
function below(names) {
  const asked = [];
  return { asked, get: (resource) => { const name = names.get(resource) ?? "a resource not named"; asked.push(name); return `${name}, from below`; } };
}

/** The resources a read-only subagent's tools ask for, by name. */
function named(given) {
  return new Map([
    [given.write.writeExecutorResource, "write"],
    [given.del.deleteExecutorResource, "delete"],
    [given.mcp.mcpExecutorResource, "mcp"],
    [given.shell.shellExecutorResource, "shell"],
    [given.shellStream.shellStreamExecutorResource, "shell stream"],
    [given.backgroundShell.backgroundShellExecutorResource, "background shell"],
    [given.backgroundShell.writeBackgroundShellInputExecutorResource, "background shell input"],
    [given.read.readExecutorResource, "read"],
    [given.ls.lsExecutorResource, "ls"],
    [given.mcp.listMcpResourcesExecutorResource, "list mcp resources"],
    [given.mcp.readMcpResourceExecutorResource, "read mcp resource"],
    [given.subagent.subagentExecutorResource, "subagent"],
  ]);
}

scenario("a read-only subagent's writes, deletes, MCP calls and shells are answered here with a refusal; everything else is asked of the accessor below", (given) => {
  const names = named(given);
  const out = {};
  for (const wrapShell of [true, false]) {
    const base = below(names);
    const accessor = given.readonly.createReadonlyResourceAccessor(base, wrapShell);
    const got = [...names].map(([resource, name]) => {
      const implementation = accessor.get(resource);
      return [name, typeof implementation === "string" ? implementation : `answered here${accessor.get(resource) === implementation ? ", by the same executor each time" : ""}`];
    });
    out[wrapShell ? "shells refused too" : "shells allowed"] = { got, askedBelow: base.asked, isALayeredAccessor: accessor instanceof given.resources.CombinedResourceAccessor };
  }
  const base = below(names);
  out["anything but false for the shells"] = [undefined, 1, "", null].map((wrapShell) => typeof given.readonly.createReadonlyResourceAccessor(base, wrapShell).get(given.shell.shellExecutorResource));
  out["each accessor has executors of its own"] = given.readonly.createReadonlyResourceAccessor(base, true).get(given.write.writeExecutorResource) !== given.readonly.createReadonlyResourceAccessor(base, true).get(given.write.writeExecutorResource);
  return out;
});

scenario("what a read-only subagent is told when it tries to write, delete, call an MCP tool or run a shell", async (given) => {
  const accessor = given.readonly.createReadonlyResourceAccessor(below(named(given)), true);
  const { server } = envelopes(given);
  const told = async (resource, args) => {
    const all = [];
    const answer = accessor.get(resource).execute("the context", args, { execId: "ignored" });
    if (typeof answer[Symbol.asyncIterator] === "function") for await (const event of answer) all.push(wire(event));
    else all.push(wire(await answer));
    return all;
  };
  const shellArgs = server({ shellArgs: { command: "rm -rf build", workingDirectory: "/work", toolCallId: "call-1" } }).message.value;
  const out = {
    write: await told(given.write.writeExecutorResource, server({ writeArgs: { path: "/work/a.txt", fileText: "x" } }).message.value),
    delete: await told(given.del.deleteExecutorResource, server({ deleteArgs: { path: "/work/a.txt" } }).message.value),
    mcp: await told(given.mcp.mcpExecutorResource, server({ mcpArgs: { name: "docs-search", toolName: "search", providerIdentifier: "docs" } }).message.value),
    shell: await told(given.shell.shellExecutorResource, shellArgs),
    shellStream: await told(given.shellStream.shellStreamExecutorResource, shellArgs),
    backgroundShell: await told(given.backgroundShell.backgroundShellExecutorResource, server({ backgroundShellSpawnArgs: { command: "npm run dev", workingDirectory: "/work" } }).message.value),
  };
  const words = accessor.get(given.write.writeExecutorResource);
  const refusal = (await words.execute("the context", { path: "/p" })).result.value.error;
  return { ...out, theWords: [refusal, refusal.length] };
});

scenario("a read-only refusal is made from whatever the request holds: a missing command, folder or path is left empty, a missing tool name is written as it is", async (given) => {
  const accessor = given.readonly.createReadonlyResourceAccessor(below(named(given)), true);
  const one = async (resource, args) => {
    const answer = accessor.get(resource).execute(undefined, args);
    if (typeof answer[Symbol.asyncIterator] === "function") { const all = []; for await (const event of answer) all.push(wire(event)); return all; }
    return wire(await answer);
  };
  const refused = async (resource, args) => classOnly(await outcomeOf(() => one(resource, args)));
  return {
    shellWithNothing: await refused(given.shell.shellExecutorResource, {}),
    shellWithOnlyACommand: await refused(given.shell.shellExecutorResource, { command: "ls" }),
    shellWithOnlyAFolder: await refused(given.shell.shellExecutorResource, { workingDirectory: "/w" }),
    shellStreamWithNothing: await refused(given.shellStream.shellStreamExecutorResource, {}),
    backgroundShellWithNothing: await refused(given.backgroundShell.backgroundShellExecutorResource, {}),
    writeWithNoPath: await refused(given.write.writeExecutorResource, {}),
    deleteWithNoPath: await refused(given.del.deleteExecutorResource, {}),
    mcpWithNoName: await refused(given.mcp.mcpExecutorResource, {}),
    mcpWithAnEmptyName: await refused(given.mcp.mcpExecutorResource, { name: "" }),
    noRequestAtAll: [
      await refused(given.shell.shellExecutorResource, undefined),
      await refused(given.shellStream.shellStreamExecutorResource, undefined),
      await refused(given.backgroundShell.backgroundShellExecutorResource, undefined),
      await refused(given.write.writeExecutorResource, undefined),
      await refused(given.del.deleteExecutorResource, undefined),
      await refused(given.mcp.mcpExecutorResource, undefined),
    ],
    aNewAnswerEachTime: (await accessor.get(given.write.writeExecutorResource).execute(undefined, { path: "/p" })) !== (await accessor.get(given.write.writeExecutorResource).execute(undefined, { path: "/p" })),
    theShellStreamSaysOneThingAndEnds: await (async () => {
      const stream = accessor.get(given.shellStream.shellStreamExecutorResource).execute(undefined, { command: "ls" })[Symbol.asyncIterator]();
      const first = await stream.next();
      const second = await stream.next();
      return [first.done, first.value.event.case, second.done, second.value];
    })(),
  };
});

// ---------------------------------------------------------------------------------------------------------------
// Running a subagent for a tool call (subagent.ts)
// ---------------------------------------------------------------------------------------------------------------

scenario("what the model is told about a subagent that is still running", ({ subagent }) => [
  [subagent.RUNNING_SUBAGENT_FOLLOWUP_ERROR, subagent.RUNNING_SUBAGENT_FOLLOWUP_ERROR.length],
  [subagent.RUNNING_SUBAGENT_INTERRUPT_RETRY_HINT, subagent.RUNNING_SUBAGENT_INTERRUPT_RETRY_HINT.length],
]);

/** A subagent's host that writes down what it is asked and answers from the case. */
function subagentHost(log, { session = async () => "agent-1", run = async () => ({ status: "success", finalMessage: "done" }), release } = {}) {
  const host = {
    async createOrResumeSession(ctx, args) {
      log.push(["host", "createOrResumeSession", { ctx, toolCallId: args.toolCallId }]);
      return session(ctx, args);
    },
    async runSession(ctx, agentId, args, options, ...more) {
      log.push(["host", "runSession", { ctx, agentId, toolCallId: args.toolCallId, options, optionKeys: Object.keys(options), moreArguments: more.length }]);
      return run(ctx, agentId, args, options);
    },
  };
  if (release !== undefined) host.releaseSession = (...all) => { log.push(["host", "releaseSession", ...all]); return release(...all); };
  return host;
}

/** A subagent request, from its plain form. */
const subagentArgs = (given, json) => envelopes(given).server({ subagentArgs: json }).message.value;

scenario("a subagent's run becomes the tool's answer: a success with its last message and tool calls, or an error with the agent's id", async (given) => {
  const out = [];
  for (const [what, outcome] of [
    ["success", { status: "success", finalMessage: "All done.", toolCallCount: 4 }],
    ["success with nothing else", { status: "success" }],
    ["success with no tool calls counted", { status: "success", finalMessage: "", toolCallCount: undefined }],
    ["success, and what only a background run has is left out", { status: "success", finalMessage: "m", toolCallCount: 1, backgroundReason: 1, transcriptPath: "/t.jsonl", error: "left out" }],
    ["a status not known is a success", { status: "paused", finalMessage: "m", toolCallCount: 2 }],
    ["no status is a success", { finalMessage: "m" }],
    ["error", { status: "error", error: "The model refused." }],
    ["error with no words", { status: "error" }],
    ["error, and its last message is left out", { status: "error", error: "e", finalMessage: "left out", toolCallCount: 9 }],
    ["aborted", { status: "aborted" }],
    ["aborted with words", { status: "aborted", error: "Stopped by the parent." }],
    ["aborted with empty words", { status: "aborted", error: "" }],
    ["background", { status: "background", finalMessage: "Still going.", toolCallCount: 3, backgroundReason: 2, transcriptPath: "/work/agent-1.jsonl" }],
    ["background with nothing else", { status: "background" }],
    ["background with zero for a reason", { status: "background", backgroundReason: 0, transcriptPath: "" }],
  ]) {
    const log = [];
    const executor = given.subagent.createSubagentExecutor(subagentHost(log, { run: async () => outcome, release: () => {} }));
    const answer = await executor.execute("the context", subagentArgs(given, { subagentType: "explore", prompt: "look" }), { execId: "exec-9", hookContextCollector: [] });
    out.push([what, wire(answer), log]);
  }
  return out;
});

scenario("the subagent's host is given the caller's context, the request itself and only the run's id from the options", async (given) => {
  const log = [];
  const seen = [];
  const host = subagentHost(log, { run: async (ctx, agentId, args) => { seen.push(args); return { status: "success" }; } });
  const executor = given.subagent.createSubagentExecutor(host);
  const args = subagentArgs(given, { toolCallId: "", prompt: "p" });
  await executor.execute("the context", args, { execId: "exec-1", hookContextCollector: [], deliverAgentStoreConflictNotices: true });
  await executor.execute("another context", args);
  await executor.execute("a third", args, {});
  return { log, theRequestItself: seen.every((got) => got === args), whatTheExecutorHas: Object.keys(executor) };
});

scenario("a subagent that fails is an error answer, never a failure: with the agent's id when there is one, the failure's, or the one being resumed", async (given) => {
  const out = [];
  const withId = Object.assign(new Error("lost the agent"), { agentId: "agent-from-error" });
  for (const [what, host, json] of [
    ["the run fails", { run: async () => { throw new Error("run blew up"); }, release: () => {} }, {}],
    ["the run fails and there is nothing to let go with", { run: async () => { throw new Error("run blew up"); } }, {}],
    ["the run fails with words only", { run: async () => { throw "just words"; }, release: () => {} }, {}],
    ["the session cannot be made", { session: async () => { throw new Error("no session"); }, release: () => {} }, {}],
    ["the session cannot be made, while resuming", { session: async () => { throw new Error("no session"); }, release: () => {} }, { resumeAgentId: "agent-resumed" }],
    ["the session cannot be made, while resuming nothing", { session: async () => { throw new Error("no session"); }, release: () => {} }, { resumeAgentId: "" }],
    ["the session cannot be made, and the failure names an agent", { session: async () => { throw withId; }, release: () => {} }, { resumeAgentId: "agent-resumed" }],
    ["the failure names an agent, but the session had its own", { run: async () => { throw withId; }, release: () => {} }, { resumeAgentId: "agent-resumed" }],
    ["a plain object that names an agent", { session: async () => { throw { agentId: "agent-from-object", message: "not read" }; } }, {}],
    ["a plain object whose agent is not text", { session: async () => { throw { agentId: 12 }; } }, { resumeAgentId: "agent-resumed" }],
    ["a plain object that names an empty agent", { session: async () => { throw { agentId: "" }; } }, { resumeAgentId: "agent-resumed" }],
    ["null is thrown", { session: async () => { throw null; } }, { resumeAgentId: "agent-resumed" }],
    ["nothing is thrown", { session: async () => { throw undefined; } }, {}],
    ["a number is thrown", { session: async () => { throw 404; } }, {}],
    ["a function that names an agent is thrown", { session: async () => { throw Object.assign(() => {}, { agentId: "agent-from-function" }); } }, {}],
    ["an error with empty words", { session: async () => { throw new Error(""); } }, {}],
    ["the session's id is empty and the run fails", { session: async () => "", run: async () => { throw new Error("no id"); }, release: () => {} }, { resumeAgentId: "agent-resumed" }],
  ]) {
    const log = [];
    const executor = given.subagent.createSubagentExecutor(subagentHost(log, host));
    const answer = await outcomeOf(() => executor.execute("the context", subagentArgs(given, { subagentType: "explore", ...json }), undefined));
    out.push([what, answer.threw === undefined ? wire(answer.answered) : answer, log.filter(([, did]) => did === "releaseSession")]);
  }
  return out;
});

scenario("a subagent's host that fails as it is asked, not later, is an error answer all the same", async (given) => {
  const released = [];
  const atOnce = { createOrResumeSession() { throw new Error("no session, at once"); }, releaseSession: (id) => { released.push(id); } };
  const duringTheRun = { createOrResumeSession: () => "agent-1", runSession() { throw new Error("no run, at once"); }, releaseSession: (id) => { released.push(id); } };
  const notAPromise = { createOrResumeSession: () => "agent-2", runSession: () => ({ status: "success", finalMessage: "answered without waiting" }) };
  const answers = [];
  for (const host of [atOnce, duringTheRun, notAPromise]) answers.push(wire(await given.subagent.createSubagentExecutor(host).execute("the context", subagentArgs(given, {}))));
  return { answers, released, noHost: classOnly(outcomeNow(() => given.subagent.createSubagentExecutor(undefined))), aHostOfNothing: wire(await given.subagent.createSubagentExecutor({}).execute("the context", subagentArgs(given, {}))).json.error === undefined ? "no error" : "an error answer" };
});

scenario("when letting go of a failed subagent's session itself fails, that failure is the tool's", async (given) => {
  const log = [];
  const executor = given.subagent.createSubagentExecutor(subagentHost(log, { run: async () => { throw new Error("run blew up"); }, release: () => { throw new Error("cannot let go"); } }));
  const unkeyed = await outcomeOf(() => executor.execute("the context", subagentArgs(given, {})));
  const keyed = await outcomeOf(() => executor.execute("the context", subagentArgs(given, { toolCallId: "call-1", parentConversationId: "conv-1" })));
  const again = await outcomeOf(() => executor.execute("the context", subagentArgs(given, { toolCallId: "call-1", parentConversationId: "conv-1" })));
  return { unkeyed, keyed, again, hostAskedToRun: log.filter(([, did]) => did === "runSession").length };
});

scenario("one tool call of one conversation runs its subagent once: a second asking while it runs gets the same promise, and after a success the same answer", async (given) => {
  const log = [];
  const gate = deferred();
  const executor = given.subagent.createSubagentExecutor(subagentHost(log, { run: async (ctx, agentId, args) => { await gate.promise; return { status: "success", finalMessage: `ran ${args.toolCallId}` }; } }));
  const args = () => subagentArgs(given, { toolCallId: "call-1", parentConversationId: "conv-1", prompt: "p" });
  const first = executor.execute("the context", args(), { execId: "exec-1" });
  const second = executor.execute("another context", args(), { execId: "exec-2" });
  const whileRunning = { samePromise: first === second, hostAskedToRun: log.filter(([, did]) => did === "createOrResumeSession").length };
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  const third = executor.execute("a third context", args(), { execId: "exec-3" });
  const c = await third;
  return {
    whileRunning,
    sameAnswer: [a === b, a === c],
    afterwardsAPromiseOfItsOwn: third !== first && third instanceof Promise,
    answer: wire(a),
    log,
  };
});

scenario("what makes two subagent requests the same tool call: the conversation, the call, the agent resumed and the agent forked from", async (given) => {
  const runs = [];
  const executor = given.subagent.createSubagentExecutor(subagentHost([], { run: async (ctx, agentId, args) => { runs.push(args.prompt); return { status: "success", finalMessage: args.prompt }; } }));
  const ask = async (json) => (await executor.execute("the context", subagentArgs(given, json))).result.value.finalMessage;
  const base = { toolCallId: "call-1", parentConversationId: "conv-1" };
  return {
    answers: [
      await ask({ ...base, prompt: "1 the first" }),
      await ask({ ...base, prompt: "2 the same again, with other words" }),
      await ask({ ...base, subagentType: "explore", modelId: "m", readonly: true, prompt: "3 other details, same call" }),
      await ask({ ...base, toolCallId: "call-2", prompt: "4 another call" }),
      await ask({ ...base, parentConversationId: "conv-2", prompt: "5 another conversation" }),
      await ask({ ...base, resumeAgentId: "agent-9", prompt: "6 resuming an agent" }),
      await ask({ ...base, resumeAgentId: "agent-9", prompt: "7 resuming it again" }),
      await ask({ ...base, forkAgentId: "agent-9", prompt: "8 forking from that agent" }),
      await ask({ ...base, resumeAgentId: "", forkAgentId: "", prompt: "9 empty ids are no ids" }),
      await ask({ ...base, resumeAgentId: "a", forkAgentId: "b", prompt: "10 both" }),
      await ask({ ...base, resumeAgentId: "a\u0000b", prompt: "11 an id that holds the separator" }),
      await ask({ ...base, resumeAgentId: "a", forkAgentId: "b", prompt: "12 both again" }),
      await ask({ toolCallId: "call-1", prompt: "13 no conversation: always run" }),
      await ask({ toolCallId: "call-1", prompt: "14 no conversation again" }),
      await ask({ parentConversationId: "conv-1", prompt: "15 no call: always run" }),
      await ask({ parentConversationId: "conv-1", prompt: "16 no call again" }),
      await ask({ toolCallId: "call-1", parentConversationId: "", prompt: "17 an empty conversation: always run" }),
      await ask({ prompt: "18 neither" }),
    ],
    runs,
  };
});

scenario("a subagent that ended in an error or a failure is run again when its tool call asks again", async (given) => {
  const log = [];
  const outcomes = [{ status: "error", error: "first try failed" }, { status: "aborted" }, new Error("third try blew up"), { status: "background", finalMessage: "in the background", backgroundReason: 1 }, { status: "success", finalMessage: "never reached" }];
  const executor = given.subagent.createSubagentExecutor(subagentHost(log, { run: async () => { const next = outcomes.shift(); if (next instanceof Error) throw next; return next; } }));
  const args = () => subagentArgs(given, { toolCallId: "call-1", parentConversationId: "conv-1" });
  const answers = [];
  for (let attempt = 0; attempt < 6; attempt += 1) answers.push(wire(await executor.execute("the context", args())));
  return { answers, hostAskedToRun: log.filter(([, did]) => did === "runSession").length, outcomesNeverUsed: outcomes.length };
});

scenario("a tool call that asks again while its failing subagent still runs gets that run's answer, and the next asking runs anew", async (given) => {
  const log = [];
  const gate = deferred();
  let runs = 0;
  const executor = given.subagent.createSubagentExecutor(subagentHost(log, { run: async () => { runs += 1; const run = runs; await gate.promise; return { status: "error", error: `run ${run} failed` }; } }));
  const args = () => subagentArgs(given, { toolCallId: "call-1", parentConversationId: "conv-1" });
  const first = executor.execute("the context", args());
  const second = executor.execute("the context", args());
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  const third = await executor.execute("the context", args());
  return { samePromise: first === second, sameAnswer: a === b, first: a.result.value.error, third: third.result.value.error, runs };
});

scenario("the answers of a thousand tool calls are kept: the next one pushes out the oldest, whose call then runs again", async (given) => {
  let runs = 0;
  const executor = given.subagent.createSubagentExecutor(subagentHost([], { run: async () => { runs += 1; return { status: "success", finalMessage: `run ${runs}` }; } }));
  const ask = async (call) => (await executor.execute("the context", subagentArgs(given, { toolCallId: `call-${call}`, parentConversationId: "conv-1" }))).result.value.finalMessage;
  for (let call = 1; call <= 1_000; call += 1) await ask(call);
  const atAThousand = { runs, theFirstAgain: await ask(1), theLastAgain: await ask(1_000), runsAfter: runs };
  const oneMore = await ask(1_001);
  const afterOneMore = { oneMore, theSecondIsStillKept: await ask(2), runsBefore: runs, theFirstRunsAgain: await ask(1), runsAfter: runs };
  // The first call's new answer was the thousand-and-first kept, which pushed out the second.
  const then = { theSecondRunsAgain: await ask(2), theThirdRunsAgain: await ask(3), theFourthToo: await ask(4), aLateOneIsStillKept: await ask(1_000), runs };
  return { atAThousand, afterOneMore, then };
});

// ---------------------------------------------------------------------------------------------------------------
// The asking side: a request sent to the side that does the work, and its answer read back (remote.ts)
// ---------------------------------------------------------------------------------------------------------------

/** A shell request and what goes with it on the asking side: the executor under test over a connection. */
function asking(given, desk, { numbers, steps } = {}) {
  const { remote, serialization } = given;
  const to = connection(desk, { numbers, steps });
  const executor = new remote.ExecutorResource(to, serialization.createServerSerializer("shellArgs"), serialization.createClientDeserializer("shellResult"));
  const args = desk.server({ shellArgs: { command: "ls -la", workingDirectory: "/work", toolCallId: "call-1" } }).message.value;
  return { to, executor, args };
}

/** A shell's answer, an answer to another request, and an envelope with notes only. */
const answers = (desk) => ({
  shell: (stdout = "a\n", notes = []) => desk.client({ id: 7, shellResult: { success: { command: "ls -la", stdout } }, hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }),
  other: (notes = []) => desk.client({ id: 7, writeResult: { success: { path: "/work/a.txt" } }, hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }),
  notesOnly: (notes) => desk.client({ id: 7, hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }),
});

scenario("a request is sent under a span of its own with the span's ids on the message, and the first answer of its kind is the result", async (given) => {
  const desk = makeDesk(given);
  const reply = answers(desk);
  const result = reply.shell();
  const { executor, args, to } = asking(given, desk, { steps: [result] });
  const outcome = await traced(tracing(desk.log), () => overheard(desk.log, async () => {
    const value = await executor.execute(desk.ctx, args, { execId: "exec-1" });
    desk.log.push(["the caller", "has the result", wire(value)]);
    await settle();
    return { theAnswerItself: value === result.message.value, theRequestItselfWasSent: to.made[0].message.value === args };
  }));
  return { outcome, log: desk.log };
});

scenario("what the message says about the run's id, the notes it will take and the span, option by option", async (given) => {
  const out = [];
  for (const [what, options, spans] of [
    ["no options, no tracer", undefined, null],
    ["empty options, no tracer", {}, null],
    ["a run id", { execId: "exec-1" }, undefined],
    ["an empty run id", { execId: "" }, undefined],
    ["a run id of nothing", { execId: undefined }, undefined],
    ["a list for notes", { hookContextCollector: [] }, undefined],
    ["notices asked for but no list", { deliverAgentStoreConflictNotices: true, enableAgentStoreConflictNotices: true }, undefined],
    ["a span not to be sampled", {}, () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 0 })],
    ["a span with a state", {}, () => ({ traceId: TRACE_ID, spanId: "b7ad6b7169203331", traceFlags: 1, traceState: { toString: () => "vendor=1" } })],
    ["a span that cannot say what it is known by", { execId: "exec-1" }, () => { throw new Error("no span context"); }],
  ]) {
    const desk = makeDesk(given);
    const { executor, args, to } = asking(given, desk, { steps: [answers(desk).shell()] });
    const run = () => executor.execute(desk.ctx, args, options);
    await (spans === null ? run() : traced(tracing(desk.log, spans), run));
    out.push([what, wire(to.made[0]), desk.log.filter(([who, did]) => who.startsWith("span") && did === "setAttribute")]);
  }
  return out;
});

scenario("the number on the message is the one the request was wrapped with, however often the connection asks for the message", async (given) => {
  const desk = makeDesk(given);
  const { remote } = given;
  const wrapped = [];
  const wrap = (id, args) => { wrapped.push([id, args]); return desk.server({ id: id + 100, lsArgs: { path: `/asked-${id}` } }); };
  const to = connection(desk, { numbers: [1, 2, 2], steps: [desk.client({ lsResult: { error: { path: "/", error: "e" } } })] });
  const executor = new remote.ExecutorResource(to, wrap, (message) => (message.message.case === "lsResult" ? "the answer" : undefined));
  const value = await executor.execute(desk.ctx, "the request, of any kind", { execId: "exec-1" });
  const none = connection(desk, { numbers: [], steps: [desk.client({ lsResult: {} })] });
  const unasked = await new remote.ExecutorResource(none, wrap, () => "an answer without a message made").execute(desk.ctx, "never wrapped");
  return { value, unasked, wrapped, sent: to.made.map((message) => wire(message)), eachANewMessage: new Set(to.made).size === to.made.length };
});

scenario("answers of another kind are passed over until the result comes; notes on any of them go to the caller's list and are counted, and those that come after the result too", async (given) => {
  const desk = makeDesk(given);
  const reply = answers(desk);
  const later = deferred();
  const { executor, args } = asking(given, desk, {
    steps: [
      reply.other([["postToolUse", "note on another answer"]]),
      reply.notesOnly([["preToolUse", "first of two"], ["agentStoreConflict", "second of two"]]),
      reply.notesOnly([]),
      reply.shell("the result\n", [["postToolUse", "note on the result"]]),
      { waitsFor: later.promise },
      reply.shell("a second result, not looked at\n", [["stop", "note after the result"]]),
      reply.notesOnly([["", "a note with no hook name"]]),
    ],
  });
  const collected = [];
  const outcome = await traced(tracing(desk.log), () => overheard(desk.log, async () => {
    const value = await executor.execute(desk.ctx, args, { hookContextCollector: collected });
    desk.log.push(["the caller", "has the result", wire(value), { notesSoFar: collected.length }]);
    later.resolve();
    await settle();
    return { notes: collected.map((note) => wire(note)) };
  }));
  return { outcome, log: desk.log };
});

scenario("with no list for notes, notes are neither kept nor counted", async (given) => {
  const out = [];
  for (const options of [undefined, {}, { deliverAgentStoreConflictNotices: true }]) {
    const desk = makeDesk(given);
    const reply = answers(desk);
    const { executor, args } = asking(given, desk, { steps: [reply.notesOnly([["postToolUse", "dropped"]]), reply.shell("r", [["postToolUse", "dropped too"]]), reply.notesOnly([["stop", "and this"]])] });
    await executor.execute(desk.ctx, args, options);
    await settle();
    out.push(desk.log.filter(([who]) => who === "metrics"));
  }
  return out;
});

scenario("a connection that ends before any answer, or before the result, fails the request, and the span is ended", async (given) => {
  const out = [];
  for (const [what, steps] of [
    ["ends at once", () => []],
    ["ends after an answer of another kind", (reply) => [reply.other([["postToolUse", "kept all the same"]])]],
    ["ends after two", (reply) => [reply.other(), reply.notesOnly([])]],
  ]) {
    const desk = makeDesk(given);
    const { executor, args } = asking(given, desk, { steps: steps(answers(desk)) });
    const collected = [];
    const outcome = await traced(tracing(desk.log), () => outcomeOf(() => executor.execute(desk.ctx, args, { execId: "exec-1", hookContextCollector: collected })));
    await settle();
    out.push([what, outcome, { notes: collected.length }, desk.log]);
  }
  return out;
});

scenario("a connection that fails before the result fails the request with its own failure, and nothing more is asked of it", async (given) => {
  const out = [];
  for (const [what, steps] of [
    ["on the first answer", (reply, boom) => [{ fails: boom }, reply.shell()]],
    ["on the second", (reply, boom) => [reply.other(), { fails: boom }, reply.shell()]],
  ]) {
    const desk = makeDesk(given);
    const boom = new Error("connection reset");
    const { executor, args } = asking(given, desk, { steps: steps(answers(desk), boom) });
    const outcome = await traced(tracing(desk.log), () => overheard(desk.log, () => outcomeOf(() => executor.execute(desk.ctx, args))));
    await settle();
    out.push([what, { itsOwnFailure: outcome.threw === boom }, desk.log]);
  }
  const desk = makeDesk(given);
  const cannot = new Error("cannot connect");
  const refusing = { createExecInstance() { throw cannot; } };
  const asked = outcomeNow(() => new given.remote.ExecutorResource(refusing, given.serialization.createServerSerializer("shellArgs"), given.serialization.createClientDeserializer("shellResult")).execute(desk.ctx, {}));
  const refused = await traced(tracing(desk.log), () => outcomeOf(() => new given.remote.ExecutorResource(refusing, given.serialization.createServerSerializer("shellArgs"), given.serialization.createClientDeserializer("shellResult")).execute(desk.ctx, {})));
  out.push(["the connection cannot be made", { itsOwnFailure: refused.threw === cannot, aFailedPromiseNotAFailureAtOnce: asked.answered instanceof Promise && (await outcomeOf(() => asked.answered)).threw === cannot }, desk.log]);
  return out;
});

scenario("a connection that fails after the result is only overheard: the result stands, and the failure is said once on the console", async (given) => {
  const desk = makeDesk(given);
  const reply = answers(desk);
  const later = deferred();
  const boom = new Error("stream closed");
  const { executor, args } = asking(given, desk, { steps: [reply.shell(), { waitsFor: later.promise }, reply.notesOnly([["postToolUse", "kept before the failure"]]), { fails: boom }, reply.notesOnly([["postToolUse", "never read"]])] });
  const collected = [];
  const outcome = await unhandled(() => traced(tracing(desk.log), () => overheard(desk.log, async () => {
    const value = await executor.execute(desk.ctx, args, { hookContextCollector: collected });
    desk.log.push(["the caller", "has the result", value.result.case]);
    later.resolve();
    await settle();
    const said = desk.log.find(([who]) => who === "console.info");
    return { notes: collected.map((note) => note.content), theFailureItselfIsSaid: said[2].error === boom, whatIsSaidHolds: Object.keys(said[2]) };
  })));
  return { outcome, log: desk.log };
});

scenario("a console that fails as the late failure is said fails nothing", async (given) => {
  const desk = makeDesk(given);
  const later = deferred();
  const { executor, args } = asking(given, desk, { steps: [answers(desk).shell(), { waitsFor: later.promise }, { fails: new Error("stream closed") }] });
  const real = console.info;
  const said = [];
  console.info = (...words) => { said.push(words[0]); throw new Error("the console is closed"); };
  try {
    return await unhandled(async () => {
      const value = await executor.execute(desk.ctx, args);
      later.resolve();
      await settle();
      return { result: value.result.case, said };
    });
  } finally {
    console.info = real;
  }
});

scenario("a connection that never ends after the result is left open, and the request is over all the same", async (given) => {
  const desk = makeDesk(given);
  const { executor, args } = asking(given, desk, { steps: [answers(desk).shell(), { never: true }] });
  const outcome = await traced(tracing(desk.log), async () => {
    const value = await executor.execute(desk.ctx, args);
    desk.log.push(["the caller", "has the result", value.result.case]);
    await settle();
    return "done";
  });
  return { outcome, log: desk.log };
});

scenario("a failure in wrapping the request or in reading an answer is the request's failure", async (given) => {
  const { remote, serialization } = given;
  const out = [];
  const cases = [
    ["wrapping fails", () => { throw new Error("cannot wrap"); }, serialization.createClientDeserializer("shellResult"), ["metrics", "connection", "the answers"]],
    ["reading the first answer fails", serialization.createServerSerializer("shellArgs"), () => { throw new Error("cannot read"); }, ["the answers"]],
    ["reading a later answer fails", serialization.createServerSerializer("shellArgs"), (() => { let read = 0; return () => { read += 1; if (read === 2) throw new Error("cannot read the second"); return undefined; }; })(), ["the answers"]],
  ];
  for (const [what, wrap, read, keep] of cases) {
    const desk = makeDesk(given);
    const reply = answers(desk);
    const to = connection(desk, { steps: [reply.other(), reply.shell(), reply.shell()] });
    const outcome = await traced(tracing(desk.log), () => outcomeOf(() => new remote.ExecutorResource(to, wrap, read).execute(desk.ctx, desk.server({ shellArgs: {} }).message.value)));
    await settle();
    out.push([what, outcome, desk.log.filter(([who, did]) => keep.includes(who) || did === "end").map(([who, did]) => [who, did])]);
  }
  return out;
});

scenario("a request with nothing to make its context from fails as a failed promise", async (given) => {
  const desk = makeDesk(given);
  const { executor, args } = asking(given, desk, { steps: [answers(desk).shell()] });
  return [classOnly(await outcomeOf(() => executor.execute(undefined, args))), classOnly(await outcomeOf(() => executor.execute(desk.ctx.withName("named already"), undefined).then((value) => value.result.case)))];
});

/** The stream of a shell over a connection: the executor under test. */
function askingForAStream(given, desk, { numbers, steps } = {}) {
  const { remote, serialization } = given;
  const to = connection(desk, { numbers, steps });
  const executor = new remote.StreamExecutorResource(to, serialization.createServerSerializer("shellStreamArgs"), serialization.createClientDeserializer("shellStream"));
  const args = desk.server({ shellStreamArgs: { command: "npm test", workingDirectory: "/work" } }).message.value;
  return { to, executor, args };
}

/** Events of a shell's stream, and envelopes that are not. */
const events = (desk) => ({
  stdout: (data, notes = []) => desk.client({ id: 7, shellStream: { stdout: { data } }, hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }),
  exit: (code = 0) => desk.client({ id: 7, shellStream: { exit: { code, cwd: "/work" } } }),
  other: (notes = []) => desk.client({ id: 7, shellResult: { success: {} }, hookAdditionalContexts: notes.map(([hookEventName, content]) => ({ hookEventName, content })) }),
});

scenario("a streamed request is sent when its stream is first read, under a span that lasts until the stream is over, and every answer of its kind is handed on in order", async (given) => {
  const desk = makeDesk(given);
  const event = events(desk);
  const steps = [event.stdout("one\n", [["postToolUse", "note on an event"]]), event.other([["stop", "note on an answer of another kind"]]), event.stdout("two\n"), event.exit(0)];
  const { executor, args, to } = askingForAStream(given, desk, { steps });
  const collected = [];
  const outcome = await traced(tracing(desk.log), async () => {
    const stream = executor.execute(desk.ctx, args, { execId: "exec-1", hookContextCollector: collected });
    desk.log.push(["the caller", "has the stream, unread"]);
    const got = [];
    for await (const value of stream) {
      desk.log.push(["the caller", "reads", wire(value)]);
      got.push(value);
    }
    desk.log.push(["the caller", "sees the end"]);
    return {
      theEventsThemselves: got.every((value, at) => value === [steps[0], steps[2], steps[3]][at].message.value),
      theRequestItselfWasSent: to.made[0].message.value === args,
      notes: collected.map((note) => wire(note)),
      notesAreNotCounted: desk.log.filter(([who]) => who === "metrics").length,
    };
  });
  return { outcome, log: desk.log };
});

scenario("what a streamed request's message says about the run's id, the notes it will take and the span, option by option", async (given) => {
  const out = [];
  for (const [what, options, spans] of [
    ["no options, no tracer", undefined, null],
    ["empty options", {}, undefined],
    ["a run id", { execId: "exec-1" }, undefined],
    ["a list for notes", { hookContextCollector: [] }, undefined],
    ["notices asked for", { deliverAgentStoreConflictNotices: true }, undefined],
    ["notices asked for, by another word", { deliverAgentStoreConflictNotices: 1 }, undefined],
    ["notices refused, with a list", { deliverAgentStoreConflictNotices: false, hookContextCollector: [] }, undefined],
    ["notices switched on elsewhere only", { enableAgentStoreConflictNotices: true }, undefined],
    ["a span that cannot say what it is known by", {}, () => { throw new Error("no span context"); }],
  ]) {
    const desk = makeDesk(given);
    const { executor, args, to } = askingForAStream(given, desk, { steps: [] });
    const run = async () => { for await (const value of executor.execute(desk.ctx, args, options)) desk.log.push(["read", value]); };
    await (spans === null ? run() : traced(tracing(desk.log, spans), run));
    out.push([what, wire(to.made[0]), desk.log.filter(([who, did]) => who.startsWith("span") && did === "setAttribute")]);
  }
  return out;
});

scenario("with no list for notes a stream's notes are dropped; an empty stream ends at once", async (given) => {
  const desk = makeDesk(given);
  const event = events(desk);
  const { executor, args } = askingForAStream(given, desk, { steps: [event.stdout("one\n", [["postToolUse", "dropped"]])] });
  const got = [];
  for await (const value of executor.execute(desk.ctx, args, { deliverAgentStoreConflictNotices: true })) got.push(value.event.case);
  const empty = askingForAStream(given, desk, { steps: [] });
  const none = [];
  for await (const value of empty.executor.execute(desk.ctx, empty.args)) none.push(value);
  return { got, none };
});

scenario("a caller that stops reading a stream tells the connection to stop, and the span is ended then", async (given) => {
  const desk = makeDesk(given);
  const event = events(desk);
  const { executor, args } = askingForAStream(given, desk, { steps: [event.stdout("one\n"), event.stdout("two\n"), event.exit(0)] });
  await traced(tracing(desk.log), async () => {
    for await (const value of executor.execute(desk.ctx, args)) {
      desk.log.push(["the caller", "reads and stops", value.event.case]);
      break;
    }
    desk.log.push(["the caller", "has stopped"]);
    await settle();
  });
  const unread = askingForAStream(given, desk, { steps: [event.exit(0)] });
  const stream = unread.executor.execute(desk.ctx, unread.args)[Symbol.asyncIterator]();
  const stopped = await stream.return("never read");
  return { log: desk.log, aStreamNeverRead: { stopped, messagesMade: unread.to.made.length } };
});

scenario("a connection that fails in the middle of a stream fails the reading with its own failure, after the events before it", async (given) => {
  const desk = makeDesk(given);
  const event = events(desk);
  const boom = new Error("connection reset");
  const { executor, args } = askingForAStream(given, desk, { steps: [event.stdout("one\n"), { fails: boom }, event.exit(0)] });
  const outcome = await traced(tracing(desk.log), async () => {
    const got = [];
    const end = await outcomeOf(async () => { for await (const value of executor.execute(desk.ctx, args)) got.push(value.event.case); });
    desk.log.push(["the caller", "sees the failure"]);
    return { got, itsOwnFailure: end.threw === boom };
  });
  const cannot = new Error("cannot connect");
  const refused = await outcomeOf(async () => { for await (const value of new given.remote.StreamExecutorResource({ createExecInstance() { throw cannot; } }, () => undefined, () => undefined).execute(desk.ctx, {})) desk.log.push(value); });
  const noContext = classOnly(await outcomeOf(async () => { for await (const value of executor.execute(undefined, args)) desk.log.push(value); }));
  return { outcome, log: desk.log, theConnectionCannotBeMade: refused.threw === cannot, noContext, notAFailureAtOnce: outcomeNow(() => typeof executor.execute(undefined, args)[Symbol.asyncIterator]) };
});

// ---------------------------------------------------------------------------------------------------------------
// The side that does the work: a message handed to its executor, and the answers sent home (controlled.ts)
// ---------------------------------------------------------------------------------------------------------------

/** A reader of what the manager sends home. It asks without waiting; what comes is written to the log when it comes. */
function reading(desk, stream, who = "the reader") {
  const iterator = stream[Symbol.asyncIterator]();
  const got = [];
  return {
    got,
    ask() {
      desk.log.push([who, "asks"]);
      iterator.next().then(
        (result) => {
          if (result.done) desk.log.push([who, "sees the end"]);
          else {
            got.push(result.value);
            desk.log.push([who, "gets", wire(result.value)]);
          }
        },
        (error) => { desk.log.push([who, "is failed", error]); },
      );
    },
    async leave() {
      desk.log.push([who, "leaves"]);
      const result = await iterator.return();
      desk.log.push([who, "has left", result]);
    },
  };
}

/** One thing done, then everything that follows from it. */
async function step(act) {
  const result = act();
  await settle();
  return result;
}

/** Asks until the end is seen or `most` messages were asked for. */
async function readAll(reader, desk, most = 12) {
  for (let asked = 0; asked < most; asked += 1) {
    await step(() => reader.ask());
    if (desk.log.at(-1)[1] === "sees the end" || desk.log.at(-1)[1] === "is failed") return;
  }
}

/** The surroundings of a case on the working side: failures nobody caught, the clock, the timers and the console, all on the log. */
function atWork(given, body) {
  const desk = makeDesk(given);
  return unhandled(() => clocked((clock) => timed(desk.log, (timers) => overheard(desk.log, () => body(desk, { clock, timers }))))).then(({ outcome, leftUncaught }) => ({ outcome, leftUncaught, log: desk.log }));
}

/** An executor of shell requests that writes down what it is asked with and answers from the case. */
function shellWorker(desk, run) {
  return {
    execute(ctx, args, options, ...more) {
      desk.log.push(["the executor", "is asked", { ctx: desk.about(ctx), request: wire(args), options: { ...options, hookContextCollector: Array.isArray(options.hookContextCollector) ? `a list of ${options.hookContextCollector.length}` : options.hookContextCollector }, optionKeys: Object.keys(options), moreArguments: more.length }]);
      return run(ctx, args, options);
    },
  };
}

const shellAnswer = (desk, stdout = "a\n") => desk.client({ shellResult: { success: { command: "ls", stdout } } }).message.value;

scenario("the failure that says the working side is gone", ({ controlled }) => {
  const gone = new controlled.ControlledExecDisposedError("the box was closed");
  const empty = new controlled.ControlledExecDisposedError();
  return {
    gone,
    isAnError: gone instanceof Error,
    ownKeys: Object.keys(gone),
    asText: String(gone),
    empty: [empty.name, empty.message],
    startsItsTrace: gone.stack.split("\n")[0],
  };
});

scenario("a handler takes only the request it was made for, and does nothing until its answers are read", async (given) => {
  const { controlled, serialization } = given;
  const desk = makeDesk(given);
  const looked = [];
  const unwrap = serialization.createServerDeserializer("shellArgs");
  const handler = new controlled.SimpleControlledExecHandler(shellWorker(desk, async () => shellAnswer(desk)), (message) => { looked.push(message.message.case); return unwrap(message); }, serialization.createClientSerializer("shellResult"));
  const notMine = [handler.handle(desk.ctx, desk.server({ id: 1, writeArgs: { path: "/a" } })), handler.handle(desk.ctx, desk.server({ id: 2, shellStreamArgs: { command: "ls" } })), handler.handle(desk.ctx, desk.server({ id: 3 }))];
  const mine = handler.handle(desk.ctx, desk.server({ id: 4, shellArgs: { command: "ls" } }));
  await settle();
  return { notMine, looked, mineIsAStream: typeof mine[Symbol.asyncIterator], theExecutorWasAsked: desk.log.length };
});

scenario("a handler asks its executor once, with the caller's context, the request itself and the run's id, and gives one answer under the request's number with the ms it took", async (given) => {
  const { controlled, serialization } = given;
  return atWork(given, async (desk, { clock }) => {
    const message = desk.server({ id: 4, execId: "exec-4", shellArgs: { command: "ls", workingDirectory: "/work" } });
    const result = shellAnswer(desk);
    let given1;
    const handler = new controlled.SimpleControlledExecHandler(
      shellWorker(desk, async (ctx, args, options) => { given1 = { ctx, args, options }; clock.now = 1_012.5; return result; }),
      serialization.createServerDeserializer("shellArgs"),
      serialization.createClientSerializer("shellResult"),
    );
    const stream = handler.handle(desk.ctx, message)[Symbol.asyncIterator]();
    const first = await stream.next();
    const second = await stream.next();
    return {
      first: { done: first.done, sent: wire(first.value) },
      second,
      theContextItself: given1.ctx === desk.ctx,
      theRequestItself: given1.args === message.message.value,
      theAnswerItself: first.value.message.value === result,
      theListForNotesIsANewEmptyOne: Array.isArray(given1.options.hookContextCollector) && given1.options.hookContextCollector.length === 0,
    };
  });
});

scenario("what a handler tells its executor about the run, message by message", async (given) => {
  const { controlled, serialization } = given;
  const out = [];
  for (const json of [
    { id: 1, shellArgs: {} },
    { id: 1, execId: "", shellArgs: {} },
    { id: 1, execId: "exec-1", shellArgs: {} },
    { id: 1, shellArgs: {}, acceptHookAdditionalContexts: true },
    { id: 1, shellArgs: {}, acceptHookAdditionalContexts: false },
    { shellArgs: {}, spanContext: { traceId: TRACE_ID, spanId: "b7ad6b7169203331" } },
  ]) {
    let told;
    const handler = new controlled.SimpleControlledExecHandler({ execute: async (ctx, args, options) => { told = options; return {}; } }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult"));
    const first = await handler.handle("the context", envelopes(given).server(json)).next();
    out.push([json, { ...told, hookContextCollector: told.hookContextCollector.length }, Object.keys(told), first.value.id]);
  }
  const plain = [];
  const odd = new controlled.SimpleControlledExecHandler({ execute: async (ctx, args, options) => { plain.push([ctx, args, { ...options, hookContextCollector: options.hookContextCollector.length }]); return "the answer"; } }, (message) => ({ id: message.number, args: message.payload }), (id, result) => ({ wrapped: [id, result] }));
  const made = await odd.handle("the context", { number: 9, payload: "the request", execId: 12, acceptHookAdditionalContexts: "true" }).next();
  out.push(["a message, an unwrapping and a wrapping of other makes", plain, made.value]);
  return out;
});

scenario("the ms a handler's answer took are whole, rounded half up, and never below zero", async (given) => {
  const { controlled, serialization } = given;
  return clocked(async (clock) => {
    const out = [];
    for (const took of [0, 0.49, 0.5, 1, 12.4, 12.5, 999.5, 86_400_000.2, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      clock.now = 1_000;
      const handler = new controlled.SimpleControlledExecHandler({ execute: async () => { clock.now = 1_000 + took; return {}; } }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult"));
      const first = await handler.handle("the context", envelopes(given).server({ id: 1, shellArgs: {} })).next();
      out.push([took, first.value.localExecutionTimeMs]);
    }
    return out;
  });
});

scenario("notes an executor leaves in the list it was given go home on its answer, all of them, in the list itself", async (given) => {
  const { controlled, serialization } = given;
  const desk = makeDesk(given);
  return clocked(async () => {
    const notes = desk.carriers(["postToolUse", "ran fine"], ["agentStoreConflict", "someone else changed a.txt"], ["", "no name"]);
    let list;
    const handler = new controlled.SimpleControlledExecHandler({ execute: async (ctx, args, options) => { list = options.hookContextCollector; list.push(...notes); return shellAnswer(desk); } }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult"));
    const withNotes = (await handler.handle(desk.ctx, desk.server({ id: 6, shellArgs: {} })).next()).value;
    const quiet = new controlled.SimpleControlledExecHandler({ execute: async () => shellAnswer(desk) }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult"));
    const without = (await quiet.handle(desk.ctx, desk.server({ id: 6, shellArgs: {} })).next()).value;
    return { withNotes: wire(withNotes), theListItself: withNotes.hookAdditionalContexts === list, without: wire(without), withoutNotesTheAnswersOwnEmptyList: without.hookAdditionalContexts };
  });
});

scenario("an executor that fails, or an answer that cannot be wrapped, fails the handler's stream with that very failure", async (given) => {
  const { controlled, serialization } = given;
  const desk = makeDesk(given);
  const boom = new Error("the shell is gone");
  const wrapBoom = new Error("cannot wrap");
  const cases = [
    ["the executor fails later", { execute: async () => { throw boom; } }, serialization.createClientSerializer("shellResult"), boom],
    ["the executor fails as it is asked", { execute() { throw boom; } }, serialization.createClientSerializer("shellResult"), boom],
    ["the answer cannot be wrapped", { execute: async () => shellAnswer(desk) }, () => { throw wrapBoom; }, wrapBoom],
  ];
  const out = [];
  for (const [what, executor, wrap, expected] of cases) {
    const stream = new controlled.SimpleControlledExecHandler(executor, serialization.createServerDeserializer("shellArgs"), wrap).handle(desk.ctx, desk.server({ id: 6, shellArgs: {} }));
    const first = await outcomeOf(() => stream.next());
    out.push([what, { theVeryFailure: first.threw === expected, thenTheEnd: await stream.next() }]);
  }
  const unwrapBoom = new Error("cannot unwrap");
  out.push(["the message cannot be unwrapped: a failure at once", outcomeNow(() => new controlled.SimpleControlledExecHandler({}, () => { throw unwrapBoom; }, () => {}).handle(desk.ctx, desk.server({ id: 6 }))).threw === unwrapBoom]);
  out.push(["an executor that answers without waiting", (await new controlled.SimpleControlledExecHandler({ execute: () => shellAnswer(desk, "not a promise") }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult")).handle(desk.ctx, desk.server({ id: 6, shellArgs: {} })).next()).value.message.value.result.value.stdout]);
  return out;
});

/** A stream handler for shell streams over an executor that yields from a script and writes down when it is told to stop. */
function streamHandler(given, desk, script, { onAsk } = {}) {
  const { controlled, serialization } = given;
  const executor = {
    execute(ctx, args, options, ...more) {
      desk.log.push(["the executor", "is asked", { ctx: typeof ctx === "string" ? ctx : desk.about(ctx), request: wire(args), options: { ...options, hookContextCollector: `a list of ${options.hookContextCollector.length}` }, optionKeys: Object.keys(options), moreArguments: more.length }]);
      onAsk?.(ctx, args, options);
      return scripted(desk.log, "the executor's stream", script(options));
    },
  };
  return new controlled.SimpleControlledStreamExecHandler(executor, serialization.createServerDeserializer("shellStreamArgs"), serialization.createClientSerializer("shellStream"));
}

/** Events of a shell's stream as an executor yields them. */
const shellEvents = (desk) => ({
  stdout: (data) => desk.client({ shellStream: { stdout: { data } } }).message.value,
  exit: (code) => desk.client({ shellStream: { exit: { code, cwd: "/work" } } }).message.value,
});

scenario("a stream handler takes only the request it was made for, asks its executor when first read, and sends each event home under the request's number with the ms since it began", async (given) =>
  atWork(given, async (desk, { clock }) => {
    const event = shellEvents(desk);
    const events = [event.stdout("one\n"), event.stdout("two\n"), event.exit(3)];
    const handler = streamHandler(given, desk, () => [events[0], events[1], events[2]], { onAsk: () => { clock.now = 1_004.5; } });
    const notMine = [handler.handle(desk.ctx, desk.server({ id: 1, shellArgs: { command: "ls" } })), handler.handle(desk.ctx, desk.server({ id: 2 }))];
    const stream = handler.handle(desk.ctx, desk.server({ id: 8, execId: "exec-8", acceptHookAdditionalContexts: true, shellStreamArgs: { command: "npm test" } }));
    desk.log.push(["the caller", "has the stream, unread"]);
    const got = [];
    for await (const message of stream) {
      desk.log.push(["the caller", "reads", wire(message)]);
      got.push(message);
      clock.now += 10;
    }
    return { notMine, theEventsThemselves: got.every((message, at) => message.message.value === events[at]), count: got.length };
  }));

scenario("of the notes an executor leaves during a stream only those about changed files go home, in an envelope of their own after the last event", async (given) => {
  const out = [];
  for (const [what, notes] of [
    ["notes of several kinds", [["postToolUse", "left out"], ["agentStoreConflict", "a.txt changed"], ["preToolUse", "left out too"], ["agentStoreConflict", "b.txt changed"]]],
    ["no note about changed files", [["postToolUse", "left out"]]],
    ["no notes", []],
    ["a kind spelled another way", [["AgentStoreConflict", "left out"], ["agentStoreConflict ", "left out"]]],
  ]) {
    const desk = makeDesk(given);
    const event = shellEvents(desk);
    await clocked(async () => {
      const handler = streamHandler(given, desk, (options) => { options.hookContextCollector.push(...desk.carriers(...notes)); return [event.stdout("one\n"), event.exit(0)]; });
      const sent = [];
      for await (const message of handler.handle(desk.ctx, desk.server({ id: 8, shellStreamArgs: {} }))) sent.push(wire(message));
      out.push([what, sent]);
    });
  }
  return out;
});

scenario("when an executor's stream fails the notes about changed files still go home first, then the failure", async (given) => {
  const desk = makeDesk(given);
  const event = shellEvents(desk);
  const boom = new Error("the shell died");
  return clocked(async () => {
    const withNotes = streamHandler(given, desk, (options) => { options.hookContextCollector.push(...desk.carriers(["agentStoreConflict", "a.txt changed"])); return [event.stdout("one\n"), { fails: boom }, event.exit(0)]; });
    const stream = withNotes.handle(desk.ctx, desk.server({ id: 8, shellStreamArgs: {} }));
    const steps = [];
    for (let asked = 0; asked < 4; asked += 1) {
      const next = await outcomeOf(() => stream.next());
      steps.push(next.threw !== undefined ? { theVeryFailure: next.threw === boom } : next.answered.done ? "the end" : wire(next.answered.value));
    }
    const without = streamHandler(given, desk, () => [{ fails: boom }]);
    const quiet = without.handle(desk.ctx, desk.server({ id: 8, shellStreamArgs: {} }));
    const first = await outcomeOf(() => quiet.next());
    const failsAsAsked = new given.controlled.SimpleControlledStreamExecHandler({ execute() { throw boom; } }, given.serialization.createServerDeserializer("shellStreamArgs"), given.serialization.createClientSerializer("shellStream")).handle(desk.ctx, desk.server({ id: 8, shellStreamArgs: {} }));
    return { steps, withoutNotes: { theVeryFailure: first.threw === boom, thenTheEnd: await quiet.next() }, anExecutorThatFailsAsItIsAsked: (await outcomeOf(() => failsAsAsked.next())).threw === boom, log: desk.log.filter(([who]) => who === "the executor's stream").map(([, did]) => did) };
  });
});

scenario("a reader that stops a stream handler early has the executor's stream told to stop, and is handed the notes about changed files as it leaves", async (given) => {
  const desk = makeDesk(given);
  const event = shellEvents(desk);
  return clocked(async () => {
    const handler = streamHandler(given, desk, (options) => { options.hookContextCollector.push(...desk.carriers(["agentStoreConflict", "a.txt changed"], ["postToolUse", "left out"])); return [event.stdout("one\n"), event.stdout("two\n"), event.exit(0)]; });
    const stream = handler.handle(desk.ctx, desk.server({ id: 8, shellStreamArgs: {} }));
    const first = await stream.next();
    const leaving = await stream.return("the reader's word");
    const after = await stream.next();
    const quiet = streamHandler(given, desk, () => [event.stdout("one\n"), event.exit(0)]).handle(desk.ctx, desk.server({ id: 9, shellStreamArgs: {} }));
    await quiet.next();
    const quietLeaving = await quiet.return("the reader's word");
    const unread = streamHandler(given, desk, () => [event.exit(0)]).handle(desk.ctx, desk.server({ id: 10, shellStreamArgs: {} }));
    const unreadLeaving = await unread.return("never read");
    return {
      first: wire(first.value),
      leaving: { done: leaving.done, value: wire(leaving.value) },
      after,
      withNoSuchNotes: quietLeaving,
      neverRead: unreadLeaving,
      theExecutorsStreams: desk.log.filter(([who]) => who === "the executor's stream").map(([, did]) => did),
      executorsAsked: desk.log.filter(([who, did]) => who === "the executor" && did === "is asked").length,
    };
  });
});

/** A handler that writes down that it was asked and answers with what the case gives (nothing: it passes). */
function standInHandler(desk, name, answer) {
  return {
    handle(ctx, message) {
      desk.log.push([name, "is asked", { ctx: desk.about(ctx), number: message.id, kind: message.message.case }]);
      return typeof answer === "function" ? answer(ctx, message) : answer;
    },
  };
}

/** A control message from the asking side, as the manager reads it. */
const abort = (id) => ({ message: { case: "abort", value: { id } } });

scenario("a message goes to the first handler that takes it, under a context of its own made from the caller's, and no later handler is asked", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const answer = desk.client({ id: 5, shellResult: { success: { command: "ls" } } });
    const registered = [
      manager.register(standInHandler(desk, "the first handler", undefined)),
      manager.register(standInHandler(desk, "the second handler", () => scripted(desk.log, "the second handler's answers", [answer]))),
      manager.register(standInHandler(desk, "the third handler", () => scripted(desk.log, "the third handler's answers", []))),
    ];
    const out = manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: { command: "ls" } }));
    desk.log.push(["the caller", "has the stream"]);
    const reader = reading(desk, out);
    await readAll(reader, desk);
    return { registered, theAnswerItself: reader.got[0] === answer };
  }));

scenario("answers go home one at a time, each written only when the one before was read; then the close; the run is counted a success and timed once the reader has asked past the close", async (given) =>
  atWork(given, async (desk, { clock, timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [desk.client({ id: 5, shellStream: { stdout: { data: "one\n" } } }), desk.client({ id: 5, shellStream: { exit: { code: 0 } } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellStreamArgs: { command: "npm test" } })));
    desk.log.push(["the caller", "has the stream; nobody reads yet"]);
    await settle();
    for (const ms of [10, 20, 30, 40]) {
      clock.now = 1_000 + ms;
      await step(() => reader.ask());
    }
    return { timersLeft: timers.left() };
  }));

scenario("a message no handler takes is answered with a failure and a close, said on the console and counted against the caller's own context", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const out = [];
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the only handler", undefined));
    for (const json of [{ id: 5, writeArgs: { path: "/a" } }, { id: 6 }, { execId: "exec-0", lsArgs: {} }]) {
      const reader = reading(desk, manager.handle(desk.ctx, desk.server(json)));
      await readAll(reader, desk);
      out.push(reader.got.length);
    }
    const none = new given.controlled.SimpleControlledExecManager();
    const reader = reading(desk, none.handle(desk.ctx, desk.server({ id: 7, shellArgs: {} })));
    desk.log.push(["the caller", "has the stream of a manager with no handlers; nothing is read yet"]);
    await settle();
    await readAll(reader, desk);
    return { messagesEach: out, timersAsked: timers.left() };
  }));

scenario("an executor's failure goes home as one failure message with its words, its trace and a code for the two failures that have one; no close follows", async (given) => {
  const { controlled } = given;
  const out = [];
  const cases = [
    ["an error", () => failure("the shell is gone")],
    ["an error with empty words", () => failure("")],
    ["an error with no trace", () => { const error = new Error("no trace"); error.stack = undefined; return error; }],
    ["an error with an empty trace", () => failure("empty trace", { stack: "" })],
    ["the working side is gone", () => { const error = new controlled.ControlledExecDisposedError("the box was closed"); error.stack = "ControlledExecDisposedError: the box was closed\n    at a fixed place"; return error; }],
    ["an error named like the working side being gone", () => failure("only the name", { name: "ControlledExecDisposedError" })],
    ["the stream did not start in time", () => failure("no first byte", { name: "AgentExecStreamStartTimeoutError" })],
    ["a kind of the working side being gone", () => { class Closed extends controlled.ControlledExecDisposedError {} const error = new Closed("a kind of it"); error.name = "AgentExecStreamStartTimeoutError"; error.stack = "fixed"; return error; }],
    ["words only", () => "just words"],
    ["nothing", () => undefined],
    ["null", () => null],
    ["a plain object with a message", () => ({ message: "not an error", stack: "not a trace", name: "ControlledExecDisposedError" })],
    ["a number", () => 404],
  ];
  for (const [what, make] of cases) {
    const { outcome, leftUncaught, log } = await atWork(given, async (desk) => {
      const manager = new controlled.SimpleControlledExecManager();
      manager.register({ handle: () => scripted([], "", [{ fails: make() }]) });
      const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
      await readAll(reader, desk);
      return reader.got.map((message) => wire(message));
    });
    // The whole of the first case is kept; of the others, what went home and what was counted.
    out.push(out.length === 0 ? [what, { sent: outcome, leftUncaught, log }] : [what, { sent: outcome, leftUncaught, counted: log.filter(([who]) => who === "metrics").map(([, , handle, value, labels]) => [handle.name, value, labels]) }]);
  }
  return out;
});

scenario("a failure with a trace of its own sends that very trace", async (given) =>
  atWork(given, async (desk) => {
    const boom = new Error("made here");
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register({ handle: () => scripted([], "", [{ fails: boom }]) });
    const stream = manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} }))[Symbol.asyncIterator]();
    const first = (await stream.next()).value;
    const thrown = first.message.value;
    return { kind: first.message.case, id: thrown.id, error: thrown.error, theErrorsOwnTrace: thrown.stackTrace === boom.stack && typeof boom.stack === "string" && boom.stack.startsWith("Error: made here\n"), errorCode: thrown.errorCode, thenTheEnd: await stream.next() };
  }));

scenario("git's own words are added to a failure sent home only when the manager was told to, asked anew for each failure", async (given) => {
  const { controlled } = given;
  const gitFailure = () => Object.assign(failure("clone failed"), { gitErrorCode: "NotAGitRepository", exitCode: 128, stderr: "fatal: unable to access 'https://bot:secret@example.com/a/b.git/': 403" });
  const sentBy = async (manager, error) => {
    manager.register({ handle: () => scripted([], "", [{ fails: error }]) });
    const stream = manager.handle(makeDesk(given).ctx, envelopes(given).server({ id: 5, shellArgs: {} }))[Symbol.asyncIterator]();
    return (await stream.next()).value.message.value.error;
  };
  const asked = [];
  let answer = true;
  const byFunction = new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: () => { asked.push(answer); return answer; } });
  const first = await sentBy(byFunction, gitFailure());
  answer = false;
  const second = await sentBy(byFunction, gitFailure());
  answer = "yes";
  const third = await sentBy(byFunction, gitFailure());
  const notAskedForOtherThanErrors = await sentBy(byFunction, "words only");
  return unhandled(async () => ({
    noOptions: await sentBy(new controlled.SimpleControlledExecManager(), gitFailure()),
    emptyOptions: await sentBy(new controlled.SimpleControlledExecManager({}), gitFailure()),
    toldNo: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: false }), gitFailure()),
    toldYes: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: true }), gitFailure()),
    toldNothing: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: undefined }), gitFailure()),
    toldAWord: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: "yes" }), gitFailure()),
    toldNull: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: null }), gitFailure()),
    byFunction: [first, second, third, notAskedForOtherThanErrors],
    theFunctionWasAsked: asked,
    aFailureWithoutGitCodes: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: true }), Object.assign(failure("plain"), { stderr: "ignored" })),
    aFailureAlreadyTold: await sentBy(new controlled.SimpleControlledExecManager({ includeGitStderrInThrows: true }), Object.assign(failure("pull failed [git: exitCode=1]"), { exitCode: 2, stderr: "ignored" })),
  }));
});

scenario("a failure after some answers went home is sent after them, and counted with the kind of request", async (given) =>
  atWork(given, async (desk, { clock }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [desk.client({ id: 5, shellStream: { stdout: { data: "one\n" } } }), { fails: failure("the shell died") }])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellStreamArgs: {} })));
    clock.now = 1_250;
    await readAll(reader, desk);
    return reader.got.length;
  }));

scenario("while a run lasts a heartbeat goes home every three seconds, the next one timed only once the last was read; the timer is cleared when the run ends", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const gate = deferred();
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [{ waitsFor: gate.promise }, desk.client({ id: 5, shellResult: { success: {} } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await step(() => reader.ask());
    await step(() => timers.ring(1));
    desk.log.push(["the case", "the heartbeat was read, but nothing more is asked for yet"]);
    await step(() => reader.ask());
    await step(() => timers.ring(2));
    await step(() => reader.ask());
    desk.log.push(["the case", "the work is done"]);
    await step(() => gate.resolve());
    await readAll(reader, desk);
    return { timersLeft: timers.left() };
  }));

scenario("a heartbeat that finds nobody reading waits its turn, and is read before what comes after it", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const gate = deferred();
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [{ waitsFor: gate.promise }, desk.client({ id: 5, shellResult: { success: {} } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await step(() => timers.ring(1));
    desk.log.push(["the case", "the work is done; still nobody reads"]);
    await step(() => gate.resolve());
    await readAll(reader, desk);
    return { timersLeft: timers.left() };
  }));

scenario("a reader that leaves with a heartbeat just read: one more timer is set, and when it rings nothing is sent and no timer follows; the work itself is not told", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    let kept;
    manager.register(standInHandler(desk, "the handler", (ctx) => { kept = ctx; return scripted(desk.log, "the handler's answers", [{ never: true }]); }));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await step(() => reader.ask());
    await step(() => timers.ring(1));
    await reader.leave();
    await settle();
    const left = timers.left();
    for (const number of left) await step(() => timers.ring(number));
    return { timersLeftWhenTheReaderHadLeft: left, timersLeftAfterTheyRang: timers.left(), theRunsContextIsCanceled: kept.canceled };
  }));

scenario("the asking side's abort cancels the context of the run with that number, and of no other; once a run has ended its number means nothing", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const contexts = new Map();
    const gates = new Map();
    manager.register(standInHandler(desk, "the handler", (ctx, message) => {
      contexts.set(message.id, ctx);
      gates.set(message.id, deferred());
      return scripted(desk.log, `the answers of ${message.id}`, [{ waitsFor: gates.get(message.id).promise }, desk.client({ id: message.id, shellResult: { success: {} } })]);
    }));
    const five = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })), "the reader of 5");
    const six = reading(desk, manager.handle(desk.ctx, desk.server({ id: 6, shellArgs: {} })), "the reader of 6");
    // The reason of an abort that gives none is the runtime's own failure: kept by its name.
    const state = () => [...contexts].map(([id, ctx]) => [id, { canceled: ctx.canceled, aborted: ctx.signal.aborted, reason: ctx.reason === undefined ? "none" : { named: ctx.reason.name, anError: ctx.reason instanceof Error } }]);
    const states = { atFirst: state() };
    const returned = [
      manager.handleControlMessage(abort(99)),
      manager.handleControlMessage({ message: { case: "other", value: { id: 5 } } }),
      manager.handleControlMessage({ message: { case: undefined } }),
    ];
    states.afterAbortsOfOtherNumbersAndOtherMessages = state();
    returned.push(manager.handleControlMessage(abort(5)));
    states.afterTheAbortOfFive = state();
    returned.push(manager.handleControlMessage(abort(5)));
    states.theCallersOwn = { canceled: desk.ctx.canceled };
    gates.get(6).resolve();
    await readAll(six, desk);
    manager.handleControlMessage(abort(6));
    states.afterSixEndedAndWasAborted = state();
    gates.get(5).resolve();
    await readAll(five, desk);
    return { returned, states, notAControlMessage: [classOnly(outcomeNow(() => manager.handleControlMessage({}))), classOnly(outcomeNow(() => manager.handleControlMessage(undefined))), classOnly(outcomeNow(() => manager.handleControlMessage({ message: { case: "abort" } })))] };
  }));

scenario("an executor that stops with a failure when its run is aborted sends that failure home; one that answers all the same sends its answer", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    given.shell.shellExecutorResource.registerControlledImplementation(shellWorker(desk, (ctx, args) => new Promise((resolve, reject) => {
      ctx.signal.addEventListener("abort", () => {
        desk.log.push(["the executor", "sees the abort", { command: args.command, canceled: ctx.canceled, reasonNamed: ctx.reason.name }]);
        if (args.command === "stop") reject(failure("aborted by the asking side"));
        else resolve(shellAnswer(desk, "finished anyway\n"));
      });
    })), manager);
    const stops = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: { command: "stop" } })), "the reader of 5");
    const goesOn = reading(desk, manager.handle(desk.ctx, desk.server({ id: 6, shellArgs: { command: "go on" } })), "the reader of 6");
    await step(() => stops.ask());
    await step(() => goesOn.ask());
    await step(() => manager.handleControlMessage(abort(5)));
    await readAll(stops, desk);
    await step(() => manager.handleControlMessage(abort(6)));
    await readAll(goesOn, desk);
    return [stops.got.length, goesOn.got.length];
  }));

scenario("the caller's own cancel reaches every run made from its context", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const seen = [];
    manager.register({ handle: (ctx) => { seen.push(ctx); return scripted([], "", [{ never: true }]); } });
    const [callers, cancel] = desk.ctx.withCancel();
    manager.handle(callers, desk.server({ id: 5, shellArgs: {} }));
    manager.handle(callers, desk.server({ id: 6, shellArgs: {} }));
    const before = seen.map((ctx) => ctx.canceled);
    cancel("the turn was stopped");
    return { before, after: seen.map((ctx) => [ctx.canceled, ctx.reason]), eachItsOwn: seen[0] !== seen[1] && seen[0] !== callers };
  }));

scenario("two runs under one number: the abort reaches only the later one, and when either ends the number is forgotten for both", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const seen = [];
    const gates = [];
    manager.register({ handle: (ctx) => { seen.push(ctx); gates.push(deferred()); return scripted([], "", [{ waitsFor: gates.at(-1).promise }]); } });
    const quiet = { log: [] };
    const message = () => desk.server({ id: 5, shellArgs: {} });
    const first = reading(quiet, manager.handle(desk.ctx, message()));
    manager.handle(desk.ctx, message());
    manager.handleControlMessage(abort(5));
    const afterAnAbort = seen.map((ctx) => ctx.canceled);
    manager.handle(desk.ctx, message());
    gates[0].resolve();
    await readAll(first, quiet);
    manager.handleControlMessage(abort(5));
    const afterTheFirstEndedAndAnotherAbort = seen.map((ctx) => ctx.canceled);

    // A message no handler takes forgets the number too, with a run of that number still going.
    const other = new given.controlled.SimpleControlledExecManager();
    const kept = [];
    other.register({ handle: (ctx, incoming) => { if (incoming.message.case !== "shellArgs") return undefined; kept.push(ctx); return scripted([], "", [{ never: true }]); } });
    other.handle(desk.ctx, message());
    other.handle(desk.ctx, desk.server({ id: 5, writeArgs: {} }));
    other.handleControlMessage(abort(5));
    return { afterAnAbort, afterTheFirstEndedAndAnotherAbort, theFirstWasRead: quiet.log.map(([, did]) => did), afterAMessageNobodyTookAndAnAbort: kept.map((ctx) => ctx.canceled) };
  }));

scenario("a run is known by its number before any handler is asked: a handler that aborts it then finds its context canceled", async (given) =>
  atWork(given, async (desk) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const seen = [];
    manager.register({ handle: (ctx, message) => { manager.handleControlMessage(abort(message.id)); seen.push(["the first handler", ctx.canceled]); return undefined; } });
    manager.register({ handle: (ctx) => { seen.push(["the second handler", ctx.canceled]); return scripted([], "", []); } });
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await readAll(reader, desk);
    return seen;
  }));

scenario("a reader that leaves before the answer: the answer is dropped without a word, the run is timed but counted neither way, and the executor's stream is told to stop", async (given) =>
  atWork(given, async (desk, { clock, timers }) => {
    const gate = deferred();
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [{ waitsFor: gate.promise }, desk.client({ id: 5, shellStream: { stdout: { data: "one\n" } } }), desk.client({ id: 5, shellStream: { exit: {} } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellStreamArgs: {} })));
    await step(() => reader.ask());
    await reader.leave();
    await settle();
    clock.now = 1_500;
    desk.log.push(["the case", "the work goes on and gives its first answer"]);
    await step(() => gate.resolve());
    return { timersLeft: timers.left() };
  }));

scenario("a reader that leaves, and then the executor fails: the failure cannot be sent, and is left uncaught", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const gate = deferred();
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [{ waitsFor: gate.promise }, { fails: failure("the shell died") }])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await reader.leave();
    desk.log.push(["the case", "the work fails"]);
    await step(() => gate.resolve());
    return { timersLeft: timers.left() };
  }));

scenario("a reader that leaves right after the close was read: the run is counted a success", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [desk.client({ id: 5, shellResult: { success: {} } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await step(() => reader.ask());
    await step(() => reader.ask());
    await reader.leave();
    await settle();
    return { timersLeft: timers.left() };
  }));

scenario("a reader that leaves after an answer and before the close: the close is dropped and the run is not counted", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [desk.client({ id: 5, shellResult: { success: {} } })])));
    const reader = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    await step(() => reader.ask());
    await reader.leave();
    await settle();
    return { timersLeft: timers.left() };
  }));

scenario("a reader that never reads: one answer waits, nothing is counted, and the heartbeat's timer stays", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    manager.register(standInHandler(desk, "the handler", () => scripted(desk.log, "the handler's answers", [desk.client({ id: 5, shellResult: { success: {} } }), desk.client({ id: 5, shellResult: { success: {} } })])));
    manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} }));
    await settle();
    return { timersLeft: timers.left() };
  }));

scenario("a handler that fails as it is asked fails the handling at once, and its run stays known by its number", async (given) =>
  atWork(given, async (desk, { timers }) => {
    const manager = new given.controlled.SimpleControlledExecManager();
    const boom = new Error("cannot unwrap");
    let kept;
    manager.register(standInHandler(desk, "the first handler", (ctx) => { kept = ctx; throw boom; }));
    manager.register(standInHandler(desk, "the second handler", () => scripted(desk.log, "never", [])));
    const outcome = outcomeNow(() => manager.handle(desk.ctx, desk.server({ id: 5, shellArgs: {} })));
    const before = kept.canceled;
    manager.handleControlMessage(abort(5));
    return { theVeryFailure: outcome.threw === boom, canceledBeforeTheAbort: before, canceledAfter: kept.canceled, timersAsked: timers.left(), noContext: classOnly(outcomeNow(() => manager.handle(undefined, desk.server({ id: 5 })))), noMessage: classOnly(outcomeNow(() => manager.handle(desk.ctx, undefined))) };
  }));

scenario("a manager made from a registry has each resource register its implementation with it, in the registry's order", async (given) =>
  atWork(given, async (desk, { clock }) => {
    const { controlled, resources } = given;
    const registry = new resources.RegistryResourceAccessor();
    const event = shellEvents(desk);
    registry.register(given.shellStream.shellStreamExecutorResource, { execute(ctx, args, options) { desk.log.push(["the stream executor", "is asked", { ctx: desk.about(ctx), command: args.command, deliverAgentStoreConflictNotices: options.deliverAgentStoreConflictNotices }]); options.hookContextCollector.push(...desk.carriers(["agentStoreConflict", "a.txt changed"])); return scripted(desk.log, "the executor's stream", [event.stdout("one\n"), event.exit(0)]); } });
    registry.register(given.shell.shellExecutorResource, shellWorker(desk, async (ctx, args, options) => { clock.now += 7; options.hookContextCollector.push(...desk.carriers(["postToolUse", "ran"])); return shellAnswer(desk); }));
    const manager = controlled.SimpleControlledExecManager.fromResources(registry);
    const unary = reading(desk, manager.handle(desk.ctx, desk.server({ id: 5, execId: "exec-5", shellArgs: { command: "ls" }, acceptHookAdditionalContexts: true })));
    await readAll(unary, desk);
    const stream = reading(desk, manager.handle(desk.ctx, desk.server({ id: 6, shellStreamArgs: { command: "npm test" } })));
    await readAll(stream, desk);
    const unknown = reading(desk, manager.handle(desk.ctx, desk.server({ id: 7, writeArgs: {} })));
    await readAll(unknown, desk);

    const order = [];
    const made = controlled.SimpleControlledExecManager.fromResources({
      entries: () => [
        [{ registerControlledImplementation: (implementation, withManager) => { order.push(["first", implementation, withManager instanceof controlled.SimpleControlledExecManager]); } }, "its implementation"],
        [{ registerControlledImplementation: (implementation, withManager) => { order.push(["second", implementation, withManager instanceof controlled.SimpleControlledExecManager]); withManager.register({ handle: () => scripted([], "", [{ fails: Object.assign(failure("fetch failed"), { exitCode: 1, stderr: "fatal: words" }) }]) }); } }, undefined],
      ],
    }, { includeGitStderrInThrows: true });
    const sent = (await made.handle(desk.ctx, desk.server({ id: 8 }))[Symbol.asyncIterator]().next()).value.message.value.error;
    return {
      isAManager: manager instanceof controlled.SimpleControlledExecManager,
      got: [unary.got.length, stream.got.length, unknown.got.length],
      order,
      theOptionsReachTheManager: sent,
      anEmptyRegistry: controlled.SimpleControlledExecManager.fromResources({ entries: () => [] }) instanceof controlled.SimpleControlledExecManager,
      noRegistry: classOnly(outcomeNow(() => controlled.SimpleControlledExecManager.fromResources(undefined))),
    };
  }));

// ---------------------------------------------------------------------------------------------------------------
// Each tool's resource: the names its request and its answer go by on the wire, on both sides
// (ls.ts, delete.ts, hook-executor.ts, shell.ts, shell-stream.ts, write.ts, read.ts, background-shell.ts,
// request-context.ts, canvas-diagnostics.ts, smart-mode-classifier.ts, computer-use.ts, mcp.ts, subagent.ts,
// subagent-await.ts, subagent-control.ts)
// ---------------------------------------------------------------------------------------------------------------

/** Each resource: its module, its export, the names of its request and answer in the envelopes, one request and one answer in plain form. */
const TOOL_RESOURCES = [
  ["ls", "lsExecutorResource", "lsArgs", "lsResult", { path: "/work", ignore: ["node_modules"], toolCallId: "call-ls" }, { error: { path: "/work", error: "no such folder" } }],
  ["del", "deleteExecutorResource", "deleteArgs", "deleteResult", { path: "/work/a.txt", toolCallId: "call-delete" }, { fileNotFound: { path: "/work/a.txt" } }],
  ["hookExecutor", "hookExecutorResource", "executeHookArgs", "executeHookResult", { request: {} }, { response: {} }],
  ["shell", "shellExecutorResource", "shellArgs", "shellResult", { command: "ls -la", workingDirectory: "/work", toolCallId: "call-shell" }, { success: { command: "ls -la", exitCode: 0, stdout: "a\n" } }],
  ["shellStream", "shellStreamExecutorResource", "shellStreamArgs", "shellStream", { command: "npm test", workingDirectory: "/work" }, { stdout: { data: "one\n" } }],
  ["write", "writeExecutorResource", "writeArgs", "writeResult", { path: "/work/a.txt", fileText: "hello\n", toolCallId: "call-write" }, { success: { path: "/work/a.txt", linesCreated: 1, fileSize: 6 } }],
  ["read", "readExecutorResource", "readArgs", "readResult", { path: "/work/a.txt", toolCallId: "call-read" }, { error: { path: "/work/a.txt", error: "unreadable" } }],
  ["read", "redactedReadExecutorResource", "redactedReadArgs", "redactedReadResult", { path: "/work/.env", toolCallId: "call-redacted" }, { error: { path: "/work/.env", error: "unreadable" } }],
  ["backgroundShell", "backgroundShellExecutorResource", "backgroundShellSpawnArgs", "backgroundShellSpawnResult", { command: "npm run dev", workingDirectory: "/work", toolCallId: "call-bg" }, { rejected: { command: "npm run dev", workingDirectory: "/work", reason: "not allowed" } }],
  ["backgroundShell", "writeBackgroundShellInputExecutorResource", "writeShellStdinArgs", "writeShellStdinResult", { shellId: 3, chars: "y\n" }, { error: { error: "no such shell" } }],
  ["requestContext", "requestContextExecutorResource", "requestContextArgs", "requestContextResult", { workspaceId: "w1", useCached: true }, { error: { error: "no workspace" } }],
  ["canvasDiagnostics", "canvasDiagnosticsExecutorResource", "canvasDiagnosticsArgs", "canvasDiagnosticsResult", { path: "/work/board.canvas", toolCallId: "call-canvas" }, { error: {} }],
  ["smartMode", "smartModeClassifierExecutorResource", "smartModeClassifierArgs", "smartModeClassifierResult", { toolCallId: "call-smart", parentConversationId: "conv-1" }, { error: {} }],
  ["computerUse", "computerUseExecutorResource", "computerUseArgs", "computerUseResult", { toolCallId: "call-computer", description: "open the menu" }, { error: { error: "no screen", actionCount: 0 } }],
  ["mcp", "mcpExecutorResource", "mcpArgs", "mcpResult", { name: "docs-search", toolName: "search", providerIdentifier: "docs", toolCallId: "call-mcp" }, { error: { error: "server gone" } }],
  ["mcp", "listMcpResourcesExecutorResource", "listMcpResourcesExecArgs", "listMcpResourcesExecResult", { server: "docs" }, { error: { error: "server gone" } }],
  ["mcp", "readMcpResourceExecutorResource", "readMcpResourceExecArgs", "readMcpResourceExecResult", { server: "docs", uri: "docs://intro" }, { notFound: { uri: "docs://intro" } }],
  ["mcp", "mcpStateExecutorResource", "mcpStateExecArgs", "mcpStateExecResult", { serverIdentifiers: ["docs"], kickOnly: true }, { error: { error: "server gone" } }],
  ["subagent", "subagentExecutorResource", "subagentArgs", "subagentResult", { toolCallId: "call-task", subagentType: "explore", prompt: "look around" }, { error: { agentId: "agent-1", error: "no model" } }],
  ["subagentAwait", "subagentAwaitExecutorResource", "subagentAwaitArgs", "subagentAwaitResult", { agentId: "agent-1" }, { notFound: {} }],
  ["subagentControl", "forceBackgroundSubagentExecutorResource", "forceBackgroundSubagentArgs", "forceBackgroundSubagentResult", { toolCallId: "call-task" }, { status: "FORCE_BACKGROUND_SUBAGENT_STATUS_ACCEPTED" }],
];
const STREAMED = "shellStreamExecutorResource";

scenario("each tool has a resource of its own: a mark like no other's, and the two ways to its implementation", (given) => {
  const all = TOOL_RESOURCES.map(([module, name]) => given[module][name]);
  all.push(given.conflictNotice.agentStoreConflictNoticeExecutorResource);
  return {
    each: TOOL_RESOURCES.map(([module, name]) => {
      const resource = given[module][name];
      return [name, Object.keys(resource), typeof resource.symbol, resource.symbol.description, typeof resource.remoteImplementation, typeof resource.registerControlledImplementation];
    }),
    marksLikeNoOther: new Set(all.map((resource) => resource.symbol)).size === all.length,
  };
});

scenario("on the asking side each tool's resource sends its request under its own name and takes for its result only the answer under its own name, passing over every other tool's", async (given) => {
  const out = [];
  for (const [module, name, argsName, resultName, argsJson, resultJson] of TOOL_RESOURCES) {
    const desk = makeDesk(given);
    const args = desk.server({ [argsName]: argsJson }).message.value;
    const own = desk.client({ id: 7, [resultName]: resultJson });
    const others = TOOL_RESOURCES.filter((entry) => entry[3] !== resultName).map((entry) => desk.client({ id: 7, [entry[3]]: entry[5] }));
    const to = connection(desk, { steps: [...others, own] });
    const executor = given[module][name].remoteImplementation(to);
    if (name === STREAMED) {
      const got = [];
      for await (const event of executor.execute(desk.ctx, args, { execId: "exec-1" })) got.push(event);
      out.push([name, { aStreamExecutor: executor instanceof given.remote.StreamExecutorResource, sent: wire(to.made[0]), answersRead: others.length + 1, events: got.map((event) => wire(event)), theEventItself: got[0] === own.message.value }]);
    } else {
      const value = await executor.execute(desk.ctx, args, { execId: "exec-1" });
      await settle();
      out.push([name, { anExecutor: executor instanceof given.remote.ExecutorResource, sent: wire(to.made[0]), answersReadBeforeTheResult: desk.log.filter(([who, did]) => who === "the answers" && did === "gives").length, result: wire(value), theAnswerItself: value === own.message.value }]);
    }
  }
  return out;
});

scenario("each tool's resource makes a new sender each time it is asked for one", (given) =>
  TOOL_RESOURCES.map(([module, name]) => {
    const resource = given[module][name];
    return [name, resource.remoteImplementation({}) !== resource.remoteImplementation({})];
  }));

scenario("on the working side each tool's resource registers one handler, which takes only the request under its own name, hands it to the executor and sends the answer home under its own name", async (given) =>
  clocked(async () => {
    const out = [];
    for (const [module, name, argsName, resultName, argsJson, resultJson] of TOOL_RESOURCES) {
      const desk = makeDesk(given);
      const result = desk.client({ [resultName]: resultJson }).message.value;
      const asked = [];
      const executor = name === STREAMED
        ? { execute: (ctx, args, options) => { asked.push([ctx, args, options]); return scripted([], "", [result]); } }
        : { execute: async (ctx, args, options) => { asked.push([ctx, args, options]); return result; } };
      const handlers = [];
      const whatRegisteringGaveBack = given[module][name].registerControlledImplementation(executor, { register: (handler) => { handlers.push(handler); return "what the manager's register gave back"; } });
      const [handler] = handlers;
      const takes = TOOL_RESOURCES.filter((entry) => handler.handle(desk.ctx, desk.server({ id: 9, [entry[2]]: entry[4] })) !== undefined).map((entry) => entry[2]);
      const message = desk.server({ id: 9, execId: "exec-9", [argsName]: argsJson });
      const sent = [];
      for await (const answer of handler.handle(desk.ctx, message)) sent.push(answer);
      out.push([name, {
        handlersRegistered: handlers.length,
        handlerIs: handler instanceof given.controlled.SimpleControlledStreamExecHandler ? "a stream handler" : handler instanceof given.controlled.SimpleControlledExecHandler ? "a handler" : "another thing",
        whatRegisteringGaveBack,
        takes,
        theExecutorGot: { times: asked.length, theContextItself: asked[0][0] === desk.ctx, theRequestItself: asked[0][1] === message.message.value, request: wire(asked[0][1]), execId: asked[0][2].execId },
        sent: sent.map((answer) => wire(answer)),
        theAnswerItself: sent[0].message.value === result,
      }]);
    }
    return out;
  }));

scenario("a manager given every tool's resource sends each request to that tool's executor and its answer home", async (given) =>
  atWork(given, async (desk) => {
    const registry = new given.resources.RegistryResourceAccessor();
    const asked = [];
    for (const [module, name, , resultName, , resultJson] of TOOL_RESOURCES) {
      const result = desk.client({ [resultName]: resultJson }).message.value;
      registry.register(given[module][name], name === STREAMED
        ? { execute: () => { asked.push(name); return scripted([], "", [result]); } }
        : { execute: async () => { asked.push(name); return result; } });
    }
    const manager = given.controlled.SimpleControlledExecManager.fromResources(registry);
    const quiet = { log: [] };
    const out = [];
    let number = 20;
    for (const [, name, argsName, , argsJson] of TOOL_RESOURCES) {
      number += 1;
      const reader = reading(quiet, manager.handle(desk.ctx, desk.server({ id: number, [argsName]: argsJson })));
      await readAll(reader, quiet);
      out.push([name, reader.got.map((message) => message.toJson())]);
    }
    desk.log.splice(0, desk.log.length, ...desk.log.filter(([who]) => who === "metrics").map(([, method, handle, value, labels]) => [method, handle.name, value, labels]));
    return { asked, out };
  }));

/** What a stream is, as far as a caller can tell without reading it. */
const kindOfStream = (stream) => ({
  tag: Object.prototype.toString.call(stream),
  canBeRead: typeof stream[Symbol.asyncIterator],
  isItsOwnReader: stream[Symbol.asyncIterator]() === stream,
  has: ["next", "return", "throw", "write", "close"].filter((name) => typeof stream[name] === "function"),
  ownKeys: Object.keys(stream),
});

scenario("the kinds of stream the part hands out", async (given) => {
  const { controlled, remote, serialization } = given;
  const desk = makeDesk(given);
  return unhandled(() => timed([], () => overheard([], async () => {
    const handler = new controlled.SimpleControlledExecHandler({ execute: async () => ({}) }, serialization.createServerDeserializer("shellArgs"), serialization.createClientSerializer("shellResult"));
    const streamHandler = new controlled.SimpleControlledStreamExecHandler({ execute: () => scripted([], "", []) }, serialization.createServerDeserializer("shellStreamArgs"), serialization.createClientSerializer("shellStream"));
    const manager = new controlled.SimpleControlledExecManager();
    manager.register(handler);
    const readOnly = given.readonly.createReadonlyResourceAccessor({ get: () => undefined }, true);
    const asking = new remote.StreamExecutorResource(connection(desk), serialization.createServerSerializer("shellStreamArgs"), serialization.createClientDeserializer("shellStream"));
    const unary = new remote.ExecutorResource(connection(desk, { steps: [desk.client({ shellResult: {} })] }), serialization.createServerSerializer("shellArgs"), serialization.createClientDeserializer("shellResult"));
    const promise = unary.execute(desk.ctx, {});
    await promise;
    return {
      aHandlersAnswers: kindOfStream(handler.handle(desk.ctx, desk.server({ shellArgs: {} }))),
      aStreamHandlersAnswers: kindOfStream(streamHandler.handle(desk.ctx, desk.server({ shellStreamArgs: {} }))),
      whatAManagerSendsHome: kindOfStream(manager.handle(desk.ctx, desk.server({ id: 1, shellArgs: {} }))),
      whatAManagerSendsHomeWhenNobodyTakesTheMessage: kindOfStream(manager.handle(desk.ctx, desk.server({ id: 2, writeArgs: {} }))),
      aStreamedRequestsEvents: kindOfStream(asking.execute(desk.ctx, {})),
      aRequestsResult: Object.prototype.toString.call(promise),
      aReadOnlyShellStream: kindOfStream(readOnly.get(given.shellStream.shellStreamExecutorResource).execute(undefined, {})),
      aReadOnlyShellsAnswer: Object.prototype.toString.call(readOnly.get(given.shell.shellExecutorResource).execute(undefined, {})),
    };
  })));
});
