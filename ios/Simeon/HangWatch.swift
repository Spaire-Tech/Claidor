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
  @MainActor private static var started = false

  @MainActor static func start() {
    guard !started else { return }
    started = true
    let thread = Thread {
      while true {
        let answered = DispatchSemaphore(value: 0)
        let asked = DispatchTime.now().uptimeNanoseconds
        DispatchQueue.main.async { answered.signal() }
        if answered.wait(timeout: .now() + 0.25) == .timedOut {
          let during = Trace.now
          // Still stuck: say so while it lasts (at 2 s, 5 s, 10 s, then every 10 s), so a freeze that never ends is written too.
          var marks: [Double] = [2, 5, 10]
          while answered.wait(timeout: .now() + 0.5) == .timedOut {
            let seconds = Double(DispatchTime.now().uptimeNanoseconds - asked) / 1e9
            if let next = marks.first, seconds >= next {
              marks.removeFirst()
              if marks.isEmpty { marks = [next + 10] }
              Trace.log("[simeon] the screen has stood still \(Int(seconds)) s so far, while \(during) (now: \(Trace.now))")
            }
          }
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
