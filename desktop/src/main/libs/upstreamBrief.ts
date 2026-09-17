/**
 * The half of the brief that is not ours, made safe.
 *
 * **What this is.** Every agent's `AGENTS.md` has two halves. Below
 * `<!-- Caisra managed: do not edit below this line -->` is ours,
 * regenerated on every sync. Above it is whatever was there first, which
 * on a fresh workspace is OpenClaw's own template
 * (`docs/reference/templates/AGENTS.md` in the runtime) and afterwards
 * is anything the person — or the agent itself — has added.
 *
 * **Why it needed auditing.** 18 September, the founder: *"everything is
 * a new rule wrong. this is becoming a nasty pattern."* Three days of
 * tuning the managed half had never once looked at the other 5,400
 * characters, which every agent reads first. They contain instructions
 * that work directly against ours (`docs/product/brief-audit.md` §0):
 *
 * - *"No markdown tables! Use bullet lists instead"* — in a brief whose
 *   whole purpose this week was to stop bullet lists.
 * - *"If you have `sag` (ElevenLabs TTS), use voice for stories…
 *   Surprise people with funny voices"* — a tool this app does not ship.
 * - *"When you learn a lesson → update AGENTS.md"* — the agent editing
 *   its own brief. It can only write above the marker, the half nothing
 *   reads, so the rules on a person's machine could drift from the rules
 *   we generate and nobody would know.
 * - A link to a second upstream instruction file, and an invitation to
 *   *"add your own conventions, style, and rules"*.
 *
 * This is the same family as `## Deliverable File Links`, the inherited
 * section that turned every report into a `.docx` for two days.
 *
 * **What it does, and does not do.** It removes named sections, by
 * heading, and nothing else. Anything a person genuinely wrote stays.
 * Sections that are upstream's and harmless — the startup rules, the
 * memory files, the red lines, what may leave the machine — stay too:
 * the point is to remove what contradicts us, not to take the half over.
 */

/**
 * Headings dropped from the unmanaged half, and why each one goes.
 * Matched on the heading line, so the section and its body go together.
 */
export const UPSTREAM_SECTIONS_DROPPED: readonly { heading: string; because: string }[] = [
  { heading: '### 📝 Write It Down - No "Mental Notes"!', because: 'tells the agent to edit AGENTS.md, in the half nothing reads' },
  { heading: '## Tools', because: 'prefers bullet lists, and offers a text-to-speech tool this app does not ship' },
  { heading: '## Group Chats', because: 'our own rules for a room with several agents in it say otherwise' },
  { heading: '### 💬 Know When to Speak!', because: 'same, and its silence rules fight answer-before-you-work' },
  { heading: '### 😊 React Like a Human!', because: 'reactions are `ReactToMessage` here, with different rules' },
  { heading: '## Make It Yours', because: 'invites the agent to add rules of its own' },
  { heading: '## Related', because: 'points at a second upstream instruction file' },
];

/** Phrases that must not survive. The test asserts each one is gone. */
export const UPSTREAM_PHRASES_DROPPED: readonly string[] = [
  'Use bullet lists instead',
  'Voice Storytelling',
  'update AGENTS.md',
  'Default AGENTS.md',
  'Add your own conventions',
  'Stay silent when',
];

const HEADING = /^#{1,6} /;

/**
 * The unmanaged half with those sections removed. A section runs from
 * its heading to the next heading of the same or higher level, so a
 * parent takes its children with it and a sibling is left alone.
 */
export function pruneUpstreamBrief(content: string): string {
  const dropped = new Set(UPSTREAM_SECTIONS_DROPPED.map(one => one.heading));
  const lines = content.split('\n');
  const kept: string[] = [];
  let skippingAtDepth = 0;

  for (const line of lines) {
    if (HEADING.test(line)) {
      const depth = line.match(/^#+/)?.[0].length ?? 0;
      if (skippingAtDepth && depth <= skippingAtDepth) skippingAtDepth = 0;
      if (dropped.has(line.trim())) {
        skippingAtDepth = depth;
        continue;
      }
    }
    if (!skippingAtDepth) kept.push(line);
  }

  // Collapse the blank runs a removed section leaves behind.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
