import { describe, expect, test } from 'vitest';

import { managedBriefSectionsForTest } from './openclawConfigSync';
import { pruneUpstreamBrief, UPSTREAM_PHRASES_DROPPED, UPSTREAM_SECTIONS_DROPPED } from './upstreamBrief';

/**
 * The brief, checked for arguing with itself.
 *
 * **Why this exists.** 18 September, the founder, after the third live
 * fault in two days: *"thats tooo many rules that are wrong… this is
 * becoming a nasty pattern. audit this seriously."* The audit
 * (`docs/product/brief-audit.md`) found that the rules were not badly
 * written. They contradicted each other, four times, once per fault, and
 * every time the wrong rule was earlier in the file than the right one.
 * Two of them used the identical phrase — "a question with a handful of
 * likely answers" — to say opposite things, written two days apart in
 * two different files.
 *
 * **Why the rest of the suite could not catch it.** Every other test
 * about the brief asserts that a string is present:
 * `expect(section).toContain('One block per reply')`. A rule that flatly
 * contradicts another passes all of them. Four thousand tests, and not
 * one could fail for the reason the founder kept finding, which is why
 * the founder was the test.
 *
 * **What this does instead.** For each thing the agent has to decide, it
 * names the one section allowed to decide it, and a set of phrasings
 * that count as deciding. If a second section starts deciding the same
 * thing, this fails and names both. It fails on the class rather than on
 * one instance, which is the only kind of test that ends a pattern.
 *
 * Adding a rule that trips this is not a reason to weaken the axis. It
 * is a reason to put the rule in the section that owns the subject, or
 * to make it point at that section instead of restating it.
 */

/** The whole managed brief, as an agent reads it. */
const brief = (): string => managedBriefSectionsForTest().join('\n\n');

/** The brief split into (heading, body), so a rule can be blamed on a section. */
function sectionsOf(text: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  let heading = '(before any heading)';
  let body: string[] = [];
  for (const line of text.split('\n')) {
    if (/^#{1,6} /.test(line)) {
      out.push({ heading, body: body.join('\n') });
      heading = line.trim();
      body = [];
      continue;
    }
    body.push(line);
  }
  out.push({ heading, body: body.join('\n') });
  return out;
}

interface Axis {
  /** What the agent has to decide. */
  what: string;
  /** The one section allowed to decide it. */
  owner: RegExp;
  /** Phrasings that count as deciding it, wherever they appear. */
  deciders: RegExp[];
}

const AXES: readonly Axis[] = [
  {
    what: 'whether to ask the person, or assume and carry on',
    owner: /User Choices & Decisions/,
    deciders: [
      /\bdefault is to go ahead\b/i,
      /\bdo not ask at all\b/i,
      /\banswer first on your best assumption\b/i,
      /\bstop and ask only when\b/i,
      /a question with a handful of likely answers/i,
      /\bif you assumed, say so\b/i,
    ],
  },
  {
    // Renamed 18 September with the artifacts decision: the question is
    // no longer "card or prose" but "does this shaped answer become a
    // file the person can keep, or stay a message".
    what: 'whether a shaped answer is a document or a message',
    // `sectionsOf` splits on every heading, so a sub-heading of the
    // owning section reads as a section of its own. Name them, the way
    // `## Cards|## Rules in this app` did before the artifacts decision:
    // `### When to make one` is where this section states the rule, not
    // a second section arguing with it.
    owner: /## Documents You Make|### When to make one/,
    deciders: [
      /\bprose beats bullets\b/i,
      /\buse bullet lists\b/i,
      /\bis the normal way to answer\b/i,
      /\bmake the file\b/i,
      /\bthose are messages, not documents\b/i,
    ],
  },
  {
    // Added 18 September, after the founder's Paris itinerary: the agent
    // acknowledged their answer and ended the turn, and they had to type
    // "So?" to get the work they had already asked for twice. The rule
    // that covered it lived under the question *card*, which is a
    // different path from a typed answer. One section owns it now.
    what: 'whether an answer from the person continues the work in the same reply',
    owner: /### When they answer you, that is the work starting/,
    // Keyed to the decision, never to the heading's own words: a section
    // that points here quotes the heading, and a pointer is allowed.
    deciders: [
      /\bthe job is on\b/i,
      /\brepeating the job back is not doing it\b/i,
      /\bnever acknowledge and stop\b/i,
      /\bwhen the answer comes back, do the work\b/i,
      /\bis not the end of your turn\b/i,
    ],
  },
  {
    // Added 18 September with the agent-to-agent audit. Grok Bot puts
    // "never relay the user's unfiltered words" in the contract every
    // agent reads; ours had it in the Chief of Staff's brief only, where
    // it reached one agent out of however many the person has.
    what: 'what may be repeated to another agent',
    owner: /### When you are one of several/,
    deciders: [
      /\bwas said to you\b/i,
      /\brelay in your own words\b/i,
      /\bnot yours to read\b/i,
    ],
  },
  {
    // Re-homed 18 September with the artifacts decision. This axis was
    // owned by `## Artifacts` and `### Offer it before they ask`, and
    // both went with OpenUI — so nothing decided it and the axis failed
    // as undecided, which is the test working. The decision itself did
    // not go anywhere: making the person a document they did not ask for
    // is now expected, and `### When to make one` is where that is said.
    what: 'whether to do more than was asked',
    owner: /## Documents You Make|### When to make one/,
    // Keyed to the decision, not to the old wording. "Do the job they
    // asked for, not the one next to it" stays in the conversation
    // section and points here, and a pointer is allowed — so none of
    // these may match it.
    deciders: [
      /\bwhen they did not ask, but plainly want one\b/i,
      /\bdo not ask permission first\b/i,
      /\bis worth writing up\b/i,
      /\bdo not widen it\b/i,
      /write it up .* without being asked/i,
    ],
  },
  {
    // Added 18 September, out of the incident triage. `## Web Search`
    // was restating the escalation order — a URL means `web_fetch`,
    // discovery means `browser` — 1,200 characters after
    // `## Where To Look First` had decided it. Both sections were
    // already inside this test's input and it passed them anyway,
    // because being read is not the same as being checked. The
    // restatement is gone; this is what stops it coming back.
    what: 'where to look for a fact, and in what order',
    owner: /## Where To Look First/,
    deciders: [
      /\bwork down this list\b/i,
      /\bstop at the first that answers\b/i,
      // The exact phrasings that were removed from `## Web Search`.
      /if you (already )?have a specific URL/i,
      /if you need search discovery/i,
      /use `?browser`? (instead of|rather than) `?web_fetch`?/i,
    ],
  },
];

describe('the brief does not argue with itself', () => {
  const text = brief();
  const sections = sectionsOf(text);

  test.each(AXES.map(axis => [axis.what, axis] as const))(
    'only one section decides %s',
    (_what, axis) => {
      const deciding = sections.filter(section =>
        axis.deciders.some(one => one.test(section.body)));
      const strays = deciding.filter(section => !axis.owner.test(section.heading));
      expect(
        strays.map(one => one.heading),
        `these sections decide "${axis.what}" as well as the one that owns it. `
        + 'Move the rule into the owning section, or make it point there instead of restating it.',
      ).toEqual([]);
      // And the owner must actually say something, or the axis is undecided.
      expect(deciding.length, `nothing decides "${axis.what}"`).toBeGreaterThan(0);
    },
  );

  /**
   * The two phrases that were word-for-word opposites. Kept as their own
   * test because this exact pair is what the founder hit.
   */
  test('the phrase that was used twice to mean opposite things is used once', () => {
    const uses = sections.filter(one => /a question with a handful of likely answers/i.test(one.body));
    expect(uses.map(one => one.heading)).toEqual(['### User Choices & Decisions']);
  });
});

describe('the half of the brief that is not ours', () => {
  test('drops the upstream sections that work against this brief', () => {
    const upstream = [
      '## Session Startup',
      'Use runtime-provided startup context first.',
      '',
      '### 📝 Write It Down - No "Mental Notes"!',
      '- When you learn a lesson → update AGENTS.md, TOOLS.md, or the relevant skill',
      '',
      '## Tools',
      '**🎭 Voice Storytelling:** If you have `sag` (ElevenLabs TTS), use voice for stories.',
      '- **Discord/WhatsApp:** No markdown tables! Use bullet lists instead',
      '',
      '## Red Lines',
      '- `trash` > `rm`',
      '',
      '## Make It Yours',
      'Add your own conventions, style, and rules.',
      '',
      '## Related',
      '- [Default AGENTS.md](/reference/AGENTS.default)',
    ].join('\n');

    const pruned = pruneUpstreamBrief(upstream);
    for (const phrase of UPSTREAM_PHRASES_DROPPED) {
      expect(pruned, `"${phrase}" survived the prune`).not.toContain(phrase);
    }
    // What is upstream's and harmless stays; this is not a takeover.
    expect(pruned).toContain('## Session Startup');
    expect(pruned).toContain('## Red Lines');
    expect(pruned).toContain('`trash` > `rm`');
  });

  test('takes a section\'s children with it and leaves its siblings alone', () => {
    const pruned = pruneUpstreamBrief([
      '## Group Chats',
      'Think before you speak.',
      '### 💬 Know When to Speak!',
      '**Stay silent when:** the vibe is fine',
      '## Red Lines',
      '- Keep me',
    ].join('\n'));
    expect(pruned).not.toContain('Group Chats');
    expect(pruned).not.toContain('Stay silent when');
    expect(pruned).toContain('- Keep me');
  });

  test('leaves anything a person actually wrote', () => {
    const mine = ['## My own notes', '- Always call the Paris office before nine.'].join('\n');
    expect(pruneUpstreamBrief(mine)).toBe(mine);
  });

  test('every dropped section says why', () => {
    for (const { heading, because } of UPSTREAM_SECTIONS_DROPPED) {
      expect(heading.startsWith('#')).toBe(true);
      expect(because.length).toBeGreaterThan(20);
    }
  });
});
