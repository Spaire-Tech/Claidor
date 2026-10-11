import AVFoundation
import LiveKit

/**
 * The phone's audio session during a call (the founder, 11 October 2026:
 * "sometimes, the voice call in mobile says … cannot access microphone and
 * the call doesnt go thru"). The whole app shares one session, and three
 * things set it: the ring and the hang-up tone, dictation, and the call's
 * kit (LiveKit, under ElevenLabs'). The tones set it to play only. The kit
 * sets it to play and record only when its own audio changes what it needs,
 * and after a first call it kept the microphone warm ("recording always
 * prepared", which lasts until the app quits), so on a later call it could
 * find nothing to change and leave the session as the ring had set it: the
 * microphone could not start and the call failed. Now the tones and the call
 * set the session the way the kit sets it for a call (play and record, the
 * video chat mode on the speaker, Bluetooth and AirPlay allowed), and the
 * kit lets the microphone go when a call is over.
 */
enum CallAudio {
  /** The session in the call's shape, active: what the ring, the hang-up tone and the call's start each call first. */
  static func prepare() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .videoChat, options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay])
    try? session.setActive(true)
  }

  /**
   * The microphone let go once a call is over or could not start: the kit
   * stops keeping it warm, then puts the session away itself. After the
   * hang-up tone (0.3 s), so putting the session away does not cut it short.
   */
  static func release() async {
    try? await Task.sleep(nanoseconds: 500_000_000)
    try? await AudioManager.shared.setRecordingAlwaysPreparedMode(false)
  }
}
