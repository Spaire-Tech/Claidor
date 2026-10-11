import StoreKit
import SwiftUI
import SimeonCore

/**
 * Choose your plan (12 October 2026): the web's three plans as the App Store
 * sells them, monthly or yearly, with the App Store's prices in the
 * person's currency, the free week when Apple still offers it to this Apple
 * ID, Apple's purchase sheet, Restore Purchases, the terms Apple asks to be
 * shown (price, period, auto-renewal, how to cancel, the Terms and the
 * Privacy Policy), and in the United States the web's billing page as well.
 * It closes once the plan has started.
 */
struct PlansSheet: View {
  /** Open on this plan (an upgrade's), else Pro. */
  var preselect: String? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var purchases = Purchases.shared
  @State private var yearly = false
  @State private var tier = "pro"
  @State private var problem: String?
  @State private var note: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 22) {
          VStack(spacing: 8) {
            Text(PlansCopy.title)
              .font(.system(size: 28, weight: .bold))
              .foregroundStyle(Ink.primary)
            Text(PlansCopy.subtitle)
              .font(.system(size: 15))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(.top, 8)

          Picker("Billing", selection: $yearly) {
            Text(PlansCopy.monthly).tag(false)
            Text(PlansCopy.yearly).tag(true)
          }
          .pickerStyle(.segmented)

          if let plans = purchases.plans {
            VStack(spacing: 10) {
              ForEach(purchases.sold(plans.plans(yearly: yearly))) { plan in
                PlanRow(plan: plan, product: purchases.products[plan.productId], selected: plan.tier == tier) { tier = plan.tier }
              }
            }
            subscribe(plans)
          } else if purchases.loading {
            ProgressView().padding(.vertical, 40)
          } else {
            Text(PlansCopy.unavailable)
              .font(.system(size: 15))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
              .padding(.vertical, 24)
            Button("Try Again") { Task { await purchases.load() } }
              .foregroundStyle(Ink.link)
          }

          VStack(spacing: 14) {
            Button {
              Task { await restore() }
            } label: {
              Text(purchases.restoring ? "Restoring…" : PlansCopy.restore).font(.system(size: 15))
            }
            .foregroundStyle(Ink.link)
            .disabled(purchases.restoring || purchases.buying != nil)
            // Only where Apple allows pointing to another way to pay (ApplePlans.webLinkAllowed).
            if purchases.webLinkAllowed, let web = purchases.plans?.webSubscribeURL {
              Button { openURL(web) } label: { Text(PlansCopy.webLink).font(.system(size: 15)) }
                .foregroundStyle(Ink.link)
            }
            HStack(spacing: 18) {
              Link("Terms of Service", destination: PlansCopy.terms)
              Link("Privacy Policy", destination: PlansCopy.privacy)
            }
            .font(.system(size: 13))
            .foregroundStyle(Ink.tertiary)
          }
          .padding(.top, 4)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
      }
      .background(Ink.groupedGround)
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .task {
        if let preselect { tier = preselect }
        await purchases.load()
        keepTierSold()
      }
      .onChange(of: yearly) { _, _ in keepTierSold() }
      .alert("Couldn’t complete the purchase", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(problem ?? "")
      }
      .alert(note ?? "", isPresented: Binding(get: { note != nil }, set: { if !$0 { note = nil } })) {
        Button("OK", role: .cancel) {}
      }
    }
  }

  @ViewBuilder
  private func subscribe(_ plans: ApplePlans) -> some View {
    let plan = plans.plan(tier: tier, yearly: yearly)
    let product = plan.flatMap { purchases.products[$0.productId] }
    VStack(spacing: 12) {
      Button {
        guard let plan else { return }
        Task { await buy(plan.productId) }
      } label: {
        HStack(spacing: 8) {
          if purchases.buying != nil { ProgressView().tint(Ink.ground) }
          Text(purchases.freeWeek ? PlansCopy.startFreeWeek : PlansCopy.subscribe)
            .font(.system(size: 17, weight: .semibold))
        }
        .foregroundStyle(Ink.ground)
        .frame(maxWidth: .infinity)
        .frame(height: 50)
      }
      .buttonStyle(.glassProminent)
      .tint(Ink.primary)
      .disabled(product == nil || purchases.buying != nil || purchases.restoring)
      if let product {
        Text(PlansCopy.terms(price: product.displayPrice, yearly: yearly, freeWeek: purchases.freeWeek))
          .font(.system(size: 12))
          .foregroundStyle(Ink.tertiary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  /** A plan the App Store doesn't sell in this interval (Max yearly) is not left chosen: Pro, else the first it sells. */
  private func keepTierSold() {
    guard let plans = purchases.plans else { return }
    let sold = purchases.sold(plans.plans(yearly: yearly))
    guard !sold.contains(where: { $0.tier == tier }) else { return }
    tier = sold.first(where: { $0.tier == "pro" })?.tier ?? sold.first?.tier ?? tier
  }

  private func buy(_ productId: String) async {
    switch await purchases.buy(productId) {
    case .done: dismiss()
    case .cancelled: break
    case .pending: note = PlansCopy.pending
    case .failed(let message): problem = message
    }
  }

  private func restore() async {
    switch await purchases.restore() {
    case .done: dismiss()
    case .cancelled: break
    case .pending: note = PlansCopy.pending
    case .failed(let message): problem = message
    }
  }
}

/** One plan: its name and credits on the left, the App Store's price on the right, a ring when chosen. */
private struct PlanRow: View {
  let plan: ApplePlan
  let product: Product?
  let selected: Bool
  let choose: () -> Void

  var body: some View {
    Button(action: choose) {
      HStack(spacing: 14) {
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 22))
          .foregroundStyle(selected ? Ink.link : Ink.tertiary)
        VStack(alignment: .leading, spacing: 3) {
          Text(plan.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
          Text(PlansCopy.credits(plan.weeklyCredits)).font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
        Spacer(minLength: 8)
        if let product {
          Text(PlansCopy.price(product.displayPrice, yearly: plan.yearly))
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Ink.primary)
        } else {
          ProgressView()
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.groupedRow))
      .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(selected ? Ink.link : .clear, lineWidth: 2))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
