import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

// MARK: Files waiting to go

/** A file waiting to go with the next message (the window's staged attachment): its name and bytes. */
struct StagedFile: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let data: Data

  /** The window's picture kinds (`kft`): shown as a picture, not a file. */
  static let pictureExtensions: Set<String> = ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]

  var isPicture: Bool { StagedFile.pictureExtensions.contains((name as NSString).pathExtension.lowercased()) }
}

/** A file coming in: from the open panel, a drop or the clipboard (a path), or a picture pasted (its bytes). */
enum IncomingFile: Sendable {
  case url(URL)
  case data(name: String, data: Data)
}

extension ChatControl {
  /** What reading a file gave: its bytes, or why it can't go. */
  enum ReadFile: Sendable {
    case ready(name: String, data: Data)
    case refused(name: String, reason: AttachmentLimits.Refusal)
  }

  /**
   * Files to attach (`j9n`, `F9n`, `q9n`): as many as fit beside those
   * waiting (six in all), each read off the main thread, none empty and
   * none over 25 MB (200 MB for a video); what was left out said over the
   * words for five seconds.
   */
  func stage(_ files: [IncomingFile]) {
    guard !files.isEmpty else { return }
    let admitted = AttachmentLimits.admit(files.count, staged: staged.count)
    guard admitted.accepted > 0 else {
      if let line = admitted.notice { notice(line) }
      return
    }
    let taken = Array(files.prefix(admitted.accepted))
    Task { [weak self] in
      let read = await Task.detached(priority: .userInitiated) { taken.map(ChatControl.read) }.value
      guard let self else { return }
      var refused: [(name: String, reason: AttachmentLimits.Refusal)] = []
      for item in read {
        switch item {
        case .ready(let name, let data):
          if staged.count < AttachmentLimits.maxStaged { staged.append(StagedFile(name: name, data: data)) }
        case .refused(let name, let reason):
          refused.append((name, reason))
        }
      }
      if let line = AttachmentLimits.notice(refused) ?? admitted.notice { notice(line) }
    }
  }

  /** One file's bytes, its size checked before it is read; a nameless picture is "image.png" (`D9n`). */
  nonisolated static func read(_ file: IncomingFile) -> ReadFile {
    switch file {
    case .url(let url):
      let name = url.lastPathComponent.isEmpty ? "file" : url.lastPathComponent
      let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
      if let size, let refusal = AttachmentLimits.refusal(name: name, size: size) { return .refused(name: name, reason: refusal) }
      guard let data = try? Data(contentsOf: url) else { return .refused(name: name, reason: .failed) }
      if let refusal = AttachmentLimits.refusal(name: name, size: data.count) { return .refused(name: name, reason: refusal) }
      return .ready(name: name, data: data)
    case .data(let name, let data):
      let named = name.isEmpty ? "image.png" : name
      if let refusal = AttachmentLimits.refusal(name: named, size: data.count) { return .refused(name: named, reason: refusal) }
      return .ready(name: named, data: data)
    }
  }

  /** The line over the words (`chat-attachment-notice`), five seconds, the latest one kept. */
  func notice(_ line: String) {
    attachNotice = line
    noticeCount += 1
    let count = noticeCount
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(AttachmentLimits.noticeSeconds))
      guard let self, self.noticeCount == count else { return }
      self.attachNotice = nil
    }
  }

  func unstage(_ id: UUID) {
    staged.removeAll { $0.id == id }
  }

  /** Attach file: the Mac's open panel over the window, several files at once. */
  func chooseFiles() {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    let take: (NSApplication.ModalResponse) -> Void = { [weak self, weak panel] response in
      guard response == .OK, let self, let panel else { return }
      self.stage(panel.urls.map(IncomingFile.url))
    }
    if let window = NSApp.keyWindow {
      panel.beginSheetModal(for: window, completionHandler: take)
    } else {
      panel.begin(completionHandler: take)
    }
  }
}

// MARK: Over the words

/**
 * The files waiting to go, over the words (`sand-prompt-attachments`, 8
 * apart, scrolling sideways when they don't fit): a picture as a 52-point
 * square of it (12 round, a hairline at 15%), Remove (20, round, the X 12)
 * at its top right, 2 in; any other file as a chip like the chat's (220
 * by 54, padded 8, its kind's icon 36, its name 13 at 500 over its size 12
 * at 60%, Remove at the right). Remove is the text colour with the ground's
 * X: near black on light, near white on dark.
 */
struct AttachmentStrip: View {
  let files: [StagedFile]
  let look: Look
  let remove: (UUID) -> Void

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 8) {
        ForEach(files) { file in
          if file.isPicture {
            PictureTile(file: file, look: look) { remove(file.id) }
          } else {
            FileChip(file: file, look: look) { remove(file.id) }
          }
        }
      }
    }
    .scrollIndicators(.never)
    .frame(height: 54)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Attachments")
  }
}

/** A tile's ground: the field's on light, `#2f2f2f` on dark. */
private func tileGround(_ look: Look) -> Color { look.dark ? Color(hex: 0x2f2f2f) : look.ground }

private struct PictureTile: View {
  let file: StagedFile
  let look: Look
  let remove: () -> Void

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 12)
    ZStack {
      tileGround(look)
      if let image = NSImage(data: file.data) {
        Image(nsImage: image)
          .resizable()
          .interpolation(.high)
          .aspectRatio(contentMode: .fill)
      } else {
        Image(systemName: "photo").font(.system(size: 16)).foregroundStyle(look.inkTertiary)
      }
    }
    .frame(width: 52, height: 52)
    .clipShape(shape)
    .overlay { shape.strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
    .overlay(alignment: .topTrailing) {
      RemoveButton(name: file.name, look: look, action: remove).padding(2)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(file.name)
  }
}

private struct FileChip: View {
  let file: StagedFile
  let look: Look
  let remove: () -> Void

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 12)
    let ext = (file.name as NSString).pathExtension
    let base = ext.isEmpty ? file.name : String(file.name.dropLast(ext.count + 1))
    HStack(spacing: 8) {
      Group {
        if let asset = AttachmentStrip.icon(file.name) {
          Image(asset).resizable().interpolation(.high)
        } else {
          Image(systemName: "doc.text")
            .font(.system(size: 17))
            .foregroundStyle(look.unread)
            .frame(width: 36, height: 36)
            .background(look.unread.opacity(look.dark ? 0.173 : 0.09))
        }
      }
      .frame(width: 36, height: 36)
      .clipShape(RoundedRectangle(cornerRadius: 6))
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 0) {
          Text(base).lineLimit(1).truncationMode(.tail)
          Text(ext.isEmpty ? "" : "." + ext).lineLimit(1).fixedSize()
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .frame(height: 18)
        Text(FileLine.size(file.data.count))
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .frame(height: 16)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      RemoveButton(name: file.name, look: look, action: remove)
    }
    .padding(8)
    .frame(width: 220, height: 54)
    .background(tileGround(look), in: shape)
    .overlay { shape.strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(file.name)
  }
}

private struct RemoveButton: View {
  let name: String
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 8, weight: .bold))
        .foregroundStyle(look.dark ? Color(hex: 0x141414) : Color(hex: 0xfcfcfc))
        .frame(width: 20, height: 20)
        .background(look.dark ? Color(hex: 0xfafafa) : Color(hex: 0x070707), in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .focusable(false)
    .help("Remove \(name)")
    .accessibilityLabel("Remove \(name)")
  }
}

extension AttachmentStrip {
  /** Word, Excel, PowerPoint and PDF in their own colours, as the chat's file card. */
  static func icon(_ name: String) -> String? {
    switch (name as NSString).pathExtension.lowercased() {
    case "doc", "docx", "rtf": return "FileIcons/word"
    case "xls", "xlsx", "csv": return "FileIcons/excel"
    case "ppt", "pptx": return "FileIcons/powerpoint"
    case "pdf": return "FileIcons/pdf"
    default: return nil
    }
  }
}

// MARK: Dropping files on the chat

/**
 * Files dragged over the chat (`sand-chat-drop-overlay`): the window's blue
 * at 17% (32% on dark) over all of it, fading in over 0.12 s, and in its
 * middle "Drop files to add to chat" on a blue pill (padded 6 12, white).
 */
struct DropOverlay: View {
  let look: Look

  var body: some View {
    ZStack {
      look.unread.opacity(look.dark ? 0.32 : 0.17)
      Text("Drop files to add to chat")
        .font(.system(size: 14))
        .foregroundStyle(Color.white)
        .padding(.vertical, 6)
        .padding(.horizontal, 12)
        .background(look.unread, in: Capsule())
    }
    .allowsHitTesting(false)
    .transition(.opacity.animation(.easeOut(duration: 0.12)))
    .accessibilityHidden(true)
  }
}
