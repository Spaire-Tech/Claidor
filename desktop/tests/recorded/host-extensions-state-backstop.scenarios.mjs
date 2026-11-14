/** A copy of each agent's state file kept in its store, made a little after the agent stops running, and the extension that offers it to the host when it is switched on. */
import { appendFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const part = "host/extensions/state-backstop";
export const modules = {
  service: "source/host/extensions/state-backstop/state-backstop-service.ts",
  extension: "source/host/extensions/state-backstop/extension.ts",
};

const SETTING = "SAND_STATE_S3_BACKSTOP";

/** What a call did: what it gave, or what it failed with. A runtime's own sentence is not kept. */
async function outcomeOf(run) {
  try {
    return { gave: await run() };
  } catch (error) {
    return { failed: error instanceof Error ? { class: error.constructor.name, code: error.code, message: error instanceof TypeError ? "(the runtime's own words)" : error.message } : error };
  }
}

/** Lets everything that was started without being waited for run to its end. */
async function settled() {
  for (let i = 0; i < 30; i += 1) await null;
}

/**
 * Stand-ins for everything a backstop is made with, each call on any of them kept in one list, in order: the store
 * provider and its stores, the map of stores, the reader of the state file, a debounce that fires when the scenario
 * says so, and the log.
 */
function standIns({ bytes = new Uint8Array([1, 2, 3, 4, 5]), calls = [], failAt = {}, kept = new Uint8Array([9, 8, 7]) } = {}) {
  const fail = (step) => {
    if (step in failAt) throw failAt[step];
  };
  const state = { bytes, triggers: [], backstop: undefined };
  const objectStoreProvider = {
    forStore(...given) {
      calls.push({ call: "provider.forStore", given });
      fail("forStore");
      return {
        async put(...putGiven) {
          calls.push({ call: `store(${given[0]}).put`, given: [putGiven[0], putGiven[1] === state.bytes ? "the very bytes that were read" : putGiven[1], ...putGiven.slice(2)] });
          fail("put");
        },
        async get(...getGiven) {
          calls.push({ call: `store(${given[0]}).get`, given: getGiven });
          fail("get");
          return kept;
        },
      };
    },
  };
  const sourceMap = {
    async getOrCreate(...given) {
      calls.push({ call: "sourceMap.getOrCreate", given });
      fail("getOrCreate");
      return "getOrCreateGives" in failAt ? failAt.getOrCreateGives : { sourceId: `source-of-${given[0]}`, mode: "local" };
    },
  };
  const debounce = {
    name: "a stand-in debounce",
    wrap(...given) {
      const at = state.triggers.length + 1;
      calls.push({ call: "debounce.wrap", given: given.map((one) => typeof one) });
      const trigger = Object.assign(
        (...triggerGiven) => {
          calls.push({ call: `trigger ${at} is pulled`, given: triggerGiven });
        },
        {
          dispose(...disposeGiven) {
            calls.push({ call: `trigger ${at} is disposed of`, given: disposeGiven });
          },
          fire: () => given[0](),
        },
      );
      state.triggers.push(trigger);
      return trigger;
    },
  };
  const readDbBytes = (...given) => {
    calls.push({ call: "readDbBytes", given });
    fail("read");
    return state.bytes;
  };
  const log = function (...given) {
    calls.push({ call: "log", given, calledOnTheBackstop: this === state.backstop });
  };
  return { calls, state, deps: { objectStoreProvider, sourceMap, debounce, agentsRootDir: "/stand-in/agents", readDbBytes, log } };
}

/** `console.log` kept instead of printed while `run` runs. */
async function withConsole(run) {
  const real = console.log;
  const printed = [];
  console.log = (...given) => {
    printed.push(given);
  };
  try {
    return await run(printed);
  } finally {
    console.log = real;
  }
}

/** The process's own setting changed for one scenario, then put back as it was. */
async function withSetting(value, run) {
  const before = Object.hasOwn(process.env, SETTING) ? process.env[SETTING] : undefined;
  const set = (next) => {
    if (next === undefined) delete process.env[SETTING];
    else process.env[SETTING] = next;
  };
  set(value);
  try {
    return await run(set);
  } finally {
    set(before);
  }
}

/**
 * The machine's timers stood in for while `run` runs: a timer of five seconds, the only kind the part sets, is kept
 * in `calls` and in `timers` instead of being set, and runs when the scenario fires it. Any other timer is the real one.
 */
async function withTimers(calls, run) {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const timers = [];
  globalThis.setTimeout = (callback, delay, ...more) => {
    if (delay !== 5_000) return real.setTimeout(callback, delay, ...more);
    const timer = {
      number: timers.length + 1,
      callback,
      unref() {
        calls.push({ call: `timer ${timer.number} is told not to keep the process running` });
      },
    };
    timers.push(timer);
    calls.push({ call: `timer ${timer.number} is set`, delay, moreGiven: more.length });
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    if (!timers.includes(timer)) return real.clearTimeout(timer);
    calls.push({ call: `timer ${timer.number} is cleared` });
    return undefined;
  };
  try {
    return await run(timers);
  } finally {
    Object.assign(globalThis, real);
  }
}

/**
 * A stand-in for the host that starts an extension. It hands the extension what the real one does (what each peer it
 * names gave, under the peer's id; the host's own log; a way to leave something to undo) and keeps, in order, every
 * call the extension makes on any of them. `peersFor` makes the peers, given the list the calls are kept in.
 */
function standInHost(declaration, peersFor = () => ({}), calls = []) {
  const left = [];
  const peers = peersFor(calls);
  const host = {
    log(...given) {
      calls.push({ call: "host.log", given, onTheHost: this === host });
    },
  };
  const deps = {};
  for (const id of declaration.dependencies) deps[id] = peers[id];
  const context = {
    deps,
    host,
    onStop(run) {
      calls.push({ call: "onStop", given: [typeof run] });
      return left.push({ extensionId: declaration.id, run });
    },
  };
  return {
    calls,
    left,
    host,
    peers,
    start: () => declaration.start({ ...context }),
    /** The host stopping: what was left is undone, the last thing left first, one at a time. What each gave is told. */
    async stop() {
      const undone = [];
      for (const leaving of left.splice(0).reverse()) {
        const gave = leaving.run();
        undone.push(gave instanceof Promise ? "a promise" : typeof gave);
        await gave;
      }
      return undone;
    },
  };
}

/** The extension started over stand-in peers: the store sync (for its store provider) and the map of stores. */
function startedExtension(extension, { env, runtime = {}, without, standInsGiven = {} } = {}) {
  const made = standIns(standInsGiven);
  const { calls, deps, state } = made;
  const declared = extension.createStateBackstopExtension({ agentsRootDir: deps.agentsRootDir, readDbBytes: deps.readDbBytes, ...runtime }, ...(env === undefined ? [] : [env]));
  const host = standInHost(
    declared,
    () => {
      const peers = { "box-store-sync": { objectStoreProvider: deps.objectStoreProvider, somethingElse: true }, "source-map": deps.sourceMap };
      if (without) delete peers[without];
      return peers;
    },
    calls,
  );
  return { declared, host, calls, deps, state };
}

const ways = (api) => Object.entries(api).map(([key, value]) => (typeof value === "function" ? [key, "function", value.length] : [key, value]));

export const scenarios = [
  // ── state-backstop-service.ts ─────────────────────────────────────────────
  {
    name: "the copy is kept as state/store.db, is at most 64 MiB, and is made five seconds after the last call for it",
    run: ({ service }) => ({ path: service.SAND_STATE_BACKSTOP_REL_PATH, cap: service.DEFAULT_MAX_SNAPSHOT_BYTES, wait: service.STATE_BACKSTOP_DEBOUNCE_MS }),
  },
  {
    name: "the switch is on for 1, true or yes, in any case and with blanks around, and off for anything else",
    run: async ({ service }) => {
      const table = {};
      for (const value of [undefined, "", "1", "true", "yes", "TRUE", "Yes", " 1 ", "\ttrue\n", "0", "false", "no", "on", "y", "2", "11", "true!", "1 1", "enabled"]) {
        table[value === undefined ? "(not set)" : JSON.stringify(value)] = service.isStateBackstopEnabled(value === undefined ? {} : { [SETTING]: value });
      }
      const fromTheProcess = await withSetting(undefined, (set) => {
        const unset = service.isStateBackstopEnabled();
        set("yes");
        const on = service.isStateBackstopEnabled();
        set("nope");
        return [unset, on, service.isStateBackstopEnabled()];
      });
      return { table, fromTheProcess, anotherSettingIsNotRead: service.isStateBackstopEnabled({ SAND_STATE_BACKSTOP: "1" }), noSettingsAtAll: await outcomeOf(() => service.isStateBackstopEnabled(null)) };
    },
  },
  {
    name: "the state file is read whole after a checkpoint; a file that is not there is not checkpointed and gives nothing",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "store.db");
      const scrub = (value) => (typeof value === "string" ? tools.scrub(value, { [dir]: "<tmp>" }) : value);
      const checkpoints = [];
      const noting = (...given) => void checkpoints.push(given.map(scrub));
      const missing = service.readStoreDbBytes(file, noting);
      const checkpointsForMissing = checkpoints.length;
      await writeFile(file, Buffer.from([0, 1, 2, 250]));
      const read = service.readStoreDbBytes(file, noting);
      const afterAChangingCheckpoint = service.readStoreDbBytes(file, () => {
        // A checkpoint folds what is pending into the file: the bytes are read after it, not before.
        appendFileSync(file, Buffer.from([7, 7]));
      });
      const failure = new Error("the checkpoint failed");
      const whenTheCheckpointFails = await outcomeOf(() => service.readStoreDbBytes(file, () => {
        throw failure;
      }));
      await rm(file);
      await mkdir(file);
      const aFolder = await outcomeOf(() => service.readStoreDbBytes(file, noting));
      return {
        missing,
        checkpointsForMissing,
        read: { class: read?.constructor?.name, bytes: read },
        afterAChangingCheckpoint,
        whenTheCheckpointFails: whenTheCheckpointFails.failed?.message,
        aFolder: aFolder.failed?.code,
        checkpoints,
      };
    },
  },
  {
    name: "an agent's state file is store.db in the agent's own folder under the agents' folder",
    run: ({ service }) => {
      const out = {};
      for (const root of ["/stand-in/agents", "/stand-in/agents/", "relative/agents", ""]) {
        const backstop = new service.SandStateBackstop({ ...standIns().deps, agentsRootDir: root });
        out[root === "" ? "(an empty root)" : root] = ["agent-a", "", "a/b", "../elsewhere", "a b", ".", "agent-a/"].map((agentId) => `${JSON.stringify(agentId)} -> ${backstop.dbPathFor(agentId)}`);
      }
      return out;
    },
  },
  {
    name: "a snapshot reads the file, asks the map for the agent's store, puts the very bytes there, and says so in the log",
    run: async ({ service }) => {
      const { calls, deps, state } = standIns();
      state.backstop = new service.SandStateBackstop(deps);
      const asked = state.backstop.snapshotNow("agent-a");
      const result = await asked;
      const empty = standIns({ bytes: new Uint8Array(0) });
      empty.state.backstop = new service.SandStateBackstop(empty.deps);
      return { aPromise: asked instanceof Promise, result, calls, anEmptyFile: { result: await empty.state.backstop.snapshotNow("agent-b"), calls: empty.calls.map((one) => one.call), log: empty.calls.at(-1).given } };
    },
  },
  {
    name: "an agent with no state file is skipped without a word and without asking for its store",
    run: async ({ service }) => {
      const out = {};
      for (const [name, bytes] of Object.entries({ null: null, undefined })) {
        const { calls, deps, state } = standIns({ bytes: "placeholder" });
        state.bytes = bytes;
        state.backstop = new service.SandStateBackstop(deps);
        out[name] = { result: await state.backstop.snapshotNow("agent-a"), calls };
      }
      return out;
    },
  },
  {
    name: "a state file over the limit is skipped and the log says by how much; at the limit it is copied",
    run: async ({ service }) => {
      const table = [];
      for (const [limit, sizes] of [[10, [9, 10, 11]], [0, [0, 1]], [undefined, [67_108_864, 67_108_865]], [null, [67_108_865]], [1.5, [1, 2]]]) {
        for (const size of sizes) {
          // Only the size is looked at, so a large file is stood in for by its size alone.
          const { calls, deps, state } = standIns({ bytes: { byteLength: size } });
          state.backstop = new service.SandStateBackstop({ ...deps, ...(limit === undefined ? {} : { maxSnapshotBytes: limit }) });
          const result = await state.backstop.snapshotNow("agent-a");
          table.push({ limit: limit === undefined ? "(none given)" : limit, size, result, calls: calls.map((one) => one.call).join(", "), log: calls.at(-1).call === "log" ? calls.at(-1).given : "nothing" });
        }
      }
      return table;
    },
  },
  {
    name: "a snapshot that fails at any step ends as an error with the failure's words, told to the log; it does not fail the caller",
    run: async ({ service }) => {
      const out = {};
      const cases = {
        "the file cannot be read": { read: new Error("the disk failed") },
        "the map of stores fails": { getOrCreate: new Error("the map failed") },
        "the store cannot be found": { forStore: new Error("no such store") },
        "the store refuses the bytes": { put: new Error("the store is full") },
        "a failure that is a text": { put: "just words" },
        "a failure that is null": { put: null },
        "a failure with no words but a cause": { put: new Error("", { cause: new Error("the cause's words") }) },
        "a failure with blanks around its words": { put: new Error("  spaced  ") },
        "a failure of another class": { read: new RangeError("out of range") },
      };
      for (const [name, failAt] of Object.entries(cases)) {
        const { calls, deps, state } = standIns({ failAt });
        state.backstop = new service.SandStateBackstop(deps);
        out[name] = { result: await outcomeOf(() => state.backstop.snapshotNow("agent-a")), calls: calls.map((one) => one.call).join(", "), log: calls.at(-1).given };
      }
      // A map that gives nothing where an entry was expected: the failure is the runtime's own, so only its place is kept.
      const { calls, deps, state } = standIns({ failAt: { getOrCreateGives: undefined } });
      state.backstop = new service.SandStateBackstop(deps);
      const result = await state.backstop.snapshotNow("agent-a");
      out["the map gives nothing"] = { status: result.status, theLogSaysTheSameWords: calls.at(-1).given[0] === `snapshot agent-a failed: ${result.error}`, calls: calls.map((one) => one.call).join(", ") };
      return out;
    },
  },
  {
    name: "left to itself a backstop logs to the console under its own name",
    run: ({ service }) =>
      withConsole(async (printed) => {
        const { deps } = standIns();
        delete deps.log;
        const backstop = new service.SandStateBackstop(deps);
        await backstop.snapshotNow("agent-a");
        const failing = standIns({ failAt: { put: new Error("the store is full") } });
        delete failing.deps.log;
        await new service.SandStateBackstop({ ...failing.deps, log: undefined }).snapshotNow("agent-b");
        const nullLog = standIns({ bytes: { byteLength: 99 } });
        await new service.SandStateBackstop({ ...nullLog.deps, log: null, maxSnapshotBytes: 5 }).snapshotNow("agent-c");
        return printed;
      }),
  },
  {
    name: "the copy is read back from the agent's store, whatever the store gives, and a failure on the way fails the caller",
    run: async ({ service }) => {
      const kept = new Uint8Array([4, 5, 6]);
      const { calls, deps, state } = standIns({ kept });
      state.backstop = new service.SandStateBackstop(deps);
      const asked = state.backstop.readSnapshot("agent-a");
      const read = await asked;
      const none = standIns({ kept: null });
      const failures = {};
      for (const [name, failAt] of Object.entries({ "the map of stores fails": { getOrCreate: new Error("the map failed") }, "the store cannot be found": { forStore: new Error("no such store") }, "the store cannot be read": { get: new Error("the store is away") } })) {
        const failing = standIns({ failAt });
        failures[name] = { ...(await outcomeOf(() => new service.SandStateBackstop(failing.deps).readSnapshot("agent-a"))), calls: failing.calls.map((one) => one.call).join(", ") };
      }
      const disposed = new service.SandStateBackstop(standIns({ kept }).deps);
      await disposed.dispose();
      return { aPromise: asked instanceof Promise, theVeryBytesTheStoreGave: read === kept, calls, whenTheStoreHasNone: await new service.SandStateBackstop(none.deps).readSnapshot("agent-a"), failures, afterTheBackstopIsDisposedOf: (await disposed.readSnapshot("agent-a")) === kept };
    },
  },
  {
    name: "a snapshot is scheduled through one debounced trigger for each agent, made the first time and pulled every time",
    run: async ({ service }) => {
      const { calls, deps, state } = standIns();
      state.backstop = new service.SandStateBackstop(deps);
      const gave = [state.backstop.scheduleSnapshot("agent-a"), state.backstop.scheduleSnapshot("agent-a"), state.backstop.scheduleSnapshot("agent-b"), state.backstop.scheduleSnapshot("agent-a", "more")];
      const scheduling = [...calls];
      const fired = state.triggers[1].fire();
      await settled();
      const afterTheSecondTriggerFires = calls.slice(scheduling.length);
      const from = calls.length;
      state.triggers[0].fire();
      state.triggers[0].fire();
      await settled();
      return { gave, scheduling, whatFiringGives: fired, afterTheSecondTriggerFires, afterTheFirstFiresTwice: calls.slice(from).map((one) => one.call) };
    },
  },
  {
    name: "disposing of a backstop disposes of every trigger once and stops all scheduling; a snapshot asked for outright still runs",
    run: async ({ service }) => {
      const { calls, deps, state } = standIns();
      state.backstop = new service.SandStateBackstop(deps);
      state.backstop.scheduleSnapshot("agent-a");
      state.backstop.scheduleSnapshot("agent-b");
      const from = calls.length;
      const asked = state.backstop.dispose();
      const gave = await asked;
      const disposing = calls.slice(from);
      const again = calls.length;
      await state.backstop.dispose();
      state.backstop.scheduleSnapshot("agent-a");
      state.backstop.scheduleSnapshot("agent-c");
      const afterwards = calls.slice(again);
      const outright = await state.backstop.snapshotNow("agent-a");
      const fromFiring = calls.length;
      state.triggers[0].fire();
      await settled();
      return { aPromise: asked instanceof Promise, gave, disposing, schedulingAndDisposingAfterwards: afterwards, outright, aTriggerFiredAfterwardsStillSnapshots: calls.slice(fromFiring).map((one) => one.call) };
    },
  },
  {
    name: "a scheduled snapshot that fails even in its telling is told once more, as rejected",
    run: async ({ service }) => {
      const { calls, deps, state } = standIns();
      const logged = [];
      deps.log = (message) => {
        logged.push(message);
        if (!message.startsWith("snapshot rejected")) throw new Error(`the log failed on: ${message}`);
      };
      state.backstop = new service.SandStateBackstop(deps);
      const outright = await outcomeOf(() => state.backstop.snapshotNow("agent-a"));
      const loggedOutright = logged.splice(0);
      state.backstop.scheduleSnapshot("agent-a");
      state.triggers[0].fire();
      await settled();
      return { outright, loggedOutright, loggedWhenScheduled: logged, calls: calls.map((one) => one.call).join(", ") };
    },
  },
  // ── extension.ts ──────────────────────────────────────────────────────────
  {
    name: "the extension is made for a folder of agents and a reader of state files, under the id state-backstop, and needs the store sync and the map of stores",
    run: ({ extension }) => {
      const make = extension.createStateBackstopExtension;
      const runtime = { agentsRootDir: "/stand-in/agents", readDbBytes: () => null };
      const declared = make(runtime);
      return { parameters: make.length, keys: Object.keys(declared), kind: declared.kind, id: declared.id, dependencies: declared.dependencies, frozen: [Object.isFrozen(declared), Object.isFrozen(declared.dependencies)], start: { kind: typeof declared.start, parameters: declared.start.length }, aNewOneEachTime: make(runtime) !== declared };
    },
  },
  {
    name: "switched off, a start asks nothing of anyone and hands back four ways that do nothing",
    run: async ({ extension }) => {
      const out = {};
      for (const [name, env] of Object.entries({ "no setting": {}, "set to 0": { [SETTING]: "0" }, "set to on": { [SETTING]: "on" } })) {
        const { host, calls } = startedExtension(extension, { env, without: "box-store-sync" });
        const api = host.start();
        const first = api.snapshotNow("agent-a");
        out[name] = {
          aPromise: api instanceof Promise,
          ways: ways(api),
          scheduleSnapshot: api.scheduleSnapshot("agent-a"),
          snapshotNow: { aPromise: first instanceof Promise, gave: await first, aNewAnswerEachTime: (await first) !== (await api.snapshotNow("agent-a")) },
          readSnapshot: { aPromise: api.readSnapshot("agent-a") instanceof Promise, gave: await api.readSnapshot("agent-a") },
          calls,
          leftToUndo: host.left.length,
          aNewSetOfWaysEachStart: host.start().scheduleSnapshot !== api.scheduleSnapshot,
        };
      }
      return out;
    },
  },
  {
    name: "switched on, a start leaves one thing to undo, says so in the host's log, and hands back four ways into a backstop over its peers",
    run: ({ extension }) =>
      withConsole(async (printed) => {
        const { host, calls, state } = startedExtension(extension, { env: { [SETTING]: "1" } });
        const api = host.start();
        const atStart = [...calls];
        const snapshot = await api.snapshotNow("agent-a");
        const read = await api.readSnapshot("agent-a");
        const afterwards = calls.slice(atStart.length);
        const stopping = await host.stop();
        return { aPromise: api instanceof Promise, ways: ways(api), atStart, snapshot, readGaveWhatTheStoreKeeps: read instanceof Uint8Array && read.length === 3, afterwards, printedToTheConsole: printed, stopping, bytesWereTheReadersOwn: state.bytes.length };
      }),
  },
  {
    name: "switched on, scheduling sets a timer of five seconds for each agent, set again on every call; stopping the host clears what waits and ends all scheduling",
    run: ({ extension }) =>
      withConsole(async (printed) => {
        const { host, calls } = startedExtension(extension, { env: { [SETTING]: "true" } });
        return withTimers(calls, async (timers) => {
          const api = host.start();
          const from = calls.length;
          const gave = [api.scheduleSnapshot("agent-a"), api.scheduleSnapshot("agent-b"), api.scheduleSnapshot("agent-a")];
          const scheduling = calls.slice(from);
          const beforeFiring = calls.length;
          timers[2].callback();
          await settled();
          const afterTheLastTimerRuns = calls.slice(beforeFiring).map((one) => one.call);
          const beforeAgain = calls.length;
          api.scheduleSnapshot("agent-a");
          const beforeStop = calls.length;
          const scheduledAgain = calls.slice(beforeAgain).map((one) => one.call);
          const stopping = await host.stop();
          const whileStopping = calls.slice(beforeStop).map((one) => one.call);
          const afterStop = calls.length;
          api.scheduleSnapshot("agent-a");
          api.scheduleSnapshot("agent-z");
          return { gave, scheduling, afterTheLastTimerRuns, scheduledAgain, stopping, whileStopping, schedulingAfterTheStop: calls.slice(afterStop).map((one) => one.call), timersSetInAll: timers.length, printedToTheConsole: printed };
        });
      }),
  },
  {
    name: "left to itself the extension reads the process's own setting, at each start and not when it is made",
    run: ({ extension }) =>
      withSetting(undefined, async (set) => {
        const { host, calls } = startedExtension(extension, {});
        const off = host.start().isEnabled;
        set("YES");
        const on = host.start().isEnabled;
        set("0");
        const offAgain = host.start().isEnabled;
        const settings = {};
        const given = startedExtension(extension, { env: settings });
        const before = given.host.start().isEnabled;
        settings[SETTING] = "1";
        const after = given.host.start().isEnabled;
        return { off, on, offAgain, hostLog: calls.filter((one) => one.call === "host.log").length, withSettingsOfItsOwn: { before, after } };
      }),
  },
  {
    name: "what the extension is made with overrules what the peers give: its own log, limit, store provider, map of stores and debounce are used when it brings them",
    run: async ({ extension }) => {
      const own = standIns({ bytes: { byteLength: 50 } });
      const ownCalls = own.calls;
      const { host, calls } = startedExtension(extension, {
        env: { [SETTING]: "1" },
        runtime: { log: own.deps.log, maxSnapshotBytes: 100, objectStoreProvider: own.deps.objectStoreProvider, sourceMap: own.deps.sourceMap, debounce: own.deps.debounce, readDbBytes: own.deps.readDbBytes, agentsRootDir: "/its/own/agents" },
      });
      const api = host.start();
      const under = await api.snapshotNow("agent-a");
      own.state.bytes = { byteLength: 101 };
      const over = await api.snapshotNow("agent-a");
      api.scheduleSnapshot("agent-a");
      return { under, over, callsOnItsOwn: ownCalls.map((one) => (one.call === "log" || one.call === "readDbBytes" ? [one.call, ...one.given] : one.call)), callsOnThePeersAndTheHost: calls.map((one) => one.call) };
    },
  },
  {
    name: "switched on without a peer: no store sync fails the start, no map of stores fails each snapshot",
    run: ({ extension }) =>
      withConsole(async (printed) => {
        const noSync = startedExtension(extension, { env: { [SETTING]: "1" }, without: "box-store-sync" });
        const started = await outcomeOf(() => noSync.host.start());
        const noMap = startedExtension(extension, { env: { [SETTING]: "1" }, without: "source-map" });
        const api = noMap.host.start();
        const snapshot = await api.snapshotNow("agent-a");
        const read = await outcomeOf(() => api.readSnapshot("agent-a"));
        return {
          withoutTheStoreSync: { started, calls: noSync.calls.map((one) => one.call), leftToUndo: noSync.host.left.length },
          withoutTheMapOfStores: { isEnabled: api.isEnabled, snapshot: snapshot.status, read, calls: noMap.calls.map((one) => one.call), printed: printed.length },
        };
      }),
  },
];
