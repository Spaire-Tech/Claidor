/**
 * The watch for a model that goes in circles inside one answer: the same piece of text again and again on
 * a line, or the same lines again and again, as the answer streams in. The detector is fed the text piece by
 * piece and says "stop" at one exact character; the engine then ends the turn with `AgentLoopError`, and
 * tells the model it was looping (`createLoopReminderMessage`) when it tries once more.
 *
 * What stands in for the machine, each put back when a scenario ends:
 * - the clock (`performance.now` on the global object). A still clock never moves, so nothing times out and
 *   every latency is 0. A ticking clock moves by one each time it is read, so a latency is the number of
 *   readings between two moments, and a time limit runs out at one exact reading.
 * - the context the engine hands down: an object that gives a metrics backend, a logger backend and an
 *   event tracker which only write down what they are asked.
 *
 * In the answers a text longer than 200 characters is kept as its length, its two ends and its SHA-256.
 * The texts sent to a model or shown to a person are never shortened: they are kept whole. An error the
 * runtime itself raises for a value of the wrong kind is kept by its class alone.
 */
import { createHash } from "node:crypto";

export const part = "packages/agent/loop-detection";
export const modules = {
  single: "source/packages/agent/loop-detection/single-message-loop-detector.ts",
  agent: "source/packages/agent/loop-detection/agent-loop-detector.ts",
};

// ── Stand-ins ──

/** While `run` runs, `performance.now` is the clock given. */
function withClock(clock, run) {
  const kept = Object.getOwnPropertyDescriptor(globalThis, "performance");
  Object.defineProperty(globalThis, "performance", { value: { now: () => clock.now() }, configurable: true, writable: true, enumerable: false });
  try {
    return run();
  } finally {
    if (kept) Object.defineProperty(globalThis, "performance", kept);
    else delete globalThis.performance;
  }
}

/** A clock that never moves. */
const still = () => ({ now: () => 1_000, reads: 0 });

/** A clock that starts at 0 and moves `step` each time it is read. */
function ticking(step = 1) {
  const clock = { reads: 0, now: () => step * clock.reads++ };
  return clock;
}

/** The thirteen numbers a detector is made with, as the agent sets them, each a function that notes it was read. */
const AGENT_NUMBERS = {
  multiLineLoopMinRepetitions: 2,
  multiLineLoopMinRepetitionsInCodeFence: 3,
  maxLineLength: 10_000,
  maxCheckTimeMs: 500,
  singleLineLoopMinRepetitions: 3,
  singleLineLoopMinRepetitionsInCodeFence: 4,
  singleLineLoopMinPTimesK: 100,
  singleLineLoopMinPTimesKInCodeFence: 200,
  singleLineLoopMaxP: 256,
  multiLineLoopMinPTimesK: 3,
  multiLineLoopMinPTimesKInCodeFence: 4,
  multiLineLoopMinTotalChars: 50,
  multiLineLoopMinTotalCharsInCodeFence: 100,
};
function numbers(changed = {}) {
  const read = [];
  const values = { ...AGENT_NUMBERS, ...changed };
  const config = Object.fromEntries(Object.keys(values).map((name) => [name, () => { read.push(name); return values[name]; }]));
  return { config, read, values };
}
/** Numbers under which a line's own check can never stop anything: for the scenarios about lines. */
const LINES_ONLY = { singleLineLoopMinPTimesK: 1e9, singleLineLoopMinPTimesKInCodeFence: 1e9 };
/** Numbers under which the lines' check can never stop anything: for the scenarios about one line. */
const ONE_LINE_ONLY = { multiLineLoopMinTotalChars: 1e9, multiLineLoopMinTotalCharsInCodeFence: 1e9 };

/** A text as it is kept: whole when short, otherwise what tells it apart from every other. */
function text(value) {
  if (typeof value !== "string" || value.length <= 200) return value;
  return { length: value.length, starts: value.slice(0, 24), ends: value.slice(-24), sha256: createHash("sha256").update(value, "utf8").digest("hex") };
}

/** What a call gives back, or what it throws. The runtime's own complaint about a value's kind is kept by its class. */
function attempt(run) {
  try {
    return { returned: run() };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return { threw: `a ${error.constructor.name} of the runtime's own` };
    return { threw: error };
  }
}

/** The places of a list that hold something other than 0, as [place, value]. */
const held = (list) => Object.keys(list).filter((place) => list[place] !== 0).map((place) => [place, text(list[place])]);

/** Everything a detector holds and says about itself. With `brief`, the lines it remembers are kept as a count and a SHA-256. */
function stateOf(detector, { brief = false } = {}) {
  const loop = detector.detectedSingleLineLoop;
  return {
    currentLine: text(detector.currentLine),
    insideCodeFence: detector.insideCodeFence,
    startIdx: detector.startIdx,
    lineCount: detector.lineCount,
    didTimeout: detector.didTimeout,
    detectedSingleLineLoop: loop === null ? null : { ...loop, root: text(loop.root) },
    detectedMultiLinePattern: detector.detectedMultiLinePattern === null ? null : detector.detectedMultiLinePattern.map(text),
    runsOnTheLine: held(detector.periodMatchRunLengths),
    runsOfLines: held(detector.multiLinePeriodMatchRunLengths),
    lines: brief ? { places: Object.keys(detector.lineBuffer).length, sha256: createHash("sha256").update(JSON.stringify(held(detector.lineBuffer)), "utf8").digest("hex") } : held(detector.lineBuffer),
    says: { loopDetected: detector.loopDetected(), timedOut: detector.timedOut(), singleLine: shortInfo(detector.getSingleLineLoopInfo()), multiLine: shortInfo(detector.getMultiLineLoopInfo()) },
  };
}
const shortInfo = (info) => (info === null ? null : { ...info, pattern: text(info.pattern) });
const sizesOf = (detector) => ({
  MULTI_LINE_LOOP_MIN_REPETITIONS: detector.MULTI_LINE_LOOP_MIN_REPETITIONS,
  MAX_LINE_LENGTH: detector.MAX_LINE_LENGTH,
  MAX_CHECK_TIME_MS: detector.MAX_CHECK_TIME_MS,
  MAX_LINE_QUEUE_SIZE: detector.MAX_LINE_QUEUE_SIZE,
  SINGLE_LINE_LOOP_MIN_REPETITIONS: detector.SINGLE_LINE_LOOP_MIN_REPETITIONS,
  SINGLE_LINE_LOOP_MIN_P_TIMES_K: detector.SINGLE_LINE_LOOP_MIN_P_TIMES_K,
  SINGLE_LINE_LOOP_MAX_P_LIMIT: detector.SINGLE_LINE_LOOP_MAX_P_LIMIT,
  lineBuffer: detector.lineBuffer.length,
  periodMatchRunLengths: detector.periodMatchRunLengths.length,
  multiLinePeriodMatchRunLengths: detector.multiLinePeriodMatchRunLengths.length,
});

/** A piece of `period` characters, no two the same, none a space or a box character. */
const piece = (period, from = 0) => Array.from({ length: period }, (_, at) => String.fromCharCode(0x4e00 + from + at)).join("");
/** Line number `n` of a made-up text, `length` characters long, unlike every other number's line. */
const lineOf = (n, length) => String.fromCharCode(0x5e00 + n) + "x".repeat(length - 1);

/** Fed one character at a time: the count of characters at which the detector first says stop, or null. */
function stopsAtCharacter(detector, given, caller = "scenario") {
  let fed = 0;
  for (const character of given) {
    fed += 1;
    if (detector.addText({ newText: character, caller })) return fed;
  }
  return null;
}
/** Fed one line at a time, each with its line end: the count of lines at which the detector first says stop, or null. */
function stopsAtLine(detector, lines, caller = "scenario") {
  let fed = 0;
  for (const line of lines) {
    fed += 1;
    if (detector.addText({ newText: `${line}\n`, caller })) return fed;
  }
  return null;
}
/** `count` lines that repeat `period` lines of `length` characters. */
const repeatedLines = (period, length, count) => Array.from({ length: count }, (_, at) => lineOf(at % period, length));

/** A context that hands out backends which write down what they are asked, in the order asked. */
function standInContext() {
  const events = [];
  const context = {
    get(key) {
      const wanted = key.symbol.description;
      events.push({ asked: wanted });
      if (wanted === "metricsBackend") {
        return Object.fromEntries(["record", "increment", "gauge", "histogram"].map((method) => [method, (given, handle, value, labels) => { events.push({ metric: method, theContext: given === context, handle, value, labels }); }]));
      }
      if (wanted === "loggerBackend") {
        return {
          log(given, entry) {
            events.push({ logged: { level: entry.level, message: entry.message, metadata: entry.metadata }, theContext: given === context && entry.context === context, fields: Object.keys(entry), timestampIsADate: entry.timestamp instanceof Date });
          },
        };
      }
      if (wanted === "agentEventTracker") {
        return new Proxy({}, { get: (_target, method) => (given, ...more) => { events.push({ tracked: method, theContext: given === context, more }); } });
      }
      return key.defaultValue;
    },
  };
  return { context, events };
}

/** A small generator with a fixed seed, for pieces of uneven size. */
function seeded(seed) {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return (state >>> 8) % below;
  };
}
/** A text cut into pieces of 1 to `most` characters, never inside a character. */
function inPieces(given, most, seed = 2026) {
  const next = seeded(seed);
  const characters = [...given];
  const pieces = [];
  for (let at = 0; at < characters.length; ) {
    const size = 1 + next(most);
    pieces.push(characters.slice(at, at + size).join(""));
    at += size;
  }
  return pieces;
}

/** The lines of a made-up answer that does not go in circles: headings, sentences, a list, a table, some code. */
function madeUpAnswer() {
  const subjects = ["The report", "Your calendar", "The draft", "This table", "The invoice", "Our plan", "The summary", "That meeting", "The inbox", "A reminder"];
  const verbs = ["covers", "lists", "moves", "explains", "repeats nothing about", "compares", "sorts", "names", "counts", "follows"];
  const objects = ["the first quarter", "three open questions", "every reply since Monday", "the costs by month", "what changed last week", "the people to call", "two late payments", "the next four steps", "each team's notes", "the dates to keep"];
  const lines = ["# What I found", ""];
  for (let n = 0; n < 40; n += 1) lines.push(`${subjects[n % 10]} ${verbs[(n * 3) % 10]} ${objects[(n * 7) % 10]}, point ${n + 1}.`);
  lines.push("", "## The numbers", "", "| Month | Sent | Answered |", "|-------|------|----------|");
  for (let n = 0; n < 12; n += 1) lines.push(`| ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][n]} | ${40 + n * 3} | ${31 + n * 2} |`);
  lines.push("+-------+------+----------+", "", "## The steps", "");
  for (let n = 0; n < 15; n += 1) lines.push(`${n + 1}. ${verbs[n % 10].replace(/^./, (first) => first.toUpperCase())} ${objects[(n * 3) % 10]}.`);
  lines.push("", "```js", "const totals = months.map((month) => month.sent - month.answered);", "for (const total of totals) {", "  if (total > 10) {", "    late.push(total);", "  }", "}", "```", "", "That is all of it.");
  return lines;
}

/** A made-up answer streamed through the agent's check in uneven pieces: where it stops, and what is told then. */
function streamed(agent, lines, { most = 23, seed = 2026 } = {}) {
  const { context, events } = standInContext();
  const detector = new agent.SingleMessageLoopDetector();
  const whole = lines.map((line) => `${line}\n`).join("");
  const pieces = inPieces(whole, most, seed);
  let characters = 0;
  for (let at = 0; at < pieces.length; at += 1) {
    characters += pieces[at].length;
    const before = events.length;
    const result = agent.checkForAgentSingleMessageLooping({ detector, newText: pieces[at], caller: "nal", ctx: context });
    if (result.loopDetected) {
      const fed = whole.slice(0, characters);
      return {
        lines: lines.length,
        pieces: pieces.length,
        stoppedAtPiece: at + 1,
        charactersFedByThen: characters,
        linesEndedByThen: fed.split("\n").length - 1,
        theLastPiece: pieces[at],
        result: { ...result, pattern: text(result.pattern) },
        toldAtTheStop: events.slice(before),
        checksBeforeTheStop: events.slice(0, before).filter((event) => event.metric).map((event) => event.labels.result).reduce((counts, result) => ({ ...counts, [result]: (counts[result] ?? 0) + 1 }), {}),
      };
    }
  }
  return { lines: lines.length, pieces: pieces.length, stoppedAtPiece: null, characters, checks: events.filter((event) => event.metric).map((event) => event.labels.result).reduce((counts, result) => ({ ...counts, [result]: (counts[result] ?? 0) + 1 }), {}), otherThingsTold: events.filter((event) => !event.metric && !event.asked) };
}

export const scenarios = [
  // ── The detector itself ──
  {
    name: "a detector reads six of its numbers once, as it is made, and starts empty",
    run: ({ single }) => {
      const { config, read } = numbers();
      const hooks = {};
      const detector = new single.SingleMessageLoopDetector(config, hooks);
      return {
        readInThisOrder: [...read],
        fields: Object.keys(detector),
        sizes: sizesOf(detector),
        state: stateOf(detector),
        keepsTheConfigItWasGiven: detector.config === config,
        keepsTheHooksItWasGiven: detector.hooks === hooks,
        hooksWhenNoneAreGiven: new single.SingleMessageLoopDetector(numbers().config).hooks,
        parameters: single.SingleMessageLoopDetector.length,
        methods: Object.getOwnPropertyNames(single.SingleMessageLoopDetector.prototype).sort(),
      };
    },
  },
  {
    name: "the time allowed for one piece: a number above zero is kept, anything else means no limit",
    run: ({ single }) =>
      [500, 1, 0.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, undefined, "5", "0", true, false].map((maxCheckTimeMs) => ({
        given: maxCheckTimeMs,
        kept: new single.SingleMessageLoopDetector(numbers({ maxCheckTimeMs }).config).MAX_CHECK_TIME_MS,
      })),
  },
  {
    name: "the sizes of what a detector keeps follow from two of its numbers, and some numbers cannot make a detector",
    run: ({ single }) => {
      const cases = {
        "the agent's numbers": {},
        "one repetition of lines": { multiLineLoopMinRepetitions: 1 },
        "five repetitions of lines": { multiLineLoopMinRepetitions: 5 },
        "no repetition of lines": { multiLineLoopMinRepetitions: 0 },
        "half a repetition of lines": { multiLineLoopMinRepetitions: 0.5 },
        "a hundredth of a repetition of lines": { multiLineLoopMinRepetitions: 0.01 },
        "a negative repetition of lines": { multiLineLoopMinRepetitions: -1 },
        "repetitions of lines that are no number": { multiLineLoopMinRepetitions: Number.NaN },
        "repetitions of lines given as a text": { multiLineLoopMinRepetitions: "2" },
        "no period on a line": { singleLineLoopMaxP: 0 },
        "one period on a line": { singleLineLoopMaxP: 1 },
        "a period below zero": { singleLineLoopMaxP: -1 },
        "a period further below zero": { singleLineLoopMaxP: -2 },
        "a period and a half": { singleLineLoopMaxP: 1.5 },
        "a period that is no number": { singleLineLoopMaxP: Number.NaN },
        "a period given as a text": { singleLineLoopMaxP: "3" },
        "no line length": { maxLineLength: 0 },
      };
      const made = Object.fromEntries(Object.entries(cases).map(([name, changed]) => [name, attempt(() => sizesOf(new single.SingleMessageLoopDetector(numbers(changed).config)))]));
      const missing = numbers().config;
      delete missing.singleLineLoopMaxP;
      return {
        made,
        "a config without one of the six": attempt(() => new single.SingleMessageLoopDetector(missing)),
        "a config without the seven read later is made all the same": attempt(() => sizesOf(new single.SingleMessageLoopDetector(Object.fromEntries(["maxCheckTimeMs", "multiLineLoopMinRepetitions", "maxLineLength", "singleLineLoopMinRepetitions", "singleLineLoopMinPTimesK", "singleLineLoopMaxP"].map((name) => [name, numbers().config[name]]))))),
        "no config": attempt(() => new single.SingleMessageLoopDetector()),
        "called without new": attempt(() => single.SingleMessageLoopDetector(numbers().config)),
      };
    },
  },
  {
    name: "a detector made to remember no lines, or to look at no period, never stops anything",
    run: ({ single }) =>
      withClock(still(), () => {
        const noLines = new single.SingleMessageLoopDetector(numbers({ multiLineLoopMinRepetitions: 0 }).config);
        const onLines = stopsAtLine(noLines, Array.from({ length: 8 }, () => "the same line of text, again"));
        const noPeriods = new single.SingleMessageLoopDetector(numbers({ singleLineLoopMaxP: 0 }).config);
        const onALine = stopsAtCharacter(noPeriods, "a".repeat(400));
        return {
          "no lines remembered": { stopAt: onLines, startIdx: noLines.startIdx, lineCount: noLines.lineCount, places: Object.keys(noLines.lineBuffer), ringLength: noLines.lineBuffer.length, runsOfLines: held(noLines.multiLinePeriodMatchRunLengths), lastLineReadBack: noLines.getLineAt(0) },
          "no period looked at": { stopAt: onALine, currentLineLength: noPeriods.currentLine.length, runsOnTheLine: held(noPeriods.periodMatchRunLengths) },
        };
      }),
  },
  {
    name: "numbers that are no numbers stop nothing, and numbers given as texts count as numbers",
    run: ({ single }) =>
      withClock(still(), () => {
        const onALine = (changed) => stopsAtCharacter(new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, singleLineLoopMinRepetitions: 2, singleLineLoopMinPTimesK: 6, singleLineLoopMaxP: 4, ...changed }).config), "ab".repeat(30));
        const onLines = (changed) => stopsAtLine(new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 2, multiLineLoopMinPTimesK: 3, multiLineLoopMinTotalChars: 10, ...changed }).config), repeatedLines(2, 3, 30));
        const values = { "not a number": Number.NaN, "without end": Number.POSITIVE_INFINITY, "below zero": -5, "a text": "3", "a text that is no number": "many", "null": null, "undefined": undefined, "two and a half": 2.5 };
        const table = (ask, names) => Object.fromEntries(names.map((name) => [name, Object.fromEntries(Object.entries(values).map(([label, value]) => [label, attempt(() => ask({ [name]: value }))]))]));
        return {
          "as they are": { onALine: onALine({}), onLines: onLines({}) },
          onALine: table(onALine, ["singleLineLoopMinRepetitions", "singleLineLoopMinPTimesK", "maxLineLength"]),
          onLines: table(onLines, ["multiLineLoopMinPTimesK", "multiLineLoopMinTotalChars"]),
        };
      }),
  },
  {
    name: "a line is the border of a box when four in five of its characters, spaces and tabs aside, are box characters",
    run: ({ single }) => {
      const detector = new single.SingleMessageLoopDetector(numbers().config);
      const boxCharacters = "─━═-_│┃║|┌┐└┘╔╗╚╝┏┓┗┛╓╖╙╜├┤┬┴┼╟╢╤╧╫╠╣╦╩╬╞╡╥╨╪+";
      const others = "╭╮╯╰╴╵╶╷╌╍┄┅┈┉=*~#•—–·.:;'\"`^<>/\\()[]{}0aZé \r\u{1F600}";
      const lines = [
        "", " ", "\t", " \t \t", "-", "a", "--", "-a", "---a", "----a", "a----", "-----a", "--a--a", "----aa", "--------aa", "-------aaa", "- - - - a", "\t-\t-\t-\t-\ta", "    ", "+--+--+", "+-----+-----+", "| a | b |", "|---|---|", "| - | - |",
        "═══════", "── title ──", "──── t ────", "-\r", "----\r", "---\r", " ----", " ---", "- [ ] task", "---", "___", "***", "===", "- item", "-- ", "1 + 1 = 2", "a_b_c_d_e", "______a", "|", "||", "| |", "| x", "||||x", "|||x",
      ];
      return {
        "each box character alone is a border": [...boxCharacters].filter((character) => detector.isBoxBorderLine(character)).join(""),
        "box characters that alone are not": [...boxCharacters].filter((character) => !detector.isBoxBorderLine(character)).join(""),
        "other characters that alone are a border": [...others].filter((character) => detector.isBoxBorderLine(character)).join(""),
        howManyBoxCharacters: [...boxCharacters].length,
        "of the 128 box-drawing characters (U+2500 to U+257F), those that alone are a border": Array.from({ length: 128 }, (_, at) => String.fromCharCode(0x2500 + at)).filter((character) => detector.isBoxBorderLine(character)).join(""),
        "of the 94 printable ASCII characters, those that alone are a border": Array.from({ length: 94 }, (_, at) => String.fromCharCode(0x21 + at)).filter((character) => detector.isBoxBorderLine(character)).join(""),
        lines: lines.map((line) => [line, detector.isBoxBorderLine(line)]),
        "one more ordinary character at a time, after 8 dashes": Array.from({ length: 5 }, (_, extra) => detector.isBoxBorderLine("-".repeat(8) + "a".repeat(extra))),
        "the detector is not changed by the question": stateOf(detector).currentLine === "",
      };
    },
  },
  {
    name: "one piece repeated on a line, with the agent's numbers: the character at which the stop comes, outside a code fence",
    run: ({ agent }) =>
      withClock(still(), () =>
        Object.fromEntries(
          [1, 2, 3, 4, 5, 7, 9, 10, 11, 20, 25, 32, 33, 34, 49, 50, 51, 64, 99, 100, 101, 128, 200, 201, 255, 256, 257, 300].map((period) => {
            const line = piece(period).repeat(Math.ceil(1_400 / period));
            const detector = new agent.SingleMessageLoopDetector();
            const stopAt = stopsAtCharacter(detector, line);
            const loop = detector.detectedSingleLineLoop;
            // Both sides of the stop, each asked of a fresh detector in one piece.
            const oneFewer = stopAt === null ? null : new agent.SingleMessageLoopDetector().addText({ newText: line.slice(0, stopAt - 1), caller: "scenario" });
            const exactly = stopAt === null ? null : new agent.SingleMessageLoopDetector().addText({ newText: line.slice(0, stopAt), caller: "scenario" });
            return [`a piece of ${period}`, { fed: line.length, stopAt, oneFewer, exactly, loop: loop === null ? null : { start: loop.start, period: loop.period, repetitions: loop.repetitions, rootIsThePiece: [...piece(period)].sort().join("") === [...loop.root].sort().join("") && loop.root.length === period }, says: shortInfo(detector.getSingleLineLoopInfo()) }];
          }),
        ),
      ),
  },
  {
    name: "one piece repeated on a line, with the agent's numbers: the character at which the stop comes, inside a code fence",
    run: ({ agent }) =>
      withClock(still(), () =>
        Object.fromEntries(
          [1, 2, 3, 7, 10, 33, 49, 50, 51, 66, 67, 100, 128, 200, 255, 256, 257].map((period) => {
            const line = piece(period).repeat(Math.ceil(1_800 / period));
            const detector = new agent.SingleMessageLoopDetector();
            detector.addText({ newText: "```text\n", caller: "scenario" });
            const stopAt = stopsAtCharacter(detector, line);
            const loop = detector.detectedSingleLineLoop;
            return [`a piece of ${period}`, { fed: line.length, insideCodeFence: detector.insideCodeFence, stopAt, loop: loop === null ? null : { start: loop.start, period: loop.period, repetitions: loop.repetitions } }];
          }),
        ),
      ),
  },
  {
    name: "the three numbers of a line's check, one at a time: the character at which each piece from 1 to 6 stops",
    run: ({ single }) =>
      withClock(still(), () => {
        const table = {};
        for (const singleLineLoopMinRepetitions of [0, 1, 2, 3, 4]) {
          for (const singleLineLoopMinPTimesK of [0, 1, 5, 6, 7, 12]) {
            for (const singleLineLoopMaxP of [0, 1, 2, 3, 6]) {
              const stops = [1, 2, 3, 4, 5, 6].map((period) => stopsAtCharacter(new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, singleLineLoopMinRepetitions, singleLineLoopMinPTimesK, singleLineLoopMaxP }).config), piece(period).repeat(12)));
              table[`at least ${singleLineLoopMinRepetitions} times, ${singleLineLoopMinPTimesK} characters, pieces up to ${singleLineLoopMaxP}`] = stops;
            }
          }
        }
        return table;
      }),
  },
  {
    name: "inside a code fence a line's check uses its two other numbers, read again at every character",
    run: ({ single }) =>
      withClock(still(), () => {
        const table = {};
        for (const singleLineLoopMinRepetitionsInCodeFence of [1, 2, 3]) {
          for (const singleLineLoopMinPTimesKInCodeFence of [1, 6, 9]) {
            const stops = [1, 2, 3, 4].map((period) => {
              const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, singleLineLoopMinRepetitions: 99, singleLineLoopMinPTimesK: 99, singleLineLoopMaxP: 4, singleLineLoopMinRepetitionsInCodeFence, singleLineLoopMinPTimesKInCodeFence }).config);
              detector.addText({ newText: "```\n", caller: "scenario" });
              return stopsAtCharacter(detector, piece(period).repeat(12));
            });
            table[`at least ${singleLineLoopMinRepetitionsInCodeFence} times, ${singleLineLoopMinPTimesKInCodeFence} characters`] = stops;
          }
        }
        // The numbers are functions: a number that changes while a line streams in is the one in force at each character.
        let needed = 99;
        const changing = numbers({ ...ONE_LINE_ONLY, singleLineLoopMaxP: 4 });
        changing.config.singleLineLoopMinRepetitionsInCodeFence = () => needed;
        changing.config.singleLineLoopMinPTimesKInCodeFence = () => 1;
        const detector = new single.SingleMessageLoopDetector(changing.config);
        detector.addText({ newText: "```\n", caller: "scenario" });
        const before = detector.addText({ newText: "a".repeat(40), caller: "scenario" });
        needed = 2;
        const after = detector.addText({ newText: "a", caller: "scenario" });
        return { table, "a number lowered while the line streams in": { before, after, loop: detector.detectedSingleLineLoop } };
      }),
  },
  {
    name: "what else is on the line: spaces, a start that does not repeat, a break, a line end",
    run: ({ agent }) =>
      withClock(still(), () => {
        const cases = {
          "a word and a space, again and again": "again ".repeat(80),
          "two words": "over and ".repeat(80),
          "a sentence": "I will check the file. ".repeat(40),
          "only spaces": " ".repeat(600),
          "only tabs": "\t".repeat(600),
          "spaces of another kind (no-break)": " ".repeat(600),
          "a letter with a space after each": "a ".repeat(300),
          "a start that does not repeat, then one letter": `${piece(40, 300)}${"a".repeat(300)}`,
          "a start that does not repeat, then a piece of 10": `${piece(37, 300)}${piece(10).repeat(40)}`,
          "99 of a letter, another letter, then the letter again": `${"a".repeat(99)}b${"a".repeat(300)}`,
          "99 of a letter, a space, then the letter again": `${"a".repeat(99)} ${"a".repeat(300)}`,
          "50 of a letter, 20 spaces, 49 of the letter": `${"a".repeat(50)}${" ".repeat(20)}${"a".repeat(49)}`,
          "50 of a letter, 20 spaces, 50 of the letter": `${"a".repeat(50)}${" ".repeat(20)}${"a".repeat(50)}`,
          "99 of a letter, a line end, 99 of the letter": `${"a".repeat(99)}\n${"a".repeat(99)}`,
          "99 of a letter, a line end, 100 of the letter": `${"a".repeat(99)}\n${"a".repeat(100)}`,
          "a letter in capitals and small, in turn": "aA".repeat(200),
          "digits counting up": Array.from({ length: 300 }, (_, n) => n).join(" "),
          "a character of two units": "\u{1F600}".repeat(200),
          "two characters of two units in turn": "\u{1F600}\u{1F389}".repeat(200),
          "a letter and its accent written apart": "é".repeat(200),
          "a carriage return and a letter": "a\r".repeat(200),
          "dots": ".".repeat(300),
          "equals signs": "=".repeat(300),
          "stars": "*".repeat(300),
        };
        return Object.fromEntries(
          Object.entries(cases).map(([name, line]) => {
            const detector = new agent.SingleMessageLoopDetector();
            const stopAt = stopsAtCharacter(detector, line);
            const loop = detector.detectedSingleLineLoop;
            return [name, { fed: [...line].length, stopAt, loop: loop === null ? null : { ...loop, root: text(loop.root) }, currentLineLength: detector.currentLine.length }];
          }),
        );
      }),
  },
  {
    name: "a line of box characters is not checked, and a line that is partly one is checked only where it is not",
    run: ({ agent }) =>
      withClock(still(), () => {
        const cases = {
          "dashes": "-".repeat(600),
          "underscores": "_".repeat(600),
          "pipes": "|".repeat(600),
          "plus signs": "+".repeat(600),
          "a table's rule": "|-----".repeat(100),
          "a double rule": "═".repeat(600),
          "a letter then dashes": `a${"-".repeat(600)}`,
          "four dashes and a letter, in turn": "----a".repeat(120),
          "three dashes and a letter, in turn": "---a".repeat(150),
          "five dashes and a letter, in turn": "-----a".repeat(100),
          "a dash and a letter, in turn": "-a".repeat(300),
          "letters, then a long rule": `${"a".repeat(60)}${"-".repeat(600)}`,
          "a long rule, then letters": `${"-".repeat(60)}${"a".repeat(600)}`,
          "ten dashes, then letters": `${"-".repeat(10)}${"a".repeat(300)}`,
        };
        return Object.fromEntries(
          Object.entries(cases).map(([name, line]) => {
            const detector = new agent.SingleMessageLoopDetector();
            const stopAt = stopsAtCharacter(detector, line);
            const loop = detector.detectedSingleLineLoop;
            return [name, { fed: line.length, stopAt, loop: loop === null ? null : { ...loop, root: text(loop.root) }, runsOnTheLine: stopAt === null ? held(detector.periodMatchRunLengths).slice(0, 6) : undefined }];
          }),
        );
      }),
  },
  {
    name: "a line longer than the line length keeps its first characters and drops the rest unchecked",
    run: ({ single, agent }) =>
      withClock(still(), () => {
        const small = (maxLineLength, line) => {
          const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxLineLength, singleLineLoopMinRepetitions: 2, singleLineLoopMinPTimesK: 4, singleLineLoopMaxP: 4 }).config);
          const stopAt = stopsAtCharacter(detector, line);
          return { stopAt, currentLine: detector.currentLine, length: detector.currentLine.length };
        };
        // A start of other characters that never repeats within the periods looked at, then one letter again and again.
        const other = piece(257).repeat(39);
        // The line as it stands after `others` such characters is put on the detector from outside: fed one by one,
        // ten thousand characters take seconds (each looks at the whole line so far). Nothing of the start repeats,
        // so the line itself is all the detector would hold; the last entry shows the two ways agree on a shorter line.
        const theAgents = (others, letters) => {
          const detector = new agent.SingleMessageLoopDetector();
          detector.currentLine = other.slice(0, others);
          const stopped = detector.addText({ newText: "z".repeat(letters), caller: "scenario" });
          return { stopped, length: detector.currentLine.length, loop: detector.detectedSingleLineLoop };
        };
        const fedOneByOne = new agent.SingleMessageLoopDetector();
        fedOneByOne.addText({ newText: other.slice(0, 900), caller: "scenario" });
        const putFromOutside = new agent.SingleMessageLoopDetector();
        putFromOutside.currentLine = other.slice(0, 900);
        return {
          "length 10, nothing repeats until the 11th": small(10, "abcdefghijkkkkkkkk"),
          "length 10, a repeat that would stop at the 11th": small(10, "abcdefghkkkkkkkk"),
          "length 10, a repeat that stops at the 10th": small(10, "abcdefkkkkkkkk"),
          "length 10, a character of two units at the 10th place": small(10, "abcdefghi\u{1F600}xyz"),
          "length 10, a character of two units at the 11th place": small(10, "abcdefghij\u{1F600}xyz"),
          "length 0: nothing is kept": small(0, "aaaaaaaa"),
          "length 1": small(1, "aaaaaaaa"),
          "a new line starts the count again": small(4, "abcdefgh\nabcdefgh\nab"),
          "the agent's 10,000: the letter's 100th time is the line's 10,000th character": theAgents(9_900, 600),
          "the agent's 10,000: the letter's 100th time would be the line's 10,001st character": theAgents(9_901, 600),
          "a line of 900 fed, and the same line put on a detector from outside, leave the same state": JSON.stringify(stateOf(fedOneByOne)) === JSON.stringify(stateOf(putFromOutside)),
        };
      }),
  },
  {
    name: "lines repeated, with the agent's numbers: the line at which the stop comes, outside a code fence",
    run: ({ agent }) =>
      withClock(still(), () => {
        const table = {};
        for (const period of [1, 2, 3, 4, 5, 10, 25, 49, 50, 51, 98, 99, 100, 101]) {
          for (const length of [1, 2, 5, 8, 9, 12, 13, 16, 17, 24, 25, 26, 49, 50, 51, 99]) {
            if (period > 5 && ![1, 2, 25, 99].includes(length)) continue;
            const detector = new agent.SingleMessageLoopDetector();
            const lines = repeatedLines(period, length, Math.max(260, period * 3));
            const stopAt = stopsAtLine(detector, lines);
            const says = detector.getMultiLineLoopInfo();
            table[`${period} lines of ${length}`] = stopAt === null ? { stopAt, fed: lines.length } : { stopAt, linesInThePattern: detector.detectedMultiLinePattern.length, saysRepetitions: says.repetitions, patternLength: says.pattern.length, alsoALineLoop: detector.detectedSingleLineLoop !== null };
          }
        }
        return table;
      }),
  },
  {
    name: "lines repeated, with the agent's numbers: the line at which the stop comes, inside a code fence",
    run: ({ agent }) =>
      withClock(still(), () => {
        const table = {};
        for (const period of [1, 2, 3, 4, 5, 10, 33, 34, 49, 50, 98, 99]) {
          for (const length of [1, 2, 5, 8, 9, 12, 13, 16, 17, 24, 25, 26, 33, 34, 49, 50, 51, 99]) {
            if (period > 5 && ![1, 2, 25, 99].includes(length)) continue;
            const detector = new agent.SingleMessageLoopDetector();
            detector.addText({ newText: "```\n", caller: "scenario" });
            const lines = repeatedLines(period, length, Math.max(260, period * 4));
            const stopAt = stopsAtLine(detector, lines);
            const says = detector.getMultiLineLoopInfo();
            table[`${period} lines of ${length}`] = stopAt === null ? { stopAt, fed: lines.length } : { stopAt, linesInThePattern: detector.detectedMultiLinePattern.length, saysRepetitions: says.repetitions };
          }
        }
        return table;
      }),
  },
  {
    name: "the three numbers of the lines' check, one at a time: the line at which 1 to 4 repeated lines of 1, 3 and 10 characters stop",
    run: ({ single }) =>
      withClock(still(), () => {
        const table = {};
        for (const multiLineLoopMinRepetitions of [1, 2, 3]) {
          for (const multiLineLoopMinPTimesK of [0, 3, 4, 7]) {
            for (const multiLineLoopMinTotalChars of [0, 9, 10, 11, 31]) {
              table[`at least ${multiLineLoopMinRepetitions} times, ${multiLineLoopMinPTimesK} lines, ${multiLineLoopMinTotalChars} characters`] = [1, 2, 3, 4].map((period) =>
                [1, 3, 10].map((length) => stopsAtLine(new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions, multiLineLoopMinPTimesK, multiLineLoopMinTotalChars }).config), repeatedLines(period, length, 40))),
              );
            }
          }
        }
        return table;
      }),
  },
  {
    name: "inside a code fence the lines' check uses its three other numbers",
    run: ({ single }) =>
      withClock(still(), () => {
        const table = {};
        for (const multiLineLoopMinRepetitionsInCodeFence of [1, 2, 3]) {
          for (const multiLineLoopMinPTimesKInCodeFence of [0, 4, 7]) {
            for (const multiLineLoopMinTotalCharsInCodeFence of [0, 10, 31]) {
              table[`at least ${multiLineLoopMinRepetitionsInCodeFence} times, ${multiLineLoopMinPTimesKInCodeFence} lines, ${multiLineLoopMinTotalCharsInCodeFence} characters`] = [1, 2, 3].map((period) =>
                [1, 3, 10].map((length) => {
                  const detector = new single.SingleMessageLoopDetector(
                    numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 2, multiLineLoopMinPTimesK: 1e9, multiLineLoopMinTotalChars: 1e9, multiLineLoopMinRepetitionsInCodeFence, multiLineLoopMinPTimesKInCodeFence, multiLineLoopMinTotalCharsInCodeFence }).config,
                  );
                  detector.addText({ newText: "```\n", caller: "scenario" });
                  return stopsAtLine(detector, repeatedLines(period, length, 40));
                }),
              );
            }
          }
        }
        return table;
      }),
  },
  {
    name: "the pattern a detector reports for lines, and the count it reports with it",
    run: ({ agent, single }) =>
      withClock(still(), () => {
        const report = (detector, lines) => {
          const stopAt = stopsAtLine(detector, lines);
          return { stopAt, pattern: detector.detectedMultiLinePattern, says: detector.getMultiLineLoopInfo(), aLineLoop: detector.getSingleLineLoopInfo(), currentLineIsLeft: detector.currentLine, lineCount: detector.lineCount };
        };
        const inFence = new agent.SingleMessageLoopDetector();
        inFence.addText({ newText: "```\n", caller: "scenario" });
        return {
          "one line of 20, three times": report(new agent.SingleMessageLoopDetector(), ["I will try that again", "I will try that again", "I will try that again", "never fed"]),
          "one line of 5, ten times: it says 2 repetitions all the same": report(new agent.SingleMessageLoopDetector(), Array.from({ length: 12 }, () => "again")),
          "two lines in turn": report(new agent.SingleMessageLoopDetector(), ["Reading the file once more.", "Still nothing in it, retrying.", "Reading the file once more.", "Still nothing in it, retrying."]),
          "three lines in turn, the pattern starts where the stop found it": report(new agent.SingleMessageLoopDetector(), ["intro", "alpha alpha alpha", "beta beta beta", "gamma gamma gamma", "alpha alpha alpha", "beta beta beta", "gamma gamma gamma"]),
          "inside a code fence it says the number for outside": report(inFence, Array.from({ length: 8 }, () => "    return retry(attempt + 1);")),
          "with five repetitions asked for, it says five": report(new single.SingleMessageLoopDetector(numbers({ multiLineLoopMinRepetitions: 5 }).config), Array.from({ length: 8 }, () => "the same line of text")),
        };
      }),
  },
  {
    name: "what is not counted as a line: blank lines and box borders; what makes two lines differ",
    run: ({ agent }) =>
      withClock(still(), () => {
        const line = "I will try that again";
        const fed = (given) => {
          const detector = new agent.SingleMessageLoopDetector();
          const stopped = detector.addText({ newText: given, caller: "scenario" });
          return { stopped, lineCount: detector.lineCount, lines: held(detector.lineBuffer), currentLine: detector.currentLine, pattern: detector.detectedMultiLinePattern };
        };
        return {
          "three times in a row": fed(`${line}\n${line}\n${line}\n`),
          "the third time has no line end yet": fed(`${line}\n${line}\n${line}`),
          "blank lines between": fed(`${line}\n\n${line}\n\n\n${line}\n`),
          "lines of spaces between": fed(`${line}\n   \n${line}\n\t\n${line}\n`),
          "rules of dashes between": fed(`${line}\n---\n${line}\n-----\n${line}\n`),
          "a rule of dashes and a rule of equals signs between: the second is a line like any other": fed(`${line}\n---\n${line}\n=====\n${line}\n`),
          "a table's rules between": fed(`${line}\n|----|----|\n${line}\n+----+----+\n${line}\n`),
          "another line between": fed(`${line}\nno\n${line}\nno\n${line}\n`),
          "carriage returns before the line ends": fed(`${line}\r\n${line}\r\n${line}\r\n`),
          "a carriage return on one of them only": fed(`${line}\n${line}\r\n${line}\n${line}\n`),
          "a space after one of them": fed(`${line}\n${line} \n${line}\n${line}\n`),
          "a space before one of them": fed(`${line}\n ${line}\n${line}\n${line}\n`),
          "capitals on one of them": fed(`${line}\n${line.toUpperCase()}\n${line}\n${line}\n`),
          "only blank lines": fed("\n\n\n\n\n\n\n\n"),
          "only rules": fed("---\n---\n---\n---\n---\n---\n"),
          "a line of one space kept from the line before": fed(`x\n \n`),
        };
      }),
  },
  {
    name: "the detector remembers the last lines only: as many as fifty times the repetitions of lines",
    run: ({ single }) =>
      withClock(still(), () => {
        // One repetition asked for: fifty lines are remembered.
        const make = () => new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 1, multiLineLoopMinPTimesK: 2, multiLineLoopMinTotalChars: 0 }).config);
        const filling = make();
        const marks = [];
        for (let n = 0; n < 120; n += 1) {
          filling.addText({ newText: `line ${n}\n`, caller: "scenario" });
          if ([0, 1, 48, 49, 50, 51, 99, 100, 119].includes(n)) marks.push({ after: n + 1, startIdx: filling.startIdx, lineCount: filling.lineCount, oldest: filling.getLineAt(0), newest: filling.getLineAt(filling.lineCount - 1) });
        }
        const gaps = {};
        for (const gap of [1, 2, 10, 48, 49, 50, 51, 60]) {
          // A line, then `gap - 1` other lines, then the line again: the line comes back `gap` lines later.
          const detector = make();
          const lines = ["the line that comes back", ...Array.from({ length: gap - 1 }, (_, n) => `between ${n}`), "the line that comes back", ...Array.from({ length: gap - 1 }, (_, n) => `between ${n}`), "the line that comes back"];
          gaps[`a line that comes back every ${gap} lines`] = { stopAt: stopsAtLine(detector, lines), fed: lines.length, linesInThePattern: detector.detectedMultiLinePattern?.length ?? null };
        }
        const afterSeventy = make();
        for (let n = 0; n < 70; n += 1) afterSeventy.addText({ newText: `line ${n}\n`, caller: "scenario" });
        return { size: filling.MAX_LINE_QUEUE_SIZE, marks, gaps, "after seventy lines the ring holds": held(afterSeventy.lineBuffer).slice(0, 22).concat([["…", afterSeventy.lineBuffer.length]]) };
      }),
  },
  {
    name: "a line with an odd number of fences opens or closes a code fence",
    run: ({ single }) => {
      const lines = ["", "```", "```js", "    ```", "text ``` text", "```a```", "``` ``` ```", "````", "`````", "```````", "``", "`", "` ` `", "`` ` ``", "~~~", "x```", "``` ```", "``` ```` `````", "```a``b`c", "'''", "\\`\\`\\`", "```\r", "a```b```c```d```e"];
      const detector = new single.SingleMessageLoopDetector(numbers().config);
      const each = lines.map((line) => {
        detector.insideCodeFence = false;
        const returned = detector.updateCodeFenceStateOnLineEnd(line);
        const fromOutside = detector.insideCodeFence;
        detector.updateCodeFenceStateOnLineEnd(line);
        return [line, { opens: fromOutside, thenInside: detector.insideCodeFence, returned }];
      });
      const stream = new single.SingleMessageLoopDetector(numbers().config);
      const followed = ["before", "```js", "code", "", "```", "after", "```", "never closed", "---", "   ", "``` and ``` again", "```"].map((line) => {
        stream.addText({ newText: `${line}\n`, caller: "scenario" });
        return [line, stream.insideCodeFence];
      });
      const noLineEnd = new single.SingleMessageLoopDetector(numbers().config);
      noLineEnd.addText({ newText: "```js", caller: "scenario" });
      return { each, followed, "a fence whose line has not ended yet": noLineEnd.insideCodeFence };
    },
  },
  {
    name: "the line that opens a fence is judged by the numbers for inside, the line that closes it by the numbers for outside",
    run: ({ single }) =>
      withClock(still(), () => {
        // Outside: one repetition is enough. Inside: never.
        const lenientOutside = () => new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 2, multiLineLoopMinPTimesK: 2, multiLineLoopMinTotalChars: 0, multiLineLoopMinRepetitionsInCodeFence: 1e9 }).config);
        // Inside: one repetition is enough. Outside: never.
        const lenientInside = () => new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 50, multiLineLoopMinRepetitionsInCodeFence: 2, multiLineLoopMinPTimesKInCodeFence: 2, multiLineLoopMinTotalCharsInCodeFence: 0 }).config);
        const ask = (make, lines) => {
          const detector = make();
          return { stopAt: stopsAtLine(detector, lines), insideCodeFence: detector.insideCodeFence };
        };
        return {
          "lenient outside: two fence lines, the second closes": ask(lenientOutside, ["```", "```"]),
          "lenient inside: two fence lines, the second closes": ask(lenientInside, ["```", "```"]),
          "lenient inside: three fence lines, the third opens": ask(lenientInside, ["```", "```", "```"]),
          "lenient outside: a line twice, then inside a fence twice": ask(lenientOutside, ["x", "```", "y", "y", "```", "z", "z"]),
          "lenient inside: a line twice outside, then twice inside a fence": ask(lenientInside, ["x", "x", "```", "y", "y"]),
          "a line's own check: lenient inside only": (() => {
            const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, singleLineLoopMinRepetitions: 1e9, singleLineLoopMinRepetitionsInCodeFence: 2, singleLineLoopMinPTimesKInCodeFence: 4, singleLineLoopMaxP: 4 }).config);
            const outside = stopsAtCharacter(detector, "aaaaaaaa\n");
            const theFenceLineItself = stopsAtCharacter(detector, "```` ````` ``````\n");
            const inside = stopsAtCharacter(detector, "aaaaaaaa\n");
            return { outside, theFenceLineItself, inside, insideCodeFence: detector.insideCodeFence };
          })(),
        };
      }),
  },
  {
    name: "once stopped a detector takes no more text and goes on saying so, until it is reset",
    run: ({ agent }) =>
      withClock(still(), () => {
        const onALine = new agent.SingleMessageLoopDetector();
        const first = onALine.addText({ newText: `intro\n${"ab".repeat(70)} and more that is never read\nnext line\n`, caller: "scenario" });
        const stoppedState = stateOf(onALine);
        const again = [onALine.addText({ newText: "anything", caller: "scenario" }), onALine.addText({ newText: "\n\n", caller: "scenario" }), onALine.addText({ newText: "", caller: "scenario" })];
        const unchanged = JSON.stringify(stateOf(onALine)) === JSON.stringify(stoppedState);
        const returned = onALine.reset();
        const afterReset = stateOf(onALine);
        const stopsOnAFreshLine = onALine.addText({ newText: "a fresh line\n", caller: "scenario" });

        const onLines = new agent.SingleMessageLoopDetector();
        const second = onLines.addText({ newText: "```\nopen fence\n```\nI will try that again\nI will try that again\nI will try that again\nnever read\n", caller: "scenario" });
        const stoppedOnLines = stateOf(onLines);
        onLines.reset();
        return { first, stoppedState, again, unchanged, resetReturns: returned, afterReset, stopsOnAFreshLine, afterOneMoreLine: stateOf(onALine), second, stoppedOnLines, afterResetTheOldLinesAreStillInTheRing: stateOf(onLines) };
      }),
  },
  {
    name: "a reset empties everything a detector holds but its numbers and the old lines of its ring, and closes an open code fence",
    run: ({ single }) =>
      withClock(still(), () => {
        // A ring of five lines. Outside a fence a line that comes twice running stops the answer; inside a fence nothing does.
        const detector = new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, multiLineLoopMinRepetitions: 0.1, multiLineLoopMinPTimesK: 2, multiLineLoopMinTotalChars: 0, multiLineLoopMinRepetitionsInCodeFence: 1e9 }).config);
        const fed = detector.addText({ newText: "```\none\ntwo\nthree\nfour\nfive\nsix\nx\nx\naaa", caller: "scenario" });
        const before = stateOf(detector);
        const returned = detector.reset();
        const after = stateOf(detector);
        const twiceAfterTheReset = detector.addText({ newText: "y\ny\n", caller: "scenario" });
        return {
          "a line twice running inside the open fence does not stop it": fed,
          before,
          resetReturns: returned,
          after,
          theSameListsAsBefore: { sizes: sizesOf(detector) },
          "a line twice running after the reset stops it: the fence is closed": twiceAfterTheReset,
          atTheStop: stateOf(detector),
        };
      }),
  },
  {
    name: "the same text in one piece, character by character, or in uneven pieces, gives the same stop and the same state",
    run: ({ agent }) =>
      withClock(still(), () => {
        const texts = {
          "an answer that does not repeat": madeUpAnswer().map((line) => `${line}\n`).join(""),
          "an answer, then a line three times": `${madeUpAnswer().slice(0, 30).map((line) => `${line}\n`).join("")}${"I will try that again\n".repeat(5)}`,
          "an answer, then a piece again and again": `${madeUpAnswer().slice(0, 12).map((line) => `${line}\n`).join("")}Let me ${"check again, ".repeat(40)}`,
          "a fence left open, then lines again and again": `Here is the code:\n\`\`\`js\n${"  retry(attempt + 1);\n".repeat(12)}`,
        };
        return Object.fromEntries(
          Object.entries(texts).map(([name, whole]) => {
            const ways = { "one piece": [whole], "character by character": [...whole], "pieces of up to 7": inPieces(whole, 7, 11), "pieces of up to 60": inPieces(whole, 60, 5), "line by line": whole.match(/[^\n]*\n|[^\n]+$/g) };
            const states = Object.entries(ways).map(([way, pieces]) => {
              const detector = new agent.SingleMessageLoopDetector();
              let characters = 0;
              let stopped = false;
              for (const one of pieces) {
                characters += one.length;
                if (detector.addText({ newText: one, caller: "scenario" })) {
                  stopped = true;
                  break;
                }
              }
              return [way, { pieces: pieces.length, stopped, state: JSON.stringify(stateOf(detector, { brief: true })), charactersHandedOver: stopped ? characters : whole.length }];
            });
            const first = states[0][1];
            return [name, { length: whole.length, stopped: first.stopped, state: JSON.parse(first.state), allWaysAgree: states.every(([, seen]) => seen.state === first.state && seen.stopped === first.stopped), piecesOfEachWay: Object.fromEntries(states.map(([way, seen]) => [way, seen.pieces])) }];
          }),
        );
      }),
  },
  {
    name: "a character of two units cut between two pieces is checked at both halves, and stops sooner",
    run: ({ agent }) =>
      withClock(still(), () => {
        const whole = "\u{1F600}".repeat(120);
        const uncut = new agent.SingleMessageLoopDetector();
        const cut = new agent.SingleMessageLoopDetector();
        const unitByUnit = Array.from({ length: whole.length }, (_, at) => whole[at]);
        let cutStop = null;
        for (let at = 0; at < unitByUnit.length && cutStop === null; at += 1) if (cut.addText({ newText: unitByUnit[at], caller: "scenario" })) cutStop = at + 1;
        return {
          "character by character: stops at character": stopsAtCharacter(uncut, whole),
          loop: uncut.detectedSingleLineLoop,
          "unit by unit: stops at unit": cutStop,
          loopWhenCut: cut.detectedSingleLineLoop,
        };
      }),
  },
  // ── Time ──
  {
    name: "a line's check looks at the clock only at every 32nd period: the character at which a time limit is noticed",
    run: ({ single }) => {
      const line = piece(120);
      const table = {};
      for (const maxCheckTimeMs of [1, 10, 33, 34, 35, 36, 37, 38, 66, 67, 68, 69, 70, 71, 72, 73, 100, 150, 250, 251, 252, 400]) {
        const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxCheckTimeMs }).config);
        const clock = ticking();
        const returned = withClock(clock, () => detector.addText({ newText: line, caller: "scenario" }));
        table[`${maxCheckTimeMs} ms allowed, the clock one ms on at every reading`] = { returned, timedOut: detector.timedOut(), charactersKept: detector.currentLine.length, clockReadings: clock.reads, runsOnTheLine: held(detector.periodMatchRunLengths).length };
      }
      const short = {};
      for (const length of [1, 31, 32, 33, 34]) {
        const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxCheckTimeMs: 1 }).config);
        const clock = ticking(1_000);
        const returned = withClock(clock, () => detector.addText({ newText: piece(length), caller: "scenario" }));
        short[`a line of ${length}, the time long gone`] = { returned, timedOut: detector.timedOut(), charactersKept: detector.currentLine.length, clockReadings: clock.reads };
      }
      const periods = {};
      for (const singleLineLoopMaxP of [31, 32, 33, 63, 64]) {
        const detector = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxCheckTimeMs: 1, singleLineLoopMaxP }).config);
        const clock = ticking(1_000);
        withClock(clock, () => detector.addText({ newText: piece(100), caller: "scenario" }));
        periods[`periods up to ${singleLineLoopMaxP}, the time long gone`] = { timedOut: detector.timedOut(), charactersKept: detector.currentLine.length, clockReadings: clock.reads };
      }
      return { table, short, periods };
    },
  },
  {
    name: "the lines' check looks at the clock only at every 8th period: the line at which a time limit is noticed",
    run: ({ single }) => {
      const lines = Array.from({ length: 40 }, (_, n) => `l${String.fromCharCode(0x4e00 + n)}`);
      const whole = lines.map((line) => `${line}\n`).join("");
      const table = {};
      for (const maxCheckTimeMs of [1, 20, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 60, 90, 120, 200, 260, 261, 262, 400]) {
        const detector = new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, maxCheckTimeMs }).config);
        const clock = ticking();
        const returned = withClock(clock, () => detector.addText({ newText: whole, caller: "scenario" }));
        table[`${maxCheckTimeMs} ms allowed`] = { returned, timedOut: detector.timedOut(), linesKept: detector.lineCount, currentLineLeft: detector.currentLine, clockReadings: clock.reads };
      }
      const short = {};
      for (const count of [1, 8, 9, 10]) {
        const detector = new single.SingleMessageLoopDetector(numbers({ ...LINES_ONLY, maxCheckTimeMs: 1 }).config);
        const clock = ticking(1_000);
        const returned = withClock(clock, () => detector.addText({ newText: lines.slice(0, count).map((line) => `${line}\n`).join(""), caller: "scenario" }));
        short[`${count} lines, the time long gone`] = { returned, timedOut: detector.timedOut(), linesKept: detector.lineCount, currentLineLeft: detector.currentLine, clockReadings: clock.reads };
      }
      return { table, short };
    },
  },
  {
    name: "the time allowed starts again with every piece, and no limit means the clock is never obeyed",
    run: ({ single }) => {
      const line = piece(120);
      const piecewise = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxCheckTimeMs: 40 }).config);
      const clock = ticking();
      const answers = withClock(clock, () => [...line].map((character) => piecewise.addText({ newText: character, caller: "scenario" })));
      const unlimited = new single.SingleMessageLoopDetector(numbers({ ...ONE_LINE_ONLY, maxCheckTimeMs: 0 }).config);
      const far = ticking(1e12);
      const returned = withClock(far, () => unlimited.addText({ newText: `${line}\n${Array.from({ length: 30 }, (_, n) => `line ${n}\n`).join("")}`, caller: "scenario" }));
      return {
        "40 ms allowed, 120 characters each its own piece": { anyStop: answers.includes(true), timedOut: piecewise.timedOut(), charactersKept: piecewise.currentLine.length, clockReadings: clock.reads },
        "no limit, the clock a thousand million seconds on at every reading": { returned, timedOut: unlimited.timedOut(), linesKept: unlimited.lineCount, clockReadings: far.reads },
      };
    },
  },
  {
    name: "after a time limit ran out a detector takes no more text, says it timed out and not that it stopped, until it is reset",
    run: ({ single }) => {
      const events = [];
      const hooks = { onTimeout: (event) => events.push(event), onSingleLineCheck: () => {}, onMultiLineCheck: () => {} };
      const detector = new single.SingleMessageLoopDetector(numbers({ maxCheckTimeMs: 5 }).config, hooks);
      const first = withClock(ticking(), () => detector.addText({ newText: `first line\n${piece(60)} never read\nnor this\n`, caller: "the caller" }));
      const timedOutState = stateOf(detector);
      const clock = ticking();
      const again = withClock(clock, () => [detector.addText({ newText: "more\n", caller: "the caller" }), detector.addText({ newText: "a".repeat(300), caller: "the caller" })]);
      const unchanged = JSON.stringify(stateOf(detector)) === JSON.stringify(timedOutState);
      detector.reset();
      const afterReset = stateOf(detector);
      const stopsARepeatedLetterAgain = withClock(still(), () => detector.addText({ newText: "a".repeat(300), caller: "the caller" }));
      return { first, timedOutState, told: events, again, clockReadingsOnceTimedOut: clock.reads, unchanged, afterReset, stopsARepeatedLetterAgain };
    },
  },
  // ── What a detector tells whoever listens ──
  {
    name: "a detector tells its listeners of every check: a line's at each character that is not a space, the lines' at each line kept",
    run: ({ single }) => {
      const told = [];
      const hooks = {
        onSingleLineCheck(event) { told.push({ line: event, onTheHooks: this === hooks }); },
        onMultiLineCheck(event) { told.push({ lines: event, onTheHooks: this === hooks }); },
        onTimeout(event) { told.push({ timeout: event, onTheHooks: this === hooks }); },
      };
      const detector = new single.SingleMessageLoopDetector(numbers({ singleLineLoopMinRepetitions: 2, singleLineLoopMinPTimesK: 6, singleLineLoopMaxP: 8, multiLineLoopMinTotalChars: 4 }).config, hooks);
      const clock = ticking();
      const answers = withClock(clock, () => [
        detector.addText({ newText: "a b\n", caller: "first" }),
        detector.addText({ newText: "--\n\n", caller: "second" }),
        detector.addText({ newText: "c\na b\nc\n", caller: "third" }),
      ]);
      const stopsOnALine = new single.SingleMessageLoopDetector(numbers({ singleLineLoopMinRepetitions: 2, singleLineLoopMinPTimesK: 4, singleLineLoopMaxP: 8 }).config, hooks);
      const before = told.length;
      const lineClock = ticking();
      const lineAnswer = withClock(lineClock, () => stopsOnALine.addText({ newText: "xyxyxy", caller: "fourth" }));
      return { answers, told: told.slice(0, before), clockReadings: clock.reads, "a stop on a line": { lineAnswer, told: told.slice(before), clockReadings: lineClock.reads } };
    },
  },
  {
    name: "a time limit is told once, with the check it interrupted",
    run: ({ single }) => {
      const run = (given, changed) => {
        const told = [];
        const hooks = { onTimeout: (event) => told.push({ timeout: event }), onSingleLineCheck: (event) => told.push({ line: event.result }), onMultiLineCheck: (event) => told.push({ lines: event.result }) };
        const detector = new single.SingleMessageLoopDetector(numbers({ maxCheckTimeMs: 3, ...changed }).config, hooks);
        const clock = ticking();
        const returned = withClock(clock, () => detector.addText({ newText: given, caller: "the caller" }));
        return { returned, told: told.filter((one) => one.timeout || told.indexOf(one) >= told.length - 3), howManyTold: told.length, clockReadings: clock.reads };
      };
      return {
        "in a line's check": run(piece(40), ONE_LINE_ONLY),
        "in the lines' check": run(Array.from({ length: 12 }, (_, n) => `l${n}\n`).join(""), LINES_ONLY),
      };
    },
  },
  {
    name: "listeners that are missing, or that hear only some things, change nothing but the clock readings",
    run: ({ single }) => {
      const given = `a b\nc\na b\nc\n${piece(40)}`;
      const ask = (hooks) => {
        const detector = hooks === "none" ? new single.SingleMessageLoopDetector(numbers({ maxCheckTimeMs: 1e6 }).config) : new single.SingleMessageLoopDetector(numbers({ maxCheckTimeMs: 1e6 }).config, hooks);
        const clock = ticking();
        const returned = withClock(clock, () => detector.addText({ newText: given, caller: "scenario" }));
        return { returned, clockReadings: clock.reads, state: JSON.stringify(stateOf(detector)) };
      };
      const all = { onSingleLineCheck() {}, onMultiLineCheck() {}, onTimeout() {} };
      const answers = {
        "no listeners": ask("none"),
        "undefined": ask(undefined),
        "null": ask(null),
        "an empty object": ask({}),
        "only a line's": ask({ onSingleLineCheck() {} }),
        "only the lines'": ask({ onMultiLineCheck() {} }),
        "only the time limit's": ask({ onTimeout() {} }),
        "all three": ask(all),
      };
      const first = answers["no listeners"].state;
      return {
        clockReadings: Object.fromEntries(Object.entries(answers).map(([name, answer]) => [name, answer.clockReadings])),
        returned: Object.fromEntries(Object.entries(answers).map(([name, answer]) => [name, answer.returned])),
        theSameStateForAll: Object.values(answers).every((answer) => answer.state === first),
        "a listener that is no function": attempt(() => withClock(still(), () => new single.SingleMessageLoopDetector(numbers().config, { onSingleLineCheck: 5 }).addText({ newText: "a", caller: "scenario" }))),
        "a listener that throws": attempt(() => withClock(still(), () => new single.SingleMessageLoopDetector(numbers().config, { onSingleLineCheck: () => { throw new Error("the listener failed"); } }).addText({ newText: "a", caller: "scenario" }))),
      };
    },
  },
  // ── The detector's methods, each called from outside ──
  {
    name: "the ring of lines, filled and read from outside",
    run: ({ single }) => {
      const detector = new single.SingleMessageLoopDetector(numbers({ multiLineLoopMinRepetitions: 0.1 }).config);
      const steps = [];
      for (const line of ["one", "two", "three", "four", "five", "six", "seven", "eight"]) {
        const returned = detector.addLineToQueue(line);
        steps.push({ added: line, returned, startIdx: detector.startIdx, lineCount: detector.lineCount, ring: [...detector.lineBuffer], inOrder: Array.from({ length: detector.lineCount }, (_, at) => detector.getLineAt(at)) });
      }
      return {
        size: detector.MAX_LINE_QUEUE_SIZE,
        steps,
        "read past the end": [detector.getLineAt(5), detector.getLineAt(6), detector.getLineAt(11)],
        "read before the start": [detector.getLineAt(-1), detector.getLineAt(-3)],
        "read at half a place": detector.getLineAt(0.5),
        "an empty ring read at its start": new single.SingleMessageLoopDetector(numbers().config).getLineAt(0),
        "anything is kept as it is given": (() => {
          const other = new single.SingleMessageLoopDetector(numbers().config);
          other.addLineToQueue("");
          other.addLineToQueue(undefined);
          other.addLineToQueue(7);
          return { lineCount: other.lineCount, lines: [other.getLineAt(0), other.getLineAt(1), other.getLineAt(2)] };
        })(),
      };
    },
  },
  {
    name: "the lines' check asked from outside",
    run: ({ single }) => {
      const told = [];
      const hooks = { onMultiLineCheck: (event) => told.push(event), onTimeout: (event) => told.push({ timeout: event }) };
      const empty = new single.SingleMessageLoopDetector(numbers().config, hooks);
      const onNothing = withClock(ticking(), () => empty.checkForMultiLineLoop({ caller: "outside", deadlineMs: 1e9 }));
      const detector = new single.SingleMessageLoopDetector(numbers({ multiLineLoopMinTotalChars: 0 }).config, hooks);
      for (const line of ["a", "b", "a"]) detector.addLineToQueue(line);
      const notYet = withClock(ticking(), () => detector.checkForMultiLineLoop({ caller: "outside", deadlineMs: 1e9 }));
      detector.addLineToQueue("b");
      const found = withClock(ticking(), () => detector.checkForMultiLineLoop({ caller: "outside", deadlineMs: 1e9 }));
      const samePattern = found === detector.detectedMultiLinePattern;
      const askedAgain = withClock(ticking(), () => detector.checkForMultiLineLoop({ caller: "outside", deadlineMs: 1e9 }));
      const many = new single.SingleMessageLoopDetector(numbers().config, hooks);
      for (let n = 0; n < 12; n += 1) many.addLineToQueue(`line ${n}`);
      const lateClock = ticking();
      const late = withClock(lateClock, () => many.checkForMultiLineLoop({ caller: "outside", deadlineMs: 0 }));
      return {
        "on an empty detector": onNothing,
        "after a, b, a": notYet,
        "after a, b, a, b": found,
        theDetectorHoldsThePatternItGave: samePattern,
        "asked once more without a new line": askedAgain,
        runsOfLines: held(detector.multiLinePeriodMatchRunLengths),
        "twelve lines and a time already gone": { returned: late, timedOut: many.timedOut(), clockReadings: lateClock.reads },
        "without what it needs": attempt(() => detector.checkForMultiLineLoop()),
        told,
      };
    },
  },
  {
    name: "the question whether time has run out, asked from outside",
    run: ({ single }) => {
      const told = [];
      const detector = new single.SingleMessageLoopDetector(numbers().config, { onTimeout: (event) => told.push(event) });
      const ask = (target, deadlineMs, clock = ticking(10)) => {
        const returned = withClock(clock, () => target.markTimedOutIfNeeded({ caller: "outside", deadlineMs, phase: "any phase", startTime: 4 }));
        return { returned, didTimeout: target.didTimeout, clockReadings: clock.reads };
      };
      const exact = (now, deadlineMs) => {
        const fresh = new single.SingleMessageLoopDetector(numbers().config);
        return withClock({ now: () => now }, () => fresh.markTimedOutIfNeeded({ caller: "outside", deadlineMs, phase: "p", startTime: 0 }));
      };
      const answers = {
        "the time not yet reached": ask(detector, 1e9),
        "the time reached": ask(detector, 0),
        "asked again once timed out": ask(detector, 1e9),
      };
      return {
        answers,
        told,
        "a ms before the time": exact(99, 100),
        "at the very ms": exact(100, 100),
        "a ms after": exact(101, 100),
        "no time at all (never)": exact(1e15, Number.POSITIVE_INFINITY),
        "a time that is no number": exact(5, Number.NaN),
        "without listeners": ask(new single.SingleMessageLoopDetector(numbers().config), 0),
        "without what it needs": attempt(() => detector.markTimedOutIfNeeded()),
      };
    },
  },
  {
    name: "what a detector says of a loop before any, and when its fields are set from outside",
    run: ({ single }) => {
      const detector = new single.SingleMessageLoopDetector(numbers({ multiLineLoopMinRepetitions: 7 }).config);
      const before = { loopDetected: detector.loopDetected(), timedOut: detector.timedOut(), singleLine: detector.getSingleLineLoopInfo(), multiLine: detector.getMultiLineLoopInfo() };
      detector.detectedSingleLineLoop = { start: 3, period: 2, repetitions: 9, root: "ab" };
      const withALineLoop = { loopDetected: detector.loopDetected(), singleLine: detector.getSingleLineLoopInfo(), fields: Object.keys(detector.getSingleLineLoopInfo()), multiLine: detector.getMultiLineLoopInfo() };
      detector.detectedSingleLineLoop = null;
      detector.detectedMultiLinePattern = ["first", "second", ""];
      const withLines = { loopDetected: detector.loopDetected(), singleLine: detector.getSingleLineLoopInfo(), multiLine: detector.getMultiLineLoopInfo(), fields: Object.keys(detector.getMultiLineLoopInfo()) };
      detector.detectedMultiLinePattern = [];
      const withNoLines = { loopDetected: detector.loopDetected(), multiLine: detector.getMultiLineLoopInfo() };
      detector.detectedMultiLinePattern = null;
      detector.didTimeout = true;
      const timedOut = { loopDetected: detector.loopDetected(), timedOut: detector.timedOut(), takesText: detector.addText({ newText: "a".repeat(300), caller: "scenario" }), currentLine: detector.currentLine };
      return { before, withALineLoop, withLines, withNoLines, timedOut };
    },
  },
  {
    name: "a detector works through its own methods, so one built on it can change a step",
    run: ({ single }) => {
      const calls = [];
      const short = (value) => (typeof value === "string" && value.length > 12 ? `${value.slice(0, 12)}…` : value);
      class Watched extends single.SingleMessageLoopDetector {}
      for (const method of ["loopDetected", "timedOut", "isBoxBorderLine", "addLineToQueue", "getLineAt", "checkForMultiLineLoop", "markTimedOutIfNeeded", "updateCodeFenceStateOnLineEnd", "getSingleLineLoopInfo", "getMultiLineLoopInfo", "reset"]) {
        Watched.prototype[method] = function (...given) {
          const returned = single.SingleMessageLoopDetector.prototype[method].apply(this, given);
          calls.push([method, ...given.map((one) => (one !== null && typeof one === "object" ? Object.fromEntries(Object.entries(one).map(([key, value]) => [key, short(value)])) : short(one))), "→", Array.isArray(returned) ? returned.map(short) : short(returned)]);
          return returned;
        };
      }
      const config = numbers({ multiLineLoopMinTotalChars: 0, multiLineLoopMinTotalCharsInCodeFence: 0, singleLineLoopMaxP: 40, maxCheckTimeMs: 1e6 });
      const detector = new Watched(config.config);
      config.read.length = 0;
      const clock = ticking();
      const answers = withClock(clock, () => [
        detector.addText({ newText: "ab\n", caller: "one" }),
        detector.addText({ newText: "--\n \n```\n", caller: "two" }),
        detector.addText({ newText: `${piece(34)}\n`, caller: "three" }),
        detector.addText({ newText: "ab\nab\nab\nab\n", caller: "four" }),
        detector.addText({ newText: "more", caller: "five" }),
      ]);
      // A detector built on it that calls no line a box border, and every line a fence.
      class Changed extends single.SingleMessageLoopDetector {
        isBoxBorderLine() { return false; }
        updateCodeFenceStateOnLineEnd() { this.insideCodeFence = true; }
      }
      const changed = new Changed(numbers().config);
      const dashes = withClock(still(), () => stopsAtCharacter(changed, `x\n${"-".repeat(300)}`));
      return { answers, calls, numbersReadWhileItRan: config.read, clockReadings: clock.reads, "one built on it that sees no borders and is always in a fence stops a line of dashes at": dashes };
    },
  },
  {
    name: "when each number is read after the making: none outside a fence for a line, two for lines; inside a fence two at every character and three for lines",
    run: ({ single }) => {
      const config = numbers({ multiLineLoopMinTotalChars: 0, singleLineLoopMaxP: 8 });
      const detector = new single.SingleMessageLoopDetector(config.config);
      const reads = {};
      const during = (name, given) => {
        config.read.length = 0;
        const returned = withClock(still(), () => detector.addText({ newText: given, caller: "scenario" }));
        reads[name] = { returned, read: [...config.read] };
      };
      during("three characters outside a fence", "abc");
      during("the line ends, the first line kept", "\n");
      during("a second line, unlike the first", "xyz\n");
      during("the first line again: one period matches", "abc\n");
      during("a fence opens: its own line matches nothing", "```\n");
      during("two characters and a space inside the fence", "a b");
      during("the line ends inside the fence, matching nothing", "\n");
      during("that line again inside the fence: one period matches", "a b\n");
      during("that line a third time: two periods match", "a b\n");
      return reads;
    },
  },
  {
    name: "text of another kind",
    run: ({ single }) =>
      withClock(still(), () => {
        const make = () => new single.SingleMessageLoopDetector(numbers().config);
        const list = make();
        const fromAList = list.addText({ newText: ["ab", "c", "\n", "ab", "\n"], caller: "scenario" });
        return {
          "nothing given": attempt(() => make().addText()),
          "no text": attempt(() => make().addText({ caller: "scenario" })),
          "null for a text": attempt(() => make().addText({ newText: null, caller: "scenario" })),
          "a number for a text": attempt(() => make().addText({ newText: 5, caller: "scenario" })),
          "an empty text": attempt(() => make().addText({ newText: "", caller: "scenario" })),
          "no caller": attempt(() => make().addText({ newText: "abc\n" })),
          "a list of texts is walked item by item": { fromAList, lineCount: list.lineCount, lines: held(list.lineBuffer), currentLine: list.currentLine },
          "a line that is no text asked about its border": attempt(() => make().isBoxBorderLine(5)),
          "no line asked about its border": attempt(() => make().isBoxBorderLine()),
          "a line that is no text at a line's end": attempt(() => make().updateCodeFenceStateOnLineEnd(5)),
          "no line at a line's end": attempt(() => make().updateCodeFenceStateOnLineEnd()),
        };
      }),
  },
  // ── The agent's own detector, error, reminder and check ──
  {
    name: "the agent's detector is the detector with thirteen fixed numbers and no listeners",
    run: ({ agent, single }) => {
      const detector = new agent.SingleMessageLoopDetector();
      const another = new agent.SingleMessageLoopDetector("ignored", { onTimeout() {} });
      return {
        numbers: Object.fromEntries(Object.keys(detector.config).map((name) => [name, detector.config[name]()])),
        sizes: sizesOf(detector),
        hooks: detector.hooks,
        fields: Object.keys(detector),
        isTheDetector: detector instanceof single.SingleMessageLoopDetector,
        isAnotherClass: agent.SingleMessageLoopDetector !== single.SingleMessageLoopDetector,
        builtOnTheDetector: Object.getPrototypeOf(agent.SingleMessageLoopDetector) === single.SingleMessageLoopDetector,
        parameters: agent.SingleMessageLoopDetector.length,
        ownMethods: Object.getOwnPropertyNames(agent.SingleMessageLoopDetector.prototype),
        whatItIsGivenIsIgnored: { hooks: another.hooks, sameNumbers: Object.keys(another.config).every((name) => another.config[name]() === detector.config[name]()) },
        eachHasItsOwnConfig: detector.config !== another.config,
        state: stateOf(detector),
      };
    },
  },
  {
    name: "the error that ends a turn for looping: what it says, to whom, and what it carries",
    run: ({ agent }) => {
      const seen = (error) => ({
        error,
        fields: Object.keys(error),
        name: error.name,
        message: error.message,
        rawMessage: error.rawMessage,
        code: error.code,
        written: String(error),
        traceStarts: error.stack.split("\n")[0],
        isAnError: error instanceof Error,
        // The class it is built on answers `instanceof` itself, by an error's name, and this error has a name of its own.
        instanceofItsOwnClass: error instanceof agent.AgentLoopError,
        instanceofTheClassItIsBuiltOn: error instanceof Object.getPrototypeOf(agent.AgentLoopError),
        itsPrototypeIsItsOwnClass: Object.getPrototypeOf(error) === agent.AgentLoopError.prototype,
        itsConstructorIsItsOwnClass: error.constructor === agent.AgentLoopError,
        details: error.details.map((detail) => ({ type: detail.getType().typeName, asJson: detail.toJson(), onTheWire: Buffer.from(detail.toBinary()).toString("hex") })),
        metadata: [...error.metadata.entries()],
        cause: error.cause,
        has: { singleMessageLoopKind: "singleMessageLoopKind" in error, repetitions: "repetitions" in error, period: "period" in error },
      });
      const first = new agent.AgentLoopError({ loopType: "singleMessage", loopKind: "single_message_single_line", repetitions: 100, period: 1 });
      const second = new agent.AgentLoopError({ loopType: "singleMessage", loopKind: "single_message_single_line", repetitions: 100, period: 1 });
      return {
        "a piece repeated on a line": seen(first),
        "lines repeated: no period": seen(new agent.AgentLoopError({ loopType: "singleMessage", loopKind: "single_message_multi_line", repetitions: 2 })),
        "lines repeated: an undefined period": seen(new agent.AgentLoopError({ loopType: "singleMessage", loopKind: "single_message_multi_line", repetitions: 2, period: undefined })),
        "messages repeated": seen(new agent.AgentLoopError({ loopType: "assistantMessage", patternLength: 4 })),
        eachErrorHasItsOwnDetails: first.details !== second.details && first.details[0] !== second.details[0] && first.details[0].details !== second.details[0].details && first.metadata !== second.metadata,
        className: agent.AgentLoopError.name,
        parameters: agent.AgentLoopError.length,
      };
    },
  },
  {
    name: "the error is made from whatever it is given",
    run: ({ agent }) => {
      const cases = {
        "a kind it has no words for": { loopType: "singleMessage", loopKind: "something_else", repetitions: 0, period: 0 },
        "no kind": { loopType: "singleMessage" },
        "messages repeated, no count": { loopType: "assistantMessage" },
        "messages repeated, with what a line loop would carry": { loopType: "assistantMessage", patternLength: 2, loopKind: "ignored", repetitions: 9, period: 9 },
        "another loop type": { loopType: "other", loopKind: "a kind", repetitions: 3, period: 4, patternLength: 5 },
        "no loop type": { loopKind: "a kind", repetitions: 3 },
        "nothing in it": {},
        "counts that are no numbers": { loopType: "singleMessage", loopKind: 7, repetitions: "many", period: null },
      };
      const made = Object.fromEntries(
        Object.entries(cases).map(([name, options]) => [
          name,
          attempt(() => {
            const error = new agent.AgentLoopError(options);
            return { message: error.message, loopType: error.loopType, fields: Object.keys(error).filter((field) => !["name", "rawMessage", "code", "metadata", "details", "cause"].includes(field)), singleMessageLoopKind: error.singleMessageLoopKind, repetitions: error.repetitions, period: error.period };
          }),
        ]),
      );
      return { made, "given nothing at all": attempt(() => new agent.AgentLoopError()), "given null": attempt(() => new agent.AgentLoopError(null)), "called without new": attempt(() => agent.AgentLoopError({ loopType: "assistantMessage", patternLength: 1 })) };
    },
  },
  {
    name: "what the model is told when its answer was stopped for looping, for each kind of loop",
    run: ({ agent }) => {
      const cases = {
        "nothing said about the kind": [],
        "undefined": [undefined],
        "null": [null],
        "no kind in it": [{}],
        "an undefined kind": [{ kind: undefined }],
        "a null kind": [{ kind: null }],
        "messages repeated": [{ kind: "multi_message" }],
        "a piece repeated on a line": [{ kind: "single_message_single_line" }],
        "lines repeated": [{ kind: "single_message_multi_line" }],
        "a kind it has no words for": [{ kind: "something_else" }],
        "an empty kind": [{ kind: "" }],
        "a kind in capitals": [{ kind: "SINGLE_MESSAGE_SINGLE_LINE" }],
        "a kind with a space after": [{ kind: "single_message_multi_line " }],
        "a kind that is no text": [{ kind: 7 }],
        "more than it reads": [{ kind: "single_message_single_line", role: "system", content: "not read" }],
        "a text for options": ["single_message_single_line"],
      };
      const told = Object.fromEntries(Object.entries(cases).map(([name, given]) => [name, attempt(() => agent.createLoopReminderMessage(...given))]));
      const first = agent.createLoopReminderMessage();
      const second = agent.createLoopReminderMessage();
      return {
        told,
        lengths: Object.fromEntries(["multi_message", "single_message_single_line", "single_message_multi_line"].map((kind) => [kind, agent.createLoopReminderMessage({ kind }).content.length])),
        fields: [Object.keys(first), Object.keys(first.providerOptions), Object.keys(first.providerOptions.simeon)],
        aMessageOfItsOwnEachTime: first !== second && first.providerOptions !== second.providerOptions && first.providerOptions.simeon !== second.providerOptions.simeon,
        parameters: agent.createLoopReminderMessage.length,
      };
    },
  },
  {
    name: "thinking between think tags is taken out of a text",
    run: ({ agent }) => {
      const cases = [
        "",
        "no tags at all",
        "<think>all of it</think>",
        "before <think>inside</think> after",
        "<think>one</think>between<think>two</think>",
        "a<think>1</think>b<think>2</think>c<think>3</think>d",
        "<think></think>",
        "<think></think><think></think>x",
        "<think>never closed",
        "closed</think> only",
        "</think><think>",
        "</think>before<think>inside</think>after",
        "<think>first</think> kept </think> kept too",
        "<think><think>inner</think>outer</think>",
        "<think>a<think>b</think>c<think>d</think>e</think>",
        "<thi<think>x</think>nk>y</think>z",
        "ab<think>x</think><think>y</think>cd",
        "<think>x</think><think>never closed",
        "<think>closed</think><think>",
        "<THINK>capitals</THINK>",
        "<think >a space</think>",
        "<think>a space</think >",
        "< think>x</think>",
        "<think>\nlines\n\nof thought\n</think>\nThe answer.",
        "<think>x</think>\n<think>y</think>\n",
        "<thinking>another tag</thinking>",
        "text <think>with \u{1F600}</think> \u{1F389} after",
        "<think>".repeat(3) + "x" + "</think>".repeat(3),
        "<think>x</think>".repeat(50) + "end",
        "</think>".repeat(3) + "<think>".repeat(3),
      ];
      return {
        each: cases.map((given) => [text(given), text(agent.stripThinkingTags(given))]),
        "a long text": (() => {
          const given = `${"a".repeat(50_000)}<think>${"b".repeat(50_000)}</think>${"c".repeat(50_000)}`;
          const returned = agent.stripThinkingTags(given);
          return { given: given.length, returned: text(returned), isTheTwoEnds: returned === `${"a".repeat(50_000)}${"c".repeat(50_000)}` };
        })(),
        "a text object": attempt(() => agent.stripThinkingTags(new String("a<think>b</think>c"))),
        "a number": attempt(() => agent.stripThinkingTags(5)),
        "nothing": attempt(() => agent.stripThinkingTags()),
        "null": attempt(() => agent.stripThinkingTags(null)),
        "a list": attempt(() => agent.stripThinkingTags(["<think>", "x", "</think>"])),
      };
    },
  },
  {
    name: "the agent's check of a piece that does not loop: one measure, nothing else told",
    run: ({ agent }) => {
      const { context, events } = standInContext();
      const detector = new agent.SingleMessageLoopDetector();
      const clock = ticking();
      const answers = withClock(clock, () => [
        agent.checkForAgentSingleMessageLooping({ detector, newText: "Hello, ", caller: "nal", ctx: context }),
        agent.checkForAgentSingleMessageLooping({ detector, newText: "this is fine.\n", caller: "nal", ctx: context }),
        agent.checkForAgentSingleMessageLooping({ detector, newText: "", caller: "another caller", ctx: context }),
      ]);
      return { answers, fields: answers.map((answer) => Object.keys(answer)), eachAnswerItsOwnObject: answers[0] !== answers[1], events, clockReadings: clock.reads, state: stateOf(detector) };
    },
  },
  {
    name: "the agent's check when a piece repeats on a line: the stop, and everything told at that moment, once",
    run: ({ agent }) => {
      const { context, events } = standInContext();
      const detector = new agent.SingleMessageLoopDetector();
      const before = withClock(still(), () => agent.checkForAgentSingleMessageLooping({ detector, newText: `The answer is ${"no, ".repeat(24)}`, caller: "nal", ctx: context }));
      const eventsBefore = events.length;
      const clock = ticking();
      const atTheStop = withClock(clock, () => agent.checkForAgentSingleMessageLooping({ detector, newText: "no, ".repeat(14), caller: "nal", ctx: context }));
      const toldAtTheStop = events.slice(eventsBefore);
      const eventsAtTheStop = events.length;
      const laterClock = ticking();
      const later = withClock(laterClock, () => [
        agent.checkForAgentSingleMessageLooping({ detector, newText: " more text", caller: "nal", ctx: context }),
        agent.checkForAgentSingleMessageLooping({ detector, newText: "\n", caller: "someone else", ctx: context }),
      ]);
      return {
        before,
        toldBefore: events.slice(0, eventsBefore),
        atTheStop,
        fields: Object.keys(atTheStop),
        toldAtTheStop,
        clockReadingsAtTheStop: clock.reads,
        later,
        toldLater: events.slice(eventsAtTheStop),
        clockReadingsLater: laterClock.reads,
        laterAnswersAreTheirOwnObjects: later[0] !== later[1] && later[0] !== atTheStop,
      };
    },
  },
  {
    name: "the agent's check when lines repeat: the stop has no period, and the pattern told is cut at 200 characters",
    run: ({ agent }) =>
      withClock(still(), () => {
        const ask = (lines) => {
          const { context, events } = standInContext();
          const detector = new agent.SingleMessageLoopDetector();
          let result;
          let fed = 0;
          for (const line of lines) {
            fed += 1;
            result = agent.checkForAgentSingleMessageLooping({ detector, newText: `${line}\n`, caller: "nal", ctx: context });
            if (result.loopDetected) break;
          }
          const logged = events.find((event) => event.logged)?.logged;
          return {
            stoppedAtLine: result.loopDetected ? fed : null,
            result: { ...result, pattern: text(result.pattern) },
            fields: Object.keys(result),
            hasAPeriodField: "period" in result,
            patternLength: result.pattern?.length,
            logged: logged === undefined ? undefined : { ...logged, metadata: { ...logged.metadata, patternPreview: logged.metadata.patternPreview } },
            previewLength: logged?.metadata.patternPreview.length,
            previewIsTheStartOfThePattern: logged === undefined ? undefined : result.pattern.startsWith(logged.metadata.patternPreview.replace(/\.\.\.$/, "")),
            others: events.filter((event) => !event.logged && !event.asked && !(event.metric === "histogram" && event.labels.result === "no_loop_detected")),
          };
        };
        const two = (first, second) => [first, second, first, second, first, second];
        return {
          "a line three times": ask(["I will try that again", "I will try that again", "I will try that again"]),
          "two lines whose pattern is 199 long": ask(two("a".repeat(40) + "b".repeat(59), "c".repeat(40) + "d".repeat(59))),
          "two lines whose pattern is 200 long": ask(two("a".repeat(40) + "b".repeat(59), "c".repeat(40) + "d".repeat(60))),
          "two lines whose pattern is 201 long": ask(two("a".repeat(40) + "b".repeat(60), "c".repeat(40) + "d".repeat(60))),
          "four lines whose pattern is far longer": ask([...[0, 1, 2, 3].map((n) => `${n} `.repeat(45)), ...[0, 1, 2, 3].map((n) => `${n} `.repeat(45))]),
          "lines that never repeat": ask(madeUpAnswer().slice(0, 20)),
        };
      }),
  },
  {
    name: "a piece of exactly 200 or 201 characters repeated on a line: the pattern told whole, or cut with three dots",
    run: ({ agent }) =>
      withClock(still(), () =>
        Object.fromEntries(
          [199, 200, 201, 256].map((period) => {
            const { context, events } = standInContext();
            const detector = new agent.SingleMessageLoopDetector();
            const result = agent.checkForAgentSingleMessageLooping({ detector, newText: piece(period).repeat(4), caller: "nal", ctx: context });
            const logged = events.find((event) => event.logged).logged;
            return [`a piece of ${period}`, { loopDetected: result.loopDetected, period: result.period, repetitions: result.repetitions, patternLength: result.pattern.length, previewLength: logged.metadata.patternPreview.length, previewEndsWithThreeDots: logged.metadata.patternPreview.endsWith("..."), previewStartsThePattern: result.pattern.startsWith(logged.metadata.patternPreview.slice(0, 200)) }];
          }),
        ),
      ),
  },
  {
    name: "the agent's check when the time for a piece runs out: it lets the answer through and says so once",
    run: ({ agent }) => {
      const { context, events } = standInContext();
      const detector = new agent.SingleMessageLoopDetector();
      const long = piece(250).repeat(4).slice(0, 900);
      const clock = ticking();
      const atTheTimeout = withClock(clock, () => agent.checkForAgentSingleMessageLooping({ detector, newText: long, caller: "nal", ctx: context }));
      const told = [...events];
      const laterClock = ticking();
      const later = withClock(laterClock, () => [
        agent.checkForAgentSingleMessageLooping({ detector, newText: "a".repeat(500), caller: "nal", ctx: context }),
        agent.checkForAgentSingleMessageLooping({ detector, newText: "I will try that again\n".repeat(5), caller: "nal", ctx: context }),
      ]);
      return { fed: long.length, atTheTimeout, told, clockReadings: clock.reads, charactersKept: detector.currentLine.length, timedOut: detector.timedOut(), later, toldLater: events.slice(told.length), clockReadingsLater: laterClock.reads };
    },
  },
  {
    name: "the agent's check asks the detector in a fixed order, and believes what it is told",
    run: ({ agent }) => {
      const ask = (says) => {
        const asked = [];
        const detector = {
          loopDetected: () => { asked.push("loopDetected"); return says.loopDetected.shift() ?? false; },
          timedOut: () => { asked.push("timedOut"); return says.timedOut.shift() ?? false; },
          addText: (given) => { asked.push(["addText", given]); return says.addText; },
          getSingleLineLoopInfo: () => { asked.push("getSingleLineLoopInfo"); return says.singleLine ?? null; },
          getMultiLineLoopInfo: () => { asked.push("getMultiLineLoopInfo"); return says.multiLine ?? null; },
        };
        const { context, events } = standInContext();
        const clock = ticking();
        const result = withClock(clock, () => agent.checkForAgentSingleMessageLooping({ detector, newText: "the piece", caller: "the caller", ctx: context }));
        return { result, fields: Object.keys(result), asked, told: events.filter((event) => !event.asked), clockReadings: clock.reads };
      };
      const line = { pattern: "ab", repetitions: 9, period: 2, more: "not passed on" };
      const lines = { pattern: "first\nsecond", repetitions: 2, more: "not passed on" };
      return {
        "already stopped, on a line": ask({ loopDetected: [true], timedOut: [], singleLine: line }),
        "already stopped, on lines": ask({ loopDetected: [true], timedOut: [], multiLine: lines }),
        "already stopped, on both: the line's is told": ask({ loopDetected: [true], timedOut: [], singleLine: line, multiLine: lines }),
        "says it stopped but can say nothing of the loop": ask({ loopDetected: [true], timedOut: [] }),
        "already timed out": ask({ loopDetected: [false], timedOut: [true] }),
        "the piece does not stop it": ask({ loopDetected: [false], timedOut: [false, false], addText: false }),
        "the piece times out": ask({ loopDetected: [false], timedOut: [false, true], addText: false }),
        "the piece stops it, on a line": ask({ loopDetected: [false], timedOut: [false], addText: true, singleLine: line }),
        "the piece stops it, on lines": ask({ loopDetected: [false], timedOut: [false], addText: true, multiLine: lines }),
        "the piece stops it, on both": ask({ loopDetected: [false], timedOut: [false], addText: true, singleLine: line, multiLine: lines }),
        "the piece stops it but nothing can be said of the loop": ask({ loopDetected: [false], timedOut: [false], addText: true }),
        "the piece stops it and it also says it timed out": ask({ loopDetected: [false], timedOut: [false, true], addText: true, singleLine: line }),
        "a truthy answer that is not true": ask({ loopDetected: [false], timedOut: [false], addText: 1, singleLine: line }),
        "a loop with an empty pattern": ask({ loopDetected: [false], timedOut: [false], addText: true, multiLine: { pattern: "", repetitions: 0 } }),
        "a loop on a line with period 0": ask({ loopDetected: [false], timedOut: [false], addText: true, singleLine: { pattern: "x", repetitions: 1, period: 0 } }),
      };
    },
  },
  {
    name: "the agent's check with something missing",
    run: ({ agent }) =>
      withClock(still(), () => {
        const { context } = standInContext();
        const detector = () => new agent.SingleMessageLoopDetector();
        return {
          "nothing given": attempt(() => agent.checkForAgentSingleMessageLooping()),
          "no detector": attempt(() => agent.checkForAgentSingleMessageLooping({ newText: "a", caller: "nal", ctx: context })),
          "no text": attempt(() => agent.checkForAgentSingleMessageLooping({ detector: detector(), caller: "nal", ctx: context })),
          "no context, a piece that does not stop it": attempt(() => agent.checkForAgentSingleMessageLooping({ detector: detector(), newText: "a", caller: "nal" })),
          "no context, once the detector has stopped": (() => {
            const stopped = detector();
            stopped.addText({ newText: "a".repeat(100), caller: "nal" });
            return attempt(() => agent.checkForAgentSingleMessageLooping({ detector: stopped, newText: "a", caller: "nal" }));
          })(),
          "no caller": attempt(() => agent.checkForAgentSingleMessageLooping({ detector: detector(), newText: "a", ctx: context })),
        };
      }),
  },
  {
    name: "long made-up answers streamed in uneven pieces: where the agent's check stops each",
    run: ({ agent }) =>
      withClock(still(), () => {
        const answer = madeUpAnswer();
        const head = answer.slice(0, 44);
        const code = ["Here is the script:", "", "```sh"];
        return {
          "an answer that does not go in circles": streamed(agent, answer),
          "the same answer in smaller pieces": streamed(agent, answer, { most: 3, seed: 7 }),
          "then one sentence, again and again": streamed(agent, [...head, ...Array.from({ length: 10 }, () => "I will check the calendar once more.")]),
          "then one short line, again and again": streamed(agent, [...head, ...Array.from({ length: 30 }, () => "Retrying.")]),
          "then two lines in turn": streamed(agent, [...head, ...Array.from({ length: 10 }, (_, n) => (n % 2 === 0 ? "Calling the calendar tool again." : "The calendar tool gave no events."))]),
          "then five lines in turn": streamed(agent, [...head, ...Array.from({ length: 30 }, (_, n) => `Step ${(n % 5) + 1}: look at it again.`)]),
          "then the same call written out, again and again": streamed(agent, [...head, ...Array.from({ length: 10 }, () => '{"tool":"calendar.list","arguments":{"day":"2026-11-14"}}')]),
          "then the same lines with blank lines between": streamed(agent, [...head, ...Array.from({ length: 12 }, (_, n) => (n % 2 === 0 ? "Let me look at the inbox again." : ""))]),
          "then a numbered list that only counts up": streamed(agent, [...head, ...Array.from({ length: 60 }, (_, n) => `${n + 1}. Look at the next message.`)]),
          "then a phrase on one line, again and again": streamed(agent, [...head, `So ${"and then I looked again, ".repeat(30)}`]),
          "then one word on one line, again and again": streamed(agent, [...head, "very ".repeat(120)]),
          "then a long rule": streamed(agent, [...head, "-".repeat(700), "=".repeat(99), "after the rules"]),
          "then a row of equals signs one longer": streamed(agent, [...head, "=".repeat(100)]),
          "a script whose lines repeat inside a fence": streamed(agent, [...code, ...Array.from({ length: 12 }, () => "curl -s https://example.test/health"), "```"]),
          "a script with the same short line many times inside a fence": streamed(agent, [...code, ...Array.from({ length: 40 }, () => "done"), "```"]),
          "the same script lines after the fence closed at once": streamed(agent, [...code, "```", ...Array.from({ length: 12 }, () => "curl -s https://example.test/health")]),
          "a table whose rows are the same": streamed(agent, ["| Day | Events |", "|-----|--------|", ...Array.from({ length: 10 }, () => "| Monday | none |")]),
          "a table whose rows are the same, longer": streamed(agent, ["| Day | Events |", "|-----|--------|", ...Array.from({ length: 10 }, () => "| Monday | nothing planned |")]),
        };
      }),
  },
];
