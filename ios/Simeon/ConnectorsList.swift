import SimeonCore
import SwiftUI

/*
 * Connectors as the founder's reference has them (14 October 2026: ChatGPT's
 * Plugins, "this is how i need you to design connectors in mobile. full
 * logo"): Apple's own bar (the round Back, the title in the middle with its
 * menu, the filter), each app with its own icon, its name and one line, and
 * + at the right; each category's name with › over its first apps, opening
 * all of them on a page of their own; the search floating at the bottom.
 */

/** How many of a category's apps Connectors shows under its name; the name opens the rest. */
enum ConnectorsPreview {
  static let count = 4
}

/** The catalog's sections as the search and the Mac's filter keep them (Featured first, the rest A to Z). */
@MainActor
func connectorSections(_ catalog: [CatalogApp], query: String, model: ConnectAppsModel) -> [AppSections.Section] {
  let all = AppSections.make(catalog, query: query)
  let filter = model.marketplaceFilter
  guard !filter.isAll else { return all }
  // The Mac's filter (`nt`) on each app's catalog entry; an app the box's catalog does not list is kept by All alone.
  return all.compactMap { section in
    let apps = section.apps.filter { app in model.entry(app.id).map { Plugins.keeps($0, filter) } ?? false }
    return apps.isEmpty ? nil : AppSections.Section(title: section.title, apps: apps)
  }
}

/** A category's name with its chevron (17 semibold, the secondary grey), opening all its apps; 26 over it, 6 under. */
struct ConnectorsSectionLink: View {
  let title: String

  var body: some View {
    NavigationLink { ConnectorCategoryPage(title: title) } label: {
      HStack(spacing: 5) {
        Text(title).font(.system(size: 17, weight: .semibold))
        Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold))
      }
      .foregroundStyle(Ink.secondary)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .padding(.top, 26)
    .padding(.bottom, 6)
    .accessibilityAddTraits(.isHeader)
    .accessibilityHint("Shows every app in \(title)")
  }
}

/** A section's name without a page of its own (Yours' Installed and Private): as a category's, without the chevron. */
struct ConnectorsSectionTitle<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack {
      Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.secondary).accessibilityAddTraits(.isHeader)
      Spacer()
      trailing().font(.system(size: 15)).foregroundStyle(Ink.secondary)
    }
    .padding(.top, 26)
    .padding(.bottom, 6)
  }
}

/** The search, floating over the list at the bottom in glass, round (48 high, 17). */
struct ConnectorsSearchPill: View {
  @Binding var text: String
  var prompt = "Search connectors"

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.secondary)
      TextField(prompt, text: $text)
        .font(.system(size: 17))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
      if !text.isEmpty {
        Button { text = "" } label: {
          Image(systemName: "xmark.circle.fill").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, 18)
    .frame(height: 48)
    .glassEffect(.regular.interactive(), in: .capsule)
    .padding(.horizontal, 28)
    .padding(.bottom, 8)
  }
}

/** The row's end (the reference's): +, a tick once it is in, the spinner while it connects. 44 square, so a thumb finds it. */
@MainActor
enum ConnectorMark {
  static func plus() -> some View {
    Image(systemName: "plus")
      .font(.system(size: 22, weight: .light))
      .foregroundStyle(Ink.primary)
      .frame(width: 44, height: 44)
      .contentShape(.rect)
  }

  static func added() -> some View {
    Image(systemName: "checkmark")
      .font(.system(size: 17, weight: .medium))
      .foregroundStyle(Ink.secondary)
      .frame(width: 44, height: 44)
      .accessibilityLabel(Connecting.connected)
  }

  static func busy() -> some View {
    ProgressView().controlSize(.regular).frame(width: 44, height: 44)
  }

  /** An app that can't be added yet (`AppsComingSoon`): said quietly, no +. */
  static func soon() -> some View {
    Text(AppsComingSoon.label).font(.system(size: 13)).foregroundStyle(Ink.tertiary).fixedSize()
  }
}

/** One category, all its apps (the reference's "Small Business" page): Apple's bar with the round Back and its name, the search at the bottom. */
struct ConnectorCategoryPage: View {
  let title: String
  @Environment(AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  @State private var query = ""

  var body: some View {
    let apps = connectorSections(store.catalog, query: query, model: model).first { $0.title == title }?.apps ?? []
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        if apps.isEmpty {
          Text(query.isEmpty ? Plugins.noFilterMatch : "No apps match \u{201C}\(query)\u{201D}.")
            .font(.system(size: 15)).foregroundStyle(Ink.secondary)
            .padding(.top, 24)
        }
        ForEach(apps) { app in AppRow(app: app) }
      }
      .padding(.horizontal, 16)
      .padding(.top, 4)
    }
    .scrollDismissesKeyboard(.immediately)
    .safeAreaInset(edge: .bottom) { ConnectorsSearchPill(text: $query, prompt: "Search \(title)") }
    .background(Ink.ground.ignoresSafeArea())
    .toolbar(.visible, for: .navigationBar)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}
