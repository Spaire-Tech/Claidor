import Foundation

/**
 * The SimeonLabs logo lighting up (the founder's video, 11 October 2026,
 * "SimeonLabs-logo-shimmer", measured frame by frame): nothing for 0.2 s;
 * the four petals fade in to the ink at 40% by 1.0 s; a band of the full
 * ink crosses them on the diagonal, top left to bottom right, twice (from
 * 1.2 s and from 1.9 s, the second a little slower), as "Setting up
 * Simeon's computer" shimmers; then the whole logo comes to its true
 * colour, the ink, by 2.85 s and stays. The iPhone's launch and sign-in and
 * the Mac's sign-in draw the logo in the ink at `ink(at:time:)` along its
 * diagonal.
 */
public enum LogoLightUp {
  /** Its length: from here on it is the logo in its ink. */
  public static let duration: TimeInterval = 2.9

  /** How much of the ink shows at `place` along the diagonal (0 the top left corner, 1 the bottom right) at `time` seconds. */
  public static func ink(at place: Double, time t: TimeInterval) -> Double {
    let base: Double
    switch t {
    case ..<0.2: base = 0
    case ..<1.0: base = 0.4 * ease((t - 0.2) / 0.8)
    case ..<2.38: base = 0.4
    case ..<2.85: base = 0.4 + 0.6 * ease((t - 2.38) / 0.47)
    default: base = 1
    }
    guard base > 0, base < 1 else { return base }
    let band = max(sweep(place, time: t, from: 1.22, across: 0.31), sweep(place, time: t, from: 1.876, across: 0.44))
    return base + (1 - base) * band
  }

  /** The eleven places a drawing samples, 0 to 1 by tenths. */
  public static let places: [Double] = (0...10).map { Double($0) / 10 }

  /** One pass of the band: its brightest line moves from the top left (at `from`) to the bottom right in `across` seconds; sharp in front, a longer fall behind. */
  static func sweep(_ place: Double, time t: TimeInterval, from: TimeInterval, across: TimeInterval) -> Double {
    let x = place - (t - from) / across
    let width = x > 0 ? 0.23 : 0.48
    return 0.92 * exp(-(x * x) / (width * width))
  }

  private static func ease(_ x: Double) -> Double {
    let v = min(max(x, 0), 1)
    return v * v * (3 - 2 * v)
  }
}
