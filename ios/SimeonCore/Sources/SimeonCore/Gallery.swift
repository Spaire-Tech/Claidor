import Foundation

/**
 * How an agent's pictures sit under its message, the window's gallery
 * planner (its `Ni`): one row, 192 high at most and 64 at least, 6 apart,
 * each picture its own shape (4:3 when not known). All of them when they
 * fit at the lowest picture's height; else the most of three, then two,
 * that fit at 64 or more, the last showing "+N" for the rest (itself
 * included); else the first alone. The row is at most 86 % of the chat,
 * 560, and the chat less 82 (`widthFor`).
 */
public enum GalleryPlan {
  public static let height: Double = 192
  public static let minHeight: Double = 64
  public static let gap: Double = 6
  public static let maxFoldedTiles = 3
  public static let defaultAspect: Double = 4.0 / 3.0

  public struct Plan: Equatable, Sendable {
    public let height: Double
    /** One width per picture shown, in order. */
    public let widths: [Double]
    /** The number the last tile's "+N" shows (0 for none): the pictures not shown, and the one under it. */
    public let foldedCount: Int
  }

  /** The row's width in a chat `rowWidth` wide. */
  public static func width(for rowWidth: Double) -> Double {
    rowWidth <= 0 ? 0 : min(rowWidth * 86 / 100, 560, max(0, rowWidth - 82))
  }

  /** The plan for pictures of these sizes (nil when not known) in `availableWidth`. */
  public static func plan(sizes: [(width: Double, height: Double)?], availableWidth: Double, gap: Double = gap) -> Plan {
    let count = sizes.count
    guard availableWidth > 0 else { return Plan(height: height, widths: [], foldedCount: count) }
    let aspects = sizes.map(aspect(of:))
    let ceilings = sizes.map(ceiling(of:))
    let lowest = ceilings.reduce(height, min)
    if occupied(aspects, count, lowest, gap) <= availableWidth {
      return Plan(height: lowest, widths: widths(aspects, count, lowest, availableWidth), foldedCount: 0)
    }
    var tiles = min(maxFoldedTiles, count)
    while tiles > 1 {
      let fitted = fittedHeight(aspects, ceilings, tiles, availableWidth, gap)
      if !(fitted < minHeight) {
        return Plan(height: fitted, widths: widths(aspects, tiles, fitted, availableWidth), foldedCount: tiles < count ? count - (tiles - 1) : 0)
      }
      tiles -= 1
    }
    let first = ceilings.first ?? height
    return Plan(height: first, widths: widths(aspects, min(1, count), first, availableWidth), foldedCount: count > 1 ? count : 0)
  }

  static func aspect(of size: (width: Double, height: Double)?) -> Double {
    guard let size, size.width > 0, size.height > 0 else { return defaultAspect }
    return size.width / size.height
  }

  static func ceiling(of size: (width: Double, height: Double)?) -> Double {
    guard let size, size.height > 0 else { return height }
    return max(min(size.height, height), minHeight)
  }

  /** JavaScript's `Math.round`: halves go up. */
  static func round(_ value: Double) -> Double { (value + 0.5).rounded(.down) }

  static func occupied(_ aspects: [Double], _ count: Int, _ rowHeight: Double, _ gap: Double) -> Double {
    var total = Double(max(0, count - 1)) * gap
    for index in 0..<count { total += round(rowHeight * (index < aspects.count ? aspects[index] : 0)) }
    return total
  }

  static func fittedHeight(_ aspects: [Double], _ ceilings: [Double], _ count: Int, _ width: Double, _ gap: Double) -> Double {
    var rowHeight = height
    var sum = 0.0
    for index in 0..<count {
      rowHeight = min(rowHeight, index < ceilings.count ? ceilings[index] : height)
      sum += index < aspects.count ? aspects[index] : 0
    }
    guard sum > 0 else { return 0 }
    let room = width - Double(max(0, count - 1)) * gap
    rowHeight = min(rowHeight, (room / sum).rounded(.up))
    while rowHeight > 0 && occupied(aspects, count, rowHeight, gap) > width { rowHeight -= 1 }
    return rowHeight
  }

  static func widths(_ aspects: [Double], _ count: Int, _ rowHeight: Double, _ width: Double) -> [Double] {
    (0..<count).map { index in min(round(rowHeight * (index < aspects.count ? aspects[index] : 0)), width) }
  }
}
