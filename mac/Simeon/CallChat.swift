import AppKit
import SwiftUI
import SimeonCore

/** A call's lines opened over the chat: its line's id, what both said, and when (its line's time). */
struct CallOpen: Equatable {
  let id: String
  let lines: [CallLine]
  let at: Date?
}

/**
 * A call in the chat (`__simeonVoiceEvent`, step 11): the host writes it
 * when the call opens ("Voice chat · now") and fills it at the end ("Voice
 * chat · 02:48", "1:02:05" past the hour). A chip in the middle of the
 * chat, 24 high, round: the voice's five strokes (14) and the words (12 on
 * 16, at 60%). An ended call with words opens them over the chat, the
 * pointer giving it the grey and the full ink (0.12 s); the rest are words
 * only.
 */
struct CallLineRow: View {
  let id: String
  let seconds: Int
  let lines: [CallLine]
  let live: Bool
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @State private var hovering = false

  var body: some View {
    let label = Chat.voiceChatLabel(seconds: seconds, live: live)
    Group {
      if !live && !lines.isEmpty {
        Button {
          let entry = store.transcripts[agentId]?.first { $0.id == id }
          control.openCall(CallOpen(id: id, lines: lines, at: entry?.timestampMs.map { Date(timeIntervalSince1970: $0 / 1000) }))
        } label: {
          chip(label, lit: hovering)
        }
        .buttonStyle(.hand)
        .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
        .accessibilityLabel("Open \(label)")
      } else {
        chip(label, lit: false)
      }
    }
    .help(label)
    .frame(maxWidth: .infinity)
    .padding(.top, 8)
  }

  private func chip(_ label: String, lit: Bool) -> some View {
    HStack(spacing: 4) {
      VoiceGlyph()
        .stroke(style: StrokeStyle(lineWidth: 2 * 14 / 24, lineCap: .round))
        .frame(width: 14, height: 14)
      Text(label)
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .lineLimit(1)
    }
    .foregroundStyle(lit ? look.ink : look.inkSecondary)
    .padding(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 6))
    .frame(height: 24)
    .background(Capsule().fill(lit ? look.rowHover : .clear))
    .contentShape(Capsule())
  }
}

/** The call's glyph: five strokes of a voice, the middle ones tallest (`M5 10v4M9 7v10M13 9v6M17 6v12M21 10v4`). */
private struct VoiceGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let scale = rect.width / 24
    for (x, top, length) in [(5.0, 10.0, 4.0), (9, 7, 10), (13, 9, 6), (17, 6, 12), (21, 10, 4)] {
      path.move(to: CGPoint(x: rect.minX + x * scale, y: rect.minY + top * scale))
      path.addLine(to: CGPoint(x: rect.minX + x * scale, y: rect.minY + (top + length) * scale))
    }
    return path
  }
}

/**
 * A call's lines over the chat (the window's exchange panel opened on a
 * call, read only): the agent's own head, the call's time, the person's
 * words on the right in their blue and the agent's on the left in the
 * grey, its name over the first of a run and its butterfly (22) by the
 * last; at the foot, "This chat is view-only" and Close Chat. Escape
 * closes it.
 */
struct CallChatView: View {
  let agent: Agent
  let call: CallOpen
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @Environment(Viewers.self) private var viewers

  var body: some View {
    ZStack(alignment: .top) {
      look.ground
        .contentShape(Rectangle())
      GeometryReader { box in
        let width = max(0, box.size.width - 32)
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            if let at = call.at {
              Stamp(date: at, look: look)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 2)
            }
            ForEach(Array(call.lines.enumerated()), id: \.offset) { index, line in
              let first = index == 0 || call.lines[index - 1].fromPerson != line.fromPerson
              let last = index == call.lines.count - 1 || call.lines[index + 1].fromPerson != line.fromPerson
              if line.fromPerson {
                PersonLine(id: "\(call.id)-\(index)", text: line.text, width: width, look: look)
              } else {
                AgentLine(id: "\(call.id)-\(index)", text: line.text, agent: agent, first: first, last: last, width: width, look: look)
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 24)
          .padding(.bottom, 52)
        }
        .defaultScrollAnchor(.bottom, for: .initialOffset)
      }
      .padding(.top, 116)
      .padding(.bottom, 64)
      ChatHeader(agent: agent, look: look)
    }
    .overlay(alignment: .bottom) {
      ReadOnlyNotice(look: look) { control.closeCall() }
        .padding(.bottom, 12)
    }
    .background(ViewerKeys { event in
      // Escape closes it, not a picture or diagram opened over it.
      guard event.keyCode == 53, viewers.shown == nil else { return false }
      control.closeCall()
      return true
    })
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Voice chat with \(agent.name)")
    .accessibilityAddTraits(.isModal)
  }
}

/** The person's words: their own blue bubble on the right (14 on 21, padded 10 15, round 18), as in the chat. */
private struct PersonLine: View {
  let id: String
  let text: String
  let width: CGFloat
  let look: Look
  @Environment(ChatControl.self) private var control

  var body: some View {
    let limit = max(0, min(width * 0.88, 640, width - 82))
    Text(text)
      .font(.system(size: 14))
      .cssLineHeight(21, size: 14)
      .foregroundStyle(Color.white)
      .textSelection(.enabled)
      .padding(.vertical, 10)
      .padding(.horizontal, 15)
      .background(look.yours, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      // Right-click: Copy, as on the agent's lines.
      .onHover { inside in
        if inside {
          control.exchangeHovered = (id, text)
        } else if control.exchangeHovered?.id == id {
          control.exchangeHovered = nil
        }
      }
      .frame(maxWidth: limit, alignment: .trailing)
      .frame(maxWidth: .infinity, alignment: .trailing)
      .padding(.vertical, 2)
      .accessibilityLabel("Your message: \(text)")
  }
}

/** The agent's words: its grey bubble (14, padded 8 12; round 18, 6 at the lower left), its name over the first of a run, its butterfly (22) by the last. */
private struct AgentLine: View {
  let id: String
  let text: String
  let agent: Agent
  let first: Bool
  let last: Bool
  let width: CGFloat
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control

  var body: some View {
    let column = width - 30
    let limit = max(0, min(column * 0.88, 640, column - 82))
    let shape = UnevenRoundedRectangle(topLeadingRadius: first ? 18 : 6, bottomLeadingRadius: 6, bottomTrailingRadius: 18, topTrailingRadius: 18)
    HStack(alignment: .bottom, spacing: 8) {
      Group {
        if last {
          AgentMark(agent: agent, agents: store.agents, size: 22)
        } else {
          Color.clear
        }
      }
      .frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 0) {
        if first {
          Text(agent.name)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
            .frame(height: 16)
            .padding(EdgeInsets(top: 12, leading: 12, bottom: 4, trailing: 0))
        }
        Text(text)
          .font(.system(size: 14))
          .tracking(-0.042)
          .foregroundStyle(look.theirsText)
          .textSelection(.enabled)
          .padding(.vertical, 8)
          .padding(.horizontal, 12)
          .background(look.theirs, in: shape)
          .overlay { shape.inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
          .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
          .frame(maxWidth: limit, alignment: .leading)
          // Right-click: Copy, as on an exchange's messages.
          .onHover { inside in
            if inside {
              control.exchangeHovered = (id, text)
            } else if control.exchangeHovered?.id == id {
              control.exchangeHovered = nil
            }
          }
          .accessibilityLabel("\(agent.name): \(text)")
      }
    }
    .padding(.vertical, 2)
  }
}
