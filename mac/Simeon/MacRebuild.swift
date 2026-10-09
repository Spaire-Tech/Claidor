import AppKit
import SwiftUI
import SimeonCore

/**
 * Simeon's computer being rebuilt, over the window, as the shipped window
 * shows it (`WOn`'s surfaces): an update as a pill at the top ("Updating
 * Simeon's Computer" and its ring), a reset or recovery as a dialog with
 * its steps that cannot be closed (only sent to the background), the
 * stream away as a pill ("Reconnecting"), and after two minutes "Taking
 * longer than expected" or "Couldn't Reach Simeon's Computer". In Apple's
 * parts: glass pills, sheets, the Mac's buttons.
 */
struct MacRebuildSurfaces: ViewModifier {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  func body(content: Content) -> some View {
    let driver = store.rebuild
    content
      .overlay(alignment: .top) {
        VStack(spacing: 8) {
          if driver.surface.surface == .background, let kind = driver.lock.kind, kind != .reconnecting, driver.lock.stage != nil {
            MacRebuildBanner(kind: kind)
          }
          if driver.lock.kind == .reconnecting {
            let words = RebuildWords.reconnecting(stage: driver.lock.stage, connected: store.isLive)
            MacRebuildPill(title: words.title, subtitle: words.subtitle, progress: nil)
          }
        }
        .padding(.top, 12)
        .animation(.easeOut(duration: 0.16), value: driver.lock.kind)
      }
      .sheet(item: Binding(get: { MacRebuildSheet.current(driver, recoverAsked: navigation.recoverAsked) }, set: { _ in })) { sheet in
        MacRebuildSheetView(sheet: sheet)
          .environment(store)
          .environment(navigation)
          .interactiveDismissDisabled()
      }
      .sheet(item: Binding(get: { navigation.updateConfirm }, set: { navigation.updateConfirm = $0 })) { confirm in
        MacUpdateConfirmSheet(confirm: confirm)
          .environment(store)
          .environment(navigation)
      }
      // "Recover…" is asked only while "Couldn't reach" stands (`j8n`).
      .onChange(of: driver.lock.kind == .reconnecting && driver.escalation == .unreachable) { _, standing in
        if !standing { navigation.recoverAsked = false }
      }
  }
}

/** Which sheet the rebuild puts over the window: its dialog, or one of the two-minute and failure dialogs (`u8n`, `q8n`). */
enum MacRebuildSheet: Identifiable, Equatable {
  case progress(RebuildLock.Kind)
  case unreachable
  case recoverConfirm
  case failed(RebuildLock.Kind, episode: Int)

  var id: String {
    switch self {
    // Not by its operation: a reset learns its operation once started, and the dialog must not close and open again.
    case .progress(let kind): return "progress:\(kind.rawValue)"
    case .unreachable: return "unreachable"
    case .recoverConfirm: return "recover"
    case .failed(let kind, let episode): return "failed:\(kind.rawValue):\(episode)"
    }
  }

  @MainActor
  static func current(_ driver: RebuildDriver, recoverAsked: Bool) -> MacRebuildSheet? {
    let lock = driver.lock
    if let kind = lock.kind {
      if kind == .reconnecting {
        guard driver.escalation == .unreachable else { return nil }
        return recoverAsked ? .recoverConfirm : .unreachable
      }
      guard driver.surface.surface != .background else { return nil }
      // The dialog, with "Taking longer than expected" over it after two minutes (drawn inside it).
      return .progress(kind)
    }
    if let failure = driver.failure { return .failed(failure.request.kind, episode: failure.episodeId) }
    return nil
  }
}

struct MacRebuildSheetView: View {
  let sheet: MacRebuildSheet
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let driver = store.rebuild
    let pending = driver.pendingKind != nil
    let canRecover = !driver.isBlocked && !pending && driver.canRecover
    switch sheet {
    case .progress(let kind):
      MacRebuildDialog(kind: kind)
        .sheet(isPresented: Binding(get: { driver.escalation == .takingLonger }, set: { _ in })) {
          MacLifecycleDialog(title: RebuildWords.longerTitle, message: RebuildWords.longerBody(kind)) {
            Button(RebuildWords.keepWaiting) { driver.keepWaiting() }
              .keyboardShortcut(.cancelAction)
            Button(RebuildWords.continueInBackground) { driver.keepWaiting(); driver.continueInBackground() }
              .keyboardShortcut(.defaultAction)
          }
        }
    case .unreachable:
      MacLifecycleDialog(title: RebuildWords.unreachableTitle, message: RebuildWords.unreachableBody) {
        Button(RebuildWords.recoverButton) { navigation.recoverAsked = true }
          .disabled(!canRecover)
        // Retry only waits two minutes more; the stream comes back by itself (`B$n` `retry`).
        Button("Retry") { driver.keepWaiting() }
          .keyboardShortcut(.defaultAction)
      }
    case .recoverConfirm:
      MacLifecycleDialog(title: RebuildWords.recoverTitle, message: RebuildWords.recoverBody) {
        Button("Cancel") { navigation.recoverAsked = false }
          .keyboardShortcut(.cancelAction)
        Button(RebuildWords.recoverButton) { navigation.recoverAsked = false; driver.recoverComputer() }
          .keyboardShortcut(.defaultAction)
          .disabled(!canRecover)
      }
    case .failed(let kind, _):
      let can = kind == .update ? driver.canUpdate : kind == .reset ? driver.canReset : driver.canRecover
      MacLifecycleDialog(title: RebuildWords.failedTitle(kind), message: RebuildWords.failedBody(kind)) {
        Button("Dismiss") { driver.dismissFailure() }
          .keyboardShortcut(.cancelAction)
        Button(RebuildWords.retry(kind)) {
          switch kind {
          case .update: driver.update()
          case .reset: driver.resetComputer()
          default: driver.recoverComputer()
          }
        }
        .keyboardShortcut(.defaultAction)
        .tint(kind == .reset ? .red : nil)
        .disabled(!(!driver.isBlocked && !pending && can))
      }
    }
  }
}

/** A dialog of the computer's (`U5e`): its title, what it says, its buttons at the right; 440 wide. */
struct MacLifecycleDialog<Actions: View>: View {
  let title: String
  let message: String
  @ViewBuilder let actions: () -> Actions

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.system(size: 13, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
      Text(message).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      HStack {
        Spacer()
        actions()
      }
      .padding(.top, 6)
    }
    .padding(20)
    .frame(width: 440)
  }
}

/**
 * The rebuild's dialog (`d8n`): its title, the steps (done, under way,
 * still to come), the bar and its percent, which only goes forward, and
 * Continue in Background. It cannot be closed.
 */
struct MacRebuildDialog: View {
  let kind: RebuildLock.Kind
  @Environment(AppStore.self) private var store
  @State private var furthest = 0.0

  var body: some View {
    let projected = store.rebuildSteps(kind)
    let progress = max(furthest, projected.progress)
    VStack(alignment: .leading, spacing: 12) {
      Text(RebuildWords.title(kind)).font(.system(size: 15, weight: .semibold))
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(projected.steps.enumerated()), id: \.offset) { _, step in
          HStack(spacing: 6) {
            Group {
              switch step.state {
              case .done: Image(systemName: "checkmark.circle").foregroundStyle(.tertiary)
              case .active: ProgressView().controlSize(.small)
              case .pending: Image(systemName: "circle").foregroundStyle(.secondary)
              }
            }
            .frame(width: 16, height: 16)
            Text(step.label)
              .font(.system(size: 13))
              .foregroundStyle(step.state == .active ? .primary : step.state == .done ? .tertiary : .secondary)
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(step.label + (step.state == .done ? ", completed" : step.state == .active ? ", in progress" : ", not started"))
        }
      }
      HStack(spacing: 8) {
        ProgressView(value: progress).progressViewStyle(.linear)
        Text("\(Int((progress * 100).rounded()))%").font(.system(size: 13)).monospacedDigit().foregroundStyle(.secondary)
      }
      HStack {
        Spacer()
        Button(RebuildWords.continueInBackground) { store.rebuild.continueInBackground() }
          .keyboardShortcut(.defaultAction)
      }
      .padding(.top, 4)
    }
    .padding(20)
    .frame(width: 520)
    .frame(maxHeight: 480)
    .onChange(of: projected.progress, initial: true) { _, now in furthest = max(furthest, now) }
  }
}

/** The rebuild in the background (`h8n`): the pill at the window's top, its ring; a click brings the dialog back. */
struct MacRebuildBanner: View {
  let kind: RebuildLock.Kind
  @Environment(AppStore.self) private var store

  var body: some View {
    let projected = store.rebuildSteps(kind)
    Button { store.rebuild.restoreForeground() } label: {
      MacRebuildPill(title: RebuildWords.title(kind), subtitle: projected.steps.indices.contains(projected.activeIndex) ? projected.steps[projected.activeIndex].label : "", progress: projected.progress)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(RebuildWords.bannerLabel)
  }
}

/** The pill (`A1t`): a ring with how far, or a spinner; the title and the line under it. */
struct MacRebuildPill: View {
  let title: String
  let subtitle: String?
  let progress: Double?

  var body: some View {
    HStack(spacing: 10) {
      if let progress {
        ZStack {
          Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 2.75)
          Circle().trim(from: 0, to: max(0, min(1, progress)))
            .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2.75, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .animation(.easeOut(duration: 0.4), value: progress)
        }
        .frame(width: 16.5, height: 16.5)
        .frame(width: 22, height: 22)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int((progress * 100).rounded()))%")
      } else {
        ProgressView().controlSize(.small).frame(width: 22, height: 22)
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(.primary)
        if let subtitle, !subtitle.isEmpty { Text(subtitle).font(.system(size: 13)).foregroundStyle(.secondary) }
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .glassEffect(.regular, in: .rect(cornerRadius: 10))
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.updatesFrequently)
  }
}

/**
 * "Update Simeon's Computer?" or "An agent is working" (`K1t`, `FAe`): the
 * palette's and the Update pill's question. A refusal stays in red under
 * it (`zAe`); otherwise it starts and closes at once.
 */
struct MacUpdateConfirmSheet: View {
  let confirm: MacNavigation.UpdateConfirm
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var refusal: String?

  var body: some View {
    let words = confirm.busy ? RebuildWords.updateBusy(confirm.workingNames) : RebuildWords.updateIdle
    VStack(alignment: .leading, spacing: 10) {
      Text(words.title).font(.system(size: 13, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
      Text(words.description).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      if let refusal {
        Text(refusal).font(.system(size: 12)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
      }
      HStack {
        Spacer()
        Button(words.cancel) { navigation.updateConfirm = nil }
          .keyboardShortcut(.cancelAction)
        if let secondary = words.secondary {
          Button(secondary, role: .destructive) { perform { store.rebuild.update(force: true) } }
            .tint(.red)
        }
        Button(words.confirm) {
          perform { if confirm.busy { store.rebuild.queueUpdateWhenIdle() } else { store.rebuild.update(force: false) } }
        }
        .keyboardShortcut(.defaultAction)
      }
      .padding(.top, 6)
    }
    .padding(20)
    .frame(width: 500)
  }

  private func perform(_ action: () -> Void) {
    let driver = store.rebuild
    if let refused = RebuildWords.refusal(update: true, isBlocked: driver.isBlocked, pending: driver.pendingKind, canReset: driver.canReset, canUpdate: driver.canUpdate) {
      refusal = refused
      return
    }
    action()
    navigation.updateConfirm = nil
  }
}

/**
 * Low disk (`D8n`), under the chat's toolbar: "Computer is low on disk
 * space" (or critically), what Disk Saver is doing, and Go to Disk Saver.
 */
struct MacDiskBanner: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var launching = false

  var body: some View {
    if let level = store.diskPressure {
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 2) {
          Text(RebuildWords.diskTitle(hard: level == "hard")).font(.system(size: 13, weight: .medium))
          Text(RebuildWords.diskBody).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
        Button(launching ? RebuildWords.diskOpening : RebuildWords.diskButton) {
          launching = true
          Task {
            if let id = await store.launchDiskSaver() { navigation.selected = id }
            launching = false
          }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(launching)
      }
      .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 10))
      .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Ink.hairline, lineWidth: 0.5))
      .padding(.horizontal, 16)
      .padding(.top, 8)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Low disk space")
    }
  }
}

/**
 * The sidebar when the agents cannot be read (`tpn`, `npn`): "Can't reach
 * your computer" with Retry and Recover computer while there is no list to
 * show, "Reconnecting to your computer…" over a list already shown.
 */
struct MacSidebarConnection: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    let driver = store.rebuild
    VStack(alignment: .leading, spacing: 10) {
      Label("Can't reach your computer", systemImage: "desktopcomputer")
        .font(.system(size: 13, weight: .semibold))
      let canRecover = driver.canReset && !driver.isBlocked
      Text("Your agents are safe \u{2014} they just can't be loaded right now." + (canRecover ? " If it doesn't come back on its own, recover it \u{2014} your files and logins are kept." : ""))
        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      if store.rosterRetrying {
        HStack(spacing: 6) {
          ProgressView().controlSize(.small)
          Text("Retrying\u{2026}").font(.system(size: 12)).foregroundStyle(.secondary)
        }
      } else {
        HStack(spacing: 8) {
          Button("Retry") { Task { await store.retryRoster() } }
          if canRecover {
            // No question first: the window's sidebar starts the reset at once.
            let recovering = driver.pendingKind == .reset || driver.lock.kind == .reset
            Button(recovering ? "Recovering\u{2026}" : "Recover computer") { driver.resetComputer() }
              .disabled(recovering)
          }
        }
        .controlSize(.small)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.pill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .padding(.horizontal, 12)
  }
}

struct MacSidebarReconnecting: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 8) {
      Text("Reconnecting to your computer\u{2026}").font(.system(size: 11)).foregroundStyle(.secondary)
      Spacer(minLength: 0)
      Button(store.rosterRetrying ? "Retrying\u{2026}" : "Retry") { Task { await store.retryRoster() } }
        .buttonStyle(.borderless)
        .controlSize(.small)
        .disabled(store.rosterRetrying)
    }
    .frame(minHeight: 28)
    .padding(.horizontal, 12)
  }
}

/**
 * The sidebar's Update pill (`nTn`): "Update" when a newer computer is out,
 * "Queued" while an update waits for the agents (a click cancels it).
 */
struct MacUpdatePill: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let driver = store.rebuild
    let facts = store.updateFacts
    if facts.queued && driver.canUpdate && driver.pendingKind == nil && !driver.isBlocked {
      Button { driver.cancelQueuedUpdate() } label: { Label("Queued", systemImage: "clock") }
        .help("Update queued \u{2014} click to cancel")
        .accessibilityLabel("Update queued \u{2014} click to cancel")
    } else if store.computer.status(store.computerSelection)?.raw["imageUpdateAvailable"]?.bool == true, let action = facts.paletteAction, !facts.queued {
      Button { navigation.updateConfirm = .init(busy: action == .busyOverride, workingNames: facts.workingNames) } label: { Label("Update", systemImage: "icloud.and.arrow.down") }
        .help("A new version of Simeon's computer is available")
        .accessibilityLabel("A new version of Simeon's computer is available")
    }
  }
}

extension AppStore {
  /** The steps of the rebuild under way, for its dialog and its pill (`J1t`). */
  func rebuildSteps(_ kind: RebuildLock.Kind) -> RebuildSteps {
    let lock = rebuild.lock
    let pull = computer.status(rebuild.inputs.boxId)?.pullPercent
    return RebuildSteps.project(kind: kind, stage: lock.stage, status: rebuild.migration.phase(for: lock.operationId),
                                phases: rebuild.migration.phases(for: lock.operationId), pullPercent: pull)
  }

  /** What the palette and the pill know of updating (`WOn`'s `Y`, `te`). */
  struct UpdateFacts {
    let workingNames: [String]
    let queued: Bool
    /** "Update Simeon's Computer" in the palette, as ready or with agents at work, or nil when not offered (`UOn`). */
    let paletteAction: RebuildWords.Availability?
  }

  var updateFacts: UpdateFacts {
    let selected = agent(computerSelection)
    let baseline = selected != nil && selected?.isGroup == false
    let working = agents.filter(\.isRunning).map(\.name)
    let availability = RebuildWords.availability(canUpdateBaseline: baseline, canUpdateBox: baseline && working.isEmpty,
                                                 isBoxUpToDate: computer.status(computerSelection)?.raw["imageUpdateAvailable"]?.bool == false,
                                                 isUpdateQueued: rebuild.isUpdateQueued)
    let pending = rebuild.pendingKind == .update || rebuild.lock.isLocked
    let offered = !pending && !rebuild.isBlocked && (availability == .ready || availability == .busyOverride)
    return UpdateFacts(workingNames: working, queued: rebuild.isUpdateQueued, paletteAction: offered ? availability : nil)
  }
}
