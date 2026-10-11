import Foundation

/**
 * The call's two sounds on the iPhone, the Mac banner's own
 * (desktop/source/voice-call/ring.ts; the founder, 9 October 2026: "i want
 * sounds for when it rings, and when it hangs up like in the mac"):
 *
 * - the ring: a soft ringback, the two blended tones a caller hears (440 and
 *   480 Hz), 0.8 s of tone with 0.06 s edges and 0.4 s of quiet a cycle;
 *   twice before the call connects, then once more at a time while it is
 *   still connecting, seven at most (`RINGS_BEFORE_CONNECT`, `MAX_RINGS`);
 * - the hang-up: two short, soft notes falling a fifth (784 then 523.25 Hz,
 *   0.13 s each, 0.04 s apart), when a call that was live ends.
 *
 * Made as samples and wrapped as WAV, so no sound file ships (as on the
 * Mac, which makes them with WebAudio). The phone plays them louder than
 * the Mac's 0.05 and 0.07: a phone's speaker is quieter than a Mac's.
 */
public enum CallTones {
  public static let ringsBeforeConnect = 2
  public static let maxRings = 7
  public static let ringToneSeconds = 0.8
  public static let ringCycleSeconds = 1.2
  static let ringEdgeSeconds = 0.06
  static let ringFrequencies: [Double] = [440, 480]
  public static let hangUpNotes: [Double] = [784, 523.25]
  static let hangUpNoteSeconds = 0.13
  static let hangUpGapSeconds = 0.04
  static let sampleRate = 44_100
  public static let ringPeak = 0.3
  public static let hangUpPeak = 0.35
  /** The Mac banner's own loudness (`RING_GAIN` 0.05 on each of the two tones, `HANG_UP_GAIN` 0.07): a Mac's speakers are louder than a phone's. */
  public static let macRingPeak = 0.1
  public static let macHangUpPeak = 0.07

  /** `cycles` rings, each its tone and its quiet. */
  public static func ringSamples(cycles: Int, peak: Double = ringPeak) -> [Float] {
    let rate = Double(sampleRate)
    let cycle = Int(ringCycleSeconds * rate)
    let tone = Int(ringToneSeconds * rate)
    let edge = ringEdgeSeconds * rate
    var samples = [Float](repeating: 0, count: max(0, cycles) * cycle)
    for index in 0..<max(0, cycles) {
      for n in 0..<tone {
        let t = Double(n) / rate
        let gain = min(1, Double(n) / edge, Double(tone - n) / edge)
        let wave = ringFrequencies.reduce(0) { $0 + sin(2 * .pi * $1 * t) } / Double(ringFrequencies.count)
        samples[index * cycle + n] = Float(wave * gain * peak)
      }
    }
    return samples
  }

  /** The two falling notes: a 0.012 s rise, then a fall to a thousandth over the note. */
  public static func hangUpSamples(peak: Double = hangUpPeak) -> [Float] {
    let rate = Double(sampleRate)
    let note = Int(hangUpNoteSeconds * rate)
    let gap = Int(hangUpGapSeconds * rate)
    let attack = 0.012 * rate
    var samples: [Float] = []
    for frequency in hangUpNotes {
      for n in 0..<note {
        let t = Double(n) / rate
        let gain = Double(n) < attack ? Double(n) / attack : pow(0.001, (Double(n) - attack) / (Double(note) - attack))
        samples.append(Float(sin(2 * .pi * frequency * t) * gain * peak))
      }
      samples.append(contentsOf: [Float](repeating: 0, count: gap))
    }
    return samples
  }

  /** Samples in -1…1 as a 16-bit mono PCM WAV file. */
  public static func wav(_ samples: [Float]) -> Data {
    var data = Data()
    func append<T: FixedWidthInteger>(_ value: T) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }
    let bytes = UInt32(samples.count * 2)
    data.append(contentsOf: Array("RIFF".utf8)); append(UInt32(36) + bytes)
    data.append(contentsOf: Array("WAVE".utf8))
    data.append(contentsOf: Array("fmt ".utf8)); append(UInt32(16)); append(UInt16(1)); append(UInt16(1))
    append(UInt32(sampleRate)); append(UInt32(sampleRate * 2)); append(UInt16(2)); append(UInt16(16))
    data.append(contentsOf: Array("data".utf8)); append(bytes)
    for sample in samples { append(Int16(max(-1, min(1, sample)) * Float(Int16.max))) }
    return data
  }
}

/** What plays the call's sounds: the app's player on the phone; nothing in tests unless a test gives one. */
public protocol CallTonePlaying: Sendable {
  /** Plays `cycles` rings and returns when they are over. */
  func ring(cycles: Int) async
  func stopRinging()
  func hangUp()
}
