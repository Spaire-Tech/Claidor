/**
 * Reminders for the model, added to the last tool result of a step: the
 * tallies a reminder is shown (how many tool calls, which failed in a row),
 * and where its text is written.
 */
export const part = "packages/agent/reminders";
export const modules = {
  contextBuilder: "source/packages/agent/reminders/context-builder.ts",
  applyReminders: "source/packages/agent/reminders/apply-reminders.ts",
};

/** A tool message holding these results. */
const tool = (...content) => ({ role: "tool", content });
const worked = (toolName, more = {}) => ({ type: "tool-result", toolName, result: "done", ...more });
const failed = (toolName, result = "boom") => ({ type: "tool-result", toolName, isError: true, result });
/** A tool result a reminder's text can be added to. */
const open = (toolName = "Shell", already = []) => ({ type: "tool-result", toolName, experimental_content: [...already] });

/** A context without the three lists it only hands back. */
const tallies = ({ todos, conversationMessages, responseMessages, ...rest }) => rest;

/** What a call threw, by class only: the sentence of an error JavaScript itself raises is the runtime's, not the part's. */
function classThrown(run) {
  try {
    run();
    return "nothing thrown";
  } catch (error) {
    return error?.constructor?.name ?? typeof error;
  }
}

/** The same for a promise: how it ended. */
async function ending(promise) {
  try {
    const value = await promise;
    return { resolved: value };
  } catch (error) {
    return { rejected: error?.constructor?.name ?? typeof error };
  }
}

/** A reminder that always gives this text, and notes when it is asked. */
function always(text, log, label = "reminder") {
  return {
    shouldTrigger(context) {
      log?.push(`${label}: shouldTrigger`);
      return true;
    },
    generate(context) {
      log?.push(`${label}: generate`);
      return text;
    },
  };
}

/** An object that notes every field read from it. */
function watched(target, label, log) {
  return new Proxy(target, {
    get(inner, key, receiver) {
      if (typeof key === "string") log.push(`${label}.${key}`);
      return Reflect.get(inner, key, receiver);
    },
  });
}

export const scenarios = [
  // --- context-builder.ts ---
  {
    name: "no messages give empty tallies, and the lists given are handed back as they are",
    run: ({ contextBuilder }) => {
      const messages = [];
      const todos = [{ id: "t1", content: "Write" }];
      const response = [{ role: "assistant", content: "ok" }];
      const context = contextBuilder.buildReminderContext(messages, todos, response);
      return {
        context,
        keys: Object.keys(context),
        sameMessages: context.conversationMessages === messages,
        sameTodos: context.todos === todos,
        sameResponse: context.responseMessages === response,
        countersAreMaps: [context.toolTypeCounters instanceof Map, context.consecutiveFailures instanceof Map],
      };
    },
  },
  {
    name: "the response list left out or undefined is a new empty list each time; null stays null",
    run: ({ contextBuilder }) => {
      const first = contextBuilder.buildReminderContext([], []);
      const second = contextBuilder.buildReminderContext([], [], undefined);
      const third = contextBuilder.buildReminderContext([], [], null);
      return {
        leftOut: first.responseMessages,
        undefinedGiven: second.responseMessages,
        nullGiven: third.responseMessages,
        aNewListEachTime: first.responseMessages !== second.responseMessages,
        declaredParameters: contextBuilder.buildReminderContext.length,
      };
    },
  },
  {
    name: "the todos are never looked at: whatever is given is handed back",
    run: ({ contextBuilder }) =>
      [undefined, null, "todo", 7, [1, 2], { a: 1 }].map((todos) => {
        const context = contextBuilder.buildReminderContext([], todos);
        return { given: todos, same: context.todos === todos };
      }),
  },
  {
    name: "only messages whose role is exactly tool and whose content is a list are counted",
    run: ({ contextBuilder }) => {
      const cases = {
        "a user message with a list": { role: "user", content: [worked("Read")] },
        "an assistant message with a list": { role: "assistant", content: [worked("Read")] },
        "role Tool with a capital": { role: "Tool", content: [worked("Read")] },
        "role tool with a space": { role: "tool ", content: [worked("Read")] },
        "a tool message with text": { role: "tool", content: "done" },
        "a tool message with no content": { role: "tool" },
        "a tool message with null": { role: "tool", content: null },
        "a tool message with an object like a list": { role: "tool", content: { length: 1, 0: worked("Read") } },
        "a tool message with an empty list": { role: "tool", content: [] },
        "a tool message with one result": { role: "tool", content: [worked("Read")] },
        "a message with no role": { content: [worked("Read")] },
        "a number": 5,
        "a text": "tool",
      };
      return Object.fromEntries(Object.entries(cases).map(([name, message]) => [name, tallies(contextBuilder.buildReminderContext([message], []))]));
    },
  },
  {
    name: "each result counts once for its tool, in the order tools are first seen",
    run: ({ contextBuilder }) => {
      const messages = [
        tool(worked("Read"), worked("Shell")),
        { role: "user", content: "next" },
        tool(worked("Read")),
        tool(worked("Grep"), worked("Read"), worked("Shell")),
      ];
      return tallies(contextBuilder.buildReminderContext(messages, []));
    },
  },
  {
    name: "a result without a tool name counts as unknown; an empty or odd name is kept as it is",
    run: ({ contextBuilder }) => {
      const names = [undefined, null, "", "unknown", 0, 5, false, "Read "];
      return {
        oneByOne: names.map((toolName) => {
          const context = contextBuilder.buildReminderContext([tool({ toolName })], []);
          return { given: toolName, currentToolName: context.currentToolName, counters: context.toolTypeCounters };
        }),
        together: tallies(contextBuilder.buildReminderContext([tool(...names.map((toolName) => ({ toolName })))], [])),
        noFieldAtAll: tallies(contextBuilder.buildReminderContext([tool({})], [])),
      };
    },
  },
  {
    name: "a failure adds to its tool's failures in a row, and a success puts them back to zero",
    run: ({ contextBuilder }) => {
      const steps = [failed("Shell"), failed("Shell"), failed("Read"), worked("Shell"), failed("Shell"), worked("Grep"), failed("Read"), failed("Read")];
      return steps.map((_, upTo) => {
        const context = contextBuilder.buildReminderContext([tool(...steps.slice(0, upTo + 1))], []);
        return { after: `${steps[upTo].isError ? "failed" : "worked"} ${steps[upTo].toolName}`, toolCallCount: context.toolCallCount, counters: context.toolTypeCounters, failures: context.consecutiveFailures };
      });
    },
  },
  {
    name: "failures in a row carry over from one tool message to the next",
    run: ({ contextBuilder }) => tallies(contextBuilder.buildReminderContext([tool(failed("Shell")), { role: "assistant", content: [] }, tool(failed("Shell")), tool(failed("Shell"), worked("Read"))], [])),
  },
  {
    name: "anything truthy in isError is a failure, anything else a success",
    run: ({ contextBuilder }) =>
      [true, false, undefined, null, 0, 1, -1, "", "false", "no", Number.NaN, {}, []].map((isError) => {
        const context = contextBuilder.buildReminderContext([tool({ toolName: "Shell", isError, result: "said" })], []);
        return { isError, success: context.currentToolSuccess, error: context.currentToolError, failures: context.consecutiveFailures.get("Shell") };
      }),
  },
  {
    name: "the current tool's error holds the failed result as text, whatever the result is",
    run: ({ contextBuilder }) => {
      const results = {
        "a text": "No such file",
        "an empty text": "",
        "nothing": undefined,
        "null": null,
        "a number": 404,
        "false": false,
        "an object": { code: 1 },
        "a list": ["a", "b", ["c"]],
        "an empty list": [],
        "an error": new RangeError("too far"),
        "a symbol": Symbol("mark"),
        "a big number": 12n,
        "an object that says its own text": { toString: () => "I said this" },
        "a date": new Date(0),
      };
      return Object.fromEntries(
        Object.entries(results).map(([name, result]) => {
          const error = contextBuilder.buildReminderContext([tool(failed("Shell", result))], []).currentToolError;
          return [name, { class: error.constructor.name, isError: error instanceof Error, message: error.message, fields: Object.keys(error) }];
        }),
      );
    },
  },
  {
    name: "a failed result with no result field gives an error saying undefined",
    run: ({ contextBuilder }) => tallies(contextBuilder.buildReminderContext([tool({ toolName: "Shell", isError: true })], [])),
  },
  {
    name: "the last result read is the current tool: a success after a failure leaves no error",
    run: ({ contextBuilder }) => ({
      failureLast: tallies(contextBuilder.buildReminderContext([tool(worked("Read"), failed("Shell", "exit 1"))], [])),
      successLast: tallies(contextBuilder.buildReminderContext([tool(failed("Shell", "exit 1"), worked("Read"))], [])),
      failureThenOtherMessages: tallies(contextBuilder.buildReminderContext([tool(failed("Shell", "exit 1")), { role: "assistant", content: "sorry" }, { role: "user", content: "again" }], [])),
      twoFailures: tallies(contextBuilder.buildReminderContext([tool(failed("Shell", "first")), tool(failed("Read", "second"))], [])),
    }),
  },
  {
    name: "a result that is not an object counts as an unknown tool that worked; a missing one stops the count",
    run: ({ contextBuilder }) => ({
      text: tallies(contextBuilder.buildReminderContext([tool("done", "")], [])),
      numbersAndTruths: tallies(contextBuilder.buildReminderContext([tool(0, 5, true, false)], [])),
      aList: tallies(contextBuilder.buildReminderContext([tool([worked("Read")])], [])),
      aFunction: tallies(contextBuilder.buildReminderContext([tool(() => {})], [])),
      null: classThrown(() => contextBuilder.buildReminderContext([tool(null)], [])),
      undefined: classThrown(() => contextBuilder.buildReminderContext([tool(undefined)], [])),
      aGapInTheList: classThrown(() => contextBuilder.buildReminderContext([{ role: "tool", content: [worked("Read"), , worked("Read")] }], [])),
    }),
  },
  {
    name: "a failed result whose text cannot be made throws what making it threw",
    run: ({ contextBuilder }) => {
      const mine = new Error("no text for you");
      let caught;
      try {
        contextBuilder.buildReminderContext([tool(failed("Shell", { toString() { throw mine; } }))], []);
      } catch (error) {
        caught = error;
      }
      return {
        theSameError: caught === mine,
        anObjectWithNoText: classThrown(() => contextBuilder.buildReminderContext([tool(failed("Shell", Object.create(null)))], [])),
        // The same object as a success is never turned into text.
        asASuccess: tallies(contextBuilder.buildReminderContext([tool(worked("Shell", { result: { toString() { throw mine; } } }))], [])),
      };
    },
  },
  {
    name: "messages that are not a list of objects",
    run: ({ contextBuilder }) => ({
      null: classThrown(() => contextBuilder.buildReminderContext(null, [])),
      undefined: classThrown(() => contextBuilder.buildReminderContext(undefined, [])),
      aNumber: classThrown(() => contextBuilder.buildReminderContext(5, [])),
      anObject: classThrown(() => contextBuilder.buildReminderContext({ length: 1, 0: tool(worked("Read")) }, [])),
      aText: tallies(contextBuilder.buildReminderContext("tool", [])),
      aSet: tallies(contextBuilder.buildReminderContext(new Set([tool(worked("Read")), tool(failed("Shell"))]), [])),
      nullInTheList: classThrown(() => contextBuilder.buildReminderContext([tool(worked("Read")), null], [])),
      undefinedInTheList: classThrown(() => contextBuilder.buildReminderContext([undefined], [])),
      aGapInTheList: classThrown(() => contextBuilder.buildReminderContext([tool(worked("Read")), , tool(worked("Read"))], [])),
      numbersAndTextsInTheList: tallies(contextBuilder.buildReminderContext([1, "tool", true, tool(worked("Read"))], [])),
    }),
  },
  {
    name: "results added to a message while it is read are counted too",
    run: ({ contextBuilder }) => {
      const content = [];
      let given = 0;
      const growing = {
        get toolName() {
          given += 1;
          if (given < 3) content.push(growing);
          return "Shell";
        },
      };
      content.push(growing);
      return tallies(contextBuilder.buildReminderContext([{ role: "tool", content }], []));
    },
  },
  {
    name: "the fields of a message and of a result are read in a fixed order",
    run: ({ contextBuilder }) => {
      const log = [];
      const messages = [
        watched({ role: "user", content: [worked("Read")] }, "user message", log),
        watched({ role: "tool", content: "text" }, "tool message with text", log),
        watched({ role: "tool", content: [watched(worked("Read"), "a result that worked", log), watched(failed("Shell", "exit 1"), "a result that failed", log), watched({}, "an empty result", log)] }, "tool message", log),
      ];
      const context = contextBuilder.buildReminderContext(messages, []);
      return { log, tallies: tallies(context) };
    },
  },
  {
    name: "a result that changes its mind between two looks: the first look counts the failure, the second makes the error",
    run: ({ contextBuilder }) => {
      const flipping = (answers) => {
        let look = 0;
        return { toolName: "Shell", result: "said", get isError() { return answers[look++]; } };
      };
      return {
        failedThenWorked: tallies(contextBuilder.buildReminderContext([tool(flipping([true, false]))], [])),
        workedThenFailed: tallies(contextBuilder.buildReminderContext([tool(flipping([false, true]))], [])),
      };
    },
  },

  // --- apply-reminders.ts ---
  {
    name: "with no reminders nothing is read and nothing changes",
    run: async ({ applyReminders }) => {
      const response = [tool(open())];
      const call = applyReminders.applyRemindersToToolResults(response, [], [], [tool(worked("Read"))]);
      return {
        aPromise: call instanceof Promise,
        ended: await ending(call),
        response,
        // The conversation and the response are not looked at, so bad ones pass.
        badLists: await ending(applyReminders.applyRemindersToToolResults(null, [], null, null)),
        zeroLength: await ending(applyReminders.applyRemindersToToolResults(null, { length: 0 }, null, null)),
        declaredParameters: applyReminders.applyRemindersToToolResults.length,
      };
    },
  },
  {
    name: "a reminder that triggers adds its text to the last result of the last tool message",
    run: async ({ applyReminders }) => {
      const response = [{ role: "assistant", content: [{ type: "tool-call", toolName: "Shell" }] }, tool(open("Read", [{ type: "text", text: "file contents" }]), open("Shell", [{ type: "text", text: "exit 0" }]))];
      const ended = await ending(applyReminders.applyRemindersToToolResults(response, [always("Remember the todos.")], [], []));
      return { ended, response };
    },
  },
  {
    name: "several texts are joined by an empty line, in the reminders' order",
    run: async ({ applyReminders }) => {
      const silent = { shouldTrigger: () => false, generate: () => "never asked for" };
      const table = {
        one: [always("first")],
        two: [always("first"), always("second")],
        three: [always("first"), always("second"), always("third")],
        "one silent between two": [always("first"), silent, always("third")],
        "only silent ones": [silent, silent],
        "texts with their own line ends": [always("a\n"), always("\n\nb")],
        "the same reminder twice": [always("again"), always("again")],
      };
      const out = {};
      for (const [name, reminders] of Object.entries(table)) {
        const response = [tool(open())];
        await applyReminders.applyRemindersToToolResults(response, reminders, [], []);
        out[name] = response[0].content[0].experimental_content;
      }
      return out;
    },
  },
  {
    name: "what a reminder gives counts as a text only when it is truthy and has a length above zero",
    run: async ({ applyReminders }) => {
      const given = {
        "a text": "x",
        "a space": " ",
        "an empty text": "",
        "nothing": undefined,
        "null": null,
        "zero": 0,
        "a number": 5,
        "true": true,
        "an empty list": [],
        "a list of texts": ["a", "b"],
        "an object with a length": { length: 2, toString: () => "an object's text" },
        "an object with length zero": { length: 0 },
        "an object with no length": { text: "x" },
        "a text object": new String("boxed"),
      };
      const out = {};
      for (const [name, value] of Object.entries(given)) {
        const response = [tool(open())];
        await applyReminders.applyRemindersToToolResults(response, [always(value)], [], []);
        out[name] = response[0].content[0].experimental_content;
      }
      const mixed = [tool(open())];
      await applyReminders.applyRemindersToToolResults(mixed, [always(["a", "b"]), always(""), always("c"), always({ length: 1, toString: () => "d" })], [], []);
      return { ...out, "several kinds together": mixed[0].content[0].experimental_content };
    },
  },
  {
    name: "what shouldTrigger gives counts as yes when truthy; generate is asked only then",
    run: async ({ applyReminders }) => {
      const out = [];
      for (const answer of [true, false, undefined, null, 0, 1, "", "no", {}, [], Number.NaN]) {
        const log = [];
        const response = [tool(open())];
        const reminder = {
          shouldTrigger: () => answer,
          generate: () => {
            log.push("generate");
            return "text";
          },
        };
        await applyReminders.applyRemindersToToolResults(response, [reminder], [], []);
        out.push({ answer, generateAsked: log.length, added: response[0].content[0].experimental_content.length });
      }
      return out;
    },
  },
  {
    name: "where the text goes, for every shape of response",
    run: async ({ applyReminders }) => {
      const pushed = [];
      const table = {
        "no messages": [],
        "no tool message": [{ role: "assistant", content: [open()] }, { role: "user", content: [open()] }],
        "a tool message whose content is text": [{ role: "tool", content: "done" }],
        "a tool message with an empty list": [tool()],
        "a tool message whose last part is not a tool result": [tool(open("Read"), { type: "text", experimental_content: [] })],
        "a last part with no type": [tool({ experimental_content: [] })],
        "a last part of type Tool-Result": [tool({ type: "Tool-Result", experimental_content: [] })],
        "a last result with no list to add to": [tool(open("Read"), { type: "tool-result", toolName: "Shell" })],
        "a last result whose experimental content is text": [tool({ type: "tool-result", experimental_content: "text" })],
        "a last result whose experimental content is null": [tool({ type: "tool-result", experimental_content: null })],
        "a last result whose experimental content only looks like a list": [tool({ type: "tool-result", experimental_content: { length: 0, push: (entry) => pushed.push(entry) } })],
        "a last part that is null": [tool(open("Read"), null)],
        "a last part that is missing": [tool(open("Read"), undefined)],
        "a last part that is zero": [tool(open("Read"), 0)],
        "a last part that is a text": [tool(open("Read"), "tool-result")],
        "one tool message with one result": [tool(open())],
        "one tool message with three results": [tool(open("Read"), open("Grep"), open("Shell"))],
        "two tool messages": [tool(open("Read")), tool(open("Shell"))],
        "the last tool message has no place, an earlier one has": [tool(open("Read")), tool({ type: "text" })],
        "the last tool message is empty, an earlier one has a place": [tool(open("Read")), tool()],
        "the last message of role tool holds text, an earlier one a list": [tool(open("Read")), { role: "tool", content: "done" }],
        "other messages after the tool message": [tool(open("Read")), { role: "assistant", content: "ok" }, { role: "user", content: [open("Shell")] }],
        "a result that already holds content": [tool(open("Read", [{ type: "text", text: "one" }, { type: "image", data: "…" }]))],
        "numbers, texts and gaps among the messages": [1, "tool", , tool(open("Read")), true],
      };
      const out = {};
      for (const [name, response] of Object.entries(table)) {
        const ended = await ending(applyReminders.applyRemindersToToolResults(response, [always("Reminder text.")], [], []));
        out[name] = { ended, response };
      }
      return { ...out, pushedToTheLookalike: pushed };
    },
  },
  {
    name: "each addition is a new text entry, and a second call adds a second one",
    run: async ({ applyReminders }) => {
      const response = [tool(open())];
      await applyReminders.applyRemindersToToolResults(response, [always("one")], [], []);
      const first = response[0].content[0].experimental_content[0];
      await applyReminders.applyRemindersToToolResults(response, [always("two"), always("three")], [], []);
      const entries = response[0].content[0].experimental_content;
      return { entries, keys: entries.map((entry) => Object.keys(entry)), theFirstIsUntouched: entries[0] === first, differentObjects: entries[0] !== entries[1] };
    },
  },
  {
    name: "a reminder is shown the tallies of the conversation, the todos and the response, the same object each time",
    run: async ({ applyReminders }) => {
      const conversation = [{ role: "user", content: "go" }, tool(worked("Read"), failed("Shell", "exit 2")), tool(failed("Shell", "exit 3"))];
      const todos = [{ id: "1", content: "Ship", status: "pending" }];
      const response = [tool(open("Grep"))];
      const shown = [];
      const reminder = (label) => ({
        shouldTrigger(context) {
          shown.push(context);
          return true;
        },
        generate(context) {
          shown.push(context);
          return `${label}: ${context.toolCallCount} calls, ${context.consecutiveFailures.get("Shell")} Shell failures in a row, last was ${context.currentToolName} (${context.currentToolError?.message})`;
        },
      });
      await applyReminders.applyRemindersToToolResults(response, [reminder("a"), reminder("b")], todos, conversation);
      return {
        timesShown: shown.length,
        alwaysTheSameObject: shown.every((context) => context === shown[0]),
        keys: Object.keys(shown[0]),
        tallies: tallies(shown[0]),
        sameConversation: shown[0].conversationMessages === conversation,
        sameTodos: shown[0].todos === todos,
        sameResponse: shown[0].responseMessages === response,
        // The response's own results are not part of the tallies.
        response,
      };
    },
  },
  {
    name: "reminders are asked one after the other: shouldTrigger, then generate, then the next reminder",
    run: async ({ applyReminders }) => {
      const log = [];
      const quiet = (label) => ({
        shouldTrigger() {
          log.push(`${label}: shouldTrigger`);
          return false;
        },
        generate() {
          log.push(`${label}: generate`);
          return "never";
        },
      });
      // No tool message to write to: every reminder is asked all the same.
      await applyReminders.applyRemindersToToolResults([], [always("x", log, "first"), quiet("second"), always("", log, "third"), always("y", log, "fourth")], [], []);
      return log;
    },
  },
  {
    name: "a reminder that throws ends the call with its error; nothing is written and later reminders are not asked",
    run: async ({ applyReminders }) => {
      const out = {};
      for (const where of ["shouldTrigger", "generate"]) {
        const mine = new Error(`${where} broke`);
        const log = [];
        const response = [tool(open())];
        const breaking = {
          shouldTrigger() {
            log.push("breaking: shouldTrigger");
            if (where === "shouldTrigger") throw mine;
            return true;
          },
          generate() {
            log.push("breaking: generate");
            throw mine;
          },
        };
        let caught;
        let threwAtOnce = false;
        let call;
        try {
          call = applyReminders.applyRemindersToToolResults(response, [always("before", log, "first"), breaking, always("after", log, "last")], [], []);
        } catch (error) {
          threwAtOnce = true;
          caught = error;
        }
        try {
          await call;
        } catch (error) {
          caught = error;
        }
        out[where] = { threwAtOnce, rejectedWithTheSameError: caught === mine, log, response };
      }
      return out;
    },
  },
  {
    name: "a reminder may change the response while it is asked: the text goes to what is the last tool message afterwards",
    run: async ({ applyReminders }) => {
      const response = [tool(open("Read"))];
      const adding = {
        shouldTrigger: () => true,
        generate() {
          response.push(tool(open("Added")));
          return "written late";
        },
      };
      await applyReminders.applyRemindersToToolResults(response, [adding], [], []);
      const emptied = [tool(open("Read"))];
      const emptying = {
        shouldTrigger() {
          emptied.length = 0;
          return true;
        },
        generate: () => "nowhere to go",
      };
      const ended = await ending(applyReminders.applyRemindersToToolResults(emptied, [emptying], [], []));
      return { response, emptied, ended };
    },
  },
  {
    name: "reminders added to the list while it is asked are asked too",
    run: async ({ applyReminders }) => {
      const log = [];
      const reminders = [];
      reminders.push({
        shouldTrigger() {
          log.push("first: shouldTrigger");
          reminders.push(always("late", log, "added"));
          return false;
        },
        generate: () => "never",
      });
      const response = [tool(open())];
      await applyReminders.applyRemindersToToolResults(response, reminders, [], []);
      return { log, response };
    },
  },
  {
    name: "lists that are missing or of the wrong kind end the call as a rejected promise, never a throw",
    run: async ({ applyReminders }) => {
      const apply = applyReminders.applyRemindersToToolResults;
      const cases = {
        "no reminders list": () => apply([tool(open())], undefined, [], []),
        "null for reminders": () => apply([tool(open())], null, [], []),
        "a number for reminders": () => apply([tool(open())], 5, [], []),
        "reminders as an object with a length and no way through it": () => apply([tool(open())], { length: 1, 0: always("x") }, [], []),
        "reminders as a set": () => apply([tool(open())], new Set([always("from a set")]), [], []),
        "a gap in the reminders": () => apply([tool(open())], [always("x"), , always("y")], [], []),
        "null among the reminders": () => apply([tool(open())], [null], [], []),
        "a reminder with no shouldTrigger": () => apply([tool(open())], [{ generate: () => "x" }], [], []),
        "a reminder with no generate": () => apply([tool(open())], [{ shouldTrigger: () => true }], [], []),
        "a reminder with no generate that does not trigger": () => apply([tool(open())], [{ shouldTrigger: () => false }], [], []),
        "no conversation": () => apply([tool(open())], [always("x")], [], undefined),
        "null for the conversation": () => apply([tool(open())], [always("x")], [], null),
        "null in the conversation": () => apply([tool(open())], [always("x")], [], [null]),
        "null for the response, a reminder triggers": () => apply(null, [always("x")], [], []),
        "null for the response, a reminder gives nothing": () => apply(null, [always("")], [], []),
        "null for the response, no reminder triggers": () => apply(null, [{ shouldTrigger: () => false }], [], []),
        "null in the response, a reminder triggers": () => apply([tool(open()), null], [always("x")], [], []),
        "null in the response, no reminder triggers": () => apply([tool(open()), null], [{ shouldTrigger: () => false }], [], []),
        "a response that cannot be filtered": () => apply({ length: 1, 0: tool(open()) }, [always("x")], [], []),
        "experimental content that cannot be added to": () => apply([tool({ type: "tool-result", experimental_content: Object.freeze([]) })], [always("x")], [], []),
      };
      const out = {};
      for (const [name, call] of Object.entries(cases)) {
        let threwAtOnce = false;
        let promise;
        try {
          promise = call();
        } catch {
          threwAtOnce = true;
        }
        out[name] = { threwAtOnce, ...(await ending(promise)) };
      }
      return out;
    },
  },
  {
    name: "a response with its own way of filtering is asked through it, and what it gives back is used as found",
    run: async ({ applyReminders }) => {
      const out = {};
      const target = () => tool(open());
      const table = {
        "a list with one tool message": (found) => [found],
        "an object with a length": (found) => ({ length: 1, 0: found }),
        "an empty list": () => [],
        "an object with no length": (found) => ({ 0: found }),
        "a length of zero and a message all the same": (found) => ({ length: 0, 0: found }),
        "a list ending in null": (found) => [found, null],
        "a list ending in a message with text": (found) => [found, { role: "tool", content: "text" }],
        "a list ending in a message that is not a tool message": () => [{ role: "user", content: [open("NotATool")] }],
      };
      for (const [name, give] of Object.entries(table)) {
        const found = target();
        const asked = [];
        let given;
        const response = {
          filter(test) {
            asked.push(typeof test);
            given = give(found);
            return given;
          },
        };
        const ended = await ending(applyReminders.applyRemindersToToolResults(response, [always("through its own filter")], [], []));
        out[name] = { ended, asked, found, given };
      }
      return out;
    },
  },
  {
    name: "the fields of a reminder, a message and a result are read in a fixed order",
    run: async ({ applyReminders }) => {
      const log = [];
      const reminder = (label, text) => watched({ shouldTrigger: () => text !== undefined, generate: () => text }, label, log);
      const response = [
        watched({ role: "assistant", content: [] }, "assistant message", log),
        watched({ role: "tool", content: [watched(open("Read"), "first tool message's result", log)] }, "first tool message", log),
        watched({ role: "tool", content: [watched({ type: "text" }, "a part before the last", log), watched(open("Shell"), "last result", log)] }, "last tool message", log),
      ];
      const conversation = [watched({ role: "tool", content: [watched(failed("Shell", "exit 1"), "conversation result", log)] }, "conversation message", log)];
      await applyReminders.applyRemindersToToolResults(response, [reminder("first reminder", "x"), reminder("second reminder", undefined), reminder("third reminder", "")], [], conversation);
      const untyped = [];
      await applyReminders.applyRemindersToToolResults([{ role: "tool", content: [watched({ type: "text", experimental_content: [] }, "a last part that is not a result", untyped)] }], [always("x")], [], []);
      const closed = [];
      await applyReminders.applyRemindersToToolResults([{ role: "tool", content: [watched({ type: "tool-result" }, "a last result with no list", closed)] }], [always("x")], [], []);
      return { log, untyped, closed };
    },
  },
  {
    name: "a message whose content changes between looks: the list seen at each look is the one used",
    run: async ({ applyReminders }) => {
      // Each look at `content` gives the next of these; the last one is given from then on.
      const changing = (looks) => {
        let look = 0;
        const seen = [];
        return {
          seen,
          message: {
            role: "tool",
            get content() {
              const value = looks[Math.min(look, looks.length - 1)];
              seen.push(look);
              look += 1;
              return value;
            },
          },
        };
      };
      const out = {};
      const table = {
        "a list, then text": () => [[open("First")], "text"],
        "text, then a list": () => ["text", [open("First")]],
        "a list, a second list, a third with three results, a fourth with two": () => [[open("A")], [open("B")], [open("C1"), open("C2"), open("C3")], [open("D1"), open("D2")]],
      };
      for (const [name, make] of Object.entries(table)) {
        const looks = make();
        const { message, seen } = changing(looks);
        const ended = await ending(applyReminders.applyRemindersToToolResults([message], [always("x")], [], []));
        out[name] = { ended, looksTaken: seen.length, looks };
      }
      const result = (() => {
        const lists = [["first look"], ["second look"]];
        let look = 0;
        return { lists, part: { type: "tool-result", get experimental_content() { return lists[Math.min(look++, 1)]; } } };
      })();
      await applyReminders.applyRemindersToToolResults([tool(result.part)], [always("x")], [], []);
      return { ...out, "a result whose experimental content changes between looks": result.lists };
    },
  },
];
