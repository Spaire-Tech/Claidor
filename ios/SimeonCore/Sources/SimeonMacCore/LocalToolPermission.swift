import Foundation
import SimeonCore

/**
 * Whether the agent may use this Mac: open files and run tasks on it
 * (`shared/local-tool-permission.ts`). Settings › Agent › "Execution on
 * Local Computer" picks it (the settings chunk's `da`); the box asks before
 * each action while it is "ask", the default.
 */
public enum LocalToolPermission: String, CaseIterable, Sendable {
  case always, ask, never

  /** The menu's order (`APt`). */
  public static let choices: [LocalToolPermission] = [.always, .ask, .never]
  public static let `default`: LocalToolPermission = .ask

  public static let title = "Execution on Local Computer"
  public static let explanation = "Let the assistant open files and run tasks on your computer. Auto-review still checks everything first."

  /** Anything else read as the default (`normalizeSandLocalToolPermission`). */
  public init(normalizing value: String?) {
    self = value.flatMap(LocalToolPermission.init(rawValue:)) ?? .default
  }

  /** `SAND_LOCAL_TOOL_PERMISSION_RANK` (the window's `vBe`). */
  public var rank: Int {
    switch self {
    case .never: 0
    case .ask: 1
    case .always: 2
    }
  }

  /** The menu's words (`XGn`). */
  public var label: String {
    switch self {
    case .never: "Never allow"
    case .always: "Always allow"
    case .ask: "Ask every time"
    }
  }

  /** The choice, lowered to the team admin's ceiling when it is above it (`resolveSandLocalToolPermission`). */
  public func capped(by ceiling: LocalToolPermission?) -> LocalToolPermission {
    guard let ceiling else { return self }
    return rank <= ceiling.rank ? self : ceiling
  }

  /** A choice above the ceiling is greyed in the menu (`MPt`). */
  public func isAbove(_ ceiling: LocalToolPermission?) -> Bool {
    guard let ceiling else { return false }
    return rank > ceiling.rank
  }

  /** The line under the explanation while a team admin caps it. */
  public static func ceilingLine(_ ceiling: LocalToolPermission) -> String {
    "Your team's admin allows at most \"\(ceiling.label)\""
  }

  /**
   * The ceiling in `GetTeamAdminSettingsOrEmptyIfNotInTeam`'s answer
   * (`fetchLocalToolPermissionCeiling`): `localToolControls.permissionCeiling`,
   * 1 never, 2 ask, 3 always; none for anything else, as for a person in no
   * team (Simeon Labs' server answers `{}`).
   */
  public static func ceiling(teamAdminSettings answer: JSON?) -> LocalToolPermission? {
    switch answer?["localToolControls"]?["permissionCeiling"]?.int {
    case 1: .never
    case 2: .ask
    case 3: .always
    default: nil
    }
  }

  /**
   * What connecting to the box does with the setting
   * (`coordinator-resync.ts`, step `local_tool_permission`): a box that
   * says always or never while this Mac is at "ask" is taken as the
   * choice here (another Mac set it); otherwise the box is given this
   * Mac's.
   */
  public enum Reconcile: Equatable, Sendable {
    case adopt(LocalToolPermission)
    case push(LocalToolPermission)
  }

  public static func reconcile(box: String?, mac: LocalToolPermission) -> Reconcile {
    if mac == .ask, let box = box.flatMap(LocalToolPermission.init(rawValue:)), box != .ask { return .adopt(box) }
    return .push(mac)
  }
}

/**
 * The setting as this Mac keeps it, for one account at a time
 * (`sand-settings-store.ts`): the person's choice and the team's ceiling.
 * Another account signing in starts again from the default; signing out
 * forgets both (`scopeToAccount`, `clearAccountScope`).
 */
public final class LocalToolSettings: @unchecked Sendable {
  private let defaults: UserDefaults
  private let prefix: String

  public init(defaults: UserDefaults = .standard, prefix: String = "simeon.localToolPermission") {
    self.defaults = defaults
    self.prefix = prefix
  }

  private var scopeKey: String { prefix + ".account" }
  private var choiceKey: String { prefix + ".choice" }
  private var ceilingKey: String { prefix + ".ceiling" }

  /** The person's own pick, before any ceiling (`getLocalToolPermissionChoice`). */
  public var choice: LocalToolPermission {
    get { LocalToolPermission(normalizing: defaults.string(forKey: choiceKey)) }
    set { defaults.set(newValue.rawValue, forKey: choiceKey) }
  }

  /** The team admin's ceiling, when there is one. */
  public var ceiling: LocalToolPermission? {
    get { defaults.string(forKey: ceilingKey).flatMap(LocalToolPermission.init(rawValue:)) }
    set {
      if let newValue { defaults.set(newValue.rawValue, forKey: ceilingKey) } else { defaults.removeObject(forKey: ceilingKey) }
    }
  }

  /** What the box is told and the menu shows (`getLocalToolPermission`). */
  public var effective: LocalToolPermission { choice.capped(by: ceiling) }

  /** Another account than the last one forgets the last one's choice and ceiling; the first account keeps what is there. */
  public func scope(to account: String) {
    let current = defaults.string(forKey: scopeKey)
    if let current, current != account {
      defaults.removeObject(forKey: choiceKey)
      defaults.removeObject(forKey: ceilingKey)
    }
    defaults.set(account, forKey: scopeKey)
  }

  /** Signed out: the account, its choice and its ceiling forgotten. */
  public func clearScope() {
    defaults.removeObject(forKey: scopeKey)
    defaults.removeObject(forKey: choiceKey)
    defaults.removeObject(forKey: ceilingKey)
  }
}
