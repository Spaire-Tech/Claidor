import Foundation
import XCTest
import SimeonCore
@testable import SimeonMacCore

/**
 * The hands on this Mac against the Electron app's own answers: the verdicts
 * below are what `shared/sensitive-local-paths.ts` and
 * `shared/local-tool-permission-machinery.ts`, bundled as shipped and run in
 * Node with the home folder `/Users/bass`, said (scratchpad
 * `s7/fixtures/sensitive-and-describe-probe.txt`), the holes included.
 */
final class LocalExecTests: XCTestCase {
  private let home = "/Users/bass"

  func testPlacesThatHoldKeys() {
    let paths: [(String, String, String?)] = [
      ("read-file", "~/.ssh/id_rsa", ".ssh"),
      ("read-file", "file:///Users/bass/.ssh/id_rsa", nil),
      ("read-file", "/USERS/bass/.ssh/id_rsa", nil),
      ("read-file", "/Users/bass/.SSH/id_rsa", nil),
      ("read-file", "~/.ssh", ".ssh"),
      ("read-file", "~/.ssh/", ".ssh"),
      ("read-file", "/Users/bass//.ssh", ".ssh"),
      ("read-file", "\"~/.ssh/x\"", ".ssh"),
      ("read-file", "$HOME/.aws/credentials", ".aws"),
      ("read-file", "${HOME}/.aws/credentials", nil),
      ("read-file", "/private/etc/shadow", nil),
      ("read-file", "/etc/master.passwd", "/etc/master.passwd"),
      ("read-file", "~/Library/Keychains", "Library/Keychains"),
      ("read-file", ".docker/config.json", ".docker/config.json"),
      ("read-file", ".docker/other.json", nil),
      ("read-file", "~/.simeon/settings.json", ".simeon"),
      ("read-file", "~/Documents/../.gnupg/x", ".gnupg"),
      ("list-directory", "~", nil),
      ("list-directory", "/Users/bass/Library", nil),
      ("write-file", "Downloads/x", nil),
    ]
    for (action, target, entry) in paths {
      XCTAssertEqual(SensitivePaths.entry(forPath: target, home: home), entry, "\(action) \(target)")
    }
    let commands: [(String, String?)] = [
      ("cat ~/.ssh/id_rsa", ".ssh"),
      ("cat /Users/bass/.ssh/id_rsa", ".ssh"),
      ("cd ~ && cat .ssh/id_rsa", ".ssh"),
      ("cat ~/.SSH/id_rsa", nil),
      ("cat \"$HOME/.ssh/id_rsa\"", ".ssh"),
      ("cat ${HOME}/.ssh/id_rsa", ".ssh"),
      ("cd ~/.ssh; cat id_rsa", nil),
      ("cat ~/Library/Application\\ Support/Google/Chrome/x", nil),
      ("cat '/Users/bass/Library/Application Support/Google/Chrome/x'", "Library/Application Support/Google/Chrome"),
      ("ls /etc/shadow", "/etc/shadow"),
      ("echo x>/etc/shadow", nil),
      ("cat ~/.sshfs", nil),
      ("cat ~/.ssh", ".ssh"),
      ("f=~/.ssh/id; cat $f", ".ssh"),
    ]
    for (command, entry) in commands {
      XCTAssertEqual(SensitivePaths.entry(inCommand: command, home: home), entry, command)
    }
    XCTAssertNil(SensitivePaths.refusal(action: "send-input", target: "cat ~/.ssh/id_rsa", home: home))
    XCTAssertEqual(SensitivePaths.refusal(action: "read-file", target: "~/.ssh/x", home: home), "Simeon does not read, write or run anything under ~/.ssh on this Mac: it holds keys or sign-ins. Ask the person to do that part themselves.")
    XCTAssertEqual(SensitivePaths.refusal(action: "run-command", target: "ls /etc/shadow", home: home), "Simeon does not read, write or run anything under /etc/shadow on this Mac: it holds keys or sign-ins. Ask the person to do that part themselves.")
  }

  func testWhatARequestIsAbout() {
    let terminals = "/Users/bass/terminals"
    XCTAssertEqual(LocalToolRules.describe(kind: "shellStreamArgs", value: ["command": "ls"], terminalsFolder: terminals), LocalToolRequest(action: "run-command", target: "ls", resourcePath: terminals))
    XCTAssertEqual(LocalToolRules.describe(kind: "shellStreamArgs", value: ["command": "ls", "isBackground": true], terminalsFolder: terminals), LocalToolRequest(action: "run-command", target: "ls", resourcePath: terminals, outlivesScope: true))
    XCTAssertEqual(LocalToolRules.describe(kind: "readArgs", value: ["path": "/Users/bass/terminals/1234.txt"], terminalsFolder: terminals), LocalToolRequest(action: "read-file", target: "/Users/bass/terminals/1234.txt", attachToResourcePath: terminals))
    XCTAssertEqual(LocalToolRules.describe(kind: "readArgs", value: ["path": "/Users/bass/x.txt"], terminalsFolder: terminals), LocalToolRequest(action: "read-file", target: "/Users/bass/x.txt"))
    XCTAssertEqual(LocalToolRules.describe(kind: "lsArgs", value: ["path": "/Users/bass"], terminalsFolder: terminals), LocalToolRequest(action: "list-directory", target: "/Users/bass"))
    XCTAssertEqual(LocalToolRules.describe(kind: "writeShellStdinArgs", value: ["chars": "y\n"], terminalsFolder: terminals), LocalToolRequest(action: "send-input", target: "y\n"))
    XCTAssertNil(LocalToolRules.describe(kind: "grepArgs", value: [:], terminalsFolder: terminals))
    // The probe's `localToolApprovalCovers`: a command's folder covers its terminal file, not with a trailing slash on one side.
    let read = LocalToolRequest(action: "read-file", target: "/Users/bass/terminals/1234.txt", attachToResourcePath: terminals)
    XCTAssertTrue(LocalToolRules.covers(action: "run-command", target: "ls", resourcePath: terminals, request: read))
    XCTAssertFalse(LocalToolRules.covers(action: "run-command", target: "ls", resourcePath: terminals + "/", request: read))
  }

  func testTheGateInItsOrder() {
    let terminals = "/Users/bass/terminals"
    let run = LocalToolRequest(action: "run-command", target: "ls", resourcePath: terminals)
    let secret = LocalToolRequest(action: "read-file", target: "~/.ssh/id_rsa")
    let approved = ["q1": LocalToolApproval(id: "q1", action: "run-command", target: "ls")]
    func gate(_ request: LocalToolRequest?, _ id: String?, _ permission: LocalToolPermission, _ live: [String: LocalToolApproval] = [:]) -> String? {
      LocalToolRules.refusal(request: request, approvalId: id, permission: permission, live: live, terminalsFolder: terminals, home: home)
    }
    // Keys first, whatever the setting.
    XCTAssertTrue(gate(secret, nil, .always)?.hasPrefix("Simeon does not read") == true)
    XCTAssertEqual(gate(run, nil, .never), LocalExec.disabled)
    XCTAssertNil(gate(run, nil, .always))
    XCTAssertNil(gate(nil, nil, .always))
    XCTAssertEqual(gate(run, nil, .ask), LocalExec.unapproved)
    XCTAssertEqual(gate(run, "", .ask, approved), LocalExec.unapproved)
    XCTAssertEqual(gate(nil, "q1", .ask, approved), LocalExec.unapproved)
    XCTAssertEqual(gate(run, "q2", .ask, approved), LocalExec.unapproved)
    XCTAssertNil(gate(run, "q1", .ask, approved))
    XCTAssertEqual(gate(LocalToolRequest(action: "run-command", target: "ls -la", resourcePath: terminals), "q1", .ask, approved), LocalExec.unapproved)
    // The command's approval reads its own terminal file (AwaitExternalShell).
    XCTAssertNil(gate(LocalToolRequest(action: "read-file", target: terminals + "/42.txt", attachToResourcePath: terminals), "q1", .ask, approved))
  }

  func testWhereThingsMayBe() {
    XCTAssertFalse(LocalToolRules.escapesRoot("/Users/bass", "/Users/bass"))
    XCTAssertFalse(LocalToolRules.escapesRoot("/Users/bass", "/Users/bass/x/y"))
    XCTAssertTrue(LocalToolRules.escapesRoot("/Users/bass", "/Users/other"))
    XCTAssertTrue(LocalToolRules.escapesRoot("/Users/bass", "/etc/hosts"))
    XCTAssertTrue(LocalToolRules.escapesRoot("/Users/bass", "/Users/bass/..foo"))
    XCTAssertEqual(LocalToolRules.resolve("Downloads/../x", against: "/Users/bass"), "/Users/bass/x")
    XCTAssertEqual(LocalToolRules.resolve("/tmp/./a/", against: "/Users/bass"), "/tmp/a")
    let folder = LocalToolRules.workingDirectory(requested: "nowhere", root: "/Users/bass") { _ in false }
    XCTAssertEqual(folder.path, "/Users/bass")
    XCTAssertEqual(folder.notice, "working directory nowhere does not exist on this machine; running in /Users/bass instead\n")
    XCTAssertEqual(LocalToolRules.workingDirectory(requested: "  ", root: "/Users/bass") { _ in true }.path, "")
    XCTAssertEqual(LocalToolRules.workingDirectory(requested: "app", root: "/Users/bass") { $0 == "/Users/bass/app" }.path, "/Users/bass/app")
  }

  func testLimitsAndWords() {
    XCTAssertEqual(LocalExec.uploadFrameCap, 139_875_670)
    XCTAssertEqual(LocalExec.describe(bytes: 200 * 1024 * 1024), "200.0 MiB")
    XCTAssertTrue(LocalExec.fileTooLarge(200 * 1024 * 1024).hasPrefix("File is 200.0 MiB, which exceeds Simeon's 100.0 MiB limit"))
    XCTAssertEqual((1...7).map { LocalExec.backoffSeconds(attempt: $0) }, [1, 2, 4, 8, 10, 10, 10])
    XCTAssertEqual(LocalExec.blockMs(timeout: 0, isBackground: false, timeoutBehaviorBackground: true, hardTimeout: 86_400_000), 0)
    XCTAssertEqual(LocalExec.blockMs(timeout: 0, isBackground: false, timeoutBehaviorBackground: false, hardTimeout: nil), 30_000)
    XCTAssertEqual(LocalExec.blockMs(timeout: 5_000, isBackground: true, timeoutBehaviorBackground: true, hardTimeout: nil), 5_000)
  }
}
