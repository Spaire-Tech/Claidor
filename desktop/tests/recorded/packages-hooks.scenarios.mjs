/**
 * Hooks, as the engine names and checks them: the steps a hook can run at,
 * the check of what a hook answers at each step, the check of a hooks file,
 * the reading of a hooks file written for Claude Code, and the guard that
 * keeps a text from opening or closing a reminder tag.
 *
 * Nothing here reads the machine: no file, no setting, no clock. The
 * console's `warn` is replaced while a hooks file is checked, so that what
 * the check warns about is kept and not printed, and one scenario replaces
 * `RegExp` for the length of a call; both are put back at once.
 */
import vm from "node:vm";

export const part = "packages/hooks";

const FOLDER = "source/packages/hooks";
export const modules = {
  steps: `${FOLDER}/hook-step.ts`,
  types: `${FOLDER}/types.ts`,
  reminder: `${FOLDER}/sanitize-system-reminder.ts`,
  claudeTypes: `${FOLDER}/claude-code-types.ts`,
  mapper: `${FOLDER}/claude-code-mapper.ts`,
  base: `${FOLDER}/validators/base.ts`,
  baseResponse: `${FOLDER}/validators/baseHookResponse.ts`,
  afterAgentResponse: `${FOLDER}/validators/afterAgentResponseResponse.ts`,
  afterAgentThought: `${FOLDER}/validators/afterAgentThoughtResponse.ts`,
  afterEditFile: `${FOLDER}/validators/afterEditFileResponse.ts`,
  afterMCPExecution: `${FOLDER}/validators/afterMCPExecutionResponse.ts`,
  afterShellExecution: `${FOLDER}/validators/afterShellExecutionResponse.ts`,
  afterTabFileEdit: `${FOLDER}/validators/afterTabFileEditResponse.ts`,
  beforeCommand: `${FOLDER}/validators/beforeCommandExecutionHookResponse.ts`,
  beforePromptSubmit: `${FOLDER}/validators/beforePromptSubmitResponse.ts`,
  beforeReadFile: `${FOLDER}/validators/beforeReadFileResponse.ts`,
  beforeTabFileRead: `${FOLDER}/validators/beforeTabFileReadResponse.ts`,
  postToolUseFailure: `${FOLDER}/validators/postToolUseFailureResponse.ts`,
  postToolUse: `${FOLDER}/validators/postToolUseResponse.ts`,
  preCompact: `${FOLDER}/validators/preCompactResponse.ts`,
  preToolUse: `${FOLDER}/validators/preToolUseResponse.ts`,
  sessionEnd: `${FOLDER}/validators/sessionEndResponse.ts`,
  sessionStart: `${FOLDER}/validators/sessionStartResponse.ts`,
  stop: `${FOLDER}/validators/stopResponse.ts`,
  subagentStart: `${FOLDER}/validators/subagentStartResponse.ts`,
  subagentStop: `${FOLDER}/validators/subagentStopResponse.ts`,
  workspaceOpen: `${FOLDER}/validators/workspaceOpenResponse.ts`,
  hooksConfig: `${FOLDER}/validators/hooksConfig.ts`,
};

/** Every check of a hook's answer: the module it is exported from, and its name there. */
const ANSWER_CHECKS = [
  ["baseResponse", "validateBaseHookResponse"], ["afterAgentResponse", "validateAfterAgentResponseResponse"],
  ["afterAgentThought", "validateAfterAgentThoughtResponse"], ["afterEditFile", "validateAfterEditFileResponse"],
  ["afterMCPExecution", "validateAfterMCPExecutionResponse"], ["afterShellExecution", "validateAfterShellExecutionResponse"],
  ["afterTabFileEdit", "validateAfterTabFileEditResponse"], ["beforeCommand", "validateBeforeCommandExecutionHookResponse"],
  ["beforePromptSubmit", "validateBeforePromptSubmitResponse"], ["beforeReadFile", "validateBeforeReadFileResponse"],
  ["beforeTabFileRead", "validateBeforeTabFileReadResponse"], ["postToolUseFailure", "validatePostToolUseFailureResponse"],
  ["postToolUse", "validatePostToolUseResponse"], ["preCompact", "validatePreCompactResponse"], ["preToolUse", "validatePreToolUseResponse"],
  ["sessionEnd", "validateSessionEndResponse"], ["sessionStart", "validateSessionStartResponse"], ["stop", "validateStopResponse"],
  ["subagentStart", "validateSubagentStartResponse"], ["subagentStop", "validateSubagentStopResponse"],
  ["workspaceOpen", "validateWorkspaceOpenResponse"],
];

/** A case that cannot be written out as it is (a date, a map, an object made by a class): the words say what it is. */
class Named {
  constructor(words, value) {
    this.words = words;
    this.value = value;
  }
}
const named = (words, value) => new Named(words, value);

/**
 * A case's value written out, so that the answers file says what was asked.
 * Only plain data can be written out; anything else needs words of its own.
 */
function shown(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value).replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return `Symbol(${value.description})`;
  if (Array.isArray(value)) {
    const items = [];
    for (let at = 0; at < value.length; at += 1) items.push(at in value ? shown(value[at]) : "<nothing>");
    return `[${items.join(", ")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).map((key) => `${key}: ${shown(value[key])}`).join(", ")}}`;
  }
  throw new Error("a case that is not plain data needs words of its own: named(words, value)");
}

/** What a call gave back, or what it threw. */
function tried(run) {
  try {
    return run();
  } catch (error) {
    return { threw: error };
  }
}

/** Every case asked, each answer under the words of its case, in the order of the cases. */
function table(cases, ask) {
  const answers = {};
  for (const one of cases) {
    const words = one instanceof Named ? one.words : shown(one);
    // A key that is a whole number would move to the front of the object.
    const label = /^\d+$/.test(words) ? `the number ${words}` : words;
    if (Object.hasOwn(answers, label)) throw new Error(`two cases are written ${label}`);
    answers[label] = tried(() => ask(one instanceof Named ? one.value : one));
  }
  return answers;
}

/** The cases that got each answer, under the answer as it is written: for many cases that are answered alike. */
function byAnswer(cases, ask, tools) {
  const groups = {};
  for (const [words, answer] of Object.entries(table(cases, ask))) (groups[JSON.stringify(tools.plain(answer))] ??= []).push(words);
  return groups;
}

/** One field given each thing in turn: an object holding only that field. */
function withField(field, things) {
  return things.map((thing) => (thing instanceof Named ? named(`{${field}: ${thing.words}}`, { [field]: thing.value }) : { [field]: thing }));
}

/** How a table is held: whether it can still be changed, and what kind of thing it is. */
function held(thing) {
  const prototype = Object.getPrototypeOf(thing);
  const kinds = [[Object.prototype, "a plain object"], [Array.prototype, "a list"], [Set.prototype, "a set"], [null, "an object with no prototype"]];
  return {
    is: kinds.find(([one]) => one === prototype)?.[1] ?? "something else",
    frozen: Object.isFrozen(thing),
    sealed: Object.isSealed(thing),
    canGrow: Object.isExtensible(thing),
  };
}

/** Things that are not objects with fields: what every check refuses. */
const NOT_OBJECTS = () => [
  undefined, null, true, false, 0, 1, NaN, "", "text", "{}", [],
  [{}],
  [1, 2], 10n, Symbol("mark"),
  named("a function", () => ({})),
  named("a list made in another realm", vm.runInNewContext("[{}]")),
];

/** Objects of every make, none with a field any check reads. */
const BARE_OBJECTS = () => [
  {}, { unknown: "field" },
  named("an object with no prototype", Object.create(null)),
  named("an object made in another realm", vm.runInNewContext("({})")),
  named("a date", new Date(0)),
  named("a map", new Map()),
  named("a set", new Set()),
  named("a pattern", /a/),
  named("an error", new Error("an error")),
  named("a String object", new String("text")),
  named("bytes", new Uint8Array(2)),
  named("an object made by a class", new (class Answer {})()),
];

/** Things of every kind, to put where a text, a yes or no, a list or an object is expected. */
const THINGS = () => [
  undefined, null, true, false, 0, 1, -1, 1.5, NaN, "", " ", "text", [], ["text"], {}, { a: 1 }, 10n, Symbol("mark"),
  named("a function", () => "text"),
  named("a String object", new String("text")),
  named("a Boolean object", new Boolean(true)),
  named("a Number object", new Number(1)),
  named("a date", new Date(0)),
  named("a map", new Map([["a", "b"]])),
  named("an object with no prototype", Object.create(null)),
];

/** What a permission can be written as, right and wrong. */
const PERMISSION_WORDS = () => [
  "allow", "deny", "ask", "Allow", "ALLOW", "allow ", " deny", "ask\n", "allow,deny", "allowed", "yes", ["allow"], [["ask"]], ["allow", "deny"],
  { toString: 1 },
  named("a String object \"deny\"", new String("deny")),
  named("an object that prints as \"ask\"", { toString: () => "ask" }),
];

/** A hooks file checked, with what was written to the console's warnings meanwhile (the real console is not written to). */
function checkedFile(hooksConfig, file) {
  const warned = [];
  const real = console.warn;
  console.warn = (...words) => {
    warned.push(words);
  };
  try {
    const answer = tried(() => hooksConfig.validateHooksConfig(file));
    return warned.length === 0 ? answer : { answer, warned };
  } finally {
    console.warn = real;
  }
}

/** A hooks file with one script, under the stop step. */
const fileWith = (script) => ({ version: 1, hooks: { stop: [script] } });

/** Scripts checked one at a time, each alone in a file. */
const scriptsChecked = (hooksConfig, scripts) => table(scripts, (script) => checkedFile(hooksConfig, fileWith(script)));

/** A hooks file of Claude Code's read, with what the logger was told meanwhile. */
function read(mapper, hooks) {
  const said = [];
  const logger = {
    warn: (...words) => {
      said.push(["warn", ...words]);
    },
    info: (...words) => {
      said.push(["info", ...words]);
    },
  };
  const answer = tried(() => mapper.transformClaudeHooksToConfig(hooks, logger));
  return { answer, said };
}

/** A script that every reading keeps. */
const kept = () => ({ type: "command", command: "check" });

/** `RegExp` replaced for the length of one call, and what it was asked to make. */
function withRegExp(make, run) {
  const real = globalThis.RegExp;
  const asked = [];
  globalThis.RegExp = function StandIn(...given) {
    asked.push(given);
    return make(...given);
  };
  try {
    return { answer: run(), asked };
  } finally {
    globalThis.RegExp = real;
  }
}

/** Matchers of tools, as Claude Code's files write them, and things that are not matchers. */
const TOOL_MATCHERS = () => [
  undefined, null, "", "*", 0, false, "Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Shell", "bash", "BASH",
  "MultiEdit", "NotebookEdit", "Unknown", "Bash|Read", "Read|Bash", "Write|Edit", "Edit|Write", "Edit|Edit", "Bash|Bash", "Shell|Bash", "Bash|Shell",
  "Unknown|Unknown", "Bash|Read|Write|Edit|Glob|Grep|WebFetch|WebSearch|Task", " Bash ", " Bash | Read ", "\tEdit\n|Write", "Bash |Shell",
  "Glob|Bash", "Bash|Glob", "Glob|Glob", " Glob ", "Glob|Unknown", "glob", "mcp__server__tool", "mcp__server__tool__more", "mcp__server__",
  "mcp__server", "mcp__", "mcp____", "mcp", "mcp_server_tool", "MCP__server__tool", " mcp__server__tool ", "mcp__server__*",
  "mcp__one__tool|mcp__two__tool", "mcp__server__Bash|Bash", "mcp__server__tool|Glob", "xmcp__server__tool", "Bash|", "|Bash", "|", "||", " ", " | ",
  "*|Bash", "Bash|*", " * ", "**", "Bash.*", "^(Bash|Read)$", "Bash(git *)", "toString", "constructor", "__proto__", "hasOwnProperty",
  "__proto__|__proto__", "toString|toString", "valueOf|Bash", "\u00a0Bash\ufeff|\u2003Edit", "Ba sh", "B|a|s|h", 5, true, ["Bash"], {},
  named("a String object \"Bash\"", new String("Bash")),
  named("a String object \"*\"", new String("*")),
];

/** Matchers as written on the events that have no tool, and things that are not matchers. */
const TRIGGER_MATCHERS = () => [
  undefined, null, "", "*", "startup", "resume", "clear", "compact", "manual", "auto", "Startup", " startup", "startup|resume", "other", "Bash",
  "Glob", 0, 5, true, ["startup"], ["manual"], {},
];

/** Scripts as Claude Code's files write them, right and wrong. */
const CLAUDE_SCRIPTS = () => [
  { type: "command", command: "check" }, { command: "check" }, { type: "command" }, { type: "command", command: "" },
  { type: "command", command: " " }, {}, { type: "prompt", prompt: "Is this safe?" }, { type: "prompt" }, { type: "prompt", prompt: "" },
  { type: "prompt", prompt: " " }, { type: "prompt", command: "check" }, { type: "prompt", prompt: "Is this safe?", command: "check" },
  { prompt: "Is this safe?" }, { prompt: "Is this safe?", command: "check" }, { type: "command", prompt: "Is this safe?" },
  { type: "other", command: "check" }, { type: "PROMPT", prompt: "Is this safe?", command: "check" }, { type: "Prompt", prompt: "Is this safe?" },
  { type: null, command: "check" }, { type: 5, command: "check" },
  { type: ["prompt"], prompt: "Is this safe?", command: "check" },
  { command: 5 }, { command: 0 }, { command: true }, { command: false }, { command: null },
  { command: ["check"] },
  { command: [] },
  { command: { run: "check" } },
  { type: "prompt", prompt: 5 }, { type: "prompt", prompt: 0 },
  { type: "prompt", prompt: ["Is this safe?"] },
  { type: "prompt", prompt: null }, { command: "check", timeout: 30 }, { command: "check", timeout: 0 }, { command: "check", timeout: -1 },
  { command: "check", timeout: 1.5 }, { command: "check", timeout: null }, { command: "check", timeout: "30" },
  { command: "check", timeout: undefined }, { command: "check", timeout: false },
  { command: "check", timeout: {} },
  { command: "check", timeout: NaN }, { type: "prompt", prompt: "Is this safe?", timeout: 5, model: "fast" },
  { command: "check", matcher: "own", loop_limit: 3, failClosed: true, model: "fast", description: "words", version: 2 },
  { timeout: 30, command: "check", type: "command" }, null, undefined, 0, 5, "", "text", true, [],
  [{ command: "check" }],
  named("a script whose command comes from a prototype", Object.create({ command: "check", timeout: 9 })),
];

/** Entries of an event as Claude Code's files write them, right and wrong. */
const CLAUDE_ENTRIES = () => [
  { hooks: [] },
  { hooks: [{ command: "one" }, { type: "prompt", prompt: "two" }, {}, { command: "three" }] },
  {}, { matcher: "Bash" }, { hooks: null }, { hooks: 5 }, { hooks: true },
  { hooks: {} },
  { hooks: "" }, { hooks: "ab" },
  { hooks: { 0: { command: "check" }, length: 1 } },
  { matcher: "Glob" }, { matcher: "Glob", hooks: 5 }, { matcher: "startup" }, { matcher: "manual", hooks: 5 }, null, undefined, 0, 5, "text", true,
  [],
  [{ command: "check" }],
  named("a set of scripts", { hooks: new Set([{ command: "check" }]) }),
];

/** Each text after the guard, under the text as it was given. */
const guarded = (reminder, texts) => table(texts, (text) => reminder.sanitizeSystemReminderContent(text));

export const scenarios = [
  // ---- The names ----
  {
    name: "the twenty-one steps a hook can run at, each under its own name, in this order",
    run: ({ steps }) => {
      const { HookStep } = steps;
      return {
        HookStep,
        count: Object.keys(HookStep).length,
        namesThatAreNotTheirValue: Object.entries(HookStep).filter(([name, value]) => name !== value),
        held: held(HookStep),
      };
    },
  },
  {
    name: "the steps whose hooks may add context, the steps that ask for permission, and the one step of a workspace's life",
    run: ({ types }) => ({
      HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT: types.HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT,
      PERMISSION_HOOK_STEPS: types.PERMISSION_HOOK_STEPS,
      WORKSPACE_LIFECYCLE_STEPS: types.WORKSPACE_LIFECYCLE_STEPS,
      held: {
        HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT: held(types.HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT),
        PERMISSION_HOOK_STEPS: held(types.PERMISSION_HOOK_STEPS),
        WORKSPACE_LIFECYCLE_STEPS: held(types.WORKSPACE_LIFECYCLE_STEPS),
      },
    }),
  },
  {
    name: "the check of an answer for each step, in the map's own order, and which export each one is",
    run: (all) => {
      const map = all.types.HookResponseValidatorMap;
      const exportedAs = (check) => ANSWER_CHECKS.filter(([key, name]) => all[key][name] === check).map(([key, name]) => `${key}.${name}`);
      return {
        steps: Object.keys(map),
        checks: Object.fromEntries(Object.entries(map).map(([step, check]) => [step, { is: check, exportedAs: exportedAs(check) }])),
        stepsWithNoCheck: Object.values(all.steps.HookStep).filter((step) => typeof map[step] !== "function"),
        held: held(map),
      };
    },
  },
  {
    name: "every function the part exports: its own name, how many things it must be given, and whether it is of the kind that `new` can make",
    run: (all) => {
      const facts = {};
      for (const key of Object.keys(modules)) {
        for (const name of Object.keys(all[key]).sort()) {
          const value = all[key][name];
          if (typeof value === "function") facts[`${key}.${name}`] = { name: value.name, takes: value.length, newCanMakeIt: Object.hasOwn(value, "prototype") };
        }
      }
      return facts;
    },
  },
  {
    name: "the checks that are one function under several names, and the two that only look alike",
    run: (all) => {
      const one = (key, name) => all[key][name];
      const base = one("baseResponse", "validateBaseHookResponse");
      return {
        theBaseCheckUnderOtherNames: Object.fromEntries(
          ["afterAgentResponse", "afterAgentThought", "afterEditFile", "afterMCPExecution", "afterShellExecution", "afterTabFileEdit", "sessionEnd"].map((key) => {
            const [, name] = ANSWER_CHECKS.find(([module]) => module === key);
            return [name, one(key, name) === base];
          }),
        ),
        afterAToolIsTheSameAsAfterItFails: one("postToolUse", "validatePostToolUseResponse") === one("postToolUseFailure", "validatePostToolUseFailureResponse"),
        aHelperStoppingIsTheSameAsStopping: one("subagentStop", "validateSubagentStopResponse") === one("stop", "validateStopResponse"),
        readingAFileAndReadingATabFileAreTwo: one("beforeReadFile", "validateBeforeReadFileResponse") !== one("beforeTabFileRead", "validateBeforeTabFileReadResponse"),
        beforeACommandAndBeforeAToolAreTwo: one("beforeCommand", "validateBeforeCommandExecutionHookResponse") !== one("preToolUse", "validatePreToolUseResponse"),
      };
    },
  },
  {
    name: "Claude Code's events and tools, and what each is called here",
    run: ({ claudeTypes }) => {
      const names = ["CLAUDE_EVENT_TO_SIMEON_STEP", "SIMEON_STEP_TO_CLAUDE_EVENT", "CLAUDE_TOOL_TO_SIMEON_TOOL", "UNSUPPORTED_CLAUDE_TOOLS", "UNSUPPORTED_CLAUDE_EVENTS"];
      return {
        ...Object.fromEntries(names.map((name) => [name, claudeTypes[name]])),
        held: Object.fromEntries(names.map((name) => [name, held(claudeTypes[name])])),
      };
    },
  },

  // ---- The small tests the checks are built from ----
  {
    name: "isString: only a text itself, not an object that holds one",
    run: ({ base }) => ({ ...table(THINGS(), (thing) => base.isString(thing)), "given nothing": base.isString() }),
  },
  {
    name: "isObject: anything with fields that is not a list, whatever made it and wherever",
    run: ({ base }) => ({
      ...table([...NOT_OBJECTS(), ...BARE_OBJECTS()], (thing) => base.isObject(thing)),
      "a list seen through a proxy": base.isObject(new Proxy([], {})),
      "an object seen through a proxy": base.isObject(new Proxy({}, {})),
      "a class": base.isObject(class {}),
      "given nothing": base.isObject(),
    }),
  },
  {
    name: "createValidationResult: the two things it is given, under isValid and errors, and a new empty list when given none",
    run: ({ base }) => {
      const list = ["first", "second"];
      const withList = base.createValidationResult(false, list);
      const [one, other] = [base.createValidationResult(true), base.createValidationResult(true)];
      return {
        valid: one,
        notValid: base.createValidationResult(false),
        withList,
        theListIsTheOneGiven: withList.errors === list,
        aNewListEachTime: one.errors !== other.errors,
        fields: Object.keys(withList),
        undefinedForTheList: base.createValidationResult(true, undefined),
        nullForTheList: base.createValidationResult(true, null),
        aTextForTheList: base.createValidationResult(false, "not a list"),
        validIsKeptAsGiven: [base.createValidationResult("yes"), base.createValidationResult(0, []), base.createValidationResult(null)],
        givenNothing: base.createValidationResult(),
        aThirdThingIsNotKept: base.createValidationResult(true, [], "third"),
      };
    },
  },
  {
    name: "validateOptionalString: one sentence added to the list for anything but a text or nothing, and nothing given back",
    run: ({ base }) => {
      const list = ["already there"];
      const returned = [base.validateOptionalString(5, "first", list), base.validateOptionalString("fine", "second", list), base.validateOptionalString(null, "third", list)];
      return {
        things: table(THINGS(), (thing) => {
          const errors = [];
          const back = base.validateOptionalString(thing, "field", errors);
          return back === undefined ? errors : { back, errors };
        }),
        addedAtTheEnd: list,
        returned,
        names: table(["", "a.b[0]", "two words", 5, undefined, null], (name) => {
          const errors = [];
          base.validateOptionalString(0, name, errors);
          return errors;
        }),
        noListAndNothingToSay: tried(() => base.validateOptionalString("fine", "field", undefined)),
        noListAndSomethingToSay: tried(() => base.validateOptionalString(5, "field", undefined)),
        aSetForTheList: tried(() => base.validateOptionalString(5, "field", new Set())),
      };
    },
  },

  // ---- What every check of an answer shares ----
  {
    name: "every check refuses what is not an object, in the same two words",
    run: (all, tools) => Object.fromEntries(ANSWER_CHECKS.map(([key, name]) => [name, { ...byAnswer(NOT_OBJECTS(), (thing) => all[key][name](thing), tools), "given nothing": all[key][name]() }])),
  },
  {
    name: "every check accepts an object that holds none of its fields, whatever made it",
    run: (all, tools) => Object.fromEntries(ANSWER_CHECKS.map(([key, name]) => [name, byAnswer(BARE_OBJECTS(), (thing) => all[key][name](thing), tools)])),
  },
  {
    name: "every answer is a new object with a list of its own, open to change",
    run: (all) =>
      Object.fromEntries(
        ANSWER_CHECKS.map(([key, name]) => {
          const check = all[key][name];
          const [right, rightAgain, wrong, wrongAgain] = [check({}), check({}), check(null), check(null)];
          wrong.errors.push("added by the caller");
          return [
            name,
            {
              newEachTime: right !== rightAgain && right.errors !== rightAgain.errors && wrong !== wrongAgain && wrong.errors !== wrongAgain.errors,
              fields: [Object.keys(right), Object.keys(wrong)],
              anyFrozen: [right, right.errors, wrong, wrong.errors].some((thing) => Object.isFrozen(thing)),
              plainObjects: [right, wrong].every((thing) => Object.getPrototypeOf(thing) === Object.prototype),
              afterTheCallerAdded: [wrong, check(null)],
            },
          ];
        }),
      ),
  },
  {
    name: "the base check, and the six after-steps and the session's end that are the base check: any object is right",
    run: (all) => {
      const cases = () => [{}, { permission: "no", user_message: 5, continue: "x", env: 5, pluginPaths: 5, followup_message: 5, additional_context: 5 }, [], null];
      return Object.fromEntries(
        ["baseResponse", "afterAgentResponse", "afterAgentThought", "afterEditFile", "afterMCPExecution", "afterShellExecution", "afterTabFileEdit", "sessionEnd"].map((key) => {
          const [, name] = ANSWER_CHECKS.find(([module]) => module === key);
          return [name, table(cases(), (answer) => all[key][name](answer))];
        }),
      );
    },
  },

  // ---- The check of an answer, step by step ----
  {
    name: "before a shell command or an MCP tool runs: permission is allow, deny or ask, and the two messages are texts",
    run: ({ beforeCommand }) => {
      const check = beforeCommand.validateBeforeCommandExecutionHookResponse;
      return {
        permission: table(withField("permission", [...PERMISSION_WORDS(), ...THINGS()]), check),
        user_message: table(withField("user_message", THINGS()), check),
        agent_message: table(withField("agent_message", THINGS()), check),
        together: table(
          [
            { permission: "allow", user_message: "Shown to the person", agent_message: "Told to the agent" },
            { permission: "no", user_message: 1, agent_message: 2 }, { agent_message: 2, user_message: 1, permission: "no" },
            { permission: "ask", continue: "x", additional_context: 5, updated_input: 5, followup_message: 5, env: 5, unknown: true },
            named("permission \"no\" that comes from a prototype", Object.create({ permission: "no" })),
            named("an object made by a class, its user_message 5", new (class Answer { user_message = 5; })()),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "before a prompt is sent: continue is a yes or a no, the message and the added context are texts",
    run: ({ beforePromptSubmit }) => {
      const check = beforePromptSubmit.validateBeforePromptSubmitResponse;
      return {
        continue: table(withField("continue", THINGS()), check),
        user_message: table(withField("user_message", THINGS()), check),
        additional_context: table(withField("additional_context", THINGS()), check),
        together: table(
          [
            { continue: false, user_message: "Not now", additional_context: "The person is away" },
            { continue: "no", user_message: 1, additional_context: 2 }, { additional_context: 2, user_message: 1, continue: "no" },
            { continue: true, permission: "no", agent_message: 5, unknown: true },
            named("continue \"no\" that comes from a prototype", Object.create({ continue: "no" })),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "before a file is read, and before a tab file read: permission is allow or deny, never ask, and the message is a text",
    run: ({ beforeReadFile, beforeTabFileRead }) => {
      const asked = (check) => ({
        permission: table(withField("permission", [...PERMISSION_WORDS(), ...THINGS()]), check),
        user_message: table(withField("user_message", THINGS()), check),
        together: table(
          [
            { permission: "deny", user_message: "This file is private" }, { permission: "ask", user_message: 1 },
            { user_message: 1, permission: "ask" }, { permission: "allow", agent_message: 5, continue: "x", unknown: true },
            named("permission \"ask\" that comes from a prototype", Object.create({ permission: "ask" })),
          ],
          check,
        ),
      });
      return { validateBeforeReadFileResponse: asked(beforeReadFile.validateBeforeReadFileResponse), validateBeforeTabFileReadResponse: asked(beforeTabFileRead.validateBeforeTabFileReadResponse) };
    },
  },
  {
    name: "after a tool is used, and after one fails: the added context is a text",
    run: ({ postToolUse, postToolUseFailure }) => {
      const asked = (check) => ({
        additional_context: table(withField("additional_context", THINGS()), check),
        together: table(
          [
            { additional_context: "The tests were run" }, { additional_context: 5, user_message: 5, permission: "no", unknown: true },
            named("additional_context 5 that comes from a prototype", Object.create({ additional_context: 5 })),
          ],
          check,
        ),
      });
      return { validatePostToolUseFailureResponse: asked(postToolUseFailure.validatePostToolUseFailureResponse), validatePostToolUseResponse: asked(postToolUse.validatePostToolUseResponse) };
    },
  },
  {
    name: "before a conversation is shortened: an object with no field of its own is right unread, and the message is a text",
    run: ({ preCompact }) => {
      const check = preCompact.validatePreCompactResponse;
      const hidden = Object.defineProperty({}, "user_message", { value: 5, enumerable: false });
      return {
        user_message: table(withField("user_message", THINGS()), check),
        together: table(
          [
            { user_message: "Shortening now" }, { user_message: 5, permission: "no", unknown: true }, { unknown: true },
            named("user_message 5 that comes from a prototype, and no field of its own", Object.create({ user_message: 5 })),
            named("user_message 5 that comes from a prototype, and one field of its own", Object.assign(Object.create({ user_message: 5 }), { unknown: true })),
            named("user_message 5 that is its own but is not listed", hidden),
            named("user_message 5 that is not listed, beside a field that is", Object.defineProperty({ unknown: true }, "user_message", { value: 5, enumerable: false })),
            named("an object made by a class, its user_message 5", new (class Answer { user_message = 5; })()),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "before a tool is used: permission, the two messages, a new input that is an object, and the added context",
    run: ({ preToolUse }) => {
      const check = preToolUse.validatePreToolUseResponse;
      return {
        permission: table(withField("permission", [...PERMISSION_WORDS(), ...THINGS()]), check),
        user_message: table(withField("user_message", THINGS()), check),
        agent_message: table(withField("agent_message", THINGS()), check),
        updated_input: table(withField("updated_input", [...THINGS(), { command: "ls" }, [{ command: "ls" }], named("a list made in another realm", vm.runInNewContext("[]")), named("an object made by a class", new (class Input {})())]), check),
        additional_context: table(withField("additional_context", THINGS()), check),
        together: table(
          [
            { permission: "allow", user_message: "Shown to the person", agent_message: "Told to the agent", updated_input: { command: "ls -la" }, additional_context: "Run in the project folder" },
            { permission: "no", user_message: 1, agent_message: 2, updated_input: 3, additional_context: 4 },
            { additional_context: 4, updated_input: 3, agent_message: 2, user_message: 1, permission: "no" },
            { permission: "deny", continue: "x", followup_message: 5, env: 5, unknown: true },
            named("updated_input 3 that comes from a prototype", Object.create({ updated_input: 3 })),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "when a session starts: env is an object whose every value is a text, then the added context, continue and the message",
    run: ({ sessionStart }) => {
      const check = sessionStart.validateSessionStartResponse;
      return {
        env: table(
          withField("env", [
            ...THINGS(),
            { PATH: "/bin", HOME: "/home/person" }, { A: "", B: " " }, { A: 1 }, { A: null }, { A: undefined }, { A: true },
            { A: ["x"] },
            { A: { B: "x" } },
            { B: 1, A: "fine", C: null }, { b: 0, 2: 0, a: 0, 1: 0 }, { "": 1 }, { 'say "hi"': 1 },
            named("{A: a String object}", { A: new String("x") }),
            named("values that only a prototype holds", Object.create({ A: 1 })),
            named("a value under the name __proto__", JSON.parse('{"__proto__": 1}')),
            named("a value under a symbol, and one that is not listed", Object.defineProperty({ [Symbol("mark")]: 1 }, "HIDDEN", { value: 1, enumerable: false })),
            named("a list made in another realm", vm.runInNewContext("[1]")),
          ]),
          check,
        ),
        additional_context: table(withField("additional_context", THINGS()), check),
        continue: table(withField("continue", THINGS()), check),
        user_message: table(withField("user_message", THINGS()), check),
        together: table(
          [
            { env: { TOKEN: "abc" }, additional_context: "A new session", continue: true, user_message: "Welcome" },
            { env: { A: 1, B: 2 }, additional_context: 3, continue: 4, user_message: 5 },
            { user_message: 5, continue: 4, additional_context: 3, env: { B: 2, A: 1 } },
            { env: 0, additional_context: 3, continue: 4, user_message: 5 },
            { env: {}, permission: "no", followup_message: 5, unknown: true },
            named("continue 4 that comes from a prototype", Object.create({ continue: 4 })),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "when the agent stops, and when a subagent does: the follow-up message is a text",
    run: ({ stop, subagentStop }) => {
      const asked = (check) => ({
        followup_message: table(withField("followup_message", THINGS()), check),
        together: table(
          [
            { followup_message: "Now run the tests" }, { followup_message: 5, user_message: 5, permission: "no", unknown: true },
            named("followup_message 5 that comes from a prototype", Object.create({ followup_message: 5 })),
          ],
          check,
        ),
      });
      return { validateStopResponse: asked(stop.validateStopResponse), validateSubagentStopResponse: asked(subagentStop.validateSubagentStopResponse) };
    },
  },
  {
    name: "before a subagent starts: permission is read as it prints, so a list holding the one word is right, and the message is a text",
    run: ({ subagentStart }) => {
      const check = subagentStart.validateSubagentStartResponse;
      return {
        permission: table(
          withField("permission", [...PERMISSION_WORDS(), ...THINGS(), [[]], ["deny", ""], { valueOf: 1, toString: 2 }, named("an object that prints as \"no\"", { toString: () => "no" }), named("an object whose worth is \"allow\" but that prints as itself", { valueOf: () => "allow" })]),
          check,
        ),
        user_message: table(withField("user_message", THINGS()), check),
        together: table(
          [
            { permission: "deny", user_message: "No helpers here" }, { permission: "no", user_message: 1 }, { user_message: 1, permission: "no" },
            { permission: "ask", agent_message: 5, continue: "x", unknown: true },
            named("permission \"no\" that comes from a prototype", Object.create({ permission: "no" })),
          ],
          check,
        ),
      };
    },
  },
  {
    name: "when a workspace opens: pluginPaths is a list, and each thing in it a text that is not blank",
    run: ({ workspaceOpen }) => {
      const check = workspaceOpen.validateWorkspaceOpenResponse;
      return {
        pluginPaths: table(
          withField("pluginPaths", [
            ...THINGS(),
            ["/plugins/one"], ["/plugins/one", "/plugins/two"], ["relative/path", "~/plugins", "."], [""], [" "], ["\t\n"], [" "], ["﻿"], [" "],
            ["​"], [" a "], [1], [null], [undefined], [true], [["/plugins/one"]],
            [{}],
            ["/plugins/one", 1, "", " ", null, "/plugins/two", undefined], [, "", , 5], { 0: "/plugins/one", length: 1 },
            named("[a String object]", [new String("/plugins/one")]),
            named("a list made in another realm, the second path empty", vm.runInNewContext('["/plugins/one", ""]')),
            named("a set of paths", new Set(["/plugins/one"])),
          ]),
          check,
        ),
        together: table(
          [
            { pluginPaths: ["/plugins/one"], user_message: 5, permission: "no", unknown: true },
            named("pluginPaths [5] that comes from a prototype", Object.create({ pluginPaths: [5] })),
          ],
          check,
        ),
      };
    },
  },

  // ---- The check of a hooks file ----
  {
    name: "a hooks file is an object",
    run: ({ hooksConfig }) => ({
      ...table([...NOT_OBJECTS(), named("a list holding a right file", [{ version: 1, hooks: {} }])], (file) => checkedFile(hooksConfig, file)),
      "given nothing": tried(() => hooksConfig.validateHooksConfig()),
    }),
  },
  {
    name: "a hooks file's version is a whole number, 1 or more",
    run: ({ hooksConfig }) =>
      table(
        withField("version", [
          undefined, null, true, false, "", "1", [], [1], {}, 1, 2, 100, 0, -0, -1, 0.5, 1.5, 0.9999999999999999, 1.0000000000000002, NaN, Infinity,
          -Infinity, 1e21, 9007199254740991, 9007199254740992, 5e-324, 10n,
          named("a Number object", new Number(1)),
        ]),
        (file) => checkedFile(hooksConfig, { ...file, hooks: {} }),
      ),
  },
  {
    name: "a hooks file's hooks is an object, and without one nothing more is looked at",
    run: ({ hooksConfig }) => ({
      "with version 1": table(
        withField("hooks", [
          undefined, null, true, 0, "", "text", [],
          [[{ command: "check" }]],
          {},
          named("a function", () => ({})),
          named("a map of hooks", new Map([["unknown", 5]])),
          named("a date", new Date(0)),
          named("an object with no prototype, its stop a right list", Object.assign(Object.create(null), { stop: [{ command: "check" }] })),
          named("an object with no prototype, its stop not a list", Object.assign(Object.create(null), { stop: 5 })),
          named("hooks that only a prototype holds", Object.create({ unknown: 5 })),
          named("a hook under a symbol, and one that is not listed", Object.defineProperty({ [Symbol("mark")]: 5 }, "unknown", { value: 5, enumerable: false })),
        ]),
        (file) => checkedFile(hooksConfig, { version: 1, ...file }),
      ),
      "with no version": table([{}, { hooks: {} }, { hooks: 5 }, { hooks: { unknown: 5 } }], (file) => checkedFile(hooksConfig, file)),
      "with other fields": table(
        [
          { version: 1, hooks: {}, description: "words", unknown: true },
          { hooks: {}, version: 1 },
          named("a file made by a class", new (class File { version = 1; hooks = {}; })()),
          named("a file whose fields come from a prototype", Object.create({ version: 1, hooks: {} })),
          named("a map", new Map([["version", 1]])),
        ],
        (file) => checkedFile(hooksConfig, file),
      ),
    }),
  },
  {
    name: "stop_hook_loop_limit is no longer read: a warning says so, whatever it holds, once the hooks are an object",
    run: ({ hooksConfig }) =>
      table(
        [
          { version: 1, hooks: {}, stop_hook_loop_limit: 5 },
          { version: 1, hooks: {}, stop_hook_loop_limit: 0 },
          { version: 1, hooks: {}, stop_hook_loop_limit: null },
          { version: 1, hooks: {}, stop_hook_loop_limit: "five" },
          { version: 1, hooks: {}, stop_hook_loop_limit: undefined },
          { version: 1, hooks: {} },
          { version: 1, hooks: 5, stop_hook_loop_limit: 5 }, { stop_hook_loop_limit: 5 },
          { version: 0, hooks: {}, stop_hook_loop_limit: 5 },
          { version: 1, hooks: { stop: [{ command: "check", timeout: 4000 }], unknown: 5 }, stop_hook_loop_limit: 5 },
        ],
        (file) => checkedFile(hooksConfig, file),
      ),
  },
  {
    name: "a hook is named by a step's value, and every one of the twenty-one is known",
    run: ({ hooksConfig, steps }) => ({
      everyStep: Object.fromEntries(Object.values(steps.HookStep).map((step) => [step, checkedFile(hooksConfig, { version: 1, hooks: { [step]: [{ command: "check" }] } })])),
      allAtOnce: checkedFile(hooksConfig, { version: 1, hooks: Object.fromEntries(Object.values(steps.HookStep).map((step) => [step, [{ command: "check" }, { type: "prompt", prompt: "Is this safe?" }]])) }),
    }),
  },
  {
    name: "a hook under any other name is refused with the list of the names, and what it holds is not looked at",
    run: ({ hooksConfig }) => ({
      ...table(["PreToolUse", "Stop", "STOP", "stop ", " stop", "", "unknown", "toString", "constructor", "0", "stop,preToolUse"], (name) => checkedFile(hooksConfig, { version: 1, hooks: { [name]: [{ command: "check" }] } })),
      "a hook named __proto__": checkedFile(hooksConfig, JSON.parse('{"version": 1, "hooks": {"__proto__": [{"command": "check"}]}}')),
      "an unknown name holding what is not a list": checkedFile(hooksConfig, { version: 1, hooks: { unknown: 5 } }),
      "unknown names among known ones, in the file's order": checkedFile(hooksConfig, { version: 1, hooks: { first: 1, stop: [{}], second: 2, preToolUse: [{ command: "check" }], third: 3 } }),
    }),
  },
  {
    name: "a hook holds a list of scripts; a hook that holds nothing is passed over",
    run: ({ hooksConfig }) => ({
      ...table(
        withField("stop", [
          undefined, null, true, 0, "", "check", {}, { command: "check" },
          { 0: { command: "check" }, length: 1 },
          [],
          [{ command: "check" }],
          [{ command: "check" }, { command: "again" }],
          named("a set of scripts", new Set([{ command: "check" }])),
          named("a list made in another realm", vm.runInNewContext('[{ command: "check" }, {}]')),
        ]),
        (hooks) => checkedFile(hooksConfig, { version: 1, hooks }),
      ),
      "two hooks that are not lists": checkedFile(hooksConfig, { version: 1, hooks: { stop: 5, preToolUse: "check", sessionStart: [{ command: "check" }] } }),
    }),
  },
  {
    name: "a script is an object; anything else in the list is refused under its place in the list",
    run: ({ hooksConfig }) => ({
      ...scriptsChecked(hooksConfig, [undefined, null, true, 0, 5, "", "check", [], [{ command: "check" }], 10n, Symbol("mark"), named("a function", () => ({}))]),
      "a list with a gap before a right script": checkedFile(hooksConfig, { version: 1, hooks: { stop: [, { command: "check" }] } }),
      "wrong scripts among right ones": checkedFile(hooksConfig, { version: 1, hooks: { preToolUse: [{ command: "check" }, null, { command: "check" }, "check", {}] } }),
    }),
  },
  {
    name: "a script's type: a command when it says so or says nothing, a prompt when it says so, and nothing else",
    run: ({ hooksConfig }) =>
      scriptsChecked(
        hooksConfig,
        withField("type", [
          undefined, "command", "prompt", "", " ", "Command", "PROMPT", "prompt ", "agent", "http", 'a "quoted" kind', null, true, false, 0, 5, [],
          ["prompt"], ["command"], {}, { toString: 1 }, 10n, Symbol("mark"),
          named("a String object \"prompt\"", new String("prompt")),
        ]).map((script) => (script instanceof Named ? named(script.words, { ...script.value, command: "check", prompt: "Is this safe?" }) : named(shown(script), { ...script, command: "check", prompt: "Is this safe?" }))),
      ),
  },
  {
    name: "a command script's command is a text, and an empty one will do",
    run: ({ hooksConfig }) => ({
      "with no type": scriptsChecked(hooksConfig, [
        {},
        ...withField("command", [undefined, null, true, false, 0, 1, "", " ", "check", 'echo "hi"', "two\nlines", [], ["check"], {}, 10n, Symbol("mark"), named("a String object", new String("check")), named("a function", () => "check")]),
        { command: "check", prompt: 5, model: 5 },
        { command: "check", description: "words", env: { A: "b" }, cwd: "/", hooks: [], unknown: true },
        named("a command that comes from a prototype", Object.create({ command: "check" })),
        named("a script made by a class", new (class Script { command = "check"; })()),
      ]),
      "with the type command": scriptsChecked(hooksConfig, [{ type: "command" }, { type: "command", command: "check" }, { type: "command", command: "" }, { type: "command", command: 5 }, { type: "command", prompt: "Is this safe?" }]),
    }),
  },
  {
    name: "a prompt script's prompt is a text that is not blank; its model, when there is one, too; its command is not read",
    run: ({ hooksConfig }) => ({
      prompt: scriptsChecked(
        hooksConfig,
        withField("prompt", [undefined, null, true, 0, 1, "", " ", "\t\n", " ", "﻿", "​", "Is this safe?", " padded ", [], ["Is this safe?"], {}, named("a String object", new String("Is this safe?"))]).map((script) =>
          script instanceof Named ? named(script.words, { type: "prompt", ...script.value }) : named(shown(script), { type: "prompt", ...script }),
        ),
      ),
      model: scriptsChecked(
        hooksConfig,
        withField("model", [undefined, null, true, 0, 1, "", " ", "\n", " ", "fast", " fast ", [], ["fast"], {}, named("a String object", new String("fast"))]).map((script) =>
          script instanceof Named ? named(script.words, { type: "prompt", prompt: "Is this safe?", ...script.value }) : named(shown(script), { type: "prompt", prompt: "Is this safe?", ...script }),
        ),
      ),
      together: scriptsChecked(hooksConfig, [
        { type: "prompt" }, { type: "prompt", command: "check" }, { type: "prompt", command: 5, prompt: "Is this safe?" },
        { type: "prompt", prompt: "", model: "" }, { type: "prompt", prompt: 5, model: 5 }, { type: "prompt", model: "fast" },
        { type: "prompt", prompt: "Is this safe?", model: "fast", description: "words", unknown: true },
        named("a prompt that comes from a prototype", Object.assign(Object.create({ prompt: "Is this safe?" }), { type: "prompt" })),
      ]),
    }),
  },
  {
    name: "a script's matcher is a text the runtime can read as a pattern; an empty one and a lone star are not tried",
    run: ({ hooksConfig }) => ({
      "on a command": scriptsChecked(
        hooksConfig,
        withField("matcher", [
          undefined, null, true, false, 0, 1, [], ["Shell"], {}, "", "*", " ", " *", "* ", "**", "*a", "a*", "Shell", "Shell|Read", "^(Shell|Read)$",
          "MCP:.*", "MCP:*", "Shell|*", "a|*", "\\d+", "x{1,2}", "a{,5}", "]", "}", "(", ")", "[", "a{2,1}", "[b-a]", "+", "?", "\\", "(?<name>",
          "(?<name>a)(?<name>b)", "(?<=a)+", 'say "hi" (', "two\nlines (",
          named("a String object \"Shell\"", new String("Shell")),
        ]).map((script) => (script instanceof Named ? named(script.words, { command: "check", ...script.value }) : named(shown(script), { command: "check", ...script }))),
      ),
      "on a prompt": scriptsChecked(hooksConfig, [
        { type: "prompt", prompt: "Is this safe?", matcher: "Shell" }, { type: "prompt", prompt: "Is this safe?", matcher: "(" },
        { type: "prompt", prompt: "Is this safe?", matcher: 5 },
      ]),
      "on a script of no known type": scriptsChecked(hooksConfig, [{ type: "agent", matcher: "(" }]),
    }),
  },
  {
    name: "whatever the pattern maker throws ends the sentence about the matcher: its message, or itself as it prints when it has none",
    run: ({ hooksConfig }) => {
      const thrown = [
        ["an error", () => new Error("the pattern is wrong")], ["an error with an empty message", () => new Error("")],
        ["a text", () => "thrown as a text"], ["null", () => null], ["undefined", () => undefined], ["the number 0", () => 0],
        ["an object with a message", () => ({ message: "from an object" })],
        ["an object whose message is a number", () => ({ message: 0 })],
        ["an object whose message is null", () => ({ message: null })],
        ["an object with no message", () => ({ code: "E_PATTERN" })],
        ["an object with no message that prints as a text of its own", () => ({ toString: () => "printed" })],
      ];
      const file = () => ({ version: 1, hooks: { stop: [{ command: "check", matcher: "Shell" }, { command: "check", matcher: "" }, { command: "check", matcher: "*" }, { command: "check", matcher: 5 }] } });
      return {
        ...Object.fromEntries(
          thrown.map(([words, make]) => [
            words,
            withRegExp(
              () => {
                throw make();
              },
              () => checkedFile(hooksConfig, file()),
            ),
          ]),
        ),
        "a maker that throws nothing, whatever the matcher": withRegExp(
          () => ({}),
          () => checkedFile(hooksConfig, { version: 1, hooks: { stop: [{ command: "check", matcher: "(" }] } }),
        ),
      };
    },
  },
  {
    name: "a script's timeout is a number above 0, in seconds; above 3600 it is right but warned about",
    run: ({ hooksConfig }) => ({
      ...scriptsChecked(
        hooksConfig,
        withField("timeout", [
          undefined, null, true, false, "", "30", [], [30], {}, 10n, 1, 30, 0.001, 5e-324, 0, -0, -0.001, -1, 3599, 3600, 3600.0001, 3601, 86400,
          1e21, 1.7976931348623157e308, NaN, Infinity, -Infinity,
          named("a Number object", new Number(30)),
        ]).map((script) => (script instanceof Named ? named(script.words, { command: "check", ...script.value }) : named(shown(script), { command: "check", ...script }))),
      ),
      "two long timeouts, and one on a script that is wrong": checkedFile(hooksConfig, {
        version: 1,
        hooks: { stop: [{ command: "check", timeout: 7200 }, { command: "check", timeout: 60 }], preToolUse: [{ timeout: 3601 }, { type: "prompt", prompt: "Is this safe?", timeout: 1e6 }] },
      }),
      "a long timeout under an unknown name is not read": checkedFile(hooksConfig, { version: 1, hooks: { unknown: [{ command: "check", timeout: 7200 }] } }),
    }),
  },
  {
    name: "a script's loop_limit is a whole number above 0, or null for no limit",
    run: ({ hooksConfig }) =>
      scriptsChecked(
        hooksConfig,
        withField("loop_limit", [
          undefined, null, 1, 2, 5, 100, 0, -0, -1, 0.5, 1.5, -1.5, NaN, Infinity, -Infinity, 1e21, 9007199254740991, "", "3", true, false, [], [3],
          {}, 10n,
          named("a Number object", new Number(3)),
        ]).map((script) => (script instanceof Named ? named(script.words, { command: "check", ...script.value }) : named(shown(script), { command: "check", ...script }))),
      ),
  },
  {
    name: "a script's failClosed is a yes or a no",
    run: ({ hooksConfig }) =>
      scriptsChecked(
        hooksConfig,
        withField("failClosed", [undefined, true, false, null, 0, 1, "", "true", [], {}, named("a Boolean object", new Boolean(true))]).map((script) =>
          script instanceof Named ? named(script.words, { command: "check", ...script.value }) : named(shown(script), { command: "check", ...script }),
        ),
      ),
  },
  {
    name: "a file with many mistakes: each script's are joined under its place, hook after hook, after the file's own",
    run: ({ hooksConfig }) => ({
      "one script, everything wrong (a prompt)": checkedFile(hooksConfig, fileWith({ type: "prompt", prompt: "", model: "", matcher: "(", timeout: 0, loop_limit: 0, failClosed: "no" })),
      "one script, everything wrong (a command)": checkedFile(hooksConfig, fileWith({ command: 5, matcher: 5, timeout: "long", loop_limit: "many", failClosed: 5 })),
      "one script, everything wrong (no known type)": checkedFile(hooksConfig, fileWith({ type: "agent", command: 5, prompt: 5, model: 5, matcher: "[", timeout: -1, loop_limit: 1.5, failClosed: null })),
      "the fields in another order": checkedFile(hooksConfig, fileWith({ failClosed: "no", loop_limit: 0, timeout: 0, matcher: "(", model: "", prompt: "", type: "prompt" })),
      "a whole file": checkedFile(hooksConfig, {
        version: "one",
        stop_hook_loop_limit: 3,
        hooks: {
          sessionStart: [{ command: "greet" }],
          Stop: [{ command: "check" }],
          stop: [{ command: "check", loop_limit: -1 }, { command: "check" }, 5, { type: "prompt", timeout: 9000 }],
          preToolUse: "check",
          afterFileEdit: [{ command: "format", matcher: "Write", timeout: 10, loop_limit: null, failClosed: false }],
          beforeShellExecution: [{ type: "prompt", prompt: "Is this command safe?", model: "fast", failClosed: true, matcher: "*" }, { type: "http", url: "https://example.invalid" }],
        },
      }),
      "a right file as a plugin writes one": checkedFile(hooksConfig, {
        version: 1,
        hooks: {
          preToolUse: [{ type: "command", command: "./check.sh", matcher: "Shell|Write", timeout: 30, loop_limit: null, failClosed: false }],
          stop: [{ type: "prompt", prompt: "Is the work done?", loop_limit: 3 }],
        },
      }),
    }),
  },
  {
    name: "the names of the steps are read when a file is checked: a step added later is known at once, by its value",
    run: ({ hooksConfig, steps, types, claudeTypes }) => {
      const file = () => ({ version: 1, hooks: { afterLater: [{ command: "check" }], later: [{ command: "check" }], stop: [{ command: "check" }] } });
      const before = checkedFile(hooksConfig, file());
      const realStop = steps.HookStep.stop;
      try {
        steps.HookStep.later = "afterLater";
        const added = checkedFile(hooksConfig, file());
        steps.HookStep.stop = "halt";
        return {
          before,
          added,
          renamed: checkedFile(hooksConfig, file()),
          theOtherTablesStay: {
            stopHasItsCheck: typeof types.HookResponseValidatorMap.stop === "function",
            haltHasNone: types.HookResponseValidatorMap.halt === undefined,
            claudeStop: claudeTypes.CLAUDE_EVENT_TO_SIMEON_STEP.Stop,
            stopsEvent: claudeTypes.SIMEON_STEP_TO_CLAUDE_EVENT.stop,
          },
        };
      } finally {
        steps.HookStep.stop = realStop;
        delete steps.HookStep.later;
      }
    },
  },

  // ---- Reading a hooks file written for Claude Code ----
  {
    name: "each of Claude Code's ten events: eight become a step, two are said to be unsupported",
    run: ({ mapper, claudeTypes }) => ({
      ...Object.fromEntries(Object.keys(claudeTypes.CLAUDE_EVENT_TO_SIMEON_STEP).map((event) => [event, read(mapper, { [event]: [{ hooks: [kept()] }] })])),
      "all ten at once, in another order": read(mapper, Object.fromEntries(Object.keys(claudeTypes.CLAUDE_EVENT_TO_SIMEON_STEP).reverse().map((event) => [event, [{ hooks: [{ type: "command", command: `on ${event}` }] }]]))),
      "no event at all": read(mapper, {}),
    }),
  },
  {
    name: "an event that is not one of the ten is said to be unknown, but a name every object has is taken for a step",
    run: ({ mapper }) => ({
      ...table(["Unknown", "pretooluse", "preToolUse", "stop", "Stop ", "", "0", "PreToolUse|PostToolUse", "toString", "constructor", "hasOwnProperty", "valueOf"], (event) => read(mapper, { [event]: [{ hooks: [kept()] }] })),
      "an event named __proto__": read(mapper, JSON.parse('{"__proto__": [{"hooks": [{"type": "command", "command": "check"}]}]}')),
      "an event named toString with nothing to keep": read(mapper, { toString: [] }),
      "unknown events among known ones": read(mapper, { First: [], Stop: [{ hooks: [kept()] }], Second: 5, Notification: 5, SessionEnd: [{ hooks: [kept()] }] }),
    }),
  },
  {
    name: "an event holds a list of entries: anything else is said to be wrong, nothing at all is passed over, and an unsupported event is not looked at",
    run: ({ mapper }) => {
      const values = () => [undefined, null, true, false, 0, 5, "", "text", {}, { hooks: [{ command: "check" }] }, [], named("a set of entries", new Set([{ hooks: [{ command: "check" }] }])), named("a list made in another realm", vm.runInNewContext('[{ hooks: [{ command: "check" }] }]'))];
      return Object.fromEntries(["PreToolUse", "SessionStart", "Stop", "Notification", "Unknown"].map((event) => [event, table(values(), (value) => read(mapper, { [event]: value }))]));
    },
  },
  {
    name: "what is read is not an object of events: nothing and null cannot be read, a text is read letter by letter, a list by its places",
    run: ({ mapper }) => ({
      ...table([undefined, null, true, 5, "", "ab", [], [[{ hooks: [{ command: "check" }] }]], named("a map of events", new Map([["Stop", []]])), named("events that only a prototype holds", Object.create({ Stop: [{ hooks: [{ command: "check" }] }] })), named("an event that is not listed, and one under a symbol", Object.defineProperty({ [Symbol("mark")]: [] }, "Stop", { value: [{ hooks: [{ command: "check" }] }], enumerable: false }))], (hooks) => read(mapper, hooks)),
      "given nothing": tried(() => mapper.transformClaudeHooksToConfig()),
    }),
  },
  {
    name: "the matcher of a tool, before and after its use: Claude Code's names become the names here, an MCP tool loses its server's name, and what is left is kept as written",
    run: ({ mapper }) => ({
      PreToolUse: table(TOOL_MATCHERS(), (matcher) => read(mapper, { PreToolUse: [{ matcher, hooks: [kept()] }] })),
      PostToolUse: table(TOOL_MATCHERS(), (matcher) => read(mapper, { PostToolUse: [{ matcher, hooks: [kept()] }] })),
      "an entry with no matcher": [read(mapper, { PreToolUse: [{ hooks: [kept()] }] }), read(mapper, { PostToolUse: [{ hooks: [kept()] }] })],
    }),
  },
  {
    name: "a matcher on the other events is never kept: on a session's start and before shortening, a trigger that Claude Code knows is warned about, and no other",
    run: ({ mapper }) => Object.fromEntries(["SessionStart", "PreCompact", "UserPromptSubmit", "Stop", "SubagentStop", "SessionEnd"].map((event) => [event, table(TRIGGER_MATCHERS(), (matcher) => read(mapper, { [event]: [{ matcher, hooks: [kept()] }] }))])),
  },
  {
    name: "a script of Claude Code's: a prompt when its type says so and it has one, otherwise a command when it has one, otherwise dropped; no loop limit, never fail-closed, its timeout as written",
    run: ({ mapper }) => ({
      "with no matcher": table(CLAUDE_SCRIPTS(), (script) => read(mapper, { Stop: [{ hooks: [script] }] })),
      "under a tool's matcher": table(CLAUDE_SCRIPTS(), (script) => read(mapper, { PreToolUse: [{ matcher: "Bash", hooks: [script] }] })),
    }),
  },
  {
    name: "what a script holds is handed on as it is: the very object, not a copy, and the file read is left as it was",
    run: ({ mapper }) => {
      const command = { run: "check" };
      const prompt = ["Is this safe?"];
      const timeout = { seconds: 5 };
      const hooks = { Stop: [{ hooks: [{ command, timeout }, { type: "prompt", prompt }] }], PreToolUse: [{ matcher: "Bash|Edit", hooks: [{ type: "command", command: "check" }] }] };
      const before = JSON.stringify(hooks);
      const config = mapper.transformClaudeHooksToConfig(hooks);
      const again = mapper.transformClaudeHooksToConfig(hooks);
      return {
        config,
        sameCommand: config.hooks.stop[0].command === command,
        sameTimeout: config.hooks.stop[0].timeout === timeout,
        samePrompt: config.hooks.stop[1].prompt === prompt,
        theScriptIsNew: config.hooks.preToolUse[0] !== hooks.PreToolUse[0].hooks[0],
        theFileIsAsItWas: JSON.stringify(hooks) === before,
        aNewAnswerEachTime: config !== again && config.hooks !== again.hooks && config.hooks.stop !== again.hooks.stop && config.hooks.stop[0] !== again.hooks.stop[0],
        held: { config: held(config), hooks: held(config.hooks), list: held(config.hooks.stop), script: held(config.hooks.stop[0]) },
        fields: [Object.keys(config), Object.keys(config.hooks), Object.keys(config.hooks.preToolUse[0])],
      };
    },
  },
  {
    name: "an entry of an event holds a list of scripts under hooks: what is not an entry, or has no list, stops the reading with the runtime's own words",
    run: ({ mapper }) => ({
      ...Object.fromEntries(["PreToolUse", "SessionStart", "Stop"].map((event) => [event, table(CLAUDE_ENTRIES(), (entry) => read(mapper, { [event]: [entry] }))])),
      "a gap in the list of entries, before a right one": read(mapper, { Stop: [, { hooks: [kept()] }] }),
      "a gap in the list of scripts, before a right one": read(mapper, { Stop: [{ hooks: [, kept()] }] }),
    }),
  },
  {
    name: "the entries of an event follow one another, the events keep the file's order, and an event with nothing kept is left out",
    run: ({ mapper }) => ({
      "several entries and scripts": read(mapper, {
        PostToolUse: [
          { matcher: "Edit|Write", hooks: [{ type: "command", command: "format" }, { type: "command", command: "lint", timeout: 60 }] },
          { matcher: "Glob", hooks: [{ type: "command", command: "never" }] },
          { hooks: [{ type: "prompt", prompt: "Was that right?" }] },
          { matcher: "mcp__files__write|Bash", hooks: [{ type: "command" }, { type: "command", command: "log" }] },
        ],
        Stop: [{ hooks: [] }, { hooks: [{}] }],
        SessionEnd: [],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "note" }] }, { hooks: [{ type: "command", command: "note" }] }],
        PreToolUse: [{ matcher: "Glob", hooks: [{ type: "command", command: "never" }] }],
        PreCompact: [{ matcher: "auto", hooks: [{ type: "command", command: "save" }] }],
        SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "greet" }] }, { matcher: "resume", hooks: [{ type: "prompt", prompt: "Where were we?" }] }],
      }),
      "an entry that stops the reading, after others": read(mapper, {
        PreToolUse: [{ matcher: "Glob|Bash", hooks: [kept()] }, { matcher: "Glob", hooks: [kept()] }, { matcher: "Bash" }, { matcher: "Glob" }],
        Stop: [{ hooks: [kept()] }],
      }),
      "a script that stops the reading, after others": read(mapper, { SessionStart: [{ matcher: "clear", hooks: [kept(), null, kept()] }], Unknown: [] }),
    }),
  },
  {
    name: "the logger is told through its own warn, one text at a time, and its info is never used; with no logger nothing is said",
    run: ({ mapper }) => {
      const hooks = () => ({ Notification: [], Unknown: [], Stop: "text", PreToolUse: [{ matcher: "Glob", hooks: [] }], SessionStart: [{ matcher: "startup", hooks: [] }] });
      const calls = [];
      const logger = {
        warn(...words) {
          calls.push({ calledOnTheLogger: this === logger, words });
        },
        info(...words) {
          calls.push({ info: words });
        },
      };
      const told = mapper.transformClaudeHooksToConfig(hooks(), logger);
      const onlyWarn = [];
      return {
        calls,
        told,
        withNoLogger: mapper.transformClaudeHooksToConfig(hooks()),
        withUndefined: mapper.transformClaudeHooksToConfig(hooks(), undefined),
        withOnlyAWarn: [mapper.transformClaudeHooksToConfig(hooks(), { warn: (text) => void onlyWarn.push(text) }), onlyWarn],
        nullAndNothingToSay: tried(() => mapper.transformClaudeHooksToConfig({ Stop: [{ hooks: [kept()] }] }, null)),
      };
    },
  },
  {
    name: "a logger that cannot be told stops the reading at the first thing to say, wherever that is",
    run: ({ mapper }) => {
      const places = () => ({
        "an unsupported event": { Notification: [] },
        "an unknown event": { Unknown: [] },
        "an event that holds no list": { Stop: "text" },
        "a tool that is not supported": { PreToolUse: [{ matcher: "Glob|Bash", hooks: [] }] },
        "a trigger": { PreCompact: [{ matcher: "manual", hooks: [] }] },
      });
      const afterOne = () => {
        const said = [];
        const answer = tried(() =>
          mapper.transformClaudeHooksToConfig(
            { PostToolUse: [{ matcher: "Glob", hooks: [] }] },
            {
              warn(text) {
                said.push(text);
                delete this.warn;
              },
            },
          ),
        );
        return { answer, said };
      };
      return {
        "a logger with no warn": Object.fromEntries(Object.entries(places()).map(([words, hooks]) => [words, tried(() => mapper.transformClaudeHooksToConfig(hooks, {}))])),
        "null for the logger": Object.fromEntries(Object.entries(places()).map(([words, hooks]) => [words, tried(() => mapper.transformClaudeHooksToConfig(hooks, null))])),
        "a warn that throws": Object.fromEntries(
          Object.entries(places()).map(([words, hooks]) => [
            words,
            tried(() =>
              mapper.transformClaudeHooksToConfig(hooks, {
                warn(text) {
                  throw new Error(`could not say: ${text}`);
                },
              }),
            ),
          ]),
        ),
        "a warn that is gone after one use, when every tool of a matcher is unsupported": afterOne(),
      };
    },
  },
  {
    name: "the warnings about a matcher's tools are given once the whole matcher is read: when the reading stops midway, nothing has been said",
    run: ({ mapper }) => {
      /** A matcher that is not a text but splits itself into the given pieces. No file can hold one. */
      const splitting = (...pieces) => ({ split: () => pieces, toString: () => "a matcher that splits itself" });
      const asked = (matcher) => {
        const { answer, said } = read(mapper, { PreToolUse: [{ matcher, hooks: [kept()] }] });
        // What is thrown here names the reading's own inner words, so only its kind is kept.
        return { answer: answer?.threw instanceof Error ? { threwA: answer.threw.name } : answer, said };
      };
      return {
        "Glob, then Bash": asked(splitting("Glob", "Bash")),
        "Glob, then Bash, then something that is not a text": asked(splitting("Glob", "Bash", 5)),
        "Glob twice and nothing more": asked(splitting("Glob", "Glob")),
      };
    },
  },
  {
    name: "the tables of events and tools are read at each reading: what is added to them later counts at once",
    run: ({ mapper, claudeTypes }) => {
      const { CLAUDE_EVENT_TO_SIMEON_STEP: events, CLAUDE_TOOL_TO_SIMEON_TOOL: tools, UNSUPPORTED_CLAUDE_EVENTS: unsupportedEvents, UNSUPPORTED_CLAUDE_TOOLS: unsupportedTools } = claudeTypes;
      const file = () => ({
        Stop: [{ hooks: [{ type: "command", command: "first" }] }],
        Later: [{ hooks: [{ type: "command", command: "second" }] }],
        Never: [{ hooks: [{ type: "command", command: "third" }] }],
        PreToolUse: [{ matcher: "Mine|Other|Bash", hooks: [kept()] }, { matcher: "Other", hooks: [kept()] }],
      });
      const before = read(mapper, file());
      try {
        events.Later = "stop";
        events.Never = null;
        tools.Mine = "Shell";
        tools.Other = null;
        const added = read(mapper, file());
        unsupportedEvents.push("Stop");
        unsupportedTools.push("Other");
        const unsupported = read(mapper, file());
        return { before, added, unsupported, theStepsOfEventsStay: claudeTypes.SIMEON_STEP_TO_CLAUDE_EVENT };
      } finally {
        delete events.Later;
        delete events.Never;
        delete tools.Mine;
        delete tools.Other;
        if (unsupportedEvents.at(-1) === "Stop") unsupportedEvents.pop();
        if (unsupportedTools.at(-1) === "Other") unsupportedTools.pop();
      }
    },
  },

  {
    name: "a list too long to be handed on in one go stops the reading, and the check of a file, with the runtime's own refusal; the length that counts is one entry's kept scripts, or one hook's mistakes",
    run: ({ mapper, hooksConfig }) => {
      const script = { command: "check" };
      const many = (count, thing) => new Array(count).fill(thing);
      const counted = (config) => ({ kept: config.hooks.stop.length, first: config.hooks.stop[0], last: config.hooks.stop.at(-1) });
      const mistakes = (answer) => ({ isValid: answer.isValid, mistakes: answer.errors.length, first: answer.errors[0], last: answer.errors.at(-1) });
      return {
        "read: 50,000 scripts in one entry": counted(mapper.transformClaudeHooksToConfig({ Stop: [{ hooks: many(50000, script) }] })),
        "read: 50,000 scripts in each of three entries": counted(mapper.transformClaudeHooksToConfig({ Stop: [1, 2, 3].map(() => ({ hooks: many(50000, script) })) })),
        "read: 300,000 scripts in one entry": tried(() => mapper.transformClaudeHooksToConfig({ Stop: [{ hooks: many(300000, script) }] })),
        "read: 300,000 scripts in one entry, none of them kept": tried(() => mapper.transformClaudeHooksToConfig({ Stop: [{ hooks: many(300000, {}) }] })),
        "checked: 50,000 wrong scripts in one hook": mistakes(checkedFile(hooksConfig, { version: 1, hooks: { stop: many(50000, 0) } })),
        "checked: 50,000 wrong scripts in each of three hooks": mistakes(checkedFile(hooksConfig, { version: 1, hooks: { stop: many(50000, 0), preToolUse: many(50000, 0), sessionEnd: many(50000, 0) } })),
        "checked: 300,000 wrong scripts in one hook": checkedFile(hooksConfig, { version: 1, hooks: { stop: many(300000, 0) } }),
        "checked: 300,000 right scripts in one hook": checkedFile(hooksConfig, { version: 1, hooks: { stop: many(300000, script) } }),
      };
    },
  },

  // ---- Telling whose hooks file it is ----
  {
    name: "whose hooks file it is: Claude Code's when the first entry of a hook holds a list under hooks, ours when it holds a command, a prompt or a type, by the first hook that tells",
    run: ({ mapper }) => ({
      ...table(
        [
          ...NOT_OBJECTS(),
          {}, { version: 1 }, { hooks: undefined }, { hooks: null }, { hooks: true }, { hooks: 5 }, { hooks: "text" },
          { hooks: {} },
          { version: 1, hooks: {} },
          { hooks: { stop: [{ command: "check" }] } },
          { hooks: { stop: [{ prompt: "Is this safe?" }] } },
          { hooks: { stop: [{ type: "prompt" }] } },
          { hooks: { stop: [{ type: 5 }] } },
          { hooks: { stop: [{ command: undefined }] } },
          { hooks: { stop: [{ matcher: "Shell" }] } },
          { hooks: { stop: [{ timeout: 5, loop_limit: 1, failClosed: true }] } },
          { hooks: { stop: [{}] } },
          { hooks: { Stop: [{ hooks: [] }] } },
          { hooks: { Stop: [{ hooks: [{ type: "command", command: "check" }] }] } },
          { hooks: { Stop: [{ matcher: "Bash", hooks: [] }] } },
          { hooks: { Stop: [{ hooks: "text" }] } },
          { hooks: { Stop: [{ hooks: null }] } },
          { hooks: { Stop: [{ hooks: {} }] } },
          { hooks: { Stop: [{ hooks: "text", command: "check" }] } },
          { hooks: { Stop: [{ hooks: [], command: "check" }] } },
          { hooks: { Stop: [{ command: "check", hooks: [] }] } },
          { hooks: { anyName: [{ hooks: [] }] } },
          { hooks: { anyName: [{ type: "anything" }] } },
          { hooks: { stop: [] } },
          { hooks: { stop: [null] } },
          { hooks: { stop: [5] } },
          { hooks: { stop: ["command"] } },
          { hooks: { stop: [[]] } },
          { hooks: { stop: [[{ command: "check" }]] } },
          { hooks: { stop: {} } },
          { hooks: { stop: { command: "check" } } },
          { hooks: { stop: "command" } },
          { hooks: { stop: [{}, { command: "check" }] } },
          { hooks: { stop: [{ command: "check" }, { hooks: [] }] } },
          { hooks: { a: [], b: "text", c: [5], d: [null], e: [{}], f: [{ command: "check" }], g: [{ hooks: [] }] } },
          { hooks: { a: [], b: "text", c: [5], d: [null], e: [{}], g: [{ hooks: [] }], f: [{ command: "check" }] } },
          { hooks: { b: [{ hooks: [] }], a: [{ command: "check" }] } },
          { hooks: { 2: [{ hooks: [] }], 1: [{ command: "check" }] } },
          { hooks: [{ command: "check" }] },
          { hooks: [[{ command: "check" }]] },
          { hooks: [[{ hooks: [] }]] },
          { hooks: [[]] },
          named("a list that carries hooks of its own", Object.assign([], { hooks: { stop: [{ command: "check" }] } })),
          named("hooks that only a prototype holds", { hooks: Object.create({ stop: [{ command: "check" }] }) }),
          named("a file whose hooks come from a prototype", Object.create({ hooks: { stop: [{ command: "check" }] } })),
          named("a file whose hooks are not listed", Object.defineProperty({}, "hooks", { value: { stop: [{ command: "check" }] }, enumerable: false })),
          named("a hook that is not listed", { hooks: Object.defineProperty({}, "stop", { value: [{ command: "check" }], enumerable: false }) }),
          named("a first entry whose command comes from a prototype", { hooks: { stop: [Object.create({ command: "check" })] } }),
          named("a first entry whose list of hooks comes from a prototype", { hooks: { Stop: [Object.create({ hooks: [] })] } }),
          named("a first entry with no prototype and a type", { hooks: { stop: [Object.assign(Object.create(null), { type: "command" })] } }),
          named("a map of hooks", { hooks: new Map([["stop", [{ command: "check" }]]]) }),
          named("hooks made in another realm, Claude Code's", { hooks: vm.runInNewContext("({ Stop: [{ hooks: [] }] })") }),
          named("a first entry made by a class with a prompt", { hooks: { stop: [new (class Script { prompt = "Is this safe?"; })()] } }),
        ],
        (file) => mapper.detectHooksSchema(file),
      ),
      "given nothing": mapper.detectHooksSchema(),
    }),
  },
  {
    name: "a plugin's hooks file told, read and checked, one step after the other",
    run: ({ mapper, hooksConfig }) => {
      const loaded = (file) => {
        const whose = mapper.detectHooksSchema(file);
        if (whose === "simeon") return { whose, checked: checkedFile(hooksConfig, file) };
        if (whose !== "claude-code") return { whose };
        const { answer: config, said } = read(mapper, file.hooks);
        return { whose, config, said, checked: checkedFile(hooksConfig, config) };
      };
      return {
        "Claude Code's": loaded({
          description: "Checks before and after tools",
          hooks: {
            PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/check.sh", timeout: 10 }] }],
            PostToolUse: [{ matcher: "Write|Edit|mcp__files__write", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/format.sh" }] }],
            Stop: [{ hooks: [{ type: "prompt", prompt: "Is the work done? $ARGUMENTS" }] }],
            Notification: [{ hooks: [{ type: "command", command: "notify" }] }],
          },
        }),
        "Claude Code's, with a matcher that is no pattern once read": loaded({ hooks: { PreToolUse: [{ matcher: "Bash|*", hooks: [{ type: "command", command: "check" }] }] } }),
        "Claude Code's, with a timeout written as a text": loaded({ hooks: { Stop: [{ hooks: [{ type: "command", command: "check", timeout: "30" }] }] } }),
        "Claude Code's, with a command that is not a text": loaded({ hooks: { Stop: [{ hooks: [{ type: "command", command: ["check"] }] }] } }),
        "Claude Code's, with nothing kept": loaded({ hooks: { Notification: [{ hooks: [{ type: "command", command: "notify" }] }] } }),
        ours: loaded({ version: 1, hooks: { preToolUse: [{ command: "./check.sh", matcher: "Shell" }], stop: [{ type: "prompt", prompt: "Is the work done?" }] } }),
        "ours, with no version": loaded({ hooks: { stop: [{ command: "check" }] } }),
        "ours, under Claude Code's names": loaded({ hooks: { PreToolUse: [{ command: "check" }] } }),
        "nobody's": loaded({ hooks: { stop: [] } }),
      };
    },
  },

  // ---- The guard on reminder tags ----
  {
    name: "a reminder tag in a text, opening or closing and in any capitals, is given an underscore before its end so that it is a tag no more",
    run: ({ reminder }) =>
      guarded(reminder, [
        "", "plain words", "<system_reminder>", "</system_reminder>", "<system_reminder>a</system_reminder>",
        "before <system_reminder>inside</system_reminder> after", "<SYSTEM_REMINDER>", "</SYSTEM_REMINDER>",
        "<System_Reminder>shout</sYSTEM_rEMINDER>", "<system_reminder><system_reminder></system_reminder></system_reminder>", "<<system_reminder>>",
        "</system_reminder><system_reminder>", "line one\n<system_reminder>\nline two\n</system_reminder>\n",
        "$1<system_reminder>$&</system_reminder>$$ $` $'", "<system_<system_reminder>reminder>",
      ]),
  },
  {
    name: "what only looks like a reminder tag is left alone",
    run: ({ reminder }) =>
      guarded(reminder, [
        "<system_reminder_>", "</system_reminder_>", "< system_reminder>", "<system_reminder >", "<system_reminder/>", "<system_reminder",
        "system_reminder>", "<//system_reminder>", "<\\/system_reminder>", "< /system_reminder>", "</ system_reminder>", "<system-reminder>",
        "<system reminder>", "<systemreminder>", "<system_reminders>", "<system_reminder\n>", "&lt;system_reminder&gt;", "<ſystem_reminder>",
        "<system_remınder>", "<SYSTEM_REMİNDER>", "<ｓystem_reminder>",
      ]),
  },
  {
    name: "the guard gives the same answer however often it is asked, and a guarded text passes through unchanged",
    run: ({ reminder }) => {
      const guard = reminder.sanitizeSystemReminderContent;
      const text = "a</system_reminder>b<system_reminder>c";
      const many = "<system_reminder>x</system_reminder>".repeat(2000);
      const once = guard(text);
      return {
        once,
        fiveTimes: [guard(text), guard(text), guard(text), guard(text), guard(text)].every((answer) => answer === once),
        afterAShorterText: [guard("<system_reminder>"), guard(text)],
        guardedTwice: guard(once) === once,
        twoThousandPairs: { length: guard(many).length, tagsLeft: guard(many).split("<system_reminder>").length - 1 + (guard(many).split("</system_reminder>").length - 1), guardedTags: guard(many).split("system_reminder_>").length - 1 },
      };
    },
  },
  {
    name: "the guard is for texts: a String object is read as its text, anything with no replace of its own cannot be read, and what has one is handed the pattern and the rewriting",
    run: ({ reminder }) => {
      const guard = reminder.sanitizeSystemReminderContent;
      const handed = [];
      const back = guard({
        replace(...given) {
          handed.push(given);
          return "what the replace gave back";
        },
      });
      const [pattern, rewrite] = handed[0];
      return {
        ...table([undefined, null, true, 0, 5, [], ["<system_reminder>"], {}, 10n, Symbol("mark"), named("a String object", new String("<system_reminder>"))], (thing) => guard(thing)),
        "given nothing": tried(() => guard()),
        "something with a replace of its own": {
          back,
          handedThings: handed[0].length,
          pattern,
          patternStartsAt: pattern.lastIndex,
          rewrites: [rewrite("<system_reminder>", ""), rewrite("</SYSTEM_REMINDER>", "/"), rewrite("anything", "anything"), rewrite("<system_reminder>")],
        },
      };
    },
  },
];
