import AppKit
import SwiftUI
import SimeonCore

// MARK: What the field reports

/** The list a trigger before the caret opens: which, what was typed after it, where it is in the field's text (UTF-16), and its line on screen. */
struct PickRequest: Equatable {
  enum Kind: Equatable { case mention, slash, pull, emoji }

  let kind: Kind
  let query: String
  /** From the trigger to the caret: what a pick replaces. */
  let range: NSRange
  /** The trigger's line in the field (top left origin): the list sits 4 over it, from the trigger's left. */
  let anchor: CGRect
}

/** A key the field passes to an open list. */
enum ListKey { case up, down, choose, close }

// MARK: The lists' state

/**
 * The message field's lists (step 2e): "@" agents, groups, routines and
 * apps (`Mention`), "/" skills and the app's actions (`Reference a
 * skill`), "#" the pull requests the chat named, ":" emoji. Which is open,
 * the row chosen, an Escape that keeps one shut where it was put away, and
 * what was picked lately (the window's local storage, the Mac's defaults).
 */
@MainActor
@Observable
final class ComposerPicks {
  var request: PickRequest?
  var selected = 0
  /** Where Escape put a list away (`Dismissal`): it stays shut until that trigger is gone or another opens. */
  var dismissedAt: Int?
  /** The agent's skills ("/") and routines ("@"), read once its chat opens (`getAgentWorkflows`). */
  var skills: [ComposerMenus.Skill] = []
  var routines: [ComposerMenus.Skill] = []
  var mentionRecents: [String] = UserDefaults.standard.stringArray(forKey: "simeon.mentionRecents") ?? []
  var emojiRecents: [String] = UserDefaults.standard.stringArray(forKey: "simeon.emojiRecents") ?? []

  /** What the field asks, Escape's dismissal applied. */
  func update(_ next: PickRequest?) {
    guard let next else {
      dismissedAt = nil
      request = nil
      return
    }
    if let dismissedAt {
      if dismissedAt == next.range.location { request = nil; return }
      self.dismissedAt = nil
    }
    if request?.kind != next.kind || request?.query != next.query || request?.range.location != next.range.location { selected = 0 }
    request = next
  }

  func dismiss() {
    dismissedAt = request?.range.location
    request = nil
  }

  func rememberMention(_ key: String) {
    mentionRecents = ComposerLists.rememberingMention(key, in: mentionRecents)
    UserDefaults.standard.set(mentionRecents, forKey: "simeon.mentionRecents")
  }

  func rememberEmoji(_ id: String) {
    emojiRecents = EmojiCatalog.remembering(id, in: emojiRecents)
    UserDefaults.standard.set(emojiRecents, forKey: "simeon.emojiRecents")
  }

  func load(_ agentId: String, store: AppStore) async {
    let answer = await store.workflows(agentId)
    skills = ComposerMenus.skills(from: answer)
    routines = ComposerMenus.skills(from: answer, scheduled: true)
  }
}

/** One row of an open list. */
enum PickRow: Identifiable {
  case mention(ComposerLists.MentionRow)
  case slash(ComposerLists.SlashItem)
  case pull(ComposerMenus.PullRequest)
  case emoji(Emoji)

  var id: String {
    switch self {
    case .mention(let row): return "m:" + row.key
    case .slash(let item): return "s:" + item.id
    case .pull(let pull): return "p:\(pull.number)"
    case .emoji(let emoji): return "e:" + emoji.id
    }
  }
}

extension ComposerPicks {
  /** The rows for the open list, as the window filters them. */
  func rows(agentId: String, store: AppStore) -> [PickRow] {
    guard let request else { return [] }
    switch request.kind {
    case .mention:
      let agent = store.agent(agentId)
      let members = ComposerLists.mentionMembers(current: agent, roster: store.agents)
      let all = ComposerLists.mentionRows(members: members, isGroupChat: agent?.isGroup ?? false, routines: routines, connectors: ComposerLists.mentionConnectors(store.apps))
      return ComposerLists.filterMentions(all, query: request.query, recents: mentionRecents).map(PickRow.mention)
    case .slash:
      return ComposerLists.slashItems(skills: skills, actions: actions(agentId: agentId, store: store), query: request.query).map(PickRow.slash)
    case .pull:
      let pulls = ComposerLists.pullCandidates(store.transcripts[agentId] ?? [])
      return ComposerLists.filterPulls(pulls, query: request.query).map(PickRow.pull)
    case .emoji:
      return EmojiCatalog.suggestions(request.query, recent: emojiRecents).map(PickRow.emoji)
    }
  }

  /** The app's actions "/" offers in this chat. */
  func actions(agentId: String, store: AppStore) -> [ComposerLists.Action] {
    ComposerLists.appActions(isGroup: store.agent(agentId)?.isGroup ?? false, hasHiddenAgents: store.agents.contains { $0.isHidden })
  }

  /** What an open list with nothing to offer says: "@" and "/" say so, "#" and ":" close. */
  func emptyLine(agentId: String, store: AppStore) -> String? {
    guard let request else { return nil }
    switch request.kind {
    case .mention: return ComposerLists.mentionEmptyText(request.query)
    case .slash: return ComposerLists.slashEmptyText(request.query, hasAny: !skills.isEmpty || !actions(agentId: agentId, store: store).isEmpty)
    case .pull, .emoji: return nil
    }
  }
}

// MARK: The list over the field

/**
 * A list over the field (`sand-reference-menu`): 4 over the trigger's line
 * and from its left, 360 wide on the chat's ground with a hairline (15%)
 * and, on light, a soft shadow, 12 round; its rows 2 apart, padded 6, up
 * to 320 high, then it scrolls. A row (28, padded 6 8, 6 round, grey when
 * chosen): its picture (16), its name (13), what it is beside it at 40%,
 * and its kind at the right ("Agent", "Group", "Routine", "Plugin",
 * "Skill", "Action"). Emoji (`sand-emoji-menu`): 320 wide, 14 round, rows 1
 * apart, padded 4, up to 260 high; the emoji, ":shortcode:" (13) and its
 * name (11, at 40%), 8 apart, 10 round. Nothing found: "No matches for
 * “…”" (13) over "Press Esc to close" (11, at 40%), padded 8 12.
 */
struct PickList: View {
  let kind: PickRequest.Kind
  let rows: [PickRow]
  let empty: String?
  let selected: Int
  let look: Look
  let hover: (Int) -> Void
  let choose: (PickRow) -> Void

  private var isEmoji: Bool { kind == .emoji }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: isEmoji ? 14 : 12)
    Group {
      if rows.isEmpty, let empty {
        VStack(alignment: .leading, spacing: 2) {
          Text(empty)
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
            .cssLineHeight(17, size: 13)
          Text("Press Esc to close")
            .font(.system(size: 11))
            .foregroundStyle(look.inkTertiary)
            .cssLineHeight(14, size: 11)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        ScrollViewReader { reader in
          ScrollView {
            VStack(spacing: isEmoji ? 1 : 2) {
              ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                Button { choose(row) } label: { line(row, chosen: index == selected) }
                  .buttonStyle(.plain)
                  .focusable(false)
                  .onHover { inside in if inside { hover(index) } }
                  .id(row.id)
              }
            }
            .padding(isEmoji ? 4 : 6)
          }
          .scrollIndicators(.never)
          .frame(maxHeight: isEmoji ? 260 : 320)
          .fixedSize(horizontal: false, vertical: true)
          .onChange(of: selected) { _, index in
            guard rows.indices.contains(index) else { return }
            reader.scrollTo(rows[index].id)
          }
        }
      }
    }
    .frame(width: isEmoji ? 320 : 360)
    .background(look.ground, in: shape)
    .overlay { shape.strokeBorder(look.ink.opacity(isEmoji ? 0.1 : 0.15), lineWidth: 1) }
    .clipShape(shape)
    .shadow(color: isEmoji ? Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255).opacity(0.18) : .black.opacity(look.dark ? 0 : 0.1), radius: isEmoji ? 12 : 8, x: 0, y: isEmoji ? 8 : 10)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(kind == .mention ? "Mention" : kind == .slash ? "Reference a skill" : kind == .emoji ? "Emoji" : "Pull requests")
  }

  @ViewBuilder
  private func line(_ row: PickRow, chosen: Bool) -> some View {
    switch row {
    case .emoji(let emoji):
      HStack(spacing: 8) {
        Text(emoji.character)
          .font(.system(size: 13))
          .frame(width: 20)
        Text(":\(emoji.shortcodes.first ?? emoji.id):")
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .fixedSize()
        Text(emoji.name)
          .font(.system(size: 11))
          .foregroundStyle(look.inkTertiary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 8)
      .frame(height: 28)
      .background(chosen ? look.ink.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 10))
      .contentShape(RoundedRectangle(cornerRadius: 10))
      .accessibilityLabel(emoji.name)
    case .mention(let mention):
      PickLine(title: mention.label, subtitle: mention.subtitle, tag: mention.tag, chosen: chosen, look: look) { MentionIcon(icon: mention.icon, look: look) }
    case .slash(let item):
      PickLine(title: item.label, subtitle: item.subtitle, tag: item.tag, chosen: chosen, look: look) {
        if case .skill = item {
          Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(look.inkSecondary)
        } else {
          Image(systemName: "command").font(.system(size: 11)).foregroundStyle(Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255))
        }
      }
    case .pull(let pull):
      PickLine(title: "#\(pull.number)", subtitle: pull.title, tag: "Pull request", chosen: chosen, look: look) {
        Image(systemName: "arrow.triangle.pull").font(.system(size: 11)).foregroundStyle(look.inkSecondary)
      }
    }
  }
}

/** A row of "@", "/" or "#" (`sand-mention-menu-item`). */
private struct PickLine<Icon: View>: View {
  let title: String
  let subtitle: String?
  let tag: String
  let chosen: Bool
  let look: Look
  @ViewBuilder let icon: () -> Icon

  var body: some View {
    HStack(spacing: 6) {
      icon().frame(width: 16, height: 16)
      HStack(spacing: 8) {
        Text(title)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .layoutPriority(1)
        if let subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .foregroundStyle(look.inkTertiary)
            .lineLimit(1)
            .truncationMode(.tail)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Text(tag)
        .foregroundStyle(look.inkTertiary)
        .lineLimit(1)
        .fixedSize()
    }
    .font(.system(size: 13))
    .padding(.vertical, 6)
    .padding(.horizontal, 8)
    .frame(height: 28)
    .background(chosen ? look.logoTile : .clear, in: RoundedRectangle(cornerRadius: 6))
    .contentShape(RoundedRectangle(cornerRadius: 6))
    .accessibilityElement(children: .combine)
  }
}

/** An "@" row's picture: the agent's butterfly, a group's or everyone's people, a routine's clock, an app's logo on its tile. */
struct MentionIcon: View {
  let icon: ComposerLists.MentionRow.Icon
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    switch icon {
    case .agent(let id):
      if let agent = store.agent(id) {
        AgentMark(agent: agent, agents: store.agents, size: 16)
      } else {
        ButterflyMark(palette: AgentPalette.named(nil), size: 16)
      }
    case .everyone, .group:
      Image(systemName: "person.2").font(.system(size: 10)).foregroundStyle(look.ink)
    case .routine:
      Image(systemName: "clock").font(.system(size: 11)).foregroundStyle(look.inkSecondary)
    case .connector(_, _, let name):
      AppLogoTile(name: name, look: look, side: 16)
    }
  }
}

// MARK: A pick in the field

/**
 * A pick in the words (`sand-inserted-chip`): its picture (16) and name
 * (12, 500), 4 apart, padded 2 6 2 4 on a grey wash (13%), 4 round, the
 * line's height. One piece of the text: a Delete takes it whole.
 */
final class ChipAttachment: NSTextAttachment {
  let node: ComposerChip.Node

  init(node: ComposerChip.Node, image: NSImage?) {
    self.node = node
    super.init(data: nil, ofType: nil)
    self.image = image
    if let image {
      // The line is 20: the chip fills it, its middle on the words' middle.
      bounds = CGRect(x: 0, y: MessageField.font.descender - 1.5, width: image.size.width, height: image.size.height)
    }
  }

  required init?(coder: NSCoder) { fatalError("not used") }
}

/** The chip as SwiftUI draws it, for its picture in the text. */
struct ChipLabel: View {
  let node: ComposerChip.Node
  let look: Look
  let store: AppStore

  var body: some View {
    HStack(spacing: 4) {
      icon.frame(width: 16, height: 16)
      Text(name)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .fixedSize()
    }
    .padding(EdgeInsets(top: 2, leading: 4, bottom: 2, trailing: 6))
    .frame(height: 20)
    .background(Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(0.13), in: RoundedRectangle(cornerRadius: 4))
    .environment(\.colorScheme, look.dark ? .dark : .light)
    .environment(store)
  }

  private var name: String {
    switch node {
    case .mention(_, let label), .workflow(_, let label, _, _): return label
    case .pullRequest(let number, _, _): return "#\(number)"
    }
  }

  @ViewBuilder
  private var icon: some View {
    switch node {
    case .mention(let id, _):
      if id == ComposerLists.everyoneId {
        MentionIcon(icon: .everyone, look: look)
      } else if let agent = store.agent(id) {
        AgentMark(agent: agent, agents: store.agents, size: 16)
      } else {
        MentionIcon(icon: .group, look: look)
      }
    case .workflow(let id, let label, _, _):
      if id.hasPrefix("mcp:") {
        AppLogoTile(name: label.components(separatedBy: " (").first ?? label, look: look, side: 16)
      } else {
        Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(look.inkSecondary)
      }
    case .pullRequest:
      Image(systemName: "arrow.triangle.pull").font(.system(size: 11)).foregroundStyle(look.inkSecondary)
    }
  }

  /** The chip's picture at the screen's scale. */
  @MainActor
  static func image(_ node: ComposerChip.Node, look: Look, store: AppStore) -> NSImage? {
    let renderer = ImageRenderer(content: ChipLabel(node: node, look: look, store: store))
    renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
    return renderer.nsImage
  }
}

/** The message field's text view, for the lists to write into: a pick, an emoji, or nothing in place of what was typed. */
@MainActor
final class FieldHandle {
  weak var view: NSTextView?
  var store: AppStore?
  var look: Look?
  var ink: NSColor = .textColor

  /** `range` (the trigger and what follows it) swapped for the pick as one piece, and a space. */
  func pick(_ node: ComposerChip.Node, replacing range: NSRange) {
    guard let view, let store, let look, NSMaxRange(range) <= (view.string as NSString).length else { return }
    let attributes = MessageField.attributes(ink)
    let piece = NSMutableAttributedString(attributedString: MessageField.chipString(node, look: look, store: store, attributes: attributes))
    piece.append(NSAttributedString(string: " ", attributes: attributes))
    view.insertText(piece, replacementRange: range)
    view.typingAttributes = attributes
  }

  /** `range` swapped for words (an emoji and a space), or for nothing. */
  func replace(_ range: NSRange, with words: String) {
    guard let view, NSMaxRange(range) <= (view.string as NSString).length else { return }
    let attributes = MessageField.attributes(ink)
    view.insertText(NSAttributedString(string: words, attributes: attributes), replacementRange: range)
    view.typingAttributes = attributes
  }
}

// MARK: The theme

/**
 * Theme: System, Light or Dark ("/" and, in step 8, Settings › General):
 * the whole app in that appearance, kept for the next launch.
 */
@MainActor
enum MacTheme {
  static let key = "simeon.theme"

  static func set(_ preference: String) {
    UserDefaults.standard.set(preference, forKey: key)
    apply()
  }

  static func apply() {
    switch UserDefaults.standard.string(forKey: key) {
    case "light": NSApplication.shared.appearance = NSAppearance(named: .aqua)
    case "dark": NSApplication.shared.appearance = NSAppearance(named: .darkAqua)
    default: NSApplication.shared.appearance = nil
    }
  }
}
