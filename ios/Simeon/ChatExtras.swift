import SwiftUI
import QuickLook
import SimeonCore

/*
 * The chat's parts the Mac's window has and the first slices did not: an
 * agent's pictures under its words, a lone link as a card, a thread's
 * "N replies" and the thread itself, the lines under a message held while
 * offline, and the chat that could not load. Shared by the iPhone and the
 * Mac (mac/Simeon/MacChat.swift opens threads in the window).
 */

extension EnvironmentValues {
  /** The thread on screen, when the conversation is one (its first message's id): its quotes jump within it, and it has no "Start a thread". */
  @Entry var chatThread: String? = nil
}

// MARK: - An agent's pictures

/**
 * The pictures an agent sent with a message (`message.images`), under its
 * words, laid out by the window's own planner (`GalleryPlan`): one row of
 * at most 192, each its own shape; all of them when they fit, else two or
 * three with "+N" on the last. The row is at most 86 % of the chat, 560,
 * and the chat less 82. A click opens the whole gallery full screen (Quick
 * Look) at that picture.
 */
struct ImageGallery: View {
  let images: [ChatImage]
  let agentId: String
  /** The message the pictures are in: its menu follows the picture's on the Mac. */
  var bubble: Bubble? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  /** The shapes read from the pictures themselves, for those the message did not give. */
  @State private var measured: [String: CGSize] = [:]
  @State private var opening: URL?
  @State private var files: [URL] = []

  var body: some View {
    let sizes: [(width: Double, height: Double)?] = images.map { image in
      if let w = image.width, let h = image.height, w > 0, h > 0 { return (w, h) }
      if let size = measured[image.url] ?? ChatImages.image(for: [image.url])?.size, size.width > 0, size.height > 0 { return (Double(size.width), Double(size.height)) }
      return nil
    }
    let plan = GalleryPlan.plan(sizes: sizes, availableWidth: GalleryPlan.width(for: Double(width)))
    HStack(spacing: GalleryPlan.gap) {
      ForEach(Array(plan.widths.enumerated()), id: \.offset) { index, tileWidth in
        let last = index == plan.widths.count - 1
        GalleryTile(image: images[index], agentId: agentId, folded: last ? plan.foldedCount : 0, bubble: bubble,
                    measured: { size in if measured[images[index].url] != size { measured[images[index].url] = size } },
                    open: { open(at: index) })
          .frame(width: tileWidth, height: plan.height)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Agent attachments")
    .quickLookPreview($opening, in: files)
  }

  /** The whole gallery, full screen, at this picture: each written where Quick Look reads it, named by its words when it has them. */
  private func open(at index: Int) {
    Task {
      var written: [URL] = []
      for (position, image) in images.enumerated() {
        guard let data = await GalleryTile.bytes(image, agentId: agentId, store: store) else { continue }
        let name = GalleryTile.fileName(image, position: position)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-gallery", isDirectory: true).appendingPathComponent(name)
        let ok = await Task.detached(priority: .userInitiated) { () -> Bool in
          try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
          return (try? data.write(to: file, options: .atomic)) != nil
        }.value
        if ok { written.append(file) }
        if position == index && !ok { break }
      }
      let wanted = GalleryTile.fileName(images[index], position: index)
      guard let start = written.first(where: { $0.lastPathComponent == wanted }) else { store.problem = "Couldn't load image"; return }
      files = written
      opening = start
    }
  }
}

/**
 * One picture of a gallery, read from the computer (a path) or the web: its
 * place while it comes, "Image unavailable" when it is not there, "Couldn't
 * load image" when it can't be drawn; "+N" over it for the ones not shown.
 */
struct GalleryTile: View {
  let image: ChatImage
  let agentId: String
  /** "+N" over this tile: the pictures not shown, and this one. */
  let folded: Int
  var bubble: Bubble? = nil
  let measured: (CGSize) -> Void
  let open: () -> Void
  @Environment(AppStore.self) private var store
  @State private var loaded: UIImage?
  @State private var state: LoadState = .loading

  enum LoadState { case loading, ready, unavailable, failed }

  var body: some View {
    let shown = loaded ?? ChatImages.image(for: [image.url])
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.bubbleTheirs)
      if let shown {
        Image(uiImage: shown).resizable().scaledToFill()
          .transition(.opacity)
      } else if state == .unavailable || state == .failed {
        VStack(spacing: 4) {
          Image(systemName: "photo").font(.system(size: 18))
          Text(state == .unavailable ? "Image unavailable" : "Couldn't load image").font(.system(size: 12, weight: .medium))
          if state == .unavailable, image.url.hasPrefix("https://") || image.url.hasPrefix("http://"), let host = URL(string: image.url)?.host {
            Text(host).font(.system(size: 11)).lineLimit(1)
          }
        }
        .foregroundStyle(Ink.tertiary)
        .padding(6)
      }
      if folded > 0 {
        Color.black.opacity(0.45)
        Text("+\(folded)").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .onTapGesture(perform: open)
    .accessibilityLabel(folded > 0 ? "Open the remaining \(folded) images full screen" : "Open image full screen")
    .accessibilityAddTraits(.isButton)
    .animation(.easeOut(duration: 0.2), value: shown == nil)
    #if os(macOS)
    .contextMenu {
      ImageMenuItems(image: shown, bytes: { await Self.bytes(image, agentId: agentId, store: store) }, address: image.url)
      if let bubble {
        Divider()
        MessageContextMenu(bubble: bubble, agentId: agentId, copy: MessageMenuOnMac.copy(bubble))
      }
    }
    #endif
    .task(id: image.url) {
      if let kept = ChatImages.image(for: [image.url]) { loaded = kept; state = .ready; measured(kept.size); return }
      guard let data = await Self.bytes(image, agentId: agentId, store: store) else { state = .unavailable; return }
      guard let full = UIImage(data: data) else { state = .failed; return }
      measured(full.size)
      let scale = min(1, 900 / max(full.size.width, full.size.height, 1))
      let thumbnail = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
      ChatImages.keep(thumbnail, under: [image.url])
      loaded = thumbnail
      state = .ready
    }
  }

  /** The picture's bytes: from the agent's computer for a path, from the web for an address. */
  static func bytes(_ image: ChatImage, agentId: String, store: AppStore) async -> Data? {
    if image.url.hasPrefix("https://") || image.url.hasPrefix("http://") {
      guard let url = URL(string: image.url), let answer = try? await URLSession.shared.data(from: url),
            ((answer.1 as? HTTPURLResponse)?.statusCode ?? 200) < 400 else { return nil }
      return answer.0
    }
    return await store.readFile(image.url, agentId: agentId, limit: 24 << 20)
  }

  /** The name Quick Look shows for it: its words (the window's caption), else its own name. */
  static func fileName(_ image: ChatImage, position: Int) -> String {
    let own = SimeonCore.fileName(ofURL: image.url)
    let ext = (own as NSString).pathExtension.isEmpty ? "png" : (own as NSString).pathExtension
    let words = image.alt.components(separatedBy: CharacterSet(charactersIn: "/:\\\n")).joined(separator: " ").trimmingCharacters(in: .whitespaces)
    let base = words.isEmpty ? (own as NSString).deletingPathExtension : String(words.prefix(80))
    return "\(position + 1) \(base).\(ext)"
  }
}

// MARK: - A lone link

/**
 * A message that is one link and nothing else, as a card (the window's
 * `url-card.ts`): the site's icon (a globe while there is none), the page's
 * title (a bar while it is read; the host when it has none), under it the
 * host (the whole address when nothing could be read), the page's picture
 * at the right. A click opens it; the pointer over it shows the address.
 * Read on this device as the Mac's app reads it (`LinkMetadataReader`).
 */
struct LinkCard: View {
  let url: URL
  let fromPerson: Bool
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  /** nil while it is read; then what was read, or nothing. */
  @State private var metadata: LinkMetadata??

  var body: some View {
    let answer = metadata ?? LinkCards.seen[url.absoluteString]
    let loading = answer == nil
    let found = answer ?? nil
    let urlHost = url.host ?? url.absoluteString
    let host = (found?.hostname.isEmpty == false ? found?.hostname : nil) ?? urlHost
    Button { openURL(url) } label: {
      HStack(alignment: .center, spacing: 10) {
        Group {
          if let data = found?.favicon, let icon = UIImage(data: data) {
            Image(uiImage: icon).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
          } else {
            Image(systemName: "globe").font(.system(size: 17)).foregroundStyle(Ink.secondary)
          }
        }
        .frame(width: 20, height: 20)
        VStack(alignment: .leading, spacing: 3) {
          if loading {
            Capsule().fill(Ink.tertiary.opacity(0.3)).frame(width: 140, height: 10)
              .accessibilityHidden(true)
          } else {
            Text(found?.title.isEmpty == false ? found!.title : urlHost)
              .font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary)
              .lineLimit(2).multilineTextAlignment(.leading)
          }
          Text(found == nil && !loading ? url.absoluteString : host)
            .font(.system(size: 12)).foregroundStyle(Ink.secondary)
            .lineLimit(1).truncationMode(.middle)
        }
        Spacer(minLength: 0)
        if let data = found?.image, let picture = UIImage(data: data) {
          Image(uiImage: picture).resizable().scaledToFill()
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
      }
      .padding(10)
      .frame(width: min(ChatMetrics.bubbleMax(width), 380), alignment: .leading)
      .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .modifier(CardEdge(radius: 14))
      .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity, alignment: fromPerson ? .trailing : .leading)
    .accessibilityLabel("Link, \(found?.title.isEmpty == false ? found!.title : urlHost)")
    #if os(macOS)
    .help(url.absoluteString)
    #endif
    .task(id: url) {
      guard LinkCards.seen[url.absoluteString] == nil else { return }
      let read = await LinkMetadataReader.shared.metadata(for: url.absoluteString)
      LinkCards.seen[url.absoluteString] = .some(read)
      metadata = .some(read)
    }
  }
}

/** What each card read while the app runs, so a card drawn again shows it at once (an empty answer is final, as the window's). */
@MainActor
enum LinkCards {
  static var seen: [String: LinkMetadata?] = [:]
}

// MARK: - Threads

/** A thread to show, by its first message's id. */
struct ThreadRoute: Identifiable, Hashable {
  let rootId: String
  var id: String { rootId }
}

/**
 * Under a message with a thread: "1 reply ›", "3 replies ›" (the window's
 * `sand-thread-affordance`), "View thread ›" in its place under the pointer;
 * on the message's side; a click opens the thread.
 */
struct ThreadLinkRow: View {
  let rootId: String
  let count: Int
  let side: ChatRow.Side
  @Environment(ChatActions.self) private var actions: ChatActions?
  @State private var hovering = false

  private var label: String { count == 1 ? "1 reply" : "\(count) replies" }

  var body: some View {
    let mine = side == .person
    HStack {
      if mine { Spacer(minLength: 0) }
      Button { actions?.openThread(rootId) } label: {
        HStack(spacing: 3) {
          Text(hovering ? "View thread" : label)
          Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Ink.link)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .onHover { hovering = $0 }
      .accessibilityLabel("View thread, \(label)")
      if !mine { Spacer(minLength: 0) }
    }
  }
}

/**
 * A thread's header, the window's "Thread breadcrumb": the agent's
 * butterfly and name, which go back to the chat ("Back to Theo" to
 * VoiceOver), a chevron, then the thread's name (its first message, cut at
 * 40 characters), which opens the agent's details. On the Mac it sits in
 * the toolbar, where the chat's name sits.
 */
struct ThreadBreadcrumb: View {
  let agentId: String
  let rootId: String
  let back: () -> Void
  let details: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    // Read so the name follows the thread as its lines arrive.
    let _ = store.threadRows[agentId]?.count
    let agent = store.agent(agentId)
    HStack(spacing: 6) {
      Button(action: back) {
        HStack(spacing: 6) {
          if let agent {
            AgentAvatar(agent: agent, members: store.members(of: agent), groupInARow: true, moves: false)
              .frame(width: agent.isGroup ? nil : 20, height: 20)
          }
          Text(agent?.name ?? "").font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back to \(agent?.name ?? "")")
      Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)).foregroundStyle(.tertiary)
        .accessibilityHidden(true)
      Button(action: details) {
        Text(store.threadTitle(rootId, in: agentId)).font(.system(size: 13, weight: .medium)).foregroundStyle(.primary).lineLimit(1)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("View conversation details")
    }
    .padding(.horizontal, 6)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Thread breadcrumb")
  }
}

// MARK: - A cloud agent

/**
 * A cloud agent the agent started (the window's `cloud-agent.tsx`): its name
 * (a link to the pull request when there is one) and state ("Creating",
 * "Running", "Done", "Error", "Expired", "Status unavailable"), what it was
 * asked, its branch with the pull request's mark and "PR #N", what it
 * changed; View PR and Open. Three bars while it is first read; "Cloud
 * agent", "Status unavailable" when nothing could be. Asked again as the
 * window asks (`CloudAgentInfo.nextPoll`).
 */
struct CloudAgentCard: View {
  let entryId: String
  let bcId: String
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  @State private var info: CloudAgentInfo?
  /** Asked, and nothing is coming: the card with its defaults. */
  @State private var settled = false

  var body: some View {
    Group {
      if info == nil && !settled {
        // The window's busy card: three lines' bars.
        VStack(alignment: .leading, spacing: 8) {
          ForEach([0.55, 0.9, 0.4], id: \.self) { share in
            Capsule().fill(Ink.tertiary.opacity(0.35)).frame(height: 10).frame(maxWidth: .infinity, alignment: .leading)
              .scaleEffect(x: share, anchor: .leading)
          }
        }
        .accessibilityHidden(true)
      } else {
        card(info ?? .unavailable)
      }
    }
    .padding(12)
    .frame(width: min(ChatMetrics.bubbleMax(width), 400), alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .modifier(CardEdge(radius: 14))
    #if os(macOS)
    // A card has the message's actions, with no Copy.
    .contextMenu { MessageContextMenu(bubble: Bubble(id: entryId, text: "", fromPerson: false, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false), agentId: agentId) }
    #endif
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Cloud agent")
    .task(id: bcId) {
      guard !bcId.isEmpty else { settled = true; return }
      while !Task.isCancelled {
        let read = await store.cloudAgent(bcId)
        let delay = CloudAgentInfo.nextPoll(after: read, known: info)
        if case .info(let next) = read { info = next }
        if info == nil { settled = true }
        guard let delay else { return }
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      }
    }
  }

  @ViewBuilder
  private func card(_ info: CloudAgentInfo) -> some View {
    let pull = info.pullRequestURL.isEmpty ? nil : URL(string: info.pullRequestURL)
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        let title = Text(info.name.isEmpty ? "Cloud agent" : info.name)
          .font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(2)
        if let pull {
          Button { openURL(pull) } label: { title }
            .buttonStyle(.plain)
            .help("Open the pull request")
        } else {
          title
        }
        Spacer(minLength: 4)
        status(info)
      }
      if !info.prompt.isEmpty {
        Text(info.prompt).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      if !info.branch.isEmpty {
        HStack(spacing: 6) {
          Image(systemName: Self.pullSymbol(info.pullState)).font(.system(size: 11)).foregroundStyle(Self.pullColour(info.pullState))
          Text(info.branch).font(.system(size: 12, design: .monospaced)).foregroundStyle(Ink.secondary).lineLimit(1).truncationMode(.middle)
          if let number = info.pullRequestNumber {
            if let pull {
              Button { openURL(pull) } label: { Text("PR #\(number)").font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.link) }
                .buttonStyle(.plain)
                .help("Open the pull request")
            } else {
              Text("PR #\(number)").font(.system(size: 12)).foregroundStyle(Ink.tertiary)
            }
          }
        }
      }
      if let changed = info.changedLabel {
        HStack(spacing: 6) {
          Image(systemName: "plusminus").font(.system(size: 11)).foregroundStyle(Ink.secondary)
          Text(changed).foregroundStyle(Ink.secondary)
          if info.linesAdded > 0 { Text("+\(info.linesAdded)").foregroundStyle(Ink.fare) }
          if info.linesRemoved > 0 { Text("-\(info.linesRemoved)").foregroundStyle(Ink.danger) }
        }
        .font(.system(size: 12)).monospacedDigit()
      }
      HStack(spacing: 8) {
        if let pull {
          Button { openURL(pull) } label: { Label("View PR", systemImage: "arrow.up.right") }
            .help("Open the pull request")
        }
        Button { if let page = CloudAgentInfo.webURL(bcId), !bcId.isEmpty { openURL(page) } } label: { Label("Open", systemImage: "arrow.up.forward.app") }
          .help("Open this cloud agent")
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
    }
  }

  private func status(_ info: CloudAgentInfo) -> some View {
    let tone: Color = info.status == .finished ? Ink.fare : info.status == .error || info.status == .expired ? Ink.danger : info.status == .unknown ? Ink.secondary : Ink.blue
    return HStack(spacing: 5) {
      if info.status == .creating || info.status == .running { ProgressView().controlSize(.mini) }
      else { Circle().fill(tone).frame(width: 6, height: 6) }
      Text(info.statusLabel)
    }
    .font(.system(size: 11, weight: .medium))
    .foregroundStyle(tone)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.updatesFrequently)
  }

  /** The pull request's mark by its state, as the window's (a branch for none, the request, its draft, merged, closed). */
  static func pullSymbol(_ state: String) -> String {
    switch state {
    case "none": return "arrow.triangle.branch"
    case "merged": return "arrow.triangle.merge"
    case "closed": return "xmark.circle"
    case "draft": return "circle.dashed"
    default: return "arrow.triangle.pull"
    }
  }

  static func pullColour(_ state: String) -> Color {
    switch state {
    case "open": return Ink.fare
    case "merged": return .purple
    case "closed": return Ink.danger
    default: return Ink.secondary
    }
  }
}

// MARK: - Sending while offline

/**
 * Under a message held while the computer is out of reach (the window's
 * `sand-queued-send-notice`): "Will send when reconnected" while it is,
 * "Waiting to send…" once it is back, and Cancel.
 */
struct QueuedSendRow: View {
  let nonce: String
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 4) {
      Spacer(minLength: 0)
      Image(systemName: "clock").font(.system(size: 11)).foregroundStyle(Ink.secondary)
      Text(store.isDown ? "Will send when reconnected" : "Waiting to send…").foregroundStyle(Ink.secondary)
      Button { store.cancelQueued(nonce, in: agentId) } label: {
        Text("Cancel").foregroundStyle(Ink.primary)
          .padding(.horizontal, 6).frame(minHeight: 32).contentShape(.rect)
      }
      .buttonStyle(.plain)
    }
    .font(.system(size: 12, weight: .medium))
    .accessibilityElement(children: .contain)
  }
}

/** Under a message that went once the computer was back: "Sent while offline · Oct 9, 3:12 PM" (`sand-sent-while-offline-notice`). */
struct SentOfflineLine: View {
  let ms: Double

  var body: some View {
    let date = Date(timeIntervalSince1970: ms / 1000)
    Text("Sent while offline · \(date.formatted(.dateTime.month(.abbreviated).day().hour().minute()))")
      .font(.system(size: 11)).foregroundStyle(Ink.tertiary)
      .padding(.trailing, 4)
  }
}

// MARK: - A chat that could not load

/** The window's "Couldn't load conversation", its sentence and Retry, in place of an empty chat. */
struct ChatLoadFailed: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @State private var retrying = false

  var body: some View {
    ContentUnavailableView {
      Text("Couldn't load conversation").font(.headline)
    } description: {
      Text("Couldn't load this conversation. Check your connection and try again.")
    } actions: {
      Button {
        retrying = true
        Task { await store.refresh(agentId); retrying = false }
      } label: {
        if retrying { ProgressView().controlSize(.small) } else { Text("Retry") }
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
      .disabled(retrying)
    }
    .accessibilityElement(children: .contain)
  }
}
