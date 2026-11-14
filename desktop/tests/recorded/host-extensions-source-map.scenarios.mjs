/** Which store each agent's files are kept in: a small file in the data folder that gives every agent an id of its own, and the extension that hands the host one such map. */
import fs from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const part = "host/extensions/source-map";
export const modules = {
  service: "source/host/extensions/source-map/source-map-service.ts",
  extension: "source/host/extensions/source-map/extension.ts",
};

/** The settings the data folder is found by. The machine's own are put aside while a scenario runs. */
const NO_SETTINGS = { SAND_DATA_ROOT: undefined, SAND_USER_DATA_DIR: undefined, SAND_PACKAGED: undefined, SAND_LAB: undefined };

/** The process's own environment changed for one scenario, then put back as it was. */
async function withEnv(changes, run) {
  const before = {};
  const set = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  for (const [name, value] of Object.entries({ ...NO_SETTINGS, ...changes })) {
    before[name] = Object.hasOwn(process.env, name) ? process.env[name] : undefined;
    set(name, value);
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of Object.entries(before)) set(name, value);
  }
}

/** Ids handed out in order: "id-1", "id-2", and so on, with the count of those asked for. */
function ids() {
  const made = [];
  const next = () => {
    made.push(`id-${made.length + 1}`);
    return made.at(-1);
  };
  return { next, made };
}

/** What a call did: what it gave, or the failure it ended in. */
async function outcomeOf(run) {
  try {
    return { gave: await run() };
  } catch (error) {
    return { failed: error instanceof Error ? { class: error.constructor.name, code: error.code, message: error.message } : error };
  }
}

/** The file's text, or "no file". */
async function textOf(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "no file";
    throw error;
  }
}

/**
 * A stand-in disk for one scenario: the four calls the map makes on the disk are answered from memory, and each is
 * noted in order with the number of turns of the small queue that had passed when it was made, so that two pieces of
 * work under way at once are seen step by step. `refuse` names one call to fail.
 */
async function onStandInDisk({ files = {}, refuse } = {}, run) {
  const real = { readFile: fs.promises.readFile, mkdir: fs.promises.mkdir, writeFile: fs.promises.writeFile, rename: fs.promises.rename };
  const calls = [];
  let turns = 0;
  let counting = true;
  const refusal = new Error("the stand-in disk refuses");
  const answer = (name, given, work) => {
    calls.push({ turn: turns, call: name, given });
    if (name === refuse) return Promise.reject(refusal);
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  fs.promises.readFile = (file, ...more) => answer("readFile", [file, ...more], () => {
    if (!(file in files)) throw Object.assign(new Error("no such file"), { code: "ENOENT" });
    return files[file];
  });
  fs.promises.mkdir = (folder, ...more) => answer("mkdir", [folder, ...more], () => undefined);
  fs.promises.writeFile = (file, text, ...more) => answer("writeFile", [file, text, ...more], () => {
    files[file] = text;
  });
  fs.promises.rename = (from, to) => answer("rename", [from, to], () => {
    if (!(from in files)) throw Object.assign(new Error("no such file"), { code: "ENOENT" });
    files[to] = files[from];
    delete files[from];
  });
  // One turn of the small queue after another, counted for as long as the scenario's work goes on.
  void (async () => {
    while (counting && turns < 10_000) {
      await null;
      turns += 1;
    }
  })();
  try {
    return await run({ calls, files, refusal });
  } finally {
    counting = false;
    Object.assign(fs.promises, real);
  }
}

/** The process's own number taken out of a temporary file's name. */
const withoutPid = (tools, value) => JSON.parse(tools.scrub(JSON.stringify(value), { [`.${process.pid}.tmp`]: ".<pid>.tmp" }));

/**
 * A stand-in for the host that starts an extension. It hands the extension what the real one does (what each peer it
 * names gave, under the peer's id; the host's own log; a way to leave something to undo) and keeps, in order, every
 * call the extension makes on any of them. `peersFor` makes the peers, given the list the calls are kept in.
 */
function standInHost(declaration, peersFor = () => ({})) {
  const calls = [];
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
    /** The host stopping: what was left is undone, the last thing left first, one at a time. */
    async stop() {
      const undone = [];
      for (const leaving of left.splice(0).reverse()) undone.push(await outcomeOf(async () => typeof (await leaving.run())));
      return undone;
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What a map keeps of a file's text: the file as the map writes it back once one more agent ("probe") is added. */
async function keptFrom(service, tools, text) {
  const dir = await tools.tmp();
  const file = path.join(dir, "source-map.json");
  if (text !== undefined) await writeFile(file, text);
  const map = new service.SandSourceMap(file, () => "probe-id");
  await map.getOrCreate("probe");
  return JSON.parse(await readFile(file, "utf8"), (key, value) => (value !== null && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : value));
}

export const scenarios = [
  {
    name: "the store of the computer itself is kept under the key box-store",
    run: ({ service }) => service.BOX_STORE_SOURCE_KEY,
  },
  {
    name: "the map's file is source-map.json in the data folder, wherever the settings put that folder",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const told = async (changes) => withEnv(changes, () => tools.scrub(service.getSourceMapPath(), { [dir]: "<tmp>", [process.env.HOME]: "<home>" }));
      return {
        "nothing set": await told({}),
        "a packaged app": await told({ SAND_PACKAGED: "1" }),
        "a packaged lab build": await told({ SAND_PACKAGED: "1", SAND_LAB: "1" }),
        "a lab build that is not packaged": await told({ SAND_LAB: "1" }),
        "a data root": await told({ SAND_DATA_ROOT: path.join(dir, "root") }),
        "a data root with blanks around it": await told({ SAND_DATA_ROOT: `  ${path.join(dir, "root")}  ` }),
        "a data root that is not a full path": await told({ SAND_DATA_ROOT: "relative/root" }),
        "an empty data root": await told({ SAND_DATA_ROOT: "" }),
        "a user data folder": await told({ SAND_USER_DATA_DIR: path.join(dir, "user-data") }),
        "a data root and a user data folder": await told({ SAND_DATA_ROOT: path.join(dir, "root"), SAND_USER_DATA_DIR: path.join(dir, "user-data") }),
        "a user data folder in a packaged app": await told({ SAND_PACKAGED: "1", SAND_USER_DATA_DIR: path.join(dir, "user-data") }),
      };
    },
  },
  {
    name: "a new agent gets an id of its own and is kept as local; the file is written whole, two spaces deep, with no line end",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "source-map.json");
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const first = await map.getOrCreate("agent-a");
      const afterFirst = await readFile(file, "utf8");
      const second = await map.getOrCreate("agent-b");
      return { first, afterFirst, second, afterSecond: await readFile(file, "utf8"), idsAskedFor: made, inTheFolder: await readdir(dir) };
    },
  },
  {
    name: "the folders above the file are made when they are missing",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "not", "there", "yet", "source-map.json");
      const map = new service.SandSourceMap(file, () => "id-1");
      const entry = await map.getOrCreate("agent-a");
      return { entry, text: await readFile(file, "utf8"), inTheFolder: await readdir(path.dirname(file)) };
    },
  },
  {
    name: "an agent the file already holds keeps its entry: no id is asked for and the file is left as it was",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "source-map.json");
      const written = '{"agent-a":{"sourceId":"kept","mode":"agent-store","more":1},"agent-b":{"sourceId":"other","mode":"local"}}';
      await writeFile(file, written);
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const entries = [await map.getOrCreate("agent-a"), await map.getOrCreate("agent-b"), await map.getOrCreate("agent-a")];
      return { entries, idsAskedFor: made, fileLeftAsItWas: (await readFile(file, "utf8")) === written };
    },
  },
  {
    name: "the entry handed back is the one the map keeps: asked twice it is the same object, and a change made to it stays",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const { next } = ids();
      const map = new service.SandSourceMap(file, next);
      const first = await map.getOrCreate("agent-a");
      const again = await map.getOrCreate("agent-a");
      first.mode = "changed by the caller";
      const afterTheChange = await map.getOrCreate("agent-a");
      await map.getOrCreate("agent-b");
      return { sameObject: first === again, afterTheChange, sameObjectStill: afterTheChange === first, fileAfterAnotherAgent: await readFile(file, "utf8") };
    },
  },
  {
    name: "what a map keeps of a file: only entries with an id and one of the two modes, each cut down to those two fields",
    run: async ({ service }, tools) => {
      const texts = {
        "no file": undefined,
        "an empty file": "",
        "not JSON": "{ nope",
        "null": "null",
        "a list": '[{"sourceId":"a","mode":"local"}]',
        "a text": '"words"',
        "a number": "5",
        "an empty object": "{}",
        "a local entry": '{"a":{"sourceId":"s1","mode":"local"}}',
        "an agent-store entry": '{"a":{"sourceId":"s1","mode":"agent-store"}}',
        "another mode": '{"a":{"sourceId":"s1","mode":"remote"}}',
        "a mode in capitals": '{"a":{"sourceId":"s1","mode":"Local"}}',
        "no mode": '{"a":{"sourceId":"s1"}}',
        "no id": '{"a":{"mode":"local"}}',
        "an empty id": '{"a":{"sourceId":"","mode":"local"}}',
        "an id of one blank": '{"a":{"sourceId":" ","mode":"local"}}',
        "an id that is a number": '{"a":{"sourceId":7,"mode":"local"}}',
        "an entry that is null": '{"a":null}',
        "an entry that is a text": '{"a":"s1"}',
        "an entry that is a list": '{"a":["s1","local"]}',
        "more fields than the two": '{"a":{"mode":"local","extra":true,"sourceId":"s1","nested":{"x":1}}}',
        "good and bad entries together": '{"z":{"sourceId":"s-z","mode":"local"},"bad":{"sourceId":"","mode":"local"},"a":{"sourceId":"s-a","mode":"agent-store"},"worse":3}',
        "keys that are numbers": '{"b":{"sourceId":"s-b","mode":"local"},"10":{"sourceId":"s-10","mode":"local"},"2":{"sourceId":"s-2","mode":"local"}}',
        "an empty key": '{"":{"sourceId":"s","mode":"local"}}',
        "the probe itself": '{"probe":{"sourceId":"already","mode":"agent-store"}}',
      };
      const out = {};
      for (const [name, text] of Object.entries(texts)) out[name] = await outcomeOf(() => keptFrom(service, tools, text));
      return out;
    },
  },
  {
    name: "a file that cannot be read as a file counts as empty, and the first save then fails on it",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "source-map.json");
      await mkdir(file);
      const map = new service.SandSourceMap(file, () => "id-1");
      const before = await map.getBoxStore();
      const saving = await outcomeOf(() => map.getOrCreate("agent-a"));
      return { before, savingFailed: "failed" in saving, failureCode: saving.failed?.code, keptAllTheSame: await outcomeOf(() => map.getOrCreate("agent-a")) };
    },
  },
  {
    name: "an agent's mode is set: its id stays, a new entry takes the place of the old one, and the file is written every time",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const created = await map.getOrCreate("agent-a");
      const set = await map.setMode("agent-a", "agent-store");
      const nowKept = (await map.getOrCreate("agent-a")) === set;
      const afterSet = await readFile(file, "utf8");
      await rm(file);
      const setAgain = await map.setMode("agent-a", "agent-store");
      const afterSetAgain = await textOf(file);
      const back = await map.setMode("agent-a", "local");
      return {
        created,
        set,
        theOldEntryIsLeftAsItWas: created,
        setIsANewObject: set !== created,
        nowKept,
        afterSet,
        setAgain,
        setAgainIsANewObject: setAgain !== set,
        afterSetAgain,
        back,
        idsAskedFor: made,
      };
    },
  },
  {
    name: "setting the mode of an agent the map does not hold makes its entry with that mode",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const store = await map.setMode("agent-a", "agent-store");
      const local = await map.setMode("agent-b", "local");
      return { store, local, idsAskedFor: made, text: await readFile(file, "utf8") };
    },
  },
  {
    name: "a mode that is neither of the two is kept and written as given, and dropped by the next map that reads the file",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const map = new service.SandSourceMap(file, () => "id-1");
      const odd = [await map.setMode("agent-a", "somewhere"), await map.setMode("agent-b", undefined), await map.setMode("agent-c", null)];
      const text = await readFile(file, "utf8");
      const { next, made } = ids();
      const reader = new service.SandSourceMap(file, next);
      return { odd, text, readAgain: [await reader.getOrCreate("agent-a"), await reader.getOrCreate("agent-b"), await reader.getOrCreate("agent-c")], idsAskedFor: made };
    },
  },
  {
    name: "the computer's own store is asked for without making it, and made under its key when asked",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const none = await map.getBoxStore();
      const fileAfterAsking = await textOf(file);
      const asked = map.getOrCreateBoxStore();
      const made1 = await asked;
      const found = await map.getBoxStore();
      const sameAsByKey = (await map.getOrCreate(service.BOX_STORE_SOURCE_KEY)) === made1;
      return { none, fileAfterAsking, aPromise: asked instanceof Promise, made: made1, found, foundIsTheSameObject: found === made1, sameAsByKey, idsAskedFor: made, text: await readFile(file, "utf8") };
    },
  },
  {
    name: "a map reads its file once: a change on disk is not seen, and what it saves next replaces that change",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      await writeFile(file, '{"agent-a":{"sourceId":"first","mode":"local"}}');
      const { next } = ids();
      const map = new service.SandSourceMap(file, next);
      const read = await map.getOrCreate("agent-a");
      await writeFile(file, '{"agent-a":{"sourceId":"changed on disk","mode":"agent-store"},"agent-z":{"sourceId":"added on disk","mode":"local"}}');
      const stillTheFirst = await map.getOrCreate("agent-a");
      const another = new service.SandSourceMap(file, next);
      const seenByAnotherMap = await another.getOrCreate("agent-a");
      await map.getOrCreate("agent-b");
      return { read, stillTheFirst, seenByAnotherMap, textAfterTheFirstMapSaved: await readFile(file, "utf8") };
    },
  },
  {
    name: "names every object has are answered with what the object holds, not with an entry",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const got = [];
      for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
        const value = await map.getOrCreate(name);
        got.push([name, { kind: typeof value, name: typeof value === "function" ? value.name : undefined, isWhatEveryObjectInherits: value === Object.prototype }]);
      }
      const fileAfterAsking = await textOf(file);
      const setOnAName = await map.setMode("toString", "local");
      const thenAsked = await map.getOrCreate("toString");
      const textAfterSetting = await readFile(file, "utf8");
      // Set under the name __proto__, an entry becomes what the map itself inherits from: its fields then answer as agents.
      const setOnProto = await map.setMode("__proto__", "agent-store");
      const modeAsAnAgent = await map.getOrCreate("mode");
      const setOnProtoEmpty = await map.setMode("__proto__", "");
      const emptyModeAsAnAgent = await map.getOrCreate("mode");
      const idsBeforeSettingIt = [...made];
      const setOnTheEmptyOne = await map.setMode("mode", "local");
      const idsAfterSettingIt = [...made];
      const real = await map.getOrCreate("agent-a");
      return { got, fileAfterAsking, setOnAName, thenAsked, textAfterSetting, setOnProto, modeAsAnAgent, setOnProtoEmpty, emptyModeAsAnAgent, idsBeforeSettingIt, setOnTheEmptyOne, idsAfterSettingIt, real, idsAskedFor: made, text: await readFile(file, "utf8") };
    },
  },
  {
    name: "a file that names __proto__ gives the map that entry's fields as if they were agents",
    run: async ({ service }, tools) => {
      const file = path.join(await tools.tmp(), "source-map.json");
      await writeFile(file, '{"__proto__":{"sourceId":"from-proto","mode":"local"},"agent-a":{"sourceId":"s-a","mode":"local"}}');
      const { next, made } = ids();
      const map = new service.SandSourceMap(file, next);
      const asked = [];
      for (const name of ["agent-a", "sourceId", "mode", "__proto__"]) asked.push([name, await map.getOrCreate(name)]);
      await map.getOrCreate("agent-b");
      return { asked, idsAskedFor: made, text: await readFile(file, "utf8") };
    },
  },
  {
    name: "left to itself a map takes the data folder's file as it is when the map is made, and random ids",
    run: async ({ service }, tools) => {
      const dir = await tools.tmp();
      const map = await withEnv({ SAND_DATA_ROOT: path.join(dir, "root") }, () => new service.SandSourceMap());
      const elsewhere = await withEnv({ SAND_DATA_ROOT: path.join(dir, "elsewhere") }, async () => [await map.getOrCreate("agent-a"), await map.getOrCreate("agent-b")]);
      const kept = JSON.parse(await readFile(path.join(dir, "root", "source-map.json"), "utf8"));
      return {
        modes: elsewhere.map((entry) => entry.mode),
        idsAreRandom: elsewhere.every((entry) => UUID.test(entry.sourceId)),
        idsDiffer: elsewhere[0].sourceId !== elsewhere[1].sourceId,
        keptInTheFirstFolder: Object.keys(kept),
        theOtherFolderWasMade: (await readdir(dir)).sort(),
      };
    },
  },
  {
    name: "on a stand-in disk: a first agent is read for, then written in three steps under a temporary name",
    run: ({ service }, tools) =>
      onStandInDisk({}, async ({ calls, files }) => {
        const { next } = ids();
        const map = new service.SandSourceMap("/stand-in/data/source-map.json", next);
        const entry = await map.getOrCreate("agent-a");
        const again = await map.getOrCreate("agent-a");
        const set = await map.setMode("agent-a", "agent-store");
        const box = await map.getBoxStore();
        return withoutPid(tools, { entry, again, set, box, calls, files });
      }),
  },
  {
    name: "on a stand-in disk: a save that fails at any of its three steps fails the call, and the map keeps the entry all the same",
    run: async ({ service }, tools) => {
      const out = {};
      for (const refuse of ["mkdir", "writeFile", "rename"]) {
        out[refuse] = await onStandInDisk({ refuse }, async ({ calls, files, refusal }) => {
          const { next, made } = ids();
          const map = new service.SandSourceMap("/stand-in/data/source-map.json", next);
          let failure;
          const first = await map.getOrCreate("agent-a").catch((error) => {
            failure = error;
            return "failed";
          });
          const callsOfTheFailure = calls.length;
          const second = await outcomeOf(() => map.getOrCreate("agent-a"));
          const mode = await outcomeOf(() => map.setMode("agent-b", "local"));
          return withoutPid(tools, { first, failedWithTheDisksOwnError: failure === refusal, callsOfTheFailure, second, callsAfterAskingAgain: calls.length, mode: "failed" in mode ? "failed" : mode, idsAskedFor: made, calls: calls.map((one) => one.call), files });
        });
      }
      return out;
    },
  },
  {
    name: "on a stand-in disk: two first calls at once each read the file for themselves, and the one that saves last is what the map keeps",
    run: ({ service }, tools) =>
      onStandInDisk({ files: { "/stand-in/data/source-map.json": '{"agent-0":{"sourceId":"s-0","mode":"local"}}' } }, async ({ calls, files }) => {
        const { next } = ids();
        const map = new service.SandSourceMap("/stand-in/data/source-map.json", next);
        const both = await Promise.allSettled([map.getOrCreate("agent-a"), map.getOrCreate("agent-b")]);
        const afterBoth = JSON.parse(files["/stand-in/data/source-map.json"] ?? "null");
        const callsOfBoth = calls.length;
        const asked = { "agent-a": await map.getOrCreate("agent-a"), "agent-b": await map.getOrCreate("agent-b") };
        return withoutPid(tools, { both: both.map((one) => one.status === "fulfilled" ? one.value : { failed: one.reason?.code }), afterBoth: afterBoth && Object.keys(afterBoth), asked, calls: calls.slice(0, callsOfBoth), callsAfterwards: calls.slice(callsOfBoth).map((one) => one.call) });
      }),
  },
  {
    name: "on a stand-in disk: calls at once on a map that has read its file share it, and each step of each is taken in turn",
    run: ({ service }, tools) =>
      onStandInDisk({}, async ({ calls, files }) => {
        const { next } = ids();
        const map = new service.SandSourceMap("/stand-in/data/source-map.json", next);
        await map.getBoxStore();
        const before = calls.length;
        const all = await Promise.allSettled([map.getOrCreate("agent-a"), map.setMode("agent-b", "agent-store"), map.getOrCreateBoxStore(), map.getBoxStore(), map.getOrCreate("agent-a")]);
        return withoutPid(tools, {
          all: all.map((one) => one.status === "fulfilled" ? one.value : { failed: one.reason?.code }),
          firstAndLastAreTheSameObject: all[0].value === all[4].value,
          calls: calls.slice(before).map((one) => ({ ...one, turn: one.turn - calls[before].turn, given: one.call === "writeFile" ? [one.given[0], Object.keys(JSON.parse(one.given[1])), ...one.given.slice(2)] : one.given })),
          kept: Object.keys(JSON.parse(files["/stand-in/data/source-map.json"] ?? "{}")),
        });
      }),
  },
  {
    name: "the extension is declared under the id source-map, with no peers",
    run: ({ extension }) => {
      const declared = extension.sourceMapExtension;
      return { keys: Object.keys(declared), kind: declared.kind, id: declared.id, dependencies: declared.dependencies, frozen: [Object.isFrozen(declared), Object.isFrozen(declared.dependencies)], start: { kind: typeof declared.start, parameters: declared.start.length } };
    },
  },
  {
    name: "started, the extension hands the host a map on the data folder's file and asks nothing of the host",
    run: async ({ service, extension }, tools) => {
      const dir = await tools.tmp();
      const host = standInHost(extension.sourceMapExtension);
      const other = standInHost(extension.sourceMapExtension);
      const [api, second] = await withEnv({ SAND_DATA_ROOT: dir }, () => [host.start(), other.start()]);
      const entry = await api.getOrCreate("agent-a");
      const kept = JSON.parse(await readFile(path.join(dir, "source-map.json"), "utf8"));
      return {
        aMap: api instanceof service.SandSourceMap,
        aPromise: api instanceof Promise,
        eachStartItsOwnMap: api !== second && second instanceof service.SandSourceMap,
        entryMode: entry.mode,
        idIsRandom: UUID.test(entry.sourceId),
        keptInTheDataFolder: kept["agent-a"]?.sourceId === entry.sourceId,
        callsOnTheHost: host.calls,
        leftToUndo: host.left.length,
        stopping: await host.stop(),
      };
    },
  },
];
