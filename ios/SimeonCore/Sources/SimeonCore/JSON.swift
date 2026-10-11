import Foundation

/**
 * A JSON value. The host in the cloud computer sends the app open-ended
 * records (a chat entry carries whatever its kind needs, a card whatever
 * its type needs), so the app keeps them as they came and reads the fields
 * it draws, the way the window does.
 */
public enum JSON: Hashable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSON])
  case object([String: JSON])

  public subscript(key: String) -> JSON? {
    if case .object(let fields) = self { return fields[key] }
    return nil
  }

  public subscript(index: Int) -> JSON? {
    if case .array(let items) = self, items.indices.contains(index) { return items[index] }
    return nil
  }

  public var string: String? { if case .string(let value) = self { return value }; return nil }
  public var double: Double? { if case .number(let value) = self { return value }; return nil }
  public var int: Int? { double.flatMap { $0.isFinite ? Int(exactly: $0.rounded()) : nil } }
  public var bool: Bool? { if case .bool(let value) = self { return value }; return nil }
  public var array: [JSON]? { if case .array(let items) = self { return items }; return nil }
  public var object: [String: JSON]? { if case .object(let fields) = self { return fields }; return nil }
  public var isNull: Bool { if case .null = self { return true }; return false }
  /** Itself, or nil for JSON's null (`nil` written in JSON's place is JSON's null, not Swift's). */
  public var present: JSON? {
    if case .null = self { return Optional<JSON>.none }
    return self
  }

  /** A non-empty string, else nil: the shape most optional text fields take. */
  public var text: String? { string.flatMap { $0.isEmpty ? nil : $0 } }

  /** The same object with one field set (or removed, for nil). */
  public func setting(_ key: String, _ value: JSON?) -> JSON {
    guard case .object(var fields) = self else { return self }
    fields[key] = value
    return .object(fields)
  }

  public static func parse(_ data: Data) throws -> JSON {
    #if canImport(Darwin)
    // Foundation's own parser: several times quicker than decoding case by case, and a chat's 500 lines arrive in one reply.
    return JSON(foundation: try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    #else
    return try JSONDecoder().decode(JSON.self, from: data)
    #endif
  }

  #if canImport(Darwin)
  init(foundation value: Any) {
    switch value {
    case let number as NSNumber:
      // A JSON true or false comes as the one boolean NSNumber; every other number is a number.
      self = CFGetTypeID(number) == CFBooleanGetTypeID() ? .bool(number.boolValue) : .number(number.doubleValue)
    case let text as String: self = .string(text)
    case let items as [Any]: self = .array(items.map(JSON.init(foundation:)))
    case let fields as [String: Any]: self = .object(fields.mapValues(JSON.init(foundation:)))
    default: self = .null
    }
  }
  #endif

  public static func parse(_ text: String) throws -> JSON {
    try parse(Data(text.utf8))
  }

  public func data() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }
}

extension JSON: Codable {
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() { self = .null }
    else if let value = try? container.decode(Bool.self) { self = .bool(value) }
    else if let value = try? container.decode(Double.self) { self = .number(value) }
    else if let value = try? container.decode(String.self) { self = .string(value) }
    else if let value = try? container.decode([JSON].self) { self = .array(value) }
    else { self = .object(try container.decode([String: JSON].self)) }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .number(let value):
      // Whole numbers go out as integers: ids, sequence numbers and times in milliseconds.
      if value.rounded() == value, abs(value) < 9.0e15 { try container.encode(Int64(value)) } else { try container.encode(value) }
    case .string(let value): try container.encode(value)
    case .array(let items): try container.encode(items)
    case .object(let fields): try container.encode(fields)
    }
  }
}

extension JSON: ExpressibleByNilLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral, ExpressibleByStringLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral {
  public init(nilLiteral: ()) { self = .null }
  public init(booleanLiteral value: Bool) { self = .bool(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
  public init(floatLiteral value: Double) { self = .number(value) }
  public init(stringLiteral value: String) { self = .string(value) }
  public init(arrayLiteral elements: JSON...) { self = .array(elements) }
  public init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(elements, uniquingKeysWith: { _, last in last })) }
}

extension JSON {
  public init(_ value: String?) { self = value.map(JSON.string) ?? .null }
  public init(_ value: Double) { self = .number(value) }
  public init(_ value: Int) { self = .number(Double(value)) }
  public init(_ values: [String]) { self = .array(values.map(JSON.string)) }
}
