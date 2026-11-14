/** Fixed words, numbers and small checks the engine's parts share: the ids of agent stores, the cloud computer's screen address and archive lists, and the texts of a question answered by itself, a diff and a system notification. */
export const part = "packages/constants";
export const modules = {
  storeIds: "source/packages/constants/agent-store-ids.ts",
  sendMessage: "source/packages/constants/project-send-message.ts",
  notification: "source/packages/constants/system-notification.ts",
  gitDiff: "source/packages/constants/git-diff.ts",
  conversation: "source/packages/constants/project-conversation.ts",
  askQuestion: "source/packages/constants/ask-question.ts",
  cloudAgent: "source/packages/constants/cloud-agent.ts",
  classifier: "source/packages/constants/smart-mode-classifier.ts",
  box: "source/packages/constants/sand-box.ts",
  archive: "source/packages/constants/sand-box-archive.ts",
};

/** A UUID with the version and the variant asked for: the two places the id checks look at. */
const uuid = ({ version = "4", variant = "a" } = {}) => `123e4567-e89b-${version}2d3-${variant}456-426614174000`;
const UUID = uuid();
/** The largest whole number that is still exact, and the two after it. */
const LARGEST = "9007199254740991";
const ONE_MORE = "9007199254740992";
const TWO_MORE = "9007199254740993";

/** Each thing given with what a check or a reader answers for it. */
const asked = (ask, given) => given.map((value) => [value, ask(value)]);

/** What a function is besides its answers: its name, how many parameters it counts, and whether it could be used with `new`. */
const kindOf = (fn) => ({ name: fn.name, parameters: fn.length, hasPrototype: Object.hasOwn(fn, "prototype") });

/** Something that is written out as `text`, and notes each time it is. */
function noting(notes, label, text) {
  return {
    toString() {
      notes.push(label);
      return text;
    },
  };
}

/** An object whose fields note each time they are read. */
function notingReads(reads, fields) {
  const out = {};
  for (const [name, value] of Object.entries(fields)) {
    Object.defineProperty(out, name, {
      enumerable: true,
      get() {
        reads.push(name);
        return value;
      },
    });
  }
  return out;
}

/** What a call threw, or the word "nothing". */
function thrownBy(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  return "nothing";
}

export const scenarios = [
  // ── agent-store-ids.ts ────────────────────────────────────────────────────
  {
    name: "agent stores: the names of the mounts, the reserved folder and the setting that names the files folder",
    run: ({ storeIds }) => ({
      AGENT_STORE_USER_MOUNT_NAME: storeIds.AGENT_STORE_USER_MOUNT_NAME,
      AGENT_STORE_TEAM_MOUNT_NAME: storeIds.AGENT_STORE_TEAM_MOUNT_NAME,
      AGENT_STORE_AUTOMATION_MOUNT_NAME: storeIds.AGENT_STORE_AUTOMATION_MOUNT_NAME,
      AGENT_STORE_RESERVED_SIMEON_PATH_PREFIX: storeIds.AGENT_STORE_RESERVED_SIMEON_PATH_PREFIX,
      NAMED_AGENT_HOME_STORE_MOUNT_NAME: storeIds.NAMED_AGENT_HOME_STORE_MOUNT_NAME,
      SIMEON_AGENT_STORE_FILES_DIR_ENV: storeIds.SIMEON_AGENT_STORE_FILES_DIR_ENV,
    }),
  },
  {
    name: "a bare id is a UUID whose version is 1 to 5 or 7 and whose variant is 8, 9, a or b, in any capitals",
    run: ({ storeIds }) => ({
      versions: asked(storeIds.isValidBareUuid, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "f"].map((version) => uuid({ version }))),
      variants: asked(storeIds.isValidBareUuid, ["0", "7", "8", "9", "a", "b", "c", "f", "A", "B", "C"].map((variant) => uuid({ variant }))),
      capitals: asked(storeIds.isValidBareUuid, [UUID.toUpperCase(), "123E4567-e89B-42d3-A456-426614174000", "abcdefab-cdef-4bcd-8bcd-abcdefabcdef", "ABCDEFAB-CDEF-7BCD-BBCD-ABCDEFABCDEF"]),
      wellKnown: asked(storeIds.isValidBareUuid, ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "00000000-0000-1000-8000-000000000000", "ffffffff-ffff-7fff-bfff-ffffffffffff"]),
    }),
  },
  {
    name: "a bare id is nothing but the UUID: no spaces, no line break, no brackets, no other letters, no other length",
    run: ({ storeIds }) => asked(storeIds.isValidBareUuid, [
      "",
      " ",
      ` ${UUID}`,
      `${UUID} `,
      `${UUID}\n`,
      `\n${UUID}`,
      `${UUID}\n${UUID}`,
      `{${UUID}}`,
      `urn:uuid:${UUID}`,
      UUID.replaceAll("-", ""),
      UUID.replaceAll("-", "_"),
      UUID.replaceAll("-", " "),
      UUID.slice(1),
      UUID.slice(0, -1),
      `0${UUID}`,
      `${UUID}0`,
      `g${UUID.slice(1)}`,
      `${UUID.slice(0, -1)}g`,
      "123e4567e-89b-42d3-a456-426614174000",
      "123e456-e89b-42d3-a456-426614174000",
      "123e4567-e89bb-42d3-a456-426614174000",
      "123e4567-e89-42d3-a456-426614174000",
      "123e4567-e89b-42d-a456-426614174000",
      "123e4567-e89b-42d3-a45-426614174000",
      `store-${UUID}`,
      `bc-${UUID}`,
      "u1",
      "not an id",
    ]),
  },
  {
    name: "a store's id is store- and such a UUID, the word store in any capitals too",
    run: ({ storeIds }) => asked(storeIds.isAgentStoreId, [
      `store-${UUID}`,
      `store-${UUID.toUpperCase()}`,
      `STORE-${UUID}`,
      `Store-${UUID.toUpperCase()}`,
      `store-${uuid({ version: "1" })}`,
      `store-${uuid({ version: "7", variant: "b" })}`,
      `store-${uuid({ version: "6" })}`,
      `store-${uuid({ version: "8" })}`,
      `store-${uuid({ variant: "c" })}`,
      `store-${uuid({ variant: "7" })}`,
      UUID,
      `store${UUID}`,
      `store_${UUID}`,
      `store--${UUID}`,
      `store-store-${UUID}`,
      `stores-${UUID}`,
      `xstore-${UUID}`,
      ` store-${UUID}`,
      `store-${UUID} `,
      `store-${UUID}\n`,
      `store- ${UUID}`,
      `store-${UUID.slice(0, -1)}`,
      `store-${UUID}0`,
      `store-${"a".repeat(24)}`,
      `bc-${UUID}`,
      "store-",
      "store",
      "",
    ]),
  },
  {
    name: "a cloud agent's id is bc-, then a name of small letters, digits and lines that ends with a line or no name at all, then such a UUID",
    run: ({ storeIds }) => asked(storeIds.isCloudAgentStoreId, [
      `bc-${UUID}`,
      `bc-${UUID.toUpperCase()}`,
      `BC-${UUID}`,
      `Bc-${UUID.toUpperCase()}`,
      `bc-name-${UUID}`,
      `bc-my-agent-2-${UUID}`,
      `bc-a-${UUID}`,
      `bc-0-${UUID}`,
      `bc-007-${UUID}`,
      `bc-a--${UUID}`,
      `bc-a---b-${UUID}`,
      `bc-Name-${UUID}`,
      `bc-NAME-${UUID}`,
      `bc-${UUID}-${UUID}`,
      `bc-${uuid({ version: "6" })}-${UUID}`,
      `bc-name-${uuid({ version: "1", variant: "8" })}`,
      `bc-name-${uuid({ version: "7", variant: "b" })}`,
      `bc-${"long-name-".repeat(30)}${UUID}`,
    ]),
  },
  {
    name: "a cloud agent's id with a name that starts with a line, holds another sign, or is not followed by a line, is not one; nor is one with a UUID of another version",
    run: ({ storeIds }) => asked(storeIds.isCloudAgentStoreId, [
      `bc--${UUID}`,
      `bc---${UUID}`,
      `bc--a-${UUID}`,
      `bc-_a-${UUID}`,
      `bc-a_b-${UUID}`,
      `bc-a.b-${UUID}`,
      `bc-a b-${UUID}`,
      `bc-a/b-${UUID}`,
      `bc-ñ-${UUID}`,
      `bc-name${UUID}`,
      `bc-name_${UUID}`,
      `bc-name-${uuid({ version: "6" })}`,
      `bc-name-${uuid({ version: "0" })}`,
      `bc-name-${uuid({ variant: "c" })}`,
      `bc-${uuid({ version: "6" })}`,
      `bc-${UUID}-`,
      `bc-${UUID}-name`,
      `bc-${UUID}\n`,
      `bc-${UUID} `,
      ` bc-${UUID}`,
      `xbc-${UUID}`,
      `bc${UUID}`,
      `bc_${UUID}`,
      `b-${UUID}`,
      `store-${UUID}`,
      UUID,
      "bc-name-",
      "bc-",
      "bc",
      "",
    ]),
  },
  {
    name: "a source id is a cloud agent's id or a bare UUID, and nothing else",
    run: ({ storeIds }) => asked(storeIds.isAgentStoreSourceId, [
      UUID,
      UUID.toUpperCase(),
      `bc-${UUID}`,
      `bc-name-${UUID}`,
      `BC-NAME-${UUID.toUpperCase()}`,
      uuid({ version: "7", variant: "8" }),
      uuid({ version: "6" }),
      uuid({ variant: "c" }),
      `bc-${uuid({ version: "6" })}`,
      `bc--${UUID}`,
      `store-${UUID}`,
      `store-${"a".repeat(24)}`,
      "u1",
      "t1",
      "t1-u1",
      ` ${UUID}`,
      `${UUID}\n`,
      "",
    ]),
  },
  {
    name: "a share's mount key is store- in small letters and exactly 24 letters, digits, lines or underlines",
    run: ({ storeIds }) => asked(storeIds.isAgentStoreShareMountKey, [
      `store-${"a".repeat(24)}`,
      `store-${"Z".repeat(24)}`,
      `store-${"0".repeat(24)}`,
      `store-${"-".repeat(24)}`,
      `store-${"_".repeat(24)}`,
      `store-${"aZ09_-".repeat(4)}`,
      `store-${"a".repeat(23)}`,
      `store-${"a".repeat(25)}`,
      `store-${"a".repeat(48)}`,
      `STORE-${"a".repeat(24)}`,
      `Store-${"a".repeat(24)}`,
      `store_${"a".repeat(24)}`,
      `store${"a".repeat(24)}`,
      `store-${"a".repeat(23)}+`,
      `store-${"a".repeat(23)}/`,
      `store-${"a".repeat(23)}=`,
      `store-${"a".repeat(23)}.`,
      `store-${"a".repeat(23)} `,
      `store-${"a".repeat(23)}é`,
      `store-${"a".repeat(24)}\n`,
      ` store-${"a".repeat(24)}`,
      `store-${UUID}`,
      `store-${UUID.replaceAll("-", "").slice(0, 24)}`,
      "a".repeat(30),
      "store-",
      "",
    ]),
  },
  {
    name: "a person's source id is u and their number, with t, a team's number and a line before it or not; what comes back names the person first",
    run: ({ storeIds }) => asked(storeIds.parseUserAgentStoreSourceId, [
      "u1",
      "u9",
      "u10",
      "u42",
      "u1234567890",
      "t7-u42",
      "t1-u1",
      "t10-u20",
      "t42-u7",
    ]),
  },
  {
    name: "a person's source id with a nought first, other signs, capitals, spaces or anything around it is not one",
    run: ({ storeIds }) => asked(storeIds.parseUserAgentStoreSourceId, [
      "",
      "u",
      "u0",
      "u00",
      "u01",
      "u-1",
      "u+1",
      "u1.0",
      "u1e3",
      "u1_000",
      "u0x10",
      "u１",
      "u١",
      "U1",
      "user1",
      "1",
      "t1",
      "t0-u1",
      "t01-u1",
      "t1-u0",
      "t1-u01",
      "t-u1",
      "t1-",
      "t1-u",
      "T1-u1",
      "t1-U1",
      "t1_u1",
      "t1u1",
      "t1--u1",
      "t1-t2-u3",
      "u1-t1",
      "x-u1",
      " u1",
      "u1 ",
      "u1\n",
      "\nu1",
      "u1\nu2",
      "t1 -u1",
      `bc-${UUID}`,
      UUID,
    ]),
  },
  {
    name: "a number too large to be exact makes a person's or a team's source id no id at all: the last that counts is 9007199254740991",
    run: ({ storeIds }) => ({
      person: asked(storeIds.parseUserAgentStoreSourceId, [
        `u${LARGEST}`,
        `u${ONE_MORE}`,
        `u${TWO_MORE}`,
        "u9007199254740990",
        "u10000000000000000",
        `u${"9".repeat(30)}`,
        `u${"9".repeat(400)}`,
        `t${LARGEST}-u${LARGEST}`,
        `t${ONE_MORE}-u1`,
        `t1-u${ONE_MORE}`,
        `t${ONE_MORE}-u${ONE_MORE}`,
        `t${"9".repeat(400)}-u1`,
        `t${LARGEST}-u1`,
        `t1-u${LARGEST}`,
      ]),
      team: asked(storeIds.parseTeamAgentStoreSourceId, [`t${LARGEST}`, `t${ONE_MORE}`, `t${TWO_MORE}`, "t9007199254740990", "t10000000000000000", `t${"9".repeat(30)}`, `t${"9".repeat(400)}`]),
    }),
  },
  {
    name: "a team's source id is t and its number, and nothing else",
    run: ({ storeIds }) => asked(storeIds.parseTeamAgentStoreSourceId, [
      "t1",
      "t9",
      "t10",
      "t42",
      "t1234567890",
      "",
      "t",
      "t0",
      "t00",
      "t01",
      "t-1",
      "t+1",
      "t1.0",
      "t1e3",
      "t１",
      "T1",
      "team1",
      "1",
      "u1",
      "t1-u2",
      "t1-",
      "tt1",
      " t1",
      "t1 ",
      "t1\n",
      "\nt1",
      "t1\nt2",
      UUID,
    ]),
  },
  {
    name: "the id checks answer the same however often they are asked, give a new answer each time, and read what is not a text as it is written out",
    run: ({ storeIds }) => {
      const twice = (ask, value) => [ask(value), ask(value), ask(value)];
      const first = storeIds.parseUserAgentStoreSourceId("t7-u42");
      const second = storeIds.parseUserAgentStoreSourceId("t7-u42");
      const team = storeIds.parseTeamAgentStoreSourceId("t7");
      const notes = [];
      const written = storeIds.parseUserAgentStoreSourceId(noting(notes, "written out", "t3-u9"));
      const timesWrittenOut = (ask, text) => {
        const times = [];
        return [ask(noting(times, "written out", text)), times.length];
      };
      return {
        timesWrittenOut: {
          isValidBareUuid: timesWrittenOut(storeIds.isValidBareUuid, UUID),
          isAgentStoreId: timesWrittenOut(storeIds.isAgentStoreId, `store-${UUID}`),
          isCloudAgentStoreId: timesWrittenOut(storeIds.isCloudAgentStoreId, `bc-${UUID}`),
          isAgentStoreShareMountKey: timesWrittenOut(storeIds.isAgentStoreShareMountKey, `store-${"a".repeat(24)}`),
          aSourceIdThatIsACloudAgents: timesWrittenOut(storeIds.isAgentStoreSourceId, `bc-${UUID}`),
          aSourceIdThatIsABareId: timesWrittenOut(storeIds.isAgentStoreSourceId, UUID),
          aSourceIdThatIsNeither: timesWrittenOut(storeIds.isAgentStoreSourceId, "no"),
          parseUserAgentStoreSourceId: timesWrittenOut(storeIds.parseUserAgentStoreSourceId, "t3-u9"),
          parseTeamAgentStoreSourceId: timesWrittenOut(storeIds.parseTeamAgentStoreSourceId, "t3"),
        },
        repeated: {
          isValidBareUuid: [twice(storeIds.isValidBareUuid, UUID), twice(storeIds.isValidBareUuid, "no")],
          isAgentStoreId: [twice(storeIds.isAgentStoreId, `store-${UUID}`), twice(storeIds.isAgentStoreId, "no")],
          isCloudAgentStoreId: [twice(storeIds.isCloudAgentStoreId, `bc-${UUID}`), twice(storeIds.isCloudAgentStoreId, "no")],
          isAgentStoreSourceId: [twice(storeIds.isAgentStoreSourceId, UUID), twice(storeIds.isAgentStoreSourceId, "no")],
          isAgentStoreShareMountKey: [twice(storeIds.isAgentStoreShareMountKey, `store-${"a".repeat(24)}`), twice(storeIds.isAgentStoreShareMountKey, "no")],
          parseUserAgentStoreSourceId: [twice(storeIds.parseUserAgentStoreSourceId, "u5"), twice(storeIds.parseUserAgentStoreSourceId, "no")],
          parseTeamAgentStoreSourceId: [twice(storeIds.parseTeamAgentStoreSourceId, "t5"), twice(storeIds.parseTeamAgentStoreSourceId, "no")],
        },
        newEachTime: first !== second,
        fields: { withTeam: Object.keys(first), withoutTeam: Object.keys(storeIds.parseUserAgentStoreSourceId("u42")), team: Object.keys(team) },
        writtenOut: { answer: written, notes },
        notTexts: {
          isValidBareUuid: asked(storeIds.isValidBareUuid, [undefined, null, 12, [UUID], { toString: () => UUID }]),
          isAgentStoreId: asked(storeIds.isAgentStoreId, [undefined, null, [`store-${UUID}`]]),
          isCloudAgentStoreId: asked(storeIds.isCloudAgentStoreId, [undefined, null, [`bc-${UUID}`]]),
          isAgentStoreSourceId: asked(storeIds.isAgentStoreSourceId, [undefined, null, [UUID], [`bc-${UUID}`]]),
          isAgentStoreShareMountKey: asked(storeIds.isAgentStoreShareMountKey, [undefined, null, [`store-${"a".repeat(24)}`]]),
          parseUserAgentStoreSourceId: asked(storeIds.parseUserAgentStoreSourceId, [undefined, null, 1, ["u7"], ["t2-u7"], ["u7", "u8"]]),
          parseTeamAgentStoreSourceId: asked(storeIds.parseTeamAgentStoreSourceId, [undefined, null, 1, ["t7"]]),
        },
      };
    },
  },

  // ── project-send-message.ts ───────────────────────────────────────────────
  {
    name: "a project may send messages only when its state says, with the value true itself, that it is the root conversation",
    run: ({ sendMessage }) => {
      const reads = [];
      class State {
        get isRootProjectConversation() {
          reads.push("read");
          return true;
        }
      }
      return {
        answers: asked(sendMessage.isProjectSendMessageEnabled, [
          { isRootProjectConversation: true },
          { isRootProjectConversation: false },
          { isRootProjectConversation: undefined },
          {},
          { isRootProjectConversation: null },
          { isRootProjectConversation: "true" },
          { isRootProjectConversation: 1 },
          { isRootProjectConversation: {} },
          { isRootProjectConversation: new Boolean(true) },
          { isrootprojectconversation: true },
          { isRootProjectConversation: true, other: "not read" },
          Object.create({ isRootProjectConversation: true }),
          [],
          "a text",
          0,
          () => true,
        ]),
        fromAClass: sendMessage.isProjectSendMessageEnabled(new State()),
        reads,
        withNothing: [thrownBy(() => sendMessage.isProjectSendMessageEnabled(null)), thrownBy(() => sendMessage.isProjectSendMessageEnabled(undefined)), thrownBy(() => sendMessage.isProjectSendMessageEnabled())],
        kind: kindOf(sendMessage.isProjectSendMessageEnabled),
      };
    },
  },

  // ── system-notification.ts ────────────────────────────────────────────────
  {
    name: "a system notification's tag, and the tag opened and closed",
    run: ({ notification }) => ({
      SYSTEM_NOTIFICATION_TAG: notification.SYSTEM_NOTIFICATION_TAG,
      SYSTEM_NOTIFICATION_OPEN_TAG: notification.SYSTEM_NOTIFICATION_OPEN_TAG,
      SYSTEM_NOTIFICATION_CLOSE_TAG: notification.SYSTEM_NOTIFICATION_CLOSE_TAG,
    }),
  },

  // ── git-diff.ts ───────────────────────────────────────────────────────────
  {
    name: "a diff shown to the model: how long it may be and the words before and after it",
    run: ({ gitDiff }) => ({
      GIT_DIFF_APPROXIMATE_MAX_TOKENS: gitDiff.GIT_DIFF_APPROXIMATE_MAX_TOKENS,
      GIT_DIFF_CHARS_PER_TOKEN: gitDiff.GIT_DIFF_CHARS_PER_TOKEN,
      MAX_GIT_DIFF_CHAR_LENGTH: gitDiff.MAX_GIT_DIFF_CHAR_LENGTH,
      GIT_DIFF_INTRO: gitDiff.GIT_DIFF_INTRO,
      GIT_DIFF_UNCOMMITTED_INTRO: gitDiff.GIT_DIFF_UNCOMMITTED_INTRO,
      GIT_DIFF_TRUNCATION_NOTICE: gitDiff.GIT_DIFF_TRUNCATION_NOTICE,
    }),
  },

  // ── project-conversation.ts ───────────────────────────────────────────────
  {
    name: "a project's details are the root's when they are there and name neither a subagent nor a side chat; only undefined counts as not named",
    run: ({ conversation }) => asked(conversation.isRootProjectDetails, [
      undefined,
      null,
      {},
      { subagent: undefined },
      { sideChat: undefined },
      { subagent: undefined, sideChat: undefined },
      { other: "not read" },
      { subagent: {} },
      { sideChat: {} },
      { subagent: {}, sideChat: {} },
      { subagent: null },
      { sideChat: null },
      { subagent: false },
      { sideChat: false },
      { subagent: 0 },
      { sideChat: "" },
      { subagent: "helper" },
      { Subagent: {}, sidechat: {} },
      Object.create({ subagent: {} }),
      Object.create({ sideChat: {} }),
      Object.create({ other: 1 }),
      [],
      0,
      "",
      false,
      "a text",
      Number.NaN,
    ]),
  },
  {
    name: "a project's details are read subagent first, and the side chat only when no subagent is named",
    run: ({ conversation }) => {
      const reads = [];
      const answers = [
        conversation.isRootProjectDetails(notingReads(reads, { sideChat: undefined, subagent: undefined })),
        conversation.isRootProjectDetails(notingReads(reads, { sideChat: {}, subagent: {} })),
        conversation.isRootProjectDetails(notingReads(reads, { sideChat: {}, subagent: undefined })),
      ];
      return { answers, reads, withNothing: conversation.isRootProjectDetails(), kind: kindOf(conversation.isRootProjectDetails) };
    },
  },

  // ── ask-question.ts ───────────────────────────────────────────────────────
  {
    name: "a question answered by itself: its marker, the reason given to the model, and the reason written in full",
    run: ({ askQuestion }) => ({
      ASK_QUESTION_AUTO_ANSWER_MARKER: askQuestion.ASK_QUESTION_AUTO_ANSWER_MARKER,
      ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX: askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX,
      ASK_QUESTION_AUTO_ANSWER_REASON_BODY: askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_BODY,
      ASK_QUESTION_AUTO_ANSWER_REASON: askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON,
    }),
  },
  {
    name: "who answered a question by itself: the marker and a kind, timeout when none is given, any other kind kept as given",
    run: ({ askQuestion }) => {
      const first = askQuestion.createAskQuestionAutoAnswerIdentity();
      const second = askQuestion.createAskQuestionAutoAnswerIdentity();
      return {
        answers: [
          first,
          askQuestion.createAskQuestionAutoAnswerIdentity(undefined),
          askQuestion.createAskQuestionAutoAnswerIdentity("timeout"),
          askQuestion.createAskQuestionAutoAnswerIdentity("other"),
          askQuestion.createAskQuestionAutoAnswerIdentity(null),
          askQuestion.createAskQuestionAutoAnswerIdentity(""),
          askQuestion.createAskQuestionAutoAnswerIdentity("something else"),
          askQuestion.createAskQuestionAutoAnswerIdentity(0),
          askQuestion.createAskQuestionAutoAnswerIdentity("other", "a second thing, not read"),
        ],
        fields: Object.keys(first),
        newEachTime: first !== second,
        kind: kindOf(askQuestion.createAskQuestionAutoAnswerIdentity),
      };
    },
  },
  {
    name: "the reason of a question answered by itself: the marker, a colon, the kind, a bar, then the words for the model",
    run: ({ askQuestion }) => {
      const notes = [];
      const reads = [];
      return {
        answers: [
          askQuestion.formatAskQuestionAutoAnswerReason(),
          askQuestion.formatAskQuestionAutoAnswerReason(undefined),
          askQuestion.formatAskQuestionAutoAnswerReason(askQuestion.createAskQuestionAutoAnswerIdentity("timeout")),
          askQuestion.formatAskQuestionAutoAnswerReason(askQuestion.createAskQuestionAutoAnswerIdentity("other")),
          askQuestion.formatAskQuestionAutoAnswerReason({ marker: "another_marker", kind: "another kind" }),
          askQuestion.formatAskQuestionAutoAnswerReason({ marker: "", kind: "" }),
          askQuestion.formatAskQuestionAutoAnswerReason({}),
          askQuestion.formatAskQuestionAutoAnswerReason({ kind: "other" }),
          askQuestion.formatAskQuestionAutoAnswerReason({ marker: 1, kind: null }),
          askQuestion.formatAskQuestionAutoAnswerReason({ kind: "other", marker: "m", extra: "not written" }),
        ],
        sameAsTheOneKept: askQuestion.formatAskQuestionAutoAnswerReason() === askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON,
        endsWithTheBody: askQuestion.formatAskQuestionAutoAnswerReason().endsWith(`|${askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_BODY}`),
        writtenOut: [askQuestion.formatAskQuestionAutoAnswerReason({ kind: noting(notes, "kind", "k"), marker: noting(notes, "marker", "m") }).slice(0, 4), notes],
        read: [askQuestion.formatAskQuestionAutoAnswerReason(notingReads(reads, { kind: "k", marker: "m" })).slice(0, 4), reads],
        withNull: thrownBy(() => askQuestion.formatAskQuestionAutoAnswerReason(null)),
        kind: kindOf(askQuestion.formatAskQuestionAutoAnswerReason),
      };
    },
  },
  {
    name: "a reason is read back when it starts, spaces aside, with the marker, a colon, timeout or other, and a bar; whatever follows is not looked at",
    run: ({ askQuestion }) => {
      const marker = askQuestion.ASK_QUESTION_AUTO_ANSWER_MARKER;
      return {
        answers: asked(askQuestion.parseAskQuestionAutoAnswerIdentity, [
          askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON,
          askQuestion.formatAskQuestionAutoAnswerReason(askQuestion.createAskQuestionAutoAnswerIdentity("other")),
          `${marker}:timeout|`,
          `${marker}:other|`,
          `${marker}:timeout|anything at all`,
          `${marker}:other|${marker}:timeout|`,
          `${marker}:timeout||`,
          `  ${marker}:timeout|after spaces`,
          `\n\t${marker}:other|after a line break and a tab`,
          `${marker}:timeout|before spaces   `,
          ` ${marker}:timeout|after a space that does not break`,
          `﻿${marker}:timeout|after a byte-order mark`,
          `${marker}:timeout|two\nlines`,
        ]),
        kind: kindOf(askQuestion.parseAskQuestionAutoAnswerIdentity),
        newEachTime: askQuestion.parseAskQuestionAutoAnswerIdentity(`${marker}:other|`) !== askQuestion.parseAskQuestionAutoAnswerIdentity(`${marker}:other|`),
        fields: Object.keys(askQuestion.parseAskQuestionAutoAnswerIdentity(`${marker}:other|`)),
      };
    },
  },
  {
    name: "a reason with nothing, another kind, other capitals, no bar, or the marker anywhere but first, is not read back",
    run: ({ askQuestion }) => {
      const marker = askQuestion.ASK_QUESTION_AUTO_ANSWER_MARKER;
      return asked(askQuestion.parseAskQuestionAutoAnswerIdentity, [
        undefined,
        null,
        "",
        " ",
        "\n",
        marker,
        `${marker}:`,
        `${marker}:timeout`,
        `${marker}:other`,
        `${marker}:|`,
        `${marker}|timeout|`,
        `${marker}:timeouts|`,
        `${marker}:timeout |`,
        `${marker}: timeout|`,
        `${marker} :timeout|`,
        `${marker}:Timeout|`,
        `${marker}:TIMEOUT|`,
        `${marker}:OTHER|`,
        `${marker}:something|`,
        `${marker}:timeout:`,
        `${marker}:timeout/`,
        `${marker.toUpperCase()}:timeout|`,
        `x${marker}:timeout|`,
        `"${marker}:timeout|"`,
        `first line\n${marker}:timeout|`,
        `. ${marker}:timeout|`,
        `${marker.replaceAll("_", "-")}:timeout|`,
        `${marker.replaceAll("_", " ")}:timeout|`,
        askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_BODY,
        askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX,
        "The person chose the first option.",
      ]);
    },
  },
  {
    name: "a reason is a question's own answer when it reads back, or when it starts, spaces aside, with the opening words of the reason, capitals as written",
    run: ({ askQuestion }) => {
      const marker = askQuestion.ASK_QUESTION_AUTO_ANSWER_MARKER;
      const prefix = askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX;
      return {
        answers: asked(askQuestion.isAskQuestionAutoAnswerReason, [
          askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON,
          askQuestion.ASK_QUESTION_AUTO_ANSWER_REASON_BODY,
          prefix,
          `${prefix}.`,
          `${prefix} and more`,
          `${prefix}${prefix}`,
          `  ${prefix}`,
          `\n\t${prefix}. Proceed.`,
          `${prefix}   `,
          `${marker}:timeout|`,
          `${marker}:other|not the usual words`,
          `  ${marker}:other|`,
          `${marker}:something|${prefix}`,
          `${marker}:timeout`,
          marker,
          prefix.slice(0, -1),
          prefix.slice(1),
          prefix.toLowerCase(),
          prefix.toUpperCase(),
          prefix.replace("No response", "No  response"),
          `x${prefix}`,
          `"${prefix}"`,
          `. ${prefix}`,
          `first line\n${prefix}`,
          "The person chose the first option.",
          "",
          " ",
          null,
          undefined,
        ]),
        withNothing: askQuestion.isAskQuestionAutoAnswerReason(),
        kind: kindOf(askQuestion.isAskQuestionAutoAnswerReason),
      };
    },
  },

  // ── cloud-agent.ts ────────────────────────────────────────────────────────
  {
    name: "a cloud agent: the setup skill's id, folder and file, the folder of a single repository, and the folder its artifacts go to",
    run: ({ cloudAgent }) => ({
      ENV_SETUP_SKILL_ID: cloudAgent.ENV_SETUP_SKILL_ID,
      ENV_SETUP_MANAGED_SKILL_DIRECTORY: cloudAgent.ENV_SETUP_MANAGED_SKILL_DIRECTORY,
      ENV_SETUP_MANAGED_SKILL_PATH: cloudAgent.ENV_SETUP_MANAGED_SKILL_PATH,
      CLOUD_AGENT_SINGLE_REPO_WORKSPACE_ROOT: cloudAgent.CLOUD_AGENT_SINGLE_REPO_WORKSPACE_ROOT,
      CLOUD_AGENT_ARTIFACTS_DIR: cloudAgent.CLOUD_AGENT_ARTIFACTS_DIR,
    }),
  },

  // ── smart-mode-classifier.ts ──────────────────────────────────────────────
  {
    name: "the wait of the classifier's stand-in, in milliseconds and in seconds",
    run: ({ classifier }) => ({
      DEV_SMART_MODE_CLASSIFIER_DELAY_MS: classifier.DEV_SMART_MODE_CLASSIFIER_DELAY_MS,
      DEV_SMART_MODE_CLASSIFIER_DELAY_SECONDS: classifier.DEV_SMART_MODE_CLASSIFIER_DELAY_SECONDS,
    }),
  },

  // ── sand-box.ts ───────────────────────────────────────────────────────────
  {
    name: "the cloud computer: its image tags, the two ports its screen is served on, and the path of the other viewer",
    run: ({ box }) => ({
      SAND_BOX_IMAGE_TAG_PREFIX: box.SAND_BOX_IMAGE_TAG_PREFIX,
      SAND_BOX_IMAGE_TAG_LATEST: box.SAND_BOX_IMAGE_TAG_LATEST,
      SAND_BOX_PRIMARY_NOVNC_PORT: box.SAND_BOX_PRIMARY_NOVNC_PORT,
      SAND_BOX_FORK_NOVNC_PORT: box.SAND_BOX_FORK_NOVNC_PORT,
      SAND_SPECIAL_TREATMENT_NOVNC_PATH: box.SAND_SPECIAL_TREATMENT_NOVNC_PATH,
    }),
  },
  {
    name: "a short git id is 7 to 40 small hex digits and nothing else; the pattern keeps no place between two askings",
    run: ({ box }) => {
      const pattern = box.SHORT_GIT_SHA_REGEX;
      const answers = asked((text) => pattern.test(text), [
        "abcdef",
        "abcdef0",
        "abcdef01",
        "0123456",
        "a".repeat(39),
        "a".repeat(40),
        "a".repeat(41),
        "a".repeat(64),
        "ABCDEF0",
        "abcdefG",
        "abcdefg",
        "abcdef0 ",
        " abcdef0",
        "abcdef0\n",
        "abcdef0\nabcdef0",
        "abc-def0",
        "",
      ]);
      return {
        pattern,
        source: pattern.source,
        flags: pattern.flags,
        isPattern: pattern instanceof RegExp,
        answers,
        placeAfter: pattern.lastIndex,
        again: [pattern.test("abcdef0"), pattern.test("abcdef0"), pattern.test("abcdef"), pattern.test("abcdef0")],
        sameOneEachTime: box.SHORT_GIT_SHA_REGEX === pattern,
      };
    },
  },
  {
    name: "the screen's address: the viewer under the proxy, the network token and the two wake times, then the path to the socket, written so it can sit in an address",
    run: ({ box }) => {
      const cases = [
        ["https://proxy.example", "net-1"],
        ["https://proxy.example", "net-1", "tok-1"],
        ["https://proxy.example", "net-1", "tok-1", false],
        ["https://proxy.example", "net-1", "tok-1", true],
        ["https://proxy.example", "net-1", undefined, true],
        ["https://proxy.example", "net-1", undefined, false],
        ["https://proxy.example", "net-1", undefined, undefined],
        ["http://127.0.0.1:6080", "local-token"],
        ["http://127.0.0.1:6081/box", "local-token", "fork-1"],
        ["https://proxy.example/", "net-1"],
        ["https://proxy.example?x=1", "net-1"],
        ["", "net-1"],
        ["", ""],
        ["https://proxy.example", "net-1", "tok-1", true, "a fifth thing, not read"],
      ];
      return { answers: cases.map((given) => [given, box.buildSandBoxNoVncUrl(...given)]), kind: kindOf(box.buildSandBoxNoVncUrl) };
    },
  },
  {
    name: "the screen's address: an empty token is still written, only a missing one is left out; any true thing picks the other viewer",
    run: ({ box }) => [
      ["https://proxy.example", "net-1", ""],
      ["https://proxy.example", "net-1", null],
      ["https://proxy.example", "net-1", 0],
      ["https://proxy.example", "net-1", false],
      ["https://proxy.example", "net-1", "tok-1", "yes"],
      ["https://proxy.example", "net-1", "tok-1", 1],
      ["https://proxy.example", "net-1", "tok-1", {}],
      ["https://proxy.example", "net-1", "tok-1", 0],
      ["https://proxy.example", "net-1", "tok-1", ""],
      ["https://proxy.example", "net-1", "tok-1", null],
      ["https://proxy.example", "net-1", "tok-1", Number.NaN],
      ["https://proxy.example"],
      [],
      [undefined, undefined, undefined, true],
      [12, 34, 56],
    ].map((given) => [given, box.buildSandBoxNoVncUrl(...given)]),
  },
  {
    name: "the screen's address: signs in a token are written as they are in the address itself and made safe only inside the path; a broken letter cannot be written",
    run: ({ box }) => ({
      answers: [
        ["https://proxy.example", "a&b=c d/é?#%+"],
        ["https://proxy.example", "net-1", "t/1+2=3&x#y%z é ✓"],
        ["https://proxy.example", "a&b=c d", "t&u=v w", true],
        ["https://proxy.example", "-_.!~*'()", "-_.!~*'()"],
        ["https://proxy.example", "net\n1", "tok\t1"],
        ["https://proxy.example", "😀", "😀"],
        ["https://proxy.example/a b", "net-1", "tok-1"],
      ].map((given) => [given, box.buildSandBoxNoVncUrl(...given)]),
      brokenLetterInTheToken: thrownBy(() => box.buildSandBoxNoVncUrl("https://proxy.example", "net-1", "tok\ud800")),
      brokenLetterInTheNetworkToken: thrownBy(() => box.buildSandBoxNoVncUrl("https://proxy.example", "net\udfff", "tok-1")),
      brokenLetterInTheProxy: box.buildSandBoxNoVncUrl("https://proxy\ud800.example", "net-1", "tok-1"),
    }),
  },
  {
    name: "the screen's address is written from what it is given in a fixed order: the token, the network token, the proxy, the network token again",
    run: ({ box }) => {
      const notes = [];
      const withToken = box.buildSandBoxNoVncUrl(noting(notes, "proxy", "https://proxy.example"), noting(notes, "network token", "net-1"), noting(notes, "token", "tok-1"), noting(notes, "the other viewer, never written out", "yes"));
      const first = [...notes];
      notes.length = 0;
      const withoutToken = box.buildSandBoxNoVncUrl(noting(notes, "proxy", "https://proxy.example"), noting(notes, "network token", "net-1"));
      return { withToken, first, withoutToken, second: notes };
    },
  },
  {
    name: "an address is the other viewer's when it is a whole address whose path ends with a slash and the viewer's path, whatever follows the path",
    run: ({ box }) => asked(box.isSandSpecialTreatmentNoVncUrl, [
      "https://proxy.example/sand-special-treatment-v1/vnc.html",
      "https://proxy.example/sand-special-treatment-v1/vnc.html?network_token=net-1",
      "https://proxy.example/sand-special-treatment-v1/vnc.html#top",
      "https://proxy.example/sand-special-treatment-v1/vnc.html?a=1#top",
      "https://proxy.example/box/7/sand-special-treatment-v1/vnc.html",
      "http://127.0.0.1:6080/sand-special-treatment-v1/vnc.html",
      "https://user:pass@proxy.example:8443/sand-special-treatment-v1/vnc.html",
      "https://proxy.example/a/../sand-special-treatment-v1/vnc.html",
      "https://proxy.example/sand-special-treatment-v1/./vnc.html",
      "https://proxy.example/sand-special-treatment-v1/x/../vnc.html",
      "https://proxy.example\\sand-special-treatment-v1\\vnc.html",
      "HTTPS://PROXY.EXAMPLE/sand-special-treatment-v1/vnc.html",
      "  https://proxy.example/sand-special-treatment-v1/vnc.html  ",
      "https://proxy.example/sand-special-treatment-v1/vnc.html\n",
      "file:///sand-special-treatment-v1/vnc.html",
      "ws://proxy.example/sand-special-treatment-v1/vnc.html",
      "other:/sand-special-treatment-v1/vnc.html",
      "other://host/sand-special-treatment-v1/vnc.html",
      new URL("https://proxy.example/sand-special-treatment-v1/vnc.html"),
    ]),
  },
  {
    name: "an address with the usual viewer, the path elsewhere than at the end, other capitals, or that is no whole address, is not the other viewer's",
    run: ({ box }) => ({
      answers: asked(box.isSandSpecialTreatmentNoVncUrl, [
        "https://proxy.example/vnc.html",
        "https://proxy.example/vnc.html?path=/sand-special-treatment-v1/vnc.html",
        "https://proxy.example/vnc.html#/sand-special-treatment-v1/vnc.html",
        "https://proxy.example/xsand-special-treatment-v1/vnc.html",
        "https://proxy.example/sand-special-treatment-v1/vnc.html/",
        "https://proxy.example/sand-special-treatment-v1/vnc.html/more",
        "https://proxy.example/sand-special-treatment-v1/vnc.htm",
        "https://proxy.example/sand-special-treatment-v1/vnc.htmlx",
        "https://proxy.example/sand-special-treatment-v1/",
        "https://proxy.example/sand-special-treatment-v2/vnc.html",
        "https://proxy.example/SAND-SPECIAL-TREATMENT-V1/VNC.HTML",
        "https://proxy.example/Sand-Special-Treatment-v1/vnc.html",
        "https://proxy.example/sand-special-treatment-v1/vnc%2Ehtml",
        "https://proxy.example/sand-special-treatment-v1%2Fvnc.html",
        "https://proxy.example/sand-special-treatment-v1//vnc.html",
        "https://sand-special-treatment-v1/vnc.html",
        "https://proxy.example",
        "https://proxy.example/",
        "other:sand-special-treatment-v1/vnc.html",
        "/sand-special-treatment-v1/vnc.html",
        "sand-special-treatment-v1/vnc.html",
        "proxy.example/sand-special-treatment-v1/vnc.html",
        "//proxy.example/sand-special-treatment-v1/vnc.html",
        "https://",
        "not an address",
        "",
        " ",
        undefined,
        null,
        12,
        {},
        [],
      ]),
      withNothing: box.isSandSpecialTreatmentNoVncUrl(),
      kind: kindOf(box.isSandSpecialTreatmentNoVncUrl),
    }),
  },
  {
    name: "addresses as they are made: the other viewer's is told as such, the usual one is not unless the proxy's own path makes it look so, and one made with no proxy is no whole address",
    run: ({ box }) => [
      ["https://proxy.example", "net-1", "tok-1", true],
      ["https://proxy.example", "net-1", undefined, true],
      ["http://127.0.0.1:6081/box", "a&b=c d", "t&u", true],
      ["https://proxy.example", "net-1", "tok-1", false],
      ["https://proxy.example", "net-1"],
      ["https://proxy.example", "/sand-special-treatment-v1/vnc.html", "/sand-special-treatment-v1/vnc.html", false],
      ["https://proxy.example/sand-special-treatment-v1", "net-1"],
      ["", "net-1", "tok-1", true],
    ].map((given) => [given, box.isSandSpecialTreatmentNoVncUrl(box.buildSandBoxNoVncUrl(...given))]),
  },

  // ── sand-box-archive.ts ───────────────────────────────────────────────────
  {
    name: "what is left out when the cloud computer's files are kept, the name of a workspace's ignore file, and what a workspace ignores unless told otherwise, each in its order",
    run: ({ archive }) => ({
      SAND_BOX_PERSIST_ARCHIVE_EXCLUDES: archive.SAND_BOX_PERSIST_ARCHIVE_EXCLUDES,
      SAND_WORKSPACE_IGNORE_FILE_NAME: archive.SAND_WORKSPACE_IGNORE_FILE_NAME,
      SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS: archive.SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS,
    }),
  },
  {
    name: "the two lists are plain lists that can be changed, the same ones each time they are read, with no entry twice",
    run: ({ archive }) => {
      const describe = (list, again) => ({
        isList: Array.isArray(list),
        isPlainList: Object.getPrototypeOf(list) === Array.prototype,
        length: list.length,
        frozen: Object.isFrozen(list),
        sealed: Object.isSealed(list),
        canGrow: Object.isExtensible(list),
        ownNames: Object.getOwnPropertyNames(list).length,
        allTexts: list.every((entry) => typeof entry === "string"),
        noneTwice: new Set(list).size === list.length,
        sameOneEachTime: list === again,
        sorted: [...list].sort().join("\n") === list.join("\n"),
      });
      return {
        SAND_BOX_PERSIST_ARCHIVE_EXCLUDES: describe(archive.SAND_BOX_PERSIST_ARCHIVE_EXCLUDES, archive.SAND_BOX_PERSIST_ARCHIVE_EXCLUDES),
        SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS: describe(archive.SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS, archive.SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS),
        notTheSameList: archive.SAND_BOX_PERSIST_ARCHIVE_EXCLUDES !== archive.SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS,
      };
    },
  },

  // ── every file ────────────────────────────────────────────────────────────
  {
    name: "what kind of function each exported function is: its name, its counted parameters, and whether it could be used with new",
    run: ({ storeIds, box }) => ({
      parseUserAgentStoreSourceId: kindOf(storeIds.parseUserAgentStoreSourceId),
      parseTeamAgentStoreSourceId: kindOf(storeIds.parseTeamAgentStoreSourceId),
      isValidBareUuid: kindOf(storeIds.isValidBareUuid),
      isCloudAgentStoreId: kindOf(storeIds.isCloudAgentStoreId),
      isAgentStoreId: kindOf(storeIds.isAgentStoreId),
      isAgentStoreSourceId: kindOf(storeIds.isAgentStoreSourceId),
      isAgentStoreShareMountKey: kindOf(storeIds.isAgentStoreShareMountKey),
      buildSandBoxNoVncUrl: kindOf(box.buildSandBoxNoVncUrl),
      isSandSpecialTreatmentNoVncUrl: kindOf(box.isSandSpecialTreatmentNoVncUrl),
    }),
  },
];
