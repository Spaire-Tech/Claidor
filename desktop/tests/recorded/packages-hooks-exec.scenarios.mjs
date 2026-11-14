/** What is said when a hook blocks an action or cannot be run: the two errors, the messages shown, and the wrapper that turns any failure into a block. */
import vm from "node:vm";

export const part = "packages/hooks-exec";
export const modules = { errors: "source/packages/hooks-exec/hook-error-handling.ts" };

/**
 * An error as it is kept, with what the usual record leaves out: how it
 * prints, and its own fields as they are named, listed and written out. The
 * trace is left out: where it is held is the runtime's own business.
 */
function told(error) {
  return {
    kept: error,
    printed: String(error),
    ownNames: Object.getOwnPropertyNames(error).filter((name) => name !== "stack"),
    listed: Object.keys(error),
    asJson: JSON.stringify(error),
  };
}

/** How each own field but the trace is held: its value and whether it can be written over, listed and removed. */
function held(error) {
  const out = {};
  for (const [name, { value, writable, enumerable, configurable }] of Object.entries(Object.getOwnPropertyDescriptors(error))) {
    if (name !== "stack") out[name] = { value, writable, enumerable, configurable };
  }
  return out;
}

/** What a call threw, or the word "nothing". */
async function thrownBy(run) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return "nothing";
}

/** Something that is written out as `text`, and notes each time it is. */
function noting(notes, label, text) {
  return {
    toString() {
      notes.push(label);
      return text;
    },
  };
}

export const scenarios = [
  {
    name: "the two sentences the messages are built with",
    run: ({ errors }) => ({ HOOK_SETTINGS_HINT: errors.HOOK_SETTINGS_HINT, HOOK_DENIAL_AGENT_NOTE: errors.HOOK_DENIAL_AGENT_NOTE }),
  },
  {
    name: "a denial says \"Hook denied:\" and its reason, whatever the reason is, and prints under its own name",
    run: ({ errors }) => [
      "not allowed here",
      "",
      " ",
      "two\nlines",
      "Hook denied: said twice",
      "x".repeat(200),
      undefined,
      null,
      7,
      { a: "reason" },
      ["a", "list"],
    ].map((reason) => told(new errors.HookDeniedError(reason))),
  },
  {
    name: "a denial made with no reason, or with more than one thing",
    run: ({ errors }) => [told(new errors.HookDeniedError()), told(new errors.HookDeniedError("first", "second, not read"))],
  },
  {
    name: "a denial is an error of its own class with three fields, each one's to write over, list and remove",
    run: ({ errors }) => {
      const { HookDeniedError } = errors;
      const denial = new HookDeniedError("not allowed here");
      const other = new HookDeniedError("another");
      const before = held(denial);
      denial.failureType = "written over";
      denial.name = "Renamed";
      denial.reason = "changed";
      return {
        isError: denial instanceof Error,
        isDenial: denial instanceof HookDeniedError,
        isFailClosed: denial instanceof errors.FailClosedError,
        madeDirectlyFromError: Object.getPrototypeOf(HookDeniedError) === Error,
        itsMakerIsTheClass: denial.constructor === HookDeniedError,
        className: HookDeniedError.name,
        parameters: HookDeniedError.length,
        ofTheClass: Object.getOwnPropertyNames(HookDeniedError).sort(),
        ofEveryDenial: Object.getOwnPropertyNames(HookDeniedError.prototype).sort(),
        held: before,
        afterWritingOver: { fields: held(denial), printed: String(denial), message: denial.message },
        theOtherIsUntouched: held(other),
        removed: [delete denial.name, String(denial), delete denial.reason, Object.keys(denial)],
      };
    },
  },
  {
    name: "a failure to run a hook says \"Hook failed (fail-closed):\" and its reason, and keeps what caused it as a field that is listed",
    run: ({ errors }) => {
      const causes = [
        new Error("the hook's program is missing"),
        new TypeError("a type error"),
        "a text",
        "",
        0,
        false,
        null,
        undefined,
        { code: "ENOENT", path: "/hooks/check.sh" },
        ["a", "list"],
        new errors.HookDeniedError("a denial as the cause"),
      ];
      return causes.map((cause) => {
        const failure = new errors.FailClosedError("could not run", cause);
        return { ...told(failure), sameCause: failure.cause === cause, hasCause: "cause" in failure, ownsCause: Object.hasOwn(failure, "cause") };
      });
    },
  },
  {
    name: "a failure's reason may be anything, and a failure made with no cause still has the field",
    run: ({ errors }) => [
      told(new errors.FailClosedError("", "the cause")),
      told(new errors.FailClosedError("two\nlines", "the cause")),
      told(new errors.FailClosedError("Hook failed (fail-closed): said twice", "the cause")),
      told(new errors.FailClosedError(undefined, "the cause")),
      told(new errors.FailClosedError(null, "the cause")),
      told(new errors.FailClosedError(12, "the cause")),
      told(new errors.FailClosedError({ a: "reason" }, "the cause")),
      told(new errors.FailClosedError("no cause given")),
      told(new errors.FailClosedError()),
      told(new errors.FailClosedError("first", "second", "third, not read")),
    ],
  },
  {
    name: "a failure is an error of its own class with four fields, each one's to write over, list and remove",
    run: ({ errors }) => {
      const { FailClosedError } = errors;
      const cause = new Error("underneath");
      const failure = new FailClosedError("could not run", cause);
      const other = new FailClosedError("another", "its own cause");
      const before = held(failure);
      failure.failureType = "written over";
      failure.name = "Renamed";
      failure.reason = "changed";
      failure.cause = "another cause";
      return {
        isError: failure instanceof Error,
        isFailClosed: failure instanceof FailClosedError,
        isDenial: failure instanceof errors.HookDeniedError,
        madeDirectlyFromError: Object.getPrototypeOf(FailClosedError) === Error,
        itsMakerIsTheClass: failure.constructor === FailClosedError,
        className: FailClosedError.name,
        parameters: FailClosedError.length,
        ofTheClass: Object.getOwnPropertyNames(FailClosedError).sort(),
        ofEveryFailure: Object.getOwnPropertyNames(FailClosedError.prototype).sort(),
        held: before,
        afterWritingOver: { fields: held(failure), printed: String(failure), message: failure.message },
        theOtherIsUntouched: held(other),
        removed: [delete failure.cause, "cause" in failure, delete failure.name, String(failure), Object.keys(failure)],
      };
    },
  },
  {
    name: "the note to the agent is added once, after a blank line, unless the message already holds it word for word",
    run: ({ errors }) => {
      const note = errors.HOOK_DENIAL_AGENT_NOTE;
      return [
        "The command was blocked.",
        "",
        " ",
        "ends with a line break\n",
        note,
        `Blocked.\n\n${note}`,
        `${note} And more after it.`,
        `before ${note} after`,
        `${note}\n\n${note}`,
        note.toLowerCase(),
        note.toUpperCase(),
        note.slice(0, -1),
        note.replace("Agent note:", "Agent note: "),
        ` ${note} `,
        errors.HOOK_SETTINGS_HINT,
      ].map((message) => [message, errors.appendAgentDenialNote(message)]);
    },
  },
  {
    name: "adding the note to a message that was given it already changes nothing",
    run: ({ errors }) => {
      const once = errors.appendAgentDenialNote("Blocked.");
      const twice = errors.appendAgentDenialNote(once);
      return { once, twice, same: once === twice, parameters: errors.appendAgentDenialNote.length };
    },
  },
  {
    name: "a denial's message: what was blocked, what the hook said if it said anything, where the hooks are, and the note to the agent",
    run: ({ errors }) => [
      ["Shell command", "rm is not allowed in this project"],
      ["Shell command", undefined],
      ["Shell command", null],
      ["Shell command", ""],
      ["Shell command", " "],
      ["Shell command", "0"],
      ["Shell command", "two\nlines"],
      ["Shell command", "ends with a stop."],
      ["MCP tool files:write", "Read only."],
      ["", "said with nothing named"],
      ["", ""],
      ["two\nlines", "said"],
      ["Shell command"],
    ].map((given) => [given, errors.createHookDenialMessage(...given)]),
  },
  {
    name: "a denial's message that already holds the note to the agent, from the hook or in what was blocked, does not get it again",
    run: ({ errors }) => {
      const note = errors.HOOK_DENIAL_AGENT_NOTE;
      const hint = errors.HOOK_SETTINGS_HINT;
      return [
        ["Shell command", `No. ${note}`],
        ["Shell command", note],
        [`${note} Shell command`, "said"],
        [`${note} Shell command`, undefined],
        ["Shell command", note.toLowerCase()],
        ["Shell command", hint],
        ["Shell command", `${hint}\n\n${note}`],
      ].map((given) => [given, errors.createHookDenialMessage(...given)]);
    },
  },
  {
    name: "a denial's message is made of whatever it is given: nothing named is written as it is, and only an empty answer counts as none",
    run: ({ errors }) => ({
      parameters: errors.createHookDenialMessage.length,
      given: [
        [undefined, "said"],
        [null, "said"],
        [undefined, undefined],
        [12, "said"],
        ["Shell command", 0],
        ["Shell command", false],
        ["Shell command", Number.NaN],
        ["Shell command", 5],
        ["Shell command", true],
        ["Shell command", ["a", "list"]],
        ["Shell command", []],
        ["Shell command", { a: 1 }],
      ].map((given) => [given, errors.createHookDenialMessage(...given)]),
    }),
  },
  {
    name: "a failure's message: what was blocked (\"Action\" when not named), the error if there is one, why it is blocked, and where the hooks are; no note to the agent",
    run: ({ errors }) => [
      ["Shell command", "spawn /hooks/check.sh ENOENT"],
      ["Shell command", undefined],
      ["Shell command", null],
      ["Shell command", ""],
      ["Shell command", " "],
      ["Shell command", "0"],
      ["Shell command", "two\nlines"],
      ["Shell command", "ends with a stop."],
      [undefined, "timed out"],
      [null, "timed out"],
      [undefined, undefined],
      [null, null],
      ["", "timed out"],
      ["", ""],
      [" ", "timed out"],
      ["Action", "timed out"],
      ["two\nlines", "timed out"],
      ["Shell command"],
      [],
    ].map((given) => [given, errors.createHookFailClosedMessage(...given)]),
  },
  {
    name: "a failure's message never carries the note to the agent unless what it is given does, and is made of whatever it is given",
    run: ({ errors }) => {
      const note = errors.HOOK_DENIAL_AGENT_NOTE;
      const message = errors.createHookFailClosedMessage("Shell command", "timed out");
      return {
        holdsTheNote: message.includes(note),
        endsWithTheHint: message.endsWith(`\n\n${errors.HOOK_SETTINGS_HINT}`),
        parameters: errors.createHookFailClosedMessage.length,
        given: [
          ["Shell command", note],
          [note, "timed out"],
          [0, "timed out"],
          [false, "timed out"],
          [12, 34],
          ["Shell command", 0],
          ["Shell command", false],
          ["Shell command", Number.NaN],
          ["Shell command", true],
          ["Shell command", []],
          ["Shell command", ["a", "list"]],
          ["Shell command", { a: 1 }],
          [{ a: 1 }, "timed out"],
        ].map((given) => [given, errors.createHookFailClosedMessage(...given)]),
      };
    },
  },
  {
    name: "what is given is written out once each, in a fixed order",
    run: ({ errors }) => {
      const notes = [];
      const denial = errors.createHookDenialMessage(noting(notes, "denial: what was blocked", "Shell command"), noting(notes, "denial: what the hook said", "no"));
      const failure = errors.createHookFailClosedMessage(noting(notes, "failure: what was blocked", "Shell command"), noting(notes, "failure: the error", "timed out"));
      const made = new errors.FailClosedError(noting(notes, "a failure's reason", "could not run"), noting(notes, "a failure's cause, never written out", "cause"));
      const denied = new errors.HookDeniedError(noting(notes, "a denial's reason", "not allowed"));
      return { notes, denial, failure, madeMessage: made.message, deniedMessage: denied.message, reasonKeptAsGiven: typeof made.reason, denialReasonKeptAsGiven: typeof denied.reason };
    },
  },
  {
    name: "work that succeeds comes back as it is, whatever it gives and whether it gives it now or later",
    run: async ({ errors }) => {
      const kept = { an: "object" };
      const answers = [];
      for (const work of [
        () => "a value",
        () => 0,
        () => "",
        () => false,
        () => null,
        () => undefined,
        () => kept,
        () => Promise.resolve("a promise's value"),
        async () => "an async function's value",
        () => new Promise((resolve) => setTimeout(() => resolve("after a short wait"), 5)),
        () => ({ then(resolve) { resolve("something with a then"); } }),
        () => new Error("an error given back, not thrown"),
        () => Promise.resolve(Promise.resolve("a promise in a promise")),
      ]) {
        answers.push(await errors.withFailClosed(work, "Shell command"));
      }
      return {
        answers,
        sameObject: (await errors.withFailClosed(() => kept, "Shell command")) === kept,
        withNothingNamed: [await errors.withFailClosed(() => "a value"), await errors.withFailClosed(() => "a value", null), await errors.withFailClosed(() => "a value", "")],
        parameters: errors.withFailClosed.length,
      };
    },
  },
  {
    name: "the work is called once, at once, with nothing, and what comes back is always a promise",
    run: async ({ errors }) => {
      const events = [];
      const work = function (...given) {
        events.push({ called: "the work", given, self: this === undefined ? "undefined" : typeof this });
        return "done";
      };
      events.push("before asking");
      const asked = errors.withFailClosed(work, "Shell command");
      events.push("after asking, before waiting");
      const answer = await asked;
      events.push("after waiting");
      const failing = errors.withFailClosed(() => { throw new Error("thrown at once"); }, "Shell command");
      const thrownLater = failing instanceof Promise;
      const failure = await thrownBy(() => failing);
      return { events, answer, isPromise: asked instanceof Promise, aThrowAtOnceIsStillAPromise: thrownLater, failed: failure instanceof errors.FailClosedError };
    },
  },
  {
    name: "an error from the work, thrown at once or later, becomes a failure that carries the failure's message as its reason and the error as its cause",
    run: async ({ errors }) => {
      const out = [];
      const thrown = [
        ["thrown at once", (error) => () => { throw error; }],
        ["a promise that fails", (error) => () => Promise.reject(error)],
        ["an async function that throws", (error) => async () => { throw error; }],
        ["a failure after a short wait", (error) => () => new Promise((_, reject) => setTimeout(() => reject(error), 5))],
        ["something with a then that fails", (error) => () => ({ then(_, reject) { reject(error); } })],
      ];
      for (const [how, working] of thrown) {
        const error = new Error("spawn /hooks/check.sh ENOENT");
        const failure = await thrownBy(() => errors.withFailClosed(working(error), "Shell command"));
        out.push({ how, ...told(failure), isFailClosed: failure instanceof errors.FailClosedError, sameCause: failure.cause === error, reasonIsTheMessage: failure.reason === errors.createHookFailClosedMessage("Shell command", "spawn /hooks/check.sh ENOENT"), failureType: failure.failureType });
      }
      return out;
    },
  },
  {
    name: "what was being done is named in the failure, \"Action\" when it is not named, and an empty name is kept empty",
    run: async ({ errors }) => {
      const out = [];
      for (const named of ["Shell command", "MCP tool files:write", undefined, null, "", " ", "two\nlines"]) {
        const failure = await thrownBy(() => errors.withFailClosed(() => { throw new Error("timed out"); }, named));
        out.push([named, failure.message, failure.reason]);
      }
      const unnamed = await thrownBy(() => errors.withFailClosed(() => { throw new Error("timed out"); }));
      out.push(["not given at all", unnamed.message, unnamed.reason]);
      return out;
    },
  },
  {
    name: "only a real error gives its message; anything else thrown is written out as it prints, and an empty message ends the sentence with a stop",
    run: async ({ errors }) => {
      class OwnError extends Error {
        constructor(message) {
          super(message);
          this.name = "OwnError";
          this.code = "E_OWN";
        }
      }
      const fromElsewhere = vm.runInNewContext('new Error("made in another realm")');
      const thrown = [
        new Error(""),
        new Error(" "),
        new TypeError("a type error"),
        new OwnError("an error of another class"),
        Object.assign(new Error("had a message"), { message: 0 }),
        Object.assign(new Error("had a message"), { message: 42 }),
        Object.assign(new Error("had a message"), { message: undefined }),
        Object.assign(new Error("had a message"), { message: { not: "a text" } }),
        new errors.HookDeniedError("denied by a hook"),
        new errors.FailClosedError("already a failure", "its cause"),
        "a text",
        "",
        0,
        42,
        false,
        true,
        null,
        undefined,
        10n,
        Symbol("a symbol"),
        { message: "an object that only looks like an error" },
        { toString: () => "an object that prints as this" },
        ["a", "list"],
        [],
        fromElsewhere,
      ];
      const out = [];
      for (const error of thrown) {
        const failure = await thrownBy(() => errors.withFailClosed(() => { throw error; }, "Shell command"));
        out.push({ thrown: error, isFailClosed: failure instanceof errors.FailClosedError, message: failure.message, sameCause: failure.cause === error, reasonIsInMessage: failure.message === `Hook failed (fail-closed): ${failure.reason}` });
      }
      return out;
    },
  },
  {
    name: "a failure inside a failure: each layer says it again and keeps the one before as its cause",
    run: async ({ errors }) => {
      const inner = await thrownBy(() => errors.withFailClosed(() => { throw new Error("timed out"); }, "Inner hook"));
      const outer = await thrownBy(() => errors.withFailClosed(() => { throw inner; }, "Outer hook"));
      const throughBoth = await thrownBy(() => errors.withFailClosed(() => errors.withFailClosed(() => Promise.reject(new Error("timed out")), "Inner hook"), "Outer hook"));
      return { outer: told(outer), causeIsTheInner: outer.cause === inner, innerCauseMessage: inner.cause.message, throughBoth: throughBoth.message, throughBothIsTheSame: throughBoth.message === outer.message };
    },
  },
  {
    name: "work that is not something to call fails closed like any other; a thing thrown that cannot be written out comes out as that trouble itself",
    run: async ({ errors }) => {
      const notCallable = [];
      for (const work of [undefined, null, "a text", 12, {}]) {
        const failure = await thrownBy(() => errors.withFailClosed(work, "Shell command"));
        notCallable.push({ given: work, isFailClosed: failure instanceof errors.FailClosedError, message: failure.message, cause: failure.cause });
      }
      const bare = Object.create(null);
      const stubborn = { toString() { throw new RangeError("will not be written out"); } };
      const fromBare = await thrownBy(() => errors.withFailClosed(() => { throw bare; }, "Shell command"));
      const fromStubborn = await thrownBy(() => errors.withFailClosed(() => Promise.reject(stubborn), "Shell command"));
      return {
        notCallable,
        bare: { kept: fromBare, isFailClosed: fromBare instanceof errors.FailClosedError },
        stubborn: { kept: fromStubborn, isFailClosed: fromStubborn instanceof errors.FailClosedError },
      };
    },
  },
  {
    name: "how soon an answer comes back: a throw before anything else that waits, a value or a promise one turn later, something with a then two turns later",
    run: async ({ errors }) => {
      const turnsUntil = async (start) => {
        const order = [];
        const asked = start().then(() => order.push("answered"), () => order.push("failed"));
        let turn = Promise.resolve();
        for (let n = 1; n <= 6; n += 1) turn = turn.then(() => order.push(`turn ${n}`));
        await asked;
        await turn;
        return order;
      };
      return {
        aValue: await turnsUntil(() => errors.withFailClosed(() => "a value", "Shell command")),
        aPromise: await turnsUntil(() => errors.withFailClosed(() => Promise.resolve("a value"), "Shell command")),
        anAsyncFunction: await turnsUntil(() => errors.withFailClosed(async () => "a value", "Shell command")),
        aThrow: await turnsUntil(() => errors.withFailClosed(() => { throw new Error("no"); }, "Shell command")),
        aFailedPromise: await turnsUntil(() => errors.withFailClosed(() => Promise.reject(new Error("no")), "Shell command")),
        somethingWithAThen: await turnsUntil(() => errors.withFailClosed(() => ({ then(resolve) { resolve("a value"); } }), "Shell command")),
      };
    },
  },
];
