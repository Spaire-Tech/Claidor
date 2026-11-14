/**
 * The pieces every way of asking a model shares: what a tool hands back
 * (words, or a picture), the three errors that say a limit was reached, the
 * list of messages an executor keeps and the wrapper that passes everything
 * to the executor below it, how a provider's sentence is recognised as "too
 * much went in" or "too much came out", the executor that answers without a
 * model, and the wrapper that makes pictures small enough before a prompt
 * goes out.
 *
 * No model is called. Where the part hands a prompt on, the scenarios give
 * it an executor of their own and keep what reached it. Lines for the log
 * are kept by a context that hands back a backend of the scenarios'.
 *
 * Every picture here is made in this file, byte by byte: bitmaps (nothing in
 * them is packed, so what comes back is the same bytes on every machine),
 * PNGs whose data is stored unpacked, WebP headers, and bytes that are no
 * picture at all. Where a PNG is written out again, its bytes depend on the
 * machine's zlib and only its kind and size in pixels are kept.
 */
import { createHash } from "node:crypto";

export const part = "packages/chat-inference";

const folder = "source/packages/chat-inference";
export const modules = {
  results: `${folder}/prompt-executor.ts`,
  base: `${folder}/base.ts`,
  limits: `${folder}/token-limit-error-classification.ts`,
  mock: `${folder}/mock-prompt-executor.ts`,
  pictures: `${folder}/middleware/image-resizing-middleware.ts`,
};

/** The folder holds six more files (`index.ts` and five other wrappers under `middleware/`) that are not this part's. */
export const covers = Object.values(modules);

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
 * The answer, or the kind of failure. Where JavaScript itself refuses a value
 * (a field of nothing, a call of what is no function), its sentence differs
 * between versions of Node, so only the kind of failure is kept.
 */
const attempt = (ask) => {
  try {
    return ask();
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
};

/** The same for what answers later. */
async function attemptLater(ask) {
  try {
    return await ask();
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
}

/** How a promise ended. */
async function settled(promise) {
  try {
    return { resolved: await promise };
  } catch (error) {
    return { rejected: error };
  }
}

/** A function's own name, how many parameters it declares, and whether it is one that answers later. */
const signature = (fn) => ({ name: fn.name, parameters: fn.length, kind: Object.prototype.toString.call(fn).slice(8, -1) });

/** A class: its parent, its own signature, and each method on its prototype in the order they are defined. */
const classShape = (made) => ({
  name: made.name,
  parameters: made.length,
  parent: Object.getPrototypeOf(made).name,
  statics: Object.getOwnPropertyNames(made).filter((name) => !["length", "name", "prototype"].includes(name)),
  methods: Object.fromEntries(
    Object.getOwnPropertyNames(made.prototype)
      .filter((name) => name !== "constructor")
      .map((name) => [name, `${Object.prototype.toString.call(made.prototype[name]).slice(8, -1)} of ${made.prototype[name].length}`]),
  ),
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A time made during the scenario, kept as words; any other value as it is. */
const timeWord = (value) => (value instanceof Date && Math.abs(Date.now() - value.getTime()) < 60_000 ? "a time, just now" : value);

const RANDOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** An id the part drew at random, kept as words; any other value as it is. */
const idWord = (value) => (typeof value === "string" && RANDOM_ID.test(value) ? "a random id" : value);

/** A copy of plain objects and lists with every time just made, and every random id, replaced by words. */
function steady(value) {
  if (value instanceof Date) return timeWord(value);
  if (typeof value === "string") return idWord(value);
  if (Array.isArray(value)) return value.map(steady);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, held]) => [key, steady(held)]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// Pictures, made by hand
// ---------------------------------------------------------------------------

const letters = (word) => Array.from(word, (letter) => letter.charCodeAt(0));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >>> 8) & 255];
const le24 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/** A bitmap of 24 bits a pixel, its colours changing a little from pixel to pixel. Nothing in it is packed. */
function bmp(width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  out.set([0x42, 0x4d, ...le32(size), 0, 0, 0, 0, ...le32(54), ...le32(40), ...le32(width), ...le32(height), ...le16(1), ...le16(24), ...le32(0), ...le32(row * height), ...le32(2835), ...le32(2835), ...le32(0), ...le32(0)]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) out.set([(200 + x) & 255, (120 + y) & 255, 10], 54 + y * row + x * 3);
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data) => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const adler32 = (data) => {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};
const pngChunk = (type, data) => [...be32(data.length), ...letters(type), ...data, ...be32(crc32([...letters(type), ...data]))];

/** A PNG of three bytes a pixel whose data is stored, not packed: the same bytes whatever zlib the machine has. */
function png(width, height) {
  const raw = [];
  for (let y = 0; y < height; y += 1) {
    raw.push(0);
    for (let x = 0; x < width; x += 1) raw.push((200 + x) & 255, (120 + y) & 255, 10);
  }
  const blocks = [];
  for (let at = 0; at < raw.length; at += 65_535) {
    const piece = raw.slice(at, at + 65_535);
    blocks.push(at + 65_535 >= raw.length ? 1 : 0, ...le16(piece.length), ...le16(~piece.length & 0xffff), ...piece);
  }
  const stream = [0x78, 0x01, ...blocks, ...be32(adler32(raw))];
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...pngChunk("IHDR", [...be32(width), ...be32(height), 8, 2, 0, 0, 0]), ...pngChunk("IDAT", stream), ...pngChunk("IEND", [])]);
}

/** The start of a WebP file that says how large its picture is. There is no picture after it. */
const webp = (width, height) => Uint8Array.from([...letters("RIFF"), ...le32(22), ...letters("WEBP"), ...letters("VP8X"), ...le32(10), 0x10, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);

/** Bytes that are no picture: each one its place in the list, from 1. */
const noPicture = (length) => Uint8Array.from({ length }, (_, at) => (at + 1) & 255);

/** The same bytes followed by zeros, up to `length`. */
const padded = (bytes, length) => {
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
};

const base64 = (bytes) => Buffer.from(bytes).toString("base64");

/** One mebibyte: above it, a picture the part cannot make smaller is left out. */
const MEBIBYTE = 1024 * 1024;

/** A PNG's size in pixels, read from its first chunk. */
const pngSize = (bytes) => `${Buffer.from(bytes).readUInt32BE(16)} by ${Buffer.from(bytes).readUInt32BE(20)}`;

/** Bytes as they are kept: what holds them, how many, and their fingerprint. */
const bytesTold = (bytes) => ({ held: bytes.constructor.name, bytes: bytes.length, sha256: sha256(bytes) });

// ---------------------------------------------------------------------------
// Stand-ins: a context that keeps the lines for the log, an executor below
// ---------------------------------------------------------------------------

/**
 * A context whose logger backend is the scenario's own, and the lines that
 * reached it. `failing` says for which lines the backend throws.
 */
function listening({ failing = () => false, onLine = () => {} } = {}) {
  const lines = [];
  const backend = {
    log(given, entry) {
      lines.push({
        level: entry.level,
        message: entry.message,
        fields: Object.keys(entry),
        ownContext: given === context && entry.context === context,
        stamped: entry.timestamp instanceof Date,
        ...("error" in entry ? { error: entry.error } : {}),
        metadata: entry.metadata,
      });
      onLine(entry);
      if (failing(entry)) throw new Error(`the log refused "${entry.message}"`);
    },
  };
  const context = { get: () => backend };
  return { context, lines };
}

/** What became of one piece of a user message: the piece that went in (by its place), or what replaced it. */
function pieceTold(piece, before) {
  const was = before.indexOf(piece);
  if (was !== -1) return `piece ${was}, as it was`;
  if (piece !== null && typeof piece === "object" && piece.image instanceof Uint8Array) return { ...piece, image: bytesTold(piece.image) };
  return piece;
}

/** A user message that came back, against the one that went in. */
function userTold(before, after) {
  if (after === before) return "the message itself, untouched";
  return {
    fields: Object.keys(after),
    restAsItWas: Object.keys(after).every((key) => key === "content" || after[key] === before[key]),
    contentIsNew: after.content !== before.content,
    content: after.content.map((piece) => pieceTold(piece, before.content)),
  };
}

/** What became of one item of a tool result's content: the item that went in (by its place), or what replaced it. */
function itemTold(item, before) {
  const was = before.indexOf(item);
  if (was !== -1) return `item ${was}, as it was`;
  if (item !== null && typeof item === "object" && typeof item.data === "string") {
    const decoded = Buffer.from(item.data, "base64");
    return { ...item, data: { base64Letters: item.data.length, bytes: decoded.length, sha256: sha256(decoded) } };
  }
  return item;
}

/** A tool message that came back, against the one that went in. */
function toolTold(before, after) {
  if (after === before) return "the message itself, untouched";
  return {
    fields: Object.keys(after),
    restAsItWas: Object.keys(after).every((key) => key === "content" || after[key] === before[key]),
    contentIsNew: after.content !== before.content,
    content: after.content.map((piece) => {
      const was = before.content.indexOf(piece);
      if (was !== -1) return `piece ${was}, as it was`;
      const source = before.content.find((candidate) => candidate !== null && typeof candidate === "object" && candidate.toolCallId === piece.toolCallId) ?? {};
      const earlier = Array.isArray(source.experimental_content) ? source.experimental_content : [];
      return {
        fields: Object.keys(piece),
        itemsAreNew: piece.experimental_content !== source.experimental_content,
        experimental_content: piece.experimental_content.map((item) => itemTold(item, earlier)),
      };
    }),
  };
}

/** A message as either kind tells it. */
const messageTold = (before, after) => (before?.role === "tool" ? toolTold(before, after) : userTold(before, after));

const userWith = (...content) => ({ role: "user", content });
const picturePiece = (image, mimeType) => ({ type: "image", image, ...(mimeType === undefined ? {} : { mimeType }) });
const toolWith = (...results) => ({ role: "tool", content: results.map((items, at) => ({ type: "tool-result", toolCallId: `call-${at}`, toolName: "Read", result: "done", experimental_content: items })) });
const pictureItem = (bytes, mimeType) => ({ type: "image", data: base64(bytes), ...(mimeType === undefined ? {} : { mimeType }) });

/** One message through the part, with the lines it wrote. */
async function oneMessage(pictures, message, options) {
  const { context, lines } = listening(options);
  const after = await pictures.resizeImagesInMessage(context, message);
  return { answer: messageTold(message, after), lines };
}

/**
 * An executor to stand below a wrapper: it keeps messages the way a real one
 * does and notes every call. `answer` is what its `stream` gives back.
 */
function below({ messages = [], answer, streamFails, messagesFail } = {}) {
  const calls = [];
  let held = [...messages];
  const executor = {
    appendMessages(...given) {
      calls.push({ call: "appendMessages", arguments: given.length, given: given[0] });
      held.push(...(Array.isArray(given[0]) ? given[0] : [given[0]]));
      return "what the executor below answers to appendMessages";
    },
    getState(...given) {
      calls.push({ call: "getState", arguments: given.length });
      return { stateOf: "the executor below" };
    },
    getMessages(...given) {
      calls.push({ call: "getMessages", arguments: given.length });
      if (messagesFail) throw messagesFail;
      return [...held];
    },
    clearMessages(...given) {
      calls.push({ call: "clearMessages", arguments: given.length });
      held = [];
      return "what the executor below answers to clearMessages";
    },
    stream(...given) {
      calls.push({ call: "stream", arguments: given.length, given });
      if (streamFails) throw streamFails;
      return typeof answer === "function" ? answer(...given) : answer;
    },
  };
  return { executor, calls, held: () => held };
}

/** A stream's pieces as they come, until it ends, throws, or has given `atMost` of them. */
async function drained(stream, atMost = 400) {
  const pieces = [];
  try {
    for await (const piece of stream) {
      pieces.push(piece);
      if (pieces.length >= atMost) return { pieces, stoppedByTheScenarioAfter: atMost };
    }
  } catch (error) {
    return { pieces, threw: error };
  }
  return { pieces };
}

/** Everything a call of `stream` gave: the kind of each thing, the stream's pieces, and how each promise ended. */
async function gathered(result, atMost) {
  const kinds = Object.fromEntries(Object.keys(result).map((key) => [key, Object.prototype.toString.call(result[key])]));
  // Every promise is listened to before the stream is read, so that one that fails is never left unheard.
  const later = Object.keys(result).filter((key) => key !== "fullStream").map((key) => [key, settled(result[key])]);
  const out = { kinds, fullStream: await drained(result.fullStream, atMost) };
  for (const [key, ending] of later) out[key] = await ending;
  return out;
}

/** A failure by its kind when JavaScript raised it (its sentence differs between versions of Node), or itself when the scenario made it. */
const failureTold = (error) => (error instanceof TypeError || error instanceof RangeError ? { threw: error.constructor.name } : error);

/** How a promise ended, a failure of JavaScript's by its kind. */
const endingTold = (ending) => ("rejected" in ending ? { rejected: failureTold(ending.rejected) } : ending);

/** `gathered`, with times and random ids as words and JavaScript's failures by kind. */
async function gatheredSteady(result, atMost) {
  const all = await gathered(result, atMost);
  const out = { kinds: all.kinds, fullStream: { ...all.fullStream, pieces: all.fullStream.pieces.map(steady) } };
  if ("threw" in all.fullStream) out.fullStream.threw = failureTold(all.fullStream.threw);
  for (const key of Object.keys(all)) {
    if (key === "kinds" || key === "fullStream") continue;
    out[key] = "rejected" in all[key] ? endingTold(all[key]) : { resolved: steady(all[key].resolved) };
  }
  return out;
}

/** The waits of `delay` milliseconds asked of the clock while `run` runs. Each is still waited out. */
async function waitsOf(delay, run) {
  const real = globalThis.setTimeout;
  const waits = [];
  globalThis.setTimeout = function (callback, time, ...rest) {
    if (time === delay) waits.push(time);
    return real(callback, time, ...rest);
  };
  try {
    const answer = await run();
    return { answer, waits: waits.length };
  } finally {
    globalThis.setTimeout = real;
  }
}

// ---------------------------------------------------------------------------
// Sentences of providers
// ---------------------------------------------------------------------------

/** One sentence for each wording the part knows of "too much went in", then the same with one of its pieces missing. */
const TOO_MUCH_IN = {
  "the configured limit and what the messages came to": "Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 301234 tokens.",
  "the count against the number allowed": "The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).",
  "the count against the context length": "Input token count 250000 exceeds the model's maximum context length of 200000.",
  "the prompt length and what the request contains": "Maximum prompt length is 131072 tokens; the request contains 140000 tokens.",
  "the prompt is too long": "Prompt is too long: 210000 tokens > 200000 maximum",
  "the input is longer than the context length": "This model's input of 9000 tokens is longer than its context length of 8192.",
  "the count plus what was asked back": "Input token count 5000 plus requested output count 4000 exceeds maximum context length 8192",
  "the input exceeds the context window": "Input exceeds the context window of this model",
  "the input is too long for the model asked": "Input is too long for requested model.",
  "the input length against the length allowed": "Input length 300000 exceeds the maximum allowed input length of 250000.",
  "the length allowed alone, which holds the words 'input length'": "It exceeds the maximum allowed input length of 250000.",
  "the request size in bytes": "Request size cannot exceed 20971520 bytes. Please shorten the request.",
  "the input length and max_tokens": "input length and `max_tokens` exceed context limit: 190000 + 20000 > 200000",
  "the input is too long": "Sorry, the input is too long.",
  "the request size against the context window": "Request size exceeds model context window",
  "the message size in megabytes": "Message size 6000000 bytes exceeds the 5 MB limit",
  "a code in a provider's answer": "Error code: 400 - {'error': {'code': 'context_length_exceeded'}}",
  "an answer of a web server": "413 Payload Too Large",
  "a count of tokens exceeded": "max tokens of 128000 exceeded",
};

const NOT_QUITE = {
  "the configured limit, without what the messages came to": "Input tokens exceed the configured limit of 272000 tokens.",
  "what the messages came to, without the configured limit": "Your messages resulted in 301234 tokens.",
  "the number allowed, without the count": "The token count exceeds the maximum number of tokens allowed.",
  "the count, without the number allowed": "The input token count is 1200000.",
  "the count and the context length, without 'exceeds'": "Input token count 250000 is over the maximum context length of 200000.",
  "the count that exceeds, without the context length": "Input token count 250000 exceeds what is allowed.",
  "the context length exceeded, without the count": "The request exceeds the maximum context length of 200000.",
  "the prompt length, without what the request contains": "Maximum prompt length is 131072 tokens.",
  "what the request contains, without the prompt length": "The request contains 140000 tokens.",
  "the prompt length and the request, without 'tokens'": "Maximum prompt length reached: the request contains too much.",
  "longer than the context length, without 'input'": "The prompt of 9000 tokens is longer than its context length of 8192.",
  "longer than the context length, without 'token'": "The input is longer than the context length.",
  "the input and the context length, without 'longer than'": "The input tokens are over the context length.",
  "the input longer than, without 'context length'": "The input tokens are longer than allowed.",
  "the input exceeds, without the context window": "Input exceeds the limit.",
  "the context window, without 'input exceeds'": "Too large for the context window.",
  "the input length, without the length allowed": "Input length is 300000.",
  "the request size, without 'bytes'": "Request size cannot exceed the limit. Please shorten the request.",
  "the request size in bytes, without the plea": "Request size cannot exceed 20971520 bytes.",
  "bytes and the plea, without the request size": "Too many bytes. Please shorten the request.",
  "the input length and max_tokens, without the context limit": "input length and `max_tokens` are large",
  "the input length and the context limit, without max_tokens": "input length would exceed context limit",
  "max_tokens and the context limit, without the input length": "`max_tokens` exceed context limit",
  "the message size, without 'bytes'": "Message size exceeds the 5 MB limit",
  "the message size in bytes, without 'exceeds'": "Message size 6000000 bytes is over the 5 MB limit",
  "bytes over the limit, without the message size": "6000000 bytes exceeds the 5 MB limit",
  "the message size in bytes, without the megabyte limit": "Message size 6000000 bytes exceeds the limit",
  "tokens exceeded, without their count": "max tokens of exceeded",
  "tokens exceeded, their count after two spaces": "max tokens of  128000 exceeded",
  "tokens exceeded, their count ending in a letter": "max tokens of 128k exceeded",
  "tokens exceeded, their count in other digits": "max tokens of ١٢٨ exceeded",
  "a rate limit": "Rate limit reached for requests",
  "an empty sentence": "",
  "one word of many wordings": "tokens",
};

/** What the three functions say of one sentence. */
function judged(limits, sentence) {
  const made = limits.classifyTokenLimitErrorFromMessage(sentence);
  return {
    tooMuchIn: limits.isInputTokenLimitErrorMessage(sentence),
    tooMuchOut: limits.isOutputTokenLimitErrorMessage(sentence),
    error: made === undefined ? undefined : { class: made.constructor.name, name: made.name, message: made.message },
  };
}

// ---------------------------------------------------------------------------

export const scenarios = [
  // ── What a tool hands back, and the three errors ──
  {
    name: "what the part exports, by name and number of parameters",
    run: ({ results, base, limits, mock, pictures }) => ({
      results: {
        createStringResult: signature(results.createStringResult),
        createImageResult: signature(results.createImageResult),
        OutputTokensLimitExceededError: classShape(results.OutputTokensLimitExceededError),
        InputTokenLimitError: classShape(results.InputTokenLimitError),
        ProactiveSummarizationThresholdError: classShape(results.ProactiveSummarizationThresholdError),
      },
      base: {
        BasePromptBuilder: classShape(base.BasePromptBuilder),
        BasePromptExecutor: classShape(base.BasePromptExecutor),
        BaseMiddleware: classShape(base.BaseMiddleware),
      },
      limits: {
        isInputTokenLimitErrorMessage: signature(limits.isInputTokenLimitErrorMessage),
        isOutputTokenLimitErrorMessage: signature(limits.isOutputTokenLimitErrorMessage),
        classifyTokenLimitErrorFromMessage: signature(limits.classifyTokenLimitErrorFromMessage),
      },
      mock: {
        createMockPromptExecutor: signature(mock.createMockPromptExecutor),
        MockPromptBuilder: classShape(mock.MockPromptBuilder),
        MockPromptExecutor: classShape(mock.MockPromptExecutor),
      },
      pictures: {
        IMAGE_RESIZE_CONCURRENCY: pictures.IMAGE_RESIZE_CONCURRENCY,
        resizeImagesInMessage: signature(pictures.resizeImagesInMessage),
        resizeImagesInMessages: signature(pictures.resizeImagesInMessages),
        ImageResizingPromptExecutor: classShape(pictures.ImageResizingPromptExecutor),
        createImageResizingMiddleware: signature(pictures.createImageResizingMiddleware),
        imageResizingMiddleware: signature(pictures.imageResizingMiddleware),
      },
    }),
  },
  {
    name: "a result of words is one piece of text and a mark that says whether it is an error, no unless told",
    run: ({ results }) => {
      const { createStringResult } = results;
      const held = { any: "thing" };
      const same = createStringResult(held);
      const first = createStringResult("twice");
      const second = createStringResult("twice");
      return {
        answers: cases(
          {
            "words alone": ["The file was written."],
            "words, an error": ["No such file.", true],
            "words, not an error": ["Fine.", false],
            "no words": [""],
            "nothing at all": [],
            "the mark left undefined": ["x", undefined],
            "the mark given as nothing": ["x", null],
            "the mark given as a number": ["x", 0],
            "the mark given as a word": ["x", "yes"],
            "a number for words": [42],
            "nothing for words": [null],
          },
          (given) => createStringResult(...given),
        ),
        whatIsGivenIsNotCopied: same.content[0].text === held,
        eachAnswerIsItsOwn: first !== second && first.content !== second.content && first.content[0] !== second.content[0],
      };
    },
  },
  {
    name: "a result of a picture puts the words before the picture when there are any",
    run: ({ results }) => {
      const { createImageResult } = results;
      return cases(
        {
          "a picture alone": ["QUJD", "image/png"],
          "a picture with words": ["QUJD", "image/jpeg", "A screenshot of the page."],
          "a picture with no words": ["QUJD", "image/png", ""],
          "a picture with undefined words, an error": ["QUJD", "image/png", undefined, true],
          "a picture with nothing for words": ["QUJD", "image/png", null, false],
          "a picture with a zero for words": ["QUJD", "image/png", 0],
          "a picture with the word 0": ["QUJD", "image/png", "0"],
          "a picture with words, an error": ["QUJD", "image/webp", "Could not open.", true],
          "the mark left undefined": ["QUJD", "image/png", "words", undefined],
          "the mark given as nothing": ["QUJD", "image/png", "words", null],
          "no kind": ["QUJD"],
          "nothing at all": [],
          "bytes for a picture": [Uint8Array.of(1, 2, 3), "image/gif", "bytes"],
        },
        (given) => createImageResult(...given),
      );
    },
  },
  {
    name: "each of the three errors is an Error with its own name, set on the error itself, and a message of its own unless one is given",
    run: ({ results }) => {
      const told = (made, Class) => ({
        name: made.name,
        message: made.message,
        text: String(made),
        ownFields: Object.keys(made),
        ownNames: Object.getOwnPropertyNames(made).sort(),
        anError: made instanceof Error,
        ofItsClass: made instanceof Class,
        class: made.constructor.name,
        traceStartsWith: String(made.stack).split("\n")[0],
        cause: "cause" in made ? made.cause : "none",
      });
      const { OutputTokensLimitExceededError, InputTokenLimitError, ProactiveSummarizationThresholdError } = results;
      const each = cases({ OutputTokensLimitExceededError, InputTokenLimitError, ProactiveSummarizationThresholdError }, (Class) => ({
        "no message": told(new Class(), Class),
        "an undefined message": told(new Class(undefined), Class),
        "a message": told(new Class("The provider said no."), Class),
        "an empty message": told(new Class(""), Class),
        "nothing for a message": told(new Class(null), Class),
        "a number for a message": told(new Class(404), Class),
        "a message and a cause": told(new Class("with a cause", { cause: new Error("below") }), Class),
      }));
      const output = new OutputTokensLimitExceededError();
      const input = new InputTokenLimitError();
      const proactive = new ProactiveSummarizationThresholdError();
      return {
        each,
        neitherIsTheOther: [output instanceof InputTokenLimitError, input instanceof OutputTokensLimitExceededError, proactive instanceof InputTokenLimitError, input instanceof ProactiveSummarizationThresholdError],
        asKept: [output, input, proactive],
        nameCanBeChanged: (() => {
          const made = new InputTokenLimitError("renamed");
          made.name = "Other";
          return String(made);
        })(),
      };
    },
  },

  // ── The list of messages, the executor over it, the wrapper over an executor ──
  {
    name: "a builder starts with no message, one message, or a copy of a list of them",
    run: ({ base }) => {
      const { BasePromptBuilder } = base;
      const first = { role: "user", content: "one" };
      const second = { role: "assistant", content: "two" };
      const list = [first, second];
      const fromList = new BasePromptBuilder(list);
      list.push({ role: "user", content: "added to the list afterwards" });
      const gaps = [first, , second];
      const ownWalk = [first, second];
      ownWalk[Symbol.iterator] = function* () {
        yield "what the list's own walk gives";
      };
      return {
        starts: cases(
          {
            "nothing": [],
            "undefined": [undefined],
            "one message": [first],
            "a list": [[first, second]],
            "an empty list": [[]],
            "nothing for a message": [null],
            "a word": ["hello"],
            "a number": [0],
            "a list in a list": [[[first], second]],
            "a list with a gap": [gaps],
            "a list that walks its own way": [ownWalk],
            "something like a list": [{ length: 1, 0: first }],
            "a set": [new Set([first])],
          },
          (given) => new BasePromptBuilder(...given).getMessages(),
        ),
        aGapBecomesAnUndefinedMessage: 1 in new BasePromptBuilder(gaps).getMessages() && 1 in new BasePromptBuilder().appendMessages(gaps).getMessages(),
        theListIsCopied: fromList.getMessages().length,
        theMessagesAreNot: fromList.getMessages()[0] === first,
        asKept: new BasePromptBuilder(first),
        ownFields: Object.keys(new BasePromptBuilder()),
      };
    },
  },
  {
    name: "a builder adds one message or each message of a list, hands out copies of its list, and forgets them all when cleared",
    run: ({ base }) => {
      const { BasePromptBuilder } = base;
      const first = { role: "user", content: "one" };
      const second = { role: "assistant", content: "two" };
      const third = { role: "user", content: "three" };
      const builder = new BasePromptBuilder();
      const steps = [];
      const step = (name, answer) => steps.push({ name, answersItself: answer === builder, messages: builder.getMessages() });
      step("one message", builder.appendMessages(first));
      step("a list of two", builder.appendMessages([second, third]));
      step("an empty list", builder.appendMessages([]));
      step("undefined", builder.appendMessages(undefined));
      step("nothing", builder.appendMessages(null));
      step("no argument", builder.appendMessages());
      step("a word", builder.appendMessages("words"));
      step("a list in a list", builder.appendMessages([[first]]));
      step("a list with a gap", builder.appendMessages([first, , second]));
      step("something like a list", builder.appendMessages({ length: 2, 0: first, 1: second }));
      const chained = new BasePromptBuilder(first).appendMessages(second).appendMessages([third, first]).getMessages().map((message) => message.content);

      const copies = new BasePromptBuilder([first, second]);
      const state = copies.getState();
      const messages = copies.getMessages();
      state.push(third);
      messages.length = 0;
      const afterTheCopiesChanged = copies.getMessages().length;
      const cleared = copies.clearMessages();
      const added = [third];
      copies.appendMessages(added);
      added.push(first);

      /** A builder of another part reads and writes the list itself, under the name `messages`. */
      class Replacing extends BasePromptBuilder {
        replace(previous, next) {
          const at = this.messages.indexOf(previous);
          if (at === -1) return false;
          this.messages[at] = next;
          return true;
        }
      }
      const replacing = new Replacing([first, second]);
      return {
        steps,
        chained,
        copies: {
          eachCallGivesAnotherList: copies.getState() !== copies.getState() && copies.getMessages() !== copies.getMessages() && state !== messages,
          theSameMessages: state[0] === first && state[1] === second,
          afterTheCopiesChanged,
          clearingAnswers: cleared,
          afterClearingAndAdding: copies.getMessages(),
          stateAfter: copies.getState(),
        },
        aBuilderOfItsOwn: [replacing.replace(first, third), replacing.replace(first, third), replacing.getMessages().map((message) => message.content)],
      };
    },
  },
  {
    name: "an executor passes its messages to its builder and answers itself when adding",
    run: ({ base }) => {
      const { BasePromptBuilder, BasePromptExecutor } = base;
      const calls = [];
      const builder = {
        appendMessages(...given) {
          calls.push({ call: "appendMessages", arguments: given.length, given: given[0], onTheBuilder: this === builder });
          return "the builder's own answer";
        },
        getState(...given) {
          calls.push({ call: "getState", arguments: given.length, onTheBuilder: this === builder });
          return "the builder's state";
        },
        getMessages(...given) {
          calls.push({ call: "getMessages", arguments: given.length, onTheBuilder: this === builder });
          return "the builder's messages";
        },
        clearMessages(...given) {
          calls.push({ call: "clearMessages", arguments: given.length, onTheBuilder: this === builder });
          return "the builder's answer to clearing";
        },
      };
      const executor = new BasePromptExecutor(builder);
      const list = [{ role: "user", content: "a" }];
      const answers = {
        addingAnswersTheExecutor: executor.appendMessages(list, "a second argument that is dropped") === executor,
        state: executor.getState("dropped"),
        messages: executor.getMessages("dropped"),
        clearing: executor.clearMessages("dropped"),
      };
      const real = new BasePromptExecutor(new BasePromptBuilder({ role: "system", content: "first" }));
      real.appendMessages({ role: "user", content: "second" }).appendMessages([{ role: "assistant", content: "third" }]);
      const before = real.getMessages();
      real.clearMessages();
      /** An executor of another part reaches its builder under the name `builder`. */
      class Reaching extends BasePromptExecutor {
        builderIs(candidate) {
          return this.builder === candidate;
        }
      }
      return {
        answers,
        calls,
        theListGivenIsPassedAsItIs: calls[0].given === list,
        overARealBuilder: { before, state: real.getState(), after: real.getMessages() },
        ownFields: Object.keys(executor),
        asKept: real,
        reachedByItsName: new Reaching(builder).builderIs(builder),
        withNoBuilder: attempt(() => new BasePromptExecutor().getMessages()),
      };
    },
  },
  {
    name: "a wrapper passes every call to the executor below it, with every argument of a stream, and answers itself when adding",
    run: ({ base }) => {
      const { BaseMiddleware } = base;
      const answer = { fullStream: "the stream below" };
      const { executor, calls } = below({ answer });
      const wrapper = new BaseMiddleware(executor);
      const list = [{ role: "user", content: "a" }];
      const context = { a: "context" };
      const answers = {
        addingAnswersTheWrapper: wrapper.appendMessages(list, "a second argument that is dropped") === wrapper,
        state: wrapper.getState("dropped"),
        messages: wrapper.getMessages("dropped"),
        clearing: wrapper.clearMessages("dropped"),
        streamWithNothing: wrapper.stream() === answer,
        streamWithOne: wrapper.stream(context) === answer,
        streamWithSix: wrapper.stream(context, "id", ["tool"], { option: 1 }, undefined, "sixth") === answer,
      };
      /** A wrapper of another part reaches the executor below under the name `innerExecutor`. */
      class Reaching extends BaseMiddleware {
        belowIs(candidate) {
          return this.innerExecutor === candidate;
        }
      }
      const twice = new BaseMiddleware(new BaseMiddleware(executor));
      twice.stream("through two wrappers");
      return {
        answers,
        calls: calls.map((made) => (made.call === "stream" ? { ...made, given: made.given.map((value) => (value === context ? "the context" : value)) } : made)),
        theListGivenIsPassedAsItIs: calls[0].given === list,
        ownFields: Object.keys(wrapper),
        reachedByItsName: new Reaching(executor).belowIs(executor),
        withNothingBelow: attempt(() => new BaseMiddleware().stream()),
        whatFailsBelowFailsHere: attempt(() => {
          try {
            new BaseMiddleware(below({ streamFails: new Error("the executor below failed") }).executor).stream();
          } catch (error) {
            return `threw: ${error.message}`;
          }
          return "nothing thrown";
        }),
      };
    },
  },

  // ── A provider's sentence: too much went in, too much came out ──
  {
    name: "each known wording of too much input is recognised and becomes an InputTokenLimitError that keeps the sentence",
    run: ({ limits }) => cases(TOO_MUCH_IN, (sentence) => judged(limits, sentence)),
  },
  {
    name: "a wording with one of its pieces missing is not recognised",
    run: ({ limits }) => cases(NOT_QUITE, (sentence) => judged(limits, sentence)),
  },
  {
    name: "wordings are recognised in any mix of capital and small letters, and the error keeps the letters as they came",
    run: ({ limits }) =>
      cases(
        Object.fromEntries(Object.entries(TOO_MUCH_IN).flatMap(([name, sentence]) => [[`${name}, in capitals`, sentence.toUpperCase()], [`${name}, in small letters, inside a longer sentence`, `stream error: ${sentence.toLowerCase()} (request 12)`]])),
        (sentence) => judged(limits, sentence),
      ),
  },
  {
    name: "too much output is told by one wording, looked for before any wording of too much input",
    run: ({ limits, results }) => ({
      sentences: cases(
        {
          "the wording": "Provider exceeded max output tokens",
          "the wording in capitals": "PROVIDER EXCEEDED MAX OUTPUT TOKENS",
          "the wording inside a sentence": "The model has Exceeded Max Output Tokens (32000) for this response.",
          "the wording alone": "exceeded max output tokens",
          "one token": "exceeded max output token",
          "two spaces": "exceeded  max output tokens",
          "other words": "the output was cut at the token limit",
          "both too much out and too much in": "Prompt is too long, and the answer exceeded max output tokens",
          "both, the other way round": "exceeded max output tokens; context_length_exceeded",
        },
        (sentence) => judged(limits, sentence),
      ),
      ownMessages: cases(
        {
          "the message of the output error": new results.OutputTokensLimitExceededError().message,
          "the message of the input error": new results.InputTokenLimitError().message,
          "the message of the input error, in capitals, in a sentence": `FAILED: ${new results.InputTokenLimitError().message.toUpperCase()}!`,
          "the message of the threshold error": new results.ProactiveSummarizationThresholdError().message,
        },
        (sentence) => judged(limits, sentence),
      ),
      anErrorOfItsClass: [
        limits.classifyTokenLimitErrorFromMessage("exceeded max output tokens") instanceof results.OutputTokensLimitExceededError,
        limits.classifyTokenLimitErrorFromMessage("prompt is too long") instanceof results.InputTokenLimitError,
        limits.classifyTokenLimitErrorFromMessage("prompt is too long") !== limits.classifyTokenLimitErrorFromMessage("prompt is too long"),
      ],
    }),
  },
  {
    name: "a count of tokens exceeded needs digits and single spaces",
    run: ({ limits }) =>
      cases(
        {
          "one digit": "max tokens of 1 exceeded",
          "many digits": "max tokens of 1234567890 exceeded",
          "in capitals": "MAX TOKENS OF 5 EXCEEDED",
          "inside a sentence": "error: max tokens of 4096 exceeded by the request",
          "a count with a comma": "max tokens of 128,000 exceeded",
          "a count with a point": "max tokens of 128.5 exceeded",
          "a count with a sign": "max tokens of -5 exceeded",
          "a line break before the count": "max tokens of\n5 exceeded",
          "a tab after the count": "max tokens of 5\texceeded",
        },
        (sentence) => judged(limits, sentence),
      ),
  },
  {
    name: "what is not a sentence is refused by JavaScript, and what can be put in small letters is taken as one",
    run: ({ limits }) => {
      const wordObject = new String("Prompt Is Too Long");
      const asked = (value) => ({
        tooMuchIn: attempt(() => limits.isInputTokenLimitErrorMessage(value)),
        tooMuchOut: attempt(() => limits.isOutputTokenLimitErrorMessage(value)),
        error: attempt(() => {
          const made = limits.classifyTokenLimitErrorFromMessage(value);
          return made === undefined ? undefined : { class: made.constructor.name, message: made.message };
        }),
      });
      /** Something that counts how often it is put in small letters, and answers `small`. */
      const counting = (small) => {
        const counted = { times: 0, toLowerCase() { this.times += 1; return small; }, toString: () => "the counted thing" };
        return counted;
      };
      const timesFor = (small, ask) => {
        const counted = counting(small);
        ask(counted);
        return counted.times;
      };
      return {
        values: cases({ "undefined": undefined, "nothing": null, "a number": 42, "an object": {}, "a list": ["prompt is too long"], "true": true }, asked),
        aWordObject: asked(wordObject),
        putInSmallLettersThisManyTimes: {
          "asking whether too much went in": timesFor("prompt is too long", limits.isInputTokenLimitErrorMessage),
          "asking whether too much came out": timesFor("exceeded max output tokens", limits.isOutputTokenLimitErrorMessage),
          "sorting a sentence of too much out": timesFor("exceeded max output tokens", limits.classifyTokenLimitErrorFromMessage),
          "sorting a sentence of too much in": timesFor("prompt is too long", limits.classifyTokenLimitErrorFromMessage),
          "sorting the input error's own message": timesFor("input token limit exceeded", limits.classifyTokenLimitErrorFromMessage),
          "sorting any other sentence": timesFor("hello", limits.classifyTokenLimitErrorFromMessage),
        },
      };
    },
  },

  // ── The executor that answers without a model ──
  {
    name: "the stand-in executor's options, with what stands for each one left out",
    run: ({ mock }) => {
      const toolCalls = [{ toolCallId: "call-1", toolName: "Shell", args: { command: "ls" } }];
      const failure = new Error("as asked");
      const answers = cases(
        {
          "no function": undefined,
          "a function that gives nothing": () => undefined,
          "a function that gives null": () => null,
          "nothing set": () => ({}),
          "everything set": () => ({ response: "Hi", toolCalls, streamDelay: 5, chunkSize: 3, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, maxTokens: 5 }, simulateError: failure }),
          "everything set to nothing": () => ({ response: null, toolCalls: null, streamDelay: null, chunkSize: null, usage: null, simulateError: null }),
          "everything set to undefined": () => ({ response: undefined, toolCalls: undefined, streamDelay: undefined, chunkSize: undefined, usage: undefined, simulateError: undefined }),
          "everything set to what counts for no": () => ({ response: "", toolCalls: [], streamDelay: 0, chunkSize: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 0 }, simulateError: 0 }),
          "one count of the usage": () => ({ usage: { outputTokens: 7 } }),
          "counts of the usage set to nothing": () => ({ usage: { inputTokens: null, outputTokens: undefined, cacheReadTokens: null, cacheWriteTokens: undefined, maxTokens: null } }),
          "a usage that is a number": () => ({ usage: 12 }),
          "more than is known": () => ({ response: "x", temperature: 1, usage: { inputTokens: 3, reasoningTokens: 9 } }),
          "other kinds of value": () => ({ response: 12, toolCalls: "ab", streamDelay: "5", chunkSize: "2", simulateError: "a word" }),
        },
        (options) => new mock.MockPromptExecutor(options).options(),
      );
      const kept = new mock.MockPromptExecutor(() => ({ toolCalls, simulateError: failure })).options();
      let asked = 0;
      const counting = new mock.MockPromptExecutor(() => {
        asked += 1;
        return { response: `answer ${asked}` };
      });
      const whenMade = asked;
      const responses = [counting.options().response, counting.options().response];
      const stream = counting.stream({});
      const afterAStream = asked;
      return {
        answers,
        whatIsGivenIsNotCopied: kept.toolCalls === toolCalls && kept.simulateError === failure,
        askedWhenMade: whenMade,
        responses,
        askedOnceByAStream: afterAStream,
        whatAStreamGives: Object.keys(stream),
        refusedOptions: attempt(() => new mock.MockPromptExecutor("not a function").options()),
      };
    },
  },
  {
    name: "the stand-in executor with nothing asked answers one sentence, a letter at a time, and then says it finished",
    run: async ({ mock }) => {
      const executor = new mock.MockPromptExecutor();
      const all = await gatheredSteady(executor.stream({ a: "context" }, "invocation-7", [{ name: "a tool" }], { any: "option" }));
      return {
        ...all,
        theSentence: all.fullStream.pieces.filter((piece) => piece.type === "text-delta").map((piece) => piece.textDelta).join(""),
        asKept: executor,
        ownFields: Object.keys(executor),
        optionsFunction: signature(executor.options),
        noMessagesKept: executor.getMessages(),
      };
    },
  },
  {
    name: "the stand-in executor draws an id of its own when given none, and counts what was used as it is told",
    run: async ({ mock }) => {
      const executor = new mock.MockPromptExecutor(() => ({ response: "ok", chunkSize: 2 }));
      const ids = await casesInTurn(
        { "an id": ["stream-1"], "no id": [], "an undefined id": [undefined], "nothing for an id": [null], "an empty id": [""], "a number for an id": [0] },
        async (rest) => idWord(await executor.stream({}, ...rest).invocationId),
      );
      const [first, second] = [await executor.stream({}).invocationId, await executor.stream({}).invocationId];
      const counted = new mock.MockPromptExecutor(() => ({ response: "", usage: { inputTokens: "1", outputTokens: "2", cacheReadTokens: 3.5, cacheWriteTokens: -1, maxTokens: Infinity } })).stream({}, "counts");
      const finish = (await drained(counted.fullStream)).pieces.at(-1);
      return {
        ids,
        twoDrawnIdsDiffer: first !== second,
        eachCallGivesNewThings: executor.stream({}).usage !== executor.stream({}).usage,
        countsThatAreWordsAreJoined: { usage: await counted.usage, extendedUsage: await counted.extendedUsage, inTheLastPiece: finish.usage, theLastPieceHasItsOwnCopy: finish.usage !== (await counted.usage) },
      };
    },
  },
  {
    name: "the stand-in executor cuts its sentence into pieces of the size asked",
    run: async ({ mock }) => {
      const pieces = async (chunkSize, response = "abcdefg") => {
        const executor = new mock.MockPromptExecutor(() => ({ response, chunkSize }));
        const all = await drained(executor.stream({}).fullStream, 12);
        const texts = all.pieces.filter((piece) => piece.type === "text-delta").map((piece) => piece.textDelta);
        return { texts, then: all.pieces.filter((piece) => piece.type !== "text-delta").map((piece) => piece.type), ...("stoppedByTheScenarioAfter" in all ? { neverEnds: `stopped by the scenario after ${all.stoppedByTheScenarioAfter} pieces` } : {}) };
      };
      return {
        sizes: await casesInTurn(
          { "one": 1, "two": 2, "three": 3, "one less than the sentence": 6, "the sentence's length": 7, "one more": 8, "a hundred": 100, "two and a half": 2.5, "without end": Infinity, "not a number": NaN, "zero": 0, "minus one": -1, "the word 2": "2", "the word abc": "abc", "true": true },
          (chunkSize) => pieces(chunkSize),
        ),
        sentences: await casesInTurn({ "an empty sentence": "", "one letter": "a", "two letters by twos": "ab", "three letters by twos": "abc", "letters outside the first plane": "a😀b" }, (response) => pieces(2, response)),
        whatIsNoSentence: await casesInTurn({ "a number": 12, "a list of three": ["a", "b", "c"], "true": true }, async (response) => {
          const all = await gatheredSteady(new mock.MockPromptExecutor(() => ({ response, chunkSize: 2 })).stream({}, "no sentence"));
          return { pieces: all.fullStream.pieces.map((piece) => (piece.type === "text-delta" ? piece.textDelta : piece.type)), message: all.response.resolved.messages[0] };
        }),
        whatIsNoSentenceWhenToldToFail: await casesInTurn({ "a number": 12, "a list of three": ["a", "b", "c"] }, async (response) => {
          const all = await gatheredSteady(new mock.MockPromptExecutor(() => ({ response, chunkSize: 2, simulateError: "told to fail" })).stream({}, "no sentence"));
          return { pieces: all.fullStream.pieces.map((piece) => (piece.type === "text-delta" ? piece.textDelta : piece.type)), threw: all.fullStream.threw, response: "rejected" in all.response ? all.response : all.response.resolved.messages[0] };
        }),
      };
    },
  },
  {
    name: "the stand-in executor announces each tool call, sends its arguments in pieces, then the call whole, in the order asked",
    run: async ({ mock }) => {
      const args = { command: "ls -la", cwd: "/work" };
      const toolCalls = [
        { toolCallId: "call-1", toolName: "Shell", args },
        { toolCallId: "call-2", toolName: "Read", args: {} },
        { toolName: "NoId", args: "a word" },
        { toolCallId: "call-4", toolName: "Empty", args: null, extra: "dropped" },
      ];
      const executor = new mock.MockPromptExecutor(() => ({ response: "On it.", toolCalls, chunkSize: 8 }));
      const result = executor.stream({}, "with-tools");
      const all = await gatheredSteady(result);
      const withoutWords = await gatheredSteady(new mock.MockPromptExecutor(() => ({ response: "", toolCalls: [toolCalls[1]], chunkSize: 100 })).stream({}, "no-words"));
      const nothingAtAll = await gatheredSteady(new mock.MockPromptExecutor(() => ({ response: "", toolCalls: [] })).stream({}, "nothing"));
      return {
        withWords: all,
        theArgumentsAreNotCopied: (await drained(executor.stream({}).fullStream)).pieces.find((piece) => piece.type === "tool-call").args === args && (await executor.stream({}).response).messages[0].content[1].args === args,
        withoutWords,
        nothingAtAll,
      };
    },
  },
  {
    name: "the stand-in executor, told to fail, sends what it was asked, then the error as a piece, then throws it, and never says it finished",
    run: async ({ mock }) => {
      const failure = new Error("the provider hung up");
      const toolCalls = [{ toolCallId: "call-1", toolName: "Shell", args: { command: "ls" } }];
      const run = async (options, atMost = 40) => {
        const all = await gathered(new mock.MockPromptExecutor(() => options).stream({}, "failing"), atMost);
        const sent = all.fullStream.pieces.find((piece) => piece.type === "error");
        return {
          pieces: all.fullStream.pieces.map((piece) => (piece.type === "text-delta" ? piece.textDelta : piece.type)),
          ...("stoppedByTheScenarioAfter" in all.fullStream ? { neverEnds: `stopped by the scenario after ${all.fullStream.stoppedByTheScenarioAfter} pieces` } : {}),
          theErrorSentIsTheOneGiven: sent?.error === options.simulateError,
          theErrorThrownIsTheOneGiven: all.fullStream.threw === options.simulateError,
          theAnswerHoldsTheOneGiven: all.response.resolved.error === options.simulateError,
          answer: steady({ ...all.response.resolved, error: "left out here" }),
          usage: all.usage,
          extendedUsage: all.extendedUsage,
          providerMetadata: all.providerMetadata,
          invocationId: all.invocationId,
        };
      };
      return {
        "an error after words": await run({ response: "abcdef", chunkSize: 4, simulateError: failure }),
        "an error after words and a tool call": await run({ response: "abcdef", chunkSize: 2, toolCalls, simulateError: failure }),
        "an error with no words": await run({ response: "", simulateError: failure }),
        "an error with pieces without end": await run({ response: "abc", chunkSize: Infinity, simulateError: failure }),
        "an error with pieces of no size": await run({ response: "abc", chunkSize: 0, simulateError: failure }, 12),
        "a word for an error": await run({ response: "ab", chunkSize: 1, simulateError: "a word thrown as it is" }),
        "what counts for no is no error": await casesInTurn({ "zero": 0, "an empty word": "", "false": false, "nothing": null }, async (simulateError) => {
          const all = await gatheredSteady(new mock.MockPromptExecutor(() => ({ response: "a", simulateError })).stream({}, "not failing"));
          return { pieces: all.fullStream.pieces.map((piece) => piece.type), answerFields: Object.keys(all.response.resolved) };
        }),
        asSentAndKept: await gatheredSteady(new mock.MockPromptExecutor(() => ({ response: "ab", chunkSize: 1, simulateError: failure })).stream({}, "failing")),
      };
    },
  },
  {
    name: "the stand-in executor waits before every piece when a delay is asked, and not at all otherwise",
    run: async ({ mock }) => {
      const toolCalls = [{ toolCallId: "call-1", toolName: "Shell", args: { a: 1 } }];
      const counted = (options) =>
        waitsOf(3, async () => {
          const all = await drained(new mock.MockPromptExecutor(() => options).stream({}).fullStream);
          return { pieces: all.pieces.map((piece) => piece.type), ended: "threw" in all ? "by throwing" : "by itself" };
        });
      return {
        "a delay, words in two pieces": await counted({ response: "abcd", chunkSize: 2, streamDelay: 3 }),
        "a delay, words and a tool call": await counted({ response: "ab", chunkSize: 2, toolCalls, streamDelay: 3 }),
        "a delay and an error": await counted({ response: "ab", chunkSize: 1, streamDelay: 3, simulateError: "stop" }),
        "a delay and nothing to send": await counted({ response: "", streamDelay: 3 }),
        "no delay": await counted({ response: "abcd", chunkSize: 2, streamDelay: 0 }),
        "a delay below zero": await counted({ response: "abcd", chunkSize: 2, streamDelay: -3 }),
        "a delay that is not a number": await counted({ response: "abcd", chunkSize: 2, streamDelay: NaN }),
      };
    },
  },
  {
    name: "the stand-in executor reads its options when the stream is asked for, makes its answer then, and sends nothing until the stream is read",
    run: async ({ mock }) => {
      let response = "first";
      const executor = new mock.MockPromptExecutor(() => ({ response, chunkSize: 100 }));
      const early = executor.stream({}, "early");
      response = "second";
      const late = executor.stream({}, "late");
      const texts = (pieces) => pieces.filter((piece) => piece.type === "text-delta").map((piece) => piece.textDelta);
      const earlyResponse = await early.response;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const earlyPieces = (await drained(early.fullStream)).pieces;
      const unread = executor.stream({}, "never read");
      return {
        early: texts(earlyPieces),
        late: texts((await drained(late.fullStream)).pieces),
        earlyResponseText: earlyResponse.messages[0].content[0].text,
        theAnswerIsDatedBeforeTheStreamIsRead: earlyPieces.at(-1).response.timestamp.getTime() - earlyResponse.timestamp.getTime() >= 15,
        aStreamNeverReadStillAnswers: steady(await unread.response),
        aStreamAsksTheExecutorsOwnOptions: await (async () => {
          const replaced = new mock.MockPromptExecutor(() => ({ response: "from the function given" }));
          replaced.options = () => ({ response: "from options put on the executor", toolCalls: [], streamDelay: 0, chunkSize: 100, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, maxTokens: 5 }, simulateError: undefined });
          const result = replaced.stream({}, "replaced");
          return { texts: texts((await drained(result.fullStream)).pieces), usage: await result.usage, extendedUsage: await result.extendedUsage };
        })(),
        aStreamCanBeStoppedEarly: await (async () => {
          const stream = executor.stream({}).fullStream;
          const first = await stream.next();
          const stopped = await stream.return("stopped");
          const after = await stream.next();
          return [first, stopped, after];
        })(),
      };
    },
  },
  {
    name: "the stand-in executor's tool calls that cannot be sent: no arguments, or a list that is none",
    run: async ({ mock }) => {
      const run = (options) => gatheredSteady(new mock.MockPromptExecutor(() => options).stream({}, "odd"));
      return {
        "a call without arguments": await run({ response: "a", toolCalls: [{ toolCallId: "call-1", toolName: "Shell" }] }),
        "a call that is nothing": await run({ response: "a", toolCalls: [null] }),
        "a number for the list": await run({ response: "a", toolCalls: 5 }),
        "a function for the arguments": await run({ response: "", toolCalls: [{ toolCallId: "call-1", toolName: "Shell", args: () => {} }] }),
      };
    },
  },
  {
    name: "createMockPromptExecutor asks its function at every stream, as a script of answers does",
    run: async ({ mock }) => {
      const script = [{ toolName: "Shell", args: { command: "pwd" } }, { toolCallId: "given", toolName: "Read", args: { path: "/a" } }];
      let at = 0;
      const executor = mock.createMockPromptExecutor(() => {
        const call = script[at];
        at += 1;
        return call === undefined ? { response: "", toolCalls: [] } : { response: "", toolCalls: [{ toolCallId: call.toolCallId ?? `mock-tool-${at}`, toolName: call.toolName, args: call.args }] };
      });
      const turns = [];
      for (let turn = 0; turn < 3; turn += 1) {
        const all = await gatheredSteady(executor.stream({}, `turn-${turn}`));
        turns.push({ pieces: all.fullStream.pieces.map((piece) => (piece.type === "tool-call" ? piece : piece.type)), message: all.response.resolved.messages[0] });
      }
      const words = mock.createMockPromptExecutor(() => ({ response: "Hello there, friend.", chunkSize: 8 }));
      const second = { role: "user", content: "kept" };
      const chained = words.appendMessages(second) === words;
      return {
        turns,
        words: (await drained(words.stream({}).fullStream)).pieces.filter((piece) => piece.type === "text-delta").map((piece) => piece.textDelta),
        ofItsClass: executor instanceof mock.MockPromptExecutor,
        chained,
        messages: words.getMessages(),
        state: words.getState(),
        afterClearing: [words.clearMessages(), words.getMessages()],
        asKept: mock.createMockPromptExecutor(() => ({})),
        withNoFunction: attempt(() => mock.createMockPromptExecutor().stream({})),
        whenTheFunctionFails: attempt(() => {
          try {
            mock.createMockPromptExecutor(() => {
              throw new Error("the options could not be read");
            }).stream({});
          } catch (error) {
            return `threw: ${error.message}`;
          }
          return "nothing thrown";
        }),
      };
    },
  },
  {
    name: "the stand-in executor and its builder keep the messages they are started with",
    run: ({ mock, base }) => {
      const first = { role: "system", content: "You are a stand-in." };
      const second = { role: "user", content: "Hello" };
      const builder = new mock.MockPromptBuilder([first]);
      builder.appendMessages(second);
      return {
        starts: cases({ "no message": [undefined], "one message": [undefined, first], "a list": [() => ({}), [first, second]], "an empty list": [undefined, []], "nothing for a message": [undefined, null] }, (given) => new mock.MockPromptExecutor(...given).getMessages()),
        theBuilder: { messages: builder.getMessages(), aBuilder: builder instanceof base.BasePromptBuilder, asKept: builder },
        theExecutorIsABaseExecutor: new mock.MockPromptExecutor() instanceof base.BasePromptExecutor,
      };
    },
  },

  // ── Pictures made small enough before a prompt goes out ──
  {
    name: "four messages have their pictures looked at at a time",
    run: ({ pictures }) => pictures.IMAGE_RESIZE_CONCURRENCY,
  },
  {
    name: "a message that is neither the person's nor a tool's, or whose content is no list, comes back itself",
    run: async ({ pictures }) => {
      const small = bmp(2, 2);
      return casesInTurn(
        {
          "a system message": { role: "system", content: "Be brief." },
          "an assistant's message holding a picture": { role: "assistant", content: [picturePiece(small, "image/png")] },
          "a message of no role holding a picture": { content: [picturePiece(small, "image/png")] },
          "a message of an unknown role": { role: "developer", content: [picturePiece(small, "image/png")] },
          "a role in capitals": { role: "USER", content: [picturePiece(small, "image/png")] },
          "the person's words": { role: "user", content: "Look at this." },
          "the person's empty words": { role: "user", content: "" },
          "the person's message with no content": { role: "user" },
          "the person's message with nothing for content": { role: "user", content: null },
          "the person's message with an object for content": { role: "user", content: { type: "image", image: small } },
          "the person's message with an empty list": { role: "user", content: [] },
          "a tool's words": { role: "tool", content: "done" },
          "a tool's message with no content": { role: "tool" },
          "a tool's message with an object for content": { role: "tool", content: { type: "tool-result", experimental_content: [pictureItem(small, "image/png")] } },
          "a tool's message with an empty list": { role: "tool", content: [] },
        },
        (message) => oneMessage(pictures, message),
      );
    },
  },
  {
    name: "in the person's message, only a piece that is an image held as bytes is looked at",
    run: async ({ pictures }) => {
      const small = bmp(2, 2);
      return casesInTurn(
        {
          "words": userWith({ type: "text", text: "hello" }),
          "a picture by its address": userWith({ type: "image", image: "https://example.com/a.png", mimeType: "image/png" }),
          "a picture as an address object": userWith({ type: "image", image: new URL("https://example.com/a.png") }),
          "a picture as base64 words": userWith({ type: "image", image: base64(small), mimeType: "image/bmp" }),
          "a picture as a list of numbers": userWith({ type: "image", image: Array.from(small), mimeType: "image/bmp" }),
          "a picture as raw memory": userWith({ type: "image", image: small.buffer, mimeType: "image/bmp" }),
          "a picture as bytes of another width": userWith({ type: "image", image: new Uint16Array(4), mimeType: "image/bmp" }),
          "a picture with no bytes at all": userWith({ type: "image" }),
          "a file held as bytes": userWith({ type: "file", data: small, image: small, mimeType: "image/bmp" }),
          "a piece of no kind held as bytes": userWith({ image: small, mimeType: "image/bmp" }),
          "words then a picture by its address": userWith({ type: "text", text: "see" }, { type: "image", image: "data:image/png;base64,AAAA" }),
        },
        (message) => oneMessage(pictures, message),
      );
    },
  },
  {
    name: "a small picture whose kind is rightly named stays in the person's message, which comes back itself",
    run: async ({ pictures }) => {
      const inside = new Uint8Array(100);
      inside.set(bmp(2, 2), 20);
      return casesInTurn(
        {
          "a bitmap": userWith(picturePiece(bmp(2, 2), "image/bmp")),
          "a PNG": userWith(picturePiece(png(2, 2), "image/png")),
          "a PNG 1024 wide": userWith(picturePiece(png(1024, 1), "image/png")),
          "a bitmap 1024 high": userWith(picturePiece(bmp(1, 1024), "image/bmp")),
          "a WebP that says it is 1280 wide": userWith(picturePiece(webp(1280, 1280), "image/webp")),
          "a bitmap held as a Buffer": userWith(picturePiece(Buffer.from(bmp(2, 2)), "image/bmp")),
          "a bitmap held in the middle of other bytes": userWith(picturePiece(inside.subarray(20, 90), "image/bmp")),
          "words, a picture, words": userWith({ type: "text", text: "before" }, picturePiece(png(3, 1), "image/png"), { type: "text", text: "after" }),
        },
        (message) => oneMessage(pictures, message),
      );
    },
  },
  {
    name: "a small picture whose kind is wrongly named, or not named, is given its kind in a new message, and a line says it was resized",
    run: async ({ pictures }) => {
      const message = userWith({ type: "text", text: "before" }, picturePiece(bmp(2, 2), "image/png"), { type: "text", text: "after" });
      message.id = "message-1";
      message.providerOptions = { cache: true };
      const whole = await oneMessage(pictures, message);
      const after = await pictures.resizeImagesInMessage(listening().context, message);
      return {
        whole,
        theBytesAreTheSame: Buffer.compare(Buffer.from(after.content[1].image), Buffer.from(message.content[1].image)) === 0,
        butNotTheSameMemory: after.content[1].image !== message.content[1].image && after.content[1].image.buffer !== message.content[1].image.buffer,
        theMessageThatWentInIsUntouched: message.content[1].mimeType === "image/png" && message.content.length === 3,
        kinds: await casesInTurn(
          {
            "a bitmap named a PNG": userWith(picturePiece(bmp(2, 2), "image/png")),
            "a PNG named a JPEG": userWith(picturePiece(png(2, 2), "image/jpeg")),
            "a PNG with no kind": userWith(picturePiece(png(2, 2))),
            "a PNG with nothing for a kind": userWith(picturePiece(png(2, 2), null)),
            "a PNG named in capitals": userWith(picturePiece(png(2, 2), "IMAGE/PNG")),
            "a WebP named a PNG": userWith(picturePiece(webp(10, 10), "image/png")),
            "a bitmap held as a Buffer, named a PNG": userWith(picturePiece(Buffer.from(bmp(2, 2)), "image/png")),
            "a piece whose fields come in another order": userWith({ mimeType: "image/png", note: "kept", image: bmp(2, 2), type: "image", providerOptions: { detail: "low" } }),
            "two pictures, the second rightly named": userWith(picturePiece(bmp(2, 2), "image/png"), picturePiece(bmp(3, 1), "image/bmp")),
          },
          (given) => oneMessage(pictures, given),
        ),
      };
    },
  },
  {
    name: "a bitmap wider or higher than 1024 is made 1024 at most, the same bytes on every machine",
    run: async ({ pictures }) =>
      casesInTurn(
        {
          "1025 wide": userWith(picturePiece(bmp(1025, 1), "image/bmp")),
          "1025 high": userWith(picturePiece(bmp(1, 1025), "image/bmp")),
          "1300 wide and 7 high, named a PNG": userWith(picturePiece(bmp(1300, 7), "image/png")),
          "1024 wide stays": userWith(picturePiece(bmp(1024, 2), "image/bmp")),
        },
        (message) => oneMessage(pictures, message),
      ),
  },
  {
    name: "a PNG wider than 1024 is written out again as a PNG 1024 wide",
    run: async ({ pictures }) => {
      const message = userWith(picturePiece(png(1300, 7), "image/png"));
      const { context, lines } = listening();
      const after = await pictures.resizeImagesInMessage(context, message);
      const made = after.content[0];
      return {
        aNewMessage: after !== message,
        fields: Object.keys(made),
        kind: made.mimeType,
        held: made.image.constructor.name,
        size: pngSize(made.image),
        smallerThanItWas: made.image.length < message.content[0].image.length,
        lines: lines.map((line) => ({ ...line, metadata: { ...line.metadata, newSize: line.metadata.newSize === made.image.length ? "the size of what came back" : line.metadata.newSize } })),
      };
    },
  },
  {
    name: "a bitmap of more than a mebibyte is made smaller, a fifth at a time, until it is under",
    run: async ({ pictures }) => {
      const large = bmp(1024, 342);
      return {
        bytesBefore: large.length,
        overAMebibyteBy: large.length - MEBIBYTE,
        inThePersonsMessage: await oneMessage(pictures, userWith({ type: "text", text: "a large one" }, picturePiece(large, "image/bmp"))),
        inAToolsResult: await oneMessage(pictures, toolWith([{ type: "text", text: "a large one" }, pictureItem(large, "image/bmp")])),
      };
    },
  },
  {
    name: "bytes that are no picture stay in the person's message with a line for the error, up to a mebibyte; above it they are replaced by words",
    run: async ({ pictures }) =>
      casesInTurn(
        {
          "sixteen bytes": userWith(picturePiece(noPicture(16), "image/png")),
          "no bytes": userWith(picturePiece(new Uint8Array(0), "image/png")),
          "one byte under a mebibyte": userWith(picturePiece(new Uint8Array(MEBIBYTE - 1), "image/png")),
          "a mebibyte": userWith(picturePiece(new Uint8Array(MEBIBYTE), "image/png")),
          "one byte over a mebibyte": userWith({ type: "text", text: "see" }, { type: "image", image: new Uint8Array(MEBIBYTE + 1), mimeType: "image/png", providerOptions: { detail: "high" } }),
          "over a mebibyte, no kind named": userWith(picturePiece(new Uint8Array(MEBIBYTE + 2))),
          "over a mebibyte, nothing for a kind": userWith(picturePiece(new Uint8Array(MEBIBYTE + 3), null)),
          "over a mebibyte, an empty kind": userWith(picturePiece(new Uint8Array(MEBIBYTE + 4), "")),
          "over a mebibyte, a number for a kind": userWith(picturePiece(new Uint8Array(MEBIBYTE + 5), 0)),
          "a WebP that says it is 1281 wide": userWith(picturePiece(webp(1281, 10), "image/webp")),
          "a WebP of more than a mebibyte": userWith(picturePiece(padded(webp(10, 10), MEBIBYTE + 6), "image/webp")),
          "a good picture, bytes that are none, a good picture": userWith(picturePiece(bmp(2, 2), "image/bmp"), picturePiece(noPicture(40), "image/bmp"), picturePiece(png(2, 2), "image/png")),
          "a wrongly named picture, then bytes that are none": userWith(picturePiece(bmp(2, 2), "image/png"), picturePiece(noPicture(40), "image/bmp")),
        },
        (message) => oneMessage(pictures, message),
      ),
  },
  {
    name: "when the log refuses the line that says a picture was resized, the picture is handled as one that failed",
    run: async ({ pictures }) => {
      const refusingResized = { failing: (entry) => entry.level === "info" };
      const refusingAll = { failing: () => true };
      return {
        "the person's small picture, wrongly named": await oneMessage(pictures, userWith(picturePiece(bmp(2, 2), "image/png")), refusingResized),
        "the person's bitmap of more than a mebibyte": await oneMessage(pictures, userWith(picturePiece(bmp(1024, 342), "image/bmp")), refusingResized),
        "a tool's small picture, wrongly named": await oneMessage(pictures, toolWith([pictureItem(bmp(2, 2), "image/png"), { type: "text", text: "kept" }]), refusingResized),
        "a tool's bitmap of more than a mebibyte": await oneMessage(pictures, toolWith([pictureItem(bmp(1024, 342), "image/bmp")]), refusingResized),
        "the person's picture, the log refusing every line": await attemptLater(async () => {
          try {
            return await oneMessage(pictures, userWith(picturePiece(bmp(2, 2), "image/png")), refusingAll);
          } catch (error) {
            return `failed: ${error.message}`;
          }
        }),
        "a tool's picture, the log refusing every line": await attemptLater(async () => {
          try {
            return await oneMessage(pictures, toolWith([pictureItem(bmp(2, 2), "image/png")]), refusingAll);
          } catch (error) {
            return `failed: ${error.message}`;
          }
        }),
        "bytes that are no picture, the log refusing the error's line": await attemptLater(async () => {
          try {
            return await oneMessage(pictures, userWith(picturePiece(noPicture(16), "image/png")), refusingAll);
          } catch (error) {
            return `failed: ${error.message}`;
          }
        }),
      };
    },
  },
  {
    name: "pieces added to the person's message while its pictures are looked at are looked at too",
    run: async ({ pictures }) => {
      const message = userWith(picturePiece(bmp(2, 2), "image/png"));
      let added = 0;
      const { context, lines } = listening({
        onLine: () => {
          if (added < 2) {
            added += 1;
            message.content.push(added === 1 ? picturePiece(bmp(3, 1), "image/png") : { type: "text", text: "added last" });
          }
        },
      });
      const after = await pictures.resizeImagesInMessage(context, message);
      return { piecesThatWentIn: message.content.length, piecesThatCameBack: after.content.length, kinds: after.content.map((piece) => piece.mimeType ?? piece.type), lines: lines.map((line) => line.metadata) };
    },
  },
  {
    name: "what stands in the person's list in place of a piece, or in place of a message: nothing is refused by JavaScript, a word is passed over",
    run: async ({ pictures }) =>
      casesInTurn(
        {
          "nothing in the list": userWith(null),
          "a gap in the list": { role: "user", content: [, { type: "text", text: "after a gap" }] },
          "a word in the list": userWith("only a word"),
          "no message": undefined,
          "nothing for a message": null,
          "a word for a message": "user",
        },
        async (message) => {
          let pending;
          try {
            pending = pictures.resizeImagesInMessage(listening().context, message);
          } catch (error) {
            return { threwAtOnce: error?.constructor?.name };
          }
          const answersLater = pending instanceof Promise;
          return { answersLater, ...(await attemptLater(async () => ({ answer: messageTold(message, await pending) }))) };
        },
      ),
  },
  {
    name: "in a tool's message, only the image items of a tool result's content that hold base64 words are looked at",
    run: async ({ pictures }) => {
      const small = bmp(2, 2);
      return casesInTurn(
        {
          "a result with no content of that kind": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-0", result: "done" }] },
          "a result whose content is words": { role: "tool", content: [{ type: "tool-result", toolCallId: "call-0", experimental_content: "words" }] },
          "a result whose content is an empty list": toolWith([]),
          "a piece of another kind holding a picture": { role: "tool", content: [{ type: "text", experimental_content: [pictureItem(small, "image/png")] }] },
          "a piece of no kind holding a picture": { role: "tool", content: [{ experimental_content: [pictureItem(small, "image/png")] }] },
          "words in a result": toolWith([{ type: "text", text: "the file" }]),
          "a picture held as bytes": toolWith([{ type: "image", data: small, mimeType: "image/bmp" }]),
          "a picture with no data": toolWith([{ type: "image", mimeType: "image/bmp" }]),
          "a picture under another name": toolWith([{ type: "image", image: base64(small), mimeType: "image/bmp" }]),
          "an item of another kind holding base64 words": toolWith([{ type: "file", data: base64(small), mimeType: "image/png" }]),
          "an item of no kind holding base64 words": toolWith([{ data: base64(small), mimeType: "image/png" }]),
        },
        (message) => oneMessage(pictures, message),
      );
    },
  },
  {
    name: "a small picture in a tool's result stays when its kind is rightly named, and is given its kind in a new message otherwise",
    run: async ({ pictures }) => {
      const message = toolWith([{ type: "text", text: "before" }, pictureItem(bmp(2, 2), "image/png"), { type: "text", text: "after" }], [{ type: "text", text: "another result" }]);
      message.id = "tool-message-1";
      message.content[0].isError = false;
      const whole = await oneMessage(pictures, message);
      const spaced = base64(bmp(2, 2)).replace(/(.{20})/g, "$1\n");
      return {
        whole,
        theMessageThatWentInIsUntouched: message.content[0].experimental_content[1].mimeType === "image/png",
        cases: await casesInTurn(
          {
            "a bitmap rightly named": toolWith([pictureItem(bmp(2, 2), "image/bmp")]),
            "a PNG rightly named": toolWith([pictureItem(png(2, 2), "image/png")]),
            "a WebP rightly named": toolWith([pictureItem(webp(1280, 1280), "image/webp")]),
            "a bitmap rightly named, its base64 broken into lines": toolWith([{ type: "image", data: spaced, mimeType: "image/bmp" }]),
            "a bitmap named a PNG, its base64 broken into lines": toolWith([{ type: "image", data: spaced, mimeType: "image/png" }]),
            "a PNG with no kind": toolWith([pictureItem(png(2, 2))]),
            "a PNG with nothing for a kind": toolWith([pictureItem(png(2, 2), null)]),
            "an item whose fields come in another order": toolWith([{ mimeType: "image/png", note: "kept", data: base64(bmp(2, 2)), type: "image" }]),
            "three results, pictures to rename in the first and the last": toolWith([pictureItem(bmp(2, 2), "image/png")], [pictureItem(bmp(3, 1), "image/bmp")], [{ type: "text", text: "words" }, pictureItem(png(2, 2), "image/jpeg"), pictureItem(png(3, 1), "image/png"), pictureItem(bmp(4, 1), "image/gif")]),
            "a result of words between two results with pictures": { role: "tool", content: [toolWith([pictureItem(bmp(2, 2), "image/png")]).content[0], { type: "text", text: "between" }, { ...toolWith([pictureItem(png(2, 2))]).content[0], toolCallId: "call-2" }] },
          },
          (given) => oneMessage(pictures, given),
        ),
      };
    },
  },
  {
    name: "a bitmap wider than 1024 in a tool's result is made 1024 wide, and the line says where it was",
    run: async ({ pictures }) => oneMessage(pictures, toolWith([{ type: "text", text: "first" }], [{ type: "text", text: "a wide one follows" }, pictureItem(bmp(1025, 1), "image/bmp")])),
  },
  {
    name: "base64 words that are no picture stay in a tool's result with a line for the error, up to a mebibyte; above it they are replaced by words",
    run: async ({ pictures }) =>
      casesInTurn(
        {
          "sixteen bytes": toolWith([pictureItem(noPicture(16), "image/png")]),
          "empty data": toolWith([{ type: "image", data: "", mimeType: "image/png" }]),
          "words that are not base64": toolWith([{ type: "image", data: "!!! not base64 ???", mimeType: "image/png" }]),
          "an address that holds the picture": toolWith([{ type: "image", data: `data:image/bmp;base64,${base64(bmp(2, 2))}`, mimeType: "image/bmp" }]),
          "a mebibyte": toolWith([pictureItem(new Uint8Array(MEBIBYTE), "image/png")]),
          "one byte over a mebibyte": toolWith([{ type: "text", text: "see" }, { type: "image", data: base64(new Uint8Array(MEBIBYTE + 1)), mimeType: "image/png", note: "dropped with it" }]),
          "over a mebibyte, no kind named": toolWith([pictureItem(new Uint8Array(MEBIBYTE + 2))]),
          "over a mebibyte, nothing for a kind": toolWith([pictureItem(new Uint8Array(MEBIBYTE + 3), null)]),
          "over a mebibyte, an empty kind": toolWith([pictureItem(new Uint8Array(MEBIBYTE + 4), "")]),
          "a WebP that says it is 1281 high": toolWith([pictureItem(webp(10, 1281), "image/webp")]),
          "in the second result, the third item": toolWith([{ type: "text", text: "first" }], [{ type: "text", text: "a" }, pictureItem(bmp(2, 2), "image/bmp"), pictureItem(noPicture(40), "image/bmp")]),
          "a wrongly named picture, then bytes that are none": toolWith([pictureItem(bmp(2, 2), "image/png"), pictureItem(noPicture(40), "image/bmp")]),
        },
        (message) => oneMessage(pictures, message),
      ),
  },
  {
    name: "base64 words that cannot be read at all leave their item as it is, with a line for the error, and the items after it are still looked at",
    run: async ({ pictures }) => {
      const unreadable = "these words stand for data whose reading fails";
      const real = Buffer.from;
      // Reading base64 words never fails in Node; the stand-in fails for these words alone, to show what the part does if it did.
      Buffer.from = function (...given) {
        if (given[0] === unreadable) throw new Error("the data could not be read");
        return real.apply(this, given);
      };
      try {
        return {
          "alone": await oneMessage(pictures, toolWith([{ type: "image", data: unreadable, mimeType: "image/png" }])),
          "before a picture to rename": await oneMessage(pictures, toolWith([{ type: "text", text: "first result" }], [{ type: "image", data: unreadable, mimeType: "image/png" }, pictureItem(bmp(2, 2), "image/png")])),
        };
      } finally {
        Buffer.from = real;
      }
    },
  },
  {
    name: "results and items added to a tool's message while its pictures are looked at",
    run: async ({ pictures }) => {
      const run = async (grow) => {
        const message = toolWith([pictureItem(bmp(2, 2), "image/png")]);
        let grown = false;
        const { context, lines } = listening({
          onLine: () => {
            if (grown) return;
            grown = true;
            grow(message);
          },
        });
        const after = await pictures.resizeImagesInMessage(context, message);
        return {
          resultsThatWentIn: message.content.length,
          resultsThatCameBack: after.content.length,
          items: after.content.map((piece) => piece.experimental_content.map((item) => item.mimeType ?? item.type)),
          lines: lines.map((line) => line.metadata),
        };
      };
      return {
        "an item added to the result being looked at": await run((message) => message.content[0].experimental_content.push(pictureItem(bmp(3, 1), "image/png"))),
        "a result with a picture to rename added to the message": await run((message) => message.content.push({ type: "tool-result", toolCallId: "call-added", experimental_content: [pictureItem(bmp(3, 1), "image/png")] })),
        "a result with a rightly named picture added to the message": await run((message) => message.content.push({ type: "tool-result", toolCallId: "call-added", experimental_content: [pictureItem(bmp(3, 1), "image/bmp")] })),
      };
    },
  },
  {
    name: "a message changed by someone else while its pictures are looked at: what is read again afterwards, and what is not",
    run: async ({ pictures }) => {
      /** Runs `change` once, when the first line is written. */
      const changingOnce = (change) => {
        let changed = false;
        return listening({
          onLine: () => {
            if (changed) return;
            changed = true;
            change();
          },
        });
      };
      const kinds = (list) => list.map((piece) => piece.mimeType ?? piece.text ?? piece.type);

      // The person's message is given another list of pieces: the walk goes on over the list it began with.
      const person = userWith(picturePiece(bmp(2, 2), "image/png"), picturePiece(bmp(3, 1), "image/png"));
      const forPerson = changingOnce(() => {
        person.content = [{ type: "text", text: "put in its place" }];
        person.note = "added meanwhile";
      });
      const personAfter = await pictures.resizeImagesInMessage(forPerson.context, person);

      // A tool's message is given another list of results: the results after the one being looked at are taken from the new list.
      const tool = toolWith([pictureItem(bmp(2, 2), "image/png")], [pictureItem(bmp(3, 1), "image/png")]);
      const forTool = changingOnce(() => {
        tool.content = [{ type: "text", text: "first of the new list" }, { type: "tool-result", toolCallId: "new-1", experimental_content: [pictureItem(bmp(4, 1), "image/png")] }, { type: "tool-result", toolCallId: "new-2", experimental_content: [pictureItem(bmp(1, 5), "image/png")] }];
      });
      const toolAfter = await pictures.resizeImagesInMessage(forTool.context, tool);

      // A result is given another list of items: the items after the one being looked at are taken from the new list.
      const result = toolWith([pictureItem(bmp(2, 2), "image/png"), { type: "text", text: "second of the first list" }]);
      const forResult = changingOnce(() => {
        result.content[0].experimental_content = [{ type: "text", text: "first of the new list" }, pictureItem(bmp(4, 1), "image/png"), pictureItem(bmp(1, 5), "image/png")];
      });
      const resultAfter = await pictures.resizeImagesInMessage(forResult.context, result);

      // A picture's bytes and kind changed right after the call: the copy made at the call is the one made smaller, but the size and kind compared and written are read afterwards.
      const swapped = userWith(picturePiece(bmp(2, 2), "image/bmp"));
      const forSwapped = listening();
      const swappedPending = pictures.resizeImagesInMessage(forSwapped.context, swapped);
      swapped.content[0].image = bmp(3, 1);
      const swappedAfter = await swappedPending;

      const renamed = toolWith([pictureItem(bmp(2, 2), "image/bmp")]);
      const forRenamed = listening();
      const renamedPending = pictures.resizeImagesInMessage(forRenamed.context, renamed);
      renamed.content[0].experimental_content[0].mimeType = "image/tiff";
      renamed.content[0].experimental_content[0].note = "added meanwhile";
      const renamedAfter = await renamedPending;

      return {
        "the person's list replaced": { fields: Object.keys(personAfter), content: kinds(personAfter.content), lines: forPerson.lines.map((line) => line.metadata) },
        "a tool's list of results replaced": { content: toolAfter.content.map((piece) => (Array.isArray(piece.experimental_content) ? { toolCallId: piece.toolCallId, items: kinds(piece.experimental_content) } : piece)), lines: forTool.lines.map((line) => line.metadata) },
        "a result's list of items replaced": { items: kinds(resultAfter.content[0].experimental_content), lines: forResult.lines.map((line) => line.metadata) },
        "a picture's bytes swapped right after the call": { answer: userTold(swapped, swappedAfter), lines: forSwapped.lines.map((line) => line.metadata) },
        "a tool's picture renamed right after the call": { answer: toolTold(renamed, renamedAfter), lines: forRenamed.lines.map((line) => line.metadata) },
      };
    },
  },
  {
    name: "what stands in a tool's lists in place of a piece: nothing is refused by JavaScript, a word is passed over",
    run: async ({ pictures }) =>
      casesInTurn(
        {
          "nothing in the list of results": { role: "tool", content: [null] },
          "a gap in the list of results": { role: "tool", content: [, toolWith([]).content[0]] },
          "a word in the list of results": { role: "tool", content: ["only a word"] },
          "nothing in a result's content": toolWith([null]),
          "a gap in a result's content": toolWith([, { type: "text", text: "after a gap" }]),
          "a word in a result's content": toolWith(["only a word"]),
        },
        (message) => attemptLater(async () => messageTold(message, await pictures.resizeImagesInMessage(listening().context, message))),
      ),
  },
  {
    name: "a list of messages comes back in its order, each message itself unless a picture in it changed",
    run: async ({ pictures }) => {
      const messages = [
        { role: "system", content: "Be brief." },
        userWith({ type: "text", text: "no picture" }),
        userWith(picturePiece(bmp(2, 2), "image/png")),
        { role: "assistant", content: [{ type: "text", text: "I see." }] },
        toolWith([pictureItem(png(2, 2), "image/png")]),
        toolWith([pictureItem(bmp(3, 1), "image/gif")]),
        userWith(picturePiece(noPicture(16), "image/png")),
        userWith(picturePiece(png(3, 1), "image/png")),
      ];
      const { context, lines } = listening();
      const after = await pictures.resizeImagesInMessages(context, messages);
      const none = await pictures.resizeImagesInMessages(context, []);
      const likeAList = { length: 2, 0: messages[0], 1: messages[2] };
      const fromLikeAList = await pictures.resizeImagesInMessages(listening().context, likeAList);
      return {
        aNewList: after !== messages && Array.isArray(after),
        messages: after.map((message, at) => (message === messages[at] ? "the message itself, untouched" : messageTold(messages[at], message))),
        lines: lines.map((line) => ({ level: line.level, message: line.message, metadata: line.metadata })),
        anEmptyList: none,
        somethingLikeAList: fromLikeAList.map((message, at) => (message === likeAList[at] ? "the message itself, untouched" : "another message")),
        theListThatWentInIsUntouched: messages.length === 8 && messages[2].content[0].mimeType === "image/png",
      };
    },
  },
  {
    name: "at most four messages are looked at at once, the next one taken when one is done",
    run: async ({ pictures }) => {
      const run = async (count) => {
        const events = [];
        const sizes = new Map();
        const messages = Array.from({ length: count }, (_, at) => {
          const image = bmp(1, at + 1);
          sizes.set(image.length, at);
          const message = { content: [picturePiece(image, "image/png")] };
          let taken = false;
          Object.defineProperty(message, "role", {
            enumerable: true,
            get() {
              if (!taken) events.push(`message ${at} taken`);
              taken = true;
              return "user";
            },
          });
          return message;
        });
        const { context } = listening({ onLine: (entry) => events.push(`message ${sizes.get(entry.metadata.originalSize)} done`) });
        const pending = pictures.resizeImagesInMessages(context, messages);
        const takenAtOnce = events.length;
        const after = await pending;
        let atOnce = 0;
        let most = 0;
        for (const event of events) {
          atOnce += event.endsWith("taken") ? 1 : -1;
          most = Math.max(most, atOnce);
        }
        return { takenBeforeAnyWait: takenAtOnce, mostAtOnce: most, events, allCameBack: after.length === count && after.every((message) => message.content[0].mimeType === "image/bmp") };
      };
      return { "one message": await run(1), "three messages": await run(3), "four messages": await run(4), "five messages": await run(5), "eleven messages": await run(11) };
    },
  },
  {
    name: "messages with and without pictures, looked at four at a time, write their lines in this order",
    run: async ({ pictures }) => {
      const messages = [
        userWith(picturePiece(bmp(1, 1), "image/png"), picturePiece(bmp(1, 2), "image/png"), picturePiece(bmp(1, 3), "image/png")),
        { role: "system", content: "no picture" },
        toolWith([pictureItem(bmp(1, 4), "image/png")], [pictureItem(bmp(1, 5), "image/png"), pictureItem(noPicture(21), "image/png")]),
        userWith(picturePiece(noPicture(22), "image/png")),
        userWith(picturePiece(bmp(1, 6), "image/bmp")),
        userWith({ type: "text", text: "no picture" }),
        userWith(picturePiece(bmp(1025, 1), "image/bmp")),
        toolWith([pictureItem(bmp(1, 7), "image/png")]),
        userWith(picturePiece(bmp(1, 8), "image/png")),
        userWith(picturePiece(bmp(1, 9), "image/png"), picturePiece(bmp(1, 10), "image/png")),
      ];
      const { context, lines } = listening();
      const after = await pictures.resizeImagesInMessages(context, messages);
      return {
        lines: lines.map((line) => `${line.message} ${JSON.stringify(line.metadata ?? {})}`),
        changed: after.map((message, at) => message !== messages[at]),
      };
    },
  },
  {
    name: "messages added to the list while it is looked at are looked at too",
    run: async ({ pictures }) => {
      const run = async (count, addOnLine) => {
        const messages = Array.from({ length: count }, (_, at) => userWith(picturePiece(bmp(1, at + 1), "image/png")));
        let seen = 0;
        const { context, lines } = listening({
          onLine: () => {
            seen += 1;
            if (seen === addOnLine) messages.push(userWith(picturePiece(bmp(1, 20), "image/png")), { role: "system", content: "added last" });
          },
        });
        const after = await pictures.resizeImagesInMessages(context, messages);
        return {
          wentIn: count,
          inTheListAfterwards: messages.length,
          cameBack: after.length,
          each: Array.from(after, (message, at) => (message === undefined ? "nothing" : message === messages[at] ? "the message itself, untouched" : "a new message")),
          lines: lines.map((line) => line.metadata.originalSize),
        };
      };
      return {
        "two messages, two more added when the first is done": await run(2, 1),
        "two messages, two more added when the last is done": await run(2, 2),
        "six messages, two more added when the fifth is done": await run(6, 5),
      };
    },
  },
  {
    name: "one message that cannot be looked at fails the whole list, later and not at once",
    run: async ({ pictures }) => ({
      "a failure comes later": (() => {
        try {
          const pending = pictures.resizeImagesInMessages(listening().context, [null]);
          pending.catch(() => {});
          return pending instanceof Promise ? "a promise came back" : "something else came back";
        } catch (error) {
          return `threw at once: ${error?.constructor?.name}`;
        }
      })(),
      "nothing among the messages": await attemptLater(() => pictures.resizeImagesInMessages(listening().context, [{ role: "system", content: "a" }, null, { role: "system", content: "b" }])),
      "a gap among the messages": await attemptLater(() => pictures.resizeImagesInMessages(listening().context, [, { role: "system", content: "b" }])),
      "no list": await attemptLater(() => pictures.resizeImagesInMessages(listening().context)),
      "a number for a list": await attemptLater(() => pictures.resizeImagesInMessages(listening().context, 3)),
      "a word for a list": await attemptLater(() => pictures.resizeImagesInMessages(listening().context, "ab")),
      "the log refusing every line": await attemptLater(async () => {
        try {
          return await pictures.resizeImagesInMessages(listening({ failing: () => true }).context, [userWith(picturePiece(noPicture(16), "image/png"))]);
        } catch (error) {
          return `failed: ${error.message}`;
        }
      }),
    }),
  },
  {
    name: "the wrapper reads the messages below at once, puts back the ones with their pictures made small, and only then asks the executor below for its stream",
    run: async ({ pictures, base }) => {
      const messages = [{ role: "system", content: "Be brief." }, userWith(picturePiece(bmp(2, 2), "image/png")), userWith(picturePiece(png(2, 2), "image/png"))];
      const answer = {
        fullStream: (async function* () {
          yield { type: "text-delta", textDelta: "from" };
          yield { type: "text-delta", textDelta: " below" };
        })(),
        response: Promise.resolve({ id: "response below" }),
        usage: Promise.resolve({ promptTokens: 1 }),
        providerMetadata: Promise.resolve({ provider: "below" }),
        extendedUsage: Promise.resolve({ inputTokens: 1 }),
        invocationId: Promise.resolve("id below"),
        more: "a field the wrapper does not hand on",
      };
      const { executor, calls, held } = below({ messages, answer });
      const { context, lines } = listening();
      const wrapper = new pictures.ImageResizingPromptExecutor(executor);
      const tools = [{ name: "Shell" }];
      const options = { temperature: 0 };
      const result = wrapper.stream(context, "invocation-1", tools, options);
      const callsWhenStreamAnswers = calls.map((made) => made.call);
      const all = await gathered(result);
      const stream = calls.find((made) => made.call === "stream");
      const appended = calls.find((made) => made.call === "appendMessages");
      return {
        aWrapper: wrapper instanceof base.BaseMiddleware,
        whatStreamGives: Object.keys(result),
        callsWhenStreamAnswers,
        callsInAll: calls.map((made) => ({ call: made.call, arguments: made.arguments })),
        putBack: appended.given.map((message, at) => (message === messages[at] ? "the message itself, untouched" : messageTold(messages[at], message))),
        putBackIsAListOfItsOwn: Array.isArray(appended.given) && appended.given !== messages,
        heldBelowAfterwards: held().map((message, at) => (message === messages[at] ? "the message itself, untouched" : "a new message")),
        streamBelowWasGiven: [stream.given[0] === context, stream.given[1], stream.given[2] === tools, stream.given[3] === options],
        lines: lines.map((line) => line.message),
        ...all,
      };
    },
  },
  {
    name: "the wrapper asks the executor below with four arguments whatever it was given, and hands on whatever comes back",
    run: async ({ pictures }) => {
      const run = async (given, answer) => {
        const { executor, calls } = below({ messages: [], answer });
        const result = new pictures.ImageResizingPromptExecutor(executor).stream(...given);
        const all = await gathered(result);
        const stream = calls.find((made) => made.call === "stream");
        const endings = Object.fromEntries(["response", "usage", "providerMetadata", "extendedUsage", "invocationId"].map((key) => [key, endingTold(all[key])]));
        return { calls: calls.map((made) => made.call), streamBelowWasGiven: stream === undefined ? "never asked" : { arguments: stream.arguments, given: stream.given }, kinds: all.kinds, fullStream: "threw" in all.fullStream ? { pieces: all.fullStream.pieces, threw: failureTold(all.fullStream.threw) } : all.fullStream, ...endings };
      };
      const plainAnswer = () => ({ fullStream: ["a list", "is walked too"], response: "not a promise", usage: 0, providerMetadata: null, extendedUsage: undefined, invocationId: Promise.resolve("an id") });
      return {
        "nothing given": await run([], plainAnswer()),
        "a context alone": await run(["a context"], plainAnswer()),
        "six things given": await run(["a context", "an id", ["tools"], { an: "option" }, "fifth", "sixth"], plainAnswer()),
        "an answer below that comes later": await run(["a context", "an id"], Promise.resolve(plainAnswer())),
        "an answer below with nothing in it": await run(["a context", "an id"], {}),
        "no answer below": await run(["a context", "an id"], undefined),
      };
    },
  },
  {
    name: "the wrapper asks the executor below once, whether or not its stream is read",
    run: async ({ pictures }) => {
      const { executor, calls } = below({ messages: [{ role: "system", content: "a" }], answer: () => ({ fullStream: [], response: Promise.resolve("r"), usage: Promise.resolve("u"), providerMetadata: Promise.resolve("p"), extendedUsage: Promise.resolve("e"), invocationId: Promise.resolve("i") }) });
      const wrapper = new pictures.ImageResizingPromptExecutor(executor);
      const unread = wrapper.stream(listening().context, "unread");
      const answers = [await unread.response, await unread.usage, await unread.providerMetadata, await unread.extendedUsage, await unread.invocationId];
      const afterAnUnreadStream = calls.map((made) => made.call);
      const read = wrapper.stream(listening().context, "read");
      const pieces = await drained(read.fullStream);
      const again = await drained(read.fullStream);
      // Listened to in another order than they were made: they still end in the order the wrapper made them, the stream's first piece last.
      const ended = [];
      const inOrder = wrapper.stream(listening().context, "in order");
      const firstPiece = inOrder.fullStream.next().then(() => ended.push("fullStream"));
      await Promise.all([firstPiece, ...["invocationId", "extendedUsage", "providerMetadata", "usage", "response"].map((key) => inOrder[key].then(() => ended.push(key)))]);
      return { answers, afterAnUnreadStream, pieces, readAgain: again, streamsAskedBelow: calls.filter((made) => made.call === "stream").length, eachCallGivesNewThings: unread.response !== read.response && unread.fullStream !== read.fullStream, ended };
    },
  },
  {
    name: "what fails below the wrapper fails everything the wrapper gave, and what fails at once fails at once",
    run: async ({ pictures }) => {
      const failure = new Error("the executor below could not stream");
      const streamFails = below({ messages: [userWith(picturePiece(bmp(2, 2), "image/png"))], streamFails: failure });
      const whenStreamFails = await gathered(new pictures.ImageResizingPromptExecutor(streamFails.executor).stream(listening().context, "a"));
      const sameFailure = (all) => ({ fullStream: all.fullStream.threw === failure, ...Object.fromEntries(["response", "usage", "providerMetadata", "extendedUsage", "invocationId"].map((key) => [key, all[key].rejected === failure])) });

      const badMessage = below({ messages: [{ role: "system", content: "fine" }, null] });
      const whenAMessageIsNothing = await gathered(new pictures.ImageResizingPromptExecutor(badMessage.executor).stream(listening().context, "b"));

      const readingFails = below({ messagesFail: new Error("the messages could not be read") });
      const atOnce = attempt(() => {
        try {
          new pictures.ImageResizingPromptExecutor(readingFails.executor).stream(listening().context, "c");
        } catch (error) {
          return `threw at once: ${error.message}`;
        }
        return "nothing thrown at once";
      });
      const refused = Promise.reject(failure);
      refused.catch(() => {});
      const streamBelowFails = {
        fullStream: (async function* () {
          yield { type: "text-delta", textDelta: "one piece, then" };
          throw failure;
        })(),
        response: refused,
        usage: Promise.resolve("usage"),
        providerMetadata: Promise.resolve("metadata"),
        extendedUsage: Promise.resolve("more usage"),
        invocationId: Promise.resolve("id"),
      };
      const whenTheStreamBelowBreaks = await gathered(new pictures.ImageResizingPromptExecutor(below({ answer: streamBelowFails }).executor).stream(listening().context, "d"));
      return {
        whenStreamFails: { theSameFailureEverywhere: sameFailure(whenStreamFails), callsBelow: streamFails.calls.map((made) => made.call), pieces: whenStreamFails.fullStream.pieces },
        whenAMessageIsNothing: {
          callsBelow: badMessage.calls.map((made) => made.call),
          fullStream: failureTold(whenAMessageIsNothing.fullStream.threw),
          ...Object.fromEntries(["response", "usage", "providerMetadata", "extendedUsage", "invocationId"].map((key) => [key, failureTold(whenAMessageIsNothing[key].rejected)])),
        },
        whenReadingTheMessagesFails: { atOnce, callsBelow: readingFails.calls.map((made) => made.call) },
        whenTheStreamBelowBreaks: { pieces: whenTheStreamBelowBreaks.fullStream.pieces, fullStream: whenTheStreamBelowBreaks.fullStream.threw === failure, response: whenTheStreamBelowBreaks.response.rejected === failure, usage: whenTheStreamBelowBreaks.usage },
      };
    },
  },
  {
    name: "the wrapper over the stand-in executor: the pictures are made small in the messages kept, and the stream is the stand-in's",
    run: async ({ pictures, mock }) => {
      const kept = [{ role: "system", content: "Be brief." }, userWith({ type: "text", text: "What is this?" }, picturePiece(bmp(1025, 1), "image/bmp")), toolWith([pictureItem(bmp(2, 2), "image/png")])];
      const executor = new mock.MockPromptExecutor(() => ({ response: "A blue line.", chunkSize: 6, toolCalls: [{ toolCallId: "call-1", toolName: "Read", args: { path: "/a.bmp" } }] }), kept);
      const wrapper = pictures.imageResizingMiddleware(executor);
      const { context, lines } = listening();
      const added = wrapper.appendMessages({ role: "user", content: "And this?" }) === wrapper;
      const before = wrapper.getMessages();
      const all = await gatheredSteady(wrapper.stream(context, "invocation-9", [], {}));
      const after = wrapper.getMessages();
      const second = await gatheredSteady(wrapper.stream(context));
      return {
        added,
        ...all,
        messagesAfter: after.map((message, at) => (message === before[at] ? "the message itself, untouched" : messageTold(before[at], message))),
        state: wrapper.getState().length,
        lines: lines.map((line) => ({ message: line.message, metadata: line.metadata })),
        aSecondStreamChangesNothingMore: wrapper.getMessages().every((message, at) => message === after[at]),
        aSecondStreamDrawsItsOwnId: second.invocationId,
        cleared: [wrapper.clearMessages(), wrapper.getMessages(), executor.getMessages()],
      };
    },
  },
  {
    name: "createImageResizingMiddleware gives a function that wraps an executor, and imageResizingMiddleware is one such function",
    run: ({ pictures, base }) => {
      const { executor } = below();
      const make = pictures.createImageResizingMiddleware();
      const first = make(executor);
      const second = make(executor);
      const ready = pictures.imageResizingMiddleware(executor);
      /** A wrapper of another part reaches the executor below under the name `innerExecutor`. */
      class Reaching extends pictures.ImageResizingPromptExecutor {
        belowIs(candidate) {
          return this.innerExecutor === candidate;
        }
      }
      return {
        theFunction: signature(make),
        theReadyOne: signature(pictures.imageResizingMiddleware),
        eachCallMakesAFunctionOfItsOwn: pictures.createImageResizingMiddleware() !== make && make !== pictures.imageResizingMiddleware,
        eachWrappingIsItsOwn: first !== second,
        ofItsClass: [first instanceof pictures.ImageResizingPromptExecutor, ready instanceof pictures.ImageResizingPromptExecutor, first instanceof base.BaseMiddleware],
        ownFields: Object.keys(first),
        reachedByItsName: new Reaching(executor).belowIs(executor),
        passesOn: [first.getState(), first.getMessages(), first.clearMessages(), first.appendMessages([]) === first],
        withNothingToWrap: attempt(() => make().stream({}).constructor.name),
      };
    },
  },
  {
    name: "the lines as the engine's own log writes them when a context has no backend of its own",
    run: async (_, tools) => {
      // Whether the log writes in colour is decided when the part is loaded: a load of its own, with colour refused.
      const hadNoColor = "NO_COLOR" in process.env;
      const noColorBefore = process.env.NO_COLOR;
      process.env.NO_COLOR = "1";
      const written = [];
      const real = { log: console.log, warn: console.warn, error: console.error };
      try {
        const { pictures } = await tools.fresh();
        for (const through of ["log", "warn", "error"]) console[through] = (...texts) => written.push({ through, firstLine: texts.map((text) => String(text).split("\n")[0].replace(/^\d\d:\d\d:\d\d\.\d\d\d /, "<time> ")) });
        const context = { get: (key) => key.defaultValue, getPath: () => ["turn", "pictures"] };
        await pictures.resizeImagesInMessage(context, userWith(picturePiece(bmp(2, 2), "image/png")));
        await pictures.resizeImagesInMessage(context, userWith(picturePiece(noPicture(16), "image/png")));
        await pictures.resizeImagesInMessage(context, toolWith([{ type: "text", text: "first" }, pictureItem(bmp(1025, 1), "image/bmp"), pictureItem(noPicture(16), "image/png")]));
        return written;
      } finally {
        Object.assign(console, real);
        if (hadNoColor) process.env.NO_COLOR = noColorBefore;
        else delete process.env.NO_COLOR;
      }
    },
  },
];
