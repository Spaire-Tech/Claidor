/**
 * Group chats: who speaks in a round and who was mentioned, the prompts a
 * member gets for its turn, the shape of a turn sent to another person's
 * agent, and the two small files that say an agent folder is a group or a
 * room shared from elsewhere.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const part = "host/groups";
export const modules = {
  groupChat: "source/host/groups/group-chat.ts",
  xuser: "source/host/groups/xuser.ts",
  groupStore: "source/host/groups/group-store.ts",
  remoteRoomStore: "source/host/groups/remote-room-store.ts",
};

const alice = { id: "a", name: "Alice Smith", description: "Keeps the books" };
const bob = { id: "b", name: "Bob", description: "Designs the screens" };
const cara = { id: "c", name: "Dr. Cara O'Neil", description: "" };
const team = [alice, bob, cara];

const user = (content, name) => ({ speaker: name === undefined ? { kind: "user" } : { kind: "user", name }, content });
const member = (who, content) => ({ speaker: { kind: "member", id: who.id, name: who.name }, content });

/**
 * What a call did: what it gave back, or what it threw. An error JavaScript
 * itself raises (reading a field of nothing, calling what is no function) is
 * kept by its class only, since its sentence is the runtime's own.
 */
function attempt(run) {
  try {
    return run();
  } catch (error) {
    return { threw: describeError(error) };
  }
}

const RUNTIME_ERRORS = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError"]);
function describeError(error) {
  const name = error?.constructor?.name ?? typeof error;
  if (error?.code !== undefined) return { class: name, code: error.code, ...(error.syscall === undefined ? {} : { syscall: error.syscall }) };
  if (RUNTIME_ERRORS.has(name)) return { class: name };
  return error;
}

/** Every file under a folder, with its text, by its path from the folder. */
function filesUnder(folder, prefix = "") {
  const out = {};
  for (const name of readdirSync(folder).sort()) {
    const full = path.join(folder, name);
    if (statSync(full).isDirectory()) {
      const inner = filesUnder(full, `${prefix}${name}/`);
      if (Object.keys(inner).length === 0) out[`${prefix}${name}/`] = "(an empty folder)";
      Object.assign(out, inner);
    } else out[`${prefix}${name}`] = readFileSync(full, "utf8");
  }
  return out;
}

/** A folder holding one file with this text. */
async function folderWith(tools, fileName, text) {
  const dir = await tools.tmp();
  writeFileSync(path.join(dir, fileName), text);
  return dir;
}

const letters = (count, letter = "x") => letter.repeat(count);

export const scenarios = [
  // --- group-chat.ts ---
  {
    name: "the numbers and marks of a group chat",
    run: ({ groupChat }) => ({
      GROUP_CONFIG_VERSION: groupChat.GROUP_CONFIG_VERSION,
      GROUP_MAX_MEMBER_TURNS: groupChat.GROUP_MAX_MEMBER_TURNS,
      GROUP_MAX_ROUNDS: groupChat.GROUP_MAX_ROUNDS,
      GROUP_PROMPT_HISTORY_LIMIT: groupChat.GROUP_PROMPT_HISTORY_LIMIT,
      GROUP_MAX_MESSAGES_PER_TURN: groupChat.GROUP_MAX_MESSAGES_PER_TURN,
      SHARED_ROOM_HISTORY_LIMIT: groupChat.SHARED_ROOM_HISTORY_LIMIT,
      GROUP_CHAT_TAG_PREFIX: groupChat.GROUP_CHAT_TAG_PREFIX,
      SAND_HIDDEN_PROMPT_MARKER: groupChat.SAND_HIDDEN_PROMPT_MARKER,
    }),
  },
  {
    name: "each round starts one speaker further along, and wraps around",
    run: ({ groupChat }) => {
      const out = {};
      for (const size of [0, 1, 2, 3, 4]) {
        const ids = ["a", "b", "c", "d"].slice(0, size);
        out[`${size} members`] = Object.fromEntries([-7, -4, -3, -1, 0, 1, 2, 3, 4, 5, 7, 100].map((round) => [`round ${round}`, groupChat.orderRoundSpeakers(ids, round).join("")]));
      }
      return out;
    },
  },
  {
    name: "a round that is not a whole number, and lists that are not lists of names",
    run: ({ groupChat }) => {
      const ids = ["a", "b", "c"];
      const same = groupChat.orderRoundSpeakers(ids, 0);
      const things = [{ id: 1 }, { id: 2 }];
      return {
        rounds: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, 2.9, -0.5, -1.5, "2", "x", null, undefined, true].map((round) => ({ round, order: groupChat.orderRoundSpeakers(ids, round) })),
        alwaysANewList: same !== ids,
        theSameThingsInside: groupChat.orderRoundSpeakers(things, 1).map((thing) => things.indexOf(thing)),
        aText: attempt(() => groupChat.orderRoundSpeakers("abc", 1)),
        aListWithAGap: attempt(() => groupChat.orderRoundSpeakers(["a", , "c"], 1)),
        null: attempt(() => groupChat.orderRoundSpeakers(null, 1)),
        anObjectLikeAList: attempt(() => groupChat.orderRoundSpeakers({ length: 2, 0: "a", 1: "b" }, 1)),
        anObjectOfLengthZero: attempt(() => groupChat.orderRoundSpeakers({ length: 0 }, 1)),
        declaredParameters: groupChat.orderRoundSpeakers.length,
      };
    },
  },
  {
    name: "two member lists are the same set when they are as long and every name of the second is in the first",
    run: ({ groupChat }) => {
      const pairs = [
        [[], []],
        [["a"], ["a"]],
        [["a"], ["b"]],
        [["a", "b"], ["b", "a"]],
        [["a", "b"], ["a"]],
        [["a"], ["a", "b"]],
        [["a", "b", "c"], ["c", "a", "b"]],
        [["a", "b", "c"], ["a", "b", "d"]],
        // Repeats are not counted: only the lengths and the second list's names are looked at.
        [["a", "b"], ["a", "a"]],
        [["a", "a"], ["a", "b"]],
        [["a", "a"], ["a", "a"]],
        [["A"], ["a"]],
        [["a "], ["a"]],
        [[1], ["1"]],
        [[Number.NaN], [Number.NaN]],
      ];
      return {
        pairs: pairs.map(([first, second]) => ({ first, second, same: groupChat.isSameMemberSet(first, second) })),
        texts: attempt(() => groupChat.isSameMemberSet("ab", "ba")),
        textsOfDifferentLength: attempt(() => groupChat.isSameMemberSet("ab", "b")),
        aSetAndAList: attempt(() => groupChat.isSameMemberSet(new Set(["a"]), ["a"])),
        null: attempt(() => groupChat.isSameMemberSet(null, [])),
        declaredParameters: groupChat.isSameMemberSet.length,
      };
    },
  },
  {
    name: "the error for a group inside a group names the groups and says group chat or group chats",
    run: ({ groupChat }) => {
      const given = ["g1", "g2"];
      const made = { none: new groupChat.SandGroupNestingError([]), one: new groupChat.SandGroupNestingError(["g1"]), two: new groupChat.SandGroupNestingError(given), fromASet: new groupChat.SandGroupNestingError(new Set(["g1"])), fromAText: new groupChat.SandGroupNestingError("g"), fromALongerText: new groupChat.SandGroupNestingError("gh") };
      return {
        errors: made,
        fields: Object.fromEntries(Object.entries(made).map(([key, error]) => [key, Object.keys(error)])),
        asText: String(made.two),
        isAnError: made.two instanceof Error,
        isItsOwnClass: made.two instanceof groupChat.SandGroupNestingError,
        className: made.two.constructor.name,
        aCopyOfTheList: made.two.nestedGroupIds !== given,
        nameOnTheClass: Object.hasOwn(groupChat.SandGroupNestingError.prototype, "name"),
        declaredParameters: groupChat.SandGroupNestingError.length,
        nothingGiven: attempt(() => new groupChat.SandGroupNestingError()),
        aNumber: attempt(() => new groupChat.SandGroupNestingError(5)),
      };
    },
  },
  {
    name: "members are checked once each, in order, and all of them before the error for groups among them is thrown",
    run: ({ groupChat }) => {
      const asked = [];
      const isGroup = (groups) => (...given) => {
        asked.push({ id: given[0], index: given[1], listLength: given[2]?.length, arguments: given.length });
        return groups.includes(given[0]);
      };
      const none = attempt(() => groupChat.assertMembersAreNotGroups(["a", "b", "a"], isGroup([])));
      const askedForNone = asked.splice(0);
      const some = attempt(() => groupChat.assertMembersAreNotGroups(["g2", "a", "g1", "g2", "b", "g1"], isGroup(["g1", "g2"])));
      const askedForSome = asked.splice(0);
      const mine = new Error("the lookup broke");
      let caught;
      try {
        groupChat.assertMembersAreNotGroups(["a", "b"], (id) => {
          if (id === "b") throw mine;
          return true;
        });
      } catch (error) {
        caught = error;
      }
      return {
        none: none === undefined ? "nothing returned, nothing thrown" : none,
        askedForNone,
        some,
        someIsTheGroupError: some.threw instanceof groupChat.SandGroupNestingError,
        askedForSome,
        truthyAnswersCount: attempt(() => groupChat.assertMembersAreNotGroups(["a", "b", "c", "d"], (id) => ({ a: 1, b: "yes", c: 0, d: "" })[id])),
        noMembers: attempt(() => groupChat.assertMembersAreNotGroups([], () => true)) ?? "nothing",
        aSetOfMembers: attempt(() => groupChat.assertMembersAreNotGroups(new Set(["g", "a"]), (id) => id === "g")),
        aTextOfMembers: attempt(() => groupChat.assertMembersAreNotGroups("gag", (id) => id === "g")),
        theLookupsOwnError: caught === mine,
        nullMembers: attempt(() => groupChat.assertMembersAreNotGroups(null, () => true)),
        noLookup: attempt(() => groupChat.assertMembersAreNotGroups(["a"])),
        noLookupAndNoMembers: attempt(() => groupChat.assertMembersAreNotGroups([])) ?? "nothing",
      };
    },
  },
  {
    name: "the handles a member can be mentioned by: the whole name, the name without spaces, the first word",
    run: ({ groupChat }) => {
      const names = ["Alice", "Alice Smith", "  Alice   Smith  ", "Mary Jane Watson", "Dr. Cara O'Neil", "BOB", "", "   ", "a", "Zoë Kravitz", "İpek", "x\ty\nz", "one two", "all", "Everyone Else", "7 of 9", "@handle", "same same"];
      return {
        names: Object.fromEntries(names.map((name) => [JSON.stringify(name), groupChat.memberMentionHandles(name)])),
        aNumber: attempt(() => groupChat.memberMentionHandles(5)),
        nothing: attempt(() => groupChat.memberMentionHandles()),
      };
    },
  },
  {
    name: "a member is mentioned by @ and a handle that does not run on into letters or digits on either side",
    run: ({ groupChat }) => {
      const texts = [
        "@bob",
        "@Bob",
        "@BOB please",
        "hey @bob, look",
        "hey @bob.",
        "(@bob)",
        "@bob's turn",
        "@bob_",
        "_@bob",
        "@bob-smith",
        "@bob!",
        "@bob\n",
        "x@bob",
        "9@bob",
        "é@bob",
        "@bobé",
        "@bobby",
        "@bob2",
        "mail@bob.example",
        "@bobby and @bob",
        "@bobby @bobcat",
        "@ bob",
        "bob",
        "@@bob",
        "@bob@bob",
        "@alice",
        "@alice smith",
        "@Alice Smith",
        "@alicesmith",
        "@alice  smith",
        "@alices",
        "@smith",
        "@dr.",
        "@dr",
        "@dr. cara o'neil",
        "@dr.carao'neil",
        "@cara",
        "@bob and @alice and @dr.",
        "@alice @bob",
        "",
        "no mention at all",
      ];
      return Object.fromEntries(texts.map((text) => [JSON.stringify(text), groupChat.parseGroupMentions(text, team).memberIds.join(",") || "(nobody)"]));
    },
  },
  {
    name: "@everyone and @all mean everyone when they start the text or follow something that is not a letter or digit, and end at a word boundary",
    run: ({ groupChat }) => {
      const texts = ["@everyone", "@all", "@EVERYONE", "@All", "hi @everyone", "hi @all!", "(@all)", "@everyone.", "@everyone's", "x@all", "9@everyone", "_@all", "é@all", "@all_", "@allé", "@alls", "@all2", "@everyones", "@everyone-else", "@ all", "all", "everyone", "@al", "@everyon", "@all @bob", "@bob @allison", "\n@all\n"];
      return Object.fromEntries(texts.map((text) => [JSON.stringify(text), groupChat.parseGroupMentions(text, team)]));
    },
  },
  {
    name: "mentions come back in the order of the members, each id once, and depend on the members given",
    run: ({ groupChat }) => ({
      inMembersOrder: groupChat.parseGroupMentions("@cara then @bob then @alice", team),
      keys: Object.keys(groupChat.parseGroupMentions("", team)),
      noMembers: groupChat.parseGroupMentions("@bob @everyone", []),
      twoWithTheSameFirstName: groupChat.parseGroupMentions("@alice", [alice, { id: "j", name: "Alice Jones" }]),
      theSameIdTwice: groupChat.parseGroupMentions("@bob", [bob, { id: "b", name: "Bob" }]),
      theSameIdUnderTwoNames: groupChat.parseGroupMentions("@robert", [bob, { id: "b", name: "Robert" }]),
      aMemberWithNoName: groupChat.parseGroupMentions("@ @bob", [{ id: "n", name: "" }, { id: "s", name: "   " }, bob]),
      aMemberNamedAll: groupChat.parseGroupMentions("@all", [{ id: "x", name: "All" }, bob]),
      aMemberNamedEveryoneElse: groupChat.parseGroupMentions("@everyone", [{ id: "x", name: "Everyone Else" }, bob]),
      aMemberWithOddLetters: groupChat.parseGroupMentions("ping @zoë and @ipek", [{ id: "z", name: "Zoë Kravitz" }, { id: "i", name: "Ipek" }]),
      aMemberWhoseNameIsAnAt: groupChat.parseGroupMentions("@@handle", [{ id: "h", name: "@handle" }]),
      onlyIdAndNameAreRead: groupChat.parseGroupMentions("@bob", [{ id: "b", name: "Bob" }]),
      textIsNotAText: attempt(() => groupChat.parseGroupMentions(5, team)),
      aNameIsNotAText: attempt(() => groupChat.parseGroupMentions("@bob", [{ id: "n", name: 5 }])),
      membersIsNotAList: attempt(() => groupChat.parseGroupMentions("@bob", null)),
      aMissingMember: attempt(() => groupChat.parseGroupMentions("@bob", [bob, null])),
      declaredParameters: groupChat.parseGroupMentions.length,
    }),
  },
  {
    name: "who answers: those mentioned since the user last wrote, or everyone when nobody or everyone was",
    run: ({ groupChat }) => {
      const histories = {
        "no messages": [],
        "the user says hello": [user("hello")],
        "the user mentions bob": [user("@bob what do you think?", "Bass")],
        "the user mentions bob and cara": [user("@cara and @bob")],
        "the user mentions everyone and bob": [user("@everyone, and @bob first")],
        "the user mentions someone unknown": [user("@nobody here")],
        "an older message mentions bob, the last one nobody": [user("@bob?"), member(bob, "yes"), user("thanks all")],
        "an older message mentions everyone, the last one alice": [user("@everyone"), user("@alice only")],
        "bob answers and mentions cara": [user("@bob?"), member(bob, "ask @cara")],
        "bob answers and mentions everyone": [user("@bob?"), member(bob, "@all thoughts?")],
        "a member mentioned bob before the user wrote again": [member(alice, "@bob"), user("hm")],
        "only members have written, one mentions cara": [member(alice, "hello"), member(bob, "@cara?")],
        "only members have written, the first mentions cara": [member(alice, "@cara"), member(bob, "ok")],
        "two user messages in a row, the first mentions": [user("@bob"), user("anyone?")],
        "a mention of a member by first name": [user("thanks @alice")],
      };
      const out = {};
      for (const [name, history] of Object.entries(histories)) out[name] = groupChat.resolveResponders(team, history).map((who) => who.id).join(",");
      const everyone = groupChat.resolveResponders(team, []);
      const some = groupChat.resolveResponders(team, [user("@bob")]);
      return {
        ...out,
        aNewListEachTime: everyone !== team,
        theSameMembersInside: [everyone[0] === alice, some[0] === bob],
        noMembers: groupChat.resolveResponders([], [user("@bob")]),
        aGapInTheHistory: attempt(() => groupChat.resolveResponders(team, [user("@bob"), , member(bob, "x")]).map((who) => who.id)),
        aGapAtTheEnd: attempt(() => groupChat.resolveResponders(team, [user("@cara"), undefined]).map((who) => who.id)),
        aMessageWithNoSpeaker: attempt(() => groupChat.resolveResponders(team, [{ content: "@bob" }])),
        aMessageWithNoContent: attempt(() => groupChat.resolveResponders(team, [{ speaker: { kind: "user" } }])),
        historyIsNotAList: attempt(() => groupChat.resolveResponders(team, null)),
        declaredParameters: groupChat.resolveResponders.length,
      };
    },
  },
  {
    name: "what counts as a pass, and what could still become one while it is being typed",
    run: ({ groupChat }) => {
      const texts = [
        "",
        " ",
        "\n\t",
        "(pass)",
        "pass",
        "Pass",
        "PASS",
        "(Pass)",
        "(pass).",
        "pass.",
        "( pass )",
        "(  pass  )",
        "(\npass\n)",
        "  (pass)  ",
        "(pass",
        "pass)",
        "pass).",
        "(pass.",
        "(pass) .",
        "(pass)..",
        "((pass))",
        "(pass))",
        "pass!",
        "pass?",
        "[pass]",
        "passing",
        "passed",
        "I pass",
        "pass on this",
        "p ass",
        "(",
        "( ",
        "(  ",
        "()",
        "(.",
        ")",
        ".",
        "p",
        "P",
        "(p",
        "( p",
        "pa",
        "(pa",
        "pas",
        "(pas",
        "(PAS",
        "pass ",
        "(pass ",
        "(pass  )",
        "pa.",
        "pas)",
        "p)",
        "ps",
        "pb",
        "(x",
        "x",
        "(pass)x",
        "(pass) and more",
        "pässe",
        "ｐass",
        "pass ",
        " (pass) ",
      ];
      return {
        texts: Object.fromEntries(texts.map((text) => [JSON.stringify(text), { pass: groupChat.isPassContent(text), couldBecomeOne: groupChat.isPotentialPassPrefix(text) }])),
        notATextAsPass: attempt(() => groupChat.isPassContent(5)),
        notATextAsPrefix: attempt(() => groupChat.isPotentialPassPrefix(null)),
      };
    },
  },
  {
    name: "the note added when a member's turn is given again after a direct message cut it short",
    run: ({ groupChat }) => ({ note: groupChat.buildGroupRedriveNote(), theSameEachTime: groupChat.buildGroupRedriveNote() === groupChat.buildGroupRedriveNote(), whateverIsGiven: groupChat.buildGroupRedriveNote("ignored") === groupChat.buildGroupRedriveNote() }),
  },
  {
    name: "one line of the room: who said it, marked as the user or as you where it applies",
    run: ({ groupChat }) => {
      const lines = {
        "the user, unnamed": [user("hello"), "a"],
        "the user, named": [user("hello", "Bass"), "a"],
        "the user with an empty name": [user("hello", ""), "a"],
        "the user with a name of spaces": [user("hello", "  "), "a"],
        "a member": [member(bob, "hi there"), "a"],
        "the member reading": [member(alice, "my own words"), "a"],
        "a member when the reader is not given": [member(alice, "words")],
        "a member with no id when the reader is not given": [{ speaker: { kind: "member", name: "Ghost" }, content: "boo" }],
        "content of several lines": [member(bob, "one\ntwo"), "a"],
        "empty content": [member(bob, ""), "a"],
        "content that is not a text": [{ speaker: { kind: "member", id: "b", name: "Bob" }, content: 5 }, "a"],
        "a speaker of another kind is read as a member": [{ speaker: { kind: "system", id: "s", name: "System" }, content: "note" }, "s"],
        "a speaker of another kind with no name": [{ speaker: { kind: "system" }, content: "note" }, "s"],
        "a user that carries an id": [{ speaker: { kind: "user", id: "a", name: "Bass" }, content: "hi" }, "a"],
      };
      return {
        ...Object.fromEntries(Object.entries(lines).map(([name, given]) => [name, groupChat.formatGroupLine(...given)])),
        noSpeaker: attempt(() => groupChat.formatGroupLine({ content: "x" }, "a")),
        noMessage: attempt(() => groupChat.formatGroupLine(undefined, "a")),
      };
    },
  },
  {
    name: "the room's recent lines: the last 24 unless told, oldest first",
    run: ({ groupChat }) => {
      const history = (count) => Array.from({ length: count }, (_, at) => (at % 3 === 0 ? user(`u${at + 1}`) : member(at % 3 === 1 ? alice : bob, `m${at + 1}`)));
      const firstAndCount = (text) => {
        const lines = text.split("\n");
        return { lines: lines.length, first: lines[0], last: lines.at(-1) };
      };
      return {
        empty: groupChat.formatGroupHistory([], "a"),
        three: groupChat.formatGroupHistory(history(3), "a"),
        threeForAnotherReader: groupChat.formatGroupHistory(history(3), "b"),
        byCount: Object.fromEntries([1, 23, 24, 25, 60].map((count) => [count, firstAndCount(groupChat.formatGroupHistory(history(count), "a"))])),
        byLimit: [1, 2, 3, 5, 6, 0, -0, -2, -5, -6, 1.5, 2.9, "2", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, true].map((limit) => ({ limit, ...firstAndCount(groupChat.formatGroupHistory(history(5), "a", limit)) })),
        aLimitOnAnEmptyRoom: groupChat.formatGroupHistory([], "a", 3),
        declaredParameters: groupChat.formatGroupHistory.length,
        aTextAsHistory: attempt(() => groupChat.formatGroupHistory("abc", "a")),
        anEmptyTextAsHistory: attempt(() => groupChat.formatGroupHistory("", "a")),
        nullAsHistory: attempt(() => groupChat.formatGroupHistory(null, "a")),
        aGapInTheHistory: attempt(() => groupChat.formatGroupHistory([user("x"), , user("y")], "a")),
      };
    },
  },
  {
    name: "a text is a group turn's prompt when it starts with the group tag, with or without one hidden-prompt mark before it",
    run: ({ groupChat }) => {
      const tag = groupChat.GROUP_CHAT_TAG_PREFIX;
      const mark = groupChat.SAND_HIDDEN_PROMPT_MARKER;
      const texts = [`${tag}"Week"]`, `${mark}${tag}"Week"]`, `${mark}${mark}${tag}"Week"]`, `${mark} ${tag}`, ` ${tag}`, `\n${tag}`, tag, tag.trimEnd(), tag.toLowerCase(), "[Group chat:", "[Group chat", mark, "", "hello", `hello ${tag}`, `${tag}${mark}`, `${mark.toLowerCase()}${tag}`, `${mark.slice(0, -1)}${tag}`];
      return {
        texts: Object.fromEntries(texts.map((text) => [JSON.stringify(text), groupChat.isGroupTurnPromptText(text)])),
        notAText: attempt(() => groupChat.isGroupTurnPromptText(5)),
      };
    },
  },
  {
    name: "a group's name, its description and its tag",
    run: ({ groupChat }) => {
      const groups = {
        "a name and a description": { name: "Week", description: "the weekly room" },
        "a name only": { name: "Week", description: "" },
        "a description of spaces": { name: "Week", description: "  \n " },
        "no name": { name: "", description: "the weekly room" },
        "a name of spaces": { name: "   ", description: "" },
        "spaces around both": { name: "  Week  ", description: "  the weekly room  " },
        "quotes in the name": { name: 'The "A" team', description: "it's ours" },
        "several lines": { name: "Two\nlines", description: "first\nsecond" },
      };
      const out = {};
      for (const [name, group] of Object.entries(groups)) {
        out[name] = {
          displayName: groupChat.groupDisplayName(group),
          described: groupChat.describeGroup(group),
          tagAlone: groupChat.formatGroupChatTag(group, []),
          tagWithOne: groupChat.formatGroupChatTag(group, [bob]),
          tagWithTwo: groupChat.formatGroupChatTag(group, [bob, cara]),
        };
      }
      return {
        ...out,
        peersNeedOnlyAName: groupChat.formatGroupChatTag({ name: "Week", description: "" }, [{ name: "Solo" }, { name: "" }, { name: " padded " }]),
        aPeerWithNoName: groupChat.formatGroupChatTag({ name: "Week", description: "" }, [{}, bob]),
        theDescriptionIsNotReadForTheNameOrTheTag: [groupChat.groupDisplayName({ name: "Week" }), groupChat.formatGroupChatTag({ name: "Week" }, [])],
        noDescription: attempt(() => groupChat.describeGroup({ name: "Week" })),
        noName: attempt(() => groupChat.groupDisplayName({ description: "x" })),
        noGroup: attempt(() => groupChat.describeGroup(undefined)),
        noPeers: attempt(() => groupChat.formatGroupChatTag({ name: "Week", description: "" })),
        peersNotAList: attempt(() => groupChat.formatGroupChatTag({ name: "Week", description: "" }, { length: 1 })),
        aMissingPeer: attempt(() => groupChat.formatGroupChatTag({ name: "Week", description: "" }, [null])),
      };
    },
  },
  {
    name: "what a member is told about itself and the room before its turn",
    run: ({ groupChat }) => {
      const week = { name: "Week", description: "the weekly room" };
      return {
        withPeers: groupChat.buildGroupMemberSystemPrompt(alice, week, [bob, cara]),
        alone: groupChat.buildGroupMemberSystemPrompt(alice, week, []),
        noPersona: groupChat.buildGroupMemberSystemPrompt(cara, week, [alice]),
        aPersonaOfSpaces: groupChat.buildGroupMemberSystemPrompt({ id: "s", name: "Spacey", description: "  \n " }, week, []),
        spacesAroundEverything: groupChat.buildGroupMemberSystemPrompt({ id: "p", name: " Padded ", description: "  Trims its persona  " }, { name: " Week ", description: " weekly " }, [{ id: "q", name: " Peer ", description: "  padded too  " }]),
        aPeerWithADescriptionOfSpaces: groupChat.buildGroupMemberSystemPrompt(alice, week, [{ id: "q", name: "Quiet", description: "   " }]),
        aGroupWithNoNameOrDescription: groupChat.buildGroupMemberSystemPrompt(alice, { name: "", description: "" }, [bob]),
        aSharedRoom: groupChat.buildGroupMemberSystemPrompt(alice, week, [bob], { isSharedRoom: true }),
        aSharedRoomAlone: groupChat.buildGroupMemberSystemPrompt(alice, week, [], { isSharedRoom: true }),
        sharedRoomVariants: [false, undefined, null, 0, "", 1, "yes", {}].map((isSharedRoom) => ({ isSharedRoom, saysCrossUser: groupChat.buildGroupMemberSystemPrompt(alice, week, [], { isSharedRoom }).includes("cross-user room turn") })),
        optionsLeftOutEmptyOrUndefined: [groupChat.buildGroupMemberSystemPrompt(alice, week, []) === groupChat.buildGroupMemberSystemPrompt(alice, week, [], {}), groupChat.buildGroupMemberSystemPrompt(alice, week, []) === groupChat.buildGroupMemberSystemPrompt(alice, week, [], undefined)],
        declaredParameters: groupChat.buildGroupMemberSystemPrompt.length,
        nullOptions: attempt(() => groupChat.buildGroupMemberSystemPrompt(alice, week, [], null)),
        aMemberWithNoDescription: attempt(() => groupChat.buildGroupMemberSystemPrompt({ id: "x", name: "X" }, week, [])),
        aPeerWithNoDescription: attempt(() => groupChat.buildGroupMemberSystemPrompt(alice, week, [{ id: "x", name: "X" }])),
        noPeers: attempt(() => groupChat.buildGroupMemberSystemPrompt(alice, week)),
        noGroup: attempt(() => groupChat.buildGroupMemberSystemPrompt(alice)),
        noMember: attempt(() => groupChat.buildGroupMemberSystemPrompt()),
      };
    },
  },
  {
    name: "what was said since a member last spoke",
    run: ({ groupChat }) => {
      const history = [user("one"), member(alice, "two"), member(bob, "three"), user("four"), member(alice, "five"), user("six"), member(bob, "seven")];
      const contents = (messages) => messages.map((message) => message.content);
      const never = groupChat.messagesSinceMemberLastSpoke(history, "c");
      const spoke = groupChat.messagesSinceMemberLastSpoke(history, "a");
      const empty = [];
      return {
        sinceAlice: contents(spoke),
        sinceBob: contents(groupChat.messagesSinceMemberLastSpoke(history, "b")),
        sinceCaraWhoNeverSpoke: contents(never),
        neverSpokeGivesTheVeryList: never === history,
        spokeGivesANewList: spoke !== history,
        theSameMessagesInside: spoke[0] === history[5],
        emptyHistoryGivesTheVeryList: groupChat.messagesSinceMemberLastSpoke(empty, "a") === empty,
        aUserWithTheSameIdDoesNotCount: contents(groupChat.messagesSinceMemberLastSpoke([{ speaker: { kind: "user", id: "a" }, content: "one" }, user("two")], "a")),
        anotherKindWithTheSameIdDoesNotCount: contents(groupChat.messagesSinceMemberLastSpoke([{ speaker: { kind: "system", id: "a" }, content: "one" }, user("two")], "a")),
        noIdGiven: contents(groupChat.messagesSinceMemberLastSpoke(history)),
        aMemberWithNoIdWhenNoneIsGiven: contents(groupChat.messagesSinceMemberLastSpoke([{ speaker: { kind: "member", name: "Ghost" }, content: "one" }, user("two")])),
        gapsAndMissingSpeakers: contents(groupChat.messagesSinceMemberLastSpoke([member(alice, "one"), undefined, { content: "no speaker" }, null, user("last")].filter((entry) => entry !== null), "a").map((entry) => entry ?? { content: "(a gap)" })),
        aNullEntry: attempt(() => groupChat.messagesSinceMemberLastSpoke([member(alice, "one"), null], "a").length),
        aTextAsHistory: attempt(() => groupChat.messagesSinceMemberLastSpoke("abc", "a")),
        nullAsHistory: attempt(() => groupChat.messagesSinceMemberLastSpoke(null, "a")),
        declaredParameters: groupChat.messagesSinceMemberLastSpoke.length,
      };
    },
  },
  {
    name: "what a member is given at its turn: the tag, the new lines, and whose turn it is",
    run: ({ groupChat }) => {
      const week = { name: "Week", description: "the weekly room" };
      const many = Array.from({ length: 25 }, (_, at) => user(`message ${at + 1}`));
      const long = groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [bob], newMessages: many });
      return {
        withNewMessages: groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [bob, cara], newMessages: [user("hello everyone", "Bass"), member(bob, "hi"), member(alice, "I said this")] }),
        nothingNew: groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [bob, cara], newMessages: [] }),
        alone: groupChat.buildGroupTurnPrompt({ member: bob, group: { name: "", description: "" }, peers: [], newMessages: [user("anyone?")] }),
        twentyFiveNewMessages: { lines: long.split("\n").length, third: long.split("\n")[2], lastMessageLine: long.split("\n").at(-3) },
        isAGroupTurnPrompt: groupChat.isGroupTurnPromptText(long),
        extraFieldsAreIgnored: groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [], newMessages: [], more: "ignored" }) === groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [], newMessages: [] }),
        noNewMessagesField: attempt(() => groupChat.buildGroupTurnPrompt({ member: alice, group: week, peers: [] })),
        noMember: attempt(() => groupChat.buildGroupTurnPrompt({ group: week, peers: [], newMessages: [] })),
        nothingGiven: attempt(() => groupChat.buildGroupTurnPrompt()),
      };
    },
  },

  // --- xuser.ts ---
  {
    name: "the limits of a turn sent to another person's agent",
    run: ({ xuser }) => ({ REMOTE_MEMBER_TURN_TIMEOUT_MS: xuser.REMOTE_MEMBER_TURN_TIMEOUT_MS, REMOTE_TURN_MESSAGE_LIMIT: xuser.REMOTE_TURN_MESSAGE_LIMIT, REMOTE_TURN_TEXT_MAX_LENGTH: xuser.REMOTE_TURN_TEXT_MAX_LENGTH }),
  },
  {
    name: "box tools in a shared room are on unless the setting says 0 or false",
    run: ({ xuser }) => ({
      settings: [undefined, null, "", "0", "false", "False", "FALSE", "fAlSe", "1", "true", "no", "off", "00", " 0", "0 ", " false", "false ", "0.0", "FALSE!"].map((setting) => ({ setting, on: xuser.resolveSharedRoomBoxToolsEnabled(setting) })),
      leftOut: xuser.resolveSharedRoomBoxToolsEnabled(),
      notTexts: [0, 1, false, true, {}, [], ["0"].slice(0, 0)].map((setting) => ({ setting, on: attempt(() => xuser.resolveSharedRoomBoxToolsEnabled(setting)) })),
      aListHoldingZero: attempt(() => xuser.resolveSharedRoomBoxToolsEnabled(["0"])),
      anObjectWithALength: attempt(() => xuser.resolveSharedRoomBoxToolsEnabled({ length: 2 })),
      declaredParameters: xuser.resolveSharedRoomBoxToolsEnabled.length,
    }),
  },
  {
    name: "the rules a member is given in a room shared with other people",
    run: ({ xuser }) => ({
      hostedBySomeoneElse: xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost: true }),
      hostedByTheUser: xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost: false }),
      lines: xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost: true }).split("\n").length,
      startsWithALineEnd: xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost: true }).startsWith("\n"),
      theHostNameIsUsedAsGiven: [undefined, "", "  Dana  ", "Two\nlines", 5].map((hostName) => xuser.buildSharedRoomGuardrailPrompt({ hostName, isForeignHost: true }).split("\n")[2]),
      anyTruthyMeansSomeoneElse: [1, "yes", {}, 0, "", null, undefined].map((isForeignHost) => xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost }).includes("hosted by Dana")),
      nothingGiven: attempt(() => xuser.buildSharedRoomGuardrailPrompt()),
    }),
  },
  {
    name: "the room's messages as they are sent to another person's agent",
    run: ({ xuser }) => {
      const history = [user("hello everyone", "Bass"), user("no name"), user("empty name", ""), user("a name of spaces", "   "), user("a name of line ends", "\n\n"), member(bob, "hi"), member(alice, "I am the one asked"), member(cara, "  padded  \n"), { speaker: { kind: "system", id: "a", name: "Another kind" }, content: "read as an agent" }];
      const sent = xuser.toXuserTurnMessages(history, "a");
      return {
        sent,
        keys: sent.map((message) => Object.keys(message)),
        noMemberIdGiven: xuser.toXuserTurnMessages([member(bob, "hi"), { speaker: { kind: "member", name: "No id" }, content: "x" }]),
        empty: xuser.toXuserTurnMessages([], "a"),
        declaredParameters: xuser.toXuserTurnMessages.length,
      };
    },
  },
  {
    name: "names are cut to 120 characters on one line and texts to 8000, after the spaces around them are dropped",
    run: ({ xuser }) => {
      const sizes = (messages) => messages.map((message) => ({ name: message.speakerName.length, text: message.text.length }));
      const named = (name) => xuser.toXuserTurnMessages([member({ id: "x", name }, "t"), user("t", name)], "a").map((message) => message.speakerName);
      return {
        nameLengths: [119, 120, 121, 500].map((length) => ({ length, kept: sizes(xuser.toXuserTurnMessages([member({ id: "x", name: letters(length) }, "t"), user("t", letters(length))], "a")).map((size) => size.name) })),
        textLengths: [7999, 8000, 8001, 20000].map((length) => ({ length, kept: sizes(xuser.toXuserTurnMessages([member(bob, letters(length)), user(letters(length))], "a")).map((size) => size.text) })),
        lineEndsInANameBecomeOneSpace: named("First\nSecond\r\n\r\nThird"),
        spacesAroundANameAreDropped: named("  \n Padded \r\n "),
        aLongNameIsCutAfterTheSpacesAreDropped: named(`   ${letters(118)} yz`).map((name) => JSON.stringify(name.slice(-4))),
        aNameCutAtASpaceKeepsIt: named(`${letters(119)} tail`).map((name) => JSON.stringify(name.slice(-2))),
        lineEndsInATextStay: xuser.toXuserTurnMessages([member(bob, "\n one\n\ntwo \n")], "a")[0].text,
        aLongTextIsCutAfterTheSpacesAreDropped: xuser.toXuserTurnMessages([member(bob, `   ${letters(7998)} yz`)], "a")[0].text.slice(-4),
        whatIsNotATextBecomesEmpty: xuser.toXuserTurnMessages([{ speaker: { kind: "member", id: "x", name: 5 }, content: 5 }, { speaker: { kind: "member", id: "x" }, content: null }, { speaker: { kind: "user", name: 5 }, content: ["a"] }, { speaker: { kind: "user", name: {} } }], "a"),
      };
    },
  },
  {
    name: "only the last 24 messages are sent, and only the first 24 received are read",
    run: ({ xuser }) => {
      const out = {};
      for (const count of [23, 24, 25, 60]) {
        const history = Array.from({ length: count }, (_, at) => user(`m${at + 1}`));
        const sent = xuser.toXuserTurnMessages(history, "a");
        const received = xuser.fromXuserTurnMessages(Array.from({ length: count }, (_, at) => ({ speakerKind: "human", speakerName: "Bass", text: `m${at + 1}` })), "a");
        out[count] = { sent: sent.length, firstSent: sent[0].text, lastSent: sent.at(-1).text, read: received.length, firstRead: received[0].content, lastRead: received.at(-1).content };
      }
      return out;
    },
  },
  {
    name: "a turn's messages as another person's agent reads them",
    run: ({ xuser }) => {
      const messages = [
        { speakerKind: "human", speakerName: "Bass", text: "hello" },
        { speakerKind: "human", speakerName: "", text: "no name" },
        { speakerKind: "human", text: "name left out" },
        { speakerKind: "agent", speakerName: "Bob", text: "hi" },
        { speakerKind: "agent", speakerName: "Alice Smith", text: "me", isSelf: true },
        { speakerKind: "agent", speakerName: "Looks like me", text: "not exactly true", isSelf: "true" },
        { speakerKind: "agent", speakerName: "One", text: "isSelf one", isSelf: 1 },
        { speakerKind: "agent", speakerName: "Not me", text: "isSelf false", isSelf: false },
        { speakerKind: "agent", text: "no name" },
        { speakerKind: "something else", speakerName: "Another kind", text: "read as an agent" },
        { speakerName: "No kind", text: "read as an agent too" },
        { speakerKind: "human", speakerName: "Is self", text: "a person marked as self stays a person", isSelf: true },
        { speakerKind: "agent", speakerName: `  Padded\nname ${letters(200)}`, text: `  ${letters(9000)}  ` },
        { speakerKind: "human", speakerName: 5, text: 5 },
      ];
      const read = xuser.fromXuserTurnMessages(messages, "a");
      return {
        read: read.map((message) => ({ ...message, content: message.content.length > 100 ? `(${message.content.length} characters)` : message.content, speaker: { ...message.speaker, ...(message.speaker.id?.length > 100 ? { id: `(${message.speaker.id.length} characters)` } : {}), name: message.speaker.name.length > 100 ? `(${message.speaker.name.length} characters)` : message.speaker.name } })),
        keys: read.map((message) => [Object.keys(message), Object.keys(message.speaker)]),
        thePeerIdHoldsTheNameAsItCame: read[12].speaker.id === `peer:${messages[12].speakerName}`,
        noSelfIdGiven: xuser.fromXuserTurnMessages([{ speakerKind: "agent", speakerName: "Me", text: "x", isSelf: true }]),
        empty: xuser.fromXuserTurnMessages([], "a"),
        declaredParameters: xuser.fromXuserTurnMessages.length,
      };
    },
  },
  {
    name: "sent and read again, a room's messages keep who spoke and what was said",
    run: ({ xuser, groupChat }) => {
      const history = [user("hello everyone", "Bass"), user("no name"), member(bob, "hi"), member(alice, "I am the one asked"), member(cara, "  padded  ")];
      const back = xuser.fromXuserTurnMessages(xuser.toXuserTurnMessages(history, "a"), "a");
      return { back, asTheAskedMemberSeesIt: groupChat.formatGroupHistory(back, "a"), asAnotherSeesIt: groupChat.formatGroupHistory(back, "peer:Bob") };
    },
  },
  {
    name: "lists and entries of the wrong kind for a turn's messages",
    run: ({ xuser }) => ({
      historyIsNull: attempt(() => xuser.toXuserTurnMessages(null, "a")),
      historyIsAText: attempt(() => xuser.toXuserTurnMessages("abc", "a")),
      aMissingMessage: attempt(() => xuser.toXuserTurnMessages([undefined], "a")),
      aMessageWithNoSpeaker: attempt(() => xuser.toXuserTurnMessages([{ content: "x" }], "a")),
      aGapInTheHistory: attempt(() => xuser.toXuserTurnMessages([user("x"), , user("y")], "a").length),
      messagesIsNull: attempt(() => xuser.fromXuserTurnMessages(null, "a")),
      messagesIsAText: attempt(() => xuser.fromXuserTurnMessages("abc", "a")),
      aMissingTurnMessage: attempt(() => xuser.fromXuserTurnMessages([null], "a")),
      aGapInTheMessages: attempt(() => xuser.fromXuserTurnMessages([{ speakerKind: "human", text: "x" }, , { speakerKind: "human", text: "y" }], "a").length),
    }),
  },
  {
    name: "the two prompts for a member answering in another person's room",
    run: ({ xuser, groupChat }) => {
      const week = { name: "Week", description: "the weekly room" };
      const newMessages = [
        { speakerKind: "human", speakerName: "Dana", text: "hello @alice" },
        { speakerKind: "agent", speakerName: "Bob", text: "hi" },
        { speakerKind: "agent", speakerName: "Alice Smith", text: "I said this", isSelf: true },
      ];
      const prompts = xuser.buildRemoteMemberTurnPrompts({ member: alice, group: week, peers: [bob], hostName: "Dana", newMessages });
      const nothingNew = xuser.buildRemoteMemberTurnPrompts({ member: alice, group: week, peers: [], hostName: "", newMessages: [] });
      const thirty = xuser.buildRemoteMemberTurnPrompts({ member: alice, group: week, peers: [], hostName: "Dana", newMessages: Array.from({ length: 30 }, (_, at) => ({ speakerKind: "human", speakerName: "Dana", text: `m${at + 1}` })) });
      return {
        prompts,
        keys: Object.keys(prompts),
        theSystemPromptIsTheSharedRoomOneAndTheRulesForSomeoneElsesRoom: prompts.systemPrompt === groupChat.buildGroupMemberSystemPrompt(alice, week, [bob], { isSharedRoom: true }) + xuser.buildSharedRoomGuardrailPrompt({ hostName: "Dana", isForeignHost: true }),
        nothingNew,
        thirtyMessages: { lines: thirty.prompt.split("\n").length, firstShown: thirty.prompt.split("\n")[2], lastShown: thirty.prompt.split("\n").at(-3) },
        peersWithoutIds: xuser.buildRemoteMemberTurnPrompts({ member: { id: "a", name: "Alice", description: "" }, group: week, peers: [{ name: "Bob", description: "designs" }], hostName: "Dana", newMessages: [] }).systemPrompt.split("\n").slice(0, 5),
        noNewMessages: attempt(() => xuser.buildRemoteMemberTurnPrompts({ member: alice, group: week, peers: [], hostName: "Dana" })),
        nothingGiven: attempt(() => xuser.buildRemoteMemberTurnPrompts()),
      };
    },
  },
  {
    name: "a guest's name: one line, at most 120 characters, and Someone when nothing is left",
    run: ({ xuser }) => {
      const names = ["Dana", "  Dana  ", "", "   ", "\n", "\r\n\r\n", "Two\nlines", "a\r\n\r\nb", "\tTabbed\t", " \n padded inside \n ", 5, null, undefined, {}, ["Dana"], true];
      return {
        names: names.map((name) => ({ name, guest: xuser.clampGuestName(name) })),
        lengths: [119, 120, 121, 1000].map((length) => ({ length, kept: xuser.clampGuestName(letters(length)).length })),
        cutAfterTheSpacesAreDropped: JSON.stringify(xuser.clampGuestName(`  ${letters(119)}yz`).slice(-3)),
        aNameThatIsOnlySpacesAfterTheCut: JSON.stringify(xuser.clampGuestName(`a${" ".repeat(200)}b`).slice(0, 5)),
        leftOut: xuser.clampGuestName(),
        declaredParameters: xuser.clampGuestName.length,
      };
    },
  },

  // --- group-store.ts ---
  {
    name: "the group file's name, version and member limit, and where the file is",
    run: ({ groupStore }) => ({
      SAND_GROUP_FILENAME: groupStore.SAND_GROUP_FILENAME,
      GROUP_CONFIG_VERSION: groupStore.GROUP_CONFIG_VERSION,
      GROUP_MAX_MEMBERS: groupStore.GROUP_MAX_MEMBERS,
      paths: ["/agents/a1", "/agents/a1/", "agents/a1", "", ".", "/", "/agents/../a1", "/agents//a1/./x", "~/agents/a1", "with space/äö"].map((dir) => ({ dir, path: groupStore.getSandGroupPath(dir) })),
      notAText: [undefined, null, 5, {}].map((dir) => attempt(() => groupStore.getSandGroupPath(dir))),
    }),
  },
  {
    name: "member ids are tidied: texts only, spaces dropped, each once, at most six",
    run: ({ groupStore }) => {
      const lists = {
        "plain": ["a", "b", "c"],
        "spaces around": [" a ", "b\n", "\tc"],
        "repeats": ["a", "b", "a", " a", "b "],
        "empty and blank": ["", "  ", "a", "\n"],
        "not texts": [1, null, undefined, {}, ["a"], true, "kept"],
        "five": ["1", "2", "3", "4", "5"],
        "six": ["1", "2", "3", "4", "5", "6"],
        "seven": ["1", "2", "3", "4", "5", "6", "7"],
        "seven with repeats before the sixth": ["1", "1", "2", "2", "3", "4", "5", "6", "7"],
        "case matters": ["A", "a"],
        "a gap": ["a", , "b"],
        "empty": [],
      };
      const given = ["a", "b"];
      return {
        lists: Object.fromEntries(Object.entries(lists).map(([name, list]) => [name, groupStore.normalizeMemberIds(list)])),
        notLists: [undefined, null, "a,b", 5, { 0: "a", length: 1 }, new Set(["a"])].map((raw) => groupStore.normalizeMemberIds(raw)),
        aNewListEachTime: groupStore.normalizeMemberIds(given) !== given,
        declaredParameters: groupStore.normalizeMemberIds.length,
      };
    },
  },
  {
    name: "members from other people are tidied: an owner and an agent each, once per pair, a name or Agent, at most six",
    run: ({ groupStore }) => {
      const one = (owner, agent, more = {}) => ({ ownerAuthId: owner, agentId: agent, ...more });
      const lists = {
        "plain": [one("u1", "a1", { name: "Ann's helper", avatarDataUrl: "data:image/png;base64,AAAA" })],
        "spaces dropped from ids and name, not from the picture": [one(" u1 ", "\ta1\n", { name: "  Helper  ", avatarDataUrl: "  data:x  " })],
        "no name, an empty one, a blank one, one that is not a text": [one("u1", "a1"), one("u1", "a2", { name: "" }), one("u1", "a3", { name: "   " }), one("u1", "a4", { name: 5 })],
        "pictures: none, empty, blank, not a text": [one("u1", "a1"), one("u1", "a2", { avatarDataUrl: "" }), one("u1", "a3", { avatarDataUrl: " " }), one("u1", "a4", { avatarDataUrl: 5 })],
        "the same pair twice: the first is kept": [one("u1", "a1", { name: "First" }), one(" u1", "a1 ", { name: "Second" }), one("u1", "a2", { name: "Other agent" }), one("u2", "a1", { name: "Other owner" })],
        "missing or empty ids": [one("", "a1"), one("u1", ""), one("  ", "a1"), one("u1", "\n"), { ownerAuthId: "u1" }, { agentId: "a1" }, {}],
        "ids that are not texts": [one(1, "a1"), one("u1", 2), one(null, "a1"), one("u1", undefined), one(["u1"], "a1")],
        "entries that are not objects": [null, undefined, "u1:a1", 5, true, ["u1", "a1"], one("u1", "a1")],
        "other fields are dropped": [one("u1", "a1", { name: "N", extra: "gone", version: 2 })],
        "five": Array.from({ length: 5 }, (_, at) => one("u", `a${at + 1}`)),
        "six": Array.from({ length: 6 }, (_, at) => one("u", `a${at + 1}`)),
        "seven": Array.from({ length: 7 }, (_, at) => one("u", `a${at + 1}`)),
        "seven with entries left out before the sixth": [one("u", "a1"), null, one("u", "a1"), one("u", "a2"), one("", "x"), one("u", "a3"), one("u", "a4"), one("u", "a5"), one("u", "a6"), one("u", "a7")],
        "a gap": [one("u1", "a1"), , one("u1", "a2")],
        "empty": [],
      };
      const tidy = groupStore.normalizeRemoteMembers(lists.plain);
      return {
        lists: Object.fromEntries(Object.entries(lists).map(([name, list]) => [name, groupStore.normalizeRemoteMembers(list)])),
        keys: [Object.keys(tidy[0]), Object.keys(groupStore.normalizeRemoteMembers([one("u1", "a1")])[0])],
        newObjects: tidy[0] !== lists.plain[0],
        notLists: [undefined, null, "x", 5, { 0: one("u1", "a1"), length: 1 }, one("u1", "a1")].map((raw) => groupStore.normalizeRemoteMembers(raw)),
        declaredParameters: groupStore.normalizeRemoteMembers.length,
      };
    },
  },
  {
    name: "a group written to a folder is one file, group.json, and reads back as it was tidied",
    run: async ({ groupStore }, tools) => {
      const dir = await tools.tmp();
      const agentDir = path.join(dir, "agents", "g1");
      const answer = groupStore.writeSandGroupConfig(agentDir, {
        version: 1,
        memberIds: [" a ", "b", "a", 7, "c"],
        remoteMembers: [{ ownerAuthId: "u2", agentId: "x1", name: " Helper ", avatarDataUrl: "data:image/png;base64,AAAA", extra: true }, { ownerAuthId: "", agentId: "x2" }],
        sharedRoomId: "room-1",
        extra: "not written",
      });
      return {
        answer,
        files: filesUnder(dir),
        pathIsTheFile: tools.scrub(groupStore.getSandGroupPath(agentDir), { [dir]: "<tmp>" }),
        read: groupStore.readSandGroupConfig(agentDir),
        readKeys: Object.keys(groupStore.readSandGroupConfig(agentDir)),
        isGroup: groupStore.isSandGroupDir(agentDir),
        theFolderAboveIsNotAGroup: groupStore.isSandGroupDir(path.join(dir, "agents")),
        aFolderThatIsNotThere: [groupStore.readSandGroupConfig(path.join(dir, "missing")), groupStore.isSandGroupDir(path.join(dir, "missing"))],
        nothingElseWasMade: existsSync(path.join(dir, "missing")),
      };
    },
  },
  {
    name: "what is written for every shape of group: the version as given, tidy members, other people's members and a room id only when there are any",
    run: async ({ groupStore }, tools) => {
      const configs = {
        "members only": { version: 1, memberIds: ["a", "b"] },
        "no members at all": { version: 1, memberIds: [] },
        "other people's members": { version: 1, memberIds: ["a"], remoteMembers: [{ ownerAuthId: "u2", agentId: "x1", name: "Helper" }] },
        "other people's members that are all left out": { version: 1, memberIds: ["a"], remoteMembers: [{ ownerAuthId: "", agentId: "x1" }] },
        "a room id": { version: 1, memberIds: [], sharedRoomId: "room-1" },
        "an empty room id": { version: 1, memberIds: ["a"], sharedRoomId: "" },
        "a room id that is a number": { version: 1, memberIds: ["a"], sharedRoomId: 5 },
        "a room id of zero": { version: 1, memberIds: ["a"], sharedRoomId: 0 },
        "version 2": { version: 2, memberIds: ["a"] },
        "a version that is a text": { version: "3", memberIds: ["a"] },
        "no version": { memberIds: ["a"] },
        "a version that is not a number": { version: Number.NaN, memberIds: ["a"] },
        "members that are not a list": { version: 1, memberIds: "a,b" },
        "seven members": { version: 1, memberIds: ["1", "2", "3", "4", "5", "6", "7"] },
        "an empty config": {},
        "a text in place of a config": "group",
      };
      const out = {};
      for (const [name, config] of Object.entries(configs)) {
        const dir = await tools.tmp();
        const wrote = attempt(() => groupStore.writeSandGroupConfig(dir, config));
        out[name] = { ...(wrote === undefined ? {} : wrote), file: existsSync(path.join(dir, "group.json")) ? readFileSync(path.join(dir, "group.json"), "utf8") : "(no file)", read: attempt(() => groupStore.readSandGroupConfig(dir)), isGroup: attempt(() => groupStore.isSandGroupDir(dir)) };
      }
      return out;
    },
  },
  {
    name: "what a group file reads as, for every content",
    run: async ({ groupStore }, tools) => {
      const contents = {
        "an empty file": "",
        "not JSON": "{ memberIds: [a] }",
        "JSON cut short": '{"memberIds": ["a"',
        "null": "null",
        "a number": "5",
        "a text": '"group"',
        "true": "true",
        "a list": '["a", "b"]',
        "an empty object": "{}",
        "only a version": '{"version": 1}',
        "members": '{"memberIds": ["a", "b"]}',
        "members with a version": '{"version": 7, "memberIds": ["a"]}',
        "untidy members": '{"version": 1, "memberIds": [" a ", "a", 5, null, "b", ""]}',
        "members that are all left out": '{"version": 1, "memberIds": ["", 5]}',
        "members that are not a list": '{"version": 1, "memberIds": "a"}',
        "only other people's members": '{"remoteMembers": [{"ownerAuthId": "u2", "agentId": "x1"}]}',
        "other people's members that are all left out": '{"remoteMembers": [{"ownerAuthId": "u2"}]}',
        "only a room id": '{"sharedRoomId": "room-1"}',
        "an empty room id": '{"sharedRoomId": ""}',
        "a room id that is a number": '{"sharedRoomId": 5}',
        "a room id of one space": '{"sharedRoomId": " "}',
        "everything": '{"version": 1, "memberIds": ["a"], "remoteMembers": [{"ownerAuthId": "u2", "agentId": "x1", "name": "Helper", "avatarDataUrl": "data:x"}], "sharedRoomId": "room-1", "extra": "ignored"}',
        "keys in another order": '{"sharedRoomId": "room-1", "remoteMembers": [{"agentId": "x1", "ownerAuthId": "u2"}], "memberIds": ["a"], "version": 2}',
        "a version that is a text": '{"version": "2", "memberIds": ["a"]}',
        "a version of null": '{"version": null, "memberIds": ["a"]}',
        "a version with a fraction": '{"version": 1.5, "memberIds": ["a"]}',
        "a version of zero": '{"version": 0, "memberIds": ["a"]}',
        "a version too large for a number": '{"version": 1e999, "memberIds": ["a"]}',
        "spaces and line ends around": '\n  {"memberIds": ["a"]}  \n',
        "a byte order mark first": '﻿{"memberIds": ["a"]}',
        "the same key twice": '{"memberIds": ["a"], "memberIds": ["b"]}',
        "seven members": '{"memberIds": ["1","2","3","4","5","6","7"]}',
      };
      const out = {};
      for (const [name, text] of Object.entries(contents)) {
        const dir = await folderWith(tools, "group.json", text);
        out[name] = { read: attempt(() => groupStore.readSandGroupConfig(dir)), isGroup: attempt(() => groupStore.isSandGroupDir(dir)) };
      }
      const empty = await tools.tmp();
      mkdirSync(path.join(empty, "group.json"));
      return {
        ...out,
        "no file": { read: groupStore.readSandGroupConfig(await tools.tmp()), isGroup: groupStore.isSandGroupDir(await tools.tmp()) },
        "a folder named group.json": { read: groupStore.readSandGroupConfig(empty), isGroup: groupStore.isSandGroupDir(empty) },
        "a folder that is not a text": [undefined, null, 5].map((dir) => ({ read: attempt(() => groupStore.readSandGroupConfig(dir)), isGroup: attempt(() => groupStore.isSandGroupDir(dir)) })),
        declaredParameters: [groupStore.readSandGroupConfig.length, groupStore.writeSandGroupConfig.length, groupStore.isSandGroupDir.length, groupStore.getSandGroupPath.length],
      };
    },
  },
  {
    name: "each read of a group file gives a new answer, and a later write replaces the file whole",
    run: async ({ groupStore }, tools) => {
      const dir = await tools.tmp();
      groupStore.writeSandGroupConfig(dir, { version: 1, memberIds: ["a", "b", "c"], sharedRoomId: "room-1" });
      const first = groupStore.readSandGroupConfig(dir);
      const second = groupStore.readSandGroupConfig(dir);
      first.memberIds.push("changed after reading");
      const before = readFileSync(path.join(dir, "group.json"), "utf8");
      groupStore.writeSandGroupConfig(dir, { version: 2, memberIds: ["z"] });
      // A file that other code wrote beside it is left alone.
      writeFileSync(path.join(dir, "other.json"), "{}");
      groupStore.writeSandGroupConfig(dir, { version: 3, memberIds: ["y"] });
      return { differentAnswers: first !== second, theSecondIsUntouched: second.memberIds, before, files: filesUnder(dir), read: groupStore.readSandGroupConfig(dir) };
    },
  },
  {
    name: "writing a group where it cannot be written: the folder is made first, then the config is looked at, then the file is written",
    run: async ({ groupStore }, tools) => {
      const dir = await tools.tmp();
      const noConfig = attempt(() => groupStore.writeSandGroupConfig(path.join(dir, "no-config", "deep"), undefined));
      const nullConfig = attempt(() => groupStore.writeSandGroupConfig(path.join(dir, "null-config"), null));
      writeFileSync(path.join(dir, "a-file"), "in the way");
      const underAFile = attempt(() => groupStore.writeSandGroupConfig(path.join(dir, "a-file", "agent"), { version: 1, memberIds: ["a"] }));
      const atAFile = attempt(() => groupStore.writeSandGroupConfig(path.join(dir, "a-file"), { version: 1, memberIds: ["a"] }));
      mkdirSync(path.join(dir, "taken", "group.json"), { recursive: true });
      const fileNameIsAFolder = attempt(() => groupStore.writeSandGroupConfig(path.join(dir, "taken"), { version: 1, memberIds: ["a"] }));
      const lookedAt = new Set();
      const watched = new Proxy({ version: 1, memberIds: ["a"], remoteMembers: [], sharedRoomId: "r", extra: "never read" }, { get: (target, key) => (lookedAt.add(key), target[key]) });
      groupStore.writeSandGroupConfig(path.join(dir, "watched"), watched);
      return {
        noConfig,
        nullConfig,
        underAFile,
        atAFile,
        fileNameIsAFolder,
        folderIsNotAText: [undefined, null, 5].map((agentDir) => attempt(() => groupStore.writeSandGroupConfig(agentDir, { version: 1, memberIds: ["a"] }))),
        theOnlyFieldsReadFromAConfig: [...lookedAt].sort(),
        files: filesUnder(dir),
      };
    },
  },

  // --- remote-room-store.ts ---
  {
    name: "the remote room file's name and version, and where the file is",
    run: ({ remoteRoomStore }) => ({
      SAND_REMOTE_ROOM_FILENAME: remoteRoomStore.SAND_REMOTE_ROOM_FILENAME,
      REMOTE_ROOM_CONFIG_VERSION: remoteRoomStore.REMOTE_ROOM_CONFIG_VERSION,
      paths: ["/agents/r1", "/agents/r1/", "agents/r1", "", ".", "/agents/../r1"].map((dir) => ({ dir, path: remoteRoomStore.getSandRemoteRoomPath(dir) })),
      notAText: [undefined, null, 5].map((dir) => attempt(() => remoteRoomStore.getSandRemoteRoomPath(dir))),
    }),
  },
  {
    name: "a remote room's members are tidied: an auth id each, agent or human, a name or Someone, at most 24",
    run: ({ remoteRoomStore }) => {
      const lists = {
        "an agent and a person": [{ kind: "agent", authId: "u1", agentId: "a1", displayName: "Helper", avatarUrl: "https://example.test/a.png" }, { kind: "human", authId: "u2", agentId: "", displayName: "Dana" }],
        "kinds: only agent is an agent": ["agent", "human", "Agent", "AGENT", "bot", "", undefined, null, 5].map((kind, at) => ({ kind, authId: `u${at}` })),
        "auth ids: missing, empty, blank, not a text": [{}, { authId: "" }, { authId: " " }, { authId: 5 }, { authId: null }, { authId: ["u"] }],
        "agent ids: missing, not a text, blank": [{ authId: "u1" }, { authId: "u2", agentId: 5 }, { authId: "u3", agentId: " " }, { authId: "u4", agentId: null }],
        "names: missing, empty, blank, not a text": [{ authId: "u1" }, { authId: "u2", displayName: "" }, { authId: "u3", displayName: " " }, { authId: "u4", displayName: 5 }],
        "pictures: missing, empty, blank, not a text": [{ authId: "u1" }, { authId: "u2", avatarUrl: "" }, { authId: "u3", avatarUrl: " " }, { authId: "u4", avatarUrl: 5 }],
        "nothing is trimmed and nobody is left out for being there twice": [{ authId: " u1 ", agentId: " a ", displayName: " N " }, { authId: "u1" }, { authId: "u1" }],
        "entries that are not objects": [null, undefined, "u1", 5, true, ["u1"], { authId: "kept" }],
        "other fields are dropped": [{ authId: "u1", extra: "gone", isHost: true }],
        "a gap": [{ authId: "u1" }, , { authId: "u2" }],
        "empty": [],
      };
      const counted = (count) => remoteRoomStore.normalizeRemoteRoomMembers(Array.from({ length: count }, (_, at) => ({ authId: `u${at + 1}` })));
      const tidy = remoteRoomStore.normalizeRemoteRoomMembers(lists["an agent and a person"]);
      return {
        lists: Object.fromEntries(Object.entries(lists).map(([name, list]) => [name, remoteRoomStore.normalizeRemoteRoomMembers(list)])),
        keys: tidy.map((entry) => Object.keys(entry)),
        byCount: [23, 24, 25, 60].map((count) => ({ count, kept: counted(count).length, last: counted(count).at(-1).authId })),
        leftOutOnesDoNotCount: remoteRoomStore.normalizeRemoteRoomMembers([...Array.from({ length: 10 }, () => null), ...Array.from({ length: 30 }, (_, at) => ({ authId: `u${at + 1}` }))]).length,
        notLists: [undefined, null, "x", 5, { 0: { authId: "u1" }, length: 1 }, { authId: "u1" }].map((raw) => remoteRoomStore.normalizeRemoteRoomMembers(raw)),
        declaredParameters: remoteRoomStore.normalizeRemoteRoomMembers.length,
      };
    },
  },
  {
    name: "a remote room written to a folder is one file, remote-room.json, written as given and tidied only when read",
    run: async ({ remoteRoomStore }, tools) => {
      const dir = await tools.tmp();
      const agentDir = path.join(dir, "agents", "r1");
      const config = {
        version: 1,
        roomId: "room-1",
        hostAuthId: "u2",
        hostName: "Dana",
        hostAvatarUrl: "https://example.test/dana.png",
        members: [{ kind: "agent", authId: "u2", agentId: "x1", displayName: "Helper", extra: "written, not read" }, { kind: "human", authId: "", displayName: "left out when read" }],
        isRevoked: true,
        extra: "written, not read",
      };
      const answer = remoteRoomStore.writeSandRemoteRoomConfig(agentDir, config);
      const read = remoteRoomStore.readSandRemoteRoomConfig(agentDir);
      return {
        answer,
        files: filesUnder(dir),
        pathIsTheFile: tools.scrub(remoteRoomStore.getSandRemoteRoomPath(agentDir), { [dir]: "<tmp>" }),
        read,
        readKeys: Object.keys(read),
        isRemoteRoom: remoteRoomStore.isSandRemoteRoomDir(agentDir),
        aNewAnswerEachRead: remoteRoomStore.readSandRemoteRoomConfig(agentDir) !== read,
        theFolderAboveIsNot: remoteRoomStore.isSandRemoteRoomDir(path.join(dir, "agents")),
        aFolderThatIsNotThere: [remoteRoomStore.readSandRemoteRoomConfig(path.join(dir, "missing")), remoteRoomStore.isSandRemoteRoomDir(path.join(dir, "missing"))],
      };
    },
  },
  {
    name: "whatever is given as a remote room is written as JSON, even nothing at all",
    run: async ({ remoteRoomStore }, tools) => {
      const configs = {
        "the least a room needs": { version: 1, roomId: "room-1", hostAuthId: "u2", hostName: "Dana", members: [] },
        "an empty object": {},
        "a list": [1, 2],
        "a text": "room",
        "a number": 5,
        "null": null,
        "nothing": undefined,
        "a function": () => 1,
        "an object that says how it is written": { toJSON: () => ({ roomId: "from-toJSON", hostAuthId: "u9" }) },
        "values JSON leaves out or turns to null": { roomId: "room-1", hostAuthId: "u2", version: Number.NaN, hostName: undefined, members: [undefined, () => 1] },
      };
      const out = {};
      for (const [name, config] of Object.entries(configs)) {
        const dir = await tools.tmp();
        const wrote = attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(dir, config));
        out[name] = { ...(wrote === undefined ? {} : wrote), file: existsSync(path.join(dir, "remote-room.json")) ? readFileSync(path.join(dir, "remote-room.json"), "utf8") : "(no file)", read: attempt(() => remoteRoomStore.readSandRemoteRoomConfig(dir)), isRemoteRoom: attempt(() => remoteRoomStore.isSandRemoteRoomDir(dir)) };
      }
      const loop = {};
      loop.self = loop;
      const dir = await tools.tmp();
      return { ...out, "an object that holds itself": { ...attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "made-first"), loop)), files: filesUnder(dir) } };
    },
  },
  {
    name: "what a remote room file reads as, for every content",
    run: async ({ remoteRoomStore }, tools) => {
      const room = (more) => JSON.stringify({ roomId: "room-1", hostAuthId: "u2", ...more });
      const contents = {
        "an empty file": "",
        "not JSON": "{ roomId: room-1 }",
        "null": "null",
        "a number": "5",
        "a text": '"room"',
        "true": "true",
        "false": "false",
        "a list": "[]",
        "an empty object": "{}",
        "only a room id": '{"roomId": "room-1"}',
        "only a host": '{"hostAuthId": "u2"}',
        "an empty room id": '{"roomId": "", "hostAuthId": "u2"}',
        "an empty host": '{"roomId": "room-1", "hostAuthId": ""}',
        "a room id of one space": '{"roomId": " ", "hostAuthId": " "}',
        "a room id that is a number": '{"roomId": 5, "hostAuthId": "u2"}',
        "a host that is a number": '{"roomId": "room-1", "hostAuthId": 5}',
        "the least a room needs": room({}),
        "a version": room({ version: 4 }),
        "a version that is a text": room({ version: "4" }),
        "a version of zero": room({ version: 0 }),
        "a host name": room({ hostName: "Dana" }),
        "an empty host name": room({ hostName: "" }),
        "a blank host name": room({ hostName: " " }),
        "a host name that is not a text": room({ hostName: 5 }),
        "a host picture": room({ hostAvatarUrl: "https://example.test/d.png" }),
        "an empty host picture": room({ hostAvatarUrl: "" }),
        "a host picture that is not a text": room({ hostAvatarUrl: 5 }),
        "members": room({ members: [{ kind: "agent", authId: "u2", agentId: "x1", displayName: "Helper" }, { authId: "" }, "x", { authId: "u3" }] }),
        "members that are not a list": room({ members: { authId: "u3" } }),
        "revoked": room({ isRevoked: true }),
        "revoked as a text": room({ isRevoked: "true" }),
        "revoked as one": room({ isRevoked: 1 }),
        "not revoked": room({ isRevoked: false }),
        "everything": room({ version: 1, hostName: "Dana", hostAvatarUrl: "https://example.test/d.png", members: [{ kind: "human", authId: "u3", displayName: "Eli", avatarUrl: "https://example.test/e.png" }], isRevoked: true, extra: "ignored" }),
        "keys in another order": '{"isRevoked": true, "members": [], "hostAvatarUrl": "p", "hostName": "Dana", "hostAuthId": "u2", "roomId": "room-1", "version": 2}',
        "a byte order mark first": `﻿${room({})}`,
      };
      const out = {};
      for (const [name, text] of Object.entries(contents)) {
        const dir = await folderWith(tools, "remote-room.json", text);
        const read = attempt(() => remoteRoomStore.readSandRemoteRoomConfig(dir));
        out[name] = { read, ...(read && !read.threw ? { keys: Object.keys(read) } : {}), isRemoteRoom: attempt(() => remoteRoomStore.isSandRemoteRoomDir(dir)) };
      }
      const taken = await tools.tmp();
      mkdirSync(path.join(taken, "remote-room.json"));
      return {
        ...out,
        "no file": { read: remoteRoomStore.readSandRemoteRoomConfig(await tools.tmp()), isRemoteRoom: remoteRoomStore.isSandRemoteRoomDir(await tools.tmp()) },
        "a folder named remote-room.json": { read: remoteRoomStore.readSandRemoteRoomConfig(taken), isRemoteRoom: remoteRoomStore.isSandRemoteRoomDir(taken) },
        "a folder that is not a text": [undefined, null, 5].map((dir) => ({ read: attempt(() => remoteRoomStore.readSandRemoteRoomConfig(dir)), isRemoteRoom: attempt(() => remoteRoomStore.isSandRemoteRoomDir(dir)) })),
        declaredParameters: [remoteRoomStore.readSandRemoteRoomConfig.length, remoteRoomStore.writeSandRemoteRoomConfig.length, remoteRoomStore.isSandRemoteRoomDir.length, remoteRoomStore.getSandRemoteRoomPath.length],
      };
    },
  },
  {
    name: "writing a remote room where it cannot be written, and writing it twice",
    run: async ({ remoteRoomStore }, tools) => {
      const dir = await tools.tmp();
      const room = { version: 1, roomId: "room-1", hostAuthId: "u2", hostName: "Dana", members: [] };
      writeFileSync(path.join(dir, "a-file"), "in the way");
      const underAFile = attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "a-file", "agent"), room));
      const atAFile = attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "a-file"), room));
      mkdirSync(path.join(dir, "taken", "remote-room.json"), { recursive: true });
      const fileNameIsAFolder = attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "taken"), room));
      remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "twice"), room);
      remoteRoomStore.writeSandRemoteRoomConfig(path.join(dir, "twice"), { ...room, roomId: "room-2", isRevoked: true });
      return {
        underAFile,
        atAFile,
        fileNameIsAFolder,
        folderIsNotAText: [undefined, null, 5].map((agentDir) => attempt(() => remoteRoomStore.writeSandRemoteRoomConfig(agentDir, room))),
        files: filesUnder(dir),
      };
    },
  },
  {
    name: "a group file and a remote room file in one folder do not disturb each other",
    run: async ({ groupStore, remoteRoomStore }, tools) => {
      const dir = await tools.tmp();
      groupStore.writeSandGroupConfig(dir, { version: 1, memberIds: ["a"], sharedRoomId: "room-1" });
      remoteRoomStore.writeSandRemoteRoomConfig(dir, { version: 1, roomId: "room-1", hostAuthId: "u2", hostName: "Dana", members: [] });
      return { files: Object.keys(filesUnder(dir)), group: groupStore.readSandGroupConfig(dir), room: remoteRoomStore.readSandRemoteRoomConfig(dir), both: [groupStore.isSandGroupDir(dir), remoteRoomStore.isSandRemoteRoomDir(dir)] };
    },
  },
];
