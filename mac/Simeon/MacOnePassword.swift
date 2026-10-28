import Foundation

/**
 * Connecting 1Password from the Mac (28 October 2026), the upstream app's
 * way, which the founder chose: through the person's own 1Password app and
 * its command-line tool (`op`), which asks for Touch ID. In order:
 *
 *   1. their 1Password accounts (`op account list`);
 *   2. the vault "Shared with Simeon" in the chosen one, made if it isn't
 *      there (`op vault list`, `op vault create`): they put in it the logins
 *      Simeon may use;
 *   3. a service account that can only read that vault, for a year
 *      (`op service-account create … --vault <id>:read_items --raw`).
 *
 * Its key goes to the agent's computer (`connectOnePassword`), which checks it
 * with 1Password and keeps it; nothing is kept on this Mac. 1Password's own
 * settings decide whether an account may make service accounts; its refusal
 * is shown as it says it.
 */
enum MacOnePassword {
  static let vaultName = "Shared with Simeon"
  /** Where 1Password's installer and Homebrew put the tool. */
  static let toolPaths = ["/opt/homebrew/bin/op", "/usr/local/bin/op", "/usr/bin/op"]
  static let setupURL = URL(string: "https://developer.1password.com/docs/cli/get-started/")!

  struct Account: Hashable, Identifiable {
    let id: String
    let email: String
    let url: String
    var label: String { url.isEmpty ? email : "\(email) · \(url)" }
  }

  struct Connection {
    let token: String
    let vaultId: String
    let vaultName: String
    let accountEmail: String
  }

  enum Failure: Error {
    /** No `op` on this Mac. */
    case noTool
    /** 1Password's own sentence. */
    case refused(String)

    var message: String {
      switch self {
      case .noTool: return String(localized: "Install 1Password's command-line tool, then turn on Integrate with 1Password CLI in the 1Password app (Settings → Developer).")
      case .refused(let said): return said
      }
    }

    /** The app's CLI integration is off or locked: the setup page helps. */
    var needsSetup: Bool {
      switch self {
      case .noTool: return true
      case .refused(let said):
        let lower = said.lowercased()
        return lower.contains("app integration") || lower.contains("desktop app") || lower.contains("not signed in") || lower.contains("no accounts")
      }
    }
  }

  static func toolPath() -> String? { toolPaths.first { FileManager.default.isExecutableFile(atPath: $0) } }

  /** The environment `op` runs with: none of the caller's OP_ settings, and Touch ID through the 1Password app. */
  private static func environment() -> [String: String] {
    var env = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("OP_") }
    env["OP_CACHE"] = "false"
    env["OP_BIOMETRIC_UNLOCK_ENABLED"] = "true"
    env["OP_LOAD_DESKTOP_APP_SETTINGS"] = "false"
    return env
  }

  /** Runs `op` off the main thread: its output, or 1Password's sentence. Touch ID can take a while, so up to three minutes. */
  static func run(_ path: String, _ arguments: [String], timeout: TimeInterval = 180) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments
        process.environment = environment()
        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        process.standardInput = FileHandle.nullDevice
        do { try process.run() } catch {
          continuation.resume(throwing: Failure.refused(error.localizedDescription))
          return
        }
        let timer = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: timer)
        // What `op` says on failure, read beside its output so neither pipe fills and stalls it.
        let errors = Collected()
        let readErrors = DispatchGroup()
        readErrors.enter()
        DispatchQueue.global().async { errors.data = err.fileHandleForReading.readDataToEndOfFile(); readErrors.leave() }
        let output = out.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        readErrors.wait()
        timer.cancel()
        let errorData = errors.data
        if process.terminationStatus == 0 {
          continuation.resume(returning: String(decoding: output, as: UTF8.self))
        } else {
          let said = String(decoding: errorData, as: UTF8.self)
            .split(separator: "\n").map { $0.replacingOccurrences(of: #"^\[ERROR\]\s*\S+\s+\S+\s*"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty } ?? String(localized: "1Password didn't answer.")
          continuation.resume(throwing: Failure.refused(String(said.prefix(300))))
        }
      }
    }
  }

  private final class Collected: @unchecked Sendable { var data = Data() }

  private static func objects(_ text: String) -> [[String: Any]] {
    (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [[String: Any]] ?? []
  }

  /** The person's 1Password accounts. */
  static func accounts() async throws -> [Account] {
    guard let op = toolPath() else { throw Failure.noTool }
    let listed = objects(try await run(op, ["account", "list", "--format=json"]))
    let accounts = listed.compactMap { row -> Account? in
      guard let id = row["account_uuid"] as? String, !id.isEmpty else { return nil }
      return Account(id: id, email: row["email"] as? String ?? "", url: row["url"] as? String ?? "")
    }
    if accounts.isEmpty { throw Failure.refused(String(localized: "1Password lists no accounts. Sign in to the 1Password app, then try again.")) }
    return accounts
  }

  /** The shared vault in the account (made when missing) and a read-only key for it. */
  static func connect(_ account: Account) async throws -> Connection {
    guard let op = toolPath() else { throw Failure.noTool }
    let vaults = objects(try await run(op, ["vault", "list", "--account", account.id, "--format=json"]))
    var vaultId = vaults.first { ($0["name"] as? String) == vaultName }?["id"] as? String
    if vaultId == nil {
      let made = (try? JSONSerialization.jsonObject(with: Data(try await run(op, ["vault", "create", vaultName, "--account", account.id, "--format=json"]).utf8))) as? [String: Any]
      vaultId = made?["id"] as? String
    }
    guard let vaultId, !vaultId.isEmpty else { throw Failure.refused(String(localized: "1Password didn't make the vault.")) }
    let token = try await run(op, ["service-account", "create", "Simeon", "--vault", "\(vaultId):read_items", "--expires-in", "52w", "--account", account.id, "--raw"])
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard token.hasPrefix("ops_"), token.count > 20 else { throw Failure.refused(String(localized: "1Password didn't give a key.")) }
    return Connection(token: token, vaultId: vaultId, vaultName: vaultName, accountEmail: account.email)
  }
}
