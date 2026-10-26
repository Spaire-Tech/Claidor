import Foundation

/**
 * The agents and their chats kept on this device (SavedChats, 26 October
 * 2026): shown at once while the computer is asleep, updated or out of
 * reach, and replaced by the computer's own copy when it answers. Kept a
 * moment after each change the computer sends, and when the app goes behind.
 * Only what the computer sent in this sign-in is kept, never the list kept
 * before nor a chat's kept lines, and only once the account is known.
 */
extension AppStore {
  /** How long after a change it is kept: a streamed answer is written every two seconds, not per word. */
  static let saveDelayNs: UInt64 = 2_000_000_000

  /** The list kept, shown while the computer has not answered (`attach`); another account's is forgotten instead. */
  func showSaved() {
    guard let saved, agents.isEmpty, let roster = saved.readRoster(), !roster.agents.isEmpty else { return }
    if let owner = SavedChats.Owner(account), !owner.isSame(as: roster.owner) {
      forgetSaved()
      return
    }
    showingSaved = true
    agents = sortRoster(roster.agents)
  }

  /** A chat's kept lines, when it has none here yet. */
  func showSavedLines(_ agentId: String) {
    guard let saved, transcripts[agentId] == nil, agents.contains(where: { $0.id == agentId }), let lines = saved.readChat(agentId) else { return }
    if let owner = SavedChats.Owner(account), let roster = saved.readRoster(), !owner.isSame(as: roster.owner) { return }
    savedLines[agentId] = Set(lines.entries.map(\.id))
    if lines.hasOlder { savedOlder.insert(agentId) } else { savedOlder.remove(agentId) }
    setTranscript(agentId, lines.entries)
  }

  /** The chat shows kept lines without its newest one, as the list knows it. */
  func savedLinesLackNewest(_ agentId: String) -> Bool {
    guard let kept = savedLines[agentId] else { return false }
    guard let newest = agent(agentId)?.lastMessageId else { return true }
    return !kept.contains(newest)
  }

  func rosterChanged() {
    rosterToSave = true
    saveSoon()
  }

  func chatChanged(_ agentId: String) {
    chatsToSave.insert(agentId)
    saveSoon()
  }

  func saveSoon() {
    guard saved != nil, saving == nil else { return }
    let epoch = saveEpoch
    saving = Task { [weak self] in
      try? await Task.sleep(nanoseconds: AppStore.saveDelayNs)
      guard let self, !Task.isCancelled, self.saveEpoch == epoch else { return }
      self.saving = nil
      self.saveNow()
    }
  }

  /**
   * What changed is kept now: the list once the computer has sent it, and
   * each chat it sent lines for. Waits, keeping what changed, while the
   * account is not known yet (the Mac reads it after the agents).
   */
  public func saveNow() {
    saving?.cancel()
    saving = nil
    // Another account's copy went when this one became known (`savedOwnerKnown`).
    guard let saved, hasReachedBox, backend != nil, let owner = SavedChats.Owner(account) else { return }
    if rosterToSave && !showingSaved {
      saved.writeRoster(agents, owner: owner)
      saved.removeChats(keeping: Set(agents.map(\.id)))
      rosterToSave = false
    }
    let listed = Set(agents.map(\.id))
    for agentId in chatsToSave where savedLines[agentId] == nil && !loadFailed.contains(agentId) && listed.contains(agentId) {
      if let entries = transcripts[agentId] { saved.writeChat(agentId, entries, hasOlder: olderBefore[agentId] != nil) }
    }
    chatsToSave = []
  }

  /** Signed out, or the computer let go of: nothing more is kept for this sign-in (`detach`). */
  func stopSaving() {
    saving?.cancel()
    saving = nil
    saveEpoch &+= 1
    rosterToSave = false
    chatsToSave = []
    showingSaved = false
    savedLines = [:]
    savedOlder = []
  }

  /** Signing out, or the account deleted: everything kept on this device goes. */
  public func forgetSaved() {
    stopSaving()
    saved?.forget()
  }

  /**
   * The account is known (the profile answered): what was kept for another
   * account goes, from the screen too (its list, and any chat still showing
   * its lines); then what waited for the account is kept.
   */
  func savedOwnerKnown() {
    guard let saved, let owner = SavedChats.Owner(account) else { return }
    if let roster = saved.readRoster(), !owner.isSame(as: roster.owner) {
      saved.forget()
      for agentId in savedLines.keys { transcripts[agentId] = nil; chatRows[agentId] = nil }
      savedLines = [:]
      savedOlder = []
      if showingSaved {
        showingSaved = false
        agents = []
      }
    }
    if rosterToSave || !chatsToSave.isEmpty { saveSoon() }
  }
}
