/**
 * The smaller files of the agent's executors: twenty resources that each
 * carry one tool's arguments to the side that runs it and its answer back,
 * the four keys an exec hook reads from a context, the names of the MCP
 * catalogue on disk, the approval a shell hook can ask for, the queue of
 * wakeups and the registry of background work built on it, the folder's
 * front door, and ten files that hold nothing.
 *
 * The published engine's build keeps none of these files; the test tool
 * builds them because they are listed here. A resource is asked through
 * the folder's own two sides (the one that asks from afar, the one that
 * serves here), which are not this part's: what is kept is what each
 * resource decides, the name its arguments and its answer travel under.
 */
export const part = "packages/agent-exec-contracts";

const folder = "source/packages/agent-exec";

/** The twenty files that each hold one resource: a short name, the file, and the name it exports. */
const RESOURCES = [
  ["adopt", "adopt.ts", "adoptExecutorResource"],
  ["agentStoreConflict", "agent-store-conflict.ts", "agentStoreConflictExecutorResource"],
  ["conversationSearch", "conversation-search.ts", "conversationSearchExecutorResource"],
  ["diagnostics", "diagnostics.ts", "diagnosticsExecutorResource"],
  ["fetchPage", "fetch.ts", "fetchExecutorResource"],
  ["gitDiff", "git-diff.ts", "gitDiffExecutorResource"],
  ["grep", "grep.ts", "grepExecutorResource"],
  ["mcpAllowlistPrecheck", "mcp-allowlist-precheck.ts", "mcpAllowlistPrecheckExecutorResource"],
  ["miniSweAgentBash", "mini-swe-agent-bash.ts", "miniSweAgentBashExecutorResource"],
  ["piBash", "pi-bash.ts", "piBashExecutorResource"],
  ["piEdit", "pi-edit.ts", "piEditExecutorResource"],
  ["piFind", "pi-find.ts", "piFindExecutorResource"],
  ["piGrep", "pi-grep.ts", "piGrepExecutorResource"],
  ["piLs", "pi-ls.ts", "piLsExecutorResource"],
  ["piRead", "pi-read.ts", "piReadExecutorResource"],
  ["piWrite", "pi-write.ts", "piWriteExecutorResource"],
  ["recordScreen", "record-screen.ts", "recordScreenExecutorResource"],
  ["shellAllowlistPrecheck", "shell-allowlist-precheck.ts", "shellAllowlistPrecheckExecutorResource"],
  ["shellControl", "shell-control.ts", "forceBackgroundShellExecutorResource"],
  ["webFetchAllowlistPrecheck", "web-fetch-allowlist-precheck.ts", "webFetchAllowlistPrecheckExecutorResource"],
];

/** The ten files with nothing in them at run time. */
const EMPTY = [
  ["agentSkillMetadata", "agent-skill-metadata.ts"],
  ["awaitOutcome", "await-outcome.ts"],
  ["backgroundCompletionDispatch", "background-completion-dispatch.ts"],
  ["common", "common.ts"],
  ["execError", "exec-error.ts"],
  ["executionTiming", "execution-timing.ts"],
  ["requestContextParts", "request-context-parts.ts"],
  ["subagentLifecycleStateMachine", "subagent-lifecycle-state-machine.ts"],
  ["subagentLifecycleStore", "subagent-lifecycle-store.ts"],
  ["subagentQueue", "subagent-queue.ts"],
];

/** Where a context and a key come from. Not this part's: listed so that a real context can be handed to the code. */
const CONTEXT = "source/packages/context/core.ts";

export const modules = {
  ...Object.fromEntries(RESOURCES.map(([short, file]) => [short, `${folder}/${file}`])),
  hookMetadata: `${folder}/hook-metadata.ts`,
  mcpDiskCatalog: `${folder}/mcp-disk-catalog.ts`,
  shellHookApproval: `${folder}/shell-hook-approval.ts`,
  wakeup: `${folder}/wakeup/index.ts`,
  backgroundWork: `${folder}/background-work-registry.ts`,
  index: `${folder}/index.ts`,
  ...Object.fromEntries(EMPTY.map(([short, file]) => [short, `${folder}/${file}`])),
  context: CONTEXT,
};

/** The folder holds 24 more files that are not this part's. */
export const covers = Object.values(modules).filter((file) => file !== CONTEXT);

// ---------------------------------------------------------------------------
// How the cases are asked and kept
// ---------------------------------------------------------------------------

/** Each input beside its answer, in the order asked. */
const asked = (inputs, ask) => inputs.map((input) => [input, ask(input)]);

/**
 * The answer, or the kind of failure. Where JavaScript itself refuses a
 * value, its sentence names whatever the code read first and differs between
 * versions of Node, so only the kind of failure is kept.
 */
const attempt = (ask) => {
  try {
    return ask();
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
};

/** A message by the name its type has on the wire, or what kind of value it is when it is no message. */
const typeOf = (value) => (typeof value?.getType === "function" ? value.getType().typeName : value === null ? "null" : typeof value);

// ---------------------------------------------------------------------------
// The resources
// ---------------------------------------------------------------------------

/** The request a resource's asking side makes for `args`, taken from a manager that answers nothing. */
async function requestMade(resource, context, args, id, options) {
  let request;
  const manager = {
    createExecInstance: (_context, createMessage) => {
      request = createMessage(id);
      return (async function* () {})();
    },
  };
  const executor = resource.remoteImplementation(manager);
  const ended = await executor.execute(context, args, options).then(
    () => "with an answer",
    (error) => error.message,
  );
  return { request, ended, executor };
}

/** What a resource's serving side does with a request: whether it takes it, what the implementation is handed, the messages it answers with. */
async function served(resource, context, request, answer) {
  const handlers = [];
  const calls = [];
  const implementation = {
    execute: async (givenContext, args, options) => {
      calls.push({ givenContext, args, options });
      return answer;
    },
  };
  const registered = resource.registerControlledImplementation(implementation, {
    register: (handler) => {
      handlers.push(handler);
      return "what register answered";
    },
  });
  const stream = handlers[0].handle(context, request);
  const messages = [];
  if (stream !== undefined) for await (const message of stream) messages.push(message);
  return { registered, handlers, taken: stream !== undefined, calls, messages };
}

/** What a resource's asking side reads out of the messages a manager hands it. */
async function readBack(resource, context, messages) {
  const manager = {
    createExecInstance: () =>
      (async function* () {
        yield* messages;
      })(),
  };
  return resource.remoteImplementation(manager).execute(context, {}, undefined).then(
    (value) => ({ value }),
    (error) => ({ failed: error.message }),
  );
}

/**
 * One resource, end to end. Its arguments go out and its answer comes back
 * as real messages; the next resource of the list lends a request and an
 * answer under other names, which this one must leave alone.
 */
async function carried(loaded, at) {
  const [short, , name] = RESOURCES[at];
  const [otherShort, , otherName] = RESOURCES[(at + 1) % RESOURCES.length];
  const resource = loaded[short][name];
  const other = loaded[otherShort][otherName];
  const context = loaded.context.createContext();

  // Plain objects first: the messages made from them tell which types travel under the resource's two names.
  const plainly = await requestMade(resource, context, {}, 7);
  const args = new plainly.request.message.value.constructor();
  const request = await requestMade(resource, context, args, 8, { execId: "exec-8" });
  const servedPlainly = await served(resource, context, request.request, {});
  const answer = new servedPlainly.messages[0].message.value.constructor();
  const answered = await served(resource, context, request.request, answer);
  const reply = answered.messages[0];

  const othersRequest = (await requestMade(other, context, {}, 9)).request;
  const othersReply = (await served(other, context, othersRequest, {})).messages[0];
  const leftAlone = await served(resource, context, othersRequest, {});
  const afterOthers = await readBack(resource, context, [othersReply, reply]);

  return {
    resource: {
      fields: Object.keys(resource),
      symbol: typeof resource.symbol,
      symbolDescription: resource.symbol.description,
      functions: [resource.remoteImplementation, resource.registerControlledImplementation].map((fn) => ({ name: fn.name, takes: fn.length })),
    },
    askedFromAfar: {
      isAnExecutorResource: request.executor instanceof loaded.index.ExecutorResource,
      aNewExecutorEachTime: request.executor !== plainly.executor,
      request: {
        id: request.request.id,
        under: request.request.message.case,
        type: typeOf(request.request.message.value),
        isTheArgumentsGiven: request.request.message.value === args,
        aPlainObjectBecomes: typeOf(plainly.request.message.value),
        execId: request.request.execId,
      },
      withNoAnswerAtAll: plainly.ended,
    },
    servedHere: {
      registerAnswered: answered.registered,
      handlers: answered.handlers.length,
      isASimpleHandler: answered.handlers[0] instanceof loaded.index.SimpleControlledExecHandler,
      implementationCalls: answered.calls.length,
      handedTheArguments: answered.calls[0].args === args,
      handedTheContext: answered.calls[0].givenContext === context,
      handedOptions: Object.keys(answered.calls[0].options),
      handedExecId: answered.calls[0].options.execId,
      answers: answered.messages.length,
      answer: {
        id: reply.id,
        under: reply.message.case,
        type: typeOf(reply.message.value),
        isTheAnswerGiven: reply.message.value === answer,
        aPlainObjectBecomes: typeOf(servedPlainly.messages[0].message.value),
      },
    },
    anothersRequest: { whose: otherName, under: othersRequest.message.case, taken: leftAlone.taken, implementationCalls: leftAlone.calls.length },
    anothersAnswer: {
      under: othersReply.message.case,
      thenItsOwnIsRead: afterOthers.value === answer,
      alone: await readBack(resource, context, [othersReply]),
    },
  };
}

const resourceScenarios = RESOURCES.map(([, file, name], at) => ({
  name: `${file}: ${name} carries its arguments out and its answer back, each under a name of its own`,
  run: (loaded) => carried(loaded, at),
}));

// ---------------------------------------------------------------------------
// Wakeups and background work
// ---------------------------------------------------------------------------

/** A wakeup for a conversation; its payload says which it is. */
const wake = (conversationId, id, more = {}) => ({ conversationId, id, payload: `${conversationId}/${String(id).trim()}`, ...more });

/** Wakeups told by their payloads, in the order given. */
const told = (wakeups) => wakeups.map((wakeup) => wakeup.payload);

const registryOf = ({ backgroundWork }) => new backgroundWork.InMemoryBackgroundWorkRegistry();

/** What a registry says of its queue without being changed: how often it changed, and whether anything waits, in all and per conversation. */
const queueOf = (registry, ...conversations) => ({
  revision: registry.getWakeupRevision(),
  waiting: registry.hasPendingCompletions(),
  ...Object.fromEntries(conversations.map((conversation) => [`waiting in ${conversation}`, registry.hasPendingCompletions(conversation)])),
});

/** A record of work: a running shell unless told otherwise. */
const work = (id, more = {}) => ({ id, kind: "shell", state: "running", ...more });

const FIVE_RECORDS = [
  work("a", { kind: "shell", state: "running", ownerId: "o1" }),
  work("b", { kind: "shell", state: "done", ownerId: "o2" }),
  work("c", { kind: "subagent", state: "running", ownerId: "o1" }),
  work("d", { kind: "subagent", state: "running" }),
  work("e", { kind: "", state: "", ownerId: "" }),
];

export const scenarios = [
  ...resourceScenarios,
  {
    name: "the twenty resources are told apart by twenty symbols without a description",
    run: (loaded) => {
      const symbols = RESOURCES.map(([short, , name]) => loaded[short][name].symbol);
      return { resources: symbols.length, different: new Set(symbols).size, described: symbols.filter((symbol) => symbol.description !== undefined).length };
    },
  },

  // -------------------------------------------------------------------------
  // The front door, and the files that hold nothing
  // -------------------------------------------------------------------------
  {
    name: "the folder's front door hands on the names of the files behind it, the very same things",
    run: (loaded) => {
      const behind = Object.keys(modules).filter((short) => short !== "index" && short !== "context");
      return Object.fromEntries(
        Object.keys(loaded.index)
          .sort()
          .map((name) => {
            const value = loaded.index[name];
            const from = behind.filter((short) => Object.keys(loaded[short]).includes(name));
            if (from.length === 0) return [name, "from a file that is not this part's"];
            return [name, from.map((short) => `${modules[short].slice(folder.length + 1)}${loaded[short][name] === value ? "" : ", but not the same thing"}`).join(" and ")];
          }),
      );
    },
  },
  {
    name: "ten files hold nothing at run time",
    run: (loaded) => Object.fromEntries(EMPTY.map(([short, file]) => [file, Object.keys(loaded[short])])),
  },

  // -------------------------------------------------------------------------
  // hook-metadata.ts
  // -------------------------------------------------------------------------
  {
    name: "the four keys an exec hook reads are each a named symbol with nothing as the value read where none was set",
    run: ({ hookMetadata }) => ({
      execHookConversationIdKey: hookMetadata.execHookConversationIdKey,
      execHookGenerationIdKey: hookMetadata.execHookGenerationIdKey,
      execHookModelKey: hookMetadata.execHookModelKey,
      execHookWorkspaceRootsKey: hookMetadata.execHookWorkspaceRootsKey,
    }),
  },
  {
    name: "a context keeps a value under each of the four keys, apart from the others and from a key of the same name",
    run: ({ hookMetadata, context }) => {
      const keys = [hookMetadata.execHookConversationIdKey, hookMetadata.execHookGenerationIdKey, hookMetadata.execHookModelKey, hookMetadata.execHookWorkspaceRootsKey];
      const roots = ["/work/one", "/work/two"];
      const empty = context.createContext();
      const onlyModel = empty.with(hookMetadata.execHookModelKey, "a-model");
      const all = onlyModel.with(hookMetadata.execHookConversationIdKey, "conversation-1").with(hookMetadata.execHookGenerationIdKey, "generation-1").with(hookMetadata.execHookWorkspaceRootsKey, roots);
      const namesake = context.createKey(Symbol("execHookModel"), "the namesake's own default");
      return {
        differentSymbols: new Set(keys.map((key) => key.symbol)).size,
        nothingSet: keys.map((key) => empty.get(key)),
        onlyTheModelSet: keys.map((key) => onlyModel.get(key)),
        allSet: keys.map((key) => all.get(key)),
        theRootsAreTheListGiven: all.get(hookMetadata.execHookWorkspaceRootsKey) === roots,
        aKeyOfTheSameName: all.get(namesake),
      };
    },
  },

  // -------------------------------------------------------------------------
  // mcp-disk-catalog.ts
  // -------------------------------------------------------------------------
  {
    name: "the MCP catalogue on disk is a folder of servers with a folder of tools in each",
    run: ({ mcpDiskCatalog }) => ({ MCP_DISK_CATALOG_MCPS_DIR: mcpDiskCatalog.MCP_DISK_CATALOG_MCPS_DIR, MCP_DISK_CATALOG_TOOLS_DIR: mcpDiskCatalog.MCP_DISK_CATALOG_TOOLS_DIR }),
  },
  {
    name: "a tool's name is read from its definition: `name` when it is a text that is not empty, else `toolName` the same way, else nothing",
    run: ({ mcpDiskCatalog }) =>
      asked(
        [
          '{"name":"search"}',
          '{"toolName":"lookup"}',
          '{"name":"search","toolName":"lookup"}',
          '{"toolName":"lookup","name":"search"}',
          '{"name":"","toolName":"lookup"}',
          '{"name":"","toolName":""}',
          '{"name":""}',
          '{"toolName":""}',
          '{"name":" "}',
          '{"name":"  padded  ","toolName":"lookup"}',
          '{"name":5,"toolName":"lookup"}',
          '{"name":null,"toolName":"lookup"}',
          '{"name":["search"],"toolName":"lookup"}',
          '{"name":{"name":"inner"},"toolName":"lookup"}',
          '{"name":true}',
          '{"name":"search","toolName":7}',
          '{"toolName":7}',
          '{"toolName":null}',
          '{"Name":"search","tool_name":"lookup"}',
          '{"description":"no name at all"}',
          "{}",
          '  {"name":"spaced out"}\n',
          '{"name":"search","name":"the later one"}',
          '{"name":"\\u00e9t\\u00e9 \\ud83d\\ude00"}',
          '{"tool":{"name":"nested"}}',
          '{"__proto__":{"name":"inherited"}}',
          '{"__proto__":{"name":"inherited"},"toolName":"lookup"}',
        ],
        (text) => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(text),
      ),
  },
  {
    name: "a definition that is no JSON object gives nothing, whatever it is",
    run: ({ mcpDiskCatalog }) => ({
      texts: asked(
        ["", " ", "null", "true", "false", "0", "12", '"search"', '"{\\"name\\":\\"search\\"}"', "[]", '["search"]', '[{"name":"search"}]', "{", '{"name":"search"', "{name:'search'}", "{'name':'search'}", '{"name":"search"},', '{"name":"search"} trailing', "undefined", "NaN", '﻿{"name":"search"}'],
        (text) => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(text),
      ),
      // What is no text is read as JSON reads it: by the text it turns into.
      notTexts: {
        nothing: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson()),
        null: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(null)),
        aNumber: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(7)),
        anObject: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson({ name: "search" })),
        bytesOfADefinition: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(Buffer.from('{"name":"from bytes"}'))),
        anObjectThatTurnsIntoADefinition: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson({ toString: () => '{"toolName":"from toString"}' })),
        anObjectThatFailsToTurnIntoText: attempt(() =>
          mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson({
            toString: () => {
              throw new Error("no text");
            },
          }),
        ),
        aSymbol: attempt(() => mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(Symbol("search"))),
      },
      aLongName: mcpDiskCatalog.parseMcpToolNameFromDiskDefinitionJson(`{"name":"${"n".repeat(5000)}"}`).length,
    }),
  },

  // -------------------------------------------------------------------------
  // shell-hook-approval.ts
  // -------------------------------------------------------------------------
  {
    name: "a forced prompt is a requirement of the kind FORCE_PROMPT, with the reason when one is given",
    run: ({ shellHookApproval }) =>
      asked(["a hook asked for it", "", undefined, null], (reason) => {
        const requirement = shellHookApproval.createForcePromptHookApprovalRequirement(reason);
        return {
          type: typeOf(requirement),
          fields: Object.keys(requirement),
          kind: requirement.kind,
          reason: requirement.reason,
          asJson: requirement.toJson(),
          onTheWire: requirement.toBinary(),
        };
      }),
  },
  {
    name: "each forced prompt is a requirement of its own",
    run: ({ shellHookApproval }) => {
      const first = shellHookApproval.createForcePromptHookApprovalRequirement("once");
      const second = shellHookApproval.createForcePromptHookApprovalRequirement("once");
      return { different: first !== second, equal: first.equals(second), sameType: first.constructor === second.constructor };
    },
  },
  {
    name: "setting a requirement puts a new message on the arguments, made from what was given; setting none leaves the field there with nothing in it",
    run: ({ shellHookApproval }) => {
      const forced = shellHookApproval.createForcePromptHookApprovalRequirement("forced");
      const put = (args, requirement) => {
        const answered = shellHookApproval.setShellHookApprovalRequirement(args, requirement);
        const now = args.hookApprovalRequirement;
        return {
          answered,
          fields: Object.keys(args),
          type: typeOf(now),
          requirement: now === undefined ? undefined : { fields: Object.keys(now), kind: now.kind, reason: now.reason },
          isWhatWasGiven: now === requirement,
        };
      };
      const sameArgs = { command: "ls" };
      return {
        nothingOnEmptyArguments: put({}, undefined),
        nothingOverARequirement: put({ hookApprovalRequirement: forced, command: "ls" }, undefined),
        anEmptyObject: put({}, {}),
        aKindOnly: put({}, { kind: 1 }),
        aReasonOnly: put({}, { reason: "why" }),
        aKindAndAReason: put({ command: "ls" }, { kind: 1, reason: "why" }),
        aKindThatIsNoKind: put({}, { kind: 7, reason: "" }),
        fieldsThatAreNotARequirements: put({}, { kind: 1, other: "dropped" }),
        aRequirementItself: put({}, forced),
        theRequirementGivenIsLeftAsItWas: { kind: forced.kind, reason: forced.reason },
        oneAfterAnother: [put(sameArgs, { kind: 1, reason: "first" }), put(sameArgs, { reason: "second" }), put(sameArgs, undefined), put(sameArgs, forced)],
        null: attempt(() => put({}, null)),
        argumentsThatAreNothing: attempt(() => shellHookApproval.setShellHookApprovalRequirement(undefined, { kind: 1 })),
        argumentsThatAreNothingAndNoRequirement: attempt(() => shellHookApproval.setShellHookApprovalRequirement(undefined, undefined)),
        frozenArguments: attempt(() => put(Object.freeze({}), { kind: 1 })),
      };
    },
  },
  {
    name: "getting the requirement reads the field as it is",
    run: ({ shellHookApproval }) => {
      const forced = shellHookApproval.createForcePromptHookApprovalRequirement("forced");
      const args = {};
      shellHookApproval.setShellHookApprovalRequirement(args, forced);
      const inherited = Object.create({ hookApprovalRequirement: forced });
      return {
        noField: shellHookApproval.getShellHookApprovalRequirement({}),
        afterSettingNone: shellHookApproval.getShellHookApprovalRequirement({ hookApprovalRequirement: undefined }),
        theVeryMessageOnTheArguments: shellHookApproval.getShellHookApprovalRequirement(args) === args.hookApprovalRequirement,
        notTheOneHandedToSet: shellHookApproval.getShellHookApprovalRequirement(args) === forced,
        whateverIsThere: [shellHookApproval.getShellHookApprovalRequirement({ hookApprovalRequirement: "a text" }), shellHookApproval.getShellHookApprovalRequirement({ hookApprovalRequirement: null }), shellHookApproval.getShellHookApprovalRequirement({ hookApprovalRequirement: 0 })],
        aFieldFromThePrototype: shellHookApproval.getShellHookApprovalRequirement(inherited) === forced,
        argumentsThatAreNothing: [attempt(() => shellHookApproval.getShellHookApprovalRequirement(undefined)), attempt(() => shellHookApproval.getShellHookApprovalRequirement(null))],
        aText: shellHookApproval.getShellHookApprovalRequirement("text"),
      };
    },
  },

  // -------------------------------------------------------------------------
  // wakeup/index.ts
  // -------------------------------------------------------------------------
  {
    name: "a wakeup with no group goes to the end of the queue as a copy, and the queue given is left as it was",
    run: ({ wakeup }) => {
      const queued = [wake("c1", "w1"), wake("c2", "w2", { groupKey: "g" })];
      const queue = Object.freeze([...queued]);
      const incoming = Object.freeze(wake("c1", "w3", { payload: { nested: true }, source: "shell" }));
      const merged = wakeup.mergeWakeup(queue, incoming);
      return {
        fields: Object.keys(merged),
        queue: merged.queue,
        aNewQueue: merged.queue !== queue,
        theQueuedOnesThemselves: merged.queue[0] === queued[0] && merged.queue[1] === queued[1],
        theIncomingIsCopied: merged.queue[2] !== incoming,
        itsPayloadIsNot: merged.queue[2].payload === incoming.payload,
        theQueueGiven: told(queue),
        intoAnEmptyQueue: wakeup.mergeWakeup([], wake("c1", "w1")),
      };
    },
  },
  {
    name: "a wakeup already queued for its conversation under its id changes nothing: a copy of the queue comes back, even where its group is queued too",
    run: ({ wakeup }) => {
      const queued = [wake("c1", "w1", { groupKey: "g" }), wake("c1", "w2", { groupKey: "h" }), wake("c2", "w3")];
      const again = wakeup.mergeWakeup(queued, wake("c1", "w1", { payload: "the newer one" }));
      const againInAnotherGroup = wakeup.mergeWakeup(queued, wake("c1", "w1", { groupKey: "h", payload: "the newer one" }));
      return {
        again: { fields: Object.keys(again), queue: told(again.queue), aNewQueue: again.queue !== queued, theQueuedOnesThemselves: again.queue.every((entry, at) => entry === queued[at]) },
        againInAnotherGroup: { fields: Object.keys(againInAnotherGroup), queue: told(againInAnotherGroup.queue) },
        theSameIdInAnotherConversation: told(wakeup.mergeWakeup(queued, wake("c2", "w1")).queue),
        anIdThatDiffersBySpaces: told(wakeup.mergeWakeup(queued, wake("c1", " w1 ")).queue),
        anIdOfAnotherKind: told(wakeup.mergeWakeup([wake("c1", 1)], wake("c1", "1")).queue),
      };
    },
  },
  {
    name: "a wakeup of a group takes the place of the queued one of that group in its conversation, which is handed back",
    run: ({ wakeup }) => {
      const queued = [wake("c1", "w1"), wake("c1", "w2", { groupKey: "g" }), wake("c2", "w3", { groupKey: "g" }), wake("c1", "w4", { groupKey: "g" })];
      const incoming = wake("c1", "w5", { groupKey: "g", source: "shell" });
      const merged = wakeup.mergeWakeup(queued, incoming);
      const elsewhere = wakeup.mergeWakeup(queued, wake("c3", "w5", { groupKey: "g" }));
      const otherGroup = wakeup.mergeWakeup(queued, wake("c1", "w5", { groupKey: "G" }));
      return {
        fields: Object.keys(merged),
        queue: merged.queue,
        replaced: merged.replaced,
        theReplacedIsTheQueuedOneItself: merged.replaced === queued[1],
        theIncomingIsCopied: merged.queue[1] !== incoming,
        onlyTheFirstOfTheGroupGivesWay: told(merged.queue),
        theQueueGiven: told(queued),
        aGroupOfAnotherConversation: { fields: Object.keys(elsewhere), queue: told(elsewhere.queue) },
        aGroupSpelledOtherwise: { fields: Object.keys(otherGroup), queue: told(otherGroup.queue) },
      };
    },
  },
  {
    name: "a group is any value but undefined: null, the empty text and zero are groups of their own",
    run: ({ wakeup }) => {
      const queued = [wake("c1", "none"), wake("c1", "null", { groupKey: null }), wake("c1", "empty", { groupKey: "" }), wake("c1", "zero", { groupKey: 0 }), wake("c1", "undefined", { groupKey: undefined })];
      return asked([undefined, null, "", 0, "0", false, Number.NaN], (groupKey) => {
        const merged = wakeup.mergeWakeup(queued, wake("c1", "incoming", { groupKey }));
        return { queue: told(merged.queue), replaced: merged.replaced?.payload };
      });
    },
  },
  {
    name: "a queued wakeup that is found and is gone when the queue is copied is not handed back",
    run: ({ wakeup }) => {
      // A queue whose only place answers the two searches and is empty at the third look, when the queue is copied.
      const queued = wake("c1", "w1", { groupKey: "g" });
      let looks = 0;
      const queue = [];
      Object.defineProperty(queue, 0, {
        enumerable: true,
        configurable: true,
        get: () => {
          looks += 1;
          return looks <= 2 ? queued : undefined;
        },
      });
      const merged = wakeup.mergeWakeup(queue, wake("c1", "w2", { groupKey: "g" }));
      return { looks, fields: Object.keys(merged), queue: merged.queue };
    },
  },
  {
    name: "a queue or a wakeup that is not one fails as JavaScript fails",
    run: ({ wakeup }) => ({
      noQueue: attempt(() => wakeup.mergeWakeup(undefined, wake("c1", "w1"))),
      noWakeup: attempt(() => wakeup.mergeWakeup([], undefined)),
      noWakeupAndAQueue: attempt(() => wakeup.mergeWakeup([wake("c1", "w1")], undefined)),
      aHoleInTheQueueAndNoGroup: attempt(() => wakeup.mergeWakeup([, wake("c1", "w1")], wake("c1", "w2")).queue.map((entry) => entry?.payload)),
      aHoleInTheQueueAndAGroup: attempt(() => wakeup.mergeWakeup([, wake("c1", "w1")], wake("c1", "w2", { groupKey: "g" }))),
      aWakeupThatIsAText: attempt(() => wakeup.mergeWakeup([], "wakeup")),
    }),
  },

  // -------------------------------------------------------------------------
  // background-work-registry.ts: the work
  // -------------------------------------------------------------------------
  {
    name: "wakeups that name no conversation of their own go to the conversation called local",
    run: ({ backgroundWork }) => backgroundWork.LEGACY_LOCAL_WAKEUP_CONVERSATION_ID,
  },
  {
    name: "a new registry holds no work and no wakeups, in two fields, and has sixteen methods",
    run: (loaded) => {
      const registry = registryOf(loaded);
      return {
        fields: Object.keys(registry),
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(registry)).sort(),
        work: registry.listWork(),
        running: registry.hasRunningWork(),
        queue: queueOf(registry, "local"),
        drained: registry.drainCompletions(),
        pulled: registry.pull("local"),
        acknowledged: registry.ack(["nothing"]),
        abortedAll: registry.abortAllWork(),
        anotherRegistryIsApart: (() => {
          const other = registryOf(loaded);
          other.upsertWork(work("a"));
          other.enqueue(wake("c1", "w1"));
          return { work: registry.listWork().length, queue: queueOf(registry) };
        })(),
      };
    },
  },
  {
    name: "work is kept under its id: a later record takes the earlier one's place in the list, and a snapshot has six fields whatever the record had",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const metadata = { note: "kept as given" };
      const answered = registry.upsertWork(work("a", { ownerId: "o1", metadata, abort: () => {} }));
      registry.upsertWork({ id: "b", kind: "subagent", state: "queued" });
      registry.upsertWork(work("c", { abort: "not a function", metadata: 0, extra: "not in a snapshot" }));
      const first = registry.listWork();
      registry.upsertWork(work("a", { state: "done", ownerId: undefined, metadata: null }));
      const kept = work("d");
      registry.upsertWork(kept);
      kept.state = "changed after it was handed over";
      return {
        answered,
        first,
        fields: first.map((snapshot) => Object.keys(snapshot)),
        metadataIsTheObjectGiven: first[0].metadata === metadata,
        aNewListEachTime: registry.listWork() !== registry.listWork(),
        afterALaterRecordForA: registry.listWork(),
      };
    },
  },
  {
    name: "a filter keeps the work whose kind, state and owner are the ones it names; an empty name, or none, asks for nothing",
    run: (loaded) => {
      const registry = registryOf(loaded);
      for (const record of FIVE_RECORDS) registry.upsertWork(record);
      return asked(
        [
          undefined,
          null,
          {},
          { kind: "shell" },
          { kind: "subagent" },
          { kind: "Shell" },
          { kind: "" },
          { kind: undefined },
          { state: "running" },
          { state: "done" },
          { state: "" },
          { ownerId: "o1" },
          { ownerId: "o2" },
          { ownerId: "" },
          { ownerId: "nobody" },
          { kind: "shell", state: "running" },
          { kind: "shell", state: "done", ownerId: "o2" },
          { kind: "shell", state: "done", ownerId: "o1" },
          { kind: "subagent", ownerId: "o1" },
          { kind: "subagent", state: "running", ownerId: "" },
          { id: "a" },
          0,
          "",
          "shell",
        ],
        (filter) => ({ listed: registry.listWork(filter).map((snapshot) => snapshot.id), running: registry.hasRunningWork(filter) }),
      );
    },
  },
  {
    name: "work runs when its state is the word running, spelled so",
    run: (loaded) =>
      asked(["running", "Running", " running", "run", "done", "", undefined], (state) => {
        const registry = registryOf(loaded);
        registry.upsertWork(work("a", { state }));
        return { any: registry.hasRunningWork(), ofItsKind: registry.hasRunningWork({ kind: "shell" }), ofAnotherKind: registry.hasRunningWork({ kind: "subagent" }), inItsOwnState: registry.hasRunningWork({ state }) };
      }),
  },
  {
    name: "clearing work forgets it and says whether it was there; the id is taken as it is",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      registry.upsertWork(work("a", { abort: () => calls.push("a") }));
      registry.upsertWork(work("b"));
      return {
        unknown: registry.clearWork("x"),
        withSpaces: registry.clearWork(" a "),
        known: registry.clearWork("a"),
        again: registry.clearWork("a"),
        left: registry.listWork().map((snapshot) => snapshot.id),
        abortCalls: calls,
      };
    },
  },
  {
    name: "aborting work calls its abort as the record's own, forgets it and says yes; work that is not there says no",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      const record = work("a", {
        abort(...given) {
          calls.push({ onTheRecord: this === record, given });
          return "what abort answered";
        },
      });
      registry.upsertWork(record);
      registry.upsertWork(work("b"));
      registry.upsertWork(work("c", { abort: null }));
      registry.upsertWork(work("d", { abort: 0 }));
      return {
        unknown: registry.abortWork("x"),
        withAnAbort: registry.abortWork("a"),
        again: registry.abortWork("a"),
        withoutOne: registry.abortWork("b"),
        withNull: registry.abortWork("c"),
        withZero: registry.abortWork("d"),
        calls,
        left: registry.listWork(),
      };
    },
  },
  {
    name: "work whose abort throws stays, and the failure comes out as it was thrown",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const failure = new Error("could not stop");
      registry.upsertWork(
        work("a", {
          abort: () => {
            throw failure;
          },
        }),
      );
      registry.upsertWork(work("b", { abort: "not a function" }));
      let thrown;
      try {
        registry.abortWork("a");
      } catch (error) {
        thrown = error;
      }
      return { theFailureItself: thrown === failure, anAbortThatIsNoFunction: attempt(() => registry.abortWork("b")), left: registry.listWork().map((snapshot) => snapshot.id) };
    },
  },
  {
    name: "aborting all work aborts what the filter keeps, in the order it was first added, and counts it; the rest stays",
    run: (loaded) => {
      const everything = () => {
        const registry = registryOf(loaded);
        const calls = [];
        for (const record of FIVE_RECORDS) registry.upsertWork({ ...record, ...(record.id === "d" ? {} : { abort: () => calls.push(record.id) }) });
        return { registry, calls };
      };
      return asked([undefined, {}, { kind: "subagent" }, { state: "running" }, { ownerId: "o1" }, { kind: "shell", state: "done" }, { kind: "nothing of the kind" }, { kind: "" }], (filter) => {
        const { registry, calls } = everything();
        const count = registry.abortAllWork(filter);
        return { count, calls, left: registry.listWork().map((snapshot) => snapshot.id), again: registry.abortAllWork(filter) };
      });
    },
  },
  {
    name: "an abort that throws stops the aborting of all work where it is: what came before is gone, it and what comes after stay",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      const failure = new Error("could not stop");
      registry.upsertWork(work("a", { abort: () => calls.push("a") }));
      registry.upsertWork(
        work("b", {
          abort: () => {
            calls.push("b");
            throw failure;
          },
        }),
      );
      registry.upsertWork(work("c", { abort: () => calls.push("c") }));
      let thrown;
      try {
        registry.abortAllWork();
      } catch (error) {
        thrown = error;
      }
      return { theFailureItself: thrown === failure, calls, left: registry.listWork().map((snapshot) => snapshot.id) };
    },
  },
  {
    name: "work added or cleared by an abort while all work is aborted: what was there at the start is aborted and counted, what is added stays",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      registry.upsertWork(
        work("a", {
          abort: () => {
            calls.push("a");
            registry.clearWork("b");
            registry.upsertWork(work("late", { abort: () => calls.push("late") }));
            registry.upsertWork(work("c", { state: "replaced while aborting", abort: () => calls.push("the later c") }));
          },
        }),
      );
      registry.upsertWork(work("b", { abort: () => calls.push("b") }));
      registry.upsertWork(work("c", { abort: () => calls.push("the earlier c") }));
      return { count: registry.abortAllWork(), calls, left: registry.listWork() };
    },
  },
  {
    name: "while all work is aborted the filter is asked of each record when its turn comes: one that an earlier abort changed is judged as changed",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      const second = work("b", { abort: () => calls.push("b") });
      const third = work("c", { state: "done", abort: () => calls.push("c") });
      registry.upsertWork(
        work("a", {
          abort: () => {
            calls.push("a");
            second.state = "done";
            third.state = "running";
          },
        }),
      );
      registry.upsertWork(second);
      registry.upsertWork(third);
      return { count: registry.abortAllWork({ state: "running" }), calls, left: registry.listWork().map((snapshot) => snapshot.id) };
    },
  },
  {
    name: "work whose record changes its id after it was handed over is still kept under the first id",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      const record = work("a", { abort: () => calls.push("a") });
      registry.upsertWork(record);
      record.id = "renamed";
      const listed = registry.listWork().map((snapshot) => snapshot.id);
      const allAborted = registry.abortAllWork();
      const stillListed = registry.listWork().map((snapshot) => snapshot.id);
      return { listed, allAborted, stillListed, byTheNewId: registry.abortWork("renamed"), byTheFirstId: registry.abortWork("a"), calls, left: registry.listWork().length };
    },
  },
  {
    name: "work whose id is no text is forgotten, and then the call fails as JavaScript fails",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const calls = [];
      for (const id of [7, 8, 9]) registry.upsertWork(work(id, { abort: () => calls.push(id) }));
      return {
        cleared: attempt(() => registry.clearWork(7)),
        aborted: attempt(() => registry.abortWork(8)),
        allAborted: attempt(() => registry.abortAllWork()),
        unknownCleared: attempt(() => registry.clearWork(1)),
        unknownAborted: attempt(() => registry.abortWork(1)),
        calls,
        left: registry.listWork().map((snapshot) => snapshot.id),
      };
    },
  },

  // -------------------------------------------------------------------------
  // background-work-registry.ts: the wakeups
  // -------------------------------------------------------------------------
  {
    name: "a wakeup is queued once for its conversation and id, the id without the spaces around it; one whose id is empty is dropped",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const steps = [];
      const step = (label, wakeup) => {
        const answered = registry.enqueue(wakeup);
        steps.push([label, { answered, ...queueOf(registry, "c1", "c2") }]);
      };
      const given = wake("c1", "  w1\t", { source: "shell", extra: { kept: true } });
      step("the first", given);
      step("the same again", wake("c1", "w1", { payload: "the second try" }));
      step("the same with spaces", wake("c1", " w1 ", { payload: "the third try" }));
      step("an empty id", wake("c1", ""));
      step("an id of spaces", wake("c1", " \n\t "));
      step("the same id in another conversation", wake("c2", "w1"));
      step("another id", wake("c1", "W1"));
      const pulled = registry.pull("c1");
      return {
        steps,
        pulled,
        fields: pulled.map((wakeup) => Object.keys(wakeup)),
        theGivenWakeupIsLeftAsItWas: given.id,
        notTheGivenWakeupItself: pulled[0] !== given,
        itsExtraIsTheObjectGiven: pulled[0].extra === given.extra,
        theOtherConversations: registry.pull("c2"),
      };
    },
  },
  {
    name: "pulling hands over a conversation's wakeups in the order queued, as copies, and leaves the other conversations' waiting",
    run: (loaded) => {
      const registry = registryOf(loaded);
      for (const wakeup of [wake("c1", "a"), wake("c2", "b"), wake("c1", "c"), wake("c3", "d"), wake("c1", "e")]) registry.enqueue(wakeup);
      const before = queueOf(registry, "c1", "c2", "c3", "c4");
      const first = registry.pull("c1");
      const firstTold = told(first);
      const afterFirst = queueOf(registry, "c1", "c2", "c3");
      const again = registry.pull("c1");
      const unknown = registry.pull("c4");
      const afterNothingPulled = queueOf(registry, "c1", "c2", "c3");
      first[0].payload = "changed by the one who pulled";
      return {
        before,
        first: firstTold,
        afterFirst,
        again,
        unknown,
        afterNothingPulled,
        theKeptOneIsNotTheCopyHandedOver: told(registry.ack(["a"])),
        then: [told(registry.pull("c3")), told(registry.pull("c2")), queueOf(registry, "c1", "c2", "c3")],
      };
    },
  },
  {
    name: "a wakeup that was pulled cannot be queued again until it is acknowledged; acknowledging hands back what was pulled and changes no count",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a"));
      const pulled = registry.pull("c1");
      const afterPull = queueOf(registry, "c1");
      registry.enqueue(wake("c1", "a", { payload: "too early" }));
      const refused = queueOf(registry, "c1");
      const acknowledged = registry.ack(["a"]);
      const afterAck = queueOf(registry, "c1");
      registry.enqueue(wake("c1", "a", { payload: "after the acknowledgement" }));
      return { pulled, afterPull, refused, acknowledged, afterAck, queuedAgain: queueOf(registry, "c1"), pulledAgain: told(registry.pull("c1")), acknowledgedTwice: [told(registry.ack(["a"])), told(registry.ack(["a"]))] };
    },
  },
  {
    name: "acknowledging takes ids without the spaces around them, in the order asked, and passes over unknown ids, repeats and wakeups still waiting",
    run: (loaded) => {
      const registry = registryOf(loaded);
      for (const id of ["a", "b", "c", "d"]) registry.enqueue(wake("c1", id));
      registry.pull("c1");
      registry.enqueue(wake("c1", "waiting"));
      const first = registry.ack([" c ", "unknown", "a", "c", "waiting", "\ta\n"]);
      const none = registry.ack([]);
      const rest = registry.ack(new Set(["d", "b"]));
      return {
        first: told(first),
        fields: first.map((wakeup) => Object.keys(wakeup)),
        none,
        rest: told(rest),
        nothingLeft: told(registry.ack(["a", "b", "c", "d"])),
        queue: queueOf(registry, "c1"),
        stillWaiting: told(registry.pull("c1")),
        idsThatAreNoTexts: attempt(() => registry.ack(["waiting", 7, "never reached"])),
        afterThat: told(registry.ack(["waiting"])),
        noList: attempt(() => registry.ack(undefined)),
      };
    },
  },
  {
    name: "refusing pulled wakeups without putting them back forgets them: they can be queued again, and no count changes",
    run: (loaded) => {
      const registry = registryOf(loaded);
      for (const id of ["a", "b", "c"]) registry.enqueue(wake("c1", id));
      registry.pull("c1");
      const before = queueOf(registry, "c1");
      const answered = registry.nack([" b ", "unknown", "a"], { requeue: false });
      const after = queueOf(registry, "c1");
      registry.enqueue(wake("c1", "a", { payload: "a, queued again" }));
      registry.enqueue(wake("c1", "c", { payload: "c, still pulled" }));
      return {
        answered,
        before,
        after,
        acknowledgingThemFindsNothing: told(registry.ack(["a", "b"])),
        queuedAgain: queueOf(registry, "c1"),
        pulled: told(registry.pull("c1")),
        theOneLeftPulled: told(registry.ack(["c"])),
        aFalsyAnswerCountsAsNo: (() => {
          registry.enqueue(wake("c1", "z"));
          registry.pull("c1");
          registry.nack(["z"], { requeue: 0 });
          return { queue: queueOf(registry, "c1"), acknowledged: told(registry.ack(["z"])) };
        })(),
      };
    },
  },
  {
    name: "refusing pulled wakeups and putting them back sets them in front of what was queued since, in the order they were pulled",
    run: (loaded) => {
      const registry = registryOf(loaded);
      for (const id of ["a", "b", "c"]) registry.enqueue(wake("c1", id));
      registry.enqueue(wake("c2", "x"));
      registry.pull("c1");
      registry.pull("c2");
      registry.enqueue(wake("c1", "d"));
      registry.enqueue(wake("c2", "y"));
      const before = queueOf(registry, "c1", "c2");
      const answered = registry.nack(["c", " a ", "unknown", "x"], { requeue: true });
      const after = queueOf(registry, "c1", "c2");
      registry.enqueue(wake("c1", "a", { payload: "a second a" }));
      const stillOnce = queueOf(registry, "c1", "c2");
      const unknownOnly = registry.nack(["unknown"], { requeue: true });
      const none = registry.nack([], { requeue: true });
      const unchanged = queueOf(registry, "c1", "c2");
      return {
        answered,
        before,
        after,
        stillOnce,
        unknownOnly,
        none,
        unchanged,
        c1: told(registry.pull("c1")),
        c2: told(registry.pull("c2")),
        theOneNeverRefused: told(registry.ack(["b"])),
        aTruthyAnswerCountsAsYes: (() => {
          registry.nack(["a"], { requeue: "yes" });
          return told(registry.pull("c1"));
        })(),
        noAnswer: attempt(() => registry.nack(["a"])),
        afterNoAnswer: (() => {
          const acknowledged = told(registry.ack(["a"]));
          const before = registry.getWakeupRevision();
          registry.enqueue(wake("c1", "a", { payload: "a, after the failure" }));
          return { acknowledged, queuedAgain: registry.getWakeupRevision() - before };
        })(),
        idsThatAreNoTexts: attempt(() => registry.nack([7], { requeue: true })),
      };
    },
  },
  {
    name: "a wakeup of a group takes the place of the one of that group waiting in its conversation, whose id can then be queued again",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const steps = [];
      const step = (label, wakeup) => {
        registry.enqueue(wakeup);
        steps.push([label, queueOf(registry).revision]);
      };
      step("a, of the group g", wake("c1", "a", { groupKey: "g" }));
      step("b, between", wake("c1", "b"));
      step("c, of the group g in another conversation", wake("c2", "c", { groupKey: "g" }));
      step("d, of the group g: a gives way", wake("c1", "d", { groupKey: "g" }));
      step("a again, with no group", wake("c1", "a", { payload: "a, with no group" }));
      step("d again: refused, it waits", wake("c1", "d", { groupKey: "g", payload: "a second d" }));
      step("e, of the group h", wake("c1", "e", { groupKey: "h" }));
      return { steps, c1: registry.pull("c1"), c2: told(registry.pull("c2")) };
    },
  },
  {
    name: "a group is taken only from what waits: a pulled wakeup keeps its place until it is put back, and then gives way to the newer one of its group",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a", { groupKey: "g" }));
      registry.enqueue(wake("c1", "b"));
      registry.pull("c1");
      registry.enqueue(wake("c1", "c", { groupKey: "g" }));
      registry.enqueue(wake("c1", "d"));
      const before = queueOf(registry, "c1");
      registry.nack(["a", "b"], { requeue: true });
      const after = queueOf(registry, "c1");
      registry.enqueue(wake("c1", "a", { payload: "a, free again" }));
      const freed = queueOf(registry, "c1");
      return { before, after, freed, pulled: told(registry.pull("c1")) };
    },
  },
  {
    name: "suppressing an id drops it from what waits and from what was pulled, in its conversation only, and keeps it out",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const steps = [];
      const step = (label, act) => steps.push([label, { answered: act(), ...queueOf(registry, "c1", "c2") }]);
      step("three queued", () => {
        registry.enqueue(wake("c1", "a"));
        registry.enqueue(wake("c1", "b"));
        registry.enqueue(wake("c2", "a"));
      });
      step("a suppressed in c1, with spaces", () => registry.suppress("c1", " a "));
      step("a suppressed in c1 again", () => registry.suppress("c1", "a"));
      step("a queued in c1: refused", () => registry.enqueue(wake("c1", "a")));
      step("an unknown id suppressed", () => registry.suppress("c1", "never seen"));
      step("that id queued: refused", () => registry.enqueue(wake("c1", "never seen")));
      step("that id queued in c2", () => registry.enqueue(wake("c2", "never seen")));
      step("an empty id suppressed", () => registry.suppress("c1", "  "));
      step("c1 pulled", () => told(registry.pull("c1")));
      step("b suppressed while pulled", () => registry.suppress("c1", "b"));
      step("b acknowledged: no longer pulled", () => told(registry.ack(["b"])));
      step("b put back: nothing to put back", () => registry.nack(["b"], { requeue: true }));
      step("b queued: refused", () => registry.enqueue(wake("c1", "b")));
      step("c2 pulled", () => told(registry.pull("c2")));
      step("a suppressed in c1 while c2's is pulled", () => registry.suppress("c1", "a"));
      step("c2's a acknowledged", () => told(registry.ack(["a"])));
      return { steps, noId: attempt(() => registry.suppress("c1", undefined)) };
    },
  },
  {
    name: "clearing or aborting work lets its id be queued again in every conversation; aborting work that is not there does not",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const waits = () => ["c1", "c2"].map((conversation) => {
        const before = registry.getWakeupRevision();
        registry.enqueue(wake(conversation, "t"));
        const queued = registry.getWakeupRevision() !== before;
        registry.pull(conversation);
        registry.ack(["t"]);
        return queued ? "queued" : "refused";
      });
      const suppressBoth = () => {
        registry.suppress("c1", "t");
        registry.suppress("c2", "t");
      };
      const steps = [];
      suppressBoth();
      steps.push(["suppressed in both", waits()]);
      steps.push(["aborted, not there", registry.abortWork("t"), waits()]);
      steps.push(["cleared, not there", registry.clearWork("t"), waits()]);
      suppressBoth();
      steps.push(["cleared with spaces around the id, not there", registry.clearWork(" t\n"), waits()]);
      suppressBoth();
      registry.upsertWork(work("t"));
      steps.push(["aborted, there", registry.abortWork("t"), waits()]);
      suppressBoth();
      registry.upsertWork(work("t"));
      registry.upsertWork(work("u"));
      steps.push(["all aborted but t", registry.abortAllWork({ kind: "nothing of the kind" }), waits()]);
      steps.push(["all aborted", registry.abortAllWork(), waits()]);
      registry.suppress("c1", "t");
      steps.push(["suppressed in c1 only, another id cleared", registry.clearWork("u"), waits()]);
      return { steps, revision: registry.getWakeupRevision() };
    },
  },
  {
    name: "what was pulled is kept under its id alone: of two conversations' wakeups with one id, the later pull hides the earlier, which can never be queued again",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "same"));
      registry.enqueue(wake("c2", "same"));
      const pulled = [told(registry.pull("c1")), told(registry.pull("c2"))];
      const acknowledged = told(registry.ack(["same"]));
      const again = told(registry.ack(["same"]));
      const before = registry.getWakeupRevision();
      registry.enqueue(wake("c2", "same"));
      const c2Queued = registry.getWakeupRevision() - before;
      registry.enqueue(wake("c1", "same"));
      const c1Queued = registry.getWakeupRevision() - before - c2Queued;
      registry.nack(["same"], { requeue: false });
      registry.suppress("c1", "same");
      registry.clearWork("same");
      const afterEverything = registry.getWakeupRevision();
      registry.enqueue(wake("c1", "same"));
      return { pulled, acknowledged, again, c2Queued, c1Queued, c1QueuedAfterEverything: registry.getWakeupRevision() - afterEverything, waiting: told(registry.pull("c2")), c1: told(registry.pull("c1")) };
    },
  },
  {
    name: "putting back two pulled wakeups keeps the place each first took among the pulled",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a"));
      registry.enqueue(wake("c2", "b"));
      registry.enqueue(wake("c1", "c"));
      registry.pull("c2");
      registry.pull("c1");
      registry.nack(["c", "b", "a"], { requeue: true });
      const all = registry.drainCompletions();
      return { all };
    },
  },
  {
    name: "a later pull of an id takes the earlier one's place among the pulled",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "same"));
      registry.enqueue(wake("c1", "y"));
      registry.enqueue(wake("c2", "same"));
      registry.pull("c1");
      registry.pull("c2");
      registry.nack(["y", "same"], { requeue: true });
      return { waiting: [registry.hasPendingCompletions("c1"), registry.hasPendingCompletions("c2")], all: registry.drainCompletions() };
    },
  },
  {
    name: "whether anything waits is asked of every conversation when none is named, else of the one named, whatever it is",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const ask = () => asked([undefined, "c1", "c2", "", null, "C1", " c1"], (conversation) => registry.hasPendingCompletions(conversation));
      const empty = ask();
      registry.enqueue(wake("c1", "a"));
      const queued = ask();
      registry.pull("c1");
      return { empty, queued, pulled: ask() };
    },
  },
  {
    name: "a conversation and an id are remembered as one text: two pairs that make the same text count as one wakeup",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("a\0b", "c"));
      const first = registry.getWakeupRevision();
      registry.enqueue(wake("a", "b\0c"));
      const second = registry.getWakeupRevision();
      registry.enqueue(wake("a", "b"));
      return { first, second, third: registry.getWakeupRevision(), waiting: [registry.hasPendingCompletions("a\0b"), registry.hasPendingCompletions("a")] };
    },
  },
  {
    name: "a wakeup that is not one fails as JavaScript fails, and leaves the queue as it was",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a"));
      return {
        noWakeup: attempt(() => registry.enqueue(undefined)),
        noId: attempt(() => registry.enqueue({ conversationId: "c1", payload: "no id" })),
        anIdThatIsANumber: attempt(() => registry.enqueue({ conversationId: "c1", id: 7, payload: "a number" })),
        noConversation: attempt(() => registry.enqueue({ id: "b", payload: "no conversation" })),
        queue: queueOf(registry, "c1", "undefined"),
        theOneWithNoConversation: registry.pull(undefined),
        c1: told(registry.pull("c1")),
      };
    },
  },
  {
    name: "a conversation that has no name is a conversation like another",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const steps = [];
      const step = (label, act) => steps.push([label, { answered: act(), revision: registry.getWakeupRevision(), waiting: registry.hasPendingCompletions() }]);
      step("an id nobody has is suppressed in it", () => registry.suppress(undefined, "x"));
      step("that id is queued in it: refused", () => registry.enqueue({ id: "x", payload: "x" }));
      step("another id is queued in it", () => registry.enqueue({ id: "y", payload: "y" }));
      step("and the same in the conversation named undefined: refused", () => registry.enqueue({ conversationId: "undefined", id: "y", payload: "y, by name" }));
      step("it is pulled by the name undefined", () => told(registry.pull("undefined")));
      step("it is pulled", () => told(registry.pull(undefined)));
      step("y is suppressed in it while pulled", () => registry.suppress(undefined, "y"));
      step("y is acknowledged", () => told(registry.ack(["y"])));
      return steps;
    },
  },

  // -------------------------------------------------------------------------
  // background-work-registry.ts: completions
  // -------------------------------------------------------------------------
  {
    name: "a completion is a wakeup of the conversation local, under its task's id, with the completion itself as payload and its kind as source",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const item = { taskId: " t1 ", kind: "shell", exitCode: 0 };
      const answered = registry.enqueueCompletion(item);
      registry.enqueueCompletion({ taskId: "t1", kind: "shell", exitCode: 1 });
      registry.enqueueCompletion({ taskId: "t2" });
      const queue = queueOf(registry, "local", "t1");
      const pulled = registry.pull("local");
      return { answered, queue, pulled, fields: pulled.map((wakeup) => Object.keys(wakeup)), thePayloadIsTheCompletionGiven: pulled[0].payload === item, noTask: attempt(() => registry.enqueueCompletion({ kind: "shell" })), noCompletion: attempt(() => registry.enqueueCompletion(undefined)) };
    },
  },
  {
    name: "draining hands over the payloads of everything that waits, a conversation at a time in the order each first waits, and acknowledges it all",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a"));
      registry.enqueueCompletion({ taskId: "t1", kind: "shell" });
      registry.enqueue(wake("c2", "b"));
      registry.enqueue(wake("c1", "c"));
      registry.enqueueCompletion({ taskId: "t2", kind: "subagent" });
      registry.enqueue({ conversationId: "c2", id: "no payload" });
      const before = queueOf(registry, "c1", "c2", "local");
      const drained = registry.drainCompletions();
      const after = queueOf(registry, "c1", "c2", "local");
      const again = registry.drainCompletions();
      const afterNothing = queueOf(registry);
      registry.enqueue(wake("c1", "a", { payload: "a, after the drain" }));
      return { before, drained, after, again, afterNothing, nothingIsLeftPulled: told(registry.ack(["a", "t1", "b", "c", "t2"])).length, queuedAgain: registry.drainCompletions() };
    },
  },
  {
    name: "draining leaves what was already pulled as it was",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "a"));
      registry.pull("c1");
      registry.enqueue(wake("c1", "b"));
      return { drained: registry.drainCompletions(), stillPulled: told(registry.ack(["a"])) };
    },
  },
  {
    name: "draining two conversations' wakeups of one id acknowledges the later one only: the earlier one's id can never be queued again",
    run: (loaded) => {
      const registry = registryOf(loaded);
      registry.enqueue(wake("c1", "same"));
      registry.enqueue(wake("c2", "same"));
      const drained = registry.drainCompletions();
      const before = registry.getWakeupRevision();
      registry.enqueue(wake("c1", "same"));
      const c1Queued = registry.getWakeupRevision() - before;
      registry.enqueue(wake("c2", "same"));
      return { drained, c1Queued, c2Queued: registry.getWakeupRevision() - before - c1Queued, drainedAgain: registry.drainCompletions() };
    },
  },
  {
    name: "the registry's own methods go through one another: a completion goes in by enqueue, a drain acknowledges by ack and pulls on its own, an awaited completion goes by suppress",
    run: (loaded) => {
      const calls = [];
      class Watched extends loaded.backgroundWork.InMemoryBackgroundWorkRegistry {
        enqueue(wakeup) {
          calls.push(["enqueue", wakeup]);
          return super.enqueue(wakeup);
        }
        pull(conversationId) {
          calls.push(["pull", conversationId]);
          return super.pull(conversationId);
        }
        ack(ids) {
          calls.push(["ack", ids]);
          return super.ack(ids);
        }
        nack(ids, opts) {
          calls.push(["nack", ids, opts]);
          return super.nack(ids, opts);
        }
        suppress(conversationId, id) {
          calls.push(["suppress", conversationId, id]);
          return super.suppress(conversationId, id);
        }
        hasPendingCompletions(conversationId) {
          calls.push(["hasPendingCompletions", conversationId]);
          return super.hasPendingCompletions(conversationId);
        }
        getWakeupRevision() {
          calls.push(["getWakeupRevision"]);
          return super.getWakeupRevision();
        }
        clearWork(id) {
          calls.push(["clearWork", id]);
          return super.clearWork(id);
        }
        abortWork(id) {
          calls.push(["abortWork", id]);
          return super.abortWork(id);
        }
        listWork(filter) {
          calls.push(["listWork", filter]);
          return super.listWork(filter);
        }
      }
      const registry = new Watched();
      const during = (act) => {
        calls.length = 0;
        const answered = act();
        return { answered, calls: calls.slice() };
      };
      registry.upsertWork(work("t1"));
      registry.upsertWork(work("t2"));
      return {
        aCompletion: during(() => registry.enqueueCompletion({ taskId: " t1 ", kind: "shell" })),
        awaited: during(() => registry.markAwaitedCompletion(" t2 ")),
        drained: during(() => registry.drainCompletions()),
        drainedEmpty: during(() => registry.drainCompletions()),
        aborted: during(() => registry.abortWork("t1")),
        allAborted: during(() => registry.abortAllWork()),
        running: during(() => registry.hasRunningWork()),
      };
    },
  },
  {
    name: "a completion that is awaited is kept out of the local conversation: dropped if it waits, refused later, until its work is cleared",
    run: (loaded) => {
      const registry = registryOf(loaded);
      const steps = [];
      const step = (label, act) => steps.push([label, { answered: act(), ...queueOf(registry, "local", "c1") }]);
      step("t1 and t2 complete, and a wakeup of c1 has t1's id", () => {
        registry.enqueueCompletion({ taskId: "t1", kind: "shell" });
        registry.enqueueCompletion({ taskId: "t2", kind: "shell" });
        registry.enqueue(wake("c1", "t1"));
      });
      step("t1 is awaited, with spaces", () => registry.markAwaitedCompletion(" t1 "));
      step("t1 completes again: refused", () => registry.enqueueCompletion({ taskId: "t1", kind: "shell" }));
      step("an empty id is awaited", () => registry.markAwaitedCompletion(""));
      step("t3 is awaited before it completes", () => registry.markAwaitedCompletion("t3"));
      step("t3 completes: refused", () => registry.enqueueCompletion({ taskId: "t3", kind: "shell" }));
      step("drained", () => registry.drainCompletions());
      step("t1's work is cleared", () => registry.clearWork("t1"));
      step("t1 completes: queued", () => registry.enqueueCompletion({ taskId: "t1", kind: "shell", again: true }));
      step("drained", () => registry.drainCompletions());
      return steps;
    },
  },
];
