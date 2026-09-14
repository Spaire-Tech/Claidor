/**
 * A short answer in the thread, and the bulk of it one click away.
 *
 * `grok-bot-chat.md` §11.4: *thread only secondary bulk — long digests
 * under a TLDR, noisy progress under a root — and never hide the primary
 * answer or a required question in a thread.*
 *
 * **Why ours is not their `reply_to`.** Grok Bot's agent sends message
 * envelopes and can point one at another by id. Ours writes text; there
 * is no envelope to carry a field, and inventing one would mean a
 * protocol the model has to remember between turns. So the same thing is
 * expressed in the text itself, with a fence:
 *
 *     Sixteen invoices came in overnight, all under £500 except two.
 *
 *     ```details
 *     INV-1201  Acme        £412.00
 *     INV-1202  Bartok Ltd  £3,980.00
 *     …
 *     ```
 *
 * The prose is the answer and stays in the conversation. The fence
 * collapses under it. A model writes a fenced block correctly far more
 * reliably than it remembers an id from three turns ago, which is the
 * whole reason for choosing this shape.
 *
 * Everything here is one decision — where the answer stops and the bulk
 * begins — kept pure so it can be tested without rendering anything.
 */

/** The fence the agent opens. `details` or `detail`, either is accepted. */
const DETAILS_FENCE = /^[ \t]*```[ \t]*details?[ \t]*$/im;
const CLOSING_FENCE = /^[ \t]*```[ \t]*$/m;

export interface SplitReply {
  /** What stays in the conversation. Never empty when the reply was not. */
  summary: string;
  /** The bulk, collapsed. Absent when there was none. */
  details?: string;
}

/**
 * Split a reply into what it says and what it is backing that up with.
 *
 * Two rules protect the person from a badly-formed reply:
 *
 *  - **A fence with nothing before it is not a thread.** If the agent
 *    opens `details` as the first thing it says, the answer *is* the
 *    detail, and collapsing it would hide the whole reply behind a
 *    disclosure. It comes back whole.
 *  - **An unclosed fence is not a thread either.** A reply cut off
 *    mid-stream would otherwise vanish into a collapsed block that says
 *    nothing about what is in it.
 */
export function splitReply(content: string): SplitReply {
  const opening = DETAILS_FENCE.exec(content);
  if (!opening) return { summary: content };

  const openStart = opening.index;
  const afterOpen = openStart + opening[0].length;

  const rest = content.slice(afterOpen);
  const closing = CLOSING_FENCE.exec(rest);
  if (!closing) return { summary: content };

  const summary = content.slice(0, openStart).trim();
  // The agent led with the fence. There is no summary to keep, so there
  // is nothing to collapse behind.
  if (!summary) return { summary: content };

  const details = rest.slice(0, closing.index).replace(/^\n+|\n+$/g, '');
  if (!details.trim()) return { summary };

  const after = rest.slice(closing.index + closing[0].length).trim();

  return {
    // Anything the agent wrote after closing the fence belongs with the
    // answer, not with the bulk. Dropping it would lose a sentence.
    summary: after ? `${summary}\n\n${after}` : summary,
    details,
  };
}

/**
 * How the collapsed block describes itself.
 *
 * "Show more" says nothing about what is behind it, which makes it a
 * gamble rather than a choice. A line count is the cheapest honest thing
 * we can say without reading the content.
 */
export function detailsLabel(details: string): string {
  const lines = details.split('\n').filter(line => line.trim()).length;
  return lines === 1 ? 'Show the detail' : `Show ${lines} more lines`;
}
