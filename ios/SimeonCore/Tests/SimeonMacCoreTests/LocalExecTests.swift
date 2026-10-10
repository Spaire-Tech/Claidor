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

  /** The box's events as the provider reads them (`local-exec-provider.ts`): blank-line blocks, `data:` lines joined, pings and `retry:` skipped. */
  func testTheRequestStream() {
    var parser = LocalExecEventParser()
    let welcome = "retry: 1000\n\ndata: {\"kind\":\"welcome\",\"providerId\":\"p1\"}\n\n:ping\n\n"
    var events = parser.feed(Array(welcome.utf8))
    XCTAssertEqual(events, [.frame(["kind": "welcome", "providerId": "p1"])])
    // A frame cut between two reads, then one that is not JSON.
    events = parser.feed(Array("data: {\"requestId\":\"r1\",\"kind\":\"ca".utf8))
    XCTAssertTrue(events.isEmpty)
    events = parser.feed(Array("ncel\"}\n\ndata: {nope\n\n".utf8))
    XCTAssertEqual(events, [.frame(["requestId": "r1", "kind": "cancel"]), .unreadable])
    let request = LocalExecWire.Request(json: ["requestId": "r2", "kind": "exec", "approvalId": "a", "serverMessage": ["id": 7, "readArgs": ["path": "/x"]]])
    XCTAssertEqual(request?.approvalId, "a")
    let command = LocalExecWire.command(request?.serverMessage ?? [:])
    XCTAssertEqual(command.kind, "readArgs")
    XCTAssertEqual(command.value["path"]?.string, "/x")
    // Over the cap: answered "too large" by the id near its start, the rest of it dropped.
    var small = LocalExecEventParser(cap: 64)
    events = small.feed(Array(("data: {\"requestId\":\"big\",\"kind\":\"upload\",\"bytesBase64\":\"" + String(repeating: "A", count: 100)).utf8))
    XCTAssertEqual(events, [.tooLarge(requestId: "big")])
    events = small.feed(Array((String(repeating: "A", count: 50) + "\"}\n\ndata: {\"kind\":\"welcome\"}\n\n").utf8))
    XCTAssertEqual(events, [.frame(["kind": "welcome"])])
  }

  /** The answers in protobuf's JSON, as the shipped classes wrote them (`fixtures/proto-json-samples.txt`). */
  func testTheAnswersShape() {
    XCTAssertEqual(LocalExecWire.clientMessage(id: 1, "shellStream", LocalExecWire.shellStart, localMs: 2), ["id": 1, "shellStream": ["start": ["sandboxPolicy": ["type": "TYPE_INSECURE_NONE"]]], "localExecutionTimeMs": 2])
    XCTAssertEqual(LocalExecWire.shellOutput("stdout", "total 8\n"), ["stdout": ["data": "total 8\n"]])
    XCTAssertEqual(LocalExecWire.shellExit(code: 0, cwd: "/Users/bass", aborted: false, abortReason: nil, localMs: 38), ["exit": ["cwd": "/Users/bass", "localExecutionTimeMs": 38]])
    XCTAssertEqual(LocalExecWire.shellExit(code: -1, cwd: "/Users/bass", aborted: true, abortReason: "SHELL_ABORT_REASON_USER_ABORT", localMs: nil), ["exit": ["code": 4294967295, "cwd": "/Users/bass", "aborted": true, "abortReason": "SHELL_ABORT_REASON_USER_ABORT"]])
    XCTAssertEqual(LocalExecWire.shellBackgrounded(shellId: 482913, command: "sleep 100", workingDirectory: "/Users/bass", pid: 4242, msToWait: 30000), ["backgrounded": ["shellId": 482913, "command": "sleep 100", "workingDirectory": "/Users/bass", "pid": 4242, "msToWait": 30000, "reason": "SHELL_BACKGROUND_REASON_TIMEOUT"]])
    XCTAssertEqual(LocalExecWire.readText(path: "/Users/bass/notes.txt", content: "hello\nworld", totalLines: 2, fileSize: 11, truncated: false, rangeApplied: false), ["success": ["path": "/Users/bass/notes.txt", "content": "hello\nworld", "totalLines": 2, "fileSize": "11"]])
    XCTAssertEqual(LocalExecWire.readFailure("fileNotFound", path: "/x"), ["fileNotFound": ["path": "/x"]])
    XCTAssertEqual(LocalExecWire.spawnSuccess(shellId: 12345, command: "npm run dev", workingDirectory: "/Users/bass/app", pid: 999), ["success": ["shellId": 12345, "command": "npm run dev", "workingDirectory": "/Users/bass/app", "pid": 999]])
    XCTAssertEqual(LocalExecWire.thrown(id: 0, error: "no"), ["throw": ["error": "no"]])
    XCTAssertEqual(LocalExecWire.streamClose(id: 1), ["streamClose": ["id": 1]])
    XCTAssertEqual(LocalExecWire.heartbeat(id: 1), ["heartbeat": ["id": 1]])
    XCTAssertEqual(LocalExecWire.batch(providerId: nil, frames: []), ["frames": []])
  }

  func testReadingAFile() {
    XCTAssertEqual(LocalRead.kind(header: Array("hello\n".utf8)), .text)
    XCTAssertEqual(LocalRead.kind(header: [137, 80, 78, 71, 13, 10, 26, 10, 0, 0]), .image)
    XCTAssertEqual(LocalRead.kind(header: [0x7f, 0x45, 0x4c, 0x46, 0, 1, 2]), .binary)
    XCTAssertEqual(LocalRead.kind(header: Array("h\0i\0!\0\n\0".utf8)), .text)
    XCTAssertEqual(LocalRead.decode(Data("a\r\nb\r\n".utf8)), "a\nb\n")
    XCTAssertEqual(LocalRead.decode(Data([0xEF, 0xBB, 0xBF] + Array("x".utf8))), "x")
    XCTAssertEqual(LocalRead.decode(Data([0x63, 0x61, 0x66, 0xE9])), "café")
    XCTAssertEqual(LocalRead.countLines(""), 1)
    XCTAssertEqual(LocalRead.countLines("a\nb\n"), 3)
    let text = "1\n2\n3\n4\n5"
    XCTAssertEqual(LocalRead.range(text, totalLines: 5, offset: 2, limit: 2).content, "2\n3")
    XCTAssertEqual(LocalRead.range(text, totalLines: 5, offset: -2, limit: nil).content, "4\n5")
    XCTAssertFalse(LocalRead.range(text, totalLines: 5, offset: 9, limit: nil).applied)
    XCTAssertFalse(LocalRead.range(text, totalLines: 5, offset: nil, limit: nil).applied)
    XCTAssertEqual(LocalRead.binaryRefusal("/a/b.ZIP"), "Binary files of type .zip are not supported by the read executor")
    XCTAssertEqual(LocalRead.binaryRefusal("/a/b"), "Binary files without an extension are not supported by the read executor")
    XCTAssertEqual(LocalRead.resolve("file:///Users/bass/a", root: "/Users/bass", home: "/Users/bass"), "/Users/bass/a")
    XCTAssertEqual(LocalRead.resolve("~/a/../b", root: "/r", home: "/Users/bass"), "/Users/bass/b")
    XCTAssertEqual(LocalRead.resolve("x", root: "/r", home: "/Users/bass"), "/r/x")
  }

  /** The terminal file as the box's await tool parses it (`await.ts` `parseFooter`, `parseRunningForMs`). */
  func testTheTerminalFile() throws {
    let started = Date(timeIntervalSince1970: 1_760_000_000.5)
    let head = TerminalFile.head(pid: 4242, cwd: "/Users/bass", command: "echo \"hi\"\tthere", title: "  ", status: "running", startedAt: started, runningForMs: 1500)
    XCTAssertEqual(head, "---\npid: 4242\ncwd: \"/Users/bass\"\ncommand: \"echo \\\"hi\\\"\\tthere\"\nstatus: running  \nstarted_at: 2025-10-09T08:53:20.500Z\nrunning_for_ms: 1500     \n---\n")
    XCTAssertEqual(head.count, TerminalFile.head(pid: 4242, cwd: "/Users/bass", command: "echo \"hi\"\tthere", title: nil, status: "succeeded", startedAt: started, runningForMs: 98765).count)
    let file = head + "hi\n" + TerminalFile.foot(exitCode: 0, elapsedMs: 1520, endedAt: started.addingTimeInterval(1.52))
    let footer = try XCTUnwrap(file.range(of: "\n---\n([\\s\\S]*?)\n---\\s*$", options: .regularExpression))
    XCTAssertTrue(file[footer].contains("exit_code: 0\nelapsed_ms: 1520\nended_at: "))
    XCTAssertNotNil(head.range(of: "running_for_ms:\\s*(\\d+)", options: .regularExpression))
    XCTAssertTrue(TerminalFile.foot(exitCode: nil, elapsedMs: 1, endedAt: started).contains("exit_code: unknown"))
  }

  func testTheShellsState() {
    let dump = "__SIMEON_ZSH_STATE_START__\n/Users/bass/app\n# zsh state dump\nexport A=1\n__SIMEON_ZSH_STATE_END__\n"
    XCTAssertEqual(ZshShell.parseState(dump)?.cwd, "/Users/bass/app")
    XCTAssertEqual(ZshShell.parseState(dump)?.state, "# zsh state dump\nexport A=1\n")
    XCTAssertEqual(ZshShell.parseState("Welcome!\n__SIMEON_STATE_MARKER__\n" + dump)?.cwd, "/Users/bass/app")
    XCTAssertNil(ZshShell.parseState("__SIMEON_ZSH_STATE_START__\nrelative\n__SIMEON_ZSH_STATE_END__\n"))
    XCTAssertNil(ZshShell.parseState("half a dump"))
    XCTAssertTrue(ZshShell.commandScript(pipeStdin: false).contains("builtin eval \"$1\" < /dev/null; }"))
    XCTAssertTrue(ZshShell.commandScript(pipeStdin: true).contains("builtin eval \"$1\"; }"))
    // Both ends of each saved part are Simeon's here.
    XCTAssertEqual(ZshShell.dumpScript.components(separatedBy: "SIMEON_SNAP_EOF_%s").count, 3)
    let env = ZshShell.environment(base: ["PATH": "/usr/bin"], root: "/Users/bass")
    XCTAssertEqual(env["SIMEON_AGENT"], "1")
    XCTAssertEqual(env["TERM"], "dumb")
    XCTAssertEqual(env["AGENT_TRANSCRIPTS"], "/Users/bass/agent-transcripts")
  }
}
