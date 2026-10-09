import AppKit
import SwiftUI

/*
 * The iPhone's views (ios/Simeon) are built into the Mac app too
 * (mac/README.md). They name UIKit's picture, colour and font types; on the
 * Mac those names stand for AppKit's, and the few UIKit calls they make are
 * answered here the way UIKit answers them. What only the phone has stays
 * behind `#if os(iOS)` in those files; nothing here is drawn on its own.
 */

typealias UIImage = NSImage
typealias UIColor = NSColor
typealias UIFont = NSFont

extension Image {
  init(uiImage: NSImage) { self.init(nsImage: uiImage) }
}

extension Color {
  init(uiColor: NSColor) { self.init(nsColor: uiColor) }
}

extension NSFont {
  /** UIKit's line height: ascender, descender and leading. */
  var lineHeight: CGFloat { ascender - descender + leading }
}

extension NSImage {
  /** UIKit's names for how a tinted picture is drawn; the tint is always drawn in. */
  enum RenderingMode { case automatic, alwaysOriginal, alwaysTemplate }
  /** UIKit's orientation; every picture made here stands upright. */
  enum Orientation { case up }

  /** A picture of the pixels at `scale` pixels to the point. */
  convenience init(cgImage: CGImage, scale: CGFloat, orientation: Orientation) {
    let scale = max(scale, 1)
    self.init(cgImage: cgImage, size: NSSize(width: CGFloat(cgImage.width) / scale, height: CGFloat(cgImage.height) / scale))
  }

  /** Pixels to the point: the first representation's width over the picture's. */
  var scale: CGFloat {
    guard size.width > 0, let rep = representations.first, rep.pixelsWide > 0 else { return 1 }
    return CGFloat(rep.pixelsWide) / size.width
  }

  func pngData() -> Data? {
    guard let pixels = cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    return NSBitmapImageRep(cgImage: pixels).representation(using: .png, properties: [:])
  }

  /** The picture in one colour where it is drawn (a mono brand logo in its readable colour). */
  func withTintColor(_ color: NSColor, renderingMode: RenderingMode = .automatic) -> NSImage {
    NSImage(size: size, flipped: false) { rect in
      self.draw(in: rect)
      color.set()
      rect.fill(using: .sourceAtop)
      return true
    }
  }

  /** The picture drawn at `size`, for a chat picture shown smaller than it came. */
  func byPreparingThumbnail(ofSize target: CGSize) async -> NSImage? {
    rasterized(at: target, in: nil)
  }

  /**
   * The asset's own picture for light or dark, drawn once in that
   * appearance: SwiftUI shows a picture as it was first drawn (the iPhone's
   * is in ios/Simeon/Cards.swift).
   */
  func resolved(_ scheme: ColorScheme) -> NSImage {
    rasterized(at: size, in: NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)) ?? self
  }

  /** Drawn into pixels at twice `target`, in `appearance` when one is given. */
  func rasterized(at target: CGSize, in appearance: NSAppearance?) -> NSImage? {
    let width = Int((target.width * 2).rounded()), height = Int((target.height * 2).rounded())
    guard width > 0, height > 0,
          let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
                                     hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
    // Sized in points before the context is made, so what is drawn is drawn in points.
    rep.size = target
    guard let context = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
    let draw = {
      NSGraphicsContext.saveGraphicsState()
      NSGraphicsContext.current = context
      self.draw(in: CGRect(origin: .zero, size: target))
      NSGraphicsContext.restoreGraphicsState()
    }
    if let appearance { appearance.performAsCurrentDrawingAppearance(draw) } else { draw() }
    let image = NSImage(size: target)
    image.addRepresentation(rep)
    return image
  }
}

/** UIKit's picture renderer, as the shared views use it: a scale, and transparent. */
final class UIGraphicsImageRendererFormat {
  var scale: CGFloat = 2
  var opaque = false

  init() {}

  static func preferred() -> UIGraphicsImageRendererFormat { UIGraphicsImageRendererFormat() }
}

final class UIGraphicsImageRendererContext {
  let cgContext: CGContext
  init(cgContext: CGContext) { self.cgContext = cgContext }
}

/**
 * Draws a picture the way UIKit's renderer does: in points, the origin at
 * the top left, Core Graphics and AppKit drawing alike (a picture drawn in
 * it with `draw(in:)` stands upright, as AppKit's `draw(in:)` honours the
 * flipped context).
 */
final class UIGraphicsImageRenderer {
  let size: CGSize
  let format: UIGraphicsImageRendererFormat

  init(size: CGSize, format: UIGraphicsImageRendererFormat = .preferred()) {
    self.size = size
    self.format = format
  }

  func image(actions: (UIGraphicsImageRendererContext) -> Void) -> NSImage {
    let scale = max(format.scale, 1)
    let width = max(1, Int((size.width * scale).rounded(.up))), height = max(1, Int((size.height * scale).rounded(.up)))
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
          let cg = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return NSImage(size: size) }
    cg.translateBy(x: 0, y: CGFloat(height))
    cg.scaleBy(x: scale, y: -scale)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)
    actions(UIGraphicsImageRendererContext(cgContext: cg))
    NSGraphicsContext.restoreGraphicsState()
    guard let made = cg.makeImage() else { return NSImage(size: size) }
    return NSImage(cgImage: made, size: size)
  }
}

/** The clipboard's text, as UIKit's pasteboard gives it. */
final class UIPasteboard {
  static let general = UIPasteboard()

  var string: String? {
    get { NSPasteboard.general.string(forType: .string) }
    set {
      NSPasteboard.general.clearContents()
      if let newValue { NSPasteboard.general.setString(newValue, forType: .string) }
    }
  }
}
