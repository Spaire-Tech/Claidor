/**
 * What a hook adds to the model's context, carried from the hook to the model: made (a message of
 * `agent.v1.HookAdditionalContext`, at most 10,000 characters), collected, and written as reminders
 * between `<system_reminder>` tags.
 *
 * Three things to know when reading the answers:
 * - A text longer than 200 characters is kept as its length, its two ends and its SHA-256, not whole.
 * - An error the runtime itself raises for a value of the wrong kind (a number where a text is read, a
 *   list that takes no more) is kept by its class alone: its sentence names a variable, or the way the
 *   code happens to walk a list, and neither is what the part does.
 * - The list of steps that may add context is read once, when the part is loaded. The scenarios that
 *   need another list put a stand-in `Set` on the global object, ask for a load of their own
 *   (`tools.fresh()`), and put the real one back.
 */
import { createHash } from "node:crypto";

export const part = "packages/hooks-carriers";
export const modules = {
  collect: "source/packages/hooks-carriers/collect.ts",
  limits: "source/packages/hooks-carriers/limits.ts",
  errors: "source/packages/hooks-carriers/errors.ts",
  factories: "source/packages/hooks-carriers/factories.ts",
  spec: "source/packages/hooks-carriers/spec.ts",
  reminder: "source/packages/hooks-carriers/hook-additional-context-render.ts",
  render: "source/packages/hooks-carriers/render.ts",
  index: "source/packages/hooks-carriers/index.ts",
};

/** The five steps whose hooks may add context, in the order the engine lists them. */
const STEPS = ["sessionStart", "beforeSubmitPrompt", "preToolUse", "postToolUse", "postToolUseFailure"];

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

/** A carrier as the part made it: what it is, what it holds, and what it is on the wire. */
function carrier(message) {
  return {
    class: message.constructor.name,
    type: message.getType().typeName,
    fields: Object.keys(message),
    hookEventName: message.hookEventName,
    content: text(message.content),
    onTheWire: message.content.length <= 200 ? Buffer.from(message.toBinary()).toString("hex") : createHash("sha256").update(message.toBinary()).digest("hex"),
    asJson: message.content.length <= 200 ? message.toJson() : "(long)",
  };
}

const longText = (length, piece = "abcdefghij") => piece.repeat(Math.ceil(length / piece.length)).slice(0, length);

/** While `run` runs, the engine's list of steps that may add context holds `before` and `after` as well. */
async function withStepsAlso({ before = [], after = [] }, run) {
  const RealSet = globalThis.Set;
  const isTheList = (items) => items.length === STEPS.length && STEPS.every((step, at) => items[at] === step);
  class StandInSet extends RealSet {
    constructor(given) {
      const items = given == null ? [] : [...given];
      super(isTheList(items) ? [...before, ...items, ...after] : items);
    }
  }
  globalThis.Set = StandInSet;
  try {
    return await run();
  } finally {
    globalThis.Set = RealSet;
  }
}

export const scenarios = [
  {
    name: "the most a hook may add to the context is 10,000 characters",
    run: ({ limits }) => ({ limit: limits.HOOK_ADDITIONAL_CONTEXT_MAX_CHARS, kind: typeof limits.HOOK_ADDITIONAL_CONTEXT_MAX_CHARS }),
  },
  {
    name: "the error for too long a context says the step, the length and the limit",
    run: ({ errors }) => {
      const { HookAdditionalContextTooLargeError: TooLarge } = errors;
      const error = new TooLarge({ hookEventName: "preToolUse", actualLength: 10_001, maxLength: 10_000 });
      return {
        error,
        isAnError: error instanceof Error,
        isItsOwnClass: error instanceof TooLarge,
        fields: Object.keys(error),
        written: String(error),
        traceStarts: error.stack.split("\n")[0],
        className: TooLarge.name,
        parameters: TooLarge.length,
      };
    },
  },
  {
    name: "the error is made from whatever it is given, checked or not",
    run: ({ errors }) => {
      const { HookAdditionalContextTooLargeError: TooLarge } = errors;
      const cases = {
        "zeroes and an empty step": { hookEventName: "", actualLength: 0, maxLength: 0 },
        "a length below the limit": { hookEventName: "sessionStart", actualLength: 3, maxLength: 10_000 },
        "texts where numbers go": { hookEventName: "postToolUse", actualLength: "many", maxLength: "few" },
        "nothing in it": {},
        "more than it reads": { hookEventName: "stop", actualLength: 1, maxLength: 2, name: "Another", message: "another", extra: true },
        "a step that is no text": { hookEventName: 7, actualLength: Number.NaN, maxLength: Number.POSITIVE_INFINITY },
      };
      const made = Object.fromEntries(Object.entries(cases).map(([name, given]) => [name, attempt(() => new TooLarge(given))]));
      return {
        made,
        "given nothing at all": attempt(() => new TooLarge()),
        "given null": attempt(() => new TooLarge(null)),
        "called without new": attempt(() => TooLarge({ hookEventName: "preToolUse", actualLength: 1, maxLength: 0 })),
      };
    },
  },
  {
    name: "a carrier is made from a hook's added context, trimmed, under the step's name",
    run: ({ factories }) => {
      const cases = {
        "a word": { hookEventName: "preToolUse", additionalContext: "remember the tests" },
        "space around it": { hookEventName: "postToolUse", additionalContext: "  \n\tkeep it short \r\n " },
        "space inside it stays": { hookEventName: "postToolUseFailure", additionalContext: "first line\n\n  second line\tend" },
        "one character": { hookEventName: "sessionStart", additionalContext: "x" },
        "every kind of space the runtime trims": { hookEventName: "beforeSubmitPrompt", additionalContext: "﻿       　kept　  ﻿" },
        "a zero-width space is not trimmed": { hookEventName: "preToolUse", additionalContext: "​kept​" },
        "reminder tags are left as they are": { hookEventName: "preToolUse", additionalContext: "<system_reminder>inside</system_reminder>" },
        "a step the engine does not know": { hookEventName: "notAStep", additionalContext: "kept all the same" },
        "an empty step name": { hookEventName: "", additionalContext: "kept" },
        "no step name": { additionalContext: "kept" },
        "more than it reads": { hookEventName: "preToolUse", additionalContext: "kept", content: "not read", other: 1 },
      };
      return Object.fromEntries(Object.entries(cases).map(([name, given]) => [name, attempt(() => factories.createHookAdditionalContexts(given).map(carrier))]));
    },
  },
  {
    name: "nothing is carried when a hook added nothing",
    run: ({ factories }) => {
      const cases = {
        "undefined": undefined,
        "null": null,
        "an empty text": "",
        "a space": " ",
        "only spaces and line ends": " \n\t \r\n ",
        "only the other spaces the runtime trims": "﻿   　",
      };
      const answers = Object.fromEntries(Object.entries(cases).map(([name, additionalContext]) => [name, attempt(() => factories.createHookAdditionalContexts({ hookEventName: "preToolUse", additionalContext }))]));
      const first = factories.createHookAdditionalContexts({ hookEventName: "preToolUse", additionalContext: "" });
      const second = factories.createHookAdditionalContexts({ hookEventName: "preToolUse", additionalContext: "" });
      return { answers, "no step and no context": attempt(() => factories.createHookAdditionalContexts({})), aListOfItsOwnEachTime: first !== second };
    },
  },
  {
    name: "a context is carried up to 10,000 characters after trimming, and refused from 10,001",
    run: ({ factories, errors }) => {
      const cases = {
        "9,999 characters": longText(9_999),
        "10,000 characters": longText(10_000),
        "10,001 characters": longText(10_001),
        "10,000 characters with space around": `  \n${longText(10_000)}\t\n   `,
        "10,001 characters with space around": `     ${longText(10_001)}     `,
        "10,000 characters with a space in the middle of 10,002": `${longText(5_000)}  ${longText(5_000)}`,
        "5,000 characters of two units each": "\u{1F600}".repeat(5_000),
        "5,001 characters of two units each": "\u{1F600}".repeat(5_001),
        "100,000 characters": longText(100_000),
      };
      return Object.fromEntries(
        Object.entries(cases).map(([name, additionalContext]) => {
          try {
            const made = factories.createHookAdditionalContexts({ hookEventName: "postToolUse", additionalContext });
            return [name, { carried: made.map(carrier), isTheTextTrimmed: made[0].content === additionalContext.trim() }];
          } catch (error) {
            return [name, { refused: error, isTheTooLargeError: error instanceof errors.HookAdditionalContextTooLargeError, fields: Object.keys(error) }];
          }
        }),
      );
    },
  },
  {
    name: "the refusal names the step it was asked for, whatever the step",
    run: ({ factories }) =>
      Object.fromEntries(
        [...STEPS, "stop", "", undefined].map((hookEventName) => [String(hookEventName), attempt(() => factories.createHookAdditionalContexts({ hookEventName, additionalContext: longText(10_500) }))]),
      ),
  },
  {
    name: "each call makes its own list and its own carrier",
    run: ({ factories }) => {
      const asked = { hookEventName: "preToolUse", additionalContext: " the same " };
      const first = factories.createHookAdditionalContexts(asked);
      const second = factories.createHookAdditionalContexts(asked);
      return {
        howMany: [first.length, second.length],
        anotherList: first !== second,
        anotherCarrier: first[0] !== second[0],
        theSameInside: first[0].equals(second[0]),
        whatWasAskedIsUntouched: asked,
        isAList: Array.isArray(first),
      };
    },
  },
  {
    name: "a context that is no text is read by its own trim, or stops the call",
    run: ({ factories }) => {
      const cases = {
        "a number": 5,
        "zero": 0,
        "false": false,
        "true": true,
        "a list": ["a"],
        "an object": { text: "a" },
        "a text object": new String("  a text object  "),
        "an object with a trim of its own": { trim: () => "from its own trim" },
        "an object whose trim gives nothing": { trim: () => "" },
        "an object whose trim gives undefined": { trim: () => undefined },
        "an object whose trim gives a number": { trim: () => 5 },
        "an object whose trim gives a list of two": { trim: () => ["a", "b"] },
        "an object whose trim gives something 10,001 long": { trim: () => ({ length: 10_001 }) },
      };
      const answers = Object.fromEntries(
        Object.entries(cases).map(([name, additionalContext]) => [
          name,
          attempt(() => factories.createHookAdditionalContexts({ hookEventName: "preToolUse", additionalContext }).map((made) => ({ hookEventName: made.hookEventName, content: made.content }))),
        ]),
      );
      return { answers, "asked with nothing": attempt(() => factories.createHookAdditionalContexts()), "asked with null": attempt(() => factories.createHookAdditionalContexts(null)) };
    },
  },
  {
    name: "carriers are added to a collector, in order, after what it holds",
    run: ({ collect, factories }) => {
      const make = (additionalContext) => factories.createHookAdditionalContexts({ hookEventName: "preToolUse", additionalContext })[0];
      const [one, two, three] = [make("one"), make("two"), make("three")];
      const collector = [one];
      const contexts = [two, three, two];
      const answer = collector.length;
      const returned = collect.appendHookAdditionalContexts(collector, contexts);
      return {
        returned,
        before: answer,
        after: collector.map((held) => held.content),
        theVerySameCarriers: collector[1] === two && collector[2] === three && collector[3] === two,
        theContextsAreUntouched: contexts.map((held) => held.content),
      };
    },
  },
  {
    name: "the collector is handed every carrier in one call, and is not called for none",
    run: ({ collect }) => {
      const calls = [];
      const collector = { push: (...given) => { calls.push(given); return "what push gives back"; } };
      const answers = [
        collect.appendHookAdditionalContexts(collector, []),
        collect.appendHookAdditionalContexts(collector, ["a"]),
        collect.appendHookAdditionalContexts(collector, ["b", "c", "d"]),
        collect.appendHookAdditionalContexts(collector, []),
      ];
      return { answers, calls };
    },
  },
  {
    name: "without a collector nothing is collected, whatever the carriers",
    run: ({ collect }) => {
      const contexts = ["a", "b"];
      return {
        "no collector": attempt(() => collect.appendHookAdditionalContexts(undefined, contexts)),
        "no collector and no carriers": attempt(() => collect.appendHookAdditionalContexts(undefined, [])),
        "no collector and no list": attempt(() => collect.appendHookAdditionalContexts(undefined, undefined)),
        "no collector and null for a list": attempt(() => collect.appendHookAdditionalContexts(undefined, null)),
        "nothing at all": attempt(() => collect.appendHookAdditionalContexts()),
        contexts,
      };
    },
  },
  {
    name: "a collector or a list of another kind",
    run: ({ collect }) => {
      const doubled = ["a", "b"];
      collect.appendHookAdditionalContexts(doubled, doubled);
      const fromText = [];
      const fromSet = [];
      const fromArrayLike = [];
      const frozen = Object.freeze(["kept"]);
      return {
        "a collector that is also the list": doubled,
        "null for a collector, carriers to add": attempt(() => collect.appendHookAdditionalContexts(null, ["a"])),
        "null for a collector, none to add": attempt(() => collect.appendHookAdditionalContexts(null, [])),
        "a collector and no list": attempt(() => collect.appendHookAdditionalContexts([], undefined)),
        "a collector and null for a list": attempt(() => collect.appendHookAdditionalContexts([], null)),
        "a number for a collector": attempt(() => collect.appendHookAdditionalContexts(5, ["a"])),
        "a number for a collector, none to add": attempt(() => collect.appendHookAdditionalContexts(5, [])),
        "a collector that takes no more": [attempt(() => collect.appendHookAdditionalContexts(frozen, ["a"])), [...frozen]],
        "a text for a list": [attempt(() => collect.appendHookAdditionalContexts(fromText, "abc")), fromText],
        "a set for a list (it has no length)": [attempt(() => collect.appendHookAdditionalContexts(fromSet, new Set(["a", "b"]))), fromSet],
        "something with a length that cannot be walked": [attempt(() => collect.appendHookAdditionalContexts(fromArrayLike, { length: 2, 0: "a", 1: "b" })), fromArrayLike],
        "holes in the list": (() => {
          const collector = [];
          // eslint-disable-next-line no-sparse-arrays
          collect.appendHookAdditionalContexts(collector, ["a", , "c"]);
          return { length: collector.length, holds: collector, hasAHole: !(1 in collector) };
        })(),
      };
    },
  },
  {
    name: "each step that may add context has a carrier under its own name",
    run: ({ spec }) => {
      const specs = spec.HOOK_STEP_CARRIER_SPECS;
      const values = Object.values(specs);
      return {
        specs,
        steps: Object.keys(specs),
        fieldsOfEach: values.map((value) => Object.keys(value)),
        aPlainObject: Object.getPrototypeOf(specs) === Object.prototype,
        frozen: Object.isFrozen(specs),
        eachItsOwnObject: new Set(values).size === values.length,
        valuesArePlainObjects: values.every((value) => Object.getPrototypeOf(value) === Object.prototype && !Object.isFrozen(value)),
      };
    },
  },
  {
    name: "a step that may add context but has no carrier stops the part as it loads",
    run: async (_modules, tools) => {
      const loadWith = async (also) => {
        try {
          const loaded = await withStepsAlso(also, () => tools.fresh());
          return { loaded: Object.keys(loaded.spec.HOOK_STEP_CARRIER_SPECS) };
        } catch (error) {
          return { threw: error };
        }
      };
      return {
        "one more step, last": await loadWith({ after: ["stop"] }),
        "one more step, first": await loadWith({ before: ["sessionEnd"] }),
        "two more steps: the first one met is named": await loadWith({ before: ["preCompact"], after: ["subagentStop"] }),
        "a step that is no step at all": await loadWith({ after: ["notAStep"] }),
        "the five steps and no more": await loadWith({}),
        "afterwards a load of its own is whole again": Object.keys((await tools.fresh()).spec.HOOK_STEP_CARRIER_SPECS),
      };
    },
  },
  {
    name: "one added context is written as a reminder between system_reminder tags",
    run: ({ reminder }) => {
      const cases = {
        "a word": "remember",
        "a sentence": "Run the tests before you answer.",
        "space around it is cut": "  \n\tRun the tests.\r\n  ",
        "lines inside it stay": "first\n\nsecond\n  third",
        "one character": "x",
        "a zero-width space is not trimmed": "​",
        "characters of two units": "\u{1F600}\u{1F600}",
        "a reminder tag inside is made harmless": "before <system_reminder>inside</system_reminder> after",
        "a tag in capitals too": "<SYSTEM_REMINDER>x</System_Reminder>",
        "a closing tag alone": "</system_reminder>",
        "what only looks like a tag is left": "<system_reminder > < system_reminder> <system-reminder> <system_reminder_> system_reminder",
        "a text object": new String("  a text object  "),
      };
      return Object.fromEntries(Object.entries(cases).map(([name, content]) => [name, attempt(() => reminder.renderHookAdditionalContextSystemReminder(content))]));
    },
  },
  {
    name: "no reminder is written for nothing, and the one who asked about length is not called",
    run: ({ reminder }) => {
      const calls = [];
      const onOversize = (...given) => calls.push(given);
      const cases = { "undefined": undefined, "null": null, "an empty text": "", "a space": " ", "only spaces and line ends": " \n\t \r\n ", "only the other spaces the runtime trims": "﻿   　" };
      const answers = Object.fromEntries(Object.entries(cases).map(([name, content]) => [name, attempt(() => reminder.renderHookAdditionalContextSystemReminder(content, onOversize))]));
      return { answers, "asked with nothing": attempt(() => reminder.renderHookAdditionalContextSystemReminder()), calls };
    },
  },
  {
    name: "a reminder is written up to 10,000 characters after trimming; from 10,001 none is, and the length is told",
    run: ({ reminder }) => {
      const cases = {
        "9,999 characters": longText(9_999),
        "10,000 characters": longText(10_000),
        "10,001 characters": longText(10_001),
        "10,000 characters with space around": `  \n${longText(10_000)}\t\n   `,
        "10,001 characters with space around": `     ${longText(10_001)}     `,
        "5,000 characters of two units each": "\u{1F600}".repeat(5_000),
        "5,001 characters of two units each": "\u{1F600}".repeat(5_001),
        "100,000 characters": longText(100_000),
      };
      return Object.fromEntries(
        Object.entries(cases).map(([name, content]) => {
          const calls = [];
          const written = reminder.renderHookAdditionalContextSystemReminder(content, function onOversize(...given) {
            calls.push({ given, calledOnNothing: this === undefined });
            return "what the one asked gives back";
          });
          return [name, { written: text(written), isTheTextBetweenTheTags: written === `<system_reminder>\n${content.trim()}\n</system_reminder>`, told: calls }];
        }),
      );
    },
  },
  {
    name: "the length is measured before tags inside are made harmless, so a reminder can be longer than the limit",
    run: ({ reminder }) => {
      const tags = "<system_reminder>".repeat(588) + "abcd";
      const written = reminder.renderHookAdditionalContextSystemReminder(tags);
      return { given: tags.length, written: text(written), lengthBetweenTheTags: written.length - "<system_reminder>\n".length - "\n</system_reminder>".length };
    },
  },
  {
    name: "too long a context with no one to tell, or one who cannot be told",
    run: ({ reminder }) => {
      const tooLong = longText(10_001);
      const failing = () => { throw new Error("the one asked failed"); };
      return {
        "no one to tell": attempt(() => reminder.renderHookAdditionalContextSystemReminder(tooLong)),
        "undefined to tell": attempt(() => reminder.renderHookAdditionalContextSystemReminder(tooLong, undefined)),
        "null to tell": attempt(() => reminder.renderHookAdditionalContextSystemReminder(tooLong, null)),
        "a number to tell": attempt(() => reminder.renderHookAdditionalContextSystemReminder(tooLong, 5)),
        "one who throws": attempt(() => reminder.renderHookAdditionalContextSystemReminder(tooLong, failing)),
        "one who throws is not asked about a short text": attempt(() => reminder.renderHookAdditionalContextSystemReminder("short", failing)),
        "a number to tell is not asked about a short text": attempt(() => reminder.renderHookAdditionalContextSystemReminder("short", 5)),
      };
    },
  },
  {
    name: "a content that is no text is read by its own trim, or stops the reminder",
    run: ({ reminder }) => {
      const cases = {
        "a number": 5,
        "zero": 0,
        "false": false,
        "true": true,
        "a list": ["a"],
        "an object": { text: "a" },
        "an object with a trim of its own": { trim: () => "from its own trim" },
        "an object whose trim gives nothing": { trim: () => "" },
        "an object whose trim gives zero": { trim: () => 0 },
        "an object whose trim gives undefined": { trim: () => undefined },
        "an object whose trim gives a number": { trim: () => 5 },
        "an object whose trim gives something 10,001 long": { trim: () => ({ length: 10_001 }) },
      };
      return Object.fromEntries(
        Object.entries(cases).map(([name, content]) => {
          const calls = [];
          return [name, { ...attempt(() => reminder.renderHookAdditionalContextSystemReminder(content, (...given) => calls.push(given))), told: calls }];
        }),
      );
    },
  },
  {
    name: "the contents of carriers: each trimmed, the blank ones left out, the order kept",
    run: ({ render, factories }) => {
      const make = (hookEventName, additionalContext) => factories.createHookAdditionalContexts({ hookEventName, additionalContext })[0];
      const carriers = [make("preToolUse", "first"), make("postToolUse", "second"), make("preToolUse", "first")];
      const plainOnes = [{ content: "  one  " }, { content: "" }, { content: " \n\t" }, { content: "two\n" }, { content: "  one  " }, { content: "​" }, { hookEventName: "preToolUse", content: "<system_reminder>three</system_reminder>", other: 1 }];
      const long = [{ content: longText(10_001) }, { content: ` ${longText(100_000)} ` }];
      const written = render.renderHookAdditionalContextContents(plainOnes);
      return {
        "none": render.renderHookAdditionalContextContents([]),
        "carriers the part made": render.renderHookAdditionalContextContents(carriers),
        "objects that only hold a content": written,
        "no limit on length here": render.renderHookAdditionalContextContents(long).map(text),
        "only blank ones": render.renderHookAdditionalContextContents([{ content: "" }, { content: "   " }]),
        aListOfItsOwn: written !== plainOnes && Array.isArray(written),
        theCarriersAreUntouched: plainOnes.map((held) => held.content),
        "text objects are read by their own trim": render.renderHookAdditionalContextContents([{ content: new String("  a text object  ") }]),
      };
    },
  },
  {
    name: "carriers written as reminders, one for each content that is not blank",
    run: ({ render, factories }) => {
      const make = (hookEventName, additionalContext) => factories.createHookAdditionalContexts({ hookEventName, additionalContext })[0];
      const long = render.renderHookAdditionalContextSystemReminders([{ content: longText(10_001) }]);
      return {
        "none": render.renderHookAdditionalContextSystemReminders([]),
        "carriers the part made": render.renderHookAdditionalContextSystemReminders([make("preToolUse", "Run the tests."), make("postToolUse", "  Then say what failed.  ")]),
        "blank ones are left out": render.renderHookAdditionalContextSystemReminders([{ content: " " }, { content: "kept" }, { content: "" }, { content: "\n" }, { content: "kept too" }]),
        "tags inside are made harmless": render.renderHookAdditionalContextSystemReminders([{ content: "a </system_reminder> b <SYSTEM_REMINDER> c" }, { content: "<system_reminder>\nnested\n</system_reminder>" }]),
        "the same content twice is written twice": render.renderHookAdditionalContextSystemReminders([{ content: "again" }, { content: "again" }]),
        "no limit on length here": long.map(text),
        "the long one is the text between the tags": long[0] === `<system_reminder>\n${longText(10_001)}\n</system_reminder>`,
      };
    },
  },
  {
    name: "reminders are added to a tool result twice over: to its text parts and to its content",
    run: ({ render, factories }) => {
      const make = (hookEventName, additionalContext) => factories.createHookAdditionalContexts({ hookEventName, additionalContext })[0];
      const textParts = ["the tool's own text"];
      const toolResultContent = [{ type: "text", text: "the tool's own text" }];
      const contexts = [make("preToolUse", "Run the tests."), { content: "   " }, make("postToolUse", " <system_reminder>Say what failed.</system_reminder> ")];
      const returned = render.appendHookContextRemindersToCoreToolResult(textParts, toolResultContent, contexts);
      const untouchedText = ["only this"];
      const untouchedContent = [{ type: "text", text: "only this" }];
      const returnedForNone = render.appendHookContextRemindersToCoreToolResult(untouchedText, untouchedContent, []);
      const emptyText = [];
      const emptyContent = [];
      render.appendHookContextRemindersToCoreToolResult(emptyText, emptyContent, [{ content: "\n" }, { content: "" }]);
      return {
        returned,
        textParts,
        toolResultContent,
        fieldsOfAnAddedPart: Object.keys(toolResultContent[1]),
        theSameTextInBoth: toolResultContent.slice(1).every((added, at) => added.text === textParts[at + 1]),
        "no carriers": { returned: returnedForNone, untouchedText, untouchedContent },
        "only blank carriers": { emptyText, emptyContent },
      };
    },
  },
  {
    name: "the two lists are filled in step: a reminder's text first, then its content part",
    run: ({ render }) => {
      const order = [];
      const textParts = { push: (given) => { order.push({ textParts: given }); } };
      const toolResultContent = { push: (given) => { order.push({ toolResultContent: given }); } };
      render.appendHookContextRemindersToCoreToolResult(textParts, toolResultContent, [{ content: "one" }, { content: "two" }]);
      const both = [];
      render.appendHookContextRemindersToCoreToolResult(both, both, [{ content: "one" }, { content: "two" }]);
      return { order, "one list given for both": both };
    },
  },
  {
    name: "when a tool result cannot take a reminder, what was added before stays",
    run: ({ render }) => {
      const contexts = [{ content: "one" }, { content: "two" }];
      const textWhenContentIsClosed = [];
      const closedContent = Object.freeze([]);
      const contentWhenTextIsClosed = [];
      const closedText = Object.freeze([]);
      const textWhenACarrierIsBad = ["kept"];
      const contentWhenACarrierIsBad = [];
      return {
        "the content takes no more": [attempt(() => render.appendHookContextRemindersToCoreToolResult(textWhenContentIsClosed, closedContent, contexts)), { textParts: textWhenContentIsClosed, toolResultContent: [...closedContent] }],
        "the text parts take no more": [attempt(() => render.appendHookContextRemindersToCoreToolResult(closedText, contentWhenTextIsClosed, contexts)), { textParts: [...closedText], toolResultContent: contentWhenTextIsClosed }],
        "a carrier without a content among good ones: nothing is added": [
          attempt(() => render.appendHookContextRemindersToCoreToolResult(textWhenACarrierIsBad, contentWhenACarrierIsBad, [{ content: "one" }, {}, { content: "three" }])),
          { textParts: textWhenACarrierIsBad, toolResultContent: contentWhenACarrierIsBad },
        ],
        "no lists, carriers to add": attempt(() => render.appendHookContextRemindersToCoreToolResult(undefined, undefined, contexts)),
        "no lists, none to add": attempt(() => render.appendHookContextRemindersToCoreToolResult(undefined, undefined, [])),
        "no lists, only blank carriers": attempt(() => render.appendHookContextRemindersToCoreToolResult(undefined, undefined, [{ content: " " }])),
      };
    },
  },
  {
    name: "carriers of another kind stop the writing",
    run: ({ render }) => {
      const cases = {
        "no list": undefined,
        "null for a list": null,
        "a carrier without a content": [{ hookEventName: "preToolUse" }],
        "a carrier that is null": [null],
        "a content that is a number": [{ content: 5 }],
        "a content that is null": [{ content: null }],
        "a content with a trim of its own that gives a text": [{ content: { trim: () => "from its own trim" } }],
        "a content with a trim of its own that gives a number": [{ content: { trim: () => 5 } }],
        "a content with a trim of its own that gives a list": [{ content: { trim: () => ["a", "b"] } }],
        "a content with a trim of its own that gives an empty list": [{ content: { trim: () => [] } }],
        "a text for a list": "ab",
        "a set for a list": new Set([{ content: "a" }]),
      };
      return Object.fromEntries(
        Object.entries(cases).map(([name, given]) => [
          name,
          {
            contents: attempt(() => render.renderHookAdditionalContextContents(given)),
            reminders: attempt(() => render.renderHookAdditionalContextSystemReminders(given)),
            added: (() => {
              const textParts = [];
              const toolResultContent = [];
              return { ...attempt(() => render.appendHookContextRemindersToCoreToolResult(textParts, toolResultContent, given)), textParts, toolResultContent };
            })(),
          },
        ]),
      );
    },
  },
  {
    name: "the part's one door hands out the very things its files hold",
    run: ({ index, collect, limits, errors, factories, spec, reminder, render }) => {
      const files = { collect, limits, errors, factories, spec, reminder, render };
      const names = Object.keys(index).sort();
      return Object.fromEntries(
        names.map((name) => {
          const from = Object.entries(files).filter(([, file]) => name in file);
          return [name, { from: from.map(([file]) => file), theVerySameThing: from.length === 1 && from[0][1][name] === index[name] }];
        }),
      );
    },
  },
];
