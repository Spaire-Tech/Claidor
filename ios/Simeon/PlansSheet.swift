import StoreKit
import SwiftUI
import SimeonCore

/**
 * Choose a plan (the founder, 12 October 2026: as simple as the reference's):
 * the SimeonLabs mark, a title and one line; the three plans as one list,
 * each its name and the App Store's monthly price in the person's currency,
 * a tick on the chosen one; the chosen price over Subscribe; Restore
 * Purchases; the one sentence Apple asks for, then the Terms and the
 * Privacy Policy, and in the United States the web's billing page as well.
 * Monthly only, no free week (the free month starts at the first sign-in).
 * It closes once the plan has started. When an Apple plan's payment failed
 * (14 October 2026: the banner's button opens the plans on the iPhone, the
 * founder's choice), a line over the plans says so, with Apple's own page
 * for the payment method.
 */
struct PlansSheet: View {
  /** Open on this plan (an upgrade's), else Pro. */
  var preselect: String? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(AppStore.self) private var store
  @State private var purchases = Purchases.shared
  @State private var tier = "pro"
  @State private var problem: String?
  @State private var note: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 0) {
          VStack(spacing: 14) {
            Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 52, height: 52)
              .foregroundStyle(Ink.primary)
              .accessibilityHidden(true)
            Text(PlansCopy.title)
              .font(.system(size: 26, weight: .bold))
              .foregroundStyle(Ink.primary)
            Text(PlansCopy.subtitle)
              .font(.system(size: 16))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
          }
          .padding(.top, 12)

          if PhoneUpgrade.applePaymentFailed(store.usage.summary) {
            // Apple is retrying the plan's payment: the card is mended at Apple, not by a second plan.
            VStack(alignment: .leading, spacing: 6) {
              Text(PhoneUpgrade.paymentFailedTitle).font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
              Text(PhoneUpgrade.paymentFailedApple).font(.system(size: 14)).foregroundStyle(Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
              Button { openURL(PhoneUpgrade.appleBilling) } label: {
                Text(PhoneUpgrade.updatePayment).font(.system(size: 15, weight: .medium))
              }
              .foregroundStyle(Ink.link)
              .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.groupedRow))
            .padding(.top, 24)
          }

          if let plans = purchases.plans {
            let sold = purchases.sold(plans.plans(yearly: false))
            VStack(spacing: 0) {
              ForEach(Array(sold.enumerated()), id: \.element.id) { index, plan in
                PlanRow(plan: plan, product: purchases.products[plan.productId], selected: plan.tier == tier) { tier = plan.tier }
                if index < sold.count - 1 { Divider().padding(.leading, 18) }
              }
            }
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Ink.groupedRow))
            .padding(.top, 32)
            subscribe(plans)
              .padding(.top, 36)
          } else if purchases.loading {
            ProgressView().padding(.vertical, 60)
          } else {
            Text(PlansCopy.unavailable)
              .font(.system(size: 15))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
              .padding(.top, 40)
            Button("Try Again") { Task { await purchases.load() } }
              .foregroundStyle(Ink.link)
              .padding(.top, 12)
          }

          Button {
            Task { await restore() }
          } label: {
            Text(purchases.restoring ? "Restoring…" : PlansCopy.restore).font(.system(size: 16, weight: .medium))
          }
          .foregroundStyle(Ink.secondary)
          .disabled(purchases.restoring || purchases.buying != nil)
          .padding(.top, 18)

          Text(PlansCopy.renewal)
            .font(.system(size: 13))
            .foregroundStyle(Ink.tertiary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 22)
          HStack(spacing: 18) {
            Link("Terms of Service", destination: PlansCopy.termsURL)
            Link("Privacy Policy", destination: PlansCopy.privacyURL)
          }
          .font(.system(size: 13))
          .foregroundStyle(Ink.secondary)
          .padding(.top, 12)
          // Only where Apple allows pointing to another way to pay (ApplePlans.webLinkAllowed).
          if purchases.webLinkAllowed, let web = purchases.plans?.webSubscribeURL {
            Button { openURL(web) } label: { Text(PlansCopy.webLink).font(.system(size: 13)) }
              .foregroundStyle(Ink.link)
              .padding(.top, 10)
          }
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

  /** The chosen plan's price, then Subscribe. */
  @ViewBuilder
  private func subscribe(_ plans: ApplePlans) -> some View {
    let plan = plans.plan(tier: tier, yearly: false)
    let product = plan.flatMap { purchases.products[$0.productId] }
    VStack(spacing: 12) {
      Text(product.map { PlansCopy.price($0.displayPrice) } ?? " ")
        .font(.system(size: 16))
        .foregroundStyle(Ink.secondary)
      Button {
        guard let plan else { return }
        Task { await buy(plan.productId) }
      } label: {
        HStack(spacing: 8) {
          if purchases.buying != nil { ProgressView().tint(Ink.ground) }
          Text(PlansCopy.subscribe).font(.system(size: 17, weight: .semibold))
        }
        .foregroundStyle(Ink.ground)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
      }
      .buttonStyle(.glassProminent)
      .tint(Ink.primary)
      .disabled(product == nil || purchases.buying != nil || purchases.restoring)
    }
  }

  /** A plan the App Store doesn't sell is not left chosen: Pro, else the first it sells. */
  private func keepTierSold() {
    guard let plans = purchases.plans else { return }
    let sold = purchases.sold(plans.plans(yearly: false))
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

/** One plan: its name over the App Store's monthly price, a tick when chosen. */
private struct PlanRow: View {
  let plan: ApplePlan
  let product: Product?
  let selected: Bool
  let choose: () -> Void

  var body: some View {
    Button(action: choose) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(plan.name).font(.system(size: 18, weight: .medium)).foregroundStyle(Ink.primary)
          if let product {
            Text(PlansCopy.price(product.displayPrice)).font(.system(size: 15)).foregroundStyle(Ink.secondary)
          } else {
            Text(" ").font(.system(size: 15))
          }
        }
        Spacer(minLength: 8)
        if selected {
          Image(systemName: "checkmark")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Ink.link)
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 14)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
