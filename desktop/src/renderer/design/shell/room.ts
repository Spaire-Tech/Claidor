import type { ThreadItem } from '../thread/types';
import { ThreadItemKind } from '../thread/types';

/**
 * Several agents' replies, as one conversation.
 *
 * Each member has its own session, so this is a merge rather than a
 * render: every bubble here is a real message from a real session, and
 * opening that agent on its own shows the same words. Nothing in a room
 * is generated for the room.
 *
 * The interesting decisions are all about what a person sees when four
 * agents answer at once.
 */

export interface RoomMemberThread {
  agentId: string;
  agentName: string;
  items: readonly ThreadItem[];
}

/**
 * How many of an agent's bubbles a single answer may occupy.
 *
 * `grok-bot-chat.md` §12: *"at most ~3 messages per turn"*. In a
 * one-to-one thread three short bubbles read like somebody texting. In a
 * room with four members it is twelve bubbles for one question, and the
 * texture that made the app feel human is what makes it unreadable.
 *
 * Two, and the rest stays reachable rather than being dropped — see
 * below.
 */
export const ROOM_BUBBLES_PER_AGENT = 2;

/**
 * The person's own messages, kept once.
 *
 * They were sent to every member, so every member's session has a copy.
 * Showing four identical bubbles of what somebody just typed is the most
 * obviously wrong thing this screen could do.
 */
function isPerson(item: ThreadItem): boolean {
  return item.kind === ThreadItemKind.Text && item.from === 'person';
}

/**
 * How far apart two copies of the same typed message can land.
 *
 * The fan-out writes to each member's session in turn, so the same
 * message carries a slightly different timestamp in each. Ten seconds is
 * far more than that gap and far less than the time it takes somebody to
 * type the same thing twice on purpose.
 */
const SAME_MESSAGE_WINDOW_MS = 10_000;

/**
 * Whether this copy of a person's message has already been shown.
 *
 * Matched on text within a window, not on a rounded timestamp. The first
 * version of this bucketed by second, which quietly failed whenever two
 * copies straddled a rounding boundary — 1.4s and 1.6s became different
 * messages and the person saw their own sentence twice. Ids are no use
 * here either: each session gives its copy a different one, so nothing
 * would ever match.
 */
function alreadyShown(
  item: Extract<ThreadItem, { kind: 'text' }>,
  shown: { text: string; at: number }[],
): boolean {
  return shown.some(
    one => one.text === item.text && Math.abs(one.at - item.at) <= SAME_MESSAGE_WINDOW_MS,
  );
}

/**
 * Trim one member's run of consecutive bubbles.
 *
 * Not a hard cut. The overflow is folded into the last kept bubble's
 * `details`, so a long answer collapses instead of disappearing — the
 * same disclosure the thread already uses for bulk. Losing the end of
 * somebody's answer to a layout rule would be the app quietly eating
 * content, which is the fault this whole design keeps coming back to.
 */
function foldRun(run: Extract<ThreadItem, { kind: 'text' }>[]): ThreadItem[] {
  if (run.length <= ROOM_BUBBLES_PER_AGENT) return run;

  const kept = run.slice(0, ROOM_BUBBLES_PER_AGENT);
  const rest = run.slice(ROOM_BUBBLES_PER_AGENT);
  const last = kept[kept.length - 1];
  const folded = rest.map(one => one.text).join('\n\n');

  return [
    ...kept.slice(0, -1),
    {
      ...last,
      details: last.details ? `${last.details}\n\n${folded}` : folded,
    },
  ];
}

/**
 * One thread from several.
 *
 * Ordered by time, the person's message kept once, and each agent's
 * consecutive run trimmed with the remainder folded away. Cards —
 * approvals, questions, password prompts — are dropped: they belong to
 * one agent's session and answering one in a room would silently be
 * answering it on behalf of a conversation the person did not open.
 * `grok-bot-chat.md` §11.5 says the same thing from the other end.
 */
export function mergeRoomThread(members: readonly RoomMemberThread[]): ThreadItem[] {
  const merged: ThreadItem[] = [];
  const shownPerson: { text: string; at: number }[] = [];

  for (const member of members) {
    const run: Extract<ThreadItem, { kind: 'text' }>[] = [];
    const flush = (): void => {
      if (run.length) merged.push(...foldRun([...run]));
      run.length = 0;
    };

    for (const item of member.items) {
      if (isPerson(item)) {
        flush();
        const text = item as Extract<ThreadItem, { kind: 'text' }>;
        if (alreadyShown(text, shownPerson)) continue;
        shownPerson.push({ text: text.text, at: text.at });
        merged.push(text);
        continue;
      }

      // A room shows what was said, not what one agent is being asked to
      // approve. Those stay in that agent's own conversation.
      if (item.kind === ThreadItemKind.Auth
        || item.kind === ThreadItemKind.Choice
        || item.kind === ThreadItemKind.Secret) {
        continue;
      }

      if (item.kind === ThreadItemKind.Text) {
        run.push({
          ...item,
          // Every bubble in a room carries its sender, whatever the
          // member session thought. Without this the room is four
          // anonymous voices.
          agentId: member.agentId,
          agentName: member.agentName,
        });
        continue;
      }

      flush();
      merged.push(item);
    }
    flush();
  }

  return merged.sort((a, b) => a.at - b.at);
}

/**
 * Who is still working.
 *
 * A room is done when every member is. Saying "typing" while three of
 * four have answered is true and useless; the person is waiting for the
 * room, not for an agent.
 */
export function roomTyping(running: readonly boolean[]): boolean {
  return running.some(Boolean);
}
