/** The error trays the window shows: a short list of what went wrong, told to whoever listens, and the extension that hands the host one such list. */
export const part = "host/extensions/trays";
export const modules = {
  service: "source/host/extensions/trays/trays-service.ts",
  extension: "source/host/extensions/trays/extension.ts",
};

/**
 * A list of trays with stand-ins for its ids ("id-1", "id-2", …) and its clock (1000, 2000, …), the order the two are
 * asked in, and every event a listener is told.
 */
function standIn(service, { ids } = {}) {
  const asked = [];
  let made = 0;
  let time = 0;
  const manager = new service.TrayManager(
    () => {
      asked.push("id");
      made += 1;
      return ids ? ids[made - 1] : `id-${made}`;
    },
    () => {
      asked.push("clock");
      time += 1000;
      return time;
    },
  );
  const events = [];
  manager.subscribe((event) => events.push(event));
  return { manager, asked, events };
}

/** What a call did: what it gave, or the class of what it threw. */
function outcomeOf(run) {
  try {
    return { gave: run() };
  } catch (error) {
    return { threw: error?.constructor?.name, message: error instanceof TypeError ? "(the runtime's own words)" : error?.message };
  }
}

/** `Date.now` answering one fixed time while `run` runs. */
function atTime(time, run) {
  const real = Date.now;
  Date.now = () => time;
  try {
    return run();
  } finally {
    Date.now = real;
  }
}

/** The warnings Node raises while `run` runs, kept instead of printed. */
function warningsDuring(run) {
  const real = process.emitWarning;
  const raised = [];
  process.emitWarning = (warning) => {
    raised.push({ name: warning?.name, type: warning?.type, count: warning?.count, raisedBy: warning?.emitter?.constructor?.name });
  };
  try {
    run();
  } finally {
    process.emitWarning = real;
  }
  return raised;
}

/** The same stand-in for the host as the other extensions' scenarios use: what each named peer gave, the host's log, a way to leave something to undo, and every call kept in order. */
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
  return { calls, left, host, peers, start: () => declaration.start({ ...context }) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const twenty = (manager) => {
  for (let i = 1; i <= 20; i += 1) manager.pushError({ title: `t${i}`, detail: `d${i}` });
};
const idsOf = (manager) => manager.getTrays().map((tray) => tray.id);

export const scenarios = [
  {
    name: "no more than twenty trays are kept",
    run: ({ service }) => service.MAX_TRAYS,
  },
  {
    name: "an error becomes a tray with the clock's time and a new id, and only the fields it was given",
    run: ({ service }) => {
      const given = {
        "a title and a detail": { title: "It failed", detail: "Something went wrong" },
        "every field": { agentId: "agent-a", title: "T", detail: "D", requestId: "req-1", errorKind: "network", rawDetail: "raw", actions: [{ kind: "retry" }, "open"], dedupeKey: "key", count: 4 },
        "the fields in another order": { count: 4, dedupeKey: "key", actions: ["open"], rawDetail: "raw", errorKind: "network", requestId: "req-1", detail: "D", title: "T", agentId: "agent-a" },
        "no actions in the list": { title: "T", detail: "D", actions: [] },
        "an empty kind and raw detail": { title: "T", detail: "D", errorKind: "", rawDetail: "" },
        "fields that are null": { title: "T", detail: "D", agentId: null, requestId: null, errorKind: null, rawDetail: null, actions: null, dedupeKey: null, count: null },
        "a dedupe key and no count": { title: "T", detail: "D", dedupeKey: "key" },
        "a dedupe key and a count of zero": { title: "T", detail: "D", dedupeKey: "key", count: 0 },
        "a count and no dedupe key": { title: "T", detail: "D", count: 9 },
        "an empty dedupe key": { title: "T", detail: "D", dedupeKey: "" },
        "fields a tray does not have": { title: "T", detail: "D", kind: "warning", id: "mine", createdAt: 5, extra: true },
        "nothing but an empty object": {},
      };
      const out = {};
      for (const [name, options] of Object.entries(given)) {
        const { manager, asked, events } = standIn(service);
        const tray = manager.pushError(options);
        out[name] = { tray, asked, told: events.length === 1 && events[0].type === "pushed" && events[0].tray === tray, kept: manager.getTrays().length === 1 && manager.getTrays()[0] === tray };
      }
      return out;
    },
  },
  {
    name: "the tray handed back is the one kept and the one listeners are told, with the very list of actions it was given",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      const actions = [{ kind: "retry" }];
      const emptyBefore = manager.getTrays();
      const tray = manager.pushError({ title: "T", detail: "D", actions });
      const afterOne = manager.getTrays();
      manager.pushError({ title: "T2", detail: "D2" });
      return {
        aNewListAfterEachPush: emptyBefore !== afterOne && afterOne !== manager.getTrays(),
        theSameListWhileNothingChanges: manager.getTrays() === manager.getTrays(),
        theEmptyListWasLeftEmpty: emptyBefore.length,
        theListOfOneWasLeftAtOne: afterOne.length,
        trayIsTheOneKept: manager.getTrays()[0] === tray,
        trayIsTheOneTold: events[0].tray === tray,
        itsActionsAreTheListGiven: tray.actions === actions,
        events,
      };
    },
  },
  {
    name: "an error with a dedupe key the list already holds takes the place of that tray, where it was, and is counted",
    run: ({ service }) => {
      const { manager, asked, events } = standIn(service);
      manager.pushError({ title: "first", detail: "one" });
      const original = manager.pushError({ agentId: "agent-a", title: "old title", detail: "old detail", requestId: "req-old", errorKind: "old-kind", rawDetail: "old raw", actions: ["old"], dedupeKey: "key" });
      manager.pushError({ title: "last", detail: "three" });
      const listBefore = manager.getTrays();
      const askedBefore = asked.length;
      const updated = manager.pushError({ agentId: "agent-b", title: "new title", detail: "new detail", dedupeKey: "key" });
      return {
        original,
        updated,
        aNewObject: updated !== original,
        askedForTheUpdate: asked.slice(askedBefore),
        position: manager.getTrays().indexOf(updated),
        titles: manager.getTrays().map((tray) => tray.title),
        aNewList: manager.getTrays() !== listBefore,
        theOldListStillHoldsTheOriginal: listBefore[1] === original,
        lastEvent: events.at(-1),
        toldTheUpdated: events.at(-1).tray === updated,
        eventsInAll: events.length,
      };
    },
  },
  {
    name: "what each new push with the same dedupe key leaves in the tray",
    run: ({ service }) => {
      const pushes = {
        "nothing but title and detail": { title: "T2", detail: "D2", dedupeKey: "key" },
        "a count": { title: "T2", detail: "D2", dedupeKey: "key", count: 7 },
        "a count of zero": { title: "T2", detail: "D2", dedupeKey: "key", count: 0 },
        "a count that is null": { title: "T2", detail: "D2", dedupeKey: "key", count: null },
        "every field": { agentId: "agent-b", title: "T2", detail: "D2", requestId: "req-2", errorKind: "kind-2", rawDetail: "raw-2", actions: ["b", "c"], dedupeKey: "key" },
        "no actions in the list": { title: "T2", detail: "D2", dedupeKey: "key", actions: [] },
        "no title and no detail": { dedupeKey: "key" },
      };
      const out = {};
      for (const [name, options] of Object.entries(pushes)) {
        const bare = standIn(service);
        bare.manager.pushError({ title: "T1", detail: "D1", dedupeKey: "key" });
        const full = standIn(service);
        full.manager.pushError({ agentId: "agent-a", title: "T1", detail: "D1", requestId: "req-1", errorKind: "kind-1", rawDetail: "raw-1", actions: ["a"], dedupeKey: "key", count: 3 });
        out[name] = { overABareTray: bare.manager.pushError(options), overAFullTray: full.manager.pushError(options) };
      }
      return out;
    },
  },
  {
    name: "pushes with one dedupe key count up; keys are told apart exactly",
    run: ({ service }) => {
      const { manager, asked } = standIn(service);
      const counts = [];
      for (let i = 0; i < 4; i += 1) counts.push(manager.pushError({ title: "T", detail: "D", dedupeKey: "key" }).count);
      counts.push(manager.pushError({ title: "T", detail: "D", dedupeKey: "key", count: 40 }).count);
      counts.push(manager.pushError({ title: "T", detail: "D", dedupeKey: "key" }).count);
      for (const dedupeKey of ["Key", "key ", "", 1, "1", ""]) manager.pushError({ title: "T", detail: "D", dedupeKey });
      return { counts, asked: asked.join(" "), trays: manager.getTrays().map((tray) => [tray.id, tray.dedupeKey, tray.count, tray.createdAt]) };
    },
  },
  {
    name: "a kept tray that lost its count is counted from one",
    run: ({ service }) => {
      const { manager } = standIn(service);
      const tray = manager.pushError({ title: "T", detail: "D", dedupeKey: "key", count: 8 });
      delete tray.count;
      return manager.pushError({ title: "T", detail: "D", dedupeKey: "key" });
    },
  },
  {
    name: "the twenty-first tray pushes the oldest out, after it has been told as pushed",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      twenty(manager);
      const atTwenty = { trays: manager.getTrays().length, dismissedSoFar: events.filter((event) => event.type === "dismissed").length };
      const listAtTwenty = manager.getTrays();
      const next = manager.pushError({ title: "t21", detail: "d21" });
      const atTwentyOne = { ids: idsOf(manager), newEvents: events.slice(20), handedBackIsKept: manager.getTrays().at(-1) === next, theListOfTwentyWasLeftAsItWas: listAtTwenty.length === 20 && listAtTwenty[0].id === "id-1" };
      manager.pushError({ title: "t22", detail: "d22" });
      return { atTwenty, atTwentyOne, afterOneMore: { ids: idsOf(manager), newEvents: events.slice(22).map((event) => [event.type, event.id ?? event.tray.id]) } };
    },
  },
  {
    name: "a push that takes the place of a tray never pushes one out",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      for (let i = 1; i <= 20; i += 1) manager.pushError({ title: `t${i}`, detail: `d${i}`, dedupeKey: `key-${i}` });
      for (let i = 1; i <= 20; i += 1) manager.pushError({ title: `again ${i}`, detail: `d${i}`, dedupeKey: `key-${i}` });
      return { trays: manager.getTrays().length, ids: idsOf(manager).join(" "), counts: manager.getTrays().map((tray) => tray.count).join(" "), events: events.map((event) => event.type).filter((type) => type !== "pushed") };
    },
  },
  {
    name: "a listener that throws stops the push where it is: the tray is kept, later listeners are not told, nothing is pushed out",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      twenty(manager);
      let failing = true;
      const failure = new Error("the listener failed");
      manager.subscribe(() => {
        if (failing) throw failure;
      });
      const later = [];
      manager.subscribe((event) => later.push(event.type));
      const thrown = [];
      for (let i = 21; i <= 23; i += 1) {
        try {
          manager.pushError({ title: `t${i}`, detail: `d${i}` });
          thrown.push("nothing");
        } catch (error) {
          thrown.push(error === failure ? "the listener's own error" : "another error");
        }
      }
      const whileFailing = { thrown, trays: manager.getTrays().length, toldToTheFirstListener: events.slice(20).map((event) => event.type), toldToTheLaterListener: [...later] };
      failing = false;
      const before = events.length;
      manager.pushError({ title: "t24", detail: "d24" });
      return { whileFailing, onceItNoLongerThrows: { trays: manager.getTrays().length, ids: idsOf(manager).join(" "), newEvents: events.slice(before).map((event) => [event.type, event.id ?? event.tray.id]), toldToTheLaterListener: later } };
    },
  },
  {
    name: "a listener that throws while trays are taken away: the trays are gone all the same, and the rest of the telling is lost",
    run: ({ service }) => {
      const out = {};
      const failure = new Error("the listener failed");
      for (const [name, act] of Object.entries({
        dismiss: (manager) => manager.dismiss("id-2"),
        clearAll: (manager) => manager.clearAll(),
        clearForAgent: (manager) => manager.clearForAgent("agent-a"),
      })) {
        const { manager, events } = standIn(service);
        for (let i = 1; i <= 4; i += 1) manager.pushError({ agentId: i === 4 ? "agent-b" : "agent-a", title: `t${i}`, detail: "d" });
        manager.subscribe(() => {
          throw failure;
        });
        const before = events.length;
        let thrown = "nothing";
        try {
          act(manager);
        } catch (error) {
          thrown = error === failure ? "the listener's own error" : "another error";
        }
        out[name] = { thrown, left: idsOf(manager), toldBeforeTheFailure: events.slice(before) };
      }
      return out;
    },
  },
  {
    name: "a tray is dismissed by its id: listeners are told once, and an id the list does not hold changes nothing",
    run: ({ service }) => {
      const { manager, events } = standIn(service, { ids: ["a", "b", "b", "c"] });
      for (let i = 1; i <= 4; i += 1) manager.pushError({ title: `t${i}`, detail: "d" });
      const list = manager.getTrays();
      const unknown = [manager.dismiss("nope"), manager.dismiss(""), manager.dismiss(undefined), manager.dismiss("A")];
      const untouched = manager.getTrays() === list;
      const eventsBefore = events.length;
      const one = manager.dismiss("a");
      const afterOne = idsOf(manager);
      const two = manager.dismiss("b");
      const again = manager.dismiss("b");
      return { unknown, untouched, one, afterOne, two, again, left: manager.getTrays().map((tray) => [tray.id, tray.title]), aNewList: manager.getTrays() !== list, theOldListStillHoldsFour: list.length, events: events.slice(eventsBefore) };
    },
  },
  {
    name: "all trays are cleared at once and listeners told so; an empty list is left alone",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      const empty = manager.getTrays();
      const onEmpty = manager.clearAll();
      const emptyLeftAlone = manager.getTrays() === empty && events.length === 0;
      for (let i = 1; i <= 3; i += 1) manager.pushError({ title: `t${i}`, detail: "d" });
      const list = manager.getTrays();
      const cleared = manager.clearAll();
      const afterClear = manager.getTrays();
      manager.clearAll();
      return { onEmpty, emptyLeftAlone, cleared, left: afterClear.length, aNewList: afterClear !== list && afterClear !== empty, theOldListStillHoldsThree: list.length, events: events.slice(3), clearedAgainLeavesTheSameList: manager.getTrays() === afterClear };
    },
  },
  {
    name: "an agent's trays are taken away together, each told as dismissed in the order they were kept",
    run: ({ service }) => {
      const { manager, events } = standIn(service);
      for (const agentId of ["agent-a", "agent-b", undefined, "agent-a", null, "agent-a", "Agent-a"]) manager.pushError({ agentId, title: "t", detail: "d" });
      const list = manager.getTrays();
      const unknown = manager.clearForAgent("agent-z");
      const untouched = manager.getTrays() === list && events.length === 7;
      const cleared = manager.clearForAgent("agent-a");
      const afterAgentA = { left: manager.getTrays().map((tray) => [tray.id, tray.agentId]), events: events.slice(7) };
      manager.clearForAgent(undefined);
      const afterNoAgent = { left: manager.getTrays().map((tray) => [tray.id, tray.agentId]), events: events.slice(10) };
      manager.clearForAgent(null);
      return { unknown, untouched, cleared, afterAgentA, afterNoAgent, afterNull: { left: manager.getTrays().map((tray) => [tray.id, tray.agentId]), events: events.slice(11) } };
    },
  },
  {
    name: "listeners are told in the order they came, as often as they were added, until each is taken away",
    run: ({ service }) => {
      const manager = new service.TrayManager(() => "id", () => 1);
      const told = [];
      const first = (...given) => told.push(["first", given.length, given[0].type]);
      const second = function (event) {
        told.push(["second", this?.constructor?.name, event.type]);
      };
      const stopFirst = manager.subscribe(first);
      const stopSecond = manager.subscribe(second);
      const stopFirstAgain = manager.subscribe(first);
      manager.pushError({ title: "t", detail: "d" });
      const afterPush = told.splice(0);
      const stopped = stopFirst();
      manager.clearAll();
      const afterOneStop = told.splice(0);
      stopFirstAgain();
      stopFirstAgain();
      stopSecond();
      manager.pushError({ title: "t", detail: "d" });
      return { afterPush, whatStoppingGives: stopped?.constructor?.name, sameThingEveryTime: stopped === stopSecond(), afterOneStop, afterAllStopped: told };
    },
  },
  {
    name: "a listener added during an event waits for the next one; one taken away during an event is still told it",
    run: ({ service }) => {
      const manager = new service.TrayManager(() => "id", () => 1);
      const told = [];
      let stopLate;
      const late = (event) => told.push(["late", event.type]);
      manager.subscribe((event) => {
        told.push(["early", event.type]);
        if (event.type === "pushed") manager.subscribe((inner) => told.push(["added during", inner.type]));
        if (event.type === "cleared") stopLate();
      });
      stopLate = manager.subscribe(late);
      manager.pushError({ title: "t", detail: "d" });
      const afterPush = told.splice(0);
      manager.clearAll();
      const afterClear = told.splice(0);
      manager.pushError({ title: "t", detail: "d" });
      return { afterPush, afterClear, afterAnotherPush: told };
    },
  },
  {
    name: "the eleventh listener on one list makes Node warn of a leak, once",
    run: ({ service }) => {
      const manager = new service.TrayManager();
      const ten = warningsDuring(() => {
        for (let i = 0; i < 10; i += 1) manager.subscribe(() => {});
      });
      const eleventh = warningsDuring(() => manager.subscribe(() => {}));
      const twelfth = warningsDuring(() => manager.subscribe(() => {}));
      return { ten, eleventh, twelfth };
    },
  },
  {
    name: "a push given nothing fails after the clock was asked and changes nothing; a text or a number makes a tray with no fields",
    run: ({ service }) => {
      const out = {};
      for (const [name, given] of Object.entries({ nothing: [], null: [null], "a text": ["words"], "a number": [5] })) {
        const { manager, asked, events } = standIn(service);
        out[name] = { ...outcomeOf(() => manager.pushError(...given)), asked, trays: manager.getTrays().length, events: events.length };
      }
      return out;
    },
  },
  {
    name: "left to itself a list takes random ids and the time of day",
    run: ({ service }) => {
      const manager = new service.TrayManager();
      const first = atTime(1_700_000_000_123, () => manager.pushError({ title: "t", detail: "d" }));
      const second = atTime(1_700_000_000_456, () => manager.pushError({ title: "t", detail: "d", dedupeKey: "key" }));
      const third = atTime(1_700_000_000_789, () => manager.pushError({ title: "t", detail: "d", dedupeKey: "key" }));
      return { idsAreRandom: [first, second].every((tray) => UUID.test(tray.id)), idsDiffer: first.id !== second.id, times: [first.createdAt, second.createdAt, third.createdAt], theReplacedTrayKeepsItsId: third.id === second.id, methods: Object.getOwnPropertyNames(service.TrayManager.prototype).filter((name) => ["getTrays", "pushError", "clearAll", "dismiss", "clearForAgent", "subscribe"].includes(name)).sort() };
    },
  },
  {
    name: "the extension is declared under the id trays, with no peers",
    run: ({ extension }) => {
      const declared = extension.traysExtension;
      return { keys: Object.keys(declared), kind: declared.kind, id: declared.id, dependencies: declared.dependencies, frozen: [Object.isFrozen(declared), Object.isFrozen(declared.dependencies)], start: { kind: typeof declared.start, parameters: declared.start.length } };
    },
  },
  {
    name: "started, the extension hands the host six ways into one list of its own and asks nothing of the host",
    run: ({ extension }) => {
      const host = standInHost(extension.traysExtension);
      const api = host.start();
      const other = standInHost(extension.traysExtension).start();
      const events = [];
      const stop = api.subscribe((event) => events.push(event));
      const [first, second, third] = atTime(1_700_000_000_000, () => [
        api.pushError({ agentId: "agent-a", title: "t1", detail: "d1" }),
        api.pushError({ agentId: "agent-b", title: "t2", detail: "d2", dedupeKey: "key" }),
        api.pushError({ agentId: "agent-a", title: "t3", detail: "d3" }),
      ]);
      const name = (id) => ({ [first.id]: "<first>", [second.id]: "<second>", [third.id]: "<third>" })[id] ?? id;
      const listed = api.list();
      const answers = {
        list: listed.map((tray) => ({ ...tray, id: name(tray.id) })),
        listIsTheSameUntilAChange: listed === api.list(),
        idsAreRandom: listed.every((tray) => UUID.test(tray.id)),
        dismissUnknown: api.dismiss({ id: "nope" }),
        dismissNoId: api.dismiss({}),
        dismissNothing: outcomeOf(() => api.dismiss()),
        dismissFirst: api.dismiss({ id: first.id, more: "ignored" }),
        afterDismiss: api.list().map((tray) => name(tray.id)),
        clearForAgent: api.clearForAgent("agent-a"),
        afterClearForAgent: api.list().map((tray) => name(tray.id)),
        clearAll: api.clearAll(),
        afterClearAll: api.list().length,
      };
      const whatStoppingGives = stop()?.constructor?.name;
      api.pushError({ title: "after the listener left", detail: "d" });
      return {
        aPromise: api instanceof Promise,
        ways: Object.entries(api).map(([key, value]) => [key, typeof value, value.length]),
        answers,
        events: events.map((event) => (event.type === "pushed" ? ["pushed", name(event.tray.id), event.tray === [first, second, third].find((tray) => tray.id === event.tray.id)] : [event.type, name(event.id)])),
        whatStoppingGives,
        theOtherStartHasItsOwnList: other.list().length,
        eachStartNewWays: api.list !== other.list,
        callsOnTheHost: host.calls,
        leftToUndo: host.left.length,
      };
    },
  },
];
