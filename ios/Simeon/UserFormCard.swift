import SwiftUI
import SimeonCore

/**
 * The in-chat form (28 October 2026, SimeonCore's `UserFormCard`): the fields
 * a page on the agent's computer needs typed, drawn as the secret card is,
 * each with its name above it, and Fill. The values go to the computer and
 * are typed into the page there; the card forgets them as soon as Fill is
 * pressed. Once answered, each field says whether it went in. The X is a
 * decline.
 */
struct UserFormCardView: View {
  let entryId: String
  let agentId: String
  let card: UserFormCard
  @Environment(AppStore.self) private var store
  @State private var values: [String: String] = [:]
  /** An answer on its way: the buttons wait, so one tap is one answer. */
  @State private var busy = false
  @State private var refusal: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      header
      if card.state == .open { form } else { answered }
    }
    .card()
  }

  private var header: some View {
    HStack(spacing: 8) {
      Image(systemName: "rectangle.and.pencil.and.ellipsis").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      VStack(alignment: .leading, spacing: 1) {
        Text(card.title).font(.system(size: 17, weight: .medium)).foregroundStyle(card.state == .dismissed ? Ink.secondary : Ink.primary)
        Text(card.domain).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      Spacer(minLength: 0)
      if card.state == .open {
        // Not filling it is an answer too: the agent is told it was declined.
        Button { run { await store.dismissUserForm(entryId, in: agentId) } } label: {
          Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
            .frame(width: 32, height: 32).contentShape(Rectangle())
        }
        .buttonStyle(.tactile)
        .accessibilityLabel("Dismiss")
      } else if let status = card.statusLine {
        StatusPill(text: status, dot: dot)
      }
    }
  }

  private var dot: Color {
    switch card.state {
    case .filled: card.fields.contains { card.outcomes[$0.id] == .fillFailed } ? Ink.danger : Ink.live
    case .failed: Ink.danger
    case .filling: Ink.blue
    case .open, .dismissed: Ink.tertiary
    }
  }

  private var form: some View {
    VStack(alignment: .leading, spacing: 10) {
      if !card.instruction.isEmpty {
        Text(card.instruction).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      }
      ForEach(card.fields) { field in
        VStack(alignment: .leading, spacing: 4) {
          if field.kind != .checkbox { Text(field.label).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
          input(field)
        }
      }
      if card.submitsAfterFill {
        Text("It’s sent as soon as it’s typed in.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      Button("Fill in") {
        let sent = card.values(values)
        // What was typed leaves the card now; only the computer holds it, and only to type it in.
        values = [:]
        run { refusal = await store.submitUserForm(sent, entryId: entryId, in: agentId) }
      }
      .buttonStyle(Tactile(look: BlueButtonStyle()))
      .disabled(busy || !card.canFill(values))
      if let refusal { Text(refusal).font(.system(size: 13)).foregroundStyle(Ink.danger) }
    }
  }

  @ViewBuilder
  private func input(_ field: UserFormCard.Field) -> some View {
    let text = Binding(get: { values[field.id] ?? "" }, set: { values[field.id] = $0 })
    switch field.kind {
    case .checkbox:
      Toggle(field.label, isOn: Binding(get: { values[field.id] == "true" }, set: { values[field.id] = $0 ? "true" : "false" }))
        .font(.system(size: 17)).foregroundStyle(Ink.primary).tint(Ink.blue)
    case .select:
      Picker(field.label, selection: text) {
        Text(field.placeholder ?? String(localized: "Choose")).tag("")
        ForEach(field.options, id: \.self) { option in Text(option.label).tag(option.value) }
      }
      .pickerStyle(.menu).tint(Ink.primary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 4).frame(minHeight: 34)
      .background(Ink.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Ink.edge, lineWidth: 1))
    case .textarea:
      boxed(TextField(field.placeholder ?? "", text: text, axis: .vertical).lineLimit(3...6), vertical: true)
    default:
      if field.secret {
        boxed(SecureField(field.placeholder ?? "", text: text).typedAsIs().autocorrectionDisabled().textContentType(field.kind == .otp ? .oneTimeCode : .password).keyboardType(field.kind == .otp ? .asciiCapable : .default))
      } else {
        boxed(TextField(field.placeholder ?? "", text: text).typedAsIs().autocorrectionDisabled(field.kind != .text).textContentType(contentType(field.kind)).keyboardType(keyboard(field.kind)))
      }
    }
  }

  private func boxed(_ field: some View, vertical: Bool = false) -> some View {
    field
      .font(.system(size: 17))
      .padding(.horizontal, 10).padding(.vertical, vertical ? 7 : 0).frame(minHeight: 34)
      .background(Ink.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Ink.edge, lineWidth: 1))
  }

  private func keyboard(_ kind: UserFormCard.Kind) -> UIKeyboardType {
    switch kind {
    case .email: .emailAddress
    case .tel: .phonePad
    case .number: .decimalPad
    case .date: .numbersAndPunctuation
    default: .default
    }
  }

  private func contentType(_ kind: UserFormCard.Kind) -> UITextContentType? {
    switch kind {
    case .email: .emailAddress
    case .tel: .telephoneNumber
    default: nil
    }
  }

  /** Once answered: each field and whether it went in. */
  private var answered: some View {
    VStack(alignment: .leading, spacing: 6) {
      if card.state == .filled || card.state == .filling {
        ForEach(card.fields) { field in
          HStack(spacing: 8) {
            Text(field.label).font(.system(size: 15)).foregroundStyle(Ink.primary).lineLimit(1)
            Spacer(minLength: 8)
            if let line = card.outcomeLine(field) {
              Text(line).font(.system(size: 13)).foregroundStyle(card.outcomes[field.id] == .fillFailed ? Ink.danger : Ink.secondary)
            }
          }
        }
      }
      if card.state == .failed, let note = card.note {
        Text(note).font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }
}
