import SwiftUI
import SimeonCore

/**
 * The list open over the composer (":", "@", "/" or "#"), as the window
 * draws its menus: each row its icon, its name, a line beside it and a tag
 * at the end ("Agent", "Group", "Routine", "Plugin", "Skill", "Action");
 * the lit row moves with the arrow keys and the pointer; with nothing to
 * offer, why, and "Press Esc to close".
 */
struct ComposerListPanel: View {
  let items: [ComposerListItem]
  @Binding var highlighted: Int
  /** Shown when there are no rows ("No matches for “ne”"). */
  var emptyText: String?
  /** The list's name to VoiceOver ("Mention", "Reference a skill", "Pull request", "Emoji"). */
  let label: String
  var rowHeight: CGFloat = 40
  var maxHeight: CGFloat = 320
  let pick: (Int) -> Void

  var body: some View {
    if items.isEmpty, let emptyText {
      VStack(alignment: .leading, spacing: 2) {
        Text(emptyText).font(.system(size: 14)).foregroundStyle(Ink.primary)
        Text("Press Esc to close").font(.system(size: 12)).foregroundStyle(Ink.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 14).padding(.vertical, 10)
      .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .accessibilityElement(children: .combine)
    } else if !items.isEmpty {
      ScrollViewReader { proxy in
        SuggestionList(rows: items.count, rowHeight: rowHeight, maxHeight: maxHeight) {
          ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            Button { pick(index) } label: {
              ComposerListRow(item: item, lit: index == highlighted, height: rowHeight)
            }
            .buttonStyle(.plain)
            .id(index)
            .onHover { inside in if inside && highlighted != index { highlighted = index } }
            .accessibilityAddTraits(index == highlighted ? .isSelected : [])
          }
        }
        .onChange(of: highlighted) { _, index in withAnimation(.easeOut(duration: 0.1)) { proxy.scrollTo(index) } }
      }
      .accessibilityLabel(label)
    }
  }
}

/** One row a composer list offers. */
struct ComposerListItem: Identifiable, Equatable {
  enum Icon: Equatable {
    case emoji(String)
    case agent(id: String)
    case everyone
    case symbol(String)
    case connector(String)
  }

  let id: String
  let icon: Icon
  let label: String
  var detail: String?
  var trailing: String?
}

struct ComposerListRow: View {
  let item: ComposerListItem
  let lit: Bool
  let height: CGFloat
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    HStack(spacing: 10) {
      icon.frame(width: 24, height: 24).accessibilityHidden(true)
      Text(item.label).font(.system(size: 15)).foregroundStyle(Ink.primary).lineLimit(1)
      if let detail = item.detail, !detail.isEmpty {
        Text(detail).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      Spacer(minLength: 4)
      if let trailing = item.trailing, !trailing.isEmpty {
        Text(trailing).font(.system(size: 11, weight: .medium)).foregroundStyle(Ink.tertiary)
      }
    }
    .padding(.horizontal, 10)
    .frame(height: height)
    .background(lit ? Color.accentColor.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .padding(.horizontal, 4)
    .contentShape(.rect)
  }

  @ViewBuilder
  private var icon: some View {
    switch item.icon {
    case .emoji(let character):
      Text(character).font(.system(size: 20))
    case .agent(let id):
      ButterflyView(palette: .named(store.mentionNames.first { $0.id == id }?.colour ?? AgentPalette.defaultColour(forAgentId: id)))
    case .everyone:
      Text("@").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.blue)
        .frame(width: 22, height: 22).background(Ink.field, in: Circle())
    case .symbol(let name):
      Image(systemName: name).font(.system(size: 14)).foregroundStyle(Ink.secondary)
    case .connector(let name):
      if let logo = MentionArt.connector(name) {
        Image(uiImage: logo.resolved(scheme)).resizable().scaledToFit().frame(width: 18, height: 18)
      } else {
        Image(systemName: "powerplug").font(.system(size: 14)).foregroundStyle(Ink.secondary)
      }
    }
  }
}

/**
 * Which list is open over the composer, and what it offers: the window's
 * menus for "@" (`F5n`), "/" (`o5n`), "#" (`Nyn`) and ":" (its emoji list).
 */
enum ComposerOpenList {
  case mention(ComposerLists.Trigger, [ComposerLists.MentionRow])
  case slash(ComposerLists.Trigger, [ComposerLists.SlashItem], hasAny: Bool)
  case pulls(ComposerLists.Trigger, [ComposerMenus.PullRequest])
  case emoji(at: Int, query: String, [Emoji])

  /** The trigger character (for Esc's memory) and where it is. */
  var trigger: (character: Character, at: Int) {
    switch self {
    case .mention(let t, _): return ("@", t.at)
    case .slash(let t, _, _): return ("/", t.at)
    case .pulls(let t, _): return ("#", t.at)
    case .emoji(let at, _, _): return (":", at)
    }
  }

  var count: Int {
    switch self {
    case .mention(_, let rows): return rows.count
    case .slash(_, let items, _): return items.count
    case .pulls(_, let pulls): return pulls.count
    case .emoji(_, _, let found): return found.count
    }
  }

  /** "@" shows with rows or a name typed; "/" whenever it is open; "#" and ":" only with something to offer. */
  var isVisible: Bool {
    switch self {
    case .mention(let t, let rows): return !rows.isEmpty || !t.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .slash: return true
    case .pulls(_, let pulls): return !pulls.isEmpty
    case .emoji(_, _, let found): return !found.isEmpty
    }
  }

  /** Changes when the lit row should go back to the first. */
  var identity: String {
    switch self {
    case .mention(let t, _): return "@\(t.at):\(t.query)"
    case .slash(let t, let items, _): return "/\(t.at):\(t.query):\(items.map(\.id).joined(separator: ","))"
    case .pulls(let t, _): return "#\(t.at):\(t.query)"
    case .emoji(let at, let query, _): return ":\(at):\(query)"
    }
  }

  var items: [ComposerListItem] {
    switch self {
    case .mention(_, let rows):
      return rows.map { row in
        let icon: ComposerListItem.Icon
        switch row.icon {
        case .everyone: icon = .everyone
        case .agent(let id): icon = .agent(id: id)
        case .group: icon = .symbol("person.3")
        case .routine: icon = .symbol("clock")
        case .connector(_, _, let name): icon = .connector(name)
        }
        return ComposerListItem(id: row.key, icon: icon, label: row.label, detail: row.subtitle, trailing: row.tag)
      }
    case .slash(_, let items, _):
      return items.map { item in
        if case .action = item { return ComposerListItem(id: item.id, icon: .symbol("command"), label: item.label, detail: item.subtitle, trailing: item.tag) }
        return ComposerListItem(id: item.id, icon: .symbol("cube"), label: item.label, detail: item.subtitle, trailing: item.tag)
      }
    case .pulls(_, let pulls):
      return pulls.map { ComposerListItem(id: "pr-\($0.number)", icon: .symbol("arrow.triangle.pull"), label: "#\($0.number)", detail: $0.title) }
    case .emoji(_, _, let found):
      return found.map { ComposerListItem(id: $0.id, icon: .emoji($0.character), label: ":\($0.id):", detail: $0.name) }
    }
  }

  var emptyText: String? {
    switch self {
    case .mention(let t, _): return ComposerLists.mentionEmptyText(t.query)
    case .slash(let t, _, let hasAny): return ComposerLists.slashEmptyText(t.query, hasAny: hasAny)
    case .pulls, .emoji: return nil
    }
  }

  var label: String {
    switch self {
    case .mention: return "Mention"
    case .slash: return "Reference a skill"
    case .pulls: return "Pull request"
    case .emoji: return "Emoji"
    }
  }

  var rowHeight: CGFloat {
    if case .emoji = self { return 36 }
    return 40
  }

  var maxHeight: CGFloat {
    switch self {
    case .mention, .slash: return 320
    case .pulls: return 300
    case .emoji: return 260
    }
  }
}
