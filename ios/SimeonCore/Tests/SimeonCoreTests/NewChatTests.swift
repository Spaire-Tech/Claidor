import XCTest
@testable import SimeonCore

/**
 * The new chat's To: line against the shipped window's own functions: the
 * expected values below were made by running the bundle's `Bie`, `M4n`,
 * `MFe`, `jj`, `Wf`, `P4n`, `Mte` and `J4n` in Node
 * (`newchat/fixtures.mjs` in the work notes), on these inputs.
 */
final class NewChatTests: XCTestCase {
  static let fixtures = #"""
{"agents":[{"id":"a0","name":"Simeon","isGroup":false},{"id":"a1","name":"Nora","isGroup":false},{"id":"a2","name":"Research Bot","isGroup":false},{"id":"a3","name":"Inbox","isGroup":false},{"id":"a4","name":"Sales & Marketing","isGroup":false},{"id":"a5","name":"Café Owner","isGroup":false},{"id":"a6","name":"Ünïcode_Bot","isGroup":false},{"id":"a7","name":"nora-2","isGroup":false},{"id":"a8","name":"Travel","isGroup":false},{"id":"a9","name":"Finance","isGroup":false},{"id":"a10","name":"Simeon, Nora","isGroup":true},{"id":"a11","name":"Content Writer","isGroup":false},{"id":"a12","name":"R2-D2","isGroup":false},{"id":"a13","name":"Ångström","isGroup":false},{"id":"a14","name":"São Paulo Desk","isGroup":false},{"id":"a15","name":"Zoë","isGroup":false},{"id":"a16","name":"news","isGroup":false},{"id":"a17","name":"Recruiter","isGroup":false}],"search":[{"recipients":[],"query":"","rows":["create-new","agent:a0","agent:a1","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a10","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[],"query":"  ","rows":["create-new","agent:a0","agent:a1","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a10","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[],"query":"n","rows":["create:n","agent:a1","agent:a16","agent:a7","agent:a3","agent:a13","agent:a6","agent:a9","agent:a11","agent:a0","agent:a10","agent:a5","agent:a4"],"highlight":1},{"recipients":[],"query":"no","rows":["create:no","agent:a1","agent:a7","agent:a3","agent:a13","agent:a6","agent:a10"],"highlight":1},{"recipients":[],"query":"nora","rows":["agent:a1","agent:a7","agent:a10"],"highlight":0},{"recipients":[],"query":"NORA","rows":["agent:a1","agent:a7","agent:a10"],"highlight":0},{"recipients":[],"query":"res bot","rows":["create:res bot","agent:a2"],"highlight":1},{"recipients":[],"query":"rb","rows":["create:rb"],"highlight":0},{"recipients":[],"query":"sim","rows":["create:sim","agent:a0","agent:a10"],"highlight":1},{"recipients":[],"query":"café","rows":["create:café","agent:a5"],"highlight":1},{"recipients":[],"query":"cafe","rows":["create:cafe","agent:a5"],"highlight":1},{"recipients":[],"query":"unicode","rows":["create:unicode","agent:a6"],"highlight":1},{"recipients":[],"query":"u b","rows":["create:u b","agent:a6"],"highlight":1},{"recipients":[],"query":"ang","rows":["create:ang","agent:a13"],"highlight":1},{"recipients":[],"query":"sao","rows":["create:sao","agent:a14","agent:a2"],"highlight":1},{"recipients":[],"query":"zoe","rows":["agent:a15"],"highlight":0},{"recipients":[],"query":"xyz","rows":["create:xyz"],"highlight":0},{"recipients":[],"query":"s","rows":["create:s","agent:a0","agent:a10","agent:a14","agent:a4","agent:a16","agent:a2","agent:a13"],"highlight":1},{"recipients":[],"query":"r","rows":["create:r","agent:a12","agent:a17","agent:a2","agent:a8","agent:a1","agent:a7","agent:a13","agent:a4","agent:a5","agent:a10","agent:a11"],"highlight":1},{"recipients":[],"query":"sales marketing","rows":["agent:a4"],"highlight":0},{"recipients":[],"query":"r2","rows":["create:r2","agent:a12","agent:a7"],"highlight":1},{"recipients":[],"query":"d2","rows":["create:d2","agent:a12"],"highlight":1},{"recipients":[],"query":"news ","rows":["agent:a16"],"highlight":0},{"recipients":[],"query":"Simeon, Nora","rows":["agent:a10"],"highlight":0},{"recipients":[],"query":"in","rows":["create:in","agent:a3","agent:a9","agent:a4","agent:a0","agent:a10"],"highlight":1},{"recipients":[],"query":"ow","rows":["create:ow","agent:a5"],"highlight":1},{"recipients":[],"query":"tr","rows":["create:tr","agent:a8","agent:a13","agent:a17"],"highlight":1},{"recipients":[],"query":"fin","rows":["create:fin","agent:a9"],"highlight":1},{"recipients":[],"query":"c w","rows":["create:c w","agent:a11","agent:a5"],"highlight":1},{"recipients":[],"query":"a","rows":["create:a","agent:a13","agent:a5","agent:a8","agent:a1","agent:a14","agent:a4","agent:a7","agent:a9","agent:a2","agent:a10"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"","rows":["agent:a0","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"  ","rows":["agent:a0","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"n","rows":["create:n","agent:a16","agent:a7","agent:a3","agent:a13","agent:a6","agent:a9","agent:a11","agent:a0","agent:a5","agent:a4"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"no","rows":["create:no","agent:a7","agent:a3","agent:a13","agent:a6"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"nora","rows":["create:nora","agent:a7"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"NORA","rows":["create:NORA","agent:a7"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"res bot","rows":["create:res bot","agent:a2"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"rb","rows":["create:rb"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"sim","rows":["create:sim","agent:a0"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"café","rows":["create:café","agent:a5"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"cafe","rows":["create:cafe","agent:a5"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"unicode","rows":["create:unicode","agent:a6"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"u b","rows":["create:u b","agent:a6"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"ang","rows":["create:ang","agent:a13"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"sao","rows":["create:sao","agent:a14","agent:a2"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"zoe","rows":["agent:a15"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"xyz","rows":["create:xyz"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"s","rows":["create:s","agent:a0","agent:a14","agent:a4","agent:a16","agent:a2","agent:a13"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"r","rows":["create:r","agent:a12","agent:a17","agent:a2","agent:a8","agent:a7","agent:a13","agent:a4","agent:a5","agent:a11"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"sales marketing","rows":["agent:a4"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"r2","rows":["create:r2","agent:a12","agent:a7"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"d2","rows":["create:d2","agent:a12"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"news ","rows":["agent:a16"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"Simeon, Nora","rows":["create:Simeon, Nora"],"highlight":0},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"in","rows":["create:in","agent:a3","agent:a9","agent:a4","agent:a0"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"ow","rows":["create:ow","agent:a5"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"tr","rows":["create:tr","agent:a8","agent:a13","agent:a17"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"fin","rows":["create:fin","agent:a9"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"c w","rows":["create:c w","agent:a11","agent:a5"],"highlight":1},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"a","rows":["create:a","agent:a13","agent:a5","agent:a8","agent:a14","agent:a4","agent:a7","agent:a9","agent:a2"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"","rows":["agent:a0","agent:a1","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"  ","rows":["agent:a0","agent:a1","agent:a2","agent:a3","agent:a4","agent:a5","agent:a6","agent:a7","agent:a8","agent:a9","agent:a11","agent:a12","agent:a13","agent:a14","agent:a15","agent:a16","agent:a17"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"n","rows":["create:n","agent:a1","agent:a16","agent:a7","agent:a3","agent:a13","agent:a6","agent:a9","agent:a11","agent:a0","agent:a5","agent:a4"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"no","rows":["create:no","agent:a1","agent:a7","agent:a3","agent:a13","agent:a6"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"nora","rows":["agent:a1","agent:a7"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"NORA","rows":["agent:a1","agent:a7"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"res bot","rows":["create:res bot","agent:a2"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"rb","rows":["create:rb"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"sim","rows":["create:sim","agent:a0"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"café","rows":["create:café","agent:a5"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"cafe","rows":["create:cafe","agent:a5"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"unicode","rows":["create:unicode","agent:a6"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"u b","rows":["create:u b","agent:a6"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"ang","rows":["create:ang","agent:a13"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"sao","rows":["create:sao","agent:a14","agent:a2"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"zoe","rows":["agent:a15"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"xyz","rows":["create:xyz"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"s","rows":["create:s","agent:a0","agent:a14","agent:a4","agent:a16","agent:a2","agent:a13"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"r","rows":["create:r","agent:a12","agent:a17","agent:a2","agent:a8","agent:a1","agent:a7","agent:a13","agent:a4","agent:a5","agent:a11"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"sales marketing","rows":["agent:a4"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"r2","rows":["create:r2","agent:a12","agent:a7"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"d2","rows":["create:d2","agent:a12"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"news ","rows":["agent:a16"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"Simeon, Nora","rows":["create:Simeon, Nora"],"highlight":0},{"recipients":[{"kind":"new","name":"Bob"}],"query":"in","rows":["create:in","agent:a3","agent:a9","agent:a4","agent:a0"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"ow","rows":["create:ow","agent:a5"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"tr","rows":["create:tr","agent:a8","agent:a13","agent:a17"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"fin","rows":["create:fin","agent:a9"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"c w","rows":["create:c w","agent:a11","agent:a5"],"highlight":1},{"recipients":[{"kind":"new","name":"Bob"}],"query":"a","rows":["create:a","agent:a13","agent:a5","agent:a8","agent:a1","agent:a14","agent:a4","agent:a7","agent:a9","agent:a2"],"highlight":1}],"scores":[{"hay":"nora","token":"n","score":4.92},{"hay":"research bot","token":"rb","score":null},{"hay":"research bot","token":"rsb","score":null},{"hay":"abcdefghij","token":"aj","score":null},{"hay":"abcdefghij","token":"ad","score":5.8},{"hay":"sales marketing","token":"sm","score":null},{"hay":"ab","token":"abc","score":null},{"hay":"a-b","token":"b","score":4.74},{"hay":"x/y.z","token":"z","score":4.5},{"hay":"","token":"","score":0},{"hay":"simeon","token":"sim","score":12.88},{"hay":"aaaa","token":"aa","score":8.92}],"norm":[{"s":"Café — Ünïcode_Bot!","n":"cafe unicode bot","tokens":["cafe","unicode","bot"]},{"s":"  a--b  ","n":"a b","tokens":["a","b"]},{"s":"ＡＢＣ","n":"abc","tokens":["abc"]},{"s":"１２３ go","n":"123 go","tokens":["123","go"]},{"s":"ﬁle","n":"file","tokens":["file"]},{"s":"x́y","n":"xy","tokens":["xy"]},{"s":"日本語 テスト","n":"日本語 テスト","tokens":["日本語","テスト"]},{"s":"","n":"","tokens":[]},{"s":".,!","n":"","tokens":[]}],"sentence":[{"s":"","v":false},{"s":"hi","v":false},{"s":"Book me a flight.","v":true},{"s":"what now?","v":true},{"s":"Wow!","v":true},{"s":"one two three four five","v":false},{"s":"one two three four five six","v":true},{"s":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","v":false},{"s":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","v":true},{"s":"  spaced  ","v":false}],"clean":[{"s":"  a   b  ","v":"a b"},{"s":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","v":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},{"s":"line\nbreak\ttab","v":"line break tab"}],"commits":[{"recipients":[],"query":"","highlighted":null,"out":"noop"},{"recipients":[],"query":"","highlighted":{"kind":"create-new"},"out":"single new:New Agent"},{"recipients":[],"query":"bob","highlighted":{"kind":"create","name":"bob"},"out":"single new:bob"},{"recipients":[],"query":"no","highlighted":{"kind":"agent","agent":{"id":"a1","name":"Nora","isGroup":false}},"out":"single agent:a1"},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"","highlighted":{"kind":"agent","agent":{"id":"a0","name":"Simeon","isGroup":false}},"out":"single agent:a1"},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"sim","highlighted":{"kind":"agent","agent":{"id":"a0","name":"Simeon","isGroup":false}},"out":"group agent:a1|agent:a0"},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"bob","highlighted":{"kind":"create","name":"bob"},"out":"group agent:a1|new:bob"},{"recipients":[{"kind":"new","name":"Bob"}],"query":"BOB","highlighted":{"kind":"create","name":"BOB"},"out":"single new:Bob"},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"},{"kind":"agent","id":"a0","name":"Simeon"}],"query":"","highlighted":null,"out":"group agent:a1|agent:a0"},{"recipients":[{"kind":"agent","id":"a1","name":"Nora"}],"query":"nor","highlighted":{"kind":"agent","agent":{"id":"a1","name":"Nora","isGroup":false}},"out":"single agent:a1"}]}
"""#

  lazy var data: JSON = try! JSON.parse(Self.fixtures)

  func recipients(_ list: JSON?) -> [NewChat.Recipient] {
    (list?.array ?? []).map { r in
      r["kind"]?.text == "agent" ? .agent(id: r["id"]!.text!, name: r["name"]!.text!) : .new(name: r["name"]!.text!)
    }
  }

  func label(_ row: NewChat.Row) -> String {
    switch row {
    case .createNew: return "create-new"
    case .create(let name): return "create:" + name
    case .agent(let id, _, _): return "agent:" + id
    }
  }

  func testSearchRowsAndHighlight() {
    let candidates = data["agents"]!.array!.map {
      NewChat.Candidate(id: $0["id"]!.text!, name: $0["name"]!.text!, isGroup: $0["isGroup"]!.bool!)
    }
    var checked = 0
    for case let item in data["search"]!.array! {
      let query = item["query"]!.string!
      let rows = NewChat.rows(candidates: candidates, recipients: recipients(item["recipients"]), query: query)
      XCTAssertEqual(rows.map(label), item["rows"]!.array!.map { $0.string! }, "query \(query.debugDescription) with \(item["recipients"]!.array!.count) picked")
      XCTAssertEqual(NewChat.defaultHighlight(rows, query: query), item["highlight"]!.int!, "highlight for \(query.debugDescription)")
      checked += 1
    }
    XCTAssertEqual(checked, 90)
  }

  func testScoresAndNormalising() {
    for item in data["scores"]!.array! {
      let got = NewChat.fuzzyScore(item["hay"]!.string!, item["token"]!.string!)
      if let want = item["score"]?.double {
        XCTAssertEqual(got ?? -1, want, accuracy: 1e-9, "\(item["hay"]!.string!) / \(item["token"]!.string!)")
      } else {
        XCTAssertNil(got, "\(item["hay"]!.string!) / \(item["token"]!.string!)")
      }
    }
    for item in data["norm"]!.array! {
      let s = item["s"]!.string!
      XCTAssertEqual(NewChat.normalized(s), item["n"]!.string!, s)
      XCTAssertEqual(NewChat.tokens(s), item["tokens"]!.array!.map { $0.string! }, s)
    }
    XCTAssertEqual(data["scores"]!.array!.count, 12)
    XCTAssertEqual(data["norm"]!.array!.count, 9)
  }

  func testSentencesNamesAndEnter() {
    for item in data["sentence"]!.array! {
      XCTAssertEqual(NewChat.looksLikeSentence(item["s"]!.string!), item["v"]!.bool!, item["s"]!.string!)
    }
    for item in data["clean"]!.array! {
      XCTAssertEqual(NewChat.cleanName(item["s"]!.string!), item["v"]!.string!)
    }
    func fmt(_ r: NewChat.Recipient) -> String {
      switch r {
      case .agent(let id, _): return "agent:" + id
      case .new(let name): return "new:" + name
      }
    }
    var checked = 0
    for item in data["commits"]!.array! {
      let lit: NewChat.Row?
      if let h = item["highlighted"], h != .null {
        switch h["kind"]!.text! {
        case "create-new": lit = .createNew
        case "create": lit = .create(name: h["name"]!.string!)
        default: lit = .agent(id: h["agent"]!["id"]!.text!, name: h["agent"]!["name"]!.string!, isGroup: h["agent"]!["isGroup"]!.bool!)
        }
      } else { lit = nil }
      let got: String
      switch NewChat.commit(recipients: recipients(item["recipients"]), query: item["query"]!.string!, highlighted: lit) {
      case .noop: got = "noop"
      case .single(let r): got = "single " + fmt(r)
      case .group(let list): got = "group " + list.map(fmt).joined(separator: "|")
      }
      XCTAssertEqual(got, item["out"]!.string!)
      checked += 1
    }
    XCTAssertEqual(checked, 10)
  }

  func testWordsAndLimits() {
    XCTAssertEqual(NewChat.Row.create(name: "Ada").label, "Create \u{201C}Ada\u{201D}")
    XCTAssertEqual(NewChat.composerPlaceholder(recipients: []), "Message Agent")
    XCTAssertEqual(NewChat.composerPlaceholder(recipients: [.agent(id: "1", name: "Nora"), .new(name: "New Agent")]), "Message Nora, New Agent")
    XCTAssertEqual(NewChat.groupName([.agent(id: "1", name: "Nora"), .new(name: "Bob")]), "Nora, Bob")
    var line: [NewChat.Recipient] = []
    for i in 0..<8 { if let next = NewChat.adding(.new(name: "N\(i)"), to: line) { line = next } }
    XCTAssertEqual(line.count, 6)
    XCTAssertNil(NewChat.adding(.new(name: "n 0"), to: [.new(name: "N-0")]))
    XCTAssertTrue(NewChat.commitsAtOnce(.create(name: "x"), recipientCount: 0))
    XCTAssertFalse(NewChat.commitsAtOnce(.create(name: "x"), recipientCount: 1))
    XCTAssertEqual(NewChat.commit(recipients: line, query: "zed", highlighted: .create(name: "zed")), .group(line))
  }
}
