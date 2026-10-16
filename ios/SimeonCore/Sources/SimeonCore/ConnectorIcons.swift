import Foundation

/**
 * Which connector a name means, for its app icon (`AppIcons/<id>`, 14
 * October 2026: the founder, "full logo. And i want all logo. some are
 * missing"). The lists, cards and pages name an app by its title
 * ("monday.com", "Facebook Pages", "Excel"), the assets by the catalogue's id
 * ("monday", "facebook", "microsoft-excel"). The logos were looked up by the
 * title's slug, and five titles' slugs are not their id, so those five drew a
 * letter. An id, a title, its slug, or a name the agents and the box use for
 * the app all find it here.
 */
public enum ConnectorIcons {
  /** Names an app goes by besides its catalogue title. */
  static let aliases: [String: String] = [
    "facebook": "facebook", "meta business suite": "facebook",
    "monday": "monday",
    "excel": "microsoft-excel", "microsoft excel": "microsoft-excel",
    "bigin": "zoho-bigin", "zoho bigin": "zoho-bigin",
    "capsule crm": "capsule-crm",
    "microsoft outlook": "outlook",
    "microsoft onedrive": "onedrive",
    "teams": "microsoft-teams",
    "microsoft sharepoint": "sharepoint",
    "microsoft onenote": "onenote",
    "to do": "microsoft-to-do",
    "search console": "google-search-console",
    "tiktok": "tiktok-ads",
    "convertkit": "kit",
    "zoom workplace": "zoom",
    "intuit quickbooks": "quickbooks", "quickbooks online": "quickbooks",
    "atlassian": "jira", "confluence": "jira",
    "apollo.io": "apollo",
    "link by stripe": "link",
  ]

  private static let byName: [String: String] = {
    var names: [String: String] = [:]
    for (id, name) in GeneratedAppIcons.connectors {
      names[id] = id
      names[name.lowercased()] = id
      names[CatalogApp.slug(name)] = id
    }
    for (alias, id) in aliases where names[alias] == nil { names[alias] = id }
    return names
  }()

  /** The connector's id, from its id, its title or another of its names; nil for an app that is not a connector. */
  public static func id(for name: String) -> String? {
    let key = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !key.isEmpty else { return nil }
    return byName[key] ?? byName[CatalogApp.slug(key)]
  }
}
