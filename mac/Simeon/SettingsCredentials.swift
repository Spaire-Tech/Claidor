import AppKit
import SwiftUI
import SimeonCore

// MARK: - Credentials Store

/**
 * Credentials Store (the iPhone's CredentialsStorePage; the founder, 28
 * October 2026: "use our existing design and for whatever saved, have the
 * favicon be there"; 29 October: "name it Credentials Store"): what
 * it is for in a line, as Wallet's page; then Logins, each its site's icon
 * (28), its name over its username; Cards, which Link keeps (Wallet's
 * page); Contact info. Each group ends in its Add, in the link blue. A row
 * opens its sheet.
 */
struct SettingsCredentialsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @State private var model: CredentialsStoreModel?
  @State private var editing: MacCredentialEdit?

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Logins and details your agents use to sign in and sign up for you.")
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      if let model {
        if !model.loaded {
          if let problem = model.problem {
            SettingsGroup(look: look) {
              SettingsLine(label: problem, labelTint: look.danger, look: look) {
                SettingsPill(title: String(localized: "Try Again"), look: look) { Task { await model.load() } }
              }
            }
          } else {
            ProgressView().controlSize(.small).frame(maxWidth: .infinity)
          }
        } else {
          SettingsGroup(title: String(localized: "Logins"), look: look) {
            ForEach(Array(model.logins.enumerated()), id: \.element.id) { index, entry in
              MacCredentialLine(entry: entry, divided: index > 0, look: look) { editing = .entry(entry) }
            }
            MacStoreAddRow(title: String(localized: "Add Login"), divided: !model.logins.isEmpty, look: look) { editing = .new(.login) }
          }
          SettingsGroup(title: String(localized: "Cards"), footer: String(localized: "Your cards stay with Link. Simeon pays with a one-time card and never sees a card's number or security code."), look: look) {
            MacStoreLine(divided: false, look: look, action: { settings.page = .wallet }) {
              AppLogoTile(name: "Link", look: look, side: 28, id: "link")
              Text(verbatim: "Link by Stripe").font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
            }
          }
          SettingsGroup(title: String(localized: "Contact info"), footer: String(localized: "Simeon can see your logins and contact info so it can type them in for you."), look: look) {
            ForEach(Array(model.contacts.enumerated()), id: \.element.id) { index, entry in
              MacCredentialLine(entry: entry, divided: index > 0, look: look) { editing = .entry(entry) }
            }
            MacStoreAddRow(title: String(localized: "Add Contact Info"), divided: !model.contacts.isEmpty, look: look) { editing = .new(.contact) }
          }
        }
      }
    }
    .sheet(item: $editing) { edit in
      if let model { MacCredentialSheet(model: model, edit: edit) }
    }
    .task {
      if model == nil { model = CredentialsStoreModel(store: store) }
      await model?.load()
    }
  }
}

/** What the sheet opens on: a new login or contact info, or a saved entry. */
enum MacCredentialEdit: Identifiable {
  case new(StoredCredential.Kind)
  case entry(StoredCredential)

  var id: String {
    switch self {
    case .new(let kind): "new-\(kind.rawValue)"
    case .entry(let entry): entry.id
    }
  }
}

/** A row that opens something: what leads it, then the chevron; a step darker under the pointer. */
private struct MacStoreLine<Leading: View>: View {
  let divided: Bool
  let look: Look
  let action: () -> Void
  @ViewBuilder let leading: () -> Leading
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        leading()
        Spacer(minLength: 8)
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(look.inkTertiary)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, 10)
      .frame(minHeight: SettingsRowSize.minHeight)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** One entry: its site's icon (or the contact's), its name over its username or email. */
private struct MacCredentialLine: View {
  let entry: StoredCredential
  let divided: Bool
  let look: Look
  let open: () -> Void

  var body: some View {
    MacStoreLine(divided: divided, look: look, action: open) {
      MacSiteIconTile(site: entry.iconSite, title: entry.title, contact: entry.kind == .contact, side: 28, look: look)
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.title).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
        if !entry.subtitle.isEmpty {
          Text(entry.subtitle).font(PanelType.detail).foregroundStyle(look.inkSecondary).lineLimit(1)
        }
      }
    }
    .accessibilityLabel(entry.subtitle.isEmpty ? entry.title : "\(entry.title), \(entry.subtitle)")
  }
}

/** Add Login, Add Contact Info: the blue plus and the words in the link blue (Add passport's row). */
private struct MacStoreAddRow: View {
  let title: String
  let divided: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: "plus.circle.fill")
          .font(.system(size: 16))
          .foregroundStyle(look.settingsAction)
        Text(title)
          .font(PanelType.row)
          .foregroundStyle(look.settingsAction)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
      .frame(minHeight: SettingsRowSize.minHeight)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/**
 * A saved login's icon, an app icon's corners (as AppIconImage): the site's
 * own, read on this Mac from the site (`SiteIcons`), on white; until then, or
 * when it has none, the name's first letter on the tile. Contact info shows
 * a person.
 */
struct MacSiteIconTile: View {
  let site: String?
  let title: String
  var contact = false
  var side: CGFloat = 28
  let look: Look
  @State private var icon: NSImage?

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: side * 0.2237, style: .continuous)
    ZStack {
      shape.fill(icon == nil ? look.logoTile : Color.white)
      if let icon {
        Image(nsImage: icon).resizable().interpolation(.high).scaledToFit().padding(side * 0.12)
      } else if contact {
        Image(systemName: "person.fill").font(.system(size: side * 0.5)).foregroundStyle(look.inkSecondary)
      } else {
        Text(String(title.prefix(1)).uppercased()).font(.system(size: side * 0.42, weight: .semibold)).foregroundStyle(look.inkSecondary)
      }
    }
    .frame(width: side, height: side)
    .clipShape(shape)
    .overlay(shape.strokeBorder(look.ink.opacity(look.dark ? 0.16 : 0.08), lineWidth: 0.5))
    .accessibilityHidden(true)
    .task(id: site) {
      guard let site else { icon = nil; return }
      if let data = await SiteIcons.shared.icon(for: site) { icon = NSImage(data: data) }
    }
  }
}

/**
 * A login or contact info on a sheet, in the app's own parts (the travellers'
 * sheet): the glass disc that closes it and its name at the top; its fields
 * as Settings' rows, the label on the left and what is typed on the right; a
 * saved password as dots until the eye is pressed and Touch ID allows it;
 * Hints; Delete for a saved one; Save the sheet's one wide button in the
 * blue. A click outside closes it only while nothing was changed.
 */
struct MacCredentialSheet: View {
  let model: CredentialsStoreModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var entry: StoredCredential?
  @State private var draft: CredentialDraft
  @State private var opened: CredentialDraft
  @State private var passwordRead: Bool
  @State private var showsPassword: Bool
  @State private var saving = false
  @State private var problem: String?

  private var look: Look { Look(scheme) }
  private var isLogin: Bool { draft.kind == .login }

  init(model: CredentialsStoreModel, edit: MacCredentialEdit) {
    self.model = model
    switch edit {
    case .new(let kind):
      let start = CredentialDraft(kind: kind)
      _entry = State(initialValue: nil)
      _draft = State(initialValue: start)
      _opened = State(initialValue: start)
      _passwordRead = State(initialValue: true)
      _showsPassword = State(initialValue: true)
    case .entry(let saved):
      let start = CredentialDraft(saved)
      _entry = State(initialValue: saved)
      _draft = State(initialValue: start)
      _opened = State(initialValue: start)
      _passwordRead = State(initialValue: false)
      _showsPassword = State(initialValue: false)
    }
  }

  private var title: String {
    if let entry { return entry.title }
    return isLogin ? String(localized: "New Login") : String(localized: "New Contact Info")
  }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(title)
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .padding(.horizontal, 56)
          .accessibilityAddTraits(.isHeader)
        HStack {
          GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
            .keyboardShortcut(.cancelAction)
            .disabled(saving)
          Spacer(minLength: 0)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      .padding(.bottom, 8)
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          SettingsGroup(look: look) {
            MacStoreTextRow(label: String(localized: "Name"), text: $draft.name, prompt: String(localized: "Optional"), divided: false, look: look)
            if isLogin {
              MacStoreTextRow(label: String(localized: "Website"), text: $draft.website, prompt: "acme.com", content: .URL, look: look)
              MacStoreTextRow(label: String(localized: "Username or email"), text: $draft.username, prompt: String(localized: "Required"), content: .username, look: look)
              passwordRow
            } else {
              MacStoreTextRow(label: String(localized: "Full name"), text: $draft.fullName, prompt: String(localized: "Optional"), content: .name, look: look)
              MacStoreTextRow(label: String(localized: "Email"), text: $draft.email, prompt: String(localized: "Optional"), content: .emailAddress, look: look)
              MacStoreTextRow(label: String(localized: "Phone"), text: $draft.phone, prompt: String(localized: "Optional"), content: .telephoneNumber, look: look)
            }
          }
          if !isLogin {
            SettingsGroup(title: String(localized: "Address"), look: look) {
              MacStoreTextRow(label: String(localized: "Address"), text: $draft.addressLine1, prompt: String(localized: "Optional"), content: .streetAddressLine1, divided: false, look: look)
              MacStoreTextRow(label: String(localized: "Address line 2"), text: $draft.addressLine2, prompt: String(localized: "Optional"), content: .streetAddressLine2, look: look)
              MacStoreTextRow(label: String(localized: "City"), text: $draft.city, prompt: String(localized: "Optional"), content: .addressCity, look: look)
              MacStoreTextRow(label: String(localized: "State or region"), text: $draft.region, prompt: String(localized: "Optional"), content: .addressState, look: look)
              MacStoreTextRow(label: String(localized: "Postal code"), text: $draft.postalCode, prompt: String(localized: "Optional"), content: .postalCode, look: look)
              SettingsMenu(
                label: String(localized: "Country"),
                divided: true,
                options: MacCountryName.all.map { (value: $0.code, label: $0.name) },
                value: draft.country,
                shown: draft.country.isEmpty ? String(localized: "Choose") : nil,
                look: look
              ) { draft.country = $0 }
            }
          }
          SettingsGroup(title: String(localized: "Hints"), footer: entry?.savedBy.map { String(localized: "Saved by \($0) at a sign-up.") }, look: look) {
            TextField("Hints", text: $draft.hints, prompt: Text("Tell Simeon when to use this entry").foregroundStyle(look.inkTertiary), axis: .vertical)
              .textFieldStyle(.plain)
              .font(PanelType.row)
              .foregroundStyle(look.ink)
              .lineLimit(2...6)
              .padding(.horizontal, SettingsRowSize.inset)
              .padding(.vertical, SettingsRowSize.vertical)
              .frame(minHeight: SettingsRowSize.minHeight, alignment: .topLeading)
          }
          if let problem {
            Text(problem)
              .font(PanelType.detail)
              .foregroundStyle(look.danger)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.horizontal, 8)
          }
          if entry != nil {
            SettingsGroup(look: look) {
              SettingsActionRow(title: isLogin ? String(localized: "Delete Login") : String(localized: "Delete Contact Info"), destructive: true, look: look) { askToDelete() }
            }
          }
        }
        .padding(.horizontal, 32)
        .padding(.top, 8)
        .padding(.bottom, 24)
      }
      VStack(spacing: 0) {
        Button {
          Task { await save() }
        } label: {
          HStack(spacing: 8) {
            if saving { ProgressView().controlSize(.small).tint(.white) }
            Text("Save")
          }
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white)
          .frame(maxWidth: .infinity)
          .frame(height: 36)
        }
        .prominentGlassButton()
        .controlSize(.large)
        .tint(look.yours)
        .keyboardShortcut(.defaultAction)
        .handCursor()
        .disabled(saving || draft.isEmpty || (entry != nil && draft == opened))
      }
      .padding(.horizontal, 32)
      .padding(.top, 12)
      .padding(.bottom, 24)
    }
    .frame(width: 560, height: isLogin ? 560 : 720)
    .background(look.groupedGround)
    .interactiveDismissDisabled(saving)
    .closesOnClickOutside { if !saving && draft == opened { dismiss() } }
  }

  /** The password: dots, or the words once shown; a saved one is read only after Touch ID. */
  private var passwordRow: some View {
    SettingsLine(label: String(localized: "Password"), divided: true, look: look) {
      HStack(spacing: 8) {
        Group {
          let hidden = entry?.hasPassword == true && !passwordRead
          if showsPassword {
            TextField("Password", text: $draft.password, prompt: Text(String(localized: "Required")).foregroundStyle(look.inkTertiary))
          } else {
            SecureField("Password", text: $draft.password, prompt: Text(hidden ? "••••••••" : String(localized: "Required")).foregroundStyle(look.inkTertiary))
          }
        }
        .textFieldStyle(.plain)
        .labelsHidden()
        .multilineTextAlignment(.trailing)
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .textContentType(.password)
        .frame(width: 260)
        Button { Task { await togglePassword() } } label: {
          Image(systemName: showsPassword ? "eye.slash" : "eye").font(.system(size: 13)).foregroundStyle(look.inkSecondary)
        }
        .buttonStyle(.hand)
        .help(showsPassword ? String(localized: "Hide Password") : String(localized: "Show Password"))
      }
    }
  }

  private func togglePassword() async {
    if showsPassword { showsPassword = false; return }
    guard let entry, entry.hasPassword, !passwordRead else { showsPassword = true; return }
    guard await PurchaseApproval.confirm(reason: String(localized: "Show the password for \(entry.title)")) != nil else { return }
    do {
      let password = try await model.password(of: entry)
      // What was typed before it was read is kept; the rest is the saved password.
      if draft.password.isEmpty { draft.password = password }
      opened.password = password
      passwordRead = true
      showsPassword = true
    } catch {
      problem = error.localizedDescription
    }
  }

  private func save() async {
    if let found = draft.problem { problem = found; NSSound.beep(); return }
    saving = true
    let saved = await model.save(draft, editing: entry.map { (entry: $0, opened: opened, passwordRead: passwordRead) })
    saving = false
    guard saved != nil else { problem = model.problem; NSSound.beep(); return }
    dismiss()
  }

  private func askToDelete() {
    guard let entry else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = isLogin ? String(localized: "Delete this login?") : String(localized: "Delete this contact info?")
    alert.informativeText = String(localized: "Your agents won't be able to use it anymore.")
    alert.addButton(withTitle: String(localized: "Delete"))
    alert.addButton(withTitle: String(localized: "Cancel")).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      Task {
        if await model.delete(entry) { dismiss() } else { problem = model.problem }
      }
    }
  }
}

/** A row with a field: the label on the left, what is typed on the right, in the row's own type. */
private struct MacStoreTextRow: View {
  let label: String
  @Binding var text: String
  let prompt: String
  var content: NSTextContentType? = nil
  var divided = true
  let look: Look

  var body: some View {
    SettingsLine(label: label, divided: divided, look: look) {
      TextField(label, text: $text, prompt: Text(prompt).foregroundStyle(look.inkTertiary))
        .textFieldStyle(.plain)
        .labelsHidden()
        .multilineTextAlignment(.trailing)
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .textContentType(content)
        .frame(width: 300)
    }
  }
}
