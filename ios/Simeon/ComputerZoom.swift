#if os(iOS)
import SwiftUI
import UIKit
import WebKit

/**
 * The whole computer on the phone (15 October 2026), as the person uses it:
 * its 1280 by 800 screen fitted to the phone, pinched up to four times
 * larger and moved around, and, while the person is in control, the
 * phone's own gestures as the computer's mouse. The founder, after an
 * Apple sign-in on it: "that computer was so hard to use i was lost."
 *
 * - Watching: one finger moves the zoomed picture, a double tap zooms in
 *   on a spot (and back out), two fingers pinch.
 * - In control: a tap is a click where the finger was; a drag scrolls the
 *   page under it (the mouse wheel); a press held a moment then dragged
 *   holds the button down (text selection, a slider); two fingers pinch
 *   and move the picture. The sheet cannot be swiped away meanwhile: the
 *   checkmark hands the computer back. After each click the sheet asks
 *   what it focused (`onClick`), and with the keyboard up the spot tapped
 *   is kept in sight above it.
 *
 * noVNC draws the screen (`LiveScreen.page`) and never sees a touch: the
 * web view takes none, and the gestures reach noVNC as the mouse events
 * it reads from a desktop browser (`simeonClick`, `simeonPointer`,
 * `simeonWheel`), in the page's points, which it maps to the computer's.
 */
struct ZoomScreen: UIViewRepresentable {
  let socket: URL
  let control: Bool
  @Binding var phase: String
  let link: ScreenLink
  /** A click was sent (in control): the sheet asks the computer what it focused. */
  var onClick: () -> Void = {}

  static let maximumZoom: CGFloat = 4
  /** A double tap while watching zooms this far in. */
  static let doubleTapZoom: CGFloat = 2.5
  /** The computer's pixels a drag moves the page by per turn of the wheel (Chrome on Linux scrolls about this much). */
  static let wheelStep: CGFloat = 50

  func makeCoordinator() -> Coordinator {
    Coordinator(web: LiveScreen.Coordinator(phase: $phase, link: link, events: nil), link: link)
  }

  func makeUIView(context: Context) -> ScreenScroller {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator.web, name: "simeon")
    let web = WKWebView(frame: .zero, configuration: configuration)
    web.isOpaque = false
    web.backgroundColor = .black
    web.scrollView.isScrollEnabled = false
    web.scrollView.bounces = false
    // Every touch is the phone's (the gestures below); noVNC's own touch handling never runs.
    web.isUserInteractionEnabled = false
    web.navigationDelegate = context.coordinator.web
    context.coordinator.web.load(web, page: LiveScreen.page(socket: socket, viewOnly: !control))
    context.coordinator.web.viewOnly = !control
    link.view = web
    let scroller = ScreenScroller(web: web)
    scroller.delegate = context.coordinator
    context.coordinator.install(on: scroller)
    context.coordinator.setControl(control)
    context.coordinator.onClick = onClick
    return scroller
  }

  func updateUIView(_ scroller: ScreenScroller, context: Context) {
    context.coordinator.onClick = onClick
    context.coordinator.setControl(control)
    guard context.coordinator.web.viewOnly == control else { return }
    context.coordinator.web.viewOnly = !control
    scroller.web.evaluateJavaScript("window.simeonViewOnly(\(control ? "false" : "true"))")
  }

  static func dismantleUIView(_ scroller: ScreenScroller, coordinator: Coordinator) {
    scroller.web.evaluateJavaScript("window.simeonClose && window.simeonClose()")
    scroller.web.configuration.userContentController.removeScriptMessageHandler(forName: "simeon")
  }

  final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
    /** The page's own: its messages (the picture's phase, the clipboard) and its loading. */
    let web: LiveScreen.Coordinator
    let link: ScreenLink
    var onClick: () -> Void = {}
    private weak var scroller: ScreenScroller?
    private var control = false
    private let tap = UITapGestureRecognizer()
    private let zoomTap = UITapGestureRecognizer()
    private let drag = UIPanGestureRecognizer()
    private let hold = UILongPressGestureRecognizer()
    /** The drag not yet turned into turns of the wheel, in the computer's pixels. */
    private var wheelLeft: CGFloat = 0

    init(web: LiveScreen.Coordinator, link: ScreenLink) {
      self.web = web
      self.link = link
    }

    func install(on scroller: ScreenScroller) {
      self.scroller = scroller
      tap.addTarget(self, action: #selector(tapped(_:)))
      zoomTap.numberOfTapsRequired = 2
      zoomTap.addTarget(self, action: #selector(zoomTapped(_:)))
      drag.minimumNumberOfTouches = 1
      drag.maximumNumberOfTouches = 1
      drag.addTarget(self, action: #selector(dragged(_:)))
      hold.minimumPressDuration = 0.35
      hold.addTarget(self, action: #selector(held(_:)))
      for recognizer in [tap, zoomTap, drag, hold] as [UIGestureRecognizer] {
        recognizer.delegate = self
        scroller.screen.addGestureRecognizer(recognizer)
      }
    }

    /** In control one finger is the computer's (a click, the wheel, a held button); two fingers move and zoom the picture. */
    func setControl(_ on: Bool) {
      if !on && control { wheelLeft = 0 }
      control = on
      tap.isEnabled = on
      drag.isEnabled = on
      hold.isEnabled = on
      zoomTap.isEnabled = !on
      scroller?.panGestureRecognizer.minimumNumberOfTouches = on ? 2 : 1
    }

    // MARK: Zoom

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { (scrollView as? ScreenScroller)?.screen }

    func scrollViewDidZoom(_ scrollView: UIScrollView) { (scrollView as? ScreenScroller)?.center() }

    /** Zoomed back out: the picture returns to the middle. */
    func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) {
      guard scale <= 1.01, let scroller = scrollView as? ScreenScroller else { return }
      scroller.recenter(animated: true)
    }

    @objc private func zoomTapped(_ recognizer: UITapGestureRecognizer) {
      guard let scroller, recognizer.state == .ended else { return }
      if scroller.zoomScale > 1.01 {
        scroller.setZoomScale(1, animated: true)
        return
      }
      let at = recognizer.location(in: scroller.screen)
      let size = CGSize(width: scroller.bounds.width / ZoomScreen.doubleTapZoom, height: scroller.bounds.height / ZoomScreen.doubleTapZoom)
      scroller.zoom(to: CGRect(x: at.x - size.width / 2, y: at.y - size.height / 2, width: size.width, height: size.height), animated: true)
    }

    // MARK: The computer's mouse

    /** Where the finger is on the page, in its points (the web view is never zoomed itself: its picture is). */
    private func point(_ recognizer: UIGestureRecognizer) -> CGPoint? {
      guard let web = scroller?.web else { return nil }
      return recognizer.location(in: web)
    }

    @objc private func tapped(_ recognizer: UITapGestureRecognizer) {
      guard control, recognizer.state == .ended, let at = point(recognizer) else { return }
      Haptics.tap()
      link.click(at: at)
      if let scroller { scroller.lastTap = recognizer.location(in: scroller.screen) }
      onClick()
    }

    @objc private func dragged(_ recognizer: UIPanGestureRecognizer) {
      guard control, let scroller, let at = point(recognizer) else { return }
      switch recognizer.state {
      case .began:
        wheelLeft = 0
      case .changed:
        let step = recognizer.translation(in: scroller.screen)
        recognizer.setTranslation(.zero, in: scroller.screen)
        // The picture is the computer's 1280 pixels wide; a drag up scrolls the page down. Up and down
        // only: the screen server does not pass the sideways wheel on (x11vnc 0.9.16, measured).
        wheelLeft -= step.y * 1280 / max(scroller.screen.bounds.width, 1)
        let turns = (wheelLeft / ZoomScreen.wheelStep).rounded(.towardZero)
        guard turns != 0 else { return }
        wheelLeft -= turns * ZoomScreen.wheelStep
        link.wheel(at: at, dx: 0, dy: turns * ZoomScreen.wheelStep)
      default:
        wheelLeft = 0
      }
    }

    @objc private func held(_ recognizer: UILongPressGestureRecognizer) {
      guard control, let at = point(recognizer) else { return }
      switch recognizer.state {
      case .began:
        Haptics.press()
        link.pointer("down", at: at)
      case .changed:
        link.pointer("move", at: at)
      case .ended, .cancelled, .failed:
        link.pointer("up", at: at)
      default:
        break
      }
    }
  }
}

/**
 * The scroll view holding the screen's picture: the picture fitted inside
 * it at zoom 1 and kept in the middle of the part the keyboard leaves free
 * (the keyboard is up all along in control, 26 October 2026: the middle of
 * the whole view put the picture low, its foot behind the keyboard, an
 * empty band over it), and room to move it above the keyboard.
 */
final class ScreenScroller: UIScrollView {
  let web: WKWebView
  /** What zooms: the web view inside, at the size that fits. */
  let screen = UIView()
  private var fittedFor: CGSize = .zero
  private var keyboardOverlap: CGFloat = 0
  /** Where the last click landed, in the picture's points: kept in sight above the keyboard. */
  var lastTap: CGPoint?

  init(web: WKWebView) {
    self.web = web
    super.init(frame: .zero)
    backgroundColor = .black
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    minimumZoomScale = 1
    maximumZoomScale = ZoomScreen.maximumZoom
    bouncesZoom = true
    contentInsetAdjustmentBehavior = .never
    // Nothing inside is a control: touches are not held back while the scroll view decides.
    delaysContentTouches = false
    screen.backgroundColor = .black
    screen.addSubview(web)
    addSubview(screen)
    KeyboardSpot.watch()
    NotificationCenter.default.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(keyboardHidden(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The keyboard where it is now, not only when it moves (11 November 2026: the agent handed the computer over, the
    // keyboard came up while the computer was still starting, this view was made after it and put the picture behind it;
    // the sheet still rising when the keyboard said where it was is the same).
    let covered = overlap(with: KeyboardSpot.frame)
    let moved = covered != keyboardOverlap
    keyboardOverlap = covered
    // A new size (the phone turned) fits the picture again, from zoom 1; scrolling and zooming leave it alone.
    if bounds.size != fittedFor, bounds.width > 0, bounds.height > 0 {
      fittedFor = bounds.size
      setZoomScale(1, animated: false)
      let scale = min(bounds.width / 1280, bounds.height / 800)
      let size = CGSize(width: (1280 * scale).rounded(), height: (800 * scale).rounded())
      screen.frame = CGRect(origin: .zero, size: size)
      web.frame = screen.bounds
      contentSize = size
      center()
      // The margins alone leave the picture at the top: it starts in the middle.
      recenter(animated: false)
      return
    }
    center()
    if moved && zoomScale <= 1.01 { recenter(animated: false) }
  }

  /** Back to the middle (zoom 1): the margins above and beside the picture are scrolled to. */
  func recenter(animated: Bool) {
    setContentOffset(CGPoint(x: -contentInset.left, y: -contentInset.top), animated: animated)
  }

  /**
   * The spot last tapped (the field typed into) moved into the part of the
   * view the keyboard leaves free, when it is not there already.
   */
  func reveal(_ point: CGPoint) {
    let spot = screen.convert(point, to: self)
    let free = bounds.height - keyboardOverlap
    guard free > 60 else { return }
    if spot.y >= contentOffset.y + 12 && spot.y <= contentOffset.y + free - 32 { return }
    let lowest = -contentInset.top
    let highest = max(lowest, contentSize.height + contentInset.bottom - bounds.height)
    setContentOffset(CGPoint(x: contentOffset.x, y: min(max(spot.y - free * 0.4, lowest), highest)), animated: true)
  }

  /** The picture in the middle of the part above the keyboard while it is smaller than that; the keyboard's height more below it. */
  func center() {
    let free = max(0, bounds.height - keyboardOverlap)
    let dx = max(0, (bounds.width - screen.frame.width) / 2)
    let dy = max(0, (free - screen.frame.height) / 2)
    let inset = UIEdgeInsets(top: dy, left: dx, bottom: dy + keyboardOverlap, right: dx)
    if contentInset != inset { contentInset = inset }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Shown under a keyboard already up: the picture goes above it at once.
    guard window != nil else { return }
    let now = overlap(with: KeyboardSpot.frame)
    guard now != keyboardOverlap else { return }
    keyboardOverlap = now
    center()
    if zoomScale <= 1.01 { recenter(animated: false) }
  }

  /** How much of this view the keyboard covers (none while it is down). */
  private func overlap(with keyboard: CGRect?) -> CGFloat {
    guard let window, let keyboard, !keyboard.isEmpty else { return 0 }
    let mine = convert(bounds, to: window)
    return max(0, mine.maxY - keyboard.minY)
  }

  @objc private func keyboardChanged(_ notification: Notification) {
    guard window != nil, let end = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
    keyboardOverlap = overlap(with: end)
    center()
    // Not zoomed: the whole picture moves into the free part. Zoomed: the spot last tapped is kept in sight.
    if zoomScale <= 1.01 { recenter(animated: true) } else if keyboardOverlap > 0, let lastTap { reveal(lastTap) }
  }

  @objc private func keyboardHidden(_ notification: Notification) {
    keyboardOverlap = 0
    center()
    // Not zoomed: the picture goes back to the middle.
    if zoomScale <= 1.01 { recenter(animated: true) }
  }
}

/**
 * Where the phone's keyboard is, kept from its own notices, so a screen
 * made while it is already up knows (`ScreenScroller`); nil while it is
 * down. Watched from the first screen on.
 */
@MainActor
enum KeyboardSpot {
  private(set) static var frame: CGRect?
  private static var watching = false

  static func watch() {
    guard !watching else { return }
    watching = true
    // At once, on the main thread the keyboard says it from: kept before any screen reads it for the same notice.
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: nil) { notice in
      let end = notice.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
      MainActor.assumeIsolated { KeyboardSpot.frame = end }
    }
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: nil) { _ in
      MainActor.assumeIsolated { KeyboardSpot.frame = nil }
    }
  }
}
#endif
