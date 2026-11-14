/** The engine's numbered failures: the table of them, the values each is made with, and the labels a failure is reported under. */
export const part = "shared/errors";
export const modules = {
  bounded: "source/shared/errors/bounded.ts",
  registry: "source/shared/errors/registry.ts",
};

/** Every character from 0 to 127, one by one. */
const ASCII = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code));
/** Characters past 127 that a careless pattern lets through: accents, wide letters, and the ones a case-blind match folds into letters. */
const BEYOND = ["\u0080", "\u00e9", "\u00ff", "\u0131", "\u017f", "\u212a", "\uff21", "\uff10", "\u2028", "\u65e5", "\ud83d\ude00"];
const hex = (text) => Array.from(text, (ch) => ch.codePointAt(0).toString(16)).join(" ");

/** Texts that look like what a failure really carries: names, paths, addresses, and near misses of the allowed shape. */
const TEXTS = [
  "ECONNRESET", "E_OTHER", "a.b_c:d|e-f", "-", ".", "_", ":", "|", "--", "0", "007", "not_connected", "Unavailable", "NotAllowedError",
  "a b", " a", "a ", "a/b", "a\\b", "a,b", "a@b", "a+b", "a=b", "a#b", "a\tb", "a\n", "\na", "a\u0000b",
  "\u00e9", "na\u00efve", "\u65e5\u672c", "user@example.com", "/Users/ada/file.txt", "C:\\temp", "https://example.com/x", "connect ECONNREFUSED 127.0.0.1:443",
];

/** A value for each field a definition may declare; a field with none here stops the scenario, so a new field is noticed. */
const SAMPLE = {
  errno: "ECONNRESET",
  httpStatus: 503,
  batchEntries: 12,
  reason: "not_connected",
  domError: "NotAllowedError",
  signErrorClass: "timeout",
  stage: "image_pull",
  connectCode: "Unavailable",
  retryAfterMs: 1500,
  phase: "window",
  process: "GPU",
  leg: "send",
  timeoutMs: 5000,
  tail: "torn",
};
function sampleFor(definition) {
  return Object.fromEntries(definition.payload.map((field) => {
    if (!(field in SAMPLE)) throw new Error(`no sample value for the declared field "${field}"`);
    return [field, SAMPLE[field]];
  }));
}

/** What a call gave, or what it threw, so one refusal does not hide the cases after it. */
function attempt(run) {
  try {
    return { gave: run() };
  } catch (error) {
    return { threw: { name: error?.name, message: error?.message } };
  }
}

/** An object that notes each way it is read, in order. */
function watched(target) {
  const seen = [];
  const note = (what, key) => seen.push(key === undefined ? what : `${what} ${String(key)}`);
  const proxy = new Proxy(target, {
    get(inner, key, receiver) { note("get", key); return Reflect.get(inner, key, receiver); },
    has(inner, key) { note("has", key); return Reflect.has(inner, key); },
    ownKeys(inner) { note("keys"); return Reflect.ownKeys(inner); },
    getOwnPropertyDescriptor(inner, key) { note("describe", key); return Reflect.getOwnPropertyDescriptor(inner, key); },
    getPrototypeOf(inner) { note("prototype"); return Reflect.getPrototypeOf(inner); },
    set(inner, key, value, receiver) { note("set", key); return Reflect.set(inner, key, value, receiver); },
    defineProperty(inner, key, descriptor) { note("define", key); return Reflect.defineProperty(inner, key, descriptor); },
    deleteProperty(inner, key) { note("delete", key); return Reflect.deleteProperty(inner, key); },
  });
  return { proxy, seen };
}

/** How an object is made: what it inherits from, whether it can still change, and how each of its fields is held. */
function madeOf(value) {
  const prototype = Object.getPrototypeOf(value);
  const held = new Set(Object.values(Object.getOwnPropertyDescriptors(value)).filter((descriptor) => "value" in descriptor).map((descriptor) => `${descriptor.writable ? "w" : "-"}${descriptor.enumerable ? "e" : "-"}${descriptor.configurable ? "c" : "-"}`));
  return {
    inherits: prototype === Object.prototype ? "Object" : prototype === Array.prototype ? "Array" : prototype === null ? "nothing" : "other",
    frozen: Object.isFrozen(value),
    sealed: Object.isSealed(value),
    extensible: Object.isExtensible(value),
    fieldsHeld: [...held].sort(),
    symbols: Object.getOwnPropertySymbols(value).length,
  };
}

const shapeOf = (fn) => ({ type: typeof fn, name: fn.name, parameters: fn.length });

export const scenarios = [
  // ---- bounded.ts ----
  {
    name: "a word from the set passes, any other becomes the fallback, and no word stays no word",
    run: ({ bounded }) => {
      const colour = bounded.brandedEnumOf(["red", "green", "blue"], "other");
      return ["red", "green", "blue", "Red", "RED", " red", "red ", "", "other", "purple", "re", "redgreen", undefined].map((word) => [word, colour(word)]);
    },
  },
  {
    name: "a set may be empty, hold one word, repeat a word, hold the empty word or hold its own fallback",
    run: ({ bounded }) => {
      const none = bounded.brandedEnumOf([], "none");
      const one = bounded.brandedEnumOf(["only"], "else");
      const twice = bounded.brandedEnumOf(["a", "a", "b"], "z");
      const blank = bounded.brandedEnumOf(["", "x"], "unset");
      const own = bounded.brandedEnumOf(["ok", "other"], "other");
      const emptyFallback = bounded.brandedEnumOf(["ok"], "");
      return {
        none: ["", "none", "x", undefined].map((word) => none(word)),
        one: ["only", "else", "other", undefined].map((word) => one(word)),
        twice: ["a", "b", "c", undefined].map((word) => twice(word)),
        blank: ["", "x", " ", undefined].map((word) => blank(word)),
        own: ["ok", "other", "more", undefined].map((word) => own(word)),
        emptyFallback: ["ok", "no", "", undefined].map((word) => emptyFallback(word)),
      };
    },
  },
  {
    name: "the set is copied when the filter is made: changing the list afterwards changes nothing, and each filter keeps its own set",
    run: ({ bounded }) => {
      const list = ["a", "b"];
      const first = bounded.brandedEnumOf(list, "first-other");
      const before = ["a", "b", "c"].map((word) => first(word));
      list.push("c");
      list[0] = "changed";
      const after = ["a", "b", "c", "changed"].map((word) => first(word));
      const second = bounded.brandedEnumOf(list, "second-other");
      return {
        before,
        after,
        second: ["a", "b", "c", "changed"].map((word) => second(word)),
        firstAgain: ["a", "b", "c", "changed"].map((word) => first(word)),
        differentFilters: first !== second,
        filter: shapeOf(first),
      };
    },
  },
  {
    name: "a value that is not a string is never matched to a word: it becomes the fallback, whatever it would read as",
    run: ({ bounded }) => {
      const words = bounded.brandedEnumOf(["1", "true", "null", "a", "NaN", "[object Object]", "undefined"], "other");
      return [null, 1, 0, true, false, Number.NaN, ["a"], [], {}, 1n, new String("a")].map((value) => words(value));
    },
  },
  {
    name: "the fallback is given back as it was given, whatever it is",
    run: ({ bounded }) => {
      const nothing = bounded.brandedEnumOf(["a"], undefined);
      const number = bounded.brandedEnumOf(["a"], 7);
      const object = { marker: true };
      const same = bounded.brandedEnumOf(["a"], object);
      return {
        nothing: [nothing("a"), nothing("b"), nothing(undefined)],
        number: [number("a"), number("b"), number(undefined)],
        sameObject: same("b") === object,
        missing: bounded.brandedEnumOf(["a"])("b"),
      };
    },
  },
  {
    name: "the set is built from whatever can be walked: a string gives its letters, nothing gives an empty set, a number is refused",
    run: ({ bounded }) => {
      const letters = bounded.brandedEnumOf("abc", "other");
      const fromSet = bounded.brandedEnumOf(new Set(["x", "y"]), "other");
      const fromNothing = bounded.brandedEnumOf(undefined, "other");
      const fromNull = bounded.brandedEnumOf(null, "other");
      return {
        letters: ["a", "b", "c", "abc", "d"].map((word) => letters(word)),
        fromSet: ["x", "y", "z"].map((word) => fromSet(word)),
        fromNothing: ["x", "", undefined].map((word) => fromNothing(word)),
        fromNull: ["x", "", undefined].map((word) => fromNull(word)),
        fromNumber: attempt(() => bounded.brandedEnumOf(5, "other")),
        fromObject: attempt(() => bounded.brandedEnumOf({ a: 1 }, "other")),
      };
    },
  },
  {
    name: "brandLiteralEnum gives back exactly what it was given",
    run: ({ bounded }) => {
      const object = { a: 1 };
      return {
        words: ["refused", "", "Other", "with space", "\u00e9"].map((word) => bounded.brandLiteralEnum(word)),
        others: [undefined, null, 0, false, Number.NaN].map((value) => bounded.brandLiteralEnum(value)),
        sameObject: bounded.brandLiteralEnum(object) === object,
        noArgument: bounded.brandLiteralEnum(),
        onlyTheFirst: bounded.brandLiteralEnum("first", "second"),
      };
    },
  },
  {
    name: "an id passes when it is 1 to 128 characters long: nothing, one, the limit, and past it",
    run: ({ bounded }) => [0, 1, 2, 64, 65, 127, 128, 129, 130, 256, 1000].map((length) => {
      const id = "x".repeat(length);
      const out = bounded.brandedId(id);
      return { length, passed: out === id, out: out === id ? "same" : out };
    }),
  },
  {
    name: "an id is made of letters, digits and . _ : | - only: every character from 0 to 127 tried alone, and in the middle of an id",
    run: ({ bounded }) => {
      const alone = ASCII.filter((ch) => bounded.brandedId(ch) === ch);
      const inside = ASCII.filter((ch) => bounded.brandedId(`a${ch}b`) === `a${ch}b`);
      return {
        alone: alone.join(""),
        aloneCount: alone.length,
        refusedGiveNothing: ASCII.filter((ch) => !alone.includes(ch)).every((ch) => bounded.brandedId(ch) === undefined),
        inside: inside.join(""),
        beyond: BEYOND.map((ch) => [hex(ch), bounded.brandedId(ch) === ch, bounded.brandedId(`a${ch}b`) === `a${ch}b`]),
      };
    },
  },
  {
    name: "ids as they really look, and near misses: a path, an address, a space or a line end is no id",
    run: ({ bounded }) => [
      "srv_01HZX", "mcp:github|work", "3f2a9c1e-7b1d-4c55-9f0a-0b6f3d2e1a00", "user-123.server_4", "A", "z", "9",
      ...TEXTS,
      undefined,
    ].map((id) => [id, bounded.brandedId(id)]),
  },
  {
    name: "asking twice for the same id answers the same, passed or refused",
    run: ({ bounded }) => ["abc", "abc", "a b", "a b", "abc", undefined, undefined, "abc"].map((id) => bounded.brandedId(id)),
  },
  {
    name: "an id that is not a string is judged by what it reads as, and given back as it is",
    run: ({ bounded }) => {
      const reads = { toString: () => "reads-fine" };
      const readsBadly = { toString: () => "reads badly" };
      const list = ["ab"];
      return {
        values: [null, 0, 123, -1, 1.5, 1e21, Number.NaN, Number.POSITIVE_INFINITY, true, false, 10n, {}, [], ["a", "b"]].map((value) => bounded.brandedId(value)),
        sameList: bounded.brandedId(list) === list,
        sameObject: bounded.brandedId(reads) === reads,
        refusedObject: bounded.brandedId(readsBadly),
        symbol: attempt(() => bounded.brandedId(Symbol("id"))),
        noArgument: bounded.brandedId(),
      };
    },
  },
  {
    name: "the errno names, in their order, and the word for any other",
    run: ({ bounded }) => ({
      names: bounded.SAND_ERRNO_TAGS,
      count: bounded.SAND_ERRNO_TAGS.length,
      noRepeats: new Set(bounded.SAND_ERRNO_TAGS).size === bounded.SAND_ERRNO_TAGS.length,
      other: bounded.SAND_ERRNO_FALLBACK,
      otherIsListed: bounded.SAND_ERRNO_TAGS.includes(bounded.SAND_ERRNO_FALLBACK),
      madeOf: madeOf(bounded.SAND_ERRNO_TAGS),
    }),
  },
  {
    name: "every errno name passes the errno filter as it is",
    run: ({ bounded }) => bounded.SAND_ERRNO_TAGS.map((name) => [name, bounded.brandedErrno(name)]),
  },
  {
    name: "any other errno becomes E_OTHER: small letters, a name with spaces, a name not listed, an empty one; none stays none",
    run: ({ bounded }) => [
      ...bounded.SAND_ERRNO_TAGS.map((name) => name.toLowerCase()),
      ...bounded.SAND_ERRNO_TAGS.map((name) => ` ${name}`),
      "E_OTHER", "EEXIST", "ENOTDIR", "EISDIR", "ENOTEMPTY", "EINVAL", "ENOMEM", "EAGAIN", "ECANCELED", "ERR_SOCKET_CLOSED", "UND_ERR_SOCKET", "SQLITE_BUSY", "ABORT_ERR", "", "E", "ECONNRESET\n", "ECONNRESETX", "-32", "econnreset",
    ].map((name) => [name, bounded.brandedErrno(name)]).concat([[undefined, bounded.brandedErrno(undefined)], ["no argument", bounded.brandedErrno()]]),
  },
  {
    name: "a name added to the errno list afterwards is still any other to the errno filter",
    run: ({ bounded }) => {
      const before = bounded.brandedErrno("ELATER");
      bounded.SAND_ERRNO_TAGS.push("ELATER");
      try {
        return { before, after: bounded.brandedErrno("ELATER"), listed: bounded.SAND_ERRNO_TAGS.includes("ELATER"), filter: shapeOf(bounded.brandedErrno) };
      } finally {
        bounded.SAND_ERRNO_TAGS.pop();
      }
    },
  },
  {
    name: "each function's own name and number of parameters",
    run: ({ bounded, registry }) => ({
      brandedEnumOf: shapeOf(bounded.brandedEnumOf),
      brandLiteralEnum: shapeOf(bounded.brandLiteralEnum),
      brandedId: shapeOf(bounded.brandedId),
      brandedErrno: shapeOf(bounded.brandedErrno),
      aFilter: shapeOf(bounded.brandedEnumOf(["a"], "b")),
      isRegisteredCode: shapeOf(registry.isRegisteredCode),
      sandErrorWireCode: shapeOf(registry.sandErrorWireCode),
      sandErrorTags: shapeOf(registry.sandErrorTags),
    }),
  },

  // ---- registry.ts: the table ----
  {
    name: "every failure in the table, in the table's order: its code, name, domain, whether a retry can help, its summary, what it may carry and where it is raised",
    run: ({ registry }) => Object.entries(registry.SAND_ERROR_DEFINITIONS).map(([code, definition]) => ({ code, ...definition })),
  },
  {
    name: "the table as it is held: an ordinary object by code, each entry its own object with the same six fields in the same order and a list of its own",
    run: ({ registry }) => {
      const table = registry.SAND_ERROR_DEFINITIONS;
      const entries = Object.values(table);
      const fieldOrders = new Set(entries.map((definition) => Object.keys(definition).join(",")));
      return {
        noEntryHeldTwice: new Set(entries).size === entries.length,
        noPayloadListHeldTwice: new Set(entries.map((definition) => definition.payload)).size === entries.length,
        madeOf: madeOf(table),
        entriesMadeOf: [...new Set(entries.map((definition) => JSON.stringify(madeOf(definition))))],
        payloadsMadeOf: [...new Set(entries.map((definition) => JSON.stringify(madeOf(definition.payload))))],
        fieldOrders: [...fieldOrders],
        kinds: [...new Set(entries.map((definition) => Object.values(definition).map((value) => (Array.isArray(value) ? "array" : typeof value)).join(",")))],
      };
    },
  },
  {
    name: "the table counted: how many failures, their codes and names (none twice), the domains in order with their count, retries, and every field a failure may carry",
    run: ({ registry }) => {
      const entries = Object.entries(registry.SAND_ERROR_DEFINITIONS);
      const names = entries.map(([, definition]) => definition.name);
      const domains = {};
      for (const [code, definition] of entries) (domains[definition.domain] ??= []).push(code);
      const fields = {};
      for (const [code, definition] of entries) for (const field of definition.payload) (fields[field] ??= []).push(code);
      return {
        count: entries.length,
        codes: entries.map(([code]) => code),
        codesAllShaped: entries.every(([code]) => /^SAND-E\d{4}$/.test(code)),
        codesAscending: entries.every(([code], at) => at === 0 || entries[at - 1][0] < code),
        names,
        namesTwice: names.filter((name, at) => names.indexOf(name) !== at),
        domains,
        retryable: entries.filter(([, definition]) => definition.retryable).map(([code]) => code),
        notRetryable: entries.filter(([, definition]) => !definition.retryable).map(([code]) => code),
        fields,
        payloadRepeats: entries.filter(([, definition]) => new Set(definition.payload).size !== definition.payload.length).map(([code]) => code),
        longestSummary: Math.max(...entries.map(([, definition]) => definition.summary.length)),
        summaryCharacters: entries.reduce((sum, [, definition]) => sum + definition.summary.length, 0),
        seededFromCharacters: entries.reduce((sum, [, definition]) => sum + definition.seededFrom.length, 0),
      };
    },
  },
  {
    name: "the code for a failure that is not in the table",
    run: ({ registry }) => ({
      code: registry.UNREGISTERED_CODE,
      inTheTable: Object.hasOwn(registry.SAND_ERROR_DEFINITIONS, registry.UNREGISTERED_CODE),
      first: Object.keys(registry.SAND_ERROR_DEFINITIONS)[0] === registry.UNREGISTERED_CODE,
      definition: registry.SAND_ERROR_DEFINITIONS[registry.UNREGISTERED_CODE],
    }),
  },

  // ---- registry.ts: the makers ----
  {
    name: "there is one maker per failure, named after it, in the table's order, held in an ordinary object",
    run: ({ registry }) => {
      const makers = registry.SandError;
      const names = Object.values(registry.SAND_ERROR_DEFINITIONS).map((definition) => definition.name);
      return {
        names: Object.keys(makers),
        sameAsTheTable: JSON.stringify(Object.keys(makers)) === JSON.stringify(names),
        madeOf: madeOf(makers),
        makers: Object.entries(makers).map(([name, make]) => [name, shapeOf(make)]),
        allDifferent: new Set(Object.values(makers)).size === names.length,
      };
    },
  },
  {
    name: "every maker called with nothing gives its failure's code alone",
    run: ({ registry }) => {
      const all = Object.entries(registry.SAND_ERROR_DEFINITIONS).map(([code, definition]) => ({ code, name: definition.name, made: registry.SandError[definition.name]() }));
      return {
        made: all.map(({ name, made }) => [name, made]),
        eachItsOwnCode: all.every(({ code, made }) => made.code === code && Object.keys(made).join(",") === "code"),
        madeOf: [...new Set(all.map(({ made }) => JSON.stringify(madeOf(made))))],
      };
    },
  },
  {
    name: "every maker called with everything its failure may carry gives the code first, then each field as given",
    run: ({ registry }) => Object.values(registry.SAND_ERROR_DEFINITIONS).map((definition) => {
      const payload = sampleFor(definition);
      const made = registry.SandError[definition.name](payload);
      return { name: definition.name, made, payloadUntouched: JSON.stringify(payload) === JSON.stringify(sampleFor(definition)), notThePayload: made !== payload };
    }),
  },
  {
    name: "every maker takes any field, declared or not, and keeps it as given; nothing is checked when a failure is made",
    run: ({ registry }) => {
      const nested = { deep: [1, 2] };
      const given = { notDeclared: "kept", message: "connect ECONNREFUSED 127.0.0.1:443", nested, missing: undefined, nothing: null };
      const all = Object.entries(registry.SAND_ERROR_DEFINITIONS).map(([code, definition]) => ({ code, name: definition.name, made: registry.SandError[definition.name](given) }));
      return {
        one: all[1].made,
        keys: all.map(({ name, made }) => [name, made.code, Object.keys(made).join(",")]),
        everyFieldAsGiven: all.every(({ code, made }) => made.code === code && Object.keys(given).every((field) => field in made && made[field] === given[field])),
        givenUntouched: Object.keys(given).join(","),
      };
    },
  },
  {
    name: "a maker's fields come in the order given, numbered keys first; a field named code replaces the failure's own code",
    run: ({ registry }) => {
      const { SandError } = registry;
      const cases = {
        twoFields: SandError.streamReset({ connectCode: "Unavailable", errno: "ECONNRESET" }),
        twoFieldsTurned: SandError.streamReset({ errno: "ECONNRESET", connectCode: "Unavailable" }),
        asTheTurnRuntimeDoes: SandError.streamReset({ connectCode: undefined, errno: undefined }),
        deferred: SandError.backendCapacityDeferred({ connectCode: "ResourceExhausted", retryAfterMs: 30_000 }),
        numberedKeys: SandError.gatewayRefused({ b: 1, 2: "two", a: 2, 1: "one" }),
        ownCode: SandError.gatewayRefused({ errno: "EPIPE", code: "SAND-E0102" }),
        ownCodeUnknown: SandError.gatewayRefused({ code: "ECONNREFUSED" }),
        ownCodeUndefined: SandError.gatewayRefused({ code: undefined, errno: "EPIPE" }),
        ownCodeNumber: SandError.gatewayRefused({ code: 404 }),
      };
      return Object.fromEntries(Object.entries(cases).map(([name, made]) => [name, { made, keys: Object.keys(made) }]));
    },
  },
  {
    name: "a maker given something that is not a plain payload: nothing, a text, a list, a number, an error, a class instance",
    run: ({ registry }) => {
      const make = registry.SandError.backendUnreachable;
      class Carrier {
        constructor() { this.errno = "EPIPE"; }
        get computed() { return "from the class"; }
        method() { return 1; }
      }
      const error = Object.assign(new Error("boom"), { errno: "EIO" });
      const cases = {
        undefined: make(undefined),
        null: make(null),
        emptyObject: make({}),
        text: make("ab"),
        emptyText: make(""),
        list: make(["x", "y"]),
        number: make(5),
        boolean: make(true),
        aFunction: make(() => 1),
        error: make(error),
        instance: make(new Carrier()),
        twoArguments: make({ errno: "EPIPE" }, { errno: "EIO", extra: 1 }),
      };
      return {
        made: Object.fromEntries(Object.entries(cases).map(([name, made]) => [name, { made, keys: Object.keys(made) }])),
        madeOf: [...new Set(Object.values(cases).map((made) => JSON.stringify(madeOf(made))))],
      };
    },
  },
  {
    name: "a maker copies the payload's own listed fields at that moment: computed ones by their value, symbols too; hidden and inherited ones are left",
    run: ({ registry }) => {
      const mark = Symbol("mark");
      let computedReads = 0;
      const payload = Object.create({ inherited: "from the parent" }, {
        shown: { value: "shown", enumerable: true },
        hidden: { value: "hidden", enumerable: false },
        computed: { get() { computedReads += 1; return `read ${computedReads}`; }, enumerable: true },
        [mark]: { value: "by symbol", enumerable: true },
      });
      const made = registry.SandError.gatewayTimeout(payload);
      const computedHeld = Object.getOwnPropertyDescriptor(made, "computed");
      const withProto = registry.SandError.gatewayTimeout(JSON.parse('{"__proto__": {"injected": true}, "errno": "EPIPE"}'));
      return {
        made,
        keys: Object.keys(made),
        symbol: made[mark],
        inherited: made.inherited,
        hidden: made.hidden,
        computedReads,
        computedIsNowAValue: "value" in computedHeld,
        madeOf: madeOf(made),
        protoField: { keys: Object.keys(withProto), ownField: Object.hasOwn(withProto, "__proto__"), injected: withProto.injected, madeOf: madeOf(withProto) },
      };
    },
  },
  {
    name: "each call of a maker gives a new object that can be changed without changing the next one, the payload or the table",
    run: ({ registry }) => {
      const make = registry.SandError.backendHttpStatus;
      const payload = { httpStatus: 502 };
      const first = make(payload);
      const second = make(payload);
      first.httpStatus = 500;
      first.code = "changed";
      first.added = true;
      delete second.httpStatus;
      const third = make(payload);
      const bareOne = make();
      const bareTwo = make();
      bareOne.code = "changed";
      return {
        first,
        second,
        third,
        payload,
        allDifferent: first !== second && second !== third && first !== third && first !== payload && bareOne !== bareTwo,
        bareTwo,
        bareAgain: make(),
        tableCode: Object.entries(registry.SAND_ERROR_DEFINITIONS).find(([, definition]) => definition.name === "backendHttpStatus")[0],
      };
    },
  },
  {
    name: "the order a maker reads its payload in: its fields listed once, then each looked at and read in turn",
    run: ({ registry }) => {
      const { proxy, seen } = watched({ errno: "EPIPE", connectCode: "Unavailable", code: "own" });
      const made = registry.SandError.streamReset(proxy);
      return { made, seen };
    },
  },

  // ---- registry.ts: is a code registered, and the code a failure goes out under ----
  {
    name: "every code of the table is registered, and a failure carrying it goes out under it",
    run: ({ registry }) => Object.keys(registry.SAND_ERROR_DEFINITIONS).map((code) => [code, registry.isRegisteredCode(code), registry.sandErrorWireCode({ code }), registry.sandErrorWireCode({ code, other: "ignored" }) === code]),
  },
  {
    name: "what is not a registered code: a near miss, a failure's name, a word every object answers to, or anything that is not a string",
    run: ({ registry }) => {
      const texts = [
        "SAND-E0000", "SAND-E0002", "SAND-E0100", "SAND-E0114", "SAND-E0220", "SAND-E0415", "SAND-E0513", "SAND-E0611", "SAND-E0708", "SAND-E0719", "SAND-E0725", "SAND-E9999",
        "sand-e0001", "Sand-E0001", "SAND-E001", "SAND-E00001", "SAND-E0001 ", " SAND-E0001", "SAND-E0001\n", "SAND_E0001", "SANDE0001", "E0001", "0001", "SAND-E", "SAND-",
        "unregistered", "gatewayRefused", "transport", "ECONNRESET", "E_OTHER", "",
        "constructor", "toString", "hasOwnProperty", "__proto__", "valueOf", "prototype", "length", "name",
      ];
      const others = {
        undefined,
        null: null,
        one: 1,
        oneHundredAndOne: 101,
        zero: 0,
        notANumber: Number.NaN,
        true: true,
        false: false,
        bigNumber: 1n,
        emptyObject: {},
        emptyList: [],
        listOfACode: ["SAND-E0001"],
        boxedCode: new String("SAND-E0001"),
        objectHoldingACode: { code: "SAND-E0001" },
        objectReadingAsACode: { toString: () => "SAND-E0001" },
        functionGivingACode: () => "SAND-E0001",
        symbol: Symbol("SAND-E0001"),
      };
      return {
        texts: texts.map((text) => [text, registry.isRegisteredCode(text)]),
        others: Object.fromEntries(Object.entries(others).map(([name, value]) => [name, registry.isRegisteredCode(value)])),
        noArgument: registry.isRegisteredCode(),
      };
    },
  },
  {
    name: "a failure whose code is not registered, or that has none, goes out under the unregistered code",
    run: ({ registry }) => {
      class Coded { get code() { return "SAND-E0107"; } }
      const inherits = Object.create({ code: "SAND-E0102" });
      const cases = {
        noCode: {},
        codeUndefined: { code: undefined },
        codeNull: { code: null },
        unknownCode: { code: "SAND-E9999" },
        errnoAsCode: { code: "ECONNRESET" },
        nameAsCode: { code: "gatewayRefused" },
        smallLetters: { code: "sand-e0101" },
        builtInWord: { code: "constructor" },
        protoWord: { code: "__proto__" },
        numberCode: { code: 101 },
        listCode: { code: ["SAND-E0101"] },
        boxedCode: { code: new String("SAND-E0101") },
        objectCode: { code: { toString: () => "SAND-E0101" } },
        theUnregisteredCodeItself: { code: "SAND-E0001" },
        registered: { code: "SAND-E0101" },
        registeredWithMore: { code: "SAND-E0512", errno: "EIO", message: "words" },
        nodeError: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
        errorWithARegisteredCode: Object.assign(new Error("turn failed"), { code: "SAND-E0406" }),
        codeFromItsClass: new Coded(),
        codeInherited: inherits,
        aList: ["SAND-E0101"],
        aListWithACode: Object.assign(["x"], { code: "SAND-E0103" }),
        aFunctionWithACode: Object.assign(() => 1, { code: "SAND-E0104" }),
      };
      return Object.fromEntries(Object.entries(cases).map(([name, error]) => [name, registry.sandErrorWireCode(error)]));
    },
  },
  {
    name: "asked for the code of something that is not an object: a text, a number or a truth have no code; nothing at all is refused",
    run: ({ registry }) => ({
      text: attempt(() => registry.sandErrorWireCode("SAND-E0101")),
      emptyText: attempt(() => registry.sandErrorWireCode("")),
      number: attempt(() => registry.sandErrorWireCode(101)),
      boolean: attempt(() => registry.sandErrorWireCode(true)),
      symbol: attempt(() => registry.sandErrorWireCode(Symbol("x"))),
      null: attempt(() => registry.sandErrorWireCode(null)),
      undefined: attempt(() => registry.sandErrorWireCode(undefined)),
      noArgument: attempt(() => registry.sandErrorWireCode()),
    }),
  },
  {
    name: "how often a failure's code is read for its wire code: once when it is not registered, twice when it is, and the second reading is what goes out",
    run: ({ registry }) => {
      const counting = (codes) => {
        let reads = 0;
        return { error: { get code() { reads += 1; return codes[Math.min(reads, codes.length) - 1]; } }, reads: () => reads };
      };
      const registered = counting(["SAND-E0101"]);
      const unknown = counting(["nope"]);
      const turnsUnknown = counting(["SAND-E0101", "nope"]);
      const turnsRegistered = counting(["nope", "SAND-E0101"]);
      const changes = counting(["SAND-E0101", "SAND-E0102", "SAND-E0103"]);
      const outcomes = {};
      for (const [name, one] of Object.entries({ registered, unknown, turnsUnknown, turnsRegistered, changes })) {
        const out = registry.sandErrorWireCode(one.error);
        outcomes[name] = { out, reads: one.reads() };
      }
      const { proxy, seen } = watched({ code: "SAND-E0101", errno: "EPIPE" });
      const { proxy: unknownProxy, seen: unknownSeen } = watched({ code: "nope", errno: "EPIPE" });
      return { outcomes, readsOfARegistered: [registry.sandErrorWireCode(proxy), seen], readsOfAnUnknown: [registry.sandErrorWireCode(unknownProxy), unknownSeen] };
    },
  },

  // ---- registry.ts: the labels a failure is reported under ----
  {
    name: "every failure's labels: its code, domain and whether a retry can help; bare, with all it may carry, and with more than it may carry",
    run: ({ registry }) => Object.entries(registry.SAND_ERROR_DEFINITIONS).map(([code, definition]) => {
      const payload = sampleFor(definition);
      const bare = registry.sandErrorTags({ code });
      const full = registry.sandErrorTags({ code, ...payload });
      const made = registry.sandErrorTags(registry.SandError[definition.name](payload));
      const more = registry.sandErrorTags({ code, ...payload, ...SAMPLE, message: "connect ECONNREFUSED 127.0.0.1:443", userId: "u_1", error_code: "forged", errorCode: "forged", error_domain: "forged", errorDomain: "forged" });
      return { code, bare, full, madeSameAsFull: JSON.stringify(made) === JSON.stringify(full), moreSameAsFull: JSON.stringify(more) === JSON.stringify(full), labels: Object.keys(more).join(",") };
    }),
  },
  {
    name: "a label's name is the field's name with each capital turned into an underscore and its small letter: every field a failure may carry",
    run: ({ registry }) => {
      const names = {};
      for (const [code, definition] of Object.entries(registry.SAND_ERROR_DEFINITIONS)) {
        for (const field of definition.payload) {
          const tags = registry.sandErrorTags({ code, [field]: "v" });
          const added = Object.keys(tags).filter((key) => !["error_code", "error_domain", "error_retryable"].includes(key));
          (names[field] ??= new Set()).add(added.join(","));
        }
      }
      return Object.fromEntries(Object.entries(names).map(([field, seen]) => [field, [...seen]]));
    },
  },
  {
    name: "a failure whose code is not registered is reported as unregistered, and nothing it carries goes with it",
    run: ({ registry }) => {
      const cases = {
        noCode: { errno: "ECONNRESET", httpStatus: 500 },
        empty: {},
        unknownCode: { code: "SAND-E9999", errno: "ECONNRESET" },
        errnoAsCode: { code: "ECONNRESET", errno: "ECONNRESET" },
        nameAsCode: { code: "gatewayRefused", errno: "ECONNRESET" },
        numberCode: { code: 101, errno: "ECONNRESET" },
        boxedCode: { code: new String("SAND-E0101"), errno: "ECONNRESET" },
        builtInWord: { code: "toString", errno: "ECONNRESET" },
        theUnregisteredCodeItself: { code: "SAND-E0001", errno: "ECONNRESET", httpStatus: 500, reason: "x" },
        nodeError: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED", errno: -61, syscall: "connect" }),
        text: "SAND-E0101",
        number: 101,
        boolean: false,
        aList: ["SAND-E0101"],
      };
      return Object.fromEntries(Object.entries(cases).map(([name, error]) => [name, registry.sandErrorTags(error)]));
    },
  },
  {
    name: "asked for the labels of nothing at all is refused",
    run: ({ registry }) => ({
      null: attempt(() => registry.sandErrorTags(null)),
      undefined: attempt(() => registry.sandErrorTags(undefined)),
      noArgument: attempt(() => registry.sandErrorTags()),
    }),
  },
  {
    name: "a number goes out as its text when it is finite; not a number and the infinities are dropped",
    run: ({ registry }) => [
      0, -0, 1, -1, 200, 404, 503, 599, 1.5, -2.25, 0.1 + 0.2, 1e21, 1e-7, 123456789012345680000, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON, 0x1f, 1_000,
      Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
    ].map((value) => [String(value), registry.sandErrorTags({ code: "SAND-E0103", httpStatus: value }).http_status]),
  },
  {
    name: "a truth goes out as true or false",
    run: ({ registry }) => [true, false].map((value) => registry.sandErrorTags({ code: "SAND-E0403", connectCode: value, errno: !value })),
  },
  {
    name: "a text goes out as it is when it is 1 to 64 characters long: nothing, one, the limit, and past it",
    run: ({ registry }) => [0, 1, 2, 32, 63, 64, 65, 66, 128, 129, 1000].map((length) => {
      const text = "x".repeat(length);
      const out = registry.sandErrorTags({ code: "SAND-E0101", errno: text }).errno;
      return { length, passed: out === text, out: out === text ? "same" : out };
    }),
  },
  {
    name: "a text goes out only when made of letters, digits and . _ | : - : every character from 0 to 127 tried alone, and in the middle of a text",
    run: ({ registry }) => {
      const out = (text) => registry.sandErrorTags({ code: "SAND-E0203", reason: text }).reason;
      const alone = ASCII.filter((ch) => out(ch) === ch);
      const inside = ASCII.filter((ch) => out(`a${ch}b`) === `a${ch}b`);
      return {
        alone: alone.join(""),
        aloneCount: alone.length,
        refusedAreDropped: ASCII.filter((ch) => !alone.includes(ch)).every((ch) => !("reason" in registry.sandErrorTags({ code: "SAND-E0203", reason: ch }))),
        inside: inside.join(""),
        beyond: BEYOND.map((ch) => [hex(ch), out(ch) === ch, out(`a${ch}b`) === `a${ch}b`]),
      };
    },
  },
  {
    name: "texts as failures really carry them, and near misses: a message, a path or an address is dropped whole, never cut",
    run: ({ registry }) => TEXTS.map((text) => {
      const tags = registry.sandErrorTags({ code: "SAND-E0605", process: text, reason: "crashed" });
      return [text, "process" in tags ? tags.process : { dropped: true }, Object.keys(tags).length];
    }),
  },
  {
    name: "anything that is not a finite number, a truth or a fitting text is dropped: nothing, null, objects, lists, big numbers, symbols, functions, dates, boxed values",
    run: ({ registry }) => {
      const values = {
        undefined,
        null: null,
        object: { errno: "ECONNRESET" },
        emptyObject: {},
        list: ["ECONNRESET"],
        emptyList: [],
        bigNumber: 10n,
        symbol: Symbol("ECONNRESET"),
        aFunction: () => "ECONNRESET",
        date: new Date(0),
        boxedText: new String("ECONNRESET"),
        boxedNumber: new Number(5),
        boxedTruth: new Boolean(true),
        error: new Error("ECONNRESET"),
        map: new Map([["a", 1]]),
        pattern: /ECONNRESET/,
      };
      return Object.fromEntries(Object.entries(values).map(([name, value]) => {
        const tags = registry.sandErrorTags({ code: "SAND-E0107", errno: value });
        return [name, "errno" in tags ? tags : Object.keys(tags).join(",")];
      }));
    },
  },
  {
    name: "a value that is an object is never asked for its text or its number",
    run: ({ registry }) => {
      let asked = 0;
      const value = { toString() { asked += 1; return "ok"; }, valueOf() { asked += 1; return 5; }, [Symbol.toPrimitive]() { asked += 1; return "ok"; } };
      const tags = registry.sandErrorTags({ code: "SAND-E0107", errno: value });
      const undeclared = registry.sandErrorTags({ code: "SAND-E0107", other: value });
      const unregistered = registry.sandErrorTags({ code: "nope", errno: value });
      return { tags, undeclared, unregistered, asked };
    },
  },
  {
    name: "a field goes out only if its failure may carry it: the same fields under failures that declare all, one or none of them",
    run: ({ registry }) => {
      const fields = { errno: "EIO", connectCode: "Internal", httpStatus: 500, tail: "torn", domError: "AbortError", signErrorClass: "other", retryAfterMs: 250, process: "GPU", reason: "killed" };
      return ["SAND-E0403", "SAND-E0101", "SAND-E0103", "SAND-E0108", "SAND-E0211", "SAND-E0408", "SAND-E0605", "SAND-E0722", "SAND-E0724", "SAND-E0001", "SAND-E0407"].map((code) => registry.sandErrorTags({ code, ...fields }));
    },
  },
  {
    name: "a declared field must be spelled as declared: another case, the label's own spelling, or spaces around it are not it",
    run: ({ registry }) => [
      { httpStatus: 500 }, { http_status: 500 }, { HttpStatus: 500 }, { httpstatus: 500 }, { HTTPSTATUS: 500 }, { " httpStatus": 500 }, { "httpStatus ": 500 }, { status: 500 }, { payload: { httpStatus: 500 } }, { httpStatus: 500, http_status: 501 }, { http_status: 501, httpStatus: 500 },
    ].map((fields) => {
      const tags = registry.sandErrorTags({ code: "SAND-E0103", ...fields });
      return [Object.keys(fields).join(","), tags.http_status, Object.keys(tags).join(",")];
    }),
  },
  {
    name: "labels come in the order the failure holds its fields, after the three of the code; an undefined or dropped field leaves no gap",
    run: ({ registry }) => {
      const cases = {
        declaredOrder: { code: "SAND-E0403", connectCode: "Unavailable", errno: "ECONNRESET" },
        turned: { code: "SAND-E0403", errno: "ECONNRESET", connectCode: "Unavailable" },
        codeLast: { errno: "ECONNRESET", connectCode: "Unavailable", code: "SAND-E0403" },
        codeBetween: { errno: "ECONNRESET", code: "SAND-E0403", connectCode: "Unavailable" },
        firstUndefined: { code: "SAND-E0403", connectCode: undefined, errno: "ECONNRESET" },
        secondUndefined: { code: "SAND-E0403", connectCode: "Unavailable", errno: undefined },
        bothUndefined: { code: "SAND-E0403", connectCode: undefined, errno: undefined },
        firstDropped: { code: "SAND-E0403", connectCode: "not a code", errno: "ECONNRESET" },
        othersBetween: { message: "m", errno: "ECONNRESET", code: "SAND-E0403", stack: "s", connectCode: "Unavailable", cause: {} },
        signTurned: { code: "SAND-E0211", signErrorClass: "timeout", domError: "NotAllowedError" },
        tailTurned: { code: "SAND-E0722", errno: "ENOENT", tail: "missing" },
        deferredTurned: { retryAfterMs: 1500, connectCode: "ResourceExhausted", code: "SAND-E0408" },
      };
      return Object.fromEntries(Object.entries(cases).map(([name, error]) => [name, registry.sandErrorTags(error)]));
    },
  },
  {
    name: "only the failure's own listed fields are read: inherited, hidden and symbol-named ones are not, computed ones are",
    run: ({ registry }) => {
      const inherited = Object.assign(Object.create({ errno: "EPIPE", connectCode: "Unavailable" }), { code: "SAND-E0403" });
      const codeInherited = Object.assign(Object.create({ code: "SAND-E0403" }), { errno: "EPIPE" });
      const hidden = Object.defineProperty({ code: "SAND-E0403" }, "errno", { value: "EPIPE", enumerable: false });
      const hiddenCode = Object.defineProperty({ errno: "EPIPE" }, "code", { value: "SAND-E0403", enumerable: false });
      const bySymbol = { code: "SAND-E0403", [Symbol("errno")]: "EPIPE" };
      const computed = { code: "SAND-E0403", get errno() { return "EPIPE"; }, get connectCode() { return undefined; } };
      class Failure extends Error {
        constructor() { super("stream reset"); this.code = "SAND-E0403"; this.errno = "ECONNRESET"; }
        get connectCode() { return "Unavailable"; }
      }
      const cases = { inherited, codeInherited, hidden, hiddenCode, bySymbol, computed, anError: new Failure(), aListWithFields: Object.assign(["EPIPE"], { code: "SAND-E0403", errno: "EIO" }), aFunctionWithFields: Object.assign(() => 1, { code: "SAND-E0403", errno: "EIO" }) };
      return Object.fromEntries(Object.entries(cases).map(([name, error]) => [name, registry.sandErrorTags(error)]));
    },
  },
  {
    name: "the labels are a new ordinary object each time, which can be changed without changing the next ones, the failure or the table",
    run: ({ registry }) => {
      const error = { code: "SAND-E0103", httpStatus: 502 };
      const first = registry.sandErrorTags(error);
      const second = registry.sandErrorTags(error);
      const madeOfFirst = madeOf(first);
      first.error_domain = "changed";
      first.http_status = "0";
      delete first.error_code;
      const unknownOne = registry.sandErrorTags({ code: "nope" });
      const unknownTwo = registry.sandErrorTags({ code: "nope" });
      unknownOne.error_code = "changed";
      return {
        first,
        second,
        third: registry.sandErrorTags(error),
        error,
        different: first !== second && unknownOne !== unknownTwo && first !== error,
        madeOf: madeOfFirst,
        unknownTwo,
        unknownAgain: registry.sandErrorTags({ code: "nope" }),
        unknownMadeOf: madeOf(unknownTwo),
        allTexts: Object.values(second).every((value) => typeof value === "string"),
        tableDomain: registry.SAND_ERROR_DEFINITIONS["SAND-E0103"].domain,
      };
    },
  },
  {
    name: "the order a failure is read in for its labels: its code, then, only when registered, its code again twice and each of its fields in turn",
    run: ({ registry }) => {
      const registered = watched({ code: "SAND-E0403", errno: "EPIPE", other: 1, connectCode: "Unavailable" });
      const codeLast = watched({ errno: "EPIPE", code: "SAND-E0403" });
      const unknown = watched({ code: "nope", errno: "EPIPE" });
      const noCode = watched({ errno: "EPIPE" });
      const nothingDeclared = watched({ code: "SAND-E0407", errno: "EPIPE" });
      return {
        registered: [registry.sandErrorTags(registered.proxy), registered.seen],
        codeLast: [registry.sandErrorTags(codeLast.proxy), codeLast.seen],
        unknown: [registry.sandErrorTags(unknown.proxy), unknown.seen],
        noCode: [registry.sandErrorTags(noCode.proxy), noCode.seen],
        nothingDeclared: [registry.sandErrorTags(nothingDeclared.proxy), nothingDeclared.seen],
      };
    },
  },
  {
    name: "a failure whose code answers differently each time it is read: the labels follow the readings, and a code that stops being registered midway is refused",
    run: ({ registry }) => {
      const counting = (codes, fields = {}) => {
        let reads = 0;
        return { error: { get code() { reads += 1; return codes[Math.min(reads, codes.length) - 1]; }, ...fields }, reads: () => reads };
      };
      const cases = {
        steady: counting(["SAND-E0101"], { errno: "EPIPE" }),
        steadyUnknown: counting(["nope"], { errno: "EPIPE" }),
        unknownThenRegistered: counting(["nope", "SAND-E0101"], { errno: "EPIPE" }),
        registeredThenUnknown: counting(["SAND-E0101", "nope"], { errno: "EPIPE" }),
        secondIsAnother: counting(["SAND-E0101", "SAND-E0103", "SAND-E0103"], { errno: "EPIPE", httpStatus: 500 }),
        thirdIsAnother: counting(["SAND-E0101", "SAND-E0101", "SAND-E0103"], { errno: "EPIPE", httpStatus: 500 }),
        fourthIsAnother: counting(["SAND-E0101", "SAND-E0101", "SAND-E0101", "SAND-E0103"], { errno: "EPIPE", httpStatus: 500 }),
      };
      return Object.fromEntries(Object.entries(cases).map(([name, one]) => {
        const outcome = attempt(() => registry.sandErrorTags(one.error));
        return [name, { ...outcome, keys: outcome.gave ? Object.keys(outcome.gave) : undefined, reads: one.reads() }];
      }));
    },
  },
  {
    name: "the table is read when asked, the makers were made once: a failure added to the table later is registered and labelled, but has no maker",
    run: ({ registry }) => {
      const table = registry.SAND_ERROR_DEFINITIONS;
      const code = "SAND-E9001";
      const before = { registered: registry.isRegisteredCode(code), wire: registry.sandErrorWireCode({ code }), tags: registry.sandErrorTags({ code, extra: "x1" }) };
      table[code] = { name: "addedLater", domain: "later", retryable: true, summary: "Added by a scenario.", payload: ["extra", "code"], seededFrom: "the scenario" };
      try {
        const during = {
          registered: registry.isRegisteredCode(code),
          wire: registry.sandErrorWireCode({ code }),
          tags: registry.sandErrorTags({ code, extra: "x1" }),
          aDeclaredCodeIsStillNoLabel: registry.sandErrorTags({ extra: "x1", code }),
          hasMaker: "addedLater" in registry.SandError,
          makers: Object.keys(registry.SandError).length,
        };
        table[code].retryable = false;
        table[code].domain = "moved";
        table[code].payload.length = 0;
        const changed = registry.sandErrorTags({ code, extra: "x1" });
        table[code].retryable = "a text, not a truth";
        table[code].domain = 7;
        const oddKinds = registry.sandErrorTags({ code });
        return { before, during, changed, oddKinds, oddKindsAre: Object.values(oddKinds).map((value) => typeof value) };
      } finally {
        delete table[code];
      }
    },
  },
  {
    name: "a label's name for any field name, tried through a failure added to the table for the time of the scenario: only the capitals A to Z are turned, wherever they stand",
    run: ({ registry }) => {
      const table = registry.SAND_ERROR_DEFINITIONS;
      const code = "SAND-E9002";
      const fields = ["a", "A", "Z", "aB", "aBc", "ABc", "ABC", "x9Y", "URL", "httpURL", "a_B", "a__b", "endsInZ", "with space", "With Space", "dotted.Name", "dash-Name", "\u00c9lan", "\u00e0\u00c9", "\u0130stanbul", "\u01c5", "\uff21wide", "9Nine", "$Dollar", ""];
      table[code] = { name: "namedLater", domain: "later", retryable: false, summary: "Added by a scenario.", payload: fields, seededFrom: "the scenario" };
      try {
        return fields.map((field) => {
          const tags = registry.sandErrorTags({ code, [field]: 1 });
          return [field, Object.keys(tags).slice(3)];
        });
      } finally {
        delete table[code];
      }
    },
  },
  {
    name: "two fields whose labels have the same name, or a label named like one of the code's three: the later value takes the earlier one's place",
    run: ({ registry }) => {
      const table = registry.SAND_ERROR_DEFINITIONS;
      const code = "SAND-E9003";
      table[code] = { name: "clashLater", domain: "later", retryable: false, summary: "Added by a scenario.", payload: ["aB", "a_b", "error_code", "errorDomain", "error_retryable", "__proto__", "other"], seededFrom: "the scenario" };
      try {
        const cases = {
          sameName: { code, aB: 1, other: "between", a_b: 2 },
          sameNameTurned: { code, a_b: 2, other: "between", aB: 1 },
          sameNameSecondDropped: { code, aB: 1, a_b: null },
          overTheCode: { code, error_code: "forged", other: "x" },
          overTheDomain: { code, other: "x", errorDomain: "forged" },
          overRetryable: { code, error_retryable: true },
          overAllThree: { error_retryable: 1, errorDomain: 2, error_code: 3, code },
        };
        const protoField = registry.sandErrorTags(JSON.parse(`{"code":"${code}","__proto__":"text","other":"x"}`));
        const protoObject = registry.sandErrorTags(JSON.parse(`{"code":"${code}","__proto__":{"injected":true},"other":"x"}`));
        return {
          ...Object.fromEntries(Object.entries(cases).map(([name, error]) => [name, registry.sandErrorTags(error)])),
          protoField: { keys: Object.keys(protoField), ownField: Object.hasOwn(protoField, "__proto__"), madeOf: madeOf(protoField) },
          protoObject: { keys: Object.keys(protoObject), ownField: Object.hasOwn(protoObject, "__proto__"), injected: protoObject.injected, madeOf: madeOf(protoObject) },
        };
      } finally {
        delete table[code];
      }
    },
  },
  {
    name: "what a failure may carry is read from the table when asked: a field added to a failure's list goes out from then on, and stops when taken back",
    run: ({ registry }) => {
      const definition = registry.SAND_ERROR_DEFINITIONS["SAND-E0407"];
      const error = { code: "SAND-E0407", errno: "EIO", lateField: 3 };
      const before = registry.sandErrorTags(error);
      definition.payload.push("lateField");
      try {
        const during = registry.sandErrorTags(error);
        return { before, during, keys: Object.keys(during) };
      } finally {
        definition.payload.pop();
      }
    },
  },
  {
    name: "after the scenarios that change the table, it is as it was",
    run: ({ registry }) => ({
      count: Object.keys(registry.SAND_ERROR_DEFINITIONS).length,
      added: ["SAND-E9001", "SAND-E9002", "SAND-E9003"].map((code) => registry.isRegisteredCode(code)),
      last: Object.keys(registry.SAND_ERROR_DEFINITIONS).at(-1),
      unclassified: registry.SAND_ERROR_DEFINITIONS["SAND-E0407"],
      tags: registry.sandErrorTags({ code: "SAND-E0407", errno: "EIO", lateField: 3 }),
    }),
  },

  // ---- both files, the way the engine's callers chain them ----
  {
    name: "from a raw errno to labels, as a delivery failure is reported: the errno filtered, the failure made, its labels read",
    run: ({ bounded, registry }) => ["ECONNRESET", "ENOTFOUND", "EPIPE", "EEXIST", "ERR_SOCKET_CLOSED", "connect ECONNREFUSED 127.0.0.1:443", "", undefined].map((raw) => {
      const made = registry.SandError.backendUnreachable({ errno: bounded.brandedErrno(raw) });
      return { raw, made, labels: registry.sandErrorTags(made), wire: registry.sandErrorWireCode(made) };
    }),
  },
  {
    name: "a turn's failure as the turn runtime makes it: a connect code and an errno that may each be missing, and a retry delay in milliseconds",
    run: ({ bounded, registry }) => {
      const connectCode = bounded.brandedEnumOf(["Canceled", "Unknown", "DeadlineExceeded", "ResourceExhausted", "Unavailable", "Internal"], "Other");
      const { SandError } = registry;
      const made = [
        SandError.backendCapacityDeferred({ connectCode: connectCode("ResourceExhausted"), retryAfterMs: 30_000 }),
        SandError.backendCapacityDeferred({ connectCode: connectCode(undefined), retryAfterMs: 0 }),
        SandError.backendCapacityDeferred({ connectCode: connectCode("Teapot"), retryAfterMs: 1.5 }),
        SandError.providerOverloaded({ connectCode: connectCode("Unavailable") }),
        SandError.firstTokenStall(),
        SandError.contextWindowOverflow(),
        SandError.conversationTooLarge(),
        SandError.streamReset({ connectCode: connectCode("Unavailable"), errno: bounded.brandedErrno("ECONNRESET") }),
        SandError.streamReset({ connectCode: connectCode(undefined), errno: bounded.brandedErrno(undefined) }),
        SandError.streamReset({ connectCode: connectCode("unavailable"), errno: bounded.brandedErrno("EWHATEVER") }),
        SandError.turnRetryable({ connectCode: connectCode("Internal") }),
        SandError.backendRejected({ connectCode: connectCode("PermissionDenied") }),
        SandError.agentUnclassified(),
      ];
      return made.map((error) => ({ error, labels: registry.sandErrorTags(error), wire: registry.sandErrorWireCode(error) }));
    },
  },
  {
    name: "a passkey failure, a connector sign-in failure and a journal failure as their reporters make them, with the id of the server filtered beside",
    run: ({ bounded, registry }) => {
      const domError = bounded.brandedEnumOf(["NotAllowedError", "InvalidStateError", "AbortError"], "OtherError");
      const signClass = bounded.brandedEnumOf(["timeout", "cancelled"], "other");
      const reason = bounded.brandedEnumOf(["not_connected", "no_url"], "no_auth_link");
      const { SandError } = registry;
      const made = [
        SandError.webauthnSignFailed({ domError: domError("NotAllowedError"), signErrorClass: signClass("timeout") }),
        SandError.webauthnSignFailed({ domError: domError("QuotaExceededError"), signErrorClass: signClass(undefined) }),
        SandError.webauthnDesktopFailed({ domError: domError(undefined), signErrorClass: signClass("something else") }),
        SandError.connectorAuthStartRefused({ reason: reason("not_connected") }),
        SandError.connectorAuthStartRefused({ reason: reason("the server said no") }),
        SandError.connectorAuthAbandoned(),
        SandError.logShipTimeout({ batchEntries: 250 }),
        SandError.journalReplayFailed({ errno: bounded.brandedErrno("ENOSPC") }),
        SandError.journalAppendFailed({ errno: undefined }),
        { ...SandError.memorySynthesisEvidenceDropped(), itemCount: 4 },
        SandError.hostLifecycleStalled(),
      ];
      return {
        failures: made.map((error) => ({ error, labels: registry.sandErrorTags(error) })),
        serverIds: ["srv_01HZX", "mcp:github|work", "https://mcp.example.com/sse", "", undefined].map((id) => bounded.brandedId(id)),
        literal: bounded.brandLiteralEnum("rpc_timeout"),
      };
    },
  },
];
