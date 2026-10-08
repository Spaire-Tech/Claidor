import Foundation
import SimeonCore

/**
 * Finds what makes the app hang. A thread of its own asks the main thread
 * to answer every tenth of a second; when it takes more than a quarter of a
 * second, the console gets one line: how long the screen stood still, and
 * the last step the app had started ("laying out ava, 512 lines"). Run from
 * Xcode, the lines are in its console, ready to copy.
 */
enum HangWatch {
  static func start() {
    let thread = Thread {
      while true {
        let answered = DispatchSemaphore(value: 0)
        let asked = DispatchTime.now().uptimeNanoseconds
        DispatchQueue.main.async { answered.signal() }
        if answered.wait(timeout: .now() + 0.25) == .timedOut {
          let during = Trace.now
          answered.wait()
          let ms = (DispatchTime.now().uptimeNanoseconds - asked) / 1_000_000
          Trace.log("[simeon] the screen stood still \(ms) ms, while \(during)")
        }
        Thread.sleep(forTimeInterval: 0.1)
      }
    }
    thread.name = "simeon.hang-watch"
    thread.qualityOfService = .utility
    thread.start()
  }
}
