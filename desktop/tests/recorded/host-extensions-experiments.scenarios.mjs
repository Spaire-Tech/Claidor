/** The extension that starts the experiments service for the host (which features are on, which models are set) and hands the other extensions its answers. */
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const part = "host/extensions/experiments";
export const modules = {
  extension: "source/host/extensions/experiments/extension.ts",
  // Not of this part: the service the extension starts. It is listed so that a scenario can watch the calls the
  // extension makes on it, and stand in for one of its answers, through the class's own public methods.
  service: "source/shared/node/experiments/simeon-experiments.ts",
};
export const covers = ["source/host/extensions/experiments/"];

const NOT_OF_THIS_PART = "belongs to shared/node/experiments, not to this part: the file is listed only for its class";
export const skipped = Object.fromEntries(
  ["BASE_POLL_INTERVAL_MS", "MIN_POLL_INTERVAL_MS", "POLL_JITTER_FRACTION", "BOOTSTRAP_TIMEOUT_MS", "GATE_READY_TIMEOUT_MS", "computePollDelayMs", "envGateOverride", "jitteredSandExperimentPollIntervalMs"].map((name) => [`service.${name}`, NOT_OF_THIS_PART]),
);

/** Every setting the extension or its service looks at. The machine's own are put aside while a scenario runs. */
const NO_SETTINGS = Object.fromEntries(
  ["SAND_DATA_ROOT", "SAND_USER_DATA_DIR", "SAND_PACKAGED", "SAND_LAB", "SAND_HOST_DEV_ERROR_DETAIL", "SAND_MULTITASK", "SAND_SPOTLIGHT", "SAND_FEATURE_GATE_OVERRIDES", "SAND_CONNECT_SERVED", "SAND_MODEL_EXPERIMENT_OVERRIDE", "SAND_BACKEND_URL", "SIMEON_API_BASE_URL"].map((name) => [name, undefined]),
);

const setEnv = (name, value) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

/** The process's own environment changed for one scenario, then put back as it was. */
async function withEnv(changes, run) {
  const before = {};
  for (const [name, value] of Object.entries({ ...NO_SETTINGS, ...changes })) {
    before[name] = Object.hasOwn(process.env, name) ? process.env[name] : undefined;
    setEnv(name, value);
  }
  // The service's timers do not keep the process running: this one does, for as long as the scenario waits on them.
  const awake = setInterval(() => {}, 1_000);
  try {
    return await run();
  } finally {
    clearInterval(awake);
    for (const [name, value] of Object.entries(before)) setEnv(name, value);
  }
}

/** A fresh data folder of its own for the scenario, named in the settings, with any other setting given. */
async function inDataFolder(tools, changes, run) {
  const dir = await tools.tmp();
  return withEnv({ SAND_DATA_ROOT: dir, ...changes }, () => run(dir));
}

/** What a call did: what it gave, or the class of what it threw. A runtime's own sentence is not kept. */
async function outcomeOf(run) {
  try {
    return { gave: await run() };
  } catch (error) {
    return { threw: error?.constructor?.name, message: error instanceof TypeError ? "(the runtime's own words)" : error?.message };
  }
}

/** What was given to a call, with each function told as "function". */
const told = (given) => given.map((one) => (typeof one === "function" ? "function" : one));

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

/** The two peers the extension names, as stand-ins: the sign-in and the settings. Every call on them is kept. */
function peers(options = {}) {
  const state = { token: "token" in options ? options.token : null, renewal: [], overrides: [] };
  const peersFor = (calls) => {
    const stopRenewal = () => {
      calls.push({ call: "auth: the renewal listener is taken away" });
    };
    const stopOverrides = () => {
      calls.push({ call: "settings: the overrides listener is taken away" });
    };
    const auth = {
      getAccessToken(...given) {
        calls.push({ call: "auth.getAccessToken", given, calledOnTheSignIn: this === auth });
        return Promise.resolve("a-token");
      },
      getMachineId(...given) {
        calls.push({ call: "auth.getMachineId", given, calledOnTheSignIn: this === auth });
        return Promise.resolve("machine-1");
      },
      peekAccessToken(...given) {
        calls.push({ call: "auth.peekAccessToken", given });
        return state.token;
      },
      subscribeToRenewal(...given) {
        calls.push({ call: "auth.subscribeToRenewal", given: told(given) });
        state.renewal.push(given[0]);
        return stopRenewal;
      },
    };
    const settings = {
      subscribeToFeatureFlagOverrides(...given) {
        calls.push({ call: "settings.subscribeToFeatureFlagOverrides", given: told(given) });
        state.overrides.push(given[0]);
        return stopOverrides;
      },
    };
    Object.assign(state, { stopRenewal, stopOverrides });
    return { auth, settings };
  };
  return { state, peersFor };
}

/**
 * The service's own public methods watched for one scenario: each call the extension makes on one of `names` is
 * noted in `calls`, and then answered by `instead[name]` when there is one, by the real method otherwise. The methods
 * are put back afterwards.
 */
async function watching(service, calls, names, instead, run) {
  const proto = service.SandExperimentService.prototype;
  const real = {};
  for (const name of names) {
    real[name] = proto[name];
    proto[name] = function (...given) {
      calls.push({ call: `service.${name}`, given: told(given) });
      return name in instead ? instead[name].apply(this, given) : real[name].apply(this, given);
    };
  }
  try {
    return await run();
  } finally {
    for (const name of names) proto[name] = real[name];
  }
}

/** The four things the extension does to the service itself, apart from asking it questions. */
const LIFE = ["start", "dispose", "handleAuthChange", "replaceFeatureFlagOverrides"];

/** Every question the extension's ways in can put to the service. */
const QUESTIONS = [
  "checkFeatureGate",
  "getFeatureGateProperty",
  "checkGate",
  "getDynamicConfig",
  "subscribe",
  "pinGateOnAuthenticatedBootstrap",
  "hasHydratedStatsigUserId",
  "waitForHydratedStatsigUserId",
  "hasAuthenticatedStatsigBootstrap",
  "getSandModelExperimentState",
  "logSandModelExperimentExposure",
  "getConfiguredDefaultModel",
  "getConfiguredAutomationsModel",
  "getComputerUseModelOverride",
  "getBrowserUseModelOverride",
  "getFeatureFlagOverridesRecord",
  "getSnapshot",
];

/** The ten ways in that answer yes or no for one feature. */
const FEATURES = [
  "isAgentNetworkEnabled",
  "isMcpMultiAccountEnabled",
  "isSparsePluginClonesEnabled",
  "isMultitaskEnabled",
  "isSendMessageDeliveryOwedEnabled",
  "isDynamicToolsEnabled",
  "isBrowserUseSubagentEnabled",
  "isSpotlightEnabled",
  "isUnicodeTypingEnabled",
  "isUaTokenKillSwitchEnabled",
];
const featureAnswers = (api) => FEATURES.map((name) => `${name}: ${api[name]()}`);

/** Waits, a few milliseconds at a time, until the file is there. */
async function untilThere(file) {
  for (let i = 0; i < 200 && !existsSync(file); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return existsSync(file);
}

/**
 * Waits until the overrides file in the folder holds exactly these overrides: the service writes it without anyone
 * waiting, and a scenario must not end, or go on to the next change, while a write is still on its way.
 */
async function persisted(dir, expected) {
  const file = path.join(dir, "sand-feature-flag-overrides.json");
  const wanted = JSON.stringify(Object.entries(expected));
  for (let i = 0; i < 400; i += 1) {
    try {
      const { overrides } = JSON.parse(await readFile(file, "utf8"));
      if (JSON.stringify(Object.entries(overrides).map(([name, entry]) => [name, entry.value])) === wanted) return true;
    } catch {
      // Not there yet, or half written.
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}

/** The overrides file as it was written, each expiry told as "about a day from now" when it is. */
async function overridesFile(dir) {
  const file = path.join(dir, "sand-feature-flag-overrides.json");
  if (!(await untilThere(file))) return "no file";
  const now = Date.now();
  const day = 24 * 60 * 60 * 1_000;
  return JSON.parse(await readFile(file, "utf8"), (key, value) => (key === "expiresAtMs" ? (value > now + day - 60_000 && value <= now + day ? "about a day from now" : value) : value));
}

export const scenarios = [
  {
    name: "the extension is declared under the id experiments and needs the sign-in and the settings",
    run: ({ extension }) => {
      const declared = extension.experimentsExtension;
      return { keys: Object.keys(declared), kind: declared.kind, id: declared.id, dependencies: declared.dependencies, frozen: [Object.isFrozen(declared), Object.isFrozen(declared.dependencies)], start: { kind: typeof declared.start, parameters: declared.start.length } };
    },
  },
  {
    name: "started with no one signed in: what it does to the service, its peers and the host, in order, and the twenty-five ways in it hands back",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async () => {
        const { state, peersFor } = peers({ token: null });
        const calls = [];
        return watching(service, calls, LIFE, {}, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          const api = host.start();
          const atStart = [...calls];
          const leftToUndo = host.left.map((leaving) => (leaving.run === state.stopRenewal ? "auth's own way to stop listening" : leaving.run === state.stopOverrides ? "the settings' own way to stop listening" : "a function of the extension's own"));
          const stopping = await host.stop();
          return { aPromise: api instanceof Promise, atStart, ways: Object.entries(api).map(([key, value]) => [key, typeof value, value.length]), leftToUndo, stopping, callsWhileStopping: calls.slice(atStart.length) };
        });
      }),
  },
  {
    name: "started with someone signed in, the service is told so once, between asking for the token and listening to the settings",
    run: async ({ extension, service }, tools) => {
      const out = {};
      for (const [name, token] of Object.entries({ "a token": "a-token", "an empty token": "", "no token (null)": null, "no token (undefined)": undefined, "a token that is zero": 0 })) {
        out[name] = await inDataFolder(tools, {}, async () => {
          const { peersFor } = peers({ token });
          const calls = [];
          return watching(service, calls, LIFE, {}, async () => {
            const host = standInHost(extension.experimentsExtension, peersFor, calls);
            host.start();
            const atStart = calls.map((one) => one.call);
            await host.stop();
            return atStart;
          });
        });
      }
      return out;
    },
  },
  {
    name: "a renewed sign-in is passed on to the service when it is the first one, or when the service has no signed-in bootstrap yet; anything else is not",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async () => {
        const { state, peersFor } = peers({ token: null });
        const calls = [];
        let signedInBootstrap = false;
        return watching(service, calls, ["handleAuthChange", "hasAuthenticatedStatsigBootstrap"], { hasAuthenticatedStatsigBootstrap: () => signedInBootstrap, handleAuthChange: () => "not handed on" }, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          host.start();
          const [renewal] = state.renewal;
          const table = [];
          const events = [
            { outcome: "renewed", isFirstCredential: true },
            { outcome: "renewed", isFirstCredential: false },
            { outcome: "renewed" },
            { outcome: "renewed", isFirstCredential: 1 },
            { outcome: "renewed", isFirstCredential: "" },
            { outcome: "renewed", isFirstCredential: null },
            { outcome: "failed", isFirstCredential: true },
            { outcome: "failed", isFirstCredential: false },
            { outcome: "Renewed", isFirstCredential: true },
            { outcome: "renewed ", isFirstCredential: true },
            { isFirstCredential: true },
            {},
          ];
          for (const bootstrap of [false, true]) {
            signedInBootstrap = bootstrap;
            for (const event of events) {
              const from = calls.length;
              const gave = renewal(event);
              table.push({ event, serviceHasASignedInBootstrap: bootstrap, gave, asked: calls.slice(from).map((one) => one.call) });
            }
          }
          const from = calls.length;
          const none = await outcomeOf(() => renewal());
          const afterNone = calls.slice(from).map((one) => one.call);
          await host.stop();
          return { listeners: state.renewal.length, table, none, afterNone };
        });
      }),
  },
  {
    name: "the settings' word replaces the service's overrides with the very object given, and they are kept in the data folder",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async (dir) => {
        const { state, peersFor } = peers({ token: null });
        const calls = [];
        return watching(service, calls, ["replaceFeatureFlagOverrides"], {}, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          const api = host.start();
          const [word] = state.overrides;
          const before = { multitask: api.checkFeatureGate("sand_multitask"), mcp: api.checkFeatureGate("mcp_multi_account") };
          const given = { sand_multitask: false, mcp_multi_account: true, not_a_flag: true, sand_spotlight: "yes" };
          const from = calls.length;
          const gave = word(given, "more");
          const asked = calls.slice(from).map((one) => ({ call: one.call, given: one.given }));
          const after = { multitask: api.checkFeatureGate("sand_multitask"), mcp: api.checkFeatureGate("mcp_multi_account"), spotlight: api.checkFeatureGate("sand_spotlight") };
          const file = await overridesFile(dir);
          word({});
          const afterNone = { multitask: api.checkFeatureGate("sand_multitask"), mcp: api.checkFeatureGate("mcp_multi_account") };
          const writtenAgain = await persisted(dir, {});
          await host.stop();
          return { listeners: state.overrides.length, before, gave, asked, after, file, afterNone, writtenAgain, inTheFolder: (await readdir(dir)).filter((name) => !name.endsWith(".tmp")) };
        });
      }),
  },
  {
    name: "the data folder is asked for each time it is needed: overrides are read from the one named at the start and written to the one named when they change",
    run: async ({ extension }, tools) => {
      const first = await tools.tmp();
      const second = await tools.tmp();
      await writeFile(path.join(first, "sand-feature-flag-overrides.json"), JSON.stringify({ overrides: { mcp_multi_account: { value: true, expiresAtMs: 9e15 } } }));
      return withEnv({ SAND_DATA_ROOT: first }, async () => {
        const { state, peersFor } = peers({ token: null });
        const host = standInHost(extension.experimentsExtension, peersFor);
        const api = host.start();
        const readAtStart = api.checkFeatureGate("mcp_multi_account");
        setEnv("SAND_DATA_ROOT", second);
        state.overrides[0]({ sand_spotlight: false });
        const written = await overridesFile(second);
        await host.stop();
        return { readAtStart, written, firstFolder: await readdir(first), secondFolder: (await readdir(second)).filter((name) => !name.endsWith(".tmp")) };
      });
    },
  },
  {
    name: "the host stopping takes both listeners away and then disposes of the service, which is waited for",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async (dir) => {
        const { state, peersFor } = peers({ token: null });
        const calls = [];
        return watching(service, calls, ["dispose"], {}, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          const api = host.start();
          const snapshots = [];
          api.subscribe(() => snapshots.push("a snapshot"));
          const waiting = api.waitForHydratedStatsigUserId();
          state.overrides[0]({ sand_spotlight: false });
          await persisted(dir, { sand_spotlight: false });
          const toldBeforeStopping = snapshots.length;
          const from = calls.length;
          const stopping = await host.stop();
          const waited = await waiting;
          state.overrides[0]({ sand_spotlight: true });
          await persisted(dir, { sand_spotlight: true });
          return { stopping, calls: calls.slice(from).map((one) => one.call), toldBeforeStopping, toldAfterStopping: snapshots.length - toldBeforeStopping, theWaitForAUserEndedWith: waited };
        });
      }),
  },
  {
    name: "each way in puts one question to the service, with what it was given and nothing more, and hands back the service's answer",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async () => {
        const { peersFor } = peers({ token: null });
        const calls = [];
        const answers = Object.fromEntries(QUESTIONS.map((name) => [name, () => `the service's answer to ${name}`]));
        // Two answers the wrapper around the service works with itself: the overrides (each name it looks up is noted) and a gate's property.
        answers.getFeatureFlagOverridesRecord = () => new Proxy({}, { get: (target, name) => (calls.push({ call: `the overrides are looked up for ${String(name)}` }), undefined) });
        answers.getFeatureGateProperty = () => ({
          get: () => (calls.push({ call: "the property is asked its value" }), "the property's value"),
          set: (value) => void calls.push({ call: "the property is set", given: [value] }),
        });
        return watching(service, calls, [...QUESTIONS, ...LIFE], { ...answers, start: () => undefined, dispose: async () => undefined }, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          const api = host.start();
          const listener = () => {};
          const pin = (value) => void calls.push({ call: "the pin is given", given: [value] });
          const asked = [
            ["checkFeatureGate", "some_gate", "more"],
            ["checkFeatureGate", "sand_usage_page"],
            ["checkFeatureGate"],
            ["getFeatureGateProperty", "some_gate", "more"],
            ["getFeatureGateProperty", "sand_multiplayer"],
            ["checkGate", "some_gate", { timeoutMs: 7 }, "more"],
            ["checkGate", "some_gate"],
            ["getDynamicConfig", "some_config", "more"],
            ["subscribe", listener, "more"],
            ["pinGateOnAuthenticatedBootstrap", "some_gate", pin, "more"],
            ["pinGateOnAuthenticatedBootstrap", "sand_memory_dreaming", pin],
            ["hasHydratedStatsigUserId", "more"],
            ["waitForHydratedStatsigUserId", 5, "more"],
            ["waitForHydratedStatsigUserId"],
            ["hasAuthenticatedStatsigBootstrap", "more"],
            ["getSandModelExperimentState", "more"],
            ["logSandModelExperimentExposure", "more"],
            ["getConfiguredDefaultModel", "more"],
            ["getConfiguredAutomationsModel", "more"],
            ["getComputerUseModelOverride", "more"],
            ["getBrowserUseModelOverride", "more"],
            ...FEATURES.map((name) => [name, "more"]),
          ];
          const table = [];
          for (const [way, ...given] of asked) {
            const from = calls.length;
            const gave = api[way](...given);
            table.push({ way, given: told(given), gave: typeof gave === "object" && gave !== null ? Object.keys(gave) : gave, asked: calls.slice(from).map((one) => (one.given === undefined ? one.call : [one.call, ...one.given])) });
          }
          await host.stop();
          return table;
        });
      }),
  },
  {
    name: "the two settings that overrule a feature are read each time it is asked, and the service is then not asked at all",
    run: ({ extension, service }, tools) =>
      inDataFolder(tools, {}, async () => {
        const { peersFor } = peers({ token: null });
        const calls = [];
        let gate = true;
        return watching(service, calls, ["checkFeatureGate"], { checkFeatureGate: () => gate }, async () => {
          const host = standInHost(extension.experimentsExtension, peersFor, calls);
          const api = host.start();
          const table = [];
          for (const [way, setting] of [["isMultitaskEnabled", "SAND_MULTITASK"], ["isSpotlightEnabled", "SAND_SPOTLIGHT"]]) {
            for (const value of [undefined, "", "0", "false", "FALSE", "False", "1", "true", "no", "off", " ", "00", " false"]) {
              for (const says of [true, false]) {
                gate = says;
                setEnv(setting, value);
                const from = calls.length;
                const gave = api[way]();
                setEnv(setting, undefined);
                table.push(`${way} with ${setting}=${value === undefined ? "(not set)" : JSON.stringify(value)} and the gate ${says}: ${gave}; the service was asked ${calls.slice(from).map((one) => `${one.call}(${one.given.join(", ")})`).join(" ") || "nothing"}`);
              }
            }
          }
          setEnv("SAND_MULTITASK", "0");
          setEnv("SAND_SPOTLIGHT", "0");
          gate = true;
          const theOthersDoNotReadThem = featureAnswers(api);
          await host.stop();
          return { table, theOthersDoNotReadThem };
        });
      }),
  },
  {
    name: "with the real service and nothing fetched: what every way in answers",
    run: ({ extension }, tools) =>
      inDataFolder(tools, {}, async () => {
        const { peersFor } = peers({ token: null });
        const host = standInHost(extension.experimentsExtension, peersFor);
        const api = host.start();
        const property = api.getFeatureGateProperty("mcp_multi_account");
        const tableProperty = api.getFeatureGateProperty("sand_multiplayer");
        const pinned = [];
        api.pinGateOnAuthenticatedBootstrap("sand_memory_dreaming", (value) => pinned.push(["sand_memory_dreaming", value]));
        api.pinGateOnAuthenticatedBootstrap("mcp_multi_account", (value) => pinned.push(["mcp_multi_account", value]));
        const stopListening = api.subscribe(() => {});
        const answers = {
          checkFeatureGate: Object.fromEntries(["sand_usage_page", "sand_auto_review", "sand_multiplayer", "sand_multitask", "mcp_multi_account", "sand_computer_use_playwright", "not_a_gate"].map((name) => [name, api.checkFeatureGate(name)])),
          getFeatureGateProperty: { class: property?.constructor?.name, value: property.get(), theSameEachTime: api.getFeatureGateProperty("mcp_multi_account") === property, aGateOfSimeonsTable: tableProperty.get() },
          checkGate: { aPromise: api.checkGate("sand_multitask") instanceof Promise, sand_multitask: await api.checkGate("sand_multitask"), sand_usage_page: await api.checkGate("sand_usage_page", { timeoutMs: 0 }), not_a_gate: await api.checkGate("not_a_gate", { timeoutMs: 1 }) },
          getDynamicConfig: { sand_browser_use_model: api.getDynamicConfig("sand_browser_use_model"), sand_computer_use_playwright_config: api.getDynamicConfig("sand_computer_use_playwright_config"), not_a_config: await outcomeOf(() => api.getDynamicConfig("not_a_config")) },
          subscribe: { gives: typeof stopListening, stoppingGives: [stopListening(), stopListening()] },
          pinGateOnAuthenticatedBootstrap: pinned,
          hasHydratedStatsigUserId: api.hasHydratedStatsigUserId(),
          waitForHydratedStatsigUserId: await api.waitForHydratedStatsigUserId(1),
          hasAuthenticatedStatsigBootstrap: api.hasAuthenticatedStatsigBootstrap(),
          getSandModelExperimentState: api.getSandModelExperimentState(),
          logSandModelExperimentExposure: api.logSandModelExperimentExposure(),
          getConfiguredDefaultModel: api.getConfiguredDefaultModel(),
          getConfiguredAutomationsModel: api.getConfiguredAutomationsModel(),
          getComputerUseModelOverride: api.getComputerUseModelOverride(),
          getBrowserUseModelOverride: api.getBrowserUseModelOverride(),
          features: featureAnswers(api),
        };
        setEnv("SAND_MODEL_EXPERIMENT_OVERRIDE", "control");
        const withTheModelExperimentSet = api.getSandModelExperimentState();
        await host.stop();
        return { answers, withTheModelExperimentSet };
      }),
  },
  {
    name: "with the real service: each of the ten features follows its own gate and no other",
    run: ({ extension }, tools) =>
      inDataFolder(tools, {}, async (dir) => {
        const { state, peersFor } = peers({ token: null });
        const host = standInHost(extension.experimentsExtension, peersFor);
        const api = host.start();
        const untouched = featureAnswers(api);
        const out = { untouched };
        for (const gate of ["sand_agent_network", "mcp_multi_account", "enable_sparse_plugin_clones", "sand_multitask", "sand_send_message_delivery_owed", "simeon_dynamic_tools", "sand_browser_use_subagent", "sand_spotlight", "sand_computer_use_unicode_typing", "sand_browser_ua_token_kill_switch", "sand_computer_use_playwright"]) {
          const now = api.checkFeatureGate(gate);
          state.overrides[0]({ [gate]: !now });
          const changed = featureAnswers(api).filter((answer, at) => answer !== untouched[at]);
          out[`${gate} turned ${!now ? "on" : "off"}`] = { changed, computerUseModel: api.getComputerUseModelOverride() === undefined ? "none" : "set", browserUseModel: api.getBrowserUseModelOverride() === undefined ? "none" : "set" };
          await persisted(dir, { [gate]: !now });
        }
        await host.stop();
        return out;
      }),
  },
  {
    name: "with the real service: a build is a development build unless it is packaged, or when the host is asked for error detail; only then do the environment's gate overrides and the overrides file count",
    run: async ({ extension }, tools) => {
      const out = {};
      for (const [name, changes] of Object.entries({
        "nothing set": {},
        "packaged": { SAND_PACKAGED: "1" },
        "packaged, with error detail": { SAND_PACKAGED: "1", SAND_HOST_DEV_ERROR_DETAIL: "1" },
        "error detail only": { SAND_HOST_DEV_ERROR_DETAIL: "1" },
        "packaged set to true": { SAND_PACKAGED: "true" },
        "packaged set to 0": { SAND_PACKAGED: "0" },
        "packaged, error detail set to true": { SAND_PACKAGED: "1", SAND_HOST_DEV_ERROR_DETAIL: "true" },
        "packaged, error detail set to 0": { SAND_PACKAGED: "1", SAND_HOST_DEV_ERROR_DETAIL: "0" },
      })) {
        const dir = await tools.tmp();
        await writeFile(path.join(dir, "sand-feature-flag-overrides.json"), JSON.stringify({ overrides: { mcp_multi_account: { value: true, expiresAtMs: 9e15 } } }));
        out[name] = await withEnv({ SAND_DATA_ROOT: dir, SAND_FEATURE_GATE_OVERRIDES: "sand_send_message_delivery_owed=1", ...changes }, async () => {
          const { state, peersFor } = peers({ token: null });
          const host = standInHost(extension.experimentsExtension, peersFor);
          const api = host.start();
          const snapshots = [];
          api.subscribe((snapshot) => snapshots.push(Object.keys(snapshot)));
          const answers = { theOverridesFileCounts: api.isMcpMultiAccountEnabled(), theEnvironmentCounts: api.isSendMessageDeliveryOwedEnabled() };
          // Once the build is made, changing the two settings changes nothing.
          setEnv("SAND_PACKAGED", changes.SAND_PACKAGED === "1" ? undefined : "1");
          setEnv("SAND_HOST_DEV_ERROR_DETAIL", undefined);
          const afterTheSettingsChange = api.isSendMessageDeliveryOwedEnabled();
          state.overrides[0]({});
          await persisted(dir, {});
          await host.stop();
          return { ...answers, afterTheSettingsChange, aSnapshotHolds: snapshots[0] };
        });
      }
      return out;
    },
  },
  {
    name: "where the bootstrap is served: the service asks the sign-in's own two functions, called as plain functions, once at the start and once more for someone signed in or renewed",
    run: async ({ extension }, tools) => {
      const realFetch = globalThis.fetch;
      const fetched = [];
      // No request leaves the process: the bootstrap is asked of a stand-in that refuses, so nothing is ever loaded from it.
      globalThis.fetch = async (url, init) => {
        fetched.push([String(url), init?.method]);
        return new Response("{}", { status: 503 });
      };
      try {
        const out = {};
        for (const [name, token] of Object.entries({ "no one signed in": null, "someone signed in": "a-token" })) {
          out[name] = await inDataFolder(tools, { SAND_CONNECT_SERVED: "1", SAND_BACKEND_URL: "http://127.0.0.1:9/" }, async () => {
            const { state, peersFor } = peers({ token });
            const host = standInHost(extension.experimentsExtension, peersFor);
            const api = host.start();
            const insideStart = host.calls.map((one) => one.call);
            await api.checkGate("sand_multitask", { timeoutMs: 0 });
            const afterTheStart = host.calls.slice(insideStart.length);
            const fetchedAtStart = fetched.splice(0);
            const from = host.calls.length;
            state.renewal[0]({ outcome: "renewed", isFirstCredential: false });
            state.renewal[0]({ outcome: "failed", isFirstCredential: true });
            await api.checkGate("sand_multitask", { timeoutMs: 0 });
            const afterARenewal = host.calls.slice(from);
            const signedInBootstrap = api.hasAuthenticatedStatsigBootstrap();
            await host.stop();
            return { insideStart, afterTheStart, fetchedAtStart, afterARenewal, fetchedAfterARenewal: fetched.splice(0), signedInBootstrap };
          });
        }
        return out;
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  },
  {
    name: "a start without one of its peers fails where it first needs it, with what it had left to undo by then",
    run: async ({ extension, service }, tools) => {
      const out = {};
      for (const missing of ["auth", "settings"]) {
        out[missing] = await inDataFolder(tools, {}, async () => {
          const { peersFor } = peers({ token: "a-token" });
          const calls = [];
          return watching(service, calls, LIFE, {}, async () => {
            const host = standInHost(extension.experimentsExtension, (list) => ({ ...peersFor(list), [missing]: undefined }), calls);
            const started = await outcomeOf(() => host.start());
            const atStart = calls.map((one) => one.call);
            const stopping = await host.stop();
            return { started, atStart, stopping };
          });
        });
      }
      return out;
    },
  },
  {
    name: "each start makes a service of its own",
    run: ({ extension }, tools) =>
      inDataFolder(tools, {}, async (dir) => {
        const one = peers({ token: null });
        const two = peers({ token: null });
        const firstHost = standInHost(extension.experimentsExtension, one.peersFor);
        const secondHost = standInHost(extension.experimentsExtension, two.peersFor);
        const first = firstHost.start();
        const second = secondHost.start();
        one.state.overrides[0]({ mcp_multi_account: true });
        const answers = { first: first.isMcpMultiAccountEnabled(), second: second.isMcpMultiAccountEnabled(), theirWaysInDiffer: first.checkFeatureGate !== second.checkFeatureGate };
        await persisted(dir, { mcp_multi_account: true });
        await firstHost.stop();
        await secondHost.stop();
        return answers;
      }),
  },
];
