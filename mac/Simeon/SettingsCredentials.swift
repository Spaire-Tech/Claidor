import AppKit
import SwiftUI
import SimeonCore

// MARK: - Credentials Store

/**
 * Credentials Store (the iPhone's CredentialsStorePage; the founder, 28
 * October 2026: "use our existing design and for whatever saved, have the
 * favicon be there"; 29 October: "name it Credentials Store"): what
 * it is for in a line, as Wallet's page; then Logins, each its site's icon
 * (28), its name over its username; Cards (9 November 2026, the founder:
 * "actual cards there that the agent can use to make payments"), each its
 * network's mark, its name over "•••• 4242 · 08/28"; Contact info. Each
 * group ends in its Add, in the link blue. A row opens its sheet.
 */
struct SettingsCredentialsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @State private var model: CredentialsStoreModel?
  @State private var editing: MacCredentialEdit?

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Logins, cards and details your agents use to sign in, sign up and pay for you.")
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
          SettingsGroup(title: String(localized: "Cards"), footer: String(localized: "Your agents pay with a card only after you approve. They never see its number or security code."), look: look) {
            ForEach(Array(model.cards.enumerated()), id: \.element.id) { index, entry in
              MacCredentialLine(entry: entry, divided: index > 0, look: look) { editing = .entry(entry) }
            }
            MacStoreAddRow(title: String(localized: "Add Card"), divided: !model.cards.isEmpty, look: look) { editing = .new(.card) }
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

/** What the sheet opens on: a new login, card or contact info (empty, or filled by the chat's store card), or a saved entry. */
enum MacCredentialEdit: Identifiable {
  case new(StoredCredential.Kind)
  case filled(CredentialDraft)
  case entry(StoredCredential)

  var id: String {
    switch self {
    case .new(let kind): "new-\(kind.rawValue)"
    case .filled(let draft): "filled-\(draft.kind.rawValue)"
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
      if entry.kind == .card {
        MacPaymentMark(brand: entry.brand, edge: look.ink.opacity(look.dark ? 0.16 : 0.12))
      } else {
        MacSiteIconTile(site: entry.iconSite, title: entry.title, contact: entry.kind == .contact, side: 28, look: look)
      }
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
  /** Told once it's saved (the chat's store card says Saved). */
  var onSaved: ((StoredCredential) -> Void)?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var entry: StoredCredential?
  @State private var draft: CredentialDraft
  @State private var opened: CredentialDraft
  @State private var passwordRead: Bool
  @State private var showsPassword: Bool
  /** A card's security code shown (its own eye: hidden until asked, even while it's typed). */
  @State private var showsCode = false
  /** The address sheet over this one, opened from Billing address. */
  @State private var addingAddress: CredentialDraft?
  /** The phone's country and the digits after its code, kept as "+33 6 12 34 56 78". */
  @State private var phoneCountry: String
  @State private var phoneNational: String
  @State private var saving = false
  @State private var problem: String?

  private var look: Look { Look(scheme) }
  private var isLogin: Bool { draft.kind == .login }
  private var isCard: Bool { draft.kind == .card }

  init(model: CredentialsStoreModel, edit: MacCredentialEdit, onSaved: ((StoredCredential) -> Void)? = nil) {
    self.model = model
    self.onSaved = onSaved
    let draft: CredentialDraft = switch edit {
    case .new(let kind): CredentialDraft(kind: kind)
    case .filled(let filled): filled
    case .entry(let saved): CredentialDraft(saved)
    }
    let phone = PhoneEntry.split(draft.phone, preferring: draft.country.isEmpty ? Countries.here : draft.country)
    _phoneCountry = State(initialValue: phone.country)
    _phoneNational = State(initialValue: phone.national)
    switch edit {
    case .new, .filled:
      var start = draft
      // A new contact info is in the person's own country until another is chosen.
      if start.kind == .contact, start.country.isEmpty { start.country = Countries.here }
      _entry = State(initialValue: nil)
      _draft = State(initialValue: start)
      _opened = State(initialValue: start)
      _passwordRead = State(initialValue: true)
      _showsPassword = State(initialValue: true)
    case .entry(let saved):
      let start = draft
      _entry = State(initialValue: saved)
      _draft = State(initialValue: start)
      _opened = State(initialValue: start)
      _passwordRead = State(initialValue: false)
      _showsPassword = State(initialValue: false)
    }
  }

  private var title: String {
    if let entry { return entry.title }
    switch draft.kind {
    case .login: return String(localized: "New Login")
    case .contact: return String(localized: "New Contact Info")
    case .card: return String(localized: "New Card")
    }
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
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 24) {
            if isLogin {
              SettingsGroup(look: look) {
                MacStoreTextRow(label: String(localized: "Website"), text: $draft.website, prompt: "acme.com", content: .URL, divided: false, look: look)
                MacStoreTextRow(label: String(localized: "Username or email"), text: $draft.username, content: .username, look: look)
                passwordRow
              }
            } else if isCard {
              SettingsGroup(look: look) {
                cardNumberRow
                SettingsLine(label: String(localized: "Expiry"), divided: true, look: look) {
                  MacStoreEntryBox(value: $draft.expiry, prompt: "MM/YY", kept: { CardNumber.typedExpiry(old: $0, new: $1) }, content: .creditCardExpiration,
                                   digits: true, ink: CardNumber.isExpired(draft.expiry) ? look.danger : nil, look: look) { EmptyView() }
                }
                securityCodeRow
                MacStoreTextRow(label: String(localized: "Name on card"), text: $draft.cardholder, content: .creditCardName, look: look)
              }
              billingGroup
            } else {
              SettingsGroup(look: look) {
                MacStoreTextRow(label: String(localized: "Full name"), text: $draft.fullName, content: .name, divided: false, look: look)
                MacStoreTextRow(label: String(localized: "Email"), text: $draft.email, prompt: "name@example.com", content: .emailAddress, look: look)
                phoneRow
              }
              // The country first: the rest of the address is written as it's written there.
              SettingsGroup(title: String(localized: "Address"), look: look) {
                SettingsMenu(
                  label: String(localized: "Country"),
                  options: MacCountries.all.map { (value: $0.code, label: "\($0.flag)  \($0.name)") },
                  value: draft.country,
                  shown: draft.country.isEmpty ? String(localized: "Choose") : nil,
                  look: look
                ) { draft.country = $0 }
                MacStoreTextRow(label: String(localized: "Address"), text: $draft.addressLine1, content: .streetAddressLine1, look: look)
                MacStoreTextRow(label: String(localized: "Address line 2"), text: $draft.addressLine2, content: .streetAddressLine2, look: look)
                MacStoreTextRow(label: String(localized: "City"), text: $draft.city, content: .addressCity, look: look)
                MacStoreTextRow(label: String(localized: "State or region"), text: $draft.region, content: .addressState, look: look)
                SettingsLine(label: String(localized: "Postal code"), divided: true, look: look) {
                  MacStoreEntryBox(value: $draft.postalCode, kept: { $1.uppercased() }, content: .postalCode, look: look) { EmptyView() }
                }
              }
            }
            // What the entry is called and when to use it, last (the founder, 9 November 2026).
            SettingsGroup(footer: entry?.savedBy.map { String(localized: "Saved by \($0) at a sign-up.") }, look: look) {
              MacStoreTextRow(label: String(localized: "Name"), text: $draft.name, divided: false, look: look)
              MacStoreTextRow(label: String(localized: "Hints"), text: $draft.hints, prompt: String(localized: "Tell Simeon when to use this entry"), grows: true, look: look)
            }
            if let problem {
              Text(problem)
                .font(PanelType.detail)
                .foregroundStyle(look.danger)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .id("problem")
            }
            if entry != nil {
              SettingsGroup(look: look) {
                SettingsActionRow(title: isLogin ? String(localized: "Delete Login") : isCard ? String(localized: "Delete Card") : String(localized: "Delete Contact Info"), destructive: true, look: look) { askToDelete() }
              }
            }
          }
          .padding(.horizontal, 32)
          .padding(.top, 8)
          .padding(.bottom, 24)
        }
        // What to fix is brought into view, never left under the fold.
        .onChange(of: problem) { _, now in
          if now != nil { withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("problem", anchor: .bottom) } }
        }
      }
      SheetWideButton(title: String(localized: "Save"), busy: saving, enabled: saving || !(draft.isEmpty || (entry != nil && draft == opened))) {
        Task { await save() }
      }
      .padding(.horizontal, 32)
      .padding(.top, 12)
      .padding(.bottom, 24)
    }
    .frame(width: 560, height: isLogin ? 560 : isCard ? 700 : 760)
    .background(look.groupedGround)
    .interactiveDismissDisabled(saving)
    .closesOnClickOutside { if !saving && draft == opened && addingAddress == nil { dismiss() } }
    .onChange(of: phoneCountry) { _, _ in writePhone() }
    .onChange(of: phoneNational) { _, _ in writePhone() }
    // A phone not written yet follows the address's country.
    .onChange(of: draft.country) { _, country in if phoneNational.isEmpty, !country.isEmpty { phoneCountry = country } }
    .sheet(isPresented: Binding(get: { addingAddress != nil }, set: { if !$0 { addingAddress = nil } })) {
      if let address = addingAddress {
        MacCredentialSheet(model: model, edit: .filled(address)) { saved in draft.billingId = saved.id }
      }
    }
  }

  /** The phone as it's kept: its country's code, then its digits as that country groups them. */
  private func writePhone() {
    let written = PhoneEntry.joined(country: phoneCountry, national: phoneNational)
    if written != draft.phone { draft.phone = written }
  }

  /**
   * The billing address: one of the person's contact info, by its address,
   * or a new one written here (the founder, 10 November 2026: "billing
   * adress doesnt work. it stays at none": with no address saved there was
   * nothing to choose). Add Address opens the contact info's sheet over
   * this one, the name on the card already in it, and the address saved
   * there is the card's.
   */
  private var billingGroup: some View {
    let addresses = model.contacts.filter { !$0.addressLine.isEmpty }
    let chosen = addresses.first { $0.id == draft.billingId }
    return SettingsGroup(footer: String(localized: "The address your bank has for this card."), look: look) {
      SettingsLine(label: String(localized: "Billing address"), look: look) {
        if addresses.isEmpty {
          SettingsPill(title: String(localized: "Add Address"), look: look) { addAddress() }
        } else {
          Menu {
            Toggle(String(localized: "None"), isOn: Binding(get: { chosen == nil }, set: { _ in draft.billingId = "" }))
            ForEach(addresses) { contact in
              Toggle(isOn: Binding(get: { contact.id == draft.billingId }, set: { _ in draft.billingId = contact.id })) {
                Text(verbatim: "\(contact.title) · \(contact.addressLine)")
              }
            }
            Divider()
            Button(String(localized: "Add Address…")) { addAddress() }
          } label: {
            SettingsMenuLabel(text: chosen.map { "\($0.title) · \($0.addressLine1.isEmpty ? $0.city : $0.addressLine1)" } ?? String(localized: "None"), look: look)
          }
          .menuStyle(.button)
          .buttonStyle(.borderless)
          .menuIndicator(.hidden)
          .fixedSize()
          .handCursor()
          .accessibilityLabel(String(localized: "Billing address"))
        }
      }
    }
  }

  private func addAddress() {
    var address = CredentialDraft(kind: .contact)
    address.fullName = draft.cardholder.trimmingCharacters(in: .whitespaces)
    address.country = Countries.here
    addingAddress = address
  }

  /** The phone: its country's flag and code in a menu, then the number grouped as that country writes it. */
  private var phoneRow: some View {
    SettingsLine(label: String(localized: "Phone"), divided: true, look: look) {
      MacStoreEntryBox(
        value: $phoneNational,
        prompt: PhoneEntry.formatted(phoneCountry == "US" || phoneCountry == "CA" ? "4155550132" : "612345678", country: phoneCountry),
        shown: { PhoneEntry.formatted($0, country: phoneCountry) },
        kept: { PhoneEntry.national(TypedDigits.of(before: $0, after: $1), country: phoneCountry) },
        content: .telephoneNumber,
        digits: true,
        look: look
      ) {
        EmptyView()
      } leading: {
        Menu {
          ForEach(MacCountries.all) { country in
            Button { phoneCountry = country.code } label: { Text(verbatim: "\(country.flag)  \(country.name)  \(country.dialLabel)") }
          }
        } label: {
          HStack(spacing: 4) {
            Text(verbatim: Countries.flag(phoneCountry)).font(.system(size: 14))
            Text(verbatim: Countries.country(phoneCountry)?.dialLabel ?? "+").font(PanelType.row.monospacedDigit()).foregroundStyle(look.ink)
            Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold)).foregroundStyle(look.inkTertiary)
          }
          .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .menuIndicator(.hidden)
        .fixedSize()
        .handCursor()
        .help(String(localized: "Country code"))
        .accessibilityLabel(String(localized: "Country code"))
        Rectangle().fill(look.ink.opacity(0.12)).frame(width: 1, height: 16)
      }
    }
  }

  /** The password: dots, or the words once shown, in the rows' box; a saved one is read only after Touch ID. */
  private var passwordRow: some View {
    SettingsLine(label: String(localized: "Password"), divided: true, look: look) {
      HStack(spacing: 8) {
        Group {
          let hidden = entry?.hasPassword == true && !passwordRead
          if showsPassword {
            TextField("Password", text: $draft.password)
          } else {
            SecureField("Password", text: $draft.password, prompt: hidden ? Text("••••••••").foregroundStyle(look.inkTertiary) : nil)
          }
        }
        .textFieldStyle(.plain)
        .labelsHidden()
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .textContentType(.password)
        Button { Task { await togglePassword() } } label: {
          Image(systemName: showsPassword ? "eye.slash" : "eye").font(.system(size: 13)).foregroundStyle(look.inkSecondary)
        }
        .buttonStyle(.hand)
        .help(showsPassword ? String(localized: "Hide Password") : String(localized: "Show Password"))
      }
      .storeBox(width: MacStoreTextRow.width, focused: false, look: look)
    }
  }

  /**
   * A card's number: digits only, grouped as the card prints them while
   * they're typed (4242 4242 4242 4242), its network's mark at the end as
   * soon as the first digits name it, red once it's whole and can't be a
   * card's. A saved one shows its last four until the eye is pressed and
   * Touch ID allows it.
   */
  private var cardNumberRow: some View {
    SettingsLine(label: String(localized: "Card number"), divided: false, look: look) {
      let saved = entry?.last4 ?? ""
      let brand = draft.number.isEmpty ? (entry?.brand ?? "") : CardNumber.brand(draft.number)
      let whole = draft.number.count == CardNumber.maxDigits(brand)
      MacStoreEntryBox(
        value: $draft.number,
        prompt: saved.isEmpty ? "1234 5678 9012 3456" : "•••• \(saved)",
        shown: CardNumber.grouped,
        kept: { CardNumber.typed(TypedDigits.of(before: $0, after: $1)) },
        secure: entry != nil && passwordRead && !showsPassword,
        content: .creditCardNumber,
        digits: true,
        ink: whole && !CardNumber.isValid(draft.number) ? look.danger : nil,
        look: look
      ) {
        if !brand.isEmpty {
          MacPaymentMark(brand: brand, edge: look.ink.opacity(look.dark ? 0.16 : 0.12)).scaleEffect(0.7).frame(width: 28, height: 19)
            .transition(.opacity)
        }
        if entry != nil {
          eye(shown: showsPassword, show: String(localized: "Show Card"), hide: String(localized: "Hide Card")) { Task { await revealCard() } }
        }
      }
      .animation(.easeOut(duration: 0.15), value: brand)
    }
  }

  /** The security code: digits only, as many as the card's (4 on American Express), hidden until its eye is pressed. */
  private var securityCodeRow: some View {
    SettingsLine(label: String(localized: "Security code"), divided: true, look: look) {
      let brand = draft.number.isEmpty ? (entry?.brand ?? "") : CardNumber.brand(draft.number)
      let hidden = entry?.hasSecurityCode == true && !passwordRead
      MacStoreEntryBox(
        value: $draft.securityCode,
        prompt: hidden ? "•••" : brand == "amex" ? "1234" : "123",
        kept: { CardNumber.typedCode($1, brand: brand) },
        secure: !showsCode,
        content: .creditCardSecurityCode,
        digits: true,
        look: look
      ) {
        eye(shown: showsCode, show: String(localized: "Show Security Code"), hide: String(localized: "Hide Security Code")) { Task { await toggleCode() } }
      }
    }
  }

  /** The eye at a hidden field's end: shows it, or hides it again. */
  private func eye(shown: Bool, show: String, hide: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: shown ? "eye.slash" : "eye").font(.system(size: 13)).foregroundStyle(look.inkSecondary).frame(width: 18)
    }
    .buttonStyle(.hand)
    .help(shown ? hide : show)
    .accessibilityLabel(shown ? hide : show)
  }

  /** The code shown; a saved card's is read first, after Touch ID. */
  private func toggleCode() async {
    if showsCode { showsCode = false; return }
    if entry?.hasSecurityCode == true, !passwordRead {
      await revealCard()
      guard passwordRead else { return }
    }
    showsCode = true
  }

  private func revealCard() async {
    if showsPassword { showsPassword = false; return }
    guard let entry, !passwordRead else { showsPassword = true; return }
    guard await PurchaseApproval.confirm(reason: String(localized: "Show the card \(entry.title)")) != nil else { return }
    do {
      let secrets = try await model.cardSecrets(of: entry)
      // What was typed before it was read is kept; the rest is the saved card.
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
    if let found = draft.problem { problem = found; NSSound.beep(); return }
    saving = true
    let saved = await model.save(draft, editing: entry.map { (entry: $0, opened: opened, passwordRead: passwordRead) })
    saving = false
    guard let saved else { problem = model.problem; NSSound.beep(); return }
    onSaved?(saved)
    dismiss()
  }

  private func askToDelete() {
    guard let entry else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = isLogin ? String(localized: "Delete this login?") : isCard ? String(localized: "Delete this card?") : String(localized: "Delete this contact info?")
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

/** Every country with its flag and phone code, by its name in the person's language, read once. */
enum MacCountries {
  static let all = Countries.all()
}

/**
 * A field in the rows' box that writes what's typed as it should be (the
 * founder, 10 November 2026: "Help the user. dont confuse him"): a card's
 * number in its groups, its expiry with its slash, a phone in its country's
 * groups, a postal code in capitals. What's kept (`value`) and what's shown
 * (`shown(value)`) are apart; every keystroke, what's kept is read from the
 * field (`kept(before, after)`) and the field written again from it, so a
 * letter in a card's number never stays. `secure` shows dots (a security
 * code until its eye is pressed); `ink` colours what's typed (red once a
 * card's number is whole and can't be one). What leads the field (a phone's
 * country) and ends it (a card's mark, the eye) sit in the box with it.
 */
private struct MacStoreEntryBox<Accessory: View, Leading: View>: View {
  @Binding var value: String
  let prompt: String?
  let shown: (String) -> String
  let kept: (_ before: String, _ after: String) -> String
  let secure: Bool
  let content: NSTextContentType?
  let digits: Bool
  let ink: Color?
  let width: CGFloat?
  let look: Look
  let accessory: () -> Accessory
  let leading: () -> Leading
  @State private var text = ""
  @FocusState private var focused: Bool

  init(
    value: Binding<String>, prompt: String? = nil, shown: @escaping (String) -> String = { $0 },
    kept: @escaping (_ before: String, _ after: String) -> String = { $1 }, secure: Bool = false, content: NSTextContentType? = nil,
    digits: Bool = false, ink: Color? = nil, width: CGFloat? = MacStoreTextRow.width, look: Look,
    @ViewBuilder accessory: @escaping () -> Accessory, @ViewBuilder leading: @escaping () -> Leading
  ) {
    _value = value
    self.prompt = prompt
    self.shown = shown
    self.kept = kept
    self.secure = secure
    self.content = content
    self.digits = digits
    self.ink = ink
    self.width = width
    self.look = look
    self.accessory = accessory
    self.leading = leading
  }

  var body: some View {
    HStack(spacing: 8) {
      leading()
      Group {
        let prompted = prompt.map { Text($0).foregroundStyle(look.inkTertiary) }
        if secure {
          SecureField("", text: $text, prompt: prompted)
        } else {
          TextField("", text: $text, prompt: prompted)
        }
      }
      .textFieldStyle(.plain)
      .labelsHidden()
      .font(digits ? PanelType.row.monospacedDigit() : PanelType.row)
      .foregroundStyle(ink ?? look.ink)
      .textContentType(content)
      .focused($focused)
      .frame(maxWidth: .infinity, alignment: .leading)
      accessory()
    }
    .storeBox(width: width, focused: focused, look: look)
    .onAppear { text = shown(value) }
    .onChange(of: text) { before, after in
      let keep = kept(before, after)
      let show = shown(keep)
      if show != after { text = show }
      if keep != value { value = keep }
    }
    // Written from elsewhere (a saved card read after Touch ID): shown as it should be.
    .onChange(of: value) { _, now in
      if kept(text, text) != now { text = shown(now) }
    }
  }
}

extension MacStoreEntryBox where Leading == EmptyView {
  init(
    value: Binding<String>, prompt: String? = nil, shown: @escaping (String) -> String = { $0 },
    kept: @escaping (_ before: String, _ after: String) -> String = { $1 }, secure: Bool = false, content: NSTextContentType? = nil,
    digits: Bool = false, ink: Color? = nil, width: CGFloat? = MacStoreTextRow.width, look: Look,
    @ViewBuilder accessory: @escaping () -> Accessory
  ) {
    self.init(value: value, prompt: prompt, shown: shown, kept: kept, secure: secure, content: content, digits: digits, ink: ink, width: width, look: look,
              accessory: accessory, leading: { EmptyView() })
  }
}

/**
 * A row with a field: the label on the left, its box on the right (the
 * Account page's Name box: the page's ground, 8 round, a line of the ink at
 * 10%, 25% while it has the keys), so where to type is plain without
 * "Optional" in every row (the founder, 9 November 2026: "very confusing").
 */
private struct MacStoreTextRow: View {
  static let width: CGFloat = 280

  let label: String
  @Binding var text: String
  var prompt: String? = nil
  var content: NSTextContentType? = nil
  var grows = false
  var divided = true
  let look: Look
  @FocusState private var focused: Bool

  var body: some View {
    SettingsLine(label: label, divided: divided, look: look) {
      Group {
        if grows {
          TextField(label, text: $text, prompt: prompt.map { Text($0).foregroundStyle(look.inkTertiary) }, axis: .vertical)
            .lineLimit(1...5)
        } else {
          TextField(label, text: $text, prompt: prompt.map { Text($0).foregroundStyle(look.inkTertiary) })
        }
      }
      .textFieldStyle(.plain)
      .labelsHidden()
      .font(PanelType.row)
      .foregroundStyle(look.ink)
      .textContentType(content)
      .focused($focused)
      .storeBox(width: Self.width, focused: focused, look: look)
    }
  }
}

extension View {
  /** The rows' box, as the Account page's Name field (`width` nil: as wide as it's given). */
  func storeBox(width: CGFloat?, focused: Bool, look: Look) -> some View {
    padding(.horizontal, 10)
      .padding(.vertical, 6)
      .frame(width: width, alignment: .leading)
      .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
      .frame(minHeight: 30)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(focused ? 0.25 : 0.1), lineWidth: 1))
  }
}
