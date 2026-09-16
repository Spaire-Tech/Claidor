/**
 * Step two of onboarding: the hand-over from Yodo's scripted screen to
 * Yodo in the conversation.
 *
 * The founder's page of 16 September (`docs/product/onboarding-step-two-2026-09-16.md`
 * §5): step one ends on Get Started; step two is "chat with Yodo", and
 * Yodo speaks first — the bridge ("You said Founder. I'm not going to
 * hand you a blank team."), then the roster card. Nothing in the engine
 * speaks unprompted, so the app opens the conversation with one turn of
 * its own, marked hidden: it reaches Yodo and never becomes a bubble of
 * the person's. This is that turn.
 *
 * It carries the two facts step one produced, the person's name and
 * their work type, and the beats in the founder's words. Yodo's own
 * brief (`chiefOfStaff.ts`) already has the rules; this is the cue.
 */

/** The conversation's title, since the person did not type its first line. */
export const STEP_TWO_TITLE = 'Your starter team';

export interface StepTwoContext {
  /** As greeted in step one. */
  userName: string;
  /** One of the ten work types, or the person's own words. */
  workType: string;
  /** True when they typed their own words instead of picking one of the ten. */
  ownWords?: boolean;
}

/** The hidden opening turn. Not the person's; never shown. */
export function stepTwoKickoff(context: StepTwoContext): string {
  const name = context.userName.trim() || 'the person';
  const work = context.workType.trim();
  return [
    `[From the app, not from ${name}. Do not quote or mention this message.]`,
    '',
    `${name} has just finished the first step of onboarding and this is their first conversation with you. They have no agents yet.`,
    context.ownWords
      ? `Asked what they do, they typed in their own words: "${work}".`
      : `Asked what they do, they chose: ${work}.`,
    '',
    'Open with two short messages of your own, in your voice: that you are not going to hand them a blank team, and that you have twenty-three Caisra Agents already trained, desks that know their job, of which you will pick a few that fit and they can swap before you stand them up.',
    context.ownWords
      ? 'Then, since they used their own words, ask one clarifying line if you need it, and call propose_team with their work type and your own two or three picks.'
      : 'Then call propose_team with that work type and let the card do the asking.',
    'When the tool says who is in, say so in one short line each, then offer one first useful action for one of them as two options, and ask before connecting anything.',
  ].join('\n');
}
