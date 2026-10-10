import AppKit
import SwiftUI
import SimeonCore

/**
 * The first run (reference A04–A08b and A30), the Electron window's
 * onboarding flow (`eDn`, with desktop/scripts/lib/router-renderer-patch.mjs's
 * MEET_*, COO_*, CONNECT_*, COMPUTER_* and NAME_*), measured at 1280 × 800:
 * Meet Simeon, the Chief of Staff, the apps, the computer, the person's
 * name, then the hand-off that makes Simeon and opens his chat.
 *
 * Everything sits about the window's centre. Each step is its title, its
 * scene and Next (with Back from the second step), and fades in over 0.2 s
 * as the one before fades out over 0.1 s. Above the steps the cast moves
 * from step to step on the window's own springs: Simeon, and the three
 * agents of the name step.
 */
struct FirstRunScreen: View {
  @Environment(MacSession.self) private var session
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var step: OnboardingStep = .meet
  /** When the step began: Meet's and the computer's scene clocks start from it. */
  @State private var enteredAt = Date()
  @State private var meetBeat = 0
  @State private var demoBeat = -1
  @State private var name = ""
  /** The person typed in the name field, so the suggestion that arrives late does not replace it. */
  @State private var nameTouched = false
  @State private var computerReady = false
  @State private var handOffError: String?
  @State private var handingOff = false

  var body: some View {
    let look = Look(scheme)
    GeometryReader { box in
      let flow = FlowMetrics(size: box.size)
      ZStack {
        look.ground
        ZStack {
          StepScene(step: step, flow: flow, look: look, meetBeat: meetBeat, demoBeat: demoBeat, name: $name, nameTouched: $nameTouched, computerReady: computerReady, handOffError: handOffError, forward: forward, back: back, retry: handOff)
            .id(step)
            .transition(.asymmetric(insertion: .opacity.animation(.easeOut(duration: 0.2)), removal: .opacity.animation(.easeIn(duration: 0.1))))
          Cast(flow: flow, step: step, meetBeat: meetBeat, demoBeat: demoBeat, meetStart: enteredAt)
        }
        .frame(width: box.size.width, height: box.size.height)
        // A window narrower than 600 points is laid out as the window lays out a phone, and a short one is scaled about the centre to fit (`--simeon-onb-fit`).
        .scaleEffect(flow.fit)
      }
      .overlay(alignment: .top) {
        // The window's 52 points at the top move the window (`--sand-app-region: drag`).
        WindowDragArea().frame(height: 52)
      }
    }
    .ignoresSafeArea()
    .onAppear {
      enteredAt = Date()
      meetBeat = reduceMotion ? 3 : 0
    }
    .task(id: step) { await runClock() }
    .task { await probe() }
  }

  // MARK: Moving through the steps

  /** Next: the following step; on the name step, the hand-off (`Pe`). */
  private func forward() {
    switch step {
    case .name:
      if !Onboarding.normalizedName(name).isEmpty {
        let typed = name
        Task { await store.saveName(typed) }
      }
      handOff()
    case .handOff:
      return
    default:
      if let next = step.next { go(next) }
    }
  }

  /** Back: the step before (Meet plays again, as the window's scene clock starts again). */
  private func back() {
    if let previous = step.previous { go(previous) }
  }

  private func go(_ next: OnboardingStep) {
    // A scene starts from its first beat each time its step is entered.
    if next == .meet { meetBeat = reduceMotion ? 3 : 0 }
    if next == .computer { demoBeat = reduceMotion ? Onboarding.computerFrames.count - 1 : -1 }
    // The name step's field starts empty each time (the window keeps it in the step), and the suggestion fills it again.
    if next == .name {
      name = ""
      nameTouched = false
    }
    withAnimation(.easeOut(duration: 0.2)) {
      step = next
      enteredAt = Date()
    }
  }

  /** Meet's beats (35 ms ticks) and the computer's (0.9 s), from when the step began. */
  private func runClock() async {
    let start = enteredAt
    func wait(until time: Double) async {
      let left = time - Date().timeIntervalSince(start)
      if left > 0 { try? await Task.sleep(nanoseconds: UInt64(left * 1_000_000_000)) }
    }
    switch step {
    case .meet:
      guard !reduceMotion else { meetBeat = 3; return }
      for (index, time) in Onboarding.meetBeatTimes.enumerated() {
        await wait(until: time)
        guard !Task.isCancelled else { return }
        meetBeat = index + 1
      }
    case .computer:
      guard !reduceMotion else { demoBeat = Onboarding.computerFrames.count - 1; return }
      for tick in 1...Onboarding.computerFrames.count {
        await wait(until: Double(tick) * 0.9)
        guard !Task.isCancelled else { return }
        demoBeat = tick - 1
      }
    default:
      return
    }
  }

  /** The window asks the computer from the start, every 2.5 s until it answers (`onboarding-box-probe`). */
  private func probe() async {
    while !computerReady && !Task.isCancelled {
      if await store.computerAnswers() { computerReady = true; return }
      try? await Task.sleep(nanoseconds: UInt64(Onboarding.probeEvery * 1_000_000_000))
    }
  }

  /**
   * The hand-off (`Pe`, `jqn`): its screen at once; the computer, then
   * Simeon made and his introduction started, at least 1.5 s on screen; then
   * the window, on his chat. A failure says so, with Try again.
   */
  private func handOff() {
    guard !handingOff else { return }
    handingOff = true
    handOffError = nil
    if step != .handOff { go(.handOff) }
    Task {
      do {
        let id = try await store.handOff(client: "mac", ready: { computerReady = true })
        if let id { window.choose(id, store: store) }
        session.finishFirstRun()
      } catch {
        handOffError = (error as? GatewayError)?.message ?? error.localizedDescription
        handingOff = false
      }
    }
  }
}

// MARK: - The layout

/**
 * Where things sit, about the window's centre. Below 600 points wide the
 * window's phone rules apply (`PHONE_ONBOARDING_CSS`): titles held by their
 * last line and sized to the width, lines that may wrap, the computer
 * sized to the width, and the whole flow scaled down when the window is
 * too short for its tallest step. A wider window is never scaled: as in
 * the window, a short one cuts off the tallest steps' top and foot.
 */
struct FlowMetrics {
  let size: CGSize

  var narrow: Bool { size.width < 600 }
  /** Half the tallest step (330) plus 16 each side must fit, else everything is scaled about the centre. */
  var fit: CGFloat { narrow ? max(0.1, min(1, (size.height / 2 - 16) / 330)) : 1 }
  var computerScale: CGFloat { Onboarding.screenScale(width: size.width) }

  func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: size.width / 2 + x, y: size.height / 2 + y) }

  /** 28 on a Mac (34 lines); on a phone 7.1% of the width, 22 to 28, lines 1.2 high. */
  var titleSize: CGFloat { narrow ? min(28, max(22, size.width * 0.071)) : 28 }
  var titleLineHeight: CGFloat { narrow ? titleSize * 1.2 : 34 }
  /** Lines that never wrap on a Mac may on a phone, 48 points narrower than the screen. */
  var lineWidth: CGFloat? { narrow ? max(0, size.width - 48) : nil }
  var nameWidth: CGFloat { narrow ? max(0, min(300, size.width - 48)) : 300 }

  enum TitlePlace { case top(CGFloat), bottom(CGFloat) }

  /** Where a step's title is held: its top this far from the centre, or (on a phone) its last line's bottom. */
  func title(_ step: OnboardingStep) -> TitlePlace {
    switch step {
    case .meet: return .top(-168)
    case .chiefOfStaff: return narrow ? .bottom(-262) : .top(-296)
    case .connect: return narrow ? .bottom(-160) : .top(-264)
    case .computer: return narrow ? .bottom(-(150 * computerScale + 28)) : .top(-312)
    case .name: return narrow ? .bottom(-150) : .top(-264)
    case .handOff: return .top(0)
    }
  }

  /** The top of Next and Back, from the centre. */
  func footerTop(_ step: OnboardingStep) -> CGFloat {
    switch step {
    case .meet: return 56
    case .computer: return narrow ? 150 * computerScale + 28 : 256
    default: return 200
    }
  }
}

// MARK: - A step

/** One step's title, scene and Next/Back. */
private struct StepScene: View {
  let step: OnboardingStep
  let flow: FlowMetrics
  let look: Look
  let meetBeat: Int
  let demoBeat: Int
  @Binding var name: String
  @Binding var nameTouched: Bool
  let computerReady: Bool
  let handOffError: String?
  let forward: () -> Void
  let back: () -> Void
  let retry: () -> Void

  var body: some View {
    switch step {
    case .meet:
      StepFrame(step: step, flow: flow, look: look, settled: meetBeat >= 3, forward: forward, back: nil) { Color.clear }
    case .chiefOfStaff:
      StepFrame(step: step, flow: flow, look: look, forward: forward, back: back) { CooScene(flow: flow, look: look) }
    case .connect:
      StepFrame(step: step, flow: flow, look: look, forward: forward, back: back) { ConnectScene(flow: flow) }
    case .computer:
      StepFrame(step: step, flow: flow, look: look, measure: 380, forward: forward, back: back) { ComputerScene(flow: flow, beat: demoBeat) }
    case .name:
      StepFrame(step: step, flow: flow, look: look, forward: forward, back: back) {
        NameScene(flow: flow, look: look, name: $name, touched: $nameTouched, submit: forward)
      }
    case .handOff:
      HandOffScene(flow: flow, look: look, ready: computerReady, error: handOffError, retry: retry)
    }
  }
}

/**
 * A step's frame (`tye`): its title (28, `-0.02em`, held at its place), its
 * scene, and the footer (`nye`) of Next over Back, each 288 × 36, 12 apart,
 * Back's place kept when it has none. On Meet the title and Next rise 6
 * points into place over 0.8 s once Simeon settles.
 */
private struct StepFrame<Scene: View>: View {
  let step: OnboardingStep
  let flow: FlowMetrics
  let look: Look
  var settled = true
  var measure: CGFloat?
  let forward: () -> Void
  let back: (() -> Void)?
  @ViewBuilder let scene: Scene

  var body: some View {
    let rise = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.8)
    ZStack {
      scene
        .frame(width: flow.size.width, height: flow.size.height)
      placed(title)
        .opacity(settled ? 1 : 0)
        .offset(y: settled ? 0 : 6)
        .animation(rise, value: settled)
      footer
        .padding(.top, flow.size.height / 2 + flow.footerTop(step))
        .frame(width: flow.size.width, height: flow.size.height, alignment: .top)
        .opacity(settled ? 1 : 0)
        .offset(y: settled ? 0 : 6)
        .animation(rise, value: settled)
    }
  }

  private var title: some View {
    Text(step.title)
      .font(.system(size: flow.titleSize))
      .tracking(flow.titleSize * -0.02)
      .lineSpacing(LineBox.extra(size: flow.titleSize, lineHeight: flow.titleLineHeight))
      .foregroundStyle(look.ink)
      .multilineTextAlignment(.center)
      .frame(maxWidth: min(measure ?? .infinity, max(0, flow.size.width - 32)))
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
  }

  @ViewBuilder private func placed(_ title: some View) -> some View {
    switch flow.title(step) {
    case .top(let top):
      title
        .padding(.top, max(0, flow.size.height / 2 + top))
        .frame(width: flow.size.width, height: flow.size.height, alignment: .top)
    case .bottom(let bottom):
      title
        .padding(.bottom, max(0, flow.size.height / 2 - bottom))
        .frame(width: flow.size.width, height: flow.size.height, alignment: .bottom)
    }
  }

  private var footer: some View {
    VStack(spacing: 12) {
      FlowButton(label: "Next", primary: true, look: look, action: forward)
      if let back {
        FlowButton(label: "Back", primary: false, look: look, action: back)
      } else {
        Color.clear.frame(width: 288, height: 36)
      }
    }
  }
}

/** Next (near black, near white on dark) and Back (the window's grey), 288 × 36 pills, their colour easing over 0.12 s under the pointer. */
private struct FlowButton: View {
  let label: String
  let primary: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 14))
        .foregroundStyle(primary ? look.flowNextLabel : look.ink)
        .frame(width: 288, height: 36)
        .background(Capsule().fill(primary ? (hovering ? look.flowNextHover : look.flowNext) : (hovering ? look.flowBackHover : look.flowBack)))
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .onHover { inside in
      withAnimation(.easeOut(duration: 0.12)) { hovering = inside }
    }
  }
}

// MARK: - The Chief of Staff

/**
 * "Simeon is your personal Chief of Staff" (`__simeonCooStep`): six agents,
 * three a side 300 out, each a faint ghost (28%, 92%) until the blue curve
 * from Simeon's side reaches it. The curves draw in 0.9 s, the first 0.7 s
 * in, each 0.18 s after the one before; an agent brightens over 0.8 s from
 * 0.52 s after its curve starts. The line under the title rises in after
 * 0.35 s. People who reduce motion get the finished picture.
 */
private struct CooScene: View {
  let flow: FlowMetrics
  let look: Look
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var linked = false

  var body: some View {
    let crew = Onboarding.crew(width: flow.size.width)
    ZStack {
      ZStack {
        ForEach(Array(crew.enumerated()), id: \.element.id) { index, seat in
          CooCurve(seat: seat)
            .trim(from: 0, to: linked ? 1 : 0)
            .stroke(look.cooLine, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            .animation(reduceMotion ? nil : .timingCurve(0.4, 0, 0.2, 1, duration: 0.9).delay(Onboarding.lineDelay(index)), value: linked)
        }
      }
      .frame(width: 800, height: 400)
      .position(flow.point(0, Onboarding.heroY))
      ForEach(Array(crew.enumerated()), id: \.element.id) { index, seat in
        CooAgent(seat: seat, look: look, linked: linked, delay: Onboarding.lineDelay(index) + 0.52)
          .position(flow.point(seat.x, seat.y))
      }
      Text(Onboarding.cooCopy)
        .font(.system(size: 15))
        .tracking(-0.15)
        .lineSpacing(LineBox.extra(size: 15, lineHeight: 20))
        .foregroundStyle(look.systemSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: flow.lineWidth)
        .fixedSize(horizontal: !flow.narrow, vertical: true)
        .opacity(linked ? 1 : 0)
        .offset(y: linked ? 0 : 4)
        .animation(reduceMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 0.9).delay(0.35), value: linked)
        .position(flow.point(0, -236))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Onboarding.cooCopy)
    .onAppear { linked = true }
  }
}

/** A curve from Simeon's side to an agent's inner edge (`cooLine`), in the 800 × 400 web whose middle is Simeon. */
private struct CooCurve: Shape {
  let seat: Onboarding.Seat

  func path(in rect: CGRect) -> Path {
    let curve = Onboarding.curve(to: seat)
    func p(_ point: (x: Double, y: Double)) -> CGPoint { CGPoint(x: rect.midX + point.x, y: rect.midY + point.y) }
    var path = Path()
    path.move(to: p(curve.start))
    path.addCurve(to: p(curve.end), control1: p(curve.control1), control2: p(curve.control2))
    return path
  }
}

/** One of the six: its butterfly (56) and its job under it (12, the system's grey), 8 apart. */
private struct CooAgent: View {
  let seat: Onboarding.Seat
  let look: Look
  let linked: Bool
  let delay: Double
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var source = StageSource(size: 56)

  var body: some View {
    VStack(spacing: 8) {
      StageMark(source: source, palette: AgentPalette.named(seat.colour), state: .idle)
        .frame(width: 56, height: 56)
      Text(seat.label)
        .font(.system(size: 12))
        .tracking(-0.12)
        .foregroundStyle(look.systemSecondary)
        .fixedSize()
        .frame(height: 16)
    }
    .frame(width: 56, height: 80)
    .opacity(linked ? 1 : 0.28)
    .scaleEffect(linked ? 1 : 0.92)
    .animation(reduceMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 0.8).delay(delay), value: linked)
  }
}

// MARK: - The apps

/**
 * "Your agents connect to the apps you already use" (`__simeonConnectStep`,
 * simeonlabs.com's connector scene): the twelve apps slide behind a glass
 * tile one place every 1.6 s (0.55 s on a cubic ease, then a hold), the one
 * behind the glass swelling, the far ones blurred and thinned, the row
 * fading out at both ends. 920 × 260 (as wide as the window when it is
 * narrower), 20 above the centre; Simeon sits on the tile (the cast). People
 * who reduce motion see the row at rest.
 */
private struct ConnectScene: View {
  let flow: FlowMetrics
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var start = Date()

  var body: some View {
    let width = min(920, flow.size.width)
    ZStack {
      TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { context in
        let elapsed = reduceMotion ? 0 : context.date.timeIntervalSince(start)
        let count = Onboarding.connectApps.count
        ZStack {
          ForEach(Array(Onboarding.connectApps.enumerated()), id: \.element) { index, app in
            let orb = Onboarding.orb(index, count: count, elapsed: elapsed, width: Double(width))
            Image("connect-\(app)")
              .resizable()
              .interpolation(.high)
              .scaledToFit()
              .frame(width: orb.size, height: orb.size)
              .blur(radius: orb.blur)
              .opacity(orb.opacity)
              .position(x: width / 2 + orb.x, y: 130)
          }
        }
        .frame(width: width, height: 260)
        .clipped()
        .mask {
          LinearGradient(stops: [
            .init(color: .clear, location: 0), .init(color: .black, location: 0.18),
            .init(color: .black, location: 0.82), .init(color: .clear, location: 1),
          ], startPoint: .leading, endPoint: .trailing)
        }
      }
      GlassTile()
    }
    .frame(width: width, height: 260)
    .position(flow.point(0, Onboarding.connectY))
    .accessibilityHidden(true)
  }
}

/**
 * The site's frosted tile (`simeon-connect__tile`): 150 square plus its
 * 1-point white edge, corners 35, white at 40% over Apple's glass, a 6-point
 * white rim inside, a light top and a soft shade at the foot, and its
 * shadow beneath.
 */
private struct GlassTile: View {
  var body: some View {
    let outer = RoundedRectangle(cornerRadius: 35, style: .circular)
    let shade = Color(red: 60 / 255, green: 70 / 255, blue: 90 / 255)
    let drop = Color(red: 30 / 255, green: 40 / 255, blue: 60 / 255)
    outer
      .fill(Color.white.opacity(0.4)
        .shadow(.inner(color: .white.opacity(0.95), radius: 2.4, x: 0, y: 3.6))
        .shadow(.inner(color: shade.opacity(0.14), radius: 6.6, x: 0, y: -4.8)))
      .glassEffect(.regular, in: outer)
      .overlay {
        RoundedRectangle(cornerRadius: 34, style: .circular)
          .strokeBorder(Color.white.opacity(0.72), lineWidth: 6)
          .padding(1)
      }
      .overlay(outer.strokeBorder(Color.white.opacity(0.9), lineWidth: 1))
      .frame(width: Onboarding.connectTile + 2, height: Onboarding.connectTile + 2)
      .shadow(color: drop.opacity(0.38), radius: 18, x: 0, y: 15)
      .shadow(color: drop.opacity(0.1), radius: 2.5, x: 0, y: 2)
  }
}

// MARK: - The computer

/**
 * "They have their own computer and work just like you" (`Yqn`): the
 * window's 441 × 300 drawing of a computer, 1.45 times (as wide as the
 * window less 16 a side when that is smaller), on the centre. Simeon is the
 * cursor (the cast); every 0.9 s he moves or presses: a tile, another, the
 * first window's close, the second window's button.
 */
private struct ComputerScene: View {
  let flow: FlowMetrics
  let beat: Int

  var body: some View {
    DemoCard(beat: beat)
      .scaleEffect(flow.computerScale)
      .position(flow.point(0, 0))
      .accessibilityHidden(true)
  }
}

/** The screen (`sand-onboarding__demo-card`): the wallpaper, two windows of white tiles, corners 16.59, a 0.79 edge and its shadow. */
private struct DemoCard: View {
  let beat: Int

  var body: some View {
    let pressed = beat < 0 ? nil : Onboarding.computerFrame(beat).pressed
    let shown = Onboarding.computerWindows(beat: beat)
    let card = RoundedRectangle(cornerRadius: 16.59, style: .circular)
    let white = Color.white
    let faint = Color.black.opacity(0.1)
    ZStack(alignment: .topLeading) {
      Color(hex: 0x242a36)
      Image("demo-wallpaper")
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: 441 - 1.58, height: 300 - 1.58)
        .clipped()
      DemoWindow(width: 300, height: 183.9, shown: shown.first, closePressed: pressed == "a-close") {
        DemoTile(x: 13.8, y: 89.8, width: 272.4, height: 102.3, radius: 5.5, ink: white)
        DemoTile(x: 13.8, y: 33.2, width: 59.4, height: 44.2, radius: 5.5, ink: white)
        DemoTile(x: 82.9, y: 33.2, width: 59.4, height: 44.2, radius: 5.5, ink: white, pressed: pressed == "a-tile-2")
        DemoTile(x: 153.5, y: 33.2, width: 59.4, height: 44.2, radius: 5.5, ink: white)
        DemoTile(x: 224, y: 33.2, width: 59.4, height: 44.2, radius: 5.5, ink: white, pressed: pressed == "a-tile-4")
      }
      .offset(x: 29.6, y: 32.4)
      DemoWindow(width: 262.7, height: 183.9, shown: shown.second, closePressed: false) {
        DemoTile(x: 82.9, y: 38.7, width: 179.7, height: 145.2, radius: 5.5, ink: white)
        DemoTile(x: 6.9, y: 38.6, width: 69, height: 145.5, radius: 5.3, ink: white)
        DemoTile(x: 100.9, y: 56.7, width: 16.6, height: 16.6, radius: 2.8, ink: faint)
        DemoTile(x: 100.9, y: 89.9, width: 16.6, height: 16.6, radius: 2.8, ink: faint)
        DemoTile(x: 131.3, y: 62.2, width: 89.9, height: 6.9, radius: 13.8, ink: faint)
        DemoTile(x: 131.3, y: 87.1, width: 89.9, height: 6.9, radius: 13.8, ink: faint)
        DemoTile(x: 131.3, y: 102.3, width: 58.1, height: 6.9, radius: 13.8, ink: faint)
        DemoTile(x: 96.8, y: 125.8, width: 152.1, height: 44.2, radius: 5.5, ink: Color(red: 4 / 255, green: 4 / 255, blue: 4 / 255).opacity(0.12), pressed: pressed == "b-button")
      }
      .offset(x: 125, y: 73.9)
    }
    .frame(width: 441 - 1.58, height: 300 - 1.58, alignment: .topLeading)
    .padding(0.79)
    .clipShape(card)
    .overlay(card.strokeBorder(Color(hex: 0x141414, opacity: 0.12), lineWidth: 0.79))
    .shadow(color: .black.opacity(0.22), radius: 22.12, x: 0, y: 15.8)
  }
}

/**
 * One of the demo's windows (`Kqn`'s frame): `#f2f2f4`, corners 8.3, a 0.75
 * edge, two shadows, its grey title bar (24.9) and its three lights. It
 * comes in over 0.42 s from 86% and goes over 0.26 s.
 */
private struct DemoWindow<Content: View>: View {
  let width: CGFloat
  let height: CGFloat
  let shown: Bool
  let closePressed: Bool
  @ViewBuilder let content: Content

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 8.3, style: .circular)
    ZStack(alignment: .topLeading) {
      content
      Color(hex: 0xd9d9d9).frame(height: 24.9)
      TrafficLights(closePressed: closePressed)
        .offset(x: 8.9, y: 8.5)
    }
    .frame(width: width - 1.5, height: height - 1.5, alignment: .topLeading)
    .padding(0.75)
    .background(Color(hex: 0xf2f2f4))
    .clipShape(shape)
    .overlay(shape.strokeBorder(Color(hex: 0x141414, opacity: 0.1), lineWidth: 0.75))
    .shadow(color: .black.opacity(0.12), radius: 15, x: 0, y: 12)
    .shadow(color: .black.opacity(0.05), radius: 5.25, x: 0, y: 4.5)
    .scaleEffect(shown ? 1 : 0.86)
    .opacity(shown ? 1 : 0)
    .animation(shown ? .timingCurve(0.1, 0.9, 0.2, 1, duration: 0.42) : .timingCurve(0.2, 0, 0, 1, duration: 0.26), value: shown)
  }
}

/** A tile (`Eu`): pressed, it darkens to black at 18% and shrinks to 96% over 0.15 s. */
private struct DemoTile: View {
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
  let radius: CGFloat
  let ink: Color
  var pressed = false

  var body: some View {
    RoundedRectangle(cornerRadius: radius, style: .circular)
      .fill(pressed ? Color.black.opacity(0.18) : ink)
      .frame(width: width, height: height)
      .scaleEffect(pressed ? 0.96 : 1)
      .animation(.timingCurve(0.2, 0, 0, 1, duration: 0.15), value: pressed)
      .offset(x: x, y: y)
  }
}

/** The three lights (7.3, 4.6 apart); the close one, pressed, shrinks to 86% and dims to 70%. */
private struct TrafficLights: View {
  let closePressed: Bool

  var body: some View {
    HStack(spacing: 4.6) {
      light(0xff5f57, pressed: closePressed)
      light(0xfebc2e, pressed: false)
      light(0x28c840, pressed: false)
    }
  }

  private func light(_ hex: UInt32, pressed: Bool) -> some View {
    Circle()
      .fill(Color(hex: hex))
      .frame(width: 7.3, height: 7.3)
      .colorMultiply(Color(white: pressed ? 0.7 : 1))
      .scaleEffect(pressed ? 0.86 : 1)
      .animation(.timingCurve(0.2, 0, 0, 1, duration: 0.15), value: pressed)
  }
}

// MARK: - The name

/**
 * "How should Simeon & Co call you?" (`__simeonNameStep`): one white field
 * (300 × 38, corners 10, the words centred at 16) 4 below the centre, the
 * note under it (13, the system's grey) at 44; the field takes the keys
 * after 0.45 s and offers the name the person chose or Google's first name
 * until they type. Return is Next. Empty is allowed: nothing is saved.
 */
private struct NameScene: View {
  let flow: FlowMetrics
  let look: Look
  @Binding var name: String
  @Binding var touched: Bool
  let submit: () -> Void
  @Environment(AppStore.self) private var store
  @FocusState private var focused: Bool

  var body: some View {
    ZStack {
      field
        .position(flow.point(0, 4))
      Text(Onboarding.nameNote)
        .font(.system(size: 13))
        .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
        .foregroundStyle(look.systemSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: flow.lineWidth)
        .fixedSize(horizontal: !flow.narrow, vertical: true)
        .position(flow.point(0, 44))
    }
    .task {
      try? await Task.sleep(nanoseconds: 450_000_000)
      focused = true
    }
    .task {
      if let suggested = await store.namePrompt(), !touched { name = suggested }
    }
  }

  private var field: some View {
    let shape = RoundedRectangle(cornerRadius: 10, style: .circular)
    let typed = Binding<String>(get: { name }, set: { touched = true; name = String($0.prefix(60)) })
    return TextField("", text: typed, prompt: Text(Onboarding.namePlaceholder).foregroundStyle(look.namePlaceholder))
      .textFieldStyle(.plain)
      .font(.system(size: 16))
      .tracking(-0.16)
      .multilineTextAlignment(.center)
      .foregroundStyle(look.ink)
      .autocorrectionDisabled()
      .focused($focused)
      .focusEffectDisabled()
      .onSubmit(submit)
      .padding(.horizontal, 14)
      .frame(width: flow.nameWidth, height: 38)
      .background(shape.fill(look.nameField))
      .overlay(shape.strokeBorder(focused ? look.nameFocusEdge : look.nameEdge, lineWidth: 1))
      // Focused, the window's 3-point blue ring (its `box-shadow` takes the place of the field's own soft shadow).
      .background {
        RoundedRectangle(cornerRadius: 13, style: .circular)
          .fill(focused ? look.nameFocusRing : .clear)
          .padding(-3)
      }
      .shadow(color: focused ? .clear : look.nameShadow, radius: 1, x: 0, y: 1)
      .animation(.linear(duration: 0.2), value: focused)
      .accessibilityLabel(Onboarding.namePlaceholder)
  }
}

// MARK: - The hand-off

/**
 * The last screen (`Qqn`, its mark and name taken away by the patch): one
 * line on the centre in the window's moving light (17, `-0.008em`) from
 * the newest status of the computer, "Getting your team ready…" once it
 * answers. A failure: "Simeon couldn’t finish setting up", why in red
 * (13), and Try again (16, the window's blue), 22 apart.
 */
private struct HandOffScene: View {
  let flow: FlowMetrics
  let look: Look
  let ready: Bool
  let error: String?
  let retry: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 22) {
      if let error {
        Text(Onboarding.failed)
          .font(.system(size: 17))
          .tracking(-0.136)
          .foregroundStyle(look.ink)
          .multilineTextAlignment(.center)
        Text(error)
          .font(.system(size: 13))
          .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
          .foregroundStyle(look.danger)
          .multilineTextAlignment(.center)
        Button("Try again", action: retry)
          .buttonStyle(.plain)
          .font(.system(size: 16))
          .foregroundStyle(look.link)
          .keyboardShortcut(.defaultAction)
      } else {
        TimelineView(.periodic(from: .now, by: 0.5)) { _ in
          let status = store.latestComputerStatus
          let line = Onboarding.handOffLine(ready: ready, percent: status?.pullPercent.map { Int($0.rounded()) }, sleeping: status?.state == "hibernated")
          ShimmerText(words: Text(line).font(.system(size: 17)).tracking(-0.136), look: look)
            .accessibilityLabel(line)
        }
      }
    }
    .frame(width: min(305, flow.size.width))
    .position(flow.point(0, 0))
  }
}

// MARK: - The cast

/**
 * Simeon and the name step's three agents (`fqn`), above the steps, each
 * placed for the step (`QBn`, `eqn`) and moved there on the window's own
 * springs when the step or its beat changes.
 */
private struct Cast: View {
  let flow: FlowMetrics
  let step: OnboardingStep
  let meetBeat: Int
  let demoBeat: Int
  let meetStart: Date

  var body: some View {
    let width = Double(flow.size.width)
    ZStack {
      CastMember(palette: AgentPalette.named("blue"), placement: Placement.hero(step: step, meetBeat: meetBeat, demoBeat: demoBeat, width: width), pointer: step == .computer, meetStart: meetStart)
      ForEach(Placement.nameAgents) { agent in
        CastMember(palette: AgentPalette.named(agent.colour), placement: Placement.nameAgent(agent.id, step: step, width: width), pointer: false, meetStart: meetStart)
      }
    }
    .frame(width: flow.size.width, height: flow.size.height)
  }
}

/** Where one of the cast is, how big and how seen, its mood, and how it gets there (the window's placement). */
struct Placement: Equatable {
  var x: Double
  var y: Double
  var scale: Double
  var opacity: Double
  var state: MarkState
  var motion: Motion
  /** It follows the pointer and turns when clicked (`isGazing`). */
  var gazing = false
  var turn: Turn = .none
  /** Drawn for a light surface whatever the theme (`surfaceTheme: "light"`: the computer's screen). */
  var lightSurface = false

  enum Turn: Equatable { case none, fadeIn, spin }

  /**
   * The window's transitions (`rqn`): its three springs (stiffness 175 and
   * damping 26; 100 and 20; 175 and 18.5, each of mass 1), the exit (0.3 s,
   * `cubic-bezier(.4,0,1,1)`), or none.
   */
  enum Motion: Equatable {
    case standard, slow, bounce, exit, none

    var animation: Animation? {
      switch self {
      case .standard: return .interpolatingSpring(mass: 1, stiffness: 175, damping: 26)
      case .slow: return .interpolatingSpring(mass: 1, stiffness: 100, damping: 20)
      case .bounce: return .interpolatingSpring(mass: 1, stiffness: 175, damping: 18.5)
      case .exit: return .timingCurve(0.4, 0, 1, 1, duration: 0.3)
      case .none: return nil
      }
    }
  }

  /** Off stage (`zoe`): small, unseen, 20 above the centre. */
  static func offStage(_ state: MarkState) -> Placement {
    Placement(x: 0, y: -20, scale: 0.3, opacity: 0, state: state, motion: .none)
  }

  /** Simeon (`QBn`). */
  static func hero(step: OnboardingStep, meetBeat: Int, demoBeat: Int, width: Double) -> Placement {
    switch step {
    case .meet:
      // Unseen large, then fading in larger on the slow spring and turning once; then his seat, the spot he holds on the next step.
      if meetBeat < 1 { return Placement(x: 0, y: Onboarding.heroY, scale: 1.6, opacity: 1, state: .happy, motion: .none, turn: .fadeIn) }
      if meetBeat < 3 { return Placement(x: 0, y: Onboarding.heroY, scale: 2.3, opacity: 1, state: .happy, motion: .slow, turn: meetBeat == 2 ? .spin : .fadeIn) }
      return Placement(x: 0, y: Onboarding.heroY, scale: 1, opacity: 1, state: .idle, motion: .standard, gazing: true)
    case .chiefOfStaff:
      return Placement(x: 0, y: Onboarding.heroY, scale: 1, opacity: 1, state: .proud, motion: .standard, gazing: true)
    case .connect:
      return Placement(x: 0, y: Onboarding.connectY, scale: 1.3, opacity: 1, state: .idle, motion: .standard, gazing: true)
    case .computer:
      let place = Onboarding.cursorPlace(beat: demoBeat, width: width)
      return Placement(x: place.x, y: place.y, scale: place.scale, opacity: 1, state: demoBeat < 0 ? .thinking : .working, motion: .slow, lightSurface: true)
    case .name:
      return Placement(x: 0, y: 0, scale: 0.55, opacity: 0, state: .happy, motion: .exit)
    case .handOff:
      return offStage(.idle)
    }
  }

  struct NameAgent: Identifiable {
    let id: String
    let colour: String
  }

  /** The name step's three, in the window's order, with their colours (`ZBn`). */
  static let nameAgents = [NameAgent(id: "invoice-chaser", colour: "red"), NameAgent(id: "weekly-standup", colour: "cyan"), NameAgent(id: "sales-forecast", colour: "blue")]

  /** One of the three (`eqn`): bouncing in over the field on the name step, off stage everywhere else. */
  static func nameAgent(_ id: String, step: OnboardingStep, width: Double) -> Placement {
    guard step == .name, let seat = Onboarding.nameSeats(width: width).first(where: { $0.id == id }) else { return offStage(.idle) }
    return Placement(x: seat.x, y: seat.y, scale: seat.scale, opacity: 1, state: .happy, motion: .bounce, gazing: true)
  }
}

/**
 * One of the cast (`mqn`): an 80-point butterfly, placed, scaled and faded
 * on its placement's motion; on the computer step Simeon carries the
 * window's arrow (30 × 28, 22 left of and 20 above his box). Gazing, a
 * click turns it once.
 */
private struct CastMember: View {
  let palette: AgentPalette
  let placement: Placement
  let pointer: Bool
  let meetStart: Date
  @State private var source = StageSource(size: 80)
  /** It keeps moving while it fades out (the exit's 0.3 s), then stops drawing. */
  @State private var drawing = true

  var body: some View {
    StageMark(source: source, palette: palette, state: placement.state, lightSurface: placement.lightSurface, running: drawing)
      .frame(width: 80, height: 80)
      .overlay(alignment: .topLeading) {
        CursorArrow()
          .frame(width: 30, height: 28)
          .offset(x: -22.03, y: -20.04)
          .opacity(pointer ? 1 : 0)
          .animation(.linear(duration: 0.2), value: pointer)
      }
      .modifier(MeetTurn(turn: placement.turn, start: meetStart))
      .contentShape(Rectangle())
      .onTapGesture { if placement.gazing { source.spin() } }
      .allowsHitTesting(placement.gazing && placement.opacity > 0)
      .scaleEffect(placement.scale)
      .opacity(placement.opacity)
      .offset(x: placement.x, y: placement.y)
      .animation(placement.motion.animation, value: placement)
      .accessibilityHidden(true)
      .task(id: placement.opacity > 0) {
        if placement.opacity > 0 {
          drawing = true
        } else {
          try? await Task.sleep(nanoseconds: 350_000_000)
          if !Task.isCancelled { drawing = false }
        }
      }
  }
}

/**
 * Meet's turn (`simeon-turn`): the box fades in over 1.2 s
 * (`cubic-bezier(.4,0,.2,1)`), and on the second beat turns once round its
 * upright axis over 1.4 s (`cubic-bezier(.65,0,.35,1)`, a 900-point
 * perspective).
 */
private struct MeetTurn: ViewModifier {
  let turn: Placement.Turn
  let start: Date

  private static let fade = CubicCurve(0.4, 0, 0.2, 1)
  private static let spin = CubicCurve(0.65, 0, 0.35, 1)

  func body(content: Content) -> some View {
    TimelineView(.animation(minimumInterval: nil, paused: turn == .none)) { context in
      let t = context.date.timeIntervalSince(start)
      let opacity = turn == .none ? 1 : Self.fade(t / 1.2)
      let angle = turn == .spin ? 360 * Self.spin((t - Onboarding.meetBeatTimes[1]) / 1.4) : 0
      // SwiftUI's perspective is relative to the view's size (80): the window's 900-point perspective.
      content
        .opacity(opacity)
        .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 80.0 / 900.0)
    }
  }
}

/** The window's arrow on the computer step (`uqn`): black, a 2.2 white edge, its `6 2 34 32` view fitted to the box. */
private struct CursorArrow: View {
  var body: some View {
    Canvas { context, size in
      let scale = min(size.width / 34, size.height / 32)
      let dx = (size.width - 34 * scale) / 2 - 6 * scale
      let dy = (size.height - 32 * scale) / 2 - 2 * scale
      let arrow = CursorArrow.path.applying(CGAffineTransform(translationX: dx, y: dy).scaledBy(x: scale, y: scale))
      context.fill(arrow, with: .color(.black))
      context.stroke(arrow, with: .color(.white), lineWidth: 2.2 * scale)
    }
  }

  static let path: Path = {
    var p = Path()
    p.move(to: CGPoint(x: 37.2289, y: 13.359))
    p.addCurve(to: CGPoint(x: 37.0362, y: 10.3745), control1: CGPoint(x: 38.6252, y: 12.778), control2: CGPoint(x: 38.4988, y: 10.7591))
    p.addCurve(to: CGPoint(x: 9.96901, y: 3.22056), control1: CGPoint(x: 29.8708, y: 8.4902), control2: CGPoint(x: 16.0804, y: 4.85934))
    p.addCurve(to: CGPoint(x: 7.97148, y: 5.28916), control1: CGPoint(x: 8.74279, y: 2.89175), control2: CGPoint(x: 7.60764, y: 4.07288))
    p.addCurve(to: CGPoint(x: 15.4795, y: 31.2137), control1: CGPoint(x: 9.82954, y: 11.5004), control2: CGPoint(x: 13.5726, y: 24.547))
    p.addCurve(to: CGPoint(x: 18.4353, y: 31.4251), control1: CGPoint(x: 15.8835, y: 32.626), control2: CGPoint(x: 17.8251, y: 32.7612))
    p.addLine(to: CGPoint(x: 23.9544, y: 19.3395))
    p.addCurve(to: CGPoint(x: 24.7847, y: 18.5371), control1: CGPoint(x: 24.12, y: 18.9769), control2: CGPoint(x: 24.4166, y: 18.6903))
    p.addLine(to: CGPoint(x: 37.2289, y: 13.359))
    p.closeSubpath()
    return p
  }()
}

// MARK: - The stage's butterflies

/**
 * A butterfly of the first run's stage, moving as the window's mark (`sd`)
 * moves at its own size: its own engine and light trails, not an agent's
 * shared source. It stops drawing while unseen.
 */
struct StageMark: View {
  let source: StageSource
  let palette: AgentPalette
  let state: MarkState
  var lightSurface = false
  var running = true
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let dark = !lightSurface && scheme == .dark
    let reduce = reduceMotion
    TimelineView(.animation(minimumInterval: nil, paused: !running)) { context in
      Canvas { canvas, box in
        let drawn = running ? source.frame(at: context.date.timeIntervalSinceReferenceDate, state: state, palette: palette, reduceMotion: reduce) : .rest
        LiveArt.draw(&canvas, drawn, in: CGRect(origin: .zero, size: box), palette: palette, dark: dark)
      }
    }
    .accessibilityHidden(true)
  }
}

/** A stage butterfly's engine and trails, stepped once a frame (the mark's `$_t` at `size` points). */
final class StageSource {
  private var engine = MarkEngine()
  private var trails = LightTrails()
  private let size: Double
  private var last: (time: Double, drawn: LiveFrame)?

  init(size: Double) { self.size = size }

  func frame(at now: Double, state: MarkState, palette: AgentPalette, reduceMotion: Bool) -> LiveFrame {
    if let last, abs(last.time - now) < 0.001 { return last.drawn }
    if let last, now - last.time > 0.5 {
      // It was unseen: it starts again from rest.
      engine = MarkEngine()
      trails = LightTrails()
    }
    engine.reduceMotion = reduceMotion
    trails.reduceMotion = reduceMotion
    let frame = engine.frame(at: now, state: state, sizePoints: size)
    trails.update(nowMs: now * 1000, spinAngle: frame.spinAngle, sizeScale: LightTrails.sizeScale(points: size), sustain: frame.whirling, palette: palette, radius: frame.beltRadius)
    let drawn = LiveFrame(frame: frame, ribbons: trails.drawn, sparks: trails.sparks)
    last = (now, drawn)
    return drawn
  }

  /** A click (`spin()`): one turn round its own axis. */
  func spin() { engine.turnNow(direction: Bool.random() ? 1 : -1) }
}

// MARK: - Curves and colours

/** A CSS `cubic-bezier()` timing curve, read at a moment from 0 to 1. */
struct CubicCurve {
  let x1: Double, y1: Double, x2: Double, y2: Double

  init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
    self.x1 = x1; self.y1 = y1; self.x2 = x2; self.y2 = y2
  }

  private func bezier(_ t: Double, _ a: Double, _ b: Double) -> Double {
    let u = 1 - t
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
  }

  func callAsFunction(_ progress: Double) -> Double {
    let x = min(max(progress, 0), 1)
    guard x > 0, x < 1 else { return x }
    // The moment whose x is `x`, by halving (the curve's x always rises).
    var low = 0.0, high = 1.0, t = x
    for _ in 0..<40 {
      let value = bezier(t, x1, x2)
      if abs(value - x) < 1e-7 { break }
      if value < x { low = t } else { high = t }
      t = (low + high) / 2
    }
    return bezier(t, y1, y2)
  }
}

extension Look {
  /** Next: near black, near white on dark; under the pointer `#2f2f2f` (`#d5d5d5`). Its words the ground's colour (the text's on dark). */
  var flowNext: Color { dark ? Color(hex: 0xfafafa) : Color(hex: 0x070707) }
  var flowNextHover: Color { dark ? Color(hex: 0xd5d5d5) : Color(hex: 0x2f2f2f) }
  var flowNextLabel: Color { dark ? Color(hex: 0x141414) : Color(hex: 0xfcfcfc) }
  /** Back: the window's grey, darker under the pointer. */
  var flowBack: Color { Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(dark ? 0.173 : 0.09) }
  var flowBackHover: Color { Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(dark ? 0.32 : 0.17) }
  /** The system's secondary grey (`rgba(60,60,67,.6)`, `rgba(235,235,245,.6)` on dark): the jobs, the line under the title, the name's note. */
  var systemSecondary: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.6) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.6) }
  /** The Chief of Staff's curves, in the app's blue. */
  var cooLine: Color { dark ? Color(red: 100 / 255, green: 170 / 255, blue: 1).opacity(0.65) : Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(0.55) }
  /** The name field: white (`#1c1c1e` on dark), a faint edge, blue with a ring when it has the keys. */
  var nameField: Color { dark ? Color(hex: 0x1c1c1e) : .white }
  var nameEdge: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.16) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.16) }
  var nameFocusEdge: Color { Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(dark ? 0.7 : 0.55) }
  var nameFocusRing: Color { Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(dark ? 0.28 : 0.14) }
  var nameShadow: Color { Color.black.opacity(dark ? 0.3 : 0.04) }
  var namePlaceholder: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.3) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.3) }
}
