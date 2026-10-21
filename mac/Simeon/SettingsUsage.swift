import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings › Usage & Billing, as the iPhone's Usage page: "Usage", the
 * week's usage (or the trial's) with its bar and when it resets, the
 * on-demand spend, Change Limit, the upgrade line with its button, Cancel
 * Trial when it applies, the refresh failure with Retry; then "Manage Plan",
 * the plan and its line, Upgrade to the plan above, and Manage Billing ↗
 * (Stripe's page, `MacBillingPage`). Read when the page shows unless it was
 * read in the last 30 seconds.
 */
struct SettingsUsagePage: View {
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      if let summary = store.usage.summary {
        TimelineView(.periodic(from: .now, by: 30)) { context in
          UsageGroup(summary: summary, now: context.date, look: look)
        }
        ManagePlanGroup(look: look)
      } else if store.usage.isFailed {
        SettingsGroup(look: look) {
          SettingsLine(label: String(localized: "Couldn’t load usage."), look: look) {
            SettingsPill(title: String(localized: "Retry"), disabled: store.usage.isLoading, look: look) { Task { await store.refreshUsage() } }
          }
        }
      } else {
        SettingsGroup(look: look) {
          SettingsLine(label: String(localized: "Loading usage…"), look: look) { ProgressView().controlSize(.small) }
        }
      }
    }
    .task { await store.loadUsage() }
  }
}

/** "Usage": the meters, Change Limit, then the upgrade line and its button, Cancel Trial, and the refresh failure. */
private struct UsageGroup: View {
  let summary: UsageSummary
  let now: Date
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let meters = UsageMeters(summary, now: now)
    SettingsGroup(title: String(localized: "Usage"), look: look) {
      if let weekly = meters.weekly {
        UsageMeterLine(title: meters.includedUsageTitle, meter: weekly, look: look)
      } else {
        SettingsLine(label: meters.includedUsageTitle, detail: UsageMeters.noIncludedUsage, look: look) { EmptyView() }
      }
      if let onDemand = meters.onDemand {
        UsageMeterLine(title: UsageMeters.onDemandTitle, meter: onDemand, divided: true, look: look)
      }
      SettingsLinkRow(label: String(localized: "Change Limit"), divided: true, external: true, look: look) {
        NSWorkspace.shared.open(meters.upgrade?.url ?? AccountMenu.changeLimitURL)
      }
      if let upgrade = meters.upgrade, let line = meters.upgradeSupportingText {
        SettingsLine(label: line, divided: true, look: look) {
          SettingsPill(title: upgrade.label, primary: true, look: look) { NSWorkspace.shared.open(upgrade.url) }
        }
      }
      if meters.canCancelTrial {
        SettingsActionRow(title: String(localized: "Cancel Trial"), destructive: true, divided: true, look: look) {
          PendingAlert.ask(title: String(localized: "Cancel your trial?"),
                           message: String(localized: "This ends your Simeon trial now and removes your remaining trial credits. Your card won’t be charged either way — the trial never turns into a paid plan on its own."),
                           confirm: String(localized: "Cancel Trial"), cancel: String(localized: "Keep Trial"), destructive: true, pendingTitle: String(localized: "Canceling…")) {
            await store.cancelTrial()
          }
        }
      }
      if store.usage.isFailed {
        SettingsLine(label: String(localized: "Couldn’t refresh usage — showing the last known values."), divided: true, labelTint: look.danger, look: look) {
          SettingsPill(title: String(localized: "Retry"), disabled: store.usage.isLoading, look: look) { Task { await store.refreshUsage() } }
        }
      }
    }
  }
}

/** A meter (the iPhone's): its title and when it resets, the bar in the blue (red past 90%), its value. */
private struct UsageMeterLine: View {
  let title: String
  let meter: UsageMeters.Meter
  var divided = false
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text(title)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let reset = meter.resetLabel {
          Text(reset)
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
        }
      }
      if let percent = meter.barPercent {
        GeometryReader { box in
          ZStack(alignment: .leading) {
            Capsule().fill(look.rowHover)
            Capsule().fill(percent > 90 ? look.danger : look.settingsBlue).frame(width: box.size.width * CGFloat(min(100, max(0, percent)) / 100))
          }
        }
        .frame(height: 6)
        .accessibilityElement()
        .accessibilityLabel("\(title): \(meter.valueLabel)")
        .accessibilityValue("\(Int(percent.rounded()))")
      }
      Text(meter.valueLabel)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
  }
}

/**
 * "Manage Plan" (the iPhone's): "Current plan: Pro" and its line, Upgrade to
 * the plan above in the link blue, then Manage Billing ↗. Each opens
 * Stripe's page in the app and comes back when done (`MacBillingPage`);
 * "Opening…" while it is asked for, the failure under the rows.
 */
private struct ManagePlanGroup: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var opening: String?
  @State private var failure: String?

  var body: some View {
    if let plan = store.usage.summary?.managePlan {
      SettingsGroup(title: String(localized: "Manage Plan"), footer: failure, footerTint: look.danger, look: look) {
        let line = plan.line()
        SettingsLine(label: String(localized: "Current plan: \(plan.planName)"), detail: line.isEmpty ? nil : line, look: look) { EmptyView() }
        if let next = plan.nextTier {
          SettingsActionRow(title: opening == "upgrade" ? String(localized: "Opening…") : String(localized: "Upgrade to \(next.label)"), divided: true, disabled: opening != nil, look: look) {
            open("upgrade", flow: "update_confirm", tier: next.tier)
          }
        }
        SettingsLinkRow(label: opening == "billing" ? String(localized: "Opening…") : String(localized: "Manage Billing"), divided: true, external: true, look: look) {
          open("billing", flow: nil, tier: nil)
        }
      }
    }
  }

  private func open(_ which: String, flow: String?, tier: String?) {
    guard opening == nil else { return }
    opening = which
    failure = nil
    Task {
      failure = await MacBillingPage.shared.open(flow: flow, tier: tier, store: store)
      opening = nil
    }
  }
}
