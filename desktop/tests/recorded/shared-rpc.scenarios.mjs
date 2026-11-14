/**
 * Two files of what the window, the coordinator and the host say to each other: the coordinator's methods and the
 * shapes of its transcript calls (`coordinator.ts`), and the envelope a tool call or its result travels in from
 * the host to the window (`client-side-tool-v2-transport.ts`).
 *
 * The folder holds other files that are not this part's; `covers` names the two that are. Nothing here goes over
 * a connection: both files only check and pack what a connection carries. The messages inside the envelope are
 * the engine's real wire messages, made from bytes written by hand below.
 */
export const part = "shared/rpc";
export const modules = {
  coordinator: "source/shared/rpc/coordinator.ts",
  transport: "source/shared/rpc/client-side-tool-v2-transport.ts",
};
export const covers = ["source/shared/rpc/coordinator.ts", "source/shared/rpc/client-side-tool-v2-transport.ts"];

/** What something that came off a connection may be when it is not an object of fields. */
const NOT_RECORDS = [
  ["nothing", undefined],
  ["null", null],
  ["a list", []],
  ["a list of one record", [{ id: "a", rootId: "r" }]],
  ["words", "words"],
  ["a number", 7],
  ["true", true],
  ["a function", () => ({})],
];

/** A table of cases asked of one function: the name of each, and what came back. */
const ask = (rows, answer) => rows.map(([name, value]) => [name, answer(value)]);

/** A thing that tells each time one of its fields is read, by name; `under` is the name of the thing itself. */
function telling(value, reads, under) {
  return new Proxy(value, {
    get(target, name) {
      if (typeof name === "string") reads.push(`${under}.${name}`);
      const found = target[name];
      return found !== null && typeof found === "object" && !Array.isArray(found) ? telling(found, reads, `${under}.${String(name)}`) : found;
    },
    has(target, name) { reads.push(`${String(name)} in ${under}`); return name in target; },
    ownKeys(target) { reads.push(`keys of ${under}`); return Reflect.ownKeys(target); },
  });
}

const entry = (id, more = {}) => ({ id, kind: "send-message", ...more });

const WINDOW_RESPONSES = [
  ["the least there can be", { entries: [], threadCounts: {} }],
  ["entries, a next page and counts; anything else is dropped", { extra: "dropped", threadCounts: { "root-2": 0, "root-1": 3 }, nextBeforeSeq: 12, entries: [entry("e1", { seq: 1, message: { type: "text" } }), entry("e2")], more: 1 }],
  ["a next page of zero", { entries: [], threadCounts: {}, nextBeforeSeq: 0 }],
  ["a next page below zero or in halves is taken", { entries: [], threadCounts: {}, nextBeforeSeq: -1.5 }],
  ["a next page said to be undefined is left out", { entries: [], threadCounts: {}, nextBeforeSeq: undefined }],
  ["a next page of null", { entries: [], threadCounts: {}, nextBeforeSeq: null }],
  ["a next page that is no number", { entries: [], threadCounts: {}, nextBeforeSeq: Number.NaN }],
  ["a next page without end", { entries: [], threadCounts: {}, nextBeforeSeq: Number.POSITIVE_INFINITY }],
  ["a next page as words", { entries: [], threadCounts: {}, nextBeforeSeq: "12" }],
  ["no entries", { threadCounts: {} }],
  ["entries that are a record", { entries: { 0: entry("e1"), length: 1 }, threadCounts: {} }],
  ["entries that are words", { entries: "e1", threadCounts: {} }],
  ["an entry with no id", { entries: [entry("e1"), { kind: "text" }], threadCounts: {} }],
  ["an entry with an empty id", { entries: [entry("")], threadCounts: {} }],
  ["an entry whose id is a number", { entries: [entry(4)], threadCounts: {} }],
  ["an entry with no kind", { entries: [{ id: "e1" }], threadCounts: {} }],
  ["an entry with an empty kind", { entries: [{ id: "e1", kind: "" }], threadCounts: {} }],
  ["an entry that is null", { entries: [null], threadCounts: {} }],
  ["an entry that is a list", { entries: [["e1", "text"]], threadCounts: {} }],
  ["an entry that is words", { entries: ["e1"], threadCounts: {} }],
  ["entries with gaps: the gaps are not looked at", { entries: [entry("e1"), , entry("e3")], threadCounts: {} }],
  ["no counts", { entries: [] }],
  ["counts that are null", { entries: [], threadCounts: null }],
  ["counts that are a list", { entries: [], threadCounts: [1, 2] }],
  ["a count that is no number", { entries: [], threadCounts: { root: Number.NaN } }],
  ["a count without end", { entries: [], threadCounts: { root: Number.NEGATIVE_INFINITY } }],
  ["a count as words", { entries: [], threadCounts: { root: "2" } }],
  ["a count of null", { entries: [], threadCounts: { root: null } }],
  ["a count under an empty name", { entries: [], threadCounts: { root: 1, "": 2 } }],
  ["counts below zero or in halves are taken", { entries: [], threadCounts: { a: -1, b: 0.5 } }],
  ["counts under numbers come first, in rising order, as in what was given", { entries: [], threadCounts: { b: 1, 10: 2, a: 3, 2: 4 } }],
  ["counts held by a map: none are seen", { entries: [], threadCounts: new Map([["root", 1]]) }],
  ["counts that are only inherited: none are seen", { entries: [], threadCounts: Object.create({ root: 1 }) }],
  ["entries and counts that are only inherited: taken", Object.create({ entries: [entry("e1")], threadCounts: { root: 1 }, nextBeforeSeq: 2 })],
  ["a thing of a class that holds entries and counts: taken", Object.assign(new Date(0), { entries: [], threadCounts: {} })],
];

const WINDOW_REQUESTS = [
  ["an id alone", { id: "agent-1" }],
  ["an id, a place to read before and a limit, whatever order they come in; anything else is dropped", { limit: 50, extra: true, beforeSeq: 120, id: "agent-1" }],
  ["before zero", { id: "a", beforeSeq: 0 }],
  ["before a number below zero", { id: "a", beforeSeq: -3 }],
  ["before a whole number written with a point", { id: "a", beforeSeq: 7.0 }],
  ["before a very large whole number", { id: "a", beforeSeq: 1e21 }],
  ["before a half", { id: "a", beforeSeq: 7.5 }],
  ["before what is no number", { id: "a", beforeSeq: Number.NaN }],
  ["before no end", { id: "a", beforeSeq: Number.POSITIVE_INFINITY }],
  ["before words", { id: "a", beforeSeq: "7" }],
  ["before null", { id: "a", beforeSeq: null }],
  ["before undefined: left out", { id: "a", beforeSeq: undefined, limit: undefined }],
  ["a limit of zero", { id: "a", limit: 0 }],
  ["a limit below zero", { id: "a", limit: -1 }],
  ["a limit in halves is taken", { id: "a", limit: 2.5 }],
  ["a limit that is no number", { id: "a", limit: Number.NaN }],
  ["a limit without end", { id: "a", limit: Number.POSITIVE_INFINITY }],
  ["a limit as words", { id: "a", limit: "50" }],
  ["a limit of null", { id: "a", limit: null }],
  ["no id", { beforeSeq: 1, limit: 2 }],
  ["an empty id", { id: "" }],
  ["an id that is a number", { id: 5 }],
  ["an id of null", { id: null }],
  ["an id and a limit that are only inherited: taken", Object.create({ id: "agent-1", limit: 5 })],
  ["a thing with nothing above it", Object.assign(Object.create(null), { id: "agent-1", beforeSeq: 2 })],
];

const THREAD_RESPONSES = [
  ["no entries at all", { entries: [] }],
  ["entries; anything else is dropped", { entries: [entry("e1"), entry("e2", { thread: "root-1" })], threadCounts: { dropped: 1 }, extra: true }],
  ["nothing under entries", {}],
  ["entries of null", { entries: null }],
  ["entries that are a record", { entries: { 0: entry("e1") } }],
  ["an entry with an empty id", { entries: [entry("e1"), entry("")] }],
  ["an entry with no kind", { entries: [{ id: "e1" }] }],
  ["an entry whose kind is a number", { entries: [{ id: "e1", kind: 3 }] }],
  ["an entry that is null", { entries: [null] }],
];

const THREAD_REQUESTS = [
  ["an id and a root", { id: "agent-1", rootId: "root-1" }],
  ["the two, whatever order they come in; anything else is dropped", { extra: 1, rootId: "root-1", id: "agent-1", beforeSeq: 4 }],
  ["no root", { id: "agent-1" }],
  ["no id", { rootId: "root-1" }],
  ["an empty id", { id: "", rootId: "root-1" }],
  ["an empty root", { id: "agent-1", rootId: "" }],
  ["an id that is a number", { id: 1, rootId: "root-1" }],
  ["a root that is null", { id: "agent-1", rootId: null }],
  ["an id and a root that are only inherited: taken", Object.create({ id: "agent-1", rootId: "root-1" })],
  ["a thing of a class that holds the two: taken", Object.assign(new Map(), { id: "agent-1", rootId: "root-1" })],
];

const COORDINATOR = [
  {
    name: "the coordinator's methods, each with what it takes and what it answers, in the table's own order",
    run: ({ coordinator }) => {
      const table = coordinator.COORDINATOR_METHOD_TABLE;
      return {
        howMany: Object.keys(table).length,
        rows: Object.entries(table).map(([name, row]) => `${name}: ${Object.entries(row).map(([key, value]) => `${key} ${value}`).join(", ")}`),
        kindsOfArguments: [...new Set(Object.values(table).map((row) => row.args))],
        kindsOfReply: [...new Set(Object.values(table).map((row) => row.reply))],
        frozen: Object.isFrozen(table),
        aRowFrozen: Object.isFrozen(table.listAgents),
        anOrdinaryObject: Object.getPrototypeOf(table) === Object.prototype,
      };
    },
  },
  {
    name: "a name is a coordinator method when the table holds it as its own, and only then",
    run: ({ coordinator }) => {
      const { COORDINATOR_METHOD_TABLE: table, isCoordinatorMethod } = coordinator;
      return {
        everyNameInTheTable: Object.keys(table).every((name) => isCoordinatorMethod(name) === true),
        others: ask([
          ["a name every object has", "toString"],
          ["another", "constructor"],
          ["another", "hasOwnProperty"],
          ["the prototype's own name", "__proto__"],
          ["an empty name", ""],
          ["a method in other letters", "getagentthread"],
          ["a method with a space after it", "getAgentThread "],
          ["a method of main's table, not this one", "getAppVersion"],
          ["a number", 5],
          ["null", null],
          ["nothing", undefined],
          ["a list holding a method's name", ["listAgents"]],
          ["a thing that writes itself as a method's name", { toString: () => "listAgents" }],
          ["a symbol", Symbol("listAgents")],
        ], (name) => isCoordinatorMethod(name)),
      };
    },
  },
  {
    name: "a transcript window as answered: what is taken, what is refused",
    run: ({ coordinator }) => ask(WINDOW_RESPONSES, (value) => coordinator.parseCoordinatorTranscriptWindowResponse(value)),
  },
  {
    name: "a transcript window as answered, when it is no record at all",
    run: ({ coordinator }) => ask(NOT_RECORDS, (value) => coordinator.parseCoordinatorTranscriptWindowResponse(value)),
  },
  {
    name: "a transcript window that is taken hands back the very list of entries it was given, and counts of its own",
    run: ({ coordinator }) => {
      const given = { entries: [entry("e1", { seq: 4 })], threadCounts: { root: 2 }, nextBeforeSeq: 4 };
      const taken = coordinator.parseCoordinatorTranscriptWindowResponse(given);
      return {
        keys: Object.keys(taken),
        theSameList: taken.entries === given.entries,
        theSameEntry: taken.entries[0] === given.entries[0],
        countsOfItsOwn: taken.threadCounts !== given.threadCounts,
        anOrdinaryObject: Object.getPrototypeOf(taken.threadCounts) === Object.prototype,
        notFrozen: [Object.isFrozen(taken), Object.isFrozen(taken.threadCounts)],
      };
    },
  },
  {
    name: "counts read from text: a count under the prototype's own name is lost on the way",
    run: ({ coordinator }) => {
      const given = JSON.parse('{"entries":[],"threadCounts":{"root":1,"__proto__":2,"constructor":3}}');
      const taken = coordinator.parseCoordinatorTranscriptWindowResponse(given);
      return { givenKeys: Object.keys(given.threadCounts), taken, takenKeys: Object.keys(taken.threadCounts), stillAnOrdinaryObject: Object.getPrototypeOf(taken.threadCounts) === Object.prototype };
    },
  },
  {
    name: "a request for a transcript window: what is taken, what is refused",
    run: ({ coordinator }) => ask(WINDOW_REQUESTS, (value) => coordinator.parseCoordinatorTranscriptWindowRequest(value)),
  },
  {
    name: "a request for a transcript window, when it is no record at all",
    run: ({ coordinator }) => ask(NOT_RECORDS, (value) => coordinator.parseCoordinatorTranscriptWindowRequest(value)),
  },
  {
    name: "a thread as answered: what is taken, what is refused",
    run: ({ coordinator }) => ask([...THREAD_RESPONSES, ...NOT_RECORDS], (value) => coordinator.parseCoordinatorAgentThreadResponse(value)),
  },
  {
    name: "a thread that is taken hands back the very list of entries it was given",
    run: ({ coordinator }) => {
      const given = { entries: [entry("e1")], extra: 1 };
      const taken = coordinator.parseCoordinatorAgentThreadResponse(given);
      return { keys: Object.keys(taken), theSameList: taken.entries === given.entries, aNewObject: taken !== given };
    },
  },
  {
    name: "a request for a thread: what is taken, what is refused",
    run: ({ coordinator }) => ask([...THREAD_REQUESTS, ...NOT_RECORDS], (value) => coordinator.parseCoordinatorAgentThreadRequest(value)),
  },
  {
    name: "a reply is checked for the two transcript methods only, and what comes back is the reply itself, with all it held",
    run: ({ coordinator }) => {
      const { validateCoordinatorReply } = coordinator;
      const window = { entries: [entry("e1")], threadCounts: { root: 1 }, extra: "kept" };
      const thread = { entries: [entry("e1")], extra: "kept" };
      return {
        aWindowItself: validateCoordinatorReply("getAgentTranscriptWindow", window) === window,
        aThreadItself: validateCoordinatorReply("getAgentThread", thread) === thread,
        otherMethodsTakeAnything: ask([
          ["a method with a page, given a malformed page", ["getAgentTranscriptTail", { entries: "no" }]],
          ["a method with a page, given nothing", ["openAgentTail", undefined]],
          ["a method that lists, given null", ["listAgents", null]],
          ["a method not in the table", ["noSuchMethod", 5]],
          ["a window's name in other letters, given a malformed window", ["getagenttranscriptwindow", { entries: "no" }]],
          ["a thread's name with a space, given a malformed thread", ["getAgentThread ", null]],
          ["a name that is not words", [undefined, "anything"]],
        ], ([method, value]) => validateCoordinatorReply(method, value)),
      };
    },
  },
  {
    name: "a malformed transcript window or thread is refused with the method's own sentence",
    run: ({ coordinator }) => {
      const refusal = (method, value) => {
        try {
          return { passed: coordinator.validateCoordinatorReply(method, value) };
        } catch (error) {
          return { class: error.constructor.name, name: error.name, message: error.message, fields: Object.keys(error) };
        }
      };
      return [
        ["a window with no counts", refusal("getAgentTranscriptWindow", { entries: [] })],
        ["a window that is null", refusal("getAgentTranscriptWindow", null)],
        ["a window that is a well formed thread", refusal("getAgentTranscriptWindow", { entries: [entry("e1")] })],
        ["a thread with a bad entry", refusal("getAgentThread", { entries: [{ id: "e1" }] })],
        ["a thread that is nothing", refusal("getAgentThread", undefined)],
        ["a thread that is a well formed window", refusal("getAgentThread", { entries: [], threadCounts: {} })],
      ];
    },
  },
  {
    name: "how often each field is read: a window and a thread as answered, a request for each, and the reply check",
    run: ({ coordinator }) => {
      const reads = [];
      const seen = (name, work) => {
        reads.length = 0;
        const answered = work() !== null;
        return [name, answered, [...reads]];
      };
      const window = () => telling({ entries: [telling(entry("e1"), reads, "entry")], threadCounts: { root: 1 }, nextBeforeSeq: 3 }, reads, "window");
      const thread = () => telling({ entries: [telling(entry("e1"), reads, "entry")] }, reads, "thread");
      return [
        seen("a window", () => coordinator.parseCoordinatorTranscriptWindowResponse(window())),
        seen("a window with no next page", () => coordinator.parseCoordinatorTranscriptWindowResponse(telling({ entries: [], threadCounts: {} }, reads, "window"))),
        seen("a window with a bad count", () => coordinator.parseCoordinatorTranscriptWindowResponse(telling({ entries: [], threadCounts: { a: 1, b: "2", c: 3 }, nextBeforeSeq: 3 }, reads, "window"))),
        seen("a window with a bad entry", () => coordinator.parseCoordinatorTranscriptWindowResponse({ entries: [telling({ id: "e1", kind: "" }, reads, "entry"), telling(entry("e2"), reads, "second entry")], threadCounts: {} })),
        seen("a thread", () => coordinator.parseCoordinatorAgentThreadResponse(thread())),
        seen("a request for a window", () => coordinator.parseCoordinatorTranscriptWindowRequest(telling({ id: "a", beforeSeq: 1, limit: 2 }, reads, "request"))),
        seen("a request for a window with an empty id", () => coordinator.parseCoordinatorTranscriptWindowRequest(telling({ id: "", beforeSeq: "bad", limit: "bad" }, reads, "request"))),
        seen("a request for a thread", () => coordinator.parseCoordinatorAgentThreadRequest(telling({ id: "a", rootId: "r" }, reads, "request"))),
        seen("a request for a thread with no root", () => coordinator.parseCoordinatorAgentThreadRequest(telling({ id: "a" }, reads, "request"))),
        seen("a window reply, checked", () => coordinator.validateCoordinatorReply("getAgentTranscriptWindow", window())),
        seen("a thread reply, checked", () => coordinator.validateCoordinatorReply("getAgentThread", thread())),
        seen("another method's reply, checked", () => coordinator.validateCoordinatorReply("listAgents", window())),
      ];
    },
  },
];

const CALL = "simeon.v1.ClientSideToolV2Call";
const RESULT = "simeon.v1.ClientSideToolV2Result";

/** A number as the wire writes it: seven bits at a time, the smallest first. */
function varint(number) {
  const bytes = [];
  let rest = number;
  while (rest > 127) {
    bytes.push((rest % 128) + 128);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}
/** One field of text on the wire: its number, its length, its bytes. */
const textField = (number, text) => Buffer.concat([varint(number * 8 + 2), varint(Buffer.byteLength(text)), Buffer.from(text)]);
/** One whole number or yes/no on the wire. */
const numberField = (number, value) => Buffer.concat([varint(number * 8), varint(value)]);

/** The field numbers the two messages keep their call id under (`packages/proto`, generated): 3 in a call, 35 in a result. */
const callBytes = (id, ...more) => Buffer.concat([textField(3, id), ...more]);
const resultBytes = (id, ...more) => Buffer.concat([textField(35, id), ...more]);
const packed = (messageType, bytes) => ({ encoding: "protobuf-base64", messageType, bytes: Buffer.from(bytes).toString("base64") });

/** A real call message and a real result message, with their classes, got through the part's own unpacking. */
function realMessages(transport) {
  const call = transport.decodeClientSideToolV2Message("call", packed(CALL, callBytes("call-1")));
  const result = transport.decodeClientSideToolV2Message("result", packed(RESULT, resultBytes("call-1")));
  return { call, result, Call: call.constructor, Result: result.constructor };
}

/** What a message says, without its class: its type's name and its fields as the wire's own JSON. */
const said = (message) => (message === null ? null : { type: message.getType().typeName, toolCallId: message.toolCallId, json: message.toJson() });

const event = (more = {}) => ({ version: 1, kind: "call", accountSlot: "host", agentId: "agent-1", epoch: "epoch-1", sequence: 1, message: packed(CALL, callBytes("call-1")), ...more });
const without = (value, key) => { const copy = { ...value }; delete copy[key]; return copy; };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64 = (bytes) => Buffer.from(bytes).toString("base64");
/** The same text with the letter at one place, counted from the end, changed for the next letter of base64. */
const nextLetterAt = (text, fromEnd) => {
  const at = text.length - fromEnd;
  return `${text.slice(0, at)}${LETTERS[(LETTERS.indexOf(text[at]) + 1) % 64]}${text.slice(at + 1)}`;
};
/** Calls whose bytes come to base64 with no padding (3 bytes), with two signs (4 bytes) and with one (5 bytes). */
const THREE_BYTES = base64(callBytes("c"));
const FOUR_BYTES = base64(callBytes("c1"));
const FIVE_BYTES = base64(callBytes("c12"));

/** Texts that are or are not the one right base64 of some bytes. Each is offered as a call's bytes. */
const BASE64 = [
  ["a call's bytes with no padding to them", THREE_BYTES],
  ["a call's bytes with two padding signs", FOUR_BYTES],
  ["a call's bytes with one padding sign", FIVE_BYTES],
  ["nothing", ""],
  ["the two padding signs left off", FOUR_BYTES.slice(0, -2)],
  ["the one padding sign left off", FIVE_BYTES.slice(0, -1)],
  ["a padding sign added to text that needs none", `${THREE_BYTES}=`],
  ["four padding signs added to text that needs none", `${THREE_BYTES}====`],
  ["three padding signs where there were two", `${FOUR_BYTES.slice(0, -3)}===`],
  ["padding signs only", "===="],
  ["a padding sign in the middle", `${THREE_BYTES.slice(0, 2)}=${THREE_BYTES.slice(3)}`],
  ["the web's own letters in place of + and /", `${THREE_BYTES.slice(0, 2)}-_`],
  ["a space in place of a letter", `${THREE_BYTES.slice(0, 2)} ${THREE_BYTES.slice(3)}`],
  ["a line end after the text", `${THREE_BYTES}\n`],
  ["a line end in place of the last letter", `${THREE_BYTES.slice(0, 3)}\n`],
  ["a line end in place of the last padding sign", `${FOUR_BYTES.slice(0, -1)}\n`],
  ["bits left over in the letter before two padding signs", nextLetterAt(FOUR_BYTES, 3)],
  ["bits left over in the letter before one padding sign", nextLetterAt(FIVE_BYTES, 2)],
  ["the last letter changed where there is no padding: the one right base64 of other bytes, here a call with another id", nextLetterAt(THREE_BYTES, 1)],
  ["a call's id cut short", base64(callBytes("call-1").subarray(0, 5))],
  ["a field of a kind the wire does not have", base64([0x1f, 0x01, 0x02])],
  ["a field with no number", base64([0x02, 0x01, 0x41])],
  ["a call with an id of no letters", base64(Buffer.concat([textField(3, ""), textField(9, "x")]))],
  ["a call with a name and no id", base64(textField(9, "read_file"))],
  ["a call with a field the message does not know: kept", base64(Buffer.concat([callBytes("call-1"), textField(900, "new")]))],
  ["a call whose id is written twice: the last one counts", base64(Buffer.concat([textField(3, "first"), textField(3, "second")]))],
];

const TRANSPORT = [
  {
    name: "the three fixed words of the envelope: its family, its version, the slot of the account it speaks for",
    run: ({ transport }) => [transport.CLIENT_SIDE_TOOL_V2_FAMILY, transport.CLIENT_SIDE_TOOL_V2_WIRE_VERSION, transport.CLIENT_SIDE_TOOL_V2_ACCOUNT_SLOT],
  },
  {
    name: "a call and a result are packed as the wire's own bytes in base64, under the name of their message",
    run: ({ transport }) => {
      const { Call, Result } = realMessages(transport);
      const call = new Call({ tool: 5, toolCallId: "call-1", name: "read_file", rawArgs: "{\"path\":\"notes.txt\"}", isStreaming: true, toolIndex: 2, modelCallId: "model-1", params: { case: "readFileParams", value: { relativeWorkspacePath: "notes.txt", readEntireFile: true } } });
      const result = new Result({ tool: 5, toolCallId: "call-1", modelCallId: "model-1", toolIndex: 2, result: { case: "readFileResult", value: { contents: "hello" } } });
      const failed = new Result({ tool: 15, toolCallId: "call-2", error: { clientVisibleErrorMessage: "It did not run.", modelVisibleErrorMessage: "exit 1" } });
      return ask([["a call", ["call", call]], ["a result", ["result", result]], ["a result that is an error", ["result", failed]]], ([kind, message]) => {
        const out = transport.encodeClientSideToolV2Message(kind, message);
        return { out, keys: Object.keys(out), theWiresOwnBytes: Buffer.from(message.toBinary()).toString("base64") === out.bytes, hex: Buffer.from(out.bytes, "base64").toString("hex") };
      });
    },
  },
  {
    name: "packing does not look at what it is given: any kind but a call is named a result, and the bytes are whatever the thing writes",
    run: ({ transport }) => {
      const { call, result } = realMessages(transport);
      const writes = (bytes) => ({ toBinary: () => bytes });
      return ask([
        ["a result packed as a call", ["call", result]],
        ["a call packed as a result", ["result", call]],
        ["a call packed as a reset", ["reset", call]],
        ["a call packed as no kind", [undefined, call]],
        ["a call packed as a kind in other letters", ["Call", call]],
        ["a thing that writes no bytes", ["call", writes(new Uint8Array(0))]],
        ["a thing that writes a plain list of numbers", ["result", writes([1, 2, 255])]],
        ["a thing that writes a part of a longer buffer", ["call", writes(new Uint8Array([9, 8, 7, 6, 5]).subarray(1, 4))]],
        ["a thing that writes words", ["call", writes("words")]],
      ], ([kind, value]) => transport.encodeClientSideToolV2Message(kind, value));
    },
  },
  {
    name: "packing a thing that cannot write itself is the runtime's error",
    run: ({ transport }) => ask([["null", null], ["a record with no way to write itself", {}]], (value) => {
      try {
        return transport.encodeClientSideToolV2Message("call", value);
      } catch (error) {
        return { aRuntimeError: error.constructor.name };
      }
    }),
  },
  {
    name: "unpacking a call and a result: the real messages come back, with all they held",
    run: ({ transport }) => {
      const { Call, Result } = realMessages(transport);
      const call = new Call({ tool: 15, toolCallId: "call-7", name: "run_terminal_cmd", rawArgs: "{\"command\":\"ls\"}", isLastMessage: true, internal: true, timeoutMs: 1500.5 });
      const result = new Result({ tool: 15, toolCallId: "call-7", error: { clientVisibleErrorMessage: "It did not run.", modelVisibleErrorMessage: "exit 1" } });
      const unpackedCall = transport.decodeClientSideToolV2Message("call", transport.encodeClientSideToolV2Message("call", call));
      const unpackedResult = transport.decodeClientSideToolV2Message("result", transport.encodeClientSideToolV2Message("result", result));
      return {
        call: said(unpackedCall),
        aCallOfTheSameClass: unpackedCall instanceof Call && unpackedCall !== call,
        equalToWhatWasPacked: Call.equals(unpackedCall, call),
        result: said(unpackedResult),
        aResultOfTheSameClass: unpackedResult instanceof Result && unpackedResult !== result,
        equalToWhatWasPackedToo: Result.equals(unpackedResult, result),
      };
    },
  },
  {
    name: "unpacking: the envelope must say base64 of the wire's bytes, hold text, and name the message of its kind",
    run: ({ transport }) => {
      const call = packed(CALL, callBytes("call-1"));
      const result = packed(RESULT, resultBytes("call-1"));
      return ask([
        ["a call", ["call", call]],
        ["a call with more fields than the three: taken", ["call", { ...call, extra: true, version: 9 }]],
        ["a result", ["result", result]],
        ["a call offered as a result", ["result", call]],
        ["a result offered as a call", ["call", result]],
        ["a call's bytes under the result's name, offered as a result: no call id is found in them", ["result", packed(RESULT, callBytes("call-1"))]],
        ["a result's bytes under the call's name, offered as a call", ["call", packed(CALL, resultBytes("call-1"))]],
        ["a result offered as a reset: any kind but a call is read as a result", ["reset", result]],
        ["a result offered as no kind", [undefined, result]],
        ["a call offered as a kind in other letters", ["Call", call]],
        ["the encoding the window is handed", ["call", { ...call, encoding: "protobuf" }]],
        ["another encoding", ["call", { ...call, encoding: "base64" }]],
        ["no encoding", ["call", without(call, "encoding")]],
        ["no message name", ["call", without(call, "messageType")]],
        ["a message name in other letters", ["call", { ...call, messageType: CALL.toLowerCase() }]],
        ["no bytes", ["call", without(call, "bytes")]],
        ["bytes that are bytes, not text", ["call", { ...call, bytes: callBytes("call-1") }]],
        ["bytes that are a number", ["call", { ...call, bytes: 7 }]],
        ["bytes of null", ["call", { ...call, bytes: null }]],
        ...NOT_RECORDS.map(([name, value]) => [name, ["call", value]]),
      ], ([kind, value]) => said(transport.decodeClientSideToolV2Message(kind, value)));
    },
  },
  {
    name: "unpacking: the text must be the one right base64 of bytes that are a message with a call id",
    run: ({ transport }) => ask(BASE64, (bytes) => {
      const message = transport.decodeClientSideToolV2Message("call", { encoding: "protobuf-base64", messageType: CALL, bytes });
      return message === null ? null : { ...said(message), writtenBackTheSame: Buffer.from(message.toBinary()).toString("base64") === bytes };
    }),
  },
  {
    name: "an event from the host: a call, a result and a reset as they are taken, key by key",
    run: ({ transport }) => {
      const call = event();
      const result = event({ kind: "result", sequence: 2, message: packed(RESULT, resultBytes("call-1")) });
      const reset = without(event({ kind: "reset", sequence: 3 }), "message");
      return ask([["a call", call], ["a result", result], ["a reset", reset]], (given) => {
        const taken = transport.parseClientSideToolV2TransportEvent(given);
        return { taken, keys: Object.keys(taken), aNewObject: taken !== given, theVeryMessageGiven: "message" in taken ? taken.message === given.message : "none" };
      });
    },
  },
  {
    name: "an event from the host: what else it holds is dropped, but its message is handed on as it came",
    run: ({ transport }) => {
      const given = event({ extra: "dropped", sentAt: 5, message: { ...packed(CALL, callBytes("call-1")), extra: "kept" } });
      const reset = event({ kind: "reset", message: "anything at all", extra: "dropped" });
      return [transport.parseClientSideToolV2TransportEvent(given), transport.parseClientSideToolV2TransportEvent(reset)];
    },
  },
  {
    name: "an event from the host: what is taken and what is refused, field by field",
    run: ({ transport }) => ask([
      ["version 1 written with a point", event({ version: 1.0 })],
      ["version 2", event({ version: 2 })],
      ["version 0", event({ version: 0 })],
      ["a version as words", event({ version: "1" })],
      ["a version of true", event({ version: true })],
      ["no version", without(event(), "version")],
      ["an account slot that is not the host's: taken here", event({ accountSlot: "other" })],
      ["an empty account slot", event({ accountSlot: "" })],
      ["no account slot", without(event(), "accountSlot")],
      ["an account slot that is a number", event({ accountSlot: 1 })],
      ["an empty agent id", event({ agentId: "" })],
      ["no agent id", without(event(), "agentId")],
      ["an agent id of null", event({ agentId: null })],
      ["an empty epoch", event({ epoch: "" })],
      ["no epoch", without(event(), "epoch")],
      ["an epoch that is a number", event({ epoch: 7 })],
      ["sequence 1", event({ sequence: 1 })],
      ["the largest whole number that is safe", event({ sequence: Number.MAX_SAFE_INTEGER })],
      ["one more than that", event({ sequence: Number.MAX_SAFE_INTEGER + 1 })],
      ["sequence 0", event({ sequence: 0 })],
      ["a sequence below zero", event({ sequence: -1 })],
      ["a sequence in halves", event({ sequence: 1.5 })],
      ["a sequence as words", event({ sequence: "1" })],
      ["a sequence that is no number", event({ sequence: Number.NaN })],
      ["a sequence without end", event({ sequence: Number.POSITIVE_INFINITY })],
      ["a sequence of null", event({ sequence: null })],
      ["no sequence", without(event(), "sequence")],
      ["a sequence of minus zero", event({ sequence: -0 })],
      ["a sequence that is a big whole number of another kind", event({ sequence: 1n })],
      ["an event whose fields are all only inherited: taken, as an object of its own fields", Object.create(event())],
      ["a kind in other letters", event({ kind: "Call" })],
      ["an empty kind", event({ kind: "" })],
      ["no kind", without(event(), "kind")],
      ["a kind that is a number", event({ kind: 1 })],
      ["a call with no message", without(event(), "message")],
      ["a call with a result's message", event({ message: packed(RESULT, resultBytes("call-1")) })],
      ["a result with a call's message", event({ kind: "result" })],
      ["a call whose message has no call id", event({ message: packed(CALL, textField(9, "read_file")) })],
      ["a call whose message is not the one right base64", event({ message: { ...packed(CALL, callBytes("c")), bytes: "GgFj\n" } })],
      ["a reset with a bad sequence", event({ kind: "reset", sequence: 0 })],
      ["a reset with no epoch", without(event({ kind: "reset" }), "epoch")],
      ...NOT_RECORDS,
    ], (value) => transport.parseClientSideToolV2TransportEvent(value)),
  },
  {
    name: "an event for the window: the message's bytes are unpacked from base64, and the message is named plain protobuf",
    run: ({ transport }) => {
      const given = event({ extra: "dropped", message: { ...packed(CALL, callBytes("call-1", textField(9, "read_file"))), extra: "dropped too" } });
      const before = JSON.stringify(given);
      const made = transport.materializeClientSideToolV2RendererEvent(given);
      return {
        made,
        keys: Object.keys(made),
        messageKeys: Object.keys(made.message),
        bytesAreANodeBuffer: Buffer.isBuffer(made.message.bytes),
        theWiresOwnBytes: Buffer.compare(made.message.bytes, callBytes("call-1", textField(9, "read_file"))) === 0,
        whatWasGivenIsUntouched: JSON.stringify(given) === before,
        aMessageOfItsOwn: made.message !== given.message,
      };
    },
  },
  {
    name: "an event for the window: a result is made the same way, a reset is handed on as it was taken, and what is refused stays refused",
    run: ({ transport }) => ask([
      ["a result", event({ kind: "result", sequence: 9, message: packed(RESULT, resultBytes("call-1", numberField(1, 5))) })],
      ["a reset", event({ kind: "reset", extra: "dropped" })],
      ["a call with sequence 0", event({ sequence: 0 })],
      ["a call with a bad message", event({ message: packed(CALL, Buffer.from([0x1f, 0x01])) })],
      ["an event already made for the window", transport.materializeClientSideToolV2RendererEvent(event())],
      ...NOT_RECORDS,
    ], (value) => transport.materializeClientSideToolV2RendererEvent(value)),
  },
  {
    name: "from the host to the window and read again: a call, its result, then a reset, in the order they were sent",
    run: ({ transport }) => {
      const { Call, Result } = realMessages(transport);
      const call = new Call({ tool: 5, toolCallId: "call-1", name: "read_file", rawArgs: "{\"path\":\"notes.txt\"}", params: { case: "readFileParams", value: { relativeWorkspacePath: "notes.txt" } } });
      const result = new Result({ tool: 5, toolCallId: "call-1", result: { case: "readFileResult", value: { contents: "hello" } } });
      const envelope = (sequence, kind, message) => ({ version: transport.CLIENT_SIDE_TOOL_V2_WIRE_VERSION, kind, accountSlot: transport.CLIENT_SIDE_TOOL_V2_ACCOUNT_SLOT, agentId: "agent-1", epoch: "epoch-1", sequence, ...(message === undefined ? {} : { message }) });
      const sent = [
        envelope(1, "call", transport.encodeClientSideToolV2Message("call", call)),
        envelope(2, "result", transport.encodeClientSideToolV2Message("result", result)),
        envelope(3, "reset"),
      ];
      // What is sent crosses to another process as text.
      const arrived = JSON.parse(JSON.stringify(sent));
      return arrived.map((raw) => {
        const taken = transport.parseClientSideToolV2TransportEvent(raw);
        const forTheWindow = transport.materializeClientSideToolV2RendererEvent(taken);
        if (taken.kind === "reset") return { taken, forTheWindow };
        const read = taken.kind === "call" ? Call.fromBinary(forTheWindow.message.bytes) : Result.fromBinary(forTheWindow.message.bytes);
        return { taken, forTheWindow, readAgain: said(read), equalToWhatWasSent: taken.kind === "call" ? Call.equals(read, call) : Result.equals(read, result) };
      });
    },
  },
  {
    name: "how often each field is read: unpacking a message, taking an event, making one for the window",
    run: ({ transport }) => {
      const reads = [];
      const seen = (name, work) => {
        reads.length = 0;
        const answered = work() !== null;
        return [name, answered, [...reads]];
      };
      const message = () => telling(packed(CALL, callBytes("call-1")), reads, "message");
      return [
        seen("unpacking a call", () => transport.decodeClientSideToolV2Message("call", message())),
        seen("unpacking a call offered as a result", () => transport.decodeClientSideToolV2Message("result", message())),
        seen("unpacking with the wrong encoding", () => transport.decodeClientSideToolV2Message("call", telling({ encoding: "other", messageType: CALL, bytes: 5 }, reads, "message"))),
        seen("taking a call", () => transport.parseClientSideToolV2TransportEvent(telling(event(), reads, "event"))),
        seen("taking a reset", () => transport.parseClientSideToolV2TransportEvent(telling(event({ kind: "reset" }), reads, "event"))),
        seen("taking an event of an unknown kind", () => transport.parseClientSideToolV2TransportEvent(telling(event({ kind: "other" }), reads, "event"))),
        seen("taking an event with an empty agent id", () => transport.parseClientSideToolV2TransportEvent(telling(event({ agentId: "", epoch: "", sequence: 0 }), reads, "event"))),
        seen("taking an event with sequence 0", () => transport.parseClientSideToolV2TransportEvent(telling(event({ sequence: 0 }), reads, "event"))),
        seen("making a call for the window", () => transport.materializeClientSideToolV2RendererEvent(telling(event(), reads, "event"))),
      ];
    },
  },
];

export const scenarios = [...COORDINATOR, ...TRANSPORT];
