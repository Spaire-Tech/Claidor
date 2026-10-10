import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings › Usage & Billing (`Na`, and the patch's Manage Plan card): the
 * week's usage (or the trial's) with its bar and when it resets, the
 * on-demand spend, the upgrade line and Cancel Trial when they apply, the
 * refresh failure with Retry, then Manage Plan (the plan, Upgrade, and
 * Stripe's billing). The summary is read when the page shows unless it was
 * read in the last 30 seconds.
 */
struct SettingsUsagePage: View {
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let summary = store.usage.summary {
        TimelineView(.periodic(from: .now, by: 30)) { context in
          UsageSection(summary: summary, now: context.date, look: look)
        }
        if store.usage.isFailed {
          HStack(spacing: 12) {
            Text("Couldn’t refresh usage — showing the last known values.")
              .font(.system(size: 12))
              .foregroundStyle(look.danger)
              .frame(maxWidth: .infinity, alignment: .leading)
            SettingsButton(title: "Retry", small: true, disabled: store.usage.isLoading, look: look) {
              Task { await store.refreshUsage() }
            }
          }
          .padding(.vertical, 12)
          .padding(.horizontal, 14)
          .padding(.top, 16)
        }
        ManagePlanCard(look: look)
          .padding(.top, 32)
      }
    }
    .task { await store.loadUsage() }
  }
}

/** "Usage" and its card: the meters, then the upgrade line or Cancel Trial alone. */
private struct UsageSection: View {
  let summary: UsageSummary
  let now: Date
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var upgradeFailed: String?

  var body: some View {
    let meters = UsageMeters(summary, now: now)
    SettingsSection(title: "Usage", look: look) {
      if let weekly = meters.weekly {
        UsageMeterRow(title: meters.includedUsageTitle, meter: weekly, look: look)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          Text(meters.includedUsageTitle)
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
          Text(UsageMeters.noIncludedUsage)
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
      }
      if let onDemand = meters.onDemand {
        UsageMeterRow(title: UsageMeters.onDemandTitle, meter: onDemand, look: look)
      }
      if let upgrade = meters.upgrade, let line = meters.upgradeSupportingText {
        HStack(spacing: 12) {
          Text(upgradeFailed ?? line)
            .font(.system(size: 12))
            .foregroundStyle(upgradeFailed == nil ? look.inkSecondary : look.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
          HStack(spacing: 8) {
            if meters.canCancelTrial { CancelTrialButton(look: look) }
            SettingsButton(title: upgrade.label, kind: .accent, small: true, look: look) {
              NSWorkspace.shared.open(upgrade.url)
            }
          }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
      } else if meters.canCancelTrial {
        HStack {
          Spacer(minLength: 0)
          CancelTrialButton(look: look)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
      }
    }
  }
}

/** A meter (`Ge`, 78 high): its title and when it resets, the 4-point bar in the blue, its value. */
private struct UsageMeterRow: View {
  let title: String
  let meter: UsageMeters.Meter
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 12) {
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
            Capsule().fill(look.unread).frame(width: box.size.width * CGFloat(percent / 100))
          }
        }
        .frame(height: 4)
        .accessibilityElement()
        .accessibilityLabel("\(title): \(meter.valueLabel)")
        .accessibilityValue("\(Int(percent.rounded()))")
      }
      Text(meter.valueLabel)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 14)
  }
}

/** Cancel Trial (tertiary, small): its question, "Canceling…" while it goes, the failure kept in it. */
private struct CancelTrialButton: View {
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    SettingsButton(title: "Cancel Trial", kind: .tertiary, small: true, look: look) {
      PendingAlert.ask(title: "Cancel your trial?",
                       message: "This ends your Simeon trial now and removes your remaining trial credits. Your card won’t be charged either way — the trial never turns into a paid plan on its own.",
                       confirm: "Cancel Trial", cancel: "Keep Trial", destructive: true, pendingTitle: "Canceling…") {
        await store.cancelTrial()
      }
    }
  }
}

/**
 * Manage Plan (the patch's `__simeonManagePlan`): "Current plan: Pro" and
 * its line, Upgrade to the plan above, then "Manage billing on Stripe" and
 * Manage Billing ↗. Each opens Stripe's page in the browser; "Opening…"
 * while it is asked for, and the failure under the rows.
 */
private struct ManagePlanCard: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var opening: String?
  @State private var failure: String?

  var body: some View {
    if let plan = store.usage.summary?.managePlan {
      VStack(alignment: .leading, spacing: 10) {
        Text("Manage Plan")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .accessibilityAddTraits(.isHeader)
        VStack(alignment: .leading, spacing: 14) {
          HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
              Text("Current plan: \(plan.planName)")
                .font(.system(size: 13))
                .foregroundStyle(look.ink)
              let line = plan.line()
              if !line.isEmpty {
                Text(line)
                  .font(.system(size: 12))
                  .foregroundStyle(look.inkSecondary)
                  .fixedSize(horizontal: false, vertical: true)
                  .frame(maxWidth: 480, alignment: .leading)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let next = plan.nextTier {
              PlanPill(title: opening == "upgrade" ? "Opening…" : "Upgrade to \(next.label)", strong: true, disabled: opening != nil, look: look) {
                open("upgrade", flow: "update_confirm", tier: next.tier)
              }
            }
          }
          HStack(spacing: 14) {
            Text("Manage billing on Stripe")
              .font(.system(size: 13))
              .foregroundStyle(look.ink)
              .frame(maxWidth: .infinity, alignment: .leading)
            PlanPill(title: opening == "billing" ? "Opening…" : "Manage Billing \u{2197}", strong: false, disabled: opening != nil, look: look) {
              open("billing", flow: nil, tier: nil)
            }
          }
          if let failure {
            Text(failure)
              .font(.system(size: 12))
              .foregroundStyle(look.dark ? Color(hex: 0xff6b63) : Color(hex: 0xc4302b))
          }
        }
        .padding(14)
        .background(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(look.dark ? Color(hex: 0x2a2a2c) : .white)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(look.dark ? Color.white.opacity(0.08) : Color.black.opacity(0.07), lineWidth: 1))
        )
      }
    }
  }

  /** Stripe's page for the plan above (`update_confirm`) or its front page, in the browser. */
  private func open(_ which: String, flow: String?, tier: String?) {
    guard opening == nil else { return }
    opening = which
    failure = nil
    Task {
      let answer = await store.billingPortal(flow: flow, tier: tier)
      if let url = answer.url { NSWorkspace.shared.open(url) } else { failure = answer.message ?? "Couldn’t open billing. Try again." }
      opening = nil
    }
  }
}

/** Manage Plan's pills: 24 high, padded 12, round; the blue with white words, or the quiet grey. At 60% while one is opening. */
private struct PlanPill: View {
  let title: String
  let strong: Bool
  let disabled: Bool
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(strong ? Color.white : look.ink)
        .lineLimit(1)
        .padding(.horizontal, 12)
        .frame(height: 24)
        .background(Capsule().fill(strong ? Color(hex: 0x3c82f6) : Color(red: 120 / 255, green: 120 / 255, blue: 128 / 255).opacity(look.dark ? 0.24 : 0.12)))
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.6 : 1)
  }
}
