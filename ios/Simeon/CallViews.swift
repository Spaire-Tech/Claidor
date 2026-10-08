import SwiftUI
import SimeonCore

/**
 * The call in a chat (round 3, the founder's call screenshots; the call fix:
 * "for the call use our mac buttons"): the butterfly, the waveform (or
 * "Calling…"), then the Mac banner's Mute, Transcript and End. A tap opens
 * the full screen; the transcript shows under the pill when it is on.
 */
struct CallPill: View {
  let call: CallState
  @Binding var showsTranscript: Bool
  let expand: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        ButterflyView(palette: .named(call.agentColour), margin: 2).frame(width: 34, height: 34)
        Group {
          if call.phase == .live && !call.levels.isEmpty {
            Waveform(levels: call.levels).frame(height: 22)
          } else {
            TimelineView(.periodic(from: .now, by: 1)) { context in
              Text(call.phase == .live ? Chat.callClock(call.seconds(now: context.date)) : call.status)
                .font(.system(size: 15)).foregroundStyle(Ink.secondary).monospacedDigit()
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture(perform: expand)
        CallButtons(call: call, showsTranscript: $showsTranscript, size: 36)
      }
      .padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 8)
      if showsTranscript && !call.lines.isEmpty {
        CallTranscript(lines: Array(call.lines.suffix(3)))
          .padding(.horizontal, 14).padding(.bottom, 10)
      }
      Capsule().fill(Ink.tertiary).frame(width: 36, height: 4).padding(.bottom, 6)
        .onTapGesture(perform: expand)
    }
    .background(Ink.callCard, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
    .gesture(DragGesture(minimumDistance: 12).onEnded { drag in if drag.translation.height > 24 { expand() } })
  }
}

/** Mute, Transcript and End, the Mac banner's glyphs; a muted mic is orange, End is red. */
struct CallButtons: View {
  let call: CallState
  @Binding var showsTranscript: Bool
  var size: Double = 36
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: size * 0.3) {
      Button { store.mute(!call.isMuted) } label: {
        Image(systemName: call.isMuted ? "mic.slash.fill" : "mic.fill")
          .font(.system(size: size * 0.42, weight: .semibold))
          .foregroundStyle(call.isMuted ? Ink.callMuted : Ink.primary)
          .frame(width: size, height: size)
      }
      .glassEffect(.regular.interactive(), in: .circle)
      .accessibilityLabel(call.isMuted ? "Unmute" : "Mute")
      Button { withAnimation(.snappy) { showsTranscript.toggle() } } label: {
        Image(systemName: "text.alignleft")
          .font(.system(size: size * 0.4, weight: .semibold))
          .foregroundStyle(showsTranscript ? Ink.title : Ink.primary)
          .frame(width: size, height: size)
      }
      .glassEffect(showsTranscript ? .regular.tint(Ink.title.opacity(0.18)).interactive() : .regular.interactive(), in: .circle)
      .accessibilityLabel("Transcript")
      Button { store.hangUp() } label: {
        Image(systemName: "phone.down.fill")
          .font(.system(size: size * 0.42, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: size, height: size)
          .background(Ink.callEnd.opacity(call.phase == .ended ? 0.5 : 1), in: Circle())
      }
      .accessibilityLabel("End call")
      .disabled(call.phase == .ended)
    }
    .buttonStyle(.plain)
  }
}

/** The voice, bar by bar: louder while the agent speaks. */
struct Waveform: View {
  let levels: [Double]

  var body: some View {
    HStack(alignment: .center, spacing: 2.5) {
      ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
        Capsule().fill(Ink.primary.opacity(0.75)).frame(width: 2.5, height: max(3, 22 * level))
      }
    }
    .animation(.linear(duration: 0.09), value: levels)
  }
}

/** What was said, plain: the agent on the left, you on the right in grey (the founder's transcript design). */
struct CallTranscript: View {
  let lines: [CallLine]

  var body: some View {
    VStack(spacing: 10) {
      ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
        Text(line.text)
          .font(.system(size: 16))
          .foregroundStyle(line.fromPerson ? Ink.secondary : Ink.primary)
          .multilineTextAlignment(line.fromPerson ? .trailing : .leading)
          .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
      }
    }
  }
}

/** The full call: fold it down at the top left, the butterfly large, the name and the time, the transcript, the three buttons. */
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
              Image(systemName: "chevron.down").font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
                .frame(width: 44, height: 44)
            }
            .glassEffect(.regular.interactive(), in: .circle)
            .accessibilityLabel("Back to the chat")
            Spacer()
          }
          .padding(.horizontal, 16)
          VStack(spacing: 6) {
            ButterflyView(palette: .named(call.agentColour), margin: 4).frame(width: 120, height: 120)
            Text(call.agentName).font(.system(size: 26, weight: .semibold)).foregroundStyle(Ink.primary)
            TimelineView(.periodic(from: .now, by: 1)) { context in
              Text(call.phase == .live || call.phase == .ended ? Chat.callClock(call.seconds(now: context.date)) : call.status)
                .font(.system(size: 17)).foregroundStyle(Ink.secondary).monospacedDigit()
            }
          }
          .padding(.top, 12)
          ScrollView {
            if showsTranscript {
              CallTranscript(lines: call.lines).padding(.horizontal, 24).padding(.vertical, 16)
            }
          }
          .defaultScrollAnchor(.bottom)
          HStack(spacing: 0) {
            CallButtons(call: call, showsTranscript: $showsTranscript, size: 64)
          }
          .padding(.bottom, 24)
        }
      } else {
        Color.clear.onAppear { dismiss() }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
  }
}
