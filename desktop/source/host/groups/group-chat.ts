/**
 * The rules of a group chat that need no state: in which order the members
 * speak, who a message is addressed to, what counts as passing, and the
 * words a member is given before and at its turn.
 */

/** The version written into a group's file. */
export const GROUP_CONFIG_VERSION = 1;
/** How many messages the members may post, all together, in answer to one message. */
export const GROUP_MAX_MEMBER_TURNS = 10;
/** How many times the room goes round its members in answer to one message. */
export const GROUP_MAX_ROUNDS = 3;
/** How many of the room's latest lines a member is shown at its turn. */
export const GROUP_PROMPT_HISTORY_LIMIT = 24;
/** How many messages one member may post in one turn. */
export const GROUP_MAX_MESSAGES_PER_TURN = 2;
/** How many of the latest lines a member is given in a room shared with other people. */
export const SHARED_ROOM_HISTORY_LIMIT = 24;
/** How the prompt of a group turn begins. Other code tells a group turn by it. */
export const GROUP_CHAT_TAG_PREFIX = "[Group chat: ";
/** What a prompt starts with when it is not to be shown in the chat. */
export const SAND_HIDDEN_PROMPT_MARKER = "[SAND_HIDDEN_PROMPT]";

export interface GroupMember {
  id: string;
  name: string;
  description: string;
}

export interface GroupDescription {
  name: string;
  description: string;
}

export type GroupMessage = {
  speaker: { kind: "user"; name?: string } | { kind: "member"; id: string; name: string };
  content: string;
};

/**
 * The speakers of one round, in order. Each round starts one member further
 * along than the round before, so that the same member does not always speak
 * first.
 */
export function orderRoundSpeakers<T>(memberIds: readonly T[], round: number): T[] {
  const count = memberIds.length;
  if (count === 0) {
    return [];
  }
  // The remainder of a negative round is negative; adding the count before taking it again lands on a place in the list.
  const first = ((round % count) + count) % count;
  return [...memberIds.slice(first), ...memberIds.slice(0, first)];
}

/**
 * Whether two lists name the same members, in any order. Only the lengths
 * and the names of the second list are looked at, so a list that repeats a
 * name can pass for another of the same length.
 */
export function isSameMemberSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const inFirst = new Set(a);
  return b.every((id) => inFirst.has(id));
}

/** A group was asked to hold another group. `nestedGroupIds` says which. */
export class SandGroupNestingError extends Error {
  readonly nestedGroupIds: string[];

  constructor(ids: readonly string[]) {
    const which = ids.length === 1 ? "group chat" : "group chats";
    super(`A group chat can only contain individual agents, not other group chats. Remove the ${which} from the member list.`);
    this.name = "SandGroupNestingError";
    this.nestedGroupIds = [...ids];
  }
}

/** Throws when one of the members asked for is itself a group. Each member is asked about once. */
export function assertMembersAreNotGroups(ids: readonly string[], isGroupId: (id: string) => boolean): void {
  const groups = [...new Set(ids)].filter(isGroupId);
  if (groups.length > 0) {
    throw new SandGroupNestingError(groups);
  }
}

/**
 * What a member can be called by after an "@", in small letters: the whole
 * name, the name with its spaces taken out, and its first word.
 */
export function memberMentionHandles(name: string): string[] {
  const whole = name.trim().toLowerCase();
  if (!whole) {
    return [];
  }
  const words = whole.split(/\s+/);
  const handles = new Set([whole, words.join("")]);
  const firstWord = words[0];
  if (firstWord) {
    handles.add(firstWord);
  }
  return [...handles];
}

/** Whether a character next to a handle makes it part of a longer word. The text is in small letters by then. */
function continuesAWord(character: string | undefined): boolean {
  return character !== undefined && /[a-z0-9]/.test(character);
}

/** Whether `lower` holds "@handle" standing by itself somewhere, not run together with letters or digits. */
function addresses(lower: string, handle: string): boolean {
  const mention = `@${handle}`;
  let at = lower.indexOf(mention);
  while (at >= 0) {
    if (!continuesAWord(lower[at - 1]) && !continuesAWord(lower[at + mention.length])) {
      return true;
    }
    at = lower.indexOf(mention, at + 1);
  }
  return false;
}

/** "@everyone" or "@all", at the start or after anything that is not a letter or digit. */
const EVERYONE_MENTION = /(?:^|[^a-z0-9])@(everyone|all)\b/;

/**
 * Who a message is addressed to: the members it mentions, in the order of
 * `members`, and whether it calls on everyone.
 */
export function parseGroupMentions(text: string, members: readonly Pick<GroupMember, "id" | "name">[]): { isEveryone: boolean; memberIds: string[] } {
  const lower = text.toLowerCase();
  const mentioned = new Set<string>();
  for (const member of members) {
    if (mentioned.has(member.id)) {
      continue;
    }
    if (memberMentionHandles(member.name).some((handle) => addresses(lower, handle))) {
      mentioned.add(member.id);
    }
  }
  return { isEveryone: EVERYONE_MENTION.test(lower), memberIds: [...mentioned] };
}

/** Where the user's latest message is; the start of the history when the user has not written. */
function latestFromUser(history: readonly GroupMessage[]): number {
  for (let at = history.length - 1; at >= 0; at -= 1) {
    if (history[at]?.speaker.kind === "user") {
      return at;
    }
  }
  return 0;
}

/**
 * The members who answer. Mentions count from the user's latest message on,
 * the members' own answers to it included: those mentioned answer, and
 * everyone does when nobody was mentioned or everyone was.
 */
export function resolveResponders<T extends Pick<GroupMember, "id" | "name">>(members: readonly T[], history: readonly GroupMessage[]): T[] {
  const from = latestFromUser(history);
  const mentioned = new Set<string>();
  let everyone = false;
  for (const message of history.slice(from)) {
    const mentions = parseGroupMentions(message.content, members);
    everyone ||= mentions.isEveryone;
    for (const id of mentions.memberIds) {
      mentioned.add(id);
    }
  }
  if (everyone || mentioned.size === 0) {
    return [...members];
  }
  return members.filter((member) => mentioned.has(member.id));
}

/** "pass", in or out of brackets, with or without a full stop: a member's way of saying nothing. */
const PASS = /^\(?\s*pass\s*\)?\.?$/i;
/** Any beginning of the above, down to nothing at all. */
const PASS_SO_FAR = /^\(?\s*(?:p|pa|pas|pass\s*\)?\.?)?$/i;

/** Whether what a member sent says nothing: empty, or a pass. */
export function isPassContent(content: string): boolean {
  const said = content.trim();
  return !said || PASS.test(said);
}

/** Whether a text still being written could yet turn out to be a pass, so that it is not shown too early. */
export function isPotentialPassPrefix(text: string): boolean {
  const soFar = text.trim();
  return !soFar || PASS_SO_FAR.test(soFar);
}

/** Added to a member's turn when it is given a second time because a direct message cut the first short. */
export function buildGroupRedriveNote(): string {
  return "\n(Redelivery: your previous attempt at this turn was interrupted by a direct message to you. The room has NOT seen any reply from you for the messages above — anything you said or did while handling that direct message stayed in that private chat. If you already did the work, send the result to this room with SendMessage now; otherwise take the turn normally.)";
}

/** One message as a line of the room, as the member `viewerId` reads it. */
export function formatGroupLine(message: GroupMessage, viewerId: string): string {
  const speaker = message.speaker;
  if (speaker.kind === "user") {
    return speaker.name ? `${speaker.name} (user): ${message.content}` : `User: ${message.content}`;
  }
  const you = speaker.id === viewerId ? " (you)" : "";
  return `${speaker.name}${you}: ${message.content}`;
}

/** The room's latest lines, oldest first. */
export function formatGroupHistory(history: readonly GroupMessage[], viewerId: string, limit = GROUP_PROMPT_HISTORY_LIMIT): string {
  const recent = history.slice(-limit);
  if (recent.length === 0) {
    return "(no messages yet)";
  }
  return recent.map((message) => formatGroupLine(message, viewerId)).join("\n");
}

/** Whether a prompt is a group turn's: it begins with the group tag, after the hidden-prompt mark when it has one. */
export function isGroupTurnPromptText(text: string): boolean {
  const from = text.startsWith(SAND_HIDDEN_PROMPT_MARKER) ? SAND_HIDDEN_PROMPT_MARKER.length : 0;
  return text.startsWith(GROUP_CHAT_TAG_PREFIX, from);
}

export function groupDisplayName(group: GroupDescription): string {
  return group.name.trim() || "the group";
}

/** The group's name in quotes, followed by what it is for when that is known. */
export function describeGroup(group: GroupDescription): string {
  const quoted = `"${groupDisplayName(group)}"`;
  const purpose = group.description.trim();
  return purpose ? `${quoted} — ${purpose}` : quoted;
}

/** The names of some members, as they are listed in a sentence. */
function namesOf(peers: readonly Pick<GroupMember, "name">[]): string {
  return peers.map((peer) => peer.name).join(", ");
}

/** The first line of every group turn: which group, and who else is in it. */
export function formatGroupChatTag(group: GroupDescription, peers: readonly Pick<GroupMember, "name">[]): string {
  const name = groupDisplayName(group);
  const company = peers.length > 0 ? ` - with ${namesOf(peers)}` : "";
  return `${GROUP_CHAT_TAG_PREFIX}"${name}"${company}]`;
}

const TOOLS_IN_OWN_ROOM = "You have your full toolkit in this room. Do the work first, then deliver the result with SendMessage.";
const TOOLS_IN_SHARED_ROOM = "This is a cross-user room turn. Tool calls and plain text are private scratch space; only SendMessage plain text is delivered to the room.";

/**
 * What a member is told before its turn: who it is, who else is there, what
 * its tools are worth in this room, and that only SendMessage reaches the
 * room.
 */
export function buildGroupMemberSystemPrompt(member: GroupMember, group: GroupDescription, peers: readonly GroupMember[], options: { isSharedRoom?: boolean } = {}): string {
  const lines = [`You are ${member.name}, one participant in a group chat (${describeGroup(group)}).`];
  const persona = member.description.trim();
  if (persona) {
    lines.push(`Your persona: ${persona}`);
  }
  if (peers.length > 0) {
    const others = peers.map((peer) => {
      const name = peer.name;
      const about = peer.description.trim();
      return about ? `- ${name} (${about})` : `- ${name}`;
    });
    lines.push("", "Other participants in the room:", ...others);
  }
  lines.push(
    "",
    peers.length > 0 ? `Right now you are speaking in this group chat, with ${namesOf(peers)}.` : "Right now you are speaking in this group chat.",
    options.isSharedRoom ? TOOLS_IN_SHARED_ROOM : TOOLS_IN_OWN_ROOM,
    "",
    `Stay fully in character as ${member.name}. The ONLY way to say something the room can see is the SendMessage tool. Keep each message short and conversational. If you have nothing new worth adding, send exactly "(pass)". Never reveal private one-on-one context.`,
  );
  return lines.join("\n");
}

/**
 * What was said after the member's own latest message. When the member has
 * not spoken, that is the whole history, handed back as it is.
 */
export function messagesSinceMemberLastSpoke(history: readonly GroupMessage[], memberId: string): readonly GroupMessage[] {
  for (let at = history.length - 1; at >= 0; at -= 1) {
    const speaker = history[at]?.speaker;
    if (speaker?.kind === "member" && speaker.id === memberId) {
      return history.slice(at + 1);
    }
  }
  return history;
}

/** What a member is given at its turn: the group tag, what is new in the room, and the call to speak or pass. */
export function buildGroupTurnPrompt(args: { member: GroupMember; group: GroupDescription; peers: readonly GroupMember[]; newMessages: readonly GroupMessage[] }): string {
  const tag = formatGroupChatTag(args.group, args.peers);
  const news = args.newMessages.length === 0 ? "No new messages in the room since your last turn." : `New messages in the room (oldest first):\n${formatGroupHistory(args.newMessages, args.member.id)}`;
  const call = `It's your turn, ${args.member.name}. Reply in character with a single SendMessage if you have something worth adding, or send "(pass)" if you don't.`;
  return [tag, news, "", call].join("\n");
}
