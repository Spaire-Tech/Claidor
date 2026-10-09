import XCTest
@testable import SimeonCore

/**
 * Connect apps' rules against the shipped overlay's own code:
 * `Fixtures/plugins.json` was made by running the overlay chunk's `Pl`,
 * `Tl`, `ql`, `et`, `rt`, `ui`, `fi`, `nt`, `Hl`, `Ml`, `yi`, `Wl`, `Ue`,
 * `sd`, `Gl`, `vi`, `ni`, `bi`, `_l`, `An`, `Tn`, `Jn` and `Ll` (with the
 * main bundle's `MFe`, `RWn` and `P5n`) on 160 random catalogs with servers,
 * accounts and plugins, and on skills, tools and words.
 */
final class PluginsTests: XCTestCase {
  private static let fixture: JSON = {
    let url = Bundle.module.url(forResource: "plugins", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(Data(contentsOf: url))
  }()

  private func filter(_ json: JSON?) -> PluginFilter {
    PluginFilter(type: PluginFilter.Kind(rawValue: json?["type"]?.string ?? "all")!, ownership: PluginFilter.Ownership(rawValue: json?["ownership"]?.string ?? "all")!)
  }

  private func strings(_ json: JSON?) -> [String] { json?.array?.compactMap(\.string) ?? [] }

  private func describe(_ item: PluginItem) -> JSON {
    switch item {
    case .connector(let server, let mode):
      return ["kind": "connector", "serverId": .string(server.id), "accountKey": .string(server.accountKey), "installMode": .string(mode.rawValue)]
    case .plugin(let entry, let mode, let connectors):
      return ["kind": "plugin", "entryId": .string(entry.id), "installMode": .string(mode.rawValue), "connectors": JSON(connectors.map { "\($0.id)/\($0.accountKey)" })]
    }
  }

  func testMarketplaceYoursAndAddedAsTheOverlay() {
    let scenarios = Self.fixture["scenarios"]?.array ?? []
    XCTAssertEqual(scenarios.count, 160)
    for (index, row) in scenarios.enumerated() {
      let label = "scenario \(index)"
      let catalog = (row["catalog"]?.array ?? []).compactMap(PluginEntry.init(json:))
      let servers = (row["servers"]?.array ?? []).compactMap(PluginServer.init(json:))
      let plugins = (row["plugins"]?.array ?? []).compactMap(EffectivePlugin.init(json:))
      let query = row["query"]?.string ?? ""
      let chosen = filter(row["filter"])
      let deduped = Plugins.onePerServer(servers)

      let marketplace = Plugins.search(catalog, query)
      XCTAssertEqual(marketplace.map(\.id), strings(row["marketplace"]), label)
      XCTAssertEqual(marketplace.filter { Plugins.keeps($0, chosen) }.map(\.id), strings(row["marketplaceFiltered"]), label)
      let sections = Plugins.sections(Plugins.search(catalog, ""))
      let shipped = row["sections"]?.array ?? []
      XCTAssertEqual(sections.map(\.key), shipped.compactMap { $0["key"]?.string }, label)
      XCTAssertEqual(sections.map(\.title), shipped.compactMap { $0["title"]?.string }, label)
      XCTAssertEqual(sections.map { $0.items.map(\.id) }, shipped.map { strings($0["items"]) }, label)

      let names = Plugins.byName(deduped)
      let byId = Dictionary(plugins.map { ($0.pluginId, $0) }, uniquingKeysWith: { _, last in last })
      for (entry, answer) in zip(catalog, row["installed"]?.array ?? []) {
        let found = Plugins.installed(entry, servers: deduped, byName: names, plugins: byId)
        XCTAssertEqual(found.isInstalled, answer["isInstalled"]?.bool, "\(label) \(entry.id)")
        XCTAssertEqual(found.plugin?.pluginId, answer["plugin"]?.string, "\(label) \(entry.id)")
        XCTAssertEqual(found.server?.id, answer["server"]?.string, "\(label) \(entry.id)")
      }

      let found = Plugins.search(deduped, query)
      XCTAssertEqual(found.map(\.id), strings(row["serversFound"]), label)
      let items = Plugins.items(found, catalog: catalog, plugins: plugins)
      XCTAssertEqual(items.map(describe), row["items"]?.array ?? [], label)
      let kept = items.filter { Plugins.keeps($0, query: query.trimmingCharacters(in: .whitespacesAndNewlines)) && Plugins.keeps($0, chosen) }
      XCTAssertEqual(kept.map(describe), row["itemsKept"]?.array ?? [], label)
      let lines = items.map { item -> String in
        switch item {
        case .plugin(let entry, _, _): return Plugins.contributions(entry)
        case .connector(let server, _): return Plugins.contributions(server, catalog: catalog)
        }
      }
      XCTAssertEqual(lines, strings(row["itemLines"]), label)
      XCTAssertEqual(deduped.map { Plugins.entry(for: $0, in: catalog)?.id ?? "" }, (row["entryFor"]?.array ?? []).map { $0.string ?? "" }, label)
      for (id, order) in row["accountOrder"]?.object ?? [:] {
        XCTAssertEqual(Plugins.accounts(servers, of: id).map(\.accountKey), strings(order), "\(label) \(id)")
      }
    }
  }

  func testPrivateSkillsAsTheOverlay() {
    for (index, row) in (Self.fixture["skillSets"]?.array ?? []).enumerated() {
      let skills = (row["skills"]?.array ?? []).compactMap(AgentSkill.init(json:))
      XCTAssertEqual(Plugins.privateSkills(skills).map(\.id), strings(row["private"]), "set \(index)")
      XCTAssertEqual(skills.map(\.subtitle), strings(row["lines"]), "set \(index)")
      XCTAssertEqual(skills.filter { Plugins.keeps($0, filter(row["filter"])) }.map(\.id), strings(row["kept"]), "set \(index)")
    }
  }

  func testToolNamesAccountLabelsAndWords() {
    for row in Self.fixture["toolSets"]?.array ?? [] {
      let tools = (row["tools"]?.array ?? []).compactMap(PluginTool.init(json:))
      XCTAssertEqual(Plugins.toolNames(tools), (row["names"]?.object ?? [:]).compactMapValues(\.string))
    }
    for row in Self.fixture["accounts"]?.array ?? [] {
      XCTAssertEqual(Plugins.accountLabel(row["key"]?.string ?? ""), row["label"]?.string)
    }
    for row in Self.fixture["blocked"]?.array ?? [] {
      XCTAssertEqual(Plugins.authBlockedLine(strings(row["names"])), row["line"]?.string)
    }
    for row in Self.fixture["signIns"]?.array ?? [] {
      let notice = Plugins.signInNotice(status: row["status"]?.string ?? "", message: row["message"]?.string)
      XCTAssertEqual(notice.text, row["notice"]?["text"]?.string)
      XCTAssertEqual(notice.isError, row["notice"]?["kind"]?.string == "error")
    }
    for row in Self.fixture["added"]?.array ?? [] {
      let notice = Plugins.addedNotice("Gmail", added: row["added"]?.int ?? 0, failed: strings(row["failed"]), error: row["error"]?.string)
      XCTAssertEqual(notice.text, row["notice"]?["text"]?.string)
      XCTAssertEqual(notice.isError, row["notice"]?["kind"]?.string == "error")
    }
    for row in Self.fixture["removed"]?.array ?? [] {
      let notice = Plugins.removedNotice("Gmail", removed: row["removed"]?.bool ?? false, reason: row["reason"]?.string)
      XCTAssertEqual(notice.text, row["notice"]?["text"]?.string)
    }
    for row in Self.fixture["scores"]?.array ?? [] {
      let score = Plugins.score(row["text"]?.string ?? "", row["query"]?.string ?? "")
      if let expected = row["score"]?.double { XCTAssertEqual(score ?? -1, expected, accuracy: 1e-9, row["text"]?.string ?? "") } else { XCTAssertNil(score, row["text"]?.string ?? "") }
    }
    for row in Self.fixture["collapse"]?.array ?? [] {
      let result = Plugins.collapse(Array(0..<(row["count"]?.int ?? 0)), expanded: row["expanded"]?.bool ?? false, limit: row["limit"]?.int ?? 0)
      XCTAssertEqual(result.visible.count, row["visible"]?.int)
      XCTAssertEqual(result.hidden, row["hidden"]?.int)
    }
    XCTAssertEqual(Plugins.shareLink("gmail plugin/1"), Self.fixture["link"]?.string)
    XCTAssertEqual(Plugins.statusWord("needsAuth"), "Needs auth")
    XCTAssertEqual(Plugins.skillsAddedNotice("Docs", added: 2).text, "Added 2 skills from Docs")
  }
}
