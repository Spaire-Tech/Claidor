import SwiftUI
import SimeonCore

/**
 * The in-chat form (28 October 2026, SimeonCore's `UserFormCard`), as the
 * Mac's secret card draws its request: the title and the site, the X while
 * it waits, each field with its name above it, and Fill in. The values go
 * to the computer, which types them into the page; the card forgets them as
 * soon as Fill in is pressed. Once answered, each field says whether it went in.
 */
struct UserFormCardView: View {
  let entryId: String
  let agentId: String
  let card: UserFormCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var values: [String: String] = [:]
  @State private var busy = false
  @State private var refusal: String?

  var body: some View {
    CardShell(look: look) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text(card.title)
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(card.state == .dismissed ? look.inkSecondary : look.ink)
            .cssLineHeight(22, size: 14, weight: .medium)
          Text(card.domain)
            .font(.system(size: 13))
            .tracking(-0.08)
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if card.state == .open {
          Button {
            run { await store.dismissUserForm(entryId, in: agentId) }
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(look.inkSecondary)
              .frame(width: 20, height: 20)
              .contentShape(RoundedRectangle(cornerRadius: 6))
          }
          .buttonStyle(.hand)
          .help("Dismiss without filling it in")
          .accessibilityLabel("Dismiss form")
        } else if let status = card.statusLine {
          StatusPill(text: status, look: look, dot: dot)
        }
      }
      if card.state == .open { form } else { answered }
    }
  }

  private var dot: Color? {
    switch card.state {
    case .filled: card.fields.contains { card.outcomes[$0.id] == .fillFailed } ? look.danger : look.working
    case .failed: look.danger
    case .filling: look.blue
    case .open, .dismissed: nil
    }
  }

  private var form: some View {
    VStack(alignment: .leading, spacing: 10) {
      if !card.instruction.isEmpty {
        Text(card.instruction)
          .font(.system(size: 14))
          .tracking(-0.15)
          .foregroundStyle(look.inkSecondary)
          .cssLineHeight(22, size: 14)
          .fixedSize(horizontal: false, vertical: true)
      }
      ForEach(card.fields) { field in
        VStack(alignment: .leading, spacing: 4) {
          if field.kind != .checkbox {
            Text(field.label).font(.system(size: 13)).tracking(-0.08).foregroundStyle(look.inkSecondary)
          }
          input(field)
        }
      }
      HStack(spacing: 8) {
        CardButton(title: String(localized: "Fill in"), prominent: true, look: look, action: fill)
          .disabled(busy || !card.canFill(values))
        if card.submitsAfterFill {
          Text("It’s sent as soon as it’s typed in.").font(.system(size: 13)).tracking(-0.08).foregroundStyle(look.inkTertiary)
        }
      }
      if let refusal {
        Text(refusal).font(.system(size: 13)).foregroundStyle(look.danger)
      }
      HStack(alignment: .top, spacing: 4) {
        Image(systemName: "lock.fill")
          .font(.system(size: 9))
          .frame(width: 12, height: 12)
          .padding(.top, 3)
        Text("Typed into the page on Simeon's computer, never shown to your agent.")
          .font(.system(size: 13))
          .tracking(-0.08)
      }
      .foregroundStyle(look.inkTertiary)
    }
  }

  @ViewBuilder
  private func input(_ field: UserFormCard.Field) -> some View {
    let text = Binding(get: { values[field.id] ?? "" }, set: { values[field.id] = $0 })
    let prompt = Text(field.placeholder ?? "").foregroundStyle(look.placeholder)
    switch field.kind {
    case .checkbox:
      Toggle(field.label, isOn: Binding(get: { values[field.id] == "true" }, set: { values[field.id] = $0 ? "true" : "false" }))
        .toggleStyle(.checkbox)
        .font(.system(size: 14))
        .foregroundStyle(look.ink)
    case .select:
      Picker("", selection: text) {
        Text(field.placeholder ?? String(localized: "Choose")).tag("")
        ForEach(field.options, id: \.self) { option in Text(option.label).tag(option.value) }
      }
      .labelsHidden()
      .pickerStyle(.menu)
      .frame(maxWidth: 320, alignment: .leading)
    case .textarea:
      boxed(TextField("", text: text, prompt: prompt, axis: .vertical).lineLimit(3...6), vertical: true)
    default:
      if field.secret {
        boxed(SecureField("", text: text, prompt: prompt).onSubmit(fill))
      } else {
        boxed(TextField("", text: text, prompt: prompt).autocorrectionDisabled(field.kind != .text).onSubmit(fill))
      }
    }
  }

  private func boxed(_ field: some View, vertical: Bool = false) -> some View {
    field
      .textFieldStyle(.plain)
      .font(.system(size: 14))
      .padding(.vertical, 6)
      .padding(.horizontal, 10)
      .frame(minHeight: 32)
      .background(look.ground, in: RoundedRectangle(cornerRadius: 8))
      .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
  }

  /** Once answered: each field and whether it went in. */
  private var answered: some View {
    VStack(alignment: .leading, spacing: 4) {
      if card.state == .filled || card.state == .filling {
        ForEach(card.fields) { field in
          HStack(spacing: 8) {
            Text(field.label).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.ink).lineLimit(1)
            Spacer(minLength: 8)
            if let line = card.outcomeLine(field) {
              Text(line).font(.system(size: 13)).foregroundStyle(card.outcomes[field.id] == .fillFailed ? look.danger : look.inkSecondary)
            }
          }
        }
      }
      if card.state == .failed, let note = card.note {
        Text(note).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary).fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  private func fill() {
    guard !busy, card.canFill(values) else { return }
    let sent = card.values(values)
    // What was typed leaves the card now; only the computer holds it, and only to type it in.
    values = [:]
    run { refusal = await store.submitUserForm(sent, entryId: entryId, in: agentId) }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }
}
