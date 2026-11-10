import SwiftUI
import SimeonCore

/**
 * The in-chat form (28 October 2026, SimeonCore's `UserFormCard`), as the
 * founder's reference has it (10 November 2026: "open, then an iframe"): a
 * row (the site's icon, the form's title, "Opens a secure form") with Open
 * at its right, which opens the form in a sheet over the window
 * (`MacSecureFormSheet`). The values go to the computer, which types them
 * into the page; for a sign-in, the sheet also offers to keep the login in
 * the Credentials Store. Once answered, the row says how it went and each
 * field whether it went in.
 */
struct UserFormCardView: View {
  let entryId: String
  let agentId: String
  let card: UserFormCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var showing = false

  var body: some View {
    CardShell(look: look) {
      HStack(spacing: 12) {
        // The site's icon; its first letter, not the title's ("Sign in to …"), while it has none.
        MacSiteIconTile(site: card.domain, title: card.domain, contact: false, side: 40, look: look)
        VStack(alignment: .leading, spacing: 0) {
          Text(card.title)
            .font(.system(size: 13, weight: .medium))
            .tracking(-0.08)
            .foregroundStyle(card.state == .dismissed ? look.inkSecondary : look.ink)
            .lineLimit(1)
            .frame(height: 18)
          Text(card.state == .open ? String(localized: "Opens a secure form") : card.domain)
            .font(.system(size: 13))
            .tracking(-0.08)
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
            .frame(height: 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if card.state == .open {
          CardButton(title: String(localized: "Open"), look: look) { showing = true }
        } else if let status = card.statusLine {
          StatusPill(text: status, look: look, dot: dot)
        }
      }
      answered
    }
    .sheet(isPresented: $showing) {
      MacSecureFormSheet(
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

  private var dot: Color? {
    switch card.state {
    case .filled: card.fields.contains { card.outcomes[$0.id] == .fillFailed } ? look.danger : look.working
    case .failed: look.danger
    case .filling: look.blue
    case .open, .dismissed: nil
    }
  }

  /** Once answered: each field and whether it went in. */
  @ViewBuilder private var answered: some View {
    if card.state == .filled || card.state == .filling {
      VStack(alignment: .leading, spacing: 4) {
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
    } else if card.state == .failed, let note = card.note {
      Text(note).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary).fixedSize(horizontal: false, vertical: true)
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
}

/**
 * A secure form over the window (the founder's reference, 10 November
 * 2026): the title and the X, why it's asked, each field with its name over
 * it (36 high, 12 round; a password's eye shows it), for a sign-in "Save to
 * your Credentials Store" (checked), then a shield and where it goes
 * ("Never shown to your agent. Only filled on acme.com.") with Not now and
 * the main button at the right. A refusal stays in the sheet with what was
 * typed; once it went, the sheet closes and forgets it. The X, Escape or a
 * click outside only close it; Not now declines.
 */
struct MacSecureFormSheet: View {
  let title: String
  var line: String? = nil
  let fields: [UserFormCard.Field]
  /** The site it goes to ("acme.com"). */
  var site: String? = nil
  /** A sign-in's "Save to your Credentials Store", checked until unchecked. */
  var keepLabel: String? = nil
  /** Enter is pressed once it's in (a lone one-time code). */
  var sends = false
  let submitTitle: String
  let decline: () async -> Void
  /** What was typed and whether to keep the login; a refusal to show, or none once it went. */
  let submit: (_ typed: [String: String], _ keep: Bool) async -> String?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var values: [String: String] = [:]
  @State private var shown: Set<String> = []
  @State private var keep = true
  @State private var busy = false
  @State private var refusal: String?
  @FocusState private var focused: String?

  private var look: Look { Look(scheme) }
  private var fillable: Bool { UserFormCard.canFill(fields, values) }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 12) {
        Text(title)
          .font(.system(size: 17, weight: .semibold))
          .tracking(-0.3)
          .foregroundStyle(look.ink)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityAddTraits(.isHeader)
        GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
          .keyboardShortcut(.cancelAction)
          .disabled(busy)
      }
      if let line, !line.isEmpty {
        Text(line)
          .font(.system(size: 14))
          .tracking(-0.15)
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, -8)
      }
      VStack(alignment: .leading, spacing: 14) {
        ForEach(fields) { field in
          VStack(alignment: .leading, spacing: 6) {
            if field.kind != .checkbox {
              Text(field.label).font(.system(size: 13)).tracking(-0.08).foregroundStyle(look.inkSecondary)
            }
            input(field)
          }
        }
      }
      if let keepLabel {
        Toggle(keepLabel, isOn: $keep)
          .toggleStyle(.checkbox)
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .tint(look.yours)
      }
      if sends {
        Text("It’s sent as soon as it’s typed in.").font(.system(size: 13)).tracking(-0.08).foregroundStyle(look.inkTertiary)
      }
      if let refusal {
        Text(refusal).font(.system(size: 13)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
      }
      HStack(alignment: .center, spacing: 8) {
        CardShieldLine(words: site.map { String(localized: "Never shown to your agent. Only filled on \($0).") } ?? String(localized: "Stored securely, never shown to your agent."), look: look)
        Spacer(minLength: 8)
        CardButton(title: String(localized: "Not now"), look: look) {
          busy = true
          Task {
            await decline()
            busy = false
            dismiss()
          }
        }
        .disabled(busy)
        CardButton(title: submitTitle, prominent: true, look: look, action: send)
          .disabled(busy || !fillable)
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 24)
    .padding(.top, 20)
    .padding(.bottom, 22)
    .frame(width: 440)
    .background(look.groupedGround)
    .interactiveDismissDisabled(busy)
    .closesOnClickOutside { if !busy { dismiss() } }
    .onAppear { focused = fields.first(where: { $0.kind != .checkbox && $0.kind != .select })?.id }
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
      TextField("", text: text, prompt: prompt, axis: .vertical)
        .lineLimit(3...6)
        .focused($focused, equals: field.id)
        .cardField(look, height: nil)
    default:
      if field.secret {
        let showing = shown.contains(field.id)
        HStack(spacing: 4) {
          Group {
            if showing {
              TextField("", text: text, prompt: prompt)
            } else {
              SecureField("", text: text, prompt: prompt)
            }
          }
          .textFieldStyle(.plain)
          .font(.system(size: 14))
          .focused($focused, equals: field.id)
          .onSubmit(send)
          Button {
            if showing { shown.remove(field.id) } else { shown.insert(field.id) }
          } label: {
            Image(systemName: showing ? "eye.slash" : "eye")
              .font(.system(size: 13))
              .foregroundStyle(look.inkSecondary)
              .frame(width: 28, height: 28)
              .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
          .help(showing ? String(localized: "Hide Password") : String(localized: "Show Password"))
          .accessibilityLabel(showing ? String(localized: "Hide Password") : String(localized: "Show Password"))
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .frame(height: 36)
        .background(look.ground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
      } else {
        TextField("", text: text, prompt: prompt)
          .autocorrectionDisabled(field.kind != .text)
          .focused($focused, equals: field.id)
          .onSubmit(send)
          .cardField(look)
      }
    }
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
}
