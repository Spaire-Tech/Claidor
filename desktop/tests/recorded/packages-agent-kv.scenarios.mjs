/**
 * An agent's stored state: blobs kept under keys, values written as bytes and read back, references
 * that load a blob when first asked and write it only when it changed, and the agent's store, which
 * keeps a conversation as a tree of blobs under one root.
 *
 * What is stored is read back by later versions of the engine and by engines already running, so the
 * scenarios keep the stored form itself: for every write, the key and the bytes (as hex, or as text
 * where text is what is stored); for every read, what stored bytes of each shape give back: bytes as
 * the code writes them today, older shapes, damaged bytes, and a key that is not there.
 *
 * Stand-ins, each put back when a scenario ends:
 * - a store that keeps blobs in a map and writes down every call (no database, no file);
 * - a context that answers any key with one backend, which keeps the measures and log lines it is told;
 * - `performance.now`, so that a duration is a fixed number;
 * - `Date.now`, `crypto.randomUUID` and `crypto.getRandomValues`, so that a new agent's id, time and
 *   blob key are fixed and each asking is noted.
 *
 * Conversations are stored as protobuf messages. The scenarios write those bytes by hand (`wire`), so
 * that what is read is stored bytes and nothing the part made; the one class they need to hand a
 * structure to the part is reached through a store the part makes.
 */
import vm from "node:vm";

export const part = "packages/agent-kv";
export const modules = {
  serde: "source/packages/agent-kv/serde.ts",
  blobs: "source/packages/agent-kv/blob-store.ts",
  notFound: "source/packages/agent-kv/blob-not-found-error.ts",
  typed: "source/packages/agent-kv/typed-blob-store.ts",
  reference: "source/packages/agent-kv/reference.ts",
  subagents: "source/packages/agent-kv/subagent-states.ts",
  agentStore: "source/packages/agent-kv/agent-store.ts",
};
// Not a file of the part: the class a blob store must be an instance of for the agent's store to
// dispose of it. It is built into the same file so that a scenario can make such a store.
export const borrowed = {
  disposable: "source/packages/utils/disposable.ts",
};

// ---------------------------------------------------------------------------
// How the cases are asked and kept
// ---------------------------------------------------------------------------

/** 14 November 2026, 09:08:07.065 UTC: the time the stand-in clock gives. */
const AT = Date.UTC(2026, 10, 14, 9, 8, 7, 65);

const RealBuffer = Buffer;
/** Bytes as hex, by the scenarios' own hand, never the part's. */
const hex = (stored) => RealBuffer.from(stored.buffer, stored.byteOffset, stored.byteLength).toString("hex");
/** The bytes a hex text stands for, in memory of their own. */
const bytes = (text) => Uint8Array.from(RealBuffer.from(text, "hex"));
/** The UTF-8 bytes of a text, in memory of their own. */
const utf8 = (text) => Uint8Array.from(RealBuffer.from(text, "utf8"));
/** Stored bytes read as text, for what is stored as text. */
const asText = (stored) => RealBuffer.from(stored.buffer, stored.byteOffset, stored.byteLength).toString("utf8");

/**
 * An error as it is kept. The runtime's own refusals (a field read on nothing, a call of what is no
 * function, a text that is no JSON) are kept by their class alone: the sentence is the runtime's, and
 * it names a variable as the build happens to call it.
 */
function failure(error) {
  if (error instanceof TypeError || error instanceof SyntaxError || error instanceof ReferenceError) return `a ${error.constructor.name} of the runtime's own`;
  return error;
}

/** What a call gives back, or how it fails: at once (`threw`), or through the promise it gave (`rejected`). */
async function outcome(run) {
  let result;
  try {
    result = run();
  } catch (error) {
    return { threw: failure(error) };
  }
  if (result === null || typeof result !== "object" || typeof result.then !== "function") return result;
  try {
    return await result;
  } catch (error) {
    return { rejected: failure(error) };
  }
}

/** The same for a call that gives no promise. */
function attempt(run) {
  try {
    return run();
  } catch (error) {
    return { threw: failure(error) };
  }
}

/** Each case under its own words: what it gave back, or how it failed. */
function table(cases) {
  const answers = {};
  for (const [words, ask] of cases) {
    if (Object.hasOwn(answers, words)) throw new Error(`two cases are named "${words}"`);
    answers[words] = attempt(ask);
  }
  return answers;
}

/** The same for cases that give promises, asked one after the other. */
async function tableLater(cases) {
  const answers = {};
  for (const [words, ask] of cases) {
    if (Object.hasOwn(answers, words)) throw new Error(`two cases are named "${words}"`);
    answers[words] = await outcome(ask);
  }
  return answers;
}

/** Everything waiting in the microtask queue is let run. */
async function settle() {
  for (let turn = 0; turn < 60; turn += 1) await null;
}

/** How many turns of the microtask queue pass before a promise settles. */
async function turns(promise, most = 200) {
  let settled = false;
  const done = () => {
    settled = true;
  };
  promise.then(done, done);
  let count = 0;
  while (!settled && count < most) {
    await null;
    count += 1;
  }
  return settled ? count : `more than ${most}`;
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

/**
 * A context that answers every key with one backend, and what the part told that backend, in order:
 * each measure with the metric it belongs to, each log line with what it carries.
 */
function surroundings() {
  const told = [];
  const measure = (method) => (context, handle, value, labels) => {
    told.push({ [method]: handle.name, kind: handle.type, description: handle.description, labelNames: handle.labelNames, value, labels, onTheContext: context === ctx });
  };
  const backend = {
    record: measure("record"),
    increment: measure("increment"),
    gauge: measure("gauge"),
    histogram: measure("histogram"),
    log(context, entry) {
      const line = {};
      for (const [field, value] of Object.entries(entry)) {
        if (field === "context") line[field] = value === ctx ? "the context" : value;
        else if (field === "timestamp") line[field] = value instanceof Date ? "a date" : value;
        else line[field] = value;
      }
      told.push({ log: line, onTheContext: context === ctx });
    },
  };
  const ctx = { get: () => backend };
  return { ctx, told };
}

/** `performance.now` replaced while `run` runs: it starts at 1,000 and moves `step` ms each time it is read. */
async function withClock(step, run) {
  const reads = { count: 0 };
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => 1_000 + step * reads.count++ });
  try {
    return await run(reads);
  } finally {
    delete performance.now;
  }
}

/**
 * The time and the two sources of randomness replaced while `run` runs (it gives no promise): the time
 * is `AT`, the nth random id ends in n, the nth filling of random bytes starts at n times 16 and counts
 * up. What was asked for is noted in order.
 */
function pinned(run) {
  const asked = [];
  const realNow = Date.now;
  let ids = 0;
  let fills = 0;
  Date.now = () => {
    asked.push("the time");
    return AT;
  };
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    writable: true,
    value: () => {
      asked.push("a random id");
      ids += 1;
      return `00000000-0000-4000-8000-00000000000${ids}`;
    },
  });
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    writable: true,
    value: (target) => {
      asked.push(`random bytes for a ${target.constructor.name} of ${target.length}${target.every((byte) => byte === 0) ? ", all zero" : ", already written"}`);
      fills += 1;
      for (let at = 0; at < target.length; at += 1) target[at] = (fills * 16 + at) & 0xff;
      return target;
    },
  });
  try {
    return { gave: attempt(run), asked };
  } finally {
    Date.now = realNow;
    delete crypto.randomUUID;
    delete crypto.getRandomValues;
  }
}

/**
 * A store that keeps blobs in a map under the hex of their key and writes down every call. `events`
 * may be a list shared with a serde and a callback, so that the order of all three is seen. With
 * `durable` given, the store says so of every blob when asked.
 */
function keeping(blobsByHex = {}, { events = [], durable } = {}) {
  const kept = new Map(Object.entries(blobsByHex));
  const contexts = [];
  /** A key or a blob as it is written down: its hex, or what it is when it is no bytes. */
  const named = (given) => (given instanceof Uint8Array ? hex(given) : `no bytes but ${typeof given === "string" ? JSON.stringify(given) : String(given)}`);
  const store = {
    getBlob(ctx, blobId) {
      contexts.push(ctx);
      events.push(`getBlob ${named(blobId)}`);
      return Promise.resolve(kept.get(named(blobId)));
    },
    setBlob(ctx, blobId, blobData) {
      contexts.push(ctx);
      events.push(`setBlob ${named(blobId)} = ${named(blobData)}`);
      kept.set(named(blobId), blobData);
      return Promise.resolve();
    },
    setBlobLocallyOnly(ctx, blobId, blobData) {
      contexts.push(ctx);
      events.push(`setBlobLocallyOnly ${named(blobId)} = ${named(blobData)}`);
      kept.set(named(blobId), blobData);
      return Promise.resolve();
    },
    flush(ctx) {
      contexts.push(ctx);
      events.push("flush");
      return Promise.resolve();
    },
  };
  if (durable !== undefined) {
    store.isBlobDurable = (blobId) => {
      events.push(`isBlobDurable ${named(blobId)}`);
      return durable;
    };
  }
  return { store, events, kept, contexts };
}

/**
 * A serde for texts that notes each thing asked of it. `blobType` is what it says its blobs are: left
 * out, strings; "no answer", undefined; "none", it cannot be asked at all.
 */
function notingSerde(events, blobType = { kind: "string" }) {
  const serde = {
    serialize(value) {
      events.push(`serialize ${JSON.stringify(value)}`);
      return utf8(String(value));
    },
    deserialize(blob) {
      events.push(`deserialize ${blob instanceof Uint8Array ? hex(blob) : String(blob)}`);
      return asText(blob);
    },
  };
  if (blobType !== "none") {
    serde.getBlobType = () => {
      events.push("getBlobType");
      return blobType === "no answer" ? undefined : blobType;
    };
  }
  return serde;
}

/** SHA-256 of a text's UTF-8 bytes, as hex: the key a text is stored under. */
const KEY_OF = {
  hello: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
};

// ---------------------------------------------------------------------------
// Protobuf's wire form, by hand
// ---------------------------------------------------------------------------

const wire = {
  varint(value) {
    const out = [];
    let rest = BigInt.asUintN(64, BigInt(value));
    do {
      const low = Number(rest & 0x7fn);
      rest >>= 7n;
      out.push(rest > 0n ? low | 0x80 : low);
    } while (rest > 0n);
    return out;
  },
  /** A field holding a number. */
  number: (no, value) => [...wire.varint(no << 3), ...wire.varint(value)],
  /** A field holding bytes, a text's or a message's among them. */
  bytes: (no, value) => [...wire.varint((no << 3) | 2), ...wire.varint(value.length), ...value],
  text: (no, value) => wire.bytes(no, utf8(value)),
  message: (...fields) => Uint8Array.from(fields.flat()),
};

/** The messages a conversation is stored as, each with the field numbers of the engine's own definitions. */
const stored = {
  userMessage: (text, messageId) => wire.message(wire.text(1, text), wire.text(2, messageId)),
  /** A step that is the assistant's words. */
  said: (text) => wire.message(wire.bytes(1, wire.message(wire.text(1, text)))),
  /** A step that is the assistant's thinking, and how long it took. */
  thought: (text, ms) => wire.message(wire.bytes(3, wire.message(wire.text(1, text), wire.number(2, ms)))),
  shellCommand: (command) => wire.message(wire.text(1, command)),
  shellOutput: (stdout, stderr, exitCode) => wire.message(wire.text(1, stdout), wire.text(2, stderr), wire.number(3, exitCode)),
  todo: (id, content, status) => wire.message(wire.text(1, id), wire.text(2, content), wire.number(3, status), wire.number(4, 1_794_000_000_000), wire.number(5, 1_794_000_000_500), wire.text(6, "before")),
  summary: (text) => wire.message(wire.text(1, text)),
  /** A turn of the agent: the keys of its user message and steps, and the request it was answered under. */
  agentTurn: ({ user, steps = [], requestId }) =>
    wire.message(wire.bytes(1, wire.message(wire.bytes(1, bytes(user)), ...steps.map((step) => wire.bytes(2, bytes(step))), ...(requestId === undefined ? [] : [wire.text(3, requestId)])))),
  /** A turn of the person's own shell: the keys of its command and output. */
  shellTurn: ({ command, output }) => wire.message(wire.bytes(2, wire.message(wire.bytes(1, bytes(command)), wire.bytes(2, bytes(output))))),
  /** A subagent's state: its own conversation's structure, when it was made and last used, that it is an "explore" subagent, its model. */
  subagent: ({ conversation, created = 0, used = 0, model }) =>
    wire.message(...(conversation === undefined ? [] : [wire.bytes(1, conversation)]), wire.number(2, created), wire.number(3, used), wire.bytes(4, wire.message(wire.bytes(4, []))), ...(model === undefined ? [] : [wire.text(5, model)])),
  /** A conversation's structure: the keys of its turns, todos and summary, the subagents written in it, and the keys of those kept apart. */
  structure: ({ turns = [], todos = [], summary, inline = {}, refs = {} } = {}) =>
    wire.message(
      ...turns.map((turn) => wire.bytes(8, bytes(turn))),
      ...todos.map((todo) => wire.bytes(3, bytes(todo))),
      ...(summary === undefined ? [] : [wire.bytes(6, bytes(summary))]),
      ...Object.entries(inline).map(([id, state]) => wire.bytes(16, wire.message(wire.text(1, id), wire.bytes(2, state)))),
      ...Object.entries(refs).map(([id, key]) => wire.bytes(31, wire.message(wire.text(1, id), wire.bytes(2, bytes(key))))),
    ),
};

/** The class of a conversation's structure, reached through a store the part makes. */
const structureClass = (agentStore) => new agentStore.AgentStore2({}, {}).getConversationStateStructure().constructor;
/** A conversation's structure read from stored bytes. */
const structureFrom = (agentStore, storedBytes) => structureClass(agentStore).fromBinary(storedBytes);

/**
 * A conversation of two turns, two todos and a summary, as blobs under short keys: an agent turn (a
 * user message, a thought, an answer) and a shell turn.
 */
function conversationBlobs() {
  return {
    a1: stored.agentTurn({ user: "b1", steps: ["c1", "c2"], requestId: "request-1" }),
    b1: stored.userMessage("What is in this folder?", "message-1"),
    c1: stored.thought("Listing the folder.", 12),
    c2: stored.said("Three files."),
    a2: stored.shellTurn({ command: "d1", output: "d2" }),
    d1: stored.shellCommand("ls -la"),
    d2: stored.shellOutput("a.txt\nb.txt\n", "", 0),
    e1: stored.todo("todo-1", "Read the files", 2),
    e2: stored.todo("todo-2", "Write the answer", 1),
    f1: stored.summary("They asked what the folder holds."),
  };
}
const conversationStructure = () => stored.structure({ turns: ["a1", "a2"], todos: ["e1", "e2"], summary: "f1" });

/** A conversation in few words, for cases that differ by what is left out; `stored` is the whole of it, as it would be written. */
function brief(state) {
  return {
    turns: state.turns.map((turn) => {
      const { case: kind, value } = turn.turn;
      if (kind === "agentConversationTurn") return `agent: ${JSON.stringify(value.userMessage?.text)}, steps ${JSON.stringify(value.steps.map((step) => step.message.value?.text))}, request ${JSON.stringify(value.requestId)}`;
      if (kind === "shellConversationTurn") return `shell: ${JSON.stringify(value.shellCommand?.command)} gave ${JSON.stringify(value.shellOutput?.stdout)}`;
      return `neither: ${String(kind)}`;
    }),
    todos: state.todos.map((todo) => todo.id),
    summary: "summary" in state ? { there: state.summary?.summary } : "no such field",
    stored: hex(state.toBinary()),
  };
}

/** The keys a store was asked for, in order, from the calls it wrote down. */
const keysAsked = (events) => events.map((event) => event.slice("getBlob ".length) || "(the empty key)").join(" ");

/** A metadata store that keeps values in a map and writes down every call. */
function metadataKeeping(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  const listeners = [];
  const unsubscribe = () => "unsubscribed";
  const shown = (value) => (value instanceof Uint8Array ? `bytes ${hex(value)}` : JSON.stringify(value));
  const store = {
    subscribe(key, callback) {
      calls.push(`subscribe ${key}`);
      listeners.push(callback);
      return unsubscribe;
    },
    set(key, value) {
      calls.push(`set ${key} = ${shown(value)}`);
      values.set(key, value);
      return "what set gives back";
    },
    get(key) {
      calls.push(`get ${key}`);
      return values.get(key);
    },
  };
  return { store, calls, values, listeners, unsubscribe };
}

/** An error with what the usual record leaves out: how it prints, how its trace begins, and its own fields as they are named, listed and written out. */
function toldOf(error) {
  return {
    kept: error,
    printed: String(error),
    traceBegins: error.stack.split("\n")[0],
    ownNames: Object.getOwnPropertyNames(error).filter((name) => name !== "stack"),
    listed: Object.keys(error),
    asJson: JSON.stringify(error),
  };
}

/** How each own field but the trace is held: its value and whether it can be written over, listed and removed. */
function held(thing) {
  const out = {};
  for (const key of Reflect.ownKeys(thing)) {
    if (key === "stack") continue;
    const { value, writable, enumerable, configurable } = Object.getOwnPropertyDescriptor(thing, key);
    out[String(key)] = { value, writable, enumerable, configurable };
  }
  return out;
}

/** A function or class by its name and the number of parameters it says it takes. */
const about = (made) => ({ name: made.name, parameters: made.length });
/** The names of a class's methods, sorted: which there are, not the order they were written in. */
const methodsOf = (made) => Object.getOwnPropertyNames(made.prototype).filter((name) => name !== "constructor").sort();

export const scenarios = [
  // ---- What the part exports -------------------------------------------
  {
    name: "what the part exports: each function and class by its name, its parameters and its methods",
    run: ({ serde, blobs, notFound, typed, reference, subagents, agentStore, disposable }) => ({
      serde: { Utf8Serde: [about(serde.Utf8Serde), methodsOf(serde.Utf8Serde)], ProtoSerde: [about(serde.ProtoSerde), methodsOf(serde.ProtoSerde)], toHex: about(serde.toHex), fromHex: about(serde.fromHex), utf8SerdeIsAUtf8Serde: serde.utf8Serde instanceof serde.Utf8Serde },
      blobs: { isBlobDurable: about(blobs.isBlobDurable), toUint8Array: about(blobs.toUint8Array), getBlobId: about(blobs.getBlobId), InMemoryBlobStore: [about(blobs.InMemoryBlobStore), methodsOf(blobs.InMemoryBlobStore)] },
      notFound: { BlobNotFoundError: [about(notFound.BlobNotFoundError), methodsOf(notFound.BlobNotFoundError), Object.getPrototypeOf(notFound.BlobNotFoundError) === Error], findBlobNotFoundError: about(notFound.findBlobNotFoundError) },
      typed: {
        getBlobMetadataCallback: about(typed.getBlobMetadataCallback),
        unwrapBlobStore: about(typed.unwrapBlobStore),
        setBlobReadableFromCloudMirror: about(typed.setBlobReadableFromCloudMirror),
        TypedBlobStore: [about(typed.TypedBlobStore), methodsOf(typed.TypedBlobStore)],
      },
      reference: {
        Writeable: [about(reference.Writeable), methodsOf(reference.Writeable)],
        EagerReference: [about(reference.EagerReference), methodsOf(reference.EagerReference)],
        LazyReference: [about(reference.LazyReference), methodsOf(reference.LazyReference)],
      },
      subagents: { resolveSubagentPersistedStates: about(subagents.resolveSubagentPersistedStates) },
      agentStore: {
        generateBlobEncryptionKeyHex: about(agentStore.generateBlobEncryptionKeyHex),
        isValidBlobEncryptionKeyHex: about(agentStore.isValidBlobEncryptionKeyHex),
        getAgentMetadataSchema: about(agentStore.getAgentMetadataSchema),
        getDefaultAgentMetadata: about(agentStore.getDefaultAgentMetadata),
        AgentMetadataSerde: [about(agentStore.AgentMetadataSerde), methodsOf(agentStore.AgentMetadataSerde)],
        deriveConversationStateFromStructure: about(agentStore.deriveConversationStateFromStructure),
        AgentStore2: [about(agentStore.AgentStore2), methodsOf(agentStore.AgentStore2)],
      },
      disposable: { Disposable: [about(disposable.Disposable), methodsOf(disposable.Disposable)] },
    }),
  },
  {
    name: "what each thing the part makes holds: its own fields by name, in order",
    run: ({ serde, blobs, typed, reference, agentStore }) => {
      const inner = keeping().store;
      const callback = () => {};
      const inside = { the: "store inside" };
      const wrapped = new typed.TypedBlobStore(inside, callback);
      const bare = new typed.TypedBlobStore(inside);
      const eager = new reference.EagerReference(serde.utf8Serde, inner, "a value");
      const lazy = new reference.LazyReference(serde.utf8Serde, inner, bytes("0a"));
      const agents = new agentStore.AgentStore2(inner, metadataKeeping().store, { fixedRootBlobId: bytes("0b") });
      return {
        utf8Serde: Object.keys(serde.utf8Serde),
        protoSerde: Object.keys(new serde.ProtoSerde({ typeName: "a.Type", fromBinary: () => ({}) })),
        inMemoryBlobStore: Object.keys(new blobs.InMemoryBlobStore()),
        typedBlobStore: { fields: Object.keys(wrapped), keys: Object.getOwnPropertySymbols(wrapped).map(String), held: held(wrapped), holdsTheStore: Object.values(wrapped)[0] === inside, holdsTheCallback: wrapped[typed.BLOB_METADATA_CALLBACK_SYMBOL] === callback },
        typedBlobStoreWithoutCallback: { fields: Object.keys(bare), keys: Object.getOwnPropertySymbols(bare).map(String), held: held(bare) },
        writeable: Object.keys(new reference.Writeable()),
        eagerReference: { fields: Object.keys(eager), serde: eager.serde === serde.utf8Serde, blobStore: eager.blobStore === inner, lastWrittenValue: eager.lastWrittenValue, value: eager.value },
        lazyReference: { fields: Object.keys(lazy), serde: lazy.serde === serde.utf8Serde, blobStore: lazy.blobStore === inner, blobId: lazy.blobId, valuePromise: lazy.valuePromise, lastWrittenValue: lazy.lastWrittenValue, lastWrittenBlobData: lazy.lastWrittenBlobData },
        agentMetadataSerde: Object.keys(new agentStore.AgentMetadataSerde()),
        agentStore: Object.keys(agents),
        agentStoreWithoutOptions: Object.keys(new agentStore.AgentStore2(inner, metadataKeeping().store)),
      };
    },
  },

  // ---- serde: texts, messages, hex --------------------------------------
  {
    name: "a text is stored as its UTF-8 bytes",
    run: ({ serde }) =>
      table(
        [
          ["an empty text", ""],
          ["plain letters", "hello"],
          ["accents, a wide letter and a face", "\u00e9t\u00e9 \u65e5 \ud83d\ude00"],
          ["a text that starts with the byte order mark", "\ufeffa"],
          ["half of a pair alone is stored as the replacement character", "a\ud800b"],
          ["a line break and a zero", "a\n\u0000"],
          ["nothing at all is stored as no bytes", undefined],
          ["a number is stored as its digits", 12],
          ["null is stored as the word", null],
          ["a symbol", Symbol("no text")],
        ].map(([words, value]) => [words, () => serde.utf8Serde.serialize(value)]),
      ),
  },
  {
    name: "stored bytes are read back as text: the mark at the start is dropped, bytes that are no UTF-8 become the replacement character",
    run: ({ serde }) =>
      table(
        [
          ["no bytes", new Uint8Array()],
          ["plain letters", bytes("68656c6c6f")],
          ["accents, a wide letter and a face", bytes("c3a974c3a920e697a520f09f9880")],
          ["a byte order mark, then a letter", bytes("efbbbf61")],
          ["two byte order marks: only the first is dropped", bytes("efbbbfefbbbf61")],
          ["a byte that is no UTF-8, and a letter cut short", bytes("61ffc3")],
          ["half of a pair written as three bytes", bytes("61eda08062")],
          ["a view into the middle of longer memory", bytes("ff6869ff").subarray(1, 3)],
          ["memory itself, not a view of it", bytes("6869").buffer],
          ["nothing at all", undefined],
          ["null", null],
          ["a text", "6869"],
        ].map(([words, value]) => [words, () => serde.utf8Serde.deserialize(value)]),
      ),
  },
  {
    name: "the same serde reads one blob after another, and says its blobs are strings",
    run: ({ serde }) => {
      const another = new serde.Utf8Serde();
      const first = serde.utf8Serde.getBlobType();
      return {
        aLetterCutShortDoesNotLeakIntoTheNextRead: [serde.utf8Serde.deserialize(bytes("61c3")), serde.utf8Serde.deserialize(bytes("a962"))],
        blobType: first,
        aNewAnswerEachTime: serde.utf8Serde.getBlobType() !== first,
        anotherSerdeDoesTheSame: [another.serialize("h\u00e9"), another.deserialize(bytes("68c3a9")), another.getBlobType()],
        thereAndBack: ["", "hello", "\u00e9t\u00e9 \u65e5 \ud83d\ude00", "line\nline\ttab"].map((text) => serde.utf8Serde.deserialize(serde.utf8Serde.serialize(text)) === text),
      };
    },
  },
  {
    name: "a message's serde stores what the message writes of itself, and reads through the message's type",
    run: ({ serde }) => {
      const calls = [];
      const type = {
        typeName: "example.v1.Thing",
        fromBinary(...given) {
          calls.push({ fromBinary: given, onTheType: this === type });
          return "what the type read";
        },
      };
      const message = {
        toBinary(...given) {
          calls.push({ toBinary: given, onTheMessage: this === message });
          return bytes("0a01");
        },
      };
      const made = new serde.ProtoSerde(type);
      const written = made.serialize(message);
      const read = made.deserialize(bytes("0a02"));
      const blobType = made.getBlobType();
      type.typeName = "example.v1.Renamed";
      return {
        written,
        read,
        blobType,
        theNameIsReadWhenAsked: made.getBlobType(),
        calls,
        aMessageThatCannotWriteItself: attempt(() => made.serialize({})),
        aTypeThatCannotRead: attempt(() => new serde.ProtoSerde({}).deserialize(bytes("00"))),
        noTypeAtAll: [attempt(() => new serde.ProtoSerde(undefined).getBlobType()), attempt(() => new serde.ProtoSerde(undefined).deserialize(bytes("00")))],
      };
    },
  },
  {
    name: "bytes are written as hex, two small digits each",
    run: ({ serde }) => {
      const every = Uint8Array.from({ length: 256 }, (_, value) => value);
      return {
        ...table(
          [
            ["no bytes", new Uint8Array()],
            ["zero", bytes("00")],
            ["the edges of one digit and two", Uint8Array.from([0, 1, 9, 10, 15, 16, 127, 128, 255])],
            ["a view into the middle of longer memory", bytes("ff0a0bff").subarray(1, 3)],
            ["a Node buffer", RealBuffer.from([1, 2, 254])],
            ["memory itself", bytes("010203").buffer],
            ["a list of numbers: each is taken modulo 256", [1, 2, 300, -1, 2.9]],
            ["a text: its UTF-8 bytes", "abc"],
            ["16-bit numbers: the low byte of each", Uint16Array.from([0x1234, 7])],
            ["something with a length and numbered fields", { length: 2, 0: 1, 1: 255 }],
            ["a number: nothing", 5],
            ["an object with nothing in it: nothing", {}],
            ["a set: each member as it is written in base 16, at least two digits", new Set([1, 2, 255, 256])],
            ["a map: each pair written out", new Map([[1, 2]])],
            ["a symbol: nothing", Symbol("no bytes")],
            ["nothing at all", undefined],
            ["null", null],
          ].map(([words, value]) => [words, () => serde.toHex(value)]),
        ),
        everyByte: serde.toHex(every),
        ...(() => {
          // Where there is no Buffer at all, the digits are the same.
          const kept = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
          delete globalThis.Buffer;
          try {
            return { withoutBuffer: [serde.toHex(every) === hex(every), serde.toHex(bytes("000a10ff")), serde.toHex(new Uint8Array())] };
          } finally {
            Object.defineProperty(globalThis, "Buffer", kept);
          }
        })(),
      };
    },
  },
  {
    name: "hex is read two characters at a time: what is no hex counts as zero, an odd length is refused",
    run: ({ serde }) => {
      const every = Uint8Array.from({ length: 256 }, (_, value) => value);
      return {
        ...table(
          [
            ["an empty text", ""],
            ["two digits", "0a"],
            ["capitals", "0A1B2C3D4E5F"],
            ["both kinds mixed", "aBcD"],
            ["spaces and a line break around it are dropped first", " 0a0b\n"],
            ["only spaces", "   "],
            ["one digit", "a"],
            ["three digits", "abc"],
            ["an odd length once the spaces are dropped", " abc "],
            ["letters that are no hex", "zz"],
            ["a digit, then a letter that is no hex: the digit alone", "1g"],
            ["a letter that is no hex, then a digit: zero", "g1"],
            ["a minus sign", "-1"],
            ["a plus sign", "+f"],
            ["the 0x some write in front", "0x1f"],
            ["spaces inside", "0a b 1"],
            ["a capital whose small form is two characters long", "\u0130"],
            ["a text object", new String("0a")],
            ["a number", 5],
            ["a list holding a text", ["0a"]],
            ["nothing at all", undefined],
          ].map(([words, value]) => [words, () => serde.fromHex(value)]),
        ),
        everyByteThereAndBack: hex(serde.fromHex(serde.toHex(every))) === hex(every),
        theBytesAreNew: (() => {
          const first = serde.fromHex("0a");
          return first !== serde.fromHex("0a") && first.constructor === Uint8Array && first.byteOffset === 0;
        })(),
      };
    },
  },

  // ---- blob-store --------------------------------------------------------
  {
    name: "a blob is durable unless its store says otherwise",
    run: ({ blobs }) => {
      const asked = [];
      const saying = (answer) => {
        const store = {
          isBlobDurable(...given) {
            asked.push({ given, onTheStore: this === store });
            return answer;
          },
        };
        return store;
      };
      const key = bytes("0a0b");
      return {
        ...table(
          [
            ["a store that cannot be asked", {}],
            ["a store that says yes", saying(true)],
            ["a store that says no", saying(false)],
            ["a store that says nothing", saying(undefined)],
            ["a store that says null: null is handed on", saying(null)],
            ["a store that says 0: 0 is handed on", saying(0)],
            ["a store that says a word: the word is handed on", saying("soon")],
            ["a store whose question is null", { isBlobDurable: null }],
            ["a store whose question is no function", { isBlobDurable: 5 }],
            ["no store at all", undefined],
          ].map(([words, store]) => [words, () => blobs.isBlobDurable(store, key)]),
        ),
        asked,
      };
    },
  },
  {
    name: "bytes are seen as a Uint8Array over the same memory, or as a copy when the memory is shared between threads",
    run: ({ blobs }) => {
      const seen = (value) => {
        const made = blobs.toUint8Array(value);
        return { bytes: made, aPlainUint8Array: made.constructor === Uint8Array, anotherObject: made !== value, sameMemory: made.buffer === value.buffer, sameStart: made.byteOffset === value.byteOffset };
      };
      const shared = new SharedArrayBuffer(4);
      new Uint8Array(shared).set([1, 1, 3, 3]);
      const longer = bytes("ff010203ff");
      return {
        ...table([
          ["a Uint8Array", () => seen(bytes("010203"))],
          ["no bytes", () => seen(new Uint8Array())],
          ["a view into the middle of longer memory", () => seen(longer.subarray(1, 4))],
          ["a Node buffer", () => seen(RealBuffer.alloc(3, 7))],
          ["a DataView", () => seen(new DataView(longer.buffer, 1, 2))],
          ["16-bit numbers: their bytes, not their values", () => seen(Uint16Array.from([0x0101, 0x0303]))],
          ["bytes over shared memory: a copy", () => seen(new Uint8Array(shared, 1, 2))],
          ["16-bit numbers over shared memory: a copy of their values, cut to a byte each", () => seen(new Uint16Array(shared, 0, 2))],
          ["memory itself, not a view of it: no bytes", () => blobs.toUint8Array(bytes("0102").buffer)],
          ["a text: no bytes", () => blobs.toUint8Array("0102")],
          ["nothing at all", () => blobs.toUint8Array(undefined)],
        ]),
        ...(() => {
          // Where the runtime has no shared memory, every view is over the memory it was given.
          const kept = Object.getOwnPropertyDescriptor(globalThis, "SharedArrayBuffer");
          const view = new Uint8Array(shared, 1, 2);
          delete globalThis.SharedArrayBuffer;
          try {
            const made = blobs.toUint8Array(view);
            return { whereTheRuntimeKnowsNoSharedMemory: { bytes: made, sameMemory: made.buffer === shared, plain: seen(bytes("0a")) } };
          } finally {
            Object.defineProperty(globalThis, "SharedArrayBuffer", kept);
          }
        })(),
      };
    },
  },
  {
    name: "a blob's key is the SHA-256 of its bytes",
    run: async ({ blobs }) => {
      const given = bytes("616263");
      const key = await blobs.getBlobId(given);
      const shared = new SharedArrayBuffer(3);
      new Uint8Array(shared).set([0x61, 0x62, 0x63]);
      const promise = blobs.getBlobId(undefined);
      const nothing = await outcome(() => promise);
      const changing = bytes("616263");
      const whileChanging = blobs.getBlobId(changing);
      changing.fill(0);
      return {
        ofAbc: key,
        bytesWrittenOverRightAfterTheCallDoNotChangeTheKey: hex(await whileChanging) === hex(key),
        thirtyTwoNewBytes: key.constructor === Uint8Array && key.length === 32 && key !== given && key.byteOffset === 0,
        theBytesGivenAreUntouched: hex(given),
        aNewKeyEachTime: (await blobs.getBlobId(given)) !== key,
        ...(await tableLater(
          [
            ["no bytes", new Uint8Array()],
            ["one zero", bytes("00")],
            ["the text hello", utf8("hello")],
            ["a view into the middle of longer memory: only what the view shows", bytes("ff616263ff").subarray(1, 4)],
            ["a Node buffer", RealBuffer.from("abc")],
            ["bytes over shared memory", new Uint8Array(shared)],
            ["a thousand and one bytes", new Uint8Array(1_001).fill(0xab)],
            ["memory itself, not a view of it: the key of no bytes", bytes("616263").buffer],
            ["a text: the key of no bytes", "abc"],
          ].map(([words, value]) => [words, () => blobs.getBlobId(value)]),
        )),
        nothingAtAll: { aPromiseAllTheSame: promise instanceof Promise, ...nothing },
      };
    },
  },
  {
    name: "the store in memory keeps each blob under the hex of its key and hands back the very bytes it was given",
    run: ({ blobs }) =>
      withClock(0.25, async (reads) => {
        const { ctx, told } = surroundings();
        const store = new blobs.InMemoryBlobStore();
        const key = bytes("0102");
        const first = bytes("aa");
        const second = bytes("bbcc");
        const answers = {};
        answers.saysNothingOfDurability = !("isBlobDurable" in store) && blobs.isBlobDurable(store, key);
        answers.beforeAnything = await store.getBlob(ctx, key);
        const storing = store.setBlob(ctx, key, first);
        answers.storingGivesAPromiseOfNothing = [storing instanceof Promise, await storing];
        const reading = store.getBlob(ctx, key);
        const read = await reading;
        answers.readBack = { aPromise: reading instanceof Promise, bytes: read, theVeryBytesGiven: read === first };
        answers.underTheSameKeyFromOtherMemory = (await store.getBlob(ctx, bytes("ff0102ff").subarray(1, 3))) === first;
        answers.aKeyGivenAsItsHexIsAnotherKey = await store.getBlob(ctx, "0102");
        await store.setBlob(ctx, bytes("0102"), second);
        answers.storedAgainUnderTheSameKey = (await store.getBlob(ctx, key)) === second;
        answers.locallyOnly = await store.setBlobLocallyOnly(ctx, bytes("03"), first);
        answers.locallyOnlyIsKeptTheSameWay = (await store.getBlob(ctx, bytes("03"))) === first;
        const flushing = store.flush(ctx);
        answers.flushGivesAPromiseOfNothing = [flushing instanceof Promise, await flushing];
        answers.anEmptyKeyIsAKey = [await store.setBlob(ctx, new Uint8Array(), second), (await store.getBlob(ctx, new Uint8Array())) === second];
        answers.anotherStoreHasNothing = await new blobs.InMemoryBlobStore().getBlob(ctx, key);
        answers.timesTheClockWasRead = reads.count;
        answers.told = told;
        return answers;
      }),
  },
  {
    name: "the store in memory fails at once, not through its promise, when a key or a context cannot be used",
    run: ({ blobs }) =>
      withClock(2, async (reads) => {
        const { ctx, told } = surroundings();
        const store = new blobs.InMemoryBlobStore();
        const key = bytes("0102");
        const data = bytes("aa");
        const noKeyRead = await outcome(() => store.getBlob(ctx, undefined));
        const noKeyWrite = await outcome(() => store.setBlob(ctx, undefined, data));
        const toldForNoKey = told.splice(0);
        const deafWrite = await outcome(() => store.setBlob({}, key, data));
        const keptAllTheSame = (await store.getBlob(ctx, key)) === data;
        const deafRead = await outcome(() => store.getBlob({}, key));
        const noContext = await outcome(() => store.getBlob(undefined, key));
        const deafFlush = await outcome(() => store.flush(undefined));
        const mine = [];
        class Noting extends blobs.InMemoryBlobStore {
          setBlob(...given) {
            mine.push(`my setBlob ${hex(given[1])}`);
            return super.setBlob(...given);
          }
        }
        await new Noting().setBlobLocallyOnly(ctx, bytes("09"), data);
        return {
          readingUnderNoKey: noKeyRead,
          writingUnderNoKey: noKeyWrite,
          theTimeIsToldAllTheSame: toldForNoKey.map((entry) => [entry.histogram, entry.value]),
          writingWithAContextThatCannotBeAsked: deafWrite,
          theBlobWasKeptBeforeItFailed: keptAllTheSame,
          readingWithAContextThatCannotBeAsked: deafRead,
          readingWithNoContext: noContext,
          flushingWithNoContext: deafFlush,
          aStoreBuiltOnItIsAskedThroughItsOwnSetBlob: mine,
          timesTheClockWasRead: reads.count,
        };
      }),
  },

  // ---- blob-not-found-error ---------------------------------------------
  {
    name: "the error for missing data says how many blobs are missing and shows up to three keys, twelve characters of each",
    run: ({ notFound }) =>
      table(
        [
          ["no key", []],
          ["one key", ["aabbccddeeff00112233"]],
          ["a key of eleven characters", ["0123456789a"]],
          ["a key of twelve", ["0123456789ab"]],
          ["a key of thirteen", ["0123456789abc"]],
          ["two keys", ["aabbccddeeff00112233", "b"]],
          ["three keys", ["a", "b", "c"]],
          ["four keys: the fourth is only counted", ["a", "b", "c", "d"]],
          ["five keys, one of them empty", ["0123456789ab", "0123456789abcdef", "", "x", "y"]],
          ["one empty key", [""]],
          ["keys that are no hex are shown as they are", ["not hex at all, but long"]],
        ].map(([words, keys]) => [words, () => new notFound.BlobNotFoundError(keys).message]),
      ),
  },
  {
    name: "the error for missing data: what it holds, how it prints, what it is an instance of",
    run: ({ notFound }) => {
      const given = ["aabbccddeeff00112233", "0102"];
      const error = new notFound.BlobNotFoundError(given);
      given.push("added after");
      const why = new Error("the disk was wiped");
      return {
        ...toldOf(error),
        held: held(error),
        anError: error instanceof Error,
        ofItsOwnClass: error instanceof notFound.BlobNotFoundError && Object.getPrototypeOf(error) === notFound.BlobNotFoundError.prototype,
        theNameIsAFieldOfEachErrorAndNotOfTheClass: !Object.hasOwn(notFound.BlobNotFoundError.prototype, "name"),
        theKeysAreACopy: error.blobIdHexes,
        causes: table([
          ["no options", () => toldOf(new notFound.BlobNotFoundError(["0a"])).ownNames],
          ["options with nothing in them", () => toldOf(new notFound.BlobNotFoundError(["0a"], {})).ownNames],
          ["a cause that is undefined is no cause", () => toldOf(new notFound.BlobNotFoundError(["0a"], { cause: undefined })).ownNames],
          ["a cause that is null is a cause", () => held(new notFound.BlobNotFoundError(["0a"], { cause: null })).cause],
          ["a cause that is 0 is a cause", () => held(new notFound.BlobNotFoundError(["0a"], { cause: 0 })).cause],
          ["an error as the cause", () => {
            const made = new notFound.BlobNotFoundError(["0a"], { cause: why, more: "not kept" });
            return { ownNames: toldOf(made).ownNames, theVeryError: made.cause === why, listed: Object.keys(made), asJson: JSON.stringify(made) };
          }],
          ["options that are null", () => toldOf(new notFound.BlobNotFoundError(["0a"], null)).ownNames],
          ["options that are a text", () => toldOf(new notFound.BlobNotFoundError(["0a"], "because")).ownNames],
        ]),
        whatIsNoListOfTexts: table([
          ["numbers", () => new notFound.BlobNotFoundError([1, 2])],
          ["one number", () => new notFound.BlobNotFoundError([1])],
          ["a text", () => new notFound.BlobNotFoundError("aabbcc")],
          ["a set", () => new notFound.BlobNotFoundError(new Set(["0a"]))],
          ["something with a length of zero that cannot be gone through", () => new notFound.BlobNotFoundError({ length: 0 })],
          ["nothing at all", () => new notFound.BlobNotFoundError()],
          ["a list holding nothing", () => new notFound.BlobNotFoundError([undefined])],
        ]),
      };
    },
  },
  {
    name: "the error for missing data is looked for in an error and the causes under it, ten deep at most",
    run: ({ notFound }) => {
      const missing = new notFound.BlobNotFoundError(["0a"]);
      /** `depth` errors one inside the other, with `innermost` as the cause of the last. */
      const under = (depth, innermost) => {
        let error = innermost;
        for (let level = 0; level < depth; level += 1) error = new Error(`level ${depth - level}`, { cause: error });
        return error;
      };
      const which = (found) => (found === missing ? "the error for missing data" : found === undefined ? "nothing" : found);
      const flagged = Object.assign(new Error("flagged"), { isBlobNotFound: true });
      const named = Object.assign(new Error("named"), { name: "BlobNotFoundError" });
      class Later extends notFound.BlobNotFoundError {}
      const later = new Later(["0b"]);
      const circle = new Error("round");
      circle.cause = new Error("and round", { cause: circle });
      const reads = [];
      const counting = {
        get cause() {
          reads.push("cause");
          return missing;
        },
      };
      const foreign = vm.runInNewContext("const e = new Error('from elsewhere'); e.name = 'BlobNotFoundError'; e.isBlobNotFound = true; e");
      const foreignAround = vm.runInNewContext("(cause) => new Error('a wrapper from elsewhere', { cause })");
      const inherited = Object.create({ cause: missing });
      return {
        ...table([
          ["the error itself", () => which(notFound.findBlobNotFoundError(missing))],
          ["as the cause of another", () => which(notFound.findBlobNotFoundError(under(1, missing)))],
          ["nine errors down: found", () => which(notFound.findBlobNotFoundError(under(9, missing)))],
          ["ten errors down: not looked at", () => which(notFound.findBlobNotFoundError(under(10, missing)))],
          ["an error of a class built on it", () => notFound.findBlobNotFoundError(later) === later],
          ["any error that carries the flag", () => notFound.findBlobNotFoundError(under(2, flagged)) === flagged],
          ["any error that carries the name", () => notFound.findBlobNotFoundError(under(2, named)) === named],
          ["a flag of 1 is no flag", () => which(notFound.findBlobNotFoundError(Object.assign(new Error("almost"), { isBlobNotFound: 1 })))],
          ["a name in other letters is another name", () => which(notFound.findBlobNotFoundError(Object.assign(new Error("almost"), { name: "blobnotfounderror" })))],
          ["the first of two is the one found", () => notFound.findBlobNotFoundError(Object.assign(new Error("outer"), { isBlobNotFound: true, cause: missing })) !== missing],
          ["an object that is no error, with the flag and the name: not it", () => which(notFound.findBlobNotFoundError({ isBlobNotFound: true, name: "BlobNotFoundError", message: "looks like one" }))],
          ["an object that is no error, with the error as its cause: its cause is followed", () => which(notFound.findBlobNotFoundError({ cause: missing }))],
          ["a cause it has only from what it was made from is followed too", () => which(notFound.findBlobNotFoundError(inherited))],
          ["an ordinary error with no cause", () => which(notFound.findBlobNotFoundError(new Error("plain")))],
          ["causes that go round in a circle", () => which(notFound.findBlobNotFoundError(circle))],
          ["an error from another realm, with the flag and the name: not it", () => which(notFound.findBlobNotFoundError(foreign))],
          ["a wrapper from another realm around the error: its cause is followed", () => which(notFound.findBlobNotFoundError(foreignAround(missing)))],
          ["a function with a cause: not followed", () => which(notFound.findBlobNotFoundError(Object.assign(() => {}, { cause: missing })))],
          ["a text", () => which(notFound.findBlobNotFoundError("BlobNotFoundError"))],
          ["a number", () => which(notFound.findBlobNotFoundError(404))],
          ["null", () => which(notFound.findBlobNotFoundError(null))],
          ["nothing at all", () => which(notFound.findBlobNotFoundError())],
          ["a cause that is null", () => which(notFound.findBlobNotFoundError(new Error("no more", { cause: null })))],
        ]),
        aCauseIsReadOncePerLevel: [which(notFound.findBlobNotFoundError(counting)), reads],
      };
    },
  },

  // ---- typed-blob-store ---------------------------------------------------
  {
    name: "the key a store's metadata callback is kept under is one every build of the engine shares",
    run: ({ typed }) => ({
      written: String(typed.BLOB_METADATA_CALLBACK_SYMBOL),
      sharedByName: typed.BLOB_METADATA_CALLBACK_SYMBOL === Symbol.for("sand.blobMetadataCallback"),
      knownAs: Symbol.keyFor(typed.BLOB_METADATA_CALLBACK_SYMBOL),
    }),
  },
  {
    name: "a store's metadata callback is what the store has under that key, if it has the key at all",
    run: ({ typed }) => {
      const KEY = typed.BLOB_METADATA_CALLBACK_SYMBOL;
      const callback = () => {};
      const traps = [];
      const watched = (target, has = Reflect.has) =>
        new Proxy(target, {
          has(inside, key) {
            traps.push(`has ${String(key)}`);
            return has(inside, key);
          },
          get(inside, key) {
            traps.push(`get ${String(key)}`);
            return Reflect.get(inside, key);
          },
        });
      const which = (found) => (found === callback ? "the callback" : found);
      return {
        ...table([
          ["a store without the key", () => which(typed.getBlobMetadataCallback(keeping().store))],
          ["a store with a callback under the key", () => which(typed.getBlobMetadataCallback({ [KEY]: callback }))],
          ["a store with the key and nothing under it", () => which(typed.getBlobMetadataCallback({ [KEY]: undefined }))],
          ["a store with something else under the key: handed on as it is", () => which(typed.getBlobMetadataCallback({ [KEY]: "not a function" }))],
          ["a store that has the key from what it was made from", () => which(typed.getBlobMetadataCallback(Object.create({ [KEY]: callback })))],
          ["a typed store made with a callback", () => which(typed.getBlobMetadataCallback(new typed.TypedBlobStore(keeping().store, callback)))],
          ["a typed store made without one", () => which(typed.getBlobMetadataCallback(new typed.TypedBlobStore(keeping().store)))],
          ["a typed store around a store with a callback: the outer one's own, which is none", () => which(typed.getBlobMetadataCallback(new typed.TypedBlobStore({ [KEY]: callback })))],
          ["a function with the key", () => which(typed.getBlobMetadataCallback(Object.assign(() => {}, { [KEY]: callback })))],
          ["nothing at all", () => typed.getBlobMetadataCallback(undefined)],
          ["null", () => typed.getBlobMetadataCallback(null)],
          ["a number", () => typed.getBlobMetadataCallback(5)],
          ["a text", () => typed.getBlobMetadataCallback("a store")],
        ]),
        aStoreIsAskedWhetherItHasTheKeyThenForIt: [which(typed.getBlobMetadataCallback(watched({ [KEY]: callback }))), traps.splice(0)],
        aStoreThatSaysItHasNoKeyIsNotAskedForIt: [which(typed.getBlobMetadataCallback(watched({ [KEY]: callback }, () => false))), traps.splice(0)],
      };
    },
  },
  {
    name: "a typed store hands every call to the store inside it and gives back the very promise it got",
    run: async ({ typed }) => {
      const calls = [];
      const promises = {};
      const inner = {};
      const handed = {};
      for (const method of ["getBlob", "setBlob", "setBlobLocallyOnly", "flush"]) {
        inner[method] = function (...given) {
          calls.push({ [method]: given.length, onTheStoreInside: this === inner });
          handed[method] = given;
          promises[method] = Promise.resolve(`what ${method} gave`);
          return promises[method];
        };
      }
      const store = new typed.TypedBlobStore(inner);
      const ctx = { the: "context" };
      const key = bytes("0a");
      const data = bytes("0b");
      const got = {};
      for (const [method, given] of [["getBlob", [ctx, key]], ["setBlob", [ctx, key, data]], ["setBlobLocallyOnly", [ctx, key, data]], ["flush", [ctx]]]) {
        const promise = store[method](...given, "one more than it takes");
        got[method] = { theVeryPromise: promise === promises[method], gave: await promise, givenTheVeryThings: handed[method].every((thing, at) => thing === given[at]) };
      }
      /** What a typed store says of a blob when the store inside answers `answer`, and what that store was asked. */
      const saying = (answer) => {
        const asked = [];
        const within = {
          isBlobDurable(...given) {
            asked.push({ given: given.length, theVeryKey: given[0] === key, onTheStoreInside: this === within });
            return answer;
          },
        };
        return [new typed.TypedBlobStore(within).isBlobDurable(key, "one more than it takes"), asked];
      };
      return {
        calls,
        got,
        theStoreInside: store.getInnerBlobStore() === inner,
        aTypedStoreIsATypedStore: store instanceof typed.TypedBlobStore,
        durable: table([
          ["the store inside cannot be asked", () => new typed.TypedBlobStore({}).isBlobDurable(key)],
          ["it says yes", () => saying(true)],
          ["it says no", () => saying(false)],
          ["it says nothing", () => saying(undefined)],
          ["it says null: null is handed on", () => saying(null)],
          ["it says 0: 0 is handed on", () => saying(0)],
          ["its question is null", () => new typed.TypedBlobStore({ isBlobDurable: null }).isBlobDurable(key)],
          ["its question is no function", () => new typed.TypedBlobStore({ isBlobDurable: "yes" }).isBlobDurable(key)],
        ]),
        whatTheStoreInsideLacks: await tableLater([
          ["a store inside with no getBlob", () => new typed.TypedBlobStore({}).getBlob(ctx, key)],
          ["no store inside", () => new typed.TypedBlobStore(undefined).flush(ctx)],
          ["a store inside whose setBlob fails at once: so does the typed store's", () => new typed.TypedBlobStore({ setBlob: () => { throw new Error("refused at once"); } }).setBlob(ctx, key, data)],
        ]),
      };
    },
  },
  {
    name: "unwrapping a store gives the store inside all the typed stores around it",
    run: ({ typed }) => {
      const inner = keeping().store;
      const once = new typed.TypedBlobStore(inner);
      const twice = new typed.TypedBlobStore(once, () => {});
      let deep = inner;
      for (let level = 0; level < 500; level += 1) deep = new typed.TypedBlobStore(deep);
      const elsewhere = keeping().store;
      const asked = [];
      class Pointing extends typed.TypedBlobStore {
        getInnerBlobStore() {
          asked.push("asked for the store inside");
          return elsewhere;
        }
      }
      return table([
        ["a store that is not typed: itself", () => typed.unwrapBlobStore(inner) === inner],
        ["one typed store around it", () => typed.unwrapBlobStore(once) === inner],
        ["two", () => typed.unwrapBlobStore(twice) === inner],
        ["five hundred", () => typed.unwrapBlobStore(deep) === inner],
        ["a typed store around nothing", () => typed.unwrapBlobStore(new typed.TypedBlobStore(undefined))],
        ["a store built on the typed store is asked for the store inside it", () => [typed.unwrapBlobStore(new Pointing(inner)) === elsewhere, asked]],
        ["something that only looks like a typed store: itself", () => {
          const lookalike = { getInnerBlobStore: () => inner };
          return typed.unwrapBlobStore(lookalike) === lookalike;
        }],
        ["nothing at all", () => typed.unwrapBlobStore(undefined)],
        ["null", () => typed.unwrapBlobStore(null)],
        ["a number", () => typed.unwrapBlobStore(5)],
      ]);
    },
  },
  {
    name: "a blob that must be readable from the mirror: the innermost store is asked to wait for its second copy, or else the store given is written and flushed",
    run: async ({ typed }) => {
      const ctx = { the: "context" };
      const blobId = bytes("0a");
      const blobData = bytes("0b0c");
      /** A store that notes its calls; with `waits`, it has the call that waits for the second copy. */
      const noting = (events, { waits } = {}) => {
        const { store } = keeping({}, { events });
        if (waits !== undefined) {
          store.setBlobAwaitingSecondary = waits === "a function" ? function (...given) {
            events.push({ setBlobAwaitingSecondary: [given[0] === ctx, given[1] === blobId, given[2] === blobData, given.length], onTheInnermostStore: this === store });
            return Promise.resolve("what the wait gave");
          } : waits;
        }
        return store;
      };
      const through = async (make) => {
        const events = [];
        const gave = await outcome(() => typed.setBlobReadableFromCloudMirror({ blobStore: make(events), ctx, blobId, blobData }));
        return { gave, events };
      };
      const order = [];
      const slow = later();
      const ordered = {
        getBlob: () => Promise.resolve(undefined),
        setBlob: () => {
          order.push("setBlob asked");
          return slow.promise;
        },
        setBlobLocallyOnly: () => Promise.resolve(),
        flush: () => {
          order.push("flush asked");
          return Promise.resolve();
        },
      };
      const waiting = typed.setBlobReadableFromCloudMirror({ blobStore: ordered, ctx, blobId, blobData });
      await settle();
      order.push("setBlob still under way");
      slow.resolve();
      await waiting;
      // What is read from the options, and when: before the write, and again before the flush.
      const reads = [];
      const values = { blobStore: noting(reads), ctx, blobId, blobData };
      const options = {};
      for (const name of Object.keys(values)) {
        Object.defineProperty(options, name, {
          get() {
            reads.push(`read ${name}`);
            return values[name];
          },
        });
      }
      await typed.setBlobReadableFromCloudMirror(options);
      const waitReads = [];
      const waitValues = { blobStore: noting(waitReads, { waits: "a function" }), ctx, blobId, blobData };
      const waitOptions = {};
      for (const name of Object.keys(waitValues)) {
        Object.defineProperty(waitOptions, name, {
          get() {
            waitReads.push(`read ${name}`);
            return waitValues[name];
          },
        });
      }
      await typed.setBlobReadableFromCloudMirror(waitOptions);
      return {
        aStoreThatCanWait: await through((events) => noting(events, { waits: "a function" })),
        aStoreThatCanWaitInsideTwoTypedStores: await through((events) => new typed.TypedBlobStore(new typed.TypedBlobStore(noting(events, { waits: "a function" })))),
        aStoreThatCannot: await through((events) => noting(events)),
        aStoreThatCannotInsideATypedStore: await through((events) => new typed.TypedBlobStore(noting(events))),
        aTypedStoreThatCouldWaitAroundAStoreThatCannot: await through((events) => {
          const outer = new typed.TypedBlobStore(noting(events));
          outer.setBlobAwaitingSecondary = () => {
            events.push("the outer store was asked to wait");
            return Promise.resolve();
          };
          return outer;
        }),
        aWaitThatIsNoFunction: await through((events) => noting(events, { waits: true })),
        theFlushComesOnlyOnceTheWriteIsDone: order,
        aWriteThatFails: await through((events) => {
          const store = noting(events);
          store.setBlob = () => {
            events.push("setBlob refused");
            return Promise.reject(new Error("the write failed"));
          };
          return store;
        }),
        aFlushThatFails: await through((events) => {
          const store = noting(events);
          store.flush = () => Promise.reject(new Error("the flush failed"));
          return store;
        }),
        aWaitThatFails: await through((events) => noting(events, { waits: () => Promise.reject(new Error("the wait failed")) })),
        noStore: await outcome(() => typed.setBlobReadableFromCloudMirror({ ctx, blobId, blobData })),
        noOptions: await outcome(() => typed.setBlobReadableFromCloudMirror()),
        whatIsReadFromTheOptionsAndWhen: reads,
        andWhenTheStoreCanWait: waitReads.map((event) => (typeof event === "string" ? event : "setBlobAwaitingSecondary")),
      };
    },
  },

  // ---- reference -----------------------------------------------------------
  {
    name: "a value that writes itself is told from others by a class that holds nothing",
    run: ({ reference }) => {
      class Own extends reference.Writeable {
        writeToBlobStore() {
          return Promise.resolve(bytes("0a"));
        }
      }
      const plainOne = new reference.Writeable();
      return {
        fields: Object.keys(plainOne),
        hasAWayToWriteItself: "writeToBlobStore" in plainOne,
        aClassBuiltOnItIsOne: new Own() instanceof reference.Writeable,
        somethingThatOnlyLooksLikeOneIsNot: { writeToBlobStore() {} } instanceof reference.Writeable,
      };
    },
  },
  {
    name: "an eager reference holds its value, and writes it under the hash of its bytes when asked",
    run: async ({ reference, typed }) => {
      const events = [];
      const { store, contexts } = keeping({}, { events });
      const told = [];
      const calledOn = [];
      store[typed.BLOB_METADATA_CALLBACK_SYMBOL] = function (metadata) {
        events.push({ callback: metadata });
        told.push(metadata);
        calledOn.push(this === store ? "the store" : this === undefined ? "nothing" : "something else");
      };
      const kind = { kind: "string" };
      const serde = notingSerde(events, kind);
      const ctx = { the: "context" };
      const ref = new reference.EagerReference(serde, store, "hello");
      const reading = ref.get("any context, never used");
      const answers = { getGivesAPromiseOfTheValue: [reading instanceof Promise, await reading], nothingAskedYet: [...events] };
      const key = await ref.writeToBlobStore(ctx);
      answers.firstWrite = {
        key,
        isTheHashOfTheBytes: hex(key) === KEY_OF.hello,
        events: events.splice(0),
        theCallbackGotTheVeryKey: told[0].blobId === key,
        theCallbackGotTheVeryKindTheSerdeGave: told[0].blobType === kind,
        theCallbackWasCalledOn: calledOn[0],
        whatTheCallbackGot: Object.keys(told[0]),
        lastWritten: ref.lastWrittenValue,
        lastWrittenKeyIsTheVeryKey: ref.lastWrittenValue.blobId === key,
        lastWrittenBytesAreTheOnesStored: ref.lastWrittenValue.blobData === (await store.getBlob(ctx, key)),
      };
      events.splice(0);
      const again = await ref.writeToBlobStore(ctx);
      answers.writtenAgainUnchanged = { theVeryKey: again === key, events: events.splice(0) };
      ref.set("hello");
      answers.setToTheSameText = { theVeryKey: (await ref.writeToBlobStore(ctx)) === key, events: events.splice(0) };
      ref.set("other");
      answers.setToAnotherText = { read: await ref.get(ctx), key: await ref.writeToBlobStore(ctx), events: events.splice(0), value: ref.value };
      answers.everyCallGotTheContext = contexts.every((given) => given === ctx);
      return answers;
    },
  },
  {
    name: "an eager reference writes again what its store does not hold for good, and tells of a new blob only when there is a callback and a kind to tell",
    run: async ({ reference, typed }) => {
      const KEY = typed.BLOB_METADATA_CALLBACK_SYMBOL;
      const ctx = { the: "context" };
      /** Two writes of one value, in a store that answers `durable` and a serde that says `blobType`. */
      const twice = async ({ durable, blobType, callback = true }) => {
        const events = [];
        const { store } = keeping({}, { events, durable });
        if (callback === true) store[KEY] = (metadata) => events.push({ callback: metadata });
        else if (callback !== false) store[KEY] = callback;
        const ref = new reference.EagerReference(notingSerde(events, blobType), store, "hello");
        const first = await outcome(() => ref.writeToBlobStore(ctx));
        const firstEvents = events.splice(0);
        const second = await outcome(() => ref.writeToBlobStore(ctx));
        return { first: firstEvents, second: events, sameKey: first === second, key: first instanceof Uint8Array ? hex(first) === KEY_OF.hello : first };
      };
      const list = ["a", "list"];
      const other = ["a", "list"];
      const events = [];
      const listRef = new reference.EagerReference(notingSerde(events), keeping({}, { events }).store, list);
      await listRef.writeToBlobStore(ctx);
      list.push("changed in place");
      await listRef.writeToBlobStore(ctx);
      const afterChangeInPlace = events.splice(0);
      listRef.set(other);
      await listRef.writeToBlobStore(ctx);
      const promised = Promise.resolve("a promise's value");
      // The store is asked for its callback once the bytes are hashed, before the serde is asked what they are.
      const lookedUp = [];
      const asking = keeping({}, { events: lookedUp }).store;
      Object.defineProperty(asking, KEY, {
        get() {
          lookedUp.push("the store is asked for its callback");
          return (metadata) => lookedUp.push({ callback: metadata });
        },
      });
      await new reference.EagerReference(notingSerde(lookedUp), asking, "hello").writeToBlobStore(ctx);
      return {
        whenTheStoreIsAskedForItsCallback: lookedUp,
        ...(await tableLater([
          ["a store that says nothing of how long it holds", () => twice({})],
          ["a store that holds for good", () => twice({ durable: true })],
          ["a store that does not: the same key and bytes are stored again, and nothing is told", () => twice({ durable: false })],
          ["a store that answers null, which is not yes", () => twice({ durable: null })],
          ["a serde that says nothing of its blobs: nothing is told", () => twice({ blobType: "none" })],
          ["a serde that says undefined: nothing is told", () => twice({ blobType: "no answer" })],
          ["a serde that says null: nothing is told", () => twice({ blobType: null })],
          ["a store with no callback", () => twice({ callback: false })],
          ["a store whose callback is no function", () => twice({ callback: "not a function" })],
          ["a store whose callback is 0: nothing is told", () => twice({ callback: 0 })],
        ])),
        aListChangedInPlaceIsNotWrittenAgain: afterChangeInPlace,
        anotherListOfTheSameWordsIs: events.splice(0),
        aValueThatIsAPromiseIsHandedBackAsItIs: new reference.EagerReference(notingSerde([]), keeping().store, promised).get(ctx) === promised,
      };
    },
  },
  {
    name: "an eager reference whose value writes itself lets it, and asks nothing of its own store or serde",
    run: async ({ reference }) => {
      const events = [];
      const ctx = { the: "context" };
      class Own extends reference.Writeable {
        writeToBlobStore(...given) {
          events.push({ theValueWasAskedToWriteItself: given.length, withTheContext: given[0] === ctx, onTheValue: this === value });
          return Promise.resolve(bytes("0a0b"));
        }
      }
      const value = new Own();
      const ref = new reference.EagerReference(notingSerde(events), keeping({}, { events, durable: false }).store, value);
      const key = await ref.writeToBlobStore(ctx);
      const again = await ref.writeToBlobStore(ctx);
      class Failing extends reference.Writeable {
        writeToBlobStore() {
          throw new Error("could not write itself");
        }
      }
      return {
        key,
        again,
        events,
        lastWritten: ref.lastWrittenValue,
        aValueThatFailsAtOnceFailsThroughThePromise: await outcome(() => new reference.EagerReference(notingSerde([]), keeping().store, new Failing()).writeToBlobStore(ctx)),
        aValueOfTheClassThatCannotWrite: await outcome(() => new reference.EagerReference(notingSerde([]), keeping().store, new reference.Writeable()).writeToBlobStore(ctx)),
      };
    },
  },
  {
    name: "an eager reference: a value of undefined, a write that fails, a value set while a write is under way",
    run: async ({ reference }) => {
      const ctx = { the: "context" };
      // undefined, never written: there is no last write to compare with, yet it counts as the same.
      const never = new reference.EagerReference(notingSerde([]), keeping().store, undefined);
      const neverWritten = await outcome(() => never.writeToBlobStore(ctx));
      // set to undefined after a write: written as the word.
      const events = [];
      const afterOne = new reference.EagerReference(notingSerde(events), keeping({}, { events }).store, "first");
      await afterOne.writeToBlobStore(ctx);
      events.splice(0);
      afterOne.set(undefined);
      const undefinedAfterAWrite = await outcome(() => afterOne.writeToBlobStore(ctx));
      const undefinedEvents = events.splice(0);
      // a write the store refuses.
      const refusing = keeping({}, { events });
      let refuse = true;
      const realSet = refusing.store.setBlob;
      refusing.store.setBlob = (...given) => {
        if (!refuse) return realSet(...given);
        events.push("setBlob refused");
        return Promise.reject(new Error("the store is full"));
      };
      const refused = new reference.EagerReference(notingSerde(events), refusing.store, "hello");
      const firstTry = await outcome(() => refused.writeToBlobStore(ctx));
      const afterRefusal = { lastWritten: refused.lastWrittenValue, events: events.splice(0) };
      refuse = false;
      const secondTry = await outcome(() => refused.writeToBlobStore(ctx));
      const secondEvents = events.splice(0);
      // a serde that fails.
      const failingSerde = { serialize: () => { throw new Error("cannot be written as bytes"); } };
      const serdeFails = await outcome(() => new reference.EagerReference(failingSerde, keeping().store, "hello").writeToBlobStore(ctx));
      // a value set while the store is writing the one before.
      const racing = keeping({}, { events });
      const racingSet = racing.store.setBlob;
      let raced;
      racing.store.setBlob = (...given) => {
        raced.set("second");
        return racingSet(...given);
      };
      raced = new reference.EagerReference(notingSerde(events), racing.store, "first");
      const firstKey = await raced.writeToBlobStore(ctx);
      racing.store.setBlob = racingSet;
      const afterRace = { events: events.splice(0), lastWritten: raced.lastWrittenValue };
      const secondKey = await raced.writeToBlobStore(ctx);
      return {
        undefinedNeverWritten: neverWritten,
        undefinedAfterAWrite: [undefinedAfterAWrite, undefinedEvents],
        aWriteTheStoreRefuses: { firstTry, ...afterRefusal, secondTry: secondTry instanceof Uint8Array ? hex(secondTry) === KEY_OF.hello : secondTry, secondEvents },
        aSerdeThatFails: serdeFails,
        aValueSetWhileTheWriteIsUnderWay: { ...afterRace, theSecondValueCountsAsWritten: secondKey === firstKey, nothingMoreIsStored: events.splice(0), read: await raced.get(ctx) },
      };
    },
  },
  {
    name: "a lazy reference asks its store for the blob once, when its value is first asked for",
    run: async ({ reference }) => {
      const events = [];
      const { store, contexts } = keeping({ "0a": utf8("stored text") }, { events });
      const ctx = { the: "context" };
      const key = bytes("0a");
      const ref = new reference.LazyReference(notingSerde(events), store, key);
      const answers = { nothingAskedWhenMade: [...events] };
      const unloaded = await ref.writeToBlobStore(ctx);
      answers.writtenBeforeItWasRead = { theVeryKeyItWasMadeWith: unloaded === key, events: [...events] };
      const first = ref.get(ctx);
      const second = ref.get(ctx);
      answers.eachAskingGivesItsOwnPromise = first instanceof Promise && second instanceof Promise && first !== second && first !== ref.valuePromise;
      answers.read = [await first, await second];
      answers.oneLoadForBoth = events.splice(0);
      answers.readAgain = [await ref.get(ctx), events.splice(0)];
      answers.afterTheLoad = { lastWrittenValue: ref.lastWrittenValue, lastWrittenBlobDataIsTheVeryBlob: ref.lastWrittenBlobData === (await store.getBlob(ctx, key)), blobId: ref.blobId === key, valuePromiseGivesTheValue: await ref.valuePromise };
      answers.everyCallGotTheContext = contexts.every((given) => given === ctx);
      const empty = new reference.LazyReference(notingSerde([]), keeping({ "0b": new Uint8Array() }).store, bytes("0b"));
      answers.aBlobOfNoBytesIsABlob = await outcome(() => empty.get(ctx));
      return answers;
    },
  },
  {
    name: "a lazy reference whose blob is not there fails with the error for missing data, and keeps failing with it",
    run: async ({ reference, notFound }) => {
      const events = [];
      const { store, kept } = keeping({}, { events });
      const ctx = { the: "context" };
      const ref = new reference.LazyReference(notingSerde(events), store, bytes("0a0b0c0d0e0f1011"));
      const first = await outcome(() => ref.get(ctx));
      const firstError = first.rejected;
      kept.set("0a0b0c0d0e0f1011", utf8("stored now"));
      const second = await outcome(() => ref.get(ctx));
      const writing = await outcome(() => ref.writeToBlobStore(ctx));
      const fresh = await outcome(() => new reference.LazyReference(notingSerde([]), store, bytes("0a0b0c0d0e0f1011")).get(ctx));
      // The key is read when the answer comes, not when the question is asked.
      const slow = later();
      const moved = new reference.LazyReference(notingSerde([]), { getBlob: () => slow.promise }, bytes("0a"));
      const pending = outcome(() => moved.get(ctx));
      moved.blobId = bytes("0b");
      slow.resolve(undefined);
      return {
        first: toldOf(firstError),
        ofItsClass: firstError instanceof notFound.BlobNotFoundError,
        afterTheBlobWasStored: { theVeryError: second.rejected === firstError },
        writingIt: { theVeryError: writing.rejected === firstError },
        events,
        afterTheFailure: { lastWrittenValue: ref.lastWrittenValue, lastWrittenBlobData: ref.lastWrittenBlobData },
        aNewReferenceToTheSameKeyReadsIt: fresh,
        theKeyNamedIsTheOneHeldWhenTheAnswerCame: (await pending).rejected.blobIdHexes,
      };
    },
  },
  {
    name: "a lazy reference: a store, a serde or a blob that fails",
    run: async ({ reference }) => {
      const ctx = { the: "context" };
      /** Two readings through one reference, and what was asked for each. */
      const twice = async (store, serde, events) => {
        const ref = new reference.LazyReference(serde, store, bytes("0a"));
        const failures = [];
        const ask = () =>
          outcome(() =>
            ref.get(ctx).catch((error) => {
              failures.push(error);
              throw error;
            }),
          );
        const first = await ask();
        const firstEvents = events.splice(0);
        const second = await ask();
        return { first, firstEvents, second, secondEvents: events.splice(0), theVeryFailureAgain: failures.length === 2 && failures[0] === failures[1] };
      };
      return tableLater([
        ["the store gives null, which is not nothing: the serde is asked to read it", () => {
          const events = [];
          return twice({ getBlob: () => Promise.resolve(null) }, { deserialize: (blob) => (events.push(`deserialize ${blob}`), "read from null") }, events);
        }],
        ["the store fails at once: nothing is kept, and the next asking tries again", () => {
          const events = [];
          let tries = 0;
          const store = { getBlob: () => {
            tries += 1;
            events.push(`getBlob, try ${tries}`);
            if (tries === 1) throw new Error("the store failed at once");
            return Promise.resolve(utf8("second try"));
          } };
          return twice(store, notingSerde(events), events);
        }],
        ["the store fails through its promise: the failure is kept", () => {
          const events = [];
          return twice({ getBlob: () => (events.push("getBlob"), Promise.reject(new Error("the store failed later"))) }, notingSerde(events), events);
        }],
        ["the store gives no promise", () => {
          const events = [];
          return twice({ getBlob: () => (events.push("getBlob"), utf8("not a promise")) }, notingSerde(events), events);
        }],
        ["the serde cannot read the blob: the failure is kept", () => {
          const events = [];
          const { store } = keeping({ "0a": utf8("damaged") }, { events });
          return twice(store, { deserialize: () => { throw new Error("the bytes are damaged"); } }, events);
        }],
        ["the serde fails when asked what its blobs are: the store is not asked, and the next asking tries again", () => {
          const events = [];
          const { store } = keeping({ "0a": utf8("fine") }, { events });
          const serde = notingSerde(events);
          let asked = 0;
          serde.getBlobType = () => {
            asked += 1;
            events.push(`getBlobType, asking ${asked}`);
            if (asked === 1) throw new Error("no kind to tell");
            return { kind: "string" };
          };
          return twice(store, serde, events);
        }],
        ["the serde says its blobs are null", () => {
          const events = [];
          return twice(keeping({ "0a": utf8("fine") }, { events }).store, notingSerde(events, null), events);
        }],
      ]);
    },
  },
  {
    name: "a lazy reference tells of a load that is large (512 KiB or more) or slow to read (100 ms or more), and of no other",
    run: async ({ reference }) => {
      /** One load of `size` bytes whose reading takes `ms`, and what was told of it. */
      const load = (size, ms, blobType = { kind: "string" }) =>
        withClock(ms, async (reads) => {
          const { ctx, told } = surroundings();
          const serde = { deserialize: () => "read" };
          if (blobType !== "none") serde.getBlobType = () => (blobType === "no answer" ? undefined : blobType);
          const ref = new reference.LazyReference(serde, { getBlob: () => Promise.resolve(new Uint8Array(size)) }, bytes("0a"));
          const gave = await outcome(() => ref.get(ctx));
          await ref.get(ctx).catch(() => {});
          return { gave, told, timesTheClockWasRead: reads.count };
        });
      const KIB_512 = 512 * 1024;
      const heavy = (await load(KIB_512, 0)).told;
      return {
        eachMeasureIsHandedLabelsOfItsOwn: new Set(heavy.filter((entry) => entry.labels !== undefined).map((entry) => entry.labels)).size,
        smallAndFast: await load(10, 0),
        oneByteUnderTheSize: await load(KIB_512 - 1, 0),
        atTheSize: await load(KIB_512, 0),
        oneByteOver: (await load(KIB_512 + 1, 0)).told.map((entry) => entry.value ?? entry.log.metadata),
        halfAMillisecondUnderTheTime: await load(10, 99.5),
        atTheTime: await load(10, 100),
        halfAMillisecondOver: (await load(10, 100.5)).told.map((entry) => entry.value ?? entry.log.metadata),
        largeAndSlow: (await load(KIB_512, 250)).told.map((entry) => entry.value ?? entry.log.metadata),
        theKindToldForEachKindOfBlob: await (async () => {
          const kinds = {};
          for (const [words, blobType] of [
              ["a serde that cannot be asked", "none"],
              ["a serde that says undefined", "no answer"],
              ["a message, by its type's name", { kind: "proto", typeName: "agent.v1.ConversationStep" }],
              ["a message with no name", { kind: "proto" }],
              ["JSON", { kind: "json", typeName: "not used" }],
              ["a string", { kind: "string", mimeType: "not used" }],
              ["a picture, by its type", { kind: "image", mimeType: "image/png" }],
              ["a picture with no type", { kind: "image" }],
              ["a file, by its type", { kind: "file", mimeType: "application/pdf" }],
              ["a file with no type", { kind: "file" }],
              ["a file whose type is empty", { kind: "file", mimeType: "" }],
              ["a kind the code does not know: the kind itself", { kind: "video", mimeType: "video/mp4" }],
              ["no kind", {}],
              ["a kind that is a number", { kind: 7 }],
          ]) {
            const { told } = await load(10, 100, blobType);
            kinds[words] = told.map((entry) => (entry.log === undefined ? entry.labels : { blobType: entry.log.metadata.blobType }));
          }
          return kinds;
        })(),
      };
    },
  },
  {
    name: "a lazy reference writes only a value that is not the one it loaded or last wrote",
    run: async ({ reference, typed }) => {
      const ctx = { the: "context" };
      /** A reference to a stored text, the events of its store, serde and callback, and the blob as stored. */
      const made = ({ durable, blobType } = {}) => {
        const events = [];
        const blob = utf8("stored text");
        const { store } = keeping({ "0a": blob }, { events, durable });
        store[typed.BLOB_METADATA_CALLBACK_SYMBOL] = (metadata) => events.push({ callback: metadata });
        const key = bytes("0a");
        return { events, blob, store, key, ref: new reference.LazyReference(notingSerde(events, blobType), store, key) };
      };
      const cases = {};
      {
        const { events, key, ref } = made();
        await ref.get(ctx);
        events.splice(0);
        const written = await ref.writeToBlobStore(ctx);
        cases.loadedThenWritten = { theVeryKey: written === key, events: [...events] };
      }
      {
        const { events, key, ref, blob, store } = made({ durable: false });
        await ref.get(ctx);
        events.splice(0);
        const written = await ref.writeToBlobStore(ctx);
        cases.loadedThenWrittenToAStoreThatDoesNotHoldForGood = { theVeryKey: written === key, events: [...events], theVeryBlobItLoaded: (await store.getBlob(ctx, key)) === blob };
      }
      {
        const { events, key, ref } = made({ durable: true });
        await ref.get(ctx);
        events.splice(0);
        cases.loadedThenWrittenToAStoreThatHoldsForGood = { theVeryKey: (await ref.writeToBlobStore(ctx)) === key, events: [...events] };
      }
      {
        const { events, key, ref, store } = made();
        ref.set("new text");
        const afterSet = { read: await ref.get(ctx), events: events.splice(0) };
        const written = await ref.writeToBlobStore(ctx);
        cases.setWithoutEverLoading = {
          afterSet,
          key: written,
          events: events.splice(0),
          theKeyHeldIsTheNewOne: ref.blobId === written && written !== key,
          lastWrittenValue: ref.lastWrittenValue,
          lastWrittenBlobDataIsWhatWasStored: ref.lastWrittenBlobData === (await store.getBlob(ctx, written)),
          readAfter: await ref.get(ctx),
        };
        events.splice(0);
        cases.setWithoutEverLoading.writtenAgain = { theVeryKey: (await ref.writeToBlobStore(ctx)) === written, events: events.splice(0) };
      }
      {
        const { events, ref } = made({ durable: false });
        ref.set("new text");
        const written = await ref.writeToBlobStore(ctx);
        events.splice(0);
        const again = await ref.writeToBlobStore(ctx);
        cases.setThenWrittenTwiceToAStoreThatDoesNotHoldForGood = { theVeryKey: again === written, events: [...events] };
      }
      {
        const { events, key, ref } = made();
        const loaded = await ref.get(ctx);
        ref.set(loaded);
        events.splice(0);
        cases.setToTheVeryValueItLoaded = { theVeryKey: (await ref.writeToBlobStore(ctx)) === key, events: [...events] };
      }
      {
        const { events, key, ref } = made();
        await ref.get(ctx);
        ref.set("stored text and more");
        events.splice(0);
        const written = await ref.writeToBlobStore(ctx);
        cases.loadedThenSetToAnotherText = { key: written, events: [...events], theKeyHeldIsTheNewOne: ref.blobId === written && written !== key };
      }
      {
        const { events, key, ref } = made({ durable: false });
        ref.set(undefined);
        const written = await ref.writeToBlobStore(ctx);
        cases.setToUndefinedWithoutEverLoading = { theKeyItWasMadeWith: written === key, events: [...events], read: await outcome(() => ref.get(ctx)) };
      }
      {
        const { events, ref } = made();
        await ref.get(ctx);
        ref.set(undefined);
        events.splice(0);
        cases.loadedThenSetToUndefined = { key: await ref.writeToBlobStore(ctx), events: [...events] };
      }
      {
        const { events, ref } = made({ blobType: "none" });
        ref.set("no kind to tell");
        await ref.writeToBlobStore(ctx);
        cases.aSerdeThatSaysNothingOfItsBlobs = events;
      }
      {
        // The store is asked for its callback once the bytes are hashed, before the serde is asked what they are; the callback is called on nothing.
        const { events, ref, store } = made();
        const calledOn = [];
        const kind = { kind: "string" };
        ref.serde.getBlobType = () => (events.push("getBlobType"), kind);
        Object.defineProperty(store, typed.BLOB_METADATA_CALLBACK_SYMBOL, {
          get() {
            events.push("the store is asked for its callback");
            return function (metadata) {
              calledOn.push(this === store ? "the store" : this === undefined ? "nothing" : "something else");
              events.push({ callback: Object.keys(metadata), theVeryKind: metadata.blobType === kind });
            };
          },
        });
        ref.set("new text");
        const written = await ref.writeToBlobStore(ctx);
        cases.whenTheStoreIsAskedForItsCallback = { events: events.map((event) => (typeof event === "string" && event.startsWith("setBlob") ? "setBlob" : event)), calledOn, theCallbackGotTheVeryKey: written === ref.blobId };
      }
      {
        const { events, ref } = made();
        class Own extends reference.Writeable {
          writeToBlobStore(...given) {
            events.push({ theValueWasAskedToWriteItself: given.length, withTheContext: given[0] === ctx });
            return Promise.resolve(bytes("0c0d"));
          }
        }
        ref.set(new Own());
        const written = await ref.writeToBlobStore(ctx);
        cases.aValueThatWritesItself = { key: written, events: [...events], theKeyHeldIsStillTheOld: hex(ref.blobId) };
      }
      {
        const { events, ref, store, key } = made();
        const realSet = store.setBlob;
        store.setBlob = () => Promise.reject(new Error("the store is full"));
        ref.set("new text");
        const refused = await outcome(() => ref.writeToBlobStore(ctx));
        const after = { theKeyHeldIsStillTheOld: ref.blobId === key, lastWrittenValue: ref.lastWrittenValue, lastWrittenBlobData: ref.lastWrittenBlobData };
        store.setBlob = realSet;
        events.splice(0);
        cases.aWriteTheStoreRefuses = { refused, ...after, thenWrittenAgain: await ref.writeToBlobStore(ctx), events: [...events] };
      }
      {
        // The value is set while the blob is still on its way: the blob that arrives is noted as loaded, and the set value is the one written.
        const events = [];
        const slow = later();
        const blob = utf8("stored text");
        const { store } = keeping({}, { events });
        const quick = store.getBlob;
        store.getBlob = (...given) => {
          quick(...given);
          return slow.promise;
        };
        const ref = new reference.LazyReference(notingSerde(events), store, bytes("0a"));
        const loading = ref.get(ctx);
        ref.set("set while loading");
        const readMeanwhile = await ref.get(ctx);
        slow.resolve(blob);
        const loaded = await loading;
        const written = await ref.writeToBlobStore(ctx);
        cases.setWhileTheBlobIsOnItsWay = { readMeanwhile, theFirstAskingStillGetsTheStoredText: loaded, key: written, events, lastWrittenValue: ref.lastWrittenValue };
      }
      return cases;
    },
  },

  {
    name: "a write that waits on a slow store gives the key of whatever was written meanwhile",
    run: async ({ reference }) => {
      const ctx = { the: "context" };
      /** A store that does not hold blobs for good, whose next write waits until it is let go. */
      const slowStore = (blobsByHex, events) => {
        const { store } = keeping(blobsByHex, { events, durable: false });
        const quick = store.setBlob;
        const hold = { next: undefined };
        store.setBlob = (...given) => {
          const done = quick(...given);
          if (hold.next === undefined) return done;
          const waiting = hold.next;
          hold.next = undefined;
          return waiting.promise;
        };
        return { store, hold };
      };
      // Eager: written once; a second write, unchanged, stores the bytes again and waits; meanwhile another value is set and written.
      const eagerEvents = [];
      const eagerStore = slowStore({}, eagerEvents);
      const eager = new reference.EagerReference(notingSerde(eagerEvents), eagerStore.store, "first");
      const firstKey = await eager.writeToBlobStore(ctx);
      eagerEvents.splice(0);
      eagerStore.hold.next = later();
      const letGo = eagerStore.hold.next;
      const waiting = eager.writeToBlobStore(ctx);
      await settle();
      eager.set("second");
      const secondKey = await eager.writeToBlobStore(ctx);
      letGo.resolve();
      const waitedKey = await waiting;
      // Lazy: loaded; a write, unchanged, stores the loaded bytes again and waits; meanwhile another value is set and written.
      const lazyEvents = [];
      const lazyStore = slowStore({ "0a": utf8("stored text") }, lazyEvents);
      const lazy = new reference.LazyReference(notingSerde(lazyEvents), lazyStore.store, bytes("0a"));
      await lazy.get(ctx);
      lazyEvents.splice(0);
      lazyStore.hold.next = later();
      const lazyLetGo = lazyStore.hold.next;
      const lazyWaiting = lazy.writeToBlobStore(ctx);
      await settle();
      lazy.set("second");
      const lazySecondKey = await lazy.writeToBlobStore(ctx);
      lazyLetGo.resolve();
      const lazyWaitedKey = await lazyWaiting;
      return {
        eager: { theWriteThatWaitedGaveTheSecondKey: waitedKey === secondKey && secondKey !== firstKey, events: eagerEvents.map((event) => (typeof event === "string" ? event.replace(/ = .*/, "").replace(hex(firstKey), "the first key").replace(hex(secondKey), "the second key") : "callback")) },
        lazy: { theWriteThatWaitedGaveTheSecondKey: lazyWaitedKey === lazySecondKey && hex(lazySecondKey) !== "0a", events: lazyEvents.map((event) => (typeof event === "string" ? event.replace(/ = .*/, "").replace(hex(lazySecondKey), "the second key") : "callback")) },
      };
    },
  },

  // ---- subagent-states ------------------------------------------------------
  {
    name: "with no keys of subagents kept apart, the subagents' states are the ones written in the conversation itself",
    run: async ({ subagents, agentStore }) => {
      const events = [];
      const { store } = keeping({}, { events });
      const state = structureFrom(agentStore, stored.structure({ inline: { "sub-1": stored.subagent({ created: 5, used: 6, model: "model-a" }), "sub-2": stored.subagent({ created: 7, used: 8 }) } }));
      const promise = subagents.resolveSubagentPersistedStates({ the: "context" }, state, store);
      const found = await promise;
      const none = await subagents.resolveSubagentPersistedStates({ the: "context" }, structureFrom(agentStore, new Uint8Array()), store);
      return {
        aPromise: promise instanceof Promise,
        subagents: Object.keys(found),
        theVeryStatesOfTheConversation: Object.keys(found).map((id) => found[id] === state.subagentStates[id]),
        aListOfItsOwn: found !== state.subagentStates && Object.getPrototypeOf(found) === Object.prototype,
        states: Object.fromEntries(Object.entries(found).map(([id, one]) => [id, hex(one.toBinary())])),
        theStoreWasNotAsked: events,
        aConversationWithNoSubagents: none,
        aStateWithNoListOfKeys: await outcome(() => subagents.resolveSubagentPersistedStates({}, { subagentStates: {} }, store)),
        aStateWithNoListOfStates: await outcome(() => subagents.resolveSubagentPersistedStates({}, { subagentStateRefs: {} }, store)),
      };
    },
  },
  {
    name: "a subagent's state kept apart is read from its blob, and comes before the one written in the conversation",
    run: async ({ subagents, agentStore }) => {
      const events = [];
      const { ctx, told } = surroundings();
      const blobsByKey = {
        "0a": stored.subagent({ created: 100, used: 101, model: "from the blob" }),
        "0b": stored.subagent({ created: 200, used: 201, conversation: stored.structure({ turns: ["a1"] }) }),
        "0c": new Uint8Array(),
      };
      const { store, contexts } = keeping(blobsByKey, { events });
      const state = structureFrom(
        agentStore,
        stored.structure({
          inline: { "only-inline": stored.subagent({ created: 1, used: 2 }), both: stored.subagent({ created: 3, used: 4, model: "written in the conversation" }) },
          refs: { "only-apart": "0b", both: "0a", "a-blob-of-no-bytes": "0c" },
        }),
      );
      const found = await subagents.resolveSubagentPersistedStates(ctx, state, store);
      return {
        subagentsInOrder: Object.keys(found),
        states: Object.fromEntries(Object.entries(found).map(([id, one]) => [id, { stored: hex(one.toBinary()), class: one.constructor.name, model: one.modelId, created: one.createdTimestampMs }])),
        theOneOnlyWrittenInTheConversationIsTheVeryOne: found["only-inline"] === state.subagentStates["only-inline"],
        theConversationItselfIsUntouched: Object.keys(state.subagentStates),
        asked: events,
        everyCallGotTheContext: contexts.every((given) => given === ctx),
        told,
      };
    },
  },
  {
    name: "a subagent's blob that is not there: the error for missing data, unless the conversation itself holds that subagent",
    run: async ({ subagents, agentStore, notFound }) => {
      const good = stored.subagent({ created: 100, used: 101 });
      /** What comes of a conversation with these subagents written in it and these kept apart, read from a store with these blobs. */
      const resolve = async ({ inline = {}, refs, blobsByKey = {}, store: given }) => {
        const events = [];
        const { ctx, told } = surroundings();
        const { store } = keeping(blobsByKey, { events });
        const state = structureFrom(agentStore, stored.structure({ inline, refs }));
        const gave = await outcome(() => subagents.resolveSubagentPersistedStates(ctx, state, given ?? store));
        return {
          gave: gave?.rejected === undefined ? Object.fromEntries(Object.entries(gave).map(([id, one]) => [id, hex(one.toBinary())])) : gave,
          ...(gave?.rejected instanceof notFound.BlobNotFoundError ? { keysNamed: gave.rejected.blobIdHexes } : {}),
          asked: events,
          told,
        };
      };
      const boom = new Error("the store failed");
      return tableLater([
        ["one missing, not in the conversation", () => resolve({ refs: { lost: "aa01" } })],
        ["one missing, also written in the conversation: that one is used, and a warning says so", () => resolve({ inline: { kept: stored.subagent({ created: 1, used: 2 }) }, refs: { kept: "aa01" } })],
        ["two missing and one there: both keys are named, after every blob was asked for", () => resolve({ refs: { first: "aa01", there: "0a", second: "aa02" }, blobsByKey: { "0a": good } })],
        ["four missing: three keys are shown", () => resolve({ refs: { a: "aa01", b: "aa02", c: "aa03", d: "aa04" } })],
        ["one missing and one damaged: missing comes first", () => resolve({ refs: { damaged: "0b", lost: "aa01" }, blobsByKey: { "0b": bytes("ff") } })],
        ["one damaged: what the reading of it threw", () => resolve({ refs: { there: "0a", damaged: "0b" }, blobsByKey: { "0a": good, "0b": bytes("ff") } })],
        ["two damaged: the first one's failure", () => resolve({ refs: { cut: "0b", tagged: "0c" }, blobsByKey: { "0b": bytes("0a05"), "0c": bytes("0f") } })],
        ["one damaged, also written in the conversation: it fails all the same", () => resolve({ inline: { kept: stored.subagent({ created: 1, used: 2 }) }, refs: { kept: "0b" }, blobsByKey: { "0b": bytes("ff") } })],
        ["a subagent called toString, missing: taken for one the conversation holds", () => resolve({ refs: { toString: "aa01" } })],
        ["a subagent called toString, there", () => resolve({ refs: { toString: "0a" }, blobsByKey: { "0a": good } })],
        ["a store that fails: its failure", () => resolve({ refs: { any: "0a" }, store: { getBlob: () => Promise.reject(boom) } })],
        ["a store that fails at once: its failure, through the promise", () => resolve({ refs: { any: "0a" }, store: { getBlob: () => { throw boom; } } })],
        ["a store that gives null, which is not nothing", () => resolve({ refs: { any: "0a" }, store: { getBlob: () => Promise.resolve(null) } })],
      ]);
    },
  },
  {
    name: "subagents' blobs are asked for eight at a time, and the answers keep the order of the conversation",
    run: async ({ subagents, agentStore }) => {
      const ids = Array.from({ length: 20 }, (_, at) => `sub-${String(at + 1).padStart(2, "0")}`);
      const keyOf = (id) => `aa${id.slice(4)}`;
      const waiting = new Map();
      const started = [];
      let underWay = 0;
      let mostAtOnce = 0;
      const store = {
        getBlob(ctx, blobId) {
          const key = hex(blobId);
          started.push(key);
          underWay += 1;
          mostAtOnce = Math.max(mostAtOnce, underWay);
          const answer = later();
          waiting.set(key, answer);
          return answer.promise.finally(() => {
            underWay -= 1;
          });
        },
      };
      const state = structureFrom(agentStore, stored.structure({ refs: Object.fromEntries(ids.map((id) => [id, keyOf(id)])) }));
      const promise = subagents.resolveSubagentPersistedStates({}, state, store);
      await settle();
      const startedAtFirst = [...started];
      // The newest asked for is answered first, each time.
      const startedAfterEachAnswer = [];
      while (waiting.size > 0) {
        const key = [...waiting.keys()].at(-1);
        const at = Number(key.slice(2));
        waiting.get(key).resolve(stored.subagent({ created: at, used: at }));
        waiting.delete(key);
        await settle();
        startedAfterEachAnswer.push(started.length);
      }
      const found = await promise;
      // Two subagents the conversation holds, both with a blob that is gone: the warning for each comes when its answer does.
      const { ctx, told } = surroundings();
      const answers = [];
      const lacking = { getBlob: () => (answers.push(later()), answers.at(-1).promise) };
      const both = subagents.resolveSubagentPersistedStates(
        ctx,
        structureFrom(agentStore, stored.structure({ inline: { first: stored.subagent({ created: 1, used: 1 }), second: stored.subagent({ created: 2, used: 2 }) }, refs: { first: "aa01", second: "aa02" } })),
        lacking,
      );
      await settle();
      answers[1].resolve(undefined);
      await settle();
      const afterTheSecondAnswer = told.map((entry) => entry.log.metadata.subagentId);
      answers[0].resolve(undefined);
      const kept = await both;
      return {
        warningsComeAsEachAnswerDoes: { afterTheSecondAnswer, atTheEnd: told.map((entry) => entry.log.metadata.subagentId), subagents: Object.keys(kept) },
        startedAtFirst,
        startedAfterEachAnswer,
        mostAtOnce,
        askedInTheOrderOfTheConversation: started.join(" ") === ids.map(keyOf).join(" "),
        answersInTheOrderOfTheConversation: Object.keys(found),
        eachAnswerUnderItsOwnSubagent: ids.every((id) => found[id].createdTimestampMs === BigInt(Number(id.slice(4)))),
      };
    },
  },

  // ---- agent-store: metadata ---------------------------------------------------
  {
    name: "the modes an agent can be in, and the ways it can be told to ask before it acts",
    run: ({ agentStore }) => ({
      AgentModes: agentStore.AgentModes,
      ApprovalModeSettings: agentStore.ApprovalModeSettings,
      plainLists: [Array.isArray(agentStore.AgentModes), Object.isFrozen(agentStore.AgentModes), Array.isArray(agentStore.ApprovalModeSettings), Object.isFrozen(agentStore.ApprovalModeSettings)],
    }),
  },
  {
    name: "a new key for an agent's blobs is 32 random bytes written as hex",
    run: ({ agentStore }) => {
      const first = agentStore.generateBlobEncryptionKeyHex();
      const second = agentStore.generateBlobEncryptionKeyHex();
      return {
        pinned: pinned(() => [agentStore.generateBlobEncryptionKeyHex(), agentStore.generateBlobEncryptionKeyHex()]),
        fromTheRuntimesOwnRandomness: { sixtyFourSmallHexDigits: /^[0-9a-f]{64}$/.test(first), anotherEachTime: first !== second, countsAsAKey: agentStore.isValidBlobEncryptionKeyHex(first) },
      };
    },
  },
  {
    name: "what counts as a key for an agent's blobs: a text of exactly 64 small hex digits",
    run: ({ agentStore }) =>
      table(
        [
          ["64 small hex digits", "0123456789abcdef".repeat(4)],
          ["64 zeros", "0".repeat(64)],
          ["63 digits", "a".repeat(63)],
          ["65 digits", "a".repeat(65)],
          ["64 digits, one a capital", `${"a".repeat(63)}A`],
          ["64 characters, one of them g", `${"a".repeat(63)}g`],
          ["63 digits and a line break", `${"a".repeat(63)}\n`],
          ["64 digits and a line break", `${"a".repeat(64)}\n`],
          ["63 digits after a space", ` ${"a".repeat(63)}`],
          ["an empty text", ""],
          ["a text object of 64 digits", new String("a".repeat(64))],
          ["a list of 64 digits", Array.from("a".repeat(64))],
          ["32 bytes", new Uint8Array(32)],
          ["a number", 64],
          ["null", null],
          ["nothing at all", undefined],
        ].map(([words, value]) => [words, () => agentStore.isValidBlobEncryptionKeyHex(value)]),
      ),
  },
  {
    name: "a new agent's metadata: a random id unless one is given, the time, a new key for its blobs",
    run: ({ agentStore }) => {
      const first = pinned(() => agentStore.getDefaultAgentMetadata());
      const made = agentStore.getDefaultAgentMetadata("agent-a");
      return {
        withNoId: { ...first, fields: Object.keys(first.gave) },
        withAnId: pinned(() => agentStore.getDefaultAgentMetadata("agent-a")),
        withAnEmptyId: pinned(() => agentStore.getDefaultAgentMetadata("").agentId),
        withNull: pinned(() => agentStore.getDefaultAgentMetadata(null).agentId),
        withUndefined: pinned(() => agentStore.getDefaultAgentMetadata(undefined).agentId),
        withANumber: pinned(() => agentStore.getDefaultAgentMetadata(7).agentId),
        twoInARow: pinned(() => [agentStore.getDefaultAgentMetadata(), agentStore.getDefaultAgentMetadata()].map((one) => [one.agentId, one.blobEncryptionKey])),
        fromTheRuntimeItself: {
          anIdOf36Characters: /^[0-9a-f-]{36}$/.test(agentStore.getDefaultAgentMetadata().agentId),
          theTimeIsNow: Math.abs(made.createdAt - Date.now()) < 60_000,
          aNewEmptyRootKeyEachTime: made.latestRootBlobId.length === 0 && made.latestRootBlobId !== agentStore.getDefaultAgentMetadata("agent-a").latestRootBlobId,
          passesTheSchema: agentStore.getAgentMetadataSchema().safeParse(made).success,
        },
      };
    },
  },
  {
    name: "the schema of an agent's metadata: made once, and what it lets through",
    run: async ({ agentStore }, tools) => {
      const schema = agentStore.getAgentMetadataSchema();
      const whole = {
        agentId: "agent-a",
        latestRootBlobId: bytes("0a0b"),
        name: "Research",
        mode: "plan",
        isRunEverything: true,
        approvalMode: "auto-review",
        createdAt: AT,
        lastUsedModel: "model-a",
        lastDebugServerPort: 9229,
        currentPlanUri: "file:///plans/one.md",
        subagentInfo: { parentAgentId: "agent-p", rootParentAgentId: "agent-r", toolCallId: "call-1", typeName: "explore" },
        blobEncryptionKey: "ab".repeat(32),
      };
      const least = { agentId: "agent-a", latestRootBlobId: new Uint8Array(), name: "", createdAt: 0, mode: "default", isRunEverything: false };
      /** What the schema makes of a value: the value it lets through, or what it found wrong, as the issues are written out. */
      const judged = (value) => {
        const result = schema.safeParse(value);
        return result.success ? { passes: result.data } : { issues: JSON.parse(JSON.stringify(result.error.issues)) };
      };
      const another = await tools.fresh();
      return {
        theSameSchemaEachTime: agentStore.getAgentMetadataSchema() === schema,
        anotherLoadOfThePartHasItsOwn: another.agentStore.getAgentMetadataSchema() !== schema,
        fieldsInOrder: Object.keys(schema.shape),
        ...table([
          ["every field given", () => judged(whole)],
          ["only what must be there", () => judged(least)],
          ["fields it does not know are dropped", () => judged({ ...least, extra: "dropped", another: 1 })],
          ["optional fields given as undefined stay, as undefined", () => judged({ ...least, approvalMode: undefined, lastUsedModel: undefined, subagentInfo: undefined, blobEncryptionKey: undefined })],
          ["a Node buffer is a root key", () => Object.keys(judged({ ...least, latestRootBlobId: RealBuffer.from("0a", "hex") }).passes)],
          ["a root key written as hex is not", () => judged({ ...least, latestRootBlobId: "0a0b" })],
          ["a root key that is a list of numbers is not", () => judged({ ...least, latestRootBlobId: [10, 11] })],
          ["each mode", () => agentStore.AgentModes.map((mode) => judged({ ...least, mode }).passes?.mode)],
          ["a mode of an older engine", () => judged({ ...least, mode: "auto-run" })],
          ["each approval setting", () => agentStore.ApprovalModeSettings.map((approvalMode) => judged({ ...least, approvalMode }).passes?.approvalMode)],
          ["an approval setting it does not know", () => judged({ ...least, approvalMode: "always" })],
          ["a port of 1", () => judged({ ...least, lastDebugServerPort: 1 }).passes?.lastDebugServerPort],
          ["a port of 0", () => judged({ ...least, lastDebugServerPort: 0 })],
          ["a port below 0", () => judged({ ...least, lastDebugServerPort: -1 })],
          ["a port with a fraction", () => judged({ ...least, lastDebugServerPort: 80.5 })],
          ["a port written as text", () => judged({ ...least, lastDebugServerPort: "80" })],
          ["a time that is not a number", () => judged({ ...least, createdAt: Number.NaN })],
          ["a time written as text", () => judged({ ...least, createdAt: "2026-11-14" })],
          ["null where a text may be left out", () => judged({ ...least, lastUsedModel: null, currentPlanUri: null, blobEncryptionKey: null })],
          ["a blob key of any text passes here", () => judged({ ...least, blobEncryptionKey: "not hex" }).passes?.blobEncryptionKey],
          ["a subagent with one empty field", () => judged({ ...least, subagentInfo: { ...whole.subagentInfo, toolCallId: "" } })],
          ["a subagent with a field missing and another of the wrong kind", () => judged({ ...least, subagentInfo: { parentAgentId: "agent-p", rootParentAgentId: 5, toolCallId: "call-1" } })],
          ["a subagent with a field it does not know: dropped", () => judged({ ...least, subagentInfo: { ...whole.subagentInfo, more: true } }).passes?.subagentInfo],
          ["a subagent that is null", () => judged({ ...least, subagentInfo: null })],
          ["nothing of what must be there", () => judged({})],
          ["what is no object", () => [judged("metadata"), judged(null), judged(undefined), judged([])].map((one) => one.issues)],
          ["two things wrong at once, in the order of the fields", () => judged({ ...least, isRunEverything: "yes", agentId: 5 }).issues.map((issue) => issue.path.join("."))],
        ]),
        whatIsThrownWhenAskedToParse: attempt(() => schema.parse({ ...least, agentId: 5 })),
      };
    },
  },
  {
    name: "an agent's metadata is stored as JSON text, its fields in the order given and the root blob's key as hex",
    run: ({ agentStore }) => {
      const serde = new agentStore.AgentMetadataSerde();
      const whole = {
        agentId: "agent-a",
        latestRootBlobId: bytes("0a0bff"),
        name: "Research",
        mode: "plan",
        isRunEverything: true,
        approvalMode: "auto-review",
        createdAt: AT,
        lastUsedModel: "model-a",
        lastDebugServerPort: 9229,
        currentPlanUri: "file:///plans/one.md",
        subagentInfo: { parentAgentId: "agent-p", rootParentAgentId: "agent-r", toolCallId: "call-1", typeName: "explore" },
        blobEncryptionKey: "ab".repeat(32),
      };
      const written = (value) => asText(serde.serialize(value));
      const fresh = pinned(() => written(agentStore.getDefaultAgentMetadata()));
      const reread = pinned(() => written(serde.deserialize(serde.serialize(agentStore.getDefaultAgentMetadata("agent-a")))));
      const accented = serde.serialize({ ...whole, name: "\u00c9t\u00e9 \u65e5 \ud83d\ude00" });
      return {
        blobType: [serde.getBlobType(), serde.getBlobType() !== serde.getBlobType()],
        aNewAgent: fresh.gave,
        aNewAgentReadBackAndWrittenAgain: reread.gave,
        ...table([
          ["every field set", () => written(whole)],
          ["what is written is new bytes each time", () => {
            const bytesWritten = serde.serialize(whole);
            return bytesWritten.constructor === Uint8Array && bytesWritten !== serde.serialize(whole);
          }],
          ["the root key first, then the id", () => written({ latestRootBlobId: bytes("01"), agentId: "agent-a" })],
          ["fields that are undefined are left out", () => written({ agentId: "agent-a", latestRootBlobId: new Uint8Array(), approvalMode: undefined, subagentInfo: undefined, name: "n" })],
          ["fields the code does not know are written too", () => written({ agentId: "agent-a", latestRootBlobId: new Uint8Array(), somethingElse: { deep: [1, null] } })],
          ["a name with a quote, a backslash, a line break and a zero", () => written({ agentId: "a", latestRootBlobId: new Uint8Array(), name: 'say "hi"\\\n\u0000' })],
          ["a name with accents, a wide letter and a face: as text, then as the bytes stored", () => [asText(accented), hex(accented)]],
          ["a name holding half of a pair", () => written({ agentId: "a", latestRootBlobId: new Uint8Array(), name: "a\ud800b" })],
          ["a time that is not a number is written as null", () => written({ agentId: "a", latestRootBlobId: new Uint8Array(), createdAt: Number.NaN })],
          ["a root key given as a text is written as the hex of the text", () => written({ agentId: "a", latestRootBlobId: "0a" })],
          ["no root key", () => written({ agentId: "a" })],
          ["nothing at all", () => written(undefined)],
          ["null", () => written(null)],
          ["a time given as a BigInt", () => written({ agentId: "a", latestRootBlobId: new Uint8Array(), createdAt: 1n })],
        ]),
      };
    },
  },
  {
    name: "stored metadata is read back: what today's code writes, and what an older engine wrote",
    run: ({ agentStore }) => {
      const serde = new agentStore.AgentMetadataSerde();
      const key = "ab".repeat(32);
      const subagent = { parentAgentId: "agent-p", rootParentAgentId: "agent-r", toolCallId: "call-1", typeName: "explore" };
      /** What stored text is read as, and what the reading asked of the clock and of randomness. */
      const read = (text) => pinned(() => serde.deserialize(utf8(text)));
      const today = '{"agentId":"agent-a","latestRootBlobId":"0a0bff","name":"Research","mode":"plan","isRunEverything":true,"approvalMode":"auto-review","createdAt":1794647287065,"lastUsedModel":"model-a","lastDebugServerPort":9229,"currentPlanUri":"file:///plans/one.md","subagentInfo":{"parentAgentId":"agent-p","rootParentAgentId":"agent-r","toolCallId":"call-1","typeName":"explore"},"blobEncryptionKey":"abababababababababababababababababababababababababababababababab"}';
      const base = { agentId: "agent-a", latestRootBlobId: "", name: "n", mode: "default", isRunEverything: false, createdAt: 5, blobEncryptionKey: key };
      const withFields = (fields) => JSON.stringify({ ...base, ...fields });
      /** One field stored with each of these values, and what that field is read as (or how the reading failed). */
      const each = (field, values) =>
        Object.fromEntries(
          values.map(([words, value]) => {
            const { gave } = read(withFields({ [field]: value }));
            return [words, gave?.threw === undefined ? gave[field] : gave];
          }),
        );
      const wholeRead = read(today);
      return {
        everyFieldSet: { ...wholeRead, fieldsInOrder: Object.keys(wholeRead.gave), writtenAgain: asText(serde.serialize(wholeRead.gave)) },
        aNewAgentAsWrittenToday: read('{"agentId":"agent-a","latestRootBlobId":"","name":"New Agent","mode":"default","isRunEverything":false,"createdAt":1794647287065,"blobEncryptionKey":"abababababababababababababababababababababababababababababababab"}'),
        anObjectWithNothingInIt: read("{}"),
        onlyAnId: read('{"agentId":"agent-a"}'),
        fieldsTheCodeDoesNotKnowAreDropped: Object.keys(read(withFields({ somethingElse: 1, toString: "x" })).gave),
        theOldModeThatRanEverything: {
          alone: read('{"agentId":"agent-a","mode":"auto-run"}').gave,
          withRunEverythingSaidToBeOff: (({ mode, isRunEverything }) => ({ mode, isRunEverything }))(read(withFields({ mode: "auto-run", isRunEverything: false })).gave),
        },
        mode: each("mode", [["default", "default"], ["plan", "plan"], ["debug", "debug"], ["search", "search"], ["one it does not know", "turbo"], ["in capitals", "PLAN"], ["a number", 2], ["null", null], ["a name every object has", "constructor"]]),
        isRunEverything: each("isRunEverything", [["true", true], ["false", false], ["the word true", "true"], ["the number 1", 1], ["null", null]]),
        approvalMode: each("approvalMode", [["allowlist", "allowlist"], ["unrestricted", "unrestricted"], ["auto-review", "auto-review"], ["one it does not know", "always"], ["a number", 1], ["null", null], ["a name every object has", "toString"]]),
        latestRootBlobId: each("latestRootBlobId", [["hex", "0a0bff"], ["hex in capitals with spaces round it", " 0A0BFF "], ["what is no hex: zeros", "zzzz"], ["an odd number of digits", "0a0"], ["a number: none", 10], ["a list of numbers: none", [10, 11]], ["null: none", null]]),
        subagentInfo: each("subagentInfo",
          [
            ["all four fields", subagent],
            ["a fifth field is dropped", { ...subagent, more: true }],
            ["no parent", { ...subagent, parentAgentId: undefined }],
            ["an empty parent", { ...subagent, parentAgentId: "" }],
            ["a root parent that is a number", { ...subagent, rootParentAgentId: 5 }],
            ["an empty root parent", { ...subagent, rootParentAgentId: "" }],
            ["a tool call that is null", { ...subagent, toolCallId: null }],
            ["an empty tool call", { ...subagent, toolCallId: "" }],
            ["a type that is a list", { ...subagent, typeName: ["explore"] }],
            ["an empty type", { ...subagent, typeName: "" }],
            ["a text", "explore"],
            ["a number", 5],
            ["the number 0", 0],
            ["true", true],
            ["null", null],
            ["a list", [subagent]],
          ],
        ),
        blobEncryptionKey: each("blobEncryptionKey",
          [
            ["a key of 64 small hex digits is kept", key],
            ["a key in capitals is replaced by a new one", key.toUpperCase()],
            ["a key of 62 digits is replaced", key.slice(2)],
            ["a number is replaced", 5],
            ["null is replaced", null],
          ],
        ),
        noKeyStored: (({ gave, asked }) => ({ blobEncryptionKey: gave.blobEncryptionKey, asked }))(read('{"agentId":"agent-a","createdAt":5}')),
        theRest: read(withFields({ lastUsedModel: "model-a", lastDebugServerPort: 1, currentPlanUri: "" })).gave,
        aRootKeyIsNewBytesEachTime: (() => {
          const blob = utf8(withFields({ latestRootBlobId: "0a" }));
          return serde.deserialize(blob).latestRootBlobId !== serde.deserialize(blob).latestRootBlobId;
        })(),
      };
    },
  },
  {
    name: "stored metadata that is damaged, cut short or of the wrong kind",
    run: ({ agentStore }) => {
      const serde = new agentStore.AgentMetadataSerde();
      const read = (blob) => pinned(() => serde.deserialize(blob));
      const good = '{"agentId":"agent-a","latestRootBlobId":"0a","name":"n\u00e9","mode":"plan","isRunEverything":false,"createdAt":5,"blobEncryptionKey":"' + "ab".repeat(32) + '"}';
      const goodBytes = utf8(good);
      const issues = (text) => {
        const { gave } = read(utf8(text));
        return gave?.threw?.name === "ZodError" ? JSON.parse(JSON.stringify(gave.threw.issues)) : gave;
      };
      const field = (name, value) => issues(JSON.stringify({ ...JSON.parse(good), [name]: value }));
      return {
        noBytes: read(new Uint8Array()),
        cutInTheMiddle: read(goodBytes.subarray(0, 40)),
        cutBeforeTheLastBrace: read(goodBytes.subarray(0, goodBytes.length - 1)),
        twoObjectsOneAfterTheOther: read(utf8(`${good}${good}`)),
        withAByteOrderMarkInFront: read(Uint8Array.from([0xef, 0xbb, 0xbf, ...goodBytes])).gave,
        withSpacesAndLineBreaksRoundIt: read(utf8(` \n${good}\n `)).gave.agentId,
        withAByteThatIsNoUtf8InTheName: read(Uint8Array.from(goodBytes, (byte) => (byte === 0xc3 ? 0xff : byte))).gave.name,
        aZeroByteAfterIt: read(Uint8Array.from([...goodBytes, 0])),
        theWordNull: read(utf8("null")),
        aText: read(utf8('"agent-a"')),
        aNumber: read(utf8("5")),
        theWordTrue: read(utf8("true")),
        aList: read(utf8("[]")),
        aListHoldingMetadata: read(utf8(`[${good}]`)).gave.agentId,
        nothingAtAll: read(undefined),
        fieldsOfTheWrongKind: {
          "an id that is a number": field("agentId", 5),
          "an id that is null": field("agentId", null),
          "a name that is a number": field("name", 5),
          "a name that is null": field("name", null),
          "a time written as text": field("createdAt", "5"),
          "a time that is null": field("createdAt", null),
          "a model that is null": field("lastUsedModel", null),
          "a model that is a number": field("lastUsedModel", 5),
          "a port of 0": field("lastDebugServerPort", 0),
          "a port with a fraction": field("lastDebugServerPort", 1.5),
          "a port written as text": field("lastDebugServerPort", "80"),
          "a plan that is a number": field("currentPlanUri", 5),
          "a plan that is null": field("currentPlanUri", null),
          "a root key with an odd number of digits": field("latestRootBlobId", "0a0"),
          "an id and a name wrong at once": issues('{"agentId":5,"name":6}'),
        },
        whatIsThrownForAWrongField: read(utf8('{"agentId":5}')).gave,
      };
    },
  },

  // ---- agent-store: conversations ---------------------------------------------------
  {
    name: "a conversation is put together from its structure's blobs, asked for one at a time and in order",
    run: async ({ agentStore }) => {
      const events = [];
      const { store, contexts } = keeping(conversationBlobs(), { events });
      let underWay = 0;
      let mostAtOnce = 0;
      const counting = {
        getBlob(...given) {
          underWay += 1;
          mostAtOnce = Math.max(mostAtOnce, underWay);
          return store.getBlob(...given).finally(() => {
            underWay -= 1;
          });
        },
      };
      const ctx = { the: "context" };
      const structure = structureFrom(agentStore, conversationStructure());
      const promise = agentStore.deriveConversationStateFromStructure(ctx, structure, counting);
      const state = await promise;
      const asked = events.splice(0);
      return {
        aPromise: promise instanceof Promise,
        state,
        asItWouldBeStored: hex(state.toBinary()),
        asked,
        mostAtOnce,
        everyCallGotTheContext: contexts.every((given) => given === ctx),
        theStructureAsStored: hex(structure.toBinary()),
        aStructureWithNothingInIt: await agentStore.deriveConversationStateFromStructure(ctx, structureFrom(agentStore, new Uint8Array()), counting),
        aNewConversationEachTime: (await agentStore.deriveConversationStateFromStructure(ctx, structure, store)) !== state,
      };
    },
  },
  {
    name: "blobs of a conversation that are not there are left out without a word, and what hangs on them is not asked for",
    run: async ({ agentStore }) => {
      /** The conversation read from a store that lacks some blobs, or holds others in their place. */
      const without = async (lacking, replaced = {}, structureBytes = conversationStructure()) => {
        const events = [];
        const blobsByKey = { ...conversationBlobs(), ...replaced };
        for (const key of lacking) delete blobsByKey[key];
        const { store } = keeping(blobsByKey, { events });
        const gave = await outcome(() => agentStore.deriveConversationStateFromStructure({}, structureFrom(agentStore, structureBytes), store));
        return { ...(gave?.rejected === undefined ? brief(gave) : gave), asked: keysAsked(events) };
      };
      return tableLater([
        ["everything there", () => without([])],
        ["the agent's turn", () => without(["a1"])],
        ["its user message: the turn is left out and its steps are not asked for", () => without(["b1"])],
        ["its first step: the turn keeps the other", () => without(["c1"])],
        ["both steps: a turn with no steps", () => without(["c1", "c2"])],
        ["the shell's turn", () => without(["a2"])],
        ["its command: the turn is left out and its output is not asked for", () => without(["d1"])],
        ["its output: the turn is left out", () => without(["d2"])],
        ["a todo", () => without(["e1"])],
        ["the summary: the conversation has no such field", () => without(["f1"])],
        ["everything", () => without(Object.keys(conversationBlobs()))],
        ["a turn stored as no bytes is neither kind of turn, and is left out", () => without([], { a1: new Uint8Array() })],
        ["a user message stored as no bytes is an empty message", () => without([], { b1: new Uint8Array() })],
        ["a summary stored as no bytes is an empty summary", () => without([], { f1: new Uint8Array() })],
        ["a turn with no request", () => without([], { a1: stored.agentTurn({ user: "b1", steps: ["c2"] }) })],
        ["a turn naming the same step twice", () => without([], { a1: stored.agentTurn({ user: "b1", steps: ["c2", "c2"] }) })],
        ["a structure whose summary's key is no bytes: still asked for", () => without([], { "": stored.summary("under the empty key") }, stored.structure({ summary: "" }))],
        ["a structure with no summary: not asked for", () => without([], {}, stored.structure({ turns: ["a2"] }))],
      ]);
    },
  },
  {
    name: "a store that answers null or no bytes, a damaged blob, a store that fails: what becomes of the conversation",
    run: async ({ agentStore }) => {
      /** The conversation read from a store that answers `answer` for `key`. */
      const answering = async (key, answer, more = {}) => {
        const events = [];
        const { store } = keeping(conversationBlobs(), { events });
        const real = store.getBlob;
        const answers = { [key]: answer, ...more };
        store.getBlob = (ctx, blobId) => {
          const found = real(ctx, blobId);
          return Object.hasOwn(answers, hex(blobId)) ? answers[hex(blobId)]() : found;
        };
        const gave = await outcome(() => agentStore.deriveConversationStateFromStructure({}, structureFrom(agentStore, conversationStructure()), store));
        return { ...(gave?.rejected === undefined ? brief(gave) : gave), asked: keysAsked(events) };
      };
      const cut = bytes("0a05");
      const boom = new Error("the store failed");
      return {
        ...(await tableLater([
          ["null for a turn: left out", () => answering("a1", () => Promise.resolve(null))],
          ["null for a todo: left out", () => answering("e1", () => Promise.resolve(null))],
          ["0 for the summary: left out", () => answering("f1", () => Promise.resolve(0))],
          ["a turn cut short", () => answering("a1", () => Promise.resolve(cut))],
          ["a user message cut short", () => answering("b1", () => Promise.resolve(cut))],
          ["a step cut short", () => answering("c2", () => Promise.resolve(cut))],
          ["a command cut short", () => answering("d1", () => Promise.resolve(cut))],
          ["an output cut short", () => answering("d2", () => Promise.resolve(cut))],
          ["a todo cut short", () => answering("e2", () => Promise.resolve(cut))],
          ["a summary cut short", () => answering("f1", () => Promise.resolve(cut))],
          ["a turn with a tag no message has", () => answering("a1", () => Promise.resolve(bytes("0f")))],
          ["a user message with such a tag and a step cut short: the step is read first", () => answering("b1", () => Promise.resolve(bytes("0f")), { c2: () => Promise.resolve(cut) })],
          ["a user message cut short and a step with such a tag: the step is read first", () => answering("b1", () => Promise.resolve(cut), { c1: () => Promise.resolve(bytes("0f")) })],
          ["a command with such a tag and an output cut short: the command is read first", () => answering("d1", () => Promise.resolve(bytes("0f")), { d2: () => Promise.resolve(cut) })],
          ["a command cut short and an output with such a tag: the command is read first", () => answering("d1", () => Promise.resolve(cut), { d2: () => Promise.resolve(bytes("0f")) })],
          ["a turn holding a field the code does not know: read, the field kept aside", () => answering("a2", () => Promise.resolve(Uint8Array.from([...stored.shellTurn({ command: "d1", output: "d2" }), ...wire.text(15, "from a later engine")])))],
          ["a text where bytes are stored", () => answering("f1", () => Promise.resolve("not bytes"))],
          ["a store that fails for a step", () => answering("c1", () => Promise.reject(boom))],
          ["a store that fails at once for the summary", () => answering("f1", () => { throw boom; })],
        ])),
        aStructureWithNoTurnsList: await outcome(() => agentStore.deriveConversationStateFromStructure({}, { todos: [] }, keeping().store)),
        somethingThatOnlyLooksLikeAStructure: brief(await agentStore.deriveConversationStateFromStructure({}, { turns: [bytes("a2")], todos: [], summary: null }, keeping(conversationBlobs()).store)),
      };
    },
  },
  {
    name: "the agent's store reads and writes metadata through the metadata store it was given",
    run: ({ agentStore }) => {
      const blobs = keeping().store;
      const metadata = metadataKeeping({ agentId: "agent-a", name: "Research" });
      const store = new agentStore.AgentStore2(blobs, metadata.store);
      const heard = [];
      const unsubscribe = store.subscribeToMetadata("name", (...given) => heard.push(given));
      const afterSubscribing = metadata.calls.splice(0);
      metadata.values.set("name", "Renamed");
      metadata.listeners[0]("whatever the store says, it is not handed on");
      metadata.listeners[0]();
      const afterTwoChanges = metadata.calls.splice(0);
      const setGave = store.setMetadata("name", "Set through the store");
      const read = store.getMetadata("name");
      const id = store.getId();
      const afterTheRest = metadata.calls.splice(0);
      class Own extends agentStore.AgentStore2 {
        getMetadata(key) {
          return `my own answer for ${key}`;
        }
      }
      return {
        subscribing: { calls: afterSubscribing, givesBackWhatTheMetadataStoreGave: unsubscribe === metadata.unsubscribe },
        eachChangeReadsTheValueThen: { heard, calls: afterTwoChanges },
        setting: { gave: setGave, read, id, calls: afterTheRest },
        theBlobStoreItWasGiven: store.getBlobStore() === blobs,
        aStoreBuiltOnItIsAskedThroughItsOwnGetMetadata: new Own(blobs, metadata.store).getId(),
        aMetadataStoreThatFails: attempt(() => new agentStore.AgentStore2(blobs, { get: () => { throw new Error("the metadata cannot be read"); } }).getId()),
        optionsThatAreNull: attempt(() => new agentStore.AgentStore2(blobs, metadata.store, null)),
      };
    },
  },
  {
    name: "a checkpoint is stored whole under the hash of its bytes, or under the one key the store was made with, and the metadata is told the key",
    run: async ({ agentStore }) => {
      const ctx = { the: "context" };
      const checkpointBytes = stored.structure({ turns: ["a1", "a2"], todos: ["e1"], summary: "f1", inline: { "sub-1": stored.subagent({ created: 5, used: 6 }) }, refs: { "sub-2": "0b" } });
      /** One checkpoint handed to a store made with these options: what was stored, under what key, and what the metadata was told. */
      const checkpointed = async (options, bytesOfIt = checkpointBytes, breakTheStore) => {
        const events = [];
        const blobs = keeping({}, { events });
        const metadata = metadataKeeping();
        metadata.store.set = (key, value) => {
          events.push(`metadata ${key} = ${hex(value)}`);
          metadata.values.set(key, value);
        };
        if (breakTheStore) breakTheStore(blobs.store, events);
        const store = options === undefined ? new agentStore.AgentStore2(blobs.store, metadata.store) : new agentStore.AgentStore2(blobs.store, metadata.store, options);
        const before = store.getConversationStateStructure();
        const checkpoint = structureFrom(agentStore, bytesOfIt);
        const gave = await outcome(() => store.handleCheckpoint(ctx, checkpoint));
        return {
          gave,
          events,
          theStructureHeldIsTheVeryCheckpoint: store.getConversationStateStructure() === checkpoint && store.getLatestCheckpoint() === checkpoint && before !== checkpoint,
          theMetadataHoldsTheKeyStoredUnder: metadata.values.has("latestRootBlobId") ? [...blobs.kept.keys()].includes(hex(metadata.values.get("latestRootBlobId"))) : "no key told",
          theMetadataHoldsTheVeryFixedKey: options?.fixedRootBlobId !== undefined && metadata.values.get("latestRootBlobId") === options.fixedRootBlobId,
          everyCallGotTheContext: blobs.contexts.every((given) => given === ctx),
        };
      };
      const fresh = new agentStore.AgentStore2(keeping().store, metadataKeeping().store);
      // What one store wrote, a store made later over the same blobs and metadata reads back.
      const shared = { blobs: keeping(), metadata: metadataKeeping() };
      const writer = new agentStore.AgentStore2(shared.blobs.store, shared.metadata.store);
      await writer.handleCheckpoint(ctx, structureFrom(agentStore, checkpointBytes));
      const reader = new agentStore.AgentStore2(shared.blobs.store, shared.metadata.store);
      const readBack = await reader.tryResetFromDb(ctx);
      return {
        theBytesHandedIn: hex(checkpointBytes),
        whatOneStoreWroteAStoreMadeLaterReadsBack: { found: readBack, theSameBytes: hex(reader.getConversationStateStructure().toBinary()) === hex(writer.getConversationStateStructure().toBinary()), anotherObject: reader.getConversationStateStructure() !== writer.getConversationStateStructure() },
        withNoFixedKey: await checkpointed(undefined),
        withAFixedKey: await checkpointed({ fixedRootBlobId: bytes("c0ffee") }),
        withAFixedKeyOfNoBytes: await checkpointed({ fixedRootBlobId: new Uint8Array() }),
        withOptionsThatNameNoKey: (await checkpointed({})).events,
        withAFixedKeyOfNull: (await checkpointed({ fixedRootBlobId: null })).events,
        anEmptyCheckpointWithNoFixedKey: await checkpointed(undefined, new Uint8Array()),
        anEmptyCheckpointWithAFixedKey: (await checkpointed({ fixedRootBlobId: bytes("c0ffee") }, new Uint8Array())).events,
        aStoreThatRefusesTheWrite: await checkpointed({ fixedRootBlobId: bytes("c0ffee") }, checkpointBytes, (store, events) => {
          store.setBlob = () => {
            events.push("setBlob refused");
            return Promise.reject(new Error("the store is full"));
          };
        }),
        aNewStoreHoldsAnEmptyStructure: { stored: hex(fresh.getConversationStateStructure().toBinary()), class: fresh.getConversationStateStructure().constructor.name, sameAsTheLatestCheckpoint: fresh.getLatestCheckpoint() === fresh.getConversationStateStructure() },
        somethingThatIsNoCheckpoint: await outcome(() => fresh.handleCheckpoint(ctx, {})),
      };
    },
  },
  {
    name: "the agent's store reads its conversation back from the blob the metadata names as the root",
    run: async ({ agentStore }) => {
      const ctx = { the: "context" };
      const rootBytes = stored.structure({ turns: ["a1"], todos: ["e1"] });
      /** A store reset from what `rootKey` names in a blob store holding `blobsByKey`. */
      const reset = async ({ rootKey, blobsByKey = {}, breakBlobs, breakMetadata, options, through = "tryResetFromDb" }) => {
        const events = [];
        const blobs = keeping(blobsByKey, { events });
        const metadata = metadataKeeping(rootKey === undefined ? {} : { latestRootBlobId: rootKey });
        if (breakBlobs) breakBlobs(blobs.store, events);
        if (breakMetadata) breakMetadata(metadata.store, metadata.calls);
        const store = new agentStore.AgentStore2(blobs.store, metadata.store, options);
        // Something is held before the reset, so that an emptied store is told from an untouched one.
        await store.handleCheckpoint(ctx, structureFrom(agentStore, stored.structure({ turns: ["a2"] })));
        const held = store.getConversationStateStructure();
        if (rootKey !== undefined) metadata.values.set("latestRootBlobId", rootKey);
        else metadata.values.delete("latestRootBlobId");
        events.splice(0);
        metadata.calls.splice(0);
        const gave = await outcome(() => store[through](ctx));
        const now = store.getConversationStateStructure();
        return { gave, asked: [...metadata.calls, ...events], holdsNow: hex(now.toBinary()), aNewStructure: now !== held, ofTheStructuresClass: now.constructor === held.constructor };
      };
      const boom = new Error("it failed");
      return tableLater([
        ["a root that is there", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": rootBytes } })],
        ["the same through resetFromDb, which says nothing", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": rootBytes }, through: "resetFromDb" })],
        ["a store made with a fixed key still reads the key the metadata names", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": rootBytes, c0ffee: stored.structure({ todos: ["e2"] }) }, options: { fixedRootBlobId: bytes("c0ffee") } })],
        ["no root named", () => reset({})],
        ["a root key of no bytes: the store is not asked", () => reset({ rootKey: new Uint8Array(), blobsByKey: { "": rootBytes } })],
        ["a root key that is null", () => reset({ rootKey: null })],
        ["a root key given as a text", () => reset({ rootKey: "0a", blobsByKey: { "0a": rootBytes } })],
        ["a root that is not there", () => reset({ rootKey: bytes("0b") })],
        ["the same through resetFromDb", () => reset({ rootKey: bytes("0b"), through: "resetFromDb" })],
        ["a root stored as no bytes: an empty conversation, and a yes", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": new Uint8Array() } })],
        ["a root cut short", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": bytes("4208") } })],
        ["a root with a tag no message has", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": bytes("0f") } })],
        ["a store that answers null", () => reset({ rootKey: bytes("0a"), breakBlobs: (store, events) => { store.getBlob = () => (events.push("getBlob answered null"), Promise.resolve(null)); } })],
        ["a store that fails", () => reset({ rootKey: bytes("0a"), breakBlobs: (store, events) => { store.getBlob = () => (events.push("getBlob failed"), Promise.reject(boom)); } })],
        ["a store that fails at once", () => reset({ rootKey: bytes("0a"), breakBlobs: (store, events) => { store.getBlob = () => { events.push("getBlob failed at once"); throw boom; }; } })],
        ["metadata that cannot be read", () => reset({ rootKey: bytes("0a"), blobsByKey: { "0a": rootBytes }, breakMetadata: (store, calls) => { store.get = () => { calls.push("get failed"); throw boom; }; } })],
        ["metadata that cannot be read, through resetFromDb", () => reset({ rootKey: bytes("0a"), breakMetadata: (store, calls) => { store.get = () => { calls.push("get failed"); throw boom; }; }, through: "resetFromDb" })],
      ]);
    },
  },
  {
    name: "the last request's id is that of the newest agent turn whose blob is still there",
    run: async ({ agentStore }) => {
      const ctx = { the: "context" };
      /** The id found for a conversation of these turns, read from a store with these blobs. */
      const lastRequest = async (turnKeys, blobsByKey) => {
        const events = [];
        const blobs = keeping(blobsByKey, { events });
        const store = new agentStore.AgentStore2(blobs.store, metadataKeeping().store, { fixedRootBlobId: bytes("c0ffee") });
        await store.handleCheckpoint(ctx, structureFrom(agentStore, stored.structure({ turns: turnKeys })));
        events.splice(0);
        const gave = await outcome(() => store.getLastRequestIdFromConversation(ctx));
        return { gave, asked: keysAsked(events), everyCallGotTheContext: blobs.contexts.every((given) => given === ctx) };
      };
      const first = stored.agentTurn({ user: "b1", requestId: "request-1" });
      const second = stored.agentTurn({ user: "b1", requestId: "request-2" });
      const unnamed = stored.agentTurn({ user: "b1" });
      const emptyName = stored.agentTurn({ user: "b1", requestId: "" });
      const shell = stored.shellTurn({ command: "d1", output: "d2" });
      return tableLater([
        ["no turns: the store is not asked", () => lastRequest([], {})],
        ["one agent turn", () => lastRequest(["a1"], { a1: first })],
        ["two agent turns: the newer, and the older is not asked for", () => lastRequest(["a1", "a2"], { a1: first, a2: second })],
        ["a shell turn after it is passed over", () => lastRequest(["a1", "a2"], { a1: first, a2: shell })],
        ["a newer turn whose blob is gone is passed over", () => lastRequest(["a1", "a2", "a3"], { a1: first })],
        ["a newer agent turn with no request: none, though an older turn has one", () => lastRequest(["a1", "a2"], { a1: first, a2: unnamed })],
        ["a newer agent turn with an empty request: the empty text", () => lastRequest(["a1", "a2"], { a1: first, a2: emptyName })],
        ["a turn stored as no bytes is passed over", () => lastRequest(["a1", "a2"], { a1: first, a2: new Uint8Array() })],
        ["only shell turns", () => lastRequest(["a1", "a2"], { a1: shell, a2: shell })],
        ["no blob at all", () => lastRequest(["a1", "a2"], {})],
        ["a newest turn cut short: the failure, and nothing older is asked for", () => lastRequest(["a1", "a2"], { a1: first, a2: bytes("0a05") })],
      ]);
    },
  },
  {
    name: "the whole conversation, alone and with each subagent's own",
    run: async ({ agentStore }) => {
      const ctx = { the: "context" };
      const events = [];
      const blobsByKey = {
        ...conversationBlobs(),
        // The subagents' own blobs: a turn each, under keys of their own.
        aa: stored.agentTurn({ user: "ab", steps: ["ac"], requestId: "request-sub" }),
        ab: stored.userMessage("Look in the folder.", "message-sub"),
        ac: stored.said("Looked."),
        ba: stored.shellTurn({ command: "d1", output: "d2" }),
        // A subagent's state kept apart, under a key of its own.
        "0b": stored.subagent({ conversation: stored.structure({ turns: ["ba"], todos: ["e2"] }), created: 300, used: 301, model: "model-b" }),
      };
      const rootBytes = stored.structure({
        turns: ["a1", "a2"],
        todos: ["e1", "e2"],
        summary: "f1",
        inline: {
          "sub-written-in": stored.subagent({ conversation: stored.structure({ turns: ["aa"] }), created: 100, used: 101, model: "model-a" }),
          "sub-with-no-conversation": stored.subagent({ created: 200, used: 201 }),
        },
        refs: { "sub-kept-apart": "0b" },
      });
      const blobs = keeping(blobsByKey, { events });
      const store = new agentStore.AgentStore2(blobs.store, metadataKeeping().store, { fixedRootBlobId: bytes("c0ffee") });
      await store.handleCheckpoint(ctx, structureFrom(agentStore, rootBytes));
      events.splice(0);
      const alone = await store.getFullConversation(ctx);
      const askedAlone = events.splice(0);
      const direct = await store.deserializeConversationStateStructure(ctx, structureFrom(agentStore, stored.structure({ turns: ["a2"] })));
      events.splice(0);
      const withSubagents = await store.getFullConversationWithSubagents(ctx);
      const askedWithSubagents = events.splice(0);
      const sub = withSubagents.subagentStates["sub-written-in"];
      // A store built on this one: both readings go through its own way of reading a structure.
      const mine = [];
      class Own extends agentStore.AgentStore2 {
        deserializeConversationStateStructure(...given) {
          mine.push(`asked to read a structure of ${given[1].turns.length} turns`);
          return Promise.resolve("my own reading");
        }
      }
      const own = new Own(blobs.store, metadataKeeping().store, { fixedRootBlobId: bytes("c0ffee") });
      await own.handleCheckpoint(ctx, structureFrom(agentStore, rootBytes));
      const ownAlone = await own.getFullConversation(ctx);
      const ownWith = await own.getFullConversationWithSubagents(ctx);
      // A subagent kept apart whose blob is gone.
      const lacking = new agentStore.AgentStore2(keeping(conversationBlobs()).store, metadataKeeping().store, { fixedRootBlobId: bytes("c0ffee") });
      await lacking.handleCheckpoint(ctx, structureFrom(agentStore, rootBytes));
      return {
        alone: brief(alone),
        askedAlone: keysAsked(askedAlone),
        aStructureHandedInIsReadTheSameWay: brief(direct),
        withSubagents: {
          fields: Object.keys(withSubagents),
          conversation: brief(withSubagents.conversationState),
          subagentsInOrder: Object.keys(withSubagents.subagentStates),
          aPlainList: Object.getPrototypeOf(withSubagents.subagentStates) === Object.prototype,
          oneOfThem: { fields: Object.keys(sub), conversation: brief(sub.conversationState), createdTimestampMs: sub.createdTimestampMs, lastUsedTimestampMs: sub.lastUsedTimestampMs, subagentType: sub.subagentType },
          theOneKeptApart: (({ conversationState, ...rest }) => ({ conversation: brief(conversationState), created: rest.createdTimestampMs, used: rest.lastUsedTimestampMs, type: rest.subagentType.type.case }))(withSubagents.subagentStates["sub-kept-apart"]),
        },
        askedWithSubagents: keysAsked(askedWithSubagents),
        everyCallGotTheContext: blobs.contexts.every((given) => given === ctx),
        aStoreBuiltOnItReadsThroughItsOwnWay: { alone: ownAlone, withSubagents: ownWith, mine },
        aSubagentKeptApartWhoseBlobIsGone: await outcome(() => lacking.getFullConversationWithSubagents(ctx)),
      };
    },
  },
  {
    name: "disposing of the agent's store disposes of a blob store that is a Disposable, and of no other",
    run: async ({ agentStore, disposable }) => {
      const events = [];
      const slow = later();
      class Closing extends disposable.Disposable {
        dispose(...given) {
          events.push({ disposeAsked: given.length, onTheBlobStore: this === closing });
          return slow.promise;
        }
      }
      const closing = new Closing();
      const disposing = new agentStore.AgentStore2(closing, metadataKeeping().store).dispose("not handed on");
      let done = false;
      disposing.then(() => {
        done = true;
      });
      await settle();
      const waitsForIt = done === false;
      slow.resolve("what dispose gave");
      const gave = await disposing;
      let lookalikeAsked = false;
      const lookalike = {
        dispose() {
          lookalikeAsked = true;
        },
      };
      class Silent extends disposable.Disposable {}
      class Failing extends disposable.Disposable {
        dispose() {
          throw new Error("could not be disposed of");
        }
      }
      return {
        aDisposableBlobStore: { aPromise: disposing instanceof Promise, waitsForIt, gave, events },
        aBlobStoreThatOnlyHasADisposeOfItsOwn: { gave: await outcome(() => new agentStore.AgentStore2(lookalike, metadataKeeping().store).dispose()), wasAsked: lookalikeAsked },
        aDisposableWithNoDispose: await outcome(() => new agentStore.AgentStore2(new Silent(), metadataKeeping().store).dispose()),
        aDisposableWhoseDisposeFailsAtOnce: await outcome(() => new agentStore.AgentStore2(new Failing(), metadataKeeping().store).dispose()),
        noBlobStore: await outcome(() => new agentStore.AgentStore2(undefined, metadataKeeping().store).dispose()),
        theClassHoldsNothing: Object.keys(new disposable.Disposable()),
      };
    },
  },

  // ---- The part's own pieces together -------------------------------------------
  {
    name: "the part's own pieces together: what an eager reference writes into the store in memory, a lazy reference to its key reads back",
    run: ({ serde, blobs, typed, reference, agentStore }) =>
      withClock(0.5, async () => {
        const { ctx, told } = surroundings();
        const noted = [];
        const memory = new blobs.InMemoryBlobStore();
        const store = new typed.TypedBlobStore(memory, (metadata) => noted.push({ key: hex(metadata.blobId), blobType: metadata.blobType }));
        // A text.
        const textKey = await new reference.EagerReference(serde.utf8Serde, store, "\u00e9t\u00e9 \u65e5").writeToBlobStore(ctx);
        const textStored = await memory.getBlob(ctx, textKey);
        const textRead = await new reference.LazyReference(serde.utf8Serde, store, textKey).get(ctx);
        // A message: a conversation's structure, through the serde for messages.
        const Structure = structureClass(agentStore);
        const structureSerde = new serde.ProtoSerde(Structure);
        const structure = structureFrom(agentStore, stored.structure({ turns: ["a1"], todos: ["e1"], summary: "f1", refs: { "sub-1": "0b" } }));
        const structureKey = await new reference.EagerReference(structureSerde, store, structure).writeToBlobStore(ctx);
        const structureStored = await memory.getBlob(ctx, structureKey);
        const lazy = new reference.LazyReference(structureSerde, store, structureKey);
        const structureRead = await lazy.get(ctx);
        const unchanged = await lazy.writeToBlobStore(ctx);
        // Metadata, through its own serde.
        const metadataSerde = new agentStore.AgentMetadataSerde();
        const metadata = { agentId: "agent-a", latestRootBlobId: structureKey, name: "Research", mode: "plan", isRunEverything: false, createdAt: AT, blobEncryptionKey: "ab".repeat(32) };
        const metadataKey = await new reference.EagerReference(metadataSerde, store, metadata).writeToBlobStore(ctx);
        const metadataRead = await new reference.LazyReference(metadataSerde, store, metadataKey).get(ctx);
        return {
          text: { key: textKey, stored: textStored, read: textRead },
          structure: {
            key: structureKey,
            stored: structureStored,
            keyIsTheHashOfWhatIsStored: hex(await blobs.getBlobId(structureStored)) === hex(structureKey),
            readBackTheSame: hex(structureRead.toBinary()) === hex(structure.toBinary()) && structureRead !== structure && structureRead.constructor === Structure,
            writtenAgainUnchanged: unchanged === structureKey,
          },
          metadata: { key: metadataKey, stored: asText(await memory.getBlob(ctx, metadataKey)), read: metadataRead },
          theCallbackWasToldOfEachNewBlob: noted,
          measures: told.map((entry) => Object.keys(entry)[0] + " " + Object.values(entry)[0]),
          theStoreIsDurableAsFarAsAnyoneSays: blobs.isBlobDurable(store, textKey),
          theInnermostStore: typed.unwrapBlobStore(store) === memory,
        };
      }),
  },

  // ---- When each answer comes ---------------------------------------------------
  {
    name: "how many turns of the queue pass before each answer comes, when the store answers at once",
    run: async ({ blobs, typed, reference, subagents, agentStore, serde }) => {
      const { ctx } = surroundings();
      const key = bytes("0a");
      const data = utf8("stored text");
      const memory = new blobs.InMemoryBlobStore();
      const { store } = keeping({ ...conversationBlobs(), "0a": data, "0b": stored.subagent({ created: 1, used: 2 }) });
      const fixed = { fixedRootBlobId: bytes("c0ffee") };
      const agents = new agentStore.AgentStore2(store, metadataKeeping({ latestRootBlobId: bytes("c0ffee") }).store, fixed);
      const structure = structureFrom(agentStore, conversationStructure());
      const eager = new reference.EagerReference(serde.utf8Serde, store, "hello");
      await eager.writeToBlobStore(ctx);
      const lazy = () => new reference.LazyReference(serde.utf8Serde, store, key);
      const loaded = lazy();
      await loaded.get(ctx);
      const changed = lazy();
      changed.set("other");
      const failed = new reference.LazyReference(serde.utf8Serde, store, bytes("ee"));
      await failed.get(ctx).catch(() => {});
      const answers = {};
      const count = async (words, promise) => {
        answers[words] = await turns(promise);
      };
      await count("the store in memory, a write", memory.setBlob(ctx, key, data));
      await count("the store in memory, a read", memory.getBlob(ctx, key));
      await count("the store in memory, a write kept locally", memory.setBlobLocallyOnly(ctx, key, data));
      await count("the store in memory, a flush", memory.flush(ctx));
      await count("a typed store, a read", new typed.TypedBlobStore(store).getBlob(ctx, key));
      await count("readable from the mirror, a store that cannot wait", typed.setBlobReadableFromCloudMirror({ blobStore: store, ctx, blobId: key, blobData: data }));
      await count("readable from the mirror, a store that can", typed.setBlobReadableFromCloudMirror({ blobStore: { setBlobAwaitingSecondary: () => Promise.resolve() }, ctx, blobId: key, blobData: data }));
      await count("an eager reference, its value", eager.get(ctx));
      await count("an eager reference, written again unchanged", eager.writeToBlobStore(ctx));
      await count("a lazy reference, its value for the first time", lazy().get(ctx));
      await count("a lazy reference, its value once loaded", loaded.get(ctx));
      await count("a lazy reference, its value once set", changed.get(ctx));
      await count("a lazy reference, its value when the blob is missing", new reference.LazyReference(serde.utf8Serde, store, bytes("ee")).get(ctx));
      await count("a lazy reference, the failure once kept", failed.get(ctx));
      await count("a lazy reference, written before it was read", lazy().writeToBlobStore(ctx));
      await count("a lazy reference, written once loaded", loaded.writeToBlobStore(ctx));
      await count("subagents, none kept apart", subagents.resolveSubagentPersistedStates(ctx, structure, store));
      await count("subagents, one kept apart", subagents.resolveSubagentPersistedStates(ctx, structureFrom(agentStore, stored.structure({ refs: { one: "0b" } })), store));
      await count("subagents, one kept apart and missing", subagents.resolveSubagentPersistedStates(ctx, structureFrom(agentStore, stored.structure({ refs: { one: "ee" } })), store));
      await count("a conversation of nothing", agentStore.deriveConversationStateFromStructure(ctx, structureFrom(agentStore, new Uint8Array()), store));
      await count("a conversation of ten blobs", agentStore.deriveConversationStateFromStructure(ctx, structure, store));
      await count("the agent's store, a checkpoint under a fixed key", agents.handleCheckpoint(ctx, structure));
      await count("the agent's store, the last request", agents.getLastRequestIdFromConversation(ctx));
      await count("the agent's store, the whole conversation", agents.getFullConversation(ctx));
      await count("the agent's store, the whole conversation with subagents", agents.getFullConversationWithSubagents(ctx));
      await count("the agent's store, read back from its root", agents.tryResetFromDb(ctx));
      await count("the agent's store, read back from its root, saying nothing", agents.resetFromDb(ctx));
      await count("the agent's store, read back when no root is named", new agentStore.AgentStore2(store, metadataKeeping().store).tryResetFromDb(ctx));
      await count("the agent's store, disposed of", agents.dispose());
      return answers;
    },
  },
];
