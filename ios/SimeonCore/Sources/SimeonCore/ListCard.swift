import Foundation

/**
 * The list card (24 October 2026, the founder after a group's cost update
 * came as one long paragraph: "I'm thinking to have things like that come in
 * cards", with flights and shopping as the model). Three or more things of
 * one kind, a row each: its name, a grey line under it, a figure at its right
 * (money in blue, the currency too: "717–805 FCFA", "$500"; anything else,
 * "2 h", in the text's colour), a short tag ("à valider"), a picture of what
 * it is, and its page, which a tap opens. A title over the rows, a grey line
 * under the title. What is around the card (a caveat, what's missing) is the
 * agent's own messages, not the card's.
 *
 * The message (`send-message` of type `list`, the host's
 * `shared/list-card.ts`, posted by the agents' ShowList tool) carries the
 * rows, and its `content` the card in words for an app from before it.
 */
public struct ListCard: Hashable, Sendable {
  public struct Row: Hashable, Sendable, Identifiable {
    /** Its place on the card. */
    public let index: Int
    public var id: Int { index }
    public let title: String
    /** One grey line under the name. */
    public let detail: String?
    /** The figure at the right: "717–805 FCFA", "2 h". */
    public let value: String?
    /** The figure is money: drawn blue, its currency too. */
    public let isMoney: Bool
    public let tag: Tag?
    /** A picture of what it is: from its page (https), or kept on the computer (`file:`). */
    public let pictureURL: URL?
    /** Its page (https): a tap opens it. */
    public let url: URL?

    public init(index: Int, title: String, detail: String? = nil, value: String? = nil, isMoney: Bool = false, tag: Tag? = nil, pictureURL: URL? = nil, url: URL? = nil) {
      self.index = index; self.title = title; self.detail = detail
      self.value = value; self.isMoney = value != nil && isMoney
      self.tag = tag; self.pictureURL = pictureURL; self.url = url
    }
  }

  /** A word or two on a row ("à valider", "done"), in the colour of what it says. */
  public struct Tag: Hashable, Sendable {
    public let text: String
    public let tone: Tone
  }

  /** Grey; orange for something waiting or to check; green for done; red for a problem. */
  public enum Tone: String, Hashable, Sendable { case neutral, pending, done, problem }

  public let title: String
  public let subtitle: String?
  public let rows: [Row]

  public init(title: String, subtitle: String? = nil, rows: [Row]) {
    self.title = title; self.subtitle = subtitle; self.rows = rows
  }

  /** Rows with a picture are taller, and every row then keeps the picture's place. */
  public var hasPictures: Bool { rows.contains { $0.pictureURL != nil } }

  /** At most this many rows; the host's tool takes no more. */
  public static let maxRows = 8

  init?(message: JSON) {
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let page = { (value: JSON?) -> URL? in URL(string: text(value)).flatMap { $0.scheme == "https" ? $0 : nil } }
    let rows: [Row] = (message["items"]?.array ?? []).prefix(Self.maxRows).enumerated().compactMap { index, item in
      let title = text(item["title"])
      guard !title.isEmpty else { return nil }
      let detail = text(item["detail"]), amount = text(item["amount"]), value = text(item["value"]), tag = text(item["tag"])
      let picture = URL(string: text(item["imageUrl"])).flatMap { ["https", "file"].contains($0.scheme ?? "") ? $0 : nil }
      return Row(
        index: index, title: title,
        detail: detail.isEmpty ? nil : detail,
        value: amount.isEmpty ? (value.isEmpty ? nil : value) : amount,
        isMoney: !amount.isEmpty,
        tag: tag.isEmpty ? nil : Tag(text: tag, tone: Tone(rawValue: text(item["tone"])) ?? .neutral),
        pictureURL: picture, url: page(item["url"]))
    }
    let title = text(message["title"])
    guard !rows.isEmpty, !title.isEmpty else { return nil }
    let subtitle = text(message["subtitle"])
    self.init(title: title, subtitle: subtitle.isEmpty ? nil : subtitle, rows: rows)
  }
}
