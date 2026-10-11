import AppKit
import SwiftUI
import SimeonCore

// MARK: - The computer's dialogs

/** A computer question the person asked (⌘K or "/" Update Simeon's Computer, the sidebar's Recover computer, "Couldn't Reach"'s Recover). */
enum ComputerAsk: Equatable {
  case update
  case recover(fromSidebar: Bool)
}

/**
 * The computer's one dialog at a time (decision 2; the window lets them
 * stack and lock each other): the rebuild in front, "Couldn't Reach
 * Simeon's Computer" and its recovery question, a failed rebuild, or the
 * question the person asked.
 */
enum ComputerDialog: Equatable {
  case rebuild(RebuildLock.Kind, longer: Bool)
  case unreachable
  case recoverConfirm(fromSidebar: Bool)
  case failed(RebuildLock.Kind, episode: Int)
  case update

  /** A dialog is over the window: every key is the dialog's (`Qpt`, and decision 2 for the rest). */
  @MainActor static var showing = false

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

/**
 * The dialogs over the window (`u8n`, `U5e`, `K1t`/`FAe`): the scrim (the
 * ink at 50%, 70% on dark) and a centred card, 14 round with a hairline.
 * They open at once; the rebuild's fades (0.16 s) when it settles and goes
 * at once to the background. Each holds the keys while it shows: Return
 * presses the button the window focuses first, Escape what it does there.
 */
struct ComputerDialogLayer: View {
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let dialog = ComputerDialog.current(store.rebuild, ask: window.computerAsk)
    ZStack {
      if let dialog {
        Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
          .contentShape(Rectangle())
          // A confirmation's scrim is its Cancel; the others' take the click and do nothing.
          .onTapGesture { if dialog == .update || dialog == .recoverConfirm(fromSidebar: true) { window.computerAsk = nil } }
          .transition(.opacity)
        ComputerDialogCard(dialog: dialog, look: look)
          .transition(.opacity)
      }
    }
    .ignoresSafeArea()
    // Only the lock settling fades it (0.16 s); opening and Continue in Background are instant.
    .animation(.easeOut(duration: 0.16), value: store.rebuild.lock.kind == nil)
    .onChange(of: dialog != nil, initial: true) { _, shown in
      ComputerDialog.showing = shown
      // Nothing behind keeps the keys (the message field would take the letters).
      if shown { NSApp.keyWindow?.makeFirstResponder(nil) }
    }
    .onDisappear { ComputerDialog.showing = false }
    // A question asked from somewhere that no longer offers it lets go (the agents' list went, an update began).
    .onChange(of: store.rebuild.lock.kind) { _, kind in
      if kind != nil, kind != .reconnecting, window.computerAsk == .update { window.computerAsk = nil }
    }
  }
}

/** The card for each dialog, its words from the shared code (`RebuildWords`), and its keys. */
private struct ComputerDialogCard: View {
  let dialog: ComputerDialog
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var refusal: String?

  var body: some View {
    let driver = store.rebuild
    let pending = driver.pendingKind != nil
    Group {
      switch dialog {
      case .rebuild(let kind, let longer):
        ZStack {
          RebuildDialog(kind: kind, look: look)
          if longer {
            // "Taking longer than expected" over it, with its own scrim, as the window stacks them (decision 9).
            Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5).ignoresSafeArea()
            SimpleDialog(title: RebuildWords.longerTitle, message: RebuildWords.longerBody(kind), width: 440, look: look) {
              DialogButton(title: RebuildWords.keepWaiting, style: .neutral, focused: true, look: look) { driver.keepWaiting() }
              DialogButton(title: RebuildWords.continueInBackground, style: .primary, look: look) {
                driver.keepWaiting()
                driver.continueInBackground()
              }
            }
          }
        }
      case .unreachable:
        SimpleDialog(title: RebuildWords.unreachableTitle, message: RebuildWords.unreachableBody, width: 440, look: look) {
          DialogButton(title: RebuildWords.recoverButton, style: .neutral, focused: true, disabled: driver.isBlocked || pending || !driver.canRecover, look: look) {
            window.computerAsk = .recover(fromSidebar: false)
          }
          // Retry only waits two minutes more; the stream comes back by itself (`B$n` `retry`).
          DialogButton(title: "Retry", style: .primary, look: look) { driver.keepWaiting() }
        }
      case .recoverConfirm(let fromSidebar):
        let can = fromSidebar ? driver.canReset : driver.canRecover
        SimpleDialog(title: RebuildWords.recoverTitle, message: RebuildWords.recoverBody, width: 440, look: look) {
          DialogButton(title: "Cancel", style: .neutral, focused: true, look: look) { window.computerAsk = nil }
          DialogButton(title: RebuildWords.recoverButton, style: .primary, disabled: driver.isBlocked || pending || !can, look: look) {
            window.computerAsk = nil
            // The sidebar's recovery is the window's reset (`forceRecreateComputer`, "Resetting Simeon's Computer").
            if fromSidebar { driver.resetComputer() } else { driver.recoverComputer() }
          }
        }
      case .failed(let kind, _):
        let can = kind == .update ? driver.canUpdate : kind == .reset ? driver.canReset : driver.canRecover
        SimpleDialog(title: RebuildWords.failedTitle(kind), message: RebuildWords.failedBody(kind), width: 440, look: look) {
          DialogButton(title: "Dismiss", style: .neutral, focused: true, look: look) { driver.dismissFailure() }
          DialogButton(title: RebuildWords.retry(kind), style: kind == .reset ? .destructive : .primary, disabled: driver.isBlocked || pending || !can, look: look) {
            switch kind {
            case .update: driver.update()
            case .reset: driver.resetComputer()
            default: driver.recoverComputer()
            }
          }
        }
      case .update:
        let busy = store.computerUpdateOffer == .busyOverride
        let words = busy ? RebuildWords.updateBusy(store.workingAgentNames) : RebuildWords.updateIdle
        SimpleDialog(title: words.title, message: words.description, refusal: refusal, width: 500, look: look) {
          DialogButton(title: words.cancel, style: .neutral, look: look) { window.computerAsk = nil }
          if let secondary = words.secondary {
            DialogButton(title: secondary, style: .redSecondary, look: look) { confirmUpdate { driver.update(force: true) } }
          }
          DialogButton(title: words.confirm, style: .primary, focused: true, look: look) {
            confirmUpdate { if busy { driver.queueUpdateWhenIdle() } else { driver.update(force: false) } }
          }
        }
      }
    }
    .background(ViewerKeys(aboveLocks: true) { event in key(event) })
  }

  /** A confirmed update: refused in red and kept open (`zAe`), else started (or queued) and closed at once. */
  private func confirmUpdate(_ action: () -> Void) {
    let driver = store.rebuild
    if let refused = RebuildWords.refusal(update: true, isBlocked: driver.isBlocked, pending: driver.pendingKind, canReset: driver.canReset, canUpdate: driver.canUpdate) {
      refusal = refused
      return
    }
    action()
    window.computerAsk = nil
  }

  /** Every key is the dialog's: Return the focused button, Escape as the window has it, the rest nothing (`Qpt`). */
  private func key(_ event: NSEvent) -> Bool {
    let driver = store.rebuild
    let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
    let escape = event.keyCode == 53 && mods.isEmpty
    let enter = (event.keyCode == 36 || event.keyCode == 76 || event.keyCode == 49) && mods.isEmpty
    switch dialog {
    case .rebuild(_, let longer):
      if longer {
        if escape || enter { driver.keepWaiting() }
      } else if enter {
        driver.continueInBackground()
      }
    case .unreachable:
      // Escape does nothing; Return is the focused Recover.
      if enter, !driver.isBlocked, driver.pendingKind == nil, driver.canRecover { window.computerAsk = .recover(fromSidebar: false) }
    case .recoverConfirm:
      if escape || enter { window.computerAsk = nil }
    case .failed:
      if escape || enter { driver.dismissFailure() }
    case .update:
      if escape {
        window.computerAsk = nil
      } else if enter {
        let busy = store.computerUpdateOffer == .busyOverride
        confirmUpdate { if busy { driver.queueUpdateWhenIdle() } else { driver.update(force: false) } }
      }
    }
    return true
  }
}

/**
 * A simple dialog (`U5e`, 440; the confirmations 500): the title (14/22,
 * 600) over what it says (14/22, at 40%), padded 12 16; a refusal in red;
 * the buttons at the right of a 56-point bar.
 */
private struct SimpleDialog<Buttons: View>: View {
  let title: String
  let message: String
  var refusal: String? = nil
  let width: CGFloat
  let look: Look
  @ViewBuilder let buttons: () -> Buttons

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.system(size: 14, weight: .semibold))
          .tracking(-0.15)
          .cssLineHeight(22, size: 14, weight: .semibold)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
        Text(message)
          .font(.system(size: 14))
          .cssLineHeight(22, size: 14)
          .foregroundStyle(look.inkTertiary)
          .fixedSize(horizontal: false, vertical: true)
        if let refusal {
          Text(refusal)
            .font(.system(size: 13))
            .foregroundStyle(look.danger)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)
        }
      }
      .padding(.vertical, 12)
      .padding(.horizontal, 16)
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        buttons()
      }
      .padding(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 12))
    }
    .frame(width: width, alignment: .leading)
    .dialogShell(look: look)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(title)
    .accessibilityAddTraits(.isModal)
  }
}

private extension View {
  /** The card: the raised ground, 14 round, a one-point edge at 15%. */
  func dialogShell(look: Look) -> some View {
    self
      .background(look.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
  }
}

/** A dialog's button (32 high, 8 round, 14/20, a half-point ring at 15%): grey, the primary's black (white on dark), red words, or red. */
private struct DialogButton: View {
  enum Style { case neutral, primary, redSecondary, destructive }
  let title: String
  let style: Style
  var focused = false
  var disabled = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14))
        .cssLineHeight(20, size: 14)
        .foregroundStyle(ink)
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 0.5))
        // The button the window focuses when the dialog opens: its ring.
        .overlay {
          if focused {
            RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(look.ink.opacity(0.4), lineWidth: 2).padding(-1.5)
          }
        }
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.5 : 1)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
  }

  private var ink: Color {
    switch style {
    case .neutral: return look.ink
    case .primary: return look.onPrimary
    case .redSecondary: return look.danger
    case .destructive: return Color(hex: 0xfcfcfc)
    }
  }

  private var fill: Color {
    let on = hovering && !disabled
    switch style {
    case .neutral: return on ? look.fillHover : look.rowHover
    case .primary: return on ? look.primaryFillHover : look.primaryFill
    case .redSecondary: return Color(red: 1, green: 38 / 255, blue: 60 / 255).opacity(look.dark ? (on ? 0.32 : 0.173) : (on ? 0.17 : 0.09))
    case .destructive: return Color(hex: 0xff263c)
    }
  }
}

/**
 * The rebuild in front (`d8n`, 520 wide, at most 480 high): its title over
 * a hairline; the steps (done ✓ at 40%, under way turning, still to come ○
 * at 60%; 13/18), the bar and its percent, which only goes forward for
 * this rebuild; Continue in Background on a bar under a hairline. It
 * cannot be closed.
 */
private struct RebuildDialog: View {
  let kind: RebuildLock.Kind
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var furthest: [String: Double] = [:]

  var body: some View {
    let projected = store.rebuildSteps(kind)
    let key = "\(kind.rawValue):\(store.rebuild.lock.operationId ?? "")"
    let progress = max(furthest[key] ?? 0, projected.progress)
    VStack(alignment: .leading, spacing: 0) {
      Text(RebuildWords.title(kind))
        .font(.system(size: 14, weight: .semibold))
        .tracking(-0.15)
        .cssLineHeight(22, size: 14, weight: .semibold)
        .foregroundStyle(look.ink)
        .padding(16)
        .accessibilityAddTraits(.isHeader)
      Rectangle().fill(look.ink.opacity(0.15)).frame(height: 1)
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(projected.steps.enumerated()), id: \.offset) { _, step in
              HStack(spacing: 4) {
                Group {
                  switch step.state {
                  case .done:
                    Image(systemName: "checkmark.circle").font(.system(size: 13)).foregroundStyle(look.inkTertiary)
                  case .active:
                    ScreenSpinner(color: look.ink, size: 13, period: 1)
                  case .pending:
                    Image(systemName: "circle").font(.system(size: 13)).foregroundStyle(look.inkSecondary)
                  }
                }
                .frame(width: 18, height: 18)
                Text(step.label)
                  .font(.system(size: 13))
                  .tracking(-0.08)
                  .foregroundStyle(look.ink)
              }
              .frame(height: 18)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(step.label + (step.state == .done ? ", completed" : step.state == .active ? ", in progress" : ", not started"))
            }
          }
          HStack(spacing: 8) {
            GeometryReader { box in
              ZStack(alignment: .leading) {
                Capsule().fill(look.ink.opacity(0.15))
                Capsule().fill(look.ink).frame(width: box.size.width * min(max(progress, 0), 1))
              }
              .animation(.easeOut(duration: 0.2), value: progress)
            }
            .frame(height: 6)
            Text("\(Int((progress * 100).rounded()))%")
              .font(.system(size: 13))
              .monospacedDigit()
              .foregroundStyle(look.ink)
          }
          .frame(height: 18)
          .accessibilityElement(children: .combine)
        }
        .padding(16)
      }
      .scrollBounceBehavior(.basedOnSize)
      .frame(maxHeight: 480 - 55 - 57)
      .fixedSize(horizontal: false, vertical: true)
      Rectangle().fill(look.ink.opacity(0.15)).frame(height: 1)
      HStack {
        Spacer(minLength: 0)
        DialogButton(title: RebuildWords.continueInBackground, style: .neutral, focused: true, look: look) {
          store.rebuild.continueInBackground()
        }
      }
      .padding(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 12))
    }
    .frame(width: 520, alignment: .leading)
    .dialogShell(look: look)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(RebuildWords.title(kind))
    .accessibilityAddTraits(.isModal)
    .onChange(of: projected.progress, initial: true) { _, now in furthest[key] = max(furthest[key] ?? 0, now) }
  }
}

// MARK: - The pills at the window's top

/**
 * The pills at the top of the window, 12 down and centred on it (`k8n`,
 * `h8n`): "Reconnecting" while the stream is away (its spinner; "Checking
 * connection" once it is back, "Simeon's computer restarting" while the
 * computer comes up), and a rebuild sent to the background ("Updating
 * Simeon's Computer", its ring and the step under way), which brings its
 * dialog back when clicked. Over everything but the computer's dialogs.
 */
struct ComputerPills: View {
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let driver = store.rebuild
    VStack(spacing: 8) {
      if let kind = driver.lock.kind {
        if kind == .reconnecting {
          let words = RebuildWords.reconnecting(stage: driver.lock.stage, connected: store.isLive)
          ProgressPill(title: words.title, subtitle: words.subtitle, progress: nil, look: look)
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(words.title)
            .accessibilityAddTraits(.updatesFrequently)
        } else if driver.surface.surface == .background, driver.lock.stage != nil {
          let steps = store.rebuildSteps(kind)
          Button { driver.restoreForeground() } label: {
            ProgressPill(title: RebuildWords.title(kind), subtitle: steps.steps.indices.contains(steps.activeIndex) ? steps.steps[steps.activeIndex].label : nil,
                         progress: steps.progress, look: look)
          }
          .buttonStyle(.plain)
          .pointerStyle(.link)
          .accessibilityLabel(RebuildWords.bannerLabel)
        }
      }
    }
    .padding(.top, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

/** A pill (`sand-progress-banner`, padded 8 10, 10 round, a one-point edge): a ring with how far, or a spinner; the title (13/18, 500) and the line under it. */
private struct ProgressPill: View {
  let title: String
  let subtitle: String?
  let progress: Double?
  let look: Look

  var body: some View {
    HStack(spacing: 10) {
      if let progress {
        ZStack {
          Circle().stroke(look.ink.opacity(0.1), lineWidth: 2.75)
          Circle().trim(from: 0, to: max(0, min(1, progress)))
            .stroke(look.primaryFill, style: StrokeStyle(lineWidth: 2.75, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .animation(.easeOut(duration: 0.2), value: progress)
        }
        .frame(width: 16.5, height: 16.5)
        .frame(width: 22, height: 22)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int((progress * 100).rounded()))%")
      } else {
        ScreenSpinner(color: look.ink, size: 26)
      }
      VStack(alignment: .leading, spacing: 0) {
        Text(title)
          .font(.system(size: 13, weight: .medium))
          .cssLineHeight(18, size: 13, weight: .medium)
          .foregroundStyle(look.ink)
        if let subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(.system(size: 13))
            .cssLineHeight(18, size: 13)
            .foregroundStyle(look.inkSecondary)
        }
      }
      .fixedSize()
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
    .shadow(color: look.dark ? .clear : .black.opacity(0.1), radius: 10, x: 0, y: 10)
    .shadow(color: look.dark ? .clear : .black.opacity(0.1), radius: 3, x: 0, y: 4)
  }
}

// MARK: - Low disk

/**
 * Low disk (`D8n`), under the chat's head, 16 in from each side and in
 * the page's flow (the messages start under it): "Computer is low on disk
 * space" (or critically) in orange, what Disk Saver is doing, and Go to
 * Disk Saver ("Opening Disk Saver…" while it opens). On the orange wash,
 * 10 round, a half-point edge.
 */
struct DiskBanner: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var launching = false
  @State private var hovering = false

  var body: some View {
    if let level = store.diskPressure {
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 2) {
          Text(RebuildWords.diskTitle(hard: level == "hard"))
            .font(.system(size: 12))
            .cssLineHeight(16, size: 12)
            .foregroundStyle(look.attentionInk)
          Text(RebuildWords.diskBody)
            .font(.system(size: 13))
            .cssLineHeight(18, size: 13)
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button {
          launching = true
          Task {
            if let id = await store.launchDiskSaver() { window.choose(id, store: store) }
            launching = false
          }
        } label: {
          Text(launching ? RebuildWords.diskOpening : RebuildWords.diskButton)
            .font(.system(size: 12))
            .cssLineHeight(16, size: 12)
            .foregroundStyle(look.onPrimary)
            .padding(.horizontal, 6)
            .frame(height: 24)
            .background(hovering && !launching ? look.primaryFillHover : look.primaryFill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .fixedSize()
        }
        .buttonStyle(.plain)
        .disabled(launching)
        .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
      }
      .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 10))
      .background(look.attentionWash, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 0.5))
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Low disk space")
    }
  }
}

// MARK: - The access notice

/**
 * Whether this account may use Simeon (`Qvn`), 8 over the message field
 * and as wide: the title (12/16) over what to do (12/16, at 60%) and the
 * button in the blue (24 high, a capsule) that opens Simeon Labs' page; on
 * the raised ground, 10 round, a one-point edge. Sending waits under it.
 */
struct AccessNotice: View {
  let words: SandAccess.Words
  let look: Look
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(words.title)
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.ink)
        Text(words.body)
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let action = words.action {
        Button { NSWorkspace.shared.open(SandAccess.page) } label: {
          Text(action)
            .font(.system(size: 12))
            .cssLineHeight(16, size: 12)
            .foregroundStyle(Color(hex: 0xfcfcfc))
            .padding(.horizontal, 8)
            .frame(height: 24)
            .background(hovering ? look.link : look.unread, in: Capsule())
            .contentShape(Capsule())
            .fixedSize()
        }
        .buttonStyle(.plain)
        .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(words.title)
  }
}

// MARK: - The sidebar

/**
 * The sidebar when the agents can't be read (`tpn`): "Can’t reach your
 * computer" (12/16, 500, at 60%, the display glyph) over why, then Retry
 * and Recover computer (26 high, round, on a faint grey); "Retrying…" in
 * Retry's place while it runs. "Your computer isn’t set up" with Retry
 * alone while this account has no Simeon. Recover computer asks first
 * (decision 8; the window resets at once). The sidebar's own words use ’.
 */
struct RosterCard: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window

  var body: some View {
    let driver = store.rebuild
    let blocked = store.accessBlocked
    let canRecover = !blocked && driver.canReset && !driver.isBlocked
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Image(systemName: "display")
          .font(.system(size: 11))
        Text(blocked ? "Your computer isn\u{2019}t set up" : "Can\u{2019}t reach your computer")
          .font(.system(size: 12, weight: .medium))
          .cssLineHeight(16, size: 12, weight: .medium)
      }
      .foregroundStyle(look.inkSecondary)
      Text(blocked
           ? "Simeon can\u{2019}t set up a computer for this account yet. Setup starts automatically once this account has access."
           : "Your agents are safe \u{2014} they just can\u{2019}t be loaded right now." + (canRecover ? " If it doesn\u{2019}t come back on its own, recover it \u{2014} your files and logins are kept." : ""))
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        if store.rosterRetrying {
          HStack(spacing: 6) {
            ScreenSpinner(color: look.ink, size: 12)
            Text("Retrying\u{2026}")
              .font(.system(size: 11))
              .foregroundStyle(look.inkSecondary)
          }
          .frame(height: 26)
        } else {
          SidebarPillButton(title: "Retry", look: look) { Task { await store.retryRoster() } }
        }
        if canRecover {
          let recovering = driver.pendingKind == .reset || driver.lock.kind == .reset
          SidebarPillButton(title: recovering ? "Recovering\u{2026}" : "Recover computer", look: look) {
            window.computerAsk = .recover(fromSidebar: true)
          }
          .disabled(recovering)
        }
      }
      .padding(.top, 2)
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
  }
}

/** The card's buttons: 26 high, a capsule, 12/16 in the ink, a faint grey (darker under the pointer). */
private struct SidebarPillButton: View {
  let title: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(look.ink)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(hovering ? look.fillHover : (look.dark ? Color(red: 56 / 255, green: 56 / 255, blue: 56 / 255).opacity(0.32) : Color(red: 213 / 255, green: 213 / 255, blue: 213 / 255).opacity(0.25)), in: Capsule())
        .contentShape(Capsule())
        .fixedSize()
    }
    .buttonStyle(.plain)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
  }
}

/**
 * "Reconnecting to your computer…" (`npn`) over a list already shown when
 * reading it again fails (decision 7; the window says it only for a list
 * kept from an earlier launch): 28 high across the sidebar, 11/16 at 60%,
 * and a quiet Retry ("Retrying…" while it runs).
 */
struct RosterLine: View {
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 6) {
      Text("Reconnecting to your computer\u{2026}")
        .font(.system(size: 11))
        .cssLineHeight(16, size: 11)
        .foregroundStyle(look.inkSecondary)
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 0)
      Button { Task { await store.retryRoster() } } label: {
        Text(store.rosterRetrying ? "Retrying\u{2026}" : "Retry")
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.inkSecondary)
          .padding(.horizontal, 8)
          .frame(height: 22)
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .disabled(store.rosterRetrying)
    }
    .padding(.horizontal, 12)
    .frame(height: 28)
  }
}

/**
 * The sidebar's Update (`nTn`): a newer computer is out for the open agent
 * (the cloud, "A new version of Simeon's computer is available"), or an
 * update waits for the agents (the clock, "Update queued — click to
 * cancel"). A 24-point disc at the foot's right (decision 1: the window
 * draws it over the initials).
 */
struct ComputerUpdatePill: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var hovering = false

  var body: some View {
    let driver = store.rebuild
    let queued = driver.isUpdateQueued && driver.canUpdate && driver.pendingKind == nil && !driver.isBlocked
    let offered = !queued && store.computerUpdateAvailable && store.computerUpdateOffer != nil
    if queued || offered {
      let label = queued ? "Update queued \u{2014} click to cancel" : "A new version of Simeon's computer is available"
      Button {
        if queued { driver.cancelQueuedUpdate() } else { window.computerAsk = .update }
      } label: {
        Image(systemName: queued ? "clock" : "icloud.and.arrow.down")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(hovering ? look.ink : look.inkSecondary)
          .frame(width: 24, height: 24)
          .background(hovering ? look.rowHover : .clear, in: Circle())
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
      .help(label)
      .accessibilityLabel(label)
    }
  }
}

// MARK: - The access cover

/**
 * The whole window when this account was refused before its computer was
 * ever reached (`mzn`): the sign-in's butterfly and "Simeon", the tagline,
 * then what this account needs (14/20 over 13/18 at 60%) and its button
 * (40 high, the sign-in's black in both themes) to Simeon Labs' page.
 */
struct AccessCover: View {
  let access: SandAccess
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let words = access.cover
    ZStack {
      look.ground
      VStack(spacing: 0) {
        HStack(spacing: 18) {
          ButterflyMark(palette: AgentPalette.named("blue"), size: 64)
          Text("Simeon")
            .font(.custom(Faces.wordmark, size: 68))
            .foregroundStyle(look.ink)
            .fixedSize()
        }
        .frame(height: 64)
        Text(SandAccess.tagline)
          .font(.system(size: 22))
          .foregroundStyle(look.ink)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 336)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 48)
        VStack(spacing: 4) {
          Text(words.title)
            .font(.system(size: 14))
            .cssLineHeight(20, size: 14)
            .foregroundStyle(look.ink)
          Text(words.body)
            .font(.system(size: 13))
            .cssLineHeight(18, size: 13)
            .foregroundStyle(look.inkSecondary)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: 400)
        .padding(.top, 39)
        if let action = words.action {
          Button { NSWorkspace.shared.open(SandAccess.page) } label: {
            Text(action)
              .font(.system(size: 18))
              .foregroundStyle(look.signInLabel)
              .padding(.horizontal, 24)
              .frame(height: 40)
              .background(look.signInButton, in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .padding(.top, 24)
        }
      }
      .offset(y: 40)
    }
    .ignoresSafeArea()
  }
}
