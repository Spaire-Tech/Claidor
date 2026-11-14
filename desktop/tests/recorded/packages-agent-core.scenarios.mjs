/**
 * What an agent's turn reports while it runs, and what it asks: the updates
 * (text, thinking, tool calls, the end of the turn), the questions put to the
 * person's side with their answers, the listeners that carry both, the same
 * shapes with private values wrapped, a goal's clock and the guidelines an
 * agent pursuing a goal is given.
 *
 * The wrapping decides what of a person's data can leave the computer, so
 * every kind of update, question and answer is written down here as it is
 * wrapped and unwrapped under every privacy mode. A message is filled in by
 * its own description (`filled`): every field gets a value that says where
 * it sits ("TextDeltaUpdate.text"), so the answers show which fields are
 * wrapped, as what kind of data, and which are left as they are.
 *
 * A wrapped value is written as one line: what kind of data it is held as,
 * the field name it carries, and the value it holds. What each purpose gets
 * from it under a mode is a row of four cells, each worked out by asking the
 * value itself three times (plainly, with redaction enforced, and enforced
 * with the placeholder asked for):
 * - "given": the value, all three times, and nothing said to the console.
 * - "held back": asked plainly the value is let through and the console is
 *   told once; enforced, the unwrap is refused in its usual words; enforced
 *   with the placeholder asked for, the placeholder comes back.
 * Anything else is written out in full. The usual words are recorded whole
 * in a scenario of their own.
 *
 * An error JavaScript itself raises (a field read on nothing, a number that
 * is no whole number made a BigInt) is worded by the runtime, and the words
 * can change from one version of Node to the next and with the names inside
 * the code. Such an error is kept as its class alone. The part's own errors
 * are kept word for word.
 */

export const part = "packages/agent-core";
const folder = "source/packages/agent-core";
export const modules = {
  queries: `${folder}/interaction-queries.ts`,
  receiver: `${folder}/conversation-actions/remote.ts`,
  wrapping: `${folder}/redacted-interaction-listener.ts`,
  listener: `${folder}/interaction-listener.ts`,
  updates: `${folder}/interaction-updates.ts`,
  wrappedUpdates: `${folder}/redacted-interaction-updates.ts`,
  goal: `${folder}/goal-continuation.ts`,
  guidelines: `${folder}/goal-pursuit-guidelines.ts`,
};
/** The folder holds other files that are not this part's; these eight are. */
export const covers = Object.values(modules);

/** The privacy modes, by the server's own numbers. */
const MODES = [["unspecified", 0], ["no storage", 1], ["no training", 2], ["data training", 3], ["codebase training", 4]];
/** What data is asked for: the three purposes that keep it somewhere, and the one that is always allowed. */
const PURPOSES = [["training", "storage_for_training"], ["logging", "storage_for_logging"], ["usage", "storage_for_usage"], ["always", "unsafe_always_allowed"]];
const ALWAYS = "unsafe_always_allowed";
/** What the console is told when an unwrap that was not allowed goes through anyway. */
const CONSOLE_LINE = "[PRIVACY REDACTION] logger not initialized — call setRedactionLogger() at process startup";
const refusalFor = (purpose, leaf) => `Error: Unwrap not allowed for purpose ${purpose} with classification ${leaf.__classification} and privacy mode ${leaf.__privacyMode}`;
const placeholderFor = (leaf) => `[redacted:${leaf.__fieldName}]`;

/** The classes of error the runtime raises by itself: kept as the class, never as the sentence. */
const RUNTIME_ERRORS = new Set(["TypeError", "RangeError", "SyntaxError", "ReferenceError"]);
/** An error as it is kept. */
function said(error) {
  if (!(error instanceof Error)) return { "not an error": shown(error) };
  if (RUNTIME_ERRORS.has(error.name) && error.constructor?.name === error.name) return `${error.name}, the runtime's own`;
  return `${error.name}: ${error.message}`;
}

/**
 * How a call ended: `returned` (at once, no promise), `threw` (at once),
 * `resolved` or `rejected` (it gave a promise, which then settled).
 */
async function ending(run, show = shown) {
  let result;
  try {
    result = run();
  } catch (error) {
    return { threw: said(error) };
  }
  if (result === null || typeof result !== "object" || typeof result.then !== "function") return { returned: show(result) };
  try {
    return { resolved: show(await result) };
  } catch (error) {
    return { rejected: said(error) };
  }
}
/** What a call that is expected to fail failed with, as the error itself; nothing when it did not fail. */
async function failureOf(run) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** What the console is told while `run` runs, with what `run` gave. */
function listeningToConsole(run) {
  const told = [];
  const before = console.error;
  console.error = (...words) => told.push(words.map(String).join(" "));
  try {
    return { result: run(), told };
  } finally {
    console.error = before;
  }
}

const isMessage = (value) => value !== null && typeof value === "object" && typeof value.getType === "function" && typeof value.getType()?.typeName === "string";
const isWrappedValue = (value) => value !== null && typeof value === "object" && typeof value.unwrap === "function" && "__classification" in value && "__fieldName" in value;
/** A wrapped value's content, taken out for the purpose that is always allowed. */
const heldBy = (leaf) => leaf.unwrap(ALWAYS);
const written = (value) => (value instanceof Uint8Array ? `bytes ${Buffer.from(value).toString("hex") || "(none)"}` : JSON.stringify(value));

/**
 * A value as it is kept. A message is written as its type's name over its
 * fields, in the order the object holds them. A wrapped value is one line.
 * `mode`, when given, is the mode a wrapped form was made under: where the
 * form says that very mode it is written "(the mode)", so the forms made
 * under different modes can be compared.
 */
function shown(value, mode) {
  const modeWord = (found) => (mode !== undefined && found === mode ? "(the mode)" : found);
  const walk = (item, seen) => {
    if (item === null || typeof item !== "object") return item;
    if (item instanceof Error) return said(item);
    if (item instanceof Uint8Array) return item;
    if (isWrappedValue(item)) {
      const made = modeWord(item.__privacyMode);
      return `wrapped ${heldBy(item) instanceof Uint8Array ? "bytes" : "text"}, held as ${item.__classification}, field ${JSON.stringify(item.__fieldName)}${made === "(the mode)" || mode === undefined ? "" : `, made under ${written(made)}`}: ${written(heldBy(item))}`;
    }
    if (seen.includes(item)) return "(itself again)";
    const deeper = [...seen, item];
    if (Array.isArray(item)) return item.map((entry) => walk(entry, deeper));
    const fields = {};
    for (const key of Object.keys(item)) fields[key] = key === "_privacyMode" ? modeWord(item[key]) : walk(item[key], deeper);
    return isMessage(item) ? { [item.getType().typeName]: fields } : fields;
  };
  return walk(value, []);
}

/** Every wrapped value inside a wrapped form, with the path that leads to it. */
function wrappedValuesIn(form) {
  const found = [];
  const walk = (item, path, seen) => {
    if (item === null || typeof item !== "object" || item instanceof Uint8Array || seen.includes(item)) return;
    if (isWrappedValue(item)) {
      found.push([path, item]);
      return;
    }
    const deeper = [...seen, item];
    if (Array.isArray(item)) item.forEach((entry, at) => walk(entry, `${path}[${at}]`, deeper));
    else for (const key of Object.keys(item)) walk(item[key], path === "" ? key : `${path}.${key}`, deeper);
  };
  walk(form, "", []);
  return found;
}

/** Every `_privacyMode` a wrapped form carries that is not `mode`, with where it is. */
function otherModesIn(form, mode) {
  const found = [];
  const walk = (item, path, seen) => {
    if (item === null || typeof item !== "object" || item instanceof Uint8Array || seen.includes(item)) return;
    if (isWrappedValue(item)) {
      if (item.__privacyMode !== mode) found.push(`${path}: ${written(item.__privacyMode)}`);
      return;
    }
    const deeper = [...seen, item];
    if (Array.isArray(item)) item.forEach((entry, at) => walk(entry, `${path}[${at}]`, deeper));
    else {
      for (const key of Object.keys(item)) {
        if (key === "_privacyMode") {
          if (item[key] !== mode) found.push(`${path === "" ? key : `${path}.${key}`}: ${written(item[key])}`);
        } else walk(item[key], path === "" ? key : `${path}.${key}`, deeper);
      }
    }
  };
  walk(form, "", []);
  return found;
}

/**
 * What one purpose gets from a wrapped value: "given", "held back" (both
 * said at the top of this file), or the three answers written out.
 */
function cellFor(leaf, purpose) {
  const value = written(heldBy(leaf));
  const asked = (options) => {
    const { result, told } = listeningToConsole(() => {
      try {
        return written(leaf.unwrap(purpose, options));
      } catch (error) {
        return `threw ${said(error)}`;
      }
    });
    return { result, told };
  };
  const plainly = asked(undefined);
  const enforced = asked({ enforcing: true });
  const hidden = asked({ enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true });
  const quiet = (answer) => answer.told.length === 0;
  if ([plainly, enforced, hidden].every((answer) => answer.result === value && quiet(answer))) return "given";
  const placeholder = heldBy(leaf) instanceof Uint8Array ? written(new Uint8Array(0)) : written(placeholderFor(leaf));
  if (
    plainly.result === value && plainly.told.length === 1 && plainly.told[0] === CONSOLE_LINE &&
    enforced.result === `threw ${refusalFor(purpose, leaf)}` && quiet(enforced) &&
    hidden.result === placeholder && quiet(hidden)
  ) return "held back";
  return JSON.stringify({ plainly, enforced, hidden });
}

/** One wrapped value's row: its kind of data, whether its mode hides it, and what each purpose gets. */
const rowFor = (leaf) => `${leaf.__classification}${leaf.__isRedacted ? ", hidden" : ", shown"} — ${PURPOSES.map(([word, purpose]) => `${word}: ${cellFor(leaf, purpose)}`).join(" | ")}`;

/** The row of every wrapped value in a form, by the path that leads to the value. */
function rowsOf(form) {
  const rows = {};
  for (const [path, leaf] of wrappedValuesIn(form)) rows[path] = rowFor(leaf);
  return rows;
}

/**
 * The rows of a form's wrapped values under every mode, written once for all
 * the values that share them: where the values are, then their row under
 * each mode. `rowsByMode` holds, for each mode's word, what `rowsOf` gave.
 */
function sharedRows(rowsByMode) {
  const words = MODES.map(([word]) => word);
  const paths = [...new Set(words.flatMap((word) => Object.keys(rowsByMode[word])))];
  if (paths.length === 0) return "nothing in it is wrapped";
  const groups = new Map();
  for (const path of paths) {
    const rows = words.map((word) => rowsByMode[word][path] ?? "(no wrapped value there under this mode)");
    const key = JSON.stringify(rows);
    if (!groups.has(key)) groups.set(key, { rows, paths: [] });
    groups.get(key).paths.push(path);
  }
  return [...groups.values()].map(({ rows, paths: where }) => ({
    where: where.join(", "),
    ...(new Set(rows).size === 1 ? { "under every mode": rows[0] } : Object.fromEntries(words.map((word, at) => [word, rows[at]]))),
  }));
}

/** The message types the part works with, reached through what the part itself hands out. */
async function typesOf({ updates, queries }) {
  let InteractionQuery;
  await queries.queryWebSearch({ query: async (_context, query) => { InteractionQuery = query.constructor; return queries.Responses.webSearchApproved(0); } }, null, {});
  return {
    InteractionUpdate: updates.Updates.heartbeat().constructor,
    InteractionQuery,
    InteractionResponse: queries.Responses.webSearchApproved(0).constructor,
  };
}
/** The message type a field of `type` holds. */
const typeAt = (type, ...fieldNames) => fieldNames.reduce((at, name) => at.fields.list().find((field) => field.localName === name).T, type);
/** A type's name without its package: "agent.v1.A.B" is "A.B". */
const shortName = (type) => type.typeName.split(".").slice(2).join(".");

/** A value for a field that holds no message, by the wire's number for its kind. */
function scalarFor(kind, long, word, no) {
  if (kind === 9) return word;
  if (kind === 8) return true;
  if (kind === 12) return Uint8Array.of(no, 255);
  if (kind === 1 || kind === 2) return no + 0.5;
  if (kind === 3 || kind === 4 || kind === 6 || kind === 16 || kind === 18) return long === 1 ? String(1000 + no) : BigInt(1000 + no);
  return 100 + no;
}
const enumFor = (type) => (type.values[1] ?? type.values[0]).no;

/**
 * A message of `type` with every field filled in, as the plain object its
 * constructor takes. Text says where it sits. Of a choice ("oneof") the
 * first case is taken, or the one `choose` names for it as
 * `"<type>.<choice>": "<case>"`. A type already being filled in further out
 * is left empty, so that a message that can hold itself ends.
 */
function filled(type, choose = {}, trail = []) {
  const inside = [...trail, type.typeName];
  const valueFor = (field) => {
    const word = `${shortName(type)}.${field.localName}`;
    const one = (kind, of, long) => {
      if (kind === "message") return inside.includes(of.typeName) ? {} : filled(of, choose, inside);
      if (kind === "enum") return enumFor(of);
      return scalarFor(of, long, word, field.no);
    };
    if (field.kind === "map") return { [field.K === 9 ? `${word} key` : 1]: one(field.V.kind, field.V.T, 0) };
    const value = one(field.kind, field.T, field.L);
    return field.repeated ? [value] : value;
  };
  const out = {};
  for (const field of type.fields.list()) {
    if (field.oneof === undefined) {
      out[field.localName] = valueFor(field);
      continue;
    }
    const choice = field.oneof.localName;
    if (choice in out) continue;
    const wanted = choose[`${shortName(type)}.${choice}`] ?? field.oneof.fields[0].localName;
    const taken = field.oneof.fields.find((candidate) => candidate.localName === wanted);
    out[choice] = { case: taken.localName, value: valueFor(taken) };
  }
  return out;
}

/** The tools of a tool call are the generated code's own matter: one (the first, the shell) stands for them here. */
const NOT_SPREAD = new Set(["agent.v1.ToolCall"]);
/**
 * The variants a kind of message is recorded in: one for each case of each
 * choice the message holds itself or, when it holds none, of each choice
 * held one message further in.
 */
function variantsOf(type) {
  const choicesOf = (holder) => {
    const out = [];
    for (const field of holder.fields.list()) {
      if (field.oneof === undefined || field.oneof.fields[0] !== field) continue;
      for (const candidate of field.oneof.fields) out.push({ name: `${field.oneof.localName}: ${candidate.localName}`, choose: { [`${shortName(holder)}.${field.oneof.localName}`]: candidate.localName } });
    }
    return out;
  };
  const own = choicesOf(type);
  if (own.length > 0) return own;
  const further = type.fields.list()
    .filter((field) => field.kind === "message" && !field.repeated && field.oneof === undefined && !NOT_SPREAD.has(field.T.typeName))
    .flatMap((field) => choicesOf(field.T).map((variant) => ({ ...variant, name: `${field.localName}.${variant.name}` })));
  return further.length > 0 ? further : [{ name: "every field filled in", choose: {} }];
}

/** The kinds of one of the three messages: the cases of its choice, with each kind's own message type. */
const kindsOf = (type, choice) => type.fields.list().filter((field) => field.oneof?.localName === choice).map((field) => [field.localName, field.T]);

/** A listener that keeps what it is handed and answers a question with `answer`. */
function keeping(answer) {
  const kept = { updates: [], queries: [], contexts: [] };
  return {
    kept,
    sendUpdate(context, update) {
      kept.contexts.push(context);
      kept.updates.push(update);
    },
    async query(context, query) {
      kept.contexts.push(context);
      kept.queries.push(query);
      return typeof answer === "function" ? answer(query) : answer;
    },
  };
}

/**
 * One message through the wrapping under every mode: `wrap(mode)` gives its
 * wrapped form, `unwrap(mode, form)` the message made from that form again.
 * What is the same under every mode but for the mode's own number is
 * written once, and under each mode otherwise. With `original`, the message
 * that comes back is also compared with it.
 */
async function throughEveryMode(original, wrap, unwrap) {
  const forms = {};
  const rows = {};
  const strays = {};
  const backs = {};
  const equal = {};
  for (const [word, mode] of MODES) {
    const form = await wrap(mode);
    forms[word] = shown(form, mode);
    rows[word] = rowsOf(form);
    const stray = otherModesIn(form, mode);
    if (stray.length > 0) strays[word] = stray;
    const back = await unwrap(mode, form);
    backs[word] = shown(back);
    equal[word] = isMessage(back) && back !== original && isMessage(original) && back.equals(original);
  }
  const text = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? `${item}n` : item instanceof Uint8Array ? written(item) : item));
  const once = (byMode) => (new Set(Object.values(byMode).map(text)).size === 1 ? Object.values(byMode)[0] : byMode);
  return {
    wrapped: once(forms),
    ...(Object.keys(strays).length === 0 ? {} : { "carrying another mode than the one asked": strays }),
    "what each purpose gets": sharedRows(rows),
    unwrapped: once(backs),
    ...(original === undefined ? {} : { "unwrapped is a new message equal to the plain one": Object.values(equal).every(Boolean) ? "under every mode" : equal }),
  };
}

/** The scenarios of one of the three messages: one for each of its kinds, every variant of the kind under every mode. */
function everyVariantOfAKind({ what, pick, choice, through }) {
  return async (m, kind) => {
    const types = await typesOf(m);
    const type = pick(types);
    const [, kindType] = kindsOf(type, choice).find(([name]) => name === kind);
    const out = {};
    for (const variant of variantsOf(kindType)) {
      const original = new type({ ...(what === "update" ? {} : { id: 41 }), [choice]: { case: kind, value: filled(kindType, variant.choose) } });
      out[variant.name] = await through(m, types, original);
    }
    return out;
  };
}

/** An update through both listeners: the one that wraps for its delegate, and the one that unwraps for its delegate. */
const updateThroughModes = everyVariantOfAKind({
  what: "update",
  pick: (types) => types.InteractionUpdate,
  choice: "message",
  through: (m, _types, original) => throughEveryMode(
    original,
    async (mode) => {
      const delegate = keeping();
      await m.wrapping.toUnredactedInteractionListener(delegate, mode).sendUpdate("the context", original);
      return delegate.kept.updates[0];
    },
    async (mode, form) => {
      const delegate = keeping();
      await m.wrapping.toRedactedInteractionListener(delegate, mode).sendUpdate("the context", form);
      return delegate.kept.updates[0];
    },
  ),
});

/**
 * A question through both listeners, one behind the other: asked plainly, it
 * reaches the first delegate wrapped; handed on to the second listener, it
 * reaches the last delegate unwrapped.
 */
const queryThroughModes = everyVariantOfAKind({
  what: "query",
  pick: (types) => types.InteractionQuery,
  choice: "query",
  through: (m, _types, original) => throughEveryMode(
    original,
    async (mode) => {
      const delegate = keeping(undefined);
      await m.wrapping.toUnredactedInteractionListener(delegate, mode).query("the context", original).catch(() => {});
      return delegate.kept.queries[0];
    },
    async (mode, form) => {
      const delegate = keeping(m.queries.Responses.webSearchApproved(41));
      await m.wrapping.toRedactedInteractionListener(delegate, mode).query("the context", form);
      return delegate.kept.queries[0];
    },
  ),
});

/** An answer through both listeners: given plainly it comes back wrapped from the one, and unwrapped from the other. */
const responseThroughModes = everyVariantOfAKind({
  what: "response",
  pick: (types) => types.InteractionResponse,
  choice: "result",
  through: (m, types, original) => {
    const asked = new types.InteractionQuery({ id: 41, query: { case: "webSearchRequestQuery", value: { args: { searchTerm: "anything", toolCallId: "call" } } } });
    return throughEveryMode(
      original,
      async (mode) => m.wrapping.toRedactedInteractionListener(keeping(original), mode).query("the context", await wrappedQuery(m, asked, mode)),
      (mode, form) => m.wrapping.toUnredactedInteractionListener(keeping(form), mode).query("the context", asked),
    );
  },
});
/** A question's wrapped form under a mode, as the wrapping listener hands it to its delegate. */
async function wrappedQuery(m, query, mode) {
  const delegate = keeping(undefined);
  await m.wrapping.toUnredactedInteractionListener(delegate, mode).query("the context", query).catch(() => {});
  return delegate.kept.queries[0];
}
/** An update's wrapped form under a mode, as the wrapping listener hands it to its delegate. */
async function wrappedUpdate(m, update, mode) {
  const delegate = keeping();
  await m.wrapping.toUnredactedInteractionListener(delegate, mode).sendUpdate("the context", update);
  return delegate.kept.updates[0];
}
/** A wrapped update's plain form, as the unwrapping listener hands it to its delegate. */
async function unwrappedUpdate(m, form, mode = 2) {
  const delegate = keeping();
  await m.wrapping.toRedactedInteractionListener(delegate, mode).sendUpdate("the context", form);
  return delegate.kept.updates[0];
}

const UPDATE_KINDS = [
  ["textDelta", "a piece of the agent's text"],
  ["partialToolCall", "a tool call still being written"],
  ["toolCallDelta", "a piece of a tool call's output"],
  ["toolCallStarted", "a tool call that started"],
  ["toolCallCompleted", "a tool call that completed"],
  ["thinkingDelta", "a piece of the agent's thinking"],
  ["thinkingCompleted", "the end of the thinking"],
  ["userMessageAppended", "a message of the person's added to the conversation"],
  ["tokenDelta", "a count of tokens"],
  ["summary", "a summary of the conversation"],
  ["summaryStarted", "the start of a summary"],
  ["summaryCompleted", "the end of a summary"],
  ["shellOutputDelta", "a piece of a command's output"],
  ["heartbeat", "a heartbeat"],
  ["turnEnded", "the end of the turn with what it used"],
  ["stepStarted", "the start of a step"],
  ["stepCompleted", "the end of a step"],
  ["promptSuggestion", "a suggested next message"],
  ["postRequestPrompt", "a prompt shown after the request"],
  ["activeBranchChange", "a change of the branch worked on"],
  ["feedbackRequest", "a request for feedback"],
  ["responseComparison", "a comparison of two answers"],
  ["contextInjectionState", "the state of something added to the context"],
  ["routedModel", "the model the turn was routed to"],
];
const QUERY_KINDS = [
  ["webSearchRequestQuery", "may the agent search the web"],
  ["askQuestionInteractionQuery", "questions for the person"],
  ["switchModeRequestQuery", "may the agent switch mode"],
  ["createPlanRequestQuery", "a plan to create"],
  ["setupVmEnvironmentArgs", "a cloud computer to set up"],
  ["webFetchRequestQuery", "may the agent fetch a page"],
  ["prManagementRequestQuery", "something to do with a pull request"],
  ["mcpAuthRequestQuery", "a connector to sign in to"],
  ["generateImageRequestQuery", "may the agent make a picture"],
  ["replaceEnvArgs", "an environment to replace"],
  ["connectScmRequestQuery", "GitHub to connect"],
];
const RESPONSE_KINDS = [
  ["webSearchRequestResponse", "to a web search"],
  ["askQuestionInteractionResponse", "to questions for the person"],
  ["switchModeRequestResponse", "to a switch of mode"],
  ["createPlanRequestResponse", "to a plan"],
  ["setupVmEnvironmentResult", "to a cloud computer's setup"],
  ["webFetchRequestResponse", "to a page fetch"],
  ["prManagementResult", "to a pull request action"],
  ["mcpAuthRequestResponse", "to a connector sign-in"],
  ["generateImageRequestResponse", "to a picture"],
  ["replaceEnvResult", "to an environment's replacement"],
  ["connectScmRequestResponse", "to connecting GitHub"],
];

/** What a function is, as far as a caller can tell without calling it. */
const about = (fn) => `${fn.constructor.name === "AsyncFunction" ? "async " : ""}${fn.name}, ${fn.length} declared${Object.hasOwn(fn, "prototype") ? ", has a prototype" : ""}`;
/** A class: its own line, then what its instances can do, in the order the class holds it. */
const aboutClass = (made) => [about(made), ...Object.getOwnPropertyNames(made.prototype).filter((name) => name !== "constructor").map((name) => about(made.prototype[name]))];
/** What an error is, beyond its words. */
const errorFacts = (error, itsClass) => ({
  name: error.name,
  message: error.message,
  "written as text": String(error),
  "first line of its stack": String(error.stack).split("\n")[0],
  "own fields": Object.keys(error).map((key) => {
    const held = Object.getOwnPropertyDescriptor(error, key);
    return `${key}${held.writable ? ", can be written on" : ""}${held.configurable ? ", can be removed" : ""}${"get" in held ? ", computed" : ""}`;
  }),
  "an Error": error instanceof Error,
  "of its class": error instanceof itsClass,
});

/** Small hand-made pieces the tables below are built from. */
const SAMPLE = {
  toolCall: { tool: { case: "shellToolCall", value: { args: { command: "ls -la", workingDirectory: "/home/ada/project", toolCallId: "tool-1" }, description: "list the files" } }, toolCallId: "tool-1" },
  userMessage: { text: "the person's words", messageId: "message-1" },
  category: { id: "wrong", label: "It was wrong" },
  group: { id: "why", prompt: "What went wrong?", categories: [{ id: "slow", label: "Too slow" }] },
  copy: { title: "How was this answer?", negativeTitle: "What went wrong?", commentPlaceholder: "Tell us more" },
  usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 800, cacheWriteTokens: 50, reasoningTokens: 90 },
};

const surfaceScenarios = [
  {
    name: "what the part hands out: the tables' builders in their order, every function's name and declared arguments, the classes",
    run: (m) => {
      const table = (object) => Object.fromEntries(Object.keys(object).map((key) => [key, about(object[key])]));
      return {
        Responses: table(m.queries.Responses),
        Updates: table(m.updates.Updates),
        RedactedUpdates: table(m.wrappedUpdates.RedactedUpdates),
        "the tables can be written on": [m.queries.Responses, m.updates.Updates, m.wrappedUpdates.RedactedUpdates].map((object) => !Object.isFrozen(object) && Object.isExtensible(object)),
        functions: [
          m.queries.queryWebSearch, m.queries.queryWebFetch, m.queries.queryMcpAuth,
          m.listener.flushPostTurnEndedWork,
          m.wrapping.toUnredactedInteractionListener, m.wrapping.toRedactedInteractionListener,
          m.goal.goalWorkedMs, m.goal.goalElapsedMsFrom, m.goal.goalElapsedMs, m.goal.goalClockOnActivation, m.goal.goalClockOnDeactivation,
          m.goal.isGoalOwnerValid, m.goal.isGoalIdentityValid, m.goal.isGoalStateShapeValid,
          m.guidelines.buildGoalPursuitGuidelines,
        ].map(about),
        classes: {
          DeferredInteractionResponseError: aboutClass(m.queries.DeferredInteractionResponseError),
          InteractionListenerStreamClosedError: aboutClass(m.listener.InteractionListenerStreamClosedError),
          NoopInteractionListener: aboutClass(m.listener.NoopInteractionListener),
          NoopConversationActionReceiver: aboutClass(m.receiver.NoopConversationActionReceiver),
        },
      };
    },
  },
];

const queryScenarios = [
  {
    name: "a deferred answer's error names the question's id and kind, and keeps the question",
    run: async (m) => {
      const { DeferredInteractionResponseError } = m.queries;
      const types = await typesOf(m);
      const questions = [
        ["a page fetch, id 12", new types.InteractionQuery({ id: 12, query: { case: "webFetchRequestQuery", value: {} } })],
        ["a question of no kind", new types.InteractionQuery()],
        ["a plain object", { id: 3, query: { case: "askQuestionInteractionQuery" } }],
        ["a kind that is null, no id", { query: { case: null } }],
        ["a kind that is empty text", { id: "x", query: { case: "" } }],
      ];
      const out = {};
      for (const [word, question] of questions) {
        const error = new DeferredInteractionResponseError(question);
        out[word] = { ...errorFacts(error, DeferredInteractionResponseError), "keeps the very question": error.query === question };
      }
      class Later extends DeferredInteractionResponseError {}
      const later = new Later(questions[0][1]);
      function Other() {}
      const other = Reflect.construct(DeferredInteractionResponseError, [questions[0][1]], Other);
      return {
        ...out,
        "made by a class of its own": { ...errorFacts(later, DeferredInteractionResponseError), "of the class of its own": later instanceof Later && Object.getPrototypeOf(later) === Later.prototype },
        "made for another constructor": { "is the other's": Object.getPrototypeOf(other) === Other.prototype, "of its class": other instanceof DeferredInteractionResponseError, name: other.name },
        "with no question": await ending(() => new DeferredInteractionResponseError()),
        "with a question that has no query": await ending(() => new DeferredInteractionResponseError({ id: 1 })),
        "called without new": await ending(() => DeferredInteractionResponseError(questions[0][1])),
      };
    },
  },
  {
    name: "ready-made answers: an approval carries the question's id and nothing else",
    run: (m) => {
      const { Responses } = m.queries;
      const out = {};
      for (const name of ["webSearchApproved", "webFetchApproved", "switchModeApproved", "mcpAuthApproved", "connectScmApproved"]) {
        out[name] = {
          "for question 7": shown(Responses[name](7)),
          "the id carried for 0, 4294967295, nothing and the text 7": [0, 4294967295, undefined, "7"].map((id) => Responses[name](id).id),
          "more arguments change nothing": JSON.stringify(shown(Responses[name](7, "a reason", "more"))) === JSON.stringify(shown(Responses[name](7))),
        };
      }
      return out;
    },
  },
  {
    name: "ready-made answers: a refusal carries its reason, or the reason it has ready when none came",
    run: (m) => {
      const { Responses } = m.queries;
      const reasons = [["a reason", "because"], ["empty text", ""], ["null", null], ["undefined", undefined], ["zero", 0], ["false", false]];
      const out = {};
      for (const name of ["webSearchRejected", "webFetchRejected", "switchModeRejected", "mcpAuthRejected", "connectScmRejected", "connectScmFailed", "generateImageApproved", "generateImageRejected"]) {
        out[name] = {
          "for question 7, with a reason": shown(Responses[name](7, "because")),
          "what is inside with nothing after the id": shown(Responses[name](7).result.value.result),
          ...Object.fromEntries(reasons.map(([word, reason]) => [`what is inside for ${word}`, shown(Responses[name](7, reason).result.value.result)])),
          "the id carried for 0 and nothing": [0, undefined].map((id) => Responses[name](id, "because").id),
        };
      }
      return out;
    },
  },
  {
    name: "ready-made answers: a result handed in is carried as it is",
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionResponse } = await typesOf(m);
      const results = {
        askQuestion: [typeAt(InteractionResponse, "askQuestionInteractionResponse", "result"), (response) => response.result.value.result],
        createPlan: [typeAt(InteractionResponse, "createPlanRequestResponse", "result"), (response) => response.result.value.result],
        setupVmEnvironment: [typeAt(InteractionResponse, "setupVmEnvironmentResult"), (response) => response.result.value],
        replaceEnv: [typeAt(InteractionResponse, "replaceEnvResult"), (response) => response.result.value],
        prManagement: [typeAt(InteractionResponse, "prManagementResult"), (response) => response.result.value],
      };
      const out = {};
      for (const [name, [type, carried]] of Object.entries(results)) {
        const message = new type(filled(type));
        const fromMessage = Responses[name](7, message);
        const fromPlain = Responses[name](7, filled(type));
        out[name] = {
          "given a message": shown(fromMessage),
          "it holds the very message": carried(fromMessage) === message,
          "given a plain object, it holds a message of the same content": isMessage(carried(fromPlain)) && carried(fromPlain).equals(message),
          "given nothing": await ending(() => Responses[name](7, undefined)),
          "given null": await ending(() => Responses[name](7, null)),
          "the id carried for 0 and nothing": [0, undefined].map((id) => Responses[name](id, message).id),
        };
      }
      return out;
    },
  },
  {
    name: "ready-made answers: each call makes a new answer, and none needs the table it came from",
    run: (m) => {
      const { Responses } = m.queries;
      const out = {};
      for (const name of Object.keys(Responses)) {
        const builder = Responses[name];
        const first = Responses[name](7, undefined);
        const second = Responses[name](7, undefined);
        const alone = builder(7, undefined);
        out[name] = [
          first !== second && first.result !== second.result ? "new each time" : "shared",
          first.result.value === undefined || first.result.value !== second.result.value ? "its content too" : "the content shared",
          first.equals(alone) ? "the same called on its own" : "different called on its own",
        ].join(", ");
      }
      return out;
    },
  },
  ...[
    ["queryWebSearch", "a web search", "webSearchRequestResponse", "webSearchApproved", "webSearchRejected", { searchTerm: "weather in Paris", toolCallId: "call-1" }],
    ["queryWebFetch", "a page", "webFetchRequestResponse", "webFetchApproved", "webFetchRejected", { url: "https://example.com/page", toolCallId: "call-2" }],
    ["queryMcpAuth", "a connector's sign-in", "mcpAuthRequestResponse", "mcpAuthApproved", "mcpAuthRejected", { serverIdentifier: "linear", toolCallId: "call-3" }],
  ].map(([ask, words, right, approved, rejected, args]) => ({
    name: `asking for ${words}: the listener gets the context and one new question, and the answer's own part comes back (${ask})`,
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionResponse } = await typesOf(m);
      const context = { a: "context" };
      const calls = [];
      const answering = (answer) => {
        const listener = {
          query(...given) {
            calls.push({ "on the listener": this === listener, arguments: given.length, "the very context": given[0] === context, question: shown(given[1]) });
            return typeof answer === "function" ? answer() : answer;
          },
        };
        return listener;
      };
      const yes = Responses[approved](5);
      const no = Responses[rejected](5, "not now");
      const gotYes = await m.queries[ask](answering(yes), context, args);
      const gotNo = await m.queries[ask](answering(Promise.resolve(no)), context, args);
      const failure = new Error("the listener failed");
      const thrown = await failureOf(() => m.queries[ask](answering(() => { throw failure; }), context, args));
      const refused = await failureOf(() => m.queries[ask](answering(Promise.reject(failure)), context, args));
      return {
        "what the listener was asked, the first time": calls[0],
        "every time the same question, a new one": calls.every((call) => JSON.stringify(call) === JSON.stringify(calls[0])),
        "times asked": calls.length,
        approved: { answer: shown(gotYes), "the very part of the listener's answer": gotYes === yes.result.value },
        rejected: { answer: shown(gotNo), "the very part of the listener's answer": gotNo === no.result.value },
        "an answer of another kind": await ending(() => m.queries[ask](answering(Responses.switchModeApproved(5)), context, args)),
        "an answer of no kind": await ending(() => m.queries[ask](answering(new InteractionResponse({ id: 5 })), context, args)),
        "the right kind with nothing in it": await ending(() => m.queries[ask](answering({ result: { case: right } }), context, args)),
        "the right kind with a zero in it": await ending(() => m.queries[ask](answering({ result: { case: right, value: 0 } }), context, args)),
        "the right kind with any other value in it": await ending(() => m.queries[ask](answering({ result: { case: right, value: "anything" } }), context, args)),
        "no answer at all": await ending(() => m.queries[ask](answering(undefined), context, args)),
        "an answer with no result": await ending(() => m.queries[ask](answering({}), context, args)),
        "a listener that throws": { ...(await ending(() => m.queries[ask](answering(() => { throw failure; }), context, args))), "the very error": thrown === failure },
        "a listener that refuses later": { ...(await ending(() => m.queries[ask](answering(Promise.reject(failure)), context, args))), "the very error": refused === failure },
        "a listener that refuses with words": await ending(() => m.queries[ask](answering(Promise.reject("just words")), context, args)),
        "no listener": await ending(() => m.queries[ask](undefined, context, args)),
        "a listener that cannot be asked": await ending(() => m.queries[ask]({}, context, args)),
      };
    },
  })),
  {
    name: "asking: the arguments become the question's own, a message handed in is kept as it is",
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionQuery } = await typesOf(m);
      const asks = [
        ["queryWebSearch", "webSearchApproved", "webSearchRequestQuery", { searchTerm: "weather in Paris", toolCallId: "call-1" }],
        ["queryWebFetch", "webFetchApproved", "webFetchRequestQuery", { url: "https://example.com/page", toolCallId: "call-2" }],
        ["queryMcpAuth", "mcpAuthApproved", "mcpAuthRequestQuery", { serverIdentifier: "linear", toolCallId: "call-3" }],
      ];
      const out = {};
      for (const [ask, approved, kind, args] of asks) {
        const argsType = typeAt(InteractionQuery, kind, "args");
        const asked = async (given) => {
          let question;
          const end = await ending(() => m.queries[ask]({ query: async (_context, query) => { question = query; return Responses[approved](1); } }, null, given), () => "answered");
          return { end, question };
        };
        const message = new argsType(args);
        const withMessage = await asked(message);
        const [first] = Object.keys(args);
        out[ask] = {
          "a message": { ...withMessage.end, "the question holds the very message": withMessage.question.query.value.args === message },
          "a plain object with something more in it": shown((await asked({ ...args, somethingElse: "dropped?" })).question.query.value),
          "only the first field": shown((await asked({ [first]: args[first] })).question.query.value),
          "an empty object": shown((await asked({})).question.query.value),
          "nothing": shown((await asked(undefined)).question.query.value),
          "null": (await asked(null)).end,
          "the question's id": withMessage.question.id,
        };
      }
      return out;
    },
  },
  {
    name: "asking for a page: approval can be skipped, and a smart-mode approval carried along",
    run: async (m) => {
      const { Responses, queryWebFetch } = m.queries;
      const approval = { requestId: "request-1", reason: "the page is one the person named" };
      const options = [
        ["nothing after the arguments", []],
        ["undefined", [undefined]],
        ["null", [null]],
        ["true", [true]],
        ["false", [false]],
        ["an empty object", [{}]],
        ["skipApproval true", [{ skipApproval: true }]],
        ["skipApproval false", [{ skipApproval: false }]],
        ["skipApproval undefined", [{ skipApproval: undefined }]],
        ["skipApproval null", [{ skipApproval: null }]],
        ["skipApproval zero", [{ skipApproval: 0 }]],
        ["skipApproval empty text", [{ skipApproval: "" }]],
        ["skipApproval the text no", [{ skipApproval: "no" }]],
        ["a smart-mode approval", [{ smartModeApproval: approval }]],
        ["both", [{ skipApproval: true, smartModeApproval: approval }]],
        ["a smart-mode approval that is undefined", [{ smartModeApproval: undefined }]],
        ["the text yes", ["yes"]],
        ["the number 1", [1]],
        ["the number 0", [0]],
      ];
      const out = {};
      for (const [word, rest] of options) {
        let question;
        const end = await ending(() => queryWebFetch({ query: async (_context, query) => { question = query; return Responses.webFetchApproved(1); } }, null, { url: "https://example.com/page" }, ...rest), () => "answered");
        out[word] = "resolved" in end ? { skipApproval: question.query.value.skipApproval, smartModeApproval: shown(question.query.value.smartModeApproval) } : end;
      }
      return out;
    },
  },
];

const listenerScenarios = [
  {
    name: "a closed stream's error keeps its message and its cause",
    run: async (m) => {
      const { InteractionListenerStreamClosedError } = m.listener;
      const cause = new Error("the socket went away");
      const cases = [
        ["a message alone", ["the stream closed"]],
        ["empty options", ["the stream closed", {}]],
        ["a cause", ["the stream closed", { cause }]],
        ["a cause that is undefined", ["the stream closed", { cause: undefined }]],
        ["a cause that is null", ["the stream closed", { cause: null }]],
        ["a cause that is text, and more in the options", ["the stream closed", { cause: "words", other: 1 }]],
        ["options that are undefined", ["the stream closed", undefined]],
        ["no message", []],
        ["a message that is no text", [404]],
      ];
      const out = {};
      for (const [word, given] of cases) {
        const error = new InteractionListenerStreamClosedError(...given);
        out[word] = { ...errorFacts(error, InteractionListenerStreamClosedError), cause: shown(error.cause), "has a cause field of its own": Object.hasOwn(error, "cause") };
      }
      const withCause = new InteractionListenerStreamClosedError("the stream closed", { cause });
      class Narrower extends InteractionListenerStreamClosedError {}
      const narrower = new Narrower("narrower", { cause });
      function Other() {}
      const other = Reflect.construct(InteractionListenerStreamClosedError, ["for another"], Other);
      return {
        ...out,
        "the cause is the very one given": withCause.cause === cause,
        "the name and the cause can be written on": (() => { const error = new InteractionListenerStreamClosedError("x"); error.name = "Renamed"; error.cause = 5; return [error.name, error.cause]; })(),
        "made by a class of its own": { ...errorFacts(narrower, InteractionListenerStreamClosedError), "of the class of its own": narrower instanceof Narrower && Object.getPrototypeOf(narrower) === Narrower.prototype },
        "made for another constructor": { "is the other's": Object.getPrototypeOf(other) === Other.prototype, name: other.name },
        "options that are null": await ending(() => new InteractionListenerStreamClosedError("the stream closed", null)),
        "called without new": await ending(() => InteractionListenerStreamClosedError("the stream closed")),
      };
    },
  },
  {
    name: "flushing a listener's work after the turn: asked of the listener when it can, with the context, and waited for",
    run: async (m) => {
      const { flushPostTurnEndedWork } = m.listener;
      const context = { a: "context" };
      const calls = [];
      const able = {
        flushPostTurnEndedWork(...given) {
          calls.push({ "on the listener": this === able, arguments: given.length, "the very context": given[0] === context });
          return "what the listener gave";
        },
      };
      const order = [];
      const slow = { flushPostTurnEndedWork: () => new Promise((resolve) => setTimeout(() => { order.push("the listener finished"); resolve(); }, 15)) };
      const waited = flushPostTurnEndedWork(context, slow).then(() => order.push("the flush finished"));
      order.push("the flush was asked");
      await waited;
      const failure = new Error("the flush failed");
      return {
        "a listener that can": await ending(() => flushPostTurnEndedWork(context, able)),
        calls,
        "a listener that cannot": await ending(() => flushPostTurnEndedWork(context, {})),
        "a listener whose flush is null": await ending(() => flushPostTurnEndedWork(context, { flushPostTurnEndedWork: null })),
        "a listener whose flush is no function": await ending(() => flushPostTurnEndedWork(context, { flushPostTurnEndedWork: "soon" })),
        "a flush that throws": { ...(await ending(() => flushPostTurnEndedWork(context, { flushPostTurnEndedWork() { throw failure; } }))), "the very error": (await failureOf(() => flushPostTurnEndedWork(context, { flushPostTurnEndedWork() { throw failure; } }))) === failure },
        "a flush that refuses later": await ending(() => flushPostTurnEndedWork(context, { flushPostTurnEndedWork: () => Promise.reject(failure) })),
        "no listener": await ending(() => flushPostTurnEndedWork(context, undefined)),
        "no arguments": await ending(() => flushPostTurnEndedWork()),
        "a slow flush is waited for": order,
      };
    },
  },
  {
    name: "the listener that asks nobody: an update is taken and nothing is done with it",
    run: async (m) => {
      const listener = new m.listener.NoopInteractionListener();
      return {
        "an update": await ending(() => listener.sendUpdate({ canceled: false }, m.updates.Updates.textDelta("words"))),
        "nothing at all": await ending(() => listener.sendUpdate()),
        "what a new listener holds": shown(new m.listener.NoopInteractionListener()),
        "its fields": Object.keys(listener),
      };
    },
  },
  {
    name: "the listener that asks nobody: work put aside runs when flushed, all of it started in order before any finishes, failures swallowed",
    run: async (m) => {
      const listener = new m.listener.NoopInteractionListener();
      const log = [];
      const later = (ms, word) => new Promise((resolve) => setTimeout(() => { log.push(`${word} finished`); resolve(word); }, ms));
      const put = [
        listener.enqueuePostTurnEndedWork(() => { log.push("slow started"); return later(30, "slow"); }),
        listener.enqueuePostTurnEndedWork(() => { log.push("quick started"); return later(5, "quick"); }),
        listener.enqueuePostTurnEndedWork(() => { log.push("throwing started"); throw new Error("thrown at once"); }),
        listener.enqueuePostTurnEndedWork(async () => { log.push("refusing started"); throw new Error("refused"); }),
        listener.enqueuePostTurnEndedWork(() => { log.push("plain started"); return "no promise"; }),
        listener.enqueuePostTurnEndedWork(function work(...given) { log.push(`work is called with ${given.length} arguments, on ${this === undefined ? "nothing" : "something"}`); }),
        listener.enqueuePostTurnEndedWork("no function"),
        listener.enqueuePostTurnEndedWork(),
      ];
      log.push("nothing ran before the flush");
      const flushed = listener.flushPostTurnEndedWork({ canceled: false });
      log.push("the flush was asked");
      const end = await ending(() => flushed);
      log.push("the flush finished");
      const again = await ending(() => listener.flushPostTurnEndedWork());
      return { "what putting work aside gives": put, "the flush": end, log, "a second flush": again, "the log after it": log.length };
    },
  },
  {
    name: "the listener that asks nobody: work put aside during a flush waits for the next, and each listener has its own",
    run: async (m) => {
      const { NoopInteractionListener } = m.listener;
      const listener = new NoopInteractionListener();
      const other = new NoopInteractionListener();
      const log = [];
      listener.enqueuePostTurnEndedWork(async () => {
        log.push("first ran");
        listener.enqueuePostTurnEndedWork(async () => { log.push("the one added meanwhile ran"); });
      });
      other.enqueuePostTurnEndedWork(async () => { log.push("the other listener's ran"); });
      const before = listener.postTurnEndedWorkQueue;
      await listener.flushPostTurnEndedWork();
      const afterFirst = [...log];
      const between = listener.postTurnEndedWorkQueue;
      await listener.flushPostTurnEndedWork();
      const afterSecond = [...log];
      await other.flushPostTurnEndedWork();
      return {
        "after the first flush": afterFirst,
        "after the second": afterSecond,
        "after the other listener's flush": log,
        "the work is kept in the listener's own list, a new list after each flush": [Array.isArray(before), before !== between, between.length, listener.postTurnEndedWorkQueue.length],
        "the list taken before the flush still holds what ran": before.length,
      };
    },
  },
  {
    name: "the listener that asks nobody answers every kind of question by itself",
    run: async (m) => {
      const listener = new m.listener.NoopInteractionListener();
      const { InteractionQuery } = await typesOf(m);
      const out = {};
      for (const [kind, kindType] of kindsOf(InteractionQuery, "query")) {
        const question = new InteractionQuery({ id: 41, query: { case: kind, value: filled(kindType) } });
        const first = await listener.query({ canceled: false }, question);
        const second = await listener.query(undefined, question);
        out[kind] = { answer: shown(first), "a new answer each time": first !== second && first.equals(second) };
      }
      return out;
    },
  },
  {
    name: "the listener that asks nobody: a picture is approved with the description asked for, a question of no known kind is refused",
    run: async (m) => {
      const listener = new m.listener.NoopInteractionListener();
      const { InteractionQuery } = await typesOf(m);
      const picture = (value) => listener.query(null, { id: 9, query: { case: "generateImageRequestQuery", value } });
      const inside = async (value) => shown((await picture(value)).result.value.result);
      return {
        "a description": await inside({ args: { description: "a cat on a roof" } }),
        "an empty description": await inside({ args: { description: "" } }),
        "arguments without a description": await inside({ args: {} }),
        "no arguments": await inside({}),
        "arguments that are null": await inside({ args: null }),
        "a description that is null": await inside({ args: { description: null } }),
        "no value at all": await ending(() => picture(undefined)),
        "a question of no kind": await ending(() => listener.query(null, new InteractionQuery({ id: 9 }))),
        "a kind nobody knows": await ending(() => listener.query(null, { id: 9, query: { case: "somethingNew", value: {} } })),
        "a kind in other letters": await ending(() => listener.query(null, { id: 9, query: { case: "WebSearchRequestQuery" } })),
        "a question with no query": await ending(() => listener.query(null, { id: 9 })),
        "no question": await ending(() => listener.query(null)),
        "query and sendUpdate taken off the listener work the same": await (async () => {
          const { query, sendUpdate } = listener;
          return [shown(await query(null, { id: 9, query: { case: "mcpAuthRequestQuery" } })), await ending(() => sendUpdate(null, null))];
        })(),
        "plain objects are enough, and the id is carried as it is": [
          (await listener.query(null, { id: 0, query: { case: "webSearchRequestQuery" } })).id,
          (await listener.query(null, { query: { case: "webFetchRequestQuery" } })).id,
          (await listener.query(null, { id: 4294967295, query: { case: "switchModeRequestQuery" } })).id,
        ],
      };
    },
  },
  {
    name: "the listener that asks nobody builds its answers with the ready-made answers as they are when it is asked",
    run: async (m) => {
      const { Responses } = m.queries;
      const listener = new m.listener.NoopInteractionListener();
      const kinds = {
        webSearchRequestQuery: "webSearchApproved",
        webFetchRequestQuery: "webFetchApproved",
        askQuestionInteractionQuery: "askQuestion",
        switchModeRequestQuery: "switchModeRejected",
        createPlanRequestQuery: "createPlan",
        setupVmEnvironmentArgs: "setupVmEnvironment",
        replaceEnvArgs: "replaceEnv",
        prManagementRequestQuery: "prManagement",
        mcpAuthRequestQuery: "mcpAuthRejected",
        connectScmRequestQuery: "connectScmRejected",
        generateImageRequestQuery: "generateImageApproved",
      };
      const out = {};
      for (const [kind, builder] of Object.entries(kinds)) {
        const before = Responses[builder];
        const calls = [];
        Responses[builder] = (...given) => {
          calls.push(given.map((value) => shown(value)));
          return `what ${builder} was made to give`;
        };
        try {
          out[kind] = { answer: await listener.query(null, { id: 41, query: { case: kind, value: { args: { description: "a cat on a roof" } } } }), "asked of": builder, with: calls };
        } finally {
          Responses[builder] = before;
        }
      }
      return out;
    },
  },
  {
    name: "a listener built on the one that asks nobody, as the host builds its own",
    run: async (m) => {
      const { NoopInteractionListener } = m.listener;
      class Forwarding extends NoopInteractionListener {
        constructor(onUpdate) {
          super();
          this.onUpdate = onUpdate;
        }
        async sendUpdate(context, update) {
          await super.sendUpdate(context, update);
          this.onUpdate(update.message.case);
        }
      }
      const seen = [];
      const listener = new Forwarding((kind) => seen.push(kind));
      await listener.sendUpdate({}, m.updates.Updates.heartbeat());
      await listener.sendUpdate({}, m.updates.Updates.textDelta("words"));
      const ran = [];
      listener.enqueuePostTurnEndedWork(async () => ran.push("after the turn"));
      await m.listener.flushPostTurnEndedWork({}, listener);
      return {
        seen,
        ran,
        "its fields, the list of work first": Object.keys(listener),
        "still answers questions": shown(await listener.query({}, { id: 3, query: { case: "webSearchRequestQuery" } })),
        "is one of them": listener instanceof NoopInteractionListener,
      };
    },
  },
  {
    name: "the receiver of conversation actions that has none",
    run: async (m) => {
      const { NoopConversationActionReceiver } = m.receiver;
      const receiver = new NoopConversationActionReceiver();
      return {
        peek: await ending(() => receiver.peek({ a: "context" })),
        pop: await ending(() => receiver.pop({ a: "context" })),
        "with nothing given": [await ending(() => receiver.peek()), await ending(() => receiver.pop())],
        "again, after a pop": await ending(() => receiver.peek("anything")),
        "what it holds": shown(receiver),
        "peek and pop taken off it": await (async () => { const { peek, pop } = receiver; return [await ending(() => peek()), await ending(() => pop())]; })(),
        "the ways it can also be asked, which it does not have": ["peekIsClaimedInjection", "failConsumedInjectionDelivery", "getContextInjectionToolSignal"].map((name) => typeof receiver[name]),
        "two of them share nothing but their class": new NoopConversationActionReceiver() !== receiver && Object.getPrototypeOf(new NoopConversationActionReceiver()) === Object.getPrototypeOf(receiver),
      };
    },
  },
];

/** The two listeners that stand between the wrapped side and the plain side, by what each does for its delegate. */
const BETWEEN = [["toUnredactedInteractionListener", "the listener that wraps for its delegate"], ["toRedactedInteractionListener", "the listener that unwraps for its delegate"]];

/** A stand-in for a wrapped value that notes how it is asked for its content. */
function notingUnwraps(calls, content = "what the stand-in holds") {
  return {
    unwrap(...given) {
      calls.push(given.map((value) => shown(value)));
      return content;
    },
  };
}

const betweenScenarios = [
  {
    name: "the usual words: what a wrapped value says when a purpose is held back from it, and when it is given",
    run: async (m) => {
      const form = await wrappedUpdate(m, m.updates.Updates.textDelta("the agent's words"), 2);
      const leaf = form.message.value.text;
      const asked = (purpose, options) => listeningToConsole(() => {
        try {
          return leaf.unwrap(purpose, options);
        } catch (error) {
          return { threw: said(error) };
        }
      });
      const three = (purpose) => ({
        plainly: asked(purpose),
        enforced: asked(purpose, { enforcing: true }),
        "enforced, the placeholder asked for": asked(purpose, { enforcing: true, redactUnallowedFieldsInsteadOfThrowing: true }),
        "written in the tables as": cellFor(leaf, purpose),
      });
      return {
        "the value's labels": { __classification: leaf.__classification, __fieldName: leaf.__fieldName, __privacyMode: leaf.__privacyMode, __isRedacted: leaf.__isRedacted },
        "its line in the tables": shown(leaf),
        "its row in the tables": rowFor(leaf),
        "training, under no training": three("storage_for_training"),
        "usage, under no training": three("storage_for_usage"),
      };
    },
  },
  {
    name: "a listener between the two sides has four fields; the two for work after the turn are there only when its delegate has them",
    run: (m) => {
      const fn = () => {};
      const delegates = [
        ["a delegate with neither", {}],
        ["with both", { enqueuePostTurnEndedWork: fn, flushPostTurnEndedWork: fn }],
        ["with the first only", { enqueuePostTurnEndedWork: fn }],
        ["with the second only", { flushPostTurnEndedWork: fn }],
        ["with both set to undefined", { enqueuePostTurnEndedWork: undefined, flushPostTurnEndedWork: undefined }],
        ["with both null", { enqueuePostTurnEndedWork: null, flushPostTurnEndedWork: null }],
        ["with both a text", { enqueuePostTurnEndedWork: "soon", flushPostTurnEndedWork: "soon" }],
        ["with both zero", { enqueuePostTurnEndedWork: 0, flushPostTurnEndedWork: 0 }],
        ["one that asks nobody", new m.listener.NoopInteractionListener()],
      ];
      const out = {};
      for (const [make, words] of BETWEEN) {
        out[words] = Object.fromEntries(delegates.map(([word, delegate]) => {
          const made = m.wrapping[make](delegate, 2);
          return [word, Object.keys(made).map((key) => `${key}: ${typeof made[key] === "function" ? about(made[key]) : String(made[key])}`)];
        }));
        out[`${words}, made twice`] = m.wrapping[make]({}, 2) !== m.wrapping[make]({}, 2) ? "two listeners" : "one";
        out[`${words}, with no delegate`] = (() => { try { return Object.keys(m.wrapping[make](undefined, 2)); } catch (error) { return { threw: said(error) }; } })();
      }
      return out;
    },
  },
  {
    name: "work after the turn goes to the delegate as it is: its argument, the delegate itself, what the delegate gives",
    run: async (m) => {
      const out = {};
      for (const [make, words] of BETWEEN) {
        const calls = [];
        const delegate = {
          enqueuePostTurnEndedWork(...given) {
            calls.push(["enqueue", this === delegate, given.length, given[0] === work]);
            return "what enqueue gave";
          },
          flushPostTurnEndedWork(...given) {
            calls.push(["flush", this === delegate, given.length, given[0] === context]);
            return "what flush gave";
          },
        };
        const work = async () => "done";
        const context = { a: "context" };
        const between = m.wrapping[make](delegate, 2);
        const first = [await ending(() => between.enqueuePostTurnEndedWork(work, "more")), await ending(() => between.flushPostTurnEndedWork(context, "more"))];
        const promised = Promise.resolve("later");
        delegate.flushPostTurnEndedWork = () => promised;
        const samePromise = between.flushPostTurnEndedWork(context) === promised;
        delegate.enqueuePostTurnEndedWork = () => { calls.push(["the enqueue put in its place afterwards"]); };
        between.enqueuePostTurnEndedWork(work);
        delete delegate.enqueuePostTurnEndedWork;
        delete delegate.flushPostTurnEndedWork;
        out[words] = {
          "what came back": first,
          "a promise the delegate gives is given as it is": samePromise,
          "asked of the delegate: which, on the delegate, arguments, the very one given": calls,
          "once the delegate has lost them": [await ending(() => between.enqueuePostTurnEndedWork(work)), await ending(() => between.flushPostTurnEndedWork(context))],
        };
      }
      return out;
    },
  },
  {
    name: "an update goes to the delegate before sendUpdate returns, is waited for, and nothing comes back",
    run: async (m) => {
      const { Updates } = m.updates;
      const out = {};
      for (const [make, words] of BETWEEN) {
        const given = make === "toUnredactedInteractionListener" ? () => Updates.textDelta("words") : () => wrappedUpdate(m, Updates.textDelta("words"), 2);
        const context = { a: "context" };
        const calls = [];
        const log = [];
        const delegate = {
          sendUpdate(...args) {
            calls.push({ "on the delegate": this === delegate, arguments: args.length, "the very context": args[0] === context });
            log.push("the delegate got it");
            return new Promise((resolve) => setTimeout(() => { log.push("the delegate finished"); resolve("what the delegate gave"); }, 15));
          },
        };
        const update = await given();
        const sent = m.wrapping[make](delegate, 2).sendUpdate(context, update, "more");
        log.push("sendUpdate returned");
        const end = await ending(() => sent);
        log.push("sendUpdate finished");
        const failure = new Error("the delegate failed");
        const failing = (fail) => m.wrapping[make]({ sendUpdate: fail }, 2).sendUpdate(context, update);
        out[words] = {
          calls,
          log,
          end,
          "a delegate that gives no promise": await ending(() => m.wrapping[make]({ sendUpdate: () => "at once" }, 2).sendUpdate(context, update)),
          "a delegate that throws": { ...(await ending(() => failing(() => { throw failure; }))), "the very error": (await failureOf(() => failing(() => { throw failure; }))) === failure },
          "a delegate that refuses later": { ...(await ending(() => failing(() => Promise.reject(failure)))), "the very error": (await failureOf(() => failing(() => Promise.reject(failure)))) === failure },
          "a delegate that cannot take updates": await ending(() => m.wrapping[make]({}, 2).sendUpdate(context, update)),
          "sendUpdate taken off the listener works the same": await ending(() => { const { sendUpdate } = m.wrapping[make]({ sendUpdate: () => "at once" }, 2); return sendUpdate(context, update); }),
          "no update": await ending(() => m.wrapping[make](delegate, 2).sendUpdate(context)),
          "an update that is null": await ending(() => m.wrapping[make](delegate, 2).sendUpdate(context, null)),
          "the delegate was not asked for those two": calls.length,
        };
      }
      return out;
    },
  },
  {
    name: "a question goes to the delegate turned to the delegate's side, and its answer comes back turned to the asker's",
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionQuery } = await typesOf(m);
      const plainQuestion = new InteractionQuery({ id: 41, query: { case: "webSearchRequestQuery", value: { args: { searchTerm: "weather in Paris", toolCallId: "call-1" } } } });
      const plainAnswer = Responses.webSearchRejected(41, "not now");
      const sides = {
        toUnredactedInteractionListener: { question: () => plainQuestion, answer: async () => m.wrapping.toRedactedInteractionListener(keeping(plainAnswer), 2).query(null, await wrappedQuery(m, plainQuestion, 2)) },
        toRedactedInteractionListener: { question: () => wrappedQuery(m, plainQuestion, 2), answer: async () => plainAnswer },
      };
      const out = {};
      for (const [make, words] of BETWEEN) {
        const context = { a: "context" };
        const calls = [];
        const log = [];
        const delegateAnswer = await sides[make].answer();
        const delegate = {
          query(...args) {
            calls.push({ "on the delegate": this === delegate, arguments: args.length, "the very context": args[0] === context, question: shown(args[1], 2) });
            log.push("the delegate was asked");
            return new Promise((resolve) => setTimeout(() => { log.push("the delegate answered"); resolve(delegateAnswer); }, 15));
          },
        };
        const question = await sides[make].question();
        const asked = m.wrapping[make](delegate, 2).query(context, question, "more");
        log.push("query returned");
        const answer = await asked;
        log.push("query finished");
        const failure = new Error("the delegate failed");
        const answering = (answerWith) => m.wrapping[make]({ query: answerWith }, 2).query(context, question);
        out[words] = {
          calls,
          log,
          answer: shown(answer, 2),
          "the answer is not the delegate's own object": answer !== delegateAnswer,
          "a delegate that answers at once, with no promise": JSON.stringify(shown(await answering(() => delegateAnswer), 2)) === JSON.stringify(shown(answer, 2)),
          "query taken off the listener works the same": JSON.stringify(shown(await (() => { const { query } = m.wrapping[make]({ query: () => delegateAnswer }, 2); return query(context, question); })(), 2)) === JSON.stringify(shown(answer, 2)),
          "a delegate that throws": { ...(await ending(() => answering(() => { throw failure; }))), "the very error": (await failureOf(() => answering(() => { throw failure; }))) === failure },
          "a delegate that refuses later": { ...(await ending(() => answering(() => Promise.reject(failure)))), "the very error": (await failureOf(() => answering(() => Promise.reject(failure)))) === failure },
          "a delegate that gives no answer": await ending(() => answering(() => undefined), (value) => shown(value, 2)),
          "a delegate that gives null": await ending(() => answering(() => null), (value) => shown(value, 2)),
          "a delegate that gives an empty object": await ending(() => answering(() => ({})), (value) => shown(value, 2)),
          "a delegate that gives an id alone": await ending(() => answering(() => ({ id: 5 })), (value) => shown(value, 2)),
          "a delegate that cannot be asked": await ending(() => m.wrapping[make]({}, 2).query(context, question)),
          "no question": await ending(() => m.wrapping[make](delegate, 2).query(context)),
          "the delegate was not asked for that one": calls.length,
        };
      }
      return out;
    },
  },
  {
    name: "unwrapping asks every wrapped value for the purpose that is always allowed, and enforces nothing",
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionQuery } = await typesOf(m);
      const calls = { "an update's text": [], "a question's reason": [], "an answer's reason": [] };
      const update = { _privacyMode: 2, message: { case: "textDelta", value: { _privacyMode: 2, text: notingUnwraps(calls["an update's text"]), isServerNotice: false } } };
      const delegate = keeping(Responses.webFetchApproved(7));
      const between = m.wrapping.toRedactedInteractionListener(delegate, 2);
      await between.sendUpdate(null, update);
      const question = { _privacyMode: 2, id: 7, query: { case: "webFetchRequestQuery", value: { _privacyMode: 2, args: undefined, skipApproval: false, smartModeApproval: { _privacyMode: 2, requestId: "request-1", reason: notingUnwraps(calls["a question's reason"]) } } } };
      await between.query(null, question);
      const answer = { _privacyMode: 2, id: 7, result: { case: "webSearchRequestResponse", value: { _privacyMode: 2, result: { case: "rejected", value: { _privacyMode: 2, reason: notingUnwraps(calls["an answer's reason"]) } } } } };
      const plainAnswer = await m.wrapping.toUnredactedInteractionListener(keeping(answer), 2).query(null, new InteractionQuery({ id: 7 }));
      return {
        "how each stand-in was asked": calls,
        "what reached the delegate": [shown(delegate.kept.updates[0]), shown(delegate.kept.queries[0])],
        "what came back to the asker": shown(plainAnswer),
      };
    },
  },
  {
    name: "wrapping is done under the mode the listener was made with, whatever mode the wrapped answer or update says",
    run: async (m) => {
      const { Updates } = m.updates;
      const { Responses } = m.queries;
      const { InteractionQuery } = await typesOf(m);
      const question = new InteractionQuery({ id: 7, query: { case: "webFetchRequestQuery", value: { args: { url: "https://example.com/page" }, smartModeApproval: { requestId: "request-1", reason: "the person named the page" } } } });
      const underOne = await wrappedUpdate(m, Updates.textDelta("words"), 1);
      const questionUnderOne = await wrappedQuery(m, question, 1);
      const delegate = keeping(Responses.webFetchRejected(7, "not now"));
      const madeWithFour = m.wrapping.toRedactedInteractionListener(delegate, 4);
      await madeWithFour.sendUpdate(null, underOne);
      const answer = await madeWithFour.query(null, questionUnderOne);
      const answerUnderOne = await m.wrapping.toRedactedInteractionListener(keeping(Responses.webFetchRejected(7, "not now")), 1).query(null, questionUnderOne);
      const wrapsWithThree = keeping(answerUnderOne);
      const plain = await m.wrapping.toUnredactedInteractionListener(wrapsWithThree, 3).query(null, question);
      return {
        "an update and a question wrapped under no storage, unwrapped by a listener made with codebase training": [shown(delegate.kept.updates[0]), shown(delegate.kept.queries[0])],
        "the answer it wraps": shown(answer),
        "its modes other than codebase training": otherModesIn(answer, 4),
        "a listener made with data training wraps the question": otherModesIn(wrapsWithThree.kept.queries[0], 3),
        "and unwraps an answer wrapped under no storage": shown(plain),
      };
    },
  },
  {
    name: "a mode that is no mode: the wrapping takes it as it comes",
    run: async (m) => {
      const { Updates } = m.updates;
      const odd = [["5", 5], ["-1", -1], ["2.5", 2.5], ['the text "2"', "2"], ["NaN", Number.NaN], ["undefined", undefined], ["null", null]];
      const out = {};
      for (const [word, mode] of odd) {
        const delegate = keeping();
        const end = await ending(() => m.wrapping.toUnredactedInteractionListener(delegate, mode).sendUpdate(null, Updates.activeBranchChange("/home/ada/project", "main")), () => "sent");
        if (!("resolved" in end)) {
          out[word] = end;
          continue;
        }
        const form = delegate.kept.updates[0];
        const leaf = form.message.value.path;
        const back = keeping();
        out[word] = {
          wrapped: shown(form),
          "the value's labels": { __privacyMode: shown(leaf.__privacyMode), __isRedacted: leaf.__isRedacted },
          "what each purpose gets": Object.fromEntries(PURPOSES.map(([purposeWord, purpose]) => [purposeWord, cellFor(leaf, purpose)])),
          unwrapped: await ending(() => m.wrapping.toRedactedInteractionListener(back, mode).sendUpdate(null, form).then(() => back.kept.updates[0])),
        };
      }
      return out;
    },
  },
  {
    name: "what the wrapping does not know is handed on empty: no kind, a kind nobody knows",
    run: async (m) => {
      const { InteractionUpdate, InteractionQuery, InteractionResponse } = await typesOf(m);
      const { Responses } = m.queries;
      const wrapUpdate = async (update) => {
        const delegate = keeping();
        const end = await ending(() => m.wrapping.toUnredactedInteractionListener(delegate, 2).sendUpdate(null, update), () => "sent");
        return "resolved" in end ? shown(delegate.kept.updates[0]) : end;
      };
      const unwrapUpdate = async (form) => {
        const delegate = keeping();
        const end = await ending(() => m.wrapping.toRedactedInteractionListener(delegate, 2).sendUpdate(null, form), () => "sent");
        return "resolved" in end ? shown(delegate.kept.updates[0]) : end;
      };
      const wrapQuestion = async (question) => {
        const delegate = keeping(undefined);
        await m.wrapping.toUnredactedInteractionListener(delegate, 2).query(null, question).catch(() => {});
        return shown(delegate.kept.queries[0]);
      };
      const unwrapQuestion = async (form) => {
        const delegate = keeping(Responses.webSearchApproved(1));
        const end = await ending(() => m.wrapping.toRedactedInteractionListener(delegate, 2).query(null, form), () => "asked");
        return "resolved" in end ? shown(delegate.kept.queries[0]) : end;
      };
      const wrapAnswer = (answer) => ending(() => m.wrapping.toRedactedInteractionListener(keeping(answer), 2).query(null, { _privacyMode: 2, id: 1, query: { case: undefined } }));
      const unwrapAnswer = (form) => ending(() => m.wrapping.toUnredactedInteractionListener(keeping(form), 2).query(null, new InteractionQuery()));
      return {
        updates: {
          "wrapping one of no kind": await wrapUpdate(new InteractionUpdate()),
          "wrapping one of a kind nobody knows": await wrapUpdate({ message: { case: "somethingNew", value: { text: "words that go nowhere" } } }),
          "wrapping one with no message field": await wrapUpdate({}),
          "unwrapping one of no kind": await unwrapUpdate({ _privacyMode: 2, message: { case: undefined, value: undefined } }),
          "unwrapping one of a kind nobody knows": await unwrapUpdate({ _privacyMode: 2, message: { case: "somethingNew", value: { text: "words that go nowhere" } } }),
          "unwrapping one with no message field": await unwrapUpdate({}),
        },
        questions: {
          "wrapping one of no kind": await wrapQuestion(new InteractionQuery({ id: 3 })),
          "wrapping one of a kind nobody knows": await wrapQuestion({ id: 3, query: { case: "somethingNew", value: { words: "that go nowhere" } } }),
          "unwrapping one of no kind": await unwrapQuestion({ _privacyMode: 2, id: 3, query: { case: undefined, value: undefined } }),
          "unwrapping one of a kind nobody knows": await unwrapQuestion({ _privacyMode: 2, id: 3, query: { case: "somethingNew", value: {} } }),
        },
        answers: {
          "wrapping one of no kind": await wrapAnswer(new InteractionResponse({ id: 3 })),
          "wrapping one of a kind nobody knows": await wrapAnswer({ id: 3, result: { case: "somethingNew", value: { words: "that go nowhere" } } }),
          "unwrapping one of no kind": await unwrapAnswer({ _privacyMode: 2, id: 3, result: { case: undefined, value: undefined } }),
          "unwrapping one of a kind nobody knows": await unwrapAnswer({ _privacyMode: 2, id: 3, result: { case: "somethingNew", value: {} } }),
        },
      };
    },
  },
  {
    name: "through both listeners, one behind the other, a question and its answer arrive as they were sent",
    run: async (m) => {
      const { Responses } = m.queries;
      const { InteractionQuery } = await typesOf(m);
      const out = {};
      for (const [word, mode] of MODES) {
        const plainSide = keeping((question) => Responses.generateImageApproved(question.id, question.query.value.args.description));
        const asker = m.wrapping.toUnredactedInteractionListener(m.wrapping.toRedactedInteractionListener(plainSide, mode), mode);
        const question = new InteractionQuery({ id: 77, query: { case: "generateImageRequestQuery", value: { args: { description: "a cat on a roof", filePath: "/home/ada/cat.png" }, toolCallId: "call-9" } } });
        const answer = await asker.query("the context", question);
        const update = m.updates.Updates.activeBranchChange("/home/ada/project", "main");
        await asker.sendUpdate("the context", update);
        out[word] = {
          "the question arrived equal, as a new message": plainSide.kept.queries[0] !== question && plainSide.kept.queries[0].equals(question),
          "the update arrived equal, as a new message": plainSide.kept.updates[0] !== update && plainSide.kept.updates[0].equals(update),
          "the context arrived each time": plainSide.kept.contexts,
          answer: shown(answer),
        };
      }
      return out;
    },
  },
];

/** The plain builders, each with ordinary values to build from, in the table's own order. */
const PLAIN_BUILDS = {
  textDelta: ["the agent's words"],
  toolCallStarted: ["call-1", SAMPLE.toolCall, "model-call-1"],
  toolCallCompleted: ["call-1", SAMPLE.toolCall, "model-call-1"],
  toolCallDelta: ["call-1", { delta: { case: "editToolCallDelta", value: { streamContentDelta: "+ a new line" } } }, "model-call-1"],
  thinkingDelta: ["the agent's thinking", 2],
  thinkingCompleted: [1200],
  userMessageAppended: [SAMPLE.userMessage],
  partialToolCall: ["call-1", SAMPLE.toolCall, "model-call-1"],
  tokenDelta: [17],
  summary: ["what was said so far"],
  summaryStarted: [],
  heartbeat: [],
  summaryCompleted: ["what a hook said"],
  shellOutputDelta: [{ case: "stdout", value: { data: "total 8" } }],
  turnEnded: [SAMPLE.usage],
  stepStarted: [3],
  stepCompleted: [3, 4500],
  promptSuggestion: ["Run the tests?"],
  activeBranchChange: ["/home/ada/project", "main"],
  feedbackRequest: ["request-1", "model-x", [SAMPLE.category], [SAMPLE.group], SAMPLE.copy],
};

const updatesScenarios = [
  {
    name: "the plain updates, each built from ordinary values",
    run: (m) => {
      const { Updates } = m.updates;
      const out = {};
      for (const [name, given] of Object.entries(PLAIN_BUILDS)) {
        const builder = Updates[name];
        const update = Updates[name](...given);
        out[name] = {
          update: shown(update),
          "a new one each time, the same called on its own": update !== Updates[name](...given) && update.message.value !== Updates[name](...given).message.value && builder(...given).equals(update),
        };
      }
      return { "every builder is in the table": JSON.stringify(Object.keys(Updates)) === JSON.stringify(Object.keys(PLAIN_BUILDS)), ...out };
    },
  },
  {
    name: "the plain updates: what is left out stays out, and what is no such value is taken as it comes",
    run: async (m) => {
      const { Updates } = m.updates;
      const built = (run) => ending(run);
      return {
        "text that is empty, missing, a number": [await built(() => Updates.textDelta("")), await built(() => Updates.textDelta()), await built(() => Updates.textDelta(12))],
        "a tool call with nothing given": await built(() => Updates.toolCallStarted()),
        "a tool call with no tool call": await built(() => Updates.toolCallStarted("call-1", undefined, "model-call-1")),
        "a completed tool call with no tool call": await built(() => Updates.toolCallCompleted("call-1", undefined, "model-call-1")),
        "a tool call's piece with no piece": await built(() => Updates.toolCallDelta("call-1", undefined, "model-call-1")),
        "a tool call being written with no tool call, and a fourth argument": await built(() => Updates.partialToolCall("call-1", undefined, "model-call-1", "ignored")),
        "a tool call that is null": await built(() => Updates.toolCallStarted("call-1", null, "model-call-1")),
        "thinking with no style, and with nothing": [await built(() => Updates.thinkingDelta("thinking")), await built(() => Updates.thinkingDelta())],
        "the end of thinking with nothing, zero, a fraction": [await built(() => Updates.thinkingCompleted()), await built(() => Updates.thinkingCompleted(0)), await built(() => Updates.thinkingCompleted(1.5))],
        "a person's message that is missing": await built(() => Updates.userMessageAppended()),
        "a person's message that is null": await built(() => Updates.userMessageAppended(null)),
        "tokens: nothing, zero, less than zero": [await built(() => Updates.tokenDelta()), await built(() => Updates.tokenDelta(0)), await built(() => Updates.tokenDelta(-4))],
        "a summary with nothing": await built(() => Updates.summary()),
        "the end of a summary with nothing, with empty text": [await built(() => Updates.summaryCompleted()), await built(() => Updates.summaryCompleted(""))],
        "a command's output of each kind": [
          await built(() => Updates.shellOutputDelta({ case: "stderr", value: { data: "not found" } })),
          await built(() => Updates.shellOutputDelta({ case: "exit", value: { code: 1, cwd: "/home/ada/project", aborted: false } })),
          await built(() => Updates.shellOutputDelta({ case: "start", value: {} })),
        ],
        "a command's output with nothing, of no kind, of a kind nobody knows": [await built(() => Updates.shellOutputDelta()), await built(() => Updates.shellOutputDelta({ case: undefined })), await built(() => Updates.shellOutputDelta({ case: "somethingNew", value: { data: "x" } }))],
        "a suggestion with nothing": await built(() => Updates.promptSuggestion()),
        "a branch with nothing, with a path alone": [await built(() => Updates.activeBranchChange()), await built(() => Updates.activeBranchChange("/home/ada/project"))],
        "arguments nobody asked for change nothing": [await built(() => Updates.heartbeat("more")), await built(() => Updates.summaryStarted("more"))],
      };
    },
  },
  {
    name: "the plain updates: messages handed in are kept as they are",
    run: async (m) => {
      const { Updates } = m.updates;
      const { InteractionUpdate } = await typesOf(m);
      const ToolCall = typeAt(InteractionUpdate, "toolCallStarted", "toolCall");
      const ToolCallDelta = typeAt(InteractionUpdate, "toolCallDelta", "toolCallDelta");
      const UserMessage = typeAt(InteractionUpdate, "userMessageAppended", "userMessage");
      const Category = typeAt(InteractionUpdate, "feedbackRequest", "categories");
      const Group = typeAt(InteractionUpdate, "feedbackRequest", "categoryGroups");
      const toolCall = new ToolCall(SAMPLE.toolCall);
      const delta = new ToolCallDelta(filled(ToolCallDelta));
      const userMessage = new UserMessage(SAMPLE.userMessage);
      const categories = [new Category(SAMPLE.category)];
      const groups = [new Group(SAMPLE.group)];
      const feedback = Updates.feedbackRequest("request-1", "model-x", categories, groups).message.value;
      return {
        "the very tool call": [
          Updates.toolCallStarted("call-1", toolCall, "m").message.value.toolCall === toolCall,
          Updates.toolCallCompleted("call-1", toolCall, "m").message.value.toolCall === toolCall,
          Updates.partialToolCall("call-1", toolCall, "m").message.value.toolCall === toolCall,
        ],
        "the very piece of a tool call": Updates.toolCallDelta("call-1", delta, "m").message.value.toolCallDelta === delta,
        "the very message of the person's": Updates.userMessageAppended(userMessage).message.value.userMessage === userMessage,
        "feedback: a list of its own holding the very categories": [feedback.categories !== categories, feedback.categories[0] === categories[0]],
        "feedback: a list of its own holding the very groups": [feedback.categoryGroups !== groups, feedback.categoryGroups[0] === groups[0]],
      };
    },
  },
  {
    name: "the end of a turn: what it used is counted in whole numbers, or left out altogether",
    run: async (m) => {
      const { Updates } = m.updates;
      const used = (usage) => ending(() => Updates.turnEnded(usage), (update) => shown(update.message.value));
      const four = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
      return {
        "nothing given": await ending(() => Updates.turnEnded()),
        "undefined, null, zero, empty text, false": [await used(undefined), await used(null), await used(0), await used(""), await used(false)],
        "the four counts": await used(four),
        "with thinking tokens": await used({ ...four, reasoningTokens: 5 }),
        "thinking tokens that are null, undefined, zero": [await used({ ...four, reasoningTokens: null }), await used({ ...four, reasoningTokens: undefined }), await used({ ...four, reasoningTokens: 0 })],
        "all zero": await used({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }),
        "counts as text, as true, as a BigInt": await used({ inputTokens: "12", outputTokens: true, cacheReadTokens: 7n, cacheWriteTokens: "0x10" }),
        "the largest whole number a count can be, and one beyond": await used({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 2 ** 53, cacheReadTokens: -1, cacheWriteTokens: 1e21 }),
        "an empty object": await used({}),
        "one count missing": await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 }),
        "a count that is a fraction": await used({ ...four, outputTokens: 2.5 }),
        "a count that is no number": await used({ ...four, cacheReadTokens: Number.NaN }),
        "a count that is text but no number": await used({ ...four, cacheWriteTokens: "many" }),
        "a count that is null": await used({ ...four, inputTokens: null }),
        "thinking tokens that are a fraction": await used({ ...four, reasoningTokens: 0.5 }),
        "true in place of the counts": await used(true),
        "more than the counts": await used({ ...four, somethingElse: 9 }),
        "several counts wrong: the first in the order input, output, cache read, cache write, thinking fails": [
          await used({ inputTokens: "many", outputTokens: 2.5, cacheReadTokens: undefined, cacheWriteTokens: 4 }),
          await used({ inputTokens: 1, outputTokens: 2.5, cacheReadTokens: "many", cacheWriteTokens: undefined }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: "many", cacheWriteTokens: undefined, reasoningTokens: 0.5 }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: undefined, reasoningTokens: 0.5 }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0.5, reasoningTokens: "many" }),
        ],
      };
    },
  },
  {
    name: "a step's number and how long it took are whole numbers",
    run: async (m) => {
      const { Updates } = m.updates;
      const started = (...given) => ending(() => Updates.stepStarted(...given), (update) => shown(update.message.value));
      const completed = (...given) => ending(() => Updates.stepCompleted(...given), (update) => shown(update.message.value));
      return {
        "started: 3, 0, the text 7, true, a BigInt": [await started(3), await started(0), await started("7"), await started(true), await started(9n)],
        "started: -1, the largest whole number": [await started(-1), await started(Number.MAX_SAFE_INTEGER)],
        "started: a fraction, no number, nothing, null, text that is no number": [await started(1.5), await started(Number.NaN), await started(), await started(null), await started("three")],
        "completed: 3 after 4500, 0 after 0, less than zero": [await completed(3, 4500), await completed(0, 0), await completed(3, -1)],
        "completed: the text 3 after the text 4500": await completed("3", "4500"),
        "completed: a time that is a fraction, missing, null": [await completed(3, 0.5), await completed(3), await completed(3, null)],
        "completed: a number that is a fraction, missing": [await completed(3.5, 100), await completed(undefined, 100)],
        "completed: nothing": await completed(),
        "completed: both wrong, the number's failure comes first": [await completed(1.5, "soon"), await completed("three", 0.5)],
      };
    },
  },
  {
    name: "a request for feedback: its categories, its groups and its words",
    run: async (m) => {
      const { Updates } = m.updates;
      const asked = (...given) => ending(() => Updates.feedbackRequest(...given), (update) => shown(update.message.value));
      return {
        "an id, a model, no categories": await asked("request-1", "model-x", []),
        "no model": await asked("request-1", undefined, [SAMPLE.category]),
        "a model that is empty text, null": [await asked("request-1", "", []), await asked("request-1", null, [])],
        "groups left out, undefined, empty": [await asked("request-1", "model-x", [SAMPLE.category]), await asked("request-1", "model-x", [SAMPLE.category], undefined), await asked("request-1", "model-x", [SAMPLE.category], [])],
        "words left out, undefined, empty": [await asked("request-1", "model-x", [], [SAMPLE.group]), await asked("request-1", "model-x", [], [SAMPLE.group], undefined), await asked("request-1", "model-x", [], [SAMPLE.group], {})],
        "each of the words alone": [await asked("r", "m", [], [], { title: "A title" }), await asked("r", "m", [], [], { negativeTitle: "A negative title" }), await asked("r", "m", [], [], { commentPlaceholder: "A placeholder" })],
        "words that are empty text, and more than the words": await asked("r", "m", [], [], { title: "", negativeTitle: "", commentPlaceholder: "", somethingElse: "dropped" }),
        "categories from a set, groups from a generator": await asked("r", "m", new Set([SAMPLE.category, { id: "rude", label: "It was rude" }]), (function* groups() { yield SAMPLE.group; })()),
        "categories that are text": await asked("r", "m", "ab"),
        "no categories at all": await asked("request-1", "model-x"),
        "categories that are null": await asked("request-1", "model-x", null),
        "categories that are a number": await asked("request-1", "model-x", 5),
        "groups that are null": await asked("request-1", "model-x", [], null),
        "words that are null": await asked("request-1", "model-x", [], [], null),
        "nothing": await asked(),
      };
    },
  },
];

const EDIT_PIECE = { delta: { case: "editToolCallDelta", value: { streamContentDelta: "+ a new line" } } };
const DELIVERED = { kind: "delivered", step: 4, deliveryBatchId: "batch-1", deliveredAtMs: 1763000000000 };
/** A tool call still being written, with the piece of its arguments that just came: the plain builders have no way to give that piece. */
const partialWithArguments = (types) => new types.InteractionUpdate({ message: { case: "partialToolCall", value: { callId: "call-1", toolCall: SAMPLE.toolCall, argsTextDelta: '{"command": "ls', modelCallId: "model-call-1" } } });

/** The wrapped pieces the wrapped builders take, made under a mode by wrapping plain updates. */
async function wrappedPieces(m, types, mode) {
  const { Updates } = m.updates;
  const inside = async (update) => (await wrappedUpdate(m, update, mode)).message.value;
  return {
    text: (await inside(Updates.textDelta("the agent's words"))).text,
    thinking: (await inside(Updates.thinkingDelta("the agent's thinking", 2))).text,
    toolCall: (await inside(Updates.toolCallStarted("call-1", SAMPLE.toolCall, "model-call-1"))).toolCall,
    toolCallDelta: (await inside(Updates.toolCallDelta("call-1", EDIT_PIECE, "model-call-1"))).toolCallDelta,
    argumentsPiece: (await inside(partialWithArguments(types))).argsTextDelta,
    userMessage: (await inside(Updates.userMessageAppended(SAMPLE.userMessage))).userMessage,
    summary: (await inside(Updates.summary("what was said so far"))).summary,
    hookMessage: (await inside(Updates.summaryCompleted("what a hook said"))).hookMessage,
    shellEvent: (await inside(Updates.shellOutputDelta({ case: "stdout", value: { data: "total 8" } }))).event,
    suggestion: (await inside(Updates.promptSuggestion("Run the tests?"))).suggestion,
    path: (await inside(Updates.activeBranchChange("/home/ada/project", "main"))).path,
  };
}

/**
 * The wrapped builders: what each is called with (from the wrapped pieces
 * and the mode), and the plain update that says the same, built by the
 * plain builders where they can.
 */
const WRAPPED_BUILDS = [
  ["textDelta", "a piece of the agent's text", (pieces) => [pieces.text], (Updates) => Updates.textDelta("the agent's words")],
  ["toolCallStarted", "a tool call that started", (pieces) => ["call-1", pieces.toolCall, "model-call-1"], (Updates) => Updates.toolCallStarted("call-1", SAMPLE.toolCall, "model-call-1")],
  ["toolCallCompleted", "a tool call that completed", (pieces) => ["call-1", pieces.toolCall, "model-call-1"], (Updates) => Updates.toolCallCompleted("call-1", SAMPLE.toolCall, "model-call-1")],
  ["toolCallDelta", "a piece of a tool call's output", (pieces) => ["call-1", pieces.toolCallDelta, "model-call-1"], (Updates) => Updates.toolCallDelta("call-1", EDIT_PIECE, "model-call-1")],
  ["thinkingDelta", "a piece of the agent's thinking", (pieces) => [pieces.thinking, 2], (Updates) => Updates.thinkingDelta("the agent's thinking", 2)],
  ["thinkingCompleted", "the end of the thinking", (_pieces, mode) => [mode, 1200], (Updates) => Updates.thinkingCompleted(1200)],
  ["userMessageAppended", "a message of the person's", (pieces) => [pieces.userMessage], (Updates) => Updates.userMessageAppended(SAMPLE.userMessage)],
  ["partialToolCall", "a tool call still being written", (pieces) => ["call-1", pieces.toolCall, "model-call-1", pieces.argumentsPiece], (_Updates, types) => partialWithArguments(types)],
  ["tokenDelta", "a count of tokens", (_pieces, mode) => [mode, 17], (Updates) => Updates.tokenDelta(17)],
  ["summary", "a summary of the conversation", (pieces) => [pieces.summary], (Updates) => Updates.summary("what was said so far")],
  ["summaryStarted", "the start of a summary", (_pieces, mode) => [mode], (Updates) => Updates.summaryStarted()],
  ["heartbeat", "a heartbeat", (_pieces, mode) => [mode], (Updates) => Updates.heartbeat()],
  ["contextInjectionState", "the state of something added to the context", (_pieces, mode) => [mode, "injection-1", DELIVERED], (_Updates, types) => new types.InteractionUpdate({ message: { case: "contextInjectionState", value: { injectionId: "injection-1", state: { state: { case: "delivered", value: { step: 4, deliveryBatchId: "batch-1", deliveredAtMs: 1763000000000n } } } } } })],
  ["summaryCompleted", "the end of a summary", (pieces, mode) => [mode, pieces.hookMessage], (Updates) => Updates.summaryCompleted("what a hook said")],
  ["shellOutputDelta", "a piece of a command's output", (pieces, mode) => [mode, pieces.shellEvent], (Updates) => Updates.shellOutputDelta({ case: "stdout", value: { data: "total 8" } })],
  ["turnEnded", "the end of the turn with what it used", (_pieces, mode) => [mode, SAMPLE.usage], (Updates) => Updates.turnEnded(SAMPLE.usage)],
  ["stepStarted", "the start of a step", (_pieces, mode) => [mode, 3], (Updates) => Updates.stepStarted(3)],
  ["stepCompleted", "the end of a step", (_pieces, mode) => [mode, 3, 4500], (Updates) => Updates.stepCompleted(3, 4500)],
  ["promptSuggestion", "a suggested next message", (pieces) => [pieces.suggestion], (Updates) => Updates.promptSuggestion("Run the tests?")],
  ["activeBranchChange", "a change of the branch worked on", (pieces) => [pieces.path, "main"], (Updates) => Updates.activeBranchChange("/home/ada/project", "main")],
  ["feedbackRequest", "a request for feedback", (_pieces, mode) => ["request-1", "model-x", mode, [SAMPLE.category], [SAMPLE.group], SAMPLE.copy], (Updates) => Updates.feedbackRequest("request-1", "model-x", [SAMPLE.category], [SAMPLE.group], SAMPLE.copy)],
];

const wrappedUpdatesScenarios = [
  {
    name: "the wrapped builders written down here are all there are, in their order",
    run: (m) => JSON.stringify(Object.keys(m.wrappedUpdates.RedactedUpdates)) === JSON.stringify(WRAPPED_BUILDS.map(([name]) => name)),
  },
  ...WRAPPED_BUILDS.map(([name, words, argumentsFor, plainFor]) => ({
    name: `a wrapped update built by hand under every mode, and unwrapped: ${words} (${name})`,
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const types = await typesOf(m);
      const plainOne = plainFor(m.updates.Updates, types);
      const sameAsWrapping = {};
      const holdsWhatItWasGiven = {};
      const through = await throughEveryMode(
        plainOne,
        async (mode) => {
          const pieces = await wrappedPieces(m, types, mode);
          const given = argumentsFor(pieces, mode);
          const form = RedactedUpdates[name](...given);
          const builder = RedactedUpdates[name];
          const twin = builder(...given);
          sameAsWrapping[mode] = JSON.stringify(shown(form, mode), (_key, item) => (typeof item === "bigint" ? `${item}n` : item)) === JSON.stringify(shown(await wrappedUpdate(m, plainOne, mode), mode), (_key, item) => (typeof item === "bigint" ? `${item}n` : item));
          const handedIn = given.filter((value) => Object.values(pieces).includes(value));
          const text = (value) => JSON.stringify(shown(value, mode), (_key, item) => (typeof item === "bigint" ? `${item}n` : item));
          holdsWhatItWasGiven[mode] = form !== twin && form.message !== twin.message && form.message.value !== twin.message.value && text(form) === text(twin)
            && handedIn.every((value) => Object.values(form.message.value).includes(value));
          return form;
        },
        (mode, form) => unwrappedUpdate(m, form, mode),
      );
      const everyMode = (byMode) => (Object.values(byMode).every((value) => value === true) ? "under every mode" : Object.values(byMode).every((value) => value === false) ? "under no mode" : byMode);
      return {
        ...through,
        "exactly the form that wrapping the plain update gives": everyMode(sameAsWrapping),
        "a new form each time, the same called on its own, holding the very wrapped pieces handed in": everyMode(holdsWhatItWasGiven),
      };
    },
  })),
  {
    name: "the wrapped builders take their mode from the wrapped piece they are handed, whatever it is",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const types = await typesOf(m);
      const underOne = await wrappedPieces(m, types, 1);
      const build = (name, ...given) => ending(() => RedactedUpdates[name](...given));
      const fromText = ["textDelta", "thinkingDelta", "summary", "promptSuggestion", "activeBranchChange"];
      const fromCarrier = ["toolCallStarted", "toolCallCompleted", "toolCallDelta", "partialToolCall"];
      const out = {};
      for (const name of fromText) {
        out[name] = {
          "a wrapped text made under no storage": (await build(name, underOne.text, "second")).returned?._privacyMode,
          "anything that says a mode": await build(name, { __privacyMode: 4 }, "second"),
          "plain text": await build(name, "plain words", "second"),
          "an empty object": await build(name, {}, "second"),
          "nothing": await build(name),
          "null": await build(name, null),
        };
      }
      for (const name of fromCarrier) {
        out[name] = {
          "a wrapped tool call made under no storage": (await build(name, "call-1", underOne.toolCall, "model-call-1")).returned?._privacyMode,
          "anything that says a mode": await build(name, "call-1", { _privacyMode: 4 }, "model-call-1", "fourth"),
          "an empty object": await build(name, "call-1", {}, "model-call-1"),
          "plain text": await build(name, "call-1", "plain words", "model-call-1"),
          "nothing but the id": await build(name, "call-1"),
          "null": await build(name, "call-1", null, "model-call-1"),
        };
      }
      out.userMessageAppended = {
        "a wrapped message made under no storage": (await build("userMessageAppended", underOne.userMessage)).returned?._privacyMode,
        "anything that says a mode": await build("userMessageAppended", { _privacyMode: 4 }),
        "nothing": await build("userMessageAppended"),
        "null": await build("userMessageAppended", null),
      };
      return out;
    },
  },
  {
    name: "the wrapped builders that are told the mode take it, and the rest, as they come",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const build = (name, ...given) => ending(() => RedactedUpdates[name](...given));
      const out = {};
      for (const name of ["thinkingCompleted", "tokenDelta", "summaryStarted", "heartbeat", "summaryCompleted", "shellOutputDelta"]) {
        out[name] = {
          "mode 3 and a value": await build(name, 3, "a value", "more"),
          "mode 3 alone": await build(name, 3),
          "a mode that is none": await build(name, "not a mode", null),
          "nothing": await build(name),
        };
      }
      return out;
    },
  },
  {
    name: "a wrapped update built by hand that holds plain text where wrapped text belongs cannot be unwrapped",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      return {
        "plain text": await ending(() => unwrappedUpdate(m, RedactedUpdates.textDelta("plain words"))),
        "a plain summary": await ending(() => unwrappedUpdate(m, RedactedUpdates.summary("plain words"))),
        "a plain hook message": await ending(() => unwrappedUpdate(m, RedactedUpdates.summaryCompleted(2, "plain words"))),
        "no hook message": await ending(() => unwrappedUpdate(m, RedactedUpdates.summaryCompleted(2))),
        "an empty tool call": await ending(() => unwrappedUpdate(m, RedactedUpdates.toolCallStarted("call-1", { _privacyMode: 2 }, "model-call-1"))),
        "a command's output of no kind": await ending(() => unwrappedUpdate(m, RedactedUpdates.shellOutputDelta(2, undefined))),
      };
    },
  },
  {
    name: "the state of something added to the context: each state, what each keeps, and a state nobody knows",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const everything = { step: 4, deliveryBatchId: "batch-1", deliveredAtMs: 1763000000000, reason: "too late", somethingElse: "dropped" };
      const state = (given) => ending(() => RedactedUpdates.contextInjectionState(2, "injection-1", given), (form) => shown(form.message.value.state));
      const whole = async (given) => {
        const built = await ending(() => RedactedUpdates.contextInjectionState(2, "injection-1", given), (form) => form);
        return "returned" in built ? ending(() => unwrappedUpdate(m, built.returned), (update) => shown(update.message.value)) : built;
      };
      const out = {};
      for (const kind of ["queued", "delivered", "queued_for_next_turn", "cancelled", "rejected"]) {
        out[kind] = { "with everything a state can carry": await state({ kind, ...everything }), "unwrapped": await whole({ kind, ...everything }), "with the kind alone": await state({ kind }) };
      }
      return {
        ...out,
        "delivered at a time given as text, as a BigInt, as zero": [await state({ kind: "delivered", deliveredAtMs: "1763000000000" }), await state({ kind: "delivered", deliveredAtMs: 1763000000000n }), await state({ kind: "delivered", deliveredAtMs: 0 })],
        "delivered at a time that is a fraction, text that is no number, null": [await state({ kind: "delivered", deliveredAtMs: 1.5 }), await state({ kind: "delivered", deliveredAtMs: "soon" }), await state({ kind: "delivered", deliveredAtMs: null })],
        "rejected with no reason, unwrapped": await whole({ kind: "rejected" }),
        "a kind nobody knows": await ending(() => RedactedUpdates.contextInjectionState(2, "injection-1", { kind: "paused", reason: "x" })),
        "a kind nobody knows, unwrapped": await whole({ kind: "paused" }),
        "a kind in other letters": await state({ kind: "QUEUED" }),
        "no kind": await state({}),
        "no state": await state(undefined),
        "a state that is null": await state(null),
        "the mode and the id as they come": await ending(() => RedactedUpdates.contextInjectionState("not a mode", undefined, { kind: "queued" })),
      };
    },
  },
  {
    name: "the end of a turn, wrapped: what it used is counted in whole numbers, or left out altogether",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const used = (usage) => ending(() => RedactedUpdates.turnEnded(2, usage), (form) => shown(form.message.value));
      const four = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
      return {
        "no usage": await ending(() => RedactedUpdates.turnEnded(2)),
        "undefined, null, zero, empty text, false": [await used(undefined), await used(null), await used(0), await used(""), await used(false)],
        "the four counts": await used(four),
        "with thinking tokens": await used({ ...four, reasoningTokens: 5 }),
        "thinking tokens that are null, undefined, zero": [await used({ ...four, reasoningTokens: null }), await used({ ...four, reasoningTokens: undefined }), await used({ ...four, reasoningTokens: 0 })],
        "counts as text, as true, as a BigInt": await used({ inputTokens: "12", outputTokens: true, cacheReadTokens: 7n, cacheWriteTokens: "0x10" }),
        "the largest whole number a count can be, and one beyond": await used({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 2 ** 53, cacheReadTokens: -1, cacheWriteTokens: 1e21 }),
        "an empty object": await used({}),
        "one count missing": await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 }),
        "a count that is a fraction": await used({ ...four, outputTokens: 2.5 }),
        "a count that is text but no number": await used({ ...four, cacheWriteTokens: "many" }),
        "a count that is null": await used({ ...four, inputTokens: null }),
        "thinking tokens that are a fraction": await used({ ...four, reasoningTokens: 0.5 }),
        "true in place of the counts": await used(true),
        "text in place of the counts": await used("ab"),
        "more than the counts": await used({ ...four, somethingElse: 9 }),
        "several counts wrong: the first in the order input, output, cache read, cache write, thinking fails": [
          await used({ inputTokens: "many", outputTokens: 2.5, cacheReadTokens: undefined, cacheWriteTokens: 4 }),
          await used({ inputTokens: 1, outputTokens: 2.5, cacheReadTokens: "many", cacheWriteTokens: undefined }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: "many", cacheWriteTokens: undefined, reasoningTokens: 0.5 }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: undefined, reasoningTokens: 0.5 }),
          await used({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0.5, reasoningTokens: "many" }),
        ],
        "counts unwrapped": await ending(() => unwrappedUpdate(m, RedactedUpdates.turnEnded(2, { ...four, reasoningTokens: 5 })), (update) => shown(update.message.value)),
        "no usage unwrapped": await ending(() => unwrappedUpdate(m, RedactedUpdates.turnEnded(2)), (update) => shown(update.message.value)),
      };
    },
  },
  {
    name: "a step's number and how long it took, wrapped, are whole numbers",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const started = (...given) => ending(() => RedactedUpdates.stepStarted(2, ...given), (form) => shown(form.message.value));
      const completed = (...given) => ending(() => RedactedUpdates.stepCompleted(2, ...given), (form) => shown(form.message.value));
      return {
        "started: 3, 0, the text 7, true, a BigInt, -1": [await started(3), await started(0), await started("7"), await started(true), await started(9n), await started(-1)],
        "started: a fraction, no number, nothing, null, text that is no number": [await started(1.5), await started(Number.NaN), await started(), await started(null), await started("three")],
        "completed: 3 after 4500, 0 after 0, less than zero": [await completed(3, 4500), await completed(0, 0), await completed(3, -1)],
        "completed: the text 3 after the text 4500, BigInts": [await completed("3", "4500"), await completed(3n, 4500n)],
        "completed: a time that is a fraction, missing, null": [await completed(3, 0.5), await completed(3), await completed(3, null)],
        "completed: a number that is a fraction, missing": [await completed(3.5, 100), await completed(undefined, 100)],
        "completed: both wrong, the number's failure comes first": [await completed(1.5, "soon"), await completed("three", 0.5)],
        "the mode as it comes": [await ending(() => RedactedUpdates.stepStarted(undefined, 1)), await ending(() => RedactedUpdates.stepCompleted("not a mode", 1, 2))],
      };
    },
  },
  {
    name: "a request for feedback, wrapped: its categories, its groups and its words",
    run: async (m) => {
      const { RedactedUpdates } = m.wrappedUpdates;
      const asked = (...given) => ending(() => RedactedUpdates.feedbackRequest(...given), (form) => shown(form.message.value));
      const more = { id: "wrong", label: "It was wrong", somethingElse: "dropped" };
      return {
        "an id, a model, a mode, no categories": await ending(() => RedactedUpdates.feedbackRequest("request-1", "model-x", 3, [])),
        "groups left out, undefined, empty": [await asked("r", "m", 2, [SAMPLE.category]), await asked("r", "m", 2, [SAMPLE.category], undefined), await asked("r", "m", 2, [SAMPLE.category], [])],
        "words left out, undefined, empty": [await asked("r", "m", 2, [], [SAMPLE.group]), await asked("r", "m", 2, [], [SAMPLE.group], undefined), await asked("r", "m", 2, [], [SAMPLE.group], {})],
        "each of the words alone": [await asked("r", "m", 2, [], [], { title: "A title" }), await asked("r", "m", 2, [], [], { negativeTitle: "A negative title" }), await asked("r", "m", 2, [], [], { commentPlaceholder: "A placeholder" })],
        "more than a category, a group and the words hold": await asked("r", "m", 2, [more, {}], [{ id: "why", prompt: "What went wrong?", categories: [more], somethingElse: "dropped" }], { title: "A title", somethingElse: "dropped" }),
        "a model that is empty text, missing": [await asked("r", "", 2, []), await asked("r", undefined, 2, [])],
        "a mode that is none": await asked("r", "m", "not a mode", [SAMPLE.category], [SAMPLE.group]),
        "the lists are new ones": (() => { const categories = [SAMPLE.category]; const groups = [SAMPLE.group]; const value = RedactedUpdates.feedbackRequest("r", "m", 2, categories, groups).message.value; return [value.categories !== categories, value.categories[0] !== categories[0], value.categoryGroups !== groups, value.categoryGroups[0].categories !== SAMPLE.group.categories]; })(),
        "no categories at all": await asked("r", "m", 2),
        "categories that are null": await asked("r", "m", 2, null),
        "categories that are no list": await asked("r", "m", 2, new Set([SAMPLE.category])),
        "a category that is nothing": await asked("r", "m", 2, [undefined]),
        "groups that are null": await asked("r", "m", 2, [], null),
        "a group with no categories": await asked("r", "m", 2, [], [{ id: "why", prompt: "What went wrong?" }]),
        "words that are null": await asked("r", "m", 2, [], [], null),
        "nothing": await asked(),
        "unwrapped, with everything": await ending(() => unwrappedUpdate(m, RedactedUpdates.feedbackRequest("request-1", "model-x", 2, [SAMPLE.category], [SAMPLE.group], SAMPLE.copy)), (update) => shown(update.message.value)),
        "unwrapped, with the least": await ending(() => unwrappedUpdate(m, RedactedUpdates.feedbackRequest("request-1", "", 2, [])), (update) => shown(update.message.value)),
      };
    },
  },
];

/** A goal's state, with what the scenario changes in it. */
const goalState = (changes = {}) => ({ goalId: "123e4567-e89b-12d3-a456-426614174000", status: 1, conversationId: "conversation-1", ...changes });
/** A table: every row called and its ending written beside its name. */
async function table(rows, call) {
  const out = {};
  for (const [word, ...given] of rows) out[word] = await ending(() => call(...given));
  return out;
}

const goalScenarios = [
  {
    name: "a goal: the status that means active, and what an id looks like",
    run: (m) => {
      const { GOAL_STATUS_ACTIVE, GOAL_ID_PATTERN } = m.goal;
      const good = "123e4567-e89b-12d3-a456-426614174000";
      const ids = [
        good, good.toUpperCase(), "123E4567-e89b-12D3-a456-426614174000", "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff",
        "", "123e4567-e89b-12d3-a456-42661417400", `${good}0`, ` ${good}`, `${good}\n`, `{${good}}`, good.replaceAll("-", ""), "123e4567e-89b-12d3-a456-426614174000",
        "g23e4567-e89b-12d3-a456-426614174000", "123e4567_e89b_12d3_a456_426614174000", `${good}\n${good}`, undefined, null, 12, { toString: () => good },
      ];
      return {
        GOAL_STATUS_ACTIVE,
        GOAL_ID_PATTERN,
        "what matches": ids.map((id) => `${typeof id === "string" ? JSON.stringify(id) : id === null || typeof id !== "object" ? String(id) : "an object that says the good id"}: ${GOAL_ID_PATTERN.test(id)}`),
        "asked twice, the same answer": GOAL_ID_PATTERN.test(good) === GOAL_ID_PATTERN.test(good) && GOAL_ID_PATTERN.lastIndex === 0,
      };
    },
  },
  {
    name: "a goal's time worked is what its state has counted, as a number",
    run: (m) => table([
      ["no state", undefined],
      ["a state that is null", null],
      ["a state with no count", {}],
      ["zero", { activeDurationMs: 0n }],
      ["five seconds", { activeDurationMs: 5000n }],
      ["a count beyond what a number holds exactly", { activeDurationMs: 9007199254740993n }],
      ["a count below zero", { activeDurationMs: -1n }],
      ["a count that is null", { activeDurationMs: null }],
      ["a count that is a number", { activeDurationMs: 250 }],
      ["a count that is text", { activeDurationMs: "750" }],
      ["a count that is text but no number", { activeDurationMs: "long" }],
      ["a count that is zero as a number", { activeDurationMs: 0 }],
      ["a state that is text", "state"],
    ], m.goal.goalWorkedMs),
  },
  {
    name: "a goal's elapsed time: what was counted, plus the time since counting last started, never less",
    run: (m) => table([
      ["nothing running", 1000, undefined, 5000],
      ["running since 4000, now 5000", 1000, 4000, 5000],
      ["running since now", 1000, 5000, 5000],
      ["running since one millisecond ago", 1000, 4999, 5000],
      ["started later than now", 1000, 5001, 5000],
      ["started much later than now", 1000, 9000, 5000],
      ["running since zero", 0, 0, 5000],
      ["running since null", 1000, null, 5000],
      ["now is no number", 1000, 4000, Number.NaN],
      ["the start is no number", 1000, Number.NaN, 5000],
      ["what was counted is no number", Number.NaN, 4000, 5000],
      ["now is missing", 1000, 4000],
      ["everything missing", undefined, undefined, undefined],
      ["nothing counted, nothing running", 0, undefined, 0],
      ["fractions", 0.5, 0.25, 1],
      ["below zero counted", -500, 4000, 5000],
    ], m.goal.goalElapsedMsFrom),
  },
  {
    name: "a goal's elapsed time, read from its state",
    run: (m) => table([
      ["no state", undefined, 5000],
      ["a state that is null", null, 5000],
      ["an empty state", {}, 5000],
      ["counted, not running", { activeDurationMs: 1000n }, 5000],
      ["counted and running since 4000", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }, 5000],
      ["running since 4000, nothing counted", { lastAccruedAtMs: 4000n }, 5000],
      ["running since now", { activeDurationMs: 1000n, lastAccruedAtMs: 5000n }, 5000],
      ["started later than now", { activeDurationMs: 1000n, lastAccruedAtMs: 5001n }, 5000],
      ["running since zero", { activeDurationMs: 1000n, lastAccruedAtMs: 0n }, 5000],
      ["a start that is null", { activeDurationMs: 1000n, lastAccruedAtMs: null }, 5000],
      ["a start that is a number", { activeDurationMs: 1000n, lastAccruedAtMs: 4000 }, 5000],
      ["a start that is text", { activeDurationMs: 1000n, lastAccruedAtMs: "4000" }, 5000],
      ["a start that is text but no number", { activeDurationMs: 1000n, lastAccruedAtMs: "then" }, 5000],
      ["now missing", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }],
      ["now missing, not running", { activeDurationMs: 1000n }],
    ], m.goal.goalElapsedMs),
  },
  {
    name: "a goal that becomes active keeps what it counted and starts counting from now",
    run: (m) => table([
      ["no state", undefined, 5000],
      ["a state that is null", null, 5000],
      ["an empty state", {}, 5000],
      ["counted before", { activeDurationMs: 1000n }, 5000],
      ["already running", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }, 5000],
      ["a count that is null", { activeDurationMs: null }, 5000],
      ["a count that is a number", { activeDurationMs: 250 }, 5000],
      ["a count of zero as a number", { activeDurationMs: 0 }, 5000],
      ["now is zero", { activeDurationMs: 1000n }, 0],
      ["now is a fraction", { activeDurationMs: 1000n }, 5000.5],
      ["now is missing", { activeDurationMs: 1000n }],
      ["now is text", { activeDurationMs: 1000n }, "5000"],
      ["now is no number", { activeDurationMs: 1000n }, Number.NaN],
    ], m.goal.goalClockOnActivation),
  },
  {
    name: "a goal that stops being active counts the time up to now and stops counting",
    run: async (m) => ({
      ...(await table([
        ["no state", undefined, 5000],
        ["a state that is null", null, 5000],
        ["an empty state", {}, 5000],
        ["counted, not running", { activeDurationMs: 1000n }, 5000],
        ["counted and running since 4000", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }, 5000],
        ["running since now", { activeDurationMs: 1000n, lastAccruedAtMs: 5000n }, 5000],
        ["started later than now", { activeDurationMs: 1000n, lastAccruedAtMs: 9000n }, 5000],
        ["running, now a fraction", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }, 5000.5],
        ["not running, now a fraction", { activeDurationMs: 1000n }, 5000.5],
        ["running, now missing", { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }],
        ["a count that is text but no number", { activeDurationMs: "long" }, 5000],
      ], m.goal.goalClockOnDeactivation)),
      "the fields it gives, in their order": Object.keys(m.goal.goalClockOnDeactivation({ activeDurationMs: 1000n, lastAccruedAtMs: 4000n }, 5000)),
      "the state it was given is left as it was": (() => { const state = { activeDurationMs: 1000n, lastAccruedAtMs: 4000n }; m.goal.goalClockOnDeactivation(state, 5000); m.goal.goalClockOnActivation(state, 6000); return shown(state); })(),
      "started and stopped, as the engine does it": (() => {
        const state = goalState();
        Object.assign(state, m.goal.goalClockOnActivation(state, 1000));
        const running = m.goal.goalElapsedMs(state, 1600);
        Object.assign(state, m.goal.goalClockOnDeactivation(state, 2500));
        Object.assign(state, m.goal.goalClockOnActivation(state, 9000));
        Object.assign(state, m.goal.goalClockOnDeactivation(state, 9400));
        return { "elapsed while running": running, state: shown(state), worked: m.goal.goalWorkedMs(state) };
      })(),
    }),
  },
  {
    name: "a goal's owner: no owner on record is anyone's; an owner on record must be named, exactly",
    run: (m) => table([
      ["no owner on record, none given", goalState(), undefined],
      ["no owner on record, one given", goalState(), "session-1"],
      ["the owner on record, given", goalState({ agentSessionId: "session-1" }), "session-1"],
      ["another one given", goalState({ agentSessionId: "session-1" }), "session-2"],
      ["none given", goalState({ agentSessionId: "session-1" }), undefined],
      ["empty text given", goalState({ agentSessionId: "session-1" }), ""],
      ["other letters given", goalState({ agentSessionId: "session-1" }), "Session-1"],
      ["an empty owner on record, empty text given", goalState({ agentSessionId: "" }), ""],
      ["an empty owner on record, none given", goalState({ agentSessionId: "" }), undefined],
      ["an owner on record that is null", goalState({ agentSessionId: null }), "session-1"],
      ["an owner that is null given", goalState({ agentSessionId: "session-1" }), null],
      ["an owner on record that is a number, the same given", goalState({ agentSessionId: 7 }), 7],
      ["owners that are lists of the same content", goalState({ agentSessionId: ["a"] }), ["a"]],
      ["no state", undefined, "session-1"],
    ], m.goal.isGoalOwnerValid),
  },
  {
    name: "a goal's identity: by its conversation when no owner is on record, by its owner otherwise",
    run: (m) => table([
      ["no owner on record, the same conversation", goalState(), { conversationId: "conversation-1" }],
      ["no owner on record, the same conversation and an owner given", goalState(), { conversationId: "conversation-1", agentSessionId: "session-1" }],
      ["no owner on record, another conversation", goalState(), { conversationId: "conversation-2" }],
      ["no owner on record, no conversation on record, none given", goalState({ conversationId: undefined }), {}],
      ["no owner on record, no conversation on record, one given", goalState({ conversationId: undefined }), { conversationId: "conversation-1" }],
      ["the owner on record given, another conversation", goalState({ agentSessionId: "session-1" }), { conversationId: "conversation-2", agentSessionId: "session-1" }],
      ["the owner on record given, the same conversation", goalState({ agentSessionId: "session-1" }), { conversationId: "conversation-1", agentSessionId: "session-1" }],
      ["an owner on record, another given", goalState({ agentSessionId: "session-1" }), { conversationId: "conversation-1", agentSessionId: "session-2" }],
      ["an owner on record, none given", goalState({ agentSessionId: "session-1" }), { conversationId: "conversation-1" }],
      ["an empty owner on record", goalState({ agentSessionId: "" }), { conversationId: "conversation-1", agentSessionId: "" }],
      ["no identity given", goalState(), undefined],
      ["no state", undefined, { conversationId: "conversation-1" }],
    ], m.goal.isGoalIdentityValid),
  },
  {
    name: "a goal's state is well-shaped when it is there, is this conversation's or owner's, is active and has a well-made id",
    run: async (m) => {
      const here = { conversationId: "conversation-1" };
      const asked = [];
      const pattern = m.goal.GOAL_ID_PATTERN;
      pattern.test = (text) => {
        asked.push(text);
        return true;
      };
      let withPatternWrittenOn;
      try {
        withPatternWrittenOn = [m.goal.isGoalStateShapeValid(goalState({ goalId: "anything" }), here), m.goal.isGoalStateShapeValid(goalState({ goalId: "anything", status: 2 }), here)];
      } finally {
        delete pattern.test;
      }
      return {
        ...(await table([
          ["a good state", goalState(), here],
          ["no state", undefined, here],
          ["a state that is null", null, here],
          ["another conversation", goalState(), { conversationId: "conversation-2" }],
          ["the owner on record given", goalState({ agentSessionId: "session-1" }), { conversationId: "conversation-9", agentSessionId: "session-1" }],
          ["an owner on record, none given", goalState({ agentSessionId: "session-1" }), here],
          ["status 0", goalState({ status: 0 }), here],
          ["status 2", goalState({ status: 2 }), here],
          ["no status", goalState({ status: undefined }), here],
          ["status as the text 1", goalState({ status: "1" }), here],
          ["an id in capitals", goalState({ goalId: "123E4567-E89B-12D3-A456-426614174000" }), here],
          ["an id one character short", goalState({ goalId: "123e4567-e89b-12d3-a456-42661417400" }), here],
          ["an id with a line after it", goalState({ goalId: "123e4567-e89b-12d3-a456-426614174000\n" }), here],
          ["no id", goalState({ goalId: undefined }), here],
          ["an empty id", goalState({ goalId: "" }), here],
          ["no identity given", goalState(), undefined],
        ], m.goal.isGoalStateShapeValid)),
        "the id is checked with the pattern handed out, as it is at that moment": { answers: withPatternWrittenOn, "what the pattern was asked": asked },
        "and with the pattern put back": m.goal.isGoalStateShapeValid(goalState({ goalId: "anything" }), here),
      };
    },
  },
];

const guidelinesScenarios = [
  {
    name: "the guidelines for an agent pursuing a goal, word for word: with no tool named, with each, with both",
    run: (m) => {
      const { buildGoalPursuitGuidelines } = m.guidelines;
      const texts = {
        "no tool named": buildGoalPursuitGuidelines(),
        "the plan tool named": buildGoalPursuitGuidelines({ todoWriteToolName: "TodoWrite" }),
        "the goal tool named": buildGoalPursuitGuidelines({ updateGoalToolName: "UpdateGoal" }),
        "both named": buildGoalPursuitGuidelines({ todoWriteToolName: "TodoWrite", updateGoalToolName: "UpdateGoal" }),
      };
      return { texts, lengths: Object.fromEntries(Object.entries(texts).map(([word, text]) => [word, text.length])) };
    },
  },
  {
    name: "the guidelines for an agent pursuing a goal: names that are missing, empty or odd",
    run: async (m) => {
      const { buildGoalPursuitGuidelines } = m.guidelines;
      const none = buildGoalPursuitGuidelines();
      const both = buildGoalPursuitGuidelines({ todoWriteToolName: "TodoWrite", updateGoalToolName: "UpdateGoal" });
      /** What a text says where it differs from the text with both tools named: its own lines that the other does not have. */
      const ownLines = (text, other = both) => text.split("\n").filter((line) => !other.split("\n").includes(line));
      const sameAsNone = (given) => buildGoalPursuitGuidelines(given) === none;
      return {
        "the same as with no tool named": {
          "an empty object": sameAsNone({}),
          "undefined": sameAsNone(undefined),
          "both names undefined": sameAsNone({ todoWriteToolName: undefined, updateGoalToolName: undefined }),
          "other fields only": sameAsNone({ somethingElse: "x" }),
          "a text in place of the names": sameAsNone("TodoWrite"),
        },
        "names that are empty text": ownLines(buildGoalPursuitGuidelines({ todoWriteToolName: "", updateGoalToolName: "" })),
        "names that are null": ownLines(buildGoalPursuitGuidelines({ todoWriteToolName: null, updateGoalToolName: null })),
        "names that are numbers": ownLines(buildGoalPursuitGuidelines({ todoWriteToolName: 0, updateGoalToolName: 1 })),
        "names with signs a replacement would read": ownLines(buildGoalPursuitGuidelines({ todoWriteToolName: "$& $1 ${x}", updateGoalToolName: "$`\\n" })),
        "a name over two lines": ownLines(buildGoalPursuitGuidelines({ updateGoalToolName: "Update\nGoal" })),
        "the lines only the text with no tool named has": ownLines(none),
        "the lines only the text with both named has": ownLines(both, none),
        "null in place of the names": await ending(() => buildGoalPursuitGuidelines(null)),
        "each call gives the same text": buildGoalPursuitGuidelines() === buildGoalPursuitGuidelines() && buildGoalPursuitGuidelines({ todoWriteToolName: "a" }) === buildGoalPursuitGuidelines({ todoWriteToolName: "a" }),
      };
    },
  },
];

const everyKindScenarios = [
  {
    name: "the kinds of update, question and answer written down here are all the kinds there are",
    run: async (m) => {
      const types = await typesOf(m);
      const names = (type, choice) => kindsOf(type, choice).map(([name]) => name);
      return {
        updates: { kinds: names(types.InteractionUpdate, "message"), "each has a scenario": JSON.stringify(names(types.InteractionUpdate, "message")) === JSON.stringify(UPDATE_KINDS.map(([kind]) => kind)) },
        questions: { kinds: names(types.InteractionQuery, "query"), "each has a scenario": JSON.stringify(names(types.InteractionQuery, "query")) === JSON.stringify(QUERY_KINDS.map(([kind]) => kind)) },
        answers: { kinds: names(types.InteractionResponse, "result"), "each has a scenario": JSON.stringify(names(types.InteractionResponse, "result")) === JSON.stringify(RESPONSE_KINDS.map(([kind]) => kind)) },
      };
    },
  },
  ...UPDATE_KINDS.map(([kind, words]) => ({
    name: `wrapped and unwrapped under every mode, an update: ${words} (${kind})`,
    run: (m) => updateThroughModes(m, kind),
  })),
  ...QUERY_KINDS.map(([kind, words]) => ({
    name: `wrapped and unwrapped under every mode, a question: ${words} (${kind})`,
    run: (m) => queryThroughModes(m, kind),
  })),
  ...RESPONSE_KINDS.map(([kind, words]) => ({
    name: `wrapped and unwrapped under every mode, an answer ${words} (${kind})`,
    run: (m) => responseThroughModes(m, kind),
  })),
];

export const scenarios = [
  ...surfaceScenarios,
  ...queryScenarios,
  ...listenerScenarios,
  ...betweenScenarios,
  ...everyKindScenarios,
  ...updatesScenarios,
  ...wrappedUpdatesScenarios,
  ...goalScenarios,
  ...guidelinesScenarios,
];
