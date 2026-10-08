import SwiftUI
import SimeonCore

/**
 * The call in a chat (`.simeon-call-pill`): a 76 pt pill on the call card's
 * white, the butterfly (44), the waveform or the status ("Calling…", what the
 * agent is doing), then Mute and Transcript (44) and the red End (50). A tap
 * or a pull down opens the full screen; the transcript shows under the pill
 * when it is on.
 */
struct CallPill: View {
  let call: CallState
  @Binding var showsTranscript: Bool
  let expand: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        ButterflyView(palette: .named(call.agentColour), motion: call.phase == .ended ? nil : .idle).frame(width: 44, height: 44)
        Group {
          if call.phase == .live, let activity = call.activity {
            Text(activity).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
          } else if call.phase == .live && !call.levels.isEmpty {
            LiveWaveform().frame(height: 30)
          } else {
            TimelineView(.periodic(from: .now, by: 1)) { context in
              Text(call.phase == .live ? Chat.callClock(call.seconds(now: context.date)) : call.status)
                .font(.system(size: 15)).foregroundStyle(Ink.secondary).monospacedDigit().lineLimit(1)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture(perform: expand)
        CallButtons(call: call, showsTranscript: $showsTranscript, size: 44, endSize: 50)
      }
      .padding(.leading, 14).padding(.trailing, 11)
      .frame(height: 76)
      if showsTranscript && !call.lines.isEmpty {
        CallTranscript(lines: Array(call.lines.suffix(3)), size: 15)
          .padding(.horizontal, 18).padding(.bottom, 16)
      }
    }
    .overlay(alignment: .bottom) {
      Capsule().fill(Ink.tertiary.opacity(0.6)).frame(width: 36, height: 4).padding(.bottom, 6)
        .onTapGesture(perform: expand)
    }
    .background(Ink.callCard, in: RoundedRectangle(cornerRadius: 38, style: .continuous))
    .shadow(color: .black.opacity(0.28), radius: 20, y: 18)
    .shadow(color: .black.opacity(0.12), radius: 5, y: 4)
    .gesture(DragGesture(minimumDistance: 12).onEnded { drag in if drag.translation.height > 24 { expand() } })
  }
}

/** Mute, Transcript and End, the Mac banner's glyphs; a muted mic is orange, End is red. */
struct CallButtons: View {
  let call: CallState
  @Binding var showsTranscript: Bool
  var size: Double = 44
  var endSize: Double = 50
  var spreadsEnd = false
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: spreadsEnd ? 12 : 8) {
      Button { store.mute(!call.isMuted) } label: {
        Image(systemName: call.isMuted ? "mic.slash" : "mic")
          .font(.system(size: size * 0.42, weight: .medium))
          .foregroundStyle(call.isMuted ? Ink.callMuted : Ink.primary)
          .frame(width: size, height: size)
          .contentShape(.circle)
      }
      .glassEffect(.regular.interactive(), in: .circle)
      .accessibilityLabel(call.isMuted ? "Unmute" : "Mute")
      Button { withAnimation(.snappy) { showsTranscript.toggle() } } label: {
        Image(systemName: "text.alignleft")
          .font(.system(size: size * 0.4, weight: .medium))
          .foregroundStyle(Ink.primary)
          .frame(width: size, height: size)
          .contentShape(.circle)
      }
      .glassEffect(showsTranscript ? .regular.tint(Ink.primary.opacity(0.12)).interactive() : .regular.interactive(), in: .circle)
      .accessibilityLabel("Transcript")
      .accessibilityAddTraits(showsTranscript ? .isSelected : [])
      if spreadsEnd { Spacer(minLength: 0) }
      Button { store.hangUp() } label: {
        Image(systemName: "phone.down.fill")
          .font(.system(size: endSize * 0.44, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: endSize, height: endSize)
          .background(Ink.callEnd.opacity(call.phase == .ended ? 0.5 : 1), in: Circle())
      }
      .accessibilityLabel("End call")
      .disabled(call.phase == .ended)
    }
    .buttonStyle(.plain)
  }
}

/** The call's waveform, the only part that reads the bars as they tick. */
struct LiveWaveform: View {
  @Environment(AppStore.self) private var store
  var body: some View { Waveform(levels: store.callLevels) }
}

/** The voice, bar by bar: louder while the agent speaks. */
struct Waveform: View {
  let levels: [Double]

  var body: some View {
    GeometryReader { geometry in
      HStack(alignment: .center, spacing: 2) {
        ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
          RoundedRectangle(cornerRadius: 1).fill(Ink.primary.opacity(0.55))
            .frame(maxWidth: .infinity)
            .frame(height: max(3, geometry.size.height * level))
        }
      }
      .frame(maxHeight: .infinity)
      .padding(.horizontal, 4)
    }
    .animation(.linear(duration: 0.08), value: levels)
  }
}

/** What was said, plain: the agent on the left, you on the right in grey (`.simeon-call-say`). */
struct CallTranscript: View {
  let lines: [CallLine]
  var size: Double = 17

  var body: some View {
    VStack(spacing: size >= 17 ? 22 : 10) {
      ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
        Text(line.text)
          .font(.system(size: size))
          .lineSpacing(size >= 17 ? 4 : 2)
          .foregroundStyle(line.fromPerson ? Ink.secondary : Ink.primary)
          .multilineTextAlignment(line.fromPerson ? .trailing : .leading)
          .frame(maxWidth: 330, alignment: line.fromPerson ? .trailing : .leading)
          .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
      }
    }
  }
}

/** The full call (`.simeon-call-full`): fold it down at the top left, the butterfly at 124, the name and the time, what was said, the buttons. */
struct CallScreen: View {
  @Binding var showsTranscript: Bool
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    Group {
      if let call = store.call {
        VStack(spacing: 0) {
          HStack {
            Button { dismiss() } label: {
              Image(systemName: "chevron.down").font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.primary)
                .frame(width: 48, height: 48)
            }
            .glassEffect(.regular.interactive(), in: .circle)
            .accessibilityLabel("Back to the chat")
            Spacer()
          }
          .padding(.horizontal, 12).padding(.top, 12)
          VStack(spacing: 4) {
            ButterflyView(palette: .named(call.agentColour), motion: call.phase == .ended ? nil : .idle).frame(width: 124, height: 124)
            Text(call.agentName).font(.system(size: 22, weight: .semibold)).foregroundStyle(Ink.primary).padding(.top, 10)
            TimelineView(.periodic(from: .now, by: 1)) { context in
              Text(call.phase == .live || call.phase == .ended && call.connectedAt != nil ? Chat.callClock(call.seconds(now: context.date)) : call.status)
                .font(.system(size: 16)).foregroundStyle(Ink.secondary).monospacedDigit()
            }
            if let activity = call.activity, call.phase == .live {
              Text(activity).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1).padding(.top, 2)
            }
          }
          .padding(.top, 4).padding(.horizontal, 24)
          ScrollView {
            CallTranscript(lines: call.lines)
              .padding(.horizontal, 28).padding(.vertical, 16)
              .opacity(showsTranscript ? 1 : 0)
          }
          .defaultScrollAnchor(.bottom)
          CallButtons(call: call, showsTranscript: $showsTranscript, size: 56, endSize: 64, spreadsEnd: true)
            .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 28)
        }
      } else {
        Color.clear.onAppear { dismiss() }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
  }
}
