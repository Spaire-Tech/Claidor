import SwiftUI
import LinkPresentation
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
  /** The thread on screen, when the conversation is one (its first message's id): its quotes jump within it, and it has no "Start a Thread". */
  @Entry var chatThread: String? = nil
}

// MARK: - An agent's pictures

/**
 * The pictures an agent sent with a message (`message.images`), under its
 * words, as the window's gallery: one row, 192 pt high, 6 apart, at most
 * three, "+N" on the last when there are more; each its own shape (4:3
 * when not known). The row is at most 86 % of the chat, 560 pt, and the
 * chat less 82; when the pictures are wider, the row gets lower. A click
 * opens one in Quick Look.
 */
struct ImageGallery: View {
  let images: [ChatImage]
  let agentId: String
  @Environment(\.chatWidth) private var width

  static let rowHeight: CGFloat = 192
  static let gap: CGFloat = 6

  var body: some View {
    let shown = Array(images.prefix(3))
    let maxWidth = min(width * 0.86, 560, width - 82)
    let natural = shown.reduce(0) { $0 + Self.rowHeight * CGFloat($1.aspect) }
    let gaps = Self.gap * CGFloat(max(0, shown.count - 1))
    let scale = natural + gaps > maxWidth && natural > 0 ? max(0.2, (maxWidth - gaps) / natural) : 1
    let height = Self.rowHeight * scale
    HStack(spacing: Self.gap) {
      ForEach(Array(shown.enumerated()), id: \.offset) { index, image in
        GalleryTile(image: image, agentId: agentId, more: index == shown.count - 1 ? images.count - shown.count : 0)
          .frame(width: height * CGFloat(image.aspect), height: height)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(images.count == 1 ? "Picture" : "\(images.count) pictures")
  }
}

/** One picture of a gallery: read from the computer (a `file://` path) or the web, kept at the size it is drawn. */
struct GalleryTile: View {
  let image: ChatImage
  let agentId: String
  /** Pictures past the third: "+N" over the last tile. */
  let more: Int
  @Environment(AppStore.self) private var store
  @State private var loaded: UIImage?
  @State private var failed = false
  @State private var preview: PreviewFile?

  var body: some View {
    let shown = loaded ?? ChatImages.image(for: [image.url])
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.bubbleTheirs)
      if let shown {
        Image(uiImage: shown).resizable().scaledToFill()
      } else if failed {
        Image(systemName: "photo").font(.system(size: 22)).foregroundStyle(Ink.tertiary)
      }
      if more > 0 {
        Color.black.opacity(0.45)
        Text("+\(more)").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .onTapGesture { open() }
    .accessibilityLabel(image.alt.isEmpty ? "Picture" : image.alt)
    .accessibilityAddTraits(.isButton)
    #if os(macOS)
    .help(image.alt)
    .contextMenu {
      Button("Open") { open() }
      if let shown { Button("Copy Image") { MacFiles.copy(shown) } }
      Button("Save Image…") { save() }
    }
    .quickLookPreview(Binding(get: { preview?.url }, set: { preview = $0.map(PreviewFile.init(url:)) }))
    #else
    .sheet(item: $preview) { file in QuickLookSheet(file: file).ignoresSafeArea() }
    #endif
    .task(id: image.url) {
      if let kept = ChatImages.image(for: [image.url]) { loaded = kept; return }
      guard let data = await bytes(), let full = UIImage(data: data) else { failed = true; return }
      let scale = min(1, 900 / max(full.size.width, full.size.height, 1))
      let thumbnail = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
      ChatImages.keep(thumbnail, under: [image.url])
      loaded = thumbnail
    }
  }

  /** The picture's bytes: from the agent's computer for a path, from the web for an `https` address. */
  private func bytes() async -> Data? {
    if image.url.hasPrefix("https://") {
      guard let url = URL(string: image.url), let answer = try? await URLSession.shared.data(from: url),
            ((answer.1 as? HTTPURLResponse)?.statusCode ?? 200) < 400 else { return nil }
      return answer.0
    }
    return await store.readFile(image.url, agentId: agentId, limit: 24 << 20)
  }

  private var saveName: String {
    let name = SimeonCore.fileName(ofURL: image.url)
    return (name as NSString).pathExtension.isEmpty ? name + ".png" : name
  }

  private func open() {
    Task {
      guard let data = await bytes() else { store.problem = "Couldn't open this picture."; return }
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-files", isDirectory: true).appendingPathComponent(saveName)
      let written = await Task.detached(priority: .userInitiated) { () -> Bool in
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        return (try? data.write(to: file, options: .atomic)) != nil
      }.value
      if written { preview = PreviewFile(url: file) } else { store.problem = "Couldn't open this picture." }
    }
  }

  #if os(macOS)
  private func save() {
    Task {
      guard let data = await bytes() else { store.problem = "Couldn't save this picture."; return }
      if !(await MacFiles.save(data, suggestedName: saveName)) { store.problem = "Couldn't save this picture." }
    }
  }
  #endif
}

// MARK: - A lone link

/**
 * A message that is one link and nothing else, as a card (the window's
 * `url-card.ts`): the site's icon (a globe while there is none), the page's
 * title (its host when it has none), the host under it (the whole address
 * when nothing could be read), the page's picture at the right. A click
 * opens it. Read once per address with LinkPresentation.
 */
struct LinkCard: View {
  let url: URL
  let fromPerson: Bool
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  @State private var preview: LinkPreview?

  var body: some View {
    let shown = preview ?? LinkPreviews.cached(url)
    let host = url.host.map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } ?? url.absoluteString
    Button { openURL(url) } label: {
      HStack(alignment: .center, spacing: 10) {
        Group {
          if let icon = shown?.icon {
            Image(uiImage: icon).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
          } else {
            Image(systemName: "globe").font(.system(size: 15)).foregroundStyle(Ink.secondary)
          }
        }
        .frame(width: 20, height: 20)
        VStack(alignment: .leading, spacing: 2) {
          Text(shown?.title ?? host)
            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary)
            .lineLimit(2).multilineTextAlignment(.leading)
          Text(shown?.title == nil && shown != nil ? url.absoluteString : host)
            .font(.system(size: 12)).foregroundStyle(Ink.secondary)
            .lineLimit(1).truncationMode(.middle)
        }
        Spacer(minLength: 0)
        if let picture = shown?.image {
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
    .accessibilityLabel("Link, \(shown?.title ?? host)")
    #if os(macOS)
    .help(url.absoluteString)
    .contextMenu {
      Button("Open Link") { openURL(url) }
      Button("Copy Link") { UIPasteboard.general.string = url.absoluteString }
    }
    #endif
    .task(id: url) { if preview == nil { preview = await LinkPreviews.load(url) } }
  }
}

/** What a page says of itself: its title, its icon, its picture. */
struct LinkPreview {
  let title: String?
  let icon: UIImage?
  let image: UIImage?
}

/** Pages read once each while the app runs (LinkPresentation), so a card drawn again shows at once. */
@MainActor
enum LinkPreviews {
  private static var made: [URL: LinkPreview] = [:]
  private static var waiting: [URL: Task<LinkPreview, Never>] = [:]

  static func cached(_ url: URL) -> LinkPreview? { made[url] }

  static func load(_ url: URL) async -> LinkPreview {
    if let done = made[url] { return done }
    if let running = waiting[url] { return await running.value }
    let task = Task { @MainActor () -> LinkPreview in
      let provider = LPMetadataProvider()
      provider.timeout = 12
      guard let metadata = try? await provider.startFetchingMetadata(for: url) else { return LinkPreview(title: nil, icon: nil, image: nil) }
      let title = metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
      async let icon = picture(metadata.iconProvider)
      async let image = picture(metadata.imageProvider)
      return LinkPreview(title: title?.isEmpty == false ? title : nil, icon: await icon, image: await image)
    }
    waiting[url] = task
    let preview = await task.value
    waiting[url] = nil
    if made.count > 200 { made.removeAll() }
    made[url] = preview
    return preview
  }

  private static func picture(_ provider: NSItemProvider?) async -> UIImage? {
    guard let provider, provider.canLoadObject(ofClass: UIImage.self) else { return nil }
    return await withCheckedContinuation { done in
      provider.loadObject(ofClass: UIImage.self) { object, _ in done.resume(returning: object as? UIImage) }
    }
  }
}

// MARK: - Threads

/** A thread to show, by its first message's id. */
struct ThreadRoute: Identifiable, Hashable {
  let rootId: String
  var id: String { rootId }
}

/**
 * Under a message with a thread: "1 reply ›", "3 replies ›" (the window's
 * `sand-thread-affordance`; "View thread ›" under the pointer on the Mac),
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
          Image(systemName: "bubble.left.and.bubble.right").font(.system(size: 11))
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
 * A thread's header (the window's thread view): "‹ Back to Theo" and the
 * thread's name (its first message, cut at 40 characters). Esc goes back
 * on the Mac.
 */
struct ThreadHeader: View {
  let agentId: String
  let rootId: String
  let close: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 6) {
      Button(action: close) {
        HStack(spacing: 3) {
          Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold))
          Text("Back to \(store.agent(agentId)?.name ?? "chat")")
        }
        .foregroundStyle(Ink.link)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      #if os(macOS)
      .keyboardShortcut(.cancelAction)
      #endif
      Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)).foregroundStyle(Ink.tertiary)
      Text(store.threadTitle(rootId, in: agentId))
        .foregroundStyle(Ink.primary).lineLimit(1)
      Spacer(minLength: 0)
    }
    .font(.system(size: 13, weight: .medium))
    .padding(.horizontal, 14).padding(.vertical, 8)
    .glassEffect(.regular, in: .capsule)
    .padding(.horizontal, 12).padding(.top, 6)
  }
}

// MARK: - A cloud agent

/**
 * A cloud agent the agent started (the window's `cloud-agent.tsx`): its
 * name and state ("Creating", "Running", "Done", "Error", "Expired"), what
 * it was asked, its branch and pull request, what it changed; View PR and
 * Open. Asked again every five seconds while it works, every minute while
 * it can't be read.
 */
struct CloudAgentCard: View {
  let bcId: String
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  @State private var info: CloudAgentInfo?
  @State private var loaded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let info {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(info.name.isEmpty ? "Cloud agent" : info.name)
            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(2)
          Spacer(minLength: 4)
          status(info)
        }
        if !info.prompt.isEmpty {
          Text(info.prompt).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(3)
        }
        if !info.branch.isEmpty || info.pullRequestNumber != nil {
          HStack(spacing: 6) {
            Image(systemName: info.pullRequestURL.isEmpty ? "arrow.triangle.branch" : "arrow.triangle.pull")
              .font(.system(size: 11)).foregroundStyle(pullColour(info))
            if !info.branch.isEmpty { Text(info.branch).font(.system(size: 12, design: .monospaced)).foregroundStyle(Ink.secondary).lineLimit(1).truncationMode(.middle) }
            if let number = info.pullRequestNumber { Text("PR #\(number)").font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.secondary) }
          }
        }
        if let changed = info.changedLabel {
          HStack(spacing: 6) {
            Text(changed).foregroundStyle(Ink.secondary)
            if info.linesAdded > 0 { Text("+\(info.linesAdded)").foregroundStyle(Ink.fare) }
            if info.linesRemoved > 0 { Text("−\(info.linesRemoved)").foregroundStyle(Ink.danger) }
          }
          .font(.system(size: 12)).monospacedDigit()
        }
        HStack(spacing: 8) {
          if let pull = URL(string: info.pullRequestURL), !info.pullRequestURL.isEmpty {
            Button { openURL(pull) } label: { Label("View PR", systemImage: "arrow.up.right") }
              .help("Open the pull request")
          }
          if let page = CloudAgentInfo.webURL(bcId) {
            Button { openURL(page) } label: { Label("Open", systemImage: "arrow.up.forward.app") }
              .help("Open this cloud agent")
          }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
      } else if loaded {
        Label("Cloud agent · Status unavailable", systemImage: "cloud").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      } else {
        HStack(spacing: 8) {
          ProgressView().controlSize(.small)
          Text("Cloud agent").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
    }
    .padding(12)
    .frame(width: min(ChatMetrics.bubbleMax(width), 400), alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .modifier(CardEdge(radius: 14))
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Cloud agent")
    .task(id: bcId) {
      while !Task.isCancelled {
        let next = await store.cloudAgent(bcId)
        if let next { info = next } else if info == nil { loaded = true }
        if let next, !next.isLive { break }
        try? await Task.sleep(nanoseconds: (next == nil ? 60 : 5) * 1_000_000_000)
      }
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
  }

  private func pullColour(_ info: CloudAgentInfo) -> Color {
    switch info.pullRequestState {
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

/** The window's "Couldn't load this conversation" with Retry, in place of an empty chat. */
struct ChatLoadFailed: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @State private var retrying = false

  var body: some View {
    ContentUnavailableView {
      Label("Couldn't load this conversation", systemImage: "exclamationmark.bubble")
    } description: {
      Text("Couldn't load this conversation. Check your connection and try again.")
    } actions: {
      Button {
        retrying = true
        Task { await store.refresh(agentId); retrying = false }
      } label: {
        if retrying { ProgressView().controlSize(.small) } else { Text("Retry") }
      }
      .buttonStyle(.borderedProminent)
      .disabled(retrying)
    }
  }
}
