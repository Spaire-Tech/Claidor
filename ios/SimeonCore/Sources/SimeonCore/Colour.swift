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

  /** A straight sRGB blend, as a design tool mixes: `t` of the way toward `other` (the joined card's shades, `JoinedCard.Colours`). */
  public func blended(toward other: RGB, _ t: Double) -> RGB {
    RGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t, a)
  }

  /** WCAG's relative luminance: 0 for black, 1 for white. */
  public var luminance: Double {
    let lin = { (c: Double) in c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
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
