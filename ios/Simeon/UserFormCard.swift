import SwiftUI
import SimeonCore

/**
 * The in-chat form (28 October 2026, SimeonCore's `UserFormCard`), as the
 * founder's reference has it (10 November 2026: "open, then an iframe"): a
 * row (the site's icon, the form's title, "Opens a secure form") with Open
 * at its right, which opens the form in a sheet (`PhoneSecureFormSheet`).
 * The values go to the computer and are typed into the page there; for a
 * sign-in, the sheet also offers to keep the login in the Credentials
 * Store. Once answered, the row says how it went and each field whether it
 * went in.
 */
struct UserFormCardView: View {
  let entryId: String
  let agentId: String
  let card: UserFormCard
  @Environment(AppStore.self) private var store
  @State private var showing = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        // The site's icon; its first letter, not the title's ("Sign in to …"), while it has none.
        SiteIconTile(site: card.domain, title: card.domain, contact: false, size: 40)
        VStack(alignment: .leading, spacing: 0) {
          Text(card.title).font(.system(size: 13, weight: .medium)).foregroundStyle(card.state == .dismissed ? Ink.secondary : Ink.primary).lineLimit(1)
          Text(card.state == .open ? String(localized: "Opens a secure form") : card.domain).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        if card.state == .open {
          Button("Open") { showing = true }
            .buttonStyle(Tactile(look: CardPillStyle(height: 32)))
        } else if let status = card.statusLine {
          StatusPill(text: status, dot: dot)
        }
      }
      answered
    }
    .card()
    .sheet(isPresented: $showing) {
      PhoneSecureFormSheet(
        title: card.title,
        line: card.instruction,
        fields: card.fields,
        site: card.domain,
        keepLabel: card.login == nil ? nil : String(localized: "Save to your Credentials Store"),
        sends: card.submitsAfterFill,
        submitTitle: String(localized: "Fill in"),
        decline: { await store.dismissUserForm(entryId, in: agentId) },
        submit: submit
      )
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

  /** A sign-in kept in the store first when asked (a store that refuses it stops here), then typed into the page. */
  private func submit(_ typed: [String: String], _ keep: Bool) async -> String? {
    if keep, let login = card.login {
      let model = CredentialsStoreModel(store: store)
      var draft = CredentialDraft(kind: .login)
      draft.website = card.domain
      draft.username = typed[login.username.id] ?? ""
      draft.password = typed[login.password.id] ?? ""
      guard await model.save(draft) != nil else { return model.problem ?? String(localized: "That didn't work.") }
    }
    return await store.submitUserForm(card.values(typed), entryId: entryId, in: agentId)
  }

  /** Once answered: each field and whether it went in. */
  @ViewBuilder private var answered: some View {
    if card.state == .filled || card.state == .filling {
      VStack(alignment: .leading, spacing: 6) {
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
    } else if card.state == .failed, let note = card.note {
      Text(note).font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
    }
  }
}

/**
 * A secure form in a sheet (the founder's reference, 10 November 2026):
 * the close at the top and the title, why it's asked, each field with its
 * name over it (44 high, 14 round; a password's eye shows it), for a
 * sign-in "Save to your Credentials Store" (on), then a shield and where it
 * goes ("Never shown to your agent. Only filled on acme.com.") and Not now
 * with the main button. A refusal stays in the sheet with what was typed;
 * once it went, the sheet closes and forgets it. The close only closes it;
 * Not now declines.
 */
struct PhoneSecureFormSheet: View {
  let title: String
  var line: String? = nil
  let fields: [UserFormCard.Field]
  /** The site it goes to ("acme.com"). */
  var site: String? = nil
  /** A sign-in's "Save to your Credentials Store", on until turned off. */
  var keepLabel: String? = nil
  /** Enter is pressed once it's in (a lone one-time code). */
  var sends = false
  let submitTitle: String
  let decline: () async -> Void
  /** What was typed and whether to keep the login; a refusal to show, or none once it went. */
  let submit: (_ typed: [String: String], _ keep: Bool) async -> String?
  @Environment(\.dismiss) private var dismiss
  @State private var values: [String: String] = [:]
  @State private var shown: Set<String> = []
  @State private var keep = true
  @State private var busy = false
  @State private var refusal: String?
  @FocusState private var focused: String?

  private var fillable: Bool { UserFormCard.canFill(fields, values) }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(1)
          .padding(.horizontal, 56)
          .accessibilityAddTraits(.isHeader)
        HStack {
          CloseDisc { dismiss() }.disabled(busy)
          Spacer(minLength: 0)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          if let line, !line.isEmpty {
            Text(line).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
          }
          ForEach(fields) { field in
            VStack(alignment: .leading, spacing: 6) {
              if field.kind != .checkbox { Text(field.label).font(.system(size: 15)).foregroundStyle(Ink.secondary) }
              input(field)
            }
          }
          if let keepLabel {
            Toggle(keepLabel, isOn: $keep).font(.system(size: 17)).foregroundStyle(Ink.primary).tint(Ink.blue)
          }
          if sends {
            Text("It’s sent as soon as it’s typed in.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
          if let refusal {
            Text(refusal).font(.system(size: 15)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
          }
          CardShieldLine(words: site.map { String(localized: "Never shown to your agent. Only filled on \($0).") } ?? String(localized: "Stored securely, never shown to your agent."))
          CardPills {
            Button("Not now") {
              busy = true
              Task {
                await decline()
                busy = false
                dismiss()
              }
            }
            .buttonStyle(Tactile(look: CardPillStyle()))
            .disabled(busy)
            Button(submitTitle, action: send)
              .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
              .disabled(busy || !fillable)
          }
        }
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 24)
      }
      .scrollDismissesKeyboard(.interactively)
    }
    .background(Ink.ground.ignoresSafeArea())
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .interactiveDismissDisabled(busy)
    .onAppear { focused = fields.first(where: { $0.kind != .checkbox && $0.kind != .select })?.id }
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
      .padding(.horizontal, -10)
      .cardField()
    case .textarea:
      TextField(field.placeholder ?? "", text: text, axis: .vertical).lineLimit(3...6)
        .focused($focused, equals: field.id)
        .cardField(height: nil)
    default:
      if field.secret {
        let showing = shown.contains(field.id)
        HStack(spacing: 4) {
          Group {
            if showing {
              TextField(field.placeholder ?? "", text: text)
            } else {
              SecureField(field.placeholder ?? "", text: text)
            }
          }
          .typedAsIs().autocorrectionDisabled()
          .textContentType(field.kind == .otp ? .oneTimeCode : .password)
          .keyboardType(field.kind == .otp ? .asciiCapable : .default)
          .focused($focused, equals: field.id)
          .submitLabel(.done)
          .onSubmit(send)
          Button {
            if showing { shown.remove(field.id) } else { shown.insert(field.id) }
          } label: {
            Image(systemName: showing ? "eye.slash" : "eye").font(.system(size: 16)).foregroundStyle(Ink.secondary)
              .frame(width: 36, height: 36).contentShape(Rectangle())
          }
          .buttonStyle(.tactile)
          .accessibilityLabel(showing ? String(localized: "Hide Password") : String(localized: "Show Password"))
        }
        .padding(.trailing, -10)
        .cardField()
      } else {
        TextField(field.placeholder ?? "", text: text)
          .typedAsIs().autocorrectionDisabled(field.kind != .text)
          .textContentType(contentType(field.kind)).keyboardType(keyboard(field.kind))
          .focused($focused, equals: field.id)
          .submitLabel(.next)
          .onSubmit { focusNext(after: field) }
          .cardField()
      }
    }
  }

  /** Return goes to the next field to type in, and from the last one sends. */
  private func focusNext(after field: UserFormCard.Field) {
    let typed = fields.filter { $0.kind != .checkbox && $0.kind != .select }
    if let at = typed.firstIndex(of: field), at + 1 < typed.count { focused = typed[at + 1].id } else { send() }
  }

  private func send() {
    guard !busy, fillable else { return }
    let typed = values
    busy = true
    refusal = nil
    Task {
      let said = await submit(typed, keepLabel != nil && keep)
      busy = false
      if let said {
        refusal = said
        return
      }
      // What was typed leaves the sheet now; only the computer holds it, and only to type it in.
      values = [:]
      dismiss()
    }
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
}

