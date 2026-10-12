import Foundation
import Observation
import StoreKit
import SimeonCore

/**
 * In-app purchase (12 October 2026; server/simeon/plans/app_store.py,
 * docs/services-billing.md §9): the plans as the App Store sells them,
 * Apple's purchase sheet, Restore Purchases, and every signed transaction
 * StoreKit gives, sent to Simeon Labs' server, which checks Apple's
 * signature and starts the plan. A transaction is finished once the server
 * has it (or refused it for good); one it could not reach comes back from
 * StoreKit at the next launch and is sent again.
 *
 * Each purchase carries the Simeon account's id (`appAccountToken`), so the
 * server never applies it to another account.
 *
 * Both StoreKit and SimeonCore have an `AppStore`, so each is named with
 * its module here: `SimeonCore.AppStore` (the app's store) and
 * `StoreKit.AppStore` (Apple's).
 */
@MainActor
@Observable
final class Purchases {
  static let shared = Purchases()

  enum Outcome: Equatable {
    case done
    case cancelled
    case pending
    case failed(String)
  }

  private(set) var plans: ApplePlans?
  private(set) var products: [String: Product] = [:]
  /** The App Store has answered which products it sells (some may be missing: one not created, or not yet approved). */
  private(set) var productsLoaded = false
  private(set) var loading = false
  /** The product being bought, while Apple's sheet and the server work. */
  private(set) var buying: String?
  private(set) var restoring = false
  /** The App Store's country, ISO 3166 alpha-3 ("USA"). */
  private(set) var storefrontCountry: String?

  @ObservationIgnored private weak var store: SimeonCore.AppStore?
  @ObservationIgnored private var updates: Task<Void, Never>?

  /** The web's billing page may be offered beside the App Store's (the United States only). */
  var webLinkAllowed: Bool { ApplePlans.webLinkAllowed(storefrontCountry: storefrontCountry) }

  private init() {}

  /** Signed in: listen for what StoreKit delivers outside a purchase (renewals, Ask to Buy approvals, another device's purchase), and send what this Apple ID already holds. */
  func start(store: SimeonCore.AppStore) {
    self.store = store
    updates?.cancel()
    updates = Task { [weak self] in
      for await result in Transaction.updates {
        guard let self else { return }
        _ = await self.deliver([result])
      }
    }
    Task {
      storefrontCountry = await Storefront.current?.countryCode
      _ = await sendEntitlements()
    }
  }

  func stop() {
    updates?.cancel()
    updates = nil
    store = nil
  }

  /** The plans sheet opening: the server's plans, then their prices from the App Store. */
  func load() async {
    guard let store, !loading else { return }
    loading = true
    defer { loading = false }
    storefrontCountry = await Storefront.current?.countryCode
    guard let plans = await store.applePlans() else { return }
    self.plans = plans
    guard let found = try? await Product.products(for: plans.productIds) else { return }
    products = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    productsLoaded = true
  }

  /**
   * The plans the App Store sells: all of them until it has answered, then
   * only those it returned. Max yearly, for one, is not sold through Apple
   * while its price is above Apple's standard price points
   * (docs/services-billing.md, section 9).
   */
  func sold(_ plans: [ApplePlan]) -> [ApplePlan] {
    productsLoaded ? plans.filter { products[$0.productId] != nil } : plans
  }

  /** Apple's purchase sheet for one plan; the plan starts once Simeon Labs' server has the signed purchase. */
  func buy(_ productId: String) async -> Outcome {
    guard let product = products[productId] else { return .failed(PlansCopy.unavailable) }
    guard buying == nil else { return .cancelled }
    buying = productId
    defer { buying = nil }
    var options: Set<Product.PurchaseOption> = []
    if let id = store?.account?.id, let token = UUID(uuidString: id) {
      options.insert(.appAccountToken(token))
    }
    do {
      switch try await product.purchase(options: options) {
      case .success(let result):
        if let problem = await deliver([result]) { return .failed(problem) }
        Haptics.success()
        return .done
      case .pending:
        return .pending
      case .userCancelled:
        return .cancelled
      @unknown default:
        return .cancelled
      }
    } catch {
      return .failed(error.localizedDescription)
    }
  }

  /** Restore Purchases: Apple's own sync, then every subscription this Apple ID holds, to the server. */
  func restore() async -> Outcome {
    restoring = true
    defer { restoring = false }
    do {
      try await StoreKit.AppStore.sync()
    } catch StoreKitError.userCancelled {
      return .cancelled
    } catch {
      return .failed(error.localizedDescription)
    }
    switch await sendEntitlements() {
    case .none: return .failed(PlansCopy.nothingToRestore)
    case .some(nil): return .done
    case .some(let problem?): return .failed(problem)
    }
  }

  /** What this Apple ID holds now, to the server: nil when it holds nothing, else the server's answer (nil inside when applied). */
  private func sendEntitlements() async -> String?? {
    var results: [VerificationResult<Transaction>] = []
    for await result in Transaction.currentEntitlements where result.unsafePayloadValue.productType == .autoRenewable {
      results.append(result)
    }
    guard !results.isEmpty else { return .none }
    return .some(await deliver(results))
  }

  /** Signed transactions, with their renewal info where StoreKit has it, to the server; finished once it has them. Nil when applied, else what to say. */
  private func deliver(_ results: [VerificationResult<Transaction>]) async -> String? {
    guard let store else { return "Sign in to Simeon to continue" }
    var signed: [String] = []
    var renewals: [String] = []
    for result in results {
      signed.append(result.jwsRepresentation)
      // Whether auto-renew is on, and Apple's billing retry: the server's `cancel_at_period_end` and `past_due`.
      if let status = await result.unsafePayloadValue.subscriptionStatus {
        renewals.append(status.renewalInfo.jwsRepresentation)
      }
    }
    let answer = await store.sendApplePurchases(signed, renewals: renewals)
    if answer.finish {
      for result in results { await result.unsafePayloadValue.finish() }
    }
    return answer.message
  }
}
