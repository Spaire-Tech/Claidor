import SwiftUI
import UIKit
import WebKit
import SimeonCore

/**
 * Pictures from the web that iOS can't draw by itself: the airlines' logos
 * on a flight card come as SVG files (Duffel's `logo_symbol_url`, the same
 * address the Mac's card shows), and `UIImage` reads no SVG. A PNG or JPEG
 * is read directly; an SVG is drawn once by WebKit, kept as a picture in
 * memory and on disk, and shown from then on.
 *
 * The SVG is painted onto a canvas inside a hidden web view and handed back
 * as a PNG (9 October 2026, the founder: the logos didn't "show well at
 * all"). The first way, a photograph of the web view, depended on WebKit
 * painting a view placed off the screen, and its picture was a fixed square
 * whatever the logo's shape; it stays only as the fallback. The picture is
 * then cut to the logo's own edges, so a wordmark (Alaska's is 269 by 80)
 * can be sized by its shape in the round mark (`AirlineLogo.box`). A
 * picture with nothing drawn on it counts as no logo: the mark shows the
 * airline's initials instead of an empty circle.
 */
@MainActor
final class RemoteLogos: NSObject, WKNavigationDelegate {
  static let shared = RemoteLogos()

  private var memory: [String: UIImage] = [:]
  private var failed: Set<String> = []
  private var inFlight: [String: Task<UIImage?, Never>] = [:]
  private var web: WKWebView?
  private var pageReady = false
  private var loaded: CheckedContinuation<Void, Never>?
  private var drawing = false
  /** The fallback photograph's square, in points. */
  private static let side: CGFloat = 96
  /** A painted logo's long side, in pixels: sharp at the sheet's size on a 3× screen. */
  private static let long = 240

  /**
   * The logo for a dark disc: Duffel has no logos for dark backgrounds
   * (every `for-dark-background` address answers 404, measured 9 October
   * 2026), so the parts too dark to read on the disc are lightened
   * (`forDarkDisc`), each kept apart from the light picture.
   */
  func image(for url: URL, dark: Bool) async -> UIImage? {
    guard dark else { return await image(for: url) }
    let key = url.absoluteString + "#dark"
    if let image = memory[key] { return image }
    guard let light = await image(for: url) else { return nil }
    let image = Self.forDarkDisc(light)
    memory[key] = image
    return image
  }

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
    guard let (data, response) = try? await URLSession.shared.data(from: url), ((response as? HTTPURLResponse)?.statusCode ?? 200) < 400 else { return nil }
    var picture = UIImage(data: data)
    if picture == nil, let text = String(data: data, encoding: .utf8), text.contains("<svg") { picture = await draw(svg: text) }
    guard let picture, let image = Self.trimmed(picture) else {
      Trace.mark("an airline's logo drew nothing: \(url.lastPathComponent)")
      return nil
    }
    if let png = image.pngData() { try? png.write(to: file) }
    return image
  }

  /** One SVG drawn at a time in the one hidden web view: painted onto a canvas, else photographed. */
  private func draw(svg: String) async -> UIImage? {
    Trace.mark("drawing an airline's logo")
    while drawing { try? await Task.sleep(nanoseconds: 30_000_000) }
    drawing = true
    defer { drawing = false }
    let web = webView()
    if !pageReady {
      await navigate(web, "<html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body style=\"margin:0;background:transparent\"></body></html>")
      pageReady = true
    }
    if let painted = await paint(svg, in: web) { return painted }
    Trace.mark("an airline's logo didn't paint; photographing it")
    return await photograph(svg, in: web)
  }

  /**
   * The SVG read for its shape (its viewBox, else its width and height),
   * sized to `long` pixels on its long side, drawn onto a canvas and read
   * back as a PNG. An empty string when it can't be.
   */
  private static let paintScript = """
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) return "";
  const size = (value) => { const text = (value || "").trim(); const n = parseFloat(text); return n > 0 && !text.endsWith("%") ? n : 0; };
  const box = (root.getAttribute("viewBox") || "").trim().split(/[\\s,]+/).map(Number);
  let w = size(root.getAttribute("width")), h = size(root.getAttribute("height"));
  if (box.length === 4 && box[2] > 0 && box[3] > 0) { w = box[2]; h = box[3]; }
  else if (w > 0 && h > 0) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  else return "";
  const scale = long / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const image = new Image();
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(root));
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
  """

  private func paint(_ svg: String, in web: WKWebView) async -> UIImage? {
    let url: String? = await withCheckedContinuation { continuation in
      web.callAsyncJavaScript(Self.paintScript, arguments: ["svg": svg, "long": Self.long], in: nil, in: .defaultClient) { result in
        switch result {
        case .success(let value): continuation.resume(returning: value as? String)
        case .failure(let error):
          Trace.mark("an airline's logo: \(error.localizedDescription)")
          continuation.resume(returning: nil)
        }
      }
    }
    guard let url, let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])) else { return nil }
    return UIImage(data: data)
  }

  /** The first way: the SVG shown in the web view, which is then photographed. */
  private func photograph(_ svg: String, in web: WKWebView) async -> UIImage? {
    let side = Int(Self.side)
    let html = """
    <html><head><meta name="viewport" content="width=\(side),initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:\(side)px;height:\(side)px;object-fit:contain}</style></head>
    <body><img src="data:image/svg+xml;base64,\(Data(svg.utf8).base64EncodedString())"></body></html>
    """
    await navigate(web, html)
    // The page needs loading again before the next painting.
    pageReady = false
    // The image paints a moment after the page says it has loaded.
    try? await Task.sleep(nanoseconds: 60_000_000)
    let configuration = WKSnapshotConfiguration()
    configuration.rect = CGRect(x: 0, y: 0, width: Self.side, height: Self.side)
    return await withCheckedContinuation { continuation in
      web.takeSnapshot(with: configuration) { image, _ in continuation.resume(returning: image) }
    }
  }

  private func navigate(_ web: WKWebView, _ html: String) async {
    await withCheckedContinuation { continuation in
      loaded = continuation
      web.loadHTMLString(html, baseURL: nil)
    }
  }

  /**
   * A web view in the app's window, behind everything the app draws: one in
   * no window, or outside the window's bounds, may paint nothing for the
   * fallback photograph.
   */
  private func webView() -> WKWebView {
    if let web { return web }
    let made = WKWebView(frame: CGRect(x: 0, y: 0, width: Self.side, height: Self.side))
    made.isOpaque = false
    made.backgroundColor = .clear
    made.scrollView.backgroundColor = .clear
    made.isUserInteractionEnabled = false
    made.navigationDelegate = self
    let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
    window?.insertSubview(made, at: 0)
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

  /** The picture cut to what is drawn on it (alpha above 12 of 255); nil when nothing is. */
  static func trimmed(_ image: UIImage) -> UIImage? {
    guard let cg = image.cgImage else { return image }
    let width = cg.width, height = cg.height
    guard width > 0, height > 0, width * height <= 4_000_000 else { return image }
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return image }
    var minX = width, minY = height, maxX = -1, maxY = -1
    for y in 0..<height {
      let row = y * width * 4
      for x in 0..<width where pixels[row + x * 4 + 3] > 12 {
        if x < minX { minX = x }
        if x > maxX { maxX = x }
        if y < minY { minY = y }
        if y > maxY { maxY = y }
      }
    }
    guard maxX >= minX, maxY >= minY else { return nil }
    if minX == 0, minY == 0, maxX == width - 1, maxY == height - 1 { return image }
    guard let cut = cg.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)) else { return image }
    return UIImage(cgImage: cut, scale: image.scale, orientation: .up)
  }

  /** The dark disc behind a logo in dark mode (`Ink.tile`'s dark value, #232325). */
  private static let disc: (r: Double, g: Double, b: Double) = (0x23, 0x23, 0x25)

  /**
   * Each part of the logo that reads at less than 2:1 against the dark disc
   * (navy, black, dark purple wordmarks: Alaska's, JetBlue's, Spirit's,
   * Lufthansa's) lightened to a light tint of its own hue, a grey made near
   * white; the colours that already read are left as they are.
   */
  static func forDarkDisc(_ image: UIImage) -> UIImage {
    guard let cg = image.cgImage else { return image }
    let width = cg.width, height = cg.height
    guard width > 0, height > 0, width * height <= 4_000_000 else { return image }
    let linear = { (v: Double) -> Double in let c = v / 255; return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    let luminance = { (r: Double, g: Double, b: Double) -> Double in 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) }
    let ground = luminance(disc.r, disc.g, disc.b)
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let made: CGImage? = pixels.withUnsafeMutableBytes { buffer in
      guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
      context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
      let bytes = buffer.bindMemory(to: UInt8.self)
      for index in stride(from: 0, to: width * height * 4, by: 4) {
        let alpha = Double(bytes[index + 3])
        guard alpha >= 8 else { continue }
        // Premultiplied: back to the colour itself first.
        let r = min(255, Double(bytes[index]) * 255 / alpha), g = min(255, Double(bytes[index + 1]) * 255 / alpha), b = min(255, Double(bytes[index + 2]) * 255 / alpha)
        guard (luminance(r, g, b) + 0.05) / (ground + 0.05) < 2 else { continue }
        let (hue, saturation, _) = hsl(r, g, b)
        let (nr, ng, nb) = saturation < 0.15 ? (0.9, 0.9, 0.9) : rgb(hue, min(0.9, saturation), 0.72)
        bytes[index] = UInt8((nr * alpha).rounded())
        bytes[index + 1] = UInt8((ng * alpha).rounded())
        bytes[index + 2] = UInt8((nb * alpha).rounded())
      }
      return context.makeImage()
    }
    guard let made else { return image }
    return UIImage(cgImage: made, scale: image.scale, orientation: .up)
  }

  /** Hue, saturation and lightness, each 0 to 1, of a colour given 0 to 255. */
  private static func hsl(_ r: Double, _ g: Double, _ b: Double) -> (Double, Double, Double) {
    let r = r / 255, g = g / 255, b = b / 255
    let high = max(r, g, b), low = min(r, g, b)
    let lightness = (high + low) / 2
    guard high != low else { return (0, 0, lightness) }
    let delta = high - low
    let saturation = lightness > 0.5 ? delta / (2 - high - low) : delta / (high + low)
    var hue: Double
    if high == r { hue = (g - b) / delta + (g < b ? 6 : 0) } else if high == g { hue = (b - r) / delta + 2 } else { hue = (r - g) / delta + 4 }
    hue /= 6
    return (hue, saturation, lightness)
  }

  /** Red, green and blue, each 0 to 1, of a hue, saturation and lightness. */
  private static func rgb(_ hue: Double, _ saturation: Double, _ lightness: Double) -> (Double, Double, Double) {
    let q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
    let p = 2 * lightness - q
    func channel(_ t: Double) -> Double {
      var t = t
      if t < 0 { t += 1 }
      if t > 1 { t -= 1 }
      if t < 1.0 / 6 { return p + (q - p) * 6 * t }
      if t < 0.5 { return q }
      if t < 2.0 / 3 { return p + (q - p) * (2.0 / 3 - t) * 6 }
      return p
    }
    return (channel(hue + 1.0 / 3), channel(hue), channel(hue - 1.0 / 3))
  }

  /** Kept under a new folder's name: pictures kept by the photograph before 9 October 2026 are not reused. */
  private static func cacheFile(_ key: String) -> URL {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let folder = caches.appendingPathComponent("airline-logos", isDirectory: true)
    if !FileManager.default.fileExists(atPath: folder.path) {
      try? FileManager.default.removeItem(at: caches.appendingPathComponent("logos", isDirectory: true))
      try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    let name = key.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined().suffix(120)
    return folder.appendingPathComponent(String(name) + ".png")
  }
}
