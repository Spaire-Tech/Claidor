import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings (⌘,), in the Mac's Settings window: the Electron window's
 * General and Usage & Billing (`settings/overlay/panels.tsx`), with the
 * iPhone's rows. General: the account, the appearance, the agents' settings
 * (Auto-review and its rules, the time zone), Sign Out. Usage & Billing: the
 * period's bar, when it resets, the plan, Change Limit.
 */
struct MacSettings: View {
  var body: some View {
    TabView {
      Tab("General", systemImage: "gearshape") { MacGeneralSettings() }
      Tab("Usage & Billing", systemImage: "chart.bar") { MacUsageSettings() }
    }
    .frame(width: 560, height: 520)
  }
}

struct MacGeneralSettings: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @AppStorage("simeon.theme") private var theme = "system"
  @State private var settings: JSON?
  @State private var copied = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          HStack(spacing: 12) {
            ZStack {
              Circle().fill(Ink.bubbleTheirs)
              if let initials = store.account?.initials, !initials.isEmpty {
                Text(initials).font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
              } else {
                Image(systemName: "person.fill").foregroundStyle(Ink.primary)
              }
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
              Text(store.account?.name ?? "").font(.system(size: 13, weight: .semibold))
              Text(store.account?.email ?? "").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Spacer()
            Button(copied ? "Copied" : "Copy Email") {
              UIPasteboard.general.string = store.account?.email
              copied = true
            }
            .disabled(store.account?.email.isEmpty ?? true)
          }
          Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
        }
        Section("Appearance") {
          Picker("Theme", selection: $theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          .pickerStyle(.segmented)
        }
        AgentSettingsSection(settings: $settings)
        Section {
          HStack {
            Spacer()
            VStack(spacing: 6) {
              ButterflyView(palette: .named("blue")).frame(width: 40, height: 40)
              Text("Simeon").font(.system(size: 13, weight: .semibold))
              Text(SessionController.clientVersion).font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            Spacer()
          }
        }
      }
      .formStyle(.grouped)
      .task { settings = await store.hostSettings() }
    }
  }
}

struct MacUsageSettings: View {
  @Environment(AppStore.self) private var store
  @State private var quota: JSON?

  var body: some View {
    NavigationStack {
      UsagePage(quota: quota)
        .formStyle(.grouped)
        .task { quota = await store.quota() }
    }
  }
}
