import Foundation
import Darwin
import SimeonCore

/**
 * Finds what makes the app hang. A thread of its own asks the main thread
 * to answer every tenth of a second; when it takes more than a quarter of a
 * second, the console gets one line: how long the screen stood still, and
 * the last step the app had started ("laying out ava, 512 lines"). A freeze
 * that lasts also writes where the main thread is stuck, read from its own
 * stack (at 2 s and again at 10 s: the same lines twice is a wait that never
 * ends, different ones a loop). Run from Xcode, the lines are in its
 * console, ready to copy.
 */
enum HangWatch {
  @MainActor private static var started = false
  /** The main thread, taken from on it, so the watch can read where it is. */
  nonisolated(unsafe) private static var mainThread: thread_act_t = 0
  nonisolated(unsafe) private static var mainStack: ClosedRange<UInt> = 0...0
  /** Room for the main thread's return addresses, made before it is held: nothing may be allocated while it is (it may hold the allocator's lock). */
  nonisolated(unsafe) private static var frames = UnsafeMutablePointer<UInt>.allocate(capacity: 64)

  @MainActor static func start() {
    guard !started else { return }
    started = true
    mainThread = mach_thread_self()
    let top = UInt(bitPattern: pthread_get_stackaddr_np(pthread_self()))
    mainStack = (top - UInt(pthread_get_stacksize_np(pthread_self())))...top
    frames[0] = 0  // made now, not first while the main thread is held
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
              if next == 2 || next == 10 {
                Trace.log("[simeon] the main thread is in:\n" + mainTrace().map { "[simeon]   \($0)" }.joined(separator: "\n"))
              }
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

  /** The main thread's calls, innermost first: held for a moment, its registers read, its frames walked, then let go and each address named. */
  private static func mainTrace() -> [String] {
    #if arch(arm64)
    var count = 0
    guard thread_suspend(mainThread) == KERN_SUCCESS else { return ["(the main thread could not be held)"] }
    var state = arm_thread_state64_t()
    var size = mach_msg_type_number_t(MemoryLayout<arm_thread_state64_t>.size / MemoryLayout<natural_t>.size)
    let capacity = Int(size)
    let read = withUnsafeMutablePointer(to: &state) { pointer in
      pointer.withMemoryRebound(to: natural_t.self, capacity: capacity) { words in
        thread_get_state(mainThread, thread_state_flavor_t(ARM_THREAD_STATE64), words, &size)
      }
    }
    if read == KERN_SUCCESS {
      // The system's code signs its return addresses in the top bits; the address is the low 36.
      let mask: UInt64 = 0x0000_000F_FFFF_FFFF
      frames[0] = UInt(state.__pc & mask)
      frames[1] = UInt(state.__lr & mask)
      count = 2
      var fp = UInt(state.__fp)
      // Each frame holds the one before it, then its return address.
      while count < 64, fp % 8 == 0, mainStack.contains(fp), mainStack.contains(fp + 15), let frame = UnsafePointer<UInt>(bitPattern: fp) {
        let back = UInt(UInt64(frame[1]) & mask)
        if back == 0 { break }
        frames[count] = back
        count += 1
        let next = frame[0]
        if next <= fp { break }
        fp = next
      }
    }
    thread_resume(mainThread)
    if read != KERN_SUCCESS { return ["(the main thread's registers could not be read: \(read))"] }
    return (0..<count).map { name(frames[$0]) }
    #else
    return ["(read on an iPhone or an Apple-chip Mac only)"]
    #endif
  }

  /** "SwiftUICore someFunction + 120": the library an address is in and the nearest symbol before it. */
  private static func name(_ address: UInt) -> String {
    var info = Dl_info()
    guard dladdr(UnsafeRawPointer(bitPattern: address), &info) != 0 else { return "0x" + String(address, radix: 16) }
    let library = info.dli_fname.map { (String(cString: $0) as NSString).lastPathComponent } ?? "?"
    guard let symbol = info.dli_sname else { return "\(library) 0x" + String(address, radix: 16) }
    return "\(library) \(String(cString: symbol)) + \(address &- UInt(bitPattern: info.dli_saddr))"
  }
}
