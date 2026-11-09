import SimeonCore
import SwiftUI

/**
 * Credentials Store (the founder, 28 October 2026: "the agent should be
 * able to see logins … use our existing design and for whatever saved, have
 * the favicon be there"; 29 October: "name it Credentials Store"):
 * as plain as Wallet. Logins, each its site's icon, its name and its
 * username; Cards (9 November 2026, the founder: "actual cards there that
 * the agent can use to make payments"), each its network's mark, its name
 * and "•••• 4242 · 08/28"; Contact info. + adds a login, a card or contact
 * info, as the upstream app's vault does. A row opens its page; a password,
 * a card's number and code show only after Face ID.
 */
struct CredentialsStorePage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @State private var model: CredentialsStoreModel?
  @State private var adding: StoredCredential.Kind?

  var body: some View {
    Form {
      if let model {
        if let problem = model.problem, !model.loaded {
          Section {
            Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger)
            Button("Try Again") { Task { await model.load() } }
          }
          .listRowBackground(Ink.groupedRow)
        } else if !model.loaded {
          Section { HStack { Spacer(); ProgressView(); Spacer() } }
            .listRowBackground(Color.clear)
        } else {
          Section {
            ForEach(model.logins) { entry in
              NavigationLink { CredentialEditor(model: model, entry: entry) } label: { CredentialRow(entry: entry) }
            }
            CredentialAddRow(title: String(localized: "Add Login")) { adding = .login }
          } header: {
            Text("Logins")
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            ForEach(model.cards) { entry in
              NavigationLink { CredentialEditor(model: model, entry: entry) } label: { CredentialRow(entry: entry) }
            }
            CredentialAddRow(title: String(localized: "Add Card")) { adding = .card }
          } header: {
            Text("Cards")
          } footer: {
            Text("Your agents pay with a card only after you approve. They never see its number or security code.")
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            ForEach(model.contacts) { entry in
              NavigationLink { CredentialEditor(model: model, entry: entry) } label: { CredentialRow(entry: entry) }
            }
            CredentialAddRow(title: String(localized: "Add Contact Info")) { adding = .contact }
          } header: {
            Text("Contact info")
          } footer: {
            Text("Simeon can see your logins and contact info so it can type them in for you.")
          }
          .listRowBackground(Ink.groupedRow)
        }
      }
    }
    .groupedGround()
    .navigationTitle("Credentials Store")
    .inlineBarTitle()
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Menu {
          Button { adding = .login } label: { Label("Login", systemImage: "key") }
          Button { adding = .card } label: { Label("Card", systemImage: "creditcard") }
          Button { adding = .contact } label: { Label("Contact info", systemImage: "person.text.rectangle") }
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Add")
      }
    }
    .sheet(item: Binding(get: { adding.map(AddingKind.init) }, set: { adding = $0?.kind })) { item in
      if let model {
        NavigationStack { CredentialEditor(model: model, newKind: item.kind) }
      }
    }
    .task {
      if model == nil { model = CredentialsStoreModel(store: store) }
      await model?.load()
    }
  }
}

/** The kind being added, as a sheet's item. */
private struct AddingKind: Identifiable {
  let kind: StoredCredential.Kind
  var id: String { kind.rawValue }
}

/** One entry: its site's icon (or the contact's), its name, and its username or email under it. */
struct CredentialRow: View {
  let entry: StoredCredential

  var body: some View {
    HStack(spacing: 14) {
      if entry.kind == .card {
        PaymentMark(brand: entry.brand).scaleEffect(30 / 44).frame(width: 30, height: 30)
      } else {
        SiteIconTile(site: entry.iconSite, title: entry.title, contact: entry.kind == .contact, size: 30)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.title).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        if !entry.subtitle.isEmpty {
          Text(entry.subtitle).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
      }
    }
    .padding(.vertical, 2)
  }
}

/** Add Login, Add Contact Info: the blue plus and its words, as Add passport. */
private struct CredentialAddRow: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: "plus.circle.fill").font(.system(size: 20)).foregroundStyle(Ink.blue)
        Text(title).font(.system(size: 17)).foregroundStyle(Ink.blue)
      }
    }
  }
}

/**
 * A saved login's icon, an app icon's corners (as Connectors' tiles): the
 * site's own, read on this phone from the site (`SiteIcons`), on white; until
 * then, or when it has none, the name's first letter on the tile. Contact
 * info shows a person.
 */
struct SiteIconTile: View {
  let site: String?
  let title: String
  var contact = false
  var size: CGFloat = 30
  @State private var icon: UIImage?

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: size * ConnectorLogo.iconCorner, style: .continuous)
    ZStack {
      shape.fill(icon == nil ? Ink.tile : Color.white)
      if let icon {
        Image(uiImage: icon).resizable().interpolation(.high).scaledToFit().padding(size * 0.12)
      } else if contact {
        Image(systemName: "person.fill").font(.system(size: size * 0.5)).foregroundStyle(Ink.tileInitial)
      } else {
        Text(String(title.prefix(1)).uppercased()).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(Ink.tileInitial)
      }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
    .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
    .accessibilityHidden(true)
    .task(id: site) {
      guard let site else { icon = nil; return }
      if let data = await SiteIcons.shared.icon(for: site) { icon = UIImage(data: data) }
    }
  }
}

/**
 * A login or contact info, new (a sheet, Cancel and Save) or saved (its
 * page, Save once something changed, Delete at the foot). A saved login's
 * password is dots until the eye is pressed and Face ID allows it; a new
 * one is typed as it is.
 */
struct CredentialEditor: View {
  let model: CredentialsStoreModel
  /** Told once a new entry is saved (the chat's store card says Saved). */
  var onSaved: ((StoredCredential) -> Void)?
  /** The entry as last saved; nil while it is new. */
  @State private var entry: StoredCredential?
  @Environment(\.dismiss) private var dismiss
  @State private var draft: CredentialDraft
  @State private var opened: CredentialDraft
  @State private var passwordRead = false
  @State private var showsPassword = false
  @State private var saving = false
  @State private var askingDelete = false
  @State private var problem: String?

  init(model: CredentialsStoreModel, entry: StoredCredential) {
    self.model = model
    _entry = State(initialValue: entry)
    let start = CredentialDraft(entry)
    _draft = State(initialValue: start)
    _opened = State(initialValue: start)
  }

  init(model: CredentialsStoreModel, newKind: StoredCredential.Kind) {
    self.init(model: model, filled: CredentialDraft(kind: newKind))
  }

  /** A new entry, already filled (from the chat's store card). */
  init(model: CredentialsStoreModel, filled start: CredentialDraft, onSaved: ((StoredCredential) -> Void)? = nil) {
    self.model = model
    self.onSaved = onSaved
    _entry = State(initialValue: nil)
    _draft = State(initialValue: start)
    _opened = State(initialValue: start)
    _passwordRead = State(initialValue: true)
    _showsPassword = State(initialValue: true)
  }

  private var isLogin: Bool { draft.kind == .login }
  private var isCard: Bool { draft.kind == .card }
  private var changed: Bool { draft != opened }

  private var newTitle: String {
    switch draft.kind {
    case .login: String(localized: "New Login")
    case .contact: String(localized: "New Contact Info")
    case .card: String(localized: "New Card")
    }
  }

  var body: some View {
    Form {
      Section {
        CredentialField(label: String(localized: "Name"), text: $draft.name, prompt: String(localized: "Optional"))
        if isLogin {
          CredentialField(label: String(localized: "Website"), text: $draft.website, prompt: "acme.com")
            .keyboardType(.URL).textContentType(.URL).typedAsIs().autocorrectionDisabled()
          CredentialField(label: String(localized: "Username or email"), text: $draft.username, prompt: String(localized: "Required"))
            .textContentType(.username).keyboardType(.emailAddress).typedAsIs().autocorrectionDisabled()
          passwordRow
        } else if isCard {
          cardNumberRow
          CredentialField(label: String(localized: "Expiry"), text: $draft.expiry, prompt: "MM/YY").keyboardType(.numbersAndPunctuation)
          securityCodeRow
          CredentialField(label: String(localized: "Name on card"), text: $draft.cardholder, prompt: String(localized: "Optional")).textContentType(.name)
        } else {
          CredentialField(label: String(localized: "Full name"), text: $draft.fullName, prompt: String(localized: "Optional")).textContentType(.name)
          CredentialField(label: String(localized: "Email"), text: $draft.email, prompt: String(localized: "Optional"))
            .textContentType(.emailAddress).keyboardType(.emailAddress).typedAsIs().autocorrectionDisabled()
          CredentialField(label: String(localized: "Phone"), text: $draft.phone, prompt: String(localized: "Optional")).textContentType(.telephoneNumber).keyboardType(.phonePad)
        }
      }
      .listRowBackground(Ink.groupedRow)
      if isCard {
        // The billing address: one of the person's contact info, by its address.
        let addresses = model.contacts.filter { !$0.addressLine.isEmpty }
        Section {
          Picker("Billing address", selection: $draft.billingId) {
            Text("None").tag("")
            ForEach(addresses) { contact in Text("\(contact.title) · \(contact.addressLine)").tag(contact.id) }
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
      if !isLogin && !isCard {
        Section {
          CredentialField(label: String(localized: "Address"), text: $draft.addressLine1, prompt: String(localized: "Optional")).textContentType(.streetAddressLine1)
          CredentialField(label: String(localized: "Address line 2"), text: $draft.addressLine2, prompt: String(localized: "Optional")).textContentType(.streetAddressLine2)
          CredentialField(label: String(localized: "City"), text: $draft.city, prompt: String(localized: "Optional")).textContentType(.addressCity)
          CredentialField(label: String(localized: "State or region"), text: $draft.region, prompt: String(localized: "Optional")).textContentType(.addressState)
          CredentialField(label: String(localized: "Postal code"), text: $draft.postalCode, prompt: String(localized: "Optional")).textContentType(.postalCode)
          Picker("Country", selection: $draft.country) {
            Text("Choose").tag("")
            ForEach(CountryName.all) { country in Text(country.name).tag(country.code) }
          }
        } header: {
          Text("Address")
        }
        .listRowBackground(Ink.groupedRow)
      }
      Section {
        TextField("Tell Simeon when to use this entry", text: $draft.hints, axis: .vertical)
          .lineLimit(2...6)
      } header: {
        Text("Hints")
      } footer: {
        if let savedBy = entry?.savedBy { Text("Saved by \(savedBy) at a sign-up.") }
      }
      .listRowBackground(Ink.groupedRow)
      if let problem {
        Section { Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger) }
          .listRowBackground(Ink.groupedRow)
      }
      if entry != nil {
        Section {
          Button(role: .destructive) { askingDelete = true } label: {
            HStack(spacing: 10) {
              Image(systemName: "trash")
              Text(isLogin ? String(localized: "Delete Login") : isCard ? String(localized: "Delete Card") : String(localized: "Delete Contact Info"))
            }
            .foregroundStyle(Ink.danger)
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .scrollDismissesKeyboard(.interactively)
    .navigationTitle(entry?.title ?? newTitle)
    .inlineBarTitle()
    .toolbar {
      if entry == nil {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      }
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          Button("Save") { Task { await save() } }
            .disabled(draft.isEmpty || (entry != nil && !changed))
        }
      }
    }
    .interactiveDismissDisabled(saving || (entry == nil && !draft.isEmpty))
    .alert(isLogin ? String(localized: "Delete this login?") : isCard ? String(localized: "Delete this card?") : String(localized: "Delete this contact info?"), isPresented: $askingDelete) {
      Button("Cancel", role: .cancel) {}
      Button("Delete", role: .destructive) {
        Task {
          guard let entry else { return }
          if await model.delete(entry) { Haptics.press(); dismiss() } else { problem = model.problem }
        }
      }
    } message: {
      Text("Your agents won't be able to use it anymore.")
    }
  }

  /** The password: dots, or the words once shown; a saved one is read only after Face ID. */
  private var passwordRow: some View {
    LabeledContent("Password") {
      HStack(spacing: 10) {
        Group {
          if showsPassword {
            TextField("Password", text: $draft.password, prompt: Text(entry?.hasPassword == true && !passwordRead ? "" : String(localized: "Required")))
          } else {
            SecureField("Password", text: $draft.password, prompt: Text(entry?.hasPassword == true && !passwordRead ? "••••••••" : String(localized: "Required")))
          }
        }
        .multilineTextAlignment(.trailing)
        .textContentType(.password)
        .typedAsIs()
        .autocorrectionDisabled()
        Button { Task { await togglePassword() } } label: {
          Image(systemName: showsPassword ? "eye.slash" : "eye").font(.system(size: 15)).foregroundStyle(Ink.secondary)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(showsPassword ? "Hide Password" : "Show Password")
      }
    }
  }

  /** A card's number, its network's mark at its end; a saved one shows its last four until the eye is pressed and Face ID allows it, which shows the number and the code. */
  private var cardNumberRow: some View {
    LabeledContent("Card number") {
      HStack(spacing: 10) {
        let saved = entry?.last4 ?? ""
        TextField("Card number", text: $draft.number, prompt: Text(saved.isEmpty ? String(localized: "Required") : "•••• \(saved)"))
          .multilineTextAlignment(.trailing)
          .keyboardType(.numberPad)
          .textContentType(.creditCardNumber)
          .monospacedDigit()
        let brand = draft.number.isEmpty ? (entry?.brand ?? "") : CardNumber.brand(draft.number)
        if !brand.isEmpty { PaymentMark(brand: brand).scaleEffect(0.66).frame(width: 29, height: 20) }
        if entry != nil {
          Button { Task { await revealCard() } } label: {
            Image(systemName: showsPassword ? "eye.slash" : "eye").font(.system(size: 15)).foregroundStyle(Ink.secondary)
          }
          .buttonStyle(.borderless)
          .accessibilityLabel(showsPassword ? "Hide Card" : "Show Card")
        }
      }
    }
  }

  /** The security code: dots until shown, as the password's. */
  private var securityCodeRow: some View {
    LabeledContent("Security code") {
      Group {
        let hidden = entry?.hasSecurityCode == true && !passwordRead
        if showsPassword {
          TextField("Security code", text: $draft.securityCode, prompt: Text("123"))
        } else {
          SecureField("Security code", text: $draft.securityCode, prompt: Text(hidden ? "•••" : "123"))
        }
      }
      .multilineTextAlignment(.trailing)
      .keyboardType(.numberPad)
      .monospacedDigit()
    }
  }

  private func revealCard() async {
    if showsPassword { showsPassword = false; return }
    guard let entry, !passwordRead else { showsPassword = true; return }
    guard await PurchaseApproval.confirm(reason: String(localized: "Show the card \(entry.title)")) != nil else { return }
    do {
      let secrets = try await model.cardSecrets(of: entry)
      if draft.number.isEmpty { draft.number = secrets.number }
      if draft.securityCode.isEmpty { draft.securityCode = secrets.securityCode }
      opened.number = secrets.number
      opened.securityCode = secrets.securityCode
      passwordRead = true
      showsPassword = true
    } catch {
      problem = error.localizedDescription
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
    if let found = draft.problem { problem = found; Haptics.tap(); return }
    saving = true
    let saved = await model.save(draft, editing: entry.map { (entry: $0, opened: opened, passwordRead: passwordRead) })
    saving = false
    guard let saved else { problem = model.problem; Haptics.tap(); return }
    Haptics.press()
    if entry == nil {
      onSaved?(saved)
      dismiss()
    } else {
      // Stays open on the entry as saved, as Settings' pages do; a password just typed is known now.
      let typed = draft.password
      let known = passwordRead || !typed.isEmpty
      let cardKnown = passwordRead || !draft.number.isEmpty
      let now = CredentialDraft(saved, password: known ? typed : "", number: cardKnown ? draft.number : "", securityCode: cardKnown ? draft.securityCode : "")
      entry = saved
      draft = now
      opened = now
      passwordRead = isCard ? cardKnown : known
      problem = nil
    }
  }
}

/** A row with a field: its label on the left, kept once it is filled, and what is typed on the right. */
private struct CredentialField: View {
  let label: String
  @Binding var text: String
  let prompt: String

  var body: some View {
    LabeledContent(label) {
      TextField(label, text: $text, prompt: Text(prompt))
        .multilineTextAlignment(.trailing)
    }
  }
}
