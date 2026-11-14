/** Two small files the computer's browser reads: a stamp that says whose computer this is, and a marker that switches its token off. And the extension that keeps both up to date. */
import fs from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const part = "host/extensions/browser-ua";
export const modules = {
  stamp: "source/host/extensions/browser-ua/ua-owner-stamp-service.ts",
  killSwitch: "source/host/extensions/browser-ua/ua-token-kill-switch-service.ts",
  extension: "source/host/extensions/browser-ua/extension.ts",
};

/** A token as the server signs them: three parts, the middle one the claims. Nothing checks the signature here. */
const tokenOf = (claims) => `head.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const TOKEN_ONE = tokenOf({ sub: "user-one", exp: 2_000_000_000 });
const TOKEN_ONE_RENEWED = tokenOf({ sub: "user-one", exp: 2_100_000_000 });
const TOKEN_TWO = tokenOf({ sub: "user-two" });

/** The file's text, or "no file". */
async function textOf(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "no file";
    throw error;
  }
}

/** What a call did: what it gave, or the class of what it threw. A runtime's own sentence is not kept. */
async function outcomeOf(run) {
  try {
    return { gave: await run() };
  } catch (error) {
    return { threw: error?.constructor?.name, message: error instanceof TypeError ? "(the runtime's own words)" : error?.message };
  }
}

/**
 * A stand-in disk for one scenario: the three calls the part makes on the disk are answered from memory and noted, in
 * order, in `calls` (the same list the stand-in host keeps its own in), each with the number of turns of the small
 * queue that had passed. `refuse` says which calls fail: a name, or a function of the call's name and its number.
 */
async function onStandInDisk({ calls = [], files = {}, refuse = () => false } = {}, run) {
  const real = { writeFile: fs.promises.writeFile, rename: fs.promises.rename, rm: fs.promises.rm };
  const refused = typeof refuse === "function" ? refuse : (name) => name === refuse;
  let turns = 0;
  let counting = true;
  let made = 0;
  // Whatever is noted in the list while the stand-in disk is in place, by the disk, the host or a peer, is noted with its turn.
  Object.defineProperty(calls, "push", { value: (entry) => Array.prototype.push.call(calls, { turn: turns, ...entry }) });
  const answer = (name, given, work) => {
    made += 1;
    calls.push({ call: `disk.${name}`, given });
    if (refused(name, made)) return Promise.reject(new Error(`the stand-in disk refuses ${name}`));
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  fs.promises.writeFile = (file, text, ...more) => answer("writeFile", [file, text, ...more], () => {
    files[file] = text;
  });
  fs.promises.rename = (from, to) => answer("rename", [from, to], () => {
    if (!(from in files)) throw Object.assign(new Error(`no such file, rename '${from}'`), { code: "ENOENT" });
    files[to] = files[from];
    delete files[from];
  });
  fs.promises.rm = (file, ...more) => answer("rm", [file, ...more], () => {
    delete files[file];
  });
  void (async () => {
    while (counting && turns < 10_000) {
      await null;
      turns += 1;
    }
  })();
  /** Waits until the small queue has been idle for a while: everything the part started without waiting for it is done. */
  const settled = async () => {
    for (let i = 0; i < 30; i += 1) await null;
  };
  try {
    return await run({ calls, files, settled, turn: () => turns });
  } finally {
    counting = false;
    Object.assign(fs.promises, real);
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
    /** The host stopping: what was left is undone, the last thing left first, one at a time. */
    async stop() {
      for (const leaving of left.splice(0).reverse()) await leaving.run();
    },
  };
}

/** The two peers the extension names, as stand-ins: what they answer is set by the scenario, and every call on them is kept. */
function peers({ token = null, killSwitch = false } = {}) {
  const state = { token, killSwitch, renewalListeners: [], experimentListeners: [] };
  const peersFor = (calls) => {
    const stopRenewal = () => {
      calls.push({ call: "auth: the renewal listener is taken away" });
    };
    const stopExperiments = () => {
      calls.push({ call: "experiments: the listener is taken away" });
    };
    state.stopRenewal = stopRenewal;
    state.stopExperiments = stopExperiments;
    return {
      auth: {
        peekAccessToken(...given) {
          calls.push({ call: "auth.peekAccessToken", given });
          return typeof state.token === "function" ? state.token() : state.token;
        },
        subscribeToRenewal(...given) {
          calls.push({ call: "auth.subscribeToRenewal", given: given.map((one) => typeof one) });
          state.renewalListeners.push(given[0]);
          return stopRenewal;
        },
      },
      experiments: {
        isUaTokenKillSwitchEnabled(...given) {
          calls.push({ call: "experiments.isUaTokenKillSwitchEnabled", given });
          return typeof state.killSwitch === "function" ? state.killSwitch() : state.killSwitch;
        },
        subscribe(...given) {
          calls.push({ call: "experiments.subscribe", given: given.map((one) => typeof one) });
          state.experimentListeners.push(given[0]);
          return stopExperiments;
        },
      },
    };
  };
  return { state, peersFor };
}

/** The calls made since `from`, without the turn they were made on. */
const since = (calls, from) => calls.slice(from).map(({ turn, ...rest }) => rest);

export const scenarios = [
  // ── ua-owner-stamp-service.ts ─────────────────────────────────────────────
  {
    name: "the stamp is kept at a fixed place and is sixteen characters long",
    run: ({ stamp }) => ({ path: stamp.UA_OWNER_STAMP_PATH, length: stamp.UA_OWNER_STAMP_LENGTH }),
  },
  {
    name: "a token's stamp is made from who it is for, and from nothing else in it",
    run: ({ stamp }) => {
      const of = stamp.uaOwnerStampForAccessToken;
      return {
        "user-one": of(TOKEN_ONE),
        "user-one, renewed": of(TOKEN_ONE_RENEWED),
        "user-one, other claims": of(tokenOf({ email: "one@example.com", sub: "user-one", role: ["a"] })),
        "user-two": of(TOKEN_TWO),
        "a name with accents": of(tokenOf({ sub: "Zoë ✓ 日本" })),
        "a very long name": of(tokenOf({ sub: "x".repeat(5_000) })),
        "one blank": of(tokenOf({ sub: " " })),
        "two parts only": of(`head.${Buffer.from('{"sub":"user-one"}').toString("base64url")}`),
        "five parts": of(`head.${Buffer.from('{"sub":"user-one"}').toString("base64url")}.c.d.e`),
        "claims in plain base64": of(`head.${Buffer.from('{"sub":"user-one?>"}').toString("base64")}.signature`),
        lengths: [of(TOKEN_ONE).length, of(TOKEN_TWO).length],
      };
    },
  },
  {
    name: "a token that does not say who it is for has no stamp",
    run: async ({ stamp }) => {
      const of = stamp.uaOwnerStampForAccessToken;
      const b64 = (text) => Buffer.from(text).toString("base64url");
      const out = {};
      for (const [name, token] of Object.entries({
        "no sub": tokenOf({ email: "one@example.com" }),
        "an empty sub": tokenOf({ sub: "" }),
        "a sub that is a number": tokenOf({ sub: 7 }),
        "a sub that is null": tokenOf({ sub: null }),
        "an email that is not a text": tokenOf({ sub: "user-one", email: 5 }),
        "an expiry that is not a number": tokenOf({ sub: "user-one", exp: "soon" }),
        "claims that are a list": `head.${b64('["user-one"]')}.signature`,
        "claims that are a text": `head.${b64('"user-one"')}.signature`,
        "claims that are null": `head.${b64("null")}.signature`,
        "claims that are not JSON": `head.${b64("{sub: user-one}")}.signature`,
        "claims that are not base64": "head.!!!.signature",
        "no claims between the dots": "head..signature",
        "one part": "justonepart",
        "an empty text": "",
        "a dot": ".",
      })) out[name] = of(token);
      for (const [name, token] of Object.entries({ undefined, null: null, "a number": 5, "an object": { sub: "user-one" } })) out[name] = await outcomeOf(() => of(token));
      return out;
    },
  },
  {
    name: "the stamp is written with a line end, under a temporary name first, and only when it changes",
    run: async ({ stamp }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "ua-user");
      const logged = [];
      const write = stamp.createUaOwnerStampWriter({ path: file, log: (...given) => logged.push(given) });
      const steps = [];
      const step = async (name, token) => {
        const asked = write(token);
        steps.push({ name, aPromise: asked instanceof Promise, gave: await asked, file: await textOf(file), inTheFolder: await readdir(dir) });
      };
      await step("no token", null);
      await step("an undefined token", undefined);
      await step("a token that names no one", tokenOf({ email: "one@example.com" }));
      await step("user-one", TOKEN_ONE);
      await rm(file);
      await step("user-one again, the file taken away in between", TOKEN_ONE);
      await step("user-one renewed, the file still away", TOKEN_ONE_RENEWED);
      await step("user-two", TOKEN_TWO);
      await rm(file);
      await step("user-one once more", TOKEN_ONE);
      return { steps, logged };
    },
  },
  {
    name: "a stamp that cannot be written is told to the log and tried again the next time",
    run: async ({ stamp }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "missing", "ua-user");
      const logged = [];
      const options = {
        path: file,
        log(...given) {
          logged.push({ given: given.map((one) => tools.scrub(one, { [dir]: "<tmp>" })), calledOnTheOptions: this === options });
        },
      };
      const write = stamp.createUaOwnerStampWriter(options);
      const failed = await write(TOKEN_ONE);
      const afterFailure = { gave: failed, file: await textOf(file), logged: logged.length };
      await mkdir(path.dirname(file));
      options.path = path.join(dir, "elsewhere");
      const again = await write(TOKEN_ONE);
      return { afterFailure, again, file: await textOf(file), inTheFolder: (await readdir(path.dirname(file))).sort(), aPathSetLaterIsNotUsed: await textOf(path.join(dir, "elsewhere")), logged };
    },
  },
  {
    name: "on a stand-in disk: left to itself the stamp goes to its fixed place, in two steps",
    run: ({ stamp }) =>
      onStandInDisk({}, async ({ calls, files }) => {
        const logged = [];
        const write = stamp.createUaOwnerStampWriter({ log: (message) => logged.push(message) });
        await write(TOKEN_ONE);
        await write(TOKEN_ONE);
        await write(TOKEN_TWO);
        return { calls, files, logged };
      }),
  },
  {
    name: "on a stand-in disk: a failure at either step is told to the log, and the same stamp is then written again from the first step",
    run: async ({ stamp }) => {
      const out = {};
      for (const refuse of ["writeFile", "rename"]) {
        let failing = true;
        out[refuse] = await onStandInDisk({ refuse: (name) => failing && name === refuse }, async ({ calls, files }) => {
          const logged = [];
          const write = stamp.createUaOwnerStampWriter({ path: "/stand-in/ua-user", log: (message) => logged.push(message) });
          const gave = await write(TOKEN_ONE);
          const callsOfTheFailure = since(calls, 0).map((one) => one.call);
          failing = false;
          await write(TOKEN_ONE);
          return { gave, callsOfTheFailure, logged, callsInAll: since(calls, 0).map((one) => one.call), files };
        });
      }
      return out;
    },
  },
  {
    name: "on a stand-in disk: two writes at once of one stamp both go to the disk, and the second finds its temporary file gone",
    run: ({ stamp }) =>
      onStandInDisk({}, async ({ calls, files }) => {
        const logged = [];
        const write = stamp.createUaOwnerStampWriter({ path: "/stand-in/ua-user", log: (message) => logged.push(message) });
        const both = await Promise.allSettled([write(TOKEN_ONE), write(TOKEN_ONE)]);
        const callsOfBoth = calls.length;
        await write(TOKEN_ONE);
        return { both: both.map((one) => one.status), calls: calls.slice(0, callsOfBoth), logged, callsAfterwards: calls.length - callsOfBoth, files };
      }),
  },
  // ── ua-token-kill-switch-service.ts ───────────────────────────────────────
  {
    name: "the marker that switches the token off is kept at a fixed place",
    run: ({ killSwitch }) => killSwitch.UA_TOKEN_DISABLED_MARKER_PATH,
  },
  {
    name: "the marker is written when the switch is on and taken away when it is off, and left alone while the switch stays as it was",
    run: async ({ killSwitch }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "ua-token-disabled");
      const logged = [];
      let on = false;
      let asked = 0;
      const reconcile = killSwitch.createUaTokenKillSwitchReconciler({
        path: file,
        isKillSwitchEnabled: (...given) => {
          asked += given.length === 0 ? 1 : 100;
          return on;
        },
        log: (...given) => logged.push(given),
      });
      const steps = [];
      const step = async (name, change = () => {}) => {
        await change();
        const promise = reconcile();
        steps.push({ name, aPromise: promise instanceof Promise, gave: await promise, file: await textOf(file), asked });
      };
      await step("off, and no marker to take away");
      await step("on", () => {
        on = true;
      });
      await step("still on, the marker taken away by hand", () => rm(file));
      await step("off again, a marker put back by hand", async () => {
        on = false;
        await writeFile(file, "by hand");
      });
      await step("still off, a marker put back by hand", () => writeFile(file, "by hand"));
      await step("on again", () => {
        on = true;
      });
      return { steps, logged, inTheFolder: await readdir(dir) };
    },
  },
  {
    name: "a marker that cannot be written is told to the log and tried again the next time",
    run: async ({ killSwitch }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "missing", "ua-token-disabled");
      const logged = [];
      const options = {
        path: file,
        isKillSwitchEnabled: () => true,
        log(...given) {
          logged.push({ given: given.map((one) => tools.scrub(one, { [dir]: "<tmp>" })), calledOnTheOptions: this === options });
        },
      };
      const reconcile = killSwitch.createUaTokenKillSwitchReconciler(options);
      const failed = await reconcile();
      const afterFailure = { gave: failed, file: await textOf(file), logged: logged.length };
      await mkdir(path.dirname(file));
      options.path = path.join(dir, "elsewhere");
      await reconcile();
      return { afterFailure, file: await textOf(file), aPathSetLaterIsNotUsed: await textOf(path.join(dir, "elsewhere")), logged };
    },
  },
  {
    name: "on a stand-in disk: left to itself the marker goes to its fixed place; calls made at once are taken one after another, each asking the switch when its turn comes",
    run: ({ killSwitch }) =>
      onStandInDisk({}, async ({ calls, files }) => {
        const logged = [];
        const answers = [true, true, false, true, false, false];
        let asked = 0;
        const reconcile = killSwitch.createUaTokenKillSwitchReconciler({
          isKillSwitchEnabled: () => {
            calls.push({ call: `the switch is asked and says ${answers[asked]}` });
            asked += 1;
            return answers[asked - 1];
          },
          log: (message) => logged.push(message),
        });
        const promises = answers.map(() => reconcile());
        const askedBeforeAnyCallHadItsTurn = asked;
        const allDifferent = new Set(promises).size === promises.length;
        const gave = await Promise.all(promises);
        return { askedBeforeAnyCallHadItsTurn, allDifferent, gave, calls, files, logged };
      }),
  },
  {
    name: "on a stand-in disk: a failure to write or to take away is told to the log, and the next call does the same work again",
    run: async ({ killSwitch }) => {
      const out = {};
      for (const [refuse, on] of [["writeFile", true], ["rm", false]]) {
        let failing = true;
        out[refuse] = await onStandInDisk({ refuse: (name) => failing && name === refuse }, async ({ calls }) => {
          const logged = [];
          const reconcile = killSwitch.createUaTokenKillSwitchReconciler({ path: "/stand-in/marker", isKillSwitchEnabled: () => on, log: (message) => logged.push(message) });
          const gave = await reconcile();
          await reconcile();
          failing = false;
          await reconcile();
          await reconcile();
          return { gave, logged, calls: since(calls, 0) };
        });
      }
      return out;
    },
  },
  {
    name: "on a stand-in disk: what the switch may say besides yes and no",
    run: async ({ killSwitch }) => {
      const out = {};
      for (const [name, said] of Object.entries({ "null": null, undefined, "one": 1, "zero": 0, "a text": "yes", "an empty text": "", "not a number": Number.NaN })) {
        out[name] = await onStandInDisk({}, async ({ calls }) => {
          const reconcile = killSwitch.createUaTokenKillSwitchReconciler({ path: "/stand-in/marker", isKillSwitchEnabled: () => said, log: () => {} });
          await reconcile();
          const first = since(calls, 0).map((one) => one.call);
          await reconcile();
          return { first, second: since(calls, first.length).map((one) => one.call) };
        });
      }
      return out;
    },
  },
  {
    name: "on a stand-in disk: a switch that throws when asked breaks the reconciler for good: every call from then on fails the same way and the switch is not asked again",
    run: ({ killSwitch }) =>
      onStandInDisk({}, async ({ calls }) => {
        const failure = new Error("the switch could not be read");
        let asked = 0;
        let throwing = false;
        const logged = [];
        const reconcile = killSwitch.createUaTokenKillSwitchReconciler({
          path: "/stand-in/marker",
          isKillSwitchEnabled: () => {
            asked += 1;
            if (throwing) throw failure;
            return true;
          },
          log: (message) => logged.push(message),
        });
        await reconcile();
        throwing = true;
        const failed = await reconcile().then(() => "nothing", (error) => (error === failure ? "the switch's own error" : "another error"));
        throwing = false;
        const later = [];
        for (let i = 0; i < 3; i += 1) later.push(await reconcile().then(() => "nothing", (error) => (error === failure ? "the switch's own error" : "another error")));
        return { failed, later, asked, logged, calls: since(calls, 0).map((one) => one.call) };
      }),
  },
  // ── extension.ts ──────────────────────────────────────────────────────────
  {
    name: "the extension is declared under the id browser-ua and needs the sign-in and the experiments",
    run: ({ extension }) => {
      const declared = extension.browserUaExtension;
      return { keys: Object.keys(declared), kind: declared.kind, id: declared.id, dependencies: declared.dependencies, frozen: [Object.isFrozen(declared), Object.isFrozen(declared.dependencies)], start: { kind: typeof declared.start, parameters: declared.start.length } };
    },
  },
  {
    name: "started with someone signed in and the switch off: everything it asks of its peers, the host and the disk, in order and turn by turn",
    run: ({ extension }) => {
      const { state, peersFor } = peers({ token: TOKEN_ONE, killSwitch: false });
      const calls = [];
      return onStandInDisk({ calls }, async ({ files, settled }) => {
        const host = standInHost(extension.browserUaExtension, peersFor, calls);
        const api = host.start();
        const callsInsideStart = calls.length;
        await settled();
        return {
          handedBack: api,
          aPromise: api instanceof Promise,
          callsInsideStart,
          calls,
          files,
          leftToUndo: host.left.map((leaving) => (leaving.run === state.stopRenewal ? "auth's own way to stop listening" : leaving.run === state.stopExperiments ? "the experiments' own way to stop listening" : "something else")),
        };
      });
    },
  },
  {
    name: "what a start does for each kind of sign-in and each answer of the switch",
    run: async ({ extension }) => {
      const out = {};
      for (const [name, given] of Object.entries({
        "no one signed in, switch off": { token: null, killSwitch: false },
        "no one signed in, switch on": { token: null, killSwitch: true },
        "signed in, switch on": { token: TOKEN_ONE, killSwitch: true },
        "a token that is undefined": { token: () => undefined, killSwitch: false },
        "a token that names no one": { token: tokenOf({ email: "one@example.com" }), killSwitch: false },
        "an empty token": { token: "", killSwitch: false },
      })) {
        const { peersFor } = peers(given);
        const calls = [];
        out[name] = await onStandInDisk({ calls }, async ({ files, settled }) => {
          standInHost(extension.browserUaExtension, peersFor, calls).start();
          await settled();
          return { calls: since(calls, 0).map((one) => (one.call.startsWith("disk.") ? [one.call, one.given[0]] : one.call)), files };
        });
      }
      return out;
    },
  },
  {
    name: "after a start: a renewed sign-in stamps the computer again when it is for someone else, and nothing else does",
    run: ({ extension }) => {
      const { state, peersFor } = peers({ token: TOKEN_ONE, killSwitch: false });
      const calls = [];
      return onStandInDisk({ calls }, async ({ files, settled }) => {
        const host = standInHost(extension.browserUaExtension, peersFor, calls);
        host.start();
        await settled();
        const [renewal] = state.renewalListeners;
        const steps = [];
        const step = async (name, event, token = state.token) => {
          state.token = token;
          const from = calls.length;
          const told = await outcomeOf(() => renewal(event));
          await settled();
          steps.push({ name, told, calls: since(calls, from).map((one) => (one.call.startsWith("disk.") ? [one.call, ...one.given] : one.call)), stamp: files["/tmp/sand-ua-user"] });
        };
        await step("renewed, the same person", { outcome: "renewed" }, TOKEN_ONE_RENEWED);
        await step("renewed, another person", { outcome: "renewed", isFirstCredential: false }, TOKEN_TWO);
        await step("renewed, no one any more", { outcome: "renewed" }, null);
        await step("renewed, the first person back", { outcome: "renewed" }, TOKEN_ONE);
        await step("a renewal that failed", { outcome: "failed" }, TOKEN_TWO);
        await step("an outcome in capitals", { outcome: "Renewed" });
        await step("an event with no outcome", {});
        await step("no event at all", undefined);
        return { listeners: state.renewalListeners.length, steps };
      });
    },
  },
  {
    name: "after a start: each word from the experiments has the marker follow the switch",
    run: ({ extension }) => {
      const { state, peersFor } = peers({ token: null, killSwitch: false });
      const calls = [];
      return onStandInDisk({ calls }, async ({ files, settled }) => {
        const host = standInHost(extension.browserUaExtension, peersFor, calls);
        host.start();
        await settled();
        const [changed] = state.experimentListeners;
        const steps = [];
        const step = async (name, killSwitch, times = 1) => {
          state.killSwitch = killSwitch;
          const from = calls.length;
          const gave = [];
          for (let i = 0; i < times; i += 1) gave.push(changed({ some: "snapshot" }));
          await settled();
          steps.push({ name, gave, calls: since(calls, from).map((one) => (one.call.startsWith("disk.") ? [one.call, ...one.given] : one.call)), marker: files["/tmp/sand-ua-token-disabled"] });
        };
        await step("the switch goes on", true);
        await step("told again, the switch still on", true);
        await step("the switch goes off, told three times at once", false, 3);
        await step("the switch goes on again", true);
        return { listeners: state.experimentListeners.length, steps };
      });
    },
  },
  {
    name: "a disk that refuses is told to the host's log, in the host's own name, by whatever log the host has at that moment",
    run: ({ extension }) => {
      const { state, peersFor } = peers({ token: TOKEN_ONE, killSwitch: true });
      const calls = [];
      return onStandInDisk({ calls, refuse: () => true }, async ({ settled }) => {
        const host = standInHost(extension.browserUaExtension, peersFor, calls);
        host.start();
        await settled();
        const atStart = since(calls, 0).filter((one) => one.call === "host.log");
        const later = [];
        host.host.log = function (...given) {
          later.push({ given, onTheHost: this === host.host });
        };
        state.token = TOKEN_TWO;
        state.killSwitch = false;
        state.renewalListeners[0]({ outcome: "renewed" });
        state.experimentListeners[0]();
        await settled();
        return { atStart, toTheLogPutInPlaceLater: later, diskCalls: since(calls, 0).filter((one) => one.call.startsWith("disk.")).map((one) => [one.call, one.given[0]]) };
      });
    },
  },
  {
    name: "each start keeps its own account of what it wrote, and the host stopping takes both listeners away",
    run: ({ extension }) => {
      const { state, peersFor } = peers({ token: TOKEN_ONE, killSwitch: true });
      const calls = [];
      return onStandInDisk({ calls }, async ({ settled }) => {
        const first = standInHost(extension.browserUaExtension, peersFor, calls);
        const one = first.start();
        await settled();
        const afterFirst = calls.length;
        const second = standInHost(extension.browserUaExtension, peersFor, calls);
        const two = second.start();
        await settled();
        const secondStart = since(calls, afterFirst).map((one) => (one.call.startsWith("disk.") ? [one.call, one.given[0]] : one.call));
        const beforeStop = calls.length;
        await first.stop();
        return { eachStartHandsBackItsOwnEmptyObject: one !== two && Object.keys(one).length === 0 && Object.keys(two).length === 0, secondStart, stopping: since(calls, beforeStop).map((one) => one.call), listenersAdded: [state.renewalListeners.length, state.experimentListeners.length] };
      });
    },
  },
  {
    name: "a start without one of its peers fails where it first needs it",
    run: async ({ extension }) => {
      const out = {};
      for (const missing of ["auth", "experiments"]) {
        const { peersFor } = peers({ token: TOKEN_ONE, killSwitch: false });
        const calls = [];
        out[missing] = await onStandInDisk({ calls }, async ({ settled }) => {
          const host = standInHost(extension.browserUaExtension, (list) => ({ ...peersFor(list), [missing]: undefined }), calls);
          const started = await outcomeOf(() => host.start());
          await settled();
          return { started, calls: since(calls, 0).map((one) => (one.call.startsWith("disk.") ? [one.call, one.given[0]] : one.call)), leftToUndo: host.left.length };
        });
      }
      return out;
    },
  },
];
