import AppKit
import AVKit
import SwiftUI
import SimeonCore

/**
 * Pictures and videos full screen (`sand-media-viewer`, `m7n`): black at
 * 92% over the window, padded 32. The picture as large as fits (at most 95%
 * of the window's width and 1400), 12 round with a deep shadow; under it the
 * caption ("photo.png · 1 / 2", 13, white at 72%) and, with more than one,
 * a strip of 48-point squares (8 round, 8 apart, the one shown ringed in
 * white). Previous and Next (28, round, white at 14%) at the sides, 24 in;
 * Close (24, white at 85%) at the top right. Left and right arrows go round;
 * Escape closes. A click on a picture closes it (after a moment, so a
 * double click can zoom); a double click zooms to 2.5 where clicked, or
 * back; the wheel or a pinch zooms to 4 where the pointer is; zoomed, a drag
 * moves it. A click outside the picture closes.
 */
struct MediaViewer: View {
  let items: [MediaItem]
  @Environment(Viewers.self) private var viewers
  @Environment(AppStore.self) private var store
  @State private var index: Int
  @State private var scale: CGFloat = 1
  @State private var offset: CGSize = .zero
  @State private var dragOrigin: CGSize?
  @State private var pictures: [String: NSImage] = [:]
  @State private var films: [String: URL] = [:]
  @State private var failed: Set<String> = []
  @State private var cell: CGSize = .zero

  /** The zoom a double click goes to, and the most the wheel goes to (`r7n`, `a7n`). */
  static let doubleClickZoom: CGFloat = 2.5
  static let largest: CGFloat = 4

  init(items: [MediaItem], start: Int) {
    self.items = items
    _index = State(initialValue: FilePreview.wrap(start, count: items.count))
  }

  private var item: MediaItem { items[min(index, items.count - 1)] }

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Color.black.opacity(0.92)
        .contentShape(Rectangle())
        .onTapGesture { viewers.close() }
      VStack(spacing: 12) {
        mediaCell
        Text(FilePreview.mediaCaption(caption: item.caption, name: item.name, source: item.url, index: index, total: items.count))
          .font(.system(size: 13))
          .foregroundStyle(Color.white.opacity(0.72))
          .lineLimit(1)
          .frame(height: 18)
        if items.count > 1 {
          filmstrip
        }
      }
      .padding(32)
      Button { viewers.close() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(Color.white.opacity(0.85))
          .frame(width: 24, height: 24)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help("Close media preview")
      .accessibilityLabel("Close media preview")
      .padding(.top, 10)
      .padding(.trailing, 8)
    }
    .background(ViewerKeys { event in
      switch event.keyCode {
      case 53: viewers.close(); return true
      case 123 where items.count > 1: go(by: -1); return true
      case 124 where items.count > 1: go(by: 1); return true
      default: return false
      }
    })
    .background(PointerZoom { factor, point in zoom(to: scale * factor, at: point) })
    .accessibilityElement(children: .contain)
    .accessibilityLabel(items.count > 1 ? "Media \(index + 1) of \(items.count)" : "Media preview")
    .accessibilityAddTraits(.isModal)
    .task(id: index) { await load(item) }
    .onDisappear {
      // The videos' copies read from the computer go with the viewer.
      for file in films.values where file.isFileURL {
        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
      }
    }
  }

  // MARK: The picture

  private var mediaCell: some View {
    GeometryReader { box in
      let fitted = fittedSize(in: box.size)
      ZStack {
        Color.clear
        media(fitted: fitted)
        if items.count > 1 {
          HStack {
            NavButton(symbol: "chevron.left", label: "Previous media") { go(by: -1) }
            Spacer(minLength: 0)
            NavButton(symbol: "chevron.right", label: "Next media") { go(by: 1) }
          }
          .padding(.horizontal, 24)
        }
      }
      .contentShape(Rectangle())
      .gesture(clicks(fitted: fitted, in: box.size))
      .simultaneousGesture(drag(fitted: fitted, in: box.size))
      .onAppear { cell = box.size }
      .onChange(of: box.size) { _, size in cell = size; clampOffset(fitted: fittedSize(in: size), in: size) }
    }
  }

  @ViewBuilder
  private func media(fitted: CGSize) -> some View {
    if item.isVideo {
      if let film = films[item.url] {
        FilmPlayer(url: film)
          .frame(width: fitted.width, height: fitted.height)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .shadow(color: .black.opacity(0.55), radius: 40, x: 0, y: 32)
      } else {
        status
      }
    } else if let picture = pictures[item.url] {
      Image(nsImage: picture)
        .resizable()
        .interpolation(.high)
        .frame(width: fitted.width, height: fitted.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.55), radius: 40, x: 0, y: 32)
        .scaleEffect(scale)
        .offset(offset)
        .pointerStyle(scale > 1 ? (dragOrigin == nil ? .grabIdle : .grabActive) : .zoomOut)
        .accessibilityLabel(item.caption ?? item.name ?? "Media preview")
    } else {
      status
    }
  }

  /** "Loading media…" or "Couldn't load media" (13, white at 78%, on white at 8%, 10 round, padded 10 14). */
  private var status: some View {
    Text(failed.contains(item.url) ? "Couldn't load media" : "Loading media…")
      .font(.system(size: 13))
      .foregroundStyle(Color.white.opacity(0.78))
      .padding(.vertical, 10)
      .padding(.horizontal, 14)
      .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
      .accessibilityAddTraits(.updatesFrequently)
  }

  /** The picture's size at 1×: its own pixels (as the window draws an image), made smaller to fit the cell and 95% of the window's width or 1400; a video as large as fits. */
  private func fittedSize(in box: CGSize) -> CGSize {
    var natural = CGSize(width: 16, height: 9)
    if let picture = pictures[item.url] {
      let pixels = picture.representations.first.map { CGSize(width: $0.pixelsWide, height: $0.pixelsHigh) } ?? .zero
      natural = pixels.width > 0 && pixels.height > 0 ? pixels : picture.size
    }
    guard natural.width > 0, natural.height > 0 else { return .zero }
    let widest = min(box.width, min((box.width + 64) * 0.95, 1400))
    let ratio = min(widest / natural.width, box.height / natural.height)
    let grow = item.isVideo ? ratio : min(ratio, 1)
    return CGSize(width: (natural.width * grow).rounded(), height: (natural.height * grow).rounded())
  }

  // MARK: Zoom and pan

  /** One click on the picture closes it (once it is clear it was not two); two zoom; a click beside it closes. */
  private func clicks(fitted: CGSize, in box: CGSize) -> some Gesture {
    SpatialTapGesture(count: 2)
      .onEnded { tap in
        guard !item.isVideo, onPicture(tap.location, fitted: fitted, in: box) else { return }
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)) {
          if scale > 1 {
            scale = 1
            offset = .zero
          } else {
            zoom(to: MediaViewer.doubleClickZoom, at: tap.location, in: box)
          }
        }
      }
      .exclusively(before: SpatialTapGesture(count: 1).onEnded { tap in
        let onIt = onPicture(tap.location, fitted: fitted, in: box)
        // A video's own controls take its clicks; a zoomed picture stays open.
        if onIt && (item.isVideo || scale > 1) { return }
        viewers.close()
      })
  }

  private func drag(fitted: CGSize, in box: CGSize) -> some Gesture {
    DragGesture(minimumDistance: 4)
      .onChanged { value in
        guard scale > 1 else { return }
        let origin = dragOrigin ?? offset
        dragOrigin = origin
        offset = CGSize(width: origin.width + value.translation.width, height: origin.height + value.translation.height)
        clampOffset(fitted: fitted, in: box)
      }
      .onEnded { _ in dragOrigin = nil }
  }

  private func onPicture(_ point: CGPoint, fitted: CGSize, in box: CGSize) -> Bool {
    let width = fitted.width * scale
    let height = fitted.height * scale
    let frame = CGRect(x: (box.width - width) / 2 + offset.width, y: (box.height - height) / 2 + offset.height, width: width, height: height)
    return frame.contains(point)
  }

  /** The wheel's or a pinch's zoom, where the pointer is in the window; false when there is no picture to zoom. */
  @discardableResult
  private func zoom(to target: CGFloat, at windowPoint: CGPoint?) -> Bool {
    guard !item.isVideo, pictures[item.url] != nil else { return false }
    // The cell sits 32 in from the window's edges.
    let point = windowPoint.map { CGPoint(x: $0.x - 32, y: $0.y - 32) } ?? CGPoint(x: cell.width / 2, y: cell.height / 2)
    zoom(to: target, at: point, in: cell)
    return true
  }

  /** Zooms keeping the point under the pointer where it is (`Z`), 1 to 4, the picture kept over the cell. */
  private func zoom(to target: CGFloat, at point: CGPoint, in box: CGSize) {
    let next = min(MediaViewer.largest, max(1, target))
    guard next != scale else { return }
    let from = CGPoint(x: point.x - box.width / 2, y: point.y - box.height / 2)
    let content = CGPoint(x: (from.x - offset.width) / scale, y: (from.y - offset.height) / scale)
    offset = CGSize(width: offset.width + content.x * (scale - next), height: offset.height + content.y * (scale - next))
    scale = next
    if scale <= 1 { offset = .zero }
    clampOffset(fitted: fittedSize(in: box), in: box)
  }

  private func clampOffset(fitted: CGSize, in box: CGSize) {
    let spareX = max(0, (fitted.width * scale - box.width) / 2)
    let spareY = max(0, (fitted.height * scale - box.height) / 2)
    offset = CGSize(width: min(spareX, max(-spareX, offset.width)), height: min(spareY, max(-spareY, offset.height)))
  }

  private func go(by step: Int) {
    let next = FilePreview.wrap(index + step, count: items.count)
    guard next != index else { return }
    scale = 1
    offset = .zero
    index = next
  }

  // MARK: The strip

  /** The strip (`sand-media-viewer__filmstrip`): 48-point squares, 8 round, 8 apart, padded 8, on white at 8%; the one shown ringed; scrolling sideways when wider than the window. */
  private var filmstrip: some View {
    ViewThatFits(in: .horizontal) {
      strip
      ScrollView(.horizontal) { strip }
        .scrollIndicators(.never)
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  private var strip: some View {
    HStack(spacing: 8) {
      ForEach(Array(items.enumerated()), id: \.offset) { position, entry in
        Button { go(by: position - index) } label: {
          Thumb(item: entry, picture: pictures[entry.url])
            .frame(width: 48, height: 48)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
              if position == index {
                RoundedRectangle(cornerRadius: 8).strokeBorder(Color.white.opacity(0.95), lineWidth: 2)
              }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("View media \(position + 1) of \(items.count)")
        .task { if !entry.isVideo, pictures[entry.url] == nil { await load(entry) } }
      }
    }
    .padding(8)
  }

  // MARK: Reading

  private func load(_ entry: MediaItem) async {
    if entry.isVideo {
      guard films[entry.url] == nil else { return }
      if entry.url.hasPrefix("https://"), let address = URL(string: entry.url) { films[entry.url] = address; return }
      guard case .ready(let data) = await store.readForPreview(entry.url, agentId: entry.agentId),
            let file = QuickLookBody.file(data, name: entry.name ?? FilePreview.lastPart(entry.url)) else {
        failed.insert(entry.url)
        return
      }
      films[entry.url] = file
      return
    }
    guard pictures[entry.url] == nil else { return }
    var data: Data?
    if entry.url.hasPrefix("https://"), let address = URL(string: entry.url) {
      data = try? await URLSession.shared.data(from: address).0
    } else {
      data = await store.readFile(entry.url, agentId: entry.agentId)
    }
    guard let data, let picture = NSImage(data: data) else {
      failed.insert(entry.url)
      return
    }
    pictures[entry.url] = picture
  }
}

/** Previous or Next (`sand-media-viewer__nav`): 28, round, white at 14%, its glyph white at 92%. */
private struct NavButton: View {
  let symbol: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.92))
        .frame(width: 28, height: 28)
        .background(Color.white.opacity(0.14), in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .help(label)
    .accessibilityLabel(label)
  }
}

/** A square in the strip: the picture filling it, or a video's play glyph. */
private struct Thumb: View {
  let item: MediaItem
  let picture: NSImage?

  var body: some View {
    if let picture {
      Image(nsImage: picture).resizable().interpolation(.medium).aspectRatio(contentMode: .fill)
    } else {
      Image(systemName: item.isVideo ? "play.fill" : "photo")
        .font(.system(size: 14))
        .foregroundStyle(Color.white.opacity(0.6))
    }
  }
}

/** A video in Apple's player, its controls inline, not playing until asked. */
private struct FilmPlayer: NSViewRepresentable {
  let url: URL

  func makeNSView(context: Context) -> AVPlayerView {
    let view = AVPlayerView()
    view.controlsStyle = .inline
    view.showsFullScreenToggleButton = true
    view.player = AVPlayer(url: url)
    return view
  }

  func updateNSView(_ view: AVPlayerView, context: Context) {
    if (view.player?.currentItem?.asset as? AVURLAsset)?.url != url {
      view.player = AVPlayer(url: url)
    }
  }

  static func dismantleNSView(_ view: AVPlayerView, coordinator: ()) {
    view.player?.pause()
  }
}

/**
 * The wheel and a trackpad pinch over the window while the viewer is open:
 * the wheel zooms by e^(−0.0015 × its travel) where the pointer is, as the
 * window does; a pinch by its own amount.
 */
private struct PointerZoom: NSViewRepresentable {
  let zoom: (CGFloat, CGPoint?) -> Bool

  func makeNSView(context: Context) -> ZoomView {
    let view = ZoomView()
    view.zoom = zoom
    return view
  }

  func updateNSView(_ view: ZoomView, context: Context) {
    view.zoom = zoom
  }

  final class ZoomView: NSView {
    var zoom: ((CGFloat, CGPoint?) -> Bool)?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .magnify]) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window, let zoom = self.zoom else { return false }
          // Top-left points in this view, which fills the window.
          let local = self.convert(event.locationInWindow, from: nil)
          let point = CGPoint(x: local.x, y: self.isFlipped ? local.y : self.bounds.height - local.y)
          if event.type == .magnify {
            return zoom(1 + event.magnification, point)
          }
          let travel = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.scrollingDeltaY * 40
          guard travel != 0 else { return false }
          return zoom(exp(travel * 0.0015), point)
        }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}
