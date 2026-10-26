import Foundation
#if canImport(Security)
import Security
#endif

/**
 * Where the person's computer answered last time, kept between launches, as
 * the Electron app keeps it (`gateway-descriptor-cache.ts`, 16 October 2026):
 * the broker's answer, for one account (its token's `sub`), for seven days
 * (`GATEWAY_DESCRIPTOR_MAX_AGE_MS`). At launch the app goes straight to it
 * while the broker is asked again (`Gateway`). It holds the box's tokens, so
 * it lives where the session's own pair lives, the Keychain, as the Mac keeps
 * it encrypted (`safeStorage`); signing out forgets it.
 */
public enum SavedGateway {
  public static let version = 1
  public static let maxAge: TimeInterval = 7 * 24 * 60 * 60

  /** The record kept: the broker's own field names, so it reads back through `GatewayConnection(box:)`. */
  public static func encode(_ connection: GatewayConnection, accountScope: String, savedAt: Date) -> Data? {
    var box: [String: JSON] = ["gatewayUrl": .string(connection.baseURL)]
    if let token = connection.token { box["gatewayToken"] = .string(token) }
    if let networkToken = connection.networkToken { box["networkToken"] = .string(networkToken) }
    if let screen = connection.screenURL { box["vncUrl"] = .string(screen) }
    if let fork = connection.forkScreenBase { box["forkVncBaseUrl"] = .string(fork) }
    // Whether the server let the box sleep: the next launch asks the record before it wakes the box (step 4).
    if connection.letsSleep { box["letsSleep"] = true }
    let record: JSON = ["version": .number(Double(version)), "accountScope": .string(accountScope), "savedAtMs": .number(savedAt.timeIntervalSince1970 * 1000), "box": .object(box)]
    return try? record.data()
  }

  /** The address kept for this account, nil when none, another account's, another version's, or older than seven days. */
  public static func decode(_ data: Data?, accountScope: String, now: Date) -> GatewayConnection? {
    guard let data, let record = try? JSON.parse(data), record["version"]?.double == Double(version),
          record["accountScope"]?.string == accountScope, let savedAtMs = record["savedAtMs"]?.double,
          now.timeIntervalSince1970 * 1000 - savedAtMs <= maxAge * 1000, let box = record["box"] else { return nil }
    return try? GatewayConnection(box: box)
  }
}

/** Where the record is kept: the Keychain in the apps, memory in tests. */
public protocol SavedGatewayStore: Sendable {
  func read() -> Data?
  /** Nil forgets it. */
  func write(_ data: Data?)
}

public final class MemorySavedGateway: SavedGatewayStore, @unchecked Sendable {
  private let lock = NSLock()
  private var data: Data?
  public init(_ data: Data? = nil) { self.data = data }
  public func read() -> Data? { lock.lock(); defer { lock.unlock() }; return data }
  public func write(_ data: Data?) { lock.lock(); self.data = data; lock.unlock() }
}

#if canImport(Security)
/** The record in the Keychain beside the session's pair (same service, its own account), this device only. */
public struct KeychainSavedGateway: SavedGatewayStore {
  private let service: String
  private let account = "gateway"

  public init(service: String) { self.service = service }

  public func read() -> Data? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  public func write(_ data: Data?) {
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    SecItemDelete(base as CFDictionary)
    guard let data else { return }
    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(add as CFDictionary, nil)
  }
}
#endif
