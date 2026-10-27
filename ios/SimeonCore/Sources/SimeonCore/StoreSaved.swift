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
    listFromServer = false
    agents = sortRoster(roster.agents)
  }

  /**
   * The pins and folders kept with the list, shown with it until the
   * computer's come (`loadPins`, `loadSections`): without them every chat
   * showed in one list for seconds at each launch, longer while the computer
   * slept. Another account's are never shown.
   */
  func showSavedLayout() {
    guard let saved, let layout = saved.readLayout() else { return }
    if let owner = SavedChats.Owner(account), !owner.isSame(as: layout.owner) { return }
    if pinnedIds.isEmpty && !layout.pinnedIds.isEmpty {
      pinnedIds = layout.pinnedIds
      pinsKept = true
    }
    if sidebarSections == nil, let sections = layout.sections {
      sidebarSections = sections
      sectionsKept = true
    }
  }

  func layoutChanged() {
    layoutToSave = true
    saveSoon()
  }

  /**
   * The server's copy of the list (`GET /desktop/api/chats/agents`), shown
   * when it comes before the computer answers: newer than this device's,
   * and there on a device that kept none. The computer's list replaces it.
   */
  func showServerList(from asked: AgentBackend) async {
    guard let answer = try? await asked.server("chats/agents", method: nil, body: nil) else { return }
    guard asked === backend, !hasReachedBox else { return }
    let list = (answer["agents"]?.array ?? []).compactMap(Agent.init(json:))
    guard !list.isEmpty else { return }
    showingSaved = true
    listFromServer = true
    agents = sortRoster(list)
    onListShown?()
  }

  /**
   * A chat's lines from the server's copy (`GET /desktop/api/chats/lines`),
   * shown while the chat has only kept lines or none (the computer away):
   * replaced by the computer's when it answers, as kept lines are.
   */
  func showServerLines(_ agentId: String) async {
    guard readsServerCopy, let asked = backend, !serverLinesAsked.contains(agentId), Self.showsKeptOrNothing(self, agentId) else { return }
    serverLinesAsked.insert(agentId)
    defer { serverLinesAsked.remove(agentId) }
    guard let answer = try? await asked.server("chats/lines?agentId=\(Self.queryValue(agentId))&limit=\(SavedChats.linesKept)", method: nil, body: nil) else { return }
    guard asked === backend, Self.showsKeptOrNothing(self, agentId) else { return }
    let entries = (answer["entries"]?.array ?? []).compactMap(Entry.init)
    guard !entries.isEmpty else { return }
    let kept = savedLines[agentId] ?? []
    let lines = Self.merge(entries, live: (transcripts[agentId] ?? []).filter { !kept.contains($0.id) })
    savedLines[agentId] = Set(lines.map(\.id))
    if answer["hasOlder"]?.bool == true { savedOlder.insert(agentId) } else { savedOlder.remove(agentId) }
    loadFailed.remove(agentId)
    setTranscript(agentId, lines)
  }

  /** The chat shows only kept lines, or nothing yet (or "Couldn't load"): the computer's copy has not come. */
  static func showsKeptOrNothing(_ store: AppStore, _ agentId: String) -> Bool {
    store.savedLines[agentId] != nil || (store.transcripts[agentId]?.isEmpty ?? true)
  }

  /** An id as a query's value: letters, digits and `-._~` as they are, the rest escaped. */
  static func queryValue(_ text: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? text
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
    // Only once the computer has said: a copy shown from this device is not kept again as if it were its.
    if layoutToSave && !pinsKept && !sectionsKept {
      saved.writeLayout(pinnedIds: pinnedIds, sections: sidebarSections, owner: owner)
      layoutToSave = false
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
    layoutToSave = false
    pinsKept = false
    sectionsKept = false
    showingSaved = false
    listFromServer = false
    savedLines = [:]
    savedOlder = []
    serverLinesAsked = []
    onListShown = nil
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
    let otherList = saved.readRoster().map { !owner.isSame(as: $0.owner) } ?? false
    let otherLayout = saved.readLayout().map { !owner.isSame(as: $0.owner) } ?? false
    if otherList || otherLayout {
      saved.forget()
      for agentId in savedLines.keys { transcripts[agentId] = nil; chatRows[agentId] = nil }
      savedLines = [:]
      savedOlder = []
      // The server's copy is this account's own: it stays.
      if showingSaved && !listFromServer {
        showingSaved = false
        agents = []
      }
      if pinsKept { pinnedIds = []; pinsKept = false }
      if sectionsKept { sidebarSections = nil; sectionsKept = false }
    }
    if rosterToSave || layoutToSave || !chatsToSave.isEmpty { saveSoon() }
  }
}
