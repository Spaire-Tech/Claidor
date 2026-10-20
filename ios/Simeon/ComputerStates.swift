import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

#if os(iOS)
/**
 * Simeon's computer being rebuilt or out of reach, on the phone: the Mac's
 * step 13 (mac/Simeon/ComputerStates.swift) with the same rules and words,
 * all of them from the shared core (RebuildDriver, RebuildWords,
 * RebuildSteps), drawn with Apple's own parts. The questions and the
 * failures are alerts; the rebuild in front is a sheet that cannot be
 * swiped away; a rebuild sent to the background and the stream coming back
 * are a pill at the top. One at a time, as the Mac has them.
 */

// MARK: - What is asked, and what shows

/** A computer question the person asked (search's Update Simeon's Computer, "Couldn't Reach"'s Recover; the Mac's sidebar has the other Recover). */
enum ComputerAsk: Equatable {
  case update
  case recover(fromSidebar: Bool)
}

/**
 * The question asked on the phone, kept for the app (the Mac keeps it on
 * its window, `WindowState.computerAsk`): the list's search sets it, the
 * dialogs answer it.
 */
@MainActor
@Observable
final class ComputerAsks {
  static let shared = ComputerAsks()
  var ask: ComputerAsk?
}

/**
 * The computer's one dialog at a time (the Mac's `ComputerDialog`): the
 * rebuild in front, "Couldn't Reach Simeon's Computer" and its recovery
 * question, a failed rebuild, or the question the person asked.
 */
enum ComputerDialog: Equatable {
  case rebuild(RebuildLock.Kind, longer: Bool)
  case unreachable
  case recoverConfirm(fromSidebar: Bool)
  case failed(RebuildLock.Kind, episode: Int)
  case update

  var isRebuild: Bool {
    if case .rebuild = self { return true }
    return false
  }

  /** As the Mac decides it (`ComputerDialog.current`). */
  @MainActor
  static func current(_ driver: RebuildDriver, ask: ComputerAsk?) -> ComputerDialog? {
    let lock = driver.lock
    if let kind = lock.kind {
      if kind == .reconnecting {
        // Two minutes without the stream (`B$n`); a failed rebuild waits until it is back.
        if driver.escalation == .unreachable {
          return ask == .recover(fromSidebar: false) ? .recoverConfirm(fromSidebar: false) : .unreachable
        }
      } else if driver.surface.surface != .background {
        return .rebuild(kind, longer: driver.escalation == .takingLonger)
      } else {
        // In the background its pill shows; nothing else may start meanwhile.
        return nil
      }
    } else if let failure = driver.failure {
      return .failed(failure.request.kind, episode: failure.episodeId)
    }
    switch ask {
    case .update?: return .update
    case .recover(let fromSidebar)?: return .recoverConfirm(fromSidebar: fromSidebar)
    case nil: return nil
    }
  }
}

// MARK: - The list's modifier

/**
 * Everything the computer shows over the list and the chat pushed on it:
 * the pills at the top, the dialogs, and the agent the computer follows.
 * Put on the list's navigation stack (HomeView), once. Each part is its own
 * view, so the roster changing redraws none of the list.
 */
struct ComputerStates: ViewModifier {
  func body(content: Content) -> some View {
    content
      .overlay(alignment: .top) { ComputerPills() }
      .background { ComputerDialogs() }
      .background { ComputerFollow() }
  }
}

/**
 * The agent the computer follows and the computer watched (the Mac's
 * selected agent, `MainWindow.watchedComputer`): the chat open now, else
 * the one opened last while it is there, else the first agent in the list
 * (the Mac's window always has one chosen, `chooseFirst`; the phone takes
 * the first that is one agent, so the rebuild can be followed). Its
 * computer is read and kept fresh while followed, not a group's. The app
 * coming forward starts again a computer started here, reads what is
 * watched (at most once a minute) and whether this account may use Simeon,
 * not while the computer is rebuilt (`cameForward`). A phone coming back
 * also gives a stream that is away its two minutes again: the wait ran on
 * while the app was in the background, and "Couldn't Reach" would show as
 * the stream was coming back.
 */
private struct ComputerFollow: View {
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  @State private var watching: String?

  private var followed: String? {
    if let open = store.openChat { return open }
    if let kept = store.windowSelection, store.agent(kept) != nil { return kept }
    return store.agents.first { !$0.isGroup && !$0.isHidden }?.id
  }

  private var watched: String? {
    guard let id = store.windowSelection, let agent = store.agent(id), !agent.isGroup else { return nil }
    return id
  }

  var body: some View {
    Color.clear
      .allowsHitTesting(false)
      .accessibilityHidden(true)
      .onChange(of: followed, initial: true) { _, id in
        if store.windowSelection != id { store.windowSelection = id }
      }
      .onChange(of: watched, initial: true) { _, id in watch(id) }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { cameForward() }
      }
      .onDisappear {
        // Signed out (or the first run in the list's place): nothing stays watched or asked.
        if let watching { store.unwatchComputer(watching) }
        watching = nil
        ComputerAsks.shared.ask = nil
      }
  }

  private func watch(_ now: String?) {
    guard now != watching else { return }
    if let watching { store.unwatchComputer(watching) }
    watching = now
    if let now { store.watchComputer(now) }
  }

  private func cameForward() {
    if store.rebuild.lock.kind == .reconnecting { store.rebuild.keepWaiting() }
    let rebuilding = store.rebuild.isHardLocked
    store.windowCameForward(rebuilding: rebuilding)
    guard !rebuilding else { return }
    let store = store
    Task { await store.refreshAccess() }
  }
}

// MARK: - The dialogs

/**
 * The dialogs (`u8n`, `U5e`, `K1t`/`FAe`, `j8n`): the rebuild in front as a
 * sheet; "Couldn't Reach Simeon's Computer", "Recover Simeon's Computer?",
 * a failed rebuild and the update question as alerts. A button that would
 * be disabled on the Mac is left out. The sheet goes before an alert comes,
 * so a rebuild that fails shows its failure once the sheet is down; and
 * while something else is in front (Settings, the agent's page, the call),
 * a dialog waits for it to close, as one presented under it would never
 * show. "Couldn't Reach" waits for the app to be in front (`ComputerFollow`
 * gives the stream its two minutes again then). A finished rebuild taps
 * success; a failure, or the computer out of reach, a warning.
 */
private struct ComputerDialogs: View {
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  /** The rebuild's sheet is up, or on its way. */
  @State private var sheetUp = false
  /** The alert up. */
  @State private var shownAlert: ComputerDialog?
  /** Why a confirmed update was refused (`zAe`): the question comes back saying so (the Mac keeps it open with this in red). */
  @State private var refusal: String?
  /** A dialog waiting for what is in front to close. */
  @State private var waiting: Task<Void, Never>?

  var body: some View {
    let wanted = wantedNow()
    let alertTitle = shownAlert.map { title($0) } ?? ""
    Color.clear
      .allowsHitTesting(false)
      .accessibilityHidden(true)
      .sheet(isPresented: $sheetUp, onDismiss: { sync(wantedNow()) }) {
        RebuildSheet()
      }
      .alert(alertTitle, isPresented: Binding(get: { shownAlert != nil }, set: { shown in closed(shown) }), presenting: shownAlert) { dialog in
        actions(dialog)
      } message: { dialog in
        Text(message(dialog))
      }
      .onChange(of: wanted, initial: true) { _, next in sync(next) }
      .onChange(of: wanted) { old, next in
        switch next {
        case .failed?: Haptics.warning()
        // Not again on coming back from its own Recover question's Cancel.
        case .unreachable? where old != .recoverConfirm(fromSidebar: false): Haptics.warning()
        default: break
        }
      }
      // A rebuild beginning lets go of any question asked before it (it would come back out of place once the rebuild ends).
      .onChange(of: store.rebuild.lock.kind) { old, kind in
        if let kind, kind != .reconnecting { ComputerAsks.shared.ask = nil }
        if let old, old != .reconnecting, kind == nil, store.rebuild.lock.lastResolution == .settled { Haptics.success() }
      }
  }

  /** The dialog the state asks for (`ComputerDialog.current`), but "Couldn't Reach" only with the app in front. */
  private func wantedNow() -> ComputerDialog? {
    let current = ComputerDialog.current(store.rebuild, ask: ComputerAsks.shared.ask)
    return current == .unreachable && scenePhase != .active ? nil : current
  }

  /** What shows now: the sheet, or an alert once the sheet has gone. */
  private func sync(_ next: ComputerDialog?) {
    waiting?.cancel()
    waiting = nil
    if next?.isRebuild == true {
      shownAlert = nil
      if !sheetUp { present { sheetUp = true } }
      return
    }
    if sheetUp {
      // Its `onDismiss` brings what follows.
      sheetUp = false
      return
    }
    if next != .update { refusal = nil }
    if let next, shownAlert == nil {
      present { shownAlert = next }
    } else {
      // One of these alerts is up: it changes in place, or goes.
      shownAlert = next
    }
  }

  /**
   * An alert's button closed it: it comes back if it is still wanted once
   * its answer has run, as the Mac's dialog stays while its state holds (a
   * refused update with why, a retry that could not start).
   */
  private func closed(_ shown: Bool) {
    guard !shown, shownAlert != nil else { return }
    shownAlert = nil
    Task { @MainActor in sync(wantedNow()) }
  }

  /** Shown now, or once nothing else is in front (checked every half second), whatever is wanted by then. */
  private func present(_ show: @escaping () -> Void) {
    guard Self.somethingInFront else { show(); return }
    waiting = Task { @MainActor in
      while Self.somethingInFront {
        try? await Task.sleep(nanoseconds: 500_000_000)
        if Task.isCancelled { return }
      }
      sync(wantedNow())
    }
  }

  /** The app's window is presenting something (a sheet, the call, an alert closing): a dialog presented now would not show. */
  private static var somethingInFront: Bool {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    guard let root = (windows.first(where: \.isKeyWindow) ?? windows.first)?.rootViewController else { return false }
    return root.presentedViewController != nil
  }

  private var updateWords: RebuildWords.Confirmation {
    store.computerUpdateOffer == .busyOverride ? RebuildWords.updateBusy(store.workingAgentNames) : RebuildWords.updateIdle
  }

  private func title(_ dialog: ComputerDialog) -> String {
    switch dialog {
    case .unreachable: return RebuildWords.unreachableTitle
    case .recoverConfirm: return RebuildWords.recoverTitle
    case .failed(let kind, _): return RebuildWords.failedTitle(kind)
    case .update: return updateWords.title
    case .rebuild(let kind, _): return RebuildWords.title(kind)
    }
  }

  private func message(_ dialog: ComputerDialog) -> String {
    switch dialog {
    case .unreachable: return RebuildWords.unreachableBody
    case .recoverConfirm: return RebuildWords.recoverBody
    case .failed(let kind, _): return RebuildWords.failedBody(kind)
    case .update:
      let description = updateWords.description
      return refusal.map { "\(description)\n\n\($0)" } ?? description
    case .rebuild: return ""
    }
  }

  @ViewBuilder
  private func actions(_ dialog: ComputerDialog) -> some View {
    let driver = store.rebuild
    let free = !driver.isBlocked && driver.pendingKind == nil
    switch dialog {
    case .unreachable:
      if free && driver.canRecover {
        Button(RebuildWords.recoverButton) { ComputerAsks.shared.ask = .recover(fromSidebar: false) }
      }
      // Retry only waits two minutes more; the stream comes back by itself (`B$n` `retry`).
      Button("Retry") { driver.keepWaiting() }
    case .recoverConfirm(let fromSidebar):
      Button("Cancel", role: .cancel) { ComputerAsks.shared.ask = nil }
      if free && (fromSidebar ? driver.canReset : driver.canRecover) {
        Button(RebuildWords.recoverButton) {
          ComputerAsks.shared.ask = nil
          // The sidebar's recovery is the window's reset (`forceRecreateComputer`, "Resetting Simeon's Computer").
          if fromSidebar { driver.resetComputer() } else { driver.recoverComputer() }
        }
      }
    case .failed(let kind, _):
      Button("Dismiss", role: .cancel) { driver.dismissFailure() }
      if free && (kind == .update ? driver.canUpdate : kind == .reset ? driver.canReset : driver.canRecover) {
        Button(RebuildWords.retry(kind), role: kind == .reset ? .destructive : nil) {
          switch kind {
          case .update: driver.update()
          case .reset: driver.resetComputer()
          default: driver.recoverComputer()
          }
        }
      }
    case .update:
      let busy = store.computerUpdateOffer == .busyOverride
      let words = updateWords
      Button(words.cancel, role: .cancel) { ComputerAsks.shared.ask = nil }
      if let secondary = words.secondary {
        Button(secondary, role: .destructive) { confirmUpdate { driver.update(force: true) } }
      }
      Button(words.confirm) {
        confirmUpdate { if busy { driver.queueUpdateWhenIdle() } else { driver.update(force: false) } }
      }
    case .rebuild:
      EmptyView()
    }
  }

  /** A confirmed update: refused, the question stays and comes back with why (`zAe`, `closed`); else started (or queued) and the question let go. */
  private func confirmUpdate(_ action: () -> Void) {
    let driver = store.rebuild
    if let refused = RebuildWords.refusal(update: true, isBlocked: driver.isBlocked, pending: driver.pendingKind, canReset: driver.canReset, canUpdate: driver.canUpdate) {
      refusal = refused
      Haptics.warning()
      return
    }
    action()
    ComputerAsks.shared.ask = nil
  }
}

/**
 * The rebuild in front (`d8n`), as a sheet that cannot be swiped away: its
 * title, the steps (done ✓, under way turning, still to come ○), the bar
 * and its percent, which only goes forward for this rebuild, and Continue in
 * Background. "Taking longer than expected" over it after two minutes, with
 * Keep waiting and Continue in Background (decision 9). Sized to what it
 * holds.
 */
private struct RebuildSheet: View {
  @Environment(AppStore.self) private var store
  /** The kind last shown, kept while the sheet goes down after the lock lets go. */
  @State private var kept: RebuildLock.Kind = .update
  @State private var furthest: [String: Double] = [:]
  @State private var longer = false
  @State private var height: CGFloat = 0

  var body: some View {
    let driver = store.rebuild
    let held: RebuildLock.Kind? = driver.lock.kind == .reconnecting ? nil : driver.lock.kind
    let kind = held ?? kept
    let projected = store.rebuildSteps(kind)
    let key = "\(kind.rawValue):\(driver.lock.operationId ?? "")"
    let progress = max(furthest[key] ?? 0, projected.progress)
    VStack(alignment: .leading, spacing: 0) {
      Text(RebuildWords.title(kind))
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .accessibilityAddTraits(.isHeader)
      VStack(alignment: .leading, spacing: 14) {
        ForEach(Array(projected.steps.enumerated()), id: \.offset) { _, step in
          HStack(spacing: 10) {
            Group {
              switch step.state {
              case .done:
                Image(systemName: "checkmark.circle").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
              case .active:
                ProgressView().controlSize(.small).tint(Ink.primary)
              case .pending:
                Image(systemName: "circle").font(.system(size: 17)).foregroundStyle(Ink.secondary)
              }
            }
            .frame(width: 22, height: 22)
            Text(step.label)
              .font(.system(size: 16))
              .foregroundStyle(Ink.primary)
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(step.label + (step.state == .done ? ", completed" : step.state == .active ? String(localized: ", in progress") : String(localized: ", not started")))
        }
      }
      .padding(.top, 20)
      HStack(spacing: 10) {
        GeometryReader { box in
          ZStack(alignment: .leading) {
            Capsule().fill(Ink.primary.opacity(0.15))
            Capsule().fill(Ink.primary).frame(width: box.size.width * min(max(progress, 0), 1))
          }
          .animation(.easeOut(duration: 0.2), value: progress)
        }
        .frame(height: 6)
        Text("\(Int((progress * 100).rounded()))%")
          .font(.system(size: 15))
          .monospacedDigit()
          .foregroundStyle(Ink.primary)
      }
      .accessibilityElement(children: .combine)
      .padding(.top, 24)
      Button { driver.continueInBackground() } label: {
        Text(RebuildWords.continueInBackground)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(Ink.primary)
          .frame(maxWidth: .infinity)
          .frame(height: 50)
      }
      .buttonStyle(.glass)
      .padding(.top, 28)
    }
    .padding(.horizontal, 24)
    .padding(.top, 28)
    .padding(.bottom, 16)
    .fixedSize(horizontal: false, vertical: true)
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
      if abs(measured - height) >= 1 { height = measured }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .presentationDetents([.height(height > 0 ? height : 440)])
    .presentationDragIndicator(.hidden)
    .presentationBackground(Ink.ground)
    // It cannot be closed: only Continue in Background sends it away.
    .interactiveDismissDisabled()
    .accessibilityElement(children: .contain)
    .accessibilityLabel(RebuildWords.title(kind))
    .onChange(of: held, initial: true) { _, now in if let now { kept = now } }
    .onChange(of: projected.progress, initial: true) { _, now in furthest[key] = max(furthest[key] ?? 0, now) }
    .onChange(of: driver.escalation == .takingLonger, initial: true) { _, now in longer = now }
    .alert(RebuildWords.longerTitle, isPresented: $longer) {
      Button(RebuildWords.keepWaiting, role: .cancel) { driver.keepWaiting() }
      Button(RebuildWords.continueInBackground) {
        driver.keepWaiting()
        driver.continueInBackground()
      }
    } message: {
      Text(RebuildWords.longerBody(kind))
    }
  }
}

// MARK: - The pills at the top

/**
 * The pills at the top of the screen, under the status bar and centred
 * (`k8n`, `h8n`): "Reconnecting" while the stream is away (a spinner;
 * "Checking connection" once it is back, "Simeon's computer restarting"
 * while the computer comes up), and a rebuild sent to the background
 * ("Updating Simeon's Computer", its ring and the step under way), which
 * brings its sheet back when tapped. On the glass, as the app's other
 * floating capsules.
 */
private struct ComputerPills: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    let driver = store.rebuild
    VStack(spacing: 8) {
      if let kind = driver.lock.kind {
        if kind == .reconnecting {
          let words = RebuildWords.reconnecting(stage: driver.lock.stage, connected: store.isLive)
          ProgressPill(title: words.title, subtitle: words.subtitle, progress: nil)
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(words.title)
            .accessibilityAddTraits(.updatesFrequently)
            .transition(.move(edge: .top).combined(with: .opacity))
        } else if driver.surface.surface == .background, driver.lock.stage != nil {
          let steps = store.rebuildSteps(kind)
          Button {
            Haptics.tap()
            driver.restoreForeground()
          } label: {
            ProgressPill(title: RebuildWords.title(kind), subtitle: steps.steps.indices.contains(steps.activeIndex) ? steps.steps[steps.activeIndex].label : nil,
                         progress: steps.progress)
          }
          .buttonStyle(.tactile)
          .accessibilityLabel(RebuildWords.bannerLabel)
          .transition(.move(edge: .top).combined(with: .opacity))
        }
      }
    }
    .padding(.top, 6)
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity)
    .animation(.easeOut(duration: 0.2), value: driver.lock.kind)
    .animation(.easeOut(duration: 0.2), value: driver.surface.surface)
  }
}

/** A pill (`sand-progress-banner`): a ring with how far, or a spinner; the title and the line under it; a capsule of glass. */
private struct ProgressPill: View {
  let title: String
  let subtitle: String?
  let progress: Double?

  var body: some View {
    HStack(spacing: 10) {
      if let progress {
        ZStack {
          Circle().stroke(Ink.primary.opacity(0.12), lineWidth: 3)
          Circle().trim(from: 0, to: max(0, min(1, progress)))
            .stroke(Ink.primary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .animation(.easeOut(duration: 0.2), value: progress)
        }
        .frame(width: 20, height: 20)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int((progress * 100).rounded()))%")
      } else {
        ProgressView().controlSize(.small).tint(Ink.primary)
          .frame(width: 20, height: 20)
      }
      VStack(alignment: .leading, spacing: 0) {
        Text(title)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(Ink.primary)
        if let subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(.system(size: 13))
            .foregroundStyle(Ink.secondary)
        }
      }
      .lineLimit(1)
    }
    .padding(.leading, 14)
    .padding(.trailing, 18)
    .padding(.vertical, 9)
    .contentShape(.capsule)
    .glassEffect(.regular, in: .capsule)
  }
}

// MARK: - Low disk

extension Ink {
  /** "Needs your attention" and low disk: the Mac's orange title (`Look.attentionInk`, `#c27400`, `#ffaf38`). */
  static let attentionInk = Color.dynamic(light: "#c27400", dark: "#ffaf38")
  /** Their wash: the orange at 9%, 17.3% on dark (`Look.attentionWash`). */
  static let attentionWash = Color.dynamic(light: "#ff980017", dark: "#ff98002c")
}

/**
 * Low disk (`D8n`), under the chat's head, 16 in from each side (the Mac's
 * `DiskBanner`): "Computer is low on disk space" (or critically) in orange,
 * what Disk Saver is doing, and Go to Disk Saver ("Opening Disk Saver…"
 * while it opens), which opens its chat, made first if there is none. On the
 * orange wash over the page's ground, so the messages under the bar do not
 * show through.
 */
struct ComputerDiskBanner: View {
  @Environment(AppStore.self) private var store
  @State private var launching = false

  var body: some View {
    if let level = store.diskPressure {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(RebuildWords.diskTitle(hard: level == "hard"))
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Ink.attentionInk)
          Text(RebuildWords.diskBody)
            .font(.system(size: 12))
            .foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button {
          launching = true
          Task {
            // Its chat opens the way a tapped notification's does (the list takes it from there).
            if let id = await store.launchDiskSaver() { Notifications.shared.openAgent = id }
            launching = false
          }
        } label: {
          Text(launching ? RebuildWords.diskOpening : RebuildWords.diskButton)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Ink.ground)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(Ink.primary, in: Capsule())
            .contentShape(.capsule)
            .fixedSize()
        }
        .buttonStyle(.tactile)
        .disabled(launching)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .background(Ink.attentionWash, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .background(Ink.ground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .padding(.horizontal, 16)
      .padding(.bottom, 8)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Low disk space")
    }
  }
}

// MARK: - The access cover

/** The access cover when it applies (the Mac's `AppRoot`): refused before the computer was ever reached, and no Simeon on this account (`mzn`). */
struct AccessCoverLayer: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    if store.accessCoverShown {
      AccessCover()
        .transition(.opacity)
    }
  }
}

extension AppStore {
  /** The access cover is over the app (the first run's name field keeps the keyboard down meanwhile). */
  var accessCoverShown: Bool { accessBlocked && !hasReachedBox && access.state != .granted }
}

/**
 * The whole screen when this account was refused before its computer was
 * ever reached (`mzn`, the Mac's `AccessCover`), in the iPhone's words (12
 * October 2026, PhoneUpgrade): the free month is over, or a plan is
 * needed; See plans opens the App Store's plans (PlansSheet), and a plan
 * bought there lifts the cover at once. An account no plan can help gets
 * Simeon Labs' page. Read again when it shows and each time the app comes
 * forward: the first run, which could not be decided while the computer
 * refused, is decided then. Since 14 October 2026 the server lets an
 * account with no plan reach its computer, so this shows only when that is
 * switched off (`DESKTOP_COMPUTER_WITHOUT_PLAN`); the app stays open and
 * the line over the composer says why Send waits.
 */
struct AccessCover: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @State private var showsPlans = false
  @State private var askingSignOut = false
  @State private var purchases = Purchases.shared

  var body: some View {
    let summary = store.usage.summary
    // A failed payment (14 October 2026) goes where the card is (`PhoneUpgrade.route`): the plans for an Apple plan,
    // Stripe's card page in the app where Apple allows the link, else no button.
    let failed = store.access.state == .paymentRequired && summary?.paymentFailed == true
    let mend = failed ? PhoneUpgrade.route(access: store.access, usage: summary, webLinkAllowed: purchases.webLinkAllowed) : .none
    let cover = PhoneUpgrade.cover(access: store.access, usage: summary)
    let words = failed && mend == .none ? PhoneUpgrade.withoutUpgrade(cover) : cover
    VStack(spacing: 0) {
      Spacer(minLength: 24)
      LogoShimmer().frame(width: 46, height: 46)
        .foregroundStyle(Ink.primary)
        .accessibilityHidden(true)
      Text(words.title)
        .font(.system(size: 26))
        .foregroundStyle(Ink.primary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 28)
        .accessibilityAddTraits(.isHeader)
      Text(words.body)
        .font(.system(size: 16))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 10)
      Spacer(minLength: 24)
      if let action = words.action {
        Button {
          if failed {
            switch mend {
            case .plans:
              showsPlans = true
            case .portal(let flow, let tier):
              Task {
                if let failure = await BillingPage.shared.open(flow: flow, tier: tier, store: store, openURL: openURL) { store.problem = failure }
                await readAgain()
              }
            case .web(let url):
              openURL(url)
            case .none:
              break
            }
          } else if store.access.state == .paymentRequired {
            showsPlans = true
          } else {
            openURL(SandAccess.page)
          }
        } label: {
          Text(action)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Ink.ground)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .buttonStyle(.glassProminent)
        .tint(Ink.primary)
        .frame(maxWidth: 420)
      }
      // The way out (12 October 2026: the founder was held on this screen with no way to another account): Sign Out,
      // asked first as everywhere.
      Button { askingSignOut = true } label: {
        Text("Sign Out").font(.system(size: 16, weight: .medium)).frame(height: 44).contentShape(.rect)
      }
      .buttonStyle(.tactile)
      .foregroundStyle(Ink.secondary)
      .padding(.top, 8)
      .padding(.bottom, 20)
    }
    .padding(.horizontal, 24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // All of it takes the touch: nothing under it can be reached.
    .contentShape(.rect)
    .background(Ink.ground)
    .alert(AccountMenu.signOutTitle, isPresented: $askingSignOut) {
      Button(AccountMenu.signOutCancel, role: .cancel) {}
      Button(AccountMenu.signOutConfirm, role: .destructive) { Task { await session.signOut() } }
    } message: {
      Text(AccountMenu.signOutLine)
    }
    .task { await readAgain() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await readAgain() } }
    }
    .sheet(isPresented: $showsPlans, onDismiss: { Task { await readAgain() } }) {
      PlansSheet().presentationBackground(Ink.groupedGround)
    }
  }

  private func readAgain() async {
    await store.refreshAccess()
    await store.refreshUsage()
    await store.reloadRoster()
    if store.hasReachedBox { await session.recheckFirstRun() }
    // Simeon's making failed while the computer refused: again, now it may answer.
    if case .failed = session.handOff, store.access.state == .granted { session.beginHandOff() }
  }
}
#endif
