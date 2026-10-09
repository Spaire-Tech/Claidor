import Foundation

/**
 * The rebuild, the stream and the disk as the store sees them: what the
 * driver is told (the selected agent, its computer, the agents at work,
 * the stream), the agents' list read again once a rebuild ends, and Disk
 * Saver (`H$n` wiring, `GOn`, `z8n`, `$8n`).
 */
extension AppStore {
  /** The selected agent, when it is one agent and not a group (`boxId`). */
  var rebuildBox: String? { openChat.flatMap { id in agent(id).map { $0.isGroup ? nil : id } ?? id } }

  var rebuildInputs: RebuildDriver.Inputs {
    let box = rebuildBox
    return RebuildDriver.Inputs(boxId: box, isCurrentGroup: agent(openChat)?.isGroup ?? false, phase: computer.phase(box),
                                imageUpdateAvailable: computer.status(box)?.raw["imageUpdateAvailable"]?.bool,
                                anyRunning: agents.contains { $0.isRunning }, transportConnected: isLive)
  }

  /** The window starts with an account: the driver gets its calls, and the server's last rebuild step is read back. */
  func connectRebuild(_ backend: AgentBackend) {
    let calls = RebuildDriver.Calls(
      update: { [weak backend] _, force in
        guard let backend else { throw RebuildDriver.CallFailure() }
        return try await backend.updateComputer(force: force)
      },
      reset: { [weak backend] in
        guard let backend else { throw RebuildDriver.CallFailure() }
        return try await backend.resetComputer()
      })
    rebuild.onHardLockChanged = { [weak self] held in
      guard let self, !held, self.rosterHeld else { return }
      self.rosterHeld = false
      // The freeze over: everything read again, as after a reconnect (`GOn`).
      self.computerReconnected()
      Task {
        await self.reloadRoster()
        if let chat = self.openChat { await self.refresh(chat) }
        await self.loadPins()
        await self.loadSections()
      }
    }
    rebuild.connect(calls: calls, inputs: rebuildInputs)
    Task { rebuild.migrationReadBack(await backend.migrationStatus()) }
  }

  /** Sending waits while the computer is rebuilt (`isSendingPaused`). */
  public var isSendingPaused: Bool { rebuild.isHardLocked }

  // MARK: The disk

  /** The disk's state: "soft", "hard", or nil when it has room (`diskPressureSnapshots`). */
  public var diskPressure: String? { computer.diskPressure?["level"]?.string }

  /** The Disk Saver agent, when there is one (`purpose: "disk-saver"`). */
  public var diskSaver: Agent? { agents.first { $0.purpose == "disk-saver" } }

  /**
   * "Go to Disk Saver" (`D1t.launch`): its chat if it exists, else a new
   * one made and introduced; the id to open, or nil (the list not read yet,
   * or the computer refused).
   */
  public func launchDiskSaver() async -> String? {
    if let existing = diskSaver { return existing.id }
    if let making = diskSaverCreation { return await making.value }
    guard !agents.isEmpty || backend != nil else { return nil }
    let making = Task { await createDiskSaver() }
    diskSaverCreation = making
    defer { diskSaverCreation = nil }
    return await making.value
  }

  private func createDiskSaver() async -> String? {
    guard let answer = try? await backend?.command("createAgent", [
      "name": .string(RebuildWords.diskSaverName), "description": .string(RebuildWords.diskSaverDescription), "purpose": "disk-saver",
      "origin": "user", "isKickstartRequested": true, "clientNonce": .string("mac-\(UUID().uuidString.lowercased())"),
    ]) else { return nil }  // only reported in the window, never shown
    await reloadRoster()
    return answer["agent"]?["id"]?.text ?? answer["id"]?.text
  }

  /**
   * The automatic Disk Saver, once per time the disk runs low (`$8n`): an
   * existing one not at work is asked to audit (`requestDiskSaverAudit`);
   * with none, one is made, not opened.
   */
  func diskPressureChanged() {
    guard diskPressure != nil else { diskAuditDone = false; return }
    guard !diskAuditDone, !agents.isEmpty, backend != nil else { return }
    diskAuditDone = true
    if let saver = diskSaver {
      guard !saver.isRunning else { return }
      Task { _ = try? await backend?.command("requestDiskSaverAudit", ["id": .string(saver.id)]) }
    } else {
      Task { _ = await launchDiskSaver() }
    }
  }
}
