import Foundation

/**
 * The in-chat form (28 October 2026), as the upstream app's own card rules
 * describe it: a page on the agent's computer needs the person to type
 * something (a sign-in, a one-time code, an address), and the agent asks
 * for it here instead of in the chat (`request_user_form`, the host's
 * `shared/node/user-form/user-form.ts`). Fill sends the values to the
 * computer (`submitUserForm`), which types them into the page; the agent
 * learns only which fields went in, and the card shows the same. The X is
 * a decline (`dismissUserForm`). What the person typed is never kept here.
 *
 * The message (`send-message` of type `user-form`) carries the form; the
 * entry carries where it stands (`formState`, `formOutcomes`, `formNote`),
 * which the host stamps.
 */
public struct UserFormCard: Hashable, Sendable {
  public enum State: String, Sendable { case open, filling, filled, failed, dismissed }

  public enum Kind: String, Sendable { case text, email, tel, password, otp, number, date, select, textarea, checkbox }

  /** How one field went: typed in, couldn't be, or left empty. */
  public enum Outcome: String, Sendable { case filled, fillFailed, notFilled }

  public struct Option: Hashable, Sendable {
    public let label: String
    public let value: String
  }

  public struct Field: Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let kind: Kind
    /** Masked: always a password or a code. */
    public let secret: Bool
    public let required: Bool
    public let placeholder: String?
    public let options: [Option]

    public init(id: String, label: String, kind: Kind, secret: Bool = false, required: Bool = true, placeholder: String? = nil, options: [Option] = []) {
      self.id = id; self.label = label; self.kind = kind
      self.secret = secret || kind == .password || kind == .otp
      self.required = required && kind != .checkbox
      self.placeholder = placeholder; self.options = options
    }
  }

  public let title: String
  public let instruction: String
  /** The site it is typed into: "acme.com". */
  public let domain: String
  /** Enter is pressed once it is in (a lone one-time code). */
  public let submitsAfterFill: Bool
  public let fields: [Field]
  public let state: State
  public let outcomes: [String: Outcome]
  /** Why it couldn't be typed in, in the person's language. */
  public let note: String?

  public init(title: String, instruction: String, domain: String, submitsAfterFill: Bool = false, fields: [Field], state: State = .open, outcomes: [String: Outcome] = [:], note: String? = nil) {
    self.title = title; self.instruction = instruction; self.domain = domain; self.submitsAfterFill = submitsAfterFill
    self.fields = fields; self.state = state; self.outcomes = outcomes; self.note = note
  }

  init?(message: JSON, entry: Entry) {
    guard let form = message["form"], form.object != nil else { return nil }
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let title = text(form["title"])
    let domain = text(form["domain"])
    let fields: [Field] = (form["fields"]?.array ?? []).compactMap { field in
      let id = text(field["id"])
      let label = text(field["label"])
      guard !id.isEmpty, !label.isEmpty, let kind = Kind(rawValue: text(field["type"])) else { return nil }
      let options = (field["options"]?.array ?? []).compactMap { option -> Option? in
        let label = text(option["label"])
        guard !label.isEmpty else { return nil }
        let value = text(option["value"])
        return Option(label: label, value: value.isEmpty ? label : value)
      }
      let placeholder = text(field["placeholder"])
      return Field(id: id, label: label, kind: kind, secret: field["secret"]?.bool ?? false, required: field["required"]?.bool ?? true,
                   placeholder: placeholder.isEmpty ? nil : placeholder, options: options)
    }
    guard !title.isEmpty, !domain.isEmpty, !fields.isEmpty else { return nil }
    self.title = title
    self.instruction = text(form["instruction"])
    self.domain = domain
    self.submitsAfterFill = form["submitAfterFill"]?.bool ?? false
    self.fields = fields
    self.state = State(rawValue: text(entry["formState"])) ?? .open
    var outcomes: [String: Outcome] = [:]
    for (id, value) in entry["formOutcomes"]?.object ?? [:] { if let outcome = value.text.flatMap(Outcome.init(rawValue:)) { outcomes[id] = outcome } }
    self.outcomes = outcomes
    let note = text(entry["formNote"])
    self.note = note.isEmpty ? nil : note
  }

  /** Fill is pressed only once every field it needs has something in it. */
  public func canFill(_ values: [String: String]) -> Bool {
    fields.allSatisfy { !$0.required || !(values[$0.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
  }

  /** What is sent: the form's own fields only, a checkbox as "true" or "false". */
  public func values(_ typed: [String: String]) -> JSON {
    var out: [String: JSON] = [:]
    for field in fields {
      let value = typed[field.id] ?? ""
      out[field.id] = .string(field.kind == .checkbox ? (value == "true" ? "true" : "false") : value)
    }
    return .object(out)
  }

  /** The pill once it is answered: Filled, Partly filled, Not filled, Dismissed; "Filling in…" while it is typed. */
  public var statusLine: String? {
    switch state {
    case .open: return nil
    case .filling: return L10n.text("Filling in…")
    case .dismissed: return L10n.text("Dismissed")
    case .failed: return L10n.text("Not filled")
    case .filled:
      return fields.contains(where: { outcomes[$0.id] == .fillFailed }) ? L10n.text("Partly filled") : L10n.text("Filled")
    }
  }

  /** One field's line once it is answered: "Typed in", "Couldn't type it in" or "Left empty". */
  public func outcomeLine(_ field: Field) -> String? {
    switch outcomes[field.id] {
    case .filled: return L10n.text("Typed in")
    case .fillFailed: return L10n.text("Couldn't type it in")
    case .notFilled: return L10n.text("Left empty")
    case nil: return nil
    }
  }
}
