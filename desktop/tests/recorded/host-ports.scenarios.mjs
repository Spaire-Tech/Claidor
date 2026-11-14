/**
 * What the host's inner parts are given to talk to the rest: the words and errors of a computer that is not ready, the
 * telemetry that measures nothing, the list of connected tools as the agent's loop reads it, the sizes a message's
 * length falls into, the product analytics that track nothing, and the way an agent's updates reach the transcript.
 *
 * Nothing here leaves the process. The one line the part writes (a sent message, written or not) goes to
 * `console.info`, which the scenarios stand in for while they run and put back after.
 */
export const part = "host/ports";
export const modules = {
  box: "source/host/ports/box.ts",
  telemetry: "source/host/ports/telemetry.ts",
  mcpState: "source/host/ports/mcp-state-executor.ts",
  analyticsTypes: "source/host/ports/sand-analytics-types.ts",
  productAnalytics: "source/host/ports/product-analytics.ts",
  transport: "source/host/ports/transport.ts",
};
/** The folder holds one more file, `user-computer.ts`, which is not of this part. */
export const covers = Object.values(modules);

// ---------------------------------------------------------------------------------------------------------------
// What the scenarios share

/** What a call did: what it gave back, or the error it threw, as it is. */
function outcome(run) {
  try {
    return { returned: run() };
  } catch (error) {
    return { threw: error };
  }
}

/** The same for an error JavaScript itself raises: only its class is kept, its sentence is the runtime's. */
function outcomeByClass(run) {
  try {
    return { returned: run() };
  } catch (error) {
    return { threwA: error?.constructor?.name ?? String(error) };
  }
}

/** What an error object is, seen from outside: its class, its fields in the order they were put on it, and how each is held. */
function errorFacts(error, Kind) {
  const held = (name) => {
    const descriptor = Object.getOwnPropertyDescriptor(error, name);
    return descriptor === undefined ? "not its own" : `${typeof descriptor.value}${descriptor.writable ? ", can be changed" : ", fixed"}${descriptor.enumerable ? ", listed" : ", not listed"}`;
  };
  return {
    isOfItsClass: error instanceof Kind,
    isAnError: error instanceof Error,
    class: error.constructor.name,
    name: error.name,
    message: error.message,
    asText: String(error),
    fields: Object.keys(error),
    everyOwnName: Object.getOwnPropertyNames(error).sort(),
    nameHeld: held("name"),
    messageHeld: held("message"),
    cause: "cause" in error ? error.cause : "none",
    hasAStack: typeof error.stack === "string",
    stackStartsWithItsText: typeof error.stack === "string" && error.stack.startsWith(String(error)),
  };
}

/** What a class is, seen from outside. */
function classFacts(Kind) {
  return {
    name: Kind.name,
    parentIsError: Object.getPrototypeOf(Kind) === Error,
    argumentsCounted: Kind.length,
    ownMethods: Object.getOwnPropertyNames(Kind.prototype),
    ownStatics: Object.getOwnPropertyNames(Kind).sort(),
    cannotBeCalledWithoutNew: outcomeByClass(() => Kind("x")).threwA ?? "it can",
  };
}

/** The lines written to the host's log while `run` runs: each call of `console.info`, by its arguments. */
function hostLines(run, { failing = false, summed = false } = {}) {
  const lines = [];
  const real = console.info;
  console.info = (...args) => {
    lines.push(args.length === 1 ? args[0] : args);
    if (failing) throw new Error("the log is closed");
  };
  try {
    const result = run();
    // Many lines of one shape are kept as their number, the first three and the last.
    return { ...result, lines: summed ? { count: lines.length, firstThree: lines.slice(0, 3), last: lines.at(-1) } : lines };
  } finally {
    console.info = real;
  }
}

/**
 * A transport over an `ingest` that follows a plan (what each call gives back, or `{ throws }`), driven with a list
 * of updates. After each update: what `onUpdate` did, the last sent message's id and whether the last reaction held.
 */
function drive(createSandTransport, plan, updates, options) {
  const seen = [];
  let calls = 0;
  const transport = createSandTransport(function ingest(...args) {
    const step = plan[Math.min(calls, plan.length - 1)];
    calls += 1;
    seen.push({ arguments: args.length, sameUpdate: args[0] === updates[calls - 1], calledOn: this === undefined ? "nothing" : "something" });
    if (step !== null && typeof step === "object" && "throws" in step) throw step.throws;
    if (step !== null && typeof step === "object" && "changesTypeTo" in step) {
      args[0].type = step.changesTypeTo;
      return step.gives;
    }
    return step;
  });
  return hostLines(() => {
    const steps = updates.map((update) => {
      let did;
      try {
        did = { returned: transport.onUpdate(update) };
      } catch (error) {
        did = { threw: error, sameAsIngestThrew: plan.some((step) => step !== null && typeof step === "object" && step.throws === error) };
      }
      return { ...did, lastSentMessageId: transport.lastSentMessageId(), lastReactionApplied: transport.lastReactionApplied() };
    });
    return { steps, ingestSaw: seen };
  }, options);
}

const sent = (type, more = {}) => ({ type: "send-message", message: type === undefined ? undefined : { type, text: "hello" }, timestampMs: 1, ...more });
const reaction = () => ({ type: "react-to-message", messageId: "m1", emoji: "+1" });

/** A provider of tools that notes how it was asked. */
function providerOf(tools) {
  const asked = [];
  const provider = {
    getTools(...args) {
      asked.push({ arguments: args.length, context: args[0], calledOnTheProvider: this === provider });
      return typeof tools === "function" ? tools() : tools;
    },
  };
  return { provider, asked };
}

const tool = (providerIdentifier, name, more = {}) => ({ providerIdentifier, name, toolName: `${name}_tool`, ...more });

/** A message of the agent's protocol as it is kept: its fields, its JSON, and its bytes on the wire. */
function wire(message) {
  return {
    fields: message,
    json: outcomeByClass(() => message.toJson()),
    bytes: outcomeByClass(() => Buffer.from(message.toBinary()).toString("hex")),
  };
}

// ---------------------------------------------------------------------------------------------------------------

export const scenarios = [
  // ----- box.ts
  {
    name: "the three sentences a person reads when the computer is not ready, word for word",
    run: ({ box }) => ({
      SAND_BOX_NOT_READY_MESSAGE: box.SAND_BOX_NOT_READY_MESSAGE,
      SAND_BOX_NOT_RESPONDING_MESSAGE: box.SAND_BOX_NOT_RESPONDING_MESSAGE,
      SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE: box.SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE,
    }),
  },
  {
    name: "the error for a computer whose daemon cannot be reached carries how the reach ended",
    run: ({ box }) => {
      const { SandBoxDaemonUnreachableError } = box;
      const why = new Error("connection refused");
      const withCause = new SandBoxDaemonUnreachableError("crash", "the daemon went away", { cause: why });
      const changed = new SandBoxDaemonUnreachableError("refused", "at first");
      changed.outcome = "timeout";
      changed.name = "Renamed";
      return {
        class: classFacts(SandBoxDaemonUnreachableError),
        plain: errorFacts(new SandBoxDaemonUnreachableError("timeout", "no answer in 5 s"), SandBoxDaemonUnreachableError),
        asKept: new SandBoxDaemonUnreachableError("timeout", "no answer in 5 s"),
        outcomeHeld: Object.getOwnPropertyDescriptor(new SandBoxDaemonUnreachableError("timeout", "m"), "outcome"),
        withACause: { ...errorFacts(withCause, SandBoxDaemonUnreachableError), sameCause: withCause.cause === why },
        "options that hold no cause": errorFacts(new SandBoxDaemonUnreachableError("crash", "m", {}), SandBoxDaemonUnreachableError).cause,
        "options that are undefined": errorFacts(new SandBoxDaemonUnreachableError("crash", "m", undefined), SandBoxDaemonUnreachableError).cause,
        "a cause that is undefined": errorFacts(new SandBoxDaemonUnreachableError("crash", "m", { cause: undefined }), SandBoxDaemonUnreachableError).cause,
        "nothing given at all": errorFacts(new SandBoxDaemonUnreachableError(), SandBoxDaemonUnreachableError),
        "an outcome that is not a text": new SandBoxDaemonUnreachableError(504, "m").outcome,
        "a message that is not a text": new SandBoxDaemonUnreachableError("crash", 504).message,
        "its outcome and name can be changed after": [changed.outcome, changed.name, String(changed)],
      };
    },
  },
  {
    name: "the error for no free monitor has words of its own unless given others, and takes no cause",
    run: ({ box }) => {
      const { SandBoxNoMonitorAvailableError } = box;
      return {
        class: classFacts(SandBoxNoMonitorAvailableError),
        bare: errorFacts(new SandBoxNoMonitorAvailableError(), SandBoxNoMonitorAvailableError),
        asKept: new SandBoxNoMonitorAvailableError(),
        "undefined for the words": new SandBoxNoMonitorAvailableError(undefined).message,
        "words given": errorFacts(new SandBoxNoMonitorAvailableError("all four screens are taken"), SandBoxNoMonitorAvailableError),
        "empty words": new SandBoxNoMonitorAvailableError("").message,
        "null for the words": new SandBoxNoMonitorAvailableError(null).message,
        "a number for the words": new SandBoxNoMonitorAvailableError(4).message,
        "a cause given": errorFacts(new SandBoxNoMonitorAvailableError("m", { cause: new Error("why") }), SandBoxNoMonitorAvailableError).cause,
      };
    },
  },
  {
    name: "the two errors for what a computer cannot do have fixed words and take nothing",
    run: ({ box }) => {
      const { BoxEnvironmentSyncUnsupportedError, BoxMcpUnsupportedError } = box;
      return {
        environmentSync: {
          class: classFacts(BoxEnvironmentSyncUnsupportedError),
          bare: errorFacts(new BoxEnvironmentSyncUnsupportedError(), BoxEnvironmentSyncUnsupportedError),
          asKept: new BoxEnvironmentSyncUnsupportedError(),
          "words and a cause given": errorFacts(new BoxEnvironmentSyncUnsupportedError("other words", { cause: new Error("why") }), BoxEnvironmentSyncUnsupportedError),
        },
        mcp: {
          class: classFacts(BoxMcpUnsupportedError),
          bare: errorFacts(new BoxMcpUnsupportedError(), BoxMcpUnsupportedError),
          asKept: new BoxMcpUnsupportedError(),
          "words and a cause given": errorFacts(new BoxMcpUnsupportedError("other words", { cause: new Error("why") }), BoxMcpUnsupportedError),
        },
        "one is not the other": [new BoxMcpUnsupportedError() instanceof BoxEnvironmentSyncUnsupportedError, new BoxEnvironmentSyncUnsupportedError() instanceof BoxMcpUnsupportedError],
      };
    },
  },
  {
    name: "which of the three sentences an error gets: no monitor, not responding after a timeout or a crash, starting up for anything else",
    run: ({ box }) => {
      const { SandBoxDaemonUnreachableError, SandBoxNoMonitorAvailableError, boxNotReadyMessageForError, BoxMcpUnsupportedError } = box;
      const which = (error) => {
        const said = boxNotReadyMessageForError(error);
        return said === box.SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE ? "no monitor" : said === box.SAND_BOX_NOT_RESPONDING_MESSAGE ? "not responding" : said === box.SAND_BOX_NOT_READY_MESSAGE ? "starting up" : `something else: ${said}`;
      };
      class LaterUnreachable extends SandBoxDaemonUnreachableError {}
      class LaterNoMonitor extends SandBoxNoMonitorAvailableError {}
      const changed = new SandBoxDaemonUnreachableError("refused", "m");
      changed.outcome = "crash";
      const lookAlike = Object.assign(new Error("m"), { name: "SandBoxDaemonUnreachableError", outcome: "timeout" });
      const noMonitorLookAlike = Object.assign(new Error("m"), { name: "SandBoxNoMonitorAvailableError" });
      const out = {};
      for (const reachEnded of ["timeout", "crash", "refused", "reset", "", "Timeout", "CRASH", " timeout", "timeout ", "timed_out", "crashed", undefined, null, 0, true]) {
        out[`unreachable, ended by ${typeof reachEnded === "string" ? JSON.stringify(reachEnded) : String(reachEnded)}`] = which(new SandBoxDaemonUnreachableError(reachEnded, "m"));
      }
      out["no monitor"] = which(new SandBoxNoMonitorAvailableError());
      out["no monitor, other words"] = which(new SandBoxNoMonitorAvailableError("other words"));
      out["a later kind of no monitor"] = which(new LaterNoMonitor());
      out["a later kind of unreachable, timeout"] = which(new LaterUnreachable("timeout", "m"));
      out["a later kind of unreachable, refused"] = which(new LaterUnreachable("refused", "m"));
      out["unreachable whose outcome was changed to crash"] = which(changed);
      out["an error only named like unreachable, with a timeout"] = which(lookAlike);
      out["an error only named like no monitor"] = which(noMonitorLookAlike);
      out["a plain object with a timeout"] = which({ outcome: "timeout" });
      out["another of the part's errors"] = which(new BoxMcpUnsupportedError());
      out["any error"] = which(new Error("timeout"));
      out["an error whose cause is no monitor"] = which(new Error("m", { cause: new SandBoxNoMonitorAvailableError() }));
      out["the text \"timeout\""] = which("timeout");
      out["null"] = which(null);
      out["undefined"] = which(undefined);
      out["nothing given"] = which();
      return out;
    },
  },
  {
    name: "the screen control used when no monitor is free fails every time with the no-monitor error, and is known by being itself",
    run: async ({ box }) => {
      const { noMonitorComputerUseExecutor, isNoMonitorComputerUseExecutor, SandBoxNoMonitorAvailableError } = box;
      const calls = [];
      for (const args of [[], [{ action: "screenshot" }], [undefined, "more", 3]]) {
        let promise;
        const threwAtOnce = outcomeByClass(() => {
          promise = noMonitorComputerUseExecutor.execute(...args);
        }).threwA ?? "no";
        const settled = await promise.then((value) => ({ gave: value }), (error) => ({ failedWith: errorFacts(error, SandBoxNoMonitorAvailableError), sentence: box.boxNotReadyMessageForError(error) === box.SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE }));
        calls.push({ arguments: args.length, threwAtOnce, gaveAPromise: promise instanceof Promise, ...settled });
      }
      const first = await noMonitorComputerUseExecutor.execute().catch((error) => error);
      const second = await noMonitorComputerUseExecutor.execute().catch((error) => error);
      return {
        asKept: noMonitorComputerUseExecutor,
        fields: Object.keys(noMonitorComputerUseExecutor),
        frozen: Object.isFrozen(noMonitorComputerUseExecutor),
        executeCounts: noMonitorComputerUseExecutor.execute.length,
        calls,
        aNewErrorEachTime: first !== second,
        knownBy: {
          itself: isNoMonitorComputerUseExecutor(noMonitorComputerUseExecutor),
          "a copy of it": isNoMonitorComputerUseExecutor({ ...noMonitorComputerUseExecutor }),
          "an object made from it": isNoMonitorComputerUseExecutor(Object.create(noMonitorComputerUseExecutor)),
          "another with the same execute": isNoMonitorComputerUseExecutor({ execute: noMonitorComputerUseExecutor.execute }),
          "its execute alone": isNoMonitorComputerUseExecutor(noMonitorComputerUseExecutor.execute),
          "an empty object": isNoMonitorComputerUseExecutor({}),
          null: isNoMonitorComputerUseExecutor(null),
          undefined: isNoMonitorComputerUseExecutor(undefined),
          "nothing given": isNoMonitorComputerUseExecutor(),
        },
      };
    },
  },
  {
    name: "the first window is number 1, the first other one number 2, and every number up to 1 is the first",
    run: ({ box }) => {
      const out = { SAND_BOX_PRIMARY_WINDOW_INDEX: box.SAND_BOX_PRIMARY_WINDOW_INDEX, SAND_BOX_FIRST_FORK_WINDOW_INDEX: box.SAND_BOX_FIRST_FORK_WINDOW_INDEX };
      for (const index of [1, 2, 0, -1, 3, 1.0001, 0.9999, 1.5, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER, "1", "2", "", "one", null, undefined, true, false, 1n, 2n, [], [1], [2], {}]) {
        out[`window ${typeof index === "string" ? JSON.stringify(index) : typeof index === "bigint" ? `${index}n` : Array.isArray(index) ? `[${index}]` : typeof index === "object" && index !== null ? "{}" : Object.is(index, -0) ? "-0" : String(index)}`] = box.isPrimaryWindowIndex(index);
      }
      out["no window given"] = box.isPrimaryWindowIndex();
      return out;
    },
  },

  // ----- telemetry.ts
  {
    name: "the names telemetry is reported under: stages, phases, causes, outcomes and reasons, each list in its order",
    run: ({ telemetry }) => {
      const out = {};
      for (const name of [
        "SAND_BOX_BOOT_STAGES", "SAND_HOST_LIFECYCLE_PHASES", "SAND_EXEC_DAEMON_RESTART_CAUSES", "SAND_SUPERVISOR_RESTART_CAUSES", "SAND_COOKIE_PERSIST_PHASES", "SAND_COOKIE_PERSIST_OUTCOMES",
        "SAND_EGRESS_TUNNEL_OUTCOMES", "SAND_BOX_BOOT_FAILURE_STAGES", "SAND_BOX_BOOT_FAILURE_REASONS", "SAND_PROCESS_CRASH_BINARIES", "SAND_PROCESS_CRASH_SIGNALS", "SAND_HOST_BOOT_FETCH_OUTCOMES", "SAND_HOST_BOOT_FETCH_REASONS",
      ]) {
        const list = telemetry[name];
        out[name] = { list, isAList: Array.isArray(list), frozen: Object.isFrozen(list), sameListEachRead: telemetry[name] === list };
      }
      return out;
    },
  },
  {
    name: "the settings a computer's identity is read from, by name",
    run: ({ telemetry }) => ({
      SAND_BOX_BOOT_ID_ENV: telemetry.SAND_BOX_BOOT_ID_ENV,
      SAND_BOX_BOOT_STARTED_AT_MS_ENV: telemetry.SAND_BOX_BOOT_STARTED_AT_MS_ENV,
      SAND_BOX_AUTH_ID_ENV: telemetry.SAND_BOX_AUTH_ID_ENV,
      SAND_BOX_TENANT_ID_ENV: telemetry.SAND_BOX_TENANT_ID_ENV,
      SAND_BOX_STORE_ID_ENV: telemetry.SAND_BOX_STORE_ID_ENV,
      SAND_BOX_CLUSTER_ENV: telemetry.SAND_BOX_CLUSTER_ENV,
    }),
  },
  {
    name: "a computer's identity is five tags read from five settings, each with the space around it taken off, all five there even when nothing is set",
    run: ({ telemetry }) => {
      const { resolveSandBoxIdentityTags } = telemetry;
      const all = { SAND_BOX_AUTH_ID: "auth-1", SAND_BOX_TENANT_ID: "tenant-1", SAND_BOX_STORE_ID: "store-1", SAND_BOX_BOOT_ID: "boot-1", SAND_BOX_CLUSTER: "eu-1", SAND_BOX_BOOT_STARTED_AT_MS: "1700000000000", OTHER: "x" };
      const read = [];
      const watchedEnv = new Proxy({ ...all }, {
        get(target, name) {
          if (typeof name === "string") read.push(name);
          return target[name];
        },
        has(target, name) {
          read.push(`has ${String(name)}`);
          return name in target;
        },
        ownKeys(target) {
          read.push("lists its names");
          return Reflect.ownKeys(target);
        },
      });
      const fromWatched = resolveSandBoxIdentityTags(watchedEnv);
      const names = ["SAND_BOX_AUTH_ID", "SAND_BOX_TENANT_ID", "SAND_BOX_STORE_ID", "SAND_BOX_BOOT_ID", "SAND_BOX_CLUSTER"];
      const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
      const fromTheProcess = [];
      try {
        for (const name of names) delete process.env[name];
        fromTheProcess.push(resolveSandBoxIdentityTags());
        fromTheProcess.push(resolveSandBoxIdentityTags(undefined));
        Object.assign(process.env, { SAND_BOX_AUTH_ID: " auth-p ", SAND_BOX_TENANT_ID: "tenant-p", SAND_BOX_STORE_ID: "", SAND_BOX_BOOT_ID: "boot-p\n", SAND_BOX_CLUSTER: "\tus-2" });
        fromTheProcess.push(resolveSandBoxIdentityTags());
      } finally {
        for (const name of names) {
          if (before[name] === undefined) delete process.env[name];
          else process.env[name] = before[name];
        }
      }
      return {
        "every setting": resolveSandBoxIdentityTags(all),
        "the names of the tags, in order": Object.keys(resolveSandBoxIdentityTags(all)),
        "nothing set": resolveSandBoxIdentityTags({}),
        "the names of the tags when nothing is set": Object.keys(resolveSandBoxIdentityTags({})),
        "space around every one": resolveSandBoxIdentityTags({ SAND_BOX_AUTH_ID: "  auth-1  ", SAND_BOX_TENANT_ID: "\ttenant-1\n", SAND_BOX_STORE_ID: " store 1 ", SAND_BOX_BOOT_ID: " boot-1 ", SAND_BOX_CLUSTER: "\r\neu-1" }),
        "empty and only space": resolveSandBoxIdentityTags({ SAND_BOX_AUTH_ID: "", SAND_BOX_TENANT_ID: "   ", SAND_BOX_STORE_ID: "\n", SAND_BOX_BOOT_ID: "0", SAND_BOX_CLUSTER: "false" }),
        "only two set": resolveSandBoxIdentityTags({ SAND_BOX_TENANT_ID: "tenant-1", SAND_BOX_CLUSTER: "eu-1" }),
        "settings that are null": resolveSandBoxIdentityTags({ SAND_BOX_AUTH_ID: null, SAND_BOX_TENANT_ID: null, SAND_BOX_STORE_ID: null, SAND_BOX_BOOT_ID: null, SAND_BOX_CLUSTER: null }),
        "a setting that is a number": outcomeByClass(() => resolveSandBoxIdentityTags({ SAND_BOX_AUTH_ID: 7 })),
        "null for the settings": outcomeByClass(() => resolveSandBoxIdentityTags(null)),
        "what is read of the settings, in order": read,
        "from settings that are watched": fromWatched,
        "from the process's own settings": fromTheProcess,
        "a new answer each time": resolveSandBoxIdentityTags(all) !== resolveSandBoxIdentityTags(all),
      };
    },
  },
  {
    name: "an error is told for telemetry by its message and, when it has one, its stack",
    run: ({ telemetry }) => {
      const { sandErrorDetail } = telemetry;
      const told = (error) => {
        const detail = sandErrorDetail(error);
        return {
          fields: Object.keys(detail),
          message: detail.message,
          stack: !("stack" in detail) ? "no field" : typeof detail.stack === "string" && detail.stack.length > 40 ? (detail.stack === error.stack ? "the error's own stack" : "another text") : detail.stack,
        };
      };
      const stackless = new Error("no stack on this one");
      stackless.stack = undefined;
      const stackGone = new Error("its stack was removed");
      delete stackGone.stack;
      const ownStack = new Error("a stack of its own words");
      ownStack.stack = "short";
      const nullStack = new Error("a stack that is null");
      nullStack.stack = null;
      const emptyStack = new Error("an empty stack");
      emptyStack.stack = "";
      class Coded extends Error {}
      return {
        "an error": told(new Error("the disk is full")),
        "a TypeError": told(new TypeError("not a function")),
        "an error of a class of ours": told(new Coded("coded")),
        "space around the message": told(new Error("  spaced  ")),
        "an empty message": told(new Error("")),
        "an empty message with a cause": told(new Error("", { cause: new Error("the cause's words") })),
        "an empty message with a cause that is a text": told(new Error("", { cause: "a text for a cause" })),
        "a message with a cause": told(new Error("the outer words", { cause: new Error("the inner words") })),
        "a message that is [object Object]": told(new Error("[object Object]")),
        "a stack that is undefined": told(stackless),
        "a stack that was removed": told(stackGone),
        "a stack of its own words": told(ownStack),
        "a stack that is null": told(nullStack),
        "an empty stack": told(emptyStack),
        "a text": told("only words"),
        "an empty text": told(""),
        "a number": told(504),
        null: told(null),
        undefined: told(undefined),
        "a plain object with a message and a stack": told({ message: "from an object", stack: "its stack" }),
        "a plain object without a message": told({ code: "E_FAIL" }),
        "a list": told(["a", "b"]),
        "nothing given": told(),
        "a new answer each time": (() => {
          const error = new Error("m");
          return sandErrorDetail(error) !== sandErrorDetail(error);
        })(),
      };
    },
  },
  {
    name: "the telemetry that measures nothing has thirty-two verbs, each of which takes anything and gives nothing back",
    run: ({ telemetry }) => {
      const { createNoopSandTelemetry } = telemetry;
      const one = createNoopSandTelemetry();
      const two = createNoopSandTelemetry();
      const names = Object.keys(one);
      const turn = one.startTurn({ agentId: "a1" }, "more");
      const reporters = names.filter((name) => name !== "startTurn");
      const answers = {};
      for (const name of reporters) {
        const gave = [one[name](), one[name]({ agentId: "a1", error: new Error("x") }, 2, "three"), one[name].call(undefined, null)];
        answers[name] = gave.every((value) => value === undefined) ? "nothing" : gave;
      }
      one.reportAgentError = () => "changed on one";
      return {
        asKept: two,
        names,
        count: names.length,
        "what each verb gives back": answers,
        "every verb but the first is one and the same function": reporters.every((name) => two[name] === two[reporters[0]]),
        "and the same in another telemetry": reporters.every((name) => two[name] === createNoopSandTelemetry()[name]),
        "how many arguments a verb counts": two.reportAgentError.length,
        "a verb can be made with new": outcomeByClass(() => new two.reportAgentError()).threwA ?? "it can",
        "a new telemetry each time": one !== two,
        "changing one leaves the other": [one.reportAgentError(), two.reportAgentError()],
        "frozen": Object.isFrozen(two),
        "a turn": {
          asKept: turn,
          names: Object.keys(turn),
          "what each gives back": [turn.setModel("model-1"), turn.setRequestId("req-1"), turn.finalize({ outcome: "ok" }), turn.finalize()],
          "its three verbs are the function the other verbs are": [turn.setModel === two.reportAgentError, turn.setRequestId === two.reportAgentError, turn.finalize === two.reportAgentError],
          "the same turn every time": one.startTurn() === turn,
          "the same turn from another telemetry": two.startTurn() === turn,
          "frozen": Object.isFrozen(turn),
          "starting a turn is a function of each telemetry's own": one.startTurn !== two.startTurn,
          "how many arguments starting a turn counts": two.startTurn.length,
        },
      };
    },
  },

  // ----- mcp-state-executor.ts
  {
    name: "the connected tools are told as one server for each provider, in the order the providers first appear",
    run: async ({ mcpState }) => {
      const { provider, asked } = providerOf([
        tool("linear", "list_issues", { description: "Lists the issues of a team.", inputSchema: { type: "object", properties: { team: { type: "string" } }, required: ["team"] } }),
        tool("github", "open_pr", { description: "Opens a pull request." }),
        tool("linear", "create_issue", { description: "Creates an issue.", inputSchema: { type: "object" } }),
        tool("notion", "search", {}),
        tool("github", "merge_pr", { inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
      ]);
      const executor = mcpState.createSandMcpStateExecutor(provider);
      const context = { turn: 1 };
      const promise = executor.execute(context, "more");
      const result = await promise;
      return {
        executor: { asKept: executor, fields: Object.keys(executor), executeCounts: executor.execute.length },
        gaveAPromise: promise instanceof Promise,
        asked: asked.map((ask) => ({ arguments: ask.arguments, sameContext: ask.context === context, calledOnTheProvider: ask.calledOnTheProvider })),
        resultCase: result.result.case,
        servers: result.result.value.servers.map((server) => ({ serverIdentifier: server.serverIdentifier, serverName: server.serverName, status: server.status, tools: server.tools.map((entry) => entry.name) })),
        ...wire(result),
      };
    },
  },
  {
    name: "no tools is a success with no servers, and the provider is asked afresh at every call",
    run: async ({ mcpState }) => {
      const lists = [[], [tool("github", "open_pr")], []];
      const { provider, asked } = providerOf(() => lists.shift());
      const executor = mcpState.createSandMcpStateExecutor(provider);
      const results = [];
      for (const context of [undefined, null, "a text for a context"]) results.push(wire(await executor.execute(context)));
      const none = await mcpState.createSandMcpStateExecutor(providerOf([]).provider).execute();
      return { results, asked, "nothing given for the context": wire(none), "another executor each time": mcpState.createSandMcpStateExecutor(provider) !== mcpState.createSandMcpStateExecutor(provider) };
    },
  },
  {
    name: "providers keep the order they came in, whatever their names, and a tool told twice is told twice",
    run: async ({ mcpState }) => {
      const order = async (tools) => {
        const result = await mcpState.createSandMcpStateExecutor(providerOf(tools).provider).execute({});
        return result.result.value.servers.map((server) => `${JSON.stringify(server.serverIdentifier)}: ${server.tools.map((entry) => `${entry.name}/${entry.toolName}/${entry.providerIdentifier}`).join(", ")}`);
      };
      const twice = tool("github", "open_pr");
      return {
        "names that are numbers, largest first": await order([tool("10", "a"), tool("2", "b"), tool("1", "c"), tool("2", "d"), tool("10", "e")]),
        "names that differ by case or space": await order([tool("GitHub", "a"), tool("github", "b"), tool(" github", "c"), tool("GitHub", "d")]),
        "an empty name": await order([tool("", "a"), tool("x", "b"), tool("", "c")]),
        "names an object would trip on": await order([tool("__proto__", "a"), tool("constructor", "b"), tool("toString", "c"), tool("__proto__", "d")]),
        "the same tool twice, and two tools with one name": await order([twice, twice, tool("github", "open_pr", { toolName: "another" })]),
        "one provider for many": await order(Array.from({ length: 12 }, (_, index) => tool("big", `t${index}`))),
        "many providers of one": await order(Array.from({ length: 12 }, (_, index) => tool(`p${11 - index}`, "t"))),
      };
    },
  },
  {
    name: "a tool's description and schema are told as given: none stays none, and a schema may be any JSON",
    run: async ({ mcpState }) => {
      const out = {};
      const schemas = {
        "no schema": undefined,
        "an object": { type: "object", properties: { n: { type: "integer", minimum: 0, maximum: 10 }, tags: { type: "array", items: { type: "string" } } } },
        "an empty object": {},
        "a list": [1, "two", null, true, { three: 3 }, [4]],
        "an empty list": [],
        "a text": "any",
        "an empty text": "",
        "a number": 1.5,
        zero: 0,
        true: true,
        false: false,
        null: null,
        "nested deep": { a: { b: { c: { d: [{ e: null }] } } } },
        "keys out of order": { z: 1, a: 2, m: 3 },
      };
      for (const [name, inputSchema] of Object.entries(schemas)) {
        const result = await mcpState.createSandMcpStateExecutor(providerOf([tool("p", "t", inputSchema === undefined ? {} : { inputSchema })]).provider).execute({});
        const told = result.result.value.servers[0].tools[0];
        out[`schema: ${name}`] = { hasASchema: told.inputSchema !== undefined, schemaKind: told.inputSchema?.kind.case ?? "none", ...wire(told) };
      }
      const descriptions = { "no description": {}, "undefined for the description": { description: undefined }, "an empty description": { description: "" }, "a description": { description: "Does a thing.\nOn two lines." } };
      for (const [name, more] of Object.entries(descriptions)) {
        const result = await mcpState.createSandMcpStateExecutor(providerOf([tool("p", "t", more)]).provider).execute({});
        const told = result.result.value.servers[0].tools[0];
        out[name] = { description: told.description, ...wire(told) };
      }
      return out;
    },
  },
  {
    name: "what the provider gives is read and not changed: a frozen list, a set, a promise, and more fields than are told",
    run: async ({ mcpState }) => {
      const names = async (tools) => {
        const result = await mcpState.createSandMcpStateExecutor(providerOf(tools).provider).execute({});
        return result.result.value.servers.map((server) => `${server.serverIdentifier}: ${server.tools.map((entry) => entry.name).join(", ")}`);
      };
      const frozen = Object.freeze([Object.freeze(tool("a", "one")), Object.freeze(tool("b", "two")), Object.freeze(tool("a", "three"))]);
      const extra = tool("a", "one", { annotations: { readOnly: true }, serverName: "ignored", status: "ignored" });
      const before = JSON.stringify(extra);
      const result = await mcpState.createSandMcpStateExecutor(providerOf([extra]).provider).execute({});
      function* made() {
        yield tool("a", "one");
        yield tool("b", "two");
      }
      return {
        "a frozen list of frozen tools": await names(frozen),
        "a set": await names(new Set([tool("a", "one"), tool("b", "two"), tool("a", "three")])),
        "a generator": await names(() => made()),
        "a promise of a list": await names(() => Promise.resolve([tool("a", "one")])),
        "more fields than are told": { ...wire(result.result.value.servers[0]), toolUnchanged: JSON.stringify(extra) === before },
        "two calls at once do not mix": await (async () => {
          const lists = [[tool("first", "a"), tool("first", "b")], [tool("second", "c")]];
          const slow = mcpState.createSandMcpStateExecutor({ getTools: async () => { const mine = lists.shift(); await new Promise((resolve) => setTimeout(resolve, mine.length === 2 ? 15 : 1)); return mine; } });
          const both = await Promise.all([slow.execute({}), slow.execute({})]);
          return both.map((each) => each.result.value.servers.map((server) => `${server.serverIdentifier}: ${server.tools.length}`));
        })(),
      };
    },
  },
  {
    name: "a provider that fails, or gives what is not a list of tools, fails the call",
    run: async ({ mcpState }) => {
      const failure = new Error("the connectors are down");
      const settle = (tools) => mcpState.createSandMcpStateExecutor(providerOf(tools).provider).execute({}).then((value) => ({ gave: value.result.value.servers.length }), (error) => (error === failure ? "the provider's own error" : { failedWithA: error?.constructor?.name ?? String(error) }));
      let threwAtOnce = "no";
      let promise;
      try {
        promise = mcpState.createSandMcpStateExecutor(providerOf(() => { throw failure; }).provider).execute({});
      } catch {
        threwAtOnce = "yes";
      }
      return {
        "a provider that throws": { threwAtOnce, settled: await promise.then(() => "gave", (error) => (error === failure ? "the provider's own error" : "another error")) },
        "a provider whose promise fails": await settle(() => Promise.reject(failure)),
        "undefined for the tools": await settle(undefined),
        "null for the tools": await settle(null),
        "a number for the tools": await settle(7),
        "an object for the tools": await settle({ 0: tool("a", "one"), length: 1 }),
        "a text for the tools": await settle("ab"),
        "a tool that is null": await settle([null]),
        "a tool that is undefined": await settle([tool("a", "one"), undefined]),
        "a schema that is not JSON: a function": await settle([tool("a", "one", { inputSchema: () => {} })]),
        "a schema that is not JSON: a big number": await settle([tool("a", "one", { inputSchema: 5n })]),
        "a schema that is not JSON: a symbol": await settle([tool("a", "one", { inputSchema: Symbol("s") })]),
        "a schema that holds what is not JSON": await settle([tool("a", "one", { inputSchema: { deep: [5n] } })]),
        "a good tool after a bad schema is not told either": await settle([tool("a", "one", { inputSchema: 5n }), tool("b", "two")]),
        "no provider": outcomeByClass(() => mcpState.createSandMcpStateExecutor(undefined)).threwA ?? "made all the same",
        "no provider, asked": await mcpState.createSandMcpStateExecutor(undefined).execute({}).then(() => "gave", (error) => ({ failedWithA: error.constructor.name })),
      };
    },
  },

  // ----- sand-analytics-types.ts
  {
    name: "a message's length falls into one of six sizes: nothing, under 20, under 100, under 500, under 2,000, and more",
    run: ({ analyticsTypes }) => {
      const out = {};
      const lengths = [-1, 0, 1, 2, 19, 20, 21, 99, 100, 101, 499, 500, 501, 1999, 2000, 2001, 10000, 0.5, 19.999, 99.5, 499.99, 1999.999, -0.1, -0, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
      for (const length of lengths) out[`a length of ${Object.is(length, -0) ? "-0" : String(length)}`] = analyticsTypes.sandMessageLengthBucket(length);
      const others = { "the text \"5\"": "5", "the text \"250\"": "250", "an empty text": "", "the text \"long\"": "long", null: null, undefined, true: true, false: false, "the big number 5": 5n, "the big number 3000": 3000n, "an empty list": [], "a list of 30": [30], "a list of two": [1, 2], "an object": {} };
      for (const [name, length] of Object.entries(others)) out[name] = analyticsTypes.sandMessageLengthBucket(length);
      out["nothing given"] = analyticsTypes.sandMessageLengthBucket();
      out["every length from -5 to 2,100, as runs of one size"] = (() => {
        const runs = [];
        for (let length = -5; length <= 2100; length += 1) {
          const size = analyticsTypes.sandMessageLengthBucket(length);
          if (runs.length === 0 || runs.at(-1).size !== size) runs.push({ size, from: length, to: length });
          else runs.at(-1).to = length;
        }
        return runs;
      })();
      return out;
    },
  },

  // ----- product-analytics.ts
  {
    name: "the product analytics that track nothing take any event and give nothing back",
    run: ({ productAnalytics }) => {
      const one = productAnalytics.createNoopSandProductAnalytics();
      const two = productAnalytics.createNoopSandProductAnalytics("ignored");
      const properties = Object.freeze({ plan: "pro", count: 3 });
      return {
        asKept: one,
        fields: Object.keys(one),
        gives: [one.trackEvent("agent_created"), one.trackEvent("agent_created", properties), one.trackEvent(), one.trackEvent(null, null, "more"), one.trackEvent.call(undefined, "detached")],
        propertiesUnchanged: JSON.stringify(properties),
        argumentsCounted: one.trackEvent.length,
        canBeMadeWithNew: outcomeByClass(() => new one.trackEvent()).threwA ?? "it can",
        aNewOneEachTime: one !== two,
        withAFunctionOfItsOwn: one.trackEvent !== two.trackEvent,
        frozen: Object.isFrozen(one),
      };
    },
  },

  // ----- transport.ts
  {
    name: "a transport starts with no sent message and no reaction, and has three verbs",
    run: ({ transport }) => {
      let calls = 0;
      const made = transport.createSandTransport(() => {
        calls += 1;
        return "m1";
      });
      return {
        asKept: made,
        fields: Object.keys(made),
        argumentsCounted: [made.onUpdate.length, made.lastSentMessageId.length, made.lastReactionApplied.length],
        lastSentMessageId: made.lastSentMessageId(),
        lastReactionApplied: made.lastReactionApplied(),
        ingestCalledByMakingIt: calls,
        frozen: Object.isFrozen(made),
        withoutAnIngest: outcomeByClass(() => transport.createSandTransport()).threwA ?? "made all the same",
        // The failure is JavaScript's own (what was given is not a function): its class is kept, and its sentence is cut from the line.
        withoutAnIngestThenUsed: (({ threwA, lines }) => ({ threwA, lines: lines.map((line) => line.replace(/(error=TypeError: ).*$/, "$1<the runtime's own sentence>")) }))(hostLines(() => outcomeByClass(() => transport.createSandTransport().onUpdate(sent("text"))))),
      };
    },
  },
  {
    name: "a sent message the transcript took is remembered by its id and written to the host's log",
    run: ({ transport }) => ({
      "one message": drive(transport.createSandTransport, ["t1s1"], [sent("text")]),
      "three in a row, each with its id": drive(transport.createSandTransport, ["t1s1", "t1s2", "t1s3"], [sent("text"), sent("card"), sent("image")]),
      "the update is handed over as it is, alone": drive(transport.createSandTransport, ["m1"], [sent("text", { extra: { deep: true } })]).ingestSaw,
    }),
  },
  {
    name: "a sent message the transcript gave no id for is written with a dash, and the earlier id is forgotten",
    run: ({ transport }) => ({
      "an id, then none": drive(transport.createSandTransport, ["m1", undefined], [sent("text"), sent("text")]),
      "none at first": drive(transport.createSandTransport, [undefined], [sent("text")]),
      "null for an id": drive(transport.createSandTransport, ["m1", null], [sent("text"), sent("text")]),
      "an empty id": drive(transport.createSandTransport, [""], [sent("text")]),
      "a number for an id": drive(transport.createSandTransport, [0, 42], [sent("text"), sent("text")]),
      "false for an id": drive(transport.createSandTransport, [false], [sent("text")]),
      "an object for an id": drive(transport.createSandTransport, [{ id: "m1" }], [sent("text")]).lines,
    }),
  },
  {
    name: "the kind of a sent message in the log is its message's own type when that is a text, and a question mark otherwise",
    run: ({ transport }) => {
      const out = {};
      const messages = {
        "a message of type text": { type: "text" },
        "a type with spaces and a line break": { type: "two words\nand a line" },
        "an empty type": { type: "" },
        "a type that is a number": { type: 5 },
        "a type that is null": { type: null },
        "a type that is an object": { type: { name: "text" } },
        "a message with no type": { text: "hello" },
        "a message that is null": null,
        "a message that is a text": "hello",
        "a message that is a number": 7,
        "a message that is a list": ["text"],
        "a list with a type on it": Object.assign(["x"], { type: "listed" }),
        "a function with a type on it": Object.assign(() => {}, { type: "callable" }),
        "a message whose type is inherited": Object.create({ type: "inherited" }),
        "a very long type": { type: "t".repeat(300) },
      };
      for (const [name, message] of Object.entries(messages)) out[name] = drive(transport.createSandTransport, ["m1"], [{ type: "send-message", message }]).lines;
      out["no message at all"] = drive(transport.createSandTransport, ["m1"], [{ type: "send-message" }]).lines;
      return out;
    },
  },
  {
    name: "a reaction holds when the transcript gave anything back for it, and writes nothing to the log",
    run: ({ transport }) => ({
      "an id back": drive(transport.createSandTransport, ["r1"], [reaction()]),
      "nothing back": drive(transport.createSandTransport, [undefined], [reaction()]),
      "null back": drive(transport.createSandTransport, [null], [reaction()]),
      "an empty text back": drive(transport.createSandTransport, [""], [reaction()]).steps,
      "zero back": drive(transport.createSandTransport, [0], [reaction()]).steps,
      "false back": drive(transport.createSandTransport, [false], [reaction()]).steps,
      "held, then not, then held": drive(transport.createSandTransport, ["r1", undefined, "r3"], [reaction(), reaction(), reaction()]).steps,
      "a sent message between two reactions changes neither": drive(transport.createSandTransport, ["r1", "m1", undefined, "m2"], [reaction(), sent("text"), reaction(), sent("text")]),
    }),
  },
  {
    name: "any other update goes to the transcript and changes nothing the transport remembers",
    run: ({ transport }) => ({
      "other kinds between a message and a reaction": drive(transport.createSandTransport, ["m1", "x1", "r1", "x2", undefined], [sent("text"), { type: "tool-call-started", id: "c1" }, reaction(), { type: "thinking" }, { type: "tool-call-completed" }]),
      "kinds that only look alike": drive(transport.createSandTransport, ["x"], [{ type: "Send-Message", message: { type: "text" } }, { type: "send-message " }, { type: "send_message" }, { type: "react-to-message " }, { type: "REACT-TO-MESSAGE" }, { type: "" }, {}, { type: null }, { type: 5 }, { type: ["send-message"] }]),
      "an update that is not an object": hostLines(() => {
        const made = transport.createSandTransport(() => "x");
        return { null: outcomeByClass(() => made.onUpdate(null)), undefined: outcomeByClass(() => made.onUpdate(undefined)), "a text": outcomeByClass(() => made.onUpdate("send-message")), "a number": outcomeByClass(() => made.onUpdate(7)), after: [made.lastSentMessageId(), made.lastReactionApplied()] };
      }),
    }),
  },
  {
    name: "a sent message the transcript refused is written to the log with the refusal, and the refusal is thrown on as it is",
    run: ({ transport }) => {
      class Refused extends Error {
        constructor(message) {
          super(message);
          this.name = "TranscriptRefused";
        }
      }
      const noName = new Error("its name was taken away");
      noName.name = "";
      const numberName = new Error("its name is a number");
      numberName.name = 7;
      const noMessage = new Error("words");
      noMessage.message = undefined;
      const errors = {
        "an error": new Error("the transcript is closed"),
        "a TypeError": new TypeError("message.text is not a string"),
        "an error with a name of its own": new Refused("too long for one message"),
        "an error with no words": new Error(""),
        "an error whose name was taken away": noName,
        "an error whose name is a number": numberName,
        "an error whose words are undefined": noMessage,
        "an error with a cause": new Error("outer", { cause: new Error("inner") }),
        "a text": "refused, in a text",
        "an empty text": "",
        "a number": 409,
        null: null,
        undefined,
        "a plain object": { code: "E_REFUSED", message: "in an object" },
        "a list": ["a", "b"],
        "an object that says its own text": { toString: () => "said by toString" },
      };
      const out = {};
      for (const [name, error] of Object.entries(errors)) out[name] = drive(transport.createSandTransport, [{ throws: error }], [sent("text")]);
      out["a symbol"] = hostLines(() => outcomeByClass(() => transport.createSandTransport(() => { throw Symbol("refused"); }).onUpdate(sent("text"))));
      out["an object that cannot be made a text"] = hostLines(() => outcomeByClass(() => transport.createSandTransport(() => { throw Object.create(null); }).onUpdate(sent("text"))));
      return out;
    },
  },
  {
    name: "the refusal in the log is one line of at most 160 characters, with an ellipsis when cut",
    run: ({ transport }) => {
      const out = {};
      const line = (error) => drive(transport.createSandTransport, [{ throws: error }], [sent("text")]).lines[0];
      // "Error: " is seven characters: words of 153 make 160 in all.
      for (const words of [152, 153, 154, 155, 300]) {
        const written = line(new Error("w".repeat(words)));
        const refusal = written.slice(written.indexOf("error=") + 6);
        out[`an error of ${words} letters`] = { refusalLength: refusal.length, endsWith: refusal.slice(-3) };
      }
      for (const length of [159, 160, 161]) {
        const written = line("t".repeat(length));
        const refusal = written.slice(written.indexOf("error=") + 6);
        out[`a text of ${length} letters`] = { refusalLength: refusal.length, endsWith: refusal.slice(-3) };
      }
      out["line breaks, tabs and runs of spaces become one space each"] = line(new Error("first line\nsecond line\r\n\tindented   and   spaced  \n\n\nend"));
      out["space at either end is kept as one space"] = line(new Error("  padded  "));
      out["spaces are counted after they are made one"] = (() => {
        const written = line(new Error(`${"a ".repeat(70)}${" ".repeat(50)}tail-that-is-kept`));
        return written.slice(written.indexOf("error=") + 6);
      })();
      out["a long refusal with the message's kind"] = line(new TypeError(`${"x".repeat(200)}`)).length;
      return out;
    },
  },
  {
    name: "a refusal leaves what the transport remembers as it was, and only a sent message's refusal is written to the log",
    run: ({ transport }) => {
      const refusal = new Error("refused");
      return {
        "a message, a refused message, a message": drive(transport.createSandTransport, ["m1", { throws: refusal }, "m3"], [sent("text"), sent("card"), sent("text")]),
        "a reaction held, then a refused reaction": drive(transport.createSandTransport, ["r1", { throws: refusal }], [reaction(), reaction()]),
        "a refused update of another kind": drive(transport.createSandTransport, [{ throws: refusal }], [{ type: "tool-call-started" }]),
        "a refused message with no message in it": drive(transport.createSandTransport, [{ throws: refusal }], [{ type: "send-message" }]).lines,
        "a refused message of a kind that is not a text": drive(transport.createSandTransport, [{ throws: refusal }], [{ type: "send-message", message: { type: 5 } }]).lines,
      };
    },
  },
  {
    name: "the update's kind is read after the transcript has had it",
    run: ({ transport }) => ({
      "another kind that the transcript turns into a sent message": drive(transport.createSandTransport, [{ changesTypeTo: "send-message", gives: "m1" }], [{ type: "draft", message: { type: "text" } }]),
      "a sent message that the transcript turns into another kind": drive(transport.createSandTransport, [{ changesTypeTo: "draft", gives: "m1" }], [sent("text")]),
      "another kind that the transcript turns into a reaction": drive(transport.createSandTransport, [{ changesTypeTo: "react-to-message", gives: "r1" }], [{ type: "draft" }]),
    }),
  },
  {
    name: "when the log itself fails, the id is already remembered, and the log's failure is the one thrown",
    run: ({ transport }) => {
      const refusal = new Error("refused by the transcript");
      const written = drive(transport.createSandTransport, ["m1"], [sent("text")], { failing: true });
      const refused = drive(transport.createSandTransport, [{ throws: refusal }], [sent("text")], { failing: true });
      const quiet = drive(transport.createSandTransport, ["r1", "x1"], [reaction(), { type: "thinking" }], { failing: true });
      return { "a message the transcript took": written, "a message the transcript refused": refused, "a reaction and another kind write nothing, so nothing fails": quiet };
    },
  },
  {
    name: "two transports remember apart, and one transport keeps what it remembers across many updates",
    run: ({ transport }) => hostLines(() => {
      const one = transport.createSandTransport((update) => (update.type === "send-message" ? `one-${update.n}` : update.type === "react-to-message" ? "held" : undefined));
      const two = transport.createSandTransport(() => undefined);
      const states = [];
      const note = (what) => states.push([what, one.lastSentMessageId(), one.lastReactionApplied(), two.lastSentMessageId(), two.lastReactionApplied()]);
      note("at first");
      one.onUpdate({ type: "send-message", n: 1, message: { type: "text" } });
      note("one sent");
      two.onUpdate({ type: "send-message", n: 1, message: { type: "text" } });
      note("two sent, with no id back");
      one.onUpdate(reaction());
      note("one reacted");
      two.onUpdate(reaction());
      note("two reacted, with nothing back");
      for (let n = 2; n <= 40; n += 1) one.onUpdate({ type: "send-message", n, message: { type: "text" } });
      note("one sent thirty-nine more");
      const { onUpdate, lastSentMessageId } = one;
      onUpdate({ type: "send-message", n: 41, message: { type: "card" } });
      note("one's verbs used on their own");
      return { states, detachedReads: lastSentMessageId() };
    }, { summed: true }),
  },
];
