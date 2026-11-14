/**
 * An agent's transcript: where the files of a conversation are kept, what is taken out of a text before it is
 * written, the three forms a conversation is written in (text, JSON, one JSON line per message), and the trace a
 * cloud agent's conversation is turned into.
 *
 * The store touches no disk and no database itself. It is handed three things and these scenarios stand in for
 * each: a blob store it reads the messages from, a function that writes a whole file, a function that adds to a
 * file. Every stand-in writes what it was asked into one log, so that the names of the files, the exact text of
 * each, and the order of everything are kept. The blobs are the stored form: a message is JSON text as the engine
 * writes it today, a summary archive is protobuf (field 1, repeated bytes: the ids of the messages it put away).
 *
 * Three things of the machine are stood in for while the store runs, and put back after:
 * - the clock (`performance.now`): it moves 3 ms each time it is read, so a time is a number of readings;
 * - the console: a line the store writes to it is kept instead of shown;
 * - OpenTelemetry's tracer provider: a span is only what was asked of it.
 */
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { trace } from "@opentelemetry/api";

export const part = "packages/agent-transcript";
export const modules = {
  paths: "source/packages/agent-transcript/paths.ts",
  stripping: "source/packages/agent-transcript/context-stripping.ts",
  index: "source/packages/agent-transcript/index.ts",
  traceFormat: "source/packages/agent-transcript/trace-format.ts",
  // Not this part's code: the contexts the store is given are real ones, and what a context handed on to the blob
  // store carries (its span, whether spans may be started under it) is asked of the package that made it.
  context: "source/packages/context/core.ts",
  otel: "source/packages/context/otel.ts",
};

const NOT_THIS_PARTS = "not this part's code, and with scenarios of its own (packages/context): the module is listed only so that a context can be asked what it carries";
export const skipped = Object.fromEntries(
  ["INHERITABLE_SPAN_ATTRIBUTES_KEY", "getTracer", "createContextFromSpanContext", "createContextFromRemoteSpanContext", "DisposableSpan", "createSpan", "recordCompletedSpanIfParented", "reportEvent"].map((name) => [`otel.${name}`, NOT_THIS_PARTS]),
);

/** The conversation every write here is for, unless a case says otherwise. */
const ID = "conv-1";
const utf8 = (text) => new TextEncoder().encode(text);
/** In a list of blobs: there is no blob under this id. */
const GONE = Symbol("no blob under this id");

/** Every case of a table asked in turn, each answer under the case's name. */
async function table(cases, ask) {
  const out = {};
  for (const [name, given] of Object.entries(cases)) out[name] = await ask(given, name);
  return out;
}

/**
 * An error as it is kept. Where the runtime itself refuses to call or to go through something, its sentence names
 * a variable as the build happened to call it ("content2.map is not a function"), which is no part of what the
 * code does: such an error is kept by its class alone.
 */
function told(value) {
  if (!(value instanceof Error)) return value;
  if (/ is not (a function|iterable)$/.test(value.message)) return `a ${value.name} of the runtime's own: what was to be called, or gone through, is not a function, or not a list`;
  return value;
}

/** What a call gives back, or what it throws, kept either way. */
function attempt(run) {
  try {
    return run();
  } catch (error) {
    return { threw: told(error) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The stored form
// ---------------------------------------------------------------------------------------------------------------

function varint(value) {
  const out = [];
  let left = value;
  while (left > 127) {
    out.push((left % 128) | 128);
    left = Math.floor(left / 128);
  }
  out.push(left);
  return out;
}
/** One protobuf field that holds bytes or text. */
const held = (field, payload) => [...varint((field << 3) | 2), ...varint(payload.length), ...payload];
/** One protobuf field that holds a whole number. */
const counted = (field, value) => [...varint(field << 3), ...varint(value)];
/** A summary archive as it is stored: the ids of the messages it put away, then whatever else is given. */
const archiveOf = (names, more = []) => Uint8Array.from([...names.flatMap((name) => held(1, utf8(name))), ...more]);

/** A blob for an entry of a case: bytes as they are, a function to be called when the blob is read, nothing, or a message written as the engine writes it. */
function blobFor(entry) {
  if (entry === GONE) return undefined;
  if (entry instanceof Uint8Array || typeof entry === "function") return entry;
  return utf8(JSON.stringify(entry));
}

const says = (role, content, more = {}) => ({ role, content, ...more });
const user = (content, more) => says("user", content, more);
const assistant = (content, more) => says("assistant", content, more);
const text = (words) => ({ type: "text", text: words });
const toolCall = (toolName, args) => ({ type: "tool-call", toolCallId: "call-1", toolName, args });
const toolResult = (toolName) => ({ type: "tool-result", toolCallId: "call-1", toolName, result: "kept elsewhere" });
const SUMMARY = { providerOptions: { simeon: { isSummary: true } } };

// ---------------------------------------------------------------------------------------------------------------
// The stand-ins
// ---------------------------------------------------------------------------------------------------------------

/**
 * One case's surroundings: the log, the blobs, a real context, and a store under test.
 *
 * `given.messages` are the conversation's own messages (blobs m1, m2, …), `given.archives` its summary archives
 * (a1, a2, …; a list is an archive of those messages, a1.m1, a1.m2, …; bytes are the archive's blob as they are),
 * `given.blobs` further blobs by name. `given.store` is the store's options, `given.append` gives it a function to
 * add to a file with. `given.context(root, otel)` makes the context the store is called with from the usual one.
 */
function bench(loaded, given = {}) {
  const { index, context, otel } = loaded;
  const log = [];
  const spans = [];
  const blobs = new Map();
  const promptIds = [];
  const archiveIds = [];
  (given.messages ?? []).forEach((entry, at) => {
    const name = `m${at + 1}`;
    blobs.set(name, blobFor(entry));
    promptIds.push(utf8(name));
  });
  (given.archives ?? []).forEach((entry, at) => {
    const name = `a${at + 1}`;
    archiveIds.push(utf8(name));
    if (!Array.isArray(entry)) return void blobs.set(name, blobFor(entry));
    const names = entry.map((message, n) => {
      blobs.set(`${name}.m${n + 1}`, blobFor(message));
      return `${name}.m${n + 1}`;
    });
    blobs.set(name, archiveOf(names));
  });
  for (const [name, entry] of Object.entries(given.blobs ?? {})) blobs.set(name, blobFor(entry));

  const MARK = context.createKey(Symbol("recorded: what the caller put on its context"), "nothing");
  /** What a context handed to the blob store is: the names it was made under, the span it carries, and what it still carries of the caller's. */
  const about = (ctx) => {
    if (ctx === null || typeof ctx !== "object" || typeof ctx.getPath !== "function") return "not a context";
    const span = otel.getSpan(ctx);
    const quiet = otel.getSpanContextData(ctx)?.traceFlags === 0;
    return `${ctx.getPath().join(" > ")}; ${span === undefined ? "no span" : (span.label ?? "a span of OpenTelemetry's own")}${quiet ? "; no span is started under it" : ""}; carries ${ctx.get(MARK)}`;
  };

  const shelf = {
    getBlob(ctx, id) {
      const name = new TextDecoder().decode(id);
      log.push({ read: name, with: about(ctx) });
      const blob = blobs.get(name);
      return typeof blob === "function" ? blob() : Promise.resolve(blob);
    },
  };
  const writes = async (file, words) => {
    log.push({ write: file, text: words });
    const failure = given.writeFails?.(file);
    if (failure) throw failure;
  };
  const appends = async (file, words) => {
    log.push({ append: file, text: words });
    const failure = given.appendFails?.(file);
    if (failure) throw failure;
  };

  const tracer = {
    startSpan(name, options, under) {
      const above = under === undefined ? undefined : trace.getSpan(under);
      const span = {
        label: `span ${spans.length + 1}, "${name}"`,
        under: above === undefined ? undefined : (above.label ?? "a span of OpenTelemetry's own"),
        attributes: [],
        ended: 0,
        setAttribute(key, value) {
          log.push({ span: span.label, set: key, to: value });
          span.attributes.push(`${key}=${value}`);
          return span;
        },
        end(...times) {
          span.ended += 1;
          log.push({ span: span.label, ended: times.length === 0 ? "now" : times });
          const failure = given.endFails?.(name);
          if (failure) throw failure;
        },
        spanContext: () => ({ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: `b7ad6b71692033${String(spans.indexOf(span) + 10)}`, traceFlags: 1 }),
        isRecording: () => true,
      };
      spans.push(span);
      log.push({ span: span.label, started: options === undefined ? "with no options" : options, under: span.under ?? "no span" });
      return span;
    },
  };
  const provider = { getTracer: () => tracer };

  const clock = { reads: 0 };
  const desk = {
    log,
    blobs,
    shelf,
    writes,
    appends,
    clock,
    MARK,
    state: given.state ?? { mode: given.mode, rootPromptMessagesJson: promptIds, summaryArchives: archiveIds },
    files: () => log.filter((entry) => "write" in entry || "append" in entry),
    said: () => log.filter((entry) => "said" in entry).map((entry) => entry.said),
    reads: () => log.filter((entry) => "read" in entry).map((entry) => entry.read).join(", "),
    spans: () => spans.map((span) => `${span.label}${span.under === undefined ? "" : ` under ${span.under}`}: ${span.attributes.join(" ") || "no attributes"}; ended ${span.ended === 1 ? "once" : `${span.ended} times`}`),
    /** All that came of the case, shortly: the files in order, what went to the console, what an overview was asked of, the blobs read in order, each span with its attributes in order, and how often the clock was read. */
    seen: () => ({
      files: desk.files(),
      ...(desk.said().length === 0 ? {} : { said: desk.said() }),
      ...(log.some((entry) => "overviewAskedOf" in entry) ? { overviewAskedOf: log.filter((entry) => "overviewAskedOf" in entry).map((entry) => entry.overviewAskedOf) } : {}),
      read: desk.reads(),
      spans: desk.spans(),
      clockReads: clock.reads,
    }),
    /** A store as the case asks for it. */
    store(options = given.store) {
      const withAppend = given.append ? { ...options, appendFile: given.appendFile ?? appends } : options;
      const project = given.projectDir ?? "/project";
      return withAppend === undefined ? new index.TranscriptStore(project, shelf, given.writeFile ?? writes) : new index.TranscriptStore(project, shelf, given.writeFile ?? writes, withAppend);
    },
    /** `act` run with the stand-ins in place; what it throws is kept as its answer. */
    async run(act) {
      const realError = console.error;
      const realPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
      console.error = (...said) => void log.push({ said: said.map(told) });
      Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: { now: () => (clock.reads += 1) * 3 } });
      trace.disable();
      if (given.tracing !== false) trace.setGlobalTracerProvider(provider);
      try {
        const root = context.createContext().with(MARK, "the caller's value").withName("turn");
        const ctx = given.context === undefined ? root : given.context(root, otel);
        return await act({ store: desk.store(), state: desk.state, ctx, desk });
      } catch (error) {
        return { threw: told(error) };
      } finally {
        trace.disable();
        console.error = realError;
        Object.defineProperty(globalThis, "performance", realPerformance);
      }
    },
  };
  return desk;
}

/** The options of one write: `given.write` as it is, with `given.overview` (if any) as its overview factory, which notes what it was handed. */
function writeOptions(desk, given) {
  if (given.overview === undefined) return given.write;
  return {
    ...given.write,
    overviewFactory: async (formatted) => {
      desk.log.push({ overviewAskedOf: formatted });
      return given.overview(formatted);
    },
  };
}

/** One whole write of a conversation, and all that came of it. */
async function fullWrite(loaded, given = {}) {
  const desk = bench(loaded, given);
  const answered = await desk.run(({ store, state, ctx }) => {
    const options = writeOptions(desk, given);
    return options === undefined ? store.writeFromStateFull(ctx, state, given.id ?? ID) : store.writeFromStateFull(ctx, state, given.id ?? ID, options);
  });
  return { answered, ...desk.seen() };
}

/** One write that adds to what was written before, when `given.previous` messages had been written, and all that came of it. */
async function laterWrite(loaded, given = {}) {
  const desk = bench(loaded, { append: true, store: { writeText: false, writeJsonl: true }, ...given });
  const answered = await desk.run(({ store, state, ctx }) => {
    const options = writeOptions(desk, given);
    return options === undefined ? store.writeFromStateIncremental(ctx, state, given.id ?? ID, given.previous) : store.writeFromStateIncremental(ctx, state, given.id ?? ID, given.previous, options);
  });
  return { answered, ...desk.seen() };
}

const FORMS = [
  ["txt", { writeText: true }],
  ["json", { writeText: false, writeJson: true }],
  ["jsonl", { writeText: false, writeJsonl: true }],
];

/**
 * What one conversation comes to in each of the three files, each written by a store that writes only that one
 * (a failure in one form then says nothing of the others). A form is its text; "nothing is written" when the
 * write went well and wrote nothing; or the whole of what happened when it did not go well.
 */
async function forms(loaded, given) {
  const out = {};
  const asked = Array.isArray(given) ? { messages: given } : given;
  for (const [form, store] of FORMS) {
    const desk = bench(loaded, { ...asked, store });
    const answered = await desk.run(({ store: made, state, ctx }) => {
      const options = writeOptions(desk, asked);
      return options === undefined ? made.writeFromStateFull(ctx, state, ID) : made.writeFromStateFull(ctx, state, ID, options);
    });
    const files = desk.files();
    const said = desk.said();
    if (answered !== true || said.length > 0 || files.length > 1 || (files.length === 1 && files[0].write !== `/project/agent-transcripts/${ID}/${ID}.${form}`)) out[form] = { answered, files, said };
    else out[form] = files.length === 0 ? "nothing is written" : files[0].text;
  }
  return out;
}

/** A long run of one letter written as its length, wherever it is in an answer, so that a blob of megabytes is kept as a line. */
function shortened(value) {
  if (typeof value === "string") return value.replace(/a{100,}/g, (run) => `<the letter a, ${run.length} times>`);
  if (Array.isArray(value)) return value.map(shortened);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shortened(inner)]));
  return value;
}

/** A message blob of exactly `bytes` bytes, said by the assistant. */
function messageOfSize(bytes) {
  const empty = JSON.stringify(assistant("")).length;
  return utf8(JSON.stringify(assistant("a".repeat(bytes - empty))));
}

/** The messages of an ordinary turn, as the engine stores them. */
const ORDINARY = [
  says("system", "You are an agent."),
  user("<user_info>\nOS: darwin\n</user_info>\n<rules>\nBe brief.\n</rules>"),
  user("<user_query>\nWhat is in the README?\n</user_query>"),
  assistant([{ type: "reasoning", text: "I should read it." }, text("I will read the file."), toolCall("Read", { path: "README.md", limit: 20 })]),
  says("tool", [toolResult("Read")]),
  assistant("<think>short answer</think>It says hello."),
];

// The kinds of message of a cloud agent's conversation, by their numbers on the wire.
const HUMAN = 1;
const AI = 2;
const human = (words, more = {}) => ({ type: HUMAN, text: words, toolResults: [], ...more });
const ai = (words, toolResults = [], more = {}) => ({ type: AI, text: words, toolResults, ...more });

export const scenarios = [
  // -------------------------------------------------------------------------------------------------------------
  // Where a transcript is kept
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "a conversation's transcript is kept in a folder of its own name, under agent-transcripts",
    run: ({ paths }) => ({
      jsonl: paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary", ext: "jsonl" }),
      txt: paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary", ext: "txt" }),
      json: paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary", ext: "json" }),
      "no extension": paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary", ext: "" }),
      "no extension given": paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary" }),
      "any other kind": paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "something else", ext: "jsonl" }),
      "no kind": paths.getTranscriptRelativePath({ conversationId: "conv-1", ext: "jsonl" }),
      "a parent named for a conversation that is no subagent is not used": paths.getTranscriptRelativePath({ conversationId: "conv-1", kind: "primary", parentConversationId: "parent-1", ext: "jsonl" }),
      "a uuid": paths.getTranscriptRelativePath({ conversationId: "0af76519-16cd-43dd-8448-eb211c80319c", kind: "primary", ext: "jsonl" }),
    }),
  },
  {
    name: "a subagent's transcript goes under its parent's folder, but only when a parent is named",
    run: ({ paths }) => ({
      "with a parent": paths.getTranscriptRelativePath({ conversationId: "child-1", kind: "subagent", parentConversationId: "parent-1", ext: "jsonl" }),
      "with a parent, as text": paths.getTranscriptRelativePath({ conversationId: "child-1", kind: "subagent", parentConversationId: "parent-1", ext: "txt" }),
      "with no parent": paths.getTranscriptRelativePath({ conversationId: "child-1", kind: "subagent", ext: "jsonl" }),
      "with an empty parent": paths.getTranscriptRelativePath({ conversationId: "child-1", kind: "subagent", parentConversationId: "", ext: "jsonl" }),
      "the kind in other letters is not a subagent": paths.getTranscriptRelativePath({ conversationId: "child-1", kind: "Subagent", parentConversationId: "parent-1", ext: "jsonl" }),
      "both names made safe": paths.getTranscriptRelativePath({ conversationId: "child/1", kind: "subagent", parentConversationId: "parent 1", ext: "jsonl" }),
      "a parent that is the child itself": paths.getTranscriptRelativePath({ conversationId: "same", kind: "subagent", parentConversationId: "same", ext: "jsonl" }),
    }),
  },
  {
    name: "an id is made safe for a file name: escaped as in an address, with every % written _, and cut at 200 characters",
    run: ({ paths }) => {
      const where = (conversationId) => paths.getTranscriptRelativePath({ conversationId, kind: "primary", ext: "x" });
      const cut = (conversationId) => {
        const got = where(conversationId);
        const name = got.slice(got.lastIndexOf("/") + 1, -2);
        return { length: name.length, end: name.slice(-8), folderIsTheSame: got === `agent-transcripts/${name}/${name}.x` };
      };
      return {
        "a space and a slash": where("a b/c"),
        "going up a folder": where("../../etc/passwd"),
        "a backslash and a colon": where("C:\\Users\\me"),
        "letters with accents": where("été"),
        "a face": where("😀"),
        "a percent sign": where("50%"),
        "an underscore stays, so two ids can come to one name": [where("a_20b"), where("a b")],
        "what an address keeps": where("A-Za-z0-9-_.!~*'()"),
        "a dot and two dots": [where("."), where("..")],
        "an empty id": where(""),
        "a number": where(42),
        "nothing at all": where(undefined),
        "199 letters": cut("a".repeat(199)),
        "200 letters": cut("a".repeat(200)),
        "201 letters": cut("a".repeat(201)),
        "a cut that falls inside an escape": cut(`${"a".repeat(198)}/b`),
        "a cut that falls after an escape": cut(`${"a".repeat(197)}/b`),
        "a long parent and a long child": (() => {
          const got = paths.getTranscriptRelativePath({ conversationId: "c".repeat(300), kind: "subagent", parentConversationId: "p".repeat(300), ext: "jsonl" });
          return got.split("/").map((piece) => `${piece.slice(0, 12)}… (${piece.length})`);
        })(),
      };
    },
  },
  {
    name: "an id that cannot be escaped, or no question at all, is refused by the runtime",
    run: ({ paths }) => ({
      "half of a pair of code units": attempt(() => paths.getTranscriptRelativePath({ conversationId: "a\ud800", kind: "primary", ext: "jsonl" })),
      "a parent with half a pair": attempt(() => paths.getTranscriptRelativePath({ conversationId: "ok", kind: "subagent", parentConversationId: "\udc00", ext: "jsonl" })),
      "a parent with half a pair, for what is no subagent": attempt(() => paths.getTranscriptRelativePath({ conversationId: "ok", kind: "primary", parentConversationId: "\udc00", ext: "jsonl" })),
      "nothing asked": attempt(() => paths.getTranscriptRelativePath()),
      "null asked": attempt(() => paths.getTranscriptRelativePath(null)),
    }),
  },

  // -------------------------------------------------------------------------------------------------------------
  // What is taken out of a text
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "the tags of context the engine adds to what a person said, in the order they are taken out",
    run: ({ stripping }) => ({ tags: stripping.CONTEXT_TAGS_TO_STRIP, count: stripping.CONTEXT_TAGS_TO_STRIP.length, isAList: Array.isArray(stripping.CONTEXT_TAGS_TO_STRIP), frozen: Object.isFrozen(stripping.CONTEXT_TAGS_TO_STRIP) }),
  },
  {
    name: "a tag is taken out with all that is inside it, whatever its case and whatever follows its name after a space",
    run: ({ stripping }) =>
      Object.fromEntries(
        [
          "before<rules>inside</rules>after",
          "<rules>all of it</rules>",
          "<RULES>capitals</RULES> stay out",
          "<Rules>mixed</rULES> too",
          '<rules id="1" kind=\'x\'>with attributes</rules>.',
          "<rules\n>a line break after the name</rules>.",
          "<rules\t>a tab after the name</rules>.",
          "<rules >a space after the name</rules>.",
          "<rules>several\nlines\n\ninside</rules>.",
          "<rules></rules>empty",
          "<rules>one</rules> and <rules>two</rules> and <rules>three</rules>.",
          "<rules>with <b>other</b> tags inside</rules>.",
          "<rules>a > sign and a < sign inside</rules>.",
          "<rules a='>'>an attribute that holds > ends the tag early</rules>.",
        ].map((words) => [words, stripping.stripTags(words, ["rules"])]),
      ),
  },
  {
    name: "what is not a whole tag of that name stays",
    run: ({ stripping }) =>
      Object.fromEntries(
        [
          "<rulesx>another name</rulesx>",
          "<xrules>another name</xrules>",
          "<rules-more>a longer name</rules-more>",
          "<rules/>closed at once",
          "<rules/>closed at once, then closed again</rules>",
          "<rules>never closed",
          "never opened</rules>",
          "< rules>a space before the name</rules>",
          "<rules>closed with a space</rules >",
          "<rules>closed with a space</rules > and then closed</rules>.",
          "</rules>backwards<rules>",
          "&lt;rules&gt;escaped&lt;/rules&gt;",
          "plain words",
          "",
        ].map((words) => [words, stripping.stripTags(words, ["rules"])]),
      ),
  },
  {
    name: "the shortest stretch is taken each time, so a tag inside one of its own name leaves the outer end behind",
    run: ({ stripping }) =>
      Object.fromEntries(
        ["<rules>outer<rules>inner</rules>tail</rules>end", "<rules><rules><rules>deep</rules></rules></rules>", "<rules>a</rules>between<rules>b</rules>", "<rules>one<rules>two</rules>"].map((words) => [words, stripping.stripTags(words, ["rules"])]),
      ),
  },
  {
    name: "three line breaks or more left in a text become two, and the ends are trimmed",
    run: ({ stripping }) =>
      Object.fromEntries(
        [
          "a\nb",
          "a\n\nb",
          "a\n\n\nb",
          "a\n\n\n\n\n\nb",
          "a\n<rules>x</rules>\nb",
          "a\n\n<rules>x</rules>\n\nb",
          "a\n \n \nb",
          "a\r\n\r\n\r\nb",
          "  \n\t both ends \n\n ",
          "\n\n\n",
          "<rules>x</rules>",
          "  <rules>x</rules>  kept  ",
          "a\u00a0\n\n\n\u00a0",
        ].map((words) => [JSON.stringify(words), stripping.stripTags(words, ["rules"])]),
      ),
  },
  {
    name: "tags are taken out one after another in the order given: a tag made by taking another out goes only if its turn is still to come",
    run: ({ stripping }) => ({
      "two tags": stripping.stripTags("<a>1</a>-<b>2</b>-<c>3</c>", ["a", "b"]),
      "the first leaves a tag for the second": stripping.stripTags("<b<a>x</a>>y</b>z", ["a", "b"]),
      "the second leaves a tag for the first, too late": stripping.stripTags("<a<b>x</b>>y</a>z", ["a", "b"]),
      "one inside the other": stripping.stripTags("<a>1<b>2</b>3</a>4", ["a", "b"]),
      "one inside the other, the inner first": stripping.stripTags("<a>1<b>2</b>3</a>4", ["b", "a"]),
      "one that crosses another": stripping.stripTags("<a>1<b>2</a>3</b>4", ["a", "b"]),
      "one that crosses another, the other first": stripping.stripTags("<a>1<b>2</a>3</b>4", ["b", "a"]),
      "a tag named twice": stripping.stripTags("<a>1<a>2</a>3</a>4", ["a", "a"]),
      "no tags named": stripping.stripTags("  <a>1</a>\n\n\n\n<b>2</b>  ", []),
      "the context tags, of which the first can leave one for a later": stripping.stripContextTags("<ru<user_info>x</user_info>les>y</rules>z"),
      "the context tags, of which a later can leave one for the first": stripping.stripContextTags("<user_<rules>x</rules>info>y</user_info>z"),
    }),
  },
  {
    name: "a tag's name is used as a pattern, not as plain letters",
    run: ({ stripping }) => ({
      "a dot stands for any letter": stripping.stripTags("<a.b>1</a.b><axb>2</axb><ab>3</ab>", ["a.b"]),
      "a star repeats": stripping.stripTags("<aaa>1</aaa><a>2</a><b>3</b>", ["a*"]),
      "a class of letters": stripping.stripTags("<h1>1</h1><h2>2</h2><h7>7</h7>", ["h[1-6]"]),
      "a bar splits the whole pattern": stripping.stripTags("<a>1</a> <b>2</b> x</a y<b", ["a|b"]),
      "an empty name": stripping.stripTags("<>1</><a>2</a>", [""]),
      "a name that is no pattern is refused by the runtime": (() => {
        try {
          return stripping.stripTags("<(>1</(>", ["("]);
        } catch (error) {
          return `refused: a ${error.constructor.name}`;
        }
      })(),
    }),
  },
  {
    name: "every tag of context is taken out of a text, and no other tag",
    run: ({ stripping }) => {
      const each = Object.fromEntries(stripping.CONTEXT_TAGS_TO_STRIP.map((tag) => [tag, stripping.stripContextTags(`before <${tag} x="1">inside ${tag}</${tag}> after`)]));
      const others = ["user_query", "think", "thinking", "system", "context", "attached_file", "rule", "user-info", "system reminder", "simeon_rules", "agent_transcript", "task"];
      return {
        each,
        others: Object.fromEntries(others.map((tag) => [tag, stripping.stripContextTags(`<${tag}>inside</${tag}>`)])),
        "all at once": stripping.stripContextTags(stripping.CONTEXT_TAGS_TO_STRIP.map((tag) => `<${tag}>${tag}</${tag}>\n`).join("") + "<user_query>\nWhat is left?\n</user_query>\n"),
        "as the engine sends it": stripping.stripContextTags(
          "<user_info>\nOS Version: darwin 25.0\nShell: zsh\n</user_info>\n\n<git_status>\nOn branch main\n</git_status>\n\n<rules>\n<always_applied_workspace_rules>\nBe brief.\n</always_applied_workspace_rules>\n</rules>\n\n<system-reminder>\nToday is Friday.\n</system-reminder>\n\n<user_query>\nFix the test.\n</user_query>\n",
        ),
        "in capitals": stripping.stripContextTags("<SYSTEM_REMINDER>x</SYSTEM_REMINDER>y<System-Reminder>z</System-Reminder>"),
        "the same as naming the tags": stripping.stripContextTags("<rules>x</rules>y") === stripping.stripTags("<rules>x</rules>y", stripping.CONTEXT_TAGS_TO_STRIP),
      };
    },
  },
  {
    name: "what is no text, or no list of tags, is refused by the runtime",
    run: ({ stripping }) => ({
      "a number as the text, with tags": attempt(() => stripping.stripTags(5, ["a"])),
      "a number as the text, with no tags": attempt(() => stripping.stripTags(5, [])),
      "nothing as the text": attempt(() => stripping.stripTags(undefined, [])),
      "nothing as the text, context tags": attempt(() => stripping.stripContextTags(undefined)),
      "null as the text, context tags": attempt(() => stripping.stripContextTags(null)),
      "no list of tags": attempt(() => stripping.stripTags("a", undefined)),
      "one word as the tags is gone through letter by letter": stripping.stripTags("<a>1</a><b>2</b><ab>3</ab>", "ab"),
      "a tag that is a number": stripping.stripTags("<1>one</1>", [1]),
    }),
  },

  // -------------------------------------------------------------------------------------------------------------
  // The trace of a cloud agent's conversation
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "the three ways a history can be shown",
    run: ({ traceFormat }) => ({ modes: traceFormat.HistoryVisibilityMode, names: Object.keys(traceFormat.HistoryVisibilityMode) }),
  },
  {
    name: "each message of a conversation becomes one line of the trace, named after who spoke; only the internal view calls a first human message the system's",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      const conversation = [human("first"), human("second"), ai("third"), { type: 0, text: "fourth", toolResults: [] }, { type: 7, text: "fifth", toolResults: [] }, { text: "sixth" }, human("seventh")];
      return {
        internal: convert(conversation, mode.INTERNAL),
        external: convert(conversation, mode.EXTERNAL),
        "no preamble": convert(conversation, mode.NO_PREAMBLE),
        "a way that is not one of the three": convert(conversation, "SOMETHING_ELSE"),
        "no way named": convert(conversation),
        "internal, when the assistant spoke first": convert([ai("first"), human("second")], mode.INTERNAL),
        "internal, when the first is of no kind": convert([{ type: 0, text: "first", toolResults: [] }, human("second")], mode.INTERNAL),
      };
    },
  },
  {
    name: "the external view leaves the first two messages out, whatever they are",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      const made = [human("one"), ai("two"), human("three"), ai("four")];
      return Object.fromEntries([0, 1, 2, 3, 4].map((count) => [`${count} messages`, { external: convert(made.slice(0, count), mode.EXTERNAL), internal: convert(made.slice(0, count), mode.INTERNAL), "no preamble": convert(made.slice(0, count), mode.NO_PREAMBLE) }]));
    },
  },
  {
    name: "a line of the trace has the text and the thinking of its message only when they are more than blanks, as they were written",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      return convert(
        [
          ai("words"),
          ai(""),
          ai("   "),
          ai("\n\t"),
          ai("  kept with its blanks  "),
          ai(undefined),
          ai("said", [], { thinking: { text: "thought" } }),
          ai("", [], { thinking: { text: "only thought" } }),
          ai("said", [], { thinking: { text: "" } }),
          ai("said", [], { thinking: { text: "  \n" } }),
          ai("said", [], { thinking: {} }),
          ai("said", [], { thinking: undefined }),
          ai("said", [], { thinking: { text: " thought with blanks ", signature: "not kept" } }),
          human("a person thinks too", { thinking: { text: "thought" } }),
          human("other fields are not kept", { bubbleId: "b-1", isAgentic: true, createdAt: "2", images: [] }),
        ],
        mode.NO_PREAMBLE,
      );
    },
  },
  {
    name: "the assistant's tool results are listed on its line as calls, then each follows as a line of its own",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      return {
        "one call with everything": convert(
          [ai("I will read it.", [{ toolCallId: "call-1", toolName: "read_file", rawArgs: '{"path":"README.md"}', args: '{"path":"not this one"}', content: '{"contents":"hello"}', startedAtMs: 1000n, completedAtMs: 1250n }], { thinking: { text: "read first" } })],
          mode.NO_PREAMBLE,
        ),
        "two calls, and the next message after their lines": convert(
          [
            human("go"),
            ai("", [
              { toolCallId: "call-1", toolName: "list_dir", rawArgs: "", args: '{"path":"."}', content: "a\nb" },
              { toolCallId: "call-2", toolName: "read_file", rawArgs: '{"path":"a"}', args: "" },
            ]),
            ai("done"),
          ],
          mode.NO_PREAMBLE,
        ),
        "an assistant with no tool results has no list of calls": convert([ai("just words", [])], mode.NO_PREAMBLE),
        "tool results on a person's message, or on one of no kind, are not kept": convert(
          [human("hi", { toolResults: [{ toolCallId: "call-1", toolName: "x", args: "{}" }] }), { type: 0, text: "odd", toolResults: [{ toolCallId: "call-2", toolName: "y", args: "{}" }] }],
          mode.NO_PREAMBLE,
        ),
        "the external view counts messages, not lines": convert([human("one"), ai("two", [{ toolCallId: "call-1", toolName: "x" }]), ai("three", [{ toolCallId: "call-2", toolName: "y" }])], mode.EXTERNAL),
      };
    },
  },
  {
    name: "a call's id, name and arguments are kept only when there are any; the arguments are read as JSON, or kept as text when they are not JSON",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      const cases = {
        "nothing at all": {},
        "empty id and name": { toolCallId: "", toolName: "" },
        "an id only": { toolCallId: "call-1" },
        "a name only": { toolName: "read_file" },
        "raw arguments before the others": { rawArgs: '{"raw":true}', args: '{"raw":false}' },
        "the others when there are no raw ones": { rawArgs: "", args: '{"raw":false}' },
        "the others when the raw ones are not there": { args: '{"raw":false}' },
        "both empty": { rawArgs: "", args: "" },
        "a list": { args: "[1,2,3]" },
        "a number": { args: "42" },
        "a text in quotes": { args: '"words"' },
        true: { args: "true" },
        false: { args: "false" },
        null: { args: "null" },
        zero: { args: "0" },
        "JSON with blanks around": { args: ' {"a": 1} ' },
        "not JSON": { args: "{path: README.md}" },
        "JSON cut short": { args: '{"path":"READ' },
        "words": { args: "just words" },
        "nested": { args: '{"a":{"b":[1,{"c":null}]},"z":1,"m":2}' },
      };
      return Object.fromEntries(Object.entries(cases).map(([name, result]) => [name, convert([ai("", [result])], mode.NO_PREAMBLE)]));
    },
  },
  {
    name: "a tool's line holds what it answered: its content read as JSON or kept as text, else the result it carries with its kind",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      const value = { contents: "hello", lines: 1 };
      const cases = {
        "content that is JSON": { content: '{"ok":true,"n":[1,2]}' },
        "content that is text": { content: "plain words" },
        "content cut short": { content: '{"ok":tr' },
        "content null": { content: "null" },
        "content zero": { content: "0" },
        "content false": { content: "false" },
        "content a text in quotes": { content: '"quoted"' },
        "content of blanks": { content: "  " },
        "content before a result": { content: "from content", result: { result: { case: "readFileResult", value } } },
        "no content, a result": { result: { result: { case: "readFileResult", value } } },
        "empty content, a result": { content: "", result: { result: { case: "readFileResult", value } } },
        "a result whose value is empty": { result: { result: { case: "listDirResult", value: {} } } },
        "a result whose value is null": { result: { result: { case: "listDirResult", value: null } } },
        "a result whose value is zero": { result: { result: { case: "count", value: 0 } } },
        "a result of a kind with no value": { result: { result: { case: "readFileResult", value: undefined } } },
        "a result of no kind": { result: { result: { case: undefined, value: undefined } } },
        "a result of no kind with a value": { result: { result: { case: "", value } } },
        "a result with nothing in it": { result: {} },
        "no content and no result": {},
        "an error is not kept": { error: { clientVisibleErrorMessage: "it failed" } },
      };
      const out = Object.fromEntries(Object.entries(cases).map(([name, result]) => [name, convert([ai("", [{ toolCallId: "call-1", toolName: "t", ...result }])], mode.NO_PREAMBLE)[1]]));
      const [line, toolLine] = convert([ai("", [{ toolCallId: "call-1", toolName: "t", args: '{"a":1}', result: { result: { case: "readFileResult", value } } }])], mode.NO_PREAMBLE);
      return { ...out, "the value is the very one given, not a copy": toolLine.tool_result.value === value, "the arguments are read once for the call and once more for the tool's line": line.tool_calls[0].tool_args !== toolLine.tool_args };
    },
  },
  {
    name: "a call's times are kept as numbers, with how long it took when both are there",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      const cases = {
        "both, as the wire gives them": { startedAtMs: 1763024887065n, completedAtMs: 1763024888315n },
        "both, as numbers": { startedAtMs: 100, completedAtMs: 350 },
        "both, as text": { startedAtMs: "100", completedAtMs: "350" },
        "the start only": { startedAtMs: 100n },
        "the end only": { completedAtMs: 350n },
        neither: {},
        "both zero": { startedAtMs: 0n, completedAtMs: 0n },
        "the end before the start": { startedAtMs: 500n, completedAtMs: 100n },
        "null counts as a time": { startedAtMs: null, completedAtMs: null },
        "what is no number": { startedAtMs: "soon", completedAtMs: 350n },
        "a time too large to be exact": { startedAtMs: 9007199254740993n, completedAtMs: 9007199254740995n },
      };
      return Object.fromEntries(Object.entries(cases).map(([name, times]) => [name, convert([ai("", [{ toolCallId: "call-1", toolName: "t", args: '{"a":1}', content: "ok", ...times }])], mode.NO_PREAMBLE)]));
    },
  },
  {
    name: "a conversation that is not a list of messages is refused by the runtime",
    run: ({ traceFormat }) => {
      const { convertConversationMessagesToTrace: convert, HistoryVisibilityMode: mode } = traceFormat;
      return {
        "no conversation": attempt(() => convert(undefined, mode.NO_PREAMBLE)),
        "null": attempt(() => convert(null, mode.NO_PREAMBLE)),
        "an empty one": convert([], mode.INTERNAL),
        "a hole in the list": attempt(() => convert([human("one"), undefined], mode.NO_PREAMBLE)),
        "a hole in what the external view leaves out": convert([undefined, null, human("three")], mode.EXTERNAL),
        "an assistant's message with no list of tool results": attempt(() => convert([{ type: AI, text: "words" }], mode.NO_PREAMBLE)),
        "a person's message with no list of tool results": convert([{ type: HUMAN, text: "words" }], mode.NO_PREAMBLE),
        "a text that is a number": attempt(() => convert([{ type: HUMAN, text: 5, toolResults: [] }], mode.NO_PREAMBLE)),
        "a thinking that is a number": attempt(() => convert([{ type: HUMAN, text: "a", thinking: { text: 5 }, toolResults: [] }], mode.NO_PREAMBLE)),
        "a hole among the tool results": attempt(() => convert([ai("", [undefined])], mode.NO_PREAMBLE)),
        "something with a length that is no list": convert({ length: 2, 0: human("one"), 1: ai("two") }, mode.NO_PREAMBLE),
      };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: where it writes
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "the store keeps a conversation's files in its project folder, at the transcript's own place, unless it is told where",
    run: async (loaded) => {
      const at = (project, id, ext, options) => attempt(() => new loaded.index.TranscriptStore(project, {}, async () => {}, options).resolveFilePath(id, ext));
      const asked = [];
      return {
        "in the project": at("/project", "conv-1", "jsonl"),
        "as text": at("/project", "conv-1", "txt"),
        "an id made safe": at("/project", "a b/c", "json"),
        "a project folder that ends with a slash": at("/project/", "conv-1", "jsonl"),
        "an empty project folder": at("", "conv-1", "jsonl"),
        "a project folder of another machine": at("C:\\Users\\me\\project", "conv-1", "jsonl"),
        "no extension": at("/project", "conv-1", ""),
        "no project folder at all": at(undefined, "conv-1", "jsonl"),
        "told where": at("/project", "a b/c", "jsonl", { pathResolver: (id, ext) => `/elsewhere/${id}.${ext}` }),
        "told where, and asked with what": [
          at("/project", "a b/c", "txt", {
            pathResolver: (...given) => {
              asked.push(given);
              return "/the/answer";
            },
          }),
          asked,
        ],
        "told where with something that is no text": at("/project", "conv-1", "jsonl", { pathResolver: () => 42 }),
        "told where with nothing": at("/project", "conv-1", "jsonl", { pathResolver: () => undefined }),
        "a resolver that fails": at("/project", "conv-1", "jsonl", {
          pathResolver: () => {
            throw new Error("no place for it");
          },
        }),
        "a resolver that is null is called all the same": at("/project", "conv-1", "jsonl", { pathResolver: null }),
        "a resolver left out by name": at("/project", "conv-1", "jsonl", { pathResolver: undefined }),
        "an id that cannot be escaped": at("/project", "\ud800", "jsonl"),
      };
    },
  },
  {
    name: "the store reads its options once, when it is made, and calls what it was given each in its own way",
    run: async (loaded) => {
      const calls = [];
      const options = {
        writeText: true,
        writeJson: true,
        writeJsonl: true,
        pathResolver(id, ext) {
          calls.push({ called: "pathResolver", arguments: arguments.length, onTheGivenOptions: this === options, on: this === undefined ? "nothing" : Object.fromEntries(Object.entries(this).map(([key, value]) => [key, typeof value])) });
          return `/told/${id}.${ext}`;
        },
        appendFile: async function (file) {
          calls.push({ called: "appendFile", file, arguments: arguments.length, on: this === undefined ? "nothing" : "something" });
        },
      };
      const desk = bench(loaded, { messages: [user("hello"), assistant("hi")] });
      const shelf = {
        getBlob(ctx, id) {
          calls.push({ called: "getBlob", arguments: arguments.length, onTheBlobStore: this === shelf });
          return desk.shelf.getBlob(ctx, id);
        },
      };
      let store;
      const write = async function (file) {
        calls.push({ called: "writeFile", file, arguments: arguments.length, onTheStore: this === store });
      };
      store = new loaded.index.TranscriptStore("/project", shelf, write, options);
      // Changed after the store was made: none of it counts.
      options.writeText = false;
      options.writeJson = false;
      options.pathResolver = () => "/changed";
      const writeOptions = {
        turnEnded: { status: "success" },
        overviewFactory: async function (formatted) {
          calls.push({ called: "overviewFactory", arguments: arguments.length, onTheWriteOptions: this === writeOptions, formatted });
          return "An overview.";
        },
      };
      const full = await desk.run(({ state, ctx }) => store.writeFromStateFull(ctx, state, ID, writeOptions));
      const appendOnly = new loaded.index.TranscriptStore("/project", shelf, write, { writeText: false, writeJsonl: true, appendFile: options.appendFile });
      const later = await desk.run(({ state, ctx }) => appendOnly.writeFromStateIncremental(ctx, state, ID, 1));
      return { full, later, calls };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: the three forms
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "an ordinary turn, written whole in the three forms: the files, their text, and all the store did on the way, in order",
    run: async (loaded) => {
      const desk = bench(loaded, { messages: ORDINARY, mode: 1, store: { writeText: true, writeJson: true, writeJsonl: true } });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      return { answered, everything: desk.log, clockReads: desk.clock.reads };
    },
  },
  {
    name: "which files a store writes: the text alone unless it is told, and each of the three by its own option",
    run: (loaded) =>
      table(
        {
          "no options": undefined,
          "empty options": {},
          "text": { writeText: true },
          "no text": { writeText: false },
          "JSON as well": { writeJson: true },
          "lines as well": { writeJsonl: true },
          "JSON alone": { writeText: false, writeJson: true },
          "lines alone": { writeText: false, writeJsonl: true },
          "all three": { writeText: true, writeJson: true, writeJsonl: true },
          "options that are null count as not given": { writeText: null, writeJson: null, writeJsonl: null },
          "options that are not yes or no count by whether they are something": { writeText: 0, writeJson: "yes", writeJsonl: 1 },
        },
        async (store) => {
          const desk = bench(loaded, { messages: [user("hello"), assistant("hi")], store });
          const answered = await desk.run(({ store: made, state, ctx }) => made.writeFromStateFull(ctx, state, ID));
          return { answered, files: desk.files().map((file) => file.write) };
        },
      ),
  },
  {
    name: "a plain exchange in the three forms",
    run: (loaded) =>
      table(
        {
          "one question and its answer": [user("What time is it?"), assistant("It is noon.")],
          "several turns": [user("One?"), assistant("One."), user("Two?"), assistant("Two."), user("Three?"), assistant("Three.")],
          "the assistant alone": [assistant("Hello.")],
          "a person alone": [user("Hello?")],
          "text with line breaks, quotes and other alphabets": [user('He said "hi".\n\tThen left. — été, 日本語, 😀'), assistant("A back\\slash and a </tag>.")],
          "text whose ends are blank": [user("  \n padded \n\n"), assistant("  \n padded \n\n")],
          "three line breaks inside": [user("a\n\n\n\nb"), assistant("a\n\n\n\nb")],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "the system's messages are never written, and of two messages of the person at the start the first is left out",
    run: (loaded) =>
      table(
        {
          "a system message between others": [user("one"), says("system", "be good"), assistant("two")],
          "only system messages": [says("system", "be good"), says("system", "be brief")],
          "two of the person at the start": [user("the context"), user("the question"), assistant("the answer")],
          "two of the person at the start, after the system's": [says("system", "be good"), user("the context"), user("the question"), assistant("the answer")],
          "two of the person with the system's between them": [user("the context"), says("system", "be good"), user("the question"), assistant("the answer")],
          "three of the person at the start": [user("one"), user("two"), user("three"), assistant("four")],
          "two of the person and nothing else": [user("the context"), user("the question")],
          "two of the person later on stay": [user("one"), assistant("two"), user("three"), user("four")],
          "the person once, then the assistant": [user("the question"), assistant("the answer")],
          "the assistant first": [assistant("zero"), user("one"), user("two")],
          "the first of two is left out even when the second comes to nothing": [user("the only words"), user("<rules>all context</rules>"), assistant("the answer")],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "the tags of context are taken out of what the person said, and out of nobody else's words",
    run: (loaded) => {
      const tagged = "<user_info>\nOS: darwin\n</user_info>\n\n<rules>\nBe brief.\n</rules>\n\n<user_query>\nFix it.\n</user_query>\n";
      return table(
        {
          "the person, as text": [user(tagged)],
          "the person, in pieces": [user([text(tagged), text("<system-reminder>later</system-reminder>and more"), text("<git_status>only context</git_status>")])],
          "the assistant, as text": [assistant(tagged)],
          "the assistant, in pieces": [assistant([text(tagged)])],
          "a tool, as text": [says("tool", tagged)],
          "a tool, in pieces": [says("tool", [text(tagged)])],
          "someone else": [says("developer", tagged)],
          "the person, whose words are all context": [user("<rules>x</rules>\n<user_info>y</user_info>"), assistant("still here")],
          "the person, with thinking tags, which stay": [user("<think>mine</think>and<thinking>more</thinking>")],
        },
        (messages) => forms(loaded, messages),
      );
    },
  },
  {
    name: "hidden thinking is taken out of what the assistant said, and out of nobody else's words",
    run: (loaded) =>
      table(
        {
          "think": [assistant("<think>a plan</think>The answer.")],
          "thinking": [assistant("<thinking>a plan\nof lines</thinking>\n\nThe answer.")],
          "both, in capitals": [assistant("<THINK>one</THINK>A<Thinking>two</THINKING>B")],
          "several": [assistant("<think>1</think>a<think>2</think>b<think>3</think>c")],
          "only thinking": [user("go"), assistant("<think>nothing to say</think>")],
          "never closed stays": [assistant("<think>half a thought")],
          "with something after the name stays": [assistant('<think id="1">kept</think>.')],
          "one inside another leaves the outer end": [assistant("<think>a<think>b</think>c</think>d")],
          "a thinking closed as a think stays": [assistant("<thinking>a</think>b")],
          "line breaks left behind become two": [assistant("before\n\n<think>x</think>\n\nafter")],
          "the ends are trimmed even with no thinking": [assistant("  \n The answer. \n ")],
          "in pieces": [assistant([text("<think>a plan</think>Piece one."), text("  <thinking>all hidden</thinking>  "), text("Piece three.")])],
          "the tags of context stay in the assistant's words": [assistant("<think>x</think><rules>kept</rules>")],
          "a tool's words keep it": [says("tool", "<think>kept</think>out")],
          "someone else's words keep it": [says("developer", [text("<think>kept</think>out")])],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "a message that comes to nothing is left out of every form",
    run: (loaded) =>
      table(
        {
          "no content": [user("kept"), { role: "assistant" }],
          "empty text": [user("kept"), assistant("")],
          "blank text": [user("kept"), assistant(" \n\t ")],
          "no pieces": [user("kept"), assistant([])],
          "pieces of no words": [user("kept"), assistant([text(""), text("  ")])],
          "pieces of a kind nobody knows": [user("kept"), assistant([{ type: "source", url: "https://example.com" }, { type: "step-start" }])],
          "a piece of no kind": [user("kept"), assistant([{ text: "no type" }])],
          "every message comes to nothing": [user("<rules>x</rules>"), assistant("<think>y</think>")],
          "a message with a role only, of nobody known": [{ role: "narrator" }],
          "a message with no role": [{ content: "who said this?" }],
          "a message with an empty role": [says("", "who said this?")],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "each kind of piece of a message, as each of the three forms writes it",
    run: (loaded) =>
      table(
        {
          "words": [assistant([text("Some words.")])],
          "two pieces of words": [assistant([text("First."), text("Second.")])],
          "a picture": [user([text("Look:"), { type: "image", image: "aGVsbG8=", mimeType: "image/png" }])],
          "a picture alone": [user([{ type: "image", image: "aGVsbG8=" }])],
          "a file with a name": [user([{ type: "file", filename: "notes.pdf", data: "aGVsbG8=", mimeType: "application/pdf" }])],
          "a file with no name": [user([{ type: "file", data: "aGVsbG8=" }])],
          "a file with an empty name": [user([{ type: "file", filename: "" }])],
          "reasoning": [assistant([{ type: "reasoning", text: "Let me think.\nStep two." }, text("Done.")])],
          "reasoning alone": [assistant([{ type: "reasoning", text: "Only a thought." }])],
          "reasoning of blanks": [assistant([{ type: "reasoning", text: "  " }, text("Done.")])],
          "two pieces of reasoning": [assistant([{ type: "reasoning", text: "One." }, { type: "reasoning", text: "Two." }, text("Done.")])],
          "reasoning with hidden thinking tags, which stay": [assistant([{ type: "reasoning", text: "<think>kept</think>" }])],
          "reasoning that was blacked out": [assistant([{ type: "redacted-reasoning", data: "opaque" }, text("Done.")])],
          "reasoning that was blacked out, alone": [assistant([{ type: "redacted-reasoning", data: "opaque" }])],
          "reasoning of both kinds": [assistant([{ type: "reasoning", text: "Seen." }, { type: "redacted-reasoning" }, { type: "reasoning", text: "Seen again." }])],
          "a call of a tool": [assistant([toolCall("Read", { path: "README.md" })])],
          "words, then two calls": [assistant([text("I will look."), toolCall("Glob", { pattern: "*.md" }), toolCall("Read", { path: "README.md", limit: 5 })])],
          "a call between words": [assistant([text("Before."), toolCall("Read", { path: "a" }), text("After.")])],
          "a call with no name": [assistant([{ type: "tool-call", args: { a: 1 } }])],
          "a tool's result": [says("tool", [toolResult("Read")])],
          "two results of tools": [says("tool", [toolResult("Glob"), toolResult("Read")])],
          "a result with no name": [says("tool", [{ type: "tool-result", result: "x" }])],
          "a result among the assistant's words": [assistant([text("Here:"), toolResult("Read"), text("Done.")])],
          "a result and a call": [assistant([toolResult("Read"), toolCall("Write", { path: "b" })])],
          "words said by a tool": [says("tool", "A tool that speaks.")],
          "pieces of every kind, said by a person": [user([text("<rules>x</rules>Words."), { type: "image" }, { type: "file", filename: "a.txt" }, { type: "reasoning", text: "A thought." }, { type: "redacted-reasoning" }, toolCall("Read", { path: "a" }), toolResult("Read"), { type: "unknown" }])],
          "pieces of every kind, said by the assistant": [assistant([text("<think>x</think>Words."), { type: "image" }, { type: "file", filename: "a.txt" }, { type: "reasoning", text: "A thought." }, { type: "redacted-reasoning" }, toolCall("Read", { path: "a" }), toolResult("Read"), { type: "unknown" }])],
          "pieces of every kind, said by a tool": [says("tool", [text("<think>x</think><rules>y</rules>Words."), { type: "image" }, { type: "file", filename: "a.txt" }, { type: "reasoning", text: "A thought." }, { type: "redacted-reasoning" }, toolCall("Read", { path: "a" }), toolResult("Read"), { type: "unknown" }])],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "the arguments of a tool's call, as each form writes them",
    run: (loaded) =>
      table(
        {
          "text, numbers, yes and no, nothing": { path: "README.md", limit: 20, offset: 0, all: true, quiet: false, pattern: null, ratio: 1.5 },
          "lists and nested things": { paths: ["a", "b"], range: { from: 1, to: { line: 9 } }, empty: {}, none: [] },
          "text of several lines": { command: "echo one\necho two", note: "" },
          "no arguments inside": {},
          "a list": ["a", 2, { three: 3 }],
          "an empty list": [],
          "a text": "just words",
          "an empty text": "",
          "a number": 5,
          zero: 0,
          no: false,
          yes: true,
          null: null,
          "keys that are numbers come first, in order": { b: 1, 2: "two", a: 3, 1: "one" },
        },
        (args) => forms(loaded, [assistant([toolCall("Tool", args)])]),
      ),
  },
  {
    name: "a call with no arguments at all, and a result beside words: where each lands in the JSON form",
    run: async (loaded) => ({
      "no arguments at all": await forms(loaded, [assistant([{ type: "tool-call", toolName: "Tool" }])]),
      "a result first, then words, thinking and a call": await forms(loaded, [assistant([toolResult("Read"), text("Words."), { type: "reasoning", text: "A thought." }, toolCall("Write", { path: "b" })])]),
      "words, thinking and a call, then a result": await forms(loaded, [assistant([text("Words."), { type: "reasoning", text: "A thought." }, toolCall("Write", { path: "b" }), toolResult("Read")])]),
      "two results: the last one counts": await forms(loaded, [says("tool", [toolResult("First"), text("Words."), toolResult("Last")])]),
    }),
  },
  {
    name: "who said it: a tool's words stand alone in the text form, anyone else's stand under their name",
    run: (loaded) =>
      table(
        {
          "a tool between two others": [user("go"), assistant("I ask the tool."), says("tool", "The tool's own words."), assistant("Done.")],
          "a name nobody knows": [says("developer", "A note."), says("narrator", [text("Meanwhile.")])],
          "a name in capitals is another name": [says("User", "<rules>kept</rules>hello"), says("ASSISTANT", "<think>kept</think>hi"), says("System", "written"), says("Tool", "under its name")],
          "a role that is no text": [{ role: 7, content: "said by seven" }, { role: null, content: "said by null" }],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "a summary among the conversation's own messages is never written; one put away in an archive is left out of the lines only",
    run: async (loaded) => ({
      "among the conversation's own": await forms(loaded, [user("before", SUMMARY), assistant("a summary", SUMMARY), user("after"), assistant("the answer")]),
      "marked in another way, which does not count": await forms(loaded, [
        user("one", { providerOptions: { simeon: { isSummary: "true" } } }),
        assistant("two", { providerOptions: { simeon: { isSummary: 1 } } }),
        user("three", { providerOptions: { simeon: {} } }),
        assistant("four", { providerOptions: { other: { isSummary: true } } }),
        user("five", { providerOptions: null }),
        assistant("six", { isSummary: true }),
      ]),
      "put away in an archive": await forms(loaded, { archives: [[user("archived question"), assistant("archived summary", SUMMARY), says("system", "archived system"), assistant("archived answer")]], messages: [user("the question"), assistant("the answer")] }),
      "the first of two of the person is left out before summaries are": await forms(loaded, { archives: [[user("archived first"), user("archived summary", SUMMARY), assistant("archived answer")]], messages: [] }),
    }),
  },
  {
    name: "bytes kept in a message are written as a note of how many there were",
    run: (loaded) =>
      table(
        {
          "bytes as the content": '{"role":"assistant","content":{"__type":"Uint8Array","hex":"00ff10"}}',
          "bytes in a picture and in a call's arguments": '{"role":"assistant","content":[{"type":"image","image":{"__type":"Uint8Array","hex":"89504e47"}},{"type":"tool-call","toolName":"Upload","args":{"data":{"__type":"Uint8Array","hex":"cafe"},"name":"a.bin","nested":{"more":[{"__type":"Uint8Array","hex":""}]}}}]}',
          "an odd number of hex letters": '{"role":"assistant","content":[{"type":"text","text":{"__type":"Uint8Array","hex":"abc"}}]}',
          "written with a blank after the colon: not seen as bytes": '{"role":"assistant","content":[{"type":"tool-call","toolName":"Upload","args":{"data":{"__type": "Uint8Array","hex":"cafe"}}}]}',
          "hex that is no text": '{"role":"assistant","content":[{"type":"tool-call","toolName":"Upload","args":{"data":{"__type":"Uint8Array","hex":12}}}]}',
          "no hex": '{"role":"assistant","content":[{"type":"tool-call","toolName":"Upload","args":{"data":{"__type":"Uint8Array"}}}]}',
          "another type": '{"role":"assistant","content":[{"type":"tool-call","toolName":"Upload","args":{"data":{"__type":"Buffer","hex":"cafe"},"also":{"__type":"Uint8Array","hex":"cafe"}}}]}',
          "the words of the mark inside a text": JSON.stringify(assistant('He wrote "__type":"Uint8Array" in a note.')),
          "a whole message that is bytes": '{"__type":"Uint8Array","hex":"00"}',
          "a number too large to keep, written as text by the engine": '{"role":"assistant","content":[{"type":"tool-call","toolName":"Count","args":{"big":"9007199254740993"}}]}',
        },
        (written) => forms(loaded, [user("go"), utf8(written)]),
      ),
  },
  {
    name: "the JSON form names the conversation's mode",
    run: (loaded) =>
      table({ "no mode": undefined, "not said (0)": 0, "agent (1)": 1, "ask (2)": 2, "plan (3)": 3, "debug (4)": 4, "triage (5)": 5, "project (6)": 6, "multitask (7)": 7, "custom (8)": 8, "a mode nobody knows (9)": 9, "a mode nobody knows (-1)": -1, "a mode as text": "plan", "null": null }, async (mode) => {
        const desk = bench(loaded, { messages: [user("hello")], mode, store: { writeText: false, writeJson: true } });
        await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
        return JSON.parse(desk.files()[0].text).mode;
      }),
  },
  {
    name: "shapes of a message that one form refuses and another passes over",
    run: (loaded) =>
      table(
        {
          "content that is null": [user("kept"), assistant(null)],
          "content that is a number": [user("kept"), assistant(5)],
          "content that is a thing with no pieces": [user("kept"), assistant({ text: "not a list" })],
          "a person's piece of words with no words": [user([{ type: "text" }])],
          "the assistant's piece of words with no words": [user("kept"), assistant([{ type: "text" }])],
          "a tool's piece of words with no words": [user("kept"), says("tool", [{ type: "text" }])],
          "a piece of reasoning with no words": [user("kept"), assistant([{ type: "reasoning" }])],
          "a piece of words that is a number": [user("kept"), says("tool", [{ type: "text", text: 5 }])],
          "a piece that is null": [user("kept"), assistant([null])],
          "a message that is null": [user("kept"), utf8("null")],
          "a message that is a number, a text, a list": [user("kept"), utf8("5"), utf8('"words"'), utf8("[1,2]"), utf8("true")],
        },
        (messages) => forms(loaded, messages),
      ),
  },
  {
    name: "a message put away in an archive that is null, or no message at all, as each form takes it",
    run: (loaded) =>
      table(
        {
          "null": [user("kept"), utf8("null"), assistant("after")],
          "a number, a text, a list, yes": [user("kept"), utf8("5"), utf8('"words"'), utf8("[1,2]"), utf8("true"), assistant("after")],
          "null first": [utf8("null"), user("kept")],
          "null after one of the person, where the second message is looked at": [user("kept"), utf8("null")],
        },
        (archived) => forms(loaded, { archives: [archived], messages: [] }),
      ),
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: the end of a turn, and the overview
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "how a turn ended is written after the conversation, in each form",
    run: (loaded) =>
      table(
        {
          "it went well": { status: "success" },
          "it went well, with an error named all the same": { status: "success", error: "ignored in the text" },
          "it failed": { status: "error", error: "The model did not answer." },
          "it failed, with no error named": { status: "error" },
          "it was stopped": { status: "aborted" },
          "it was stopped, with a reason": { status: "aborted", error: "The person stopped it." },
          "it was stopped, with an empty reason": { status: "aborted", error: "" },
          "an ending nobody knows": { status: "paused" },
          "no status": {},
          "more than a status": { status: "success", turnId: "t-1", tokens: 12 },
          "a type of its own": { status: "success", type: "mine" },
          "the error before the status": { error: "first", status: "error" },
        },
        (turnEnded) => forms(loaded, { messages: [user("hello"), assistant("hi")], write: { turnEnded } }),
      ),
  },
  {
    name: "how a turn ended is written even when there is nothing else to write",
    run: async (loaded) => ({
      "no messages at all": await forms(loaded, { messages: [], write: { turnEnded: { status: "success" } } }),
      "no messages at all, and it failed": await forms(loaded, { messages: [], write: { turnEnded: { status: "error", error: "Nothing came." } } }),
      "messages that all come to nothing": await forms(loaded, { messages: [says("system", "be good"), user("<rules>x</rules>")], write: { turnEnded: { status: "aborted" } } }),
      "an ending left out by name": await forms(loaded, { messages: [user("hello")], write: { turnEnded: undefined } }),
      "empty options": await forms(loaded, { messages: [user("hello")], write: {} }),
      "an ending that is null is refused": await forms(loaded, { messages: [user("hello")], write: { turnEnded: null } }),
      "options that are null are refused": await forms(loaded, { messages: [user("hello")], write: null }),
    }),
  },
  {
    name: "an ending of the turn that is not what its type says: written as JavaScript turns it into text, or refused before anything is written",
    run: (loaded) => {
      const ask = async (turnEnded) => ({
        whole: await forms(loaded, { messages: [user("hello")], write: { turnEnded } }),
        "added, with a message": await laterWrite(loaded, { messages: [user("before"), assistant("new")], previous: 1, write: { turnEnded } }).then(({ answered, files, said }) => ({ answered, files, ...(said === undefined ? {} : { said }) })),
        "added, alone": await laterWrite(loaded, { messages: [user("before")], previous: 1, write: { turnEnded } }).then(({ answered, files, said }) => ({ answered, files, ...(said === undefined ? {} : { said }) })),
      });
      return table(
        {
          "an error that is a thing": () => ({ status: "error", error: { code: 7 } }),
          "an error that is a number": () => ({ status: "aborted", error: 404 }),
          "an error that is a list": () => ({ status: "error", error: ["a", "b"] }),
          "an ending nobody knows that says how it is written": () => ({ status: "paused", toString: () => "Turn paused." }),
          "a status in capitals is an ending nobody knows": () => ({ status: "SUCCESS" }),
          "an ending that is a text": () => "success",
          "an ending that is a number": () => 7,
          "an ending that is a list": () => ["success"],
          "an ending that holds a number too large for JSON": () => ({ status: "success", tokens: 12n }),
          "an ending that gives nothing when it is turned into JSON": () => ({ status: "success", toJSON: () => undefined }),
          "an ending that gives a text when it is turned into JSON": () => ({ status: "success", toJSON: () => "ended\n" }),
        },
        (make) => ask(make()),
      );
    },
  },
  {
    name: "nothing to write: no file is touched and the write went well",
    run: (loaded) =>
      table(
        {
          "no messages": { messages: [] },
          "no messages, and an overview could be made": { messages: [], overview: () => "An overview." },
          "only the system's": { messages: [says("system", "be good")] },
          "messages that come to nothing": { messages: [user("<rules>x</rules>"), assistant("<think>y</think>"), says("tool", [])] },
          "messages that come to nothing, and an overview could be made": { messages: [user("<rules>x</rules>")], overview: () => "An overview." },
          "blobs that are all gone": { messages: [GONE, GONE] },
          "archives that are all gone or empty": { archives: [GONE, []], messages: [] },
        },
        (given) => fullWrite(loaded, { store: { writeText: true, writeJson: true, writeJsonl: true }, ...given }),
      ),
  },
  {
    name: "an overview is asked for the lines only, of the conversation in its text form, and goes first",
    run: (loaded) =>
      table(
        {
          "an overview": { overview: () => "A talk about the README." },
          "an overview with blank ends": { overview: () => "  \n A talk about the README. \n\n" },
          "an overview of several lines and quotes": { overview: () => 'Line one.\nLine "two".' },
          "an empty overview": { overview: () => "" },
          "a blank overview": { overview: () => " \n " },
          "an overview that fails": {
            overview: () => {
              throw new Error("the model is away");
            },
          },
          "an overview that is no text": { overview: () => 42 },
          "an overview that is nothing": { overview: () => undefined },
          "with how the turn ended": { overview: () => "A talk.", write: { turnEnded: { status: "success" } } },
          "a store that writes no lines never asks": { overview: () => "A talk.", store: { writeText: true, writeJson: true } },
          "a store that writes lines only still makes the text to ask with": { overview: () => "A talk.", store: { writeText: false, writeJsonl: true } },
          "a conversation whose text form is empty is not asked about, though it has lines": { overview: () => "A talk.", messages: [], write: { turnEnded: { status: "success" } } },
          "a conversation the text form refuses is not written at all": { overview: () => "A talk.", messages: [user("kept"), assistant(null)], store: { writeText: false, writeJsonl: true } },
          "an overview factory that is null is called all the same": { write: { overviewFactory: null } },
        },
        (given) => fullWrite(loaded, { messages: [user("What is in the README?"), assistant([text("It says hello."), toolCall("Read", { path: "README.md" })])], store: { writeText: true, writeJson: true, writeJsonl: true }, ...given }),
      ),
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: writing
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "the three files are written one after the other: the text, the JSON, the lines; each is waited for",
    run: async (loaded) => {
      const order = [];
      const slow = async (file) => {
        order.push(`start ${file}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end ${file}`);
      };
      const desk = bench(loaded, { messages: [user("hello"), assistant("hi")], store: { writeText: true, writeJson: true, writeJsonl: true }, writeFile: slow });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      return { answered, order };
    },
  },
  {
    name: "a file that cannot be written: the console is told, the write did not go well, and the files after it are not tried",
    run: (loaded) =>
      table(
        {
          "the text": (file) => (file.endsWith(".txt") ? new Error("the disk is full") : undefined),
          "the JSON": (file) => (file.endsWith(".json") ? new Error("the disk is full") : undefined),
          "the lines": (file) => (file.endsWith(".jsonl") ? new Error("the disk is full") : undefined),
          "what is thrown is no error": (file) => (file.endsWith(".json") ? "just words" : undefined),
        },
        (writeFails) => fullWrite(loaded, { messages: [user("hello"), assistant("hi")], store: { writeText: true, writeJson: true, writeJsonl: true }, writeFails }),
      ),
  },
  {
    name: "a write function that throws at once, or a place that cannot be worked out, is a failed write like any other",
    run: async (loaded) => ({
      "throws at once": await fullWrite(loaded, {
        messages: [user("hello")],
        writeFile: () => {
          throw new Error("no disk");
        },
      }),
      "answers nothing, with no promise": await fullWrite(loaded, { messages: [user("hello")], writeFile: () => undefined }),
      "a resolver that fails": await fullWrite(loaded, {
        messages: [user("hello")],
        store: {
          pathResolver: () => {
            throw new Error("no place for it");
          },
        },
      }),
      "an id that cannot be escaped": await fullWrite(loaded, { messages: [user("hello")], id: "\ud800" }),
      "told where": await fullWrite(loaded, { messages: [user("hello")], store: { writeText: true, writeJson: true, writeJsonl: true, pathResolver: (id, ext) => `/elsewhere/${ext}/${id}` } }),
      "an id made safe": await fullWrite(loaded, { messages: [user("hello")], id: "team/a b", store: { writeText: true, writeJsonl: true } }),
    }),
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: reading the stored blobs
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "what a stored message of each shape gives back when it is read",
    run: (loaded) =>
      table(
        {
          "written as the engine writes it today": utf8('{"role":"assistant","content":[{"type":"text","text":"Read back."}],"providerOptions":{"simeon":{"messageId":"m-1"}}}'),
          "written with blanks and line breaks": utf8('{\n  "role": "assistant",\n  "content": "Read back."\n}\n'),
          "with fields nobody knows": utf8('{"role":"assistant","content":"Read back.","id":"x","createdAt":1763024887065,"experimental":{"a":[1]}}'),
          "cut short in the middle": utf8('{"role":"assistant","content":"Read ba'),
          "cut short after a whole value": utf8('{"role":"assistant","content":"Read back."'),
          "damaged: not JSON": utf8("role=assistant content=Read back."),
          "damaged: two messages in one blob": utf8('{"role":"assistant","content":"one"}\n{"role":"assistant","content":"two"}'),
          "damaged: something after the message": utf8('{"role":"assistant","content":"Read back."}}'),
          "empty": new Uint8Array(0),
          "not there": GONE,
          "null instead of bytes": () => null,
          "an empty text instead of bytes": () => "",
          "zero instead of bytes": () => 0,
          "a text instead of bytes": () => '{"role":"assistant","content":"Read back."}',
          "a list of numbers instead of bytes": () => Array.from(utf8('{"role":"assistant","content":"Read back."}')),
          "a Buffer": () => Buffer.from('{"role":"assistant","content":"Read back."}'),
          "the bytes' own buffer, which has no length": () => utf8('{"role":"assistant","content":"Read back."}').buffer,
          "with a byte order mark": Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('{"role":"assistant","content":"Read back."}')]),
          "with bytes that are no text": Uint8Array.from([...utf8('{"role":"assistant","content":"Read '), 0xff, 0xfe, 0xc3, ...utf8(' back."}')]),
          "only blanks": utf8("  \n"),
          "the word null": utf8("null"),
          "an empty thing": utf8("{}"),
          "a list": utf8("[]"),
          "a protobuf message where JSON was meant": archiveOf(["m1"]),
        },
        (blob) => fullWrite(loaded, { messages: [user("go"), blob, assistant("after")], store: { writeText: true, writeJson: true, writeJsonl: true } }),
      ),
  },
  {
    name: "a message of five million bytes is read; one byte more and a note of its size is written in its place",
    run: async (loaded) => shortened(await fullWrite(loaded, { messages: [user("go"), messageOfSize(5_000_000), messageOfSize(5_000_001), messageOfSize(4_999_999)], store: { writeText: true, writeJson: true, writeJsonl: true } })),
  },
  {
    name: "the note of a message too large says its size in megabytes, to one place",
    run: (loaded) =>
      table({ "5 000 001": 5_000_001, "5 049 999": 5_049_999, "5 050 000": 5_050_000, "5 150 000": 5_150_000, "5 950 000": 5_950_000, "9 999 999": 9_999_999, "12 345 678": 12_345_678, "999 949 999": 999_949_999, "a million million": 1e12, "no number at all": Number.POSITIVE_INFINITY }, async (length) => {
        const out = await fullWrite(loaded, { messages: [user("go"), () => ({ length })], store: { writeText: false, writeJsonl: true } });
        return { line: out.files[0]?.text.split("\n")[1], spans: out.spans.slice(2) };
      }),
  },
  {
    name: "messages put away in summary archives come first, archive by archive, then the conversation's own",
    run: async (loaded) => ({
      "one archive": await fullWrite(loaded, { archives: [[user("archived question"), assistant("archived answer")]], messages: [user("the context"), user("the question"), assistant("the answer")], store: { writeText: true, writeJson: true, writeJsonl: true } }),
      "three archives": await fullWrite(loaded, {
        archives: [[user("first archive, one"), assistant("first archive, two"), user("first archive, three")], [assistant("second archive, one")], [user("third archive, one"), assistant("third archive, two")]],
        messages: [user("the question"), assistant("the answer")],
        store: { writeText: false, writeJsonl: true },
      }),
      "archives only": await fullWrite(loaded, { archives: [[user("archived question"), assistant("archived answer")]], messages: [], store: { writeText: false, writeJsonl: true } }),
      "the same archive twice": await fullWrite(loaded, { archives: [[user("archived question")], utf8("a1")], blobs: { a2: archiveOf(["a1.m1"]) }, messages: [], store: { writeText: false, writeJsonl: true } }),
      "the first of two of the person is left out across an archive and the conversation": await fullWrite(loaded, { archives: [[user("archived question")]], messages: [user("the question"), assistant("the answer")], store: { writeText: false, writeJsonl: true } }),
    }),
  },
  {
    name: "what a stored summary archive of each shape gives back when it is read",
    run: (loaded) =>
      table(
        {
          "written as the engine writes it today: the ids, the summary, the window's tail, the summary's own message": archiveOf(["x1", "x2"], [...held(2, utf8("A summary of the talk.")), ...counted(3, 7), ...held(4, utf8("x3"))]),
          "the ids only": archiveOf(["x1", "x2"]),
          "the ids after the other fields": Uint8Array.from([...held(2, utf8("A summary.")), ...held(1, utf8("x2")), ...counted(3, 300), ...held(1, utf8("x1"))]),
          "with a field nobody knows yet": archiveOf(["x1"], [...held(15, utf8("from a later engine")), ...counted(16, 5), ...held(1, utf8("x2"))]),
          "no ids": archiveOf([], held(2, utf8("A summary of nothing."))),
          "empty": new Uint8Array(0),
          "not there": GONE,
          "null instead of bytes": () => null,
          "cut short inside an id": archiveOf(["x1", "x2"]).slice(0, 6),
          "cut short between two ids": archiveOf(["x1", "x2"]).slice(0, 4),
          "cut short after a field's number": Uint8Array.from([...archiveOf(["x1"]), 0x0a]),
          "damaged: a length longer than what is left": Uint8Array.from([0x0a, 0x7f, 0x78, 0x31]),
          "damaged: a kind of field that does not exist": Uint8Array.from([...archiveOf(["x1"]), 0x0f, 0x01]),
          "damaged: JSON where protobuf was meant": utf8('{"summarizedMessages":["x1"]}'),
          "an id that is empty": Uint8Array.from([0x0a, 0x00, ...held(1, utf8("x2"))]),
          "an id nothing is kept under": archiveOf(["x1", "nowhere", "x2"]),
          "the same id twice": archiveOf(["x1", "x1"]),
          "a text instead of bytes": () => "x1",
        },
        (archive) =>
          fullWrite(loaded, {
            archives: [archive],
            blobs: { x1: user("put away, one"), x2: assistant("put away, two"), x3: assistant("the summary's own message"), "": assistant("kept under an empty id") },
            messages: [user("the question"), assistant("the answer")],
            store: { writeText: false, writeJsonl: true },
          }),
      ),
  },
  {
    name: "an archive's messages of each shape: the damaged and the missing are passed over, the too large are noted, the system's and the summaries are kept until a form leaves them out",
    run: async (loaded) =>
      shortened(
        await fullWrite(loaded, {
          archives: [[user("archived one"), GONE, utf8('{"role":"assistant","content":"cut sh'), new Uint8Array(0), () => ({ length: 7_250_000 }), says("system", "archived system"), assistant("archived summary", SUMMARY), assistant("archived two")], GONE, [assistant("second archive")]],
          messages: [says("system", "be good"), user("the question"), assistant("a summary", SUMMARY), GONE, utf8("not JSON"), () => ({ length: 6_000_000 }), assistant("the answer")],
          store: { writeText: true, writeJson: true, writeJsonl: true },
          mode: 3,
        }),
      ),
  },
  {
    name: "the archives are asked for all at once, then their messages turn by turn, then the conversation's own, one after the other; all with one context under which no span is started",
    run: async (loaded) => {
      const desk = bench(loaded, {
        archives: [[user("1.1"), assistant("1.2"), user("1.3")], GONE, [assistant("3.1")], new Uint8Array(0), [user("5.1"), assistant("5.2")]],
        messages: [user("own one"), assistant("own two")],
        store: { writeText: false, writeJsonl: true },
      });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      return { answered, everything: desk.log, clockReads: desk.clock.reads };
    },
  },
  {
    name: "a blob store that fails: the console is told of what the store then trips over, nothing is written, and the write did not go well",
    run: (loaded) => {
      const fails = () => Promise.reject(new Error("the database is locked"));
      const throws = () => {
        throw new Error("the database is closed");
      };
      return table(
        {
          "on a message of the conversation": { messages: [user("one"), fails, assistant("three")] },
          "on the first message, at once": { messages: [throws, assistant("two")] },
          "on an archive": { archives: [[user("archived")], fails], messages: [user("one")] },
          "on an archive, at once": { archives: [throws], messages: [user("one")] },
          "on a message put away in an archive": { archives: [[user("archived one"), fails, assistant("archived three")]], messages: [user("one")] },
          "on a message put away in an archive, at once": { archives: [[throws]], messages: [user("one")] },
          "with how the turn ended": { messages: [fails], write: { turnEnded: { status: "success" } } },
          "a store that answers with no promise works": { messages: [() => utf8(JSON.stringify(user("no promise")))], archives: [() => archiveOf(["x1"])], blobs: { x1: () => utf8(JSON.stringify(assistant("put away, no promise"))) } },
        },
        (given) => fullWrite(loaded, { store: { writeText: true, writeJson: true, writeJsonl: true }, ...given }),
      );
    },
  },
  {
    name: "an archive that cannot be read fails the write at once, and the reading of the archives beside it goes on after that",
    run: async (loaded) => {
      const desk = bench(loaded, {
        archives: [Array.from({ length: 40 }, (_, at) => assistant(`1.${at + 1}`)), () => Promise.reject(new Error("the database is locked")), [assistant("3.1"), user("3.2")]],
        messages: [user("own one")],
        store: { writeText: false, writeJsonl: true },
      });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      // How far the reading beside it had got by then is a matter of the runtime's own turns, not of the store: only that it was not done is kept.
      const readByThen = desk.reads().split(", ").length;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const readInTheEnd = desk.reads();
      return { answered, said: desk.said(), files: desk.files(), stillReadingWhenTheWriteFailed: readByThen < readInTheEnd.split(", ").length, readInTheEnd };
    },
  },
  {
    name: "a state that lacks its lists, or holds what is no list, is a failed write the console is told of",
    run: (loaded) =>
      table(
        {
          "no state": { state: undefined, noState: true },
          "an empty state": { state: {} },
          "no archives": { state: { rootPromptMessagesJson: [] } },
          "no messages of its own": { state: { summaryArchives: [] } },
          "lists that are null": { state: { rootPromptMessagesJson: null, summaryArchives: null } },
          "both lists empty": { state: { rootPromptMessagesJson: [], summaryArchives: [] } },
        },
        async (given) => {
          const desk = bench(loaded, { store: { writeText: true, writeJson: true, writeJsonl: true } });
          const answered = await desk.run(({ store, ctx }) => store.writeFromStateFull(ctx, given.noState ? undefined : given.state, ID));
          return { answered, ...desk.seen() };
        },
      ),
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: the context it is given, and its spans
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "what the spans of a whole write say: how many blobs were asked for and read, their bytes, the largest, the time spent reading them, and the same for those left out as too large",
    run: (loaded) =>
      table(
        {
          "nothing stored": {},
          "messages of the conversation only": { messages: [user("a"), assistant("bb"), says("system", "ccc")] },
          "archives only": { archives: [[user("a"), assistant("bb")], [assistant("ccc")]] },
          "missing and damaged blobs are asked for, not read": { archives: [[user("a"), GONE, utf8("{")], GONE, utf8("\u0001")], messages: [GONE, utf8("{"), user("a")] },
          "blobs too large": { archives: [[() => ({ length: 6_000_000 }), () => ({ length: 8_000_000 }), assistant("bb")]], messages: [() => ({ length: 9_000_000 }), () => ({ length: 5_500_000 }), user("a")] },
          "a blob with no length is read, and counts as no number": { messages: [() => utf8(JSON.stringify(user("a"))).buffer, user("a")] },
        },
        async (given) => {
          const out = await fullWrite(loaded, { store: { writeText: false, writeJsonl: true }, ...given });
          return { answered: out.answered, read: out.read, spans: out.spans, clockReads: out.clockReads };
        },
      ),
  },
  {
    name: "a context that already has a span: the store's spans go under it, and take the attributes it hands down",
    run: async (loaded) => {
      const desk = bench(loaded, { archives: [[user("archived")]], messages: [user("hello"), assistant("hi")], append: true, store: { writeText: false, writeJsonl: true }, context: (root, otel) => otel.withInheritableAttribute(otel.withSpan(root.withName("the caller's work")), "conversation", "conv-1") });
      const full = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      const later = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 1));
      return { full, later, everything: desk.log };
    },
  },
  {
    name: "a context under whose span no span may be started: the store starts none, ends none, and what it has to say goes on the span above",
    run: async (loaded) => {
      const desk = bench(loaded, { archives: [[user("archived")]], messages: [user("hello"), assistant("hi")], append: true, store: { writeText: false, writeJsonl: true }, context: (root, otel) => otel.withSuppressedChildSpans(otel.withSpan(root.withName("the caller's work"))) });
      const full = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      const later = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 1));
      return { full, later, everything: desk.log };
    },
  },
  {
    name: "a context that says no span may be started but has none above: the store starts its own all the same",
    run: async (loaded) => {
      const desk = bench(loaded, { messages: [user("hello"), assistant("hi")], append: true, store: { writeText: false, writeJsonl: true }, context: (root, otel) => otel.withSuppressedChildSpans(root) });
      const full = await desk.run(({ store, state, ctx }) => store.writeFromStateFull(ctx, state, ID));
      const later = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 1));
      return { full, later, everything: desk.log };
    },
  },
  {
    name: "where no tracing is set up, and where the context was canceled, the files are written all the same",
    run: async (loaded) => ({
      "no tracing": await (async () => {
        const out = await fullWrite(loaded, { messages: [user("hello"), assistant("hi")], archives: [[user("archived")]], store: { writeText: true, writeJson: true, writeJsonl: true }, tracing: false });
        return { answered: out.answered, files: out.files, read: out.read, clockReads: out.clockReads };
      })(),
      "no tracing, adding to the lines": await (async () => {
        const out = await laterWrite(loaded, { messages: [user("hello"), assistant("hi")], previous: 1, tracing: false });
        return { answered: out.answered, files: out.files, read: out.read, clockReads: out.clockReads };
      })(),
      "a canceled context": await fullWrite(loaded, {
        messages: [user("hello"), assistant("hi")],
        context: (root) => {
          const [canceled, cancel] = root.withCancel();
          cancel(new Error("the turn was stopped"));
          return canceled;
        },
      }),
      "a canceled context, adding to the lines": await laterWrite(loaded, {
        messages: [user("hello"), assistant("hi")],
        previous: 1,
        context: (root) => {
          const [canceled, cancel] = root.withCancel();
          cancel(new Error("the turn was stopped"));
          return canceled;
        },
      }),
    }),
  },
  {
    name: "what is no context: the write did not go well, nothing was read or written, and the console was told nothing",
    run: (loaded) =>
      table({ nothing: () => undefined, null: () => null, "an empty thing": () => ({}), "a text": () => "turn", "a thing whose name cannot be set": () => ({ withName: () => undefined }) }, async (context) => ({
        "a whole write": await fullWrite(loaded, { messages: [user("hello")], store: { writeText: true, writeJson: true, writeJsonl: true }, context }),
        "a whole write with how the turn ended": await fullWrite(loaded, { messages: [], write: { turnEnded: { status: "success" } }, context }),
        "adding to the lines": await laterWrite(loaded, { messages: [user("hello"), assistant("hi")], previous: 1, context }),
        "adding how the turn ended": await laterWrite(loaded, { messages: [user("hello")], previous: 1, write: { turnEnded: { status: "success" } }, context }),
      })),
  },
  {
    name: "a span that cannot be ended: the write did not go well, though what was written by then stays written",
    run: (loaded) => {
      const failsFor = (...names) => (name) => (names.includes(name) ? new Error(`the span "${name}" cannot be ended`) : undefined);
      return table(
        {
          "the span of the whole write": { endFails: failsFor("writeFromState") },
          "the span of the conversation's own messages": { endFails: failsFor("hydratePromptMessages") },
          "the span of the archives": { endFails: failsFor("hydrateSummaryArchives") },
          "both spans of the reading": { endFails: failsFor("hydratePromptMessages", "hydrateSummaryArchives") },
          "every span": { endFails: () => new Error("no span can be ended") },
          "the span of adding to the lines": { endFails: failsFor("writeFromStateIncremental"), previous: 1 },
          "the span of adding to the lines, when adding fails and the whole is written instead": { endFails: failsFor("writeFromStateIncremental"), previous: 1, appendFails: () => new Error("the file is gone") },
          "the span of the whole write, written instead of adding": { endFails: failsFor("writeFromState"), previous: 1, appendFails: () => new Error("the file is gone") },
        },
        (given) => (given.previous === undefined ? fullWrite(loaded, { messages: [user("hello"), assistant("hi")], store: { writeText: false, writeJsonl: true }, ...given }) : laterWrite(loaded, { messages: [user("hello"), assistant("hi")], ...given })),
      );
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: adding to what was written
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "adding to the lines: only the messages that came since are read, and each is added as its line; all the store did on the way, in order",
    run: async (loaded) => {
      const desk = bench(loaded, { archives: [[user("archived")]], messages: [...ORDINARY, user("And the license?"), assistant([text("MIT."), toolCall("Read", { path: "LICENSE" })])], append: true, store: { writeText: false, writeJsonl: true } });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, ORDINARY.length));
      return { answered, everything: desk.log, clockReads: desk.clock.reads };
    },
  },
  {
    name: "nothing came since and nothing is to be said of the turn: the count is given back and nothing is read or written, whatever the store writes",
    run: (loaded) =>
      table(
        {
          "a store that adds to its lines": { append: true, store: { writeText: false, writeJsonl: true } },
          "a store that writes text": { append: false, store: undefined },
          "a store that writes all three": { append: false, store: { writeText: true, writeJson: true, writeJsonl: true } },
          "no messages, none before": { messages: [], previous: 0 },
          "empty options": { write: {} },
          "what is no context": { context: () => undefined },
        },
        (given) => laterWrite(loaded, { messages: [user("hello"), assistant("hi")], previous: 2, ...given }),
      ),
  },
  {
    name: "when the store adds to the lines and when it writes the whole again",
    run: (loaded) =>
      table(
        {
          "one came since: added": {},
          "two came since: added": { previous: 1 },
          "no function to add with: the whole": { append: false },
          "a store that also writes text: the whole": { store: { writeText: true, writeJsonl: true } },
          "a store that writes text by not saying: the whole": { store: { writeJsonl: true } },
          "a store that also writes JSON: the whole": { store: { writeText: false, writeJson: true, writeJsonl: true } },
          "a store that writes no lines: the whole, which is nothing": { store: { writeText: false } },
          "nothing was written before: the whole": { previous: 0 },
          "more was written before than there is now: the whole": { previous: 4 },
          "an overview could be made: the whole": { overview: () => "A talk." },
          "nothing came since, an overview could be made: the whole": { previous: 3, overview: () => "A talk." },
          "nothing came since, the turn ended: the ending is added": { previous: 3, write: { turnEnded: { status: "success" } } },
          "one came since, the turn ended: both are added": { write: { turnEnded: { status: "error", error: "It broke." } } },
          "nothing was written before, the turn ended: the whole": { previous: 0, write: { turnEnded: { status: "success" } } },
          "more was written before, the turn ended: the whole": { previous: 4, write: { turnEnded: { status: "success" } } },
          "a count before that is no number: the whole": { previous: Number.NaN },
          "a count before that is negative: the whole": { previous: -1 },
          "no count before: the whole": { previous: undefined },
          "a count before that is a text: added from there": { previous: "2" },
          "a count before with a half: added from the whole number below": { previous: 1.5 },
          "a count before of null: the whole": { previous: null },
        },
        (given) => laterWrite(loaded, { messages: [user("the context"), user("the question"), assistant("the answer")], previous: 2, ...given }),
      ),
  },
  {
    name: "what is added for the messages that came since: no rule about the first of two of the person, the system's and the summaries left out, the missing and the damaged passed over, the too large noted",
    run: async (loaded) => ({
      "of each shape": shortened(
        await laterWrite(loaded, {
          messages: [user("written before"), user("<rules>x</rules>first of two"), user("second of two"), says("system", "be good"), assistant("a summary", SUMMARY), GONE, utf8('{"role":"assistant","content":"cut sh'), new Uint8Array(0), () => ({ length: 5_000_001 }), says("tool", [toolResult("Read")]), assistant([{ type: "reasoning", text: "A thought." }, text("<think>x</think>Words."), toolCall("Read", { path: "a" })]), says("tool", "A tool that speaks.")],
          previous: 1,
        }),
      ),
      "all that came comes to nothing: nothing is added": await laterWrite(loaded, { messages: [user("written before"), says("system", "be good"), assistant("<think>x</think>"), GONE, says("tool", [toolResult("Read")])], previous: 1 }),
      "all that came comes to nothing, the turn ended: the ending alone": await laterWrite(loaded, { messages: [user("written before"), says("system", "be good")], previous: 1, write: { turnEnded: { status: "aborted", error: "Stopped." } } }),
      "the archives are not read": await laterWrite(loaded, { archives: [[user("archived")], GONE], messages: [user("written before"), assistant("new")], previous: 1 }),
      "told where": await laterWrite(loaded, { messages: [user("written before"), assistant("new")], previous: 1, store: { writeText: false, writeJsonl: true, pathResolver: (id, ext) => `/elsewhere/${id}.${ext}` } }),
      "an id made safe": await laterWrite(loaded, { messages: [user("written before"), assistant("new")], previous: 1, id: "team/a b" }),
      "a message at the size limit, and one byte more": shortened(await laterWrite(loaded, { messages: [user("written before"), messageOfSize(5_000_000), messageOfSize(5_000_001)], previous: 1 })),
    }),
  },
  {
    name: "adding fails: the console is told, and the whole is written again instead, unless the store was told not to",
    run: (loaded) => {
      const gone = () => new Error("the file is gone");
      const noFallback = { writeText: false, writeJsonl: true, fallbackToFullWriteOnIncrementalFailure: false };
      return table(
        {
          "messages, the whole written instead": { appendFails: gone },
          "messages, told not to": { appendFails: gone, store: noFallback },
          "messages, the whole fails too": { appendFails: gone, writeFails: () => new Error("the disk is full") },
          "the ending of the turn, the whole written instead": { appendFails: gone, previous: 3, write: { turnEnded: { status: "success" } } },
          "the ending of the turn, told not to": { appendFails: gone, previous: 3, write: { turnEnded: { status: "success" } }, store: noFallback },
          "the ending of the turn, the whole fails too": { appendFails: gone, previous: 3, write: { turnEnded: { status: "success" } }, writeFails: () => new Error("the disk is full") },
          "told not to with null, which counts as not told": { appendFails: gone, store: { ...noFallback, fallbackToFullWriteOnIncrementalFailure: null } },
          "told not to with zero": { appendFails: gone, store: { ...noFallback, fallbackToFullWriteOnIncrementalFailure: 0 } },
          "what is thrown is no error": { appendFails: () => "just words" },
          "a function to add with that throws at once": {
            appendFile: () => {
              throw new Error("no disk");
            },
          },
          "a function to add with that throws at once, for the ending of the turn, told not to": {
            appendFile: () => {
              throw new Error("no disk");
            },
            previous: 3,
            write: { turnEnded: { status: "success" } },
            store: noFallback,
          },
          "a place that cannot be worked out": {
            store: {
              writeText: false,
              writeJsonl: true,
              pathResolver: (id, ext) => {
                if (ext === "jsonl") throw new Error("no place for it");
                return `/elsewhere/${id}.${ext}`;
              },
            },
          },
        },
        (given) => laterWrite(loaded, { messages: [user("the context"), user("the question"), assistant("the answer")], previous: 2, ...given }),
      );
    },
  },
  {
    name: "reading fails while adding: the same as when adding fails",
    run: (loaded) => {
      const fails = () => Promise.reject(new Error("the database is locked"));
      const noFallback = { writeText: false, writeJsonl: true, fallbackToFullWriteOnIncrementalFailure: false };
      return table(
        {
          "a message that came since, the whole tried instead": { messages: [user("written before"), fails, assistant("new")] },
          "a message that came since, told not to": { messages: [user("written before"), fails, assistant("new")], store: noFallback },
          "a message that is null": { messages: [user("written before"), utf8("null"), assistant("new")] },
          "a message that is null, told not to": { messages: [user("written before"), utf8("null"), assistant("new")], store: noFallback },
          "a message the lines cannot be made of": { messages: [user("written before"), assistant([{ type: "reasoning" }])] },
          "a message written before that fails is not read when adding": { messages: [fails, assistant("new")] },
        },
        (given) => laterWrite(loaded, { previous: 1, ...given }),
      );
    },
  },
  {
    name: "when the whole is written instead of adding and does not go well, zero is given back",
    run: (loaded) => {
      const fails = () => Promise.reject(new Error("the database is locked"));
      return table(
        {
          "a store that writes text, a file that cannot be written": { append: false, store: undefined, writeFails: () => new Error("the disk is full") },
          "a store that writes text, a blob that cannot be read": { append: false, store: undefined, messages: [user("one"), fails] },
          "nothing written before, a blob that cannot be read": { previous: 0, messages: [fails] },
          "a store that writes text, all goes well": { append: false, store: undefined },
          "a store that writes text, nothing to write": { append: false, store: undefined, messages: [says("system", "be good")], previous: 0 },
        },
        (given) => laterWrite(loaded, { messages: [user("hello"), assistant("hi")], previous: 1, ...given }),
      );
    },
  },
  {
    name: "adding fails and the whole is written instead: all the store did on the way, in order",
    run: async (loaded) => {
      const desk = bench(loaded, { messages: [user("the context"), user("the question"), assistant("the answer")], append: true, store: { writeText: false, writeJsonl: true }, appendFails: () => new Error("the file is gone") });
      const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 2, { turnEnded: { status: "success" } }));
      const alone = bench(loaded, { messages: [user("the context"), user("the question")], append: true, store: { writeText: false, writeJsonl: true }, appendFails: () => new Error("the file is gone") });
      const answeredAlone = await alone.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 2, { turnEnded: { status: "success" } }));
      return { "a message and the ending": { answered, everything: desk.log, clockReads: desk.clock.reads }, "the ending alone": { answered: answeredAlone, everything: alone.log, clockReads: alone.clock.reads } };
    },
  },
  {
    name: "a store made from the store's class with its own place for files, or its own whole write, has them used",
    run: async (loaded) => {
      const desk = bench(loaded, { messages: [user("the context"), user("the question"), assistant("the answer")], appendFails: () => new Error("the file is gone") });
      const calls = [];
      class Elsewhere extends loaded.index.TranscriptStore {
        resolveFilePath(id, ext) {
          calls.push(`asked where ${id}.${ext} goes`);
          return `/its/own/${id}.${ext}`;
        }
      }
      class ItsOwnWrite extends loaded.index.TranscriptStore {
        async writeFromStateFull(ctx, state, id, options) {
          calls.push(`asked to write ${id} whole, ${state.rootPromptMessagesJson.length} messages, with ${JSON.stringify(options)}`);
          return this.answer;
        }
      }
      const all = { writeText: true, writeJson: true, writeJsonl: true };
      const lines = { writeText: false, writeJsonl: true, appendFile: desk.appends };
      const out = {};
      out["its own place, a whole write"] = await desk.run(({ state, ctx }) => new Elsewhere("/project", desk.shelf, desk.writes, all).writeFromStateFull(ctx, state, ID));
      out["its own place, adding"] = await desk.run(({ state, ctx }) => new Elsewhere("/project", desk.shelf, desk.writes, { ...lines, fallbackToFullWriteOnIncrementalFailure: false }).writeFromStateIncremental(ctx, state, ID, 2));
      for (const answer of [true, false, "yes", 0]) {
        const made = new ItsOwnWrite("/project", desk.shelf, desk.writes, lines);
        made.answer = answer;
        out[`its own whole write that answers ${JSON.stringify(answer)}, nothing written before`] = await desk.run(({ state, ctx }) => made.writeFromStateIncremental(ctx, state, ID, 0, { turnEnded: { status: "success" } }));
        out[`its own whole write that answers ${JSON.stringify(answer)}, adding fails`] = await desk.run(({ state, ctx }) => made.writeFromStateIncremental(ctx, state, ID, 2));
      }
      return { ...out, calls, files: desk.files().map((file) => file.write ?? `added to ${file.append}`), said: desk.said() };
    },
  },
  {
    name: "a list of messages that grows while the store reads it: a whole write reads what was added, adding reads what there was when it began",
    run: async (loaded) => {
      const ask = async (act) => {
        const desk = bench(loaded, { messages: [user("the context"), user("one"), assistant("two")], blobs: { late: assistant("came while reading") }, append: true, store: { writeText: false, writeJsonl: true } });
        const read = desk.shelf.getBlob;
        let grown = false;
        desk.shelf.getBlob = (ctx, id) => {
          if (!grown) desk.state.rootPromptMessagesJson.push(utf8("late"));
          grown = true;
          return read(ctx, id);
        };
        const answered = await desk.run(({ store, state, ctx }) => act(store, ctx, state));
        return { answered, ...desk.seen() };
      };
      return {
        "a whole write": await ask((store, ctx, state) => store.writeFromStateFull(ctx, state, ID)),
        adding: await ask((store, ctx, state) => store.writeFromStateIncremental(ctx, state, ID, 1)),
      };
    },
  },
  {
    name: "a state with no list of its own messages, or an ending of the turn that is null, is refused by the runtime before anything is done",
    run: async (loaded) => {
      const ask = async (state, options) => {
        const desk = bench(loaded, { append: true, store: { writeText: false, writeJsonl: true } });
        const answered = await desk.run(({ store, ctx }) => store.writeFromStateIncremental(ctx, state, ID, 1, options));
        return { answered, ...desk.seen() };
      };
      return {
        "no state": await ask(undefined),
        "an empty state": await ask({}),
        "a list that is null": await ask({ rootPromptMessagesJson: null, summaryArchives: [] }),
        "an ending that is null": await ask({ rootPromptMessagesJson: [], summaryArchives: [] }, { turnEnded: null }),
        "options that are null": await ask({ rootPromptMessagesJson: [], summaryArchives: [] }, null),
        "no archives is no matter when adding": await (async () => {
          const desk = bench(loaded, { messages: [user("before"), assistant("new")], append: true, store: { writeText: false, writeJsonl: true } });
          const answered = await desk.run(({ store, state, ctx }) => store.writeFromStateIncremental(ctx, { rootPromptMessagesJson: state.rootPromptMessagesJson }, ID, 1));
          return { answered, ...desk.seen() };
        })(),
      };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // The store: on a real disk
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "one conversation kept on a disk: written whole, added to twice, its turn ended, then written whole again",
    run: async (loaded, tools) => {
      const dir = await tools.tmp();
      const onDisk = async (file, words) => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, words, "utf8");
      };
      const addOnDisk = async (file, words) => {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, words, "utf8");
      };
      const conversation = [...ORDINARY, user("And the license?"), assistant([text("MIT."), toolCall("Read", { path: "LICENSE" })]), says("tool", [toolResult("Read")]), assistant("It is MIT.")];
      const desk = bench(loaded, { messages: conversation, projectDir: dir, writeFile: onDisk, append: true, appendFile: addOnDisk, store: { writeText: false, writeJsonl: true } });
      const upTo = (count) => ({ mode: 1, rootPromptMessagesJson: desk.state.rootPromptMessagesJson.slice(0, count), summaryArchives: [] });
      const file = path.join(dir, "agent-transcripts", ID, `${ID}.jsonl`);
      const steps = [];
      const step = async (name, act) => {
        const answered = await desk.run(act);
        steps.push({ step: name, answered, lines: (await readFile(file, "utf8")).split("\n") });
      };
      await step("written whole after the first answer", ({ store, ctx }) => store.writeFromStateIncremental(ctx, upTo(6), ID, 0));
      await step("the next question added", ({ store, ctx }) => store.writeFromStateIncremental(ctx, upTo(7), ID, 6));
      await step("the rest added, with the end of the turn", ({ store, ctx }) => store.writeFromStateIncremental(ctx, upTo(10), ID, 7, { turnEnded: { status: "success" } }));
      await step("nothing new: nothing added", ({ store, ctx }) => store.writeFromStateIncremental(ctx, upTo(10), ID, 10));
      await step("written whole again", ({ store, ctx }) => store.writeFromStateFull(ctx, upTo(10), ID, { turnEnded: { status: "success" } }));
      const all = desk.store({ writeText: true, writeJson: true, writeJsonl: true });
      const allAnswered = await desk.run(({ ctx }) => all.writeFromStateFull(ctx, upTo(10), "team/other one", { turnEnded: { status: "aborted" }, overviewFactory: async () => "About a README." }));
      const found = [];
      const walk = async (folder) => {
        for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const full = path.join(folder, entry.name);
          if (entry.isDirectory()) await walk(full);
          else found.push({ file: tools.scrub(full, { [dir]: "<tmp>" }), text: await readFile(full, "utf8") });
        }
      };
      await walk(dir);
      return { steps, allAnswered, said: desk.said(), found };
    },
  },

  // -------------------------------------------------------------------------------------------------------------
  // The part as it stands
  // -------------------------------------------------------------------------------------------------------------
  {
    name: "the exports as they stand: how many arguments each takes, and what the store's class holds",
    run: ({ paths, stripping, index, traceFormat }) => ({
      arguments: Object.fromEntries([paths.getTranscriptRelativePath, stripping.stripTags, stripping.stripContextTags, traceFormat.convertConversationMessagesToTrace, index.TranscriptStore].map((made) => [made.name, made.length])),
      "the store's methods, each with its arguments": Object.getOwnPropertyNames(index.TranscriptStore.prototype).map((name) => `${name}: ${index.TranscriptStore.prototype[name].length}`),
      "the store's class holds": Object.getOwnPropertyNames(index.TranscriptStore).sort(),
      "a store cannot be made without new": (() => {
        try {
          index.TranscriptStore("/project", {}, async () => {});
          return "it can";
        } catch (error) {
          return `refused: a ${error.constructor.name}`;
        }
      })(),
      "stripContextTags has a prototype of its own, as a function made to be called with new has": "prototype" in stripping.stripContextTags,
      "the store's methods give a promise even when they fail at once": [new index.TranscriptStore("/p", {}, async () => {}).writeFromStateFull() instanceof Promise, (() => {
        const promise = new index.TranscriptStore("/p", {}, async () => {}).writeFromStateIncremental();
        promise.catch(() => {});
        return promise instanceof Promise;
      })()],
    }),
  },
];
