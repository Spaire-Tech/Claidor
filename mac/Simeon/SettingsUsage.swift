import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings › Usage & Billing, as the founder's reference has its usage
 * (21 October 2026): "Usage", the week's usage (or the trial's) with what
 * is used at the right, when it resets under it and its bar across the
 * card, the on-demand spend the same way, then Choose a plan in the link
 * blue for a person with no plan (its line under the card), Cancel Trial
 * when it applies, the refresh failure with Retry; then "Plan", the plan
 * and its line, Upgrade to the plan above, Add Credits and Manage Billing ↗
 * (Stripe's page, `MacBillingPage`). Read when the page shows unless it
 * was read in the last 30 seconds.
 *
 * Get more usage and Change Limit went (28 October 2026, the founder:
 * "whats the dif between the two?"): both opened the web's billing page,
 * which told a person with a plan they were all set. With a plan, the
 * Plan group's rows say what each does.
 */
struct SettingsUsagePage: View {
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
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

/** "Usage": the meters, Choose a plan (no plan), Cancel Trial, and the refresh failure. */
private struct UsageGroup: View {
  let summary: UsageSummary
  let now: Date
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let meters = UsageMeters(summary, now: now)
    // With a plan, the Plan group below holds the upgrade, the credits and billing; with none (the free month too), Choose a plan.
    let upgrade = summary.managePlan == nil ? meters.upgrade ?? UsageSummary.UpgradeButton(label: L10n.text("Choose a plan"), url: MacUpgrade.billing) : nil
    SettingsGroup(title: String(localized: "Usage"), footer: upgrade == nil ? nil : meters.upgradeSupportingText, look: look) {
      if let weekly = meters.weekly {
        UsageMeterLine(title: meters.includedUsageTitle, meter: weekly, look: look)
      } else {
        SettingsLine(label: meters.includedUsageTitle, detail: UsageMeters.noIncludedUsage, look: look) { EmptyView() }
      }
      if let onDemand = meters.onDemand {
        UsageMeterLine(title: UsageMeters.onDemandTitle, meter: onDemand, divided: true, look: look)
      }
      // Extra credits bought on the web, used after the week's (27 October 2026).
      if let extra = meters.extraCredits {
        SettingsLine(label: UsageMeters.extraCreditsTitle, detail: nil, divided: true, look: look) {
          Text(extra).font(PanelType.row).foregroundStyle(look.inkSecondary).monospacedDigit()
        }
      }
      if let upgrade {
        SettingsActionRow(title: upgrade.label, divided: true, look: look) { NSWorkspace.shared.open(upgrade.url) }
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

/** A meter, the reference's: its title with what is used at the right (grey), when it resets under it (grey), then its bar across (5, the blue; red past 90%). */
private struct UsageMeterLine: View {
  let title: String
  let meter: UsageMeters.Meter
  var divided = false
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(title)
            .font(PanelType.row)
            .foregroundStyle(look.ink)
          if let reset = meter.resetLabel {
            Text(reset)
              .font(PanelType.detail)
              .foregroundStyle(look.inkSecondary)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Text(meter.valueLabel)
          .font(PanelType.row)
          .foregroundStyle(look.inkSecondary)
          .monospacedDigit()
      }
      if let percent = meter.barPercent {
        GeometryReader { box in
          ZStack(alignment: .leading) {
            Capsule().fill(look.ink.opacity(look.dark ? 0.14 : 0.08))
            Capsule().fill(percent > 90 ? look.danger : look.settingsAction).frame(width: max(5, box.size.width * CGFloat(min(100, max(0, percent)) / 100)))
          }
        }
        .frame(height: 5)
        .accessibilityElement()
        .accessibilityLabel("\(title): \(meter.valueLabel)")
        .accessibilityValue("\(Int(percent.rounded()))")
      }
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, SettingsRowSize.vertical)
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
      SettingsGroup(title: String(localized: "Plan"), footer: failure, footerTint: look.danger, look: look) {
        let line = plan.line()
        SettingsLine(label: String(localized: "Current plan: \(plan.planName)"), detail: line.isEmpty ? nil : line, look: look) { EmptyView() }
        let web = store.usage.summary?.billedByApple != true
        // A card trial starts its plan today; a paid plan adds extra credits (27 October 2026).
        if web && plan.status == "trialing" {
          SettingsActionRow(title: opening == "start" ? String(localized: "Opening…") : String(localized: "Start Plan Now"), divided: true, disabled: opening != nil, look: look) {
            open("start", flow: PhoneUpgrade.startNowFlow, tier: nil)
          }
        }
        if let next = plan.nextTier {
          SettingsActionRow(title: opening == "upgrade" ? String(localized: "Opening…") : String(localized: "Upgrade to \(next.label)"), divided: true, disabled: opening != nil, look: look) {
            open("upgrade", flow: "update_confirm", tier: next.tier)
          }
        }
        if web && plan.status != "trialing" {
          SettingsActionRow(title: opening == "credits" ? String(localized: "Opening…") : String(localized: "Add Credits"), divided: true, disabled: opening != nil, look: look) {
            open("credits", flow: PhoneUpgrade.creditsFlow, tier: nil)
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
