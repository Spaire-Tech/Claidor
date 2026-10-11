import Foundation

/**
 * Making agents and groups from the Mac window's new chat (⌘N, `HDn`), as
 * its roster asks the computer for them (`createAgent`, `createGroup`): the
 * computer picks the new agent's colour.
 */
extension AppStore {
  /** Why making an agent failed: the 50-agent limit (its own alert, `Lon`), or anything else. */
  public enum CreateFailure: Error, Equatable {
    case limit
    case other(String)
  }

  /**
   * A new agent from the To: line: its name (one line, 72 at most), made by
   * the person, introducing itself unless a first message is on its way
   * (`isKickstartRequested`), or saying nothing at all
   * (`isIntroductionSuppressed`, when it opens on a draft). Its id.
   */
  public func createChatAgent(name: String, kickstart: Bool, suppressIntroduction: Bool = false) async throws -> String {
    guard let backend else { throw CreateFailure.other("Not connected") }
    do {
      let answer = try await backend.command("createAgent", [
        "name": .string(NewChat.cleanName(name)), "description": "", "origin": "user",
        "isKickstartRequested": .bool(kickstart), "isIntroductionSuppressed": .bool(suppressIntroduction),
        "clientNonce": .string("mac-\(UUID().uuidString.lowercased())"),
      ])
      guard let id = answer["agent"]?["id"]?.text else { throw CreateFailure.other("No agent in the answer") }
      await reloadRoster()
      return id
    } catch let failure as CreateFailure {
      throw failure
    } catch {
      throw AppStore.createFailure(error)
    }
  }

  /** A group of agents named for its people ("Theo, Iris", 72 at most). Its id. */
  public func createChatGroup(name: String, memberIds: [String]) async throws -> String {
    guard let backend else { throw CreateFailure.other("Not connected") }
    do {
      let answer = try await backend.command("createGroup", ["name": .string(NewChat.cleanName(name)), "description": "", "memberAgentIds": JSON(memberIds)])
      guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw CreateFailure.other("No group in the answer") }
      await reloadRoster()
      return id
    } catch let failure as CreateFailure {
      throw failure
    } catch {
      throw AppStore.createFailure(error)
    }
  }

  /** The computer's refusal as the window reads it: its "50 is the maximum" is the limit. */
  static func createFailure(_ error: Error) -> CreateFailure {
    let text = (error as? GatewayError)?.message ?? error.localizedDescription
    return text.contains(NewChat.limitError) ? .limit : .other(text)
  }
}
