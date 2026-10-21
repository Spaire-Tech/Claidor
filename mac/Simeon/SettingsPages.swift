import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

// MARK: - Wallet

/**
 * Wallet (the iPhone's WalletPage: "wallet is just another connectors page
 * basically. but link and shop"; laid out as the founder's reference, 21
 * October 2026): what it is for in a line, then "Payment methods", Link by
 * Stripe and Shop Pay, each its app's icon (32) and its name, as the
 * purchase card names them. A row opens the app's page in Connectors, where
 * it is added and signed in as every app is; connected, the row says so in
 * green, else Add in the link blue.
 */
struct SettingsWalletPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings

  /** The two wallets: the catalogue's id, and the name the page gives it. */
  static let wallets: [(id: String, name: String)] = [("link", "Link by Stripe"), ("shop", "Shop Pay")]

  var body: some View {
    VStack(alignment: .leading, spacing: 28) {
      Text("Add a way to pay so your agents can make secure purchases for you. Each purchase waits for your approval.")
        .font(.system(size: 15))
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      SettingsGroup(title: String(localized: "Payment methods"), look: look) {
        ForEach(Self.wallets.indices, id: \.self) { index in
          let wallet = Self.wallets[index]
          WalletLine(id: wallet.id, name: wallet.name, divided: index > 0, look: look) { settings.openConnectors(plugin: wallet.id) }
        }
      }
    }
    .task { await store.loadApps() }
  }
}

private struct WalletLine: View {
  let id: String
  let name: String
  let divided: Bool
  let look: Look
  let open: () -> Void
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    // The name Connect knows the app by (the catalogue's title, "Link"), not the one the row shows.
    let title = store.catalog.first { $0.id == id }?.title ?? name
    let connected = store.isConnected(title)
    Button(action: open) {
      HStack(spacing: 14) {
        AppLogoTile(name: title, look: look, side: 32, id: id)
        Text(name)
          .font(.system(size: 15))
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Spacer(minLength: 8)
        if connected {
          HStack(spacing: 4) {
            Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold))
            Text("Connected").font(.system(size: 15))
          }
          .foregroundStyle(look.settingsGreen)
          Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
        } else {
          Text("Add")
            .font(.system(size: 15))
            .foregroundStyle(look.settingsAction)
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .frame(minHeight: 56)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel(connected ? "\(name), connected" : "Add \(name)")
  }
}

// MARK: - Computer

/**
 * Computer (the founder, 21 October 2026: "a computer tab, your computer -
 * agent's computer"). The agents' computer: how it is now (connected,
 * being updated or recovered, out of reach), Update Simeon's Computer when
 * one is offered (or queued, with Cancel), and Recover Simeon's Computer;
 * each asks first with the computer's own dialog, over Settings. Your
 * computer: how the agents may use this Mac (Execution on Local Computer,
 * with the team's ceiling), hardware security keys, and forgetting the
 * commands allowed once.
 */
struct SettingsComputerPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var model = GeneralSettingsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 28) {
      AgentsComputerGroup(look: look) { window.computerAsk = $0 }
      YourComputerGroup(model: model, look: look)
    }
    .task { await model.load(store: store) }
  }
}

private struct AgentsComputerGroup: View {
  let look: Look
  let ask: (ComputerAsk) -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let rebuild = store.rebuild
    let busy = rebuild.lock.isLocked || rebuild.pendingKind != nil
    SettingsGroup(title: String(localized: "Agents' Computer"), footer: rebuild.error ?? RebuildWords.recoverBody, footerTint: rebuild.error == nil ? nil : look.danger, look: look) {
      SettingsLine(label: String(localized: "Simeon's Computer"), detail: String(localized: "The computer in the cloud all your agents work on."), symbol: "cloud", look: look) {
        status
      }
      if rebuild.isUpdateQueued {
        SettingsLine(label: String(localized: "Update queued"), detail: String(localized: "It updates once your agents are done."), divided: true, look: look) {
          SettingsPill(title: String(localized: "Cancel"), look: look) { rebuild.cancelQueuedUpdate() }
        }
      } else if store.computerUpdateOffer != nil {
        SettingsLine(label: store.computerUpdateAvailable ? String(localized: "A new version is available") : String(localized: "Update Simeon's Computer"),
                     detail: String(localized: "Their files and logins are kept."), divided: true, look: look) {
          SettingsPill(title: String(localized: "Update"), primary: store.computerUpdateAvailable, disabled: busy, look: look) { ask(.update) }
        }
      } else {
        SettingsLine(label: String(localized: "Version"), divided: true, look: look) {
          if store.computerUpdateAvailable {
            Text("A new version is available").font(.system(size: 15)).foregroundStyle(look.settingsAction)
          } else {
            HStack(spacing: 4) {
              Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold))
              Text("Up to date").font(.system(size: 15))
            }
            .foregroundStyle(look.settingsGreen)
          }
        }
      }
      SettingsActionRow(title: RebuildWords.recoverButton, divided: true, disabled: busy || !rebuild.canRecover, look: look) { ask(.recover(fromSidebar: false)) }
    }
  }

  @ViewBuilder
  private var status: some View {
    let rebuild = store.rebuild
    if let kind = rebuild.lock.kind ?? rebuild.pendingKind {
      HStack(spacing: 6) {
        ProgressView().controlSize(.small)
        Text(RebuildWords.title(kind)).font(.system(size: 15)).foregroundStyle(look.inkSecondary).lineLimit(1)
      }
    } else if unreachable {
      Text("Can't reach it").font(.system(size: 15)).foregroundStyle(look.danger)
    } else if store.isLive {
      HStack(spacing: 6) {
        Circle().fill(look.working).frame(width: 8, height: 8)
        Text("Connected").font(.system(size: 15)).foregroundStyle(look.inkSecondary)
      }
    } else {
      HStack(spacing: 6) {
        ProgressView().controlSize(.small)
        Text("Connecting…").font(.system(size: 15)).foregroundStyle(look.inkSecondary)
      }
    }
  }

  /** Out of reach: the roster could not be read, or two minutes without the connection (`escalation`). */
  private var unreachable: Bool {
    if store.rosterFailed { return true }
    if case .unreachable? = store.rebuild.escalation { return true }
    return false
  }
}

private struct YourComputerGroup: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @AppStorage(SecurityKeySetting.key) private var securityKeys = true
  @State private var keysPending = false
  @State private var forgot = false

  var body: some View {
    var hints = [LocalToolPermission.explanation]
    if let ceiling = model.ceiling { hints.append(LocalToolPermission.ceilingLine(ceiling)) }
    return SettingsGroup(title: String(localized: "Your Computer"), look: look) {
      SettingsMenu(label: LocalToolPermission.title, detail: hints.joined(separator: " "),
                   options: LocalToolPermission.choices.map { (value: $0, label: $0.label) },
                   disabled: Set(LocalToolPermission.choices.filter { $0.isAbove(model.ceiling) }),
                   value: model.permission, pending: model.permissionPending, look: look) { model.setPermission($0, store: store) }
      SettingsSwitch(label: String(localized: "Use hardware security keys"),
                     detail: String(localized: "Allow Simeon to use a security key (such as a YubiKey) connected to your computer. You’ll be asked to approve each use."),
                     divided: true, isOn: Binding(get: { securityKeys }, set: { setKeys($0) }), disabled: keysPending, look: look)
      SettingsLine(label: String(localized: "Commands Allowed Once"), detail: String(localized: "Forgotten, each is asked about again the next time an agent needs it."), divided: true, look: look) {
        SettingsPill(title: forgot ? String(localized: "Forgotten") : String(localized: "Forget"), disabled: forgot, look: look) {
          MacLocalPermission.approvals.clear()
          forgot = true
        }
      }
    }
  }

  /** Kept here, then the computer told (`webauthnProxyEnabled`) until it says it has it, the switch greyed meanwhile. */
  private func setKeys(_ next: Bool) {
    guard !keysPending else { return }
    securityKeys = next
    keysPending = true
    Task {
      _ = await store.pushHostSetting("webauthnProxyEnabled", .bool(next))
      keysPending = false
    }
  }
}

// MARK: - Updates

/**
 * Updates (the founder, 21 October 2026: "an update tab for when updates are
 * available"): this Mac's Simeon, its version and whether a newer one is
 * out (Sparkle asks the feed quietly as the page opens; a dot beside
 * Updates in the list while one waits), Update Now, which Sparkle installs
 * and relaunches, and its automatic checks; then the agents' computer, with
 * its own update, on Computer.
 */
struct SettingsUpdatesPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @State private var updates = MacUpdates.shared

  var body: some View {
    let version = SettingsVersion.current
    VStack(alignment: .leading, spacing: 28) {
      SettingsGroup(title: String(localized: "Simeon for Mac"),
                    footer: updates.available ? nil : String(localized: "This build doesn't update itself. Released builds of Simeon check for updates on their own."),
                    look: look) {
        SettingsLine(label: AboutSimeon.versionLine(version), detail: checkedLine, look: look) {
          if updates.checking {
            HStack(spacing: 6) {
              ProgressView().controlSize(.small)
              Text("Checking…").font(.system(size: 15)).foregroundStyle(look.inkSecondary)
            }
          } else if updates.found == nil {
            SettingsPill(title: String(localized: "Check Now"), disabled: !updates.available, look: look) { updates.lookQuietly() }
          }
        }
        if let found = updates.found {
          SettingsLine(label: String(localized: "Simeon \(found) is available"), detail: String(localized: "Simeon relaunches to finish installing it."), divided: true, look: look) {
            SettingsPill(title: String(localized: "Update Now"), primary: true, look: look) { updates.checkForUpdates() }
          }
        }
        if updates.available {
          SettingsSwitch(label: String(localized: "Check for Updates Automatically"), divided: true,
                         isOn: Binding(get: { updates.automaticallyChecks }, set: { updates.automaticallyChecks = $0 }), look: look)
          SettingsSwitch(label: String(localized: "Download Updates Automatically"), divided: true,
                         isOn: Binding(get: { updates.automaticallyDownloads }, set: { updates.automaticallyDownloads = $0 }),
                         disabled: !updates.automaticallyChecks, look: look)
        }
      }
      SettingsGroup(title: String(localized: "Agents' Computer"), look: look) {
        SettingsLinkRow(label: String(localized: "Simeon's Computer"),
                        value: store.computerUpdateAvailable ? String(localized: "A new version is available") : nil, look: look) { settings.page = .computer }
      }
    }
    .task { updates.lookQuietly() }
  }

  /** "Simeon is up to date" once a check found nothing, and when it last looked. */
  private var checkedLine: String? {
    var parts: [String] = []
    if updates.upToDate { parts.append(String(localized: "Simeon is up to date.")) }
    if let date = updates.lastChecked {
      let words = RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
      parts.append(String(localized: "Last checked \(words)."))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " ")
  }
}
