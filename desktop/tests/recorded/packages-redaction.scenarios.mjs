/**
 * What is hidden from what is logged or sent on: the privacy modes, what each
 * kind of data may be used for under each, the wrappers that keep a value
 * with its labels, and a conversation's messages wrapped and unwrapped.
 *
 * The tables here are short on purpose. A cell says "value" when the very
 * value came back, "hidden" when the field's placeholder did (for bytes, no
 * bytes at all), "refused" when the refusal was thrown with exactly its
 * usual words, and "+ line" when the console was told, once, the one line
 * the part has for it. Anything else is written out in full, and the usual
 * words themselves are recorded whole in scenarios of their own.
 *
 * The answers were recorded with NODE_ENV not set to "development": the part
 * reads it once, when it is loaded, and the scenarios about a developer's
 * run load the part again on their own.
 */
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { desktopRoot, sourceRoot } from "./harness.mjs";

export const part = "packages/redaction";
export const modules = {
  classification: "source/packages/redaction/classification.ts",
  context: "source/packages/redaction/privacy-context.ts",
  factory: "source/packages/redaction/factory.ts",
  messages: "source/packages/redaction/core-message.ts",
  mode: "source/packages/redaction/privacy-mode.ts",
  should: "source/packages/redaction/shouldRedact.ts",
  types: "source/packages/redaction/types.ts",
};

/** The modes by name, then values that are no mode. */
const MODES = [["unspecified", 0], ["no storage", 1], ["no training", 2], ["data training", 3], ["codebase training", 4]];
const ODD_MODES = [["5", 5], ["-1", -1], ["2.5", 2.5], ['"2"', "2"], ["NaN", Number.NaN], ["undefined", undefined], ["null", null]];

/** What the console is told when an unwrap that was not allowed goes through anyway (recorded whole further down). */
const LOGGER_LINE = "[PRIVACY REDACTION] logger not initialized — call setRedactionLogger() at process startup";

/** What a call returned, or what it threw as `{ threw: "Name: message" }`. */
const thrown = new WeakSet();
function attempt(run) {
  try {
    return run();
  } catch (error) {
    const told = { threw: `${error?.name}: ${error?.message}` };
    thrown.add(told);
    return told;
  }
}

/** A value as a table's cell. */
function shown(value) {
  if (thrown.has(value)) return `threw ${value.threw}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Uint8Array) return `bytes(${Buffer.from(value).toString("hex")})`;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One row: what `run` answers for each named value. */
const across = (pairs, run) => pairs.map(([label, value]) => `${label}: ${run(value)}`).join(" | ");
const named = (values) => values.map((value) => [String(value), value]);
/** A table: a row for each of `rows`, a field for each of `columns`. */
const table = (rows, columns, cell) => Object.fromEntries(rows.map(([rowName, row]) => [rowName, Object.fromEntries(columns.map(([columnName, column]) => [columnName, cell(row, column)]))]));

/** Everything the console is told while `run` runs, kept instead of printed. */
const CONSOLE = ["error", "warn", "log", "info", "debug", "trace"];
function listening(run) {
  const heard = [];
  const kept = Object.fromEntries(CONSOLE.map((method) => [method, console[method]]));
  for (const method of CONSOLE) console[method] = (...args) => { heard.push({ method, args }); };
  try {
    return { result: run(), heard };
  } finally {
    Object.assign(console, kept);
  }
}
const isTheLine = ({ method, args }) => method === "error" && args.length === 1 && args[0] === LOGGER_LINE;
const heardText = (heard) => heard.map((call) => (isTheLine(call) ? " + line" : `, console.${call.method}(${JSON.stringify(call.args)})`)).join("");
/** The same, with what was heard kept short: "the line" for each time the console got its one line. */
const hearing = (run) => {
  const { result, heard } = listening(run);
  return { result, heard: heard.map((call) => (isTheLine(call) ? "the line" : call)) };
};

/** What a developer's run throws when text is made from a field that would be hidden (recorded whole further down), cut to what changes. */
const IMPLICIT = "Error: [PRIVACY REDACTION] ERROR: Redaction via implicit serialization caught in test, please call unwrap() explicitly ";
const brief = (outcome) => (thrown.has(outcome) && outcome.threw.startsWith(IMPLICIT) ? `refused as implicit ${outcome.threw.slice(IMPLICIT.length)}` : outcome);

/**
 * A wrapped structure as it can be kept: each redacted string or bytes with
 * its hidden value, then its labels in their order and its context on one
 * line; each instance of a class with the class's name; the rest as it is.
 */
function seer({ classification, types }) {
  const always = classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
  const labels = (value) => `${Object.entries(value).map(([key, label]) => `${key}=${shown(label)}`).join(", ")}; context ${shown(value.getPrivacyContext())}`;
  const own = (value) => Object.fromEntries(Object.keys(value).map((key) => [key, see(value[key])]));
  const see = (value) => {
    if (value instanceof types.RedactedString) return { "redacted string": value.unwrap(always), labels: labels(value) };
    if (value instanceof types.RedactedBytes) return { "redacted bytes": value.unwrap(always), labels: labels(value) };
    if (Array.isArray(value)) return value.map(see);
    if (value instanceof URL) return { class: "URL", href: value.href };
    if (value === null || typeof value !== "object" || ArrayBuffer.isView(value) || value instanceof Date) return value;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? own(value) : { class: prototype.constructor.name, fields: own(value) };
  };
  return see;
}

/** The two wrappers, for the tables both must answer alike. */
const HELD = [
  { what: "a redacted string", value: () => "the value", make: ({ factory }) => factory.createRedactedString, hidden: (result, field) => result === `[redacted:${field}]` },
  { what: "redacted bytes", value: () => new Uint8Array([1, 2, 3]), make: ({ factory }) => factory.createRedactedBytes, hidden: (result) => result instanceof Uint8Array && result.length === 0 },
];

/** One unwrap as a cell: value, hidden, refused (with exactly the usual words), or the outcome in full; then the console. */
function unwrapCell(held, item, value, { purpose, kind, mode, field }, options = []) {
  const { result, heard } = listening(() => attempt(() => item.unwrap(purpose, ...options)));
  const refusal = `Error: Unwrap not allowed for purpose ${String(purpose)} with classification ${String(kind)} and privacy mode ${String(mode)}`;
  let what;
  if (thrown.has(result)) what = result.threw === refusal ? "refused" : `threw ${result.threw}`;
  else if (result === value) what = "value";
  else if (held.hidden(result, field)) what = "hidden";
  else what = `gives ${shown(result)}`;
  return what + heardText(heard);
}

/**
 * Every way a redacted string is turned to text, as one cell when they agree:
 * value, hidden, or "refused as implicit" when each way threw a developer's
 * run's refusal, word for word, naming the field, the kind of data and its own way.
 */
function textCell(item, value, field, kind) {
  const ways = [["toString", () => item.toString()], ["toJSON", () => item.toJSON()], ["valueOf", () => item.valueOf()], ["toPrimitive", () => `${item}`], ["toPrimitive", () => String(item)], ["toPrimitive", () => "" + item], ["toPrimitive", () => item[Symbol.toPrimitive]("string")], ["toPrimitive", () => item[Symbol.toPrimitive]("default")], ["toJSON", () => JSON.parse(JSON.stringify([item]))[0]]];
  const { result: results, heard } = listening(() => ways.map(([, way]) => attempt(way)));
  const told = results.map((result, index) => {
    if (thrown.has(result)) return result.threw === `${IMPLICIT}(field=${field}, classification=${kind}, path=${ways[index][0]})` ? "refused as implicit" : `threw ${result.threw}`;
    return result === value ? "value" : result === `[redacted:${field}]` ? "hidden" : shown(result);
  });
  const distinct = [...new Set(told)];
  return (distinct.length === 1 ? distinct[0] : told.join(" / ")) + heardText(heard);
}

/** The enforcement settings every unwrap table is asked under. */
const ENFORCEMENTS = [
  { name: (what) => `unwrapping ${what} with no enforcement always gives the value, and tells the console when the purpose was not allowed`, context: (mode) => mode, options: [] },
  { name: (what) => `unwrapping ${what} whose context enforces redaction refuses what the purpose does not allow`, context: (mode) => ({ privacyMode: mode, enforceRedaction: true }), options: [] },
  { name: (what) => `unwrapping ${what} with enforcement asked for in the call refuses the same`, context: (mode) => mode, options: [{ enforcing: true }] },
  { name: (what) => `unwrapping ${what} whose context enforces redaction hides the field instead of refusing, when asked to`, context: (mode) => ({ privacyMode: mode, enforceRedaction: true }), options: [{ redactUnallowedFieldsInsteadOfThrowing: true }] },
  { name: (what) => `unwrapping ${what} with enforcement asked for in the call hides the field instead of refusing, when asked to`, context: (mode) => mode, options: [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true }] },
  { name: (what) => `unwrapping ${what} whose context says not to enforce gives the value even when asked to hide`, context: (mode) => ({ privacyMode: mode, enforceRedaction: false }), options: [{ redactUnallowedFieldsInsteadOfThrowing: true }] },
];

const unwrapTables = HELD.flatMap((held) => ENFORCEMENTS.map(({ name, context, options }) => ({
  name: name(held.what),
  run: (m) => {
    const { DataClassification, PrivacyCapability } = m.classification;
    const make = held.make(m);
    return table(named([...Object.values(DataClassification), "made_up"]), named(Object.values(PrivacyCapability)), (kind, purpose) => across([...MODES, ["9", 9]], (mode) => {
      const value = held.value();
      return unwrapCell(held, make(value, kind, "field", context(mode)), value, { purpose, kind, mode, field: "field" }, options);
    }));
  },
})));

const unwrapOptions = HELD.map((held) => ({
  name: `unwrapping ${held.what}: any true-like enforcement or hiding counts, and the call's enforcement is added to the context's`,
  run: (m) => {
    const { CODE } = m.classification.DataClassification;
    const purpose = m.classification.PrivacyCapability.STORAGE_FOR_LOGGING;
    const make = held.make(m);
    const contexts = [["a mode alone", 1], ["context says nothing", { privacyMode: 1 }], ["context says true", { privacyMode: 1, enforceRedaction: true }], ["context says false", { privacyMode: 1, enforceRedaction: false }], ["context says null", { privacyMode: 1, enforceRedaction: null }], ["context says 1", { privacyMode: 1, enforceRedaction: 1 }]];
    const calls = [
      ["no options", []], ["undefined", [undefined]], ["null", [null]], ["{}", [{}]],
      ["enforcing false", [{ enforcing: false }]], ["enforcing 0", [{ enforcing: 0 }]], ['enforcing ""', [{ enforcing: "" }]], ["enforcing null", [{ enforcing: null }]],
      ["enforcing true", [{ enforcing: true }]], ["enforcing 1", [{ enforcing: 1 }]], ['enforcing "yes"', [{ enforcing: "yes" }]],
      ["hide true", [{ redactUnallowedFieldsInsteadOfThrowing: true }]],
      ["enforcing true, hide false", [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: false }]], ["enforcing true, hide 0", [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: 0 }]], ["enforcing true, hide null", [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: null }]],
      ["enforcing true, hide 1", [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: 1 }]], ['enforcing true, hide "yes"', [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: "yes" }]],
      ["enforcing false, hide true", [{ enforcing: false, redactUnallowedFieldsInsteadOfThrowing: true }]],
    ];
    return table(contexts, calls, (context, options) => {
      const value = held.value();
      return unwrapCell(held, make(value, CODE, "field", context), value, { purpose, kind: CODE, mode: 1, field: "field" }, options);
    });
  },
}));

const unwrapOdd = HELD.map((held) => ({
  name: `unwrapping ${held.what} for a purpose or under a mode nobody knows fails as the purposes' own rules say`,
  run: (m) => {
    const { SAFE, CODE, CREDENTIALS, PATH } = m.classification.DataClassification;
    const { STORAGE_FOR_LOGGING, STORAGE_FOR_USAGE, UNSAFE_ALWAYS_ALLOWED } = m.classification.PrivacyCapability;
    const make = held.make(m);
    const cases = [
      [CODE, 1, "something_else", []], [CODE, 1, undefined, []], [CODE, { privacyMode: 1, enforceRedaction: true }, "something_else", [{ redactUnallowedFieldsInsteadOfThrowing: true }]],
      [SAFE, 1, "something_else", []], [CREDENTIALS, 3, "something_else", []], [CREDENTIALS, { privacyMode: 3, enforceRedaction: true }, "something_else", []],
      [CODE, 9, STORAGE_FOR_LOGGING, []], [PATH, { privacyMode: 9, enforceRedaction: true }, STORAGE_FOR_USAGE, [{ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true }]],
      [CODE, 9, UNSAFE_ALWAYS_ALLOWED, []], [SAFE, 9, STORAGE_FOR_LOGGING, []], [CREDENTIALS, 9, STORAGE_FOR_LOGGING, []], [CREDENTIALS, { privacyMode: 9, enforceRedaction: true }, STORAGE_FOR_LOGGING, []],
      [CODE, undefined, STORAGE_FOR_LOGGING, []], [CODE, null, STORAGE_FOR_LOGGING, []], [CODE, "1", STORAGE_FOR_LOGGING, []],
    ];
    return cases.map(([kind, context, purpose, options]) => {
      const value = held.value();
      const mode = context !== null && typeof context === "object" ? context.privacyMode : context;
      return `${kind}, ${shown(context)}, for ${shown(purpose)}${options.length === 0 ? "" : `, ${shown(options[0])}`}: ${unwrapCell(held, make(value, kind, "field", context), value, { purpose, kind, mode, field: "field" }, options)}`;
    });
  },
}));

/** A conversation as the engine holds one: every role, every kind of part it tells apart, and some it does not. */
function conversation() {
  return [
    { role: "system", content: "You are Simeon. Keep answers short.", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }, id: "msg_system" },
    { role: "user", content: "Fix the login test", providerOptions: { simeon: { requestId: "req_1" } }, id: "msg_user_1" },
    {
      role: "user",
      content: [
        { type: "text", text: "What is in this picture?", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }, extra: "not kept" },
        { type: "image", image: "data:image/png;base64,AAAA", mimeType: "image/png" },
        { type: "image", image: new Uint8Array([137, 80, 78, 71]), mimeType: "image/png", providerOptions: { openai: { imageDetail: "low" } }, extra: "not kept" },
        { type: "image", image: new URL("https://example.test/cat.png") },
        { type: "file", data: "JVBERi0x", mimeType: "application/pdf", filename: "report.pdf", providerOptions: { a: 1 } },
        { type: "file", data: new Uint8Array([1, 2, 3]), mimeType: "application/octet-stream" },
        { type: "text", text: "" },
      ],
    },
    {
      role: "assistant",
      id: "msg_assistant_1",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      content: [
        { type: "reasoning", text: "The test fails because the cookie is never set.", signature: "sig_abc", providerOptions: { anthropic: { signature: "sig_abc" } } },
        { type: "redacted-reasoning", data: "b3BhcXVl" },
        { type: "text", text: "I'll read the file first.", providerOptions: { openai: { itemId: "item_1" } }, extra: "not kept" },
        { type: "text", text: "Then run it." },
        { type: "tool-call", toolCallId: "call_1", toolName: "Read", args: { path: "/home/ada/app/login.test.ts", limit: 40, nested: { deep: [1, { two: 2 }] } }, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }, extra: "not kept" },
        { type: "tool-call", toolCallId: "call_2", toolName: "Shell", args: "ls -la" },
        { type: "tool-call", toolCallId: "call_3", toolName: "NoArguments" },
        { type: "tool-call", toolCallId: "call_4", toolName: "LaterShape", input: { not: "read" }, providerExecuted: true },
        { type: "file", data: "AAAA", mimeType: "image/png" },
        { type: "tool-result", toolCallId: "call_0", toolName: "Earlier", result: "done" },
        { type: "unknown", anything: 1 },
        { text: "a part with no type" },
      ],
    },
    {
      role: "tool",
      id: "msg_tool_1",
      providerOptions: { simeon: { requestId: "req_1" } },
      content: [
        { type: "tool-result", toolCallId: "call_1", toolName: "Read", result: "line one\nline two" },
        { type: "tool-result", toolCallId: "call_2", toolName: "Shell", result: { exitCode: 1, stdout: "", stderr: "ls: not found" }, isError: true, extra: "not kept" },
        { type: "tool-result", toolCallId: "call_3", toolName: "Screenshot", result: "see the picture", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }, experimental_content: [{ type: "text", text: "A screenshot of the page", extra: "not kept" }, { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }, { type: "text", text: 42 }, { type: "text" }, { kind: "no type" }] },
        { type: "tool-result", toolCallId: "call_4", toolName: "NoResult" },
        { type: "tool-result", toolCallId: "call_5", toolName: "Flags", result: null, isError: false, experimental_content: [] },
        { type: "something-else", toolCallId: "call_6", toolName: "NotCalledAResult", result: [1, "two", { three: 3 }], output: "not read" },
      ],
    },
  ];
}

/** The part loaded once more, on its own, with the environment as given while it loads. */
async function loadedUnder(env, tools) {
  const out = await tools.tmp();
  await build({
    entryPoints: Object.fromEntries(Object.entries(modules).map(([key, file]) => [key, path.join(sourceRoot(), file)])),
    outdir: out,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    outExtension: { ".js": ".mjs" },
    nodePaths: [path.join(desktopRoot, "node_modules")],
  });
  const set = (values) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  const kept = Object.fromEntries(["NODE_ENV", "VITEST", ...Object.keys(env)].map((name) => [name, process.env[name]]));
  set({ NODE_ENV: undefined, VITEST: undefined, ...env });
  try {
    const loaded = {};
    for (const key of Object.keys(modules)) loaded[key] = await import(pathToFileURL(path.join(out, `${key}.mjs`)).href);
    return loaded;
  } finally {
    set(kept);
  }
}

/** Whether a load treats itself as a developer's: text made from a field that would be hidden is refused, and a let-through unwrap says nothing. */
function developerSigns(loaded) {
  const made = loaded.factory.createRedactedString("the value", loaded.classification.DataClassification.CODE, "user_text", 1);
  return {
    text: brief(attempt(() => String(made))),
    unwrap: hearing(() => attempt(() => made.unwrap(loaded.classification.PrivacyCapability.STORAGE_FOR_LOGGING))),
  };
}

export const scenarios = [
  // The modes, the kinds of data and the purposes.
  {
    name: "the privacy modes are five numbers, from unspecified (0) to codebase training allowed (4)",
    run: ({ mode }) => ({ modes: Object.entries(mode.PrivacyMode), frozen: Object.isFrozen(mode.PrivacyMode) }),
  },
  {
    name: "the kinds of data, the ones held sensitive in their order, and the purposes data is asked for",
    run: ({ classification }) => ({
      kinds: Object.entries(classification.DataClassification),
      sensitive: [...classification.SENSITIVE_CLASSIFICATIONS],
      purposes: Object.entries(classification.PrivacyCapability),
      frozen: [classification.DataClassification, classification.SENSITIVE_CLASSIFICATIONS, classification.PrivacyCapability].map((value) => Object.isFrozen(value)),
    }),
  },
  {
    name: "whether a purpose is allowed, for every kind of data, every purpose and every mode",
    run: ({ classification }) => {
      const { allowedPurpose, DataClassification, PrivacyCapability } = classification;
      return table(named([...Object.values(DataClassification), "made_up", undefined]), named([...Object.values(PrivacyCapability), "something_else", undefined]), (kind, purpose) => across([...MODES, ...ODD_MODES], (mode) => {
        const outcome = attempt(() => allowedPurpose(mode, purpose, kind));
        if (outcome === true) return "yes";
        if (outcome === false) return "no";
        if (thrown.has(outcome) && outcome.threw === `Error: Unknown purpose: ${String(purpose)}`) return "unknown purpose";
        if (thrown.has(outcome) && outcome.threw === `Error: Unknown privacy mode: ${String(mode)}`) return "unknown mode";
        return shown(outcome);
      }));
    },
  },
  {
    name: "an unknown purpose or mode is written into the error as text, and neither is looked at when the kind of data already decides",
    run: ({ classification }) => {
      const { allowedPurpose, DataClassification, PrivacyCapability } = classification;
      const { SAFE, CODE, CREDENTIALS, PATH } = DataClassification;
      return [
        attempt(() => allowedPurpose(2, { toString: () => "spelled by the object" }, CODE)),
        attempt(() => allowedPurpose(2, Symbol("purpose"), CODE)),
        attempt(() => allowedPurpose(2, null, PATH)),
        attempt(() => allowedPurpose(2, 7, PATH)),
        attempt(() => allowedPurpose(2, ["storage_for_usage"], PATH)),
        attempt(() => allowedPurpose({ toString: () => "a mode of its own" }, PrivacyCapability.STORAGE_FOR_USAGE, CODE)),
        attempt(() => allowedPurpose(Symbol("mode"), PrivacyCapability.STORAGE_FOR_USAGE, CODE)),
        attempt(() => allowedPurpose([1], PrivacyCapability.STORAGE_FOR_USAGE, CODE)),
        attempt(() => allowedPurpose(Symbol("mode"), Symbol("purpose"), CODE)),
        allowedPurpose(Symbol("mode"), Symbol("purpose"), SAFE),
        allowedPurpose(Symbol("mode"), PrivacyCapability.UNSAFE_ALWAYS_ALLOWED, Symbol("kind")),
        allowedPurpose(Symbol("mode"), Symbol("purpose"), CREDENTIALS),
        attempt(() => allowedPurpose()),
        attempt(() => allowedPurpose(9, PrivacyCapability.STORAGE_FOR_LOGGING, PATH)),
        attempt(() => allowedPurpose("2", PrivacyCapability.STORAGE_FOR_TRAINING, CODE)),
        attempt(() => allowedPurpose(2, "something_else", CODE)),
      ];
    },
  },

  // The context: a mode, and whether redaction is enforced.
  {
    name: "redaction is enforced only when the context itself says true, whatever the mode and the kind of data",
    run: ({ context, classification }) => {
      const { resolveEnforceRedaction } = context;
      const { CODE } = classification.DataClassification;
      const choices = [["not given", {}], ["undefined", { enforceRedaction: undefined }], ["true", { enforceRedaction: true }], ["false", { enforceRedaction: false }], ["null", { enforceRedaction: null }], ["the number 1", { enforceRedaction: 1 }], ["the number 0", { enforceRedaction: 0 }], ['"true"', { enforceRedaction: "true" }], ["{}", { enforceRedaction: {} }]];
      return {
        byChoice: Object.fromEntries(choices.map(([label, choice]) => [label, across([...MODES, ...ODD_MODES], (mode) => shown(attempt(() => resolveEnforceRedaction({ privacyMode: mode, ...choice }, CODE))))])),
        byKind: Object.fromEntries(named([...Object.values(classification.DataClassification), "made_up", undefined]).map(([label, kind]) => [label, [{ privacyMode: 1 }, { privacyMode: 1, enforceRedaction: true }, { privacyMode: 1, enforceRedaction: false }].map((given) => resolveEnforceRedaction(given, kind)).join(", ")])),
        withNoMode: [resolveEnforceRedaction({}, CODE), resolveEnforceRedaction({ enforceRedaction: true }, CODE)],
        withNoContext: [attempt(() => resolveEnforceRedaction(undefined, CODE)), attempt(() => resolveEnforceRedaction(null, CODE)), resolveEnforceRedaction("a mode's name", CODE), resolveEnforceRedaction(1, CODE)],
      };
    },
  },
  {
    name: "a context made from a mode carries the enforcement choice only when one is given",
    run: ({ context }) => {
      const { privacyContextFromMode } = context;
      return {
        contexts: [privacyContextFromMode(1), privacyContextFromMode(1, undefined), privacyContextFromMode(1, true), privacyContextFromMode(2, false), privacyContextFromMode(0, null), privacyContextFromMode(3, 0), privacyContextFromMode(4, "yes"), privacyContextFromMode(undefined), privacyContextFromMode(), privacyContextFromMode("2", true), privacyContextFromMode({ privacyMode: 1 })],
        aNewOneEachTime: privacyContextFromMode(1) !== privacyContextFromMode(1),
      };
    },
  },
  {
    name: "a mode becomes a context, and a context is handed back as the very object it is",
    run: ({ context }) => {
      const { toPrivacyContext } = context;
      const given = [{ privacyMode: 2 }, { privacyMode: 1, enforceRedaction: true, note: "kept, it is the same object" }, Object.create({ privacyMode: 3 }), Object.freeze({ privacyMode: 4, enforceRedaction: false }), { privacyMode: undefined }, Object.assign([], { privacyMode: 1 })];
      const labelled = Object.assign(() => {}, { privacyMode: 1 });
      const fromFunction = toPrivacyContext(labelled);
      return {
        fromModes: [...MODES, ...ODD_MODES].map(([, mode]) => toPrivacyContext(mode)),
        contextsComeBackThemselves: given.map((one) => toPrivacyContext(one) === one),
        notContexts: [toPrivacyContext({ enforceRedaction: true }), toPrivacyContext([]), toPrivacyContext("no storage"), toPrivacyContext(true), toPrivacyContext()],
        aFunctionIsNotAContext: [fromFunction === labelled, fromFunction.privacyMode === labelled, Object.keys(fromFunction)],
        aNewOneEachTime: toPrivacyContext(1) !== toPrivacyContext(1),
      };
    },
  },

  // What is hidden, and what is shown in its place.
  {
    name: "what is hidden: credentials and the unclassified always, safe data never, the rest unless the mode allows training",
    run: ({ should, classification }) => Object.fromEntries(named([...Object.values(classification.DataClassification), "made_up", undefined, null]).map(([label, kind]) => [label, across([...MODES, ...ODD_MODES], (mode) => shown(should.shouldRedact(mode, kind)))])),
  },
  {
    name: "the list of sensitive kinds is read each time something asks whether to hide",
    run: ({ should, classification, types }) => {
      const list = classification.SENSITIVE_CLASSIFICATIONS;
      const { SAFE, CODE, CREDENTIALS, PATH } = classification.DataClassification;
      const kept = [...list];
      const ask = () => ({
        hide: [CODE, PATH, "made_up", SAFE, CREDENTIALS].map((kind) => `${kind}: ${should.shouldRedact(1, kind)}`).join(", "),
        madeUpWhenTrainingIsAllowed: should.shouldRedact(4, "made_up"),
        aNewStringOfCode: new types.RedactedString("v", CODE, "f", 1).__isRedacted,
      });
      const answers = { before: ask() };
      try {
        list.splice(list.indexOf(CODE), 1);
        list.push("made_up");
        answers.withoutCodeAndWithOneMore = ask();
        list.length = 0;
        list.push(SAFE);
        answers.withOnlySafeInIt = ask();
      } finally {
        list.length = 0;
        list.push(...kept);
      }
      answers.putBack = ask();
      return answers;
    },
  },
  {
    name: "a hidden field shows its name in square brackets after redacted:",
    run: ({ should }) => [
      ...["user_text", "", "summary.clone", " spaced name ", "[redacted:inner]", undefined, null, 12, { toString: () => "by its own words" }, ["a", "b"]].map((name) => should.formatRedacted(name)),
      should.formatRedacted(),
      attempt(() => should.formatRedacted(Symbol("name"))),
    ],
  },
  {
    name: "the value shown is the real one unless redaction is enforced and the field is one to hide",
    run: ({ should, classification }) => {
      const choices = [["not given", {}], ["undefined", { enforceRedaction: undefined }], ["false", { enforceRedaction: false }], ["true", { enforceRedaction: true }], ["null", { enforceRedaction: null }], ["the number 1", { enforceRedaction: 1 }], ['"true"', { enforceRedaction: "true" }]];
      const cell = (options) => {
        const { result, heard } = listening(() => attempt(() => should.getRedactionAwareDisplayValue(options)));
        return (result === options.unredactedValue ? "value" : result === `[redacted:${options.fieldName}]` ? "hidden" : shown(result)) + heardText(heard);
      };
      return table(choices, named([...Object.values(classification.DataClassification), "made_up"]), (choice, kind) => across([...MODES, ["9", 9], ["undefined", undefined]], (mode) => cell({ privacyMode: mode, classification: kind, fieldName: "field", unredactedValue: "the value", ...choice })));
    },
  },
  {
    name: "the value shown is handed back as it is, text or not, and nothing given is an error",
    run: ({ should, classification }) => {
      const { getRedactionAwareDisplayValue } = should;
      const { CODE } = classification.DataClassification;
      const value = { not: "text" };
      return {
        theSameObject: getRedactionAwareDisplayValue({ privacyMode: 1, classification: CODE, fieldName: "f", unredactedValue: value }) === value,
        theSameObjectWhenNotHidden: getRedactionAwareDisplayValue({ privacyMode: 4, classification: CODE, fieldName: "f", unredactedValue: value, enforceRedaction: true }) === value,
        hidden: ["user_text", "", undefined].map((fieldName) => getRedactionAwareDisplayValue({ privacyMode: 1, classification: CODE, fieldName, unredactedValue: value, enforceRedaction: true })),
        noValue: [getRedactionAwareDisplayValue({ privacyMode: 1, classification: CODE, fieldName: "f" }), getRedactionAwareDisplayValue({}), getRedactionAwareDisplayValue({ enforceRedaction: true }), getRedactionAwareDisplayValue({ enforceRedaction: true, classification: CODE })],
        noOptions: [attempt(() => getRedactionAwareDisplayValue()), attempt(() => getRedactionAwareDisplayValue(null))],
      };
    },
  },

  // Making the wrappers.
  {
    name: "a redacted string is made from a value, a kind of data, a field name and a mode or a context",
    run: (m) => {
      const see = seer(m);
      const { CODE, PATH, CREDENTIALS, SAFE } = m.classification.DataClassification;
      const { createRedactedString } = m.factory;
      const made = createRedactedString("print('hello')", CODE, "user_text", 1);
      return {
        fromAMode: see(made),
        fromAContext: see(createRedactedString("/home/ada/notes.txt", PATH, "folder_path", { privacyMode: 2, enforceRedaction: true })),
        aKey: see(createRedactedString("sk-not-a-real-key", CREDENTIALS, "api_key", 4)),
        safe: see(createRedactedString("ok", SAFE, "status", 0)),
        emptyWithNoLabels: see(createRedactedString("")),
        isOfTheClass: made instanceof m.types.RedactedString,
        className: made.constructor.name,
        labelsInOrder: Object.keys(made),
        aNewOneEachTime: createRedactedString("a", CODE, "f", 1) !== createRedactedString("a", CODE, "f", 1),
      };
    },
  },
  {
    name: "safe text is a redacted string anyone may read, under the field name safe and the most open mode",
    run: (m) => {
      const see = seer(m);
      const { safeString } = m.factory;
      const made = safeString("Simeon");
      const purposes = Object.values(m.classification.PrivacyCapability);
      return {
        made: see(made),
        others: [safeString(""), safeString(undefined), safeString(7)].map(see),
        readForEveryPurpose: purposes.map((purpose) => hearing(() => made.unwrap(purpose, { enforcing: true }))),
        text: [String(made), JSON.stringify({ made })],
        isOfTheClass: made instanceof m.types.RedactedString,
      };
    },
  },
  {
    name: "redacted bytes are made from bytes, a kind of data, a field name and a mode or a context",
    run: (m) => {
      const see = seer(m);
      const { CODE, SAFE } = m.classification.DataClassification;
      const { createRedactedBytes } = m.factory;
      const bytes = new Uint8Array([104, 105]);
      const made = createRedactedBytes(bytes, CODE, "data", 1);
      return {
        fromAMode: see(made),
        fromAContext: see(createRedactedBytes(new Uint8Array(0), SAFE, "blob", { privacyMode: 0, enforceRedaction: false })),
        withNoLabels: see(createRedactedBytes(new Uint8Array([0]))),
        holdsTheVeryBytes: made.unwrap(m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED) === bytes,
        isOfTheClass: made instanceof m.types.RedactedBytes,
        isNotAString: made instanceof m.types.RedactedString,
        className: made.constructor.name,
        labelsInOrder: Object.keys(made),
      };
    },
  },

  // A redacted string: what it remembers.
  {
    name: "a redacted string knows from the start whether it would be hidden, for every kind of data and mode",
    run: ({ types, classification }) => ({
      fromAMode: Object.fromEntries(named([...Object.values(classification.DataClassification), "made_up", undefined]).map(([label, kind]) => [label, across([...MODES, ...ODD_MODES], (mode) => shown(new types.RedactedString("v", kind, "f", mode).__isRedacted))])),
      whateverTheEnforcement: [true, false, undefined].map((enforceRedaction) => [1, 4].map((privacyMode) => new types.RedactedString("v", classification.DataClassification.CODE, "f", { privacyMode, enforceRedaction }).__isRedacted)),
    }),
  },
  {
    name: "a redacted string's length and emptiness are those of its value",
    run: ({ types }) => ["", "a", "héllo", "😀", " \n", "x".repeat(1000)].map((value) => {
      const made = new types.RedactedString(value, "code", "f", 1);
      return `${JSON.stringify(value.slice(0, 8))}: length ${made.length}, empty ${made.empty}`;
    }),
  },
  {
    name: "a redacted string gives its context as a new object each time, with the mode and the enforcement choice and nothing else",
    run: ({ types }) => [1, { privacyMode: 2 }, { privacyMode: 2, enforceRedaction: true }, { privacyMode: 3, enforceRedaction: false }, { privacyMode: 1, enforceRedaction: undefined }, { privacyMode: 1, enforceRedaction: null }, { privacyMode: 4, enforceRedaction: true, note: "left behind" }, { enforceRedaction: true }, undefined, null].map((modeOrContext) => {
      const made = new types.RedactedString("v", "code", "f", modeOrContext);
      const first = made.getPrivacyContext();
      return { context: first, notTheOneGiven: first !== modeOrContext, aNewOneEachTime: made.getPrivacyContext() !== first, mode: made.__privacyMode };
    }),
  },

  // Unwrapping, for strings and for bytes.
  ...unwrapTables,
  ...unwrapOptions,
  ...unwrapOdd,
  {
    name: "the line the console gets, once for each unwrap that was not allowed and went through",
    run: (m) => {
      const { CODE, CREDENTIALS } = m.classification.DataClassification;
      const { STORAGE_FOR_LOGGING, STORAGE_FOR_TRAINING } = m.classification.PrivacyCapability;
      const text = m.factory.createRedactedString("the value", CODE, "user_text", 1);
      const bytes = m.factory.createRedactedBytes(new Uint8Array([1]), CREDENTIALS, "data", 3);
      return [
        listening(() => text.unwrap(STORAGE_FOR_LOGGING)),
        listening(() => bytes.unwrap(STORAGE_FOR_TRAINING)),
        listening(() => [text.unwrap(STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true }), text.unwrap(STORAGE_FOR_TRAINING, {})]),
      ];
    },
  },
  {
    name: "a refusal names the purpose, the kind of data and the mode",
    run: (m) => {
      const { CODE, CREDENTIALS, UNSPECIFIED } = m.classification.DataClassification;
      const { STORAGE_FOR_LOGGING, STORAGE_FOR_TRAINING, STORAGE_FOR_USAGE } = m.classification.PrivacyCapability;
      const { createRedactedString, createRedactedBytes } = m.factory;
      return hearing(() => [
        attempt(() => createRedactedString("v", CODE, "user_text", { privacyMode: 1, enforceRedaction: true }).unwrap(STORAGE_FOR_LOGGING)),
        attempt(() => createRedactedString("v", CREDENTIALS, "api_key", 4).unwrap(STORAGE_FOR_USAGE, { enforcing: true })),
        attempt(() => createRedactedString("v", UNSPECIFIED, "unlabelled", 0).unwrap(STORAGE_FOR_TRAINING, { enforcing: true })),
        attempt(() => createRedactedBytes(new Uint8Array([1]), CODE, "data", { privacyMode: 2, enforceRedaction: true }).unwrap(STORAGE_FOR_TRAINING)),
        attempt(() => createRedactedBytes(new Uint8Array([1]), "made_up", "data", 0).unwrap(STORAGE_FOR_USAGE, { enforcing: true })),
      ]);
    },
  },

  // A redacted string as text.
  {
    name: "turned to text in any way, a redacted string shows its value unless redaction is enforced and the field is one to hide",
    run: (m) => {
      const settings = [["a mode alone", (mode) => mode], ["context enforces", (mode) => ({ privacyMode: mode, enforceRedaction: true })], ["context says not to enforce", (mode) => ({ privacyMode: mode, enforceRedaction: false })]];
      return table(settings, named([...Object.values(m.classification.DataClassification), "made_up"]), (context, kind) => across([...MODES, ["9", 9]], (mode) => textCell(m.factory.createRedactedString("the value", kind, "field", context(mode)), "the value", "field", kind)));
    },
  },
  {
    name: "every way of turning a redacted string to text, a number or a tag, written out",
    run: (m) => {
      const { CODE } = m.classification.DataClassification;
      const all = (item) => hearing(() => ({
        toString: item.toString(),
        toJSON: item.toJSON(),
        valueOf: item.valueOf(),
        template: `${item}`,
        String: String(item),
        joined: "before " + item,
        plusOne: item + 1,
        json: JSON.stringify({ field: item, list: [item] }),
        asPrimitive: ["string", "default", "number", undefined, "anything else"].map((hint) => item[Symbol.toPrimitive](hint)),
        asNumber: [+item, Number(item), item * 2],
        looselyEqualToItsValue: item == "the value",
        greaterThanText: item > "a",
        tag: Object.prototype.toString.call(item),
        typeOf: typeof item,
      }));
      return {
        notEnforced: all(m.factory.createRedactedString("the value", CODE, "user_text", 1)),
        enforced: all(m.factory.createRedactedString("the value", CODE, "user_text", { privacyMode: 1, enforceRedaction: true })),
        safe: all(m.factory.safeString("the value")),
      };
    },
  },
  {
    name: "a context changed after a redacted string was made changes what it shows and enforces, not the mode it remembers",
    run: (m) => {
      const { CODE } = m.classification.DataClassification;
      const { STORAGE_FOR_LOGGING } = m.classification.PrivacyCapability;
      const context = { privacyMode: 1 };
      const text = m.factory.createRedactedString("the value", CODE, "user_text", context);
      const clone = text.__clone("the clone's value");
      const cut = text.slice(0, 3);
      const bytes = m.factory.createRedactedBytes(new Uint8Array([7]), CODE, "data", context);
      const look = () => hearing(() => ({
        mode: text.__privacyMode,
        wouldBeHidden: text.__isRedacted,
        context: text.getPrivacyContext(),
        text: [String(text), String(clone), String(cut)],
        forLogging: attempt(() => text.unwrap(STORAGE_FOR_LOGGING)),
        forLoggingOrHidden: attempt(() => text.unwrap(STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true })),
        bytesForLogging: attempt(() => bytes.unwrap(STORAGE_FOR_LOGGING)),
        bytesContext: bytes.getPrivacyContext(),
        aNewClone: [text.__clone("x").__privacyMode, text.__clone("x").__isRedacted],
      }));
      const steps = { asMade: look() };
      context.enforceRedaction = true;
      steps.thenEnforced = look();
      context.privacyMode = 4;
      steps.thenInAModeThatAllows = look();
      context.enforceRedaction = false;
      steps.thenNotEnforced = look();
      delete context.enforceRedaction;
      context.privacyMode = 0;
      steps.thenUnspecifiedWithNoChoice = look();
      return steps;
    },
  },
  {
    name: "the labels on a redacted string are read each time they are used",
    run: (m) => {
      const { CODE, SAFE } = m.classification.DataClassification;
      const { STORAGE_FOR_LOGGING } = m.classification.PrivacyCapability;
      const text = m.factory.createRedactedString("  the value  ", CODE, "user_text", { privacyMode: 1, enforceRedaction: true });
      const look = () => hearing(() => ({
        labels: Object.entries(text),
        text: String(text),
        forLogging: attempt(() => text.unwrap(STORAGE_FOR_LOGGING)),
        forLoggingOrHidden: attempt(() => text.unwrap(STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true })),
        clone: Object.entries(text.__clone("x")),
        trimmed: Object.entries(text.trim()),
      }));
      const steps = { asMade: look() };
      text.__fieldName = "renamed";
      steps.renamed = look();
      text.__classification = SAFE;
      steps.thenCalledSafe = look();
      text.__classification = CODE;
      text.__privacyMode = 4;
      steps.thenCodeAgainUnderAModeThatAllows = look();
      text.__isRedacted = false;
      steps.thenSaidNotHidden = look();
      return steps;
    },
  },
  {
    name: "a clone of a redacted string carries a new value under the field name with .clone added, and follows the same context",
    run: (m) => {
      const see = seer(m);
      const { CODE, PATH } = m.classification.DataClassification;
      const context = { privacyMode: 2, enforceRedaction: true };
      const made = m.factory.createRedactedString("first", PATH, "folder_path", context);
      const clone = made.__clone("second");
      const again = clone.__clone("third");
      const answers = {
        original: see(made),
        clone: see(clone),
        aCloneOfTheClone: see(again),
        aNewObject: clone !== made,
        ofTheClass: clone instanceof m.types.RedactedString,
        fromAMode: see(m.factory.createRedactedString("v", CODE, "f", 1).__clone("w")),
        notText: [made.__clone(undefined), made.__clone(42), made.__clone()].map(see),
        enforced: [String(made), String(clone), String(again)],
      };
      context.enforceRedaction = false;
      answers.afterTheContextStopsEnforcing = [String(made), String(clone), String(again)];
      return answers;
    },
  },
  {
    name: "a safe transform works on the real value and gives a redacted string with the same labels",
    run: (m) => {
      const see = seer(m);
      const { CODE } = m.classification.DataClassification;
      const made = m.factory.createRedactedString("the value", CODE, "user_text", { privacyMode: 1, enforceRedaction: true });
      const given = [];
      const longer = made.safeTransform((...args) => { given.push(args); return `${args[0]}, and more`; });
      return {
        whatTheTransformIsGiven: given,
        longer: see(longer),
        original: see(made),
        aNewObject: longer !== made,
        twice: see(longer.safeTransform((value) => value.toUpperCase())),
        notText: [made.safeTransform(() => 42), made.safeTransform(() => undefined), made.safeTransform(() => ["a"])].map(see),
        itsOwnError: attempt(() => made.safeTransform(() => { throw new RangeError("the transform's own error"); })),
        noTransform: [attempt(() => made.safeTransform()), attempt(() => made.safeTransform("not a function"))],
      };
    },
  },

  // A redacted string's text operations.
  {
    name: "questions about a redacted string's text are answered from the real value",
    run: (m) => {
      const made = m.factory.createRedactedString("Hello, hello, world", m.classification.DataClassification.CODE, "user_text", { privacyMode: 1, enforceRedaction: true });
      return {
        startsWith: [made.startsWith("Hello"), made.startsWith("hello"), made.startsWith("hello", 7), made.startsWith(""), made.startsWith("Hello", -5)],
        endsWith: [made.endsWith("world"), made.endsWith("World"), made.endsWith("hello", 12), made.endsWith("", 0), made.endsWith("Hello", 5)],
        includes: [made.includes("lo, h"), made.includes("Hello", 1), made.includes(""), made.includes("WORLD")],
        indexOf: [made.indexOf("hello"), made.indexOf("hello", 8), made.indexOf("absent"), made.indexOf(""), made.indexOf("l", -3)],
        lastIndexOf: [made.lastIndexOf("hello"), made.lastIndexOf("l", 3), made.lastIndexOf("absent"), made.lastIndexOf("")],
        search: [made.search(/h/), made.search(/w\w+/), made.search("wor"), made.search(/\d/), made.search("l+o")],
        localeCompare: [made.localeCompare("Hello, hello, world"), made.localeCompare("a", "en"), made.localeCompare("z", "en"), made.localeCompare("HELLO, HELLO, WORLD", "en"), made.localeCompare("HELLO, HELLO, WORLD", "en", { sensitivity: "base" }), made.localeCompare("HELLO, HELLO, WORLD", ["en"], { sensitivity: "accent" }), made.localeCompare("hello, hello, world", "en", { caseFirst: "upper" }), made.localeCompare("Hello, hello, world", "de", { sensitivity: "variant" })],
        // With no language named the machine's own decides: kept as whether the answer is the text's own.
        localeCompareInTheMachinesLanguage: [["a"], ["z"], ["HELLO, HELLO, WORLD"], ["HELLO, HELLO, WORLD", undefined, { sensitivity: "base" }]].map((args) => made.localeCompare(...args) === "Hello, hello, world".localeCompare(...args)),
        emptyText: (() => {
          const empty = m.factory.createRedactedString("", "code", "f", 1);
          return [empty.startsWith(""), empty.endsWith("x"), empty.includes(""), empty.indexOf("x"), empty.lastIndexOf(""), empty.search(/^$/), empty.localeCompare("")];
        })(),
      };
    },
  },
  {
    name: "each text operation gives a new redacted string of its result, with the same labels and the same context",
    run: (m) => {
      const see = seer(m);
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const context = { privacyMode: 2, enforceRedaction: true };
      const made = m.factory.createRedactedString("  Straße in İstanbul: ﬁle a-b-c \n", m.classification.DataClassification.PATH, "folder_path", context);
      const operations = {
        "trim()": (s) => s.trim(), "trimStart()": (s) => s.trimStart(), "trimLeft()": (s) => s.trimLeft(), "trimEnd()": (s) => s.trimEnd(), "trimRight()": (s) => s.trimRight(),
        "slice()": (s) => s.slice(), "slice(2)": (s) => s.slice(2), "slice(2, 8)": (s) => s.slice(2, 8), "slice(-6)": (s) => s.slice(-6), "slice(-6, -3)": (s) => s.slice(-6, -3), "slice(8, 2)": (s) => s.slice(8, 2), "slice(undefined, 4)": (s) => s.slice(undefined, 4),
        "substring(2)": (s) => s.substring(2), "substring(8, 2)": (s) => s.substring(8, 2), "substring(-3, 4)": (s) => s.substring(-3, 4), "substring(4, 4)": (s) => s.substring(4, 4),
        "substr(2)": (s) => s.substr(2), "substr(2, 6)": (s) => s.substr(2, 6), "substr(-6, 3)": (s) => s.substr(-6, 3), "substr(2, 0)": (s) => s.substr(2, 0),
        "toLowerCase()": (s) => s.toLowerCase(), "toUpperCase()": (s) => s.toUpperCase(),
        "toLocaleLowerCase()": (s) => s.toLocaleLowerCase(), 'toLocaleLowerCase("tr")': (s) => s.toLocaleLowerCase("tr"), 'toLocaleLowerCase(["lt", "en"])': (s) => s.toLocaleLowerCase(["lt", "en"]),
        "toLocaleUpperCase()": (s) => s.toLocaleUpperCase(), 'toLocaleUpperCase("tr")': (s) => s.toLocaleUpperCase("tr"),
        'replace("a", "A")': (s) => s.replace("a", "A"), 'replace(/[a-c]/g, "x")': (s) => s.replace(/[a-c]/g, "x"), 'replace(/(\\w)-(\\w)/, "$2-$1")': (s) => s.replace(/(\w)-(\w)/, "$2-$1"), 'replace("absent", "x")': (s) => s.replace("absent", "x"), "replace(/[a-c]/g, a function)": (s) => s.replace(/[a-c]/g, (found) => found.toUpperCase()),
        'replaceAll("-", "+")': (s) => s.replaceAll("-", "+"), 'replaceAll(/[a-c]/g, "x")': (s) => s.replaceAll(/[a-c]/g, "x"), 'replaceAll("absent", "x")': (s) => s.replaceAll("absent", "x"),
        'padStart(36, "*")': (s) => s.padStart(36, "*"), "padStart(36)": (s) => s.padStart(36), "padStart(3)": (s) => s.padStart(3), 'padEnd(36, "ab")': (s) => s.padEnd(36, "ab"), "padEnd(36)": (s) => s.padEnd(36), 'padEnd(40, "")': (s) => s.padEnd(40, ""),
        "repeat(0)": (s) => s.repeat(0), "repeat(1)": (s) => s.repeat(1), "repeat(2)": (s) => s.repeat(2),
        "normalize()": (s) => s.normalize(), 'normalize("NFD")': (s) => s.normalize("NFD"), 'normalize("NFKC")': (s) => s.normalize("NFKC"), 'normalize("NFKD")': (s) => s.normalize("NFKD"),
        "concat()": (s) => s.concat(), 'concat("x")': (s) => s.concat("x"), 'concat("x", "y", 1)': (s) => s.concat("x", "y", 1),
        "charAt(0)": (s) => s.charAt(0), "charAt(2)": (s) => s.charAt(2), "charAt(99)": (s) => s.charAt(99), "charAt(-1)": (s) => s.charAt(-1), "charAt()": (s) => s.charAt(),
      };
      const results = Object.entries(operations).map(([name, run]) => [name, run(made)]);
      const labels = (one) => JSON.stringify([Object.entries(one), one.getPrivacyContext()]);
      // With no language named the machine's own decides: kept as whether the answer is the text's own.
      const text = made.unwrap(always);
      const inTheMachinesLanguage = { "toLocaleLowerCase()": text.toLocaleLowerCase(), "toLocaleUpperCase()": text.toLocaleUpperCase() };
      const answers = {
        values: Object.fromEntries(results.map(([name, result]) => [name, name in inTheMachinesLanguage && result.unwrap(always) === inTheMachinesLanguage[name] ? "as the text itself answers in the machine's language" : result.unwrap(always)])),
        oneOfThem: see(results[0][1]),
        notRedactedStrings: results.filter(([, result]) => !(result instanceof m.types.RedactedString)).map(([name]) => name),
        theOriginalItself: results.filter(([, result]) => result === made).map(([name]) => name),
        withOtherLabels: results.filter(([, result]) => labels(result) !== labels(made)).map(([name]) => name),
        notHiddenWhileEnforced: results.filter(([, result]) => String(result) !== "[redacted:folder_path]").map(([name]) => name),
        original: see(made),
      };
      context.enforceRedaction = false;
      answers.notShownOnceTheContextStopsEnforcing = results.filter(([, result]) => String(result) !== result.unwrap(always)).map(([name]) => name);
      return answers;
    },
  },
  {
    name: "one character of a redacted string by its place: from the end when negative, nothing outside the text or between places",
    run: (m) => {
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const made = m.factory.createRedactedString("abc😀", m.classification.DataClassification.CODE, "user_text", { privacyMode: 1, enforceRedaction: true });
      const empty = m.factory.createRedactedString("", m.classification.DataClassification.CODE, "user_text", 1);
      const labels = (one) => JSON.stringify([Object.entries(one), one.getPrivacyContext()]);
      const at = (item, index) => {
        const found = attempt(() => item.at(index));
        if (found === undefined || thrown.has(found)) return shown(found);
        return `${JSON.stringify(found.unwrap(always))}${found instanceof m.types.RedactedString && found !== item && labels(found) === labels(item) ? "" : " (not a redacted string with the same labels)"}`;
      };
      const places = [["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["99", 99], ["-1", -1], ["-2", -2], ["-5", -5], ["-6", -6], ["-99", -99], ["-0", -0], ["1.5", 1.5], ["-1.5", -1.5], ["NaN", Number.NaN], ["Infinity", Infinity], ["-Infinity", -Infinity], ['"1"', "1"], ['"-1"', "-1"], ['"x"', "x"], ["undefined", undefined], ["null", null], ["true", true]];
      return { text: across(places, (index) => at(made, index)), emptyText: across(places.slice(0, 2).concat([["-1", -1]]), (index) => at(empty, index)), noPlace: at(made) };
    },
  },
  {
    name: "splitting a redacted string gives a list of redacted strings with the same labels",
    run: (m) => {
      const see = seer(m);
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const made = m.factory.createRedactedString("one, two,three,,four", m.classification.DataClassification.CODE, "user_text", { privacyMode: 1, enforceRedaction: true });
      const labels = (one) => JSON.stringify([Object.entries(one), one.getPrivacyContext()]);
      const splits = { '(",")': [","], '(", ")': [", "], '("")': [""], "(/,\\s*/)": [/,\s*/], "(/(,)/)": [/(,)/], "(/(x)?,/)": [/(x)?,/], '(",", 2)': [",", 2], '(",", 0)': [",", 0], '("absent")': ["absent"], "()": [], "(undefined, 1)": [undefined, 1] };
      const results = Object.entries(splits).map(([name, args]) => [name, made.split(...args)]);
      return {
        pieces: Object.fromEntries(results.map(([name, pieces]) => [name, pieces.map((piece) => piece.unwrap(always))])),
        lists: results.every(([, pieces]) => Array.isArray(pieces)),
        withOtherLabels: results.filter(([, pieces]) => pieces.some((piece) => !(piece instanceof m.types.RedactedString) || labels(piece) !== labels(made))).map(([name]) => name),
        onePiece: see(results[0][1][1]),
        emptyText: m.factory.createRedactedString("", "code", "f", 1).split(",").map(see),
      };
    },
  },
  {
    name: "what a text operation refuses, a redacted string refuses with the same error",
    run: (m) => {
      const made = m.factory.createRedactedString("abc", m.classification.DataClassification.CODE, "user_text", 1);
      return [
        attempt(() => made.repeat(-1)),
        attempt(() => made.repeat(Infinity)),
        attempt(() => made.normalize("NFX")),
        attempt(() => made.replaceAll(/a/, "b")),
        attempt(() => made.startsWith(/a/)),
        attempt(() => made.endsWith(/c/)),
        attempt(() => made.includes(/b/)),
        attempt(() => made.toLocaleUpperCase("not a locale")),
        attempt(() => made.localeCompare("abc", "not a locale")),
        attempt(() => made.concat(Symbol("s"))),
      ];
    },
  },
  {
    name: "a redacted string made around nothing, or around something that is not text, hands it back as it is",
    run: (m) => {
      const see = seer(m);
      const { CODE } = m.classification.DataClassification;
      const { UNSAFE_ALWAYS_ALLOWED, STORAGE_FOR_LOGGING } = m.classification.PrivacyCapability;
      const object = { some: "object" };
      return [undefined, null, 42, true, object, ["a", "b"]].map((value) => {
        const made = new m.types.RedactedString(value, CODE, "field", { privacyMode: 1, enforceRedaction: false });
        const enforced = new m.types.RedactedString(value, CODE, "field", { privacyMode: 1, enforceRedaction: true });
        return hearing(() => ({
          made: see(made),
          theVeryValue: [made.unwrap(UNSAFE_ALWAYS_ALLOWED) === value, made.unwrap(STORAGE_FOR_LOGGING) === value, made.toString() === value, made.toJSON() === value, made.valueOf() === value],
          String: attempt(() => String(made)),
          json: attempt(() => JSON.stringify([made])),
          hiddenWhenEnforced: [String(enforced), JSON.stringify([enforced]), attempt(() => enforced.unwrap(STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true }))],
          length: attempt(() => made.length),
          empty: attempt(() => made.empty),
          ...(value === undefined || value === null ? { trim: attempt(() => made.trim()), startsWith: attempt(() => made.startsWith("a")), at: attempt(() => made.at(0)), split: attempt(() => made.split(",")) } : {}),
        }));
      });
    },
  },

  {
    name: "what a redacted string has: its methods, the fields worked out on demand, and its tag",
    run: ({ types }) => {
      const prototype = types.RedactedString.prototype;
      const kindOf = (key) => {
        const described = Object.getOwnPropertyDescriptor(prototype, key);
        return `${typeof key === "symbol" ? String(key) : key}: ${described.get ? "worked out on demand" : typeof described.value}${described.set ? ", can be set" : ""}${described.enumerable ? ", listed" : ""}`;
      };
      return {
        named: Object.getOwnPropertyNames(prototype).sort().map(kindOf),
        bySymbol: Object.getOwnPropertySymbols(prototype).map(kindOf).sort(),
        parent: Object.getPrototypeOf(prototype) === Object.prototype,
        ownFieldsOfOne: Object.getOwnPropertyNames(new types.RedactedString("v", "code", "f", 1)),
      };
    },
  },
  {
    name: "how many arguments each function and each method is declared with",
    run: (m) => {
      const counts = (holder, names) => names.map((name) => `${typeof name === "symbol" ? String(name) : name}: ${holder[name].length}`).join(", ");
      const methodsOf = (prototype) => [...Object.getOwnPropertyNames(prototype).sort(), ...Object.getOwnPropertySymbols(prototype)].filter((name) => typeof Object.getOwnPropertyDescriptor(prototype, name).value === "function");
      return {
        classification: counts(m.classification, ["allowedPurpose"]),
        context: counts(m.context, ["privacyContextFromMode", "resolveEnforceRedaction", "toPrivacyContext"]),
        factory: counts(m.factory, ["createRedactedBytes", "createRedactedString", "safeString"]),
        messages: counts(m.messages, ["fromRedactedCoreMessage", "fromRedactedCoreMessages", "toRedactedCoreMessage", "toRedactedCoreMessages"]),
        should: counts(m.should, ["formatRedacted", "getRedactionAwareDisplayValue", "shouldRedact"]),
        types: counts(m.types, ["RedactedBytes", "RedactedString", "isRedactedString"]),
        redactedString: counts(m.types.RedactedString.prototype, methodsOf(m.types.RedactedString.prototype)),
        redactedBytes: counts(m.types.RedactedBytes.prototype, methodsOf(m.types.RedactedBytes.prototype)),
      };
    },
  },
  {
    name: "a class built on the redacted string gets plain redacted strings back from its operations",
    run: ({ types }) => {
      class Longer extends types.RedactedString {}
      const made = new Longer("  the value  ", "code", "field", { privacyMode: 1, enforceRedaction: true });
      return [made.trim(), made.__clone("x"), made.safeTransform((value) => value), made.at(0), made.split(" ")[0]].map((result) => [result instanceof Longer, result instanceof types.RedactedString, result.constructor.name]).concat([[made instanceof Longer, types.isRedactedString(made), made.constructor.name, String(made)]]);
    },
  },

  // Redacted bytes.
  {
    name: "redacted bytes know whether they would be hidden, their length, their emptiness and their context",
    run: (m) => {
      const { RedactedBytes } = m.types;
      const { DataClassification } = m.classification;
      const full = new RedactedBytes(new Uint8Array([1, 2, 3]), DataClassification.CODE, "data", 1);
      const none = new RedactedBytes(new Uint8Array(0), DataClassification.CODE, "data", { privacyMode: 4, enforceRedaction: true, note: "left behind" });
      const view = new RedactedBytes(new Uint8Array(new Uint8Array([9, 8, 7, 6]).buffer, 1, 2), DataClassification.SAFE, "blob", { privacyMode: 0, enforceRedaction: null });
      return {
        wouldBeHidden: Object.fromEntries(named([...Object.values(DataClassification), "made_up", undefined]).map(([label, kind]) => [label, across([...MODES, ...ODD_MODES], (mode) => shown(new RedactedBytes(new Uint8Array(1), kind, "f", mode).__isRedacted))])),
        sizes: [full, none, view].map((bytes) => `length ${bytes.length}, empty ${bytes.empty}`),
        contexts: [full, none, view].map((bytes) => bytes.getPrivacyContext()),
        aNewContextEachTime: full.getPrivacyContext() !== full.getPrivacyContext(),
        labels: [full, none, view].map((bytes) => Object.entries(bytes)),
        asText: [String(full), `${none}`, Object.prototype.toString.call(view)],
        asJson: JSON.stringify([full, none, view]),
        ownMethods: Object.getOwnPropertyNames(RedactedBytes.prototype).sort(),
      };
    },
  },
  {
    name: "a clone or a safe transform of redacted bytes holds the new bytes under the very same labels",
    run: (m) => {
      const see = seer(m);
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const context = { privacyMode: 2, enforceRedaction: true };
      const first = new Uint8Array([1, 2, 3]);
      const second = new Uint8Array([4, 5]);
      const third = new Uint8Array([6]);
      const made = m.factory.createRedactedBytes(first, m.classification.DataClassification.CODE, "data", context);
      const clone = made.__clone(second);
      const given = [];
      const transformed = made.safeTransform((...args) => { given.push(args.length, args[0] === first); return third; });
      const answers = {
        original: see(made),
        clone: see(clone),
        aCloneOfTheClone: see(clone.__clone(third)),
        transformed: see(transformed),
        whatTheTransformIsGiven: given,
        holdTheVeryBytes: [clone.unwrap(always) === second, transformed.unwrap(always) === third, made.unwrap(always) === first],
        newObjects: [clone !== made, transformed !== made, clone instanceof m.types.RedactedBytes, transformed instanceof m.types.RedactedBytes],
        notBytes: [made.__clone(undefined), made.__clone("text"), made.safeTransform(() => undefined)].map(see),
        itsOwnError: attempt(() => made.safeTransform(() => { throw new RangeError("the transform's own error"); })),
        noTransform: attempt(() => made.safeTransform()),
        refusedWhileEnforced: [clone, transformed].map((bytes) => attempt(() => bytes.unwrap(m.classification.PrivacyCapability.STORAGE_FOR_TRAINING))),
      };
      context.enforceRedaction = false;
      answers.letThroughOnceTheContextStopsEnforcing = hearing(() => [clone, transformed].map((bytes) => attempt(() => bytes.unwrap(m.classification.PrivacyCapability.STORAGE_FOR_TRAINING))));
      return answers;
    },
  },
  {
    name: "redacted bytes made around nothing hand it back, and have no length to give",
    run: (m) => {
      const see = seer(m);
      return [undefined, null].map((value) => {
        const made = new m.types.RedactedBytes(value, m.classification.DataClassification.CODE, "data", 1);
        return hearing(() => ({ made: see(made), forLogging: made.unwrap(m.classification.PrivacyCapability.STORAGE_FOR_LOGGING), length: attempt(() => made.length), empty: attempt(() => made.empty) }));
      });
    },
  },
  {
    name: "only a redacted string is told to be one",
    run: (m) => {
      const { RedactedString, RedactedBytes, isRedactedString } = m.types;
      const made = m.factory.createRedactedString("v", "code", "f", 1);
      class Longer extends RedactedString {}
      return [
        made, made.__clone("w"), made.trim(), m.factory.safeString("s"), new Longer("v", "code", "f", 1), Object.create(RedactedString.prototype),
        new RedactedBytes(new Uint8Array(1), "code", "f", 1), { __classification: "code", __fieldName: "f", __privacyMode: 1, __isRedacted: true }, "[redacted:f]", "v", null, undefined, 0, [], RedactedString,
      ].map((value) => isRedactedString(value)).concat([isRedactedString()]);
    },
  },

  // Wrapping a conversation's messages.
  {
    name: "a whole conversation wrapped: every role and every kind of part, with what comes back when it is unwrapped",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessages, fromRedactedCoreMessages } = m.messages;
      const given = conversation();
      const wrapped = toRedactedCoreMessages(given, 1);
      const back = fromRedactedCoreMessages(wrapped, m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED);
      return {
        wrapped: see(wrapped),
        unwrapped: see(back),
        aListOfTheSameLength: [Array.isArray(wrapped), wrapped.length === given.length, Array.isArray(back), back.length === given.length],
        nothingGivenIsChanged: JSON.stringify(given) === JSON.stringify(conversation()),
      };
    },
  },
  {
    name: "a user message of plain text keeps its options, loses its id, and has the options field even when none were given",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const options = { simeon: { requestId: "req_1" } };
      const cases = [{ role: "user", content: "Fix the login test" }, { role: "user", content: "", providerOptions: options, id: "msg_1", extra: "not kept" }, { role: "user", content: "with options said to be nothing", providerOptions: undefined }, { role: "user", content: "with null options", providerOptions: null }];
      return cases.map((message) => {
        const wrapped = toRedactedCoreMessage(message, { privacyMode: 2 });
        const back = fromRedactedCoreMessage(wrapped, always);
        return { wrapped: see(wrapped), unwrapped: back, theVeryOptions: [wrapped.providerOptions === message.providerOptions, back.providerOptions === message.providerOptions] };
      });
    },
  },
  {
    name: "a user message of parts: text is wrapped, an image and a file are held with the context, any other part is refused",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage } = m.messages;
      const image = new Uint8Array([137, 80]);
      const options = { openai: { imageDetail: "low" } };
      const context = { privacyMode: 1, enforceRedaction: true, note: "the caller's own object" };
      const message = { role: "user", id: "msg_1", content: [{ type: "text", text: "Look", providerOptions: options }, { type: "image", image, mimeType: "image/png", providerOptions: options }, { type: "file", data: image, mimeType: "application/pdf", filename: "report.pdf" }, { type: "image" }, { type: "file" }, { type: "text" }] };
      const wrapped = toRedactedCoreMessage(message, context);
      const refusedFor = (type) => attempt(() => toRedactedCoreMessage({ role: "user", content: [{ type: "text", text: "fine" }, { type, text: "x" }] }, 1));
      return {
        wrapped: see(wrapped),
        heldAsGiven: [wrapped.content[1].image === image, wrapped.content[2].data === image, wrapped.content[0].providerOptions === options, wrapped.content[1].providerOptions === options],
        theCallersContext: [wrapped.content[1].__privacyContext === context, wrapped.content[2].__privacyContext === context],
        aNewList: wrapped.content !== message.content,
        noParts: see(toRedactedCoreMessage({ role: "user", content: [] }, 1)),
        refused: ["tool-call", "tool-result", "reasoning", "audio", "Text", "", undefined, null, 5].map(refusedFor),
      };
    },
  },
  {
    name: "an assistant message of plain text keeps its id and its options, each only when given",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const ids = [["no id", {}], ["id undefined", { id: undefined }], ["id null", { id: null }], ["id 0", { id: 0 }], ['id ""', { id: "" }], ["id msg_1", { id: "msg_1" }]];
      const options = [["no options", {}], ["options undefined", { providerOptions: undefined }], ["options null", { providerOptions: null }], ["options {}", { providerOptions: {} }], ["options given", { providerOptions: { openai: { itemId: "item_1" } } }]];
      return {
        fields: table(ids, options, (id, option) => {
          const wrapped = toRedactedCoreMessage({ role: "assistant", content: "Done.", extra: "not kept", ...option, ...id }, 3);
          const back = fromRedactedCoreMessage(wrapped, always);
          return `${Object.keys(wrapped).join(", ")} -> ${Object.keys(back).join(", ")}; id ${shown(back.id)}, options ${shown(back.providerOptions)}`;
        }),
        one: see(toRedactedCoreMessage({ role: "assistant", content: "Done.", providerOptions: { a: 1 }, id: "msg_1" }, 3)),
        emptyText: see(toRedactedCoreMessage({ role: "assistant", content: "" }, 3)),
      };
    },
  },
  {
    name: "an assistant message of parts keeps its id and its options the same way, and the same for a tool message",
    run: (m) => {
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const ids = [["no id", {}], ["id undefined", { id: undefined }], ["id null", { id: null }], ["id 0", { id: 0 }], ["id msg_1", { id: "msg_1" }]];
      const options = [["no options", {}], ["options undefined", { providerOptions: undefined }], ["options null", { providerOptions: null }], ["options given", { providerOptions: { openai: { itemId: "item_1" } } }]];
      const fields = (message) => table(ids, options, (id, option) => {
        const wrapped = toRedactedCoreMessage({ ...message, extra: "not kept", ...option, ...id }, 3);
        const back = fromRedactedCoreMessage(wrapped, always);
        return `${Object.keys(wrapped).join(", ")} -> ${Object.keys(back).join(", ")}; id ${shown(back.id)}, options ${shown(back.providerOptions)}`;
      });
      return {
        assistant: fields({ role: "assistant", content: [{ type: "text", text: "Done." }] }),
        assistantWithNoParts: fields({ role: "assistant", content: [] }),
        tool: fields({ role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", toolName: "Read", result: "ok" }] }),
        toolWithNoParts: fields({ role: "tool", content: [] }),
      };
    },
  },
  {
    name: "an assistant's parts: text and tool calls are wrapped by field, every other kind is kept whole as JSON under its own kind's name",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const parts = [
        { type: "text", text: "words", providerOptions: { a: 1 } }, { type: "text" }, { type: "text", text: 42 },
        { type: "tool-call", toolCallId: "call_1", toolName: "Read", args: { path: "a.ts" }, providerOptions: { b: 2 } },
        { type: "tool-call", toolCallId: "call_2", toolName: "Text", args: "plain words" }, { type: "tool-call", toolCallId: "call_3", toolName: "JsonText", args: '{"already":"json"}' },
        { type: "tool-call", toolCallId: "call_4", toolName: "Number", args: 7 }, { type: "tool-call", toolCallId: "call_5", toolName: "Null", args: null }, { type: "tool-call", toolCallId: "call_6", toolName: "List", args: [1, [2, { three: undefined }], undefined] },
        { type: "tool-call", toolCallId: "call_7", toolName: "Nothing", args: undefined }, { type: "tool-call" }, { type: "tool-call", toolCallId: "call_8", toolName: "Date", args: { when: new Date(0), fn: () => 1, nan: Number.NaN } },
        { type: "reasoning", text: "thinking", signature: "sig" }, { type: "redacted-reasoning", data: "b3BhcXVl" }, { type: "image", image: "data:image/png;base64,AAAA" }, { type: "file", data: new Uint8Array([1, 2]), mimeType: "a/b" },
        { type: "tool-result", toolCallId: "call_0", result: "done" }, { type: "unknown", anything: [1, 2] }, { type: "Text", text: "capital T" }, { type: "" }, { type: 5 }, { type: null }, {}, { type: "source", nothing: undefined, id: 1 },
      ];
      const wrapped = toRedactedCoreMessage({ role: "assistant", content: parts }, 2);
      const back = fromRedactedCoreMessage(wrapped, always);
      return {
        parts: parts.map((given, index) => ({ wrapped: see(wrapped.content[index]), unwrapped: see(back.content[index]), aNewObject: back.content[index] !== given })),
        theVeryOptions: [wrapped.content[0].providerOptions === parts[0].providerOptions, back.content[3].providerOptions === parts[3].providerOptions],
      };
    },
  },
  {
    name: "an assistant's part that cannot be written as JSON, or that is nothing at all, fails the whole message",
    run: (m) => {
      const { toRedactedCoreMessage } = m.messages;
      const circle = { type: "source" };
      circle.self = circle;
      const callInCircle = { type: "tool-call", toolCallId: "call_1", toolName: "Loop", args: {} };
      callInCircle.args.again = callInCircle.args;
      return [
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [circle] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [callInCircle] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [{ type: "tool-call", args: { big: 12n } }] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [{ type: "source", big: 12n }] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [{ type: "text", text: "fine" }, null] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "assistant", content: [undefined] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "user", content: [null] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "tool", content: [null] }, 1)),
        attempt(() => toRedactedCoreMessage({ role: "tool", content: [{ result: 12n }] }, 1)),
      ];
    },
  },
  {
    name: "an assistant's part given as bare text or a number is kept as an unknown part",
    run: (m) => {
      const see = seer(m);
      const wrapped = m.messages.toRedactedCoreMessage({ role: "assistant", content: ["bare text", 7, true] }, 1);
      return { wrapped: see(wrapped), unwrapped: m.messages.fromRedactedCoreMessage(wrapped, m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED) };
    },
  },
  {
    name: "a tool message: every part becomes a tool result, its result kept as text or as JSON, the text among its extra content wrapped too",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const picture = { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" };
      const parts = [
        { type: "tool-result", toolCallId: "call_1", toolName: "Read", result: "line one\nline two" },
        { type: "tool-result", toolCallId: "call_2", toolName: "Shell", result: { exitCode: 1, stderr: "not found" }, isError: true, providerOptions: { a: 1 }, extra: "not kept" },
        { type: "tool-result", toolCallId: "call_3", toolName: "Screenshot", result: "see the picture", experimental_content: [{ type: "text", text: "A screenshot", extra: "not kept" }, picture, { type: "text", text: 42 }, { type: "text" }, { type: "text", text: "" }, { kind: "no type", text: "left as it is" }] },
        { type: "tool-result", toolCallId: "call_4", toolName: "NoResult" },
        { type: "tool-result", toolCallId: "call_5", toolName: "Flags", result: null, isError: false, experimental_content: [], providerOptions: null },
        { type: "tool-result", toolCallId: "call_6", toolName: "IsErrorNull", result: 0, isError: null },
        { type: "something-else", toolCallId: "call_7", toolName: "NotCalledAResult", result: [1, "two", { three: 3 }], output: "not read" },
        {},
      ];
      const wrapped = toRedactedCoreMessage({ role: "tool", content: parts }, { privacyMode: 1, enforceRedaction: false });
      const back = fromRedactedCoreMessage(wrapped, always);
      return {
        parts: parts.map((given, index) => ({ wrapped: see(wrapped.content[index]), unwrapped: see(back.content[index]), unwrappedFields: Object.keys(back.content[index]) })),
        thePictureIsTheVeryObject: [wrapped.content[2].experimental_content[1] === picture, back.content[2].experimental_content[1] === picture],
        aNewListOfExtraContent: [wrapped.content[2].experimental_content !== parts[2].experimental_content, back.content[2].experimental_content !== wrapped.content[2].experimental_content, wrapped.content[4].experimental_content !== parts[4].experimental_content],
        theVeryOptions: [wrapped.content[1].providerOptions === parts[1].providerOptions, back.content[1].providerOptions === parts[1].providerOptions],
      };
    },
  },
  {
    name: "a tool's result that reads as JSON comes back as what it reads as, not as the text it was",
    run: (m) => {
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const through = (result) => attempt(() => {
        const wrapped = toRedactedCoreMessage({ role: "tool", content: [{ type: "tool-result", toolCallId: "c", toolName: "t", result }] }, 1);
        return { held: wrapped.content[0].result.unwrap(always), back: fromRedactedCoreMessage(wrapped, always).content[0].result };
      });
      return {
        text: Object.fromEntries(["123", "true", "null", '"quoted"', '{"a":1}', "[1,2]", " 7 ", "1e3", "-0", "plain words", "", " ", "{broken", "NaN", "undefined", "0123", "'single'", "[redacted:tool_result]"].map((result) => [JSON.stringify(result), through(result)])),
        notText: [123, 1.5, -0, Number.NaN, Infinity, true, false, null, undefined, { a: 1, nothing: undefined }, [1, [2]], new Date(0), { toJSON: () => "its own JSON" }, () => 1, Symbol("s"), new Uint8Array([1, 2])].map((result) => [shown(typeof result === "function" || typeof result === "symbol" ? String(result) : result), through(result)]),
      };
    },
  },
  {
    name: "a system message is one wrapped text, with the options field always there and no id",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const list = [{ type: "text", text: "not expected here" }];
      const cases = [{ role: "system", content: "You are Simeon." }, { role: "system", content: "", providerOptions: { a: 1 }, id: "msg_1", extra: "not kept" }, { role: "system", content: list }, { role: "system" }, { role: "system", content: null, providerOptions: null }];
      return cases.map((message) => {
        const wrapped = toRedactedCoreMessage(message, 4);
        const back = fromRedactedCoreMessage(wrapped, always);
        return { wrapped: see(wrapped), unwrapped: back, theVeryContent: back.content === message.content };
      });
    },
  },
  {
    name: "a message of a role nobody knows is refused, wrapped or to be unwrapped",
    run: (m) => {
      const { toRedactedCoreMessage, fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const roles = ["developer", "function", "User", "USER", " user", "", undefined, null, 1, { toString: () => "user" }];
      return {
        wrapping: roles.map((role) => attempt(() => toRedactedCoreMessage({ role, content: "x" }, 1))),
        wrappingNoRole: attempt(() => toRedactedCoreMessage({ content: "x" }, 1)),
        unwrapping: roles.map((role) => attempt(() => fromRedactedCoreMessage({ _privacyMode: 1, role, content: m.factory.safeString("x") }, always))),
        unwrappingNoRole: attempt(() => fromRedactedCoreMessage({}, always)),
        roleSymbol: [attempt(() => toRedactedCoreMessage({ role: Symbol("user"), content: "x" }, 1)), attempt(() => fromRedactedCoreMessage({ role: Symbol("user") }, always))],
      };
    },
  },
  {
    name: "something that is no message, or a message whose content is not what its role holds, fails as it did",
    run: (m) => {
      const { toRedactedCoreMessage, toRedactedCoreMessages, fromRedactedCoreMessage, fromRedactedCoreMessages } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const see = seer(m);
      return {
        noMessage: [attempt(() => toRedactedCoreMessage(undefined, 1)), attempt(() => toRedactedCoreMessage(null, 1)), attempt(() => toRedactedCoreMessage("user", 1)), attempt(() => toRedactedCoreMessage(7, 1)), attempt(() => fromRedactedCoreMessage(undefined, always)), attempt(() => fromRedactedCoreMessage(null, always)), attempt(() => fromRedactedCoreMessage("user", always))],
        aModeThatCannotBeWrittenAsTextFailsFirst: [attempt(() => toRedactedCoreMessage({ role: "user", content: "x" }, Symbol("mode"))), attempt(() => toRedactedCoreMessage(undefined, Symbol("mode"))), attempt(() => toRedactedCoreMessage({ role: "developer" }, { privacyMode: 1, enforceRedaction: Symbol("choice") })), attempt(() => toRedactedCoreMessages([undefined], { privacyMode: Symbol("mode") }))],
        noList: [attempt(() => toRedactedCoreMessages(undefined, 1)), attempt(() => toRedactedCoreMessages({ role: "user", content: "x" }, 1)), attempt(() => fromRedactedCoreMessages(undefined, always)), attempt(() => fromRedactedCoreMessages({ role: "user" }, always))],
        wrappingNoContent: ["user", "assistant", "tool"].flatMap((role) => [attempt(() => toRedactedCoreMessage({ role }, 1)), attempt(() => toRedactedCoreMessage({ role, content: null }, 1))]),
        wrappingATextForATool: attempt(() => toRedactedCoreMessage({ role: "tool", content: "a tool's content is a list" }, 1)),
        wrappingANumber: ["user", "assistant", "tool"].map((role) => attempt(() => toRedactedCoreMessage({ role, content: 7 }, 1))),
        wrappingExtraContentThatIsNoList: [attempt(() => toRedactedCoreMessage({ role: "tool", content: [{ result: "r", experimental_content: "text" }] }, 1)), see(toRedactedCoreMessage({ role: "tool", content: [{ result: "r", experimental_content: null }] }, 1)), attempt(() => toRedactedCoreMessage({ role: "tool", content: [{ result: "r", experimental_content: [null] }] }, 1))],
        unwrappingNoContent: ["user", "assistant", "tool", "system"].flatMap((role) => [attempt(() => fromRedactedCoreMessage({ role }, always)), attempt(() => fromRedactedCoreMessage({ role, content: null }, always))]),
        unwrappingPlainText: ["user", "assistant", "tool", "system"].map((role) => attempt(() => fromRedactedCoreMessage({ role, content: "never wrapped" }, always))),
        unwrappingPlainParts: [
          attempt(() => fromRedactedCoreMessage({ role: "user", content: [{ type: "text", text: "never wrapped" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "user", content: [{ type: "text" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "user", content: [null] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [{ type: "text", text: "never wrapped" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [{ type: "tool-call", args: '{"never":"wrapped"}' }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [{ type: "tool-call" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [{ type: "unknown", data: "{}" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [undefined] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "tool", content: [{ type: "tool-result", result: "never wrapped" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "tool", content: [{ type: "tool-result" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "tool", content: [null] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "tool", content: [{ result: m.factory.safeString("ok"), experimental_content: "text" }] }, always)),
          attempt(() => fromRedactedCoreMessage({ role: "tool", content: [{ result: m.factory.safeString("ok"), experimental_content: [null] }] }, always)),
        ],
      };
    },
  },
  {
    name: "the mode a wrapped message carries is the one it was wrapped under, given as a number or inside a context",
    run: (m) => {
      const { toRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const given = [...MODES.map(([, mode]) => mode), 9, undefined, null, "2", { privacyMode: 2 }, { privacyMode: 3, enforceRedaction: true }, { privacyMode: 0, enforceRedaction: false }, { privacyMode: 4, enforceRedaction: null, note: "more" }, { enforceRedaction: true }];
      return given.map((modeOrContext) => {
        const [system, user, assistant, tool] = [{ role: "system", content: "s" }, { role: "user", content: [{ type: "text", text: "u" }] }, { role: "assistant", content: "a" }, { role: "tool", content: [{ result: "t", experimental_content: [{ type: "text", text: "e" }] }] }].map((message) => toRedactedCoreMessage(message, modeOrContext));
        const strings = [system.content, user.content[0].text, assistant.content, tool.content[0].result, tool.content[0].experimental_content[0].text];
        return {
          given: shown(modeOrContext),
          modes: [system, user, assistant, tool].map((message) => message._privacyMode),
          stringModes: strings.map((one) => one.__privacyMode),
          stringContexts: strings.map((one) => JSON.stringify(one.getPrivacyContext())),
          wouldBeHidden: strings.map((one) => one.__isRedacted),
          values: strings.map((one) => one.unwrap(always)).join(""),
        };
      });
    },
  },

  // What is remembered between calls.
  {
    name: "the same message asked again under the same mode and enforcement gives the very wrapping it gave first",
    run: (m) => {
      const { toRedactedCoreMessage, toRedactedCoreMessages } = m.messages;
      const message = { role: "user", content: [{ type: "text", text: "first words" }] };
      const first = toRedactedCoreMessage(message, 1);
      const enforced = toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: true });
      const notEnforced = toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: false });
      const otherMode = toRedactedCoreMessage(message, 2);
      const same = (label, wrapped, than = first) => `${label}: ${wrapped === than ? "the same wrapping" : "another wrapping"}, ${wrapped.content === than.content ? "the same parts" : "other parts"}`;
      return {
        again: [
          same("the same mode", toRedactedCoreMessage(message, 1)),
          same("the mode in a context", toRedactedCoreMessage(message, { privacyMode: 1 })),
          same("a context whose enforcement is null", toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: null })),
          same("a context whose enforcement is undefined", toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: undefined })),
          same("the mode as text", toRedactedCoreMessage(message, "1")),
          same("in a list", toRedactedCoreMessages([message], 1)[0]),
          same("twice in a list", toRedactedCoreMessages([message, message], 1)[1]),
          same("another mode", otherMode),
          same("enforced", enforced),
          same("not enforced", notEnforced),
          same("enforced, against the not enforced", enforced, notEnforced),
          same("enforced again by another context object", toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: true, note: "another object" }), enforced),
          same("not enforced again", toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: false }), notEnforced),
          same('a context whose enforcement is the text "true", against the enforced', toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: "true" }), enforced),
          same('a context whose enforcement is the text "gate"', toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: "gate" })),
          same("a context whose enforcement is 0", toRedactedCoreMessage(message, { privacyMode: 1, enforceRedaction: 0 })),
          same("another mode again", toRedactedCoreMessage(message, { privacyMode: 2 }), otherMode),
          same("an equal message that is another object", toRedactedCoreMessage({ ...message }, 1)),
          same("an equal message with other parts", toRedactedCoreMessage({ role: "user", content: [{ type: "text", text: "first words" }] }, 1)),
        ],
        modes: [first, enforced, notEnforced, otherMode, toRedactedCoreMessage(message, "1")].map((wrapped) => wrapped._privacyMode),
        contexts: [first, enforced, notEnforced, otherMode].map((wrapped) => wrapped.content[0].text.getPrivacyContext()),
        everyRole: [{ role: "system", content: "s" }, { role: "user", content: "u" }, { role: "assistant", content: "a" }, { role: "assistant", content: [] }, { role: "tool", content: [] }].map((one) => toRedactedCoreMessage(one, 3) === toRedactedCoreMessage(one, 3)),
      };
    },
  },
  {
    name: "a message changed after it was wrapped still gives its first wrapping under that mode, and its new one under another",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage } = m.messages;
      const message = { role: "assistant", content: "before", id: "msg_1" };
      const first = toRedactedCoreMessage(message, 1);
      message.content = "after";
      message.role = "user";
      message.providerOptions = { added: "later" };
      const second = toRedactedCoreMessage(message, 1);
      return { theSameWrapping: second === first, underTheFirstMode: see(second), underAnotherMode: see(toRedactedCoreMessage(message, 2)) };
    },
  },
  {
    name: "a list of parts wrapped once is reused for any message of the same role that holds the very list, even after the list changed",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage } = m.messages;
      const content = [{ type: "text", text: "shared words" }];
      const first = toRedactedCoreMessage({ role: "user", content }, 1);
      const second = toRedactedCoreMessage({ role: "user", content, providerOptions: { other: "message" } }, 1);
      content.push({ type: "text", text: "added later" });
      content[0].text = "changed later";
      const afterTheChange = toRedactedCoreMessage({ role: "user", content }, 1);
      const otherMode = toRedactedCoreMessage({ role: "user", content }, 2);
      const enforced = toRedactedCoreMessage({ role: "user", content }, { privacyMode: 1, enforceRedaction: true });
      const asAssistant = toRedactedCoreMessage({ role: "assistant", content }, 1);
      const asAssistantAgain = toRedactedCoreMessage({ role: "assistant", content, id: "msg_2" }, 1);
      const asTool = toRedactedCoreMessage({ role: "tool", content }, 1);
      const asToolAgain = toRedactedCoreMessage({ role: "tool", content }, 1);
      const equalList = toRedactedCoreMessage({ role: "user", content: [...content] }, 1);
      const text = { role: "user", content: "the same words" };
      return {
        anotherMessageTheSameParts: [second !== first, second.content === first.content],
        afterTheChange: [afterTheChange !== first, afterTheChange.content === first.content, see(afterTheChange.content)],
        underAnotherMode: [otherMode.content !== first.content, see(otherMode.content)],
        enforced: [enforced.content !== first.content, enforced.content.length],
        eachRoleItsOwn: [asAssistant.content !== first.content, asAssistantAgain.content === asAssistant.content, asTool.content !== first.content, asTool.content !== asAssistant.content, asToolAgain.content === asTool.content],
        asAssistant: see(asAssistant.content),
        asTool: see(asTool.content),
        anEqualListIsNotTheList: [equalList.content !== first.content, equalList.content.length],
        plainTextIsWrappedAnewEachTime: toRedactedCoreMessage(text, 1).content !== toRedactedCoreMessage({ ...text }, 1).content,
        emptyLists: (() => {
          const none = [];
          return [toRedactedCoreMessage({ role: "user", content: none }, 1).content === toRedactedCoreMessage({ role: "user", content: none }, 1).content, toRedactedCoreMessage({ role: "user", content: [] }, 1).content === toRedactedCoreMessage({ role: "user", content: [] }, 1).content];
        })(),
      };
    },
  },
  {
    name: "a message that was refused is not remembered: put right, it is wrapped",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessage } = m.messages;
      const content = [{ type: "text", text: "fine" }, { type: "audio", data: "…" }];
      const message = { role: "user", content };
      const refused = attempt(() => toRedactedCoreMessage(message, 1));
      const refusedAgain = attempt(() => toRedactedCoreMessage(message, 1));
      content.pop();
      const wrapped = toRedactedCoreMessage(message, 1);
      const stranger = { role: "developer", content: "x" };
      const strangerRefused = attempt(() => toRedactedCoreMessage(stranger, 1));
      stranger.role = "system";
      return { refused, refusedAgain, thenWrapped: see(wrapped), unknownRole: strangerRefused, thenAsSystem: see(toRedactedCoreMessage(stranger, 1)) };
    },
  },
  {
    name: "every text, image and file of one wrapped message follows one context: the caller's own when one is given, a new one for each message otherwise",
    run: (m) => {
      const { toRedactedCoreMessage, toRedactedCoreMessages } = m.messages;
      const make = () => ({ role: "user", content: [{ type: "text", text: "words" }, { type: "image", image: "picture" }, { type: "file", data: "pages" }] });
      const wrapped = toRedactedCoreMessage(make(), 1);
      const [text, image, file] = wrapped.content;
      const look = () => ({ text: [String(text), String(image), String(file)], json: JSON.stringify(wrapped), contextOfTheText: text.text.getPrivacyContext() });
      const answers = { oneContextForImageAndFile: image.__privacyContext === file.__privacyContext, context: { ...image.__privacyContext }, asWrapped: look() };
      image.__privacyContext.enforceRedaction = true;
      answers.afterTheImagesContextEnforces = look();
      const own = { privacyMode: 1, enforceRedaction: false, note: "the caller's" };
      const [first, second] = toRedactedCoreMessages([make(), make()], own);
      const [third, fourth] = toRedactedCoreMessages([make(), make()], 1);
      answers.theCallersContextForAll = [first.content[1].__privacyContext === own, second.content[2].__privacyContext === own];
      answers.aNewContextForEachMessage = [third.content[1].__privacyContext !== fourth.content[1].__privacyContext, third.content[1].__privacyContext === third.content[2].__privacyContext, third.content[1].__privacyContext];
      return answers;
    },
  },
  {
    name: "what a wrapped conversation shows as JSON and as text: everything, unless redaction is enforced under a mode that does not allow training",
    run: (m) => {
      const { toRedactedCoreMessages } = m.messages;
      const asText = (message) => (Array.isArray(message.content) ? message.content.map((one) => String(one)) : [String(message.content), `${message.content}`]);
      const view = (context) => hearing(() => {
        const wrapped = toRedactedCoreMessages(conversation(), context);
        return { json: JSON.stringify(wrapped), text: wrapped.map(asText), extraContentAsText: wrapped[4].content[2].experimental_content.map((item) => String(item.text)) };
      });
      const shown1 = view(1);
      const hidden1 = view({ privacyMode: 1, enforceRedaction: true });
      // The same view under another mode differs only by the mode each message carries.
      const under = (reference, mode) => JSON.stringify({ ...reference, result: { ...reference.result, json: reference.result.json.replaceAll('"_privacyMode":1', `"_privacyMode":${mode}`) } });
      const settings = [["unspecified", 0], ["no training", 2], ["data training", 3], ["codebase training", 4], ["unspecified, enforced", { privacyMode: 0, enforceRedaction: true }], ["no training, enforced", { privacyMode: 2, enforceRedaction: true }], ["data training, enforced", { privacyMode: 3, enforceRedaction: true }], ["codebase training, enforced", { privacyMode: 4, enforceRedaction: true }], ["no storage, not enforced", { privacyMode: 1, enforceRedaction: false }], ["unspecified, not enforced", { privacyMode: 0, enforceRedaction: false }]];
      return {
        "no storage": shown1,
        "no storage, enforced": hidden1,
        others: Object.fromEntries(settings.map(([label, context]) => {
          const seen = view(context);
          const mode = typeof context === "object" ? context.privacyMode : context;
          const text = JSON.stringify(seen);
          return [label, text === under(shown1, mode) ? "as under no storage: everything shown" : text === under(hidden1, mode) ? "as under no storage, enforced: fields hidden" : seen];
        })),
      };
    },
  },
  {
    name: "each kind of wrapped part is an object of its own class, with its fields in a fixed order and its own way to text",
    run: (m) => {
      const see = seer(m);
      const { toRedactedCoreMessages } = m.messages;
      const wrapped = toRedactedCoreMessages(conversation(), { privacyMode: 1, enforceRedaction: true });
      const kinds = { text: wrapped[2].content[0], image: wrapped[2].content[1], file: wrapped[2].content[4], assistantText: wrapped[3].content[2], toolCall: wrapped[3].content[4], unknown: wrapped[3].content[0], toolResult: wrapped[4].content[2] };
      return {
        classes: Object.fromEntries(Object.entries(kinds).map(([name, one]) => [name, { class: one.constructor.name, fields: Object.keys(one), methods: Object.getOwnPropertyNames(Object.getPrototypeOf(one)), parent: Object.getPrototypeOf(Object.getPrototypeOf(one)) === Object.prototype ? "Object" : "another class", text: String(one), template: `${one}`, json: JSON.stringify(one) }])),
        theSameClassForBothTexts: kinds.text.constructor === kinds.assistantText.constructor,
        messagesArePlainObjects: wrapped.map((message) => Object.getPrototypeOf(message) === Object.prototype),
        extraTextIsAPlainObject: see(wrapped[4].content[2].experimental_content[0]),
      };
    },
  },
  {
    name: "a part made again from its own class: an image or a file takes a mode, a context, or nothing (unspecified); the others hold what they are given",
    run: (m) => {
      const see = seer(m);
      const { CODE } = m.classification.DataClassification;
      const wrapped = m.messages.toRedactedCoreMessages(conversation(), 1);
      const [Text, Image, File] = [wrapped[2].content[0], wrapped[2].content[1], wrapped[2].content[4]].map((one) => one.constructor);
      const [Unknown, ToolCall, ToolResult] = [wrapped[3].content[0], wrapped[3].content[4], wrapped[4].content[0]].map((one) => one.constructor);
      const context = { privacyMode: 3, enforceRedaction: true, note: "the caller's" };
      const string = m.factory.createRedactedString("held", CODE, "any_field", { privacyMode: 1, enforceRedaction: true });
      const held = [undefined, null, 0, "", false, Number.NaN, 2, "2", context];
      const payloads = ["picture", new Uint8Array([1, 2]), new URL("https://example.test/a.png"), 5, { toString: () => "by its own words" }, {}];
      return {
        image: held.map((modeOrContext) => see(new Image("picture", "image/png", { a: 1 }, modeOrContext))),
        file: held.map((modeOrContext) => see(new File("pages", "application/pdf", { a: 1 }, modeOrContext))),
        keepTheCallersContext: [new Image("p", "m", undefined, context).__privacyContext === context, new File("p", "m", undefined, context).__privacyContext === context],
        withNothingAtAll: [see(new Image()), see(new File())],
        shown: payloads.map((payload) => [String(new Image(payload, "m", undefined, 1)), String(new File(payload, "m", undefined, 1)), JSON.stringify([new Image(payload, "m", undefined, 4), new File(payload, "m", undefined, 4)])]),
        hidden: payloads.map((payload) => [String(new Image(payload, "m", undefined, { privacyMode: 0, enforceRedaction: true })), new File(payload, "m", undefined, { privacyMode: 2, enforceRedaction: true }).toJSON(), JSON.stringify(new Image(payload, "m", undefined, { privacyMode: 1, enforceRedaction: true }))]),
        notHiddenWhereTrainingIsAllowed: [String(new Image("picture", "m", undefined, context)), String(new File("pages", "m", undefined, { privacyMode: 4, enforceRedaction: true }))],
        nothingToShow: [attempt(() => String(new Image(undefined, "m", undefined, 1))), attempt(() => String(new File(null, "m", undefined, 1))), attempt(() => JSON.stringify(new Image(undefined, "m", undefined, { privacyMode: 1, enforceRedaction: true })))],
        text: [see(new Text(string, { a: 1 })), String(new Text(string)), see(new Text())],
        toolCall: [see(new ToolCall({ toolCallId: "c", toolName: "t", args: string, providerOptions: { a: 1 }, extra: "not kept" })), String(new ToolCall({ args: string })), see(new ToolCall({})), attempt(() => new ToolCall())],
        unknown: [see(new Unknown("kind", string)), String(new Unknown("kind", string)), see(new Unknown())],
        toolResult: [see(new ToolResult({ toolCallId: "c", toolName: "t", result: string, isError: true, providerOptions: { a: 1 }, experimental_content: [{ type: "text", text: string }], extra: "not kept" })), String(new ToolResult({ result: string })), see(new ToolResult({})), attempt(() => new ToolResult())],
      };
    },
  },

  // Unwrapping messages that were put together by hand, as the engine also does.
  {
    name: "unwrapping a user message: text is unwrapped, an image or a file is passed on as it is, any other part is refused, the id is not kept",
    run: (m) => {
      const { fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const held = (value) => m.factory.createRedactedString(value, m.classification.DataClassification.CODE, "user_text", 1);
      const image = new Uint8Array([1, 2]);
      const message = {
        _privacyMode: 1, role: "user", id: "not kept", extra: "not kept", providerOptions: { a: 1 },
        content: [{ type: "text", text: held("words"), providerOptions: { p: 1 }, extra: "not kept" }, { type: "text", text: held("no options") }, { type: "image", image, mimeType: "image/png", providerOptions: { q: 2 }, extra: "not kept", __privacyContext: { privacyMode: 1 } }, { type: "image" }, { type: "file", data: "pages", mimeType: "application/pdf", filename: "not kept.pdf", providerOptions: null }, { type: "file" }],
      };
      const back = fromRedactedCoreMessage(message, always);
      return {
        unwrapped: back,
        theVeryImageAndOptions: [back.content[2].image === image, back.providerOptions === message.providerOptions, back.content[0].providerOptions === message.content[0].providerOptions],
        aNewList: back.content !== message.content,
        plainText: fromRedactedCoreMessage({ role: "user", content: held("plain text"), id: "not kept" }, always),
        noParts: fromRedactedCoreMessage({ role: "user", content: [] }, always),
        refused: ["tool-call", "tool-result", "unknown", "reasoning", "Text", "", undefined, null].map((type) => attempt(() => fromRedactedCoreMessage({ role: "user", content: [{ type: "text", text: held("fine") }, { type, text: held("x") }] }, always))),
      };
    },
  },
  {
    name: "unwrapping an assistant message: text, tool calls and unknown parts only; arguments and unknown parts are read back from JSON when they are JSON",
    run: (m) => {
      const { fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const held = (value, field = "assistant_text") => m.factory.createRedactedString(value, m.classification.DataClassification.CODE, field, 1);
      const message = {
        _privacyMode: 1, role: "assistant", id: "msg_1", providerOptions: { a: 1 }, extra: "not kept",
        content: [
          { type: "text", text: held("words"), providerOptions: { p: 1 }, extra: "not kept" }, { type: "text", text: held("no options") }, { type: "text", text: held("options null"), providerOptions: null },
          { type: "tool-call", toolCallId: "call_1", toolName: "Read", args: held('{"path":"a.ts"}', "tool_call_args"), providerOptions: { q: 2 }, extra: "not kept" },
          { type: "tool-call", toolCallId: "call_2", toolName: "NotJson", args: held("ls -la", "tool_call_args") }, { type: "tool-call", args: held("", "tool_call_args") }, { type: "tool-call", args: held(" 12 ", "tool_call_args") }, { type: "tool-call", args: held("null", "tool_call_args"), providerOptions: undefined },
          { type: "unknown", originalType: "reasoning", data: held('{"type":"reasoning","text":"thinking"}', "assistant_reasoning"), providerOptions: { notKept: true } }, { type: "unknown", data: held("not JSON at all", "assistant_x") }, { type: "unknown", data: held("[1,2]", "assistant_x") }, { type: "unknown", data: held('"text"', "assistant_x") }, { type: "unknown", data: held("null", "assistant_x") },
        ],
      };
      const back = fromRedactedCoreMessage(message, always);
      return {
        unwrapped: back,
        fieldsOfEachPart: back.content.map((one) => (one !== null && typeof one === "object" && !Array.isArray(one) ? Object.keys(one) : shown(one))),
        theVeryOptions: [back.providerOptions === message.providerOptions, back.content[0].providerOptions === message.content[0].providerOptions, back.content[3].providerOptions === message.content[3].providerOptions],
        plainText: [fromRedactedCoreMessage({ role: "assistant", content: held("plain text"), id: 0, providerOptions: null }, always), fromRedactedCoreMessage({ role: "assistant", content: held("") }, always)],
        noParts: fromRedactedCoreMessage({ role: "assistant", content: [] }, always),
        refused: ["image", "file", "reasoning", "tool-result", "Text", "", undefined, null].map((type) => attempt(() => fromRedactedCoreMessage({ role: "assistant", content: [{ type: "text", text: held("fine") }, { type, text: held("x"), data: held("{}") }] }, always))),
      };
    },
  },
  {
    name: "unwrapping a tool message: every part comes back as a tool result, with its error flag, options and extra content only when they are there",
    run: (m) => {
      const { fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const held = (value, field = "tool_result") => m.factory.createRedactedString(value, m.classification.DataClassification.CODE, field, 1);
      const picture = { type: "image", data: "iVBORw0KGgo=" };
      const message = {
        _privacyMode: 1, role: "tool", id: "msg_tool", providerOptions: { a: 1 }, extra: "not kept",
        content: [
          { type: "tool-result", toolCallId: "call_1", toolName: "Read", result: held("plain words") },
          { type: "tool-result", toolCallId: "call_2", toolName: "Shell", result: held('{"exitCode":1}'), isError: true, providerOptions: { p: 1 }, extra: "not kept" },
          { type: "tool-result", toolCallId: "call_3", toolName: "Flags", result: held("null"), isError: false, providerOptions: null, experimental_content: [] },
          { type: "tool-result", toolCallId: "call_4", toolName: "Null", result: held(""), isError: null, experimental_content: [{ type: "text", text: held("extra words", "experimental_content_text"), extra: "not kept" }, picture, { type: "text", text: "plain, left as it is" }, { type: "text" }, { type: "note", text: held("not a text item, left wrapped", "experimental_content_text") }] },
          { type: "anything", result: held("7"), isError: undefined, providerOptions: undefined, experimental_content: undefined },
          { result: held("no type, no call") },
        ],
      };
      const back = fromRedactedCoreMessage(message, always);
      const leftWrapped = back.content[3].experimental_content[4];
      return {
        unwrapped: { ...back, content: back.content.map((one, index) => (index === 3 ? { ...one, experimental_content: one.experimental_content.slice(0, 4) } : one)) },
        fieldsOfEachPart: back.content.map((one) => Object.keys(one)),
        theItemLeftWrapped: [leftWrapped === message.content[3].experimental_content[4], leftWrapped.text instanceof m.types.RedactedString],
        theVeryPictureAndOptions: [back.content[3].experimental_content[1] === picture, back.providerOptions === message.providerOptions, back.content[1].providerOptions === message.content[1].providerOptions],
        newLists: [back.content !== message.content, back.content[2].experimental_content !== message.content[2].experimental_content],
        messageFields: [{ role: "tool", content: [] }, { role: "tool", content: [], id: null }, { role: "tool", content: [], id: undefined, providerOptions: undefined }, { role: "tool", content: [], providerOptions: null }].map((one) => JSON.stringify(fromRedactedCoreMessage(one, always))),
      };
    },
  },
  {
    name: "unwrapping a system message gives its text, with the options field always there and no id",
    run: (m) => {
      const { fromRedactedCoreMessage } = m.messages;
      const always = m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED;
      const held = (value) => m.factory.createRedactedString(value, m.classification.DataClassification.CODE, "system_content", 1);
      return [
        fromRedactedCoreMessage({ _privacyMode: 1, role: "system", content: held("You are Simeon."), providerOptions: { a: 1 }, id: "not kept", extra: "not kept" }, always),
        fromRedactedCoreMessage({ role: "system", content: held("") }, always),
        fromRedactedCoreMessage({ role: "system", content: held("x"), providerOptions: null }, always),
        fromRedactedCoreMessage({ role: "system", content: m.factory.createRedactedBytes(new Uint8Array([1]), "code", "system_content", 1) }, always),
      ];
    },
  },
  {
    name: "unwrapping a conversation for a purpose its mode does not allow: let through with a line for each field, refused, or hidden field by field",
    run: (m) => {
      const { toRedactedCoreMessages, fromRedactedCoreMessages, fromRedactedCoreMessage } = m.messages;
      const { STORAGE_FOR_LOGGING, STORAGE_FOR_USAGE, STORAGE_FOR_TRAINING, UNSAFE_ALWAYS_ALLOWED } = m.classification.PrivacyCapability;
      const see = seer(m);
      const asAlways = JSON.stringify(see(fromRedactedCoreMessages(toRedactedCoreMessages(conversation(), 1), UNSAFE_ALWAYS_ALLOWED)));
      const all = (context, purpose, ...options) => {
        const wrapped = toRedactedCoreMessages(conversation(), context);
        const { result, heard } = listening(() => attempt(() => fromRedactedCoreMessages(wrapped, purpose, ...options)));
        return { unwrapped: thrown.has(result) ? result : JSON.stringify(see(result)) === asAlways ? "everything, as when always allowed" : see(result), consoleLines: heard.length, allTheLine: heard.every(isTheLine) };
      };
      const each = (context, purpose, ...options) => toRedactedCoreMessages(conversation(), context).map((message) => {
        const { result, heard } = listening(() => attempt(() => fromRedactedCoreMessage(message, purpose, ...options)));
        return { unwrapped: see(result), consoleLines: heard.length };
      });
      const hiddenByTheCall = each(1, STORAGE_FOR_LOGGING, { enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true });
      const sameAsHiddenByTheCall = (answers) => (JSON.stringify(answers) === JSON.stringify(hiddenByTheCall) ? "as hidden instead (call)" : answers);
      return {
        "no storage, for logging": all(1, STORAGE_FOR_LOGGING),
        "no storage, for logging, asked to hide but not enforced": all(1, STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true }),
        "no training, for usage": all(2, STORAGE_FOR_USAGE),
        "no training, for logging": all(2, STORAGE_FOR_LOGGING),
        "no training, for training, enforced in the call": all(2, STORAGE_FOR_TRAINING, { enforcing: true }),
        "data training, for training, enforced in the call": all(3, STORAGE_FOR_TRAINING, { enforcing: true }),
        "no storage, for logging, enforced by the context": all({ privacyMode: 1, enforceRedaction: true }, STORAGE_FOR_LOGGING),
        "no storage, always allowed, enforced by the context and the call": all({ privacyMode: 1, enforceRedaction: true }, UNSAFE_ALWAYS_ALLOWED, { enforcing: true }),
        "unknown purpose": all(1, "something_else"),
        "each message, no storage, for logging, enforced in the call": each(1, STORAGE_FOR_LOGGING, { enforcing: true }),
        "each message, enforced by the context, refuses as enforced in the call": JSON.stringify(each({ privacyMode: 1, enforceRedaction: true }, STORAGE_FOR_LOGGING)) === JSON.stringify(each(1, STORAGE_FOR_LOGGING, { enforcing: true })),
        "each message, no storage, for logging, hidden instead (call)": hiddenByTheCall,
        "each message, no storage, for logging, hidden instead (context)": sameAsHiddenByTheCall(each({ privacyMode: 1, enforceRedaction: true }, STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true })),
        "each message, unspecified, for usage, hidden instead (context)": sameAsHiddenByTheCall(each({ privacyMode: 0, enforceRedaction: true }, STORAGE_FOR_USAGE, { redactUnallowedFieldsInsteadOfThrowing: true })),
        "each message, no training, for logging, hidden instead (context)": sameAsHiddenByTheCall(each({ privacyMode: 2, enforceRedaction: true }, STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true })),
        "each message, no training, for training, hidden instead (call)": sameAsHiddenByTheCall(each(2, STORAGE_FOR_TRAINING, { enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true })),
      };
    },
  },
  {
    name: "in one message the fields are unwrapped in their order: the first one not allowed is the one that refuses",
    run: (m) => {
      const { fromRedactedCoreMessage } = m.messages;
      const { CODE, CREDENTIALS, PATH, SAFE } = m.classification.DataClassification;
      const { STORAGE_FOR_LOGGING } = m.classification.PrivacyCapability;
      const held = (value, kind, field) => m.factory.createRedactedString(value, kind, field, 2);
      const refusal = (message) => hearing(() => attempt(() => fromRedactedCoreMessage(message, STORAGE_FOR_LOGGING, { enforcing: true })));
      const hidden = (message) => hearing(() => attempt(() => fromRedactedCoreMessage(message, STORAGE_FOR_LOGGING, { enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true })));
      const messages = {
        tool: { role: "tool", content: [{ toolCallId: "c1", result: held("a path", PATH, "first_result"), experimental_content: [{ type: "text", text: held("safe", SAFE, "first_extra") }] }, { toolCallId: "c2", result: held("code", CODE, "second_result"), experimental_content: [{ type: "text", text: held("a key", CREDENTIALS, "second_extra") }] }, { toolCallId: "c3", result: held("a key", CREDENTIALS, "third_result") }] },
        toolResultBeforeItsExtra: { role: "tool", content: [{ toolCallId: "c1", result: held("code", CODE, "first_result"), experimental_content: [{ type: "text", text: held("a key", CREDENTIALS, "first_extra") }] }] },
        toolExtraFirst: { role: "tool", content: [{ toolCallId: "c1", result: held("a path", PATH, "first_result"), experimental_content: [{ type: "text", text: held("a key", CREDENTIALS, "first_extra") }, { type: "text", text: held("code", CODE, "second_extra") }] }, { toolCallId: "c2", result: held("code", CODE, "second_result") }] },
        assistant: { role: "assistant", content: [{ type: "text", text: held("a path", PATH, "first_text") }, { type: "tool-call", args: held('{"a":1}', CODE, "first_args") }, { type: "unknown", data: held("{}", CREDENTIALS, "first_unknown") }, { type: "not a kind" }] },
        assistantBadKindFirst: { role: "assistant", content: [{ type: "not a kind" }, { type: "text", text: held("code", CODE, "first_text") }] },
        user: { role: "user", content: [{ type: "text", text: held("safe", SAFE, "first_text") }, { type: "image", image: "picture" }, { type: "text", text: held("a key", CREDENTIALS, "second_text") }, { type: "text", text: held("code", CODE, "third_text") }] },
      };
      return Object.fromEntries(Object.entries(messages).map(([name, message]) => [name, { refused: refusal(message), hidden: hidden(message) }]));
    },
  },
  {
    name: "many messages are wrapped and unwrapped one by one, in their order, each with the same mode, purpose and options",
    run: (m) => {
      const { toRedactedCoreMessages, toRedactedCoreMessage, fromRedactedCoreMessages, fromRedactedCoreMessage } = m.messages;
      const { STORAGE_FOR_LOGGING, UNSAFE_ALWAYS_ALLOWED } = m.classification.PrivacyCapability;
      const given = conversation();
      const wrapped = toRedactedCoreMessages(given, { privacyMode: 1, enforceRedaction: true });
      const options = { redactUnallowedFieldsInsteadOfThrowing: true };
      return {
        wrappedAsOneByOne: wrapped.map((one, index) => one === toRedactedCoreMessage(given[index], { privacyMode: 1, enforceRedaction: true })),
        unwrappedAsOneByOne: JSON.stringify(fromRedactedCoreMessages(wrapped, STORAGE_FOR_LOGGING, options)) === JSON.stringify(wrapped.map((one) => fromRedactedCoreMessage(one, STORAGE_FOR_LOGGING, options))),
        roles: [wrapped.map((one) => one.role).join(", "), fromRedactedCoreMessages(wrapped, UNSAFE_ALWAYS_ALLOWED).map((one) => one.role).join(", ")],
        newListsEachTime: [toRedactedCoreMessages(given, 1) !== toRedactedCoreMessages(given, 1), fromRedactedCoreMessages(wrapped, UNSAFE_ALWAYS_ALLOWED)[0] !== fromRedactedCoreMessages(wrapped, UNSAFE_ALWAYS_ALLOWED)[0]],
        noMessages: [toRedactedCoreMessages([], 1), fromRedactedCoreMessages([], UNSAFE_ALWAYS_ALLOWED), toRedactedCoreMessages([]), fromRedactedCoreMessages([])],
        oneBadMessageFailsTheLot: [attempt(() => toRedactedCoreMessages([given[0], { role: "developer", content: "x" }, given[1]], 1)), attempt(() => fromRedactedCoreMessages([wrapped[0], { role: "developer" }], UNSAFE_ALWAYS_ALLOWED)), attempt(() => fromRedactedCoreMessages(wrapped, STORAGE_FOR_LOGGING))],
        holesAreSkipped: (() => {
          const holed = [given[1], , given[0]]; // a list with a hole in it
          const out = toRedactedCoreMessages(holed, 1);
          return [out.length, 1 in out, out[0].role, out[2].role];
        })(),
      };
    },
  },

  // A developer's run, and where there is no process at all.
  {
    name: "whether a run is a developer's is decided once, when the part is loaded",
    run: (m) => {
      const kept = { NODE_ENV: process.env.NODE_ENV, VITEST: process.env.VITEST };
      process.env.NODE_ENV = "development";
      delete process.env.VITEST;
      try {
        return developerSigns(m);
      } finally {
        for (const [name, value] of Object.entries(kept)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    },
  },
  {
    name: "loaded with NODE_ENV set to development, and VITEST not set to true, the part runs as a developer's; in every other case it does not",
    run: async (m, tools) => {
      const environments = [
        ["nothing set", {}], ["NODE_ENV production", { NODE_ENV: "production" }], ["NODE_ENV test", { NODE_ENV: "test" }], ["NODE_ENV empty", { NODE_ENV: "" }], ["NODE_ENV Development", { NODE_ENV: "Development" }], ["NODE_ENV development followed by a space", { NODE_ENV: "development " }],
        ["NODE_ENV development", { NODE_ENV: "development" }], ["NODE_ENV development, VITEST true", { NODE_ENV: "development", VITEST: "true" }], ["NODE_ENV development, VITEST TRUE", { NODE_ENV: "development", VITEST: "TRUE" }], ["NODE_ENV development, VITEST 1", { NODE_ENV: "development", VITEST: "1" }], ["NODE_ENV development, VITEST false", { NODE_ENV: "development", VITEST: "false" }], ["NODE_ENV development, VITEST empty", { NODE_ENV: "development", VITEST: "" }],
        ["VITEST true alone", { VITEST: "true" }],
      ];
      const answers = {};
      for (const [label, env] of environments) answers[label] = developerSigns(await loadedUnder(env, tools));
      return answers;
    },
  },
  {
    name: "in a developer's run, text made from a field that would be hidden is refused with the way it was made, unless redaction is enforced",
    run: async (m, tools) => {
      const dev = await loadedUnder({ NODE_ENV: "development" }, tools);
      const settings = [["a mode alone", (mode) => mode], ["context enforces", (mode) => ({ privacyMode: mode, enforceRedaction: true })], ["context says not to enforce", (mode) => ({ privacyMode: mode, enforceRedaction: false })]];
      const { CODE, SAFE, PATH } = dev.classification.DataClassification;
      const one = dev.factory.createRedactedString("the value", CODE, "user_text", 1);
      const context = { privacyMode: 1 };
      const followed = dev.factory.createRedactedString("the value", PATH, "folder_path", context);
      const relabelled = dev.factory.createRedactedString("the value", CODE, "user_text", 1);
      const steps = {};
      steps.asMade = attempt(() => String(followed));
      context.enforceRedaction = true;
      steps.thenEnforced = attempt(() => String(followed));
      context.enforceRedaction = false;
      context.privacyMode = 4;
      steps.thenNotEnforcedInAModeThatAllows = attempt(() => String(followed));
      const relabelling = { asMade: attempt(() => relabelled.toJSON()) };
      relabelled.__fieldName = "renamed";
      relabelled.__classification = SAFE;
      relabelling.renamedAndCalledSafe = attempt(() => relabelled.toJSON());
      relabelled.__isRedacted = false;
      relabelling.thenSaidNotHidden = attempt(() => relabelled.toJSON());
      return {
        table: table(settings, named([...Object.values(dev.classification.DataClassification), "made_up"]), (ctx, kind) => across([...MODES, ["9", 9]], (mode) => textCell(dev.factory.createRedactedString("the value", kind, "field", ctx(mode)), "the value", "field", kind))),
        eachWay: hearing(() => ({
          toString: attempt(() => one.toString()),
          toJSON: attempt(() => one.toJSON()),
          valueOf: attempt(() => one.valueOf()),
          template: attempt(() => `${one}`),
          joined: attempt(() => "before " + one),
          json: attempt(() => JSON.stringify({ field: one })),
          looselyEqual: attempt(() => one == "the value"),
          asPrimitive: ["string", "default", "number", undefined].map((hint) => attempt(() => one[Symbol.toPrimitive](hint))),
          asNumber: attempt(() => +one),
          tag: Object.prototype.toString.call(one),
        })),
        derived: [attempt(() => String(one.__clone("x"))), attempt(() => String(one.trim())), attempt(() => String(one.safeTransform((value) => value))), attempt(() => String(one.split(" ")[0]))],
        aContextThatChanges: steps,
        labelsThatChange: relabelling,
        safeText: String(dev.factory.safeString("the value")),
        questionsAreStillAnswered: [one.length, one.empty, one.startsWith("the"), one.indexOf("value"), one.getPrivacyContext()],
      };
    },
  },
  {
    name: "in a developer's run, every unwrap answers as in any run, except that one let through says nothing to the console",
    run: async (m, tools) => {
      const dev = await loadedUnder({ NODE_ENV: "development" }, tools);
      const tableOf = (loaded, held, { context, options }) => table(named([...Object.values(loaded.classification.DataClassification), "made_up"]), named(Object.values(loaded.classification.PrivacyCapability)), (kind, purpose) => across([...MODES, ["9", 9]], (mode) => {
        const value = held.value();
        return unwrapCell(held, held.make(loaded)(value, kind, "field", context(mode)), value, { purpose, kind, mode, field: "field" }, options);
      }));
      const answers = {};
      for (const held of HELD) {
        for (const enforcement of ENFORCEMENTS) {
          const inAnyRun = JSON.stringify(tableOf(m, held, enforcement));
          const inADevelopersRun = JSON.stringify(tableOf(dev, held, enforcement));
          answers[enforcement.name(held.what)] = {
            asInAnyRunButSilent: inADevelopersRun === inAnyRun.replaceAll(" + line", ""),
            cellsThatSayNothingNow: inAnyRun.split(" + line").length - 1,
            linesInADevelopersRun: inADevelopersRun.split(" + line").length - 1,
          };
        }
      }
      const { CODE } = dev.classification.DataClassification;
      const { STORAGE_FOR_LOGGING } = dev.classification.PrivacyCapability;
      answers.oneOfEach = HELD.map((held) => {
        const value = held.value();
        return [
          hearing(() => held.make(dev)(value, CODE, "field", 1).unwrap(STORAGE_FOR_LOGGING) === value),
          hearing(() => attempt(() => held.make(dev)(value, CODE, "field", 1).unwrap(STORAGE_FOR_LOGGING, { enforcing: true }))),
          hearing(() => attempt(() => held.make(dev)(value, CODE, "field", { privacyMode: 1, enforceRedaction: true }).unwrap(STORAGE_FOR_LOGGING, { redactUnallowedFieldsInsteadOfThrowing: true }))),
        ];
      });
      return answers;
    },
  },
  {
    name: "in a developer's run, a wrapped conversation unwraps as ever, but writing it as JSON or text is refused where a field would be hidden",
    run: async (m, tools) => {
      const dev = await loadedUnder({ NODE_ENV: "development" }, tools);
      const see = seer(dev);
      const { toRedactedCoreMessages, fromRedactedCoreMessages } = dev.messages;
      const { UNSAFE_ALWAYS_ALLOWED, STORAGE_FOR_LOGGING } = dev.classification.PrivacyCapability;
      const main = JSON.stringify(seer(m)(m.messages.fromRedactedCoreMessages(m.messages.toRedactedCoreMessages(conversation(), 1), m.classification.PrivacyCapability.UNSAFE_ALWAYS_ALLOWED)));
      const wrapped = toRedactedCoreMessages(conversation(), 1);
      const allowing = toRedactedCoreMessages(conversation(), 3);
      const enforced = toRedactedCoreMessages(conversation(), { privacyMode: 1, enforceRedaction: true });
      const asText = (message) => (Array.isArray(message.content) ? message.content.map((one) => brief(attempt(() => String(one)))) : [brief(attempt(() => String(message.content)))]);
      const inAnyRun = (context) => {
        const again = m.messages.toRedactedCoreMessages(conversation(), context);
        return JSON.stringify({ json: JSON.stringify(again), text: again.map((message) => (Array.isArray(message.content) ? message.content.map((one) => String(one)) : [String(message.content)])) });
      };
      return hearing(() => ({
        unwrapsAsInAnyRun: JSON.stringify(see(fromRedactedCoreMessages(wrapped, UNSAFE_ALWAYS_ALLOWED))) === main,
        wrapsAsInAnyRun: JSON.stringify(see(wrapped)) === JSON.stringify(seer(m)(m.messages.toRedactedCoreMessages(conversation(), 1))),
        forLoggingWithNoEnforcement: JSON.stringify(see(fromRedactedCoreMessages(wrapped, STORAGE_FOR_LOGGING))) === main,
        json: wrapped.map((message) => brief(attempt(() => JSON.stringify(message)))),
        text: wrapped.map(asText),
        extraContentAsText: wrapped[4].content[2].experimental_content.map((item) => brief(attempt(() => String(item.text)))),
        whereTrainingIsAllowedAsInAnyRun: JSON.stringify({ json: JSON.stringify(allowing), text: allowing.map(asText) }) === inAnyRun(3),
        whenEnforcedAsInAnyRun: JSON.stringify({ json: JSON.stringify(enforced), text: enforced.map(asText) }) === inAnyRun({ privacyMode: 1, enforceRedaction: true }),
      }));
    },
  },
  {
    name: "where there is no process at all, as in a browser, the part loads and does not run as a developer's",
    run: async () => {
      const built = await build({ entryPoints: [path.join(sourceRoot(), modules.types)], bundle: true, write: false, format: "iife", globalName: "redaction", platform: "neutral", target: "es2022", logLevel: "silent" });
      const heard = [];
      const sandbox = { console: { error: (...args) => { heard.push(args.map(String)); } } };
      vm.runInNewContext(`${built.outputFiles[0].text}\nglobalThis.redaction = redaction;`, sandbox);
      const made = new sandbox.redaction.RedactedString("the value", "code", "user_text", 1);
      const enforced = new sandbox.redaction.RedactedString("the value", "code", "user_text", { privacyMode: 1, enforceRedaction: true });
      return { processIsThere: vm.runInNewContext("typeof process", sandbox), text: [String(made), JSON.stringify([made]), String(enforced)], forLogging: made.unwrap("storage_for_logging"), heard };
    },
  },
];
