import Foundation

/**
 * The avatar editor's crop, as the shipped window does it (`xct`, `Jne`,
 * `Nct`, `Ele` and the stage's pan): a square of the picture, as big as its
 * shorter side over the zoom, kept inside the picture, drawn in a 96-point
 * circle and saved as a 256-pixel PNG.
 */
public struct AvatarCrop: Equatable, Sendable {
  /** The circle on screen (`dhe`). */
  public static let stage = 96.0
  /** The saved picture's side (`nR`). */
  public static let output = 256
  /** A picture longer than this on its longest side is drawn down to it first (`BUe`). */
  public static let longestSource = 1024.0
  /** The zoom's range and its button step: (5 − 1) / 8 (`tZ`, `Soe`). */
  public static let minZoom = 1.0, maxZoom = 5.0
  public static let zoomStep = (maxZoom - minZoom) / 8
  /** The biggest file taken by a drop or a paste (`Tln`). */
  public static let maxBytes = 25 * 1024 * 1024

  public var zoom: Double
  public var centerX: Double
  public var centerY: Double
  /** The picture's size, in its pixels. */
  public let width: Double
  public let height: Double

  /** A new picture: zoom 1, centred (`Ele`). */
  public init(width: Double, height: Double) {
    self.width = width; self.height = height
    zoom = Self.minZoom; centerX = width / 2; centerY = height / 2
  }

  /** The crop's side, in the picture's pixels (`xct`). */
  public var side: Double { min(width, height) / Self.clampZoom(zoom) }

  /** The centre kept so the crop stays inside the picture (`Jne`). */
  public var clampedCenter: (x: Double, y: Double) {
    let half = side / 2
    return (Self.clamp(centerX, half, width - half), Self.clamp(centerY, half, height - half))
  }

  /** The part of the picture saved (`Nct`). */
  public var rect: (x: Double, y: Double, width: Double, height: Double) {
    let c = clampedCenter
    return (c.x - side / 2, c.y - side / 2, side, side)
  }

  /** Points on the stage per pixel of the picture. */
  public var scale: Double { Self.stage / min(width, height) * Self.clampZoom(zoom) }

  /** Dragged by `dx`, `dy` points on the stage: the picture follows the pointer. */
  public func panned(dx: Double, dy: Double) -> AvatarCrop {
    var next = self
    next.centerX = centerX - dx / scale
    next.centerY = centerY - dy / scale
    let c = next.clampedCenter
    next.centerX = c.x; next.centerY = c.y
    return next
  }

  /** At another zoom, the centre kept where it can be. */
  public func zoomed(to value: Double) -> AvatarCrop {
    var next = self
    next.zoom = Self.clampZoom(value)
    let c = next.clampedCenter
    next.centerX = c.x; next.centerY = c.y
    return next
  }

  /** Where the whole picture sits on the stage: its size and its top-left corner, in points. */
  public var placement: (x: Double, y: Double, width: Double, height: Double) {
    let c = clampedCenter, k = scale
    return (Self.stage / 2 - c.x * k, Self.stage / 2 - c.y * k, width * k, height * k)
  }

  /** The size a picture is drawn down to before it is cropped: its longest side at most 1024 (`Amt`). */
  public static func fitted(width: Double, height: Double) -> (width: Int, height: Int) {
    let longest = max(width, height)
    guard longest > longestSource else { return (Int(width), Int(height)) }
    let k = longestSource / longest
    return (max(1, Int((width * k).rounded())), max(1, Int((height * k).rounded())))
  }

  /** "Choose an image smaller than 25 MB." for a file over the limit (`Sln`). */
  public static func sizeProblem(bytes: Int) -> String? {
    bytes > maxBytes ? "Choose an image smaller than 25 MB." : nil
  }

  static func clampZoom(_ value: Double) -> Double { value.isFinite ? clamp(value, minZoom, maxZoom) : minZoom }

  /** The window's clamp (`bbe`): a range upside down gives its low end. */
  static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
    high < low ? low : min(high, max(low, value))
  }
}

/** The avatar editor's words, as shipped. */
public enum AvatarEditorWords {
  public static let dropZone = "Drag, drop, or paste an image"
  public static let browse = "Browse files"
  public static let pickerTitle = "Choose an avatar image"
  public static let pickerTypes = ["png", "jpg", "jpeg", "webp", "gif", "bmp"]
  public static let notAnImage = "Selected file is not a valid image."
  public static let unreadable = "That file could not be read."
  public static let unloadable = "That image could not be loaded."
  public static let exportFailed = "Could not export the avatar."
  public static let pastedName = "Pasted image"
  public static let voicesUnavailable = "Voices aren\u{2019}t available right now."
  public static let voiceNotSaved = "Couldn\u{2019}t save the voice."
  public static let generationEmpty = "Image generation returned no picture."

  /** The editor's tabs since faces (12 October 2026): the catalogue's faces, a picture drawn from words, one of the person's own. */
  public static let faces = "Faces"
  public static let generate = "Generate"
  public static let upload = "Upload"
  /** The Faces tab's gender switch and Shuffle. */
  public static let woman = "Woman"
  public static let man = "Man"
  public static let shuffle = "Shuffle"

  /**
   * The Reset beside the editor's tabs: back to the face the agent was
   * given (AgentFaces), shown only while it wears something else (another
   * face, or a picture of its own). A group has no face, and no Reset.
   */
  public static func reset(_ agent: Agent) -> String? {
    guard !agent.isGroup else { return nil }
    if let worn = AgentFaces.worn(agent), worn == AgentFaces.given(agent) { return nil }
    return "Reset face"
  }

  /** The gender the Faces tab opens on: the face the agent wears or was given, else the one it would be given. */
  public static func gender(_ agent: Agent) -> String {
    AgentFaces.own(agent)?.gender ?? AgentFaces.gender(for: agent)
  }
}
