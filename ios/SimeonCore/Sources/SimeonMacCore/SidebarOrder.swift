/**
 * The sidebar's order, for the window's keys (the Electron window's
 * `global-keyboard-shortcuts.ts`): ⌘1 to ⌘9 open the sidebar's first nine
 * agents, ⌥↑ and ⌥↓ the one above or below the open one. The order is the
 * sidebar's own: the pinned agents first, then the list (`AppStore.pinned`
 * then `AppStore.listed`, which leaves the pinned ones out).
 */
public enum SidebarOrder {
  /** The agent at `number` (1 to 9), or nil. */
  public static func agent(number: Int, in order: [String]) -> String? {
    guard (1...9).contains(number), number <= order.count else { return nil }
    return order[number - 1]
  }

  /**
   * The agent `step` places from `current` (-1 above, +1 below), stopping at
   * the ends. With none open, ⌥↓ opens the first and ⌥↑ the last; an open
   * agent no longer in the order (hidden meanwhile) counts as none.
   */
  public static func neighbour(of current: String?, in order: [String], step: Int) -> String? {
    guard !order.isEmpty, step != 0 else { return nil }
    guard let current, let index = order.firstIndex(of: current) else { return step > 0 ? order.first : order.last }
    let next = min(max(index + step, 0), order.count - 1)
    return next == index ? nil : order[next]
  }
}
