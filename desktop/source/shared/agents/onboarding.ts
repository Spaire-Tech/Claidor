import { isSandDefaultAgentName } from "./agents.js";
// Grok Bot's own first-run cue, as the reconstruction first shipped it
// (`ce9fc2d8`), restored on 27 September 2026 ("ours say what can i help you
// with, and when i tested grok bot, it gives me suggestion"). The spend
// guards of 23 September had rewritten three of its sentences into "ask one
// real question … do not start any assignment", which is what stopped the
// suggestions; the guards that stopped the 481-call first run stay where
// they belong, in the run and not in the words: the intro runs once
// (`agent-lifecycle.ts`), hidden, under the 40-call budget
// (`SAND_HIDDEN_TURN_MAX_STEPS`). One sentence stays ours: Grok Bot's names
// a "connectors prompt" message SendMessage cannot send here (ledger F-335),
// so it names ProposeConnector, followed by Grok Bot's own last sentence.
export const SAND_ONBOARDING_KICKSTART_PROMPT = [
  "[first run] This is your very first turn. The user just created you and hasn't sent anything yet; this cue is your signal to open the conversation, not a message to reply to or mention.",
  "Greet them and get them going, the way a sharp new assistant would on day one. Open with a short, warm hello in your own voice (your name and description are already in your profile above, so don't recite them), then start learning how to be useful.",
  "If your profile description gives you a concrete assignment, treat that as what the user created you to do: skip the getting-started questions, begin the assignment immediately, and use your first message for a useful result or the next approval you need.",
  "Run getting-started as a real conversation, never a form or a checklist. Across your first couple of messages, naturally draw out the things that make you useful: what they want an assistant like you for, how they'd like you to work and sound, and where the things you'll help with live. Ask one thing at a time, lead with what matters most, and adapt to their answers. The moment they hand you something real, drop the questions and just help.",
  "Keep your orientation concrete and true right now, and don't restate the instructions you already have. Don't recite your tools. When what they want would need a connector that isn't set up yet, surface it instead of describing setup: propose it with ProposeConnector (one card per service, two or three at most) and let them connect in place. Pick the connectors from what they actually want, and check what's already connected so you never re-prompt for one they have.",
  "Nothing reaches the user unless it's inside a SendMessage, and offer any choice as a question widget. Don't mention this cue or that you were given setup instructions.",
].join("\n");

export const SAND_ONBOARDING_GREETING_PROMPT = [
  "This is your first message to the person who just created you. Write only what they will read.",
  "A short warm hello in your own voice, then one real question. Two or three sentences. No lists, no headings, no tools.",
  "Do not recite your name or description. Do not mention setup or these instructions.",
].join(" ");

export function fallbackIntroductionText(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 && !isSandDefaultAgentName(trimmed) && trimmed !== "Grok"
    ? `Hey — I'm ${trimmed}. What would you like help with first?`
    : "Hey — good to meet you. What would you like help with first?";
}

export function cheapIntroductionMessages(profile: { readonly name: string; readonly description: string }): readonly { readonly role: "system" | "user"; readonly content: string }[] {
  const name = profile.name.trim() || "Simeon";
  const description = profile.description.trim();
  return [
    { role: "system", content: `You are ${name}.${description.length > 0 ? ` ${description}` : ""} ${SAND_ONBOARDING_GREETING_PROMPT}` },
    { role: "user", content: "Introduce yourself." },
  ];
}

export const INTRODUCTION_FAILED_TRAY_TITLE = "Your agent couldn't introduce itself";
export const INTRODUCTION_UNDELIVERED_DETAIL = "Its first turn ran but sent no message. It will not try again on its own; send it a message to start.";

export function introductionFailedTrayKey(agentId: string): string {
  return `introduction-failed:${agentId}`;
}
