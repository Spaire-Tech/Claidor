import SwiftUI
import UIKit
import WebKit

/**
 * Pictures from the web that iOS can't draw by itself: the airlines' logos
 * on a flight card come as SVG files (Duffel's `logo_symbol_url`, the same
 * address the Mac's card shows), and `UIImage` reads no SVG. A PNG or JPEG
 * is read directly; an SVG is drawn once in a hidden web view, kept as a
 * picture in memory and on disk, and shown from then on.
 */
@MainActor
final class RemoteLogos: NSObject, WKNavigationDelegate {
  static let shared = RemoteLogos()

  private var memory: [String: UIImage] = [:]
  private var failed: Set<String> = []
  private var inFlight: [String: Task<UIImage?, Never>] = [:]
  private var web: WKWebView?
  private var loaded: CheckedContinuation<Void, Never>?
  private var drawing = false
  private static let side: CGFloat = 96

  func image(for url: URL) async -> UIImage? {
    let key = url.absoluteString
    if let image = memory[key] { return image }
    if failed.contains(key) { return nil }
    if let running = inFlight[key] { return await running.value }
    let task = Task { await self.load(url, key: key) }
    inFlight[key] = task
    let image = await task.value
    inFlight[key] = nil
    if let image { memory[key] = image } else { failed.insert(key) }
    return image
  }

  private func load(_ url: URL, key: String) async -> UIImage? {
    let file = Self.cacheFile(key)
    if let data = try? Data(contentsOf: file), let image = UIImage(data: data) { return image }
    guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
    if let image = UIImage(data: data) { return image }
    guard let text = String(data: data, encoding: .utf8), text.contains("<svg") else { return nil }
    let image = await draw(svg: data)
    if let png = image?.pngData() { try? png.write(to: file) }
    return image
  }

  /** One SVG drawn at a time in the one hidden web view, then photographed. */
  private func draw(svg: Data) async -> UIImage? {
    while drawing { try? await Task.sleep(nanoseconds: 30_000_000) }
    drawing = true
    defer { drawing = false }
    let web = webView()
    let side = Int(Self.side)
    let html = """
    <html><head><meta name="viewport" content="width=\(side),initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:\(side)px;height:\(side)px;object-fit:contain}</style></head>
    <body><img src="data:image/svg+xml;base64,\(svg.base64EncodedString())"></body></html>
    """
    await withCheckedContinuation { continuation in
      loaded = continuation
      web.loadHTMLString(html, baseURL: nil)
    }
    // The image paints a moment after the page says it has loaded.
    try? await Task.sleep(nanoseconds: 60_000_000)
    let configuration = WKSnapshotConfiguration()
    configuration.rect = CGRect(x: 0, y: 0, width: Self.side, height: Self.side)
    return await withCheckedContinuation { continuation in
      web.takeSnapshot(with: configuration) { image, _ in continuation.resume(returning: image) }
    }
  }

  /** A web view in the app's window but off the screen: one that is in no window may paint nothing. */
  private func webView() -> WKWebView {
    if let web { return web }
    let made = WKWebView(frame: CGRect(x: -2000, y: -2000, width: Self.side, height: Self.side))
    made.isOpaque = false
    made.backgroundColor = .clear
    made.scrollView.backgroundColor = .clear
    made.isUserInteractionEnabled = false
    made.navigationDelegate = self
    let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
    window?.addSubview(made)
    web = made
    return made
  }

  nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    Task { @MainActor in self.finished() }
  }

  nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    Task { @MainActor in self.finished() }
  }

  private func finished() {
    loaded?.resume()
    loaded = nil
  }

  private static func cacheFile(_ key: String) -> URL {
    let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("logos", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let name = key.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined().suffix(120)
    return folder.appendingPathComponent(String(name) + ".png")
  }
}
