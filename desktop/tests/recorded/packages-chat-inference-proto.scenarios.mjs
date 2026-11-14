/**
 * How a prompt leaves the engine for the server and how the answer comes
 * back. `converters.ts` turns the engine's own shape of a message, a tool
 * and a request into the wire's shape, and an error that came down a stream
 * into one of the engine's errors. `client.ts` sends a prompt over a
 * connection and reads the stream that answers it. `modelProviderOptions.ts`
 * reads and writes the model's name kept on a piece of reasoning.
 *
 * No model and no server is called. The connection is a stand-in made here:
 * it keeps what the client sent, as the wire's plain form and as bytes, and
 * answers with pieces written out by hand, in the plain form or byte by
 * byte. While a stream is read the clock and the maker of random ids are
 * stand-ins too, so that how often each is asked is counted.
 *
 * What goes on the wire is kept three ways for every message the part
 * makes: the object itself (its class and its own fields, in their order),
 * its bytes (hex) and its plain form (the JSON the engine's connection
 * sends).
 *
 * Two modules are borrowed from other parts: the wire's own messages
 * (generated, a contract with the server) and the real contexts. They are
 * built into the same file so that a scenario can make a message of the
 * wire and a context as the engine does. The folder holds one more file,
 * `index.ts`, that is not this part's.
 */
export const part = "packages/chat-inference-proto";

const folder = "source/packages/chat-inference-proto";
export const modules = {
  client: `${folder}/client.ts`,
  converters: `${folder}/converters.ts`,
  options: `${folder}/modelProviderOptions.ts`,
};

/** Not this part's code: the messages of the wire, and the contexts the engine hands down every call. */
export const borrowed = {
  wire: "source/packages/proto/generated/simeon/v1/inference_pb.ts",
  context: "source/packages/context/core.ts",
};

export const covers = [modules.client, modules.converters, modules.options];

// ---------------------------------------------------------------------------
// How the cases are asked and kept
// ---------------------------------------------------------------------------

/** Each named case's answer, under its name. */
const cases = (named, ask) => Object.fromEntries(Object.entries(named).map(([name, input]) => [name, ask(input)]));

/** The same, where asking takes time: one case after the other. */
async function casesInTurn(named, ask) {
  const out = {};
  for (const [name, input] of Object.entries(named)) out[name] = await ask(input);
  return out;
}

/**
 * An error as it is kept. Where JavaScript itself refuses a call and its
 * sentence quotes the words of the code that failed ("x.map is not a
 * function"), only the kind of failure is kept: those words are the code's
 * own and may be others after it is written again. Every other sentence is
 * kept whole.
 */
const QUOTES_THE_CODE = /is not a function|is not iterable|is not async iterable|is not a constructor|is not defined/;
function told(error) {
  const kind = error?.constructor?.name;
  if (error instanceof Error && ["TypeError", "ReferenceError"].includes(kind) && QUOTES_THE_CODE.test(error.message)) {
    return { failure: kind, sentence: "JavaScript's own, quoting the code's words: not kept" };
  }
  return error;
}

/** The answer, or what was thrown. */
const attempt = (ask) => {
  try {
    return ask();
  } catch (error) {
    return { threw: told(error) };
  }
};

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/** A message of the wire as the part made it: the object itself, its bytes and its plain form. */
const onTheWire = (message) => ({
  held: message,
  bytes: attempt(() => hex(message.toBinary())),
  plain: attempt(() => message.toJson()),
});

/** The same without the object: what a connection would carry. */
const carried = (message) => ({
  plain: attempt(() => message.toJson()),
  bytes: attempt(() => hex(message.toBinary())),
});

/** A function's own name, how many parameters it declares, and whether it is one that answers later. */
const signature = (fn) => ({ name: fn.name, parameters: fn.length, kind: Object.prototype.toString.call(fn).slice(8, -1) });

/** A class: its parent, how many parameters it is made with, and the methods other parts may call on it. */
const classShape = (made, methods) => ({
  name: made.name,
  parameters: made.length,
  parent: Object.getPrototypeOf(made).name,
  statics: Object.getOwnPropertyNames(made).filter((name) => !["length", "name", "prototype"].includes(name)),
  methods: Object.fromEntries(
    methods.map((name) => [
      name,
      Object.hasOwn(made.prototype, name)
        ? `its own, ${Object.prototype.toString.call(made.prototype[name]).slice(8, -1)} of ${made.prototype[name].length}`
        : `from ${Object.getPrototypeOf(made).name}`,
    ]),
  ),
});

/** One turn of the event loop: everything that was waiting on a promise has run. */
const turn = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Bytes written by hand
// ---------------------------------------------------------------------------

function varint(value) {
  let left = BigInt(value);
  if (left < 0n) left += 1n << 64n;
  const out = [];
  do {
    const seven = Number(left & 0x7fn);
    left >>= 7n;
    out.push(left > 0n ? seven | 0x80 : seven);
  } while (left > 0n);
  return out;
}
const tagOf = (no, kind) => varint((no << 3) | kind);
/** A field that holds bytes of its own: a text, or a message made of the fields given. */
const inside = (no, ...fields) => {
  const body = fields.flat(Infinity);
  return [...tagOf(no, 2), ...varint(body.length), ...body];
};
const words = (no, text) => inside(no, [...Buffer.from(text, "utf8")]);
const count = (no, n) => [...tagOf(no, 0), ...varint(n)];
const double = (no, x) => {
  const eight = Buffer.alloc(8);
  eight.writeDoubleLE(x);
  return [...tagOf(no, 1), ...eight];
};
/** Numbers with a point, packed one after the other as the wire packs a list of them. */
const doubles = (...list) =>
  list.flatMap((x) => {
    const eight = Buffer.alloc(8);
    eight.writeDoubleLE(x);
    return [...eight];
  });
/** One entry of a record of fields (`google.protobuf.Struct`): a name and a value. */
const entryOf = (name, ...value) => inside(1, words(1, name), inside(2, ...value));

// ---------------------------------------------------------------------------
// The stand-in connection, the context, and the clock
// ---------------------------------------------------------------------------

const MODEL = () => ({ modelId: "model-a", maxMode: false, parameters: [] });
const KEYS = { requestId: "requestIdKey", conversationId: "conversationIdKey", automationId: "automationIdKey", requestedModel: "requestedModelKey" };
const NOW = Date.UTC(2026, 10, 14, 9, 30, 0);

/**
 * A connection that follows scripts, one for each call of `stream`. A step
 * of a script is a piece in the plain form (`plain`), a piece in bytes
 * (`bytes`), a piece handed over as it is (`made`), a failure (`fails`), a
 * wait for the cancel (`waitsForCancel`), or a function run before the next
 * step. What the client sent is kept in `sent`; the very objects in `calls`.
 */
function standInConnection(wire, scripts, events) {
  const sent = [];
  const calls = [];
  return {
    sent,
    calls,
    stream(request, options) {
      const call = calls.length + 1;
      calls.push({ request, options });
      sent.push({
        request: carried(request),
        optionNames: Object.keys(options),
        headers: { ...options.headers },
        signalAborted: options.signal?.aborted,
      });
      const steps = [...(scripts[call - 1] ?? [])];
      const says = (what, more = {}) => events.push({ connection: scripts.length > 1 ? `${what} (call ${call})` : what, ...more });
      const iterator = {
        async next() {
          for (;;) {
            const step = steps.shift();
            if (step === undefined) {
              says("has no more pieces");
              return { done: true, value: undefined };
            }
            if (typeof step === "function") {
              await step(options);
              continue;
            }
            if ("fails" in step) {
              says("fails");
              throw step.fails;
            }
            if ("waitsForCancel" in step) {
              await new Promise((resolve) => {
                if (options.signal.aborted) resolve();
                else options.signal.addEventListener("abort", resolve, { once: true });
              });
              says("sees the cancel", { reason: options.signal.reason });
              throw Object.assign(new Error("[canceled] This operation was aborted"), { name: "ConnectError", code: 1 });
            }
            let piece;
            try {
              if ("plain" in step) piece = wire.InferenceStreamResponse.fromJson(step.plain, { ignoreUnknownFields: true });
              else if ("bytes" in step) piece = wire.InferenceStreamResponse.fromBinary(Uint8Array.from(step.bytes));
              else piece = step.made;
            } catch (error) {
              says("cannot read a piece", { error: told(error) });
              throw error;
            }
            says("gives a piece", { kind: piece?.response?.case ?? "none it knows" });
            return { done: false, value: piece };
          }
        },
        async return(value) {
          says("is told to stop");
          return { done: true, value };
        },
      };
      return {
        [Symbol.asyncIterator]() {
          says("is opened");
          return iterator;
        },
      };
    },
  };
}

/**
 * An executor of the part at a desk of stand-ins: its builder, the
 * connection, and a context. The context is a real one that can be
 * canceled, behind a front that notes each thing asked of it and answers
 * for the span (a real span needs tracing set up; here it is what `span`
 * says, or nothing). A scenario may bring a connection of its own.
 */
function desk(modules, setup = {}) {
  const { messages = [{ role: "user", content: "Hello" }], model = MODEL(), config, reason, scripts = [], values = {}, span, quiet } = setup;
  const { client, context: contexts, wire } = modules;
  const events = [];
  const connection = Object.hasOwn(setup, "connection") ? setup.connection : standInConnection(wire, scripts, events);
  const builder = new client.ProtoPromptBuilder(messages);
  const executor = new client.ProtoPromptExecutor(builder, connection, model, config, reason);
  let real = contexts.createContext();
  for (const [name, value] of Object.entries(values)) real = real.with(client[KEYS[name]], value);
  const [cancelable, cancel] = real.withCancel();
  const asked = [];
  const context = {
    get signal() {
      asked.push("its signal");
      return cancelable.signal;
    },
    get(key) {
      const name = key.symbol.description;
      asked.push(name);
      if (name === "otel.span") return span === undefined ? undefined : { spanContext: () => span };
      if (name === "otel.suppress_child_spans") return quiet === true;
      return cancelable.get(key);
    },
  };
  return { events, connection, builder, executor, context, real: cancelable, cancel, asked };
}

/** The clock and the maker of random ids replaced for the time of `run`, and how often each was asked. */
async function withStandIns(run) {
  const RealDate = Date;
  const asked = { clock: 0, randomIds: 0 };
  class StandInDate extends RealDate {
    constructor(...given) {
      if (given.length === 0) {
        asked.clock += 1;
        super(NOW);
      } else {
        super(...given);
      }
    }
    static now() {
      asked.clock += 1;
      return NOW;
    }
  }
  const random = globalThis.crypto;
  Object.defineProperty(random, "randomUUID", {
    configurable: true,
    writable: true,
    value: () => {
      asked.randomIds += 1;
      return `stand-in-random-id-${asked.randomIds}`;
    },
  });
  globalThis.Date = StandInDate;
  try {
    return await run(asked);
  } finally {
    globalThis.Date = RealDate;
    delete random.randomUUID;
  }
}

const PROMISES = ["usage", "extendedUsage", "providerMetadata", "invocationId", "response"];

/** Notes in the events when each promise of a stream ends, and keeps how: the value, the error, or "still waiting". */
function watch(result, events) {
  const ends = Object.fromEntries(PROMISES.map((name) => [name, "still waiting"]));
  const reasons = {};
  for (const name of PROMISES) {
    result[name].then(
      (value) => {
        ends[name] = { resolved: value };
        events.push({ promise: name, ends: "resolved" });
      },
      (error) => {
        ends[name] = { rejected: told(error) };
        reasons[name] = error;
        events.push({ promise: name, ends: "rejected" });
      },
    );
  }
  return { ends, reasons };
}

/**
 * Reads a stream part by part and notes each in the events. It can stop
 * after some parts (`stopAfter`), throw into the stream after some
 * (`throwAfter`, `thrown`), and run something before asking for a part
 * (`before`, given how many parts came so far).
 */
async function readFrom(result, events, { stopAfter, throwAfter, thrown, before } = {}) {
  const stream = result.fullStream[Symbol.asyncIterator]();
  let got = 0;
  try {
    for (;;) {
      if (before) await before(got);
      if (stopAfter === got) {
        events.push({ reader: "stops", gave: await stream.return("the reader's word") });
        return {};
      }
      if (throwAfter === got) {
        events.push({ reader: "throws into the stream" });
        events.push({ reader: "is answered", gave: await stream.throw(thrown) });
        return {};
      }
      const step = await stream.next();
      if (step.done) {
        events.push({ reader: "reaches the end", value: step.value });
        return {};
      }
      got += 1;
      events.push({ reader: "gets", part: step.value });
    }
  } catch (error) {
    events.push({ reader: "is thrown", error: told(error) });
    return { thrown: error };
  }
}

/** One call of `stream` at a desk: started, watched, read (unless `read` is "never"), and left time to settle. */
async function ask(at, { invocationId, tools, options = {}, read = {} } = {}) {
  let result;
  try {
    result = at.executor.stream(at.context, invocationId, tools, options);
  } catch (error) {
    return { streamThrew: told(error) };
  }
  const { ends, reasons } = watch(result, at.events);
  const reader = read === "never" ? {} : await readFrom(result, at.events, read);
  await turn();
  await turn();
  return { result, promises: ends, reasons, thrown: reader.thrown };
}

/** A desk, one call, and everything there is to tell of it. */
async function exchange(modules, setup = {}, call = {}) {
  const at = desk(modules, setup);
  return withStandIns(async (standIns) => {
    const one = await ask(at, call);
    const parts = at.events.filter((event) => event.reader === "gets").map((event) => event.part);
    return { ...one, at, parts, events: at.events, sent: at.connection.sent, contextAsked: at.asked, standIns: { ...standIns } };
  });
}

/** The parts a reader gets when the connection answers with these pieces. */
const partsFor = async (modules, pieces) => (await exchange(modules, { scripts: [pieces] })).parts;

/** How one promise of a stream ends when the connection answers with these pieces. */
const endOf = async (modules, name, pieces) => (await exchange(modules, { scripts: [pieces] })).promises[name];

/** What a call of `stream` sent, without reading the answer. */
function whatIsSent(modules, setup = {}, call = {}) {
  const at = desk(modules, setup);
  let result;
  try {
    result = at.executor.stream(at.context, call.invocationId, call.tools, "options" in call ? call.options : {});
  } catch (error) {
    return { threw: told(error), sent: at.connection.sent, contextAsked: at.asked };
  }
  return {
    sent: at.connection.sent,
    contextAsked: at.asked,
    gives: Object.keys(result),
    signalIsTheContexts: at.connection.calls[0].options.signal === at.real.signal,
  };
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

/** What a tool call's arguments may be. */
const ARGUMENTS = () => ({
  "an empty object": {},
  "an object of every kind of value": { text: "a", number: 1.5, yes: true, no: false, nothing: null, list: [1, "two", null, [3], { four: 4 }], inner: { deep: { deeper: "x" } } },
  "an object with a field that is undefined": { path: "/tmp/a", missing: undefined },
  "an object with a function in it": { run: () => 1 },
  "an object with a number without end": { n: Number.POSITIVE_INFINITY },
  "a date": new Date(0),
  "a map": new Map([["a", 1]]),
  "an object made from nothing": Object.assign(Object.create(null), { a: 1 }),
  "an empty list": [],
  "a list": [1, { a: 2 }],
  "words": "plain words",
  "words that are JSON": '{"path":"/tmp/a"}',
  "no words": "",
  "a number": 42,
  "zero": 0,
  "what is no number": Number.NaN,
  "true": true,
  "false": false,
  "null": null,
  "undefined": undefined,
  "a function": () => 1,
  "a symbol": Symbol("s"),
  "a number too large for a number": 10n,
});

/** The text that may come beside the arguments: what the model wrote, as it wrote it. */
const BESIDE = { "nothing beside": undefined, "a text beside": '{"path": "/tmp/a"}  ', "an empty text beside": "", "null beside": null };

/** A person's message in every form the part tells apart. */
const FROM_A_PERSON = () => ({
  "words": { role: "user", content: "Hello there" },
  "no words": { role: "user", content: "" },
  "words with accents, a sign that takes four bytes, a tab and new lines": { role: "user", content: "Voil\u00e0 \u2014 \u00e7a marche \u{1F44D}\n\tline two\r\n" },
  "an empty list": { role: "user", content: [] },
  "a list of words": { role: "user", content: [{ type: "text", text: "First. " }, { type: "text", text: "Second." }] },
  "words that are missing": { role: "user", content: [{ type: "text" }] },
  "words that are a number": { role: "user", content: [{ type: "text", text: 5 }] },
  "a picture as an address that holds it": { role: "user", content: [{ type: "image", image: "data:image/jpeg;base64,/9j/4AAQ", mimeType: "image/jpeg" }] },
  "a picture as a web address": { role: "user", content: [{ type: "image", image: "https://example.test/cat.png" }] },
  "a picture as a URL": { role: "user", content: [{ type: "image", image: new URL("https://example.test/a b.png?x=1#y"), mimeType: "image/png" }] },
  "a picture as bytes with its kind": { role: "user", content: [{ type: "image", image: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: "image/webp" }] },
  "a picture as bytes without a kind": { role: "user", content: [{ type: "image", image: Uint8Array.from([1, 2, 3]) }] },
  "a picture as bytes with an empty kind": { role: "user", content: [{ type: "image", image: Uint8Array.from([1, 2, 3]), mimeType: "" }] },
  "a picture as bytes with a kind of spaces": { role: "user", content: [{ type: "image", image: Uint8Array.from([1, 2, 3]), mimeType: "   " }] },
  "a picture as bytes with spaces around its kind": { role: "user", content: [{ type: "image", image: Uint8Array.from([1, 2, 3]), mimeType: " image/gif " }] },
  "a picture as bytes with a kind that is a number": { role: "user", content: [{ type: "image", image: Uint8Array.from([1, 2, 3]), mimeType: 7 }] },
  "a picture as a Buffer": { role: "user", content: [{ type: "image", image: Buffer.from("picture"), mimeType: "image/png" }] },
  "a picture as an ArrayBuffer": { role: "user", content: [{ type: "image", image: Uint8Array.from([255, 216, 255]).buffer, mimeType: "image/jpeg" }] },
  "a picture as an ArrayBuffer without a kind": { role: "user", content: [{ type: "image", image: Uint8Array.from([255, 216, 255]).buffer }] },
  "a picture of no bytes": { role: "user", content: [{ type: "image", image: new Uint8Array(0) }] },
  "a picture as numbers of sixteen bits": { role: "user", content: [{ type: "image", image: Uint16Array.from([1, 2]), mimeType: "image/png" }] },
  "a picture as a view on bytes": { role: "user", content: [{ type: "image", image: new DataView(new ArrayBuffer(2)), mimeType: "image/png" }] },
  "a picture as a number": { role: "user", content: [{ type: "image", image: 5 }] },
  "a picture that is missing": { role: "user", content: [{ type: "image" }] },
  "a picture that is null": { role: "user", content: [{ type: "image", image: null, mimeType: "image/png" }] },
  "a file with a name": { role: "user", content: [{ type: "file", name: "report.pdf", data: "JVBERi0=", mimeType: "application/pdf" }] },
  "a file without a name": { role: "user", content: [{ type: "file", data: "JVBERi0=" }] },
  "a file whose name is null": { role: "user", content: [{ type: "file", name: null }] },
  "a file whose name is empty": { role: "user", content: [{ type: "file", name: "" }] },
  "a file whose name is a number": { role: "user", content: [{ type: "file", name: 12 }] },
  "a file whose name holds a bracket and a new line": { role: "user", content: [{ type: "file", name: "a]\n[b.txt" }] },
  "a file whose name has accents and spaces": { role: "user", content: [{ type: "file", name: "R\u00e9sum\u00e9 final (v2).docx" }] },
  "a part of a kind the part does not know": { role: "user", content: [{ type: "audio", data: "AAAA" }] },
  "a part with no kind": { role: "user", content: [{}] },
  "words, a picture and a file, in their order": {
    role: "user",
    content: [
      { type: "text", text: "Look at this:" },
      { type: "image", image: "https://example.test/one.png", mimeType: "image/png" },
      { type: "file", name: "notes.txt" },
      { type: "text", text: "and tell me." },
    ],
  },
  "content that is a number": { role: "user", content: 5 },
  "content that is missing": { role: "user" },
  "content that is null": { role: "user", content: null },
  "content that is a record": { role: "user", content: { type: "text", text: "not a list" } },
  "a list that holds null": { role: "user", content: [null] },
  "a list that holds undefined": { role: "user", content: [undefined] },
  "more fields than the wire has": { role: "user", content: "Hi", id: "m1", name: "Ada", providerOptions: { simeon: { modelName: "x" } } },
});

/** What a part's options may be. Each is put on a piece of words, on a picture and on a tool's result. */
const OPTIONS = () => ({
  "none": undefined,
  "null": null,
  "words": "ephemeral",
  "a number": 3,
  "true": true,
  "an empty record": {},
  "a list": [{ anthropic: { cacheControl: { type: "ephemeral" } } }],
  "the cache asked for": { anthropic: { cacheControl: { type: "ephemeral" } } },
  "the cache asked for with more beside": { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" }, other: 1 }, openai: { store: true } },
  "the cache asked for without its kind": { anthropic: { cacheControl: {} } },
  "the cache asked for with a kind that is undefined": { anthropic: { cacheControl: { type: undefined } } },
  "the cache asked for with a kind that is null": { anthropic: { cacheControl: { type: null } } },
  "the cache asked for with a kind that is a number": { anthropic: { cacheControl: { type: 5 } } },
  "the cache asked for as words": { anthropic: { cacheControl: "ephemeral" } },
  "the cache asked for as true": { anthropic: { cacheControl: true } },
  "the cache not asked for: null": { anthropic: { cacheControl: null } },
  "the cache not asked for: false": { anthropic: { cacheControl: false } },
  "the first provider with nothing": { anthropic: {} },
  "the first provider as null": { anthropic: null },
  "the first provider as words": { anthropic: "x" },
  "a picture's description under the wire's own name": { cursor: { imageDescription: "A grey cat on a chair" } },
  "a picture's description under the name the client writes": { simeon: { imageDescription: "A grey cat on a chair" } },
  "an empty description": { cursor: { imageDescription: "" } },
  "a description that is a number": { cursor: { imageDescription: 4 } },
  "descriptions by number": { cursor: { imageDescriptions: { 0: "First picture", 2: "Third picture" } } },
  "descriptions as a list, one of them empty": { cursor: { imageDescriptions: ["Zero", "", "Two"] } },
  "descriptions under names that are no whole number from zero": { cursor: { imageDescriptions: { x: "a", "1.5": "b", "-1": "c", "": "d", " 3 ": "e", "1e2": "f", "0x10": "g", "-0": "h", "4294967296": "i", Infinity: "j" } } },
  "descriptions that are no words": { cursor: { imageDescriptions: { 0: 1, 1: null, 2: undefined, 3: ["x"], 4: "" } } },
  "the same number twice, written two ways": { cursor: { imageDescriptions: { "1.0": "first", "01": "second", 1: "third" } } },
  "descriptions that are null": { cursor: { imageDescriptions: null } },
  "descriptions that are words": { cursor: { imageDescriptions: "ab" } },
  "descriptions in a map": { cursor: { imageDescriptions: new Map([[0, "a"]]) } },
  "one description and descriptions by number": { cursor: { imageDescription: "One", imageDescriptions: { 1: "Two" } } },
  "the second provider with nothing": { cursor: {} },
  "the second provider as null": { cursor: null },
  "the second provider as words": { cursor: "x" },
  "the second provider as a number": { cursor: 1 },
  "both providers": { anthropic: { cacheControl: { type: "ephemeral" } }, cursor: { imageDescription: "Both" } },
  "the cache as words and a description": { anthropic: { cacheControl: "yes" }, cursor: { imageDescriptions: { 0: "x" } } },
});

/** An assistant's message in every form the part tells apart. */
const FROM_THE_ASSISTANT = () => ({
  "words": { role: "assistant", content: "Here you are." },
  "no words": { role: "assistant", content: "" },
  "an empty list": { role: "assistant", content: [] },
  "pieces of words, joined": { role: "assistant", content: [{ type: "text", text: "One, " }, { type: "text", text: "two." }] },
  "one piece of no words": { role: "assistant", content: [{ type: "text", text: "" }] },
  "a piece whose words are missing, then words": { role: "assistant", content: [{ type: "text" }, { type: "text", text: "after" }] },
  "pieces whose words are a number and null": { role: "assistant", content: [{ type: "text", text: 5 }, { type: "text", text: null }, { type: "text", text: "!" }] },
  "a tool call with fields": { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a", limit: 10 } }] },
  "a tool call with words for arguments": { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Shell", args: "ls -la" }] },
  "a tool call with a list for arguments": { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Many", args: [1, 2] }] },
  "a tool call with what the model wrote beside its fields": {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a" }, providerOptions: { simeon: { rawToolCallArgs: '{"path": "/tmp/a"}' } } }],
  },
  "a tool call with what the model wrote beside words": {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Shell", args: "ls", providerOptions: { simeon: { rawToolCallArgs: "ls   " } } }],
  },
  "a tool call whose text beside is no text": {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a" }, providerOptions: { simeon: { rawToolCallArgs: { path: "/tmp/a" } } } }],
  },
  "a tool call whose text beside is under another name": {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a" }, providerOptions: { cursor: { rawToolCallArgs: "x" } } }],
  },
  "a tool call without an id or a name": { role: "assistant", content: [{ type: "tool-call", args: {} }] },
  "a tool call without arguments": { role: "assistant", content: [{ type: "text", text: "before" }, { type: "tool-call", toolCallId: "call-1", toolName: "Read" }] },
  "reasoning": { role: "assistant", content: [{ type: "reasoning", text: "Let me think." }] },
  "reasoning with its signature": { role: "assistant", content: [{ type: "reasoning", text: "Let me think.", signature: "sig-1" }] },
  "reasoning with the model's name": { role: "assistant", content: [{ type: "reasoning", text: "Let me think.", signature: "sig-1", providerOptions: { simeon: { modelName: "model-b" } } }] },
  "reasoning with a model's name that is no text": { role: "assistant", content: [{ type: "reasoning", text: "Hm.", providerOptions: { simeon: { modelName: 7 } } }] },
  "reasoning without words": { role: "assistant", content: [{ type: "reasoning" }] },
  "reasoning that was hidden": { role: "assistant", content: [{ type: "redacted-reasoning", data: "b3BhcXVl" }] },
  "reasoning that was hidden, with the model's name": { role: "assistant", content: [{ type: "redacted-reasoning", data: "b3BhcXVl", providerOptions: { simeon: { modelName: "model-b" } } }] },
  "reasoning that was hidden, without its data": { role: "assistant", content: [{ type: "redacted-reasoning" }] },
  "everything, out of order": {
    role: "assistant",
    content: [
      { type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/a" } },
      { type: "text", text: "I will read " },
      { type: "redacted-reasoning", data: "AAAA" },
      { type: "reasoning", text: "First the file.", signature: "s" },
      { type: "text", text: "the file." },
      { type: "tool-call", toolCallId: "call-2", toolName: "Shell", args: "pwd" },
      { type: "image", image: "https://example.test/x.png" },
      { type: "file", name: "x.txt" },
    ],
  },
  "only parts the part does not know": { role: "assistant", content: [{ type: "image", image: "x" }, { type: "source" }, {}] },
  "the provider's own id of the message": { role: "assistant", content: "Done.", providerOptions: { simeon: { modelProviderMessageId: "msg_123" } } },
  "an id that is no text": { role: "assistant", content: "Done.", providerOptions: { simeon: { modelProviderMessageId: 123 } } },
  "an empty id": { role: "assistant", content: "Done.", providerOptions: { simeon: { modelProviderMessageId: "" } } },
  "a phase": { role: "assistant", content: "Thinking aloud.", providerOptions: { simeon: { openaiPhase: "commentary" } } },
  "an empty phase": { role: "assistant", content: "x", providerOptions: { simeon: { openaiPhase: "" } } },
  "a phase said to be null": { role: "assistant", content: "Done.", providerOptions: { simeon: { openaiPhase: null } } },
  "a phase that is a number": { role: "assistant", content: "Done.", providerOptions: { simeon: { openaiPhase: 2 } } },
  "a phase that is undefined": { role: "assistant", content: "Done.", providerOptions: { simeon: { openaiPhase: undefined } } },
  "an id and a phase, with a tool call": {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Read", args: {} }],
    providerOptions: { simeon: { modelProviderMessageId: "msg_9", openaiPhase: "final_answer" } },
  },
  "an id and a phase under another name": { role: "assistant", content: "Done.", providerOptions: { cursor: { modelProviderMessageId: "msg_9", openaiPhase: "commentary" } } },
  "options that are null": { role: "assistant", content: "Done.", providerOptions: null },
  "content that is missing": { role: "assistant" },
  "content that is a number": { role: "assistant", content: 5 },
  "a list that holds null": { role: "assistant", content: [null] },
});

/** A tool's message in every form the part tells apart. */
const FROM_A_TOOL = () => ({
  "a result that is a record": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Read", result: { content: [{ type: "text", text: "file body" }], isError: false } }] },
  "a result that is words": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "done" }] },
  "a result that is no words": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "" }] },
  "a result that is words that are JSON": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: '{"a":1}' }] },
  "a result that is a number": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Count", result: 12.5 }] },
  "a result that is zero": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Count", result: 0 }] },
  "a result that is true": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Check", result: true }] },
  "a result that is null": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Check", result: null }] },
  "a result that is a list": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "List", result: ["a", 1, null, { b: [true] }] }] },
  "a result that is missing": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Quiet" }] },
  "a result with fields that are undefined, a date and what is no number": {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Odd", result: { gone: undefined, when: new Date(0), nan: Number.NaN, list: [undefined, () => 1] } }],
  },
  "a result that is a function": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Odd", result: () => 1 }] },
  "a result that is a number too large for a number": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Odd", result: 10n }] },
  "a result that is what is no number": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Odd", result: Number.NaN }] },
  "a failure": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "exit 1", isError: true }] },
  "said not to be a failure": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "ok", isError: false }] },
  "a failure said in words": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "x", isError: "yes" }] },
  "a failure said as zero": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "x", isError: 0 }] },
  "words and a picture beside the result": {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "Screenshot",
        result: "see the picture",
        experimental_content: [
          { type: "text", text: "The screen:" },
          { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
        ],
      },
    ],
  },
  "a picture beside the result without its kind": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: [{ type: "image", data: "iVBORw0KGgo=" }] }] },
  "a picture beside the result without its data": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: [{ type: "image", mimeType: "image/png" }] }] },
  "something else beside the result": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: [{ type: "resource", uri: "file:///a" }, { type: "audio", text: "kept as words" }, {}] }] },
  "nothing beside the result": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", result: "x", experimental_content: [] }] },
  "what is beside the result is words": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: "abc" }] },
  "what is beside the result is a record with a length": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: { length: 0 } }] },
  "the cache asked for on a result": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Read", result: "x", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }] },
  "descriptions of a result's pictures under the wire's own name": {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "Screenshot",
        experimental_content: [{ type: "image", data: "AAAA", mimeType: "image/png" }, { type: "image", data: "BBBB", mimeType: "image/png" }],
        providerOptions: { cursor: { imageDescriptions: { 0: "A login page", 1: "A dashboard" } } },
      },
    ],
  },
  "descriptions of a result's pictures under the name the client writes": {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "Screenshot",
        experimental_content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
        providerOptions: { simeon: { imageDescriptions: { 0: "A login page" } } },
      },
    ],
  },
  "two results, and parts that are no result between them": {
    role: "tool",
    content: [
      { type: "tool-result", toolCallId: "call-1", toolName: "Read", result: "one" },
      { type: "text", text: "dropped" },
      { type: "tool-call", toolCallId: "call-x", toolName: "Nope", args: {} },
      { type: "tool-result", toolCallId: "call-2", toolName: "Shell", result: "two", isError: true },
    ],
  },
  "a result without an id or a name": { role: "tool", content: [{ type: "tool-result", result: 1 }] },
  "an empty list": { role: "tool", content: [] },
  "content that is words": { role: "tool", content: "not a list" },
  "content that is missing": { role: "tool" },
  "a list that holds null": { role: "tool", content: [null] },
});

/** The first words of the conversation, and messages that are none of the four kinds. */
const THE_REST = () => ({
  "the first words of all": { role: "system", content: "You are a careful assistant." },
  "first words that are empty": { role: "system", content: "" },
  "first words that are missing": { role: "system" },
  "first words that are null": { role: "system", content: null },
  "first words that are a number": { role: "system", content: 5 },
  "first words that are a list": { role: "system", content: [{ type: "text", text: "in a list" }] },
  "a kind of message the wire has no name for": { role: "developer", content: "Do this." },
  "a kind in capitals": { role: "USER", content: "Hello" },
  "no kind at all": { content: "Hello" },
  "an empty record": {},
  "null": null,
  "undefined": undefined,
  "words": "Hello",
});

/** A tool the agent offers. */
const AGENT_TOOLS = () => ({
  "a tool with a name, a description and parameters": {
    name: "Read",
    description: "Reads a file from disk.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Where the file is" }, limit: { type: "number" } }, required: ["path"], additionalProperties: false },
  },
  "a tool with no parameters to speak of": { name: "Now", description: "Tells the time.", parameters: {} },
  "a tool with a format of its own": { name: "Patch", description: "Applies a patch.", parameters: { type: "object" }, customToolFormat: { type: "grammar", definition: "start: line+", syntax: "lark" } },
  "a format with only its kind": { name: "Patch", description: "Applies a patch.", parameters: {}, customToolFormat: { type: "text" } },
  "a format with more than the wire has": { name: "Patch", description: "d", parameters: {}, customToolFormat: { type: "grammar", definition: "x", syntax: "regex", extra: true } },
  "a format that is null": { name: "Patch", description: "d", parameters: {}, customToolFormat: null },
  "a format that is words": { name: "Patch", description: "d", parameters: {}, customToolFormat: "text" },
  "no description": { name: "Bare", parameters: {} },
  "no name": { description: "Nameless.", parameters: {} },
  "parameters with a field that is undefined": { name: "T", description: "d", parameters: { type: "object", gone: undefined } },
  "parameters that are missing": { name: "T", description: "d" },
  "parameters that are null": { name: "T", description: "d", parameters: null },
  "parameters that are a list": { name: "T", description: "d", parameters: [] },
  "parameters that are words": { name: "T", description: "d", parameters: "object" },
  "more fields than the wire has": { name: "T", description: "d", parameters: {}, execute: () => 1, type: "function" },
});

/** A tool the provider itself defines. */
const PROVIDER_TOOLS = () => ({
  "a tool with its options": { type: "provider-defined", id: "openai.web_search", name: "web_search", options: { searchContextSize: "medium", filters: { allowedDomains: ["example.test"] } } },
  "a tool without options": { type: "provider-defined", id: "anthropic.computer_20250124", name: "computer" },
  "options that are an empty record": { type: "provider-defined", id: "x.y", name: "y", options: {} },
  "options that are null": { type: "provider-defined", id: "x.y", name: "y", options: null },
  "options that are zero": { type: "provider-defined", id: "x.y", name: "y", options: 0 },
  "options that are words": { type: "provider-defined", id: "x.y", name: "y", options: "all" },
  "options that are a list": { type: "provider-defined", id: "x.y", name: "y", options: [1] },
  "no id and no name": { type: "provider-defined" },
  "more fields than the wire has": { type: "provider-defined", id: "x.y", name: "y", args: { a: 1 } },
});

/** An error as it comes down a stream, in the wire's plain form. */
const STREAM_ERRORS = {
  "a kind that is not said": { message: "Something went wrong", code: "internal" },
  "an unknown kind": { message: "Something went wrong", errorType: "INFERENCE_STREAM_ERROR_TYPE_UNKNOWN" },
  "too much went in, by its kind": { message: "The prompt is 300000 tokens.", errorType: "INFERENCE_STREAM_ERROR_TYPE_INPUT_TOKEN_LIMIT" },
  "too much came out, by its kind": { message: "The answer was cut.", errorType: "INFERENCE_STREAM_ERROR_TYPE_OUTPUT_TOKEN_LIMIT" },
  "too many calls": { message: "Slow down.", code: "429", errorType: "INFERENCE_STREAM_ERROR_TYPE_RATE_LIMIT" },
  "not signed in": { message: "Sign in again.", errorType: "INFERENCE_STREAM_ERROR_TYPE_AUTHENTICATION" },
  "not allowed": { message: "Not for this account.", errorType: "INFERENCE_STREAM_ERROR_TYPE_PERMISSION" },
  "the provider is overloaded": { message: "Overloaded.", errorType: "INFERENCE_STREAM_ERROR_TYPE_OVERLOADED" },
  "the content was refused": { message: "Refused.", errorType: "INFERENCE_STREAM_ERROR_TYPE_CONTENT_FILTER" },
  "too much went in, by the older mark": { message: "Too long.", isInputTokenLimitError: true },
  "too much came out, by the older mark": { message: "Cut.", isOutputTokenLimitError: true },
  "both older marks": { message: "Both.", isInputTokenLimitError: true, isOutputTokenLimitError: true },
  "the kind says out, the older mark says in": { message: "Mixed.", errorType: "INFERENCE_STREAM_ERROR_TYPE_OUTPUT_TOKEN_LIMIT", isInputTokenLimitError: true },
  "the kind says in, the older mark says out": { message: "Mixed.", errorType: "INFERENCE_STREAM_ERROR_TYPE_INPUT_TOKEN_LIMIT", isOutputTokenLimitError: true },
  "another kind, the older mark says out": { message: "Slow and cut.", errorType: "INFERENCE_STREAM_ERROR_TYPE_RATE_LIMIT", isOutputTokenLimitError: true },
  "no mark, a sentence that says too much went in": { message: "Error: prompt is too long: 210000 tokens > 200000 maximum" },
  "no mark, a sentence that says too much came out": { message: "The model exceeded max output tokens." },
  "no mark, our own sentence for too much in": { message: "Input token limit exceeded" },
  "another kind, a sentence that says too much went in": { message: "context_length_exceeded", errorType: "INFERENCE_STREAM_ERROR_TYPE_UNKNOWN" },
  "no sentence at all": {},
  "too much went in, with no sentence": { errorType: "INFERENCE_STREAM_ERROR_TYPE_INPUT_TOKEN_LIMIT" },
  "too much came out, with no sentence": { isOutputTokenLimitError: true },
};

// ---------------------------------------------------------------------------
// Pieces of a stream, written out by hand
// ---------------------------------------------------------------------------

const text = (words_, more = {}) => ({ plain: { textPart: { text: words_, ...more } } });
const lastText = (more = {}) => ({ plain: { textPart: { isFinal: true, ...more } } });
const thinking = (fields) => ({ plain: { thinkingPart: fields } });
const toolCall = (fields) => ({ plain: { toolCallPart: fields } });
const usage = (fields) => ({ plain: { usage: fields } });
const moreUsage = (fields) => ({ plain: { extendedUsage: fields } });
const metadata = (fields) => ({ plain: { providerMetadata: fields } });
const invocation = (id) => ({ plain: { invocationId: { invocationId: id } } });
const info = (fields) => ({ plain: { responseInfo: fields } });
const failure = (fields) => ({ plain: { error: fields } });
const descriptions = (...list) => ({ plain: { imageDescriptions: { descriptions: list } } });

/** A whole answer: its id, thinking, words, a tool call in three pieces, the end, the counts, and what is known of it. */
const WHOLE_ANSWER = () => [
  invocation("inv-from-server"),
  thinking({ text: "The person wants a file read." }),
  thinking({ signature: "sig-abc" }),
  text("I will "),
  text("read it."),
  toolCall({ toolCallId: "call-1", toolName: "Read" }),
  toolCall({ toolCallId: "call-1", args: '{"path":' }),
  toolCall({ toolCallId: "call-1", args: '"/tmp/a"}' }),
  toolCall({ toolCallId: "call-1", toolName: "Read", args: '{"path":"/tmp/a"}', isComplete: true }),
  lastText(),
  usage({ promptTokens: 120, completionTokens: 30, totalTokens: 150 }),
  moreUsage({ inputTokens: 120, outputTokens: 30, cacheReadTokens: 100, cacheWriteTokens: 20, maxTokens: 200000 }),
  metadata({ metadata: { openai: { responseId: "resp_1", cachedPromptTokens: 100 } } }),
  info({
    id: "answer-1",
    model: "model-a-2026",
    createdAt: "1767225600000",
    messages: [
      {
        id: "msg-1",
        role: "INFERENCE_MESSAGE_ROLE_ASSISTANT",
        content: "I will read it.",
        reasoningParts: [{ text: "The person wants a file read.", signature: "sig-abc" }],
        toolCalls: [{ toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a" } }],
      },
    ],
  }),
];

export const scenarios = [
  // -------------------------------------------------------------------------
  // What the part is made of
  // -------------------------------------------------------------------------
  {
    name: "what the part exports: each function's parameters, each class's parent and the methods other parts call",
    run: ({ client, converters, options }) => ({
      client: {
        stampImageDescriptionsOnMessage: signature(client.stampImageDescriptionsOnMessage),
        createProtoSessionProvider: signature(client.createProtoSessionProvider),
        ProtoPromptBuilder: classShape(client.ProtoPromptBuilder, ["replaceMessage", "appendMessages", "getState", "getMessages", "clearMessages"]),
        ProtoPromptExecutor: classShape(client.ProtoPromptExecutor, ["stream", "appendMessages", "getState", "getMessages", "clearMessages"]),
        ProtoPromptSession: classShape(client.ProtoPromptSession, ["getExecutor", "getModelId"]),
        ProtoSessionProvider: classShape(client.ProtoSessionProvider, ["getSession", "getProviderName", "getModelId", "getThinkingDetails"]),
      },
      converters: {
        applyToolCallArgs: signature(converters.applyToolCallArgs),
        toolCallArgsFromProto: signature(converters.toolCallArgsFromProto),
        coreMessageToProto: signature(converters.coreMessageToProto),
        protoStreamErrorToError: signature(converters.protoStreamErrorToError),
        buildStreamRequest: signature(converters.buildStreamRequest),
      },
      options: {
        getSimeonModelName: signature(options.getSimeonModelName),
        providerOptionsFromModelName: signature(options.providerOptionsFromModelName),
      },
    }),
  },
  {
    name: "the four keys a context is asked with: each is a name of its own with nothing as its value when unset",
    run: ({ client, context }) => {
      const names = ["requestIdKey", "conversationIdKey", "automationIdKey", "requestedModelKey"];
      const empty = context.createContext();
      const filled = empty.with(client.requestIdKey, "request-1").with(client.requestedModelKey, { modelId: "model-b" });
      const likeOne = context.createKey(Symbol("requestId"), undefined);
      return {
        keys: Object.fromEntries(names.map((name) => [name, { fields: Object.keys(client[name]), symbol: client[name].symbol, defaultValue: client[name].defaultValue }])),
        allDifferent: new Set(names.map((name) => client[name].symbol)).size,
        aKeyMadeTheSameWayIsAnotherKey: { sameFields: Object.keys(likeOne).join() === Object.keys(client.requestIdKey).join(), sameSymbol: likeOne.symbol === client.requestIdKey.symbol },
        "read from a context that has none": names.map((name) => empty.get(client[name])),
        "read from a context that has two": names.map((name) => filled.get(client[name])),
        "a key made the same way reads nothing": filled.get(likeOne),
      };
    },
  },
  {
    name: "the wire this part writes and reads: every message by name, each field with its number, and every list of kinds",
    run: ({ wire }) => {
      const what = (kind) => (kind.kind === "scalar" ? `scalar ${kind.T}` : kind.kind === "map" ? `map of scalar ${kind.K} to ${what(kind.V)}` : kind.T.typeName);
      return Object.fromEntries(
        Object.keys(wire)
          .sort()
          .map((name) => {
            const made = wire[name];
            if (typeof made !== "function") return [name, { kinds: Object.entries(made) }];
            return [
              name,
              {
                typeName: made.typeName,
                fields: made.fields.list().map((field) => ({
                  no: field.no,
                  name: field.name,
                  inPlainForm: field.jsonName,
                  inTheEngine: field.localName,
                  holds: what(field),
                  ...(field.repeated ? { repeated: true } : {}),
                  ...(field.opt ? { optional: true } : {}),
                  ...(field.oneof ? { oneOf: field.oneof.name } : {}),
                })),
              },
            ];
          }),
      );
    },
  },

  // -------------------------------------------------------------------------
  // The model's name on a piece of reasoning
  // -------------------------------------------------------------------------
  {
    name: "a model's name is read from a part's options only when it is a text",
    run: ({ options }) =>
      cases(
        {
          "no options": {},
          "options that are undefined": { providerOptions: undefined },
          "options that are null": { providerOptions: null },
          "options without ours": { providerOptions: { anthropic: { modelName: "elsewhere" } } },
          "ours as null": { providerOptions: { simeon: null } },
          "ours without a name": { providerOptions: { simeon: {} } },
          "a name": { providerOptions: { simeon: { modelName: "model-b" } } },
          "an empty name": { providerOptions: { simeon: { modelName: "" } } },
          "a name that is a number": { providerOptions: { simeon: { modelName: 4 } } },
          "a name that is null": { providerOptions: { simeon: { modelName: null } } },
          "a name that is a list": { providerOptions: { simeon: { modelName: ["model-b"] } } },
          "a name under the wire's own name": { providerOptions: { cursor: { modelName: "model-b" } } },
          "words in place of a part": "part",
          "a number in place of a part": 5,
          "nothing in place of a part": undefined,
          "null in place of a part": null,
        },
        (given) => attempt(() => options.getSimeonModelName(given)),
      ),
  },
  {
    name: "a model's name becomes a part's options, and no name becomes none",
    run: ({ options }) => {
      const first = options.providerOptionsFromModelName(undefined);
      const second = options.providerOptionsFromModelName(undefined);
      return {
        ...cases({ "no name": undefined, "a name": "model-b", "an empty name": "", "null": null, "zero": 0, "a record": { a: 1 } }, (name) => options.providerOptionsFromModelName(name)),
        "each answer is a new record": first !== second,
        "there and back": options.getSimeonModelName(options.providerOptionsFromModelName("model-c")),
      };
    },
  },

  // -------------------------------------------------------------------------
  // A tool call's arguments
  // -------------------------------------------------------------------------
  {
    name: "a tool call's arguments are put on the wire as fields when they are a record, as their text when they are anything else",
    run: ({ converters, wire }) =>
      cases(ARGUMENTS(), (given) =>
        cases(BESIDE, (beside) => {
          const call = new wire.InferenceToolCall({ toolCallId: "call-1", toolName: "Read" });
          try {
            const answered = converters.applyToolCallArgs(call, given, beside);
            return { answered, call: onTheWire(call), readBack: attempt(() => converters.toolCallArgsFromProto(call)) };
          } catch (error) {
            return { threw: told(error), callAfter: onTheWire(call) };
          }
        }),
      ),
  },
  {
    name: "arguments put twice on the same call: what the first left stays unless the second writes over it",
    run: ({ converters, wire }) => {
      const steps = {
        "fields, then words": [{ path: "/a" }, "ls"],
        "words, then fields": ["ls", { path: "/a" }],
        "fields with a text beside, then other fields without": [[{ path: "/a" }, "raw one"], { path: "/b" }],
        "words, then what cannot be put": ["ls", undefined],
      };
      return cases(steps, (list) => {
        const call = new wire.InferenceToolCall({ toolCallId: "call-1", toolName: "Read" });
        const after = list.map((step) => {
          const [given, beside] = Array.isArray(step) ? step : [step, undefined];
          const outcome = attempt(() => converters.applyToolCallArgs(call, given, beside));
          return { outcome, plain: attempt(() => call.toJson()) };
        });
        return { after, readBack: converters.toolCallArgsFromProto(call) };
      });
    },
  },
  {
    name: "a tool call read back: its fields when it has them, else its text, else an empty record",
    run: ({ converters, wire }) => {
      const fromPlain = (plainForm) => wire.InferenceToolCall.fromJson(plainForm);
      const withUnknown = wire.InferenceToolCall.fromBinary(
        Uint8Array.from([...words(1, "call-1"), ...words(2, "Read"), ...inside(3, entryOf("path", words(3, "/tmp/a")), entryOf("limit", double(2, 10))), ...words(15, "a field from later"), ...count(16, 7)]),
      );
      const onlyText = wire.InferenceToolCall.fromBinary(Uint8Array.from([...words(1, "call-2"), ...words(4, "ls -la"), ...words(99, "unknown")]));
      return {
        "fields": converters.toolCallArgsFromProto(fromPlain({ toolCallId: "c", toolName: "n", args: { path: "/a", deep: { list: [1, null, "x", true] } } })),
        "fields and a text: the fields": converters.toolCallArgsFromProto(fromPlain({ toolCallId: "c", toolName: "n", args: { path: "/a" }, rawToolCallArgs: "the text" })),
        "no fields at all, and a text: the empty fields": converters.toolCallArgsFromProto(fromPlain({ args: {}, rawToolCallArgs: "the text" })),
        "only a text": converters.toolCallArgsFromProto(fromPlain({ rawToolCallArgs: "ls -la" })),
        "only an empty text": converters.toolCallArgsFromProto(fromPlain({ rawToolCallArgs: "" })),
        "neither": converters.toolCallArgsFromProto(fromPlain({ toolCallId: "c", toolName: "n" })),
        "a new call": converters.toolCallArgsFromProto(new wire.InferenceToolCall()),
        "from bytes, with fields this engine does not know": { read: converters.toolCallArgsFromProto(withUnknown), plain: withUnknown.toJson(), bytesAgain: hex(withUnknown.toBinary()) },
        "from bytes, only a text": { read: converters.toolCallArgsFromProto(onlyText), plain: onlyText.toJson() },
        "what is no call of the wire": cases(
          {
            "an empty record": {},
            "fields and text both null": { args: null, rawToolCallArgs: null },
            "fields that answer null, and a text": { args: { toJson: () => null }, rawToolCallArgs: "the text" },
            "fields that answer zero": { args: { toJson: () => 0 }, rawToolCallArgs: "the text" },
            "a text that is zero": { rawToolCallArgs: 0 },
            "a text that is false": { rawToolCallArgs: false },
            "fields that cannot answer": { args: {}, rawToolCallArgs: "the text" },
            "nothing": undefined,
            "null": null,
          },
          (given) => attempt(() => converters.toolCallArgsFromProto(given)),
        ),
      };
    },
  },

  // -------------------------------------------------------------------------
  // A message in the wire's shape
  // -------------------------------------------------------------------------
  {
    name: "a person's message on the wire: words, pictures in every form, files by their name",
    run: ({ converters }) => cases(FROM_A_PERSON(), (message) => attempt(() => onTheWire(converters.coreMessageToProto(message)))),
  },
  {
    name: "a part's options on the wire: the cache asked of the first provider, and pictures' descriptions under the second's name",
    run: ({ converters }) =>
      cases(OPTIONS(), (given) =>
        attempt(() => {
          const onWords = converters.coreMessageToProto({ role: "user", content: [{ type: "text", text: "t", providerOptions: given }] });
          const onPicture = converters.coreMessageToProto({ role: "user", content: [{ type: "image", image: "https://example.test/p.png", providerOptions: given }] });
          const onResult = converters.coreMessageToProto({ role: "tool", content: [{ type: "tool-result", toolCallId: "c", toolName: "n", providerOptions: given }] });
          const held = onWords.content.value.parts[0].part.value.providerOptions;
          return {
            options: held === undefined ? "none" : onTheWire(held),
            onWords: carried(onWords),
            onPicture: carried(onPicture),
            onResult: { ...carried(onResult), fieldsOfTheResult: Object.keys(onResult.content.value.parts[0]) },
          };
        }),
      ),
  },
  {
    name: "an assistant's message on the wire: its words joined, its tool calls, its reasoning, and what the provider knows it by",
    run: ({ converters }) => cases(FROM_THE_ASSISTANT(), (message) => attempt(() => onTheWire(converters.coreMessageToProto(message)))),
  },
  {
    name: "a tool's message on the wire: each result, whether it failed, and the words and pictures beside it",
    run: ({ converters }) => cases(FROM_A_TOOL(), (message) => attempt(() => onTheWire(converters.coreMessageToProto(message)))),
  },
  {
    name: "the first words of a conversation on the wire, and messages of no kind the wire knows",
    run: ({ converters }) => cases(THE_REST(), (message) => attempt(() => onTheWire(converters.coreMessageToProto(message)))),
  },
  {
    name: "a message is made anew each time and the one given is left as it was",
    run: ({ converters }) => {
      const given = {
        role: "assistant",
        content: [
          { type: "text", text: "a" },
          { type: "tool-call", toolCallId: "c", toolName: "n", args: { list: [1, 2] } },
        ],
        providerOptions: { simeon: { openaiPhase: null } },
      };
      const before = JSON.stringify(given);
      const first = converters.coreMessageToProto(given);
      const second = converters.coreMessageToProto(given);
      first.toolCalls[0].toolName = "changed";
      return {
        untouched: JSON.stringify(given) === before,
        aNewMessageEachTime: first !== second,
        theSecondIsNotChangedWithTheFirst: second.toolCalls[0].toolName,
        sameBytes: hex(converters.coreMessageToProto(given).toBinary()) === hex(second.toBinary()),
      };
    },
  },
  {
    name: "messages inside the two requests that label a conversation go on the wire the same way",
    run: ({ converters, wire }) => {
      const messages = [
        { role: "user", content: "Rename the file." },
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Shell", args: { command: "mv a b" } }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Shell", result: "" }] },
        { role: "assistant", content: "Done." },
      ].map((message) => converters.coreMessageToProto(message));
      return {
        followUp: carried(new wire.AgentFollowupCategorizationRequest({ requestId: "request-2", replyingToRequestId: "request-1", messages, conversationId: "conversation-1", agentMode: "agent", modelName: "model-a" })),
        afterTheTurn: carried(new wire.AgentPostTurnLabelingRequest({ requestId: "request-2", messages, conversationId: "conversation-1", agentMode: "agent", modelName: "model-a" })),
      };
    },
  },

  // -------------------------------------------------------------------------
  // Tools and the request
  // -------------------------------------------------------------------------
  {
    name: "a tool the agent offers, on the wire: its name, what it is for, its parameters, and a format of its own",
    run: ({ converters }) =>
      cases(AGENT_TOOLS(), (tool) =>
        attempt(() => {
          const request = converters.buildStreamRequest({ messages: [], requestedModel: MODEL(), tools: [tool] });
          return onTheWire(request.tools[0]);
        }),
      ),
  },
  {
    name: "a tool the provider defines, on the wire: its name, its id, its kind and its options",
    run: ({ converters }) =>
      cases(PROVIDER_TOOLS(), (tool) =>
        attempt(() => {
          const request = converters.buildStreamRequest({ messages: [], requestedModel: MODEL(), providerDefinedTools: [tool] });
          return onTheWire(request.providerDefinedTools[0]);
        }),
      ),
  },
  {
    name: "the request on the wire: the least there can be, and everything at once",
    run: ({ converters }) => ({
      "the least there can be": onTheWire(converters.buildStreamRequest({ messages: [], requestedModel: { modelId: "model-a", parameters: [] } })),
      "everything at once": onTheWire(
        converters.buildStreamRequest({
          messages: [
            { role: "system", content: "You are a careful assistant." },
            { role: "user", content: [{ type: "text", text: "Read /tmp/a", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }] },
            { role: "assistant", content: [{ type: "reasoning", text: "A file.", signature: "s" }, { type: "tool-call", toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a" } }] },
            { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Read", result: "body" }] },
          ],
          requestedModel: { modelId: "model-a", maxMode: true, parameters: [{ id: "thinking", value: "high" }, { id: "fast", value: "false" }], builtInModel: true, isVariantStringRepresentation: true },
          tools: [{ name: "Read", description: "Reads a file.", parameters: { type: "object", properties: { path: { type: "string" } } } }],
          providerDefinedTools: [{ type: "provider-defined", id: "openai.web_search", name: "web_search", options: { searchContextSize: "low" } }],
          modelConfig: { maxTokens: 4096, temperature: 0.5, topP: 0.25, stopSequences: ["STOP", "\n\nHuman:"] },
          invocationId: "invocation-1",
          conversationId: "conversation-1",
          automationId: "automation-1",
          inferenceReason: 1,
          acceptedUnadvertisedToolNames: ["mcp_search", "mcp_fetch"],
        }),
      ),
    }),
  },
  {
    name: "the request, field by field: what is put in and what is left out",
    run: ({ converters }) => {
      const base = () => ({ messages: [{ role: "user", content: "Hi" }], requestedModel: MODEL() });
      const names = ["mcp_one", "mcp_two"];
      const withNames = converters.buildStreamRequest({ ...base(), acceptedUnadvertisedToolNames: names });
      return {
        ...cases(
          {
            "the model: only its id": { ...base(), requestedModel: { modelId: "model-z", parameters: [] } },
            "the model: no id": { ...base(), requestedModel: { parameters: [] } },
            "the model: every mark false": { ...base(), requestedModel: { modelId: "m", maxMode: false, parameters: [], builtInModel: false, isVariantStringRepresentation: false } },
            "the model: every mark true": { ...base(), requestedModel: { modelId: "m", maxMode: true, parameters: [], builtInModel: true, isVariantStringRepresentation: true } },
            "the model: parameters with more or less than an id and a value": { ...base(), requestedModel: { modelId: "m", parameters: [{ id: "a", value: "1", extra: true }, { id: "b" }, { value: "3" }, {}] } },
            "the model: no parameters at all": { ...base(), requestedModel: { modelId: "m" } },
            "the model: a parameter that is null": { ...base(), requestedModel: { modelId: "m", parameters: [null] } },
            "the model: missing": { messages: [] },
            "an id of the call": { ...base(), invocationId: "invocation-9" },
            "an empty id of the call": { ...base(), invocationId: "" },
            "the conversation's id": { ...base(), conversationId: "conversation-9" },
            "an empty conversation id": { ...base(), conversationId: "" },
            "the automation's id": { ...base(), automationId: "automation-9" },
            "an empty automation id": { ...base(), automationId: "" },
            "a reason": { ...base(), inferenceReason: 1 },
            "the reason that says none": { ...base(), inferenceReason: 0 },
            "a reason the wire has no name for": { ...base(), inferenceReason: 9 },
            "settings: all four": { ...base(), modelConfig: { maxTokens: 1000, temperature: 0, topP: 1, stopSequences: ["END"] } },
            "settings: an empty record": { ...base(), modelConfig: {} },
            "settings: only the most tokens": { ...base(), modelConfig: { maxTokens: 64000 } },
            "settings: the most tokens as zero": { ...base(), modelConfig: { maxTokens: 0 } },
            "settings: the most tokens as null": { ...base(), modelConfig: { maxTokens: null, temperature: null, topP: null, stopSequences: null } },
            "settings: more than the wire has": { ...base(), modelConfig: { maxTokens: 10, seed: 7 } },
            "settings: null": { ...base(), modelConfig: null },
            "settings: false": { ...base(), modelConfig: false },
            "names of tools taken though not offered": { ...base(), acceptedUnadvertisedToolNames: ["mcp_one", "mcp_two"] },
            "such names in a set": { ...base(), acceptedUnadvertisedToolNames: new Set(["mcp_b", "mcp_a"]) },
            "such names as null": { ...base(), acceptedUnadvertisedToolNames: null },
            "tools as null": { ...base(), tools: null, providerDefinedTools: null },
            "a tool that is null": { ...base(), tools: [null] },
            "a provider's tool that is null": { ...base(), providerDefinedTools: [null] },
            "a message that is null": { messages: [null], requestedModel: MODEL() },
            "two tools of each kind, in their order": {
              ...base(),
              tools: [{ name: "B", description: "b", parameters: {} }, { name: "A", description: "a", parameters: {} }],
              providerDefinedTools: [{ type: "provider-defined", id: "p.two", name: "two" }, { type: "provider-defined", id: "p.one", name: "one" }],
            },
            "no messages given": { requestedModel: MODEL() },
            "messages that are words": { messages: "Hi", requestedModel: MODEL() },
            "a message that cannot be put, before a model that is missing": { messages: [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "c", toolName: "n" }] }] },
            "a tool that cannot be put, before a model that is missing": { messages: [], tools: [{ name: "T", description: "d" }] },
            "nothing": undefined,
          },
          (given) => attempt(() => carried(converters.buildStreamRequest(given))),
        ),
        "the names on the request are a list of its own": withNames.acceptedUnadvertisedToolNames !== names && withNames.acceptedUnadvertisedToolNames.join() === names.join(),
      };
    },
  },

  // -------------------------------------------------------------------------
  // Errors that come down a stream
  // -------------------------------------------------------------------------
  {
    name: "an error that came down a stream becomes the engine's error for too much in, too much out, or a plain one",
    run: ({ converters, wire }) => cases(STREAM_ERRORS, (plainForm) => converters.protoStreamErrorToError(wire.InferenceStreamError.fromJson(plainForm))),
  },
  {
    name: "an error from bytes: a kind and fields this engine does not know, and what is no error of the wire",
    run: ({ converters, wire }) => {
      const laterKind = wire.InferenceStreamError.fromBinary(Uint8Array.from([...words(1, "A failure of a later kind."), ...words(2, "E42"), ...count(5, 42), ...words(9, "retry after 5s"), ...count(10, 5)]));
      const inByKind = wire.InferenceStreamError.fromBinary(Uint8Array.from([...words(1, "Too long."), ...count(5, 2)]));
      const outByMark = wire.InferenceStreamError.fromBinary(Uint8Array.from([...words(1, "Cut."), ...count(4, 1)]));
      const first = converters.protoStreamErrorToError(inByKind);
      return {
        "a kind from later": { read: laterKind.toJson(), error: converters.protoStreamErrorToError(laterKind) },
        "too much in, by its kind": { read: inByKind.toJson(), error: first },
        "too much out, by the older mark": { read: outByMark.toJson(), error: converters.protoStreamErrorToError(outByMark) },
        "a new error each time": converters.protoStreamErrorToError(inByKind) !== first,
        "what is no error of the wire": cases(
          {
            "a record marked too much in, with no sentence": { isInputTokenLimitError: true },
            "a record marked too much out, with no sentence": { isOutputTokenLimitError: true },
            "a record of the kind too much in, as a number": { errorType: 2, message: "By number." },
            "a record of the kind too much in, as words": { errorType: "INPUT_TOKEN_LIMIT", message: "By words." },
            "a record with only a sentence": { message: "Only a sentence." },
            "a record with no sentence": {},
            "an error of JavaScript": new Error("request size exceeds model context window"),
            "nothing": undefined,
          },
          (given) => attempt(() => converters.protoStreamErrorToError(given)),
        ),
      };
    },
  },

  // -------------------------------------------------------------------------
  // The builder, and descriptions of pictures written on a message
  // -------------------------------------------------------------------------
  {
    name: "a builder puts one message in the place of another it holds, told apart by being the very same object",
    run: ({ client }) => {
      const one = { role: "user", content: "one" };
      const two = { role: "assistant", content: "two" };
      const three = { role: "user", content: "three" };
      const builder = new client.ProtoPromptBuilder([one, two, one]);
      const steps = [];
      const step = (what, answered) => steps.push({ what, answered, messages: builder.getMessages() });
      step("a message it holds twice: only the first is replaced", builder.replaceMessage(one, three));
      step("a message that only looks like one it holds", builder.replaceMessage({ role: "assistant", content: "two" }, one));
      step("the message that was put in, replaced in turn", builder.replaceMessage(three, two));
      step("the same message again, which now stands first", builder.replaceMessage(two, one));
      step("a message by itself", builder.replaceMessage(one, one));
      step("undefined, which it does not hold", builder.replaceMessage(undefined, three));
      builder.appendMessages(undefined);
      step("undefined, once it was added", builder.replaceMessage(undefined, three));
      builder.clearMessages();
      step("anything, once it holds nothing", builder.replaceMessage(one, two));
      const empty = new client.ProtoPromptBuilder();
      return {
        steps,
        ownFields: Object.keys(builder),
        "made with nothing": { messages: empty.getMessages(), replaced: empty.replaceMessage(one, two) },
        "made with one message": new client.ProtoPromptBuilder(one).getMessages(),
        "what a builder gives is a copy": builder.getMessages() !== builder.getMessages(),
      };
    },
  },
  {
    name: "a picture's description is written on a person's message, in a copy, under the part's own name",
    run: ({ client }) => {
      const picture = (more = {}) => ({ type: "image", image: "https://example.test/p.png", ...more });
      const person = (content, more = {}) => ({ role: "user", content, ...more });
      const table = {
        "one picture, one description": [person([{ type: "text", text: "Look:" }, picture()]), [{ partIndex: 1, description: "A grey cat" }]],
        "two pictures, two descriptions, the second first": [person([picture(), { type: "text", text: "and" }, picture()]), [{ partIndex: 2, description: "Second" }, { partIndex: 0, description: "First" }]],
        "two descriptions of one picture: the last stays": [person([picture()]), [{ partIndex: 0, description: "Earlier" }, { partIndex: 0, description: "Later" }]],
        "a picture that has options of another provider": [person([picture({ providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } })]), [{ partIndex: 0, description: "Kept beside" }]],
        "a picture that has options of ours": [person([picture({ providerOptions: { simeon: { modelName: "m", imageDescription: "Old", imageDescriptions: { 0: "x" } }, zeta: 1 } })]), [{ partIndex: 0, description: "New" }]],
        "a picture whose options are null": [person([picture({ providerOptions: null })]), [{ partIndex: 0, description: "Over null" }]],
        "a picture whose own options of ours are words": [person([picture({ providerOptions: { simeon: "ab" } })]), [{ partIndex: 0, description: "Over words" }]],
        "an empty description": [person([picture()]), [{ partIndex: 0, description: "" }]],
        "a description that is missing": [person([picture()]), [{ partIndex: 0 }]],
        "a description for a result's picture: not for a person's message": [person([picture()]), [{ partIndex: 0, expContentIndex: 0, description: "Skipped" }]],
        "a description whose place inside a result is null": [person([picture()]), [{ partIndex: 0, expContentIndex: null, description: "Skipped as well" }]],
        "a place past the end": [person([picture()]), [{ partIndex: 1, description: "Nowhere" }]],
        "a place before the start": [person([picture()]), [{ partIndex: -1, description: "Nowhere" }]],
        "a place given as words": [person([picture()]), [{ partIndex: "0", description: "By words" }]],
        "a place that is missing": [person([picture()]), [{ description: "Nowhere" }]],
        "a place that holds words, not a picture": [person([{ type: "text", text: "words" }, picture()]), [{ partIndex: 0, description: "Not here" }]],
        "one that lands and one that does not": [person([{ type: "text", text: "words" }, picture()]), [{ partIndex: 0, description: "Not here" }, { partIndex: 1, description: "Here" }]],
        "no descriptions": [person([picture()]), []],
        "content that is words": [person("Just words"), [{ partIndex: 0, description: "Nowhere" }]],
        "content that is missing": [{ role: "user" }, [{ partIndex: 0, description: "Nowhere" }]],
        "more fields on the message": [person([picture()], { id: "m-1", providerOptions: { simeon: { a: 1 } } }), [{ partIndex: 0, description: "Kept" }]],
        "a list that holds null where the description points": [person([null]), [{ partIndex: 0, description: "Fails" }]],
        "no list of descriptions": [person([picture()]), undefined],
      };
      return cases(table, ([message, entries]) => {
        const before = JSON.stringify(message);
        return attempt(() => {
          const answered = client.stampImageDescriptionsOnMessage(message, entries);
          if (answered === undefined) return { answered, untouched: JSON.stringify(message) === before };
          return {
            answered,
            untouched: JSON.stringify(message) === before,
            aNewMessage: answered !== message,
            aNewList: answered.content !== message.content,
            partsThatAreTheSameObjects: answered.content.map((part, index) => part === message.content[index]),
          };
        });
      });
    },
  },
  {
    name: "a description of a picture inside a tool's result is written on that result, by the picture's place",
    run: ({ client }) => {
      const shot = (more = {}) => ({ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", experimental_content: [{ type: "text", text: "The screen:" }, { type: "image", data: "AAAA", mimeType: "image/png" }, { type: "image", data: "BBBB", mimeType: "image/png" }], ...more });
      const tool = (content, more = {}) => ({ role: "tool", content, ...more });
      const table = {
        "one picture of one result": [tool([shot()]), [{ partIndex: 0, expContentIndex: 1, description: "A login page" }]],
        "two pictures of one result, the second first": [tool([shot()]), [{ partIndex: 0, expContentIndex: 2, description: "Second" }, { partIndex: 0, expContentIndex: 1, description: "First" }]],
        "two descriptions of one picture: the last stays": [tool([shot()]), [{ partIndex: 0, expContentIndex: 1, description: "Earlier" }, { partIndex: 0, expContentIndex: 1, description: "Later" }]],
        "pictures of two results": [tool([shot(), shot({ toolCallId: "call-2" })]), [{ partIndex: 1, expContentIndex: 1, description: "Of the second" }, { partIndex: 0, expContentIndex: 2, description: "Of the first" }]],
        "a result that has descriptions already": [tool([shot({ providerOptions: { simeon: { imageDescriptions: { 2: "Was there", 7: "Stays" }, modelName: "m" }, anthropic: { cacheControl: { type: "ephemeral" } } } })]), [{ partIndex: 0, expContentIndex: 1, description: "Added" }, { partIndex: 0, expContentIndex: 2, description: "Written over" }]],
        "a result whose descriptions are null": [tool([shot({ providerOptions: { simeon: { imageDescriptions: null } } })]), [{ partIndex: 0, expContentIndex: 1, description: "Over null" }]],
        "a result whose options are null": [tool([shot({ providerOptions: null })]), [{ partIndex: 0, expContentIndex: 1, description: "Over null" }]],
        "an empty description": [tool([shot()]), [{ partIndex: 0, expContentIndex: 1, description: "" }]],
        "a description for a person's picture: not for a tool's message": [tool([shot()]), [{ partIndex: 0, description: "Skipped" }]],
        "a place inside the result that holds words": [tool([shot()]), [{ partIndex: 0, expContentIndex: 0, description: "Not a picture" }]],
        "a place inside the result past the end": [tool([shot()]), [{ partIndex: 0, expContentIndex: 3, description: "Nowhere" }]],
        "a place inside the result given as words": [tool([shot()]), [{ partIndex: 0, expContentIndex: "1", description: "By words" }]],
        "a place inside the result that is null": [tool([shot()]), [{ partIndex: 0, expContentIndex: null, description: "Null" }]],
        "a result past the end": [tool([shot()]), [{ partIndex: 4, expContentIndex: 1, description: "Nowhere" }]],
        "a part that is no result": [tool([{ type: "text", text: "x" }, shot()]), [{ partIndex: 0, expContentIndex: 1, description: "Not here" }]],
        "a result with nothing beside it": [tool([{ type: "tool-result", toolCallId: "c", toolName: "n", result: "x" }]), [{ partIndex: 0, expContentIndex: 0, description: "Nowhere" }]],
        "a result with words where the list beside it should be": [tool([{ type: "tool-result", toolCallId: "c", toolName: "n", experimental_content: "abc" }]), [{ partIndex: 0, expContentIndex: 0, description: "Nowhere" }]],
        "one that lands and one that does not": [tool([shot()]), [{ partIndex: 0, expContentIndex: 0, description: "Not a picture" }, { partIndex: 0, expContentIndex: 2, description: "Here" }]],
        "no descriptions": [tool([shot()]), []],
        "content that is words": [tool("words"), [{ partIndex: 0, expContentIndex: 1, description: "Nowhere" }]],
        "more fields on the message": [tool([shot()], { id: "t-1" }), [{ partIndex: 0, expContentIndex: 1, description: "Kept" }]],
        "a list that holds null where the description points": [tool([null]), [{ partIndex: 0, expContentIndex: 0, description: "Fails" }]],
      };
      return cases(table, ([message, entries]) => {
        const before = JSON.stringify(message);
        return attempt(() => {
          const answered = client.stampImageDescriptionsOnMessage(message, entries);
          if (answered === undefined) return { answered, untouched: JSON.stringify(message) === before };
          return {
            answered,
            untouched: JSON.stringify(message) === before,
            aNewMessage: answered !== message,
            partsThatAreTheSameObjects: answered.content.map((part, index) => part === message.content[index]),
            theListBesideIsTheSame: answered.content.map((part, index) => part?.experimental_content === message.content[index]?.experimental_content),
          };
        });
      });
    },
  },
  {
    name: "descriptions are written on no other kind of message",
    run: ({ client }) => {
      const content = () => [{ type: "image", image: "x" }, { type: "tool-result", toolCallId: "c", toolName: "n", experimental_content: [{ type: "image", data: "A" }] }];
      const entries = [{ partIndex: 0, description: "For a person" }, { partIndex: 1, expContentIndex: 0, description: "For a tool" }];
      return cases(
        {
          "an assistant's": { role: "assistant", content: content() },
          "the first words": { role: "system", content: content() },
          "a kind in capitals": { role: "USER", content: content() },
          "no kind": { content: content() },
          "no kind and no list": {},
          "words in place of a message": "message",
          "nothing in place of a message": undefined,
        },
        (message) => attempt(() => client.stampImageDescriptionsOnMessage(message, entries)),
      );
    },
  },

  // -------------------------------------------------------------------------
  // The provider, the session and the executor
  // -------------------------------------------------------------------------
  {
    name: "a provider of sessions says what it is and hands the session what it was made with",
    run: ({ client }) => {
      const connection = { stream: () => ({}) };
      const model = { modelId: "model-a", maxMode: true, parameters: [] };
      const config = { maxTokens: 5 };
      const provider = client.createProtoSessionProvider(connection, model, config, 1);
      const bare = client.createProtoSessionProvider(connection, model);
      const direct = new client.ProtoSessionProvider(connection, model, config, 1);
      const middleware = (executor) => executor;
      const session = provider.getSession(middleware);
      const plainSession = bare.getSession();
      return {
        isAProvider: provider instanceof client.ProtoSessionProvider,
        ownFields: { withEverything: Object.keys(provider), withTheLeast: Object.keys(bare), madeDirectly: Object.keys(direct) },
        holdsTheVeryThingsGiven: [provider.client === connection, provider.requestedModel === model, provider.modelConfig === config, provider.inferenceReason],
        providerName: provider.getProviderName(),
        modelId: provider.getModelId(),
        thinkingDetails: provider.getThinkingDetails(),
        session: {
          isASession: session instanceof client.ProtoPromptSession,
          aNewOneEachTime: provider.getSession(middleware) !== session,
          ownFields: Object.keys(session),
          holdsTheVeryThingsGiven: [session.client === connection, session.requestedModel === model, session.middleware === middleware, session.modelConfig === config, session.inferenceReason],
          modelId: session.getModelId(),
        },
        sessionWithTheLeast: { ownFields: Object.keys(plainSession), middleware: plainSession.middleware, modelConfig: plainSession.modelConfig, inferenceReason: plainSession.inferenceReason },
        "a model without an id": client.createProtoSessionProvider(connection, {}).getModelId(),
        "no model at all": {
          provider: attempt(() => client.createProtoSessionProvider(connection).getModelId()),
          session: attempt(() => client.createProtoSessionProvider(connection).getSession().getModelId()),
        },
      };
    },
  },
  {
    name: "a session makes an executor over what it is given: nothing, one message or a list, and puts its wrapper around it",
    run: ({ client }) => {
      const connection = { stream: () => ({}) };
      const model = MODEL();
      const one = { role: "user", content: "one" };
      const list = [one, { role: "assistant", content: "two" }];
      const session = new client.ProtoPromptSession(connection, model, undefined, { temperature: 0 }, 1);
      const fromNothing = session.getExecutor();
      const fromOne = session.getExecutor(one);
      const fromList = session.getExecutor(list);
      const wrapped = [];
      const wrappingSession = new client.ProtoPromptSession(connection, model, function wrapper(executor) {
        wrapped.push({ calledOnTheSession: this === wrappingSession, givenAnExecutor: executor instanceof client.ProtoPromptExecutor, messages: executor.getMessages(), parameters: arguments.length });
        return { wrapperOf: executor };
      });
      const throughWrapper = wrappingSession.getExecutor(list);
      const falseWrapper = new client.ProtoPromptSession(connection, model, 0).getExecutor();
      return {
        "from nothing": { isAnExecutor: fromNothing instanceof client.ProtoPromptExecutor, messages: fromNothing.getMessages(), ownFields: Object.keys(fromNothing) },
        "from one message": { messages: fromOne.getMessages(), holdsTheVeryMessage: fromOne.getMessages()[0] === one },
        "from a list": { messages: fromList.getMessages(), holdsTheVeryMessages: fromList.getMessages().every((message, index) => message === list[index]), aListOfItsOwn: fromList.getMessages() !== list },
        "a new executor each time": session.getExecutor() !== fromNothing,
        "what an executor holds": {
          builderIsABuilder: fromNothing.builder instanceof client.ProtoPromptBuilder,
          theSameBuilderUnderBothNames: fromNothing.builder === fromNothing.protoBuilder,
          theVeryThingsGiven: [fromNothing.client === connection, fromNothing.requestedModel === model, fromNothing.modelConfig, fromNothing.inferenceReason],
        },
        "with a wrapper": { wrapped, answersWhatTheWrapperGave: Object.keys(throughWrapper), holdsAnExecutor: throughWrapper.wrapperOf instanceof client.ProtoPromptExecutor },
        "with a wrapper that is zero": falseWrapper instanceof client.ProtoPromptExecutor,
        "with a wrapper that is words": attempt(() => new client.ProtoPromptSession(connection, model, "wrap").getExecutor()),
      };
    },
  },
  {
    name: "an executor keeps its messages in its builder: adding, reading, clearing",
    run: ({ client }) => {
      const builder = new client.ProtoPromptBuilder([{ role: "user", content: "one" }]);
      const executor = new client.ProtoPromptExecutor(builder, { stream: () => ({}) }, MODEL());
      const answered = executor.appendMessages({ role: "assistant", content: "two" });
      const alsoAnswered = executor.appendMessages([{ role: "user", content: "three" }, { role: "assistant", content: "four" }]);
      const held = executor.getMessages();
      const state = executor.getState();
      const replaced = builder.replaceMessage(held[1], { role: "assistant", content: "two, again" });
      const afterReplace = executor.getMessages();
      const cleared = executor.clearMessages();
      return {
        addingAnswersTheExecutor: answered === executor && alsoAnswered === executor,
        held,
        state,
        stateIsACopy: state !== held,
        replaced,
        afterReplace,
        cleared,
        afterClear: executor.getMessages(),
        builderAfterClear: builder.getMessages(),
        ownFields: Object.keys(executor),
        withTheLeast: Object.keys(new client.ProtoPromptExecutor(builder, undefined, undefined)),
      };
    },
  },

  // -------------------------------------------------------------------------
  // What a stream sends
  // -------------------------------------------------------------------------
  {
    name: "what a stream sends at once: the request, as its plain form and its bytes, and nothing in the headers when the context says nothing",
    run: (modules) => {
      const sent = whatIsSent(modules);
      const { connection, context, executor } = desk(modules);
      const result = executor.stream(context, undefined, undefined, {});
      return {
        ...sent,
        "what the stream is": Object.prototype.toString.call(result.fullStream),
        "the stream is its own reader": result.fullStream[Symbol.asyncIterator]() === result.fullStream,
        "what the rest are": PROMISES.map((name) => Object.prototype.toString.call(result[name])),
        "the request is a request of the wire": connection.calls[0].request.getType().typeName,
        "the headers are a plain record": Object.getPrototypeOf(connection.calls[0].options.headers) === Object.prototype,
      };
    },
  },
  {
    name: "what a stream sends: ids from the context, the call's id, the reason, and a model the context names in place of the executor's",
    run: (modules) => ({
      "a request id": whatIsSent(modules, { values: { requestId: "request-1" } }),
      "an empty request id": whatIsSent(modules, { values: { requestId: "" } }),
      "a request id that is a number": whatIsSent(modules, { values: { requestId: 7 } }),
      "a request id of zero": whatIsSent(modules, { values: { requestId: 0 } }),
      "a conversation and an automation": whatIsSent(modules, { values: { conversationId: "conversation-1", automationId: "automation-1" } }),
      "empty ids of both": whatIsSent(modules, { values: { conversationId: "", automationId: "" } }),
      "all three ids, the call's id and a reason": whatIsSent(modules, { values: { requestId: "request-1", conversationId: "conversation-1", automationId: "automation-1" }, reason: 1 }, { invocationId: "invocation-1" }),
      "an empty id of the call": whatIsSent(modules, {}, { invocationId: "" }),
      "the reason that says none": whatIsSent(modules, { reason: 0 }),
      "a model named by the context": whatIsSent(modules, { values: { requestedModel: { modelId: "model-from-context", maxMode: true, parameters: [{ id: "thinking", value: "high" }] } } }),
      "a model named by the context that has no parameters": whatIsSent(modules, { values: { requestedModel: { modelId: "model-from-context" } } }),
      "a model named as null by the context: the executor's": whatIsSent(modules, { values: { requestedModel: null } }),
      "an executor without a model": whatIsSent(modules, { model: null }),
      "an executor without a model, and one named by the context": whatIsSent(modules, { model: null, values: { requestedModel: MODEL() } }),
    }),
  },
  {
    name: "what a stream sends: the span of the context as two headers, when it has one",
    run: (modules) => {
      const ids = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331" };
      return {
        "a span that is sampled": whatIsSent(modules, { span: { ...ids, traceFlags: 1 } }),
        "a span that is not sampled": whatIsSent(modules, { span: { ...ids, traceFlags: 0 } }),
        "a span under which no spans are started": whatIsSent(modules, { span: { ...ids, traceFlags: 1 }, quiet: true }),
        "flags of two letters": whatIsSent(modules, { span: { ...ids, traceFlags: 171 } }),
        "flags of three letters": whatIsSent(modules, { span: { ...ids, traceFlags: 256 } }),
        "flags given as words": whatIsSent(modules, { span: { ...ids, traceFlags: "1" } }),
        "flags that are missing": whatIsSent(modules, { span: { ...ids } }, {}),
        "flags that are null": whatIsSent(modules, { span: { ...ids, traceFlags: null } }),
        "an id that cannot be written as words": whatIsSent(modules, { span: { traceId: Symbol("trace"), spanId: "b7ad6b7169203331", traceFlags: 1 } }),
        "ids that are missing": whatIsSent(modules, { span: { traceFlags: 1 } }),
        "a span and a request id": whatIsSent(modules, { span: { ...ids, traceFlags: 1 }, values: { requestId: "request-1" } }),
      };
    },
  },
  {
    name: "what a stream sends: the tools, sorted into the agent's and the provider's, and the names taken though not offered",
    run: (modules) => {
      const read = { name: "Read", description: "Reads a file.", parameters: { type: "object", properties: { path: { type: "string" } } } };
      const search = { type: "provider-defined", id: "openai.web_search", name: "web_search", options: { searchContextSize: "low" } };
      const typed = { type: "function", name: "Typed", description: "Has a kind that is not the provider's.", parameters: {} };
      return {
        "no tools": whatIsSent(modules, {}, { tools: undefined }),
        "an empty list": whatIsSent(modules, {}, { tools: [] }),
        "tools of both kinds, mixed": whatIsSent(modules, {}, { tools: [search, read, typed, { ...search, name: "second_search" }] }),
        "tools given as a set": whatIsSent(modules, {}, { tools: new Set([read, search]) }),
        "names taken though not offered": whatIsSent(modules, {}, { options: { acceptedUnadvertisedToolNames: ["mcp_one", "mcp_two"] } }),
        "a tool that is words": whatIsSent(modules, {}, { tools: ["Read"] }),
        "a tool that is null": whatIsSent(modules, {}, { tools: [null] }),
        "tools that are a number": whatIsSent(modules, {}, { tools: 5 }),
        "a tool whose parameters cannot be put": whatIsSent(modules, {}, { tools: [{ name: "T", description: "d" }] }),
      };
    },
  },
  {
    name: "what a stream sends: the settings the executor was made with, and the most tokens when the call names it",
    run: (modules) => ({
      "settings, and nothing named by the call": whatIsSent(modules, { config: { maxTokens: 1000, temperature: 0.5, topP: 0.9, stopSequences: ["END"] } }),
      "settings, and the most tokens named by the call": whatIsSent(modules, { config: { maxTokens: 1000, temperature: 0.5, topP: 0.9, stopSequences: ["END"] } }, { options: { maxTokens: 64 } }),
      "no settings, and the most tokens named by the call": whatIsSent(modules, {}, { options: { maxTokens: 64 } }),
      "the most tokens named as zero": whatIsSent(modules, { config: { maxTokens: 1000 } }, { options: { maxTokens: 0 } }),
      "the most tokens named as null: the settings lose theirs": whatIsSent(modules, { config: { maxTokens: 1000, temperature: 0.5 } }, { options: { maxTokens: null } }),
      "the most tokens named as undefined: the settings keep theirs": whatIsSent(modules, { config: { maxTokens: 1000 } }, { options: { maxTokens: undefined } }),
      "no settings and nothing named": whatIsSent(modules, {}, { options: {} }),
      "more named by the call than the part reads": whatIsSent(modules, {}, { options: { temperature: 1, maxTokens: 8, other: true } }),
    }),
  },
  {
    name: "what a stream sends: the messages the builder holds at that moment",
    run: (modules) => {
      const at = desk(modules, {
        messages: [
          { role: "system", content: "You are a careful assistant." },
          { role: "user", content: [{ type: "text", text: "What is in this file?" }, { type: "file", name: "report.pdf" }, { type: "image", image: Uint8Array.from([1, 2, 3]) }] },
        ],
      });
      at.executor.stream(at.context, undefined, undefined, {});
      at.executor.appendMessages({ role: "assistant", content: "It is a report." });
      at.executor.stream(at.context, undefined, undefined, {});
      at.executor.clearMessages();
      at.executor.stream(at.context, undefined, undefined, {});
      return { sent: at.connection.sent, aNewRecordOfHeadersEachTime: at.connection.calls[0].options.headers !== at.connection.calls[1].options.headers };
    },
  },
  {
    name: "a stream that cannot start: no options, a connection that refuses, a message that cannot be put",
    run: (modules) => {
      const refusing = desk(modules, {
        connection: {
          stream() {
            throw new Error("the connection is closed");
          },
        },
      });
      const noConnection = desk(modules, { connection: undefined });
      return {
        "no options at all": whatIsSent(modules, { values: { requestId: "request-1" } }, { options: undefined }),
        "options that are null": whatIsSent(modules, {}, { options: null }),
        "a connection that refuses": attempt(() => refusing.executor.stream(refusing.context, undefined, undefined, {})),
        "what the context was asked before the connection refused": refusing.asked,
        "no connection": attempt(() => noConnection.executor.stream(noConnection.context, undefined, undefined, {})),
        "a message that cannot be put": whatIsSent(modules, { messages: [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "c", toolName: "n", args: undefined }] }] }),
        "no context": attempt(() => desk(modules).executor.stream(undefined, undefined, undefined, {})),
      };
    },
  },

  // -------------------------------------------------------------------------
  // Reading the stream
  // -------------------------------------------------------------------------
  {
    name: "a whole answer read piece by piece: what the reader gets, when each promise ends, and what each holds",
    run: async (modules) => {
      const { events, promises, standIns, sent, contextAsked } = await exchange(modules, { scripts: [WHOLE_ANSWER()], values: { requestId: "request-1" } });
      return { sent, contextAsked, events, promises, standIns };
    },
  },
  {
    name: "nothing is asked of the connection's stream, and no promise ends, until the stream is read",
    run: async (modules) => {
      const unread = await exchange(modules, { scripts: [WHOLE_ANSWER()] }, { read: "never" });
      return { events: unread.events, promises: unread.promises, callsOfTheConnection: unread.sent.length, standIns: unread.standIns };
    },
  },
  {
    name: "pieces of words: each becomes a part, an empty one becomes none, and the last one ends the answer whatever it holds",
    run: (modules) =>
      casesInTurn(
        {
          "words": [text("Hello")],
          "words in three pieces": [text("Hel"), text("lo"), text("!")],
          "no words": [text("")],
          "a piece with nothing in it": [{ plain: { textPart: {} } }],
          "spaces and a new line": [text(" \n")],
          "the last piece": [lastText()],
          "the last piece, holding words": [lastText({ text: "dropped" })],
          "words after the last piece": [text("a"), lastText(), text("b"), lastText()],
        },
        (pieces) => partsFor(modules, pieces),
      ),
  },
  {
    name: "pieces of thinking: words and a signature each become a part, words first",
    run: (modules) =>
      casesInTurn(
        {
          "words": [thinking({ text: "Hm." })],
          "a signature": [thinking({ signature: "sig-1" })],
          "words and a signature": [thinking({ text: "Hm.", signature: "sig-1" })],
          "neither": [thinking({})],
          "empty words and an empty signature": [thinking({ text: "", signature: "" })],
          "marked as the last": [thinking({ text: "Done thinking.", isFinal: true })],
          "marked as the last and empty": [thinking({ isFinal: true })],
        },
        (pieces) => partsFor(modules, pieces),
      ),
  },
  {
    name: "pieces of a tool call: its start, more of its arguments, and the whole call with its arguments read",
    run: (modules) =>
      casesInTurn(
        {
          "a start": [toolCall({ toolCallId: "call-1", toolName: "Read" })],
          "a start that holds arguments": [toolCall({ toolCallId: "call-1", toolName: "Read", args: '{"pa' })],
          "a start with its place among the calls": [toolCall({ toolCallId: "call-1", toolName: "Read", toolIndex: 2 })],
          "more arguments": [toolCall({ toolCallId: "call-1", args: 'th":"/tmp/a"}' })],
          "more arguments, empty": [toolCall({ toolCallId: "call-1" })],
          "more arguments, with no id": [toolCall({ args: "x" })],
          "the whole call": [toolCall({ toolCallId: "call-1", toolName: "Read", args: '{"path":"/tmp/a","limit":5}', isComplete: true })],
          "the whole call, arguments that are not JSON": [toolCall({ toolCallId: "call-1", toolName: "Read", args: '{"path":', isComplete: true })],
          "the whole call, no arguments": [toolCall({ toolCallId: "call-1", toolName: "Now", isComplete: true })],
          "the whole call, arguments that are a list": [toolCall({ toolCallId: "call-1", toolName: "Many", args: "[1,2]", isComplete: true })],
          "the whole call, arguments that are words": [toolCall({ toolCallId: "call-1", toolName: "Shell", args: '"ls"', isComplete: true })],
          "the whole call, arguments that are null": [toolCall({ toolCallId: "call-1", toolName: "Shell", args: "null", isComplete: true })],
          "the whole call, arguments that are a number": [toolCall({ toolCallId: "call-1", toolName: "Shell", args: "5", isComplete: true })],
          "the whole call, arguments with spaces around": [toolCall({ toolCallId: "call-1", toolName: "Shell", args: ' {"a": 1} ', isComplete: true })],
          "the whole call, a field written twice": [toolCall({ toolCallId: "call-1", toolName: "Shell", args: '{"a":1,"a":2,"__proto__":{"b":3}}', isComplete: true })],
          "the whole call, with no name and no id": [toolCall({ args: "{}", isComplete: true })],
          "a call in pieces, then whole": [toolCall({ toolCallId: "call-1", toolName: "Read" }), toolCall({ toolCallId: "call-1", args: '{"path":' }), toolCall({ toolCallId: "call-1", args: '"/a"}' }), toolCall({ toolCallId: "call-1", toolName: "Read", args: '{"path":"/a"}', isComplete: true })],
        },
        (pieces) => partsFor(modules, pieces),
      ),
  },
  {
    name: "the counts of tokens: the first that comes is the one kept, and a total that is not said is zero",
    run: async (modules) => ({
      usage: await casesInTurn(
        {
          "all three": [usage({ promptTokens: 12, completionTokens: 34, totalTokens: 46 })],
          "no total": [usage({ promptTokens: 12, completionTokens: 34 })],
          "a total of zero": [usage({ promptTokens: 12, completionTokens: 34, totalTokens: 0 })],
          "nothing said": [usage({})],
          "twice": [usage({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }), usage({ promptTokens: 9, completionTokens: 9, totalTokens: 18 })],
          "never": [text("a")],
        },
        (pieces) => endOf(modules, "usage", pieces),
      ),
      extendedUsage: await casesInTurn(
        {
          "all five": [moreUsage({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 10, maxTokens: 200000 })],
          "nothing said": [moreUsage({})],
          "twice": [moreUsage({ inputTokens: 1 }), moreUsage({ inputTokens: 2 })],
          "never": [text("a")],
        },
        (pieces) => endOf(modules, "extendedUsage", pieces),
      ),
    }),
  },
  {
    name: "what the provider adds and the id of the call: handed on as they come",
    run: async (modules) => ({
      providerMetadata: await casesInTurn(
        {
          "a record": [metadata({ metadata: { anthropic: { cacheCreationInputTokens: 10, container: null, list: [1, "a", true] } } })],
          "an empty record": [metadata({ metadata: {} })],
          "nothing inside": [metadata({})],
          "twice": [metadata({ metadata: { first: true } }), metadata({ metadata: { second: true } })],
          "never": [text("a")],
        },
        (pieces) => endOf(modules, "providerMetadata", pieces),
      ),
      invocationId: await casesInTurn(
        {
          "an id": [invocation("invocation-from-server")],
          "an empty id": [invocation("")],
          "twice": [invocation("first"), invocation("second")],
        },
        (pieces) => endOf(modules, "invocationId", pieces),
      ),
      "an id that never comes is drawn at random, once": await (async () => {
        const { promises, standIns } = await exchange(modules, { scripts: [[text("a")]] });
        return { invocationId: promises.invocationId, standIns };
      })(),
    }),
  },
  {
    name: "what is known of the answer: its id, its model, when it was made, and an error said in words",
    run: (modules) =>
      casesInTurn(
        {
          "the least there can be": [info({})],
          "an id, a model and a time": [info({ id: "answer-1", model: "model-a-2026", createdAt: "1767225600000" })],
          "a time of zero": [info({ id: "a", createdAt: "0" })],
          "a time before 1970": [info({ id: "a", createdAt: "-1000" })],
          "a time past what a date holds": [info({ id: "a", createdAt: "8640000000000001" })],
          "a time too large for a number": [info({ id: "a", createdAt: "9007199254740993" })],
          "an error in words": [info({ id: "a", errorMessage: "The provider hung up." })],
          "an error that says too much went in": [info({ id: "a", errorMessage: "This request would exceed the limit: prompt is too long" })],
          "an error that says too much came out": [info({ id: "a", errorMessage: "Exceeded max output tokens" })],
          "an empty error": [info({ id: "a", errorMessage: "" })],
          "twice": [info({ id: "first" }), info({ id: "second" })],
        },
        (pieces) => endOf(modules, "response", pieces),
      ),
  },
  {
    name: "the messages of the answer: an assistant's reasoning, then its words, then its tool calls; a tool's results",
    run: (modules) => {
      const messages = (...list) => [info({ id: "answer-1", messages: list })];
      const assistant = (fields) => ({ id: "msg-1", role: "INFERENCE_MESSAGE_ROLE_ASSISTANT", ...fields });
      const tool = (fields) => ({ id: "msg-2", role: "INFERENCE_MESSAGE_ROLE_TOOL", ...fields });
      return casesInTurn(
        {
          "words": messages(assistant({ content: "Here you are." })),
          "no words": messages(assistant({ content: "" })),
          "nothing at all": messages(assistant({})),
          "reasoning": messages(assistant({ reasoningParts: [{ text: "Let me think." }] })),
          "reasoning with its signature": messages(assistant({ reasoningParts: [{ text: "Let me think.", signature: "sig-1" }] })),
          "reasoning with an empty signature": messages(assistant({ reasoningParts: [{ text: "Let me think.", signature: "" }] })),
          "reasoning with the model's name": messages(assistant({ reasoningParts: [{ text: "Let me think.", modelName: "model-b" }] })),
          "reasoning with its signature and the model's name": messages(assistant({ reasoningParts: [{ text: "Let me think.", signature: "sig-1", modelName: "model-b" }] })),
          "reasoning with an empty model's name": messages(assistant({ reasoningParts: [{ text: "Hm.", modelName: "" }] })),
          "reasoning that was hidden": messages(assistant({ reasoningParts: [{ isRedacted: true, redactedData: "b3BhcXVl" }] })),
          "reasoning that was hidden, without its data": messages(assistant({ reasoningParts: [{ isRedacted: true }] })),
          "reasoning that was hidden, with words, a signature and the model's name": messages(assistant({ reasoningParts: [{ isRedacted: true, redactedData: "AAAA", text: "dropped", signature: "dropped", modelName: "model-b" }] })),
          "a tool call with fields": messages(assistant({ toolCalls: [{ toolCallId: "call-1", toolName: "Read", args: { path: "/tmp/a", list: [1, null] } }] })),
          "a tool call with a text": messages(assistant({ toolCalls: [{ toolCallId: "call-1", toolName: "Shell", rawToolCallArgs: "ls -la" }] })),
          "a tool call with fields and a text": messages(assistant({ toolCalls: [{ toolCallId: "call-1", toolName: "Read", args: { path: "/a" }, rawToolCallArgs: '{"path": "/a"}' }] })),
          "a tool call with neither": messages(assistant({ toolCalls: [{ toolCallId: "call-1", toolName: "Now" }] })),
          "everything: the order they are handed on in": messages(
            assistant({
              toolCalls: [{ toolCallId: "call-1", toolName: "Read", args: { path: "/a" } }, { toolCallId: "call-2", toolName: "Shell", rawToolCallArgs: "pwd" }],
              content: "I will read the file.",
              reasoningParts: [{ isRedacted: true, redactedData: "AAAA" }, { text: "First the file.", signature: "s" }],
            }),
          ),
          "a tool's results": messages(
            tool({
              toolResult: {
                parts: [
                  { toolCallId: "call-1", toolName: "Read", result: { content: [{ type: "text", text: "body" }] } },
                  { toolCallId: "call-2", toolName: "Shell", result: "exit 1", isError: true },
                  { toolCallId: "call-3", toolName: "Count", result: 3, isError: false },
                  { toolCallId: "call-4", toolName: "Check", result: null },
                  { toolCallId: "call-5", toolName: "List", result: [1, "two"] },
                  { toolCallId: "call-6", toolName: "Quiet" },
                  { toolCallId: "call-7", toolName: "Flag", result: false },
                ],
              },
            }),
          ),
          "a tool's message with no results": messages(tool({ toolResult: { parts: [] } })),
          "a tool's message with nothing": messages(tool({})),
          "a tool's message that holds words and tool calls": messages(tool({ content: "dropped", toolCalls: [{ toolCallId: "c", toolName: "n" }], reasoningParts: [{ text: "dropped" }] })),
          "a person's message: handed on as the assistant's": messages({ id: "msg-3", role: "INFERENCE_MESSAGE_ROLE_USER", content: "From a person." }),
          "the first words: handed on as the assistant's": messages({ id: "msg-4", role: "INFERENCE_MESSAGE_ROLE_SYSTEM", content: "First words." }),
          "a message of no kind: handed on as the assistant's": messages({ id: "msg-5", content: "No kind.", toolResult: { parts: [{ toolCallId: "c", toolName: "n", result: "dropped" }] } }),
          "an assistant's and a tool's, in their order": messages(assistant({ content: "One." }), tool({ toolResult: { parts: [{ toolCallId: "c", toolName: "n", result: "r" }] } }), assistant({ id: "msg-9", content: "Two." })),
        },
        (pieces) => endOf(modules, "response", pieces),
      );
    },
  },
  {
    name: "what else comes with the answer: lists of numbers for each token, each handed on only when it holds something",
    run: async (modules) => {
      const extra = (fields) => [info({ id: "answer-1", inferenceExtraData: fields })];
      const table = await casesInTurn(
        {
          "all six lists": extra({
            tokenLogprobs: [{ values: [-0.25, -1.5] }, { values: [] }, { values: [0] }],
            tokenIds: [{ values: ["1", "2", "9007199254740993"] }, { values: [] }],
            promptTokenIds: [{ values: ["7"] }],
            extraTokens: [{ values: ["-3", "0"] }],
            extraLogprobs: [{ values: [-2] }],
            routingMatrix: [{ values: ["a", "", "b"] }, { values: [] }, { values: [""] }],
          }),
          "none of the lists": extra({}),
          "only the first": extra({ tokenLogprobs: [{ values: [-0.5] }] }),
          "only the last": extra({ routingMatrix: [{ values: ["only"] }] }),
          "lists that hold empty lists": extra({ tokenLogprobs: [{}], tokenIds: [{}], promptTokenIds: [{}], extraTokens: [{}], extraLogprobs: [{}], routingMatrix: [{}] }),
          "no such record": [info({ id: "answer-1" })],
        },
        (pieces) => endOf(modules, "response", pieces),
      );
      const piece = modules.wire.InferenceStreamResponse.fromJson({ responseInfo: { id: "a", inferenceExtraData: { tokenLogprobs: [{ values: [-1] }], tokenIds: [{ values: ["5"] }], routingMatrix: [{ values: ["x"] }] } } });
      const { promises } = await exchange(modules, { scripts: [[{ made: piece }]] });
      const handed = promises.response.resolved.inferenceExtraData;
      const onTheWireItself = piece.response.value.inferenceExtraData;
      return {
        ...table,
        "which lists are the wire's own, not copies": {
          tokenLogprobs: handed.tokenLogprobs[0] === onTheWireItself.tokenLogprobs[0].values,
          tokenIds: handed.tokenIds[0] === onTheWireItself.tokenIds[0].values,
          routingMatrix: handed.routingMatrix[0] === onTheWireItself.routingMatrix[0].values,
        },
      };
    },
  },
  {
    name: "a stream that ends with nothing said: each promise gets a value of its own, the clock and the random id asked once each",
    run: async (modules) => {
      const empty = await exchange(modules, { scripts: [[]] });
      const onlyWords = await exchange(modules, { scripts: [[text("Hi"), lastText()]] });
      const allSaid = await exchange(modules, { scripts: [[invocation("i"), usage({}), moreUsage({}), metadata({}), info({ id: "a" })]] });
      const allButTheTime = await exchange(modules, { scripts: [[invocation("i"), usage({}), moreUsage({}), metadata({})]] });
      return {
        "no pieces at all": { events: empty.events, promises: empty.promises, standIns: empty.standIns, fieldsOfTheAnswer: Object.keys(empty.promises.response.resolved) },
        "only words and their end": { parts: onlyWords.parts, promises: onlyWords.promises, standIns: onlyWords.standIns },
        "everything said": { standIns: allSaid.standIns, fieldsOfTheAnswer: Object.keys(allSaid.promises.response.resolved) },
        "everything said but what is known of the answer": { response: allButTheTime.promises.response, standIns: allButTheTime.standIns },
      };
    },
  },
  {
    name: "an error piece in the stream: the reader gets it as a part, reading goes on, and at the end the stream throws it",
    run: async (modules) => {
      const kept = (run) => ({ events: run.events, promises: run.promises, standIns: run.standIns });
      const middle = await exchange(modules, { scripts: [[text("Hel"), failure({ message: "Slow down.", code: "429", errorType: "INFERENCE_STREAM_ERROR_TYPE_RATE_LIMIT" }), text("lo"), usage({ promptTokens: 3, completionTokens: 1, totalTokens: 4 })]] });
      const errorPart = middle.parts.find((one) => one.type === "error").error;
      const twice = await exchange(modules, { scripts: [[failure({ message: "The first." }), failure({ message: "prompt is too long" })]] });
      const afterAll = await exchange(modules, { scripts: [[invocation("i"), usage({}), moreUsage({}), metadata({}), info({ id: "a" }), failure({ message: "Late.", isOutputTokenLimitError: true })]] });
      const alone = await exchange(modules, { scripts: [[failure({ message: "exceeded max output tokens" })]] });
      return {
        "in the middle": {
          ...kept(middle),
          thePartsErrorIsTheOneThrown: errorPart === middle.thrown,
          thePartsErrorIsLikeTheOneThrown: errorPart.message === middle.thrown.message && errorPart.constructor === middle.thrown.constructor,
          promisesThatHoldTheVeryErrorThrown: Object.keys(middle.reasons).filter((name) => middle.reasons[name] === middle.thrown),
        },
        "two errors: the last is the one thrown": kept(twice),
        "after everything was said: every promise keeps its value": kept(afterAll),
        "nothing but an error": kept(alone),
      };
    },
  },
  {
    name: "a connection that fails while it is read: every promise still waiting fails with what it threw, and so does the stream",
    run: async (modules) => {
      const kept = (run) => ({ events: run.events, promises: run.promises, standIns: run.standIns, promisesThatHoldTheVeryErrorThrown: Object.keys(run.reasons).filter((name) => run.reasons[name] === run.thrown) });
      const failures = {
        "an error, before any piece": [{ fails: new Error("socket hang up") }],
        "an error, after words and the counts": [text("Hel"), usage({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }), { fails: Object.assign(new Error("[unavailable] upstream connect error"), { name: "ConnectError", code: 14 }) }],
        "an error of a kind of its own": [{ fails: new RangeError("too far") }],
        "words in place of an error": [{ fails: "just words" }],
        "a record in place of an error": [{ fails: { code: 503 } }],
        "nothing in place of an error": [{ fails: undefined }],
        "null in place of an error": [{ fails: null }],
        "a sentence that says too much went in": [{ fails: new Error("prompt is too long") }],
        "an error piece, then the connection fails: the connection's is thrown": [failure({ message: "From the server." }), { fails: new Error("then the socket") }],
        "after everything was said": [invocation("i"), usage({}), moreUsage({}), metadata({}), info({ id: "a" }), { fails: new Error("late") }],
      };
      const out = await casesInTurn(failures, async (pieces) => kept(await exchange(modules, { scripts: [pieces] })));
      const given = new Error("the very error");
      const same = await exchange(modules, { scripts: [[{ fails: given }]] });
      const notAStream = desk(modules, { connection: { stream: () => undefined } });
      const noStream = await withStandIns(() => ask(notAStream));
      return {
        ...out,
        "an error is thrown as it is, not wrapped": same.thrown === given,
        "a connection that answers nothing in place of a stream": { promises: noStream.promises, events: notAStream.events },
      };
    },
  },
  {
    name: "a piece the part cannot work with: what is thrown while reading it fails the stream the same way",
    run: async (modules) => {
      const kept = (run) => ({ events: run.events, promises: run.promises });
      return {
        "a piece that is null": kept(await exchange(modules, { scripts: [[text("a"), { made: null }, text("never read")]] })),
        "a piece with nothing inside": kept(await exchange(modules, { scripts: [[{ made: {} }]] })),
        "a piece of a kind this engine does not know, in a record": kept(await exchange(modules, { scripts: [[{ made: { response: { case: "audioPart", value: { data: "AAAA" } } } }, text("read on")]] })),
        "a piece with no kind": kept(await exchange(modules, { scripts: [[{ made: new modules.wire.InferenceStreamResponse() }, text("read on")]] })),
        "what is known of the answer, without its lists": kept(await exchange(modules, { scripts: [[{ made: { response: { case: "responseInfo", value: { id: "a", model: "m", createdAt: 5n } } } }]] })),
        "descriptions that are no list": kept(await exchange(modules, { scripts: [[{ made: { response: { case: "imageDescriptions", value: {} } } }]] })),
      };
    },
  },
  {
    name: "a cancel: the connection is handed the context's signal, and what it throws when canceled fails the stream",
    run: async (modules) => {
      const kept = (run) => ({ events: run.events, promises: run.promises, signalAbortedWhenSent: run.sent.map((one) => one.signalAborted) });
      const during = desk(modules, { scripts: [[text("Hel"), { waitsForCancel: true }, text("never read")]] });
      const whileReading = await withStandIns(() => ask(during, { read: { before: (got) => (got === 1 ? during.cancel(new Error("the person pressed stop")) : undefined) } }));
      const before = desk(modules, { scripts: [[{ waitsForCancel: true }]] });
      before.cancel("stopped before it began");
      const fromTheStart = await withStandIns(() => ask(before));
      const deaf = desk(modules, { scripts: [[text("Hel"), text("lo"), lastText()]] });
      const notHeard = await withStandIns(() => ask(deaf, { read: { before: (got) => (got === 1 ? deaf.cancel(new Error("stop")) : undefined) } }));
      return {
        "while reading": { ...kept({ ...whileReading, events: during.events, sent: during.connection.sent }), theSignalIsTheContexts: during.connection.calls[0].options.signal === during.real.signal },
        "before the call": kept({ ...fromTheStart, events: before.events, sent: before.connection.sent }),
        "a connection that does not listen: the part itself stops nothing": kept({ ...notHeard, events: deaf.events, sent: deaf.connection.sent }),
      };
    },
  },
  {
    name: "a reader that stops early: the connection's stream is told to stop and the promises still waiting are left waiting",
    run: async (modules) => {
      const pieces = () => [invocation("inv-1"), text("Hel"), text("lo"), usage({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }), lastText()];
      const kept = (run) => ({ events: run.events, promises: run.promises, standIns: run.standIns });
      const afterOne = await exchange(modules, { scripts: [pieces()] }, { read: { stopAfter: 1 } });
      const atOnce = await exchange(modules, { scripts: [pieces()] }, { read: { stopAfter: 0 } });
      const thrown = new Error("the reader gave up");
      const throwsIn = await exchange(modules, { scripts: [pieces()] }, { read: { throwAfter: 1, thrown } });
      const throwsInAtOnce = await exchange(modules, { scripts: [pieces()] }, { read: { throwAfter: 0, thrown: new Error("before the first part") } });
      const throwsWords = await exchange(modules, { scripts: [pieces()] }, { read: { throwAfter: 2, thrown: "words thrown in" } });
      return {
        "stops after one part": kept(afterOne),
        "stops before reading": kept(atOnce),
        "throws into the stream after one part": { ...kept(throwsIn), promisesThatHoldTheVeryErrorThrownIn: Object.keys(throwsIn.reasons).filter((name) => throwsIn.reasons[name] === thrown), theReaderIsThrownTheSameError: throwsIn.thrown === thrown },
        "throws into the stream before reading": kept(throwsInAtOnce),
        "throws words into the stream after two parts": kept(throwsWords),
      };
    },
  },
  {
    name: "a stream read to its end, then asked again: it has nothing more to give",
    run: async (modules) => {
      const run = await exchange(modules, { scripts: [[text("Hi"), lastText()]] });
      const again = await run.result.fullStream.next();
      const andAgain = [];
      for await (const part of run.result.fullStream) andAgain.push(part);
      const afterError = await exchange(modules, { scripts: [[{ fails: new Error("down") }]] });
      const againAfterError = await afterError.result.fullStream.next();
      return { parts: run.parts, again, andAgain, "after a stream that threw": againAfterError, callsOfTheConnection: run.sent.length };
    },
  },
  {
    name: "a retry: the same executor asked again sends the same request again, and each call has promises of its own",
    run: async (modules) => {
      const at = desk(modules, {
        messages: [{ role: "user", content: "Say hello." }],
        values: { requestId: "request-1", conversationId: "conversation-1" },
        scripts: [
          [text("Hel"), { fails: Object.assign(new Error("[unavailable] 503"), { name: "ConnectError", code: 14 }) }],
          [text("Hello."), lastText(), usage({ promptTokens: 4, completionTokens: 2, totalTokens: 6 }), info({ id: "answer-2", model: "model-a" })],
        ],
      });
      return withStandIns(async (standIns) => {
        const first = await ask(at);
        const second = await ask(at);
        return {
          sent: at.connection.sent,
          theSameBytesBothTimes: at.connection.sent[0].request.bytes === at.connection.sent[1].request.bytes,
          aNewRequestEachTime: at.connection.calls[0].request !== at.connection.calls[1].request,
          events: at.events,
          first: first.promises,
          second: second.promises,
          messagesHeldAfter: at.executor.getMessages(),
          standIns: { ...standIns },
        };
      });
    },
  },
  {
    name: "two streams of one executor read in turns: each reads its own connection",
    run: async (modules) => {
      const at = desk(modules, { scripts: [[text("one-a"), text("one-b"), lastText()], [text("two-a"), text("two-b"), lastText()]] });
      return withStandIns(async () => {
        const first = at.executor.stream(at.context, "first", undefined, {});
        const second = at.executor.stream(at.context, "second", undefined, {});
        watch(first, at.events);
        watch(second, at.events);
        const got = [];
        for (let i = 0; i < 4; i += 1) {
          const a = await first.fullStream.next();
          got.push({ from: "first", ...a });
          const b = await second.fullStream.next();
          got.push({ from: "second", ...b });
        }
        await turn();
        return { got, idsOfTheCalls: at.connection.sent.map((one) => one.request.plain.invocationId) };
      });
    },
  },

  // -------------------------------------------------------------------------
  // Descriptions of pictures that come back
  // -------------------------------------------------------------------------
  {
    name: "descriptions of pictures that come back are written into the builder's messages, in copies, and give the reader nothing",
    run: async (modules) => {
      const person = { role: "user", content: [{ type: "text", text: "Two pictures:" }, { type: "image", image: "https://example.test/one.png" }, { type: "image", image: "https://example.test/two.png" }] };
      const assistant = { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Screenshot", args: {} }] };
      const tool = {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1", toolName: "Screenshot", result: "ok", experimental_content: [{ type: "text", text: "The screen:" }, { type: "image", data: "AAAA", mimeType: "image/png" }] }],
      };
      const last = { role: "user", content: "What do you see?" };
      const held = [person, assistant, tool, last];
      const run = await exchange(modules, {
        messages: held,
        scripts: [
          [
            text("I see "),
            descriptions(
              { messageIndex: 2, partIndex: 0, expContentIndex: 1, description: "A login page" },
              { messageIndex: 0, partIndex: 2, description: "A dog" },
              { messageIndex: 0, partIndex: 1, description: "" },
              { messageIndex: 0, partIndex: 1, description: "A cat" },
              { messageIndex: 1, partIndex: 0, description: "On an assistant's message: nothing" },
              { messageIndex: 3, partIndex: 0, description: "On words: nothing" },
              { messageIndex: 9, partIndex: 0, description: "Past the end: nothing" },
              { messageIndex: 0, partIndex: 0, description: "On words inside a list: nothing" },
            ),
            text("a cat."),
          ],
        ],
      });
      const after = run.at.executor.getMessages();
      return {
        events: run.events,
        messagesAfter: after,
        whichAreTheSameObjects: after.map((message, index) => message === held[index]),
        theOnesGivenAreUntouched: JSON.stringify(held) === JSON.stringify([person, assistant, tool, last]) && person.content[1].providerOptions === undefined,
      };
    },
  },
  {
    name: "descriptions that come back twice, or after the builder changed: only a message the builder still holds is replaced",
    run: async (modules) => {
      const picture = () => ({ role: "user", content: [{ type: "image", image: "https://example.test/one.png" }, { type: "image", image: "https://example.test/two.png" }] });
      const twice = await exchange(modules, {
        messages: [picture()],
        scripts: [[descriptions({ messageIndex: 0, partIndex: 0, description: "First piece" }), descriptions({ messageIndex: 0, partIndex: 1, description: "Second piece, for the same message" })]],
      });
      const cleared = desk(modules, { messages: [picture()], scripts: [[text("a"), descriptions({ messageIndex: 0, partIndex: 0, description: "After the builder was cleared" })]] });
      await withStandIns(() => ask(cleared, { read: { before: (got) => (got === 1 ? cleared.executor.clearMessages() : undefined) } }));
      const added = desk(modules, { messages: [picture()], scripts: [[text("a"), descriptions({ messageIndex: 1, partIndex: 0, description: "For a message added after the call" }, { messageIndex: 0, partIndex: 1, description: "For the first" })]] });
      const late = picture();
      await withStandIns(() => ask(added, { read: { before: (got) => (got === 1 ? added.executor.appendMessages(late) : undefined) } }));
      const twoCalls = desk(modules, {
        messages: [picture()],
        scripts: [[descriptions({ messageIndex: 0, partIndex: 0, description: "From the first call" })], [descriptions({ messageIndex: 0, partIndex: 1, description: "From the second call" })]],
      });
      await withStandIns(async () => {
        await ask(twoCalls);
        await ask(twoCalls);
      });
      return {
        "two pieces for one message in one stream: the second is lost": twice.at.executor.getMessages(),
        "the builder was cleared meanwhile": cleared.executor.getMessages(),
        "a message was added meanwhile": added.executor.getMessages(),
        "two calls, one piece each: both are written": twoCalls.executor.getMessages(),
        "what the second call sent: a description the client wrote does not go on the wire": twoCalls.connection.sent[1].request,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Pieces as bytes
  // -------------------------------------------------------------------------
  {
    name: "every kind of piece written out as bytes: how it reads, what the reader gets and what the promises hold",
    run: async (modules) => {
      const struct = [entryOf("openai", inside(5, entryOf("responseId", words(3, "resp_1")), entryOf("cached", double(2, 100)), entryOf("flag", count(4, 1)), entryOf("none", count(1, 0)), entryOf("list", inside(6, inside(1, double(2, 1)), inside(1, words(3, "two"))))))];
      const table = {
        "words": inside(1, words(1, "Hel")),
        "the end of the words": inside(1, count(2, 1)),
        "the start of a tool call": inside(2, words(1, "call-1"), words(2, "Read"), count(5, 0)),
        "more of a tool call's arguments": inside(2, words(1, "call-1"), words(3, '{"path":')),
        "a whole tool call": inside(2, words(1, "call-1"), words(2, "Read"), words(3, '{"path":"/tmp/a"}'), count(4, 1)),
        "the counts": inside(3, count(1, 120), count(2, 30), count(3, 150)),
        "the counts without a total": inside(3, count(1, 120), count(2, 30)),
        "more counts": inside(5, count(1, 120), count(2, 30), count(3, 100), count(4, 20), count(5, 200000)),
        "what the provider adds": inside(6, inside(1, ...struct)),
        "the id of the call": inside(7, words(1, "inv-from-server")),
        "an error": inside(8, words(1, "Slow down."), words(2, "429"), count(5, 4)),
        "thinking": inside(9, words(1, "Hm."), words(2, "sig-1")),
        "descriptions of pictures": inside(10, inside(1, count(1, 0), count(2, 1), words(4, "A cat")), inside(1, count(1, 2), count(2, 0), count(3, 1), words(4, "A page"))),
        "what is known of the answer": inside(
          4,
          words(1, "answer-1"),
          words(2, "model-a-2026"),
          count(3, 1767225600000),
          inside(
            4,
            words(1, "msg-1"),
            count(2, 2),
            words(3, "I will read it."),
            inside(4, words(1, "call-1"), words(2, "Read"), inside(3, entryOf("path", words(3, "/tmp/a")))),
            inside(4, words(1, "call-2"), words(2, "Shell"), words(4, "pwd")),
            inside(6, count(1, 1), words(4, "AAAA"), words(5, "model-b")),
            inside(6, words(2, "A file."), words(3, "sig")),
          ),
          inside(4, words(1, "msg-2"), count(2, 3), inside(5, inside(1, words(1, "call-1"), words(2, "Read"), inside(3, words(3, "body")), count(4, 1)), inside(1, words(1, "call-2"), words(2, "Count"), inside(3, double(2, 3))))),
          words(5, "The provider hung up."),
          inside(6, inside(1, inside(1, doubles(-0.25, -1.5))), inside(2, inside(1, varint(7), varint(300))), inside(6, words(1, "a"), words(1, ""))),
        ),
      };
      return casesInTurn(table, async (bytes) => {
        const read = attempt(() => modules.wire.InferenceStreamResponse.fromBinary(Uint8Array.from(bytes)).toJson());
        const run = await exchange(modules, { messages: [{ role: "user", content: [{ type: "text", text: "t" }, { type: "image", image: "x" }] }], scripts: [[{ bytes }]] });
        return { bytes: hex(bytes), read, parts: run.parts, promises: run.promises, standIns: run.standIns, thrown: run.thrown === undefined ? "nothing" : told(run.thrown), messagesAfter: run.at.executor.getMessages() };
      });
    },
  },
  {
    name: "pieces as bytes that hold fields and kinds this engine does not know: what it knows is read, the rest is passed over",
    run: async (modules) => {
      const table = {
        "words with a field from later inside": inside(1, words(1, "Hel"), words(7, "from later"), count(8, 3)),
        "words with a field from later beside": [...inside(1, words(1, "Hel")), ...words(99, "from later")],
        "a piece of a kind from later": inside(42, words(1, "audio")),
        "a piece of a kind from later, then words in the same piece": [...inside(42, words(1, "audio")), ...inside(1, words(1, "after"))],
        "words, then counts in the same piece: the last kind is the piece's": [...inside(1, words(1, "lost")), ...inside(3, count(1, 5), count(2, 6))],
        "words written twice in the same piece: joined into one": [...inside(1, words(1, "first")), ...inside(1, count(2, 1))],
        "an error of a kind from later": inside(8, words(1, "A new kind of failure."), count(5, 42), words(6, "retry later")),
        "a tool call with a field from later": inside(2, words(1, "call-1"), words(2, "Read"), words(3, "{}"), count(4, 1), words(9, "from later")),
        "what is known of the answer, with a message of a kind from later": inside(4, words(1, "answer-1"), inside(4, words(1, "msg-1"), count(2, 9), words(3, "From a kind of message this engine has no name for."), words(12, "from later")), words(15, "from later")),
        "an empty piece": [],
      };
      return casesInTurn(table, async (bytes) => {
        const message = modules.wire.InferenceStreamResponse.fromBinary(Uint8Array.from(bytes));
        const run = await exchange(modules, { scripts: [[{ bytes }]] });
        return {
          bytes: hex(bytes),
          read: message.toJson(),
          writtenAgain: hex(message.toBinary()),
          parts: run.parts,
          thrown: run.thrown === undefined ? "nothing" : told(run.thrown),
          promisesThatEndedOtherwiseThanByTheirOwnValue: Object.fromEntries(Object.entries(run.promises).filter(([, end]) => "rejected" in end)),
          usage: run.promises.usage,
          response: run.promises.response,
        };
      });
    },
  },
  {
    name: "the plain form with fields this engine does not know: read all the same when the connection passes them over",
    run: async (modules) => {
      const pieces = [
        { plain: { textPart: { text: "Hel", fromLater: true }, alsoFromLater: 1 } },
        { plain: { toolCallPart: { toolCallId: "call-1", toolName: "Read", args: "{}", isComplete: true, fromLater: { a: 1 } } } },
        { plain: { audioPart: { data: "AAAA" } } },
        { plain: { error: { message: "A new kind.", fromLater: "x" } } },
        { plain: { responseInfo: { id: "answer-1", messages: [{ id: "m", role: "INFERENCE_MESSAGE_ROLE_ASSISTANT", content: "Hi", fromLater: 1 }], fromLater: [] } } },
      ];
      const run = await exchange(modules, { scripts: [pieces] });
      const strict = attempt(() => modules.wire.InferenceStreamResponse.fromJson({ textPart: { text: "Hel", fromLater: true } }));
      return { events: run.events, response: run.promises.response, "the same piece read without passing over": strict };
    },
  },
  {
    name: "a piece cut short on the way: the connection cannot read it, and the stream fails with what it threw",
    run: async (modules) => {
      const whole = inside(2, words(1, "call-1"), words(2, "Read"), words(3, '{"path":"/tmp/a"}'), count(4, 1));
      const cuts = {
        "cut inside the arguments": whole.slice(0, whole.length - 6),
        "cut after the length": whole.slice(0, 2),
        "cut to one byte": whole.slice(0, 1),
        "a length that says more than there is": [...tagOf(1, 2), 40, 10, 3, 72, 101, 108],
        "a number that never ends": [...tagOf(3, 2), 2, 8, 0x80],
        "a text inside that is cut": [...tagOf(1, 2), 4, 10, 9, 72, 105],
      };
      const out = await casesInTurn(cuts, async (bytes) => {
        const run = await exchange(modules, { scripts: [[text("Before."), { bytes }, text("never read")]] });
        return { bytes: hex(bytes), events: run.events, promises: run.promises, promisesThatHoldTheVeryErrorThrown: Object.keys(run.reasons).filter((name) => run.reasons[name] === run.thrown) };
      });
      const endsEarly = await exchange(modules, { scripts: [[text("I will "), toolCall({ toolCallId: "call-1", toolName: "Read" }), toolCall({ toolCallId: "call-1", args: '{"pa' })]] });
      return {
        ...out,
        "a stream that stops in the middle of a tool call, with no failure: it ends as if all was said": { events: endsEarly.events, promises: endsEarly.promises, standIns: endsEarly.standIns },
      };
    },
  },
];
