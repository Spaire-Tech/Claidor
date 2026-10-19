import Foundation

/** Parts of the apps switched off for now, kept whole so one line brings each back. */
public enum Features {
  /**
   * Making a group chat (the founder, 19 October 2026: "hide create a group
   * for now. until we have a better flow for it ... i dont want to delete
   * it"). Off: the iPhone has no New Group Chat (its compose button opens
   * New Agent at once, and search has no such action), and the Mac's To:
   * line takes one agent. Groups already made still show and work.
   */
  public static let groupChats = false
}
