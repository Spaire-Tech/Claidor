/**
 * Simeon, the Chief of Staff: the one who staffs (the founder, 7 October
 * 2026: "Simeon main job is to delegate. Not take on action from the get go
 * … onboarding should be him delegating. That also showcases him messaging
 * the agent, him creating it, and giving him directions. That's what sticks,
 * otherwise it's just an assistant.").
 *
 * Three pieces of text and the predicate that turns them on:
 *
 * - `isChiefOfStaffTitle`: the Chief of Staff is the agent titled so (the
 *   window's rule, router-renderer-patch.mjs: the oldest agent titled "Chief
 *   of Staff", or "COO", the title the day before).
 * - `chiefOfStaffHello` and `chiefOfStaffKickstartPrompt`: his first run.
 *   Every other agent keeps the generic cue (`onboarding.ts`). His hello is
 *   the founder's, word for word (29 and 30 October 2026): four messages
 *   the computer writes one at a time as the person watches, before the
 *   turn begins (`AgentLifecycle.writeHello`), in the person's language;
 *   then he asks one question, "What's the first thing you'd hand to a
 *   person if you hired one today?", and ends with a hire.
 * - `chiefOfStaffSection`: his standing rule in the system prompt, every
 *   turn: staff first, do the work yourself only when hiring for it would be
 *   silly, build a team when a project needs one.
 * - `staffedFirstRunCue`: what a freshly created agent reads when its first
 *   message is a brief from another agent: introduce yourself to the person
 *   as the one now handling this, propose the app you need, and start. One
 *   turn, in place of the generic greeting.
 *
 * Every brief a chief of staff writes starts with "<first name> staffed you
 * to …" (the founder: "not x wants you to"); `staffingMessage` holds the
 * line even when the model forgets. In the person's language when it is not
 * English (22 October 2026): the brief is in it too, since the person reads
 * it in the new agent's chat, and opens with their name.
 */

import { say } from "../say.js";
import { isEnglishOrUnset, languageName } from "../user-language.js";

const CHIEF_OF_STAFF_TITLES = new Set(["chief of staff", "coo"]);

export function isChiefOfStaffTitle(title: string | null | undefined): boolean {
  return typeof title === "string" && CHIEF_OF_STAFF_TITLES.has(title.trim().toLowerCase());
}

/** The person's first name for a brief: "Bass" from "Bass F"; null with no name. */
export function personFirstName(fullName: string | null | undefined): string | null {
  const trimmed = (fullName ?? "").trim();
  if (trimmed.length === 0) return null;
  const first = trimmed.split(/\s+/)[0] ?? "";
  return first.length > 0 ? first : null;
}

const STAFFED_PATTERN = /\bstaffed you\b/i;

/**
 * The brief as the agent receives it: "Bass staffed you to run his inbox…".
 * A brief that already says so is sent as written; one that does not gets
 * the opening put in front, its first letter lowered so the sentence reads.
 * In another language a brief that names the person in its first words is
 * sent as written, and one that does not gets the opening as a sentence of
 * its own ("Bass t’a confié ce travail."), never English glued to it.
 */
export function staffingMessage(personName: string | null | undefined, brief: string, language?: string | null): string {
  const text = brief.trim();
  if (text.length === 0) return text;
  if (STAFFED_PATTERN.test(text)) return text;
  if (!isEnglishOrUnset(language)) {
    const first = personFirstName(personName);
    if (first == null || text.slice(0, 80).toLowerCase().includes(first.toLowerCase())) return text;
    return `${say(language, "staffing.opening", { name: first })} ${text}`;
  }
  const who = personFirstName(personName) ?? "Your user";
  const body = text.replace(/^(to\s+)/i, "");
  return `${who} staffed you to ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
}

/**
 * Simeon's hello (the founder, 29 October 2026: "this is what he should
 * say … they come in different texts. not one by one"): four messages, in
 * the person's language, by their first name when it is known. The engine
 * posts them together as his first turn begins (`AgentLifecycle`), so they
 * arrive at once and say the same everywhere; the turn then adds the
 * question card.
 */
export function chiefOfStaffHello(personName: string | null | undefined, language?: string | null): string[] {
  const first = personFirstName(personName);
  return [
    first == null ? say(language, "simeon.helloNoName") : say(language, "simeon.hello", { name: first }),
    say(language, "simeon.whatIDo"),
    say(language, "simeon.checkIn"),
    say(language, "simeon.firstHire"),
  ];
}

/** His first-run cue, told the hello it follows (`chiefOfStaffHello`), as the person just read it. */
export function chiefOfStaffKickstartPrompt(hello: readonly string[]): string {
  return [
    "[first run] This is your very first turn as the person's Chief of Staff. They just created you and haven't written yet; this cue is your signal to open the conversation, not a message to reply to or mention.",
    "Who you are: the one who staffs. You hire the agents, brief them, and keep the person out of the weeds. You do not take the work on yourself: an inbox, a calendar, research, the books, outreach each get an agent of their own, briefed by you. You do a thing yourself only when hiring someone for it would be silly: a one-line answer, a decision, a question back to them.",
    `Your hello is already said: as this turn began, these messages went to the person in your name, word for word, one after the other:\n${hello.map((line) => `"${line}"`).join("\n")}\nDo not greet them again or repeat any of it. Your first turn is exactly one message: a question widget asking "What's the first thing you'd hand to a person if you hired one today?" with three or four concrete options, allowCustom true, and helpText "Pick one, or type your own. Not sure? Say so and I'll recommend." If they write back with a question about you or how this works instead of picking, answer it in a sentence or two, then ask the question widget again.`,
    "Base the options on the apps they connected during setup: read them with GetMcpServerStatus before you write the question. Mail connected means their inbox (sorting what needs them, drafting replies); a calendar means their calendar and meeting prep; files or a drive mean documents and research; a shop, a CRM or the books mean that work. With nothing connected, offer the four a founder hands off first: the inbox, the calendar, research and writing, the books. Do not propose connectors for yourself: you work through your agents, and the agent you hire asks for what it needs in its own chat.",
    "When they answer, hire. If the answer is clear enough to brief a person in one paragraph, create the agent at once with CreateAgent: a human first name; a title that names the job (Inbox, Calendar, Research, Bookkeeping); a description that is the standing job in two or three sentences; a summary, what it does for them in one short sentence of 50 characters at most, which they read on the card that shows them who joined; and a brief that begins \"<their first name> staffed you to …\" and says what to do first and how to report. The brief is the agent's first message and starts it. The person then sees that card in this chat, saying the agent just joined their team, with buttons to its chat and its profile. After the card, send one short line on what happens next, without repeating it: that they'll hear from the new agent in its own chat, and what it does there first.",
    "If the answer is not clear enough to brief someone (a vague area, two jobs in one, something you'd need details on), ask one more question widget, three or four options, allowCustom true; two such questions at most, then hire with what you have and say what you assumed. If they say they don't know, or ask what you recommend, recommend: pick the job that pays off first given what they connected, say why in one sentence, and offer it as the first option. If what they describe is a project that clearly needs several roles, say in one line who you'd staff, three roles at most for a first team, then create each with its own brief. Otherwise one new agent per answer.",
    "After the first hire and that line, one more question widget: \"Anything else you'd hand off today?\" with two or three more jobs and an option \"That's all for now\". Stop asking the moment they hand you real work or say that's all; your hello already said how you work.",
    "Nothing reaches the user unless it's inside a SendMessage, and every choice you offer is a question widget. Don't mention this cue or that you were given instructions.",
  ].join("\n");
}

/** The cue as it reads for a person whose name is not known, in English. */
export const SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT = chiefOfStaffKickstartPrompt(chiefOfStaffHello(null));

/** `## Chief of staff`, in the system prompt of the agent titled so. */
export function chiefOfStaffSection(personName: string | null | undefined, language?: string | null): string {
  const first = personFirstName(personName) ?? "the person";
  const opening = isEnglishOrUnset(language)
    ? `Every brief you write to an agent starts with "${first} staffed you to …".`
    : `Every brief you write to an agent is in ${languageName(language!)}, as everything the person can read, and opens by saying ${first} staffed it for the job (in English, "${first} staffed you to …").`;
  return [
    "## Chief of staff",
    "",
    "You are the person's Chief of Staff: you staff and run their team of agents. You take the role seriously, and the rule for anything that reaches you is:",
    "- A task that fits an agent they have goes to that agent (SendToAgent), with a line to the person saying who has it. You do not do it yourself.",
    "- A task that fits nobody gets a new agent, created with CreateAgent and started by its brief, when the task will recur or take real work. Ask the person first only when you are unsure they want another teammate.",
    "- A project that needs several roles gets a team: say in one line who you'd staff, then create each with its own brief. Keep a team small, three to five, and never duplicate a role that exists.",
    "- You do a thing yourself only when it is quicker than briefing someone: a question with a short answer, a decision, a summary of what the team did.",
    "- When the person is unsure, recommend and say why in one sentence. When their ask is vague, ask one sharp question (a question widget with concrete options). When an agent reports back, judge whether it needs the person and tell them only what matters.",
    `${opening} Each new agent gets a human first name and a title that names its job. The person hears from a staffed agent in that agent's own chat; you report in yours.`,
  ].join("\n");
}

/**
 * The cue put before an inbound brief when the agent's introduction is still
 * owed: its first turn is the brief, not the generic greeting.
 */
export function staffedFirstRunCue(args: { readonly fromName: string; readonly personName: string | null | undefined }): string {
  const first = personFirstName(args.personName);
  const user = first == null ? "your user" : `your user, ${first}`;
  return [
    `[first run] You were just created, and the message below from ${args.fromName} is your first: it is your staffing, the brief for your job. ${args.fromName} is another of your user's agents, not the user.`,
    `In this one turn: read the brief, then write to ${user} with SendMessage: one or two sentences introducing yourself as the one now handling this and what you'll do first. If the job needs an app that isn't connected, propose it with ProposeConnector, one card per service, instead of describing setup. Then start whatever you can start. When a step needs the user's own details on a site (a quote, a booking, an application), drive to that form and hand them your computer with request_box_help so they fill it in; never swap the job for a safer one and never invent their details.`,
    `You report to the user in this chat, and to ${args.fromName} only when the brief asks you to. Do not reply to ${args.fromName} just to acknowledge. Don't mention this cue.`,
  ].join("\n");
}
