import Foundation

/** A colour, sRGB, each channel 0 to 1. */
public struct RGB: Hashable, Sendable {
  public let r: Double, g: Double, b: Double, a: Double

  public init(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) {
    self.r = r; self.g = g; self.b = b; self.a = a
  }

  /** "#rrggbb" or "#rrggbbaa". */
  public init(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    let value = UInt64(digits, radix: 16) ?? 0
    if digits.count == 8 {
      self.init(Double((value >> 24) & 0xff) / 255, Double((value >> 16) & 0xff) / 255, Double((value >> 8) & 0xff) / 255, Double(value & 0xff) / 255)
    } else {
      self.init(Double((value >> 16) & 0xff) / 255, Double((value >> 8) & 0xff) / 255, Double(value & 0xff) / 255)
    }
  }

  public var hex: String {
    let channel = { (v: Double) in String(format: "%02x", Int((min(max(v, 0), 1) * 255).rounded())) }
    return "#" + channel(r) + channel(g) + channel(b)
  }

  /** CSS `color-mix(in oklab, self p, other)`: `amount` is this colour's share. */
  public func mixed(with other: RGB, amount: Double = 0.5) -> RGB {
    let a = Oklab(self), b = Oklab(other)
    let t = 1 - amount
    return Oklab(L: a.L + (b.L - a.L) * t, A: a.A + (b.A - a.A) * t, B: a.B + (b.B - a.B) * t).rgb
  }
}

/** Björn Ottosson's Oklab, the space CSS `color-mix(in oklab, …)` mixes in. */
struct Oklab {
  let L: Double, A: Double, B: Double

  init(L: Double, A: Double, B: Double) { self.L = L; self.A = A; self.B = B }

  init(_ colour: RGB) {
    let lin = { (c: Double) in c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    let r = lin(colour.r), g = lin(colour.g), b = lin(colour.b)
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  }

  var rgb: RGB {
    let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
    let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
    let s = pow(L - 0.0894841775 * A - 1.2914855480 * B, 3)
    let gamma = { (c: Double) -> Double in
      let v = c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055
      return min(max(v, 0), 1)
    }
    return RGB(
      gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    )
  }
}

/**
 * The twelve agent palettes (`AGENT_PALETTES` in
 * desktop/scripts/lib/router-renderer-patch.mjs). The id is what an agent
 * stores as `avatarColor`; every agent is a butterfly in its palette.
 */
public struct AgentPalette: Hashable, Sendable, Identifiable {
  public let id: String
  public let label: String
  public let top: RGB
  public let mid: RGB
  public let bottom: RGB

  init(_ id: String, _ label: String, _ top: String, _ mid: String, _ bottom: String) {
    self.id = id; self.label = label
    self.top = RGB(hex: top); self.mid = RGB(hex: mid); self.bottom = RGB(hex: bottom)
  }

  public static let all: [AgentPalette] = [
    AgentPalette("yellow", "Dusk", "#8b8bea", "#f7a1b3", "#ffb98a"),
    AgentPalette("cyan", "Sage", "#2f6f72", "#6e9c95", "#b8d1c5"),
    AgentPalette("violet", "Lagoon", "#7cc0e0", "#d7a9dc", "#2b4c92"),
    AgentPalette("red", "Ember", "#ff9a76", "#ffd0a0", "#6b3e8f"),
    AgentPalette("green", "Moss", "#6f8f4f", "#a8c58a", "#dfeacb"),
    AgentPalette("brown", "Sand", "#f6e2c4", "#f2b48b", "#c6754e"),
    AgentPalette("magenta", "Berry", "#e07aa8", "#f4b7d0", "#3e2a7a"),
    AgentPalette("blue", "Ocean", "#1f3b73", "#3c7fb7", "#7fd4d0"),
    AgentPalette("gray", "Rose", "#f6c1c7", "#f0a4b8", "#8f5c86"),
    AgentPalette("black", "Slate", "#8c9db8", "#5e6d86", "#d9dfe8"),
    AgentPalette("orange", "Peach", "#ffd1a6", "#ffb0a3", "#e56f8f"),
    AgentPalette("mint", "Mint", "#bff0e2", "#8fd3c3", "#3c8a86"),
  ]

  /** An agent's palette by its stored colour; Ocean when it has none or one we do not know. */
  public static func named(_ id: String?) -> AgentPalette {
    all.first { $0.id == id } ?? all.first { $0.id == "blue" }!
  }

  /** The rim and veins: `wingEdgeColour`, a dark shade of the first and last stops. */
  public var edge: RGB { top.mixed(with: bottom).mixed(with: RGB(hex: "#10131c"), amount: 0.6) }
  /** The body: `wingBodyColour`. */
  public var body: RGB { top.mixed(with: bottom).mixed(with: RGB(hex: "#1b1f29"), amount: 0.35) }
  /** The antennae on a dark ground, where the body's shade would vanish: `wingFeelerColour`'s dark half. */
  public var feelersOnDark: RGB { top.mixed(with: bottom).mixed(with: RGB(hex: "#dfe4ee"), amount: 0.45) }

  /** The agent's name colour in a chat, readable on the grey bubble (`readableOn` in the patch, roughly): the palette's darkest stop on light, its lightest on dark. */
  public func nameColour(dark: Bool) -> RGB {
    let stops = [top, mid, bottom].sorted { luminance($0) < luminance($1) }
    return dark ? stops.last! : stops.first!
  }
}

func luminance(_ colour: RGB) -> Double {
  let lin = { (c: Double) in c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(colour.r) + 0.7152 * lin(colour.g) + 0.0722 * lin(colour.b)
}
