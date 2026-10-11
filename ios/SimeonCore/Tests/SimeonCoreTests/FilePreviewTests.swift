import Foundation
import XCTest
@testable import SimeonCore

/**
 * The file preview against the window's own functions run on the same
 * input (`Fixtures/file-preview.json`): each name's kind and colouring
 * language (`gAe`, `Pwn`), a CSV's separator, rows and row count (`uvn`,
 * `lvn`, `cvn`), a JSON value's size (`_kn`), a picture's caption (`c7n`)
 * and a name's extension (`Nft`).
 */
final class FilePreviewTests: XCTestCase {
  private func fixture() throws -> JSON {
    let url = Bundle.module.url(forResource: "file-preview", withExtension: "json", subdirectory: "Fixtures")!
    return try JSON.parse(Data(contentsOf: url))
  }

  func testKindsAndLanguagesAsTheWindowPicksThem() throws {
    let cases = try fixture()["kinds"]?.array ?? []
    XCTAssertGreaterThan(cases.count, 20)
    for item in cases {
      let name = item["name"]?.string ?? ""
      XCTAssertEqual(FilePreview.kind(name).rawValue, item["kind"]?.string, name)
      XCTAssertEqual(FilePreview.language(name), item["language"]?.string, name)
    }
  }

  func testCSVAsTheWindowReadsIt() throws {
    let cases = try fixture()["csv"]?.array ?? []
    XCTAssertGreaterThan(cases.count, 8)
    for item in cases {
      let label = item["label"]?.string ?? ""
      let text = item["text"]?.string ?? ""
      let name = item["name"]?.string ?? ""
      let delimiter = FilePreview.delimiter(text, name: name)
      XCTAssertEqual(String(delimiter), item["delimiter"]?.string, label)
      let rows = (item["rows"]?.array ?? []).map { ($0.array ?? []).map { $0.string ?? "" } }
      let all = (item["all"]?.array ?? []).map { ($0.array ?? []).map { $0.string ?? "" } }
      XCTAssertEqual(FilePreview.rows(text, delimiter: delimiter, maxRows: 3), rows, label)
      XCTAssertEqual(FilePreview.rows(text, delimiter: delimiter), all, label)
      XCTAssertEqual(FilePreview.rowCount(text), item["total"]?.int, label)
    }
  }

  func testJSONSizesCaptionsAndExtensions() throws {
    let doc = try fixture()
    for item in doc["summaries"]?.array ?? [] {
      let value = try JSON.parse(Data((item["value"]?.string ?? "").utf8))
      let isList = value.array != nil
      let count = value.array?.count ?? value.object?.count ?? 0
      XCTAssertEqual(FilePreview.jsonSummary(isList: isList, count: count), item["summary"]?.string)
    }
    for item in doc["captions"]?.array ?? [] {
      let out = FilePreview.mediaCaption(caption: item["caption"]?.string, name: item["entryName"]?.string, source: item["source"]?.string ?? "", index: item["index"]?.int ?? 0, total: item["total"]?.int ?? 0)
      XCTAssertEqual(out, item["out"]?.string)
    }
    for item in doc["splits"]?.array ?? [] {
      let split = FilePreview.split(item["name"]?.string ?? "")
      XCTAssertEqual(split.base, item["base"]?.string)
      XCTAssertEqual(split.ext, item["ext"]?.string)
    }
  }

  func testLinesAndOpening() {
    XCTAssertEqual(FilePreview.rowsLine(4), "3 rows")
    XCTAssertEqual(FilePreview.rowsLine(2), "1 row")
    XCTAssertEqual(FilePreview.rowsLine(0), "0 rows")
    XCTAssertEqual(FilePreview.rowsLine(1205), "1,204 rows")
    XCTAssertEqual(FilePreview.pagesLine(1), "1 page")
    XCTAssertEqual(FilePreview.pagesLine(2), "2 pages")
    XCTAssertEqual(FilePreview.cellLabel(column: 1, row: 0, heading: "Revenue"), "Revenue · row 1")
    XCTAssertEqual(FilePreview.cellLabel(column: 2, row: -1, heading: ""), "Column 3 · header")
    XCTAssertEqual(FilePreview.wrap(-1, count: 3), 2)
    XCTAssertEqual(FilePreview.wrap(3, count: 3), 0)
    XCTAssertFalse(FilePreview.opens(.unknown, readsAsText: true))
    XCTAssertTrue(FilePreview.opens(.pdf, readsAsText: nil))
    XCTAssertFalse(FilePreview.opens(.markdown, readsAsText: nil))
    XCTAssertFalse(FilePreview.opens(.json, readsAsText: false))
    XCTAssertTrue(FilePreview.opens(.text, readsAsText: true))
    let sheet = FilePreview.sheet("Month,Revenue\nJuly,42000\nAugust,45500\n", name: "revenue.csv")
    XCTAssertEqual(sheet.rows.count, 3)
    XCTAssertEqual(sheet.totalRows, 3)
    XCTAssertEqual(FilePreview.lastPart("file:///home/box/docs/Q3%20report.pdf"), "Q3 report.pdf")
  }
}

/** The JSON tree against `JSON.parse` and `JSON.stringify` in Node (the window's engine reads JSON the same way). */
final class JSONTreeTests: XCTestCase {
  func testNamesInJavaScriptsOrder() {
    let tree = JSONTree.parse(#"{"b":1,"a":2,"10":3,"2":4,"-1":5,"01":6,"4294967295":7,"4294967294":8}"#)
    XCTAssertEqual(tree?.entries?.map(\.name), ["2", "10", "4294967294", "b", "a", "-1", "01", "4294967295"])
    let repeated = JSONTree.parse(#"{"dup":1,"other":2,"dup":3}"#)
    XCTAssertEqual(repeated?.entries?.map(\.name), ["dup", "other"])
    XCTAssertEqual(repeated?.entries?.first?.value, .number(3))
  }

  func testValuesAsStringifyWritesThem() {
    let tree = JSONTree.parse(#"[1.5,1e21,1e-7,123456789012345680000,0.1,-0,2.50,1E3,true,null,"xé\n"]"#)
    XCTAssertEqual(tree?.entries?.map(\.value.written), ["1.5", "1e+21", "1e-7", "123456789012345680000", "0.1", "0", "2.5", "1000", "true", "null", "\"xé\\n\""])
    XCTAssertEqual(JSONTree.number(12000), "12000")
    XCTAssertEqual(JSONTree.number(-4.25), "-4.25")
    XCTAssertEqual(JSONTree.number(0.000123), "0.000123")
    XCTAssertEqual(JSONTree.number(1e16), "10000000000000000")
    XCTAssertEqual(JSONTree.number(2.5e-7), "2.5e-7")
  }

  func testNotJSON() {
    XCTAssertNil(JSONTree.parse("{a:1}"))
    XCTAssertNil(JSONTree.parse("[1,]"))
    XCTAssertNil(JSONTree.parse("01"))
    XCTAssertNil(JSONTree.parse("{\"a\":1} x"))
    XCTAssertEqual(JSONTree.parse(" 3 "), .number(3))
    XCTAssertEqual(JSONTree.parse(#""😀""#), .string("😀"))
    XCTAssertEqual(JSONTree.parse(#"{"a":{"b":[1,{"c":null}]}}"#)?.entries?.first?.value.entries?.first?.value.isList, true)
  }
}
