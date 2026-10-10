import AppKit
import PDFKit
import SwiftUI
import SimeonCore

/**
 * What opens over the whole window (step 2c): a file's preview
 * (`sand-file-viewer`), pictures and videos full screen
 * (`sand-media-viewer`), and a diagram full screen (`sand-mermaid-viewer`).
 * One at a time; Escape or a click outside closes it.
 */
@MainActor
@Observable
final class Viewers {
  enum Shown: Equatable {
    case file(FileItem)
    case media([MediaItem], start: Int)
    case diagram(String)
  }

  var shown: Shown?

  /** A file card's Open (`w1t`): a picture or a video in the media viewer, any other file in the preview. */
  func open(file: FileItem) {
    switch FilePreview.kind(file.name) {
    case .image, .video:
      shown = .media([MediaItem(url: file.url, agentId: file.agentId, caption: nil, name: file.name)], start: 0)
    default:
      shown = .file(file)
    }
  }

  func close() { shown = nil }
}

/** A file to preview: its name, where it is, and whose computer has it. */
struct FileItem: Equatable {
  let name: String
  let url: String
  let agentId: String
}

/** A picture or a video in the media viewer, with its caption (the picture's own words, else its name). */
struct MediaItem: Equatable {
  let url: String
  let agentId: String
  let caption: String?
  let name: String?

  var isVideo: Bool { FilePreview.kind(name ?? FilePreview.lastPart(url)) == .video }
}

/** The open viewer, over the sidebar and the chat. */
struct ViewerLayer: View {
  @Environment(Viewers.self) private var viewers
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    switch viewers.shown {
    case .file(let item):
      FileViewer(item: item, look: look).id(item.url)
    case .media(let items, let start):
      MediaViewer(items: items, start: start)
    case .diagram(let source):
      DiagramViewer(source: source, look: look)
    case nil:
      EmptyView()
    }
  }
}

/**
 * Keys while a viewer is open, before anything else in the window takes
 * them (the window listens on the capture phase): the handler says whether
 * it used the key.
 */
struct ViewerKeys: NSViewRepresentable {
  let handle: (NSEvent) -> Bool

  func makeNSView(context: Context) -> KeyView {
    let view = KeyView()
    view.handle = handle
    return view
  }

  func updateNSView(_ view: KeyView, context: Context) {
    view.handle = handle
  }

  final class KeyView: NSView {
    var handle: ((NSEvent) -> Bool)?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window, let handle = self.handle else { return false }
          return handle(event)
        }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}

/**
 * Download (`downloadAttachment`): the Mac's save panel in Downloads with
 * the file's name, then the file read from the computer into it.
 */
@MainActor
func saveFile(name: String, url: String, agentId: String, store: AppStore) {
  let panel = NSSavePanel()
  panel.nameFieldStringValue = name
  panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
  guard panel.runModal() == .OK, let target = panel.url else { return }
  Task {
    guard let data = await store.readFile(url, agentId: agentId) else { return }
    try? data.write(to: target)
  }
}

// MARK: The file preview

/**
 * A file's preview (`sand-file-viewer`, `lkn`): the window dimmed (the
 * text colour at 90%, 95% on dark), padded 40; the panel as wide as that
 * allows up to 1100, the ground, 12 round, a half-point edge at 15% and a
 * deep shadow. Its head (the window's chrome, padded 8 12 8 16, 12 apart):
 * the name (13, 500, on 18) over a grey line when there is one (11 on 16,
 * at 40%), the kind's own controls, then Download and Close (24, glyphs 14
 * at 60%, 8 apart). Under it the file as its kind shows it.
 */
struct FileViewer: View {
  let item: FileItem
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(Viewers.self) private var viewers
  @State private var read: AppStore.PreviewRead?
  @State private var pdf = PDFControl()
  @State private var sheet: FilePreview.Sheet?
  /** A text file longer than the preview shows. */
  @State private var cut = false
  @State private var document: PDFDocument?

  private var kind: FilePreview.Kind { FilePreview.kind(item.name) }

  var body: some View {
    ZStack {
      look.fileScrim
        .contentShape(Rectangle())
        .onTapGesture { viewers.close() }
      VStack(spacing: 0) {
        head
        content
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(look.ground)
      }
      .frame(maxWidth: 1100, maxHeight: .infinity)
      .background(look.ground)
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(look.ink.opacity(0.15), lineWidth: 0.5) }
      .shadow(color: .black.opacity(0.55), radius: 40, x: 0, y: 32)
      .padding(40)
    }
    .background(ViewerKeys { event in
      if event.keyCode == 53 { viewers.close(); return true }
      if kind == .pdf, let key = event.charactersIgnoringModifiers {
        if key == "+" || key == "=" { pdf.zoom(by: PDFControl.step); return true }
        if key == "-" { pdf.zoom(by: -PDFControl.step); return true }
      }
      return false
    })
    .accessibilityElement(children: .contain)
    .accessibilityLabel(item.name)
    .accessibilityAddTraits(.isModal)
    .task(id: item.url) { await load() }
  }

  // MARK: Head

  private var head: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 1) {
        Text(item.name)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(height: 18)
        if let subtitle {
          Text(subtitle)
            .font(.system(size: 11))
            .foregroundStyle(look.inkTertiary)
            .lineLimit(1)
            .frame(height: 16)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if kind == .pdf, pdf.pages > 0 {
        PDFToolbar(control: pdf, look: look)
      }
      HStack(spacing: 8) {
        HeadButton(symbol: "arrow.down.to.line", label: "Download file", look: look) {
          saveFile(name: item.name, url: item.url, agentId: item.agentId, store: store)
        }
        HeadButton(symbol: "xmark", label: "Close preview", look: look) { viewers.close() }
      }
    }
    .padding(.top, 8)
    .padding(.bottom, 8)
    .padding(.leading, 16)
    .padding(.trailing, 12)
    .background(look.chrome)
  }

  /** The grey line under the name: a PDF's pages, a sheet's rows, or that a long text shows only its start. */
  private var subtitle: String? {
    switch kind {
    case .pdf: return pdf.pages > 0 ? FilePreview.pagesLine(pdf.pages) : nil
    case .table: return sheet.map { FilePreview.rowsLine($0.totalRows) }
    case .text, .markdown:
      return cut ? "Showing the start of this file" : nil
    default: return nil
    }
  }

  // MARK: Body

  @ViewBuilder
  private var content: some View {
    switch read {
    case nil:
      ViewerState(look: look, loading: loadingWords)
    case .missing?:
      ViewerState(look: look, symbol: symbol, title: "File unavailable")
    case .tooLarge?:
      ViewerState(look: look, symbol: symbol, title: tooLarge.title, detail: tooLarge.detail, action: downloadButton)
    case .ready(let data)?:
      ready(data)
    }
  }

  @ViewBuilder
  private func ready(_ data: Data) -> some View {
    switch kind {
    case .pdf:
      if let document {
        PDFBody(document: document, control: pdf, zoom: pdf.zoom, look: look)
      } else {
        ViewerState(look: look, symbol: "doc.richtext", title: "Couldn't render this PDF", action: downloadButton)
      }
    case .markdown:
      MarkdownPage(text: Self.text(data), look: look)
    case .text:
      CodeBody(text: Self.text(data), name: item.name, look: look)
    case .json:
      JSONBody(text: Self.text(data), name: item.name, look: look)
    case .table:
      if let sheet {
        TableBody(sheet: sheet, look: look)
      } else if FilePreview.fileExtension(item.name) == "xlsx" || FilePreview.fileExtension(item.name) == "xls" {
        QuickLookBody(data: data, name: item.name)
      } else {
        ViewerState(look: look, symbol: "tablecells", title: "Couldn't read this spreadsheet")
      }
    case .docx, .audio:
      QuickLookBody(data: data, name: item.name)
    case .image, .video, .unknown:
      ViewerState(look: look, symbol: "doc", title: "Preview not available", detail: "This file type can't be previewed. Download it to open it on your computer.", action: downloadButton)
    }
  }

  private var downloadButton: AnyView {
    AnyView(CardButton(title: "Download", prominent: false, look: look) {
      saveFile(name: item.name, url: item.url, agentId: item.agentId, store: store)
    })
  }

  private var loadingWords: String {
    switch kind {
    case .pdf: return "Loading PDF…"
    case .table: return "Loading spreadsheet…"
    case .docx: return "Loading document…"
    default: return "Loading file…"
    }
  }

  private var symbol: String {
    switch kind {
    case .pdf: return "doc.richtext"
    case .table: return "tablecells"
    case .json: return "curlybraces"
    default: return "doc.text"
    }
  }

  private var tooLarge: (title: String, detail: String) {
    switch kind {
    case .pdf: return ("PDF too large to preview", "This PDF is too large to preview here. Download it to open in your PDF reader.")
    case .table: return ("Spreadsheet too large to preview", "This spreadsheet is too large to preview here. Download it to open it in full.")
    case .docx: return ("Document too large to preview", "This document is too large to preview here. Download it to open it in Word.")
    default: return ("File too large to preview", "This file is too large to preview here. Download it to open it in full.")
    }
  }

  /** The words of a text file, read as UTF-8 whatever it holds, cut at 1.5 million characters. */
  static func text(_ data: Data) -> String {
    let words = String(decoding: data, as: UTF8.self)
    let units = words.utf16
    guard units.count > FilePreview.textCap else { return words }
    let end = units.index(units.startIndex, offsetBy: FilePreview.textCap)
    // A cut inside a character (between "\r" and "\n", inside an emoji) falls back to its start.
    return String(words[..<end])
  }

  private func load() async {
    let answer = await store.readForPreview(item.url, agentId: item.agentId)
    if case .ready(let data) = answer {
      let name = item.name
      switch kind {
      case .table where ["csv", "tsv"].contains(FilePreview.fileExtension(name) ?? ""):
        sheet = await Task.detached { FilePreview.sheet(String(decoding: data, as: UTF8.self), name: name) }.value
      case .text, .markdown:
        cut = data.count > FilePreview.textCap && String(decoding: data, as: UTF8.self).utf16.count > FilePreview.textCap
      case .pdf:
        document = PDFDocument(data: data)
        pdf.pages = document?.pageCount ?? 0
      default:
        break
      }
    }
    read = answer
  }
}

/** A head button (`sand-kit-icon-button`): 24, 6 round, its glyph 14 at 60%. */
private struct HeadButton: View {
  let symbol: String
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 24, height: 24)
        .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
        .contentShape(RoundedRectangle(cornerRadius: 6))
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .help(label)
    .accessibilityLabel(label)
  }
}

/**
 * A preview's state (`sand-file-viewer__state`), centred, padded 32: the
 * kind's glyph (32, at 40%), its title (13, at 60%) and detail (12, at
 * 40%), then its action; or while it loads, "Loading PDF…" (12, at 40%).
 */
struct ViewerState: View {
  let look: Look
  var loading: String?
  var symbol: String?
  var title: String?
  var detail: String?
  var action: AnyView?

  var body: some View {
    VStack(spacing: 10) {
      if let loading {
        Text(loading)
          .font(.system(size: 12))
          .foregroundStyle(look.inkTertiary)
      } else {
        if let symbol {
          Image(systemName: symbol)
            .font(.system(size: 26, weight: .light))
            .foregroundStyle(look.inkTertiary)
            .frame(width: 32, height: 32)
        }
        VStack(spacing: 2) {
          if let title {
            Text(title)
              .font(.system(size: 13))
              .foregroundStyle(look.inkSecondary)
          }
          if let detail {
            Text(detail)
              .font(.system(size: 12))
              .foregroundStyle(look.inkTertiary)
              .multilineTextAlignment(.center)
          }
        }
        if let action {
          action.padding(.top, 2)
        }
      }
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
