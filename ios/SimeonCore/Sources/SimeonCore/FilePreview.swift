import Foundation

/**
 * What the window's file preview does with a file, ported from its own code
 * (`file-preview-kind.ts`, `media-extensions.ts`, `attachment-preview.ts`,
 * and the shipped window's table, JSON and picture viewers), with tests
 * made by running the window's functions (Fixtures/file-preview.json).
 */
public enum FilePreview {
  /** How a file opens (`getFilePreviewKind`). */
  public enum Kind: String, Sendable, CaseIterable {
    case image, video, audio, pdf, table, json, markdown, docx, text, unknown
  }

  /** The most the preview reads of a file (`ATTACHMENT_PREVIEW_BYTE_CAP`): larger shows "too large". */
  public static let byteCap = 25 * 1024 * 1024
  /** The most of a text file shown (`ETe`, in UTF-16 units); the header then says "Showing the start of this file". */
  public static let textCap = 1_500_000
  /** A spreadsheet's rows and columns shown (`gvn`, `yvn`). */
  public static let tableRows = 2000
  public static let tableColumns = 200
  /** A JSON object's or list's entries shown before "… N more" (`Lkn`). */
  public static let jsonEntries = 200

  static let images: Set<String> = ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]
  static let videos: Set<String> = ["m4v", "mov", "mp4", "ogv", "webm"]
  static let audio: Set<String> = ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"]
  static let tables: Set<String> = ["csv", "tsv", "xlsx", "xls"]
  static let markdown: Set<String> = ["md", "markdown", "mdx"]
  static let texts: Set<String> = [
    "txt", "text", "log", "md", "markdown", "mdx", "rst", "adoc", "tex", "json", "jsonc", "json5", "ndjson", "csv", "tsv",
    "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "plist", "gradle", "html", "htm", "css", "scss",
    "sass", "less", "svg", "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "py", "pyi", "rb", "go", "rs", "java", "kt",
    "kts", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "php", "swift", "scala", "dart", "lua", "pl", "pm", "r", "sql",
    "graphql", "gql", "proto", "vue", "svelte", "astro", "sh", "bash", "zsh", "fish", "bat", "ps1", "tf", "tfvars",
    "dockerfile", "diff", "patch",
  ]
  /** The language highlight.js colours a file in (`Awn`). */
  static let languages: [String: String] = [
    "js": "javascript", "mjs": "javascript", "cjs": "javascript", "jsx": "javascript", "ts": "typescript", "mts": "typescript",
    "cts": "typescript", "tsx": "typescript", "py": "python", "pyi": "python", "rb": "ruby", "go": "go", "rs": "rust",
    "java": "java", "kt": "kotlin", "kts": "kotlin", "c": "c", "h": "c", "cc": "cpp", "cpp": "cpp", "cxx": "cpp", "hpp": "cpp",
    "hh": "cpp", "cs": "csharp", "php": "php", "swift": "swift", "scala": "scala", "dart": "dart", "lua": "lua", "pl": "perl",
    "pm": "perl", "r": "r", "sql": "sql", "graphql": "graphql", "gql": "graphql", "proto": "protobuf", "json": "json",
    "jsonc": "json", "json5": "json", "ndjson": "json", "yaml": "yaml", "yml": "yaml", "toml": "ini", "ini": "ini", "cfg": "ini",
    "conf": "ini", "properties": "properties", "xml": "xml", "html": "xml", "htm": "xml", "svg": "xml", "css": "css",
    "scss": "scss", "sass": "scss", "less": "less", "vue": "xml", "sh": "bash", "bash": "bash", "zsh": "bash", "fish": "bash",
    "bat": "dos", "ps1": "powershell", "tf": "terraform", "tfvars": "terraform", "dockerfile": "dockerfile", "diff": "diff",
    "patch": "diff",
  ]

  /** A name's extension in lower case, nil for none (`attachmentExtension`: the last dot of the last part, not first or last). */
  public static func fileExtension(_ nameOrPath: String) -> String? {
    let base = nameOrPath.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? ""
    guard let dot = base.lastIndex(of: "."), dot != base.startIndex, base.index(after: dot) != base.endIndex else { return nil }
    return String(base[base.index(after: dot)...]).lowercased()
  }

  public static func kind(_ nameOrPath: String) -> Kind {
    guard let ext = fileExtension(nameOrPath) else { return .unknown }
    if images.contains(ext) { return .image }
    if videos.contains(ext) { return .video }
    if audio.contains(ext) { return .audio }
    if ext == "pdf" { return .pdf }
    if tables.contains(ext) { return .table }
    if ext == "json" { return .json }
    if markdown.contains(ext) { return .markdown }
    if ext == "docx" { return .docx }
    if texts.contains(ext) { return .text }
    return .unknown
  }

  /** The highlight.js language for a file, nil to show it plain (`Pwn`). */
  public static func language(_ nameOrPath: String) -> String? {
    fileExtension(nameOrPath).flatMap { languages[$0] }
  }

  /**
   * Whether a file card opens a preview (`Nvn`'s `B`): never for an unknown
   * kind; text, Markdown and JSON only once the computer has read them as
   * text (`readsAsText`, nil until it answers).
   */
  public static func opens(_ kind: Kind, readsAsText: Bool?) -> Bool {
    switch kind {
    case .unknown: return false
    case .text, .markdown, .json: return readsAsText == true
    default: return true
    }
  }

  /** "Launch review" and ".docx" (`Nft`): no extension for a leading or trailing dot. */
  public static func split(_ name: String) -> (base: String, ext: String) {
    guard let dot = name.lastIndex(of: "."), dot != name.startIndex, name.index(after: dot) != name.endIndex else { return (name, "") }
    return (String(name[..<dot]), String(name[dot...]))
  }

  /** The last part of a path or address, `%20` read as a space (`R5e`). */
  public static func lastPart(_ source: String) -> String {
    var path = source
    if let url = URL(string: source), url.scheme != nil { path = url.path.isEmpty ? source : url.path }
    path = path.removingPercentEncoding ?? path
    return path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? source
  }

  // MARK: The picture viewer

  /** Its caption (`c7n`): the caption or the file's name, then "2 / 3" when there are several. */
  public static func mediaCaption(caption: String?, name: String?, source: String, index: Int, total: Int) -> String {
    let words = caption ?? name ?? lastPart(source)
    let count = total > 1 ? "\(index + 1) / \(total)" : ""
    if words.isEmpty { return count }
    return count.isEmpty ? words : "\(words) · \(count)"
  }

  /** Previous and next wrap round (`ove`). */
  public static func wrap(_ index: Int, count: Int) -> Int {
    count > 0 ? ((index % count) + count) % count : 0
  }

  // MARK: Spreadsheets (csv and tsv)

  /** The separator a file's first line uses most (`uvn`): the file's own (tab for .tsv), or a comma, tab, semicolon or bar. */
  public static func delimiter(_ text: String, name: String) -> Character {
    let preferred: Character = fileExtension(name) == "tsv" ? "\t" : ","
    let first = firstLine(text)
    var best = preferred
    var most = -1
    for candidate in [preferred, ",", "\t", ";", "|"] as [Character] {
      let count = separators(first, candidate)
      if count > most { best = candidate; most = count }
    }
    return most > 0 ? best : preferred
  }

  /** The first line with anything in it, lines split at "\n" with a "\r" before it dropped (`split(/\r?\n/)`). */
  static func firstLine(_ text: String) -> String {
    var line = String.UnicodeScalarView()
    for scalar in text.unicodeScalars {
      if scalar == "\n" {
        if line.last == "\r" { line.removeLast() }
        if !line.isEmpty { return String(line) }
        line = String.UnicodeScalarView()
      } else {
        line.append(scalar)
      }
    }
    return String(line)
  }

  static func separators(_ line: String, _ separator: Character) -> Int {
    let scalars = Array(line.unicodeScalars)
    let mark = separator.unicodeScalars.first!
    var count = 0
    var quoted = false
    var index = 0
    while index < scalars.count {
      let scalar = scalars[index]
      if scalar == "\"" {
        if quoted, index + 1 < scalars.count, scalars[index + 1] == "\"" { index += 2; continue }
        quoted.toggle()
      } else if !quoted, scalar == mark {
        count += 1
      }
      index += 1
    }
    return count
  }

  /** The rows of a CSV (`lvn`): quotes, doubled quotes, and line ends of either kind; at most `maxRows`. */
  public static func rows(_ text: String, delimiter: Character, maxRows: Int = .max) -> [[String]] {
    let scalars = Array(text.unicodeScalars)
    let mark = delimiter.unicodeScalars.first!
    var rows: [[String]] = []
    var cell = String.UnicodeScalarView()
    var row: [String] = []
    var quoted = false
    var started = false
    func endCell() { row.append(String(cell)); cell = String.UnicodeScalarView() }
    func endRow() { endCell(); rows.append(row); row = []; started = false }
    var index = 0
    while index < scalars.count, rows.count < maxRows {
      let scalar = scalars[index]
      if quoted {
        if scalar == "\"" {
          if index + 1 < scalars.count, scalars[index + 1] == "\"" { cell.append("\""); index += 1 } else { quoted = false }
        } else {
          cell.append(scalar)
        }
      } else if scalar == "\"" {
        quoted = true; started = true
      } else if scalar == mark {
        started = true; endCell()
      } else if scalar == "\n" {
        endRow()
      } else if scalar == "\r" {
        if index + 1 < scalars.count, scalars[index + 1] == "\n" { index += 1 }
        endRow()
      } else {
        cell.append(scalar); started = true
      }
      index += 1
    }
    if rows.count < maxRows, started || !cell.isEmpty || !row.isEmpty { endRow() }
    return rows
  }

  /** How many rows the whole file has, its heading row included (`cvn`). */
  public static func rowCount(_ text: String) -> Int {
    var count = 0
    var quoted = false
    var pending = false
    let scalars = Array(text.unicodeScalars)
    var index = 0
    while index < scalars.count {
      let scalar = scalars[index]
      if scalar == "\"" {
        if quoted, index + 1 < scalars.count, scalars[index + 1] == "\"" { index += 2; continue }
        quoted.toggle(); pending = true
      } else if !quoted, scalar == "\n" || scalar == "\r" {
        if scalar == "\r", index + 1 < scalars.count, scalars[index + 1] == "\n" { index += 1 }
        count += 1; pending = false
      } else {
        pending = true
      }
      index += 1
    }
    return pending ? count + 1 : count
  }

  /** A sheet read for the preview (`mvn`): its first rows, and how many it has. */
  public struct Sheet: Equatable, Sendable {
    public let name: String
    public let rows: [[String]]
    public let totalRows: Int
  }

  public static func sheet(_ text: String, name: String) -> Sheet {
    let rows = rows(text, delimiter: delimiter(text, name: name), maxRows: tableRows)
    return Sheet(name: "Sheet 1", rows: rows, totalRows: rows.count < tableRows ? rows.count : rowCount(text))
  }

  /** "3 rows", "1 row", "1,204 rows" under the name: the rows less the heading row (`kvn`). */
  public static func rowsLine(_ totalRows: Int) -> String {
    let rows = max(0, totalRows - 1)
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = Locale(identifier: "en_US")
    return "\(formatter.string(from: NSNumber(value: rows)) ?? "\(rows)") \(rows == 1 ? "row" : "rows")"
  }

  /** A cell's detail heading (`wvn`): "Revenue · row 2", "Column 3 · header". */
  public static func cellLabel(column: Int, row: Int, heading: String) -> String {
    let name = heading.isEmpty ? "Column \(column + 1)" : heading
    return row < 0 ? "\(name) · header" : "\(name) · row \(row + 1)"
  }

  /** "2 pages", "1 page" (`evn`). */
  public static func pagesLine(_ pages: Int) -> String { "\(pages) \(pages == 1 ? "page" : "pages")" }

  // MARK: JSON

  /** An object's or list's size beside its name (`_kn`): "[2 items]", "{1 key}". */
  public static func jsonSummary(isList: Bool, count: Int) -> String {
    isList ? (count == 1 ? "[1 item]" : "[\(count) items]") : (count == 1 ? "{1 key}" : "{\(count) keys}")
  }
}

/**
 * A JSON file as the window's tree reads it (`JSON.parse`): objects keep
 * their names in JavaScript's order (whole-number names first, smallest
 * first, then the rest as written; a repeated name keeps its first place
 * and its last value), and every value prints as `JSON.stringify` prints it.
 */
public indirect enum JSONTree: Equatable, Sendable {
  case object([Member])
  case list([JSONTree])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  public struct Member: Equatable, Sendable {
    public let name: String
    public let value: JSONTree
  }

  /** nil when the text is not JSON (the preview then shows it as text). */
  public static func parse(_ text: String) -> JSONTree? {
    var reader = Reader(Array(text.unicodeScalars))
    reader.skipSpace()
    guard let value = reader.value() else { return nil }
    reader.skipSpace()
    return reader.atEnd ? value : nil
  }

  /** An object's or a list's entries, with a list's indexes as their names; nil for a single value. */
  public var entries: [Member]? {
    switch self {
    case .object(let members): return members
    case .list(let items): return items.enumerated().map { Member(name: String($0.offset), value: $0.element) }
    default: return nil
    }
  }

  public var isList: Bool { if case .list = self { return true }; return false }

  /** A single value as `JSON.stringify` writes it. */
  public var written: String {
    switch self {
    case .string(let words): return JSONTree.quoted(words)
    case .number(let number): return JSONTree.number(number)
    case .bool(let flag): return flag ? "true" : "false"
    case .null: return "null"
    case .object, .list: return ""
    }
  }

  /** A string with JavaScript's escapes. */
  static func quoted(_ words: String) -> String {
    var out = "\""
    for scalar in words.unicodeScalars {
      switch scalar {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\u{08}": out += "\\b"
      case "\u{0C}": out += "\\f"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if scalar.value < 0x20 {
          out += String(format: "\\u%04x", scalar.value)
        } else {
          out.unicodeScalars.append(scalar)
        }
      }
    }
    return out + "\""
  }

  /** A number as JavaScript writes it (`Number.prototype.toString`). */
  public static func number(_ value: Double) -> String {
    guard value.isFinite else { return "null" }
    if value == 0 { return "0" }
    let sign = value < 0 ? "-" : ""
    // Swift's description is the shortest that reads back the same; take its digits and where the point falls.
    let text = "\(abs(value))"
    let parts = text.split(separator: "e", maxSplits: 1)
    let mantissa = String(parts[0])
    let exponent = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
    let pieces = mantissa.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
    let whole = String(pieces[0])
    let fraction = pieces.count > 1 ? String(pieces[1]) : ""
    var digits = whole + fraction
    var point = whole.count + exponent
    while digits.hasPrefix("0") && digits.count > 1 { digits.removeFirst(); point -= 1 }
    while digits.hasSuffix("0") && digits.count > 1 { digits.removeLast() }
    let count = digits.count
    if count <= point && point <= 21 { return sign + digits + String(repeating: "0", count: point - count) }
    if 0 < point && point <= 21 {
      let cut = digits.index(digits.startIndex, offsetBy: point)
      return sign + digits[..<cut] + "." + digits[cut...]
    }
    if -6 < point && point <= 0 { return sign + "0." + String(repeating: "0", count: -point) + digits }
    let power = point - 1
    let first = String(digits.prefix(1))
    let rest = digits.dropFirst()
    return sign + first + (rest.isEmpty ? "" : "." + rest) + "e" + (power >= 0 ? "+" : "-") + String(abs(power))
  }

  /** A name JavaScript keeps as an array index (put first, in number order). */
  static func indexName(_ name: String) -> UInt32? {
    guard let first = name.unicodeScalars.first, name.unicodeScalars.allSatisfy({ ("0"..."9").contains($0) }) else { return nil }
    if first == "0" && name.count > 1 { return nil }
    guard let value = UInt64(name), value <= 4_294_967_294 else { return nil }
    return UInt32(value)
  }

  struct Reader {
    let scalars: [Unicode.Scalar]
    var index = 0
    var depth = 0

    init(_ scalars: [Unicode.Scalar]) { self.scalars = scalars }

    var atEnd: Bool { index >= scalars.count }

    mutating func skipSpace() {
      while index < scalars.count, [" ", "\t", "\n", "\r"].contains(scalars[index]) { index += 1 }
    }

    mutating func value() -> JSONTree? {
      guard index < scalars.count, depth < 512 else { return nil }
      switch scalars[index] {
      case "{": return object()
      case "[": return list()
      case "\"": return string().map(JSONTree.string)
      case "t": return word("true", .bool(true))
      case "f": return word("false", .bool(false))
      case "n": return word("null", .null)
      default: return number()
      }
    }

    mutating func word(_ text: String, _ value: JSONTree) -> JSONTree? {
      let wanted = Array(text.unicodeScalars)
      guard index + wanted.count <= scalars.count, Array(scalars[index..<index + wanted.count]) == wanted else { return nil }
      index += wanted.count
      return value
    }

    mutating func object() -> JSONTree? {
      index += 1
      depth += 1
      defer { depth -= 1 }
      var order: [String] = []
      var values: [String: JSONTree] = [:]
      skipSpace()
      if index < scalars.count, scalars[index] == "}" { index += 1; return .object([]) }
      while true {
        skipSpace()
        guard index < scalars.count, scalars[index] == "\"", let name = string() else { return nil }
        skipSpace()
        guard index < scalars.count, scalars[index] == ":" else { return nil }
        index += 1
        skipSpace()
        guard let item = value() else { return nil }
        if values[name] == nil { order.append(name) }
        values[name] = item
        skipSpace()
        guard index < scalars.count else { return nil }
        if scalars[index] == "," { index += 1; continue }
        if scalars[index] == "}" { index += 1; break }
        return nil
      }
      let indexed = order.compactMap { name in JSONTree.indexName(name).map { (name, $0) } }.sorted { $0.1 < $1.1 }.map(\.0)
      let named = order.filter { JSONTree.indexName($0) == nil }
      return .object((indexed + named).map { Member(name: $0, value: values[$0]!) })
    }

    mutating func list() -> JSONTree? {
      index += 1
      depth += 1
      defer { depth -= 1 }
      var items: [JSONTree] = []
      skipSpace()
      if index < scalars.count, scalars[index] == "]" { index += 1; return .list([]) }
      while true {
        skipSpace()
        guard let item = value() else { return nil }
        items.append(item)
        skipSpace()
        guard index < scalars.count else { return nil }
        if scalars[index] == "," { index += 1; continue }
        if scalars[index] == "]" { index += 1; break }
        return nil
      }
      return .list(items)
    }

    mutating func string() -> String? {
      index += 1
      var out = String.UnicodeScalarView()
      var pendingHigh: UInt32?
      while index < scalars.count {
        let scalar = scalars[index]
        index += 1
        if scalar == "\"" {
          if let high = pendingHigh { out.append(Unicode.Scalar(0xFFFD)!); _ = high }
          return String(out)
        }
        if scalar.value < 0x20 { return nil }
        if scalar != "\\" {
          if pendingHigh != nil { out.append(Unicode.Scalar(0xFFFD)!); pendingHigh = nil }
          out.append(scalar)
          continue
        }
        guard index < scalars.count else { return nil }
        let escape = scalars[index]
        index += 1
        var unit: UInt32?
        switch escape {
        case "\"": out.append("\""); case "\\": out.append("\\"); case "/": out.append("/")
        case "b": out.append("\u{08}"); case "f": out.append("\u{0C}"); case "n": out.append("\n")
        case "r": out.append("\r"); case "t": out.append("\t")
        case "u":
          guard index + 4 <= scalars.count, let code = UInt32(String(String.UnicodeScalarView(scalars[index..<index + 4])), radix: 16) else { return nil }
          index += 4
          unit = code
        default: return nil
        }
        guard let code = unit else {
          if pendingHigh != nil { out.append(Unicode.Scalar(0xFFFD)!); pendingHigh = nil }
          continue
        }
        if (0xD800...0xDBFF).contains(code) {
          if pendingHigh != nil { out.append(Unicode.Scalar(0xFFFD)!) }
          pendingHigh = code
        } else if (0xDC00...0xDFFF).contains(code), let high = pendingHigh {
          out.append(Unicode.Scalar(0x10000 + ((high - 0xD800) << 10) + (code - 0xDC00))!)
          pendingHigh = nil
        } else {
          if pendingHigh != nil { out.append(Unicode.Scalar(0xFFFD)!); pendingHigh = nil }
          out.append(Unicode.Scalar(code) ?? Unicode.Scalar(0xFFFD)!)
        }
      }
      return nil
    }

    mutating func number() -> JSONTree? {
      let start = index
      if index < scalars.count, scalars[index] == "-" { index += 1 }
      guard index < scalars.count, ("0"..."9").contains(scalars[index]) else { return nil }
      if scalars[index] == "0" { index += 1 } else { while index < scalars.count, ("0"..."9").contains(scalars[index]) { index += 1 } }
      if index < scalars.count, scalars[index] == "." {
        index += 1
        guard index < scalars.count, ("0"..."9").contains(scalars[index]) else { return nil }
        while index < scalars.count, ("0"..."9").contains(scalars[index]) { index += 1 }
      }
      if index < scalars.count, scalars[index] == "e" || scalars[index] == "E" {
        index += 1
        if index < scalars.count, scalars[index] == "+" || scalars[index] == "-" { index += 1 }
        guard index < scalars.count, ("0"..."9").contains(scalars[index]) else { return nil }
        while index < scalars.count, ("0"..."9").contains(scalars[index]) { index += 1 }
      }
      guard let number = Double(String(String.UnicodeScalarView(scalars[start..<index]))) else { return nil }
      return .number(number)
    }
  }
}
