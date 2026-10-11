import XCTest
@testable import SimeonCore

/**
 * The rebuild lock against the shipped window's own code: `Fixtures/rebuild-lock.json`
 * was made by running the main bundle's `Kae`/`Qyn`/`e6n`/`yft` on random
 * events, `J1t` on every kind, stage and server phase, `FPt` on random
 * server events and `R$n` on random lock changes, and its confirmations'
 * words (`K1t`, `FAe`, `Gbn`, `zAe`, `RAe`).
 */
final class ComputerRebuildTests: XCTestCase {
  static let fixtures: JSON = {
    let url = Bundle.module.url(forResource: "rebuild-lock", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(String(contentsOf: url, encoding: .utf8))
  }()

  func event(_ e: JSON) -> RebuildLock.Event {
    let at = e["at"]!.double!
    switch e["type"]!.string! {
    case "request":
      return .request(RebuildLock.Kind(rawValue: e["kind"]!.string!)!, operationId: e["operationId"]?.string, source: e["source"]?.string.flatMap(RebuildLock.Source.init(rawValue:)), at: at)
    case "pending": return .pending(e["isPending"]!.bool!, at: at)
    case "acknowledged": return .acknowledged(at: at)
    case "image-update": return .imageUpdate(e["available"]?.bool, at: at)
    case "box": return .box(id: e["boxId"]?.string, phase: ComputerPhase(rawValue: e["phase"]!.string!)!, at: at)
    case "migration": return .migration(MigrationPhase(rawValue: e["phase"]!.string!)!, operationId: e["operationId"]?.string, at: at)
    case "connection": return .connection(e["isConnected"]!.bool!, at: at)
    case "error": return .error(at: at)
    case "deactivate": return .deactivate(at: at)
    default: return .tick(at: at)
    }
  }

  func fields(_ s: RebuildLock) -> [JSON] {
    func str(_ v: String?) -> JSON { v.map { .string($0) } ?? .null }
    func num(_ v: Double?) -> JSON { v.map { .number($0) } ?? .null }
    return [str(s.kind?.rawValue), str(s.operationId), str(s.updateSource?.rawValue), str(s.lockBoxId), .bool(s.isPending), .bool(s.hasRequestAcknowledgement),
            s.imageUpdateAvailable.map { .bool($0) } ?? .null, .bool(s.expectsImageUpgrade), .string(s.boxPhase.rawValue), str(s.observedBoxId), str(s.lastHealthyBoxId),
            .bool(s.hasLeftHealthy), .string(s.teardownObserved.rawValue), .bool(s.reconnectedSinceLeft), num(s.readySince), .bool(s.isConnected), num(s.connectedSince),
            str(s.resetOperationId), .bool(s.hasTerminalMigration), str(s.lastResolution?.rawValue), str(s.lastResolutionKind?.rawValue)]
  }

  func testLockFollowsTheWindow() {
    let keys = Self.fixtures["keys"]!.array!.map { $0.string! }
    var steps = 0
    for (n, sequence) in Self.fixtures["sequences"]!.array!.enumerated() {
      var lock = RebuildLock(phase: ComputerPhase(rawValue: sequence["phase"]!.string!)!, imageUpdateAvailable: sequence["image"]?.bool)
      for (i, step) in sequence["steps"]!.array!.enumerated() {
        let row = step.array!
        lock = lock.step(event(row[0]))
        let want = row[1].array!
        let got = fields(lock)
        for (k, key) in keys.enumerated() where got[k] != want[k] {
          XCTFail("sequence \(n) step \(i) (\(row[0])): \(key) is \(got[k]), the window has \(want[k])")
          return
        }
        XCTAssertEqual(lock.stage?.rawValue, row[2].string, "sequence \(n) step \(i): stage")
        XCTAssertEqual(lock.settleAt, row[3].double, "sequence \(n) step \(i): settle time")
        steps += 1
      }
    }
    XCTAssertGreaterThan(steps, 2000)
  }

  func testStepsAndProgress() {
    for p in Self.fixtures["projections"]!.array! {
      let row = p.array!
      let kind = RebuildLock.Kind(rawValue: row[0].string!)!
      let stage = RebuildLock.Stage(rawValue: row[1].string!)!
      let status = row[2].string.flatMap(MigrationPhase.init(rawValue:))
      let phases = row[3].array!.map { MigrationPhase(rawValue: $0.string!)! }
      let projected = RebuildSteps.project(kind: kind, stage: stage, status: status, phases: phases, pullPercent: row[4].double)
      XCTAssertEqual(projected.activeIndex, row[5].int, "\(row)")
      XCTAssertEqual(projected.progress, row[6].double!, accuracy: 1e-9, "\(row)")
    }
    let reset = RebuildSteps.project(kind: .reset, stage: .tearingDown, status: nil, phases: [], pullPercent: nil)
    XCTAssertEqual(reset.steps.map(\.label), RebuildSteps.resetLabels)
    XCTAssertEqual(reset.steps.map(\.state), [.done, .active, .pending, .pending, .pending, .pending])
  }

  func testMigrationRecord() {
    for steps in Self.fixtures["records"]!.array! {
      var record = MigrationRecord()
      for step in steps.array! {
        let e = step["event"]!
        record.ingest(e.isNull ? nil : MigrationEvent(operationId: e["operationId"]?.string, phase: MigrationPhase(rawValue: e["phase"]!.string!)!, detail: e["detail"]?.string ?? ""))
        XCTAssertEqual(record.phase?.rawValue, step["phase"]?.string, "\(step)")
        XCTAssertEqual(record.operationId, step["operationId"]?.string, "\(step)")
        XCTAssertEqual(record.phases.map(\.rawValue), step["phases"]!.array!.map { $0.string! }, "\(step)")
        XCTAssertEqual(record.last?.phase.rawValue, step["raw"]?["phase"]?.string, "\(step)")
      }
    }
  }

  func testSurface() {
    for steps in Self.fixtures["surfaces"]!.array! {
      var surface = RebuildSurface()
      for step in steps.array! {
        let input = step["input"]!
        switch input["action"]!.string! {
        case "lock":
          surface.lockChanged(.init(kind: input["kind"]?.string.flatMap(RebuildLock.Kind.init(rawValue:)), operationId: input["operationId"]?.string,
                                    boxId: input["boxId"]?.string, lastResolution: input["lastResolution"]?.string.flatMap(RebuildLock.Resolution.init(rawValue:))))
        case "pending": surface.pendingChanged(input["pendingKind"]?.string.flatMap(RebuildLock.Kind.init(rawValue:)))
        case "background": surface.continueInBackground()
        default: surface.restoreForeground()
        }
        XCTAssertEqual(surface.surface?.rawValue, step["surface"]?.string, "\(steps)")
      }
    }
  }

  func testWords() {
    let copy = Self.fixtures["copy"]!
    XCTAssertEqual(RebuildWords.updateIdle.title, copy["idle"]!["title"]!.string)
    XCTAssertEqual(RebuildWords.updateIdle.description, copy["idle"]!["description"]!.string)
    XCTAssertEqual(RebuildWords.updateIdle.confirm, copy["idle"]!["confirmLabel"]!.string)
    XCTAssertEqual(RebuildWords.updateIdle.cancel, copy["idle"]!["cancelLabel"]!.string)
    for (key, names) in [("one", ["Nora"]), ("oneBlank", ["  "]), ("two", ["Nora", "Ben"])] {
      let busy = RebuildWords.updateBusy(names)
      XCTAssertEqual(busy.title, copy[key]!["title"]!.string)
      XCTAssertEqual(busy.description, copy[key]!["description"]!.string)
      XCTAssertEqual(busy.confirm, copy[key]!["confirmLabel"]!.string)
      XCTAssertEqual(busy.secondary, copy[key]!["secondary"]!["label"]!.string)
    }
    for row in copy["lists"]!.array! {
      XCTAssertEqual(RebuildWords.nameList(row["names"]!.array!.map { $0.string! }), row["text"]!.string)
    }
    for row in copy["guards"]!.array! {
      XCTAssertEqual(RebuildWords.refusal(update: row["action"]!.string == "update", isBlocked: row["isBlocked"]!.bool!,
                                          pending: row["pendingKind"]?.string.flatMap(RebuildLock.Kind.init(rawValue:)),
                                          canReset: row["canReset"]!.bool!, canUpdate: row["canUpdate"]!.bool!), row["text"]?.string)
    }
    for row in copy["availability"]!.array! {
      XCTAssertEqual(RebuildWords.availability(canUpdateBaseline: row["canUpdateBaseline"]!.bool!, canUpdateBox: row["canUpdateBox"]!.bool!,
                                               isBoxUpToDate: row["isBoxUpToDate"]!.bool!, isUpdateQueued: row["isUpdateQueued"]!.bool!).rawValue, row["out"]!.string)
    }
  }
}
