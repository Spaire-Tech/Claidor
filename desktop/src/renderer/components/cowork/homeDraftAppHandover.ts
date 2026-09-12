/**
 * Carrying the chosen app from the home screen into the conversation it starts.
 *
 * Drafts are keyed by session id, and the home screen has no session, so it
 * uses a stand-in key. For the prompt text and the attachments that is fine —
 * they are consumed by the send and never wanted again. The chosen app is not
 * like that. It is a standing choice about what the conversation is about, and
 * the key changes underneath it at the exact moment the first message creates
 * the session. The choice was left behind under the home key, so the chip
 * disappeared after the first message and every message after it carried no
 * app at all.
 *
 * The handover happens once, on the one transition from no session to a
 * session, inside the composer that was sitting on the home screen. A
 * conversation opened later must never inherit a choice made on the home
 * screen, and a conversation that already has its own choice must never have
 * it overwritten.
 */

export interface HomeDraftAppHandoverInput {
  /**
   * The session the composer was keyed to a moment ago. Empty or absent while
   * it sits on the home screen, which is the only state a handover starts in.
   */
  previousSessionId?: string;
  /** The session it is keyed to now; absent while still on the home screen. */
  nextSessionId?: string;
  /** The app chosen on the home screen, if any. */
  homeAppSlug?: string;
  /** The app the destination session already has, if any. */
  existingAppSlug?: string;
}

/**
 * The app slug to adopt into the new session, or null when nothing should
 * move. Null is the answer for every case except the single handover.
 */
export const resolveHomeDraftAppHandover = (
  input: HomeDraftAppHandoverInput,
): string | null => {
  // Already in a conversation: switching between two of them, or reopening
  // one. Nothing to hand over.
  if (input.previousSessionId) return null;
  // Still on home, or left home without arriving anywhere.
  if (!input.nextSessionId) return null;
  // Nothing was chosen.
  if (!input.homeAppSlug) return null;
  // The destination already has its own choice; it wins.
  if (input.existingAppSlug) return null;
  return input.homeAppSlug;
};
