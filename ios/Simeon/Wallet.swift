import SimeonCore
import SwiftUI

/**
 * Wallet (the founder, 18 October 2026, with Muse's for reference: "wallet
 * is just another connectors page basically. but link and shop"): what the
 * agents pay with when they buy something for the person. As plain as
 * Permissions (the founder, 19 October 2026): "Wallet" in the bar, then
 * Link by Stripe and Shop Pay, named as the purchase card names them. One
 * that is connected opens its page (PluginPage), as on Connectors; one that
 * is not says Add, which asks first as every connect does (PluginAddButton)
 * and then opens its sign-in.
 */
struct WalletPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  /** What Connectors knows and does (ConnectAppsModel), for Add and the apps' pages. */
  @State private var model = ConnectAppsModel()

  /** The two wallets: the catalogue's id, and the name the page gives it. */
  static let wallets: [(id: String, name: String)] = [("link", "Link by Stripe"), ("shop", "Shop Pay")]

  var body: some View {
    Form {
      Section {
        ForEach(Self.wallets, id: \.id) { wallet in WalletRow(id: wallet.id, name: wallet.name) }
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Wallet")
    .inlineBarTitle()
    .overlay(alignment: .bottom) { PluginNoticeBar().animation(.easeOut(duration: 0.2), value: model.notice) }
    .task {
      model.store = store
      await store.loadApps()
      await model.load()
    }
    .environment(model)
  }
}

/** One wallet: its icon and name; connected, the row opens its page; else Add at the right (a spinner while it connects). */
struct WalletRow: View {
  let id: String
  let name: String
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let catalogApp = store.catalog.first { $0.id == id }
    // The name Connect knows the app by (the catalogue's title, "Link"), not the one the row shows.
    let title = catalogApp?.title ?? name
    let app = store.appsOnce.first { $0.pluginId == id || $0.name.lowercased() == title.lowercased() }
    if let app, store.isConnected(title) {
      NavigationLink { PluginPage(app: app).environment(model) } label: { label }
    } else {
      HStack(spacing: 8) {
        label
        Spacer(minLength: 4)
        if connector.connecting == title {
          ProgressView()
        } else {
          PluginAddButton(name: title, catalogApp: catalogApp, entryId: id) {
            Text("Add").font(.system(size: 17)).foregroundStyle(Ink.link)
          }
          .accessibilityLabel("Add \(name)")
        }
      }
    }
  }

  private var label: some View {
    HStack(spacing: 14) {
      ConnectorTile(name: name, size: 30, logo: ConnectorLogo.fill, id: id)
      Text(name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
    }
    .padding(.vertical, 2)
  }
}
