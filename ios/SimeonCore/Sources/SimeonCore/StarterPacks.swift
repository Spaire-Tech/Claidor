import Foundation

/**
 * A starter pack (22 October 2026, `server/simeon/desktop/packs.py`): a team
 * of five agents for a trade ("Coffee Shop Team"), each already named, with
 * a face, a title, its instructions and the three apps it asks to connect
 * first. The website's Add to Simeon opens the app on
 * `<scheme>://app/v1/pack/add?id=<id>`; the app reads the pack from Simeon
 * Labs' server and shows it, and Add makes the five agents in a sidebar
 * section named after the pack. Each speaks first at once
 * (`isKickstartRequested`): its instructions say to ask for its apps, and an
 * app already connected is only named.
 */
public struct StarterPack: Identifiable, Hashable, Sendable {
  public struct App: Hashable, Sendable {
    /** The catalogue's id (`vendor-mcp/catalog.ts`). */
    public let id: String
    public let name: String
    public init(id: String, name: String) { self.id = id; self.name = name }
  }

  public struct Member: Identifiable, Hashable, Sendable {
    public let name: String
    /** Its job, under its name ("Stock"). */
    public let title: String
    /** The face it is given (`AgentFaces`, "clay-02"). */
    public let face: String
    /** What it does, in a sentence or two, for the sheet. */
    public let summary: String
    /** The apps it asks for first, in its own order. */
    public let apps: [App]
    /** Its instructions, kept as the agent's description: its first message starts on them. */
    public let instructions: String
    public var id: String { name }

    public init(name: String, title: String, face: String, summary: String, apps: [App], instructions: String) {
      self.name = name; self.title = title; self.face = face; self.summary = summary; self.apps = apps; self.instructions = instructions
    }
  }

  public let id: String
  /** The sidebar section its agents go in ("Coffee Shop Team"). */
  public let folder: String
  /** "Simeon for Coffee Shops". */
  public let title: String
  public let summary: String
  public let members: [Member]

  public init(id: String, folder: String, title: String, summary: String, members: [Member]) {
    self.id = id; self.folder = folder; self.title = title; self.summary = summary; self.members = members
  }

  /** The server's pack (`packs.json`): the app names come from its `appNames`, else the catalogue's id stands for it. */
  public init?(json: JSON) {
    guard let id = json["id"]?.string, Self.isId(id), let folder = json["folder"]?.string, !folder.isEmpty else { return nil }
    let names = json["appNames"]
    let members = (json["agents"]?.array ?? []).compactMap { agent -> Member? in
      guard let name = agent["name"]?.string, !name.isEmpty else { return nil }
      let apps = (agent["apps"]?.array ?? []).compactMap { $0.string }.map { App(id: $0, name: names?[$0]?.string ?? $0) }
      return Member(name: name, title: agent["title"]?.string ?? "", face: agent["face"]?.string ?? "", summary: agent["summary"]?.string ?? "",
                    apps: apps, instructions: agent["description"]?.string ?? "")
    }
    guard !members.isEmpty else { return nil }
    self.init(id: id, folder: folder, title: json["title"]?.string ?? folder, summary: json["summary"]?.string ?? "", members: members)
  }

  /** Its sidebar section's id, so the pack is found again once added. */
  public var sectionId: String { Self.sectionId(id) }
  public static func sectionId(_ packId: String) -> String { "pack-\(packId)" }

  /** A pack's id: 1 to 64 of a–z, 0–9 and "-" (`coffee-shop`). */
  public static func isId(_ value: String) -> Bool {
    (1...64).contains(value.count) && value.unicodeScalars.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" }
  }

  static let linkPath = "/v1/pack/add"

  /** The pack an iPhone link names (`simeon-ios://app/v1/pack/add?id=coffee-shop`), or nil; the Mac reads its links through `DeepLink`. */
  public static func linked(_ url: URL, scheme: String) -> String? {
    guard url.scheme?.lowercased() == scheme.lowercased(), url.host == "app", url.path == linkPath,
          let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems, items.count == 1,
          items[0].name == "id", let id = items[0].value, isId(id) else { return nil }
    return id
  }
}

extension AppStore {
  /** A pack, read from Simeon Labs' server; the server's sentence when it has none ("This team isn't available anymore."). */
  public func starterPack(_ id: String) async throws -> StarterPack {
    guard let backend else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
    let answer = try await backend.server("packs/\(id)", method: nil, body: nil)
    guard let pack = StarterPack(json: answer) else { throw SimeonAPIError(message: L10n.text("This team isn't available anymore."), status: 404) }
    return pack
  }

  /** The pack's agents already here (its section's, still listed); none when it was never added or they are gone. */
  public func packAgents(_ pack: StarterPack) -> [String] {
    guard let section = sidebarSections?.first(where: { $0.id == pack.sectionId }) else { return [] }
    let listed = Set(agents.map(\.id))
    return section.agentIds.filter(listed.contains)
  }

  /**
   * Add: the five agents made one after another, each with its face, title
   * and instructions, and each speaking first at once; then a section named
   * after the pack at the top of the sidebar, holding them. The ids made,
   * the first to open; one that fails is said (`problem`) and the rest are
   * still made.
   */
  public func addPack(_ pack: StarterPack) async -> [String] {
    guard let backend else { return [] }
    if sidebarSections == nil { await loadSections() }
    var made: [String] = []
    for member in pack.members {
      do {
        made.append(try await backend.createAgent(name: member.name, title: member.title, description: member.instructions,
                                                  face: member.face.isEmpty ? nil : member.face, voiceId: nil))
      } catch {
        problem = L10n.text("Couldn't create \(member.name): \(error.localizedDescription)")
      }
    }
    await reloadRoster()
    if !made.isEmpty {
      editSections { sections in
        SidebarSections.rename(SidebarSections.create(sections, id: pack.sectionId, agentIds: made), id: pack.sectionId, to: pack.folder)
      }
    }
    return made
  }
}
